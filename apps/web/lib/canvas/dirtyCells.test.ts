import { afterEach, describe, expect, it, vi } from 'vitest';
import { colourStateAt, resetColourStateWarnings, EMPTY_COLOUR_STATE } from './colourStateGroups';
import {
  DirtyCellRangeError,
  markDirtyCells,
  selectChangedCells,
  selectDirtyCells,
  toFlatIndex,
  type CellCoord,
} from './dirtyCells';
import { fillGroupOf, type RefToFillGroup } from './refToFillGroup';
import type { RenderableGrid } from './renderableGrid';

const SIZE = { cols: 4, rows: 3 };

function lut(tokenIndex: number[], aging: number[]): RefToFillGroup {
  return {
    tokenIndex: Uint8Array.from(tokenIndex),
    aging: Uint8Array.from(aging),
    size: tokenIndex.length,
  };
}

function grid(width: number, height: number, occupant: number[], age?: number[]): RenderableGrid {
  return {
    width,
    height,
    occupant: Uint8Array.from(occupant),
    age: Uint16Array.from(age ?? new Array(occupant.length).fill(0)),
  };
}

/**
 * The baseline a `drawFull` would have primed for `previous`. Routes through the real
 * `colourStateAt` rather than re-deriving its branching here: a parallel copy of the out-of-range
 * guard would happily diverge from the production one and mask a regression instead of catching
 * it (review finding, Story 2.3 — the exact "re-derive instead of reuse" mistake the module's own
 * doc comment warns production code against).
 */
function baselineFor(previous: RenderableGrid, table: RefToFillGroup): Uint16Array {
  const cellCount = previous.width * previous.height;
  const buffer = new Uint16Array(cellCount);
  for (let index = 0; index < cellCount; index++) {
    buffer[index] = colourStateAt(previous, table, index);
  }
  return buffer;
}

afterEach(() => {
  resetColourStateWarnings();
  vi.restoreAllMocks();
});

describe('toFlatIndex', () => {
  it('uses the same row * width + col encoding the paint path already speaks', () => {
    expect(toFlatIndex(SIZE, { col: 0, row: 0 })).toBe(0);
    expect(toFlatIndex(SIZE, { col: 3, row: 0 })).toBe(3);
    expect(toFlatIndex(SIZE, { col: 1, row: 2 })).toBe(9);
  });

  it.each<[string, CellCoord]>([
    ['col past the right edge', { col: 4, row: 0 }],
    ['row past the bottom edge', { col: 0, row: 3 }],
    ['negative col', { col: -1, row: 0 }],
    ['negative row', { col: 0, row: -1 }],
    ['fractional col', { col: 1.5, row: 0 }],
    ['NaN row', { col: 0, row: Number.NaN }],
  ])('rejects %s loudly rather than writing past the end', (_label, coord) => {
    expect(() => toFlatIndex(SIZE, coord)).toThrow(DirtyCellRangeError);
  });

  it('names both the coordinate and the grid size in the message', () => {
    expect(() => toFlatIndex(SIZE, { col: 9, row: 1 })).toThrow(/9.*1|4x3/);
  });
});

describe('markDirtyCells', () => {
  it('accumulates across calls and is idempotent for a repeated cell', () => {
    const marks = new Set<number>();

    markDirtyCells(marks, SIZE, [{ col: 1, row: 0 }]);
    markDirtyCells(marks, SIZE, [
      { col: 1, row: 0 },
      { col: 2, row: 1 },
    ]);

    expect([...marks].sort((a, b) => a - b)).toEqual([1, 6]);
  });

  it('is a no-op for an empty iterable', () => {
    const marks = new Set<number>([3]);
    markDirtyCells(marks, SIZE, []);
    expect([...marks]).toEqual([3]);
  });

  it('throws on an out-of-range coord instead of silently marking nothing', () => {
    const marks = new Set<number>();
    expect(() =>
      markDirtyCells(marks, SIZE, [
        { col: 0, row: 0 },
        { col: 99, row: 0 },
      ]),
    ).toThrow(DirtyCellRangeError);
  });
});

