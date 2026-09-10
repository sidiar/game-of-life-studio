// The generic, domain-blind rules engine (RFC-004 Part 1) plus the Game of Life binding on top of
// it (RFC-004 Part 2, Story 3.2). Everything under `./engine/` is parametric over an arbitrary
// subject S and an opaque Payload — no cell, no organism, no grid, no action. `./gol/` is a
// CALLER of it (CellSubject, cellSelectors, resolveCellAction) and the ESLint import boundary over
// src/engine/ is what keeps the two from merging in the other direction.
//
// Story 1.1's `GOL_SIMULATION` / `SIMULATION_DEPENDS_ON` placeholders are retired here (story FD5).
// GOL_SIMULATION proved nothing, and SIMULATION_DEPENDS_ON existed only to prove the declared
// "@gol/domain": "*" workspace edge still resolved — a job now done for real, and better, by
// src/domainRuleSetCompatibility.test.ts, which imports @gol/domain and is covered by
// `tsc --noEmit` via this package's `include: ["src"]`. The dependency stays declared in
// package.json even though Story 3.2 (FD1 option (b)) keeps the edge TEST-ONLY: `./gol/` declares
// its own Action/SurvivalPayload/SurvivalRule/SurvivalRules rather than importing @gol/domain's, so
// only domainRuleSetCompatibility.test.ts's assignability pins exercise the dependency — forward
// (domain -> engine) at the RuleSet/Rule/Condition levels, and BOTH directions at the payload
// level, which is what keeps FD1's duplication from drifting silently.
//
// ❌ No schema surface. RFC-004 §1.5's `makeRuleSchema(payloadSchema, conditionSchema)` helper is
// RETIRED, not pending (M11): its only intended caller already exists and bypasses it — Story 1.3
// authored the concrete ConditionSchema / SurvivalRuleSchema directly in @gol/domain from §2.4 —
// and shipping it would add a `zod` dependency to this package, pulling a parsing library into the
// engine that project-context keeps at the boundaries. Validation stays at the persistence
// boundary; §1.5 is marked stale in the RFC and stays retired in 3.2.
//
// Types are re-exported with `export type` — `isolatedModules` is repo-wide and a bare
// `export { SomeType }` fails to compile.
export {
  conditionIsSatisfiedBy,
  ruleIsSatisfiedBy,
  firstSatisfiedBy,
} from './engine/firstSatisfiedBy';
export type { Operator } from './engine/operators';
export type { Condition, Rule, RuleSet, Selector, Selectors } from './engine/rule';

export { cellSelectors } from './gol/cellSubject';
export type { CellProperty, CellState, CellSubject, OrganismRef } from './gol/cellSubject';
export { resolveCellAction } from './gol/resolveCellAction';
export type { Action, SurvivalPayload, SurvivalRule, SurvivalRules } from './gol/survivalRules';

// The grid layer (RFC-004 §3.4, Story 3.3) — the typed-array representation the engine runs on,
// the dense<->typed conversion at its boundary, the Moore neighbourhood, the pure resize, and the
// double-buffer seam the whole cycle writes into: Phase 1 into `back`, Phase 3 in place over it,
// and the SWAP is the caller's (Story 3.8's loop). `apps/web` consumes `Grid` through its own
// `RenderableGrid` alias (lib/canvas/renderableGrid.ts), which is now a re-export of this type
// rather than a structural twin of it — Cross-RFC Reconciliation #3's runtime boundary lives here,
// not in @gol/persistence, which must stay a leaf over @gol/domain (AR-2/27).
export { clearGrid, createGrid, gridFromDense, gridToDense } from './grid/grid';
export type { Grid } from './grid/grid';
export { createGridBuffers, swapGridBuffers } from './grid/doubleBuffer';
export type { GridBuffers } from './grid/doubleBuffer';
export { countNeighbors } from './grid/neighborhood';
export type { NeighborCounts } from './grid/neighborhood';
export { resizeGrid } from './grid/resizeGrid';

// The session layer (RFC-004 §3.5, Story 3.4) — the once-per-battle-run boundary where persisted,
// string-keyed, workspace-shared organism data becomes battle-relative numbers and closures:
// id -> OrganismRef interning (Decision E.3), the two phase-partitioned evaluators per organism
// (AR-18), the session-scoped compile cache (Decision E.4), MAX_RELEVANT_AGE (Decision B.5), and
// the eager compile-time diagnostic sweep M12 assigns here. Phases 1 and 2 consume it as
// `PhaseDeps` (its `evaluatorsByRef`) and Phase 3 as `ConflictDeps` (its `maxRelevantAge`), which
// is why a `CompiledSession` spread with a roster and an `Rng` IS a `SimulationDeps` with no
// construction step. Nothing in it runs per cell.
export { compileSession } from './session/compileEvaluators';
export type {
  CompilableOrganism,
  CompiledSession,
  OrganismEvaluators,
} from './session/compileEvaluators';
export { internOrganismIds, NO_MATCH_REF } from './session/internOrganisms';
// `maxRelevantAge` is deliberately NOT exported: its numeric casts are sound only after
// `validateSurvivalRules`, which `compileSession` guarantees and a direct caller would not.
// `CompiledSession.maxRelevantAge` is the contract.
export {
  isRuleCompilationError,
  ROSTER_LEVEL,
  validateSurvivalRules,
} from './session/validateRules';
export type { RuleCompilationError } from './session/validateRules';

// The strategy layer (RFC-004 §3.1/§3.2, Stories 3.5 and 3.6) — the code that WALKS THE GRID
// rather than deciding about one cell, and the only code in this package that runs inside the
// NFR-1.1 frame budget. Phase 1 answers who is explicitly killed, Phase 2 answers who is asking to
// be here next cycle, and Phase 3 answers who WINS — by Dominance, ties broken through the
// injected seeded `Rng` (FR-5.4, AR-19) — then ages the winner and CLEARS every cell nobody
// claimed, which is implicit death (M10) and the load-bearing half of the write.
// `threePhaseStep` composes all three into the cycle; `activeStrategy` is the MVP's fixed
// selection (❌ no registry, descriptor or `beta` flag — §3.1 defers all of it).
//
// ⚠️ THE SWAP IS THE CALLER'S. `threePhaseStep(source, destination, deps)` returns the destination
// it wrote; Story 3.8's loop holds the `GridBuffers` and calls `swapGridBuffers`. Keeping the pair
// out of the strategy TYPE is what lets Story 3.9's preview instance (M3) and Story 4.15's
// draft-organism run reuse it.
//
// ⚠️ Every phase takes a caller-supplied DESTINATION rather than allocating (Story 3.5's FD2,
// Story 3.6's FD1), matching what `doubleBuffer.ts` was built for. RFC-004 §3.1/§3.2 carried
// allocation-shaped signatures until Story 3.6; **the RFC now states the destination-passing
// shape** — amended on Sidiar's explicit authorization (2026-09-10), the M14/M15 precedent.
export { deathPhase } from './strategy/deathPhase';
export { birthSurvivalPhase } from './strategy/birthSurvivalPhase';
export { conflictPhase } from './strategy/conflictPhase';
export { activeStrategy, threePhaseStep } from './strategy/threePhaseStep';
export { createRng } from './strategy/rng';
export type { Claims } from './strategy/claims';
export type { ConflictDeps, OrganismRuntime, PhaseDeps } from './strategy/phaseDeps';
export type { Rng } from './strategy/rng';
export type { SimulationDeps, SimulationStrategy } from './strategy/threePhaseStep';
