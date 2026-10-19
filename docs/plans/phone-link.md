# Phone link — EQ Zera on the phone in your pocket

Status: **IN BUILD** (2026-09-19). Owner rulings on this page are binding; the file is the
self-contained spec all three halves are built from — the Worker, the desktop app, and the phone
page. Phase 2 (an Expo native app) is not built here and is not speculated about beyond one
promise this page keeps: **the wire protocol and the view models on it are the native app's too.**

## The owner's direction (2026-09-19)

> *"How do we turn this into a phone app also?"* … *"Lets start with 1 and then move onto 2 so
> it's also a native app that allows you to carry your character with you on your phone."*

**Option 1, built here**: an installable PWA at `https://share.eqzera.com/phone/`, paired to the
desktop app by scanning a QR code, showing live second-screen views of the fight meter, the run
tracker, the respawn and buff timers, recent celebration events, and the character.

**Option 2, after**: an Expo native app that speaks the SAME relay protocol and imports the SAME
pure TypeScript view models. Every design decision below that looks over-careful — why the view
models have no DOM in them, why the frame is JSON and not HTML, why the channels are named rather
than positional — is paying for that.

## Owner rulings

1. **ZERO KNOWLEDGE, the settings-sync law.** The desktop encrypts every frame before it leaves the
   machine; the service relays ciphertext it cannot read and holds no key. The pair link carries
   the key in its **fragment**, which a browser never sends to a server.
2. **OFF until switched on.** Nothing connects, and no room exists, until the user turns the switch
   on in Preferences → Sharing.
3. **"Unpair all phones" actually unpairs.** It rotates BOTH the `viewKey` and the `roomId`, so
   every link and every screenshot of a QR code already handed out is dead, not merely stale.
4. **The phone is a VIEWER.** No control channel, no commands, no writes back to the desktop. The
   phone can never make the desktop do anything.
5. **No chat, ever.** The `events` channel carries celebration-class facts only. A tell, a say, a
   guild line or another player's words are not events and have no path onto this wire.
6. **The pair URL is a secret and is treated like one.** The renderer is handed it only while the
   pairing dialog is open; the phone strips it from the address bar on first open.

---

## 1. Transport — a Durable Object per pairing

KV is the wrong shape here: a live meter is a write every quarter-second and KV's write budget is
a daily number. A **Durable Object** is the right shape — one object per pairing, addressed by the
room id, holding the sockets, fanning frames out, and **costing nothing while idle** because the
WebSocket Hibernation API lets the runtime evict it between frames without dropping the sockets.

```
Electron main ──wss──► PhoneRoom (Durable Object) ◄──wss── phone browser(s), ≤ 4
  encrypts                 relays ciphertext                 decrypts with the fragment key
  with viewKey             stores a hash and a clock          the service has neither
```

### Bindings (`share-server/wrangler.toml`)

```toml
[[durable_objects.bindings]]
name = "PHONE_ROOMS"
class_name = "PhoneRoom"

[[migrations]]
tag = "v1"
new_sqlite_classes = ["PhoneRoom"]
```

`new_sqlite_classes` rather than `new_classes`: a SQLite-backed Durable Object is the only kind the
**free plan** will run, and this service is free-tier by ruling 3 of share-links.md.

### Routes

| Route | Method / auth | Reply |
| --- | --- | --- |
| `POST /api/v1/phone/rooms` | JSON `{ roomId, deskTokenHash }`; `roomId` = 22 chars `[A-Za-z0-9_-]`, `deskTokenHash` = 64 lowercase hex | `201 { roomId, expiresAt }`, `Cache-Control: no-store`; `409 room-exists` when that id is already live; `400 bad-room`; `429 rate-limited` (`CREATE_LIMIT`) |
| `DELETE /api/v1/phone/rooms/:roomId` | `Authorization: Bearer <deskToken>` | `204` (pairing and every cached frame gone; open sockets closed with `4004`); `401 unauthorized`; `404 not-found` |
| `GET /phone/room/:roomId/desk` | `Upgrade: websocket`, `Sec-WebSocket-Protocol: eqzera.desk.v1, <deskToken>` | `101` with `Sec-WebSocket-Protocol: eqzera.desk.v1`; `401 unauthorized`; `404 not-found`; `409 desk-taken` when a desk is already attached |
| `GET /phone/room/:roomId/view` | `Upgrade: websocket`, `Sec-WebSocket-Protocol: eqzera.view.v1` | `101`; `404 not-found`; `409 room-full` at 4 viewers |
| `GET /phone/` | — | the phone page (HTML, one document) |
| `GET /phone/manifest.webmanifest` | — | the PWA manifest |
| `GET /phone/sw.js` | — | the service worker (shell cache only) |

