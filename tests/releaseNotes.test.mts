// What's new (src/shared/releaseNotes.ts) — JOS-73.
//
// TWO CLAIMS ARE UNDER TEST AND THEY ARE DIFFERENT KINDS OF CLAIM.
//
//   THE DATA. `RELEASE_NOTES` is hand-written and grows by one entry per release forever, which
//   makes it exactly the sort of file that acquires a duplicate version, a date typed in the
//   wrong order, or a row inserted in the wrong place — none of which would throw, and all of
//   which would quietly break the ordering every derivation below assumes. `releaseNotesProblems`
//   is the shape check, and it is the SAME function the release job runs
//   (scripts/check-release-notes.mjs), so a tag that ships is a tag whose notes passed this.
//
//   THE DERIVATION. "Which releases are new to this install" is a pure function of one stored
//   string, and every state it can be in is reachable here in a line: the fresh install that must
//   see nothing, the one-release upgrade, and the A→D case — 0.6.3 landing on 0.8.0 marks BOTH
//   0.7.0 and 0.8.0, which is the whole reason the key stores a version instead of a boolean.
//
// No Electron, no store file, no renderer: shared/releaseNotes.ts is a zero-import pure module,
// so this suite is as cheap and as unskippable as graphicsPrefs/overlayLayout.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  RELEASE_NOTES,
  compareVersions,
  hasReleaseNote,
  hasReportedEntry,
  latestReleaseVersion,
  parseVersion,
  releaseNotesProblems,
  variantLastSeen,
  whatsNewState,
  type ReleaseNote
} from '../src/shared/releaseNotes'

// A small fixture list so the derivation tests do not move every time a release ships.
const NOTES: readonly ReleaseNote[] = [
  { version: '0.8.0', date: '2026-08-07', entries: [{ kind: 'new', text: 'Eight.' }] },
  { version: '0.7.0', date: '2026-08-07', entries: [{ kind: 'fixed', text: 'Seven.' }] },
  { version: '0.6.3', date: '2026-08-06', entries: [{ text: 'Six three.' }] },
  { version: '0.6.2', date: '2026-08-05', entries: [{ text: 'Six two.' }] },
  { version: '0.6.1', date: '2026-08-05', entries: [{ text: 'Six one.' }] }
]

// ---------------------------------------------------------------- the data

test('the committed notes are sound: ordering, versions, dates, entries', () => {
  assert.deepEqual(releaseNotesProblems(), [], 'src/shared/releaseNotes.ts has problems')
})

test('the newest note is the head of the list, and that is what an install gets stamped with', () => {
  assert.equal(latestReleaseVersion(), RELEASE_NOTES[0]!.version)
  // The stamp must be a real release, or the next launch would find everything newer than a
  // version that never shipped.
  assert.ok(hasReleaseNote(latestReleaseVersion()))
})

test('releaseNotesProblems CATCHES the mistakes this file will actually acquire', () => {
  const bad = (notes: ReleaseNote[]): string => releaseNotesProblems(notes).join(' | ')

  // Out of order — a row pasted at the bottom instead of the top.
  assert.match(
    bad([
      { version: '0.7.0', date: '2026-08-07', entries: [{ text: 'a' }] },
      { version: '0.8.0', date: '2026-08-07', entries: [{ text: 'b' }] }
    ]),
    /newest first/
  )
  // A duplicated version — "strictly below" is what rejects it.
  assert.match(
    bad([
      { version: '0.8.0', date: '2026-08-07', entries: [{ text: 'a' }] },
      { version: '0.8.0', date: '2026-08-07', entries: [{ text: 'b' }] }
    ]),
    /strictly below/
  )
  // A date in the wrong format, an empty release, an empty line, an invented kind.
  assert.match(bad([{ version: '0.8.0', date: '08/07/2026', entries: [{ text: 'a' }] }]), /YYYY-MM-DD/)
  assert.match(bad([{ version: '0.8.0', date: '2026-08-07', entries: [] }]), /no entries/)
  assert.match(bad([{ version: '0.8.0', date: '2026-08-07', entries: [{ text: '  ' }] }]), /no text/)
  assert.match(
    bad([
      {
        version: '0.8.0',
        date: '2026-08-07',
        entries: [{ kind: 'improved' as 'new', text: 'a' }]
      }
    ]),
    /unknown kind/
  )
  // fromReport is a FLAG: present means true. A stored `false` would read as "we checked and it
  // wasn't a report", which is a claim this file has no way to make.
  assert.match(
    bad([
      {
        version: '0.8.0',
        date: '2026-08-07',
        entries: [{ text: 'a', fromReport: false }]
      }
    ]),
    /fromReport is a flag/
  )
  assert.match(bad([]), /empty/)
})

