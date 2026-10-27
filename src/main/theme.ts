// theme.ts — the persisted color-theme id, main-process side.
//
// Mirrors ./uiScale.ts: settings-accessor half of the feature, read/written over the one open
// store. Lives here rather than in store.ts for the same 400-line factoring reason. The key is
// additive and optional; an absent one reads as the default ("arcane"), so an upgrade changes
// nobody's theme.
//
// TWO CALLERS, DIFFERENT MOMENTS. The main IPC handler (ipc/theme.ts) reads on get and writes on
// set; on a set it ALSO swaps this process's own PALETTE (setPalette in shared/palette.ts) so
// the main process's window-background paint (windows.ts reads PALETTE.bg) and any main-side
// consumer sees the new tokens on the next paint. The renderer keeps its own bundle's palette
// copy and swaps it via the useTheme hook.

import { settingsStore } from './store'
import { DEFAULT_THEME_ID, THEMES } from '../shared/themes'
import { setPalette } from '../shared/palette'

/** The persisted theme id, validated against the catalog. Never throws, never returns unknown. */
export function getThemeId(): string {
  const raw = settingsStore.get('themeId')
  if (typeof raw === 'string' && THEMES.some((t) => t.id === raw)) return raw
  return DEFAULT_THEME_ID
}

/**
 * Store a theme id; returns what was ACTUALLY stored (validated; an unknown id falls back to the
 * default, never null). Swaps this process's PALETTE in the same call so the main-side consumers
 * (window background, tray) pick up the new tokens.
 */
export function setThemeId(value: unknown): string {
  const next = typeof value === 'string' && THEMES.some((t) => t.id === value) ? value : DEFAULT_THEME_ID
  settingsStore.set('themeId', next)
  setPalette(next)
  return next
}
