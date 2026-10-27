// ============================================================================
// releaseNotes — what changed, release by release, and who has not read it yet (JOS-73).
// ============================================================================
//
// THE NOTES ARE COMMITTED SOURCE, not a fetch. Three reasons, in order of weight:
//
//   1. The app must be able to say what changed while offline, in a game session, with no
//      network and no GitHub. A release note that needs a request is a release note that is
//      sometimes absent, which is worse than none at all.
//   2. The bundler INLINES this module into the renderer exactly the way it inlines spells.json
//      and the mob catalog, so the notes ship with the build that they describe. A build can
//      never show a newer release's notes, and never lose its own.
//   3. It is reviewable in the diff that ships it. The owner reads the sentence in the pull
//      request, not on a web page afterwards.
//
// THE STORE KEY IS A VERSION, NOT A BOOLEAN. `lastSeenNotesVersion` (src/main/store.ts) holds
// the newest release whose notes this install has been SHOWN. That is what makes the A→D case
// work without bookkeeping: somebody who was on 0.6.3 and lands on 0.8.0 has TWO releases of
// news, and the panel marks both, because "new" is a comparison and not a flag somebody had to
// remember to set per release.
//
// AND AN ABSENT KEY MEANS A FRESH INSTALL, WHICH HAS NO NEWS. Nothing is marked, and the teaser
// strip never appears — a person who installed the app twenty minutes ago did not live through
// any of these changes, and telling them "Updated to v0.8.0" on their first launch would be a
// small lie in the first sentence the app ever says to them. The panel is still there to browse;
// it is history, and history is available to everyone.
//
// WHY THE STAMP IS THE NEWEST NOTE VERSION AND NOT `app.getVersion()`. package.json carries
// `0.1.0` forever — CI stamps the real version FROM THE TAG and never commits it (AGENTS.md,
// Shipping), so `app.getVersion()` reads 0.1.0 on every dev run. Stamping that would make every
// release look new on every launch in dev, and comparing against it would blank the whole
// feature there. The newest entry in this list IS the running version in every published build
// (the release job refuses a tag with no entry — scripts/check-release-notes.mjs), so reading it
// from the data is both honest and testable from a checkout.
//
// VOICE: player-centric and plain. What YOU can now do, or what stopped being wrong. Not wave
// names, not module names, not ticket ids. `kind` is the only structure — the panel groups by it
// into "New" / "Fixed" / "Changed" sub-headers, and a release whose entries carry no kind (the
// one-line historical headlines below) renders as a bare line with no sub-header at all.
//
// A NEW SURFACE EARNS EXTRA BULLETS — AT MOST FIVE (JOS-80, owner direction). The rule to apply
// when writing a release's notes, including the per-release draft cut at tag time:
//
//   * A FIX, A CHANGE, A NEW OPTION → ONE bullet. "What changed" is the whole answer. A player
//     reading "Maps render north correctly" needs nothing more, and explaining why north matters
//     would be padding.
//   * A NEW TAB, OR A MAJOR NEW SURFACE (a new mode on a tab, a new window, a way of working that
//     did not exist) → TWO TO FIVE bullets, never more than five. One says what it is; the others
//     say why it was built — the problem, in the player's terms and from before the thing existed
//     — and what they can now do with it. Nobody has any idea why a tab they have never seen is
//     there, and the one line that names it cannot tell them.
//
// IT IS PLAIN BULLETS IN THE SAME LIST, and that is the whole mechanism (owner ruling, 2026-08-07,
// which reversed a `detail` sub-paragraph field this ticket started out building). No extra field,
// no second rendering, no card, no header: an introduction is simply a change that took a few more
// lines to state. The renderer never learns that some bullets are special, so there is no way for
// the panel to become shouty and no shape for a future author to misuse.
//
//   * WHEN IN DOUBT, LEAVE IT OUT. The contrast is the signal: if most changes carried three
//     bullets the introductions would stop standing out. A release that was a rollup of fixes gets
//     no "why" at all — inventing one for a batch of repairs is the failure this rule prevents.
//
// A bullet NEVER restates its neighbour, never names a file, a module or a wave, and never
// explains how the app works internally (state, never process — the UI conventions).
//
// A BULLET IS SHORT (owner, 2026-09-03: "that's an incredibly long paragraph"). The shape is
// three sentences at most and it is enforced by `tests/releaseNotes.test.mts`:
//
//   1. WHAT THE PLAYER SEES NOW — the fix or the feature, stated as the outcome. This sentence is
//      the whole bullet for a small change.
//   2. (optional) WHY IT WAS WRONG, in one sentence of cause and effect in the player's terms.
//   3. (optional) WHAT CHANGED, in one clause. Never the layers of the fix, never the diagnostics
//      that went in beside it — a second thing the player can see is a second bullet.
//
// If the sentence needs a comma-spliced tour of the mechanism, it is a ticket comment, not a note.

