// ============================================================================
// phoneViewModels.test.mts — THE SEVEN CHANNELS (src/shared/phone/).
// ============================================================================
//
// These are the modules phase 2's native app will import unchanged, so what is pinned here is the
// CONTRACT rather than the implementation:
//
//   * THE RUN CHANNEL IS THE OWNER'S OWN CRAWL. `tests/fixtures/befallen-run.snapshots.json` is the
//     five module snapshots from the real Befallen 4 (Refined) run `runTracker.test.mts` is built
//     on, so `phoneRun` is asserted against numbers a person counted, not against a toy.
//   * EVERY LIST IS BOUNDED. A raid meter, a long camp and an evening of celebrations are all
//     staged past their caps, because the failure this feature cannot afford is an unbounded
//     payload over a cellular link.
//   * NO CHAT EVER APPEARS IN `events` (ruling 5). The builder is handed tells, says, guild lines,
//     auctions and an unknown kind, alongside the six real ones, and only the six come out. That is
//     the only kind of test that can hold the claim over time.
//   * THE CHANGE HASH IGNORES THE CLOCK. `status.at`, `run.elapsedMs` and `respawns[].open` move on
//     a timer rather than on a fact, and hashing them would make the "an idle app sends nothing"
//     promise false.
//
// PURE THROUGHOUT: no Electron, no engine, no network.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { buildPhoneChannels, contentHash, type PhoneSources } from '../src/shared/phone'
import { PHONE_LIMITS } from '../src/shared/phone/limits'
import {
  PHONE_CHANNELS,
  type PhoneEvent,
  type PhoneFight,
  type PhoneRun,
  type PhoneStatus
} from '../src/shared/phone/types'
import {
  phoneBuffs,
  phoneEvents,
  phoneFight,
  phoneRespawns,
  phoneRun,
  phoneStatus
} from '../src/shared/phone/views'
import { runTracker, type RunState } from '../src/shared/runTracker'
import type { BuffsSnap } from '../src/shared/buffTypes'
import type { CharacterSnap } from '../src/shared/characterTypes'
import type { CombatSnapshot, SegmentView, SourceView } from '../src/shared/combat'
import type { RespawnRow, RespawnSnap } from '../src/shared/respawn'

// ---- the owner's real crawl -------------------------------------------------------------

interface Fixture {
  progression: Parameters<typeof runTracker>[0]['snap']
  kills: Parameters<typeof runTracker>[0]['kills']
  loot: Parameters<typeof runTracker>[0]['loot']
  coin: { rows: Parameters<typeof runTracker>[0]['coin'] }
  deaths: Parameters<typeof runTracker>[0]['deaths']
  lastEventTs: number
}

const fixture = JSON.parse(
  readFileSync(join(import.meta.dirname, 'fixtures', 'befallen-run.snapshots.json'), 'utf8')
) as Fixture

function befallen(): RunState {
  return runTracker({
    snap: fixture.progression,
    kills: fixture.kills,
    loot: fixture.loot,
    coin: fixture.coin.rows,
    deaths: fixture.deaths,
    nowMs: fixture.lastEventTs
  })
}

test('run: the owner\u2019s Befallen crawl, condensed', () => {
  const state = befallen()
  const run = phoneRun(state, fixture.lastEventTs)
  assert.ok(run)
  assert.equal(run.base, 'Befallen')
  assert.equal(run.zone, state.zone)
  assert.equal(run.tier, state.tier)
  assert.equal(run.kills, state.kills)
  assert.equal(run.groupKills, state.groupKills)
  assert.equal(run.doors, state.doors)
  assert.equal(run.deaths, state.deaths)
  assert.deepEqual(run.chest, state.chest)
  assert.ok(run.elapsedMs > 0)
  // Every named kill the fold found, newest last, capped - and the crawl named fourteen.
  assert.ok(state.named.length >= 12, 'the real run named at least twelve')
  assert.equal(run.named.length, PHONE_LIMITS.runNamed)
  assert.equal(run.named.at(-1)?.name, state.named.at(-1)?.name, 'the newest survives the cap')
  assert.ok(run.keys.length <= PHONE_LIMITS.runKeys)
  // `killsPerMin` is a number here because there IS a stretch to divide by - and it is null
  // rather than zero when there is not (runTracker's refusal, carried through).
  assert.equal(typeof run.killsPerMin, 'number')
})