// ------------------------------------------------------------------ bullets

// "No bullet carries three features" is NOT testable by counting commas, and the attempt is
// recorded here because it looked testable and is not: the first version of this suite rejected
// "Suggested alerts for slows wearing off, mote drops, and receiving tells", which is ONE feature
// listing the three things it watches, and would have equally rejected "the install folder, the
// Logs folder, or a log file" — one setting, three inputs. A comma is not evidence of a packed
// list, and a test that says it is teaches the next author to write worse sentences to satisfy it.
//
// What IS decidable is the COUNT: the defect this ticket fixed was a release with four changes in
// its tag range shipping as one bullet, and a release's bullet count is a fact. That is what the
// test below pins, and the prose stays a review question.

/**
 * The releases that INTRODUCED a surface (JOS-80), and how many bullets each introduction spends.
 *
 * They are listed here rather than derived because "is this an introduction" is an editorial
 * judgment the data deliberately does not encode — the owner's ruling was plain bullets in the
 * same list, no flag, no second rendering, so nothing in `ReleaseEntry` marks one. The count is
 * still a fact, and the CAP is the part worth defending: at most five bullets, or the contrast
 * that makes an introduction stand out is gone and the panel is a wall of prose.
 */
const INTRODUCTIONS: readonly { version: string; bullets: number }[] = [
  // No fork release has introduced a surface as a minority of its own bullets: 0.1.0 IS the
  // release (eleven bullets, pinned as a total in the counts test below), and every release
  // after it fixes or adds one panel at a time. The list stays empty until a release spends
  // extra bullets introducing a surface — and then the cap below is what guards it.
]

/** The cap the owner set: an introduction may spend at most five bullets on itself. */
const MAX_INTRODUCTION_BULLETS = 5

test('an introduction stays under the five-bullet cap', () => {
  for (const i of INTRODUCTIONS) {
    assert.ok(
      i.bullets >= 2 && i.bullets <= MAX_INTRODUCTION_BULLETS,
      `v${i.version}'s introduction spends ${String(i.bullets)} bullets — the rule is 2 to ${String(MAX_INTRODUCTION_BULLETS)}`
    )
  }
})

test('a release states one change per bullet, and multi-change releases have several', () => {
  const counts = new Map(RELEASE_NOTES.map((n) => [n.version, n.entries.length]))
  // The founding release is the one authored with full per-change detail — every surface it
  // shipped, one bullet each. Pinned as a total so the founding prose cannot quietly grow.
  assert.equal(counts.get('0.1.0'), 11, "the Linux Edition's founding release")
  // THE CONSOLIDATED 0.2 SERIES (0.2.23, the owner's ask): four bullets, one per thing the
  // series did — the panels, the unlock-all bulk pin, the cursor ring, the icons. Pinned as
  // four so a fifth bullet can only arrive as a deliberate release, never as prose drift.
  assert.equal(counts.get('0.2.23'), 4, 'the 0.2 series: overlays, unlock-all, cursor ring, icons')
  // …and the intermediate version numbers the series consumed are GONE — the twenty-one
  // granular entries were the owner's explicit ask to drop.
  for (const v of ['0.2.0', '0.2.3', '0.2.9', '0.2.14', '0.2.21']) {
    assert.equal(counts.get(v), undefined, `v${v} is folded into the consolidated block, not listed`)
  }
})

