// The NFR-1.1 engine harness (AR-43, Decision A, H-9, RFC-008 Decision 7) — the first code in this
// repo that MEASURES the cycle Stories 3.1-3.6 built.
//
// ⚠️ `vitest run` DOES NOT EXECUTE THIS FILE. `*.bench.ts` is picked up by `vitest bench` alone, so
// a typo here is invisible to `npm test` and to the whole unit suite. `scripts/check-bench-budget.mjs`
// is what turns "this file did not run" into a red build (its vacuous-result guard) — the same rule
// `check-bundle-size.mjs` states for an empty asset scrape.
//
// ⚠️ The subject is the ASSEMBLED `threePhaseStep`, driven through the real `compileSession` +
// `createGridBuffers` + `swapGridBuffers` cycle. Never a hand-built evaluator and never one phase
// alone: NFR-1.1 constrains the cycle a frame actually runs, and a number taken off anything else
// is not that number.
import {
  BENCHMARK_FILL_PERMILLE,
  BENCHMARK_PRESETS,
  BENCHMARK_ROSTER_SIZE,
  BENCHMARK_RUN_OPTIONS,
  createBenchmarkFill,
  createBenchmarkRoster,
  createSeededRng,
  FIXED_SEED,
} from '@gol/test-utils';
import { bench, describe } from 'vitest';
import { gridFromDense } from '../grid/grid';
import { createGridBuffers, swapGridBuffers } from '../grid/doubleBuffer';
import { compileSession } from '../session/compileEvaluators';
import { birthSurvivalPhase } from './birthSurvivalPhase';
import { conflictPhase } from './conflictPhase';
import { deathPhase } from './deathPhase';
import { createRng } from './rng';
import type { SimulationDeps } from './threePhaseStep';
import { threePhaseStep } from './threePhaseStep';

// The run options are the fixture's, shared with apps/web's repaint bench through @gol/test-utils
// (`BENCHMARK_RUN_OPTIONS`) because the gate SUMS the two results: exact iteration counts, `time:
// 0`, a pinned warm-up. See that constant for why each of the four numbers is what it is.
const BENCH_OPTIONS = BENCHMARK_RUN_OPTIONS;

/**
 * One preset's state: a compiled session, a buffer pair, and the cursor that walks them.
 *
 * The `let` is function-scoped, never module-scoped (AR-16): each preset owns its own pair and
 * nothing ambient survives the call.
 */
function benchPreset(label: string, cols: number, rows: number): void {
  const roster = createBenchmarkRoster(BENCHMARK_ROSTER_SIZE);
  const dense = createBenchmarkFill(
    cols,
    rows,
    BENCHMARK_ROSTER_SIZE,
    BENCHMARK_FILL_PERMILLE,
    createSeededRng(FIXED_SEED),
  );

  // `{ ...compileSession(roster), organisms, rng }` with NO adapter and no construction step — the
  // structural claim Story 3.6's FD2 made when it declared `SimulationDeps` as the union of the
  // phases' own deps. If this line ever needs a mapping layer, the deps shape is wrong.
  const deps: SimulationDeps = {
    ...compileSession(roster),
    organisms: roster,
    // Injected with a FIXED seed: a benchmark whose Phase 3 tie-breaks vary run to run is not a
    // baseline. The roster's Dominance values are distinct, so in practice nothing draws from it.
    rng: createRng(FIXED_SEED),
  };

  let buffers = createGridBuffers(gridFromDense(dense));

  bench(
    `step ${label} x${BENCHMARK_ROSTER_SIZE}`,
    () => {
      threePhaseStep(buffers.front, buffers.back, deps);
      // The swap is the CALLER's step (Story 3.6) — including here, or the harness would measure a
      // cycle no loop actually runs.
      buffers = swapGridBuffers(buffers);
    },
    BENCH_OPTIONS,
  );
}

describe('threePhaseStep — NFR-1.1 baseline and the tracked presets', () => {
  for (const preset of BENCHMARK_PRESETS) {
    benchPreset(preset.label, preset.cols, preset.rows);
  }
});

/**
 * The phase split at the gated preset — DIAGNOSTIC, never gated.
 *
 * ⚠️ These are the one place a phase is measured in isolation, and AC1's rule still holds for the
 * number that gates CI: `scripts/check-bench-budget.mjs` names the assembled `step 100x60 x20` and
 * nothing here. A phase's own number cannot stand in for the cycle — Phase 2 reads Phase 1's output,
 * so the three are not independent — but the split is what tells the next reader WHERE the frame
 * budget goes, and every deferred performance item this story closes needed one.
 */
function benchPhases(cols: number, rows: number): void {
  const roster = createBenchmarkRoster(BENCHMARK_ROSTER_SIZE);
  const deps: SimulationDeps = {
    ...compileSession(roster),
    organisms: roster,
    rng: createRng(FIXED_SEED),
  };
  const dense = createBenchmarkFill(
    cols,
    rows,
    BENCHMARK_ROSTER_SIZE,
    BENCHMARK_FILL_PERMILLE,
    createSeededRng(FIXED_SEED),
  );
  const buffers = createGridBuffers(gridFromDense(dense));

  // Each phase is measured against a grid the PREVIOUS phase actually produced, so the subjects are
  // the ones a real cycle materializes. Phase 1's output is `back`; Phase 2 reads it; Phase 3
  // finishes over it.
  bench(
    `phase1-death 100x60 x${BENCHMARK_ROSTER_SIZE}`,
    () => {
      deathPhase(buffers.front, buffers.back, deps);
    },
    BENCH_OPTIONS,
  );

  deathPhase(buffers.front, buffers.back, deps);
  bench(
    `phase2-birth-survival 100x60 x${BENCHMARK_ROSTER_SIZE}`,
    () => {
      birthSurvivalPhase(buffers.back, deps);
    },
    BENCH_OPTIONS,
  );

  const claims = birthSurvivalPhase(buffers.back, deps);
  // ⚠️ Phase 3 writes IN PLACE, so iterations 2..N re-apply the same `claims` to a grid the
  // previous iteration already finished (ages advance until MAX_RELEVANT_AGE clamps them; the
  // occupants converge on the first pass). The work per iteration is the same full-grid sweep, so
  // the number is still Phase 3's cost — but "measured against the grid Phase 2 produced" is exact
  // only for the first iteration. Restoring a pristine copy per iteration would add two 6,000-cell
  // typed-array copies to a ~10 µs measurement, i.e. distort it more than the drift does. Diagnostic,
  // never gated (Story 3.7 code review).
  bench(
    `phase3-conflict 100x60 x${BENCHMARK_ROSTER_SIZE}`,
    () => {
      conflictPhase(buffers.back, claims, deps);
    },
    BENCH_OPTIONS,
  );
}

describe('phase split at the NFR-1.1 baseline (diagnostic, not gated)', () => {
  benchPhases(100, 60);
});
