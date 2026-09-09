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
