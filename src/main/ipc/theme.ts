// ipc/theme.ts — the color-theme IPC handlers, main-process side.
//
// Mirrors ./uiScale.ts exactly: register handlers for the get/set channels, validate at the
// handler (the `sounds:getData` rule — renderer input is untrusted), and return what was
// actually stored so a caller renders the answer rather than assuming its request.

import { ipcMain } from 'electron'
import { IPC } from '../../shared/ipc'
import { getThemeId, setThemeId } from '../theme'

export function registerThemeIpc(): void {
  ipcMain.handle(IPC.themeGet, () => getThemeId())
  ipcMain.handle(IPC.themeSet, (_e, value: unknown) => setThemeId(value))
}
