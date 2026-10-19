// ============================================================================
// qr.ts — A QR CODE, BYTE MODE, ERROR CORRECTION LEVEL M, WITH NO DEPENDENCY.
// ============================================================================
//
// WHY THIS IS HERE RATHER THAN IN package.json. The one string this app ever needs as a QR code is
// its own pair link (docs/plans/phone-link.md): ~100 characters of `[A-Za-z0-9_\-:/.#&=]` that this
// process minted a moment earlier. A QR encoder for that is a few hundred lines of published,
// unchanging arithmetic — Reed-Solomon over GF(256) and a fixed placement walk — and the trade
// against an npm dependency is not close: `.npmrc` sets `ignore-scripts=true`, so every new package
// is a supply-chain surface this repo reviews by hand, and a renderer dependency would also ride
// into the bundle. It is PURE and node-tested (tests/qr.test.mts), which is the other half of the
// argument: what a dependency usually buys is somebody else's test suite, and this has one.
//
// WHAT IT DOES AND DOES NOT DO. Byte mode only (the input is a URL, and alphanumeric mode cannot
// spell a lowercase letter). EC level M only — 15% recovery, which is what a code read off a screen
// wants. Versions 1..10, which is 213 bytes at level M and roughly twice the longest link this app
// can build; a longer string is a REFUSAL (`null`) rather than a truncated code, because a QR that
// scans to half a key is worse than no QR at all.
//
// THE MASK IS CHOSEN, NOT FIXED (qrMask.ts holds the four penalty rules). A fixed mask is the
// shortcut that produces codes some cameras never lock onto, and the scoring is thirty lines.
//
// THE PLACEMENT WALK, THE FORMAT STRING'S TWO COPIES AND THE VERSION BLOCK follow ISO/IEC 18004
// exactly; `tests/qr.test.mts` walks the finished matrix BACK to the codewords it was built from,
// which is the one cheap test that holds all three of them at once.

import { bestMask, maskBit } from './qrMask'

/** Versions this encoder will produce. Ten is ~2x the longest link this app builds - see header. */
export const QR_MAX_VERSION = 10

/**
 * EC level M, per version: `[ecCodewordsPerBlock, group1Blocks, group1Data, group2Blocks,
 * group2Data]`. Published in ISO/IEC 18004 table 9; `tests/qr.test.mts` re-derives every row's
 * total codeword count against the version's own capacity, so a typo here fails the suite rather
 * than producing a code that will not scan.
 */
const BLOCKS_M: readonly (readonly number[])[] = [
  [10, 1, 16, 0, 0], // v1
  [16, 1, 28, 0, 0],
  [26, 1, 44, 0, 0],
  [18, 2, 32, 0, 0],
  [24, 2, 43, 0, 0],
  [16, 4, 27, 0, 0],
  [18, 4, 31, 0, 0],
  [22, 2, 38, 2, 39],
  [22, 3, 36, 2, 37],
  [26, 4, 43, 1, 44] // v10
]

/** Alignment pattern centre coordinates per version (index 0 = v1, which has none). */
const ALIGN: readonly (readonly number[])[] = [
  [],
  [6, 18],
  [6, 22],
  [6, 26],
  [6, 30],
  [6, 34],
  [6, 22, 38],
  [6, 24, 42],
  [6, 26, 46],
  [6, 28, 50]
]

/** The published total codeword count per version - what `BLOCKS_M` must add up to. */
export const TOTAL_CODEWORDS: readonly number[] = [26, 44, 70, 100, 134, 172, 196, 242, 292, 346]

// ----------------------------------------------------------------------------- GF(256)

/** The field's exponential and log tables, built once. Primitive polynomial 0x11d, the QR one. */
const EXP = new Uint8Array(512)
const LOG = new Uint8Array(256)
for (let i = 0, x = 1; i < 255; i++) {
  EXP[i] = x
  LOG[x] = i
  x <<= 1
  if (x & 0x100) x ^= 0x11d
}
for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255]

function gfMul(a: number, b: number): number {
  return a === 0 || b === 0 ? 0 : EXP[LOG[a] + LOG[b]]
}

/** The degree-`n` Reed-Solomon generator polynomial, coefficients high-order first. */
export function rsGenerator(n: number): Uint8Array {
  let poly = new Uint8Array([1])
  for (let i = 0; i < n; i++) {
    const next = new Uint8Array(poly.length + 1)
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= poly[j]
      next[j + 1] ^= gfMul(poly[j], EXP[i])
    }
    poly = next
  }
  return poly
}

