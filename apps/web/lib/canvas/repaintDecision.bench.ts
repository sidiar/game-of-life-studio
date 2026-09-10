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
  BENCHMARK_GATED_PRESET,
  BENCHMARK_PRESETS,
  BENCHMARK_ROSTER_SIZE,
  BENCHMARK_RUN_OPTIONS,
  createBenchmarkFill,
  createBenchmarkRoster,
  createSeededRng,
  FIXED_SEED,
} from '@gol/test-utils';
import type { Organism } from '@gol/domain';
import { gridFromDense } from '@gol/simulation';
import { bench, describe } from 'vitest';
import { buildRefToFillGroup } from './refToFillGroup';
import { colourStateAt, groupByColourState } from './colourStateGroups';
import { markDirtyCells, selectDirtyCells } from './dirtyCells';
import type { RenderableGrid } from './renderableGrid';

// The gate sums this file's `repaint-decision` against the engine bench's `step` at the SAME
// preset, so both must describe one battle. The dimensions come from the fixture's own preset
// table rather than two literals (Decision A: grid dimensions are parameters, never constants) —
// and the gated label is the one `scripts/check-bench-budget.mjs` names, so the constant that
// claims to be "the only gated preset" is the constant this bench actually runs.
const GATED = BENCHMARK_PRESETS.find((preset) => preset.label === BENCHMARK_GATED_PRESET);
if (GATED === undefined) {
  throw new Error(`BENCHMARK_GATED_PRESET "${BENCHMARK_GATED_PRESET}" is not in BENCHMARK_PRESETS`);
}
const COLS = GATED.cols;
const ROWS = GATED.rows;

// Decision B.2 batches by `(colorToken, min(age, 7))` — eight age shades per token (AR-22 bounds
// the ramp at 7 cycles; `displayColor.ts`'s SHADE_COUNT and `colourStateGroups.ts`'s `% 8` are the
// same number) — but ONLY for an organism with `agingEnabled` (FR-2.4): every other organism's
// cells fold into a single shade whatever their age. So the most groups a roster can produce is
// `sum(agingEnabled ? 8 : 1)`, not tokens x 8: for this roster (5 aging-enabled of 20) that is 55,
// and the "~160 groups a live dish reaches" the first version of this file assumed was never
// reachable with it. `maxGroupsFor` states the real ceiling; the bench asserts the fixture hits it.
const AGE_SHADES = 8;
function maxGroupsFor(roster: readonly Organism[]): number {
  return roster.reduce((groups, organism) => groups + (organism.agingEnabled ? AGE_SHADES : 1), 0);
}

/**
 * The repaint fixture: the pinned 30% seeded fill, with the AGE of every occupied cell drawn from
 * the same seeded RNG across all eight shades.
 *
 * ⚠️ NOT a grid the engine has run, and that is deliberate (Story 3.7 code review). The first
 * version of this bench stepped the fixture 50 cycles "so the age ramp is live and the group count
 * is the real one" — measured, the 20 rule sets collapse into a 7-organism still life by cycle 10
 * (7 groups, 502 occupied cells, static through cycle 200), so the gated number was being taken on
 * an 8%-occupied frozen dish while its label claimed ~160 live groups. The repaint decision's cost
 * is driven by occupied-cell count and group count, and both must be PINNED gate parameters
 * (AC2), not whatever the engine's dynamics happen to leave standing. So this fixture states them:
 * the pinned fill, and every (token, shade) group this roster can produce populated (55 — see
 * `maxGroupsFor`) — the batching upper bound for this roster at this density, which is what a
 * "worst frame" derivation (Decision D.2/D.3) wants.
 */
function repaintFixture(roster: readonly Organism[]): RenderableGrid {
  const rng = createSeededRng(FIXED_SEED);
  const grid = gridFromDense(
    createBenchmarkFill(COLS, ROWS, roster.length, BENCHMARK_FILL_PERMILLE, rng),
  );
  // `age` is a `Uint16Array` behind a readonly PROPERTY — the contents are writable, and this
  // grid is this bench's own, never handed to the engine.
  for (let index = 0; index < grid.occupant.length; index++) {
    if (grid.occupant[index] !== 0) grid.age[index] = rng.int(AGE_SHADES);
  }
  return grid;
}

