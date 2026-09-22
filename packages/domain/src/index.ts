export {
  CELL_STATES,
  CONDITION_PROPERTIES,
  ConditionSchema,
  NUMERIC_CONDITION_PROPERTIES,
  NUMERIC_OPERATORS,
  RULE_ACTIONS,
  SurvivalRuleSchema,
  SurvivalRulesSchema,
} from './survivalRuleSchema';
export type {
  CellState,
  Condition,
  NumericConditionProperty,
  NumericOperator,
  RuleAction,
  SurvivalRule,
  SurvivalRules,
} from './survivalRuleSchema';

export {
  OrganismSchema,
  EditableGridPresetSchema,
  MAX_ORGANISM_NAME_LENGTH,
  MIN_DOMINANCE,
  MAX_DOMINANCE,
  NEW_ORGANISM_DOMINANCE,
  ORGANISM_SCHEMA_VERSION,
} from './organismSchema';
export type { Organism, EditableGridPreset } from './organismSchema';

export { BattleSchema, BattleSummarySchema, MAX_BATTLE_NAME_LENGTH } from './battleSchema';
export type { Battle, BattleSummary } from './battleSchema';

export { CURRENT_FORMAT_VERSION, DEFAULT_SETTINGS, SettingsSchema } from './settingsSchema';
export type { Settings } from './settingsSchema';

export { CONWAYS_CLASSIC, CONWAYS_CLASSIC_ID, DEFAULT_WORKSPACE } from './defaultWorkspace';

// Decision H.1's prune + Decision E.2's remap over the at-rest grid (Story 2.13's save path;
// Story 5.8's atomic import needs the identical projection).
export { pruneAndRemapBattleGrid } from './battleProjection';
export type { PrunedBattleGrid } from './battleProjection';

// The AR-15 organism-usage index, derived from `battles.list()` summaries (Decision H.4). Landed in
// Story 4.17 for the FR-1.3 edit gate; Story 4.19 extends the same module.
export { buildUsageIndex } from './usageIndex';
export type { UsageIndex } from './usageIndex';
