/**
 * THE APP'S COLOUR TOKENS, IN ONE PLACE — runtime-switchable since the theme port.
 *
 * The MUI theme (`renderer/src/theme/theme.ts`) builds FROM these, but the overlay, tray and
 * cursor bundles deliberately run without a ThemeProvider (overlay/main.tsx), the main process
 * paints every window's background before a renderer has loaded (windows.ts / tray.ts), and
 * scripts/gen-icon.mts draws the brand mark. All of them import `PALETTE` from here.
 *
 * LIVE-BINDING REASSIGNMENT. `PALETTE` is `export let` (not `const`) so the theme switcher can
 * swap it at runtime via `setPalette()`. ES module imports are LIVE BINDINGS — every importer
 * that reads `PALETTE.x` at render time sees the new object on its next read, with no rewrite of
 * the 70 consuming files. `NEON` / `NEON_VERTICAL` are likewise `let` and rebuilt on swap.
 * CAVEAT: a consumer that destructures at module top-level (`const { bg } = PALETTE`) captures
 * the value at load and would NOT update — `applyPalette` greps for those and the typecheck pass
 * confirms none remain. The renderer's MUI theme is rebuilt on swap (see theme.ts makeTheme).
 *
 * RELATIVE IMPORTS ONLY. `@shared/*` is a bundler alias that node-run unit tests do not resolve,
 * and several consumers (tierChip.ts, resistColors.ts) are reached from those tests.
 *
 * One file cannot import this: `src/renderer/tray.html` paints `bg` as a literal for its first
 * frame — keep it equal by hand (and the theme switcher does not live-paint the tray).
 *
 * Contrast is MEASURED, not assumed: tests/palette.test.mts computes WCAG ratios for the DEFAULT
 * (Arcane) palette and fails under 4.5. The default is byte-identical to the pre-theme-port
 * palette, so that suite keeps passing unchanged.
 */
import { DEFAULT_PALETTE, themeById, type ThemePalette } from './themes'

/**
 * `PALETTE` — the 12 colour tokens every surface paints from. `let` so `setPalette` can reassign
 * it; importers see the new object through the live binding on their next read.
 */
export let PALETTE: ThemePalette = DEFAULT_PALETTE

/**
 * `FONTS` — the three typefaces (display / mono / body). Unaffected by theme; kept as a const.
 *   display — headings, the nav rail, buttons, tabs, table heads: the geometric retro-wave face.
 *   mono    — the "console readout": big figures (h4), timers, anything a player scans as a number.
 *   body    — prose and dense data rows, unchanged: readability first.
 */
export const FONTS = {
  display: "'Orbitron', 'Segoe UI', Roboto, system-ui, sans-serif",
  mono: "'Share Tech Mono', Consolas, 'Courier New', monospace",
  body: "Inter, 'Segoe UI', Roboto, system-ui, sans-serif"
} as const

/** The signature rule: magenta → accent → cyan. `let` so a palette swap rebuilds it. */
export let NEON = `linear-gradient(90deg, ${PALETTE.magenta}, ${PALETTE.accent}, ${PALETTE.cyan})`
export let NEON_VERTICAL = `linear-gradient(180deg, ${PALETTE.magenta}, ${PALETTE.accent}, ${PALETTE.cyan})`

/** `hex` at `alpha`, as a CSS `rgba()` — for the bundles that have no MUI `alpha()`. */
export function withAlpha(hex: string, alpha: number | string): string {
  const n = parseInt(hex.slice(1, 7), 16)
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${alpha})`
}

/**
 * Swap the active palette by theme id. Rebuilds the derived gradient tokens. Returns the
 * resolved `ThemePalette` (the default if the id is unknown — never null). Callers: the theme
 * IPC handler (main) and the `useTheme` hook (renderer), both of which also bump a version
 * counter to force the MUI theme rebuild and a re-render.
 *
 * This is the ONE mutation point. Do not reassign `PALETTE` directly elsewhere.
 */
export function setPalette(themeId: string): ThemePalette {
  const next = themeById(themeId).palette
  PALETTE = next
  NEON = `linear-gradient(90deg, ${next.magenta}, ${next.accent}, ${next.cyan})`
  NEON_VERTICAL = `linear-gradient(180deg, ${next.magenta}, ${next.accent}, ${next.cyan})`
  return next
}
