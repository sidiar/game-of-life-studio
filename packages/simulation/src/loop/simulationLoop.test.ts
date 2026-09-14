// AC10: every behaviour below is driven by explicit timestamps through a fake `FrameScheduler` —
// no `vi.useFakeTimers`, no jsdom, no spy on a global clock. That is only possible because the
// loop takes its timestamps from the scheduler callback's argument alone (AC8); a loop that read
// `performance.now()` itself could not be driven this way.
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { createGrid } from '../grid/grid';
import type { Grid } from '../grid/grid';
import { createSimulationLoop } from './simulationLoop';
import type { SimulationLoop } from './simulationLoop';

/**
 * FD5(a): a small local helper, not a shared `@gol/test-utils` fake — this file is its only
 * consumer today. It is a real QUEUE, like `requestAnimationFrame`: two outstanding requests are
 * two callbacks, both fired by the next `frame(now)` (a single-slot fake that overwrote the pending
 * callback could not observe a doubled chain at all). `frame(now)` throws when nothing is pending,
 * so a test that forgets to `start()` (or that outlives a `stop()`) fails loudly instead of
 * silently passing on a dead loop. Callbacks requested DURING a frame run on the next one, as in
 * the browser.
 */
function createFakeScheduler() {
  let nextHandle = 1;
  let queue: { handle: number; callback: (now: number) => void }[] = [];
  let cancelledCount = 0;
  let lastCancelledHandle: number | null = null;
  let requestCount = 0;

  return {
    request(callback: (now: number) => void): number {
      requestCount += 1;
      const handle = nextHandle;
      nextHandle += 1;
      queue.push({ handle, callback });
      return handle;
    },
    cancel(handle: number): void {
      cancelledCount += 1;
      lastCancelledHandle = handle;
      queue = queue.filter((entry) => entry.handle !== handle);
    },
    frame(now: number): void {
      if (queue.length === 0) {
        throw new Error('createFakeScheduler: frame() called with no pending callback');
      }
      const firing = queue;
      queue = [];
      for (const { callback } of firing) callback(now);
    },
    pending(): number {
      return queue.length;
    },
    get cancelledCount(): number {
      return cancelledCount;
    },
    get lastCancelledHandle(): number | null {
      return lastCancelledHandle;
    },
    get requestCount(): number {
      return requestCount;
    },
  };
}

type FakeScheduler = ReturnType<typeof createFakeScheduler>;

/** A ref-object twin, structurally satisfied by a React `RefObject<number>` in production. */
function createRef(current: number): { current: number } {
  return { current };
}

interface Harness {
  loop: SimulationLoop;
  scheduler: FakeScheduler;
  msPerCycleRef: { current: number };
  steps: Grid[];
  draws: Grid[];
}

/**
 * Builds a loop wired to a fake scheduler, a counting `step`/`draw` pair, and a mutable
 * `msPerCycleRef`. `stepInto` lets a handful of tests (AC7) call `loop.stop()` from inside the
 * injected `step()` itself.
 */
function createHarness(initialMs: number, stepInto?: (loop: SimulationLoop) => void): Harness {
  const scheduler = createFakeScheduler();
  const msPerCycleRef = createRef(initialMs);
  const steps: Grid[] = [];
  const draws: Grid[] = [];

  // Self-referencing closure: `step` is not CALLED until a frame fires, by which time `loop` has
  // already finished initialising — the classic pattern for "the callback needs the object it is
  // a property of", with no mutable rebinding for prefer-const to object to.
  const loop = createSimulationLoop({
    renderer: { draw: (grid) => draws.push(grid) },
    step: (): Grid => {
      const grid = createGrid(1, 1);
      steps.push(grid);
      stepInto?.(loop);
      return grid;
    },
    msPerCycleRef,
    scheduler,
  });

  return { loop, scheduler, msPerCycleRef, steps, draws };
}

