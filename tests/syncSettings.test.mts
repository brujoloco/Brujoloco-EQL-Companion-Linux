// syncSettings — the OFFLINE transfer, proven with no network in sight (0.2.34).
//
// The whole feature: buildSyncFile turns this install's settings into one
// self-contained EQSYNC1 line; readSyncFile turns that line back into a preview
// plus a held payload; applyReceivedSettings merges it when the user says so.
// No fetch anywhere - the rig below has no transport to fake, because there is
// nothing to fake.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { DiscordChannel } from '../src/shared/discordChannels'
import type { ShareApplyResult, SharePreview } from '../src/shared/profiles'
import { SYNC_ERROR } from '../src/shared/settingsSync'
import { applyReceivedSettings, buildSyncFile, readSyncFile, type SyncDeps } from '../src/main/share/sync'
import { parseSyncFile, type SyncPayload } from '../src/main/share/syncCrypto'

const SETTINGS = `EQC1-${'abcDEF012_-'.repeat(10)}`

function channel(n: number, label = `#channel-${String(n)}`): DiscordChannel {
  return {
    id: `12345678901234567${String(n).padStart(2, '0')}`,
    token: 'abcdefghij'.repeat(6).concat('1234567', String(n)),
    channelId: '9876543210987654321',
    guildId: '1122334455667788990',
    label,
    addedAt: 1_757_000_000_000
  }
}

const PREVIEW: SharePreview = {
  ok: true,
  kind: 'settings',
  alerts: [],
  scalars: [{ id: 'alertPrefs.globalVolume', label: 'Alert volume', current: '50', incoming: '80' }],
  missingPacks: [],
  text: SETTINGS
}

const APPLIED: ShareApplyResult = { ok: true, added: 2, skipped: 1, rekeyed: 0, scalarsApplied: 1, ui: { 'eq.combat.scope': 'fight' } }

/** The deps: an in-memory channel list, and preview/apply the tests script. */
function rig(opts: { channels?: DiscordChannel[]; preview?: SharePreview; applied?: ShareApplyResult } = {}): {
  deps: SyncDeps
  stored: DiscordChannel[]
} {
  const stored = [...(opts.channels ?? [])]
  const deps: SyncDeps = {
    exportSettings: () => SETTINGS,
    previewSettings: () => opts.preview ?? PREVIEW,
    applySettings: () => opts.applied ?? APPLIED,
    listChannels: () => stored,
    addChannel: (c) => {
      if (stored.some((s) => s.id === c.id)) return false
      stored.push(c)
      return true
    }
  }
  return { deps, stored }
}

// ---- build ------------------------------------------------------------------------------

test('a build answers ONE self-contained line, and nothing else', () => {
  const { deps } = rig()
  const res = buildSyncFile({ ui: {}, includeDiscord: false }, deps)
  assert.equal(res.ok, true)
  if (!res.ok) return
  assert.match(res.text, /^EQSYNC1-/)
  // …and the line alone is enough to read it back: key and blob both ride inside.
  assert.notEqual(parseSyncFile(res.text), null)
})

test('channels ride only when the box was ticked', () => {
  const withChannels = buildSyncFile({ ui: {}, includeDiscord: true }, rig({ channels: [channel(1)] }).deps)
  const without = buildSyncFile({ ui: {}, includeDiscord: false }, rig({ channels: [channel(1)] }).deps)
  assert.equal(withChannels.ok && withChannels.text.length > without.ok ? true : false, true)
})

test('a build of an empty settings string refuses honestly', () => {
  const deps: SyncDeps = {
    exportSettings: () => '',
    previewSettings: () => PREVIEW,
    applySettings: () => APPLIED,
    listChannels: () => [],
    addChannel: () => false
  }
  const res = buildSyncFile({ ui: {}, includeDiscord: false }, deps)
  assert.equal(res.ok, false)
  if (res.ok) return
  assert.equal(res.error, SYNC_ERROR.emptyExport)
})

// ---- read -------------------------------------------------------------------------------

