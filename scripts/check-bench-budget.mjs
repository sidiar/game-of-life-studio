#!/usr/bin/env node
// Fails CI when the NFR-1.1 frame at the 100x60 x 20-organism baseline exceeds its derived budget
// (AR-43, NFR-1.1, Decision D.2/D.3, RFC-008 Decision 7). Runs after `npm run bench`, against the
// JSON `vitest bench` writes — never against a table scraped from stdout.
//
// Follows check-bundle-size.mjs's shape on purpose: a measurement, a stated budget derived from the
// requirement rather than picked, a printed table on every run, and a non-zero exit. The number is
// visible whether or not it passes, which is what makes a regression legible in a PR diff.
//
// ── THE BUDGET, DERIVED ────────────────────────────────────────────────────────────────────────
//
//   1. NFR-1.1 guarantees 60 FPS at 100x60 with up to 20 organisms. A frame is 1000/60 = 16.67 ms.
//   2. Decision D.2/D.3: at most ONE step() per frame, and a repaint happens ONLY after a step. So
//      the worst frame in a run is exactly one step() plus one repaint — there is no frame that
//      does more, and frames that do no simulation work do not bound anything.
//   3. Therefore the gated quantity is `step() + repaint at 100x60 x 20 organisms <= 16.67 ms`, and
//      the margin RFC-008 Risk 6 asks for is the headroom UNDER that number, not an allowance added
//      on top of it. This script prints the headroom for exactly that reason.
//
// Two derivations considered and rejected, recorded so the next reader does not re-derive them:
//   - NOT 16.67 / 3. The 20 generations/second ladder maximum is one step per 50 ms; frames that
//     run no step do no simulation work at all, so dividing the frame budget by a step rate bounds
//     nothing real.
//   - NOT a per-preset budget. Decision A.4 says the larger grids degrade GRACEFULLY by design and
//     AR-43 gates the baseline only. 150x90 and 200x120 are measured and printed, never gated.
//
// ⚠️ The fixture's shape is part of the budget. Phase 2 costs `cells x organisms x
// rules-until-first-match`, so a cheaper roster is a looser gate with no diff to review. The roster
// is @gol/test-utils' `createBenchmarkRoster(20)` — 20 organisms, 50 rules, 20 distinct colour
// tokens — and `benchmarkRoster.test.ts` pins every one of those numbers so it cannot drift
// silently. docs/implementation-artifacts/performance-baseline-validation.md carries the full
// fixture statement and the measured numbers.
//
// ⚠️ Spec IDs cited in this file are NOT checked by `npm run spec:check` — it reads .ts/.tsx under
// apps/ and packages/ only (CODE_EXT in check-spec-ids.mjs). Spell them by hand, carefully.
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

// 1000 / 60, not a rounded 16.7: the budget is the frame period, and rounding it up would hand the
// gate free headroom that NFR-1.1 never granted.
const FRAME_BUDGET_MS = 1000 / 60;

// Each source is one workspace's `vitest bench --outputJson` file. Both must exist and both must
// carry every task named here, or the run measured less than it claims to have measured.
const SOURCES = [
  {
    label: '@gol/simulation (engine step)',
    file: join('packages', 'simulation', 'bench-results.json'),
    command: 'npm run bench',
    required: [
      'step 50x30 x20',
      'step 100x60 x20',
      'step 150x90 x20',
      'step 200x120 x20',
      'phase1-death 100x60 x20',
      'phase2-birth-survival 100x60 x20',
      'phase3-conflict 100x60 x20',
    ],
  },
  {
    label: 'apps/web (repaint decision)',
    file: join('apps', 'web', 'bench-results.json'),
    command: 'npm run bench',
    required: [
      'repaint-decision 100x60 x20',
      'repaint-dirty-path 100x60 x20',
      'colour-state-reprime 100x60 x20',
      'ref-to-fill-group-build x20',
      'library-filter 1000 organisms',
    ],
  },
];

// The two halves of the worst frame (Decision D.2/D.3). Summed, not measured together: they run in
// different workspaces because the engine has no DOM types and the renderer's decision logic lives
// in apps/web. Both are driven from the SAME fixture (@gol/test-utils' benchmark roster at the same
// preset and the same seed), which is what makes the sum describe one battle.
const GATED_TASKS = ['step 100x60 x20', 'repaint-decision 100x60 x20'];

// Measured, printed, and deliberately NOT gated (Decision A.4 graceful degradation, RFC-008 Risk 6
// on how environment-sensitive large-grid numbers are).
const TRACKED_TASKS = ['step 50x30 x20', 'step 150x90 x20', 'step 200x120 x20'];

