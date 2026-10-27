// enginePerf — the engine's row in the performance panel, proven without an engine (JOS-483).
//
// > "i want to see the server in the cpu/performance overlay in app." — owner, ruling 19.
//
// THREE LAYERS, THREE KINDS OF CLAIM, and each is tested where it can actually be seen:
//

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mountHook } from './hookHost.mjs'
import {
  CLOCK_SKEW_WARN_MS,
  engineFireCount,
  eventFreshnessMs,
  formatBytes,
  formatAge,
  formatEngineClock,
  formatEngineState,
  formatMicros,
  formatParity,
  type EnginePerfSample
} from '../src/shared/enginePerf'
import { useEnginePerf } from '../src/renderer/src/lib/enginePerfHud'
import type { PerfSnapshotResult } from '../src/shared/dataServer/protocol.generated'

// (The per-pid sampler section left with the Win32 module, 2026-10-27.)

// ---- 2. the formatters --------------------------------------------------------------------------

/** A snapshot with just enough in it for the formatter under test. */
function snapshot(over: Partial<PerfSnapshotResult> = {}): PerfSnapshotResult {
  return { status: 'live', epoch: 2, uptimeMs: 1_000, ingest: {}, serve: [], ...over }
}

function sample(over: Partial<EnginePerfSample> = {}): EnginePerfSample {
  return {
    ts: 1_000_000,
    supervisor: 'ready',
    process: null,
    engine: snapshot(),
    // JOS-502: the budgets ride the same tick. `null` is the ordinary case for these fixtures —
    // they are about the SNAPSHOT's arithmetic, and a panel whose engine refused the budgets still
    // draws every row above them.
    budgets: null,
    parity: null,
    ...over
  }
}

test('a sub-millisecond serve path reports MICROSECONDS, not "0 ms"', () => {
  // The engine's own stderr line keeps this rule (`views::meter::took`) and the panel must keep
  // it too: cutting a fifty-row window off a fold takes tens of microseconds, and `0.0 ms` reads
  // as a measurement nobody took rather than as the good news it is.
  assert.equal(formatMicros(29), '29 µs')
  assert.equal(formatMicros(999), '999 µs')
  assert.equal(formatMicros(1_500), '1.5 ms')
  assert.equal(formatMicros(812_000), '812 ms')
})

test('byte counts read at the scale a scan actually produces', () => {
  assert.equal(formatBytes(96), '96 B')
  assert.equal(formatBytes(18_734), '18 kB')
  assert.equal(formatBytes(9_185_240), '9 MB')
  assert.equal(formatBytes(2 * 1024 * 1024 * 1024), '2 GB')
})

test('an age follows its own scale — milliseconds to weeks, and never 1695178.84 s', () => {
  // MEASURED, on the run that produced this ticket's acceptance evidence: a fixture whose last log
  // line was three weeks old rendered through `formatMs` as `1695178.84 s`, which buries the one
  // fact the row exists to carry. Freshness spans nine orders of magnitude; the unit follows.
  assert.equal(formatAge(0), '0 ms')
  assert.equal(formatAge(940), '940 ms')
  assert.equal(formatAge(2_500), '2.5 s')
  assert.equal(formatAge(90_000), '2 min')
  assert.equal(formatAge(5_400_000), '1.5 h')
  assert.equal(formatAge(1_695_178_840), '19.6 days')
})

test('freshness is the HOST clock minus the LOG clock, and absent when nothing has folded', () => {
  // The engine reads no wall clock to answer `perf.snapshot` — that is the determinism law its
  // store seam rests on — so the subtraction is the caller's, and it happens here.
  assert.equal(eventFreshnessMs(sample({ engine: snapshot({ lastEventTs: 999_000 }) })), 1_000)
  // Nothing folded, so there is no age to report. NOT zero, which would read as "up to date".
  assert.equal(eventFreshnessMs(sample()), null)
  assert.equal(eventFreshnessMs(sample({ engine: null })), null)
  // A log line stamped in the future is a statement about two clocks, not about the fold.
  assert.equal(eventFreshnessMs(sample({ engine: snapshot({ lastEventTs: 1_001_000 }) })), 0)
})

test('the state line names the status and the epoch, and says so when nobody answered', () => {
  assert.equal(formatEngineState(sample()), 'live · epoch 2')
  assert.equal(formatEngineState(sample({ engine: null, supervisor: 'backoff' })), 'backoff · not answering')
})

test('the clock line names the zone, where it came from, and how far it disagrees', () => {
  // JOS-536. The engine resolves the log's zone at attach and measures the disagreement on the live
  // tail; this row is where a person sees both. `host` means the app told it, which is the whole
  // point of the hint the attach carries.
  assert.deepEqual(
    formatEngineClock(
      sample({
        engine: snapshot({
          clockZone: 'America/Los_Angeles',
          clockSource: 'host',
          clockSkewMs: 412
        })
      })
    ),
    { text: 'America/Los_Angeles (host) · skew 412 ms', warning: false }
  )
  // A tail that has folded no fresh line has measured no skew, and says the zone alone.
  assert.deepEqual(
    formatEngineClock(
      sample({ engine: snapshot({ clockZone: '-07:00', clockSource: 'offset' }) })
    ),
    { text: '-07:00 (offset)', warning: false }
  )
  // A fixed-offset zone reads as a stamp in the future when the host is east of the log's; the sign
  // is kept, because which way the two clocks disagree is half the reading.
  assert.deepEqual(
    formatEngineClock(
      sample({
        engine: snapshot({ clockZone: 'UTC', clockSource: 'utc', clockSkewMs: -2_500 })
      })
    ),
    { text: 'UTC (utc) · skew -2.5 s', warning: false }
  )
  // Nothing has attached, so there is no zone to name. Absent, never a guess.
  assert.equal(formatEngineClock(sample()), null)
  assert.equal(formatEngineClock(sample({ engine: null })), null)
})

