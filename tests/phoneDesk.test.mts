// ============================================================================
// phoneDesk.test.mts — THE DESK'S STATE MACHINE (src/main/phone/desk.ts).
// ============================================================================
//
// Every impure seam of that module is injected — the socket, the clock, the timer, the room's two
// HTTP calls, the channel payloads and the minting — precisely so this file can stage, in
// milliseconds and deterministically, the things a real run would take an afternoon and a network
// outage to produce:
//
//   * THE FIRST CONNECTION. The room is claimed ONCE, the socket carries the desk token as its
//     SECOND subprotocol, and every channel goes out on open.
//   * THE CHANGE-ONLY RULE. An idle app sends NOTHING, however long the tick runs — which is the
//     whole reason leaving a phone open all evening is free.
//   * THE RATE CAP DROPS, IT DOES NOT QUEUE. Twenty pumps inside one gap produce one frame, and the
//     frame that arrives is the CURRENT state rather than a stale one from the back of a queue.
//   * THE BACKOFF LADDER. A closed socket retries at 1s, 2s, 5s… and a reconnect does NOT re-claim
//     the room — a service outage must not mint rooms.
//   * A DARK BUILD MAKES NO CONNECTION. Not "declines to": there is no URL, so there is nothing to
//     connect to, which is what `EQ_E2E` buys structurally.
//   * UNPAIR ROTATES BOTH IDS. The old room is deleted, a new pairing is minted AND SAVED, and the
//     next socket addresses the new room id (ruling 3).
//   * THE RESEND NUDGE. `{"t":"r"}` re-sends every channel, because that is what a hibernation costs.
//
// No Electron, no network, no real timers.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { BACKOFF_MS, DESK_SUBPROTOCOL, createDesk, type DeskSocket, type DeskSocketHandlers } from '../src/main/phone/desk'
import { decryptFrame, mintPairing, type PhonePairing } from '../src/main/phone/crypto'
import { PHONE_CHANNELS, type PhoneChannel } from '../src/shared/phone/types'
import { PHONE_MIN_FRAME_GAP_MS } from '../src/shared/phone/limits'

// ---- the fakes --------------------------------------------------------------------------

interface Scheduled {
  at: number
  fn: () => void
  dead: boolean
}

class Clock {
  now = 1_700_000_000_000
  private readonly queue: Scheduled[] = []

  timer = (fn: () => void, ms: number): (() => void) => {
    const entry: Scheduled = { at: this.now + ms, fn, dead: false }
    this.queue.push(entry)
    return () => {
      entry.dead = true
    }
  }

  /** Move time forward, firing everything due, in order. */
  advance(ms: number): void {
    const target = this.now + ms
    for (;;) {
      let next: Scheduled | null = null
      for (const entry of this.queue) {
        if (entry.dead || entry.at > target) continue
        if (!next || entry.at < next.at) next = entry
      }
      if (!next) break
      next.dead = true
      this.now = next.at
      next.fn()
    }
    this.now = target
  }
}

class FakeSocket implements DeskSocket {
  readonly sent: string[] = []
  closed = false
  constructor(
    readonly url: string,
    readonly protocols: string[],
    readonly handlers: DeskSocketHandlers
  ) {}

  send(data: string): void {
    this.sent.push(data)
  }

  close(): void {
    if (this.closed) return
    this.closed = true
    this.handlers.onClose()
  }

  /** The room says something. */
  deliver(message: unknown): void {
    this.handlers.onMessage(JSON.stringify(message))
  }
}

interface Harness {
  clock: Clock
  sockets: FakeSocket[]
  live: () => FakeSocket
  created: PhonePairing[]
  deleted: PhonePairing[]
  saved: PhonePairing[]
  payload: Record<PhoneChannel, unknown>
  desk: ReturnType<typeof createDesk>
  frames: (socket?: FakeSocket) => { channel: PhoneChannel; seq: number; body: unknown }[]
}

function channels(zone: string): Record<PhoneChannel, unknown> {
  const out = {} as Record<PhoneChannel, unknown>
  for (const channel of PHONE_CHANNELS) out[channel] = { channel, zone }
  return out
}

interface HarnessOpts {
  dark?: boolean
  pairing?: PhonePairing
  mint?: () => PhonePairing
  /** false = every socket is created and then never opens, which is what a dead service looks like */
  autoOpen?: boolean
}