// A BULLET IS SHORT (owner, 2026-09-03). Three sentences at most — the outcome, optionally why it
// was wrong, optionally what changed — and a character ceiling so three sentences cannot become
// three paragraphs. This fork adopts the rule at 0.2.12: everything it shipped before that was
// written in its first sessions and is history, not a template.
const SHORT_NOTES_FROM = '0.2.12'
const MAX_NOTE_SENTENCES = 3
const MAX_NOTE_CHARS = 320

function sentencesOf(text: string): number {
  return (text.match(/[.!?](\s|$)/g) ?? []).length
}

test('a release note bullet is short: three sentences and 320 characters at most, from 0.2.12 on', () => {
  const governed = RELEASE_NOTES.filter((n) => compareVersions(n.version, SHORT_NOTES_FROM) >= 0)
  assert.ok(governed.length >= 1, 'the rule governs at least the release that introduced it')
  for (const note of governed) {
    for (const entry of note.entries) {
      const sentences = sentencesOf(entry.text)
      assert.ok(
        sentences <= MAX_NOTE_SENTENCES,
        `v${note.version}: ${String(sentences)} sentences in one bullet — outcome, cause, change; a second visible thing is a second bullet: "${entry.text.slice(0, 60)}…"`
      )
      assert.ok(
        entry.text.length <= MAX_NOTE_CHARS,
        `v${note.version}: ${String(entry.text.length)} characters in one bullet (ceiling ${String(MAX_NOTE_CHARS)}): "${entry.text.slice(0, 60)}…"`
      )
    }
  }
})

// ------------------------------------------------------------------- thanks

test('THANKS IS EARNED: only tagged entries carry the flag, and only tagged releases thank', () => {
  const tagged = new Map(
    RELEASE_NOTES.map((n) => [n.version, n.entries.filter((e) => e.fromReport === true).length])
  )
  // No fork release has yet shipped work traceably cited to a player report — every defect so
  // far was owner-found, and thanking the community for the owner's own reports would make the
  // chip mean nothing. The first release that genuinely cites one flips its pin here.
  for (const n of RELEASE_NOTES) {
    assert.equal(tagged.get(n.version), 0, `v${n.version} has no traceable report behind it and must not thank`)
  }
})

test('hasReportedEntry decides the thanks line, and agrees with the entries', () => {
  for (const n of RELEASE_NOTES) {
    assert.equal(
      hasReportedEntry(n),
      n.entries.some((e) => e.fromReport === true),
      `v${n.version}`
    )
  }
  // No committed release carries a tag, so the TRUE case is synthetic: the function decides
  // from the entries alone, and the first genuinely tagged release will read through the same door.
  const synthetic = (fromReport?: boolean): ReleaseNote => ({
    version: '0.0.0',
    date: '2026-01-01',
    entries: [{ text: 'A bullet.', fromReport }]
  })
  assert.equal(hasReportedEntry(synthetic(true)), true)
  assert.equal(hasReportedEntry(synthetic()), false)
})

test('NOBODY IS EVER NAMED — no entry carries a report id, a handle or a contact', () => {
  for (const n of RELEASE_NOTES) {
    for (const e of n.entries) {
      assert.ok(!/\b01[0-9A-HJKMNP-TV-Z]{24}\b/.test(e.text), `v${n.version} carries a report ULID`)
      assert.ok(!/[\w.+-]+@[\w-]+\.\w+/.test(e.text), `v${n.version} carries an email address`)
      assert.ok(!/thanks to \w/i.test(e.text), `v${n.version} thanks somebody by name in a bullet`)
    }
  }
})

// ---------------------------------------------------------------- versions

