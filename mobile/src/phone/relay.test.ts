// relay.test.ts — the viewer socket, driven by a fake socket and a fake clock.
//
// Every timing behaviour this app can get wrong is staged here rather than hoped about: the
// backoff ladder and its reset, the background/foreground cycle, the replay rule and its
// generation reset, a desk going offline, and a frame this phone cannot open.
//
// The frames are REAL: they come out of `vectors.json`, which the desktop's own cipher produced,
// so "the relay decrypts a frame" is asserted end to end rather than against a stub.

import { BACKOFF_MS } from '@/constants'
import { createRelay, parseViewerMessage, type Relay, type RelayDeps, type RelaySocket, type RelaySocketHandlers, type RelayStatus } from './relay'
import type { PhoneChannel } from '@shared/phone/types'
import vectorFile from './vectors.json'

interface Vector {
  name: string
  key: string
  channel: string
  seq: number
  frame: { n: string; d: string }
  expect?: string
}

const { vectors } = vectorFile as { vectors: Vector[] }

/** The `fight` round-trip vector — a real frame, sealed by the desktop module. */
const FIGHT = vectors.find((v) => v.name === 'round trip: fight')!
const STATUS = vectors.find((v) => v.name === 'round trip: status')!
const KEY = FIGHT.key

function frameText(v: Vector): string {
  return JSON.stringify({ t: 'f', c: v.channel, s: v.seq, n: v.frame.n, d: v.frame.d })
}

// ------------------------------------------------------------------------------- the harness

interface Fake {
  relay: Relay
  /** every socket ever opened, newest last */
  sockets: FakeSocket[]
  live: () => FakeSocket
  /** advance the fake clock and fire every timer whose deadline has passed */
  tick: (ms: number) => void
  channels: { channel: PhoneChannel; payload: unknown }[]
  statuses: RelayStatus[]
  urls: string[]
  protocols: string[][]
}

interface FakeSocket extends RelaySocket {
  handlers: RelaySocketHandlers
  closed: boolean
}

function harness(options: { throwOnOpen?: boolean } = {}): Fake {
  let now = 1_000_000
  const timers: { at: number; fn: () => void; dead: boolean }[] = []
  const sockets: FakeSocket[] = []
  const channels: { channel: PhoneChannel; payload: unknown }[] = []
  const statuses: RelayStatus[] = []
  const urls: string[] = []
  const protocols: string[][] = []

  const deps: RelayDeps = {
    now: () => now,
    setTimer: (fn, ms) => {
      const entry = { at: now + ms, fn, dead: false }
      timers.push(entry)
      return () => {
        entry.dead = true
      }
    },
    socket: (url, protos, handlers) => {
      urls.push(url)
      protocols.push(protos)
      if (options.throwOnOpen) throw new Error('no network')
      const socket: FakeSocket = {
        handlers,
        closed: false,
        close: () => {
          if (socket.closed) return
          socket.closed = true
          handlers.onClose()
        }
      }
      sockets.push(socket)
      return socket
    }
  }

  const relay = createRelay(deps, {
    onChannel: (channel, payload) => channels.push({ channel, payload }),
    onStatus: (status) => statuses.push(status)
  })

  return {
    relay,
    sockets,
    live: () => sockets[sockets.length - 1]!,
    tick: (ms) => {
      const until = now + ms
      for (;;) {
        const next = timers.filter((t) => !t.dead && t.at <= until).sort((a, b) => a.at - b.at)[0]
        if (!next) break
        next.dead = true
        now = next.at
        next.fn()
      }
      now = until
    },
    channels,
    statuses,
    urls,
    protocols
  }
}

// ------------------------------------------------------------------------------------- tests

describe('connecting', () => {
  test('it opens the room’s viewer socket with the version subprotocol', () => {
    const h = harness()
    h.relay.start('AbCdEfGhIjKlMnOpQrStUv', KEY)
    expect(h.urls).toEqual(['wss://share.eqzera.com/phone/room/AbCdEfGhIjKlMnOpQrStUv/view'])
    expect(h.protocols[0]).toEqual(['eqzera.view.v1'])
  })

  test('an open socket clears the attempt count', () => {
    const h = harness()
    h.relay.start('AbCdEfGhIjKlMnOpQrStUv', KEY)
    h.live().handlers.onOpen()
    expect(h.relay.status()).toMatchObject({ open: true, attempt: 0 })
  })
})

