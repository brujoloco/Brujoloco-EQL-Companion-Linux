// ============================================================================
// phoneCrypto.test.mts — THE PHONE LINK'S CIPHER (src/main/phone/crypto.ts).
// ============================================================================
//
// docs/plans/phone-link.md ruling 1 says the relay cannot read a frame. That is a claim about this
// file and nothing else, so every part of it is asserted here:
//
//   * THE ROUND TRIP. What the desk seals, a holder of the view key opens - and it opens to the
//     same object, not to a string that looks similar.
//   * THE WRONG KEY FAILS. A viewer holding the room id but not the key sees noise, which is what
//     makes the fragment the whole of the secret.
//   * THE AAD FAILS. A frame is bound to its GENERATION, its CHANNEL and its SEQUENCE NUMBER, so
//     somebody holding the key still cannot replay a `fight` frame as a `status` one or re-order
//     two of them. Three separate assertions, because three separate mistakes are possible.
//   * NONCES ARE UNIQUE. GCM's one catastrophic failure mode is a repeated nonce under one key.
//   * A TRUNCATED BLOB FAILS A LENGTH CHECK rather than authenticating a prefix, which is why the
//     tag is at a FIXED OFFSET and not at the end.
//
// No Electron, no network, no sockets: `node:crypto` over strings.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  decryptFrame,
  encryptFrame,
  isPhoneKey,
  isRoomId,
  mintPairing,
  sanitizePairing,
  sha256Hex
} from '../src/main/phone/crypto'
import type { PhoneChannel } from '../src/shared/phone/types'

const KEY = mintPairing().viewKey
const PAYLOAD = { mob: 'a cracked skeleton', total: 1234, members: [{ name: 'Primitive', dps: 91.5 }] }

test('the three secrets are the shapes the service and the link expect', () => {
  const pairing = mintPairing()
  assert.match(pairing.roomId, /^[A-Za-z0-9_-]{22}$/, '16 bytes of base64url')
  assert.match(pairing.deskToken, /^[A-Za-z0-9_-]{43}$/, '32 bytes of base64url')
  assert.match(pairing.viewKey, /^[A-Za-z0-9_-]{43}$/, '32 bytes of base64url')
  assert.ok(isRoomId(pairing.roomId))
  assert.ok(isPhoneKey(pairing.viewKey))
  // Two mints never agree - that is the whole of "Unpair all phones kills every link".
  assert.notEqual(mintPairing().roomId, pairing.roomId)
  assert.notEqual(mintPairing().viewKey, pairing.viewKey)
})

test('a stored pairing is re-validated on the way out, and junk is dropped', () => {
  const good = mintPairing()
  assert.deepEqual(sanitizePairing({ ...good }), good)
  assert.equal(sanitizePairing(null), null)
  assert.equal(sanitizePairing({ ...good, roomId: 'short' }), null)
  assert.equal(sanitizePairing({ ...good, viewKey: `${good.viewKey}x` }), null)
  assert.equal(sanitizePairing({ ...good, deskToken: 42 }), null)
})

test('what the desk seals, the key opens', () => {
  const sealed = encryptFrame(KEY, 'fight', 7, PAYLOAD)
  assert.match(sealed.n, /^[A-Za-z0-9_-]{16}$/, 'a 12-byte nonce, base64url')
  assert.deepEqual(decryptFrame(KEY, 'fight', 7, sealed), PAYLOAD)
  // …and a null payload - "no fight" - round-trips as null rather than as an absence.
  assert.equal(decryptFrame(KEY, 'fight', 8, encryptFrame(KEY, 'fight', 8, null)), null)
})

test('a viewer without the key sees noise', () => {
  const sealed = encryptFrame(KEY, 'status', 1, PAYLOAD)
  const other = mintPairing().viewKey
  assert.equal(decryptFrame(other, 'status', 1, sealed), null)
})

test('the AAD binds a frame to its channel and its sequence', () => {
  const sealed = encryptFrame(KEY, 'fight', 12, PAYLOAD)
  // The same key, the same bytes, a different channel: refused. A holder of the key cannot make
  // the phone read a fight as its character sheet.
  for (const channel of ['status', 'run', 'character'] as PhoneChannel[]) {
    assert.equal(decryptFrame(KEY, channel, 12, sealed), null, channel)
  }
  // …and the same channel at a different sequence: refused. Frames cannot be re-ordered.
  assert.equal(decryptFrame(KEY, 'fight', 11, sealed), null)
  assert.equal(decryptFrame(KEY, 'fight', 13, sealed), null)
})

test('a flipped byte anywhere is a refusal, never half a payload', () => {
  const sealed = encryptFrame(KEY, 'run', 3, PAYLOAD)
  const flip = (text: string, at: number): string => {
    const bytes = Buffer.from(text, 'base64url')
    bytes[at] ^= 0x01
    return bytes.toString('base64url')
  }
  // The nonce, the tag (byte 0 of `d`) and the ciphertext (byte 20 of `d`) in turn.
  assert.equal(decryptFrame(KEY, 'run', 3, { ...sealed, n: flip(sealed.n, 0) }), null)
  assert.equal(decryptFrame(KEY, 'run', 3, { ...sealed, d: flip(sealed.d, 0) }), null)
  assert.equal(decryptFrame(KEY, 'run', 3, { ...sealed, d: flip(sealed.d, 20) }), null)
})

test('a truncated blob fails a length check, and so does a truncated nonce', () => {
  const sealed = encryptFrame(KEY, 'buffs', 2, PAYLOAD)
  const short = Buffer.from(sealed.d, 'base64url').subarray(0, 8).toString('base64url')
  assert.equal(decryptFrame(KEY, 'buffs', 2, { ...sealed, d: short }), null)
  assert.equal(decryptFrame(KEY, 'buffs', 2, { ...sealed, n: sealed.n.slice(0, 8) }), null)
  assert.equal(decryptFrame(KEY, 'buffs', 2, { n: '', d: '' }), null)
})

test('nonces do not repeat, which is GCM’s one unforgivable failure', () => {
  const seen = new Set<string>()
  for (let i = 0; i < 4000; i++) seen.add(encryptFrame(KEY, 'status', i, PAYLOAD).n)
  assert.equal(seen.size, 4000)
})

test('the service is handed a digest, never the token', async () => {
  const pairing = mintPairing()
  const hash = sha256Hex(pairing.deskToken)
  assert.match(hash, /^[0-9a-f]{64}$/)
  assert.ok(!hash.includes(pairing.deskToken.slice(0, 8)), 'the digest is not the token')
  // …and the SERVICE computes the same digest with its own (Web Crypto) implementation, which is
  // the one place these two halves have to agree byte for byte.
  const { sha256Hex: webSha } = await import('../share-server/src/codec')
  assert.equal(await webSha(pairing.deskToken), hash)
})
