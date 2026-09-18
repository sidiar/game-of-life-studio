import { Profiler, StrictMode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import { CONWAYS_CLASSIC, type Organism } from '@gol/domain';
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
      fullscreen={false}
      onExitFullscreen={vi.fn()}
      onEnterFullscreen={vi.fn()}
      battleTitle="Three-Way Skirmish"
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

  // AC10, converted for Story 3.16 (trap 1): Grid Size joins Population Analysis, Cycle Count
  // (3.14) and Speed (3.13) — four buttons, FOUR h2s (named, in order), TWO sliders. Written as
  // exact counts, never `>= `, so the next section fails this first and converts it.
  it('renders the footer’s Back button, the transport bar and four sidebar sections: four buttons, four h2s, two sliders', () => {
    render(view());

    expect(screen.getAllByRole('button')).toHaveLength(4);
    expect(screen.getByRole('button', { name: 'Back to Battles' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Play' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Next cycle' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Stop & reset' })).toBeEnabled();
    // Exact names, not a substring, in order: the mockup's "Speed Multiplier" (FD3 rejected it)
    // would pass a `toHaveTextContent('Speed')`.
    const headings = screen.queryAllByRole('heading', { level: 2 });
    expect(headings).toHaveLength(4);
    expect(headings.map((h) => h.textContent)).toEqual([
      'Population Analysis',
      'Cycle Count',
      'Speed',
      'Grid Size',
    ]);
    expect(screen.getAllByRole('slider')).toHaveLength(2);
    expect(screen.getByRole('slider', { name: 'Generations per second' })).toBeInTheDocument();
    expect(screen.getByRole('slider', { name: 'Grid dimensions' })).toBeInTheDocument();
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

describe('BattleSimulationView — speed control (Story 3.13)', () => {
  const speedSlider = () => screen.getByRole('slider', { name: 'Generations per second' });

  // (a): the prop reaches the control through the hook's published `genPerSec`, not directly —
  // the slider is the only observable, so that is what is asserted.
  it('mounts the slider at the starting speed’s ladder index (AC2)', () => {
    installContexts();
    const { unmount } = render(view({ startingSpeed: 10 }));
    expect(speedSlider()).toHaveValue('3');
    expect(speedSlider()).toHaveAttribute('aria-valuetext', '10 generations per second');
    unmount();

    render(view({ startingSpeed: 2 }));
    expect(speedSlider()).toHaveValue('1');
    expect(speedSlider()).toHaveAttribute('aria-valuetext', '2 generations per second');
  });

  // (b): the live path (AR-34, FR-4.2 "without pausing"). A speed change is a ref write the loop
  // reads on its NEXT frame — nothing is cancelled, nothing is re-requested, nothing is re-cloned.
  // Reddens if a speed change restarts the loop (`cancelAnimationFrame` called, or the pending
  // handle changes) or re-clones (`drawFull` +1). Trap 1: at 20 gen/sec `cyclesPerPublish` is 2, so
  // `data-cycle` shows EVEN cycles only — "one step per frame" is asserted on `drawDiff`.
  it('changes speed while playing without cancelling or re-requesting the frame, and steps at the new period from the next frame (AC4, AC5)', () => {
    installContexts();
    const driver = installFrameDriver();
    const drawFullSpy = vi.spyOn(GridRenderer.prototype, 'drawFull');
    const drawDiffSpy = vi.spyOn(GridRenderer.prototype, 'drawDiff');
    const { container } = render(view({ startingSpeed: 10 }));
    expect(drawFullSpy).toHaveBeenCalledTimes(1); // the mount prime

    act(() => screen.getByRole('button', { name: 'Play' }).click());
    driver.frame(0); // prime the clock
    driver.frame(100); // one cycle at 10 gen/sec
    expect(root(container)).toHaveAttribute('data-cycle', '1');
    expect(drawDiffSpy).toHaveBeenCalledTimes(1);
    const handleBefore = driver.lastHandle();
    const rafCallsBefore = driver.raf.mock.calls.length;

    fireEvent.change(speedSlider(), { target: { value: '4' } });

    expect(speedSlider()).toHaveValue('4');
    expect(speedSlider()).toHaveAttribute('aria-valuetext', '20 generations per second');
    expect(root(container)).toHaveAttribute('data-status', 'playing');
    expect(root(container)).toHaveAttribute('data-cycle', '1');
    expect(driver.caf).not.toHaveBeenCalled();
    expect(driver.pending()).toBe(1);
    expect(driver.lastHandle()).toBe(handleBefore); // the SAME chain
    expect(driver.raf.mock.calls.length).toBe(rafCallsBefore);
    expect(drawFullSpy).toHaveBeenCalledTimes(1); // no re-clone

    // From the next frame the period is 50 ms: one step per 50 ms frame (D.2's `if`, never a
    // `while`), so 50 ms is a whole cycle where it was half of one at 10 gen/sec.
    driver.frame(150);
    expect(drawDiffSpy).toHaveBeenCalledTimes(2);
    expect(root(container)).toHaveAttribute('data-cycle', '2'); // even: published

    driver.frame(200);
    expect(drawDiffSpy).toHaveBeenCalledTimes(3);
    expect(root(container)).toHaveAttribute('data-cycle', '2'); // cycle 3 stepped, NOT published

    driver.frame(250);
    expect(drawDiffSpy).toHaveBeenCalledTimes(4);
    expect(root(container)).toHaveAttribute('data-cycle', '4');
  });

  // (c), trap 3: slowing DOWN (10 -> 1 gen/sec) never lets the old cadence "finish its cycle" —
  // the next 100 ms frame steps nothing against the new 1000 ms period, and the next full period
  // steps exactly once (every cycle publishes at 1 gen/sec, so `data-cycle` is exact here).
  it('slowing down while playing steps nothing on the next 100 ms frame and once on the next full period (AC4)', () => {
    installContexts();
    const driver = installFrameDriver();
    const drawDiffSpy = vi.spyOn(GridRenderer.prototype, 'drawDiff');
    const { container } = render(view({ startingSpeed: 10 }));

    act(() => screen.getByRole('button', { name: 'Play' }).click());
    driver.frame(0);
    driver.frame(100);
    driver.frame(200);
    expect(root(container)).toHaveAttribute('data-cycle', '2');
    expect(drawDiffSpy).toHaveBeenCalledTimes(2);

    fireEvent.change(speedSlider(), { target: { value: '0' } }); // 1 gen/sec = 1000 ms
    expect(speedSlider()).toHaveValue('0');
    expect(root(container)).toHaveAttribute('data-status', 'playing');

    driver.frame(300); // 100 ms of a 1000 ms period: no step
    expect(drawDiffSpy).toHaveBeenCalledTimes(2);
    expect(root(container)).toHaveAttribute('data-cycle', '2');

    driver.frame(1300); // one full period: exactly one step, published (every cycle at 1 gen/sec)
    expect(drawDiffSpy).toHaveBeenCalledTimes(3);
    expect(root(container)).toHaveAttribute('data-cycle', '3');
  });

  // (c'), Story 3.8 FD3 through the slider: the accumulator cap is a no-op when `ms` GROWS (test
  // (c) above), and bites when it SHRINKS — a bank built at 1 gen/sec (up to 999 ms) drained at
  // 20 gen/sec would otherwise be ~18 steps in 18 frames, the burst Decision D.3 forbids reached
  // through the slider instead of a suspended tab. Frames are 16 ms here, below the 50 ms period,
  // so a drained bank would show as a step on EVERY frame; with the cap it is one step for the
  // bank, then one per ~3 frames. Reddens if the loop's `Math.min(accumulator, ms)` is removed.
  it('speeding up while playing drains at most one banked step, never a burst (AC4)', () => {
    installContexts();
    const driver = installFrameDriver();
    const drawDiffSpy = vi.spyOn(GridRenderer.prototype, 'drawDiff');
    const { container } = render(view({ startingSpeed: 1 }));

    act(() => screen.getByRole('button', { name: 'Play' }).click());
    driver.frame(0);
    let now = 0;
    for (let frame = 0; frame < 9; frame += 1) {
      now += 100; // bank 900 ms without reaching a 1000 ms cycle
      driver.frame(now);
    }
    expect(drawDiffSpy).not.toHaveBeenCalled();
    expect(root(container)).toHaveAttribute('data-cycle', '0');

    fireEvent.change(speedSlider(), { target: { value: '4' } }); // 20 gen/sec = 50 ms
    expect(root(container)).toHaveAttribute('data-status', 'playing');

    for (let frame = 0; frame < 6; frame += 1) {
      now += 16;
      driver.frame(now);
    }
    // Cap: min(900, 50) + 16 = 66 -> one step (carry 16); then 32, 48, 64 -> step (carry 14);
    // 30, 46 -> none. Two steps in six frames; an uncapped bank would have stepped on all six.
    expect(drawDiffSpy).toHaveBeenCalledTimes(2);
    expect(root(container)).toHaveAttribute('data-cycle', '2');
  });

  // (d): while paused the change is a ref write and a state publish, nothing more — no frame is
  // requested — and the next Play runs at the new speed from its first frame.
  it('changes speed while paused without requesting a frame; the next Play runs at the new speed (AC4)', () => {
    installContexts();
    const driver = installFrameDriver();
    const { container } = render(view({ startingSpeed: 10 }));

    fireEvent.change(speedSlider(), { target: { value: '4' } });

    expect(speedSlider()).toHaveValue('4');
    expect(driver.raf).not.toHaveBeenCalled();
    expect(root(container)).toHaveAttribute('data-status', 'paused');
    expect(root(container)).toHaveAttribute('data-cycle', '0');

    act(() => screen.getByRole('button', { name: 'Play' }).click());
    driver.frame(0);
    driver.frame(50); // cycle 1 — unpublished at 20 gen/sec (trap 1)
    expect(root(container)).toHaveAttribute('data-cycle', '0');
    driver.frame(100); // cycle 2 — published
    expect(root(container)).toHaveAttribute('data-cycle', '2');
  });

  // (e): `stop()` touches buffers, seed and cycle — never `genPerSec`. The intuitive "reset
  // everything" edit is one line away in the hook, and this is the test that reddens.
  it('Stop & reset keeps the chosen speed (AC4)', () => {
    installContexts();
    installFrameDriver();
    render(view({ startingSpeed: 10 }));

    fireEvent.change(speedSlider(), { target: { value: '4' } });
    expect(speedSlider()).toHaveValue('4');

    act(() => screen.getByRole('button', { name: 'Stop & reset' }).click());

    expect(speedSlider()).toHaveValue('4');
    expect(speedSlider()).toHaveAttribute('aria-valuetext', '20 generations per second');
  });

  // (f): AC7 — axe-clean with the section present, paused and playing, and after a live move.
  it('has no axe violations with the Speed section present, paused and playing', async () => {
    installContexts();
    const driver = installFrameDriver();
    const { container } = render(view());
    expect((await axe(container)).violations).toEqual([]);

    act(() => screen.getByRole('button', { name: 'Play' }).click());
    driver.frame(0);
    fireEvent.change(speedSlider(), { target: { value: '4' } });
    expect((await axe(container)).violations).toEqual([]);
  });
});

describe('BattleSimulationView — cycle counter & population stats (Story 3.14)', () => {
  const speedSlider = () => screen.getByRole('slider', { name: 'Generations per second' });
  const rows = () => screen.getAllByRole('listitem');
  // `<CycleCounter>`'s glyph run is split across an `aria-hidden` padding span and a bare text
  // node (FD6), so no element OWNS the string `0042`: RTL's default text matcher finds nothing
  // and a `textContent` function matcher matches every ancestor (`CycleCounter.test.tsx`'s
  // `valueNode` note). Read the digits directly off the section's Counter > Value instead.
  function cycleText(): string {
    const section = screen.getByRole('heading', { name: 'Cycle Count' }).closest('section');
    if (section === null) throw new Error('Cycle Count section not found');
    return section.querySelector('div > div')?.textContent ?? '';
  }

  // The Total Living Cells VALUE, disambiguated from the Speed ladder marks (which include a
  // bare "1" span of their own) by reading it off the label's sibling rather than by text alone.
  function totalLivingText(): string {
    return screen.getByText('Total Living Cells').nextElementSibling?.textContent ?? '';
  }
  // Task 4 (c)/(d): a lone-cell fixture under Conway's Classic — dies at cycle 1 with no RNG and
  // no ties involved (3.12 trap 7's "count tests on Conway's Classic only" rule).
  const LONE_GRID = gridFromDense(gridFromPattern(['...', '.x.', '...'], { '.': 0, x: 1 }));
  const CONWAY_ORGANISMS: readonly Organism[] = [CONWAYS_CLASSIC];
  const CONWAY_PALETTE = buildRefToFillGroup(
    CONWAY_ORGANISMS.map((o) => o.id),
    new Map(CONWAY_ORGANISMS.map((o) => [o.id, o] as const)),
  );

  // (a): mount — four h2s in order (Story 3.16 adds Grid Size); three listitems in order a, b, c
  // (living first, tie at 3 -> roster order, then extinct); c (unplaced, H.2) carries the skull
  // from the first publish.
  it('mounts with the four sections, the roster order and the extinct-at-cycle-0 case (AC1, AC3, AC5)', () => {
    installContexts();
    render(view());

    const headings = screen.getAllByRole('heading', { level: 2 });
    expect(headings.map((h) => h.textContent)).toEqual([
      'Population Analysis',
      'Cycle Count',
      'Speed',
      'Grid Size',
    ]);

    const items = rows();
    expect(items).toHaveLength(3);
    expect(within(items[0]).getByText('Aggressive Colonizer')).toBeInTheDocument();
    expect(within(items[0]).getByText('3 (50%)')).toBeInTheDocument();
    expect(within(items[0]).queryByRole('img', { name: 'extinct' })).not.toBeInTheDocument();
    expect(within(items[1]).getByText('Patient Defender')).toBeInTheDocument();
    expect(within(items[1]).getByText('3 (50%)')).toBeInTheDocument();
    expect(within(items[1]).queryByRole('img', { name: 'extinct' })).not.toBeInTheDocument();
    expect(within(items[2]).getByText('Chaotic Spreader')).toBeInTheDocument();
    expect(within(items[2]).getByText('0 (0%)')).toBeInTheDocument();
    expect(within(items[2]).getByRole('img', { name: 'extinct' })).toBeInTheDocument();

    expect(screen.getByText('Total Living Cells')).toBeInTheDocument();
    expect(totalLivingText()).toBe('6');
    expect(cycleText()).toBe('0000');
  });

  // (b): manual steps publish unconditionally (Story 3.10 FD4) — the counter follows every one.
  it('increments the counter on manual steps, in step with data-cycle (AC6)', () => {
    installContexts();
    const { container } = render(view());
    const root = () => container.querySelector('[data-status]') as HTMLElement;

    act(() => screen.getByRole('button', { name: 'Next cycle' }).click());
    expect(cycleText()).toBe('0001');
    expect(root()).toHaveAttribute('data-cycle', '1');

    act(() => screen.getByRole('button', { name: 'Next cycle' }).click());
    act(() => screen.getByRole('button', { name: 'Next cycle' }).click());
    expect(cycleText()).toBe('0003');
    expect(root()).toHaveAttribute('data-cycle', '3');
  });

  // (c): population follows a publish, deterministically, on Conway's Classic (3.12 trap 7).
  it('publishes the population deterministically as a lone Conway cell dies (AC1, AC3, AC6)', () => {
    installContexts();
    render(
      view({
        organisms: CONWAY_ORGANISMS,
        initialGrid: LONE_GRID,
        palette: CONWAY_PALETTE,
      }),
    );

    expect(rows()).toHaveLength(1);
    expect(within(rows()[0]).getByText("Conway's Classic")).toBeInTheDocument();
    expect(within(rows()[0]).getByText('1 (100%)')).toBeInTheDocument();
    expect(within(rows()[0]).queryByRole('img', { name: 'extinct' })).not.toBeInTheDocument();
    expect(totalLivingText()).toBe('1');
    expect(cycleText()).toBe('0000');

    act(() => screen.getByRole('button', { name: 'Next cycle' }).click());

    expect(within(rows()[0]).getByText('0 (0%)')).toBeInTheDocument();
    expect(within(rows()[0]).getByRole('img', { name: 'extinct' })).toBeInTheDocument();
    expect(totalLivingText()).toBe('0');
    expect(cycleText()).toBe('0001');
  });

  // (d): Stop repaints the initial dish, and the published population/cycle return with it.
  it('resets the population and the counter on Stop & reset (AC6)', () => {
    installContexts();
    render(
      view({
        organisms: CONWAY_ORGANISMS,
        initialGrid: LONE_GRID,
        palette: CONWAY_PALETTE,
      }),
    );

    act(() => screen.getByRole('button', { name: 'Next cycle' }).click());
    act(() => screen.getByRole('button', { name: 'Stop & reset' }).click());

    expect(within(rows()[0]).getByText('1 (100%)')).toBeInTheDocument();
    expect(within(rows()[0]).queryByRole('img', { name: 'extinct' })).not.toBeInTheDocument();
    expect(totalLivingText()).toBe('1');
    expect(cycleText()).toBe('0000');
  });

  // (e): AC7 — updates land at the publish cadence, never per frame. Commits counted with
  // `<Profiler>`; `drawDiff` calls counted separately to confirm every frame still stepped once.
  it('re-renders only at the publish cadence, never per stepped frame (AC7)', () => {
    installContexts();
    const driver = installFrameDriver();
    const drawDiffSpy = vi.spyOn(GridRenderer.prototype, 'drawDiff');
    const onRender = vi.fn();

    render(
      <Profiler id="run" onRender={onRender}>
        {view({ startingSpeed: 10 })}
      </Profiler>,
    );
    onRender.mockClear(); // drop the mount commit — only commits AFTER Play are counted (trap 11)

    act(() => screen.getByRole('button', { name: 'Play' }).click());
    onRender.mockClear(); // drop the Play commit (status: paused -> playing)

    driver.frame(0); // primes the clock — contributes no delta, no publish
    expect(onRender).not.toHaveBeenCalled();

    driver.frame(100); // cycle 1, published
    driver.frame(200); // cycle 2, published
    driver.frame(300); // cycle 3, published
    expect(onRender).toHaveBeenCalledTimes(3);
    expect(drawDiffSpy).toHaveBeenCalledTimes(3);
    expect(cycleText()).toBe('0003'); // AC6: at 10 gen/sec the text follows every published cycle

    driver.frame(310); // below the 100 ms period at 10 gen/sec — no step, no commit
    expect(onRender).toHaveBeenCalledTimes(3);
    expect(drawDiffSpy).toHaveBeenCalledTimes(3);

    fireEvent.change(speedSlider(), { target: { value: '4' } }); // 20 gen/sec: one commit of its own
    expect(onRender).toHaveBeenCalledTimes(4);
    onRender.mockClear(); // re-baseline after the speed-change commit

    // The loop banked 10 ms at frame(310) and clamps the bank to the NEW 50 ms period before
    // adding the delta (`simulationLoop.ts` FD3), so frame(360) already carries 60 ms and steps.
    driver.frame(360); // cycle 4, published (cyclesPerPublish(20) === 2)
    driver.frame(410); // cycle 5, not published
    driver.frame(460); // cycle 6, published
    driver.frame(510); // cycle 7, not published — 4 drawDiff calls, 2 commits
    expect(drawDiffSpy).toHaveBeenCalledTimes(3 + 4);
    expect(onRender).toHaveBeenCalledTimes(2);
    expect(cycleText()).toBe('0006');

    act(() => screen.getByRole('button', { name: 'Pause' }).click());
    expect(onRender).toHaveBeenCalledTimes(3); // pause() publishes unconditionally (trap 1)
    expect(cycleText()).toBe('0007');
  });

  // (f): AC8 — axe-clean paused (with the extinct row present), playing, and after a Stop.
  it('has no axe violations paused with an extinct row, playing, and after a Stop', async () => {
    installContexts();
    const driver = installFrameDriver();
    const { container } = render(view({ startingSpeed: 10 }));

    expect((await axe(container)).violations).toEqual([]);

    act(() => screen.getByRole('button', { name: 'Play' }).click());
    driver.frame(0); // primes the clock only
    driver.frame(100); // one stepped, PUBLISHED cycle — the scan sees a run's DOM, not the paused one
    expect(cycleText()).toBe('0001');
    expect((await axe(container)).violations).toEqual([]);

    act(() => screen.getByRole('button', { name: 'Stop & reset' }).click());
    expect((await axe(container)).violations).toEqual([]);
  });

  // Extinction auto-pause (Story 3.15, FR-4.7, Decision B.5): no new state, hook, effect or prop —
  // observed through `status` exactly like a manual pause (AC8).
  it('auto-pauses on the first extinct cycle: the skull row, Play resumable, Next cycle enabled, and Stop & reset undoes it', () => {
    installContexts();
    const driver = installFrameDriver();
    const { container } = render(
      view({ organisms: CONWAY_ORGANISMS, initialGrid: LONE_GRID, palette: CONWAY_PALETTE }),
    );

    act(() => screen.getByRole('button', { name: 'Play' }).click());
    driver.frame(0); // primes the clock — no step
    driver.frame(100); // cycle 1: the lone cell dies, and the run auto-pauses

    const el = root(container);
    expect(el).toHaveAttribute('data-status', 'paused');
    expect(el).toHaveAttribute('data-cycle', '1');
    expect(cycleText()).toBe('0001');
    expect(within(rows()[0]).getByText('0 (0%)')).toBeInTheDocument();
    expect(within(rows()[0]).getByRole('img', { name: 'extinct' })).toBeInTheDocument();
    expect(totalLivingText()).toBe('0');
    expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next cycle' })).not.toBeDisabled();

    // (iii) resume, then auto-pause again on the still-empty grid at the next cycle.
    act(() => screen.getByRole('button', { name: 'Play' }).click());
    driver.frame(200); // primes the restarted loop
    driver.frame(300); // cycle 2, auto-paused again

    expect(root(container)).toHaveAttribute('data-status', 'paused');
    expect(root(container)).toHaveAttribute('data-cycle', '2');
    expect(cycleText()).toBe('0002');

    // (iv) Stop & reset behaves exactly as it would after a manual pause — nothing carries over.
    act(() => screen.getByRole('button', { name: 'Stop & reset' }).click());

    expect(root(container)).toHaveAttribute('data-status', 'paused');
    expect(root(container)).toHaveAttribute('data-cycle', '0');
    expect(cycleText()).toBe('0000');
    expect(within(rows()[0]).getByText('1 (100%)')).toBeInTheDocument();
    expect(within(rows()[0]).queryByRole('img', { name: 'extinct' })).not.toBeInTheDocument();
  });

  // (ii): the auto-pause frame is exactly ONE commit — never a status commit plus a publish commit
  // (trap 3 of the story; the same shape AC7's cadence test pins for a manual pause).
  it('the auto-pause frame commits exactly once', () => {
    installContexts();
    const driver = installFrameDriver();
    const onRender = vi.fn();

    render(
      <Profiler id="run" onRender={onRender}>
        {view({ organisms: CONWAY_ORGANISMS, initialGrid: LONE_GRID, palette: CONWAY_PALETTE })}
      </Profiler>,
    );
    onRender.mockClear(); // drop the mount commit

    act(() => screen.getByRole('button', { name: 'Play' }).click());
    onRender.mockClear(); // drop the Play commit (status: paused -> playing)

    driver.frame(0); // primes the clock — no commit
    expect(onRender).not.toHaveBeenCalled();

    driver.frame(100); // cycle 1: extinct — the auto-pause frame

    expect(onRender).toHaveBeenCalledTimes(1);
    expect(cycleText()).toBe('0001');
  });

  // (v): axe-clean in the auto-paused state.
  it('has no axe violations auto-paused with an extinct row', async () => {
    installContexts();
    const driver = installFrameDriver();
    const { container } = render(
      view({ organisms: CONWAY_ORGANISMS, initialGrid: LONE_GRID, palette: CONWAY_PALETTE }),
    );

    act(() => screen.getByRole('button', { name: 'Play' }).click());
    driver.frame(0);
    driver.frame(100);
    expect(cycleText()).toBe('0001');

    expect((await axe(container)).violations).toEqual([]);
  });
});

describe('Play-mode ephemeral resize (Story 3.16)', () => {
  const gridSizeSlider = () => screen.getByRole('slider', { name: 'Grid dimensions' });
  const speedSlider = () => screen.getByRole('slider', { name: 'Generations per second' });

  /**
   * `installContexts()`'s shape, plus a per-canvas call COUNT: `<PlaybackDish>` keeps the same
   * `<canvas>` element across a resize (only its internal `GridRenderer` is torn down and rebuilt,
   * Story 3.11 forced decision 6), so counting canvas ELEMENTS (as the StrictMode test above does)
   * cannot see a reconstruction here. Each `new GridRenderer(canvas, …)` calls
   * `canvas.getContext('2d', …)` exactly once (`gridRenderer.ts:173`), so the call count keyed on
   * THIS canvas is the renderer-construction count.
   */
  function installContextsWithCounts(): {
    contexts: Map<HTMLCanvasElement, RecordingContext2D>;
    callCounts: Map<HTMLCanvasElement, number>;
  } {
    const contexts = new Map<HTMLCanvasElement, RecordingContext2D>();
    const callCounts = new Map<HTMLCanvasElement, number>();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (
      this: HTMLCanvasElement,
    ) {
      callCounts.set(this, (callCounts.get(this) ?? 0) + 1);
      let context = contexts.get(this);
      if (context === undefined) {
        context = new RecordingContext2D();
        contexts.set(this, context);
      }
      return context as unknown as CanvasRenderingContext2D;
    });
    return { contexts, callCounts };
  }

  /** The top-left `fixture.width` x `fixture.height` submatrix of `grid` equals `fixture`, byte
   * for byte (`resizeGrid`'s row-major layout, `resized.occupant[row * width + col]`). */
  function expectTopLeftPreserved(
    grid: { occupant: Uint8Array; age: Uint16Array; width: number },
    fixture: { occupant: Uint8Array; age: Uint16Array; width: number; height: number },
  ): void {
    for (let row = 0; row < fixture.height; row++) {
      for (let col = 0; col < fixture.width; col++) {
        const at = row * grid.width + col;
        const fixtureAt = row * fixture.width + col;
        expect(grid.occupant[at]).toBe(fixture.occupant[fixtureAt]);
        expect(grid.age[at]).toBe(fixture.age[fixtureAt]);
      }
    }
  }

  // AC3, trap 4, trap 9: a move while PAUSED resizes the live grid, content preserved top-left;
  // the canvas is rebuilt EXACTLY once; the cycle is untouched (a resize is not a step); population
  // is unchanged on a GROW (nothing was clipped).
  it('resizes on a slider move while paused: content preserved, canvas rebuilt once, cycle untouched (AC3)', () => {
    const { callCounts } = installContextsWithCounts();
    const drawFullSpy = vi.spyOn(GridRenderer.prototype, 'drawFull');
    const { container } = render(view());
    const canvas = screen.getByRole('img', {
      name: 'Petri dish, 7 by 5 cells',
    }) as HTMLCanvasElement;
    expect(callCounts.get(canvas)).toBe(1); // the mount construction
    const totalLivingBefore =
      screen.getByText('Total Living Cells').nextElementSibling?.textContent;

    // The 7x5 fixture is deliberately off-preset (AC8): the thumb starts at index 0, announcing
    // the TRUE size, not `GRID_PRESETS[0]`'s 50x30.
    expect(gridSizeSlider()).toHaveValue('0');
    expect(gridSizeSlider()).toHaveAttribute('aria-valuetext', '7 by 5 cells');

    act(() => fireEvent.change(gridSizeSlider(), { target: { value: '2' } })); // 150x90

    expect(root(container)).toHaveAttribute('data-cycle', '0'); // trap 9: a resize is not a step
    expect(gridSizeSlider()).toHaveValue('2');
    expect(gridSizeSlider()).toHaveAttribute('aria-valuetext', '150 by 90 cells');
    expect(screen.getByRole('img', { name: 'Petri dish, 150 by 90 cells' })).toBe(canvas);
    expect(callCounts.get(canvas)).toBe(2); // rebuilt exactly once

    // Trap 4: TWO drawFulls for this one resize — resizeLive's own paintFull on the OLD renderer,
    // then the rebuild's attachRenderer priming the NEW one. Both paint the SAME 150x90 grid.
    expect(drawFullSpy).toHaveBeenCalledTimes(3); // mount prime + the two from this resize
    for (const [painted] of drawFullSpy.mock.calls.slice(1)) {
      expect([painted.width, painted.height]).toEqual([150, 90]);
      expectTopLeftPreserved(painted, GRID);
    }

    // A grow clips nothing, so the published population is unchanged.
    expect(screen.getByText('Total Living Cells').nextElementSibling?.textContent).toBe(
      totalLivingBefore,
    );
  });

  // AC4: stepping and playing continue on the resized grid; Stop restores the persisted size and
  // the slider follows it back.
  it('steps and plays on the resized grid; Stop restores the persisted size (AC4)', () => {
    installContexts();
    const driver = installFrameDriver();
    const drawFullSpy = vi.spyOn(GridRenderer.prototype, 'drawFull');
    const drawDiffSpy = vi.spyOn(GridRenderer.prototype, 'drawDiff');
    const { container } = render(view());
    const canvas = screen.getByRole('img', { name: 'Petri dish, 7 by 5 cells' });

    act(() => fireEvent.change(gridSizeSlider(), { target: { value: '3' } })); // 200x120
    expect(gridSizeSlider()).toHaveValue('3');

    act(() => screen.getByRole('button', { name: 'Next cycle' }).click());
    expect(root(container)).toHaveAttribute('data-cycle', '1');
    const lastDiff = drawDiffSpy.mock.calls.at(-1)?.[0];
    expect([lastDiff?.width, lastDiff?.height]).toEqual([200, 120]);

    act(() => screen.getByRole('button', { name: 'Play' }).click());
    driver.frame(0);
    driver.frame(100);
    expect(root(container)).toHaveAttribute('data-status', 'playing');
    expect(Number(root(container).getAttribute('data-cycle'))).toBeGreaterThan(1);
    // The loop's own frames paint the RESIZED grid, not just the manual step above.
    const playedDiff = drawDiffSpy.mock.calls.at(-1)?.[0];
    expect([playedDiff?.width, playedDiff?.height]).toEqual([200, 120]);

    act(() => screen.getByRole('button', { name: 'Pause' }).click());
    expect(root(container)).toHaveAttribute('data-status', 'paused');

    act(() => screen.getByRole('button', { name: 'Stop & reset' }).click());

    expect(root(container)).toHaveAttribute('data-cycle', '0');
    expect(gridSizeSlider()).toHaveValue('0');
    expect(gridSizeSlider()).toHaveAttribute('aria-valuetext', '7 by 5 cells');
    // The same `<canvas>` element, renamed back — Stop's shrink rebuilds the renderer, not the DOM.
    expect(screen.getByRole('img', { name: 'Petri dish, 7 by 5 cells' })).toBe(canvas);
    const lastFullCall = drawFullSpy.mock.calls.at(-1);
    if (lastFullCall === undefined) throw new Error('drawFull was never called');
    const lastFull = lastFullCall[0];
    expect([lastFull.width, lastFull.height]).toEqual([7, 5]);
    expectTopLeftPreserved(lastFull, GRID);
  });

  // AC5: the control is disabled while playing, with the hint always present and wired as its
  // description; the Speed slider stays enabled (FR-4.2 — live during playback); an extinction
  // auto-pause re-enables the control through `status` alone.
  it('disables Grid Size while playing (Speed stays enabled), and an auto-pause re-enables it (AC5)', () => {
    const driver = installFrameDriver();
    const CONWAY_ORGANISMS: readonly Organism[] = [CONWAYS_CLASSIC];
    const CONWAY_PALETTE = buildRefToFillGroup(
      CONWAY_ORGANISMS.map((o) => o.id),
      new Map(CONWAY_ORGANISMS.map((o) => [o.id, o] as const)),
    );
    const LONE_GRID = gridFromDense(gridFromPattern(['...', '.x.', '...'], { '.': 0, x: 1 }));
    installContexts();

    const { container } = render(
      view({ organisms: CONWAY_ORGANISMS, initialGrid: LONE_GRID, palette: CONWAY_PALETTE }),
    );

    expect(gridSizeSlider()).toBeEnabled();
    expect(screen.getByText('Adjustable while paused')).toBeInTheDocument();
    expect(gridSizeSlider()).toHaveAccessibleDescription('Adjustable while paused');
    expect(screen.getByRole('button', { name: 'Next cycle' })).toBeEnabled();

    act(() => screen.getByRole('button', { name: 'Play' }).click());

    expect(gridSizeSlider()).toBeDisabled();
    expect(speedSlider()).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Next cycle' })).toBeDisabled();
    expect(screen.getByText('Adjustable while paused')).toBeInTheDocument();

    driver.frame(0); // primes the clock
    driver.frame(100); // cycle 1: the lone cell dies — auto-pause (Story 3.15)

    // The re-enable is observed THROUGH the auto-pause, not through some other re-render.
    expect(root(container)).toHaveAttribute('data-status', 'paused');
    expect(root(container)).toHaveAttribute('data-cycle', '1');
    expect(gridSizeSlider()).toBeEnabled();
  });

  it('has no axe violations with the Grid Size section present, enabled and disabled', async () => {
    installContexts();
    const driver = installFrameDriver();
    const { container } = render(view());
    expect((await axe(container)).violations).toEqual([]);

    act(() => screen.getByRole('button', { name: 'Play' }).click());
    driver.frame(0);
    expect(gridSizeSlider()).toBeDisabled(); // the second scan IS the disabled leg
    expect((await axe(container)).violations).toEqual([]);
  });
});

describe('Fullscreen run stage (Story 3.18)', () => {
  const speedSlider = () => screen.getByRole('slider', { name: 'Generations per second' });
  const gridSizeSlider = () => screen.getByRole('slider', { name: 'Grid dimensions' });
  const exitButton = () => screen.getByRole('button', { name: 'Exit fullscreen' });

  // AC4 (a)+(b): entering and exiting is a LAYOUT SWAP — the same `<canvas>` element, the same
  // renderer (one context construction), no re-prime — with the sidebar and the bar unmounted
  // in fullscreen and back on exit. The three identity assertions are the tripwire for anyone who
  // later puts a new element type above the canvas in one state only (FD2 (c), trap 1).
  it('enters and exits fullscreen without remounting the canvas: same node, one context, drawFull unchanged (AC4)', () => {
    installContexts();
    const drawFullSpy = vi.spyOn(GridRenderer.prototype, 'drawFull');
    const onExitFullscreen = vi.fn();
    const { container, rerender } = render(view({ onExitFullscreen }));
    const canvasBefore = container.querySelector('canvas');
    expect(canvasBefore).not.toBeNull();
    expect(drawFullSpy).toHaveBeenCalledTimes(1); // the mount prime
    // Renderer constructions on THIS canvas (the 3.16 idiom): each `new GridRenderer(canvas, …)`
    // calls `canvas.getContext` exactly once. The contexts MAP is not the count — the renderer's
    // grid-line overlay is a second, offscreen canvas with a context of its own.
    const constructions = () =>
      vi
        .mocked(HTMLCanvasElement.prototype.getContext)
        .mock.contexts.filter((self) => self === canvasBefore).length;
    expect(constructions()).toBe(1);
    expect(root(container)).toHaveAttribute('data-fullscreen', 'false');

    rerender(view({ onExitFullscreen, fullscreen: true }));

    expect(root(container)).toHaveAttribute('data-fullscreen', 'true');
    expect(container.querySelector('canvas')).toBe(canvasBefore);
    expect(container.querySelectorAll('canvas')).toHaveLength(1);
    expect(constructions()).toBe(1); // no second construction
    expect(drawFullSpy).toHaveBeenCalledTimes(1); // a remount would re-attach and re-prime
    // The sidebar and the bottom bar are GONE (unmounted, not hidden): no complementary
    // landmark, no sliders, no Back; the stage's chrome is up.
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
    expect(screen.queryAllByRole('slider')).toHaveLength(0);
    expect(screen.queryByRole('button', { name: 'Back to Battles' })).not.toBeInTheDocument();
    expect(screen.queryAllByRole('heading', { level: 2 })).toHaveLength(0);
    expect(screen.getByRole('heading', { level: 1 })).toHaveAccessibleName('Three-Way Skirmish');
    expect(exitButton()).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Simulation controls' })).toBeInTheDocument();
    // Exactly four buttons in the stage: Exit + the transport trio.
    expect(screen.getAllByRole('button')).toHaveLength(4);

    act(() => exitButton().click());
    expect(onExitFullscreen).toHaveBeenCalledTimes(1);

    rerender(view({ onExitFullscreen, fullscreen: false }));

    expect(root(container)).toHaveAttribute('data-fullscreen', 'false');
    expect(container.querySelector('canvas')).toBe(canvasBefore);
    expect(container.querySelectorAll('canvas')).toHaveLength(1);
    expect(constructions()).toBe(1);
    expect(drawFullSpy).toHaveBeenCalledTimes(1);
    // The chassis is back exactly: four h2s in order, two sliders, the bar's group, four buttons.
    expect(screen.queryAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual([
      'Population Analysis',
      'Cycle Count',
      'Speed',
      'Grid Size',
    ]);
    expect(screen.getAllByRole('slider')).toHaveLength(2);
    expect(screen.getByRole('group', { name: 'Simulation controls' })).toBeInTheDocument();
    expect(screen.getByRole('complementary')).toBeInTheDocument();
    expect(screen.getAllByRole('button')).toHaveLength(4);
    expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Exit fullscreen' })).not.toBeInTheDocument();
  });

  // AC4 (c): under StrictMode the round trip settles to one canvas and one primed renderer — the
  // `:206-220` shape, through the swap.
  it('settles under StrictMode across a fullscreen round trip: one canvas, primed, no extra construction', () => {
    installContexts();
    const drawFullSpy = vi.spyOn(GridRenderer.prototype, 'drawFull');
    const { container, rerender } = render(<StrictMode>{view()}</StrictMode>);
    expect(container.querySelectorAll('canvas')).toHaveLength(1);
    const canvasBefore = container.querySelector('canvas');
    const primesAfterMount = drawFullSpy.mock.calls.length; // 2 under StrictMode (mount test)
    const getContextCalls = () =>
      vi.mocked(HTMLCanvasElement.prototype.getContext).mock.calls.length;
    const contextsAfterMount = getContextCalls();

    rerender(<StrictMode>{view({ fullscreen: true })}</StrictMode>);
    rerender(<StrictMode>{view({ fullscreen: false })}</StrictMode>);

    expect(container.querySelectorAll('canvas')).toHaveLength(1);
    expect(container.querySelector('canvas')).toBe(canvasBefore);
    expect(getContextCalls()).toBe(contextsAfterMount);
    expect(drawFullSpy).toHaveBeenCalledTimes(primesAfterMount);
    expect(root(container)).toHaveAttribute('data-cycle', '0');
  });

  // AC5 (a): a RUNNING simulation never notices the swap — no frame cancelled, the next frame
  // still queued, the cycle still advancing, in both directions.
  it('keeps a playing simulation running across enter and exit: no cancel, frame still pending, cycle advancing (AC5)', () => {
    installContexts();
    const driver = installFrameDriver();
    const { container, rerender } = render(view({ startingSpeed: 10 }));

    act(() => screen.getByRole('button', { name: 'Play' }).click());
    driver.frame(0);
    driver.frame(100);
    expect(root(container)).toHaveAttribute('data-cycle', '1');
    expect(root(container)).toHaveAttribute('data-status', 'playing');

    rerender(view({ startingSpeed: 10, fullscreen: true }));

    expect(driver.caf).not.toHaveBeenCalled();
    expect(driver.pending()).toBe(1);
    driver.frame(200);
    driver.frame(300);
    expect(root(container)).toHaveAttribute('data-cycle', '3');
    expect(root(container)).toHaveAttribute('data-status', 'playing');
    // The HUD's transport reads the live status: "Pause" while playing, Step disabled.
    expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next cycle' })).toBeDisabled();

    rerender(view({ startingSpeed: 10, fullscreen: false }));

    expect(driver.caf).not.toHaveBeenCalled();
    expect(driver.pending()).toBe(1);
    driver.frame(400);
    driver.frame(500);
    expect(root(container)).toHaveAttribute('data-cycle', '5');
    expect(root(container)).toHaveAttribute('data-status', 'playing');
  });

  // AC5 (b): paused state survives the round trip untouched — cycle and status the same on both
  // sides, and the HUD's Cycle group shows the same number the sidebar's counter did.
  it('keeps a paused simulation at its cycle across enter and exit (AC5)', () => {
    installContexts();
    installFrameDriver();
    const { container, rerender } = render(view());

    act(() => screen.getByRole('button', { name: 'Next cycle' }).click());
    act(() => screen.getByRole('button', { name: 'Next cycle' }).click());
    expect(root(container)).toHaveAttribute('data-cycle', '2');

    rerender(view({ fullscreen: true }));
    expect(root(container)).toHaveAttribute('data-cycle', '2');
    expect(root(container)).toHaveAttribute('data-status', 'paused');
    expect(screen.getByText('Cycle').nextElementSibling).toHaveTextContent(/^0002$/);
    expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument();

    rerender(view({ fullscreen: false }));
    expect(root(container)).toHaveAttribute('data-cycle', '2');
    expect(root(container)).toHaveAttribute('data-status', 'paused');
  });

  // AC5 (c): the speed is the HOOK's (3.10 FD6) — set from the chassis, read in the HUD, still
  // on the slider after exit. Nothing in the view stores it.
  it('shows the chosen speed in the HUD and keeps it on the slider after exit (AC5)', () => {
    installContexts();
    installFrameDriver();
    const { rerender } = render(view({ startingSpeed: 10 }));

    fireEvent.change(speedSlider(), { target: { value: '4' } }); // 20 gen/sec
    expect(speedSlider()).toHaveAttribute('aria-valuetext', '20 generations per second');

    rerender(view({ startingSpeed: 10, fullscreen: true }));
    expect(screen.getByText('Speed').nextElementSibling).toHaveTextContent(/^20 gen\/s$/);
    expect(screen.queryByRole('slider')).not.toBeInTheDocument();

    rerender(view({ startingSpeed: 10, fullscreen: false }));
    expect(speedSlider()).toHaveValue('4');
    expect(speedSlider()).toHaveAttribute('aria-valuetext', '20 generations per second');
  });

  // AC5 (d), trap 2: an ephemeral 150×90 stays 150×90 across the swap — `PlaybackDish` keys its
  // construction on DIMENSIONS (the hook's `liveSize`, unchanged by the layout), so the same
  // canvas node carries the same name; Grid Size still reads 150×90 after exit because the state
  // lives in the hook, not the sidebar.
  it('keeps an ephemeral 150×90 resize across enter and exit on the same canvas node (AC5)', () => {
    installContexts();
    const { container, rerender } = render(view());
    const canvas = screen.getByRole('img', { name: 'Petri dish, 7 by 5 cells' });

    act(() => fireEvent.change(gridSizeSlider(), { target: { value: '2' } })); // 150x90
    expect(screen.getByRole('img', { name: 'Petri dish, 150 by 90 cells' })).toBe(canvas);

    rerender(view({ fullscreen: true }));
    expect(screen.getByRole('img', { name: 'Petri dish, 150 by 90 cells' })).toBe(canvas);
    expect(container.querySelectorAll('canvas')).toHaveLength(1);

    rerender(view({ fullscreen: false }));
    expect(screen.getByRole('img', { name: 'Petri dish, 150 by 90 cells' })).toBe(canvas);
    expect(gridSizeSlider()).toHaveValue('2');
    expect(gridSizeSlider()).toHaveAttribute('aria-valuetext', '150 by 90 cells');
  });

  // The HUD's population pills read the same published entries the sidebar's rows do — in the
  // hook's order, the unplaced third organism skulled from the first publish (H.2).
  it('renders the population pills from the hook’s published entries in fullscreen', () => {
    installContexts();
    render(view({ fullscreen: true }));

    const pills = within(screen.getByRole('list', { name: 'Population' })).getAllByRole('listitem');
    expect(pills.map((pill) => pill.textContent)).toEqual([
      'Aggressive Colonizer 3',
      'Patient Defender 3',
      'Chaotic Spreader 0☠',
    ]);
  });

  // AC7: Exit takes focus when the stage mounts INTO an already-mounted view (the real path —
  // the header's button has just unmounted), and axe is clean paused and playing in fullscreen.
  it('focuses Exit fullscreen on entry and has no axe violations in fullscreen, paused and playing', async () => {
    installContexts();
    const driver = installFrameDriver();
    const { container, rerender } = render(view());

    rerender(view({ fullscreen: true }));
    expect(exitButton()).toHaveFocus();
    expect((await axe(container)).violations).toEqual([]);

    act(() => screen.getByRole('button', { name: 'Play' }).click());
    driver.frame(0);
    expect((await axe(container)).violations).toEqual([]);
  });
});

describe('Simulation hotkeys (Story 3.19)', () => {
  it('Space toggles play/pause, through the hook (AC1/AC2)', () => {
    installContexts();
    const driver = installFrameDriver();
    const { container } = render(view({ startingSpeed: 10 }));

    fireEvent.keyDown(document.body, { key: ' ' });
    expect(root(container)).toHaveAttribute('data-status', 'playing');
    driver.frame(0);
    driver.frame(100);
    expect(root(container)).toHaveAttribute('data-cycle', '1');

    fireEvent.keyDown(document.body, { key: ' ' });
    expect(root(container)).toHaveAttribute('data-status', 'paused');
  });

  // Trap 1: `sim.step()` throws while playing — the hook never `try`s, `canStep` gates the call
  // instead, so a keyboard step while playing is a no-op rather than a caught error.
  it('ArrowRight steps twice while paused, and is a no-op while playing (FR-4.3)', () => {
    installContexts();
    const driver = installFrameDriver();
    const { container } = render(view({ startingSpeed: 10 }));

    fireEvent.keyDown(document.body, { key: 'ArrowRight' });
    fireEvent.keyDown(document.body, { key: 'ArrowRight' });
    expect(root(container)).toHaveAttribute('data-cycle', '2');

    act(() => screen.getByRole('button', { name: 'Play' }).click());
    driver.frame(0);
    driver.frame(100);
    expect(root(container)).toHaveAttribute('data-cycle', '3');

    expect(() => fireEvent.keyDown(document.body, { key: 'ArrowRight' })).not.toThrow();
    expect(root(container)).toHaveAttribute('data-cycle', '3'); // unchanged by the keypress
    driver.frame(200);
    expect(root(container)).toHaveAttribute('data-cycle', '4'); // the loop's own next frame
  });

  it('Escape stops: paused at cycle 0, with a repaint of the initial grid (FR-4.4)', () => {
    installContexts();
    const driver = installFrameDriver();
    const drawFullSpy = vi.spyOn(GridRenderer.prototype, 'drawFull');
    const { container } = render(view({ startingSpeed: 10 }));
    const primesAfterMount = drawFullSpy.mock.calls.length;

    act(() => screen.getByRole('button', { name: 'Play' }).click());
    driver.frame(0);
    driver.frame(100);
    expect(root(container)).toHaveAttribute('data-cycle', '1');

    fireEvent.keyDown(document.body, { key: 'Escape' });

    expect(root(container)).toHaveAttribute('data-status', 'paused');
    expect(root(container)).toHaveAttribute('data-cycle', '0');
    expect(drawFullSpy.mock.calls.length).toBe(primesAfterMount + 1);
  });

  // FD5 (a): `f` in the chassis calls `onEnterFullscreen`; `F` in the stage calls
  // `onExitFullscreen` — the composed toggle, never a third callback.
  it('f calls onEnterFullscreen once from the chassis; F calls onExitFullscreen once from the stage', () => {
    installContexts();
    const onEnterFullscreen = vi.fn();
    const onExitFullscreen = vi.fn();
    const { rerender } = render(view({ onEnterFullscreen, onExitFullscreen }));

    fireEvent.keyDown(document.body, { key: 'f' });
    expect(onEnterFullscreen).toHaveBeenCalledTimes(1);
    expect(onExitFullscreen).not.toHaveBeenCalled();

    rerender(view({ onEnterFullscreen, onExitFullscreen, fullscreen: true }));

    fireEvent.keyDown(document.body, { key: 'F' });
    expect(onExitFullscreen).toHaveBeenCalledTimes(1);
    expect(onEnterFullscreen).toHaveBeenCalledTimes(1);
  });

  // The 3.18 tripwires, repeated across an `F`-DRIVEN round trip: the key calls the callback, and
  // the caller (here, standing in for `<BattlePage>`) flips `fullscreen` — canvas identity must
  // hold exactly as it does for the pointer-driven toggle (`BattleSimulationView.test.tsx`'s own
  // "Fullscreen run stage (Story 3.18)" describe block).
  it('an F-driven fullscreen round trip keeps the same canvas node, one construction, no extra drawFull', () => {
    installContexts();
    const drawFullSpy = vi.spyOn(GridRenderer.prototype, 'drawFull');
    const onEnterFullscreen = vi.fn();
    const onExitFullscreen = vi.fn();
    const { container, rerender } = render(view({ onEnterFullscreen, onExitFullscreen }));
    const canvasBefore = container.querySelector('canvas');
    const primesAfterMount = drawFullSpy.mock.calls.length;
    const constructions = () =>
      vi
        .mocked(HTMLCanvasElement.prototype.getContext)
        .mock.contexts.filter((self) => self === canvasBefore).length;
    expect(constructions()).toBe(1);

    fireEvent.keyDown(document.body, { key: 'f' });
    rerender(view({ onEnterFullscreen, onExitFullscreen, fullscreen: true }));

    expect(container.querySelector('canvas')).toBe(canvasBefore);
    expect(constructions()).toBe(1);
    expect(drawFullSpy.mock.calls.length).toBe(primesAfterMount);

    fireEvent.keyDown(document.body, { key: 'F' });
    rerender(view({ onEnterFullscreen, onExitFullscreen, fullscreen: false }));

    expect(container.querySelector('canvas')).toBe(canvasBefore);
    expect(constructions()).toBe(1);
    expect(drawFullSpy.mock.calls.length).toBe(primesAfterMount);
  });

  // AC3 (v): a dialog anywhere on the page suspends the hook — even one rendered by a SIBLING,
  // never a descendant of this view (the `<UnsavedChangesDialog>` shape from `<BattlePage>`).
  it('a keydown from inside a rendered dialog sibling does nothing (AC3 (v))', () => {
    installContexts();
    const driver = installFrameDriver();
    const { container } = render(
      <>
        {view({ startingSpeed: 10 })}
        <div role="dialog" data-testid="sibling-dialog" />
      </>,
    );

    act(() => screen.getByRole('button', { name: 'Play' }).click());
    driver.frame(0);
    driver.frame(100);
    expect(root(container)).toHaveAttribute('data-cycle', '1');

    fireEvent.keyDown(screen.getByTestId('sibling-dialog'), { key: 'Escape' });

    expect(root(container)).toHaveAttribute('data-status', 'playing');
    expect(root(container)).toHaveAttribute('data-cycle', '1');
  });

  // AC1: one listener under StrictMode's double-invoke, none after unmount (Run -> Lab).
  it('registers exactly one keydown listener under StrictMode, and none after unmount', () => {
    installContexts();
    const attached = new Set<EventListenerOrEventListenerObject>();
    const originalAdd = window.addEventListener.bind(window);
    const originalRemove = window.removeEventListener.bind(window);
    vi.spyOn(window, 'addEventListener').mockImplementation((type, listener, options) => {
      if (type === 'keydown') attached.add(listener);
      originalAdd(type, listener, options as boolean | AddEventListenerOptions | undefined);
    });
    vi.spyOn(window, 'removeEventListener').mockImplementation((type, listener, options) => {
      if (type === 'keydown') attached.delete(listener);
      originalRemove(type, listener, options as boolean | EventListenerOptions | undefined);
    });

    const { unmount } = render(<StrictMode>{view()}</StrictMode>);
    expect(attached.size).toBe(1);

    unmount();
    expect(attached.size).toBe(0);
  });
});
