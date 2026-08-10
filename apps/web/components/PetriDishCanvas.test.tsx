import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import { GridRenderer } from '@/lib/gridRenderer';
import { installRecordingContext2d } from '@/lib/recordingContext2d';
import type { RefToFillGroup } from '@/lib/refToFillGroup';
import type { RenderableGrid } from '@/lib/renderableGrid';
import { displayColorAt } from '@/lib/displayColor';
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
    const recording = installRecordingContext2d(canvas);

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

    const ops = recording.calls.map((c) => c.op);
    // The constructor asserts an identity transform first (Story 1.8) — the background fill is
    // the first DRAWING op, not necessarily calls[0].
    const firstFillRectIndex = ops.indexOf('fillRect');
    expect(firstFillRectIndex).toBeGreaterThanOrEqual(0);
    const beginPathIndex = ops.indexOf('beginPath');
    expect(beginPathIndex).toBeGreaterThan(firstFillRectIndex); // background before cells
    expect(ops[beginPathIndex + 1]).toBe('rect');
    expect(ops).toContain('fill');
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
      trigger(): void {
        this.callback([] as unknown as ResizeObserverEntry[], this);
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
      observer?.trigger();
      observer?.trigger(); // a rapid second notification must not produce a second repaint

      vi.advanceTimersByTime(149);
      expect(getContextSpy.mock.calls.length).toBe(callsAfterInitialPaint); // not yet

      vi.advanceTimersByTime(1); // total 150ms
      expect(getContextSpy.mock.calls.length).toBe(callsAfterInitialPaint + 1); // exactly one
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
      observer?.trigger();

      unmount();
      expect(observer?.disconnect).toHaveBeenCalledTimes(1);

      // The pending debounce timer must be cleared, not just orphaned — otherwise it fires after
      // unmount and repaints a canvas no longer in the document.
      vi.advanceTimersByTime(200);
      expect(getContextSpy.mock.calls.length).toBe(callsAfterInitialPaint);
    });
  });
});
