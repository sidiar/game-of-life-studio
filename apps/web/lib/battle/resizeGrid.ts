import type { RenderableGrid } from '@/lib/canvas/renderableGrid';

/**
 * AR-17's `resizeGrid`, and the clip predicate FR-3.11's warning is built on.
 *
 * Lives in `apps/web`, not `packages/simulation`, for the reason `renderableGrid.ts` and
 * `gridStats.ts` each already record: `packages/simulation` does not exist yet, and
 * `RenderableGrid` — the type these functions operate on — is declared here because `apps/web`
 * depends on `@gol/*` and never the reverse. Putting it below the boundary would either invert
 * that dependency or force a package to declare a type it does not own. Not `lib/canvas/` either:
 * re-anchoring an occupant map is not a rendering concern (`gridStats.ts` made the same call for
 * the same shape of function).
 *
 * ⚠️ **Story 3.3 is the eventual owner** — `epics.md` assigns AR-17's `resizeGrid` to it, beside
 * the real typed-array `Grid`. **Story 3.16 (Play-mode ephemeral resize) is the second consumer**,
 * and shares these anchor semantics exactly: Decision A.3 specifies top-left for *both* resizes,
 * so this must move as-is rather than being forked per mode.
 *
 * Pure: no React, no DOM, no repository, no module state.
 */

/**
 * Top-left-anchored resize (Decision A.3, AR-17). Every cell inside BOTH rectangles keeps its
 * `(col, row)`; growing adds empty space to the right and bottom; shrinking discards everything
 * outside the new bounds.
 *
 * ⚠️ Returns **new buffers, both of them**, always — including when `size` matches the grid's
 * current dimensions. Kept a total function of its inputs deliberately: the "selecting the current
 * preset does nothing" rule (trap 7) is a decision about the CONTROL, and smuggling it in here as
 * an identity return would make the function's contract depend on which caller asks. The one
 * caller enforces the no-op before it gets here.
 *
 * ⚠️ `age` is reallocated at the new length and zero-filled — never carried over. Every editable
 * grid is age-zero everywhere (RFC-005 "Representation note"), so nothing is lost; keeping the old
 * `Uint16Array` would leave a buffer whose length no longer matches `width * height`, which
 * nothing in Epic 2 reads and Epic 3 would then index off the end of. `restore()`
 * (`useUndoableGrid.ts`) already models the correct behaviour.
 *
 * ⚠️ `occupant.length` is exactly `cols * rows`. No pooling, no reuse, no over-allocation —
 * `computeEditorGridStats` and `GridRenderer.assertGridMatchesSize` both treat that as an
 * invariant of every `RenderableGrid` in circulation.
 */
export function resizeGrid(
  grid: RenderableGrid,
  size: { cols: number; rows: number },
): RenderableGrid {
  const { cols, rows } = size;
  const occupant = new Uint8Array(cols * rows);

  const copyCols = Math.min(grid.width, cols);
  const copyRows = Math.min(grid.height, rows);

  for (let row = 0; row < copyRows; row++) {
    const from = row * grid.width;
    // `subarray` is safe HERE — and only here — because it is the SOURCE of a copy, never a value
    // that escapes: `TypedArray.set` reads the bytes into `occupant`'s own buffer. Trap 5's ban is
    // on RETAINING a view (`snapshot()`'s `.slice()`), which this does not do. A row-at-a-time
    // `set` also beats a per-cell loop by the memmove the engine does underneath.
    occupant.set(grid.occupant.subarray(from, from + copyCols), row * cols);
  }

  return { width: cols, height: rows, occupant, age: new Uint16Array(cols * rows) };
}

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
