// status-strip.test.ts — the connection pill's two decisions.
//
// They are extracted from the component precisely so that they can be asserted: which of the four
// states the pill is in, and when it starts admitting how old the newest frame is. Both are the
// difference between "the meter has not moved" and "nothing is arriving", which is the one thing
// a second screen must never be vague about.

import { pillKind, staleLabel } from './status-strip'
import { STALE_AFTER_MS } from '@/constants'
import type { RelayStatus } from '@/phone/relay'

const base: RelayStatus = { open: false, desk: false, lastFrameAt: 0, attempt: 0 }

describe('which state the pill is in', () => {
  test('not paired at all', () => {
    expect(pillKind(base, false)).toBe('idle')
    expect(pillKind({ ...base, open: true, desk: true }, false)).toBe('idle')
  })

  test('paired but the socket is not open', () => {
    expect(pillKind(base, true)).toBe('waiting')
    expect(pillKind({ ...base, attempt: 4 }, true)).toBe('waiting')
  })

  test('open, with the desktop attached — and open, without it', () => {
    expect(pillKind({ ...base, open: true, desk: true }, true)).toBe('live')
    expect(pillKind({ ...base, open: true, desk: false }, true)).toBe('offline')
  })
})

describe('how old the newest frame is', () => {
  const now = 1_700_000_000_000

  test('nothing has ever arrived: it says nothing rather than "0s ago"', () => {
    expect(staleLabel(base, now)).toBe('')
  })

  test('a fresh frame says nothing', () => {
    expect(staleLabel({ ...base, lastFrameAt: now - 1000 }, now)).toBe('')
    expect(staleLabel({ ...base, lastFrameAt: now - (STALE_AFTER_MS - 1) }, now)).toBe('')
  })

  test('past the threshold it says how long', () => {
    expect(staleLabel({ ...base, lastFrameAt: now - 12_000 }, now)).toBe('last update 12s ago')
    expect(staleLabel({ ...base, lastFrameAt: now - STALE_AFTER_MS }, now)).toBe('last update 5s ago')
  })
})
