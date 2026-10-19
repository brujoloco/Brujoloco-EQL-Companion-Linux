// ============================================================================
// shared/phone/types.ts — THE WIRE, AND THE SEVEN THINGS THAT TRAVEL ON IT.
// ============================================================================
//
// docs/plans/phone-link.md is the contract; this file is that contract as types, and it is the
// file phase 2 (the Expo app) imports first. Three rules hold for every file in this folder:
//
//   1. NO DOM, NO NODE, NO ELECTRON, NO REACT. These modules are imported by the Electron main
//      process, by the node test suite, and — next — by React Native. A `window`, a `Buffer` or a
//      `process` here would make one of those three impossible, so there are none.
//   2. EVERY LIST IS BOUNDED, and every bound is a named constant in `./limits.ts`. A phone on a
//      cellular connection is the reader, and an unbounded list is how a raid turns a second
//      screen into a stall.
//   3. NOTHING IS DERIVED THAT THE FOLD DID NOT STATE (world-model law 1). A value the app does
//      not know is ABSENT, never zero.
//
// THE KEYS ARE SHORT ON THE ENVELOPE AND PLAIN INSIDE IT. A frame header rides every 250 ms and is
// one character per field; the payload inside the ciphertext is read by a person writing a view and
// spells its fields out.

/** The protocol generation. It is part of the AAD, so a frame cannot be replayed across a bump. */
export const PHONE_PROTOCOL = 'phone-v1'

/** The seven channels, in the order the desk sends them on a fresh connection. */
export const PHONE_CHANNELS = [
  'status',
  'character',
  'fight',
  'run',
  'respawns',
  'buffs',
  'events'
] as const

export type PhoneChannel = (typeof PHONE_CHANNELS)[number]

/** Is this a channel name this protocol knows? The room and the page both gate on it. */
export function isPhoneChannel(raw: unknown): raw is PhoneChannel {
  return typeof raw === 'string' && (PHONE_CHANNELS as readonly string[]).includes(raw)
}

// ------------------------------------------------------------------------------- the envelope

/**
 * ONE ENCRYPTED FRAME, desk → room → every viewer, relayed verbatim.
 *
 * `n` and `d` are base64url. `d` is `tag ‖ ciphertext` with the tag at a FIXED OFFSET, so a
 * truncated frame fails a length check instead of authenticating a prefix — `syncCrypto.ts`'s rule,
 * for the same reason.
 */
export interface PhoneFrame {
  t: 'f'
  c: PhoneChannel
  /** the desk's per-channel sequence, from 1. Part of the AAD, so it cannot be re-ordered. */
  s: number
  /** the 12-byte AES-GCM nonce, base64url (16 chars) */
  n: string
  /** base64url(tag ‖ ciphertext) */
  d: string
}

/** The room telling the desk how many phones are watching. Drives "Phones connected: N". */
export interface PhoneViewerCount {
  t: 'v'
  n: number
}

/**
 * RESEND EVERYTHING. The room sends this when a viewer attaches and its in-memory cache cannot
 * replay every channel — which is exactly what a hibernation costs. The desk answers by sending
 * the latest frame of every channel it holds, change-hash or no change-hash.
 */
export interface PhoneResend {
  t: 'r'
}

/** A refusal worth narrating. Nothing branches on it today; it exists so the room can say why. */
export interface PhoneError {
  t: 'e'
  code: string
  message: string
}

/** Whether a desk is attached right now — what the phone's "Desk offline" pill reads. */
export interface PhoneDeskPresence {
  t: 'o'
  desk: boolean
}

export type PhoneToDesk = PhoneViewerCount | PhoneResend | PhoneError
export type PhoneToViewer = PhoneFrame | PhoneDeskPresence

// ------------------------------------------------------------------------------- the payloads

/** `status` — who and where, and whether a pull is open. */
export interface PhoneStatus {
  /** epoch ms this was built. The phone's "last update Ns ago" is measured against it. */
  at: number
  name?: string
  server?: string
  level?: number
  classes: string[]
  zone?: string
  inCombat: boolean
  /** the desktop app's version, so a phone can say which build is talking to it */
  app: string
}

