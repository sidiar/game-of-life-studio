import type { Organism } from '@gol/domain';

/**
 * The Library's in-flow save outcome sentence (Story 4.16, AC3, FD5). Design doc `:764`, verbatim.
 * The zero-rules warning rides the same sentence — it is the epic's Story 4.13 AC3/AC4 warning,
 * re-homed here because Story 4.13's gate allows a zero-rule save (design doc `:551, :764-765`:
 * "Allow save but show warning") and the warning belongs to the save that proceeds, not the gate.
 */
export const ORGANISM_SAVED = 'Organism saved successfully.';
export const NO_RULES_WARNING = 'No rules defined. Organism will have no living cells.';

/** `ORGANISM_SAVED` alone for a saved organism with ≥ 1 rule, both sentences (space-joined) for
 * zero. Pure — the Library's `onSaved` callback is the one caller. */
export function saveOutcomeMessage(organism: Pick<Organism, 'survivalRules'>): string {
  return organism.survivalRules.length === 0
    ? `${ORGANISM_SAVED} ${NO_RULES_WARNING}`
    : ORGANISM_SAVED;
}

/**
 * Story 4.22 (UX-DR14; `organism-editor-design.md`'s delete flow, step 5, verbatim): the Library's
 * in-flow status after an organism is deleted. Here, beside the save outcome, rather than in the
 * lazy `deleteBlockCopy.ts`: `useOrganismDelete` publishes it from `/organisms`'s first load.
 */
export const ORGANISM_DELETED = 'Organism deleted';
