/**
 * Story 3.9 Task 4 (AC5, AC6, AC7) — `drawDiff` walked through REAL engine cycles
 * (`stepGridBuffers` + `activeStrategy`, deterministic via `createSeededRng(FIXED_SEED)`), rather
 * than hand-rolled grids: the ramp, the non-aging fold, and the roster-ordering invariant are all
 * claims about what the ENGINE hands the renderer, not about the renderer in isolation.
 *
 * A separate file rather than a `gridRenderer.test.ts` describe block (Task 4's own call) — three
 * ACs' worth of engine-driven fixtures reads better on its own than folded into a file already at
 * ~950 lines of renderer-only unit tests.
 */
import {
  compileSession,
  createGridBuffers,
  gridFromDense,
  internOrganismIds,
  stepGridBuffers,
  type SimulationDeps,
} from '@gol/simulation';
import { CONWAYS_CLASSIC, createSeededRng, FIXED_SEED, gridFromPattern } from '@gol/test-utils';
import type { Organism } from '@gol/domain';
import { afterEach, describe, expect, it } from 'vitest';
import { displayColorAt } from '../palette/displayColor';
import { paletteIndexOf } from '../palette/paletteRegistry';
import { colourStateAt, resetColourStateWarnings } from './colourStateGroups';
import { GridRenderer } from './gridRenderer';
import { buildRefToFillGroup, resetRefToFillGroupWarnings } from './refToFillGroup';
import {
  installRecordingContext2d,
  type RecordingContext2D,
} from '@/test-support/recordingContext2d';

const COLORS = { background: '#0a0a0a', gridLine: '#333333' };
const CELL_SIZE = 10; // every canvas below is cols*CELL_SIZE x rows*CELL_SIZE -> origin (0, 0)

function makeCanvas(cols: number, rows: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = cols * CELL_SIZE;
  canvas.height = rows * CELL_SIZE;
  return canvas;
}

/** Builds the deps shape Task 4 pins — copied from stepGridBuffers.test.ts's last test. */
function depsFor(roster: readonly Organism[]): SimulationDeps {
  return {
    ...compileSession(roster),
    organisms: roster.map((organism) => ({ dominance: organism.dominance })),
    rng: createSeededRng(FIXED_SEED),
  };
}

function lutFor(roster: readonly Organism[]) {
  return buildRefToFillGroup(
    roster.map((organism) => organism.id),
    new Map(roster.map((organism) => [organism.id, organism])),
  );
}

/**
 * `ctx.rect(...)` calls, converted back to flat grid indices via the CELL_SIZE convention above.
 * A `rect` is a COLOUR repaint only — an erase paints background (`fillRect`) and no `rect` — so
 * every assertion below pairs this with `backgroundFills`: equal counts prove nothing was erased.
 */
function rectIndices(ctx: RecordingContext2D, cols: number): number[] {
  return ctx.calls
    .filter((call) => call.op === 'rect')
    .map((call) => {
      const [x, y] = call.args as [number, number, number, number];
      return (y / CELL_SIZE) * cols + x / CELL_SIZE;
    })
    .sort((a, b) => a - b);
}

/** Per-cell background fills — with grid lines off, the only `fillRect`s paintDirtyCells makes. */
function backgroundFills(ctx: RecordingContext2D): number {
  return ctx.calls.filter((call) => call.op === 'fillRect').length;
}

afterEach(() => {
  resetColourStateWarnings();
  resetRefToFillGroupWarnings();
});

// A classic 2x2 block: a still life. `#` -> ref 1 in every single-organism fixture below.
const BLOCK_LEGEND = { '.': 0, '#': 1 };
const BLOCK_ROWS = ['....', '.##.', '.##.', '....'];
const BLOCK_CELL_INDEX = 1 * 4 + 1; // (col 1, row 1) — one of the block's four cells

