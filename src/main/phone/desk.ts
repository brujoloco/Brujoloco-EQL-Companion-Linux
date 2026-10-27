// ============================================================================
// phone/desk.ts — THE MACHINE: connect, reconnect, schedule, encrypt, send.
// ============================================================================
//
// Everything this feature does over time lives here, and EVERY IMPURE SEAM IS INJECTED — the
// socket, the clock, the timer, the room's two HTTP calls, the channel payloads and the minting of
// a new pairing. There is no `electron`, no `node:net`, no global `WebSocket` and no `Date.now()`
// in this file. That is what lets `tests/phoneDesk.test.mts` drive the whole state machine — the
// backoff ladder, the rate cap, the change-only rule, the resend nudge, a dark build and an
// unpair — with a fake socket and a fake clock, in milliseconds, deterministically. Every timing
// bug this feature can have is a timing bug that suite can stage.
//
// ── THREE RULES THE SCHEDULER KEEPS ────────────────────────────────────────────────────────────
//
//  1. A FRAME IS SENT ONLY WHEN THE CONTENT HASH MOVED (shared/phone/index.ts `contentHash`). An
//     idle app sends nothing at all, which is what makes leaving the phone open all evening free.
//  2. THE CADENCE IS A CEILING, NEVER A HEARTBEAT. `PHONE_CADENCE_MS` says how often a channel is
//     even recomputed; a channel that has not moved is not sent however often it is looked at.
//  3. A FRAME INSIDE THE RATE GAP IS DROPPED, NOT QUEUED. A meter frame that arrives late is worse
//     than one that never arrives, and a queue is how a slow reader becomes a memory leak. The room
//     enforces the same number from its side, so the cap holds even against a buggy desk.
//
// ── AND ONE RULE ABOUT THE ROOM ────────────────────────────────────────────────────────────────
//
// The desk NEVER creates a room it was not asked to. `start()` creates one if the pairing has never
// been registered, and after that a reconnect is only ever a socket — a service outage must not
// mint rooms. `unpairAll()` is the one path that deletes and re-mints, and it does both (ruling 3).

import { PHONE_SEND_ORDER, buildPhoneChannels, contentHash } from '../../shared/phone'
import { PHONE_CADENCE_MS, PHONE_MIN_FRAME_GAP_MS } from '../../shared/phone/limits'
import type { PhoneChannel, PhoneFrame } from '../../shared/phone/types'
import { encryptFrame, mintPairing, type PhonePairing } from './crypto'
import { parseRoomMessage } from './protocol'

/** The subprotocol the desk offers first; its partner is the desk token (phone-link.md). */
export const DESK_SUBPROTOCOL = 'eqzera.desk.v1'

/** The reconnect ladder, in milliseconds. It stops climbing at a minute. */
export const BACKOFF_MS: readonly number[] = [1000, 2000, 5000, 15_000, 30_000, 60_000]

/** How often the scheduler looks at the channels. The rate gap, so it can never outrun the cap. */
export const TICK_MS = PHONE_MIN_FRAME_GAP_MS

/** A socket, as this file uses one. Implemented over the platform `WebSocket` by `index.ts`. */
export interface DeskSocket {
  send: (data: string) => void
  close: () => void
}

/** What the desk wants to be told about a socket. All four are called at most once per socket. */
export interface DeskSocketHandlers {
  onOpen: () => void
  onMessage: (data: string) => void
  onClose: () => void
}

/** Cancels a scheduled callback. `setTimer` answers one; the desk never holds a raw handle. */
export type Cancel = () => void

