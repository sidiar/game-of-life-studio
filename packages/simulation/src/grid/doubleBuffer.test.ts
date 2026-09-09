import { describe, expect, it } from 'vitest';
import { createGrid } from './grid';
import { createGridBuffers, swapGridBuffers } from './doubleBuffer';

describe('createGridBuffers', () => {
  it('pairs the given grid as `front` with a fresh, empty `back` of the same size', () => {
    const front = createGrid(4, 3);
    front.occupant[0] = 9;

    const buffers = createGridBuffers(front);

    expect(buffers.front).toBe(front);
    expect(buffers.back.width).toBe(4);
    expect(buffers.back.height).toBe(3);
    expect(buffers.back.occupant.every((cell) => cell === 0)).toBe(true);
    expect(buffers.back.age.every((cell) => cell === 0)).toBe(true);
  });

  it('gives `back` its own buffers — writing it cannot touch `front`', () => {
    const buffers = createGridBuffers(createGrid(3, 3));

    buffers.back.occupant[4] = 1;
    buffers.back.age[4] = 5;

    expect(buffers.front.occupant[4]).toBe(0);
    expect(buffers.front.age[4]).toBe(0);
    expect(buffers.back.occupant).not.toBe(buffers.front.occupant);
    expect(buffers.back.age).not.toBe(buffers.front.age);
  });
});

describe('swapGridBuffers', () => {
  it('returns a NEW pair with the roles exchanged, mutating nothing', () => {
    const buffers = createGridBuffers(createGrid(2, 2));
    const { front, back } = buffers;

    const swapped = swapGridBuffers(buffers);

    expect(swapped).not.toBe(buffers);
    expect(swapped.front).toBe(back);
    expect(swapped.back).toBe(front);
    // The original value is untouched — a caller still holding it sees the pre-swap roles.
    expect(buffers.front).toBe(front);
    expect(buffers.back).toBe(back);
  });

  it('swapping twice returns to the original roles', () => {
    const buffers = createGridBuffers(createGrid(2, 2));

    const twice = swapGridBuffers(swapGridBuffers(buffers));

    expect(twice.front).toBe(buffers.front);
    expect(twice.back).toBe(buffers.back);
  });

  it('reuses the two grids across swaps — no allocation per cycle (AR-17, A.6)', () => {
    // The whole point of the seam: at up to 20 cycles/second a fresh Uint8Array + Uint16Array per
    // cycle is exactly the churn A.6's ~144 KB steady-state budget is a budget FOR, not a
    // per-cycle allowance. Identity equality across many swaps is what pins that.
    const buffers = createGridBuffers(createGrid(8, 8));
    const grids = new Set([buffers.front, buffers.back]);

    let current = buffers;
    for (let cycle = 0; cycle < 50; cycle++) {
      current = swapGridBuffers(current);
      grids.add(current.front);
      grids.add(current.back);
    }

    expect(grids.size).toBe(2);
  });
});
