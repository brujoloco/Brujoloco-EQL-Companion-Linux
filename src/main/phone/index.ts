// ============================================================================
// phone/index.ts — the WIRED half of the phone link (desk.ts holds every decision).
// ============================================================================
//
// One desk per process, built here with the real seams: the platform `WebSocket`, `Date.now`, a
// real timer, the store, and the two HTTP calls that claim and release a room. Everything with a
// consequence lives in `desk.ts` and is driven by `tests/phoneDesk.test.mts` with fakes; this file
// is the composition, and it is deliberately short enough to read as one.
//
// ── THE OUTBOUND LAW IS UNCHANGED (AGENTS.md, "Cloud") ─────────────────────────────────────────
//
// One host, compiled in (`share/net.ts`), POST from main only, no user-configurable override, dark
// under `EQ_E2E`. The one thing this feature adds is a SCHEME: `wsOriginFor` swaps `https:` for
// `wss:` on the origin that module already decided, so a socket can only ever name the host the
// share links name. An empty origin - which every e2e build has - means `phoneDeskSocketUrl`
// answers '' and there is nothing to connect to, so the darkness is structural rather than a branch.
//
// ── AND THE RENDERER STILL HOLDS NO SECRET ─────────────────────────────────────────────────────
//
// `state()` carries three booleans and a count. `pairUrl()` is the ONE function that returns the
// key, it returns it inside the link (which is what a pair link is), and `src/main/ipc/phone.ts`
// only calls it for the pairing dialog. Nothing here logs a URL, a token or a key.

import { app } from 'electron'
import { E2E } from '../e2e'
import { logError } from '../errorLog'
import {
  phoneDeskSocketUrl,
  phoneEndpointConfigured,
  phonePairUrl,
  phoneRoomUrl,
  phoneRoomsUrl,
  shareRequest
} from '../share/net'
import { phoneEnabled, phonePairing, setPhoneEnabled, setPhonePairing } from '../storePhone'
import { mintPairing, sha256Hex, type PhonePairing } from './crypto'
import { createDesk, type Desk, type DeskSocket, type DeskSocketHandlers, type DeskState } from './desk'
import { phoneChannels, startPhoneSnapshots, stopPhoneSnapshots } from './snapshots'

/** What the Preferences card reads. `available` is false in a dark build - the card says so. */
export interface PhoneStateView extends DeskState {
  available: boolean
  enabled: boolean
}

/**
 * THE E2E PAIRING SEAM, and exactly what it does and does not do.
 *
 * `tests/e2e/phone-pair.e2e.mts` has to assert on a real pair link — the QR code's modules and the
 * link's own shape are the product, and a spec that could not see them would be asserting that a
 * button exists. But a headless run must never reach the network, so `SHARE_ORIGIN` is empty under
 * `EQ_E2E` and every URL built from it is empty with it.
 *
 * `EQ_PHONE_E2E=1` is read ONLY when `EQ_E2E` is also set, and it moves exactly two things: the
 * card's `available` flag, and the TEXT of the pair link. IT DOES NOT MAKE A SOCKET POSSIBLE —
 * `phoneDeskSocketUrl` is still built from the empty origin and still answers '', so there is
 * nothing to connect to, which is the same structural darkness every other outbound feature has.
 * Neither does it make a room: `createRoom` posts at the empty origin and fails, which is why the
 * seam also skips starting the desk at all.
 */
const E2E_PAIR = E2E && process.env.EQ_PHONE_E2E === '1'

/** The origin the seam's pair link is spelled with - a placeholder for the test; `.invalid` is unresolvable by construction. */
const E2E_PAIR_ORIGIN = 'https://share.invalid'

let desk: Desk | null = null

/** The platform socket, wrapped to the two methods `desk.ts` uses. Node 22+ has this global. */
function openSocket(url: string, protocols: string[], handlers: DeskSocketHandlers): DeskSocket {
  const ws = new WebSocket(url, protocols)
  ws.addEventListener('open', () => {
    handlers.onOpen()
  })
  ws.addEventListener('message', (event: MessageEvent) => {
    if (typeof event.data === 'string') handlers.onMessage(event.data)
  })
  ws.addEventListener('close', () => {
    handlers.onClose()
  })
  // An error is always followed by a close on a WebSocket, so there is nothing to do here beyond
  // not letting it become an unhandled event.
  ws.addEventListener('error', () => {
    /* the close handler is the one that matters */
  })
  return {
    send: (data) => {
      ws.send(data)
    },
    close: () => {
      ws.close()
    }
  }
}

