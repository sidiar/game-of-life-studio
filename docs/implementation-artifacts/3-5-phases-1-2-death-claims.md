---
baseline_commit: 5e4a082033c9c70ada1f67211cfbeb1e6c1768f1
---

# Story 3.5: Phases 1–2 — Death & Claims

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a developer,
I want the death and birth/survival phases as pure functions,
so that the M10 precedence semantics are individually testable.

## Acceptance Criteria

From `epics.md#Story 3.5: Phases 1–2 — Death & Claims`, decomposed into what a reviewer can check
independently. AC9–AC12 are repo-derived: they come from obligations that shipped code already
names — `doubleBuffer.ts`'s stale-frame contract, `compileEvaluators.ts`'s `evaluatorsByRef`
indexing, Story 3.4's `Decisions Needed` #2, and the `neighborhood.ts` same/other caveat.

1. **Phase 1 evaluates `die` rules only.** `deathPhase` asks each occupied cell's own organism
   `evaluatorsByRef[ref].resolvesToDeath(cell)` and nothing else. The action partition is **Story
   3.4's compile-time work** — this story never filters, sorts, or inspects `payload` (AR-18,
   RFC-004 §2.3/§3.5, M10 H-5). ❌ No call to `resolveCellAction` (the whole-list primitive) from
   either phase.
2. **Death precedes survival, and Phase 1 is internally simultaneous.** Every Phase-1 subject is
   materialized from the **cycle-N grid**, not from a grid being progressively emptied — otherwise a
   cell's death depends on scan order and the result is not a function of the input (FR-5.2, M10
   H-5).
3. **Explicit deaths are removed before Phase 2 counts neighbours.** Phase 2 derives its subjects
   from the **post-death intermediate grid**, which is what makes "the same decision function serves
   both phases; only the input grid changes" true (RFC-004 §3.2).
4. **Implicit death is NOT applied in Phase 1.** A living cell that matches no `die` rule stays on
   the intermediate grid even when it will match no `survive` rule either; it yields no claim and is
   gone at cycle end (Story 3.6's write), but it **counts as a Phase-2 neighbour** until then — the
   property that preserves Conway's simultaneous-generation semantics (M10). ⚠️ Conway's Classic has
   **no `die` rule at all**, so `deathPhase` over a Conway battle must return a grid **equal in
   content** to its input. A test asserting otherwise has encoded the wrong model.
5. **Phase 2 evaluates every organism in the roster against every cell**, in parallel — no
   organism-order dependence, no early exit that depends on another organism's answer (FR-5.3).
   Each non-`null` answer becomes a **candidate claim**; `null` means *no rule matched* and yields
   **no claim** — never a death claim (M15, Trap 9 of Story 3.4).
6. **Cell State is materialized relative to the evaluating organism** (Decision C, AR-20): for
   organism `r` on a cell holding `occ` — `empty` when `occ === 0`, `alive` when `occ === r`,
   `occupied` otherwise; `organismType` is `occ`'s ref or `null` when empty; `neighborCount` is the
   **same-organism** Moore count and `occupantNeighborCount` the **other-organism** count, both
   relative to `r` (FR-5.8/5.9, hard edges, no wrap).
7. **A claim carries its action, not just its ref.** Story 3.6 sets a survivor's age to `age + 1`
   and a birth's to `0`; that cannot be re-derived from "winner === incumbent", because an incumbent
   organism can legitimately win with a **`born`** claim (a rebirth, age reset). Dropping the action
   is a silent aging bug with no failing test in any single-organism fixture.
8. **Rule order is first-match priority within the phase** (FR-2.6, M10) — and it is already
   enforced inside the compiled evaluator. This story must not re-order, re-filter or "merge"
   claims from one organism: one organism produces **at most one** claim per cell.
9. **Both phases are pure over their inputs** and property-tested with `fast-check` (AR-41): after
   either call, the source grid's `occupant` and `age` are byte-identical to before, and no returned
   buffer aliases a source buffer. ⚠️ If the phases take a caller-supplied destination (see **FD2**),
   purity is stated over the **source**; the destination is an output, and the property test must
   pin that the *source* is untouched, not that nothing anywhere was written.
10. **The destination is written in full, empties included.** `doubleBuffer.ts` states the obligation
    and names the failure: after two swaps the back buffer holds cycle N−2's frame, so a writer that
    stores only living or changed cells **resurrects two-cycle-old cells**, and nothing in the buffer
    layer can detect it. A cleared cell writes `occupant = 0` **and** `age = 0` — a stale age left
    behind is inherited by whatever is born there next.
11. **`evaluatorsByRef` is REF-indexed, and the roster loop starts at 1.** `evaluatorsByRef[ref]`,
    `length = roster + 1`, slot `0` an explicit `null` (M14/M15). ❌ `for (const e of
    evaluatorsByRef)` calls the `null` slot; ❌ `evaluatorsByRef[ref - 1]` is the off-by-one that
    produces a plausible battle in which every organism runs its neighbour's rules. (The `- 1` form
    is correct for the **roster** array — `organisms[ref - 1]` — which is Story 3.6's, not this
    story's. Two conventions, one deps object.)
12. **Hand-computed fixture grids pin both phases** (AR-40/AR-41): at minimum a Conway blinker
    (Phase 1 no-op; Phase 2 = 1 survive claim on the centre + 2 born claims flanking it on the axis
    the blinker does not occupy, and **no** claims on the two ends, which die implicitly), plus a
    multi-organism grid built from
    `createMockOrganisms()` that exercises an explicit `die` rule in Phase 1 and Chaotic Spreader's
    **born-on-an-occupied-cell** claim in Phase 2 (the H-6 eviction candidate — 3.5 proves the claim
    *exists*; who wins it is 3.6).

## Tasks / Subtasks

- [x] **Task 1 — Settle the forced decisions before writing code** (AC: 5, 7, 9, 10)
  - [x] Read **Dev Notes → Forced decisions (FD1–FD6)** end to end and record the option taken and
        *why* in the Dev Agent Record. **FD1 (deps shape), FD2 (destination vs allocation) and FD3
        (the claims structure) are inherited by Stories 3.6, 3.7 and 3.8** — 3.6 assembles
        `threePhaseStep` on top of exactly what you choose, and 3.7 benchmarks it.
  - [x] Read the shipped files that specify your seam **before** designing it:
        `src/session/compileEvaluators.ts` (`OrganismEvaluators`, `CompiledSession`),
        `src/grid/doubleBuffer.ts` (the stale-frame obligation), `src/grid/neighborhood.ts`
        (`countNeighbors`, same/other), `src/gol/cellSubject.ts` (relative cell state).
        Each carries a comment naming what **this** story owes it.

- [x] **Task 2 — Phase 1: `deathPhase`** (AC: 1, 2, 3, 4, 10, 11)
  - [x] Scan the source grid row-major. For each cell with `occupant !== 0`, materialize a
        `CellSubject` **relative to that occupant** (`state: 'alive'`, `organismType: ref`, the
        stored `age`, the two counts from the **source** grid) and call
        `evaluatorsByRef[ref].resolvesToDeath`.
  - [x] Write the destination cell: cleared (`0`/`0`) when the evaluator says `true`, otherwise a
        verbatim copy of occupant **and** age. Every cell is written — empty source cells included
        (AC10).
  - [x] ❌ Never read the destination while deciding. Reading a partially-written intermediate makes
        Phase 1 order-dependent (AC2) and is invisible in any single-organism fixture.

- [x] **Task 3 — Phase 2: `birthSurvivalPhase`** (AC: 5, 6, 7, 8, 11)
  - [x] For each cell of the post-death grid, for each `ref` in `1..evaluatorsByRef.length - 1`:
        materialize the subject relative to `ref` and call `resolveBirthSurvival`.
  - [x] `null` → no claim. A non-`null` action → append a claim carrying `(cellIndex, ref, action)`
        in the shape **FD3** fixes. ⚠️ Do **not** branch on `'die'` — it is unreachable by
        construction and must not be handled as a live case or "tightened" away (Story 3.4,
        Decisions Needed #2). Comparing `=== 'survive'` for the FD4 rule and passing the action
        through otherwise avoids the question entirely.
  - [x] Apply **FD4**'s rule for a `survive` action from a non-incumbent, and pin it with a test —
        whichever way it goes, it is a semantic decision that must not be made by accident.

- [x] **Task 4 — Neighbour counts for the Phase-2 pass** (AC: 6; **FD5**)
  - [x] Decide per **FD5** whether Phase 2 calls `countNeighbors` once per (cell × organism) or
        builds a per-cell tally once and derives each organism's `(same, other)` from it.
  - [x] Whichever you build, pin it **differentially against `countNeighbors`** — Story 3.3's
        function is the reference implementation of hard-edge Moore counting, and a second counting
        path that disagrees with it is exactly the defect no golden test would name.
  - [x] ⚠️ `same` is `neighborCount` and `other` is `occupantNeighborCount`. Conway's Classic is
        single-organism, so the two readings **coincide** in every single-organism fixture and
        diverge only under `createMockOrganisms()`.

- [x] **Task 5 — Purity and the golden fixtures** (AC: 4, 9, 12)
  - [x] `fast-check` property: over generated grids and rosters, neither phase mutates the source
        grid's buffers, and no returned buffer aliases a source buffer.
  - [x] Hand-computed goldens via `@gol/test-utils`'s `gridFromPattern` + `@gol/simulation`'s
        `gridFromDense`; assert with `gridToDense` so a failure prints a readable grid.
  - [x] The Conway blinker case in AC12, asserted claim-by-claim — including the **absence** of
        claims on the two end cells. That absence is implicit death (M10) and is the single
        assertion that fails if someone "helpfully" collapses `null` into a death.
  - [x] The multi-organism case: Aggressive Colonizer's `die` rule (`alive` + `neighborCount > 5`)
        firing in Phase 1, and Chaotic Spreader's `CHAOTIC_BORN` (`cellState eq occupied` +
        `organismType eq aggressiveColonizer`) producing a born claim **on an occupied cell** in
        Phase 2. Compile the roster through `compileSession` — do not hand-build evaluators.

- [x] **Task 6 — Barrel, boundary, scope** (AC: all)
  - [x] Export the new surface from `packages/simulation/src/index.ts`; types with
        `export type { … }` (`isolatedModules`).
  - [x] ❌ Nothing lands in or is imported backwards from `src/engine/`; `npm run boundary:check`
        stays green and is **not widened**.
  - [x] Update any shipped comment that predicts this story's work so it names what shipped, not
        what is coming — the Story 3.3 AC9 / Story 3.4 AC10 precedent. Known sites:
        `doubleBuffer.ts` ("Stories 3.5/3.6 write into `back` and swap", and the `back` field's
        writer obligation), `grid.ts`'s `occupant` note ("Consequence for Story 3.5/3.6"),
        `cellSubject.ts`'s "Stories 3.5/3.6's per-organism evaluation pass",
        `resolveCellAction.ts`'s "That resolution is Story 3.5/3.6's",
        `neighborhood.ts`'s "they diverge only in Story 3.6's multi-organism goldens" (this story
        makes multi-organism counts observable first — say so).