/** Which sub-header an entry sits under. Absent ⇒ the entry is a bullet under no sub-header. */
export type ReleaseEntryKind = 'new' | 'fixed' | 'changed'

/** One bullet of a release's notes. */
export interface ReleaseEntry {
  readonly kind?: ReleaseEntryKind
  readonly text: string
  /**
   * THIS ONE CAME FROM A PLAYER (JOS-76, owner direction).
   *
   * Set only where a user report actually generated the work — the panel renders a small
   * "player report" chip on the bullet, and any release carrying one gets a single plain thanks
   * line under its header. NOBODY IS EVER NAMED: reports arrive with an install id and, when the
   * reporter chose to leave one, a contact — none of which belongs on a screen every other user
   * can read. The thanks is collective on purpose.
   *
   * THE BAR IS TRACEABILITY, NOT PLAUSIBILITY. A flag is set here only when the commit that did
   * the work cites a report (a report id, "the YouTube report", "Mac/CrossOver user report").
   * Owner-found defects are NOT tagged even though they were also "reported" — thanking the
   * community for the owner's own bug reports would make the chip mean nothing. When the trail is
   * unclear, the entry ships untagged: an unearned thanks costs more than a missing one.
   */
  readonly fromReport?: boolean
}

/** One release. `date` is an ISO calendar date (YYYY-MM-DD), rendered through the app's own
 *  local-date formatter — never parsed for arithmetic. */
export interface ReleaseNote {
  readonly version: string
  readonly date: string
  readonly entries: readonly ReleaseEntry[]
}

/**
 * Every release, NEWEST FIRST — the order the panel renders and the order every derivation
 * below assumes (`releaseNotesProblems` pins it, so the assumption is checked rather than
 * trusted).
 *
 * EVERY RELEASE IS BULLETS (JOS-76). The backfilled ones shipped first as single comma-separated
 * sentences, which is how "four things happened" gets read as one thing: a bullet per change is
 * the whole difference between a list somebody scans and a paragraph somebody skips. Each
 * historical release is split only as far as its own tag range honestly supports — two to four
 * bullets where the range holds that many player-facing changes, one where it holds one. Nothing
 * is invented to reach a count.
 *
 * …and a release that INTRODUCED a surface spends a few more of them on it (JOS-80 — see the
 * header's voice section for the cap and the rule). Four introductions carry that treatment
 * today: the What's new panel and the "This week" lockout view in 0.9.0, and, backfilled where
 * the tag range supports honest prose, the exaltation planner and the celebration cards in
 * 0.4.0 — plus in-app feedback in 0.3.0, which is the one judgment call in the set.
 *
 * The releases before 0.7.0 carry no `kind`. They are backfilled from the tag dates and the
 * commits in each tag's range, and sorting them into New/Fixed/Changed after the fact would be
 * guessing at a distinction nobody drew at the time — so they render as plain bullets, which is
 * an honest shape rather than a degraded one.
 *
 * v0.3.3 is deliberately ABSENT: its tag points at the same commit as v0.3.2, so there is
 * nothing it changed. The comparison is by version, not by row, so an install stamped 0.3.3
 * still sees exactly the releases above it.
 */
