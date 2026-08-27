import { Profiler, type ReactElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import { GridRenderer } from '@/lib/canvas/gridRenderer';
import { installRecordingContext2d, RecordingContext2D } from '@/lib/recordingContext2d';
import type { RefToFillGroup } from '@/lib/canvas/refToFillGroup';
import type { RenderableGrid } from '@/lib/canvas/renderableGrid';
import { displayColorAt } from '@/lib/palette/displayColor';
import { ERASER_TOOL, type Tool } from '@/lib/tool';
import PetriDishCanvas from './PetriDishCanvas';

const COLORS = { background: '#0a0a0a', gridLine: 'rgb(51 51 51 / 0.3)' };
const SIZE = { cols: 2, rows: 2 };

function makeGrid(width: number, height: number, occupant: number[]): RenderableGrid {
  return {
    width,
    height,
    occupant: Uint8Array.from(occupant),
    age: new Uint16Array(occupant.length),
  };
}

function makeLut(tokenIndex: number[], aging: number[]): RefToFillGroup {
  return {
    tokenIndex: Uint8Array.from(tokenIndex),
    aging: Uint8Array.from(aging),
    size: tokenIndex.length,
  };
}

// Cells 0 (empty) and 1 (ref 1 -> token index 0, non-aging).
const GRID = makeGrid(2, 2, [1, 0, 0, 1]);
const PALETTE = makeLut([0, 0], [0, 0]);

// The edit variant's Story 2.5 props. `TOOL` is the shape spec §3.10 gives the canvas; `toolRef`
// is what it actually paints with (forced decision 2 — <BattleEditorView> resolves the id).
const TOOL: Tool = { kind: 'organism', organismId: 'conways-classic' };
const noopCommit = () => {};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('PetriDishCanvas (static variant)', () => {
  it('renders a canvas with no accessible role, aria-hidden (Dev Notes forced decision 5)', () => {
    const { container } = render(
      <PetriDishCanvas
        variant="static"
        grid={GRID}
        size={SIZE}
        palette={PALETTE}
        showGridLines
        colors={COLORS}
      />,
    );
    const canvas = container.querySelector('canvas');
    expect(canvas).not.toBeNull();
    expect(canvas).toHaveAttribute('aria-hidden', 'true');
  });

  // The real (unmocked) jsdom context is null — this IS the "2D context unavailable" degradation
  // row (Task 5's table), and the failure mode a throw-out-of-effect would produce is unmounting
  // the whole Gallery tree. No spy installed here on purpose.
  it("does not throw when getContext('2d') returns null (real jsdom behaviour)", () => {
    expect(() =>
      render(
        <PetriDishCanvas
          variant="static"
          grid={GRID}
          size={SIZE}
          palette={PALETTE}
          showGridLines
          colors={COLORS}
        />,
      ),
    ).not.toThrow();
  });

  it('calls GridRenderer.prototype.renderStatic and never drawFull (AC1)', () => {
    const renderStaticSpy = vi.spyOn(GridRenderer.prototype, 'renderStatic');
    const drawFullSpy = vi.spyOn(GridRenderer.prototype, 'drawFull');

    const { container, rerender } = render(
      <PetriDishCanvas
        variant="static"
        grid={GRID}
        size={SIZE}
        palette={PALETTE}
        showGridLines
        colors={COLORS}
      />,
    );
    const canvas = container.querySelector('canvas') as HTMLCanvasElement;
    installRecordingContext2d(canvas);

    // Force the paint effect to run again now that the recording context is installed — a new
    // `colors` object identity is a real dependency-array change, unlike the earlier real-jsdom
    // pass whose null context was silently caught.
    rerender(
      <PetriDishCanvas
        variant="static"
        grid={GRID}
        size={SIZE}
        palette={PALETTE}
        showGridLines
        colors={{ ...COLORS }}
      />,
    );

    expect(renderStaticSpy).toHaveBeenCalledTimes(1);
    expect(drawFullSpy).not.toHaveBeenCalled();
  });

  it('paints background, then per-group beginPath/rect/fill, then grid lines, in that order', () => {
    // A 10x10 grid in a 400px canvas: 40px per cell, comfortably over MIN_GRID_LINE_CELL_SIZE (4),
    // so grid lines are actually drawn and the "then grid lines" half of this test's name has
    // something to assert. At the 2x2/0px default the lines are suppressed and the ordering claim
    // is unverifiable.
    const bigSize = { cols: 10, rows: 10 };
    const occupant = new Array(100).fill(0);
    occupant[0] = 1;
    const bigGrid = makeGrid(10, 10, occupant);

    const { container, rerender } = render(
      <PetriDishCanvas
        variant="static"
        grid={bigGrid}
        size={bigSize}
        palette={PALETTE}
        showGridLines
        colors={COLORS}
      />,
    );
    const canvas = container.querySelector('canvas') as HTMLCanvasElement;
    canvas.width = 400;
    canvas.height = 400;
    const recording = installRecordingContext2d(canvas);

    rerender(
      <PetriDishCanvas
        variant="static"
        grid={bigGrid}
        size={bigSize}
        palette={PALETTE}
        showGridLines
        colors={{ ...COLORS }}
      />,
    );

    const ops = recording.calls.map((c) => c.op);
    // The constructor asserts an identity transform first (Story 1.8) — the background fill is
    // the first DRAWING op, not necessarily calls[0].
    const firstFillRectIndex = ops.indexOf('fillRect');
    expect(firstFillRectIndex).toBeGreaterThanOrEqual(0);
    const beginPathIndex = ops.indexOf('beginPath');
    expect(beginPathIndex).toBeGreaterThan(firstFillRectIndex); // background before cells
    expect(ops[beginPathIndex + 1]).toBe('rect');
    expect(ops).toContain('fill');

    // …and grid lines AFTER the cells. Lines painted first would be erased by the cell fills on
    // top of them, which is a real regression the previous form of this test could not see: it
    // asserted nothing at all about the third phase its own name promised.
    const lastFillIndex = ops.lastIndexOf('fill');
    const gridLineFillRectIndex = ops.indexOf('fillRect', lastFillIndex);
    expect(gridLineFillRectIndex).toBeGreaterThan(lastFillIndex);

    // fillStyle writes are the LUT's colours (asserted against displayColorAt, ageShade 7: ref 1
    // is non-aging, and a non-aging organism renders at its token's age-cap shade — displayColor.ts)
    // — never a hex literal restated in the test.
    expect(recording.fillStyleWrites).toContain(displayColorAt(0, 7));
  });

  it('draws no grid-line fillRects when showGridLines is false', () => {
    const bigSize = { cols: 10, rows: 10 };
    const bigGrid = makeGrid(10, 10, new Array(100).fill(0));
    const { container, rerender } = render(
      <PetriDishCanvas
        variant="static"
        grid={bigGrid}
        size={bigSize}
        palette={PALETTE}
        showGridLines={false}
        colors={COLORS}
      />,
    );
    const canvas = container.querySelector('canvas') as HTMLCanvasElement;
    canvas.width = 400;
    canvas.height = 400;
    const recording = installRecordingContext2d(canvas);

    rerender(
      <PetriDishCanvas
        variant="static"
        grid={bigGrid}
        size={bigSize}
        palette={PALETTE}
        showGridLines={false}
        colors={{ ...COLORS }}
      />,
    );

    // Background is the one fillRect against the full canvas box; no further fillRects means no
    // grid lines were drawn (cells are all empty here, so the only other possible fillRect source
    // is paintGridLines).
    expect(recording.calls.filter((c) => c.op === 'fillRect')).toHaveLength(1);
  });

  it('draws grid-line fillRects when showGridLines is true at a legible cell size', () => {
    const bigSize = { cols: 10, rows: 10 };
    const bigGrid = makeGrid(10, 10, new Array(100).fill(0));
    const { container, rerender } = render(
      <PetriDishCanvas
        variant="static"
        grid={bigGrid}
        size={bigSize}
        palette={PALETTE}
        showGridLines
        colors={COLORS}
      />,
    );
    const canvas = container.querySelector('canvas') as HTMLCanvasElement;
    // >= MIN_GRID_LINE_CELL_SIZE (4) at a 10x10 grid: 400/10 = 40px/cell.
    canvas.width = 400;
    canvas.height = 400;
    const recording = installRecordingContext2d(canvas);

    rerender(
      <PetriDishCanvas
        variant="static"
        grid={bigGrid}
        size={bigSize}
        palette={PALETTE}
        showGridLines
        colors={{ ...COLORS }}
      />,
    );

    expect(recording.calls.filter((c) => c.op === 'fillRect').length).toBeGreaterThan(1);
  });

  it('does not retain the renderer: an unrelated prop change triggers no further renderStatic call', () => {
    const renderStaticSpy = vi.spyOn(GridRenderer.prototype, 'renderStatic');

    const { container, rerender } = render(
      <PetriDishCanvas
        variant="static"
        grid={GRID}
        size={SIZE}
        palette={PALETTE}
        showGridLines
        colors={COLORS}
        className="a"
      />,
    );
    const canvas = container.querySelector('canvas') as HTMLCanvasElement;
    installRecordingContext2d(canvas);

    // A real dependency change (colors identity) forces one genuine paint under the recording
    // context, giving a non-zero baseline to test the next rerender against.
    const colors = { ...COLORS };
    rerender(
      <PetriDishCanvas
        variant="static"
        grid={GRID}
        size={SIZE}
        palette={PALETTE}
        showGridLines
        colors={colors}
        className="a"
      />,
    );
    expect(renderStaticSpy).toHaveBeenCalledTimes(1);

    // className is not a paint-effect dependency; every other prop keeps its exact identity —
    // React must skip the effect entirely, so no second renderStatic call happens.
    rerender(
      <PetriDishCanvas
        variant="static"
        grid={GRID}
        size={SIZE}
        palette={PALETTE}
        showGridLines
        colors={colors}
        className="b"
      />,
    );

    expect(renderStaticSpy).toHaveBeenCalledTimes(1);
  });

  // The test above only proves React skips an effect whose dependencies did not change — which a
  // renderer held in a ref would satisfy just as well. Forced decision 2 is the stronger claim:
  // each paint CONSTRUCTS a renderer and drops it, so a repaint can never go through the retained
  // instance's resize()/setGridLines() path (the one Story 2.3 gives dirty-state semantics).
  it('constructs a fresh renderer per paint and never repaints through a retained instance', () => {
    const renderStaticSpy = vi.spyOn(GridRenderer.prototype, 'renderStatic');
    const resizeSpy = vi.spyOn(GridRenderer.prototype, 'resize');
    const setGridLinesSpy = vi.spyOn(GridRenderer.prototype, 'setGridLines');

    const { container, rerender } = render(
      <PetriDishCanvas
        variant="static"
        grid={GRID}
        size={SIZE}
        palette={PALETTE}
        showGridLines
        colors={COLORS}
      />,
    );
    installRecordingContext2d(container.querySelector('canvas') as HTMLCanvasElement);

    // Two genuine repaints: a colours change, then a grid-lines flip. A retained renderer would
    // service the second through setGridLines() on the SAME instance.
    rerender(
      <PetriDishCanvas
        variant="static"
        grid={GRID}
        size={SIZE}
        palette={PALETTE}
        showGridLines
        colors={{ ...COLORS }}
      />,
    );
    rerender(
      <PetriDishCanvas
        variant="static"
        grid={GRID}
        size={SIZE}
        palette={PALETTE}
        showGridLines={false}
        colors={{ ...COLORS }}
      />,
    );

    expect(renderStaticSpy).toHaveBeenCalledTimes(2);
    // `this` for each renderStatic call — two distinct objects means two constructions, not one
    // instance reused.
    const [first, second] = renderStaticSpy.mock.instances;
    expect(first).not.toBe(second);
    expect(resizeSpy).not.toHaveBeenCalled();
    expect(setGridLinesSpy).not.toHaveBeenCalled();
  });

  // ResizeObserver is absent in jsdom (30.x, unpolyfilled) — every other test in this file proves
  // the initial paint does not depend on it. These two stub the global to prove the debounce and
  // cleanup contract instead.
  describe('resize repaint (ResizeObserver feature-detected)', () => {
    class FakeResizeObserver implements ResizeObserver {
      static instances: FakeResizeObserver[] = [];
      readonly observe = vi.fn();
      readonly unobserve = vi.fn();
      readonly disconnect = vi.fn();
      constructor(private readonly callback: ResizeObserverCallback) {
        FakeResizeObserver.instances.push(this);
      }
      // Carries a real contentRect: the component skips a notification whose box matches the one
      // the backing store was last rasterised for, so an entry-less trigger would be a no-op and
      // every assertion below would pass vacuously.
      trigger(width: number, height: number): void {
        this.callback([{ contentRect: { width, height } } as ResizeObserverEntry], this);
      }
    }

    afterEach(() => {
      FakeResizeObserver.instances = [];
      vi.unstubAllGlobals();
      vi.useRealTimers();
    });

    it('debounces a burst of resize notifications into exactly one repaint after ~150ms', () => {
      vi.stubGlobal('ResizeObserver', FakeResizeObserver);
      vi.useFakeTimers();
      const getContextSpy = vi.spyOn(HTMLCanvasElement.prototype, 'getContext');

      render(
        <PetriDishCanvas
          variant="static"
          grid={GRID}
          size={SIZE}
          palette={PALETTE}
          showGridLines
          colors={COLORS}
        />,
      );
      const callsAfterInitialPaint = getContextSpy.mock.calls.length;
      expect(callsAfterInitialPaint).toBeGreaterThan(0);

      const observer = FakeResizeObserver.instances.at(-1);
      expect(observer).toBeDefined();
      // Two DIFFERENT boxes in rapid succession: both clear the unchanged-box check, so the
      // debounce is the only thing that can collapse them into one repaint.
      observer?.trigger(400, 240);
      observer?.trigger(420, 252);

      vi.advanceTimersByTime(149);
      expect(getContextSpy.mock.calls.length).toBe(callsAfterInitialPaint); // not yet

      vi.advanceTimersByTime(1); // total 150ms
      expect(getContextSpy.mock.calls.length).toBe(callsAfterInitialPaint + 1); // exactly one
    });

    // The Task 2 subtask "no-op when the observed box is unchanged". This is not a hypothetical:
    // ResizeObserver fires an initial callback the moment observe() is called, reporting the box
    // the canvas already has — so without the guard EVERY tile schedules a redundant renderer
    // reconstruction (and a fresh full-size overlay allocation) 150ms after its first paint.
    it('does not repaint when the observed box is unchanged', () => {
      vi.stubGlobal('ResizeObserver', FakeResizeObserver);
      vi.useFakeTimers();
      const getContextSpy = vi.spyOn(HTMLCanvasElement.prototype, 'getContext');

      const { container } = render(
        <PetriDishCanvas
          variant="static"
          grid={GRID}
          size={SIZE}
          palette={PALETTE}
          showGridLines
          colors={COLORS}
        />,
      );
      const canvas = container.querySelector('canvas') as HTMLCanvasElement;
      const callsAfterInitialPaint = getContextSpy.mock.calls.length;

      const observer = FakeResizeObserver.instances.at(-1);
      // jsdom performs no layout, so clientWidth/clientHeight are 0 — reporting that same box is
      // exactly what a real observer's initial callback does.
      observer?.trigger(canvas.clientWidth, canvas.clientHeight);
      observer?.trigger(canvas.clientWidth, canvas.clientHeight);

      vi.advanceTimersByTime(500);
      expect(getContextSpy.mock.calls.length).toBe(callsAfterInitialPaint);
    });

    it('clears the pending timer and disconnects the observer on unmount', () => {
      vi.stubGlobal('ResizeObserver', FakeResizeObserver);
      vi.useFakeTimers();
      const getContextSpy = vi.spyOn(HTMLCanvasElement.prototype, 'getContext');

      const { unmount } = render(
        <PetriDishCanvas
          variant="static"
          grid={GRID}
          size={SIZE}
          palette={PALETTE}
          showGridLines
          colors={COLORS}
        />,
      );
      const callsAfterInitialPaint = getContextSpy.mock.calls.length;
      const observer = FakeResizeObserver.instances.at(-1);
      observer?.trigger(400, 240);

      unmount();
      expect(observer?.disconnect).toHaveBeenCalledTimes(1);

      // The pending debounce timer must be cleared, not just orphaned — otherwise it fires after
      // unmount and repaints a canvas no longer in the document.
      vi.advanceTimersByTime(200);
      expect(getContextSpy.mock.calls.length).toBe(callsAfterInitialPaint);
    });
  });
});

// The retained-renderer lifecycle (Story 2.4, AC6). Every real construction below is forced by a
// COLORS identity rerender AFTER installRecordingContext2d is attached — the real (unmocked)
// jsdom context on the FIRST render is always null (see the static describe's own note), so the
// mount alone never exercises a genuine paint. This mirrors the static file's own
// "calls GridRenderer.prototype.renderStatic and never drawFull" test.
describe('PetriDishCanvas (edit variant)', () => {
  it('mounts a canvas with an accessible name (AC7) and calls drawFull, never renderStatic (AC1)', () => {
    const drawFullSpy = vi.spyOn(GridRenderer.prototype, 'drawFull');
    const renderStaticSpy = vi.spyOn(GridRenderer.prototype, 'renderStatic');

    const { container, rerender } = render(
      <PetriDishCanvas
        variant="edit"
        tool={TOOL}
        toolRef={1}
        onStrokeCommit={noopCommit}
        grid={GRID}
        size={SIZE}
        palette={PALETTE}
        showGridLines
        colors={COLORS}
      />,
    );
    const canvas = container.querySelector('canvas');
    expect(canvas).not.toBeNull();
    // role="img" is a naming role, so aria-label is permitted here — the inverse of the static
    // tile's aria-hidden (Story 2.4 Dev Notes trap 9).
    expect(canvas).toHaveAttribute('role', 'img');
    expect(canvas).toHaveAccessibleName('Petri dish, 2 by 2 cells');
    expect(canvas).not.toHaveAttribute('aria-hidden');

    installRecordingContext2d(canvas as HTMLCanvasElement);
    rerender(
      <PetriDishCanvas
        variant="edit"
        tool={TOOL}
        toolRef={1}
        onStrokeCommit={noopCommit}
        grid={GRID}
        size={SIZE}
        palette={PALETTE}
        showGridLines
        colors={{ ...COLORS }}
      />,
    );

    expect(drawFullSpy).toHaveBeenCalledTimes(1);
    expect(renderStaticSpy).not.toHaveBeenCalled();
  });

  // Review regression (2026-08-26): the mount must produce EXACTLY ONE full paint. Every other
  // test in this block forces its genuine construction with a colors-identity rerender, because
  // real jsdom's first `getContext('2d')` returns null — which also hides the MOUNT's paint count
  // entirely. Installing a recording double per canvas BEFORE the first render (the shape
  // BattlePage.test.tsx uses) is the only way to observe the real-browser mount, and it is what
  // caught the construction effect signalling a repaint instead of performing one: the grid
  // effect then ran for both the pre-signal value and the bump, repainting the same grid twice
  // through the same renderer.
  it('full-paints exactly once on a mount whose 2D context is available from the start', () => {
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
    const drawFullSpy = vi.spyOn(GridRenderer.prototype, 'drawFull');

    render(
      <PetriDishCanvas
        variant="edit"
        tool={TOOL}
        toolRef={1}
        onStrokeCommit={noopCommit}
        grid={GRID}
        size={SIZE}
        palette={PALETTE}
        showGridLines
        colors={COLORS}
      />,
    );

    expect(drawFullSpy).toHaveBeenCalledTimes(1);
  });

  it("does not throw when getContext('2d') returns null (real jsdom behaviour)", () => {
    expect(() =>
      render(
        <PetriDishCanvas
          variant="edit"
          tool={TOOL}
          toolRef={1}
          onStrokeCommit={noopCommit}
          grid={GRID}
          size={SIZE}
          palette={PALETTE}
          showGridLines
          colors={COLORS}
        />,
      ),
    ).not.toThrow();
  });

  it('retains the renderer: an unrelated prop change (className) triggers no further construction', () => {
    const drawFullSpy = vi.spyOn(GridRenderer.prototype, 'drawFull');
    const renderStaticSpy = vi.spyOn(GridRenderer.prototype, 'renderStatic');

    const { container, rerender } = render(
      <PetriDishCanvas
        variant="edit"
        tool={TOOL}
        toolRef={1}
        onStrokeCommit={noopCommit}
        grid={GRID}
        size={SIZE}
        palette={PALETTE}
        showGridLines
        colors={COLORS}
        className="a"
      />,
    );
    const canvas = container.querySelector('canvas') as HTMLCanvasElement;
    installRecordingContext2d(canvas);

    // A real dependency change (colors identity) forces one genuine construction under the
    // recording context, giving a non-zero baseline to test the next rerender against.
    const colors = { ...COLORS };
    rerender(
      <PetriDishCanvas
        variant="edit"
        tool={TOOL}
        toolRef={1}
        onStrokeCommit={noopCommit}
        grid={GRID}
        size={SIZE}
        palette={PALETTE}
        showGridLines
        colors={colors}
        className="a"
      />,
    );
    expect(drawFullSpy).toHaveBeenCalledTimes(1);

    const getContextCallsBefore = vi.mocked(HTMLCanvasElement.prototype.getContext).mock.calls
      .length;

    // className is not a construction-effect dependency; every other prop keeps its exact
    // identity — React must skip every effect entirely, so the retained renderer sees NO new
    // construction and NO redundant repaint.
    rerender(
      <PetriDishCanvas
        variant="edit"
        tool={TOOL}
        toolRef={1}
        onStrokeCommit={noopCommit}
        grid={GRID}
        size={SIZE}
        palette={PALETTE}
        showGridLines
        colors={colors}
        className="b"
      />,
    );

    expect(vi.mocked(HTMLCanvasElement.prototype.getContext).mock.calls.length).toBe(
      getContextCallsBefore,
    );
    expect(drawFullSpy).toHaveBeenCalledTimes(1);
    expect(renderStaticSpy).not.toHaveBeenCalled();
  });

  // ResizeObserver is absent in jsdom — stub it to prove AC3's immediate (never debounced)
  // re-fit, and the cleanup contract.
  describe('immediate re-fit (ResizeObserver feature-detected, AC3)', () => {
    class FakeResizeObserver implements ResizeObserver {
      static instances: FakeResizeObserver[] = [];
      readonly observe = vi.fn();
      readonly unobserve = vi.fn();
      readonly disconnect = vi.fn();
      constructor(private readonly callback: ResizeObserverCallback) {
        FakeResizeObserver.instances.push(this);
      }
      trigger(width: number, height: number): void {
        this.callback([{ contentRect: { width, height } } as ResizeObserverEntry], this);
      }
    }

    afterEach(() => {
      FakeResizeObserver.instances = [];
      vi.unstubAllGlobals();
      vi.useRealTimers();
    });

    // Forces a genuine construction (colors identity change) under a recording context, then
    // returns the ALREADY-registered observer instance — the resize effect's own ResizeObserver is
    // set up once on mount and is not tied to the construction effect, so it stays the same
    // instance across the rerender below.
    function mountAndRetain(rerender: (ui: ReactElement) => void, canvas: HTMLCanvasElement) {
      installRecordingContext2d(canvas);
      rerender(
        <PetriDishCanvas
          variant="edit"
          tool={TOOL}
          toolRef={1}
          onStrokeCommit={noopCommit}
          grid={GRID}
          size={SIZE}
          palette={PALETTE}
          showGridLines
          colors={{ ...COLORS }}
        />,
      );
    }

    it('calls resize() SYNCHRONOUSLY on a changed box — no timer advance needed (AC3)', () => {
      vi.stubGlobal('ResizeObserver', FakeResizeObserver);
      vi.useFakeTimers();
      const resizeSpy = vi.spyOn(GridRenderer.prototype, 'resize');

      const { container, rerender } = render(
        <PetriDishCanvas
          variant="edit"
          tool={TOOL}
          toolRef={1}
          onStrokeCommit={noopCommit}
          grid={GRID}
          size={SIZE}
          palette={PALETTE}
          showGridLines
          colors={COLORS}
        />,
      );
      const canvas = container.querySelector('canvas') as HTMLCanvasElement;
      mountAndRetain(rerender, canvas);

      const observer = FakeResizeObserver.instances.at(-1);
      expect(observer).toBeDefined();
      // A box that differs from the target's (jsdom-zero) clientWidth/clientHeight.
      observer?.trigger(400, 240);

      // No vi.advanceTimersByTime anywhere in this test — resize() must already have been called
      // by the time this assertion runs, which is the entire content of AC3's "immediately"
      // (and the static path's 150ms debounce, deliberately NOT reproduced here).
      expect(resizeSpy).toHaveBeenCalledTimes(1);
      expect(resizeSpy).toHaveBeenCalledWith(SIZE);
    });

    it('does not repaint when the observed box is unchanged', () => {
      vi.stubGlobal('ResizeObserver', FakeResizeObserver);
      const resizeSpy = vi.spyOn(GridRenderer.prototype, 'resize');

      const { container, rerender } = render(
        <PetriDishCanvas
          variant="edit"
          tool={TOOL}
          toolRef={1}
          onStrokeCommit={noopCommit}
          grid={GRID}
          size={SIZE}
          palette={PALETTE}
          showGridLines
          colors={COLORS}
        />,
      );
      const canvas = container.querySelector('canvas') as HTMLCanvasElement;
      mountAndRetain(rerender, canvas);

      const observer = FakeResizeObserver.instances.at(-1);
      const target = canvas.parentElement as HTMLElement;
      // jsdom performs no layout, so clientWidth/clientHeight are 0 — reporting that same box is
      // exactly what a real observer's initial observe() callback does.
      observer?.trigger(target.clientWidth, target.clientHeight);
      observer?.trigger(target.clientWidth, target.clientHeight);

      expect(resizeSpy).not.toHaveBeenCalled();
    });

    it('disconnects the observer on unmount', () => {
      vi.stubGlobal('ResizeObserver', FakeResizeObserver);

      const { unmount } = render(
        <PetriDishCanvas
          variant="edit"
          tool={TOOL}
          toolRef={1}
          onStrokeCommit={noopCommit}
          grid={GRID}
          size={SIZE}
          palette={PALETTE}
          showGridLines
          colors={COLORS}
        />,
      );
      const observer = FakeResizeObserver.instances.at(-1);

      unmount();

      expect(observer?.disconnect).toHaveBeenCalledTimes(1);
    });

    // Task 4: the observed TARGET is the canvas's PARENT, not the canvas itself — paint() writes
    // canvas.width/height (the intrinsic dimensions `resize()`/`drawFull` set), and observing that
    // same element would be the resize-feedback loop deferred-work.md:113 names.
    it('observes the parent element, not the canvas', () => {
      vi.stubGlobal('ResizeObserver', FakeResizeObserver);

      const { container } = render(
        <PetriDishCanvas
          variant="edit"
          tool={TOOL}
          toolRef={1}
          onStrokeCommit={noopCommit}
          grid={GRID}
          size={SIZE}
          palette={PALETTE}
          showGridLines
          colors={COLORS}
        />,
      );
      const canvas = container.querySelector('canvas') as HTMLCanvasElement;
      const observer = FakeResizeObserver.instances.at(-1);

      expect(observer?.observe).toHaveBeenCalledWith(canvas.parentElement);
      expect(observer?.observe).not.toHaveBeenCalledWith(canvas);
    });
  });
});

// Shared edit-variant pointer-gesture fixtures (Story 2.7 Task 4). Extracted from what were, by
// the end of Story 2.6, byte-identical copies across two describes — click placement and drag
// painting each re-declaring `PLACE_SIZE`, `CELL`, `RECT`, `EMPTY_GRID`, `installContexts`,
// `stubRect`, `mount` and `centreOf` verbatim (deferred-work.md: "the point at which a third copy
// stops being tolerable", named for this story). `mount` is parameterised by `tool`/`toolRef`/
// `grid` rather than forked — the eraser cases below differ from the placement cases only in
// those three inputs, which is what makes ONE helper the right extraction rather than a second
// near-copy.
//
// 20x10 against jsdom's default 300x150 canvas box: cellSize = min(300/20, 150/10) = 15,
// drawWidth/drawHeight fill the box exactly, so originX/originY are 0. 200 cells is enough for
// "one cell, not the grid" to be a meaningful claim about call volume.
const PLACE_SIZE = { cols: 20, rows: 10 };
const CELL = 15;
const RECT = { left: 0, top: 0, width: 300, height: 150 };
const EMPTY_GRID = makeGrid(20, 10, new Array(200).fill(0));

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

// jsdom performs no layout, so getBoundingClientRect() is all zeros — which pointerToCell
// correctly maps to "no cell". Stubbing it is what gives the component real geometry; the
// end-to-end geometry claim belongs to e2e/battleRoute.spec.ts, where layout is real.
function stubRect(canvas: HTMLCanvasElement): void {
  vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({
    ...RECT,
    right: RECT.left + RECT.width,
    bottom: RECT.top + RECT.height,
    x: RECT.left,
    y: RECT.top,
    toJSON: () => ({}),
  } as DOMRect);
}

function mount(
  overrides: {
    grid?: RenderableGrid;
    tool?: Tool;
    toolRef?: number | null;
    onStrokeCommit?: (next: RenderableGrid) => void;
    size?: { cols: number; rows: number };
  } = {},
) {
  const contexts = installContexts();
  const grid = overrides.grid ?? EMPTY_GRID;
  const size = overrides.size ?? PLACE_SIZE;
  const tool = overrides.tool ?? TOOL;
  const onStrokeCommit = overrides.onStrokeCommit ?? vi.fn();
  const view = render(
    <PetriDishCanvas
      variant="edit"
      grid={grid}
      size={size}
      palette={PALETTE}
      showGridLines
      colors={COLORS}
      tool={tool}
      toolRef={overrides.toolRef === undefined ? 1 : overrides.toolRef}
      onStrokeCommit={onStrokeCommit}
    />,
  );
  const canvas = view.container.querySelector('canvas') as HTMLCanvasElement;
  stubRect(canvas);
  return { ...view, canvas, contexts, grid, size, onStrokeCommit };
}

/** The client coordinate of the centre of cell (col, row) under the stubbed geometry. */
function centreOf(col: number, row: number) {
  return {
    clientX: RECT.left + col * CELL + CELL / 2,
    clientY: RECT.top + row * CELL + CELL / 2,
    button: 0,
    isPrimary: true,
  };
}

/** Same coordinate, shaped for a `pointermove` mid-drag: `buttons` is the bitmask (trap 5) —
 *  jsdom's synthetic PointerEvent defaults it to 0, which would self-terminate every move if
 *  this helper did not set it. */
function moveTo(col: number, row: number) {
  return { ...centreOf(col, row), buttons: 1 };
}

function flatIndex(col: number, row: number): number {
  return row * PLACE_SIZE.cols + col;
}

// Click placement (Story 2.5, AC1/AC2/AC4/AC7). Every test here installs a per-canvas recording
// double BEFORE the first render — real jsdom's first `getContext('2d')` returns null, and a
// renderer that never got built cannot be observed painting OR not painting.
describe('PetriDishCanvas (edit variant) — click placement', () => {
  it('commits exactly once per click, with a NEW grid differing at exactly one cell (AC1, AC4)', () => {
    const onStrokeCommit = vi.fn();
    const { canvas, grid } = mount({ onStrokeCommit });
    const before = Uint8Array.from(grid.occupant);

    // Story 2.6: the commit lands on pointer-UP, not pointer-down (trap 2). A click is the
    // degenerate stroke — press then release with no movement in between.
    fireEvent.pointerDown(canvas, centreOf(3, 4));
    expect(onStrokeCommit).not.toHaveBeenCalled(); // AC2's <100ms paint fires on down alone…
    fireEvent.pointerUp(canvas, centreOf(3, 4));

    expect(onStrokeCommit).toHaveBeenCalledTimes(1); // …but the commit waits for up (AC3).
    const next = onStrokeCommit.mock.calls[0][0] as RenderableGrid;

    // A NEW value, not the same object mutated — Story 2.8's snapshot ring needs the previous
    // grid to still be the previous grid.
    expect(next).not.toBe(grid);
    expect(next.occupant).not.toBe(grid.occupant);
    expect(next.width).toBe(grid.width);
    expect(next.height).toBe(grid.height);

    const changed = [...next.occupant].flatMap((value, index) =>
      value === before[index] ? [] : [index],
    );
    expect(changed).toEqual([4 * PLACE_SIZE.cols + 3]);
    expect(next.occupant[4 * PLACE_SIZE.cols + 3]).toBe(1);

    // ⚠️ `readonly Uint8Array` is readonly on the PROPERTY, not the contents — TypeScript will
    // not stop a `grid.occupant[i] = …`, so the copy discipline needs an actual assertion.
    expect(grid.occupant).toEqual(before);
  });

  // AC1's "overwriting any previous occupant" (FR-3.4): a cell already held by ANOTHER organism
  // is replaced, not skipped.
  it('overwrites a cell already occupied by a different organism (AC1)', () => {
    const occupied = makeGrid(
      20,
      10,
      new Array(200).fill(0).map((_, i) => (i === 25 ? 1 : 0)),
    );
    const palette3 = makeLut([0, 0, 0], [0, 0, 0]);
    const onStrokeCommit = vi.fn();
    installContexts();
    const { container } = render(
      <PetriDishCanvas
        variant="edit"
        grid={occupied}
        size={PLACE_SIZE}
        palette={palette3}
        showGridLines
        colors={COLORS}
        tool={TOOL}
        toolRef={2}
        onStrokeCommit={onStrokeCommit}
      />,
    );
    const canvas = container.querySelector('canvas') as HTMLCanvasElement;
    stubRect(canvas);

    fireEvent.pointerDown(canvas, centreOf(5, 1)); // index 1 * 20 + 5 = 25
    fireEvent.pointerUp(canvas, centreOf(5, 1)); // Story 2.6: commit lands on pointer-up.

    expect(onStrokeCommit).toHaveBeenCalledTimes(1);
    expect((onStrokeCommit.mock.calls[0][0] as RenderableGrid).occupant[25]).toBe(2);
  });

  // AC7: a redundant click is a TRUE no-op. Without this, every re-click creates a Story 2.8 undo
  // entry and flips Story 2.11's isDirty for a grid that did not change.
  it('does nothing at all when the cell already holds the selected organism (AC7)', () => {
    const already = makeGrid(
      20,
      10,
      new Array(200).fill(0).map((_, i) => (i === 25 ? 1 : 0)),
    );
    const drawSpy = vi.spyOn(GridRenderer.prototype, 'draw');
    const markDirtySpy = vi.spyOn(GridRenderer.prototype, 'markDirty');
    const onStrokeCommit = vi.fn();
    const { canvas } = mount({ grid: already, onStrokeCommit });

    fireEvent.pointerDown(canvas, centreOf(5, 1));
    // AC6: a no-op stroke commits nothing — pin the full gesture, not just the down phase.
    fireEvent.pointerUp(canvas, centreOf(5, 1));

    expect(onStrokeCommit).not.toHaveBeenCalled();
    expect(markDirtySpy).not.toHaveBeenCalled();
    expect(drawSpy).not.toHaveBeenCalled();
  });

  it('places nothing for a pointer in the centring margin (AC3)', () => {
    // 20x4 in the same 300x150 box: cellSize = min(15, 37) = 15, drawHeight = 60, so
    // originY = floor((150 - 60) / 2) = 45 — a real, clickable 45px letterbox.
    const shortGrid = makeGrid(20, 4, new Array(80).fill(0));
    const onStrokeCommit = vi.fn();
    const { canvas } = mount({
      grid: shortGrid,
      size: { cols: 20, rows: 4 },
      onStrokeCommit,
    });

    fireEvent.pointerDown(canvas, { clientX: 100, clientY: 10, button: 0, isPrimary: true });

    expect(onStrokeCommit).not.toHaveBeenCalled();
  });

  it('places nothing for a pointer outside the canvas box (AC3)', () => {
    const onStrokeCommit = vi.fn();
    const { canvas } = mount({ onStrokeCommit });

    fireEvent.pointerDown(canvas, {
      clientX: RECT.left + RECT.width + 20,
      clientY: 50,
      button: 0,
      isPrimary: true,
    });

    expect(onStrokeCommit).not.toHaveBeenCalled();
  });

  it('places nothing for a non-primary button or a secondary pointer', () => {
    const onStrokeCommit = vi.fn();
    const { canvas } = mount({ onStrokeCommit });

    fireEvent.pointerDown(canvas, { ...centreOf(3, 4), button: 2 }); // right-click
    fireEvent.pointerDown(canvas, { ...centreOf(3, 4), button: 1 }); // middle-click
    fireEvent.pointerDown(canvas, { ...centreOf(3, 4), isPrimary: false }); // 2nd touch point

    expect(onStrokeCommit).not.toHaveBeenCalled();
  });

  // Trap 3's sibling at the canvas boundary: an unresolvable tool must place NOTHING, and must
  // never fall back to ref 0 — that means EMPTY, and is Story 2.7's eraser.
  it('places nothing when the tool resolves to no ref', () => {
    const onStrokeCommit = vi.fn();
    const { canvas } = mount({ toolRef: null, onStrokeCommit });

    fireEvent.pointerDown(canvas, centreOf(3, 4));

    expect(onStrokeCommit).not.toHaveBeenCalled();
  });

  // review (2026-08-26): `cell.col`/`cell.row` are only vouched for against the `size` prop;
  // the flat index write is against `grid.width`/`grid.height`. `GridRenderer.assertGridMatchesSize`
  // already catches this loudly for the constructed-renderer path (drawFull throws
  // GridRendererDimensionMismatchError on mount, before any click is possible), so the gap is
  // narrower than it first looks — but trap 12's no-context path builds no renderer and calls no
  // drawFull, so nothing upstream of this guard would have caught a mismatch reaching the handler
  // that way. Rendered WITHOUT installContexts() — real jsdom's getContext() returns null, exactly
  // trap 12's path — so this exercises the one branch the renderer's own guard cannot reach.
  it('places nothing when the grid dimensions disagree with size (trap 12 path, no renderer)', () => {
    const mismatched = makeGrid(10, 10, new Array(100).fill(0));
    const onStrokeCommit = vi.fn();
    const { container } = render(
      <PetriDishCanvas
        variant="edit"
        grid={mismatched}
        size={PLACE_SIZE}
        palette={PALETTE}
        showGridLines
        colors={COLORS}
        tool={TOOL}
        toolRef={1}
        onStrokeCommit={onStrokeCommit}
      />,
    );
    const canvas = container.querySelector('canvas') as HTMLCanvasElement;
    stubRect(canvas);

    expect(() => fireEvent.pointerDown(canvas, centreOf(3, 4))).not.toThrow();
    expect(onStrokeCommit).not.toHaveBeenCalled();
  });

  // ⚠️ AC2, and the single most likely defect in this story. The click must repaint through
  // markDirty + draw, and the committed grid coming back down as a new `grid` prop must NOT
  // trigger the grid effect's drawFull. Both halves fail silently: the dish looks perfect either
  // way, and only the call volume tells them apart.
  it('repaints one cell through markDirty + draw, and never drawFull — including on the commit round trip (AC2)', () => {
    const drawFullSpy = vi.spyOn(GridRenderer.prototype, 'drawFull');
    const drawSpy = vi.spyOn(GridRenderer.prototype, 'draw');
    const markDirtySpy = vi.spyOn(GridRenderer.prototype, 'markDirty');
    const onStrokeCommit = vi.fn();
    const { canvas, contexts, rerender } = mount({ onStrokeCommit });

    const recording = contexts.get(canvas);
    expect(recording).toBeDefined();
    expect(drawFullSpy).toHaveBeenCalledTimes(1); // the mount's one full paint
    const callsAfterMount = (recording as RecordingContext2D).calls.length;

    fireEvent.pointerDown(canvas, centreOf(3, 4));

    expect(markDirtySpy).toHaveBeenCalledTimes(1);
    expect(markDirtySpy).toHaveBeenCalledWith([{ col: 3, row: 4 }]);
    expect(drawSpy).toHaveBeenCalledTimes(1);
    expect(drawFullSpy).toHaveBeenCalledTimes(1); // still just the mount's

    // The click's own drawing ops, bounded — NOT proportional to cols * rows. A full repaint of
    // this grid fills the background plus up to 200 cells plus the grid-line overlay; a
    // single-cell dirty repaint touches a handful of ops. The bound is deliberately generous:
    // the claim is "one cell, not the grid", not an exact op count.
    const clickOps = (recording as RecordingContext2D).calls.length - callsAfterMount;
    expect(clickOps).toBeGreaterThan(0);
    expect(clickOps).toBeLessThan(PLACE_SIZE.cols * PLACE_SIZE.rows);

    // Story 2.6: the commit itself waits for pointer-up (trap 2) — the paint above already
    // happened on down, but `onStrokeCommit` has not fired yet.
    expect(onStrokeCommit).not.toHaveBeenCalled();
    fireEvent.pointerUp(canvas, centreOf(3, 4));

    // THE round trip. <BattlePage> puts the committed grid in state and hands it straight back
    // down; without `paintedGridRef` being set at commit time the grid effect full-repaints all
    // 200 cells and re-primes the whole colour-state baseline, on every single click.
    const committed = onStrokeCommit.mock.calls[0][0] as RenderableGrid;
    rerender(
      <PetriDishCanvas
        variant="edit"
        grid={committed}
        size={PLACE_SIZE}
        palette={PALETTE}
        showGridLines
        colors={COLORS}
        tool={TOOL}
        toolRef={1}
        onStrokeCommit={onStrokeCommit}
      />,
    );

    expect(drawFullSpy).toHaveBeenCalledTimes(1);
    expect(drawSpy).toHaveBeenCalledTimes(1);
  });

  // Trap 12: `getContext('2d')` returns null under real jsdom, so the renderer is absent. The
  // model is not the view — a canvas that cannot paint must not swallow the user's edit.
  it('still commits when the 2D context is unavailable (no renderer to paint with)', () => {
    const onStrokeCommit = vi.fn();
    const { container } = render(
      <PetriDishCanvas
        variant="edit"
        grid={EMPTY_GRID}
        size={PLACE_SIZE}
        palette={PALETTE}
        showGridLines
        colors={COLORS}
        tool={TOOL}
        toolRef={1}
        onStrokeCommit={onStrokeCommit}
      />,
    );
    const canvas = container.querySelector('canvas') as HTMLCanvasElement;
    stubRect(canvas);

    expect(() => fireEvent.pointerDown(canvas, centreOf(3, 4))).not.toThrow();
    expect(onStrokeCommit).not.toHaveBeenCalled(); // Story 2.6: commit waits for pointer-up.
    expect(() => fireEvent.pointerUp(canvas, centreOf(3, 4))).not.toThrow();
    expect(onStrokeCommit).toHaveBeenCalledTimes(1);
  });

  // The static tile must stay inert: it has no tool, no commit seam, and aria-hidden — a pointer
  // handler leaking onto the shared element would make ~50 Gallery thumbnails paintable.
  it('does not attach placement to the static variant', () => {
    installContexts();
    const drawSpy = vi.spyOn(GridRenderer.prototype, 'draw');
    const { container } = render(
      <PetriDishCanvas
        variant="static"
        grid={EMPTY_GRID}
        size={PLACE_SIZE}
        palette={PALETTE}
        showGridLines
        colors={COLORS}
      />,
    );
    const canvas = container.querySelector('canvas') as HTMLCanvasElement;
    stubRect(canvas);

    fireEvent.pointerDown(canvas, centreOf(3, 4));

    expect(drawSpy).not.toHaveBeenCalled();
  });
});

// Drag painting (Story 2.6, AC1-AC8). Fixtures are the module-scope set above, shared with the
// click-placement and eraser (Story 2.7) describes (Task 4 extraction).
describe('PetriDishCanvas (edit variant) — drag painting (Story 2.6)', () => {
  it(
    'down -> 3 moves -> up commits exactly once, and the committed grid differs from the prop ' +
      'grid at every traversed cell and nowhere else (AC1, AC3)',
    () => {
      const onStrokeCommit = vi.fn();
      const { canvas, grid } = mount({ onStrokeCommit });
      const before = Uint8Array.from(grid.occupant);

      fireEvent.pointerDown(canvas, centreOf(2, 2));
      fireEvent.pointerMove(canvas, moveTo(3, 2));
      fireEvent.pointerMove(canvas, moveTo(4, 2));
      fireEvent.pointerMove(canvas, moveTo(5, 2));
      expect(onStrokeCommit).not.toHaveBeenCalled(); // still one gesture, no commit yet.
      fireEvent.pointerUp(canvas, moveTo(5, 2));

      expect(onStrokeCommit).toHaveBeenCalledTimes(1);
      const next = onStrokeCommit.mock.calls[0][0] as RenderableGrid;
      expect(next).not.toBe(grid);
      expect(next.occupant).not.toBe(grid.occupant);

      const changed = [...next.occupant].flatMap((value, index) =>
        value === before[index] ? [] : [index],
      );
      const expected = [2, 3, 4, 5].map((col) => flatIndex(col, 2));
      expect(changed.sort((a, b) => a - b)).toEqual(expected);
      for (const index of expected) expect(next.occupant[index]).toBe(1);

      // AC3: the PROP grid is never mutated — Story 2.8's ring needs the previous value intact.
      expect(grid.occupant).toEqual(before);
    },
  );

  it('no React re-render occurs between down and up (AC2)', () => {
    const onStrokeCommit = vi.fn();
    const renderSpy = vi.fn();
    installContexts();
    const view = render(
      <Profiler id="dish" onRender={renderSpy}>
        <PetriDishCanvas
          variant="edit"
          grid={EMPTY_GRID}
          size={PLACE_SIZE}
          palette={PALETTE}
          showGridLines
          colors={COLORS}
          tool={TOOL}
          toolRef={1}
          onStrokeCommit={onStrokeCommit}
        />
      </Profiler>,
    );
    const canvas = view.container.querySelector('canvas') as HTMLCanvasElement;
    stubRect(canvas);
    renderSpy.mockClear(); // drop the mount's own commit(s); only the GESTURE matters here.

    fireEvent.pointerDown(canvas, centreOf(2, 2));
    fireEvent.pointerMove(canvas, moveTo(3, 2));
    fireEvent.pointerMove(canvas, moveTo(4, 2));

    // AC2's whole claim: the in-progress stroke is refs only, so NOTHING re-renders this subtree
    // while it is live.
    expect(renderSpy).not.toHaveBeenCalled();

    fireEvent.pointerUp(canvas, moveTo(4, 2));

    // `onStrokeCommit` here is a bare vi.fn() — in the real app the PARENT re-renders on commit
    // and hands a new `grid` prop back down, but nothing about firing the callback itself forces
    // a re-render of THIS subtree.
    expect(renderSpy).not.toHaveBeenCalled();
  });

  it('a move that jumps several cells paints the intervening cells (AC4)', () => {
    const onStrokeCommit = vi.fn();
    const markDirtySpy = vi.spyOn(GridRenderer.prototype, 'markDirty');
    const { canvas } = mount({ onStrokeCommit });

    fireEvent.pointerDown(canvas, centreOf(0, 0));
    // ONE big jump — Playwright's mouse.move with no `steps` sends exactly one pointermove, and
    // this is that same shape at the unit level.
    fireEvent.pointerMove(canvas, moveTo(10, 0));
    fireEvent.pointerUp(canvas, moveTo(10, 0));

    expect(onStrokeCommit).toHaveBeenCalledTimes(1);
    const committed = onStrokeCommit.mock.calls[0][0] as RenderableGrid;
    // Every cell from the anchor to the jump target, not just the endpoints — a dotted line would
    // leave cols 1-9 empty.
    for (let col = 0; col <= 10; col++) {
      expect(committed.occupant[flatIndex(col, 0)]).toBe(1);
    }
    expect(markDirtySpy.mock.calls.at(-1)?.[0]).toEqual(
      Array.from({ length: 10 }, (_, i) => ({ col: i + 1, row: 0 })),
    );
  });

  it(
    'drawFull is never called during the stroke, and the round trip after the commit does not ' +
      'trigger it either (AC2 + the paintedGridRef trap)',
    () => {
      // review (2026-08-27): the describe's own `installContexts()`, not a third inline copy of
      // the same spy — this test renders directly rather than through `mount()` only because it
      // needs the `rerender` handle for the commit round trip.
      installContexts();
      const drawFullSpy = vi.spyOn(GridRenderer.prototype, 'drawFull');
      const onStrokeCommit = vi.fn();

      const { rerender } = render(
        <PetriDishCanvas
          variant="edit"
          grid={EMPTY_GRID}
          size={PLACE_SIZE}
          palette={PALETTE}
          showGridLines
          colors={COLORS}
          tool={TOOL}
          toolRef={1}
          onStrokeCommit={onStrokeCommit}
        />,
      );
      expect(drawFullSpy).toHaveBeenCalledTimes(1); // the mount's one full paint.

      const canvas = document.querySelector('canvas') as HTMLCanvasElement;
      stubRect(canvas);

      fireEvent.pointerDown(canvas, centreOf(2, 2));
      fireEvent.pointerMove(canvas, moveTo(3, 2));
      fireEvent.pointerMove(canvas, moveTo(4, 2));
      expect(drawFullSpy).toHaveBeenCalledTimes(1); // still just the mount's, mid-stroke.
      fireEvent.pointerUp(canvas, moveTo(4, 2));
      expect(drawFullSpy).toHaveBeenCalledTimes(1); // and after the commit fires.

      const committed = onStrokeCommit.mock.calls[0][0] as RenderableGrid;
      rerender(
        <PetriDishCanvas
          variant="edit"
          grid={committed}
          size={PLACE_SIZE}
          palette={PALETTE}
          showGridLines
          colors={COLORS}
          tool={TOOL}
          toolRef={1}
          onStrokeCommit={onStrokeCommit}
        />,
      );

      // THE round trip: the committed grid comes back down as a new prop identity, and
      // `paintedGridRef` must keep the grid effect from full-repainting it.
      expect(drawFullSpy).toHaveBeenCalledTimes(1);
    },
  );

  it('a move to a point outside the box, then back in, paints no intervening cells (AC5)', () => {
    const onStrokeCommit = vi.fn();
    const { canvas } = mount({ onStrokeCommit });

    fireEvent.pointerDown(canvas, centreOf(2, 2));
    // Outside the 300x150 box entirely — pointerToCell maps this to `null`.
    fireEvent.pointerMove(canvas, { clientX: RECT.width + 50, clientY: 50, buttons: 1 });
    fireEvent.pointerMove(canvas, moveTo(15, 8));
    fireEvent.pointerUp(canvas, moveTo(15, 8));

    expect(onStrokeCommit).toHaveBeenCalledTimes(1);
    const committed = onStrokeCommit.mock.calls[0][0] as RenderableGrid;
    const changed = [...committed.occupant].flatMap((value, index) => (value === 0 ? [] : [index]));
    // Only the two cells the pointer was ACTUALLY over inside the dish — no bridged line across
    // the outside path between (2,2) and (15,8).
    expect(changed.sort((a, b) => a - b)).toEqual(
      [flatIndex(2, 2), flatIndex(15, 8)].sort((a, b) => a - b),
    );
  });

  it('pointerUp fired outside the canvas element still commits once (AC5)', () => {
    const onStrokeCommit = vi.fn();
    const { canvas } = mount({ onStrokeCommit });

    fireEvent.pointerDown(canvas, centreOf(2, 2));
    fireEvent.pointerMove(canvas, moveTo(3, 2));
    // Real `setPointerCapture` retargets the native up event to the CANVAS even though the
    // pointer is physically outside its box — this fires it at the canvas (the element capture
    // would retarget to) with coordinates outside the box, which is what that retargeted event
    // looks like. `endStroke` never reads clientX/Y, so position cannot gate the commit.
    fireEvent.pointerUp(canvas, { clientX: RECT.width + 200, clientY: 400, pointerId: 0 });

    expect(onStrokeCommit).toHaveBeenCalledTimes(1);
  });

  it('pointerCancel mid-stroke terminates once, and a subsequent pointerUp commits nothing (idempotence)', () => {
    const onStrokeCommit = vi.fn();
    const { canvas } = mount({ onStrokeCommit });

    fireEvent.pointerDown(canvas, centreOf(2, 2));
    fireEvent.pointerMove(canvas, moveTo(3, 2));
    // Forced decision 2: pointercancel COMMITS the cells already painted.
    fireEvent.pointerCancel(canvas, { pointerId: 0 });

    expect(onStrokeCommit).toHaveBeenCalledTimes(1);

    // `endStroke` is idempotent — a pointer-up for the same (already-ended) gesture must not
    // double-commit. Real browsers fire pointerup AND lostpointercapture for one gesture; this is
    // the cancel/up pairing's version of the same guarantee.
    fireEvent.pointerUp(canvas, moveTo(3, 2));
    expect(onStrokeCommit).toHaveBeenCalledTimes(1);
  });

  it('a lostpointercapture after pointerup does not double-commit (idempotence)', () => {
    const onStrokeCommit = vi.fn();
    const { canvas } = mount({ onStrokeCommit });

    fireEvent.pointerDown(canvas, centreOf(2, 2));
    fireEvent.pointerUp(canvas, centreOf(2, 2));
    expect(onStrokeCommit).toHaveBeenCalledTimes(1);

    fireEvent.lostPointerCapture(canvas, { pointerId: 0 });
    expect(onStrokeCommit).toHaveBeenCalledTimes(1);
  });

  it('a second pointerDown with a different pointerId mid-stroke is ignored (AC7)', () => {
    const onStrokeCommit = vi.fn();
    const drawSpy = vi.spyOn(GridRenderer.prototype, 'draw');
    const { canvas } = mount({ onStrokeCommit });

    fireEvent.pointerDown(canvas, centreOf(2, 2));
    const drawCallsAfterFirstDown = drawSpy.mock.calls.length;

    // A second finger touching down mid-drag — must not hijack the stroke or paint.
    fireEvent.pointerDown(canvas, { ...centreOf(8, 8), pointerId: 2 });
    expect(drawSpy.mock.calls.length).toBe(drawCallsAfterFirstDown);
    fireEvent.pointerMove(canvas, { ...moveTo(9, 8), pointerId: 2 });
    expect(drawSpy.mock.calls.length).toBe(drawCallsAfterFirstDown);

    // review (2026-08-27): the second pointer's UP must not terminate the stroke it never
    // started either — the guard the AC7 test above only covered for `pointerdown`/`pointermove`.
    fireEvent.pointerUp(canvas, { ...centreOf(9, 8), pointerId: 2 });
    expect(onStrokeCommit).not.toHaveBeenCalled();

    // review (2026-08-27): and neither must a SECONDARY button's release. A mouse reports every
    // button on one pointerId, so a right-click during a left-drag arrives here as a `pointerup`
    // with `button === 2` and the left button still held (`buttons === 1`).
    fireEvent.pointerUp(canvas, { ...centreOf(3, 2), button: 2, buttons: 1 });
    expect(onStrokeCommit).not.toHaveBeenCalled();

    // The PRIMARY stroke is unaffected and completes normally.
    fireEvent.pointerMove(canvas, moveTo(3, 2));
    fireEvent.pointerUp(canvas, moveTo(3, 2));

    expect(onStrokeCommit).toHaveBeenCalledTimes(1);
    const committed = onStrokeCommit.mock.calls[0][0] as RenderableGrid;
    expect(committed.occupant[flatIndex(8, 8)]).toBe(0); // the rejected pointer painted nothing.
    expect(committed.occupant[flatIndex(9, 8)]).toBe(0);
  });

  it('a move with no active stroke paints nothing and commits nothing', () => {
    const onStrokeCommit = vi.fn();
    const drawSpy = vi.spyOn(GridRenderer.prototype, 'draw');
    const markDirtySpy = vi.spyOn(GridRenderer.prototype, 'markDirty');
    const { canvas } = mount({ onStrokeCommit });

    fireEvent.pointerMove(canvas, moveTo(5, 5));

    expect(drawSpy).not.toHaveBeenCalled();
    expect(markDirtySpy).not.toHaveBeenCalled();
    expect(onStrokeCommit).not.toHaveBeenCalled();
  });

  it('a drag entirely over cells that already hold the tool’s ref commits nothing (AC6)', () => {
    const occupant = new Array(200).fill(0) as number[];
    for (let col = 2; col <= 5; col++) occupant[flatIndex(col, 2)] = 1;
    const filled = makeGrid(20, 10, occupant);

    const drawSpy = vi.spyOn(GridRenderer.prototype, 'draw');
    const markDirtySpy = vi.spyOn(GridRenderer.prototype, 'markDirty');
    const onStrokeCommit = vi.fn();
    const { canvas } = mount({ grid: filled, onStrokeCommit });

    fireEvent.pointerDown(canvas, centreOf(2, 2));
    fireEvent.pointerMove(canvas, moveTo(5, 2)); // interpolates cols 3-5, already ref 1.
    fireEvent.pointerUp(canvas, moveTo(5, 2));

    expect(onStrokeCommit).not.toHaveBeenCalled();
    expect(markDirtySpy).not.toHaveBeenCalled();
    expect(drawSpy).not.toHaveBeenCalled();
  });

  // Trap 5's self-heal, taken (forced decision 5): a move reporting the primary button already
  // released — capture lost somewhere the canvas never heard about — terminates AND commits, the
  // same as any other termination reason.
  it('a pointerMove with event.buttons === 0 self-terminates and commits what was painted so far (trap 5)', () => {
    const onStrokeCommit = vi.fn();
    const { canvas } = mount({ onStrokeCommit });

    fireEvent.pointerDown(canvas, centreOf(2, 2));
    fireEvent.pointerMove(canvas, { ...centreOf(6, 2), buttons: 0 });

    expect(onStrokeCommit).toHaveBeenCalledTimes(1);
    const committed = onStrokeCommit.mock.calls[0][0] as RenderableGrid;
    expect(committed.occupant[flatIndex(2, 2)]).toBe(1); // the down-painted cell only.
    expect(committed.occupant[flatIndex(6, 2)]).toBe(0); // the move itself never painted.

    // The stroke already ended — a later up for the same pointer must not double-commit.
    fireEvent.pointerUp(canvas, centreOf(6, 2));
    expect(onStrokeCommit).toHaveBeenCalledTimes(1);
  });
});

// Stroke reclaim (Story 2.7 Task 5, deferred-work.md, taken): a pointerdown carrying the OPEN
// stroke's OWN pointerId reclaims it — ending the stale stroke (committing what it already
// painted) — rather than being rejected outright by AC7's guard, which today blocks the SAME
// pointer from ever restarting. Mice self-heal via the `buttons === 0` hover check; touch and pen
// emit no hover moves at all, so without this a stroke whose terminating event never arrives
// leaves the dish permanently unpaintable on those devices, with no error and no visual cue.
describe('PetriDishCanvas (edit variant) — stroke reclaim (Story 2.7 Task 5)', () => {
  it(
    'a pointerdown with the SAME pointerId as the open stroke reclaims it: commits the stale ' +
      'stroke, then opens and completes a fresh one',
    () => {
      const onStrokeCommit = vi.fn();
      const { canvas } = mount({ onStrokeCommit });

      // Opens a stroke and paints one cell — never terminated (its up/cancel/lostpointercapture
      // never arrives; the touch/pen failure mode this clause exists for).
      fireEvent.pointerDown(canvas, centreOf(2, 2));
      expect(onStrokeCommit).not.toHaveBeenCalled();

      // The SAME pointerId (both events default to 0) presses down again. Without the reclaim
      // clause this is silently rejected by `strokeRef.current !== null` and the dish stays
      // unpaintable for the life of the mount.
      fireEvent.pointerDown(canvas, centreOf(6, 6));

      // The stale stroke committed what it had painted, as its OWN gesture — commit accounting
      // stays "exactly once per gesture" across the reclaim, not folded into the next one.
      expect(onStrokeCommit).toHaveBeenCalledTimes(1);
      const stale = onStrokeCommit.mock.calls[0][0] as RenderableGrid;
      expect(stale.occupant[flatIndex(2, 2)]).toBe(1);
      expect(stale.occupant[flatIndex(6, 6)]).toBe(0); // the new stroke's cell, not in this commit.

      // The fresh stroke opened by the reclaiming pointerdown paints and commits normally.
      fireEvent.pointerUp(canvas, centreOf(6, 6));
      expect(onStrokeCommit).toHaveBeenCalledTimes(2);
      const fresh = onStrokeCommit.mock.calls[1][0] as RenderableGrid;
      expect(fresh.occupant[flatIndex(6, 6)]).toBe(1);
    },
  );

  it('a pointerdown with a DIFFERENT pointerId while a stroke is open is still rejected outright (AC7 unchanged)', () => {
    const onStrokeCommit = vi.fn();
    const drawSpy = vi.spyOn(GridRenderer.prototype, 'draw');
    const { canvas } = mount({ onStrokeCommit });

    fireEvent.pointerDown(canvas, centreOf(2, 2));
    const drawCallsAfterFirstDown = drawSpy.mock.calls.length;

    fireEvent.pointerDown(canvas, { ...centreOf(6, 6), pointerId: 2 });

    expect(onStrokeCommit).not.toHaveBeenCalled(); // no reclaim, no commit.
    expect(drawSpy.mock.calls.length).toBe(drawCallsAfterFirstDown); // and nothing painted either.
  });
});

// Erasing (Story 2.7, AC1-AC3, AC6). Same stroke pipeline as click placement and drag painting —
// no second write path, no `tool.kind` branch anywhere in this file — driven with
// `tool={ kind: 'eraser' }` and `toolRef={0}`, the reserved "empty" ref (RFC-006 Decision 2).
// Fixtures are the module-scope set above (Task 4 extraction — this is the third describe that
// made the extraction worth doing).
describe('PetriDishCanvas (edit variant) — eraser (Story 2.7)', () => {
  /** A grid with a single organism cell at (col, row); everything else empty. */
  function gridWithOccupant(col: number, row: number, ref = 1): RenderableGrid {
    const occupant = new Array(200).fill(0) as number[];
    occupant[flatIndex(col, row)] = ref;
    return makeGrid(20, 10, occupant);
  }

  it('a click on an occupied cell commits once, writing 0 there and nowhere else (AC1)', () => {
    const grid = gridWithOccupant(3, 4);
    const before = Uint8Array.from(grid.occupant);
    const onStrokeCommit = vi.fn();
    const { canvas } = mount({ grid, tool: ERASER_TOOL, toolRef: 0, onStrokeCommit });

    fireEvent.pointerDown(canvas, centreOf(3, 4));
    fireEvent.pointerUp(canvas, centreOf(3, 4));

    expect(onStrokeCommit).toHaveBeenCalledTimes(1);
    const next = onStrokeCommit.mock.calls[0][0] as RenderableGrid;
    expect(next.occupant[flatIndex(3, 4)]).toBe(0);
    const changed = [...next.occupant].flatMap((value, index) =>
      value === before[index] ? [] : [index],
    );
    expect(changed).toEqual([flatIndex(3, 4)]);
    // The prop grid is never mutated — the copy-at-start / freeze-at-commit discipline, unchanged
    // from 2.5/2.6.
    expect(grid.occupant).toEqual(before);
  });

  it(
    'a press-move-move-release across occupied cells commits exactly once, empties every ' +
      'traversed cell including the interpolated ones, and leaves the prop grid byte-for-byte ' +
      'unchanged (AC1, AC2)',
    () => {
      const occupant = new Array(200).fill(0) as number[];
      for (let col = 2; col <= 8; col++) occupant[flatIndex(col, 4)] = 1;
      const grid = makeGrid(20, 10, occupant);
      const before = Uint8Array.from(grid.occupant);
      const onStrokeCommit = vi.fn();
      const { canvas } = mount({ grid, tool: ERASER_TOOL, toolRef: 0, onStrokeCommit });

      fireEvent.pointerDown(canvas, centreOf(2, 4));
      // ONE big jump — the intervening cells exist only if the interpolation (cellsBetween)
      // reached the eraser's write, not just the click-sized single-cell path.
      fireEvent.pointerMove(canvas, moveTo(8, 4));
      expect(onStrokeCommit).not.toHaveBeenCalled(); // one gesture, still open.
      fireEvent.pointerUp(canvas, moveTo(8, 4));

      expect(onStrokeCommit).toHaveBeenCalledTimes(1);
      const next = onStrokeCommit.mock.calls[0][0] as RenderableGrid;
      for (let col = 2; col <= 8; col++) expect(next.occupant[flatIndex(col, 4)]).toBe(0);
      const changed = [...next.occupant].flatMap((value, index) =>
        value === before[index] ? [] : [index],
      );
      expect(changed.sort((a, b) => a - b)).toEqual(
        Array.from({ length: 7 }, (_, i) => flatIndex(i + 2, 4)),
      );
      expect(grid.occupant).toEqual(before);
    },
  );

  it('a click on an already-empty cell commits nothing, marks nothing dirty, draws nothing (AC3)', () => {
    const drawSpy = vi.spyOn(GridRenderer.prototype, 'draw');
    const markDirtySpy = vi.spyOn(GridRenderer.prototype, 'markDirty');
    const onStrokeCommit = vi.fn();
    // No `grid` override: defaults to EMPTY_GRID.
    const { canvas } = mount({ tool: ERASER_TOOL, toolRef: 0, onStrokeCommit });

    fireEvent.pointerDown(canvas, centreOf(5, 5));
    fireEvent.pointerUp(canvas, centreOf(5, 5));

    expect(onStrokeCommit).not.toHaveBeenCalled();
    expect(markDirtySpy).not.toHaveBeenCalled();
    expect(drawSpy).not.toHaveBeenCalled();
  });

  it('a drag entirely over already-empty cells commits nothing, marks nothing dirty, draws nothing (AC3)', () => {
    const drawSpy = vi.spyOn(GridRenderer.prototype, 'draw');
    const markDirtySpy = vi.spyOn(GridRenderer.prototype, 'markDirty');
    const onStrokeCommit = vi.fn();
    const { canvas } = mount({ tool: ERASER_TOOL, toolRef: 0, onStrokeCommit });

    fireEvent.pointerDown(canvas, centreOf(2, 2));
    fireEvent.pointerMove(canvas, moveTo(8, 2));
    fireEvent.pointerUp(canvas, moveTo(8, 2));

    expect(onStrokeCommit).not.toHaveBeenCalled();
    expect(markDirtySpy).not.toHaveBeenCalled();
    expect(drawSpy).not.toHaveBeenCalled();
  });

  // The case that catches a `changed` flag driven by cell COUNT rather than by an actual write: a
  // mixed drag commits once and empties exactly the occupied cells, none of the already-empty
  // ones spuriously counted as a change.
  it('a mixed drag (some occupied, some empty) commits once and empties exactly the occupied cells', () => {
    const occupant = new Array(200).fill(0) as number[];
    occupant[flatIndex(2, 4)] = 1; // occupied
    occupant[flatIndex(5, 4)] = 1; // occupied
    // cols 3, 4, 6 stay empty — the interpolated path crosses them without changing anything.
    const grid = makeGrid(20, 10, occupant);
    const before = Uint8Array.from(grid.occupant);
    const onStrokeCommit = vi.fn();
    const { canvas } = mount({ grid, tool: ERASER_TOOL, toolRef: 0, onStrokeCommit });

    fireEvent.pointerDown(canvas, centreOf(2, 4));
    fireEvent.pointerMove(canvas, moveTo(6, 4)); // interpolates cols 3, 4, 5, 6.
    fireEvent.pointerUp(canvas, moveTo(6, 4));

    expect(onStrokeCommit).toHaveBeenCalledTimes(1);
    const next = onStrokeCommit.mock.calls[0][0] as RenderableGrid;
    const changed = [...next.occupant].flatMap((value, index) =>
      value === before[index] ? [] : [index],
    );
    expect(changed.sort((a, b) => a - b)).toEqual(
      [flatIndex(2, 4), flatIndex(5, 4)].sort((a, b) => a - b),
    );
  });

  it('drawFull is never called during an erase stroke, including on the commit round trip (AC2)', () => {
    installContexts();
    const drawFullSpy = vi.spyOn(GridRenderer.prototype, 'drawFull');
    const onStrokeCommit = vi.fn();
    const grid = gridWithOccupant(3, 4);

    const { rerender } = render(
      <PetriDishCanvas
        variant="edit"
        grid={grid}
        size={PLACE_SIZE}
        palette={PALETTE}
        showGridLines
        colors={COLORS}
        tool={ERASER_TOOL}
        toolRef={0}
        onStrokeCommit={onStrokeCommit}
      />,
    );
    expect(drawFullSpy).toHaveBeenCalledTimes(1); // the mount's one full paint.

    const canvas = document.querySelector('canvas') as HTMLCanvasElement;
    stubRect(canvas);

    fireEvent.pointerDown(canvas, centreOf(3, 4));
    expect(drawFullSpy).toHaveBeenCalledTimes(1); // still just the mount's, mid-stroke.
    fireEvent.pointerUp(canvas, centreOf(3, 4));
    expect(drawFullSpy).toHaveBeenCalledTimes(1); // and after the commit fires.

    const committed = onStrokeCommit.mock.calls[0][0] as RenderableGrid;
    rerender(
      <PetriDishCanvas
        variant="edit"
        grid={committed}
        size={PLACE_SIZE}
        palette={PALETTE}
        showGridLines
        colors={COLORS}
        tool={ERASER_TOOL}
        toolRef={0}
        onStrokeCommit={onStrokeCommit}
      />,
    );

    // THE round trip: the committed grid comes back down as a new prop identity, and
    // `paintedGridRef` must keep the grid effect from full-repainting it.
    expect(drawFullSpy).toHaveBeenCalledTimes(1);
  });

  it('no React re-render occurs between down and up while erasing (AC2)', () => {
    const onStrokeCommit = vi.fn();
    const renderSpy = vi.fn();
    installContexts();
    const grid = gridWithOccupant(3, 4);
    const view = render(
      <Profiler id="dish-eraser" onRender={renderSpy}>
        <PetriDishCanvas
          variant="edit"
          grid={grid}
          size={PLACE_SIZE}
          palette={PALETTE}
          showGridLines
          colors={COLORS}
          tool={ERASER_TOOL}
          toolRef={0}
          onStrokeCommit={onStrokeCommit}
        />
      </Profiler>,
    );
    const canvas = view.container.querySelector('canvas') as HTMLCanvasElement;
    stubRect(canvas);
    renderSpy.mockClear(); // drop the mount's own render(s); only the GESTURE matters here.

    fireEvent.pointerDown(canvas, centreOf(3, 4));
    expect(renderSpy).not.toHaveBeenCalled();
    fireEvent.pointerUp(canvas, centreOf(3, 4));
    expect(renderSpy).not.toHaveBeenCalled();
  });

  // Task 3's last bullet: with the eraser selected, `handlePointerDown`'s `if (toolRef === null)
  // return;` guard never fires — erasing works even when no organism resolves in this battle's
  // roster, the one case where the eraser and the organism tool legitimately behave differently
  // (an organism tool with no roster match places nothing; the eraser's ref is never null).
  // `lib/tool.test.ts` pins that `refForTool` returns 0 for an empty roster; this pins what the
  // canvas does with that 0, independent of the roster the canvas never sees.
  it('erases via toolRef 0 — the value an empty roster resolves the eraser to — same as any other roster', () => {
    const grid = gridWithOccupant(3, 4);
    const onStrokeCommit = vi.fn();
    const { canvas } = mount({ grid, tool: ERASER_TOOL, toolRef: 0, onStrokeCommit });

    fireEvent.pointerDown(canvas, centreOf(3, 4));
    fireEvent.pointerUp(canvas, centreOf(3, 4));

    expect(onStrokeCommit).toHaveBeenCalledTimes(1);
    expect((onStrokeCommit.mock.calls[0][0] as RenderableGrid).occupant[flatIndex(3, 4)]).toBe(0);
  });
});
