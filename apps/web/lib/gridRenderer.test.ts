import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CONWAYS_CLASSIC, CONWAYS_CLASSIC_ID, emptyGrid, placePattern } from '@gol/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { displayColor, displayColorAt } from './displayColor';
import {
  GridRenderer,
  GridRendererContextError,
  GridRendererDimensionMismatchError,
} from './gridRenderer';
import { installRecordingContext2d } from './recordingContext2d';
import { buildRefToFillGroup, type RefToFillGroup } from './refToFillGroup';
import { toRenderableGrid, type RenderableGrid } from './renderableGrid';

// Resolved from this file's own location, not process.cwd(): cwd depends on where the runner was
// invoked from, so it would silently read the wrong path (or nothing) outside a Turbo-scoped run.
// The point of the structural check is to read the same files the imports above pull in.
const LIB_DIR = dirname(fileURLToPath(import.meta.url));

// AC3 binds the whole renderer module set, not just the class file — colourStateGroups, gridLayout,
// refToFillGroup and renderableGrid all run inside the same no-scheduling promise Epic 3 is given.
const NO_SCHEDULING_SOURCES = [
  'gridRenderer.ts',
  'colourStateGroups.ts',
  'gridLayout.ts',
  'refToFillGroup.ts',
  'renderableGrid.ts',
];
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

  it.each(NO_SCHEDULING_SOURCES)(
    '%s contains no scheduling primitive at all (structural, belt-and-braces)',
    (file) => {
      const source = readFileSync(join(LIB_DIR, file), 'utf8');
      expect(source).not.toMatch(/requestAnimationFrame|setTimeout|setInterval|queueMicrotask/);
    },
  );

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
    // Two DISTINCT tokens, so this pins the ordering across the group loop rather than around a
    // single degenerate group: every group must be drawn before any grid line.
    const table = lut([0, 5, 9], [0, 0, 0]);
    const renderer = new GridRenderer(canvas, { cols: 2, rows: 1 }, table, { colors: COLORS });
    ctx.calls.length = 0; // drop the constructor's setTransform call — only drawFull's log matters here

    renderer.drawFull(makeGrid(2, 1, [1, 2]));

    const ops = ctx.calls.map((call) => call.op);
    const lastFillIndex = ops.lastIndexOf('fill');

    expect(ops.indexOf('fillRect')).toBe(0); // background first
    expect(ops.indexOf('beginPath')).toBeGreaterThan(0);
    expect(lastFillIndex).toBeGreaterThan(ops.indexOf('beginPath'));
    expect(ops.indexOf('fillRect', 1)).toBeGreaterThan(lastFillIndex); // grid lines last
  });

  it('emits exactly one beginPath, one fill, and one fillStyle write per group', () => {
    const canvas = makeCanvas(20, 10);
    const ctx = installRecordingContext2d(canvas);
    // TWO groups, deliberately. With a single group these counts cannot tell "once per group"
    // from "once per draw", so hoisting beginPath/fillStyle/fill out of the group loop — the
    // O(n^2) "last organism's colour wins" defect — would pass unnoticed (review 2026-08-06).
    const table = lut([0, 5, 9], [0, 0, 0]);
    // Grid lines off: isolates the batching call counts from the separate grid-line fillStyle
    // write, which would otherwise also land in fillStyleWrites and muddy this assertion.
    const renderer = new GridRenderer(canvas, { cols: 2, rows: 1 }, table, {
      colors: COLORS,
      showGridLines: false,
    });

    renderer.drawFull(makeGrid(2, 1, [1, 2]));

    expect(ctx.calls.filter((c) => c.op === 'beginPath')).toHaveLength(2);
    expect(ctx.calls.filter((c) => c.op === 'fill')).toHaveLength(2);
    // fillStyleWrites[0] is the background write; exactly one more per cell group.
    expect(ctx.fillStyleWrites).toHaveLength(3);
  });

  it('gives each group its own colour, written in ascending groupId order', () => {
    const canvas = makeCanvas(20, 10);
    const ctx = installRecordingContext2d(canvas);
    const table = lut([0, 9, 5], [0, 0, 0]); // ref 1 -> token 9, ref 2 -> token 5
    const renderer = new GridRenderer(canvas, { cols: 2, rows: 1 }, table, {
      colors: COLORS,
      showGridLines: false,
    });

    renderer.drawFull(makeGrid(2, 1, [1, 2]));

    // Token 5 sorts before token 9 by groupId (tokenIndex * 8 + shade) regardless of the order
    // the refs appear in the grid — that determinism is what makes these call logs stable.
    expect(ctx.fillStyleWrites.slice(1)).toEqual([displayColorAt(5, 7), displayColorAt(9, 7)]);
  });

  it('two organisms sharing a colorToken yield one fillStyle write, not two (Decision B.2)', () => {
    function fillStyleWritesFor(tokenIndex: number[]) {
      const canvas = makeCanvas(20, 10);
      const ctx = installRecordingContext2d(canvas);
      const renderer = new GridRenderer(canvas, { cols: 2, rows: 1 }, lut(tokenIndex, [0, 0, 0]), {
        colors: COLORS,
        showGridLines: false,
      });
      renderer.drawFull(makeGrid(2, 1, [1, 2]));
      return ctx.fillStyleWrites;
    }

    // background + exactly one group colour: the two refs fold into one group.
    expect(fillStyleWritesFor([0, 5, 5])).toHaveLength(2);
    // The control, without which the assertion above is equally satisfied by a renderer that only
    // ever emits one write: two DIFFERENT tokens on the same grid must produce two.
    expect(fillStyleWritesFor([0, 5, 9])).toHaveLength(3);
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

  it('renders a @gol/test-utils fixture carried through toRenderableGrid (AR-5)', () => {
    // The dense at-rest shape a battle actually persists, through the Task 1 adapter, into the
    // renderer — the seam Story 1.11 will use. Hand-rolled typed arrays never exercise it.
    const dense = placePattern(emptyGrid(4, 2), [[1]], 1, 1);
    const grid = toRenderableGrid(dense);
    const canvas = makeCanvas(40, 20); // 4x2 -> cellSize 10
    const ctx = installRecordingContext2d(canvas);
    const renderer = new GridRenderer(canvas, { cols: 4, rows: 2 }, lut([0, 3], [0, 0]), {
      colors: COLORS,
      showGridLines: false,
    });

    renderer.drawFull(grid);

    // placePattern put a single live cell at (col 1, row 1) -> device px (10, 10).
    expect(ctx.calls.filter((c) => c.op === 'rect').map((c) => c.args)).toEqual([[10, 10, 10, 10]]);
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

  it('confines the closing bars inside the grid rectangle instead of one pixel past it', () => {
    // The grid fills this canvas exactly (originX/originY are 0), which is where the bug bites:
    // a right border drawn at x = drawWidth lands at x = canvas.width and fillRect clips it away
    // entirely, leaving a dish with a left and top border and no right or bottom one.
    const canvas = makeCanvas(20, 10); // 2x1 -> cellSize 10, drawWidth 20, drawHeight 10
    const ctx = installRecordingContext2d(canvas);
    const renderer = new GridRenderer(canvas, { cols: 2, rows: 1 }, lut([0], [0]), {
      colors: COLORS,
      showGridLines: true,
    });

    renderer.drawFull(makeGrid(2, 1, [0, 0]));

    const bars = ctx.calls.filter((c) => c.op === 'fillRect').slice(1); // drop the background
    expect(bars.map((b) => b.args)).toEqual([
      [0, 0, 1, 10],
      [10, 0, 1, 10],
      [19, 0, 1, 10], // right border pulled back inside, not x=20
      [0, 0, 20, 1],
      [0, 9, 20, 1], // bottom border pulled back inside, not y=10
    ]);
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

  it('throws when the buffer lengths disagree with the declared dimensions', () => {
    const canvas = makeCanvas(20, 20);
    installRecordingContext2d(canvas);
    const renderer = new GridRenderer(canvas, { cols: 2, rows: 2 }, lut([0], [0]), {
      colors: COLORS,
    });

    // Dimensions agree, so this reaches the second check — the one a width/height mismatch
    // short-circuits past. A short occupant reads garbage off the end of the typed array.
    const shortOccupant: RenderableGrid = {
      width: 2,
      height: 2,
      occupant: Uint8Array.from([0, 0, 0]),
      age: new Uint16Array(4),
    };
    expect(() => renderer.drawFull(shortOccupant)).toThrow(GridRendererDimensionMismatchError);

    const shortAge: RenderableGrid = {
      width: 2,
      height: 2,
      occupant: new Uint8Array(4),
      age: new Uint16Array(3),
    };
    expect(() => renderer.drawFull(shortAge)).toThrow(GridRendererDimensionMismatchError);
  });
});

describe('resize and setGridLines', () => {
  it('resize recomputes the layout and repaints the last grid at the new cell size', () => {
    const canvas = makeCanvas(20, 10);
    const ctx = installRecordingContext2d(canvas);
    const renderer = new GridRenderer(canvas, { cols: 2, rows: 1 }, lut([0, 3], [0, 0]), {
      colors: COLORS,
      showGridLines: false,
    });
    renderer.drawFull(makeGrid(2, 1, [1, 1]));
    expect(ctx.calls.filter((c) => c.op === 'rect').map((c) => c.args)).toEqual([
      [0, 0, 10, 10],
      [10, 0, 10, 10],
    ]);

    ctx.calls.length = 0;
    canvas.width = 40;
    canvas.height = 20;
    renderer.resize({ cols: 2, rows: 1 });

    // Assert the NEW geometry reaches the rects — cellSize doubles to 20. Counting calls only
    // proves "something happened", which any no-op repaint would also satisfy.
    expect(ctx.calls.filter((c) => c.op === 'rect').map((c) => c.args)).toEqual([
      [0, 0, 20, 20],
      [20, 0, 20, 20],
    ]);
  });

  it('setGridLines after a dimension-changing resize does not throw on the stale grid', () => {
    const canvas = makeCanvas(20, 10);
    installRecordingContext2d(canvas);
    const renderer = new GridRenderer(canvas, { cols: 2, rows: 1 }, lut([0, 3], [0, 0]), {
      colors: COLORS,
      showGridLines: true,
    });
    renderer.drawFull(makeGrid(2, 1, [1, 1]));

    // A grid-dimension change (Story 2.14): resize skips the repaint AND drops the now-invalid
    // grid. Keeping it would make this toggle throw a dimension mismatch out of a UI handler.
    renderer.resize({ cols: 4, rows: 2 });

    expect(() => renderer.setGridLines(false)).not.toThrow();
  });

  it('does not compound devicePixelRatio across repeated resizes when the canvas has no CSS box', () => {
    const original = window.devicePixelRatio;
    Object.defineProperty(window, 'devicePixelRatio', { value: 2, configurable: true });
    try {
      // clientWidth/clientHeight are 0 for this unattached canvas — the fallback path.
      const canvas = makeCanvas(100, 50);
      installRecordingContext2d(canvas);
      const renderer = new GridRenderer(canvas, { cols: 10, rows: 5 }, lut([0], [0]), {
        colors: COLORS,
      });
      expect([canvas.width, canvas.height]).toEqual([200, 100]);

      renderer.resize({ cols: 10, rows: 5 });
      renderer.resize({ cols: 10, rows: 5 });
      renderer.resize({ cols: 10, rows: 5 });

      // Still 2x the CSS box, not 2^4x it. Reading canvas.width back as CSS px would give 1600.
      expect([canvas.width, canvas.height]).toEqual([200, 100]);
    } finally {
      Object.defineProperty(window, 'devicePixelRatio', { value: original, configurable: true });
    }
  });

  it('treats a zero or non-finite devicePixelRatio as 1 rather than collapsing the backing store', () => {
    const original = window.devicePixelRatio;
    Object.defineProperty(window, 'devicePixelRatio', { value: 0, configurable: true });
    try {
      const canvas = makeCanvas(20, 10);
      installRecordingContext2d(canvas);
      new GridRenderer(canvas, { cols: 2, rows: 1 }, lut([0], [0]), { colors: COLORS });

      expect([canvas.width, canvas.height]).toEqual([20, 10]);
    } finally {
      Object.defineProperty(window, 'devicePixelRatio', { value: original, configurable: true });
    }
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
