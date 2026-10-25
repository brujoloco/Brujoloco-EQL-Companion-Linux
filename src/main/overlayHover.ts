// ============================================================================
// overlayHover.ts — THE ELECTRON HALF OF THE HOOKLESS HOVER SENSOR (JOS-370).
// ============================================================================
//
// `overlayHotZone.ts` is the geometry and `presenceWorker.ts` is the loop; read the first of those
// for what a hot zone IS and why each kind gets the rectangles it gets. This file is the part that
// has to talk to Electron and to the store: which overlays currently want watching, where their
// windows are, and what main does when the worker says the cursor crossed an edge. The same split
// `overlayPointerWatch.ts`/`pointerWatch.ts` and `windows.ts`/`security.ts` already draw.
//
// ================================ WHAT THIS REPLACED ================================
// A locked overlay was `setIgnoreMouseEvents(true, {forward:true})`. On Windows that `forward` is
// a low-level mouse hook (WH_MOUSE_LL) installed in the MAIN process, and a low-level hook is a
// SYNCHRONOUS callback on the mouse's own path: every mouse event on the machine — the ones
// EverQuest reads to turn the camera included — was delivered through our message loop. So a 30 ms
// stall of main was a 30 ms freeze of the user's cursor, systemwide, and past
// `LowLevelHooksTimeout` Windows silently unhooks the offender, after which the hover pin simply
// stopped working until the overlay was re-locked. The hook bought exactly one thing: mouse MOVES
// for the renderer's hover sensor.
//
// It is gone. The question is asked from the other side now — a cursor READ on a thread that is not
// main, against rectangles main handed over — which is the same inversion `pointerWatch.ts` made
// for the task-switcher leave, one cadence faster and in the other direction. A stall of ours is
// now ours alone.
//
// ================================ THE PERFORMANCE CONTRACT ================================
//   1. NO HOOK OF ANY KIND, EVER. `forward:` appears in no `setIgnoreMouseEvents` call in this
//      application (tests/overlayLockedSelector.test.mts pins that as source).
//   2. THE SAMPLER EXISTS ONLY WHILE IT COULD MATTER. Zones are published for a kind only when it
//      is locked, open, on screen and un-parked (`overlayWantsHoverZones`). With none published the
//      worker has no hit-test block in its loop at all and goes back to its coarse ~160 ms clock —
//      i.e. an install with no pinned overlay pays nothing, and neither does a player who alt-tabs
//      away WITH auto-hide on, because that preference parks the overlays and a parked overlay
//      publishes no rectangle. WHICH APP HAS THE FOREGROUND IS NOT A TERM OF ITS OWN (owner ruling
//      2026-08-24 — overlayHotZone.ts states it in full): a pinned overlay left visible over a
//      browser reveals its pin, exactly as the hook it replaced did.
//   3. NOTHING IS RE-SENT THAT DID NOT CHANGE. Zones cross the wire as one line per kind and are
//      compared by string (`presence.ts setHoverZones`); the worker answers only on an ENTER/LEAVE
//      EDGE. Steady state — a pinned meter with the pointer anywhere else on screen — is complete
//      silence in both directions.
//   4. MAIN ONLY EVER OPENS THE DOOR. On an ENTER main calls `setOverlayIgnoreMouse(kind, false)`
//      and tells the window; on a LEAVE it only tells the window, and the RENDERER decides whether
//      the mouse goes back (`useOverlayChrome`'s named reasons — the open selector popup is the
//      case that would otherwise be dropped out from under the user's hand).
//   5. `getBounds()` IS NOT ON A TICK. It is read when something about the overlays changed, which
//      is what `refreshOverlayHover` is called on; the worker holds the rectangle.

import { screen, type BrowserWindow } from 'electron'
import { IPC } from '../shared/ipc'
import { E2E } from './e2e'
import { logError } from './errorLog'
import {
  CHROME_STRIP_PX,
  hotZoneStyle,
  overlayHotZones,
  overlayWantsHoverZones,
  type ZoneRect
} from './overlayHotZone'
import { clearHoverZones, setHoverZones, subscribeHoverTransitions } from './presence'
import { getOverlayConfig } from './store'
import { getOverlayWindow, overlaysParked, setOverlayIgnoreMouse } from './windows'
import { OVERLAY_KINDS, type OverlayKind } from '../shared/types'