`HEAD` behaves as `GET` on the three static routes. Any other method on any `/phone/…` path is
`404`, matching the rest of this service (the error table has no 405).

**THE DESK TOKEN TRAVELS AS A SUBPROTOCOL, NOT IN THE URL.** A WebSocket client cannot set an
`Authorization` header — neither a browser nor Node's `WebSocket` — and the two remaining places to
put a bearer credential are the query string and `Sec-WebSocket-Protocol`. The query string ends up
in more logs than anybody can enumerate; the subprotocol is a header. base64url is a legal
subprotocol token (RFC 6455 `tchar` includes `-` and `_`), so the token needs no re-encoding. The
server compares `SHA-256(offered token)` against the stored hash in constant time (`digestsMatch`)
and echoes only the version token back.

### What the room holds

| where | what | why |
| --- | --- | --- |
| DO storage (SQLite) | `pairing` = `{ deskTokenHash, createdAt, lastDeskAt }` | survives hibernation and eviction; it is the only durable state, and it is a hash and two clocks |
| memory | the LATEST frame per channel, and the socket set | frames are ciphertext with a 250 ms half-life; writing them to storage would be a write per frame for a thing nobody re-reads |

**Nothing is logged.** The Worker has no logging of any kind (share-links.md says the same about
the share routes) and this adds none.

### The room's lifetimes and caps

| | |
| --- | --- |
| viewers | **4** per room. A fifth is refused `409 room-full` rather than evicting somebody. |
| frame size | **64 KB** of the WebSocket message. A larger message closes the DESK socket with `4009 frame-too-large` — an oversize frame is a bug in the desktop, not traffic to absorb. |
| desk send rate | **4 frames/s per channel**, measured in the room. A frame inside the window is **DROPPED**, never queued: a meter frame that arrives late is worse than one that never arrives, and a queue is how a slow reader becomes a memory leak. |
| room lifetime | **30 days after the last desk connect.** `lastDeskAt` is stamped on every desk attach; `alarm()` is set 30 days out and deletes the pairing when it fires without a newer stamp. |
| room creation | `CREATE_LIMIT` (20/min/IP), the same limiter a share create and a sync upload use. |
| viewer connects | `READ_LIMIT` (300/min/IP). |

### The frames, verbatim

Every message is one JSON object with a one-character `t`. Small keys on purpose: a `status` frame
is a few hundred bytes and the header should not be a third of it.

**Desk → room (and relayed verbatim to every viewer):**

```json
{"t":"f","c":"fight","s":41,"n":"q1s8Hh2zA0pLrMnV","d":"3Yq7…"}
```

| key | |
| --- | --- |
| `t` | `"f"` — a frame |
| `c` | the channel name: one of `status` `fight` `run` `respawns` `buffs` `character` `events` |
| `s` | the desk's per-channel sequence number, from 1, monotonic within a room |
| `n` | the AES-GCM nonce, 12 bytes as base64url (16 chars) |
| `d` | `base64url(tag ‖ ciphertext)` — the tag at a FIXED OFFSET, so a truncated frame fails a length check instead of authenticating a prefix (the `syncCrypto.ts` rule) |

**Room → desk:**

```json
{"t":"v","n":2}
{"t":"r"}
{"t":"e","code":"rate","message":"…"}
```

