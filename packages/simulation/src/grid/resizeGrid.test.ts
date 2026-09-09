import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { Grid } from './grid';
import { resizeGrid } from './resizeGrid';

// Grid dimensions are parameters, never constants (Decision A) — the small grids here are
// deliberately neither editable preset, so nothing in this module can grow a dependency on
// 50x30 / 100x60.
function makeGrid(
  width: number,
  height: number,
  occupant: readonly number[],
  age?: readonly number[],
): Grid {
  return {
    width,
    height,
    occupant: Uint8Array.from(occupant),
    age: age === undefined ? new Uint16Array(occupant.length) : Uint16Array.from(age),
  };
}

/** `occupant` read back as rows, so a failure prints the grid rather than a flat index. */
function rows(grid: Grid): number[][] {
  return Array.from({ length: grid.height }, (_, row) =>
    Array.from({ length: grid.width }, (_, col) => grid.occupant[row * grid.width + col]),
  );
}

function ageRows(grid: Grid): number[][] {
  return Array.from({ length: grid.height }, (_, row) =>
    Array.from({ length: grid.width }, (_, col) => grid.age[row * grid.width + col]),
  );
}

describe('resizeGrid', () => {
  it('anchors top-left when growing, filling the new right and bottom with empty cells', () => {
    const grown = resizeGrid(makeGrid(3, 2, [1, 2, 3, 4, 5, 6]), 5, 4);

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
    const shrunk = resizeGrid(makeGrid(4, 3, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]), 2, 2);

    expect(rows(shrunk)).toEqual([
      [1, 2],
      [5, 6],
    ]);
  });

  it('grows one axis while shrinking the other, anchoring both at the top-left', () => {
    expect(rows(resizeGrid(makeGrid(3, 3, [1, 2, 3, 4, 5, 6, 7, 8, 9]), 5, 2))).toEqual([
      [1, 2, 3, 0, 0],
      [4, 5, 6, 0, 0],
    ]);
  });

  it('leaves the input grid byte-identical — both buffers on the result are new', () => {
    const grid = makeGrid(2, 2, [1, 2, 3, 4]);
    const before = Uint8Array.from(grid.occupant);

    const resized = resizeGrid(grid, 3, 3);
    resized.occupant[0] = 200;
    resized.age[0] = 7;

    expect(grid.occupant).toEqual(before);
    expect(grid.occupant).not.toBe(resized.occupant);
    expect(grid.age).not.toBe(resized.age);
    // The wrapper too — `<BattleEditorView>`'s stats memo keys on grid IDENTITY, so a resize that
    // reused it would freeze the sidebar's numbers at their pre-resize values with nothing logged.
    expect(resized).not.toBe(grid);
  });

  /**
   * ⚠️ FD6. `age` is CARRIED ACROSS top-left anchored, exactly as `occupant` is — not zero-filled.
   * Epic 2's implementation zero-filled it on the premise that every EDITABLE grid is age-zero
   * everywhere (RFC-005 "Representation note"), which is true and makes the two behaviours
   * indistinguishable in Edit mode. Story 3.16 resizes a LIVE grid whose cells have real ages, and
   * `age` is a first-class rule input (FR-2.5) — zero-filling there silently resets every survivor
   * to age 0 mid-simulation and changes which rules fire.
   */
  it('carries `age` across top-left anchored, not zero-filled (FD6)', () => {
    const grid = makeGrid(2, 2, [1, 1, 1, 1], [5, 6, 7, 8]);

    const grown = resizeGrid(grid, 3, 3);

    expect(ageRows(grown)).toEqual([
      [5, 6, 0],
      [7, 8, 0],
      [0, 0, 0],
    ]);
  });

  it('clips `age` with `occupant` on a shrink, cell for cell', () => {
    const grid = makeGrid(3, 2, [1, 2, 3, 4, 5, 6], [10, 20, 30, 40, 50, 60]);

    const shrunk = resizeGrid(grid, 2, 1);

    expect(rows(shrunk)).toEqual([[1, 2]]);
    expect(ageRows(shrunk)).toEqual([[10, 20]]);
  });

  it('an age above the Uint8 ceiling survives the resize (Decision B.5 — age is Uint16)', () => {
    // A Uint8Array age buffer would wrap 300 to 44 here, silently, with every other test green.
    const resized = resizeGrid(makeGrid(1, 1, [1], [300]), 2, 2);

    expect(resized.age).toBeInstanceOf(Uint16Array);
    expect(resized.age[0]).toBe(300);
  });

  it('allocates both buffers at exactly cols * rows', () => {
    const resized = resizeGrid(makeGrid(4, 4, new Array(16).fill(1)), 3, 5);

    expect(resized.occupant.length).toBe(15);
    expect(resized.age.length).toBe(15);
  });

  it('returns a NEW grid even when the size is unchanged (a total function of its inputs)', () => {
    const grid = makeGrid(2, 2, [1, 0, 0, 1]);

    const resized = resizeGrid(grid, 2, 2);

    expect(resized).not.toBe(grid);
    expect(resized.occupant).not.toBe(grid.occupant);
    expect(rows(resized)).toEqual(rows(grid));
  });

  it('resizes between the two editable presets (Decision A.2) in both directions', () => {
    const full = makeGrid(100, 60, new Array(6000).fill(1));

    const shrunk = resizeGrid(full, 50, 30);
    expect(shrunk.occupant.length).toBe(1500);
    expect(Array.from(shrunk.occupant).every((cell) => cell === 1)).toBe(true);

    const regrown = resizeGrid(shrunk, 100, 60);
    expect(regrown.occupant.length).toBe(6000);
    // Only the top-left 50 x 30 survives the round trip — the rest was genuinely discarded.
    expect(Array.from(regrown.occupant).filter((cell) => cell === 1).length).toBe(1500);
    expect(regrown.occupant[0]).toBe(1);
    expect(regrown.occupant[50]).toBe(0);
  });

  it('scales to the Play-mode ephemeral ceiling (Decision A / H-9: 200x120)', () => {
    const resized = resizeGrid(makeGrid(100, 60, new Array(6000).fill(2)), 200, 120);

    expect(resized.occupant.length).toBe(24000);
    expect(resized.occupant[0]).toBe(2);
    expect(resized.occupant[100]).toBe(0);
  });

  it('throws on a dimension a typed array would silently coerce', () => {
    expect(() => resizeGrid(makeGrid(2, 2, [0, 0, 0, 0]), 2.5, 2)).toThrow(/width/);
    expect(() => resizeGrid(makeGrid(2, 2, [0, 0, 0, 0]), 2, -1)).toThrow(/height/);
  });
});

