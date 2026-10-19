// ============================================================================
// shared/phone/index.ts — ALL SEVEN CHANNELS FROM ONE BUNDLE, AND "HAS IT CHANGED?"
// ============================================================================
//
// The desk's scheduler (src/main/phone/desk.ts) asks this file two questions and nothing else:
// what does channel X say right now, and is that different from what I last sent? Keeping both
// answers HERE rather than in main is what makes the whole change-detection rule testable without
// a socket, a clock or an Electron process — and it is what phase 2 re-uses: a React Native app
// building the same views off the same relay needs exactly these two functions.
//
// ── WHY A CHANGE HASH AND NOT A DIFF ───────────────────────────────────────────────────────────
//
// A diff would be smaller on the wire and much larger everywhere else: the phone would need to hold
// and patch state per channel, a dropped frame would desynchronise it silently, and the replay a
// viewer gets on attach would have to be a synthesised full state anyway. A whole small object per
// change is the shape that survives a dropped frame, a reconnect, a hibernation and a second
// viewer joining mid-fight — all four of which happen — so the only thing worth optimising is HOW
// OFTEN one is sent, which is what the hash decides.
//
// ── AND WHY THE HASH IGNORES SOME FIELDS ───────────────────────────────────────────────────────
//
// `status.at` moves every time it is built, `run.elapsedMs` moves every second the run is open, and
// `respawns[].open` flips on a clock rather than on a fact. Hashing them would make every channel
// change on every tick and the "an idle app sends nothing" promise would be false. They are all
// derivable on the phone from a stamp that is already in the payload, so `stableOf` blanks them
// before hashing and they ride along for the reader's convenience.

import { canonicalJson } from '../shareSchema'
import type { CharacterProfileShare } from '../characterShare'
import type { BuffTimersSnap } from '../buffTimers'
import type { BuffsSnap } from '../buffTypes'
import type { CharacterSnap } from '../characterTypes'
import type { CombatSnapshot } from '../combat'
import type { RespawnSnap } from '../respawn'
import type { RunState } from '../runTracker'
import {
  phoneBuffs,
  phoneEvents,
  phoneFight,
  phoneRespawns,
  phoneRun,
  phoneStatus,
  type PhoneEventInput
} from './views'
import { PHONE_CHANNELS, type PhoneChannel, type PhoneRespawn, type PhoneRun, type PhoneStatus } from './types'

// NO `export *` BARREL HERE, deliberately. Under the node test runner's TypeScript loader a star
// re-export of a sibling `.ts` module resolves to nothing (MEASURED: `PHONE_CHANNELS` was simply
// absent from this module's namespace), which would make every import site a coin flip between
// working and a runtime `SyntaxError`. Every consumer names the file it wants — `./types`,
// `./limits`, `./views` — and this module exports only what it defines itself.

/** Everything the seven builders need, gathered once per tick by `src/main/phone/snapshots.ts`. */
export interface PhoneSources {
  /** the instant this bundle describes. Handed in, never read - these modules are pure. */
  at: number
  /** the desktop app's version */
  app: string
  who: CharacterSnap | null
  classes: readonly string[]
  level?: number
  combat: CombatSnapshot | null
  run: RunState
  respawn: RespawnSnap | null
  buffs: BuffsSnap | null
  timers: BuffTimersSnap | null
  events: readonly PhoneEventInput[]
  /** built main-side (the item corpus lives there), or null when there is no inventory dump */
  character: CharacterProfileShare | null
}

/** One channel's payload. `null` is a STATE the phone draws ("no fight yet"), never an absence. */
export type PhonePayload = unknown

/** Every channel, built. A channel whose payload is `null` still travels: no fight IS the news. */
export function buildPhoneChannels(src: PhoneSources): Record<PhoneChannel, PhonePayload> {
  return {
    status: phoneStatus({
      who: src.who,
      classes: src.classes,
      inCombat: src.combat?.inCombat === true,
      app: src.app,
      at: src.at,
      ...(src.level === undefined ? {} : { level: src.level })
    }),
    character: src.character,
    fight: phoneFight(src.combat),
    run: phoneRun(src.run, src.at),
    respawns: phoneRespawns(src.respawn, src.at),
    buffs: phoneBuffs(src.buffs, src.timers),
    events: phoneEvents(src.events)
  }
}

/** The payload with its clock-driven fields blanked — see the header for which and why. */
export function stableOf(channel: PhoneChannel, payload: PhonePayload): PhonePayload {
  if (payload === null) return null
  if (channel === 'status') return { ...(payload as PhoneStatus), at: 0 }
  if (channel === 'run') return { ...(payload as PhoneRun), elapsedMs: 0, killsPerMin: 0 }
  if (channel === 'respawns' && Array.isArray(payload)) {
    return (payload as PhoneRespawn[]).map((row) => ({ ...row, open: false }))
  }
  return payload
}

/**
 * A short, stable digest of one channel's meaningful content.
 *
 * TWO FNV-1a PASSES with different seeds, concatenated: one 32-bit hash over a JSON document is a
 * collision every few billion comparisons, and a collision here means a frame that is never sent.
 * Two independent passes make that a number nobody will meet; it is still a hash rather than a
 * comparison because the alternative is holding a deep copy of seven payloads and walking them.
 */
export function contentHash(channel: PhoneChannel, payload: PhonePayload): string {
  const text = canonicalJson(stableOf(channel, payload))
  return `${fnv(text, 0x811c9dc5)}${fnv(text, 0x9dc5811c)}`
}

function fnv(text: string, seed: number): string {
  let h = seed
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(36).padStart(7, '0')
}

/** The seven channels in send order: identity first, then the things that move. */
export const PHONE_SEND_ORDER: readonly PhoneChannel[] = PHONE_CHANNELS
