// discovery.ts — where the EverQuest install lives, and what a Logs dir says about it.
//
// 0.2.27: this is the Linux Edition — the Win32 registry sweep and the fixed-drive
// walk left the app. What remains is the manual Settings pick (always wins), the
// env escape hatch, and the Logs-dir predicates.
//
import { readdirSync, statSync } from 'fs'
import { join } from 'path'

export const EQ_ROOT =
  'C:\\Users\\Public\\Daybreak Game Company\\Installed Games\\EverQuest Legends'

// ---------------------------------------------------------------------------
// Pure discovery core (injectable probes → unit-testable without a real disk).
// ---------------------------------------------------------------------------

export interface DiscoveryProbes {
  /** True if `<root>\Logs` exists AND contains at least one `eqlog_*.txt`. */
  hasLogs: (root: string) => boolean
  /** Ordered candidate roots to try (env escape hatch). */
  extraCandidates: () => string[]
  /**
   * Wall-clock CEILING for the whole sweep, in ms (JOS-112). Omitted ⇒ unbounded (the unit
   * tests, whose probes never block). When set, `discoverEqRoot` stops probing candidates once
   * the budget is spent and returns null — a BOUNDED MISS (fall back to "user picks manually")
   * beats an UNBOUNDED HANG. This is the backstop that caps the CUMULATIVE cost, not a
   * per-call interrupt: a single
   * synchronous `readdir` cannot be aborted mid-flight, but the ones AFTER the deadline never run.
   */
  budgetMs?: number
  /** Injectable clock for the ceiling (tests advance it deterministically). Defaults to `Date.now`. */
  now?: () => number
}

/** The character-log filename the game writes: `eqlog_<Char>_<server>.txt`. */
const EQLOG_RE = /^eqlog_.+\.txt$/i

/**
 * THE OUTCOME OF READING A LOGS DIR — three answers, never two (JOS-82).
 *
 * `countCharacterLogs` used to answer `0` for all of "the folder is not there", "the folder is
 * there and holds no character log" and "the OS refused to let me list the folder". The Settings
 * card then printed ONE sentence for all three — *"No character logs (eqlog_*.txt) found here.
 * Make sure EverQuest logging is enabled (/log on)"* — which is actively misleading for the third:
 * the user is looking at their files in Explorer while the app tells them to go turn logging on.
 * A prod reporter on 0.6.3 hit exactly that shape ("I pointed it directly to the log folder and it
 * said there were no character logs in that directory"), and a swallowed `readdir` throw is the
 * only way the app can say that about a folder that demonstrably has logs in it.
 *
 * So the read REPORTS ITS FAILURE. Callers that must keep moving (discovery's predicate) still
 * collapse it to "no", but the surface the user reads gets to say something true.
 */
export type LogsDirRead =
  /** The directory was listed successfully; `count` character logs are in it (possibly 0). */
  | { ok: true; count: number }
  /** The directory does not exist. */
  | { ok: false; reason: 'missing' }
  /** The directory exists but could not be listed — permissions, a dead junction, an offline share. */
  | { ok: false; reason: 'unreadable'; code: string }

/**
 * List a Logs dir and count its `eqlog_*.txt` files, distinguishing a FAILED read from an empty
 * one. `existsSync` is not consulted first: a single `readdirSync` answers both questions and
 * cannot race between them (a dir can vanish between the two calls), and ENOENT is exactly the
 * "missing" answer.
 */
export function readLogsDir(logsDir: string): LogsDirRead {
  try {
    return { ok: true, count: readdirSync(logsDir).filter((f) => EQLOG_RE.test(f)).length }
  } catch (err) {
    const code = (err as NodeJS.ErrnoException | undefined)?.code
    // ENOENT (nothing there) and ENOTDIR (a FILE where a directory was expected) are both
    // "there is no such directory" — neither is a permission story and neither should be
    // reported to the user as one.
    if (code === 'ENOENT' || code === 'ENOTDIR') return { ok: false, reason: 'missing' }
    return { ok: false, reason: 'unreadable', code: code ?? 'UNKNOWN' }
  }
}