/**
 * The EQ_E2E-only door, on `overlayPointerWatch.ts`'s exact terms: a headless run has no real
 * cursor and no on-screen window, so the only way a spec can assert this seam is to read what main
 * published and to drive a transition in. It exists only when the flag is set, is read by nothing
 * in the product, and crosses no IPC.
 */
interface HoverProbe {
  /** The zone set main last published, per kind, in PHYSICAL px. */
  zones: () => Record<string, ZoneRect[]>
  /** Drive one transition as though the worker had reported it. */
  transition: (key: string, inside: boolean) => void
  /** What each kind was last told over `overlay:hover`. */
  pushed: () => Record<string, boolean>
  /** The chrome strip's height, so a spec can MEASURE the real header row against it rather than
   *  restating the number (an e2e file loads no src module). See `CHROME_STRIP_PX`. */
  stripPx: number
}

/**
 * The kinds this file has anything to say about: everyone whose renderer runs a hover sensor. The
 * three strips answer 'none' and are excluded once, here, so neither the publisher nor the
 * ref-count has to remember it — and so a strip can never end up holding a watcher thread open.
 */
const HOVER_KINDS = OVERLAY_KINDS.filter((kind) => hotZoneStyle(kind) !== 'none')

const publishedZones: Record<string, ZoneRect[]> = {}
const pushedInside: Record<string, boolean> = {}

let unsubscribe: (() => void) | null = null

/**
 * Where a window's rectangle is in the PHYSICAL pixels the watcher speaks.
 *
 * THE WIRE IS PHYSICAL AND EVERYTHING ELSE IS DIP — `eqBoundsInDip` states that boundary from the
 * other direction, for rectangles coming IN. This is the same seam outbound: `getBounds()` is DIP,
 * the worker's `GetCursorInfo` answers in physical pixels because this process is per-monitor-DPI
 * aware, and at 100 % on the primary monitor the two are equal (which is why an unconverted version
 * of this would work on most desks and be wrong by a scale factor on a second monitor — the bug
 * JOS-376 already paid for once).
 */
function toPhysical(rect: ZoneRect): ZoneRect {
  try {
    return screen.dipToScreenRect(null, rect)
  } catch {
    // Off Windows, or before `screen` is ready. The watcher does not run there either, so this is
    // an identity rather than a fallback anybody relies on.
    return rect
  }
}

/** The zones this kind currently wants watched, in physical px — empty when it wants none. */
function zonesFor(kind: OverlayKind, w: BrowserWindow | null): ZoneRect[] {
  if (!w || w.isDestroyed()) return []
  const want = overlayWantsHoverZones({
    locked: getOverlayConfig(kind).locked,
    alive: true,
    // A window the replay gate or a session teardown really hid is not on screen; a PARKED one is
    // on screen at opacity 0, which is a different fact and its own term below.
    visible: w.isVisible() && !E2E,
    // …and the park is ALSO where the presence preferences land (presenceEffects.ts `onPresence`),
    // which is the whole of this predicate's relationship with EverQuest since the 2026-08-24
    // ruling. There is no `eqFocused` argument to pass any more, on purpose.
    parked: overlaysParked()
  })
  if (!want) return []
  // The page's own zoom, so a CSS-px strip is a DIP strip — overlayHotZone.ts's `zoom` note.
  return overlayHotZones(kind, w.getBounds(), w.webContents.getZoomFactor()).map(toPhysical)
}

/**
 * Re-derive every kind's zone set and publish what changed.
 *
 * Called on every edge that can move the answer: an overlay's click-through state (which is
 * `windows.ts setOverlayIgnoreMouse`, the ONE place that changes — so the lock toggle, the park,
 * the replay gate and the renderer's own capture flips all arrive here), a window closing, a
 * display reconcile, and every presence change. It is idempotent and most calls publish nothing.
 *
 * PRESENCE STILL CALLS IT AND IT STILL READS NO PRESENCE FACT. A presence change can PARK the
 * overlays (the auto-hide preferences), and the park is a term; the foreground itself is not.
 */
export function refreshOverlayHover(): void {
  try {
    for (const kind of HOVER_KINDS) {
      const zones = zonesFor(kind, getOverlayWindow(kind))
      publishedZones[kind] = zones
      setHoverZones(kind, zones)
    }
  } catch (err) {
    // This runs from `setOverlayIgnoreMouse`, which is on the path of every lock toggle and every
    // capture flip — a window that died between the liveness check and `getBounds()` must not take
    // an overlay's click-through state down with it.
    logError('main:overlayHover', err)
  }
}

