// The repaint half of the NFR-1.1 frame (AR-43, story FD2 option (b), RFC-008 Decision 6).
//
// ⚠️ WHAT THIS MEASURES, stated before any number is read: the renderer's DECISION LOGIC — the
// colour-state batching, the dirty-cell diff and the ref->fill-group LUT. It does NOT measure
// browser rasterization, and nothing derived from it may be reported as a paint number. jsdom's
// `getContext()` is unimplemented (the "Not implemented: HTMLCanvasElement's getContext()" lines in
// every apps/web test run are exactly this), so a `GridRenderer` benchmark here would time a test
// double's method calls. RFC-008 Decision 6 says to test the renderer's brain and avoid
// pixel/snapshot work for the same reason; a real repaint number needs a real browser, and RFC-008
// Risk 6 argues against putting one on a shared CI runner.
//
// ⚠️ `vitest run` DOES NOT EXECUTE THIS FILE — `*.bench.ts` is `vitest bench`'s glob alone. The
// vacuous-result guard in `scripts/check-bench-budget.mjs` is what makes a bench that silently
// stopped running a red build rather than a green one.
import {
  BENCHMARK_FILL_PERMILLE,
  BENCHMARK_ROSTER_SIZE,
  createBenchmarkFill,
  createBenchmarkRoster,
  createSeededRng,
  FIXED_SEED,
} from '@gol/test-utils';
import type { Organism } from '@gol/domain';
import {
  compileSession,
  createGridBuffers,
  createRng,
  gridFromDense,
  swapGridBuffers,
  threePhaseStep,
} from '@gol/simulation';
import { bench, describe } from 'vitest';
import { buildRefToFillGroup } from './refToFillGroup';
import { colourStateAt, groupByColourState } from './colourStateGroups';
import { markDirtyCells, selectDirtyCells } from './dirtyCells';
import type { RenderableGrid } from './renderableGrid';

// Same shape and options as packages/simulation's engine bench, and for the same reason: `time: 0`
// with an exact iteration count makes the amount of work a fixed property of the fixture instead of
// a function of how fast the machine is (AC2 — the cycle count is pinned, not discovered).
const BENCH_OPTIONS = {
  time: 0,
  iterations: 100,
  warmupTime: 0,
  warmupIterations: 25,
} as const;

// The gate sums this file's `repaint-decision` against the engine bench's `step` at the SAME
// preset, so both must describe one battle. 100x60 is NFR-1.1's baseline and the only gated size.
const COLS = 100;
const ROWS = 60;

/**
 * A grid that has actually been RUN, not a freshly seeded one.
 *
 * ⚠️ Ages matter here in a way they do not on the engine side. Decision B.2 batches by
 * `(colorToken, min(age, 7))`, so an all-zero age buffer collapses every organism to one shade and
 * `groupByColourState` builds 20 groups instead of the ~160 a live dish reaches. Stepping the
 * fixture forward is what makes the measured group count the real one.
 */
function evolvedGrid(roster: readonly Organism[], cycles: number): RenderableGrid {
  const deps = {
    ...compileSession(roster),
    organisms: roster,
    rng: createRng(FIXED_SEED),
  };
  let buffers = createGridBuffers(
    gridFromDense(
      createBenchmarkFill(
        COLS,
        ROWS,
        BENCHMARK_ROSTER_SIZE,
        BENCHMARK_FILL_PERMILLE,
        createSeededRng(FIXED_SEED),
      ),
    ),
  );
  for (let cycle = 0; cycle < cycles; cycle++) {
    threePhaseStep(buffers.front, buffers.back, deps);
    buffers = swapGridBuffers(buffers);
  }
  return buffers.front;
}