test('run: no run at all is null, never a panel of zeroes', () => {
  const empty: RunState = { ...befallen(), startedAt: 0 }
  assert.equal(phoneRun(empty, Date.now()), null)
})

// ---- status -----------------------------------------------------------------------------

const WHO: CharacterSnap = {
  character: { name: 'Primitive', server: 'freeport', logPath: 'C:/eq/eqlog.txt' },
  zone: 'Befallen 4 (Refined)'
}

test('status: what the top strip says, and what it refuses to invent', () => {
  const status = phoneStatus({
    who: WHO,
    classes: ['WAR', 'CLR', 'SHM'],
    level: 60,
    inCombat: true,
    app: '1.26.0',
    at: 1_700_000_000_000
  })
  assert.deepEqual(status, {
    at: 1_700_000_000_000,
    classes: ['WAR', 'CLR', 'SHM'],
    inCombat: true,
    app: '1.26.0',
    name: 'Primitive',
    server: 'freeport',
    level: 60,
    zone: 'Befallen 4 (Refined)'
  })
  // No character attached: the name, server, level and zone are ABSENT, not empty strings.
  const blank = phoneStatus({ who: null, classes: [], inCombat: false, app: '1.26.0', at: 1 })
  assert.deepEqual(blank, { at: 1, classes: [], inCombat: false, app: '1.26.0' })
})

// ---- fight ------------------------------------------------------------------------------

function source(name: string, total: number, kind: SourceView['kind']): SourceView {
  return {
    id: name,
    name,
    kind,
    total,
    dps: total / 10,
    pct: 100,
    hits: 1,
    crits: 0,
    critPct: 0,
    ambiguousHits: 0,
    ambiguousTotal: 0,
    misses: 0,
    hitPct: 100,
    missBreakdown: {} as SourceView['missBreakdown'],
    resists: 0,
    resistPct: 0,
    skills: [],
    categories: []
  }
}

function segment(entities: SourceView[], active = true): SegmentView {
  let outTotal = 0
  for (const e of entities) outTotal += e.total
  return {
    id: 'e1',
    kind: 'fight',
    name: 'a cracked skeleton',
    zone: 'Befallen',
    durationSec: 12.5,
    active,
    activeSec: 12.5,
    outTotal,
    outDps: outTotal / 12.5,
    activeDps: outTotal / 12.5,
    entities,
    inTotal: 0,
    inDps: 0,
    incoming: [],
    defense: {} as SegmentView['defense'],
    enemyHealTotal: 0,
    incomingHealTotal: 0,
    incomingHealers: [],
    healing: {} as SegmentView['healing'],
    procs: {} as SegmentView['procs']
  }
}

function combat(selected: SegmentView | null, hydrating = false): CombatSnapshot {
  return {
    selectedId: selected?.id ?? '',
    selected,
    segments: [],
    inCombat: selected?.active === true,
    recent: [],
    stance: {} as CombatSnapshot['stance'],
    poison: {} as CombatSnapshot['poison'],
    zoneSessions: [],
    hydrating,
    roster: {} as CombatSnapshot['roster']
  }
}

test('fight: damage-descending, capped, and your row is found in the FULL list', () => {
  const raid: SourceView[] = []
  for (let i = 0; i < 30; i++) raid.push(source(`Ally${String(i)}`, 3000 - i * 100, 'member'))
  // You are 20th by damage — off the bottom of a twelve-row meter, and still the tile at the top.
  raid.push(source('Primitive', 550, 'you'))
  raid.push(source('Gnasher', 400, 'pet'))
  const fight = phoneFight(combat(segment(raid)))
  assert.ok(fight)
  assert.equal(fight.members.length, PHONE_LIMITS.fightMembers)
  assert.equal(fight.members[0].name, 'Ally0', 'damage-descending')
  assert.ok(!fight.members.some((m) => m.you), 'you are genuinely off the visible list here')
  assert.ok(fight.you, 'and your tile is still there')
  assert.ok(fight.you.dps > 0)
  // `share` is a fraction of the FIGHT, so the visible rows add up to less than one.
  let visible = 0
  for (const m of fight.members) visible += m.share
  assert.ok(visible < 1)
  assert.equal(fight.live, true)
})

