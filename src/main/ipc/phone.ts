// ---- the phone link (docs/plans/phone-link.md) ----
//
// Five doors over `../phone/index.ts`, and this file's whole job is the wiring plus ONE boundary
// decision: which of the feature's three secrets may cross, and when.
//
// ---------------------------------------------------------------------------
// TWO NEVER, ONE ONLY-WHILE-THE-DIALOG-IS-OPEN
// ---------------------------------------------------------------------------
// `deskToken` never crosses, in any form: it is what can delete the room, i.e. the only thing that
// makes "Unpair all phones" mean what it says, and the renderer has nothing to do with it - the
// same reason `character:shareLink` keeps its delete token rather than forwarding it.
//
// `viewKey` never crosses on its own either. It crosses INSIDE the pair link, because a pair link
// IS the key plus a locator, and the user is about to photograph that string with another device.
// `phone:pairUrl` is the one handler that returns it, the Preferences card calls it only while the
// pairing dialog is open, and the value lives in that dialog's React state and dies with it. It is
// not in `phone:getState`, so the card that is always on screen never holds it.
//
// `roomId` is not a secret at all - the service has it, because it is the address.
//
// NOTHING HERE LOGS A URL, A TOKEN OR A KEY (`share/discord.ts` item 6's law, restated).

import { ipcMain } from 'electron'
import { IPC } from '../../shared/ipc'
import {
  disablePhone,
  enablePhone,
  phonePairLink,
  phoneState,
  unpairAllPhones,
  type PhoneStateView
} from '../phone'
// The two shapes that cross this line, declared in `shared/` because the renderer's tsconfig does
// not include `src/preload` and the card has to be able to name them (shared/phone/types.ts).
import type { PhonePairUrlResult } from '../../shared/phone/types'

/** The one refusal this handler can give, in the app's own words. */
const NO_LINK = 'Turn on Send live data to my phone first.'

export function registerPhoneIpc(): void {
  ipcMain.handle(IPC.phoneGetState, (): PhoneStateView => phoneState())
  ipcMain.handle(IPC.phoneEnable, async (): Promise<PhoneStateView> => enablePhone())
  ipcMain.handle(IPC.phoneDisable, (): PhoneStateView => disablePhone())
  ipcMain.handle(IPC.phonePairUrl, (): PhonePairUrlResult => {
    const url = phonePairLink()
    return url === '' ? { ok: false, error: NO_LINK } : { ok: true, url }
  })
  ipcMain.handle(IPC.phoneUnpairAll, async (): Promise<PhoneStateView> => unpairAllPhones())
}
