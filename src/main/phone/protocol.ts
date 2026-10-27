// phone/protocol.ts — what the room may say to the desk, and nothing else.
//
// PURE, and it is the trust boundary in the inbound direction. The desk connects OUT to a service
// this app compiled the address of, but the bytes that come back are still bytes off a socket: a
// message is REBUILT field by field from a closed set of shapes, and anything that is not one of
// them is `null`. There is no path from a room's reply into a JSON object the desk then reads
// properties off - the same discipline `share/links.ts` keeps about a fetched envelope.
//
// The room cannot ask the desk for anything (ruling 4 runs in this direction too): the three
// shapes are a viewer count, a resend nudge and a refusal, and none of them carries data.

import type { PhoneToDesk } from '../../shared/phone/types'

/** Longest message the room can possibly send. A viewer count is 12 bytes; this is slack. */
const MAX_MESSAGE_CHARS = 2048

/** The most viewers a count may claim. Anything above the room's own cap is clamped, not trusted. */
const MAX_VIEWERS = 64

/** A bounded JSON object, or null. Nothing past this point can throw. */
function objectOf(raw: unknown): Record<string, unknown> | null {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > MAX_MESSAGE_CHARS) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(raw) as unknown
  } catch {
    return null
  }
  return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null
}

/** The viewer count, CLAMPED rather than trusted - the room's own cap is not this desk's to assume. */
function viewerCount(raw: unknown): PhoneToDesk | null {
  if (typeof raw !== 'number' || !Number.isFinite(raw) || raw < 0) return null
  return { t: 'v', n: Math.min(Math.floor(raw), MAX_VIEWERS) }
}

/** One room → desk message, rebuilt, or null for anything this desk does not understand. */
export function parseRoomMessage(raw: unknown): PhoneToDesk | null {
  const message = objectOf(raw)
  if (!message) return null
  if (message.t === 'v') return viewerCount(message.n)
  if (message.t === 'r') return { t: 'r' }
  if (message.t !== 'e') return null
  return {
    t: 'e',
    code: typeof message.code === 'string' ? message.code.slice(0, 32) : 'unknown',
    message: typeof message.message === 'string' ? message.message.slice(0, 200) : ''
  }
}
