---
baseline_commit: 05827c3
---

# Story 3.7: Performance Harness & Coverage-Gate Flip

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a developer,
I want benchmarks and the strict coverage gates active,
so that performance and test rigor are enforced from here on, not promised.

## Acceptance Criteria

From `epics.md#Story 3.7: Performance Harness & Coverage-Gate Flip`, decomposed into what a reviewer
can check independently. AC6–AC15 are repo-derived: they come from obligations shipped code and
`deferred-work.md` already name — the four `vitest.config.ts` comments that say *"it flips on in
Story 3.7"*, `architecture.md`'s **M12** (*"re-measured with Story 3.7's harness"*), and five
deferred entries that say *"Story 3.7's to measure"*.

1. **A `vitest bench` harness measures the assembled `step()` across all four grid presets ×
   20 organisms** — {50×30, 100×60, 150×90, 200×120} (AR-43, Decision A, H-9). The subject is
   `threePhaseStep` (the public step contract Story 3.6 fixed), driven through the real
   `compileSession` + `GridBuffers` + `swapGridBuffers` cycle — never a hand-built evaluator and
   never a phase in isolation, or the number stops being the thing NFR-1.1 constrains.

2. **The fixture is deterministic and every parameter that moves the number is pinned and
   written down** — `FIXED_SEED`, the exact roster (20 organisms, **and their total rule count**),
   the initial fill, and the cycle count. ⚠️ Rule count per organism is a *gate parameter*: Phase 2
   cost is `cells × organisms × rules-until-first-match`. A future story that swaps the fixture for
   cheaper organisms silently loosens the gate, so the report states the fixture's shape as the
   thing being measured.

