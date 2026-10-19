// gen-fixtures.mts — the seven channel payloads the mobile presenters are tested against.
//
// Run from the repo root:
//
//   npx tsx mobile/scripts/gen-fixtures.mts
//
// THE PAYLOADS COME OUT OF THE SHARED BUILDERS, not out of imagination. `src/shared/phone/views.ts`
// is what the desktop sends; this script calls the same seven functions with the same kind of
// input, so the mobile presenters are tested against the exact shapes that will arrive on the
// wire. A field that `phoneFight` stops emitting disappears from this file on the next run, and
// the presenter test that reads it goes red.
//
// AND THE RUN CHANNEL IS THE OWNER'S OWN CRAWL: `tests/fixtures/befallen-run.snapshots.json` is
// the five module snapshots from the real Befallen 4 (Refined) run, the same input
// `runTracker.test.mts` and `phoneViewModels.test.mts` are built on. The phone's Run tab is
// therefore asserted against numbers a person counted.
//
// The JSON is COMMITTED for `gen-vectors.mts`'s reason: the mobile suite must run on a machine
// that has `mobile/node_modules` and nothing else.

import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runTracker } from '../../src/shared/runTracker'
import {
  phoneBuffs,
  phoneEvents,
  phoneFight,
  phoneRespawns,
  phoneRun,
  phoneStatus
} from '../../src/shared/phone/views'
import type { CharacterSnap } from '../../src/shared/characterTypes'
import type { CombatSnapshot, SegmentView, SourceView } from '../../src/shared/combat'
import type { BuffsSnap } from '../../src/shared/buffTypes'
import type { RespawnRow, RespawnSnap } from '../../src/shared/respawn'

const here = dirname(fileURLToPath(import.meta.url))
const repo = join(here, '..', '..')
const out = join(here, '..', 'src', 'phone', 'present', 'fixtures.json')

// ---------------------------------------------------------------------- the owner's own crawl

interface Fixture {
  progression: Parameters<typeof runTracker>[0]['snap']
  kills: Parameters<typeof runTracker>[0]['kills']
  loot: Parameters<typeof runTracker>[0]['loot']
  coin: { rows: Parameters<typeof runTracker>[0]['coin'] }
  deaths: Parameters<typeof runTracker>[0]['deaths']
  lastEventTs: number
}

const fixture = JSON.parse(
  readFileSync(join(repo, 'tests', 'fixtures', 'befallen-run.snapshots.json'), 'utf8')
) as Fixture

const NOW = fixture.lastEventTs

const runState = runTracker({
  snap: fixture.progression,
  kills: fixture.kills,
  loot: fixture.loot,
  coin: fixture.coin.rows,
  deaths: fixture.deaths,
  nowMs: NOW
})

// ------------------------------------------------------------------------------ combat shapes