`v` is the viewer count, sent on every viewer join and leave — it is what the Preferences card's
"Phones connected" reads. `r` is **resend everything**: the room sends it when a viewer attaches
and the room's in-memory cache is missing channels (which is exactly what a hibernation costs), and
the desk answers by re-sending the latest frame of every channel it has. `e` is a refusal the desk
may want to narrate; nothing branches on it today.

**Room → viewer:**

```json
{"t":"f",…}          the replay of each cached channel on attach, then every frame as it arrives
{"t":"o","desk":true}   whether a desk is attached right now
```

**Viewer → room:** nothing. A message from a viewer is ignored, and a message over 1 KB closes that
viewer's socket with `4009`. A viewer has nothing to say (ruling 4), and the one line that enforces
it is cheaper than any protocol that let it.

### Close codes

| code | meaning |
| --- | --- |
| `4001 unauthorized` | the desk token did not open this room |
| `4004 unpaired` | the pairing was deleted (Unpair all phones, or expiry) |
| `4009 frame-too-large` | a message over the cap |
| `4029 rate` | reserved; the room drops rather than closes today |

---

## 2. Zero knowledge — what the service can and cannot see

The desktop mints all three secrets, and mints them **locally**:

| secret | shape | who holds it |
| --- | --- | --- |
| `roomId` | 16 random bytes as base64url = **22 chars** (`[A-Za-z0-9_-]{22}`), 128 bits | the desktop, the service, and anyone holding the link |
| `deskToken` | 32 random bytes as base64url = **43 chars** | the desktop **only**; the room stores `SHA-256(token)` and the token itself never reaches the service — the CREATE call sends the hash |
| `viewKey` | **32 bytes**, base64url = **43 chars** | the desktop and every phone holding the link. **Never sent anywhere.** |

**The frame cipher** is AES-256-GCM, exactly the settings-sync shape one generation on:

* key = the 32 raw `viewKey` bytes (no derivation; it is already 256 bits of `randomBytes`),
* a **fresh 12-byte nonce per frame**, never derived from anything,
* `aad = utf8("phone-v1|" + channel + "|" + seq)` — so a frame cannot be replayed onto another
  channel, or re-ordered onto another sequence number, even by someone holding the key,
* wire form `n = base64url(nonce)`, `d = base64url(tag ‖ ciphertext)`.

**The pair link**

```
https://share.eqzera.com/phone/#r=<roomId>&k=<viewKey base64url>
```

The fragment is the whole of the secret and **a fragment is never sent to a server** — not in the
request line, not in `Referer`, not in a Worker's `request.url` (the client strips it before the
request is made). So the service's complete view of a pairing is: an opaque 22-character id, a
SHA-256 digest, two timestamps, and a stream of AES-GCM blobs. A viewer who has the id but not the
key sees frames it cannot open and draws the first-run screen.

**QR = the same string.** The code in the dialog encodes that URL and nothing else, so scanning it
and copying the link are the same act.

**Unpair all phones** rotates `viewKey` **and** `roomId` (ruling 3): the desktop deletes the old
room (`DELETE`, bearer the old desk token, which closes every open socket with `4004`), mints a
fresh triple, and creates the new room. There is no path by which an old link reaches the new room.

---

## 3. The channels — pure view models in `src/shared/phone/`

Every channel is a small JSON-serialisable object built by a **pure function** from snapshots the
app already has. The module has **no DOM, no Node, no Electron and no React imports**, because the
Expo app will import these files unchanged (this is the single biggest thing phase 2 inherits).
Every list in every channel is bounded, and every bound is a named constant in
`src/shared/phone/limits.ts`.

