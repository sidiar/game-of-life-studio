import type { BattleSummary, Organism, OrganismUsageEntry } from '@gol/domain';
import { battleDisplayName } from '@/lib/battleDisplayName';
import { resolveDisplayOrganisms } from '@/lib/displayOrganisms';

/**
 * The ONE copy site for FR-1.7's two usage labels, and the two name resolvers behind their
 * read-only panels (Story 4.20, AC5 / FD6).
 *
 * `battleCount` / `battleCountLabel` / `organismInUseMessage` moved here VERBATIM from
 * `OrganismInUseDialog.tsx`, where they shipped in Story 4.17. The editor footer renders the same
 * "Used in [N] Battle(s)" the dialog does, and the dialog is behind its own `next/dynamic`
 * boundary precisely to keep the MUI `Dialog` stack out of `/organisms`'s first load — an editor
 * importing a string from that module would staple the two lazy chunks together. A `lib/` module
 * both import is the seam (`battleDisplayName.ts` left `<BattleTile>` for the same reason).
 */

/**
 * `N Battle` / `N Battles` — real pluralisation, never the spec's "Battle(s)" shorthand (the
 * count badge's `Organism`/`Organisms` precedent).
 *
 * Exported (Story 4.21, FD5) so `deleteBlockCopy.ts`'s `battleBlockSentence` reuses the SAME
 * pluraliser rather than a second one — the dialog's "N Battles" is then the identical string the
 * footer and the 4.17 warning print. Still only imported by `deleteBlockCopy.ts`, which only the
 * lazy dialog chunk imports, so this eager module gains no new string.
 */
export function battleCount(n: number): string {
  return `${n} ${n === 1 ? 'Battle' : 'Battles'}`;
}

/** The AC's own name for the warning — "Used in [N] Battle(s)" — as the dialog's title and the
 * editor footer's first label. `0` is a legitimate value here: the footer renders
 * "Used in 0 Battles" as plain text (Story 4.20, AC3), while the dialog never opens on it. */
export function battleCountLabel(usedInBattles: number): string {
  return `Used in ${battleCount(usedInBattles)}`;
}

/** FR-1.3's sentence, verbatim from the PRD (`prd.md:125`), with the count interpolated. */
export function organismInUseMessage(usedInBattles: number): string {
  return `This organism is used in ${battleCount(usedInBattles)}. Editing it will affect all Battles that use it. Clone this organism first to create a Battle-specific variant?`;
}

/**
 * FR-1.7's second label, pluralised the same way.
 *
 * ⚠️ `m` counts RULES, not organisms — `index.get(id)?.length` over `buildRuleReferenceIndex`,
 * which is per rule, while the panel beneath this label lists `referencingOrganismIds`, which is
 * per organism (Decision E.5; the `ruleReferenceIndex.ts` head comment separates the two). One
 * organism targeting this one from two rules is `M = 2` with ONE name listed.
 */
export function ruleTargetCountLabel(ruleCount: number): string {
  return `Targeted by ${ruleCount} organism ${ruleCount === 1 ? 'rule' : 'rules'}`;
}

/**
 * RFC-005 Decision 8's label for a battle that has never been saved: there is no id to resolve a
 * name against, so the entry names itself.
 *
 * Unreachable until Story 4.24 passes an `openBattle` to `resolveOrganismUsage` — `battleId` is
 * `null` for that battle alone. Kept here, unit-tested, rather than guessed at when 4.24 lands:
 * it is forced by `OrganismUsageEntry`'s own type, which every caller of this resolver must total.
 */
export const UNSAVED_BATTLE_LABEL = 'Current Battle (unsaved)';

/**
 * The battle names behind "Used in [N] Battles", in the entry order `resolveOrganismUsage`
 * returns (Decision H — one derivation, one order, across every surface).
 *
 * Every name goes through `battleDisplayName`: `BattleSummarySchema.name` has no lower bound, so
 * `''` — and a name built only from invisible characters, which `trim()` does not strip — parses,
 * lists, and would render as an empty `<li>` that axe does not flag (Story 4.20, AC7 / FD10).
 */
export function usageBattleNames(
  entries: readonly OrganismUsageEntry[],
  summaries: readonly Pick<BattleSummary, 'id' | 'name'>[],
): readonly string[] {
  const names = new Map(summaries.map((summary) => [summary.id, summary.name] as const));
  return entries.map((entry) =>
    entry.battleId === null
      ? UNSAVED_BATTLE_LABEL
      : battleDisplayName(names.get(entry.battleId) ?? ''),
  );
}

/**
 * The names behind "Targeted by [M] organism rules" — the DISTINCT organisms whose rules target
 * the subject, as `referencingOrganismIds` returns them.
 *
 * Resolved through `resolveDisplayOrganisms` rather than a second lookup: it already owns the
 * `Unnamed organism` fallback for a record whose name is `''` (`OrganismSchema.name` has no lower
 * bound either) and the `Unknown organism` one for a dangling id, and that module's own contract
 * is that a second resolver is what must not be written (Story 2.9).
 */
export function referencingOrganismNames(
  organismIds: readonly string[],
  library: readonly Organism[],
): readonly string[] {
  return resolveDisplayOrganisms(organismIds, library).map((organism) => organism.name);
}
