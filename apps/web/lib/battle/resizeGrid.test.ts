import { resizeGrid } from '@gol/simulation';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { RenderableGrid } from '@/lib/canvas/renderableGrid';
import { countClippedLivingCells, willClipLivingCells } from './resizeGrid';

// `resizeGrid`'s own suite moved to packages/simulation/src/grid/resizeGrid.test.ts with the
// function (Story 3.3, FD2). It is imported here only for the cross-check that the clip COUNT and
// the resize agree about which cells survive — the one property neither module can state alone.
//
// Grid dimensions are parameters, never constants (project-context) — the small grids here are
// deliberately neither of the two editable presets, so nothing in this module can quietly grow a
// dependency on 50 x 30 / 100 x 60.
function makeGrid(width: number, height: number, occupant: readonly number[]): RenderableGrid {
  return {
    width,
    height,
    occupant: Uint8Array.from(occupant),
    age: new Uint16Array(occupant.length),
  };
}

describe('countClippedLivingCells / willClipLivingCells', () => {
  it('is false for any grow (growing never warns)', () => {
    const grid = makeGrid(2, 2, [1, 2, 3, 4]);

    expect(countClippedLivingCells(grid, { cols: 4, rows: 4 })).toBe(0);
    expect(willClipLivingCells(grid, { cols: 4, rows: 4 })).toBe(false);
  });

  it('is false for a shrink over an EMPTY region (trap 6 — living cells, not cells)', () => {
    // Only the top-left 2 x 2 is occupied; the discarded band is all zeroes.
    const grid = makeGrid(4, 4, [1, 1, 0, 0, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);

    expect(countClippedLivingCells(grid, { cols: 2, rows: 2 })).toBe(0);
    expect(willClipLivingCells(grid, { cols: 2, rows: 2 })).toBe(false);
  });

  it('is true for a single living cell just past the new right edge (col === newCols)', () => {
    const grid = makeGrid(3, 1, [0, 0, 5]);

    expect(countClippedLivingCells(grid, { cols: 2, rows: 1 })).toBe(1);
    expect(willClipLivingCells(grid, { cols: 2, rows: 1 })).toBe(true);
    // ...and false one column wider, which is the off-by-one this pair pins.
    expect(willClipLivingCells(grid, { cols: 3, rows: 1 })).toBe(false);
  });

  it('is true for a single living cell just past the new bottom edge (row === newRows)', () => {
    const grid = makeGrid(1, 3, [0, 0, 5]);

    expect(countClippedLivingCells(grid, { cols: 1, rows: 2 })).toBe(1);
    expect(willClipLivingCells(grid, { cols: 1, rows: 3 })).toBe(false);
  });

  it('counts each discarded living cell exactly once where the two bands overlap', () => {
    // 3 x 3 all living, shrinking to 2 x 2: five cells fall outside, and the corner (2,2) is in
    // both the right band and the bottom band — double-counting it would report 6.
    const grid = makeGrid(3, 3, new Array(9).fill(1));

    expect(countClippedLivingCells(grid, { cols: 2, rows: 2 })).toBe(5);
  });

  it('ignores empty cells inside the discarded region while counting the living ones', () => {
    const grid = makeGrid(3, 3, [1, 1, 1, 1, 1, 0, 1, 0, 2]);

    // Discarded: (2,0)=1, (2,1)=0, (0,2)=1, (1,2)=0, (2,2)=2 -> three living.
    expect(countClippedLivingCells(grid, { cols: 2, rows: 2 })).toBe(3);
  });

  it('agrees with the resize: the survivors plus the clipped count are the original population', () => {
    const grid = makeGrid(4, 4, [1, 0, 2, 3, 0, 4, 0, 5, 6, 0, 7, 0, 0, 8, 0, 9]);
    const size = { cols: 3, rows: 2 };

    const living = Array.from(grid.occupant).filter((cell) => cell !== 0).length;
    const survivors = Array.from(resizeGrid(grid, size.cols, size.rows).occupant).filter(
      (cell) => cell !== 0,
    ).length;

    expect(survivors + countClippedLivingCells(grid, size)).toBe(living);
  });
});

describe('clip-predicate properties (fast-check)', () => {
  const arbGrid = fc
    .tuple(fc.integer({ min: 1, max: 12 }), fc.integer({ min: 1, max: 12 }))
    .chain(([width, height]) =>
      fc
        .array(fc.integer({ min: 0, max: 255 }), {
          minLength: width * height,
          maxLength: width * height,
        })
        .map((occupant) => makeGrid(width, height, occupant)),
    );
  const arbSize = fc.record({
    cols: fc.integer({ min: 1, max: 12 }),
    rows: fc.integer({ min: 1, max: 12 }),
  });

  it('a grow never clips, and a clip count is never more than the living population', () => {
    fc.assert(
      fc.property(arbGrid, arbSize, (grid, size) => {
        const living = Array.from(grid.occupant).filter((cell) => cell !== 0).length;
        const clipped = countClippedLivingCells(grid, size);
        expect(clipped).toBeLessThanOrEqual(living);
        if (size.cols >= grid.width && size.rows >= grid.height) expect(clipped).toBe(0);
      }),
    );
  });

  it('survivors plus clipped is always the original living population', () => {
    fc.assert(
      fc.property(arbGrid, arbSize, (grid, size) => {
        const living = Array.from(grid.occupant).filter((cell) => cell !== 0).length;
        const survivors = Array.from(resizeGrid(grid, size.cols, size.rows).occupant).filter(
          (cell) => cell !== 0,
        ).length;

        expect(survivors + countClippedLivingCells(grid, size)).toBe(living);
      }),
    );
  });
});
