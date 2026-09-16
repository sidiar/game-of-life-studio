---
baseline_commit: ec350f825fe2bb2f6b2596317089bcb49220df44
---

# Story 3.15: Extinction Auto-Pause

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a user,
I want the simulation to pause itself when all life is gone,
so that I never watch an empty dish spin.

## Acceptance Criteria

From `epics.md#Story 3.15` (`:925-935`), decomposed into what a reviewer can check independently.
Everything this story needs already exists, and the seam is literally marked: the hook's step thunk
(`apps/web/lib/battle/useSimulation.ts:262-272`) carries a four-line comment saying "Story 3.15's
extinction check goes HERE — after the step, before the publish"; the loop honours a `stop()` called
from inside `step()` and still repaints that step's grid (Story 3.8 AC7,
`simulationLoop.ts:181-190`, tested at `simulationLoop.test.ts:290-328`); `<PopulationStats>`
already renders every-row-extinct with skulls (3.14); the control bar already reads `status` and
flips its own label. What does **not** exist is (1) a grid-emptiness predicate, (2) the thunk's
"stop the loop and let `status` follow" path, (3) the property test AR-41 names, and (4) the
error-stop recovery the 3.10 review deferred to this story because it is the same path. This story
adds **no new component, no new prop, no new status value, no engine change** (the strategy stays a
pure reducer — `threePhaseStep.ts:91-93`).

1. **A running simulation auto-PAUSES on the first cycle that leaves zero living cells (FR-4.7,
   Decision B.5).** Inside the thunk, after `stepGridBuffers` and `cycle += 1`, when the loop is
   driving (`session.loop.isRunning()`) and the new `front` has no living cell, the hook calls
   `session.loop.stop()` and publishes `{ status: 'paused', cycle, population }` in ONE `setView`
   (FD1). The loop's own frame then still paints that final, empty grid (Story 3.8 AC7 — the repaint
   for the stopping step happens) and requests no further frame. Observable from the view: `data-
   status="paused"`, `data-cycle` = the extinction cycle, the counter shows it, every population row
   carries the skull, the Play/Pause button reads "Play", Next cycle is enabled. Hook tests: a lone
   Conway cell at 10 gen/sec → after `frame(0)` + `frame(100)`: `status === 'paused'`, `cycle === 1`,
   `population[0].extinct === true`, the fake scheduler has 0 pending frames, `drawDiff` was called
   exactly once with an all-zero occupant snapshot (the final grid IS painted).

