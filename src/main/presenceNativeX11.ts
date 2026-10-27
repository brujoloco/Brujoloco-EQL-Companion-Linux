// ============================================================================
// presenceNativeX11.ts — 0.2.16: the LINUX surface the watcher asks the same four questions of.
// ============================================================================
//
// WHY THIS FILE EXISTS. The fork is the Linux Edition: the companion is a NATIVE Linux process,
// and `presenceNative.ts` answers its four questions with Win32 FFI (`user32`, `kernel32`,
// `psapi`) — a load that throws on Linux, which is why every build before 0.2.16 spent its first
// fifteen minutes crash-looping a watcher that could never start (errors.log,
// "presence watcher exited unexpectedly", lifetimeMs 26, thirty-seven times) and why the cursor
// ring never existed on this machine: the ring only exists through presence records, and there
// were none. The questions are the same four (`PresenceNative`, unchanged); only the machine
// that answers them changes: libX11 for the window half, `/proc` for the process half. koffi is
// already the watcher's FFI engine on the Win32 path, and every call below was proven on this
// machine before this file shipped (display, stacking, geometry, pid, pointer, error handler).
//
// X11, NOT THE TOOLKIT (measured, 0.2.9/0.2.14): reading window facts through Electron asks
// about OUR windows; the watcher's whole job is the OTHER guy's window. XGetGeometry and
// friends speak to the window manager directly, on the same connection the probe used.
//
// THE CURSOR VISIBILITY DEGRADE, stated honestly: the Win32 surface reads `CURSOR_SHOWING`, and
// the X11 equivalent of "is the cursor drawn" is XFixesGetCursorInfo (cursor None = hidden).
// This machine has no libXfixes the FFI can call (only `libXfixes.so.3`, whose struct ABI
// segfaulted the probe), so `cursorShowing` answers TRUE always and still reports the position
// through XQueryPointer. The cost is one cosmetic edge: during EverQuest mouselook — the one
// state that hides the cursor — the ring parks by POSITION (pointer outside the game's bounds)
// rather than by visibility. The moment a usable libXfixes exists, this is the one call to add.
//
// X ERRORS ARE SWALLOWED AT LOAD (probe-verified): a window that dies between the active-window
// read and the geometry read answers BadDrawable, and an unhandled X error KILLS THE PROCESS —
// the whole app, not the worker. `XSetErrorHandler` is installed first, in `loadPresenceNativeX11`,
// and a call that comes back with nothing sane answers null, which `presenceProtocol` already
// reads as "no window". The handler is registered for the process lifetime on purpose: the
// worker thread shares this process with the app, and a swallowed error is a dropped sample.
//
// WHY /proc AND NOT `ps`: the scan is on a ~beat cadence (~160 ms) inside a worker thread; it
// must not spawn a shell, and it must not miss a process that started mid-beat. `/proc/<pid>/comm`
// is one short read per numeric dir, and Wine's process names are the client's own
// ("eqgame.exe", measured) — the same `EQ_CLIENT_EXES` the Win32 path matches image paths by.

import { readdirSync, readFileSync } from 'node:fs'
import * as koffi from 'koffi'
import type { ForegroundWindow, MutablePoint, PresenceNative } from './presenceNative'
import { EQ_CLIENT_EXES } from './presenceProtocol'

/** One line of the image path: the first NUL-separated argument of `/proc/<pid>/cmdline`.
 *  Wine hands the launch path through verbatim (measured:
 *  `C:\users\Public\Daybreak Game Company\...\eqgame.exe`), so the SAME Windows-style
 *  image path the Win32 scan would have seen falls out of /proc — `isEqWindow`'s
 *  `exeBaseName` matching works unchanged. Empty on an unreadable file. */
export function imagePathFromCmdline(cmdline: string | null): string {
  if (cmdline === null) return ''
  return cmdline.split('\0')[0] ?? ''
}

/** Count the EverQuest clients a `/proc` listing holds. PURE: the readers are injected so a
 *  node test drives the scan with made-up tables. `-1` on a failed listing — not the same
 *  fact as "the game is not running" (the worker holds the last answer rather than announcing
 *  a disappearance nobody observed). Comm is the primary signal (the client's own name);
 *  the `rootWithSep` prefix match is the secondary one, exactly the order `isEqWindow` reads. */
