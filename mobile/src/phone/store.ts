// ============================================================================
// phone/store.ts — WHAT THE PHONE KEEPS, AND HOW (docs/plans/phone-native.md, ruling 8).
// ============================================================================
//
// "Carry your character with you" means the data is on the phone when nothing else is — which
// means it is on the phone when the phone is lost. So there are two tiers and they are not
// interchangeable:
//
//   THE SECRETS — `roomId`, `viewKey`, and the push token — live in the platform KEYSTORE
//     (`expo-secure-store`: the iOS Keychain, Android's EncryptedSharedPreferences over the
//     hardware Keystore). Small, sensitive, and never in AsyncStorage, never in a log, never in
//     navigation state, never rendered except as a mask.
//
//   THE CARRIED PAYLOADS — the last `character` and `status` frames — are far larger than a
//     keystore entry is built for, so they live in the app's private document directory as
//     AES-256-GCM ciphertext under a SEPARATE 32-byte cache key that itself lives in the keystore.
//     Losing the keystore entry loses the cache, which is the correct failure: an unreadable cache
//     is an empty cache, and an empty cache is a screen that says "no character yet".
//
// EVERY SEAM IS INJECTED, for `relay.ts`'s reason: `store.test.ts` drives the whole thing over an
// in-memory keystore and an in-memory file system, so the round trip, the wrong-key refusal and
// the wipe are asserted without a device. `native-store.ts` is the twenty lines that wire the real
// Expo modules in.

import { KEY_BYTES, NONCE_BYTES, openCache, sealCache, toBase64Url, fromBase64Url } from './crypto'
import type { Pairing } from './pair-link'

/** The keystore, as this file uses one. Four methods, all async, none of which may throw. */
export interface SecretStore {
  get: (key: string) => Promise<string | null>
  set: (key: string, value: string) => Promise<void>
  remove: (key: string) => Promise<void>
}

/** The private file area. One text file per cache entry; a missing file reads as `null`. */
export interface BlobStore {
  read: (name: string) => Promise<string | null>
  write: (name: string, text: string) => Promise<void>
  remove: (name: string) => Promise<void>
}

export interface VaultDeps {
  secrets: SecretStore
  blobs: BlobStore
  /** Cryptographically secure bytes. `expo-crypto`'s `getRandomBytes` on a device. */
  randomBytes: (count: number) => Uint8Array
}

/** The keystore keys. Namespaced, because a keystore is shared with nothing but is forever. */
const KEYS = {
  room: 'eqzera.phone.roomId',
  view: 'eqzera.phone.viewKey',
  cache: 'eqzera.phone.cacheKey',
  push: 'eqzera.phone.push'
} as const

/** What may be carried. Two entries, named, because the AAD binds the name (`crypto.ts`). */
export const CARRIED = ['character', 'status'] as const
export type CarriedName = (typeof CARRIED)[number]

/** The push registration this app holds locally. The relay half is not built (section 6). */
export interface PushRegistration {
  token: string
  kinds: string[]
}

export interface Vault {
  loadPairing: () => Promise<Pairing | null>
  savePairing: (pairing: Pairing) => Promise<void>
  loadCarried: (name: CarriedName) => Promise<unknown>
  saveCarried: (name: CarriedName, value: unknown) => Promise<void>
  loadPush: () => Promise<PushRegistration | null>
  savePush: (registration: PushRegistration | null) => Promise<void>
  /** Forget this PC: the secrets, the cache key and every carried file. */
  forget: () => Promise<void>
}

const ROOM_ID = /^[A-Za-z0-9_-]{22}$/
const VIEW_KEY = /^[A-Za-z0-9_-]{43}$/
const PUSH_TOKEN = /^ExponentPushToken\[[A-Za-z0-9_-]{1,64}\]$/

/** A cache entry's file name. One per carried name, and nothing else may be written. */
function fileFor(name: CarriedName): string {
  return `eqzera-${name}.bin`
}

export function createVault(deps: VaultDeps): Vault {
  /** The at-rest key, minted on first use. Held for the process; the keystore is the truth. */
  let cacheKey: Uint8Array | null = null

  const keyBytes = async (): Promise<Uint8Array> => {
    if (cacheKey) return cacheKey
    const held = await deps.secrets.get(KEYS.cache)
    const decoded = held === null ? null : fromBase64Url(held)
    if (decoded?.length === KEY_BYTES) {
      cacheKey = decoded
      return decoded
    }
    const fresh = deps.randomBytes(KEY_BYTES)
    await deps.secrets.set(KEYS.cache, toBase64Url(fresh))
    cacheKey = fresh
    return fresh
  }

  return {
    // THE PAIRING IS RE-VALIDATED ON THE WAY OUT, the `sanitizePairing` rule: a keystore is a file
    // somebody with a rooted phone can write, and these two values decide a URL and a cipher key.
    loadPairing: async () => {
      const roomId = await deps.secrets.get(KEYS.room)
      const viewKey = await deps.secrets.get(KEYS.view)
      if (roomId === null || viewKey === null) return null
      if (!ROOM_ID.test(roomId) || !VIEW_KEY.test(viewKey)) return null
      return { roomId, viewKey }
    },

    savePairing: async (pairing) => {
      await deps.secrets.set(KEYS.room, pairing.roomId)
      await deps.secrets.set(KEYS.view, pairing.viewKey)
    },

    loadCarried: async (name) => {
      const text = await deps.blobs.read(fileFor(name))
      if (text === null) return null
      const opened = openCache(await keyBytes(), name, text)
      // A cache that will not open is an EMPTY cache, never an error: the key was rotated, the
      // file was truncated by a crash, or the phone was restored from a backup without the
      // keystore. Every one of those is "no character yet", which is a screen this app has.
      return opened ? opened.value : null
    },

    saveCarried: async (name, value) => {
      const blob = sealCache(await keyBytes(), name, value, deps.randomBytes(NONCE_BYTES))
      await deps.blobs.write(fileFor(name), blob)
    },

    loadPush: async () => {
      const held = await deps.secrets.get(KEYS.push)
      if (held === null) return null
      try {
        const parsed = JSON.parse(held) as { token?: unknown; kinds?: unknown }
        if (typeof parsed.token !== 'string' || !PUSH_TOKEN.test(parsed.token)) return null
        if (!Array.isArray(parsed.kinds)) return null
        return { token: parsed.token, kinds: parsed.kinds.filter((k): k is string => typeof k === 'string') }
      } catch {
        return null
      }
    },

    savePush: async (registration) => {
      if (registration === null || !PUSH_TOKEN.test(registration.token)) {
        await deps.secrets.remove(KEYS.push)
        return
      }
      await deps.secrets.set(KEYS.push, JSON.stringify(registration))
    },

    // FORGET THIS PC. Both secrets, the cache key, the push token and every carried file — in
    // that order, so an interruption anywhere leaves a cache nothing can open rather than a
    // pairing with no cache.
    forget: async () => {
      cacheKey = null
      await deps.secrets.remove(KEYS.room)
      await deps.secrets.remove(KEYS.view)
      await deps.secrets.remove(KEYS.cache)
      await deps.secrets.remove(KEYS.push)
      for (const name of CARRIED) await deps.blobs.remove(fileFor(name))
    }
  }
}