describe('the backoff ladder (rule 1)', () => {
  test('it climbs exactly the desk’s ladder and stops at a minute', () => {
    const h = harness()
    h.relay.start('AbCdEfGhIjKlMnOpQrStUv', KEY)
    // Seven closes: the six rungs, then the last one repeated.
    const expected = [...BACKOFF_MS, 60_000]
    for (const [index, wait] of expected.entries()) {
      h.live().close()
      // Nothing yet, one millisecond short of the rung…
      h.tick(wait - 1)
      expect(h.sockets).toHaveLength(index + 1)
      // …and a new socket exactly on it.
      h.tick(1)
      expect(h.sockets).toHaveLength(index + 2)
    }
  })

  test('an open socket resets the ladder', () => {
    const h = harness()
    h.relay.start('AbCdEfGhIjKlMnOpQrStUv', KEY)
    h.live().close()
    h.tick(BACKOFF_MS[0]!)
    h.live().close()
    h.tick(BACKOFF_MS[1]!)
    // Third socket: let it open, then drop it. The next wait is the FIRST rung again.
    h.live().handlers.onOpen()
    h.live().close()
    h.tick(BACKOFF_MS[0]! - 1)
    expect(h.sockets).toHaveLength(3)
    h.tick(1)
    expect(h.sockets).toHaveLength(4)
  })

  test('a socket factory that throws is a socket that closed', () => {
    const h = harness({ throwOnOpen: true })
    h.relay.start('AbCdEfGhIjKlMnOpQrStUv', KEY)
    expect(h.urls).toHaveLength(1)
    h.tick(BACKOFF_MS[0]!)
    expect(h.urls).toHaveLength(2)
    expect(h.relay.status().open).toBe(false)
  })
})

describe('the foreground (rule 2)', () => {
  test('going to the background closes the socket and cancels the retry', () => {
    const h = harness()
    h.relay.start('AbCdEfGhIjKlMnOpQrStUv', KEY)
    h.live().handlers.onOpen()
    h.relay.setForeground(false)
    expect(h.live().closed).toBe(true)
    expect(h.relay.status().open).toBe(false)
    // …and nothing reconnects while nobody is looking, however long we wait.
    h.tick(10 * 60_000)
    expect(h.sockets).toHaveLength(1)
  })

  test('coming back connects AT ONCE, with no ladder wait', () => {
    const h = harness()
    h.relay.start('AbCdEfGhIjKlMnOpQrStUv', KEY)
    h.live().handlers.onOpen()
    h.relay.setForeground(false)
    const before = h.sockets.length
    h.relay.setForeground(true)
    expect(h.sockets).toHaveLength(before + 1)
  })

  test('a repeated foreground state does nothing', () => {
    const h = harness()
    h.relay.start('AbCdEfGhIjKlMnOpQrStUv', KEY)
    h.live().handlers.onOpen()
    h.relay.setForeground(true)
    expect(h.sockets).toHaveLength(1)
    expect(h.live().closed).toBe(false)
  })
})

