import { CorruptDataError, QuotaExceededError } from '@gol/persistence';

/**
 * AC5 / NFR-7.2 / RFC-006 Decision 7: a refused save is reported, non-destructively, and never
 * swallowed — an unreported save failure is the worst outcome available to this story.
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
 */
export function saveFailureMessage(error: unknown): string {
  if (error instanceof QuotaExceededError) {
    // ❌ NOT `error.message` verbatim, which reads "Export and remove a battle to free space" —
    // Export is Story 5.4 and does not exist yet, so the advice would name an affordance the user
    // cannot find. Deleting a battle from the Gallery is the action that IS available today
    // (Story 1.13). Revisit this copy when Epic 5 ships export.
    return (
      'Storage is full, so this battle was not saved. Everything already saved is unchanged — ' +
      'delete a battle from the Gallery to free space, then save again.'
    );
  }
  if (error instanceof CorruptDataError) {
    // `battles.save()` reads the whole collection before writing it back
    // (`localStorageBattleRepository.ts`), so an unparseable `gol:battles` fails the save at the
    // READ. A different fact from a full store, and it needs different copy: there is no space to
    // free, and nothing the user does in this editor will fix it.
    //
    // Review (2026-08-28): the copy used to suggest the user "start a fresh workspace" — no such
    // affordance is reachable from the shipped app (Settings / Clear-workspace is Story 5.10 and
    // does not exist yet), the exact class of mistake the Quota message above already avoids by
    // not naming Export. Trimmed to match that discipline.
    return (
      'Saved battle data could not be read, so this battle was not saved. Nothing already ' +
      'stored was changed. Your work is still here — try again.'
    );
  }
  return (
    'This battle could not be saved. Nothing already stored was changed, and your work is still ' +
    'here — try again.'
  );
}
