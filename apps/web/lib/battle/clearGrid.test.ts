import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { RenderableGrid } from '@/lib/canvas/renderableGrid';
import { clearGrid } from './clearGrid';

// Grid dimensions are parameters, never constants (project-context), so most cases below use a
// size that is NEITHER editable preset — matching resizeGrid.test.ts's own convention, and for the
// same reason. The two preset sizes get one case of their own further down.
function makeGrid(width: number, height: number, occupant: readonly number[]): RenderableGrid {
  return {
    width,
    height,
    occupant: Uint8Array.from(occupant),
    age: new Uint16Array(occupant.length),
  };
}

describe('clearGrid', () => {
  it('keeps the CURRENT dimensions (trap 1 — never a resize)', () => {
    const grid = makeGrid(5, 3, new Array(15).fill(1));

    const cleared = clearGrid(grid);

    expect(cleared.width).toBe(5);
    expect(cleared.height).toBe(3);
  });

  it('every cell is 0, at exactly width * height', () => {
    const grid = makeGrid(4, 3, [1, 2, 0, 5, 0, 1, 1, 1, 3, 4, 0, 2]);

    const cleared = clearGrid(grid);

    expect(cleared.occupant.length).toBe(12);
    expect(Array.from(cleared.occupant).every((cell) => cell === 0)).toBe(true);
  });

  it('`age` is a fresh, zero-filled buffer at width * height', () => {
    const grid: RenderableGrid = {
      width: 3,
      height: 2,
      occupant: Uint8Array.from([1, 1, 1, 1, 1, 1]),
      age: Uint16Array.from([9, 9, 9, 9, 9, 9]),
    };

    const cleared = clearGrid(grid);

    expect(cleared.age.length).toBe(6);
    expect(Array.from(cleared.age).every((age) => age === 0)).toBe(true);
  });

  /**
   * ⚠️ The test `deferred-work.md:369` is closed on — it must redden if someone switches to an
   * in-place `occupant.fill(0)`. A new wrapper AND new buffers, both asserted: mutating the
   * result must leave the input byte-identical, and the identities must differ.
   */
  it('returns a NEW wrapper and NEW buffers — the input is untouched (deferred-work.md:369)', () => {
    const grid = makeGrid(2, 2, [1, 2, 3, 4]);
    const before = Uint8Array.from(grid.occupant);

    const cleared = clearGrid(grid);
    cleared.occupant[0] = 200;
    cleared.age[0] = 7;

    expect(grid.occupant).toEqual(before);
    expect(cleared).not.toBe(grid);
    expect(cleared.occupant).not.toBe(grid.occupant);
    expect(cleared.age).not.toBe(grid.age);
  });

  /**
   * ⚠️ Story 2.15 review. Every other case here builds `occupant` at exactly `width * height`, so
   * `new Uint8Array(grid.occupant.length)` passed all of them — the allocation was never actually
   * pinned to the DIMENSIONS. `gridStats.ts`'s own comment is explicit that `RenderableGrid` does
   * not guarantee the two agree, and a producer that over-allocates would put cells outside the
   * visible grid into circulation with every test still green. An over-allocated input is the only
   * shape that tells the two allocations apart.
   */
  it('allocates from width * height, NOT from the input buffers lengths', () => {
    const grid: RenderableGrid = {
      width: 3,
      height: 2,
      occupant: Uint8Array.from([1, 1, 1, 1, 1, 1, 1, 1, 1, 1]), // 10, deliberately not 3 * 2
      age: Uint16Array.from([1, 1, 1, 1, 1, 1, 1, 1]), // 8, deliberately not 3 * 2
    };

    const cleared = clearGrid(grid);

    expect(cleared.occupant.length).toBe(6);
    expect(cleared.age.length).toBe(6);
  });

  it('clears both editable preset sizes (Decision A.2)', () => {
    expect(clearGrid(makeGrid(50, 30, new Array(1500).fill(1))).occupant.length).toBe(1500);
    expect(clearGrid(makeGrid(100, 60, new Array(6000).fill(1))).occupant.length).toBe(6000);
  });
});

describe('clearGrid properties (fast-check)', () => {
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

  it('always returns an all-empty grid at the SAME dimensions as the input', () => {
    fc.assert(
      fc.property(arbGrid, (grid) => {
        const cleared = clearGrid(grid);
        expect(cleared.width).toBe(grid.width);
        expect(cleared.height).toBe(grid.height);
        expect(cleared.occupant.length).toBe(grid.width * grid.height);
        expect(cleared.age.length).toBe(grid.width * grid.height);
        expect(cleared.occupant.every((cell) => cell === 0)).toBe(true);
        expect(cleared.age.every((age) => age === 0)).toBe(true);
      }),
    );
  });

  it('never mutates the input, regardless of its occupancy', () => {
    fc.assert(
      fc.property(arbGrid, (grid) => {
        const before = Uint8Array.from(grid.occupant);
        clearGrid(grid);
        expect(grid.occupant).toEqual(before);
      }),
    );
  });
});
