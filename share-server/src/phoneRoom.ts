// ============================================================================
// phoneRoom.ts — ONE PAIRING, AS A DURABLE OBJECT (docs/plans/phone-link.md, section 1).
// ============================================================================
//
// WHY A DURABLE OBJECT AND NOT KV. A live meter is a write every quarter-second and KV's write
// budget is a daily number; a DO is a single addressable place that holds sockets, fans one message
// out to four readers, and — with the WebSocket Hibernation API — costs NOTHING while the room is
// idle, because the runtime evicts the object without dropping the connections. `new_sqlite_classes`
// rather than `new_classes` in the migration: a SQLite-backed DO is the only kind the FREE plan
// runs, and free-tier is this service's standing constraint (share-links.md ruling 3).
//
// ── THE POLICY IS SEPARABLE FROM THE RUNTIME, ON PURPOSE ───────────────────────────────────────
//
// `RoomCore` below knows nothing about Cloudflare. It takes attaches, messages and a clock and
// answers a list of ACTIONS ("send this to the viewers", "close that socket", "save this pairing");
// `PhoneRoom` is the thin adapter that owns the sockets and performs them. That split exists for
// one reason: `@cloudflare/vitest-pool-workers` is not in this repo and adding a second test runner
// for one class would make the suite platform-specific and therefore optional — the exact argument
// `tests/shareServer.test.mts` makes about a workerd emulator. `tests/sharePhone.test.mts` drives
// `RoomCore` directly, so the viewer cap, the frame cap, the rate drop, the replay and the expiry
// are all unit-tested under plain node:test.
//
// ── THE SERVICE CANNOT READ ANY OF THIS ────────────────────────────────────────────────────────
//
// A frame is AES-256-GCM ciphertext the desktop sealed with a key that travels only in the fragment
// of the pair link (ruling 1). This file relays the string and caches the latest one per channel;
// there is no decrypt path here and nothing to add one to. The only durable state is a SHA-256
// digest and two clocks. NOTHING IS LOGGED — this service has no logging at all, and this adds none.

import { digestsMatch, sha256Hex } from './codec'
import { DESK_TAG, VIEW_TAG, type DurableStateLike, type RoomWebSocket } from './env'
import { isPhoneChannel, type PhoneChannel } from '../../src/shared/phone/types'
import {
  PHONE_MAX_FRAME_BYTES,
  PHONE_MAX_VIEWERS,
  PHONE_MIN_FRAME_GAP_MS,
  PHONE_ROOM_TTL_MS
} from '../../src/shared/phone/limits'

/** What DO storage holds under `pairing` - a digest and two clocks, and nothing about a person. */
export interface PairingRecord {
  deskTokenHash: string
  createdAt: number
  lastDeskAt: number
}

/** Who an action is addressed to. `viewers` is the fan-out; `desk` is the one desktop. */
export type RoomTarget = { to: 'socket'; id: string } | { to: 'viewers' } | { to: 'desk' }

export type RoomAction =
  | { do: 'send'; target: RoomTarget; data: string }
  | { do: 'close'; target: RoomTarget; code: number; reason: string }
  | { do: 'save'; pairing: PairingRecord | null }
  | { do: 'alarm'; at: number }

/** What the adapter knows and the core does not: the wall clock and who is currently attached. */
export interface RoomNow {
  now: number
  viewers: number
  deskOnline: boolean
}

/** The four close codes this room uses (phone-link.md). */
export const ROOM_CLOSE = {
  unauthorized: 4001,
  unpaired: 4004,
  tooLarge: 4009
} as const

/** Longest message a VIEWER may send. A viewer has nothing to say (ruling 4); this is the floor. */
const MAX_VIEWER_MESSAGE = 1024

/**
 * THE ROOM'S POLICY. No Cloudflare, no sockets, no clock of its own.
 *
 * The frame cache and the per-channel rate clock live here because they are in-memory facts about
 * one isolate's lifetime, and losing them to a hibernation is exactly what the resend nudge is for.
 */
export class RoomCore {
  private pairing: PairingRecord | null
  private readonly latest = new Map<PhoneChannel, string>()
  private readonly sentAt = new Map<PhoneChannel, number>()

