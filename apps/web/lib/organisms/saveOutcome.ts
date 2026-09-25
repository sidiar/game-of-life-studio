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

/**
 * Story 4.22, FD12: a refused organism delete — the re-verify read or `organisms.delete` rejected.
 * One sentence for every error class: unlike a save, there is no draft to keep and no space to
 * free, so the only true things to say are that nothing changed and that a retry is possible
 * (`saveFailureMessage`'s discipline: state that existing data is untouched, name no affordance
 * that does not exist). True by the same AR-14 write shape — the next collection is serialised
 * before `setItem`, so a refused delete leaves `gol:organisms` byte-identical. Here, beside the
 * toast it pairs with, not in the lazy `deleteBlockCopy.ts` (`useOrganismDelete` publishes both
 * from `/organisms`'s first load) and not in `lib/saveFailureMessage.ts`, which the battle routes
 * import too — an organisms-only sentence there grew `/battle` and `/battle/new` for nothing
 * (review 2026-09-25).
 */
export const ORGANISM_DELETE_FAILED =
  'This organism could not be deleted. Nothing was changed — try again.';

/**
 * Story 4.22 review decision (b), Sidiar 2026-09-25: an EDITOR-origin Confirm whose re-verify read
 * finds the record already gone (deleted in another tab). The write is skipped and the editor stays
 * open — this action deleted nothing, so nothing closes it — and this sentence is published inside
 * the editor through the same `SaveErrorLine` surface as `ORGANISM_DELETE_FAILED`. The card origin
 * publishes nothing for the same case: its card is simply gone after the reload.
 */
export const ORGANISM_DELETE_GONE =
  'This organism no longer exists. It may have been deleted in another tab.';
