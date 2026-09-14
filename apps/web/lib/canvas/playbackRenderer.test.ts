// Story 3.9 Task 3 (AC3) — the adapter that closes Story 3.8's Trap 1: a raw `GridRenderer` type-
// checks as a `StepRenderer` and paints nothing, because `draw` is the marks-only Edit path and
// the loop marks no cells. This is the ONLY test in apps/web that constructs
// `createSimulationLoop` — Story 3.10's worked example for wiring `useSimulation`.
import { createGrid, createSimulationLoop, type Grid, type SimulationLoop } from '@gol/simulation';
import { describe, expect, it } from 'vitest';
import { toStepRenderer } from './playbackRenderer';

describe('toStepRenderer (Story 3.9 Task 3)', () => {
  it('forwards draw(grid) to renderer.drawDiff(grid), exactly once, with the same grid and nothing else', () => {
    const calls: Grid[] = [];
    const fakeRenderer = { drawDiff: (grid: Grid) => calls.push(grid) };
    const grid = createGrid(2, 2);

    const stepRenderer = toStepRenderer(fakeRenderer);
    stepRenderer.draw(grid);

    expect(calls).toEqual([grid]);
  });

  it('satisfies the StepRenderer port — createSimulationLoop drives it through one real frame', () => {
    // A minimal fake FrameScheduler (simulationLoop.test.ts's FD5(a) pattern): a real one-slot
    // queue, not a single-callback stub, so a doubled request chain would be observable here too.
    // Boxed in an object rather than a bare `let` — TS's control-flow narrowing cannot follow a
    // captured variable reassigned from inside a callback it itself invokes.
    const pendingBox: { current: ((now: number) => void) | null } = { current: null };
    const scheduler = {
      request(callback: (now: number) => void): number {
        pendingBox.current = callback;
        return 1;
      },
      cancel(): void {
        pendingBox.current = null;
      },
    };
    function fireFrame(now: number): void {
      const callback = pendingBox.current;
      if (callback === null) throw new Error('scheduler.request was never called');
      pendingBox.current = null;
      callback(now);
    }

    const drawDiffCalls: Grid[] = [];
    const fakeGridRenderer = { drawDiff: (grid: Grid) => drawDiffCalls.push(grid) };
    const stepGrid = createGrid(1, 1);
    let stepCalls = 0;

    const loop: SimulationLoop = createSimulationLoop({
      renderer: toStepRenderer(fakeGridRenderer),
      step: (): Grid => {
        stepCalls += 1;
        return stepGrid;
      },
      msPerCycleRef: { current: 50 },
      scheduler,
    });

    loop.start();
    fireFrame(0); // primes the clock, no step (FD4)
    fireFrame(50); // exactly one cycle's worth of delta -> exactly one step

    expect(stepCalls).toBe(1);
    expect(drawDiffCalls).toEqual([stepGrid]); // the loop calls draw(), which forwards to drawDiff()
  });
});
