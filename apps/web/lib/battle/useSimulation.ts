'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Organism } from '@gol/domain';
import {
  cloneGrid,
  compileSession,
  createGrid,
  createGridBuffers,
  createRng,
  createSimulationLoop,
  resizeGrid,
  stepGridBuffers,
  type CompiledSession,
  type FrameScheduler,
  type Grid,
  type GridBuffers,
  type SimulationDeps,
  type SimulationLoop,
  type StepRenderer,
} from '@gol/simulation';
import type { GridRenderer } from '@/lib/canvas/gridRenderer';
import { derivePopulation, type PopulationEntry } from './population';
import { rafScheduler } from './rafScheduler';
import { cyclesPerPublish, msPerCycle, type GenPerSec } from './simulationSpeed';

export type { PopulationEntry } from './population';
export type { GenPerSec } from './simulationSpeed';

/**
 * The one React<->engine bridge (RFC-005 Decision 5, AR-29, `component-tree-battle-page.md`
 * §4/§6). Everything below this hook is React-free and everything above it never sees a buffer:
 * the live `GridBuffers`, the `SimulationDeps`, the RAF loop, the cycle counter, `msPerCycle` and
 * the attached renderer are REFS, and only `cycle`, `population`, `status`, `genPerSec` and
 * `liveSize` are React state — the first two published at <= 10 Hz (M2), the rest on user action.
 * A `setState` per cycle is the failure NFR-1.1 names; the AC3 render-count test is its tripwire.
 *
 * ## What the hook composes, and the three decisions that are new here
 *
 * - `compileSession` (Story 3.4) spreads straight into `SimulationDeps` with the roster and a
 *   `createRng(seed)` — the "cheapest shape", `threePhaseStep.ts`'s words. `stepGridBuffers`
 *   (Story 3.8) runs a cycle and swaps; `createSimulationLoop` (Story 3.8) turns time into calls
 *   to ONE step thunk that this hook owns (the cycle counter lives with the thunk because manual
 *   Step bypasses the loop — Story 3.12). `cloneGrid` (Story 3.10) is RFC-005 Decision 4's clone.
 * - **Publish cadence by cycle count, not clock (FD4).** The thunk publishes every
 *   `cyclesPerPublish(genPerSec)` cycles (`simulationSpeed.ts`); with the ladder (Decision D) and
 *   <= 1 step per frame that is <= 10 Hz under any frame rate, needs no `performance.now()`, and is
 *   deterministic under the tests' fake scheduler. `pause()`, `step()` and `stop()` publish
 *   unconditionally so the displayed cycle is never stale while paused.
 * - **A ref-forwarding `StepRenderer` (FD3).** The loop is built once per session with
 *   `draw: (g) => rendererRef.current?.drawDiff(g)`, so a renderer that arrives AFTER the loop —
 *   a child's construction effect fires before this hook's session effect — or is swapped (Story
 *   3.16's canvas rebuild, Story 3.18's fullscreen) never rebuilds the loop, and with no renderer
 *   the run keeps stepping headless (what the jsdom tests and Story 4.15's unmounted preview both
 *   need). It forwards to `drawDiff` and NEVER `draw`: a raw `GridRenderer` type-checks as the
 *   loop's port and paints nothing, because `draw` is the marks-only Edit path and the loop marks
 *   nothing (`playbackRenderer.ts`'s `toStepRenderer` encodes the same intent for a renderer that
 *   is known up front — Story 3.9's adapter; here it is late and replaceable, hence the ref).
 * - **The session is keyed on `(initialGrid, organisms)` (FD2).** A new reference is a new run at
 *   cycle 0 with a fresh seed; the same references across re-renders mean nothing happens.
 *   Handlers called before the session exists throw — unreachable from a rendered control,
 *   reachable from a test, never a silent no-op. `step()` and `resizeLive()` while playing throw
 *   too (FD5): FR-4.3 and FR-4.9 make both paused-only and Stories 3.12/3.16 disable the controls,
 *   so a call that arrives anyway is a consumer bug.
 *
 * ## Consumer obligations (Story 3.11's `<BattleSimulationView>` inherits these)
 *
 * 1. Pass STABLE references — `initialGrid` from state, `organisms` memoised. An array rebuilt per
 *    render restarts the run every render, silently.
 * 2. `organisms` is the battle roster as domain `Organism` records in ROSTER ORDER — one per slot,
 *    `organisms[ref - 1]` (M14). It satisfies `CompilableOrganism` and `OrganismRuntime`
 *    structurally (M13) and carries the `name` / `colorToken` the population entries need.
 * 3. Unmount the view to leave Run mode. No live grid survives Run -> Lab (RFC-005 Decision 4);
 *    unmount stops the loop, detaches the renderer and drops the session.
 * 4. Hand the canvas's `onRendererReady(r)` straight to `attachRenderer(r)`, and its cleanup to
 *    `attachRenderer(null)`. Any order works (Trap 1), and the canvas may be built at any size:
 *    from attach on the hook owns the renderer's grid size, and every full repaint it issues goes
 *    through `resize` first whenever the renderer is not known to be at that grid's size (a fresh
 *    attach, a rebind to a differently-sized `initialGrid`, a `stop()` after an ephemeral resize).
 *    `GridRenderer` asserts every grid against its size, so a repaint without that step throws.
 * 6. `opts.genPerSec` is the INITIAL speed only. Speed changes go through `setSpeed`; a changed
 *    prop is not observed (Trap 10 — a prop-driven restart on every slider move is the bug).
 * 5. `compileSession` throws `RuleCompilationError` for a bad roster or rule BEFORE the first
 *    cycle (M12). It is deliberately not caught here: the roster comes from a schema-validated
 *    battle and library, so this is unreachable in normal use, and swallowing it would make a run
 *    that "does nothing". It propagates from the session effect to the nearest error boundary —
 *    there is none under `(battle)` today (`deferred-work.md`, 4-1 review); Story 3.11 decides.
 *
 * ## The seed (AR-31's sibling: config, not outcome)
 *
 * Minted here — `Math.floor(Math.random() * 2 ** 32)` — per session and per `stop()`, the ONLY
 * `Math.random` in the run path (`rng.ts`: "decided where a run is started"). `opts.seed` exists
 * for tests (RFC-008 Decision 4) and seeds the session at mount and on a rebind; `stop()` always
 * mints anew, so a Stop is a new run even under a fixed seed. Both routes pass through
 * `assertSeedDomain`: mulberry32 holds 32 bits, so seeds that agree modulo 2^32 replay one
 * sequence and "which seed did this run use" is only answerable inside `[0, 2^32)`.
 *
 * ## Not here
 *
 * No extinction check (Decision B.5, Story 3.15 — the seam is marked in the thunk), no hotkeys
 * (Story 3.19), no preset validation in `resizeLive` (Story 3.16's control), no component.
 */

