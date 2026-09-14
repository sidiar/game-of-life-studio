import { StrictMode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
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

  // AC10: the skeleton. The footer is the ONLY control — no transport (3.12), no speed (3.13), no
  // counter/stats (3.14), no grid size (3.16) — and the sidebar carries no section heading yet.
  it('renders the footer’s Back button and nothing else: one button, no h2, no slider', () => {
    render(view());

    expect(screen.getAllByRole('button')).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Back to Battles' })).toBeEnabled();
    expect(screen.queryAllByRole('heading', { level: 2 })).toHaveLength(0);
    expect(screen.queryByRole('slider')).toBeNull();
    expect(screen.queryByRole('button', { name: /play|pause|step|stop/i })).toBeNull();
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
