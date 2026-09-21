import { RULE_ACTIONS, type RuleAction, type SurvivalRule } from '@gol/domain';
import { type ConditionDraft, conditionDraftFrom } from './conditionDraft';

/**
 * The rule-under-edit vocabulary (Story 4.10, FR-2.5/FR-2.6). Lives in `lib/organisms/` — the
 * mirror of `organismDraft.ts` — and not `@gol/domain`, because a draft shape is editor-level UX
 * (the schema's own comment at `survivalRuleSchema.ts:4-5`: "property-specific tightening … is
 * editor-level UX (Epic 4), not schema"), never a persisted shape. `MAX_RULE_SUMMARY_LENGTH` lives
 * here rather than beside `MAX_ORGANISM_NAME_LENGTH` for the same reason: that constant IS the
 * schema's own bound, and this one is a tighter cap INSIDE the schema's 120 (FD2 — the conflict is
 * recorded, not silently resolved, in the story's deferred-work entry).
 */

// Moved to `@gol/domain` in Story 4.12, for symmetry with the condition constants there — this
// re-export is what keeps every existing importer of `ruleDraft.ts` unchanged.
export { RULE_ACTIONS, type RuleAction } from '@gol/domain';

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

/** Design doc `:768`, verbatim. The displayed-error view of `SurvivalRuleSchema`'s
 * `conditions.min(1)` (Story 4.13); the persisted-shape view is Story 4.16's parse. */
export const RULE_NEEDS_CONDITION = 'Rule must have at least one condition';

/** A rule with no rows cannot fire (FR-2.5: AND over zero conditions is not a rule the
 * engine accepts — `conditions.min(1)`). A rule WITH rows is judged row by row by
 * `validateConditionDraft`; the two are exclusive, never additive. */
export function ruleNeedsCondition(rule: RuleDraft): boolean {
  return rule.conditions.length === 0;
}

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
 * Story 4.16 parses `{ ...rule, contentHash }`, Story 4.17 seeds `rules.map(strip hash)` — and
 * with conditions as `ConditionDraft`s — text patterns and an editor-only id; Story 4.16 maps them
 * through `conditionFromDraft`.
 */
export interface RuleDraft {
  readonly id: string;
  readonly conditions: readonly ConditionDraft[];
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

/** Moves the rule with `id` to `toIndex` (clamped to the list), every other rule by
 * reference and in its previous relative order. Returns the SAME array reference when `id`
 * matches nothing or the clamped target IS the rule's current index — a boundary ArrowUp on
 * the first card must not re-render the list (Story 4.12, FR-2.6: order is priority). */
export function moveRule(
  rules: readonly RuleDraft[],
  id: string,
  toIndex: number,
): readonly RuleDraft[] {
  const from = rules.findIndex((rule) => rule.id === id);
  const moved = rules[from];
  if (from === -1 || moved === undefined) return rules;
  const to = Math.max(0, Math.min(rules.length - 1, toIndex));
  if (to === from) return rules;
  const rest = rules.filter((rule) => rule.id !== id);
  return [...rest.slice(0, to), moved, ...rest.slice(to)];
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

/** Applies `update` to the conditions of the rule with `id`. Same array reference when `id`
 * matches nothing OR `update` returns the same conditions array (a no-op stays a no-op all the
 * way up to the modal's functional setDraft). Every other rule by reference. */
export function updateRuleConditions(
  rules: readonly RuleDraft[],
  id: string,
  update: (conditions: readonly ConditionDraft[]) => readonly ConditionDraft[],
): readonly RuleDraft[] {
  const target = rules.find((rule) => rule.id === id);
  if (!target) return rules;
  const conditions = update(target.conditions);
  if (conditions === target.conditions) return rules;
  return rules.map((rule) => (rule.id === id ? { ...rule, conditions } : rule));
}

/** A persisted rule as a draft: `contentHash` dropped, the rule's own `id` KEPT (RFC-004 §2.4 —
 * never re-minted), each condition through `conditionDraftFrom` with an id from `nextId`.
 * Story 4.17's seed and the test fixtures' one source of `RuleDraft`s. */
export function ruleDraftFrom(rule: SurvivalRule, nextId: () => string): RuleDraft {
  return {
    id: rule.id,
    conditions: rule.conditions.map((condition) => conditionDraftFrom(condition, nextId())),
    payload: rule.payload,
  };
}