| channel | cadence | bound | what it says |
| --- | --- | --- | --- |
| `status` | 0.5 Hz | — | character name, level, classes, zone, in-combat flag, app version, `at` |
| `fight` | 2 Hz | 12 members | the current or last fight: mob, duration, total, top members with damage/dps/share, `you` flagged |
| `run` | 0.5 Hz | 12 named, 8 keys | `RunState` condensed: zone, tier, elapsed, kills, named, keys, chest, doors, deaths |
| `respawns` | 0.5 Hz | 20 timers | mob, zone, due-at, whether the window is open |
| `buffs` | 2 Hz | 30 rows | your buffs with remaining seconds (or elapsed, when nothing states a duration) |
| `character` | on change | the envelope's own caps | the `CharacterProfileShare` v2 body **as-is** |
| `events` | 0.5 Hz | 30 | celebration-class events, newest first |

**SENT ONLY WHEN THE CONTENT CHANGES.** Each channel's object is hashed (`contentHash`, FNV-1a over
`canonicalJson`) and a frame is emitted only when the hash moved. The cadence above is a CEILING on
how often the hash is even computed, not a heartbeat — an idle app sends nothing at all, which is
what makes an always-open phone free.

### `events` — what may be on it, and the closed list

`events` carries **celebration-class** facts only: a boss kill, a level up, a wish-list drop, a
quest item, a death, a crawl completing. The list is closed and it is closed in code: the builder
takes a discriminated union and an unknown kind is dropped, never passed through.

**Chat is not an event and cannot become one.** No tell, say, shout, guild, group or auction line
reaches this channel, and `tests/phoneViewModels.test.mts` asserts it over a fixture that contains
chat — which is the only kind of test that can hold the claim over time.

---

## 4. The desktop app

### Files

| file | what it owns |
| --- | --- |
| `src/shared/phone/*` | the channel view models, the limits, the frame shapes, the channel table. Pure. |
| `src/shared/qr.ts` | the QR encoder — byte mode, EC level M, no dependency. Pure. |
| `src/main/phone/crypto.ts` | mint the three secrets; encrypt one frame. `node:crypto` only. |
| `src/main/phone/protocol.ts` | the frame shapes on the wire, and the parse of a room→desk message. Pure. |
| `src/main/phone/desk.ts` | THE MACHINE: connect, reconnect with backoff, the per-channel scheduler, the rate caps, the change-only send. **Every impure seam injected** (`DeskDeps`: socket factory, clock, timer, random, the channel source) so `tests/phoneDesk.test.mts` drives it with a fake socket and a fake clock. |
| `src/main/phone/index.ts` | the wired singleton: the store, the real socket, the real snapshots, the state the card reads. |
| `src/main/phone/snapshots.ts` | the one impure part of the channel source — `serveModuleSnapshot` / `serveCombatSnapshot` calls folded into the pure builders' input. |
| `src/main/storePhone.ts` | `phone?: { enabled, roomId, deskToken, viewKey }` — additive and optional, the `shareLinks` / `discordChannels` precedent, so **no schema bump and no migration**. |
| `src/main/ipc/phone.ts` | the five doors. |
| `src/preload/phoneApi.ts` | the five methods, spread into `api`. |
| `src/renderer/src/features/preferences/PhoneSetting.tsx` + `usePhone.ts` | the card, the pairing dialog and its QR. |

### The secrets never cross IPC, with one stated exception

`deskToken` and `viewKey` are main-side, like a share delete token and a Discord webhook token.
What the renderer normally holds is:

```ts
{ paired: boolean, viewers: number, connected: boolean }
```

**The exception, and why it is safe.** `pairUrl` is `https://share.eqzera.com/phone/#r=…&k=…` — it
*contains the key*, because that is what a pair link is. It is returned **only** by `phone:pairUrl`,
which the renderer calls **only while the pairing dialog is open**, and the value is held in that
dialog's React state and dropped when it unmounts. It is never written to `localStorage`, never
logged, and never part of `phone:getState`. The user is about to photograph this string with
another device; the leak that matters is the one that outlives the dialog, and this shape has none.

### IPC

