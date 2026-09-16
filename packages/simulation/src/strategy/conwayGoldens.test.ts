import { CONWAYS_CLASSIC, emptyGrid, gridFromPattern, placePattern } from '@gol/test-utils';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { createGridBuffers, swapGridBuffers } from '../grid/doubleBuffer';
import { gridFromDense, gridToDense, isGridEmpty } from '../grid/grid';
import type { Grid } from '../grid/grid';
import { compileSession } from '../session/compileEvaluators';
import { threePhaseStep } from './threePhaseStep';
import type { SimulationDeps } from './threePhaseStep';

// AR-40's golden-pattern suite, end to end through the assembled cycle. These are the fixtures
// that catch the two silent defects no smoke test can: a Phase 3 that iterates the CLAIMS instead
// of sweeping the grid (implicit death never happens, so Conway — which has no `die` rule at all —
// only ever grows), and a WRAPPING neighbourhood — but ⚠️ only the fixture that lets the glider
// REACH an edge can see that one. The translation goldens keep it clear of every edge by design
// (AC10), and while no live cell touches the border a modulo idiom is byte-identical to hard
// edges on every grid size, so they pass under wrapping too (the Story 3.6 review checked, by
// mutating `neighborTally.ts` to wrap).
//
// ⚠️ Conway's Classic is single-organism, so `neighborCount` (same-organism) and "all occupied
// neighbours" COINCIDE here. That is why the multi-organism goldens live in their own file — no
// fixture below can tell a swapped `same`/`other` pair apart.

const conwayDeps = (): SimulationDeps => ({
  ...compileSession([CONWAYS_CLASSIC]),
  organisms: [{ dominance: CONWAYS_CLASSIC.dominance }],
  // Single-organism: two claims for one cell is impossible, so a draw would be a defect.
  rng: {
    int(): number {
      throw new Error('a single-organism battle reached the Dominance tie-break');
    },
  },
});

const LIVE = { '.': 0, X: 1 } as const;

/**
 * Runs `cycles` full steps through the double buffer — the same strategy-then-swap composition
 * Story 3.8's `stepGridBuffers` ships for the loop's `step` thunk.
 *
 * ⚠️ `start` is taken BY REFERENCE by `createGridBuffers` and becomes the scratch buffer after the
 * first swap (`doubleBuffer.ts` says so explicitly) — snapshot anything you need from it BEFORE
 * calling this.
 */
const run = (start: Grid, deps: SimulationDeps, cycles: number): Grid => {
  let buffers = createGridBuffers(start);
  for (let cycle = 0; cycle < cycles; cycle++) {
    threePhaseStep(buffers.front, buffers.back, deps);
    buffers = swapGridBuffers(buffers);
  }
  return buffers.front;
};

describe("blinker — period 2 (AR-40, Conway's Classic)", () => {
  const VERTICAL = ['.....', '..X..', '..X..', '..X..', '.....'];
  const HORIZONTAL = ['.....', '.....', '.XXX.', '.....', '.....'];

  it('oscillates to the horizontal phase after one cycle', () => {
    const grid = gridFromDense(gridFromPattern(VERTICAL, LIVE));
    expect(gridToDense(run(grid, conwayDeps(), 1))).toEqual(gridFromPattern(HORIZONTAL, LIVE));
  });

  it('returns to its EXACT start after two cycles', () => {
    const grid = gridFromDense(gridFromPattern(VERTICAL, LIVE));
    expect(gridToDense(run(grid, conwayDeps(), 2))).toEqual(gridFromPattern(VERTICAL, LIVE));
  });

  it('keeps oscillating for 20 cycles rather than dying out or spreading', () => {
    // ⚠️ An oscillator must KEEP RUNNING (Decision B.5): auto-stop is extinction-only, and a test
    // asserting that a periodic pattern settles or stops encodes a spec violation. Age advances
    // under a visually static grid and is a rule input, so a frozen-looking grid may still be
    // evolving.
    const grid = gridFromDense(gridFromPattern(VERTICAL, LIVE));
    expect(gridToDense(run(grid, conwayDeps(), 20))).toEqual(gridFromPattern(VERTICAL, LIVE));
  });
});

