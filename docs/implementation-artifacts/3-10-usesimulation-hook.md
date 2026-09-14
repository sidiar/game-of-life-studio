---
baseline_commit: 591f45b0ed561cc44e2615165f973a9d43247f4e
---
# Story 3.10: `useSimulation` Hook

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a developer,
I want the one React↔engine bridge,
so that simulations run at 60 FPS with zero React re-renders per cycle.

## Acceptance Criteria

From `epics.md#Story 3.10`, decomposed into what a reviewer can check independently. Every engine
piece the hook composes already exists and is gated: `compileSession` (3.4/3.7), `stepGridBuffers`
+ `createSimulationLoop` (3.8), `drawDiff` + `toStepRenderer` (3.9), `resizeGrid` (3.3),
`computeEditorGridStats` (2.12). What does **not** exist is the thing that owns them for the
lifetime of a Run: a session (buffers + deps + seed + cycle count) in refs, a loop over it, a
renderer slot the canvas fills later, and a publish cadence that lets React see the run without
rendering it. No component consumes the hook in this story — 3.11 is its first caller, and this
story's tests are the hook's only consumer. AC10 pins the contract in words so 3.11–3.19 and 4.15
build on a documented surface rather than on what happened to compile.

1. **Signature and return shape.** `useSimulation(initialGrid, organisms, opts)` in
   `apps/web/lib/battle/useSimulation.ts` returns `{ status, cycle, population, genPerSec,
   liveSize, play, pause, step, stop, setSpeed, resizeLive, attachRenderer }` — spec §4's ten
   members plus `genPerSec` and `liveSize` (FD6). `organisms` is the battle roster as **domain
   `Organism` records in roster order** (`organisms[ref - 1]`, M14) — it satisfies
   `CompilableOrganism` and `OrganismRuntime` structurally (M13) and carries the `name` /
   `colorToken` the population entries need. `opts` is `{ genPerSec: GenPerSec; seed?: number;
   scheduler?: FrameScheduler }`; the last two exist for tests and default to a fresh mint and
   bound `requestAnimationFrame`/`cancelAnimationFrame`.

2. **The live grid is a clone; `initialGrid` is never written (AR-31, RFC-005 Decision 4).** The
   session's `front` buffer is a deep copy (`cloneGrid`, Task 1) of `initialGrid` — new
   `occupant` and `age` buffers, never `.subarray`, never `initialGrid` itself (`createGridBuffers`'s
   own warning: after one swap the grid handed in IS `back`). A test runs ten cycles from a blinker
   and asserts `initialGrid.occupant` is byte-identical to a copy taken before mount.

3. **Everything hot lives in refs; the engine never touches React state (AR-29, RFC-005 Decision 5).**
   The buffers, `SimulationDeps`, the loop, the cycle counter, `msPerCycle` and the attached renderer
   are refs. Grid buffers never appear in a `useState`. A test drives 40 cycles at 20 gen/sec
   through the fake scheduler and asserts the hook re-rendered exactly once per *publish*, never
   per cycle — a render counter in the `renderHook` callback, with the expected count derived from
   AC5's cadence, not from an observed number.

4. **`play` / `pause` / `step` / `stop` have exactly these semantics.** `play()` starts the loop
   (idempotent — a second `play()` starts no second chain, 3.8 AC6) and sets `status` to
   `'playing'`; `pause()` stops it, sets `'paused'`, and publishes immediately so the counter and
   bars show the exact paused cycle; `step()` advances exactly one cycle **outside the loop** (the
   same thunk the loop is handed — one step function, two callers), repaints, and publishes
   immediately (FR-4.3, FR-4.5 "including manual steps"); `stop()` stops the loop, discards the
   session's buffers, re-clones `initialGrid` at its own dimensions (an ephemeral resize is gone —
   FR-4.9), resets `cycle` to 0, mints a fresh seed, repaints via `drawFull`, and publishes.
   `step()` and `resizeLive()` while `status === 'playing'` **throw** (FD5) — FR-4.3/FR-4.9 make
   both paused-only and the controls (3.12, 3.16) are disabled while running, so a call that
   arrives anyway is a programming error, not a state to absorb silently.

5. **`cycle` and `population` publish at ≤ 10 Hz, by construction (M2, AR-29).** With the loop
   running, the thunk publishes every `cyclesPerPublish(genPerSec) = max(1, genPerSec / 10)` cycles
   — every cycle at 1–10 gen/sec, every second cycle at 20 (FD4). The publish is one `setCycle` +
   one `setPopulation` (React 19 batches them into one render, also inside a RAF callback). The
   population pass — one O(cells) sweep — runs **only** at publish time, never per cycle. A test at
   20 gen/sec asserts 40 cycles → 20 publishes and that `derivePopulation` (spied via
   `vi.mock(..., { spy: true })`) was called 20 times, not 40.

6. **`population` entries are pre-sorted with extinction flags (M2, FR-4.6).** `PopulationEntry =
   { organismId, name, colorToken, count, pct, extinct }` (spec §3.12). Order: living organisms by
   `count` descending, ties by roster order (stable), then every extinct organism (`count === 0`,
   `extinct: true`) in roster order. `pct = count / totalLiving * 100`, `0` when nothing lives. The
   derivation is a pure function `derivePopulation(stats, organisms)` in
   `apps/web/lib/battle/population.ts`, built on `computeEditorGridStats` (Story 2.12 — its header
   reserves exactly this call site), unit-tested on its own.

7. **`setSpeed` is a ref write (AR-34, FR-4.2).** `setSpeed(v)` writes `msPerCycleRef.current =
   1000 / v`, updates the publish divisor, and sets `genPerSec` state; the loop is neither stopped
   nor restarted (its `isRunning()` is unchanged across the call, and `scheduler.cancel` is not
   invoked). A test changes speed mid-run and asserts cadence changes on the next frame.

8. **`resizeLive` is ephemeral and paused-only (FR-4.9, Decision A.2/A.3).** Paused, it replaces
   both buffers — `front = resizeGrid(front, cols, rows)`, `back = createGrid(cols, rows)` — sets
   `liveSize`, and if a renderer is attached calls `renderer.resize(size)` then
   `renderer.drawFull(front)`. `initialGrid` is untouched; `stop()` returns to `initialGrid`'s
   size. Ages survive the resize (3.3 FD6 — `resizeGrid` carries `age`). Accepts `{ cols, rows }`;
   preset-ness is the control's contract (3.16), as `resizeGrid`'s own doc says of no-ops.

