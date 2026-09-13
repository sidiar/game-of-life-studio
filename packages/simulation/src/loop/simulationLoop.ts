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
// Three failures this file exists to make impossible, each with a named test in
// `simulationLoop.test.ts`:
//   - THE WHILE BURST (RFC-002 §5's "well-meaning fix"). A `while (accumulator >= ms)` drains a
//     multi-cycle bank in one frame; Decision D.3's clamp keeps the accumulator at ≤ 1 cycle, so an
//     `if` is provably equivalent in steady state and a `while` is dead weight that reopens the
//     burst the moment someone removes the clamp "because the while handles it".
//   - THE SPEED-CHANGE BANK (AC4, this story's one new fact). Reading `msPerCycleRef.current` live
//     reopens a second route to the burst Decision D.3 closed for tab suspension: a bank built at a
//     slow `ms` and drained at a fast one. The clamp below (`accumulator = Math.min(accumulator,
//     ms)`, taken against the CURRENT `ms`, before the frame's delta is added) bounds it the same
//     way D.3 bounds the 10-second delta.
//   - THE DOUBLED CHAIN. `start()` without an idempotency guard requests a second frame callback;
//     both fire every frame and the accumulator gains two deltas per frame, stepping the simulation
//     at 2x with nothing thrown. `isRunning()`'s single `handle` is the guard.

import type { Grid } from '../grid/grid';

/**
 * The DOM's `requestAnimationFrame` / `cancelAnimationFrame`, structurally, injected because
 * `packages/*` has no `dom` lib to name them with (project-context: engine purity). Story 3.10
 * binds `window.requestAnimationFrame` / `cancelAnimationFrame` (bound) as the production instance;
 * `simulationLoop.test.ts`'s fake is a twelve-line queue with no timers and no globals (AC8/AC10).
 *
 * The loop takes its only timestamp from `request`'s callback argument — never `performance.now()`,
 * never `Date.now()`, never `setTimeout` — which is what makes it drivable by a fake clock at all.
 */
export interface FrameScheduler {
  request(callback: (now: number) => void): number;
  cancel(handle: number): void;
}

/**
 * A read-only ref cell — `{ readonly current: T }`. A React `RefObject<T>` satisfies this
 * structurally with no adapter; this file declares its own name for it rather than importing
 * React's, because `packages/simulation` has no React dependency to import (AR-16's sibling rule:
 * no React below `useSimulation`).
 */
export interface ReadonlyRef<T> {
  readonly current: T;
}

/**
 * What the loop repaints through — `GridRenderer` satisfies this with no adapter. The loop calls
 * `draw` and NOTHING ELSE: no `markDirty`, no `drawFull`, no `resize` (AC5). Trap 1
 * (`simulationLoop.test.ts` head, and see Dev Notes): against the raw `GridRenderer` this repaints
 * nothing visible, because `draw` only touches cells `markDirty` has queued and the loop marks
 * none — that is Story 3.9's playback-repaint decision (an adapter 3.10 hands the loop as
 * `renderer`), never a second method call added here.
 */
export interface StepRenderer {
  draw(grid: Grid): void;
}

/**
 * The loop's three injected collaborators (Decision D) plus the scheduler FD1 forces (see the head
 * comment). `step` advances the simulation by exactly one cycle and returns the grid to paint —
 * this story does not say what is behind it: `stepGridBuffers` (below) is the composition Story
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
 * `GridBuffers` pair in the caller's ref (Story 3.10) and the swap in `stepGridBuffers` below,
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
    // Read live, every frame — never cached at `start()` (AR-34, FR-4.2, Dev Notes trap 4). Caching
    // this in the closure would silently reintroduce the loop-restart FR-4.2 forbids: a ref exists
    // precisely so a ref WRITE is the whole speed change, with nothing else to invalidate.
    const ms = msPerCycleRef.current;

    if (lastTime === null) {
      // FD4 — the first frame after `start()` primes the clock and contributes no delta. Without
      // this, `now - lastTime` against an unset clock is a huge delta that the clamp below turns
      // into exactly one step on the very frame Play was pressed.
      lastTime = now;
    } else {
      const delta = now - lastTime;
      lastTime = now;

      // FD3 — the speed-change bank (AC4). Clamping AFTER a `msPerCycle` drop only prevents a
      // burst going forward; a bank built at the OLD (larger) `ms` must also be capped against the
      // NEW one before this frame's delta is even added, or a single downward speed change drains
      // the whole bank in one burst of same-frame steps. Steady state is untouched: the invariant
      // `accumulator < ms` already holds there, so this clamp is a no-op until `ms` actually drops.
      accumulator = Math.min(accumulator, ms);
      // Decision D.3 — clamp the FRAME delta (not the bank) to `ms` before it enters the
      // accumulator. A 10-second tab-suspension delta becomes exactly one step on the resumed
      // frame instead of a multi-cycle burst; unkeepable time is dropped, never carried (D.4).
      accumulator += Math.min(delta, ms);

      // `if`, never `while` (RFC-002 §5's "well-meaning fix", AC2/Decision D.2). Under the clamp
      // above the accumulator can never hold more than one cycle AT THE CURRENT `ms`, so a `while`
      // here would run zero or one time in practice and only invites someone to delete the clamp
      // "because the while already handles the multi-cycle case" — it does not; see the head
      // comment.
      if (accumulator >= ms) {
        accumulator -= ms;
        // Repaint only after a step (AC5) — never on an idle frame. `draw` is called with exactly
        // the grid `step()` returned; the loop calls no other renderer method (see `StepRenderer`).
        const grid = step();
        renderer.draw(grid);
      }
    }

    // Re-request LAST, and only if still running (AC7, trap 3). `step()` above may itself have
    // called `stop()` (extinction auto-pause, Story 3.15; manual Stop reached mid-frame) — clearing
    // `handle`. Requesting BEFORE that check would hand out a new handle that immediately
    // supersedes the one `stop()` just tried to cancel, and the chain would continue regardless of
    // what `step()` decided. Checking `handle` here (rather than a separate flag) is what makes
    // this the same idempotency guard `start()`/`stop()` use.
    if (handle !== null) {
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