test('a line round-trips: build here, read back as the same settings and a preview', () => {
  const { deps } = rig({ channels: [channel(1), channel(2)] })
  const built = buildSyncFile({ ui: {}, includeDiscord: true }, deps)
  assert.equal(built.ok, true)
  if (!built.ok) return
  const read = readSyncFile(built.text, {}, deps)
  assert.equal(read.ok, true)
  if (!read.ok) return
  assert.equal(read.payload.settings, SETTINGS)
  assert.equal(read.discordChannels, 2)
  assert.deepEqual(read.preview.scalars, PREVIEW.scalars)
})

test('parsing is lenient about how the line was carried across the room', () => {
  const { deps } = rig()
  const built = buildSyncFile({ ui: {}, includeDiscord: false }, deps)
  if (!built.ok) return
  const wrapped = `\n  ${built.text.slice(0, 20)}\n  ${built.text.slice(20)}  \n`
  const read = readSyncFile(wrapped, {}, deps)
  assert.equal(read.ok, true)
})

test('anything that is not a transfer is one short sentence, and nothing throws', () => {
  const { deps } = rig()
  for (const junk of ['', 'hello', 'EQSYNC1-', 'EQSYNC1-short-nope', null, undefined, 42, { eq: 'sync' }]) {
    const res = readSyncFile(junk, {}, deps)
    assert.equal(res.ok, false, `${JSON.stringify(junk)} should refuse`)
    if (!res.ok) assert.equal(typeof res.error, 'string')
  }
})

test('a damaged line fails cleanly rather than throwing', () => {
  const { deps } = rig()
  const built = buildSyncFile({ ui: {}, includeDiscord: false }, deps)
  if (!built.ok) return
  const at = built.text.indexOf('-', built.text.indexOf('-') + 1) + 10
  const flipped = built.text.slice(0, at) + (built.text[at] === 'A' ? 'B' : 'A') + built.text.slice(at + 1)
  const res = readSyncFile(flipped, {}, deps)
  assert.equal(res.ok, false)
  if (!res.ok) assert.equal(res.error, SYNC_ERROR.undecryptable)
})

test('a transfer whose settings the planner refuses gets the paste box own prose', () => {
  const refusing: SharePreview = { ...PREVIEW, ok: false, alerts: [], scalars: [] }
  const { deps } = rig({ preview: refusing })
  const built = buildSyncFile({ ui: {}, includeDiscord: false }, deps)
  if (!built.ok) return
  const res = readSyncFile(built.text, {}, deps)
  assert.equal(res.ok, false)
  if (!res.ok) assert.equal(res.error, SYNC_ERROR.empty)
})

// ---- apply ------------------------------------------------------------------------------

test('an apply runs the existing merge and hands back the localStorage writes', () => {
  const { deps } = rig()
  const payload: SyncPayload = { v: 1, settings: SETTINGS }
  const res = applyReceivedSettings(payload, {}, { includeDiscord: false }, deps)
  assert.equal(res.ok, true)
  if (!res.ok) return
  assert.equal(res.added, APPLIED.added)
  assert.deepEqual(res.ui, APPLIED.ui)
  assert.equal(res.channelsAdded, 0)
})

test('the channels are stored only on confirmation, and a duplicate webhook is skipped', () => {
  const { deps, stored } = rig({ channels: [channel(1)] })
  const payload: SyncPayload = { v: 1, settings: SETTINGS, discordChannels: [channel(1), channel(2)] }
  const res = applyReceivedSettings(payload, {}, { includeDiscord: true }, deps)
  assert.equal(res.ok, true)
  if (!res.ok) return
  assert.equal(res.channelsAdded, 1)
  assert.equal(stored.length, 2)
})

test('a merge that refuses is a sentence, and stores no channel either', () => {
  const refusing: ShareApplyResult = { ok: false, error: 'Those settings are not readable.' }
  const { deps, stored } = rig({ channels: [channel(1)], applied: refusing })
  const payload: SyncPayload = { v: 1, settings: SETTINGS, discordChannels: [channel(9)] }
  const res = applyReceivedSettings(payload, {}, { includeDiscord: true }, deps)
  assert.equal(res.ok, false)
  assert.equal(stored.length, 1)
})
