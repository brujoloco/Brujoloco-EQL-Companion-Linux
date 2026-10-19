// present/run.ts — the Run tab, as rows.
//
// THE ELAPSED CLOCK IS COMPUTED HERE, NOT READ OFF THE PAYLOAD, while the run is live. The `run`
// channel arrives at 0.5 Hz at best and its change hash deliberately blanks `elapsedMs` (shared/
// phone/index.ts `stableOf`), so an idle app sends nothing at all — which means a screen that
// printed `payload.elapsedMs` would freeze at whatever the last frame said. `startedAt` is on the
// payload for exactly this reason, and this is the file that uses it.

import type { PhoneRun } from '@shared/phone/types'
import { ago, clock } from './format'
import type { Stat } from './live'

export interface NamedRow {
  key: string
  name: string
  when: string
}

export interface KeyRow {
  key: string
  name: string
  count: string
}

export interface RunView {
  title: string | null
  live: boolean
  stats: Stat[]
  named: NamedRow[]
  keys: KeyRow[]
  chest: Stat[]
  /** the copy under the chest heading when there is no chest yet, or null when there is one */
  chestNote: string | null
  empty: string | null
}

export function runView(run: PhoneRun | null, now: number): RunView {
  if (!run) {
    return {
      title: null,
      live: false,
      stats: [],
      named: [],
      keys: [],
      chest: [],
      chestNote: null,
      empty: 'No run yet. Zone into an instance, or start one on the PC.'
    }
  }
  const elapsed = run.active ? Math.max(0, now - run.startedAt) : run.elapsedMs
  const stats: Stat[] = [
    { key: 'time', label: 'Time', value: clock(elapsed) },
    { key: 'kills', label: 'Kills', value: String(run.kills) },
    { key: 'group', label: 'Group', value: String(run.groupKills) },
    // `null` is runTracker's refusal to divide by a stretch that does not exist. It stays a dash.
    { key: 'kpm', label: 'Per min', value: run.killsPerMin === null ? '—' : run.killsPerMin.toFixed(1) }
  ]
  if (run.tier !== undefined) stats.push({ key: 'tier', label: 'Tier', value: String(run.tier) })
  if (run.doors > 0) stats.push({ key: 'doors', label: 'Doors', value: String(run.doors) })
  if (run.deaths > 0) stats.push({ key: 'deaths', label: 'Deaths', value: String(run.deaths) })

  return {
    title: run.base === '' ? run.zone : run.base,
    live: run.active,
    stats,
    // The payload carries them oldest-first (a tail slice of the run's own list); a person reads
    // the newest kill first.
    named: [...run.named].reverse().map((n, index) => ({
      key: `${String(index)}:${n.name}:${String(n.at)}`,
      name: n.name,
      when: ago(n.at, now)
    })),
    keys: run.keys.map((k) => ({ key: k.name, name: k.name, count: String(k.count) })),
    chest:
      run.chest.items > 0
        ? [
            { key: 'items', label: 'Items', value: String(run.chest.items) },
            { key: 'kept', label: 'Kept', value: String(run.chest.kept) },
            { key: 'sold', label: 'Sold', value: String(run.chest.sold) },
            { key: 'merged', label: 'Merged', value: String(run.chest.merged) }
          ]
        : [],
    chestNote: run.chest.items > 0 ? null : run.active ? 'Reward chest: not yet.' : null,
    empty: null
  }
}
