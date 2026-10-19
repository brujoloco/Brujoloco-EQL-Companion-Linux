// ============================================================================
// sharePhone.test.mts — THE PHONE RELAY (share-server/src/phoneRoom.ts + phone.ts + phonePage.ts).
// ============================================================================
//
// ── HOW A DURABLE OBJECT IS TESTED WITHOUT A DURABLE OBJECT ────────────────────────────────────
//
// `@cloudflare/vitest-pool-workers` is not in this repo, and adding a second test runner for one
// class would make the suite slow, platform-specific and therefore optional — the exact argument
// `shareServer.test.mts` makes about a workerd emulator, and an optional suite is one nobody runs.
//
// So `PhoneRoom`'s POLICY is separable from its RUNTIME by construction: `RoomCore` takes attaches,
// messages and a clock and answers a list of ACTIONS, and the DO class is a thin adapter that owns
// the sockets and performs them. This file drives `RoomCore` directly for the viewer cap, the frame
// cap, the rate drop, the replay, the resend nudge, the token gate and the 30-day expiry — and
// drives the HTTP half (create, its 409, delete, the upgrade refusals, the page, the manifest and
// the worker) through the real `handleRequest` with a stub namespace, the same structural-binding
// trick `env.ts` already uses for KV.
//
// ── AND THE ONE THING THE SERVICE MUST NOT BE ABLE TO DO ───────────────────────────────────────
//
// Read a frame. There is no decrypt path in `share-server/` and nothing to add one to; what is
// asserted here is the shape of that: the relayed string is BYTE-IDENTICAL to what the desk sent,
// and the only field the room looks at is the channel name it caches under.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { handleRequest } from '../share-server/src/handler'
import { RoomCore, ROOM_CLOSE, frameChannel, type RoomAction, type RoomNow } from '../share-server/src/phoneRoom'
import { phoneManifest, phonePageHtml, phoneServiceWorker } from '../share-server/src/phonePage'
import { sha256Hex } from '../share-server/src/codec'
import type { Env, KvLike, KvPutOptions } from '../share-server/src/env'
import { PHONE_MAX_FRAME_BYTES, PHONE_MAX_VIEWERS, PHONE_ROOM_TTL_MS } from '../src/shared/phone/limits'
import { PHONE_CHANNELS } from '../src/shared/phone/types'

const ORIGIN = 'https://share.eqzera.com'
const ROOM = 'AbCdEfGhIjKlMnOpQrStUv'
const TOKEN = 'Zm9vYmFyYmF6cXV1eGNvcmdlZ3JhdWx0Z2FycGx5d2FsZG8'.slice(0, 43)
const T0 = Date.UTC(2026, 8, 19, 12, 0, 0)

/** One encrypted frame, as the desk writes one. The ciphertext here is opaque on purpose. */
function frame(channel: string, seq: number, body = 'ZmFrZS1jaXBoZXJ0ZXh0'): string {
  return JSON.stringify({ t: 'f', c: channel, s: seq, n: 'MTIzNDU2Nzg5MDEy', d: body })
}

function ctx(now = T0, viewers = 0, deskOnline = true): RoomNow {
  return { now, viewers, deskOnline }
}

/** Every `send` in an action list, flattened to `[target, data]`. */
function sends(actions: readonly RoomAction[]): [string, string][] {
  const out: [string, string][] = []
  for (const action of actions) {
    if (action.do === 'send') out.push([action.target.to, action.data])
  }
  return out
}

async function room(): Promise<RoomCore> {
  const core = new RoomCore()
  const made = core.create(await sha256Hex(TOKEN), T0)
  assert.ok(made, 'a fresh room accepts a pairing')
  return core
}

// ---- the pairing record -----------------------------------------------------------------

