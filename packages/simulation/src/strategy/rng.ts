// The seeded generator Phase 3's Dominance tie-break draws from (AR-19, FR-5.4, RFC-004 §3.1).

/**
 * The injected random source. `int(n)` returns a uniform integer in `[0, n)`.
 *
 * ⚠️ INJECTED, never reached for. Nothing in this package calls `Math.random()`: FR-5.4's tie-break
 * is the one non-deterministic decision a cycle makes, and AR-19 pins it behind this interface so a
 * test can seed it and get the same battle every run. A `Math.random()` anywhere below the session
 * boundary makes every golden in Story 3.6's suite flaky in CI only.
 *
 * ⚠️ "Config, not outcome" (A-2): a battle persists and exports NO seed. The generator is a runtime
 * input like the buffers are — tests construct it with `FIXED_SEED`, production with a fresh one —
 * so two runs of the same saved battle may legitimately differ wherever Dominance actually ties.
 *
 * The interface is DELIBERATELY one method. `@gol/test-utils`'s `createSeededRng` returns this
 * shape structurally and declines to export a competing `Rng` type precisely so this declaration
 * could land here without a collision (`seededRng.ts`: *"@gol/simulation owns that name"*); a
 * second method added here would break that with no error on the test-utils side until a call
 * site fails.
 */
export interface Rng {
  int(maxExclusive: number): number;
}

const UINT32_RANGE = 4294967296; // 2^32

/**
 * mulberry32 — the PRODUCTION generator (story FD4, option (a)).
 *
 * ## Why this ships here rather than being deferred (the one deliberate exception)
 *
 * This repo declares no name for what it does not build (Stories 3.1, 3.4, 3.5 all declined to).
 * The thing deferred here would not be a name, though — `SimulationDeps.rng` is a REQUIRED field,
 * and without a production factory the only ways to fill it at Story 3.10 are to import
 * `@gol/test-utils` from `apps/web` production code (banned in `eslint.config.mjs`, and banned
 * inside `packages/*` only by convention — see `deferred-work.md`) or to invent a third mulberry32
 * in `apps/web`, where nothing property-tests it. Shipping the twenty lines next to the engine they
 * feed is the smaller cost.
 *
 * ❌ NOT an option: making `@gol/test-utils` depend on `@gol/simulation` and re-exporting. That
 * closes a dependency cycle — `@gol/simulation` devDepends on `@gol/test-utils` — for a small
 * generator.
 *
 * ⚠️ The duplication with `@gol/test-utils`'s `createSeededRng` is REAL and is made non-silent by a
 * DIFFERENTIAL test (`rng.test.ts`): both generators must produce the same sequence from the same
 * seed, so drift in either copy is a red test rather than a quietly different battle (M13's
 * spirit — a value duplicated across a seam is pinned, not trusted).
 *
 * ⚠️ The SEED is the caller's. This function does not mint one, and there is deliberately no
 * `createRng()` overload that reaches for `Math.random()`: "fresh seed in production" is a policy
 * about a run, decided where a run is started (Story 3.8/3.10), and a defaulted seed would make
 * "which seed did this battle use" unanswerable at exactly the call sites that need to answer it.
 *
 * This closure carries mutable state, which is the one shape AR-16's "no internal mutable state"
 * ban does NOT cover: the ban is on the simulation core, and a seedable generator is what that core
 * is INJECTED WITH. `int` is a pure call at the site (`deps.rng.int(n)`); the advancing state lives
 * in here.
 */
export function createRng(seed: number): Rng {
  // `seed >>> 0` coerces silently rather than rejecting: 1.5 and 1 collapse to the same state, and
  // NaN and Infinity both become 0. Two nominally different seeds producing an identical sequence
  // makes a divergence test pass vacuously — the exact failure a seeded generator exists to rule
  // out.
  if (!Number.isInteger(seed)) {
    throw new Error(`createRng: seed must be an integer, got ${seed}`);
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
    int(maxExclusive: number): number {
      // A bare `% maxExclusive` answers `int(0)` with NaN, which the caller then uses as an offset
      // into a claim run and reads back `undefined` rather than throwing — the failure surfaces
      // somewhere else entirely. Phase 3 only ever calls this with a tie count >= 2, so the guard
      // costs nothing on the hot path and catches a hand-built caller.
      if (!Number.isInteger(maxExclusive) || maxExclusive < 1) {
        throw new Error(`int: maxExclusive must be a positive integer, got ${maxExclusive}`);
      }

      // Rejection sampling, not plain modulo. 2^32 is not divisible by most bounds, so `% n` maps
      // the leftover head of the range onto the low values and favours them — a real skew in the
      // FR-5.4 tie-break, which under a roster of equal-Dominance organisms would bias every
      // contested cell toward the lowest ref. Discarding the partial final block makes the result
      // genuinely uniform. The loop is bounded in expectation by 2 iterations.
      const limit = UINT32_RANGE - (UINT32_RANGE % maxExclusive);
      let value = nextUint32();
      while (value >= limit) value = nextUint32();
      return value % maxExclusive;
    },
  };
}
