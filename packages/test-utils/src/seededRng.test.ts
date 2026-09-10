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

  // A bare `% maxExclusive` answered int(0) with NaN, which a caller uses as an array index and
  // reads back `undefined` — the failure then surfaces somewhere else entirely.
  it('rejects a maxExclusive that is not a positive integer', () => {
    const rng = createSeededRng(FIXED_SEED);
    expect(() => rng.int(0)).toThrow(/positive integer/);
    expect(() => rng.int(-1)).toThrow(/positive integer/);
    expect(() => rng.int(2.5)).toThrow(/positive integer/);
    expect(() => rng.int(Number.NaN)).toThrow(/positive integer/);
  });

  // Above 2^32 the rejection limit is 0 and `while (value >= 0)` never exits — a hang where the
  // guard promises a throw. 2^32 itself is the largest bound a 32-bit draw can cover.
  it('rejects a bound above 2^32 rather than spinning forever', () => {
    const rng = createSeededRng(FIXED_SEED);
    expect(() => rng.int(2 ** 32 + 1)).toThrow(/no greater than 2\^32/);
    expect(rng.int(2 ** 32)).toBeLessThan(2 ** 32);
  });

  // `seed >>> 0` collapsed 1.5 to 1 and NaN to 0, so two nominally different seeds could produce
  // an identical sequence and a divergence test would pass vacuously.
  it('rejects a non-integer seed rather than silently coercing it', () => {
    expect(() => createSeededRng(1.5)).toThrow(/must be an integer/);
    expect(() => createSeededRng(Number.NaN)).toThrow(/must be an integer/);
  });

  it('accepts a negative integer seed and stays deterministic', () => {
    const sequenceFrom = (seed: number) => {
      const rng = createSeededRng(seed);
      return Array.from({ length: 10 }, () => rng.int(1000));
    };

    expect(sequenceFrom(-7)).toEqual(sequenceFrom(-7));
  });

  // int() promises uniformity, and 2^32 is not divisible by most bounds — plain modulo favours the
  // low values. Rejection sampling is what makes the FR-5.4 dominance tie-break unskewed.
  it('is close to uniform for a bound that does not divide 2^32', () => {
    const rng = createSeededRng(FIXED_SEED);
    const buckets = new Array<number>(7).fill(0);
    const samples = 70_000;
    for (let i = 0; i < samples; i += 1) buckets[rng.int(7)] += 1;

    const expected = samples / 7;
    for (const count of buckets) {
      expect(Math.abs(count - expected) / expected).toBeLessThan(0.05);
    }
  });
});
