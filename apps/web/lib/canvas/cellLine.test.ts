import { describe, expect, it } from 'vitest';
import { cellsBetween } from './cellLine';

/** Chebyshev distance — the number of cells a Bresenham line visits AFTER its start. */
function chebyshev(a: { col: number; row: number }, b: { col: number; row: number }): number {
  return Math.max(Math.abs(b.col - a.col), Math.abs(b.row - a.row));
}

describe('cellsBetween', () => {
  it('returns an empty array for the same cell, not [to] (Task 1)', () => {
    expect(cellsBetween({ col: 5, row: 5 }, { col: 5, row: 5 })).toEqual([]);
  });

  it('adjacent horizontal (a single-cell step)', () => {
    expect(cellsBetween({ col: 2, row: 2 }, { col: 3, row: 2 })).toEqual([{ col: 3, row: 2 }]);
  });

  it('adjacent vertical', () => {
    expect(cellsBetween({ col: 2, row: 2 }, { col: 2, row: 3 })).toEqual([{ col: 2, row: 3 }]);
  });

  it('adjacent diagonal', () => {
    expect(cellsBetween({ col: 2, row: 2 }, { col: 3, row: 3 })).toEqual([{ col: 3, row: 3 }]);
  });

  it('a shallow slope (x dominates)', () => {
    const from = { col: 0, row: 0 };
    const to = { col: 4, row: 1 };
    const result = cellsBetween(from, to);
    // The exact intermediate path is an implementation detail of Bresenham's stepping order;
    // what AC4 actually requires is a gap-free, non-repeating walk from `from` to `to`.
    expect(result.length).toBe(chebyshev(from, to));
    expect(result.at(-1)).toEqual(to);
    expect(chebyshev(from, result[0])).toBe(1);
    for (let i = 1; i < result.length; i++) {
      expect(chebyshev(result[i - 1], result[i])).toBe(1); // no gaps between consecutive cells
    }
  });

  it('a steep slope (y dominates — the axis-swap branch)', () => {
    const result = cellsBetween({ col: 0, row: 0 }, { col: 1, row: 4 });
    expect(result).toEqual([
      { col: 0, row: 1 },
      { col: 1, row: 2 },
      { col: 1, row: 3 },
      { col: 1, row: 4 },
    ]);
  });

  it('all four sign combinations', () => {
    const from = { col: 5, row: 5 };
    const cases: Array<{ to: { col: number; row: number }; label: string }> = [
      { to: { col: 8, row: 8 }, label: '+x +y' },
      { to: { col: 8, row: 2 }, label: '+x -y' },
      { to: { col: 2, row: 8 }, label: '-x +y' },
      { to: { col: 2, row: 2 }, label: '-x -y' },
    ];

    for (const { to } of cases) {
      const result = cellsBetween(from, to);
      expect(result.length).toBe(chebyshev(from, to));
      expect(result.at(-1)).toEqual(to);
      // First element is adjacent (Chebyshev distance 1) to `from`.
      expect(chebyshev(from, result[0])).toBe(1);
    }
  });

  it('a long jump across the whole grid', () => {
    const from = { col: 0, row: 0 };
    const to = { col: 99, row: 59 };
    const result = cellsBetween(from, to);

    expect(result.length).toBe(chebyshev(from, to));
    expect(chebyshev(from, result[0])).toBe(1);
    expect(result.at(-1)).toEqual(to);
  });

  it('never repeats a cell', () => {
    const from = { col: 0, row: 0 };
    const targets = [
      { col: 99, row: 59 },
      { col: 0, row: 59 },
      { col: 99, row: 0 },
      { col: 30, row: 7 },
    ];
    for (const to of targets) {
      const result = cellsBetween(from, to);
      const seen = new Set(result.map((c) => `${c.col},${c.row}`));
      expect(seen.size).toBe(result.length);
    }
  });
});
