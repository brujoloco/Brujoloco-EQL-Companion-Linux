// preload/theme.ts — the runtime color-theme switcher, on the app bridge.
//
// Mirrors ./uiScale.ts: its own module, spread into `api` in index.ts, so window.eq.themeGet /
// themeSet are indistinguishable from the methods written out there. The renderer reads the
// persisted theme id on mount and applies it (palette swap + MUI theme rebuild); a change
// writes through here, main persists it and swaps its own palette copy, and the renderer
// swaps its own copy via setPalette + applyTheme (useTheme.ts).

import { ipcRenderer } from 'electron'
import { IPC } from '../shared/ipc'

export const themeBridge = {
  /** The persisted theme id for this install. The default ("arcane") on a fresh store. */
  themeGet: (): Promise<string> => ipcRenderer.invoke(IPC.themeGet),
  /**
   * Choose a theme. Main persists the id and swaps its own process's PALETTE, resolves to the
   * id that was actually stored (validated against the catalog; an unknown id falls back to the
   * default, never null). The renderer applies its own swap on the resolved promise.
   */
  themeSet: (id: string): Promise<string> => ipcRenderer.invoke(IPC.themeSet, id)
}
