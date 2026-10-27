// ipc/sync.ts — settings sync with NO network (0.2.34). The whole feature is:
// build a transfer line, carry it by hand, read it back, apply it when asked.
//
// CUSTODY (unchanged from the relay era, minus the relay): the decrypted payload
// never crosses to the renderer. It sits in `pending` between the read and the
// apply, one slot, replaced by the next read - and the apply is the only exit.

import { app, dialog, ipcMain } from 'electron'
import { writeFile, readFile } from 'node:fs/promises'
import { IPC } from '../../shared/ipc'
import { SYNC_ERROR, type SyncApplyResult, type SyncReceiveResult } from '../../shared/settingsSync'
import { applyShare, exportSettingsString, previewShare } from '../share'
import { addDiscordChannel, listDiscordChannels } from '../storeDiscord'
import { pushAppKnowledge } from '../dataServer/definePush'
import { applyReceivedSettings, buildSyncFile, readSyncFile, type SyncDeps } from '../share/sync'
import type { SyncPayload } from '../share/syncCrypto'

/** The real seams. No fetch — there is no wire. */
const deps: SyncDeps = {
  exportSettings: (ui) => exportSettingsString(app.getVersion(), ui),
  previewSettings: (text, ui) => previewShare(text, ui),
  applySettings: (text, ui) => applyShare(text, ui),
  listChannels: () => listDiscordChannels(),
  addChannel: (channel) => addDiscordChannel(channel)
}

/** The transfer this install has read and not yet applied. */
let pending: SyncPayload | null = null

/** A renderer argument that is meant to be the ui pref map. Anything else is an empty one. */
function uiOf(raw: unknown): Record<string, string> {
  return raw && typeof raw === 'object' ? (raw as Record<string, string>) : {}
}

/** …and one that is meant to be a tick box. Absent, or anything but `true`, is OFF. */
function includeDiscordOf(raw: unknown): boolean {
  return raw === true
}

/** The default file name the Save dialog offers: what it is, which version, when. */
function transferFileName(): string {
  const stamp = new Date().toISOString().slice(0, 10)
  return `eql-settings-${app.getVersion()}-${stamp}.txt`
}

export function registerSyncIpc(): void {
  // Export: encrypt this install's settings into the one-line transfer.
  ipcMain.handle(IPC.syncBuild, (_e, req: unknown) => {
    const r = (req ?? {}) as Record<string, unknown>
    return buildSyncFile({ ui: uiOf(r.ui), includeDiscord: includeDiscordOf(r.includeDiscord) }, deps)
  })

  // Export's Save button: a native Save dialog, then the bytes. The renderer never
  // touches a path; it hands over the line, main picks the where.
  ipcMain.handle(IPC.syncSaveFile, async (_e, text: unknown): Promise<{ ok: true } | { ok: false; error: string }> => {
    if (typeof text !== 'string' || text === '') return { ok: false, error: SYNC_ERROR.emptyExport }
    const saveOpts = {
      title: 'Save settings transfer',
      defaultPath: transferFileName(),
      filters: [{ name: 'Settings transfer', extensions: ['txt'] }]
    }
    const win = (await import('../windows')).getMainWindow()
    const picked = win === null ? await dialog.showSaveDialog(saveOpts) : await dialog.showSaveDialog(win, saveOpts)
    if (picked.canceled || picked.filePath === '') return { ok: true }
    try {
      await writeFile(picked.filePath, text, 'utf8')
      return { ok: true }
    } catch {
      return { ok: false, error: 'That file could not be written.' }
    }
  })

  // Import's Open button: a native Open dialog, then the line back to the renderer,
  // which puts it in the paste box so the user sees what was read before importing.
  ipcMain.handle(IPC.syncOpenFile, async (_e): Promise<{ ok: true; text: string } | { ok: false; error: string }> => {
    const openOpts = {
      title: 'Open settings transfer',
      filters: [{ name: 'Settings transfer', extensions: ['txt'] }],
      properties: ['openFile'] as Array<'openFile'>
    }
    const win = (await import('../windows')).getMainWindow()
    const picked = win === null ? await dialog.showOpenDialog(openOpts) : await dialog.showOpenDialog(win, openOpts)
    const path = picked.filePaths[0]
    if (picked.canceled || path === undefined) return { ok: true, text: '' }
    try {
      // Bounded: a transfer line is capped by parseSyncFile; this refuses a whale early.
      const raw = await readFile(path, 'utf8')
      if (raw.length > 1_500_000) return { ok: false, error: SYNC_ERROR.badFile }
      return { ok: true, text: raw }
    } catch {
      return { ok: false, error: 'That file could not be read.' }
    }
  })

  // Import: read the transfer, preview it, hold the payload. Writes nothing.
  ipcMain.handle(IPC.syncRead, (_e, text: unknown, ui: unknown): SyncReceiveResult => {
    const res = readSyncFile(text, uiOf(ui), deps)
    pending = res.ok ? res.payload : null
    return res.ok
      ? { ok: true, preview: res.preview, ...(res.discordChannels === undefined ? {} : { discordChannels: res.discordChannels }) }
      : res
  })

  // Apply: the transfer that was just previewed, applied when the user says so.
  ipcMain.handle(IPC.syncApply, (_e, req: unknown): SyncApplyResult => {
    const r = (req ?? {}) as Record<string, unknown>
    if (pending === null) return { ok: false, error: SYNC_ERROR.badFile }
    const payload = pending
    pending = null
    const res = applyReceivedSettings(payload, uiOf(r.ui), { includeDiscord: includeDiscordOf(r.includeDiscord) }, deps)
    if (res.ok && res.added > 0) pushAppKnowledge('alerts.define')
    return res
  })
}
