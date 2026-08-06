// Arbitrary integer — the VALUE carries no meaning, its STABILITY across every test run does
// (RFC-008 Decision 4: fixed seed in tests, fresh seed in production).
export const FIXED_SEED = 20260716;

const UINT32_RANGE = 4294967296; // 2^32

/**
 * mulberry32 — a small, deterministic, dependency-free PRNG. The one place in this package a
 * closure legitimately carries mutable state (RFC-004 §3.1's `Rng` is consumed as
 * `deps.rng.int(top.length)`, a pure call at the SITE — the advancing state lives inside this
 * closure, not in the caller). This is deliberately NOT the class-based/internal-mutable-state
 * pattern the engine itself bans; the ban is on the simulation core, not on a seedable generator
 * that core is injected with.
 *
 * The return type is written structurally and inline rather than as an exported `Rng` interface:
 * `@gol/simulation` owns that name and declares it in Epic 3 (forced decision 4, Dev Notes), and
 * publishing it from here would both pre-empt that and collide with it. TypeScript is structural,
 * so this shape satisfies Epic 3's `Rng` with zero churn when the real type lands.
 */
export function createSeededRng(seed: number): { int(maxExclusive: number): number } {
  // `seed >>> 0` silently coerces rather than rejecting: 1.5 and 1 collapse to the same state, and
  // NaN/Infinity both become 0. Two nominally different seeds producing an identical sequence
  // would make a divergence test pass vacuously — the exact failure a seeded RNG exists to rule out.
  if (!Number.isInteger(seed)) {
    throw new Error(`createSeededRng: seed must be an integer, got ${seed}`);
  }

  let state = seed >>> 0;

  function nextUint32(): number {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (t ^ (t >>> 14)) >>> 0;
  }

  return {
    /** A uniform integer in [0, maxExclusive). */
    int(maxExclusive: number): number {
      // A bare `% maxExclusive` answers `int(0)` with NaN, which a caller then uses as an array
      // index and reads back `undefined` rather than throwing — the failure surfaces as a missing
      // value somewhere else entirely. Negative and fractional bounds break the documented
      // [0, maxExclusive) contract just as quietly.
      if (!Number.isInteger(maxExclusive) || maxExclusive < 1) {
        throw new Error(`int: maxExclusive must be a positive integer, got ${maxExclusive}`);
      }

      // Rejection sampling, not plain modulo. 2^32 is not divisible by most bounds, so `% n` maps
      // the leftover head of the range onto the low values and favours them — a real skew in the
      // FR-5.4 dominance tie-break this generator is built to drive. Discarding the partial final
      // block makes the result genuinely uniform, as the doc comment above promises. The loop is
      // bounded in expectation by 2 iterations and cannot spin for small `maxExclusive`.
      const limit = UINT32_RANGE - (UINT32_RANGE % maxExclusive);
      let value = nextUint32();
      while (value >= limit) value = nextUint32();
      return value % maxExclusive;
    },
  };
}
