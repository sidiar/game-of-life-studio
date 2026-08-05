import { CONWAYS_CLASSIC, CONWAYS_CLASSIC_ID } from '@gol/domain';
import type { OrganismRepository } from './repositories';

/**
 * Idempotent ensure over the INTERFACE (never a concrete class) — that is what lets Story 1.6's
 * in-memory fake and a future ApiOrganismRepository both satisfy it, and what keeps this testable
 * without localStorage.
 *
 * Uses exists(), not load(): load() throws CorruptDataError on a present-but-invalid record
 * (Story 1.4), which would turn app boot into a crash for a user whose stored Conway is
 * unreadable. exists() reports true for a present-but-corrupt record — deliberately, because M9
 * says the app does NOT self-heal out-of-band tampering (Story 5.11 owns corruption UX).
 *
 * Never saves unconditionally: organisms.save(CONWAYS_CLASSIC) alone is duplicate-free (same id
 * overwrites) and would still be wrong — it silently reverts a user's edits to their own organism
 * on every app load. Conway's Classic is protected from DELETION (M9), not from editing.
 */
export async function ensureDefaultOrganism(organisms: OrganismRepository): Promise<void> {
  if (await organisms.exists(CONWAYS_CLASSIC_ID)) return;
  await organisms.save(CONWAYS_CLASSIC);
}
