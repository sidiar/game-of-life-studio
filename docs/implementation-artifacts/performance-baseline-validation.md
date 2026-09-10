# Performance Baseline Validation

Story 3.7. The first measurement of the simulation cycle Stories 3.1–3.6 built, and the derivation
of the CI budget that gates it from here on (AR-43, NFR-1.1, Decision D.2/D.3, RFC-008 Decision 7).

Companion to `palette-cvd-validation.md` — same shape: the reproduction command first, the numbers
second, the machine stated, and an honest note on how much of the spread is hardware.

---

## Reproduce

```bash
npm run bench        # turbo run bench — NEVER cached; writes bench-results.json per workspace
npm run bench:check  # scripts/check-bench-budget.mjs — the gate, prints every number either way
```

Both stages run in `npm run ci` and in `.github/workflows/ci.yml`, in that order, after
`bundle:check` and before `e2e`.

⚠️ `vitest run` does **not** execute `*.bench.ts` — that glob belongs to `vitest bench` alone. A
bench file with a typo in it is invisible to `npm test`, which is why `check-bench-budget.mjs`
treats a missing file, an empty report, a missing task name and a NaN mean as **failures** rather
than as a vacuously passing budget.

## Environment

| | |
|---|---|
| Machine | Apple silicon (A18 Pro), 6 cores, macOS 26.6.2 |
| Node | 24.16.0 (`.nvmrc`) |
| Vitest | 4.1.10 (`vitest bench`, tinybench) |
| Repaint | **not rasterized** — see "What the repaint number is" below |
| Tree | branch `story/3-7-performance-harness-coverage-gate-flip`, baseline commit `05827c3` |

**How much of this is hardware: most of it.** Every absolute number below is a property of this
laptop, and the numbers move by ~15% depending on what else the machine has just been doing.
GitHub's `ubuntu-latest` runners are materially slower than an M-series Mac on single-threaded JS on
top of that. ⚠️ **The headline finding is that the gate does not pass** — see "The margin problem".

---

## The fixture, stated as the thing being measured

Phase 2 costs `cells × organisms × rules-until-first-match`. **The fixture's shape is therefore a
parameter of the gate**, not a test detail: a future story that swaps in cheaper organisms loosens
the budget without touching the budget. `packages/test-utils/src/benchmarkRoster.test.ts` pins every
number in this table, so a change here fails a test rather than moving a threshold silently.

| parameter | value |
|---|---|
| roster | `createBenchmarkRoster(20)` — 20 organisms |
| **total rules** | **50** (5 cycles of Conway 2 / Aggressive 3 / Patient 3 / Chaotic 2) |
| explicit `die` rules | 10 (half the roster has one; half has none) |
| organism ids | all distinct; the four template ids stay in the roster so Chaotic Spreader's `organismType eq mock-aggressive-colonizer` still resolves (Decision E.3) |
| `contentHash` | distinct per organism — otherwise the Decision E.4 cache compiles 20 organisms into 4 shared evaluator pairs and the benchmark measures a roster of 4 |
| dominance | 1..20, all distinct, so Phase 3 never draws from the FR-5.4 tie-break RNG |
| colour tokens | 20 distinct RFC-007 tokens, so `groupByColourState` sees the real fill-group count (Decision B.2 folds duplicates) |
| initial fill | `createBenchmarkFill(..., 300, createSeededRng(FIXED_SEED))` — 30% occupancy, deterministic |
| seed | `FIXED_SEED` (20260716) for both the fill and `createRng` |
| **cycles measured** | **100 iterations, 25 warm-up**, `time: 0` — an exact count, not a time budget, so the amount of work is a property of the fixture rather than of the machine |

⚠️ **20 organisms × 2 rules would be the cheapest legal reading of AR-43's "20 organisms"** and is
what the story's own scoping probe used. This fixture is deliberately not that.

## What the repaint number is (story FD2, option (b))

AR-43 and `epics.md` say the harness measures *"`step()` + repaint"*. **Off-browser there is no
repaint to measure**, and this document does not pretend otherwise:

