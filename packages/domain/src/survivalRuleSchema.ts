import { z } from 'zod';

// Bounded so MAX_RELEVANT_AGE = maxAgeLiteral + 1 (RFC-004 §3.3) always fits the Uint16 age
// buffer (RFC-004 §3.4). Property-specific tightening (neighbour counts are really 0-8) is
// editor-level UX (Epic 4), not schema (RFC-004 §2.4).
const NumericLiteral = z.number().int().min(0).max(65534);
const NumericPattern = z.union([NumericLiteral, z.tuple([NumericLiteral, NumericLiteral])]);

const NumericCondition = z
  .object({
    property: z.enum(['age', 'neighborCount', 'occupantNeighborCount']),
    operator: z.enum(['eq', 'gt', 'lt', 'gte', 'lte', 'range']),
    pattern: NumericPattern,
  })
  .refine((c) => (c.operator === 'range') === Array.isArray(c.pattern), {
    message: '`range` requires a [min,max] tuple; other operators require a scalar',
  })
  // An inverted tuple is satisfiable by no value at all, so the rule never fires and the
  // author gets no signal — the engine just evaluates a dead condition on every cell, every
  // cycle. Cheap to reject here; undetectable once it reaches the grid.
  .refine((c) => !Array.isArray(c.pattern) || c.pattern[0] <= c.pattern[1], {
    message: 'a `range` pattern must be [min,max] with min <= max',
  });

const CellStateCondition = z.object({
  property: z.literal('cellState'),
  operator: z.literal('eq'),
  // Relative to the evaluating organism: alive = self, occupied = another (Decision C)
  pattern: z.enum(['empty', 'alive', 'occupied']),
});

const OrganismTypeCondition = z.object({
  property: z.literal('organismType'),
  operator: z.literal('eq'),
  // Target organism's stable LIBRARY ID (Decision E) — never a numeric ref; compiled to an
  // OrganismRef at simulation start (RFC-004 §3.5). Non-empty: an empty id matches no
  // library entry, so the condition could never be satisfied.
  pattern: z.string().min(1),
});

export const ConditionSchema = z.discriminatedUnion('property', [
  CellStateCondition,
  OrganismTypeCondition,
  NumericCondition,
]);

// The condition universe, read off the schema objects above — never a second literal tuple
// that could drift from them (the Story 4.10 RULE_ACTIONS rule, at the source). Consumers:
// the editor's condition builder (Story 4.11) and the AR-45 coverage matrix in
// @gol/test-utils, which used to hand-list both. NOT consumed by @gol/simulation, whose
// @gol/domain edge is test-only by design (Story 3.2): validateRules.ts keeps its own copies.
export const CELL_STATES: readonly CellState[] = CellStateCondition.shape.pattern.options;
export const NUMERIC_OPERATORS: readonly NumericOperator[] =
  NumericCondition.shape.operator.options;
export const NUMERIC_CONDITION_PROPERTIES: readonly NumericConditionProperty[] =
  NumericCondition.shape.property.options;
// Design-doc order (organism-editor-design.md:387-411): the two singletons, then numerics.
export const CONDITION_PROPERTIES: readonly Condition['property'][] = [
  CellStateCondition.shape.property.value,
  OrganismTypeCondition.shape.property.value,
  ...NUMERIC_CONDITION_PROPERTIES,
];

export type CellState = z.infer<typeof CellStateCondition>['pattern'];
export type NumericOperator = z.infer<typeof NumericCondition>['operator'];
export type NumericConditionProperty = z.infer<typeof NumericCondition>['property'];

const SurvivalPayloadSchema = z.object({
  summary: z.string().max(120),
  action: z.enum(['born', 'survive', 'die']),
});

// Generic Rule shape (RFC-004 §1.1 `Rule<Payload>`) composed with the GoL condition union +
// payload. `id`/`contentHash` are validated as opaque strings only — generation happens where
// organisms are authored (Epic 4) or the engine needs a cache key (Epic 3), not here.
// Both are non-empty: the Decision E.4 evaluator cache is keyed on contentHash, so an empty
// hash would collide across every rule in the workspace and return the wrong compiled closure.
export const SurvivalRuleSchema = z.object({
  id: z.string().min(1),
  contentHash: z.string().min(1),
  conditions: z.array(ConditionSchema).min(1),
  payload: SurvivalPayloadSchema,
});

export const SurvivalRulesSchema = z.array(SurvivalRuleSchema); // a generic RuleSet

export type Condition = z.infer<typeof ConditionSchema>;
export type SurvivalRule = z.infer<typeof SurvivalRuleSchema>;
export type SurvivalRules = z.infer<typeof SurvivalRulesSchema>;

export type RuleAction = z.infer<typeof SurvivalRuleSchema>['payload']['action'];
// The action universe, read off the schema (the Story 4.10 RULE_ACTIONS rule, moved here in
// Story 4.12 for symmetry with the condition constants above). Consumers: the editor's
// action <select> and badge (`ruleDraft.ts` re-exports it), the test-utils matrix.
export const RULE_ACTIONS: readonly RuleAction[] =
  SurvivalRuleSchema.shape.payload.shape.action.options;