test('a room id is claimed exactly once, and the record is a digest and two clocks', async () => {
  const core = await room()
  assert.equal(core.create('deadbeef', T0), null, 'a second claim on the same id is refused')
  const record = core.record()
  assert.ok(record)
  assert.equal(record.deskTokenHash, await sha256Hex(TOKEN))
  assert.equal(record.createdAt, T0)
  assert.equal(record.lastDeskAt, T0)
  // The TOKEN itself is nowhere in the stored state - that is what "the create call sends the
  // hash" buys, and it is the difference between a leak being a nuisance and a takeover.
  assert.ok(!JSON.stringify(record).includes(TOKEN))
})

test('the desk token gate is the only way in, and it is constant-time over digests', async () => {
  const core = await room()
  assert.equal(await core.opens(TOKEN), true)
  assert.equal(await core.opens(`${TOKEN.slice(0, 42)}X`), false, 'one character wrong')
  assert.equal(await core.opens(''), false)
  assert.equal(await core.opens('Zm9v'), false)
})

// ---- the frames -------------------------------------------------------------------------

test('a frame is relayed BYTE-IDENTICALLY, and only its channel is ever inspected', async () => {
  const core = await room()
  const sent = frame('fight', 1, 'c29tZS1vcGFxdWUtY2lwaGVydGV4dA')
  const out = sends(core.deskMessage(sent, T0))
  assert.deepEqual(out, [['viewers', sent]], 'the exact string, to every phone')
  assert.equal(frameChannel(sent), 'fight')
  // Anything that is not a frame for a channel this protocol knows is ignored, not relayed.
  assert.equal(frameChannel('not json'), null)
  assert.equal(frameChannel(JSON.stringify({ t: 'f', c: 'secrets', s: 1, n: 'a', d: 'b' })), null)
  assert.equal(frameChannel(JSON.stringify({ t: 'x', c: 'fight', s: 1, n: 'a', d: 'b' })), null)
  assert.equal(frameChannel(JSON.stringify({ t: 'f', c: 'fight', s: 1 })), null, 'no nonce, no frame')
  assert.deepEqual(core.deskMessage('not json', T0 + 10_000), [])
})

test('the rate cap DROPS, per channel, and the room is the second lock on it', async () => {
  const core = await room()
  assert.equal(sends(core.deskMessage(frame('fight', 1), T0)).length, 1)
  // Inside the gap: nothing, and nothing is held for later either.
  assert.deepEqual(core.deskMessage(frame('fight', 2), T0 + 50), [])
  assert.deepEqual(core.deskMessage(frame('fight', 3), T0 + 200), [])
  // A DIFFERENT channel is on its own clock.
  assert.equal(sends(core.deskMessage(frame('buffs', 1), T0 + 50)).length, 1)
  // …and past the gap the next fight frame goes.
  assert.equal(sends(core.deskMessage(frame('fight', 4), T0 + 300)).length, 1)
})

test('a frame over the cap closes the DESK socket rather than being absorbed', async () => {
  const core = await room()
  const huge = frame('character', 1, 'A'.repeat(PHONE_MAX_FRAME_BYTES))
  const actions = core.deskMessage(huge, T0)
  assert.deepEqual(actions, [
    { do: 'close', target: { to: 'desk' }, code: ROOM_CLOSE.tooLarge, reason: 'frame-too-large' }
  ])
  assert.equal(core.cached(), 0, 'and nothing of it is kept')
})

test('a viewer has nothing to say, and an oversize one loses its socket', async () => {
  const core = await room()
  assert.deepEqual(core.viewerMessage('id:1', '{"hello":true}'), [])
  const actions = core.viewerMessage('id:1', 'A'.repeat(2000))
  assert.deepEqual(actions, [
    { do: 'close', target: { to: 'socket', id: 'id:1' }, code: ROOM_CLOSE.tooLarge, reason: 'too-large' }
  ])
})

// ---- attach, replay and the nudge --------------------------------------------------------