/** The `n` error-correction codewords for one block of data codewords. */
export function rsRemainder(data: Uint8Array, n: number): Uint8Array {
  const gen = rsGenerator(n)
  const out = new Uint8Array(n)
  for (const byte of data) {
    const factor = byte ^ out[0]
    out.copyWithin(0, 1)
    out[n - 1] = 0
    if (factor === 0) continue
    for (let j = 0; j < n; j++) out[j] ^= gfMul(gen[j + 1], factor)
  }
  return out
}

// ----------------------------------------------------------------------------- the bitstream

/** How many DATA codewords one version holds at level M. */
export function dataCodewordCount(version: number): number {
  const row = BLOCKS_M[version - 1]
  return row[1] * row[2] + row[3] * row[4]
}

/** How many BYTES of payload fit in one version at level M. See the header for the arithmetic. */
export function byteCapacity(version: number): number {
  // 4 bits of mode indicator plus the character count (8 bits below v10, 16 bits at v10 and up).
  const headerBits = version < 10 ? 12 : 20
  return Math.floor((dataCodewordCount(version) * 8 - headerBits) / 8)
}

/** The smallest version that holds `bytes`, or 0 when none of them does. */
function versionFor(bytes: number): number {
  for (let v = 1; v <= QR_MAX_VERSION; v++) {
    if (byteCapacity(v) >= bytes) return v
  }
  return 0
}

/** Pack a list of bits (MSB first per value) into whole bytes. */
function packBits(bits: readonly number[], size: number): Uint8Array {
  const out = new Uint8Array(size)
  for (let i = 0; i + 7 < bits.length; i += 8) {
    let byte = 0
    for (let j = 0; j < 8; j++) byte = (byte << 1) | bits[i + j]
    out[i / 8] = byte
  }
  return out
}

/** The data codewords for one payload: mode, count, the bytes, the terminator and the padding. */
export function dataCodewords(bytes: Uint8Array, version: number): Uint8Array {
  const total = dataCodewordCount(version)
  const bits: number[] = []
  const push = (value: number, width: number): void => {
    for (let i = width - 1; i >= 0; i--) bits.push((value >> i) & 1)
  }
  push(0b0100, 4)
  push(bytes.length, version < 10 ? 8 : 16)
  for (const byte of bytes) push(byte, 8)
  // The terminator is up to four zero bits, then zeroes to the next byte boundary.
  for (let i = 0; i < 4 && bits.length < total * 8; i++) bits.push(0)
  while (bits.length % 8 !== 0) bits.push(0)
  const out = packBits(bits, total)
  // The two published pad bytes, alternating, for whatever room is left.
  for (let i = bits.length / 8; i < total; i++) out[i] = (i - bits.length / 8) % 2 === 0 ? 0xec : 0x11
  return out
}

/** The blocks of one version, as `{ data, ec }` pairs in their published order. */
function blocksOf(codewords: Uint8Array, version: number): { data: Uint8Array; ec: Uint8Array }[] {
  const row = BLOCKS_M[version - 1]
  const out: { data: Uint8Array; ec: Uint8Array }[] = []
  let at = 0
  const take = (count: number, size: number): void => {
    for (let i = 0; i < count; i++) {
      const data = codewords.subarray(at, at + size)
      at += size
      out.push({ data, ec: rsRemainder(data, row[0]) })
    }
  }
  take(row[1], row[2])
  take(row[3], row[4])
  return out
}

/**
 * The final codeword stream: the blocks' data columns interleaved, then their EC columns.
 *
 * Exported because `tests/qr.test.mts` walks it back out of the finished matrix and compares - the
 * round trip that proves the interleave, the placement and the mask agree with each other.
 */
export function interleave(codewords: Uint8Array, version: number): Uint8Array {
  const blocks = blocksOf(codewords, version)
  const out: number[] = []
  const widest = Math.max(...blocks.map((b) => b.data.length))
  for (let i = 0; i < widest; i++) {
    for (const block of blocks) {
      if (i < block.data.length) out.push(block.data[i])
    }
  }
  for (let i = 0; i < blocks[0].ec.length; i++) {
    for (const block of blocks) out.push(block.ec[i])
  }
  return Uint8Array.from(out)
}

// ----------------------------------------------------------------------------- the matrix

/** A module grid under construction: `cells` 0 light / 1 dark, `fixed` marking function areas. */
interface Grid {
  size: number
  cells: Uint8Array
  fixed: Uint8Array
}