- jsdom's `getContext()` is unimplemented — the `Not implemented: HTMLCanvasElement's getContext()`
  lines in every `apps/web` test run are exactly this. A `GridRenderer` benchmark under Vitest times
  a test double's method calls.
- So the measured "repaint" is the renderer's **decision logic**: `groupByColourState`,
  `colourStateAt`, `selectDirtyCells` and the `refToFillGroup` LUT — what RFC-008 Decision 6 says to
  test, and explicitly **not** rasterization.
- A real repaint number needs a real browser. Rejected for this story: the `e2e` job is already the
  slow one and RFC-008 Risk 6 argues against browser timing on shared runners.

**Nothing below may be quoted as a browser paint number.** Whatever the GPU costs on top of these
figures is unmeasured, and the frame budget has to absorb it out of the headroom shown.

---

## The budget, derived

1. **NFR-1.1** guarantees 60 FPS at 100×60 with up to 20 organisms → a frame is **1000 / 60 =
   16.667 ms**.
2. **Decision D.2/D.3**: at most **one `step()` per frame**, and a repaint happens **only after a
   step**. So the worst frame in a run is exactly one `step()` plus one repaint.
3. Therefore the gated quantity is **`step()` + repaint at 100×60 × 20 organisms ≤ 16.667 ms**, and
   the margin RFC-008 Risk 6 asks for is the **headroom under** that number, not an allowance added
   on top of it.

**Rejected, recorded so nobody re-derives them:**

- **Not `16.667 / 3`.** The 20 gen/sec ladder maximum is one step per 50 ms; frames that run no step
  do no simulation work, so dividing the frame period by a step rate bounds nothing real.
- **Not a per-preset budget.** Decision A.4 says larger grids degrade *gracefully by design* and
  AR-43 gates the baseline only. 150×90 and 200×120 are measured and printed, never gated.
- **Not a relaxed number.** The budget is 1000/60 exactly, not a rounded 16.7 — rounding up would
  hand the gate free headroom NFR-1.1 never granted.

---

## Measured

### The gated frame — 100×60 × 20 organisms

🔴 **The gate is RED.** Under a full `npm run ci` on this machine — i.e. with the benchmark running
in its real CI position, after typecheck, lint, coverage, build and the bundle check — the frame
measures **18.749 ms against a 16.667 ms budget, over by 2.082 ms.** See "The margin problem".

Four consecutive standalone `npm run bench` runs, in order, on an otherwise idle machine:

| run | `step 100x60 x20` | `repaint-decision 100x60 x20` | frame | headroom vs 16.667 |
|---|---|---|---|---|
| 1 | 14.151 | 0.044 | **14.195** | 2.47 ms (14.8%) |
| 2 | 15.862 | 0.048 | **15.910** | 0.76 ms (4.5%) |
| 3 | 16.432 | 0.048 | **16.480** | **0.19 ms (1.1%)** |
| 4 | 15.362 | 0.046 | **15.408** | 1.26 ms (7.6%) |
| **in `npm run ci`** | **18.704** | **0.044** | **18.749** | 🔴 **over by 2.082 ms** |

Earlier isolated runs on the same tree reached as low as **12.4 ms**. Every *standalone* run passes;
the run that matters — the benchmark in its actual CI position — does not.

### The tracked presets (measured, never gated)

| preset | ms/step | vs 100×60 |
|---|---|---|
| 50×30 × 20 | 3.5 – 4.6 | ~0.27× |
| **100×60 × 20 (gated)** | **14.2 – 16.4** | 1× |
| 150×90 × 20 | 29.8 – 33.9 | ~2.1× |
| 200×120 × 20 | 55.3 – 60.9 | ~3.9× |

Cost is ~linear in cell count, as Decision A.4 predicts. **The constant is not what A.4 predicts** —
see the spec-conflict flag below.

### The phase split at the gated preset (diagnostic, never gated)

| phase | ms | share of cycle |
|---|---|---|
| Phase 1 `deathPhase` | 0.20 – 0.22 | **1.4%** |
| **Phase 2 `birthSurvivalPhase`** | **14.1 – 14.9** | **~98.5%** |
| Phase 3 `conflictPhase` | 0.010 – 0.011 | 0.07% |

`birthSurvivalPhase`'s own doc comment says why: it *"evaluates EVERY organism in the roster against
EVERY cell"*. **Any performance work on this engine is Phase 2 work.** Measuring the other two is
confirmation, not search.

### The repaint decision (apps/web, 100×60 × 20)

| task | ms | note |
|---|---|---|
| `repaint-decision` (`groupByColourState`) | 0.044 – 0.048 | the gated repaint half |
| `repaint-dirty-path` (mark all 6,000 + `selectDirtyCells`) | 0.42 – 0.52 | ~10× the above |
| `colour-state-reprime` (`drawFull`'s O(cells) sweep) | 0.060 – 0.073 | |
| `ref-to-fill-group-build` | 0.005 – 0.007 | **once per battle**, not per frame |
| `library-filter 1000 organisms` | 0.033 – 0.039 | `<OrganismRoster>`'s per-render scan |

**The whole repaint decision is ~0.3% of the frame.** The renderer's brain is not where the budget
goes, and no render-side redesign in Epic 3 can buy back a meaningful fraction of it.

---

## What was tried, and what it bought

Every change below was implemented, measured against this harness in an **interleaved A/B** (the
machine drifts under sustained load, so adjacent pairs are compared rather than absolute runs), and
then **reverted**. The engine ships unchanged from `05827c3`; `npm test` was green and the Conway
goldens, conflict goldens and property tests passed **without edits** at every step.

| change | measured delta at 100×60 × 20 | verdict |
|---|---|---|
| **Reused scratch `CellSubject`** in Phase 2 (~120,000 allocations/cycle removed) | **0 ms** — 15.10 vs 15.15 ms across three interleaved pairs, inside a ±1.5 ms spread | **Not taken.** V8's young-generation allocation of a short-lived, stable-shape object is not what this loop costs. Keeping it would open a real seam (`CellSubject` is `readonly`; a shared scratch aliases one object across every evaluator) for nothing. |
| **"Has death rules" flag** on `OrganismEvaluators` to skip Phase 1's scan | **≤0.1 ms** (bounded: all of Phase 1 is 0.21 ms, and the flag skips only the half of the roster with no `die` rule) | **Not taken.** Below the harness's own run-to-run spread, in exchange for a field on a Story 3.4 public surface. |
| **M12 — `Object.hasOwn` guard** in `firstSatisfiedBy` (removed, measured, restored) | **+1.4 ms/cycle** (min-to-min across four interleaved pairs: 11.81→10.51, 12.84→11.45, 12.99→11.60, 13.10→11.69) | **Guard kept. See the proposal below.** |
| **M12 — `typeof` numeric guards** in `operators.ts` (removed, measured, restored) | **0 ± 0.3 ms** — below resolution | **Guard kept.** M12's +0.019 ms figure is confirmed. |

### M12, re-measured (AC12 — measure and propose, do not remove)

`architecture.md` **M12** records the two per-cell guards at **+0.019 ms/cycle** (operators) and
**+0.091 ms/cycle** (`Object.hasOwn`), and says they *"should be re-measured with Story 3.7's
harness"* after Story 3.4's compile-time sweep landed. Re-measured:

- **The operator `typeof` guards cost what M12 says** — 0 ± 0.3 ms, below this harness's resolution.
- **The `Object.hasOwn` guard costs ~15× its recorded figure: +1.4 ms/cycle**, ≈10% of the cycle and
  8% of the whole frame budget. M12's number was taken on a much smaller evaluation count; the real
  baseline makes ~300,000 `hasOwn` calls per cycle (120,000 subjects × ~2.5 conditions), at ~4.7 ns
  each.

**Neither guard is removed and M12 is not amended.** Both are Sidiar's call: M12 is a cross-cutting
Architecture Minor Resolution owned by RFC-004, and `firstSatisfiedBy` is public API that **Story
4.15** will call with a draft organism that never went through `compileSession` — so the
once-per-battle sweep (`validateSurvivalRules`, Story 3.4) does not cover it.

> ### 🟠 The one proposal
>
> **Authorize compiling each condition down to a concrete `(cell) => boolean` at session time** —
> the option `compileEvaluators.ts` already records as its own deferred FD7 and explicitly defers to
> *"Story 3.7, with the harness"*.
>
> It removes the `Object.hasOwn` guard **and** the selector lookup **and** the operator-dictionary
> lookup from the per-cell path in one change, without weakening any caller: the check moves from
> per-cell to per-rule-per-session, so a draft organism from Story 4.15 is still checked — once,
> before its first cycle, instead of 300,000 times per cycle.
>
> Measured lever: **≥1.4 ms/cycle**, ~10% of the frame, on a frame whose worst observed headroom is
> 0.19 ms. It is the largest available lever that is **not** a semantics change.
>
> It needs authorization because it changes what M12 governs, and amending an authority doc is not a
> story's call (the M14/M15 precedent). ⚠️ It is **not** the algorithmic fix — narrowing the
> candidate organism set per cell is a semantics-bearing change to M10/Decision C behaviour and
> needs its own story and its own goldens. That remains out of scope.

---

## 🔴 The margin problem — the gate does not pass, and this story stops here

**`npm run ci` fails on `bench:check`.** This is not a prediction about CI hardware; it is the
measured result of running the gate where it actually sits in the pipeline, on the fastest machine
available to this story.

```
NFR-1.1 frame at 100x60 x 20 organisms  (Decision D.2/D.3: one step + one repaint)
  step 100x60 x20                18.704 ms
  repaint-decision 100x60 x20     0.044 ms
  = frame                        18.749 ms
  budget (1000 / 60)             16.667 ms