test('a viewer attaching is told about the desk, replayed the cache, and nudges a resend', async () => {
  const core = await room()
  for (const channel of PHONE_CHANNELS) core.deskMessage(frame(channel, 1), T0)
  assert.equal(core.cached(), PHONE_CHANNELS.length, 'one frame per channel is held')

  const actions = sends(core.attachViewer('id:1', ctx(T0 + 1000, 1, true)))
  assert.deepEqual(actions[0], ['socket', JSON.stringify({ t: 'o', desk: true })])
  const replayed = actions.filter(([to, data]) => to === 'socket' && data.includes('"t":"f"'))
  assert.equal(replayed.length, PHONE_CHANNELS.length, 'every channel is replayed on attach')
  // The desk hears the count, and NOT a resend nudge - the cache is complete.
  assert.ok(actions.some(([to, data]) => to === 'desk' && data === JSON.stringify({ t: 'v', n: 1 })))
  assert.ok(!actions.some(([to, data]) => to === 'desk' && data === '{"t":"r"}'))
})

test('a room whose cache a hibernation emptied nudges the desk to resend everything', async () => {
  // A fresh core is exactly what an evicted-and-rebuilt Durable Object holds: the pairing from
  // storage, and no frames at all.
  const core = await room()
  const actions = sends(core.attachViewer('id:1', ctx(T0, 1, true)))
  assert.ok(actions.some(([to, data]) => to === 'desk' && data === '{"t":"r"}'), 'the resend nudge')
  // With no desk attached there is nobody to nudge and nothing to replay - just the honest pill.
  const alone = sends(new RoomCore().attachViewer('id:2', ctx(T0, 1, false)))
  assert.deepEqual(alone, [['socket', JSON.stringify({ t: 'o', desk: false })]])
})

test('four phones, and the fifth is refused rather than evicting somebody', async () => {
  const core = await room()
  assert.equal(PHONE_MAX_VIEWERS, 4)
  assert.equal(core.full(3), false)
  assert.equal(core.full(PHONE_MAX_VIEWERS), true)
  assert.equal(core.full(PHONE_MAX_VIEWERS + 1), true)
})

test('the desk attaching stamps the expiry clock and tells the phones', async () => {
  const core = await room()
  const later = T0 + 10 * 24 * 60 * 60 * 1000
  const actions = core.attachDesk(ctx(later, 2, true))
  assert.equal(core.record()?.lastDeskAt, later, 'the 30 days are measured from here')
  assert.ok(actions.some((a) => a.do === 'save'))
  assert.ok(actions.some((a) => a.do === 'alarm' && a.at === later + PHONE_ROOM_TTL_MS))
  assert.deepEqual(sends(actions), [
    ['viewers', JSON.stringify({ t: 'o', desk: true })],
    ['desk', JSON.stringify({ t: 'v', n: 2 })]
  ])
  // …and going away tells them too, which is the phone's "Desk offline" pill.
  assert.deepEqual(sends(core.detachDesk()), [['viewers', JSON.stringify({ t: 'o', desk: false })]])
})

// ---- expiry and unpair --------------------------------------------------------------------

test('the 30-day alarm: a desk that came back pushes it out, one that did not takes the room', async () => {
  const core = await room()
  const early = core.alarm(T0 + PHONE_ROOM_TTL_MS - 1000)
  assert.deepEqual(early, [{ do: 'alarm', at: T0 + PHONE_ROOM_TTL_MS }], 're-armed, not deleted')
  assert.ok(core.record(), 'still paired')

  const late = core.alarm(T0 + PHONE_ROOM_TTL_MS + 1)
  assert.equal(core.record(), null, 'the pairing is gone')
  assert.ok(late.some((a) => a.do === 'save' && a.pairing === null))
  for (const target of ['viewers', 'desk']) {
    assert.ok(
      late.some((a) => a.do === 'close' && a.target.to === target && a.code === ROOM_CLOSE.unpaired),
      `${target} is told why`
    )
  }
  assert.deepEqual(core.alarm(T0 + PHONE_ROOM_TTL_MS * 2), [], 'an unpaired room has no alarm left')
})

