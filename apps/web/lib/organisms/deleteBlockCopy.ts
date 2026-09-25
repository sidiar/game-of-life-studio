import { battleCount } from './usageLabels';

/**
 * Story 4.21's copy for `<OrganismDeleteBlockedDialog>`, and since Story 4.22 for
 * `<OrganismDeleteConfirmDialog>` too — kept in a module only the lazy DIALOG chunks import (FD5). `usageLabels.ts` is EAGER on `/organisms` as of Story 4.21 —
 * `<OrganismLibrary>` imports its name resolvers for click-time resolution (FD7) — so putting these
 * block strings there would put them in the first load for a dialog most sessions never open. `battleCount` is imported, not duplicated, so the dialog's
 * "N Battles" is the identical string the footer and the 4.17 in-use warning print.
 */

/** `Cannot delete <name>` — the dialog's consequence-first title (the shipped dialogs' convention). */
export function deleteBlockTitle(name: string): string {
  return `Cannot delete ${name}`;
}

/** FR-1.4's battle-usage sentence. `n` is `verdict.battles.length` — the SAME `resolveOrganismUsage`
 * derivation the 4.17 warning and the 4.20 footer read (never a re-derived count, FD3). */
export function battleBlockSentence(n: number): string {
  return `It is used in ${battleCount(n)}:`;
}

export const BATTLE_BLOCK_REMEDY =
  'Remove it from those Battles, or delete the Battles, then try again.';

/** FR-1.4's rule-reference sentence. `m` counts ORGANISMS
 * (`verdict.referencingOrganismIds.length`) — NOT rules, which is what the footer's "Targeted by
 * [M] organism rule(s)" counts (FD6, `ruleReferenceIndex.ts`'s head comment). */
export function ruleBlockSentence(m: number): string {
  return `It is targeted by rules of ${m} ${m === 1 ? 'organism' : 'organisms'}:`;
}

export const RULE_BLOCK_REMEDY = 'Edit those rules to remove the reference, then try again.';

/** Story 4.22: the confirmation's title (UX-DR15), a question, like `Delete Battle?`. */
export const DELETE_CONFIRM_TITLE = 'Delete Organism?';

/** FR-1.4's standard confirmation (`prd.md:136`), with the house's curly quotes around the name
 * (the `<DeleteBattleDialog>` precedent — the PRD's `[Organism Name]` placeholder carries none).
 * `name` is already display-resolved (`toDisplayOrganism`) by the caller, so an `''` name reads
 * `Unnamed organism` here. */
export function deleteConfirmSentence(name: string): string {
  return `Are you sure you want to delete “${name}”?`;
}

/** The destructive action's label — the object named, like `Delete Battle`. */
export const DELETE_CONFIRM_ACTION = 'Delete Organism';
