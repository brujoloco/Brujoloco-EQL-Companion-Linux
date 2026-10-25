// ============================================================================
// overlayUnlockAll.test.mts — "UNLOCK ALL OVERLAY WINDOWS" (0.2.11; strips exempt since 0.2.12).
// ============================================================================
//
// WHAT THIS IS ABOUT. The owner's 2026-10-25 finding is the law every overlay in this build obeys:
// a CLICK-THROUGH (pinned) window composites over wine's fullscreen client, and an INTERACTIVE
// (unpinned) one gets occluded by it — regardless of stacking order. So the pin is the property
// that lands a panel over the game, and "unlock all" is the bulk way to drop that property on every
// PANEL at once so the player can rearrange them on the desktop, then re-pin the ones they want
// back over EQ.
//
// (0.2.12) THE STRIPS STAY OUT OF IT. The owner's ruling: the con card, the celebration toasts and
// the alert banner are pop-ups that appear by themselves, anchored where they appear, and the
// compositing law above is what keeps them readable while the game owns the screen — an interactive
// strip sinks UNDER a fullscreen client at exactly the moment it has something to say. So the bulk
// action never writes their `locked`. The trio is pinned HERE as literals rather than imported from
// `overlayLabels`: the contract is the player's three windows by name, and a rename or a re-grouping
// upstream must fail HERE rather than silently re-scope "all".
//
// WHY THE IO IS INJECTED. The rule that has to be watched END TO END is "every kind goes
// interactive, exactly once, none missed, and the value is always `false`" — and the per-kind WRITE
// lives behind electron-store and a live BrowserWindow. `shared/overlayUnlockAll.ts` takes the one
// door it needs rather than importing the main process, so the contract is pinned HERE with a
// recording door instead of an Electron harness, and the IPC handler is a thin caller that wires the
// real `commitOverlayLocked` door (the same one the per-panel pin walks). See that file for the law.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { unlockAllOverlays } from '../src/shared/overlayUnlockAll'
import { OVERLAY_KINDS, type OverlayKind } from '../src/shared/types'

const src = (rel: string): string => readFileSync(new URL(rel, import.meta.url), 'utf8')

/** The same file with its COMMENTS stripped — so a comment saying "never lock" is not the only
 *  place the `false` contract is stated. */
const code = (rel: string): string =>
  src(rel)
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')

/** The three strip kinds unlock-all leaves untouched — CON, Celebration, Alert — pinned as
 *  literals in `OVERLAY_KINDS` order. */
const STRIP_KINDS: readonly OverlayKind[] = ['toast', 'alertBanner', 'conCard']

/** The panels "all" means: the canonical kind list, strips skipped in place. */
const PANEL_KINDS: readonly OverlayKind[] = OVERLAY_KINDS.filter(
  (kind) => !STRIP_KINDS.includes(kind)
)

/** A recording door: every call is captured as `{ kind, locked }`, in call order. */
function recordingDoor(): {
  door: (kind: OverlayKind, locked: boolean) => void
  calls: { kind: OverlayKind; locked: boolean }[]
} {
  const calls: { kind: OverlayKind; locked: boolean }[] = []
  return {
    door: (kind, locked) => {
      calls.push({ kind, locked })
    },
    calls
  }
}

test('unlockAllOverlays calls the door once per PANEL kind, in OVERLAY_KINDS order', () => {
  const { door, calls } = recordingDoor()
  unlockAllOverlays(door)
  assert.equal(
    calls.length,
    PANEL_KINDS.length,
    'exactly one call per panel kind — none missed, none doubled'
  )
  assert.deepEqual(
    calls.map((c) => c.kind),
    PANEL_KINDS,
    'the order is the canonical kind list with the strips skipped in place — the same list the store, the state map and the windows address kinds by'
  )
})

test('the three strips are never touched — CON, Celebration and Alert keep the state they are in', () => {
  const { door, calls } = recordingDoor()
  unlockAllOverlays(door)
  const touched = calls.map((c) => c.kind)
  for (const kind of STRIP_KINDS) {
    assert.equal(
      touched.includes(kind),
      false,
      `unlock-all wrote ${kind} — a strip's locked state is its own controls' business, never the bulk action's`
    )
  }
})

test('every call locks FALSE — this is UNLOCK, never lock', () => {
  const { door, calls } = recordingDoor()
  unlockAllOverlays(door)
  for (const c of calls) {
    assert.equal(
      c.locked,
      false,
      `unlock-all set ${c.kind} locked=true — the bulk action may only drop click-through, never raise it`
    )
  }
  // The whole call set, as a sanity check that nothing outside the panels was touched.
  assert.deepEqual(
    calls,
    PANEL_KINDS.map((kind) => ({ kind, locked: false })),
    'the exact expected call set: every panel kind, once, false'
  )
})

test('the contract is in the code, not only the comments — the loop body passes `false`', () => {
  // The body is `for (const kind of UNLOCK_ALL_KINDS) setLocked(kind, false)` — the `false` is the
  // contract. If a future change parameterised it (a `locked` arg on `unlockAllOverlays`), the
  // name would lie and the bulk action could lock as well as unlock. Pin the literal here.
  assert.match(
    code('../src/shared/overlayUnlockAll.ts'),
    /setLocked\(kind, false\)/,
    'the loop body hardcodes `false` — unlock-all can never lock'
  )
})