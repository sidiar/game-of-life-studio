---
baseline_commit: 1e70bcdf4fd18f12a48c58f01df1888aa7877237
---

# Story 3.9: Colour-State Batch Rendering

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a user,
I want smooth playback with visible aging,
so that large battles animate fluidly while organisms fade in with age.

## Acceptance Criteria

From `epics.md#Story 3.9: Colour-State Batch Rendering`, decomposed into what a reviewer can check
independently. **Most of the epics AC is already shipped code** — the batching (`groupByColourState`,
Story 1.8), the LUT (`buildRefToFillGroup`, 1.8), the ramp (`displayColor.ts`, 1.7) and the
occupant-or-age-shade dirty rule (`selectDirtyCells`, 2.3) all exist and are unit-tested. What does
**not** exist is the path a playback frame takes through them: Story 3.8's loop calls
`renderer.draw(grid)` once per step, and `GridRenderer.draw` repaints **only marked cells** — nobody
marks anything in playback, so today a running simulation is a dish that never visibly moves, with
nothing thrown (`simulationLoop.ts` Trap 1; `deferred-work.md` "Story 3.9 owns the repaint adapter").
AC1–AC3 are that path. AC4–AC7 are the epics' four clauses, restated as what a test must prove *on
that path*, not on the Edit-mode path where they were first proven.

1. **`GridRenderer.drawDiff(grid)` — the playback repaint.** A new public method: every cell is a
   candidate, diffed against the retained last-drawn colour-state baseline (`lastColourState`), and
   only the cells whose colour state changed are repainted — background-first, then colour through
   the shared `(colorToken, ageShade)` batching, then the grid-line segments crossing them — exactly
   `draw`'s repaint routine (`paintDirtyCells`) fed by a whole-grid sweep instead of the marks. No
   marks are read; any marks outstanding are consumed (cleared) because every cell was a candidate.
   With no baseline primed it falls back to a full paint, as `draw` does (2.3 FD3). It calls no
   scheduling primitive, mutates no grid, and the existing structural regex test keeps saying so.

2. **The sweep is a pure unit.** `selectChangedCells(grid, lut, lastColourState): DirtyCellRepaint[]`
   in `dirtyCells.ts`, beside `selectDirtyCells`: one `colourStateAt` per cell over
   `0..width*height`, no `Set`, no `CellCoord` allocation, results in ascending index order. It is the
   renderer's *brain* for playback (AR-42) and is what the bench measures (AC7).

3. **The step-renderer adapter is this story's, not 3.10's.** `toStepRenderer(renderer)` returns the
   `{ draw(grid) }` object Story 3.8's `createSimulationLoop` takes, wired to `drawDiff`. This is the
   one thing that closes 3.8's Trap 1 for 3.10: a raw `GridRenderer` satisfies the loop's
   `StepRenderer` port **structurally** (it has a `draw`) and freezes the dish silently; the adapter is
   the named, obvious thing to hand the loop instead, and its doc says why.

4. **Batching holds on the playback path (AR-23, Decision B.2).** For a `drawDiff` whose changed
   cells span several `(token, shade)` states, the context log shows exactly one `fillStyle` write,
   one `beginPath` and one `fill` per *group*, groups in ascending `groupId`, and the group count is
   bounded by the palette (≤ 160), never by the roster: a 255-organism roster on 20 tokens produces
   ≤ 160 groups in a single `drawDiff`. Reuse of `paintDirtyCells` makes this true by construction;
   the test pins it so a later rewrite cannot un-make it.

5. **Non-aging organisms fold into `(token, 7)` in playback (B.2).** Drive a fixture through real
   engine steps (`stepGridBuffers`, Story 3.8) with a non-aging survivor: after its birth frame it
   produces **zero** repaints on the age-1…age-9 frames (its colour state never changes), and its one
   colour is `displayColorAt(tokenIndex, 7)`. An aging organism on the same token at the same ages
   repaints on exactly the frames where `min(age, 7)` changes — ages 1 through 7 — and not on 8, 9.

6. **The aging ramp is what playback paints (FR-5.7, B.3).** For a cell placed at age 0 (the
   `drawFull` prime paints it `displayColorAt(t, 0)`) that survives seven engine cycles, the
   `fillStyle` values `drawDiff` writes for it on cycles 1–7 are `displayColorAt(t, 1)`, …,
   `displayColorAt(t, 7)` in that order — 30 % → 100 % of the token's own saturation — and there is
   no write for it on cycles 8–10. This is the sentence "visible in playback" made testable without
   a browser: the *decision* is asserted on the recording context; the raster is 3.11's Playwright
   smoke check (RFC-008 Decision 6 — never pixel-snapshot).

7. **The LUT is built once per battle, at simulation start, and the engine's refs index it.**
   `buildRefToFillGroup(battle.organismIds, organismsById)` is already that function (Story 1.8,
   benched at ~0.003 ms). What this story proves is the *cross-package invariant* it rests on: the
   `occupant` values the engine writes (`internOrganismIds` over the same `organismIds` order, M14)
   are the refs the LUT was allocated for. A test interns a two-organism roster, steps one real cycle,
   and asserts the newborn cells' `colourStateAt` resolves to the *right* organism's token. No new LUT
   builder; no LUT rebuild per frame; nothing on the per-step path calls `paletteIndexOf`.