  constructor(pairing: PairingRecord | null = null) {
    this.pairing = pairing
  }

  /** The pairing as it stands, for the adapter's own checks. Never handed outside the worker. */
  record(): PairingRecord | null {
    return this.pairing
  }

  /** Put back what storage held. Not `create`: restoring must not re-stamp either clock. */
  restore(record: PairingRecord): void {
    this.pairing = record
  }

  /** Register a pairing. `null` when one already exists — a room id is claimed exactly once. */
  create(deskTokenHash: string, now: number): RoomAction[] | null {
    if (this.pairing) return null
    this.pairing = { deskTokenHash, createdAt: now, lastDeskAt: now }
    return [
      { do: 'save', pairing: this.pairing },
      { do: 'alarm', at: now + PHONE_ROOM_TTL_MS }
    ]
  }

  /** Does this token open this room? Constant-time over the digests, never over the tokens. */
  async opens(token: string): Promise<boolean> {
    const held = this.pairing
    if (!held) return false
    return digestsMatch(await sha256Hex(token), held.deskTokenHash)
  }

  /** Unpair: the record goes, the cache goes, and every socket is told why. */
  destroy(): RoomAction[] {
    this.pairing = null
    this.latest.clear()
    this.sentAt.clear()
    return [
      { do: 'save', pairing: null },
      { do: 'close', target: { to: 'viewers' }, code: ROOM_CLOSE.unpaired, reason: 'unpaired' },
      { do: 'close', target: { to: 'desk' }, code: ROOM_CLOSE.unpaired, reason: 'unpaired' }
    ]
  }

  /** Is there room for one more phone? The fifth is refused, never an eviction. */
  full(viewers: number): boolean {
    return viewers >= PHONE_MAX_VIEWERS
  }

  /**
   * A viewer attached. It is told whether a desk is there, then handed the latest frame of every
   * channel the cache holds; if the cache is short and a desk IS there, the desk is nudged to
   * resend — which is what makes a hibernation invisible to the phone.
   */
  attachViewer(id: string, ctx: RoomNow): RoomAction[] {
    const out: RoomAction[] = [
      { do: 'send', target: { to: 'socket', id }, data: presence(ctx.deskOnline) }
    ]
    for (const frame of this.latest.values()) {
      out.push({ do: 'send', target: { to: 'socket', id }, data: frame })
    }
    if (ctx.deskOnline) {
      out.push({ do: 'send', target: { to: 'desk' }, data: JSON.stringify({ t: 'v', n: ctx.viewers }) })
      if (this.latest.size < 7) out.push({ do: 'send', target: { to: 'desk' }, data: '{"t":"r"}' })
    }
    return out
  }

  /** A viewer went away. The only consequence is the count the Preferences card draws. */
  detachViewer(ctx: RoomNow): RoomAction[] {
    if (!ctx.deskOnline) return []
    return [{ do: 'send', target: { to: 'desk' }, data: JSON.stringify({ t: 'v', n: ctx.viewers }) }]
  }

  /** The desk attached: stamp the clock the 30-day expiry is measured from, and tell the phones. */
  attachDesk(ctx: RoomNow): RoomAction[] {
    const held = this.pairing
    if (!held) return []
    this.pairing = { ...held, lastDeskAt: ctx.now }
    return [
      { do: 'save', pairing: this.pairing },
      { do: 'alarm', at: ctx.now + PHONE_ROOM_TTL_MS },
      { do: 'send', target: { to: 'viewers' }, data: presence(true) },
      { do: 'send', target: { to: 'desk' }, data: JSON.stringify({ t: 'v', n: ctx.viewers }) }
    ]
  }

  detachDesk(): RoomAction[] {
    return [{ do: 'send', target: { to: 'viewers' }, data: presence(false) }]
  }