2. **It is a pause, not a Stop (FR-4.7's own AC; FR-4.1 vs FR-4.4).** Nothing is reset: `cycle` keeps
   its value, the live buffers keep the empty grid, `liveSize` is unchanged, `initialGrid` is
   untouched, **no `drawFull`** is issued (a Stop's signature — 3.10 AC4), the seed is not re-minted.
   `play()` afterwards resumes from the extinct grid and the loop runs again (`isRunning() === true`,
   a frame is pending); on a grid that stays empty the next stepped frame auto-pauses again at
   `cycle + 1`. `step()` afterwards advances exactly one cycle, paused, publishing as every manual
   step does. `stop()` afterwards behaves exactly as today (cycle 0, re-clone, `drawFull`, fresh
   seed). Hook tests for all four.

3. **The check is plain emptiness, per cycle, on the grid the step produced — nothing else
   (Decision B.5).** `isGridEmpty(grid)` is a new pure predicate in `packages/simulation/src/grid/grid.ts`
   (FD2): `true` iff every `occupant[i]` for `i < width * height` is `0`; early-return on the first
   living cell; `width * height`, not `occupant.length` (the `gridStats.ts:54-59` / `clearGrid`
   precedent); no `age` read, no previous-grid comparison, no `gridEquals`, no per-organism tally.
   Exported from `@gol/simulation`'s barrel beside `clearGrid`/`cloneGrid`. The thunk calls it every
   cycle — NOT only at publish cadence and NOT via `derivePopulation` (the seam comment's reason: an
   empty grid can be re-seeded by a `neighborCount = 0` born rule, so a check that runs one publish
   late is a wrong auto-pause; and `derivePopulation` is the M2 sweep that must stay at ≤ 10 Hz).
   Manual `step()` (loop not running) takes no stop path and adds no publish — one population sweep
   per click, as today (`vi.mock('./population', { spy: true })` count test).

4. **Still-lifes, oscillators and gliders NEVER auto-pause (Decision B.5, FR-4.7, project-context's
   "the intuitive test is wrong").** Hook tests: a block (still-life), the blinker (period 2) and a
   glider, each played 20+ cycles at 10 gen/sec under Conway's Classic, keep `status === 'playing'`,
   `isRunning() === true`, one pending frame, and `cycle === N` — with the block's centre age having
   climbed (the grid that "did nothing" was still evolving, `Grid.age`). ❌ A test asserting that a
   static grid pauses is a spec violation dressed as a test; do not write one.

5. **The extinction-only property is property-based (AR-41, RFC-008 §"Property-based tests").**
   `packages/simulation`, with `fast-check` (already a dependency there — `grid.test.ts:281-330` is the
   idiom): (a) `isGridEmpty(createGrid(w, h))` for all `w, h ∈ [0, 12]`; (b) for an arbitrary dense
   grid, `isGridEmpty(gridFromDense(d)) === d.flat().every(v => v === 0)`; (c) for an arbitrary
   grid with ≥ 1 non-zero cell (any ref 1..255, any position), `isGridEmpty` is `false` — including a
   single cell at index `width * height - 1` (the early-return must scan to the LAST cell); (d)
   **the engine-level property**: for `n` drawn from `[0, 40]` and a golden drawn from {block,
   beehive, blinker, glider on a 12×12} under Conway's Classic, the grid after `n` cycles is NOT
   empty; and for the lone cell, it IS empty for every `n ≥ 1`. (d) lives beside the goldens
   (`conwayGoldens.test.ts`'s `run` helper, `:36-51`) or in a new `extinctionOnly.test.ts` in
   `strategy/` — the dev's call; it must import `isGridEmpty` from `../grid/grid`, not re-implement
   the scan. `packages/simulation` stays at 100 % per file (the coverage gate is per file, ≥ 90 %).

6. **A loop that stops itself on a throw also lets `status` follow — the 3.10 review's deferred item
   (`deferred-work.md:837-853`), built here as the same path (FD3).** The two loop-facing closures
   the session hands to `createSimulationLoop` — `step: () => session.step()` and the forwarding
   renderer's `draw` — are wrapped so a throw first publishes the keyed paused view
   (`{ status: 'paused', cycle: session.cycle, population }` of the last good `front`) and then
   rethrows, unchanged, so the loop still clears its handle and the error still reaches the caller
   (`simulationLoop.ts:167-177`, the wedged-loop rule). Hook test: a renderer whose `drawDiff` throws
   once → `act(() => frame(100))` throws that error, `status === 'paused'`, `isRunning() === false`,
   and a subsequent `play()` starts a fresh chain (`pending() === 1`). Manual `step()` is NOT wrapped
   (it throws synchronously to the click handler with `status` already `'paused'`). If the dev
   takes FD3 (b) instead, the deferred entry is re-pointed with the reason, not silently left.

7. **`status` stays `'paused' | 'playing'` — no `'extinct'`, no reason field, no indicator, no
   announcement (FD4).** Spec §4's union is what `<SimulationControlBar>` (3.12), the fullscreen HUD
   (3.18) and the editor preview (4.15, gated on this story) consume; the extinction is already
   readable from `population` (every entry `extinct`) and from the frozen counter. The Clinical Lab
   mockup has no auto-pause chrome; the biotech proposal's "Auto-Pause Indicator" (`play-mode-
   proposal.md:240-262`) is a superseded, unreviewed proposal that also names STEADY_STATE, which
   B.5 removed. Recorded as a UX candidate in `deferred-work.md`, not built.

8. **The view and the route follow without a line of new UI logic (RFC-005 Decision 5, AR-29).**
   `<BattleSimulationView>` gains no state, hook, effect or prop: the existing `handlePlayPause`
   (`BattleSimulationView.tsx:183-187`) already flips on `status`, and its "known gap" comment
   (`:172-176`) plus the head comment's "Deliberately ABSENT … the extinction stop (3.15)" (`:36`) are
   rewritten to state what is now true. View test: Play on the `LONE_GRID` fixture
   (`BattleSimulationView.test.tsx:623-630`), `frame(0)`, `frame(100)` → `data-status="paused"`,
   `data-cycle="1"`, counter `0001`, the skull row, the button named `Play`, Next cycle enabled;
   `<Profiler>` counts exactly ONE commit for that frame (one `setView`, never a status commit plus a
   publish commit — trap 3). A second Play + frames → paused again at `0002`. axe-clean in the
   auto-paused state.

9. **The 3.14 e2e that plays an already-extinct dish is rewritten, not deleted, and a 3.15 block
   proves the route end to end (trap 1).** `battleRoute.spec.ts:2529-2575` (3.14 test (d)) clicks
   Play on an empty grid, polls the counter past `0001`, scans axe "while playing", then clicks
   `Pause` — under FR-4.7 the run auto-pauses at cycle 2 and the `Pause` button no longer exists, so
   the test would hang on a stale locator. Rewrite its tail: Play → `data-cycle` `2` → `data-status`
   `paused` → skull row still present → axe → no Pause click; rewrite the comment ("no auto-pause
   exists yet") to say the scan is now of the auto-paused state, which is the state FR-4.7 makes
   reachable. New `test.describe('Extinction auto-pause (Story 3.15)')`: (a) `/battle/new`, one cell
   painted (the 3.14 (d) recipe), Run, Play → the counter reaches `0001` and `data-status` is
   `paused` (assert cycle FIRST, then status — they land in one publish, and `paused` is also the
   pre-Play value), the button reads `Play`, Next cycle is enabled, `Total Living Cells` is `0`;
   Play again → `0002`, paused (resume, not reset); Stop & reset → `0000`, `1 (100%)`, no skull. (b)
   Three-Way Skirmish (`battleA`, which settles into still-lifes at 8 cells from cycle 9 — measured,
   see Dev Notes) at 20 gen/sec: `expect.poll` the counter past `0030` with `data-status` still
   `playing` — the route-level "a static grid keeps running" check — then Pause. Both assert a clean
   console (`collectErrors`). Run (a) and (b) on `chromium` AND `webkit` locally (the 3.14 trap-5
   precedent for list roles).

10. **Nothing per cycle reaches React; the budget and the bundle hold (NFR-1.1, M2, AR-35, AR-43).**
    The emptiness scan is an early-exit byte loop in the hook's thunk — outside `threePhaseStep`
    and outside the benchmark's `step()` (`threePhaseStep.bench.ts:68-71` measures the strategy
    alone), so `bench:check` is unaffected and the budget does not move; state it, do not
    "optimise" it. The existing cadence tests (`useSimulation.test.ts:227-299`, view AC7 at
    `BattleSimulationView.test.tsx:725-772`) stay green unchanged — the view fixture and both seeded
    battles never go extinct (measured: the view `GRID` stays ≥ 6 cells through cycle 30; `battleA`
    12 → 8 and holds; `battleB` 17 → 13 and holds). `bundle:check` passes with
    `check-bundle-size.mjs` unchanged; report `/battle`'s first-load gzip (expected 308.6 KB ± noise,
    1.4 KB headroom — the hook is in the lazy Run chunk and `isGridEmpty` in the shared engine chunk)
    and the Run chunk's new size (5.9 KB gzip after 3.14).

11. **Gates hold; comments are made true; bookkeeping is done.** `npm run ci`'s stages all pass
    except the two PRE-EXISTING local-WebKit/tablet failures of Story 3.12's "Tab reaches Play…"
    e2e (`deferred-work.md`, 3-13 sections — report them by name, do not fix them here, do not
    claim exit 0 if it is 1 for that reason alone; a `bench:check` red under measured machine
    contention is reported with `uptime`, as 3.14 did, never chased by editing code). `spec:check`
    resolves every ID cited here and in code. Comments rewritten (Task 5): `useSimulation.ts:98-101`
    ("Not here … No extinction check"), the thunk's seam comment (`:266-269`) becomes the check's
    WHY comment, `BattleSimulationView.tsx:36` and `:172-176`. `deferred-work.md`: the 3-10 review
    entry (error-stop) is closed or re-pointed (Task 6); a "Deferred from: Story 3-15" section
    records the candidates named in Dev Notes. `sprint-status.yaml` moves this story only.

## Tasks / Subtasks

- [x] **Task 1 — `isGridEmpty` in `@gol/simulation` (AC3, AC5)**
  - [x] (a) Add `export function isGridEmpty(grid: Grid): boolean` to
    `packages/simulation/src/grid/grid.ts`, after `clearGrid` (its constructor twin — the head comment
    should say `isGridEmpty(clearGrid(g)) === true` is the pair's contract). Loop `for (let i = 0;
    i < cells; i++) if (grid.occupant[i] !== 0) return false; return true;` with
    `const cells = grid.width * grid.height` and a WHY comment citing the `clearGrid` /
    `computeEditorGridStats` reason for not reading `occupant.length`. No `age` read (Decision B.5:
    emptiness, never age). No `some()`/`every()` over a typed array in the hot path — a plain
    indexed loop, the `gridStats.ts:61-67` shape.
  - [x] (b) Export it from `packages/simulation/src/index.ts` on the existing grid line (`:48`), and
    extend that block's comment with one clause: the predicate is the emptiness check Decision B.5
    names, consumed per cycle by the hook (Story 3.15) — the loop and the strategy still do not know
    about it.
  - [x] (c) `grid.test.ts`: the three fast-check properties of AC5 (a)–(c) plus example tests: a 0×0
    grid is empty; a 3×3 with one cell at index 8 is not; `isGridEmpty(clearGrid(g))` for a populated
    `g`; the predicate reads no `age` (a grid with `occupant` all zero and a non-zero `age` cell is
    empty — an age left standing under an empty cell must not read as life).
  - [x] (d) The engine-level property (AC5 (d)): `fc.integer({ min: 0, max: 40 })` × `fc.constantFrom`
    over the four goldens (block, beehive, blinker, glider — the glider on a 12×12 so it never reaches
    an edge within 40 cycles; `conwayGoldens.test.ts`'s own fixtures are the source, and its `run`
    helper is the composition), asserting `isGridEmpty(run(grid, deps, n)) === false`; and the lone
    cell `isGridEmpty(run(lone, deps, n)) === (n >= 1)`. Name it so the file reads as the
    "extinction-only auto-stop" property RFC-008 lists. Confirm it reddens under a mutation that
    returns `true` when `age` is non-zero, or that stops scanning early.
  - [x] (e) `cd packages/simulation && npx vitest run --coverage` — 100 % on `grid.ts`, per file.

- [x] **Task 2 — the thunk's auto-pause path (AC1, AC2, AC3)**
  - [x] (a) In `useSimulation.ts`, add a keyed "the loop stopped itself" publisher — recommended
    name `settleStopped` — passed into `createSession` through `SessionInputs` beside `publish`
    (FD1 (a)): it derives the population of `session.buffers.front` and does ONE
    `setView((prev) => sameKey(prev.key, session.key) ? { ...prev, status: 'paused', cycle:
    session.cycle, population } : prev)`. It is `useCallback([], …)` like `publish`. It does NOT
    call `loop.stop()` itself — the two callers differ on that (Task 2 (b) vs Task 3).
  - [x] (b) Replace the seam comment in the thunk with the check:
    ```ts
    session.buffers = stepGridBuffers(session.buffers, session.deps);
    session.cycle += 1;
    if (session.loop.isRunning() && isGridEmpty(session.buffers.front)) {
      session.loop.stop();
      inputs.settleStopped(session);
      return session.buffers.front;
    }
    if (isPublishCycle(session.cycle, genPerSecRef.current)) inputs.publish(session);
    return session.buffers.front;
    ```
    with the WHY comment carrying the four facts: per cycle not per publish (re-seeding), the loop's
    AC7 guarantee (the stopping step is still painted, no further frame), `isRunning()` as the
    "am I inside the loop" test (manual `step()` is already paused and publishes on its own —
    one sweep, never two), and the early return so the cadence publish never doubles the sweep.
    `session.loop` is referenced lazily inside the thunk, after the session literal has finished
    constructing (the same self-reference `simulationLoop.test.ts:84-96` records for its harness).
  - [x] (c) Make `pause()` (`:417-424`) use the same keyed setter — `session.loop.stop();
    settleStopped(session);` — so the hook has ONE "paused with the exact cycle" write, not two that
    can drift (the current `pause()` is unkeyed; keying it is strictly safer in the rebind window the
    `publish` comment at `:323-328` describes). Its existing tests (`:313-328`) must stay green
    unchanged.
  - [x] (d) Hook tests (`useSimulation.test.ts`, new `describe('useSimulation — extinction
    auto-pause (AC…, FR-4.7, Decision B.5)')`), using the file's `harness`/`mount`/`runCycles` and
    `createFakeRenderer` — every one deterministic under `CONWAYS_CLASSIC` (no ties, no RNG):
    - lone cell, 10 gen/sec: after `frame(0)`, `frame(100)`: `status 'paused'`, `cycle 1`,
      `population` one entry `extinct: true`, `scheduler.pending() === 0`, `drawDiff.length === 1`
      and `drawDiffSnapshots[0].every(v => v === 0)`, `drawFull.length === 1` (the mount prime only —
      no Stop-style repaint), `liveSize` unchanged, `initialGrid.occupant[4] === 1` still (AR-31).
    - the render count for that frame is exactly 1 (the file's AC3 idiom — count renders via the
      `renderHook` wrapper or `derivePopulation` calls: exactly one population sweep for the
      auto-pause frame, none for the cadence).
    - 20 gen/sec (`cyclesPerPublish === 2`): the lone cell dies at cycle 1, which is OFF the cadence
      — the auto-pause still publishes the exact cycle 1 (trap 2).
    - resume: `play()` → `isRunning() === true`, `pending() === 1`; `frame(200)` primes, `frame(300)`
      steps → paused again at `cycle 2`, one more `drawDiff` of an empty snapshot.
    - `step()` after auto-pause: advances to `cycle 2`, stays paused, one `derivePopulation` call,
      no throw (the loop is stopped, FD5's guard does not fire).
    - `stop()` after auto-pause: `cycle 0`, `drawFull` +1, the population shows the cell alive,
      `Math.random` spied once more (the seed re-mint — the existing `:348-373` shape).
    - manual `step()` onto an ALREADY empty grid: `derivePopulation` called exactly once, status
      unchanged.
    - **never on a static or moving grid (AC4):** block, blinker, glider (12×12) — `runCycles(h, 20,
      10)` each: `status 'playing'`, `pending() === 1`, `cycle === 20`; for the block additionally
      read the live grid's age via the last `drawDiff` grid (`age[centre] === 7`, the saturation
      `conwayGoldens.test.ts:156-167` pins) — the proof that "nothing changed" is false.
    - optional, recommended: the re-seeding case that justifies per-cycle checking — an organism
      whose only rule is `born` on `cellState eq 'empty'` ∧ `neighborCount eq 0` (both expressible:
      `NumericLiteral` is `min(0)`); play a lone cell of it: cycle 1 auto-pauses on the empty grid,
      `play()` again → the next step fills the grid → `status` stays `'playing'` and the population
      is `width * height`. If Phase 2 semantics make this fixture behave differently than expected,
      record what it does and drop the test rather than bend the assertion — the per-cycle rule
      stands on the seam comment either way.

- [x] **Task 3 — the error-stop follows the same path (AC6, FD3)**
  - [x] (a) In `createSession`, wrap the two loop-facing closures:
    `step: () => { try { return session.step(); } catch (error) { inputs.settleStopped(session);
    throw error; } }` and `draw: (grid) => { try { rendererRef.current?.drawDiff(grid); } catch
    (error) { inputs.settleStopped(session); throw error; } }`. A WHY comment on each: the loop
    clears its handle and rethrows (`simulationLoop.ts` wedged-loop rule) but cannot tell React;
    without this `status` reads `'playing'` over a dead loop, Play "does nothing" and Next cycle
    stays disabled (the 3-10 review finding). The catch never swallows — the error still surfaces
    in the RAF callback exactly as before.
  - [x] (b) Hook tests: a `PlaybackRenderer` whose `drawDiff` throws on its first call → `expect(()
    => act(() => frame(100))).toThrow(boom)`; then `status === 'paused'`, `cycle === 1` (the step
    completed before the paint threw), `pending() === 0`; `play()` → `pending() === 1`, and the run
    continues. A second test with `stepGridBuffers` throwing is not reachable from a valid session
    (M12 compiles the roster up front) — instead inject a throwing `scheduler`-driven step by making
    the SAME renderer throw on `drawDiff` only; do not mock `@gol/simulation` for this.
  - [x] (c) `deferred-work.md:837-853` (3-10 review, "A throw inside the RAF step…"): strike through
    with "**✅ Closed by Story 3.15**" and one line on the mechanism; if FD3 (b) is taken, re-point
    with the reason instead.

- [x] **Task 4 — view and route (AC8, AC9)**
  - [x] (a) `BattleSimulationView.tsx`: no code change expected. Rewrite the head comment's
    "Deliberately ABSENT … the extinction stop (3.15 — the hook's)" to say the auto-pause is the
    hook's and the view observes it through `status` alone; rewrite the "Known gap" paragraph
    (`:172-176`) to say the gap is closed (Story 3.15 — the thunk publishes `'paused'` on both the
    extinction stop and a mid-frame throw) and that `handlePlayPause` therefore needs no guard.
  - [x] (b) `BattleSimulationView.test.tsx`, new tests in the 3.14 `describe` or a sibling
    `describe('Extinction auto-pause (Story 3.15)')` using `LONE_GRID` / `CONWAY_ORGANISMS` /
    `CONWAY_PALETTE` and `installFrameDriver()`: (i) Play, `frame(0)`, `frame(100)` → root
    `data-status="paused"`, `data-cycle="1"`, `cycleText() === '0001'`, the row shows `0 (0%)` and
    the skull `img`, `totalLivingText() === '0'`, `getByRole('button', { name: 'Play' })` exists and
    `Next cycle` is NOT disabled; (ii) wrapped in `<Profiler>`: the auto-pause frame commits exactly
    once (mockClear after the Play commit); (iii) Play again, `frame(200)`, `frame(300)` → `0002`,
    paused; (iv) `Stop & reset` → `0000`, `1 (100%)`, no skull; (v) `axe(container)` clean in state
    (i). Reuse the file's `cycleText()` / `rows()` / `totalLivingText()` helpers — do not add a
    `getByText('0001')` (3.14 review: RTL's default matcher never sees the padded glyph run as one
    string).
  - [x] (c) `battleRoute.spec.ts`: rewrite 3.14 (d)'s tail per AC9 (`:2565-2572`), keeping its
    first half byte-for-byte; add the 3.15 `test.describe` per AC9 (a)/(b) using the module-scope
    helpers (`runButton`, `populationRows`, `collectErrors`, `seedWorkspace`, `seedConwaysClassic`)
    and the 3.14 block's `cycleValue`/`totalLivingValue` locators hoisted to module scope if the
    new block needs them (the 3.12 precedent for hoisting, `:131-160`). For (b) set the slider to 20
    gen/sec first (`speedSlider(page)`, the 3.13 block shows the `fill`/change idiom) so `0030` is ≈
    1.5 s, and poll with `expect.poll(…, { timeout: 5000 })`, never `waitForTimeout`.
  - [x] (d) Run the 3.14 and 3.15 blocks on `--project=chromium` and `--project=webkit`
    (`apps/web`, `--workers=1` if the machine is loaded — 3.14's Debug Log).

- [x] **Task 5 — comments made true (AC11)**
  - [x] (a) `useSimulation.ts` head comment: the "## Not here" paragraph loses "No extinction check
    (Decision B.5, Story 3.15 — the seam is marked in the thunk)" and the "three decisions that are
    new here" list gains a fourth bullet describing the thunk's stop path (extinction + error) and
    why it is keyed. `UseSimulationResult.status`'s doc comment gains: "`'paused'` also after an
    extinction auto-pause (FR-4.7) or a mid-frame throw; the union does not grow (spec §4)".
  - [x] (b) `grep -rn "3\.15\|3-15" apps packages` — every sentence that says the check "will" land
    or "is 3.15's" must read as present tense or be left only where it is still true as history
    (`simulationLoop.ts:182`, `index.ts:114-115`, `threePhaseStep.ts:91-93`, `conflictPhase.ts:42`,
    `conwayGoldens.test.ts:156-158` are all still true and stay).
  - [x] (c) `spec:check` after the edits.

- [x] **Task 6 — bookkeeping (AC11)**
  - [x] (a) `deferred-work.md`: the 3-10 review entry (Task 3 (c)); a new "## Deferred from: Story
    3-15-extinction-auto-pause (2026-09-16)" section with: (1) the auto-pause indicator /
    announcement question (FD4 — a UX candidate for the Clinical Lab mockup and Story 6.11's AT pass:
    on auto-pause the focused Play/Pause button's name flips from "Pause" to "Play" with no
    announcement; whether that needs a polite region is an AT-sweep call, not an axe one); (2) the
    `status` union candidate (`'extinct'` or a `pausedReason`) for 3.18's HUD / 4.15's preview to
    decide if either wants to render "why paused"; (3) the note that 3.14 test (d)'s literal "scan
    while playing with an extinct row" is unreachable under FR-4.7 and was rewritten to the
    auto-paused state (the 3.14 story file is NOT edited); (4) the re-seeding fixture's outcome if
    the optional test in Task 2 (d) was dropped.
  - [x] (b) `sprint-status.yaml`: `3-15-extinction-auto-pause: in-progress` at start, `review` at
    the end; no other line. Lane 4 is open in another worktree — its status diffs must not ride
    into this branch (the 3.8 review reverted exactly that).
  - [x] (c) Dev Agent Record: FD1–FD4 options taken and why; the bundle numbers; the `npm run ci`
    exit code with named failures; which e2e projects the 3.14/3.15 blocks ran on.

## Dev Notes

### Constraints the developer MUST follow

- **Scope: one predicate, one thunk branch, one keyed setter, tests, comments, docs.** No
  `<GridSizeControl>` (3.16), no gallery Run (3.17), no fullscreen/HUD (3.18), no hotkeys (3.19). No
  new component, no new prop on `<BattleSimulationView>` or `<SimulationControlBar>`, no new
  `status` value, no indicator, no live region (FD4). **No change to `threePhaseStep`, the phases,
  `stepGridBuffers`, `createSimulationLoop`, `population.ts`, `gridStats.ts`, `<PopulationStats>`,
  `<CycleCounter>`, `check-bundle-size.mjs`, `themes.css`.** The engine stays a pure reducer with no
  notion of "the run is over" (`threePhaseStep.ts:91-93`, `conflictPhase.ts:42`); the loop stays
  ignorant of cycles and extinction (`simulationLoop.ts:103-109`).
- **The check is in the HOOK's thunk, per cycle, and it is not the population pass (M2).**
  Project-context says population counts are "never computed per-cycle"; an early-exit emptiness
  scan is not a population count, and Decision B.5 requires it every cycle. Do not "save" the scan
  by folding it into `derivePopulation` at publish cadence (a late check is a wrong pause when a
  `neighborCount = 0` born rule re-seeds), and do not move it into the strategy (a semantics-bearing
  change to RFC-004 §3, needing its own RFC amendment — the M14/M15 precedent).
- **Hot state stays in refs (RFC-005 Decision 5, AR-29).** The stop path is one `setView`. No
  `useState` for "extinct", no effect that watches `population` to decide to pause (that is a
  render-cadence check — wrong by construction, and a cascade under
  `react-hooks/set-state-in-effect`).
- **`isRunning()` is the loop's truth, not `view.status`** (3.10 FD5's reasoning, `:428-429`).
  Inside the thunk, React state may be a render behind; the loop's handle is exact.
- **`stop()` from inside `step()` is a supported loop contract (Story 3.8 AC7)** — the frame that
  called `step()` still paints that step's grid and requests no further frame. Rely on it; do not
  add a "skip the paint" flag or a deferred `stop()` via `queueMicrotask`.
- **Keyed publish from a RAF callback** (`publish`'s comment, `:323-328`): the stop path fires
  from inside a frame, exactly the window a rebind can straddle — key it on `sameKey`.
- **Repositories are injected, never imported (AR-2, AR-27).** Nothing here touches one.
- **`packages/*` rules:** no DOM types, no classes, no module state; ESM; `export type` for types;
  cross-package imports by package name; comments explain WHY and cite by ID (`spec:check` reads
  code too — `FR-4.7`, `Decision B`, `AR-41`, `M2`, `Story 3.8` exactly; `FR4.7` or `B-5` is silently
  exempt forever).
- **`apps/web` rules:** strict TS, no `any`/`!`/`@ts-ignore`; `react-hooks/refs`,
  `set-state-in-effect`, `exhaustive-deps` are live; never read/write a ref during render.
- **Determinism in tests:** every extinction assertion runs on `CONWAYS_CLASSIC` (no ties, no RNG —
  3.12 trap 7). The two-Conway `TWO_CONWAYS` fixture and the mock roster are NOT for this story's
  count assertions.
- **Commit gate.** The story subagent commits to its own `story/3-15-…` branch; merging is
  Sidiar's. Do not touch epic-4 story files or status lines.

### What this story is, in one paragraph

Story 3.10 built the hook so that this story would be a branch in one closure: the thunk already
owns the cycle counter and the publish decision, the loop already honours a stop from inside a step
and paints the stopping step, the population derivation already flags every row extinct, and the
control bar already reads `status`. What is left is the predicate (`isGridEmpty`, a grid query that
belongs beside `clearGrid` in the engine package so AR-41's property test can run there with the
goldens), the thunk's branch (`isRunning() && isGridEmpty(front)` → `loop.stop()` → one keyed
`setView` to `'paused'` with the exact cycle), and the discipline that makes it FR-4.7 rather than
"stop": nothing is reset, `play()` resumes, `step()` steps, and the extinct dish stays on screen.
The 3.10 review noticed that a loop stopping itself on a THROW needs the same "`status` follows"
path and deferred it here; it is two try/catches around the loop-facing closures, sharing the
setter. The route-level consequence is that an extinct grid can never be "playing" for more than one
cycle — which turns 3.14's "scan while playing with an extinct row" e2e into a stale premise that
this story rewrites. Nothing about the UI changes: the button label, the enabled Step, the frozen
counter and the skull rows are the whole signal, and the question of an explicit "auto-paused"
indicator is recorded for UX rather than invented here.

### Forced decisions (record the option taken and why in the Dev Agent Record)

**FD1 — Where the "paused with the exact cycle" write lives.**
- **(a) One keyed `settleStopped(session)` callback in the hook, injected into `createSession`
  beside `publish`, used by the thunk's extinction branch, by the error wrappers (FD3) and by
  `pause()`** *(recommended)*. Three callers, one write, one shape (`{ ...prev, status: 'paused',
  cycle, population }`), keyed on `sameKey` so a frame in the rebind window cannot pause the NEW
  view with the OLD session's cycle. `pause()` becomes `loop.stop(); settleStopped(session)`.
- **(b) Inline `setView` in the thunk, `pause()` untouched.** Two writes of the same shape that can
  drift (one keyed, one not); the error path would be a third.
- **(c) A `status` parameter on `publish`.** Overloads the cadence publish with a status write it
  never otherwise makes; every existing call site gains an argument for nothing.

**FD2 — Where the predicate lives and what it is called.**
- **(a) `isGridEmpty(grid)` in `packages/simulation/src/grid/grid.ts`, exported from the barrel**
  *(recommended)*. It is a grid query with the same shape as `clearGrid` (its inverse contract), the
  package already carries fast-check and the Conway goldens for AR-41's property test, and Story
  4.15's preview gets it through the hook with no second copy. Name: "empty" is the grid fact;
  "extinct" is the population/UI word (`PopulationEntry.extinct`) — keep the two vocabularies apart.
- **(b) `apps/web/lib/battle/`.** Property tests over the engine would then import `@gol/simulation`'s
  goldens into the web package, and the predicate would sit beside the M2 population code it must
  not be confused with.
- **(c) A `livingCells` count returned by the strategy.** Changes `SimulationStrategy`'s
  destination-returning contract (Story 3.6 FD1, `stepGridBuffers`'s identity check) — an RFC-004
  §3 amendment for a boolean.

**FD3 — The error-stop path (the 3-10 review's deferred item).**
- **(a) Wrap both loop-facing closures (`step`, forwarding `draw`) with catch → `settleStopped` →
  rethrow** *(recommended)*. Two try/catches, no new state, no swallowing; the deferred entry named
  exactly these two throw sites and this story as the place, because the mechanism is the same
  write. Tested through a throwing fake `drawDiff` (the only throw reachable from a valid session).
- **(b) Extinction only; re-defer the error path with a reason.** Legitimate if (a) turns out to
  need more than the two wrappers — record why in `deferred-work.md` and the Dev Agent Record.

**FD4 — Signalling the auto-pause.**
- **(a) No new status value, no indicator, no announcement** *(recommended)*. Spec §4's union is
  `'paused' | 'playing'`; three consumers (3.12, 3.18, 4.15) read it; the mockup that is the
  authority for Run mode has no auto-pause chrome; the biotech proposal's indicator is unreviewed
  and half of it (STEADY_STATE) was removed by B.5. The extinct rows, the "Play" label, the enabled
  Step and the frozen counter already say it. Recorded as a UX/AT candidate (Task 6).
- **(b) `status: 'extinct'`.** Every consumer's `status === 'playing'` checks still work, but every
  "paused" branch (Next cycle enabled, the Play label, 3.19's SPACE) needs a second arm, and the
  value conflates "why" with "what".
- **(c) A polite live region announcing "Simulation paused: all organisms extinct".** 3.14 FD8
  rejected live regions on this sidebar at 10 Hz; a once-per-event announcement is a different
  case and may well be right — but it is a UX/AT decision (6.11's sweep), not this story's.

### Traps

1. **The 3.14 e2e (d) hangs, it does not fail.** `battleRoute.spec.ts:2565-2572` polls the counter
   away from `0001` (passes — the run reaches 2), then `getByRole('button', { name: 'Pause' })`
   — which no longer exists after the auto-pause — and Playwright waits out its timeout. Rewrite
   the tail first (AC9), before running the suite.
2. **Off-cadence extinction at 20 gen/sec.** `cyclesPerPublish(20) === 2`; a lone cell dies at cycle
   1. Without the early return in the thunk, the cadence branch would NOT publish (1 is odd) and the
   view would show `0000` paused — wrong by one. The stop path publishes unconditionally, like
   `pause()`.
3. **Two commits for one frame.** Calling `setView` for `status` and then `publish(session)` for the
   cycle is two renders and, worse, a window where `status === 'paused'` with the OLD cycle. One
   `setView` carrying all three fields (FD1); the `<Profiler>` test in Task 4 (b) pins it.
4. **`isRunning()` inside the loop's frame is `true` until `stop()`.** The loop clears `handle` only
   in `stop()` or its catch; inside `step()` it still holds the executing frame. So the guard
   `isRunning() && isGridEmpty(...)` is exactly "the loop drove this step" — and it is `false` for
   manual `step()`, which is what keeps the manual path at one sweep.
5. **`scheduler.cancel` of the executing handle is a no-op by contract** (`FrameScheduler`'s doc,
   `simulationLoop.ts:43-55`; the fake's `cancel` returns on a miss). Do not assert `cancelled()`
   increments on the auto-pause — assert `pending() === 0`.
6. **The paint of the stopping step happens AFTER `settleStopped`'s `setView`** — inside the same
   RAF callback, synchronously. React 19 batches the state write until the callback returns, so the
   canvas shows the empty dish and the sidebar shows the paused state in the same frame. Do not
   move the paint into the hook or defer the state write.
7. **`session.loop` inside `session.step`** is a property read on an object under construction in
   the literal — legal because the thunk runs only after the literal is complete (the loop
   harness's own note, `simulationLoop.test.ts:84-86`). Do not restructure the session into a class
   or a two-phase init to "fix" it.
8. **The fake renderer is strict about size** (`createFakeRenderer`, `useSimulation.test.ts:57-62`):
   build it at the fixture's size (`{ cols: 3, rows: 3 }` for the lone cell, `12 × 12` for the
   glider) or the prime throws before the story's assertion is reached.
9. **`age` under an empty cell is not life.** Phases clear `age` with `occupant` (`grid.ts:68-72`),
   but the predicate must not read `age` at all — Task 1 (c)'s "non-zero age, zero occupant" test
   guards against a future "optimisation" that checks `age` because it "happens to agree".
10. **`fc.constantFrom` over grids must hand out FRESH grids per run.** `createGridBuffers` takes
    `front` by reference and the swap makes it scratch (`conwayGoldens.test.ts:44-47`); generate the
    dense pattern and call `gridFromDense` inside the property body, never share one `Grid` across
    fast-check runs.
11. **The view fixture is safe; the seeded battles are safe** (measured, AC10) — do not swap any
    existing Play test's fixture "to be sure". The only extinct fixtures are the lone cell (unit,
    view, e2e (d)) and whatever this story adds.
12. **`spec:check` reads this file.** Every ID above is spelled as the specs spell it.

### Spec-conflict flags (project-context: surface new conflicts, don't silently pick one)

- **Story 3.14 AC8's literal "axe while PLAYING with an extinct row present"** is unreachable once
  FR-4.7 lands: an extinct grid auto-pauses on the first driven step. This story rewrites the e2e
  and the comment, leaves 3.14's story file alone, and records the supersession in
  `deferred-work.md` (Task 6 (a) item 3). Not a spec conflict — a story-to-story consequence.
- **Biotech `play-mode-proposal.md` §5 "Auto-Pause Indicator"** names STEADY_STATE as a trigger,
  which Decision B.5 / the PRD reconciliation removed. Superseded; the indicator itself is a UX
  candidate (FD4).
- **Component-tree §4** lists "Auto-pauses on extinction (FR-4.7 — plain emptiness check, B.5)"
  under the hook with `status: 'paused' | 'playing'` — matches FD4 (a) exactly. No amendment.
- **The 3-10 review's deferred error-stop item** assigned itself here; the epic's ACs do not name
  it. Taken as AC6 because it is the same write; FD3 (b) is the sanctioned way out.
- **project-context "population counts … never computed per-cycle (M2)"** vs the per-cycle
  emptiness scan: not in tension — the scan is O(cells) with early exit and is not a population
  count; the seam comment (3.10 Task 4) already resolved it. Stated here so a reviewer does not
  re-open it.

### What NOT to build

- ❌ No freeze / steady-state / period-N detection; no `gridEquals`; no previous-grid comparison
  (Decision B.5, validation H-α). A test that a still-life pauses is a spec violation.
- ❌ No engine change: no `livingCells` return from the strategy, no extinction flag on
  `GridBuffers`, no check inside `createSimulationLoop`.
- ❌ No `'extinct'` status, no `pausedReason`, no indicator, no toast, no live region, no dialog.
- ❌ No `useEffect` watching `population` to pause; no `useState` in the hook or the view for this.
- ❌ No `drawFull`, no re-clone, no seed re-mint on auto-pause — those are `stop()`'s.
- ❌ No `queueMicrotask`/`setTimeout` around `loop.stop()`; no "skip the final paint" flag.
- ❌ No change to `<SimulationControlBar>` — it already reads `status`.
- ❌ No new `@gol/test-utils` fixture module; golden patterns are inline strings via
  `gridFromPattern`, as every existing test does.
- ❌ No edit to `component-tree-battle-page.md`, `architecture.md`, RFCs, mockups or 3.14's story
  file — candidates go to `deferred-work.md`.

### Testing standards summary

- `packages/simulation`: Vitest 4, node env, `fast-check` (`fc.assert(fc.property(...))`, the
  `grid.test.ts:281-330` idiom), per-file ≥ 90 % coverage gate (currently 100 % — keep it).
  Goldens: `conwayGoldens.test.ts` patterns and its `run` helper; Conway deps via `compileSession`
  with a throwing `rng` (single organism: a tie is a defect).
- `apps/web/lib/battle`: `useSimulation.test.ts`'s `createFakeScheduler` / `createFakeRenderer` /
  `harness` / `mount` / `runCycles`; `vi.mock('./population', { spy: true })` for sweep counts;
  `act()` around every frame.
- `apps/web/components`: RTL + `installFrameDriver()` + `installContexts()` +
  `GridRenderer.prototype` spies + `<Profiler>` for commit counts + `vitest-axe`. Never
  snapshot the canvas; read `data-status`/`data-cycle`, the counter via `cycleText()`, rows via
  `getAllByRole('listitem')`, the skull via `getByRole('img', { name: 'extinct' })`.
- e2e: Playwright, `expect.poll` never `waitForTimeout`; assert `data-cycle` before `data-status`
  on an auto-pause (they land together, and `paused` is also the pre-Play value); `collectErrors`
  on every test; run 3.14 + 3.15 blocks on `chromium` and `webkit`.
- Make every new test fail under the mutation it guards: the predicate reading `age`; the predicate
  stopping before the last cell; the thunk checking only at publish cadence (the 20 gen/sec test
  reddens); the thunk publishing via the cadence branch instead of the stop path (the off-cadence
  test reddens); `pause()`/`settleStopped` without the key (hard to red-test — rely on the
  existing rebind tests staying green); a still-life pausing (AC4 tests redden); the error wrapper
  removed (AC6 test reddens on `status`).
- `npm run ci > /tmp/ci-3-15.log 2>&1; echo $?`; report the real exit code, the named failures,
  and the bundle numbers.

### Previous story intelligence (3.14) and recent git

- **3.14 shipped the rendering this story's outcome is seen through**: extinct rows with the skull
  (`PopulationStats.tsx`), the padded counter (`CycleCounter.tsx`), and the test handles
  (`cycleText()`, `rows()`, `totalLivingText()`, the e2e `cycleValue`/`totalLivingValue`). It added
  no hook semantics — this story adds the one it left for 3.15.
- **3.14's review culture** (11 patches, all test-strength): frame-to-cycle comments must match the
  loop's real arithmetic (the bank clamp at a speed change, `simulationLoop.ts` FD3); exact
  `textContent` equality for the counter (`toHaveTextContent` is substring); axe fixtures must be
  the state they claim to be; an e2e that "plays" must have stepped at least one published cycle
  before it asserts anything about playing. Apply the same rigour to the auto-pause frames.
- **3.14's Debug Log**: `bench:check` went red under measured machine contention (301 ms with load
  averages of 51/161/134 while a second lane's vitest ran; 28 ms seconds later) — report, don't
  chase. The four-project Playwright matrix was OOM-killed locally in 3.12; `--project=chromium
  --workers=1` then `--project=webkit` on the story's blocks is the clean local signal.
- **3.14 measured** `/battle` at 308.6 KB gzip (1.4 KB headroom) and the Run chunk at 5.9 KB gzip.
  This story adds a few hundred bytes to the Run chunk (the branch + two wrappers) and to the
  shared engine chunk (`isGridEmpty`); `/battle` should not move.
- **3.10's review** deferred the error-stop here (`deferred-work.md:837-853`); **3.12** noted that
  the stale `'playing'` makes the button read "Pause" and that pressing it recovers — this story
  makes the recovery automatic (AC6).
- **Git:** stories run on `story/*` branches merged by PR (#43 3.14, #42 4.7); `feat:` / `fix:
  review patches (story N.M)` / `docs: record implement-next-story run stats` is the commit shape.
  Lane 4's next story (4.8 colour picker) touches `components/organisms/**` only. 4.15 is gated on
  this story in `lane-gates.yaml` — it is the second `useSimulation` instance and inherits the
  auto-pause through the hook with no work of its own (FR-2.7 "honoring extinction auto-stop").

### External dependencies / versions

None new. `fast-check` as installed in `packages/simulation` (already imported by `grid.test.ts`,
`resizeGrid.test.ts`, `phasePurity.test.ts`); Vitest 4.1.x; React 19.2.7; RTL 16.3.2; `vitest-axe`
0.1.0; Playwright as installed. No React Compiler.

## Project Structure Notes

- Modified (code): `packages/simulation/src/grid/grid.ts` (+ `isGridEmpty`),
  `packages/simulation/src/index.ts` (export + comment), `apps/web/lib/battle/useSimulation.ts`
  (thunk branch, `settleStopped`, `pause()` reuse, two wrappers, comments).
- Modified (tests): `packages/simulation/src/grid/grid.test.ts`,
  `packages/simulation/src/strategy/conwayGoldens.test.ts` or new
  `packages/simulation/src/strategy/extinctionOnly.test.ts` (dev's call — one file, not both),
  `apps/web/lib/battle/useSimulation.test.ts`,
  `apps/web/components/battle/simulation/BattleSimulationView.test.tsx`,
  `apps/web/e2e/battleRoute.spec.ts` (3.14 (d) tail rewritten; new 3.15 block).
- Modified (comments only): `apps/web/components/battle/simulation/BattleSimulationView.tsx`.
- Modified (docs): `docs/implementation-artifacts/deferred-work.md`, `sprint-status.yaml`, this file.
- Not touched: `packages/simulation/src/strategy/**` (code), `packages/simulation/src/loop/**`,
  `apps/web/lib/battle/population.ts`, `gridStats.ts`, `simulationSpeed.ts`, every component under
  `components/battle/simulation/` except the view's comments, `components/battle/editor/**`,
  `BattlePage.tsx`, `scripts/*`, any planning artifact, any epic-4 story or status line.
- Naming: `isGridEmpty` (grid vocabulary, camelCase, no dotted filenames — it lives in `grid.ts`);
  `settleStopped` (hook-private); test describes cite `FR-4.7` / `Decision B.5` / `AR-41`.

## References

- `docs/planning-artifacts/epics.md#Story 3.15` (`:925-935`) — the three clauses; Story 3.8 AC
  (`:840-845`, "start/stop are idempotent"), 3.10 AC (`:869-872`), 3.12 (`:894-897`, Step disabled
  during playback), 4.15 (`:1175`, "extinction auto-pauses (FR-2.7, B.5)"); FR-4.7 (`:74`), FR-2.7
  (`:49`), AR-41 (`:215`).
- `docs/planning-artifacts/prds/prd-GameOfLife-2026-05-26/prd.md` — **FR-4.7 (`:316-322`)**: "a
  **pause** (FR-4.1), not the Stop action (FR-4.4) … the run can be resumed/stepped; it is **not**
  reset"; "simple emptiness check"; still-lifes/oscillators/gliders not auto-stopped; FR-2.7
  (`:216`).
- `docs/planning-artifacts/architecture.md` — Runtime Architecture step 5 (`:129`), **Decision B.5
  (`:184`)**, the PRD reconciliation (`:186`), M2 (`:348`), FR-4 coverage row (`:384`).
- `docs/planning-artifacts/rfcs/RFC-004-simulation-rules-engine.md` — auto-stop paragraph
  (`:758-770`, "`step` is pure, so the orchestrator auto-pauses"), §3.3 age bound (`:753-757`).
- `docs/planning-artifacts/rfcs/RFC-005-application-state-modes-undo.md` — Decision 5 (`:224-254`).
- `docs/planning-artifacts/rfcs/RFC-008-testing-and-tooling-strategy.md` — unit scope (`:81`),
  goldens "not auto-stopped" (`:104`), **the property list (`:115`)**.
- `docs/planning-artifacts/component-tree-battle-page.md` — **§4 `useSimulation` (`:363-375`)**,
  §3.13 (`:309-322`, `status: 'paused' | 'playing'`), §6 (`:420-422`), §7 row 4.7 (`:445`).
- `docs/planning-artifacts/ux-designs/ux-GameOfLife-2026-05-27/clinical-lab-theme/petri-dish-play-mode.html`
  (the Run authority — no auto-pause chrome); `biotech-terminal-theme/play-mode-proposal.md`
  (`:240-262`, the superseded indicator proposal — context only).
- `apps/web/lib/battle/useSimulation.ts` — head comment (`:30-102`, "Not here" `:98-101`),
  `SessionInputs` (`:228-236`), **the thunk and its seam comment (`:262-272`)**, `publish` and the
  key guard (`:321-332`), `pause` (`:417-424`), `step` FD5 guard (`:426-436`), `stop` (`:438-462`);
  `useSimulation.test.ts` — harness (`:20-157`), cadence tests (`:227-299`), transport tests
  (`:301-390`), rebind tests (`:611-732`).
- `packages/simulation/src/loop/simulationLoop.ts` — head comment failures (`:14-39`), the
  try/catch (`:163-178`), **the trailing re-request and its 3.15 mention (`:181-190`)**, `stop`
  (`:206-216`); `simulationLoop.test.ts` — harness `stepInto` (`:80-98`), **AC7 (`:290-328`)**, the
  throw test (`:330-347`).
- `packages/simulation/src/grid/grid.ts` — the invariant (`:34-37`), `createGrid`/`clearGrid`
  (`:99-121`), `age` semantics (`:64-78`); `grid.test.ts` (`:281-330`, fast-check idiom);
  `packages/simulation/src/index.ts` (`:40-54` grid block, `:110-125` loop block);
  `strategy/threePhaseStep.ts` (`:91-93`), `strategy/conflictPhase.ts` (`:42`),
  **`strategy/conwayGoldens.test.ts`** (`conwayDeps` `:24-33`, `run` `:36-51`, still-life
  `:156-167`, lone cell `:170-177`), `threePhaseStep.bench.ts` (`:68-71`, what is gated).
- `apps/web/lib/battle/gridStats.ts` (`:54-67`, the `width * height` scan shape),
  `population.ts` (`:22-27`, cadence ownership; `:74`, `extinct: count === 0`).
- `apps/web/components/battle/simulation/BattleSimulationView.tsx` (`:36`, `:168-187`),
  `BattleSimulationView.test.tsx` (`:15-27` fixtures, `:60-110` frame driver, `:623-630` lone-cell
  fixtures, `:725-772` AC7 cadence, `:775-790` axe), `SimulationControlBar.tsx` (`:176-205`, the
  label and `disabled={playing}`), `apps/web/e2e/battleRoute.spec.ts` (helpers `:131-160`, 3.12 block
  `:2128-2286`, 3.13 slider idiom `:2287-2442`, **3.14 (d) `:2529-2575`**).
- `packages/test-utils/src/mockWorkspace.ts` (`placeMockRoster` `:205-278` — the seeded 2×2 blocks
  that settle, never die), `packages/domain/src/survivalRuleSchema.ts` (`:6`, `NumericLiteral
  min(0)` — a `neighborCount eq 0` born rule is expressible).
- `docs/implementation-artifacts/3-14-cycle-counter-population-stats.md` (Review Findings, Debug
  Log, traps 1/5/8/11), `3-10-usesimulation-hook.md` (Task 4 seam `:180-190`, FD4/FD5, review
  deferral `:308`), `3-12-transport-controls.md` (`:186`, `:297`, `:556`), `3-8-simulationloop.md`
  (AC7), `deferred-work.md` (**3-10 review `:837-853`**, 3-13 `:982-1022`, 3-14 `:1150-1194`),
  `lane-gates.yaml` (4-15 → 3-15).
- `docs/project-context.md` — "Auto-stop is extinction-only (Decision B.5). The intuitive test is
  wrong"; hot state in refs; population at cadence (M2); no classes in the engine; property tests
  cover extinction-only auto-stop; `spec:check` spelling; commit gate; bundle ratchet.

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5 (claude-sonnet-5), via the `bmad-dev-story` skill.

### Debug Log References

**Forced decisions taken:**

- **FD1 (a)** — one keyed `settleStopped(session)` callback, injected into `createSession` through
  `SessionInputs` beside `publish`, shared by the thunk's extinction branch, the two loop-facing
  error wrappers (FD3), and `pause()`. `pause()` is now `session.loop.stop(); settleStopped(session);`.
- **FD2 (a)** — `isGridEmpty(grid)` added to `packages/simulation/src/grid/grid.ts`, right after
  `clearGrid` (its query twin), exported from the barrel (`index.ts`) beside `clearGrid`/`cloneGrid`.
- **FD3 (a)** — both loop-facing closures inside `createSession` (the driver's `step` and the
  forwarding renderer's `draw`) are wrapped in `try`/`catch`; the catch calls `settleStopped(session)`
  then rethrows unchanged, so `simulationLoop.ts`'s own wedged-loop catch still clears `handle` and
  the caller still observes the error. The 3-10 review's deferred item is closed by this path
  (`deferred-work.md`).
- **FD4 (a)** — no new `status` value, no indicator, no live region. `status` stays
  `'paused' | 'playing'`; the extinct population rows, the frozen counter and the Play/Pause label
  are the whole signal. The indicator/announcement question and the `status`-union question are
  both recorded as deferred-work candidates for Story 6.11 / 3.18 / 4.15 to pick up.
- The optional re-seeding test in Task 2 (d) (a `neighborCount = 0` born-rule organism) was **not
  added** — the fixture needs a rule shape no existing test builds, and the per-cycle check's
  correctness is already pinned by the off-cadence hook test (20 gen/sec, trap 2) and the
  engine-level property (`conwayGoldens.test.ts`, AC5 (d)) without it. Recorded in
  `deferred-work.md`'s new "Deferred from: Story 3-15" section.

**`npm run ci` (full local gate, run stage by stage and logged to `/tmp/ci-3-15-*.log`):**

| Stage | Result |
|---|---|
| typecheck | exit 0 |
| lint | exit 0 (1 pre-existing warning, `BattleGallery.tsx`, unrelated to this story) |
| format:check | exit 0 (after `prettier --write` on the three touched test/index files) |
| spec:check | exit 0 — 250 cited ids resolve |
| boundary:check | exit 0 |
| test:coverage | exit 0 — 1351 tests passed; `packages/simulation` and `packages/domain` at 100% per file (gated, ≥90%); `apps/web`'s `useSimulation.ts` at 98.51%/96.22%/98.38% stmt/branch/line (no gate) — the two uncovered lines are the `step` wrapper's catch body for a `session.step()` throw, which the story's own Dev Notes say is unreachable from a valid session (M12 compiles the roster up front; only the `drawDiff`-throws path is reachable and is tested) |
| build:standalone | exit 0 |
| bundle:check | exit 0 — `/battle` 308.7 KB gzip (1.3 KB headroom, was 308.6/1.4 KB before 3.15 — +0.1 KB); `/battle/new` 308.6 KB gzip (1.4 KB headroom); `/` 333.4 KB (6.6 KB headroom); `/organisms` 295.3 KB (9.7 KB headroom) |
| bench | exit 0 — `step 100x60 x20` mean 7.993 ms (the `isGridEmpty` scan runs in the hook's thunk, outside the benchmarked `threePhaseStep`, so it does not appear here) |
| bench:check | exit 0 — frame 8.134 ms vs 16.667 ms budget, **51.2% headroom** (measured under `load averages: 6.07 4.21 3.75`) |
| e2e | **exit 1** — 606 passed, 4 skipped, **2 failed**, both PRE-EXISTING and named by the story: `[webkit]` and `[tablet]` › `Transport controls (Story 3.12) › Tab reaches Play, Next cycle, Stop & reset in order, and Enter on Play keeps focus on the (now Pause) button (AC8)` — a focus-after-Tab assertion unrelated to this story's changes, not fixed here per the story's instruction |

3.14's and 3.15's own e2e blocks (`battleRoute.spec.ts`) were also run standalone on `chromium` and
`webkit` (`--workers=1`) before the full gate, and passed on both:
`extinct organism shows the skull, a zero count, and a clean axe scan` (3.14, rewritten tail),
`a lone painted cell auto-pauses at cycle 1, resumes and auto-pauses again, and Stop & reset undoes it`
(3.15a), `Three-Way Skirmish keeps playing past cycle 30 once settled into still-lifes` (3.15b).

### Completion Notes List

- `isGridEmpty` added to `packages/simulation/src/grid/grid.ts` (after `clearGrid`) and exported
  from the package barrel; 100% covered per file, with fast-check properties for AC5 (a)-(c) in
  `grid.test.ts` and the engine-level property (AC5 (d)) added to `conwayGoldens.test.ts`'s
  existing "extinction is a normal outcome" describe block (four non-extinguishing goldens over
  `n ∈ [0, 40]`, plus the lone cell's `isGridEmpty ⟺ n >= 1`).
- `useSimulation.ts`'s thunk gained the `isRunning() && isGridEmpty(front)` branch (after the step,
  before the publish decision) that stops the loop and calls the new keyed `settleStopped`, and the
  loop-facing `step`/`draw` closures inside `createSession` are wrapped for the error-stop path
  (FD3). `pause()` now shares `settleStopped` instead of writing its own unkeyed shape.
  `BattleSimulationView.tsx` needed no code change — only its head comment and the "Known gap"
  paragraph, both rewritten to state what is now true.
- Hook tests added: a new `describe('useSimulation — extinction auto-pause …')` (basic auto-pause,
  single-commit, off-cadence trap, resume-then-auto-pause-again, step()-after, stop()-after, manual
  step() onto an already-empty grid, and the three never-auto-pauses cases for a block/blinker/
  glider) and a new `describe('useSimulation — the error-stop follows the same path …')`. One test
  needed catching the thrown error INSIDE `act()` rather than letting it escape — React's `act`
  (verified against `react/cjs/react.development.js`) only flushes pending state updates when its
  callback returns normally, so a callback that lets the error propagate skips the `settleStopped`
  state update entirely; a real RAF callback that throws does not have this problem since the
  `setState` was already scheduled with React independently of the throw.
- View tests added inside the existing 3.14 describe block (fixtures already in scope): the full
  auto-pause sequence, a `<Profiler>` single-commit test, and an axe-clean check in the
  auto-paused state.
- e2e: 3.14 test (d)'s tail was rewritten per AC9 (its first half is untouched) — the "scan while
  playing with an extinct row" premise is unreachable under FR-4.7, so the tail now asserts the
  auto-paused state at cycle 2 instead. A new `test.describe('Extinction auto-pause (Story 3.15)')`
  was added with its own locally-scoped `view`/`cycleValue`/`totalLivingValue` (matching the
  existing per-describe-block convention rather than hoisting — each of the 3.12/3.13/3.14 blocks
  already defines its own), using the module-scope `runButton`/`populationRows`/`collectErrors`/
  `seedWorkspace`/`seedConwaysClassic`/`speedSlider` helpers.
- `deferred-work.md`: the 3-10 review's deferred error-stop item is struck through and marked
  "✅ Closed by Story 3.15" with the mechanism; a new "Deferred from: Story 3-15" section records
  the auto-pause indicator/announcement question, the `status`-union candidate, the 3.14 test (d)
  supersession, and the dropped optional re-seeding test.

### File List

- `packages/simulation/src/grid/grid.ts` — added `isGridEmpty`.
- `packages/simulation/src/grid/grid.test.ts` — example tests + 4 new fast-check properties for
  `isGridEmpty`.
- `packages/simulation/src/index.ts` — exported `isGridEmpty`, extended the grid block's comment.
- `packages/simulation/src/strategy/conwayGoldens.test.ts` — the AC5 (d) engine-level property
  (two new tests in the existing "extinction is a normal outcome" describe block).
- `apps/web/lib/battle/useSimulation.ts` — the thunk's auto-pause branch, `settleStopped`, `pause()`
  reuse, the two wrapped loop-facing closures (FD3), head-comment and `status`-doc-comment updates.
- `apps/web/lib/battle/useSimulation.test.ts` — two new describe blocks (extinction auto-pause;
  the error-stop path) plus `lone()`/`block()`/`glider12()` fixtures.
- `apps/web/components/battle/simulation/BattleSimulationView.tsx` — comments only (head comment,
  "Known gap" paragraph rewritten to "Gap closed").
- `apps/web/components/battle/simulation/BattleSimulationView.test.tsx` — three new tests inside
  the existing 3.14 describe block.
- `apps/web/e2e/battleRoute.spec.ts` — 3.14 test (d)'s tail rewritten; new
  `test.describe('Extinction auto-pause (Story 3.15)')` with two tests.
- `docs/implementation-artifacts/deferred-work.md` — 3-10 review entry closed; new "Deferred from:
  Story 3-15" section.
- `docs/implementation-artifacts/sprint-status.yaml` — `3-15-extinction-auto-pause` status only.
- `docs/implementation-artifacts/3-15-extinction-auto-pause.md` — this file (frontmatter, task
  checkboxes, Dev Agent Record, Change Log, Status).

## Change Log

- 2026-09-16 — Story 3.15 created (ready-for-dev): ultimate context engine analysis completed —
  comprehensive developer guide created.
- 2026-09-16 — Implemented (review): `isGridEmpty` added to `@gol/simulation`; the hook's thunk
  gained the extinction auto-pause branch and a shared keyed `settleStopped` write reused by
  `pause()` and two new error-stop wrappers (closing the 3-10 review's deferred item); view and
  route comments/tests updated to match; `deferred-work.md` updated. `npm run ci` green except the
  two pre-existing 3.12 webkit/tablet focus-order failures named in the story.

Dev Model: sonnet   # a branch in an existing closure over contracts 3.8/3.10 already pinned (stop-from-inside-step, keyed publish, the marked seam); FD1–FD4 resolve every open call, and 4.15 consumes the hook, not a pattern
Proposed lane gate: none
