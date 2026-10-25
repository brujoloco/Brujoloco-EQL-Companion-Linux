// ============================================================================
// ringPoint.test.mts — 0.2.19: the ring rides the watcher's LIVE pointer read.
// ============================================================================
//
// WHAT THIS IS ABOUT. The owner's report, after 0.2.18 finally drew the ring: "static to the
// precise location where mouse pointer was when I alt tabbed — it does not move with the
// mouse". The probe measured why, on this machine (Electron 43, X11, 2026-10-25):
// `screen.getCursorScreenPoint()` warped the pointer, the raw XQueryPointer read moved to it,
// and Electron's answer did not move at all — 50 Hz for two seconds, one position. Electron's
// read on X11 is the LAST POINTER EVENT THIS APP SAW, not a query — and the ring's window is
// click-through, so while the game owns the screen the app sees no pointer events and the halo
// froze exactly where focus changed hands.
//
// THE FIX rides the one live query the app already makes: the watcher thread's per-tick
// `cursorShowing(point)` — Win32 `GetCursorInfo`, X11 `XQueryPointer` — which the hover hit
// test has consumed as physical pixels since JOS-370. The worker now says `P|x|y` on change,
// presence routes it to the ring's stream exactly the way hover transitions route, and the
// stream prefers the worker's point over Electron's event cache.
//
// WHAT IS TESTABLE HERE: the `P` line's decode (pure), and the wiring — the worker emits the
// block on the same tick as its cursor read, presence routes the record, the stream prefers
// the worker point, and the !needed teardown drops the subscription. The live X11/Win32 reads
// were probe-verified on the machine.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { parsePresenceLine } from '../src/main/presenceProtocol'

const src = (rel: string): string => readFileSync(new URL(rel, import.meta.url), 'utf8')

test('P|x|y decodes as a physical point record', () => {
  assert.deepEqual(parsePresenceLine('P|2002|303'), { t: 'point', point: { x: 2002, y: 303 } })
  assert.deepEqual(parsePresenceLine('P|-4|0'), { t: 'point', point: { x: -4, y: 0 } })
})

test('a malformed P line is not a point — finite integers only, or nothing', () => {
  assert.equal(parsePresenceLine('P|'), null)
  assert.equal(parsePresenceLine('P|12'), null)
  assert.equal(parsePresenceLine('P|a|b'), null)
  assert.equal(parsePresenceLine('P|1.5|2'), null)
  assert.equal(parsePresenceLine('P|NaN|2'), null)
  assert.equal(parsePresenceLine('P|Infinity|2'), null)
})

test('the worker says P on the cursor tick, change-driven, NaN is silence', () => {
  const worker = src('../src/main/presenceWorker.ts')
  assert.match(
    worker,
    /if \(watchCursor\) cursorBlock\(showing\)\s*\n\s*if \(watchCursor\) pointBlock\(hover\.point\)/,
    'the point rides the same tick as the cursor read — a second cursor syscall is the thing the fast-tick design exists to prevent'
  )
  assert.match(
    worker,
    /if \(!Number\.isFinite\(pt\.x\) \|\| !Number\.isFinite\(pt\.y\)\) return/,
    'a cursor nobody can read is not a cursor that moved - the same value pointerWatch states'
  )
  assert.match(
    worker,
    /if \(pt\.x === lastPtX && pt\.y === lastPtY\) return/,
    'a still mouse costs nothing: one line per changed position, never per tick'
  )
})

test('presence routes the point to the ring the same way it routes hover', () => {
  const presence = src('../src/main/presence.ts')
  assert.match(
    presence,
    /if \(rec\.t === 'point'\) \{\s*\n\s*emitRingPoint\(rec\.point\)\s*\n\s*return\s*\n\s*\}/,
    'the point record goes straight to its consumer - it is not a fact of the PresenceState snapshot'
  )
  assert.match(presence, /export function subscribeRingPoint/, 'the fanout is the hover listeners shape')
})

test('the stream prefers the watcher point; Electron is the pre-first-P fallback only', () => {
  const effects = src('../src/main/presenceEffects.ts')
  assert.match(
    effects,
    /const p = lastWorkerPoint \?\? screen\.getCursorScreenPoint\(\)/,
    'the live worker read is the primary source; the X11 event cache is what it fell back from'
  )
  assert.match(
    effects,
    /unsubRingPoint = subscribeRingPoint\(\(p\) => \{\s*\n\s*lastWorkerPoint = dipPoint\(p\)\s*\n\s*\}\)/,
    'the point is converted once on arrival, at the watcher rate, not per sample'
  )
  assert.match(
    effects,
    /try \{\s*\n\s*return screen\.screenToDipPoint\(p\)\s*\n\s*\} catch \{\s*\n\s*return p\s*\n\s*\}/,
    'physical to DIP is guarded - screenToDipPoint is another API Electron 43 does not ship on Linux'
  )
  assert.match(
    effects,
    /unsubRingPoint\?\.\(\)\s*\n\s*unsubRingPoint = null\s*\n\s*lastWorkerPoint = null/,
    'the !needed teardown drops the point subscription with the presence one'
  )
})