  /**
   * ONE FRAME FROM THE DESK. Three gates, in the order that costs least:
   *
   *   size — over the cap is a BUG in the desktop, so the desk socket is closed rather than the
   *          traffic absorbed;
   *   shape — a message that is not a frame for a channel this protocol knows is ignored;
   *   rate — inside the per-channel gap the frame is DROPPED. Not queued: a meter frame that
   *          arrives late is worse than one that never arrives.
   */
  deskMessage(data: string, now: number): RoomAction[] {
    if (data.length > PHONE_MAX_FRAME_BYTES) {
      return [
        { do: 'close', target: { to: 'desk' }, code: ROOM_CLOSE.tooLarge, reason: 'frame-too-large' }
      ]
    }
    const channel = frameChannel(data)
    if (channel === null) return []
    if (now - (this.sentAt.get(channel) ?? 0) < PHONE_MIN_FRAME_GAP_MS) return []
    this.sentAt.set(channel, now)
    this.latest.set(channel, data)
    return [{ do: 'send', target: { to: 'viewers' }, data }]
  }

  /** A viewer sent something. It has nothing to say; an oversize message loses its socket. */
  viewerMessage(id: string, data: string): RoomAction[] {
    if (data.length <= MAX_VIEWER_MESSAGE) return []
    return [{ do: 'close', target: { to: 'socket', id }, code: ROOM_CLOSE.tooLarge, reason: 'too-large' }]
  }

  /**
   * THE 30-DAY ALARM. A desk that connected since the alarm was set pushes it out again; one that
   * did not takes the room with it. There is no sweeper and nothing to run.
   */
  alarm(now: number): RoomAction[] {
    const held = this.pairing
    if (!held) return []
    if (now - held.lastDeskAt < PHONE_ROOM_TTL_MS) {
      return [{ do: 'alarm', at: held.lastDeskAt + PHONE_ROOM_TTL_MS }]
    }
    return this.destroy()
  }

  /** How many channels the cache can replay. The suite reads it; nothing in the product does. */
  cached(): number {
    return this.latest.size
  }
}

function presence(desk: boolean): string {
  return JSON.stringify({ t: 'o', desk })
}

/**
 * The channel of a desk message, or null when it is not a frame this protocol knows.
 *
 * It PARSES rather than pattern-matches, because the value decides a cache key. Everything else in
 * the message — the nonce, the ciphertext, the sequence — is relayed verbatim and never inspected:
 * the service cannot read it, and looking would be the first step towards being able to.
 */
export function frameChannel(data: string): PhoneChannel | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(data) as unknown
  } catch {
    return null
  }
  if (!parsed || typeof parsed !== 'object') return null
  const message = parsed as Record<string, unknown>
  if (message.t !== 'f' || !isPhoneChannel(message.c)) return null
  if (typeof message.n !== 'string' || typeof message.d !== 'string') return null
  return message.c
}

// ------------------------------------------------------------------- the Cloudflare adapter

/**
 * `PhoneRoom` — the Durable Object. Everything here is sockets and storage; every decision is
 * `RoomCore`'s. It uses the HIBERNATION API (`acceptWebSocket`, not `addEventListener`), which is
 * what lets an idle room cost nothing while its four sockets stay open.
 */
export class PhoneRoom {
  private readonly core = new RoomCore()
  private loaded = false

  constructor(private readonly state: DurableStateLike) {}

  private async load(): Promise<RoomCore> {
    if (!this.loaded) {
      this.loaded = true
      const held = await this.state.storage.get<PairingRecord>('pairing')
      if (held) this.core.restore(held)
    }
    return this.core
  }

  private context(): RoomNow {
    return {
      now: Date.now(),
      viewers: this.state.getWebSockets(VIEW_TAG).length,
      deskOnline: this.state.getWebSockets(DESK_TAG).length > 0
    }
  }

  /** Perform one action list. The adapter's whole job. */
  private async run(actions: readonly RoomAction[]): Promise<void> {
    for (const action of actions) {
      if (action.do === 'save') {
        if (action.pairing) await this.state.storage.put('pairing', action.pairing)
        else await this.state.storage.delete('pairing')
      } else if (action.do === 'alarm') {
        await this.state.storage.setAlarm(action.at)
      } else {
        this.deliver(action)
      }
    }
  }

  private sockets(target: RoomTarget): RoomWebSocket[] {
    if (target.to === 'viewers') return this.state.getWebSockets(VIEW_TAG)
    if (target.to === 'desk') return this.state.getWebSockets(DESK_TAG)
    return this.state.getWebSockets().filter((ws) => this.state.getTags(ws).includes(target.id))
  }

