// phone/native-store.ts — the twenty lines that wire the real platform into `store.ts`.
//
// Everything interesting about the vault is in `store.ts`, behind injected seams, so that it can
// be tested. THIS file is the part that cannot be tested off a device, and it is kept this short
// on purpose: there is no logic here to be wrong, only three adapters.
//
//   expo-secure-store  → the iOS Keychain and Android's EncryptedSharedPreferences. The two
//                        secrets and the at-rest key live here and nowhere else.
//   expo-file-system   → the app's own document directory, which is private to the app on both
//                        platforms and is excluded from iCloud/Google backup by default for
//                        documents the app does not mark otherwise.
//   expo-crypto        → `getRandomBytes`, the one thing pure JavaScript cannot do honestly.
//
// EVERY CALL IS WRAPPED. A keystore read throws when the device is locked in some states, a file
// read throws when the file is not there, and neither is an error this app narrates: an absent
// secret is "not paired" and an unreadable cache is "no character yet", both of which are screens.

import { getRandomBytes } from 'expo-crypto'
import { File, Paths } from 'expo-file-system'
import { deleteItemAsync, getItemAsync, setItemAsync } from 'expo-secure-store'
import { createVault, type BlobStore, type SecretStore, type Vault } from './store'

const secrets: SecretStore = {
  get: async (key) => {
    try {
      return await getItemAsync(key)
    } catch {
      return null
    }
  },
  set: async (key, value) => {
    try {
      await setItemAsync(key, value, { keychainAccessible: 3 /* WHEN_UNLOCKED_THIS_DEVICE_ONLY */ })
    } catch {
      /* a keystore that will not take a write leaves the app unpaired, which is a screen */
    }
  },
  remove: async (key) => {
    try {
      await deleteItemAsync(key)
    } catch {
      /* already gone */
    }
  }
}

const blobs: BlobStore = {
  read: (name) => {
    try {
      const file = new File(Paths.document, name)
      return Promise.resolve(file.exists ? file.textSync() : null)
    } catch {
      return Promise.resolve(null)
    }
  },
  write: (name, text) => {
    try {
      const file = new File(Paths.document, name)
      if (!file.exists) file.create({ overwrite: true })
      file.write(text)
    } catch {
      /* a cache that cannot be written is a cache that will be empty next launch */
    }
    return Promise.resolve()
  },
  remove: (name) => {
    try {
      const file = new File(Paths.document, name)
      if (file.exists) file.delete()
    } catch {
      /* already gone */
    }
    return Promise.resolve()
  }
}

/** The one vault this app has. */
export const vault: Vault = createVault({ secrets, blobs, randomBytes: getRandomBytes })
