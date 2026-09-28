import { ensureDefaultOrganism } from './ensureDefaultOrganism';
import type { AppRepositories, OrganismRepository } from './repositories';

/**
 * Story 5.10's Clear All composition (FD1): `clearAll()` then `ensureDefaultOrganism()`, the exact
 * two calls AR-13 / Decision F.2 / M1 name. It is NOT `seedDefaultWorkspace()` — that helper gates
 * on `isFreshWorkspace()`, and `clearAll()` deliberately leaves the `gol:schema` stamp in place
 * (Story 1.5), so a post-Clear-All store is never "fresh" and `seedDefaultWorkspace` would be a
 * silent no-op: the code would compile, look right, and leave the user with no Conway's Classic,
 * forever — nothing ever re-seeds a stamped store (M9). `createLocalStorageRepositories.ts`'s
 * `clearAll()` comment and the `@gol/test-utils` fake's `clearAll()` comment both flag this trap.
 *
 * Data-only by construction: this function never receives a settings repository, so Decision F's
 * "settings survive Clear All" holds structurally, not by a check anyone could forget.
 *
 * This is "the 5.10 path" Story 5.11's corruption-screen reset offer reuses (`epics.md:1456`) — one
 * function to call rather than a UI component to reach into. It does NOT handle a corrupt or
 * newer-format `gol:schema` stamp: `ensureDefaultOrganism`'s `exists()` read runs the at-rest format
 * check, so calling this over a bad stamp deletes the data keys and then throws, leaving no Conway's
 * Classic behind the same bad stamp. Unreachable through Story 5.10's UI (a bad stamp fails
 * `/settings`'s own `list()` reads before the Clear Data button ever mounts). Story 5.11's
 * `recoverWorkspace()` is the caller that handles the stamp: it discards an unusable one (and
 * refuses a newer one) before calling this, so this function's contract stays as it is.
 *
 * Retry is idempotent: `clearAll()` is safe to call again on an already-cleared store, and
 * `ensureDefaultOrganism` is a no-op once Conway's Classic exists — so a second call after a
 * partial failure (the organisms write rejecting right after the clear) completes the reset.
 */
export async function resetWorkspace(
  workspace: Pick<AppRepositories, 'clearAll'>,
  organisms: Pick<OrganismRepository, 'exists' | 'save'>,
): Promise<void> {
  await workspace.clearAll();
  await ensureDefaultOrganism(organisms);
}
