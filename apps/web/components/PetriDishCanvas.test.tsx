import type { ReactElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import { GridRenderer } from '@/lib/canvas/gridRenderer';
import { installRecordingContext2d, RecordingContext2D } from '@/lib/recordingContext2d';
import type { RefToFillGroup } from '@/lib/canvas/refToFillGroup';
import type { RenderableGrid } from '@/lib/canvas/renderableGrid';
import { displayColorAt } from '@/lib/palette/displayColor';
import type { Tool } from '@/lib/tool';
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

// Click placement (Story 2.5, AC1/AC2/AC4/AC7). Every test here installs a per-canvas recording
// double BEFORE the first render — real jsdom's first `getContext('2d')` returns null, and a
// renderer that never got built cannot be observed painting OR not painting.
describe('PetriDishCanvas (edit variant) — click placement', () => {
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
      toolRef?: number | null;
      onStrokeCommit?: (next: RenderableGrid) => void;
      size?: { cols: number; rows: number };
    } = {},
  ) {
    const contexts = installContexts();
    const grid = overrides.grid ?? EMPTY_GRID;
    const size = overrides.size ?? PLACE_SIZE;
    const onStrokeCommit = overrides.onStrokeCommit ?? vi.fn();
    const view = render(
      <PetriDishCanvas
        variant="edit"
        grid={grid}
        size={size}
        palette={PALETTE}
        showGridLines
        colors={COLORS}
        tool={TOOL}
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

  it('commits exactly once per click, with a NEW grid differing at exactly one cell (AC1, AC4)', () => {
    const onStrokeCommit = vi.fn();
    const { canvas, grid } = mount({ onStrokeCommit });
    const before = Uint8Array.from(grid.occupant);

    fireEvent.pointerDown(canvas, centreOf(3, 4));

    expect(onStrokeCommit).toHaveBeenCalledTimes(1);
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