function harness(opts: HarnessOpts = {}): Harness {
  const clock = new Clock()
  const sockets: FakeSocket[] = []
  const created: PhonePairing[] = []
  const deleted: PhonePairing[] = []
  const saved: PhonePairing[] = []
  const state = { payload: channels('Befallen') }
  const pairing = opts.pairing ?? mintPairing()
  const desk = createDesk({
    socket: (url, protocols, handlers) => {
      const socket = new FakeSocket(url, protocols, handlers)
      sockets.push(socket)
      // A real socket opens asynchronously; opening on the next timer keeps the order honest.
      if (opts.autoOpen !== false) {
        clock.timer(() => {
          handlers.onOpen()
        }, 1)
      }
      return socket
    },
    now: () => clock.now,
    setTimer: clock.timer,
    socketUrl: (roomId) => (opts.dark === true ? '' : `wss://share.eqzera.com/phone/room/${roomId}/desk`),
    createRoom: (p) => {
      created.push(p)
      return Promise.resolve(true)
    },
    deleteRoom: (p) => {
      deleted.push(p)
      return Promise.resolve()
    },
    channels: () => state.payload,
    savePairing: (p) => {
      saved.push(p)
    },
    ...(opts.mint === undefined ? {} : { mint: opts.mint })
  })
  const h: Harness = {
    clock,
    sockets,
    live: () => sockets[sockets.length - 1],
    created,
    deleted,
    saved,
    get payload() {
      return state.payload
    },
    set payload(next: Record<PhoneChannel, unknown>) {
      state.payload = next
    },
    desk,
    frames: (socket) =>
      (socket ?? sockets[sockets.length - 1]).sent.map((raw) => {
        const frame = JSON.parse(raw) as { c: PhoneChannel; s: number; n: string; d: string }
        return {
          channel: frame.c,
          seq: frame.s,
          body: decryptFrame(pairing.viewKey, frame.c, frame.s, frame)
        }
      })
  }
  Object.assign(h, { pairing })
  return h
}

/** Start a desk and let its socket open. */
async function started(h: Harness, pairing: PhonePairing): Promise<void> {
  await h.desk.start(pairing)
  h.clock.advance(2)
}

// ---- the tests --------------------------------------------------------------------------

test('the first connection: one room claim, the token as a subprotocol, every channel once', async () => {
  const pairing = mintPairing()
  const h = harness({ pairing })
  await started(h, pairing)

  assert.deepEqual(h.created, [pairing], 'the room is claimed exactly once')
  assert.equal(h.sockets.length, 1)
  assert.equal(h.live().url, `wss://share.eqzera.com/phone/room/${pairing.roomId}/desk`)
  assert.deepEqual(h.live().protocols, [DESK_SUBPROTOCOL, pairing.deskToken])
  assert.equal(h.desk.state().connected, true)
  assert.equal(h.desk.state().paired, true)

  const frames = h.frames()
  assert.equal(frames.length, PHONE_CHANNELS.length, 'one frame per channel')
  assert.deepEqual(frames.map((f) => f.channel).sort(), [...PHONE_CHANNELS].sort())
  assert.ok(frames.every((f) => f.seq === 1), 'each channel starts at sequence 1')
  // …and the bytes are what the builders produced, which is what the key proves.
  assert.deepEqual(frames.find((f) => f.channel === 'fight')?.body, { channel: 'fight', zone: 'Befallen' })
})

test('an idle app sends nothing, however long it runs', async () => {
  const pairing = mintPairing()
  const h = harness({ pairing })
  await started(h, pairing)
  const after = h.live().sent.length
  h.clock.advance(60_000)
  assert.equal(h.live().sent.length, after, 'not one frame in a minute of stillness')
})

test('a changed channel goes out, and only that channel', async () => {
  const pairing = mintPairing()
  const h = harness({ pairing })
  await started(h, pairing)
  const before = h.live().sent.length
  h.payload = { ...h.payload, fight: { channel: 'fight', zone: 'West Commonlands' } }
  h.clock.advance(1000)
  const fresh = h.frames().slice(before)
  assert.equal(fresh.length, 1)
  assert.equal(fresh[0].channel, 'fight')
  assert.equal(fresh[0].seq, 2, 'the channel’s own sequence advanced')
})

test('the rate cap DROPS rather than queueing, and what arrives is the current state', async () => {
  const pairing = mintPairing()
  const h = harness({ pairing })
  await started(h, pairing)
  const before = h.live().sent.length
  // Twenty distinct states inside one gap. A queue would emit twenty frames, eventually, in order;
  // a drop emits one, and it is the LAST state, which is the one worth having.
  for (let i = 0; i < 20; i++) {
    h.payload = { ...h.payload, fight: { channel: 'fight', tick: i } }
    h.desk.pump()
  }
  assert.equal(h.live().sent.length, before, 'nothing inside the gap')
  h.clock.advance(1000)
  const fresh = h.frames().slice(before)
  assert.equal(fresh.length, 1, 'one frame, not twenty')
  assert.deepEqual(fresh[0].body, { channel: 'fight', tick: 19 }, 'the newest state, not the oldest')
})

test('a closed socket climbs the backoff ladder and does NOT re-claim the room', async () => {
  const pairing = mintPairing()
  const h = harness({ pairing })
  await started(h, pairing)
  assert.equal(h.created.length, 1)

  h.live().close()
  assert.equal(h.desk.state().connected, false)
  assert.equal(h.sockets.length, 1, 'nothing reconnects immediately')

  // Just short of the first rung, then over it.
  h.clock.advance(BACKOFF_MS[0] - 10)
  assert.equal(h.sockets.length, 1)
  h.clock.advance(20)
  assert.equal(h.sockets.length, 2, 'the first retry')
  assert.equal(h.created.length, 1, 'a reconnect is a socket, never a room claim')

  // A SUCCESSFUL OPEN RESETS THE LADDER, which is the right shape: a connection that worked for an
  // hour and then dropped is not the same event as the fourth failure in a row.
  h.sockets[1].close()
  h.clock.advance(BACKOFF_MS[0] + 10)
  assert.equal(h.sockets.length, 3, 'back to the first rung after a good connection')
})

