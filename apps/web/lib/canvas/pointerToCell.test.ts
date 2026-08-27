import { describe, expect, it } from 'vitest';
import { computeGridLayout } from './gridLayout';
import { pointerToCell, type PointerToCellInput } from './pointerToCell';

// Both EDITABLE presets (Decision A / H-9). Named in a fixture, never in production code.
const PRESETS = [
  { cols: 50, rows: 30 },
  { cols: 100, rows: 60 },
] as const;

const RECT_ORIGIN = { left: 17, top: 23 }; // non-zero on purpose: a rect at (0,0) hides a missing
// `- rect.left` subtraction entirely.

/**
 * Builds a realistic input at a given CSS box and device-pixel scale, deriving the layout from
 * `computeGridLayout` exactly as the component does — so these tests move with the real auto-fit
 * math instead of restating it.
 */
function makeInput(options: {
  size: { cols: number; rows: number };
  cssWidth: number;
  cssHeight: number;
  scale: number;
  clientX: number;
  clientY: number;
  showGridLines?: boolean;
}): PointerToCellInput {
  const { size, cssWidth, cssHeight, scale, clientX, clientY } = options;
  const canvasWidth = cssWidth * scale;
  const canvasHeight = cssHeight * scale;
  return {
    rect: { ...RECT_ORIGIN, width: cssWidth, height: cssHeight },
    canvasWidth,
    canvasHeight,
    layout: computeGridLayout(
      { width: canvasWidth, height: canvasHeight },
      size,
      options.showGridLines ?? true,
    ),
    size,
    clientX,
    clientY,
  };
}

/** The CSS-px client coordinate of a point `deviceOffset` device px into the canvas. */
function clientAt(deviceOffset: number, scale: number, origin: number): number {
  return origin + deviceOffset / scale;
}

