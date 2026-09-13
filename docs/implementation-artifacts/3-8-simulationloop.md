---
baseline_commit: ef4eff1
---

# Story 3.8: SimulationLoop

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a developer,
I want the RAF scheduling loop as its own injected module,
so that timing logic is isolated from both React and the renderer.

## Acceptance Criteria

From `epics.md#Story 3.8: SimulationLoop`, decomposed into what a reviewer can check independently.
AC7–AC11 are repo-derived: they come from obligations that shipped code already names —
`threePhaseStep.ts`'s *"WHO holds the buffers and WHEN they swap is Story 3.8's question"*,
`doubleBuffer.ts`'s *"THE SWAP IS THE CALLER'S"*, `gridRenderer.ts`'s AC3 *"scheduling lives
exclusively in SimulationLoop (Story 3.8)"*, `rng.ts`'s closure-state precedent, and the package's
no-DOM / no-class rules — plus one hole in Decision D.3's guarantee that only shows up once
`msPerCycle` is a live ref (AC4).

1. **Constructed with `(renderer, step, msPerCycleRef)` — all three injected (Decision D).** The
   loop imports no renderer, no strategy, no React and no grid buffers. `renderer` is typed by a
   structural port declared in the loop's own module (`{ draw(grid: Grid): void }`), which
   `GridRenderer` satisfies without an adapter; `step` is `() => Grid` — it advances the simulation
   and returns the grid to paint; `msPerCycleRef` is `{ readonly current: number }` — a React
   `RefObject<number>` satisfies it structurally, and the loop reads `.current` **on every frame**,
   never caching it (FR-4.2 "adjust without pausing", AR-34).

2. **One `step()` per elapsed `msPerCycle`, at most one step per frame (AR-24, Decision D.2/D.3).**
   A time accumulator gains the frame delta and, when it reaches `msPerCycle`, subtracts one cycle
   and calls `step()` once. It is an `if`, never a `while` — RFC-002 §5 names the "well-meaning
   fix" this rules out. Residual time is **carried**, not zeroed: at 100 ms/cycle, 60 frames of
   16.7 ms give 10 steps, and 10 s of 144 Hz frames (1000/144 ms each) give ≥ 99 steps — an
   accumulator that resets to 0 after a step lands on 15-frame cycles (104.2 ms) and gives 96.

3. **Frame delta is clamped to `msPerCycle` before it enters the accumulator (Decision D.3, AR-24).**
   A 10-second delta (tab suspension, GC pause) produces exactly one step on the resumed frame, and
   the cadence after it is normal. Unkeepable time is dropped, never banked (Decision D.4).

4. **The accumulator never holds more than one cycle *at the current `msPerCycle`* — including
   across a live speed change.** RFC-002 §5's *"the accumulator can never hold more than one cycle"*
   holds only while `msPerCycle` is constant: with 900 ms banked at 1 gen/sec and the ref dropping to
   50 ms (20 gen/sec), the delta clamp does nothing and the shipped snippet drains the bank as **18
   steps in 18 frames** — the fast-forward burst D.3 exists to forbid, reached through Story 3.13's
   slider instead of a suspended tab. The loop must bound this: after a speed change the very next
   frame may step at most once, and steady cadence resumes immediately. See FD3.

5. **Repaint only after a step (Decision D.3, AR-24).** `renderer.draw(grid)` is called exactly once
   per step, with the grid `step()` returned, and **never on an idle frame** — at 1 gen/sec, 59 of
   60 frames touch neither `step` nor `renderer`. The loop calls no other renderer method: no
   `markDirty`, no `drawFull`, no `resize` — it adds nothing to the renderer contract (RFC-002 §5,
   `component-tree-battle-page.md` §5 "Epic 3 wraps it with the loop, adding nothing to it").

6. **`start()` / `stop()` are idempotent.** Two `start()`s leave exactly one frame chain outstanding
   (a second chain would double the step rate); `stop()` on a stopped loop is a no-op; `stop()` on a
   running loop cancels the pending frame through the injected scheduler so no callback fires after
   it. `start()` after `stop()` begins from a clean accumulator, and **the first frame after
   `start()` primes the clock and contributes no delta** — pressing Play never advances a cycle on
   the frame it was pressed (FD4).

7. **`stop()` called from inside `step()` is honoured.** Story 3.15's extinction auto-pause and
   Story 3.12's Stop both reach the loop from within or right after a step. When `step()` stops the
   loop, the repaint for *that* step still happens (the final grid must stay visible — FR-4.7, B.5)
   and **no further frame is requested**. The loop re-checks its running flag after `step()`, not
   before.

8. **The loop lives in `packages/simulation` and is DOM-free.** `requestAnimationFrame` is a DOM
   global, and `tsconfig.base.json` is `lib: ["ES2022"]` — so the frame source is **injected** as a
   `FrameScheduler` (`{ request(cb: (now: number) => void): number; cancel(handle: number): void }`)
   and the loop takes its timestamps **only** from the callback argument: no `performance.now()`,
   no `Date.now()`, no `setTimeout`. This is the same fact that makes AC10 possible with no fake
   timers. Story 3.10 passes `window.requestAnimationFrame` / `cancelAnimationFrame` (bound) as the
   production scheduler.