describe('cadence (AC2, Decision D.1/D.2)', () => {
  it('steps 10 times over 60 frames of 16.7 ms at 100 ms/cycle', () => {
    // 16.7, not 1000/60 — float accumulation must not leave the 10th step short of 1000 ms.
    const { loop, scheduler, steps } = createHarness(100);
    loop.start();

    let now = 0;
    scheduler.frame(now); // FD4: primes the clock, contributes no delta.
    for (let frame = 0; frame < 60; frame += 1) {
      now += 16.7;
      scheduler.frame(now);
    }

    expect(steps).toHaveLength(10);
  });

  it('gives at least 99 steps over 1440 frames of 1000/144 ms at 100 ms/cycle', () => {
    // A reset-to-zero accumulator (the alternative this story rejects) lands on 15-frame cycles
    // (104.2 ms) and gives 96 — this asserts the carried-residual lower bound instead.
    const { loop, scheduler, steps } = createHarness(100);
    loop.start();

    let now = 0;
    scheduler.frame(now);
    const frameDelta = 1000 / 144;
    for (let frame = 0; frame < 1440; frame += 1) {
      now += frameDelta;
      scheduler.frame(now);
    }

    // 1440 * (1000 / 144) is exactly 10 000 ms, so 100 is the ceiling: a loop that stepped on every
    // frame would clear the lower bound and must not clear this one.
    expect(steps.length).toBeGreaterThanOrEqual(99);
    expect(steps.length).toBeLessThanOrEqual(100);
  });
});

describe('the frame-delta clamp (AC3, Decision D.3/D.4)', () => {
  it('turns a 10 000 ms delta into exactly one step, then resumes normal cadence', () => {
    const { loop, scheduler, steps } = createHarness(100);
    loop.start();

    scheduler.frame(0); // primes
    scheduler.frame(10_000); // a tab-suspension-sized delta
    expect(steps).toHaveLength(1);

    // Normal cadence resumes immediately: unkeepable time was dropped, not banked, so the very
    // next handful of 16.7 ms frames behaves exactly like the steady-state cadence test above.
    let now = 10_000;
    for (let frame = 0; frame < 6; frame += 1) {
      now += 16.7;
      scheduler.frame(now);
    }
    expect(steps).toHaveLength(2); // 6 * 16.7 = 100.2 ms >= one more cycle, and only one.
  });
});

describe("the speed-change bank (AC4, FD3 — this story's one new fact)", () => {
  it('steps at most once on the frame after a downward speed change, then settles into the new cadence', () => {
    const { loop, scheduler, steps, msPerCycleRef } = createHarness(1000);
    loop.start();

    scheduler.frame(0); // primes
    // Bank 900 ms at 1 gen/sec without ever reaching a full cycle.
    let now = 0;
    for (let frame = 0; frame < 9; frame += 1) {
      now += 100;
      scheduler.frame(now);
    }
    expect(steps).toHaveLength(0);

    // Drop to 20 gen/sec. Without the FD3 clamp the shipped RFC-002 §5 snippet drains the whole
    // 900 ms bank one step per frame for 18 frames — a ~300 ms fast-forward, the burst Decision
    // D.3 forbids reached through the slider instead of a suspended tab.
    msPerCycleRef.current = 50;
    now += 10;
    scheduler.frame(now);
    expect(steps).toHaveLength(1);

    // Steady cadence resumes: one step roughly every 3 frames of 16.7 ms (3 * 16.7 = 50.1).
    for (let frame = 0; frame < 9; frame += 1) {
      now += 16.7;
      scheduler.frame(now);
    }
    expect(steps).toHaveLength(4); // 1 + floor((10 + 9 * 16.7) / 50) = 1 + 3
  });

  it('steps once, not twice, when the clamped bank plus the delta reach two cycles (if, never while)', () => {
    // The one frame where `if` and `while` differ. After the two clamps the accumulator is
    // `min(900, 50) + min(60, 50) = 100 = 2 * ms`: a `while` steps twice here, the `if` once and
    // carries 50 ms into the next frame — which is why that next frame steps again on a 0 ms
    // delta (no `while` can be told apart from the `if` in steady state, only here).
    const { loop, scheduler, steps, msPerCycleRef } = createHarness(1000);
    loop.start();

    scheduler.frame(0);
    scheduler.frame(900); // bank 900 ms, no step
    expect(steps).toHaveLength(0);

    msPerCycleRef.current = 50;
    scheduler.frame(960); // delta 60
    expect(steps).toHaveLength(1);

    scheduler.frame(960); // delta 0: the carried 50 ms is a whole cycle at the new speed
    expect(steps).toHaveLength(2);
  });
});