function source(name: string, total: number, kind: SourceView['kind']): SourceView {
  return {
    id: name,
    name,
    kind,
    total,
    dps: total / 41,
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

function segment(entities: SourceView[], active: boolean): SegmentView {
  let outTotal = 0
  for (const e of entities) outTotal += e.total
  return {
    id: 'seg1',
    kind: 'fight',
    name: 'Fright',
    zone: 'Befallen',
    durationSec: 41,
    active,
    activeSec: 41,
    outTotal,
    outDps: outTotal / 41,
    activeDps: outTotal / 41,
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

const WHO: CharacterSnap = {
  character: { name: 'Primitive', server: 'freeport', logPath: 'C:/eq/eqlog.txt' },
  zone: 'Befallen 4 (Refined)'
}

// ------------------------------------------------------------------------------ timer shapes

function respawn(id: string, mob: string, minusMs: number, estimateMs?: number): RespawnRow {
  const row = {
    id,
    key: mob.toLowerCase(),
    display: mob,
    zone: 'Befallen',
    baseTs: NOW - minusMs,
    source: 'wiki',
    deaths: 1
  } as unknown as RespawnRow
  if (estimateMs !== undefined) (row as { estimateMs?: number }).estimateMs = estimateMs
  return row
}

const respawnSnap = {
  rows: [
    respawn('r1', 'Fright', 60_000, 6 * 60_000),
    respawn('r2', 'Terror', 400_000, 6 * 60_000),
    respawn('r3', 'The Priest of Najena', 90_000)
  ],
  rev: 1
} as unknown as RespawnSnap

/**
 * One row of `BuffsSnap.active`, as the buffs module states one. `buildTimerRows` reads it.
 *
 * `self: true` IS LOAD-BEARING and was learned the hard way: `buffRow` routes a buff with no
 * `self` flag to `group: 'target'`, and `phoneBuffs` keeps only `group === 'self'` — so a fixture
 * that omits it produces an EMPTY buff list rather than the rows it looks like it describes.
 * (`tests/phoneViewModels.test.mts`'s own 40-row cap fixture omits it, which makes that cap
 * assertion vacuous — reported to the integrator, fixed there rather than here.)
 */
function active(spell: string, startedMinusMs: number, durationMs?: number): BuffsSnap['active'][number] {
  return {
    spell,
    cls: 'buff',
    self: true,
    target: undefined,
    startedTs: NOW - startedMinusMs,
    durationMs,
    // `timerModeOf` reads `overlayDurationMs`, NOT `durationMs`: the latter is one of the inputs
    // the overlay resolves FROM (wiki, learned, stated), and a row with no resolved overlay
    // duration counts UP. That is the law ("a duration nobody stated is elapsed time"), not a bug.
    overlayDurationMs: durationMs,
    durationSource: durationMs === undefined ? undefined : 'db'
  } as unknown as BuffsSnap['active'][number]
}

const buffsSnap = {
  active: [
    active('Symbol of Transal', 300_000, 3_600_000),
    active('Spirit of Wolf', 120_000, 1_620_000),
    { ...active('Illusion: Halfling', 900_000), permanent: true } as BuffsSnap['active'][number]
  ],
  stats: {}
} as unknown as BuffsSnap

// -------------------------------------------------------------------------------- the seven

const fightPayload = phoneFight(
  combat(
    segment(
      [
        source('Primitive', 9_140, 'you'),
        source('Rhaegarr', 6_220, 'member'),
        source('Gnasher', 2_480, 'pet'),
        source('Melisandre', 1_910, 'member'),
        source('Borin', 640, 'member')
      ],
      true
    )
  )
)

const payloads = {
  status: phoneStatus({ who: WHO, classes: ['CLR', 'PAL'], level: 60, inCombat: true, app: '1.20.1', at: NOW }),
  fight: fightPayload,
  fightClosed: phoneFight(combat(segment([source('Primitive', 400, 'you')], false))),
  fightNone: phoneFight(combat(null)),
  run: phoneRun(runState, NOW),
  runNone: phoneRun({ ...runState, startedAt: 0 }, NOW),
  respawns: phoneRespawns(respawnSnap, NOW),
  buffs: phoneBuffs(buffsSnap, null),
  events: phoneEvents([
    { id: 'e1', kind: 'bossKill', title: 'Boss defeated', subtitle: 'Fright', at: NOW - 30_000 },
    { id: 'e2', kind: 'levelUp', title: 'Level 60', subtitle: 'Cleric', at: NOW - 400_000 },
    { id: 'e3', kind: 'wishDrop', title: 'Wish list drop', subtitle: 'Bone Chips', at: NOW - 900_000 },
    { id: 'e4', kind: 'death', title: 'You have died', at: NOW - 1_200_000 },
    // Ruling 5: chat is not an event, and the builder is what enforces it. It must not appear.
    { id: 'e5', kind: 'tell', title: 'Someone told you something', at: NOW - 10_000 },
    { id: 'e6', kind: 'guild', title: 'A guild line', at: NOW - 11_000 }
  ]),
  character: {
    v: 2,
    capturedAt: NOW,
    name: 'Primitive',
    level: 60,
    classes: ['Cleric', 'Paladin'],
    look: { race: '', sex: 'M' },
    cells: [
      {
        slot: 'primary',
        label: 'Primary',
        item: 'Sword of the Morning +5',
        base: 'Sword of the Morning',
        tier: 5,
        known: true,
        ac: 12,
        hp: 90,
        mana: 45,
        stats: [
          { key: 'STR', label: 'Strength', value: '+15' },
          { key: 'HASTE', label: 'Haste', value: '31%' }
        ],
        effects: [{ kind: 'combat', name: 'Blade of Dawn', detail: 'Combat Effect' }],
        flags: ['MAGIC ITEM', 'LORE ITEM'],
        weapon: { dmg: 41, delay: 26, skill: '1H Slashing' },
        exaltations: ['Keen', 'Sturdy'],
        ornament: 'Sword of Skyfire'
      },
      {
        slot: 'chest',
        label: 'Chest',
        item: 'Breastplate of Woe',
        known: true,
        ac: 96,
        hp: 240,
        endurance: 60,
        stats: [{ key: 'SV FIRE', label: 'Save vs Fire', value: '+22' }],
        exaltations: []
      },
      { slot: 'ear1', label: 'Ear', item: 'A Plain Stud', known: false, exaltations: [] }
    ],
    totals: {
      ac: 447,
      stats: [
        { label: 'Strength', total: 92 },
        { label: 'Stamina', total: 77 },
        { label: 'Hit Points', total: 1840 }
      ],
      saves: [{ label: 'Save vs Fire', total: 58 }],
      unsummed: [{ label: 'Haste', values: ['31%'] }],
      counted: 12,
      unknown: 1
    },
    scores: { tank: 71, dps: 44, heal: 88, solo: 63 }
  }
}

writeFileSync(
  out,
  `${JSON.stringify({ note: 'GENERATED by mobile/scripts/gen-fixtures.mts through src/shared/phone/views.ts. Do not edit.', now: NOW, payloads }, null, 2)}\n`
)
process.stdout.write(`gen-fixtures: wrote ${String(Object.keys(payloads).length)} payloads at now=${String(NOW)}\n`)