/**
 * Does `<root>\Logs` hold at least one character log? The discovery predicate.
 *
 * A dir we cannot read is `false` here on purpose — discovery is a sweep over candidate roots
 * and must keep moving. The honest three-way answer is for the folder the user CHOSE, which is
 * `resolveEqDir`'s business, not the sweep's.
 */
export function rootHasLogs(root: string): boolean {
  const read = readLogsDir(join(root, 'Logs'))
  return read.ok && read.count > 0
}

/** Count the `eqlog_*.txt` files under a Logs dir (0 if the dir is absent or unreadable). */
export function countCharacterLogs(logsDir: string): number {
  const read = readLogsDir(logsDir)
  return read.ok ? read.count : 0
}

/** Does this directory hold an `eqlog_*.txt` DIRECTLY (i.e. is it itself a Logs dir)? */
export function dirHasCharacterLogs(dir: string): boolean {
  return countCharacterLogs(dir) > 0
}

// ---------------------------------------------------------------------------
// MANUAL-OVERRIDE NORMALIZATION — "wherever the user points it" (JOS-53).
//
// The override used to be trusted VERBATIM as the install ROOT, with `Logs` joined onto it.
// Two prod reports on 2026-08-06 (installs 23e958f4… and 88f3835a…) hit the other reading:
// they pointed the picker at their `…\EverQuest Legends\Logs` folder — the folder that
// literally contains the file the app is looking for — and got "no logs detected", because
// we then looked in `…\Logs\Logs`. One of them filed a second report apologizing for
// "total user error". That is the signature of a SILENT WRONG ANSWER: the app resolved a
// path with source 'manual' and characterCount 0 and never said the folder it actually read.
//
// So the seam normalizes instead of trusting. Three shapes a reasonable person picks:
//   * a log FILE (`eqlog_*.txt`)          → its folder is the Logs dir, its parent the root
//   * the `Logs` folder itself            → it is the Logs dir, its parent the root
//   * the install ROOT (a `Logs` subdir)  → unchanged, this is what already worked
// Anything else keeps the old behavior (root as given), and `characterCount` tells the
// Settings pane the truth as it always did.
//
// It is a pure function over injected probes so the whole table is unit-tested against temp
// dirs, and — because it runs at RESOLUTION time, not at save time — an override that was
// already persisted in a broken shape starts working on upgrade with no re-save.
// ---------------------------------------------------------------------------

/** The filesystem questions override normalization asks. Injected → testable. */
export interface OverrideProbes {
  /** Is this an existing directory? */
  isDir: (p: string) => boolean
  /** Is this an existing FILE (as opposed to a directory / nothing)? */
  isFile: (p: string) => boolean
  /** Does this directory hold an `eqlog_*.txt` directly? */
  hasCharacterLogs: (dir: string) => boolean
}

/** The two paths every consumer needs, resolved from one user-supplied path. */
export interface NormalizedEqDir {
  /** The install root (`<root>\Logs` is the log directory). */
  root: string
  /** The directory the `eqlog_*.txt` files actually live in. */
  logsDir: string
}

/**
 * Drop trailing separators — but never turn a drive root (`D:\`) into a bare drive
 * (`D:`), which Windows reads as "the current directory ON D:" and which `join`
 * would happily concatenate into `D:Logs`.
 */
function stripTrailingSep(p: string): string {
  const t = p.replace(/[\\/]+$/, '')
  if (t === '') return p
  return /^[A-Za-z]:$/.test(t) ? `${t}\\` : t
}

/** Index of the last separator of either flavour (paths reach us from store, picker and env). */
function lastSep(p: string): number {
  return Math.max(p.lastIndexOf('\\'), p.lastIndexOf('/'))
}

