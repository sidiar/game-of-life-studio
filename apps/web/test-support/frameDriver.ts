/**
 * A manual `requestAnimationFrame` queue installed on `window` (Story 3.11 FD4, lifted here by
 * the Story 4.15 review — the third copy: `BattleSimulationView.test.tsx`, `PreviewPanel.test.tsx`
 * and `OrganismEditorModal.test.tsx` all drive the same hook through the same globals). The
 * views take no `scheduler` prop, so their tests drive real frames by spying on
 * `window.requestAnimationFrame` / `cancelAnimationFrame` — `rafScheduler` looks the globals up
 * at call time, which is the whole reason a `vi.spyOn(window, …)` is a complete fake. Mirrors
 * `useSimulation.test.ts`'s `createFakeScheduler`, installed on `window` instead of injected.
 *
 * `frame(now)` fires every callback queued BEFORE the call, as RAF does; a re-request from inside
 * a callback lands in the next frame. The callbacks publish React state (`setView`), so the batch
 * runs inside `act` and the resulting re-render is flushed before the caller's assertion.
 *
 * Test-only (`vi.restoreAllMocks()` in the caller's `afterEach` removes the spies); never imported
 * by component code, matching `recordingContext2d.ts`.
 */
import { act } from '@testing-library/react';
import { vi } from 'vitest';

export function installFrameDriver() {
  const queue: { handle: number; callback: FrameRequestCallback }[] = [];
  let nextHandle = 1;
  const raf = vi
    .spyOn(window, 'requestAnimationFrame')
    .mockImplementation((callback: FrameRequestCallback) => {
      const handle = nextHandle++;
      queue.push({ handle, callback });
      return handle;
    });
  const caf = vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((handle: number) => {
    const index = queue.findIndex((entry) => entry.handle === handle);
    if (index !== -1) queue.splice(index, 1);
  });
  return {
    raf,
    caf,
    /** Fires every callback queued before this call, inside `act`. */
    frame(now: number): void {
      const batch = queue.splice(0);
      act(() => {
        for (const entry of batch) entry.callback(now);
      });
    },
    pending: () => queue.length,
    /** The handle from the most recently requested frame — what a `stop()` must cancel. */
    lastHandle: (): number | undefined => raf.mock.results.at(-1)?.value as number | undefined,
  };
}
