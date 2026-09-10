---
baseline_commit: d3ce92b
---

# Story 3.6: Phase 3 & the Assembled Cycle

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a user,
I want battles to resolve competition exactly by the documented rules,
so that outcomes are fair, deterministic under a seed, and Conway-faithful.

## Acceptance Criteria

From `epics.md#Story 3.6: Phase 3 & the Assembled Cycle`, decomposed into what a reviewer can check
independently. AC8–AC14 are repo-derived: they come from obligations that shipped code already
names — `claims.ts`'s five invariants, `doubleBuffer.ts`'s stale-frame contract, `grid.ts`'s
two-conventions note, `maxRelevantAge.ts`'s "Story 3.6's cycle-end step applies it", and Story 3.5's
FD1/FD2, which left `SimulationDeps` and `threePhaseStep`'s signature to this story.

1. **Phase 3 resolves each contested cell by Dominance, and the roster lookup is `ref - 1`.**
   `deps.organisms[ref - 1].dominance` (M14, `grid.ts`'s `occupant` note). ❌ `organisms[ref]` is
   not a crash — it compares the Dominance of the organism *next* to the claimant and produces
   plausible battles no golden names. ⚠️ Two conventions ship in one deps object and both are
   right: `evaluatorsByRef[ref]` (Story 3.5) **and** `organisms[ref - 1]` (this story).

2. **Ties break randomly through the injected seeded RNG** — `deps.rng.int(n)`, never `Math.random`
   (AR-19, FR-5.4). The RNG is **injected**, seeded fixed in tests and fresh in production ("config,
   not outcome" — A-2: no seed is persisted or exported).

3. **The RNG is drawn from ONLY on a genuine tie.** A single top claimant must not consult the
   generator. This is pinned with a counting stub `Rng` that **throws** when called on an
   uncontested cell: drawing per cell would burn ~6,000 draws a cycle at the NFR-1.1 baseline, and
   it silently couples every seeded golden to grid content, so a later change to *when* we draw
   re-rolls every recorded outcome.

4. **Survive and Born claims compete uniformly — a birth CAN evict a surviving incumbent**
   (FR-5.4, M10 H-6, RFC-004 §3.2). Incumbency confers no protection beyond its own Dominance.
   ❌ No `if (action === 'survive') return incumbent` shortcut, no incumbent bonus, no ordering of
   the claim run that puts survivors first. Pinned in **both directions** — a suite that only shows
   an eviction being *refused* proves nothing about H-6.

5. **Relative Cell-State gating keeps eviction opt-in** (Decision C, AR-20, FR-5.4). An ordinary
   Born rule (`cellState eq empty`) never produces a claim on an occupied cell, so it never
   contests an incumbent — PRD **UJ-1 "Blue holds its corner"** holds under H-6. This is a
   property of Phase 2's subject materialization, already shipped; AC5 is the *test* that pins the
   end-to-end consequence through the assembled cycle.

6. **Every cell of the destination is written each cycle, claimed or not — and an unclaimed
   occupied cell is CLEARED.** This is implicit death (M10, FR-5.2), and it is the load-bearing
   sweep of the story: iterating the claims arrays alone leaves every non-claiming occupant
   standing, which makes Conway's Classic (no `die` rule at all) a grid that only ever grows.
   Phase 3 sweeps **all `width * height` cells** with a cursor into the claims arrays — never the
   claims alone. A cleared cell writes `occupant = 0` **and** `age = 0` (`doubleBuffer.ts`'s
   stale-frame obligation, inherited from Phase 1: after two swaps the back buffer holds cycle
   N−2's frame).

7. **Aging: a survivor ages `+1`, a birth resets to `0`, and stored age saturates at
   `CompiledSession.maxRelevantAge`** (FR-5.1/5.6, Decision B.5, AR-20). The winning claim's
   **action** decides — never "winner === incumbent", because an incumbent may legitimately win
   with a `born` claim (a rebirth, age reset; `claims.ts` invariant 3). ⚠️ `min(age + 1, max)`,
   **not** `min(age, max) + 1` — the second overshoots the clamp by one, forever.

8. **⚠️ Age advances regardless of `agingEnabled`.** FR-2.4 states the toggle "affects visual
   rendering only; cell-age tracking (FR-5.6) is unaffected — age remains engine state and a rule
   input whether or not the visual effect is shown", and RFC-002 §(`refToGroup`) consumes it at
   render time (Story 3.9's `ageShade = agingEnabled ? min(age,7) : 7`). ❌ Do **not** gate the
   increment on it. See **Spec-conflict flags** — two shipped comments predict the opposite and
   must be corrected by this story.

9. **`threePhaseStep` assembles the three phases and `SimulationDeps` is declared here**
   (RFC-004 §3.1/§3.2, Story 3.5's FD1). The composed step is the single unit Stories 3.7 (bench),
   3.8 (loop), 3.9 (rendering), 3.10 (hook) and 4.15 (preview) consume — see **FD1/FD2** for the
   two signature decisions this story owns and the RFC divergence they close.

10. **Conway golden-pattern suite passes end to end** (AR-40): **blinker** period-2 (returns to its
    exact start after 2 cycles), **glider** translating one cell diagonally every 4 cycles on a
    grid large enough that the hard edges never participate, and **still-lifes** (block, beehive)
    byte-identical after N cycles. ⚠️ Hard edges, no wrap (FR-5.8/5.9) — `neighborhood.ts` names the
    glider golden as the thing the modulo idiom breaks "at some grid sizes and not others".

11. **The Conway age golden.** Conway's Classic has no `age` literal, so `maxRelevantAge` is
    `max(7, 0 + 1) = 7`. A blinker's centre cell survives every cycle: after 10 cycles its stored
    age is **7**, not 10, while the two flanking cells are re-born at age **0** each cycle. One
    fixture pins the clamp, the `+1`, the birth reset and the survive/born distinction at once.

12. **Curated multi-organism conflict scenarios match hand-computed expected grids** (AR-40), built
    from `createMockOrganisms()` compiled through `compileSession` — never hand-built evaluators.
    At minimum: an eviction **refused** on Dominance (Chaotic Spreader, 20, claims an Aggressive
    Colonizer cell, 80, and loses), an eviction **won** (a purpose-compiled high-Dominance invader
    over an incumbent's `survive`, the Story 3.5 FD4 precedent), and a **tie** resolved by the
    seeded RNG with the winner asserted as a literal for `FIXED_SEED`.

13. **Property tests hold** (AR-41, `fast-check`):
    - **Same seed ⇒ identical run.** Two independent sessions over the same start grid and roster,
      each with its own `createSeededRng(FIXED_SEED)`, produce byte-identical `occupant` and `age`
      after N cycles. ⚠️ Two *fresh* generators, not one shared instance — a shared instance makes
      the test pass for the wrong reason.
    - **No cell is both born and dead in one cycle** — a cell that receives a winning claim is
      occupied afterwards, and one that receives none is empty. Stated over the assembled step.
    - **The source is never mutated.** `threePhaseStep` writes only the destination the caller
      supplied; the front grid's `occupant` and `age` are byte-identical afterwards, and no
      returned buffer aliases a source buffer (the `phasePurity.test.ts` shape, extended).

14. **Phase 3 consumes `claims.ts`'s contiguity contract as a single linear pass.** One cursor, one
    run detector, **no `Map`, no per-cell array, no allocation inside the sweep** (`claims.ts`,
    invariant 1: "Reordering the Phase-2 scan breaks Phase 3"). ⚠️ `Math.max(...claimants.map(…))` —
    RFC-004 §3.2's illustrative snippet — allocates a mapped array plus a spread per contested cell
    inside the frame budget; see **FD3**.

## Tasks / Subtasks

- [x] **Task 1 — Settle the forced decisions before writing code** (AC: 1, 9, 13, 14)
  - [x] Read **Dev Notes → Forced decisions (FD1–FD5)** end to end and record the option taken and
        *why* in the Dev Agent Record. **FD1 (`threePhaseStep`'s signature) and FD2 (`SimulationDeps`'s
        shape) are inherited by Stories 3.7, 3.8, 3.9, 3.10 and 4.15** — every consumer of the engine
        from here on is typed by what you choose. This is the story where the engine's public step
        contract is fixed.
  - [x] Read the shipped files that specify your seam **before** designing it:
        `src/strategy/claims.ts` (the five invariants, in full), `src/strategy/phaseDeps.ts`
        (the directory charter + `PhaseDeps`), `src/grid/doubleBuffer.ts` (the stale-frame
        obligation and the in-place plan), `src/grid/grid.ts` (`occupant`'s two-conventions note),
        `src/session/compileEvaluators.ts` (`CompiledSession`), `src/session/maxRelevantAge.ts`.
        Each carries a comment naming what **this** story owes it.

- [x] **Task 2 — `Rng`, and where the production generator lives** (AC: 2, 3; **FD4**)
  - [x] Declare `Rng` in `packages/simulation` — the name `@gol/test-utils` deliberately did not
        publish (`seededRng.ts`: *"@gol/simulation owns that name and declares it in Epic 3"*).
        Shape: `{ int(maxExclusive: number): number }`, uniform over `[0, maxExclusive)`.
  - [x] Decide **FD4**: does this story ship a production `createRng`, or declare only the interface?
        Record the owner either way — a `SimulationDeps.rng` no production code can construct is how
        `@gol/test-utils` ends up imported from `apps/web` three stories later.
  - [x] Pin that `createSeededRng`'s structural return type satisfies `Rng` (a type-level
        assignability pin, the `domainRuleSetCompatibility.test.ts` idiom).

- [x] **Task 3 — Phase 3: `conflictPhase`** (AC: 1–7, 14)
  - [x] Sweep **every** cell index `0 .. width*height - 1`, advancing a cursor through
        `claims.cellIndex`. For a cell with no claims: write `0` / `0`. For a cell with a run:
        resolve the run and write the winner.
  - [x] Resolve a run **without allocating** (FD3): one pass for `maxDominance` + tie count, then
        either take the single top claimant or draw `rng.int(tieCount)` and take the k-th claimant
        at `maxDominance` on a second pass.
  - [x] Write the winner: `occupant = winningRef`; `age = action === 'born' ? 0 : min(previousAge +
        1, deps.maxRelevantAge)`. The **previous age** is the incumbent's age on the *post-death*
        grid Phase 2 scanned — read it before the write (see the in-place safety argument in
        Dev Notes).
  - [x] ❌ Never branch on `'die'` — `claims.ts` invariant 5 makes it unreachable, and handling it
        as a live case or "tightening" the type is a spec change (Story 3.4's Decisions Needed #2).
  - [x] ❌ No `dominance` comparison that reaches for the evaluators table, and no re-evaluation of
        any rule. Phase 3 reads claims, dominance and the RNG — nothing else.

- [x] **Task 4 — The assembled cycle: `threePhaseStep`** (AC: 6, 7, 9)
  - [x] Compose per **FD1**'s chosen signature: Phase 1 into the destination, Phase 2 reading it,
        Phase 3 finishing over it. `doubleBuffer.ts` already describes this plan verbatim — *"the
        post-death intermediate IS `back`, Phase 2 only reads it, and Story 3.6's Phase 3 finishes
        in place over it before the swap"*.
  - [x] Declare `SimulationStrategy` and the MVP `activeStrategy = threePhaseStep` per RFC-004
        §3.1, matching whichever signature FD1 lands on. ⚠️ **No registry, no descriptor, no
        `beta` flag, no per-battle selection** — RFC-004 §3.1 defers all of it explicitly.
  - [x] Verify the composition against a stub-evaluator session (no rules at all) — §3.5's claim
        that the engine "can be tested with stub evaluators and no rules" is worth one test.

- [x] **Task 5 — Conway goldens** (AC: 10, 11)
  - [x] Build fixtures with `@gol/test-utils`'s `gridFromPattern` → `@gol/simulation`'s
        `gridFromDense`; assert via `gridToDense` so a failure prints a readable grid.
  - [x] Blinker (period 2), glider (4-cycle diagonal translation, on a grid with clearance),
        block and beehive (stable). Compile `CONWAYS_CLASSIC` through `compileSession`.
  - [x] The age golden of AC11 — centre saturating at 7 while the ends re-birth at 0.

- [x] **Task 6 — Multi-organism conflict goldens** (AC: 4, 5, 12)
  - [x] Eviction **refused**: Chaotic Spreader's `CHAOTIC_BORN` (`cellState eq occupied` +
        `organismType eq aggressiveColonizer`, dominance 20) loses to Aggressive Colonizer's
        `AGGRESSIVE_SURVIVE` (dominance 80). Story 3.5 proved the claim exists; this asserts who wins.
  - [x] Eviction **won**: a purpose-compiled invader out-dominating an incumbent's `survive` claim,
        with the evicted cell's age asserted as **0** (a birth, not an inherited age).
  - [x] Gating (AC5/UJ-1): an ordinary empty-cell Born rule never appears in a contested cell's run
        at all — assert the **absence**, which is what makes eviction opt-in rather than default.
  - [x] A Dominance **tie** with the winner asserted as a literal under `FIXED_SEED`, plus the
        AC3 stub proving no draw happens on uncontested cells.

- [x] **Task 7 — Properties** (AC: 13)
  - [x] The three `fast-check` properties of AC13, over generated grids **and** generated rosters
        (the Story 3.5 review extended the purity properties to rosters — keep that).

- [x] **Task 8 — Barrel, comments, boundary, scope** (AC: all)
  - [x] Export the new surface from `packages/simulation/src/index.ts`; types with
        `export type { … }` (`isolatedModules`).
  - [x] ❌ Nothing lands in or is imported backwards from `src/engine/`; `npm run boundary:check`
        stays green and is **not widened**.
  - [x] **Update every shipped comment that predicts this story** so it names what shipped (the
        Story 3.3 AC9 / 3.4 AC10 / 3.5 precedent). Known sites, all verified present:
        `strategy/phaseDeps.ts` (the directory charter's "— Story 3.6's —" line **and** the
        `agingEnabled` claim, which AC8 contradicts), `strategy/claims.ts` (invariant 3's "Story
        3.6 sets…"), `strategy/deathPhase.ts` (three sites, incl. the FD2 "flagged, not amended"
        note), `strategy/birthSurvivalPhase.ts` (three sites), `grid/doubleBuffer.ts` (the `back`
        writer obligation, now discharged for the whole cycle), `grid/grid.ts` (`occupant`'s
        two-conventions note and `age`'s "aging and the clamp are Story 3.6's cycle-end step"),
        `gol/cellSubject.ts` (`age`'s "Story 3.6's cycle-end step is what APPLIES it"),
        `gol/resolveCellAction.ts` ("The cycle-end write that finally removes it is Story 3.6's"),
        `session/maxRelevantAge.ts` (both sites), `session/compileEvaluators.ts` (the
        `dominance`/`agingEnabled` line in `CompilableOrganism`'s FD1 note),
        `session/validateRules.ts` (the 65534 bound's "the clamp Story 3.6 applies"),
        `grid/neighborhood.ts` (two sites — the glider golden now exists; say so),
        `engine/operators.ts` (`range`'s "breaks every golden pattern in Story 3.6" — the goldens
        now exist and this is the story that would catch it), `index.ts` (four sites).
  - [x] ⚠️ A shipped comment naming a **future** story stays as it is. Only rewrite what named 3.6.

- [x] **Task 9 — Verify, and report what actually ran**
  - [x] `npx vitest run --coverage` in `packages/simulation` — the package is at **100%** after 3.5;
        note it in the record if it moves. (The ≥90% gate itself flips on in 3.7, not here.)
  - [x] `npx eslint packages/simulation`, `node scripts/check-engine-boundary.mjs`,
        `node scripts/check-spec-ids.mjs`, `npx prettier --check packages/simulation`.
  - [x] `npm run ci` — full local gate. ⚠️ **Never pipe it.** `npm run ci | tail` reports *tail's*
        exit code; redirect to a file and echo `$?`. Report the real result.
  - [x] **Mutation-check the load-bearing invariants** (the Story 3.5 record's table is the
        format): each of AC1's `ref - 1`, AC3's draw-only-on-tie, AC4's uniform competition, AC6's
        full sweep, AC7's `min(age + 1, max)` and AC8's ungated increment must **redden a named
        test**. An invariant that survives its own mutation is untested.

### Review Findings

Code review 2026-09-10 (Fable 5.1, `bmad-code-review`: Blind Hunter + Edge Case Hunter + Acceptance
Auditor, each on a fresh context). **1 `decision-needed` (resolved by Sidiar 2026-09-10 — the
RFC amendment, applied), 12 `patch` (all applied), 1
`defer`, 1 dismissed as noise** (an unchecked `maxRelevantAge` range — a documented `compileSession`
precondition, `maxRelevantAge.ts`). FD4 was weighed as the deliberate exception it is and holds:
the alternatives are a banned test-utils import or an untestable third copy, and the differential
pin is what makes the duplication non-silent — the review kept the pair identical (patch 3).

- [x] [Review][Decision] **RFC-004 §3.1/§3.2 amendment — RESOLVED: apply as drafted.** Sidiar
      authorized it on 2026-09-10; all four edits are applied verbatim from the draft under
      **Spec-conflict flags raised** below (the `SimulationStrategy` signature + its
      destination-passing note, the `threePhaseStep` composition, the `resolveConflict` note, and
      the §3.1 `organisms` clarification). One edit beyond the draft: Risk 6's "`step` is pure
      given `(grid, deps)`" named the signature the amendment replaces, so it now reads
      `(source, deps)` — a consequence of the four, flagged rather than assumed. The three code
      comments that carried the divergence (`index.ts`, `deathPhase.ts`, `threePhaseStep.ts`) now
      record it as resolved.
- [x] [Review][Patch] AC1's dedicated off-by-one pin was vacuous — `rosterOf(90, 10, 5)` elects
      ref 1 under BOTH `organisms[ref - 1]` (90 v 10) and `organisms[ref]` (10 v 5); the mutation
      table's "54 tests fail" came from other fixtures CRASHING on `undefined.dominance`, the
      opposite of the "not a crash" case AC1 warns about
      [packages/simulation/src/strategy/conflictPhase.test.ts] — roster is now `(90, 10, 50)`
      (mutant elects ref 2), verified by mutation to redden.
- [x] [Review][Patch] The glider goldens cannot detect a wrapping neighbourhood, and two rewritten
      comments (`neighborhood.ts` "THE DETECTOR NOW EXISTS", the `conwayGoldens` header) claimed
      they do — both fixtures keep the glider clear of every edge (AC10), where a modulo idiom is
      byte-identical to hard edges on every size
      [packages/simulation/src/grid/neighborhood.ts, packages/simulation/src/strategy/conwayGoldens.test.ts]
      — added the real detector: 32 cycles on 8x8, where wrapping returns the glider exactly to its
      start and hard edges collapse it into a corner block (asserted as the exact grid); verified by
      mutating `neighborTally.ts` to wrap — the new test reddens, the three translation goldens do
      not. Both comments now say which fixture detects what.
- [x] [Review][Patch] `int(n)` with `n > 2^32` HANGS — `UINT32_RANGE % n` is the whole range, so
      `limit` is 0 and the rejection loop never exits — exactly where the guard promises to catch a
      hand-built caller [packages/simulation/src/strategy/rng.ts,
      packages/test-utils/src/seededRng.ts] — the guard now refuses `n > 2^32` in BOTH copies (FD4's
      pair stays identical; the differential test's 1..256 bounds could not see this), pinned in
      each package's test.
- [x] [Review][Patch] An injected `Rng` returning an out-of-range or fractional draw silently elected
      the FIRST top claimant — every tie to the lowest ref, the exact bias rejection sampling
      exists to remove, presenting as a deterministic battle; a realistic Story 3.10 adapter
      mistake (`{ int: () => Math.random() }`) [packages/simulation/src/strategy/conflictPhase.ts]
      — pass 2 now throws naming the bound and the draw; one comparison per contested tie, never
      per cell. Pinned for 7, 2, -1 and 0.5.
- [x] [Review][Patch] The two "rejection sampling" tests pass for plain modulo — range-only
      assertions, and `int(3)`'s bias is 1 in 2^32 [packages/simulation/src/strategy/rng.test.ts]
      — added a raw-draw oracle (`int(2^32)` returns the raw draw): for `bound = 2^31 + 1` the
      sampler must skip an inadmissible opening draw and continue from the one after; deleting the
      `while` reddens this test and nothing else in the file (mutation-verified). The range test is
      retitled to what it actually pins.
- [x] [Review][Patch] An out-of-order or off-grid claim stalls the cursor and silently clears the
      REST of the grid — not "one cell", as `birthSurvivalPhase.ts`'s comment said — and reads as a
      legitimate extinction [packages/simulation/src/strategy/conflictPhase.ts,
      packages/simulation/src/strategy/birthSurvivalPhase.ts] — one check AFTER the sweep (never per
      cell): unconsumed claims throw, naming how many; both comments corrected; pinned for a
      decreasing index and an index off the grid.
- [x] [Review][Patch] `maxDominance = -1` sentinel assumes FR-2.2's 1..100 range the `number` type
      does not state — a run of negative Dominances elected the first claimant
      [packages/simulation/src/strategy/conflictPhase.ts] — pass 1 now seeds from the first
      claimant; pinned with `(-5, -1)` → ref 2.
- [x] [Review][Patch] The seed guard's comment claimed to rule out "two nominally different seeds
      replaying one sequence" while `seed >>> 0` still aliases integers that agree modulo 2^32
      (`Date.now()` is already above it) [packages/simulation/src/strategy/rng.ts,
      packages/test-utils/src/seededRng.ts] — comments now state exactly what is and is not ruled
      out and direct Story 3.8/3.10 to mint inside `[0, 2^32)`; range ENFORCEMENT is deferred (below).
- [x] [Review][Patch] Dead fixture: the k-th-claimant test built an outer `grid` it never passed to
      `conflictPhase`, then asserted on it — testing `gridFromDense`
      [packages/simulation/src/strategy/conflictPhase.test.ts] — removed.
- [x] [Review][Patch] "a winner is always a claimant" was never asserted — the loop `continue`d past
      any occupant it did not recognise, so `ref[winner + 1]` would survive
      [packages/simulation/src/strategy/phasePurity.test.ts] — the written ref is now asserted to
      be one of that cell's claimants before the aging check.
- [x] [Review][Patch] Record slips: the Change Log's "15 shipped comments" (27 sites across 14
      files); mutation rows 1, 2 and 4 cited counts rather than the named test Task 9 asked for
      [docs/implementation-artifacts/3-6-phase-3-the-assembled-cycle.md] — corrected; row 1 now
      names the (repaired) pin.
- [x] [Review][Patch] Three rewritten comment lines ran to 121–164 columns (Prettier does not
      reflow comments), and `deathPhase.ts` quoted a `doubleBuffer.ts` sentence that file does not
      contain (pre-existing; fixed in passing) [packages/simulation/src/strategy/deathPhase.ts,
      packages/simulation/src/session/validateRules.ts] — rewrapped; the quote is now a paraphrase.
- [x] [Review][Defer] Enforce the seed domain (`0 <= seed < 2^32`) in `createRng` / `createSeededRng`
      [packages/simulation/src/strategy/rng.ts] — deferred, belongs with the story that mints seeds:
      `@gol/test-utils`'s twin has a test accepting negative seeds, so rejecting them is a contract
      change to another package, and the pair must move together (FD4). Recorded in
      `deferred-work.md` for Story 3.8/3.10.

## Dev Notes

### Constraints the developer MUST follow

- **Scope: Phase 3 and the assembled `step()`.** Benchmarks, the coverage-gate flip and the M12
  guard re-measurement are **3.7**. The RAF loop, its time accumulator and the delta clamp are
  **3.8**. Colour-state batching and `agingEnabled`'s render effect are **3.9**. The React bridge,
  population stats (M2) and cycle publishing are **3.10**. **Extinction auto-pause is 3.15** —
  ❌ do not add an emptiness check, a `stopped` flag, or any notion of "the run is over" here.
  `threePhaseStep` is a pure reducer with no opinion about whether it should be called again.
- **No classes, no `this`, no module-level mutable state** (AR-16). The caller owns the buffers, the
  RNG and the session (`GridBuffers` — 3.3 FD3, the session cache — 3.4, `Claims` — 3.5 FD3 all took
  this shape for the same reason).
- **No DOM types, no React, no Zod in `packages/*`.** `tsconfig.base.json` is `lib: ["ES2022"]`. No
  `node:` builtins, no `structuredClone`. Validation happened at the session boundary (3.4) and at
  persistence — never per cell.
- **Nothing lands in, or is imported backwards from, `src/engine/`.** Phase 3 knows organisms,
  dominance and grids by construction. `eslint.config.mjs` + `scripts/check-engine-boundary.mjs`
  enforce it and must not be widened.
- **`src/gol/` and `src/strategy/` do not import `@gol/domain`** (Story 3.2 FD1: the edge is
  test-only). Declare organism-shaped inputs locally — and then **M13 binds**: a type duplicated
  across the domain/engine seam is pinned in `src/domainRuleSetCompatibility.test.ts`. Follow
  `CompilableOrganism`'s precedent exactly (forward assignability from `@gol/domain`'s `Organism`,
  no mapping layer).
- **Grid dimensions are parameters, never constants** (Decision A). Read `width`/`height` off the
  grid. Play mode expands to 200×120 (H-9).
- **Strict TS, no escape hatches.** No `any`, no `@ts-ignore`, no non-null `!`.
- **camelCase file names, never dotted.**
- **Comments explain WHY**, cite the governing ID, and name the failure they prevent —
  `spec:check`-enforced (it fails the build on an ID that resolves to nothing). Write IDs exactly
  as the specs spell them (`M10`, `AR-19`, `FR-5.4`, `Decision B.5`); a hyphenated `M-10` matches
  nothing and is silently exempt forever.
- **Commit gate stands** — never stage or commit without Sidiar's explicit go-ahead, even on a green
  `npm run ci`. (A story subagent under `implement-next-story` may push to its own `story/*` branch;
  merging is always Sidiar's call.)

### What this story is, in one paragraph

3.1 shipped the domain-blind cascade, 3.2 bound it to the Game of Life, 3.3 shipped the typed-array
grid, 3.4 shipped the session boundary, and 3.5 shipped Phases 1 and 2 — *who is explicitly killed*
and *who is asking to be here next cycle*. **Nothing so far completes a cycle.** This story answers
*who wins*, writes the cell, ages it, and — for the first time in the repo — turns a grid at cycle N
into a grid at cycle N+1. It is also where the engine's **public step contract** is fixed:
`SimulationDeps`, `Rng`, `SimulationStrategy` and `threePhaseStep`'s signature are all declared here
and consumed unchanged by 3.7's benchmark, 3.8's loop, 3.9's renderer, 3.10's hook and 4.15's
preview. Get the shape wrong and five later stories inherit it.

### The buffer plan, and why Phase 3 may write in place

`doubleBuffer.ts` already describes the intended flow, and Story 3.5's FD2 built Phase 1 for it:

```
front  = cycle N (rendered)
deathPhase(front, back, deps)          -> back  = post-death intermediate   (Phase 1 writes every cell)
birthSurvivalPhase(back, deps)         -> claims                             (Phase 2 only READS back)
conflictPhase(back, claims, deps)      -> back  = cycle N+1                  (Phase 3 finishes in place)
swapGridBuffers(buffers)               -> front = cycle N+1
```

**In-place is safe in Phase 3 and was NOT safe in Phase 1**, and the difference is worth stating
because it looks like an inconsistency. Phase 1 reads *neighbours*, so writing into the grid it
scans makes an earlier cell's death change a later cell's subject (3.5's AC2). Phase 3 reads only
**cell `i`'s own** previous age, and every cell is read-then-written exactly once in index order, so
no cell's result depends on another's. The saving is real: allocating a third grid would cost a
`Uint8Array(N)` + `Uint16Array(N)` per cycle, up to 20×/s — the per-cycle allocation Decision A.6's
steady-state budget and the double buffer exist to avoid.

⚠️ **`assertDistinctSameSize` is Phase 1's guard, not Phase 3's.** Phase 3 has one grid. Don't copy
the check across and don't delete it from `deathPhase`.

### Forced decisions (record the option taken and why in the Dev Agent Record)

**FD1 — `threePhaseStep`'s signature. This is the story's biggest decision.**
RFC-004 §3.1 declares `type SimulationStrategy = (grid: Grid, deps: SimulationDeps) => Grid` and
§3.2's snippet composes three allocating phases. Story 3.5 diverged (`deathPhase(source,
destination, deps)`) and **flagged the RFC edit as riding with this story's signature.**
- **(a) `threePhaseStep(source, destination, deps): Grid`** — mirrors `deathPhase`'s shipped shape;
  the caller owns both grids and performs the swap. Story 3.8's loop then holds `GridBuffers` and
  does `buffers = swapGridBuffers({ ...buffers })` after each step.
- **(b) `threePhaseStep(buffers: GridBuffers, deps): GridBuffers`** — the step owns the swap and
  returns the new pair; `swapGridBuffers` is already pure and returns a new pair value, so this
  composes cleanly and gives 3.8 a one-liner.
- **(c) Keep §3.1 literally** — allocate a fresh `Grid` per call. Rejected on the same grounds
  3.5's FD2 rejected it; recorded here only so the record shows it was considered.

*Recommendation: **(a)**.* It keeps one shape across all three phases, keeps `SimulationStrategy`
assignable to something a stub can satisfy in a test, and leaves the buffer *identity* question
(who holds the pair, when it swaps) to Story 3.8, which is where the loop and its refs live.
(b) is attractive but bakes double-buffering into the strategy type, which then can't describe
3.9's preview instance or 4.15's draft-organism run without carrying a `GridBuffers` each. ⚠️
Whichever you choose, **`SimulationStrategy` must be assignable from `threePhaseStep`** — declaring
a type the only implementation doesn't satisfy is worse than not declaring it.

⚠️ **The RFC-004 §3.1/§3.2 amendment does NOT ride along automatically.** Amending an authority doc
is Sidiar's call (the M14/M15 precedent: Story 3.4 recorded the tension and declined to mint
unilaterally). **Raise it in Spec-conflict flags with the exact proposed wording and wait** — do not
edit `RFC-004` in this story without an explicit go-ahead.

**FD2 — What is in `SimulationDeps`, and what type is `organisms`?**
RFC-004 §3.1 (as amended by M15) names three members: `evaluatorsByRef`, `organisms:
OrganismRuntime[] // dense array; dominance, agingEnabled, …`, and `rng`. Story 3.5's FD1
deliberately left the whole thing to this story.
- **(a) A minimal local `OrganismRuntime` carrying only `dominance`** — the `CompilableOrganism`
  precedent (3.4 FD1), which declined to import `@gol/domain`'s `Organism` and declined to reserve
  fields nothing reads.
- **(b) §3.1's fuller shape including `agingEnabled`** — matches the RFC's comment literally.

*Recommendation: **(a)**, and see **AC8**: `agingEnabled` is a **render** input (FR-2.4, RFC-002's
`refToGroup`), not an engine one. Putting it on `SimulationDeps` publishes a field the engine must
never read and invites exactly the bug AC8 forbids. ⚠️ `maxRelevantAge` also has to reach Phase 3 —
decide whether it rides on `SimulationDeps` or is passed alongside, and say which. It comes from
`CompiledSession`, which already carries `evaluatorsByRef`; a `SimulationDeps` that a
`CompiledSession` plus an `Rng` plus a roster satisfies structurally is the cheapest thing for
Story 3.10 to construct.

⚠️ **`SimulationDeps` must satisfy `PhaseDeps` structurally** — that is the whole basis of 3.5's
FD1 ("a wider object satisfies the narrower parameter structurally, so no adapter is needed when it
lands"). If you find yourself writing an adapter, the shape is wrong. Pin it: pass a
`SimulationDeps` straight to `deathPhase` and `birthSurvivalPhase` in a test, with no mapping.

**FD3 — How is a contested run resolved without allocating?**
§3.2's `resolveConflict` snippet is `Math.max(...claimants.map(r => …))` then `.filter(…)` — two
array allocations plus a spread **per contested cell**, inside the frame budget. It is illustrative
pseudocode in the same sense §3.2's phase signatures were (3.5's FD2).
- **(a) Follow the snippet.** Readable; allocates 2 arrays per contested cell per cycle.
- **(b) Two linear passes over the run, zero allocation.** Pass 1 records `maxDominance`, the tie
  count and the first top claimant's position. If the count is 1, done. Otherwise draw
  `k = rng.int(count)` and pass 2 walks the run to the k-th claimant at `maxDominance`.
- **(c) Single-pass reservoir selection** — one pass, `rng` drawn per new tie encountered.
  Rejected on sight: it violates **AC3** (draws on cells that end up uncontested) and makes the
  number of draws depend on claim order.

*Recommendation: **(b)**.* It is a restructuring of the loop, not a speculative optimisation — the
same argument 3.5's FD5 made for the neighbour tally, and the same measurement discipline: 3.7 is
where a number could justify anything cleverer.

**FD4 — Where does the PRODUCTION `Rng` come from?**
`@gol/test-utils` ships `createSeededRng` (mulberry32, rejection-sampled) and deliberately does
**not** export an `Rng` type, because `@gol/simulation` owns that name. But test-utils is test-only:
`eslint.config.mjs` bans importing it from `apps/web` production code, and `packages/*` has no such
ban yet (`deferred-work.md` tracks that gap).
- **(a) Ship `createRng(seed: number): Rng` in `@gol/simulation` now.** One production
  implementation, property-testable next to the engine it feeds. Cost: mulberry32 exists twice.
  Pin the duplication with a **differential sequence test** — `@gol/test-utils` is already a devDep
  of `@gol/simulation`, so a test can assert both generators produce the same sequence from the same
  seed, turning drift into a red test (M13's spirit).
- **(b) Declare `Rng` only; defer the factory to 3.8/3.10.** Matches 3.1/3.4/3.5's "declare no name
  for what you do not build". Cost: the field is unconstructible outside tests until then, and the
  natural fix at 3.10 is either a test-utils import in production or a third mulberry32 invented in
  `apps/web`, where it cannot be property-tested.
- ❌ **Not an option:** making `@gol/test-utils` depend on `@gol/simulation`. It would close a
  dependency cycle (`simulation` devDepends on `test-utils`) for a 20-line generator.

*Recommendation: **(a)**, with the differential pin.* This is the one place the "build nothing
speculative" rule points the wrong way: the thing being deferred is not a name, it is the only
non-test way to construct a required field.

**FD5 — Does `conflictPhase` take `Claims` plus the grid, or is it folded into `threePhaseStep`?**
- **(a) A separate exported `conflictPhase(grid, claims, deps): Grid`** — matches §3.2's three-call
  composition and the epic's framing ("the M10 precedence semantics are individually testable" was
  3.5's rationale and applies equally here).
- **(b) Inline the resolution inside `threePhaseStep`** — fewer moving parts, but Phase 3 stops
  being unit-testable against hand-built `Claims`, and every Dominance test then has to route
  through a whole cycle.

*Recommendation: **(a)**.* Hand-built `Claims` are the cheapest way to pin AC1–AC4; the goldens then
test the composition rather than doing double duty.

### Traps

1. **`organisms[ref]` instead of `organisms[ref - 1]`** (M14). Silent: it compares the neighbour
   organism's Dominance. `grid.ts`'s `occupant` doc names this trap and the two coexisting
   conventions explicitly.
2. **Iterating `claims` instead of sweeping the grid** (AC6). Every unclaimed occupant survives
   forever; Conway's Classic — which expresses *all* of its death implicitly — becomes a monotonically
   growing blob. Looks like a working simulation. The blinker golden fails; a "does something happen"
   smoke test does not.
3. **`min(age, max) + 1`** instead of `min(age + 1, max)` (AC7). Off by one above the clamp, forever;
   invisible unless a fixture runs past `maxRelevantAge`, which is why AC11's 10-cycle blinker exists.
4. **Deriving the age update from `winner === incumbent`** instead of the claim's `action`
   (`claims.ts` invariant 3). An incumbent that wins with a `born` claim is a rebirth and must reset
   to 0. No single-organism fixture can see this.
5. **Gating the age increment on `agingEnabled`** (AC8). Two shipped comments predict it; FR-2.4
   forbids it. The symptom is that a non-aging organism's rules that condition on `age` never fire.
6. **Drawing from the RNG on uncontested cells** (AC3).
7. **Assuming a `survive` claim's incumbent is still there.** It is — Phase 1 wrote the post-death
   grid and Phase 2 read it, and FD4-of-3.5 dropped every non-incumbent `survive` — but the age you
   read must come from **that** grid, not from `front`. If FD1 lands on (a), `front` is still around
   and reading it is a one-character mistake that yields pre-death ages.
8. **Wrapping the Uint16 age buffer.** `outAge[i] = value` wraps silently at 65536. The clamp is what
   keeps it in range (`validateRules.ts` caps literals at 65534 for exactly this reason) — so clamp
   *before* the write, not after.
9. **Treating `'die'` as a live case in Phase 3** (`claims.ts` invariant 5, Story 3.4's Decisions
   Needed #2). Unreachable by construction; do not handle it and do not narrow the type.
10. **Reordering the Phase-2 scan** to "make Phase 3 easier". `claims.ts` invariant 1 states the
    contiguity contract and names this as the way it breaks silently.
11. **The modulo neighbour idiom** — not this story's code, but `neighborhood.ts` names the glider
    golden as its detector: a wrapping neighbourhood makes AC10 pass at some grid sizes and fail at
    others. If the glider golden is flaky across grid sizes, suspect the neighbourhood, not the test.
12. **`range` exclusivity** — `operators.ts` says an exclusive upper bound "breaks every golden
    pattern in Story 3.6, three stories after the bug is written". Conway survives on `range [2,3]`.
    If every pattern dies on cycle 1, check the operator before the phase.
13. **A tie-break golden asserted without a fixed seed.** `FIXED_SEED` is stable across runs *by
    contract*; `Math.random` in a fixture makes the suite flaky in CI only.
14. **Extinction.** A grid that empties is not an error and not a stop condition here (Decision B.5,
    Story 3.15). ⚠️ And note the counter-intuitive companion rule for later: still-lifes, oscillators
    and gliders must **keep running** — a test asserting "a still-life auto-stops" looks correct and
    encodes a spec violation.

### Spec-conflict flags (project-context: surface new conflicts, don't silently pick one)

- **🔴 `agingEnabled` is described as an engine input in two shipped comments and as render-only in
  the PRD.** `strategy/phaseDeps.ts` says *"`organisms`' `agingEnabled` is Story 3.6's cycle-end
  step"*, and `session/compileEvaluators.ts` says *"`dominance` and `agingEnabled` are Phase 3's and
  Story 3.6's"*. **FR-2.4 is explicit the other way**: *"This toggle affects visual rendering only;
  cell-age tracking (FR-5.6) is unaffected — age remains engine state and a rule input whether or not
  the visual effect is shown."* RFC-002 consumes it at render time (`ageShade = agingEnabled ?
  min(age,7) : 7`, Story 3.9). **Resolution for this story: age advances unconditionally (AC8), and
  the two comments are corrected to say so** (Task 8). RFC-004 §3.1's `organisms: OrganismRuntime[]
  // dense array; dominance, agingEnabled, …` is a *comment on a deferred type*, not a claim that the
  strategy reads it — no RFC amendment is proposed, but say so in the record rather than leaving it
  ambiguous.
- **🟡 RFC-004 §3.1/§3.2's allocation-shaped signatures vs. the shipped destination-passing phases.**
  Story 3.5 resolved it for `deathPhase` (its FD2) and flagged the RFC edit as riding with
  `threePhaseStep`'s signature — i.e. with **this** story. Draft the exact §3.1/§3.2 wording, put it
  in the Dev Agent Record, and **wait for Sidiar's go-ahead before editing the RFC.** ❌ Do not mint a
  Minor Resolution unilaterally (the M14/M15 precedent).
- **🟡 §3.2's `resolveConflict` snippet** allocates per contested cell (FD3). Same species as the
  above: illustrative pseudocode, not a shape contract. Flag it with the signature edit rather than
  as a separate item.
- **Surface any NEW conflict you find** rather than silently picking a side. New conflicts are
  signal, not noise.

### What NOT to build (scope boundaries)

- ❌ No RAF loop, time accumulator, delta clamp or `msPerCycle` (Decision D, **3.8**).
- ❌ No extinction check, auto-pause or run status (Decision B.5, **3.15**).
- ❌ No population counts or per-organism tallies (M2, **3.10/3.14**) — they are a derived view at
  ≤10 Hz, never engine state, never computed per cycle.
- ❌ No rendering, colour LUT, `refToGroup` or `ageShade` (**3.9**).
- ❌ No React, no hook, no refs (**3.10**).
- ❌ No benchmark file, no `vitest bench`, no coverage-threshold change (**3.7**). If you find a hot
  spot, write it into a comment the way 3.3's FD4 and 3.5's cost notes did, and let 3.7 measure it.
- ❌ No strategy registry, descriptor, `beta` flag or per-battle strategy selection (RFC-004 §3.1
  defers all of it).
- ❌ No new dependency. No change to `vitest.config.ts`, `tsconfig.json`, `turbo.json`, or the CI
  workflow.

### Testing standards summary

- **Vitest** per package (`packages/simulation/vitest.config.ts` already exists). `fast-check@^4.9.0`
  is a **root** devDependency, hoisted — do not add it to the package.
- **Fixtures come from `@gol/test-utils`** (`gridFromPattern`, `emptyGrid`, `placePattern`,
  `createMockOrganisms`, `CONWAYS_CLASSIC`, `createSeededRng`, `FIXED_SEED`). ❌ Don't hand-roll a
  grid builder or a fake RNG for anything a fixture already covers — a *counting/throwing* stub `Rng`
  for AC3 is the legitimate exception, because no fixture can express "must not be called".
- **Determinism is a precondition** — the tie-break RNG is injected with a fixed seed in tests;
  never assert on unseeded randomness.
- **Prove domain-agnosticism** — nothing in this story may push GoL knowledge into `src/engine/`.
- Coverage is a **floor on the core, not a target**: don't write a test whose only purpose is to
  raise the number. The gate flips on in 3.7; the package happens to sit at 100% today.
- **Mutation-check** every load-bearing invariant (Task 9) — the Story 3.5 record's table is the
  format to reproduce.

### External dependencies / versions

None new. Node 24, TypeScript 5.9.3 (strict, `isolatedModules`, `lib: ["ES2022"]`), Vitest 4.1.10 +
`@vitest/coverage-v8`, `fast-check` 4.9.0 (root devDep). `@gol/simulation` depends on `@gol/domain`
(test-only edge, Story 3.2 FD1) and devDepends on `@gol/test-utils`.

## Project Structure Notes

New files land in `packages/simulation/src/strategy/`, whose charter comment in `phaseDeps.ts`
already names them: *"what belongs here is per-CYCLE code that WALKS THE GRID … and — Story 3.6's —
Phase 3 and the assembled `threePhaseStep`."*

Expected shape (names are the charter's; adjust only with a recorded reason):

- `packages/simulation/src/strategy/conflictPhase.ts` — Phase 3 (FD5).
- `packages/simulation/src/strategy/threePhaseStep.ts` — the assembled step, `SimulationDeps`,
  `SimulationStrategy`, `activeStrategy` (FD1/FD2).
- `packages/simulation/src/strategy/rng.ts` *(FD4, option (a))* — `Rng` + `createRng`. If FD4 lands
  on (b), `Rng` still needs a home; put it beside `SimulationDeps` rather than inventing a file.
- Tests beside each, plus the goldens and properties. `phasePurity.test.ts` is the existing home for
  purity properties — extend it rather than starting a parallel file.

⚠️ **Not** `src/engine/` (domain-blind, boundary-lint enforced), **not** `src/gol/` (decides about
one cell), **not** `src/session/` (once per battle run), **not** `src/grid/` (representation with no
notion of a rule).

Barrel additions go in `packages/simulation/src/index.ts` under the existing strategy-layer block,
whose comment currently says Phase 3 and `Rng` "are Story 3.6's" — rewrite it to describe what
shipped.

## References

- [Source: docs/planning-artifacts/epics.md#Story 3.6: Phase 3 & the Assembled Cycle] — the ACs.
- [Source: docs/planning-artifacts/epics.md#AR-19/AR-40/AR-41] — injected seeded RNG; golden-pattern
  suite; property-based tests.
- [Source: docs/planning-artifacts/rfcs/RFC-004-simulation-rules-engine.md#3.1] — `SimulationDeps`,
  `SimulationStrategy`, `activeStrategy`; strategy owns cross-action prioritization; registry/descriptor
  deferred.
- [Source: docs/planning-artifacts/rfcs/RFC-004-simulation-rules-engine.md#3.2] — `threePhaseStep`,
  `resolveConflict`, the H-5/H-6 precedence prose, relative-Cell-State gating, implicit-death timing.
- [Source: docs/planning-artifacts/rfcs/RFC-004-simulation-rules-engine.md#3.3] — aging (+1 / reset to
  0), `MAX_RELEVANT_AGE`, hard-edge Moore neighbourhood, extinction-only auto-stop (out of scope here).
- [Source: docs/planning-artifacts/architecture.md#Decision B] — B.5: `MAX_RELEVANT_AGE = max(7,
  maxAgeLiteral + 1)`, `Uint16Array` age buffer, extinction-only auto-stop.
- [Source: docs/planning-artifacts/architecture.md#Minor Spec Resolutions] — **M10** (cross-action
  precedence is strategy-owned; H-5/H-6; implicit death at cycle end), **M14** (`ref = index + 1`;
  `organisms[ref - 1]`), **M15** (phase-partitioned evaluator pair; there is no `deps.resolveAction`).
- [Source: docs/planning-artifacts/prds/prd-GameOfLife-2026-05-26/prd.md#FR-5.4] — Dominance, random
  tie-break, uniform Survive/Born competition, relative-Cell-State gating, UJ-1.
- [Source: docs/planning-artifacts/prds/prd-GameOfLife-2026-05-26/prd.md#FR-5.6] — age +1 per cycle
  alive, reset to 0 on rebirth.
- [Source: docs/planning-artifacts/prds/prd-GameOfLife-2026-05-26/prd.md#FR-2.4] — **the
  `agingEnabled` toggle is rendering-only; cell-age tracking is unaffected.**
- [Source: docs/implementation-artifacts/3-5-phases-1-2-death-claims.md#Dev Agent Record] — FD1
  (`SimulationDeps` is 3.6's), FD2 (destination-passing; the RFC edit rides with this story), FD3
  (the `Claims` shape), FD4 (non-incumbent `survive` dropped), FD5 (the neighbour tally), FD6 (the
  `strategy/` directory), Trap 14 (fail-closed on an out-of-roster ref).
- [Source: packages/simulation/src/strategy/claims.ts] — the five invariants Phase 3 depends on.
- [Source: packages/simulation/src/grid/doubleBuffer.ts] — the stale-frame obligation and the
  in-place plan for Phase 3.
- [Source: packages/simulation/src/grid/grid.ts] — `occupant`'s M14 note and the two coexisting
  ref conventions; `age`'s "aging and the clamp are Story 3.6's cycle-end step".
- [Source: packages/simulation/src/session/compileEvaluators.ts] — `CompiledSession`,
  `OrganismEvaluators`, `CompilableOrganism`'s minimal-local-type precedent.
- [Source: packages/simulation/src/session/maxRelevantAge.ts] — the number, and the three ways to
  compute it wrong.
- [Source: packages/test-utils/src/seededRng.ts] — mulberry32 + rejection sampling; the deliberate
  absence of an exported `Rng` type.
- [Source: packages/test-utils/src/mockWorkspace.ts] — the three mock organisms, their Dominance
  (80 / 45 / 20) and `CHAOTIC_BORN`'s occupied-cell targeting.
- [Source: docs/project-context.md] — repo-wide rules: no classes in the engine, no DOM types in
  `packages/*`, dimensions are parameters, injected seeded RNG, `MAX_RELEVANT_AGE` arithmetic, the
  commit gate, and the pipe-swallowed-exit-code warning.

## Dev Agent Record

### Agent Model Used

claude-opus-5 (Opus 5)

### Forced Decisions

**FD1 — `threePhaseStep`'s signature → option (a), `(source, destination, deps) => Grid`.**
It keeps ONE shape across all four strategy functions (`deathPhase` already ships it, Story 3.5's
FD2), and it leaves the buffer-IDENTITY question — who holds the pair, when it swaps — to Story
3.8, where the loop and its refs live. Option (b) (`(buffers: GridBuffers) => GridBuffers`) gives
3.8 a one-liner but bakes double-buffering into the strategy TYPE, which then cannot describe Story
3.9's preview instance (M3) or Story 4.15's draft-organism run without each carrying a pair; option
(c) (allocate per §3.1 literally) was rejected on the same grounds 3.5's FD2 rejected it — a
`Uint8Array(N)` + `Uint16Array(N)` up to 20×/s is the per-cycle allocation Decision A.6's budget and
the double buffer exist to remove. `SimulationStrategy` is declared to match and `activeStrategy:
SimulationStrategy = threePhaseStep` is where `tsc` checks the two never drift.

**FD2 — `SimulationDeps` → option (a), a minimal `OrganismRuntime` carrying `dominance` alone; and
`maxRelevantAge` RIDES ON the deps.** `SimulationDeps extends PhaseDeps, ConflictDeps` — it is the
union of the phases' own read-sets and nothing invented. `ConflictDeps` and `OrganismRuntime` are
declared in `phaseDeps.ts` beside the phases that read them (the file's existing job), and
`SimulationDeps` in `threePhaseStep.ts`. `maxRelevantAge` on the deps rather than passed alongside
means a `CompiledSession` spread with a roster and an `Rng` satisfies the WHOLE interface with no
construction step — the cheapest thing for Story 3.10 to build, and pinned as such. ❌ No
`agingEnabled`: see AC8 and the spec-conflict flag below.

**FD3 — contested-run resolution → option (b), two linear passes, zero allocation.** Pass 1 records
`maxDominance`, the tie count and the first top claimant's position; if the count is 1 it is done,
otherwise it draws `rng.int(count)` and pass 2 walks to the k-th claimant at that Dominance. §3.2's
`Math.max(...claimants.map(…))` + `.filter(…)` allocates a mapped array plus a spread per contested
cell inside the frame budget. Option (c) (reservoir selection) was rejected on sight: it violates
AC3 by drawing on cells that end up uncontested, and makes the number of draws depend on claim
order. This is a restructuring of the loop, not a speculative optimisation — the same argument
3.5's FD5 made for the neighbour tally.

**FD4 — production `Rng` → option (a), `createRng(seed)` ships in `@gol/simulation` now, with the
differential pin.** ⚠️ **This is a deliberate exception to the repo's "declare no name for what you
do not build" rule, and the reviewer should weigh it as one.** The thing being deferred under
option (b) is not a name: `SimulationDeps.rng` is a REQUIRED field, so without a production factory
Story 3.10's only ways to fill it are a `@gol/test-utils` import from production code (banned in
`apps/web` by `eslint.config.mjs`, banned inside `packages/*` only by convention —
`deferred-work.md` tracks the gap) or a third mulberry32 invented in `apps/web`, where nothing can
property-test it. Cost: mulberry32 now exists twice. That duplication is made NON-SILENT by a
differential `fast-check` test asserting `createRng` and `createSeededRng` produce identical
sequences from the same seed (M13's spirit), plus a type-level pin that `createSeededRng`'s
structural return satisfies `Rng`. ⚠️ `createRng` does NOT default or mint a seed: "fresh seed in
production" is a policy about a RUN, decided where a run starts (3.8/3.10), and a defaulted seed
would make "which seed did this battle use" unanswerable at the call sites that need to answer it.
❌ Not considered: `@gol/test-utils` depending on `@gol/simulation` — that closes a dependency cycle.

**FD5 — `conflictPhase` is a separate exported function** taking `(grid, claims, deps)`, per option
(a). Hand-built `Claims` are the cheapest way to pin AC1–AC4/AC6/AC7 (25 tests in
`conflictPhase.test.ts` never compile a roster), which lets the goldens test the COMPOSITION rather
than doing double duty.

**Structural note (not a listed FD).** `ConflictDeps` and `OrganismRuntime` landed in
`phaseDeps.ts`, not in `threePhaseStep.ts`, because that file's stated job is "what a phase reads
off the session"; `SimulationDeps` stays in `threePhaseStep.ts` as the story's structure section
specified. This keeps each phase's read-set declared beside the phase, and makes `SimulationDeps`
derived (`extends PhaseDeps, ConflictDeps`) rather than restated.

### Debug Log References

No blocked paths, no HALT conditions, no rework loops. Every golden fixture was hand-computed
before it was run and passed on first execution, including the Conway blinker/glider/still-lifes,
the multi-organism eviction grids and the AC11 age golden.

One coverage regression appeared and was closed: `@gol/simulation` dropped from 100% to 99.72%
statements on `rng.ts`'s rejection-sampling loop body. With a bound like `int(3)` exactly one value
in 2^32 is discarded, so no ordinary fixture reaches it. Closed with a real test rather than an
exclusion: `int(2 ** 31 + 1)` rejects roughly HALF of every draw, which is both the loop's only
genuine workout and the strongest statement of why plain modulo is wrong.

### Completion Notes List

- **Phase 3 (`conflictPhase.ts`)** sweeps all `width * height` cells with a single cursor into the
  claims arrays — never the claims alone (AC6/AC14). A cell with no claim is written `occupant = 0`
  **and** `age = 0`, which is implicit death (M10) and discharges `doubleBuffer.ts`'s stale-frame
  obligation for the second half of the cycle. Writing in place is safe here and was not in Phase 1:
  Phase 3 reads only cell `i`'s own previous age, and every cell is read-then-written exactly once
  in index order. ⚠️ `assertDistinctSameSize` was deliberately NOT copied across — Phase 3 has one
  grid by design.
- **Aging** is `action === 'born' ? 0 : min(previousAge + 1, maxRelevantAge)`, keyed off the
  WINNING CLAIM'S ACTION, never `winner === incumbent` (`claims.ts` invariant 3). No branch on
  `'die'` was added and the type was not narrowed (invariant 5, Story 3.4's Decisions Needed #2).
- **The generator is consulted only on a genuine tie** — `if (tieCount > 1)`. Pinned by a stub
  `Rng` that throws, and by a counting stub asserting the exact call sequence `[3, 2]` across a
  grid with one three-way tie, one uncontested cell and one two-way tie.
- **`threePhaseStep`** composes the three phases and returns the destination. The SWAP is the
  caller's (Story 3.8). One `SimulationDeps` value reaches all three phases with **no adapter**,
  which is the structural claim Story 3.5's FD1 deferred to this story — pinned rather than
  restated.
- **Scope held.** No RAF loop, accumulator or `msPerCycle` (3.8). No extinction check, auto-pause or
  run status (3.15) — and the goldens deliberately assert the counter-intuitive companion rule: a
  still-life, an oscillator and a glider all KEEP RUNNING. No population counts (3.10). No
  rendering, colour LUT or `ageShade` (3.9). No benchmark or coverage-threshold change (3.7). No
  strategy registry, descriptor or `beta` flag (RFC-004 §3.1 defers all of it). No new dependency,
  no config change.
- **Comment sweep (Task 8).** Every shipped comment naming Story 3.6 was rewritten to describe what
  shipped: `strategy/phaseDeps.ts` (charter + the `agingEnabled` correction), `strategy/claims.ts`,
  `strategy/deathPhase.ts` (×4), `strategy/birthSurvivalPhase.ts` (×4), `grid/doubleBuffer.ts` (×2),
  `grid/grid.ts` (×2), `grid/neighborhood.ts` (×2), `gol/cellSubject.ts`, `gol/resolveCellAction.ts`,
  `session/compileEvaluators.ts` (the `agingEnabled` correction), `session/maxRelevantAge.ts` (×2),
  `session/validateRules.ts`, `engine/operators.ts`, `index.ts` (×3). ⚠️ `session/internOrganisms.ts`
  was left alone deliberately — its "Stories 3.5/3.6/3.8" line names a FUTURE story as part of a
  boundary statement, and the story's own rule is that such comments stay.
- **Coverage:** `@gol/simulation` is back at **100%** statements / branches / functions / lines
  (369 statements, 229 branches, 62 functions), 361 tests in the package. The ≥90% gate itself still
  flips on in Story 3.7 — nothing here changed `vitest.config.ts`.

**Verification actually run (Task 9):**

| Command | Result |
|---|---|
| `npx tsc --noEmit -p packages/simulation/tsconfig.json` | exit 0 |
| `npx vitest run --coverage` (in `packages/simulation`) | exit 0 — 21 files, **361 tests passed**, 100% stmts/branch/funcs/lines |
| `npx eslint packages/simulation` | exit 0 |
| `node scripts/check-engine-boundary.mjs` | exit 0 — 7 escape shapes rejected, 2 legitimate imports accepted (not widened) |
| `node scripts/check-spec-ids.mjs` | exit 0 — 204 cited ids all resolve; 3 reconciliation citations resolve against 6 declared |
| `npx prettier --check packages/simulation` | exit 0 (after one `--write` pass) |
| `npm run ci` (redirected to a file, **not piped** — exit code echoed) | **exit 0** — full gate incl. 344 Playwright e2e in 3m7s |

**Mutation check — every load-bearing invariant reddens a NAMED test:**

| # | Mutation | Result |
|---|---|---|
| 1 | `organisms[ref - 1]` → `organisms[ref]` (AC1, M14) | **54 tests fail** across 5 files (58 after review) — ⚠️ but, as the review found, the one NAMED pin (*"reads organisms[ref - 1], not organisms[ref] — the silent off-by-one"*) shipped vacuous and the rest were crashes; repaired in review (`(90, 10, 50)`), the named pin now reddens — see **Review Findings** |
| 2 | `if (tieCount > 1)` → `>= 1` (AC3, draw only on a tie) | **42 tests fail** — `forbiddenRng` throws throughout, incl. *"never consults the generator when there is a single top claimant"* and *"never reaches the tie-break — 80 against 20 is not a tie (AC3)"* |
| 3 | incumbency bonus (`action === 'survive' ? 101 : …`) (AC4, H-6) | **5 tests fail**, incl. *"a higher-Dominance BIRTH evicts a surviving incumbent"*, *"order within the run does not privilege the survivor"* |
| 4 | drop the clear-branch writes — iterate claims only (AC6) | **17 tests fail**, incl. *"an occupied cell nobody claimed is gone at cycle end — implicit death"*, the blinker and both still-lifes |
| 5 | `min(age + 1, max)` → `min(age, max) + 1` (AC7) | **7 tests fail**, incl. *"is min(age + 1, max), NOT min(age, max) + 1"* and the AC11 age golden |
| 6 | age keyed off `winner === incumbent` instead of the action | **10 tests fail**, incl. *"a birth resets to 0 even when the INCUMBENT wins it"* |
| 7 | add `agingEnabled` to `OrganismRuntime` (AC8) | **`tsc` fails** at the exact-key-set pin in `domainRuleSetCompatibility.test.ts` + 6 more sites |

### Spec-conflict flags raised

**🔴 RESOLVED IN CODE — `agingEnabled` is a RENDER input, not an engine one.** Two shipped comments
claimed it was this story's cycle-end input (`strategy/phaseDeps.ts`: *"`organisms`' `agingEnabled`
is Story 3.6's cycle-end step"*; `session/compileEvaluators.ts`: *"`dominance` and `agingEnabled`
are Phase 3's and Story 3.6's"*). **FR-2.4 is explicit the other way** and wins: *"This toggle
affects visual rendering only; cell-age tracking (FR-5.6) is unaffected — age remains engine state
and a rule input whether or not the visual effect is shown."* RFC-002 consumes it at render time
(Story 3.9's `ageShade`). Resolution as the story directs: **age advances unconditionally**, both
comments are corrected in place, `OrganismRuntime` carries `dominance` ALONE, and the exact key set
is pinned in `domainRuleSetCompatibility.test.ts` so the field cannot creep back in. **No RFC
amendment is proposed for this** — RFC-004 §3.1's `organisms: OrganismRuntime[] // dense array;
dominance, agingEnabled, …` is a comment on a type the RFC deferred, not a claim that the strategy
reads the field, so there is nothing in the RFC that is actually wrong. Stated here rather than left
ambiguous.

**✅ RESOLVED 2026-09-10 — RFC-004 §3.1/§3.2's allocation-shaped signatures.** Story 3.5 resolved
this for `deathPhase` (its FD2) and flagged the RFC edit as riding with `threePhaseStep`'s
signature — i.e. with this story. The story deliberately did **not** edit the RFC (the M14/M15
precedent: amending an authority doc is not a story's call); **Sidiar authorized it after review**,
and the wording drafted below was applied verbatim. One further edit followed from it and is called
out because it was not in the draft: Risk 6 read "`step` is pure given `(grid, deps)`" — the exact
signature being replaced — and now reads `(source, deps)`. The three code comments that flagged the
divergence as pending (`index.ts`, `deathPhase.ts`, `threePhaseStep.ts`) now record it as resolved.
The wording is kept below as the record of what was applied.

**Proposed RFC-004 §3.1 edit** — replace:

```ts
// A strategy is a pure stepping function. (Functional Strategy pattern.)
export type SimulationStrategy = (grid: Grid, deps: SimulationDeps) => Grid
```

with:

```ts
// A strategy is a pure stepping function over a CALLER-SUPPLIED destination (Story 3.6 FD1).
// It writes `destination` and returns it; the caller owns both grids and performs the swap.
export type SimulationStrategy = (source: Grid, destination: Grid, deps: SimulationDeps) => Grid
```

and add, immediately after that block:

> **Destination-passing, not allocation.** The signature reads `(source, destination, deps)` rather
> than `(grid, deps) => Grid` because allocating a fresh `Grid` per call costs a `Uint8Array(N)` plus
> a `Uint16Array(N)` up to 20 times a second — 18 KB at 100×60, 72 KB at 200×120 — which is precisely
> the per-cycle allocation Decision A.6's steady-state memory budget and the double buffer (§3.4,
> AR-17) exist to remove. The destination IS `back`; Phase 1 writes it, Phase 2 only reads it, and
> Phase 3 finishes in place over it. **The swap is the caller's**, deliberately: making the strategy
> own a `GridBuffers` would prevent the type describing Story 3.9's preview instance (M3) or Story
> 4.15's draft-organism run, neither of which holds a persistent pair.

**Proposed RFC-004 §3.2 edit** — replace the composition snippet:

```ts
const threePhaseStep: SimulationStrategy = (grid, deps) => {
  const afterDeath = deathPhase(grid, deps)               // Phase 1 (FR-5.2)
  const claims     = birthSurvivalPhase(afterDeath, deps) // Phase 2 (FR-5.3)
  return conflictPhase(claims, deps)                       // Phase 3 (FR-5.4)
}
```

with:

```ts
const threePhaseStep: SimulationStrategy = (source, destination, deps) => {
  deathPhase(source, destination, deps)                     // Phase 1 (FR-5.2): destination = post-death intermediate (H-5)
  const claims = birthSurvivalPhase(destination, deps)      // Phase 2 (FR-5.3): READS the intermediate; 'born'|'survive', parallel
  return conflictPhase(destination, claims, deps)           // Phase 3 (FR-5.4): resolves IN PLACE — Dominance, random tie-break (H-6)
}
```

and replace §3.2's `resolveConflict` snippet:

```ts
function resolveConflict(claimants: OrganismRef[], deps: SimulationDeps): OrganismRef {
  const maxDom = Math.max(...claimants.map(r => deps.organisms[r - 1].dominance))   // ref - 1: M14
  const top = claimants.filter(r => deps.organisms[r - 1].dominance === maxDom)
  return top.length === 1 ? top[0] : top[deps.rng.int(top.length)]   // random tie-break
}
```

with a note in its place:

> **Conflict resolution is a two-pass scan over the claim run, with no allocation.** The snippet
> previously shown here (`Math.max(...claimants.map(…))` then `.filter(…)`) is *illustrative of the
> rule*, not of the shape: it allocates a mapped array plus a spread per contested cell, inside the
> frame budget. The shipped Phase 3 sweeps **every** cell of the grid — not the claims — advancing
> one cursor through the contiguous per-cell claim runs Phase 2 guarantees, and resolves each run in
> two passes: one for `maxDominance` and the tie count, and a second only when the count exceeds 1,
> walking to the `deps.rng.int(count)`-th claimant at that Dominance. **The generator is drawn from
> only on a genuine tie** — a draw per cell would burn ~6,000 draws a cycle at the NFR-1.1 baseline
> and couple every seeded golden to grid content. A cell with no claim is written empty with age 0,
> which is where implicit death (M10) is actually applied.

⚠️ Also worth Sidiar's eye when the above is applied: §3.1's `organisms: OrganismRuntime[] // dense
array; dominance, agingEnabled, …` would read more accurately as `readonly organisms:
readonly OrganismRuntime[] // roster-indexed: organisms[ref - 1] (M14); dominance only — agingEnabled
is a RENDER input (FR-2.4)`. That is a clarification of an already-correct line, not a correction.

### File List

**New**

- `packages/simulation/src/strategy/conflictPhase.ts`
- `packages/simulation/src/strategy/conflictPhase.test.ts`
- `packages/simulation/src/strategy/threePhaseStep.ts`
- `packages/simulation/src/strategy/threePhaseStep.test.ts`
- `packages/simulation/src/strategy/rng.ts`
- `packages/simulation/src/strategy/rng.test.ts`
- `packages/simulation/src/strategy/conwayGoldens.test.ts`
- `packages/simulation/src/strategy/conflictGoldens.test.ts`

**Modified**

- `packages/simulation/src/strategy/phaseDeps.ts` — `OrganismRuntime` + `ConflictDeps`; charter and
  `agingEnabled` comment corrections
- `packages/simulation/src/strategy/phasePurity.test.ts` — AC13's six assembled-cycle properties
- `packages/simulation/src/strategy/claims.ts` — invariant 3 now names `conflictPhase`
- `packages/simulation/src/strategy/deathPhase.ts` — 4 comment sites
- `packages/simulation/src/strategy/birthSurvivalPhase.ts` — 4 comment sites
- `packages/simulation/src/grid/doubleBuffer.ts` — the obligation is now discharged for the whole
  cycle; the swap-is-the-caller's note
- `packages/simulation/src/grid/grid.ts` — `occupant`'s two-conventions note; `age`'s cycle-end step
  and the unconditional-aging note
- `packages/simulation/src/grid/neighborhood.ts` — the glider detector now exists
- `packages/simulation/src/gol/cellSubject.ts` — `age`'s "what APPLIES it"
- `packages/simulation/src/gol/resolveCellAction.ts` — the cycle-end write now named
- `packages/simulation/src/session/compileEvaluators.ts` — the `agingEnabled` correction
- `packages/simulation/src/session/maxRelevantAge.ts` — 2 comment sites
- `packages/simulation/src/session/validateRules.ts` — the clamp's owner now named
- `packages/simulation/src/engine/operators.ts` — `range` exclusivity: the goldens now exist
- `packages/simulation/src/index.ts` — barrel additions + the strategy-layer block rewritten
- `packages/simulation/src/domainRuleSetCompatibility.test.ts` — M13 pin for `OrganismRuntime`
- `docs/implementation-artifacts/sprint-status.yaml` — 3-6 → review
- `docs/implementation-artifacts/3-6-phase-3-the-assembled-cycle.md` — this record

### Change Log

- 2026-09-10 — Story 3.6 implemented: Phase 3 (`conflictPhase`), the assembled `threePhaseStep`,
  `SimulationDeps` / `SimulationStrategy` / `activeStrategy`, and the production seeded `Rng`.
  Conway golden suite (blinker, glider, block, beehive, the age golden), multi-organism conflict
  goldens (eviction refused, eviction won, relative-Cell-State gating, seeded tie-break), and six
  `fast-check` properties over the assembled cycle. Every shipped comment predicting this story
  (27 sites across 14 files) rewritten to describe what shipped, including two `agingEnabled`
  corrections. Status → review.
- 2026-09-10 — Code review (Fable 5.1, a different model from the implementer): 1 decision-needed
  left OPEN for Sidiar (the RFC-004 §3.1/§3.2 amendment), 12 patches applied, 1 deferred — see
  **Review Findings**. Two named pins that shipped vacuous now redden under mutation (AC1's
  `organisms[ref]`, the wrapping-neighbourhood detector); three silent contract failures now throw
  (`int(n > 2^32)` hang in both mulberry32 copies, an `Rng` draw outside `[0, tieCount)`, an
  unconsumed claim after the sweep). +6 tests (367; 100% coverage unchanged), +1 in
  `@gol/test-utils`. Status stays `review` pending the decision.
- 2026-09-10 — **RFC-004 §3.1/§3.2 amended on Sidiar's explicit go-ahead**, closing the one
  decision-needed finding: four edits applied as drafted, plus Risk 6's purity line which named
  the replaced signature. The three code comments flagging the divergence as PENDING now record it
  as resolved. Status → done.

Dev Model: opus   # this story fixes the engine's public step contract (SimulationDeps, Rng, SimulationStrategy, threePhaseStep's signature) plus the RNG-ownership and in-place-write patterns that stories 3.7-3.10 and 4.15 all inherit — it sets the pattern rather than following one.

---

This story was implemented with the 'Implement next story' skill with the following stats:

| Phase | Agent model | Agents | Wall clock | Input | Output | Cache write | Cache read | Total tokens |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Step 0 — re-entry guard | — | 0 | 25s | 20 | 1,602 | 8,355 | 448,510 | 458,487 |
| Step 1 — create-story | opus-5 | 1 | 9m 14s | 178 | 37,002 | 504,241 | 8,571,623 | 9,113,044 |
| Step 2 — dev-story | opus-5 | 1 | 37m 07s | 256 | 88,866 | 444,193 | 19,743,971 | 20,277,286 |
| Step 3 — code review + PR | fable-5-1 | 4 | 2h 12m | 4,676 | 97,436 | 2,638,874 | 17,848,359 | 20,589,345 |
| _of which the orchestrator_ | opus-5 | — | — | 80 | 14,936 | 146,889 | 2,018,897 | 2,180,802 |
| **Total (create-story → PR ready)** | | 6 | **2h 59m** | 5,130 | 224,906 | 3,595,663 | 46,612,463 | **50,438,162** |

Run started 2026-09-10 11:09 CEST; wall clock runs to the point the run stopped for Sidiar's review. Each phase row covers the phase agent, any agents it spawned, and the orchestrator's own turns in that window — the orchestrator row breaks its share out again, it is not additional. Cache reads dominate the token totals and are billed at a fraction of input rate, so read the Input and Output columns for effort and the total only as a ceiling. The orchestrator's final turn is still being written when these numbers are taken.