/** `Pick`, not the class: a test hands in a recording object and the hook never sees a canvas. */
export type PlaybackRenderer = Pick<GridRenderer, 'drawDiff' | 'drawFull' | 'resize'>;

export type SimulationStatus = 'paused' | 'playing';

export interface UseSimulationOptions {
  /** The initial speed only — change it through `setSpeed`; a changed prop is not observed. */
  readonly genPerSec: GenPerSec;
  /** Tests only. Must be an integer in `[0, 2^32)`; production mints its own. */
  readonly seed?: number;
  /** Tests only. Defaults to `rafScheduler` — bound `requestAnimationFrame`. */
  readonly scheduler?: FrameScheduler;
}

export interface LiveSize {
  readonly cols: number;
  readonly rows: number;
}

export interface UseSimulationResult {
  readonly status: SimulationStatus;
  /** Published at <= 10 Hz while playing; exact after `pause()`, `step()` and `stop()`. */
  readonly cycle: number;
  /** Pre-sorted (living by count desc, then extinct), published with `cycle`. */
  readonly population: readonly PopulationEntry[];
  readonly genPerSec: GenPerSec;
  /** The live buffers' dimensions — `initialGrid`'s until `resizeLive`, and again after `stop()`. */
  readonly liveSize: LiveSize;
  play(): void;
  pause(): void;
  /** Exactly one cycle, outside the loop. Throws while playing (FD5). */
  step(): void;
  stop(): void;
  setSpeed(genPerSec: GenPerSec): void;
  /** Ephemeral, paused-only (FR-4.9). Throws while playing (FD5). */
  resizeLive(size: LiveSize): void;
  attachRenderer(renderer: PlaybackRenderer | null): void;
}

