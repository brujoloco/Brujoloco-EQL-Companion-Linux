// present/timers.ts — the Timers tab, as rows.
//
// ── THESE CLOCKS TICK LOCALLY, AND THAT IS THE WHOLE POINT OF THIS FILE ────────────────────────
//
// The `respawns` and `buffs` channels are 2 Hz at their fastest and are sent ONLY when their
// content hash moves — and the hash deliberately blanks `respawns[].open`, because it flips on a
// clock rather than on a fact (shared/phone/index.ts). So a respawn timer that only moved when a
// frame landed would sit still for minutes and then jump. Every row below carries its own stamp
// (`baseTs`, `dueAt`, `startedTs`, `endsAt`) precisely so that the phone can count between frames,
// and `timerRows(payload, now)` is called once a second from a local tick.
//
// ── AND A DURATION NOBODY STATED IS ELAPSED TIME, NEVER A GUESSED COUNTDOWN ────────────────────
//
// A respawn with no `dueAt` and a buff in `elapsed` mode both count UP and say so (`up: true`).
// This is the same law the desktop's buff overlay keeps, and the reason the payloads have an
// OPTIONAL deadline rather than a defaulted one.

import type { PhoneBuff, PhoneRespawn } from '@shared/phone/types'
import { clock } from './format'

export interface TimerRow {
  key: string
  name: string
  /** the second line: a zone for a respawn, a target or a count for a buff; '' when there is none */
  detail: string
  /** the clock, already formatted */
  time: string
  /** true when this row counts UP because nothing stated a duration */
  up: boolean
  /** true when a respawn window is open: it could be up right now */
  open: boolean
  /** true when nothing is counting at all — a permanent buff */
  permanent: boolean
}

export interface TimersView {
  respawns: TimerRow[]
  buffs: TimerRow[]
  respawnsEmpty: string | null
  buffsEmpty: string | null
}

/**
 * ONE RESPAWN ROW. With a `dueAt` the clock is the DISTANCE to it in either direction — an open
 * window reads how long it has been open, which is the number a person camping it wants.
 */
export function respawnRow(row: PhoneRespawn, now: number): TimerRow {
  const due = row.dueAt
  const open = due !== undefined && now >= due
  return {
    key: row.id,
    name: row.mob,
    detail: row.zone,
    time: due === undefined ? clock(now - row.baseTs) : clock(Math.abs(due - now)),
    up: due === undefined,
    open,
    permanent: false
  }
}

/** One buff row. A countdown reads its remaining time; an elapsed row reads its age. */
export function buffRow(row: PhoneBuff, now: number): TimerRow {
  const permanent = row.mode === 'permanent'
  const ends = row.endsAt
  const detail: string[] = []
  if (row.target !== undefined && row.target !== '') detail.push(row.target)
  if (row.count !== undefined && row.count > 1) detail.push(`×${String(row.count)}`)
  return {
    key: row.id,
    name: row.name,
    detail: detail.join(' · '),
    time: permanent ? '—' : ends === undefined ? clock(now - row.startedTs) : clock(Math.max(0, ends - now)),
    up: !permanent && ends === undefined,
    open: false,
    permanent
  }
}

export function timersView(
  respawns: PhoneRespawn[] | null,
  buffs: PhoneBuff[] | null,
  now: number
): TimersView {
  const spawns = (respawns ?? []).map((row) => respawnRow(row, now))
  const rows = (buffs ?? []).map((row) => buffRow(row, now))
  return {
    respawns: spawns,
    buffs: rows,
    respawnsEmpty: spawns.length === 0 ? 'No respawn timers yet.' : null,
    buffsEmpty: rows.length === 0 ? 'Nothing is standing on you.' : null
  }
}
