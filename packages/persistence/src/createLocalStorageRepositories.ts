import { LocalStorageBattleRepository } from './localStorageBattleRepository';
import { LocalStorageOrganismRepository } from './localStorageOrganismRepository';
import { LocalStorageSettingsRepository } from './localStorageSettingsRepository';
import type { AppRepositories } from './repositories';
import { hasSchemaStamp, removeDataKeys } from './localStorageAccess';

/**
 * The Standalone-mode repository set. Mode selection itself lives in the app's factory
 * (apps/web/lib/repositoryFactory.ts), which is where APP_MODE is readable — this package stays
 * mode-agnostic and just supplies the localStorage implementations.
 */
export function createLocalStorageRepositories(): AppRepositories {
  return {
    battles: new LocalStorageBattleRepository(),
    organisms: new LocalStorageOrganismRepository(),
    settings: new LocalStorageSettingsRepository(),

    /**
     * Data-only (FR-8.5 / Decision F.2 / AC5): battles + organisms, never `gol:settings`. The
     * import path (Story 5.8) reuses this, which is precisely what makes importing a friend's
     * battle unable to destroy the importer's theme — no snapshot-and-restore needed.
     *
     * Re-seeding DEFAULT_WORKSPACE afterwards is Story 1.5's helper, invoked by the caller
     * (Story 5.10) rather than buried here.
     */
    async clearAll(): Promise<void> {
      removeDataKeys();
    },

    /**
     * Fresh ⇔ `gol:schema` has never been written (RFC-006 Decision 7). Story 1.5's
     * seedDefaultWorkspace() gates on this, never on "the organism library is empty" — that
     * would make every load a self-heal, which M9 rules out, and would fight Story 5.10's
     * post-Clear-All re-seed (gol:schema stays stamped through clearAll() on purpose).
     */
    async isFreshWorkspace(): Promise<boolean> {
      return !hasSchemaStamp();
    },
  };
}
