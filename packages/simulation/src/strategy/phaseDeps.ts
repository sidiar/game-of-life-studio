// ── src/strategy/ — the three-phase strategy's own layer (RFC-004 §3.1/§3.2) ───────────────────
//
// WHAT BELONGS HERE (story FD6): code the RAF loop calls once per CYCLE and that WALKS THE GRID.
// Phase 1 (`deathPhase.ts`), Phase 2 (`birthSurvivalPhase.ts`) and its claims value
// (`claims.ts`), the neighbour tally they scan with (`neighborTally.ts`), and — Story 3.6's —
// Phase 3 and the assembled `threePhaseStep`.
//
// WHAT DOES NOT:
//   - `src/engine/` — domain-blind, parametric over an arbitrary subject. These phases know
//     cells, organisms, actions and grids by construction, so they are a CALLER of it and the
//     boundary lint (eslint.config.mjs + scripts/check-engine-boundary.mjs) keeps it that way.
//   - `src/gol/` — "decides about ONE cell in isolation" (`cellSubject.ts`, `resolveCellAction.ts`).
//     The distinction this directory exists to hold is one-cell vs. whole-grid; mixing them is how
//     a per-cell `.filter` ends up inside a 6,000-cell loop.
//   - `src/session/` — "computed once per battle run and consumed per cell" (Story 3.4's FD8,
//     which explicitly excluded what the RAF loop calls). Nothing here is memoized across cycles.
//   - `src/grid/` — the representation and its arithmetic, with no notion of a rule.
//
// ❌ No classes, no `this`, no module-level mutable state (AR-16). Every value a phase needs is a
// parameter; every value it produces is returned or written into a destination the caller owns.
import type { OrganismEvaluators } from '../session/compileEvaluators';

/**
 * What Phases 1 and 2 read off the session — and nothing more (story FD1).
 *
 * RFC-004 §3.1's `SimulationDeps` (as amended by M15) names three members: `evaluatorsByRef`,
 * `organisms` and `rng`. These two phases read ONLY the first: `organisms` (its `dominance`) and
 * `rng` are Phase 3's, and `organisms`' `agingEnabled` is Story 3.6's cycle-end step. Declaring the full `SimulationDeps` here would
 * publish two fields no shipped code reads and no test can exercise as used — the same call Story
 * 3.1 made against `RuleSetCollection` and Story 3.4's FD1 made against `OrganismRuntime`.
 *
 * **`SimulationDeps` is Story 3.6's to declare**, when it has something to put in the other two
 * fields. Nothing is lost by waiting: a wider object satisfies this narrower parameter
 * structurally, so `threePhaseStep(grid, deps)` can hand its full `SimulationDeps` straight to
 * both phases with no adapter.
 */
export interface PhaseDeps {
  /**
   * REF-indexed, `length = roster length + 1`, slot 0 an explicit `null` (M14/M15).
   *
   * ⚠️ TWO CONVENTIONS LIVE IN ONE DEPS OBJECT and both are correct in their place: this table is
   * read as `evaluatorsByRef[ref]`, while the ROSTER array Story 3.6 adds is read as
   * `organisms[ref - 1]`. `evaluatorsByRef[ref - 1]` here is not a crash — it runs every
   * organism's NEIGHBOUR's rules and produces a plausible battle no golden test names. Iterate as
   * `for (let ref = 1; ref < evaluatorsByRef.length; ref++)`; `for…of` hands you slot 0's `null`
   * first.
   */
  readonly evaluatorsByRef: readonly (OrganismEvaluators | null)[];
}

/**
 * The evaluators for a ref READ OFF A GRID, or `null` when that ref names no compiled organism.
 *
 * ⚠️ `evaluatorsByRef[ref]` is `OrganismEvaluators | null` only WITHIN range — beyond it the array
 * hands back `undefined`, and `undefined.resolvesToDeath` crashes the cycle from inside the loop.
 * A grid carrying a ref past the compiled roster is unreachable through persistence
 * (`BattleSchema` validates `v <= organismIds.length`) but is an ordinary in-memory shape bug, the
 * same class `deferred-work.md` tracks elsewhere; Story 3.4's eager sweep validates RULES, not
 * grids.
 *
 * Story decision (Trap 14): **guard and fail closed**, per M12 — an unrecognised occupant behaves
 * as an organism with no rules (no explicit death in Phase 1, no claim in Phase 2, so it is gone at
 * cycle end by implicit death) rather than throwing inside the 60 FPS loop. One `=== undefined`
 * per occupied cell, the same trade `operators.ts` argues for and at the same scale.
 *
 * ⚠️ Phase 2 does NOT go through here, and that is not an oversight: its refs come from the
 * TABLE'S OWN indices (`1 .. length - 1`), so `undefined` is unreachable by construction and the
 * only case left is the declared `null`. Guarding a ref that cannot be out of range would buy
 * nothing for 120,000 calls a cycle at the NFR-1.1 baseline.
 */
export function evaluatorsFor(deps: PhaseDeps, ref: number): OrganismEvaluators | null {
  const evaluators = deps.evaluatorsByRef[ref];
  return evaluators === undefined ? null : evaluators;
}