test('version comparison orders the triple, and a release outranks its own prereleases', () => {
  assert.equal(compareVersions('0.8.0', '0.7.0'), 1)
  assert.equal(compareVersions('0.6.3', '0.6.10'), -1, 'patch is numeric, not lexical')
  assert.equal(compareVersions('0.10.0', '0.9.0'), 1, 'minor is numeric, not lexical')
  assert.equal(compareVersions('0.8.0', '0.8.0'), 0)
  assert.equal(compareVersions('v0.8.0', '0.8.0'), 0, 'a tag name and a version are the same value')
  assert.equal(compareVersions('0.8.0', '0.8.0-main.3'), 1)
  assert.equal(compareVersions('0.8.0-main.3', '0.8.0'), -1)
  // Unparseable reads as 0.0.0 — the SAFE direction: a junk stored value makes every release
  // look new rather than silently hiding one.
  assert.deepEqual(parseVersion('nonsense'), { major: 0, minor: 0, patch: 0, pre: '' })
  assert.equal(compareVersions('0.2.0', 'nonsense'), 1)
})

test('hasReleaseNote answers a TAG, prerelease tail and leading v included', () => {
  assert.ok(hasReleaseNote('v0.8.0', NOTES))
  assert.ok(hasReleaseNote('0.8.0-main.7', NOTES), 'a prerelease of a release that has notes')
  assert.ok(!hasReleaseNote('v0.9.0', NOTES), 'a version with no entry is the CI gate firing')
})

// ---------------------------------------------------------------- the state

test('A FRESH INSTALL HAS NO NEWS — no teaser, nothing marked', () => {
  for (const absent of [null, undefined, '', '   ']) {
    const s = whatsNewState(absent, NOTES)
    assert.equal(s.fresh, true)
    assert.deepEqual(s.newVersions, [])
    assert.equal(s.teaserVersion, null, 'a person who installed today did not live through 0.8.0')
  }
})

test('a one-release upgrade marks one release and names it', () => {
  const s = whatsNewState('0.7.0', NOTES)
  assert.equal(s.fresh, false)
  assert.deepEqual(s.newVersions, ['0.8.0'])
  assert.equal(s.teaserVersion, '0.8.0')
})

test('A→D: 0.6.3 landing on 0.8.0 marks BOTH 0.7.0 and 0.8.0, and the teaser names only the newest', () => {
  const s = whatsNewState('0.6.3', NOTES)
  assert.deepEqual(s.newVersions, ['0.8.0', '0.7.0'], 'newest first, everything since last seen')
  assert.equal(s.teaserVersion, '0.8.0', 'one line about where you landed, not a list of what you missed')
})

test('an install already on the newest release has nothing new and no teaser', () => {
  const s = whatsNewState('0.8.0', NOTES)
  assert.equal(s.fresh, false, 'dismissed is NOT the same state as never-installed')
  assert.deepEqual(s.newVersions, [])
  assert.equal(s.teaserVersion, null)
})

test('a store from a NEWER build (downgrade) claims no news rather than inventing some', () => {
  const s = whatsNewState('9.9.9', NOTES)
  assert.deepEqual(s.newVersions, [])
  assert.equal(s.teaserVersion, null)
})

// ------------------------------------------------------------ dev variants

test('the DEV variant control drives exactly the three states, from the notes themselves', () => {
  assert.equal(variantLastSeen('fresh', NOTES), null)
  assert.equal(variantLastSeen('previous', NOTES), '0.7.0')
  assert.equal(variantLastSeen('several', NOTES), '0.6.1')

  // …and each one lands the state it is named for.
  assert.deepEqual(whatsNewState(variantLastSeen('fresh', NOTES), NOTES).newVersions, [])
  assert.deepEqual(whatsNewState(variantLastSeen('previous', NOTES), NOTES).newVersions, ['0.8.0'])
  assert.deepEqual(whatsNewState(variantLastSeen('several', NOTES), NOTES).newVersions, [
    '0.8.0',
    '0.7.0',
    '0.6.3',
    '0.6.2'
  ])
})

test('the variants never name a version off the end of a short list', () => {
  const one: readonly ReleaseNote[] = [NOTES[0]!]
  assert.equal(variantLastSeen('previous', one), '0.8.0')
  assert.equal(variantLastSeen('several', one), '0.8.0')
  assert.equal(variantLastSeen('previous', []), null)
  assert.equal(variantLastSeen('several', []), null)
})
