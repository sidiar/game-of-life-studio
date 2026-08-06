import { emptyGrid, gridFromPattern } from '@gol/test-utils';
import { describe, expect, it } from 'vitest';
import { toRenderableGrid } from './renderableGrid';

describe('toRenderableGrid', () => {
  it('round-trips a dense grid through occupant by index', () => {
    const dense = gridFromPattern(['.X.', 'XXX', '.X.'], { '.': 0, X: 1 });
    const renderable = toRenderableGrid(dense);

    expect(renderable.width).toBe(3);
    expect(renderable.height).toBe(3);
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 3; col++) {
        expect(renderable.occupant[row * 3 + col]).toBe(dense[row][col]);
      }
    }
  });

  it('age is all zeros and a Uint16Array — every initial grid starts at age 0', () => {
    const dense = gridFromPattern(['.X', 'X.'], { '.': 0, X: 1 });
    const { age } = toRenderableGrid(dense);

    expect(age).toBeInstanceOf(Uint16Array);
    expect(Array.from(age)).toEqual([0, 0, 0, 0]);
  });

  it('occupant is a Uint8Array of length width * height', () => {
    const dense = emptyGrid(5, 4);
    const { occupant } = toRenderableGrid(dense);

    expect(occupant).toBeInstanceOf(Uint8Array);
    expect(occupant.length).toBe(20);
  });

  it('throws naming the row on a ragged input', () => {
    const ragged = [
      [0, 0, 0],
      [0, 0],
      [0, 0, 0],
    ];
    expect(() => toRenderableGrid(ragged)).toThrow(/row 1/);
  });

  it('a 0x0 grid produces empty buffers without throwing', () => {
    const renderable = toRenderableGrid([]);
    expect(renderable.width).toBe(0);
    expect(renderable.height).toBe(0);
    expect(renderable.occupant.length).toBe(0);
    expect(renderable.age.length).toBe(0);
  });
});
