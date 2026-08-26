/**
 * Pointer -> cell mapping, as a pure unit (Story 2.5 Task 2, AR-42) — the sibling of
 * `gridLayout.ts`, `dirtyCells.ts` and `colourStateGroups.ts`, which split the same way: the
 * renderer's (and now the editor's) *brain* is a unit, the *hand* is not. Nothing here touches a
 * DOM node; the component reads `getBoundingClientRect()` and `canvas.width`/`height` and hands
 * the numbers in, which is also what makes this testable at real geometry — jsdom performs no
 * layout, so a component test can only ever see a zero-sized rect.
 */
import type { CellCoord } from './dirtyCells';
import type { GridLayout } from './gridLayout';

export interface PointerToCellInput {
  /** The canvas element's CSS-pixel box, i.e. `getBoundingClientRect()`. */
  readonly rect: {
    readonly left: number;
    readonly top: number;
    readonly width: number;
    readonly height: number;
  };
  /** The canvas's backing-store size in device px — `canvas.width` / `canvas.height`. */
  readonly canvasWidth: number;
  readonly canvasHeight: number;
  /** The layout the SAME three inputs produced for the renderer (`computeGridLayout`). */
  readonly layout: GridLayout;
  /** Grid dimensions as parameters, never constants (Decision A). */
  readonly size: { readonly cols: number; readonly rows: number };
  readonly clientX: number;
  readonly clientY: number;
}

/**
 * Returns the cell under the pointer, or `null` when the pointer is over no cell at all.
 *
 * `null` is a normal outcome, not an error: the auto-fit layout centres the grid, so the letterbox
 * margins (`originX`/`originY`) are real, clickable, and belong to no cell. Contrast
 * `toFlatIndex`, which *throws* for an out-of-range coordinate (`dirtyCells.ts`) — that boundary is
 * a programming error, this one is a user pointing at nothing, and a throw out of a pointer event
 * handler is not an outcome any caller can act on. Clamping instead of returning `null` would
 * paint an edge cell every time the user clicks the frame around the dish.
 *
 * ⚠️ CSS px -> device px uses the canvas's OWN measured scale (`canvasWidth / rect.width`), never
 * `devicePixelRatio`. `GridRenderer` holds an identity transform and computes `cellSize` in device
 * px (gridRenderer.ts), so the element's measured ratio is the only number guaranteed to agree
 * with what was actually painted — at any DPR, and under any CSS transform or `zoom` that scales
 * the element without touching its backing store.
 */
export function pointerToCell(input: PointerToCellInput): CellCoord | null {
  const { rect, canvasWidth, canvasHeight, layout, size, clientX, clientY } = input;
  const { cellSize, originX, originY, drawWidth, drawHeight } = layout;

  // A zero-width/height rect is the ordinary state of a canvas that is display:none, detached, or
  // simply not laid out yet (always, under jsdom). Dividing by it yields Infinity, and Infinity - 0
  // floors to a garbage index that `toFlatIndex` would then throw on from inside the event
  // handler. Non-finite inputs fold into the same guard.
  if (!isPositiveFinite(rect.width) || !isPositiveFinite(rect.height)) return null;
  if (!isPositiveFinite(canvasWidth) || !isPositiveFinite(canvasHeight)) return null;
  if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) return null;
  if (!isPositiveFinite(cellSize)) return null;

  const deviceX = (clientX - rect.left) * (canvasWidth / rect.width);
  const deviceY = (clientY - rect.top) * (canvasHeight / rect.height);

  // Relative to the drawn grid's top-left, not the canvas's: everything outside [0, drawWidth) x
  // [0, drawHeight) is centring margin or off-canvas, and both are "no cell".
  const gridX = deviceX - originX;
  const gridY = deviceY - originY;
  if (gridX < 0 || gridY < 0) return null;
  if (gridX >= drawWidth || gridY >= drawHeight) return null;

  const col = Math.floor(gridX / cellSize);
  const row = Math.floor(gridY / cellSize);

  // Belt-and-braces against float rounding at the far edge: `drawWidth` is `cellSize * cols`, so
  // the check above should already exclude `col === cols`, but a coordinate one column past the
  // right edge does not fail loudly downstream — `toFlatIndex` would wrap it onto the next row's
  // first cell if this guard were the only thing missing and the range check were dropped.
  if (col < 0 || col >= size.cols || row < 0 || row >= size.rows) return null;

  return { col, row };
}

function isPositiveFinite(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}
