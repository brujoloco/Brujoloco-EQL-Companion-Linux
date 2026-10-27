/**
 * useTheme — the runtime theme switcher's renderer hook.
 *
 * Owns the MUI theme's lifecycle: a `themeVersion` counter that, when bumped, rebuilds the
 * MUI theme from the CURRENT `PALETTE` (which `setPalette` just reassigned) and forces the
 * whole tree to re-render so every `sx={{ color: PALETTE.x }}` reads the new tokens.
 *
 * The shape mirrors uiScale: the seed comes from `usePrefsSeed().themeId`, changes go out
 * through `window.eq.themeSet` (the preload bridge → main IPC → store), and the main handler
 * calls `setPalette` in the MAIN process's copy of the module. The renderer keeps its OWN
 * copy of the palette module (separate bundle), so `applyTheme` here calls `setPalette` in
 * THIS bundle's module too, then bumps the version.
 */
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import { PALETTE, NEON, setPalette } from '../../../shared/palette'
import { DEFAULT_THEME_ID } from '../../../shared/themes'
import { makeTheme } from '../theme/theme'

/** A tiny external store so any component can subscribe to theme-version bumps. */
let version = 0
const listeners = new Set<() => void>()
function emit(): void {
  version++
  for (const fn of listeners) fn()
}
function subscribe(fn: () => void): () => void {
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}
function getSnapshot(): number { return version }
function getServerSnapshot(): number { return 0 }

/**
 * Apply a theme id to THIS bundle's palette + bump the version. Called on mount (to sync the
 * renderer's palette to the persisted choice) and on every picker change. The main process
 * persists the id via IPC; this function is the renderer-side half of the swap.
 */
export function applyTheme(themeId: string): void {
  setPalette(themeId) // reassigned PALETTE + NEON in this bundle
  emit()
}

/** Read the current theme version (forces re-render on bump). */
export function useThemeVersion(): number {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}

/**
 * The theme switcher's hook. Returns the current MUI theme (rebuilt on version bump), the
 * active theme id, and a setter that persists + applies. Mounts the persisted theme on first
 * render so the very first paint is already the user's choice (not a flash of the default).
 */
export function useTheme(): {
  theme: ReturnType<typeof makeTheme>
  themeId: string
  setThemeId: (id: string) => void
} {
  const [themeId, setThemeIdState] = useState<string>(DEFAULT_THEME_ID)
  useThemeVersion() // subscribe: re-render on any applyTheme bump

  // Load the persisted theme id on mount (one invoke, the uiScale pattern), then apply it
  // so the very first paint after hydration is the user's choice.
  useEffect(() => {
    let alive = true
    void window.eq?.themeGet?.().then((id: string) => {
      if (!alive || !id || id === themeId) return
      setThemeIdState(id)
      applyTheme(id)
    }).catch(() => { /* store read best-effort */ })
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only
  }, [])

  const setThemeId = useCallback((id: string) => {
    setThemeIdState(id)
    applyTheme(id)
    void window.eq?.themeSet?.(id).catch(() => { /* store write best-effort */ })
  }, [])

  const theme = makeTheme(PALETTE, NEON)
  return { theme, themeId, setThemeId }
}
