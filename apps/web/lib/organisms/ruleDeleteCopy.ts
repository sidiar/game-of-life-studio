/**
 * Story 4.26's copy for `<RuleDeleteConfirmDialog>` — the `deleteBlockCopy.ts` idiom, kept in its
 * own module for the same reason: only the lazy dialog chunk (inside `<RulesEditor>`, inside the
 * editor's own lazy chunk) imports it, so it never reaches `/organisms`'s first load.
 */

/** Story 4.26 (UX-DR15): the confirmation's title, a question, like `Delete Battle?` /
 * `Delete Organism?`. */
export const RULE_DELETE_TITLE = 'Delete Rule?';

/** The destructive action's label — the object named, like `Delete Battle` / `Delete Organism`. */
export const RULE_DELETE_ACTION = 'Delete Rule';

/** The rule's name in the dialog: the trimmed Summary when it is non-empty, else `Rule <n>`
 * (1-based, from the 0-based `index`). Never the raw untrimmed Summary — a whitespace-only value
 * must read as empty, and leading/trailing whitespace around a real Summary is not part of its
 * name. */
export function ruleDeleteLabel(summary: string, index: number): string {
  const trimmed = summary.trim();
  return trimmed.length > 0 ? trimmed : `Rule ${index + 1}`;
}

/** FD2's sentence, verbatim, with the house's curly quotes around the label. No "cannot be
 * undone" claim: until Save, Discard restores the rule (4.23), so that sentence would be false. */
export function ruleDeleteSentence(label: string): string {
  return `“${label}” and its conditions will be removed from this organism.`;
}