test('fight: no fight, and a HYDRATING engine, are both null', () => {
  assert.equal(phoneFight(null), null)
  assert.equal(phoneFight(combat(null)), null)
  // During the startup replay every snapshot describes the past; a phone must not draw it live.
  assert.equal(phoneFight(combat(segment([source('Primitive', 10, 'you')]), true)), null)
})

test('fight: a pet is flagged, and a closed fight says so', () => {
  const fight = phoneFight(combat(segment([source('Gnasher', 10, 'allyPet')], false)))
  assert.ok(fight)
  assert.equal(fight.members[0].pet, true)
  assert.equal(fight.live, false)
})

// ---- respawns ---------------------------------------------------------------------------

function respawnRow(key: string, base: number, estimateMs?: number): RespawnRow {
  return {
    id: `befallen::${key}`,
    key,
    display: key,
    zone: 'Befallen',
    baseTs: base,
    basis: 'death',
    source: estimateMs === undefined ? 'none' : 'wiki',
    samples: 1,
    kills: 1,
    ...(estimateMs === undefined ? {} : { estimateMs })
  }
}

test('respawns: soonest first, an unstated duration counts UP and sorts last, capped at twenty', () => {
  const now = 1_700_000_000_000
  const rows: RespawnRow[] = [respawnRow('unknown thing', now - 5000)]
  for (let i = 0; i < 30; i++) rows.push(respawnRow(`mob${String(i)}`, now, (30 - i) * 60_000))
  const snap: RespawnSnap = { v: 4, zone: 'Befallen', rows, recent: [], prefs: { watches: [] } }
  const timers = phoneRespawns(snap, now)
  assert.equal(timers.length, PHONE_LIMITS.respawns)
  assert.equal(timers[0].mob, 'mob29', 'the soonest due is first')
  assert.ok(timers.every((t) => t.dueAt !== undefined), 'the unstated row is past the cap')
  // …and on its own it survives, with no `dueAt` at all.
  const one = phoneRespawns({ ...snap, rows: [rows[0]] }, now)
  assert.equal(one[0].dueAt, undefined)
  assert.equal(one[0].open, false)
  // A window that has passed is OPEN, which is the pill the phone turns pink.
  const past = phoneRespawns({ ...snap, rows: [respawnRow('Ghoul', now - 600_000, 60_000)] }, now)
  assert.equal(past[0].open, true)
  assert.equal(phoneRespawns(null, now).length, 0)
})

// ---- buffs ------------------------------------------------------------------------------

test('buffs: yours only, deadlines first, capped at thirty', () => {
  const now = 1_700_000_000_000
  const active: BuffsSnap['active'] = []
  for (let i = 0; i < 40; i++) {
    active.push({
      spell: `Buff ${String(i)}`,
      cls: 'beneficial',
      target: undefined,
      startedTs: now - i * 1000,
      durationMs: (40 - i) * 60_000,
      durationSource: 'db'
    } as BuffsSnap['active'][number])
  }
  const rows = phoneBuffs({ active, stats: {} }, { holds: [], ends: [] })
  assert.ok(rows.length <= PHONE_LIMITS.buffs)
  // Countdown rows come before elapsed ones, and the earliest deadline is first.
  const ends = rows.map((r) => r.endsAt).filter((e): e is number => e !== undefined)
  assert.deepEqual(ends, [...ends].sort((a, b) => a - b))
  assert.equal(phoneBuffs(null, null).length, 0)
})

// ---- events: the closed list ------------------------------------------------------------

