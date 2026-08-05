import { describe, expect, it } from 'vitest';
import { createSeededRng, FIXED_SEED } from './seededRng';

describe('createSeededRng', () => {
  it('the same seed produces the same sequence across two independently created generators', () => {
    const a = createSeededRng(FIXED_SEED);
    const b = createSeededRng(FIXED_SEED);

    const sequenceA = Array.from({ length: 20 }, () => a.int(1000));
    const sequenceB = Array.from({ length: 20 }, () => b.int(1000));

    expect(sequenceA).toEqual(sequenceB);
  });

  it('different seeds diverge', () => {
    const a = createSeededRng(1);
    const b = createSeededRng(2);

    const sequenceA = Array.from({ length: 20 }, () => a.int(1000));
    const sequenceB = Array.from({ length: 20 }, () => b.int(1000));

    expect(sequenceA).not.toEqual(sequenceB);
  });

  it('int(n) always returns a value in [0, n)', () => {
    const rng = createSeededRng(FIXED_SEED);
    for (let i = 0; i < 200; i += 1) {
      const value = rng.int(7);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(7);
      expect(Number.isInteger(value)).toBe(true);
    }
  });

  it('advances internal state — consecutive calls are not all identical', () => {
    const rng = createSeededRng(FIXED_SEED);
    const values = Array.from({ length: 10 }, () => rng.int(1_000_000));
    expect(new Set(values).size).toBeGreaterThan(1);
  });
});
