// ============================================================================
// phone/pair-link.ts — THE ONE STRING THIS APP ACCEPTS.
// ============================================================================
//
// A pair link carries the view key in its fragment (docs/plans/phone-link.md, ruling 6). It is a
// CREDENTIAL, and a parser that is generous about credentials is a vulnerability with good
// manners. So this file accepts exactly one shape and refuses everything else:
//
//     https://share.eqzera.com/phone/#r=<22 base64url>&k=<43 base64url>
//
// …plus the app's own deep link, which is the same fragment on this app's own scheme:
//
//     eqzera://pair#r=<22>&k=<43>
//
// ── WHY IT IS HAND-PARSED AND NOT `new URL()` ──────────────────────────────────────────────────
//
// `new URL()` is available and would work, but every interesting refusal here is about a STRING
// somebody may have crafted — a look-alike host, a userinfo section, a backslash, an embedded
// newline — and URL parsing is a large surface with a history of normalising such things into
// something that then passes a `.host === …` check. A literal prefix comparison against a compiled
// constant has no such history: either the string starts with those exact bytes or it does not.
//
// ── AND WHY THE SHAPES ARE PINNED TO LENGTHS ───────────────────────────────────────────────────
//
// 22 and 43 are what 16 and 32 random bytes are in unpadded base64url, and `src/main/phone/
// crypto.ts` mints exactly those. A `k` of any other length cannot be an AES-256 key, so refusing
// it here is refusing it before it reaches the cipher.

/** The exact prefix of a web pair link. Not a pattern — a constant, compared literally. */
export const WEB_PAIR_PREFIX = 'https://share.eqzera.com/phone/#'

/** …and the app's own. `eqzera://pair#…`, with the same fragment. */
export const APP_PAIR_PREFIX = 'eqzera://pair#'

const ROOM_ID = /^[A-Za-z0-9_-]{22}$/
const VIEW_KEY = /^[A-Za-z0-9_-]{43}$/

/** What a link yields: the two secrets, and nothing else. */
export interface Pairing {
  roomId: string
  viewKey: string
}

/**
 * ONE FRAGMENT'S `r` AND `k`.
 *
 * `&`-separated, order-free, and a key that appears twice is a REFUSAL rather than a last-wins:
 * two values for one field is somebody trying something, not a typo.
 */
export function parseFragment(fragment: string): Pairing | null {
  let roomId: string | null = null
  let viewKey: string | null = null
  for (const part of fragment.split('&')) {
    const eq = part.indexOf('=')
    if (eq < 0) continue
    const name = part.slice(0, eq)
    const value = part.slice(eq + 1)
    if (name === 'r') {
      if (roomId !== null) return null
      roomId = value
    } else if (name === 'k') {
      if (viewKey !== null) return null
      viewKey = value
    }
  }
  if (roomId === null || viewKey === null) return null
  if (!ROOM_ID.test(roomId) || !VIEW_KEY.test(viewKey)) return null
  return { roomId, viewKey }
}

/**
 * A scanned QR, a pasted string or an opened deep link. `null` for anything that is not the one
 * shape — another host, `http:`, a look-alike domain, a wrong path, a query string instead of a
 * fragment, a missing half, a wrong length, or whitespace in the middle of the secret.
 *
 * Leading and trailing whitespace IS forgiven, because a paste from a chat app carries it and a
 * space at the end of a string is not an attack. Whitespace INSIDE is not, because the character
 * classes above have no room for it.
 */
export function parsePairLink(raw: string): Pairing | null {
  if (typeof raw !== 'string') return null
  const text = raw.trim()
  if (text.length === 0 || text.length > 256) return null
  const prefix = text.startsWith(WEB_PAIR_PREFIX)
    ? WEB_PAIR_PREFIX
    : text.startsWith(APP_PAIR_PREFIX)
      ? APP_PAIR_PREFIX
      : null
  if (prefix === null) return null
  return parseFragment(text.slice(prefix.length))
}

/**
 * A room id, as Settings shows one: the first four and the last four, and a middle nobody can
 * reconstruct. It is a public locator rather than a secret — but it is also the only thing on that
 * screen somebody could photograph, and there is no reason to print all 22 characters of it.
 */
export function maskRoomId(roomId: string): string {
  if (roomId.length <= 10) return roomId
  return `${roomId.slice(0, 4)}…${roomId.slice(-4)}`
}