/** The last path segment, separator- and trailing-slash-tolerant. */
function baseSegment(p: string): string {
  const t = stripTrailingSep(p)
  const cut = lastSep(t)
  return cut < 0 ? t : t.slice(cut + 1)
}

/** The containing directory, separator- and trailing-slash-tolerant. */
function parentDir(p: string): string {
  const t = stripTrailingSep(p)
  const cut = lastSep(t)
  if (cut < 0) return t
  const parent = t.slice(0, cut)
  if (parent === '') return t.slice(0, cut + 1)
  return /^[A-Za-z]:$/.test(parent) ? `${parent}\\` : parent
}

/**
 * Resolve one user-supplied path into `{ root, logsDir }`. See the block comment above for
 * why. The order of the tests is deliberate:
 *   1. a FILE is reasoned about through its containing folder (a picked `eqlog_*.txt`, or
 *      anything else sitting in the install — the folder is the useful part either way);
 *   2. a folder NAMED `Logs` is the log directory (case-insensitive; true even when logging
 *      has never been turned on, which is exactly when it holds no `eqlog_*.txt` to detect);
 *   3. a folder holding a `Logs` SUBDIR is the install root — this is the shape that already
 *      worked and it is tested before the content sniff so the pathological folder that is
 *      both stays interpreted the way it is today;
 *   4. a folder holding `eqlog_*.txt` directly is the log directory whatever it is called;
 *   5. anything else (a typo, an unplugged drive, a folder with neither) keeps the old
 *      behavior — root as given, `<root>\Logs` beneath it.
 */
export function normalizeEqDirOverride(picked: string, probes: OverrideProbes): NormalizedEqDir {
  const path = stripTrailingSep(picked.trim())
  const asRoot = (root: string): NormalizedEqDir => ({ root, logsDir: join(root, 'Logs') })

  const dir = probes.isFile(path) ? parentDir(path) : path
  if (!probes.isDir(dir)) return asRoot(path)
  if (baseSegment(dir).toLowerCase() === 'logs') return { root: parentDir(dir), logsDir: dir }
  if (probes.isDir(join(dir, 'Logs'))) return asRoot(dir)
  if (probes.hasCharacterLogs(dir)) return { root: parentDir(dir), logsDir: dir }
  return asRoot(dir)
}

/** The real-filesystem probe set for `normalizeEqDirOverride`. */
export function realOverrideProbes(): OverrideProbes {
  const stat = (p: string): ReturnType<typeof statSync> | undefined => {
    try {
      return statSync(p, { throwIfNoEntry: false })
    } catch {
      // A path we cannot stat (permissions, a disconnected UNC share) is "not there".
      return undefined
    }
  }
  return {
    isDir: (p) => stat(p)?.isDirectory() ?? false,
    isFile: (p) => stat(p)?.isFile() ?? false,
    hasCharacterLogs: dirHasCharacterLogs
  }
}

/**
 * Normalize a Windows path for comparison: one separator style, no trailing
 * separator, case-folded (NTFS is case-insensitive and the log/override paths
 * reach us from three different sources — the store, a folder picker, readdir).
 */
function normPath(p: string): string {
  return p.replace(/[\\/]+/g, '\\').replace(/\\+$/, '').toLowerCase()
}

/** Is `logPath` a file sitting DIRECTLY in `logsDir` (not merely existing somewhere)? */
export function logIsUnderLogsDir(logPath: string, logsDir: string): boolean {
  const dir = normPath(logsDir)
  const file = normPath(logPath)
  const cut = file.lastIndexOf('\\')
  return cut > 0 && file.slice(0, cut) === dir
}

/**
 * THE ROOT-CHANGE DECISION, pure and injected so it can be tested without a disk.
 *
 * When the effective EQ root moves (the Settings override is set or cleared), may the tail
 * that is already running survive it? ONLY if its log lives under the NEW `Logs` dir and is
 * still there. "The file still exists" is NOT sufficient and was the bug: a user whose game
 * lives off the default path gets auto-discovery pointed somewhere else (or nowhere), and if
 * anything was being tailed from the OLD root its file is still perfectly readable — so the
 * app kept reading it and the folder the user just picked did nothing until a restart.
 */
