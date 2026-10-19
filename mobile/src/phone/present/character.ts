// present/character.ts — the Character tab, as rows: the gear list, one item's facts, the totals.
//
// This is the tab the whole app is named after — "carry your character with you" — so it is also
// the one that must be complete rather than a summary. Every field the v2 body carries is drawn:
// the rank badge, the flags, AC/HP/Mana/Endurance, the stat lines verbatim, the effects, the
// exaltations, the ornament, and a weapon's Damage / Delay / Ratio.
//
// RATIO IS THE ONE DERIVED NUMBER ON THIS SCREEN (`format.ts weaponRatio`), to two decimals,
// absent when either input is. Everything else is stated: a stat line's value travels as the
// STRING the item printed (`+15`, `31%`) and is never re-parsed into a number, which is what lets
// a percentage and an integer share one list without the app having an opinion about either.

import type { CharacterProfileShare, ShareCell } from '../character-types'
import { weaponRatio } from './format'
import type { Stat } from './live'

/** One worn slot in the list. `facts` is what the sheet shows when the row is tapped. */
export interface GearRow {
  key: string
  slot: string
  /** the base name when the item carried a rank, otherwise the name as printed */
  name: string
  /** `+5`, or null when the name carried no rank (ABSENT is not tier 0) */
  rank: string | null
  exaltations: string
  ornament: string | null
  /** false when the committed item DB had no record — the reader is told, never shown nothing */
  known: boolean
  hasFacts: boolean
  cell: ShareCell
}

/** One item's sheet. Four blocks, each of which may be empty and is then not drawn. */
export interface ItemFacts {
  title: string
  rank: string | null
  flags: string[]
  /** AC/HP/Mana/Endurance and, for a weapon, Damage/Delay/Ratio */
  numbers: Stat[]
  stats: Stat[]
  effects: { key: string; name: string; detail: string }[]
  exaltations: string[]
  ornament: string | null
  unknownNote: string | null
}

export interface CharacterView {
  name: string
  detail: string
  gear: GearRow[]
  /** the "Character with gear" block */
  totals: Stat[]
  saves: Stat[]
  unsummed: Stat[]
  coverage: string
  scores: Stat[]
  empty: string | null
}

const EMPTY = 'No character yet. On the PC, type /outputfile inventory in game.'

/**
 * Is there anything to open? A slot with a name and nothing else must not be TAPPABLE — a sheet
 * that opens onto an empty page is worse than a row that does not respond.
 */
function hasFacts(cell: ShareCell): boolean {
  const numbers = [cell.ac, cell.hp, cell.mana, cell.endurance, cell.weapon, cell.ornament]
  const lists = [cell.stats, cell.effects, cell.flags, cell.exaltations]
  return numbers.some((v) => v !== undefined) || lists.some((v) => (v?.length ?? 0) > 0)
}

export function gearRow(cell: ShareCell, index: number): GearRow {
  return {
    key: `${String(index)}:${cell.slot}`,
    slot: cell.label,
    name: cell.base ?? cell.item,
    rank: cell.tier === undefined ? null : `+${String(cell.tier)}`,
    exaltations: cell.exaltations.join(' · '),
    ornament: cell.ornament ?? null,
    known: cell.known,
    hasFacts: hasFacts(cell),
    cell
  }
}

/** The four integers a reader adds up in their head, then the three weapon numbers. */
function itemNumbers(cell: ShareCell): Stat[] {
  const out: Stat[] = []
  const add = (key: string, label: string, value: number | undefined): void => {
    if (value !== undefined) out.push({ key, label, value: String(value) })
  }
  add('ac', 'AC', cell.ac)
  add('hp', 'HP', cell.hp)
  add('mana', 'Mana', cell.mana)
  add('end', 'Endurance', cell.endurance)
  const weapon = cell.weapon
  if (weapon) {
    add('dmg', 'Damage', weapon.dmg)
    add('delay', 'Delay', weapon.delay)
    const ratio = weaponRatio(weapon.dmg, weapon.delay)
    if (ratio !== null) out.push({ key: 'ratio', label: 'Ratio', value: ratio })
    if (weapon.skill !== undefined && weapon.skill !== '') {
      out.push({ key: 'skill', label: 'Skill', value: weapon.skill })
    }
  }
  return out
}

export function itemFacts(cell: ShareCell): ItemFacts {
  return {
    title: cell.base ?? cell.item,
    rank: cell.tier === undefined ? null : `+${String(cell.tier)}`,
    flags: cell.flags ?? [],
    numbers: itemNumbers(cell),
    stats: (cell.stats ?? []).map((line) => ({ key: line.key, label: line.label, value: line.value })),
    effects: (cell.effects ?? []).map((fx, index) => ({
      key: `${String(index)}:${fx.name}`,
      name: fx.name,
      detail: fx.detail ?? fx.kind
    })),
    exaltations: cell.exaltations,
    ornament: cell.ornament ?? null,
    // THE HONEST SENTENCE. `known: false` means the committed DB had no record, so this item's
    // stats are in NO total on this screen. Saying nothing would make the totals look complete.
    unknownNote: cell.known ? null : 'This app has no record of this item, so its stats are in none of the totals below.'
  }
}

export function characterView(profile: CharacterProfileShare | null): CharacterView {
  if (!profile) {
    return { name: '', detail: '', gear: [], totals: [], saves: [], unsummed: [], coverage: '', scores: [], empty: EMPTY }
  }
  const bits: string[] = []
  if (profile.level !== undefined) bits.push(`Level ${String(profile.level)}`)
  if (profile.classes.length > 0) bits.push(profile.classes.join(' / '))
  const t = profile.totals
  const unknown = t.unknown
  return {
    name: profile.name ?? 'A character',
    detail: bits.join(' · '),
    gear: profile.cells.map(gearRow),
    totals: [
      { key: 'ac', label: 'AC', value: String(t.ac) },
      ...t.stats.map((s) => ({ key: s.label, label: s.label, value: String(s.total) }))
    ],
    saves: t.saves.map((s) => ({ key: s.label, label: s.label, value: String(s.total) })),
    unsummed: t.unsummed.map((s) => ({ key: s.label, label: s.label, value: s.values.join(', ') })),
    coverage:
      unknown === 0
        ? `From ${String(t.counted)} worn items.`
        : `From ${String(t.counted)} worn items. ${String(unknown)} more ${unknown === 1 ? 'is' : 'are'} not in this app’s item list, so ${unknown === 1 ? 'its' : 'their'} stats are not counted.`,
    scores: profile.scores
      ? [
          { key: 'tank', label: 'Tank', value: `${String(profile.scores.tank)}%` },
          { key: 'dps', label: 'DPS', value: `${String(profile.scores.dps)}%` },
          { key: 'heal', label: 'Heal', value: `${String(profile.scores.heal)}%` },
          { key: 'solo', label: 'Solo', value: `${String(profile.scores.solo)}%` }
        ]
      : [],
    empty: profile.cells.length === 0 ? EMPTY : null
  }
}
