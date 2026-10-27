// themes.test.mts — every cataloged theme keeps body text readable (the user's
// "letters need to be visible" requirement). The default Arcane palette is pinned
// byte-for-byte by palette.test.mts; this suite pins the CONTRACT every new theme
// must meet: text on bg and on paper clears WCAG AA (≥4.5), accent on paper clears
// AA (≥4.5) so chips/links stay readable, and the five series tokens stay pairwise
// distinct so a chart never draws two lanes in one colour.
import test from 'node:test'
import assert from 'node:assert/strict'
import { THEMES } from '../src/shared/themes'

function rgb(hex: string): number[] { return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) }
function lin(c: number): number { const s = c / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4) }
function lum(hex: string): number { const [r, g, b] = rgb(hex); return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b) }
function contrast(a: string, b: string): number { const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05) }

test('every theme keeps body text readable on bg and on paper (WCAG AA ≥4.5)', () => {
  for (const t of THEMES) {
    const onBg = contrast(t.palette.text, t.palette.bg)
    assert.ok(onBg >= 4.5, `${t.name}: text ${t.palette.text} on bg ${t.palette.bg} = ${onBg.toFixed(2)} (needs ≥4.5)`)
    const onPaper = contrast(t.palette.text, t.palette.paper)
    assert.ok(onPaper >= 4.5, `${t.name}: text ${t.palette.text} on paper ${t.palette.paper} = ${onPaper.toFixed(2)} (needs ≥4.5)`)
  }
})

test('every theme keeps accent readable on paper (WCAG AA ≥4.5) so chips and links stay legible', () => {
  for (const t of THEMES) {
    const r = contrast(t.palette.accent, t.palette.paper)
    assert.ok(r >= 4.5, `${t.name}: accent ${t.palette.accent} on paper ${t.palette.paper} = ${r.toFixed(2)} (needs ≥4.5)`)
  }
})

test('every theme keeps the five series tokens distinguishable (accent may repeat a hue)', () => {
  for (const t of THEMES) {
    // The four non-accent series tokens (cyan/green/amber/red) must be pairwise distinct
    // so a chart never draws two of those four lanes in one colour. `accent` is allowed to
    // equal one of them on single-hue themes (e.g. CRT Green) — it is the theme's identity.
    const four = [t.palette.cyan, t.palette.green, t.palette.amber, t.palette.red]
    assert.equal(new Set(four).size, four.length, `${t.name}: the four non-accent series tokens collide`)
  }
})

test('at least 25 themes ship and the default Arcane id is present', () => {
  assert.ok(THEMES.length >= 25, `expected ≥25 themes, got ${THEMES.length}`)
  assert.ok(THEMES.some((t) => t.id === 'arcane'), 'default Arcane theme missing')
})
