// ============================================================================
// overlayBoundsPersist.test.mts — 0.2.15: a dragged panel's place is written down.
// ============================================================================
//
// WHAT THIS IS ABOUT. The store reading on 2026-10-25: every overlay kind carried
// `bounds: null` - including panels the owner had dragged and pinned that same
// session - and the probe (Electron 43 + X11) said why: `moved` fires ZERO times
// on a `setBounds` and on a WM-level move, `move` fires continuously instead.
// Upstream is a Windows app and persisted off `moved`/`resized`, the
// once-at-the-end spellings - so no build before 0.2.15 ever wrote a dragged
// panel's place down on Linux. The live window still moved (the drag itself), so
// nobody noticed until 0.2.14's pin re-open read the empty store and landed the
// panel at its default spot.
//
// WHY THE CONTRACT IS PINNED AS SOURCE. The fix is listener wiring on a live
// BrowserWindow plus a debounce - all of it in `installOverlayBounds`, none of
// it observable without an Electron harness. So this suite pins the wiring the
// way the repo's other source suites do (enginePackaging, overlayRemap): both
// spellings listened to, the X11 spellings debounced to one write per drag, the
// timer torn down on close, and `save` still refusing our own placements so the
// JOS-187 rule (only the USER's rectangle is written down) survives the fix.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const src = (rel: string): string => readFileSync(new URL(rel, import.meta.url), 'utf8')

test('BOTH spellings are listened to - the Windows pair AND the pair X11 emits', () => {
  const body = /export function installOverlayBounds[\s\S]{0,2200}?\n\}/.exec(src('../src/main/overlayBounds.ts'))
  assert.ok(body, 'overlayBounds.ts must keep the one installOverlayBounds door')
  assert.match(String(body[0]), /w\.on\('moved', save\)/, "upstream's once-at-the-end spelling stays wired")
  assert.match(String(body[0]), /w\.on\('resized', save\)/, "upstream's once-at-the-end spelling stays wired")
  assert.match(
    String(body[0]),
    /w\.on\('move', debounced\)/,
    "the spelling X11 emits continuously must be wired, or a drag never persists on Linux"
  )
  assert.match(
    String(body[0]),
    /w\.on\('resize', debounced\)/,
    "the spelling X11 emits must be wired for resizes too"
  )
})

test('the X11 spellings are DEBOUNCED - one drag is one write, not a write per intermediate position', () => {
  const body = /export function installOverlayBounds[\s\S]{0,2200}?\n\}/.exec(src('../src/main/overlayBounds.ts'))
  assert.ok(body)
  assert.match(
    String(body[0]),
    /w\.on\('move', debounced\)/,
    "'move' must route through the debounce - a continuous storm of store writes is the bug this replaces"
  )
  assert.match(String(body[0]), /setTimeout\(\(\) => \{[\s\S]{0,200}save\(\)/, 'the debounce ends in the SAME save door')
  // And the debounce is bounded: a real drag's tail write lands well inside a second,
  // so a pin click that follows a drag is never ahead of the persisted place.
  const ms = /MOVE_PERSIST_DEBOUNCE_MS = (\d+)/.exec(src('../src/main/overlayBounds.ts'))
  assert.ok(ms, 'the debounce period is one named constant')
  assert.ok(Number(ms[1]) <= 500, `250ms-ish, not ${String(ms?.[1])} - a slow tail write would lose the last drag to a pin`)
})

test('the JOS-187 rule survives the fix: save refuses OUR placements, closes tear the timer down', () => {
  const body = /export function installOverlayBounds[\s\S]{0,2200}?\n\}/.exec(src('../src/main/overlayBounds.ts'))
  assert.ok(body)
  assert.match(
    String(body[0]),
    /if \(applied && sameSpot\(applied, b\)\) return/,
    'the app-placement marker still short-circuits the write - only the user\'s rectangle is written down'
  )
  assert.match(
    String(body[0]),
    /w\.on\('closed', \(\) => \{[\s\S]{0,200}clearTimeout\(pending\)/,
    "a panel's last in-flight debounced write must never outlive its window"
  )
})

test('the re-open reads the store: overlayPlacement falls back to default size only when nothing is written down', () => {
  const windows = src('../src/main/windows.ts')
  assert.match(
    windows,
    /const b = overlayAppliedBounds\(kind\)\s*\n\s*if \(!b\) return overlayDefaultSize\(kind\)/,
    'overlayPlacement must read the fitted STORED bounds first - the 0.2.14 pin re-open depends on it'
  )
})