describe('repaint decision — the measurable half of the NFR-1.1 frame', () => {
  const roster = createBenchmarkRoster(BENCHMARK_ROSTER_SIZE);
  const lut = buildRefToFillGroup(
    roster.map((organism) => organism.id),
    new Map(roster.map((organism) => [organism.id, organism])),
  );
  const grid = repaintFixture(roster);
  const cellCount = COLS * ROWS;

  // The fixture's shape, asserted rather than assumed: with a seeded fill this is deterministic,
  // and a roster or fill change that collapses the group count must fail the bench (which the
  // gate's vacuous-result guard turns into a red build) instead of quietly measuring less.
  const groupCount = groupByColourState(grid, lut).length;
  const expectedGroups = maxGroupsFor(roster);
  if (groupCount !== expectedGroups) {
    throw new Error(
      `repaint fixture has ${groupCount} colour-state groups, expected ${expectedGroups} ` +
        `(every (token, shade) pair this roster can produce — ${AGE_SHADES} shades per ` +
        `aging-enabled organism, one otherwise)`,
    );
  }

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
    `repaint-decision ${BENCHMARK_GATED_PRESET} x${BENCHMARK_ROSTER_SIZE}`,
    () => {
      groupByColourState(grid, lut);
    },
    BENCHMARK_RUN_OPTIONS,
  );

  /**
   * The `draw` (dirty) path's decision cost when EVERY cell is a candidate — which is what a
   * playback frame is, since a step can change any cell and the engine publishes no change list.
   * deferred-work.md (2.3 review) asks Story 3.7 to confirm Story 3.8's loop calls `draw` rather
   * than `drawFull`; this is the number that answers it, against the one above.
   *
   * ⚠️ AN UPPER BOUND, labelled as one (Story 3.7 code review): the baseline is zeroed per
   * iteration, so every occupied cell reads as changed — the most the diff can ever report — and
   * the `Uint16Array` allocation is counted although the real renderer allocates it once per grid
   * shape. A live frame changes a fraction of the cells and diffs against the previous frame.
   */
  bench(
    `repaint-dirty-path ${BENCHMARK_GATED_PRESET} x${BENCHMARK_ROSTER_SIZE}`,
    () => {
      const marks = new Set<number>();
      markDirtyCells(marks, { cols: COLS, rows: ROWS }, allCells);
      const baseline = new Uint16Array(cellCount);
      selectDirtyCells(marks, grid, lut, baseline);
    },
    BENCHMARK_RUN_OPTIONS,
  );

  /**
   * `drawFull`'s O(cells) colour-state re-prime (deferred-work.md, 2.3 review). `resetDirtyState`
   * is private, so the sweep is written out from the public parts it is built from — one
   * `colourStateAt` per cell into a `Uint16Array`, allocated once per grid shape. Measured because
   * Decision D.3 repaints after EVERY step, which would put this sweep on the cycle rate if the
   * loop reached for `drawFull`.
   */
  bench(
    `colour-state-reprime ${BENCHMARK_GATED_PRESET} x${BENCHMARK_ROSTER_SIZE}`,
    () => {
      const baseline = new Uint16Array(cellCount);
      for (let index = 0; index < cellCount; index++) {
        baseline[index] = colourStateAt(grid, lut, index);
      }
    },
    BENCHMARK_RUN_OPTIONS,
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
    BENCHMARK_RUN_OPTIONS,
  );
});

/**
 * `<OrganismSearchAdd>`'s unmemoised search filter (deferred-work.md, 2.10 review) — `library.filter(
 * (organism) => organism.name.toLowerCase().includes(query))` on every render, over the UNCAPPED
 * workspace library (Decision G.3/M6). The predicate is copied verbatim from `OrganismRoster.tsx`,
 * where that component lives; the library size is not, because there is no cap to copy — 1,000 is
 * far past any realistic workspace and is the point of the measurement.
 */
describe('OrganismSearchAdd search filter — the uncapped per-render library scan', () => {
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
    BENCHMARK_RUN_OPTIONS,
  );
});