const SEED_RANGE = 2 ** 32;

function assertSeedDomain(seed: number): void {
  if (!Number.isInteger(seed) || seed < 0 || seed >= SEED_RANGE) {
    throw new Error(`useSimulation: seed must be an integer in [0, 2^32), got ${seed}`);
  }
}

function mintSeed(): number {
  return Math.floor(Math.random() * SEED_RANGE);
}

/**
 * What a run is bound to (FD2): a new reference in any field is a new run. Held on the view (the
 * render-phase reset compares it) AND on the session (a publish refuses a session whose key is not
 * the view's — see `publish`). `seed` here is `opts.seed`, possibly undefined; the session's
 * effective seed is minted separately.
 */
interface SessionKey {
  readonly initialGrid: Grid;
  readonly organisms: readonly Organism[];
  readonly seed: number | undefined;
  readonly scheduler: FrameScheduler;
}

function sameKey(a: SessionKey, b: SessionKey): boolean {
  return (
    a.initialGrid === b.initialGrid &&
    a.organisms === b.organisms &&
    a.seed === b.seed &&
    a.scheduler === b.scheduler
  );
}

/** Everything one run owns, held in a ref for the run's lifetime. Module-private by design. */
interface SimulationSession {
  /** Replaced by every step (`stepGridBuffers` returns a NEW pair — Trap 4), never mutated. */
  buffers: GridBuffers;
  deps: SimulationDeps;
  cycle: number;
  seed: number;
  readonly loop: SimulationLoop;
  /** The ONE step function: the loop's `step` and manual `step()` both call it. */
  readonly step: () => Grid;
  readonly key: SessionKey;
  readonly compiled: CompiledSession;
}

/**
 * The cadence test, in ONE place: the thunk publishes on these cycles and manual `step()` on the
 * others, so a click costs one sweep whichever side of the cadence it lands on. `cyclesPerPublish`
 * is 1 for four of the five ladder speeds, so "on the cadence" is the COMMON case for a click.
 */
function isPublishCycle(cycle: number, genPerSec: GenPerSec): boolean {
  return cycle % cyclesPerPublish(genPerSec) === 0;
}

/**
 * The published view — the only thing React renders from a run. One state cell so `cycle` and
 * `population` are never observed out of step and so the render-phase reset below replaces the
 * whole view at once. `key` is what the reset compares: React's "adjusting state when a prop
 * changes" pattern reads the previous prop out of STATE, because `react-hooks/refs` rejects a ref
 * read during render outright (`useUndoableGrid` records the same choice).
 */
interface RunView {
  readonly key: SessionKey;
  readonly status: SimulationStatus;
  readonly cycle: number;
  readonly population: readonly PopulationEntry[];
  readonly liveSize: LiveSize;
}

function initialView(key: SessionKey): RunView {
  // At cycle 0 the live grid is a byte-identical clone of `initialGrid`, so the population of the
  // initial grid IS the run's first publish — computed here, during render, so the session effect
  // never has to set state on mount (which `react-hooks/set-state-in-effect` flags as a cascade).
  return {
    key,
    status: 'paused',
    cycle: 0,
    population: derivePopulation(key.initialGrid, key.organisms),
    liveSize: { cols: key.initialGrid.width, rows: key.initialGrid.height },
  };
}

interface SessionInputs {
  readonly key: SessionKey;
  /** The effective seed — `key.seed` when given, a fresh mint otherwise. */
  readonly seed: number;
  readonly msPerCycleRef: { readonly current: number };
  readonly genPerSecRef: { readonly current: GenPerSec };
  readonly rendererRef: { readonly current: PlaybackRenderer | null };
  readonly publish: (session: SimulationSession) => void;
}