  private deliver(action: RoomAction): void {
    if (action.do === 'save' || action.do === 'alarm') return
    for (const ws of this.sockets(action.target)) {
      // A socket the client has already dropped throws on send; that is a closed socket, not an
      // error worth failing a fan-out for.
      try {
        if (action.do === 'send') ws.send(action.data)
        else ws.close(action.code, action.reason)
      } catch {
        /* the peer is gone */
      }
    }
  }

  async fetch(request: Request): Promise<Response> {
    const core = await this.load()
    const url = new URL(request.url)
    if (url.pathname === '/create') return this.create(core, request)
    if (url.pathname === '/delete') return this.remove(core, request)
    if (url.pathname === '/desk') return this.upgrade(core, request, DESK_TAG)
    if (url.pathname === '/view') return this.upgrade(core, request, VIEW_TAG)
    return new Response('not found', { status: 404 })
  }

  private async create(core: RoomCore, request: Request): Promise<Response> {
    const body = (await request.json()) as { deskTokenHash?: unknown }
    const hash = typeof body.deskTokenHash === 'string' ? body.deskTokenHash : ''
    const actions = core.create(hash, Date.now())
    if (!actions) return new Response('exists', { status: 409 })
    await this.run(actions)
    return new Response('created', { status: 201 })
  }

  private async remove(core: RoomCore, request: Request): Promise<Response> {
    const token = request.headers.get('X-Desk-Token') ?? ''
    if (!core.record()) return new Response('not found', { status: 404 })
    if (!(await core.opens(token))) return new Response('unauthorized', { status: 401 })
    await this.run(core.destroy())
    return new Response(null, { status: 204 })
  }

  /**
   * The 101. The desk proves itself with the SUBPROTOCOL (a WebSocket client cannot set an
   * `Authorization` header, and the query string ends up in more logs than anybody can enumerate);
   * a viewer proves nothing, because the room id is 128 bits and the key is not here at all.
   */
  private async upgrade(core: RoomCore, request: Request, tag: string): Promise<Response> {
    if (!core.record()) return new Response('not found', { status: 404 })
    const offered = (request.headers.get('Sec-WebSocket-Protocol') ?? '').split(',').map((s) => s.trim())
    const ctx = this.context()
    if (tag === DESK_TAG) {
      if (!(await core.opens(offered[1] ?? ''))) return new Response('unauthorized', { status: 401 })
      if (ctx.deskOnline) return new Response('desk taken', { status: 409 })
    } else if (core.full(ctx.viewers)) {
      return new Response('room full', { status: 409 })
    }
    const pair = new (globalThis as unknown as { WebSocketPair: new () => Record<string, RoomWebSocket> }).WebSocketPair()
    const client = pair['0']
    const server = pair['1']
    const id = `id:${String(Date.now())}:${String(Math.random()).slice(2, 10)}`
    this.state.acceptWebSocket(server, [tag, id])
    const after = this.context()
    await this.run(tag === DESK_TAG ? core.attachDesk(after) : core.attachViewer(id, after))
    return new Response(null, {
      status: 101,
      headers: { 'Sec-WebSocket-Protocol': offered[0] ?? '' },
      webSocket: client
    } as ResponseInit)
  }

  async webSocketMessage(ws: RoomWebSocket, message: string | ArrayBuffer): Promise<void> {
    const core = await this.load()
    const tags = this.state.getTags(ws)
    const data = typeof message === 'string' ? message : ''
    const id = tags.find((t) => t.startsWith('id:')) ?? ''
    await this.run(
      tags.includes(DESK_TAG) ? core.deskMessage(data, Date.now()) : core.viewerMessage(id, data)
    )
  }

  async webSocketClose(ws: RoomWebSocket): Promise<void> {
    const core = await this.load()
    const isDesk = this.state.getTags(ws).includes(DESK_TAG)
    // The socket is already off the list by the time this runs, so the context is the state AFTER.
    await this.run(isDesk ? core.detachDesk() : core.detachViewer(this.context()))
  }

  async webSocketError(ws: RoomWebSocket): Promise<void> {
    await this.webSocketClose(ws)
  }

  async alarm(): Promise<void> {
    const core = await this.load()
    await this.run(core.alarm(Date.now()))
  }
}
