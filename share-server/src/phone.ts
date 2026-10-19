// ============================================================================
// phone.ts — the phone link's ROUTES: two API calls, two upgrades, three static files.
// ============================================================================
//
// docs/plans/phone-link.md is the contract. This file is the dispatcher and the gate; every
// decision about a room is `phoneRoom.ts`'s, and every byte of the page is `phonePage.ts`'s.
//
// WHAT IT ENFORCES HERE RATHER THAN IN THE ROOM. Three things, because they are true before any
// particular room is addressed and it would be wasteful (and, for the rate limit, wrong) to wake a
// Durable Object to find them out: the room id's SHAPE, the rate limiters, and whether this
// deployment has the binding at all. Everything after that is forwarded to the object for that id.
//
// NO CORS on the API pair, like the rest of this service: the desktop app calls them from its MAIN
// process, never from a renderer. The two UPGRADE routes are a different matter and need no CORS
// either — a WebSocket handshake is not a CORS-governed request, and the page that opens one is
// served by this same origin.

import { DESK_TAG, VIEW_TAG, type Env } from './env'
import { clientIp, errorResponse, jsonResponse, noContentResponse, rateLimited } from './http'
import { phoneManifest, phonePage, phoneServiceWorker } from './phonePage'
import { PHONE_ROOM_TTL_MS } from '../../src/shared/phone/limits'

export const PHONE_API_PREFIX = '/api/v1/phone/rooms'
export const PHONE_PREFIX = '/phone'

/** A room id is 22 characters of base64url - 16 random bytes, minted by the desktop app. */
const ROOM_ID = /^[A-Za-z0-9_-]{22}$/

/** …and the desk token's digest is 64 lowercase hex characters. */
const TOKEN_HASH = /^[0-9a-f]{64}$/

/** The socket path: `/phone/room/<id>/desk` or `/phone/room/<id>/view`. */
const SOCKET_ROUTE = /^\/phone\/room\/([A-Za-z0-9_-]{22})\/(desk|view)$/

/** What this file needs from a request's world. Structurally satisfied by handler.ts's own `Ctx`. */
export interface PhoneCtx {
  request: Request
  env: Env
  now: () => number
  origin: string
}

function notFound(): Response {
  return errorResponse(404, 'not-found', 'No room lives at that address.')
}

function tooMany(): Response {
  return errorResponse(429, 'rate-limited', 'Too many requests. Try again in a minute.')
}

function off(): Response {
  return errorResponse(503, 'phone-off', 'This deployment has no phone relay.')
}

/** The object for one room id. `idFromName` makes the id the ADDRESS - there is no directory. */
function roomStub(env: Env, roomId: string): { fetch(request: Request): Promise<Response> } | null {
  const ns = env.PHONE_ROOMS
  return ns ? ns.get(ns.idFromName(roomId)) : null
}

/**
 * `POST /api/v1/phone/rooms` — claim a room id.
 *
 * THE BODY CARRIES A DIGEST, NEVER THE TOKEN (ruling 1). The desktop mints all three secrets
 * locally and sends `SHA-256(deskToken)`, so there is no moment at which this service holds the
 * thing that proves ownership — only something it can compare a later offer against.
 */
async function readCreateBody(
  request: Request
): Promise<{ ok: true; roomId: string; hash: string } | Response> {
  const type = (request.headers.get('Content-Type') ?? '').toLowerCase()
  if (!type.includes('application/json')) {
    return errorResponse(415, 'not-json', 'Send the body as application/json.')
  }
  const text = await request.text()
  if (text.length > 512) return errorResponse(413, 'too-large', 'That body is too large.')
  let parsed: unknown
  try {
    parsed = JSON.parse(text) as unknown
  } catch {
    return errorResponse(400, 'bad-json', 'The body is not valid JSON.')
  }
  const body = (parsed ?? {}) as Record<string, unknown>
  const roomId = typeof body.roomId === 'string' ? body.roomId : ''
  const hash = typeof body.deskTokenHash === 'string' ? body.deskTokenHash : ''
  if (!ROOM_ID.test(roomId) || !TOKEN_HASH.test(hash)) {
    return errorResponse(400, 'bad-room', 'Send a 22-character room id and a SHA-256 digest.')
  }
  return { ok: true, roomId, hash }
}

