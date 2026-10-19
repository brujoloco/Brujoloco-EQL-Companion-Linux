// character-types.test.ts — THE MIRROR CANNOT ROT SILENTLY.
//
// `character-types.ts` declares eight interfaces that the desktop also declares, for the reason
// its header gives. A copy with no test is technical debt; a copy with THIS test is a copy that
// fails the build the day the desktop adds a field.
//
// It reads the desktop's own source files and compares FIELD NAMES, interface by interface. It
// does not compare types — that would be a TypeScript compiler, and the value here is catching
// "somebody added `augments` to ShareCell", which a field list catches completely.

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { asProfile } from './character-types'

const SHARED = join(__dirname, '..', '..', '..', 'src', 'shared')

/** The property names of one `export interface X { … }` block, in source order. */
function fieldsOf(source: string, name: string): string[] {
  // The name must END here: `ShareStat` must not find `ShareStatLine`, which is declared first in
  // one of the two files and would have silently compared the wrong pair of interfaces.
  const at = new RegExp(`export interface ${name}(?![A-Za-z0-9_])`).exec(source)
  if (at?.index === undefined) throw new Error(`no interface ${name} in the source`)
  const open = source.indexOf('{', at.index)
  let depth = 0
  let end = open
  for (let i = open; i < source.length; i++) {
    if (source[i] === '{') depth++
    else if (source[i] === '}') {
      depth--
      if (depth === 0) {
        end = i
        break
      }
    }
  }
  const body = source.slice(open + 1, end)
  const out: string[] = []
  for (const match of body.matchAll(/^\s{2}(\w+)\??:/gm)) out.push(match[1]!)
  return out
}

const desktopShare = readFileSync(join(SHARED, 'characterShare.ts'), 'utf8')
const desktopItem = readFileSync(join(SHARED, 'characterShareItem.ts'), 'utf8')
const mirror = readFileSync(join(__dirname, 'character-types.ts'), 'utf8')

describe('the mirrored interfaces still match the desktop', () => {
  const fromShare = ['ShareCell', 'ShareStat', 'ShareUnsummed', 'ShareTotals', 'ShareScores', 'ShareLook', 'CharacterProfileShare']
  const fromItem = ['ShareStatLine', 'ShareEffect', 'ShareWeapon', 'ShareItemFacts']

  test.each(fromShare)('%s', (name) => {
    expect(fieldsOf(mirror, name)).toEqual(fieldsOf(desktopShare, name))
  })

  test.each(fromItem)('%s', (name) => {
    expect(fieldsOf(mirror, name)).toEqual(fieldsOf(desktopItem, name))
  })

  test('the desktop’s body version is still the one this app reads', () => {
    expect(desktopShare).toContain('export const CHARACTER_SHARE_VERSION = 2')
  })
})

describe('asProfile', () => {
  test('it takes a real v2 body through unchanged in every field it draws', () => {
    const body = {
      v: 2,
      capturedAt: 1_757_000_000_000,
      name: 'Primitive',
      level: 60,
      classes: ['Cleric'],
      look: { race: 'Human', sex: 'M' },
      cells: [{ slot: 'chest', label: 'Chest', item: 'X +5', tier: 5, known: true, exaltations: [] }],
      totals: { ac: 447, stats: [{ label: 'STR', total: 92 }], saves: [], unsummed: [], counted: 12, unknown: 1 },
      scores: { tank: 71, dps: 44, heal: 88, solo: 60 }
    }
    const profile = asProfile(body)
    expect(profile).toMatchObject({ v: 2, name: 'Primitive', level: 60, classes: ['Cleric'] })
    expect(profile?.cells).toHaveLength(1)
    expect(profile?.totals.ac).toBe(447)
    expect(profile?.scores).toEqual({ tank: 71, dps: 44, heal: 88, solo: 60 })
  })

  test('a v1 body draws what it has rather than crashing a tab', () => {
    const profile = asProfile({ v: 1, capturedAt: 1, classes: ['Cleric'], cells: [], totals: { ac: 0 } })
    expect(profile).not.toBeNull()
    expect(profile?.totals).toEqual({ ac: 0, stats: [], saves: [], unsummed: [], counted: 0, unknown: 0 })
    expect(profile?.scores).toBeUndefined()
  })

  test('absent facts stay absent — a missing level is not level 0', () => {
    const profile = asProfile({ v: 2, capturedAt: 1, classes: [], cells: [], totals: {} })
    expect(profile).not.toBeNull()
    expect('level' in profile!).toBe(false)
    expect('name' in profile!).toBe(false)
  })

  test('anything that is not a body answers null', () => {
    for (const junk of [null, undefined, 42, 'x', [], {}, { v: '2', cells: [] }, { v: 2 }]) {
      expect(asProfile(junk)).toBeNull()
    }
  })
})