test('consecutive failures climb the ladder, and it stops at a minute', async () => {
  const pairing = mintPairing()
  // Sockets that are created and never open - a service that is refusing, or a network that is not
  // there. Nothing resets the ladder, so it climbs.
  const h = harness({ pairing, autoOpen: false })
  await started(h, pairing)
  assert.equal(h.sockets.length, 1)

  for (let rung = 0; rung < 3; rung++) {
    h.sockets[h.sockets.length - 1].close()
    const expected = h.sockets.length + 1
    h.clock.advance(BACKOFF_MS[rung] - 10)
    assert.equal(h.sockets.length, expected - 1, `rung ${String(rung)} is still waiting`)
    h.clock.advance(20)
    assert.equal(h.sockets.length, expected, `rung ${String(rung)} fired at ${String(BACKOFF_MS[rung])}ms`)
  }
  assert.equal(BACKOFF_MS[BACKOFF_MS.length - 1], 60_000, 'the ladder stops climbing at a minute')
})

test('a reconnect re-sends everything, because the room it reconnected to holds nothing', async () => {
  const pairing = mintPairing()
  const h = harness({ pairing })
  await started(h, pairing)
  h.live().close()
  h.clock.advance(BACKOFF_MS[0] + 10)
  const frames = h.frames(h.sockets[1])
  assert.equal(frames.length, PHONE_CHANNELS.length)
  assert.ok(frames.every((f) => f.seq === 1), 'a fresh socket restarts every sequence')
})

test('a dark build makes no connection at all', async () => {
  const pairing = mintPairing()
  const h = harness({ pairing, dark: true })
  await started(h, pairing)
  assert.equal(h.sockets.length, 0, 'there is no URL, so there is nothing to connect to')
  assert.equal(h.desk.state().connected, false)
  h.clock.advance(120_000)
  assert.equal(h.sockets.length, 0, 'and no amount of time produces one')
})

test('the resend nudge re-sends every channel, unchanged or not', async () => {
  const pairing = mintPairing()
  const h = harness({ pairing })
  await started(h, pairing)
  const before = h.live().sent.length
  h.clock.advance(PHONE_MIN_FRAME_GAP_MS * 2)
  h.live().deliver({ t: 'r' })
  const fresh = h.frames().slice(before)
  assert.equal(fresh.length, PHONE_CHANNELS.length)
  assert.ok(fresh.every((f) => f.seq === 2), 'every channel advanced once')
})

test('the viewer count is what the Preferences card reads', async () => {
  const pairing = mintPairing()
  const h = harness({ pairing })
  await started(h, pairing)
  assert.equal(h.desk.state().viewers, 0)
  h.live().deliver({ t: 'v', n: 3 })
  assert.equal(h.desk.state().viewers, 3)
  // A message this desk does not understand changes nothing.
  h.live().deliver({ t: 'zzz' })
  assert.equal(h.desk.state().viewers, 3)
  // …and a socket that goes away takes the count with it.
  h.live().close()
  assert.equal(h.desk.state().viewers, 0)
})

test('Unpair all phones rotates BOTH ids, deletes the old room and saves the new pairing', async () => {
  const first = mintPairing()
  const second = mintPairing()
  const h = harness({ pairing: first, mint: () => second })
  await started(h, first)
  const oldSocket = h.live()

  await h.desk.unpairAll(first)
  h.clock.advance(2)

  assert.deepEqual(h.deleted, [first], 'the old room is deleted, which closes its sockets')
  assert.deepEqual(h.saved, [second], 'the new pairing is persisted before it is used')
  assert.ok(oldSocket.closed, 'the old socket is gone')
  assert.notEqual(second.roomId, first.roomId)
  assert.notEqual(second.viewKey, first.viewKey)
  assert.deepEqual(h.created, [first, second], 'the new room is claimed')
  assert.equal(h.live().url, `wss://share.eqzera.com/phone/room/${second.roomId}/desk`)
  assert.deepEqual(h.live().protocols, [DESK_SUBPROTOCOL, second.deskToken])
  // …and the OLD key no longer opens the new frames, which is what "every link is dead" means.
  const raw = JSON.parse(h.live().sent[0]) as { c: PhoneChannel; s: number; n: string; d: string }
  assert.equal(decryptFrame(first.viewKey, raw.c, raw.s, raw), null)
  assert.ok(decryptFrame(second.viewKey, raw.c, raw.s, raw))
})

test('stop closes the socket and stops the tick', async () => {
  const pairing = mintPairing()
  const h = harness({ pairing })
  await started(h, pairing)
  h.desk.stop()
  assert.ok(h.sockets[0].closed)
  h.clock.advance(120_000)
  assert.equal(h.sockets.length, 1, 'a stopped desk does not reconnect')
  assert.equal(h.desk.state().connected, false)
})