| channel | request | reply |
| --- | --- | --- |
| `phone:getState` | — | `{ available, enabled, paired, connected, viewers }` |
| `phone:enable` | — | the state after enabling (mints + creates the room if there is none) |
| `phone:disable` | — | the state after disabling (socket closed; the pairing is KEPT, so switching back on re-uses the same link) |
| `phone:pairUrl` | — | `{ ok: true, url } \| { ok: false, error }` |
| `phone:unpairAll` | — | the state after rotating both ids |

`available` is false in a dark build (`SHARE_ORIGIN === ''`), which is what the card's disabled
state is drawn from — `sync:available`'s shape exactly.

### The card (Preferences → Sharing → **Phone**)

* `pref-phone-enabled` — the switch, **OFF by default**. Help: *"Your phone shows your meters, run
  tracker, timers and character. Data is encrypted on this PC; the service cannot read it."*
* `pref-phone-pair` — **Pair a phone**, opens the dialog.
* `pref-phone-qr` — the QR code, an inline `<svg>` with one `<rect>` per dark module.
* `pref-phone-link-copy` — **Copy** beside the link.
* `pref-phone-viewers` — *"Phones connected: N"*.
* `pref-phone-unpair` — **Unpair all phones**.
* `pref-phone-dark` — under `EQ_E2E` or any build with no origin: *"This build cannot send data to
  a phone."*, and every control disabled.

### Dark under `EQ_E2E`

`SHARE_ORIGIN` is `''` in an e2e build, so `phoneSocketOrigin()` is `''`, no socket can be opened
and no room can be created. `net.ts` grows exactly one function for this feature —
`wsOriginFor(origin)`, which swaps `https:`→`wss:` (and `http:`→`ws:` for the loopback dev origin)
on the ONE compiled origin and answers `''` for an empty one. The law is unchanged: one host,
compiled in, no user-configurable override, loopback-only dev override, dark under E2E.

---

## 5. The phone page

**ONE self-contained HTML document** served at `/phone/`, plus a manifest and a service worker.
No framework and no build step beyond what `share-server/` already has: the client script is
composed from TypeScript modules under `share-server/src/phonePage/` that export JS source as
template-literal strings, which is exactly how `page.ts` embeds `copyScript`/`hoverScript`/
`hotspotScript` today.

### CSP

```
default-src 'none'; img-src 'self'; style-src 'nonce-…'; script-src 'nonce-…';
connect-src 'self' wss://share.eqzera.com; manifest-src 'self'; worker-src 'self';
base-uri 'none'; form-action 'none'; frame-ancestors 'none'
```

`page.ts`'s CSP plus exactly the four things a PWA that talks to one socket needs.

### The shell

* a **connection pill**: `Live` / `Reconnecting` / `Desk offline`, and under it `last update Ns ago`
  when the newest frame is more than 5 s old;
* a **bottom tab bar**, five tabs: `Live` · `Run` · `Timers` · `Character` · `Events`;
* **Keep screen on** — a toggle over the Screen Wake Lock API, absent entirely where the API is;
* the **first-run screen** when the URL has no fragment and `localStorage` has no pairing:
  *"Open EQ Zera on your PC, Preferences, Sharing, Pair a phone, and scan the code."*;
* **Forget this PC** clears the stored pairing and returns to first-run.

### The fragment, and why it leaves the address bar

On first open the page reads `#r=…&k=…`, stores it under `localStorage['eqzera.phone.pair']`, and
**removes it from the address bar** with `history.replaceState`. A screenshot of the browser chrome
— the single most likely way somebody accidentally shares this — then leaks nothing. The page works
on every later open from `localStorage`, and `Forget this PC` is the way out.

`localStorage` can be absent (private mode, blocked site data). Every read and write is wrapped, and
a page that cannot store falls back to keeping the pairing in memory for the session.

### Palette and type

`pageStyle.ts`'s tokens, mobile-first: the same ground/panel/line/ink/cyan/pink and the same three
faces with system fallbacks. The character tab draws the share page's gear list — slot label, item
name, `+N` rank badge, tap to open the facts block — with the same class names, so one stylesheet
serves both pages.

### The PWA

