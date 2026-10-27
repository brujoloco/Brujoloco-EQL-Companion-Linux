// ============================================================================
// shared/phone/views.ts — THE SEVEN CHANNELS, AS PURE FUNCTIONS OF SNAPSHOTS.
// ============================================================================
//
// One builder per channel, each a fold over state the app already publishes. PURE: no clock read of
// its own (the instant is handed in, the way `runTracker.ts` takes one), no DOM, no Node, no
// Electron. That is what lets `tests/phoneViewModels.test.mts` drive every one of them from the
// committed fixture, and it is what phase 2's React Native app will import unchanged.
//
// THESE ARE PROJECTIONS, NOT MODELS. Nothing here decides anything about the world: the fight is
// the engine's segment, the run is `runTracker.ts`'s fold, the timers are `buildTimerRows`'s rows,
// and the character is `buildCharacterShare`'s envelope. What this file does is CUT them down to
// what a phone screen holds and bound every list, because the alternative — shipping the whole
// `SegmentView` over a cellular link four times a second — is a payload nobody reads.

import { buildCharacterShare, type CharacterProfileShare, type CharacterShareInput, type ShareLook } from '../characterShare'
import { runElapsedMs, runKillsPerMin, type RunState } from '../runTracker'
import { buildTimerRows, type BuffTimerRow, type BuffTimersSnap } from '../buffTimers'
import type { BuffsSnap } from '../buffTypes'
import type { CharacterSnap } from '../characterTypes'
import type { CombatSnapshot, SourceView } from '../combat'
import type { RespawnRow, RespawnSnap } from '../respawn'
import { PHONE_LIMITS } from './limits'
import {
  isPhoneEventKind,
  type PhoneBuff,
  type PhoneEvent,
  type PhoneFight,
  type PhoneFightMember,
  type PhoneRespawn,
  type PhoneRun,
  type PhoneStatus
} from './types'

/** Every string on this wire goes through it. A clamped string is still a bounded one. */
function cut(text: string, max: number): string {
  const clean = text.trim()
  return clean.length > max ? clean.slice(0, max) : clean
}

/** A finite number at or above zero, rounded. Every count and total on this wire goes through it. */
function whole(value: number): number {
  return Number.isFinite(value) && value > 0 ? Math.round(value) : 0
}

// ------------------------------------------------------------------------------------- status

export interface PhoneStatusInput {
  who: CharacterSnap | null
  /** the class line, as the combo module or the `/who` row states it; empty when nothing has */
  classes: readonly string[]
  level?: number
  inCombat: boolean
  app: string
  at: number
}

/** `status` — who and where. Absent facts stay absent (law 1); nothing here is defaulted to zero. */
export function phoneStatus(input: PhoneStatusInput): PhoneStatus {
  const ref = input.who?.character ?? null
  const out: PhoneStatus = {
    at: input.at,
    classes: input.classes.slice(0, 8).map((c) => cut(c, 8)),
    inCombat: input.inCombat,
    app: cut(input.app, 24)
  }
  if (ref) {
    out.name = cut(ref.name, PHONE_LIMITS.name)
    out.server = cut(ref.server, PHONE_LIMITS.name)
  }
  if (input.level !== undefined) out.level = input.level
  const zone = input.who?.zone
  if (zone !== undefined && zone !== '') out.zone = cut(zone, PHONE_LIMITS.zone)
  return out
}

// -------------------------------------------------------------------------------------- fight

/** One meter row. `share` is a fraction of the FIGHT, never of the largest row (`fightShare.ts`). */
function fightMember(source: SourceView, total: number): PhoneFightMember {
  const row: PhoneFightMember = {
    name: cut(source.name, PHONE_LIMITS.name) || 'Unknown',
    damage: whole(source.total),
    dps: Math.round(source.dps * 10) / 10,
    share: total > 0 ? Math.round((source.total / total) * 1000) / 1000 : 0
  }
  if (source.kind === 'you') row.you = true
  if (source.kind === 'pet' || source.kind === 'allyPet') row.pet = true
  return row
}

/**
 * `fight` — the current pull, or the last one when none is open.
 *
 * `null` when there is no fight at all, and while the engine is HYDRATING: during the startup
 * replay every snapshot describes the past (AGENTS.md, "Hydration is a state"), and a phone showing
 * an hours-old fight as live would be the one lie this channel can tell.
 */