describe('glider — one cell diagonally every 4 cycles (AR-40, FR-5.8/5.9 hard edges)', () => {
  // The canonical south-east glider.
  const GLIDER = gridFromPattern(['.X.', '..X', 'XXX'], LIVE);

  it('translates by exactly (1, 1) after 4 cycles', () => {
    // A 14x14 field with the glider at (3, 3): four cycles move it to (4, 4) and its intermediate
    // bounding box never reaches an edge, so the hard edges genuinely do not participate. This is
    // what makes the test a detector for a WRAPPING neighbourhood rather than a coincidence of
    // grid size.
    const field = emptyGrid(14, 14);
    const start = gridFromDense(placePattern(field, GLIDER, 3, 3));

    expect(gridToDense(run(start, conwayDeps(), 4))).toEqual(placePattern(field, GLIDER, 4, 4));
  });

  it('translates by (2, 2) after 8 cycles', () => {
    const field = emptyGrid(14, 14);
    const start = gridFromDense(placePattern(field, GLIDER, 3, 3));

    expect(gridToDense(run(start, conwayDeps(), 8))).toEqual(placePattern(field, GLIDER, 5, 5));
  });

  it('translates identically on a DIFFERENT, non-square grid size', () => {
    // Dimensions are parameters, never constants (Decision A): the same translation on a second,
    // non-square field pins that nothing in the cycle has a 14 (or a square) baked in. ⚠️ This is
    // NOT the wrap detector — with the glider clear of every edge, wrapping and hard edges agree
    // here too; the edge-collision fixture below is the detector.
    const field = emptyGrid(11, 17);
    const start = gridFromDense(placePattern(field, GLIDER, 2, 5));

    expect(gridToDense(run(start, conwayDeps(), 4))).toEqual(placePattern(field, GLIDER, 3, 6));
  });

  it('is stopped by the hard edge — a wrapping neighbourhood would return it to its start', () => {
    // THE wrap detector (FR-5.8/5.9, `neighborhood.ts`). On an 8x8 field the glider advances
    // (1, 1) every 4 cycles, so under a toroidal `(row + dr + height) % height` idiom 32 cycles
    // carry it exactly (8, 8) — back onto its starting cells, byte for byte. Under hard edges it
    // runs into the far corner and collapses into a block, the textbook fate of a glider on a
    // bounded field. Verified by mutating `neighborTally.ts` to wrap during the Story 3.6 review:
    // this test reddens, the three translation goldens above do not.
    const field = emptyGrid(8, 8);
    const start = placePattern(field, GLIDER, 3, 3);
    const after = gridToDense(run(gridFromDense(start), conwayDeps(), 32));

    expect(after).not.toEqual(start);
    expect(after).toEqual(
      gridFromPattern(
        [
          '........',
          '........',
          '........',
          '........',
          '........',
          '........',
          '......XX',
          '......XX',
        ],
        LIVE,
      ),
    );
  });
});

describe('still-lifes — byte-identical after N cycles (AR-40)', () => {
  it('a block is unchanged after 10 cycles', () => {
    const pattern = ['....', '.XX.', '.XX.', '....'];
    const grid = gridFromDense(gridFromPattern(pattern, LIVE));

    expect(gridToDense(run(grid, conwayDeps(), 10))).toEqual(gridFromPattern(pattern, LIVE));
  });

  it('a beehive is unchanged after 10 cycles', () => {
    const pattern = ['......', '..XX..', '.X..X.', '..XX..', '......'];
    const grid = gridFromDense(gridFromPattern(pattern, LIVE));

    expect(gridToDense(run(grid, conwayDeps(), 10))).toEqual(gridFromPattern(pattern, LIVE));
  });

  it('a still-life KEEPS RUNNING — it is not an auto-stop condition (Decision B.5)', () => {
    // The intuitive test is the wrong one. `threePhaseStep` is a pure reducer with no notion of
    // "the run is over"; extinction detection is Story 3.15's, and freeze detection was removed
    // outright (validation H-alpha) because age advances under a static grid.
    const pattern = ['....', '.XX.', '.XX.', '....'];
    const grid = gridFromDense(gridFromPattern(pattern, LIVE));
    const after = run(grid, conwayDeps(), 10);

    expect(gridToDense(after)).toEqual(gridFromPattern(pattern, LIVE));
    // Age kept advancing while the picture stood still — saturating at maxRelevantAge = 7.
    expect(after.age[1 * 4 + 1]).toBe(7);
  });
});

