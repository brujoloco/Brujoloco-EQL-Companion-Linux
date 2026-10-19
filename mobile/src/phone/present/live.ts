// present/live.ts — the Live tab, as rows.
//
// A PURE FUNCTION of the payload and the clock, which is the whole architecture of this folder
// (docs/plans/phone-native.md, section 7): the payload comes off the wire, the presenter turns it
// into rows, and the component renders rows. Nothing here imports React, and that is why the tab
// is testable at all.

import type { PhoneFight, PhoneStatus } from '@shared/phone/types'
import { clock, dps, num, pct } from './format'

/** One statistic in the header strip: a label and a value, already formatted. */
export interface Stat {
  key: string
  label: string
  value: string
}

/** One row of the meter. `fill` is 0..1 of the TOP row — a bar, not a share (`fightShare.ts`). */
export interface MeterRow {
  key: string
  name: string
  you: boolean
  pet: boolean
  damage: string
  dps: string
  share: string
  fill: number
}

export interface LiveView {
  /** the fight's own headline, or null when there is no fight to draw */
  title: string | null
  live: boolean
  stats: Stat[]
  rows: MeterRow[]
  /** what the tab says instead, when there is nothing */
  empty: string | null
}

/** The top strip: who and where. Absent facts are simply not in the list (law 1). */
export function statusLine(status: PhoneStatus | null): { name: string; detail: string } {
  if (!status) return { name: 'EQ Zera', detail: 'Not paired to a PC yet' }
  const bits: string[] = []
  if (status.level !== undefined) bits.push(`Lv ${String(status.level)}`)
  if (status.classes.length > 0) bits.push(status.classes.join('/'))
  if (status.zone !== undefined && status.zone !== '') bits.push(status.zone)
  if (status.inCombat) bits.push('in combat')
  return { name: status.name ?? 'EQ Zera', detail: bits.join(' · ') }
}

export function liveView(fight: PhoneFight | null): LiveView {
  if (!fight) {
    return { title: null, live: false, stats: [], rows: [], empty: 'No fight yet. Pull something.' }
  }
  const stats: Stat[] = [
    { key: 'total', label: 'Total', value: num(fight.total) },
    { key: 'time', label: 'Time', value: clock(fight.durationMs) }
  ]
  if (fight.you) {
    stats.push({ key: 'you', label: 'You', value: dps(fight.you.dps) })
    stats.push({ key: 'share', label: 'Share', value: pct(fight.you.share) })
  }
  // THE BAR IS RELATIVE TO THE TOP ROW and the PERCENT is a share of the fight. They are two
  // different questions and `fightShare.ts` is emphatic that one must never be drawn as the other.
  const top = fight.members[0]?.damage ?? 0
  const rows = fight.members.map((m, index) => ({
    key: `${String(index)}:${m.name}`,
    name: m.name,
    you: m.you === true,
    pet: m.pet === true,
    damage: num(m.damage),
    dps: dps(m.dps),
    share: pct(m.share),
    fill: top > 0 ? Math.min(1, Math.max(0, m.damage / top)) : 0
  }))
  return {
    title: fight.mob,
    live: fight.live,
    stats,
    rows,
    empty: rows.length === 0 ? 'Nobody has landed a hit yet.' : null
  }
}
