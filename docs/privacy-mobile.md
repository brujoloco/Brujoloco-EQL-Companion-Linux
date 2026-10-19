# EQ Zera for iOS and Android — Privacy

*Draft, 2026-09-20. This is the text the App Store and Google Play privacy-policy URL must point
at. It has to be published at a public address (for example `https://eqzera.com/privacy-mobile/`)
before either app can be submitted; both stores refuse a submission without a reachable policy.*

---

## The short version

**EQ Zera collects nothing.** There is no account, no login, no sign-up, no analytics, no crash
reporter, no advertising identifier and no tracking of any kind. The app shows you an encrypted
view of data from your own PC, and it cannot read anything else.

## What the app handles, and where it goes

**An encrypted view of data from your own PC.** When you pair the app with the EQ Zera desktop
application, your PC begins sending small encrypted messages — your current fight, your instance
run, your timers, your character sheet and recent in-game events — through a relay service at
`share.eqzera.com`. **Your PC encrypts every message before it leaves the machine, with a key that
exists only on your PC and on the phones you have paired.** The relay passes the encrypted bytes
along; it holds no key and cannot read any of it. Neither can we.

**The pairing.** The app stores the pairing (an anonymous room identifier and the decryption key)
in your device's secure keystore — the iOS Keychain or Android's encrypted storage. It never leaves
your device.

**Your character, kept on the phone.** So that your character sheet works with no signal and with
your PC switched off, the app keeps the last copy it received in the app's own private storage,
**encrypted**, under a key that also lives in the secure keystore. It is not backed up to us, and
it is not sent anywhere.

**Camera.** The app asks for the camera only to scan the pairing QR code your PC displays. No image
is recorded, stored or transmitted; the camera is used to read one code and nothing else. You can
skip it entirely and paste the pairing link instead.

**Notifications (optional, off by default).** If — and only if — you turn on one of the
notification switches in Settings, the app asks your device for notification permission and
obtains a push token from Expo's push service. The token identifies your app installation so a
notification can be delivered to it; it is not a name, an email address or a device identifier we
can tie to a person.

**Notification text is the one thing in EQ Zera that is not private, and the app says so on the
screen before you turn it on.** A notification has to be readable to be displayed, so its short
text ("Boss kill" / a mob's name) passes through the relay service and through Apple's or Google's
push infrastructure in the clear. That is why notifications are off by default, why you turn them
on one kind at a time, and why the text is kept to a few words. Everything else in the app stays
encrypted. **The app works fully with notifications switched off.**

## What we do not do

* We do not collect, store or transmit personal information.
* We do not use analytics, telemetry, crash reporting or advertising SDKs. There is no such library
  in the app at all.
* We do not track you across apps or websites, and the app does not request the iOS tracking
  permission because it has nothing to track.
* We do not sell, share or disclose data, because we do not hold any.
* The app contacts exactly one host of its own — `share.eqzera.com` — and, only when you have
  enabled a notification, Expo's push-token service.

## Children

The app is not directed at children, collects nothing from anybody, and contains no user-generated
content, no chat, no advertising and no purchases.

## Deleting your data

**Settings › Forget this PC** deletes the pairing, the decryption key, the saved character and any
push token from the device, immediately and permanently. Uninstalling the app does the same. On the
PC side, **Preferences › Sharing › Unpair all phones** destroys the pairing at the relay and issues
a new key, so every link and every QR code already handed out stops working.

## Store questionnaire answers these lines support

| question | answer |
| --- | --- |
| Apple — Data collection | **Data Not Collected** |
| Apple — Tracking | No |
| Google — Data collected | None |
| Google — Data shared | None |
| Google — Encrypted in transit | Yes |
| Google — Deletion request | Yes, in the app (Forget this PC) |

## Contact

Questions about this policy: jack@revivemihome.com

*EQ Zera is not affiliated with, endorsed by or sponsored by Daybreak Game Company or the
EverQuest Legends team.*
