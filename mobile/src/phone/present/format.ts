// present/format.ts — the numbers, as a person reads them.
//
// Ported from `share-server/src/phonePage/render.ts`'s `num`/`clock`/`ago` so that the PWA and the
// app spell the same fight the same way. A person who scanned the QR on Monday and installed the
// app on Tuesday should not see two different numbers for one pull.
//
// EVERY FUNCTION HERE IS TOTAL. A NaN, an Infinity, a negative duration and an undefined all have
// an answer, because these are called against payloads from a desktop that may be one version
// ahead, and a formatter is the wrong place to discover that.

/** `12450` → `12.5k`. The meter's number, at meter width. */
export function num(value: number): string {
  const n = Number.isFinite(value) ? value : 0
  if (Math.abs(n) >= 1_000_000) return `${trim((n / 1_000_000).toFixed(1))}M`
  if (Math.abs(n) >= 1000) return `${trim((n / 1000).toFixed(1))}k`
  return String(Math.round(n))
}

function trim(text: string): string {
  return text.endsWith('.0') ? text.slice(0, -2) : text
}

/** Milliseconds → `4:07` or `1:04:07`. Never negative; a clock that has run out reads `0:00`. */
export function clock(ms: number): string {
  const total = Number.isFinite(ms) ? Math.max(0, Math.round(ms / 1000)) : 0
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const mm = h > 0 && m < 10 ? `0${String(m)}` : String(m)
  const ss = s < 10 ? `0${String(s)}` : String(s)
  return `${h > 0 ? `${String(h)}:` : ''}${mm}:${ss}`
}

/** A stamp against a clock: `12s ago`, `4m ago`, `3h ago`, `2d ago`. */
export function ago(at: number, now: number): string {
  const s = Number.isFinite(at) && Number.isFinite(now) ? Math.max(0, Math.round((now - at) / 1000)) : 0
  if (s < 60) return `${String(s)}s ago`
  if (s < 3600) return `${String(Math.floor(s / 60))}m ago`
  if (s < 86_400) return `${String(Math.floor(s / 3600))}h ago`
  return `${String(Math.floor(s / 86_400))}d ago`
}

/** A 0..1 share as a whole percent. */
export function pct(share: number): string {
  return `${String(Math.round((Number.isFinite(share) ? share : 0) * 100))}%`
}

/** One decimal, for a dps figure the payload already rounded to one. */
export function dps(value: number): string {
  return `${num(value)} dps`
}

/**
 * A weapon's RATIO, to two decimals — damage ÷ delay, the number every EverQuest player compares
 * two weapons with. It is DERIVED here rather than carried on the wire, because it is arithmetic
 * over two fields that are already there; `null` when either is missing or the delay is zero,
 * which is world-model law 1 (a value the app does not know is absent, never zero).
 */
export function weaponRatio(dmg: number | undefined, delay: number | undefined): string | null {
  if (dmg === undefined || delay === undefined) return null
  if (!Number.isFinite(dmg) || !Number.isFinite(delay) || delay <= 0) return null
  return (dmg / delay).toFixed(2)
}
