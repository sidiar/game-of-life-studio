// The RAF-driven scheduling loop (Decision D, AR-24, AR-34; RFC-002 §5's prose, story FD1/FD3/FD4)
// — the driver that turns elapsed TIME into a bounded number of `step()` calls. Everything it is
// injected with is a structural port declared right here: `renderer`, `step` and `scheduler` are
// collaborators, `msPerCycleRef` is read live so a speed change needs no restart (FR-4.2 / AR-34).
//
// ❌ No `class`, no `this`, no module-level state (AR-16) — `createSimulationLoop` is a closure
// factory, the same shape `../strategy/rng.ts`'s `createRng` already ships and defends: the AR-16
// ban is on the simulation CORE holding state across calls it does not own, not on a driver that
// is injected INTO the core carrying its own. `packages/simulation` has no `dom` lib
// (`tsconfig.base.json`), so `requestAnimationFrame` cannot even be named here — the `FrameScheduler`
// port below is that rule's consequence, not a design choice this file made freely, and it is
// exactly the seam that lets AC10's tests drive the loop with an explicit fake clock instead of
// `vi.useFakeTimers` or jsdom.
//
// Four failures this file exists to make impossible, each with a named test in
// `simulationLoop.test.ts`:
//   - THE WHILE BURST (RFC-002 §5's "well-meaning fix"). A `while (accumulator >= ms)` drains a
//     multi-cycle bank in one frame. The `if` is LOAD-BEARING, not dead weight: the two clamps below
//     bound the accumulator to `< 2·ms` before the `if` (a bank capped at `ms` plus a delta capped
//     at `ms`), not to `< ms`, so on the frame after a downward speed change a `while` steps twice
//     where the `if` steps once and carries the residual. In steady state the two are equivalent
//     (the accumulator is `< ms` there); on that one frame they are not.
//   - THE SPEED-CHANGE BANK (AC4, this story's one new fact). Reading `msPerCycleRef.current` live
//     reopens a second route to the burst Decision D.3 closed for tab suspension: a bank built at a
//     slow `ms` and drained at a fast one — with the `if`, one step on every frame until the bank
//     is gone (900 ms banked at 1 gen/sec, dropped to 20 gen/sec: 18 steps in 18 frames, a ~300 ms
//     fast-forward). The clamp below (`accumulator = Math.min(accumulator, ms)`, taken against the
//     CURRENT `ms`, before the frame's delta is added) bounds it the same way D.3 bounds the
//     10-second delta.
//   - THE DOUBLED CHAIN. `start()` without an idempotency guard requests a second frame callback;
//     both fire every frame and the accumulator gains two deltas per frame, stepping the simulation
//     at 2x with nothing thrown. `isRunning()`'s single `handle` is the guard — and `onFrame`
//     re-requests only while `handle` is still the frame it is executing, so a `stop(); start()`
//     from inside `step()` (a reset-and-replay path) hands the chain to that `start()` instead of
//     adding a second one beside it.
//   - THE WEDGED LOOP. If `step()` or `draw()` throws, the trailing re-request is skipped but
//     `handle` would still hold the frame that already fired: `isRunning()` says running, `start()`
//     refuses as a duplicate, and nothing ever advances again. The catch below clears `handle`
//     before rethrowing, so a throw reads as a stop and Play can be pressed again.

import type { Grid } from '../grid/grid';

/**
 * The DOM's `requestAnimationFrame` / `cancelAnimationFrame`, structurally, injected because
 * `packages/*` has no `dom` lib to name them with (project-context: engine purity). Story 3.10
 * binds `window.requestAnimationFrame` / `cancelAnimationFrame` (bound) as the production instance;
 * `simulationLoop.test.ts`'s fake is a small in-memory queue with no timers and no globals
 * (AC8/AC10).
 *
 * The loop takes its only timestamp from `request`'s callback argument — never `performance.now()`,
 * never `Date.now()`, never `setTimeout` — which is what makes it drivable by a fake clock at all.
 * Like `requestAnimationFrame`, `request` must fire its callback asynchronously (after it has
 * returned its handle) and `cancel` of a handle that has already fired must be a no-op; the loop
 * relies on both.
 */
