// Arbitrary integer — the VALUE carries no meaning, its STABILITY across every test run does
// (RFC-008 Decision 4: fixed seed in tests, fresh seed in production).
export const FIXED_SEED = 20260716;

/**
 * The `Rng` shape RFC-004 §3.1 uses (`deps.rng.int(n)`) but never declares. Declared structurally
 * and locally here — never as `@gol/simulation`'s own type, which does not exist yet and would
 * create a `test-utils <-> simulation` workspace cycle Turborepo rejects (forced decision 4, Dev
 * Notes). TypeScript is structural, so this shape satisfies Epic 3's eventual `Rng` interface with
 * zero churn when that type lands.
 */
export interface Rng {
  /** A uniform integer in [0, maxExclusive). */
  int(maxExclusive: number): number;
}

/**
 * mulberry32 — a small, deterministic, dependency-free PRNG. The one place in this package a
 * closure legitimately carries mutable state (RFC-004 §3.1's `Rng` is consumed as
 * `deps.rng.int(top.length)`, a pure call at the SITE — the advancing state lives inside this
 * closure, not in the caller). This is deliberately NOT the class-based/internal-mutable-state
 * pattern the engine itself bans; the ban is on the simulation core, not on a seedable generator
 * that core is injected with.
 */
export function createSeededRng(seed: number): Rng {
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
      return nextUint32() % maxExclusive;
    },
  };
}
