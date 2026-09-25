import { CorruptDataError, QuotaExceededError } from '@gol/persistence';

/**
 * AC5 / NFR-7.2 / RFC-006 Decision 7: a refused save is reported, non-destructively, and never
 * swallowed — an unreported save failure is the worst outcome available to either save path.
 *
 * The two error CLASSES are imported, not the repositories: `@gol/persistence` exports them
 * precisely so a caller can tell "storage is full" from "stored data is unreadable" (see that
 * package's `index.ts`). That is unrelated to AR-2/27's injection rule, which is about
 * IMPLEMENTATIONS.
 *
 * ⚠️ Every message states that existing data is untouched. `writeKey` serialises the complete
 * next state before touching `localStorage` (AR-14 — the candidate-string-then-`setItem` shape),
 * so on a refused write the previous value is byte-identical: the claim is a property of the
 * write path, not a reassurance.
 *
 * Moved here from `lib/battle/saveFailureMessage.ts` (Story 4.16, FD7): two copies of a
 * three-branch function that differ only by a noun is the wrong kind of duplication, and this is
 * the second caller (the organism editor) — a third hand copy would be the one the house lifts at.
 * The `'battle'` sentences below are BYTE-IDENTICAL to what shipped before the move — pinned by
 * `saveFailureMessage.test.ts`'s three `'battle'` literals (`BattleEditorView.test.tsx` and
 * `BattlePage.test.tsx` only match fragments of them); only the signature gained the `subject`
 * parameter.
 */
export function saveFailureMessage(error: unknown, subject: 'battle' | 'organism'): string {
  if (error instanceof QuotaExceededError) {
    // ❌ NOT `error.message` verbatim, which reads "Export and remove a battle to free space" —
    // Export is Story 5.5 and does not exist yet, so the advice would name an affordance the user
    // cannot find. Deleting a battle from the Gallery is the action that IS available today
    // (Story 1.13) for either subject — battles are what fill the store. Revisit this copy when
    // Epic 5 ships export (flagged in this story's Dev Notes).
    return subject === 'battle'
      ? 'Storage is full, so this battle was not saved. Everything already saved is unchanged — ' +
          'delete a battle from the Gallery to free space, then save again.'
      : 'Storage is full, so this organism was not saved. Everything already saved is unchanged — ' +
          'delete a battle from the Gallery to free space, then save again.';
  }
  if (error instanceof CorruptDataError) {
    // `battles.save()` / `organisms.save()` each read their whole collection before writing it
    // back (`localStorageBattleRepository.ts` / `localStorageOrganismRepository.ts`), so an
    // unparseable `gol:battles` / `gol:organisms` fails the save at the READ. A different fact
    // from a full store, and it needs different copy: there is no space to free, and nothing the
    // user does in this editor will fix it.
    //
    // Review (2026-08-28): the copy used to suggest the user "start a fresh workspace" — no such
    // affordance is reachable from the shipped app (Settings / Clear-workspace is Story 5.10 and
    // does not exist yet), the exact class of mistake the Quota message above already avoids by
    // not naming Export. Trimmed to match that discipline.
    return subject === 'battle'
      ? 'Saved battle data could not be read, so this battle was not saved. Nothing already ' +
          'stored was changed. Your work is still here — try again.'
      : 'Saved organism data could not be read, so this organism was not saved. Nothing already ' +
          'stored was changed. Your work is still here — try again.';
  }
  return subject === 'battle'
    ? 'This battle could not be saved. Nothing already stored was changed, and your work is still ' +
        'here — try again.'
    : 'This organism could not be saved. Nothing already stored was changed, and your work is ' +
        'still here — try again.';
}

/**
 * Story 4.22, FD12: a refused organism delete — the re-verify read or `organisms.delete` rejected.
 * One sentence for every error class: unlike a save, there is no draft to keep and no space to
 * free, so the only true things to say are that nothing changed and that a retry is possible
 * (`saveFailureMessage`'s discipline: state that existing data is untouched, name no affordance
 * that does not exist). True by the same AR-14 write shape — the next collection is serialised
 * before `setItem`, so a refused delete leaves `gol:organisms` byte-identical. Here, not in the
 * lazy `deleteBlockCopy.ts`, because `useOrganismDelete` publishes it from the first load.
 */
export const ORGANISM_DELETE_FAILED =
  'This organism could not be deleted. Nothing was changed — try again.';
