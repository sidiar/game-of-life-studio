import { ensureDefaultOrganism } from './ensureDefaultOrganism';
import type { AppRepositories } from './repositories';

/**
 * First-run composition (RFC-006 Decision 7). Gates on isFreshWorkspace() — seeding on every
 * load, rather than only when gol:schema is absent, would turn this into the self-heal M9
 * explicitly forbids.
 *
 * Does NOT write gol:battles: DEFAULT_WORKSPACE.battles is empty and readCollection() already
 * reads an absent key as `{}`, so a battles.replaceAll([]) here would be a second write for no
 * benefit — one more place a quota failure can strike mid-seed.
 *
 * The organism save stamps gol:schema for free (writeDataKey() does it after the data write
 * succeeds — Story 1.4). Stamping it here, or before seeding, would leave a stamped-but-empty
 * store reading as "already initialized" forever if the organism write then failed.
 *
 * QuotaExceededError is allowed to propagate: a first run that cannot write is a real failure the
 * caller must see, not one to swallow into a false "seeded" state.
 */
export async function seedDefaultWorkspace(repos: AppRepositories): Promise<void> {
  if (!(await repos.isFreshWorkspace())) return;
  await ensureDefaultOrganism(repos.organisms);
}
