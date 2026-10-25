// overlayDiagnostics.ts — LINUX EDITION 0.2.1: a change-driven trace of the overlay stack.
//
// WHY THIS FILE EXISTS (2026-10-25, the runner-swap session): the overlays draw on the
// desktop and vanish over the running game, and nothing inside Electron can say why.
// Electron answers for ITS OWN windows (isVisible, isAlwaysOnTop, bounds) while the
// burial is a WINDOW MANAGER fact — this window sits below that one — which only X can
// state. So the diagnosis needs both halves in one place, at the moment it happens.
//
// This module reads both halves on a timer and appends one snapshot per CHANGE to
// <userData>/overlay-diagnostics.log: the full root stacking order plus each window's
// name / _NET_WM_STATE / pid as the WM states them, and Electron's own visibility and
// always-on-top answer for every overlay. The log is therefore the STORY of what buried
// them — desktop, alt-tab in, alt-tab out, back — not a transcript of a quiet desktop.
//
// SEAMS, NOT SYSCALLS. The X half arrives as text through `readStack` (xprop on this
// machine), the Electron half through `facts`, the write through the filesystem — so a
// node test drives the whole policy with strings and fakes. The machine half is proven
// by running this build on the machine that has the problem, which is its whole job.

import { execFileSync } from 'node:child_process'
import { appendFileSync } from 'node:fs'
import type { Rectangle } from 'electron'

/** Electron's answer for one overlay window, at one moment. */
export interface OverlayFact {
  readonly kind: string
  readonly id: number
  readonly visible: boolean
  readonly alwaysOnTop: boolean
  readonly bounds: Rectangle
}

/** The poll period. Two seconds bounds the missed-change window of an alt-tab round-trip. */
export const DIAG_INTERVAL_MS = 2000

/** Parse `_NET_CLIENT_LIST_STACKING` output into its window ids, bottom first. */
export function parseStackIds(raw: string): string[] {
  const m = /window id #\s*(.+)/.exec(raw)
  if (!m) return []
  return m[1]
    .split(',')
    .map((s) => s.trim())
    .filter((s) => /^0x[0-9a-fA-F]+$/.test(s))
}

/**
 * The X half, as text: the root stacking order, then each stacked window's name, state
 * and pid — the WM's own words, unedited, so the log can be read the way `xprop` reads.
 */
export function xpropStack(): string {
  const root = execFileSync('xprop', ['-root', '_NET_CLIENT_LIST_STACKING'], {
    encoding: 'utf8'
  })
  const parts = [root.trim()]
  for (const id of parseStackIds(root)) {
    try {
      parts.push(
        execFileSync('xprop', ['-id', id, 'WM_NAME', '_NET_WM_STATE', '_NET_WM_PID'], {
          encoding: 'utf8'
        }).trim()
      )
    } catch {
      // A window that died between the root read and this one is not a diagnostic fact;
      // the next change-driven snapshot states the new order without it.
      parts.push(`(window ${id} unreadable)`)
    }
  }
  return parts.join('\n')
}

/** Render one snapshot block: header, the X stack, then Electron's own facts. The `ts`
 *  line is display only — change detection compares `snapshotSignature`, never this. */
export function renderSnapshot(ts: string, stack: string, facts: readonly OverlayFact[]): string {
  const ids = parseStackIds(stack)
  const factLines = facts.map(
    (f) =>
      `  ${f.kind}: id=${f.id} visible=${f.visible} top=${f.alwaysOnTop} bounds=${Math.round(f.bounds.x)},${Math.round(f.bounds.y)} ${Math.round(f.bounds.width)}x${Math.round(f.bounds.height)}`
  )
  return [
    `=== overlay-diagnostics ${ts} (${ids.length} windows stacked) ===`,
    `stack-bottom-first: ${ids.join(' ')}`,
    stack.trim(),
    'electron-side:',
    ...(factLines.length > 0 ? factLines : ['  (no overlay window exists)'])
  ].join('\n')
}

/** WHAT CHANGES MEAN A WRITE: the stack and the facts, without the clock. Comparing the
 *  rendered block instead would write on every tick forever, because the block carries its
 *  own timestamp — the exact transcript this trace exists not to be. */
export function snapshotSignature(stack: string, facts: readonly OverlayFact[]): string {
  return renderSnapshot('', stack, facts)
}

/** A snapshot is worth a write when it differs from the last one written. */
export function snapshotChanged(prev: string | null, next: string): boolean {
  return prev !== next
}

let diagTimer: NodeJS.Timeout | null = null

/**
 * Start the trace. Writes ONLY on change, to `logPath`; a failed read (no xprop on this
 * machine, a wedged X) costs one skipped tick rather than a log line, because the next
 * tick is the same question two seconds later. `onSnapshot`, when given, is one line per
 * change for the dev console.
 */
export function startOverlayDiagnostics(o: {
  enabled: boolean
  logPath: string
  facts: () => readonly OverlayFact[]
  readStack?: () => string
  onSnapshot?: (block: string) => void
  intervalMs?: number
}): void {
  if (diagTimer !== null) return
  if (!o.enabled) return
  const readStack = o.readStack ?? xpropStack
  let last: string | null = null
  const tick = (): void => {
    try {
      const stack = readStack()
      const facts = o.facts()
      if (!snapshotChanged(last, snapshotSignature(stack, facts))) return
      last = snapshotSignature(stack, facts)
      const block = renderSnapshot(new Date().toISOString(), stack, facts)
      appendFileSync(o.logPath, `${block}\n\n`)
      o.onSnapshot?.(block)
    } catch {
      // One unreadable tick is silence, not an error: the trace's value is the changes,
      // and a change that could not be read is answered by the next readable tick.
    }
  }
  // The first tick writes unconditionally (last === null), so the log always opens with
  // the boot-time state the rest of it is diffed against.
  tick()
  diagTimer = setInterval(tick, o.intervalMs ?? DIAG_INTERVAL_MS)
  // A diagnostics poll must never be the reason the app stays alive at quit.
  diagTimer.unref?.()
}

/** Stop the trace. Idempotent, and on both quit paths alongside every other timer. */
export function stopOverlayDiagnostics(): void {
  if (diagTimer !== null) clearInterval(diagTimer)
  diagTimer = null
}