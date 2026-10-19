# 🐉 Brujoloco EQL Companion — Linux Edition 🐧

A native Linux 📦 **AppImage** companion for **EverQuest Legends**. It reads the log file the game
already writes and turns it into live views: a DPS meter ⚔️, floating overlays, Plane of Sky quest
tracking 🌤️, loot and item knowledge, XP/AA progress, raid-target history, buff timers ⏳, and
sound alerts.

**It only reads your log.** 🛡️ Nothing is injected into EverQuest, no game files are touched, no
memory is read, nothing is automated — it just watches the log the game already writes.

## ✨ What's new in this fork

I added a **runtime theme palette** to the app — pick from **36 palettes** right inside the app
and watch the whole UI recolour live, no restart. There's a high-contrast set for legibility over
the game, and an adaptive light/dark mode that flips so every submenu stays readable. The
floating overlay windows (your meters, the event log, the buff bars, all twelve of them) follow
the main theme now, so a colour swap recolours them too. Every theme is checked against WCAG-AA
contrast so the text stays legible at any palette you pick. 🎨

The full list of what was added and changed also lives **inside the app** — open **Preferences →
What's new** and read the `0.1.0` entry for the whole story. 📜

## 🔧 Origin

This is a **private fork** of [EQ Zera](https://github.com/Zeratfule/EQ-Zera), which is itself a
fork of [everquest-companion](https://github.com/jmoyers/everquest-companion) ("EQ Legends
Companion") by Josh Moyers. I reworked it for my own Linux box — a native AppImage instead of a
Windows installer — and added a few things on top. 🐧→📦

The upstream README is preserved as [`README.upstream.md`](README.upstream.md), and
[`AGENTS.md`](AGENTS.md) is still the best map of the code.

## 🔨 Building

See [`BUILD.md`](BUILD.md) for the complete build guide (Node v24, Rust 1.98.0, the full
`npm ci` → `build:engine` → `build` → `electron-builder --linux AppImage` pipeline). Feature
plans are in [`ROADMAP.md`](ROADMAP.md).

## 📜 License

The upstream code (EverQuest Companion by Josh Moyers, and the EQ Zera additions by Jack Thomas)
is licensed under the **Functional Source License 1.1, MIT future license (FSL-1.1-MIT)** — see
[`LICENSE`](LICENSE).

The Brujoloco Linux Edition additions (the AppImage packaging, the runtime theme system with
adaptive light/dark mode, the in-app rebrand, the disabled update/feedback surfaces, and the
About-this-build section) are released under the **MIT License**, © 2026 Brujoloco. See
[`NOTICE`](NOTICE) for the full grant and the third-party and bundled-asset attributions. This
build is declared **final** as a delivered product for Linux; everyone is free to use, copy,
modify, fork, and redistribute it under those terms.