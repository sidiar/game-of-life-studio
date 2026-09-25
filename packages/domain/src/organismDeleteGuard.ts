import { CONWAYS_CLASSIC_ID } from './defaultWorkspace';
import { referencingOrganismIds, type RuleReferenceIndex } from './ruleReferenceIndex';
import {
  resolveOrganismUsage,
  type OpenBattleUsage,
  type OrganismUsageEntry,
  type UsageIndex,
} from './usageIndex';

/**
 * Story 4.21's ONE verdict for "can this organism be deleted", consuming — never re-deriving —
 * the two referential-integrity axes: `resolveOrganismUsage` (Decision H, "placed on a battle",
 * including the M7 open-battle union) and `referencingOrganismIds` (Decision E.5, "named by
 * another organism's rule"). This lives in `@gol/domain`, not `apps/web`, for the same reason
 * both axes do: the project-context rule that referential-integrity logic is core and stays pure,
 * testable without a repository in sight (`packages/domain/src/usageIndex.ts` / `ruleReferenceIndex.ts`
 * head comments).
 *
 * `protected` is checked FIRST and wins over any usage (M9: "cannot be deleted regardless of
 * usage"). The alternative — checking usage first — would show Conway's Classic a battle-usage
 * block whose remedy ("remove it from those battles") implies the organism *becomes* deletable
 * once removed, which is false; `protected` is permanent and independent of the other two states.
 *
 * `blocked` carries BOTH lists whenever both are non-empty (FD4, Story 4.21 AC4): FR-1.4 lists
 * the two block reasons independently and no spec resolves the case where an organism is both
 * placed and targeted, so showing only the first reason would send the user away to fix one block
 * and back to a second, unannounced one. One verdict, one dialog, both sections, told once.
 *
 * Consumers: Story 4.21's block dialog (`OrganismDeleteBlockedDialog` via `<OrganismLibrary>`),
 * Story 4.22's confirmation and disabled-button paths (the SAME verdict decides `allowed` vs.
 * `protected` there), and Story 4.24's `openBattle` argument — already threaded through to
 * `resolveOrganismUsage` here so that story adds one argument in one place rather than a second
 * verdict.
 */
export type OrganismDeleteVerdict =
  | { readonly kind: 'protected' }
  | {
      readonly kind: 'blocked';
      readonly battles: readonly OrganismUsageEntry[];
      readonly referencingOrganismIds: readonly string[];
    }
  | { readonly kind: 'allowed' };

export function organismDeleteVerdict(
  organismId: string,
  usageIndex: UsageIndex,
  ruleIndex: RuleReferenceIndex,
  openBattle?: OpenBattleUsage | null,
): OrganismDeleteVerdict {
  // M9: checked before either axis is even read — a protected organism's usage never matters.
  if (organismId === CONWAYS_CLASSIC_ID) {
    return { kind: 'protected' };
  }

  // The SAME derivations Story 4.17's edit warning and Story 4.20's footer read — never
  // `usageIndex.get(id)?.length` or `ruleIndex.get(id)?.length` (the RULE count, not the
  // ORGANISM count Decision E.5 counts here; see `ruleReferenceIndex.ts`'s head comment).
  const battles = resolveOrganismUsage(usageIndex, organismId, openBattle);
  const referencing = referencingOrganismIds(ruleIndex, organismId);

  if (battles.length > 0 || referencing.length > 0) {
    return { kind: 'blocked', battles, referencingOrganismIds: referencing };
  }

  return { kind: 'allowed' };
}