test('destroy takes the cache with the pairing', async () => {
  const core = await room()
  core.deskMessage(frame('status', 1), T0)
  assert.equal(core.cached(), 1)
  core.destroy()
  assert.equal(core.cached(), 0)
  assert.equal(core.record(), null)
})

// ---- the HTTP half, through the real handler ----------------------------------------------

class FakeKv implements KvLike {
  get(_key: string, _type: 'json'): Promise<unknown>
  get(_key: string, _type: 'arrayBuffer'): Promise<ArrayBuffer | null>
  get(_key: string, _type: 'text'): Promise<string | null>
  get(): Promise<unknown> {
    return Promise.resolve(null)
  }
  put(_key: string, _value: unknown, _options?: KvPutOptions): Promise<void> {
    return Promise.resolve()
  }
  delete(): Promise<void> {
    return Promise.resolve()
  }
}

/** One in-memory room per id, behind the same `{ idFromName, get }` shape the binding has. */
function namespace(): Env['PHONE_ROOMS'] {
  const rooms = new Map<string, RoomCore>()
  return {
    idFromName: (name: string) => name,
    get: (id: unknown) => ({
      fetch: async (request: Request): Promise<Response> => {
        const key = String(id)
        const path = new URL(request.url).pathname
        const core = rooms.get(key) ?? new RoomCore()
        rooms.set(key, core)
        if (path === '/create') {
          const body = (await request.json()) as { deskTokenHash: string }
          return new Response(null, { status: core.create(body.deskTokenHash, T0) ? 201 : 409 })
        }
        if (path === '/delete') {
          if (!core.record()) return new Response(null, { status: 404 })
          const token = request.headers.get('X-Desk-Token') ?? ''
          if (!(await core.opens(token))) return new Response(null, { status: 401 })
          core.destroy()
          return new Response(null, { status: 204 })
        }
        // The upgrade paths: the real class answers 101; the shape that matters to `phone.ts` is
        // that it FORWARDS, so a 200 here is enough to prove the route reached the object.
        if (!core.record()) return new Response(null, { status: 404 })
        return new Response(path, { status: 200 })
      }
    })
  }
}

function env(withRooms = true): Env {
  return {
    SHARES: new FakeKv(),
    PUBLIC_ORIGIN: ORIGIN,
    ...(withRooms ? { PHONE_ROOMS: namespace() } : {})
  }
}

function call(bindings: Env, method: string, path: string, init: RequestInit = {}): Promise<Response> {
  return handleRequest(new Request(`${ORIGIN}${path}`, { method, ...init }), bindings, () => T0)
}

function createBody(roomId: string, hash: string): RequestInit {
  return {
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ roomId, deskTokenHash: hash })
  }
}

test('POST /api/v1/phone/rooms: claim, then 409, then the shapes it refuses', async () => {
  const bindings = env()
  const hash = await sha256Hex(TOKEN)
  const made = await call(bindings, 'POST', '/api/v1/phone/rooms', createBody(ROOM, hash))
  assert.equal(made.status, 201)
  assert.equal(made.headers.get('Cache-Control'), 'no-store')
  assert.equal(made.headers.get('X-Content-Type-Options'), 'nosniff')
  const reply = (await made.json()) as { roomId: string; expiresAt: string }
  assert.equal(reply.roomId, ROOM)
  assert.equal(reply.expiresAt, new Date(T0 + PHONE_ROOM_TTL_MS).toISOString())

  const again = await call(bindings, 'POST', '/api/v1/phone/rooms', createBody(ROOM, hash))
  assert.equal(again.status, 409)
  assert.equal(((await again.json()) as { error: string }).error, 'room-exists')

  // A room id or a digest that is not the shape this app mints never reaches a Durable Object.
  for (const bad of [createBody('short', hash), createBody(ROOM, 'nothex'), createBody(ROOM, '')]) {
    assert.equal((await call(env(), 'POST', '/api/v1/phone/rooms', bad)).status, 400)
  }
  const notJson = await call(env(), 'POST', '/api/v1/phone/rooms', { body: '{}' })
  assert.equal(notJson.status, 415)
  assert.equal((await call(env(), 'GET', '/api/v1/phone/rooms')).status, 404, 'a wrong method is 404')
})