8. **The benchmark gate measures the frame playback actually runs (AR-43, NFR-1.1).** A new
   `repaint-diff-path 100x60 x20` bench measures `selectChangedCells` at its upper bound (every cell
   changed, the sibling `repaint-dirty-path`'s convention), and **replaces `repaint-decision` as the
   gated repaint half** in `scripts/check-bench-budget.mjs` — `step + repaint-diff-path ≤ 16.667 ms`.
   `repaint-decision` (`groupByColourState`, the `drawFull` decision) stays required and printed.
   The budget does not move; `bench:check` is green locally and the Dev Agent Record quotes the
   numbers. See FD3 and the spec-conflict section — this is a gate-mechanism change for Sidiar to
   see at PR time.

9. **Bookkeeping closes the sentences that name this story.** `repaintDecision.bench.ts` no longer
   says "Story 3.8's loop would rebuild this per frame"; `gridRenderer.ts` no longer says "Story 3.8
   now has both numbers" or "Story 3.9's batching work" as a future; `deferred-work.md`'s three 3.9
   entries (live-frame number, four-bar restoration, repaint adapter) are each closed with a number
   or reassigned with a reason; `performance-baseline-validation.md` records the new gated pair.
   `npm run spec:check` passes with every cited ID spelled as the specs spell it.

## Tasks / Subtasks

- [x] **Task 1 — The pure sweep** (AC2)
  - [x] Add `selectChangedCells(grid: RenderableGrid, lut: RefToFillGroup, lastColourState:
    Uint16Array): DirtyCellRepaint[]` to `apps/web/lib/canvas/dirtyCells.ts`. Loop `index` from 0 to
    `grid.width * grid.height`; `colourStateAt(grid, lut, index)`; push `{ index, colourState }` when
    it differs from `lastColourState[index]`. Guard the buffer lengths the way `groupByColourState`
    does (throw with both numbers) — a short `age` reads `undefined` → NaN → shade 0 silently.
    Ascending order falls out of the loop; do not sort.
  - [x] Head comment: this is B.4's dirty rule ("occupant change OR age-shade change") applied to
    the whole grid because **the engine publishes no change list** (`threePhaseStep` returns a grid,
    not a diff — Story 3.6 FD1), and the per-cell baseline compare (~0.08 ms at 100×60, the
    `colour-state-reprime` number) is cheaper than the `markDirty`-everything adapter (~0.7 ms, a
    coordinate object per cell per frame through a `Set`). Cite Decision B.4, AR-23, AR-42.
  - [x] Tests in `dirtyCells.test.ts`: identical grid → `[]`; one changed cell → one entry with the
    NEW state; occupied → empty reports `EMPTY_COLOUR_STATE`; age 7 → 8 does NOT report (shade
    saturates — B.4's "first 7 cycles"); age 6 → 7 does; two organisms sharing a token swapping
    places → `[]` (B.2 folding); short buffers throw; result ascending.

- [x] **Task 2 — `drawDiff` on `GridRenderer`** (AC1, AC4)
  - [x] Add `drawDiff(grid: RenderableGrid): void` to `apps/web/lib/canvas/gridRenderer.ts`, next to
    `draw`. Body, in this order: `assertGridMatchesSize(grid)`; if `lastColourState === null` →
    `this.paint(grid); return;` (same fallback, same reason as `draw`); `const repaints =
    selectChangedCells(grid, this.palette, this.lastColourState)`; `this.lastGrid = grid`;
    `this.dirtyCells.clear()` (every cell was a candidate, so marks are subsumed — say so); if
    `repaints.length === 0` return without touching the context; else `this.paintDirtyCells(grid,
    repaints)` then write each `repaint.colourState` into the baseline. Factor the tail `draw` and
    `drawDiff` now share into one private helper if that reads better than two copies — but keep
    `draw`'s marks-only semantics and its tests **byte-for-byte**: the test at
    `gridRenderer.test.ts` "is a complete no-op when no marks are outstanding" passes a *different
    grid* with no marks and expects nothing, and that is a Story 2.3 AC, not an accident (FD1).
  - [x] Update the class doc comment (lines 1–5): the six-method contract gains a seventh, and why
    (the frozen contract's `draw` is "pure repaint of dirty regions" and assumes a dirty set exists;
    in playback nobody produces one, so the renderer derives it). Cite `component-tree-battle-page.md`
    §5, RFC-002 §"3." and Decision B.4. The AC3 source-text regex already covers the file; the two
    behavioural AC3 tests enumerate the surface by hand — add a `renderer.drawDiff(…)` call to
    "never calls requestAnimationFrame … across the full API surface" and to "never mutates the
    grid it is given", the way Story 2.3 added `markDirty`/`draw` there.
  - [x] Replace the stale forward references in this file: `resetDirtyState`'s comment ("Story 3.8
    now has both numbers instead of an assumption" → this story took `drawDiff`, against these
    figures); `draw`'s "this is the property Decision D.3 relies on to make idle playback frames
    free" (since 3.8, idle frames never reach the renderer at all — the loop draws only after a
    step; the no-op is now the *no-change* frame's property — a still-life under `drawDiff` touches
    the context zero times); `restoreGridLinesOver`'s "Story 3.9's batching work, or a Playwright
    measurement" → "a Playwright measurement" (Task 6 says why).
  - [x] Tests in `gridRenderer.test.ts`, new `describe('drawDiff — the playback repaint (Story 3.9)')`:
    repaints ONLY the changed cells of a 100×60 grid with no marks (the 2.3 "ONE region" test's
    shape, via `drawDiff` instead of `markDirty`+`draw`); a still-life frame (same content, new grid
    object) touches the context zero times; an erased cell gets background + line restoration and no
    colour; a mixed frame batches by colour state — one `fillStyle`/`beginPath`/`fill` per group,
    ascending `groupId` (AC4); a 255-ref LUT on 20 tokens × 8 shades yields ≤ 160 `fillStyle` colour
    writes (AC4's bound); outstanding marks are consumed by `drawDiff` (a following `draw` is a
    no-op); no baseline → full paint (the full-backing-store `fillRect` tell); dimension mismatch
    throws before touching the context; the identical-call-log determinism test 2.3 wrote for
    `draw`, repeated for `drawDiff`.