/**
 * Every benchmark in one report file, flattened to `name -> mean ms`.
 *
 * Returns null — never an empty map — for anything that means "the benchmark did not really run".
 * That distinction is the whole point: `vitest run` does NOT execute `*.bench.ts`, so a bench file
 * with a typo in it, a renamed task, or a `bench` script that silently stopped running produces no
 * failing test anywhere. An empty or partial report has to be a FAILURE, not a vacuously passing
 * budget — the same rule check-bundle-size.mjs states for an empty asset scrape.
 */
function readReport({ label, file, command }) {
  if (!existsSync(file)) {
    console.error(
      `✖ bench-budget: ${file} not found for "${label}". Run \`${command}\` first — the gate ` +
        `measures the JSON \`vitest bench\` writes, and a missing file means nothing was measured.`,
    );
    return null;
  }

  let report;
  try {
    report = JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    console.error(`✖ bench-budget: ${file} is not valid JSON (${error.message}).`);
    return null;
  }

  const means = new Map();
  for (const reportFile of report.files ?? []) {
    for (const group of reportFile.groups ?? []) {
      for (const benchmark of group.benchmarks ?? []) {
        means.set(benchmark.name, benchmark.mean);
      }
    }
  }

  if (means.size === 0) {
    console.error(
      `✖ bench-budget: ${file} contains zero benchmark results for "${label}". A report with ` +
        `nothing in it is a failure, not a pass — treat it as "the bench file did not run".`,
    );
    return null;
  }

  return means;
}

const means = new Map();
let ok = true;

for (const source of SOURCES) {
  const report = readReport(source);
  if (report === null) {
    ok = false;
    continue;
  }

  for (const name of source.required) {
    const mean = report.get(name);
    if (mean === undefined) {
      console.error(
        `✖ bench-budget: "${name}" is missing from ${source.file}. Either the bench task was ` +
          `renamed (rename it here too) or it stopped running — both are a failure, because a ` +
          `preset nobody measured cannot be a preset that passed.`,
      );
      ok = false;
      continue;
    }
    // NaN is what an unwarmed or zero-iteration benchmark produces, and it compares false against
    // every threshold — so an unguarded `mean > budget` PASSES on a NaN. Reject it explicitly.
    if (!Number.isFinite(mean) || mean <= 0) {
      console.error(
        `✖ bench-budget: "${name}" in ${source.file} has a mean of ${mean}, which is not a ` +
          `measurement. A NaN mean silently passes every numeric comparison — fail loudly instead.`,
      );
      ok = false;
      continue;
    }
    means.set(name, mean);
  }
}

if (!ok) {
  console.error('\n✖ bench-budget: the measurement itself is unusable — nothing was gated.');
  process.exit(1);
}

const gatedParts = GATED_TASKS.map((name) => ({ name, mean: means.get(name) }));
const frameMs = gatedParts.reduce((total, part) => total + part.mean, 0);

console.log('NFR-1.1 frame at 100x60 x 20 organisms  (Decision D.2/D.3: one step + one repaint)');
for (const part of gatedParts) {
  console.log(`  ${part.name.padEnd(30)} ${part.mean.toFixed(3)} ms`);
}
console.log(`  ${'= frame'.padEnd(30)} ${frameMs.toFixed(3)} ms`);
console.log(`  ${'budget (1000 / 60)'.padEnd(30)} ${FRAME_BUDGET_MS.toFixed(3)} ms`);

if (frameMs > FRAME_BUDGET_MS) {
  console.error(
    `\n✖ bench-budget: the 100x60 x 20-organism frame is ${frameMs.toFixed(3)} ms, exceeding its ` +
      `${FRAME_BUDGET_MS.toFixed(3)} ms budget by ${(frameMs - FRAME_BUDGET_MS).toFixed(3)} ms.\n` +
      `  The budget does NOT move: it is 1000/60 derived from NFR-1.1's 60 FPS guarantee, not a ` +
      `number chosen because it passed.\n` +
      `  Phase 2 is ~98% of the cycle (see the phase split below) — start there, and read\n` +
      `  docs/implementation-artifacts/performance-baseline-validation.md, which records what has ` +
      `already been measured and rejected.`,
  );
  ok = false;
} else {
  const headroom = FRAME_BUDGET_MS - frameMs;
  console.log(
    `✓ within budget (${headroom.toFixed(3)} ms headroom, ` +
      `${((headroom / FRAME_BUDGET_MS) * 100).toFixed(1)}% of the frame).`,
  );
}

console.log('\nTracked, not gated (Decision A.4 — larger grids degrade gracefully by design)');
for (const name of TRACKED_TASKS) {
  console.log(`  ${name.padEnd(30)} ${means.get(name).toFixed(3)} ms`);
}

console.log('\nDiagnostic');
for (const name of [...means.keys()].filter(
  (name) => !GATED_TASKS.includes(name) && !TRACKED_TASKS.includes(name),
)) {
  console.log(`  ${name.padEnd(30)} ${means.get(name).toFixed(3)} ms`);
}
console.log('');

if (!ok) process.exit(1);
