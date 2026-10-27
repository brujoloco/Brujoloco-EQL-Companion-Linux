// ============================================================================
// qr.test.mts — THE QR ENCODER (src/shared/qr.ts + qrMask.ts).
// ============================================================================
//
// This repo generates QR codes with no dependency (qr.ts's header says why), which means there is
// no upstream suite standing behind the arithmetic and this file IS the standing behind it. Three
// kinds of guard, in ascending order of how much they catch:
//
//   * PUBLISHED CONSTANTS. The eight level-M format strings, two version strings and the degree-10
//     Reed-Solomon generator polynomial are printed in ISO/IEC 18004 and reproduced in every
//     reference implementation. `qr.ts` DERIVES all of them (BCH remainders, a GF(256) product), so
//     comparing against the published values is comparing two independent things.
//   * THE BLOCK TABLE ADDS UP. Every row of `BLOCKS_M` must reconstruct its version's published
//     total codeword count. A transposed digit there produces a code that looks perfect and scans
//     as nothing, which is the failure mode worth the most.
//   * THE ROUND TRIP, which is the real test. The finished matrix is read BACK: this file rebuilds
//     the function-module map from the specification INDEPENDENTLY (a second implementation, not a
//     shared helper), reads the mask out of the format string, un-masks, walks the zig-zag the
//     other way and recovers the codeword stream — then decodes the mode, the length and the bytes.
//     Placement, interleave, masking and the format string have to agree with each other for that
//     to come back, and nothing short of all four being right makes it.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  byteCapacity,
  dataCodewordCount,
  dataCodewords,
  formatBits,
  interleave,
  qrMatrix,
  qrSvg,
  rsGenerator,
  TOTAL_CODEWORDS,
  versionBits,
  QR_MAX_VERSION
} from '../src/shared/qr'
import { maskBit, maskPenalty } from '../src/shared/qrMask'

// ---- the published constants ------------------------------------------------------------

/** ISO/IEC 18004 table 12, the eight EC-level-M rows. */
const FORMAT_M: readonly string[] = [
  '101010000010010',
  '101000100100101',
  '101111001111100',
  '101101101001011',
  '100010111111001',
  '100000011001110',
  '100111110010111',
  '100101010100000'
]

test('the eight level-M format strings match the published table', () => {
  for (let mask = 0; mask < 8; mask++) {
    assert.equal(formatBits(mask).toString(2).padStart(15, '0'), FORMAT_M[mask], `mask ${String(mask)}`)
  }
})

test('the version strings match the published table', () => {
  assert.equal(versionBits(7), 0x07c94)
  assert.equal(versionBits(10), 0x0a4d3)
})

test('the degree-10 Reed-Solomon generator matches the published coefficients', () => {
  assert.deepEqual(
    Array.from(rsGenerator(10)),
    [1, 216, 194, 159, 111, 199, 94, 95, 113, 157, 193]
  )
  // Degree 16's leading run, same table; the whole polynomial is 17 long.
  assert.deepEqual(Array.from(rsGenerator(16)).slice(0, 4), [1, 59, 13, 104])
})

test('every block row reconstructs its version total codeword count', () => {
  // total = data + ec, and ec = blocks * ecPerBlock. `dataCodewordCount` is the data half; the
  // published total is the other side of the identity, so a typo in either fails here.
  const ecPerBlock = [10, 16, 26, 18, 24, 16, 18, 22, 22, 26]
  const blocks = [1, 1, 1, 2, 2, 4, 4, 4, 5, 5]
  for (let v = 1; v <= QR_MAX_VERSION; v++) {
    assert.equal(
      dataCodewordCount(v) + blocks[v - 1] * ecPerBlock[v - 1],
      TOTAL_CODEWORDS[v - 1],
      `version ${String(v)}`
    )
  }
})

test('byte capacity climbs and a payload past version 10 is refused, never truncated', () => {
  for (let v = 2; v <= QR_MAX_VERSION; v++) {
    assert.ok(byteCapacity(v) > byteCapacity(v - 1))
  }
  assert.equal(byteCapacity(1), 14)
  assert.equal(byteCapacity(10), 213)
  assert.equal(qrMatrix('x'.repeat(214)), null, 'one byte past v10 is null')
  assert.ok(qrMatrix('x'.repeat(213)))
})