describe('extinction is a normal outcome, not an error (Decision B.5, Story 3.15)', () => {
  it('a lone cell dies and the cycle keeps returning an empty grid', () => {
    const grid = gridFromDense(gridFromPattern(['...', '.X.', '...'], LIVE));
    const after = run(grid, conwayDeps(), 3);

    expect(gridToDense(after)).toEqual(gridFromPattern(['...', '...', '...'], LIVE));
  });

  // AR-41 / RFC-008's "extinction-only auto-stop" property, engine-level half (AC5 (d)). Each
  // golden below is built FRESH from its dense pattern INSIDE the property body (trap 10):
  // `createGridBuffers` takes `start` by reference and the swap turns it into scratch, so sharing
  // one `Grid` across fast-check runs would have run N read run (N-1)'s battle-scarred buffer.
  const BLOCK_PATTERN = ['....', '.XX.', '.XX.', '....'];
  const BEEHIVE_PATTERN = ['......', '..XX..', '.X..X.', '..XX..', '......'];
  const BLINKER_PATTERN = ['.....', '..X..', '..X..', '..X..', '.....'];
  const GLIDER_DENSE = gridFromPattern(['.X.', '..X', 'XXX'], LIVE);

  // The glider on a 12x12 field, corner-placed so its bounding box never reaches an edge across
  // the 40-cycle span this property draws from (a glider translates (1,1) every 4 cycles).
  const buildNonExtinguishingGolden = (index: 0 | 1 | 2 | 3): Grid => {
    switch (index) {
      case 0:
        return gridFromDense(gridFromPattern(BLOCK_PATTERN, LIVE));
      case 1:
        return gridFromDense(gridFromPattern(BEEHIVE_PATTERN, LIVE));
      case 2:
        return gridFromDense(gridFromPattern(BLINKER_PATTERN, LIVE));
      case 3:
        return gridFromDense(placePattern(emptyGrid(12, 12), GLIDER_DENSE, 0, 0));
    }
  };

  it('a block, a beehive, a blinker, and a glider (12x12) are NEVER extinguished by any cycle count in [0, 40]', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 40 }),
        fc.constantFrom<0 | 1 | 2 | 3>(0, 1, 2, 3),
        (cycles, goldenIndex) => {
          const grid = buildNonExtinguishingGolden(goldenIndex);

          expect(isGridEmpty(run(grid, conwayDeps(), cycles))).toBe(false);
        },
      ),
    );
  });

  it('the lone cell is empty for every cycle count >= 1, and only for those', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 40 }), (cycles) => {
        const grid = gridFromDense(gridFromPattern(['...', '.X.', '...'], LIVE));

        expect(isGridEmpty(run(grid, conwayDeps(), cycles))).toBe(cycles >= 1);
      }),
    );
  });
});

describe('the Conway AGE golden (AC11, FR-5.6, Decision B.5)', () => {
  // Conway's Classic mentions no `age` literal, so maxRelevantAge = max(7, 0 + 1) = 7. One fixture
  // pins the clamp, the `+1`, the birth reset and the survive/born distinction at once.
  const VERTICAL = ['.....', '..X..', '..X..', '..X..', '.....'];
  const CENTRE = 2 * 5 + 2;

  it('the battle ceiling is 7 for a rule set with no age literal', () => {
    expect(compileSession([CONWAYS_CLASSIC]).maxRelevantAge).toBe(7);
  });

  it('the centre saturates at 7 after 10 cycles while the ends re-birth at 0', () => {
    const grid = gridFromDense(gridFromPattern(VERTICAL, LIVE));
    const after = run(grid, conwayDeps(), 10);

    // The centre cell survives EVERY cycle, so a naive `age + 1` would read 10 here and
    // `min(age, max) + 1` would read 8. Only `min(age + 1, max)` gives 7.
    expect(after.age[CENTRE]).toBe(7);
    // Ten cycles is even, so the blinker is vertical again and the flanks were BORN this cycle.
    expect(after.occupant[1 * 5 + 2]).toBe(1);
    expect(after.age[1 * 5 + 2]).toBe(0);
    expect(after.age[3 * 5 + 2]).toBe(0);
  });

  it('the centre climbs one per cycle before it saturates', () => {
    for (const [cycles, expected] of [
      [1, 1],
      [2, 2],
      [5, 5],
      [7, 7],
      [8, 7],
      [30, 7],
    ] as const) {
      const grid = gridFromDense(gridFromPattern(VERTICAL, LIVE));
      expect(run(grid, conwayDeps(), cycles).age[CENTRE]).toBe(expected);
    }
  });

  it('an empty cell carries age 0, never a stale age from an earlier frame', () => {
    const grid = gridFromDense(gridFromPattern(VERTICAL, LIVE));
    const after = run(grid, conwayDeps(), 9);

    for (let i = 0; i < after.occupant.length; i++) {
      if (after.occupant[i] === 0) expect(after.age[i]).toBe(0);
    }
  });
});