/** One combatant on the phone's meter. `fightShare.ts FightShareMember` with the pet flag kept. */
export interface PhoneFightMember {
  name: string
  damage: number
  dps: number
  /** share of `PhoneFight.total`, 0..1 — never a bar fill (the `fightShare.ts` distinction) */
  share: number
  you?: true
  pet?: true
}

/** `fight` — the current pull, or the last one when none is open. */
export interface PhoneFight {
  mob: string
  zone?: string
  /** true while the pull is open; a closed fight stays on screen and says so */
  live: boolean
  durationMs: number
  total: number
  members: PhoneFightMember[]
  /** your own two numbers, lifted out so a tile does not have to find your row */
  you?: { dps: number; share: number }
}

/** `run` — `RunState`, condensed to what a phone screen holds. */
export interface PhoneRun {
  active: boolean
  zone: string
  base: string
  /** the instance difficulty the zone line stated, or one of runTracker's two non-difficulties */
  tier?: number
  startedAt: number
  elapsedMs: number
  kills: number
  groupKills: number
  /** null when there was no stretch to divide by - never a zero somebody stated */
  killsPerMin: number | null
  named: { name: string; at: number }[]
  keys: { name: string; count: number }[]
  chest: { items: number; kept: number; sold: number; merged: number }
  doors: number
  deaths: number
}

/** `respawns` — one timer. `dueAt` is absent when nothing states a duration; then it counts UP. */
export interface PhoneRespawn {
  id: string
  mob: string
  zone: string
  /** the instant the clock counts FROM - a log stamp, never a wall clock */
  baseTs: number
  /** `baseTs + estimateMs`, present only when something stated a duration */
  dueAt?: number
  /** whether the estimate is a custom watch, an observation or the wiki */
  source: string
  /** true once `dueAt` has passed: the window is open and it could be up */
  open: boolean
}

/** `buffs` — one row. `endsAt` present only on a stated duration; otherwise it counts UP. */
export interface PhoneBuff {
  id: string
  name: string
  kind: 'buff' | 'debuff' | 'cc'
  target?: string
  startedTs: number
  /** 'countdown' | 'elapsed' | 'permanent', straight off `BuffTimerRow.mode` */
  mode: string
  endsAt?: number
  /** how many entities hold it, when more than one does */
  count?: number
}

/** `events` — one celebration. The kinds are a CLOSED list; chat is not among them (ruling 5). */
export interface PhoneEvent {
  id: string
  kind: PhoneEventKind
  title: string
  subtitle?: string
  at: number
}

/**
 * WHAT MAY BE AN EVENT. Exactly the kinds `shared/celebrationPost.ts` already posts to Discord,
 * which is the same closed list for the same reason: these are the things worth telling somebody
 * about, and nothing about a conversation is one of them.
 */
export const PHONE_EVENT_KINDS = [
  'levelUp',
  'bossKill',
  'skyQuestComplete',
  'questItem',
  'wishDrop',
  'death'
] as const

export type PhoneEventKind = (typeof PHONE_EVENT_KINDS)[number]

export function isPhoneEventKind(raw: unknown): raw is PhoneEventKind {
  return typeof raw === 'string' && (PHONE_EVENT_KINDS as readonly string[]).includes(raw)
}

// --------------------------------------------------------------------------- what crosses IPC

/**
 * WHAT THE PREFERENCES CARD HOLDS, and the reason it lives in `shared/` rather than beside the
 * preload: the renderer's tsconfig does not include `src/preload`, so a view type declared there
 * would be unreachable from the card that draws it — the `discordChannels.ts` arrangement exactly.
 *
 * NO SECRET IS IN IT. Three booleans and a count. The pair link — which carries the view key — is
 * `PhonePairUrlResult`, answered by its own handler, and only while the pairing dialog is open.
 */
export interface PhoneCardView {
  /** false under `EQ_E2E` and in any build with no origin compiled in */
  available: boolean
  enabled: boolean
  paired: boolean
  connected: boolean
  viewers: number
}

export type PhonePairUrlResult = { ok: true; url: string } | { ok: false; error: string }