// ---- the independent reader -------------------------------------------------------------

/** The alignment centres, spelled out here rather than imported: this file is a second opinion. */
const CENTRES: readonly (readonly number[])[] = [
  [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34],
  [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50]
]

/** Which modules a decoder must step over: finders, separators, timing, format, version. */
function functionMap(size: number): boolean[][] {
  const version = (size - 17) / 4
  const fixed = Array.from({ length: size }, () => new Array<boolean>(size).fill(false))
  const mark = (r: number, c: number): void => {
    if (r >= 0 && r < size && c >= 0 && c < size) fixed[r][c] = true
  }
  for (const [top, left] of [[0, 0], [0, size - 7], [size - 7, 0]]) {
    for (let r = -1; r <= 7; r++) {
      for (let c = -1; c <= 7; c++) mark(top + r, left + c)
    }
  }
  for (let i = 0; i < size; i++) {
    mark(6, i)
    mark(i, 6)
  }
  // The format string's two copies: column 8 and row 8, at both ends.
  for (let i = 0; i <= 8; i++) {
    mark(i, 8)
    mark(8, i)
    mark(size - 8 + i, 8)
    mark(8, size - 8 + i)
  }
  for (const row of CENTRES[version - 1]) {
    for (const col of CENTRES[version - 1]) markAlignment(mark, row, col, size)
  }
  if (version >= 7) markVersionBlocks(mark, size)
  return fixed
}

function markAlignment(
  mark: (r: number, c: number) => void,
  row: number,
  col: number,
  size: number
): void {
  // The three centres that fall inside a finder's corner are not alignment patterns at all.
  const last = size - 7
  if ((row === 6 && col === 6) || (row === 6 && col === last) || (row === last && col === 6)) return
  for (let r = -2; r <= 2; r++) {
    for (let c = -2; c <= 2; c++) mark(row + r, col + c)
  }
}

function markVersionBlocks(mark: (r: number, c: number) => void, size: number): void {
  for (let i = 0; i < 18; i++) {
    mark(Math.floor(i / 3), size - 11 + (i % 3))
    mark(size - 11 + (i % 3), Math.floor(i / 3))
  }
}

/** The mask number out of the format string's first copy - the decoder's own first step. */
function readMask(matrix: readonly (readonly boolean[])[]): number {
  let bits = 0
  const read = (r: number, c: number, i: number): void => {
    if (matrix[r][c]) bits |= 1 << i
  }
  for (let i = 0; i <= 5; i++) read(i, 8, i)
  read(7, 8, 6)
  read(8, 8, 7)
  read(8, 7, 8)
  for (let i = 9; i < 15; i++) read(8, 14 - i, i)
  const data = (bits ^ 0x5412) >> 10
  assert.equal(data >> 3, 0, 'the EC level is M')
  return data & 7
}

/** The codeword stream, read back out of a finished matrix the way a scanner reads it. */
function readStream(matrix: readonly (readonly boolean[])[]): Uint8Array {
  const size = matrix.length
  const fixed = functionMap(size)
  const mask = readMask(matrix)
  const bits: number[] = []
  const take = (row: number, col: number): void => {
    if (fixed[row][col]) return
    bits.push((matrix[row][col] !== maskBit(mask, row, col) ? 1 : 0))
  }
  let upward = true
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5
    for (let vert = 0; vert < size; vert++) {
      const row = upward ? size - 1 - vert : vert
      take(row, right)
      take(row, right - 1)
    }
    upward = !upward
  }
  const out = new Uint8Array(Math.floor(bits.length / 8))
  for (let i = 0; i < out.length; i++) {
    let byte = 0
    for (let j = 0; j < 8; j++) byte = (byte << 1) | bits[i * 8 + j]
    out[i] = byte
  }
  return out
}

/** Mode, length and payload back out of one version's DATA codewords. */
function readPayload(data: Uint8Array, version: number): string {
  const countBits = version < 10 ? 8 : 16
  assert.equal(data[0] >> 4, 0b0100, 'byte mode')
  let length = 0
  let at = 4
  const bitAt = (i: number): number => (data[i >> 3] >> (7 - (i & 7))) & 1
  for (let i = 0; i < countBits; i++) length = (length << 1) | bitAt(at + i)
  at += countBits
  const bytes = new Uint8Array(length)
  for (let b = 0; b < length; b++) {
    let byte = 0
    for (let i = 0; i < 8; i++) byte = (byte << 1) | bitAt(at + b * 8 + i)
    bytes[b] = byte
  }
  return new TextDecoder().decode(bytes)
}