export function phoneFight(snap: CombatSnapshot | null): PhoneFight | null {
  const fight = snap?.selected
  if (!snap || !fight || snap.hydrating || fight.kind !== 'fight') return null
  const total = whole(fight.outTotal)
  const ranked = [...fight.entities].sort((a, b) => b.total - a.total)
  const members = ranked.slice(0, PHONE_LIMITS.fightMembers).map((s) => fightMember(s, total))
  const out: PhoneFight = {
    mob: cut(fight.name, PHONE_LIMITS.name) || 'A fight',
    live: fight.active,
    durationMs: whole(fight.durationSec * 1000),
    total,
    members
  }
  if (fight.zone !== undefined && fight.zone !== '') out.zone = cut(fight.zone, PHONE_LIMITS.zone)
  // YOUR row is found in the FULL list, not the truncated one - being off the bottom of a raid
  // meter does not stop the tile at the top being about you.
  const mine = ranked.find((s) => s.kind === 'you')
  if (mine) {
    out.you = {
      dps: Math.round(mine.dps * 10) / 10,
      share: total > 0 ? Math.round((mine.total / total) * 1000) / 1000 : 0
    }
  }
  return out
}

// ---------------------------------------------------------------------------------------- run

/** `run` — `RunState` condensed. `null` when the log has named no instance and nobody pressed start. */
export function phoneRun(state: RunState, nowMs: number): PhoneRun | null {
  if (state.startedAt === 0) return null
  const out: PhoneRun = {
    active: state.active,
    zone: cut(state.zone, PHONE_LIMITS.zone),
    base: cut(state.base, PHONE_LIMITS.zone),
    startedAt: state.startedAt,
    elapsedMs: runElapsedMs(state, nowMs),
    kills: state.kills,
    groupKills: state.groupKills,
    killsPerMin: runKillsPerMin(state, nowMs),
    named: state.named
      .slice(-PHONE_LIMITS.runNamed)
      .map((n) => ({ name: cut(n.name, PHONE_LIMITS.name), at: n.at })),
    keys: state.keys
      .slice(0, PHONE_LIMITS.runKeys)
      .map((k) => ({ name: cut(k.name, PHONE_LIMITS.name), count: k.count })),
    chest: { ...state.chest },
    doors: state.doors,
    deaths: state.deaths
  }
  if (state.tier !== undefined) out.tier = state.tier
  return out
}

// ----------------------------------------------------------------------------------- respawns

/** When a row is next up, or undefined when nothing states a duration and the clock counts UP. */
function dueAt(row: RespawnRow): number | undefined {
  return row.estimateMs === undefined ? undefined : row.baseTs + row.estimateMs
}

/**
 * `respawns` — the next timers, soonest first.
 *
 * A row with no stated duration sorts AFTER every row that has one and carries no `dueAt`: the
 * phone draws it counting up, which is the same law the buff overlay keeps (a duration nobody
 * stated is elapsed time, never a guessed countdown).
 */
export function phoneRespawns(snap: RespawnSnap | null, nowMs: number): PhoneRespawn[] {
  if (!snap) return []
  const rows = [...snap.rows].sort((a, b) => {
    const da = dueAt(a)
    const db = dueAt(b)
    if (da === undefined && db === undefined) return b.baseTs - a.baseTs
    if (da === undefined) return 1
    if (db === undefined) return -1
    return da - db
  })
  return rows.slice(0, PHONE_LIMITS.respawns).map((row) => {
    const due = dueAt(row)
    const out: PhoneRespawn = {
      id: row.id,
      mob: cut(row.display || row.key, PHONE_LIMITS.name),
      zone: cut(row.zone, PHONE_LIMITS.zone),
      baseTs: row.baseTs,
      source: row.source,
      open: due !== undefined && nowMs >= due
    }
    if (due !== undefined) out.dueAt = due
    return out
  })
}

// -------------------------------------------------------------------------------------- buffs

/** When a countdown row runs out. Absent on `elapsed` and `permanent` rows, which state nothing. */
function endsAt(row: BuffTimerRow): number | undefined {
  return row.mode === 'countdown' && row.durationMs !== undefined
    ? row.startedTs + row.durationMs
    : undefined
}

