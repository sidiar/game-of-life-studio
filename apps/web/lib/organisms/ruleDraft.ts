import { SurvivalRuleSchema, type Condition, type SurvivalRule } from '@gol/domain';

/**
 * The rule-under-edit vocabulary (Story 4.10, FR-2.5/FR-2.6). Lives in `lib/organisms/` — the
 * mirror of `organismDraft.ts` — and not `@gol/domain`, because a draft shape is editor-level UX
 * (the schema's own comment at `survivalRuleSchema.ts:4-5`: "property-specific tightening … is
 * editor-level UX (Epic 4), not schema"), never a persisted shape. `MAX_RULE_SUMMARY_LENGTH` lives
 * here rather than beside `MAX_ORGANISM_NAME_LENGTH` for the same reason: that constant IS the
 * schema's own bound, and this one is a tighter cap INSIDE the schema's 120 (FD2 — the conflict is
 * recorded, not silently resolved, in the story's deferred-work entry).
 */

export type RuleAction = SurvivalRule['payload']['action'];

/** The schema's own enum, in its own order — the `<select>` and the badge read this, never a
 * second literal tuple that could drift from it. */
export const RULE_ACTIONS: readonly RuleAction[] =
  SurvivalRuleSchema.shape.payload.shape.action.options;

/** Born / Survive / Die — the badge text and the `<select>` option text (UX-DR10). */
export function ruleActionLabel(action: RuleAction): string {
  switch (action) {
    case 'born':
      return 'Born';
    case 'survive':
      return 'Survive';
    case 'die':
      return 'Die';
  }
}

/** `organism-editor-design.md:587` — a new rule opens as Born. */
export const NEW_RULE_ACTION: RuleAction = 'born';

/** UX-DR10's 100 — the EDITOR's cap, tighter than `SurvivalPayloadSchema`'s schema-level 120
 * (FD2). Both are enforced: the editor never lets a summary reach 101, and the schema still
 * accepts up to 120 for records arriving through import/migration. */
export const MAX_RULE_SUMMARY_LENGTH = 100;

/** The `<select>`'s string value meets the `RuleAction` union here — the one narrowing, never an
 * `as RuleAction` cast (project-context: no escape hatches). */
export function isRuleAction(value: string): value is RuleAction {
  return (RULE_ACTIONS as readonly string[]).includes(value);
}

/**
 * A rule under edit: the persisted `SurvivalRule`'s exact nesting minus `contentHash`, with
 * `conditions` allowed empty. `SurvivalRuleSchema` requires `conditions.min(1)` and a non-empty
 * `contentHash` — neither exists the moment "+ Add Rule" is pressed (conditions are Story 4.11's,
 * the hash is Story 4.16's), so the draft cannot be the persisted type. Same nesting on purpose:
 * Story 4.16 parses `{ ...rule, contentHash }`, Story 4.17 seeds `rules.map(strip hash)`.
 */
export interface RuleDraft {
  readonly id: string;
  readonly conditions: readonly Condition[];
  readonly payload: { readonly summary: string; readonly action: RuleAction };
}

/** `createNewRuleDraft` takes the id — it does NOT call `crypto.randomUUID()` itself, so it stays
 * pure (no spy needed in its test) and the caller (`<OrganismEditorModal>`'s `addRule`) mints
 * exactly once outside any updater. */
export function createNewRuleDraft(id: string): RuleDraft {
  return { id, conditions: [], payload: { summary: '', action: NEW_RULE_ACTION } };
}

/** Appends `rule` at the bottom of the list (`organism-editor-design.md:586`) — a new array, never
 * a mutation of `rules`. */
export function appendRule(rules: readonly RuleDraft[], rule: RuleDraft): readonly RuleDraft[] {
  return [...rules, rule];
}

/** Removes the rule with `id`. Returns the SAME array reference when `id` matches nothing — no
 * spurious re-render for a stale delete. */
export function removeRule(rules: readonly RuleDraft[], id: string): readonly RuleDraft[] {
  if (!rules.some((rule) => rule.id === id)) return rules;
  return rules.filter((rule) => rule.id !== id);
}

/** Patches the `payload` of the rule with `id` (summary and/or action). Every other rule is kept
 * BY REFERENCE. Returns the SAME array reference when `id` matches nothing. */
export function updateRulePayload(
  rules: readonly RuleDraft[],
  id: string,
  patch: Partial<RuleDraft['payload']>,
): readonly RuleDraft[] {
  if (!rules.some((rule) => rule.id === id)) return rules;
  return rules.map((rule) =>
    rule.id === id ? { ...rule, payload: { ...rule.payload, ...patch } } : rule,
  );
}