/**
 * One reported edge.
 *
 * ENTER OPENS THE DOOR AND SAYS SO; LEAVE ONLY SAYS SO. Main must not take the mouse back itself:
 * the renderer holds a SET of named reasons and more than one can be live at once — the selector's
 * popup is `position: fixed` and reaches below the header strip, so a main-side `ignore(true)` on
 * the way out of the strip would close the list the user is reaching into. Main opens the door; the
 * renderer is the only thing that knows when nothing behind it needs the mouse any more, and its
 * `setIgnoreMouse(true)` comes back through the same one channel it always has.
 */
function onTransition(key: string, inside: boolean): void {
  if (!(OVERLAY_KINDS as string[]).includes(key)) return
  const kind = key as OverlayKind
  const w = getOverlayWindow(kind)
  if (!w || w.isDestroyed()) return
  pushedInside[kind] = inside
  if (inside) setOverlayIgnoreMouse(kind, false)
  w.webContents.send(IPC.onOverlayHover, { kind, inside })
}

const probe: HoverProbe | null = E2E
  ? {
      zones: () => ({ ...publishedZones }),
      transition: (key, inside) => {
        onTransition(key, inside)
      },
      pushed: () => ({ ...pushedInside }),
      stripPx: CHROME_STRIP_PX
    }
  : null

/**
 * Does anything need the presence watcher for the hit test right now? The ref-count's third reason
 * (shared/presencePrefs.ts `presenceNeeded`) — see `presenceEffects.ts` for the wiring.
 *
 * IT ASKS ONLY THE KINDS THAT CAN EVER WANT A RECTANGLE, and that is load-bearing rather than tidy:
 * the three STRIPS ship LOCKED (that is their resting state — a celebration card is click-through
 * until it has something to show) and have no hover sensor at all, so counting them would make
 * "nothing is pinned" false on a default install and hold a watcher thread open for windows that
 * publish nothing.
 */
export function overlayHoverNeeded(): boolean {
  return HOVER_KINDS.some((kind) => {
    const w = getOverlayWindow(kind)
    return w !== null && !w.isDestroyed() && getOverlayConfig(kind).locked
  })
}

/** Start listening for edges. Idempotent; called from the composition root. */
export function initOverlayHover(): void {
  if (unsubscribe) return
  unsubscribe = subscribeHoverTransitions(({ key, inside }) => {
    try {
      onTransition(key, inside)
    } catch (err) {
      // A window that died between the check and the send must not kill the watcher pump.
      logError('main:overlayHover', err)
    }
  })
  if (probe) (globalThis as unknown as Record<string, unknown>).__eqOverlayHover = probe
}

/** Full teardown (app quit, or the last consumer going away). */
export function stopOverlayHover(): void {
  unsubscribe?.()
  unsubscribe = null
  for (const kind of OVERLAY_KINDS) publishedZones[kind] = []
  clearHoverZones()
}

// ---- THE LINUX EDITION'S OWN HOVER SENSOR (0.2.5, 2026-10-25) ---------------------------
//
// WHY THIS EXISTS. The hookless hover sensor's loop is the WORKER's on Windows —
// `GetCursorInfo` against the zones `zonesFor` derives, ~32 times a second — and the
// worker is user32 FFI that cannot load on Linux (`native-unavailable`). So a LOCKED
// overlay on Linux has had no sensor since the port: the renderer's `hovering` waits on
// an `overlay:hover` edge that only `onTransition` sends, which only the worker fed. Pin
// once and the unlock pin could never appear — in 0.1.0 exactly as in every build since,
// because the window is click-through and no DOM event can reach it (JOS-358's note in
// useOverlayChrome.ts states the whole shape).
//
// THE 0.2.2 LESSON, LEARNED (this file's own history, withdrawn same day): that poll
// watched the CHROME STRIP ONLY — the 40 px header band — and a pointer jittering near
// the band's edge flapped enter/leave at its 100 ms cadence, so the pin appeared "after
// hovering several times". THIS poll watches THE WHOLE WINDOW, the way the worker's
// WHOLE_WINDOW_KINDS zones already do: the pointer is over the meter or it is not, and
// there is no strip boundary under the pointer's path to cross and uncross. Over the
// window, the header reveals and STAYS revealed while the pointer is anywhere on it.
//
// DIVISION OF LABOR, UNCHANGED FROM THE WORKER'S: the poll feeds `onTransition` —
// an ENTER opens the door (`setIgnoreMouseEvents(false)` — a Linux click-through window
// DOES receive real mouse events once it stops ignoring them) and pushes the edge; a LEAVE
// only reports, and the RENDERER decides when the mouse goes back (rule 4). The renderer
// is untouched: its `sensor` reason arrives over the same IPC channel as before, and its
// own capture bookkeeping keeps owning `hovering` once it has the mouse.
//
// SAME ZONES, ONE SENSOR, NO RACE: `zonesFor` gates on lock/open/visible/un-parked, so
// an unpinned overlay — whose renderer already receives DOM events — publishes no
// zones from this poll either (its `alive` windows publish `[]` via the same
// `overlayWantsHoverZones` predicate the worker used). No second opinion exists about
// which window has the mouse.