function createSession(inputs: SessionInputs): SimulationSession {
  const { key, seed, msPerCycleRef, genPerSecRef, rendererRef } = inputs;
  const { initialGrid, organisms, scheduler } = key;
  assertSeedDomain(seed);

  // Throws `RuleCompilationError` for a bad roster before the first cycle (M12) — not caught, see
  // the head comment.
  const compiled = compileSession(organisms);

  // FD3 — the forwarding renderer. `drawDiff`, never `draw` (Trap 2); optional chaining is the
  // headless case, not a guard against a bug.
  const forwardingRenderer: StepRenderer = {
    draw: (grid) => rendererRef.current?.drawDiff(grid),
  };

  const session: SimulationSession = {
    // The clone, never `initialGrid` itself: after one swap the grid handed to
    // `createGridBuffers` IS `back` (Trap 3), and AR-31 forbids a run writing the persisted dish.
    buffers: createGridBuffers(cloneGrid(initialGrid)),
    deps: { ...compiled, organisms, rng: createRng(seed) },
    cycle: 0,
    seed,
    key,
    compiled,
    step: () => {
      // Store the return value (Trap 4) — the pair is new, the old one's `front` is now scratch.
      session.buffers = stepGridBuffers(session.buffers, session.deps);
      session.cycle += 1;
      // Story 3.15's extinction check goes HERE — after the step, before the publish — and must
      // be its own per-cycle scan, not a reuse of the population pass below: that pass runs only
      // at publish cadence, and an empty grid can be re-seeded by a `neighbors = 0` born rule, so
      // an extinction observed one publish late is a wrong auto-stop (Decision B.5).
      if (isPublishCycle(session.cycle, genPerSecRef.current)) inputs.publish(session);
      return session.buffers.front;
    },
    loop: createSimulationLoop({
      renderer: forwardingRenderer,
      step: () => session.step(),
      msPerCycleRef,
      scheduler,
    }),
  };
  return session;
}