describe('repaint decision — the measurable half of the NFR-1.1 frame', () => {
  const roster = createBenchmarkRoster(BENCHMARK_ROSTER_SIZE);
  const lut = buildRefToFillGroup(
    roster.map((organism) => organism.id),
    new Map(roster.map((organism) => [organism.id, organism])),
  );
  // 50 cycles: enough for the age ramp to saturate (AR-22 bounds the shade ramp at 7 cycles) and
  // for the initial random fill to settle into whatever these 20 rule sets produce.
  const grid = evolvedGrid(roster, 50);
  const cellCount = COLS * ROWS;

  // Every cell as a dirty candidate, built once — Story 3.8's loop would rebuild this per frame,
  // but the allocation of the coordinate list is that story's cost to shape, not this one's.
  const allCells = Array.from({ length: cellCount }, (_, index) => ({
    col: index % COLS,
    row: Math.floor(index / COLS),
  }));

  /**
   * ⚠️ THE GATED QUANTITY'S REPAINT HALF. `groupByColourState` is the full-repaint path's whole
   * decision: one `colourStateAt` per cell, folded into (colorToken, ageShade) batches.
   *
   * Chosen as the gated repaint rather than the dirty path deliberately: it is the repaint decision
   * whose cost does not depend on which call Story 3.8's loop ends up making, so the gate keeps
   * meaning the same thing after 3.8 lands. Both alternatives are measured below.
   */
  bench(
    `repaint-decision 100x60 x${BENCHMARK_ROSTER_SIZE}`,
    () => {
      groupByColourState(grid, lut);
    },
    BENCH_OPTIONS,
  );

  /**
   * The `draw` (dirty) path's decision cost when EVERY cell is a candidate — which is what a
   * playback frame is, since a step can change any cell and the engine publishes no change list.
   * deferred-work.md (2.3 review) asks Story 3.7 to confirm Story 3.8's loop calls `draw` rather
   * than `drawFull`; this is the number that answers it, against the one above.
   */
  bench(
    `repaint-dirty-path 100x60 x${BENCHMARK_ROSTER_SIZE}`,
    () => {
      const marks = new Set<number>();
      markDirtyCells(marks, { cols: COLS, rows: ROWS }, allCells);
      const baseline = new Uint16Array(cellCount);
      selectDirtyCells(marks, grid, lut, baseline);
    },
    BENCH_OPTIONS,
  );

  /**
   * `drawFull`'s O(cells) colour-state re-prime (deferred-work.md, 2.3 review). `resetDirtyState`
   * is private, so the sweep is written out from the public parts it is built from — one
   * `colourStateAt` per cell into a `Uint16Array`, allocated once per grid shape. Measured because
   * Decision D.3 repaints after EVERY step, which would put this sweep on the cycle rate if the
   * loop reached for `drawFull`.
   */
  bench(
    `colour-state-reprime 100x60 x${BENCHMARK_ROSTER_SIZE}`,
    () => {
      const baseline = new Uint16Array(cellCount);
      for (let index = 0; index < cellCount; index++) {
        baseline[index] = colourStateAt(grid, lut, index);
      }
    },
    BENCH_OPTIONS,
  );

  /**
   * `buildRefToFillGroup` runs ONCE per battle, not per frame — benched so the report can say so
   * with a number rather than an assertion (deferred-work.md's Story 1.8 entry made the same
   * once-per-battle claim about the palette diagnostic it moved off the loop).
   */
  bench(
    `ref-to-fill-group-build x${BENCHMARK_ROSTER_SIZE}`,
    () => {
      buildRefToFillGroup(
        roster.map((organism) => organism.id),
        new Map(roster.map((organism) => [organism.id, organism])),
      );
    },
    BENCH_OPTIONS,
  );
});

/**
 * `<OrganismRoster>`'s unmemoised search filter (deferred-work.md, 2.10 review) — `library.filter(
 * (organism) => organism.name.toLowerCase().includes(query))` on every render, over the UNCAPPED
 * workspace library (Decision G.3/M6). The predicate is copied verbatim from `OrganismRoster.tsx`;
 * the library size is not, because there is no cap to copy — 1,000 is far past any realistic
 * workspace and is the point of the measurement.
 */
describe('OrganismRoster search filter — the uncapped per-render library scan', () => {
  const library: Organism[] = Array.from({ length: 1000 }, (_, index) => ({
    ...createBenchmarkRoster(1)[0],
    id: `library-organism-${index}`,
    name: `Organism ${index}`,
  }));
  const query = 'organism 9';

  bench(
    'library-filter 1000 organisms',
    () => {
      library.filter((organism) => organism.name.toLowerCase().includes(query));
    },
    BENCH_OPTIONS,
  );
});
