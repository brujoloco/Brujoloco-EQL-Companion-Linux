// sync.ts — settings sync with NO network, by design (0.2.34).
//
// The user said it plainly: "I really dislike this blatant use of online services by
// the app." So the courier is the user. Export encrypts this install's settings
// into ONE self-contained line — EQSYNC1-<key>-<blob>, see syncCrypto.ts — which is
// both the pasteable code and the entire content of the .txt file the Save button
// writes. Import reads it back, previews it, and applies it when the user says so.
// How the line travels — email to yourself, USB stick, your own cloud drive — is the
// user's business, and the app never opens a socket for any of it.
//
// The security story is unchanged from the relay era, minus the relay: AES-256-GCM,
// fresh key and nonce per transfer, AAD bound to this feature. Anyone holding the
// line can import the settings, which is why the notice says "carry it yourself".

import type { DiscordChannel } from '../../shared/discordChannels'
import type { ShareApplyResult, SharePreview } from '../../shared/profiles'
import { SYNC_ERROR, SYNC_PAYLOAD_VERSION, type SyncApplyResult } from '../../shared/settingsSync'
import {
  decryptSyncBlob,
  encryptSyncPayload,
  formatSyncFile,
  mintSyncKey,
  parseSyncFile,
  type SyncPayload
} from './syncCrypto'

/** The renderer's whitelisted localStorage map, which rides into every settings call. */
type UiPrefMap = Record<string, string>

/** Everything this module needs from the impure world. NO fetch — there is no wire. */
export interface SyncDeps {
  /** `exportSettingsString(app.getVersion(), ui)` - the same bundle the Copy button produces */
  exportSettings: (ui: UiPrefMap) => string
  /** `previewShare` - decode + plan, writing nothing */
  previewSettings: (text: string, ui: UiPrefMap) => SharePreview
  /** `applyShare` - the additive merge, with its default selection */
  applySettings: (text: string, ui: UiPrefMap) => ShareApplyResult
  /** the channels this install holds, tokens included (main-side only) */
  listChannels: () => DiscordChannel[]
  /** `addDiscordChannel` - false when the list is full */
  addChannel: (channel: DiscordChannel) => boolean
}

/** What an export is asked to do. */
export interface ExportRequest {
  ui: UiPrefMap
  /** include the connected Discord channels - default OFF, because they are credentials */
  includeDiscord: boolean
}

/** The channels that ride in a payload, added on apply only when the receiver ticks the box. */
function addChannels(channels: DiscordChannel[], deps: SyncDeps): number {
  let added = 0
  for (const channel of channels) {
    if (deps.addChannel(channel)) added++
  }
  return added
}

/**
 * Encrypt this install's settings into the one-line transfer.
 *
 * The returned line is the WHOLE artifact: copy it, save it, mail it to yourself -
 * nothing about it needs this app, or any app, to be online ever again.
 */
export function buildSyncFile(req: ExportRequest, deps: SyncDeps): { ok: true; text: string } | { ok: false; error: string } {
  const settings = deps.exportSettings(req.ui)
  if (settings === '') return { ok: false, error: SYNC_ERROR.emptyExport }
  const channels = req.includeDiscord ? deps.listChannels() : []
  const payload: SyncPayload = {
    v: SYNC_PAYLOAD_VERSION,
    settings,
    ...(channels.length === 0 ? {} : { discordChannels: channels })
  }
  const key = mintSyncKey()
  const blob = encryptSyncPayload(payload, key)
  return { ok: true, text: formatSyncFile(key, blob) }
}

/**
 * Read a transfer - typed, pasted, or file-loaded - and answer the preview WITHOUT
 * writing anything. The payload is returned so main can hold it for the apply, the
 * same single-slot custody the relay era had, minus the round trip.
 */
export function readSyncFile(
  text: unknown,
  ui: UiPrefMap,
  deps: SyncDeps
): { ok: true; preview: SharePreview; discordChannels?: number; payload: SyncPayload } | { ok: false; error: string } {
  const parsed = parseSyncFile(text)
  if (parsed === null) return { ok: false, error: SYNC_ERROR.badFile }
  const payload = decryptSyncBlob(parsed.blob, parsed.key)
  // A TAMPERED BLOB AND A FOREIGN ONE ARE THE SAME EVENT FROM HERE, and saying so is
  // honest: neither of them was written by this app for this feature.
  if (payload === null) return { ok: false, error: SYNC_ERROR.undecryptable }
  const preview = deps.previewSettings(payload.settings, ui)
  if (!preview.ok) return { ok: false, error: SYNC_ERROR.empty }
  return {
    ok: true,
    preview,
    payload,
    ...(payload.discordChannels === undefined ? {} : { discordChannels: payload.discordChannels.length })
  }
}

/**
 * The payload a preview already showed, applied. `applyShare` owns every write it
 * makes; this adds the Discord channels only when the receiver ticked the box, so no
 * path here writes a credential because it arrived.
 */
export function applyReceivedSettings(
  payload: SyncPayload,
  ui: UiPrefMap,
  opts: { includeDiscord: boolean },
  deps: SyncDeps
): SyncApplyResult {
  const res = deps.applySettings(payload.settings, ui)
  if (!res.ok) return { ok: false, error: res.error ?? SYNC_ERROR.empty }
  const channels = opts.includeDiscord ? (payload.discordChannels ?? []) : []
  return {
    ok: true,
    added: res.added,
    skipped: res.skipped,
    rekeyed: res.rekeyed,
    scalarsApplied: res.scalarsApplied,
    ui: res.ui,
    channelsAdded: addChannels(channels, deps)
  }
}