async function createRoom(ctx: PhoneCtx): Promise<Response> {
  if (await rateLimited(ctx.env.CREATE_LIMIT, clientIp(ctx.request))) return tooMany()
  const body = await readCreateBody(ctx.request)
  if (body instanceof Response) return body
  const { roomId, hash } = body
  const stub = roomStub(ctx.env, roomId)
  if (!stub) return off()
  const made = await stub.fetch(
    new Request('https://room/create', { method: 'POST', body: JSON.stringify({ deskTokenHash: hash }) })
  )
  if (made.status === 409) {
    return errorResponse(409, 'room-exists', 'That room id is already in use.')
  }
  const expiresAt = new Date(ctx.now() + PHONE_ROOM_TTL_MS).toISOString()
  return jsonResponse({ roomId, expiresAt }, 201, { 'Cache-Control': 'no-store' })
}

/** `DELETE /api/v1/phone/rooms/:id` — Unpair all phones. Bearer the desk token. */
async function deleteRoom(ctx: PhoneCtx, roomId: string): Promise<Response> {
  if (await rateLimited(ctx.env.CREATE_LIMIT, clientIp(ctx.request))) return tooMany()
  const header = ctx.request.headers.get('Authorization') ?? ''
  const match = /^Bearer ([A-Za-z0-9_-]{16,256})$/.exec(header.trim())
  if (!match) return errorResponse(401, 'unauthorized', 'That token does not open this room.')
  const stub = roomStub(ctx.env, roomId)
  if (!stub) return off()
  const gone = await stub.fetch(
    new Request('https://room/delete', { method: 'POST', headers: { 'X-Desk-Token': match[1] ?? '' } })
  )
  if (gone.status === 401) return errorResponse(401, 'unauthorized', 'That token does not open this room.')
  if (gone.status === 404) return notFound()
  return noContentResponse()
}

/** The API pair. A wrong method on a real path answers 404, like every other route here. */
async function apiRoute(ctx: PhoneCtx, path: string): Promise<Response> {
  const rest = path.slice(PHONE_API_PREFIX.length)
  if (rest === '' || rest === '/') {
    return ctx.request.method === 'POST' ? createRoom(ctx) : notFound()
  }
  const roomId = rest.slice(1)
  if (!ROOM_ID.test(roomId)) return notFound()
  return ctx.request.method === 'DELETE' ? deleteRoom(ctx, roomId) : notFound()
}

/**
 * The two upgrades. The desk's token rides in `Sec-WebSocket-Protocol` (a WebSocket client cannot
 * set an `Authorization` header); a viewer offers only the version token, because the room id is
 * 128 bits and the key that opens the frames is not on this side of the wire at all.
 */
async function socketRoute(ctx: PhoneCtx, roomId: string, role: string): Promise<Response> {
  if ((ctx.request.headers.get('Upgrade') ?? '').toLowerCase() !== 'websocket') {
    return errorResponse(400, 'not-websocket', 'That address takes a WebSocket upgrade.')
  }
  if (await rateLimited(ctx.env.READ_LIMIT, clientIp(ctx.request))) return tooMany()
  const stub = roomStub(ctx.env, roomId)
  if (!stub) return off()
  const target = role === DESK_TAG ? 'desk' : VIEW_TAG
  return stub.fetch(new Request(`https://room/${target}`, ctx.request))
}

/** The three static files: the page, its manifest and its shell-only service worker. */
function staticRoute(ctx: PhoneCtx, path: string): Response | null {
  const method = ctx.request.method
  if (method !== 'GET' && method !== 'HEAD') return null
  if (path === '/phone' || path === '/phone/') return phonePage(ctx.origin)
  if (path === '/phone/manifest.webmanifest') return phoneManifest()
  if (path === '/phone/sw.js') return phoneServiceWorker()
  return null
}

/** Everything under `/phone` and `/api/v1/phone`. `null` means "not one of mine". */
export async function phoneRoute(ctx: PhoneCtx, path: string): Promise<Response | null> {
  if (path === PHONE_API_PREFIX || path.startsWith(`${PHONE_API_PREFIX}/`)) {
    return apiRoute(ctx, path)
  }
  const socket = SOCKET_ROUTE.exec(path)
  if (socket) return socketRoute(ctx, socket[1] ?? '', socket[2] ?? '')
  const file = staticRoute(ctx, path)
  if (file) return file
  return path === PHONE_PREFIX || path.startsWith(`${PHONE_PREFIX}/`) ? notFound() : null
}