`/phone/manifest.webmanifest`: `name` "EQ Zera", `short_name` "EQ Zera", `display: standalone`,
`background_color`/`theme_color` from `pageStyle.ts` (`#0c0a1f`), `start_url: "/phone/"`,
`scope: "/phone/"`, icons = the existing `/logo.png` route at **256×256**, `purpose: "any maskable"`.
That is the one size this service can serve, and inventing sizes it cannot is worse than declaring
one.

`/phone/sw.js` caches **the shell only** — `/phone/`, the manifest and `/logo.png` — under a
version-stamped cache name, and never touches a frame. Frames arrive over a socket and are the one
thing on this page that must never be replayed from a cache.

---

## 6. Tests

| file | what it holds |
| --- | --- |
| `tests/qr.test.mts` | the encoder: capacity/version selection, the Reed-Solomon generator polynomials against published coefficients, the 32 published format-information strings, finder/timing/dark-module placement, and a **round trip** — the test reads the data codewords back out of the finished matrix through the same placement walk and compares them to what went in, which is the only cheap way to prove the interleave and the mask are right. |
| `tests/phoneViewModels.test.mts` | every channel from fixture snapshots (incl. `tests/fixtures/befallen-run.snapshots.json`); every bound; the change-hash; and **no chat ever appears in `events`**. |
| `tests/phoneCrypto.test.mts` | round trip; a wrong key fails; an AAD mismatch (wrong channel, wrong seq) fails; a flipped byte fails; nonces are unique over a large draw; a truncated blob fails a length check. |
| `tests/phoneDesk.test.mts` | fake socket + fake clock: connect, the backoff ladder, the 4 Hz cap drops rather than queues, change-only sends, the resend nudge, **a dark build makes no connection**, and unpair rotates both ids. |
| `tests/sharePhone.test.mts` | the Worker: room create and its 409, the desk token gate, the viewer cap, the frame size cap, replay-on-attach, the viewer-count message, expiry, and the delete. |
| `tests/e2e/phone-pair.e2e.mts` | Preferences → Sharing: the switch is off by default; enabling under E2E shows the dark sentence and makes no connection; with the test seam a Pair dialog shows a QR `<svg>` with modules and a link matching `^https://share\.eqzera\.com/phone/#r=[A-Za-z0-9_-]{22}&k=[A-Za-z0-9_-]{43}$`; Unpair changes the link. |

**How the Durable Object is tested without a Durable Object.** `@cloudflare/vitest-pool-workers` is
not in this repo and adding a second test runner for one class would make the suite
platform-specific and optional — the exact argument `shareServer.test.mts` makes about a workerd
emulator. So **`PhoneRoom`'s logic is separable from its runtime by construction**: the class is a
thin adapter over `share-server/src/phoneRoom.ts`'s pure `RoomCore`, which takes attaches, messages
and clock ticks and answers a list of *actions* (`send`, `close`, `store`, `alarm`). The suite
drives `RoomCore` directly with an in-memory socket set, and drives the HTTP half of the routes
(create, delete, the upgrade refusals) through `handleRequest` with a stub DO namespace — the same
structural-binding trick `env.ts` already uses for KV.

---

## Not in this phase

* **No control from the phone** (ruling 4): no starting a run, no acknowledging an alert, no
  settings, no writes of any kind.
* **No push notifications.** Away alerts already reach a phone through the user's own Discord
  channel (`src/main/awayAlerts.ts`), which is why this app ships no push service — and a PWA push
  subscription would be a per-user endpoint stored on a server, which is the opposite of ruling 1.
* **No history on the phone.** The room holds the latest frame per channel and nothing else; the
  phone is a window onto now.
* **No multi-character or multi-PC rooms.** One desktop, one room, one character — the one the
  desktop is on.
* **No account, no login, no directory.** The link is the credential.
* **No audio and no haptics** on the phone.
* **No `eqzera://` deep link** from the phone into the desktop.
* **No Expo app** — that is phase 2, and everything in `src/shared/phone/` plus this wire protocol
  is what it starts from.