/** Write one module. Two functions rather than one with a flag, for the repo's parameter ceiling -
 *  and the split reads better anyway: `fix` writes a FUNCTION module the data walk steps over. */
function put(grid: Grid, row: number, col: number, dark: boolean): void {
  grid.cells[row * grid.size + col] = dark ? 1 : 0
}

function fix(grid: Grid, row: number, col: number, dark: boolean): void {
  grid.cells[row * grid.size + col] = dark ? 1 : 0
  grid.fixed[row * grid.size + col] = 1
}

/** The timing rows: alternating modules along row 6 and column 6, between the finders. */
function timing(grid: Grid): void {
  for (let i = 8; i < grid.size - 8; i++) {
    fix(grid, 6, i, i % 2 === 0)
    fix(grid, i, 6, i % 2 === 0)
  }
}

/** One 7x7 finder plus its separator, anchored at the given top-left (which may be off-grid). */
function finder(grid: Grid, top: number, left: number): void {
  for (let r = -1; r <= 7; r++) {
    for (let c = -1; c <= 7; c++) {
      const row = top + r
      const col = left + c
      if (row < 0 || row >= grid.size || col < 0 || col >= grid.size) continue
      const ring = Math.max(Math.abs(r - 3), Math.abs(c - 3))
      fix(grid, row, col, r >= 0 && r <= 6 && c >= 0 && c <= 6 && ring !== 2)
    }
  }
}

/** One 5x5 alignment pattern: a dark ring, a light ring, a dark centre. */
function alignmentAt(grid: Grid, row: number, col: number): void {
  for (let r = -2; r <= 2; r++) {
    for (let c = -2; c <= 2; c++) {
      fix(grid, row + r, col + c, Math.max(Math.abs(r), Math.abs(c)) !== 1)
    }
  }
}

/** The alignment patterns, everywhere two centres meet that is not already under a finder. */
function alignment(grid: Grid, version: number): void {
  const centres = ALIGN[version - 1]
  const last = grid.size - 7
  for (const row of centres) {
    for (const col of centres) {
      const corner = (row === 6 && col === 6) || (row === 6 && col === last) || (row === last && col === 6)
      if (!corner) alignmentAt(grid, row, col)
    }
  }
}

/** BCH remainder of `value << degree` under `generator`. Used by the format and version strings. */
function bchRemainder(value: number, generator: number, degree: number): number {
  const genBits = 32 - Math.clz32(generator)
  let rem = value << degree
  for (let bits = 32 - Math.clz32(rem); bits >= genBits; bits = 32 - Math.clz32(rem)) {
    rem ^= generator << (bits - genBits)
  }
  return rem
}

/** The 15-bit format string for EC level M and one mask. DERIVED, not copied from the table. */
export function formatBits(mask: number): number {
  // EC level M is `00` in the two high bits of the 5-bit data, so the value IS the mask.
  return ((mask << 10) | bchRemainder(mask, 0x537, 10)) ^ 0x5412
}

/** The 18-bit version string, versions 7 and up. DERIVED, not copied from the table. */
export function versionBits(version: number): number {
  return (version << 12) | bchRemainder(version, 0x1f25, 12)
}

/**
 * The format string, in both of its published copies.
 *
 * Called twice: once with mask 0 while the grid is being built, purely to RESERVE the modules it
 * occupies, and once at the end with the chosen mask. The module at `(size - 8, 8)` is always dark
 * and belongs to neither copy.
 */
function writeFormat(grid: Grid, mask: number): void {
  const n = grid.size
  const bits = formatBits(mask)
  const bit = (i: number): boolean => ((bits >> i) & 1) === 1
  for (let i = 0; i <= 5; i++) fix(grid, i, 8, bit(i))
  fix(grid, 7, 8, bit(6))
  fix(grid, 8, 8, bit(7))
  fix(grid, 8, 7, bit(8))
  for (let i = 9; i < 15; i++) fix(grid, 8, 14 - i, bit(i))
  for (let i = 0; i < 8; i++) fix(grid, 8, n - 1 - i, bit(i))
  for (let i = 8; i < 15; i++) fix(grid, n - 15 + i, 8, bit(i))
  fix(grid, n - 8, 8, true)
}

/** The version block, in both of its copies. A no-op below version 7, which carries none. */
function writeVersion(grid: Grid, version: number): void {
  if (version < 7) return
  const bits = versionBits(version)
  for (let i = 0; i < 18; i++) {
    const dark = ((bits >> i) & 1) === 1
    fix(grid, Math.floor(i / 3), grid.size - 11 + (i % 3), dark)
    fix(grid, grid.size - 11 + (i % 3), Math.floor(i / 3), dark)
  }
}

