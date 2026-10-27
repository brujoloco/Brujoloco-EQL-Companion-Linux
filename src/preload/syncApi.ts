// syncApi.ts — the offline settings-sync bridge (0.2.34). Four verbs, no wire:
// build the transfer line, save it as a file, open one back, read + apply.

import { ipcRenderer } from 'electron'
import { IPC } from '../shared/ipc'
import type { SyncApplyResult, SyncReceiveResult, SyncSendResult } from '../shared/settingsSync'

export const syncApi = {
  buildSettingsTransfer: (ui: Record<string, string>, includeDiscord: boolean): Promise<SyncSendResult> =>
    ipcRenderer.invoke(IPC.syncBuild, { ui, includeDiscord }),
  saveSettingsTransfer: (text: string): Promise<{ ok: true } | { ok: false; error: string }> =>
    ipcRenderer.invoke(IPC.syncSaveFile, text),
  openSettingsTransfer: (): Promise<{ ok: true; text: string } | { ok: false; error: string }> =>
    ipcRenderer.invoke(IPC.syncOpenFile),
  readSettingsTransfer: (text: string, ui: Record<string, string>): Promise<SyncReceiveResult> =>
    ipcRenderer.invoke(IPC.syncRead, text, ui),
  applySettingsTransfer: (ui: Record<string, string>, includeDiscord: boolean): Promise<SyncApplyResult> =>
    ipcRenderer.invoke(IPC.syncApply, { ui, includeDiscord })
}
