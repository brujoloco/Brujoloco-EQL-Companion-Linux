// storePhone.ts — the phone link's one persisted row, read and written through one sanitizer.
//
// `storeShareLinks.ts` is the model and its two laws hold here for the same reasons:
//
//   * READ THROUGH THE SANITIZER, WRITE THROUGH THE SAME ONE. A store file is a place, not a type -
//     an ids-shaped string that is not an id this app minted must never reach a request path or a
//     cipher, so `sanitizePairing` (main/phone/crypto.ts) re-checks all three on the way out.
//   * NO SCHEMA BUMP. The key is additive and optional, and an absent one reads as the shipped
//     behaviour: the feature is off and there is no pairing.
//
// AND THE REASON THIS FILE EXISTS AT ALL is the DESK TOKEN. It is the only thing that can delete a
// room (and therefore the only thing that can make Unpair all phones mean what it says), so it is
// stored — and it is stripped everywhere a value is handed to anybody. `phoneView()` is what the
// renderer may hold; `phonePairing()` is main-side only and has exactly two callers, the desk and
// the pair-link handler.

import { settingsStore } from './store'
import { sanitizePairing, type PhonePairing } from './phone/crypto'

/** What the renderer may hold. No secret is in it - see the header. */
export interface PhoneView {
  enabled: boolean
  paired: boolean
}

/** Is the feature switched on? OFF is the shipped state and an absent key says so. */
export function phoneEnabled(): boolean {
  return settingsStore.get('phone')?.enabled === true
}

/** The stored pairing, re-validated. MAIN-SIDE ONLY - it carries both secrets. */
export function phonePairing(): PhonePairing | null {
  const held = settingsStore.get('phone')
  if (!held) return null
  return sanitizePairing({
    roomId: held.roomId,
    deskToken: held.deskToken,
    viewKey: held.viewKey
  })
}

export function phoneView(): PhoneView {
  return { enabled: phoneEnabled(), paired: phonePairing() !== null }
}

/** Turn the feature on or off. The pairing is KEPT either way - see `setPhonePairing`. */
export function setPhoneEnabled(on: boolean): PhoneView {
  settingsStore.set('phone', { ...settingsStore.get('phone'), enabled: on })
  return phoneView()
}

/**
 * Store a pairing, replacing whatever was there.
 *
 * TURNING THE SWITCH OFF DOES NOT UNPAIR. A person who switches the feature off for an evening and
 * back on the next day should find the code on their fridge still works; the thing that kills a
 * link is pressing Unpair all phones, which rotates both ids (ruling 3). So the pairing survives a
 * disable, and only `setPhonePairing` ever replaces it.
 */
export function setPhonePairing(pairing: PhonePairing): PhoneView {
  settingsStore.set('phone', {
    enabled: phoneEnabled(),
    roomId: pairing.roomId,
    deskToken: pairing.deskToken,
    viewKey: pairing.viewKey
  })
  return phoneView()
}
