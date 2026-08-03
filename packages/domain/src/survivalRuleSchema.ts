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
  // OrganismRef at simulation start (RFC-004 §3.5).
  pattern: z.string(),
});

export const ConditionSchema = z.discriminatedUnion('property', [
  CellStateCondition,
  OrganismTypeCondition,
  NumericCondition,
]);

const SurvivalPayloadSchema = z.object({
  summary: z.string().max(120),
  action: z.enum(['born', 'survive', 'die']),
});

// Generic Rule shape (RFC-004 §1.1 `Rule<Payload>`) composed with the GoL condition union +
// payload. `id`/`contentHash` are validated as opaque strings only — generation happens where
// organisms are authored (Epic 4) or the engine needs a cache key (Epic 3), not here.
export const SurvivalRuleSchema = z.object({
  id: z.string(),
  contentHash: z.string(),
  conditions: z.array(ConditionSchema).min(1),
  payload: SurvivalPayloadSchema,
});

export const SurvivalRulesSchema = z.array(SurvivalRuleSchema); // a generic RuleSet

export type Condition = z.infer<typeof ConditionSchema>;
export type SurvivalRule = z.infer<typeof SurvivalRuleSchema>;
export type SurvivalRules = z.infer<typeof SurvivalRulesSchema>;