export const RELEASE_NOTES: readonly ReleaseNote[] = [
  // ───────────────────────────────────────────────────────────────────────────
  // Brujoloco EQL Companion — Linux Edition (0.2.37)
  //
  // THE 0.2.25-0.2.37 SESSION, COMPOUNDED: none of it shipped publicly, so it
  // is said once, here — his words where he wrote them: the privacy pass, the
  // owner's room leaving the binary, the Windows baggage following it out, the
  // updater reborn onto this project's own releases, the watcher stack gone,
  // and the last ghosts swept. After this, nothing rides along that does not
  // serve the app.
  {
    version: '0.2.37',
    date: '2026-10-27',
    entries: [
      {
        kind: 'changed',
        text: 'Reworked some of the old app connections to third party websites, I prefer my app to be as self contained as possible and without ties to external third sites. As I rework the app into something more akin to what I want out of it, I will disable some of the outside connections from the original app. 🧙'
      },
      {
        kind: 'changed',
        text: 'I also removed more leftover instructions and other things from original EQ Zera app. Though I believe discord sharing is fun and stuff, I want to leave such options to the player, not be embedded directly into the app. Philosophy of Design things :)'
      },
      {
        kind: 'changed',
        text: 'Removed the old EQ Zera owner dashboard that shipped inside the app\'s own binary - a private reviewer\'s room built into everyone\'s copy, reading a backlog that lives on someone else\'s cloud. It had no business riding along in the Linux Edition. Philosophy of Design things :)'
      },
      {
        kind: 'changed',
        text: 'Removed the old Windows-only machinery - the Win32 half of the window watcher, the registry hunt for the game folder, the installer config and every leftover file of it. The Linux app is a Linux app now, and npm run dist builds the AppImage, as it always should have. ✨'
      },
      {
        kind: 'changed',
        text: 'The feedback dialog no longer offers to email the old app\'s author - reports go to this project\'s own GitHub issues or your clipboard, and nothing queues up in the background anymore. One less door to somebody else\'s house.'
      },
      {
        kind: 'changed',
        text: 'The updater is back, and this time it works for THIS app - Check for updates reads this project\'s own GitHub releases, downloads the new AppImage when you click, and swaps it in on restart. My app, updating from my repo. 🧙'
      },
      {
        kind: 'changed',
        text: 'Each release carries a small latest-linux.yml file beside the AppImage - the updater\'s shopping list. A release without it simply reads as up to date, and nothing breaks.'
      },
      {
        kind: 'changed',
        text: 'Removed the old app\'s usage tracking machinery for good - nothing collects, nothing writes little files in the background, and the usage analytics card is gone from Preferences. The app watches the game, not you. Philosophy of Design things :)'
      },
      {
        kind: 'changed',
        text: 'The voice download goes straight to the voice pack now - no more pretending to set up a Windows runtime first, and no Windows file rides along in the package at all.'
      },
      {
        kind: 'changed',
        text: 'Swept out the last of the old app\'s vocabulary - a dozen unused schema files, a feature gate with no feature, dead exports and stale comments. Nothing left that does not serve the app. Philosophy of Design things :)'
      },
      {
        kind: 'fixed',
        text: 'Fixed a leak the test runs found: temp directories piling up in /tmp every run, never cleaned. The suite now sweeps up after itself. ✨'
      },
      {
        kind: 'new',
        text: 'Send feedback is back in the menu - the report goes to this project\'s own GitHub issues or your clipboard, both of which work right now. 🧙'
      },
      {
        kind: 'changed',
        text: 'The update checker speaks plainly now: while no release carries the updater\'s file yet, it says so instead of crying failed. 💚'
      },
      {
        kind: 'changed',
        text: 'Settings sync is offline now - one encrypted line carries your settings to your other PC, saved as a text file or copied to paste. How it travels is your business: email it to yourself, a USB stick, your own cloud drive. The app opens no connection for any of it.'
      },
      {
        kind: 'changed',
        text: 'The online sound pack browser now starts closed and says where it would connect before it does - a third-party community registry - and only loads when you click Browse. No more surprise connections.'
      },
      {
        kind: 'changed',
        text: 'The natural voice download now says where it connects before it does too - the kokoro-onnx release files on GitHub, a third-party project, with every file checked against a pinned hash. One download, offline from then on.'
      },
      {
        kind: 'changed',
        text: 'A full connection sweep of the app found one leftover Microsoft address from the deleted Windows voice setup - a constant that never ran, now gone too. Every connection this app can make is named, pinned, or behind your click.'
      },
      {
        kind: 'changed',
        text: 'Expect the linux app to evolve into its own thing and as contained as possible. 🧙'
      }
    ]
  },
  // Brujoloco EQL Companion — Linux Edition (0.2.24)
  // ───────────────────────────────────────────────────────────────────────────
  //
  // Voice alerts, unlocked for Linux. The system voice tier was an empty shelf
  // on this platform; this release wires it to the speech layer every Linux
  // desktop already runs (the same daemon Orca speaks through), points the
  // quality-seekers at the natural voice tier that was already there, and
  // gives the tier the honest name it always deserved.
  {
    version: '0.2.24',
    date: '2026-10-27',
    entries: [
      {
        kind: 'new',
        text: 'Alerts can talk on Linux now. The Voice section of Preferences lists your system\'s built-in voices with nothing to install - the same voices your desktop\'s accessibility layer already uses. Fair warning: on most distributions they sound a bit robotic.'
      },
      {
        kind: 'new',
        text: 'Want a voice worth listening to? The "Natural voice (downloaded)" tier fetches the Kokoro voice package - one click, about 115 MB, offline from then on - and adds 28 English voices to the picker (US and British, female and male). Pick the one your alerts speak with; every alert can use it.'
      },
      {
        kind: 'changed',
        text: 'The built-in voice tier is now called "System voices (built in)" - it used to be labeled "Windows voices", which was never the whole truth on Linux.'
      }
    ]
  },
  // ───────────────────────────────────────────────────────────────────────────
  // Brujoloco EQL Companion — Linux Edition (0.2.23)
  // ───────────────────────────────────────────────────────────────────────────
  //
  // THE 0.2 SERIES, CONSOLIDATED (the owner's ask, 2026-10-25): the granular
  // entries from 0.2.0 through 0.2.21 are gone - one working session, twenty-one
  // half-steps, four things worth saying, said here in the owner's other ask:
  // the tired-human voice of whoever actually did the seven hours, and the
  // mage emoji sprinkled where it belongs. Numbered 0.2.23 because the panel
  // flags whatever is newer than the last version an install saw, and a
  // rewording is still a change.
  {
    version: '0.2.23',
    date: '2026-10-25',
    entries: [
      {
        kind: 'fixed',
        text: '🧙 The overlays finally sit over the game. A panel opened while EverQuest owns the screen lands above it and stays there, a pinned panel reveals its header so you can drag it anywhere, and it remembers the spot you left it. Pin it and it shows in game; unpin it to shuffle it around the desktop.'
      },
      {
        kind: 'new',
        text: '"Unlock all overlay windows" joins the overlay menu. One click drops click-through on every panel so you can rearrange the whole fleet at once, then re-pin the keepers. The con card, the celebration toasts and the alert banner stay pinned over the game - they earn their keep.'
      },
      {
        kind: 'fixed',
        text: 'The cursor ring works on Linux now, I promise 🧙. Its watcher used to demand Windows bindings this machine cannot even open, so the ring never existed here; it reads the window system directly now and the halo follows your pointer over EverQuest. That one took three attempts and every one was worth it.'
      },
      {
        kind: 'changed',
        text: 'Both app icons are a mage 🧙. The taskbar window mark and the tray icon render the wizard emoji, replacing the drawn badge they carried. Twenty-odd builds later, the app finally looks like itself.'
      }
    ]
  },
  // ───────────────────────────────────────────────────────────────────────────
  // Brujoloco EQL Companion — Linux Edition (0.1.0)
  // ───────────────────────────────────────────────────────────────────────────
  //
  // This is the first release of the Brujoloco EQL Companion, a full rework of the
  // EQ Zera build (1.26.1) into a native Linux AppImage. The upstream EQ Zera changelog
  // that preceded this entry has been removed; the Brujoloco release notes begin
  // here. See the 'About this build' section in Preferences for the build's
  // origin story and license.
  {
    version: '0.1.0',
    date: '2026-10-19',
    entries: [
      {
        kind: 'new',
        text: 'Brujoloco EQL Companion, Linux Edition - a full rework of the EQ Zera 1.26.1 build into a native Linux AppImage. The Rust log engine (zengine) is compiled natively for linux-x64 and bundled inside the AppImage; the Electron renderer and main bundles build clean on Linux with no source changes. Point the app at your EverQuest install under a Wine prefix via Settings and it reads the same log it has always read.'
      },
      {
        kind: 'new',
        text: 'Runtime theme system: a Preferences → Appearance → Theme picker with 36 palettes, all switchable live with no restart. The palette module was converted to a live-binding reassignment so all 70 consuming files pick up the new tokens without a rewrite, and the MUI theme is rebuilt on every swap through a makeTheme(palette) factory plus a useSyncExternalStore version counter.'
      },
      {
        kind: 'new',
        text: '36 themes ship in this build: the default Arcane (byte-identical to the original EQ Zera palette), Parchment & Gold (the upstream jmoyers brownish look), CRT Green/Amber/Orange, Monochrome, Paper White, the three Windows 95 greys, Synthwave 80s, Cyberpunk, Vaporwave, Retrofuturistic, Vintage Sepia, Vintage Cream, Solarized Dark/Light, Dracula, Nord, Gruvbox, Tokyo Night, Catppuccin Mocha, One Dark, six Brujoloco dark CRT / retro-80s / cyberpunk green-on-black themes, and six BrujoGnome high-contrast pastel themes.'
      },
      {
        kind: 'fixed',
        text: 'Adaptive light/dark mode: the MUI theme was hardcoded to dark mode, so the six light themes (Paper White, the three Windows 95 greys, Vintage Cream, Solarized Light) rendered invisible light-on-light text in every submenu. The mode is now derived from each palette - text lighter than paper is dark, text darker than paper is light - so the Preferences rail, dropdowns and cards all flip to readable dark text on light themes.'
      },
      {
        kind: 'fixed',
        text: 'The page body background, the 28px grid, ::selection and the scrollbar thumb were module-scope constants that captured the default dark palette at import time and never rebuilt, so the window background stayed the original dark navy on every theme. They are now functions of the live palette, so a theme swap recolours the whole page - the root cause of the "the background is always the original dark blue background" report.'
      },
      {
        kind: 'fixed',
        text: 'Mode-aware scrollbar: the thumb is a white tint on dark themes and a black tint on light themes, so scrollbars stay visible on the light themes\' light scroll surfaces instead of disappearing.'
      },
      {
        kind: 'fixed',
        text: 'Every cataloged theme is verified to clear WCAG AA (≥4.5:1) for body text on background and paper, and for the accent on paper - enforced by a new themes.test.mts suite that fails the build if a theme ships unreadable. Single-hue themes allow the accent to repeat a series colour; the four non-accent series tokens (cyan/green/amber/red) stay pairwise distinct so charts never draw two lanes in one colour.'
      },
      {
        kind: 'changed',
        text: 'In-app and OS rebrand to "Brujoloco EQL Companion": the OS window title, the tray menu and tooltip, the HTML <title>, the electron-builder appId/productName, and the in-app title-bar wordmark all carry the new name.'
      },
      {
        kind: 'changed',
        text: 'Update checks and the Send feedback surface are disabled in this build: the upstream EQ Zera release feed and feedback endpoint are not compatible with the Linux Edition, so the updater is short-circuited (no network call) and both the Preferences and nav-drawer feedback entry points are no-ops with an honest "disabled in this build" note. Both are reversible by flipping one flag / restoring the onClick handlers.'
      },
      {
        kind: 'new',
        text: 'The floating overlays now follow the main theme. Every overlay window (zone meter, fight meter, fight healing, zone healing, event log, buffs, debuffs, xp, respawn, farm meter, run tracker, mob card on /con) is its own renderer process, so it kept the default bluish palette no matter which theme the main window was in. The theme now rides onto them: the overlay preload exposes themeGet + onTheme, the main process broadcasts the theme id to every open overlay on a change and seeds a late-opened one on mount, and the overlay root is wrapped in the app’s MUI ThemeProvider so a live swap recolours it. The overlay components’ module-scope colour captures were converted to live PALETTE reads, and the opaque overlays’ native background is read live too - so a theme change recolours every overlay, with no restart.'
      },
      {
        kind: 'new',
        text: 'Preferences → About this build: a new section directly above Thanks, naming the build and its origin, declaring it final for Linux, and disclosing the open license - upstream code under FSL-1.1-MIT, the Brujoloco Linux Edition additions under MIT.'
      }
    ]
  }
]
interface ParsedVersion {
  readonly major: number
  readonly minor: number
  readonly patch: number
  /** The `-rc.1` half of a prerelease tag, or '' for a plain release. */
  readonly pre: string
}

