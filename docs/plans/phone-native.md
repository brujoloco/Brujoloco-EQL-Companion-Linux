# Phone native — carry your character with you

Status: **IN BUILD** (2026-09-20). Phase 2 of `docs/plans/phone-link.md`. That page is still the
contract for the wire; this one only adds to it, and says which additions are built here and which
are written down and deliberately left unbuilt.

## The owner's direction (2026-09-20)

> *"I'd like an app"* … a native iOS + Android app *"that allows you to carry your character with
> you on your phone."*

Phase 1 shipped: a PWA at `https://share.eqzera.com/phone/`, paired by QR, five tabs, live off the
relay. It is good and it stays. Phase 2 is **one more VIEWER of the same relay, with the same
encryption, plus the three things a web page cannot do**:

1. **It is installed.** An icon on the home screen that is really there, from a store, that survives
   a browser cache eviction and does not need a URL anybody has to keep.
2. **The character is CARRIED.** The last `character` and `status` payloads are kept on the phone,
   encrypted at rest, so the Character tab is a real answer in a queue, on a plane, with the PC off.
   The PWA cannot promise this: its storage is the browser's to evict, and it holds nothing
   deliberately.
3. **It can be told.** Push notifications for the six celebration kinds — the one capability the
   phase-1 plan named as impossible and the one that needs an owner ruling, because it is the first
   thing in this feature that leaves the zero-knowledge envelope.

Everything else it does, the PWA already does. That is the point: **the same relay, the same
cipher, the same seven channels, the same view models.** This app adds no protocol generation and
no second source of truth about what a fight or a run means.

---

## Owner rulings

The six rulings of `phone-link.md` all still hold, unchanged and unweakened. These are the ones
phase 2 needs on top.

**7. A PUSH BODY LEAVES THE ENVELOPE, AND THE APP SAYS SO IN PLAIN WORDS.**
Ruling 1 says the service relays bytes it cannot read. A push notification is the exact opposite:
the title and body are plaintext that the relay composes the request from, Expo's push service
handles, and Apple's APNs or Google's FCM delivers — three parties who can read it, none of whom
can read anything else about this pairing. There is no way to have a notification that shows text
on a locked screen and to keep that text secret; a "silent push that the app decrypts" is not a
notification, it is a poll with extra failure modes. So the ruling is honesty plus minimalism:

* **Bodies are minimal.** A kind, a short title and a short body. `"Boss kill" / "Lord Nagafen"`.
  Never a zone, never a group, never a number, never a name that is not the subject of the event.
* **Per-kind opt-in, OFF by default.** Six switches, all off on a fresh install. Turning the
  feature on at all requires the OS permission AND at least one switch.
* **The Settings copy says it.** Verbatim, on the screen, above the switches:
  *"Notifications are the one thing here that isn't private. Everything else on this screen is
  encrypted on your PC and the service can't read it — but a notification has to be readable to be
  shown, so its text passes through the relay and through Apple or Google. Keep it to what you'd
  be happy to see on a lock screen. Off by default."*
* **THE APP WORKS FULLY WITH PUSH OFF.** Nothing is gated behind it and nothing nags. A user who
  never grants the permission loses one feature and no information.

**8. THE CARRIED CHARACTER IS ENCRYPTED AT REST, AND THE KEY LIVES IN THE KEYSTORE.**
"Carry your character" means the data is on the phone when nothing else is, which means it is on
the phone when the phone is lost. `roomId` and `viewKey` go in `expo-secure-store` (iOS Keychain,
Android EncryptedSharedPreferences over the Keystore) and never anywhere else. The cached payloads
are larger than SecureStore is built for, so they live in the app's private document directory as
an AES-256-GCM blob under a **separate 32-byte cache key** that itself lives in SecureStore. Losing
the keystore entry loses the cache, which is the correct failure.

**9. IT IS STILL A VIEWER (ruling 4, restated for the one message it now sends).**
The phone gains exactly one thing it may say to the room: a push registration. That message is
about the PHONE (here is where to reach me, here is what I want to hear about). There is still no
command, no write, no setting, no acknowledgement and no path by which a phone makes the desktop
do anything.

