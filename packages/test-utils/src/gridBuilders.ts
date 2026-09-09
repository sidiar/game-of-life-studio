// Dense at-rest grid builders (RFC-006 Decision 2 / RFC-001) — the shape BattleSchema.gridState
// validates: `number[][]`, `0` = empty, `v` = `index + 1` into a battle's `organismIds`. NOT the
// typed-array `Grid` (Uint8Array/Uint16Array double buffering) — that landed in Story 3.3 and is
// owned by `@gol/simulation` — feed these builders to its `gridFromDense` rather than hand-rolling
// a typed fixture. NOT sparse `cells` conversion — that is the Story 5.3 serializer.
//
// Every builder here validates its inputs eagerly and throws. The shared reason (review 2026-08-05):
// a malformed grid does not fail where it was built, it fails at `BattleSchema.parse()` hundreds of
// lines later with a message about `gridSize` or a superRefine, pointing at the battle rather than
// at the call that mis-sized it. These are test fixtures — an exception naming the bad argument is
// the whole value on offer.

// BattleSchema.gridState is `z.number().int().min(0).max(255)` — 255 is the dense-encoding ceiling
// (Decision G.3: 255 organisms per battle), and `0` is the reserved empty-cell value.
const MAX_CELL_VALUE = 255;

function assertGridDimension(name: string, value: number): void {
  // `Array.from({ length: -5 })` yields `[]` and `{ length: 2.5 }` yields 2 entries, so an invalid
  // dimension produces a plausible-looking grid of the wrong size instead of an error.
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${name} must be a non-negative integer, got ${value}`);
  }
}

/**
 * All-zero grid of the given size. `cols`/`rows` are parameters, never constants (Decision A) —
 * a hardcoded 100/60 here would silently defeat every caller that passes a different preset.
 *
 * `Array.from({ length: rows }, () => …)` — NOT `Array(rows).fill([])`, which hands every row the
 * SAME array reference, so writing one cell would write the whole column.
 */
export function emptyGrid(cols: number, rows: number): number[][] {
  assertGridDimension('emptyGrid: cols', cols);
  assertGridDimension('emptyGrid: rows', rows);
  return Array.from({ length: rows }, () => Array.from({ length: cols }, () => 0));
}

/**
 * ASCII-art grid builder. Each string in `rows` is one grid row; each character is looked up in
 * `legend` to get its cell value (typically `'.'` -> 0 for empty, other chars -> an organism's
 * roster index + 1). Throws eagerly on a ragged input, an unmapped character, or a legend value
 * that is not a legal cell code.
 */
export function gridFromPattern(
  rows: readonly string[],
  legend: Record<string, number>,
): number[][] {
  if (rows.length === 0) return [];

  // Split to CODE POINTS up front and measure those, never `row.length` (review 2026-08-05).
  // `Array.from(str)` iterates code points while `.length` counts UTF-16 units, so an astral
  // character made the two disagree: `['A😀', 'AAA']` passed a `.length`-based ragged check (both
  // 3) and then produced rows of 2 and 3 cells — ragged output from the function whose stated job
  // is rejecting ragged input.
  const cellChars = rows.map((row) => Array.from(row));
  const width = cellChars[0].length;

  return cellChars.map((chars, rowIndex) => {
    if (chars.length !== width) {
      throw new Error(
        `gridFromPattern: row ${rowIndex} has ${chars.length} cells, expected ${width} (ragged input)`,
      );
    }
    return chars.map((char, colIndex) => {
      const value = legend[char];
      if (value === undefined) {
        throw new Error(
          `gridFromPattern: unmapped character "${char}" at row ${rowIndex}, col ${colIndex}`,
        );
      }
      if (!Number.isInteger(value) || value < 0 || value > MAX_CELL_VALUE) {
        throw new Error(
          `gridFromPattern: legend maps "${char}" to ${value}, which is not a cell value ` +
            `(integer 0-${MAX_CELL_VALUE})`,
        );
      }
      return value;
    });
  });
}

function assertRectangular(label: string, grid: readonly (readonly number[])[]): number {
  const width = grid.length > 0 ? grid[0].length : 0;
  // Width is read from row 0, so a ragged input silently mis-drives the loop below: a shorter row
  // hands back `undefined` (written straight into a `number[][]`), a longer one is clipped and
  // never seen by the bounds check.
  const raggedAt = grid.findIndex((row) => row.length !== width);
  if (raggedAt !== -1) {
    throw new Error(
      `placePattern: ${label} is ragged — row ${raggedAt} has length ${grid[raggedAt].length}, expected ${width}`,
    );
  }
  return width;
}

/**
 * Stamps `pattern` into a copy of `grid` at offset `(atCol, atRow)`, returning a NEW grid — pure,
 * never mutates its input (every builder in this file must return a fresh array; a shared row
 * reference between the input and the return value would let a caller mutate the input through the
 * return value or vice versa). Throws if either grid is ragged, if the offset is not a pair of
 * integers, or if the pattern would spill outside `grid`'s bounds rather than silently clipping it
 * — a silently-clipped pattern is a battle that parses but does not look like what the caller
 * asked for.
 */
export function placePattern(
  grid: readonly (readonly number[])[],
  pattern: readonly (readonly number[])[],
  atCol: number,
  atRow: number,
): number[][] {
  const rows = grid.length;
  const cols = assertRectangular('grid', grid);
  const patternRows = pattern.length;
  const patternCols = assertRectangular('pattern', pattern);

  // Integers, checked before the bounds test below. A fractional offset passes every `<`/`>`
  // comparison and then writes to property "0.5", which is not an array index and vanishes on the
  // next JSON.stringify; NaN makes every comparison false, so the bounds check waves it through
  // and the write fails later with an opaque TypeError instead of the message below.
  if (!Number.isInteger(atCol) || !Number.isInteger(atRow)) {
    throw new Error(`placePattern: offset (${atCol}, ${atRow}) must be a pair of integers`);
  }

  if (atRow < 0 || atCol < 0 || atRow + patternRows > rows || atCol + patternCols > cols) {
    throw new Error(
      `placePattern: pattern of size ${patternCols}x${patternRows} at (${atCol}, ${atRow}) ` +
        `spills outside the ${cols}x${rows} grid`,
    );
  }

  const result = grid.map((row) => [...row]);
  for (let r = 0; r < patternRows; r += 1) {
    for (let c = 0; c < patternCols; c += 1) {
      result[atRow + r][atCol + c] = pattern[r][c];
    }
  }
  return result;
}
