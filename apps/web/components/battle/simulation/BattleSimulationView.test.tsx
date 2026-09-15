import { StrictMode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import type { Organism } from '@gol/domain';
import { gridFromDense } from '@gol/simulation';
import { createMockOrganisms, gridFromPattern } from '@gol/test-utils';
import { GridRenderer } from '@/lib/canvas/gridRenderer';
import { buildRefToFillGroup } from '@/lib/canvas/refToFillGroup';
import { resetColourStateWarnings } from '@/lib/canvas/colourStateGroups';
import { RecordingContext2D } from '@/test-support/recordingContext2d';
import BattleSimulationView, { type BattleSimulationViewProps } from './BattleSimulationView';

const COLORS = { background: '#0a0a0a', gridLine: 'rgb(51 51 51 / 0.3)' };
const ORGANISMS: readonly Organism[] = createMockOrganisms();
const LEGEND = { '.': 0, a: 1, b: 2, c: 3 } as const;
// Every dimension deliberately off the two editable presets (Decision A) and small enough that a
// recording context's call log stays readable. Ref 2 placed alongside ref 1 — the roster-order
// wiring under test (M14: `organisms[ref - 1]`).
const GRID = gridFromDense(
  gridFromPattern(['.......', '..a.b..', '..a.b..', '..a.b..', '.......'], LEGEND),
);
const PALETTE = buildRefToFillGroup(
  ORGANISMS.map((o) => o.id),
  new Map(ORGANISMS.map((o) => [o.id, o] as const)),
);

function installContexts(): Map<HTMLCanvasElement, RecordingContext2D> {
  const contexts = new Map<HTMLCanvasElement, RecordingContext2D>();
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (
    this: HTMLCanvasElement,
  ) {
    let context = contexts.get(this);
    if (context === undefined) {
      context = new RecordingContext2D();
      contexts.set(this, context);
    }
    return context as unknown as CanvasRenderingContext2D;
  });
  return contexts;
}

function view(overrides: Partial<BattleSimulationViewProps> = {}) {
  return (
    <BattleSimulationView
      initialGrid={GRID}
      organisms={ORGANISMS}
      startingSpeed={10}
      showGridLines
      palette={PALETTE}
      colors={COLORS}
      onBack={vi.fn()}
      {...overrides}
    />
  );
}

function root(container: HTMLElement): HTMLElement {
  const element = container.querySelector<HTMLElement>('[data-status]');
  if (element === null) throw new Error('the view root (data-status) is not mounted');
  return element;
}

/**
 * FD4 (Task 4): the view takes no `scheduler` prop (Story 3.11's props list was decided against
 * exactly that class of thing), so its tests drive real frames by spying on
 * `window.requestAnimationFrame` / `cancelAnimationFrame` with a manual queue — `rafScheduler`
 * looks the globals up at call time, which is the whole reason a `vi.spyOn(window, …)` is a
 * complete fake. `frame(now)` fires every callback queued BEFORE the call, as RAF does; a
 * re-request from inside a callback lands in the next frame. Mirrors
 * `useSimulation.test.ts`'s `createFakeScheduler`, installed on `window` instead of injected.
 */
