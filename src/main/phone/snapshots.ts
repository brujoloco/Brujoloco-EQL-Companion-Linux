// ============================================================================
// phone/snapshots.ts — THE ONE IMPURE HALF OF THE CHANNEL SOURCE.
// ============================================================================
//
// `shared/phone/views.ts` folds snapshots into the seven channels and is pure. This file is what
// GETS those snapshots: it asks the engine (`dataServer/serveShim.ts`), reads the inventory dump
// through the Character tab's own builder, and keeps ONE small bundle fresh that `desk.ts` can read
// synchronously on its 250 ms tick.
//
// ── WHY A CACHE, WHEN AGENTS.md's RULING 5 FORBIDS ONE ─────────────────────────────────────────
//
// It forbids caching FOLD RESULTS so the app can avoid asking - a second source of truth, aging on
// its own, that the engine cannot invalidate. This is `serveMirrors.ts`'s construction instead: it
// holds exactly one refresh interval's worth of lag behind an authority that is asked again on a
// fixed beat, it never extends anything's life, and an empty bundle is `null` rather than a guess.
// The reason it exists at all is the same as that file's: the reader cannot wait. `desk.ts` is a
// synchronous scheduler over an injected clock - that is what makes it testable - and an `await`
// inside its tick would make the whole state machine untestable to save one round trip.
//
// ── THREE BEATS, NOT ONE ───────────────────────────────────────────────────────────────────────
//
// Eleven module reads at 4 Hz would be forty-four loopback round trips a second for a phone showing
// numbers that move at human speed. So what is asked, and how often, matches what MOVES:
//
//   FAST (500 ms)   combat, buffs, buffTimers        — the meter and the timers
//   SLOW (2 s)      character, combo, progression, kills, loot, coin, deaths, respawn
//   DUMP (15 s)     the inventory file, through `buildCharacterSheet`
//
// NOTHING RUNS WHILE THE FEATURE IS OFF. `start()` is called when the switch goes on and `stop()`
// when it goes off, so the overwhelming majority of launches create no timer at all.

import { serveCombatSnapshot, serveModuleSnapshot } from '../dataServer/serveShim'
import { buildCharacterSheet } from '../ipc/characterSheet'
import { getActiveCharacter } from '../session'
import { currentLevelRead } from '../../shared/currentLevel'
import { runTracker, NO_RUN, type RunState } from '../../shared/runTracker'
import { buildPhoneChannels, type PhoneSources } from '../../shared/phone'
import { phoneCharacter, type PhoneEventInput } from '../../shared/phone/views'
import type { PhoneChannel } from '../../shared/phone/types'
import type { BuffTimersSnap } from '../../shared/buffTimers'
import type { BuffsSnap } from '../../shared/buffTypes'
import type { CharacterSnap } from '../../shared/characterTypes'
import type { ClassAbbr, ComboSnap } from '../../shared/classCombo'
import type { CoinSnap } from '../../shared/coinTypes'
import type { CombatSnapshot } from '../../shared/combat'
import type { DeathSnap } from '../../shared/deathTypes'
import type { KillsSnap } from '../../shared/kills'
import type { ProgressionSnap } from '../../shared/progressionTypes'
import type { RespawnSnap } from '../../shared/respawn'
import type { LootEvent } from '../../shared/types'

const FAST_MS = 500
const SLOW_MS = 2000
const DUMP_MS = 15_000

/** The empty combat answer the shim wants when the engine cannot serve. Nothing draws it. */
const NO_COMBAT: CombatSnapshot = {
  selectedId: '',
  selected: null,
  segments: [],
  inCombat: false,
  recent: [],
  stance: {},
  poison: {} as CombatSnapshot['poison'],
  zoneSessions: [],
  hydrating: true,
  roster: {} as CombatSnapshot['roster']
}

/** Everything the seven builders read, as this process last saw it. */
interface Bundle {
  who: CharacterSnap | null
  classes: ClassAbbr[]
  level?: number
  combat: CombatSnapshot | null
  progression: ProgressionSnap | null
  kills: KillsSnap | null
  loot: LootEvent[]
  coin: CoinSnap | null
  deaths: DeathSnap | null
  respawn: RespawnSnap | null
  buffs: BuffsSnap | null
  timers: BuffTimersSnap | null
  character: ReturnType<typeof phoneCharacter>
}

const bundle: Bundle = {
  who: null,
  classes: [],
  combat: null,
  progression: null,
  kills: null,
  loot: [],
  coin: null,
  deaths: null,
  respawn: null,
  buffs: null,
  timers: null,
  character: null
}

/** The rolling event list, newest last. Filled by `notePhoneEvent`, bounded by the builder. */
const events: PhoneEventInput[] = []

/** The most events held in memory. The builder caps what travels; this caps what is remembered. */
const MAX_EVENTS = 60

let timers: NodeJS.Timeout[] = []
let appVersion = '0.0.0'
let built: { at: number; channels: Record<PhoneChannel, unknown> } | null = null

