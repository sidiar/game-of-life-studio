import type { FrameScheduler } from '@gol/simulation';

/**
 * The production `FrameScheduler` (`packages/simulation/src/loop/simulationLoop.ts`): the DOM's
 * `requestAnimationFrame` / `cancelAnimationFrame`, bound. Both properties the loop relies on hold
 * of RAF by specification — the callback fires asynchronously, after `request` has returned its
 * handle, and cancelling a handle that has already fired is a no-op.
 *
 * ⚠️ Arrow wrappers, NOT bare method references (`request: window.requestAnimationFrame`). An
 * unbound `requestAnimationFrame` invoked as a plain function throws `Illegal invocation` in some
 * browsers because `this` is no longer `window`.
 *
 * This is the ONLY file in `useSimulation`'s import graph that names a DOM global (AC9). The hook
 * itself stays DOM-free so its tests can drive it with an in-memory scheduler and so Story 4.15's
 * preview can run it headless; keep it that way.
 */
export const rafScheduler: FrameScheduler = {
  request: (callback) => window.requestAnimationFrame(callback),
  cancel: (handle) => window.cancelAnimationFrame(handle),
};