describe('repaint only after a step (AC5)', () => {
  it('never calls draw on an idle frame, and calls it once with the grid step() returned', () => {
    const { loop, scheduler, steps, draws } = createHarness(1000); // 1 gen/sec
    loop.start();

    let now = 0;
    scheduler.frame(now); // primes
    for (let frame = 0; frame < 60; frame += 1) {
      now += 16.7;
      scheduler.frame(now);
    }

    expect(steps).toHaveLength(1);
    expect(draws).toHaveLength(1);
    expect(draws[0]).toBe(steps[0]);
  });
});

describe('msPerCycleRef is read live, every frame (AR-34, FR-4.2)', () => {
  it('reacts to a ref write on the very next frame, with no restart', () => {
    const { loop, scheduler, steps, msPerCycleRef } = createHarness(1000);
    loop.start();

    scheduler.frame(0); // primes
    scheduler.frame(500); // accumulator = 500, ms = 1000 -> no step
    expect(steps).toHaveLength(0);

    msPerCycleRef.current = 100; // no start()/stop() — the ref write IS the whole speed change
    scheduler.frame(501); // delta = 1; accumulator = min(500, 100) + min(1, 100) = 101 >= 100
    expect(steps).toHaveLength(1);
  });
});

describe('start()/stop() idempotency and cancellation (AC6, AC8)', () => {
  it('start() twice leaves exactly one frame chain outstanding', () => {
    const { loop, scheduler } = createHarness(100);
    loop.start();
    loop.start();

    expect(scheduler.requestCount).toBe(1);
    expect(scheduler.pending()).toBe(1);
    expect(loop.isRunning()).toBe(true);
  });

  it('stop() twice results in exactly one cancel', () => {
    const { loop, scheduler } = createHarness(100);
    loop.start();
    loop.stop();
    loop.stop();

    expect(scheduler.cancelledCount).toBe(1);
    expect(loop.isRunning()).toBe(false);
  });

  it('stop() on a stopped loop is a no-op', () => {
    const { loop, scheduler } = createHarness(100);
    loop.stop();

    expect(scheduler.cancelledCount).toBe(0);
    expect(loop.isRunning()).toBe(false);
  });

  it('stop() cancels the outstanding handle through the scheduler, and no callback fires afterwards', () => {
    const { loop, scheduler } = createHarness(100);
    loop.start();
    loop.stop();

    expect(scheduler.lastCancelledHandle).toBe(1); // the handle start() was granted
    expect(scheduler.pending()).toBe(0);
    expect(() => scheduler.frame(1000)).toThrow(/no pending callback/);
  });
});

describe('stop() called from inside step() is honoured (AC7)', () => {
  it('still repaints the final grid, and requests no further frame', () => {
    const { loop, scheduler, steps, draws } = createHarness(100, (l) => l.stop());
    loop.start();

    scheduler.frame(0); // primes
    scheduler.frame(200); // delta clamps to 100 -> exactly one step, which calls stop()

    expect(steps).toHaveLength(1);
    expect(draws).toHaveLength(1); // the repaint for THIS step still happens
    expect(draws[0]).toBe(steps[0]);
    expect(scheduler.pending()).toBe(0); // no further frame was requested
    expect(loop.isRunning()).toBe(false);
  });

  it('stop() then start() from inside step() hands the chain over instead of doubling it', () => {
    // A reset-and-replay path. `start()` inside `step()` requests the next frame itself; the
    // trailing re-request must recognise that the executing frame is no longer the outstanding
    // one, or two chains run side by side and the sim steps at 2x with nothing thrown.
    const { loop, scheduler, steps } = createHarness(100, (l) => {
      l.stop();
      l.start();
    });
    loop.start();

    scheduler.frame(0);
    scheduler.frame(100); // steps once; step() restarts the loop
    expect(steps).toHaveLength(1);
    expect(scheduler.pending()).toBe(1);
    expect(loop.isRunning()).toBe(true);

    // The restarted loop primes on its next frame (FD4) and then runs at the normal cadence —
    // a doubled chain would step on the priming frame's successor twice as fast.
    scheduler.frame(200); // primes the restarted loop
    scheduler.frame(300); // one cycle
    expect(steps).toHaveLength(2);
    expect(scheduler.pending()).toBe(1);
  });
});

