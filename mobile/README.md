# EQ Zera — the phone app

The native iOS and Android app. It is **one more viewer of the same relay** the phone page at
`share.eqzera.com/phone/` already uses: the same AES-256-GCM frames, the same seven channels, the
same protocol types — imported out of `../src/shared/phone/`, not copied — plus the things a web
page cannot do, which are being installed, carrying your character offline, and push notifications.

The design, the owner's rulings and the contract for the half that is deliberately NOT built here
(the relay's and the desktop's push code) are in **`docs/plans/phone-native.md`**. Read that first.

## Layout

```
mobile/
├── app.json                 name, slug, scheme, bundle id, plugins, deep links
├── eas.json                 development / preview / production
├── eslint.config.js         this project's gate (the desktop's ignores mobile/**)
├── jest.config.js           jest-expo
├── metro.config.js          the `@shared/*` → ../src/shared/* seam
├── tsconfig.json            strict, plus noUncheckedIndexedAccess + exactOptionalPropertyTypes
├── assets/                  icon, adaptive icon, splash, notification silhouette (generated)
├── scripts/
│   ├── gen-assets.mts       the four images, from build/icon.png, zero dependencies
│   ├── gen-vectors.mts      the crypto vectors, from the DESKTOP's own cipher
│   └── gen-fixtures.mts     the channel payloads, through the SHARED builders
└── src/
    ├── app/                 routes only  (index, pair, settings, (tabs)/…)
    ├── screens/             the screen bodies
    ├── components/          ui.tsx, status-strip.tsx
    ├── phone/               crypto, pair-link, relay, store, character-types, present/
    ├── notifications/       push.ts — the opt-in half
    ├── settings/            prefs.ts
    ├── state/               session.tsx
    ├── constants.ts         the one host, the one ladder
    └── theme.ts             the tokens
```

## Day to day

```
cd mobile
npm ci                    # or npm install the first time
npx expo start            # scan with Expo Go, or with a dev build
npm run typecheck         # tsc --noEmit
npm run lint              # eslint .
npm test                  # jest
npx expo-doctor           # the Expo project health check
```

The three generators are run from the **repo root**, because they import the desktop's own modules:

```
npx tsx mobile/scripts/gen-assets.mts        # after build/icon.png changes
npx tsx mobile/scripts/gen-vectors.mts       # after src/main/phone/crypto.ts changes
npx tsx mobile/scripts/gen-fixtures.mts      # after src/shared/phone/views.ts changes
```

Their output (`src/phone/vectors.json`, `src/phone/present/fixtures.json`, `assets/*.png`) is
**committed**, so CI needs nothing from the desktop tree but the two `@shared/phone` files.

## The commands Jack runs, in order

Everything below needs a login, a paid account or money. Nothing above does.

```
npx expo login
cd mobile
eas init
eas build -p android --profile preview
eas build -p ios --profile preview
eas build --profile production -p android
eas build --profile production -p ios
eas submit -p android --profile production
eas submit -p ios --profile production
```

What each one needs, and what it gives back:

| command | needs | gives |
| --- | --- | --- |
| `npx expo login` | an Expo account (free) | the session everything else uses. **It opens a browser — make sure it lands in Chrome.** |
| `eas init` | that session | an EAS project, and `extra.eas.projectId` written into `app.json`. **Push tokens cannot be issued until this has run** (`src/notifications/push.ts` says so on the Settings screen). |
| `eas build -p android --profile preview` | nothing else | **an installable `.apk`**, downloadable from a link, sideloadable on any Android phone with no Google account and no Play listing. This is the first real proof and it should be done first. |
| `eas build -p ios --profile preview` | **Apple Developer Program, US$99/year** | an ad-hoc `.ipa` for devices registered to the account. EAS walks through registering a device. |
| `eas build --profile production` | the above | an Android `.aab` and an iOS store `.ipa`, with the build number auto-incremented remotely. |
| `eas submit -p android` | **Google Play developer account, US$25 once**, and an app created in Play Console | uploads the `.aab` to the internal track as a draft. |
| `eas submit -p ios` | the Apple membership, and an app record in App Store Connect | uploads to TestFlight. |

## Store listing checklist

| | |
| --- | --- |
| App name | **EQ Zera** |
| Subtitle / short description | *Your EverQuest Legends character, on your phone.* |
| Bundle id / package | `com.eqzera.app` |
| Category | Utilities (App Store) · Tools (Play) |
| Age rating | 4+ / Everyone. No user content, no chat, no ads, no purchases. |
| Privacy policy URL | **Required by both stores.** Draft text: `docs/privacy-mobile.md`. It must be live at a public URL before either submission. |
| App Privacy (Apple) | *Data Not Collected.* No tracking, no data linked to identity. |
| Data safety (Play) | No data collected, no data shared; data encrypted in transit; deletion by "Forget this PC" or uninstall. |
| Screenshots | Live, Character and Timers — 6.7" and 6.1" iPhone, plus Android phone and 7" tablet. |
| Reviewer note | **Essential.** Reviewers have no PC running EQ Zera, so say: *"Tap 'Or paste the link' on the first screen and paste the link below — it pairs without scanning."* and include a live pair link from a running desktop. Without it, review bounces on "we could not get past the first screen". |

### Long description draft

> EQ Zera is the phone companion to the EQ Zera desktop toolkit for EverQuest Legends.
>
> Pair it with your PC by scanning one QR code, and your phone becomes a second screen: the live
> damage meter, the instance run tracker, respawn and buff timers counting down, the recent
> celebrations, and your full character sheet — every worn item, its rank, its stats, its effects
> and its exaltations, with the totals your gear adds up to.
>
> Your character is carried. The sheet is kept on the phone, encrypted, so it is there on the train
> with no signal and with the PC switched off.
>
> Everything your PC sends is encrypted on the PC. The pairing link carries the only key that can
> read it, the relay service holds no key and can read nothing, and there is no account, no login
> and no analytics of any kind. Optional notifications for boss kills, level ups and wish-list
> drops are off until you turn them on, one kind at a time, and the app says plainly what that
> costs before you do.
>
> Requires the EQ Zera desktop app. Not affiliated with Daybreak Game Company.

## Two things the Worker must serve before universal links work

`https://share.eqzera.com/.well-known/apple-app-site-association` and `…/assetlinks.json`. The
exact bytes are in `docs/plans/phone-native.md`, section 4. **They are not added to `share-server/`
in this ticket** — they need the Apple Team ID and the Play app-signing SHA-256, which only exist
after the first production builds. Until then `eqzera://pair#…` works and the `https://` link opens
the phone page, which is a correct outcome rather than a broken one.
