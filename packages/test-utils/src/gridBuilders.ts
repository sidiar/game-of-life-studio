// Dense at-rest grid builders (RFC-006 Decision 2 / RFC-001) — the shape BattleSchema.gridState
// validates: `number[][]`, `0` = empty, `v` = `index + 1` into a battle's `organismIds`. NOT the
// typed-array `Grid` (Uint8Array/Uint16Array double buffering) — that lands in Story 3.3 once its
// shape is frozen. NOT sparse `cells` conversion — that is the Story 5.3 serializer.

/**
 * All-zero grid of the given size. `cols`/`rows` are parameters, never constants (Decision A) —
 * a hardcoded 100/60 here would silently defeat every caller that passes a different preset.
 *
 * `Array.from({ length: rows }, () => …)` — NOT `Array(rows).fill([])`, which hands every row the
 * SAME array reference, so writing one cell would write the whole column.
 */
export function emptyGrid(cols: number, rows: number): number[][] {
  return Array.from({ length: rows }, () => Array.from({ length: cols }, () => 0));
}

/**
 * ASCII-art grid builder. Each string in `rows` is one grid row; each character is looked up in
 * `legend` to get its cell value (typically `'.'` -> 0 for empty, other chars -> an organism's
 * roster index + 1). Throws eagerly on a ragged input or an unmapped character — deferring either
 * failure produces a `BattleSchema` superRefine failure hundreds of lines away from its cause.
 */
export function gridFromPattern(
  rows: readonly string[],
  legend: Record<string, number>,
): number[][] {
  if (rows.length === 0) return [];
  const width = rows[0].length;
  return rows.map((row, rowIndex) => {
    if (row.length !== width) {
      throw new Error(
        `gridFromPattern: row ${rowIndex} has length ${row.length}, expected ${width} (ragged input)`,
      );
    }
    return Array.from(row, (char, colIndex) => {
      const value = legend[char];
      if (value === undefined) {
        throw new Error(
          `gridFromPattern: unmapped character "${char}" at row ${rowIndex}, col ${colIndex}`,
        );
      }
      return value;
    });
  });
}

/**
 * Stamps `pattern` into a copy of `grid` at offset `(atCol, atRow)`, returning a NEW grid — pure,
 * never mutates its input (every builder in this file must return a fresh array; a shared row
 * reference between the input and the return value would let a caller mutate the input through the
 * return value or vice versa). Throws if the pattern would spill outside `grid`'s bounds, rather
 * than silently clipping it — a silently-clipped pattern is a battle that parses but does not look
 * like what the caller asked for.
 */
export function placePattern(
  grid: readonly (readonly number[])[],
  pattern: readonly (readonly number[])[],
  atCol: number,
  atRow: number,
): number[][] {
  const rows = grid.length;
  const cols = rows > 0 ? grid[0].length : 0;
  const patternRows = pattern.length;
  const patternCols = patternRows > 0 ? pattern[0].length : 0;

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