export interface DeskDeps {
  /** Open a socket. A factory that throws is treated exactly as a socket that closed. */
  socket: (url: string, protocols: string[], handlers: DeskSocketHandlers) => DeskSocket
  now: () => number
  setTimer: (fn: () => void, ms: number) => Cancel
  /** The wss URL for a room, or '' in a dark build - which is what stops a connection existing. */
  socketUrl: (roomId: string) => string
  /** Register the pairing with the service. Resolves true when the room exists afterwards. */
  createRoom: (pairing: PhonePairing) => Promise<boolean>
  /** Delete it. Never throws; an unpair that could not reach the service still rotates locally. */
  deleteRoom: (pairing: PhonePairing) => Promise<void>
  /** The seven payloads as they stand right now (shared/phone `buildPhoneChannels`). */
  channels: () => ReturnType<typeof buildPhoneChannels>
  /** Persist a rotated pairing. Called by `unpairAll` before the new room is created. */
  savePairing: (pairing: PhonePairing) => void
  /** A fresh triple. Injected so a test can make the rotation observable. */
  mint?: () => PhonePairing
}

/** What the Preferences card reads. No secret is in it - see `src/main/ipc/phone.ts`. */
export interface DeskState {
  paired: boolean
  connected: boolean
  viewers: number
}

interface ChannelState {
  seq: number
  hash: string
  sentAt: number
}

/** One channel's bookkeeping, fresh. `seq` starts at 0 and the first frame is 1. */
function freshChannel(): ChannelState {
  return { seq: 0, hash: '', sentAt: 0 }
}

export interface Desk {
  start: (pairing: PhonePairing) => Promise<void>
  stop: () => void
  unpairAll: (current: PhonePairing | null) => Promise<PhonePairing>
  state: () => DeskState
  /** Run one scheduler pass now. The tick calls it; tests call it directly. */
  pump: () => void
}

/** Everything one desk holds. An object rather than closure variables so the scheduler below can
 *  live at module scope, where it is readable and inside the repo's function-length ceiling. */
interface DeskRuntime {
  deps: DeskDeps
  pairing: PhonePairing | null
  socket: DeskSocket | null
  connected: boolean
  viewers: number
  attempt: number
  stopped: boolean
  channels: Map<PhoneChannel, ChannelState>
}

/** The three facts the Preferences card reads. */
function deskState(rt: DeskRuntime): DeskState {
  return { paired: rt.pairing !== null, connected: rt.connected, viewers: rt.viewers }
}

/** Send one channel's frame, encrypted, and record what was sent. */
function emit(rt: DeskRuntime, channel: PhoneChannel, next: { payload: unknown; hash: string }, at: number): void {
  const key = rt.pairing
  const live = rt.socket
  if (!key || !live) return
  const held = rt.channels.get(channel) ?? freshChannel()
  const seq = held.seq + 1
  const sealed = encryptFrame(key.viewKey, channel, seq, next.payload)
  const frame: PhoneFrame = { t: 'f', c: channel, s: seq, n: sealed.n, d: sealed.d }
  live.send(JSON.stringify(frame))
  rt.channels.set(channel, { seq, hash: next.hash, sentAt: at })
}

/**
 * ONE SCHEDULER PASS. Rules 1-3 of the header, in seven lines.
 *
 * `force` is the resend nudge (`{"t":"r"}`): the room lost its cache to a hibernation and a viewer
 * just attached, so every channel goes out whether or not its hash moved. The RATE GAP still holds
 * even then - a forced resend must not be a way past the cap.
 */
function pass(rt: DeskRuntime, force: boolean): void {
  if (!rt.connected) return
  const at = rt.deps.now()
  const built = rt.deps.channels()
  for (const channel of PHONE_SEND_ORDER) {
    const held = rt.channels.get(channel) ?? freshChannel()
    const gap = force ? PHONE_MIN_FRAME_GAP_MS : Math.max(PHONE_MIN_FRAME_GAP_MS, PHONE_CADENCE_MS[channel])
    if (held.sentAt !== 0 && at - held.sentAt < gap) continue
    const payload = built[channel]
    const hash = contentHash(channel, payload)
    if (!force && hash === held.hash) continue
    emit(rt, channel, { payload, hash }, at)
  }
}

