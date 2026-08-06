import { describe, expect, it } from 'vitest';
import { emptyGrid, gridFromPattern, placePattern } from './gridBuilders';

describe('emptyGrid', () => {
  it('produces a grid of the requested cols/rows, all zeros', () => {
    const grid = emptyGrid(4, 3);
    expect(grid).toHaveLength(3);
    for (const row of grid) {
      expect(row).toHaveLength(4);
      expect(row.every((cell) => cell === 0)).toBe(true);
    }
  });

  it('gives every row an independent array — mutating one leaves the others alone', () => {
    const grid = emptyGrid(3, 3);
    grid[0][0] = 9;
    expect(grid[1][0]).toBe(0);
    expect(grid[2][0]).toBe(0);
  });

  // Array.from({ length: -5 }) is [] and { length: 2.5 } yields 2 entries, so an invalid dimension
  // silently produced a wrong-size grid that failed much later at BattleSchema's gridSize refine.
  it('rejects dimensions that are not non-negative integers', () => {
    expect(() => emptyGrid(-5, 3)).toThrow(/non-negative integer/);
    expect(() => emptyGrid(3, -1)).toThrow(/non-negative integer/);
    expect(() => emptyGrid(2.5, 3)).toThrow(/non-negative integer/);
    expect(() => emptyGrid(Number.NaN, 3)).toThrow(/non-negative integer/);
  });

  it('accepts zero dimensions', () => {
    expect(emptyGrid(0, 0)).toEqual([]);
  });
});

describe('gridFromPattern', () => {
  const legend = { '.': 0, A: 1, B: 2 };

  it('maps each character through the legend', () => {
    const grid = gridFromPattern(['A.B', '.A.'], legend);
    expect(grid).toEqual([
      [1, 0, 2],
      [0, 1, 0],
    ]);
  });

  it('rejects ragged input (rows of unequal length)', () => {
    expect(() => gridFromPattern(['AA', 'A'], legend)).toThrow(/ragged/i);
  });

  it('rejects an unmapped character', () => {
    expect(() => gridFromPattern(['A.', 'Z.'], legend)).toThrow(/unmapped/i);
  });

  it('returns an empty grid for empty input', () => {
    expect(gridFromPattern([], legend)).toEqual([]);
  });

  // `.length` counts UTF-16 units while the cells are built from code points, so an astral
  // character made both rows read as width 3 and then produced rows of 2 and 3 cells.
  it('measures width in code points, so an astral character cannot smuggle a ragged row through', () => {
    expect(() => gridFromPattern(['A🙂', 'AAA'], { ...legend, '🙂': 2 })).toThrow(/ragged/i);
  });

  it('maps an astral character like any other when the rows genuinely line up', () => {
    expect(gridFromPattern(['A🙂', '.A'], { ...legend, '🙂': 2 })).toEqual([
      [1, 2],
      [0, 1],
    ]);
  });

  it('rejects a legend value that is not a legal cell code', () => {
    expect(() => gridFromPattern(['A'], { A: -1 })).toThrow(/not a cell value/);
    expect(() => gridFromPattern(['A'], { A: 1.5 })).toThrow(/not a cell value/);
    expect(() => gridFromPattern(['A'], { A: 256 })).toThrow(/not a cell value/);
  });
});

describe('placePattern', () => {
  it('stamps a pattern into a copy at the given offset, returning a new grid', () => {
    const base = emptyGrid(4, 4);
    const pattern = [
      [1, 1],
      [1, 1],
    ];
    const result = placePattern(base, pattern, 1, 1);

    expect(result).toEqual([
      [0, 0, 0, 0],
      [0, 1, 1, 0],
      [0, 1, 1, 0],
      [0, 0, 0, 0],
    ]);
  });

  it('does not mutate its input grid', () => {
    const base = emptyGrid(3, 3);
    const pattern = [[1]];
    placePattern(base, pattern, 0, 0);
    expect(base).toEqual(emptyGrid(3, 3));
  });

  it('throws when the pattern would spill past the right/bottom edge', () => {
    const base = emptyGrid(2, 2);
    const pattern = [
      [1, 1],
      [1, 1],
    ];
    expect(() => placePattern(base, pattern, 1, 0)).toThrow(/spills outside/);
    expect(() => placePattern(base, pattern, 0, 1)).toThrow(/spills outside/);
  });

  it('throws when the offset is negative', () => {
    const base = emptyGrid(3, 3);
    expect(() => placePattern(base, [[1]], -1, 0)).toThrow(/spills outside/);
    expect(() => placePattern(base, [[1]], 0, -1)).toThrow(/spills outside/);
  });

  // Pattern width came from row 0 alone: a shorter later row wrote `undefined` straight into a
  // number[][], and a longer one was clipped without the bounds check ever seeing it.
  it('rejects a ragged pattern rather than writing undefined into the grid', () => {
    const base = emptyGrid(4, 4);
    expect(() => placePattern(base, [[1, 1], [1]], 0, 0)).toThrow(/pattern is ragged/);
    expect(() => placePattern(base, [[1], [1, 1]], 0, 0)).toThrow(/pattern is ragged/);
  });

  it('rejects a ragged base grid', () => {
    expect(() => placePattern([[0, 0], [0]], [[1]], 0, 0)).toThrow(/grid is ragged/);
  });

  // A fractional offset passed every bounds comparison and then wrote to property "0.5", which is
  // not an array index and disappears on the next JSON.stringify; NaN made every comparison false.
  it('rejects a non-integer or NaN offset', () => {
    const base = emptyGrid(3, 3);
    expect(() => placePattern(base, [[1]], 0.5, 0)).toThrow(/pair of integers/);
    expect(() => placePattern(base, [[1]], 0, Number.NaN)).toThrow(/pair of integers/);
  });
});
