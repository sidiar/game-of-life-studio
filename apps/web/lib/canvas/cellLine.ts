/**
 * Cell-line interpolation — pure, no DOM (Story 2.6 Task 1, AR-42), the sibling of
 * `pointerToCell.ts` / `gridLayout.ts` / `dirtyCells.ts`, which all split the same way: the
 * editor's *brain* is a unit, the *hand* is not.
 *
 * `cellsBetween` closes AC4 ("no gaps"): the browser reports a fast drag as a handful of
 * widely-spaced `pointermove` events, and this fills in every cell the pointer swept between two
 * consecutive samples so the painted stroke is a continuous line, not a dotted one.
 */
import type { CellCoord } from './dirtyCells';

/**
 * Returns the cells strictly AFTER `from`, up to and including `to`, in traversal order along an
 * integer Bresenham line. `from` itself is never in the result — that is what makes "append the
 * segment's cells to the working grid" idempotent across consecutive `pointermove` calls without
 * re-emitting the previous anchor every time (Task 1).
 *
 * Both endpoints are cells `pointerToCell` already vouched for against the same `size`, so every
 * interpolated cell between them is within `[0, cols) x [0, rows)` BY CONSTRUCTION — a Bresenham
 * line never leaves the bounding box of its two endpoints. That is what keeps `markDirty`'s
 * `DirtyCellRangeError` (dirtyCells.ts) unreachable from inside a pointer handler: this is the
 * second producer of coordinates trap 9 in the story's Dev Notes warns about, alongside
 * `pointerToCell` itself.
 *
 * `from === to` returns an empty array, deliberately NOT `[to]` — a stroke that has not moved
 * paints nothing extra beyond what the anchor already painted.
 */
export function cellsBetween(from: CellCoord, to: CellCoord): CellCoord[] {
  const cells: CellCoord[] = [];

  let x0 = from.col;
  let y0 = from.row;
  const x1 = to.col;
  const y1 = to.row;

  const dx = Math.abs(x1 - x0);
  const sx = x0 < x1 ? 1 : -1;
  // Negative on purpose — Bresenham's classic formulation compares `2*err` against `dx` and `-dy`
  // (here `dy`), and keeping the sign folded in here is what keeps the step conditions below
  // symmetric across all four sign combinations instead of branching on quadrant explicitly.
  const dy = -Math.abs(y1 - y0);
  const sy = y0 < y1 ? 1 : -1;

  let err = dx + dy;

  // Steps from `from` toward `to` one cell at a time, pushing AFTER each step — so `from` is
  // never pushed (the loop body runs zero times when `from === to`) and `to` is always the last
  // element pushed (the loop condition fails the moment the step lands on it).
  while (x0 !== x1 || y0 !== y1) {
    const e2 = 2 * err;
    // The two conditions are independent, not else-if: at a 45-degree diagonal both fire on the
    // same iteration, which is what makes the diagonal case advance both axes together instead of
    // stair-stepping through an extra orthogonal cell per step (the axis-swap branch, exercised at
    // a steep slope, is this same code — no separate branch to maintain).
    if (e2 >= dy) {
      err += dy;
      x0 += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y0 += sy;
    }
    cells.push({ col: x0, row: y0 });
  }

  return cells;
}
