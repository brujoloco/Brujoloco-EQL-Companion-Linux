// store.test.ts — the carried character, round trip and wipe (ruling 8).
//
// The whole vault over an in-memory keystore and an in-memory file system. What is asserted is
// exactly the promise the feature makes: the Character tab works with no network and no desktop,
// what is on disk is unreadable without the keystore, and "Forget this PC" leaves nothing.

import { createVault, type BlobStore, type SecretStore, type VaultDeps } from './store'
import { fromBase64Url } from './crypto'

const ROOM = 'AbCdEfGhIjKlMnOpQrStUv'
const KEY = 'AbCdEfGhIjKlMnOpQrStUvWxYz0123456789-_AbCde'

const PROFILE = {
  v: 2,
  capturedAt: 1_757_000_000_000,
  name: 'Primitive',
  level: 60,
  classes: ['Cleric', 'Paladin'],
  cells: [{ slot: 'chest', label: 'Chest', item: 'Breastplate of Woe +5', tier: 5, exaltations: ['Sturdy'] }],
  totals: { ac: 447, stats: [{ label: 'STR', total: 92 }], saves: [], unsummed: [], counted: 12, unknown: 1 }
}

function memory(): VaultDeps & { keystore: Map<string, string>; files: Map<string, string>; seed: { n: number } } {
  const keystore = new Map<string, string>()
  const files = new Map<string, string>()
  const seed = { n: 1 }
  const secrets: SecretStore = {
    get: (key) => Promise.resolve(keystore.get(key) ?? null),
    set: (key, value) => {
      keystore.set(key, value)
      return Promise.resolve()
    },
    remove: (key) => {
      keystore.delete(key)
      return Promise.resolve()
    }
  }
  const blobs: BlobStore = {
    read: (name) => Promise.resolve(files.get(name) ?? null),
    write: (name, text) => {
      files.set(name, text)
      return Promise.resolve()
    },
    remove: (name) => {
      files.delete(name)
      return Promise.resolve()
    }
  }
  return {
    secrets,
    blobs,
    // Deterministic, so a test can say what was written; the real one is expo-crypto.
    randomBytes: (count) => new Uint8Array(count).map((_, i) => (i * 7 + seed.n++) & 0xff),
    keystore,
    files,
    seed
  }
}

describe('the pairing', () => {
  test('it round-trips through the keystore', async () => {
    const deps = memory()
    const vault = createVault(deps)
    expect(await vault.loadPairing()).toBeNull()
    await vault.savePairing({ roomId: ROOM, viewKey: KEY })
    expect(await vault.loadPairing()).toEqual({ roomId: ROOM, viewKey: KEY })
  })

  test('the view key is never written anywhere but the keystore', async () => {
    const deps = memory()
    const vault = createVault(deps)
    await vault.savePairing({ roomId: ROOM, viewKey: KEY })
    await vault.saveCarried('character', PROFILE)
    for (const blob of deps.files.values()) expect(blob).not.toContain(KEY)
  })

  test('a keystore holding junk reads as unpaired, not as a pairing', async () => {
    const deps = memory()
    const vault = createVault(deps)
    deps.keystore.set('eqzera.phone.roomId', 'too-short')
    deps.keystore.set('eqzera.phone.viewKey', KEY)
    expect(await vault.loadPairing()).toBeNull()
    deps.keystore.set('eqzera.phone.roomId', ROOM)
    deps.keystore.set('eqzera.phone.viewKey', `${KEY}x`)
    expect(await vault.loadPairing()).toBeNull()
  })
})