export function eqRunningFromProc(
  entries: readonly string[],
  readComm: (pid: string) => string | null,
  rootWithSep: string,
  readCmdline: (pid: string) => string | null
): number {
  const root = rootWithSep.trim().toLowerCase()
  let count = 0
  let failed = false
  for (const entry of entries) {
    if (!/^\d+$/.test(entry)) continue
    const comm = readComm(entry)
    if (comm !== null && EQ_CLIENT_EXES.has(comm.trim().toLowerCase())) {
      count++
      continue
    }
    if (root !== '') {
      const arg0 = imagePathFromCmdline(readCmdline(entry)).trim().toLowerCase()
      if (arg0 !== '' && arg0.startsWith(root)) count++
    }
    if (comm === null && root === '') failed = true
  }
  return failed ? -1 : count
}

/**
 * The four questions, answered by X11 and /proc. Same shape as `presenceNative.ts`'s
 * `loadPresenceNative()` on Win32; the worker cannot tell the two apart.
 */
export function loadPresenceNativeX11(): PresenceNative {
  const x11 = koffi.load('libX11.so.6')
  const XOpenDisplay = x11.func('void *XOpenDisplay(const char *name)')
  const XDefaultRootWindow = x11.func('uint64 XDefaultRootWindow(void *dpy)')
  const XInternAtom = x11.func('uint64 XInternAtom(void *dpy, const char *name, int only_if_exists)')
  const XGetWindowProperty = x11.func(
    'int XGetWindowProperty(void *dpy, uint64 w, uint64 atom, long off, long len, bool del, uint64 req, _Out_ uint64 *at, _Out_ int *fmt, _Out_ uint64 *nitems, _Out_ uint64 *after, _Out_ void **data)'
  )
  const XFetchName = x11.func('int XFetchName(void *dpy, uint64 w, _Out_ char **name)')
  const XGetGeometry = x11.func(
    'int XGetGeometry(void *dpy, uint64 d, _Out_ uint64 *r, _Out_ int *x, _Out_ int *y, _Out_ uint32 *w, _Out_ uint32 *h, _Out_ uint32 *bw, _Out_ uint32 *depth)'
  )
  const XTranslateCoordinates = x11.func(
    'int XTranslateCoordinates(void *dpy, uint64 src, uint64 dst, int x, int y, _Out_ int *rx, _Out_ int *ry, _Out_ uint64 *child)'
  )
  const XQueryPointer = x11.func(
    'int XQueryPointer(void *dpy, uint64 w, _Out_ uint64 *rt, _Out_ uint64 *ch, _Out_ int *rx, _Out_ int *ry, _Out_ int *wx, _Out_ int *wy, _Out_ uint32 *mask)'
  )
  const XFree = x11.func('int XFree(void *p)')

  const dpy = XOpenDisplay(null)
  if (!dpy) {
    // No display is the one state a Linux watcher cannot answer through: same shape as the
    // Win32 load throwing, and the worker's restart path already handles it. The message
    // carries the cause; the watcher keeps retrying the way it did while the load failed.
    throw new Error('presenceNativeX11: XOpenDisplay failed - no display for the watcher to read')
  }
  const root = Number(XDefaultRootWindow(dpy))

  // THE ERROR SWALLOW, FIRST (probe-verified: a dead window read otherwise kills the process).
  // Registered for the process lifetime, never unregistered: the worker shares this process
  // with the app, and a dropped sample beats a dead app every time.
  const errorProto = koffi.proto('int xerr(void *dpy, void *ev)')
  const errorCb = koffi.register(() => 1, koffi.pointer(errorProto))
  const XSetErrorHandler = x11.func('int XSetErrorHandler(void *handler)')
  XSetErrorHandler(errorCb)

  const atom = (name: string): number => Number(XInternAtom(dpy, name, 1))
  const ATOM_NONE = 0

  /** One CARD32 property, decoded BEFORE the buffer is freed. THE FREE IS THE TRAP (measured,
   *  2026-10-25): an XFree'd property buffer is memory X hands straight back, so a caller that
   *  decodes after the free reads whatever landed in it — a garbage window id that fails every
   *  geometry read downstream. Every property read in this module decodes inside the read. */
  const uint32Prop = (win: number, name: string): number => {
    const a = atom(name)
    if (a === ATOM_NONE) return 0
    const at = [0n], fmt = [0], nitems = [0n], after = [0n], data = [null]
    const r = XGetWindowProperty(dpy, win, a, 0, 4, false, 0, at, fmt, nitems, after, data)
    if (r !== 0 || !data[0] || nitems[0] === 0n || fmt[0] !== 32) return 0
    const v = Number(koffi.decode(data[0], 'uint32'))
    XFree(data[0])
    return v
  }

  /** One text property (_NET_WM_NAME, UTF8), decoded before the free for the same reason. */
  const textProp = (win: number, name: string): string => {
    const a = atom(name)
    if (a === ATOM_NONE) return ''
    const at = [0n], fmt = [0], nitems = [0n], after = [0n], data = [null]
    const r = XGetWindowProperty(dpy, win, a, 0, 256, false, 0, at, fmt, nitems, after, data)
    if (r !== 0 || !data[0] || nitems[0] === 0n) return ''
    let text = ''
    try {
      text = String(koffi.decode(data[0], 'utf8'))
    } catch {
      text = ''
    }
    XFree(data[0])
    return text
  }

  /** The managed window the WM says is active, or 0 (no active window: a switch in flight).
   *  A CARD32 property, decoded inside the read. */
  const activeWindow = (): number => uint32Prop(root, '_NET_ACTIVE_WINDOW')

  const pidOf = (win: number): number => uint32Prop(win, '_NET_WM_PID')

  const titleOf = (win: number): string => {
    const buf = [null]
    if (XFetchName(dpy, win, buf) !== 0 && buf[0]) return String(buf[0])
    // _NET_WM_NAME (UTF8) is the fallback: a Qt window may carry only the UTF8 name, and
    // `titleIsEqClient` would rather read it than answer "" for a window with a name.
    return textProp(win, '_NET_WM_NAME')
  }

  /** The window's absolute rect, root-relative, or null (vanished / uninterpretable). */
  const rectOf = (win: number): { x: number; y: number; width: number; height: number } | null => {
    const rw = [0n], x = [0], y = [0], w = [0], h = [0], bw = [0], depth = [0]
    if (XGetGeometry(dpy, win, rw, x, y, w, h, bw, depth) === 0) return null
    const rx = [0], ry = [0], child = [0n]
    if (XTranslateCoordinates(dpy, win, root, 0, 0, rx, ry, child) === 0) return null
    if (w[0] <= 0 || h[0] <= 0) return null
    return { x: rx[0], y: ry[0], width: w[0], height: h[0] }
  }

  const windowFacts = (win: number): ForegroundWindow | null => {
    // THE ACTIVE WINDOW FIRST, ITS FACTS AFTER (same free-vs-decode trap): every read below
    // re-asks the window, so a window that died between the reads answers null here rather
    // than a half rect from one and zeros from the rest.
    if (win === 0 || win === root) return null
    const rect = rectOf(win)
    if (!rect) return null
    return { pid: pidOf(win), ...rect, title: titleOf(win) }
  }

  return {
    // THE DEGRADE, STATED TWICE (header + here): visibility is always TRUE; the position is
    // real (XQueryPointer, root-relative). See the header for the one cosmetic edge it buys.
    cursorShowing(out?: MutablePoint): boolean {
      const rt = [0n], ch = [0n], rx = [0], ry = [0], wx = [0], wy = [0], mask = [0]
      if (XQueryPointer(dpy, root, rt, ch, rx, ry, wx, wy, mask) === 0) {
        if (out) out.x = Number.NaN
        return true
      }
      if (out) {
        out.x = rx[0]
        out.y = ry[0]
      }
      return true
    },
    foreground(): ForegroundWindow | null {
      return windowFacts(activeWindow())
    },
    imagePath(pid: number): string {
      try {
        return imagePathFromCmdline(readFileSync(`/proc/${String(pid)}/cmdline`, 'utf8'))
      } catch {
        return ''
      }
    },
    eqRunning(rootWithSep: string): number {
      try {
        return eqRunningFromProc(
          readdirSync('/proc'),
          (pid) => {
            try {
              return readFileSync(`/proc/${pid}/comm`, 'utf8')
            } catch {
              return null
            }
          },
          rootWithSep,
          (pid) => {
            try {
              return readFileSync(`/proc/${pid}/cmdline`, 'utf8')
            } catch {
              return null
            }
          }
        )
      } catch {
        return -1
      }
    }
  }
}

// The `req` argument of XGetWindowProperty stays 0 (AnyPropertyType) on purpose: the two
// atom NAMES read through it (WM_NAME via FetchName aside, _NET_WM_NAME) carry either
// string flavour, and a type filter that mismatches answers "no window" for a window
// that has one.