9. **`attachRenderer` keeps the hook DOM-free and tolerates any order (spec §3.10).** The hook
   imports no DOM type except through `GridRenderer`'s *type*; it never touches `document`,
   `window` or a canvas. `attachRenderer(renderer: PlaybackRenderer | null)` — `PlaybackRenderer =
   Pick<GridRenderer, 'drawDiff' | 'drawFull' | 'resize'>` — stores the renderer in a ref and, if
   the session exists, primes it with `drawFull(front)`; `null` detaches. The loop is built once
   per session with a **ref-forwarding** `StepRenderer` (`draw: (g) => rendererRef.current?.drawDiff(g)`)
   so attach/detach/re-attach never rebuild the loop (FD3). Both orders are tested: renderer attached
   before the session effect runs (a child's construction effect fires first — Trap 1) and after.
   With no renderer attached the simulation still steps (headless) — that is what the jsdom tests
   rely on, and what 4.15's preview does while its canvas is not mounted.

10. **The session is bound to `(initialGrid, organisms)` and the contract is written down.** The
    session effect depends on `[initialGrid, organisms]`: a new reference means a new run at cycle 0
    (equivalent to `stop()` with a new seed) and the same references across re-renders mean nothing
    happens — both tested. The hook's head comment states the consumer obligations 3.11 inherits:
    pass stable references (memoised), one `Organism` per roster slot in ref order, unmount the view
    to leave Run mode (RFC-005 Decision 4 — no live grid survives Run→Lab), and hand
    `onRendererReady` straight to `attachRenderer`. Unmount stops the loop, detaches the renderer
    and drops the session; no frame fires afterwards (tested with the fake scheduler's `pending()`).

11. **The seed is minted where the run starts, inside `[0, 2^32)` (deferred-work → 3.10).** Default
    `Math.floor(Math.random() * 2 ** 32)` per session and per `stop()`; `opts.seed` is validated to
    the same domain and a non-integer or out-of-range value throws naming the seed. Two runs with
    the same `opts.seed` over the same roster and grid produce identical grids after N cycles
    (RFC-008 Decision 4). The RNG-level enforcement in `createRng` / `createSeededRng` is
    **re-deferred with a reason** (FD7); the `deferred-work.md` entry is rewritten accordingly.

12. **Gates hold.** `npm run ci` exits 0: `packages/simulation` stays ≥ 90% per file with
    `cloneGrid` added (Task 1 ships its tests); `spec:check` resolves every cited ID;
    `bundle:check` is unchanged (no route imports the hook yet — Trap 9 says what 3.11 must expect);
    `bench:check` is unchanged (nothing here is on the benchmarked path). The `deferred-work.md`
    entries that name this story are closed or reassigned with a reason (Task 8).

## Tasks / Subtasks

- [x] **Task 1 — `cloneGrid` in `@gol/simulation`** (AC2; FD1)
  - [x] Add `cloneGrid(grid: Grid): Grid` to `packages/simulation/src/grid/grid.ts` beside
    `clearGrid`: `{ width, height, occupant: grid.occupant.slice(), age: grid.age.slice() }` —
    `.slice()` (a copy), never `.subarray()` (a view; `useUndoableGrid#snapshot` carries the same
    note). Head comment: RFC-005 Decision 4's "cloned from `initialGrid`" is the caller's step and
    this is the one place it is spelled; `resizeGrid(g, g.width, g.height)` happens to copy too but
    is documented as a resize and validates dimensions this grid already has. Cite AR-31, AR-17.
  - [x] Export from `src/index.ts` in the grid block. Tests in `grid.test.ts`: the clone is
    byte-equal; new buffers (`not.toBe` on both arrays and the wrapper); writing the clone leaves the
    source untouched; `age` is copied, not zeroed (a live grid at cycle N cloned for 4.15 keeps its
    ages — FR-5.6).

- [x] **Task 2 — `GenPerSec`, `msPerCycle`, `cyclesPerPublish`** (AC5, AC7; FD4)
  - [x] New `apps/web/lib/battle/simulationSpeed.ts`: `export type GenPerSec =
    Settings['defaultSpeed']` (derived from `@gol/domain`'s `SettingsSchema` — the FR-4.2/FR-8.12
    ladder has ONE source and it is the schema; do not write `1 | 2 | 5 | 10 | 20` again),
    `msPerCycle(genPerSec: GenPerSec): number` (`1000 / genPerSec`; Decision D.1),
    `cyclesPerPublish(genPerSec: GenPerSec): number` (`Math.max(1, genPerSec / 10)`; M2).
  - [x] Head comment: the ladder guarantees `50 ≤ ms ≤ 1000`, which the loop trusts and does not
    re-validate (3.8 Task 2); `cyclesPerPublish` is why the ≤ 10 Hz cadence needs no clock (FD4).
    Tests: the five ladder values map to 1000/500/200/100/50 ms and to 1/1/1/1/2 cycles per publish.

- [x] **Task 3 — The population derivation** (AC6)
  - [x] New `apps/web/lib/battle/population.ts`: `export interface PopulationEntry { organismId:
    string; name: string; colorToken: string; count: number; pct: number; extinct: boolean }` and
    `export function derivePopulation(grid: RenderableGrid, organisms: readonly Pick<Organism, 'id'
    | 'name' | 'colorToken'>[]): readonly PopulationEntry[]`. Body: `const stats =
    computeEditorGridStats(grid, organisms.map((o) => o.id))`; join `stats.perOrganism` to
    `organisms` **by id** (2.12 trap 1 — never by index; the stats de-duplicate ids); `totalLiving
    = stats.livingCells`; sort as AC6 says (copy then `sort` with a comparator that returns roster
    order on ties — `Array.prototype.sort` is stable, say so, and still tie-break explicitly so the
    test cannot pass by accident).
  - [x] Head comment at the call site `gridStats.ts` reserved ("Leave a comment at the call site
    (Story 3.14 / M2)"): this IS that call site; the cadence lives in the hook, the shape here.
    Cite M2, FR-4.6, AR-29. Note that `pct` sums to ≤ 100 (an out-of-range ref is in `livingCells`
    but in nobody's count — `gridStats.ts` trap 2) and that the engine can never produce one.
  - [x] Tests in `population.test.ts` with `@gol/test-utils` builders (`gridFromPattern`,
    `createMockOrganisms` or two `CONWAYS_CLASSIC` spreads with distinct ids/tokens): empty grid →
    every organism extinct, `pct` 0, roster order; two organisms → descending by count; a tie keeps
    roster order; an extinct organism sorts last even if it is first in the roster; `pct` values
    for a 3:1 split are 75/25; entries carry the organism's own `name`/`colorToken`, joined by id.

- [x] **Task 4 — The hook** (AC1–AC5, AC7–AC11; FD2, FD3, FD5, FD6)
  - [x] New `apps/web/lib/battle/useSimulation.ts` (`'use client'`, beside `useUndoableGrid.ts` —
    `components/battle/simulation/README.md` says so). Exports: `useSimulation`, `type
    UseSimulationOptions`, `type UseSimulationResult`, `type PlaybackRenderer`, `type
    SimulationStatus = 'paused' | 'playing'`. Re-export `type { PopulationEntry }` from
    `./population` and `type { GenPerSec }` from `./simulationSpeed` for consumers.
  - [x] **Session shape (module-private):** `interface SimulationSession { buffers: GridBuffers;
    deps: SimulationDeps; cycle: number; seed: number; loop: SimulationLoop }`. Built by a
    module-private `createSession(initialGrid, organisms, seed, scheduler, msPerCycleRef,
    rendererRef, onStep)`: `const session = compileSession(organisms)` (throws
    `RuleCompilationError` for a bad roster or rule — before the first cycle, M12; not caught here,
    Trap 5); `deps = { ...session, organisms, rng: createRng(seed) }` (the "cheapest shape",
    `threePhaseStep.ts`'s own words); `buffers = createGridBuffers(cloneGrid(initialGrid))`; the loop
    from `createSimulationLoop({ renderer: forwardingRenderer, step: thunk, msPerCycleRef,
    scheduler })`.
  - [x] **The step thunk** — ONE function, handed to the loop and called by `step()`: `buffers =
    stepGridBuffers(buffers, deps)` (never `activeStrategy` + `swapGridBuffers` inline —
    `deferred-work.md`'s 3-8 entry), `cycle += 1`, and return `buffers.front`. The publish decision
    sits in the thunk too: `if (cycle % cyclesPerPublish(genPerSecRef.current) === 0) publish()`.
    Manual `step()` calls the thunk, then `rendererRef.current?.drawDiff(front)` (the loop does its
    own `draw` after a step; outside the loop the hook repaints — same adapter, same method), then
    publishes unconditionally. Leave a one-line seam comment where 3.15 will add the per-cycle
    emptiness check — after the step, before the publish — and say why it cannot reuse the
    population pass (it runs only at publish cadence; an empty grid can be re-seeded by a
    `neighbors = 0` born rule, so the check must be per cycle).
  - [x] **Refs, never state, for:** `sessionRef: RefObject<SimulationSession | null>`,
    `rendererRef: RefObject<PlaybackRenderer | null>`, `msPerCycleRef: RefObject<number>`
    (initialised from `opts.genPerSec` — `useRef(msPerCycle(opts.genPerSec))`, and satisfies
    `ReadonlyRef<number>` structurally, `simulationLoop.ts`'s `ReadonlyRef` doc), `genPerSecRef`.
    **State, for:** `status`, `cycle`, `population`, `genPerSec`, `liveSize`. ❌ No ref read or
    write during render (`react-hooks/refs` is an error in `use*` functions — `useUndoableGrid`
    and `BattlePage` both record it); every ref access is inside an effect or a callback.
  - [x] **The session effect** `useEffect(() => { ... }, [initialGrid, organisms, opts.seed,
    opts.scheduler])`: build the session, store it, prime an already-attached renderer with
    `drawFull(front)`, reset `cycle`/`population`/`liveSize`/`status` via the publish helper.
    Cleanup: `loop.stop()`, `sessionRef.current = null`. ⚠️ `react-hooks/set-state-in-effect`:
    the initial publish from the effect is a cascading render the lint flags. Avoid it the way
    `useAsyncResource` does — hold `{ seedKey, cycle, population, liveSize, status }` in ONE state
    cell and reset it during render when `(initialGrid, organisms)` change identity (React's
    "adjusting state when a prop changes"), so the effect only builds refs and never sets state on
    mount. Say in the comment which of the two the file does; the test for AC10 covers both.
  - [x] `attachRenderer` (`useCallback`, stable): store; if `sessionRef.current` exists and the
    renderer is non-null, `drawFull(session.buffers.front)`. `play`/`pause`/`step`/`stop`/
    `setSpeed`/`resizeLive` per AC4/AC7/AC8, each `useCallback` with a stable identity (consumers
    put them in hotkey effects — 3.19 — and a new identity per render re-registers listeners).
    Calls before the session exists throw `Error('useSimulation: <op> called before mount')` —
    unreachable from a handler in practice (Trap 1), reachable from a test, and never a silent
    no-op.
  - [x] Return `useMemo`'d result so a consumer's `useEffect` on the result object does not re-run
    per publish unless a published value changed.
  - [x] Head comment: RFC-005 Decision 5 (hot in refs, throttled derived to React), AR-29, AR-31,
    AR-34, M2, Decision D, spec §4/§6, the consumer obligations (AC10), the forwarding renderer
    (FD3), `toStepRenderer`'s trap (a raw `GridRenderer` type-checks as the loop's port and paints
    nothing — `playbackRenderer.ts`), and the cadence-by-cycle argument (FD4). Cite `Story 3.8`,
    `Story 3.9`, `Story 3.11`, `Story 3.15`, `Story 4.15`.

- [x] **Task 5 — Production scheduler** (AC1, AC9)
  - [x] `apps/web/lib/battle/rafScheduler.ts`: `export const rafScheduler: FrameScheduler = {
    request: (cb) => window.requestAnimationFrame(cb), cancel: (h) =>
    window.cancelAnimationFrame(h) }` — arrow wrappers, not bare method references (an unbound
    `requestAnimationFrame` reference throws `Illegal invocation` in some browsers). Head comment
    cites `simulationLoop.ts`'s `FrameScheduler` doc (async callback; cancel of a fired handle is a
    no-op — both true of RAF). The hook defaults `opts.scheduler` to this. It is the ONLY file in
    the hook's import graph that names a DOM global; keep it so (AC9).
  - [x] Test: `rafScheduler.request` forwards to `window.requestAnimationFrame` (spy) and returns
    its handle; `cancel` forwards.

- [x] **Task 6 — Hook tests** (AC2–AC5, AC7–AC11)
  - [x] `apps/web/lib/battle/useSimulation.test.ts` — `renderHook` + `act` from
    `@testing-library/react` (the `useUndoableGrid.test.ts` shape; `.ts`, not `.tsx`). Harness:
    a **queue** fake scheduler with `frame(now)`, `pending()`, `cancelled` (copy
    `playbackRenderer.test.ts`'s and widen it to a queue — 3.8's review replaced a one-slot fake
    because a doubled chain was unobservable); a fake `PlaybackRenderer` recording `drawDiff` /
    `drawFull` / `resize` calls (a plain object — `PlaybackRenderer` is a `Pick`, which is why);
    roster = `[CONWAYS_CLASSIC]` and a two-organism variant (`{ ...CONWAYS_CLASSIC, id, colorToken,
    name }`); grids from `gridFromPattern` + `gridFromDense`; `opts.seed: FIXED_SEED`. Frames step
    with explicit timestamps: `frame(0)` primes, `frame(100)` at 10 gen/sec is one cycle.
  - [x] Cover, each its own `it`: AC2 (`initialGrid` byte-identical after 10 cycles; the clone is
    not `initialGrid`); AC3 (render count == publishes + mount renders at 20 gen/sec over 40
    cycles; `vi.mock('./population', { spy: true })` and count `derivePopulation` calls: 20); AC4
    (`play` twice → `pending() === 1`; `pause` publishes the exact cycle; `step` advances exactly 1
    and publishes; `stop` → cycle 0, `population` recomputed over the re-cloned initial grid, one
    `drawFull`, a NEW seed — assert via a `Math.random` spy, never via unseeded outcomes);
    `step`/`resizeLive` while playing throw; AC5 (cadence per speed); AC6 through the hook once
    (entries sorted, blinker → counts 3/3/3...); AC7 (`setSpeed` mid-run: `isRunning` unchanged,
    `cancelled` unchanged, next-frame cadence at the new `ms`); AC8 (resize while paused → new
    dims, ages kept, `resize` then `drawFull` on the renderer; `stop` restores `initialGrid`'s
    dims); AC9 (attach before the effect: use a probe component whose child effect calls
    `attachRenderer` — or call `attachRenderer` inside `renderHook`'s callback's own `useEffect`
    declared BEFORE the hook — and assert one `drawFull`; attach after: same; detach with `null` →
    subsequent steps call nothing; headless stepping with no renderer at all); AC10 (same
    references across `rerender` → cycle preserved; new `initialGrid` → cycle 0 and the old loop
    cancelled; unmount → `pending() === 0` and `cancelled` incremented); AC11 (two hooks with the
    same seed agree after 20 cycles on a roster with tie-breaks — two organisms adjacent with equal
    dominance; `opts.seed: -1` and `2 ** 32` and `1.5` throw).
  - [x] Determinism: every engine-driven assertion uses `FIXED_SEED` (RFC-008 Decision 4). No
    `vi.useFakeTimers` — the scheduler is injected, the same fact 3.8 AC8 relies on.

- [x] **Task 7 — `component-tree` conformance notes and the `PetriDishCanvas` comment** (AC9)
  - [x] Do NOT add the `'playback'` variant (3.11). Do update the one-line trailer in
    `apps/web/components/PetriDishCanvas.tsx` — `// 'playback' (3.11) joins this union next.` — to
    name the seam this story fixed: `onRendererReady(r)` → `useSimulation.attachRenderer(r)`, and
    the cleanup → `attachRenderer(null)`. One line; nothing else in that file.

- [x] **Task 8 — Bookkeeping** (AC12)
  - [x] `deferred-work.md`: (1) the 3-6 seed-domain entry — close the hook-level half (mint +
    validation at the run boundary, this story) and re-defer the RNG-level enforcement per FD7,
    with the reason; (2) the 3-9 entry "Story 3.10 must hand the loop `toStepRenderer(...)`" —
    close with what shipped (a ref-forwarding `StepRenderer` over `drawDiff`, FD3) and why the
    bound form was not usable (the renderer arrives after the loop is built and can be swapped);
    (3) add a "Deferred from: Story 3-10" section with: the bundle warning for 3.11 (Trap 9) and
    the `component-tree-battle-page.md` §4/§3.11 amendment candidates (FD6, the `organisms` type,
    `attachRenderer(null)`, `resizeLive({ cols, rows })`) — candidates only, the planning artifact
    is not edited (M14/M15 precedent, Sidiar's call).
  - [x] `npm run ci > /tmp/ci-3-10.log 2>&1; echo $?` — never pipe to `tail`. Record the exit code,
    the `@gol/simulation` per-file coverage line for `grid.ts`, `bundle:check` headroom (expected
    unchanged: 4.1 KB gzip on `/battle`), `bench:check` (unchanged), and the e2e count in the Dev
    Agent Record.

## Dev Notes

### Constraints the developer MUST follow

- **Scope: the hook, its three pure helpers, `cloneGrid`, the RAF scheduler, tests, docs.** No
  component (`<BattleSimulationView>`, `'playback'` variant, `onRendererReady`, transport bar) —
  3.11/3.12. No slider — 3.13. No `<PopulationStats>` — 3.14. No extinction check — 3.15 (seam
  only). No fullscreen — 3.18. No hotkeys — 3.19. Nothing in `packages/simulation` beyond
  `cloneGrid`.
- **Hot simulation state never touches React state (RFC-005 Decision 5, AR-29).** Buffers, deps,
  loop, cycle counter, `msPerCycle`, renderer: refs. Only `cycle`, `population`, `status`,
  `genPerSec`, `liveSize` are state, and the first two change only at publish. A `setState` per
  cycle is the failure NFR-1.1 names.
- **Never read or write a ref during render** — `react-hooks/refs` (eslint-plugin-react-hooks
  7.1.1, an error inside `use*`). Lazy "if null then init" is still a read during render; do the
  init in the effect. `react-hooks/set-state-in-effect` and `exhaustive-deps` are active too —
  `useAsyncResource.ts` and `useUndoableGrid.ts` show the sanctioned shapes.
- **Repositories are irrelevant here and must stay so.** The hook receives grids and organisms; it
  never imports `@gol/persistence` or a repository (AR-2/AR-27).
- **`apps/web` rules:** strict TS, no `any`/`!`/`@ts-ignore`; `export type` for types; camelCase
  filenames; `@gol/*` by package name; `@gol/test-utils` only from `*.test.ts`; no raw colour
  literals (AR-46). No coverage gate in `apps/web` — the tests exist because the ACs need them.
  **`packages/simulation` rules** for Task 1: no DOM, no classes, per-file ≥ 90%.
- **Comments explain WHY and cite by ID.** `spec:check` reads this file too: spell `AR-29`, `M2`,
  `Decision D`, `FR-4.5`, `Story 3.11` exactly; `AR29` and `M-2` are silently exempt forever.

### What this story is, in one paragraph

Story 3.8 built a driver that turns time into `step()` calls and deliberately owns nothing else;
3.9 built the repaint that driver needs and the adapter that makes a raw `GridRenderer` impossible
to hand it by accident; 3.4–3.7 built a compile step whose output spreads straight into
`SimulationDeps`. Every "who owns" question those stories deferred lands here: the buffers live in
this hook's ref (3.8 FD2), the cycle counter belongs to the thunk's owner because manual Step
bypasses the loop (`threePhaseStep.ts`), the seed is minted where the run starts (`rng.ts`), and
the population is a derived view at publish cadence, never engine state (M2). The hook is the only
place React and the engine meet, and everything below it stays React-free (spec §6's one-line
invariant). What is new — not composition — is three decisions with downstream consumers: how the
publish cadence is derived without a clock (FD4), how a renderer that arrives after the loop is
built reaches it (FD3), and what the session is keyed on so 3.11 can mount, remount and key the
run view without surprises (AC10).

### Forced decisions (record the option taken and why in the Dev Agent Record)

**FD1 — Where the clone lives.**
- **(a) `cloneGrid` in `packages/simulation/src/grid/grid.ts`** *(recommended)*. The type's owner;
  4.15's preview needs the same copy; one place `.slice()`-not-`.subarray()` is written for a
  `Grid`. Cost: one exported function under the per-file gate — four tests.
- **(b) Inline `{ ...grid, occupant: grid.occupant.slice(), age: grid.age.slice() }` in the hook.**
  Works, and 4.15 writes it again; the second copy is where someone types `subarray`.
- **(c) `resizeGrid(grid, grid.width, grid.height)`.** Copies both buffers correctly but reads as a
  resize, re-validates dimensions, and its doc would need a "also a clone" clause — a contract by
  side effect.

**FD2 — When the session is built and what keys it.**
- **(a) In an effect keyed on `[initialGrid, organisms, opts.seed, opts.scheduler]`; handlers
  throw if called first** *(recommended)*. Honest with `exhaustive-deps`; a new reference is a
  restart, which is also what a caller *means* by handing a new initial grid; `react-hooks/refs`
  is never in play because nothing initialises during render. Consequence: 3.11 must pass stable
  references (state or `useMemo`) — an `organisms` array rebuilt per render resets the run every
  render, silently. AC10's test and the head comment carry the obligation.
- **(b) Lazy `useState(() => createSession(...))`.** Available from the first render, no ordering
  question — and a buffer holder in React state, the one thing RFC-005 Decision 5 says never to
  do; the reviewer's one-line invariant fails on inspection.
- **(c) Lazy ref init during render (`if (ref.current === null) ...`).** A ref read during render
  — lint error under `react-hooks/refs` 7.x, and the repo has already routed around it twice.

**FD3 — How the renderer reaches a loop built before it arrives.**
- **(a) A forwarding `StepRenderer` — `draw: (g) => rendererRef.current?.drawDiff(g)` — built once
  per session** *(recommended)*. Attach, detach and re-attach (3.16's canvas rebuild on `size`,
  3.18's fullscreen re-layout) never touch the loop; a missing renderer drops the paint and keeps
  stepping (headless — the jsdom tests and 4.15's unmounted preview both need this). Cost:
  `toStepRenderer(gridRenderer)` is not called literally; the intent it encodes — `drawDiff`, never
  `draw` — is, and the comment says so where `deferred-work.md` looks for it.
- **(b) Rebuild the loop on each `attachRenderer` with `toStepRenderer(renderer)`.** Literal
  compliance; a `stop()`/`start()` mid-run on every canvas rebuild, the accumulator lost, and a
  running loop stopped by a layout change.
- **(c) `toStepRenderer({ drawDiff: (g) => rendererRef.current?.drawDiff(g) })`.** Same as (a)
  through the adapter — fine if you prefer the grep hit; it is one indirection more for the same
  object.

**FD4 — How the ≤ 10 Hz publish is derived.**
- **(a) By cycle count: publish every `max(1, genPerSec / 10)` cycles** *(recommended)*. Speed is
  a ladder (Decision D.1), so the divisor is 1 everywhere except 2 at 20 gen/sec; cycles are ≤ 1
  per frame (D.2), so the bound holds under any frame rate; no clock, no `performance.now()`, fully
  deterministic under the fake scheduler. Manual Step, `pause`, `stop` publish unconditionally so
  the displayed cycle is never stale while paused.
- **(b) By wall clock: publish when `now - lastPublish ≥ 100 ms`.** The literal M2 reading; needs
  a timestamp the thunk does not receive (the loop's `step` is `() => Grid`) or `performance.now()`
  in the hook, which forces fake timers into every test and couples cadence to the machine.
- **(c) Publish every cycle.** 20 renders/s at 20 gen/sec — inside NFR-1.1's budget on paper and
  exactly the "cheap per-cycle setState" habit RFC-005 Risk 1 exists to prevent.

**FD5 — `step()` / `resizeLive()` while playing.**
- **(a) Throw** *(recommended)*. Both are paused-only by FR (FR-4.3 via 3.12's disabled Step,
  FR-4.9 explicitly); the controls disable on `status`, so a call while playing is a bug in a
  consumer, and the repo's rule for bugs is loud (`stepGridBuffers`, `gridFromDense`).
- **(b) Silent no-op.** The failure class every 3.x story has been written against.
- **(c) `step()` while playing pauses first, then steps.** Friendlier, but it changes 3.12's
  contract ("Step is disabled during playback") from inside a hook.

**FD6 — Return-shape additions: `genPerSec` and `liveSize`.**
- **(a) Add both** *(recommended)*. The hook is the only holder of `msPerCycle` and of the live
  buffers' dimensions; without them 3.13's slider and 3.16's control mirror state that can drift
  from the ref. Both change only on user action — no cadence concern. Flagged as a §4 deviation
  (Task 8).
- **(b) Spec shape only; consumers keep their own copies.** Two sources of truth for the
  simulation's speed and size, one of them inside a ref nobody can read.

**FD7 — Seed-domain enforcement (`deferred-work.md` → 3.10).**
- **(a) Validate at the run boundary (hook `opts.seed` + the mint) and re-defer the RNG-level
  check** *(recommended)*. `rng.ts` itself says the policy is "decided where a run is started";
  every production seed now passes through one site; `createSeededRng`'s negative-seed contract
  (`seededRng.test.ts`) is untouched, so no cross-package contract moves. Re-defer with the
  reason: enforce in both RNG copies together when a second production mint site appears.
- **(b) Enforce in `createRng` and `createSeededRng` now.** Correct, and it flips a test-utils
  test plus the differential pin; a two-package contract change riding in a hook story.

### Traps

1. **Child effects run before parent effects.** `<PetriDishCanvas>`'s construction effect (which
   3.11's playback variant will make call `onRendererReady`) fires before `<BattleSimulationView>`'s
   session effect. `attachRenderer` therefore arrives with `sessionRef.current === null` — store
   the renderer, prime later. The session effect must check for an already-attached renderer and
   prime it. Test both orders (AC9).
2. **A raw `GridRenderer` is the loop's port and paints nothing.** `draw` is the marks-only Edit
   path (2.3); playback is `drawDiff` (3.9). The forwarding renderer calls `drawDiff`; the manual
   `step()` path calls `drawDiff` too. Never `draw`, never `markDirty`.
3. **`createGridBuffers(front)` takes `front` by reference.** Pass the clone, never `initialGrid`
   — after one swap the grid handed in is `back`, the scratch buffer, and the persisted dish is
   overwritten from cycle 2 with nothing logged. AC2's byte-identity test is the tripwire.
4. **`stepGridBuffers` returns a NEW pair; store the return value.** `stepGridBuffers(buffers,
   deps)` without `buffers =` is the forgotten-swap freeze (front never advances). And `back`'s
   contents are meaningless between cycles — never read `buffers.back`.
5. **`compileSession` throws for a duplicate id, an empty id, > 255 organisms, or a malformed
   rule — before the first cycle.** Do not catch it in the hook: the roster comes from a
   schema-validated battle and the library, so these are unreachable in normal use, and swallowing
   them would make a run that "does nothing". It propagates from the session effect to the nearest
   error boundary — there is none under `(battle)` today (`deferred-work.md`, 4-1 review entry);
   3.11 decides whether Run mode gets one. Say this in the head comment.
6. **React 19 StrictMode double-invokes effects in dev.** The session effect runs, cleans up, runs
   again: two `compileSession`s, two seeds, one live session. Cleanup must fully stop the loop and
   null the ref, or the first loop keeps stepping a dropped session. The unmount test covers the
   single case; the StrictMode case follows if cleanup is complete.
7. **`Uint16Array` `age` is carried by `cloneGrid` and `resizeGrid`.** A "clone" that allocates a
   fresh zeroed `age` breaks nothing today (initial grids are age-zero) and breaks 4.15 and any
   future mid-run clone. Task 1's test pins the copy.
8. **`organisms.map((o) => o.id)` must be the same order `compileSession` interned.** The stats
   pass (`computeEditorGridStats`) and the population join use it; the engine's refs index it;
   `buildRefToFillGroup` (3.11's palette) will be built from the same array. One array, one order —
   3.9's AC7 negative twin is the test shape if you doubt it.
9. **`/battle` has 4.1 KB gzip headroom and the engine is not in it yet.** This story adds no
   route import, so `bundle:check` is unchanged. **3.11 will import the hook and therefore
   `compileSession`, `threePhaseStep`, the loop — the whole engine — into `/battle`.** That is
   almost certainly more than 4.1 KB. Record it in `deferred-work.md` so 3.11 plans a gate
   conversation (Sidiar's ratchet rule: change the mechanism, not the threshold) rather than
   discovering it at `npm run ci`.
10. **`react-hooks/exhaustive-deps` on the session effect.** The effect reads `initialGrid`,
    `organisms`, `opts.seed`, `opts.scheduler`, `opts.genPerSec`(?). Do NOT read `opts.genPerSec`
    inside it — the initial speed seeds the ref via `useRef(msPerCycle(opts.genPerSec))` and later
    changes go through `setSpeed`; a `genPerSec` dep would restart the run on every slider move.
11. **Two `setState`s per publish are one render** — React 19 batches updates from any context,
    including a RAF callback. Do not merge `cycle` and `population` into one object "to save a
    render"; do keep them separate so 3.14's cycle counter can subscribe to an int.
12. **`Math.random` in the mint, nowhere else.** The RNG for tie-breaks is `createRng(seed)`;
    tests inject `opts.seed`. A test that observes "a fresh seed on `stop()`" spies `Math.random`,
    it does not assert on unseeded outcomes (project-context "Determinism is a precondition").
13. **`spec:check` reads this file.** `Decision A.2` as a token is fine; `AR-29's` is fine;
    `FR4.5` is not an ID and is silently exempt.

### Spec-conflict flags (project-context: surface new conflicts, don't silently pick one)

- **`component-tree-battle-page.md` §5: "`useSimulation` receives compiled evaluators +
  `activeStrategy` via `createSimulation(organisms, rng)`".** No such function; Stories 3.4–3.8
  shipped `compileSession` + `{ ...session, organisms, rng }` + `stepGridBuffers`. Already the
  settled shape (M15's `SimulationDeps`); recorded here because this is the first consumer.
- **§3.11 `organisms: OrganismRuntime[] // dense array w/ dominance, agingEnabled, compiled
  rules`** vs the shipped `OrganismRuntime = { dominance }` (3.6 FD2 — `agingEnabled` is a render
  input and the engine must not see it). The hook takes domain `Organism[]`; the name `OrganismRuntime`
  is not reused for a different shape. Candidate amendment recorded (Task 8).
- **§4 `attachRenderer(r: GridRenderer)`** → `PlaybackRenderer | null` (Pick + detach). **§4
  `resizeLive(p: GridPreset)`** → `{ cols, rows }` (no `GridPreset` type exists; the four-preset
  model is 3.16's control). **§4 return** gains `genPerSec`, `liveSize` (FD6). Candidates recorded.
- **RFC-005 Decision 5's snippet** cancels RAF from `pause()`, holds `useRef<Grid>()` (not a
  pair), and implies `population` is computed "at ≤ 10 Hz" by clock. All illustrative: the loop
  owns RAF (3.8), the pair is `GridBuffers`, and the cadence is by cycle (FD4). No RFC edit.
- **RFC-005 Decision 5 / spec §4: "Auto-pauses on extinction"** is listed under the hook; the
  epics assign it to Story 3.15. This story leaves the seam (Task 4) and builds no check.
- **`architecture.md` Runtime Architecture step 3 (`:127`) still says "(organism, ageShade)"** —
  already flagged by 3.9; not re-recorded.

### What NOT to build

- ❌ No `'playback'` variant, no `onRendererReady`, no `<BattleSimulationView>` (Story 3.11).
- ❌ No extinction check, no auto-pause (Story 3.15, Decision B.5) — a seam comment only.
- ❌ No `useSimulationHotkeys`, no key handling (Story 3.19).
- ❌ No `<PopulationStats>`, `<CycleCounter>`, `<SpeedControl>`, `<GridSizeControl>` (3.12–3.16).
- ❌ No preset validation in `resizeLive` (3.16's control), no `GridPreset` type invented here.
- ❌ No change to `createRng` / `createSeededRng` (FD7 (a)); no `Math.random` outside the mint.
- ❌ No `performance.now()`, no `Date.now()`, no `setTimeout`, no `vi.useFakeTimers` (FD4).
- ❌ No `useState` holding a grid, a buffer pair, deps or the loop (RFC-005 Decision 5).
- ❌ No change to `toStepRenderer`, `drawDiff`, the loop, `stepGridBuffers` or the strategy.
- ❌ No `@gol/test-utils` additions; the fake scheduler stays local to the test file (3.8 FD5).
- ❌ No edit to `component-tree-battle-page.md`, `architecture.md` or any RFC — candidates to
  `deferred-work.md`.
- ❌ No bundle-budget change, no bench change.

### Testing standards summary

- Vitest 4 in `apps/web` (jsdom, `vitest.setup.ts` registers `cleanup`; no coverage gate).
  `renderHook`/`act`/`rerender` from `@testing-library/react` 16. `@gol/test-utils` for grids and
  organisms (`gridFromPattern`, `emptyGrid`, `CONWAYS_CLASSIC`, `FIXED_SEED`, `createMockOrganisms`)
  — no hand-rolled grid literals. `packages/simulation` for Task 1: node env, per-file ≥ 90%.
- The fake scheduler is a queue with explicit timestamps (3.8 AC10's harness, widened per its
  review); every cadence assertion is a count, every determinism assertion runs under
  `FIXED_SEED`. The fake renderer is a recording object satisfying `PlaybackRenderer`; nothing here
  constructs a real `GridRenderer` (jsdom has no canvas — 3.7 FD2) and nothing asserts pixels.
- Verification before "done": `npm run ci > /tmp/ci-3-10.log 2>&1; echo $?`. Report the real exit
  code, the per-file coverage line for `grid.ts`, `bundle:check` headroom and the e2e count.

### Previous story intelligence (3.8, 3.9) and recent git

- **3.9 shipped the adapter and named this story's obligation twice** (`playbackRenderer.ts`,
  `deferred-work.md`): hand the loop `drawDiff`, never `draw`. FD3 honours the substance and
  records why the literal `toStepRenderer(gridRenderer)` is not the shape (the renderer is late and
  replaceable). 3.9's review culture — every test made to fail under the mutation it guards, every
  forward-reference comment checked for truth — applies to Task 6: the AC3 render-count test must
  fail if a `setState` is added to the thunk; the AC2 test must fail if `initialGrid` is paired
  directly.
- **3.8 FD2/FD4** are what this story composes: the thunk owns the counter; the first frame after
  `start()` primes and never steps (so `frame(0); frame(100)` is one cycle at 10 gen/sec — the
  harness in `playbackRenderer.test.ts` shows it). 3.8's review found the one-slot fake scheduler
  hid a doubled chain — use a queue.
- **3.8 What-NOT-to-build** left a `stepOnce()` off the loop: manual Step is the thunk + a repaint,
  composed here (Task 4). If 3.12 wants the pair on the loop it says so then.
- **Git:** stories run on `story/*` branches merged by PR (#26 3.8, #29 3.9), with `fix: review
  findings (story N.M)` after the feature commit and `docs:` follow-ups. Lane 4 is open in another
  worktree (4-2 merged 2026-09-14, 4-3 next); `sprint-status.yaml` diffs from that lane must not
  ride into this story's commit (3.8's review reverted exactly that).

### External dependencies / versions

None new. React 19.2.7 (`RefObject<T>` is `{ current: T }` — satisfies `ReadonlyRef` with no
adapter; automatic batching everywhere), `@testing-library/react` 16.3.2 (`renderHook`),
eslint-plugin-react-hooks 7.1.1 (`refs`, `set-state-in-effect`, `exhaustive-deps`), Vitest 4,
fast-check as installed (optional: a property "for any ladder speed and any frame sequence, publishes
≤ cycles / cyclesPerPublish + 1" is cheap if it stays under 25 lines). `requestAnimationFrame`
callbacks receive a `DOMHighResTimeStamp`; the loop takes `now: number` from the scheduler only.

## Project Structure Notes

- New: `packages/simulation/src/grid/grid.ts` (`cloneGrid` — modified), `apps/web/lib/battle/
  useSimulation.ts` (+ `.test.ts`), `population.ts` (+ `.test.ts`), `simulationSpeed.ts`
  (+ `.test.ts`), `rafScheduler.ts` (+ `.test.ts`).
- Modified: `packages/simulation/src/index.ts` (export), `packages/simulation/src/grid/grid.test.ts`,
  `apps/web/components/PetriDishCanvas.tsx` (one trailer comment), `deferred-work.md`,
  `sprint-status.yaml`.
- Not touched: `apps/web/components/battle/**`, `apps/web/lib/canvas/**`, `@gol/test-utils`,
  `@gol/domain`, `@gol/persistence`, `tsconfig.*`, `eslint.config.mjs`, any planning artifact.
- Naming: `useSimulation` beside `useUndoableGrid`/`useDirtyGuard`; `derivePopulation` mirrors
  `computeEditorGridStats`; `cloneGrid` beside `clearGrid`/`createGrid`; `rafScheduler` is a
  value, camelCase.

## References

- `docs/planning-artifacts/epics.md#Story 3.10` — the four clauses; 3.11–3.19 and 4.15 for what
  consumes the surface.
- `docs/planning-artifacts/architecture.md` — Decision D (D.1 ladder, D.2 ≤ 1 step/frame, D.3
  ref-read speed), Decision A.2/A.3 (ephemeral resize, top-left), Decision B.5 (extinction-only —
  3.15's, seam here), M2 (population cadence), M3 (second instance), M12 (compile-time sweep),
  M13/M14/M15 (roster indexing, deps shape); Runtime Architecture steps 2–6; AR-29, AR-31, AR-32,
  AR-34, AR-24, AR-17, AR-18, AR-16, AR-41.
- `docs/planning-artifacts/rfcs/RFC-005-application-state-modes-undo.md` — Decision 4 (dual grid,
  the table), Decision 5 (hook contract, snippet illustrative), Risk 1.
- `docs/planning-artifacts/rfcs/RFC-004-simulation-rules-engine.md` §3.1 (`SimulationDeps`),
  §3.4 (`Grid`, `resizeGrid`), §3.5 (session-scoped compile).
- `docs/planning-artifacts/rfcs/RFC-002-grid-rendering-technology.md` §5 (loop prose).
- `docs/planning-artifacts/component-tree-battle-page.md` §3.10 (`onRendererReady`), §3.11 (the
  only consumer), §3.12 (`PopulationEntry` shape), §4 (`useSimulation` return), §5, §6 (matrix +
  invariant), §8.
- `docs/planning-artifacts/prds/prd-GameOfLife-2026-05-26/prd.md` FR-4.1–FR-4.9, FR-8.12, FR-5.6,
  FR-2.4, NFR-1.1.
- `packages/simulation/src/loop/simulationLoop.ts` (ports, head comment), `stepGridBuffers.ts`,
  `grid/doubleBuffer.ts` (`createGridBuffers` warning), `grid/resizeGrid.ts`, `grid/grid.ts`,
  `session/compileEvaluators.ts` (`CompilableOrganism`, `CompiledSession`, throws),
  `session/internOrganisms.ts` (throw cases), `strategy/threePhaseStep.ts` (`SimulationDeps`, the
  "cheapest shape" note, no-population note), `strategy/rng.ts` (seed policy).
- `apps/web/lib/canvas/playbackRenderer.ts` (+ test — the loop-wiring worked example),
  `gridRenderer.ts` (`drawDiff`, `drawFull`, `resize` contracts), `apps/web/lib/battle/gridStats.ts`
  (the reserved call site), `useUndoableGrid.ts` / `useAsyncResource.ts` (lint-shaped hook
  patterns), `apps/web/components/PetriDishCanvas.tsx` (construction effect, cleanup),
  `apps/web/components/battle/simulation/README.md` (where the hook lives).
- `packages/domain/src/settingsSchema.ts` (`defaultSpeed` ladder — the `GenPerSec` source).
- `docs/implementation-artifacts/3-8-simulationloop.md` (FD2, FD4, FD5, Traps, What NOT to
  build), `3-9-colour-state-batch-rendering.md` (Trap 1/2, deferred entries), `deferred-work.md`
  (seed-domain entry ~L490; 3-9 section; 3-8 section `stepGridBuffers` note; 4-1 review's
  error-boundary note).
- `docs/project-context.md` — hot state in refs; no DOM in `packages/*`; determinism; never
  batch by organism; `spec:check` spelling; commit gate; bundle ratchet.

## Dev Agent Record

### Agent Model Used

Claude Opus 5 (`claude-opus-5`), via `bmad-dev-story` under `implement-next-story --epic 3`.

### Debug Log References

- `npm run ci > /tmp/ci-3-10.log 2>&1; echo $?` → **exit 0** (2026-09-14).
  - typecheck / lint / format:check / spec:check (225 ids resolve) / boundary:check: green. Lint's one
    warning is pre-existing (`BattleGallery.tsx:248`, untouched).
  - `@gol/simulation` coverage: `grid.ts | 100 | 100 | 100 | 100` (package stays 100% every file).
    `@gol/domain` 100%, `@gol/persistence` 99.19%, `@gol/test-utils` 94.44%, `web` 95.87% (no gate).
  - Tests: simulation 23 files / 397 tests; web 73 files (37 in `useSimulation.test.ts`, 7 in
    `population.test.ts`, 4 in `simulationSpeed.test.ts`, 2 in `rafScheduler.test.ts`).
  - `bundle:check`: `/battle` 306.2 KB gzip, **3.8 KB headroom — unchanged** (the story text's
    "4.1 KB" predates the 4-2 merge; no route imports the hook). `/` 9.1 KB, `/battle/new` 3.9 KB,
    `/organisms` 11.5 KB.
  - `bench:check`: 8.388 ms headroom (50.3% of the frame) against 16.667 ms — unchanged; nothing
    here is on the benchmarked path.
  - e2e: **380 passed** (2.5 m).
- Mutation checks (3.9's review culture), each run then reverted: publish-every-cycle in the thunk
  → 5 tests fail (AC3 render count, AC5 call counts, pause exact-cycle, divisor update); pairing
  `initialGrid` directly instead of `cloneGrid` → both AC2 tests fail; forwarding renderer calling
  `drawFull` instead of `drawDiff` → 3 tests fail. The tests guard what they claim to.
- First test run failed 23/37 with "Too many re-renders": the tests built `blinker()` inline in the
  `renderHook` callback — a new `initialGrid` reference per render, exactly the unstable-reference
  hazard the head comment states for 3.11. Fixed in the tests (a `mount()` helper over hoisted
  references); the hook was right. Worth knowing for 3.11: the failure mode is a hard crash, not
  a slow loop.

### Completion Notes List

- **Task 1** — `cloneGrid` in `packages/simulation/src/grid/grid.ts`, exported from the barrel's
  grid block; four tests (byte-equal; new wrapper + buffers + distinct `ArrayBuffer`s; source
  untouched after writes; `age` carried).
- **Task 2** — `simulationSpeed.ts`: `GenPerSec = Settings['defaultSpeed']` (schema-derived),
  `msPerCycle`, `cyclesPerPublish`; tests pin 1000/500/200/100/50 ms and 1/1/1/1/2.
- **Task 3** — `population.ts`: `PopulationEntry`, `derivePopulation(grid, organisms)` over
  `computeEditorGridStats`, joined by id, sorted living-by-count-desc → roster tie → extinct in
  roster order, with the explicit tie-break comparator; seven tests including the by-id join.
- **Task 4** — `useSimulation.ts`. Refs: session (buffers + deps + cycle + seed + loop + the one
  step thunk), renderer, `msPerCycle`, `genPerSec`. State: one `RunView` cell `{ key, status,
  cycle, population, liveSize }` + `genPerSec`. The view resets **during render** when the key
  `(initialGrid, organisms, opts.seed, opts.scheduler)` changes identity (Task 4's option (b); the
  session effect never sets state). The thunk steps, counts, and publishes on cadence; manual
  `step()` calls it, repaints via `drawDiff`, publishes unconditionally. `stop()` rebuilds buffers
  and deps (same compiled evaluators, fresh `createRng`), undoes an ephemeral resize on the renderer
  before `drawFull`. `step`/`resizeLive` while running throw; every session-needing handler throws
  before mount. `setSpeed` needs no session (a ref write) and does not throw — deliberate, the
  only handler that can be called at any time. Result is `useMemo`'d.
- **Task 5** — `rafScheduler.ts` (arrow wrappers over `window.requestAnimationFrame` /
  `cancelAnimationFrame`); two spy tests.
- **Task 6** — 37 tests across AC1–AC11 with a queue fake scheduler (`frame`/`pending`/`cancelled`),
  a recording `PlaybackRenderer`, `FIXED_SEED` everywhere, no fake timers. The AC9 "attach before
  the session effect" case uses a `Probe` → `Child` pair via `createElement` (child effects run
  first) rather than a ref write during render, which `react-hooks/refs` would flag. AC11's
  tie-break roster is two equal-Dominance Conway organisms whose blinkers both claim `(3, 1)`; a
  companion test proves the cell is actually contested so the same-seed equality is not vacuous.
- **Task 7** — `PetriDishCanvas.tsx` trailer names the seam (`onRendererReady(r)` →
  `attachRenderer(r)`, cleanup → `attachRenderer(null)`). Nothing else in the file.
- **Task 8** — `deferred-work.md`: 3-6 seed entry closed at the hook level and re-deferred at the
  RNG level with FD7's reason; 3-9 `toStepRenderer` entry closed with what shipped (FD3) and why
  the bound form was unusable; new "Deferred from: Story 3-10" section (bundle warning for 3.11
  at the real 3.8 KB headroom; four §4/§3.11 amendment candidates + the §5 `createSimulation`
  ghost; `stop()` mints even under `opts.seed`).
- A per-cycle **redundant sweep on cadence-aligned manual steps**: `step()` publishes
  unconditionally after the thunk, which may already have published on that cycle. Two `setView`s
  batch into one render; the cost is one extra O(cells) sweep on a human click. Chosen over a
  duplicated "is a publish due" condition in two places.

### Forced Decisions

- **FD1 (a)** — `cloneGrid` in `packages/simulation`. The type's owner; 4.15 reuses it; one place
  `.slice()`-not-`.subarray()` is written for a `Grid`.
- **FD2 (a)** — session built in an effect keyed on `[initialGrid, organisms, opts.seed,
  opts.scheduler, publish]`; handlers throw before mount. The view resets during render off a key
  held in state (the `useAsyncResource` / `useUndoableGrid` shape), so no ref is read during render
  and no state is set in the effect.
- **FD3 (a)** — ref-forwarding `StepRenderer` built once per session, forwarding to `drawDiff`.
  `toStepRenderer` is not called; the intent it encodes is, and the deferred-work entry says so.
- **FD4 (a)** — publish by cycle count, `cyclesPerPublish(genPerSecRef.current)`, read live so
  `setSpeed` changes the divisor on the next step.
- **FD5 (a)** — `step()` / `resizeLive()` throw while `loop.isRunning()` (the loop's truth, not
  React state, which can be a render behind).
- **FD6 (a)** — `genPerSec` and `liveSize` on the result; recorded as §4 candidates (Task 8).
- **FD7 (a)** — seed validated at the run boundary (`assertSeedDomain` on both the mint and
  `opts.seed`); RNG-level enforcement re-deferred with the reason.

### Spec-conflict flags raised

None new beyond those the story pre-recorded; all are carried to `deferred-work.md` as
amendment candidates (no planning artifact edited): §5 `createSimulation`, §3.11 `OrganismRuntime`
shape, §4 `attachRenderer` / `resizeLive` signatures and the two extra return members, RFC-005
Decision 5's illustrative snippet (RAF in `pause()`, single `useRef<Grid>`, clock-based cadence),
and "auto-pauses on extinction" listed under the hook but assigned to Story 3.15.

One design note that is not a conflict but is worth a reviewer's eye: `stop()` mints a fresh seed
**even when `opts.seed` is set**. AC4's test asserts the mint via a `Math.random` spy while the
harness passes `FIXED_SEED`, so the two can only both hold if `stop()` mints unconditionally.
Recorded in `deferred-work.md` in case a consumer ever needs a seed-stable Stop.

### File List

- `packages/simulation/src/grid/grid.ts` (modified — `cloneGrid`)
- `packages/simulation/src/grid/grid.test.ts` (modified — 4 tests)
- `packages/simulation/src/index.ts` (modified — export)
- `apps/web/lib/battle/simulationSpeed.ts` (new)
- `apps/web/lib/battle/simulationSpeed.test.ts` (new)
- `apps/web/lib/battle/population.ts` (new)
- `apps/web/lib/battle/population.test.ts` (new)
- `apps/web/lib/battle/rafScheduler.ts` (new)
- `apps/web/lib/battle/rafScheduler.test.ts` (new)
- `apps/web/lib/battle/useSimulation.ts` (new)
- `apps/web/lib/battle/useSimulation.test.ts` (new)
- `apps/web/components/PetriDishCanvas.tsx` (modified — one trailer comment)
- `docs/implementation-artifacts/deferred-work.md` (modified)
- `docs/implementation-artifacts/sprint-status.yaml` (modified — `3-10` status)
- `docs/implementation-artifacts/3-10-usesimulation-hook.md` (this file)

### Change Log

- 2026-09-14 — Story 3.10 implemented: `cloneGrid`; `simulationSpeed` / `population` /
  `rafScheduler` helpers; `useSimulation` hook with tests across AC1–AC11; `PetriDishCanvas`
  trailer; `deferred-work.md` bookkeeping. `npm run ci` exit 0. Status → review.

Dev Model: opus   # architecture-shaping: the first hook to own hot refs + the loop, and the React↔engine contract that 3.11–3.19 and 4.15 all consume; it settles new calls (session keying, cadence-by-cycle, ref-forwarding renderer, throw-on-misuse) rather than following a pattern that already exists
Proposed lane gate: none