/** The placement walk's state: where the next bit comes from and which grid it lands in. */
interface Cursor {
  grid: Grid
  stream: Uint8Array
  bit: number
}

/** One module of the walk. A function module is stepped over WITHOUT consuming a bit. */
function placeAt(cur: Cursor, row: number, col: number): void {
  if (cur.grid.fixed[row * cur.grid.size + col] === 1) return
  const at = cur.bit
  const value = at < cur.stream.length * 8 ? (cur.stream[at >> 3] >> (7 - (at & 7))) & 1 : 0
  put(cur.grid, row, col, value === 1)
  cur.bit = at + 1
}

/** The zig-zag: two columns at a time from the right edge, alternating up and down, skipping col 6. */
function placeData(grid: Grid, stream: Uint8Array): void {
  const cur: Cursor = { grid, stream, bit: 0 }
  let upward = true
  for (let right = grid.size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5
    for (let vert = 0; vert < grid.size; vert++) {
      const row = upward ? grid.size - 1 - vert : vert
      placeAt(cur, row, right)
      placeAt(cur, row, right - 1)
    }
    upward = !upward
  }
}

/** XOR the mask over every module the function patterns did not claim. */
function applyMask(grid: Grid, mask: number): void {
  for (let r = 0; r < grid.size; r++) {
    for (let c = 0; c < grid.size; c++) {
      const at = r * grid.size + c
      if (grid.fixed[at] === 0 && maskBit(mask, r, c)) grid.cells[at] ^= 1
    }
  }
}

/** The grid as rows of booleans - the shape every caller and the test suite read. */
function toRows(grid: Grid): boolean[][] {
  return Array.from({ length: grid.size }, (_, r) =>
    Array.from({ length: grid.size }, (_, c) => grid.cells[r * grid.size + c] === 1)
  )
}

/** Everything but the mask: the function patterns and the placed data, for one version. */
function unmasked(bytes: Uint8Array, version: number): Grid {
  const size = 17 + version * 4
  const grid: Grid = { size, cells: new Uint8Array(size * size), fixed: new Uint8Array(size * size) }
  timing(grid)
  finder(grid, 0, 0)
  finder(grid, 0, size - 7)
  finder(grid, size - 7, 0)
  alignment(grid, version)
  writeFormat(grid, 0)
  writeVersion(grid, version)
  placeData(grid, interleave(dataCodewords(bytes, version), version))
  return grid
}

/** One candidate: the grid masked with `mask` and stamped with that mask's format string. */
function candidate(bytes: Uint8Array, version: number, mask: number): Grid {
  const grid = unmasked(bytes, version)
  applyMask(grid, mask)
  writeFormat(grid, mask)
  return grid
}

/** The finished module grid, masked and stamped, or null when the text is longer than v10 holds. */
export function qrMatrix(text: string): boolean[][] | null {
  const bytes = new TextEncoder().encode(text)
  const version = versionFor(bytes.length)
  if (version === 0) return null
  const mask = bestMask((m) => toRows(candidate(bytes, version, m)))
  return toRows(candidate(bytes, version, mask))
}

/**
 * The code as an inline SVG, one `<rect>` per dark module over one background rect.
 *
 * A `viewBox` in MODULE units and no width/height attributes, so the caller sizes it in CSS and the
 * code stays crisp at any size. The four-module quiet zone is part of the specification rather than
 * padding a stylesheet may remove: a code drawn edge to edge does not scan.
 */
export function qrSvg(text: string, opts: { dark?: string; light?: string } = {}): string | null {
  const matrix = qrMatrix(text)
  if (!matrix) return null
  const quiet = 4
  const span = matrix.length + quiet * 2
  const dark = opts.dark ?? '#0c0a1f'
  const light = opts.light ?? '#ffffff'
  const rects: string[] = []
  for (let r = 0; r < matrix.length; r++) {
    for (let c = 0; c < matrix.length; c++) {
      if (matrix[r][c]) rects.push(`<rect x="${String(c + quiet)}" y="${String(r + quiet)}" width="1" height="1"/>`)
    }
  }
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${String(span)} ${String(span)}" ` +
    `shape-rendering="crispEdges" role="img">` +
    `<rect width="${String(span)}" height="${String(span)}" fill="${light}"/>` +
    `<g fill="${dark}">${rects.join('')}</g></svg>`
  )
}
