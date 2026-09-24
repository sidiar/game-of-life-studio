import { battleCount } from './usageLabels';

/**
 * Story 4.21's copy for `<OrganismDeleteBlockedDialog>` — kept in a module the lazy DIALOG chunk
 * imports alone (FD5). `usageLabels.ts` is imported by the eager editor-footer path
 * (`OrganismEditorModal` is itself lazy, but every string it needs is read at first paint of the
 * footer inside it); putting these block strings there would grow that footer's chunk for a
 * dialog most sessions never open. `battleCount` is imported, not duplicated, so the dialog's
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