- [x] **Task 3 — The step-renderer adapter** (AC3)
  - [x] Create `apps/web/lib/canvas/playbackRenderer.ts` exporting
    `toStepRenderer(renderer: Pick<GridRenderer, 'drawDiff'>): StepRenderer` — `StepRenderer` imported
    as a type from `@gol/simulation` (Story 3.8's port: `{ draw(grid: Grid): void }`). Body: `{ draw:
    (grid) => renderer.drawDiff(grid) }`. Pure, DOM-free, no React.
  - [x] Head comment names the trap it exists for, verbatim enough to grep: a `GridRenderer` handed
    to `createSimulationLoop` directly type-checks (it has a `draw`) and never repaints, because
    `draw` is the marks-only Edit path (Story 2.3) and the loop marks nothing (Story 3.8 AC5). Story
    3.10's `useSimulation` must hand the loop **this** object. Cite Story 3.8, Story 3.10, Decision D.
  - [x] Add the file to `NO_SCHEDULING_SOURCES` in `gridRenderer.test.ts` (hand-maintained list —
    2.3 Trap 8). Test: `toStepRenderer(r).draw(g)` calls `r.drawDiff(g)` exactly once with the same
    grid and nothing else; the returned object satisfies the port (compile-time — the test file
    passes it to `createSimulationLoop` with a fake scheduler, steps one frame, and asserts one
    `drawDiff` — the only test in `apps/web` that constructs the loop, so 3.10 has a worked example).

- [x] **Task 4 — Playback-path tests through the real engine** (AC5, AC6, AC7)
  - [x] New `apps/web/lib/canvas/playbackRendering.test.ts` (or a `describe` in `gridRenderer.test.ts`
    if it stays under ~150 lines — your call, say which). Harness, copied from
    `packages/simulation/src/loop/stepGridBuffers.test.ts`'s last test (do not re-derive
    `SimulationDeps`): `const deps: SimulationDeps = { ...compileSession(roster), organisms:
    roster.map((o) => ({ dominance: o.dominance })), rng: createSeededRng(FIXED_SEED) }`;
    `front = gridFromDense(gridFromPattern(rows, LEGEND))`; `buffers = createGridBuffers(front)`;
    LUT = `buildRefToFillGroup(roster.map((o) => o.id), new Map(roster.map((o) => [o.id, o])))` —
    **the same `roster` array order as `compileSession` saw** (AC7). All of `compileSession`,
    `createGridBuffers`, `stepGridBuffers`, `gridFromDense` are exported from `@gol/simulation`;
    `CONWAYS_CLASSIC`, `gridFromPattern`, `createSeededRng`, `FIXED_SEED` from `@gol/test-utils`.
    Variants: `{ ...CONWAYS_CLASSIC, agingEnabled: true }` for the aging cases (Conway's Classic
    ships non-aging, FR-1.5); a second organism is the same spread with a new `id` and
    `colorToken`. A `RecordingContext2D` renderer primed with `drawFull(buffers.front)`. Per
    cycle: `buffers = stepGridBuffers(buffers, deps)`; `renderer.drawDiff(buffers.front)`; collect
    `ctx.calls` / `ctx.fillStyleWrites` (clear both between cycles).
  - [x] AC6: a Conway block (still-life, survives forever) with `agingEnabled: true` — pick one of
    its four cells; the colour writes that include a `rect` at that cell's coordinates are, in order,
    `displayColorAt(t, 1)` … `displayColorAt(t, 7)` on cycles 1–7 (the block is born at age 0 by
    `drawFull`, at shade 0), then **no** write for it on cycles 8–10. Assert the exact seven strings.
  - [x] AC5: the same block with `agingEnabled: false` — zero context calls on cycles 1–10 (the
    still-life under a non-aging LUT is the "no-change frame"); its one colour in the `drawFull` is
    `displayColorAt(t, 7)`. Then a two-organism roster sharing one token, one aging and one not,
    each a block: the aging block's cells repaint on cycles 1–7, the non-aging block's never.
  - [x] AC7: a two-organism roster (different tokens), a blinker of each; intern with
    `internOrganismIds(organismIds)` and build the LUT with `buildRefToFillGroup(organismIds, …)`
    from the **same array** — after one real step, `colourStateAt(front, lut, i)` for a newborn
    cell of organism B resolves to `paletteIndexOf(B.colorToken) * 8 + 0`, not A's. Add a negative
    twin: build the LUT from the *reversed* id list and show the tokens swap — that is the bug the
    invariant exists to catch (`refToFillGroup.ts` header: "the roster ORDERING … is the real
    invariant").
  - [x] Use `@gol/test-utils` builders (`gridFromPattern`, `createSeededRng`, `FIXED_SEED`, canonical
    organisms) — no hand-rolled grid literals (project-context "Layout & fixtures"). Call
    `resetColourStateWarnings()` and `resetRefToFillGroupWarnings()` in `afterEach`.

- [x] **Task 5 — Bench and gate** (AC8)
  - [x] In `apps/web/lib/canvas/repaintDecision.bench.ts` add `repaint-diff-path 100x60 x20`:
    `const baseline = new Uint16Array(cellCount); selectChangedCells(grid, lut, baseline);` — the
    zero-filled baseline is the sibling `repaint-dirty-path`'s convention (every cell reads as
    changed, including empties → `EMPTY_COLOUR_STATE`), so the two numbers are the *same candidate
    set through two mechanisms*; label it an upper bound the way the sibling is. Reword the
    `allCells` comment (lines ~108–109): the coordinate list is the cost of the adapter this story
    **rejected**, kept measured so the rejection has a number beside it. Reword the
    `repaint-decision` doc (lines ~113–118): it was gated as the call-independent choice *until the
    call was made*; it is now the `drawFull` decision (resize, grid-lines toggle, mount), printed and
    required, no longer gated. Reword the `repaint-dirty-path` doc: "which is what a playback frame
    is" → "which is what a playback frame *would have been* under the marks adapter".
  - [x] `scripts/check-bench-budget.mjs`: add `'repaint-diff-path 100x60 x20'` to the `apps/web`
    `required` list; change `GATED_TASKS` to `['step 100x60 x20', 'repaint-diff-path 100x60 x20']`;
    update the derivation comment (item 3: "one `step()` plus one repaint" — the repaint is now the
    whole-grid diff `drawDiff` runs). Spell spec IDs by hand — `spec:check` does not read `.mjs`
    (3.7 Trap 9).
  - [x] `docs/implementation-artifacts/performance-baseline-validation.md`: add the new task to the
    repaint table with its measured range, state the gated pair change and why, and re-run the
    frame arithmetic with the new pair. Do not touch the budget or the fixture.
  - [x] Run `npm run bench` then `npm run bench:check`; quote the printed table in the Dev Agent
    Record. Expect `repaint-diff-path` around 0.1–0.2 ms locally (sweep ~0.08 + push of ~6000
    entries); if it lands above ~0.5 ms something is allocating per cell — look before recording.

- [x] **Task 6 — Bookkeeping** (AC9)
  - [x] `deferred-work.md`, three entries: (1) the 3.8-section live-frame entry ("A live-frame number
    … reassigns to Story 3.9") — close with the `repaint-diff-path` number *and* the observation
    that under `drawDiff` a live frame's decision cost is the O(cells) sweep regardless of how many
    cells changed, so "a fraction of cells changed" buys nothing on the decision side and everything
    on the raster side (unmeasurable here); (2) the four-bar line-restoration entry (L~203) — this
    story reused `paintDirtyCells` verbatim (FD2), cannot measure raster either, and reassigns the
    question to a Playwright measurement with no story number, stating the crossover it would
    answer: with grid lines on, a changed cell costs 6 context calls (1 background, 1 rect + share of
    a `beginPath`/`fill`, 4 bars) against 1 under `drawFull`, so `drawDiff` is the cheaper *decision*
    always and the cheaper *raster* only below some changed-fraction; (3) record the `StepRenderer`
    adapter as the object 3.10 must hand the loop, and that a raw `GridRenderer` is the freeze.
  - [x] `component-tree-battle-page.md` §5 — do **not** edit (planning artifact; Sidiar's call). Put
    the one-line amendment candidate in `deferred-work.md` under this story: `drawDiff(grid): void //
    playback repaint: every cell a candidate, diffed against the last paint (B.4); Epic 3 adds this
    one method`. The M14/M15 and 3.8 RFC-002 §5 precedent.
  - [x] Run `npm run ci > /tmp/ci-3-9.log 2>&1; echo $?` — never pipe to `tail`. Record the real exit
    code, the `bench:check` table and the `bundle:check` headroom in the Dev Agent Record. `/battle`
    had ~4.7 KB gzip headroom after 3.8; this story adds code to that chunk — if `bundle:check` goes
    red, **stop and report**, do not raise the budget (Sidiar's ratchet rule).

## Dev Notes

### Constraints the developer MUST follow

- **Scope: the playback repaint path, its brain, its adapter, its tests, its bench.** The
  `useSimulation` hook, `attachRenderer`, refs and the `cycle`/`population` publish are **3.10**. The
  `'playback'` variant of `<PetriDishCanvas>`, `onRendererReady`, `desynchronized: true` and the
  Run-mode chassis are **3.11**. Ephemeral resize is **3.16**, fullscreen re-layout **3.18**, the
  cell-pulse animation **6.7**. This story touches `apps/web/lib/canvas/**`, one script, and docs.
- **`apps/web` rules:** strict TS, no `any`/`!`/`@ts-ignore`; `export type` for types; camelCase
  filenames; `@gol/*` imports by package name (`@gol/simulation`, `@gol/test-utils` — the latter
  only from `*.test.ts`/`*.bench.ts`, the import-boundary lint block enforces it). No coverage gate
  here (deliberate counter-metric) — the tests exist because the ACs need them, not for a number.
- **Never batch by organism** (Decision B.2). `paintDirtyCells` already keys by colour state; the
  reuse is the guarantee. If you find yourself writing a `Map<ref, …>` on the paint path, stop.
- **The renderer owns no aging logic** (Decision B.1). `drawDiff` reads `grid.age` through
  `colourStateAt` → `fillGroupOf` → `ageShadeFor`; it never increments, clamps, or compares ages
  itself. `MAX_AGE_SHADE = 7` (visual) is not `MAX_RELEVANT_AGE` (engine) — never import the latter
  into `lib/canvas`.
- **Nothing per frame may resolve a token.** `paletteIndexOf` runs inside `buildRefToFillGroup`,
  once per battle. The per-step path is typed-array reads and one precomputed-table index.
- **The renderer never schedules and never mutates the grid** (AC3 of Story 1.8; the frozen contract's
  second half). `drawDiff` retains `grid` as `lastGrid` exactly as `draw` does — a borrow, not
  ownership. In playback that borrow points at the front buffer the engine will overwrite two
  cycles later; that is fine because `resize`/`setGridLines` are the only readers and both are
  paused-only surfaces in Run mode (3.16, FR-4.9) — say so in the `lastGrid` comment.
- **Comments explain WHY and cite by ID**: `Decision B`, `AR-23`, `AR-42`, `AR-43`, `RFC-002`,
  `FR-5.7`, `NFR-1.1`, `Story 3.8`, `Story 3.10`, `Story 3.11`. `B.4` in prose is fine; `AR23` is
  silently exempt forever (`spec:check` compares sets).

### What this story is, in one paragraph

Every mechanism the epics AC names is already on disk and tested: batching by `(token, min(age,7))`
with the 160 bound (`colourStateGroups.ts`, `refToFillGroup.ts`), non-aging folding to shade 7
(`ageShadeFor`), the 30 % → 100 % ramp (`displayColor.ts`), the once-per-battle LUT
(`buildRefToFillGroup`), and the occupant-or-age-shade dirty rule (`selectDirtyCells`,
`lastColourState`). What is missing is the sentence RFC-002 §5 assumes and nobody implements:
*"repaint only after a step (dirty regions)"* — dirty **according to whom?** Edit mode's `draw`
takes candidates from the pointer (Story 2.3's hybrid); the engine returns a whole grid and no change
list (3.6 FD1); Story 3.8's loop calls `draw(grid)` and marks nothing, by design (its AC5). So in
playback the renderer has to derive the dirty set itself, and the cheapest correct way — measured in
3.7 — is the O(cells) compare against the baseline it already keeps (~0.08 ms at 100×60), not
marking 6,000 coordinates through a `Set` (~0.7 ms) and not `drawFull` (cheaper to *decide*, ~0.15
ms, but rasterizes the entire dish every step). This story adds that one method, `drawDiff`, its
pure sweep, the three-line adapter that makes it the obvious thing for 3.10 to hand the loop, tests
that walk real engine cycles and assert the ramp on the recording context, and moves the perf gate
onto the frame playback actually runs.

### Forced decisions (record the option taken and why in the Dev Agent Record)

**FD1 — How playback gets a dirty set.** Story 3.8 named the three candidates and left the call
here (`deferred-work.md` "Story 3.9 owns the repaint adapter"); the frozen contract says "Epic 3
wraps it with the loop, adding nothing to it".
- **(a) A seventh method, `drawDiff(grid)`: whole-grid compare against `lastColourState`, then the
  existing `paintDirtyCells`** *(recommended)*. Cost is the `colour-state-reprime` sweep (~0.08 ms)
  plus grouping of the changed subset; zero per-cell allocation beyond the repaint list; keeps
  `draw`'s Story 2.3 semantics and every test of it intact; raster work proportional to change.
  Cost: one method on a contract that says "adding nothing" — flagged below, candidate wording
  recorded, Sidiar's call whether the component tree gets the line.
- **(b) `draw(grid)` widens its own candidates to every cell when `grid !== lastGrid`.** No new
  method, and it would even make the raw `GridRenderer` correct as the loop's port (the double
  buffer alternates identities every step). Rejected: it changes `draw`'s contract by *object
  identity*, which the signature cannot express, and it breaks an epics AC (Story 2.3: *"only
  regions marked dirty since the last draw are repainted"*) pinned by name in
  `gridRenderer.test.ts` ("is a complete no-op when no marks are outstanding" hands `draw` a
  different grid and expects nothing). A semantics change hidden in a test rewrite is the review
  finding, not the fix.
- **(c) 3.10 hands the loop an adapter that `markDirty`s every cell then `draw`s.** Contract-pure;
  measured ~0.7 ms upper bound and, worse, `cols × rows` `{col,row}` objects per step through
  `toFlatIndex` and a `Set` — at 200×120 × 20 gen/sec that is ~480 k short-lived objects a second
  on the GC (NFR-1.1's "buffer for GC" is 0.67 ms).
- **(d) `drawFull` per step.** Contract-pure, ~0.15 ms decision, and the whole background + every
  occupied cell + the grid-line overlay `drawImage` re-rasterized 20×/s. RFC-002's whole §"1."/"2."
  exist to avoid exactly this, and `deferred-work.md`'s 2.3 entry asked 3.7 to make sure the loop
  does *not* do it. `drawFull` stays what it is: mount, resize, grid-lines toggle.
- **(e) The engine emits a change list.** Semantically the cleanest, and the only way the decision
  becomes O(changed). Rejected for this story: it is a change to `SimulationStrategy`'s return type
  and to Phase 3's inner loop (the benchmarked path, Story 3.7 "any engine performance work that is
  not `birthSurvivalPhase` work is measurement theatre"), it needs its own goldens, and the saving
  is ~0.08 ms of a 16.67 ms frame. If a real-browser measurement ever shows the *raster* side wants
  it, it is its own story.

**FD2 — Grid-line restoration on the playback path.** `paintDirtyCells` redraws four 1-px bars per
repainted cell (two redundant except on the last column/row — `deferred-work.md` L~203, assigned to
"3.9 alone, or a Playwright measurement").
- **(a) Reuse `paintDirtyCells` verbatim** *(recommended)*. Byte-identical restoration to Edit
  mode's, one routine to keep correct, no widening of the `Canvas2D` alias or the recording double.
  The 4-vs-2 question is raster cost, and this harness has no raster (jsdom has no canvas, 3.7
  FD2); reassign it to a Playwright measurement and stop naming a story.
- **(b) Restore lines by re-compositing the cached overlay (`drawImage(overlay, 0, 0)`) after the
  cells.** One call instead of four per cell — and **wrong**: the overlay is `--gol-grid-line`,
  `rgb(51 51 51 / 0.3)`, and alpha-compositing it over lines that are already there darkens every
  unchanged line by another 30 % each frame. Only the background fill under a changed cell resets
  its lines; the bars over that cell are the minimum correct restore.
- **(c) A conditional two-bar restore.** Encodes the closing-bar clamp's edge case a second time;
  the entry itself calls that the reason it was kept at four.

**FD3 — What the bench gate sums.** 3.7 gated `step + repaint-decision` (`groupByColourState`)
"deliberately: it is the repaint decision whose cost does not depend on which call Story 3.8's loop
ends up making" — i.e. a placeholder until the call was made. It is made.
- **(a) Gate `step + repaint-diff-path`** — the decision playback actually runs, at its upper bound
  (zero-filled baseline, every cell changed) *(recommended)*. Keeps the concept "step + repaint
  decision" that project-context, epics 3.7 and the derivation comment all state; changes only
  which function is that decision. Expect the frame number to move by < 0.2 ms; headroom stays
  ~27 % on the runner. Requires touching `check-bench-budget.mjs`'s `GATED_TASKS` + `required`, and
  the baseline doc — a gate-mechanism change, so it is flagged for Sidiar below, not slipped in.
- **(b) Keep gating `repaint-decision`; print `repaint-diff-path`.** Zero gate churn, and the gate
  keeps measuring a path a running simulation never executes (`drawFull` is mount/resize/toggle).
  The AC's "the 3.7 benchmark confirms the baseline holds with batching active" reads as the gate
  meaning the real frame; (a) is the honest reading, (b) the quiet one.
- **(c) Gate the max of both.** Two numbers for one frame; the script's derivation says "one step
  plus one repaint", not "plus the larger of two repaints it might do".

**FD4 — Where the sweep's upper-bound fixture puts its baseline.** Zero-filled (`new Uint16Array`)
means group 0 everywhere, so *every* cell — empty ones included — reads as changed: 6,000 repaints.
`EMPTY_COLOUR_STATE`-filled means "the frame after a wipe": only occupied cells (1,777) change.
- **(a) Zero-filled, the sibling's convention** *(recommended)*. Same candidate set and same baseline
  as `repaint-dirty-path`, so the printed pair is a like-for-like comparison of the two mechanisms —
  which is the point of keeping the rejected one in the file. Label it an upper bound; say what
  6,000 means.
- **(b) `EMPTY`-filled.** The more realistic worst frame, and a different number from the sibling for
  a reason that is not the mechanism. If you want it, add it as a third, tracked, ungated task —
  do not replace (a).

### Traps

1. **The dish that never moves.** `createSimulationLoop({ renderer: gridRenderer, … })` compiles
   (`GridRenderer` has `draw(grid)`) and paints nothing after a step. Task 3's adapter is the fix;
   its head comment and `simulationLoop.ts` Trap 1 are the two places the next reader looks. Do
   not "fix" it by making `draw` diff (FD1 (b)).

2. **`drawDiff` after `renderStatic`.** `renderStatic` primes no baseline (`lastColourState` stays
   `null`) — the first `drawDiff` falls back to a full paint, which is correct and is what 3.11's
   mount must not rely on: the playback canvas primes with `drawFull`, like the edit canvas. Test it
   both ways.

3. **The grid identity in `lastGrid`.** After `drawDiff(front)`, the engine's next step writes into
   the *other* buffer, swaps, and the one you retained becomes the next `back`. A `setGridLines()` or
   `resize()` between two steps repaints `lastGrid` — still intact, because writes happen only inside
   `stepGridBuffers`. A reader who "optimises" by handing `drawDiff` one long-lived scratch grid every
   frame breaks nothing here (the baseline, not `lastGrid`, is the diff source) — but do not encode
   identity assumptions either way.

4. **Empties in the sweep.** `colourStateAt` returns `EMPTY_COLOUR_STATE` for `occupant === 0` and
   for an out-of-range ref (warn-once, per-LUT `WeakMap`). A cell that died must show up as a repaint
   with `colourState === EMPTY_COLOUR_STATE` so `paintDirtyCells` lays background over it — the same
   silent-failure trap 2.3 named for erase, now hit 20×/s by every death.

5. **Age 7 → 8 is not a change.** `fillGroupOf` saturates at shade 7; the baseline compare must be on
   colour state, never on raw `age`. A "clever" `age[i] !== lastAge[i]` sweep would repaint every
   surviving cell every frame — visually identical, ~10× the raster — and pass any test that only
   looks at colours.

6. **Non-aging is shade 7, not shade 0.** `ageShadeFor(age, false) === 7`. Conway's Classic is
   non-aging; a playback that renders it washed-out has the LUT wrong, not the ramp.

7. **The LUT and the interning map share an array, not a function.** Build the LUT from
   `battle.organismIds` in the order the session was interned. AC7's negative twin (reversed list)
   is the test that fails when someone builds the LUT from a `Map`'s iteration order or a sorted
   roster.

8. **jsdom has no canvas.** Every assertion is on `RecordingContext2D`'s call log and `fillStyleWrites`;
   nothing here may claim a paint number. `vitest run` never executes `*.bench.ts`; the
   vacuous-result guard in `check-bench-budget.mjs` is what makes a bench that stopped running red.

9. **Bench file is inside the `@gol/test-utils` exemption; a new `*.test.ts` is too. A new non-test
   file in `lib/canvas` is not** — `playbackRenderer.ts` may import `type { StepRenderer }` from
   `@gol/simulation` (allowed) and nothing from `@gol/test-utils`.

10. **`NO_SCHEDULING_SOURCES` is hand-maintained** (2.3 Trap 8). Add `playbackRenderer.ts`.

11. **`spec:check` reads `.ts`/`.tsx` only.** IDs cited in `check-bench-budget.mjs` and the docs are
    on you to spell right; IDs in code are checked and `AR23` / `Decision-B` are silently exempt.

12. **`/battle` bundle headroom is ~4.7 KB gzip.** `drawDiff` + the sweep + the adapter should cost
    well under 1 KB. If `bundle:check` reds, report the number; the budget is a ratchet, not a dial.

### Spec-conflict flags (project-context: surface new conflicts, don't silently pick one)

- **`component-tree-battle-page.md` §5 — "frozen contract … Epic 3 wraps it with the loop, adding
  nothing to it" vs. this story's seventh method.** The contract's `draw(grid)` is "pure repaint of
  dirty regions" and presumes a dirty set; RFC-002 §5 presumes the same ("repaint only after a step
  (dirty regions)"); RFC-002 §6's Worker sketch has the *engine* emit `changedCells` — the one place
  the spec says who produces the set, and the shipped engine does not (3.6 FD1 returns a grid).
  Story 3.8 recorded the gap and left the call here. Resolution: FD1 (a), one method, the loop
  still calls one `draw` on a port and the contract's *substance* (no scheduling, no sim state, no
  aging logic) is untouched. **Candidate one-line amendment recorded in `deferred-work.md`; the
  planning artifact is not edited** (M14/M15 and 3.8's RFC-002 §5 precedent — Sidiar's call).
- **Gate mechanism change (FD3 (a)).** `scripts/check-bench-budget.mjs`'s gated pair moves from
  `repaint-decision` to `repaint-diff-path`. Budget, fixture and derivation unchanged; the function
  named as "the repaint decision" changes. Flagged so the PR shows it as a decision, not drift.
- **Decision B.3 / RFC-007 "precomputed once per battle into a small LUT"** vs. Story 1.7 FD3's
  module-level 160-entry table. Already resolved in 1.7 (the full table is strictly less work than
  any per-battle subset); restated here because AC7's "built at simulation start" is about the
  `OrganismRef → fill-group` LUT (per battle, `buildRefToFillGroup`), not the colour table. Two LUTs,
  two lifetimes; do not conflate them when writing comments.
- **FR-5.7 "30 % saturation" vs. the shipped relative ramp (30 % → 100 % of the token's *own* S).**
  1.7's Sidiar-approved deviation; AC6 asserts `displayColorAt(t, k)` strings, not absolute HSL
  numbers, so this story neither depends on nor re-opens it.
- **RFC-002 §2 `DirtyRegionTracker` with merged rectangles** vs. flat indices — resolved in 2.3
  (a merged rect spans colour states and cannot go through the batching). The sweep returns flat
  indices for the same reason.
- **`architecture.md` Runtime Architecture step 3 (line ~127) still says "batching cells by
  `(organism, ageShade)`", and the system-overview diagram (line ~44) says "batch by org×shade"** —
  both are the pre-revision wording Decision B.2 (2026-07-09) replaced with `(colorToken,
  min(age, 7))`. B.2 is the authority and the code follows it. Not this story's to edit; record
  the two line references in `deferred-work.md` as a doc-consistency candidate for Sidiar.

### What NOT to build

- ❌ No `useSimulation`, no refs, no `attachRenderer`, no `cycle`/`population` (Story 3.10, M2).
- ❌ No `'playback'` variant on `<PetriDishCanvas>`, no `onRendererReady`, no `desynchronized: true`
  opt-in (Story 3.11 — `GridRendererOptions.desynchronized` already exists for it to set).
- ❌ No engine change: no change list from `threePhaseStep`, no touching `conflictPhase`'s age
  write, nothing in `packages/simulation` at all (FD1 (e)). The goldens stay untouched.
- ❌ No `markDirty` from anything on the playback path; no `drawFull` per step.
- ❌ No change to `draw`'s semantics or any Story 2.3 test (FD1 (b)).
- ❌ No overlay re-composite for line restoration (FD2 (b) — alpha accumulates).
- ❌ No cell-pulse animation, no `cellAnimation` prop (FR-8.8, Story 6.7; AR-38 keeps it off the
  step path anyway).
- ❌ No pixel/snapshot test, no `canvas` npm package, no Playwright in this story (RFC-008 D6).
- ❌ No edit to `component-tree-battle-page.md`, `architecture.md` or any RFC; candidates go to
  `deferred-work.md`.
- ❌ No budget change in `check-bench-budget.mjs` (the number is `1000/60`, derived), no fixture
  change in `@gol/test-utils` (the roster is pinned by `benchmarkRoster.test.ts`).
- ❌ No `@gol/test-utils` additions — the engine harness Task 4 needs already exists
  (`gridFromPattern`, `createSeededRng`, `FIXED_SEED`, canonical organisms).

### Testing standards summary

- Vitest 4 in `apps/web` (jsdom environment; `getContext('2d')` returns `null` — always install
  `RecordingContext2D` via `installRecordingContext2d` / `installRecordingContexts` from
  `@/test-support/recordingContext2d`, and reuse `gridRenderer.test.ts`'s local `primedRenderer`
  / `makeGrid` / `DIRTY_TABLE` helpers rather than re-rolling them). No coverage gate.
- Assert on **call logs and `fillStyleWrites`**, in order — the house style since 1.8. "One
  `fillStyle`/`beginPath`/`fill` per group" is a count assertion; the ramp is a string-sequence
  assertion against `displayColorAt`.
- Engine-driven tests go through `stepGridBuffers` + `activeStrategy` with `createSeededRng(FIXED_SEED)`
  — deterministic by construction (RFC-008 D4). Never assert on unseeded behaviour; the fixtures here
  (block, blinker) have no ties anyway.
- Warn-once registries are module singletons: `resetColourStateWarnings()` and
  `resetRefToFillGroupWarnings()` in `afterEach` of any file that can hit an out-of-range ref.
- Benchmarks: `npm run bench` (never Turbo-cached) then `npm run bench:check`; the JSON report, not
  stdout, is the gate's input. Quote the table.
- Verification before "done": `npm run ci > /tmp/ci-3-9.log 2>&1; echo $?`. Report the real exit
  code, the `bench:check` table, `bundle:check` headroom, and the e2e count.

### Previous story intelligence (3.7, 3.8) and recent git

- **3.8 FD2 (a)** made the loop take `step: () => Grid` and put the buffers in 3.10's ref with
  `stepGridBuffers` as the composition — so this story's engine-driven tests use exactly that
  function, and the adapter's `draw` receives the *front* buffer after the swap. 3.8's review then
  found a `stepGridBuffers` destination-identity guard was needed (an allocating strategy would
  promote a stale buffer) — the same silent-freeze class this story is about; its Trap 1 in
  `simulationLoop.ts` is where 3.10 will read about the port, and Task 3's adapter is the answer it
  points to.
- **3.8's review culture** (Opus over a Sonnet implementation, 14 patches): every forward reference
  in a comment was checked for truth (stale WHO comments, dangling "see below"s), the fake harness
  had to be structurally faithful (a single-slot fake hid a doubled chain), and a property that
  could not fail was rewritten until it could. Apply the same to Task 4: the ramp test must fail if
  `ageShadeFor` returned `round` instead of `floor`, or if non-aging keyed at 0.
- **3.7** measured everything this story cites (`~0.07`, `~0.08`, `~0.7`, `~0.15` ms) on the pinned
  30 % fill after its review replaced an engine-stepped fixture that had collapsed into a
  7-organism still-life; the lesson — bench fixtures are **pinned parameters**, not engine dynamics —
  is why FD4 does not step the grid to get a "realistic" change fraction. 3.7 also established that
  `apps/web` bench files are exempt from the `@gol/test-utils` import ban and that `spec:check` skips
  `.mjs`.
- **3.7 FD7** took the frame from 18.7 ms to ~6.7 ms locally (12.0 ms on the runner, 27.7 %
  headroom). The runner margin is the one that gates; a repaint task that costs 0.2 ms moves it by
  ~1 %.
- **Git**: stories run on `story/*` branches merged by PR (#24 3.7, #26 3.8, #27 4.1), with a review
  commit (`fix: review …`) after the feature commit and `docs:` follow-ups. Lane 4 is open in a
  separate worktree (`4-1` merged 2026-09-14); do not let its `sprint-status.yaml` flips ride into
  this story's commit (3.8's review had to revert exactly that).

### External dependencies / versions

None new. TypeScript 5.9.3 strict, Vitest 4 (v8 coverage; `bench --outputJson`), fast-check as
installed (optional here — a property over "for any two grids, `selectChangedCells` reports exactly
the indices whose `colourStateAt` differs" is cheap and honest; add it if it stays under 20 lines).
Canvas2D facts this story relies on: `fillStyle` set to an unparseable string is a silent no-op
(hence `displayColorAt` strings, never tokens); semi-transparent fills composite additively (FD2
(b)); `beginPath` per group is mandatory (paths accumulate).

## Project Structure Notes

- New: `apps/web/lib/canvas/playbackRenderer.ts` (+ `.test.ts`), optionally
  `apps/web/lib/canvas/playbackRendering.test.ts` (engine-driven AC5–AC7 tests).
- Modified: `apps/web/lib/canvas/gridRenderer.ts` (`drawDiff`, comment corrections),
  `gridRenderer.test.ts` (new describe, `NO_SCHEDULING_SOURCES`), `dirtyCells.ts` +
  `dirtyCells.test.ts` (`selectChangedCells`), `repaintDecision.bench.ts` (new task, rewording),
  `scripts/check-bench-budget.mjs` (`required`, `GATED_TASKS`, derivation comment),
  `docs/implementation-artifacts/performance-baseline-validation.md`, `deferred-work.md`,
  `sprint-status.yaml`.
- Not touched: `packages/**`, `apps/web/components/**`, `apps/web/lib/palette/**`,
  `colourStateGroups.ts`, `refToFillGroup.ts`, `tsconfig.*`, `eslint.config.mjs`, any planning
  artifact.
- Naming: `drawDiff` beside `draw`/`drawFull`/`renderStatic`; `selectChangedCells` beside
  `selectDirtyCells`; `toStepRenderer` mirrors `toRenderableGrid`/`toThumbnailSource`.

## References

- `docs/planning-artifacts/epics.md#Story 3.9: Colour-State Batch Rendering` — the five clauses.
- `docs/planning-artifacts/architecture.md#Decision B` — B.1 (age is engine state; renderer reads
  it), B.2 (batch key, 160 bound, per-battle LUT at simulation start), B.3 (ramp), B.4 (dirty on
  occupant OR age-shade change, bounded to the first 7 cycles); Decision D.3 (repaint only after a
  step); AR-22, AR-23, AR-42, AR-43; M2, M12.
- `docs/planning-artifacts/rfcs/RFC-002-grid-rendering-technology.md` — Background (≤161 colour
  states), §"1." direct painting / dirty regions, §"3." batch by colour state (the `groupByColourState`
  sketch and the "dirty on occupant OR age-shade change" note), §5 loop (`render` after a step), §6
  Worker sketch (`changedCells` — the only place a change-list producer is named).
- `docs/planning-artifacts/rfcs/RFC-007-organism-colour-palette.md` — the display LUT and the
  age-cap identity `displayColor(token, 7) === entry.hex`.
- `docs/planning-artifacts/prds/prd-GameOfLife-2026-05-26/prd.md` FR-5.7 (30 % at age 0, +10 %/cycle,
  100 % at 7); FR-2.4 (aging toggle is render-only); NFR-1.1.
- `docs/planning-artifacts/component-tree-battle-page.md` §3.10 (`playback` variant,
  `onRendererReady`), §3.11, §4 `useSimulation`, §5 frozen contract + `SimulationLoop` +
  "Palette LUT … built at simulation/editor start", §6 matrix.
- `apps/web/lib/canvas/gridRenderer.ts` — `draw`/`paintDirtyCells`/`resetDirtyState`/`lastColourState`
  and the three comments Task 2 corrects.
- `apps/web/lib/canvas/dirtyCells.ts`, `colourStateGroups.ts`, `refToFillGroup.ts`,
  `apps/web/lib/palette/displayColor.ts` — the existing brain.
- `apps/web/lib/canvas/repaintDecision.bench.ts`, `scripts/check-bench-budget.mjs`,
  `docs/implementation-artifacts/performance-baseline-validation.md` — the gate and its numbers
  (`repaint-decision` 0.071–0.072 ms; `repaint-dirty-path` 0.70–0.75 ms upper bound;
  `colour-state-reprime` 0.076–0.083 ms; `ref-to-fill-group-build` 0.003 ms; runner frame 12.046 ms,
  27.7 % headroom).
- `packages/simulation/src/loop/simulationLoop.ts` (`StepRenderer`, Trap 1),
  `packages/simulation/src/loop/stepGridBuffers.ts` (+ test, for the deps shape),
  `packages/simulation/src/strategy/conflictPhase.ts` (age write: born → 0, survivor → `min(age+1,
  max)`, unconditional of `agingEnabled`), `packages/simulation/src/grid/grid.ts` (M14 ref encoding).
- `docs/implementation-artifacts/3-8-simulationloop.md` (Trap 1, FD2, What NOT to build),
  `3-7-performance-harness-coverage-gate-flip.md` (FD2 "not rasterization", FD5 fixture, Traps),
  `epic-2/2-3-renderer-dirty-region-editing-paths.md` (FD1–FD5, the hybrid, the no-op tests),
  `epic-1/1-8-gridrenderer-static-core.md` (contract, `beginPath` per group),
  `epic-1/1-7-palette-token-registry-display-color-lut.md` (relative ramp, `ageShadeFor` floors).
- `docs/implementation-artifacts/deferred-work.md` — "Story 3.9 owns the repaint adapter" (3.8
  section), four-bar restoration (2.3 section), `stepGridBuffers` reuse note.
- `docs/project-context.md` — never batch by organism; hot state in refs; `fillStyle` `var()` trap;
  never pixel-test the canvas; bench never cached; `spec:check` spelling; commit gate.

## Dev Agent Record

### Agent Model Used

Claude Opus 5 (orchestration/implementation), story targeted "Dev Model: sonnet" per the line
below — implemented under Opus per the session's actual model; noted as a deviation rather than
silently matched.

### Debug Log References

- `npx vitest run apps/web/lib/canvas/dirtyCells.test.ts apps/web/lib/canvas/gridRenderer.test.ts apps/web/lib/canvas/playbackRenderer.test.ts apps/web/lib/canvas/playbackRendering.test.ts --root apps/web`
  — 99 tests, all passing (27 `dirtyCells.test.ts` + 66 `gridRenderer.test.ts` + 2
  `playbackRenderer.test.ts` + 4 `playbackRendering.test.ts`, the last two new files this story
  adds; see File List).
- `npm run bench` (never cached) then `npm run bench:check` — standalone: `repaint-diff-path 100x60
  x20` **0.159 ms**; frame (`step` 6.447 + `repaint-diff-path` 0.159) = **6.606 ms** against 16.667
  ms, **10.061 ms headroom (60.4%)**. In the full `npm run ci` position (heavier machine load):
  `step` 9.408 + `repaint-diff-path` 0.187 = **9.595 ms**, **7.072 ms headroom (42.4%)** — still
  comfortably green; see `docs/implementation-artifacts/performance-baseline-validation.md`'s new
  "Story 3.9" subsection for both tables.
- `npm run ci > /tmp/ci-3-9.log 2>&1; echo $?` — **first run: exit 1**, on `format:check` alone
  (two new/modified test files needed a Prettier pass; every other stage — typecheck, lint,
  spec:check, boundary:check, coverage, build, bundle:check, bench, bench:check — was already
  green in that same run). Fixed with `npx prettier --write` on the two files, reformatted only
  layout stayed identical. **Second run: exit 0**, full gate — typecheck → lint (0 errors, 1
  pre-existing unrelated warning in `BattleGallery.tsx`, untouched by this story) → format:check →
  spec:check (214/214 cited ids resolve) → boundary:check (7 escape shapes rejected, 2 legitimate
  accepted) → test:coverage (all 5 workspaces green: `@gol/domain` 99, `@gol/persistence` 82,
  `@gol/test-utils` 89, `@gol/simulation` 393, `web` 986 — 1649 tests total) → build:standalone →
  bundle:check (all four routes within budget; `/battle` 4.1 KB gzip headroom, down from ~4.7 KB
  before this story — under 1 KB consumed, as Trap 12 predicted, and still green) → bench →
  bench:check (green, see above) → e2e (364 passed, 4 skipped, unrelated to this story).

### Completion Notes List

- **Scope held to `apps/web/lib/canvas/**`, one script, and docs** — no `packages/**` touched, no
  `useSimulation`/refs/`attachRenderer`, no `'playback'` `<PetriDishCanvas>` variant, matching
  "What NOT to build".
- **Task 1** — `selectChangedCells` added beside `selectDirtyCells` in `dirtyCells.ts`: a flat
  `0..width*height` sweep, no `Set`, no `CellCoord`, ascending order for free. Guards buffer
  lengths the way `groupByColourState` does, naming both counts.
- **Task 2** — `GridRenderer.drawDiff` added, mirroring `draw`'s shape with `selectChangedCells` in
  place of the marks-filtered `selectDirtyCells`; reuses `paintDirtyCells` verbatim (FD1 (a), FD2
  (a)). Chose NOT to factor a shared private tail with `draw()`: `this.lastColourState`'s narrowing
  after the null-check does not survive being threaded through a second private method without
  either a non-null assertion (forbidden, project-context "no escape hatches") or an awkward extra
  parameter: two short, easily-diffed method bodies read better than that tradeoff. `draw()` itself
  is untouched except its one stale comment (Decision D.3 idle-frame property, reworded for the
  loop that now exists). The class doc comment, `resetDirtyState`'s comment, and
  `restoreGridLinesOver`'s comment are all reworded per the task list.
- **Task 3** — `playbackRenderer.ts`'s `toStepRenderer` is a one-line forward, `Pick<GridRenderer,
  'drawDiff'>`-typed so the test can hand it a bare object. Added to `NO_SCHEDULING_SOURCES`.
- **Task 4** — `playbackRendering.test.ts` (separate file, not a `gridRenderer.test.ts` describe —
  the file's own "your call, say which": three ACs' worth of engine-driven fixtures reads better
  standalone than folded into an already-~950-line renderer-unit-test file). Four tests, all
  walking `stepGridBuffers` + `activeStrategy` with `createSeededRng(FIXED_SEED)`: AC6 (a block
  under `agingEnabled: true`, asserting the exact seven `displayColorAt` strings on cycles 1-7 and
  silence on 8-10); AC5 first half (Conway's Classic, unmodified, zero repaints across 10 cycles);
  AC5 second half (two organisms sharing `sky-blue`, one aging one not, each its own block —
  aging block's four cells repaint cycles 1-7, non-aging block's never, checked by converting
  `ctx.calls`' `rect` args back to flat indices); AC7 (two blinkers on different tokens, one real
  step, the newborn cell's `colourStateAt` checked against the correct organism's token, then the
  same check against a LUT built from the REVERSED id list showing the tokens swap — the negative
  twin the story's header comment predicts).
- **Task 5** — `repaint-diff-path 100x60 x20` bench added (zero-filled baseline, `repaint-dirty-
  path`'s convention, FD4 (a)); `repaint-decision`/`repaint-dirty-path`/`allCells` doc comments
  reworded per the task list. `check-bench-budget.mjs`'s `GATED_TASKS` moved to `['step 100x60
  x20', 'repaint-diff-path 100x60 x20']`, `repaint-diff-path 100x60 x20` added to `apps/web`'s
  `required`, and the derivation comment (item 3) updated. `performance-baseline-validation.md`
  gained a new "Story 3.9" subsection (gate-mechanism change + re-run frame arithmetic) and a new
  row in the repaint-decision table; budget and fixture untouched.
- **Task 6** — `deferred-work.md`'s three named 3.9 items closed/reassigned: the live-frame number
  (closed — `repaint-diff-path` vs. `repaint-dirty-path`, 0.159 vs. 0.575 ms this run, and the
  O(cells)-regardless-of-change-fraction observation the task asked for); the four-bar restoration
  entry (reassigned to a Playwright measurement, with the 6-vs-1-context-call crossover stated);
  the `StepRenderer` adapter recorded as a new bullet for Story 3.10. A new "Deferred from: Story
  3-9" section also records the `component-tree-battle-page.md` §5 candidate amendment and the
  `architecture.md` Runtime Architecture / system-overview stale-wording flag (neither doc edited —
  Sidiar's call, M14/M15 precedent). `component-tree-battle-page.md` itself was NOT edited.

### Forced Decisions

- **FD1 — (a), the recommended option.** `drawDiff(grid)`: whole-grid compare against
  `lastColourState`, then `paintDirtyCells`. Implemented exactly as specified; (b)/(c)/(d)/(e) not
  taken, matching the story's own rejections.
- **FD2 — (a), the recommended option.** `paintDirtyCells` reused verbatim for `drawDiff`'s paint
  half; no widening of `Canvas2D` or `RecordingContext2D`.
- **FD3 — (a), the recommended option.** Gate moved to `step + repaint-diff-path`. Measured delta
  vs. the pre-3.9 frame: −0.154 ms (well under the story's "< 0.2 ms" prediction), and headroom
  stayed in the 42-60% range depending on machine load — nowhere near the budget. **Flagged for
  Sidiar at PR time per the story's own instruction** — this is a gate-MECHANISM change (which
  function counts as "the repaint"), not a threshold relaxation; the budget (`1000/60`) and the
  fixture (`createBenchmarkRoster(20)`) are both untouched.
- **FD4 — (a), the recommended option.** Zero-filled baseline, matching `repaint-dirty-path`'s
  convention — the two benches remain a like-for-like comparison of the shipped mechanism against
  the rejected `markDirty`-everything adapter. Option (b) (an `EMPTY`-filled third, tracked bench)
  was NOT added — not asked for beyond "if you want it," and the zero-filled number alone answers
  AC8/FD3.

### Spec-conflict flags raised

Both already anticipated by the story itself; recorded here as confirmed, not new:

- **`component-tree-battle-page.md` §5's "Epic 3 wraps it with the loop, adding nothing to it"** —
  now stale: `GridRenderer` has a seventh method, `drawDiff`. Not edited (planning artifact,
  Sidiar's call per M14/M15); candidate one-line amendment recorded in `deferred-work.md` under a
  new "Deferred from: Story 3-9" section, exactly as the story's Dev Notes specify.
- **Gate-mechanism change (FD3 (a))** — `scripts/check-bench-budget.mjs`'s `GATED_TASKS` moved from
  `repaint-decision` to `repaint-diff-path`. Flagged above and in the Forced Decisions entry for
  visibility at PR time, per the story's instruction not to slip a gate-mechanism change in quietly.
- **New, not previously flagged**: `architecture.md`'s Runtime Architecture step 3 (`:127`) and the
  system-overview diagram (`:44`) still read "batching cells by `(organism, ageShade)`" — stale
  pre-B.2 wording this story's `drawDiff` doc comments are a second, independent reader of. Not
  edited (same M14/M15 precedent); recorded in `deferred-work.md`.

### File List

**New**
- `apps/web/lib/canvas/playbackRenderer.ts`
- `apps/web/lib/canvas/playbackRenderer.test.ts`
- `apps/web/lib/canvas/playbackRendering.test.ts`

**Modified**
- `apps/web/lib/canvas/dirtyCells.ts` (`selectChangedCells`, head-comment addition)
- `apps/web/lib/canvas/dirtyCells.test.ts` (`selectChangedCells` describe block)
- `apps/web/lib/canvas/gridRenderer.ts` (`drawDiff`, class doc comment, three stale-comment
  rewordings)
- `apps/web/lib/canvas/gridRenderer.test.ts` (`drawDiff` added to the two AC3 structural tests and
  to `NO_SCHEDULING_SOURCES`; new `drawDiff — the playback repaint (Story 3.9)` describe block)
- `apps/web/lib/canvas/repaintDecision.bench.ts` (`repaint-diff-path` task; `allCells`,
  `repaint-decision`, `repaint-dirty-path` doc rewordings)
- `scripts/check-bench-budget.mjs` (`required`, `GATED_TASKS`, derivation comment)
- `docs/implementation-artifacts/performance-baseline-validation.md` (new Story 3.9 subsection; new
  `repaint-diff-path` row in the repaint-decision table)
- `docs/implementation-artifacts/deferred-work.md` (three 3.9 items closed/reassigned; new
  "Deferred from: Story 3-9" section)
- `docs/implementation-artifacts/3-9-colour-state-batch-rendering.md` (this file — frontmatter,
  task checkboxes, Dev Agent Record, Status)
- `docs/implementation-artifacts/sprint-status.yaml` (`3-9-colour-state-batch-rendering:
  ready-for-dev` → `review`)

### Change Log

- 2026-09-14 — Story 3.9 implemented: `GridRenderer.drawDiff`, `selectChangedCells`, the
  `toStepRenderer` playback adapter, engine-driven AC5/AC6/AC7 tests, the `repaint-diff-path` bench
  and gate-mechanism move (FD3), and the bookkeeping this story's own AC9 names. `npm run ci` green
  (see Debug Log References). Status → review.

Dev Model: sonnet   # follows patterns this file already settles rather than setting one: `drawDiff` is `draw`'s body with `selectChangedCells` in place of the marks (2.3's shape), the adapter is three lines over 3.8's port, the tests are 2.3's call-log style walked through 3.8's `stepGridBuffers`, and the one gate change is spelled out to the task name — every open call (FD1 method-vs-identity, FD2 reuse, FD3 gated pair, FD4 baseline) carries a recommendation and a named test; the 3.8 precedent, not the 3.7 one
Proposed lane gate: none