test('DELETE /api/v1/phone/rooms/:id needs the token, and then the room is gone', async () => {
  const bindings = env()
  const hash = await sha256Hex(TOKEN)
  await call(bindings, 'POST', '/api/v1/phone/rooms', createBody(ROOM, hash))

  const wrong = await call(bindings, 'DELETE', `/api/v1/phone/rooms/${ROOM}`, {
    headers: { Authorization: 'Bearer AAAAAAAAAAAAAAAAAAAA' }
  })
  assert.equal(wrong.status, 401)
  const none = await call(bindings, 'DELETE', `/api/v1/phone/rooms/${ROOM}`)
  assert.equal(none.status, 401, 'no header at all is the same answer')

  const gone = await call(bindings, 'DELETE', `/api/v1/phone/rooms/${ROOM}`, {
    headers: { Authorization: `Bearer ${TOKEN}` }
  })
  assert.equal(gone.status, 204)
  // …and every socket route for it now 404s, which is what makes Unpair mean what it says.
  for (const role of ['desk', 'view']) {
    const after = await call(bindings, 'GET', `/phone/room/${ROOM}/${role}`, {
      headers: { Upgrade: 'websocket' }
    })
    assert.equal(after.status, 404, role)
  }
})

test('the socket routes forward to the object, and refuse everything that is not an upgrade', async () => {
  const bindings = env()
  await call(bindings, 'POST', '/api/v1/phone/rooms', createBody(ROOM, await sha256Hex(TOKEN)))
  for (const role of ['desk', 'view']) {
    const ok = await call(bindings, 'GET', `/phone/room/${ROOM}/${role}`, {
      headers: { Upgrade: 'websocket' }
    })
    assert.equal(ok.status, 200, role)
    assert.equal(await ok.text(), `/${role}`)
  }
  const plain = await call(bindings, 'GET', `/phone/room/${ROOM}/view`)
  assert.equal(plain.status, 400)
  assert.equal(((await plain.json()) as { error: string }).error, 'not-websocket')
  // A room id of the wrong shape is not a route at all.
  assert.equal((await call(bindings, 'GET', '/phone/room/short/view')).status, 404)
})

test('a deployment with no Durable Object binding says so instead of failing', async () => {
  const bindings = env(false)
  const made = await call(bindings, 'POST', '/api/v1/phone/rooms', createBody(ROOM, await sha256Hex(TOKEN)))
  assert.equal(made.status, 503)
  assert.equal(((await made.json()) as { error: string }).error, 'phone-off')
})

// ---- the page ------------------------------------------------------------------------------

