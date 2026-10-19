// constants.ts — the one host, the one protocol, and the numbers that are somebody's decision.
//
// THE ORIGIN IS COMPILED IN AND THERE IS NO OVERRIDE. `src/main/share/net.ts` keeps the same law
// on the desktop for the same reason: a second-screen app whose server address is a setting is a
// second-screen app somebody can point at their own server. There is no environment variable here,
// no developer menu entry and no field in Settings.

/** The one host this app speaks to (AGENTS.md, "Cloud"). */
export const SHARE_ORIGIN = 'https://share.eqzera.com'

/** …and the socket scheme on it, the way `net.ts wsOriginFor` derives one on the desktop. */
export const WS_ORIGIN = 'wss://share.eqzera.com'

/** The pair link's path. A link that is not exactly this is refused (`pair-link.ts`). */
export const PAIR_PATH = '/phone/'

/** The viewer subprotocol, from docs/plans/phone-link.md. */
export const VIEW_SUBPROTOCOL = 'eqzera.view.v1'

/** One room's viewer socket. */
export function viewSocketUrl(roomId: string): string {
  return `${WS_ORIGIN}/phone/room/${roomId}/view`
}

/**
 * THE RECONNECT LADDER, in milliseconds — byte for byte `src/main/phone/desk.ts BACKOFF_MS`.
 * It stops climbing at a minute, and an open socket resets it.
 */
export const BACKOFF_MS: readonly number[] = [1000, 2000, 5000, 15_000, 30_000, 60_000]

/** Past this, the connection pill says how old the newest frame is (the phase-1 page's number). */
export const STALE_AFTER_MS = 5000

/** Where the app points people. No tracking parameters; these are the plain pages. */
export const LINKS = {
  site: 'https://eqzera.com/',
  guides: 'https://eqzera.com/guides/',
  privacy: 'https://eqzera.com/privacy-mobile/'
} as const
