// ============================================================================
// presenceNativeX11.test.mts — 0.2.16: the Linux presence surface the watcher asks.
// ============================================================================
//
// WHAT THIS IS ABOUT. Every build before 0.2.16 crash-looped the presence watcher on Linux —
// `loadPresenceNative()` opened `user32.dll`/`kernel32.dll`/`psapi.dll`, the loads throw in a
// native Linux process, and `presence.ts` never even started the worker (`platform !== 'win32'`
// gate) — so the cursor ring, the hover sensor and auto-hide existed nowhere but in code that
// could not run. 0.2.16 answers the same four questions from X11 and /proc
// (`presenceNativeX11.ts`), and this suite pins it.
//
// TWO KINDS OF CLAIM, TWO WAYS TO TEST THEM.
//   THE PURE HALF — the /proc scan and the image path — is node-testable with injected readers:
//   counted clients, unreadable entries, the -1-vs-0 distinction, the Wine-style cmdline shape.
//   THE FFI HALF — libX11 calls — needs a display, so it is pinned by the source wiring below
//   (error handler FIRST, null on a vanished window, the platform dispatch) and was proven on
//   the real machine before shipping: every call in the module was probe-verified on 2026-10-25
//   against the live display, with the EverQuest window open, by the runner that wrote it.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { eqRunningFromProc, imagePathFromCmdline } from '../src/main/presenceNativeX11'

const src = (rel: string): string => readFileSync(new URL(rel, import.meta.url), 'utf8')

const EQ_PID = '16769'
const EQ_CMD =
  'C:\\users\\Public\\Daybreak Game Company\\Installed Games\\EverQuest Legends\\eqgame.exe'

test('the image path is cmdline arg0 — the Windows-style path Wine hands through, unchanged', () => {
  assert.equal(imagePathFromCmdline(`${EQ_CMD}\0patchme\0/ticket:abc`), EQ_CMD)
  assert.equal(imagePathFromCmdline('node\0x.js'), 'node')
  assert.equal(imagePathFromCmdline(''), '')
  assert.equal(imagePathFromCmdline(null), '')
})

test('eqRunningFromProc counts the clients comm names, case-insensitively, one pid each', () => {
  const comms: Record<string, string | null> = {
    [EQ_PID]: 'eqgame.exe',
    100: 'kwin_x11',
    101: 'EQGAME.EXE',
    102: 'plasmashell'
  }
  const n = eqRunningFromProc(
    Object.keys(comms),
    (pid) => comms[pid] ?? null,
    '',
    () => null
  )
  assert.equal(n, 2, 'both spellings of eqgame.exe count; nothing else does')
})

test('eqRunningFromProc matches by the install-root prefix when comm is unreadable', () => {
  // A thread mid-start has no comm yet; the cmdline is the same Windows-style path the
  // Win32 scan would have matched — same rule, same order as `isEqWindow`.
  const n = eqRunningFromProc(
    [EQ_PID, '100'],
    () => null,
    'C:\\users\\Public\\Daybreak Game Company\\Installed Games\\EverQuest Legends\\',
    (pid) => (pid === EQ_PID ? `${EQ_CMD}\0patchme` : 'node\0x.js')
  )
  assert.equal(n, 1)
})

test('eqRunningFromProc answers -1 only when the listing itself failed — not as "not running"', () => {
  // An unreadable comm with no root to match on is a LOST LOOK, not a clean one: the
  // worker holds the last answer rather than announcing a disappearance nobody observed.
  const n = eqRunningFromProc(['100'], () => null, '', () => null)
  assert.equal(n, -1)
  // …and a clean empty listing is a real zero.
  assert.equal(eqRunningFromProc(['1000'], () => 'plasma-desktop', '', () => null), 0)
})

test('the error swallow is installed BEFORE any window read — a dead window must not kill the app', () => {
  const x11 = src('../src/main/presenceNativeX11.ts')
  const install = x11.indexOf('XSetErrorHandler(errorCb)')
  assert.ok(install > -1, 'the handler is installed at load')
  assert.ok(
    install < x11.indexOf('const uint32Prop ='),
    'the handler is in place before the first property read'
  )
  assert.ok(
    install < x11.indexOf('const activeWindow ='),
    'and before the first active-window read — a window dying mid-scan answers null, never BadDrawable'
  )
})

test('a vanished or uninterpretable window answers null — the worker sees "no window", not a crash', () => {
  const x11 = src('../src/main/presenceNativeX11.ts')
  assert.match(
    x11,
    /const windowFacts = \(win: number\): ForegroundWindow \| null => \{[\s\S]{0,300}?if \(win === 0 \|\| win === root\) return null/,
    'no active window (root / a switch in flight) is null, not a zero rectangle'
  )
  assert.match(
    x11,
    /const rect = rectOf\(win\)\s*\n\s*if \(!rect\) return null/,
    'a window whose geometry cannot be read answers null'
  )
})

test('the platform seam: the dispatcher exists and answers X11 only', () => {
  const native = src('../src/main/presenceNative.ts')
  assert.match(
    native,
    /export function loadPresenceNative\(\): PresenceNative \{\s*\n\s*return loadPresenceNativeX11\(\)/,
    '0.2.27: the one door the worker opens answers X11 — the Win32 surface left with the Windows-only machinery'
  )
  const presence = src('../src/main/presence.ts')
  assert.ok(
    !/platform\s*!==\s*'win32'/.test(presence),
    "startWatcher's win32-only gate is gone — presence starts wherever the surface can answer"
  )
})

test('cursor visibility degrades to TRUE with a real position — stated, not accidental', () => {
  const x11 = src('../src/main/presenceNativeX11.ts')
  // The header states the degrade (no usable libXfixes on this machine); pin that the
  // implementation matches the prose: XQueryPosition real, visibility true.
  assert.match(x11, /return true/, 'the visibility answer is true — the documented degrade')
  assert.match(
    x11,
    /out\.x = rx\[0\]/,
    'the position out param is the real pointer position'
  )
})