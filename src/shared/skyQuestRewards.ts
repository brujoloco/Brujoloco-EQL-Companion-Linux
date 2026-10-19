// skyQuestRewards.ts — WHICH ITEM A SKY QUEST ACTUALLY HANDS OUT, when the wiki quest page links
// the wrong one (JOS-428).
//
// STATUS AFTER THE 2026-10-07 RESCRAPE: the Bard row this file was written for is RETIRED. The wiki
// quest page now links `Amulet of the Fae` itself, posky's reward cell and stat block (AC 8, STR +5)
// are that page's own, and items.json gives `Amulet of the Fae` the Bard Test of Wind questUse — so
// the audit's own instruction ("a re-scrape landed the fix, so delete the row") was followed. The
// story below is kept because it is the argument for the table's shape. The one live row is now
// Beastlord Test of Harpy (see its `evidence`): the same rescrape moved that quest's link from
// `Griffin-Hide Armguards` to a twin page `Griffon-Hide Armguards`, while the game's own client text
// (Resources/Achievements/AchievementComponentsClient.txt, `Obtain Griffin-Hide Armguards`) still
// names the Griffin spelling — the exact two-pages-one-item shape the Bard row had.
//
// THE DEFECT (retired row), reported 01M0FH3XC4ST5Q3XXPJ0H3X75J (1.6.0), verbatim: "The link Fae Amulet/name
// should be Amulet of the Fae." The reporter is a Bard who has run Bard Test of Wind, and their
// attached inventory export carries `Amulet of the Fae` (item id 27723, Bank7-Slot1) and no Fae
// Amulet at all. Two consequences, one of them invisible until the reward inference landed with
// this same ticket: the reward caption and its wiki link name an item the player will never see,
// and `rewardInference.ts` matches the export against the reward NAME, so Bard Test of Wind is the
// one Sky quest that could hold its reward in hand and still read "not turned in".
//
// WHY THIS IS NOT A RENAME, and so not a row in `itemRenames.ts`. That table is for an item the
// wiki has RETITLED under us (Scintillating -> Shimmering Bracer of Protection: the old page is
// literally `#REDIRECT` to the new one, and the new title appears in no committed scrape). Here
// BOTH pages exist and both are scraped, as two separate records:
//
//   * `Fae Amulet` — AC 5, DEX +4 STA +4 HP +50, eraTag Sky, questUses: Bard Test of Wind. Its own
//     summary asks "Is the Amulet of the Fae an upgraded version of this item?"
//   * `Amulet of the Fae` — AC 8, STR +5 DEX +4 STA +4 HP +50, same NECK slot, same BRD class, same
//     4 charges of Healing at 45, same icon 1043, no dropsFrom and no questUses at all. Its own
//     summary asks the mirror question, "Is this an upgraded version of Fae Amulet?"
//
// So the wiki holds two pages for one buffed item and is openly unsure; the player's bag is not.
// An `ITEM_RENAMES` row could not carry this even if the shape were right: `renamedItems` writes
// the renamed source record onto the target key, which would REPLACE the real AC 8 record with the
// stale AC 5 one, and `tests/itemRenames.test.mts` asserts no committed scrape carries the new
// spelling — items.json carries `Amulet of the Fae` as a page of its own, and posky.json carries it
// inside the very note quoted above. Both guards are correct about renames and both would have to
// be weakened to admit a row that is not one.
//
// WHY AN OVERLAY AND NOT A DATA EDIT. `posky.json` is a scrape rewritten wholesale by
// `npm run scrape:posky` (`parseRewardCell` reads the reward cell's ANCHOR, and the stat block is
// then fetched from whatever page that anchor points at — scripts/sources/eqlegends.ts), so a hand
// edit into it is undone by the next run and makes that run's diff unreadable. Nothing in the
// scrape is wrong about the wiki either: the wiki quest page really does link Fae Amulet. This is
// the `skyMobIslands.ts` arrangement, one row, applied at the one seam where the dataset enters the
// renderer (`renderer/src/data/index.ts`).
//
// THE ENTRY STATES WHAT IT REPLACES, the `SkyMobIsland` idempotence rule: `from` is what the scrape
// says today, so the day a re-scrape lands the correction upstream the audit fails rather than
// letting a row that has quietly stopped describing anything look like coverage.
//
// THE STAT BLOCK IS TRANSCRIBED, NOT INVENTED. `stats` is the committed `items.json` record for
// `Amulet of the Fae` written in posky's own one-line-per-row format — the renderer cannot read
// items.json (it is a main-process bundle), and leaving the old page's block would print AC 5 and a
// question about whether this item is an upgrade of itself under the corrected heading.
// `tests/skyQuestRewards.test.mts` derives every number in it from that committed record, so it
// cannot drift, and pins that it still reads as untradeable — the reward inference's whole gate.