describe('frames', () => {
  test('a real frame is decrypted and handed over with its channel', () => {
    const h = harness()
    h.relay.start('AbCdEfGhIjKlMnOpQrStUv', KEY)
    h.live().handlers.onOpen()
    h.live().handlers.onMessage(frameText(FIGHT))
    expect(h.channels).toHaveLength(1)
    expect(h.channels[0]!.channel).toBe('fight')
    expect(JSON.stringify(h.channels[0]!.payload)).toBe(FIGHT.expect)
    expect(h.relay.status().lastFrameAt).toBeGreaterThan(0)
  })

  test('a frame this phone cannot open is dropped silently (rule 3)', () => {
    const h = harness()
    // A DIFFERENT key: the room id is public, the fragment is not.
    h.relay.start('AbCdEfGhIjKlMnOpQrStUv', vectors.find((v) => v.name === 'the wrong key sees noise')!.key)
    h.live().handlers.onOpen()
    expect(() => {
      h.live().handlers.onMessage(frameText(FIGHT))
    }).not.toThrow()
    expect(h.channels).toHaveLength(0)
    expect(h.relay.status().lastFrameAt).toBe(0)
  })

  test('a replayed frame is dropped, per channel (rule 4)', () => {
    const h = harness()
    h.relay.start('AbCdEfGhIjKlMnOpQrStUv', KEY)
    h.live().handlers.onOpen()
    h.live().handlers.onMessage(frameText(FIGHT))
    h.live().handlers.onMessage(frameText(FIGHT))
    expect(h.channels).toHaveLength(1)
    // …and a DIFFERENT channel at a lower sequence is not a replay at all.
    h.live().handlers.onMessage(frameText(STATUS))
    expect(h.channels.map((c) => c.channel)).toEqual(['fight', 'status'])
  })

  test('a new socket generation forgets the sequences (rule 4, the other half)', () => {
    const h = harness()
    h.relay.start('AbCdEfGhIjKlMnOpQrStUv', KEY)
    h.live().handlers.onOpen()
    h.live().handlers.onMessage(frameText(FIGHT))
    h.live().close()
    h.tick(BACKOFF_MS[0]!)
    h.live().handlers.onOpen()
    // The desk restarted its sequence at 1; the same `s` must NOT be mistaken for a replay.
    h.live().handlers.onMessage(frameText(FIGHT))
    expect(h.channels).toHaveLength(2)
  })

  test('junk on the socket is ignored rather than thrown', () => {
    const h = harness()
    h.relay.start('AbCdEfGhIjKlMnOpQrStUv', KEY)
    h.live().handlers.onOpen()
    for (const junk of ['', 'not json', '{}', '[]', '{"t":"f"}', '{"t":"f","c":"chat","s":1,"n":"a","d":"b"}', '{"t":"z"}']) {
      expect(() => {
        h.live().handlers.onMessage(junk)
      }).not.toThrow()
    }
    expect(h.channels).toHaveLength(0)
  })
})

describe('desk presence', () => {
  test('{"t":"o"} drives the Desk offline state', () => {
    const h = harness()
    h.relay.start('AbCdEfGhIjKlMnOpQrStUv', KEY)
    h.live().handlers.onOpen()
    h.live().handlers.onMessage('{"t":"o","desk":true}')
    expect(h.relay.status()).toMatchObject({ open: true, desk: true })
    h.live().handlers.onMessage('{"t":"o","desk":false}')
    expect(h.relay.status()).toMatchObject({ open: true, desk: false })
  })

  test('a closed socket is never reported as a desk that is there', () => {
    const h = harness()
    h.relay.start('AbCdEfGhIjKlMnOpQrStUv', KEY)
    h.live().handlers.onOpen()
    h.live().handlers.onMessage('{"t":"o","desk":true}')
    h.live().close()
    expect(h.relay.status()).toMatchObject({ open: false, desk: false })
  })
})

describe('stopping', () => {
  test('stop closes the socket, cancels the retry and forgets the pairing', () => {
    const h = harness()
    h.relay.start('AbCdEfGhIjKlMnOpQrStUv', KEY)
    h.live().handlers.onOpen()
    h.relay.stop()
    expect(h.live().closed).toBe(true)
    h.tick(10 * 60_000)
    expect(h.sockets).toHaveLength(1)
    expect(h.relay.status()).toEqual({ open: false, desk: false, lastFrameAt: 0, attempt: 0 })
  })
})

describe('parseViewerMessage on its own', () => {
  test('it rebuilds only the two shapes a room may send', () => {
    expect(parseViewerMessage('{"t":"o","desk":true}')).toEqual({ t: 'o', desk: true })
    expect(parseViewerMessage('{"t":"o"}')).toEqual({ t: 'o', desk: false })
    expect(parseViewerMessage('{"t":"f","c":"run","s":2,"n":"n","d":"d"}')).toEqual({ t: 'f', c: 'run', s: 2, n: 'n', d: 'd' })
  })

  test('it refuses a channel this protocol does not have, and a bad sequence', () => {
    expect(parseViewerMessage('{"t":"f","c":"tells","s":1,"n":"n","d":"d"}')).toBeNull()
    expect(parseViewerMessage('{"t":"f","c":"run","s":0,"n":"n","d":"d"}')).toBeNull()
    expect(parseViewerMessage('{"t":"f","c":"run","s":"2","n":"n","d":"d"}')).toBeNull()
    expect(parseViewerMessage(`{"t":"f","c":"run","s":1,"n":"n","d":"${'x'.repeat(200_000)}"}`)).toBeNull()
  })
})