/**
 * THE DESK. One at a time per process; `index.ts` owns the single instance.
 *
 * Deliberately a closure rather than a class: every piece of state below is private by
 * construction, and the only things that can move it are the seven functions returned.
 */
export function createDesk(deps: DeskDeps): Desk {
  const rt: DeskRuntime = {
    deps,
    pairing: null,
    socket: null,
    connected: false,
    viewers: 0,
    attempt: 0,
    stopped: true,
    channels: new Map()
  }
  let registered = false
  let cancelTick: Cancel | null = null
  let cancelRetry: Cancel | null = null

  const onRoomMessage = (data: string): void => {
    const message = parseRoomMessage(data)
    if (!message) return
    if (message.t === 'v') rt.viewers = message.n
    if (message.t === 'r') pass(rt, true)
  }

  /** The socket closed, for any reason. Climb the ladder and try again - unless we were stopped. */
  const onClosed = (): void => {
    rt.socket = null
    rt.connected = false
    rt.viewers = 0
    if (rt.stopped || !rt.pairing) return
    const wait = BACKOFF_MS[Math.min(rt.attempt, BACKOFF_MS.length - 1)]
    rt.attempt += 1
    cancelRetry?.()
    cancelRetry = deps.setTimer(connect, wait)
  }

  function connect(): void {
    const key = rt.pairing
    if (rt.stopped || !key || rt.socket) return
    const url = deps.socketUrl(key.roomId)
    // A DARK BUILD HAS NO URL, and that is the whole of its darkness: there is no branch here that
    // decides not to connect, there is simply nothing to connect to (src/main/share/net.ts).
    if (url === '') return
    try {
      rt.socket = deps.socket(url, [DESK_SUBPROTOCOL, key.deskToken], {
        onOpen: () => {
          rt.connected = true
          rt.attempt = 0
          // A FRESH SOCKET IS A FRESH ROOM as far as the cache is concerned: the room it reconnected
          // to holds nothing of the old session, so every channel goes out once.
          rt.channels.clear()
          pass(rt, true)
        },
        onMessage: onRoomMessage,
        onClose: onClosed
      })
    } catch {
      rt.socket = null
      onClosed()
    }
  }

  const start = async (next: PhonePairing): Promise<void> => {
    rt.stopped = false
    if (rt.pairing?.roomId !== next.roomId) registered = false
    rt.pairing = next
    rt.channels.clear()
    rt.attempt = 0
    if (!registered) registered = await deps.createRoom(next)
    if (!registered) return
    connect()
    cancelTick?.()
    cancelTick = deps.setTimer(function tick() {
      pass(rt, false)
      cancelTick = deps.setTimer(tick, TICK_MS)
    }, TICK_MS)
  }

  const stop = (): void => {
    rt.stopped = true
    cancelTick?.()
    cancelRetry?.()
    cancelTick = null
    cancelRetry = null
    rt.socket?.close()
    rt.socket = null
    rt.connected = false
    rt.viewers = 0
  }

  /**
   * UNPAIR ALL PHONES (ruling 3). Both ids rotate, so every link and every photographed QR code
   * already out there is dead — not stale, dead: the old room is deleted, which closes the sockets
   * on it, and the new key would not open its frames even if it were not.
   *
   * The delete is best-effort and the rotation is not: a service this app cannot reach must never
   * be the reason a user who pressed Unpair keeps a working link on their machine.
   */
  const unpairAll = async (current: PhonePairing | null): Promise<PhonePairing> => {
    if (current) await deps.deleteRoom(current)
    stop()
    const next = (deps.mint ?? mintPairing)()
    rt.pairing = null
    registered = false
    deps.savePairing(next)
    await start(next)
    return next
  }

  return {
    start,
    stop,
    unpairAll,
    state: () => deskState(rt),
    pump: () => {
      pass(rt, false)
    }
  }
}
