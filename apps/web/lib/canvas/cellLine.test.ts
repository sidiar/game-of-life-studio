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

  // review (2026-08-27): the module's doc comment declares this invariant LOAD-BEARING — it is
  // the whole reason `markDirty`'s `DirtyCellRangeError` is unreachable from inside a pointer
  // handler, because `pointerToCell` only vouches for the two ENDPOINTS. Nothing asserted it, so
  // a stepping change that walked one cell outside the box would have shipped green and thrown
  // out of an event handler at some grid edge instead. Swept rather than sampled: every integer
  // endpoint pair in a 13x13 neighbourhood, both directions.
  it('never returns a cell outside the endpoints’ bounding box (the markDirty safety claim)', () => {
    // Violations are COLLECTED and asserted once rather than `expect`-ed per cell: the sweep is
    // ~28k endpoint pairs, and an expect() per coordinate runs for minutes under v8 coverage
    // instrumentation (it timed out the 5s default during this review). One assertion also names
    // the offending pair instead of just a number.
    const escapes: string[] = [];
    for (let x0 = 0; x0 < 13; x0++) {
      for (let y0 = 0; y0 < 13; y0++) {
        for (let x1 = 0; x1 < 13; x1++) {
          for (let y1 = 0; y1 < 13; y1++) {
            for (const { col, row } of cellsBetween({ col: x0, row: y0 }, { col: x1, row: y1 })) {
              if (
                col < Math.min(x0, x1) ||
                col > Math.max(x0, x1) ||
                row < Math.min(y0, y1) ||
                row > Math.max(y0, y1)
              ) {
                escapes.push(`(${x0},${y0})->(${x1},${y1}) escaped at (${col},${row})`);
              }
            }
          }
        }
      }
    }
    expect(escapes).toEqual([]);
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