describe('drawDiff through real engine cycles — AC6: the aging ramp is what playback paints', () => {
  it('a still life under aging paints displayColorAt(t, 1)..(t, 7) on cycles 1-7, nothing on 8-10', () => {
    const roster: Organism[] = [{ ...CONWAYS_CLASSIC, agingEnabled: true }];
    const lut = lutFor(roster);
    const tokenIndex = paletteIndexOf(roster[0].colorToken);
    const deps = depsFor(roster);

    let buffers = createGridBuffers(gridFromDense(gridFromPattern(BLOCK_ROWS, BLOCK_LEGEND)));
    const canvas = makeCanvas(4, 4);
    const ctx = installRecordingContext2d(canvas);
    const renderer = new GridRenderer(canvas, { cols: 4, rows: 4 }, lut, {
      colors: COLORS,
      showGridLines: false,
    });
    renderer.drawFull(buffers.front); // primes the baseline at age 0, like the edit canvas (Trap 2)

    const blockIndices = [BLOCK_CELL_INDEX, 1 * 4 + 2, 2 * 4 + 1, 2 * 4 + 2].sort((a, b) => a - b);
    const paintedColours: (string | null)[] = [];
    for (let cycle = 1; cycle <= 10; cycle++) {
      buffers = stepGridBuffers(buffers, deps);
      ctx.calls.length = 0;
      ctx.fillStyleWrites.length = 0;

      renderer.drawDiff(buffers.front);

      // The block never moves and never dies — a repaint here can only be the age-shade changing,
      // and (one still life, one colour group) it is always all four cells or none of them.
      const repainted = rectIndices(ctx, 4);
      expect(repainted).toEqual(cycle <= 7 ? blockIndices : []);
      expect(backgroundFills(ctx)).toBe(repainted.length); // every repaint carried a colour
      // A frame either wrote nothing or exactly [background, one colour group] — a frame that
      // wrote only the background would otherwise launder to `null` below and read as silence.
      expect(ctx.fillStyleWrites).toHaveLength(repainted.length === 0 ? 0 : 2);
      // fillStyleWrites is typed for the general CanvasGradient/CanvasPattern case; this renderer
      // only ever writes strings (RecordingContext2D never sees anything else from gridRenderer.ts).
      const colourWrite = ctx.fillStyleWrites.length === 2 ? ctx.fillStyleWrites[1] : null;
      paintedColours.push(typeof colourWrite === 'string' ? colourWrite : null);
    }

    expect(paintedColours).toEqual([
      displayColorAt(tokenIndex, 1),
      displayColorAt(tokenIndex, 2),
      displayColorAt(tokenIndex, 3),
      displayColorAt(tokenIndex, 4),
      displayColorAt(tokenIndex, 5),
      displayColorAt(tokenIndex, 6),
      displayColorAt(tokenIndex, 7),
      null, // ageShadeFor saturates at 7 — a "clever" age !== lastAge sweep would repaint here (Trap 5)
      null,
      null,
    ]);
  });
});

describe('drawDiff through real engine cycles — AC5: non-aging organisms fold into (token, 7)', () => {
  it("Conway's Classic (non-aging) paints zero repaints across 10 cycles; its colour is shade 7", () => {
    const roster: Organism[] = [CONWAYS_CLASSIC]; // ships agingEnabled: false, unmodified (FR-1.5)
    const lut = lutFor(roster);
    const tokenIndex = paletteIndexOf(roster[0].colorToken);
    const deps = depsFor(roster);

    let buffers = createGridBuffers(gridFromDense(gridFromPattern(BLOCK_ROWS, BLOCK_LEGEND)));
    const canvas = makeCanvas(4, 4);
    const ctx = installRecordingContext2d(canvas);
    const renderer = new GridRenderer(canvas, { cols: 4, rows: 4 }, lut, {
      colors: COLORS,
      showGridLines: false,
    });
    renderer.drawFull(buffers.front);

    // drawFull's own paint already proves the age-cap identity (Story 1.8/1.7): index 0 is the
    // background write, index 1 the block's one colour group (grid lines are off).
    expect(ctx.fillStyleWrites).toEqual([COLORS.background, displayColorAt(tokenIndex, 7)]);

    for (let cycle = 1; cycle <= 10; cycle++) {
      buffers = stepGridBuffers(buffers, deps);
      ctx.calls.length = 0;
      ctx.fillStyleWrites.length = 0;

      renderer.drawDiff(buffers.front);

      expect(ctx.calls).toHaveLength(0); // Trap 6: non-aging is shade 7, never a change to shade 0
      expect(ctx.fillStyleWrites).toHaveLength(0);
    }
  });

  it('sharing a colour token, the aging block repaints cycles 1-7; the non-aging block never repaints', () => {
    const organismA: Organism = { ...CONWAYS_CLASSIC, id: 'aging-block', agingEnabled: true };
    const organismB: Organism = { ...CONWAYS_CLASSIC, id: 'non-aging-block', agingEnabled: false };
    const roster = [organismA, organismB]; // both colorToken 'sky-blue' — B.2 folding
    const lut = lutFor(roster);
    const deps = depsFor(roster);

    // Block A at (col 1-2, row 1-2), block B at (col 4-5, row 1-2) — two columns apart, so the
    // two organisms' cells are never 8-neighbours of each other.
    const rows = ['.......', '.AA.BB.', '.AA.BB.', '.......'];
    const legend = { '.': 0, A: 1, B: 2 };
    let buffers = createGridBuffers(gridFromDense(gridFromPattern(rows, legend)));
    const canvas = makeCanvas(7, 4);
    const ctx = installRecordingContext2d(canvas);
    const renderer = new GridRenderer(canvas, { cols: 7, rows: 4 }, lut, {
      colors: COLORS,
      showGridLines: false,
    });
    renderer.drawFull(buffers.front);

    const blockAIndices = [1 * 7 + 1, 1 * 7 + 2, 2 * 7 + 1, 2 * 7 + 2].sort((a, b) => a - b);
    const blockBIndices = [1 * 7 + 4, 1 * 7 + 5, 2 * 7 + 4, 2 * 7 + 5];

    for (let cycle = 1; cycle <= 10; cycle++) {
      buffers = stepGridBuffers(buffers, deps);
      ctx.calls.length = 0;
      ctx.fillStyleWrites.length = 0;

      renderer.drawDiff(buffers.front);

      const repainted = rectIndices(ctx, 7);
      expect(backgroundFills(ctx)).toBe(repainted.length); // nothing erased — B's cells included
      for (const index of blockBIndices) expect(repainted).not.toContain(index); // never, any cycle
      if (cycle <= 7) {
        expect(repainted).toEqual(blockAIndices);
      } else {
        expect(repainted).toEqual([]); // shade saturated at 7 — no more changes
      }
    }
  });
});