- [x] **Task 7 — Verify, and report what actually ran**
  - [x] `npx vitest run --coverage` in `packages/simulation` — the package sits at **100%** after
        3.4; note it in the record if it moves.
  - [x] `npx eslint packages/simulation`, `node scripts/check-engine-boundary.mjs`,
        `node scripts/check-spec-ids.mjs`, `npx prettier --check packages/simulation`.
  - [x] `npm run ci` — full local gate. ⚠️ **Never pipe it.** `npm run ci | tail` reports *tail's*
        exit code; redirect to a file and echo `$?`. Report the real result.

### Review Findings

Code review 2026-09-10 (Fable 5.1, `bmad-code-review`: Blind Hunter + Edge Case Hunter + Acceptance
Auditor). 0 `decision-needed`, 11 `patch` (all applied), 1 `defer`, 22 dismissed as noise
(unreachable-by-construction inputs, documented preconditions, or AC-mandated tests).

- [x] [Review][Patch] AC3 was satisfied in code but pinned by no test — the multi-organism fixture
      was split across two unrelated grids, never chained [packages/simulation/src/strategy/birthSurvivalPhase.test.ts]
      — added `deathPhase → birthSurvivalPhase` over BLOCK: the centre gets `survive(1)`+`born(3)`
      over the source grid and NO claim over Phase 1's output, plus the full 20-claim golden.
- [x] [Review][Patch] FD4's drop is of the organism's ANSWER, not a rule: a non-incumbent `survive`
      that wins first-match shadows a later `born` rule on the same cell, and nothing said or
      pinned so [packages/simulation/src/strategy/birthSurvivalPhase.ts:FD4 comment] — documented
      (FR-2.6: falling through would re-rank rules, which AC8 forbids) and pinned both orders.
- [x] [Review][Patch] Header said "no re-filtering of an organism's claims (AC8)" two paragraphs
      above a filter [packages/simulation/src/strategy/birthSurvivalPhase.ts] — reworded to "no
      re-ranking of RULES", pointing at the FD4 drop.
- [x] [Review][Patch] Phase-2 out-of-roster occupant path (Trap 14's "no claim in Phase 2") was
      documented but untested [packages/simulation/src/strategy/birthSurvivalPhase.test.ts] — pinned:
      `occupied`/`organismType 7` for every real organism, ref 7 never asked.
- [x] [Review][Patch] Task 5's "over generated grids **and rosters**" was ticked with a fixed roster
      [packages/simulation/src/strategy/phasePurity.test.ts] — rosters are now
      `fc.shuffledSubarray(createMockOrganisms(), {minLength: 1})`; this also removes the
      hard-coded `REF_CEILING = 3` the stale-frame sentinel depended on.
- [x] [Review][Patch] "never records more than 8 distinct refs" could not reach 8 — generator drew
      refs 0..3 [packages/simulation/src/strategy/neighborTally.test.ts] — refs now 0..9, differential
      loop to 10, plus an explicit 8-distinct-neighbours boundary test (the `touched` overflow is a
      silent no-op that would leave the next cell dirty).
- [x] [Review][Patch] Test title "allocating nothing" asserted only `result === destination` while
      the function allocates a subject per occupied cell [packages/simulation/src/strategy/deathPhase.test.ts]
      — retitled to what it checks.
- [x] [Review][Patch] Test title "no clamp or increment" can only detect the increment half — a
      clamp to `MAX_RELEVANT_AGE` is invisible to every operator by construction (Decision B.5)
      [packages/simulation/src/strategy/deathPhase.test.ts] — retitled and explained.
- [x] [Review][Patch] `phaseDeps.ts` named `dominance` as a `SimulationDeps` member; it is
      `organisms[ref - 1].dominance` [packages/simulation/src/strategy/phaseDeps.ts] — fixed.
- [x] [Review][Patch] Task 6 left forward-looking "Stories 3.5/3.6" comments standing in
      `src/index.ts:42,58` (a file the diff edited), `gol/cellSubject.test.ts`,
      `gol/resolveCellAction.test.ts`, `session/compileEvaluators.test.ts` — updated to name what
      shipped.
- [x] [Review][Patch] Dev Agent Record slips: "7 fast-check properties" (10 shipped, 7 + 3 in
      `neighborTally.test.ts`); File List's `ready-for-dev → in-progress → review` (the commit's
      hunk is `backlog → review`); AC12's "above and below" for a vertical blinker whose births are
      left/right — corrected below and in AC12.
- [x] [Review][Defer] Per-pair `CellSubject` allocation in Phase 2 (~120k/cycle at baseline) and
      Phase 1's full Moore scan for organisms with no `die` rule (Conway's Classic pays it for
      nothing) [packages/simulation/src/strategy/birthSurvivalPhase.ts, deathPhase.ts] — deferred,
      Story 3.7's benchmark; the repo optimises on measurement. Noted in code and
      `deferred-work.md`.