describe('the carried character (ruling 8)', () => {
  test('what is saved is read back, byte for byte, with no network in sight', async () => {
    const vault = createVault(memory())
    expect(await vault.loadCarried('character')).toBeNull()
    await vault.saveCarried('character', PROFILE)
    expect(await vault.loadCarried('character')).toEqual(PROFILE)
  })

  test('status is carried too, and the two entries do not collide', async () => {
    const vault = createVault(memory())
    const status = { at: 1, name: 'Primitive', classes: ['Cleric'], inCombat: false, app: '1.20.1' }
    await vault.saveCarried('character', PROFILE)
    await vault.saveCarried('status', status)
    expect(await vault.loadCarried('character')).toEqual(PROFILE)
    expect(await vault.loadCarried('status')).toEqual(status)
  })

  test('what lands on disk is ciphertext — the character’s name is not in it', async () => {
    const deps = memory()
    const vault = createVault(deps)
    await vault.saveCarried('character', PROFILE)
    const blob = deps.files.get('eqzera-character.bin')!
    expect(blob).not.toContain('Primitive')
    expect(blob).not.toContain('Breastplate')
    // …and it decodes as bytes rather than as text.
    expect(fromBase64Url(blob)!.length).toBeGreaterThan(64)
  })

  test('a cache the keystore cannot open is an EMPTY cache, never a crash', async () => {
    const deps = memory()
    const vault = createVault(deps)
    await vault.saveCarried('character', PROFILE)
    // The phone was restored from a backup that carried the file and not the keystore.
    deps.keystore.delete('eqzera.phone.cacheKey')
    const reopened = createVault({ ...deps, secrets: deps.secrets, blobs: deps.blobs })
    expect(await reopened.loadCarried('character')).toBeNull()
  })

  test('a truncated file is an empty cache too', async () => {
    const deps = memory()
    const vault = createVault(deps)
    await vault.saveCarried('character', PROFILE)
    deps.files.set('eqzera-character.bin', deps.files.get('eqzera-character.bin')!.slice(0, 20))
    expect(await vault.loadCarried('character')).toBeNull()
  })

  test('each save uses a fresh nonce — two saves of the same value differ on disk', async () => {
    const deps = memory()
    const vault = createVault(deps)
    await vault.saveCarried('character', PROFILE)
    const first = deps.files.get('eqzera-character.bin')
    await vault.saveCarried('character', PROFILE)
    expect(deps.files.get('eqzera-character.bin')).not.toBe(first)
  })
})

describe('the push registration', () => {
  test('a real Expo token round-trips with its kinds', async () => {
    const vault = createVault(memory())
    const token = 'ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]'
    await vault.savePush({ token, kinds: ['bossKill', 'levelUp'] })
    expect(await vault.loadPush()).toEqual({ token, kinds: ['bossKill', 'levelUp'] })
  })

  test('anything that is not an Expo token is refused rather than stored', async () => {
    const deps = memory()
    const vault = createVault(deps)
    await vault.savePush({ token: 'https://evil.tld/hook', kinds: ['bossKill'] })
    expect(await vault.loadPush()).toBeNull()
    expect(deps.keystore.has('eqzera.phone.push')).toBe(false)
  })

  test('null deregisters', async () => {
    const vault = createVault(memory())
    await vault.savePush({ token: 'ExponentPushToken[abc]', kinds: ['death'] })
    await vault.savePush(null)
    expect(await vault.loadPush()).toBeNull()
  })
})

describe('Forget this PC', () => {
  test('it leaves the keystore and the file area empty', async () => {
    const deps = memory()
    const vault = createVault(deps)
    await vault.savePairing({ roomId: ROOM, viewKey: KEY })
    await vault.savePush({ token: 'ExponentPushToken[abc]', kinds: ['bossKill'] })
    await vault.saveCarried('character', PROFILE)
    await vault.saveCarried('status', { at: 1, classes: [], inCombat: false, app: '1' })

    await vault.forget()

    expect(deps.keystore.size).toBe(0)
    expect(deps.files.size).toBe(0)
    expect(await vault.loadPairing()).toBeNull()
    expect(await vault.loadCarried('character')).toBeNull()
    expect(await vault.loadPush()).toBeNull()
  })

  test('a second Forget has nothing left to do and does not throw', async () => {
    const vault = createVault(memory())
    await vault.forget()
    await expect(vault.forget()).resolves.toBeUndefined()
  })
})
