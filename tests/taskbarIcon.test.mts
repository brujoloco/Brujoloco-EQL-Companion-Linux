// ============================================================================
// taskbarIcon.test.mts — 0.2.20: the window mark is the wizard emoji.
// ============================================================================
//
// WHAT THIS IS ABOUT. The owner's ask: "replace the taskbar icon that shows a
// stylized window with three letters — I want the icon to be a black hair
// wizard emoji. Is it possible?" Yes: the taskbar reads _NET_WM_ICON (verified
// live on this machine, 2026-10-25), Electron sets it from the BrowserWindow
// `icon:` option, and the emoji itself is rendered from Noto Color Emoji by
// this repo's own Chromium — committed as build/icon.png.
//
// THE ONE-WAY RULE, honoured rather than broken: gen-icon.mts was the one
// writer of build/icon.png AND build/icon-tray.png, so both changes would be
// clobbered by the next `npm run gen:icon`. The script no longer writes
// either PNG (its one output left is the Windows .ico — a surface this Linux
// Edition does not ship), and the committed assets are the one truth.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const src = (rel: string): string => readFileSync(join(ROOT, rel), 'utf8')

test('the main window carries an explicit icon — the taskbar reads it from _NET_WM_ICON', () => {
  const windows = src('src/main/windows.ts')
  assert.match(windows, /import windowIconAsset from '\.\.\/\.\.\/build\/icon\.png\?asset'/, 'the icon is wired through the build (the tray icon own pattern), so a packaged app finds it beside the bundle')
  assert.match(
    windows,
    /icon: nativeImage\s*\.createFromPath\(windowIconAsset\)\s*\.resize\(\{ width: 64, height: 64 \}\),/,
    'createMainWindow sets the icon as a 64px NATIVEIMAGE — the string form ships iconless, and 256 lands an empty _NET_WM_ICON on this WM (measured, 0.2.20)'
  )
})

test('gen-icon no longer writes either committed PNG — the emoji cannot be clobbered', () => {
  const gen = src('scripts/gen-icon.mts')
  assert.ok(
    !gen.includes("writeFileSync(join(outDir, 'icon.png')"),
    'the one writer of the committed window asset is git, not the generator'
  )
  assert.ok(
    !gen.includes("writeFileSync(join(outDir, 'icon-tray.png')"),
    'the same for the tray asset — 0.2.21'
  )
  assert.match(gen, /NOR build\/icon-tray\.png/, 'the reason is stated in the file')
  // The one surface left: the Windows .ico, which this Linux Edition does not ship.
  assert.match(gen, /writeFileSync\(join\(outDir, 'icon\.ico'\), ico\)/, 'the .ico keeps its writer')
})

test('the committed icons are rendered glyphs, not plates — 256 window, 32 tray', () => {
  for (const [file, size] of [['icon.png', 256], ['icon-tray.png', 32]]) {
    const b = readFileSync(join(ROOT, 'build', file))
    assert.equal(b.slice(0, 8).toString('hex'), '89504e470d0a1a0a', file + ': the PNG signature')
    assert.equal(b.readUInt32BE(16), size, file + ': ' + String(size) + ' wide')
    assert.equal(b.readUInt32BE(20), size, file + ': ' + String(size) + ' tall')
    assert.equal(b[25], 6, file + ': truecolour + alpha — the glyph corners are transparent')
  }
})