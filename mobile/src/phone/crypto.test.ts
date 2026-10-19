// crypto.test.ts — THE CONFORMANCE VECTORS (docs/plans/phone-native.md, section 3).
//
// Every row of `vectors.json` was produced by the DESKTOP's own `src/main/phone/crypto.ts` —
// `node:crypto`, AES-256-GCM — via `scripts/gen-vectors.mts`, and every row is asserted here
// against this app's pure-JavaScript `openFrame`. The cases are the cases
// `tests/phoneCrypto.test.mts` makes about the sealing half, one for one:
//
//   the round trip · a null payload · the wrong key · the AAD binding the channel · the AAD
//   binding the sequence · a flipped byte in the nonce, the tag and the ciphertext · a truncated
//   blob · a truncated nonce · an empty frame · nonces that do not repeat.
//
// If the two implementations ever disagree about a single byte, this file is where it surfaces,
// on a CI runner, with no phone in the room.

import { fromBase64Url, KEY_BYTES, NONCE_BYTES, openCache, openFrame, sealCache, toBase64Url } from './crypto'
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

const { vectors, nonces } = vectorFile as { vectors: Vector[]; nonces: string[] }

describe('the desktop’s vectors, opened by this app', () => {
  test('there are vectors at all, and they cover both verdicts', () => {
    expect(vectors.length).toBeGreaterThanOrEqual(20)
    expect(vectors.some((v) => v.expect !== undefined)).toBe(true)
    expect(vectors.some((v) => v.expect === undefined)).toBe(true)
  })

  test.each(vectors.map((v) => [v.name, v] as const))('%s', (_name, vector) => {
    const opened = openFrame(vector.key, vector.channel as PhoneChannel, vector.seq, vector.frame)
    if (vector.expect === undefined) {
      // A REFUSAL IS NULL, never a throw and never half a payload.
      expect(opened).toBeNull()
      return
    }
    expect(opened).not.toBeNull()
    expect(JSON.stringify(opened?.value ?? null)).toBe(vector.expect)
  })

  test('the desk’s nonces do not repeat, which is GCM’s one unforgivable failure', () => {
    expect(new Set(nonces).size).toBe(nonces.length)
    for (const nonce of nonces.slice(0, 50)) {
      expect(fromBase64Url(nonce)?.length).toBe(NONCE_BYTES)
    }
  })
})

describe('base64url, written out rather than borrowed', () => {
  test('it round-trips every byte value', () => {
    const all = new Uint8Array(256)
    for (let i = 0; i < 256; i++) all[i] = i
    expect(fromBase64Url(toBase64Url(all))).toEqual(all)
  })

  test('it answers null for anything that is not base64url', () => {
    expect(fromBase64Url('a+b/c=')).toBeNull()
    expect(fromBase64Url('....')).toBeNull()
    // A length that cannot be a whole number of bytes.
    expect(fromBase64Url('A')).toBeNull()
    // …and the real keys and nonces of this protocol ARE base64url.
    expect(fromBase64Url(vectors[0]!.key)?.length).toBe(KEY_BYTES)
  })
})

describe('the carried character, at rest (ruling 8)', () => {
  const key = new Uint8Array(KEY_BYTES).map((_, i) => (i * 37) & 0xff)
  const nonce = new Uint8Array(NONCE_BYTES).map((_, i) => (i * 11) & 0xff)
  const profile = { v: 2, name: 'Primitive', cells: [{ slot: 'chest', item: 'Breastplate of Woe +5' }] }

  test('what it seals, the same key opens', () => {
    const blob = sealCache(key, 'character', profile, nonce)
    expect(openCache(key, 'character', blob)?.value).toEqual(profile)
  })

  test('a different key, a different entry name and a tampered byte all answer null', () => {
    const blob = sealCache(key, 'character', profile, nonce)
    const other = new Uint8Array(KEY_BYTES).map((_, i) => (i * 41) & 0xff)
    expect(openCache(other, 'character', blob)).toBeNull()
    // The AAD carries the entry's NAME, so the character blob cannot be read as the status blob.
    expect(openCache(key, 'status', blob)).toBeNull()
    const bytes = fromBase64Url(blob)!
    bytes[bytes.length - 1] = (bytes[bytes.length - 1] ?? 0) ^ 0x01
    expect(openCache(key, 'character', toBase64Url(bytes))).toBeNull()
  })

  test('a truncated file answers null rather than throwing', () => {
    const blob = sealCache(key, 'character', profile, nonce)
    expect(openCache(key, 'character', blob.slice(0, 6))).toBeNull()
    expect(openCache(key, 'character', '')).toBeNull()
    expect(openCache(key, 'character', 'not base64url +/=')).toBeNull()
  })
})