**10. THE CLOSED EVENT LIST IS THE CLOSED PUSH LIST (ruling 5, restated).**
Push kinds are exactly `PHONE_EVENT_KINDS` plus `runFinished`, which is a fact about the app's own
run tracker and not about anybody's words. Chat is not an event, was never an event, and cannot
become a notification.

**11. NO ANALYTICS, NO TELEMETRY, NO ACCOUNTS.**
The fork compiles no telemetry endpoint (AGENTS.md, "Cloud"). The app inherits that: no analytics
SDK, no crash reporter, no advertising id, no account, no login, no directory. The only hosts it
speaks to are `share.eqzera.com` and — **only if the user turns a notification switch on** —
Expo's push-token registration.

---

## 1. What is built here, and what is not

| | |
| --- | --- |
| **built** | The Expo app: pairing by QR / paste / deep link, the relay client, the five tabs, the carried character, Settings, the push OPT-IN half (permission, switches, token). |
| **written down, NOT built** | The relay's and the desktop's push halves — section 6 is the whole contract, and no line of `share-server/**` or `src/**` implements it in this ticket. |
| **written down, NOT built** | `assetlinks.json` and `apple-app-site-association` — section 4 states the exact bytes the Worker must serve; the Worker is not touched. |
| **deliberately not built** | Everything `phone-link.md`'s "Not in this phase" list rules out, minus push: still no control, no history, no multi-PC, no account, no chat. Plus: no widgets, no watch app, no Live Activities, no background socket, no offline queue of frames, no web target for this app (the PWA is the web target). |

---

## 2. Shape and stack

