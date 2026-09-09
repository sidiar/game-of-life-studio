import type { RenderableGrid } from '@/lib/canvas/renderableGrid';

/**
 * FR-3.11's clip predicates — how many living cells an Edit-mode resize would discard, and whether
 * it would discard any at all.
 *
 * ⚠️ **`resizeGrid` itself is gone from this file.** Story 3.3 took ownership, as the note this
 * comment replaces predicted: AR-17's resize now lives in `@gol/simulation`
 * (`packages/simulation/src/grid/resizeGrid.ts`) beside the typed-array `Grid` it operates on, so
 * Story 3.16's ephemeral Play-mode resize gets the SAME implementation Decision A.3 requires
 * ("top-left for both resizes") rather than a per-mode fork. Three behaviours changed in the move
 * and are recorded there: the signature is RFC-004 §3.4's positional `resizeGrid(grid, cols, rows)`;
 * `age` is now carried across top-left-anchored instead of zero-filled (a no-op for every
 * editable grid, which is age-zero everywhere, and a correctness fix for the live grid); and
 * dimensions are validated eagerly — a fractional or negative `cols`/`rows` now throws, where this
 * file's Epic-2 version silently built a corrupt grid (`new Uint8Array(2.5 * 4)` allocates 10, and
 * every row-major index computed from the claimed width then lands on the wrong cell).
 *
 * What stayed here, and why: these two predicates serve the Edit-mode warning DIALOG, not the
 * engine. "How many living cells would this shrink destroy" is a question about what to tell the
 * user before committing a gesture — no phase, no cycle, and no simulation reads it. Pushing it
 * down would put UI copy's arithmetic in the engine package.
 *
 * Pure: no React, no DOM, no repository, no module state.
 */

/**
 * How many LIVING cells a resize to `size` would discard — the number FR-3.11's warning quotes,
 * and the predicate `willClipLivingCells` is built from.
 *
 * ⚠️ **Living cells, not cells.** A shrink over an all-empty region discards nothing and must
 * apply silently; warning about discarding nothing trains the user to dismiss the dialog unread.
 *
 * Walks the DISCARDED region only — the two bands outside the new bounds — rather than resizing
 * and comparing counts before and after (forced decision 3(b), rejected): that is two full grid
 * walks, and it cannot distinguish "clipped nothing" from "there was nothing there".
 *
 * Growing on both axes visits no cells at all and returns 0 by construction, which is what makes
 * "growing never warns" a property of the arithmetic rather than a branch someone can forget.
 */
export function countClippedLivingCells(
  grid: RenderableGrid,
  size: { cols: number; rows: number },
): number {
  const keepCols = Math.min(grid.width, size.cols);
  const keepRows = Math.min(grid.height, size.rows);

  let clipped = 0;
  for (let row = 0; row < grid.height; row++) {
    // Rows past the new bottom edge are discarded whole; rows that survive contribute only the
    // cells past the new right edge. Splitting it this way visits each discarded cell once.
    const firstCol = row < keepRows ? keepCols : 0;
    const rowStart = row * grid.width;
    for (let col = firstCol; col < grid.width; col++) {
      if (grid.occupant[rowStart + col] !== 0) clipped++;
    }
  }
  return clipped;
}

/**
 * AC3's predicate: `true` iff a resize to `size` would discard at least one living cell.
 *
 * Delegates rather than short-circuiting on the first hit, because the one caller that asks the
 * question also needs the COUNT for the dialog copy (forced decision 3(a) — "one walk of the
 * discarded region, and it can return the count in the same pass"). A short-circuiting variant
 * would be a second walk of the same region for a boolean the count already contains.
 */
export function willClipLivingCells(
  grid: RenderableGrid,
  size: { cols: number; rows: number },
): boolean {
  return countClippedLivingCells(grid, size) > 0;
}
