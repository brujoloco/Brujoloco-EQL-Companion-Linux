// overlayUnlockAll.ts — the "Unlock all overlay windows" menu action (0.2.11).
//
// WHY THIS FILE EXISTS. The owner's 2026-10-25 finding is the load-bearing fact of every overlay
// in this build: a CLICK-THROUGH (pinned) window composites over wine's fullscreen client, and an
// INTERACTIVE (unpinned) one gets occluded by it — regardless of stacking order. So the pin is not
// decoration; it is the property that lands a panel over the game, and a per-panel unlock is the
// way to reposition one. "Unlock all" is the bulk form of that: one click drops click-through on
// every panel at once so the player can rearrange them on the desktop, then re-pin the ones they
// want back over EQ. It does not open anything, and it does not touch the open-state — only `locked`.
//
// (0.2.12) "ALL" MEANS THE PANELS. The owner's ruling: the three strips — the mob card on con, the
// celebration toasts, the alert banner — are exempt. They are pop-ups that appear by themselves,
// anchored where they appear, and the compositing law above is what keeps them readable while the
// game owns the screen: an interactive strip sinks UNDER a fullscreen client at exactly the moment
// it has something to say. They are not windows anyone rearranges on the desktop, so the bulk action
// never writes their `locked` — whatever state a strip's own controls left it in is the state it
// keeps. `OVERLAY_STRIP_KINDS` (overlayLabels.ts) is the one list that already names the trio — the
// same seam the sizes list and the labels draw — so it is subtracted here rather than restated, and
// "all" cannot drift from "the panels" the way a second list would.
//
// WHY THE IO IS INJECTED. The rule that has to be watched END TO END is "every kind goes
// interactive, exactly once, none missed" — and the per-kind WRITE lives behind electron-store and a
// live BrowserWindow. The function below takes the one door it needs rather than importing the main
// process, so the contract is pinned in tests/overlayUnlockAll.test.mts with a recording door
// instead of an Electron harness, and the IPC handler is a thin caller that wires the real door.

import type { OverlayKind } from './types'
import { OVERLAY_KINDS } from './types'
import { OVERLAY_STRIP_KINDS } from './overlayLabels'

/**
 * Drop click-through on every PANEL kind — the strips exempt. Calls `setLocked(kind, false)` once
 * per kind, in `OVERLAY_KINDS` order less `OVERLAY_STRIP_KINDS` — the same list the store, the
 * state map and the windows all address kinds by, so "all" cannot drift from the set of overlays
 * that actually exist, and it never lands on a strip.
 *
 * `false` is the whole contract: this is UNLOCK, never lock. The door is general `(kind, locked)`
 * only so the IPC handler can route it through the one per-kind commit (`commitOverlayLocked`) that
 * persists, applies to the live window, echoes and ends a move — the same door the per-panel pin
 * uses — rather than a second copy of any of those four steps.
 */
const UNLOCK_ALL_KINDS: readonly OverlayKind[] = OVERLAY_KINDS.filter(
  (kind) => !OVERLAY_STRIP_KINDS.includes(kind)
)

export function unlockAllOverlays(setLocked: (kind: OverlayKind, locked: boolean) => void): void {
  for (const kind of UNLOCK_ALL_KINDS) setLocked(kind, false)
}