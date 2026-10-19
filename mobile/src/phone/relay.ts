// ============================================================================
// phone/relay.ts — THE VIEWER SOCKET: connect, reconnect, decrypt, hand over.
// ============================================================================
//
// `src/main/phone/desk.ts` for the other end of the same wire, and the same construction: EVERY
// IMPURE SEAM IS INJECTED — the socket, the clock, the timer. There is no `WebSocket`, no
// `Date.now()` and no `setTimeout` in this file, which is what lets `relay.test.ts` drive the
// backoff ladder, a background/foreground cycle, a replayed frame and a desk going offline with a
// fake socket and fake timers, deterministically, in milliseconds.
//
// ── FOUR RULES ─────────────────────────────────────────────────────────────────────────────────
//
//  1. THE LADDER IS THE DESK'S LADDER (`BACKOFF_MS`), and an OPEN socket resets it. A phone and a
//     desktop reconnecting to the same relay should not have two opinions about how patient to be.
//  2. THE SOCKET FOLLOWS THE FOREGROUND. Backgrounded, it closes and the retry is cancelled: a
//     live meter in a pocket is a battery bug. Foregrounded, it connects AT ONCE with no ladder
//     wait — the person is looking at the screen, and a 60-second wait they can see is a bug.
//  3. A FRAME THAT WILL NOT OPEN IS DROPPED, SILENTLY. It is an old key or a rotated pairing, not
//     an error to narrate; the pill already says whether anything is arriving.
//  4. A REPLAYED FRAME IS DROPPED — per channel, by sequence. The room replays its cache on every
//     attach, so the same `s` arrives again on every reconnect. BUT the desk's sequence RESTARTS
//     at 1 on its own reconnect, so a lower sequence is only refused WITHIN one socket generation.
//     Getting this wrong in either direction is a screen that freezes and never says why.

import { isPhoneChannel, type PhoneChannel } from '@shared/phone/types'
import { BACKOFF_MS, VIEW_SUBPROTOCOL, viewSocketUrl } from '@/constants'
import { openFrame } from './crypto'

/** A socket, as this file uses one. `index.ts` implements it over the platform `WebSocket`. */
export interface RelaySocket {
  close: () => void
}

export interface RelaySocketHandlers {
  onOpen: () => void
  onMessage: (data: string) => void
  onClose: () => void
}

export type Cancel = () => void

export interface RelayDeps {
  socket: (url: string, protocols: string[], handlers: RelaySocketHandlers) => RelaySocket
  now: () => number
  setTimer: (fn: () => void, ms: number) => Cancel
}

/** What the connection pill reads. `desk` is only meaningful while `open` is true. */
export interface RelayStatus {
  open: boolean
  /** whether a DESKTOP is attached to the room right now (`{"t":"o"}`) */
  desk: boolean
  /** the clock of the newest frame this app accepted, or 0 */
  lastFrameAt: number
  /** how many times in a row a connection has failed; 0 while connected */
  attempt: number
}

export interface RelayEvents {
  /** One channel's payload opened. `payload` may legitimately be `null` ("no fight yet"). */
  onChannel: (channel: PhoneChannel, payload: unknown, at: number) => void
  onStatus: (status: RelayStatus) => void
}

export interface Relay {
  /** Point it at a pairing and go. Calling it again with a different pairing re-points it. */
  start: (roomId: string, viewKey: string) => void
  /** Let go entirely: socket closed, timers cancelled, sequences forgotten. */
  stop: () => void
  /** The app came to the foreground (true) or left it (false). */
  setForeground: (active: boolean) => void
  status: () => RelayStatus
}

interface Runtime {
  roomId: string
  viewKey: string
  socket: RelaySocket | null
  open: boolean
  desk: boolean
  lastFrameAt: number
  attempt: number
  stopped: boolean
  foreground: boolean
  /** the highest sequence accepted per channel WITHIN the current socket generation (rule 4) */
  seen: Map<PhoneChannel, number>
}

/** One `{"t":"f"}` off the wire, checked field by field before anything reads a property off it. */
interface RawFrame {
  t: 'f'
  c: PhoneChannel
  s: number
  n: string
  d: string
}

/** A bounded JSON object, or null. Nothing past this point can throw (`protocol.ts`'s shape). */
function objectOf(raw: string): Record<string, unknown> | null {
  if (raw.length === 0 || raw.length > 128 * 1024) return null
  try {
    const parsed = JSON.parse(raw) as unknown
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null
  } catch {
    return null
  }
}