export function parseVersion(value: string): ParsedVersion {
  const m = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?/.exec(value.trim())
  if (!m) return { major: 0, minor: 0, patch: 0, pre: '' }
  return { major: Number(m[1]), minor: Number(m[2]), patch: Number(m[3]), pre: m[4] ?? '' }
}

/**
 * Semver ordering, enough of it: numeric triple first, then semver's own rule that a release
 * outranks its own prereleases (`0.8.0` > `0.8.0-main.3`). The prerelease tail itself is
 * compared as text, which is not the full spec — it is right for the only prerelease shapes this
 * repo has ever tagged (`-main.N`, `-sign.N`) and it is never the deciding factor for anything
 * the user sees, because every entry above is a plain release.
 */
export function compareVersions(a: string, b: string): number {
  const x = parseVersion(a)
  const y = parseVersion(b)
  if (x.major !== y.major) return x.major < y.major ? -1 : 1
  if (x.minor !== y.minor) return x.minor < y.minor ? -1 : 1
  if (x.patch !== y.patch) return x.patch < y.patch ? -1 : 1
  if (x.pre === y.pre) return 0
  if (x.pre === '') return 1
  if (y.pre === '') return -1
  return x.pre < y.pre ? -1 : 1
}

/** The newest release these notes describe — the value an install is stamped with once it has
 *  been shown them. See the header for why this, and not `app.getVersion()`. */
