import { resetWorkspace } from './resetWorkspace';
import type { AppRepositories, OrganismRepository } from './repositories';

/**
 * Story 5.11's load-time recovery: the reset offered when stored workspace data cannot be read
 * (NFR-7.3). `discardUnreadableStamp()` then Story 5.10's `resetWorkspace()`, unchanged.
 *
 * Why the stamp goes FIRST: an unusable `gol:schema` makes every collection read and data write
 * throw, so `resetWorkspace()` over it deletes the data and then throws (its own header). Removing
 * the stamp before the clear is the "stamp first on the way down" order `restoreDataKeys` uses: on
 * this discarded-stamp branch, every partial shape a failure can leave is unstamped (with data, or
 * empty), which the next seed or reset recovers — never the stamped-but-empty store nothing ever
 * re-seeds (M9).
 *
 * Why `resetWorkspace()` is reused rather than re-composed: it IS the 5.10 path (AR-13 / M1), and
 * its contract — keep the stamp through `clearAll()`, re-seed via `ensureDefaultOrganism` — stays
 * fixed. A healthy stamp is therefore kept, exactly as Clear All keeps it, and that branch inherits
 * Clear All's failure shape with it: a Conway's Classic write that fails AFTER the clear leaves a
 * stamped-but-empty store no plain load re-seeds — the retry the failure alert asks for is the way
 * back (Story 5.10 FD3). A discarded stamp is re-written by the Conway's Classic save's own
 * data-then-stamp write.
 *
 * A NEWER stamp makes `discardUnreadableStamp()` throw `NewerFormatVersionError` before anything is
 * written, so this can never reset a newer build's intact data (Story 5.7 owner ruling). Settings
 * are unreachable: no settings port is taken (Decision F / AR-12).
 *
 * Retry is idempotent: the discard is a no-op once the stamp is gone, and `resetWorkspace()` is
 * idempotent on its own — so a second call after a partial failure completes the recovery.
 */
export async function recoverWorkspace(
  workspace: Pick<AppRepositories, 'discardUnreadableStamp' | 'clearAll'>,
  organisms: Pick<OrganismRepository, 'exists' | 'save'>,
): Promise<void> {
  await workspace.discardUnreadableStamp();
  await resetWorkspace(workspace, organisms);
}