/** One frame, rebuilt field by field. A field of the wrong type loses the whole message. */
function frameOf(m: Record<string, unknown>): RawFrame | null {
  if (!isPhoneChannel(m.c)) return null
  if (typeof m.n !== 'string' || typeof m.d !== 'string') return null
  if (typeof m.s !== 'number' || !Number.isFinite(m.s) || m.s < 1) return null
  return { t: 'f', c: m.c, s: m.s, n: m.n, d: m.d }
}

/** A room→viewer message, rebuilt from a closed set of shapes. Anything else is `null`. */
export function parseViewerMessage(raw: string): { t: 'o'; desk: boolean } | RawFrame | null {
  const m = objectOf(raw)
  if (!m) return null
  if (m.t === 'o') return { t: 'o', desk: m.desk === true }
  return m.t === 'f' ? frameOf(m) : null
}

export function createRelay(deps: RelayDeps, events: RelayEvents): Relay {
  const rt: Runtime = {
    roomId: '',
    viewKey: '',
    socket: null,
    open: false,
    desk: false,
    lastFrameAt: 0,
    attempt: 0,
    stopped: true,
    foreground: true,
    seen: new Map()
  }
  let cancelRetry: Cancel | null = null

  const status = (): RelayStatus => ({
    open: rt.open,
    desk: rt.desk,
    lastFrameAt: rt.lastFrameAt,
    attempt: rt.attempt
  })

  const publish = (): void => {
    events.onStatus(status())
  }

  const onMessage = (data: string): void => {
    const message = parseViewerMessage(data)
    if (!message) return
    if (message.t === 'o') {
      rt.desk = message.desk
      publish()
      return
    }
    // Rule 4: within one socket generation a sequence never goes backwards.
    const held = rt.seen.get(message.c)
    if (held !== undefined && message.s <= held) return
    const opened = openFrame(rt.viewKey, message.c, message.s, { n: message.n, d: message.d })
    // Rule 3: a frame this phone cannot open is not this phone's business.
    if (!opened) return
    rt.seen.set(message.c, message.s)
    rt.lastFrameAt = deps.now()
    events.onChannel(message.c, opened.value, rt.lastFrameAt)
    publish()
  }

  const schedule = (): void => {
    if (rt.stopped || !rt.foreground) return
    const wait = BACKOFF_MS[Math.min(rt.attempt, BACKOFF_MS.length - 1)] ?? 60_000
    rt.attempt += 1
    cancelRetry?.()
    cancelRetry = deps.setTimer(connect, wait)
  }

  const onClose = (): void => {
    rt.socket = null
    rt.open = false
    rt.desk = false
    // A FRESH SOCKET IS A FRESH GENERATION: the desk's sequences restart, so ours must forget.
    rt.seen.clear()
    publish()
    schedule()
  }

  function connect(): void {
    if (rt.stopped || !rt.foreground || rt.socket || rt.roomId === '') return
    try {
      rt.socket = deps.socket(viewSocketUrl(rt.roomId), [VIEW_SUBPROTOCOL], {
        onOpen: () => {
          rt.open = true
          rt.attempt = 0
          rt.seen.clear()
          publish()
        },
        onMessage,
        onClose
      })
    } catch {
      // A factory that throws is a socket that closed before it opened. Same path, same ladder.
      rt.socket = null
      onClose()
    }
  }

  const teardown = (): void => {
    cancelRetry?.()
    cancelRetry = null
    const live = rt.socket
    rt.socket = null
    rt.open = false
    rt.desk = false
    rt.seen.clear()
    live?.close()
  }

  return {
    start: (roomId, viewKey) => {
      if (rt.roomId === roomId && rt.viewKey === viewKey && !rt.stopped) return
      teardown()
      rt.roomId = roomId
      rt.viewKey = viewKey
      rt.lastFrameAt = 0
      rt.attempt = 0
      rt.stopped = false
      publish()
      connect()
    },
    stop: () => {
      rt.stopped = true
      rt.roomId = ''
      rt.viewKey = ''
      rt.lastFrameAt = 0
      rt.attempt = 0
      teardown()
      publish()
    },
    setForeground: (active) => {
      if (rt.foreground === active) return
      rt.foreground = active
      if (!active) {
        // Rule 2, going away: close and cancel. Nothing is retried while nobody is looking.
        teardown()
        publish()
        return
      }
      // …and coming back: AT ONCE, with the ladder reset. The person is looking at the screen.
      rt.attempt = 0
      publish()
      connect()
    },
    status
  }
}
