// shared/phone/limits.ts — every bound this feature has, in one place.
//
// Each one is a NUMBER SOMEBODY CHOSE, and the reason is beside it. They are here rather than
// beside each builder because the room enforces some of them, the desk enforces others and the
// phone page draws against all of them: three readers of one table beats three opinions.

import type { PhoneChannel } from './types'

export const PHONE_LIMITS = {
  /** Rows on a phone meter. Twelve is a full screen at a readable size; below that is the tail. */
  fightMembers: 12,
  /** Named kills a run panel lists. The owner's own Befallen crawl named fourteen over 22 minutes. */
  runNamed: 12,
  /** Key kinds one run pays out. Eleven was that crawl's total across three kinds. */
  runKeys: 8,
  /** Respawn timers. Twenty is more than a camp rotation and less than a scrolling wall. */
  respawns: 20,
  /** Buff rows. Thirty is the game's own buff window twice over. */
  buffs: 30,
  /** The rolling event list. Thirty is an evening. */
  events: 30,
  /** Longest name any row carries. A meter row, not a paragraph (`fightShare.ts`'s number). */
  name: 48,
  /** …and the longest zone name, same reasoning. */
  zone: 64,
  /** …and the longest title or subtitle an event carries (`TOAST_MAX_TEXT`). */
  text: 120
} as const

/**
 * ONE FRAME'S CEILING, in bytes of the WebSocket message.
 *
 * Nothing this app builds comes close - a full `character` envelope is a few kilobytes - so this is
 * the room it has rather than a target. A frame over it is a BUG in the desktop, and the room
 * closes the desk socket rather than absorbing it.
 */
export const PHONE_MAX_FRAME_BYTES = 64 * 1024

/** How many phones may watch one room at once. A fifth is refused, never an eviction. */
export const PHONE_MAX_VIEWERS = 4

/** How many frames per second the room will relay on one channel. Above it, frames are DROPPED. */
export const PHONE_MAX_FRAMES_PER_SEC = 4

/** …the same number as a minimum gap, which is what the room measures and the desk respects. */
export const PHONE_MIN_FRAME_GAP_MS = Math.ceil(1000 / PHONE_MAX_FRAMES_PER_SEC)

/** A room lives this long after its desk last connected (docs/plans/phone-link.md). */
export const PHONE_ROOM_TTL_MS = 30 * 24 * 60 * 60 * 1000

/**
 * HOW OFTEN A CHANNEL IS EVEN RECOMPUTED. A CEILING, not a heartbeat: a channel whose content hash
 * has not moved sends nothing at all, so an idle app is silent and an always-open phone is free.
 *
 * The meter and the timers move continuously and get 2 Hz; everything else moves in steps a person
 * notices at half a second. `character` is on change only - a gear swap is not a cadence.
 */
export const PHONE_CADENCE_MS: Readonly<Record<PhoneChannel, number>> = {
  status: 2000,
  character: 5000,
  fight: 500,
  run: 2000,
  respawns: 2000,
  buffs: 500,
  events: 2000
}
