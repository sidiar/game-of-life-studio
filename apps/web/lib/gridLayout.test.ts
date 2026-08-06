import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { computeGridLayout } from './gridLayout';

describe('computeGridLayout — cellSize', () => {
  it('is the exact floor(canvasPx / dimension) for 100x60 at several canvas sizes', () => {
    const size = { cols: 100, rows: 60 };
    expect(computeGridLayout({ width: 1000, height: 600 }, size, true).cellSize).toBe(10);
    expect(computeGridLayout({ width: 500, height: 300 }, size, true).cellSize).toBe(5);
    expect(computeGridLayout({ width: 2000, height: 1200 }, size, true).cellSize).toBe(20);
  });

  it('is the exact floor(canvasPx / dimension) for 50x30 at several canvas sizes', () => {
    const size = { cols: 50, rows: 30 };
    expect(computeGridLayout({ width: 500, height: 300 }, size, true).cellSize).toBe(10);
    expect(computeGridLayout({ width: 250, height: 150 }, size, true).cellSize).toBe(5);
    expect(computeGridLayout({ width: 1000, height: 600 }, size, true).cellSize).toBe(20);
  });

  it('is constrained by the smaller ratio — a tall canvas is limited by width, not height', () => {
    // Non-5:3 canvas, deliberately taller than the grid's own aspect ratio: width caps it at 5,
    // even though height alone would allow 100.
    const layout = computeGridLayout({ width: 500, height: 6000 }, { cols: 100, rows: 60 }, true);
    expect(layout.cellSize).toBe(5);
  });

  it('never reaches 0 across a sweep of canvas widths 1..300 for every editable preset', () => {
    for (const size of [
      { cols: 50, rows: 30 },
      { cols: 100, rows: 60 },
    ]) {
      for (let width = 1; width <= 300; width++) {
        const layout = computeGridLayout({ width, height: width }, size, true);
        expect(layout.cellSize).toBeGreaterThanOrEqual(1);
      }
    }
  });
});

describe('computeGridLayout — centring', () => {
  it('leaves origin non-negative and the drawn grid within the canvas bounds', () => {
    for (const canvas of [
      { width: 1000, height: 600 },
      { width: 997, height: 601 },
      { width: 2000, height: 1200 },
    ]) {
      const layout = computeGridLayout(canvas, { cols: 100, rows: 60 }, true);
      expect(layout.originX).toBeGreaterThanOrEqual(0);
      expect(layout.originY).toBeGreaterThanOrEqual(0);
      expect(layout.originX * 2 + layout.drawWidth).toBeLessThanOrEqual(canvas.width + 1);
      expect(layout.originY * 2 + layout.drawHeight).toBeLessThanOrEqual(canvas.height + 1);
    }
  });
});

describe('computeGridLayout — grid lines', () => {
  it('suppresses lines below the 4px threshold even when requested', () => {
    const layout = computeGridLayout({ width: 150, height: 90 }, { cols: 100, rows: 60 }, true);
    expect(layout.cellSize).toBeLessThan(4);
    expect(layout.gridLinesVisible).toBe(false);
  });

  it('shows lines at or above the 4px threshold when requested', () => {
    const layout = computeGridLayout({ width: 400, height: 240 }, { cols: 100, rows: 60 }, true);
    expect(layout.cellSize).toBeGreaterThanOrEqual(4);
    expect(layout.gridLinesVisible).toBe(true);
  });

  it('showGridLines: false always wins, regardless of cellSize', () => {
    const layout = computeGridLayout({ width: 2000, height: 1200 }, { cols: 100, rows: 60 }, false);
    expect(layout.cellSize).toBeGreaterThanOrEqual(4);
    expect(layout.gridLinesVisible).toBe(false);
  });
});

describe('computeGridLayout — degenerate input', () => {
  it('a 0x0 canvas does not divide by zero or produce NaN', () => {
    const layout = computeGridLayout({ width: 0, height: 0 }, { cols: 100, rows: 60 }, true);
    expect(Number.isNaN(layout.cellSize)).toBe(false);
    expect(Number.isNaN(layout.originX)).toBe(false);
    expect(Number.isNaN(layout.originY)).toBe(false);
    expect(layout.cellSize).toBeGreaterThanOrEqual(1);
  });
});

describe('computeGridLayout — property: cellSize is always a positive integer that fits', () => {
  it('holds across realistic cols/rows/canvas ranges', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 200 }),
        fc.integer({ min: 1, max: 200 }),
        fc.integer({ min: 1, max: 4000 }),
        fc.integer({ min: 1, max: 4000 }),
        (cols, rows, width, height) => {
          const layout = computeGridLayout({ width, height }, { cols, rows }, true);
          expect(Number.isInteger(layout.cellSize)).toBe(true);
          expect(layout.cellSize).toBeGreaterThan(0);
          expect(layout.cellSize * cols <= width || layout.cellSize === 1).toBe(true);
        },
      ),
    );
  });
});
