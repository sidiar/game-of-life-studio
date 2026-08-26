/**
 * Auto-fit layout math — pure, no canvas (Story 1.8 Task 3, AC2/AR-22). `computeGridLayout`
 * decides how a grid of `cols x rows` cells fits inside a `canvas.width x canvas.height`
 * backing-store rectangle: cell size, centring origin, and whether grid lines are legible at that
 * size. Nothing here touches a CanvasRenderingContext2D — GridRenderer (Task 5) is the only
 * caller that draws.
 */

// At cellSize 1-3, a 1px grid line consumes 25-100% of every cell and the tile becomes a grey
// rectangle — FR-8.7's toggle has nothing legible to draw below this threshold, which is not the
// toggle being ignored (see gridRenderer.ts's setGridLines doc comment).
const MIN_GRID_LINE_CELL_SIZE = 4;

export interface GridLayout {
  readonly cellSize: number; // device px, integer, >= 1
  readonly originX: number; // device px — leftover space split, grid centred
  readonly originY: number;
  readonly drawWidth: number; // cellSize * cols
  readonly drawHeight: number;
  readonly gridLinesVisible: boolean;
}

/**
 * Structural equality over every field that changes what gets drawn. `computeGridLayout` returns a
 * fresh object each call, so an identity check answers "is this the same object" rather than "does
 * this describe the same picture" — and GridRenderer's overlay cache needs the second question
 * (Story 2.3, closing the 1.8 review's "rebuildGridLineOverlay allocates on every resize" item).
 */
export function gridLayoutEquals(a: GridLayout, b: GridLayout): boolean {
  return (
    a.cellSize === b.cellSize &&
    a.originX === b.originX &&
    a.originY === b.originY &&
    a.drawWidth === b.drawWidth &&
    a.drawHeight === b.drawHeight &&
    a.gridLinesVisible === b.gridLinesVisible
  );
}

export function computeGridLayout(
  canvas: { width: number; height: number },
  size: { cols: number; rows: number },
  showGridLines: boolean,
): GridLayout {
  const { cols, rows } = size;

  // Normalise non-finite dimensions to 0 up front. Math.max(1, Math.floor(NaN)) is NaN, not 1, so
  // a NaN canvas box would otherwise propagate through cellSize into every rect the renderer
  // draws — a blank canvas with no error anywhere, which is the failure mode the max(1, ...)
  // clamp below exists to rule out.
  const canvasWidth = Number.isFinite(canvas.width) ? canvas.width : 0;
  const canvasHeight = Number.isFinite(canvas.height) ? canvas.height : 0;

  // A.5's formula taken on BOTH axes, keeping the smaller ratio, so the whole grid stays visible
  // (FR-3.2). Taking only one axis is the literal reading of `floor(canvasPx / dimension)` and it
  // clips the other dimension off-canvas the moment the aspect ratios disagree.
  const rawCellSize = cols > 0 && rows > 0 ? Math.min(canvasWidth / cols, canvasHeight / rows) : 1;

  // max(1, ...) is load-bearing, not defensive garnish: at Gallery-tile sizes (~200px wide) a
  // 100x60 grid is `floor(200/200) = 1` — one tile size smaller and the floor hits 0, and
  // `fillRect(x, y, 0, 0)` paints nothing with no error anywhere. Clamping accepts that the grid
  // overflows and gets clipped by the canvas edge instead, which is the graceful outcome.
  const cellSize = Math.max(1, Math.floor(rawCellSize));

  const drawWidth = cellSize * cols;
  const drawHeight = cellSize * rows;

  // floor on integer inputs keeps the origin integral — a fractional origin re-introduces the
  // seams the integer cellSize exists to remove. Without centring, the leftover space becomes a
  // dead bar on one side and the dish looks mis-mounted.
  const originX = Math.floor((canvasWidth - drawWidth) / 2);
  const originY = Math.floor((canvasHeight - drawHeight) / 2);

  return {
    cellSize,
    originX,
    originY,
    drawWidth,
    drawHeight,
    gridLinesVisible: showGridLines && cellSize >= MIN_GRID_LINE_CELL_SIZE,
  };
}
