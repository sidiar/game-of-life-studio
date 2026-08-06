import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CONWAYS_CLASSIC, CONWAYS_CLASSIC_ID } from '@gol/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { displayColor } from './displayColor';
import {
  GridRenderer,
  GridRendererContextError,
  GridRendererDimensionMismatchError,
} from './gridRenderer';
import { installRecordingContext2d } from './recordingContext2d';
import { buildRefToFillGroup, type RefToFillGroup } from './refToFillGroup';
import type { RenderableGrid } from './renderableGrid';

// __dirname is unavailable under ESM; vitest.config.mts's `include` scopes tests to run from the
// package root, so this resolves the same file the import above pulls in, off disk rather than
// through the module graph — that's the whole point of the structural check below.
const SOURCE_PATH = join(process.cwd(), 'lib/gridRenderer.ts');
const COLORS = { background: '#0a0a0a', gridLine: '#333333' };

function makeCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function makeGrid(
  width: number,
  height: number,
  occupant: number[],
  age?: number[],
): RenderableGrid {
  return {
    width,
    height,
    occupant: Uint8Array.from(occupant),
    age: Uint16Array.from(age ?? new Array(occupant.length).fill(0)),
  };
}

function lut(tokenIndex: number[], aging: number[]): RefToFillGroup {
  return {
    tokenIndex: Uint8Array.from(tokenIndex),
    aging: Uint8Array.from(aging),
    size: tokenIndex.length,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('construction', () => {
  it('throws a named error when getContext returns null (real, unmocked jsdom behaviour)', () => {
    const canvas = makeCanvas(10, 10);
    expect(
      () => new GridRenderer(canvas, { cols: 1, rows: 1 }, lut([0], [0]), { colors: COLORS }),
    ).toThrow(GridRendererContextError);
  });
});

describe('AC3 — the frozen contract: no scheduling, ever', () => {
  it('never calls requestAnimationFrame, setTimeout, or setInterval across the full API surface', () => {
    const rafSpy = vi.spyOn(globalThis, 'requestAnimationFrame').mockReturnValue(0);
    const timeoutSpy = vi.spyOn(globalThis, 'setTimeout');
    const intervalSpy = vi.spyOn(globalThis, 'setInterval');

    const canvas = makeCanvas(20, 10);
    installRecordingContext2d(canvas);
    const renderer = new GridRenderer(canvas, { cols: 2, rows: 1 }, lut([0, 1], [0, 0]), {
      colors: COLORS,
    });
    const grid = makeGrid(2, 1, [1, 0]);

    renderer.drawFull(grid);
    renderer.renderStatic(grid);
    renderer.resize({ cols: 2, rows: 1 });
    renderer.setGridLines(false);

    expect(rafSpy).not.toHaveBeenCalled();
    expect(timeoutSpy).not.toHaveBeenCalled();
    expect(intervalSpy).not.toHaveBeenCalled();
  });

  it('the source text contains no scheduling primitive at all (structural, belt-and-braces)', () => {
    const source = readFileSync(SOURCE_PATH, 'utf8');
    expect(source).not.toMatch(/requestAnimationFrame|setTimeout|setInterval|queueMicrotask/);
  });

  it('never mutates the grid it is given', () => {
    const canvas = makeCanvas(20, 10);
    installRecordingContext2d(canvas);
    const renderer = new GridRenderer(canvas, { cols: 2, rows: 1 }, lut([0, 1], [0, 0]), {
      colors: COLORS,
    });
    const grid = makeGrid(2, 1, [1, 0], [3, 0]);
    const occupantBefore = Uint8Array.from(grid.occupant);
    const ageBefore = Uint16Array.from(grid.age);

    renderer.drawFull(grid);
    renderer.renderStatic(grid);
    renderer.resize({ cols: 2, rows: 1 });
    renderer.setGridLines(false);
    renderer.setGridLines(true);

    expect(grid.occupant).toEqual(occupantBefore);
    expect(grid.age).toEqual(ageBefore);
  });

  it('owns no scheduling state — drawFull called twice with the same grid produces identical call logs', () => {
    const grid = makeGrid(2, 1, [1, 2], [0, 0]);
    const table = lut([0, 5, 5], [0, 0, 0]);

    const canvasA = makeCanvas(20, 10);
    const doubleA = installRecordingContext2d(canvasA);
    new GridRenderer(canvasA, { cols: 2, rows: 1 }, table, { colors: COLORS }).drawFull(grid);

    const canvasB = makeCanvas(20, 10);
    const doubleB = installRecordingContext2d(canvasB);
    new GridRenderer(canvasB, { cols: 2, rows: 1 }, table, { colors: COLORS }).drawFull(grid);

    expect(doubleA.calls).toEqual(doubleB.calls);
    expect(doubleA.fillStyleWrites).toEqual(doubleB.fillStyleWrites);
  });
});

describe('drawFull — draw order and batching', () => {
  it('draws background, then cell groups, then grid lines, in that order', () => {
    const canvas = makeCanvas(20, 10); // cols=2, rows=1 -> cellSize 10, lines visible
    const ctx = installRecordingContext2d(canvas);
    const table = lut([0, 5, 5], [0, 0, 0]); // refs 1 and 2 share tokenIndex 5, both non-aging
    const renderer = new GridRenderer(canvas, { cols: 2, rows: 1 }, table, { colors: COLORS });
    ctx.calls.length = 0; // drop the constructor's setTransform call — only drawFull's log matters here

    renderer.drawFull(makeGrid(2, 1, [1, 2]));

    const ops = ctx.calls.map((call) => call.op);
    const firstFillRectIndex = ops.indexOf('fillRect');
    const beginPathIndex = ops.indexOf('beginPath');
    const fillIndex = ops.indexOf('fill');
    const secondFillRectIndex = ops.indexOf('fillRect', fillIndex + 1);

    expect(firstFillRectIndex).toBe(0); // background first
    expect(beginPathIndex).toBeGreaterThan(firstFillRectIndex);
    expect(fillIndex).toBeGreaterThan(beginPathIndex);
    expect(secondFillRectIndex).toBeGreaterThan(fillIndex); // grid lines last
  });

  it('emits exactly one beginPath, one fill, and one fillStyle write per group', () => {
    const canvas = makeCanvas(20, 10);
    const ctx = installRecordingContext2d(canvas);
    const table = lut([0, 5, 5], [0, 0, 0]); // two refs sharing one token -> one group
    // Grid lines off: isolates the batching call counts from the separate grid-line fillStyle
    // write, which would otherwise also land in fillStyleWrites and muddy this assertion.
    const renderer = new GridRenderer(canvas, { cols: 2, rows: 1 }, table, {
      colors: COLORS,
      showGridLines: false,
    });

    renderer.drawFull(makeGrid(2, 1, [1, 2]));

    const cellOps = ctx.calls.filter((c) => c.op === 'beginPath' || c.op === 'fill');
    expect(cellOps.filter((c) => c.op === 'beginPath')).toHaveLength(1);
    expect(cellOps.filter((c) => c.op === 'fill')).toHaveLength(1);
    // fillStyleWrites[0] is the background write; exactly one more for the single cell group.
    expect(ctx.fillStyleWrites).toHaveLength(2);
  });

  it('two organisms sharing a colorToken yield one fillStyle write, not two (Decision B.2)', () => {
    const canvas = makeCanvas(20, 10);
    const ctx = installRecordingContext2d(canvas);
    const table = lut([0, 5, 5], [0, 0, 0]);
    const renderer = new GridRenderer(canvas, { cols: 2, rows: 1 }, table, {
      colors: COLORS,
      showGridLines: false,
    });

    renderer.drawFull(makeGrid(2, 1, [1, 2]));

    // background + exactly one group colour.
    expect(ctx.fillStyleWrites).toHaveLength(2);
  });

  it('rect call count equals the number of non-empty cells, at the expected device-px coordinates', () => {
    const canvas = makeCanvas(20, 10); // cols=2, rows=1 -> cellSize 10, origin (0,0)
    const ctx = installRecordingContext2d(canvas);
    const table = lut([0, 3], [0, 0]);
    const renderer = new GridRenderer(canvas, { cols: 2, rows: 1 }, table, { colors: COLORS });

    renderer.drawFull(makeGrid(2, 1, [1, 1])); // both cells occupied by the same ref

    const rects = ctx.calls.filter((c) => c.op === 'rect');
    expect(rects).toHaveLength(2);
    expect(rects[0].args).toEqual([0, 0, 10, 10]);
    expect(rects[1].args).toEqual([10, 0, 10, 10]);
  });

  it("Conway's Classic renders at its token's age-cap colour", () => {
    const canvas = makeCanvas(10, 10);
    const ctx = installRecordingContext2d(canvas);
    const table = buildRefToFillGroup(
      [CONWAYS_CLASSIC_ID],
      new Map([[CONWAYS_CLASSIC_ID, CONWAYS_CLASSIC]]),
    );
    const renderer = new GridRenderer(canvas, { cols: 1, rows: 1 }, table, {
      colors: COLORS,
      showGridLines: false,
    });

    renderer.drawFull(makeGrid(1, 1, [1]));

    // background write (index 0), then the sole group's colour.
    expect(ctx.fillStyleWrites[1]).toBe(displayColor('sky-blue', 7));
  });

  it('background covers the full backing store, not just the grid rectangle', () => {
    // canvas wider than the grid needs, so there is a centring margin.
    const canvas = makeCanvas(25, 10);
    const ctx = installRecordingContext2d(canvas);
    const table = lut([0], [0]);
    const renderer = new GridRenderer(canvas, { cols: 2, rows: 1 }, table, { colors: COLORS });
    ctx.calls.length = 0; // drop the constructor's setTransform call

    renderer.drawFull(makeGrid(2, 1, [0, 0]));

    expect(ctx.calls[0]).toEqual({ op: 'fillRect', args: [0, 0, 25, 10] });
  });
});

describe('grid lines', () => {
  it('draws cols+1+rows+1 bars when cellSize >= 4', () => {
    const canvas = makeCanvas(20, 10); // 2x1 -> cellSize 10
    const ctx = installRecordingContext2d(canvas);
    const renderer = new GridRenderer(canvas, { cols: 2, rows: 1 }, lut([0], [0]), {
      colors: COLORS,
      showGridLines: true,
    });

    renderer.drawFull(makeGrid(2, 1, [0, 0]));

    // 1 background fillRect + (cols+1 + rows+1) line fillRects = 1 + (3 + 2) = 6.
    const fillRects = ctx.calls.filter((c) => c.op === 'fillRect');
    expect(fillRects).toHaveLength(6);
  });

  it('draws no line bars when setGridLines(false)', () => {
    const canvas = makeCanvas(20, 10);
    const ctx = installRecordingContext2d(canvas);
    const renderer = new GridRenderer(canvas, { cols: 2, rows: 1 }, lut([0], [0]), {
      colors: COLORS,
      showGridLines: false,
    });

    renderer.drawFull(makeGrid(2, 1, [0, 0]));

    expect(ctx.calls.filter((c) => c.op === 'fillRect')).toHaveLength(1); // background only
  });

  it('draws no line bars when cellSize < 4, even with lines requested', () => {
    // 100x60 grid in a tiny 150x90 canvas -> cellSize 1.
    const canvas = makeCanvas(150, 90);
    const ctx = installRecordingContext2d(canvas);
    const organismIds = [CONWAYS_CLASSIC_ID];
    const table = buildRefToFillGroup(
      organismIds,
      new Map([[CONWAYS_CLASSIC_ID, CONWAYS_CLASSIC]]),
    );
    const renderer = new GridRenderer(canvas, { cols: 100, rows: 60 }, table, {
      colors: COLORS,
      showGridLines: true,
    });

    renderer.drawFull(makeGrid(100, 60, new Array(6000).fill(0)));

    expect(ctx.calls.filter((c) => c.op === 'fillRect')).toHaveLength(1); // background only
  });
});

describe('dimension mismatch', () => {
  it('throws with both shapes in the message when the grid disagrees with the renderer size', () => {
    const canvas = makeCanvas(20, 20);
    installRecordingContext2d(canvas);
    const renderer = new GridRenderer(canvas, { cols: 2, rows: 2 }, lut([0], [0]), {
      colors: COLORS,
    });

    const wrongShapeGrid = makeGrid(2, 3, new Array(6).fill(0));
    expect(() => renderer.drawFull(wrongShapeGrid)).toThrow(GridRendererDimensionMismatchError);
    expect(() => renderer.drawFull(wrongShapeGrid)).toThrow(/2x3/);
    expect(() => renderer.drawFull(wrongShapeGrid)).toThrow(/2x2/);
  });
});

describe('resize and setGridLines', () => {
  it('resize recomputes the layout and repaints the last grid drawn', () => {
    const canvas = makeCanvas(20, 10);
    const ctx = installRecordingContext2d(canvas);
    const renderer = new GridRenderer(canvas, { cols: 2, rows: 1 }, lut([0], [0]), {
      colors: COLORS,
    });
    renderer.drawFull(makeGrid(2, 1, [0, 0]));
    const callsAfterFirstDraw = ctx.calls.length;

    canvas.width = 40;
    canvas.height = 20;
    renderer.resize({ cols: 2, rows: 1 });

    expect(ctx.calls.length).toBeGreaterThan(callsAfterFirstDraw); // it repainted
  });

  it('resize is safe to call before any grid has been drawn', () => {
    const canvas = makeCanvas(20, 10);
    installRecordingContext2d(canvas);
    const renderer = new GridRenderer(canvas, { cols: 2, rows: 1 }, lut([0], [0]), {
      colors: COLORS,
    });
    expect(() => renderer.resize({ cols: 2, rows: 1 })).not.toThrow();
  });

  it('setGridLines(on) is a no-op repaint when the value is unchanged', () => {
    const canvas = makeCanvas(20, 10);
    const ctx = installRecordingContext2d(canvas);
    const renderer = new GridRenderer(canvas, { cols: 2, rows: 1 }, lut([0], [0]), {
      colors: COLORS,
      showGridLines: true,
    });
    renderer.drawFull(makeGrid(2, 1, [0, 0]));
    const callsAfterDraw = ctx.calls.length;

    renderer.setGridLines(true); // already true

    expect(ctx.calls.length).toBe(callsAfterDraw);
  });

  it('setGridLines(false) then true toggles line drawing on the next repaint', () => {
    const canvas = makeCanvas(20, 10);
    const ctx = installRecordingContext2d(canvas);
    const renderer = new GridRenderer(canvas, { cols: 2, rows: 1 }, lut([0], [0]), {
      colors: COLORS,
      showGridLines: true,
    });
    renderer.drawFull(makeGrid(2, 1, [0, 0]));

    renderer.setGridLines(false);
    const fillRectsAfterOff = ctx.calls.filter((c) => c.op === 'fillRect').length;

    renderer.setGridLines(true);
    const fillRectsAfterOn = ctx.calls.filter((c) => c.op === 'fillRect').length;

    expect(fillRectsAfterOn).toBeGreaterThan(fillRectsAfterOff);
  });
});