/** Claim the room id. The body carries the token's DIGEST; the token itself never leaves. */
async function createRoom(pairing: PhonePairing): Promise<boolean> {
  const attempt = await shareRequest({ fetch: (...a) => globalThis.fetch(...a) }, 'POST', phoneRoomsUrl(), {
    body: { roomId: pairing.roomId, deskTokenHash: sha256Hex(pairing.deskToken) }
  })
  // 409 means this id is already claimed - which, for an id this machine minted and stored, means
  // it was claimed by THIS pairing on an earlier launch. That is a success, not a collision.
  return attempt.status === 201 || attempt.status === 409
}

async function deleteRoom(pairing: PhonePairing): Promise<void> {
  await shareRequest(
    { fetch: (...a) => globalThis.fetch(...a) },
    'DELETE',
    phoneRoomUrl(pairing.roomId),
    { token: pairing.deskToken }
  )
}

function instance(): Desk {
  desk ??= createDesk({
    socket: openSocket,
    now: () => Date.now(),
    setTimer: (fn, ms) => {
      const id = setTimeout(fn, ms)
      id.unref?.()
      return () => {
        clearTimeout(id)
      }
    },
    socketUrl: phoneDeskSocketUrl,
    createRoom,
    deleteRoom,
    channels: phoneChannels,
    savePairing: (pairing) => {
      setPhonePairing(pairing)
    }
  })
  return desk
}

/** The pairing this install uses, minting and storing one the first time it is asked. */
function ensurePairing(): PhonePairing {
  const held = phonePairing()
  if (held) return held
  const next = mintPairing()
  setPhonePairing(next)
  return next
}

export function phoneState(): PhoneStateView {
  const live = desk?.state() ?? { paired: false, connected: false, viewers: 0 }
  return {
    available: phoneEndpointConfigured() || E2E_PAIR,
    enabled: phoneEnabled(),
    paired: phonePairing() !== null,
    connected: live.connected,
    viewers: live.viewers
  }
}

/** Switch it on: mint a pairing if there is none, start the snapshot beats, connect. */
export async function enablePhone(): Promise<PhoneStateView> {
  setPhoneEnabled(true)
  if (E2E_PAIR) {
    // The seam: a pairing exists so the dialog has a link to draw, and nothing else happens.
    ensurePairing()
    return phoneState()
  }
  if (!phoneEndpointConfigured()) return phoneState()
  startPhoneSnapshots(app.getVersion())
  try {
    await instance().start(ensurePairing())
  } catch (err) {
    logError('main:phone', err)
  }
  return phoneState()
}

/** Switch it off. The PAIRING SURVIVES (storePhone.ts says why); only the socket and beats stop. */
export function disablePhone(): PhoneStateView {
  setPhoneEnabled(false)
  desk?.stop()
  stopPhoneSnapshots()
  return phoneState()
}

/**
 * THE PAIR LINK — the one value in this feature that carries the key, and the only function that
 * hands it out. `src/main/ipc/phone.ts` calls it for the pairing dialog and nothing else does.
 */
export function phonePairLink(): string {
  const held = phoneEnabled() ? ensurePairing() : phonePairing()
  if (!held) return ''
  if (E2E_PAIR) return `${E2E_PAIR_ORIGIN}/phone/#r=${held.roomId}&k=${held.viewKey}`
  return phonePairUrl(held.roomId, held.viewKey)
}

/** Unpair all phones (ruling 3): both ids rotate, so every link already handed out is dead. */
export async function unpairAllPhones(): Promise<PhoneStateView> {
  const held = phonePairing()
  if (E2E_PAIR || !phoneEnabled()) {
    // No desk to rotate through - delete the room and mint a fresh pairing here. (Under the e2e
    // seam the delete cannot reach anything, which is the point of the seam.)
    if (held && !E2E_PAIR) await deleteRoom(held)
    setPhonePairing(mintPairing())
    return phoneState()
  }
  try {
    await instance().unpairAll(held)
  } catch (err) {
    logError('main:phone', err)
  }
  return phoneState()
}

/**
 * WIRE IT UP. Called once from the composition root, after the store is open.
 *
 * NEVER UNDER `EQ_E2E`, and never when the switch is off: the origin is already dark in a headless
 * run (`share/net.ts`), so this only means the harness does not also spend a timer proving it.
 */
export function initPhone(): void {
  if (E2E || !phoneEnabled()) return
  void enablePhone()
}

/** Stop everything (app quit). Idempotent, and a no-op on a launch that never armed. */
export function stopPhone(): void {
  desk?.stop()
  stopPhoneSnapshots()
}
