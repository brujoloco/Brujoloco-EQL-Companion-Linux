// ============================================================================
// phone/crypto.ts — THE THREE SECRETS, AND THE ONE CIPHER (docs/plans/phone-link.md, ruling 1).
// ============================================================================
//
// `share/syncCrypto.ts`'s law, one feature on: THE SERVICE RELAYS BYTES IT CANNOT READ, and this
// file is the whole reason that sentence is true rather than promised.
//
//  1. ALL THREE SECRETS ARE MINTED HERE, ON THIS MACHINE. The `roomId` is the only one the service
//     ever learns; the `deskToken` reaches it as a SHA-256 digest and never as itself (the create
//     call sends the hash, so there is no moment at which the service holds the token); the
//     `viewKey` is sent nowhere at all and travels only in the fragment of the pair link, which a
//     browser does not put in a request.
//  2. AES-256-GCM, A FRESH NONCE PER FRAME, AND THE CHANNEL AND SEQUENCE AS AAD. The key is the 32
//     raw `viewKey` bytes - it is already 256 bits of `randomBytes`, so there is nothing for a KDF
//     to add. The AAD binds every frame to its generation, its channel and its place in that
//     channel's sequence, so a holder of the key cannot replay a `fight` frame as a `status` one or
//     re-order two frames and have the phone believe either.
//  3. THE TAG SITS AT A FIXED OFFSET. `d = base64url(tag ‖ ciphertext)`, so a truncated frame fails
//     a length check rather than authenticating a prefix.
//  4. NOTHING HERE THROWS. `decryptFrame` answers null - a phone with the wrong key, and the unit
//     suite's tampering cases, must be a refusal rather than an exception in a socket handler.
//
// Node-testable with no Electron and no network (tests/phoneCrypto.test.mts): everything is
// `node:crypto` over strings.

import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { PHONE_PROTOCOL, type PhoneChannel } from '../../shared/phone/types'

/** The room id: 16 random bytes, base64url, 22 characters. 128 bits - it is a public locator. */
export const ROOM_ID_BYTES = 16

/** The desk token: 32 random bytes, base64url, 43 characters. It proves "I am the desktop". */
export const DESK_TOKEN_BYTES = 32

/** The view key: 32 raw bytes, used as the AES-256 key directly. 43 characters as base64url. */
export const VIEW_KEY_BYTES = 32

const IV_BYTES = 12
const TAG_BYTES = 16
const ALGO = 'aes-256-gcm'

/** A room id, as this app is willing to spell one - closed, because it goes into a request path. */
const ROOM_ID = /^[A-Za-z0-9_-]{22}$/

/** …and the two 32-byte secrets, which are 43 base64url characters with no padding. */
const KEY_CHARS = /^[A-Za-z0-9_-]{43}$/

/** One pairing's three secrets. Only `roomId` ever reaches the service in the clear. */
export interface PhonePairing {
  roomId: string
  deskToken: string
  /** base64url of the 32 raw key bytes. Stored main-side; shown only inside the pair link. */
  viewKey: string
}

export function isRoomId(raw: unknown): raw is string {
  return typeof raw === 'string' && ROOM_ID.test(raw)
}

export function isPhoneKey(raw: unknown): raw is string {
  return typeof raw === 'string' && KEY_CHARS.test(raw)
}

/** A fresh pairing. The ONLY place any of these three values is created. */
export function mintPairing(): PhonePairing {
  return {
    roomId: randomBytes(ROOM_ID_BYTES).toString('base64url'),
    deskToken: randomBytes(DESK_TOKEN_BYTES).toString('base64url'),
    viewKey: randomBytes(VIEW_KEY_BYTES).toString('base64url')
  }
}

/** A stored pairing, re-checked on the way out of the store file. Anything else is null. */
export function sanitizePairing(raw: unknown): PhonePairing | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  if (!isRoomId(r.roomId) || !isPhoneKey(r.deskToken) || !isPhoneKey(r.viewKey)) return null
  return { roomId: r.roomId, deskToken: r.deskToken, viewKey: r.viewKey }
}

/** SHA-256 of a UTF-8 string as lowercase hex — what the room stores instead of the token. */
export function sha256Hex(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex')
}

/** Constant-time digest comparison, for a caller that has to check one. */
export function digestsMatch(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  return timingSafeEqual(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'))
}

/** What binds a frame to its generation, its channel and its place in the sequence. See item 2. */
export function frameAad(channel: PhoneChannel, seq: number): Buffer {
  return Buffer.from(`${PHONE_PROTOCOL}|${channel}|${String(seq)}`, 'utf8')
}

/** One frame's two wire fields: the nonce and `tag ‖ ciphertext`, both base64url. */
export interface SealedFrame {
  n: string
  d: string
}

/** Encrypt one channel payload. `viewKey` is base64url of the 32 raw key bytes. */
export function encryptFrame(
  viewKey: string,
  channel: PhoneChannel,
  seq: number,
  payload: unknown
): SealedFrame {
  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv(ALGO, Buffer.from(viewKey, 'base64url'), iv, {
    authTagLength: TAG_BYTES
  })
  cipher.setAAD(frameAad(channel, seq))
  const body = Buffer.concat([cipher.update(JSON.stringify(payload ?? null), 'utf8'), cipher.final()])
  return {
    n: iv.toString('base64url'),
    d: Buffer.concat([cipher.getAuthTag(), body]).toString('base64url')
  }
}

/**
 * The other direction — the phone's job, implemented here so the suite can prove the round trip
 * and every one of its refusals without a browser. A wrong key, a wrong channel, a wrong sequence,
 * a flipped byte and a truncated blob all answer null.
 */
export function decryptFrame(
  viewKey: string,
  channel: PhoneChannel,
  seq: number,
  frame: SealedFrame
): unknown {
  try {
    const iv = Buffer.from(frame.n, 'base64url')
    const blob = Buffer.from(frame.d, 'base64url')
    if (iv.length !== IV_BYTES || blob.length < TAG_BYTES) return null
    const decipher = createDecipheriv(ALGO, Buffer.from(viewKey, 'base64url'), iv, {
      authTagLength: TAG_BYTES
    })
    decipher.setAAD(frameAad(channel, seq))
    decipher.setAuthTag(blob.subarray(0, TAG_BYTES))
    const text = Buffer.concat([decipher.update(blob.subarray(TAG_BYTES)), decipher.final()]).toString('utf8')
    return JSON.parse(text) as unknown
  } catch {
    return null
  }
}