export function tailSurvivesRootChange(
  logPath: string | null | undefined,
  logsDir: string,
  exists: (p: string) => boolean
): boolean {
  if (!logPath) return false
  return logIsUnderLogsDir(logPath, logsDir) && exists(logPath)
}

/**
 * Pure ordered discovery: return the first candidate root whose `Logs` dir holds
 * an `eqlog_*.txt`, or null if none match. Candidates: `extraCandidates()` (the env
 * escape hatch). Duplicates are collapsed so a candidate is probed at most once.
 */
export function discoverEqRoot(probes: DiscoveryProbes): string | null {
  const now = probes.now ?? Date.now
  // The ceiling is an absolute instant computed once, at entry.
  const deadline = probes.budgetMs === undefined ? Infinity : now() + probes.budgetMs
  const overBudget = (): boolean => now() >= deadline

  const seen = new Set<string>()
  const candidates: string[] = []
  const push = (c: string | undefined | null): void => {
    if (!c) return
    const key = c.replace(/[\\/]+$/, '').toLowerCase()
    if (seen.has(key)) return
    seen.add(key)
    candidates.push(c)
  }

  for (const c of probes.extraCandidates()) push(c)
  for (const c of candidates) {
    // Check BEFORE each probe — the guarantee is "no further probes after the deadline".
    if (overBudget()) return null
    if (probes.hasLogs(c)) return c
  }
  return null
}

// ---------------------------------------------------------------------------
// PERSISTED-ACROSS-LAUNCHES discovery (JOS-112). The pure precedence logic, injected so it is
// unit-testable without a store or a disk — config.ts binds it to electron-store + the real sweep.
// ---------------------------------------------------------------------------

/** What `resolveDiscoveredRoot` needs, all injected → testable without electron-store or fs. */
export interface CachedRootDeps {
  /** The root a PREVIOUS launch persisted, or null if none is stored. */
  persisted: string | null
  /** Revalidate a candidate root — the one `readdir` `rootHasLogs` already does. */
  hasLogs: (root: string) => boolean
  /** Run the full (expensive) discovery sweep — registry subprocesses + the drive walk. */
  sweep: () => string | null
  /** Persist a POSITIVE discovery so the next launch can skip the sweep entirely. */
  persist: (root: string) => void
  /** Drop a persisted root that no longer validates — SELF-HEAL across sessions. */
  dropPersisted: () => void
}

/**
 * Resolve the discovered root with cross-launch persistence, first launch and every re-discovery:
 *
 *   1. a persisted root that STILL passes `hasLogs` (one readdir) wins — the sweep never runs;
 *   2. a persisted root that FAILS revalidation is dropped (self-heal: the install moved or was
 *      uninstalled under us) and we fall through to the sweep;
 *   3. the sweep runs, and ONLY a positive hit is persisted — a null "not found" is NEVER cached,
 *      so a brand-new user who has not run `/log on` yet keeps getting the cheap idle rescan
 *      rather than a sticky negative.
 *
 * This is the ACROSS-SESSIONS extension of config.ts's in-memory invalidate/revalidate pattern.
 */
export function resolveDiscoveredRoot(deps: CachedRootDeps): string | null {
  if (deps.persisted !== null) {
    if (deps.hasLogs(deps.persisted)) return deps.persisted
    deps.dropPersisted()
  }
  const found = deps.sweep()
  if (found !== null) deps.persist(found)
  return found
}

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// (The registry and fixed-drive sweep left with the Windows-only machinery,
// 2026-10-27. Discovery is the env escape hatch plus the user's manual pick;
// reference copies live in ~/eql-companion-upstream-archive.)
// ---------------------------------------------------------------------------
