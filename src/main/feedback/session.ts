// session.ts — the LIVE half of the feedback feature: the dialog's session facts and
// attachment previews. (The wire half — sendReport/submitFeedback, the offline queue,
// the presigned uploads — left with the dead sending machinery, 0.2.30. Reference copy:
// ~/eql-companion-upstream-archive.)

import { app } from 'electron'
import { basename } from 'node:path'
import { release } from 'node:os'
import { CHANNEL } from '../channel'
import { resolveActiveCharacter } from '../log/config'
import { findOutputFile } from '../outputs/discovery'
import { getUpdateChannel } from '../store'
import type { FeedbackEnv } from '../../shared/feedback'
import type { AchievementsResult } from './achievements'
import type { InventoryResult } from './inventory'
import { buildInventoryAttachment } from './inventory'
import { buildAchievementsAttachment } from './achievements'
import { feedbackPerfBlock } from './perf'
import { buildSlice, type FeedbackSlice } from './slice'

export async function feedbackEnv(): Promise<FeedbackEnv> {
  const perf = await feedbackPerfBlock()
  return {
    appVersion: app.getVersion(),
    // 'e2e' is not a legal tag and can never be sent: the guard in `submitFeedback` fires first.
    channel: CHANNEL === 'prod' ? 'prod' : 'dev',
    updateChannel: getUpdateChannel(),
    platform: process.platform,
    osRelease: release(),
    arch: process.arch,
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
    // OMITTED, not null, when the rings are empty — an empty attachment is not an attachment
    // (slice.ts's rule, one artifact over), and absent is the spelling the validator reads.
    ...(perf === null ? {} : { perf })
  }
}

// ---- the session slice cache ------------------------------------------------------------------

/**
 * ONE built slice is cached per (log file, window) for the lifetime of the process, so the
 * bytes the user PREVIEWED, the bytes "Save a copy…" writes and the bytes that are uploaded
 * are the same bytes. Rebuilding at Send time would make the preview a claim about something
 * else — and the promise this feature makes is "you see exactly what is sent".
 */
let cacheKey = ''
let cacheValue: FeedbackSlice | null = null

/** The active character's log + name, or null on a machine with no EQ logs at all. */
export function activeLog(): { logPath: string; selfName: string } | null {
  const c = resolveActiveCharacter()
  return c === null ? null : { logPath: c.logPath, selfName: c.name }
}

/** Build (and cache for this session) a scrubbed slice. Null when no character log resolves. */
export async function cachedSlice(windowMinutes: number): Promise<FeedbackSlice | null> {
  const src = activeLog()
  if (src === null) return null
  const key = `${src.logPath}|${windowMinutes}`
  if (key === cacheKey) return cacheValue
  const slice = await buildSlice({ ...src, windowMinutes })
  cacheKey = key
  cacheValue = slice
  return slice
}

// ---- the inventory dump (JOS-296) ---------------------------------------------------------

/**
 * The active character's dump, or the reason there is none. The RESOLUTION lives here rather
 * than in `inventory.ts` because it needs the registry (which needs `effectiveEqRoot`, which
 * needs Electron) — the packaging half stays pure and path-parameterized, exactly like the
 * slicer's split between `slice.ts` and this file's `activeLog`.
 *
 * `findOutputFile` is the ONE resolver: it prefers `<Character>_<server>-Inventory.txt` and
 * falls back to the newest matching file, which is what a one-character machine always has. No
 * path rule is re-derived here; if the Settings override moves the EQ root, this moves with it.
 */
export function activeInventoryPath(): { path: string; fileName: string } | null {
  const c = resolveActiveCharacter()
  const path = findOutputFile('inventory', c?.name, c?.server)
  return path === null ? null : { path, fileName: basename(path) }
}

/**
 * The same resolution for the achievements dump (JOS-441). `findOutputFile` is kind-parameterized
 * and the `achievements` kind has been `supported` with a VERIFIED filename suffix since JOS-429,
 * so the kind literal is the only thing that differs — no path rule is re-derived here either.
 */
export function activeAchievementsPath(): { path: string; fileName: string } | null {
  const c = resolveActiveCharacter()
  const path = findOutputFile('achievements', c?.name, c?.server)
  return path === null ? null : { path, fileName: basename(path) }
}

/**
 * There is deliberately NO CACHE here, and that is the opposite call from `cachedSlice`.
 *
 * A slice is cached because the promise is "you see exactly what is sent": the bytes previewed,
 * the bytes saved and the bytes uploaded have to be one artifact, and rebuilding at Send time
 * would silently change the subject. A dump makes a DIFFERENT promise — it is the CURRENT export
 * — and it is a ~10 KB file whose whole point is that the player may re-run `/outputfile
 * inventory` mid-report to attach a fresh one (`outputs/registry.ts` states the same rule for the
 * same reason: "a cache would answer with the state from before they typed the command"). The
 * preview re-reads, and so does Send; the freshness stamp in the metadata is what makes the two
 * comparable.
 */
export async function currentInventory(): Promise<InventoryResult> {
  const found = activeInventoryPath()
  if (found === null) return { ok: false, reason: 'no-dump' }
  return await buildInventoryAttachment(found.path, found.fileName)
}

/**
 * The achievements dump, on the same no-cache terms and for the same reason — with one difference
 * of degree: on THIS attachment, re-running the command mid-report is the likely case rather than
 * the edge one, because the dialog's own hint is what tells a player the command exists.
 */
export async function currentAchievements(): Promise<AchievementsResult> {
  const found = activeAchievementsPath()
  if (found === null) return { ok: false, reason: 'no-dump' }
  return await buildAchievementsAttachment(found.path, found.fileName)
}