describe('pointerToCell', () => {
  describe.each(PRESETS)('at the $cols x $rows preset', (size) => {
    // A 1000x600 CSS box is the dish's real shape (max-width 1000px, aspect-ratio 5/3 —
    // BattleEditorView's PetriDishBox), so cellSize divides evenly at both presets and the
    // letterbox margins are zero. The margin cases below use a deliberately mismatched box.
    const CSS_WIDTH = 1000;
    const CSS_HEIGHT = 600;

    it.each([1, 2, 1.5])('maps all four corner cells at DPR scale %s', (scale) => {
      const probe = (deviceX: number, deviceY: number) =>
        pointerToCell(
          makeInput({
            size,
            cssWidth: CSS_WIDTH,
            cssHeight: CSS_HEIGHT,
            scale,
            clientX: clientAt(deviceX, scale, RECT_ORIGIN.left),
            clientY: clientAt(deviceY, scale, RECT_ORIGIN.top),
          }),
        );

      const { layout } = makeInput({
        size,
        cssWidth: CSS_WIDTH,
        cssHeight: CSS_HEIGHT,
        scale,
        clientX: 0,
        clientY: 0,
      });
      const { cellSize, originX, originY, drawWidth, drawHeight } = layout;

      // Top-left cell: its very first device pixel, and its last one.
      expect(probe(originX, originY)).toEqual({ col: 0, row: 0 });
      expect(probe(originX + cellSize - 1, originY + cellSize - 1)).toEqual({ col: 0, row: 0 });
      // Top-right, bottom-left, bottom-right — the cells an off-by-one drops or wraps.
      expect(probe(originX + drawWidth - 1, originY)).toEqual({ col: size.cols - 1, row: 0 });
      expect(probe(originX, originY + drawHeight - 1)).toEqual({ col: 0, row: size.rows - 1 });
      expect(probe(originX + drawWidth - 1, originY + drawHeight - 1)).toEqual({
        col: size.cols - 1,
        row: size.rows - 1,
      });
    });

    it('puts the exact boundary pixel between two cells in the LATER cell', () => {
      const scale = 1;
      const base = makeInput({
        size,
        cssWidth: CSS_WIDTH,
        cssHeight: CSS_HEIGHT,
        scale,
        clientX: 0,
        clientY: 0,
      });
      const { cellSize, originX, originY } = base.layout;

      // The last pixel of column 0 and the first pixel of column 1 — adjacent device pixels that
      // must land on different cells. A `Math.round` in place of `Math.floor` fails here.
      const lastOfFirst = pointerToCell({
        ...base,
        clientX: clientAt(originX + cellSize - 1, scale, RECT_ORIGIN.left),
        clientY: clientAt(originY, scale, RECT_ORIGIN.top),
      });
      const firstOfSecond = pointerToCell({
        ...base,
        clientX: clientAt(originX + cellSize, scale, RECT_ORIGIN.left),
        clientY: clientAt(originY, scale, RECT_ORIGIN.top),
      });

      expect(lastOfFirst).toEqual({ col: 0, row: 0 });
      expect(firstOfSecond).toEqual({ col: 1, row: 0 });
    });

    // THE far-edge assertion: one device pixel past the drawn grid must be `null`, never
    // `col === cols`. A clamped or unguarded result there feeds `toFlatIndex` a coordinate that
    // wraps onto the next row and repaints a plausible-looking WRONG cell (dirtyCells.ts).
    it('returns null one pixel past the right and bottom edges — never col === cols', () => {
      const scale = 1;
      const base = makeInput({
        size,
        cssWidth: CSS_WIDTH,
        cssHeight: CSS_HEIGHT,
        scale,
        clientX: 0,
        clientY: 0,
      });
      const { originX, originY, drawWidth, drawHeight } = base.layout;

      expect(
        pointerToCell({
          ...base,
          clientX: clientAt(originX + drawWidth, scale, RECT_ORIGIN.left),
          clientY: clientAt(originY, scale, RECT_ORIGIN.top),
        }),
      ).toBeNull();
      expect(
        pointerToCell({
          ...base,
          clientX: clientAt(originX, scale, RECT_ORIGIN.left),
          clientY: clientAt(originY + drawHeight, scale, RECT_ORIGIN.top),
        }),
      ).toBeNull();
    });

    // A non-integer scale is the ordinary case on a 150%-scaled Windows display, and it is what a
    // `devicePixelRatio` read (instead of the canvas's own measured ratio) gets wrong whenever the
    // element is CSS-scaled independently of its backing store.
    it('maps correctly at a non-integer device-pixel scale (1.5)', () => {
      const scale = 1.5;
      const base = makeInput({
        size,
        cssWidth: CSS_WIDTH,
        cssHeight: CSS_HEIGHT,
        scale,
        clientX: 0,
        clientY: 0,
      });
      const { cellSize, originX, originY } = base.layout;
      const targetCol = 7;
      const targetRow = 5;

      // The centre of (7, 5) in device px, converted back to a CSS client coordinate.
      const deviceX = originX + targetCol * cellSize + cellSize / 2;
      const deviceY = originY + targetRow * cellSize + cellSize / 2;

      expect(
        pointerToCell({
          ...base,
          clientX: clientAt(deviceX, scale, RECT_ORIGIN.left),
          clientY: clientAt(deviceY, scale, RECT_ORIGIN.top),
        }),
      ).toEqual({ col: targetCol, row: targetRow });
    });

    it('maps every cell of the first and last row and column', () => {
      const scale = 1;
      const base = makeInput({
        size,
        cssWidth: CSS_WIDTH,
        cssHeight: CSS_HEIGHT,
        scale,
        clientX: 0,
        clientY: 0,
      });
      const { cellSize, originX, originY } = base.layout;
      const centreOf = (col: number, row: number) =>
        pointerToCell({
          ...base,
          clientX: clientAt(originX + col * cellSize + cellSize / 2, scale, RECT_ORIGIN.left),
          clientY: clientAt(originY + row * cellSize + cellSize / 2, scale, RECT_ORIGIN.top),
        });

      for (let col = 0; col < size.cols; col++) {
        expect(centreOf(col, 0)).toEqual({ col, row: 0 });
        expect(centreOf(col, size.rows - 1)).toEqual({ col, row: size.rows - 1 });
      }
      for (let row = 0; row < size.rows; row++) {
        expect(centreOf(0, row)).toEqual({ col: 0, row });
        expect(centreOf(size.cols - 1, row)).toEqual({ col: size.cols - 1, row });
      }
    });

    // The centring margin is real, clickable screen area that belongs to no cell (AC3). A tall box
    // against a 5:3 grid letterboxes top and bottom.
    it('returns null for a pointer in the centring margin', () => {
      const scale = 1;
      const base = makeInput({
        size,
        cssWidth: CSS_WIDTH,
        cssHeight: CSS_WIDTH, // deliberately square: guarantees a vertical letterbox
        scale,
        clientX: 0,
        clientY: 0,
      });
      expect(base.layout.originY).toBeGreaterThan(0);

      // One pixel above the grid's first row, horizontally inside it.
      expect(
        pointerToCell({
          ...base,
          clientX: clientAt(base.layout.originX + 1, scale, RECT_ORIGIN.left),
          clientY: clientAt(base.layout.originY - 1, scale, RECT_ORIGIN.top),
        }),
      ).toBeNull();
      // One pixel below the grid's last row.
      expect(
        pointerToCell({
          ...base,
          clientX: clientAt(base.layout.originX + 1, scale, RECT_ORIGIN.left),
          clientY: clientAt(base.layout.originY + base.layout.drawHeight, scale, RECT_ORIGIN.top),
        }),
      ).toBeNull();
    });

    it('returns null for a pointer outside the canvas entirely', () => {
      const scale = 1;
      const base = makeInput({
        size,
        cssWidth: CSS_WIDTH,
        cssHeight: CSS_HEIGHT,
        scale,
        clientX: 0,
        clientY: 0,
      });

      expect(pointerToCell({ ...base, clientX: RECT_ORIGIN.left - 5, clientY: 100 })).toBeNull();
      expect(pointerToCell({ ...base, clientX: 100, clientY: RECT_ORIGIN.top - 5 })).toBeNull();
      expect(
        pointerToCell({ ...base, clientX: RECT_ORIGIN.left + CSS_WIDTH + 5, clientY: 100 }),
      ).toBeNull();
    });
  });

  // A canvas that is display:none, detached, or simply un-laid-out (always, under jsdom) reports a
  // zero box. `canvasWidth / 0` is Infinity, and `Infinity` floors to a garbage index that
  // `markDirty` would throw `DirtyCellRangeError` on from inside a pointer handler (trap 9).
  it('returns null for a degenerate zero-width or zero-height rect', () => {
    const size = { cols: 50, rows: 30 };
    const layout = computeGridLayout({ width: 500, height: 300 }, size, true);
    const base: PointerToCellInput = {
      rect: { left: 0, top: 0, width: 0, height: 0 },
      canvasWidth: 500,
      canvasHeight: 300,
      layout,
      size,
      clientX: 10,
      clientY: 10,
    };

    expect(pointerToCell(base)).toBeNull();
    expect(pointerToCell({ ...base, rect: { left: 0, top: 0, width: 500, height: 0 } })).toBeNull();
    expect(pointerToCell({ ...base, rect: { left: 0, top: 0, width: 0, height: 300 } })).toBeNull();
  });

  it('returns null for a zero-sized backing store', () => {
    const size = { cols: 50, rows: 30 };
    const layout = computeGridLayout({ width: 0, height: 0 }, size, true);
    expect(
      pointerToCell({
        rect: { left: 0, top: 0, width: 500, height: 300 },
        canvasWidth: 0,
        canvasHeight: 0,
        layout,
        size,
        clientX: 10,
        clientY: 10,
      }),
    ).toBeNull();
  });

  it('returns null for non-finite client coordinates', () => {
    const size = { cols: 50, rows: 30 };
    const layout = computeGridLayout({ width: 500, height: 300 }, size, true);
    const base: PointerToCellInput = {
      rect: { left: 0, top: 0, width: 500, height: 300 },
      canvasWidth: 500,
      canvasHeight: 300,
      layout,
      size,
      clientX: Number.NaN,
      clientY: 10,
    };

    expect(pointerToCell(base)).toBeNull();
    expect(pointerToCell({ ...base, clientX: 10, clientY: Number.POSITIVE_INFINITY })).toBeNull();
  });

  // review (2026-08-26): the ONLY pair of geometry inputs the earlier finiteness guard did not
  // actually cover, despite the file's own comment claiming otherwise. A non-finite `rect.left`/
  // `rect.top` NaN-poisons `deviceX`/`deviceY`, and every `<`/`>=` comparison against NaN is
  // false — so without this guard the function falls through to `{ col: NaN, row: NaN }` instead
  // of `null`, which is exactly the ungoverned coordinate `markDirty` throws on.
  it('returns null for a non-finite rect.left or rect.top', () => {
    const size = { cols: 50, rows: 30 };
    const layout = computeGridLayout({ width: 500, height: 300 }, size, true);
    const base: PointerToCellInput = {
      rect: { left: Number.NaN, top: 0, width: 500, height: 300 },
      canvasWidth: 500,
      canvasHeight: 300,
      layout,
      size,
      clientX: 10,
      clientY: 10,
    };

    expect(pointerToCell(base)).toBeNull();
    expect(
      pointerToCell({
        ...base,
        rect: { left: 0, top: Number.POSITIVE_INFINITY, width: 500, height: 300 },
      }),
    ).toBeNull();
  });

  // `showGridLines` changes only `gridLinesVisible`, never `cellSize`/`originX`/`originY`
  // (gridLayout.ts) — which is what makes the component's "recompute the layout in the handler"
  // approach (forced decision 1b) safe even if the two ever disagreed on that one flag.
  it('is unaffected by the showGridLines flag', () => {
    const size = { cols: 50, rows: 30 };
    const shared = { cssWidth: 500, cssHeight: 300, scale: 1, clientX: 100, clientY: 100, size };
    expect(pointerToCell(makeInput({ ...shared, showGridLines: true }))).toEqual(
      pointerToCell(makeInput({ ...shared, showGridLines: false })),
    );
  });
});