`mobile/` at the repo root. **Its own package.json, its own lockfile, its own node_modules, its own
tsconfig and its own ESLint config.** It is not a workspace member and the desktop's
`npm run typecheck` / `lint` / `test` do not see it — the desktop's ESLint ignores `mobile/**` and
its two tsconfigs never included it. The only root-level chaining is three new scripts,
`typecheck:mobile`, `lint:mobile` and `test:mobile`, plus a `mobile` job in
`.github/workflows/ci.yml` (Ubuntu, in parallel, npm cache pinned to `mobile/package-lock.json` so
it cannot race the desktop jobs' cache key).

| | |
| --- | --- |
| Expo SDK | **57** (`expo ~57.0.24`), the current stable line. React 19.2, React Native 0.86. |
| Router | `expo-router` — `src/app/` is routes-only, screen bodies in `src/screens/` (expo-project-structure). |
| Name / slug / id | "EQ Zera" · `eq-zera` · scheme `eqzera` · `com.eqzera.app` on both platforms. |
| Orientation / theme | portrait, dark, `userInterfaceStyle: "dark"`. |
| Icon / splash | generated from `build/icon.png` by `mobile/scripts/gen-assets.mts`, checked in: a 1024 opaque icon (iOS refuses alpha), a 1024 transparent adaptive foreground inset to the safe 66%, a 512 splash mark, and a 128 white-on-transparent notification silhouette. Zero dependencies — the script decodes and re-encodes PNG itself, `scripts/gen-icon.mts`'s rule. |
| New architecture | the SDK 57 default. `newArchEnabled` and `android.edgeToEdgeEnabled` are **no longer valid config keys** and `expo-doctor` fails the schema check on them; they are not in `app.json`. |
| Cipher | `@noble/ciphers` (section 3). |
| Tests | Jest + `jest-expo`. |

### The shared protocol is IMPORTED, not copied

`src/shared/phone/types.ts` and `src/shared/phone/limits.ts` are imported straight out of the
desktop repo through a TypeScript path alias `@shared/*` → `../src/shared/*` and a Metro
`watchFolders` entry for the repo root, with a `resolveRequest` hook that maps the alias to an
absolute path. **No copy, no sync script, no drift test** — there is one file and both apps read it.

This works cleanly because those two modules were built for it: `types.ts` imports nothing at all
and `limits.ts` imports one type from `types.ts`. They carry the channel table, the event-kind
table, the frame shape, every payload interface and every bound. That is the entire wire contract.

**MEASURED, not assumed.** `npx expo export --platform android` bundles 1384 modules into 3.0 MB of
Hermes bytecode, and the strings `phone-v1`, `respawns` and `skyQuestComplete` — which exist only in
`src/shared/phone/types.ts` — are in the emitted bundle. The fallback the brief allowed (vendor the
files with a sync script and a drift test) was therefore **not needed and not built**: there is no
copy, so there is nothing to drift.

Two Metro overrides were tried and **removed**: `resolver.nodeModulesPaths` and
`resolver.disableHierarchicalLookup`. Pinning resolution to `mobile/node_modules` looks like the
right isolation for a folder sitting beside a 600-package desktop tree, but it also switches off
the walk into `node_modules/<pkg>/node_modules`, which npm genuinely populates here, and
`npx expo-doctor` fails the project for it. It buys nothing either way, because the only two files
reached through the alias import nothing at all.

Three things are *not* imported and the reason is stated so nobody re-litigates it:

* **`src/shared/phone/views.ts` and `index.ts`** — those are the DESK's builders. A viewer receives
  their output; it never runs them. Importing them would pull `runTracker`, `buffTimers`,
  `characterSheet` and ~70 more shared modules into a phone bundle to use none of them.
* **`src/main/phone/crypto.ts`** — `node:crypto`. Its behaviour is the contract, and
  `tests/phoneCrypto.test.mts` is how that contract reaches this app (section 3).
* **`CharacterProfileShare`** — the `character` payload's type. It is declared locally in
  `mobile/src/phone/character-types.ts` as a **structural mirror**, with a test that fails if the
  two disagree, because a type-only import of `src/shared/characterShare.ts` drags 72 shared
  modules through `tsc` for a handful of interfaces. (If that mirror ever costs more than it saves,
  the alias already exists and the import is a one-line change.)

---

## 3. The cipher — `@noble/ciphers`, and the vectors that prove it

**The choice: `@noble/ciphers`.** Pure JavaScript, audited, zero dependencies, no native module, no
config plugin, no dev build, works in Expo Go and in every build profile, and — the deciding
property — **it runs in Jest**, which is the only way the phase-1 conformance vectors can be
executed against this implementation at all.

**What the brief expected, and what is actually true (worth recording).** The brief framed the
native option as `react-native-quick-crypto`, which does need a dev build. That is correct about
that package, but it is no longer the only native option: **`expo-crypto` in SDK 57 ships native
AES-GCM with AAD** (`aesEncryptAsync` / `aesDecryptAsync`, `additionalData`, 12-byte nonce,
16-byte tag), on Android, iOS and web, and it is included in Expo Go. So a native cipher was
available with no ejecting. It was still not chosen:

* it is `async` and native, so it cannot execute under `node`, so the conformance vectors would
  have to be run by hand on a device — which is a claim, not a test;
* it would mean two AES implementations in one app (the frame cipher and the at-rest cipher);
* the measured cost of pure JS here is irrelevant: a frame is a few hundred bytes at ≤ 4 Hz and the
  character blob is a few kilobytes on a tab switch.

`expo-crypto` IS a dependency, for `getRandomBytes` (the at-rest key) — the one thing pure JS
cannot do honestly.

**The vectors.** `mobile/src/phone/vectors.json` is generated by
`mobile/scripts/gen-vectors.mts`, which runs the DESKTOP's own `src/main/phone/crypto.ts`
(`node:crypto`, AES-256-GCM) and writes out every case `tests/phoneCrypto.test.mts` asserts:

| case | what it proves about the app's `openFrame` |
| --- | --- |
| round trip, 7 channels | what the desk seals, this app opens — to the same object |
| a `null` payload | "no fight" opens as `null`, not as an absence |
| wrong key | a viewer with the room id and not the key sees noise |
| wrong channel (×3) | the AAD binds the generation and the channel |
| wrong sequence (±1) | the AAD binds the order |
| flipped byte in `n`, in the tag, in the ciphertext | a refusal, never half a payload |
| truncated `d`, truncated `n`, empty both | a length check, not a prefix that authenticates |

`mobile/src/phone/crypto.test.ts` reads that file and asserts every row against the app's own
implementation. The generator is a script the repo can re-run; the JSON is committed so CI needs
no Electron and no desktop install. **20 vectors and a 4000-nonce draw, all green** — two
independent AES-256-GCM implementations, one set of bytes, one verdict.

The at-rest blob uses the same module: AES-256-GCM, fresh 12-byte nonce, AAD
`utf8("phone-cache-v1|" + name)`, wire form `nonce ‖ tag ‖ ciphertext` base64 in one file.

---

## 4. Pairing — three doors, one shape

**The only string this app accepts** is the phase-1 pair link, exactly:

```
https://share.eqzera.com/phone/#r=<22 chars base64url>&k=<43 chars base64url>
```

`parsePairLink` refuses everything else and the test says so one case at a time: another host, a
look-alike host (`share.eqzera.com.evil.tld`), `http:`, a path that is not `/phone/`, a missing
`r`, a missing `k`, wrong lengths, a query string instead of a fragment, an `r` in the query and a
`k` in the fragment, whitespace, and the empty string. A pair link is a credential; a parser that
is generous about credentials is a vulnerability with good manners.

Three doors, one parser:

1. **Scan** — `expo-camera`'s `CameraView` with `barcodeScannerSettings={{ barcodeTypes: ['qr'] }}`.
   The camera permission is requested on the Pair screen, in context, with the reason on screen
   above the button; a denial falls through to door 2 rather than dead-ending.
2. **Paste** — a text field and a **Paste link** button. This is the door that works on a phone
   with a broken camera, in a case, or when the QR is on the same screen as the app.
3. **Open** — `eqzera://pair#r=…&k=…` (the app's own scheme, `expo-linking`), and the universal
   link for `https://share.eqzera.com/phone/` so that tapping the phase-1 link on a phone with the
   app installed opens the app instead of the page. The fragment survives both: iOS hands the full
   URL to `application:continueUserActivity:` and Android to the intent's data URI.

**The link is consumed and forgotten.** On a successful pair the `roomId` and `viewKey` go to
SecureStore and the URL object is dropped. It is never logged, never in AsyncStorage, never in a
crash trace (there is no crash reporter), never in the navigation state, and never rendered —
Settings shows a MASKED room id (`abcd…wxyz`) and nothing else.

**Forget this PC** deletes both SecureStore entries, deletes the cache key, deletes the cache file,
closes the socket, clears the in-memory channels and returns to the Pair screen. A second tap has
nothing left to do.

### What the Worker must serve for universal links (NOT added in this ticket)

Two files, both at the apex of the share origin, both `application/json`, both public and
cacheable. They are written here so the Worker change is a ticket and not a discovery.

`GET /.well-known/apple-app-site-association` — **no extension, `Content-Type: application/json`**:

```json
{
  "applinks": {
    "details": [
      {
        "appIDs": ["<TEAMID>.com.eqzera.app"],
        "components": [{ "/": "/phone/*", "comment": "the phone link" }]
      }
    ]
  }
}
```

`GET /.well-known/assetlinks.json`:

```json
[
  {
    "relation": ["delegate_permission/common.handle_all_urls"],
    "target": {
      "namespace": "android_app",
      "package_name": "com.eqzera.app",
      "sha256_cert_fingerprints": ["<the app-signing certificate's SHA-256, colon-separated>"]
    }
  }
]
```

`<TEAMID>` comes from the Apple Developer account and `<fingerprint>` from Play Console → App
integrity → App signing (it is the **app signing key**, not the upload key, once Play App Signing
is on). Neither is a secret and both are published by every app that uses universal links. Until
those files exist, the deep link `eqzera://` works and the `https://` link opens the PWA — which is
a correct outcome, not a broken one.

---

## 5. The relay client

```
wss://share.eqzera.com/phone/room/<roomId>/view      subprotocol: eqzera.view.v1
```

The same URL the PWA opens, and the origin is a **compiled constant** in
`mobile/src/constants.ts` — there is no setting, no override, no environment variable and no other
host this app can be pointed at. (Same law as `src/main/share/net.ts`, one platform over.)

| behaviour | rule |
| --- | --- |
| backoff | `[1000, 2000, 5000, 15000, 30000, 60000]` ms — the same ladder as `src/main/phone/desk.ts`, capped at a minute, reset on open. |
| foreground | `AppState`: `background` / `inactive` → close the socket and cancel the retry; `active` → connect immediately (no ladder wait — the user just looked at the screen). |
| `{"t":"o"}` | desk presence → the connection pill's `Desk offline` state. |
| `{"t":"f"}` | decrypt with the channel and sequence as AAD; a frame that will not open is DROPPED silently — it is an old key, not an error to narrate. |
| replay | a frame whose sequence is `<=` the last accepted sequence for that channel is dropped. The room replays its cache on attach and a reconnect restarts the desk's sequence, so the rule is: accept a LOWER sequence only when the socket generation changed. |
| staleness | `lastFrameAt` per channel and overall; the pill shows `last update Ns ago` past 5 s. |
| sending | nothing, today. Section 6's `{"t":"p"}` is the only message this client will ever be given. |

The client is a plain object over an injected socket factory, a clock and a timer — the `desk.ts`
arrangement exactly — so `relay.test.ts` drives the ladder, the AppState transitions, the replay
rule and the desk-offline state with a fake socket and Jest's fake timers, deterministically.

---

## 6. Push notifications — the contract, in full

**Built in this ticket (the app's half).** `expo-notifications`. A Settings section with a master
state and six switches (`bossKill`, `levelUp`, `wishDrop`, `questItem`, `death`, `runFinished`),
all OFF. Turning the first one on requests the OS permission in context; a denial turns it back off
and says where the OS setting is. With the permission and at least one kind on, the app obtains an
**Expo push token** (`getExpoPushTokenAsync`, which needs the EAS project id — it is in
`app.json`). The token and the kind set are held in SecureStore beside the pairing, and cleared by
Forget this PC. **A registration is sent only when a kind is on** — the token is never obtained,
and Expo is never contacted, for a user who leaves every switch off.

**NOT built in this ticket (the relay's and the desktop's halves).** This is the whole design so
the follow-up ticket is a build and not a debate.

### Viewer → room

```json
{ "t": "p", "token": "ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]", "kinds": ["bossKill", "levelUp"] }
```

* A viewer may send this and nothing else. The existing **1 KB viewer-message cap stays** — this
  message is ~120 bytes and the cap is the thing that makes "a viewer has nothing to say" cheap.
  `RoomCore.viewerMessage` today returns `[]` for anything under the cap; it grows one branch.
* `token` must match `/^ExponentPushToken\[[A-Za-z0-9_-]{1,64}\]$/`; anything else is ignored
  silently (not a close — a viewer that speaks nonsense is a viewer, not an attacker worth a code).
* `kinds` must be a subset of the closed list; unknown kinds are dropped, not refused.
* An empty `kinds` array **deregisters** that token. That is how "turn the last switch off" reaches
  the room without a second message shape.

### What the room stores

| where | what |
| --- | --- |
| DO storage, key `push` | `Array<{ token: string; kinds: string[]; at: number }>`, **max 4** — the viewer cap, so a room can never accumulate more push targets than it can have phones. |

Eviction is oldest-`at` first. A repeat registration of the same token REPLACES its row (and
re-stamps `at`), so a phone that reinstalls does not consume two slots. The rows are deleted with
the pairing: `RoomCore.destroy()` clears them, so **Unpair all phones kills push too** — which is
the only behaviour consistent with ruling 3.

### Desk → room

```json
{ "t": "n", "kind": "bossKill", "title": "Boss kill", "body": "Lord Nagafen" }
```

* Not a frame and not encrypted, by ruling 7 — and it is the ONLY plaintext the desk ever sends.
* `title` ≤ 48 chars, `body` ≤ 96 chars, both clamped by the desk AND re-clamped by the room.
* Rate: **one per 5 s per kind, 20 per hour per room.** A notification storm is worse than a
  missed notification, and the numbers are the room's to enforce because the desk is the buggy half
  by construction.
* The desk sends it only for a kind at least one registered viewer asked for — which it learns
  from a new room→desk message, or (simpler, and preferred) it sends every kind the USER enabled on
  the desktop and the room does the per-token filtering. **Preferred: the room filters.** The desk
  should not hold a phone's preferences.

### Room → Expo

`POST https://exp.host/--/api/v2/push/send`, `Content-Type: application/json`, batched:

```json
[{ "to": "ExponentPushToken[…]", "title": "Boss kill", "body": "Lord Nagafen", "sound": "default", "priority": "default" }]
```

* One request per desk `n` message, all matching tokens in one array (max 4).
* `DeviceNotRegistered` in the receipt → **delete that row**. It is the only receipt the room acts
  on, and acting on it is what stops a dead token being POSTed forever.
* No retry, no queue, no log. A push that fails is a push that did not happen.
* **This is the second outbound origin this service would gain** (`exp.host`), and it is the first
  one that carries text. AGENTS.md's "Cloud" section gets a sentence when it lands.

### Desktop half

`src/main/phone/desk.ts` gains a `notify(kind, title, body)` that sends `{"t":"n"}` on the open
socket, fed from the same celebration source `phoneEvents` already reads, behind a Preferences
switch. It is a handful of lines and none of them are written yet.

---

## 7. Screens

Five tabs, plus Pair and Settings outside the tabs.

**Every tab's presentation is a PURE FUNCTION** in `src/phone/present/*.ts`: payload + `now` in,
rows out. The components render rows. That is what makes "view-model rendering smoke tests" real
tests rather than snapshot theatre, and it is what keeps every component under the 250-line bar.

| tab | what it holds |
| --- | --- |
| **Live** | status strip (name · level · classes · zone · in-combat), connection pill (`Live` / `Reconnecting` / `Desk offline`, with `last update Ns ago` past 5 s), fight header (mob, live flag, total, duration, your dps and share), the meter — one bar per member, bar width relative to the TOP row, `you` and `pet` marked. Keep-awake toggle (`expo-keep-awake`). |
| **Run** | zone/base, live flag, elapsed (ticking locally), kills, group kills, kills/min, named list newest-first with "Ns ago", key counts, reward chest, doors, deaths. |
| **Timers** | respawns (soonest first; a row with no stated duration counts UP and says so; an open window is marked) and your buffs (countdown, elapsed, permanent). **Both tick locally between frames** off the stamps in the payload — the channel is 0.5 Hz and a timer that only moves when a frame lands is a broken timer. |
| **Character** | the gear list with `+N` rank badges; tap a slot for an item **sheet**: flags, AC / HP / Mana / Endurance, stat lines, effects, exaltations, ornament, and for a weapon **Damage / Delay / Ratio to 2 decimals**. Above it the "Character with gear" block — totals, saves, unsummed rows, counted/unknown — and the four scores when the body carries them. **Works with no network and no desktop** (ruling 8). |
| **Events** | the rolling celebration list, newest first, kind label + title + subtitle + "Ns ago". A new event while the app is foregrounded fires one `expo-haptics` tick. |

**Empty states are states, not errors.** "No fight yet. Pull something." · "No run yet." ·
"No respawn timers yet." · "No character yet — on the PC, type `/outputfile inventory` in game."
The copy is the phase-1 page's, because the same person reads both.

**Design.** The retro dark palette out of `share-server/src/pageStyle.ts` and
`src/shared/palette.ts`, as one small token file (`src/theme.ts`): ground `#0c0a1f`, ground2
`#13102c`, panel `#1a1638`, line `#2d2757`, ink `#efeaff` / `#b8b0d9` / `#7d75a6`, cyan `#5ee6ff`,
pink `#ff5fb8`, violet `#a98fe0`, sun `#c7a2ff`, good `#6ee7a8`. Native lists and native sheets, not
a web page in a shell.

**Accessible.** Every control has an `accessibilityLabel` and a `accessibilityRole`; every tappable
target is ≥ 44 pt; no font size is hard-locked against the OS text-size setting; the meter bars
carry their numbers as text and never *only* as a bar; colour is never the only carrier of a state
(the pill has words, the open-respawn row says "up").

---

## 8. Settings

* **Paired PC** — masked room id, and the plain sentence about what pairing means.
* **Forget this PC** — destructive, confirmed, wipes secrets + cache + push token (ruling 8).
* **Notifications** — the ruling-7 paragraph, then the master permission state, then six switches.
* **Keep screen on by default** — off; the Live tab's toggle honours it on open.
* **About** — app version and build, a link to `eqzera.com`, a link to the Guides section, and
  **Open-source licences** (a bundled screen, generated at build from the lockfile, not a link).

---

## 9. Tests

| file | what it holds |
| --- | --- |
| `src/phone/crypto.test.ts` | the phase-1 vectors (section 3), every row. |
| `src/phone/pair-link.test.ts` | the exact shape accepted, and one refusal per way to be wrong. |
| `src/phone/relay.test.ts` | fake socket + fake timers: the ladder, reset-on-open, background disconnect, foreground reconnect, replay dropping, `{"t":"o"}` desk-offline, a frame that will not open is dropped not thrown. |
| `src/phone/store.test.ts` | the carried character: write → read round trip through the fake SecureStore + fake filesystem, a wrong key answers null, Forget wipes everything. |
| `src/phone/character-types.test.ts` | the structural mirror still matches the desktop's `characterShare.ts`. |
| `src/phone/present/present.test.ts` | one `describe` per tab, off the fixture payloads built from `tests/fixtures/befallen-run.snapshots.json` through the desktop's own builders, plus the formatters. |
| `src/settings/prefs.test.ts` | the prefs file, and that the push kind list is the closed celebration list plus `runFinished` and nothing anybody says. |
| `src/components/status-strip.test.ts` | the connection pill's two decisions: which of the four states, and when it starts admitting how old the newest frame is. |

**153 tests over 8 suites, ~1.3 s.** None of them renders a React Native component: every screen's
logic is a pure presenter and every impure seam is injected, so the suite needs no simulator, no
Android SDK and no Xcode, which is what lets the CI job be an ordinary Ubuntu runner.

**The fixtures.** `mobile/src/phone/present/fixtures.json` is generated by
`mobile/scripts/gen-fixtures.mts`, which imports `src/shared/phone/views.ts` + `runTracker` and
runs the owner's real Befallen crawl through them — so the phone's Run tab is asserted against the
same numbers a person counted for `runTracker.test.mts`, not against a toy. Same standing as the
vectors: generated by a committed script, committed as JSON, so CI needs nothing from the desktop.

**AND WRITING THE GENERATOR FOUND A HOLE IN THE DESKTOP'S OWN SUITE.** `buffRow` (`buffTimers.ts`)
routes an `ActiveBuff` with no `self: true` to `group: 'target'`, and `phoneBuffs` keeps only
`group === 'self'` — so a buff fixture that omits the flag produces an **empty list**.
`tests/phoneViewModels.test.mts`'s 40-row cap fixture omits it, which makes
`assert.ok(rows.length <= PHONE_LIMITS.buffs)` and the "deadlines are sorted" assertion beside it
**vacuously true over zero rows**. Nothing is broken in the product; one desktop test is asserting
nothing. The fix belongs in `tests/phoneViewModels.test.mts` (add `self: true`, and assert
`rows.length === PHONE_LIMITS.buffs` so the cap cannot be satisfied by emptiness again) and is
**not made here** — this ticket does not touch `tests/**` of the desktop suite.

---

## 10. Store checklist

| | |
| --- | --- |
| name | **EQ Zera** (both stores). Subtitle / short description: *"Your EverQuest Legends character, on your phone."* |
| bundle id / package | `com.eqzera.app` |
| category | Utilities (App Store) · Tools (Play) |
| age rating | 4+ / Everyone — no user content, no chat, no ads, no purchases |
| privacy policy URL | **REQUIRED by both stores.** Draft text: `docs/privacy-mobile.md`. It must be published at `https://eqzera.com/privacy-mobile/` (or equivalent) before either submission. |
| App Privacy (Apple) | "Data Not Collected", with the one nuance the form allows: no data is linked to an identity, no tracking. |
| Data safety (Play) | No data collected, no data shared, data encrypted in transit, user can request deletion (Forget this PC / uninstall). |
| screenshots | Live, Character, Timers on a 6.7" and a 6.1" iPhone frame and a phone + 7" tablet Android frame. |
| demo account | none needed — but the review note must say **how to pair without a PC**, which is: paste a link. Ship a reviewer note with a live pair link from a running desktop, or the review will bounce on "we could not get past the first screen". |

---

## 11. What Jack does himself

In order, and nothing here is run by an agent:

1. `npx expo login` (opens in Chrome — the memory rule).
2. `cd mobile && eas init` — creates the EAS project and writes `extra.eas.projectId`.
3. `eas build -p android --profile preview` → an installable APK, no Google account needed. **This
   is the first real proof.**
4. Apple Developer Program membership (US$99/yr) → `eas build -p ios --profile preview` (ad hoc,
   device UDIDs registered by EAS).
5. Google Play developer account (US$25 once) and an App Store Connect app record.
6. `eas build --profile production` on both, then `eas submit` on both.
7. Publish the privacy policy, fill the two privacy questionnaires from `docs/privacy-mobile.md`.
8. After the first Android production build: read the **app-signing** SHA-256 out of Play Console
   and the **Team ID** out of the Apple account, and file the Worker ticket for section 4's two
   well-known files.

---

## 12. What the build actually proved (2026-09-20)

| gate | result |
| --- | --- |
| `npm ci` in `mobile/` | clean, under `ignore-scripts=true` — an Expo managed project needs no install hook |
| `npx tsc --noEmit` | clean, at `strict` + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes` + `noImplicitOverride` |
| `npx eslint .` | clean, at `strictTypeChecked` + `stylisticTypeChecked` + `eslint-config-expo`, `no-explicit-any` an error, 250 lines / complexity 12 / depth 3 / 4 params |
| `npx jest` | **153 tests, 8 suites, green, ~1.3 s** |
| `npx expo-doctor` | **21/21, no issues** |
| `npx expo export --platform android` | 1384 modules, 3.0 MB Hermes bytecode, with the shared protocol's own strings in it |
| desktop `npm run typecheck` / `lint` / `test` | unchanged and green (4967 pass, 0 fail, 1 pre-existing skip) |

Three findings worth keeping, each written up where it belongs:

1. **`expo-crypto` ships native AES-GCM with AAD in SDK 57** (section 3) — so a native cipher was
   available without ejecting after all. Pure JS was still chosen, for the test.
2. **Two Metro resolver overrides are a trap** (section 2) — and `expo-doctor` is the thing that
   says so.
3. **The desktop's own buff-cap assertion is vacuous** (section 9) — found by writing this app's
   fixture generator against the same builder.

## 13. Not in this phase

* **No control from the phone** (ruling 4/9). The push registration is the one message and it is
  about the phone.
* **No background socket.** The socket closes when the app leaves the foreground. A live meter in
  your pocket is a battery bug, and push is the answer to "tell me while I'm away".
* **No history, no multi-PC, no multi-character, no account** — `phone-link.md`'s list, unchanged.
* **No web build of this app.** The PWA is the web target and it already exists.
* **No widgets, no Live Activities, no watch app, no Android glance tile.** Each is a second
  rendering of the same data with its own lifecycle; none of them is what "carry your character"
  asked for.
* **No OTA updates (`eas-update`) wired up.** It is a decision with a runtime-version policy
  attached, and it should be made once there is a shipped build to update.
* **No in-app purchase, no ads, no paywall.** Ever, for this app.
