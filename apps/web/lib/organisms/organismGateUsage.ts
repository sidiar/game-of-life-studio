import {
  referencingOrganismIds,
  resolveOrganismUsage,
  type BattleSummary,
  type OpenBattleUsage,
  type Organism,
  type RuleReferenceIndex,
  type UsageIndex,
} from '@gol/domain';
import {
  referencingOrganismNames,
  usageBattleNames,
  type OrganismGateUsage,
} from '@/lib/organisms/usageLabels';

/**
 * The open battle as the FR-1.3 gate and the editor footer see it (Story 4.24, M7): the domain's
 * `OpenBattleUsage` (id + the LIVE placed set) plus the live name the entry is labelled by
 * (RFC-005 Decision 8). `null`/absent everywhere but the battle origin.
 */
export interface OpenBattleContext extends OpenBattleUsage {
  readonly name: string;
}

/**
 * Story 4.24, AC6: the resolved usage an Edit press hands to `useOrganismEditorModal.requestEdit`
 * — the SAME three derivations `<OrganismEditorModal>`'s footer renders from (Story 4.20's "counts
 * are consistent across all surfaces"): `resolveOrganismUsage` → `usageBattleNames` for the names
 * behind N, the rule index's per-RULE count for M, and `referencingOrganismNames` for the DISTINCT
 * organisms behind M. One function so the Library's card Edit and the battle roster's ✎ cannot
 * drift apart from each other.
 *
 * ⚠️ `openBattle.organismIds` must be the LIVE placed set, never the roster union (the
 * `OpenBattleUsage` doc) — this function trusts it as given.
 */
export function resolveOrganismGateUsage(
  organismId: string,
  data: {
    readonly usageIndex: UsageIndex;
    readonly ruleIndex: RuleReferenceIndex;
    readonly summaries: readonly Pick<BattleSummary, 'id' | 'name'>[];
    readonly library: readonly Organism[];
    readonly openBattle?: OpenBattleContext | null;
  },
): OrganismGateUsage {
  const { usageIndex, ruleIndex, summaries, library, openBattle = null } = data;
  const entries = resolveOrganismUsage(usageIndex, organismId, openBattle);
  return {
    battleNames: usageBattleNames(entries, summaries, openBattle),
    ruleCount: ruleIndex.get(organismId)?.length ?? 0,
    referencingNames: referencingOrganismNames(
      referencingOrganismIds(ruleIndex, organismId),
      library,
    ),
  };
}