export function latestReleaseVersion(notes: readonly ReleaseNote[] = RELEASE_NOTES): string {
  return notes[0]?.version ?? '0.0.0'
}

/** Does `version` (a tag name is fine — the leading `v` and any prerelease tail are ignored)
 *  have an entry? The release job's gate; see scripts/check-release-notes.mjs. */
export function hasReleaseNote(
  version: string,
  notes: readonly ReleaseNote[] = RELEASE_NOTES
): boolean {
  const want = parseVersion(version)
  return notes.some((n) => {
    const got = parseVersion(n.version)
    return got.major === want.major && got.minor === want.minor && got.patch === want.patch
  })
}

/** Does this release carry any player-reported entry? — whether it gets a thanks line (JOS-76). */
export function hasReportedEntry(note: ReleaseNote): boolean {
  return note.entries.some((e) => e.fromReport === true)
}

// ---------------------------------------------------------------- the state

/** What the teaser strip and the What's new panel both render from. */
export interface WhatsNewState {
  /** No stored last-seen version: a fresh install, which has no news. */
  readonly fresh: boolean
  /** Every release newer than the stored last-seen version, NEWEST FIRST. Marked "new" in the
   *  panel — all of them, which is the A→D case: 0.6.3 → 0.8.0 marks 0.7.0 and 0.8.0. */
  readonly newVersions: readonly string[]
  /** The one version the teaser strip names, or null for no teaser. The NEWEST — one line
   *  saying where you landed, never a list of everything you missed. */
  readonly teaserVersion: string | null
}