test('past half an hour the clock line stops measuring and warns', () => {
  // THE WINE FAILURE AS A PERSON SEES IT. 25,217,204 ms is the first 1.15.0 report's own number:
  // seven hours, which is not a lag but a zone. The row drops the IANA name — somebody reading
  // "fights and timers will be wrong" does not need an identifier to act on it.
  const line = formatEngineClock(
    sample({
      engine: snapshot({
        clockZone: 'UTC',
        clockSource: 'utc',
        clockSkewMs: 25_217_204
      })
    })
  )
  assert.deepEqual(line, {
    text: "The log's clock disagrees with this machine's by 7h 0m. Fights and timers will be wrong.",
    warning: true
  })
  // The mirror failure: an east-of-UTC host reads the log AHEAD, and warns just the same.
  assert.equal(
    formatEngineClock(
      sample({ engine: snapshot({ clockZone: 'UTC', clockSource: 'utc', clockSkewMs: -CLOCK_SKEW_WARN_MS }) })
    )?.warning,
    true
  )
  // …and one second under the bar is still a measurement.
  assert.equal(
    formatEngineClock(
      sample({
        engine: snapshot({ clockZone: 'UTC', clockSource: 'utc', clockSkewMs: CLOCK_SKEW_WARN_MS - 1 })
      })
    )?.warning,
    false
  )
})

test('a parity probe that never ran is NOT a clean bill', () => {
  // The mistake `engineHost.ts` refuses to make about a missing binary: silence and success must
  // never look alike.
  assert.equal(formatParity(null), 'no probe has run')
  assert.equal(
    formatParity({ at: 1, logPath: 'x', agree: 5, diverge: 0, skipped: 0 }),
    '5 agree · 0 diverge · 0 skipped'
  )
})

test('the fire count is read defensively and is absent by default', () => {
  // No engine build publishes it today; the row appears the moment one does, and until then it is
  // simply not there.
  assert.equal(engineFireCount(snapshot()), null)
  assert.equal(engineFireCount(null), null)
  assert.equal(engineFireCount({ ...snapshot(), fires: 17 } as PerfSnapshotResult), 17)
  assert.equal(engineFireCount({ ...snapshot(), fires: 'lots' } as unknown as PerfSnapshotResult), null)
})

// ---- 3. the panel's plumbing --------------------------------------------------------------------

interface Bridge {
  readonly watches: boolean[]
  readonly subscriptions: number
  push(sample: EnginePerfSample | null): void
}

/** Install a `window.eq` carrying only the two methods this hook uses. */
function bridge(): Bridge {
  const watches: boolean[] = []
  let listener: ((s: EnginePerfSample | null) => void) | null = null
  let subscriptions = 0
  const eq = {
    onEnginePerf(cb: (s: EnginePerfSample | null) => void): () => void {
      subscriptions += 1
      listener = cb
      return () => {
        listener = null
      }
    },
    watchEnginePerf(open: boolean): Promise<void> {
      watches.push(open)
      return Promise.resolve()
    }
  }
  ;(globalThis as unknown as { window: unknown }).window = { eq }
  return {
    watches,
    get subscriptions() {
      return subscriptions
    },
    push(s) {
      listener?.(s)
    }
  }
}

test('opening the panel ARMS the poll, and closing it disarms — the whole discipline', () => {
  const b = bridge()
  const host = mountHook(() => useEnginePerf(true))

  assert.deepEqual(b.watches, [true], 'the poll is armed exactly once on mount')
  assert.equal(b.subscriptions, 1)
  // SUBSCRIBED BEFORE ARMED. Main pushes immediately on arming, so the other order would drop the
  // first sample and leave the section blank for a whole interval.
  assert.equal(host.value, null, 'nothing has arrived yet')

  const arrived = sample({ supervisor: 'ready' })
  host.act(() => {
    b.push(arrived)
  })
  assert.equal(host.value, arrived)

  host.unmount()
  assert.deepEqual(b.watches, [true, false], 'a closed panel stops the poll')
})

test('a panel that is not open arms nothing at all', () => {
  // The cost of this feature on a session where nobody opens the popover is zero timers and zero
  // round trips, and this is the assertion that says so.
  const b = bridge()
  const host = mountHook(() => useEnginePerf(false))
  assert.deepEqual(b.watches, [])
  assert.equal(b.subscriptions, 0)
  assert.equal(host.value, null)
  host.unmount()
  assert.deepEqual(b.watches, [], 'and unmounting an unarmed hook says nothing either')
})

test('a null push hides the section rather than freezing it on the last numbers', () => {
  // The chip's own contract, one level down: `null` means there is nothing to draw — the flag is
  // off, or this build carries no engine binary.
  const b = bridge()
  const host = mountHook(() => useEnginePerf(true))
  host.act(() => {
    b.push(sample())
  })
  assert.ok(host.value)
  host.act(() => {
    b.push(null)
  })
  assert.equal(host.value, null)
  host.unmount()
})
