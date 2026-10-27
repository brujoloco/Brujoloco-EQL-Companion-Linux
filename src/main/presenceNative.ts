// ============================================================================
// presenceNative.ts — the Win32 surface the presence watcher reads, IN PROCESS.
// ============================================================================
//
// This file replaces the whole of `presenceWatcherScript.ts` (JOS-182): a `powershell.exe`
// child, launched with `-ExecutionPolicy Bypass -EncodedCommand <base64>`, that compiled a C#
// P/Invoke surface at runtime with `Add-Type` and then polled it. Every question it answered is
// answered here instead, by calling the same exported symbols directly from this process.
//
// ---------------------------------------------------------------------------------------------
// WHY THE CHILD HAD TO GO. Two independent failures, one shape.
// ---------------------------------------------------------------------------------------------
//   * IT LOOKED LIKE MALWARE, because to a behavioural engine it was indistinguishable from it.
//     A hidden `powershell.exe` with a base64 command line and an execution-policy bypass, which
//     compiles code at runtime, enumerates every process on the machine and reads foreground
//     window titles, is the textbook infostealer profile (the IDP.HELU family). Avast was
//     reported flagging this app every ten seconds. Nothing about the intent was visible to the
//     scanner; only the shape was, and the shape was wrong.
//   * IT DID NOT ALWAYS RUN AT ALL. 578 `spawn powershell.exe ENOENT` errors across two cohorts:
//     machines where PowerShell is removed, renamed, blocked by policy, or simply not on PATH for
//     the app's environment. Those installs had no overlay auto-hide and no cursor ring for every
//     session, forever, and (fail-open being what it is) nobody noticed enough to report it.
//     A Wine prefix is the same story by default — see the Wine note at the foot of this file.
//
// Both are properties of SPAWNING A PROCESS TO ASK A QUESTION. So the process is gone: these are
// ordinary calls into user32/kernel32/psapi from the app's own address space, which is what every
// Windows program that has ever asked "which window is in front" does.
//
// ---------------------------------------------------------------------------------------------
// WHY koffi AND NOT AN N-API ADDON OF OUR OWN.
// ---------------------------------------------------------------------------------------------
// The alternative was ~250 lines of C++ behind a `binding.gyp`, compiled in CI. It was rejected
// on this tree's own established rules, not on taste:
//
//   * `.npmrc` sets `ignore-scripts=true` and `electron-builder.yml` sets `npmRebuild: false`,
//     and the note beside that flag states the rule this project actually operates by: a native
//     dependency is acceptable when it ships PREBUILT N-API binaries inside its npm tarball, and
//     needs the flags flipped when it ships node-gyp sources. koffi 2.x ships prebuilts for
//     eighteen platforms in the tarball itself and needs no install script, no node-gyp, no
//     Python and no MSVC (VERIFIED: extracted with scripts ignored, loaded, called). An in-tree
//     addon would ship sources and need all four.
//   * A CI-only compile means the addon does not exist in `npm run dev`, in `npm test`, or in a
//     local `npm run dist`. Presence would be permanently degraded everywhere except a release
//     build — which is to say, degraded everywhere it is developed and tested, and live only
//     where nobody can attach a debugger to it. That is a worse deal than the one being fixed.
//   * N-API means koffi's binary is ABI-stable across Electron upgrades, so it never needs the
//     `@electron/rebuild` step that `npmRebuild: false` exists to keep out of this build.
//
// The cost of the choice, stated plainly: koffi is a general FFI engine, so the app now carries
// the ability to call any exported C function rather than only the ten below. That is a real
// widening and it is why every call in this file is declared once, here, with its own comment —
// this module is the entire Win32 surface of the application, and a reviewer can read all of it.
// (koffi's own runtime-codegen path is for JS CALLBACKS called from C; nothing here registers
// one, so no executable memory is ever allocated on our behalf.)
//
// ---------------------------------------------------------------------------------------------
// WHAT SURVIVED THE MOVE, family by family.
// ---------------------------------------------------------------------------------------------
// The C# had five. Four are here verbatim, because they were already the right calls — JOS-164
// had rewritten them to ask the KERNEL about a handle rather than .NET about its process table,
// and that rewrite is exactly what ports:
//
//   1. FOREGROUND WINDOW — GetForegroundWindow + GetWindowThreadProcessId + GetWindowRect +
//      GetWindowTextW.
//   2. CURSOR VISIBILITY — GetCursorInfo. The one call that runs every tick (JOS-120).
//   3. IMAGE PATHS — OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION) + QueryFullProcessImageNameW.
//   4. THE RUNNING SCAN — EnumProcesses, then (3) over the result.
//
// The fifth is GONE, and could not survive: PARENT LIVENESS — OpenProcess(SYNCHRONIZE) +
// WaitForSingleObject — existed only so an ORPHANED CHILD could reap itself, because Windows does
// not kill children when their parent dies. The watcher is now a worker thread, and a thread
// cannot outlive its process. The self-reap, the `X|parent-gone` line, and the entire JOS-164
// loop it caused are all deleted rather than ported.
//
// ---------------------------------------------------------------------------------------------
// FAILURE DIRECTION IS ALWAYS "KEEP GOING", exactly as it was in the C#.
// ---------------------------------------------------------------------------------------------
// `cursorShowing()` answers true when the call fails (the ring is a display aid; a watcher that
// cannot see the cursor must not be the reason it disappears). `imagePath()` answers `''` when
// the kernel will not say. `eqRunning()` answers -1 when the enumeration itself failed, which the
// caller reads as "hold the last known value" rather than "the game vanished". Only
// `loadPresenceNative()` throws, once, at startup — and the worker turns that into one protocol
// line and one error-log entry rather than a retry storm.
//
// ---------------------------------------------------------------------------------------------
// WINE (JOS-31).
// ---------------------------------------------------------------------------------------------
// This is a strict improvement there and it is worth saying why. A Wine prefix normally has NO
// `powershell.exe` at all, so the old watcher's every spawn was an ENOENT — one of the sources of
// the 578 — and the feature was dead in a prefix by construction. koffi's `win32_x64` build is an
// ordinary PE, loaded in-process like any other module, and all ten symbols below are core
// user32/kernel32/psapi entry points that Wine implements. `EnumProcesses` reports Wine's own
// process list and window calls see the prefix's own desktop, which is the same horizon the
// PowerShell child had. NOT VERIFIED ON A REAL PREFIX — no Wine machine was available to this
// change — so the claim here is only that the failure mode is bounded: any missing symbol makes
// `koffi.load`/`func` throw at load, which is the ONE failure this module has, and it degrades to
// exactly the fail-open posture (`observed:false`: overlays visible, ring parked) that a prefix
// already had.

