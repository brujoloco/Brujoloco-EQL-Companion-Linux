// netFacts.ts — the runtime facts and the dev-unlock predicate the share seam needs.
//
// 0.2.30: this moved out of feedback/net.ts (which left the app with the dead feedback
// queue). The share origin's dev gate imports it, and two copies of a security predicate
// is two opinions — so it lives here, once. Nothing user-reachable sets any of these:
// they are read from process facts at runtime, in the dev shell, never persisted and
// never configurable from the renderer.

/** What the unlock predicate asks about the process it runs in. */
export interface RuntimeFacts {
  /** `process.execPath`. */
  readonly execPath: string
  /** `process.platform`. */
  readonly platform: string
  /** `process.versions.electron` — undefined outside Electron (node test runs). */
  readonly electron: string | undefined
  /** `EQ_E2E=1`: the headless harness never submits, so it never unlocks either. */
  readonly e2e: boolean
  /** The env var the gate is being asked about (`EQ_SHARE_URL` for the share seam). */
  readonly url: string | undefined
}

/** Electron's own `isPackaged`, read from the exe name: a dev run's binary is `electron`. */
function looksPackaged(execPath: string, platform: string): boolean {
  const base = (execPath.split(/[\\/]/).pop() ?? '').toLowerCase()
  return platform === 'win32' ? base !== 'electron.exe' : base !== 'electron'
}

/** Every condition that must hold before the env var is even looked at. */
export function devUnlocked(facts: RuntimeFacts): boolean {
  if (facts.e2e) return false
  if (facts.electron === undefined || facts.electron === '') return false
  return !looksPackaged(facts.execPath, facts.platform)
}