describe('a throwing step() or draw() stops the loop instead of wedging it', () => {
  it('rethrows, reports not running, and lets start() begin a fresh chain', () => {
    const boom = new Error('rule evaluation failed');
    const { loop, scheduler, steps } = createHarness(100, () => {
      throw boom;
    });
    loop.start();

    scheduler.frame(0);
    expect(() => scheduler.frame(100)).toThrow(boom);
    expect(steps).toHaveLength(1);
    expect(loop.isRunning()).toBe(false);
    expect(scheduler.pending()).toBe(0);

    // Not wedged: a second start() is honoured, not swallowed by the idempotency guard.
    loop.start();
    expect(loop.isRunning()).toBe(true);
    expect(scheduler.pending()).toBe(1);
  });
});

describe('the primed first frame (AC6, FD4)', () => {
  it('never steps on the first frame after start(), regardless of its timestamp', () => {
    const { loop, scheduler, steps } = createHarness(1);
    loop.start();

    scheduler.frame(999_999_999); // a huge timestamp — still the FIRST frame, so it only primes
    expect(steps).toHaveLength(0);
  });

  it('start() after stop() does not inherit the old accumulator', () => {
    const { loop, scheduler, steps } = createHarness(100);
    loop.start();

    let now = 0;
    scheduler.frame(now); // primes
    now += 90;
    scheduler.frame(now); // accumulator = 90, no step yet
    expect(steps).toHaveLength(0);

    loop.stop();
    loop.start();

    now = 1000; // an unrelated clock origin — the primed frame ignores it either way
    scheduler.frame(now); // primes again; a real restart would drop the banked 90 ms here
    now += 20;
    scheduler.frame(now); // delta = 20; if the old 90 ms had survived this would be 110 >= 100
    expect(steps).toHaveLength(0);
  });
});

describe('property: no frame ever steps twice, and draw count equals step count (AC10, AR-41)', () => {
  const LADDER = [50, 100, 200, 500, 1000] as const;
  const deltaArb = fc.double({ min: 0, max: 20_000, noNaN: true, noDefaultInfinity: true });

  it('holds for any sequence of frame deltas, with msPerCycle changing between frames', () => {
    // `ms` is redrawn from the ladder before every frame, so the FD3 clamp and the if-vs-while
    // frame are inside the search space rather than outside it.
    fc.assert(
      fc.property(
        fc.array(fc.tuple(deltaArb, fc.constantFrom(...LADDER)), { maxLength: 200 }),
        fc.constantFrom(...LADDER),
        (frames, initialMs) => {
          const { loop, scheduler, steps, draws, msPerCycleRef } = createHarness(initialMs);
          loop.start();

          let now = 0;
          scheduler.frame(now); // primes

          for (const [delta, ms] of frames) {
            const stepsBefore = steps.length;
            msPerCycleRef.current = ms;
            now += delta;
            scheduler.frame(now);
            expect(steps.length - stepsBefore).toBeLessThanOrEqual(1);
          }

          expect(draws.length).toBe(steps.length);
        },
      ),
    );
  });

  it('at constant msPerCycle, the step count is exactly the clamped elapsed time in cycles', () => {
    // With `ms` fixed the accumulator never reaches `2 * ms`, so the `if` never misses and the
    // count is `floor(sum(min(delta, ms)) / ms)` — a bound a reset-to-zero accumulator, a missing
    // delta clamp, or an every-frame stepper all violate. ±1 absorbs float accumulation only.
    fc.assert(
      fc.property(
        fc.array(deltaArb, { maxLength: 200 }),
        fc.constantFrom(...LADDER),
        (deltas, ms) => {
          const { loop, scheduler, steps } = createHarness(ms);
          loop.start();

          let now = 0;
          scheduler.frame(now);
          let clampedElapsed = 0;
          for (const delta of deltas) {
            now += delta;
            scheduler.frame(now);
            clampedElapsed += Math.min(delta, ms);
          }

          const expected = Math.floor(clampedElapsed / ms);
          expect(Math.abs(steps.length - expected)).toBeLessThanOrEqual(1);
        },
      ),
    );
  });
});
