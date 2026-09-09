---
baseline_commit: 708babddc9f713de525fccef5d29f8b08628ef6b
---

# Story 3.3: Typed-Array Grid & Neighborhood

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a developer,
I want the hot-path grid representation with neighborhood math,
so that simulation meets the 60 FPS budget by construction.

## Acceptance Criteria

From `epics.md#Story 3.3: Typed-Array Grid & Neighborhood`, decomposed into what a reviewer can
check independently.

1. **Given** the grid model, **When** implemented, **Then** `packages/simulation` declares the
   RFC-004 §3.4 `Grid` — `readonly width`, `readonly height`, `occupant: Uint8Array`,
   `age: Uint16Array` — with `width`/`height` as **parameters, never constants** (Decision A, AR-17)
   and `occupant.length === age.length === width * height` as a stated, tested invariant.
2. **And** the occupant encoding is settled and written down once: `0` = empty, `1..255` = an
   `OrganismRef`. **See FD5 — the two specs disagree on whether a ref is the roster index or
   index + 1, and this story is where that stops being ambiguous.** Whatever is chosen,
   `packages/simulation/src/gol/cellSubject.ts`'s `OrganismRef` comment and the new grid module must
   say the same thing, and a test must pin it.
3. **And** double buffering exists as a real, named seam (AR-17, A.6) rather than an aspiration —
   the shape is **FD3**, and whichever is chosen, Stories 3.5/3.6/3.8 inherit it, so the choice and
   its reasoning are recorded in the Dev Agent Record.
4. **And** neighbourhood access is **Moore (8 adjacent) with hard boundaries — no wrap**: edge cells
   see 5 neighbours, corner cells 3, and nothing reads `(-1, y)` or `(width, y)` (FR-5.8, FR-5.9,
   RFC-004 §3.3). Tested at all four corners, all four edges, and the interior, at more than one
   grid size.
5. **And** the neighbourhood produces the two **relative** counts a `CellSubject` needs
   (RFC-004 §2.1, Decision C): `neighborCount` = Moore neighbours holding **the evaluating
   organism**, `occupantNeighborCount` = Moore neighbours holding **any other** organism. Empty
   neighbours count toward neither. Tested with a multi-organism fixture where the two counts
   differ — a single-organism fixture cannot distinguish a right materialization from a wrong one.
   The API shape is **FD4**.
6. **And** a pure `resizeGrid` preserves content **top-left-anchored** and returns **new buffers**,
   always — growth adds empty space right/bottom (the hard edges move outward), shrink clips cells
   outside the new bounds, and the input is never mutated (AR-17, Decision A.3).
   ⚠️ **`age` handling on resize is FD6** — `apps/web`'s Epic 2 implementation zero-fills it, which
   is correct for an Edit-mode grid and **wrong for Story 3.16's live grid**.
7. **And** property-based tests (fast-check, AR-41) cover the resize invariants — top-left anchoring,
   buffer lengths, input immutability, grow-then-shrink recovering the original for the retained
   region — and **dense↔typed round-trip identity**. ⚠️ The epic AC says "dense↔sparse↔typed"; the
   sparse form does not exist until Story 5.3 — see **FD7**, and record which half was covered.
8. **And** `packages/simulation` still imports **no React and no DOM types** (component-tree spec §6
   invariant: *"nothing below `useSimulation` imports React"*; `tsconfig.base.json` is
   `lib: ["ES2022"]`), contains **no classes** and **no module-level mutable state** (AR-16), and
   `npm run boundary:check` still passes with `src/engine/` untouched.
9. **And** the two Epic-2 modules that name this story as their owner —
   `apps/web/lib/battle/resizeGrid.ts` and `apps/web/lib/battle/clearGrid.ts` — are **resolved, not
   ignored** (FD2): either migrated with their call sites re-pointed, or left in place with their
   "Story 3.3 is the eventual owner" comments corrected to say why they stayed and what now owns
   them. A comment predicting work this story has finished is not an acceptable end state.
10. **And** `deferred-work.md`'s "Cross-RFC Reconciliation #3 … the battle repository converts
    dense↔typed at load/save" item — explicitly assigned to this story — is discharged (FD1): either
    `architecture.md`'s Reconciliation #3 clause is reworded to name the real boundary, or the
    persistence→simulation dependency is justified explicitly. Update `deferred-work.md` to record
    the outcome.

## Tasks / Subtasks

- [x] **Task 1 — Settle the forced decisions before writing code** (AC: 2, 3, 4, 5, 6, 7, 9, 10)
  - [x] Read **Dev Notes → Forced decisions (FD1–FD7)** end to end and record the option taken and
        *why* in the Dev Agent Record. FD3, FD4 and FD5 are inherited by Stories 3.4–3.9 and 3.16;
        deciding any of them by accident is what the record exists to prevent.
  - [x] ❌ Do not open `RFC-004 §3.4`, copy the `Grid` interface, and start typing. The interface is
        four lines and is the *easy* part; every hard call in this story is about what surrounds it.

- [x] **Task 2 — The `Grid` type and its invariants** (AC: 1, 2, 8)
  - [x] Declare `Grid` in `packages/simulation` per RFC-004 §3.4 — `width`/`height`/`occupant`/`age`,
        **those exact field names** (`apps/web/lib/canvas/renderableGrid.ts` chose them verbatim in
        Story 1.8 precisely so this type would satisfy it structurally; renaming to `cols`/`rows`
        breaks that join and 29 consuming files with it).
  - [x] Constructors: an empty grid at a given size, and dense↔typed conversion (FD1). Every one of
        them allocates `width * height` **exactly** — no pooling, no over-allocation.
        `computeEditorGridStats` and `GridRenderer.assertGridMatchesSize` already treat that as an
        invariant of every grid in circulation.
  - [x] Settle **FD5** (ref encoding) and make `src/gol/cellSubject.ts`'s `OrganismRef` comment agree
        with the answer. Pin it with a test.
  - [x] ❌ No `zod`. Validation is a boundary concern (project-context); inside the engine the types
        are proven. Eager `throw`s on malformed *test-fixture-style* input are a different thing and
        are fine where a builder can be handed nonsense (the `gridBuilders.ts` house convention).

- [x] **Task 3 — Double buffering** (AC: 3)
  - [x] Implement whichever **FD3** option is taken, with a comment naming the failure it prevents
        (allocating two `Uint8Array`s + two `Uint16Array`s per cycle at up to 20 Hz is the cost
        double-buffering exists to remove — A.6's ≈144 KB at 200×120 is the *steady-state* budget,
        not a per-cycle allowance).
  - [x] ❌ Do not make the buffer pair module state. No `class`, no `this`, no singleton (AR-16).
        Whatever holds the pair is a value the caller owns and passes.

- [x] **Task 4 — Moore neighbourhood, hard edges** (AC: 4, 5)
  - [x] Implement the neighbourhood per **FD4**. The two counts are **relative to the evaluating
        organism** and must be produced together in one pass over the ≤8 neighbours — never two
        passes, and never "count all occupied, subtract".
  - [x] Hard edges by **clamped iteration bounds**, not by an in-loop `continue`, and never by
        modulo. `for (let dr = max(0, row-1); dr <= min(height-1, row+1); dr++)` has no
        out-of-bounds read to guard.
  - [x] ❌ No wrap, no toroidal option, no `wrapEdges` flag "for later" (FR-5.9; there is no
        requirement and no UI for it).
  - [x] ❌ Do not build a neighbour-count cache, an incremental delta tracker, or a Web Worker.
        NFR-1.1 is met by the typed arrays and the ~O(N) pass (A.4); optimisation beyond that waits
        for Story 3.7's measurements.