// 0.2.16 — THE PLATFORM SEAM. `loadPresenceNative` below is the WIN32 surface, and the
// Linux Edition is a native Linux process: the three loads it opens cannot be opened here,
// which is why every build before 0.2.16 crash-looped its watcher on Linux and shipped no
// cursor ring at all. The X11 answer lives in its own module (`presenceNativeX11.ts` —
// koffi is its FFI engine too, and every call in it was probe-verified on this machine), and
// the dispatcher picks by platform: the worker cannot tell the two apart.
import { loadPresenceNativeX11 } from './presenceNativeX11'
// The client's image name, imported rather than respelled: the running scan and the
// "is this window EverQuest" predicate must never disagree about what the game is called.

/**
 * What the watcher can ask Windows. Deliberately four methods and no state: this module is a
 * translation layer, and every decision made from these answers lives in `presenceProtocol.ts`.
 */
export interface PresenceNative {
  /**
   * Is the system cursor being drawn? A failed call answers TRUE — see the failure note above.
   *
   * AND WHERE IT IS, FOR FREE (JOS-370). `CURSORINFO` carries `ptScreenPos` in the same struct the
   * visibility flag lives in, so the hot-zone hit test needs no second syscall and — when the
   * cursor ring is also on — no second CALL: one `GetCursorInfo` per tick answers both consumers,
   * which is the ticket's "share the ring's sample rather than sampling twice". Passing `out` is
   * what asks for the point; the two readers of a Buffer that is already filled are free.
   *
   * A FAILED CALL WRITES `NaN` INTO `out.x` rather than leaving the last point in place. That is
   * `pointerWatch.ts`'s rule as a value: a cursor nobody can read is not a cursor that moved, and
   * a stale coordinate silently hit-tested against a rectangle is exactly how a capture ends up
   * held (or dropped) on a fact nobody measured.
   */
  cursorShowing(out?: MutablePoint): boolean
  /** The foreground window, or null when there is none (a locked session has no foreground). */
  foreground(): ForegroundWindow | null
  /** A process's full image path, or '' when the kernel will not say. */
  imagePath(pid: number): string
  /** 1 = an EverQuest client is running, 0 = none is, -1 = the enumeration itself failed. */
  eqRunning(rootWithSep: string): number
}

/**
 * A cursor position the caller OWNS and this module writes into — never a fresh object.
 *
 * The tick loop must not allocate (see the scratch-buffer note below): a returned `{x,y}` would be
 * one garbage object per tick for the life of the app, which is the same argument that made every
 * out-parameter here a pre-allocated Buffer.
 */
export interface MutablePoint {
  x: number
  y: number
}

/** One reading of the foreground window. `exePath` is filled in by the caller's memo, not here. */
export interface ForegroundWindow {
  readonly pid: number
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
  readonly title: string
}

/**
 * THE ONE DOOR THE WORKER OPENS. Since 0.2.27 this is the X11 surface and only that — the
 * Win32 half left with the rest of the Windows-only machinery, and this Edition is a
 * native Linux process.
 */
export function loadPresenceNative(): PresenceNative {
  return loadPresenceNativeX11()
}