describe('resizeGrid properties (fast-check, AR-41)', () => {
  const arbGrid = fc
    .tuple(fc.integer({ min: 1, max: 12 }), fc.integer({ min: 1, max: 12 }))
    .chain(([width, height]) =>
      fc
        .tuple(
          fc.array(fc.integer({ min: 0, max: 255 }), {
            minLength: width * height,
            maxLength: width * height,
          }),
          fc.array(fc.integer({ min: 0, max: 65535 }), {
            minLength: width * height,
            maxLength: width * height,
          }),
        )
        .map(([occupant, age]) => makeGrid(width, height, occupant, age)),
    );
  const arbSize = fc.record({
    cols: fc.integer({ min: 1, max: 12 }),
    rows: fc.integer({ min: 1, max: 12 }),
  });

  it('preserves every cell in the intersection of the two rectangles (AR-17 anchoring)', () => {
    fc.assert(
      fc.property(arbGrid, arbSize, (grid, size) => {
        const resized = resizeGrid(grid, size.cols, size.rows);
        for (let row = 0; row < Math.min(grid.height, size.rows); row++) {
          for (let col = 0; col < Math.min(grid.width, size.cols); col++) {
            expect(resized.occupant[row * size.cols + col]).toBe(
              grid.occupant[row * grid.width + col],
            );
            expect(resized.age[row * size.cols + col]).toBe(grid.age[row * grid.width + col]);
          }
        }
      }),
    );
  });

  it('fills everything outside the source rectangle with empty, age-zero cells', () => {
    fc.assert(
      fc.property(arbGrid, arbSize, (grid, size) => {
        const resized = resizeGrid(grid, size.cols, size.rows);
        for (let row = 0; row < size.rows; row++) {
          for (let col = 0; col < size.cols; col++) {
            if (row < grid.height && col < grid.width) continue;
            expect(resized.occupant[row * size.cols + col]).toBe(0);
            expect(resized.age[row * size.cols + col]).toBe(0);
          }
        }
      }),
    );
  });

  it('always returns buffers of exactly cols * rows', () => {
    fc.assert(
      fc.property(arbGrid, arbSize, (grid, size) => {
        const resized = resizeGrid(grid, size.cols, size.rows);
        expect(resized.occupant.length).toBe(size.cols * size.rows);
        expect(resized.age.length).toBe(size.cols * size.rows);
      }),
    );
  });

  it('never mutates its input, at any size', () => {
    fc.assert(
      fc.property(arbGrid, arbSize, (grid, size) => {
        const occupantBefore = Uint8Array.from(grid.occupant);
        const ageBefore = Uint16Array.from(grid.age);

        const resized = resizeGrid(grid, size.cols, size.rows);
        resized.occupant.fill(7);
        resized.age.fill(7);

        expect(grid.occupant).toEqual(occupantBefore);
        expect(grid.age).toEqual(ageBefore);
      }),
    );
  });

  it('resizing to the same size preserves content exactly', () => {
    fc.assert(
      fc.property(arbGrid, (grid) => {
        const resized = resizeGrid(grid, grid.width, grid.height);
        expect(Array.from(resized.occupant)).toEqual(Array.from(grid.occupant));
        expect(Array.from(resized.age)).toEqual(Array.from(grid.age));
      }),
    );
  });

  it('grow-then-shrink back is the identity when nothing clips', () => {
    fc.assert(
      fc.property(arbGrid, arbSize, (grid, size) => {
        // Only a genuine grow on BOTH axes round-trips: anything else discards cells on the way
        // out, which is the whole point of the anchor being hard-edged rather than wrapping.
        const grown = resizeGrid(
          grid,
          Math.max(size.cols, grid.width),
          Math.max(size.rows, grid.height),
        );
        const back = resizeGrid(grown, grid.width, grid.height);

        expect(Array.from(back.occupant)).toEqual(Array.from(grid.occupant));
        expect(Array.from(back.age)).toEqual(Array.from(grid.age));
      }),
    );
  });
});
