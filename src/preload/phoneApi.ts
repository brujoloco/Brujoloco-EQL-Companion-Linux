// preload/phoneApi.ts — EQ ZERA ON YOUR PHONE, as one spread into `api`
// (docs/plans/phone-link.md).
//
// Its own file the way `syncApi.ts` and `discordApi.ts` are: index.ts sits at its max-lines
// ceiling, and a feature's doors read better together than scattered through that list.
//
// ONE OF THESE FIVE CARRIES A SECRET AND THE OTHER FOUR DO NOT. `phonePairUrl` answers the pair
// link, which contains the view key - that is what a pair link is, and the user is about to
// photograph it with another device. The Preferences card calls it ONLY while the pairing dialog is
// open and drops the value when that dialog unmounts; it is not in `phoneGetState`, it is never put
// in localStorage, and it is never logged. The desk token does not cross at all, in any form.
//
// AND NOTHING HERE OPENS A SOCKET. The renderer performs no network (`connect-src 'self'`); main
// holds the connection, the key and the cipher (src/main/phone/), which is what `available`
// reports to the card in a dark build.

import { ipcRenderer } from 'electron'
import { IPC } from '../shared/ipc'
import type { PhoneCardView, PhonePairUrlResult } from '../shared/phone/types'

export const phoneApi = {
  /** The card's state, on mount and after every action. */
  phoneGetState: (): Promise<PhoneCardView> => ipcRenderer.invoke(IPC.phoneGetState),
  /** Switch it on: main mints a pairing if there is none, claims the room and connects. */
  phoneEnable: (): Promise<PhoneCardView> => ipcRenderer.invoke(IPC.phoneEnable),
  /** Switch it off. The pairing SURVIVES - only Unpair kills a link. */
  phoneDisable: (): Promise<PhoneCardView> => ipcRenderer.invoke(IPC.phoneDisable),
  /** The pair link, for the pairing dialog only - see the header. */
  phonePairUrl: (): Promise<PhonePairUrlResult> => ipcRenderer.invoke(IPC.phonePairUrl),
  /** Unpair all phones: both ids rotate, so every link already handed out is dead. */
  phoneUnpairAll: (): Promise<PhoneCardView> => ipcRenderer.invoke(IPC.phoneUnpairAll)
}
