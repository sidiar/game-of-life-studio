import { describe, expect, it } from 'vitest';
import { MAX_DOMINANCE, MIN_DOMINANCE } from '@gol/domain';
import { clampDominance, isDominanceInRange } from './dominance';

describe('clampDominance', () => {
  it.each([
    [0, 1],
    [101, 100],
    [5, 5],
    [1, 1],
    [100, 100],
    [Infinity, 100],
    [-Infinity, 1],
  ])('clamps %s to %s', (n, expected) => {
    // `%s`, not `%j`: JSON serialises `Infinity` as `null`, so `%j` would title the two
    // non-finite rows "clamps null to …".

    expect(clampDominance(n)).toBe(expected);
  });

  // Defaults derive from the exports, never a literal — a drift in the constant must fail here,
  // not stay silently correct because the test also hardcoded the old number.
  it('defaults min/max from the domain exports, not literals', () => {
    expect(clampDominance(0)).toBe(MIN_DOMINANCE);
    expect(clampDominance(101)).toBe(MAX_DOMINANCE);
  });

  it('honours explicit min/max overrides', () => {
    expect(clampDominance(3, 5, 10)).toBe(5);
    expect(clampDominance(20, 5, 10)).toBe(10);
    expect(clampDominance(7, 5, 10)).toBe(7);
  });
});

describe('isDominanceInRange', () => {
  it('is true at both boundaries', () => {
    expect(isDominanceInRange(MIN_DOMINANCE)).toBe(true);
    expect(isDominanceInRange(MAX_DOMINANCE)).toBe(true);
  });

  it('is false just outside both boundaries', () => {
    expect(isDominanceInRange(MIN_DOMINANCE - 1)).toBe(false);
    expect(isDominanceInRange(MAX_DOMINANCE + 1)).toBe(false);
  });
});
