# BUILD — Brujoloco EQL Companion, Linux Edition

Everything you need to clone this repo on a fresh Linux machine and produce a
running AppImage. This is a native Linux build of an Electron + React + Rust
app; it compiles the Rust engine natively for `linux-x64`, bundles the
Electron main/preload/renderer, and packages them with [electron-builder] into
a single `*.AppImage`.

The app reads EverQuest Legends log files from **any path on the filesystem**
(its own Settings folder picker, or the `EQ_INSTALL_DIR` environment variable),
intended to run beside the game inside a Wine prefix.

[electron-builder]: https://www.electron.build/

---

## 1. Prerequisites

A modern Linux x86_64 machine. Built and tested on **Ubuntu 24.04.4 LTS, x86_64**.

You need three toolchains, all installed **user-local** (no system-wide/sudo
installs are required):

| tool       | version required      | how to install                                                                 |
|------------|------------------------|---------------------------------------------------------------------------------|
| Node.js    | **v24**                | [nvm](https://github.com/nvm-sh/nvm): `nvm install 24 && nvm use 24`            |
| npm        | comes with Node v24   | —                                                                               |
| Rust       | **1.98.0** (pinned)    | [rustup](https://www.rust-lang.org/tools/install), then `rustup default 1.98.0` |

> The Rust version is **pinned** by `engine/rust-toolchain.toml`
> (`channel = "1.98.0"`, components `rustfmt` + `clippy`). `cargo` is invoked
> from the repo root, so make sure `cargo` is on `PATH` for the build shell —
> typically `source "$HOME/.cargo/env"` in each shell that runs the build.

For AppImage execution at runtime, the host needs **FUSE** (AppImages mount
themselves via FUSE). On Ubuntu this is already present; on a minimal install:
`sudo apt-get install libfuse2t64` (or `libfuse2` on older releases).

---

## 2. Clone

```bash
git clone <your-repo-url> eql-companion-brujoloco
cd eql-companion-brujoloco
```

The repo already contains the Rust engine source (`engine/`), the shared modules
(`src/shared/`), the Electron main/preload/renderer (`src/main`, `src/preload`,
`src/renderer`), the committed wiki art, and `package-lock.json`.

`node_modules/`, `out/`, `engine/target/`, and `release/` are all **gitignored**
and produced by the build below — do not commit them.

---

## 3. Restore dependencies

```bash
npm ci
```

Installs the exact versions pinned in `package-lock.json`. This pulls
`electron` (43.x), `electron-builder`, `electron-vite`, `vite`, `typescript`,
`tsx`, `@types/node`, the MUI packages, and everything else.

> If `npm ci` warns that the Electron binary post-install couldn't download,
> re-run `npx electron install` (or `ELECTRON_SKIP_BINARY_DOWNLOAD=0 npm ci`).
> The build needs the real Electron binary.

---

## 4. Build the Rust engine (natively, for linux-x64)

```bash
# cargo must be on PATH for this shell:
source "$HOME/.cargo/env"

npm run build:engine
```

This runs `scripts/build-engine.mts`, which invokes
`cargo build --release -p zengine` and produces the native engine binary at:

```
engine/target/release/zengine      # the linux-x64 ELF (~33 MB)
```

`build-engine.mts` is the **one place** that knows where `cargo` lives; it
finds `cargo` via the `~/.cargo` install and falls back to a bare `cargo` on
`PATH`. It throws if `cargo` fails or claims success with no binary on disk.

> **Pinned toolchain:** `engine/rust-toolchain.toml` makes `cargo` use the
> 1.98.0 toolchain automatically when you run it from inside `engine/`. The pin
> is load-bearing: `engine/crates/protocol/src/generated.rs` is a committed
> artifact whose staleness test regenerates and diffs it with `rustfmt`, so two
> rustfmt versions that disagree about a line break would fail the build for no
> real defect. Bump the pin deliberately and run `npm run gen:protocol` in the
> same change.

---

## 5. Build the Electron bundles (main / preload / renderer)

```bash
npm run build
```

This is `electron-vite build`. It compiles TypeScript and bundles the three
render targets into `out/`:

```
out/main/         # the Electron main process
out/preload/      # the context-isolated preload bridges (main + overlay + tray + cursor)
out/renderer/     # the React UI (the main window + overlay + tray HTML)
```

---

## 6. Package the AppImage

```bash
npx electron-builder --linux AppImage
```

`electron-builder` reads `electron-builder.yml` and packages `out/**`,
`package.json`, the committed wiki art, and the Rust engine (copied from
`engine/target/release/zengine` into `resources/engine/zengine` inside the
AppImage via the `extraResources` block) into a single executable:

```
release/0.1.0/Brujoloco EQL Companion-0.1.0.AppImage
```

The output path is `release/<version>/` where `<version>` is `package.json`'s
`version` (currently `0.1.0`). The `productName` is **Brujoloco EQL
Companion** and the `appId` is `com.brujoloco.eql`.

> The whole pipeline as one block (fresh shell, from repo root):
> ```bash
> source "$HOME/.cargo/env"
> npm ci
> npm run build:engine
> npm run build
> npx electron-builder --linux AppImage
> ```

---

## 7. Run it

```bash
./release/0.1.0/Brujoloco\ EQL\ Companion-0.1.0.AppImage
```

On first launch, point it at your EverQuest install (the folder containing the
log files) via **Settings** in the app, or set `EQ_INSTALL_DIR` (see §8).

For development with hot reload instead of packaging:

```bash
source "$HOME/.cargo/env"
npm run dev          # electron-vite dev --watch (the engine is still read from engine/target/release/zengine)
```

---

## 8. Configuration & environment variables

| variable                | purpose                                                                 |
|-------------------------|--------------------------------------------------------------------------|
| `EQ_INSTALL_DIR`        | Override the EverQuest install directory (the log path) without using the in-app folder picker. |
| `ELECTRON_RENDERER_URL` | Dev only — the URL `electron-vite dev` serves the renderer on (HMR).    |

**Log path:** the app reads EQ log files from **any path** on the filesystem.
Set it either through the in-app Settings (folder picker) or via
`EQ_INSTALL_DIR`. Under Wine, point it at the Wine prefix's EverQuest install
(e.g. `~/.wine/drive_c/.../EverQuest`).

---

## 9. Verify the build (typecheck + tests)

```bash
# TypeScript typecheck (both halves):
npm run typecheck:node
npm run typecheck:web
# or both at once:
npm run typecheck

# The theme/contrast regression suites (fast, no engine needed):
node --import tsx --test \
  tests/palette.test.mts \
  tests/themes.test.mts \
  tests/graphicsPrefs.test.mts

# The full unit suite (runs the test gate, includes fixtures):
npm test
```

`npm test` runs `scripts/testGate.mts unit -- node --import tsx --test
--test-concurrency=auto tests/*.test.mts`. The theme suites
(`palette`, `themes`, `graphicsPrefs`) enforce **WCAG AA (≥4.5:1)** contrast
for every shipped theme — body text on background/paper and accent on paper —
and fail the build if a theme ships unreadable.

---

## 10. Project layout (where things are)

```
src/
  main/        Electron main process: windows, tray, IPC, updater, theme
  preload/     context-isolated bridges (index, overlay, tray, cursor, theme)
  renderer/    React UI
    src/
      theme/         makeTheme + useTheme (the runtime theme switcher)
      features/
        preferences/  the Preferences sections incl. Theme + About this build
        whatsnew/     the What's new panel (reads src/shared/releaseNotes.ts)
        overlay/      the overlay windows (meter, heals, events, buffs, ...)
      components/     TitleBar, NavDrawer, …
  shared/      cross-process modules: themes, palette, ipc, graphicsPrefs, …
engine/        the Rust engine (cargo workspace); produces engine/target/release/zengine
tests/         palette/themes/graphicsPrefs + fixtures + e2e
scripts/       build-engine.mts, scrape-*, gen:protocol, testGate.mts, …
electron-builder.yml   the packaging config (appId, productName, extraResources, linux target)
package.json           scripts + deps; version 0.1.0
```

For the full structural map, see `docs/CODE_INDEX.md`. For data model / external
APIs, see `docs/schema.md` and `docs/api-surface.md`.

---

## 11. Troubleshooting

**`cargo` not on PATH** — `npm run build:engine` throws `build:engine: could
not run cargo`. Run `source "$HOME/.cargo/env"` in the same shell first, or
ensure `~/.cargo/bin` is on your `PATH` (`rustup` adds it on install).

**Wrong Rust version** — `engine/rust-toolchain.toml` pins 1.98.0 and `cargo`
will use it automatically inside `engine/`. If `rustup` isn't installed, install
it (`curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh`) and
`rustup default 1.98.0`.

**AppImage won't run** — usually missing FUSE. On Ubuntu:
`sudo apt-get install libfuse2t64`. Alternatively extract and run without FUSE:
`./Brujoloco\ EQL\ Companion-0.1.0.AppImage --appimage-extract-and-run`.

**Electron binary not downloaded** — `npm ci` skips the Electron download when
offline. Re-run `npx electron install` while online.

**`npm test` fixtures** — some tests use committed golden-window fixtures
under `tests/fixtures/*.log` (the only `*.log` files not gitignored). Don't
hand-copy raw game logs into them; route through `tests/fixture-scrub.mjs`.

---

## 12. License

The upstream code (EverQuest Companion by Josh Moyers, and the EQ Zera
additions by Jack Thomas) is licensed under the **Functional Source License
1.1, MIT future license (FSL-1.1-MIT)** — see `LICENSE`.

The Brujoloco Linux Edition additions (AppImage packaging, the runtime theme
system with adaptive light/dark mode, the in-app rebrand, the disabled
update/feedback surfaces, and the About-this-build section) are released under
the **MIT License**, © 2026 Brujoloco — see `NOTICE` for the full grant and
attributions. This build is declared **final** as a delivered product for
Linux; everyone is free to use, copy, modify, fork, and redistribute it under
those terms.

---

**Target artifact:** `release/0.1.0/Brujoloco EQL Companion-0.1.0.AppImage`
(~156 MB, 36 themes, native `zengine` engine bundled).
---

## 13. Versioning (Brujoloco convention)

Every change to the AppImage is a **new version, never an overwrite**:

1. Bump `version` in `package.json` (patch bump: `0.2.0` → `0.2.1` → `0.2.2` …).
2. Add the matching entry to `src/shared/releaseNotes.ts` (newest first).
3. Build; `electron-builder` writes `release/<version>/` automatically.
4. Copy the AppImage to a **fresh directory** named for the new version:
   `~/projects/Brujoloco-EQL-Companion-<version>/Brujoloco EQL Companion-<version>.AppImage`

No two builds with different contents share a version number or a directory.
Rolling back means picking the older directory, not rebuilding.