**Dismissed (for the record, so they are not re-raised):** sparse/`undefined` holes in
`evaluatorsByRef` and rosters > 255 (both impossible from `compileSession`; the cap throws in
`internOrganisms.ts`); a hand-built evaluator returning `'die'` (Trap 11 forbids handling it);
buffers shorter than `width * height` (`grid.ts`'s stated invariant); a destination sharing an
`ArrayBuffer` with the source (disjoint-region sharing is legal, identity is the documented seam);
`resolvesToDeath` throwing mid-scan (compiled evaluators fail closed per cell, M12); `age` under
an empty cell (`birthSurvivalPhase` already requires Phase 1's output, which zeroes it); exporting
the phases before `threePhaseStep` exists (Task 6 requires it); the "tautological" alias and
determinism properties (AC9 names them); `fill(0)` vs `touched` clearing (3.7's measurement); the
reversed-roster and second blinker tests (they pin M14 remapping and Trap 3 by name).

## Dev Notes

### Constraints the developer MUST follow

- **Scope: Phases 1 and 2 only.** Phase 3, Dominance, the seeded `Rng`, `threePhaseStep`, aging and
  the `MAX_RELEVANT_AGE` clamp are **3.6**. Benchmarks, the coverage-gate flip and the M12 guard
  removal are **3.7**. The RAF loop is **3.8**. ❌ Nothing here completes a cycle.
- **No classes, no `this`, no module-level mutable state** (AR-16). Every value the phases need is a
  parameter; every value they produce is returned. The caller owns the buffers (Story 3.3's
  `GridBuffers` and Story 3.4's session cache both took this shape, for the same reason).
- **No DOM types, no React, no Zod in `packages/*`.** `tsconfig.base.json` is `lib: ["ES2022"]`. No
  `node:` builtins, no `structuredClone`. Validation happened at the session boundary (3.4) and at
  persistence — never per cell.
- **Nothing lands in, or is imported backwards from, `src/engine/`.** These phases are GoL-aware by
  construction (they know cells, organisms, actions and grids), so they belong in the caller layer.
  `eslint.config.mjs` + `scripts/check-engine-boundary.mjs` enforce it and must not be widened.
- **`src/gol/` does not import `@gol/domain`** (Story 3.2 FD1: the edge is test-only). If a phase
  needs an organism-shaped input beyond `CompiledSession`, declare it locally — and then **M13
  binds**: a type duplicated across the domain/engine seam is pinned **bidirectionally** at the
  level it was duplicated, in `src/domainRuleSetCompatibility.test.ts`.
- **Strict TS, no escape hatches.** No `any`, no `@ts-ignore`, no non-null `!`.
- **camelCase file names, never dotted.**
- **Comments explain WHY**, cite the governing ID, and name the failure they prevent —
  `spec:check`-enforced (it fails the build on an ID that resolves to nothing).
- **Commit gate stands** — never stage or commit without Sidiar's explicit go-ahead, even on a green
  `npm run ci`. (A story subagent under `implement-next-story` may push to its own `story/*` branch;
  merging is always Sidiar's call.)

### What this layer is, in one paragraph

3.1 shipped the domain-blind cascade, 3.2 fixed it to the Game of Life, 3.3 shipped the typed-array
grid and its neighbourhood arithmetic, and 3.4 shipped the session boundary — the compiled,
ref-indexed evaluator pairs. **Everything up to now decides about one cell in isolation.** This
story is the first that *walks the grid*: it turns "what does this organism do here?" into "what
happens to the dish this cycle?", in two of the three steps. It is also the first code in the repo
that runs **inside** the NFR-1.1 frame budget — every earlier engine story ran once per battle or
once per cell-in-a-test. Phase 1 answers *who is explicitly killed*, Phase 2 answers *who is asking
to be here next cycle*, and neither answers *who wins* — that is 3.6, and keeping the two apart is
the whole reason this story exists as its own unit (M10's precedence is only individually testable
if the phases are individually callable).

### Forced decisions (record the option taken and why in the Dev Agent Record)

**FD1 — What do the phases take as `deps`?**
RFC-004 §3.1's `SimulationDeps` (as amended by **M15**) names three members: `evaluatorsByRef`,
`organisms` (dominance, agingEnabled, …) and `rng`. Phases 1–2 read **only `evaluatorsByRef`** —
dominance and the RNG are Phase 3's, `agingEnabled` is 3.6's cycle-end step.
- **(a) Declare a narrow per-phase deps** — e.g. `{ evaluatorsByRef }`, or pass
  `CompiledSession['evaluatorsByRef']` positionally — and let **Story 3.6 compose the full
  `SimulationDeps`** when it has something to put in the other two fields.
- **(b) Declare the whole `SimulationDeps` now**, with `organisms` and `rng` present but unread.

*Recommendation: **(a)**.* Story 3.1 declined to declare `RuleSetCollection` for nothing and 3.4's
FD1 declined `OrganismRuntime` for the same reason: reserving a name for something you do not build
is speculative code, and a `SimulationDeps` published with two unread fields cannot be
tested-as-used. ⚠️ Say in the record **which story owns `SimulationDeps`** (3.6, on this
recommendation) so it is not left ownerless. The phases stay callable from the full deps object
either way — a wider object satisfies a narrower parameter structurally.

**FD2 — Do the phases allocate their output grid, or write into a caller-supplied destination?**
RFC-004 §3.2's snippet reads `deathPhase(grid, deps) => Grid`, which looks like allocate-per-call.
`src/grid/doubleBuffer.ts` — shipped in 3.3, with this story named in its comment — says instead:
*"Stories 3.5/3.6 write into `back` and swap … AR-41's purity still holds, because the input grid is
never written — the destination is a distinct grid the caller supplied."*
- **(a) Allocating:** `deathPhase(grid, deps): Grid`. Matches §3.2 literally. Costs a
  `Uint8Array(N)` + `Uint16Array(N)` **per cycle** (18 KB at 100×60, 72 KB at 200×120) — precisely
  the per-cycle allocation Decision A.6's steady-state memory budget and the double-buffer seam
  exist to avoid.
- **(b) Destination-passing:** `deathPhase(source, destination, deps): Grid`, returning the
  destination for chaining. Zero per-cycle allocation, and it makes the **two**-buffer plan work
  for a **three**-grid pipeline: the intermediate *is* `back`, Phase 2 only reads it, and Phase 3
  finishes in place over it (legal, because claims are fully collected before Phase 3 writes and
  each destination cell depends only on that same cell's prior contents plus its claims).

*Recommendation: **(b)**, and say so plainly in the Dev Agent Record, because it diverges from an RFC
snippet.* It is the shape the shipped buffer seam was built for. ⚠️ Two obligations ride along:
(i) AC9's purity property is over the **source**; (ii) AC10's write-every-cell rule becomes
load-bearing — with (a) a fresh grid is zero-filled and a missed cell is merely empty, with (b) a
missed cell is **cycle N−2's ghost**. If you take (a), state how you keep the per-cycle allocation
out of 3.7's benchmark. ⚠️ Either way, **`threePhaseStep`'s signature is Story 3.6's to write** —
flag the §3.2 snippet divergence, do not amend the RFC here, and do **not** mint a Minor Resolution
(the M14/M15 precedent: that is an authority-doc act requiring Sidiar's explicit authorization).

**FD3 — The claims structure.** This is the interface Story 3.6 consumes and 3.7 benchmarks; it is
the most consequential shape in the story. A claim is `(cellIndex, ref, action)` (AC7).
- **(a) `Map<cellIndex, Claim[]>`** — sparse, readable, and allocates an array per claimed cell plus
  a Map with thousands of entries per cycle.
- **(b) Dense `(Claim[] | undefined)[]` of `width * height`** — one full-size array per cycle, plus a
  sub-array per claimed cell.
- **(c) Flat append-only parallel arrays** — `cellIndex[]`, `ref[]`, `action[]` (or one packed
  `number[]`), appended in the Phase-2 scan order. If the scan is **cell-outer, organism-inner**,
  every claim for a cell is **contiguous**, so Phase 3 is a single linear pass with a run detector
  and needs no map and no per-cell array at all.
- **(d) Typed-array fast path** — `firstRef: Uint8Array` + `firstAction: Uint8Array` sized
  `width * height`, spilling to a Map only for cells with ≥ 2 claims (contested cells are rare).

*Recommendation: **(c)**, with the contiguity stated as a documented invariant of the returned
value rather than an accident of the loop* — Phase 3 will depend on it, and an invariant a consumer
depends on but no one wrote down is how a later loop reorder becomes a silent conflict-resolution
bug. Whatever you pick: it is **a value the caller owns** (no module state, AR-16), it **carries the
action** (AC7), and 3.6 must be able to iterate it without re-scanning the grid. Record what you
rejected and why — 3.7 may come back to this with a measurement.

**FD4 — What happens to a `survive` action from an organism that does not occupy the cell?**
`resolveBirthSurvival` is called for every organism on every cell, so organism B can answer
`'survive'` for a cell it does not hold (e.g. a rule reading `cellState eq occupied` with a
`survive` payload — schema-legal, and `createMockOrganisms()` does not contain one, so no existing
fixture forces the question).
- **(a) Drop it.** "Survive" means *the incumbent stays*; a non-incumbent has nothing to survive, and
  if such a claim won Phase 3 the winner's age would be the **previous occupant's** age + 1, which
  is meaningless. RFC-004 §3.2 states the model: *"A survivor is just the incumbent's own Survive
  claim."*
- **(b) Keep it as an ordinary claim** and let Phase 3 deal with it.

*Recommendation: **(a)**, with a comment naming the age nonsense it prevents, and a test.* ⚠️ The
**mirror case is not symmetric**: an **incumbent** answering `'born'` **is** a legitimate claim (a
rebirth — Phase 3 resets its age to 0), and dropping *that* would be a real defect. This asymmetry
is exactly why the claim carries its action rather than being re-derived from occupancy (AC7).

**FD5 — Neighbour counting in the Phase-2 pass.**
Phase 2 needs `(same, other)` for **every (cell × organism)** pair — 6,000 × 20 at the NFR-1.1
baseline.
- **(a) Call `countNeighbors(grid, col, row, ref)` per pair.** Story 3.3's shipped primitive,
  obviously correct, and it re-reads the same ≤ 8 neighbour slots once per organism — the identical
  work done up to 20 times over (~1M reads/cycle at baseline).
- **(b) One tally per cell.** A single ≤ 8-neighbour pass builds `total` (occupied neighbours) plus
  a small map/array of `ref → count` (at most 8 distinct refs); then for each organism
  `same = tally[ref] ?? 0` and `other = total - same`. One pass per cell instead of one per pair.

*Recommendation: **(b)**, because it is a **restructuring of the loop, not a speculative
optimisation** — (a) provably performs the same reads 20 times, which is not a readability/speed
trade — but this repo optimises on measurement, so: build it, and pin it **differentially against
`countNeighbors`** over generated grids so the second counting path can never silently disagree with
the reference one. Phase 1 keeps calling `countNeighbors` directly (one organism per cell — there is
nothing to amortise). If you take (a), write (b) down in a comment for Story 3.7 the way Story 3.3's
FD4 recorded its packed-integer alternative.

**FD6 — Where do the phases live on disk?**
Story 3.4's FD8 defined `src/session/` as *"anything computed once per battle run and consumed per
cell"*, and explicitly excluded *"anything the RAF loop calls (Stories 3.5/3.6/3.8)"*. So this code
does **not** belong in `session/`, and `engine/` is forbidden outright.
- **(a) A new `src/strategy/`** — the three-phase strategy's home; 3.6 adds `conflictPhase.ts` and
  `threePhaseStep.ts` beside your two files, and the directory name matches RFC-004 §3.1's
  vocabulary (`SimulationStrategy`, `activeStrategy`).
- **(b) A new `src/phases/`** — narrower; leaves 3.6's assembled `step` homeless.
- **(c) Inside `src/gol/`** — mixes "decides about one cell" with "walks the grid", which is the
  distinction the whole package layout encodes.

*Recommendation: **(a)**.* Record what belongs in the new directory and what does not, in a header
comment on the first file (the `src/engine/README.md` model that 3.4's `internOrganisms.ts` followed
without adding a README).

### Traps

1. ⚠️ **`evaluatorsByRef` is REF-indexed; the roster array is INDEX-indexed.** `evaluatorsByRef[ref]`
   with slot 0 an explicit `null`; `organisms[ref - 1]` (3.6's). Both conventions live in the same
   deps object and both are correct in their place. Iterate refs as `for (let ref = 1; ref <
   evaluatorsByRef.length; ref++)` — `for…of` hands you the `null` slot first, and `[ref - 1]` here
   silently runs every organism's neighbour's rules.
2. ⚠️ **`null` from `resolveBirthSurvival` means "no rule matched", never "die"** (M15). Conway's
   Classic has **no `die` rule at all**; collapsing `null` into a death removes cells before Phase-2
   neighbour counting and breaks every golden pattern while looking equivalent.
3. ⚠️ **Implicit death is a Phase-3/cycle-end fact, not a Phase-1 one** (M10). Phase 1 removes
   **only** cells whose `resolvesToDeath` returned `true`. A cell that will match nothing in Phase 2
   is still standing on the intermediate grid and is still counted as a neighbour by every organism
   evaluating around it. This is the single most load-bearing sentence in the story.
4. ⚠️ **Phase 1 must not read its own output.** Materialize every Phase-1 subject from the source
   grid. A loop that clears cells into the grid it is scanning makes an earlier cell's death change
   a later cell's neighbour count — order-dependent, and invisible in a symmetric fixture.
5. ⚠️ **Write every destination cell, empties included** (`doubleBuffer.ts`). The back buffer holds
   cycle N−2's frame after two swaps; a "only write what changed" optimisation resurrects it, and
   nothing in the buffer layer can fail on it. A cleared cell writes occupant `0` **and** age `0`.
6. ⚠️ **`neighborCount` is SAME-organism; `occupantNeighborCount` is OTHER-organism.** The bare name
   reads like "all eight occupied neighbours". Conway's Classic is single-organism, so the two
   readings coincide in every single-organism fixture and diverge only under `createMockOrganisms()`
   — as wrong survival behaviour, with no failing test naming why.
7. ⚠️ **`cellState` (the persisted property name) vs `state` (the `CellSubject` field).** The
   asymmetry is deliberate (`cellSubject.ts`). You materialize `state`; the rules address
   `cellState`.
8. ⚠️ **Hard edges, no wrap** (FR-5.9). Do not reimplement neighbour bounds — `countNeighbors`
   already uses clamped iteration bounds precisely to avoid the modulo idiom, which makes a glider
   wrap and double-counts on a 1-tall grid. If FD5 takes the tally, it must reproduce the *same*
   clamped bounds and be pinned against `countNeighbors`.
9. ⚠️ **Do not clamp, increment, or saturate `age`.** `CompiledSession.maxRelevantAge` is computed
   (3.4) and **applied at cycle end by 3.6**. Phase subjects read the age exactly as stored; a clamp
   here would make a `age gt <literal>` rule behave differently in Phase 1 than at cycle end.
10. ⚠️ **No `dominance`, no `rng`, no tie-breaking, no eviction decision.** Phase 2 emits *candidate*
    claims. If your code compares two claims, you have written Phase 3.
11. ⚠️ **`resolveBirthSurvival`'s return type is deliberately wider than it can produce** — `'die'`
    is unreachable because the partition routed every `die` rule to `resolvesToDeath` (Story 3.4,
    Decisions Needed #2, Sidiar 2026-09-10). ❌ Do not handle `'die'` as a live case and ❌ do not
    narrow the signature "as a cleanup" — that is a spec change against RFC-004 §2.3.
12. ⚠️ **Grid dimensions are parameters, never constants** (Decision A). Read `width`/`height` off
    the `Grid`; a hardcoded 100/60 is a bug, and Play mode reaches 200×120 (H-9).
13. ⚠️ **Do not call `resolveCellAction` from a phase.** It is §2.3's whole-list first-match
    primitive, kept for a *different* strategy; using it here re-scans `die` rules per cell and
    quietly undoes the compile-time partition M10's precedence depends on.
14. ⚠️ **An occupant ref with no evaluator throws from inside the loop.** `evaluatorsByRef[ref]` is
    `OrganismEvaluators | null` *within* range and `undefined` outside it, so a grid carrying a ref
    beyond the compiled roster crashes the cycle on `.resolvesToDeath`. The persisted path is closed
    (`BattleSchema` validates `v <= organismIds.length`), so this is the same **in-memory** class as
    `deferred-work.md`'s other shape entries — 3.4's sweep validates *rules*, not *grids*. Decide and
    record whether to guard (a cheap `=== undefined` per occupied cell, failing closed the way
    `operators.ts` argues for) or to state it as a documented caller precondition; do not leave it
    undecided.
15. ⚠️ **`compileSession` is the only way to get evaluators.** Hand-built `OrganismEvaluators`
    literals in tests skip interning, `MAX_RELEVANT_AGE` and the eager sweep — use them only where a
    test is deliberately isolating a phase from the rules layer (RFC-004 §3.5 explicitly sanctions
    stub evaluators for that), and never for the golden-grid fixtures.

### Spec-conflict flags (project-context: surface new conflicts, don't silently pick one)

- **🟡 NEW — RFC-004 §3.2's phase snippets are allocation-shaped; `doubleBuffer.ts` says the phases
  write into a caller-supplied destination.** See **FD2**. Not a contradiction of substance (the
  RFC's snippet is illustrative pseudocode and the buffer file was written after it, naming this
  story), but if you take (b) the shipped signatures diverge from §3.2's text. Flag it; the
  amendment rides with **`threePhaseStep`, which is Story 3.6's**. ❌ Do not mint an `M16`.
- **🟢 M15 is minted and RFC-004 §3.1 is already amended.** Story 3.4's text said "§3.1's
  `SimulationDeps` signature is the line that needs amending, owned by Story 3.5" — that was done in
  3.4 when M15 was minted (2026-09-10). **There is no §3.1 edit left for this story.** Read §3.1 as
  it stands now (`evaluatorsByRef`), not as 3.4's Dev Notes describe it.
- **🟢 `CLAUDE.md:21` still says the authoritative Minor Resolutions are "M1–M13"** while
  `architecture.md` carries **M15**, `project-context.md` says M1–M15, and `check-spec-ids.mjs`
  accepts M15. Stale, harmless, and **not this story's file to edit** — surfaced so M14/M15 are not
  read as non-authoritative.
- **🟡 `deferred-work.md` — an organism with an empty `survivalRules` array compiles to an inert
  organism with no diagnostic.** Deliberately Epic 4's. This story is what makes it *observable*
  (every one of its cells dies by implicit death at cycle 1). ❌ Do not "fix" it here; if a test
  brushes it, add the case rather than the guard.
- **🟢 `deferred-work.md:451`'s type-level half** (illegal property × operator pairings type-check
  against `@gol/simulation`'s exported types) **stays Epic 4's**; the runtime half already throws at
  compile time (3.4, FD9).

### What NOT to build (scope boundaries)

- ❌ **Phase 3 in any form** — `resolveConflict`, Dominance comparison, the seeded `Rng`, the `Rng`
  interface itself, tie-breaking, eviction. Story 3.6. `@gol/test-utils`'s `createSeededRng` exists;
  do not import it.
- ❌ **`threePhaseStep` / `step()` / `activeStrategy` / a strategy registry.** Story 3.6 (and the
  registry is explicitly out of MVP scope, RFC-004 §3.1).
- ❌ **Aging, the age increment, the `MAX_RELEVANT_AGE` clamp, extinction detection, auto-stop.**
  Story 3.6 (and auto-stop is extinction-only — Decision B.5 / H-α: still-lifes, oscillators and
  gliders must keep running).
- ❌ **Benchmarks, the perf harness, the ≥ 90% coverage-gate flip, the M12 guard removal.** Story
  3.7. Do not touch `packages/simulation/vitest.config.ts`.
- ❌ **The RAF loop, `SimulationLoop`, any timing or scheduling.** Story 3.8.
- ❌ **Colour batching, fill-group LUTs, any renderer work.** Story 3.9.
- ❌ **Any change to `src/engine/`** beyond nothing; ❌ do not widen the boundary lint or
  `check-engine-boundary.mjs`.
- ❌ **Anything in `apps/web`.** No React, no hook, no UI, no `useSimulation` (3.10).
- ❌ **A `contentHash` generator, a schema change, or any `@gol/domain` edit.**

### Testing standards summary

- **Location:** co-located `*.test.ts` beside the source, node environment (`vitest.config.ts`
  unchanged). Every existing `packages/*` test follows this.
- **Fixtures come from `@gol/test-utils`** — `gridFromPattern` (ASCII art + legend → dense
  `number[][]`), `emptyGrid`, `placePattern`, `createMockOrganisms()` (AR-45: all five properties,
  all six operators, an aging organism, distinct dominance, ≥ 1 explicit `die` rule, and the one
  `organismType`-targeting rule in the repo), `CONWAYS_CLASSIC` (the no-`die`-rule, no-age-literal
  control). Feed dense fixtures through `@gol/simulation`'s `gridFromDense`; assert with
  `gridToDense`. ❌ Do not hand-roll typed-array fixtures or a fourth mock organism.
- **Golden patterns (AR-40)** are Story 3.6's full suite (blinker period-2, glider translation,
  still-lifes) because they need the assembled cycle. What **3.5** owes is the **per-phase**
  decomposition of one of them — the blinker's Phase-1 no-op and its exact Phase-2 claim set
  (AC12) — which is what makes a 3.6 failure diagnosable to a phase instead of to "the engine".
- **Property tests (`fast-check`, v4, already installed as a hoisted root devDep):** AR-41 assigns
  **phase purity** to this story. The natural set is (i) neither phase mutates its source grid;
  (ii) no returned buffer aliases a source buffer; (iii) the FD5 tally agrees with `countNeighbors`
  for every (cell, ref); (iv) no cell receives two claims from the same organism (AC8).
- **Determinism:** nothing in Phases 1–2 is random. ❌ Do not import the seeded RNG — it is 3.6's,
  and a phase that needs it has absorbed Phase 3.
- **No coverage-padding tests.** `packages/simulation` sits at **100%** after 3.4 (224 tests); write
  for correctness and let the number follow. The gate flips in 3.7; padding is rejected in review
  regardless.
- **Never pixel/snapshot-test anything.** Not applicable here, and stated so it stays that way.
- **Mutation-check the load-bearing invariants** and record the results, as 3.3 and 3.4 did: dropping
  the "read from the source grid" rule (Trap 4), collapsing `null` into a death (Trap 2), skipping
  the empty-cell write (Trap 5), and indexing `evaluatorsByRef[ref - 1]` (Trap 1) should each redden
  a named test. An invariant that survives its own mutation is untested.

### External dependencies / versions

None new. This story is pure TypeScript over what already ships: `@gol/simulation`'s own grid,
neighbourhood and session layers, plus `vitest` and `fast-check@4` from the root devDeps. ❌ Do not
add a dependency to `packages/simulation/package.json` — it currently declares exactly
`@gol/domain` (test-only in practice) and `@gol/test-utils`, and a runtime dependency here reaches
the browser bundle through `transpilePackages`.

## Project Structure Notes

Indicative; the split is the developer's call, constrained by "nothing in `src/engine/`", "not in
`src/session/`" (3.4's FD8), camelCase-never-dotted, and **FD6**'s outcome.

```
packages/simulation/src/
  engine/                          ⛔ UNTOUCHED — domain-blind; boundary-lint enforced
  gol/
    cellSubject.ts                    MODIFIED — the "Stories 3.5/3.6's per-organism evaluation
                                      pass" note now names what shipped
    resolveCellAction.ts              MODIFIED — comment only ("That resolution is Story 3.5/3.6's")
  grid/
    doubleBuffer.ts                   MODIFIED — comment only; the `back` writer obligation and the
                                      "Stories 3.5/3.6 write into `back`" note come due here
    grid.ts                           MODIFIED — comment only; the `occupant` "Consequence for
                                      Story 3.5/3.6" note
    neighborhood.ts                   MODIFIED — comment only; multi-organism counts become
                                      observable in THIS story, not first in 3.6
  session/                         ⛔ unchanged (once-per-battle work; this story is per-cycle)
  strategy/                        ← NEW (FD6)
    deathPhase.ts                     Phase 1 (FR-5.2, M10 H-5)
    birthSurvivalPhase.ts             Phase 2 (FR-5.3) + the claims producer
    claims.ts                         the claims value + its documented invariants (FD3)
    <name>.test.ts                    fixtures from @gol/test-utils, via compileSession
  index.ts                         barrel — `export type { … }` for types (isolatedModules)
```

Not touched: `eslint.config.mjs`, `scripts/*.mjs`, `packages/simulation/vitest.config.ts`,
`packages/simulation/tsconfig.json`, `packages/simulation/package.json`, `packages/domain/**`,
`packages/persistence/**`, `packages/test-utils/**`, and all of `apps/web`.

## References

- [Source: docs/planning-artifacts/epics.md#Story 3.5: Phases 1–2 — Death & Claims] — the story
  statement and the four AC bullets decomposed above
- [Source: docs/planning-artifacts/epics.md#Requirements Inventory] — FR-5.2 (Phase 1: die rules
  only, death precedes survival, explicit deaths removed before Phase-2 counting, implicit deaths at
  cycle end), FR-5.3 (Phase 2: all organisms in parallel against the post-death grid, candidate
  claims, priority within phase), FR-5.8/5.9 (Moore neighbourhood, hard edges), FR-2.6 (rule order
  is configured priority), AR-16 (three-layer functional design, no classes), AR-17 (typed-array
  double-buffered grid), AR-18 (phase-partitioned compiled evaluators), AR-20 (relative cell state;
  `MAX_RELEVANT_AGE`), AR-40 (golden patterns), AR-41 (property tests — **phase purity is named
  here**), AR-45 (the dev fixture workspace this story tests against)
- [Source: docs/planning-artifacts/rfcs/RFC-004-simulation-rules-engine.md#3.2 The three-phase
  strategy (per FR-5)] — `deathPhase` → intermediate grid → `birthSurvivalPhase` → claims; the
  Die > Survive and Survive-vs-Born precedence prose; "referential transparency across phases"; the
  implicit-death timing paragraph; **and the allocation-shaped snippet FD2 diverges from**
- [Source: docs/planning-artifacts/rfcs/RFC-004-simulation-rules-engine.md#3.1 Evaluation strategy —
  pluggable, but hardcoded for the MVP] — `SimulationDeps` **as amended by M15**
  (`evaluatorsByRef`, `organisms`, `rng`), `OrganismEvaluators`, `SimulationStrategy`; the strategy
  owns cross-action prioritization
- [Source: docs/planning-artifacts/rfcs/RFC-004-simulation-rules-engine.md#2.1 The Cell subject
  (CellSubject) and its selectors] — the five properties, relative cell state, `OrganismRef` =
  roster index + 1 (M14)
- [Source: docs/planning-artifacts/rfcs/RFC-004-simulation-rules-engine.md#2.3 Action resolution —
  the abstraction layer on top of the engine] — phase-scoped resolution; `resolveCellAction` stays
  the whole-list primitive for a *different* strategy
- [Source: docs/planning-artifacts/rfcs/RFC-004-simulation-rules-engine.md#3.3 Engine-owned concerns
  (all pure)] — Moore/hard edges, aging (**3.6's**), `MAX_RELEVANT_AGE`, extinction-only auto-stop
- [Source: docs/planning-artifacts/rfcs/RFC-004-simulation-rules-engine.md#3.4 Grid representation
  for the 60 FPS budget (NFR-1.1)] — the typed-array `Grid`, double buffering, size-parametric
  dimensions
- [Source: docs/planning-artifacts/architecture.md#Minor Spec Resolutions] — **M10** (cross-action
  precedence is the strategy's; death precedes survival; FR-2.6 is priority *within* a phase;
  implicit death resolves at cycle end and still counts as a Phase-2 neighbour), **M12** (fail
  closed per cell; eager diagnostics are 3.4's; guards re-measured in 3.7), **M13** (bidirectional
  pins for types duplicated across the domain/engine seam), **M14** (`ref = index + 1`), **M15**
  (the compiled evaluator is a phase-partitioned pair; `evaluatorsByRef` is ref-indexed with slot 0
  `null`; `resolveBirthSurvival`'s `null` is "no match", never "die")
- [Source: docs/planning-artifacts/architecture.md#Decision C] — three-valued cell state, relative to
  the evaluating organism; `ne` retired
- [Source: docs/planning-artifacts/architecture.md#Decision A] — size-parametric grids, per-cycle
  memory (A.6), ~O(N) step cost
- [Source: docs/project-context.md#Critical Don't-Miss Rules] — death precedes survival and implicit
  death resolves at cycle-end; grid dimensions are never constants; no classes or module-level
  mutable state in the engine; the `Uint8Array`/`Uint16Array` split; auto-stop is extinction-only
- [Source: docs/implementation-artifacts/3-4-precompiled-evaluators-organism-interning.md#Dev Agent
  Record] — FD1 (`CompilableOrganism`, minimal local input types), **FD2 → M15 (the evaluator pair,
  ref-indexed table)**, FD3 (the cache key), FD8 (**what `src/session/` is for, and that this
  story's code is not it**), and **Decisions Needed #2** (`resolveBirthSurvival` keeps
  `Action | null`; `'die'` is unreachable — Trap 11)
- [Source: docs/implementation-artifacts/3-3-typed-array-grid-neighborhood.md#Dev Agent Record] —
  FD3 (the double-buffer seam as a caller-owned value), FD4 (write the unmeasured optimisation down
  rather than building it blind — the model for **FD5**), FD5 (`OrganismRef` = index + 1)
- [Source: packages/simulation/src/grid/doubleBuffer.ts] — **the writer obligation this story
  inherits**: write every cell of the destination, empties included, or resurrect cycle N−2
- [Source: packages/simulation/src/grid/neighborhood.ts] — `countNeighbors`, clamped bounds, the
  same/other caveat, and the packed-integer alternative left for 3.7
- [Source: packages/simulation/src/session/compileEvaluators.ts] — `OrganismEvaluators`,
  `CompiledSession` (`evaluatorsByRef`, `refById`, `maxRelevantAge`), and the `null`-is-not-death
  comment
- [Source: packages/test-utils/src/mockWorkspace.ts] — `AGGRESSIVE_DIE` (`alive` + `neighborCount >
  5`, the Phase-1 fixture), `PATIENT_DIE` (`age gte 8`), `CHAOTIC_BORN` (`cellState eq occupied` +
  `organismType eq aggressiveColonizer`, the born-on-occupied H-6 candidate)
- [Source: packages/domain/src/defaultWorkspace.ts] — `CONWAYS_CLASSIC`: born on empty with exactly
  3, survive with `range [2,3]`, **and no `die` rule** — with the comment explaining why an explicit
  "dies with <2 or >3" rule is *not* equivalent

## Dev Agent Record

### Agent Model Used

claude-opus-5 (Opus 5), via `implement-next-story` → `bmad-dev-story`.

### Forced Decisions

**FD1 — deps shape: (a), a narrow per-phase `PhaseDeps`.** `packages/simulation/src/strategy/phaseDeps.ts`
declares `interface PhaseDeps { readonly evaluatorsByRef }` and nothing else, because that is the
only member Phases 1–2 read: `dominance` and `rng` are Phase 3's and `agingEnabled` is 3.6's
cycle-end step. Declaring the full `SimulationDeps` now would publish two fields no shipped code
reads and no test can exercise as used — the call Story 3.1 made against `RuleSetCollection` and
Story 3.4's FD1 made against `OrganismRuntime`. **`SimulationDeps` is owned by Story 3.6**, which is
where the other two fields get contents. Nothing is lost by waiting: a wider object satisfies the
narrower parameter structurally, and `deathPhase.test.ts` pins that by passing a whole
`CompiledSession` as `deps` with no adapter.

**FD2 — allocation: (b), destination-passing.** `deathPhase(source, destination, deps): Grid`,
returning the destination for chaining. This **diverges from RFC-004 §3.2's snippet**
(`deathPhase(grid, deps) => Grid`), which is illustrative pseudocode; `grid/doubleBuffer.ts` — written
after it and naming this story — states the shape the shipped buffer seam was built for. Allocating
would cost a `Uint8Array(N)` + `Uint16Array(N)` **per cycle** (18 KB at 100×60, 72 KB at 200×120,
up to 20×/s), precisely what Decision A.6's steady-state budget and the double buffer exist to avoid;
it also makes the two-buffer plan serve a three-grid pipeline (the intermediate *is* `back`, Phase 2
only reads it, Phase 3 finishes in place). Both riders are honoured: AC9's purity property is stated
over the **source** (`phasePurity.test.ts`), and AC10's write-every-cell rule is load-bearing and
pinned with destinations pre-filled as a stale N−2 frame. ⚠️ Flagged, **not amended** — the §3.2 edit
rides with `threePhaseStep`'s signature, which is Story 3.6's. **No `M16` minted.**

**FD3 — claims: (c), flat append-only parallel arrays.** `Claims { cellIndex[], ref[], action[] }`
(`strategy/claims.ts`), with **five invariants documented as a contract**, not reported as a property
of the loop: (1) `cellIndex` non-decreasing, so every claim for a cell is a contiguous run — the
thing that lets Phase 3 be one linear pass with a run detector, and the thing a later loop reorder
would silently break; (2) refs strictly increasing inside a run (one claim per organism per cell);
(3) the action is carried, never re-derived; (4) a `survive` claim is always the incumbent's;
(5) no claim carries `'die'`. Rejected: `Map<cellIndex, Claim[]>` and the dense
`(Claim[] | undefined)[]` (both allocate a sub-array per claimed cell, per cycle, inside the frame
budget), and the `firstRef`/`firstAction` typed-array fast path with a Map spill — plausibly fastest
and strictly more machinery, worth building only against a benchmark that says the linear pass is the
problem (Story 3.7). Invariants 1, 2, 4 and 5 are property-tested over generated grids.

**FD4 — non-incumbent `survive`: (a), dropped.** `if (claimed === 'survive' && occ !== r) continue;`
with the comment naming the age nonsense it prevents: if such a claim won Phase 3 the winner's age
would be set to the *previous occupant's* age + 1. RFC-004 §3.2 states the model — *"A survivor is
just the incumbent's own Survive claim."* The rule is schema-legal and `createMockOrganisms()`
contains no such rule, so the case is built and pinned with a purpose-compiled `invader` organism.
⚠️ The mirror is **not** symmetric and is pinned separately: an **incumbent answering `born`** is a
legitimate rebirth claim (age reset to 0) and is KEPT — which is exactly why a claim carries its
action instead of being re-derived from occupancy (AC7).

**FD5 — neighbour counting: (b), one tally per cell.** `strategy/neighborTally.ts` builds a per-cell
`(total, countByRef)` tally in one ≤ 8-slot pass and every organism derives `same = countByRef[ref]`,
`other = total - same` from it — a restructuring of the loop, not a speculative optimisation: option
(a) provably does the same ≤ 8 reads up to 20 times per cell (~1M reads/cycle at baseline). Per-cell
reuse is O(1) per organism via a ref-indexed `Uint8Array(256)` whose ≤ 8 touched slots are cleared
by the *next* cell (clearing all 256 would cost more than the pass it replaces). Pinned
**differentially against `countNeighbors`** over generated grids for every (cell, ref) — including
1×N and N×1, where the modulo idiom this reproduces the clamped bounds instead of would go wrong.
**Phase 1 keeps calling `countNeighbors` directly**: one organism per cell, nothing to amortise.

**FD6 — location: (a), a new `src/strategy/`.** Matches RFC-004 §3.1's vocabulary
(`SimulationStrategy`, `activeStrategy`) and gives Story 3.6's `conflictPhase.ts` /
`threePhaseStep.ts` a home beside these files. `phaseDeps.ts` carries the directory charter as a
header comment (the `src/engine/README.md` model 3.4's `internOrganisms.ts` followed): what belongs
here is per-CYCLE code that WALKS THE GRID; what does not is `src/engine/` (domain-blind, boundary-lint
enforced), `src/gol/` (decides about one cell), `src/session/` (once per battle run — 3.4's FD8
explicitly excluded what the RAF loop calls) and `src/grid/` (representation, no notion of a rule).

**Trap 14 (decided, as the story requires) — guard, failing closed.** An occupant ref beyond the
compiled roster reads `undefined` from `evaluatorsByRef` and would crash the cycle on
`.resolvesToDeath`. `evaluatorsFor()` normalises it to `null` and the cell behaves as an organism
with no rules: not killed in Phase 1, no claim in Phase 2, gone at cycle end by implicit death. This
is M12's own trade (fail closed rather than throw inside the 60 FPS loop) at one `=== undefined` per
occupied cell. ⚠️ **Phase 2 deliberately does NOT go through it** — its refs come from the table's own
indices, so `undefined` is unreachable there by construction and guarding it would cost 120,000
comparisons a cycle for nothing.

### Debug Log References

- `npx vitest run --coverage` in `packages/simulation`: **272 tests, 16 files, 100% statements /
  100% branches / 100% functions / 100% lines** — unchanged from 3.4's 100%; 48 of those tests are
  new (`strategy/`).
- `npx eslint packages/simulation` → clean. `node scripts/check-engine-boundary.mjs` → *7 escape
  shapes rejected, 2 legitimate imports accepted*. `node scripts/check-spec-ids.mjs` → *all 199
  cited ids resolve*. `npx prettier --check` → clean.
- **`npm run ci` → exit 0** (redirected to a file and `$?` echoed — never piped, per
  project-context's pipe-swallowed-exit-code warning). Full gate: typecheck → lint → format:check →
  spec:check → boundary:check → coverage → build:standalone → bundle:check → e2e (344 passed,
  4 skipped).

**Mutation checks — every load-bearing invariant reddens a NAMED test** (an invariant that survives
its own mutation is untested):

| Mutation | Reddens |
|---|---|
| Trap 4 — Phase 1 materializes subjects from its own OUTPUT | 2 tests, incl. *"is internally SIMULTANEOUS — two mutually-adjacent doomed cells both die"* |
| Trap 5 — skip the empty-cell destination write | 3 tests, incl. *"overwrites a stale frame everywhere, empties included"* |
| Trap 2 — collapse `null` into a death claim | 8 tests, incl. *"makes NO claim on the two end cells"* |
| Trap 1 — `evaluatorsByRef[ref - 1]` | 8 tests, incl. *"starts at ref 1 and never calls slot 0's null"* |
| FD4 — keep a non-incumbent `survive` | *"DROPS a `survive` from an organism that does not occupy the cell"* |
| Trap 6 — swap `neighborCount` / `occupantNeighborCount` | 5 tests, incl. *"materializes SAME-organism neighbour counts"* |
| Trap 8 — modulo wrap instead of clamped bounds in the tally | 4 tests, incl. the differential *"matches the reference implementation for every (cell, ref)"* |

### Completion Notes List

- **Phase 1 (`deathPhase`)** asks only `evaluatorsByRef[ref].resolvesToDeath` on the occupant's own
  subject, materialized entirely from the **source** grid, and writes every destination cell —
  cleared cells zeroing `occupant` **and** `age`. Implicit death is *not* applied here: over a Conway
  battle (no `die` rule at all) the phase returns a grid equal in content to its input, pinned as a
  golden.
- **Phase 2 (`birthSurvivalPhase`)** evaluates every roster organism against every cell of the
  post-death grid, cell-outer / organism-inner. `null` → no claim, never a death. Cell State is
  materialized relative to the evaluating organism; `age` is passed exactly as stored (no clamp —
  `MAX_RELEVANT_AGE` is applied at cycle end by 3.6).
- **Goldens (AC12):** the Conway blinker decomposed per phase — Phase 1 a no-op, Phase 2 exactly
  `[(1,2) born, (2,2) survive, (3,2) born]` with the **absence** of claims on the two end cells
  asserted explicitly; and a multi-organism fixture over `createMockOrganisms()` compiled through
  `compileSession`, exercising Aggressive Colonizer's `AGGRESSIVE_DIE` in Phase 1 (only the 3×3
  block's centre, with 8 same-organism neighbours, is removed) and Chaotic Spreader's
  `CHAOTIC_BORN` producing a **born claim on a cell another organism occupies** — the H-6 eviction
  candidate. 3.5 proves the claim exists; who wins it is 3.6.
- **Trap 6 discriminator:** the multi-organism fixture includes a cell with 3 occupied neighbours,
  all Aggressive. Patient Defender's `PATIENT_BORN` (`neighborCount range [3,4]`) must **not** fire
  there — its own `neighborCount` is 0. Under the "all eight occupied neighbours" misreading it
  would claim the cell, so that absence is the assertion.
- ❌ **Nothing landed in or was imported backwards from `src/engine/`**; the boundary lint and
  `check-engine-boundary.mjs` are untouched and green. No new dependency; no change to
  `vitest.config.ts`, `tsconfig.json`, `package.json` or any script.
- **Shipped comments that predicted this story were updated to name what shipped**, per the Story
  3.3 AC9 / 3.4 AC10 precedent: `doubleBuffer.ts` (both the `back` writer obligation and the
  "Stories 3.5/3.6 write into `back`" note — the obligation is now discharged for Phase 1 and pinned
  by a stale-frame test), `grid.ts` (`occupant`'s M14 consequence now names the two coexisting
  conventions, `age` names the zero-on-clear rule), `neighborhood.ts` (multi-organism counts become
  observable **here**, not first in 3.6, and Phase 2 does not call it per pair), `cellSubject.ts`
  (the relative-state switch now ships in `strategy/birthSurvivalPhase.ts`), `resolveCellAction.ts`
  (the `null`-is-not-death resolution shipped, and neither phase calls this primitive).

### Spec-conflict flags raised

- **🟡 RFC-004 §3.2's allocation-shaped phase snippets vs. `doubleBuffer.ts`'s destination-passing.**
  Resolved for this story by FD2 (b) and **flagged, not amended**: the RFC edit belongs with
  `threePhaseStep`'s signature, which is Story 3.6's. No Minor Resolution minted — that is an
  authority-doc act requiring Sidiar's explicit authorization (the M14/M15 precedent).
- **No new conflict found.** M15 is minted and §3.1 already reads `evaluatorsByRef`, so there was no
  §3.1 edit left for this story, as the story file predicted. `CLAUDE.md:21`'s stale "M1–M13" and
  `deferred-work.md`'s empty-`survivalRules` and type-level entries were left untouched as instructed
  — the inert-organism case is now *observable* (an empty-rule organism is never killed and never
  claims), and it is used as an ordinary fixture in two tests rather than guarded against.

### File List

**New**

- `packages/simulation/src/strategy/phaseDeps.ts`
- `packages/simulation/src/strategy/claims.ts`
- `packages/simulation/src/strategy/neighborTally.ts`
- `packages/simulation/src/strategy/deathPhase.ts`
- `packages/simulation/src/strategy/birthSurvivalPhase.ts`
- `packages/simulation/src/strategy/neighborTally.test.ts`
- `packages/simulation/src/strategy/deathPhase.test.ts`
- `packages/simulation/src/strategy/birthSurvivalPhase.test.ts`
- `packages/simulation/src/strategy/phasePurity.test.ts`

**Modified**

- `packages/simulation/src/index.ts` — barrel: the strategy layer, types via `export type`
- `packages/simulation/src/grid/doubleBuffer.ts` — comments only
- `packages/simulation/src/grid/grid.ts` — comments only
- `packages/simulation/src/grid/neighborhood.ts` — comments only
- `packages/simulation/src/gol/cellSubject.ts` — comments only
- `packages/simulation/src/gol/resolveCellAction.ts` — comments only
- `docs/implementation-artifacts/3-5-phases-1-2-death-claims.md` — this record
- `docs/implementation-artifacts/sprint-status.yaml` — `backlog` → `review` (one hunk; the
  in-progress step was never committed), then `review` → `done` in the review commit

### Change Log

- 2026-09-10 — Story 3.5 implemented: Phases 1–2 as pure functions in a new
  `packages/simulation/src/strategy/` layer, plus the `Claims` value Phase 3 will consume. 48 new
  tests (goldens, invariants, 10 fast-check properties — 7 in `phasePurity.test.ts`, 3 in
  `neighborTally.test.ts`); `packages/simulation` holds 100% coverage at 272 tests. `npm run ci`
  green (exit 0). FD1–FD6 and Trap 14 recorded above; the RFC-004 §3.2 signature divergence is
  flagged for Story 3.6 and no Minor Resolution was minted.
- 2026-09-10 — Code review (Fable 5.1): 11 patches applied, 1 deferred to Story 3.7, 0
  decision-needed (see **Review Findings**). +5 tests (277; 100% coverage unchanged): the chained
  AC3 golden, FD4's first-match shadowing in both rule orders, Phase 2's out-of-roster occupant,
  and the 8-distinct-neighbours `touched` boundary; purity properties now generate rosters too.
  `npm run ci` re-run green (exit 0). Story → `done`.

Dev Model: opus   # architecture-shaping: it fixes the claims structure Phase 3 consumes, the phase signatures (allocating vs destination-passing) that `threePhaseStep` and the double-buffer plan are built on, and the first per-cycle hot loop 3.7 benchmarks — later stories build on these shapes rather than following an existing one.

---

This story was implemented with the 'Implement next story' skill with the following stats:

| Phase | Agent model | Agents | Wall clock | Input | Output | Cache write | Cache read | Total tokens |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Step 0 — re-entry guard | — | 0 | 25s | 30 | 3,632 | 16,583 | 666,124 | 686,369 |
| Step 1 — create-story | opus-5 | 1 | 9m 42s | 192 | 43,437 | 520,993 | 8,920,949 | 9,485,571 |
| Step 2 — dev-story | opus-5 | 1 | 17m 09s | 208 | 64,647 | 364,810 | 14,280,569 | 14,710,234 |
| Step 3 — code review + PR | fable-5-1 | 4 | 16m 22s | 5,224 | 78,718 | 2,016,125 | 17,376,777 | 19,476,844 |
| _of which the orchestrator_ | opus-5 | — | — | 98 | 16,074 | 63,461 | 2,609,304 | 2,688,937 |
| **Total (create-story → PR ready)** | | 6 | **43m 38s** | 5,654 | 190,434 | 2,918,511 | 41,244,419 | **44,359,018** |

Run started 2026-09-10 09:21 CEST; wall clock runs to the point the run stopped for Sidiar's review. Each phase row covers the phase agent, any agents it spawned, and the orchestrator's own turns in that window — the orchestrator row breaks its share out again, it is not additional. Cache reads dominate the token totals and are billed at a fraction of input rate, so read the Input and Output columns for effort and the total only as a ceiling. The orchestrator's final turn is still being written when these numbers are taken.