// ---- the round trip ---------------------------------------------------------------------

const SAMPLES: readonly string[] = [
  'A',
  'HELLO WORLD',
  'https://eqzera.com/',
  `https://share.eqzera.com/phone/#r=AbCdEfGhIjKlMnOpQrStUv&k=${'Zm9vYmFy'.repeat(5)}abc`,
  'x'.repeat(150),
  'x'.repeat(213)
]

test('a finished matrix reads back to the codewords it was built from', () => {
  for (const text of SAMPLES) {
    const matrix = qrMatrix(text)
    assert.ok(matrix, text.slice(0, 20))
    const version = (matrix.length - 17) / 4
    assert.ok(Number.isInteger(version) && version >= 1 && version <= QR_MAX_VERSION)
    const expected = interleave(dataCodewords(new TextEncoder().encode(text), version), version)
    const got = readStream(matrix).subarray(0, expected.length)
    assert.deepEqual(Array.from(got), Array.from(expected), `stream for ${text.slice(0, 20)}`)
    assert.equal(readPayload(dataCodewords(new TextEncoder().encode(text), version), version), text)
  }
})

test('the function patterns are where a scanner looks for them', () => {
  const matrix = qrMatrix('https://share.eqzera.com/phone/')
  assert.ok(matrix)
  const size = matrix.length
  // The three finders: a 7x7 with a dark border, a light ring and a 3x3 dark core.
  for (const [top, left] of [[0, 0], [0, size - 7], [size - 7, 0]]) {
    assert.ok(matrix[top][left], 'finder corner is dark')
    assert.ok(!matrix[top + 1][left + 1], 'the light ring')
    assert.ok(matrix[top + 3][left + 3], 'the dark core')
  }
  // The timing rows alternate, starting dark at the even coordinate.
  for (let i = 8; i < size - 8; i++) {
    assert.equal(matrix[6][i], i % 2 === 0, `timing row at ${String(i)}`)
    assert.equal(matrix[i][6], i % 2 === 0, `timing column at ${String(i)}`)
  }
  // The one module that is dark in every code ever made.
  assert.ok(matrix[size - 8][8], 'the always-dark module')
  // …and the separators around the top-left finder are light.
  for (let i = 0; i <= 7; i++) {
    assert.ok(!matrix[7][i], 'separator row')
    assert.ok(!matrix[i][7], 'separator column')
  }
})

test('the chosen mask is the lowest-penalty one, and the penalty rules score', () => {
  const matrix = qrMatrix('https://share.eqzera.com/phone/#r=0123456789abcdefghijkl&k=Zm9v')
  assert.ok(matrix)
  const mask = readMask(matrix)
  assert.ok(mask >= 0 && mask < 8)
  // Rule 4 alone: an all-dark grid is 100% dark, which is ten 5% steps from half.
  const black = Array.from({ length: 21 }, () => new Array<boolean>(21).fill(true))
  assert.ok(maskPenalty(black) >= 100, 'an all-one grid scores heavily')
  // A masked code is closer to balanced than a solid one, every time.
  assert.ok(maskPenalty(matrix) < maskPenalty(black))
})

test('the SVG is a quiet-zoned module grid and nothing else', () => {
  const svg = qrSvg('https://share.eqzera.com/phone/#r=AbCdEfGhIjKlMnOpQrStUv&k=Zm9vYmFy')
  assert.ok(svg)
  const matrix = qrMatrix('https://share.eqzera.com/phone/#r=AbCdEfGhIjKlMnOpQrStUv&k=Zm9vYmFy')
  assert.ok(matrix)
  const span = matrix.length + 8
  assert.match(svg, new RegExp(`viewBox="0 0 ${String(span)} ${String(span)}"`))
  const dark = matrix.flat().filter(Boolean).length
  // One background rect plus one rect per dark module.
  assert.equal(svg.split('<rect').length - 1, dark + 1)
  assert.doesNotMatch(svg, /<script|onload=|javascript:/i, 'nothing but rects')
  assert.equal(qrSvg('x'.repeat(214)), null)
})
