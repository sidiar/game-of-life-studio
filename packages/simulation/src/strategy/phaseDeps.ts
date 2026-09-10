// ── src/strategy/ — the three-phase strategy's own layer (RFC-004 §3.1/§3.2) ───────────────────
//
// WHAT BELONGS HERE (story FD6): code the RAF loop calls once per CYCLE and that WALKS THE GRID.
// Phase 1 (`deathPhase.ts`), Phase 2 (`birthSurvivalPhase.ts`) and its claims value
// (`claims.ts`), the neighbour tally they scan with (`neighborTally.ts`), Phase 3
// (`conflictPhase.ts`) with the seeded generator it draws from (`rng.ts`), and the assembled
// `threePhaseStep.ts` — the whole cycle now lives here (Story 3.6).
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
import type { Rng } from './rng';

/**
 * What Phases 1 and 2 read off the session — and nothing more (story FD1).
 *
 * RFC-004 §3.1's `SimulationDeps` (as amended by M15) names three members: `evaluatorsByRef`,
 * `organisms` and `rng`. These two phases read ONLY the first — `organisms` (its `dominance`) and
 * `rng` are Phase 3's, and are declared as `ConflictDeps` below. Declaring the whole of
 * `SimulationDeps` here would publish fields no phase in this file reads, the same call Story 3.1
 * made against `RuleSetCollection` and Story 3.4's FD1 made against `OrganismRuntime`.
 *
 * ⚠️ CORRECTED IN STORY 3.6 (spec-conflict flag). This comment used to add *"and `organisms`'
 * `agingEnabled` is Story 3.6's cycle-end step"*, which predicted an engine that reads
 * `agingEnabled`. It does not, and must not: FR-2.4 states the toggle *"affects visual rendering
 * only; cell-age tracking (FR-5.6) is unaffected — age remains engine state and a rule input
 * whether or not the visual effect is shown"*. The cycle-end step ages EVERY survivor
 * unconditionally; `agingEnabled` is consumed at RENDER time (RFC-002's `refToGroup`, Story 3.9's
 * `ageShade`). Gating the increment on it would silently stop an `age`-conditioned rule from ever
 * firing for a non-aging organism. `SimulationDeps` carries no `agingEnabled` for that reason.
 *
 * **`SimulationDeps` is declared in `threePhaseStep.ts`** (Story 3.6's FD2) and extends both this
 * and `ConflictDeps`. Nothing was lost by waiting: a wider object satisfies each narrower parameter
 * structurally, so the assembled step hands ONE deps value to all three phases with no adapter —
 * pinned in `threePhaseStep.test.ts` rather than asserted here.
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
 * What Phase 3 reads off an organism — and nothing more (story FD2, option (a)).
 *
 * RFC-004 §3.1 sketches this as `organisms: OrganismRuntime[] // dense array; dominance,
 * agingEnabled, …`. The `…` is not a contract, and `agingEnabled` is a RENDER input (FR-2.4), so
 * the shipped type carries the ONE field the strategy actually compares — the `CompilableOrganism`
 * precedent (Story 3.4's FD1), which likewise declined to reserve fields nothing reads. A field
 * published here is a field a later phase will eventually read "because it is there", and
 * `agingEnabled` is the specific one FR-2.4 forbids the engine to branch on.
 *
 * ⚠️ Dominance is FR-2.2's 1..100 scale, compared numerically and NEVER normalised or weighted
 * here: Phase 3's whole rule is "highest wins, ties random" (FR-5.4).
 *
 * M13: @gol/domain's `Organism` assigns INTO this structurally with no mapping layer; the pin —
 * including the exact key set, which is what keeps `agingEnabled` from creeping back in — lives in
 * ../domainRuleSetCompatibility.test.ts.
 */
export interface OrganismRuntime {
  readonly dominance: number;
}

/**
 * What Phase 3 reads (story FD5): the roster to compare Dominance across, the generator to break
 * ties with, and the per-battle age ceiling to clamp to.
 *
 * ⚠️ `organisms` is ROSTER-INDEXED and is read as `organisms[ref - 1]` (M14) — NOT `[ref]`, which
 * is correct for the ref-indexed `evaluatorsByRef` above and wrong here. **TWO CONVENTIONS SHIP IN
 * ONE DEPS OBJECT and both are right in their place.** `organisms[ref]` does not crash: it compares
 * the Dominance of the organism NEXT to the claimant, producing plausible battles that no golden
 * test names. `../grid/grid.ts`'s `occupant` doc carries the full statement of the encoding.
 *
 * ⚠️ INVARIANT, relied on rather than re-derived: `organisms.length === evaluatorsByRef.length - 1`
 * — the same roster, one indexed from 0 and the other from 1. A short `organisms` makes
 * `organisms[ref - 1]` `undefined` and the Dominance read throws from inside the cycle. That is
 * LOUD by choice and is not guarded per cell: every ref reaching Phase 3 came from
 * `evaluatorsByRef`'s own indices (`claims.ts` invariant 2), so the two arrays disagreeing is a
 * caller assembling `SimulationDeps` from two different rosters, not a data condition to survive.
 * The fail-closed treatment M12 asks for applies to an unrecognised OCCUPANT (Story 3.5's Trap 14,
 * handled in Phase 1), not to a malformed deps object.
 *
 * `maxRelevantAge` comes straight off `CompiledSession` (Decision B.5, ../session/maxRelevantAge.ts)
 * — it rides on the deps rather than being passed alongside so that a `CompiledSession` spread with
 * a roster and a generator satisfies the whole of `SimulationDeps` structurally, which is the
 * cheapest thing for Story 3.10 to construct.
 */
export interface ConflictDeps {
  readonly organisms: readonly OrganismRuntime[];
  readonly rng: Rng;
  readonly maxRelevantAge: number;
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
