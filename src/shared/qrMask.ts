// ============================================================================
// qrMask.ts — the eight data masks, the four penalty rules, and the choice between them.
// ============================================================================
//
// Beside `qr.ts` rather than inside it for the repo's 400-code-line ceiling, and because these are
// the one part of QR generation that is a JUDGEMENT rather than arithmetic: the mask is picked by
// scoring all eight finished grids against four published penalty rules and taking the lowest.
//
// A FIXED MASK IS THE SHORTCUT THAT DOES NOT SCAN. Mask 0 on a mostly-ASCII URL produces long
// same-colour runs and 2x2 blocks in exactly the places rules 1 and 2 exist to punish, and some
// phone cameras will simply never lock onto the result. Thirty lines of scoring is the price of
// a code that works on a stranger's phone in a dim room, which is the only test that counts.
//
// PURE, and node-tested through `qr.ts`'s round trip (tests/qr.test.mts).

/** Does mask `m` invert the module at (row, col)? The eight published conditions, verbatim. */
export function maskBit(m: number, row: number, col: number): boolean {
  if (m === 0) return (row + col) % 2 === 0
  if (m === 1) return row % 2 === 0
  if (m === 2) return col % 3 === 0
  if (m === 3) return (row + col) % 3 === 0
  if (m === 4) return (Math.floor(row / 2) + Math.floor(col / 3)) % 2 === 0
  if (m === 5) return ((row * col) % 2) + ((row * col) % 3) === 0
  if (m === 6) return (((row * col) % 2) + ((row * col) % 3)) % 2 === 0
  return (((row + col) % 2) + ((row * col) % 3)) % 2 === 0
}

/** Rule 1, one line: five in a row scores 3, and every module past the fifth scores one more. */
function runPenalty(line: readonly boolean[]): number {
  let score = 0
  let run = 1
  for (let i = 1; i < line.length; i++) {
    if (line[i] === line[i - 1]) {
      run += 1
      if (run === 5) score += 3
      else if (run > 5) score += 1
    } else {
      run = 1
    }
  }
  return score
}

/** The 1:1:3:1:1 finder-lookalike, with four light modules on one side. 40 points each. */
const FINDER_RUN: readonly boolean[] = [true, false, true, true, true, false, true]
const QUIET: readonly boolean[] = [false, false, false, false]

function matchesAt(line: readonly boolean[], at: number, pattern: readonly boolean[]): boolean {
  if (at < 0 || at + pattern.length > line.length) return false
  for (let i = 0; i < pattern.length; i++) {
    if (line[at + i] !== pattern[i]) return false
  }
  return true
}

/** Rule 3, one line: the finder run with quiet space before it, after it, or both. */
function finderPenalty(line: readonly boolean[]): number {
  let score = 0
  for (let i = 0; i + FINDER_RUN.length <= line.length; i++) {
    if (!matchesAt(line, i, FINDER_RUN)) continue
    const before = matchesAt(line, i - QUIET.length, QUIET)
    const after = matchesAt(line, i + FINDER_RUN.length, QUIET)
    if (before || after) score += 40
  }
  return score
}

/** Rule 2: every 2x2 block of one colour is worth 3, overlapping blocks counted separately. */
function blockPenalty(rows: readonly (readonly boolean[])[]): number {
  let score = 0
  for (let r = 0; r + 1 < rows.length; r++) {
    for (let c = 0; c + 1 < rows.length; c++) {
      const a = rows[r][c]
      if (a === rows[r][c + 1] && a === rows[r + 1][c] && a === rows[r + 1][c + 1]) score += 3
    }
  }
  return score
}

/** Rule 4: how far the dark proportion sits from half, in whole 5% steps, times 10. */
function balancePenalty(rows: readonly (readonly boolean[])[]): number {
  let dark = 0
  for (const row of rows) {
    for (const cell of row) {
      if (cell) dark += 1
    }
  }
  const pct = (dark * 100) / (rows.length * rows.length)
  return Math.floor(Math.abs(pct - 50) / 5) * 10
}

/** The column at `c`, as a line — rules 1 and 3 read both directions. */
function column(rows: readonly (readonly boolean[])[], c: number): boolean[] {
  return rows.map((row) => row[c])
}

/** The four rules over one finished grid. Lower is better; the caller takes the minimum. */
export function maskPenalty(rows: readonly (readonly boolean[])[]): number {
  let score = blockPenalty(rows) + balancePenalty(rows)
  for (let i = 0; i < rows.length; i++) {
    const col = column(rows, i)
    score += runPenalty(rows[i]) + runPenalty(col) + finderPenalty(rows[i]) + finderPenalty(col)
  }
  return score
}

/**
 * The lowest-penalty mask of the eight.
 *
 * `build(m)` hands back the WHOLE finished grid for that mask — masked, with its format and version
 * strings stamped — because the penalty rules score the code a camera sees, and the format strings
 * run right through the finder corners where rules 1 and 3 do their work. Scoring the unstamped
 * grid would be scoring a picture nobody is shown.
 */
export function bestMask(build: (mask: number) => boolean[][]): number {
  let best = 0
  let bestScore = Number.POSITIVE_INFINITY
  for (let m = 0; m < 8; m++) {
    const score = maskPenalty(build(m))
    if (score < bestScore) {
      bestScore = score
      best = m
    }
  }
  return best
}