export function useSimulation(
  initialGrid: Grid,
  organisms: readonly Organism[],
  opts: UseSimulationOptions,
): UseSimulationResult {
  const { seed: seedOpt, scheduler = rafScheduler } = opts;

  // Hot state: refs, never React state (RFC-005 Decision 5). `msPerCycleRef` seeds from the initial
  // speed and is then owned by `setSpeed` (Trap 10 — a `genPerSec` dep on the session effect would
  // restart the run on every slider move). Every read or write of these is inside an effect or a
  // callback; none during render (`react-hooks/refs`).
  const sessionRef = useRef<SimulationSession | null>(null);
  const rendererRef = useRef<PlaybackRenderer | null>(null);
  const msPerCycleRef = useRef(msPerCycle(opts.genPerSec));
  const genPerSecRef = useRef<GenPerSec>(opts.genPerSec);

  const [genPerSec, setGenPerSec] = useState<GenPerSec>(opts.genPerSec);
  const [view, setView] = useState<RunView>(() =>
    initialView({ initialGrid, organisms, seed: seedOpt, scheduler }),
  );

  // Reset during RENDER when the session key changes (option (b) of the story's Task 4) — React's
  // documented "adjusting state when a prop changes": the body re-runs immediately with the new
  // view, before children or paint, so nothing flashes and the session effect below only builds
  // refs. The alternative, a publish from the effect on mount, is a cascading render and a lint
  // error under `react-hooks/set-state-in-effect`.
  if (
    view.key.initialGrid !== initialGrid ||
    view.key.organisms !== organisms ||
    view.key.seed !== seedOpt ||
    view.key.scheduler !== scheduler
  ) {
    setView(initialView({ initialGrid, organisms, seed: seedOpt, scheduler }));
  }

  // The publish: one `setView` carrying `cycle` and `population` together — a single render, from
  // any context including a RAF callback (React 19 batches everywhere). The population sweep runs
  // here and nowhere else (M2).
  const publish = useCallback((session: SimulationSession) => {
    const population = derivePopulation(session.buffers.front, session.key.organisms);
    // Refuse a foreign session. On a rebind the view is reset during render, but the old loop is
    // stopped only in the session effect's cleanup — which React flushes AFTER paint for a
    // non-discrete update (a repository load resolving, a transition) — so a frame in that window
    // steps the OLD session and would merge its cycle and population onto the NEW key's view,
    // with nothing to republish until the user acts. The key is the guard, not `sessionRef`: in
    // that same window the ref still points at the old session.
    setView((prev) =>
      sameKey(prev.key, session.key) ? { ...prev, cycle: session.cycle, population } : prev,
    );
  }, []);

  // The grid size the hook last put onto the attached renderer, or `null` when it has not sized it
  // yet. `GridRenderer` asserts every grid it paints against its own size, so a full repaint at a
  // size the renderer is not at throws — and only the hook knows when that is about to happen (a
  // fresh attach, a rebind to a differently-sized `initialGrid`, a `stop()` after an ephemeral
  // resize). One ref lets every full repaint make the "resize first?" call in one place.
  const paintedSizeRef = useRef<LiveSize | null>(null);

  const paintFull = useCallback((renderer: PlaybackRenderer, grid: Grid) => {
    const painted = paintedSizeRef.current;
    if (painted === null || painted.cols !== grid.width || painted.rows !== grid.height) {
      const size = { cols: grid.width, rows: grid.height };
      renderer.resize(size);
      paintedSizeRef.current = size;
    }
    renderer.drawFull(grid);
  }, []);

  // The session effect (FD2). Builds refs only; the view was reset during render above.
  useEffect(() => {
    const key: SessionKey = { initialGrid, organisms, seed: seedOpt, scheduler };
    const session = createSession({
      key,
      seed: seedOpt ?? mintSeed(),
      msPerCycleRef,
      genPerSecRef,
      rendererRef,
      publish,
    });
    sessionRef.current = session;
    // Trap 1: a child's construction effect may already have attached a renderer. Prime it — on a
    // rebind that renderer is still at the previous run's size, which `paintFull` undoes.
    const renderer = rendererRef.current;
    if (renderer !== null) paintFull(renderer, session.buffers.front);
    return () => {
      // Complete cleanup, or StrictMode's double-invocation (Trap 6) leaves the first loop stepping
      // a dropped session: stop the chain and forget the session. The renderer is NOT detached
      // here — a rebind keeps the mounted canvas, and its renderer, for the next session.
      session.loop.stop();
      sessionRef.current = null;
    };
  }, [initialGrid, organisms, seedOpt, scheduler, publish, paintFull]);

  // Unmount only: drop the renderer so the canvas it belongs to can go with the view.
  useEffect(
    () => () => {
      rendererRef.current = null;
      paintedSizeRef.current = null;
    },
    [],
  );

  const requireSession = useCallback((op: string): SimulationSession => {
    const session = sessionRef.current;
    if (session === null) {
      // Both ends of the run: before the session effect, and after its cleanup — the realistic
      // one, a captured handler firing after Run -> Lab.
      throw new Error(
        `useSimulation: ${op} called with no live session (before mount or after unmount)`,
      );
    }
    return session;
  }, []);

  const attachRenderer = useCallback(
    (renderer: PlaybackRenderer | null) => {
      rendererRef.current = renderer;
      // A fresh renderer is at whatever size its canvas was built with — unknown here — so the
      // next full repaint resizes it first (a `resize` to the size it already has is cheap).
      paintedSizeRef.current = null;
      const session = sessionRef.current;
      if (renderer !== null && session !== null) paintFull(renderer, session.buffers.front);
    },
    [paintFull],
  );

  const play = useCallback(() => {
    const session = requireSession('play');
    // Idempotent through the loop's own guard (Story 3.8 AC6); the status write is skipped when
    // already playing so a repeated `play()` is not a render either.
    session.loop.start();
    setView((prev) => (prev.status === 'playing' ? prev : { ...prev, status: 'playing' }));
  }, [requireSession]);

  const pause = useCallback(() => {
    const session = requireSession('pause');
    session.loop.stop();
    // Publish the exact paused cycle (FR-4.5): the last loop publish may be up to
    // `cyclesPerPublish - 1` cycles stale.
    const population = derivePopulation(session.buffers.front, session.key.organisms);
    setView((prev) => ({ ...prev, status: 'paused', cycle: session.cycle, population }));
  }, [requireSession]);

  const step = useCallback(() => {
    const session = requireSession('step');
    // FD5 — the loop's truth, not React state, which may be a render behind.
    if (session.loop.isRunning()) throw new Error('useSimulation: step() called while playing');
    const front = session.step();
    // Outside the loop the hook repaints — same adapter method the loop's `draw` forwards to.
    rendererRef.current?.drawDiff(front);
    // Every manual step publishes (FR-4.5 "including manual steps") — through the thunk when the
    // cycle is on the cadence, here otherwise. One sweep per click, never two.
    if (!isPublishCycle(session.cycle, genPerSecRef.current)) publish(session);
  }, [requireSession, publish]);

  const stop = useCallback(() => {
    const session = requireSession('stop');
    session.loop.stop();
    const { initialGrid: initial, organisms } = session.key;
    // A new run: fresh buffers from a fresh clone at `initialGrid`'s OWN size (an ephemeral
    // resize is gone — FR-4.9), a fresh seed through the same domain check as the mint, and the
    // same compiled evaluators (the roster is unchanged; only the generator restarts).
    const seed = mintSeed();
    assertSeedDomain(seed);
    session.seed = seed;
    session.deps = { ...session.compiled, organisms, rng: createRng(seed) };
    session.buffers = createGridBuffers(cloneGrid(initial));
    session.cycle = 0;
    // `paintFull` undoes an ephemeral resize on the canvas before the repaint.
    const renderer = rendererRef.current;
    if (renderer !== null) paintFull(renderer, session.buffers.front);
    const population = derivePopulation(session.buffers.front, organisms);
    setView((prev) => ({
      ...prev,
      status: 'paused',
      cycle: 0,
      population,
      liveSize: { cols: initial.width, rows: initial.height },
    }));
  }, [requireSession, paintFull]);

  const setSpeed = useCallback((next: GenPerSec) => {
    // AR-34 / FR-4.2: a ref write IS the speed change. The loop reads `msPerCycleRef` live every
    // frame and is neither stopped nor restarted; `genPerSecRef` re-derives the publish divisor
    // on the next step. No session needed, so this is callable at any time.
    msPerCycleRef.current = msPerCycle(next);
    genPerSecRef.current = next;
    setGenPerSec(next);
  }, []);

  const resizeLive = useCallback(
    (size: LiveSize) => {
      const session = requireSession('resizeLive');
      if (session.loop.isRunning()) {
        throw new Error('useSimulation: resizeLive() called while playing');
      }
      const { cols, rows } = size;
      // `resizeGrid` carries occupant AND age (Story 3.3 FD6). `initialGrid` is untouched —
      // Decision A.2's ephemeral expansion; `stop()` undoes it.
      const front = resizeGrid(session.buffers.front, cols, rows);
      // The renderer BEFORE the buffers: it owns the canvas and is the party most likely to refuse
      // a size, and if it throws the session must still be at the size the canvas is at, or the
      // next `step()` paints a grid the renderer no longer matches.
      const renderer = rendererRef.current;
      if (renderer !== null) paintFull(renderer, front);
      // Both buffers: `back`'s contents are meaningless between cycles, so a fresh empty scratch of
      // the new size is all it needs.
      session.buffers = { front, back: createGrid(cols, rows) };
      // A shrink clips cells, so the population is republished with the size.
      const population = derivePopulation(front, session.key.organisms);
      setView((prev) => ({ ...prev, cycle: session.cycle, population, liveSize: { cols, rows } }));
    },
    [requireSession, paintFull],
  );

  // Memoised so a consumer's effect over the result re-runs only when a published value changed.
  return useMemo(
    () => ({
      status: view.status,
      cycle: view.cycle,
      population: view.population,
      genPerSec,
      liveSize: view.liveSize,
      play,
      pause,
      step,
      stop,
      setSpeed,
      resizeLive,
      attachRenderer,
    }),
    [view, genPerSec, play, pause, step, stop, setSpeed, resizeLive, attachRenderer],
  );
}
