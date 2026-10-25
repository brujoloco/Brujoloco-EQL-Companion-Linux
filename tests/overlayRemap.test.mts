// ============================================================================
// overlayRemap.test.mts — 0.2.14: the pin toggle's fresh appearance.
// ============================================================================
//
// WHAT THIS IS ABOUT. The owner's report, twice: a panel pinned over a
// fullscreen game stays under it — 0.2.8's "briefly hides and re-shows every
// open panel" (the Electron re-show) was measured losing, 0.2.13's
// unmap+remap through the same toolkit was measured losing again — while the
// ONE map this machine has always measured landing above the game is a fresh
// CONSTRUCTION map, the boot path the owner's own restart ritual walks:
// pin the panel, quit the app, start it again, and the panel is born pinned
// over the game. 0.2.14 makes the pin toggle walk exactly that path: destroy
// the open panel and re-open it through the Overlay menu's own doors.
//
// WHY THE CONTRACT IS PINNED AS SOURCE. The sequence is two calls on a live
// BrowserWindow (destroy, then re-open) plus one guard, and the whole content
// is WHICH calls, in which order, behind which guard — all of it in
// `windows.ts`/`ipc/windowControls.ts` wiring that no injected door can
// observe without an Electron harness. So the suite reads the source and
// pins the order and the guards the way the repo's other wiring suites do
// (uiScale, enginePackaging): a change that reorders the sequence, drops a
// guard, or routes the pin around the fresh construction fails here.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const src = (rel: string): string => readFileSync(new URL(rel, import.meta.url), 'utf8')

test('the pin commit ends by re-opening the panel — through the fresh construction, never a restack', () => {
  const controls = src('../src/main/ipc/windowControls.ts')
  // The call is INSIDE the lock branch: unlocking a panel positions it on the
  // desktop, where the game cannot occlude it, and pays no window churn.
  assert.match(
    controls,
    /if \(locked\) \{[\s\S]{0,900}remapOverlayPinned\(kind, locked\)/,
    'a PIN must end by re-opening the panel through remapOverlayPinned - the fresh construction is the fix'
  )
  assert.match(
    controls,
    /endMoveIfOpened\(kind\)/,
    'the move-frame teardown still runs before the re-open'
  )
})

test('the fresh appearance is the menu\'s own doors: destroy, then setOverlayOpen(kind, true)', () => {
  const windows = src('../src/main/windows.ts')
  const body = /export function remapOverlayPinned[\s\S]{0,1200}?\n\}/.exec(windows)
  assert.ok(body, 'windows.ts must keep the one remapOverlayPinned door')
  assert.match(
    String(body[0]),
    /w\.destroy\(\)\s*\n\s*setOverlayOpen\(kind, true\)/,
    'the sequence is destroy + re-open through the Overlay menu\'s own door - nothing between, no second writer'
  )
})

test('the guards: unlock recreates nothing, strips and closed kinds and E2E are untouched', () => {
  const windows = src('../src/main/windows.ts')
  const body = /export function remapOverlayPinned[\s\S]{0,1200}?\n\}/.exec(windows)
  assert.ok(body, 'windows.ts must keep the one remapOverlayPinned door')
  assert.match(
    String(body[0]),
    /if \(!locked \|\| !w \|\| w\.isDestroyed\(\)\) return/,
    'a closed kind is a no-op (its next open is born pinned), and so is every unlock'
  )
  assert.match(
    String(body[0]),
    /if \(E2E \|\| isStripKind\(kind\)\) return/,
    'E2E never maps a window, and a strip is 0.2.12\'s exemption - a recreate would drop a live card queue'
  )
})

test('a late "closed" from the destroyed window cannot wipe its successor', () => {
  // The re-open constructs a new window into the same registry slot within one
  // turn of the old one's destroy, so the OLD window's 'closed' handler must be
  // identity-guarded before it nulls the slot or persists open:false - a late
  // fire would otherwise orphan the new window and unpersist its open-state.
  const windows = src('../src/main/windows.ts')
  assert.match(
    windows,
    /on\('closed', \(\) => \{\s*\n\s*\/\/ 0\.2\.14's GUARD[\s\S]{0,400}if \(overlayWindows\[kind\] !== w\) return/,
    'the closed handler must own its slot before tearing it down'
  )
})

test('a fresh open applies its lock BEFORE the first map — born pinned, not pinned after', () => {
  // The boot path the restart ritual walks: construct focusable:!locked from
  // the store, apply the lock, then showInactive. A panel opened while the
  // game owns the screen lands there already pinned.
  const windows = src('../src/main/windows.ts')
  assert.match(
    windows,
    /applyOverlayLocked\(kind, getOverlayConfig\(kind\)\.locked\)\s*\n\s*\/\/ showInactive/,
    'createOverlayWindow must shape the window before it first appears'
  )
})