describe('selectDirtyCells — AC1: dirty on occupant OR age-shade change', () => {
  const table = lut([0, 5, 9], [1, 1, 1]); // ref 1 -> token 5, ref 2 -> token 9, both aging

  it('yields exactly one repaint for a single-cell change, not the whole grid', () => {
    const before = grid(4, 3, new Array(12).fill(0));
    const after = grid(4, 3, [0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0]);
    const baseline = baselineFor(before, table);

    const changed = selectDirtyCells([5], after, table, baseline);

    expect(changed).toEqual([{ index: 5, colourState: fillGroupOf(table, 1, 0) }]);
  });

  it('drops a candidate whose colour state did not change (Story 2.7 no-op erase)', () => {
    const before = grid(4, 3, new Array(12).fill(0));
    const baseline = baselineFor(before, table);

    // Erasing an already-empty cell: marked as a candidate, but nothing to repaint.
    expect(selectDirtyCells([5], before, table, baseline)).toEqual([]);
  });

  it('treats occupied -> empty as dirty, carrying the empty sentinel', () => {
    const before = grid(4, 3, [0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0]);
    const after = grid(4, 3, new Array(12).fill(0));
    const baseline = baselineFor(before, table);

    expect(selectDirtyCells([5], after, table, baseline)).toEqual([
      { index: 5, colourState: EMPTY_COLOUR_STATE },
    ]);
  });

  it('does not dirty a cell when a different organism shares its colorToken (Decision B.2)', () => {
    const shared = lut([0, 5, 5], [1, 1, 1]); // ref 1 and ref 2 both render at token 5
    const before = grid(4, 3, [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    const after = grid(4, 3, [2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    const baseline = baselineFor(before, shared);

    expect(selectDirtyCells([0], after, shared, baseline)).toEqual([]);
  });

  it('dirties on age 6 -> 7 but NOT on 7 -> 8 (ageShadeFor saturates at 7)', () => {
    const before = grid(1, 1, [1], [6]);
    const baseline = baselineFor(before, table);

    expect(selectDirtyCells([0], grid(1, 1, [1], [7]), table, baseline)).toHaveLength(1);

    const saturated = baselineFor(grid(1, 1, [1], [7]), table);
    expect(selectDirtyCells([0], grid(1, 1, [1], [8]), table, saturated)).toEqual([]);
    expect(selectDirtyCells([0], grid(1, 1, [1], [99]), table, saturated)).toEqual([]);
  });

  it('does not dirty an age change for a NON-aging organism at all', () => {
    const nonAging = lut([0, 5], [0, 0]);
    const before = grid(1, 1, [1], [0]);
    const baseline = baselineFor(before, nonAging);

    expect(selectDirtyCells([0], grid(1, 1, [1], [5]), nonAging, baseline)).toEqual([]);
  });

  it('returns repaints in ascending index order so the call log stays deterministic', () => {
    const before = grid(4, 3, new Array(12).fill(0));
    const after = grid(4, 3, [0, 1, 0, 0, 0, 2, 0, 0, 1, 0, 0, 0]);
    const baseline = baselineFor(before, table);

    expect(selectDirtyCells([8, 1, 5], after, table, baseline).map((c) => c.index)).toEqual([
      1, 5, 8,
    ]);
  });

  it('treats an out-of-range ref as empty and warns once per distinct ref, not per candidate', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const before = grid(4, 3, new Array(12).fill(0));
    // ref 7 repeated (dedup within one ref) AND ref 8 (a distinct out-of-range ref) — this is
    // what actually distinguishes "dedup keyed by that ref" from "warns only once globally"
    // (review finding, Story 2.3): two candidates sharing one ref alone can't tell them apart.
    const after = grid(4, 3, [7, 7, 8, 0, 0, 0, 0, 0, 0, 0, 0, 0]); // 7, 8 both > lut.size
    const baseline = baselineFor(before, table);

    expect(selectDirtyCells([0, 1, 2], after, table, baseline)).toEqual([]);
    expect(warn).toHaveBeenCalledTimes(2); // once for ref 7, once for ref 8 — not once globally
  });
});

describe("selectChangedCells — playback's whole-grid sweep (Story 3.9 Task 1, AC2)", () => {
  const table = lut([0, 5, 9], [1, 1, 1]); // ref 1 -> token 5, ref 2 -> token 9, both aging

  afterEach(() => {
    resetColourStateWarnings();
    vi.restoreAllMocks();
  });

  it('reports nothing for an identical grid', () => {
    const before = grid(4, 3, [0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0]);
    const after = grid(4, 3, [0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0]);
    const baseline = baselineFor(before, table);

    expect(selectChangedCells(after, table, baseline)).toEqual([]);
  });

  it('reports exactly one entry, carrying the NEW colour state, for a single-cell change', () => {
    const before = grid(4, 3, new Array(12).fill(0));
    const after = grid(4, 3, [0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0]);
    const baseline = baselineFor(before, table);

    expect(selectChangedCells(after, table, baseline)).toEqual([
      { index: 5, colourState: fillGroupOf(table, 1, 0) },
    ]);
  });

  it('reports occupied -> empty with the EMPTY_COLOUR_STATE sentinel', () => {
    const before = grid(4, 3, [0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0]);
    const after = grid(4, 3, new Array(12).fill(0));
    const baseline = baselineFor(before, table);

    expect(selectChangedCells(after, table, baseline)).toEqual([
      { index: 5, colourState: EMPTY_COLOUR_STATE },
    ]);
  });

  it('does not report age 7 -> 8 (shade saturates), but DOES report age 6 -> 7', () => {
    const before6 = grid(1, 1, [1], [6]);
    const baselineAt6 = baselineFor(before6, table);
    expect(selectChangedCells(grid(1, 1, [1], [7]), table, baselineAt6)).toHaveLength(1);

    const before7 = grid(1, 1, [1], [7]);
    const baselineAt7 = baselineFor(before7, table);
    expect(selectChangedCells(grid(1, 1, [1], [8]), table, baselineAt7)).toEqual([]);
    expect(selectChangedCells(grid(1, 1, [1], [99]), table, baselineAt7)).toEqual([]);
  });

  it('two organisms sharing a colorToken swapping places reports nothing (Decision B.2 folding)', () => {
    const shared = lut([0, 5, 5], [1, 1, 1]); // ref 1 and ref 2 both render at token 5, same age
    const before = grid(4, 3, [1, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    const after = grid(4, 3, [2, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    const baseline = baselineFor(before, shared);

    expect(selectChangedCells(after, shared, baseline)).toEqual([]);
  });

  it('throws when the buffer lengths disagree with the declared dimensions, naming both counts', () => {
    const shortOccupant = grid(4, 3, new Array(11).fill(0));
    const baseline = new Uint16Array(12);
    expect(() => selectChangedCells(shortOccupant, table, baseline)).toThrow(/12.*occupant.*11/);

    const shortAge: ReturnType<typeof grid> = {
      width: 4,
      height: 3,
      occupant: new Uint8Array(12),
      age: new Uint16Array(11),
    };
    expect(() => selectChangedCells(shortAge, table, baseline)).toThrow(/12.*age.*11/);
  });

  it('returns repaints in ascending index order with no sort step', () => {
    const before = grid(4, 3, new Array(12).fill(0));
    const after = grid(4, 3, [0, 1, 0, 0, 0, 2, 0, 0, 1, 0, 0, 0]);
    const baseline = baselineFor(before, table);

    expect(selectChangedCells(after, table, baseline).map((c) => c.index)).toEqual([1, 5, 8]);
  });

  it('treats an out-of-range ref as empty and warns once per distinct ref', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const before = grid(4, 3, new Array(12).fill(0));
    const after = grid(4, 3, [7, 7, 8, 0, 0, 0, 0, 0, 0, 0, 0, 0]); // 7, 8 both > lut.size
    const baseline = baselineFor(before, table);

    expect(selectChangedCells(after, table, baseline)).toEqual([]);
    expect(warn).toHaveBeenCalledTimes(2);
  });
});
