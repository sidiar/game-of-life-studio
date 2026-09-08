import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { RenderableGrid } from '@/lib/canvas/renderableGrid';
import { countClippedLivingCells, resizeGrid, willClipLivingCells } from './resizeGrid';

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

/** `occupant` read back as rows, so a failure prints the grid rather than a flat index. */
function rows(grid: RenderableGrid): number[][] {
  return Array.from({ length: grid.height }, (_, row) =>
    Array.from({ length: grid.width }, (_, col) => grid.occupant[row * grid.width + col]),
  );
}

describe('resizeGrid', () => {
  it('anchors top-left when growing, filling the new right and bottom with empty cells', () => {
    const grid = makeGrid(3, 2, [1, 2, 3, 4, 5, 6]);

    const grown = resizeGrid(grid, { cols: 5, rows: 4 });

    expect(grown.width).toBe(5);
    expect(grown.height).toBe(4);
    expect(rows(grown)).toEqual([
      [1, 2, 3, 0, 0],
      [4, 5, 6, 0, 0],
      [0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0],
    ]);
  });

  it('anchors top-left when shrinking, discarding everything outside the new bounds', () => {
    const grid = makeGrid(4, 3, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);

    const shrunk = resizeGrid(grid, { cols: 2, rows: 2 });

    expect(rows(shrunk)).toEqual([
      [1, 2],
      [5, 6],
    ]);
  });

  it('grows one axis while shrinking the other, anchoring both at the top-left', () => {
    const grid = makeGrid(3, 3, [1, 2, 3, 4, 5, 6, 7, 8, 9]);

    expect(rows(resizeGrid(grid, { cols: 5, rows: 2 }))).toEqual([
      [1, 2, 3, 0, 0],
      [4, 5, 6, 0, 0],
    ]);
  });

  it('leaves the input grid byte-identical — both buffers on the result are new', () => {
    const grid = makeGrid(2, 2, [1, 2, 3, 4]);
    const before = Uint8Array.from(grid.occupant);

    const resized = resizeGrid(grid, { cols: 3, rows: 3 });
    resized.occupant[0] = 200;
    resized.age[0] = 7;

    expect(grid.occupant).toEqual(before);
    expect(grid.occupant).not.toBe(resized.occupant);
    expect(grid.age).not.toBe(resized.age);
    // The wrapper too — `<BattleEditorView>`'s stats memo keys on grid IDENTITY
    // (deferred-work.md, the entry this closes), so a resize that reused it would freeze the
    // sidebar's numbers at their pre-resize values with no error and no failing test.
    expect(resized).not.toBe(grid);
  });

  it('reallocates `age` zero-filled at the new length (trap 3)', () => {
    const grid: RenderableGrid = {
      width: 2,
      height: 2,
      occupant: Uint8Array.from([1, 1, 1, 1]),
      age: Uint16Array.from([9, 9, 9, 9]),
    };

    const resized = resizeGrid(grid, { cols: 3, rows: 2 });

    expect(resized.age.length).toBe(6);
    expect(Array.from(resized.age)).toEqual([0, 0, 0, 0, 0, 0]);
  });

  it('allocates `occupant` at exactly width * height (trap 4)', () => {
    const resized = resizeGrid(makeGrid(4, 4, new Array(16).fill(1)), { cols: 3, rows: 5 });

    expect(resized.occupant.length).toBe(15);
  });

  it('returns a NEW grid even when the size is unchanged (a total function of its inputs)', () => {
    const grid = makeGrid(2, 2, [1, 0, 0, 1]);

    const resized = resizeGrid(grid, { cols: 2, rows: 2 });

    expect(resized).not.toBe(grid);
    expect(resized.occupant).not.toBe(grid.occupant);
    expect(rows(resized)).toEqual(rows(grid));
  });

  it('resizes between the two editable presets (Decision A.2) in both directions', () => {
    const full = makeGrid(100, 60, new Array(6000).fill(1));

    const shrunk = resizeGrid(full, { cols: 50, rows: 30 });
    expect(shrunk.occupant.length).toBe(1500);
    expect(Array.from(shrunk.occupant).every((cell) => cell === 1)).toBe(true);

    const regrown = resizeGrid(shrunk, { cols: 100, rows: 60 });
    expect(regrown.occupant.length).toBe(6000);
    // Only the top-left 50 x 30 survives the round trip — the rest was genuinely discarded.
    expect(Array.from(regrown.occupant).filter((cell) => cell === 1).length).toBe(1500);
    expect(regrown.occupant[0]).toBe(1);
    expect(regrown.occupant[50]).toBe(0);
  });
});

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
    const survivors = Array.from(resizeGrid(grid, size).occupant).filter(
      (cell) => cell !== 0,
    ).length;

    expect(survivors + countClippedLivingCells(grid, size)).toBe(living);
  });
});

describe('resizeGrid properties (fast-check)', () => {
  // A grid of arbitrary occupancy at an arbitrary size, plus an arbitrary target size. Bounds are
  // small so a counterexample shrinks to something readable; the invariants are dimension-agnostic
  // by construction.
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

  it('preserves every cell in the intersection of the two rectangles (AR-17 anchoring)', () => {
    fc.assert(
      fc.property(arbGrid, arbSize, (grid, size) => {
        const resized = resizeGrid(grid, size);
        for (let row = 0; row < Math.min(grid.height, size.rows); row++) {
          for (let col = 0; col < Math.min(grid.width, size.cols); col++) {
            expect(resized.occupant[row * size.cols + col]).toBe(
              grid.occupant[row * grid.width + col],
            );
          }
        }
      }),
    );
  });

  it('fills everything outside the source rectangle with empty cells', () => {
    fc.assert(
      fc.property(arbGrid, arbSize, (grid, size) => {
        const resized = resizeGrid(grid, size);
        for (let row = 0; row < size.rows; row++) {
          for (let col = 0; col < size.cols; col++) {
            if (row < grid.height && col < grid.width) continue;
            expect(resized.occupant[row * size.cols + col]).toBe(0);
          }
        }
      }),
    );
  });

  it('always returns buffers of exactly cols * rows, with age zeroed', () => {
    fc.assert(
      fc.property(arbGrid, arbSize, (grid, size) => {
        const resized = resizeGrid(grid, size);
        expect(resized.occupant.length).toBe(size.cols * size.rows);
        expect(resized.age.length).toBe(size.cols * size.rows);
        expect(resized.age.some((age) => age !== 0)).toBe(false);
      }),
    );
  });

  it('resizing to the same size preserves content exactly', () => {
    fc.assert(
      fc.property(arbGrid, (grid) => {
        const resized = resizeGrid(grid, { cols: grid.width, rows: grid.height });
        expect(Array.from(resized.occupant)).toEqual(Array.from(grid.occupant));
      }),
    );
  });

  it('grow-then-shrink back is the identity when nothing clips', () => {
    fc.assert(
      fc.property(arbGrid, arbSize, (grid, size) => {
        // Only a genuine grow on BOTH axes round-trips: anything else discards cells on the way
        // out, which is the whole point of the anchor being hard-edged rather than wrapping.
        const grown = {
          cols: Math.max(size.cols, grid.width),
          rows: Math.max(size.rows, grid.height),
        };
        const back = resizeGrid(resizeGrid(grid, grown), { cols: grid.width, rows: grid.height });
        expect(Array.from(back.occupant)).toEqual(Array.from(grid.occupant));
      }),
    );
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
});
