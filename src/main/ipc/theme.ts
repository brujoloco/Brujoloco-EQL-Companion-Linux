// ipc/theme.ts — the color-theme IPC handlers, main-process side.
//
// Mirrors ./uiScale.ts exactly: register handlers for the get/set channels, validate at the
// handler (the `sounds:getData` rule — renderer input is untrusted), and return what was
// actually stored so a caller renders the answer rather than assuming its request.
//
// THE BROADCAST HALF (theme follows onto the overlays). Each overlay is its OWN renderer
// process with its own bundle copy of the palette module, so the main process's `setPalette`
// cannot reach it — the overlay has to swap its OWN copy. On a set, after `setThemeId` swaps the
// main process's palette + persists the id, this handler fans the new id out to every open
// overlay window over `IPC.onTheme`; the overlay renderer's `applyTheme` does the rest. A
// late-opened overlay self-seeds via `themeGet` on mount, so it never opens on the default.

import { ipcMain } from 'electron'
import { IPC } from '../../shared/ipc'
import { OVERLAY_KINDS } from '../../shared/types'
import { getThemeId, setThemeId } from '../theme'
import { getOverlayWindow } from '../windows'
import { resolvedGraphics } from '../graphics'
import { overlayBackgroundColor } from '../../shared/graphicsPrefs'

/** Push the new theme id to every open overlay so each swaps its own bundle's palette, and
 *  re-paint the opaque overlays' native background in the new colour (transparent windows are
 *  unchanged — element alpha does their translucency). */
function broadcastTheme(id: string): void {
  const opaque = resolvedGraphics().opaqueOverlays.on
  for (const kind of OVERLAY_KINDS) {
    const w = getOverlayWindow(kind)
    if (!w || w.isDestroyed()) continue
    w.webContents.send(IPC.onTheme, id)
    if (opaque) w.setBackgroundColor(overlayBackgroundColor(true))
  }
}

export function registerThemeIpc(): void {
  ipcMain.handle(IPC.themeGet, () => getThemeId())
  ipcMain.handle(IPC.themeSet, (_e, value: unknown) => {
    const id = setThemeId(value)
    broadcastTheme(id)
    return id
  })
}