/**
 * The whole derivation, and it is a pure function of two values so it can be unit-tested and
 * driven by hand (the DEV variant control writes the store key and nothing else).
 *
 * `lastSeen` is whatever the store held: a version string, or null/undefined/'' for absent.
 */
export function whatsNewState(
  lastSeen: string | null | undefined,
  notes: readonly ReleaseNote[] = RELEASE_NOTES
): WhatsNewState {
  if (typeof lastSeen !== 'string' || lastSeen.trim() === '') {
    return { fresh: true, newVersions: [], teaserVersion: null }
  }
  const newVersions = notes
    .filter((n) => compareVersions(n.version, lastSeen) > 0)
    .map((n) => n.version)
  return { fresh: false, newVersions, teaserVersion: newVersions[0] ?? null }
}

/**
 * The three states the DEV variant control can put an install into (JOS-73's hand-test brief).
 * Pure and derived from the notes themselves, so the buttons never name a version that has been
 * deleted from the list:
 *
 *   'fresh'    — no stored key at all. No teaser, nothing marked.
 *   'previous' — stamped at the release before the newest. One release of news.
 *   'several'  — stamped several back, which is the A→D case the marking exists for.
 *
 * The fourth variant, "reset to real", is not here: it restores the value this session STARTED
 * with, which is a fact about the running app and not about the data.
 */