test('the page is one self-contained document with a strict CSP and one socket origin', async () => {
  const res = await call(env(), 'GET', '/phone/')
  assert.equal(res.status, 200)
  assert.match(res.headers.get('Content-Type') ?? '', /^text\/html/)
  const csp = res.headers.get('Content-Security-Policy') ?? ''
  assert.match(csp, /default-src 'none'/)
  assert.match(csp, /connect-src 'self' wss:\/\/share\.eqzera\.com/)
  assert.match(csp, /manifest-src 'self'/)
  assert.match(csp, /worker-src 'self'/)
  assert.ok(!csp.includes('unsafe-inline'), 'nothing is nonce-less')
  assert.match(csp, /script-src 'nonce-[A-Za-z0-9_-]+'/)

  const html = await res.text()
  const nonce = /script-src 'nonce-([A-Za-z0-9_-]+)'/.exec(csp)?.[1] ?? ''
  assert.ok(html.includes(`<script nonce="${nonce}">`), 'the one script carries the nonce')
  assert.ok(html.includes(`<style nonce="${nonce}">`), 'and so does the one stylesheet')
  assert.equal(html.split('<script').length - 1, 1, 'exactly one script element')
  assert.ok(!/ style="/.test(html), 'no style attributes - they are not nonce-able')
  assert.ok(html.includes('/phone/manifest.webmanifest'))
  // The first-run copy, which is the only prose on the page.
  assert.ok(html.includes('Preferences'))
  assert.ok(html.includes('Pair a phone'))
  // Two different responses carry two different nonces.
  const second = await call(env(), 'GET', '/phone/')
  assert.notEqual(second.headers.get('Content-Security-Policy'), csp)
})

test('the page carries all five tabs and no value from any request', () => {
  const html = phonePageHtml('abc')
  for (const tab of ['Live', 'Run', 'Timers', 'Character', 'Events']) {
    assert.ok(html.includes(`>${tab}</button>`), tab)
  }
  // It renders nothing from a stranger - there is no id, no profile and no interpolated text in it,
  // which is the one structural difference from `page.ts`.
  assert.ok(!html.includes('undefined'))
  assert.ok(html.includes('wakeLock'), 'the keep-screen-on path is in the script')
  assert.ok(html.includes('history.replaceState'), 'the key leaves the address bar on first open')
  assert.ok(html.includes('eqzera.phone.pair'), 'and is remembered under one key')
})

test('the manifest is installable and names only icons this service serves', async () => {
  const res = phoneManifest()
  assert.equal(res.headers.get('Content-Type'), 'application/manifest+json; charset=utf-8')
  const body = (await res.json()) as {
    name: string
    display: string
    scope: string
    icons: { src: string; sizes: string }[]
  }
  assert.equal(body.name, 'EQ Zera')
  assert.equal(body.display, 'standalone')
  assert.equal(body.scope, '/phone/')
  assert.deepEqual(body.icons.map((i) => i.src), ['/logo.png'])
  assert.deepEqual(body.icons.map((i) => i.sizes), ['256x256'], 'the one size logo.ts serves')
})

test('the service worker caches the SHELL ONLY and never a frame', async () => {
  const res = phoneServiceWorker()
  assert.match(res.headers.get('Content-Type') ?? '', /^text\/javascript/)
  const source = await res.text()
  assert.ok(source.includes("'/phone/'"))
  assert.ok(source.includes("'/phone/manifest.webmanifest'"))
  assert.ok(source.includes("'/logo.png'"))
  // It answers only for those three paths; a socket and every other request go straight to network.
  assert.ok(source.includes('SHELL.includes(u.pathname)'))
  assert.ok(!source.includes('room/'), 'it has no opinion about a room at all')
})

test('an unknown path under /phone is a 404 and does not fall through to the share routes', async () => {
  const res = await call(env(), 'GET', '/phone/nope')
  assert.equal(res.status, 404)
  assert.equal(((await res.json()) as { error: string }).error, 'not-found')
  // …and a share route still works, which is what "answers null for a path that is none of mine"
  // is there to guarantee.
  assert.equal((await call(env(), 'GET', '/')).status, 302)
})

test('the room contexts the adapter builds are the ones the policy expects', () => {
  // A small shape assertion, because `RoomNow` is the one place the adapter and the core meet and a
  // silently renamed field would make the viewer count quietly always zero.
  const c = ctx(T0, 3, false)
  assert.deepEqual(Object.keys(c).sort(), ['deskOnline', 'now', 'viewers'])
  assert.deepEqual(sends(new RoomCore().detachViewer(ctx(T0, 2, true))), [
    ['desk', JSON.stringify({ t: 'v', n: 2 })]
  ])
  assert.deepEqual(new RoomCore().detachViewer(ctx(T0, 2, false)), [], 'nobody to tell')
})