/** The poll period. The worker's 32 ms existed to keep ITS syscall off main's thread;
 *  a reveal has never needed to beat a tenth of a second, and this is two cheap reads. */
export const HOVER_POLL_MS = 100


/**
 * THE WHOLE WINDOW as the one zone, in the physical px the cursor read answers —
 * THE 0.2.2 LESSON APPLIED: not the 40 px chrome strip, whose band edge sat under the
 * pointer's path and flapped enter/leave at the poll's cadence; the window's own rect
 * has no boundary for the pointer to cross on its way to the header.
 */
function wholeWindowPhysicalRect(w: BrowserWindow, point: { x: number; y: number }): boolean {
  let rect: ZoneRect = w.getBounds()
  try {
    rect = screen.dipToScreenRect(null, w.getBounds())
  } catch {
    // A display that will not convert answers in DIP, which at 100 % on the primary
    // monitor IS physical — the same identity `toPhysical` falls back to.
  }
  return (
    point.x >= rect.x &&
    point.x < rect.x + rect.width &&
    point.y >= rect.y &&
    point.y < rect.y + rect.height
  )
}

let hoverPollTimer: NodeJS.Timeout | null = null
const hoverInside: Record<string, boolean> = {}

/**
 * Start the poll. Edges only on change, initialized to the honest OUTSIDE baseline — a
 * boot with the pointer already over a locked panel still gets its ENTER on the first
 * tick, and a boot elsewhere pays one silent tick and then silence.
 */
export function startOverlayHoverPoll(o: {
  enabled: boolean
  intervalMs?: number
  onEdge?: (kind: string, inside: boolean) => void
}): void {
  if (hoverPollTimer !== null) return
  if (!o.enabled) return
  const onEdge = o.onEdge ?? onTransition
  const tick = (): void => {
    let point: { x: number; y: number }
    try {
      point = screen.dipToScreenPoint(screen.getCursorScreenPoint())
    } catch {
      // A display that will not answer a cursor read is one skipped tick.
      return
    }
    for (const kind of HOVER_KINDS) {
      const w = getOverlayWindow(kind)
      if (!w || w.isDestroyed()) continue
      // `zonesFor`'s gate, restated for the whole-window zone: a kind that wants
      // nothing (unlocked, hidden, parked) is not sensed here either.
      const wants = overlayWantsHoverZones({
        locked: getOverlayConfig(kind).locked,
        alive: true,
        visible: w.isVisible() && !E2E,
        parked: overlaysParked()
      })
      const was = hoverInside[kind] ?? false
      const inside = wants && wholeWindowPhysicalRect(w, point)
      if (was === inside) continue
      hoverInside[kind] = inside
      onEdge(kind, inside)
    }
  }
  hoverPollTimer = setInterval(tick, o.intervalMs ?? HOVER_POLL_MS)
  // A hover poll must never be the reason the app stays alive at quit.
  hoverPollTimer.unref?.()
}

/** Stop the poll. Idempotent; on both quit paths beside the worker's own stop. */
export function stopOverlayHoverPoll(): void {
  if (hoverPollTimer !== null) clearInterval(hoverPollTimer)
  hoverPollTimer = null
  for (const kind of HOVER_KINDS) hoverInside[kind] = false
}