- [x] **Task 5 — `resizeGrid`** (AC: 6, 9)
  - [x] Pure, returns new buffers **always** — including when the requested size equals the current
        one. `apps/web`'s version records why: making the contract depend on which caller asks is
        how an identity return becomes a shared-buffer aliasing bug three stories later.
  - [x] Row-at-a-time `occupant.set(source.subarray(...), destOffset)` for the copy — `subarray` is
        safe as a copy **source** (the bytes are read into the destination's own buffer); it is
        unsafe only when a view is **retained**.
  - [x] Settle **FD6** (`age` on resize) and comment the answer at the function, naming Story 3.16.
  - [x] Decide **FD2** and act on it. If the Epic-2 modules move, their call sites and tests move
        with them in the same change and `npm run ci` proves it; if they stay, their comments stop
        predicting this story.

- [x] **Task 6 — Tests** (AC: 4, 5, 6, 7)
  - [x] Co-located `*.test.ts` beside the source, node environment. Hand-computed fixtures for the
        neighbourhood: a documented small grid with two organisms where `neighborCount` and
        `occupantNeighborCount` differ at the same cell for two different evaluating organisms.
  - [x] Corners (4), edges (4), interior, at **two different grid sizes** — a 1-wide or 1-tall grid
        is the case where a clamped-bounds bug and a `continue`-guard bug diverge.
  - [x] `fast-check` property tests (AR-41), and only where a property earns its place: resize
        anchoring/lengths/immutability, grow→shrink recovery, dense→typed→dense identity.
  - [x] ❌ No coverage-padding tests. ❌ No pixel/snapshot tests. ❌ No `vitest bench` — Story 3.7.
  - [x] ❌ Do not import the seeded RNG. Nothing in this story is random.

- [x] **Task 7 — Barrel, docs, and leaving the notes true** (AC: 8, 9, 10)
  - [x] Export the new surface from `packages/simulation/src/index.ts`; types with
        `export type { … }` (`isolatedModules` is repo-wide).
  - [x] Discharge AC10: reword `architecture.md`'s Reconciliation #3 or justify the dependency, and
        update the `deferred-work.md` entry to say what happened. ⚠️ `Reconciliation #N` is the one
        doc→doc citation `spec:check` gates — edit the numbered item, do not renumber the list.
  - [x] Re-read `apps/web/lib/canvas/renderableGrid.ts`'s header comment. It says
        `packages/simulation` "does not exist yet and does not own this type until 3.3 lands".
        3.3 has now landed: make that sentence true or gone.
  - [x] ❌ Do **not** touch `packages/simulation/src/engine/**`, `eslint.config.mjs`,
        `scripts/check-engine-boundary.mjs`, or `packages/simulation/vitest.config.ts`
        (`passWithNoTests` and the coverage threshold are **Story 3.7's** to flip).

- [x] **Task 8 — Verify** (AC: all)
  - [x] `npm run ci` — the full local gate. ⚠️ **Do not pipe it** (`| tail` reports *tail's* exit
        code; this masked a real `format:check` failure during the Story 1.9 review). Redirect to a
        file and echo `$?`.
  - [x] If FD2 moved code, confirm `apps/web`'s test count did not drop and `bundle:check` still
        passes — a type-only move should be bundle-neutral; a value move is not.
  - [x] `npm run spec:check` runs inside `ci`. Write IDs exactly as the specs spell them (`AR-17`,
        `AR-41`, `FR-5.8`, `Decision A`, `M13`, `Reconciliation #3`); `M-13` matches nothing and is
        silently exempt forever. `Mn` is checked for **M1–M13 only** — the tokeniser's range lives in
        `scripts/check-spec-ids.mjs` and widening it means editing two places.
  - [x] Record the commands and their real output summary in the Dev Agent Record. Never state a
        step ran when it did not.

### Review Findings

Code review 2026-09-09 (Fable, fresh context, three parallel layers: Blind Hunter / Edge Case
Hunter / Acceptance Auditor). All ten ACs verified satisfied (AC7 as amended per FD7); all
thirteen traps held; the three dev-flagged items verified rather than accepted. Buckets: 1
decision-needed, 7 patches (applied below as the review commit), 1 defer, 5 dismissed as noise.

- [ ] [Review][Decision] Mint `M14` and correct RFC-004's two `OrganismRef` lines — §2.1 still
      defines a ref as "the index into the battle's organisms array" and §3.2's `resolveConflict`
      still reads `deps.organisms[r].dominance`, both off by one under the `index + 1` encoding
      every shipped layer now agrees on. The code is consistent; the RFC is not, and Story 3.6 is
      where the off-by-one first produces silently wrong winners. Fixing it means editing RFC-004
      and widening `scripts/check-spec-ids.mjs` in its two places — an authority-doc act the dev
      correctly declined to take unilaterally (recorded as the M14 candidate in
      `deferred-work.md`). Sidiar's call; carried as an explicit question on the PR.
- [x] [Review][Patch] `createGridBuffers`/`GridBuffers.back` contract gaps — the doc invited
      pairing `initialGrid` by reference (after one swap it becomes the write target), and stated
      no full-overwrite obligation on the cycle writer (a sparse writer resurrects a two-cycles
      -stale frame). Both now stated at the seam; `back.age` emptiness pinned in the constructor
      test. [packages/simulation/src/grid/doubleBuffer.ts]
- [x] [Review][Patch] `countNeighbors` silently clamps out-of-range/fractional `(col, row)` onto
      real cells and answers with a phantom cell's counts — deliberate hot-loop trade, but
      undocumented, unlike the blessed `selfRef: 0` degenerate. Contract now stated beside it.
      [packages/simulation/src/grid/neighborhood.ts]
- [x] [Review][Patch] The documented `selfRef: 0` degenerate was unpinned — reordering the
      `value === 0` and `value === selfRef` checks would silently count empties as `same` with no
      red test. Pinned. [packages/simulation/src/grid/neighborhood.test.ts]
- [x] [Review][Patch] The `gridFromDense never aliases its input` property was vacuous — it
      mutated a `Uint8Array` and asserted a `number[][]` was unchanged (type-guaranteed), against
      a fresh conversion that would also pass under aliasing. Rewritten to pin the real property:
      two conversions share no buffers. [packages/simulation/src/grid/grid.test.ts]
- [x] [Review][Patch] `resizeGrid(grid, 2.5, 2)` threw `createGrid: width …` — wrong function and
      wrong parameter name for the public `(grid, cols, rows)` signature, and the test's bare
      `/width/` regex pinned the misattribution green. Now validated under its own names; regexes
      tightened. [packages/simulation/src/grid/resizeGrid.ts]
- [x] [Review][Patch] The hand-off header said "Two behaviours changed in the move" — there are
      three: the moved `resizeGrid` also throws eagerly on fractional/negative dimensions where
      the Epic-2 version silently built a corrupt grid. Enumeration corrected.
      [apps/web/lib/battle/resizeGrid.ts]
- [x] [Review][Patch] `gridToDense` of an Nx0 grid degrades to `[]` and round-trips to 0x0 — the
      dense form has no slot for width with zero rows. Unreachable from the schema-bounded
      presets; asymmetry documented rather than guarded. [packages/simulation/src/grid/grid.ts]
- [x] [Review][Defer] Stale bundle-budget derivation comment in `scripts/check-bundle-size.mjs` —
      deferred, pre-existing (last touched on `main` in 93d381a, story 2.14; this branch adds
      0.2 KB of the drift and does not touch the file). The comment derives `/battle`'s 310 KB
      budget from a 295.2 KB measurement; the route measured 305.0 KB before this story's first
      line, so the standing formula has been silently unsatisfied since Stories 2.15/2.16 and the
      real headroom is ~5.0 KB, not the ~14.8 KB the comment implies. Raising a budget is
      Sidiar's call.

Dismissed (recorded so they are not re-litigated): the over-allocated-fixture-vs-invariant
tension (`clearGrid`'s normalising read is documented and deliberate); the
`toRenderableGrid:` → `gridFromDense:` error-prefix change (no surviving assertion names the
prefix); the "equality only when every in-bounds neighbour is occupied" sentence (a valid
necessary-condition claim, spec-verbatim from trap 9); age-carry endangering Edit mode (every
Edit-mode grid producer verified age-zero — `gridFromDense`, `clearGrid`, `restore()`; Story 3.16
is the intended nonzero consumer); under-allocated input buffers (outside the stated `Grid`
invariant by design — guarding every function against invariant-violating input would contradict
"relied on rather than re-derived").

## Dev Notes

### Constraints the developer MUST follow

- **Scope: the grid representation and neighbourhood math only.** Precompiled evaluators, id→ref
  interning, the `contentHash` cache and `MAX_RELEVANT_AGE` are **3.4**. Phases, Dominance, `Rng`,
  `SimulationDeps` and `step()` are **3.5/3.6**. The bench harness and coverage gates are **3.7**.
  The RAF loop is **3.8**.
- **No classes, no module-level mutable state** (AR-16). Pure functions and plain data.
- **No DOM types, no React in `packages/*`.** `tsconfig.base.json` is `lib: ["ES2022"]`; only
  `apps/web` adds `dom`. The component-tree spec §6 invariant is *"nothing below `useSimulation`
  imports React"* — this package is well below it.
- **Grid dimensions are parameters, never constants.** A hardcoded `100`/`60`/`50`/`30` anywhere in
  this story is a bug. 100×60 is the *default* (Decision A).
- **Strict TS, no escape hatches.** No `any`, no `@ts-ignore`, no non-null `!`.
- **camelCase file names, never dotted** — `grid.ts` / `neighborhood.ts`, not `grid.model.ts`.
- **Comments explain WHY**, cite the governing ID, and name the failure they prevent —
  `spec:check`-enforced.
- **Commit gate stands** — never stage or commit without Sidiar's explicit go-ahead, even on a green
  `npm run ci`. (A story subagent under `implement-next-story` may push to its own `story/*` branch;
  merging is always Sidiar's call.)

### What this layer is, in one paragraph

Stories 3.1 and 3.2 shipped a decision function: given a `CellSubject`, which `Action`? This story
ships the thing that **produces** `CellSubject`s — the grid the simulation actually runs on, and the
neighbourhood arithmetic that fills in `neighborCount` / `occupantNeighborCount`. It is the last
purely-structural story in the engine: 3.4 compiles rules against it, 3.5/3.6 walk it in three
phases, 3.8 drives it from RAF, 3.9 paints it, 3.16 resizes it live. Everything downstream inherits
the shapes chosen here, which is why this story has seven forced decisions and 3.2 had four.

**A large part of this grid already exists, in `apps/web`.** Epic 1 needed a shape to render and
Epic 2 needed one to edit, and neither could wait for `packages/simulation`. So
`apps/web/lib/canvas/renderableGrid.ts` declares `RenderableGrid` with RFC-004 §3.4's **exact field
names**, deliberately, and `apps/web/lib/battle/resizeGrid.ts` and `clearGrid.ts` both carry a
"⚠️ **Story 3.3 is the eventual owner**" note. Read all three before designing anything: this story
is as much a *consolidation* as a construction, and the work already done is load-bearing and
tested.

### Forced decisions (record the option taken and why in the Dev Agent Record)

**FD1 — Where does the dense↔typed conversion live, and what happens to `RenderableGrid`?**
`architecture.md` Reconciliation #3 says *"the battle repository converts dense↔typed at load/save."*
That cannot be implemented as written: the typed `Grid` is RFC-004's, owned by `@gol/simulation`;
`@gol/persistence` depends on `@gol/domain` alone, and adding `@gol/persistence → @gol/simulation`
stops persistence being a leaf and reverses the direction the DI seam protects (AR-2/27). Today
`apps/web/lib/canvas/renderableGrid.ts#toRenderableGrid` does the dense→typed conversion and
`projectBattleForSave` does typed→dense.
- **(a) `@gol/simulation` owns `Grid` and both conversions; `apps/web`'s `RenderableGrid` becomes a
  re-export/alias of `Grid`.** One-line change in `renderableGrid.ts`, all 29 consuming files keep
  compiling. `@gol/simulation` already depends on `@gol/domain`, so a dense `number[][]` converter
  adds no new package edge. Reconciliation #3's clause gets reworded to name the simulation boundary.
- **(b) `@gol/simulation` owns `Grid`; `apps/web` keeps `RenderableGrid` and its own converters as an
  independent structural twin.** Zero churn now; two definitions of one shape forever, and the
  Reconciliation #3 item is still not discharged.
- **(c) Honour the clause literally — `@gol/persistence` converts.** Requires the new package edge
  and inverts the seam.
- **Recommended: (a).** It is the option the existing comments were written in anticipation of, it
  discharges AC10 with a reword rather than an argument, and the type-alias form keeps the blast
  radius at one file. ⚠️ If you take (a), confirm the alias is **type-only** — moving a *value*
  (`toRenderableGrid`) across the boundary changes `apps/web`'s bundle graph and must be measured
  with `bundle:check`, not assumed.

**FD2 — Do `apps/web/lib/battle/resizeGrid.ts` and `clearGrid.ts` move into `packages/simulation`?**
Both name this story as owner. Both are pure, React-free, DOM-free and already tested. But
`resizeGrid.ts` also exports `countClippedLivingCells` / `willClipLivingCells`, which serve FR-3.11's
Edit-mode warning dialog and are not engine concerns; and `apps/web`'s signature is
`resizeGrid(grid, { cols, rows })` while RFC-004 §3.4's is `resizeGrid(grid, cols, rows)`.
- **(a) Move `resizeGrid` + `clearGrid` down; leave the clip predicates in `apps/web`; re-point call
  sites.** Single owner, and Story 3.16 gets the shared implementation Decision A.3 requires
  ("top-left for *both* resizes, so this must move as-is rather than being forked per mode").
- **(b) Leave both in `apps/web` and have `packages/simulation` declare its own.** Two
  implementations of one anchoring rule is exactly the fork A.3 warns against.
- **(c) Leave them where they are and correct their comments to name a later story.** Only defensible
  with a reason, and the reason must be written down.
- **Recommended: (a)**, taking the RFC's `(grid, cols, rows)` signature or keeping the object form —
  say which and why. ⚠️ FD6 must be settled first: moving the function without settling `age`
  migrates a behaviour that is correct in Edit mode and wrong in Play mode.

**FD3 — What shape does "double-buffered" take?**
AR-17 and A.6 both say double-buffered; RFC-004 §3.2's strategy signature is
`(grid, deps) => Grid`, which reads as allocate-a-new-grid-per-cycle. Those are in tension: a fresh
`Uint8Array(24000)` + `Uint16Array(24000)` every cycle at up to 20 cycles/second is the allocation
churn double-buffering exists to remove, but a mutable back buffer is in tension with the "phases are
pure, inputs never mutated" property test AR-41 assigns to Story 3.5.
- **(a) Ship an explicit buffer-pair value now** (e.g. a `front`/`back` holder plus a pure `swap`),
  and let 3.5/3.6 write into `back` and swap. The purity property then applies to *the input grid*,
  which is never written — the destination is a distinct grid the caller supplied.
- **(b) Keep `Grid` immutable, allocate per cycle in 3.5/3.6, and revisit under Story 3.7's
  measurements.** Simplest, provably pure, and the RFC's own signature; carries a known allocation
  cost that 3.7 is the first place able to quantify.
- **(c) Ship a reusable-buffer allocator/pool.** ❌ Not this — `computeEditorGridStats` and
  `assertGridMatchesSize` both depend on `occupant.length === width * height`, which pooling breaks.
- **Recommended: (a), stated as a seam rather than wired up** — the epic AC names double buffering as
  a property of *this* story's grid model, and (b) defers a decision that 3.5 and 3.8 both need to
  already exist. But (b) is genuinely defensible; if you take it, say so plainly, note that AC3 is
  then satisfied by design intent rather than by code, and surface it to Sidiar rather than letting
  a later story discover the seam was never built.

**FD4 — The neighbourhood API's shape, and per-cell allocation.**
RFC-004 §3.4 is explicit that this is where the 60 FPS budget is won or lost: *"`CellSubject` is
materialized only at the instant a cell is evaluated (or its primitives are passed positionally to
avoid even that allocation)."* At the NFR-1.1 baseline this runs 6,000 cells × up to 20 organisms per
cycle.
- **(a) `countNeighbors(grid, col, row, selfRef): { same: number; other: number }`** — clear, but one
  object literal per call on the hottest path in the app.
- **(b) Positional/out-parameter form** — e.g. return a packed integer (`same * 9 + other`, both
  ≤ 8), or fill a caller-owned two-element array. Zero allocation, less readable, needs a comment
  carrying its own decoding.
- **(c) Materialize the whole `CellSubject`** — hands 3.5 exactly what `resolveCellAction` wants, but
  allocates the subject *and* moves work this story does not own into it.
- **Recommended: (a) as the readable default, with the packed-return alternative written down in a
  comment** so Story 3.7 can swap it under measurement instead of re-deriving the option. ❌ Do not
  micro-optimise on instinct here: Story 3.1's M12 guards were justified with a *measured*
  +0.019 ms/cycle against the 16.7 ms budget, and that is the standard this repo holds itself to.
  A number from Story 3.7 beats a hunch from Story 3.3.

**FD5 — ⚠️ Is an `OrganismRef` the roster index, or the index + 1? The specs disagree.**
This is the single highest-consequence ambiguity in the story, and it is invisible until
Story 3.6 produces silently wrong winners.
- `packages/simulation/src/gol/cellSubject.ts` (Story 3.2) comments `OrganismRef` as *"The battle's
  dense organisms-array **index**"*.
- `apps/web/lib/canvas/refToFillGroup.ts` (Story 1.8) states the shipped convention: *"`gridState`
  cell value `v` is `index + 1` into `battle.organismIds` … So `ref = occupant value` needs no
  translation layer"*, with `// Slot 0 unused: ref 0 = empty`.
- RFC-004 §3.4's own comment reads `1..255 = OrganismRef into the battle's organisms array`, which
  can be read either way; §3.2's `resolveConflict` then does `deps.organisms[r].dominance`, which
  only works if `r` is a **direct** index — i.e. it reads as the first convention while the shipped
  encoding is the second.
- **The two cannot both be true.** Under "ref = index", `organisms[0]` is a real organism and
  collides with occupant `0` = empty. Under "ref = index + 1", `deps.organisms[ref]` in §3.2 is
  off by one for every organism in the battle — a Dominance comparison that reads the *wrong
  organism's* dominance, which produces plausible battles and no failing test.
- **Recommended: `ref = index + 1`, slot 0 reserved for empty** — it is what Epic 1 and Epic 2 ship,
  what the persisted dense `gridState` means (RFC-001), what `BattleSchema` validates
  (`v ≤ organismIds.length`), and what `RefToFillGroup` is allocated for (`size = roster length + 1`).
  Changing it would mean a migration of persisted data. Then: fix `cellSubject.ts`'s comment, and
  leave a comment where Story 3.6 will index `deps.organisms` naming the reserved slot 0, so the
  off-by-one is caught by reading rather than by a wrong winner. ⚠️ **Surface this one to Sidiar in
  the completion notes regardless of which way you go** — it spans RFC-004, RFC-001 and shipped code,
  and it is the kind of thing the Minor Resolutions (M1–M13) exist to record.

**FD6 — ⚠️ Does `resizeGrid` carry `age` across, or zero-fill it?**
`apps/web`'s implementation **zero-fills** `age` at the new length and documents why: every *editable*
grid is age-zero everywhere (RFC-005 "Representation note"), so nothing is lost, and keeping the old
`Uint16Array` would leave a buffer whose length no longer matches `width * height`. That reasoning is
airtight **for Edit mode** and does not survive contact with **Story 3.16's Play-mode ephemeral
resize**, which resizes a *live* grid whose cells have real ages — and `age` is a first-class rule
input (FR-2.5, `cellSelectors.age`). Zero-filling there resets every surviving cell to age 0
mid-simulation, silently changing which rules fire.
- **(a) Copy `age` top-left-anchored exactly as `occupant` is copied.** Decision A.3 says content is
  preserved top-left for *both* resizes and does not carve out age. Correct for Play mode; a no-op
  for Edit mode (all zeros copy to zeros). Costs one more row-loop.
- **(b) Zero-fill, and leave the Play-mode case to Story 3.16.** Ships a known defect into the
  function 3.16 is told to reuse as-is.
- **Recommended: (a).** It is strictly more correct, costs one `set` call, and removes a trap from a
  story three ahead. If FD2 moves `apps/web`'s function down, this is a **behaviour change** to an
  Epic-2 module — verify `clearGrid`, `useUndoableGrid#restore` and the Story 2.14 resize tests all
  still pass, and say so in the record rather than assuming the all-zeros equivalence.

**FD7 — The AC says "dense↔sparse↔typed round-trip identity"; sparse does not exist yet.**
The sparse `cells[]` wire form is RFC-006's and is built by **Story 5.3**'s `WorkspaceSerializer`
(`packages/test-utils/src/gridBuilders.ts` already records this: *"NOT sparse `cells` conversion —
that is the Story 5.3 serializer"*).
- **(a) Cover dense↔typed here; record sparse↔typed as Story 5.3's obligation** in `deferred-work.md`
  so it is not lost between two stories that each think the other has it.
- **(b) Build a sparse converter in this story to satisfy the AC literally** — pre-empts the export
  envelope's shape from inside an engine story, and duplicates 5.3.
- **Recommended: (a)**, recorded as an AC amendment rather than a silent shortfall (the M13
  precedent: an AC that over-reaches gets amended in the open, with the reasoning attached).

### Traps

1. ⚠️ **`occupant` is `Uint8Array`; `age` is `Uint16Array`. Not the reverse, not both `u8`.**
   Decision B.5 made `Uint16Array` canonical and explicitly retired the earlier "age stays a
   `Uint8Array`" claim, because `MAX_RELEVANT_AGE = max(7, maxAgeLiteral + 1)` and rule age literals
   are schema-bounded to ≤ 65534. A `Uint8Array` age buffer wraps silently at 256.
2. ⚠️ **`readonly occupant: Uint8Array` is readonly on the *property*, not the *contents*.**
   `grid.occupant.fill(0)` compiles. `clearGrid.ts` documents what that costs in practice: an
   in-place write freezes `<BattleEditorView>`'s identity-keyed `stats` memo and defeats the canvas's
   `paintedGridRef.current === grid` skip — the dish shows one thing and the stats row another, with
   nothing logged. Every function here returns **new buffers and a new wrapper**.
3. ⚠️ **`.slice()`, never `.subarray()`, for a buffer that escapes.** `subarray` returns a *view* onto
   the same `ArrayBuffer`. It is safe only as the **source** of a copy (`dest.set(src.subarray(…))`
   reads the bytes out), which is exactly how `resizeGrid` uses it and the only sanctioned use.
   `useUndoableGrid#snapshot` carries the same note.
4. ⚠️ **`neighborCount` is SAME-organism, not "all eight occupied neighbours".** The bare name reads
   like the latter; `cellSubject.ts` already flags this. Conway's Classic is single-organism, so the
   two readings **coincide for every fixture in this package today** and diverge only in Story 3.6's
   multi-organism goldens — as wrong survival behaviour, with no failing test naming why. Your
   multi-organism fixture (AC5) is the first thing in the repo that can catch it. Write it first.
5. ⚠️ **Hard edges, no wrap (FR-5.9).** The modulo idiom (`(row + dr + height) % height`) is the
   first thing most implementations reach for and is *wrong here*: it makes a glider that leaves the
   right edge reappear on the left, and Story 3.6's glider-translation golden would then pass at some
   grid sizes and fail at others. Clamp the loop bounds.
6. ⚠️ **`width`/`height`, never `cols`/`rows`, on the `Grid` type.** RFC-004 §3.4 and
   `RenderableGrid` both use `width`/`height`; `GridRenderer`'s frozen constructor and `resize()`
   take a *separate* `{ cols, rows }` size argument. Both spellings are correct in their own place —
   do not "unify" them, and do not let the `{ cols, rows }` argument shape leak onto the grid type.
7. ⚠️ **`occupant.length === width * height` exactly.** No pooling, no reuse, no over-allocation —
   `computeEditorGridStats` (which was fixed in Story 2.14 specifically to make itself safe for
   *this* story's grid) and `GridRenderer.assertGridMatchesSize` both rely on it. `gridStats.test.ts`
   already builds a deliberately over-allocated grid to pin the safe behaviour; do not make that test
   a description of reality.
8. ⚠️ **Age is not clamped in this story.** `MAX_RELEVANT_AGE` is computed **once per battle at
   evaluator-compile time** (Decision B.5, Story 3.4). ❌ Do not saturate, clamp, or floor `age`
   here, and do not increment it — aging is Story 3.6's cycle-end step.
9. ⚠️ **Empty neighbours count toward neither relative count.** `neighborCount +
   occupantNeighborCount ≤ 8`, with equality only when every in-bounds neighbour is occupied. A test
   asserting the two always sum to the neighbour *slot* count encodes the wrong model.
10. ⚠️ **Nothing in `packages/simulation/src/engine/` may be added, edited, or imported backwards.**
    `scripts/check-engine-boundary.mjs` is a `ci` stage and lints in-memory fixtures proving the
    reverse is rejected (including `'..'`, `'./../../gol/x'` and dynamic `import()`). It must still
    pass untouched. ❌ And do not widen the ESLint block to cover the new grid code — the boundary is
    one-directional and guarding the caller would invert it.
11. ⚠️ **The AR-40 proof test stays GoL-free.** `src/engine/rulesEngine.test.ts` drives a non-GoL
    subject and its import list is part of the assertion. ❌ Never add a grid case to it.
12. ⚠️ **`M13` is the current top of the Minor Resolutions range, and `scripts/check-spec-ids.mjs`
    tokenises `M1`–`M13` only.** If this story earns an `M14` (FD5 is the candidate), the checker
    must be widened **in two places** — its own comment explains why (`M12` also occurs in SVG
    `moveto` path data). Do not cite an `M14` that does not exist yet.
13. ⚠️ **`project-context.md` and `CLAUDE.md` prose still say the resolutions run "M1–M10"** while
    `architecture.md` carries M11–M13 and the checker accepts them. Harmless here; flagged so it is
    not read as "M11–M13 are not authoritative", and so a future doc pass knows which lines are stale.

### Spec-conflict flags (project-context: surface new conflicts, don't silently pick one)

- **🔴 NEW — `OrganismRef` is defined two incompatible ways across RFC-004, shipped `apps/web` code
  and `packages/simulation`'s own comment.** See **FD5**. This is a real contradiction, not a scope
  call, and it silently changes which organism wins a Story 3.6 Dominance comparison. Settle it here,
  make every comment agree, and surface the resolution to Sidiar.
- **🔴 NEW — `resizeGrid`'s `age` handling is correct for Edit mode and wrong for Play mode.** See
  **FD6**. Not a document-vs-document conflict: Decision A.3 says content is preserved top-left for
  both resizes, and the Epic-2 implementation's zero-fill was justified by an Edit-mode-only premise
  that Story 3.16 breaks.
- **🟡 `architecture.md` Reconciliation #3 assigns dense↔typed conversion to the battle repository**,
  which cannot be honoured without inverting the AR-2/27 seam. **Already known and explicitly
  deferred to this story** (`deferred-work.md`, Sidiar 2026-08-29) — see **FD1** and **AC10**.
- **🟡 The epic AC for this story requires a "dense↔sparse↔typed" round-trip test; the sparse form is
  Story 5.3's.** A scope/sequencing gap rather than a contradiction — see **FD7**.
- **🟡 RFC-004 §3.4's `Grid` is immutable while AR-17/A.6 require double buffering.** A tension inside
  one RFC, not between two — see **FD3**.
- **🟢 `architecture.md`'s Repository Structure table still places the rules engine in
  `packages/domain`.** **Not new** — surfaced at Story 1.3, resolved in `packages/simulation` at
  Story 3.1, and continued here. Noted so it is not re-litigated; the table line is the stale one.

### What NOT to build (scope boundaries)

- ❌ Precompiled evaluators, the `contentHash`-keyed session cache, id→ref **interning**,
  the never-match sentinel, `MAX_RELEVANT_AGE` — **Story 3.4**. (This story *encodes* refs; it does
  not *build the map*.)
- ❌ Phase 1/2/3, Dominance, the `Rng` interface, `SimulationDeps`, `activeStrategy`, `step()`,
  aging increments — **Stories 3.5/3.6**.
- ❌ `vitest bench`, the 100×60 performance gate, coverage-threshold changes, `passWithNoTests`
  removal — **Story 3.7**.
- ❌ `SimulationLoop`, RAF, the frame-delta clamp — **Story 3.8**.
- ❌ Colour-state batching and the `OrganismRef → fill-group` LUT — **Story 3.9**
  (`buildRefToFillGroup` already exists from Story 1.8; do not fork it).
- ❌ Extinction detection, auto-pause, population counts — derived views at the ≤10 Hz publish
  cadence (M2/Decision B.5), not engine state.
- ❌ The sparse `cells[]` wire form and the export envelope — **Story 5.3** (see FD7).
- ❌ Play-mode ephemeral resize UI and the {150×90, 200×120} presets — **Story 3.16**. This story
  makes the *function* size-parametric; it does not offer the sizes.
- ❌ Toroidal/wrapping edges, a Web Worker, a neighbour cache, an incremental dirty-cell stepper.
- ❌ Any new React component, route, or hook. If the diff adds a `.tsx`, the scope has slipped.

### Testing standards summary

- **Location:** co-located `*.test.ts` beside the source, node environment (`packages/*` are pure TS,
  no DOM). Every existing `packages/*` test follows this.
- **Hand-computed fixtures, documented in the test.** RFC-008/AR-40's house style and the one Story
  3.6 depends on: write the grid as an ASCII pattern with a legend, state the expected counts, and
  let the assertion read as the arithmetic. `@gol/test-utils`'s `gridFromPattern` / `emptyGrid` /
  `placePattern` build the **dense** form — reuse them as fixture input to the dense→typed converter
  rather than hand-rolling a builder (project-context: *"Don't hand-roll a fake repo in a test
  file"*, same principle).
- **The multi-organism neighbourhood test is the one that must not be skipped.** Same physical cell,
  two evaluating organisms, two different `(neighborCount, occupantNeighborCount)` pairs. Nothing in
  the codebase asserts this yet and Trap 4 explains what it costs when it is wrong.
- **Boundaries at more than one size.** Corners, edges, interior; and at least one degenerate size
  (1×N or N×1) where a clamped-bounds implementation and a `continue`-guard implementation diverge.
- **`fast-check` is installed** (root devDeps, v4, hoisted). AR-41 assigns property tests to **this
  story** — resize invariants and round-trip identity — so unlike 3.1/3.2 they are required here, not
  optional. Keep them to properties examples genuinely cannot pin.
- **Determinism:** nothing here is random. ❌ Do not import the seeded RNG — it belongs to Phase 3
  (Story 3.6).
- **No coverage-padding tests.** The ≥90% gate flips in Story 3.7; padding is rejected in review
  regardless. `packages/simulation` sits at 100% after 3.2 — write for correctness and let the number
  follow, and note in the record if it moves.
- **Never pixel/snapshot-test anything.** Not applicable here, and stated so it stays that way.

## Project Structure Notes

Indicative; the split is the developer's call, constrained by "nothing lands in `src/engine/`",
camelCase-never-dotted, and FD1/FD2's outcomes.

```
packages/simulation/src/
  engine/                        ⛔ UNCHANGED — 3.1's guarded, domain-blind layer
  gol/
    cellSubject.ts                  MODIFIED (FD5) — the OrganismRef comment must match reality
    survivalRules.ts             ⛔ unchanged
    resolveCellAction.ts         ⛔ unchanged
  grid/                          ← NEW: this story
    grid.ts                         Grid, empty-grid constructor, dense<->typed (FD1), invariants
    neighborhood.ts                 Moore 8, hard edges, the two relative counts (FD4)
    resizeGrid.ts                   top-left-anchored pure resize (FD2/FD6)
    doubleBuffer.ts                 whatever FD3 resolves to (or folded into grid.ts)
    <name>.test.ts                  hand-computed fixtures + fast-check properties
  index.ts                       barrel — `export type { … }` for types (isolatedModules)

apps/web/
  lib/canvas/renderableGrid.ts    MODIFIED — its "3.3 does not own this yet" comment; FD1's alias
  lib/battle/resizeGrid.ts        FD2 — moved, or comment corrected
  lib/battle/clearGrid.ts         FD2 — moved, or comment corrected

docs/planning-artifacts/architecture.md          MODIFIED (AC10) — Reconciliation #3's clause
docs/implementation-artifacts/deferred-work.md   MODIFIED (AC10, FD7) — outcomes recorded
```

Not touched: everything under `packages/simulation/src/engine/`, `eslint.config.mjs`,
`scripts/check-engine-boundary.mjs`, `packages/simulation/vitest.config.ts`,
`packages/simulation/tsconfig.json`, `packages/persistence/**`, `packages/domain/**`, and any
`.tsx` in `apps/web`.

⚠️ **29 files reference `RenderableGrid`.** If FD1 takes the alias route the change is one file and
the rest recompile untouched; anything larger than that is a signal to re-read FD1 before continuing.

## References

- [Source: docs/planning-artifacts/epics.md#Story 3.3: Typed-Array Grid & Neighborhood] — the story
  statement and the four AC bullets decomposed above
- [Source: docs/planning-artifacts/epics.md#Requirements Inventory] — AR-17 (typed-array grid,
  double-buffered, size-parametric, pure top-left `resizeGrid`), AR-41 (property tests: resize
  invariants, dense↔sparse↔typed round-trip), AR-40 (goldens; the non-GoL proof stays GoL-free),
  FR-5.8 (Moore 8), FR-5.9 (hard edges, no wrap), NFR-1.1 (60 FPS at 100×60 / 20 organisms)
- [Source: docs/planning-artifacts/rfcs/RFC-004-simulation-rules-engine.md#3.4 Grid representation]
  — the `Grid` interface verbatim, the `resizeGrid(grid, cols, rows)` signature, the ~O(N) cost
  model, and the "materialize `CellSubject` only at evaluation, or pass primitives positionally"
  note behind FD4
- [Source: docs/planning-artifacts/rfcs/RFC-004-simulation-rules-engine.md#3.3 Engine-owned concerns]
  — Moore/hard-edge definition; aging is Story 3.6's; `MAX_RELEVANT_AGE` is Story 3.4's
- [Source: docs/planning-artifacts/rfcs/RFC-004-simulation-rules-engine.md#2.1 The Cell subject] —
  `neighborCount` = same-organism, `occupantNeighborCount` = other-organism (Trap 4); `OrganismRef`
  as "the index into the dense organisms array" (FD5's first reading)
- [Source: docs/planning-artifacts/rfcs/RFC-004-simulation-rules-engine.md#3.2 The three-phase
  strategy] — `resolveConflict`'s `deps.organisms[r].dominance`, the indexing FD5 must reconcile
- [Source: docs/planning-artifacts/architecture.md#Decision A — Size-parametric grid] — A.3 top-left
  anchoring for **both** resizes (FD6), A.4 the ~O(N) performance claim and "no Web Worker in MVP",
  A.6 the typed-array memory budget and double buffering, A.7 only `initialGrid` is persisted
- [Source: docs/planning-artifacts/architecture.md#Decision B] — B.5 `Uint16Array` age is canonical
  and the `Uint8Array` claim is retired; `MAX_RELEVANT_AGE` belongs to Story 3.4
- [Source: docs/planning-artifacts/architecture.md#Decision C] — C.1 relative cell state, which is
  why the neighbour counts are relative too
- [Source: docs/planning-artifacts/architecture.md#Decision E] — E.2 the runtime grid stays numeric;
  refs are never persisted
- [Source: docs/planning-artifacts/architecture.md#Decision G] — G.3 the 255-organism cap the
  `Uint8Array` occupant derives
- [Source: docs/planning-artifacts/architecture.md#Cross-RFC Reconciliations] — **#3** dense at rest /
  typed at runtime / sparse on the wire, and the "battle repository converts" clause AC10 discharges
- [Source: docs/planning-artifacts/architecture.md#Minor Spec Resolutions] — M13's precedent for
  amending an over-reaching AC in the open (FD7); M2 population counts are not engine state
- [Source: docs/planning-artifacts/rfcs/RFC-005-application-state-modes-undo.md#Decision 4] — the
  dual-grid model, the "Representation note" behind FD1/FD6, and the live grid as double-buffered
  typed arrays cloned from `initialGrid` at Run
- [Source: docs/planning-artifacts/component-tree-battle-page.md#5. Non-React modules] — the frozen
  `GridRenderer` contract, whose `draw`/`drawFull`/`renderStatic` all take this `Grid`
- [Source: docs/planning-artifacts/component-tree-battle-page.md#6. State-management separation
  matrix] — the §6 invariant AC8 cites: *"grid buffers never enter React state; nothing below
  `useSimulation` imports React"*
- [Source: apps/web/lib/canvas/renderableGrid.ts] — `RenderableGrid`'s field names chosen verbatim
  from §3.4 so this story's `Grid` satisfies it structurally, and the ownership comment to retire
- [Source: apps/web/lib/battle/resizeGrid.ts] — the existing top-left resize, its always-new-buffers
  contract, its `subarray`-as-copy-source note, and the `age` zero-fill behind FD6; plus
  `countClippedLivingCells` / `willClipLivingCells`, which are FR-3.11 UI concerns, not engine ones
- [Source: apps/web/lib/battle/clearGrid.ts] — the second module naming this story as owner, and the
  in-place-mutation failure mode behind Trap 2
- [Source: apps/web/lib/battle/gridStats.ts] — `width * height` (never `occupant.length`) as the loop
  bound, fixed in Story 2.14 explicitly to be safe for this story's grid (Trap 7)
- [Source: apps/web/lib/canvas/refToFillGroup.ts] — the shipped `ref = index + 1`, slot-0-empty
  convention and `MAX_ROSTER_SIZE = 255` (FD5's second reading)
- [Source: apps/web/lib/battle/useUndoableGrid.ts] — `snapshot`'s `.slice()`-never-`.subarray()` note
  (Trap 3) and `restore()`'s age reallocation
- [Source: packages/simulation/src/gol/cellSubject.ts] — `OrganismRef`, `CellSubject`'s five fields,
  and the two ⚠️ comments already flagging that Story 3.3 materializes the neighbour counts
- [Source: packages/simulation/src/engine/README.md] — the one-directional boundary this story must
  leave intact
- [Source: packages/test-utils/src/gridBuilders.ts] — `emptyGrid` / `gridFromPattern` /
  `placePattern` (dense fixtures to feed the converter), and its own note that the typed-array `Grid`
  lands "in Story 3.3 once its shape is frozen" and sparse is Story 5.3's
- [Source: docs/implementation-artifacts/3-2-gol-rules-layer.md] — FD1–FD4 and their outcomes, the
  M13 amendment, and the trap/scope conventions this story continues
- [Source: docs/implementation-artifacts/3-1-generic-rules-engine.md] — M11/M12, the boundary lint,
  and the "measure before optimising" standard behind FD4
- [Source: docs/implementation-artifacts/deferred-work.md] — the Reconciliation #3 item explicitly
  assigned to this story (AC10); the `computeEditorGridStats` loop-bound entry closed in 2.14 for
  this story's benefit; the mirrored-fold entry that names "a typed-array shape `packages/domain`
  must not own until Story 3.3"
- [Source: docs/project-context.md#Critical Implementation Rules] — no classes in the engine; no DOM
  types in `packages/*`; grid dimensions are never constants; never persist a numeric `OrganismRef`;
  `Uint16Array` age / `Uint8Array` occupant; `isolatedModules` re-export form; camelCase-never-dotted
- [Source: docs/project-context.md#Testing Rules] — property tests cover resize anchoring and
  round-trip identity; coverage is a floor on the core; no coverage-padding tests
- [Source: docs/project-context.md#Development Workflow Rules] — `npm run ci` is the local mirror of
  CI; never pipe it; the commit gate

## Dev Agent Record

### Agent Model Used

claude-opus-5 (Claude Opus 5)

### Forced Decisions

**FD1 — dense↔typed conversion ownership: option (a).** `@gol/simulation` owns `Grid` and both
conversions (`gridFromDense` / `gridToDense`, `packages/simulation/src/grid/grid.ts`);
`apps/web/lib/canvas/renderableGrid.ts` becomes a two-line re-export — `export type { Grid as
RenderableGrid }` plus `export { gridFromDense as toRenderableGrid }`. Chosen because it is the
option Story 1.8's own comment was written in anticipation of, it discharges AC10 with a reword
rather than an argument, and the blast radius is one file: every one of the ~25 `RenderableGrid`
consumers recompiled untouched. Option (c) was rejected on the grounds the deferred-work entry
already gives (it needs a `@gol/persistence → @gol/simulation` edge, inverting AR-2/27); option (b)
leaves two definitions of one shape and does not discharge #3.

⚠️ **The value move WAS measured, not assumed** (the story's own caveat). `apps/web` declared
`@gol/simulation` as a dependency but imported nothing from it at runtime before this story, so
`toRenderableGrid` + `resizeGrid` + `clearGrid` crossing the boundary is the first real edge into
that package's graph. Measured on this tree with `bundle:check`, before and after, via `git stash`:

| route | baseline | with 3.3 | delta | budget |
|---|---|---|---|---|
| `/` | 329.6 KB | 329.8 KB | **+0.2 KB** | 340 |
| `/battle` | 305.0 KB | 305.2 KB | **+0.2 KB** | 310 |
| `/battle/new` | 304.9 KB | 305.1 KB | **+0.2 KB** | 310 |

⚠️ **Incidental finding worth a reviewer's eye, and NOT caused by this story:**
`check-bundle-size.mjs`'s comment derives `/battle`'s 310 budget from a **295.2 KB** measurement
(Story 2.13). The route measures **305.0 KB before this story's first line** — Stories 2.15/2.16
grew it ~9.8 KB without the comment being updated — so the standing `ceil((measured + 12) / 5) * 5`
formula has been silently unsatisfied for two stories and the real headroom is 5.0 KB, not the
~14.8 KB the comment implies. This story adds 0.2 KB of that. Recorded rather than acted on: raising
a budget is Sidiar's call and is not this story's to make.

**FD2 — the two Epic-2 modules: option (a), moved.** `resizeGrid` and `clearGrid` now live in
`packages/simulation/src/grid/`; the FR-3.11 clip predicates (`countClippedLivingCells` /
`willClipLivingCells`) stayed in `apps/web/lib/battle/resizeGrid.ts` because "how many living cells
would this shrink destroy" is dialog copy's arithmetic, not an engine concern — no phase, no cycle
and no simulation reads it. Signature: **RFC-004 §3.4's positional `resizeGrid(grid, cols, rows)`**,
not `apps/web`'s `{ cols, rows }` object. Reasoning: RFC-004 is the authority for the engine, and
trap 6 is explicit that `{ cols, rows }` is `GridRenderer`'s SIZE-argument spelling which must not
leak onto the grid API; the two `<BattleEditorView>` call sites spread their `EditableGridPreset`
(`resizeGrid(grid, preset.cols, preset.rows)`), which keeps the schema-shaped preset on the UI side
of the boundary where it belongs. `clearGrid` collapsed to `createGrid(grid.width, grid.height)` —
the same one allocator, so `occupant.length === age.length === width * height` has exactly one place
to be true. Tests moved with the functions (see the test-count note below).

**FD3 — double buffering: option (a), an explicit buffer-pair value.**
`packages/simulation/src/grid/doubleBuffer.ts` ships `GridBuffers { front, back }`,
`createGridBuffers(front)` and a pure `swapGridBuffers(pair)` returning a NEW pair with the two
grids reused. Chosen over (b) because the epic AC names double buffering as a property of *this*
story's grid model and because 3.5 and 3.8 both need the seam to already exist rather than to
invent it. It is a **seam, not a wired-up loop** — nothing steps yet, by design (that is 3.5/3.6).
The purity property AR-41 assigns to 3.5 is unaffected: the input grid is never written, the
destination is a distinct grid the caller supplied. ❌ Not module state, not a class, not a pool —
`swapGridBuffers` is a pure function over a value the caller owns, which is also what lets M3's
organism-preview instance run a second simulation in the same process without sharing a buffer.

**FD4 — neighbourhood API: option (a), `countNeighbors(grid, col, row, selfRef) → { same, other }`.**
The readable default, one pass over the ≤8 neighbours, both counts produced together (never two
passes, never "count all occupied, subtract"). The zero-allocation alternative — a packed integer
`same * 9 + other`, both counts being ≤ 8 — is **written down in the function's doc comment with its
decoding**, so Story 3.7 can swap it under a measurement instead of re-deriving the option. Not
taken now on this repo's own standard: Story 3.1's M12 guards were justified with a measured
+0.019 ms/cycle against the 16.7 ms budget, and the first measurements of this loop exist in 3.7.

**FD5 — 🔴 `OrganismRef` = roster index + 1, slot 0 reserved for empty.** The shipped convention
wins. It is what `apps/web/lib/canvas/refToFillGroup.ts` states, what the persisted dense
`gridState` means (RFC-001), what `BattleSchema` validates (`v ≤ organismIds.length`), and what
`buildRefToFillGroup` allocates for (`size = roster length + 1`); the competing reading would
require migrating every persisted battle, and under it `organisms[0]` collides with occupant
`0` = empty. Three things were done rather than one: (1) `cellSubject.ts`'s `OrganismRef` comment,
which said "the battle's dense organisms-array **index**", now states the `index + 1` encoding and
names the contradiction it replaces; (2) `grid.ts`'s `occupant` field carries the single full
statement of the convention **plus the consequence Story 3.5/3.6 inherit** — a roster lookup is
`organisms[ref - 1]`, NEVER `organisms[ref]`, which is exactly how RFC-004 §3.2's `resolveConflict`
snippet (`deps.organisms[r].dominance`) is currently written and is off by one for every organism
in the battle; (3) `grid.test.ts`'s `describe('OrganismRef encoding (FD5)')` pins it with a
two-organism roster.

⚠️ **Surfaced to Sidiar, as the story instructs regardless of direction.** This spans RFC-004,
RFC-001 and shipped code, which is Minor-Resolution-shaped — but **no `M14` was minted**:
`scripts/check-spec-ids.mjs` tokenises `M1`–`M13` only and widening it means editing two places, and
declaring a Minor Resolution is an authority-doc act rather than a story note. Recorded as a
candidate in `deferred-work.md` with the two RFC-004 lines that should carry the correction if it
becomes M14 (§2.1's "index into the dense organisms array" and §3.2's `deps.organisms[r]`).

**FD6 — 🔴 `resizeGrid` CARRIES `age` across, top-left anchored: option (a).** Never zero-filled.
Epic 2's zero-fill was justified by an Edit-mode-only premise (every editable grid is age-zero
everywhere, RFC-005 "Representation note") which is true and makes the two behaviours
indistinguishable in Edit mode — and which Story 3.16 breaks: it resizes a LIVE grid whose cells
have real ages, and `age` is a first-class rule input (FR-2.5), so zero-filling there would silently
reset every survivor to age 0 mid-simulation and change which rules fire. Decision A.3 says content
is preserved top-left for *both* resizes and carves out no exception for age. Cost: one extra
`.set()` per row.

⚠️ **This is a behaviour change to a shipped Epic-2 module, and was verified rather than assumed.**
The whole `npm run ci` is green, including `<BattleEditorView>`'s Story 2.14 resize suite,
`clearGrid`'s guards, `useUndoableGrid`'s snapshot/restore tests and all 344 e2e assertions across
four Playwright projects — the all-zeros equivalence holds in practice exactly as the reasoning
predicted. Two tests were rewritten rather than deleted: the old "reallocates `age` zero-filled"
case and the property asserting `age` is zeroed everywhere both **encoded the defect**, and are
replaced by cases that pin the carry (`carries 'age' across top-left anchored, not zero-filled`,
`clips 'age' with 'occupant' on a shrink`, and a Uint16 case where a `Uint8Array` age buffer would
wrap 300 → 44 silently).

**FD7 — dense↔typed covered here; sparse↔typed recorded as Story 5.3's: option (a).** The sparse
`cells[]` form is RFC-006's wire shape and does not exist until Story 5.3's `WorkspaceSerializer`
(`gridBuilders.ts` already records that split). **AC7 is amended in the open**, on the M13 precedent
— the epic AC asks for "dense↔sparse↔typed" round-trip identity; what shipped is the dense↔typed
half, both directions, under fast-check. The other half is written into `deferred-work.md` as 5.3's
obligation so it is not lost between two stories that each assume the other has it, with a note that
composing `sparse↔dense` there with `dense↔typed` here is preferable to writing a third converter.

### Debug Log References

Commands run, and their real results (never piped — `npm run ci | tail` reports *tail's* exit code,
which masked a real `format:check` failure during the Story 1.9 review; redirected to a file with
`$?` echoed):

| command | exit | result |
|---|---|---|
| `npm run typecheck` | 0 | 5/5 workspaces |
| `npm run lint` | 0 | clean |
| `npm run format:check` | 0 | clean |
| `npm run spec:check` | 0 | 191 cited ids resolve; 3/3 reconciliation citations resolve against 6 declared |
| `npm run boundary:check` | 0 | 7 escape shapes rejected, 2 legitimate imports accepted — `src/engine/` untouched |
| `npm run test:coverage` | 0 | see counts below; `@gol/simulation` **100%** stmts/branch/funcs/lines |
| `npm run build:standalone` | 0 | static export clean |
| `npm run bundle:check` | 0 | `/` 329.8/340, `/battle` 305.2/310, `/battle/new` 305.1/310 |
| `npm run e2e` | 0 | 344 passed (2.6m) |
| **`npm run ci`** | **0** | the full gate, run end to end after the individual legs |

Test counts, before → after:

- `@gol/simulation`: **73 → 149** (+76 across 4 new files)
- `apps/web`: **954 → 934** (−20). Not a drop in coverage: `resizeGrid`'s 21 cases and `clearGrid`'s
  8 moved down with their functions (29 → 9 retained, the 7 clip-predicate cases plus 2 clip
  properties, one of which cross-checks against the engine's `resizeGrid` — the one property neither
  module can state alone). Every `resizeGrid` behaviour previously asserted in `apps/web` is asserted
  in `packages/simulation`, with the two FD6 cases replaced as noted above.
- repo total: **+56**.
- Other packages unchanged: domain 99, persistence 82, test-utils 75.

RED phase confirmed before implementing: the four new test files failed with `Cannot find module`
while the 73 pre-existing tests stayed green.

### Completion Notes List

- **Two 🔴 spec conflicts settled, both in FD5 and FD6 above.** FD5 is the one that needs Sidiar's
  eye: the `OrganismRef` encoding is now consistent across `cellSubject.ts`, `grid.ts`,
  `refToFillGroup.ts` and the persisted schema, but **RFC-004 itself is still internally wrong** —
  §2.1 calls a ref "the index into the dense organisms array" and §3.2's `resolveConflict` writes
  `deps.organisms[r].dominance`, which is off by one under the encoding everything else uses. This
  story cannot fix an RFC's own snippets from a code change, and did not mint an `M14` unilaterally.
  It is the highest-value thing a reviewer can act on, because Story 3.6 is where the off-by-one
  would first produce silently wrong winners.
- **AC10 discharged by reword, not by argument.** `architecture.md`'s Reconciliation #3 now names
  `@gol/simulation` as the dense↔typed boundary and says explicitly why the repository cannot be it
  (`@gol/persistence → @gol/simulation` would stop persistence being a leaf and reverse AR-2/27).
  The numbered item was edited in place — `Reconciliation #N` is the one doc→doc citation
  `spec:check` gates, and the list was not renumbered. `deferred-work.md`'s Story 2-13 entry is
  marked resolved with the outcome.
- **AC9 discharged: no comment now predicts work this story finished.** `resizeGrid.ts`'s and
  `clearGrid.ts`'s "⚠️ Story 3.3 is the eventual owner" notes are gone with the functions;
  `renderableGrid.ts`'s "does not exist yet and does not own this type until 3.3 lands" is replaced
  by a statement of what the alias is and why the direction is unchanged; and
  `gridBuilders.ts`'s "that lands in Story 3.3 once its shape is frozen" now reads "landed".
- **AC8 held.** `packages/simulation` imports no React and no DOM types (`lib: ["ES2022"]` unchanged),
  contains no classes and no module-level mutable state, and `boundary:check` passes with
  `src/engine/` untouched. `eslint.config.mjs`, `scripts/check-engine-boundary.mjs` and
  `packages/simulation/vitest.config.ts` were not edited — `passWithNoTests` and the coverage
  threshold stay Story 3.7's to flip.
- **The multi-organism neighbourhood fixture exists and was written first** (trap 4). Same physical
  cell, two evaluating organisms, two different pairs — `{ same: 4, other: 3 }` as A and
  `{ same: 3, other: 4 }` as B. A "count all occupied neighbours" implementation answers 7/0 for
  both, which is precisely the wrong materialization nothing in the repo could previously catch.
- **Hard edges pinned at two sizes plus two degenerate ones.** All four corners (3 neighbours) and
  all four edges (5) at 4×4 **and** at a non-square 5×3; interior 8 at both; a 1×4 strip, a 4×1
  column and a 1×1 grid — the shapes where clamped bounds and a `continue` guard diverge, and where
  the modulo idiom double-counts. Plus explicit no-wrap cases on both axes and corner-to-corner.
- **Scope held.** No precompiled evaluators, no id→ref interning, no `MAX_RELEVANT_AGE`, no phases,
  no `Rng`, no `step()`, no aging increment, no bench, no RAF, no `.tsx` added, no wrap flag, no
  neighbour cache, no Web Worker. No `zod` in the engine; the eager throws are the `gridBuilders.ts`
  house convention for a function handed a raw `number[][]`.
- **Not addressed, flagged only (trap 13):** `project-context.md` and `CLAUDE.md` prose still say the
  Minor Resolutions run "M1–M10" while `architecture.md` carries M11–M13 and the checker accepts
  them. Harmless, out of scope here, and left for a doc pass.

### File List

**New — `packages/simulation/src/grid/`**

- `packages/simulation/src/grid/grid.ts`
- `packages/simulation/src/grid/grid.test.ts`
- `packages/simulation/src/grid/neighborhood.ts`
- `packages/simulation/src/grid/neighborhood.test.ts`
- `packages/simulation/src/grid/resizeGrid.ts`
- `packages/simulation/src/grid/resizeGrid.test.ts`
- `packages/simulation/src/grid/doubleBuffer.ts`
- `packages/simulation/src/grid/doubleBuffer.test.ts`

**Modified**

- `packages/simulation/src/index.ts` — barrel exports for the grid layer (`export type` for types)
- `packages/simulation/src/gol/cellSubject.ts` — FD5: the `OrganismRef` comment
- `packages/test-utils/src/gridBuilders.ts` — the "lands in Story 3.3" note, now true
- `apps/web/lib/canvas/renderableGrid.ts` — FD1: alias + re-export of `Grid` / `gridFromDense`
- `apps/web/lib/battle/resizeGrid.ts` — FD2: clip predicates only; `resizeGrid` moved down
- `apps/web/lib/battle/resizeGrid.test.ts` — clip-predicate suites retained, resize suites moved
- `apps/web/components/battle/editor/BattleEditorView.tsx` — imports `clearGrid`/`resizeGrid` from
  `@gol/simulation`; two call sites take the positional signature
- `docs/planning-artifacts/architecture.md` — AC10: Reconciliation #3's clause
- `docs/implementation-artifacts/deferred-work.md` — AC10 resolved; FD7 + the M14 candidate recorded
- `docs/implementation-artifacts/sprint-status.yaml` — status tracking
- `docs/implementation-artifacts/3-3-typed-array-grid-neighborhood.md` — this record

**Deleted**

- `apps/web/lib/battle/clearGrid.ts` — moved into `packages/simulation/src/grid/grid.ts` (FD2)
- `apps/web/lib/battle/clearGrid.test.ts` — moved into `packages/simulation/src/grid/grid.test.ts`

### Change Log

| Date | Change |
|---|---|
| 2026-09-09 | Story 3.3 implemented. `packages/simulation/src/grid/` adds the RFC-004 §3.4 typed-array `Grid`, dense↔typed conversion, Moore-8 hard-edge neighbourhood, pure top-left `resizeGrid`, and the double-buffer seam. FD1/FD2 consolidate `apps/web`'s Epic-1/2 grid modules under the engine; FD5 settles the `OrganismRef` encoding as `index + 1`; FD6 changes `resizeGrid` to carry `age`. AC7 amended per FD7; AC10 discharged in `architecture.md` + `deferred-work.md`. `npm run ci` exit 0. |

---

Dev Model: opus   # 3.3 is the epic's pattern-setting story, not a pattern-follower: it fixes the Grid shape, the double-buffering seam (FD3), the hot-path neighbourhood API (FD4) and the ref encoding (FD5) that Stories 3.4-3.9 and 3.16 all build on directly, and it must resolve a genuine RFC-004-vs-shipped-code contradiction plus a two-story-old deferred architecture clause rather than implement a settled design

---

This story was implemented with the 'Implement next story' skill with the following stats:

| Phase | Agent model | Agents | Wall clock | Input | Output | Cache write | Cache read | Total tokens |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Step 0 — re-entry guard | — | 0 | 29s | 26 | 3,054 | 13,097 | 556,910 | 573,087 |
| Step 1 — create-story | opus-5 | 1 | 8m 20s | 190 | 36,045 | 491,322 | 9,300,891 | 9,828,448 |
| Step 2 — dev-story | opus-5 | 1 | 23m 04s | 222 | 61,314 | 466,128 | 15,265,160 | 15,792,824 |
| Step 3 — code review + PR | fable-5 | 4 | 31m 46s | 428 | 77,260 | 1,796,562 | 20,003,152 | 21,877,402 |
| _of which the orchestrator_ | opus-5 | — | — | 84 | 17,579 | 62,247 | 2,242,146 | 2,322,056 |
| **Total (create-story → PR ready)** | | 6 | **1h 03m** | 866 | 177,673 | 2,767,109 | 45,126,113 | **48,071,761** |

Run started 2026-09-09 11:24 CEST; wall clock runs to the point the run stopped for Sidiar's review. Each phase row covers the phase agent, any agents it spawned, and the orchestrator's own turns in that window — the orchestrator row breaks its share out again, it is not additional. Cache reads dominate the token totals and are billed at a fraction of input rate, so read the Input and Output columns for effort and the total only as a ceiling. The orchestrator's final turn is still being written when these numbers are taken.
