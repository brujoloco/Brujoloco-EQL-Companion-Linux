import React, { useEffect } from 'react'
import ReactDOM from 'react-dom/client'
import OverlayMeter from './OverlayMeter'
import EventLogOverlay from './EventLogOverlay'
import HealMeter from './HealMeter'
import ToastOverlay from './ToastOverlay'
import AlertBannerOverlay from './AlertBannerOverlay'
import ConCardOverlay from './ConCardOverlay'
import BuffsOverlay from './BuffsOverlay'
import XpOverlay from './XpOverlay'
import RespawnOverlay from './RespawnOverlay'
import FarmOverlay from './FarmOverlay'
import RunOverlay from './RunOverlay'
import { isHealOverlayKind } from '@shared/types'
import { isTimerOverlayKind } from '@shared/buffTimers'
import { installOverlayPointerExit } from './pointerExit'
import { ThemeProvider } from '@mui/material/styles'
import { useTheme, applyTheme } from '../theme/useTheme'

// The overlay renders in its OWN transparent BrowserWindow (Task #52). It is a
// standalone React root, but IT IS NOW WRAPPED in the app's MUI ThemeProvider so the
// theme the user picks in Preferences follows onto every overlay (the overlay follows the
// main theme: theme follows onto overlays). The overlay self-seeds its palette from the
// persisted id on mount (`window.eqOverlay.themeGet`) and re-swaps on every `onTheme`
// broadcast (`applyTheme` bumps the version counter, `useTheme` rebuilds the MUI theme
// and re-renders the whole tree so every `PALETTE.x` read picks up the new tokens). The
// overlay components read `PALETTE.x` live (no module-scope captures) so a swap recolours
// them; the ThemeProvider does the same for the MUI-resolved `sx` palette. There is still
// no ErrorBoundary — the surfaces are tiny and dependency-light.
//
// ONE bundle serves every overlay KIND; which component mounts is decided by the
// `?kind=` query the window was opened with (read + validated by the preload):
//   'events'                          → the event log (alerts / notable loot / quests)
//   'heal-fight' | 'heal-overall'     → the healing meter (Task #59)
//   'toast'                           → the celebration strip (usually renders nothing)
//   'buffs' | 'debuffs'               → the timer bars (JOS-89, split in two by JOS-119): ONE
//                                       component with a `kind` prop, never two copies — the
//                                       buffs window keeps the beneficial rows, the debuffs
//                                       window keeps the debuff + crowd-control rows, and both
//                                       read the same two modules
//   'xp'                              → the progress read (JOS-195): xp/hr, next level (or the AA
//                                       pace at the cap) and motes per hour, over the app-wide
//                                       slice vocabulary with `session` as its own default
//   'alertBanner'                     → the alert banner (JOS-378): one large line per firing of an
//                                       alert marked "Show on screen", where the eyes are. Shares
//                                       the toast's queue (./cardQueue.ts), not its window
//   'conCard'                         → the mob card (JOS-383): one tooltip-shaped card per `/con`
//                                       — level, zone, five resist chips, top drops, respawn.
//                                       Shares the same queue at a cap of one, so the next con
//                                       replaces it
//   'respawn'                         → the respawn clocks (JOS-194): one countdown per watched
//                                       mob that has died, started by the death message and
//                                       numbered from your own kills
//   'farm'                            → the farm meter (roadmap 2 item 8): kills, XP, drops and
//                                       coin per hour since you zoned in, over the current zone
//                                       stay - one line per reading, no configurability
//   'run'                             → the run tracker (2026-09-11): where you are inside a
//                                       dungeon instance - elapsed time, kills and pace, the named
//                                       in the order they went down, the keys, the deaths
//   everything else                   → the damage meter (fight / zone selection lives inside)
const kind = window.eqOverlay?.kind ?? 'fight'

function Surface(): React.JSX.Element {
  if (kind === 'events') return <EventLogOverlay />
  if (kind === 'toast') return <ToastOverlay />
  if (kind === 'alertBanner') return <AlertBannerOverlay />
  if (kind === 'conCard') return <ConCardOverlay />
  if (kind === 'xp') return <XpOverlay />
  if (kind === 'respawn') return <RespawnOverlay />
  if (kind === 'farm') return <FarmOverlay />
  if (kind === 'run') return <RunOverlay />
  if (isTimerOverlayKind(kind)) return <BuffsOverlay kind={kind} />
  if (isHealOverlayKind(kind)) return <HealMeter />
  return <OverlayMeter />
}

// The overlay's themed root: subscribe to the theme-version counter (so a swap re-renders the
// whole tree), seed this bundle's palette from the persisted id on mount, and ride `onTheme`
// for live changes made in the main window. `window.eqOverlay` is the overlay's LEAN bridge
// (preload/overlay.ts); `window.eq` is absent here, so `useTheme`'s own mount effect no-ops and
// the seeding is done here instead.
function ThemedSurface(): React.JSX.Element {
  const { theme } = useTheme() // useThemeVersion() inside — re-renders on applyTheme's bump
  useEffect(() => {
    let alive = true
    const off = window.eqOverlay?.onTheme?.((id: string) => { if (alive) applyTheme(id) })
    void window.eqOverlay?.themeGet?.().then((id: string) => { if (alive && id) applyTheme(id) }).catch(() => { /* store read best-effort */ })
    return () => { alive = false; off?.() }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only: seed + subscribe once
  }, [])
  return <ThemeProvider theme={theme}><Surface /></ThemeProvider>
}

// EVERY KIND GETS THE ORPHAN GUARD (JOS-358). A native tooltip that outlives the pointer sits on
// top of the GAME, and a click-through window has nothing left to un-hover it — so the dismissal
// is installed here, once, for whichever surface mounts below. See overlay/pointerExit.ts for
// which three things count as "the pointer left" on an always-on-top window.
installOverlayPointerExit()

// overlay.html always carries #overlay-root; fail loudly rather than letting
// createRoot throw a container error nobody can trace back.
const container = document.getElementById('overlay-root')
if (!container) throw new Error('overlay: #overlay-root container missing from overlay.html')

ReactDOM.createRoot(container).render(
  <React.StrictMode>
    <ThemedSurface />
  </React.StrictMode>
)
