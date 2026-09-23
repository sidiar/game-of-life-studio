/**
 * The Decision E.5 rule-reference index: `targetOrganismId → RuleReference[]`, DERIVED from the
 * organism library's own rules on every read — never a stored structure, never a persisted field.
 *
 * This is the axis `usageIndex.ts` is NOT. "Used" means PLACED on a battle grid (Decision H) and is
 * answered from battle summaries; "referenced" means named by another organism's rule and is
 * answered from `survivalRules`. Every spec that mentions both keeps them apart, and so do these
 * two modules — deleting an organism has to clear both, and conflating them would make one answer
 * silently stand in for the other.
 *
 * ⚠️ **A rule names its target by the stable LIBRARY ID in an `organismType` condition's `pattern`
 * (Decision E).** There is no field called `targetOrganismId` anywhere in the schema, and there is
 * never a numeric `OrganismRef` at rest — refs are battle-relative and compiled at simulation start
 * (RFC-004 §3.5), so an index built from them would name a different organism in every battle.
 *
 * ⚠️ **The index value counts RULES; `referencingOrganismIds` counts ORGANISMS.** FR-1.7 renders
 * "Targeted by [M] organism rule(s)" while RFC-005 Decision 8 describes
 * `targetOrganismId → referencingOrganismId[]`; those are two different numbers over the same scan.
 * `index.get(target)?.length ?? 0` is M, and `referencingOrganismIds(index, target)` is the list —
 * one structure, both answers, no caller re-deriving either. Cloning an organism (Story 4.18)
 * copies its rules, so it really does add a second reference to everything the source targets:
 * two rules, across two organisms, and both axes report the truth.
 *
 * ⚠️ **No transitive closure, no visited set, no cycle guard here** — those are `organismClosure.ts`'s
 * (Story 5.4), which consumes `ruleTargetIds` rather than re-deriving "a rule targets X" over the
 * same conditions (`lane-gates.yaml`). Nothing here recurses, and nothing memoizes: memoization lives at the call
 * site (RFC-005 Decision 8), because a cache in this package would be module-level state under a
 * `"sideEffects": false` contract.
 *
 * Consumers: Story 4.20's "Targeted by [M] organism rule(s)" footer and popover, Story 4.21's
 * delete block, Story 5.4's transitive export closure.
 */

import type { Organism } from './organismSchema';
import type { SurvivalRule } from './survivalRuleSchema';

/**
 * One rule of one organism naming one target.
 *
 * ⚠️ `ruleId` is not a stable key for a rendered list: `SurvivalRulesSchema` is a plain array with
 * no uniqueness refine on `id`, so a hand-edited or imported organism can carry two rules with one
 * id, and they arrive here as two indistinguishable entries. The COUNT stays right — M is a count
 * of rules, and there really are two — but a consumer that keys on `ruleId` alone collides; key on
 * the entry's position or on `organismId` + index instead.
 */
export interface RuleReference {
  readonly organismId: string;
  readonly ruleId: string;
}

export type RuleReferenceIndex = ReadonlyMap<string, readonly RuleReference[]>;

/**
 * The organisms ONE rule targets, in condition order, each at most once.
 *
 * Two `organismType` conditions naming the same organism are one reference: the rule references
 * that target, and it does so once. `conditions` carries no uniqueness refine, so a hand-edited or
 * imported record really can repeat one — the same defensive posture `buildUsageIndex` takes for a
 * `BattleSummary` whose `organismIds` repeats an id.
 *
 * `selfId` is dropped here rather than at the consumer (Decision E.5): deleting an organism deletes
 * its own rules with it, so a self-reference must never block its own delete, and excluding it at
 * the source keeps Story 5.4's closure off a self-edge and Story 4.21 from filtering the same id
 * twice. A self-reference is a real input, not a hypothetical — a persisted one renders as
 * `Unknown organism` in the editor and is accepted, not repaired (Story 4.13).
 */
function ruleTargets(rule: Pick<SurvivalRule, 'conditions'>, selfId: string): readonly string[] {
  const seen = new Set<string>();
  for (const condition of rule.conditions) {
    // `ConditionSchema` is a discriminated union on `property`, so this narrows `pattern` to the
    // target's library id with no cast.
    if (condition.property === 'organismType' && condition.pattern !== selfId) {
      seen.add(condition.pattern);
    }
  }
  return [...seen];
}

/**
 * Every organism THIS organism's rules target — de-duplicated across its rules, in condition order,
 * self excluded. The forward edge: one definition of "a rule targets X", which
 * `buildRuleReferenceIndex` folds over and Story 5.4's export closure walks.
 *
 * A dangling target (one matching no organism in the library) is returned, never filtered: judging
 * that would need the library as a second input and would make the answer disagree with the data —
 * which is exactly the corruption Story 5.8's referential-closure assertion exists to catch.
 */
export function ruleTargetIds(organism: Pick<Organism, 'id' | 'survivalRules'>): readonly string[] {
  const targets = new Set<string>();
  for (const rule of organism.survivalRules) {
    for (const target of ruleTargets(rule, organism.id)) {
      targets.add(target);
    }
  }
  return [...targets];
}

/**
 * Inverts the forward edge into `targetOrganismId → RuleReference[]` in one pass over the library.
 *
 * `Pick<…>` so a test can pass minimal literals while a full `Organism` still assigns. Entries
 * appear in organism input order, then `survivalRules` order within an organism — which is rule
 * PRIORITY (FR-2.6), not a display order; the caller sorts if it needs one.
 */
export function buildRuleReferenceIndex(
  organisms: readonly Pick<Organism, 'id' | 'survivalRules'>[],
): RuleReferenceIndex {
  const index = new Map<string, RuleReference[]>();
  for (const organism of organisms) {
    for (const rule of organism.survivalRules) {
      for (const target of ruleTargets(rule, organism.id)) {
        const reference: RuleReference = { organismId: organism.id, ruleId: rule.id };
        const references = index.get(target);
        if (references === undefined) {
          index.set(target, [reference]);
        } else {
          references.push(reference);
        }
      }
    }
  }
  return index;
}

/**
 * The epic's literal index shape: the DISTINCT organisms whose rules target `targetOrganismId`, in
 * first-reference order — what Story 4.20's popover lists and Story 4.21's block names.
 *
 * Returns `[]` rather than `undefined` for an id nothing references: this one is a list, not a map
 * read, and every caller of it renders or counts a list.
 */
export function referencingOrganismIds(
  index: RuleReferenceIndex,
  targetOrganismId: string,
): readonly string[] {
  const references = index.get(targetOrganismId);
  if (references === undefined) {
    return [];
  }
  return [...new Set(references.map((reference) => reference.organismId))];
}
