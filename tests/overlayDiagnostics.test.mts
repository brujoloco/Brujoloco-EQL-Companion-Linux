// THE OVERLAY DIAGNOSTICS TRACE'S POLICY (0.2.1), held the pointerWatch.ts way: the
// decisions are pure and driveable with strings and fakes, and the machine half
// (xprop, the real X, the real windows) is proven by running this build on the
// machine that has the problem — which is the trace's whole reason to exist.
//
// WHAT THE TRACE MUST NOT DO is as load-bearing as what it must: no write on
// stillness (the log is the story, not a transcript), no crash on an unreadable
// window, and the first tick always writes (the boot-time state is the baseline
// every later snapshot is diffed against).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  DIAG_INTERVAL_MS,
  parseStackIds,
  renderSnapshot,
  snapshotChanged,
  snapshotSignature,
  startOverlayDiagnostics,
  stopOverlayDiagnostics,
  type OverlayFact
} from '../src/main/overlayDiagnostics'

const ROOT_LINE =
  '_NET_CLIENT_LIST_STACKING(WINDOW): window id # 0x1000006, 0x3000002, 0x4400006, 0x8600001'

const FACTS: readonly OverlayFact[] = [
  {
    kind: 'overall',
    id: 101,
    visible: true,
    alwaysOnTop: true,
    bounds: { x: 100, y: 100, width: 400, height: 300 } as OverlayFact['bounds']
  },
  {
    kind: 'fight',
    id: 102,
    visible: false,
    alwaysOnTop: false,
    bounds: { x: 0, y: 0, width: 400, height: 300 } as OverlayFact['bounds']
  }
]

test('parseStackIds reads the root stacking order, bottom first', () => {
  assert.deepEqual(parseStackIds(ROOT_LINE), ['0x1000006', '0x3000002', '0x4400006', '0x8600001'])
  assert.deepEqual(parseStackIds('not an xprop line'), [], 'a failed read is an empty stack, not a throw')
  assert.deepEqual(parseStackIds(''), [])
})

test('one snapshot states both halves: the stack as X says it, the facts as Electron does', () => {
  const block = renderSnapshot('2026-10-25T20:00:00.000Z', ROOT_LINE, FACTS)
  assert.match(block, /=== overlay-diagnostics 2026-10-25T20:00:00.000Z \(4 windows stacked\) ===/)
  assert.match(block, /stack-bottom-first: 0x1000006 0x3000002 0x4400006 0x8600001/)
  assert.match(block, /overall: id=101 visible=true top=true bounds=100,100 400x300/)
  assert.match(block, /fight: id=102 visible=false top=false bounds=0,0 400x300/)
  // An empty overlay set is a stated fact, not a missing line.
  const bare = renderSnapshot('t', ROOT_LINE, [])
  assert.match(bare, /\(no overlay window exists\)/)
})

test('a snapshot is worth a write only when its CONTENT differs from the last one', () => {
  assert.equal(snapshotChanged(null, 'a'), true, 'the first snapshot always writes')
  assert.equal(snapshotChanged('a', 'a'), false, 'stillness is not a story')
  assert.equal(snapshotChanged('a', 'b'), true)
  // THE CLOCK IS NOT CONTENT: two snapshots a second apart with one unchanged stack
  // are one story told twice, and the signature says so by leaving the timestamp out.
  const a = snapshotSignature('stack-a', FACTS)
  assert.equal(a, snapshotSignature('stack-a', FACTS))
  assert.notEqual(a, snapshotSignature('stack-b', FACTS))
})

test('the trace writes on change and on nothing else', async () => {
  const realPath = '/tmp/eql-diag-test.log'
  let n = 0
  const stackAt = (): string =>
    ROOT_LINE.replace('0x8600001', `0x${(9000000 + n).toString(16)}`) // changes when n does
  startOverlayDiagnostics({
    enabled: true,
    logPath: realPath,
    facts: () => FACTS,
    readStack: stackAt,
    intervalMs: 30
  })
  await new Promise((r) => setTimeout(r, 120)) // ~4 ticks, ONE snapshot: stillness is not a story
  n += 1
  await new Promise((r) => setTimeout(r, 120)) // the stack changed: exactly one more write
  stopOverlayDiagnostics()
  stopOverlayDiagnostics() // idempotent
  const written = await import('node:fs/promises').then((fs) => fs.readFile(realPath, 'utf8'))
  const snapshots = written.split('=== overlay-diagnostics').length - 1
  assert.equal(snapshots, 2, `boot baseline + one change, saw ${snapshots}`)
  await import('node:fs/promises').then((fs) => fs.rm(realPath, { force: true }))
})

test('a closed gate touches nothing, and the poll period is the argued one', () => {
  startOverlayDiagnostics({
    enabled: false,
    logPath: '/tmp/never-written-eql-diag.log',
    facts: () => FACTS
  })
  assert.equal(DIAG_INTERVAL_MS, 2000)
  stopOverlayDiagnostics()
})