function installFrameDriver() {
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
    /** Fires every callback queued before this call, inside `act` — the callbacks publish React
     * state (`setView`), so the resulting re-render has to be flushed before the assertion. */
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

afterEach(() => {
  vi.restoreAllMocks();
  resetColourStateWarnings();
});

describe('BattleSimulationView (Story 3.11)', () => {
  // AC3: paused at cycle 0, observable on the root in EVERY state — an absent attribute and a
  // wrong one are indistinguishable to a test with the wrong selector (Story 2.11's `data-dirty`).
  it('starts paused at cycle 0, on the view root', () => {
    const { container } = render(view());

    expect(root(container)).toHaveAttribute('data-status', 'paused');
    expect(root(container)).toHaveAttribute('data-cycle', '0');
  });

  // AC10, converted for Story 3.12: the transport bar is here now (four buttons total) — speed
  // (3.13), the counter/stats (3.14) and grid size (3.16) are still absent, and the sidebar still
  // carries no section heading.
  it('renders the footer’s Back button and the transport bar: four buttons, no h2, no slider', () => {
    render(view());

    expect(screen.getAllByRole('button')).toHaveLength(4);
    expect(screen.getByRole('button', { name: 'Back to Battles' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Play' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Next cycle' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Stop & reset' })).toBeEnabled();
    expect(screen.queryAllByRole('heading', { level: 2 })).toHaveLength(0);
    expect(screen.queryByRole('slider')).toBeNull();
  });

  it('forwards the footer’s press to onBack, and `backDisabled` disables it', async () => {
    const user = userEvent.setup();
    const onBack = vi.fn();
    const { rerender } = render(view({ onBack }));

    await user.click(screen.getByRole('button', { name: 'Back to Battles' }));
    expect(onBack).toHaveBeenCalledTimes(1);

    rerender(view({ onBack, backDisabled: true }));
    expect(screen.getByRole('button', { name: 'Back to Battles' })).toBeDisabled();
  });

  // `readGridColors` is null under jsdom (no token layer): the dish BOX renders, the canvas does
  // not — the same "unavailable -> blank dish, same box" degradation the editor and BattleTile use.
  // The box has no role of its own, so what is pinned here is the half a test can see: no canvas,
  // and a view that still reports its state (the sidebar's footer is asserted separately).
  it('with colors === null renders no canvas and still reports paused at cycle 0', () => {
    const { container } = render(view({ colors: null }));

    expect(container.querySelector('canvas')).toBeNull();
    expect(root(container)).toHaveAttribute('data-status', 'paused');
    expect(root(container)).toHaveAttribute('data-cycle', '0');
    expect(screen.getByRole('button', { name: 'Back to Battles' })).toBeInTheDocument();
  });

  // AC5: the playback canvas is PAINTED at cycle 0 — by the hook's prime (`paintFull`: `resize`
  // then `drawFull`), never by the canvas. Exactly one full paint on entering Run.
  it('mounts the playback canvas with its name and full-paints it exactly once', () => {
    const contexts = installContexts();
    const drawFullSpy = vi.spyOn(GridRenderer.prototype, 'drawFull');
    const { container } = render(view());

    const canvas = screen.getByRole('img', { name: 'Petri dish, 7 by 5 cells' });
    expect(canvas).toBe(container.querySelector('canvas'));
    expect(drawFullSpy).toHaveBeenCalledTimes(1);
    // Byte-equal to `initialGrid`, through the hook's clone (AR-31: never the persisted grid itself).
    const painted = drawFullSpy.mock.calls[0][0];
    expect(painted).not.toBe(GRID);
    expect(Array.from(painted.occupant)).toEqual(Array.from(GRID.occupant));
    expect(Array.from(painted.age)).toEqual(Array.from(GRID.age));
    expect([painted.width, painted.height]).toEqual([GRID.width, GRID.height]);
    const recording = contexts.get(canvas as HTMLCanvasElement) as RecordingContext2D;
    expect(recording.calls.filter((call) => call.op === 'fillRect').length).toBeGreaterThan(0);
  });

  // The cheap, strong invariant of a skeleton that never calls `play()`: paused at cycle 0 means
  // no animation frame is ever requested — not on mount, not on unmount.
  it('requests no animation frame while paused, and unmounts without throwing', () => {
    installContexts();
    const raf = vi.spyOn(window, 'requestAnimationFrame');
    const { unmount } = render(view());

    expect(raf).not.toHaveBeenCalled();
    expect(() => unmount()).not.toThrow();
    expect(raf).not.toHaveBeenCalled();
  });

  // StrictMode double-invokes effects: the canvas builds two renderers, the first's cleanup
  // detaches, the second attaches — the hook handles attach/detach/attach (3.10 AC9). The view
  // must settle to ONE canvas at cycle 0 either way — AND that canvas must be painted: "one canvas"
  // alone is true even if the hook ended up detached after the replay (Story 3.11 review).
  it('settles under StrictMode: one canvas, paused at cycle 0, and the surviving renderer is primed', () => {
    const contexts = installContexts();
    const drawFullSpy = vi.spyOn(GridRenderer.prototype, 'drawFull');
    const { container } = render(<StrictMode>{view()}</StrictMode>);

    expect(container.querySelectorAll('canvas')).toHaveLength(1);
    expect(root(container)).toHaveAttribute('data-cycle', '0');
    // One prime per attach that met a session: the first renderer's (before the simulated
    // unmount) and the second's (after the replay). A detached survivor would leave this at 1.
    expect(drawFullSpy).toHaveBeenCalledTimes(2);
    const canvas = container.querySelector('canvas') as HTMLCanvasElement;
    const recording = contexts.get(canvas) as RecordingContext2D;
    expect(recording.calls.filter((call) => call.op === 'fillRect').length).toBeGreaterThan(0);
  });

  // Roster-order wiring through the REAL hook: a two-organism roster with ref 2 placed compiles
  // and primes without throwing. `compileSession` on the mock organisms is pinned elsewhere; what
  // is under test here is that the view hands the roster through in order (3.10 obligation 2).
  it('runs a two-organism roster with ref 2 placed, through the real hook, staying at cycle 0', () => {
    const two = ORGANISMS.slice(0, 2);
    const palette = buildRefToFillGroup(
      two.map((o) => o.id),
      new Map(two.map((o) => [o.id, o] as const)),
    );
    const grid = gridFromDense(gridFromPattern(['.b.', '.b.', '.b.'], LEGEND));

    const { container } = render(view({ organisms: two, initialGrid: grid, palette }));

    expect(root(container)).toHaveAttribute('data-cycle', '0');
    expect(root(container)).toHaveAttribute('data-status', 'paused');
  });

  it('has no axe violations', async () => {
    const { container } = render(view());
    expect((await axe(container)).violations).toEqual([]);
  });
});

describe('BattleSimulationView — transport (Story 3.12)', () => {
  // (a)+(b)+(c): one continuous run, because "resume" only means something against a PRIOR pause —
  // splitting these into independent renders would lose the "same buffers, no re-clone" fact (c)
  // is about. Determinism per trap 7: only `data-cycle` and renderer-method counts are asserted,
  // never cell contents — the fixture's two blinkers collide at cycle 1.
  it('Play requests one frame and keeps focus on the toggle; Pause cancels it; Play again resumes without re-cloning (AC3, AC4)', async () => {
    installContexts();
    const driver = installFrameDriver();
    const drawFullSpy = vi.spyOn(GridRenderer.prototype, 'drawFull');
    const drawDiffSpy = vi.spyOn(GridRenderer.prototype, 'drawDiff');
    const user = userEvent.setup();
    const { container } = render(view({ startingSpeed: 10 }));
    expect(drawFullSpy).toHaveBeenCalledTimes(1); // the mount prime (trap 5)

    // (a) Play — keyboard activation (AC3): focus first, Enter fires the click, and the SAME
    // element must carry focus once its name has flipped to "Pause".
    const playButton = screen.getByRole('button', { name: 'Play' });
    playButton.focus();
    await user.keyboard('{Enter}');

    expect(root(container)).toHaveAttribute('data-status', 'playing');
    expect(driver.pending()).toBe(1);
    const pauseButton = screen.getByRole('button', { name: 'Pause' });
    expect(pauseButton).toBe(playButton);
    expect(pauseButton).toHaveFocus();

    driver.frame(0); // FD4: primes the clock, contributes no delta (Story 3.8 FD4).
    expect(root(container)).toHaveAttribute('data-cycle', '0');
    expect(drawDiffSpy).not.toHaveBeenCalled();

    driver.frame(100); // one cycle at 10 gen/sec (msPerCycle = 100).
    expect(root(container)).toHaveAttribute('data-cycle', '1');
    expect(drawDiffSpy).toHaveBeenCalledTimes(1);

    driver.frame(200);
    expect(root(container)).toHaveAttribute('data-cycle', '2');
    expect(drawDiffSpy).toHaveBeenCalledTimes(2);

    // (b) Pause — cancels the outstanding frame with its own handle, and a stray frame after
    // cancellation advances nothing.
    const outstandingHandle = driver.lastHandle();
    const pauseTarget = screen.getByRole('button', { name: 'Pause' });
    act(() => pauseTarget.click());

    expect(root(container)).toHaveAttribute('data-status', 'paused');
    expect(root(container)).toHaveAttribute('data-cycle', '2');
    expect(driver.caf).toHaveBeenCalledTimes(1);
    expect(driver.caf).toHaveBeenCalledWith(outstandingHandle);
    expect(driver.pending()).toBe(0);

    driver.frame(300); // stray — the queue is empty, this is a no-op.
    expect(root(container)).toHaveAttribute('data-cycle', '2');
    expect(drawDiffSpy).toHaveBeenCalledTimes(2);

    // (c) Resume — continues from cycle 2 over the SAME buffers: `drawFull` does not fire again.
    const resumeButton = screen.getByRole('button', { name: 'Play' });
    act(() => resumeButton.click());
    expect(root(container)).toHaveAttribute('data-status', 'playing');

    driver.frame(300); // primes again — `start()` resets the clock, not the cycle count.
    expect(root(container)).toHaveAttribute('data-cycle', '2');

    driver.frame(400);
    expect(root(container)).toHaveAttribute('data-cycle', '3');
    expect(drawFullSpy).toHaveBeenCalledTimes(1); // still just the mount — a resume never re-clones.
  });

  // (d): Step is reachable only while paused, advances exactly one cycle, repaints once via
  // `drawDiff`, and requests no animation frame — the manual path bypasses the loop entirely.
  it('Next cycle advances exactly one cycle while paused, with no animation frame requested (AC5)', () => {
    installContexts();
    const driver = installFrameDriver();
    const drawDiffSpy = vi.spyOn(GridRenderer.prototype, 'drawDiff');
    const { container } = render(view());

    act(() => screen.getByRole('button', { name: 'Next cycle' }).click());

    expect(root(container)).toHaveAttribute('data-status', 'paused');
    expect(root(container)).toHaveAttribute('data-cycle', '1');
    expect(drawDiffSpy).toHaveBeenCalledTimes(1);
    expect(driver.raf).not.toHaveBeenCalled();
  });

  // (e), trap 1: a REAL `disabled` attribute means `user-event` never dispatches a click, so
  // `sim.step()`'s throw (3.10 FD5) is never reached from this surface.
  it('Next cycle is really disabled while playing: the click reaches nothing (AC5)', async () => {
    installContexts();
    installFrameDriver();
    const drawDiffSpy = vi.spyOn(GridRenderer.prototype, 'drawDiff');
    const user = userEvent.setup();
    const { container } = render(view());

    act(() => screen.getByRole('button', { name: 'Play' }).click());
    const step = screen.getByRole('button', { name: 'Next cycle' });
    expect(step).toBeDisabled();
    expect(step).toHaveAttribute('title', 'Available while paused');

    await user.click(step);

    // Both halves matter: no frame has fired, so `drawDiff` alone would also be zero if the click
    // had reached `sim.step()` and thrown — `data-cycle` still "0" is what says nothing advanced.
    expect(drawDiffSpy).not.toHaveBeenCalled();
    expect(root(container)).toHaveAttribute('data-cycle', '0');
  });

  // (f): Stop from PLAYING halts the loop, resets to cycle 0, and repaints the INITIAL grid —
  // without rebuilding the canvas (3.11 review patch 1; trap 4).
  it('Stop from playing halts, resets to cycle 0, and repaints without rebuilding the canvas (AC6)', () => {
    installContexts();
    const driver = installFrameDriver();
    const drawFullSpy = vi.spyOn(GridRenderer.prototype, 'drawFull');
    const { container } = render(view({ startingSpeed: 10 }));
    const canvasBefore = container.querySelector('canvas');

    act(() => screen.getByRole('button', { name: 'Play' }).click());
    driver.frame(0);
    driver.frame(100); // cycle 1, so Stop has something to discard.

    act(() => screen.getByRole('button', { name: 'Stop & reset' }).click());

    expect(root(container)).toHaveAttribute('data-status', 'paused');
    expect(root(container)).toHaveAttribute('data-cycle', '0');
    expect(driver.caf).toHaveBeenCalledTimes(1);
    expect(driver.pending()).toBe(0);
    expect(drawFullSpy).toHaveBeenCalledTimes(2); // mount + this Stop (trap 5).
    const painted = drawFullSpy.mock.calls[1][0];
    expect(painted).not.toBe(GRID);
    expect(Array.from(painted.occupant)).toEqual(Array.from(GRID.occupant));
    expect(Array.from(painted.age)).toEqual(Array.from(GRID.age));
    expect([painted.width, painted.height]).toEqual([GRID.width, GRID.height]);
    // Same canvas node — a rebuild would detach and mount a fresh one.
    expect(container.querySelector('canvas')).toBe(canvasBefore);
    expect(container.querySelectorAll('canvas')).toHaveLength(1);
  });

  // (g): Stop from PAUSED — after manual steps, and again at cycle 0 — is the harmless reset FD5
  // calls it: no throw, one more `drawFull`, cycle stays/returns to "0".
  it('Stop from paused resets to cycle 0 whether or not any cycles were stepped (AC6, FD5)', () => {
    installContexts();
    installFrameDriver();
    const drawFullSpy = vi.spyOn(GridRenderer.prototype, 'drawFull');
    const { container } = render(view());

    act(() => screen.getByRole('button', { name: 'Next cycle' }).click());
    act(() => screen.getByRole('button', { name: 'Next cycle' }).click());
    expect(root(container)).toHaveAttribute('data-cycle', '2');

    act(() => screen.getByRole('button', { name: 'Stop & reset' }).click());
    expect(root(container)).toHaveAttribute('data-status', 'paused');
    expect(root(container)).toHaveAttribute('data-cycle', '0');
    expect(drawFullSpy).toHaveBeenCalledTimes(2); // mount + this Stop.

    // Stop again, already at cycle 0 — FD5 (a): not quite a no-op (a fresh seed is minted), but
    // harmless, and never disabled.
    expect(() =>
      act(() => screen.getByRole('button', { name: 'Stop & reset' }).click()),
    ).not.toThrow();
    expect(root(container)).toHaveAttribute('data-cycle', '0');
    expect(drawFullSpy).toHaveBeenCalledTimes(3);
  });

  // (h): axe-clean paused, playing, and after a Stop — ONE render driven through the three states
  // (not the `unmount`-series pattern: the states here are transitions of a single mounted view,
  // and a remount per state would lose exactly that).
  it('has no axe violations paused, playing, and after a Stop', async () => {
    installContexts();
    const driver = installFrameDriver();

    const { container } = render(view());
    expect((await axe(container)).violations).toEqual([]);

    act(() => screen.getByRole('button', { name: 'Play' }).click());
    driver.frame(0);
    expect((await axe(container)).violations).toEqual([]);

    act(() => screen.getByRole('button', { name: 'Stop & reset' }).click());
    expect((await axe(container)).violations).toEqual([]);
  });
});
