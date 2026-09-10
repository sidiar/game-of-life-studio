import { createSeededRng, FIXED_SEED } from '@gol/test-utils';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { createRng } from './rng';
import type { Rng } from './rng';

describe('createRng — the production generator (story FD4, AR-19)', () => {
  it('is deterministic: the same seed replays the same sequence', () => {
    const draw = (seed: number): number[] => {
      const rng = createRng(seed);
      return Array.from({ length: 50 }, () => rng.int(10));
    };

    expect(draw(FIXED_SEED)).toEqual(draw(FIXED_SEED));
  });

  it('different seeds diverge', () => {
    const a = createRng(1);
    const b = createRng(2);
    const drawsA = Array.from({ length: 50 }, () => a.int(1000));
    const drawsB = Array.from({ length: 50 }, () => b.int(1000));

    expect(drawsA).not.toEqual(drawsB);
  });

  it('rejects a non-integer seed rather than coercing it', () => {
    // `seed >>> 0` would collapse 1.5 and 1 onto the same state, and NaN/Infinity onto 0 — two
    // nominally different seeds replaying one sequence makes a divergence test pass vacuously.
    expect(() => createRng(1.5)).toThrow(/seed must be an integer/);
    expect(() => createRng(Number.NaN)).toThrow(/seed must be an integer/);
  });

  it('rejects a non-positive or fractional bound rather than answering NaN', () => {
    const rng = createRng(FIXED_SEED);
    expect(() => rng.int(0)).toThrow(/maxExclusive must be a positive integer/);
    expect(() => rng.int(-1)).toThrow(/maxExclusive must be a positive integer/);
    expect(() => rng.int(2.5)).toThrow(/maxExclusive must be a positive integer/);
  });

  it('stays inside [0, maxExclusive) for every bound (fast-check)', () => {
    fc.assert(
      fc.property(fc.integer(), fc.integer({ min: 1, max: 5000 }), (seed, bound) => {
        const value = createRng(seed).int(bound);
        expect(Number.isInteger(value)).toBe(true);
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThan(bound);
      }),
    );
  });

  it('int(1) is always 0 — the degenerate bound Phase 3 never reaches', () => {
    // Phase 3 only draws when the tie count is >= 2, but a hand-built caller can pass 1 and the
    // rejection sampler must terminate rather than spin.
    const rng = createRng(FIXED_SEED);
    expect(Array.from({ length: 20 }, () => rng.int(1))).toEqual(
      Array.from({ length: 20 }, () => 0),
    );
  });

  it('REJECTS the partial final block rather than folding it onto the low values', () => {
    // The rejection loop is what makes the result uniform, and almost no bound exercises it: with
    // `int(3)` exactly one value in 2^32 is discarded. `2^31 + 1` is the pathological case — the
    // usable limit is 2^31 + 1, so roughly HALF of every draw is rejected and retried, which is
    // both the loop's only real workout and the strongest statement of why plain modulo is wrong
    // (it would map that whole half onto the bottom of the range).
    const bound = 2 ** 31 + 1;
    const rng = createRng(FIXED_SEED);

    for (let i = 0; i < 40; i++) {
      const value = rng.int(bound);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(bound);
    }
  });

  it('does not favour the low values a plain modulo would skew toward', () => {
    // Rejection sampling exists because 2^32 is not divisible by most bounds. This is a coarse
    // smoke test of uniformity, not a statistical proof: over 30,000 draws across 3 buckets every
    // bucket must be within 10% of a third, which a badly broken generator cannot manage.
    const rng = createRng(FIXED_SEED);
    const buckets = [0, 0, 0];
    for (let i = 0; i < 30000; i++) buckets[rng.int(3)]++;

    for (const count of buckets) {
      expect(count).toBeGreaterThan(9000);
      expect(count).toBeLessThan(11000);
    }
  });
});

describe('the duplication with @gol/test-utils is pinned, not trusted (M13, FD4)', () => {
  it('createRng and createSeededRng produce IDENTICAL sequences from the same seed', () => {
    // FD4 accepts shipping a second mulberry32 — `@gol/test-utils` is test-only, so a
    // `SimulationDeps.rng` no production code could construct would be filled at Story 3.10 by
    // either a banned test-utils import or a third copy in `apps/web` where nothing can
    // property-test it. This differential test is the whole justification: drift in either copy
    // is a RED TEST here rather than two subtly different battles.
    fc.assert(
      fc.property(fc.integer(), fc.integer({ min: 1, max: 256 }), (seed, bound) => {
        const mine = createRng(seed);
        const theirs = createSeededRng(seed);

        for (let i = 0; i < 25; i++) {
          expect(mine.int(bound)).toBe(theirs.int(bound));
        }
      }),
    );
  });

  it("createSeededRng's structural return type satisfies Rng (the seed-in-tests contract)", () => {
    // A type-level assignability pin, the `domainRuleSetCompatibility.test.ts` idiom.
    // `@gol/test-utils` deliberately exports no `Rng` type — "@gol/simulation owns that name" —
    // so this assignment is the only thing keeping the two shapes from drifting apart. Every
    // seeded golden in this story injects a `createSeededRng` where an `Rng` is required.
    const seeded = createSeededRng(FIXED_SEED);
    const asRng: Rng = seeded;

    expect(asRng).toBe(seeded);
    expect(asRng.int(4)).toBeLessThan(4);
  });
});
