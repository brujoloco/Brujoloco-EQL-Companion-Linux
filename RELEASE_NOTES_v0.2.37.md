# Release notes for v0.2.37

**The 0.2.25 - 0.2.37 session.**

- Reworked some of the old app connections to third party websites, I prefer my app to be as self contained as possible and without ties to external third sites. As I rework the app into something more akin to what I want out of it, I will disable some of the outside connections from the original app. 🧙

- I also removed more leftover instructions and other things from original EQ Zera app. Though I believe discord sharing is fun and stuff, I want to leave such options to the player, not be embedded directly into the app. Philosophy of Design things :)

- Removed the old Windows-only machinery - the Win32 half of the window watcher, the registry hunt for the game folder, the installer config and every leftover file of it. The Linux app is a Linux app now, and npm run dist builds the AppImage, as it always should have. ✨

- The voice download goes straight to the voice pack now - no more pretending to set up a Windows runtime first, and no Windows file rides along in the package at all.

- Fixed a leak the test runs found: temp directories piling up in /tmp every run, never cleaned. The suite now sweeps up after itself. ✨

- Settings sync is offline now - one encrypted line carries your settings to your other PC, saved as a text file or copied to paste. How it travels is your business: email it to yourself, a USB stick, your own cloud drive. The app opens no connection for any of it.

- The online sound pack browser now starts closed and says where it would connect before it does - a third-party community registry - and only loads when you click Browse. No more surprise connections.

- The natural voice download now says where it connects before it does too - the kokoro-onnx release files on GitHub, a third-party project, with every file checked against a pinned hash. One download, offline from then on.

- A full connection sweep of the app found one leftover Microsoft address from the deleted Windows voice setup - a constant that never ran, now gone too. Every connection this app can make is named, pinned, or behind your click.

- Expect the linux app to evolve into its own thing and as contained as possible. 🧙

---

**Install:** download the AppImage below, make it executable (`chmod +x "Brujoloco.EQL.Companion-0.2.37.AppImage"`) and run it. The host needs **FUSE** for AppImage execution. Point the app at your EverQuest install under a Wine prefix via Settings and it reads the same log it always has.

*Brujoloco EQL Companion, Linux Edition — a private fork of EQ Zera (upstream FSL-1.1-MIT; Linux Edition additions MIT). See you in Norrath. 🧙*