describe('the LUT through a real engine cycle — AC7: buildRefToFillGroup and internOrganismIds share the roster order', () => {
  it("a newborn cell resolves to the RIGHT organism's token; a LUT built from a reversed roster swaps them", () => {
    const organismA: Organism = {
      ...CONWAYS_CLASSIC,
      id: 'organism-a',
      colorToken: 'sky-blue',
      agingEnabled: true,
    };
    const organismB: Organism = {
      ...CONWAYS_CLASSIC,
      id: 'organism-b',
      colorToken: 'vermillion',
      agingEnabled: true,
    };
    const roster = [organismA, organismB];
    const organismIds = roster.map((organism) => organism.id);
    const organismsById = new Map(roster.map((organism) => [organism.id, organism]));
    const deps = depsFor(roster);

    // The interning invariant itself (AR-8, Decision E.3, M14): ref = roster index + 1.
    const refById = internOrganismIds(organismIds);
    expect(refById.get('organism-a')).toBe(1);
    expect(refById.get('organism-b')).toBe(2);

    // Two horizontal blinkers, three rows apart — organism A's at row 2, organism B's at row 5 —
    // far enough that neither organism's cells are ever the other's 8-neighbour.
    const rows = ['.....', '.....', '.AAA.', '.....', '.....', '.BBB.', '.....'];
    const legend = { '.': 0, A: 1, B: 2 };
    let buffers = createGridBuffers(gridFromDense(gridFromPattern(rows, legend)));

    buffers = stepGridBuffers(buffers, deps); // one real cycle: both blinkers flip horizontal -> vertical

    // Organism B's blinker (row 5, cols 1-3) flips to vertical at col 2, rows 4-6 — (row 4, col 2)
    // is one of its two newborn cells.
    const newbornIndex = 4 * 5 + 2;
    expect(buffers.front.occupant[newbornIndex]).toBe(2); // sanity: it really is organism B's ref
    expect(buffers.front.age[newbornIndex]).toBe(0); // sanity: it really is newborn

    const lut = buildRefToFillGroup(organismIds, organismsById);
    expect(colourStateAt(buffers.front, lut, newbornIndex)).toBe(
      paletteIndexOf(organismB.colorToken) * 8 + 0,
    );

    // The negative twin (`refToFillGroup.ts`'s header: "the roster ORDERING … is the real
    // invariant") — a LUT built from the REVERSED id list assigns ref 2 organism A's token
    // instead, and the same cell now resolves to the WRONG colour.
    const reversedLut = buildRefToFillGroup([...organismIds].reverse(), organismsById);
    expect(colourStateAt(buffers.front, reversedLut, newbornIndex)).toBe(
      paletteIndexOf(organismA.colorToken) * 8 + 0,
    );
  });
});
