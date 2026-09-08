// The generic, domain-blind rules engine (RFC-004 Part 1). Everything exported here is parametric
// over an arbitrary subject S and an opaque Payload — no cell, no organism, no grid, no action.
// Story 3.2 adds the Game of Life binding (CellSubject, resolveCellAction) alongside it, in
// src/gol/, and the ESLint import boundary over src/engine/ is what keeps the two from merging.
//
// Story 1.1's `GOL_SIMULATION` / `SIMULATION_DEPENDS_ON` placeholders are retired here (story FD5).
// GOL_SIMULATION proved nothing, and SIMULATION_DEPENDS_ON existed only to prove the declared
// "@gol/domain": "*" workspace edge still resolved — a job now done for real, and better, by
// src/domainRuleSetCompatibility.test.ts, which imports @gol/domain and is covered by
// `tsc --noEmit` via this package's `include: ["src"]`. The dependency stays declared in
// package.json: Story 3.2 needs the edge in production code.
//
// ❌ No schema surface. RFC-004 §1.5's `makeRuleSchema(payloadSchema, conditionSchema)` helper is
// RETIRED, not pending (M11): its only intended caller already exists and bypasses it — Story 1.3
// authored the concrete ConditionSchema / SurvivalRuleSchema directly in @gol/domain from §2.4 —
// and shipping it would add a `zod` dependency to this package, pulling a parsing library into the
// engine that project-context keeps at the boundaries. Validation stays at the persistence
// boundary; §1.5 is marked stale in the RFC so this is not re-litigated in 3.2.
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