export type WhatsNewVariant = 'fresh' | 'previous' | 'several'

/** How far back 'several' reaches. Five releases in, so the marking has to hold a list. */
const SEVERAL_BACK = 4

export function variantLastSeen(
  variant: WhatsNewVariant,
  notes: readonly ReleaseNote[] = RELEASE_NOTES
): string | null {
  if (variant === 'fresh' || notes.length === 0) return null
  const idx = variant === 'previous' ? 1 : SEVERAL_BACK
  return notes[Math.min(idx, notes.length - 1)]?.version ?? null
}

// ---------------------------------------------------------------- validity

const VERSION_RE = /^\d+\.\d+\.\d+$/
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const KINDS: readonly string[] = ['new', 'fixed', 'changed']

/**
 * Everything wrong with a notes list, as sentences — [] means it is sound.
 *
 * A function rather than a test body because it has TWO callers that must agree: the unit suite
 * (tests/releaseNotes.test.mts) and the release job's gate (scripts/check-release-notes.mjs).
 * A tag that ships is a tag whose notes passed the same check the suite runs.
 */
export function releaseNotesProblems(notes: readonly ReleaseNote[] = RELEASE_NOTES): string[] {
  const problems: string[] = []
  if (notes.length === 0) problems.push('the notes list is empty')
  notes.forEach((n, i) => {
    if (!VERSION_RE.test(n.version)) problems.push(`${n.version}: not a plain MAJOR.MINOR.PATCH version`)
    if (!DATE_RE.test(n.date)) problems.push(`${n.version}: date "${n.date}" is not YYYY-MM-DD`)
    if (n.entries.length === 0) problems.push(`${n.version}: no entries`)
    for (const e of n.entries) {
      if (e.text.trim() === '') problems.push(`${n.version}: an entry has no text`)
      if (e.kind !== undefined && !KINDS.includes(e.kind)) problems.push(`${n.version}: unknown kind "${e.kind}"`)
      // `fromReport: false` is not a third state — an untagged entry is simply absent, and a
      // stored `false` would read as "we checked and it wasn't a report", which is a claim this
      // file has no way to make. Present means true.
      if (e.fromReport !== undefined && !e.fromReport) {
        problems.push(`${n.version}: fromReport is a flag - set it to true or leave it out`)
      }
    }
    const prev = notes[i - 1]
    if (prev && compareVersions(prev.version, n.version) <= 0) {
      problems.push(`${n.version} must sort strictly below ${prev.version} - the list is newest first`)
    }
  })
  return problems
}