export interface FrameScheduler {
  request(callback: (now: number) => void): number;
  cancel(handle: number): void;
}

/**
 * A read-only ref cell — `{ readonly current: T }`. React 19's `RefObject<T>` (`{ current: T }`,
 * the version this repo pins) satisfies this structurally with no adapter; this file declares its own name for it rather than importing
 * React's, because `packages/simulation` has no React dependency to import (AR-16's sibling rule:
 * no React below `useSimulation`).
 */
export interface ReadonlyRef<T> {
  readonly current: T;
}

/**
 * What the loop repaints through — `GridRenderer` satisfies this with no adapter. The loop calls
 * `draw` and NOTHING ELSE: no `markDirty`, no `drawFull`, no `resize` (AC5). The story's Trap 1
 * (`3-8-simulationloop.md`, Dev Notes): against the raw `GridRenderer` this repaints nothing
 * visible, because `draw` only touches cells `markDirty` has queued and the loop marks
 * none — that is Story 3.9's playback-repaint decision (an adapter 3.10 hands the loop as
 * `renderer`), never a second method call added here.
 */
export interface StepRenderer {
  draw(grid: Grid): void;
}

/**
 * The loop's three injected collaborators (Decision D) plus the scheduler FD1 forces (see the head
 * comment). `step` advances the simulation by exactly one cycle and returns the grid to paint —
 * this story does not say what is behind it: `stepGridBuffers` (`./stepGridBuffers.ts`) is the composition Story
 * 3.10 and 4.15 reuse, but the loop's own type only ever sees `() => Grid`.
 */
export interface SimulationLoopDeps {
  readonly renderer: StepRenderer;
  readonly step: () => Grid;
  readonly msPerCycleRef: ReadonlyRef<number>;
  readonly scheduler: FrameScheduler;
}

/** `start()` / `stop()` are idempotent (AC6); `stop()` from inside `step()` is honoured (AC7). */
export interface SimulationLoop {
  start(): void;
  stop(): void;
  isRunning(): boolean;
}

/**
 * The RAF driver (Decision D.1–D.3, AR-24, AR-34). Owns a frame handle, a last timestamp and a
 * time accumulator — nothing else. No buffers, no cycle count, no extinction check: FD2 leaves the
 * `GridBuffers` pair in the caller's ref (Story 3.10) and the swap in `./stepGridBuffers.ts`,
 * precisely because manual Step (Story 3.12) calls `step()` without going through this loop at
 * all, so a cycle counter kept HERE would silently miss every manual step.
 */
