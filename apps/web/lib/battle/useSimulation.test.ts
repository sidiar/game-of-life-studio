import { createElement, useEffect } from 'react';
import type { Organism } from '@gol/domain';
import { gridFromDense, type FrameScheduler, type Grid } from '@gol/simulation';
import {
  CONWAYS_CLASSIC,
  FIXED_SEED,
  emptyGrid,
  gridFromPattern,
  placePattern,
} from '@gol/test-utils';
import { act, render, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { derivePopulation } from './population';
import { cyclesPerPublish, msPerCycle, type GenPerSec } from './simulationSpeed';
import {
  useSimulation,
  type PlaybackRenderer,
  type SimulationOrganism,
  type UseSimulationOptions,
  type UseSimulationResult,
} from './useSimulation';

// `{ spy: true }` keeps the real implementation and only counts calls — AC5's "the population pass
// runs at publish time, never per cycle" is a call count, not a behaviour change.
vi.mock('./population', { spy: true });

// ── Harness ────────────────────────────────────────────────────────────────────────────────────

/**
 * A QUEUE fake scheduler with explicit timestamps (Story 3.8 AC10's harness, widened per its
 * review: a one-slot fake made a doubled request chain unobservable). `frame(now)` fires every
 * callback queued BEFORE the frame, as RAF does; a re-request from inside a callback lands in the
 * next frame. `cancel` of a handle that already fired is a no-op, as RAF's is.
 */
function createFakeScheduler() {
  const queue: { handle: number; callback: (now: number) => void }[] = [];
  let nextHandle = 1;
  let cancelled = 0;
  const scheduler: FrameScheduler = {
    request(callback) {
      const handle = nextHandle++;
      queue.push({ handle, callback });
      return handle;
    },
    cancel(handle) {
      const index = queue.findIndex((entry) => entry.handle === handle);
      if (index === -1) return;
      queue.splice(index, 1);
      cancelled += 1;
    },
  };
  return {
    scheduler,
    frame(now: number): void {
      const batch = queue.splice(0);
      for (const { callback } of batch) callback(now);
    },
    pending: () => queue.length,
    cancelled: () => cancelled,
  };
}

/**
 * A recording `PlaybackRenderer` — a plain object, which is why the hook's type is a `Pick`. It is
 * STRICT about size the way the real `GridRenderer` is (`assertGridMatchesSize`): it is built at a
 * size, `resize` moves it, and painting a grid of any other size throws. A fake that only recorded
 * let the rebind path prime a 5x5 canvas with a 6x4 grid and pass (review 2026-09-14).
 */
function createFakeRenderer(size: { cols: number; rows: number } = { cols: 5, rows: 5 }) {
  let current = { ...size };
  const drawDiff: Grid[] = [];
  const drawFull: Grid[] = [];
  const resize: { cols: number; rows: number }[] = [];
  // Snapshots, not references: the front buffer is reused across cycles, so a recorded reference
  // would show the LATEST grid at every index.
  const drawDiffSnapshots: Uint8Array[] = [];
  const assertSize = (grid: Grid): void => {
    if (grid.width !== current.cols || grid.height !== current.rows) {
      throw new Error(
        `fake renderer: grid ${grid.width}x${grid.height} does not match ${current.cols}x${current.rows}`,
      );
    }
  };
  const renderer: PlaybackRenderer = {
    drawDiff: (grid) => {
      assertSize(grid);
      drawDiff.push(grid);
      drawDiffSnapshots.push(grid.occupant.slice());
    },
    drawFull: (grid) => {
      assertSize(grid);
      drawFull.push(grid);
    },
    resize: (next) => {
      current = { ...next };
      resize.push({ ...next });
    },
  };
  return { renderer, drawDiff, drawFull, resize, drawDiffSnapshots };
}

// Grids: every dimension deliberately off the two editable presets (Decision A). The blinker is
// the period-2 golden — three cells forever, so a population count of 3 proves stepping without
// pinning a specific phase.
const LEGEND = { '.': 0, a: 1, b: 2 } as const;
function blinker(): Grid {
  return gridFromDense(gridFromPattern(['.....', '..a..', '..a..', '..a..', '.....'], LEGEND));
}
/** A lone Conway cell — dies after exactly one cycle under B3/S23 (no neighbours to survive). */
function lone(): Grid {
  return gridFromDense(gridFromPattern(['...', '.a.', '...'], LEGEND));
}
/** A 2x2 block on a 4x4 field — a still-life (AC4): the picture never changes, but `age` keeps climbing. */
function block(): Grid {
  return gridFromDense(gridFromPattern(['....', '.aa.', '.aa.', '....'], LEGEND));
}
/** The canonical south-east glider on a 12x12 field, corner-placed clear of every edge for 20 cycles. */
function glider12(): Grid {
  const GLIDER = gridFromPattern(['.a.', '..a', 'aaa'], LEGEND);
  return gridFromDense(placePattern(emptyGrid(12, 12), GLIDER, 0, 0));
}
const CONWAY: readonly Organism[] = [CONWAYS_CLASSIC];
const ORGANISM_B: Organism = {
  ...CONWAYS_CLASSIC,
  id: 'organism-b',
  name: 'Organism B',
  colorToken: 'vermillion',
};
/** Two equal-Dominance Conway organisms — every cell they both claim is a genuine tie (FR-5.4). */
const TWO_CONWAYS: readonly Organism[] = [CONWAYS_CLASSIC, ORGANISM_B];
/** Two vertical blinkers whose middle cells both claim `(3, 1)`: three `a` and three `b` neighbours. */
function contestedGrid(): Grid {
  return gridFromDense(gridFromPattern(['..a.b..', '..a.b..', '..a.b..'], LEGEND));
}

interface Harness {
  scheduler: ReturnType<typeof createFakeScheduler>;
  opts: UseSimulationOptions;
}
function harness(genPerSec: GenPerSec = 10, seed: number = FIXED_SEED): Harness {
  const scheduler = createFakeScheduler();
  return { scheduler, opts: { genPerSec, seed, scheduler: scheduler.scheduler } };
}

/**
 * Mounts the hook over STABLE references — the consumer obligation the head comment states. A
 * `blinker()` call inside the render callback would hand the hook a new grid every render, and
 * the render-phase reset would loop ("Too many re-renders"), which is the documented hazard, not
 * a hook bug.
 */
function mount(grid: Grid, roster: readonly SimulationOrganism[], h: Harness) {
  return renderHook(() => useSimulation(grid, roster, h.opts));
}

/**
 * Plays `cycles` cycles at the hook's current speed: one priming frame, then one frame per cycle,
 * each in its own `act` so every publish is its own render (the shape AC3 counts). Returns the
 * timestamp reached so a caller can continue the clock.
 */
function runCycles(h: Harness, cycles: number, genPerSec: GenPerSec, from = 0): { now: number } {
  const ms = msPerCycle(genPerSec);
  let now = from;
  if (from === 0) act(() => h.scheduler.frame(0));
  for (let i = 0; i < cycles; i++) {
    now += ms;
    act(() => h.scheduler.frame(now));
  }
  return { now };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

// ── AC1 ────────────────────────────────────────────────────────────────────────────────────────

describe('useSimulation — shape (AC1)', () => {
  it('returns the twelve-member result at cycle 0, paused, with the initial population', () => {
    const h = harness();
    const { result } = mount(blinker(), CONWAY, h);

    expect(result.current.status).toBe('paused');
    expect(result.current.cycle).toBe(0);
    expect(result.current.genPerSec).toBe(10);
    expect(result.current.liveSize).toEqual({ cols: 5, rows: 5 });
    expect(result.current.population).toEqual([
      {
        organismId: CONWAYS_CLASSIC.id,
        name: CONWAYS_CLASSIC.name,
        colorToken: CONWAYS_CLASSIC.colorToken,
        count: 3,
        pct: 100,
        extinct: false,
      },
    ]);
    for (const member of [
      'play',
      'pause',
      'step',
      'stop',
      'setSpeed',
      'resizeLive',
      'attachRenderer',
    ] as const) {
      expect(typeof result.current[member]).toBe('function');
    }
  });
});

// ── AC2 ────────────────────────────────────────────────────────────────────────────────────────

describe('useSimulation — the live grid is a clone (AC2, AR-31)', () => {
  it('never writes initialGrid: byte-identical after ten cycles from a blinker', () => {
    const initialGrid = blinker();
    const occupantBefore = initialGrid.occupant.slice();
    const ageBefore = initialGrid.age.slice();
    const h = harness();
    const { result } = renderHook(() => useSimulation(initialGrid, CONWAY, h.opts));

    act(() => result.current.play());
    runCycles(h, 10, 10);

    expect(result.current.cycle).toBe(10);
    expect(initialGrid.occupant).toEqual(occupantBefore);
    expect(initialGrid.age).toEqual(ageBefore);
  });

  it('paints a grid that is not initialGrid and shares no buffer with it', () => {
    const initialGrid = blinker();
    const h = harness();
    const fake = createFakeRenderer();
    const { result } = renderHook(() => useSimulation(initialGrid, CONWAY, h.opts));

    act(() => result.current.attachRenderer(fake.renderer));

    const primed = fake.drawFull[0];
    expect(primed).not.toBe(initialGrid);
    expect(primed.occupant).not.toBe(initialGrid.occupant);
    expect(primed.occupant.buffer).not.toBe(initialGrid.occupant.buffer);
    expect(primed.occupant).toEqual(initialGrid.occupant);
  });
});

// ── AC3 / AC5 ──────────────────────────────────────────────────────────────────────────────────

describe('useSimulation — publish cadence (AC3, AC5, M2)', () => {
  it('re-renders once per PUBLISH, never per cycle: 40 cycles at 20 gen/sec is 20 renders', () => {
    const h = harness(20);
    let renders = 0;
    const grid = blinker();
    const { result } = renderHook(() => {
      renders += 1;
      return useSimulation(grid, CONWAY, h.opts);
    });
    act(() => result.current.play());
    const rendersAfterPlay = renders;

    const cycles = 40;
    runCycles(h, cycles, 20);

    // Derived from the cadence, not observed: 40 / cyclesPerPublish(20) = 20.
    const publishes = cycles / cyclesPerPublish(20);
    expect(publishes).toBe(20);
    expect(renders).toBe(rendersAfterPlay + publishes);
    expect(result.current.cycle).toBe(cycles);
  });

  it('runs the population pass only at publish time: 20 calls for 40 cycles at 20 gen/sec', () => {
    const h = harness(20);
    const { result } = mount(blinker(), CONWAY, h);
    act(() => result.current.play());
    vi.mocked(derivePopulation).mockClear();

    runCycles(h, 40, 20);

    expect(derivePopulation).toHaveBeenCalledTimes(20);
  });

  it('a manual step() runs the population pass ONCE whether or not its cycle is on the cadence', () => {
    // At 10 gen/sec every cycle is on the cadence (the thunk publishes); at 20 only even cycles
    // are, so step() itself must publish cycle 1 — but never a second time on cycle 2.
    for (const [genPerSec, steps] of [
      [10, 3],
      [20, 2],
    ] as const) {
      const h = harness(genPerSec);
      const { result, unmount } = mount(blinker(), CONWAY, h);
      vi.mocked(derivePopulation).mockClear();

      for (let i = 0; i < steps; i++) act(() => result.current.step());

      expect(derivePopulation).toHaveBeenCalledTimes(steps);
      expect(result.current.cycle).toBe(steps);
      unmount();
    }
  });

  it.each<[GenPerSec, number]>([
    [1, 1],
    [2, 1],
    [5, 1],
    [10, 1],
    [20, 2],
  ])('at %d gen/sec publishes every %d cycle(s)', (genPerSec, every) => {
    const h = harness(genPerSec);
    const { result } = mount(blinker(), CONWAY, h);
    act(() => result.current.play());
    vi.mocked(derivePopulation).mockClear();

    const cycles = 10;
    runCycles(h, cycles, genPerSec);

    expect(derivePopulation).toHaveBeenCalledTimes(cycles / every);
    expect(genPerSec / every).toBeLessThanOrEqual(10);
  });
});

// ── AC4 ────────────────────────────────────────────────────────────────────────────────────────

describe('useSimulation — play / pause / step / stop (AC4)', () => {
  it('play is idempotent — a second play() starts no second frame chain', () => {
    const h = harness();
    const { result } = mount(blinker(), CONWAY, h);

    act(() => result.current.play());
    act(() => result.current.play());

    expect(h.scheduler.pending()).toBe(1);
    expect(result.current.status).toBe('playing');
  });

  it('pause stops the chain and publishes the EXACT cycle, even between cadence publishes', () => {
    // At 20 gen/sec the loop publishes on even cycles only; pausing on cycle 3 must still show 3.
    const h = harness(20);
    const { result } = mount(blinker(), CONWAY, h);
    act(() => result.current.play());
    runCycles(h, 3, 20);
    expect(result.current.cycle).toBe(2);

    act(() => result.current.pause());

    expect(result.current.status).toBe('paused');
    expect(result.current.cycle).toBe(3);
    expect(h.scheduler.pending()).toBe(0);
    expect(h.scheduler.cancelled()).toBe(1);
  });

  it('step advances exactly one cycle outside the loop, repaints via drawDiff, and publishes', () => {
    const h = harness();
    const fake = createFakeRenderer();
    const { result } = mount(blinker(), CONWAY, h);
    act(() => result.current.attachRenderer(fake.renderer));

    act(() => result.current.step());

    expect(result.current.cycle).toBe(1);
    expect(result.current.status).toBe('paused');
    expect(h.scheduler.pending()).toBe(0);
    expect(fake.drawDiff).toHaveLength(1);
    // The blinker has flipped to horizontal: row 2, cols 1..3.
    expect(Array.from(fake.drawDiffSnapshots[0])).toEqual([
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
    ]);
    expect(result.current.population[0].count).toBe(3);
  });

  it('stop resets to cycle 0 over a re-cloned initialGrid, repaints once via drawFull, and mints a NEW seed', () => {
    const h = harness();
    const fake = createFakeRenderer();
    const { result } = mount(blinker(), CONWAY, h);
    act(() => result.current.attachRenderer(fake.renderer));
    act(() => result.current.play());
    runCycles(h, 5, 10);
    const drawFullBefore = fake.drawFull.length;
    const random = vi.spyOn(Math, 'random').mockReturnValue(0.5);
    vi.mocked(derivePopulation).mockClear();

    act(() => result.current.stop());

    expect(result.current.status).toBe('paused');
    expect(result.current.cycle).toBe(0);
    expect(h.scheduler.pending()).toBe(0);
    expect(fake.drawFull).toHaveLength(drawFullBefore + 1);
    // The repaint is the fresh clone — vertical blinker again, not the grid from cycle 5.
    const repainted = fake.drawFull[fake.drawFull.length - 1];
    expect(repainted.occupant).toEqual(blinker().occupant);
    // Population recomputed over the re-cloned grid.
    expect(derivePopulation).toHaveBeenCalledTimes(1);
    expect(result.current.population[0].count).toBe(3);
    // A fresh seed, observed through the mint — never through unseeded outcomes.
    expect(random).toHaveBeenCalledTimes(1);
  });

  it('step() and resizeLive() throw while playing (FD5)', () => {
    const h = harness();
    const { result } = mount(blinker(), CONWAY, h);
    act(() => result.current.play());

    expect(() => result.current.step()).toThrow(/step\(\) called while playing/);
    expect(() => result.current.resizeLive({ cols: 6, rows: 6 })).toThrow(
      /resizeLive\(\) called while playing/,
    );
    // The run is untouched by the refused calls.
    expect(h.scheduler.pending()).toBe(1);
    expect(result.current.liveSize).toEqual({ cols: 5, rows: 5 });
  });
});

// ── AC6 ────────────────────────────────────────────────────────────────────────────────────────

describe('useSimulation — population through the hook (AC6)', () => {
  it('publishes pre-sorted entries: living by count descending, extinct last', () => {
    // a: 3 cells (a blinker), b: 1 lone cell that dies at cycle 1.
    const grid = gridFromDense(
      gridFromPattern(['b....', '..a..', '..a..', '..a..', '.....'], LEGEND),
    );
    const h = harness();
    const { result } = mount(grid, TWO_CONWAYS, h);

    expect(result.current.population.map((e) => [e.organismId, e.count, e.extinct])).toEqual([
      [CONWAYS_CLASSIC.id, 3, false],
      [ORGANISM_B.id, 1, false],
    ]);

    act(() => result.current.step());

    expect(result.current.population.map((e) => [e.organismId, e.count, e.extinct])).toEqual([
      [CONWAYS_CLASSIC.id, 3, false],
      [ORGANISM_B.id, 0, true],
    ]);
    expect(result.current.population[0].pct).toBe(100);
  });
});

// ── AC7 ────────────────────────────────────────────────────────────────────────────────────────

describe('useSimulation — setSpeed is a ref write (AC7, AR-34)', () => {
  it('changes cadence on the next frame without stopping or restarting the loop', () => {
    const h = harness(10);
    const { result } = mount(blinker(), CONWAY, h);
    act(() => result.current.play());
    const { now } = runCycles(h, 2, 10); // cycle 2 at t = 200
    const cancelledBefore = h.scheduler.cancelled();

    act(() => result.current.setSpeed(20));

    expect(result.current.genPerSec).toBe(20);
    expect(result.current.status).toBe('playing');
    expect(h.scheduler.pending()).toBe(1); // the same chain, still running
    expect(h.scheduler.cancelled()).toBe(cancelledBefore); // never cancelled

    // 50 ms is one cycle at 20 gen/sec (it was half a cycle at 10).
    act(() => h.scheduler.frame(now + 50));
    act(() => result.current.pause());
    expect(result.current.cycle).toBe(3);
  });

  it('updates the publish divisor: after a change to 20 gen/sec, publishes every second cycle', () => {
    const h = harness(10);
    const { result } = mount(blinker(), CONWAY, h);
    act(() => result.current.play());
    act(() => result.current.setSpeed(20));
    vi.mocked(derivePopulation).mockClear();

    runCycles(h, 10, 20);

    expect(derivePopulation).toHaveBeenCalledTimes(5);
  });
});

// ── AC8 ────────────────────────────────────────────────────────────────────────────────────────

describe('useSimulation — resizeLive is ephemeral and paused-only (AC8, FR-4.9)', () => {
  it('replaces the live buffers, keeps ages, resizes then repaints the renderer, and leaves initialGrid alone', () => {
    const initialGrid = blinker();
    const h = harness();
    const fake = createFakeRenderer();
    const { result } = renderHook(() => useSimulation(initialGrid, CONWAY, h.opts));
    act(() => result.current.attachRenderer(fake.renderer));
    // One cycle: the blinker's centre cell SURVIVES (age 1); the two ends are born (age 0).
    act(() => result.current.step());

    act(() => result.current.resizeLive({ cols: 7, rows: 6 }));

    expect(result.current.liveSize).toEqual({ cols: 7, rows: 6 });
    expect(result.current.cycle).toBe(1);
    // The first entry is attach's own sizing (the hook owns the renderer's size from attach on).
    expect(fake.resize).toEqual([
      { cols: 5, rows: 5 },
      { cols: 7, rows: 6 },
    ]);
    const repainted = fake.drawFull[fake.drawFull.length - 1];
    expect(repainted.width).toBe(7);
    expect(repainted.height).toBe(6);
    // Top-left anchored: the horizontal blinker is still row 2, cols 1..3 — now with stride 7.
    expect(repainted.occupant[2 * 7 + 1]).toBe(1);
    expect(repainted.occupant[2 * 7 + 2]).toBe(1);
    expect(repainted.occupant[2 * 7 + 3]).toBe(1);
    expect(repainted.age[2 * 7 + 2]).toBe(1); // carried, not zeroed (Story 3.3 FD6)
    expect(initialGrid.width).toBe(5);
    expect(initialGrid.height).toBe(5);
    expect(result.current.population[0].count).toBe(3);
  });

  it('stepping continues on the resized grid, and stop() restores initialGrid dimensions', () => {
    const h = harness();
    const fake = createFakeRenderer();
    const { result } = mount(blinker(), CONWAY, h);
    act(() => result.current.attachRenderer(fake.renderer));
    act(() => result.current.resizeLive({ cols: 8, rows: 7 }));

    act(() => result.current.step());
    expect(fake.drawDiff[0].width).toBe(8);
    expect(result.current.population[0].count).toBe(3);

    act(() => result.current.stop());

    expect(result.current.liveSize).toEqual({ cols: 5, rows: 5 });
    expect(fake.resize).toEqual([
      { cols: 5, rows: 5 },
      { cols: 8, rows: 7 },
      { cols: 5, rows: 5 },
    ]);
    const repainted = fake.drawFull[fake.drawFull.length - 1];
    expect(repainted.width).toBe(5);
    expect(repainted.occupant).toEqual(blinker().occupant);
  });

  it('a shrink clips cells and republishes the population', () => {
    const h = harness();
    const { result } = mount(blinker(), CONWAY, h);

    act(() => result.current.resizeLive({ cols: 5, rows: 2 }));

    // Only row 1's cell survives the clip.
    expect(result.current.population[0].count).toBe(1);
  });
});

// ── AC9 ────────────────────────────────────────────────────────────────────────────────────────

describe('useSimulation — attachRenderer in any order (AC9, Trap 1)', () => {
  it('a renderer attached by a CHILD effect (before the session effect) is primed exactly once', () => {
    const h = harness();
    const fake = createFakeRenderer();
    let latest: UseSimulationResult | null = null;
    const initialGrid = blinker();

    function Child({ attach }: { attach: UseSimulationResult['attachRenderer'] }) {
      useEffect(() => {
        attach(fake.renderer);
        return () => attach(null);
      }, [attach]);
      return null;
    }
    function Probe() {
      latest = useSimulation(initialGrid, CONWAY, h.opts);
      return createElement(Child, { attach: latest.attachRenderer });
    }

    render(createElement(Probe));

    // The child attached while `sessionRef` was still null (no prime from attachRenderer); the
    // session effect found it and primed it.
    expect(fake.drawFull).toHaveLength(1);
    expect(fake.drawFull[0].occupant).toEqual(initialGrid.occupant);
    expect(latest).not.toBeNull();
  });

  it('a renderer attached after mount is primed exactly once by attachRenderer itself', () => {
    const h = harness();
    const fake = createFakeRenderer();
    const { result } = mount(blinker(), CONWAY, h);

    act(() => result.current.attachRenderer(fake.renderer));

    expect(fake.drawFull).toHaveLength(1);
  });

  it('attachRenderer(null) detaches: later steps paint nothing, and re-attaching primes again', () => {
    const h = harness();
    const fake = createFakeRenderer();
    const { result } = mount(blinker(), CONWAY, h);
    act(() => result.current.attachRenderer(fake.renderer));
    act(() => result.current.attachRenderer(null));

    act(() => result.current.step());
    act(() => result.current.play());
    runCycles(h, 3, 10);

    expect(fake.drawDiff).toHaveLength(0);
    expect(result.current.cycle).toBe(4);

    act(() => result.current.pause());
    act(() => result.current.attachRenderer(fake.renderer));
    expect(fake.drawFull).toHaveLength(2);
  });

  it('steps headless with no renderer ever attached', () => {
    const h = harness();
    const { result } = mount(blinker(), CONWAY, h);

    act(() => result.current.play());
    runCycles(h, 5, 10);

    expect(result.current.cycle).toBe(5);
    expect(result.current.population[0].count).toBe(3);
  });

  it('the loop is built once per session: attach/detach never rebuilds or restarts it', () => {
    const h = harness();
    const fake = createFakeRenderer();
    const { result } = mount(blinker(), CONWAY, h);
    act(() => result.current.play());
    act(() => h.scheduler.frame(0));

    act(() => result.current.attachRenderer(fake.renderer));
    act(() => result.current.attachRenderer(null));
    act(() => result.current.attachRenderer(fake.renderer));

    expect(h.scheduler.pending()).toBe(1);
    expect(h.scheduler.cancelled()).toBe(0);
    act(() => h.scheduler.frame(100));
    expect(fake.drawDiff).toHaveLength(1);
  });
});

// ── AC10 ───────────────────────────────────────────────────────────────────────────────────────

describe('useSimulation — session keyed on (initialGrid, organisms) (AC10, FD2)', () => {
  it('the same references across re-renders change nothing: cycle and loop are preserved', () => {
    const initialGrid = blinker();
    const h = harness();
    const { result, rerender } = renderHook(
      ({ grid, roster }) => useSimulation(grid, roster, h.opts),
      { initialProps: { grid: initialGrid, roster: CONWAY } },
    );
    act(() => result.current.play());
    runCycles(h, 3, 10);

    rerender({ grid: initialGrid, roster: CONWAY });

    expect(result.current.cycle).toBe(3);
    expect(result.current.status).toBe('playing');
    expect(h.scheduler.pending()).toBe(1);
    expect(h.scheduler.cancelled()).toBe(0);
  });

  it('a new initialGrid reference is a new run at cycle 0 and cancels the old loop', () => {
    const h = harness();
    const fake = createFakeRenderer();
    const { result, rerender } = renderHook(
      ({ grid, roster }) => useSimulation(grid, roster, h.opts),
      { initialProps: { grid: blinker(), roster: CONWAY } },
    );
    act(() => result.current.attachRenderer(fake.renderer));
    act(() => result.current.play());
    runCycles(h, 4, 10);
    expect(result.current.cycle).toBe(4);

    const next = gridFromDense(gridFromPattern(['a.....', 'a.....', 'a.....', '......'], LEGEND));
    rerender({ grid: next, roster: CONWAY });

    expect(result.current.cycle).toBe(0);
    expect(result.current.status).toBe('paused');
    expect(result.current.liveSize).toEqual({ cols: 6, rows: 4 });
    expect(h.scheduler.cancelled()).toBe(1);
    expect(h.scheduler.pending()).toBe(0);
    // The still-mounted renderer is kept, RESIZED to the new run's grid, and primed with it — the
    // strict fake throws on the prime if the resize is skipped, as the real renderer would.
    expect(fake.resize).toEqual([
      { cols: 5, rows: 5 },
      { cols: 6, rows: 4 },
    ]);
    expect(fake.drawFull).toHaveLength(2);
    expect(fake.drawFull[1].occupant).toEqual(next.occupant);
  });

  it('a rebind after an ephemeral resize sizes the kept renderer back to the new initialGrid', () => {
    const h = harness();
    const fake = createFakeRenderer();
    const { result, rerender } = renderHook(
      ({ grid, roster }) => useSimulation(grid, roster, h.opts),
      { initialProps: { grid: blinker(), roster: CONWAY } },
    );
    act(() => result.current.attachRenderer(fake.renderer));
    act(() => result.current.resizeLive({ cols: 8, rows: 7 }));

    // Same dimensions as the old initialGrid — the canvas is nevertheless at 8x7 right now.
    rerender({ grid: blinker(), roster: CONWAY });

    expect(result.current.liveSize).toEqual({ cols: 5, rows: 5 });
    expect(fake.resize).toEqual([
      { cols: 5, rows: 5 },
      { cols: 8, rows: 7 },
      { cols: 5, rows: 5 },
    ]);
    const primed = fake.drawFull[fake.drawFull.length - 1];
    expect(primed.width).toBe(5);
    expect(primed.occupant).toEqual(blinker().occupant);
  });

  it('a new organisms reference is likewise a new run', () => {
    const h = harness();
    const { result, rerender } = renderHook(
      ({ grid, roster }) => useSimulation(grid, roster, h.opts),
      { initialProps: { grid: blinker(), roster: CONWAY } },
    );
    act(() => result.current.step());
    act(() => result.current.step());

    rerender({ grid: blinker(), roster: [...CONWAY] });

    expect(result.current.cycle).toBe(0);
  });

  it('unmount stops the loop, and no frame fires afterwards', () => {
    const h = harness();
    const { result, unmount } = mount(blinker(), CONWAY, h);
    act(() => result.current.play());
    act(() => h.scheduler.frame(0));

    unmount();

    expect(h.scheduler.pending()).toBe(0);
    expect(h.scheduler.cancelled()).toBe(1);
    // Nothing queued, so a late frame is a no-op — not a step on a dropped session.
    expect(() => h.scheduler.frame(100)).not.toThrow();
    expect(h.scheduler.pending()).toBe(0);
  });

  it('handlers called before the session exists throw rather than no-op', () => {
    // A hook whose session effect has not run yet is unreachable from a rendered control; a
    // second hook instance's handlers, reached through a captured result after unmount, are the
    // test-shaped way to observe the guard.
    const h = harness();
    const { result, unmount } = mount(blinker(), CONWAY, h);
    const { play, pause, step, stop, resizeLive } = result.current;
    unmount();

    const noSession = (op: string) =>
      `useSimulation: ${op} called with no live session (before mount or after unmount)`;
    expect(() => play()).toThrow(noSession('play'));
    expect(() => pause()).toThrow(noSession('pause'));
    expect(() => step()).toThrow(noSession('step'));
    expect(() => stop()).toThrow(noSession('stop'));
    expect(() => resizeLive({ cols: 5, rows: 5 })).toThrow(noSession('resizeLive'));
  });
});

// ── AC11 ───────────────────────────────────────────────────────────────────────────────────────

describe('useSimulation — the seed (AC11, RFC-008 Decision 4)', () => {
  function runWithSeed(seed: number, cycles: number): Uint8Array {
    const h = harness(10, seed);
    const fake = createFakeRenderer({ cols: 7, rows: 3 });
    const { result, unmount } = mount(contestedGrid(), TWO_CONWAYS, h);
    act(() => result.current.attachRenderer(fake.renderer));
    act(() => result.current.play());
    runCycles(h, cycles, 10);
    unmount();
    return fake.drawDiffSnapshots[fake.drawDiffSnapshots.length - 1];
  }

  it('two runs with the same seed over a tie-breaking roster agree after 20 cycles', () => {
    const first = runWithSeed(FIXED_SEED, 20);
    const second = runWithSeed(FIXED_SEED, 20);

    expect(first).toEqual(second);
  });

  it('the seed decides the tie: FIXED_SEED gives (3, 1) to b, seed 0 gives it to a', () => {
    // Cell (3, 1) has three `a` neighbours and three `b` neighbours at equal Dominance, so cycle 1
    // is only reachable through the tie-break — and two seeds resolve it DIFFERENTLY, which is what
    // proves `opts.seed` reaches the RNG (the same-seed test above would also pass if the seed were
    // ignored). The two winners are pinned values, not "some organism"; if mulberry32 or the
    // tie-break ever changes, this is the test that says so.
    const contested = 1 * 7 + 3;
    expect(runWithSeed(FIXED_SEED, 1)[contested]).toBe(2);
    expect(runWithSeed(0, 1)[contested]).toBe(1);
    expect(runWithSeed(FIXED_SEED, 20)).not.toEqual(runWithSeed(0, 20));
  });

  it.each([-1, 2 ** 32, 1.5])('rejects opts.seed %p, naming the seed', (seed) => {
    const h = harness(10, seed);
    expect(() => mount(blinker(), CONWAY, h)).toThrow(
      `useSimulation: seed must be an integer in [0, 2^32), got ${seed}`,
    );
  });

  it('mints a session seed inside [0, 2^32) when opts.seed is absent', () => {
    const scheduler = createFakeScheduler();
    const random = vi.spyOn(Math, 'random').mockReturnValue(0.999999);
    const grid = blinker();
    const { result } = renderHook(() =>
      useSimulation(grid, CONWAY, { genPerSec: 10, scheduler: scheduler.scheduler }),
    );

    expect(random).toHaveBeenCalledTimes(1);
    act(() => result.current.step());
    expect(result.current.cycle).toBe(1);
  });
});

// ── Extinction auto-pause (FR-4.7, Decision B.5, Story 3.15) ─────────────────────────────────────

describe('useSimulation — extinction auto-pause (AC1, AC2, AC3, FR-4.7, Decision B.5)', () => {
  it('a lone cell at 10 gen/sec auto-pauses at cycle 1: one keyed publish, loop stopped, empty grid painted', () => {
    const h = harness(10);
    const fake = createFakeRenderer({ cols: 3, rows: 3 });
    const initialGrid = lone();
    const { result } = mount(initialGrid, CONWAY, h);
    act(() => result.current.attachRenderer(fake.renderer));
    act(() => result.current.play());
    vi.mocked(derivePopulation).mockClear();
    // An auto-pause is a pause, not a Stop (AC2): the seed is not re-minted.
    const random = vi.spyOn(Math, 'random');

    act(() => h.scheduler.frame(0));
    act(() => h.scheduler.frame(100));

    expect(result.current.status).toBe('paused');
    expect(result.current.cycle).toBe(1);
    expect(result.current.population).toHaveLength(1);
    expect(result.current.population[0].extinct).toBe(true);
    expect(h.scheduler.pending()).toBe(0);
    expect(fake.drawDiff).toHaveLength(1);
    expect(Array.from(fake.drawDiffSnapshots[0]).every((cell) => cell === 0)).toBe(true);
    // The mount/attach prime only — no Stop-style repaint on an auto-pause.
    expect(fake.drawFull).toHaveLength(1);
    expect(result.current.liveSize).toEqual({ cols: 3, rows: 3 });
    expect(derivePopulation).toHaveBeenCalledTimes(1);
    expect(random).not.toHaveBeenCalled();
    // `initialGrid` is untouched (AR-31, FR-4.8): the live buffers went empty, the input did not.
    expect(initialGrid.occupant[4]).toBe(1);
  });

  it('the auto-pause frame commits exactly ONCE — never a status commit plus a publish commit (trap 3)', () => {
    const h = harness(10);
    let renders = 0;
    const grid = lone();
    const { result } = renderHook(() => {
      renders += 1;
      return useSimulation(grid, CONWAY, h.opts);
    });
    act(() => result.current.play());
    const rendersAfterPlay = renders;

    act(() => h.scheduler.frame(0));
    act(() => h.scheduler.frame(100));

    expect(renders).toBe(rendersAfterPlay + 1);
    expect(result.current.status).toBe('paused');
    expect(result.current.cycle).toBe(1);
  });

  it('off-cadence extinction still publishes the EXACT cycle at 20 gen/sec (trap 2)', () => {
    // cyclesPerPublish(20) === 2; the lone cell dies at cycle 1, which is off the cadence. Without
    // the stop path's own publish, the cadence branch would not fire (1 is odd) and the view would
    // keep showing cycle 0 (and `status: 'playing'`) over a loop that has already stopped.
    const h = harness(20);
    const { result } = mount(lone(), CONWAY, h);
    act(() => result.current.play());

    runCycles(h, 1, 20);

    expect(result.current.status).toBe('paused');
    expect(result.current.cycle).toBe(1);
  });

  it('resume after auto-pause: play() restarts the loop, and a still-empty grid auto-pauses again next cycle', () => {
    const h = harness(10);
    const fake = createFakeRenderer({ cols: 3, rows: 3 });
    const { result } = mount(lone(), CONWAY, h);
    act(() => result.current.attachRenderer(fake.renderer));
    act(() => result.current.play());
    act(() => h.scheduler.frame(0));
    act(() => h.scheduler.frame(100));
    expect(result.current.status).toBe('paused');
    expect(result.current.cycle).toBe(1);

    act(() => result.current.play());
    expect(result.current.status).toBe('playing');
    expect(h.scheduler.pending()).toBe(1);

    act(() => h.scheduler.frame(200));
    act(() => h.scheduler.frame(300));

    expect(result.current.status).toBe('paused');
    expect(result.current.cycle).toBe(2);
    expect(h.scheduler.pending()).toBe(0);
    expect(fake.drawDiff).toHaveLength(2);
    expect(Array.from(fake.drawDiffSnapshots[1]).every((cell) => cell === 0)).toBe(true);
  });

  it('step() after an auto-pause advances one more cycle, stays paused, and does not throw (FD5 guard does not fire)', () => {
    const h = harness(10);
    const { result } = mount(lone(), CONWAY, h);
    act(() => result.current.play());
    act(() => h.scheduler.frame(0));
    act(() => h.scheduler.frame(100));
    expect(result.current.cycle).toBe(1);
    vi.mocked(derivePopulation).mockClear();

    act(() => result.current.step());

    expect(result.current.cycle).toBe(2);
    expect(result.current.status).toBe('paused');
    expect(derivePopulation).toHaveBeenCalledTimes(1);
  });

  it('stop() after an auto-pause behaves exactly as today — fresh run at cycle 0, one drawFull, a new seed', () => {
    const h = harness(10);
    const fake = createFakeRenderer({ cols: 3, rows: 3 });
    const { result } = mount(lone(), CONWAY, h);
    act(() => result.current.attachRenderer(fake.renderer));
    act(() => result.current.play());
    act(() => h.scheduler.frame(0));
    act(() => h.scheduler.frame(100));
    expect(result.current.status).toBe('paused');
    const drawFullBefore = fake.drawFull.length;
    const random = vi.spyOn(Math, 'random').mockReturnValue(0.5);

    act(() => result.current.stop());

    expect(result.current.status).toBe('paused');
    expect(result.current.cycle).toBe(0);
    expect(fake.drawFull).toHaveLength(drawFullBefore + 1);
    expect(result.current.population[0].count).toBe(1);
    expect(result.current.population[0].extinct).toBe(false);
    expect(random).toHaveBeenCalledTimes(1);
  });

  it('manual step() onto an ALREADY-empty grid takes no stop path — one sweep, status unchanged', () => {
    const h = harness(10);
    const { result } = mount(lone(), CONWAY, h);
    act(() => result.current.step());
    expect(result.current.cycle).toBe(1);
    vi.mocked(derivePopulation).mockClear();

    act(() => result.current.step());

    expect(derivePopulation).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe('paused');
    expect(result.current.cycle).toBe(2);
  });

  // AC4: still-lifes, oscillators and gliders keep running — the intuitive "a static grid pauses"
  // test is a spec violation (Decision B.5, project-context).
  it('a block (still-life) never auto-pauses across 20 cycles — status stays playing, age still climbs', () => {
    const h = harness(10);
    const fake = createFakeRenderer({ cols: 4, rows: 4 });
    const { result } = mount(block(), CONWAY, h);
    act(() => result.current.attachRenderer(fake.renderer));
    act(() => result.current.play());

    runCycles(h, 20, 10);

    expect(result.current.status).toBe('playing');
    expect(h.scheduler.pending()).toBe(1);
    expect(result.current.cycle).toBe(20);
    // The grid that "did nothing" was still evolving: age saturates at maxRelevantAge = 7.
    const last = fake.drawDiff[fake.drawDiff.length - 1];
    expect(last.age[1 * 4 + 1]).toBe(7);
  });

  it('the blinker (period 2) never auto-pauses across 20 cycles', () => {
    const h = harness(10);
    const { result } = mount(blinker(), CONWAY, h);
    act(() => result.current.play());

    runCycles(h, 20, 10);

    expect(result.current.status).toBe('playing');
    expect(h.scheduler.pending()).toBe(1);
    expect(result.current.cycle).toBe(20);
  });

  it('a glider (12x12) never auto-pauses across 20 cycles', () => {
    const h = harness(10);
    const { result } = mount(glider12(), CONWAY, h);
    act(() => result.current.play());

    runCycles(h, 20, 10);

    expect(result.current.status).toBe('playing');
    expect(h.scheduler.pending()).toBe(1);
    expect(result.current.cycle).toBe(20);
  });
});

// ── The error-stop follows the same path (AC6, FD3) ───────────────────────────────────────────────

describe('useSimulation — the error-stop follows the same path (AC6, FD3, Story 3.15)', () => {
  it('a renderer whose drawDiff throws once: the frame throws, status follows to paused, and play() resumes', () => {
    const h = harness(10);
    const boom = new Error('boom');
    let calls = 0;
    const throwingRenderer: PlaybackRenderer = {
      drawDiff: () => {
        calls += 1;
        if (calls === 1) throw boom;
      },
      drawFull: () => {},
      resize: () => {},
    };
    const { result } = mount(blinker(), CONWAY, h);
    act(() => result.current.attachRenderer(throwingRenderer));
    act(() => result.current.play());
    act(() => h.scheduler.frame(0));

    // Caught INSIDE `act` (not let escape it): React's `act` only flushes pending state updates
    // when its callback returns normally (verified against `react/cjs/react.development.js`'s
    // `act`: a callback that throws skips `flushActQueue` entirely). Production does NOT have
    // this problem — a RAF callback that throws still leaves the `setView` dispatched from inside
    // `settleStopped` scheduled with React, and it flushes regardless; only the test harness
    // needs the error kept inside the callback.
    let caught: unknown;
    act(() => {
      try {
        h.scheduler.frame(100);
      } catch (error) {
        caught = error;
      }
    });

    expect(caught).toBe(boom);
    // The step completed before the paint threw — cycle 1 stands, and `status` follows to paused
    // instead of reading 'playing' over a dead loop (the 3-10 review finding).
    expect(result.current.status).toBe('paused');
    expect(result.current.cycle).toBe(1);
    expect(h.scheduler.pending()).toBe(0);

    act(() => result.current.play());
    expect(h.scheduler.pending()).toBe(1);
  });

  it('a throw from inside the step thunk (a cadence publish that throws) takes the driver-side wrapper: status follows to paused, and play() resumes', () => {
    // The only throw a valid session can raise from inside `session.step()` is the publish's own
    // `derivePopulation` (M12 compiles the roster up front, so the strategy does not throw) —
    // reachable here because `./population` is spy-mocked. The wrapper's `settleStopped` then
    // sweeps again with the real implementation (`mockImplementationOnce` is consumed).
    const h = harness(10);
    const boom = new Error('publish boom');
    const { result } = mount(blinker(), CONWAY, h);
    act(() => result.current.play());
    act(() => h.scheduler.frame(0));
    vi.mocked(derivePopulation).mockImplementationOnce(() => {
      throw boom;
    });

    let caught: unknown;
    act(() => {
      try {
        h.scheduler.frame(100);
      } catch (error) {
        caught = error;
      }
    });

    expect(caught).toBe(boom);
    expect(result.current.status).toBe('paused');
    expect(result.current.cycle).toBe(1);
    expect(h.scheduler.pending()).toBe(0);

    act(() => result.current.play());
    expect(h.scheduler.pending()).toBe(1);
  });
});

describe('useSimulation — accepts a SimulationOrganism roster (Story 4.15, FD6)', () => {
  it('runs one step over a roster typed as SimulationOrganism[], built without schemaVersion or agingEnabled', () => {
    const {
      schemaVersion: _schemaVersion,
      agingEnabled: _agingEnabled,
      ...draftOrganism
    } = CONWAYS_CLASSIC;
    const roster: readonly SimulationOrganism[] = [draftOrganism];
    const h = harness(10);
    const { result } = mount(blinker(), roster, h);

    act(() => result.current.play());
    act(() => h.scheduler.frame(0));
    act(() => h.scheduler.frame(msPerCycle(10)));

    expect(result.current.cycle).toBe(1);
    expect(result.current.population).toEqual([
      {
        organismId: draftOrganism.id,
        name: draftOrganism.name,
        colorToken: draftOrganism.colorToken,
        count: 3,
        pct: 100,
        extinct: false,
      },
    ]);
  });
});