9. **No `class`, no `this`, no module-level state (AR-16).** `createSimulationLoop(deps)` is a
   closure factory returning `{ start, stop, isRunning }` — the same shape as `createRng`, and
   covered by the same exception `rng.ts` records: the ban is on the simulation *core*; a driver the
   core is injected into may carry its own state in a closure. RFC-002 §5's `class
   SimulationRenderer` is a sketch, not a contract. The loop does **not** hold `GridBuffers`, does
   **not** swap them, and does **not** count cycles (FD1/FD2).

10. **Behaviour is unit-tested with a fake scheduler and explicit timestamps** — no `vi.useFakeTimers`,
    no jsdom. Every AC above has a test that fails without it: cadence at 60 Hz and 144 Hz, the
    ≤1-step-per-frame bound, the 10 s clamp, the speed-change bank (AC4), draw-only-after-step,
    both idempotencies, cancel-on-stop, stop-inside-step, and the primed first frame. One
    fast-check property: **for any sequence of frame deltas and any `msPerCycle` from the ladder,
    no frame ever steps twice, and `draw` count equals `step` count** (AR-41's shape, applied to
    the driver).

11. **Coverage and gates hold.** `packages/simulation`'s per-file ≥ 90% gate covers the new files
    (there is no `apps/web` exemption to hide under); `npm run bench:check` still passes — the loop
    is not on the benchmarked path and adds no bench; `npm run spec:check` passes with every cited ID
    spelled as the specs spell it.

## Tasks / Subtasks

- [x] **Task 1 — Declare the loop's ports and factory** (AC1, AC8, AC9)
  - [x] Create `packages/simulation/src/loop/simulationLoop.ts`. Declare and export:
    `FrameScheduler`, `ReadonlyRef<T>` (`{ readonly current: T }`), `StepRenderer`
    (`{ draw(grid: Grid): void }`), `SimulationLoopDeps` (`{ renderer, step, msPerCycleRef,
    scheduler }`), `SimulationLoop` (`{ start(): void; stop(): void; isRunning(): boolean }`), and
    `createSimulationLoop(deps: SimulationLoopDeps): SimulationLoop`.
  - [x] Import only `type { Grid }` from `../grid/grid`. Nothing from `../strategy/`, nothing from
    `@gol/domain`, nothing DOM. `tsc` will refuse `requestAnimationFrame` here — that is the design
    telling you the scheduler is injected, not a reason to touch `tsconfig`.
  - [x] Head comment: cite Decision D, AR-24, AR-34, RFC-002 §5 and the `createRng` closure
    precedent; name the failure each rule prevents (the `while` burst, the speed-change bank, the
    doubled chain), not what the next line does.

- [x] **Task 2 — Implement the frame callback** (AC2–AC7)
  - [x] State in the closure: `handle: number | null`, `lastTime: number | null`, `accumulator`.
  - [x] Per frame, in this order: read `ms = msPerCycleRef.current`; if `lastTime === null` prime it
    and skip to re-request (FD4); `delta = now - lastTime; lastTime = now`;
    `accumulator = Math.min(accumulator, ms)` (FD3); `accumulator += Math.min(delta, ms)`;
    `if (accumulator >= ms) { accumulator -= ms; const grid = step(); renderer.draw(grid); }`;
    then **only if still running** re-request (AC7).
  - [x] `start()`: if running, return; reset `accumulator = 0`, `lastTime = null`; request the first
    frame. `stop()`: if not running, return; `scheduler.cancel(handle)`; clear the handle.
    `isRunning()` reads the handle.
  - [x] Guard `ms`: the ladder guarantees `50 ≤ ms ≤ 1000` (Decision D.1/D.2), and the loop trusts
    it — do not re-validate per frame; do note in the comment that a `ms ≤ 0` ref would make the
    `if` fire every frame, which is Story 3.13's slider contract to keep, not this loop's.

- [x] **Task 3 — Answer "who holds the buffers, when do they swap"** (AC9; FD1/FD2)
  - [x] Per FD2, add `packages/simulation/src/loop/stepGridBuffers.ts`:
    `stepGridBuffers(buffers: GridBuffers, deps: SimulationDeps, strategy: SimulationStrategy =
    activeStrategy): GridBuffers` — runs `strategy(buffers.front, buffers.back, deps)` and returns
    `swapGridBuffers(buffers)`. Pure: a new pair value, nothing mutated but `back`'s contents.
    This is the composition every consumer of the engine needs (3.10's hook, 4.15's preview) and
    the one place the swap can never be forgotten.
  - [x] Amend the three comment sentences that currently place the buffers *in the loop* so they
    stay true (comments explain WHY, and a stale WHO is a trap for 3.10):
    `src/index.ts` (*"the SWAP is the caller's (Story 3.8's loop) … holds the `GridBuffers` and
    calls `swapGridBuffers`"*), `strategy/threePhaseStep.ts` (*"Story 3.8's loop holds the
    `GridBuffers`"* in the `SimulationStrategy` doc, and *"The cycle number belongs to the loop
    (Story 3.8)"* in the `SimulationDeps` doc), and `grid/doubleBuffer.ts` if it names 3.8 the
    same way. New wording: the pair lives in the caller's ref (Story 3.10), `stepGridBuffers`
    performs the swap, the loop is injected with a thunk over it, and the cycle counter belongs to
    the thunk's owner because manual Step (Story 3.12) bypasses the loop.

- [x] **Task 4 — Export** (AC1)
  - [x] Add a `// The loop layer (Decision D, Story 3.8)` block to `packages/simulation/src/index.ts`
    exporting `createSimulationLoop`, `stepGridBuffers`, and the types with `export type`
    (`isolatedModules`). Keep the block's comment to the shape the file already uses: what the layer
    is, what it deliberately is not (no buffers, no cycle count, no extinction check, no population).

- [x] **Task 5 — Tests** (AC10, AC11)
  - [x] `packages/simulation/src/loop/simulationLoop.test.ts` with a local
    `createFakeScheduler()`: holds the pending callback + handle counter, exposes `frame(now)` (fires
    the pending callback with that timestamp — throws if none is pending, so a test cannot
    accidentally pass on a dead loop), `pending()` and `cancelled` counters. Keep it in the test
    file (FD5).
  - [x] Cover, each as its own `it`: cadence at 16.7 ms frames (10 steps in 60 frames at 100 ms —
    use 16.7, not 1000/60, so float accumulation cannot leave the 10th step at 999.99 ms); residual
    carry at 144 Hz (1440 frames of 1000/144 ms at 100 ms → ≥ 99 steps; assert the lower bound, and
    note a reset-to-zero accumulator gives 96); 10 000 ms delta → exactly
    one step, then normal; `ms` change 1000 → 50 with 900 ms banked → ≤ 1 step on the next frame,
    then one step every 3 frames; 1 gen/sec → `draw` never called on the 59 idle frames and called
    once with the grid `step` returned; `msPerCycleRef.current` read live (change the ref between
    frames, no restart); `start()` twice → one pending callback; `stop()` twice → one cancel;
    `stop()` → `cancel` called with the outstanding handle and no callback fires afterwards;
    `stop()` from inside `step` → `draw` still called for that step, `pending()` is 0 afterwards;
    first frame after `start()` never steps regardless of its timestamp; `start()` after `stop()`
    does not inherit the old accumulator.
  - [x] fast-check property (AC10): arbitrary `deltas: number[]` in `[0, 20000]` and `ms` from
    `[50, 100, 200, 500, 1000]` — per-frame steps ≤ 1 and `draw` calls === `step` calls.
  - [x] `packages/simulation/src/loop/stepGridBuffers.test.ts`: uses a stub strategy that writes a
    marker into `destination`; asserts the returned pair's `front` is the old `back`, the old
    `front` is byte-identical afterwards, and the default strategy is `activeStrategy` (one
    blinker cycle via `gridFromPattern` from `@gol/test-utils` is enough — do not re-run the
    goldens here).

- [x] **Task 6 — Bookkeeping** (AC11)
  - [x] `deferred-work.md`: the entry *"A live-frame number (diff against the previous frame …) is
    Story 3.8's to take once its loop exists"* reassigns to **Story 3.9** — the loop calls `draw`
    and never decides the dirty set, so there is nothing in it to measure. Also add the AC4
    speed-change bank as a candidate RFC-002 §5 amendment (one sentence; Sidiar's call — the
    M14/M15 precedent), and record FD2's `stepGridBuffers` as the composition 3.10 and 4.15 must
    reuse rather than re-derive.
  - [x] Run `npm run ci`, redirect to a file, echo `$?`; record the actual result in the Dev Agent
    Record. Confirm `bench:check` still reports the 3.7 numbers (the loop must not have crept onto
    the benchmarked path).