test('events: only celebrations, newest first, capped - and NO CHAT, EVER', () => {
  const now = 1_700_000_000_000
  const offered = [
    { id: 'a', kind: 'bossKill', title: 'Lord Nagafen defeated', at: now - 1000 },
    { id: 'b', kind: 'levelUp', title: 'Welcome to level 60', at: now },
    { id: 'c', kind: 'wishDrop', title: 'Cloak of Flames', at: now - 2000 },
    { id: 'd', kind: 'questItem', title: 'Shrunken Goblin Skull Earring', at: now - 3000 },
    { id: 'e', kind: 'death', title: 'You have been slain', at: now - 4000 },
    { id: 'f', kind: 'skyQuestComplete', title: 'Test of Sacrifice', at: now - 5000 },
    // …and everything that is NOT a celebration, which is the half that matters.
    { id: 'g', kind: 'tell', title: 'Someone tells you, hi', at: now },
    { id: 'h', kind: 'say', title: 'Someone says, train to zone', at: now },
    { id: 'i', kind: 'guild', title: 'Someone tells the guild, raid at 8', at: now },
    { id: 'j', kind: 'auction', title: 'WTS Cloak of Flames', at: now },
    { id: 'k', kind: 'group', title: 'Someone tells the group, pulling', at: now },
    { id: 'l', kind: 'chat', title: 'anything at all', at: now },
    { id: 'm', kind: 'intro', title: 'the overlay intro card', at: now },
    { id: 'n', kind: 'update', title: 'Update ready', at: now }
  ]
  const events = phoneEvents(offered)
  assert.deepEqual(
    events.map((e) => e.id).sort(),
    ['a', 'b', 'c', 'd', 'e', 'f'],
    'exactly the six celebration kinds'
  )
  assert.equal(events[0].id, 'b', 'newest first')
  const words = JSON.stringify(events)
  for (const leak of ['tells you', 'says', 'the guild', 'WTS', 'the group', 'anything at all']) {
    assert.ok(!words.includes(leak), `no chat: ${leak}`)
  }
  // …and the cap holds over an evening of them.
  const many: typeof offered = []
  for (let i = 0; i < 200; i++) many.push({ id: `x${String(i)}`, kind: 'bossKill', title: `Boss ${String(i)}`, at: now - i })
  assert.equal(phoneEvents(many).length, PHONE_LIMITS.events)
  // An entry with no title at all is dropped rather than drawn as a blank row.
  assert.equal(phoneEvents([{ id: 'z', kind: 'bossKill', title: '   ', at: now }]).length, 0)
})

// ---- the bundle and the change hash -----------------------------------------------------

function sources(at: number): PhoneSources {
  return {
    at,
    app: '1.26.0',
    who: WHO,
    classes: ['WAR'],
    level: 60,
    combat: combat(segment([source('Primitive', 900, 'you')])),
    // The crawl, re-opened: a FINISHED run's elapsed time does not move with the clock (that is
    // `runElapsedMs`'s own contract), and the point of the hash test below is a clock that moves.
    run: { ...befallen(), active: true, endedAt: undefined },
    respawn: null,
    buffs: null,
    timers: null,
    events: [],
    character: null
  }
}

test('every channel is built, and `null` is a state rather than an absence', () => {
  const built = buildPhoneChannels(sources(1_700_000_000_000))
  assert.deepEqual(Object.keys(built).sort(), [...PHONE_CHANNELS].sort())
  assert.equal(built.character, null, 'no inventory dump is a state the phone draws')
  assert.ok((built.status as PhoneStatus).name === 'Primitive')
  assert.ok((built.fight as PhoneFight).members.length === 1)
  assert.ok((built.run as PhoneRun).base === 'Befallen')
  assert.deepEqual(built.events as PhoneEvent[], [])
})

test('the change hash ignores the clock, so an idle app sends nothing', () => {
  // AFTER the crawl, so the open run genuinely has elapsed time to move.
  const t0 = fixture.lastEventTs + 60_000
  const a = buildPhoneChannels(sources(t0))
  const b = buildPhoneChannels(sources(t0 + 37_000))
  // `status.at` and `run.elapsedMs` both moved…
  assert.notEqual((a.status as PhoneStatus).at, (b.status as PhoneStatus).at)
  assert.notEqual((a.run as PhoneRun).elapsedMs, (b.run as PhoneRun).elapsedMs)
  // …and neither channel counts as changed.
  assert.equal(contentHash('status', a.status), contentHash('status', b.status))
  assert.equal(contentHash('run', a.run), contentHash('run', b.run))
  // A real change does move it.
  const moved = { ...(a.status as PhoneStatus), zone: 'West Commonlands' }
  assert.notEqual(contentHash('status', a.status), contentHash('status', moved))
  // …and `respawns[].open` flips on a clock, so it is not a change either.
  const now = t0
  const snap: RespawnSnap = {
    v: 4,
    zone: 'Befallen',
    rows: [respawnRow('Ghoul', now - 600_000, 60_000)],
    recent: [],
    prefs: { watches: [] }
  }
  const before = phoneRespawns(snap, now - 700_000)
  const after = phoneRespawns(snap, now)
  assert.notEqual(before[0].open, after[0].open)
  assert.equal(contentHash('respawns', before), contentHash('respawns', after))
})
