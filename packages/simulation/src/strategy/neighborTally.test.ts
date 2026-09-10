import { gridFromPattern } from '@gol/test-utils';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { gridFromDense } from '../grid/grid';
import { countNeighbors } from '../grid/neighborhood';
import { createNeighborTally, sameNeighbors, tallyNeighbors } from './neighborTally';

// The tally is a SECOND counting path (story FD5), and the whole risk of having one is that it
// drifts from the first. `countNeighbors` (Story 3.3) is the reference implementation of hard-edge
// Moore counting, so every assertion here is either differential against it or an explicit
// statement of a property it also holds.

const REF_A = 1;
const REF_B = 2;

// The same three-organism fixture `neighborhood.test.ts` uses, for the same reason: it is the one
// shape that can tell SAME-organism counting from "all eight occupied neighbours".
//
//   row 0:  A B A
//   row 1:  B A B
//   row 2:  A . A
const MULTI = gridFromDense(gridFromPattern(['ABA', 'BAB', 'A.A'], { '.': 0, A: 1, B: 2 }));

const countsVia = (
  grid: ReturnType<typeof gridFromDense>,
  col: number,
  row: number,
  ref: number,
): { same: number; other: number } => {
  const tally = createNeighborTally();
  tallyNeighbors(grid, col, row, tally);
  const same = sameNeighbors(tally, ref);
  return { same, other: tally.total - same };
};

describe('tallyNeighbors — relative counts from one pass (AC6)', () => {
  it('answers differently for two organisms evaluating the SAME physical cell', () => {
    expect(countsVia(MULTI, 1, 1, REF_A)).toEqual({ same: 4, other: 3 });
    expect(countsVia(MULTI, 1, 1, REF_B)).toEqual({ same: 3, other: 4 });
  });

  it('serves every organism from ONE pass — the point of the restructuring', () => {
    const tally = createNeighborTally();
    tallyNeighbors(MULTI, 1, 1, tally);

    // Two different organisms, no second scan of the grid.
    expect(sameNeighbors(tally, REF_A)).toBe(4);
    expect(sameNeighbors(tally, REF_B)).toBe(3);
    expect(tally.total).toBe(7);
  });

  it('reports zero for a ref present nowhere near the cell', () => {
    expect(countsVia(MULTI, 1, 1, 200)).toEqual({ same: 0, other: 7 });
  });

  it('empty neighbours count toward NEITHER total', () => {
    // The cell below the centre is empty, so the two counts sum to 7, not to the 8 neighbour slots.
    const { same, other } = countsVia(MULTI, 1, 1, REF_A);
    expect(same + other).toBe(7);
  });
});

describe('tallyNeighbors — reuse across cells', () => {
  it('clears the previous cell entirely before tallying the next', () => {
    // The bug this pins: clearing only `total` (or only some of `touched`) leaves the PREVIOUS
    // cell's per-ref counts standing, so a cell with no B neighbours still reports some.
    const tally = createNeighborTally();

    tallyNeighbors(MULTI, 1, 1, tally); // touches A and B
    tallyNeighbors(MULTI, 0, 0, tally); // corner: neighbours are B(1,0), B(0,1), A(1,1)

    expect(sameNeighbors(tally, REF_A)).toBe(1);
    expect(sameNeighbors(tally, REF_B)).toBe(2);
    expect(tally.total).toBe(3);
  });

  it('leaves no residue behind an all-empty cell', () => {
    const tally = createNeighborTally();
    const lonely = gridFromDense(gridFromPattern(['A..', '...', '...'], { '.': 0, A: 1 }));

    tallyNeighbors(MULTI, 1, 1, tally);
    tallyNeighbors(lonely, 2, 2, tally);

    expect(tally.total).toBe(0);
    expect(tally.touchedCount).toBe(0);
    expect(sameNeighbors(tally, REF_A)).toBe(0);
    expect(sameNeighbors(tally, REF_B)).toBe(0);
  });
});

describe('tallyNeighbors agrees with countNeighbors everywhere (fast-check, AR-41)', () => {
  // Small grids, deliberately including 1xN and Nx1: the modulo idiom this file avoids
  // (Trap 8) is correct on a comfortable interior and wrong exactly at the degenerate shapes.
  const arbGrid = fc
    .tuple(fc.integer({ min: 1, max: 7 }), fc.integer({ min: 1, max: 7 }))
    .chain(([width, height]) =>
      fc.array(fc.array(fc.integer({ min: 0, max: 3 }), { minLength: width, maxLength: width }), {
        minLength: height,
        maxLength: height,
      }),
    );

  it('matches the reference implementation for every (cell, ref)', () => {
    fc.assert(
      fc.property(arbGrid, (dense) => {
        const grid = gridFromDense(dense);
        const tally = createNeighborTally();

        for (let row = 0; row < grid.height; row++) {
          for (let col = 0; col < grid.width; col++) {
            tallyNeighbors(grid, col, row, tally);

            for (let ref = 0; ref <= 4; ref++) {
              const expected = countNeighbors(grid, col, row, ref);
              const same = sameNeighbors(tally, ref);

              expect({ same, other: tally.total - same }).toEqual(expected);
            }
          }
        }
      }),
    );
  });

  it('never records more than 8 distinct refs, and total never exceeds 8', () => {
    fc.assert(
      fc.property(arbGrid, (dense) => {
        const grid = gridFromDense(dense);
        const tally = createNeighborTally();

        for (let row = 0; row < grid.height; row++) {
          for (let col = 0; col < grid.width; col++) {
            tallyNeighbors(grid, col, row, tally);

            expect(tally.touchedCount).toBeLessThanOrEqual(8);
            expect(tally.total).toBeLessThanOrEqual(8);
          }
        }
      }),
    );
  });

  it('leaves the grid untouched', () => {
    fc.assert(
      fc.property(arbGrid, (dense) => {
        const grid = gridFromDense(dense);
        const before = Array.from(grid.occupant);
        const tally = createNeighborTally();

        for (let row = 0; row < grid.height; row++) {
          for (let col = 0; col < grid.width; col++) tallyNeighbors(grid, col, row, tally);
        }

        expect(Array.from(grid.occupant)).toEqual(before);
      }),
    );
  });
});
