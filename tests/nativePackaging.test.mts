// ============================================================================
// nativePackaging.test.mts — 0.2.17: the native binaries the package SHIPS.
// ============================================================================
//
// WHAT THIS IS ABOUT. The cursor ring never appeared in ANY packaged build —
// not 0.2.16 (which shipped a correct X11 presence surface), and not anything
// before it. The runner reproduced the owner's report by launching the real
// AppImage: errors.log filled with "Cannot find the native Koffi module; did
// you bundle it correctly?" every thirty seconds, the watcher's crash loop —
// because upstream's electron-builder.yml excluded every koffi prebuilt
// except win32_x64, and the Linux Edition had no binding to load. The X11
// surface was right; the PACKAGE was wrong.
//
// WHY PINNED AS SOURCE. These are `files:` exclusion patterns in a yaml file —
// nothing executes them until a package is built, and the failure they cause is
// silent at build time and load-bearing at run time. So this suite reads the
// config the way the repo's other packaging suites do (enginePackaging) and
// pins the two facts a build depends on: the koffi prebuilds this app can load
// are IN the pattern's keep-set, and the onnxruntime Linux set is not pruned.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const builderYml = readFileSync(join(ROOT, 'electron-builder.yml'), 'utf8')

/** The active `files:` exclusion patterns — the `!...` glob bodies, quotes and LF stripped. */
function exclusionPatterns(): string[] {
  return builderYml
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.startsWith("- '!"))
    .map((l) => l.replace(/^- '!/, '').replace(/'$/, ''))
}

test('the koffi exclusion keeps the one prebuild this app can load', () => {
  const koffi = exclusionPatterns().find((p) => p.startsWith('node_modules/koffi/build/koffi/!'))
  assert.ok(koffi, 'electron-builder.yml must keep one koffi prebuild exclusion line')
  assert.match(
    koffi,
    /!\(linux_x64\)/,
    'the negated set keeps linux_x64 (the X11 surface, 0.2.17; win32_x64 left with the Windows-only machinery, 0.2.27) — anything else and the packaged watcher throws "Cannot find the native Koffi module"'
  )
})

test('the onnxruntime exclusion prunes darwin only — the speech engine loads the Linux set', () => {
  const onnx = exclusionPatterns().filter((p) => p.includes('onnxruntime-node'))
  assert.ok(onnx.length > 0, 'electron-builder.yml must keep its onnxruntime exclusions')
  for (const p of onnx) {
    assert.ok(
      !/darwin,linux/.test(p),
      'no onnxruntime pattern may exclude linux — the packaged speech engine loads the linux-x64 binary (0.2.17)'
    )
  }
})

test('onnxruntime prunes the whole win32 tree — the Windows sets left with the machinery', () => {
  const onnx = exclusionPatterns().filter((p) => p.includes('onnxruntime-node'))
  assert.ok(
    onnx.some((p) => p.includes('win32/**')),
    '0.2.30: the win32 sets (~65 MB) are excluded — the Linux Edition loads linux-x64 only'
  )
})