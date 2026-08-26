/**
 * Dirty-cell decision logic — pure, no canvas, no DOM (Story 2.3 Task 1, AR-42). The renderer's
 * *brain* is a unit; the renderer's *hand* (GridRenderer) is not. Sibling of gridLayout.ts and
 * colourStateGroups.ts, which split the same way.
 *
 * Representation: a flat-index `Set<number>`, NOT merged rectangles (Story 2.3 forced decision 1).
 * RFC-002 §"2. Dirty Rectangle Tracking" sketches a `DirtyRegionTracker` with merged
 * `DirtyRect`s, but a merged rectangle spans multiple colour states, so it cannot be painted
 * through the `(colorToken, ageShade)` batching path at all (Decision B.2 / AR-23) — it would need
 * a second, unbatched paint routine AND would repaint untouched cells inside the merged box. The
 * whole existing paint path is flat-index based, and the frozen contract's own signature
 * (`markDirty(cells: Iterable<CellCoord>)`) is cell-shaped rather than rect-shaped.
 *
 * Change detection is a hybrid (Story 2.3 forced decision 2): `markDirty` accumulates
 * *candidates*, and `draw` filters each candidate against a retained per-cell last-drawn colour
 * state. Pure caller-trust would make an already-empty erase repaint; pure renderer-side diffing
 * would make `markDirty` dead weight and require copying both typed arrays every draw, against
 * NFR-1.1.
 */
import { colourStateAt, EMPTY_COLOUR_STATE } from './colourStateGroups';
import type { RefToFillGroup } from './refToFillGroup';
import type { RenderableGrid } from './renderableGrid';

/**
 * The coordinate type the frozen contract (`component-tree-battle-page.md#5`) names but never
 * defines. `{ col, row }` rather than `{ x, y }` (Story 2.3 forced decision 5): it matches the
 * `size: { cols, rows }` vocabulary the renderer and gridLayout.ts already speak, and Stories 2.5
 * and 2.6 will hand it grid coordinates straight off a pointer event. Flat indices stay an
 * internal encoding, converted at this module's boundary.
 */
export interface CellCoord {
  readonly col: number;
  readonly row: number;
}

export class DirtyCellRangeError extends Error {
  constructor(coord: CellCoord, size: { cols: number; rows: number }) {
    super(
      `DirtyCells: cell (col ${coord.col}, row ${coord.row}) is outside the grid ` +
        `${size.cols}x${size.rows}`,
    );
    this.name = 'DirtyCellRangeError';
  }
}

/**
 * Converts a grid coordinate to the `row * width + col` flat index colourStateGroups.ts and
 * renderableGrid.ts already use. Throws rather than clamping or silently dropping, mirroring
 * `toRenderableGrid`'s eager-throw convention: a coordinate one column past the right edge would
 * otherwise wrap onto the next row's first cell and repaint a plausible-looking wrong cell, with
 * the real defect (a pointer-mapping bug in 2.5/2.6) three modules away from where it surfaced.
 */
export function toFlatIndex(size: { cols: number; rows: number }, coord: CellCoord): number {
  const { col, row } = coord;
  // Integer-checked, not just range-checked: a fractional col makes the flat index fractional,
  // and `Uint16Array[1.5]` reads undefined instead of throwing. NaN fails Number.isInteger too.
  if (!Number.isInteger(col) || !Number.isInteger(row)) throw new DirtyCellRangeError(coord, size);
  if (col < 0 || col >= size.cols || row < 0 || row >= size.rows) {
    throw new DirtyCellRangeError(coord, size);
  }
  return row * size.cols + col;
}

/**
 * Accumulates candidates into `marks`. A `Set` makes re-marking the same cell free, which is the
 * shape a drag stroke (Story 2.6) produces — the pointer crosses one cell many times per gesture.
 *
 * Validates every coord into a plain array BEFORE touching `marks`: `marks` is caller-owned,
 * persistent state (`GridRenderer`'s `dirtyCells`), unlike `toRenderableGrid`'s local buffer that
 * a throw discards wholesale. Adding-then-throwing partway through a batch would leave the first
 * N coords marked with no way for the caller to know or roll back — review finding, Story 2.3.
 */
export function markDirtyCells(
  marks: Set<number>,
  size: { cols: number; rows: number },
  cells: Iterable<CellCoord>,
): void {
  const indices = Array.from(cells, (coord) => toFlatIndex(size, coord));
  for (const index of indices) marks.add(index);
}

export interface DirtyCellRepaint {
  readonly index: number;
  /** The cell's NEW colour state — `EMPTY_COLOUR_STATE` when it is now empty. */
  readonly colourState: number;
}

/**
 * Filters accumulated candidates down to the cells whose colour state actually changed — AC1's
 * "dirty on occupant OR age-shade change" rule, decided here rather than trusted from the caller.
 *
 * Two consequences worth naming, both spec-required rather than incidental:
 * - two organisms sharing a `colorToken` do NOT dirty each other's cells (Decision B.2 folding);
 * - age 7 -> 8 -> 99 does NOT dirty, because `ageShadeFor` saturates at shade 7 (AR-22 bounds the
 *   shade ramp to a cell's first 7 cycles). The engine's MAX_RELEVANT_AGE (Decision B.5) is a
 *   different number for a different purpose and must not be imported into this comparison.
 *
 * Returned in ascending index order so two draws of the same change produce identical call logs.
 */
export function selectDirtyCells(
  candidates: Iterable<number>,
  grid: RenderableGrid,
  lut: RefToFillGroup,
  lastColourState: Uint16Array,
): DirtyCellRepaint[] {
  const repaints: DirtyCellRepaint[] = [];
  for (const index of candidates) {
    const colourState = colourStateAt(grid, lut, index);
    if (colourState === lastColourState[index]) continue;
    repaints.push({ index, colourState });
  }
  return repaints.sort((a, b) => a.index - b.index);
}
