import { Profiler, type ReactElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import { GridRenderer } from '@/lib/canvas/gridRenderer';
import { resetColourStateWarnings } from '@/lib/canvas/colourStateGroups';
import { installRecordingContext2d, RecordingContext2D } from '@/test-support/recordingContext2d';
import type { RefToFillGroup } from '@/lib/canvas/refToFillGroup';
import type { RenderableGrid } from '@/lib/canvas/renderableGrid';
import { displayColorAt } from '@/lib/palette/displayColor';
import { ERASER_TOOL, type Tool } from '@/lib/battle/tool';
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

  // Story 2.10 Task 5 / AC6 — the deferred-work.md `setPalette` entry, PROVEN rather than
  // assumed. `<BattlePage>`'s `palette` memo depends on `[rosterIds, organisms]`, so an add mints
  // a NEW `RefToFillGroup` identity; this construction effect lists `palette` among its three
  // deps, so that new identity reconstructs the renderer and repaints. This test builds exactly
  // that shape: a grid cell already carries ref 2 before its organism exists in the roster (the
  // order an append-only session add takes for one render — the committed grid and the rebuilt
  // palette do not arrive in the same tick), so the FIRST paint treats it as out-of-range and
  // warns; the SECOND palette identity resolves ref 2 to its own colour token, with no code
  // change to `GridRenderer` — closing the entry on evidence, per the Dev Notes.
  it('repaints a ref that was out-of-range in its OWN colour once a roster mutation gives palette a new identity (AC6)', () => {
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
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    resetColourStateWarnings();
    const drawFullSpy = vi.spyOn(GridRenderer.prototype, 'drawFull');

    // ref 2 painted before its organism exists in a 1-organism roster (size 2: only refs 0/1 are
    // in range) — the out-of-range shape `groupByColourState` degrades-and-warns rather than
    // throws (Decision I.4).
    const gridWithRef2 = makeGrid(2, 2, [2, 0, 0, 0]);
    const initialPalette = makeLut([0, 0], [0, 0]);

    const { container, rerender } = render(
      <PetriDishCanvas
        variant="edit"
        tool={TOOL}
        toolRef={1}
        onStrokeCommit={noopCommit}
        grid={gridWithRef2}
        size={SIZE}
        palette={initialPalette}
        showGridLines={false}
        colors={COLORS}
      />,
    );
    const canvas = container.querySelector('canvas') as HTMLCanvasElement;
    const recording = contexts.get(canvas) as RecordingContext2D;
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('outside the palette LUT'));
    warnSpy.mockClear();

    const fillsBefore = recording.fillStyleWrites.length;

    // The NEW identity <BattlePage>'s palette memo mints for an add — THREE slots now (ref 0
    // pad, ref 1, ref 2), so ref 2 is finally in range, resolving to token index 1, distinct
    // from ref 1's token index 0.
    const paletteAfterAdd = makeLut([0, 0, 1], [0, 0, 0]);
    rerender(
      <PetriDishCanvas
        variant="edit"
        tool={TOOL}
        toolRef={1}
        onStrokeCommit={noopCommit}
        grid={gridWithRef2}
        size={SIZE}
        palette={paletteAfterAdd}
        showGridLines={false}
        colors={COLORS}
      />,
    );

    // Reconstruction, not a stale renderer: a SECOND drawFull for the SAME grid identity.
    expect(drawFullSpy).toHaveBeenCalledTimes(2);
    const newFills = recording.fillStyleWrites.slice(fillsBefore);
    // The newly-addable organism's OWN colour (tokenIndex 1, non-aging -> shade 7) — not the
    // background, and not ref 1's colour (tokenIndex 0).
    expect(newFills).toContain(displayColorAt(1, 7));
    expect(newFills).not.toContain(displayColorAt(0, 7));
    // And the out-of-range warning does not fire again — the ref is valid now.
    expect(warnSpy).not.toHaveBeenCalled();

    // Residual this story records rather than fixes (Dev Notes): a full repaint per add, and the
    // dirty baseline is re-primed by it — `drawFull`, not the dirty `draw` path, painted the newly
    // valid ref.
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
  const toolRef = overrides.toolRef === undefined ? 1 : overrides.toolRef;

  // Story 2.8: ONE element factory serving both the initial render and `rerenderWith` below,
  // rather than a second hand-copied JSX block — the same parameterise-don't-duplicate discipline
  // this helper was itself extracted for.
  function element(props: {
    grid: RenderableGrid;
    tool: Tool;
    toolRef: number | null;
    palette: RefToFillGroup;
  }) {
    return (
      <PetriDishCanvas
        variant="edit"
        grid={props.grid}
        size={size}
        palette={props.palette}
        showGridLines
        colors={COLORS}
        tool={props.tool}
        toolRef={props.toolRef}
        onStrokeCommit={onStrokeCommit}
      />
    );
  }

  const view = render(element({ grid, tool, toolRef, palette: PALETTE }));
  const canvas = view.container.querySelector('canvas') as HTMLCanvasElement;
  stubRect(canvas);

  /**
   * Stands in for `<BattlePage>` pushing a new value down MID-GESTURE — an undo (Story 2.8), a
   * resize (2.14) or a Clear (2.15) — or for `<BattleEditorView>` resolving a new `toolRef` from
   * a tool the user switched with the keyboard while dragging. `palette` joins them in Story 2.10:
   * an add mints a new `RefToFillGroup` identity, which reconstructs the renderer.
   */
  function rerenderWith(next: {
    grid?: RenderableGrid;
    tool?: Tool;
    toolRef?: number | null;
    palette?: RefToFillGroup;
  }) {
    view.rerender(
      element({
        grid: next.grid ?? grid,
        tool: next.tool ?? tool,
        toolRef: next.toolRef === undefined ? toolRef : next.toolRef,
        palette: next.palette ?? PALETTE,
      }),
    );
  }

  return { ...view, canvas, contexts, grid, size, onStrokeCommit, rerenderWith };
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
      // review (2026-08-27): THE assertion this test was missing. The fresh stroke must be based
      // on the RECLAIMED stroke's buffer, not on the `grid` prop — React batches the reclaim's
      // commit, so the prop is still pre-reclaim inside the same handler, and slicing it makes the
      // fresh commit silently revert what the reclaim just committed. Without the fix this reads
      // 0: the reclaim's own paint, undone by the gesture that reclaimed it.
      expect(fresh.occupant[flatIndex(2, 2)]).toBe(1);
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

// An EXTERNAL `grid` change landing mid-stroke (Story 2.8 Task 6, closing the deferred-work.md
// entry that named this story). Undo is the first thing that can push a new grid down while a
// pointer is held; 2.14's resize and 2.15's Clear inherit whatever is decided here.
//
// Policy (forced decision 5): the stroke ENDS and its paint is DISCARDED — `endStroke(false)`. The
// alternative, committing what the stroke painted, reverts the external change wholesale, which is
// precisely the defect the deferred entry describes.
describe('PetriDishCanvas (edit variant) — an external grid change mid-stroke (Story 2.8)', () => {
  /** A grid with a single organism cell at (col, row); the stand-in for "an undo restored this". */
  function gridWithOccupant(col: number, row: number, ref = 1): RenderableGrid {
    const occupant = new Array(200).fill(0) as number[];
    occupant[flatIndex(col, row)] = ref;
    return makeGrid(20, 10, occupant);
  }

  it('ends the open stroke without committing, so the external change survives', () => {
    const onStrokeCommit = vi.fn();
    const { canvas, rerenderWith } = mount({ onStrokeCommit });
    const external = gridWithOccupant(9, 9);

    fireEvent.pointerDown(canvas, centreOf(2, 2)); // a stroke is now open and has painted (2,2).
    rerenderWith({ grid: external });

    // The stroke is gone, and nothing was committed on the way out: committing would have handed
    // <BattlePage> a buffer sliced off the PRE-change grid, silently undoing the undo.
    expect(onStrokeCommit).not.toHaveBeenCalled();

    // The pointer is still physically down. Its release must find no stroke and do nothing —
    // `endStroke`'s idempotence, exercised through a terminate reason that is not pointer-up.
    fireEvent.pointerUp(canvas, centreOf(2, 2));
    expect(onStrokeCommit).not.toHaveBeenCalled();
  });

  it('lets the NEXT gesture build on the external value, not on the discarded stroke', () => {
    const onStrokeCommit = vi.fn();
    const { canvas, rerenderWith } = mount({ onStrokeCommit });
    const external = gridWithOccupant(9, 9);

    fireEvent.pointerDown(canvas, centreOf(2, 2));
    rerenderWith({ grid: external });
    fireEvent.pointerUp(canvas, centreOf(2, 2));

    // A fresh press-release AFTER the change.
    fireEvent.pointerDown(canvas, centreOf(5, 5));
    fireEvent.pointerUp(canvas, centreOf(5, 5));

    expect(onStrokeCommit).toHaveBeenCalledTimes(1);
    const committed = onStrokeCommit.mock.calls[0][0] as RenderableGrid;
    expect(committed.occupant[flatIndex(5, 5)]).toBe(1); // what this gesture painted
    expect(committed.occupant[flatIndex(9, 9)]).toBe(1); // the external change, still there
    expect(committed.occupant[flatIndex(2, 2)]).toBe(0); // the discarded stroke, gone for good
  });

  it('repaints the external grid in full, and does not repaint a grid it committed itself', () => {
    const drawFullSpy = vi.spyOn(GridRenderer.prototype, 'drawFull');
    const onStrokeCommit = vi.fn();
    const { canvas, rerenderWith } = mount({ onStrokeCommit });
    const afterMount = drawFullSpy.mock.calls.length;

    // A completed gesture whose committed grid comes straight back down: `paintedGridRef` already
    // holds that identity, so the grid effect skips — and, critically, the skip runs BEFORE the
    // terminate, which is what keeps `handlePointerDown`'s reclaim path from killing its own
    // fresh stroke.
    fireEvent.pointerDown(canvas, centreOf(1, 1));
    fireEvent.pointerUp(canvas, centreOf(1, 1));
    const committed = onStrokeCommit.mock.calls[0][0] as RenderableGrid;
    rerenderWith({ grid: committed });
    expect(drawFullSpy.mock.calls.length).toBe(afterMount);

    // An identity the canvas has never painted is external and gets the FULL repaint (AC4's
    // "the dish repaints to match" — a dirty repaint would leave the colour-state baseline stale).
    const external = gridWithOccupant(9, 9);
    rerenderWith({ grid: external });
    expect(drawFullSpy.mock.calls.length).toBe(afterMount + 1);
    expect(drawFullSpy.mock.calls.at(-1)?.[0]).toBe(external);
  });

  it('discards the stroke even when the renderer was never constructed (trap 12)', () => {
    // No recording double: real jsdom `getContext('2d')` returns null, so construction fails and
    // `rendererRef` stays null. The MODEL half must still behave — the stroke still writes into
    // its working buffer and would still commit, so the terminate cannot be gated on a renderer.
    const onStrokeCommit = vi.fn();
    const external = gridWithOccupant(9, 9);
    const view = render(
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
    const canvas = view.container.querySelector('canvas') as HTMLCanvasElement;
    stubRect(canvas);

    fireEvent.pointerDown(canvas, centreOf(2, 2));
    view.rerender(
      <PetriDishCanvas
        variant="edit"
        grid={external}
        size={PLACE_SIZE}
        palette={PALETTE}
        showGridLines
        colors={COLORS}
        tool={TOOL}
        toolRef={1}
        onStrokeCommit={onStrokeCommit}
      />,
    );
    fireEvent.pointerUp(canvas, centreOf(2, 2));

    expect(onStrokeCommit).not.toHaveBeenCalled();
  });
});

// A PALETTE change landing mid-stroke (Story 2.10, Sidiar's decision 2(b)). An add mints a new
// `RefToFillGroup` identity, which is a dep of the construction effect, so the effect tears down
// and rebuilds the renderer — and its CLEANUP is what meets the open stroke.
//
// Reachable via multi-touch: one finger holds the dish (pointer capture is on the canvas,
// `touchAction: 'none'`), a second works the sidebar's add control. `handlePointerDown`'s
// second-pointer reject only guards the canvas element itself, so it does not cover this.
//
// Policy 2(b): DISCARD, like the grid effect's terminate — but through the shared `endStroke(false)`
// rather than by nulling `strokeRef` by hand. Nulling it directly dropped the cells (correct) and
// skipped `releasePointerCapture` (not correct), leaving the rest of that gesture inert.
describe('PetriDishCanvas (edit variant) — a palette change mid-stroke (Story 2.10)', () => {
  /** A second `RefToFillGroup` identity — same contents, new object, which is all a dep compares. */
  function nextPalette(): RefToFillGroup {
    return makeLut([0, 0], [0, 0]);
  }

  it('ends the open stroke without committing, and RELEASES pointer capture on the way out', () => {
    const onStrokeCommit = vi.fn();
    const { canvas, rerenderWith } = mount({ onStrokeCommit });
    // jsdom 30 has `PointerEvent` but neither capture method (trap 1), so the component's
    // optional calls are no-ops by default and a spy is the only way to see the release at all.
    const release = vi.fn();
    canvas.setPointerCapture = vi.fn();
    canvas.releasePointerCapture = release;

    fireEvent.pointerDown(canvas, centreOf(2, 2)); // a stroke is open and has painted (2,2).
    rerenderWith({ palette: nextPalette() });

    expect(onStrokeCommit).not.toHaveBeenCalled();
    // The assertion the hand-nulled ref could never satisfy: capture is handed back, so the rest
    // of this gesture reaches the page normally instead of being swallowed by a dead canvas.
    expect(release).toHaveBeenCalledWith(0);

    // The pointer is still physically down; its release must find no stroke (idempotence).
    fireEvent.pointerUp(canvas, centreOf(2, 2));
    expect(onStrokeCommit).not.toHaveBeenCalled();
  });

  it('lets the NEXT gesture paint normally, on the grid the discarded stroke never reached', () => {
    const onStrokeCommit = vi.fn();
    const { canvas, rerenderWith } = mount({ onStrokeCommit });
    const palette = nextPalette();

    fireEvent.pointerDown(canvas, centreOf(2, 2));
    rerenderWith({ palette });
    fireEvent.pointerUp(canvas, centreOf(2, 2));

    // A fresh press-release AFTER the add. `rerenderWith` keeps the new palette identity so this
    // gesture runs against the rebuilt renderer, the way it would after a real add.
    fireEvent.pointerDown(canvas, centreOf(5, 5));
    fireEvent.pointerUp(canvas, centreOf(5, 5));

    expect(onStrokeCommit).toHaveBeenCalledTimes(1);
    const committed = onStrokeCommit.mock.calls[0][0] as RenderableGrid;
    expect(committed.occupant[flatIndex(5, 5)]).toBe(1); // what this gesture painted
    expect(committed.occupant[flatIndex(2, 2)]).toBe(0); // the discarded stroke, gone for good
  });

  it('leaves a completed stroke alone — the add only meets a stroke that is still open', () => {
    const onStrokeCommit = vi.fn();
    const { canvas, rerenderWith } = mount({ onStrokeCommit });

    fireEvent.pointerDown(canvas, centreOf(2, 2));
    fireEvent.pointerUp(canvas, centreOf(2, 2)); // committed BEFORE the add
    expect(onStrokeCommit).toHaveBeenCalledTimes(1);

    rerenderWith({ palette: nextPalette() });
    expect(onStrokeCommit).toHaveBeenCalledTimes(1); // no second commit, no discard
  });
});

// The resize effect's STALE `endStroke` closure (Story 2.8 Task 5, closing the first
// deferred-work.md entry that named this story). The effect's deps are `[size]` with an
// exhaustive-deps disable, so its `ResizeObserver` callback holds the closure from whichever
// render last changed `size` — usually the mount — and used to commit through THAT render's
// `onStrokeCommit`. Inert while `<BattlePage>` passed a bare `useState` setter (the stale function
// and the live one were the same object); this pins the fix independently of that, because
// `useUndoableGrid.commit` being stable too is not what makes it correct.
describe('PetriDishCanvas (edit variant) — the resize effect reads the LATEST endStroke (Story 2.8)', () => {
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
  });

  it('commits a mid-stroke re-layout through the CURRENT onStrokeCommit, not the mount-time one', () => {
    vi.stubGlobal('ResizeObserver', FakeResizeObserver);
    const atMount = vi.fn();
    const current = vi.fn();

    function element(onStrokeCommit: (next: RenderableGrid) => void) {
      return (
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
      );
    }

    const view = render(element(atMount));
    const canvas = view.container.querySelector('canvas') as HTMLCanvasElement;
    stubRect(canvas);

    // A NEW handler identity, on a render that does NOT change `size` — so the resize effect is
    // deliberately not re-registered and its closure stays the mount's.
    view.rerender(element(current));

    fireEvent.pointerDown(canvas, centreOf(2, 2)); // a stroke that has actually painted something
    const observer = FakeResizeObserver.instances.at(-1);
    expect(observer).toBeDefined();
    observer?.trigger(400, 240); // a changed box: "a mid-stroke re-layout ENDS the stroke"

    expect(current).toHaveBeenCalledTimes(1);
    expect(atMount).not.toHaveBeenCalled();
  });
});

// Mid-drag tool switching (Story 2.8 Task 7, closing the third deferred-work.md entry that named
// this story). Story 2.7 rewrote `Stroke.ref`'s doc comment because its keyboard-operable toggle
// falsified the old "nothing can change the tool mid-drag" premise, but shipped no test. This is
// the story where a wrong answer starts corrupting the undo ring: an entry that is half paint and
// half erase has no coherent meaning (Story 2.7 forced decision 4).
describe('PetriDishCanvas (edit variant) — mid-drag tool switching (Story 2.8)', () => {
  it('keeps painting the ref the stroke STARTED with when toolRef changes mid-gesture', () => {
    const onStrokeCommit = vi.fn();
    const { canvas, rerenderWith } = mount({ onStrokeCommit });

    fireEvent.pointerDown(canvas, centreOf(2, 4)); // opened with toolRef 1 (an organism)
    fireEvent.pointerMove(canvas, moveTo(3, 4));

    // The user hits the eraser toggle without lifting the pointer. `<BattleEditorView>` resolves
    // the new tool and pushes toolRef 0 down mid-stroke.
    rerenderWith({ tool: ERASER_TOOL, toolRef: 0 });

    fireEvent.pointerMove(canvas, moveTo(4, 4));
    fireEvent.pointerUp(canvas, { ...centreOf(4, 4), buttons: 0 });

    expect(onStrokeCommit).toHaveBeenCalledTimes(1); // still exactly ONE undo entry
    const committed = onStrokeCommit.mock.calls[0][0] as RenderableGrid;
    // Every cell of the gesture carries the PINNED ref — including the two painted after the
    // switch. A stroke that re-read `toolRef` per move would leave (4,4) at 0.
    for (const col of [2, 3, 4]) expect(committed.occupant[flatIndex(col, 4)]).toBe(1);
  });

  it('applies the new tool from the NEXT gesture onward', () => {
    const onStrokeCommit = vi.fn();
    const { canvas, rerenderWith } = mount({ onStrokeCommit });

    fireEvent.pointerDown(canvas, centreOf(2, 4));
    rerenderWith({ tool: ERASER_TOOL, toolRef: 0 });
    fireEvent.pointerUp(canvas, centreOf(2, 4));

    // A fresh gesture on the cell the first one painted: the eraser is now in force, so this
    // commits a 0 there. Without the switch taking effect at all, this stroke would be a no-op
    // (the cell already holds 1) and would commit nothing.
    const painted = onStrokeCommit.mock.calls[0][0] as RenderableGrid;
    rerenderWith({ grid: painted, tool: ERASER_TOOL, toolRef: 0 });
    fireEvent.pointerDown(canvas, centreOf(2, 4));
    fireEvent.pointerUp(canvas, centreOf(2, 4));

    expect(onStrokeCommit).toHaveBeenCalledTimes(2);
    const erased = onStrokeCommit.mock.calls[1][0] as RenderableGrid;
    expect(erased.occupant[flatIndex(2, 4)]).toBe(0);
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
  // `lib/battle/tool.test.ts` pins that `refForTool` returns 0 for an empty roster; this pins what the
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

/**
 * Story 2.14 (AC7) — a live GRID-DIMENSION change, and the mid-stroke re-layout pin
 * `deferred-work.md` has been holding since Story 2.4.
 *
 * Four mechanisms in this file were written for this moment and had never once executed: the
 * construction effect's `[size, …]` dependency, its `endStrokeRef.current(false)` cleanup,
 * `handlePointerDown`'s dimension guard, and (indirectly) `useUndoableGrid`'s dimension-carrying
 * snapshot. They were each reviewed as individually correct; what had never been checked is that
 * they COMPOSE.
 */
describe('PetriDishCanvas (edit variant) — a live grid-dimension change (Story 2.14, AC7)', () => {
  const BIG = { cols: 4, rows: 4 };
  const SMALL = { cols: 2, rows: 2 };
  const BIG_GRID = makeGrid(4, 4, [1, 1, 0, 0, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1]);
  const SMALL_GRID = makeGrid(2, 2, [1, 1, 1, 1]);

  /**
   * The centre of a BIG-grid cell under the stubbed 300x150 box. `computeGridLayout` gives
   * cellSize = min(300/4, 150/4) = 37.5 with a 75px centring margin on x — so a coordinate picked
   * by eye lands in the MARGIN, where `pointerToCell` correctly returns null and the stroke opens
   * with nothing painted. That is the difference between a commit assertion that means something
   * and one that reads 0 for the wrong reason.
   */
  function centreOfBigCell(col: number, row: number) {
    const cellSize = Math.min(300 / BIG.cols, 150 / BIG.rows);
    const originX = (300 - cellSize * BIG.cols) / 2;
    const originY = (150 - cellSize * BIG.rows) / 2;
    return {
      clientX: originX + col * cellSize + cellSize / 2,
      clientY: originY + row * cellSize + cellSize / 2,
      button: 0,
      isPrimary: true,
    };
  }

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
  });

  /**
   * Own mount, rather than the shared `mount` above, for one reason: this describe needs to count
   * RENDERER CONSTRUCTIONS, and the only observable proxy is `getContext('2d')` — one call per
   * `new GridRenderer(…)` on a canvas element React reuses across rerenders. It also parameterises
   * `showGridLines`, which the shared helper pins.
   */
  function mountResizable(initial: { grid: RenderableGrid; size: { cols: number; rows: number } }) {
    const contexts = new Map<HTMLCanvasElement, RecordingContext2D>();
    const getContext = vi
      .spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockImplementation(function (this: HTMLCanvasElement) {
        let context = contexts.get(this);
        if (context === undefined) {
          context = new RecordingContext2D();
          contexts.set(this, context);
        }
        return context as unknown as CanvasRenderingContext2D;
      });

    const onStrokeCommit = vi.fn();
    function element(props: {
      grid: RenderableGrid;
      size: { cols: number; rows: number };
      showGridLines: boolean;
    }) {
      return (
        <PetriDishCanvas
          variant="edit"
          grid={props.grid}
          size={props.size}
          palette={PALETTE}
          showGridLines={props.showGridLines}
          colors={COLORS}
          tool={TOOL}
          toolRef={1}
          onStrokeCommit={onStrokeCommit}
        />
      );
    }

    const view = render(element({ ...initial, showGridLines: false }));
    const canvas = view.container.querySelector('canvas') as HTMLCanvasElement;
    // jsdom 30 has neither method (trap 1); the component guards both with `?.`, so they have to
    // exist here for the capture half of a stroke's lifecycle to be observable at all.
    canvas.setPointerCapture = vi.fn();
    canvas.releasePointerCapture = vi.fn();
    vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 0,
      width: 300,
      height: 150,
      right: 300,
      bottom: 150,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect);

    function rerenderWith(next: {
      grid: RenderableGrid;
      size: { cols: number; rows: number };
      showGridLines?: boolean;
    }) {
      view.rerender(element({ showGridLines: false, ...next }));
    }

    return { ...view, canvas, getContext, onStrokeCommit, rerenderWith };
  }

  // Trap 11: a resize lands on TWO effects, not one. The construction effect paints and records
  // `paintedGridRef`, so the grid effect SKIPS — but only because construction is declared first.
  // Reordering those declarations reintroduces a double repaint, and ONLY a call-count assertion
  // catches it.
  it('reconstructs the renderer ONCE and full-repaints ONCE (trap 11)', () => {
    const drawFull = vi.spyOn(GridRenderer.prototype, 'drawFull');
    const resize = vi.spyOn(GridRenderer.prototype, 'resize');
    const { getContext, rerenderWith } = mountResizable({ grid: BIG_GRID, size: BIG });

    const constructionsAtMount = getContext.mock.calls.length;
    expect(drawFull).toHaveBeenCalledTimes(1);

    // ⚠️ `grid` and `size` change in the SAME commit — the invariant `<BattlePage>`'s derived
    // `size` memo guarantees, and trap 2's "single most expensive mistake available in this story".
    rerenderWith({ grid: SMALL_GRID, size: SMALL });

    expect(getContext.mock.calls.length).toBe(constructionsAtMount + 1);
    expect(drawFull).toHaveBeenCalledTimes(2);
    expect(drawFull).toHaveBeenLastCalledWith(SMALL_GRID);
    // Reconstruction, NOT `resize()`: the construction effect's cleanup drops the renderer, so
    // there is no retained instance for a dimension-changing `resize()` call to reach.
    expect(resize).not.toHaveBeenCalled();
  });

  // AC7: nothing throws `GridRendererDimensionMismatchError` out of a passive effect. That is the
  // failure `<BattlePage>`'s derived-`size` comment predicts by name, and its symptom is an
  // unmounted editor rather than a red test somewhere legible.
  it('throws no dimension mismatch on the resize path, in EITHER direction', () => {
    const { rerenderWith } = mountResizable({ grid: BIG_GRID, size: BIG });

    expect(() => rerenderWith({ grid: SMALL_GRID, size: SMALL })).not.toThrow();
    // ...and back, which is what an UNDO of a resize does (`useUndoableGrid.restore()` rebuilds at
    // the SNAPSHOT's dimensions).
    expect(() => rerenderWith({ grid: BIG_GRID, size: BIG })).not.toThrow();
  });

  // Trap 12: `resize()` drops `lastGrid` when the shape changed precisely so an FR-8.7 toggle
  // cannot throw out of a UI event handler. That guard is on a REACHABLE path from this story on.
  it('survives an FR-8.7 grid-lines toggle taken right after a resize (trap 12)', () => {
    const { rerenderWith } = mountResizable({ grid: BIG_GRID, size: BIG });

    rerenderWith({ grid: SMALL_GRID, size: SMALL });

    expect(() =>
      rerenderWith({ grid: SMALL_GRID, size: SMALL, showGridLines: true }),
    ).not.toThrow();
  });

  /**
   * The mid-stroke policy this story INHERITS and must not relitigate: a `size` change lands on
   * the construction effect's cleanup, which discards through the shared `endStrokeRef.current
   * (false)` — no commit, and pointer capture released (deferred-work.md, Sidiar's decision 2(b),
   * 2026-08-27). Silent: no toast, no flash (the same entry, ratified).
   */
  it('discards an in-progress stroke on a live size change, silently, releasing capture', () => {
    const { canvas, rerenderWith, onStrokeCommit } = mountResizable({ grid: BIG_GRID, size: BIG });

    // (2, 0) is EMPTY in BIG_GRID, so this pointer-down genuinely paints — a stroke that changed
    // nothing commits nothing anyway (AC6, Story 2.6), which would make the assertion below pass
    // for the wrong reason.
    fireEvent.pointerDown(canvas, centreOfBigCell(2, 0));
    expect(canvas.setPointerCapture).toHaveBeenCalledTimes(1);

    rerenderWith({ grid: SMALL_GRID, size: SMALL });

    expect(onStrokeCommit).not.toHaveBeenCalled();
    expect(canvas.releasePointerCapture).toHaveBeenCalledTimes(1);
  });

  /**
   * deferred-work.md, **closed by Story 2.14**: Story 2.4's forced decision — a mid-stroke
   * RE-LAYOUT ends the stroke — shipped untested, because jsdom has no `ResizeObserver` and
   * deleting the line broke nothing.
   *
   * ⚠️ Scoped to this describe with `vi.stubGlobal`, NOT added to `apps/web/vitest.setup.ts`. A
   * global fake changes every test that relies on `typeof ResizeObserver === 'undefined'` taking
   * the early-return branch — of which this file alone has many — and the two describes above
   * already establish the per-describe fake as this file's own idiom.
   *
   * ⚠️ This terminate COMMITS (`endStroke(true)`), unlike the size-change one above. The two are
   * deliberately different and both are settled: a canvas-BOX change does not change grid content,
   * so the cells the user drew are still theirs; a grid-DIMENSION change tears down the state the
   * working buffer was sliced from.
   */
  it('ends and COMMITS an in-progress stroke on a mid-stroke re-layout (deferred-work, Story 2.4)', () => {
    vi.stubGlobal('ResizeObserver', FakeResizeObserver);
    const { canvas, onStrokeCommit } = mountResizable({ grid: BIG_GRID, size: BIG });

    // A pointer-down on an EMPTY cell, so the stroke really has something to commit.
    fireEvent.pointerDown(canvas, centreOfBigCell(2, 0));

    const observer = FakeResizeObserver.instances.at(-1);
    expect(observer).toBeDefined();
    observer?.trigger(400, 240);

    expect(onStrokeCommit).toHaveBeenCalledTimes(1);
    expect(canvas.releasePointerCapture).toHaveBeenCalledTimes(1);
  });
});

/**
 * Story 3.11 (AC4, AC5): the THIRD variant. A retained-renderer lifecycle like `EditDish` —
 * construct once per `[size, palette, colors]`, `setGridLines` on change, parent-observing
 * `ResizeObserver` — with three differences this describe pins one by one: it PAINTS NOTHING
 * itself (the hook that receives the renderer is what paints), it takes no grid and no pointer
 * handlers, and it hands the renderer out through `onRendererReady` (a renderer after
 * construction, `null` in the cleanup — `useSimulation.attachRenderer`'s own signature).
 */
describe('PetriDishCanvas (playback variant)', () => {
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
    resetColourStateWarnings();
  });

  function renderPlayback(
    onRendererReady: (renderer: GridRenderer | null) => void,
    overrides: Partial<{
      size: { cols: number; rows: number };
      palette: RefToFillGroup;
      colors: typeof COLORS;
      showGridLines: boolean;
    }> = {},
  ) {
    return (
      <PetriDishCanvas
        variant="playback"
        size={overrides.size ?? SIZE}
        palette={overrides.palette ?? PALETTE}
        showGridLines={overrides.showGridLines ?? true}
        colors={overrides.colors ?? COLORS}
        onRendererReady={onRendererReady}
      />
    );
  }

  it('mounts a canvas with role="img" and the "Petri dish, C by R cells" name', () => {
    installContexts();
    const { container } = render(renderPlayback(vi.fn(), { size: { cols: 7, rows: 3 } }));

    const canvas = container.querySelector('canvas');
    expect(canvas).toHaveAttribute('role', 'img');
    expect(canvas).toHaveAttribute('aria-label', 'Petri dish, 7 by 3 cells');
    // Not a paintable surface: no pointer plumbing, no focus stop.
    expect(canvas).not.toHaveAttribute('tabindex');
  });

  it('calls onRendererReady once with a GridRenderer after mount, and once with null on unmount', () => {
    installContexts();
    const onRendererReady = vi.fn();
    const { unmount } = render(renderPlayback(onRendererReady));

    expect(onRendererReady).toHaveBeenCalledTimes(1);
    expect(onRendererReady.mock.calls[0][0]).toBeInstanceOf(GridRenderer);

    unmount();

    expect(onRendererReady).toHaveBeenCalledTimes(2);
    expect(onRendererReady.mock.calls[1][0]).toBeNull();
  });

  // The whole point of the variant: the CALLER paints. The canvas never issues a paint of its
  // own — proven both negatively (zero prototype calls from the mount) and positively (a
  // `drawFull` issued from the test's own `onRendererReady` reaches the recording context).
  it('never paints itself — drawFull/renderStatic/draw are the caller’s, and the caller’s paint lands', () => {
    const contexts = installContexts();
    const drawFullSpy = vi.spyOn(GridRenderer.prototype, 'drawFull');
    const renderStaticSpy = vi.spyOn(GridRenderer.prototype, 'renderStatic');
    const drawSpy = vi.spyOn(GridRenderer.prototype, 'draw');

    let received: GridRenderer | null = null;
    const { container } = render(
      renderPlayback((renderer) => {
        received = renderer;
      }),
    );

    expect(drawFullSpy).not.toHaveBeenCalled();
    expect(renderStaticSpy).not.toHaveBeenCalled();
    expect(drawSpy).not.toHaveBeenCalled();
    const canvas = container.querySelector('canvas') as HTMLCanvasElement;
    const recording = contexts.get(canvas) as RecordingContext2D;
    const fillsBefore = recording.calls.filter((call) => call.op === 'fillRect').length;
    // The construction: the renderer's `applyDevicePixelSizing` + overlay build touch the canvas
    // but paint no cell — a `fillRect` before the caller paints would be the canvas painting.
    expect(fillsBefore).toBe(0);

    (received as GridRenderer | null)?.drawFull(GRID);

    expect(drawFullSpy).toHaveBeenCalledTimes(1);
    const fillsAfter = recording.calls.filter((call) => call.op === 'fillRect').length;
    expect(fillsAfter).toBeGreaterThan(0);
  });

  it('rebuilds on a `size` change: null, then a NEW renderer', () => {
    installContexts();
    const onRendererReady = vi.fn();
    const { rerender } = render(renderPlayback(onRendererReady));
    const first = onRendererReady.mock.calls[0][0] as GridRenderer;

    rerender(renderPlayback(onRendererReady, { size: { cols: 4, rows: 4 } }));

    expect(onRendererReady).toHaveBeenCalledTimes(3);
    expect(onRendererReady.mock.calls[1][0]).toBeNull();
    const second = onRendererReady.mock.calls[2][0] as GridRenderer;
    expect(second).toBeInstanceOf(GridRenderer);
    expect(second).not.toBe(first);
  });

  // Story 3.11 review: the construction key is the DIMENSIONS, not the object. `useSimulation.stop()`
  // hands the view a fresh `liveSize` object at unchanged dimensions on every Stop; keyed on
  // identity, each Stop would detach, rebuild and re-prime this renderer. Mutation-check: put
  // `size` back in the construction deps and this reddens (three calls, not one).
  it('a NEW `size` object with the SAME dimensions neither rebuilds nor re-calls', () => {
    installContexts();
    const onRendererReady = vi.fn();
    const { rerender } = render(renderPlayback(onRendererReady, { size: { cols: 5, rows: 3 } }));
    expect(onRendererReady).toHaveBeenCalledTimes(1);

    rerender(renderPlayback(onRendererReady, { size: { cols: 5, rows: 3 } }));

    expect(onRendererReady).toHaveBeenCalledTimes(1);
  });

  it('serves a `showGridLines` change through setGridLines on the SAME instance, no rebuild', () => {
    installContexts();
    const setGridLinesSpy = vi.spyOn(GridRenderer.prototype, 'setGridLines');
    const onRendererReady = vi.fn();
    const { rerender } = render(renderPlayback(onRendererReady, { showGridLines: true }));
    setGridLinesSpy.mockClear();

    rerender(renderPlayback(onRendererReady, { showGridLines: false }));

    expect(setGridLinesSpy).toHaveBeenCalledWith(false);
    // One construction, one hand-off — the rerender neither detached nor rebuilt.
    expect(onRendererReady).toHaveBeenCalledTimes(1);
  });

  it('re-fits on a parent resize through resize(size) on the same instance', () => {
    vi.stubGlobal('ResizeObserver', FakeResizeObserver);
    installContexts();
    const resizeSpy = vi.spyOn(GridRenderer.prototype, 'resize');
    const onRendererReady = vi.fn();
    const { container } = render(renderPlayback(onRendererReady));

    const canvas = container.querySelector('canvas') as HTMLCanvasElement;
    const observer = FakeResizeObserver.instances.at(-1);
    expect(observer).toBeDefined();
    // The PARENT is what is observed (Story 2.4 Task 4's loop fix, inherited).
    expect(observer?.observe).toHaveBeenCalledWith(canvas.parentElement);
    observer?.trigger(400, 240);

    expect(resizeSpy).toHaveBeenCalledTimes(1);
    expect(resizeSpy).toHaveBeenCalledWith(SIZE);
    expect(onRendererReady).toHaveBeenCalledTimes(1);
  });

  // Real jsdom: `getContext('2d')` is null. The dish stays blank, nothing throws, and the hook is
  // handed NOTHING — it runs headless, which is what every `<BattlePage>` test relies on.
  it('with no 2D context: no onRendererReady call, no throw, the canvas still mounts', () => {
    const onRendererReady = vi.fn();
    let container: HTMLElement | undefined;
    expect(() => {
      container = render(renderPlayback(onRendererReady)).container;
    }).not.toThrow();

    expect(container?.querySelector('canvas')).not.toBeNull();
    expect(onRendererReady).not.toHaveBeenCalled();
  });

  /**
   * Trap 2's tripwire. `onRendererReady` is read in the construction effect but is NOT one of its
   * deps: listing it would tear the renderer down on every new callback identity, and calling
   * the prop directly in the cleanup would detach through whichever render REGISTERED the effect.
   * The `endStrokeRef` shape (Story 2.8 Task 5) is the answer. Mutation-check: drop the ref and
   * call the prop in the cleanup, and the unmount below reaches `first`, not `second`.
   */
  it('a NEW onRendererReady identity neither rebuilds nor re-calls, and the unmount detaches through the NEW one', () => {
    installContexts();
    const first = vi.fn();
    const second = vi.fn();
    const { rerender, unmount } = render(renderPlayback(first));
    expect(first).toHaveBeenCalledTimes(1);

    rerender(renderPlayback(second));

    expect(first).toHaveBeenCalledTimes(1);
    expect(second).not.toHaveBeenCalled();

    unmount();

    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledWith(null);
  });
});