3. **The repaint half is measured where it can be measured honestly, and labelled as what it is**
   (**FD2**). jsdom's `getContext()` is unimplemented (the `Not implemented: HTMLCanvasElement's
   getContext()` lines in every `web:test:coverage` run are this), so a "repaint benchmark" under
   Vitest measures our batching loop against a double, **not** browser rasterization. Whatever is
   measured says so in the report; nothing claims a browser paint number that was not taken in a
   browser.

4. **The 100×60 × 20-organism baseline hard-gates CI against a budget DERIVED from the
   requirement, with the derivation written down** (NFR-1.1, Decision D.2, RFC-008 Decision 7).
   The number is derived and cited, never picked: see **The budget, derived** below. ❌ No round
   number chosen because it passes.

5. **The larger presets are measured and recorded, never gated** (AR-43, Decision A.4 graceful
   degradation, RFC-008 Risk 6 — large-grid numbers are environment-sensitive).

6. **The gate fails loudly on a vacuous result.** Zero benchmark results, a missing preset, an
   unparsable output file or a NaN mean is a **failure**, not a pass with nothing measured. This is
   `check-bundle-size.mjs`'s own rule (*"treat as a failure, not an empty (and vacuously passing)
   budget"*) and it is the single most likely way this story ships a green stage that measures
   nothing.

7. **The benchmark task is NEVER Turborepo-cached**, and `npm run ci` and
   `.github/workflows/ci.yml` carry the new stage in the same position. A cached benchmark replays
   an old number as if it were a fresh measurement — `e2e` is already `"cache": false` for the
   adjacent reason; `test:coverage` stays cached (it is deterministic).

8. **The coverage thresholds flip on** (AR-39, NFR-5.1, RFC-008 Decision 3):
   `packages/simulation` and `packages/domain` **≥ 90%**, `packages/persistence` **~80%**,
   `apps/web` **no gate** (the Metric 4 counter-metric — do not add one). The four
   `vitest.config.ts` comments that promise this story are rewritten to describe what shipped.

9. **⚠️ The coverage gate must be able to SEE a file no test imports.** With the config as it
   stands today it cannot, and a ≥90% threshold on top of it would gate only the files that are
   already tested. **Measured, on this tree** (probe file added to `packages/domain/src`, then
   removed):

   | config | result |
   |---|---|
   | as shipped (no `coverage.include`) | `Statements 100% (73/73)` — the untested file is **absent from the report entirely** |
   | `--coverage.include='src/**/*.ts' --coverage.exclude='**/*.test.ts'` | `Statements 96.05% (73/76)`, the file listed at **0%** |

   Vitest 4 reports only files loaded during the run unless `coverage.include` says otherwise. Fix
   the include set for the three gated packages, or the gate is a floor on the tested subset rather
   than on the package. (This is also why `packages/simulation/src/index.ts`, `strategy/claims.ts`
   and `engine/rule.ts` are missing from today's coverage table — the first is never imported by a
   test, the other two are type-only and erase to nothing.)

10. **`passWithNoTests` is removed from every package that now has tests** (`domain`, `simulation`,
    `test-utils`; `apps/web`'s own config carries it too — **FD4**). Its comment says *"No engine
    code exists yet"*, which stopped being true in Story 3.1. A package whose entire suite is
    deleted or mis-globbed must fail, not pass green.

11. **`@gol/test-utils` gets an explicit, recorded coverage decision.** AR-39 does not name it, and
    it currently sits at **93.56% stmts / 88.37% branches / 96.59% lines** — a blanket 90 applied
    across `packages/*` reddens CI on the fixtures package on the day it lands. Decide, record the
    reason, and do not discover it from a red pipeline.

12. **M12's per-cell guards are re-measured with this harness and the numbers recorded** —
    `architecture.md` M12 states the operator-dictionary and `Object.hasOwn` selector guards cost
    **+0.019 ms/cycle** and **+0.091 ms/cycle**, and that after Story 3.4's compile-time sweep they
    *"should be re-measured with Story 3.7's harness"*. ⚠️ **Measure and PROPOSE; do not remove.**
    M12 is an authority-doc decision owned by RFC-004, `firstSatisfiedBy` is public API that Story
    4.15 will call with a draft organism that never went through `compileSession`, and amending an
    authority doc is Sidiar's call (the M14/M15 precedent).

13. **The deferred items that name this story are measured, and each gets a number in the report**
    (`deferred-work.md`): Phase 2's per-pair `CellSubject` allocation and Phase 1's scan for
    organisms with no `die` rule (3.5 review); `groupByColourState`'s per-frame allocation profile
    (1.8 review); `drawFull`'s O(cells) colour-state re-prime (2.3 review) — **and confirm Story
    3.8's loop will call `draw`, not `drawFull`**, which that entry asks for explicitly; the dirty
    path's four-bar grid-line restoration (2.3 review); `<OrganismSearchAdd>`'s unmemoised library
    scan (2.10 review). A measured "no change needed" closes an entry as well as a fix does.

14. **A benchmark report lands as a repo document** (RFC-008 Decision 7 — *"results are written to
    a benchmark report"* — Metric 5). Same shape as `palette-cvd-validation.md`: the reproduction
    command first, the numbers second, the machine and Node version stated, and a note on how much
    of the spread is hardware. It lives at `docs/implementation-artifacts/` **root** (a cross-epic
    artifact, like the two existing validation docs — CLAUDE.md), not in an epic folder.

15. **If the measured baseline misses the derived budget, the budget does not move.** Sidiar's
    standing preference: when a gate is not met, change the gate's *mechanism* or fix the code —
    never repeatedly relax the threshold. See **FD6** for exactly what this story is allowed to do
    and where it must stop and ask. ❌ No "temporarily raised to 25 ms", no `skip`, no gate that
    warns instead of failing.

## Tasks / Subtasks

- [x] **Task 1 — Read before designing** (AC: 1, 4, 15)
  - [x] Read **Dev Notes → Measured before you start** end to end. The headline number is that the
        NFR-1.1 baseline currently costs **~13 ms/step on a fast dev Mac with zero repaint**, and
        **99% of it is Phase 2**. This story is far more likely to be *"the harness proves we miss
        the budget"* than *"the harness confirms we make it"*. Plan for that outcome first.
  - [x] Read **FD1–FD6** and record the option taken and *why* in the Dev Agent Record.
  - [x] Read `scripts/check-bundle-size.mjs` in full. It is the repo's only existing
        measure-then-gate script and the shape to follow — including its vacuous-result guard and
        its comment discipline (every number traceable to a measurement).
  - [x] Read `deferred-work.md`'s *"the bundle gate moves off absolute budgets"* entry. It is the
        accepted design for a committed-baseline ratchet in this repo, and **FD1** decides how much
        of it this story reuses. ⚠️ **Implementing the bundle-gate change itself is NOT this
        story** — that entry says "implementation deferred to its own story".

- [x] **Task 2 — The engine bench harness** (AC: 1, 2)
  - [x] Add the bench file(s) and a `bench` script. `vitest bench` picks up
        `**/*.{bench,benchmark}.?(c|m)[jt]s?(x)` — ⚠️ **`vitest run` does NOT run them**, so a
        broken bench is invisible to `npm test`.
  - [x] Build the 20-organism roster (**FD5**) with distinct ids and distinct `dominance`.
  - [x] Drive the full cycle: `createGridBuffers(createGrid(cols, rows))` →
        `threePhaseStep(front, back, deps)` → `swapGridBuffers` (Story 3.6 fixed this contract;
        `deps` is `{ ...compileSession(roster), organisms, rng }` with **no construction step**).
  - [x] Warm up before measuring — the first iterations run in the interpreter tier.

- [x] **Task 3 — The repaint half** (AC: 3; **FD2**)
  - [x] Decide what is measurable off-browser, measure that, and label it precisely in the report.
  - [x] ⚠️ If any bench lands under `apps/web`, check `eslint.config.mjs` first — see **Trap 8**.

- [x] **Task 4 — The CI gate** (AC: 4, 5, 6, 7)
  - [x] Write the derivation of the budget into the gate itself, the way `check-bundle-size.mjs`
        writes its formula into the entry it governs.
  - [x] Vacuous-result guard (AC6). Prove it: run the gate against an empty/absent results file and
        show it exits non-zero.
  - [x] Wire `turbo.json` (`"cache": false`), `package.json`'s `ci` chain, and
        `.github/workflows/ci.yml` — **the workflow's own header comment requires the stage order to
        stay in lockstep with `npm run ci`.**

- [x] **Task 5 — The coverage-gate flip** (AC: 8, 9, 10, 11)
  - [x] Fix the include set first, **then** add thresholds — in that order, or you will set a
        threshold against a number that does not mean what you think it means (AC9).
  - [x] Re-run coverage per package and record the real post-`include` numbers. They will be
        **lower** than today's table for at least `@gol/simulation` (its `index.ts` enters the
        denominator).
  - [x] Rewrite the four "flips on in Story 3.7" comments to describe what shipped.
  - [x] Decide `thresholds.perFile` (**FD4**) and `@gol/test-utils` (AC11).

- [x] **Task 6 — M12 re-measurement** (AC: 12)
  - [x] Measure the two guards against the harness (a local branch that removes them, measured and
        then reverted — the guards themselves stay).
  - [x] Record both numbers and a recommendation in the Dev Agent Record and the report. **Do not
        remove them and do not amend M12.** *(As written, this held until the FD6 halt; Sidiar's
        mid-run authorization of FD7 then covered the M12 amendment — see the Dev Agent Record.
        Neither guard was removed.)*

- [x] **Task 7 — The deferred perf items** (AC: 13)
  - [x] Measure each named item. Record a number per item, and for each: fix, or "measured, not
        worth it", with the number that says so.
  - [x] Any optimization taken must leave the Conway goldens, the conflict goldens and the property
        tests green **unchanged** — an engine change that needs a golden edited is a semantics
        change, not an optimization, and it is out of scope here (**FD6**).

- [x] **Task 8 — The report** (AC: 14)
  - [x] Write `docs/implementation-artifacts/performance-baseline-validation.md`.
  - [x] Reproduction command first, verified by actually running it from a clean shell.

- [x] **Task 9 — Verification** (AC: all)
  - [x] `npm run ci` **redirected to a file, never piped** (`npm run ci > /tmp/ci.log 2>&1; echo $?`).
        A pipe reports the *pipe's* exit code and has already masked a real failure in this repo.
  - [x] Mutation-check the new gates: break the perf budget (temporarily inflate the fixture),
        break coverage (temporarily delete a test file) — each must redden, by name. A gate nobody
        has seen fail is not known to work.
  - [x] Record every command and its actual result in the Dev Agent Record.

### Review Findings

Code review 2026-09-10 (Fable, three parallel adversarial layers over an Opus implementation).
Patches landed as their own commit on the story branch; the one `decision-needed` item is a
question for Sidiar on the PR and is **not** resolved here.

- [ ] [Review][Decision] **RFC-004 still describes the pre-FD7 hot path — amend, or record the
      divergence?** `architecture.md` M12's amendment names RFC-004 as owner, and both precedents
      (M14 `a645d31`, M15 `75dbccd`) amended RFC-004 in the same commit; this story did not.
      RFC-004 §1.4 (reference code, "+0.091 ms/cycle"), §2.3/§3.5 (evaluators as
      `firstSatisfiedBy(rules.filter(...))` closures) and Risk 2 ("one primitive underlies all
      decisions") now contradict `compileEvaluators.ts`. Whether FD7's authorization covered
      RFC-004 is not knowable from the repo. Options: (a) amend §1.4/§2.3/§3.5/Risk 2 in the
      M14/M15 style on this branch; (b) leave RFC-004 and add a Minor-Resolution-style pointer in
      it to M12's amendment; (c) record the divergence in `deferred-work.md` only (done, as the
      holding position).
- [x] [Review][Patch] `compileSession` read `survivalRules` twice (validate pass, compile pass); an
      accessor-backed organism — the shape its own read-counting test uses — could hand the
      compiler an array the sweep never saw. Now read once and the same reference is validated,
      compiled and age-scanned; `compileOrganism` takes the rule list. Three tests pin the FD7
      boundary (`toString` property, `ne` operator, single read)
      [packages/simulation/src/session/compileEvaluators.ts]
- [x] [Review][Patch] M15's JSDoc had been detached from `OrganismEvaluators` by the inserted
      `CellPredicate`/`CompiledBirthSurvivalRule` types [compileEvaluators.ts]
- [x] [Review][Patch] The repaint fixture collapsed: stepping the seeded fill 50 cycles leaves a
      7-organism still life by cycle 10 (7 groups, 502 cells, static to cycle 200), so the gated
      repaint half measured an 8%-occupied frozen dish while claiming a live one. Replaced with the
      pinned 30% fill + seeded ages across all eight shades, asserted at every (token, shade) group
      the roster can produce (55 — only 5 of 20 organisms are aging-enabled, so "~160" was never
      reachable). `repaint-decision` 0.047 → ~0.07 ms; frame 5.6–5.8 ms, 65–67% headroom
      [apps/web/lib/canvas/repaintDecision.bench.ts]
- [x] [Review][Patch] `turbo run bench` ran the two summed benches concurrently; now
      `--concurrency=1` [package.json, turbo.json, .github/workflows/ci.yml]
- [x] [Review][Patch] Gate script: report-shape guard, duplicate-task-name guard, and
      `GATED_TASKS`/`TRACKED_TASKS ⊆ required` asserted by name (was an accidental `TypeError`)
      [scripts/check-bench-budget.mjs]
- [x] [Review][Patch] `COLS`/`ROWS` hardcoded while `BENCHMARK_GATED_PRESET` was read by nothing;
      the bench now derives them from the preset table and names its tasks by the gated label
      [repaintDecision.bench.ts]
- [x] [Review][Patch] `BENCH_OPTIONS` duplicated across the two summed benches → shared
      `BENCHMARK_RUN_OPTIONS` in `@gol/test-utils`, pinned by test [benchmarkRoster.ts, both benches]
- [x] [Review][Patch] `distinctiveRule` shared `range` tuples with the deep-frozen template →
      typed `cloneCondition`; test compares against the template [benchmarkRoster.ts]
- [x] [Review][Patch] Preset label ↔ dims and the gated label's presence pinned by test
      [benchmarkRoster.test.ts]
- [x] [Review][Patch] `BENCHMARK_COLOR_TOKENS` claimed a guard that did not cover it →
      `paletteTokenUsage.test.ts` now checks the benchmark roster's 20 tokens are real and distinct
- [x] [Review][Patch] `*.bench.tsx` was outside both the web coverage exclude and the ESLint
      exemption [apps/web/vitest.config.mts, eslint.config.mjs]
- [x] [Review][Patch] Phase-3 diagnostic mutates its input across iterations — documented as
      diagnostic-only with the reason a pristine copy is not restored [threePhaseStep.bench.ts]
- [x] [Review][Patch] Report said "the engine ships unchanged from `05827c3`" (false after FD7) and
      contradicted itself on A.4 (6.71 vs 6 ms is ~12%, not "a few percent") — both fixed
      [performance-baseline-validation.md]
- [x] [Review][Patch] Stale text after FD7: Completion Notes "gate is currently red", File List
      "one blocking", Task 6 / "What NOT to build" vs the authorized M12 amendment, deferred-work's
      3.5 closure quoting pre-FD7 numbers unlabelled, its 2.10 closure claiming
      `<OrganismSearchAdd>` "does not exist" (it is `OrganismRoster.tsx:302`), project-context's
      old six-stage CI list and "5.9 of 6.7 = 98%" arithmetic
- [x] [Review][Patch] Three code comments quoted repaint numbers different from the report they
      cite — now aligned to the report, taken on the corrected fixture
      [colourStateGroups.ts, gridRenderer.ts, OrganismRoster.tsx]
- [x] [Review][Defer] `bench-results.json` freshness (same class as the bundle entry) — deferred,
      pre-existing class
- [x] [Review][Defer] Gate reads `mean`; `p99`/`max` discarded — deferred, mechanism question
- [x] [Review][Defer] `createBenchmarkFill` argument validation — deferred, caller-bug class
- [x] [Review][Defer] apps/web `benchmark.exclude` — deferred, no such file exists
- [x] [Review][Defer] `repaint-dirty-path` is an upper bound — labelled, live-frame number is 3.8's

Dismissed as noise (11): "A18 Pro" (confirmed via `sysctl`); Vitest 4's default
`coverage.exclude` is `[]`, so nothing was replaced; a per-rule guard inside `compileCondition`
(superseded by the read-once fix; would add an unreachable branch under a per-file 90% gate);
`Exclude<Action, 'die'>` (recorded Sidiar decision); the gated repaint variant (deliberate,
documented); spread wording; the hardcoded "~98%" in the failure string; test-title nits;
`agingEnabled` redundancy; RFC-008 Decision 9's pipeline diagram (flagged below, no amendment);
project-context carrying a machine number (the story mandated that update).

Verification after patches: `typecheck` → `lint` (1 pre-existing warning) → `format:check` →
`spec:check` → `boundary:check` → `test:coverage` (domain 99, simulation 370, persistence 82,
test-utils 89, web 935; every threshold met) → `bench` (`0 cached`, serialized) → `bench:check`
all exit 0. The gate was also seen to refuse the empty report a FAILED bench suite writes
("contains zero benchmark results" → exit 1) — a real-failure mutation check on top of the six
synthetic ones above.

## Dev Notes

### Constraints the developer MUST follow

- **Scope: the harness, the gates, and the measurements.** The RAF loop, its accumulator and the
  delta clamp are **3.8**. Colour-state batching and `agingEnabled`'s render effect are **3.9**. The
  React bridge and population stats are **3.10**. Extinction auto-pause is **3.15**. The bundle
  gate's move to a growth ratchet has **its own story** (`deferred-work.md`) — this one may reuse
  its accepted *design*, not implement it.
- **No classes, no `this`, no module-level mutable state in `packages/*`** (AR-16). A bench file is
  still `packages/simulation` code.
- **No DOM types in `packages/*`.** `tsconfig.base.json` is `lib: ["ES2022"]`. A bench that needs a
  canvas is in the wrong package (**FD2**).
- **Nothing lands in, or is imported backwards from, `src/engine/`.** `eslint.config.mjs` +
  `scripts/check-engine-boundary.mjs` enforce it and must not be widened for a benchmark.
- **Grid dimensions are parameters, never constants** (Decision A). The four presets are data the
  harness iterates, not four copy-pasted bench bodies with numbers in them.
- **Strict TS, no escape hatches.** No `any`, no `@ts-ignore`, no non-null `!`.
- **File naming: two conventions, and they do not overlap.** TS/TSX under `packages/` and
  `apps/web` is **camelCase, never dotted** (`repositoryFactory.ts`) — a bench file follows it
  (`threePhaseStep.bench.ts`: the `.bench` suffix is the runner's glob, not a dotted name). Node
  gate scripts under `scripts/` are **kebab-case** (`check-bundle-size.mjs`,
  `check-engine-boundary.mjs`, `check-spec-ids.mjs`) — match the neighbours, do not mix the two.
- **Comments explain WHY**, cite the governing ID, and name the failure they prevent. `spec:check`
  fails the build on an ID that resolves to nothing — write them exactly as the specs spell them
  (`AR-43`, `NFR-1.1`, `M12`, `Decision D`). ⚠️ `spec:check` reads `.ts`/`.tsx` under `apps/` and
  `packages/` **only** — a citation inside a new `scripts/*.mjs` is never verified (**Trap 9**).
- **Commit gate stands** — never stage or commit without Sidiar's explicit go-ahead, even on a green
  `npm run ci`. (A story subagent under `implement-next-story` may push to its own `story/*` branch;
  merging is always Sidiar's call.)
- **One proposal at a time.** Where this story hits a decision that is Sidiar's (FD6's escalation,
  M12), surface the single strongest option and wait — a ranked menu of five gets discarded whole.

### What this story is, in one paragraph

Stories 3.1–3.6 built an engine and asserted it was fast; nothing has measured it. Four
`vitest.config.ts` files carry a comment promising this story turns the coverage floor on, and five
entries in `deferred-work.md` plus `architecture.md`'s M12 are parked waiting for a number this
story produces. So the deliverable is two enforcement mechanisms and one document — and, because a
mechanism that has never failed is not known to work, a mutation check on each. The uncomfortable
part is in the next section: the baseline probably does not currently meet NFR-1.1, which makes this
a story about what to do with a measurement, not a story about wiring one up.

### ⚠️ Measured before you start — read this first

Taken on this tree at `05827c3`, via a temporary probe under Vitest (Node 24.16.0, Apple silicon,
no repaint, roster = 20 clones of `CONWAYS_CLASSIC` with distinct ids/dominance — **2 rules each**,
which is a *cheap* roster). Treat these as an order-of-magnitude briefing to be reproduced by the
real harness, not as results to copy into the report.

| measurement | ms/step |
|---|---|
| 50×30 × 20 organisms | 3.1 |
| **100×60 × 20 organisms (the NFR-1.1 baseline)** | **13.0** |
| 150×90 × 20 organisms | 31.0 |
| 200×120 × 20 organisms | 57.0 |

Phase split at the baseline: **Phase 1 `deathPhase` 0.12 ms · Phase 2 `birthSurvivalPhase` 12.9 ms
· Phase 3 `conflictPhase` 0.01 ms.** Scaling in roster size at 100×60: 1 organism 0.93 ms,
5 organisms 3.35 ms, 20 organisms 13.0 ms — **linear in organism count**.

Three consequences the story turns on:

1. **Phase 2 is 99% of the cycle**, and `birthSurvivalPhase`'s own doc comment says why: it
   *"evaluates EVERY organism in the roster against EVERY cell"*. Any perf work here is Phase 2
   work; measuring the others is confirmation, not search.
2. **Cost is independent of how full the grid is.** Measured at 0% / 5% / 30% / 90% fill: 13.7 /
   14.0 / 14.3 / 14.2 ms. An **empty** 100×60 grid with 20 organisms in the roster burns the same
   ~13 ms/cycle as a full one. This kills two intuitions at once — a sparse fixture is not a
   "best case", and an extinct-but-not-yet-stopped grid is not free.
3. **13 ms of a 16.7 ms budget, on a fast laptop, before any repaint.** GitHub's `ubuntu-latest`
   runners are materially slower than an M-series Mac on single-threaded JS. Expect the honest CI
   number to be well over the frame budget. RFC-008 Risk 6 asks for a *generous* margin; there is
   currently none.

Also worth knowing: `architecture.md` **Decision A.4** predicted *"~6 ms at 6,000 cells → ~24 ms at
24,000"*. Measured, the same points are ~13 ms and ~57 ms — the shape (~linear) holds, the constant
is ~2.2× worse. A.4's estimate was never measured; this story is the first thing that can say so.
**That is a Spec-conflict flag, not a defect** — see below.

### The budget, derived

Write this derivation (or a better one you can defend) into the gate:

- **NFR-1.1** guarantees 60 FPS at 100×60 with up to 20 organisms → a frame is **16.67 ms**.
- **Decision D.2/D.3**: at most **one `step()` per frame**, and a repaint happens **only after a
  step**. So the worst frame in a run is exactly one `step()` + one repaint.
- Therefore the gated quantity is **`step()` + repaint at 100×60 × 20 organisms ≤ 16.67 ms**, and
  the margin RFC-008 Risk 6 asks for comes out of that, not off the end of it.
- **Not** `16.67 / 3` (the 20 gen/sec ladder max is one step per 50 ms — frames without a step do
  no simulation work at all), and **not** a per-preset budget (Decision A.4: larger grids degrade
  gracefully by design; AR-43 gates the baseline only).

If you derive it differently, say so explicitly and record the alternative you rejected — the
number is the story's most reusable output and every later story inherits it.

### Forced decisions (record the option taken and why in the Dev Agent Record)

**FD1 — What mechanically hard-gates CI on a benchmark. This is the story's biggest decision.**
`vitest bench` prints a table and asserts nothing; tinybench has no threshold API.
- **(a) A plain `*.test.ts` with a timing assertion.** Simplest, runs inside the existing coverage
  stage, no new script or CI wiring. But it puts a wall-clock assertion inside the unit suite, which
  is where flakes are least tolerable, and it makes the number invisible (a pass prints nothing).
- **(b) `vitest bench --outputJson` + a gate script over the JSON, budget derived from NFR-1.1.**
  Mirrors `check-bundle-size.mjs` exactly — a measurement, a stated budget, a printed table, a
  non-zero exit. The number is visible on every run, which is what makes a regression legible.
- **(c) (b), plus committed per-preset baselines and a growth ratchet** for the *tracked* presets —
  the design `deferred-work.md` records as accepted for the bundle gate ("CI fails when a route
  grows more than a fixed delta; updating a baseline is a one-line diff visible in PR review").
- **(d) Gate nothing; publish numbers only.** Rejected on AR-43's face ("100×60 baseline hard-gates
  CI"), recorded so the record shows it was considered.

*Recommendation: **(b)**, with (c) deferred behind a measurement.* (b) satisfies AR-43 with one
mechanism. A ratchet on absolute milliseconds across heterogeneous CI runners has a real
false-positive problem that the bundle gate (byte-exact, hardware-independent) does not have — so
**measure the run-to-run spread on CI first** (run the bench stage a handful of times on the branch
and record the variance in the report) and only add the ratchet if the noise floor is small enough
to make it meaningful. Say which way the measurement went.

**FD2 — What "repaint" means when there is no browser.**
AR-43 and `epics.md` say the harness measures *"`step()` + repaint"*.
- **(a) Engine only.** Bench `threePhaseStep`; state plainly that browser paint is not measured
  here and that the e2e layer is where a real canvas exists.
- **(b) Engine + the renderer's *decision* logic** — `groupByColourState`, `selectDirtyCells`,
  `colourStateAt`, the `refToFillGroup` LUT — benched in `apps/web` against a no-op `Canvas2D`
  double. This is exactly what RFC-008 Decision 6 says to test ("the renderer's brain… avoid
  pixel/snapshot tests"), it covers two of AC13's deferred items directly, and it is honest as long
  as the label says "batching + dirty-region cost, not rasterization".
- **(c) A real repaint in Playwright.** The faithful answer and the only one that measures a GPU.
  Rejected for this story: the `e2e` job is already the slow one, browser timing on shared runners
  is the flakiest signal available, and RFC-008 Risk 6 already argues against it.

*Recommendation: **(b)**, with the label spelled out in the report and in the bench file's own
comment.* It is the only option that produces a number for the deferred render items AC13 names.

**FD3 — Four near-identical `vitest.config.ts` files, or a shared base.**
`deferred-work.md` (1.2 review) parks this decision here by name: *"any future coverage-config
change (e.g. the Story 3.7 gate flip) needs editing in four places… best considered alongside the
Story 3.7 coverage-gate work"*.
- **(a) Keep four files.** RFC-008 Decision 9 is explicit ("each package owns its `vitest.config`")
  and project-context says config lives at the level it applies to. **And the premise dissolves in
  this story:** after the flip the four files are no longer byte-identical — they carry different
  thresholds, different `passWithNoTests`, different environments. Duplication that has become
  divergence is not duplication.
- **(b) A shared `vitest.config.base.ts` at the repo root** that each package extends.

*Recommendation: **(a)**, and close the deferred entry with that reasoning rather than leaving it
open a third time.* If you take (b), it must not smuggle a threshold onto `apps/web` by default —
the no-gate there is a deliberate counter-metric (RFC-008 Decision 3, Alt 5), not an oversight.

**FD4 — `thresholds.perFile`, and `passWithNoTests`.**
- Aggregate thresholds let one 0%-covered file hide behind a package at 99%. `perFile: true` closes
  that, and **costs nothing today**: `@gol/simulation` and `@gol/domain` are at 100% on every file,
  and `@gol/persistence`'s worst file is 97.43% against an ~80% gate.
- The counter-argument is future friction: a legitimately hard-to-cover file then blocks a story
  that has nothing to do with it.
- ⚠️ Do **not** use `coverage.thresholds.autoUpdate`. It rewrites the config file with whatever the
  run produced, which turns the gate into a record of the last run rather than a floor.
- `passWithNoTests` (AC10) is a separate switch on the same theme: with it on, a mis-globbed
  `include` is a green run over zero tests. `apps/web` has it on too — decide it deliberately rather
  than leaving it because it was already there.

*Recommendation: `perFile: true` on `simulation`/`domain` (free today, and it is the mechanism the
aggregate is a proxy for), aggregate on `persistence`, `passWithNoTests` removed everywhere a suite
now exists.* Record the call either way.

**FD5 — Where the 20-organism fixture lives.**
`@gol/test-utils` exports `createMockOrganisms()` (3 AR-45 organisms) and `CONWAYS_CLASSIC` — four
organisms, not twenty. Stories 3.9 (batch rendering), 3.16 (Play-mode resize) and 4.15 (preview) all
want a "realistic roster" too.
- **(a) Build it in the bench file.** Local, obvious, no new public fixture surface.
- **(b) Export a `createBenchmarkRoster(n)` from `@gol/test-utils`.** Reusable, and the package
  exists for exactly this (AR-5).

*Recommendation: **(b)** if it is a clean five lines, **(a)** otherwise — but either way pin the
roster's total rule count in an assertion or a comment (AC2).* ⚠️ **Trap:** cloning an AR-45 mock
organism under a new id silently breaks its `organismType` conditions — the target id is no longer
in the roster, so it compiles to `NO_MATCH_REF` and the clone becomes both cheaper and semantically
different from the organism you thought you copied (Decision E.3, Story 3.4). If the roster mixes
mocks, keep their targets in it.

**FD6 — What this story does when the baseline misses the budget. Read this before Task 7.**
Given the numbers above, plan on this branch being taken.
- **Allowed here, in this order:** (1) measure and record; (2) apply the two Phase-2/Phase-1
  optimizations `deferred-work.md` already names as this story's to measure — a reused scratch
  `CellSubject` (needs a seam: `CellSubject` is `readonly`) and a "has death rules" flag to skip
  Phase 1's scan for organisms like Conway's Classic that have no `die` rule; (3) re-measure and
  record the delta for each, separately.
- **Not allowed:** relaxing the budget, gating a preset other than 100×60, softening the gate to a
  warning, shrinking the fixture, or gating `step()` alone if FD2 chose to include a repaint number.
  *(Sidiar's standing preference: change a gate's mechanism, never repeatedly relax its threshold.)*
- **Out of scope:** the algorithmic fix — not evaluating every organism at every cell (e.g.
  narrowing the candidate set per cell from the compiled rules). It is the largest lever by far and
  it is a **semantics-bearing change** to M10/Decision C behaviour that would need its own story and
  its own goldens. If the numbers point there, say so and stop.
- **If it still misses after (2):** raise it as a Spec-conflict flag — NFR-1.1's guarantee against a
  measured baseline — present **one** recommendation, and **wait**. Do not land a gate you know is
  red, and do not land a budget you widened to make it green.

### Traps

1. **A cached benchmark is a lie.** Turbo will happily replay a bench task's stdout from cache and
   report `>>> FULL TURBO` — the exact thing that happened to this story's own coverage probe while
   it was being written. `"cache": false`, like `e2e`.
2. **`vitest run` does not execute `*.bench.ts`.** A bench file with a typo in it is invisible to
   `npm test` and to the whole unit suite. The gate's vacuous-result guard (AC6) is what catches it.
3. **jsdom has no canvas.** `getContext()` returns `null` and logs *"Not implemented"*; that is
   already happening on every `web` test run. A repaint benchmark there measures the double.
4. **Untested files are invisible to coverage today** (AC9, measured). Set `include` *before*
   setting a threshold, or the threshold is meaningless in the direction that matters.
5. **A cheaper fixture is a looser gate.** 20 organisms × 2 rules is the cheapest legal reading of
   AR-43's "20 organisms". The fixture's rule count belongs in the report as a gate parameter.
6. **Phase 2 does not care how full the grid is** (measured). Do not build an "empty grid"
   micro-bench expecting a floor; there isn't one.
7. **Local green ≠ CI green.** project-context has a whole section on this, from a WebKit failure
   that was green locally for three stories. Push the branch and read `gh run list`; do not infer.
8. **ESLint's `@gol/test-utils` ban in `apps/web` exempts `*.test.*`, `*.spec.*` and `e2e/**` —
   not `*.bench.ts`.** A bench under `apps/web` importing `@gol/test-utils` or `@/test-support`
   fails lint. Extending that `ignores` list is a deliberate change to a boundary rule (and the
   config warns, twice, that the three near-identical blocks are **not** interchangeable) — if you
   extend it, extend the right one and say why in the comment.
9. **`spec:check` never reads `.mjs`.** `CODE_EXT` is `.ts`/`.tsx` under `packages/` and `apps/`. A
   spec ID cited in a new `scripts/*.mjs` gate is unverified forever — fine, as long as you know it
   and do not assume the gate is watching your citations.
10. **Piping swallows the exit code.** `npm run ci | tail` reports *tail's* status. This has already
    masked a real `format:check` failure in this repo. Redirect and echo `$?`.
11. **`coverage.all` is gone in Vitest 4** — `coverage.include`/`coverage.exclude` are the
    mechanism. Verify against the installed `vitest@4.1.10` types, not a blog post.
12. **Coverage numbers will drop when `include` lands.** `@gol/simulation`'s `index.ts` (a large
    re-export barrel no test imports) enters the denominator. A drop from 100% is expected and is
    the gate starting to do its job — do **not** "fix" it by adding a test that imports the barrel
    for the sake of the number (RFC-008 Risk 1: coverage-padding tests are rejected in review).

### Spec-conflict flags (project-context: surface new conflicts, don't silently pick one)

- **🟡 `architecture.md` Decision A.4's performance model vs. measurement.** A.4 states step cost
  "~6 ms at 6,000 cells → ~24 ms at 24,000". Probe: ~13 ms and ~57 ms. The *shape* A.4 asserts
  (~O(N), graceful degradation) holds; the constant does not. A.4 is a Cross-Cutting Decision and
  correcting it is Sidiar's call — **flag it with the real numbers and propose the amendment; do not
  edit `architecture.md` from a story.**
- **🟡 `epics.md`'s AC for this story says the benchmark measures "`step()` + repaint".** Off-browser
  there is no repaint to measure (FD2). Whatever FD2 decides, the AC as written cannot be satisfied
  literally — amend it *in the open*, in the Dev Agent Record, the way Story 3.3 amended its
  dense↔sparse↔typed AC (the M13 precedent).
- **🟡 AR-39 does not name `@gol/test-utils`** while `packages/*` is what the coverage prose talks
  about (AC11). State the decision rather than inheriting one from a glob.
- **⚪ Adjacent, not this story's:** `deferred-work.md` records that AR-3 / RFC-003:48/253/309 and
  `epics.md:159/:371` still quote the pre-measurement "~300KB" bundle figure, and assigns that
  reconciliation to the bundle-ratchet story. Do not fold it in here.

### What NOT to build

- ❌ No RAF loop, accumulator, `msPerCycle` or `requestAnimationFrame` anywhere (Story 3.8).
- ❌ No extinction check, auto-pause or run status (Story 3.15) — and note the counter-intuitive
  companion rule the goldens already pin: still-lifes, oscillators and gliders **keep running**.
- ❌ No population counts (M2, Story 3.10) — a derived view at ≤10 Hz, never engine state.
- ❌ No colour-state batching changes for their own sake (Story 3.9). Measuring
  `groupByColourState` is in scope; redesigning it is not, unless a number justifies it and the
  goldens stay untouched.
- ❌ No Web Worker. It is the documented escape hatch, not a tool to reach for (Decision A.4,
  RFC-002) — if the baseline misses, FD6 is the path, not a worker.
- ❌ No `apps/web` coverage gate (RFC-008 Decision 3 / Alt 5 — the counter-metric is deliberate).
- ❌ No bundle-gate rework (its own story).
- ❌ No amendment to `architecture.md`, RFC-004 or RFC-008. Flag; Sidiar decides. *(Superseded
  for M12 only, by Sidiar's explicit mid-run authorization of FD7 — recorded in the Dev Agent
  Record. RFC-004 and RFC-008 were not amended; see the Review Findings for the open question on
  RFC-004.)*
- ❌ No new runtime dependency. `vitest bench` ships with the installed Vitest; tinybench comes with
  it. Do **not** add `benchmark.js`, `mitata` or a stats package.

### Testing standards summary

- Each package owns its `vitest.config`; e2e stays thin in `apps/web/e2e` (RFC-008 Decision 9).
- Shared fixtures come from `@gol/test-utils` — never hand-roll a fake repo or a seed.
- The FR-5.4 tie-break RNG is injected with `FIXED_SEED` in tests and in the bench fixture; a
  benchmark whose organism placement varies run to run is not a baseline.
- Never pixel/snapshot-test the Canvas (AR-42); the renderer's *brain* is the unit under test.
- Coverage is a floor on the core, not a target everywhere. **Do not write a test whose only purpose
  is to raise the number** — they are rejected in review (RFC-008 Risk 1).
- Any engine change made under Task 7 keeps `conwayGoldens.test.ts`, `conflictGoldens.test.ts` and
  `phasePurity.test.ts` green **without edits**.

### External dependencies / versions

Nothing new. Vitest **4.1.10** (`bench` mode + `@vitest/coverage-v8` 4.1.10 already installed),
Turborepo 2.10.5, Node 24 (`.nvmrc`, `engine-strict=true`). Version policy is
caret-on-current-stable — do not bump anything opportunistically.

## Project Structure Notes

Expected new/changed files (a plan, not a contract — record what actually shipped in the File List):

| path | change |
|---|---|
| `packages/simulation/src/strategy/threePhaseStep.bench.ts` (or similar) | NEW — the engine harness |
| `packages/simulation/package.json` | UPDATE — `bench` script |
| `packages/{domain,simulation,persistence,test-utils}/vitest.config.ts` | UPDATE — `coverage.include`, `coverage.thresholds`, `passWithNoTests`, comment rewrite |
| `apps/web/vitest.config.mts` | UPDATE — `passWithNoTests` decision; `benchmark.include` if FD2 lands a bench here |
| `apps/web/lib/canvas/*.bench.ts` | NEW, **only if FD2 = (b)** — see Trap 8 first |
| `scripts/check-bench-budget.mjs` | NEW, **if FD1 = (b)/(c)** — follows `check-bundle-size.mjs`'s shape |
| `turbo.json` | UPDATE — `bench` task, `"cache": false` |
| `package.json` | UPDATE — root `bench` script + the `ci` chain |
| `.github/workflows/ci.yml` | UPDATE — new stage, same position as in `npm run ci`, header comment updated |
| `docs/implementation-artifacts/performance-baseline-validation.md` | NEW — the AC14 report, at the artifacts **root** |
| `docs/implementation-artifacts/deferred-work.md` | UPDATE — close/annotate the five entries AC13 names, plus the FD3 entry |
| `docs/project-context.md` | UPDATE — the "Testing Rules" section says the gate *"flips on in Story 3.7"* and that `passWithNoTests` keeps empty packages green; both stop being true here |

⚠️ `docs/project-context.md` is the one non-obvious edit: it is loaded by every BMad skill on
activation, so a stale line there misinforms every future story. Update the **Testing Rules** block
(the gate state, the `npm test` caveat, and the coverage table if any number moves).

## References

- `docs/planning-artifacts/epics.md#Story 3.7: Performance Harness & Coverage-Gate Flip` — the ACs.
- `docs/planning-artifacts/architecture.md` — **Decision A** (four presets, A.4 performance model
  and its estimate), **Decision D.2/D.3** (≤1 step per frame, repaint after a step), **M12** (the
  per-cell guards and their re-measurement, assigned here by name), **M14/M15** (the
  amend-with-authorization precedent).
- `docs/planning-artifacts/rfcs/RFC-008-testing-and-tooling-strategy.md` — **Decision 3** (the
  per-package coverage table and the `apps/web` counter-metric), **Decision 6** (canvas = decision
  logic, not pixels), **Decision 7** (the bench harness, the hard 100×60 expectation, the tracked
  larger grids, the report), **Decision 9** (CI stage order, per-package configs), **Risk 1**
  (coverage padding), **Risk 6** (benchmark environment sensitivity).
- `docs/planning-artifacts/rfcs/RFC-004-simulation-rules-engine.md` §3.1/§3.2 — the step contract as
  amended by Story 3.6 (destination-passing).
- `docs/implementation-artifacts/deferred-work.md` — the bundle-gate ratchet design (3.3 review),
  the four-identical-configs entry (1.2 review), and the five *"Story 3.7's to measure"* entries
  (1.8, 2.3 ×2, 2.10, 3.5 reviews).
- `docs/implementation-artifacts/3-6-phase-3-the-assembled-cycle.md` — the step contract, FD1/FD2,
  and the Dev Agent Record shape this story's record should match.
- `docs/implementation-artifacts/palette-cvd-validation.md` — the report format to follow.
- `scripts/check-bundle-size.mjs` — the measure-then-gate script shape, incl. the vacuous-result
  guard and the "every number traceable to a measurement" comment discipline.
- `packages/simulation/src/strategy/birthSurvivalPhase.ts` — the every-organism × every-cell loop
  that is 99% of the cycle.
- `docs/project-context.md` — Testing Rules, Development Workflow Rules (the local-green-≠-CI-green
  and pipe-swallowed-exit-code warnings), and the commit gate.

## Dev Agent Record

### Agent Model Used

claude-opus-5 (dev-story, `implement-next-story` step 2).

### FD6 terminal branch: raised, authorized, resolved

**The story halted once, and this is the record of why and how it resumed.**

`npm run ci` failed on `bench:check` at **18.749 ms against a 16.667 ms budget, over by 2.082 ms**,
with the benchmark in its real pipeline position. FD6 had been followed in order: the baseline was
measured; both optimizations `deferred-work.md` names as this story's were **built and measured** —
the reused scratch `CellSubject` (**0 ms**) and the "has death rules" flag (**≤0.1 ms**) — each delta
recorded separately, both reverted. It still missed, so the story raised the Spec-conflict flag,
presented **one** recommendation and stopped.

**Nothing on FD6's "not allowed" list was touched, before or after.** The budget is still `1000/60`.
The gate is still a hard failure, never a warning, never skipped. The fixture is still 20 organisms ×
50 rules, pinned by `benchmarkRoster.test.ts` so it *cannot* be cheapened silently. 100×60 is still
the only gated preset. `step()` was never gated alone with the repaint dropped.

**Sidiar authorized the recommendation (2026-09-10), including the M12 amendment it required.**
FD7 landed:

- Each condition is compiled to a concrete `(cell) => boolean` at session time
  (`compileEvaluators.ts`), resolving selector and predicate **once per rule per session**. The
  compiled hot path performs neither dictionary lookup and neither M12 guard — and, it turned out,
  no `.find`/`.every` closure allocation per call either.
- **Measured: 12.2–14.4 ms → 5.7–6.1 ms per cycle, ~2.3×** (interleaved A/B, four pairs, table in
  the report). The gated frame went **18.749 ms → 6.760 ms** standalone (59.4% headroom) and
  **18.749 ms → 8.060 ms in `npm run ci`** — the exact position that was red — with 51.6% headroom.
- **The safety property holds as argued.** `compileSession` runs `validateSurvivalRules` over the
  whole roster before any evaluator exists, and that sweep's `isCellProperty` **is**
  `Object.hasOwn(cellSelectors, property)` while its `OPERATORS.includes` **is** the operator
  dictionary's totality test. The checks moved from per-cell to per-rule-per-session; they did not
  vanish. Story 4.15's draft organism goes through `compileSession` and is still checked, once,
  before its first cycle.
- **`firstSatisfiedBy` and `operators` are unchanged and keep every guard**, because they are
  parametric over an arbitrary subject and reachable by callers that never compile a session
  (`resolveCellAction` is one). Invariant, written into both files: *a caller is either guarded per
  cell, or guarded once before its first cycle — never neither.*
- **`architecture.md` M12 amended** in the M14/M15 style: the corrected cost (+1.4 ms/cycle
  re-measured against +0.091 ms recorded, and the operator guards confirmed at 0 ± 0.3 ms) and the
  guards' new placement.
- **367/367 `@gol/simulation` tests green and UNEDITED** through the change — Conway goldens,
  conflict goldens, phase purity, property tests. Had a golden moved, that would have been a
  semantics change and a second halt.

❌ **The out-of-scope lever stayed out of scope.** Narrowing the candidate organism set per cell was
never touched; the authorization excluded it and FD7 alone closed the gap.

**Nothing is awaiting Sidiar.** The one remaining unknown is a check, not a decision: `ci.yml`
triggers on `main`/`pull_request` only, so the first *runner* number arrives when the PR opens. The
frame would have to be 2.4× slower there to reach the budget.

### Forced Decisions

- **FD1 — what hard-gates CI: (b).** `vitest bench --outputJson` + `scripts/check-bench-budget.mjs`
  over the JSON, budget derived from NFR-1.1. Mirrors `check-bundle-size.mjs` exactly: a
  measurement, a stated derivation, a printed table on every run, a non-zero exit. **(c)'s ratchet
  was rejected on a measurement, as FD1 asked:** the run-to-run spread on ONE machine, ONE tree, ONE
  commit is **≈ ±10%** (12.4 ms best, 16.4 ms worst standalone; 18.7 ms in the CI chain). A ±10%
  noise floor against a delta small enough to catch a real regression produces false positives
  continuously — the bundle gate can ratchet because gzipped bytes are exact and hardware-independent;
  a wall clock is neither. **(a)** was rejected because a timing assertion inside the unit suite
  makes the number invisible on a pass and puts a wall clock where flakes are least tolerable.
  **(d)** fails AR-43 on its face.
- **FD2 — what "repaint" means: (b).** Engine + the renderer's DECISION logic
  (`groupByColourState`, `colourStateAt`, `selectDirtyCells`, the `refToFillGroup` LUT), benched in
  `apps/web` with **no canvas double at all** — the pure functions need none, which is what let the
  bench avoid `@/test-support` entirely. Labelled in the bench file's header, in the gate script and
  in the report: **this is not rasterization**, and nothing here may be quoted as a browser paint
  number. It is what produced numbers for two of AC13's deferred render items. **(c)** (Playwright)
  rejected per RFC-008 Risk 6.
- **FD3 — four configs or a shared base: (a), four files.** The premise dissolved exactly as the
  story predicted: after the flip they are no longer byte-identical (different thresholds, different
  `perFile`, different environments, different `include`/`exclude`, different `passWithNoTests`
  history). RFC-008 Decision 9 is explicit that each package owns its `vitest.config`. The
  `deferred-work.md` entry is **closed**, not deferred a third time.
- **FD4 — `perFile` and `passWithNoTests`.** `perFile: true` on `domain`/`simulation` — **free**,
  because with `include` on both are at 100% on *every* file (Trap 12 did not fire; see below).
  **Aggregate** on `persistence` and `test-utils`, and for `test-utils` that is a MEASURED call, not
  a preference: `mockWorkspace.ts` sits at 75% branches, so per-file at the 80% tier would fail on
  the day it landed. `persistence`'s per-file worst case is `localStorageAccess.ts` at 90.47%
  branches — per-file would be free there, and is not taken because an 80% floor *per file* tightens
  the gate past what AR-39 asks of the round-trip-carried package. `passWithNoTests` **removed from
  all four** (`domain`, `simulation`, `test-utils`, `apps/web`), and mutation-checked: a run matching
  zero test files now exits 1 in every workspace. `autoUpdate` never used, and a comment says why.
- **FD5 — where the 20-organism fixture lives: (b),** `createBenchmarkRoster(n)` +
  `createBenchmarkFill(...)` + the preset/size constants, exported from `@gol/test-utils`. Taken
  over (a) for a reason (a) could not survive: **two benches in two workspaces measure the same
  battle** — the engine step and the repaint decision — and the gate SUMS them, which is only
  meaningful if both ran against one roster. The trap the story names was avoided by keeping the four
  template ids in the roster, so Chaotic Spreader's `organismType eq mock-aggressive-colonizer`
  still resolves instead of compiling to `NO_MATCH_REF`. The rule count (**50**) and every other gate
  parameter are pinned by `benchmarkRoster.test.ts`.
- **FD6 — the baseline missed, then FD7 closed it.** See the section above. Allowed steps (1)-(3)
  were taken in order and the terminal branch was reached honestly; the fix came from Sidiar's
  authorization, not from a story quietly widening something.
- **FD7 (`compileEvaluators.ts`'s own deferred decision) — TAKEN, on explicit authorization.**
  Conditions compile to concrete predicates at session time. The operator itself is still
  `operators[...]`, resolved once and **not** re-implemented inline per operator: specialising would
  remove one more call and would fork the semantics of six predicates away from the file that
  documents them — `operators.ts` warns that flipping `range`'s inclusive upper bound *"reads as
  correct, silently drops 3, and breaks every golden pattern"*. One source of truth for what an
  operator MEANS; this layer only decides when it is looked up.

### Debug Log References

All commands run from the repo root unless noted; `npm run ci` was **redirected, never piped**.

| command | result |
|---|---|
| `npm run bench` (×8, standalone) | exit 0; `step 100x60 x20` = 12.4 – 16.4 ms |
| `npm run bench:check` (standalone) | exit 0, headroom 0.19 – 4.3 ms |
| `npm run ci > /tmp/gol-ci.log 2>&1; echo $?` (pre-FD7) | **exit 1** — `bench:check`, frame 18.749 ms vs 16.667 ms. Every stage before it green. `e2e` not reached. |
| `npm run ci > /tmp/gol-ci2.log 2>&1; echo $?` (post-FD7) | **exit 0 — fully green**, `e2e` included (344 Playwright tests). In-pipeline frame **8.060 ms**, 8.606 ms headroom (51.6%). `bench` reported `0 cached, 2 total` (Trap 1). |
| interleaved A/B, FD7 condition compilation (4 pairs) | before 12.219/13.495/14.145/14.428 · after **5.703/5.813/6.122/6.100** → **~2.3x, ~7.6 ms/cycle** |
| `npm run bench` + `npm run bench:check` (post-FD7) | exit 0 — frame **6.760 ms**, **9.907 ms headroom (59.4%)**; turbo reported `0 cached, 2 total` (Trap 1 checked) |
| `npm run ci` (first attempt) | exit 2 — `web:typecheck`, `BenchFunction` must return `void`; three arrow-body benches in `repaintDecision.bench.ts` returned values. Fixed. |
| interleaved A/B, scratch `CellSubject` (3 pairs) | 15.10 vs 15.15 ms mean; by min 12.52 vs 13.91 — **no gain**; reverted |
| interleaved A/B, M12 guards (4 triples) | SHIPPED 13.06/14.30/14.57/14.65 · NO-`hasOwn` 11.63/12.39/12.62/12.99 · NO-`typeof` 13.99/14.38/14.91/15.25 → **`hasOwn` +1.4 ms**, `typeof` **0 ± 0.3 ms**; both restored |
| `npx vitest run` in `packages/simulation` | 367 tests green at every step — Conway goldens, conflict goldens and property tests **unedited** |
| gate mutation ×6 (missing file / empty report / bad JSON / NaN mean / renamed task / 25 ms frame) | exit 1 on all six, each naming the cause |
| coverage mutation: probe file in `packages/domain/src` | exit 1 ×4 metrics, **naming the file** — and exit **0** under an aggregate threshold, which is FD4's whole argument |
| coverage mutation: `conflictPhase.test.ts` deleted | exit 1, "branches (87.5%) does not meet global threshold (90%) for src/strategy/conflictPhase.ts" |
| `npx vitest run zzz-no-such-suite` ×4 workspaces | exit 1 in all four (`passWithNoTests` gone) |

### Completion Notes List

- **The harness measures the assembled `threePhaseStep`** through the real
  `compileSession` + `createGridBuffers` + `swapGridBuffers` cycle, across all four presets × 20
  organisms, with `time: 0` + an exact iteration count so the cycle count is a property of the
  fixture rather than of the machine. Phase-split tasks are added as **diagnostic and explicitly not
  gated** — the gate script names the assembled step and nothing else.
- **Trap 12 did not fire, and that is recorded rather than assumed.** `@gol/simulation`'s barrel
  `index.ts` was expected to enter the denominator at 0%; a test already imports it, so with
  `include` on the package is at 100% on every file. That is *why* `perFile: true` was free.
- **AC9's probe was reproduced on this tree**, both directions: 100% (73/73) without
  `coverage.include`, 96.05% (73/76) with it and the untested file listed at 0%. `include` landed
  **before** any threshold.
- **AC13: seven deferred items closed with a number, one honestly left open.** The four-bar
  grid-line restoration is pure rasterization and jsdom has no canvas — Story 3.7 states the exact
  call count (**4 `fillRect`s per repainted cell instead of 2**) and reassigns the timing question to
  Story 3.9 or a browser, rather than inventing a number off a test double.
- **On `draw` vs `drawFull` for Story 3.8:** the recommendation is still `draw`, but the numbers went
  the other way than expected on the decision half — `drawFull`'s decision (~0.11 ms) is CHEAPER than
  marking all 6,000 cells and diffing them (~0.47 ms), because `markDirty` allocates a coordinate per
  cell and routes it through a `Set`. `draw` still wins on the rasterization half, which is the half
  no off-browser harness can measure. Story 3.8 now has both numbers.
- **`eslint.config.mjs`: `apps/web/**/*.bench.ts` added to the `@gol/test-utils` import-boundary
  block ONLY** (Trap 8). Not to the AR-46 colour block, whose `ignores` list also carries
  `paletteRegistry.ts` and is deliberately not interchangeable. A `.bench.ts` is non-production on
  the same terms as a `.test.ts`: nothing under `app/` imports one, so it is never in Next's build
  graph. Recorded in `deferred-work.md` because widening a boundary rule is a deliberate act.
- **`docs/project-context.md` updated** — the Testing Rules block said the gate *"flips on in Story
  3.7"* and that `passWithNoTests` keeps empty packages green; both stopped being true. It now also
  carries the performance gate, the fixture-is-a-gate-parameter warning, and the measured margin
  (it said the gate was red for the span between the FD6 halt and FD7 landing; it no longer does).
- **One engine behaviour change ships, and only one:** FD7's condition compilation in
  `compileEvaluators.ts`. Both FD6 optimizations were reverted and both M12 guards are intact, so
  every other phase/engine/session source differs from `05827c3` in comments only.

### Spec-conflict flags raised

- **✅ NFR-1.1's guarantee vs. the measured baseline** — raised as the HALT above, **resolved** by the
  authorized FD7 change. The frame is 6.760 ms against 16.667 ms.
- **✅ WITHDRAWN — `architecture.md` Decision A.4's performance model.** Raised mid-story as ~2.4×
  optimistic (A.4: *"~6 ms at 6,000 cells → ~24 ms at 24,000"*; pre-FD7 measurement ~14–16 ms and
  ~55–61 ms). **After FD7 the same two points measure 6.71 ms and 23.87 ms** — within a few percent
  of A.4's figures. A.4 was right about the destination; the engine had not arrived yet. No
  amendment proposed and none needed. ⚠️ For **Story 3.16**: 150×90 (13.3 ms) now also fits inside a
  frame; only 200×120 does not.
- **🟡 `epics.md`'s AC for this story says the benchmark measures "`step()` + repaint".** Off-browser
  there is no repaint to measure. Amended in the open (the M13 precedent): the harness measures
  **`step()` + the repaint DECISION**, and the AC's wording should follow the code.
- **🟡 AR-39 does not name `@gol/test-utils`** (AC11). Decided rather than inherited from a glob:
  **≥80%, aggregate**. Not 90 (it sat at 89.47% branches — the core tier would have reddened CI on
  the fixtures package the day it landed, and inventing a requirement AR-39 never states is the
  coverage-for-its-own-sake RFC-008 Risk 1 rejects); not zero either (`apps/web`'s no-gate is a
  counter-metric about *UI* coverage theatre, and this package is not UI — a broken fixture here
  silently weakens every consumer's tests).
- **✅ M12's `Object.hasOwn` figure was ~15× low** (+1.4 ms/cycle measured against +0.091 ms
  recorded; the operator guards confirmed at 0 ± 0.3 ms). **M12 amended** in `architecture.md` on
  Sidiar's explicit authorization — the corrected cost *and* the guards' new placement. Neither guard
  was removed.

### Spec-conflict flags raised by the code review (2026-09-10)

- **🟡 RFC-004 §1.4 / §2.3 / §3.5 / Risk 2 vs. the shipped hot path** — see the `[Decision]` item
  under Review Findings. Not amended; Sidiar's call.
- **⚪ RFC-008 Decision 9's pipeline diagram** still reads `… ─► build (next, bundle-budget check)
  ─► e2e …` and omits the `bench → bench:check` stages Decision 7 implies. Not a contradiction —
  Decision 7 already names the harness — and not amended (What NOT to build); recorded so the next
  RFC-008 touch folds it in.

### File List

**New**

- `packages/test-utils/src/benchmarkRoster.ts`
- `packages/test-utils/src/benchmarkRoster.test.ts`
- `packages/simulation/src/strategy/threePhaseStep.bench.ts`
- `apps/web/lib/canvas/repaintDecision.bench.ts`
- `scripts/check-bench-budget.mjs`
- `docs/implementation-artifacts/performance-baseline-validation.md`

**Modified**

- `docs/planning-artifacts/architecture.md` — **M12 amended** (corrected cost + the guards' new
  placement), on Sidiar's explicit authorization
- `packages/simulation/src/session/compileEvaluators.ts` — **FD7**: `compileCondition` /
  `compileRule` compile each condition to a concrete `(cell) => boolean` at session time; the
  evaluators loop over compiled predicates instead of closing over `firstSatisfiedBy`
- `package.json` — `bench` / `bench:check` scripts; the `ci` chain
- `turbo.json` — `bench` task, `"cache": false`
- `.github/workflows/ci.yml` — two new stages + the header stage-order comment
- `.gitignore` — `bench-results.json`
- `eslint.config.mjs` — `*.bench.ts` exempt from the `@gol/test-utils` import ban (that block only)
- `packages/simulation/package.json`, `apps/web/package.json` — `bench` script
- `packages/domain/vitest.config.ts`, `packages/simulation/vitest.config.ts` — `include`/`exclude`,
  ≥90% thresholds with `perFile: true`, `passWithNoTests` removed, comment rewritten
- `packages/persistence/vitest.config.ts`, `packages/test-utils/vitest.config.ts` —
  `include`/`exclude`, 80% aggregate thresholds, `passWithNoTests` removed
- `apps/web/vitest.config.mts` — `passWithNoTests` removed, coverage `include`/`exclude`, no gate
- `packages/test-utils/src/index.ts` — fixture exports
- `packages/simulation/src/strategy/birthSurvivalPhase.ts`,
  `packages/simulation/src/strategy/deathPhase.ts`,
  `packages/simulation/src/engine/firstSatisfiedBy.ts`,
  `packages/simulation/src/engine/operators.ts` — **comments only**: each "Story 3.7's to measure"
  note replaced by its measured result, and the two engine files now state the
  guarded-per-cell-or-guarded-once invariant FD7 rests on
- `apps/web/lib/canvas/colourStateGroups.ts`, `apps/web/lib/canvas/gridRenderer.ts`,
  `apps/web/components/battle/editor/OrganismRoster.tsx` — **comments only**, same
- `docs/implementation-artifacts/deferred-work.md` — five entries closed with numbers, one
  reassigned, five new (the one that was blocking is resolved by FD7)
- `docs/project-context.md` — Testing Rules rewritten; CI stage order updated
- `docs/implementation-artifacts/sprint-status.yaml` — status

**Added or changed by the code review (own commit, 2026-09-10)**

- `packages/simulation/src/session/compileEvaluators.ts` — rules read once per organism; the
  validated reference is the compiled one; M15 JSDoc re-attached
- `packages/simulation/src/session/compileEvaluators.test.ts` — three FD7-boundary pins
- `packages/simulation/src/strategy/threePhaseStep.bench.ts` — shared run options; Phase-3 note
- `packages/test-utils/src/benchmarkRoster.ts`, `benchmarkRoster.test.ts`, `index.ts` —
  `BENCHMARK_RUN_OPTIONS`, typed `cloneCondition`, preset/tuple/option pins
- `apps/web/lib/canvas/repaintDecision.bench.ts` — non-collapsing fixture, preset-derived
  dimensions, group-count assertion, upper-bound label
- `apps/web/lib/palette/paletteTokenUsage.test.ts` — benchmark roster tokens guarded
- `apps/web/vitest.config.mts`, `eslint.config.mjs` — `*.bench.{ts,tsx}`
- `scripts/check-bench-budget.mjs` — shape, duplicate-name and gated⊆required guards
- `package.json`, `turbo.json`, `.github/workflows/ci.yml` — `bench --concurrency=1`
- `apps/web/lib/canvas/colourStateGroups.ts`, `gridRenderer.ts`,
  `components/battle/editor/OrganismRoster.tsx` — comment numbers aligned to the report
- `docs/implementation-artifacts/performance-baseline-validation.md`, `deferred-work.md`,
  `docs/project-context.md`, this file — corrections above

### Change Log

| date | change |
|---|---|
| 2026-09-10 | `vitest bench` harness across all four presets × 20 organisms + the repaint-decision bench; `scripts/check-bench-budget.mjs` with the derived 16.667 ms budget and a vacuous-result guard; `bench` / `bench:check` wired into `turbo.json`, `npm run ci` and `ci.yml`; coverage gates flipped on (90% per-file on domain/simulation, 80% aggregate on persistence/test-utils, none on apps/web) with `coverage.include` landing first and `passWithNoTests` removed everywhere; M12 re-measured; seven deferred perf items closed with numbers; `performance-baseline-validation.md` written. |
| 2026-09-10 | ⛔ **HALT at FD6's terminal branch** — `npm run ci` red on `bench:check` at 18.749 ms vs 16.667 ms after both permitted optimizations measured at ~0 and were reverted. One recommendation recorded; awaiting Sidiar. |
| 2026-09-10 | 🔍 **Code review** (Fable): 15 patches landed in their own commit — the load-bearing ones are `compileSession` reading `survivalRules` once (FD7's safety property made structural), the collapsed repaint fixture replaced (7-organism still life → pinned 30% fill, 55 groups asserted), and the two summed benches serialized. Post-review frame **5.6–5.8 ms, 65–67% headroom**. One `decision-needed` left for Sidiar: RFC-004 still describes the pre-FD7 hot path. Status stays `review`. |
| 2026-09-10 | ✅ **FD7 authorized by Sidiar and landed** — conditions compiled to concrete `(cell) => boolean` predicates at session time; ~2.3× on the assembled cycle (12.2–14.4 → 5.7–6.1 ms), gated frame 18.749 → **6.760 ms** with 59.4% headroom. `architecture.md` **M12 amended** (corrected cost + new guard placement). 367 simulation tests and every golden green and unedited. `npm run ci` fully green. |

Dev Model: opus   # establishes the perf-gate mechanism, budget derivation and coverage-include shape that 3.8/3.9 benches and the pending bundle-ratchet story all inherit — and the measured baseline likely misses NFR-1.1, so the story is a judgment call, not wiring.

---

This story was implemented with the 'Implement next story' skill with the following stats:

| Phase | Agent model | Agents | Wall clock | Input | Output | Cache write | Cache read | Total tokens |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Step 0 — re-entry guard | — | 0 | 20s | 18 | 1,711 | 8,742 | 404,939 | 415,410 |
| Step 1 — create-story | opus-5 | 1 | 12m 30s | 224 | 28,908 | 560,255 | 13,491,208 | 14,080,595 |
| Step 2 — dev-story | opus-5 | 1 | 37m 55s | 442 | 114,267 | 569,788 | 42,813,471 | 43,497,968 |
| _of which the orchestrator_ | opus-5 | — | — | 66 | 16,960 | 48,580 | 1,719,928 | 1,785,534 |
| **Total (create-story → PR ready)** | | 2 | **50m 44s** | 684 | 144,886 | 1,138,785 | 56,709,618 | **57,993,973** |

Run started 2026-09-10 15:32 CEST; wall clock runs to the point the run stopped for Sidiar's review. Each phase row covers the phase agent, any agents it spawned, and the orchestrator's own turns in that window — the orchestrator row breaks its share out again, it is not additional. Cache reads dominate the token totals and are billed at a fraction of input rate, so read the Input and Output columns for effort and the total only as a ceiling. The orchestrator's final turn is still being written when these numbers are taken.
