export { ConditionSchema, SurvivalRuleSchema, SurvivalRulesSchema } from './survivalRuleSchema';
export type { Condition, SurvivalRule, SurvivalRules } from './survivalRuleSchema';

export { OrganismSchema, EditableGridPresetSchema } from './organismSchema';
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