✖ bench-budget: ... exceeding its 16.667 ms budget by 2.082 ms.
```

What the numbers say, in order:

1. **Standalone, the frame is 12.4 – 16.5 ms** — passing, with worst observed headroom **0.19 ms
   (1.1%)**.
2. **In its CI position it is 18.7 ms** — failing. The benchmark runs after typecheck, lint,
   coverage, build and bundle, on a machine those stages have warmed. Every tracked preset moved the
   same way in that run (50×30 5.33 ms, 150×90 36.95 ms, 200×120 64.67 ms — each ~15% above its
   standalone figure), so this is the machine, not a regression in one preset.
3. **Run-to-run spread on one machine, one tree, one commit is ≈ ±10%**, thermal, and it grows across
   consecutive runs. `ubuntu-latest` is slower than this laptop on single-threaded JS on top of that.
4. RFC-008 **Risk 6** asks for a *generous* margin. **There is none, and the sign is negative.**

**What was NOT done, deliberately** (story FD6's "not allowed" list, and Sidiar's standing
preference that a gate's *mechanism* changes rather than its threshold being relaxed again):

- ❌ the budget was **not** widened — it is `1000/60`, derived from NFR-1.1;
- ❌ the gate was **not** softened to a warning, and not `skip`ped;
- ❌ the fixture was **not** shrunk (it is pinned by a test precisely so it cannot be);
- ❌ no other preset was gated in 100×60's place;
- ❌ `step()` was not gated alone with the repaint dropped.

**What WAS done** (FD6's allowed list, in order): the baseline was measured and recorded; both
optimizations `deferred-work.md` names as this story's were built and measured — **0 ms** and
**≤0.1 ms** — and reverted; each delta is recorded separately above. **It still misses.**

> ### 🛑 FD6 terminal branch — Spec-conflict flag, awaiting Sidiar
>
> **NFR-1.1's guarantee against a measured baseline.** NFR-1.1 promises 60 FPS at 100×60 with up to
> 20 organisms. The engine as it stands, on the fastest machine this story has, spends **18.7 ms of a
> 16.667 ms frame** doing one cycle, with the repaint decision costing 0.3% of that and Phase 2
> costing 98.5%.
>
> **The single recommendation is the one in the M12 section above:** authorize compiling each
> condition down to a concrete `(cell) => boolean` at session time. Measured lever ≥1.4 ms/cycle from
> the `Object.hasOwn` guard alone, plus the selector and operator-dictionary lookups it also removes,
> at no cost to any caller's safety. It needs authorization because it changes what M12 governs.
>
> If that is not enough on its own, the next lever is the one this story was told to stop at: **not
> evaluating every organism at every cell**. That is a semantics-bearing change to M10/Decision C and
> needs its own story and its own goldens. The numbers point there, and this story says so and stops.

⚠️ **CI itself has still not measured this branch.** `.github/workflows/ci.yml` triggers on `main`
and `pull_request` only, so a topic-branch push runs nothing — the first *runner* number arrives when
the PR opens, and it will be worse than 18.7 ms.

### Why no growth ratchet (story FD1)

FD1 asked whether to add committed per-preset baselines with a growth ratchet — the design
`deferred-work.md` records as accepted for the bundle gate — and said to **measure the spread first**
and only add it if the noise floor makes it meaningful. Measured: **≈ ±10% run-to-run on a single
machine**. A ±10% noise floor against a delta small enough to catch a real regression produces
false positives continuously. The bundle gate can ratchet because gzipped bytes are exact and
hardware-independent; a wall clock is neither. **FD1 = (b): a derived absolute budget, one
mechanism, no ratchet.** Revisit if a future story finds a way to make the measurement stable across
runners.

---

## Spec-conflict flags (raised, not resolved — Sidiar decides)

- **🟡 `architecture.md` Decision A.4's performance model vs. measurement.** A.4 states step cost
  *"~6 ms at 6,000 cells → ~24 ms at 24,000"*. Measured on this harness: **~14–16 ms at 6,000 cells
  and ~55–61 ms at 24,000**. The *shape* A.4 asserts (~O(N), graceful degradation) holds exactly —
  the ratio is ~3.9× for a 4× cell count. The **constant is ~2.4× worse** than A.4's estimate, which
  was never measured. **Proposed amendment:** restate A.4's figures as "~15 ms at 6,000 cells → ~58
  ms at 24,000, measured (Story 3.7)", keeping the graceful-degradation conclusion, which the
  measurement supports. Not edited from a story — A.4 is a Cross-Cutting Decision.
- **🟡 `epics.md`'s AC for this story says the benchmark measures "`step()` + repaint".** Off-browser
  there is no repaint to measure. Amended in the open, the way Story 3.3 amended its
  dense↔sparse↔typed AC (the M13 precedent): the harness measures **`step()` + the repaint
  DECISION**, and the AC should read that way. The rasterization half is Playwright's or nobody's.
- **🟡 AR-39 does not name `@gol/test-utils`.** Decided rather than inherited from a glob — see the
  coverage section below.

---

## The coverage gate, flipped (AC8–AC11)

### The include set had to land first

⚠️ **A ≥90% threshold on the config as it stood would have gated only the files that were already
tested.** Vitest 4 reports only files *loaded during the run* unless `coverage.include` says
otherwise (`coverage.all` is gone). Measured on this tree with a probe file added to
`packages/domain/src` and then removed:

| config | result |
|---|---|
| as shipped (no `coverage.include`) | `Statements 100% (73/73)` — the untested file is **absent from the report entirely** |
| with `coverage.include: ['src/**/*.ts']` | `Statements 96.05% (73/76)`, the file listed at **0%** |

So `include` was set **before** any threshold, in all four packages.

### What shipped

| package | gate | mode | measured on this tree |
|---|---|---|---|
| `@gol/domain` | **≥90%** (AR-39, NFR-5.1) | **per file** | 100% / 100% / 100% / 100% |
| `@gol/simulation` | **≥90%** (AR-39, NFR-5.1) | **per file** | 100% / 100% / 100% / 100% |
| `@gol/persistence` | **≥80%** (AR-39) | aggregate | 99.19% stmts / 96.07% br / 100% fn / 100% lines |
| `@gol/test-utils` | **≥80%** (decided here — AR-39 names it nowhere) | aggregate | 94.34% / 89.47% / 100% / 97.01% |
| `apps/web` | **no gate, deliberately** (RFC-008 Decision 3 / Alt 5 — the Metric 4 counter-metric) | — | 95.30% / 90.65% / 95.62% / 97.54%, reported only |

**⚠️ Trap 12 did not fire.** The story expected `@gol/simulation`'s barrel `index.ts` to enter the
denominator at 0% and drop the package below 100%. It did not: a test already imports the barrel, so
with `include` on the package is at **100% on every file**. That is why `perFile: true` was free.

**`perFile: true` on the two core packages, aggregate on the other two (story FD4).** Aggregate
thresholds let one 0%-covered file hide behind a package at 99% — measured: the probe file above
took `@gol/domain` to 96.05% and **passed** a 90% aggregate while contributing nothing. Per-file was
free on `domain`/`simulation` (every file at 100%) and is **not** free on `@gol/test-utils`, whose
`mockWorkspace.ts` sits at 75% branches — which is why that package takes aggregate, as a measured
call rather than a preference. `@gol/persistence`'s per-file worst case is `localStorageAccess.ts`
at 90.47% branches, so per-file at the 80% tier would be free there too; it is not taken because an
80% floor *per file* tightens the gate past what AR-39 asks of the round-trip-carried package.

**`@gol/test-utils` (AC11), decided:** **≥80%, aggregate.** Not 90 — it sat at 89.47% branches, so
the core tier would have reddened CI on the fixtures package the day it landed, and inventing a
requirement AR-39 never states is the coverage-for-its-own-sake RFC-008 Risk 1 rejects. Not zero
either — `apps/web`'s no-gate is a deliberate counter-metric about *UI* coverage theatre, and this
package is not UI: a broken fixture here silently weakens every consumer's tests.

**`passWithNoTests` removed everywhere (AC10)** — `domain`, `simulation`, `test-utils` and
`apps/web`. Its comment said *"No engine code exists yet"*, which stopped being true in Story 3.1.

**Four configs, not a shared base (story FD3).** `deferred-work.md`'s "byte-identical with no shared
base config" entry is **closed** by this story: after the flip the four files are no longer
byte-identical — different thresholds, different `perFile`, different environments, different
`include` sets. Duplication that has become divergence is not duplication, and RFC-008 Decision 9 is
explicit that each package owns its `vitest.config`.

### Both gates were mutation-checked

A gate nobody has seen fail is not known to work.

| mutation | result |
|---|---|
| `bench-results.json` absent | ✖ exit 1, names the file and the command |
| report with zero benchmarks | ✖ exit 1, "treat it as the bench file did not run" |
| report not valid JSON | ✖ exit 1 |
| a task's `mean` set to NaN | ✖ exit 1 — *this is the one that would otherwise pass silently, since NaN compares false against every threshold* |
| a gated task renamed / missing | ✖ exit 1, names the task |
| `step 100x60 x20` inflated to 25 ms | ✖ exit 1, "exceeding its 16.667 ms budget by 8.374 ms" |
| untested probe file added to `packages/domain/src` | ✖ exit 1 × 4 metrics, **naming the file** |
| `conflictPhase.test.ts` deleted | ✖ exit 1, "branches (87.5%) does not meet global threshold (90%) for src/strategy/conflictPhase.ts" |
| a run matching zero test files (`passWithNoTests` gone) | ✖ exit 1 in all four workspaces |
| clean tree | ✓ exit 0 everywhere |

---

## Deferred items closed by a number (AC13)

| item (`deferred-work.md`) | number | outcome |
|---|---|---|
| Per-pair `CellSubject` allocation in Phase 2 (3.5 review) | 0 ms | **Closed** — measured, not worth it; change reverted |
| Phase 1's scan for organisms with no `die` rule (3.5 review) | ≤0.1 ms of a 14.5 ms cycle | **Closed** — measured, not worth a Story 3.4 surface change |
| `groupByColourState`'s per-frame allocation profile (1.8 review) | 0.044–0.048 ms, ~0.3% of the frame | **Closed** — no change needed |
| `drawFull`'s O(cells) colour-state re-prime (2.3 review) | 0.060–0.073 ms | **Closed** — affordable even at cycle rate |
| …and confirm Story 3.8's loop calls `draw`, not `drawFull` | decision cost: `drawFull` ~0.11 ms vs dirty-path ~0.47 ms | **Answered, with a caveat** — see below |
| The dirty path's four-bar grid-line restoration (2.3 review) | **4 `fillRect`s per repainted cell instead of 2**, exactly | **Not measurable here** — it is pure rasterization and jsdom has no canvas. Needs a browser (Story 3.9 or Playwright). |
| `<OrganismRoster>`'s unmemoised library scan (2.10 review) | 0.033–0.039 ms for a 1,000-organism library | **Closed** — no `useMemo` warranted |
| Four byte-identical `vitest.config.ts` files (1.2 review) | — | **Closed** by FD3 above |

**On `draw` vs `drawFull` for Story 3.8.** On *decision* cost alone `drawFull` is cheaper
(0.11 ms) than marking all 6,000 cells and diffing them (0.47 ms), because `markDirty` allocates a
coordinate per cell and routes it through a `Set`. **The recommendation is still `draw`**, for the
half this harness cannot see: `draw` touches the canvas only for cells whose colour state actually
changed, while `drawFull` repaints the entire background, every cell and every grid line on every
frame — and rasterization is not measurable off-browser. Story 3.8 now has both numbers instead of
an assumption. If it takes `drawFull`, it should say so against these figures and measure the paint
in a browser.

---

## Notes for whoever changes any of this

- **The budget does not move.** It is `1000 / 60`, derived from NFR-1.1. If the frame exceeds it, the
  answer is code or a change of mechanism — never a wider threshold. That is a standing preference,
  recorded in `deferred-work.md`'s bundle-gate entry as well.
- **The fixture is part of the budget.** Changing `createBenchmarkRoster` changes what the gate
  means. `benchmarkRoster.test.ts` will fail first; that failure is the conversation.
- **`bench` is never Turbo-cached.** A cached benchmark replays an old measurement and prints
  `>>> FULL TURBO` while measuring nothing.
- **Phase 2 is the whole cycle.** Any future performance work that is not Phase 2 work is
  measurement theatre at these ratios.