/** One module snapshot, or null - the shim's own answer when the engine cannot serve. */
async function moduleState<T>(id: string): Promise<T | null> {
  const snap = await serveModuleSnapshot(id)
  return (snap?.state ?? null) as T | null
}

async function refreshFast(): Promise<void> {
  const [combat, buffs, timersSnap] = await Promise.all([
    serveCombatSnapshot({ maxSegments: 1 }, () => NO_COMBAT),
    moduleState<BuffsSnap>('buffs'),
    moduleState<BuffTimersSnap>('buffTimers')
  ])
  bundle.combat = combat
  bundle.buffs = buffs
  bundle.timers = timersSnap
  built = null
}

/**
 * The class line, from the combo module's open interval.
 *
 * ONLY A RESOLVED SLOT SPEAKS. An ambiguous slot (`candidates.length > 1`) and an UNKNOWN one state
 * nothing, so they contribute nothing rather than a guess — world-model law 1 in the one place this
 * feature could most easily break it, since a class line is the first thing a phone screen shows.
 */
function classesOf(combo: ComboSnap | null): ClassAbbr[] {
  const out: ClassAbbr[] = []
  for (const slot of combo?.current?.slots ?? []) {
    const only = slot.candidates.length === 1 ? slot.candidates[0] : undefined
    if (only !== undefined) out.push(only)
  }
  return out
}

async function refreshSlow(): Promise<void> {
  const [who, combo, progression, kills, loot, coin, deaths, respawn] = await Promise.all([
    moduleState<CharacterSnap>('character'),
    moduleState<ComboSnap>('combo'),
    moduleState<ProgressionSnap>('progression'),
    moduleState<KillsSnap>('kills'),
    moduleState<LootEvent[]>('loot'),
    moduleState<CoinSnap>('coin'),
    moduleState<DeathSnap>('deaths'),
    moduleState<RespawnSnap>('respawn')
  ])
  bundle.who = who
  bundle.classes = classesOf(combo)
  bundle.progression = progression
  bundle.kills = kills
  bundle.loot = Array.isArray(loot) ? loot : []
  bundle.coin = coin
  bundle.deaths = deaths
  bundle.respawn = respawn
  if (who && progression) bundle.level = currentLevelRead(who.level, progression)?.level
  built = null
}

/**
 * The character profile, off the inventory dump — the SAME builder the Character tab uses
 * (`buildCharacterSheet`), so the phone and the app can never describe one character two ways.
 */
function refreshDump(): void {
  const sheet = buildCharacterSheet()
  const ref = getActiveCharacter()
  bundle.character =
    sheet === null
      ? null
      : phoneCharacter({
          cells: sheet.cells,
          totals: sheet.totals,
          classes: bundle.classes,
          capturedAt: Date.now(),
          ...(ref?.name === undefined ? {} : { name: ref.name }),
          ...(bundle.level === undefined ? {} : { level: bundle.level })
        })
  built = null
}

/** The run, folded from the five snapshots `runTracker.ts` reads. `NO_RUN` when any is missing. */
function runState(): RunState {
  const { progression, kills, deaths, coin } = bundle
  if (!progression || !kills || !deaths || !coin) return NO_RUN
  return runTracker({
    snap: progression,
    kills,
    loot: bundle.loot,
    coin: coin.rows,
    deaths,
    nowMs: Date.now()
  })
}

/** ONE CELEBRATION, OFFERED — the single call `src/main/toast.ts sendToToastOverlay` makes. */
export function notePhoneEvent(entry: PhoneEventInput): void {
  events.push(entry)
  if (events.length > MAX_EVENTS) events.splice(0, events.length - MAX_EVENTS)
  built = null
}

/** The seven channels as they stand. Memoized until a refresh invalidates it - see the header. */
export function phoneChannels(): Record<PhoneChannel, unknown> {
  if (built) return built.channels
  const at = Date.now()
  const sources: PhoneSources = {
    at,
    app: appVersion,
    who: bundle.who,
    classes: bundle.classes,
    combat: bundle.combat,
    run: runState(),
    respawn: bundle.respawn,
    buffs: bundle.buffs,
    timers: bundle.timers,
    events,
    character: bundle.character,
    ...(bundle.level === undefined ? {} : { level: bundle.level })
  }
  built = { at, channels: buildPhoneChannels(sources) }
  return built.channels
}

/** Start the three beats. Idempotent; `unref` so a tick can never hold this process open. */
export function startPhoneSnapshots(version: string): void {
  appVersion = version
  if (timers.length) return
  const beat = (fn: () => void | Promise<void>, ms: number): NodeJS.Timeout => {
    const id = setInterval(() => {
      void fn()
    }, ms)
    id.unref?.()
    return id
  }
  void refreshFast()
  void refreshSlow()
  refreshDump()
  timers = [beat(refreshFast, FAST_MS), beat(refreshSlow, SLOW_MS), beat(refreshDump, DUMP_MS)]
}

/** Stop them. A launch that never switched the feature on never armed one. */
export function stopPhoneSnapshots(): void {
  for (const id of timers) clearInterval(id)
  timers = []
  built = null
}
