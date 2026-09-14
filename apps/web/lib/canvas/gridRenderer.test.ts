import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CONWAYS_CLASSIC, CONWAYS_CLASSIC_ID, emptyGrid, placePattern } from '@gol/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { displayColor, displayColorAt } from '../palette/displayColor';
import { DirtyCellRangeError } from './dirtyCells';
import {
  GridRenderer,
  GridRendererContextError,
  GridRendererDimensionMismatchError,
} from './gridRenderer';
import {
  installRecordingContext2d,
  installRecordingContexts,
} from '@/test-support/recordingContext2d';
import { buildRefToFillGroup, type RefToFillGroup } from './refToFillGroup';
import { toRenderableGrid, type RenderableGrid } from './renderableGrid';

// Resolved from this file's own location, not process.cwd(): cwd depends on where the runner was
// invoked from, so it would silently read the wrong path (or nothing) outside a Turbo-scoped run.
// The point of the structural check is to read the same files the imports above pull in.
const CANVAS_DIR = dirname(fileURLToPath(import.meta.url));

// AC3 binds the whole renderer module set, not just the class file — colourStateGroups, gridLayout,
// refToFillGroup and renderableGrid all run inside the same no-scheduling promise Epic 3 is given.
const NO_SCHEDULING_SOURCES = [
  'gridRenderer.ts',
  'colourStateGroups.ts',
  'dirtyCells.ts',
  'gridLayout.ts',
  'refToFillGroup.ts',
  'renderableGrid.ts',
  'playbackRenderer.ts',
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
    // Story 2.3 grew the surface — markDirty and draw run inside the same promise (AC3).
    renderer.markDirty([{ col: 0, row: 0 }]);
    renderer.draw(makeGrid(2, 1, [0, 1]));
    // Story 3.9 grows it again — drawDiff is the playback repaint (AC3).
    renderer.drawDiff(makeGrid(2, 1, [1, 0]));
    renderer.resize({ cols: 2, rows: 1 });
    renderer.setGridLines(false);

    expect(rafSpy).not.toHaveBeenCalled();
    expect(timeoutSpy).not.toHaveBeenCalled();
    expect(intervalSpy).not.toHaveBeenCalled();
  });

  it.each(NO_SCHEDULING_SOURCES)(
    '%s contains no scheduling primitive at all (structural, belt-and-braces)',
    (file) => {
      const source = readFileSync(join(CANVAS_DIR, file), 'utf8');
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
    // The dirty path reads occupant/age and writes a SEPARATE colour-state buffer. A dev who
    // wrote that state back into grid.age would pass every other test in this file.
    renderer.markDirty([
      { col: 0, row: 0 },
      { col: 1, row: 0 },
    ]);
    renderer.draw(grid);
    renderer.drawDiff(grid);
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

  it('owns no scheduling state — the same markDirty/draw sweep produces identical call logs', () => {
    const table = lut([0, 5, 9], [1, 1, 1]);

    function sweep() {
      const canvas = makeCanvas(20, 10);
      const double = installRecordingContext2d(canvas);
      const renderer = new GridRenderer(canvas, { cols: 2, rows: 1 }, table, { colors: COLORS });
      renderer.drawFull(makeGrid(2, 1, [0, 0]));
      renderer.markDirty([
        { col: 1, row: 0 },
        { col: 0, row: 0 },
      ]);
      renderer.draw(makeGrid(2, 1, [1, 2]));
      return double;
    }

    const doubleA = sweep();
    const doubleB = sweep();

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

// ---------------------------------------------------------------------------------------------
// Story 2.3 — dirty-region editing paths
// ---------------------------------------------------------------------------------------------

// cols=2, rows=1 in a 20x10 canvas -> cellSize 10, origin (0,0), grid lines visible.
const DIRTY_TABLE = lut([0, 5, 9], [1, 1, 1]);

function primedRenderer(options?: { showGridLines?: boolean }) {
  const canvas = makeCanvas(20, 10);
  const ctx = installRecordingContext2d(canvas);
  const renderer = new GridRenderer(canvas, { cols: 2, rows: 1 }, DIRTY_TABLE, {
    colors: COLORS,
    showGridLines: options?.showGridLines ?? true,
  });
  renderer.drawFull(makeGrid(2, 1, [0, 0]));
  ctx.calls.length = 0;
  ctx.fillStyleWrites.length = 0;
  return { canvas, ctx, renderer };
}

describe('markDirty — AC2: accumulates between draws, and paints nothing', () => {
  it('touches neither the context nor the fillStyle log', () => {
    const { ctx, renderer } = primedRenderer();

    renderer.markDirty([
      { col: 0, row: 0 },
      { col: 1, row: 0 },
    ]);

    expect(ctx.calls).toHaveLength(0);
    expect(ctx.fillStyleWrites).toHaveLength(0);
  });

  it('is idempotent for a repeated cell — one repaint, not one per mark', () => {
    const { ctx, renderer } = primedRenderer({ showGridLines: false });

    renderer.markDirty([{ col: 0, row: 0 }]);
    renderer.markDirty([{ col: 0, row: 0 }]);
    renderer.markDirty([{ col: 0, row: 0 }]);
    renderer.draw(makeGrid(2, 1, [1, 0]));

    expect(ctx.calls.filter((c) => c.op === 'fillRect')).toHaveLength(1); // one background cell
    expect(ctx.calls.filter((c) => c.op === 'rect')).toHaveLength(1);
  });

  it('is a no-op for an empty iterable', () => {
    const { ctx, renderer } = primedRenderer();

    renderer.markDirty([]);
    renderer.draw(makeGrid(2, 1, [1, 0]));

    expect(ctx.calls).toHaveLength(0);
  });

  it('throws on a coord outside the renderer size rather than marking a wrapped cell', () => {
    const { renderer } = primedRenderer();
    expect(() => renderer.markDirty([{ col: 2, row: 0 }])).toThrow(DirtyCellRangeError);
  });

  it('is legal before any draw, and those marks are consumed by the first drawFull', () => {
    const canvas = makeCanvas(20, 10);
    const ctx = installRecordingContext2d(canvas);
    const renderer = new GridRenderer(canvas, { cols: 2, rows: 1 }, DIRTY_TABLE, {
      colors: COLORS,
      showGridLines: false,
    });

    expect(() => renderer.markDirty([{ col: 0, row: 0 }])).not.toThrow();
    renderer.drawFull(makeGrid(2, 1, [1, 0]));
    ctx.calls.length = 0;

    renderer.draw(makeGrid(2, 1, [1, 0])); // marks already consumed, nothing changed
    expect(ctx.calls).toHaveLength(0);
  });
});

describe('draw — AC1/AC4: repaints only what changed', () => {
  it('repaints ONE region, not the full grid, for a single-cell change (AC4)', () => {
    // The control: a 100x60 drawFull with every cell occupied.
    const fullCanvas = makeCanvas(100, 60); // cellSize 1 -> grid lines suppressed, no line noise
    const fullCtx = installRecordingContext2d(fullCanvas);
    const fullRenderer = new GridRenderer(fullCanvas, { cols: 100, rows: 60 }, DIRTY_TABLE, {
      colors: COLORS,
    });
    fullRenderer.drawFull(makeGrid(100, 60, new Array(6000).fill(1)));
    expect(fullCtx.calls.filter((c) => c.op === 'rect')).toHaveLength(6000);

    // The dirty path, same size: one cell painted.
    const canvas = makeCanvas(100, 60);
    const ctx = installRecordingContext2d(canvas);
    const renderer = new GridRenderer(canvas, { cols: 100, rows: 60 }, DIRTY_TABLE, {
      colors: COLORS,
    });
    renderer.drawFull(makeGrid(100, 60, new Array(6000).fill(0)));
    ctx.calls.length = 0;
    ctx.fillStyleWrites.length = 0;

    const painted = new Array(6000).fill(0);
    painted[42 * 100 + 17] = 1;
    renderer.markDirty([{ col: 17, row: 42 }]);
    renderer.draw(makeGrid(100, 60, painted));

    expect(ctx.calls.filter((c) => c.op === 'rect')).toHaveLength(1);
    expect(ctx.calls.filter((c) => c.op === 'fillRect')).toHaveLength(1); // the cell background
    expect(ctx.fillStyleWrites).toHaveLength(2); // background + one colour group
  });

  it('paints background, then the cell colour, then the grid lines crossing it', () => {
    const { ctx, renderer } = primedRenderer();

    renderer.markDirty([{ col: 0, row: 0 }]);
    renderer.draw(makeGrid(2, 1, [1, 0]));

    expect(ctx.calls).toEqual([
      { op: 'fillRect', args: [0, 0, 10, 10] }, // (a) cell background
      { op: 'beginPath', args: [] }, // (b) the one colour group
      { op: 'rect', args: [0, 0, 10, 10] },
      { op: 'fill', args: [] },
      { op: 'fillRect', args: [0, 0, 1, 10] }, // (c) left bar
      { op: 'fillRect', args: [10, 0, 1, 10] }, // right bar
      { op: 'fillRect', args: [0, 0, 10, 1] }, // top bar
      { op: 'fillRect', args: [0, 9, 10, 1] }, // bottom bar, pulled back inside the rectangle
    ]);
    expect(ctx.fillStyleWrites).toEqual([COLORS.background, displayColorAt(5, 0), COLORS.gridLine]);
  });

  it('is a complete no-op when no marks are outstanding', () => {
    const { ctx, renderer } = primedRenderer();

    renderer.draw(makeGrid(2, 1, [1, 1])); // a genuinely different grid, but nothing marked

    expect(ctx.calls).toHaveLength(0);
    expect(ctx.fillStyleWrites).toHaveLength(0);
  });

  it("is a complete no-op when a marked cell's colour state did not change", () => {
    const { ctx, renderer } = primedRenderer();

    renderer.markDirty([{ col: 0, row: 0 }]); // erasing an already-empty cell (Story 2.7)
    renderer.draw(makeGrid(2, 1, [0, 0]));

    expect(ctx.calls).toHaveLength(0);
    expect(ctx.fillStyleWrites).toHaveLength(0);
  });

  it('consumes the marks, so a second identical draw does nothing', () => {
    const { ctx, renderer } = primedRenderer();
    const grid = makeGrid(2, 1, [1, 0]);

    renderer.markDirty([{ col: 0, row: 0 }]);
    renderer.draw(grid);
    const callsAfterFirst = ctx.calls.length;

    renderer.draw(grid);
    expect(ctx.calls).toHaveLength(callsAfterFirst);
  });

  it('repaints the background for an erased cell and paints no colour for it', () => {
    const canvas = makeCanvas(20, 10);
    const ctx = installRecordingContext2d(canvas);
    const renderer = new GridRenderer(canvas, { cols: 2, rows: 1 }, DIRTY_TABLE, {
      colors: COLORS,
      showGridLines: false,
    });
    renderer.drawFull(makeGrid(2, 1, [1, 0]));
    ctx.calls.length = 0;
    ctx.fillStyleWrites.length = 0;

    renderer.markDirty([{ col: 0, row: 0 }]);
    renderer.draw(makeGrid(2, 1, [0, 0]));

    expect(ctx.calls).toEqual([{ op: 'fillRect', args: [0, 0, 10, 10] }]);
    expect(ctx.fillStyleWrites).toEqual([COLORS.background]);
  });

  it('erases a cell AND restores its grid lines together, when lines are visible (silent-failure trap #1)', () => {
    // Every other erase test in this file uses showGridLines: false, and every other line-
    // restoration test uses an occupied cell — this is the one place the two combine (review
    // finding, Story 2.3): erasing a cell while grid lines are on screen is exactly the scenario
    // "(c) is not optional" in paintDirtyCells exists to protect.
    const canvas = makeCanvas(20, 10);
    const ctx = installRecordingContext2d(canvas);
    const renderer = new GridRenderer(canvas, { cols: 2, rows: 1 }, DIRTY_TABLE, {
      colors: COLORS,
      showGridLines: true,
    });
    renderer.drawFull(makeGrid(2, 1, [1, 0]));
    ctx.calls.length = 0;
    ctx.fillStyleWrites.length = 0;

    renderer.markDirty([{ col: 0, row: 0 }]);
    renderer.draw(makeGrid(2, 1, [0, 0]));

    expect(ctx.calls).toEqual([
      { op: 'fillRect', args: [0, 0, 10, 10] }, // (a) cell background — no colour group follows
      { op: 'fillRect', args: [0, 0, 1, 10] }, // (c) left bar
      { op: 'fillRect', args: [10, 0, 1, 10] }, // right bar
      { op: 'fillRect', args: [0, 0, 10, 1] }, // top bar
      { op: 'fillRect', args: [0, 9, 10, 1] }, // bottom bar, pulled back inside the rectangle
    ]);
    expect(ctx.fillStyleWrites).toEqual([COLORS.background, COLORS.gridLine]);
  });

  it('batches surviving cells by colour state — one beginPath/fill/fillStyle per group', () => {
    const { ctx, renderer } = primedRenderer({ showGridLines: false });

    renderer.markDirty([
      { col: 0, row: 0 },
      { col: 1, row: 0 },
    ]);
    renderer.draw(makeGrid(2, 1, [1, 1])); // both cells the same organism -> one group

    expect(ctx.calls.filter((c) => c.op === 'beginPath')).toHaveLength(1);
    expect(ctx.calls.filter((c) => c.op === 'fill')).toHaveLength(1);
    expect(ctx.fillStyleWrites).toHaveLength(2); // background + one group

    // The control: two DIFFERENT tokens must produce two groups, or the assertion above is
    // equally satisfied by a path that never opens more than one. A fresh renderer, because the
    // one above has already drawn ref 1 into cell 0 — that cell's colour state is now unchanged
    // and would (correctly) drop out of the dirty set.
    const control = primedRenderer({ showGridLines: false });
    control.renderer.markDirty([
      { col: 0, row: 0 },
      { col: 1, row: 0 },
    ]);
    control.renderer.draw(makeGrid(2, 1, [1, 2]));

    expect(control.ctx.calls.filter((c) => c.op === 'beginPath')).toHaveLength(2);
    expect(control.ctx.calls.filter((c) => c.op === 'fill')).toHaveLength(2);
    expect(control.ctx.fillStyleWrites).toHaveLength(3);
  });

  it('rejects a mis-shaped grid before touching the context', () => {
    const { ctx, renderer } = primedRenderer();
    renderer.markDirty([{ col: 0, row: 0 }]);

    expect(() => renderer.draw(makeGrid(2, 3, new Array(6).fill(0)))).toThrow(
      GridRendererDimensionMismatchError,
    );
    expect(ctx.calls).toHaveLength(0);
  });

  it('falls back to a FULL repaint when no baseline has been primed yet', () => {
    const canvas = makeCanvas(20, 10);
    const ctx = installRecordingContext2d(canvas);
    const renderer = new GridRenderer(canvas, { cols: 2, rows: 1 }, DIRTY_TABLE, {
      colors: COLORS,
      showGridLines: false,
    });
    ctx.calls.length = 0;

    renderer.draw(makeGrid(2, 1, [1, 1])); // no drawFull ever happened

    // The full-backing-store background fill is the tell — the dirty path only ever fills cells.
    expect(ctx.calls[0]).toEqual({ op: 'fillRect', args: [0, 0, 20, 10] });
    expect(ctx.calls.filter((c) => c.op === 'rect')).toHaveLength(2);
  });
});

describe('drawFull / renderStatic divergence — Story 2.3 Task 4', () => {
  it('drawFull resets outstanding marks and re-primes the baseline', () => {
    const { ctx, renderer } = primedRenderer();

    renderer.markDirty([{ col: 0, row: 0 }]);
    renderer.drawFull(makeGrid(2, 1, [1, 0]));
    ctx.calls.length = 0;

    renderer.draw(makeGrid(2, 1, [1, 0]));
    expect(ctx.calls).toHaveLength(0);
  });

  it('renderStatic retains no grid — a later resize repaints nothing', () => {
    const canvas = makeCanvas(20, 10);
    const ctx = installRecordingContext2d(canvas);
    const renderer = new GridRenderer(canvas, { cols: 2, rows: 1 }, DIRTY_TABLE, {
      colors: COLORS,
    });

    renderer.renderStatic(makeGrid(2, 1, [1, 1]));
    ctx.calls.length = 0;
    renderer.resize({ cols: 2, rows: 1 });

    // A static surface re-layouts by reconstruction, not repaint (Story 2.3 forced decision 4).
    expect(ctx.calls.filter((c) => c.op === 'fillRect' || c.op === 'rect')).toHaveLength(0);
  });

  it('renderStatic primes no dirty state — a following draw full-repaints instead', () => {
    const canvas = makeCanvas(20, 10);
    const ctx = installRecordingContext2d(canvas);
    const renderer = new GridRenderer(canvas, { cols: 2, rows: 1 }, DIRTY_TABLE, {
      colors: COLORS,
      showGridLines: false,
    });

    renderer.renderStatic(makeGrid(2, 1, [1, 0]));
    ctx.calls.length = 0;
    renderer.markDirty([{ col: 1, row: 0 }]);
    renderer.draw(makeGrid(2, 1, [1, 1]));

    expect(ctx.calls[0]).toEqual({ op: 'fillRect', args: [0, 0, 20, 10] }); // full background
  });

  it('resize drops marks accumulated at the old geometry', () => {
    const { ctx, renderer } = primedRenderer();

    renderer.markDirty([{ col: 0, row: 0 }]);
    renderer.resize({ cols: 2, rows: 1 }); // repaints the whole surface at the new layout
    ctx.calls.length = 0;

    renderer.draw(makeGrid(2, 1, [0, 0]));
    expect(ctx.calls).toHaveLength(0);
  });

  it('a dimension-changing resize drops the colour-state buffer with the grid', () => {
    const canvas = makeCanvas(40, 20);
    const ctx = installRecordingContext2d(canvas);
    const renderer = new GridRenderer(canvas, { cols: 2, rows: 1 }, DIRTY_TABLE, {
      colors: COLORS,
      showGridLines: false,
    });
    renderer.drawFull(makeGrid(2, 1, [1, 1]));

    renderer.resize({ cols: 4, rows: 2 }); // Story 2.14's grid-dimension change
    ctx.calls.length = 0;

    // A stale 2-entry baseline would mis-index every comparison against an 8-cell grid; dropping
    // it makes the next draw a full repaint instead.
    expect(() => renderer.draw(makeGrid(4, 2, new Array(8).fill(1)))).not.toThrow();
    expect(ctx.calls[0]).toEqual({ op: 'fillRect', args: [0, 0, 40, 20] });
  });

  it('setGridLines resets dirty state along with its repaint', () => {
    const { ctx, renderer } = primedRenderer();

    renderer.markDirty([{ col: 0, row: 0 }]);
    renderer.setGridLines(false);
    ctx.calls.length = 0;

    renderer.draw(makeGrid(2, 1, [0, 0]));
    expect(ctx.calls).toHaveLength(0);
  });
});

describe('grid-line overlay cache — Story 2.3 Task 5', () => {
  it('takes the drawImage branch when an offscreen context is available', () => {
    const canvas = makeCanvas(20, 10);
    const { context: ctx, offscreenContexts } = installRecordingContexts(canvas, {
      offscreen: true,
    });
    const renderer = new GridRenderer(canvas, { cols: 2, rows: 1 }, DIRTY_TABLE, {
      colors: COLORS,
      showGridLines: true,
    });

    renderer.drawFull(makeGrid(2, 1, [0, 0]));

    expect(offscreenContexts).toHaveLength(1);
    // The bars went into the OVERLAY, not the main context: cols+1 + rows+1 = 5.
    expect(offscreenContexts[0].calls.filter((c) => c.op === 'fillRect')).toHaveLength(5);
    // The main context sees one background fillRect and one drawImage of the cached overlay.
    expect(ctx.calls.filter((c) => c.op === 'fillRect')).toHaveLength(1);
    expect(ctx.calls.filter((c) => c.op === 'drawImage')).toHaveLength(1);
  });

  it('reuses the cached overlay by identity across an unchanged-layout resize', () => {
    const canvas = makeCanvas(20, 10);
    const { context: ctx } = installRecordingContexts(canvas, { offscreen: true });
    const renderer = new GridRenderer(canvas, { cols: 2, rows: 1 }, DIRTY_TABLE, {
      colors: COLORS,
      showGridLines: true,
    });
    renderer.drawFull(makeGrid(2, 1, [0, 0]));
    const createElement = vi.spyOn(document, 'createElement');

    renderer.resize({ cols: 2, rows: 1 }); // same box, same layout -> nothing to rebuild
    renderer.resize({ cols: 2, rows: 1 });

    expect(createElement).not.toHaveBeenCalled();
    const overlays = ctx.calls.filter((c) => c.op === 'drawImage').map((c) => c.args[0]);
    expect(overlays.length).toBeGreaterThan(1);
    expect(new Set(overlays).size).toBe(1); // literally the same canvas object every time
  });

  it('rebuilds the overlay when the layout genuinely changes', () => {
    const canvas = makeCanvas(20, 10);
    const { context: ctx } = installRecordingContexts(canvas, { offscreen: true });
    const renderer = new GridRenderer(canvas, { cols: 2, rows: 1 }, DIRTY_TABLE, {
      colors: COLORS,
      showGridLines: true,
    });
    renderer.drawFull(makeGrid(2, 1, [0, 0]));

    canvas.width = 40;
    canvas.height = 20;
    renderer.resize({ cols: 2, rows: 1 }); // cellSize 10 -> 20

    const overlays = ctx.calls.filter((c) => c.op === 'drawImage').map((c) => c.args[0]);
    expect(new Set(overlays).size).toBe(2);
  });
});

// ---------------------------------------------------------------------------------------------
// Story 3.9 — the playback repaint
// ---------------------------------------------------------------------------------------------

describe('drawDiff — the playback repaint (Story 3.9)', () => {
  it('repaints ONLY the changed cells of a 100x60 grid, with NO marks (AC1/AC4)', () => {
    const canvas = makeCanvas(100, 60);
    const ctx = installRecordingContext2d(canvas);
    const renderer = new GridRenderer(canvas, { cols: 100, rows: 60 }, DIRTY_TABLE, {
      colors: COLORS,
      showGridLines: false, // so the only fillRect below is the cell's own background
    });
    renderer.drawFull(makeGrid(100, 60, new Array(6000).fill(0)));
    ctx.calls.length = 0;
    ctx.fillStyleWrites.length = 0;

    const painted = new Array(6000).fill(0);
    painted[42 * 100 + 17] = 1;
    // Deliberately no markDirty() — drawDiff derives its own candidates from the whole grid.
    renderer.drawDiff(makeGrid(100, 60, painted));

    // A 100x60 canvas for a 100x60 grid: 1px cells at origin (0, 0), so the changed cell
    // (col 17, row 42) is the pixel at (17, 42) — WHICH cell, not just how many.
    expect(ctx.calls.filter((c) => c.op === 'rect')).toEqual([
      { op: 'rect', args: [17, 42, 1, 1] },
    ]);
    expect(ctx.calls.filter((c) => c.op === 'fillRect')).toEqual([
      { op: 'fillRect', args: [17, 42, 1, 1] }, // the cell background
    ]);
    expect(ctx.fillStyleWrites).toHaveLength(2); // background + one colour group
  });

  it('a still-life frame — same content, a NEW grid object — touches the context zero times', () => {
    const { ctx, renderer } = primedRenderer();

    renderer.drawDiff(makeGrid(2, 1, [0, 0])); // primedRenderer already drew [0, 0]; same content

    expect(ctx.calls).toHaveLength(0);
    expect(ctx.fillStyleWrites).toHaveLength(0);
  });

  it('an erased cell gets background + line restoration, and no colour', () => {
    const canvas = makeCanvas(20, 10);
    const ctx = installRecordingContext2d(canvas);
    const renderer = new GridRenderer(canvas, { cols: 2, rows: 1 }, DIRTY_TABLE, {
      colors: COLORS,
      showGridLines: true,
    });
    renderer.drawFull(makeGrid(2, 1, [1, 0]));
    ctx.calls.length = 0;
    ctx.fillStyleWrites.length = 0;

    renderer.drawDiff(makeGrid(2, 1, [0, 0]));

    expect(ctx.calls).toEqual([
      { op: 'fillRect', args: [0, 0, 10, 10] }, // (a) cell background — no colour group follows
      { op: 'fillRect', args: [0, 0, 1, 10] }, // (c) left bar
      { op: 'fillRect', args: [10, 0, 1, 10] }, // right bar
      { op: 'fillRect', args: [0, 0, 10, 1] }, // top bar
      { op: 'fillRect', args: [0, 9, 10, 1] }, // bottom bar, pulled back inside the rectangle
    ]);
    expect(ctx.fillStyleWrites).toEqual([COLORS.background, COLORS.gridLine]);
  });

  it('batches a mixed frame by colour state — one beginPath/fill/fillStyle per group, ascending groupId (AC4)', () => {
    const { ctx, renderer } = primedRenderer({ showGridLines: false });

    renderer.drawDiff(makeGrid(2, 1, [1, 1])); // both cells the same organism -> one group

    expect(ctx.calls.filter((c) => c.op === 'beginPath')).toHaveLength(1);
    expect(ctx.calls.filter((c) => c.op === 'fill')).toHaveLength(1);
    expect(ctx.fillStyleWrites).toHaveLength(2); // background + one group

    // The control: two DIFFERENT tokens must produce two groups, in ascending groupId order —
    // ref 2 (token 9) placed at index 0 and ref 1 (token 5) at index 1, so first-seen order is
    // the REVERSE of groupId order and only a real sort produces the expected sequence.
    const control = primedRenderer({ showGridLines: false });
    control.renderer.drawDiff(makeGrid(2, 1, [2, 1]));

    expect(control.ctx.calls.filter((c) => c.op === 'beginPath')).toHaveLength(2);
    expect(control.ctx.calls.filter((c) => c.op === 'fill')).toHaveLength(2);
    // DIRTY_TABLE has aging ON for every ref, and makeGrid defaults age to 0 -> shade 0.
    expect(control.ctx.fillStyleWrites.slice(1)).toEqual([
      displayColorAt(5, 0),
      displayColorAt(9, 0),
    ]);
  });

  it('a 255-ref LUT folded onto 20 tokens x 8 shades yields <= 160 fillStyle colour writes (AC4 bound)', () => {
    // The roster is at the 255-organism cap (Decision G.3/M6) but the palette has only 20 tokens
    // x 8 age shades — the bound is the PALETTE, never the roster (AC4).
    const ROSTER_SIZE = 255;
    const tokenIndex = new Uint8Array(ROSTER_SIZE + 1);
    const aging = new Uint8Array(ROSTER_SIZE + 1);
    for (let ref = 1; ref <= ROSTER_SIZE; ref++) {
      tokenIndex[ref] = (ref - 1) % 20;
      aging[ref] = 1; // every organism aging, so age drives the shade directly
    }
    const table: RefToFillGroup = { tokenIndex, aging, size: ROSTER_SIZE + 1 };

    const cols = 100;
    const rows = 60;
    const cellCount = cols * rows;
    const occupant = new Array<number>(cellCount);
    const age = new Array<number>(cellCount);
    const expectedGroups = new Set<number>();
    for (let index = 0; index < cellCount; index++) {
      const ref = (index % ROSTER_SIZE) + 1;
      const shade = index % 8;
      occupant[index] = ref;
      age[index] = shade;
      expectedGroups.add(tokenIndex[ref] * 8 + shade);
    }
    // lcm(255, 8) = 2040 < 6000, so every (ref, shade) pair occurs and the palette bound is
    // actually REACHED — a folding bug that produced 159 groups would fail the equality below.
    expect(expectedGroups.size).toBe(160);

    const canvas = makeCanvas(cols, rows);
    const ctx = installRecordingContext2d(canvas);
    const renderer = new GridRenderer(canvas, { cols, rows }, table, {
      colors: COLORS,
      showGridLines: false,
    });
    renderer.drawFull(makeGrid(cols, rows, new Array(cellCount).fill(0)));
    ctx.calls.length = 0;
    ctx.fillStyleWrites.length = 0;

    renderer.drawDiff(makeGrid(cols, rows, occupant, age));

    // fillStyleWrites[0] is the background; one more per distinct (tokenIndex, shade) group —
    // 160 for a 255-organism roster, never 255.
    expect(ctx.fillStyleWrites.length - 1).toBe(160);
  });

  it('consumes outstanding markDirty() marks — a following draw() has no candidates left', () => {
    const { ctx, renderer } = primedRenderer({ showGridLines: false });

    renderer.markDirty([{ col: 0, row: 0 }]); // never consumed by a draw()
    renderer.drawDiff(makeGrid(2, 1, [1, 1]));
    ctx.calls.length = 0;
    ctx.fillStyleWrites.length = 0;

    // The marked cell DOES differ from what drawDiff painted, so the only thing standing between
    // draw() and a repaint is whether the mark survived: a surviving mark repaints cell 0, a
    // consumed one leaves draw() with no candidates at all. (With identical content this test
    // could not fail — draw() would filter the mark out on colour state either way.)
    renderer.draw(makeGrid(2, 1, [2, 1]));

    expect(ctx.calls).toHaveLength(0);
    expect(ctx.fillStyleWrites).toHaveLength(0);
  });

  it('falls back to a FULL repaint when no baseline has been primed yet', () => {
    const canvas = makeCanvas(20, 10);
    const ctx = installRecordingContext2d(canvas);
    const renderer = new GridRenderer(canvas, { cols: 2, rows: 1 }, DIRTY_TABLE, {
      colors: COLORS,
      showGridLines: false,
    });
    ctx.calls.length = 0;

    renderer.drawDiff(makeGrid(2, 1, [1, 1])); // no drawFull/renderStatic ever happened

    // The full-backing-store background fill is the tell — the diff path only ever fills cells.
    expect(ctx.calls[0]).toEqual({ op: 'fillRect', args: [0, 0, 20, 10] });
    expect(ctx.calls.filter((c) => c.op === 'rect')).toHaveLength(2);

    // ...and that fallback PRIMED the baseline: the next drawDiff is incremental, not another
    // full paint — otherwise every playback frame after an unprimed mount would repaint the dish.
    ctx.calls.length = 0;
    renderer.drawDiff(makeGrid(2, 1, [1, 2]));
    expect(ctx.calls.filter((c) => c.op === 'fillRect')).toEqual([
      { op: 'fillRect', args: [10, 0, 10, 10] }, // cell 1's background only
    ]);
    expect(ctx.calls.filter((c) => c.op === 'rect')).toHaveLength(1);
  });

  it('after renderStatic (which primes no baseline) the first drawDiff is a full paint (Trap 2)', () => {
    const canvas = makeCanvas(20, 10);
    const ctx = installRecordingContext2d(canvas);
    const renderer = new GridRenderer(canvas, { cols: 2, rows: 1 }, DIRTY_TABLE, {
      colors: COLORS,
      showGridLines: false,
    });
    renderer.renderStatic(makeGrid(2, 1, [1, 1]));
    ctx.calls.length = 0;

    renderer.drawDiff(makeGrid(2, 1, [1, 1])); // same content — a primed renderer would no-op

    expect(ctx.calls[0]).toEqual({ op: 'fillRect', args: [0, 0, 20, 10] });
    expect(ctx.calls.filter((c) => c.op === 'rect')).toHaveLength(2);
  });

  it('rejects a mis-shaped grid before touching the context', () => {
    const { ctx, renderer } = primedRenderer();

    expect(() => renderer.drawDiff(makeGrid(2, 3, new Array(6).fill(0)))).toThrow(
      GridRendererDimensionMismatchError,
    );
    expect(ctx.calls).toHaveLength(0);
  });

  it('owns no scheduling state — the same drawFull/drawDiff sweep produces identical call logs', () => {
    const table = lut([0, 5, 9], [1, 1, 1]);

    function sweep() {
      const canvas = makeCanvas(20, 10);
      const double = installRecordingContext2d(canvas);
      const renderer = new GridRenderer(canvas, { cols: 2, rows: 1 }, table, { colors: COLORS });
      renderer.drawFull(makeGrid(2, 1, [0, 0]));
      renderer.drawDiff(makeGrid(2, 1, [1, 2]));
      return double;
    }

    const doubleA = sweep();
    const doubleB = sweep();

    expect(doubleA.calls).toEqual(doubleB.calls);
    expect(doubleA.fillStyleWrites).toEqual(doubleB.fillStyleWrites);
  });
});