export function createSimulationLoop(deps: SimulationLoopDeps): SimulationLoop {
  const { renderer, step, msPerCycleRef, scheduler } = deps;

  // The only state this closure owns (AR-16's "no internal mutable state" bans it in the
  // simulation CORE; this is the driver the core is injected into, the same exception `rng.ts`
  // records for `createRng`). `handle` alone is the running/idempotency flag — `isRunning()` reads
  // it rather than a second boolean, so "a frame is outstanding" cannot drift from "we think we are
  // running".
  let handle: number | null = null;
  let lastTime: number | null = null;
  let accumulator = 0;

  function onFrame(now: number): void {
    // The frame this callback IS. `handle` may legitimately change underneath us during `step()`
    // (a `stop()` clears it; a `stop(); start()` replaces it), and the trailing re-request below
    // must key on "am I still the outstanding frame", not merely "is something outstanding".
    const executing = handle;

    // Read live, every frame — never cached at `start()` (AR-34, FR-4.2, Dev Notes trap 4). Caching
    // this in the closure would silently reintroduce the loop-restart FR-4.2 forbids: a ref exists
    // precisely so a ref WRITE is the whole speed change, with nothing else to invalidate.
    //
    // Trusted, not re-validated: the speed ladder guarantees `50 <= ms <= 1000` (Decision D.1/D.2),
    // and that contract is the slider's to keep (Story 3.13). A ref holding `ms <= 0` would make
    // the `if` below fire on every frame; a `NaN` would freeze the accumulator until the next
    // `start()`. Neither is a case this loop defends per frame.
    const ms = msPerCycleRef.current;

    if (lastTime === null) {
      // FD4 — the first frame after `start()` primes the clock and contributes no delta. Without
      // this, `now - lastTime` against an unset clock is a huge delta that the clamp below turns
      // into exactly one step on the very frame Play was pressed.
      lastTime = now;
    } else {
      const delta = now - lastTime;
      lastTime = now;

      // FD3 — the speed-change bank (AC4). Clamping the delta alone only prevents a burst going
      // forward; a bank built at the OLD (larger) `ms` must also be capped against the NEW one
      // before this frame's delta is even added, or a single downward speed change drains the
      // whole bank one step per frame until it is gone. Steady state is untouched: the invariant
      // `accumulator < ms` already holds there, so this clamp is a no-op until `ms` actually drops.
      accumulator = Math.min(accumulator, ms);
      // Decision D.3 — clamp the FRAME delta (not the bank) to `ms` before it enters the
      // accumulator. A 10-second tab-suspension delta becomes exactly one step on the resumed
      // frame instead of a multi-cycle burst; unkeepable time is dropped, never carried (D.4).
      accumulator += Math.min(delta, ms);

      // `if`, never `while` (RFC-002 §5's "well-meaning fix", AC2/Decision D.2). After the two
      // clamps the accumulator is `< 2·ms`, not `< ms`: on the frame after a downward speed change
      // it can hold a full cycle plus this frame's delta, and a `while` would step twice there.
      // The `if` steps once and carries the rest — see the head comment; the test "steps once,
      // not twice, when the clamped bank plus the delta reach two cycles" is the tripwire.
      if (accumulator >= ms) {
        accumulator -= ms;
        // Repaint only after a step (AC5) — never on an idle frame. `draw` is called with exactly
        // the grid `step()` returned; the loop calls no other renderer method (see `StepRenderer`).
        try {
          const grid = step();
          renderer.draw(grid);
        } catch (error) {
          // A throw is a stop (the wedged-loop failure in the head comment): this frame has
          // already fired, so leaving `handle` set would report "running" with no chain behind it
          // and make every later `start()` a silent no-op. Clear it, then let the caller see the
          // error — the loop neither swallows it nor decides what to do about it.
          handle = null;
          throw error;
        }
      }
    }

    // Re-request LAST, and only if this frame is still the outstanding one (AC7, trap 3). `step()`
    // above may itself have called `stop()` (extinction auto-pause, Story 3.15; manual Stop
    // reached mid-frame) — clearing `handle` — or `stop()` then `start()`, which has already
    // requested the next frame itself. Requesting BEFORE `step()` would hand out a new handle that
    // immediately supersedes the one `stop()` just tried to cancel; requesting on `handle !==
    // null` alone would add a second chain beside a restart's. Keying on `executing` is what makes
    // this the same idempotency guard `start()`/`stop()` use.
    if (handle !== null && handle === executing) {
      handle = scheduler.request(onFrame);
    }
  }

  return {
    start(): void {
      // Idempotent (AC6): a second `start()` while one frame chain is outstanding would double the
      // step rate (the doubled-chain trap in the head comment) — nothing throws, the sim just runs
      // 2x, so the guard has to be unconditional rather than a documented misuse.
      if (handle !== null) return;
      // FD4: `start()` after `stop()` begins from a clean accumulator — it must not inherit
      // residual time banked before the pause, which would make "how many cycles after N seconds
      // of Play" depend on whether this was a first start or a resume.
      accumulator = 0;
      lastTime = null;
      handle = scheduler.request(onFrame);
    },
    stop(): void {
      // Idempotent (AC6): a `stop()` on an already-stopped loop is a no-op.
      if (handle === null) return;
      // Cancels the pending frame through the INJECTED scheduler (AC8) so no callback fires after
      // this returns — including when `stop()` is called from inside `step()` (AC7), where the
      // handle being cancelled is the one already executing; the scheduler's `cancel` is safe to
      // call on it (see `simulationLoop.test.ts`'s fake), and clearing `handle` here is what makes
      // `onFrame`'s trailing re-request check (above) skip the next frame.
      scheduler.cancel(handle);
      handle = null;
    },
    isRunning(): boolean {
      return handle !== null;
    },
  };
}
