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
});