### Review Findings

Reviewed on **Opus** against a **Sonnet** implementation (2026-09-13), via three parallel adversarial
layers (Blind Hunter, Edge Case Hunter, Acceptance Auditor). Every `patch` below was applied in the
review commit; the mutation checks named were run against the dev commit's code.

- [x] [Review][Patch] `stop(); start()` from inside `step()` doubled the frame chain — `onFrame` re-requested on `handle !== null`, but a restart had already requested its own frame, so two chains ran and the sim stepped at 2x with nothing thrown. `onFrame` now captures the executing handle and re-requests only while `handle` is still that frame. Test: "stop() then start() from inside step() hands the chain over instead of doubling it" (fails on `c2f0ae9`). [packages/simulation/src/loop/simulationLoop.ts:onFrame]
- [x] [Review][Patch] A throwing `step()`/`draw()` wedged the loop — the re-request was skipped but `handle` kept the already-fired frame, so `isRunning()` said running and every later `start()` was a silent no-op. The catch clears `handle` and rethrows (a throw reads as a stop). Test: "rethrows, reports not running, and lets start() begin a fresh chain" (fails on `c2f0ae9`). [packages/simulation/src/loop/simulationLoop.ts:onFrame]
- [x] [Review][Patch] "`if` is provably equivalent to `while` under the clamp" was false — after FD3 caps the bank at `ms` and D.3 caps the delta at `ms`, the accumulator is `< 2·ms` before the `if`, so on the frame after a downward speed change a `while` steps twice. Head comment and body comment rewritten to the real invariant; AC2's `if`-never-`while` now has a behavioural test, "steps once, not twice, when the clamped bank plus the delta reach two cycles" (fails with `while`). [packages/simulation/src/loop/simulationLoop.ts:15-29]
- [x] [Review][Patch] The "18 steps on this single frame" narrative was wrong for an `if`-gated loop (the un-capped bank drains one step per frame for 18 frames, ~300 ms). Corrected in the code comment, the AC4 test comment, and the RFC-002 §5 amendment candidate in `deferred-work.md` — before the stronger claim reached an authority doc. [packages/simulation/src/loop/simulationLoop.ts, simulationLoop.test.ts, docs/implementation-artifacts/deferred-work.md]
- [x] [Review][Patch] Task 2's sub-bullet "note that a `ms ≤ 0` ref would make the `if` fire every frame — Story 3.13's contract" was checked but absent from the file; the ladder guarantee and the not-re-validated note now sit above the ref read. [packages/simulation/src/loop/simulationLoop.ts:onFrame]
- [x] [Review][Patch] The fake scheduler was a single slot documented as a "twelve-line queue" (~45 lines): a second outstanding request silently overwrote the first, so a doubled chain was unobservable. It is now a real queue (`frame()` fires every pending callback, `pending()` counts them), as `requestAnimationFrame` is. [packages/simulation/src/loop/simulationLoop.test.ts:createFakeScheduler]
- [x] [Review][Patch] The 144 Hz cadence test had no upper bound (a step-every-frame loop passed) — `≤ 100` added (1440 × 1000/144 = 10 000 ms exactly). [packages/simulation/src/loop/simulationLoop.test.ts]
- [x] [Review][Patch] The fast-check property was structurally unfalsifiable (constant `ms`, integer deltas; "≤ 1 step per frame" holds for any `if`, "draws = steps" for any code that draws after stepping). Now: `ms` redrawn from the ladder before every frame with fractional deltas, plus a second property pinning the exact step count `floor(Σ min(delta, ms) / ms) ± 1` at constant `ms` — which a reset-to-zero accumulator, a missing delta clamp, or an every-frame stepper all violate. [packages/simulation/src/loop/simulationLoop.test.ts]
- [x] [Review][Patch] `stepGridBuffers` discarded the strategy's return value: an allocating strategy would have promoted an unwritten `back` (the grid from two cycles ago) with nothing thrown — the exact silent-freeze class the story is built around. One reference comparison per cycle now throws; test added. Its doc no longer calls the function "pure" (it overwrites `back` and advances `deps.rng`) — "allocation-free" in both the file and `index.ts`. The existing tests also assert the strategy receives exactly `(front, back, deps)` and that `before.back` survives the swap. [packages/simulation/src/loop/stepGridBuffers.ts]
- [x] [Review][Patch] Dangling cross-references: `StepRenderer`'s Trap 1 pointed at "`simulationLoop.test.ts` head" (says nothing about it) and `stepGridBuffers` "below" (a different file); `ReadonlyRef` now names React 19's `RefObject<T>` (`{ current: T }`) — React 18's `T | null` would not satisfy it; `FrameScheduler` states the two RAF semantics the loop relies on (async callback; `cancel` of a fired handle is a no-op); the "10 s clamp" describe is titled by what it asserts (the frame-delta clamp). [packages/simulation/src/loop/simulationLoop.ts]
- [x] [Review][Patch] Epic 4 lane state (`epic-4: in-progress`, `4-1-…: ready-for-dev`) rode into the 3.8 dev commit from lane 4's create-story running in this primary checkout — neither belongs to this story, and the 4-1 story file behind them is not in the commit. Reverted to `main`'s values; lane 4's own PR carries its flip. [docs/implementation-artifacts/sprint-status.yaml]
- [x] [Review][Patch] Stale WHO comments outside Task 3's named files: `rng.ts` still said the seed is minted at "Story 3.8/3.10" (FD2 narrowed it to 3.10 — the story's own What-NOT-to-build says so); `conwayGoldens.test.ts` said "exactly as Story 3.8's loop will" (the loop never runs the strategy; `stepGridBuffers` does). [packages/simulation/src/strategy/rng.ts:51,66; packages/simulation/src/strategy/conwayGoldens.test.ts:37]
- [x] [Review][Patch] The seed-domain reassignment was recorded twice in `deferred-work.md` (the 3-6 entry edited in place, as Task 6 asked, AND repeated as the 3-8 section's first bullet). Duplicate removed. [docs/implementation-artifacts/deferred-work.md]
- [x] [Review][Patch] Record accuracy: "Agent Model Used: Claude Opus 5" contradicted `Dev Model: sonnet` (the lane dispatched Sonnet; corrected); the File List's "`ready-for-dev` → `review`" described the dev step, not the commit (`backlog` → `review` on `ef4eff1`); "12-line" fake; and the bench "unchanged 3.7 measurement" glossed `repaint-decision` at 0.110 ms vs 0.072 ms (ungated). [docs/implementation-artifacts/3-8-simulationloop.md]
- [x] [Review][Defer] `apps/web/lib/canvas/repaintDecision.bench.ts` (~108–120) still says "Story 3.8's loop would rebuild this per frame … that story's cost to shape" — now Story 3.9's per AC5 and the reassigned live-frame entry; `apps/web` was out of this story's scope. — deferred to Story 3.9, recorded in `deferred-work.md`.

Dismissed (8): `ms` validation for 0/negative/NaN/Infinity and NaN timestamps (Task 2 says trust the ladder; noted in the comment instead); a synchronous or throwing `scheduler.request` (RAF is neither; the `FrameScheduler` doc now says so); a late-callback-after-`stop()` guard (RAF's `cancel` is synchronous, and the executing-handle check covers the reachable case); a negative-delta guard (Trap 5 forbids it); the AC4 test asserting frame positions rather than the aggregate (the aggregate fails without FD3 — equivalent); React 18 `RefObject` compatibility (React 19.2.7 is pinned); `repaint-decision` bench variance (ungated); the fake's tolerance of `cancel` on a fired handle (it is what RAF does, now documented as the contract).


## Dev Notes

### Constraints the developer MUST follow

- **Scope: the loop, the `stepGridBuffers` composition, their tests.** Colour-state batching and the
  playback repaint path are **3.9**. The React bridge, refs, `attachRenderer`, the RNG seed, `cycle`
  and `population` are **3.10**. Transport buttons are **3.12**, the speed slider **3.13**,
  extinction auto-pause **3.15**. The loop's *only* contact with any of them is the three injected
  deps plus the scheduler.
- **`packages/simulation` rules apply in full:** no DOM types (`lib: ["ES2022"]`), no React, no
  `class`/`this`/module state (AR-16), ESM only, `export type` for types, camelCase filenames,
  cross-package imports by package name. The coverage gate is **per file at 90%** — an untested
  branch in the loop is a red CI, not a shrug.
- **Read `msPerCycleRef.current` every frame.** Caching it in the closure at `start()` silently
  reintroduces the loop restart FR-4.2 / AR-34 forbid. It is a ref precisely so a ref-write is the
  whole speed change.
- **`if`, not `while`.** RFC-002 §5 calls the `while` a well-meaning fix. Under the clamp the
  accumulator holds at most one cycle, so a `while` is provably equivalent in steady state — and
  the first person to remove the clamp "because the while handles it" reinstates the burst.
- **Timestamps come from the scheduler callback only.** `performance` and `Date` are not part of
  the loop's contract; a loop that reads its own clock cannot be driven by a fake one, and AC10 is
  the whole reason the scheduler is injected.
- **The loop calls `renderer.draw` and nothing else.** If a repaint after a step turns out to need
  `markDirty` first, that is Story 3.9's playback-repaint decision (see Traps) — expressed as what
  3.10 hands the loop as `renderer`, never as a second method call from the loop.
- **Comments explain WHY and cite by ID** (`Decision D`, `AR-24`, `RFC-002 §5`, `AR-16`). Spell IDs
  exactly — `spec:check` compares sets, and `D-3` or `AR 24` is silently exempt forever.

### What this story is, in one paragraph

Everything the engine needs to turn cycle N into N+1 exists and is gated (3.1–3.7). Nothing yet
turns *time* into cycles. This story ships the driver: a closure that owns a frame handle, a last
timestamp and an accumulator, and — once per frame — reads the speed from a ref, clamps the frame
delta, adds it, and if a cycle's worth has elapsed calls the injected `step()` once and repaints
once. It deliberately knows nothing else: no buffers (they live in 3.10's ref, swapped by the
`stepGridBuffers` composition this story adds beside the loop), no cycle number (manual Step bypasses
the loop, so the count belongs to whoever owns the thunk), no extinction check (3.15 calls `stop()`
from inside `step()`, and AC7 is what makes that safe), no `requestAnimationFrame` (injected —
`packages/*` cannot even name it, which is what makes the fake-clock tests trivial). The one thing
here the specs did not already say is AC4: a live `msPerCycle` ref opens a second route to the burst
Decision D.3 closed for tab suspension, and the loop bounds it the same way.

### Forced decisions (record the option taken and why in the Dev Agent Record)

**FD1 — Where the loop lives and how RAF reaches it.**
- **(a) `packages/simulation/src/loop/`, scheduler injected** *(recommended)*. Matches
  `component-tree-battle-page.md` §1 (SimulationLoop is listed under NON-REACT MODULES, `packages/*`)
  and the invariant *"nothing below `useSimulation` imports React"*. The no-DOM rule then *forces*
  the `FrameScheduler` port, which is exactly the seam AC10's fake clock needs. Cost: one more
  constructor dependency than Decision D's three — the scheduler is the loop's clock, not a
  collaborator Decision D forgot, and the story says so.
- **(b) `apps/web/lib/battle/simulationLoop.ts`, `requestAnimationFrame` direct with an injectable
  override for tests.** Fewer types, but it puts the accumulator — simulation timing logic — in the
  package project-context reserves for *"UI and wiring only"*, removes it from the ≥ 90% gate, and
  reads the DOM global in production while faking it in tests: two code paths where (a) has one.

**FD2 — Who holds the `GridBuffers`, who swaps, who counts cycles.**
`threePhaseStep.ts` and `index.ts` say the loop; the epics AC gives the loop `(renderer, step,
msPerCycleRef)` with no buffers; the component tree says `useSimulation` *"owns the live
double-buffered grid + SimulationLoop in refs"*. The AC and the component tree agree; the code
comments are loose.
- **(a) The loop takes `step: () => Grid`; this story exports `stepGridBuffers(buffers, deps,
  strategy)` as the pure composition (strategy call + swap); the buffers live in 3.10's ref; the
  cycle count is the thunk owner's** *(recommended)*. Answers "when it swaps" (immediately after the
  strategy returns, inside `stepGridBuffers`) and "who holds" (the caller's ref), gives 3.10 and
  4.15 one function to call, and keeps the loop's type free of buffers — the same reason 3.6's FD1
  kept them out of `SimulationStrategy`. The loop cannot count cycles correctly anyway: Story 3.12's
  manual Step bypasses it.
- **(b) The loop takes `buffers`, `deps`, `strategy` and does the swap itself.** Contradicts the
  epics AC shape and the component tree's ownership row, and forces the Organism Editor preview
  (M3, 4.15) to construct a loop just to step.
- **(c) As (a) but without `stepGridBuffers` — 3.10 composes the call and the swap inline.** Smaller
  diff here; leaves the forgotten-swap bug (front never advances, grid appears frozen, nothing
  throws) for two future stories to each avoid on their own.

**FD3 — The speed-change bank (AC4).** With `ms` read live, `accumulator < ms_old` at frame start is
the only invariant the shipped snippet maintains; when `ms_new < accumulator` the `if` fires once
per frame until drained.
- **(a) `accumulator = Math.min(accumulator, ms)` at the top of the frame, before adding the
  delta** *(recommended)*. Steady state is untouched (accumulator is already `< ms`); after a
  downward change the next frame steps once and the residual is `delta`, i.e. normal cadence from
  there. One line, one test.
- **(b) Reset the accumulator to 0 whenever the ref changes.** Needs the loop to remember the last
  `ms` it saw; loses the residual on every slider notch (a visible hitch at 1 → 2 gen/sec); more
  state for a weaker guarantee.
- **(c) Leave it; document it as 3.13's problem.** 3.13 writes a ref — there is nothing it can do
  about an accumulator it cannot see. The bank is a loop invariant or it is nobody's.

**FD4 — The first frame after `start()`.** A fresh loop has no `lastTime`; `now - 0` is a huge
delta, which the clamp turns into exactly `ms` — an immediate step on the Play frame.
- **(a) Prime: the first frame sets `lastTime` and contributes no delta; a cycle takes `msPerCycle`
  from Play** *(recommended)*. Deterministic under any timestamp origin, symmetric with pause →
  resume, and it is the semantics 3.12's "resuming continues from the paused state" tests inherit.
- **(b) Step immediately on Play.** Feels snappier at 1 gen/sec; makes "how many cycles after N
  seconds of Play" depend on whether it was a first start or a resume unless `lastTime` survives
  `stop()`, which then couples to the cancelled-frame semantics. Rejected for the asymmetry.

**FD5 — Where the fake scheduler lives.**
- **(a) A local helper in `simulationLoop.test.ts`** *(recommended)*. It is twelve lines; the hook
  tests in `apps/web` (3.10+) run under jsdom where `vi.useFakeTimers({ toFake:
  ['requestAnimationFrame'] })` already exists, so a shared fake has no second consumer today.
- **(b) `createFakeFrameScheduler` in `@gol/test-utils`.** Would need the `FrameScheduler` shape
  without importing it (`@gol/simulation` devDepends on `@gol/test-utils` — the cycle `rng.ts`
  refused), i.e. a structural twin like `seededRng.ts` — acceptable, but not until a second package
  needs it.

### Traps

1. **`GridRenderer.draw(grid)` repaints only marked cells — and the loop marks nothing.** After the
   baseline is primed (3.11's mount paint does that), `draw` with no marks is a *no-op*
   (`gridRenderer.ts`, Story 2.3: "nothing survived, so the context is not touched"). So
   `loop → renderer.draw(front)` against the raw `GridRenderer` is a dish that never visibly moves,
   with nothing thrown. **This is by design and is not this story's to fix:** the loop's contract is "`draw(front)` once per step" against a *port*, and the
   playback repaint — whether 3.10 hands the loop an adapter that marks all cells (measured
   ~0.47 ms at 100×60, `markDirty` allocates a coordinate per cell through a `Set`), a whole-grid
   diff path 3.9 adds, or `drawFull` (~0.15 ms decision, full rasterization every step) — is Story
   3.9's decision, with both numbers already in `performance-baseline-validation.md` and
   `deferred-work.md`. Do not "fix" it by calling `markDirty` from the loop (AC5), and do not
   widen the port beyond `draw`. Say this in the loop's head comment so 3.9/3.10 find it.

2. **The doubled chain.** `start()` without an `isRunning` guard requests a second frame callback;
   both fire per frame; the accumulator now gains two deltas per frame and steps twice per cycle.
   Nothing throws, the sim just runs 2×. AC6's "two starts → one pending" test is the tripwire.

3. **Re-requesting before checking `stop()`.** If the callback requests the next frame *before*
   calling `step()`, a `stop()` from inside `step()` (3.15) cancels a handle that is already
   superseded, and the chain continues. Request **last**, and only if still running (AC7).

4. **Reading the ref once.** `const ms = msPerCycleRef.current` belongs at the top of the *frame
   callback*, not of `createSimulationLoop`. The difference is invisible until 3.13 moves the slider
   during playback.

5. **`Math.min(delta, ms)` with a negative delta.** RAF timestamps are monotonic; a fake scheduler
   fed out-of-order timestamps is a test bug, not a case to defend. Do not add `Math.max(0, …)`
   "just in case" — it hides the test bug.

6. **Per-file 90%.** An `isRunning()` nobody tests, or the `stop()` no-op branch, is a red gate on
   `simulationLoop.ts` alone. Every branch in Task 2 has a named test in Task 5 — keep it that way.

7. **`spec:check`.** Cite `Decision D`, `AR-24`, `AR-34`, `AR-16`, `RFC-002`, `FR-4.2`, `NFR-1.1`,
   `Story 3.9`, `Story 3.10`. `D.3` inside prose is fine (it is how the architecture spells it);
   `Decision D.3` as a token is also fine. `AR-24's` is fine. `AR24` is not.

### Spec-conflict flags (project-context: surface new conflicts, don't silently pick one)

- **RFC-002 §5's snippet is a `class` calling `requestAnimationFrame` directly, holding `msPerCycle`
  as a field.** All three collide with rules the code enforces: no classes in `packages/simulation`
  (AR-16, `rng.ts` precedent), no DOM in `packages/*` (`tsconfig.base.json`), and `msPerCycle` as a
  *ref* (AR-34, Decision D.3). The epics AC already resolves the third. Resolution here: closure
  factory + injected scheduler; the snippet is illustrative. No RFC edit required — the prose above
  it is what the story implements.
- **RFC-002 §5: *"the accumulator can never hold more than one cycle"*** is true only at constant
  `msPerCycle` (AC4/FD3). Candidate one-sentence amendment recorded in `deferred-work.md`; Sidiar's
  call.
- **`threePhaseStep.ts` / `index.ts` / `doubleBuffer.ts` place the buffers and the cycle counter
  "in Story 3.8's loop"**; the epics AC and `component-tree-battle-page.md` §4/§6 place them in
  `useSimulation`'s refs. FD2 follows the AC and the component tree; Task 3 corrects the comments.
- **Decision D names three injected collaborators; the loop needs a fourth (the scheduler).** Not a
  contradiction — Decision D describes the loop's *behaviour*; the scheduler is the consequence of
  the no-DOM rule applied to where the component tree places the module. Flagged so a reviewer
  does not read the fourth parameter as scope creep.

### What NOT to build

- ❌ No cycle counter, no `population`, no ≤ 10 Hz publish (M2, AR-29 — Story 3.10).
- ❌ No extinction check, no auto-pause (Decision B.5 — Story 3.15). The loop steps an empty grid
  forever if asked; stopping is the caller's, via `stop()` from inside `step()` (AC7).
- ❌ No `markDirty`, no `drawFull`, no diffing, no colour-state work (Story 3.9). No repaint on
  `start()` — the canvas is already painted by 3.11's mount.
- ❌ No `stepOnce()` / manual-step method on the loop. Story 3.12's Step is `step()` + `draw()`
  outside the loop, composed by 3.10; if 3.12 finds it wants the pair on the loop it says so then.
- ❌ No RNG, no seed minting (`deferred-work.md` names "Story 3.8/3.10" — with FD2 it is **3.10**,
  which builds `SimulationDeps`; say so when you edit the entry).
- ❌ No `performance.now()` fallback, no `setTimeout` fallback for hidden tabs — a hidden tab's RAF
  simply pauses, which is the desired behaviour and what the clamp handles on resume.
- ❌ No new bench, no new `vitest.config.ts` entries, no `tsconfig` changes, no `@gol/test-utils`
  additions (FD5).
- ❌ No Web Worker (Decision D.4).

### Testing standards summary

- Vitest 4 in `packages/simulation` (node environment, per-file 90% gate, `include: ['src/**/*.ts']`,
  `*.test.ts` excluded from the denominator). Test files sit beside their subject.
- fast-check is available; one property on the driver (AC10). Keep runs deterministic — frame
  deltas are the only input, and the property draws them.
- `@gol/test-utils` for the `stepGridBuffers` test (`gridFromPattern`, `emptyGrid`,
  `createSeededRng`/`FIXED_SEED` if you run the real strategy). Do not hand-roll a grid literal.
- No jsdom, no `vi.useFakeTimers`, no spying on globals — the fake scheduler is the whole test
  harness, which is the point of AC8.
- Verification before "done": `npm run ci > /tmp/ci.log; echo $?` — never pipe to `tail`. Record
  the real exit code and the `bench:check` line in the Dev Agent Record.

### Previous story intelligence (3.6, 3.7) and recent git

- **3.6 FD1** chose `(source, destination, deps) => Grid` precisely to leave buffer identity to this
  story; **3.6 FD4** shipped `createRng` as a stateful closure and wrote down why that is not an
  AR-16 violation — cite it, don't re-argue it. 3.6's review left seed-domain enforcement to
  "3.8/3.10"; with FD2 that is 3.10 (Task 6 says so in `deferred-work.md`).
- **3.7 flipped the gates**: per-file ≥ 90% in this package, `passWithNoTests` gone, `spec:check` in
  CI, `bench:check` gated at 16.667 ms with 27.7% headroom on the runner. 3.7's review culture:
  every deferred item that names a story gets closed *with a number* or reassigned *with a reason* —
  Task 6 does the latter for the live-frame entry. 3.7 also measured the `draw`/`drawFull` pair for
  this story and concluded "still `draw`, and now with both numbers" — this story keeps the port at
  `draw` and hands the numbers to 3.9.
- **RFC amendments are Sidiar's call** (3.6 and 3.7 both amended RFC-004 on explicit authorization —
  the M14/M15 precedent). AC4's RFC-002 §5 sentence goes to `deferred-work.md` as a candidate, not
  into the RFC.
- **Git**: the last two stories ran as `story/*` branches merged by PR (#24), with a code-review
  commit (`review: story 3.7 …`) after the feature commit; the Dev Agent Record and run stats are
  committed as `docs:` follow-ups. Match the commit-message shapes in project-context.

### External dependencies / versions

None new. TypeScript 5.9.3 strict, Vitest 4 (v8 coverage), fast-check as already installed
(Story 1.2). `requestAnimationFrame`'s callback receives a `DOMHighResTimeStamp` (ms, monotonic,
same origin as `performance.now()`), which is why the loop takes `now: number` and never subtracts
timestamps from two sources. Story 3.10 binds `window.requestAnimationFrame`/`cancelAnimationFrame`
into the `FrameScheduler` shape; nothing in this story references them.

## Project Structure Notes

- New: `packages/simulation/src/loop/simulationLoop.ts`, `simulationLoop.test.ts`,
  `stepGridBuffers.ts`, `stepGridBuffers.test.ts`. The `loop/` folder is the fourth layer beside
  `engine/`, `gol/`, `grid/`, `session/`, `strategy/` — it imports `grid/` and (for
  `stepGridBuffers`) `strategy/`, and nothing imports it. No ESLint boundary block is needed: the
  existing `src/engine/` block already forbids the only dangerous direction.
- Modified: `packages/simulation/src/index.ts` (export block), comment-only edits in
  `strategy/threePhaseStep.ts`, `grid/doubleBuffer.ts` (Task 3), `docs/implementation-artifacts/deferred-work.md`
  (Task 6).
- Not touched: `apps/web/**` (the loop's first consumer is 3.10), `tsconfig.*`, `vitest.config.ts`,
  `eslint.config.mjs`, `@gol/test-utils`.
- Naming: camelCase files, `createSimulationLoop` mirrors `createRng`/`createGridBuffers`;
  `stepGridBuffers` mirrors `swapGridBuffers`.

## References

- `docs/planning-artifacts/epics.md#Story 3.8: SimulationLoop` — the five ACs this file decomposes.
- `docs/planning-artifacts/architecture.md#Decision D` (D.1 ladder, D.2 ≤ 1 step/frame, D.3 clamp +
  ref-read speed, D.4 degradation); Runtime Architecture step 3; AR-24, AR-34, AR-16, AR-29, AR-41.
- `docs/planning-artifacts/rfcs/RFC-002-grid-rendering-technology.md` §5 — the loop prose (authoritative)
  and the `class` sketch (illustrative); "single `if` … never a `while`".
- `docs/planning-artifacts/rfcs/RFC-005-application-state-modes-undo.md` Decision 5 — the hook that
  consumes the loop; `msPerCycle` in a ref; grid buffers never in React state.
- `docs/planning-artifacts/component-tree-battle-page.md` §1 (loop under NON-REACT MODULES), §4
  (`useSimulation` owns buffers + loop in refs), §5 (`SimulationLoop` constructed with
  `(renderer, step, msPerCycleRef)`; renderer never schedules), §6 (state matrix row "live grid, RAF
  handle, `msPerCycle` — hot (refs) — useSimulation — SimulationLoop → GridRenderer").
- `packages/simulation/src/strategy/threePhaseStep.ts` — `SimulationStrategy`, `SimulationDeps`,
  `activeStrategy`; the "swap is the caller's" contract this story composes.
- `packages/simulation/src/grid/doubleBuffer.ts` — `GridBuffers`, `swapGridBuffers` (pure, new pair).
- `packages/simulation/src/strategy/rng.ts` — the closure-with-state precedent under AR-16.
- `apps/web/lib/canvas/gridRenderer.ts` — `draw(grid)` semantics (marks-only, baseline-primed),
  AC3's "scheduling lives exclusively in SimulationLoop" and its structural regex test.
- `docs/implementation-artifacts/3-6-phase-3-the-assembled-cycle.md` FD1 — why the strategy type
  carries no buffers and defers the identity question here.
- `docs/implementation-artifacts/3-7-performance-harness-coverage-gate-flip.md` and
  `performance-baseline-validation.md` — the `draw` vs `drawFull` numbers Story 3.9 will need.
- `docs/implementation-artifacts/deferred-work.md` — seed-domain entry (3.8/3.10 → 3.10), live-frame
  measurement entry (3.8 → 3.9).
- `docs/project-context.md` — no DOM in `packages/*`, no classes in the engine, hot state in refs,
  clamp `delta` before the accumulator, per-file coverage, `spec:check` spelling.

## Dev Agent Record

### Agent Model Used

Claude Sonnet, via the bmad-dev-story workflow — the model the `Dev Model: sonnet` line below
dispatched. (The record as committed in `c2f0ae9` said "Claude Opus 5"; corrected in review, since
the lane's Step 3 pairing — Opus reviewing Sonnet — is what actually ran.)

Review: Claude Opus 5 (claude-opus-5), via bmad-code-review (2026-09-13).

### Debug Log References

- `npx tsc --noEmit -p packages/simulation` — clean (0 errors), run repeatedly through the
  implementation.
- `cd packages/simulation && npx vitest run --coverage` — 23 test files / 388 tests passed;
  package-level coverage 100% statements/branches/functions/lines; per-file coverage on both new
  files confirmed via `coverage/lcov.info` (`simulationLoop.ts`: LF 26/26, BRF 10/10, FNF 5/5;
  `stepGridBuffers.ts`: LF 2/2, BRF 1/1, FNF 1/1).
- First `npm run ci` attempt failed at `lint` (two `simulationLoop.test.ts` errors: an unused
  `FrameScheduler` type import, and `prefer-const` on a `let loop!: SimulationLoop` used inside a
  closure before assignment) and then at `format:check` (Prettier wanted a different wrap on a
  multi-line call in `stepGridBuffers.test.ts`). Fixed by dropping the unused import, rewriting the
  harness as a self-referencing `const loop = createSimulationLoop({ step: () => { ...
  loop.stop() ... } })` (valid — `step` isn't invoked until a frame fires, well after `loop`
  finishes initializing) instead of a pre-declared `let`, and running `npx prettier --write` on the
  two test files. Re-ran lint/format/typecheck/tests clean after the fix.
- `npm run ci > /tmp/ci-3-8.log 2>&1; echo $?` — **exit 0.** `spec:check`: "all 209 cited ids
  resolve, and all 3 reconciliation citations resolve against 6 declared." `test:coverage`:
  `@gol/simulation` at 100% statements/branches/functions/lines, including `src/loop/` (both new
  files, 100% per file) and every existing file unchanged. `bundle:check`: all three budgets held
  (10.1 KB / 4.7 KB / 4.8 KB headroom — unaffected, this story touches no `apps/web` code).
  `bench:check`: `step 100x60 x20 = 7.631 ms`, `repaint-decision = 0.110 ms`, `frame = 7.741 ms`
  against the `16.667 ms` budget — **8.926 ms headroom, 53.6% of the frame** (the loop is not on
  the benchmarked path and added no bench; `step` sits inside 3.7's recorded 5.5–8.1 ms local
  spread, and `repaint-decision` at 0.110 ms vs 3.7's 0.072 ms is ungated noise). `e2e`: 344 passed, 4 skipped (pre-existing skips, unrelated to this story).

### Completion Notes List

- Implemented `createSimulationLoop` (`packages/simulation/src/loop/simulationLoop.ts`) as a
  closure factory (`handle`, `lastTime`, `accumulator` — no class, no module state, AR-16) with the
  four injected collaborators (`renderer`, `step`, `msPerCycleRef`, `scheduler`). `isRunning()`
  reads `handle !== null` rather than a separate flag, which is also the idempotency guard for
  `start()`/`stop()` and the re-request check inside the frame callback (AC6/AC7).
- The frame callback reads `msPerCycleRef.current` fresh every call (AR-34/FR-4.2), primes on the
  first call with no delta (FD4/AC6), clamps the accumulator to the current `ms` before adding the
  clamped delta (FD3/AC4 — the speed-change bank), and steps with a single `if`, never a `while`
  (AC2, RFC-002 §5). Re-request happens last and only if `handle !== null`, so a `stop()` called
  from inside `step()` (AC7) is honoured: the repaint for that step still happens, and no further
  frame is requested.
- Added `stepGridBuffers` (`packages/simulation/src/loop/stepGridBuffers.ts`) per FD2(a): runs
  `strategy(buffers.front, buffers.back, deps)` (default `activeStrategy`) and returns
  `swapGridBuffers(buffers)` — pure, no mutation of the pair itself. This is the composition Story
  3.10 and Story 4.15 reuse instead of each re-deriving "step, then remember to swap."
  Task 3's comment corrections landed in `strategy/threePhaseStep.ts` (both the `SimulationDeps`
  and `SimulationStrategy` docs) and `grid/doubleBuffer.ts`: the buffers now read as living in the
  caller's ref (Story 3.10), with the swap performed by `stepGridBuffers`, and the cycle counter
  belonging to whoever owns the `step` thunk (also Story 3.10) rather than to the loop, because
  manual Step (Story 3.12) bypasses the loop.
- Added the loop-layer export block to `packages/simulation/src/index.ts` (`createSimulationLoop`,
  `stepGridBuffers`, and the five port/dep types via `export type`) and corrected the two existing
  comments there that had said "the SWAP is the caller's (Story 3.8's loop)."
- Tests: `simulationLoop.test.ts` uses a local `createFakeScheduler()` (FD5(a)) — no
  `vi.useFakeTimers`, no jsdom — covering cadence at 16.7 ms and 1000/144 ms frames, the 10 s
  clamp, the AC4 speed-change bank (900 ms banked at 1 gen/sec, dropped to 20 gen/sec, asserted
  ≤ 1 step on the next frame then one step every ~3 frames), draw-only-after-a-step, live
  `msPerCycleRef` reads mid-run with no restart, both `start()`/`stop()` idempotencies, cancel-on-
  stop (with the cancelled handle asserted and a post-cancel `frame()` call proven to throw), stop-
  from-inside-step, and the primed-first-frame guarantee (including that a restart does not inherit
  the pre-stop accumulator). One fast-check property over arbitrary frame-delta sequences and the
  `[50,100,200,500,1000]` ms ladder asserts ≤ 1 step per frame and `draw` count === `step` count.
  `stepGridBuffers.test.ts` pins the swap identity (`result.front === old back`, `result.back ===
  old front`), that the old front is byte-identical afterwards, that the returned pair is a fresh
  value, and — with the default `activeStrategy` — that one blinker cycle turns vertical into
  horizontal (via `@gol/test-utils`'s `gridFromPattern`/`createSeededRng`/`FIXED_SEED`, no
  hand-rolled grid literal).
- Bookkeeping (Task 6): reassigned the `deferred-work.md` live-frame-measurement entry to Story 3.9
  (the loop decides no dirty set — it only calls `renderer.draw(grid)` — so there is nothing in it
  to measure), added the AC4 speed-change bank as a candidate one-sentence RFC-002 §5 amendment
  (Sidiar's call, M14/M15 precedent), recorded `stepGridBuffers` as the composition Story 3.10/4.15
  must reuse, and narrowed the Story-3.6-review seed-domain entry from "Story 3.8/3.10" to "Story
  3.10" per FD2 (the loop mints no seed; `SimulationDeps` construction, where the `Rng` is built,
  belongs to whoever owns the `step` thunk).
- No new dependencies. No changes to `apps/web`, `tsconfig.*`, `vitest.config.ts`,
  `eslint.config.mjs`, or `@gol/test-utils` (all confirmed against the story's Project Structure
  Notes / "What NOT to build").

### Forced Decisions

- **FD1 — (a) `packages/simulation/src/loop/`, scheduler injected.** Taken as recommended:
  `FrameScheduler` is declared in `simulationLoop.ts` itself; the loop never names
  `requestAnimationFrame`, and `tsc` would refuse it under `tsconfig.base.json`'s `lib: ["ES2022"]`
  if it tried.
- **FD2 — (a) `step: () => Grid` on the loop; `stepGridBuffers(buffers, deps, strategy)` as the
  pure swap-composition; buffers live in the caller's ref; cycle count is the thunk owner's.**
  Taken as recommended. `stepGridBuffers` defaults its `strategy` parameter to `activeStrategy` so
  a caller gets Conway's rules with zero configuration while still being able to inject a stub (as
  `stepGridBuffers.test.ts` does).
- **FD3 — (a) `accumulator = Math.min(accumulator, ms)` at the top of the frame, before adding the
  delta.** Taken as recommended. Verified by the speed-change test: 900 ms banked at `ms = 1000`,
  dropped to `ms = 50`, produces exactly one step on the next frame rather than the 18-step burst
  the un-clamped snippet would produce.
- **FD4 — (a) Prime on the first frame; it contributes no delta.** Taken as recommended, via
  `lastTime === null` as the priming check rather than a separate boolean.
- **FD5 — (a) A local helper in `simulationLoop.test.ts`.** Taken as recommended; no second
  consumer exists yet, so nothing was added to `@gol/test-utils`.

### Spec-conflict flags raised

None new. The four conflicts the story file already names (RFC-002 §5's `class`/direct-RAF
snippet being illustrative; its "never more than one cycle" claim holding only at constant
`msPerCycle`; the three buffers-comments corrected in Task 3; Decision D's three collaborators plus
the scheduler FD1 forces) were all pre-identified in the story's Dev Notes and resolved exactly as
written there — no new disagreement surfaced between `docs/project-context.md`, an RFC, and the
shipped code.

### File List

- `packages/simulation/src/loop/simulationLoop.ts` (new)
- `packages/simulation/src/loop/simulationLoop.test.ts` (new)
- `packages/simulation/src/loop/stepGridBuffers.ts` (new)
- `packages/simulation/src/loop/stepGridBuffers.test.ts` (new)
- `packages/simulation/src/index.ts` (modified — export block + two comment corrections)
- `packages/simulation/src/strategy/threePhaseStep.ts` (modified — comment corrections only)
- `packages/simulation/src/grid/doubleBuffer.ts` (modified — comment correction only)
- `docs/implementation-artifacts/deferred-work.md` (modified — Task 6 bookkeeping)
- `docs/implementation-artifacts/sprint-status.yaml` (modified — `3-8-simulationloop` from `backlog`
  on `ef4eff1` to `review`; the intermediate `ready-for-dev`/`in-progress` states were never committed)
- `docs/implementation-artifacts/3-8-simulationloop.md` (this file — task checkboxes, Dev Agent
  Record, Status)

### Change Log

- 2026-09-13 — Code review (Opus): 14 patches applied in the review commit (doubled-chain and
  wedged-loop fixes with tests, `if`-vs-`while` invariant corrected and pinned, `stepGridBuffers`
  destination guard, real-queue fake scheduler, strengthened properties, comment/record
  corrections, Epic 4 lane state reverted out of this story's `sprint-status.yaml`); 1 deferred to
  Story 3.9; 0 decision-needed. Status moved to `done`.
- 2026-09-13 — Story 3.8 implemented: `createSimulationLoop` + `stepGridBuffers` shipped in
  `packages/simulation/src/loop/`, exported from the package root, with comment corrections in
  `threePhaseStep.ts`/`doubleBuffer.ts` (Task 3) and `deferred-work.md` bookkeeping (Task 6). Status
  moved to `review`.

Dev Model: sonnet   # follows a prescribed pattern rather than setting one: RFC-002 §5 gives the accumulator literally, Decision D fixes the clamp and the ref-read, the component tree fixes the constructor shape, and this file already settles the open calls (FD1 location + injected scheduler, FD2 step-thunk + `stepGridBuffers`, FD3 accumulator clamp, FD4 primed first frame) with recommendations and a named test per branch — the dev records FDs and executes ~80 lines under a per-file gate, the 3.2 precedent, not the 3.3/3.6 one
Proposed lane gate: none

---

This story was implemented with the 'Implement next story' skill with the following stats:

| Phase | Agent model | Agents | Wall clock | Input | Output | Cache write | Cache read | Total tokens |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Step 0 — re-entry guard | — | 0 | 21s | 10 | 1,403 | 3,234 | 263,689 | 268,336 |
| Step 1 — create-story | opus-5 | 1 | 9m 40s | 130 | 41,494 | 454,159 | 6,254,797 | 6,750,580 |
| Step 2 — dev-story | sonnet-5 | 1 | 16m 28s | 318 | 65,092 | 370,528 | 20,935,021 | 21,370,959 |
| Step 3 — code review + PR | opus-5 | 4 | 26m 20s | 366 | 103,776 | 990,883 | 18,986,417 | 20,081,442 |
| _of which the orchestrator_ | opus-5 | — | — | 40 | 10,742 | 22,232 | 1,137,600 | 1,170,614 |
| **Total (create-story → PR ready)** | | 6 | **52m 48s** | 824 | 211,765 | 1,818,804 | 46,439,924 | **48,471,317** |

Run started 2026-09-13 12:12 CEST; wall clock runs to the point the run stopped for Sidiar's review. Each phase row covers the phase agent, any agents it spawned, and the orchestrator's own turns in that window — the orchestrator row breaks its share out again, it is not additional. Cache reads dominate the token totals and are billed at a fraction of input rate, so read the Input and Output columns for effort and the total only as a ceiling. The orchestrator's final turn is still being written when these numbers are taken.