/** One Sky quest whose scraped reward names a different item from the one the game hands out. */
export interface SkyQuestReward {
  /** Quest identity, the pair every posky surface keys on. */
  className: string
  questName: string
  /** What the scrape's reward cell says today, so a fixed re-scrape fails the audit. */
  from: string
  /** The item actually handed out — the name to display, to link, and to match an export against. */
  to: string
  /** The corrected stat block, in posky's `rewardStats` format. */
  stats: string
  /** ISO date the correction was last checked against the evidence below. */
  verified: string
  /** What was checked and what it said, in one line. */
  evidence: string
}

export const SKY_QUEST_REWARDS: readonly SkyQuestReward[] = [
  // The Bard row (`Fae Amulet` -> `Amulet of the Fae`, verified 2026-08-20, report
  // 01M0FH3XC4ST5Q3XXPJ0H3X75J) RETIRED 2026-10-07: the rescrape's posky.json names `Amulet of the
  // Fae` on Bard Test of Wind with that page's own AC 8 / STR +5 block, so the row had stopped
  // describing anything. tests/skyQuestRewards.test.mts keeps a tripwire on the fixed scrape.
  {
    className: 'Beastlord',
    questName: 'Beastlord Test of Harpy',
    from: 'Griffon-Hide Armguards',
    to: 'Griffin-Hide Armguards',
    stats: [
      'Lore Equipped, No Trade',
      'Slot: ARMS',
      'Class: BST',
      'Race: ALL',
      'AC: 6',
      'STA: +4 WIS: +3',
      'SV MAGIC: +5 SV FIRE: +5 SV COLD: +5 SV DISEASE: +5 SV POISON: +5',
      'End: +15',
      'WT: 2.5 Size: SMALL',
      'Custom EQL Plane of Sky reward.'
    ].join('\n'),
    verified: '2026-10-07',
    evidence:
      'The 2026-08-22 scrape read the quest page linking Griffin-Hide Armguards; the 2026-10-07 ' +
      'rescrape reads it linking Griffon-Hide Armguards. Both pages are live on eqlwiki.com (ids ' +
      '57119 / 57117, same editor, identical stats and icon 634) and both are in items.json. The ' +
      'game client ships `Obtain Griffin-Hide Armguards` in AchievementComponentsClient.txt (row ' +
      '20000215); that text matches the reward name on 93 other Sky quests (Windhowl, a weapon ' +
      'pair, is the lone alias), so the game spelling is Griffin. No inventory export holding the ' +
      'item exists yet to settle it outright.'
  }
]

/** The minimum a quest record must have for the overlay to key on it and rewrite it. */
interface CorrectableQuest {
  className: string
  name: string
  reward?: string
  rewardPage?: string
  rewardStats?: string
}

const questIdentity = (className: string, name: string): string =>
  `${className.toLowerCase()}${name.toLowerCase()}`

const BY_QUEST: ReadonlyMap<string, SkyQuestReward> = new Map(
  SKY_QUEST_REWARDS.map((e) => [questIdentity(e.className, e.questName), e])
)

/** The overlay row for one quest, or undefined. Exported for the audit test and the seam. */
export function skyQuestRewardFor(className: string, name: string): SkyQuestReward | undefined {
  return BY_QUEST.get(questIdentity(className, name))
}

/**
 * Does this quest's scraped reward still read the way the row says it does?
 *
 * The correction is applied ONLY to a quest whose reward is still the stale name — an idempotence
 * guard, and the thing that makes a landed re-scrape a no-op here rather than a second rewrite of
 * an already-correct row.
 */
export function needsRewardCorrection(q: CorrectableQuest): boolean {
  const hit = skyQuestRewardFor(q.className, q.name)
  return hit !== undefined && q.reward === hit.from
}

/**
 * One quest with its reward name, its wiki page link and its stat block corrected — or the SAME
 * object when the overlay has nothing to say about it, so a caller memoizing on identity keeps it.
 *
 * `rewardPage` is set rather than renamed: the page to open is the corrected item's own page, and
 * the scrape's `rewardPage` is only ever the anchor the wrong link pointed at.
 */
export function correctSkyQuestReward<T extends CorrectableQuest>(q: T): T {
  const hit = skyQuestRewardFor(q.className, q.name)
  if (!hit || q.reward !== hit.from) return q
  return { ...q, reward: hit.to, rewardPage: hit.to, rewardStats: hit.stats }
}
