// mobLootLinks.test.mts — a mob page's loot written as `[[Item]]` LINKS, not `{{:Item}}`
// transclusions.
//
// The wiki increasingly writes `|known_loot` as plain links (2026-10-18 cache: 317 mob pages
// link-only, 548 mixing both forms), and `parseMobLoot` used to read transclusions alone, so a
// page rewritten to links lost every drop (Tae Ew Archon, rev 2026-09-04). A loot field also links
// group pages ("Fine Steel Weapons"), zones and spells, so a link counts ONLY when its target is a
// page in the committed item corpus. Every wikitext below is VERBATIM from that cache.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseMobLoot, parseMobWikitext } from '../src/main/mobLookupParse'
import { corpusItemTest, type ItemDbFile } from '../src/main/itemsDb'
import itemsRaw from '../src/main/data/items.json' with { type: 'json' }
import mobsRaw from '../src/renderer/src/data/eqlegends/mobs.json' with { type: 'json' }
import type { MobEntry } from '../src/shared/types'

const isItem = corpusItemTest((itemsRaw as unknown as ItemDbFile).items)
const MOBS = (mobsRaw as unknown as { mobs: MobEntry[] }).mobs

// Tae Ew Archon (Temple of Cazic-Thule), page 41606, `|known_loot` verbatim.
const ARCHON_LOOT = `<ul style="column-count: 1;">
<li>[[Rubicite Vambraces]] <span class="drare">(Rare)</span><br><span style="white-space: nowrap;">(Confirmed 9/4/2026)</span></li>
<li>[[Ravenscale Armguards]] <span class="drare">(Rare)</span><br><span style="white-space: nowrap;">(Confirmed 9/4/2026)</span></li>
<li>Various [[Fine Steel Weapons]] <span class="drare">(Common)</span></li>
<li>[[Lizardscale Belt]] <span class="drare">(Common)</span></li>
<li>[[Lizard Meat]] <span class="drare">(Uncommon)</span></li>
</ul>

</li></ul>`

test('the link form is read: Tae Ew Archon states four item drops with their rarities', () => {
  assert.deepEqual(parseMobLoot(ARCHON_LOOT, { isItem }), [
    { item: 'Rubicite Vambraces', rarity: 'Rare' },
    { item: 'Ravenscale Armguards', rarity: 'Rare' },
    { item: 'Lizardscale Belt', rarity: 'Common' },
    { item: 'Lizard Meat', rarity: 'Uncommon' }
  ])
})

test('a non-item link in the loot section is ignored, never guessed into a drop', () => {
  // "Fine Steel Weapons" (a group page) is in the Archon list above and must not appear.
  assert.ok(!isItem('Fine Steel Weapons'), 'the corpus grew a "Fine Steel Weapons" item page')
  const drops = parseMobLoot(ARCHON_LOOT, { isItem }).map((d) => d.item)
  assert.ok(!drops.includes('Fine Steel Weapons'))
  // A zone link and a spell link (verbatim shapes from the cache) read as nothing.
  assert.deepEqual(parseMobLoot('* Found in [[Lower Guk]]\n</li><li> [[Cripple|Spell: Cripple]]         <span class=\'drare\'>(Rare)</span>', { isItem }), [])
})

test('the corpus test is by PAGE title: an `|itemname` alias is not a page a link can reach', () => {
  // `quiver of marr` keys the record whose PAGE is "Quiver of Marr (Item)"; the loot link on
  // "A bottomless feaster" points at the SPELL page. Matching item keys read it as the quiver.
  assert.ok(!isItem('Quiver of Marr'))
  assert.ok(isItem('Quiver of Marr (Item)'))
  assert.deepEqual(parseMobLoot("</li><li> [[Quiver of Marr|Spell: Quiver of Marr]]               <span class='drare'>(Rare)</span>", { isItem }), [])
  // MediaWiki title rules: `_` is a space and the FIRST letter is case-insensitive.
  assert.ok(isItem('lizard_Meat'))
  assert.ok(!isItem('Lizard meat'), 'only the first letter of a title is case-insensitive')
})

test('a link and a transclusion of the same item count ONCE, keeping the first rarity', () => {
  const block = `<ul><li> {{:Lizard Meat}} <span class='drare'>(Common)</span>
</li><li> [[lizard_Meat|Lizard Meat]] <span class='drare'>(Rare)</span>
</li><li> [[Lizardscale Belt]] (Uncommon)
</li><li> {{:Lizardscale_Belt}}
</li></ul>`
  assert.deepEqual(parseMobLoot(block, { isItem }), [
    { item: 'Lizard Meat', rarity: 'Common' },
    { item: 'Lizardscale Belt', rarity: 'Uncommon' }
  ])
})

test('without a corpus test, links are not read at all (transclusions only, as before)', () => {
  assert.deepEqual(parseMobLoot(ARCHON_LOOT), [])
  const wt = `{{Namedmobpage\n| name = Tae Ew Archon\n| known_loot =\n${ARCHON_LOOT}\n| factions = \n}}`
  assert.equal(parseMobWikitext(wt).dropsWiki, undefined)
  assert.equal(parseMobWikitext(wt, { isItem }).dropsWiki?.length, 4)
})

test('the committed catalog: Tae Ew Archon has its drops back', () => {
  const archon = MOBS.find((m) => m.page === 'Tae Ew Archon')
  assert.ok(archon, 'Tae Ew Archon left the mob catalog')
  assert.deepEqual(archon.drops, ['Rubicite Vambraces', 'Ravenscale Armguards', 'Lizardscale Belt', 'Lizard Meat'])
})