/**
 * `buffs` — what is standing on YOU, soonest to run out first.
 *
 * `group === 'self'` is the whole filter: a hold on a mob is a fact about the mob, and the phone's
 * Timers tab is about the person holding it. Rows with a stated duration come first (they are the
 * ones with a deadline), then the ones counting up, then the permanents.
 */
export function phoneBuffs(buffs: BuffsSnap | null, timers: BuffTimersSnap | null): PhoneBuff[] {
  if (!buffs) return []
  const rows = buildTimerRows(buffs, timers ?? { holds: [], ends: [] }).filter(
    (row) => row.group === 'self'
  )
  const ordered = rows.sort((a, b) => {
    const ea = endsAt(a)
    const eb = endsAt(b)
    if (ea !== undefined && eb !== undefined) return ea - eb
    if (ea !== undefined) return -1
    if (eb !== undefined) return 1
    return b.startedTs - a.startedTs
  })
  return ordered.slice(0, PHONE_LIMITS.buffs).map((row) => {
    const out: PhoneBuff = {
      id: row.id,
      name: cut(row.name, PHONE_LIMITS.name),
      kind: row.kind,
      startedTs: row.startedTs,
      mode: row.mode
    }
    const ends = endsAt(row)
    if (ends !== undefined) out.endsAt = ends
    if (row.target !== undefined) out.target = cut(row.target, PHONE_LIMITS.name)
    if (row.count !== undefined) out.count = row.count
    return out
  })
}

// ------------------------------------------------------------------------------------- events

/** What main hands the builder: a celebration card, as `sendToToastOverlay` saw it. */
export interface PhoneEventInput {
  id: string
  kind: string
  title: string
  subtitle?: string
  at: number
}

/**
 * `events` — the rolling celebration list, newest first.
 *
 * THE KIND GATE IS THE WHOLE POINT OF THIS FUNCTION (owner ruling 5). An entry whose kind is not on
 * `PHONE_EVENT_KINDS` is DROPPED, not passed through with an unknown label — so there is no path by
 * which a chat line, a tell, a guild message or another player's words reach a phone, whatever the
 * caller hands in. `tests/phoneViewModels.test.mts` asserts it over input that contains all of them.
 */
export function phoneEvents(raw: readonly PhoneEventInput[]): PhoneEvent[] {
  const out: PhoneEvent[] = []
  for (const entry of [...raw].sort((a, b) => b.at - a.at)) {
    if (out.length >= PHONE_LIMITS.events) break
    if (!isPhoneEventKind(entry.kind)) continue
    const title = cut(entry.title, PHONE_LIMITS.text)
    if (title === '') continue
    const row: PhoneEvent = { id: cut(entry.id, 64), kind: entry.kind, title, at: entry.at }
    const subtitle = entry.subtitle === undefined ? '' : cut(entry.subtitle, PHONE_LIMITS.text)
    if (subtitle !== '') row.subtitle = subtitle
    out.push(row)
  }
  return out
}

// ---------------------------------------------------------------------------------- character

/**
 * THE LOOK THE PHONE DOES NOT DRAW.
 *
 * `ShareLook` is a required field of the v2 envelope because the share CARD draws a doll with it.
 * The phone's Character tab is the gear list and the totals, and it draws no doll — so this is the
 * EMPTY STATEMENT rather than a claim: `race: ''` is "nobody said", and `sex` is a field of the
 * shape that nothing on this wire reads. It is here, named, so that it is a decision somebody can
 * find rather than two characters inside a call.
 */
export const PHONE_UNSTATED_LOOK: ShareLook = { race: '', sex: 'M' }

/**
 * `character` — the `CharacterProfileShare` v2 body, exactly as a share link carries it.
 *
 * The SAME builder the share dialog uses, so the phone and a share page can never describe one
 * character two ways; `null` when there is no inventory dump, which is the phone's "run
 * /outputfile inventory" empty state rather than an error.
 */
export function phoneCharacter(
  input: Omit<CharacterShareInput, 'look'> & { look?: ShareLook }
): CharacterProfileShare | null {
  if (input.cells.length === 0) return null
  return buildCharacterShare({ ...input, look: input.look ?? PHONE_UNSTATED_LOOK })
}
