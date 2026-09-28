import { LocalStorageBattleRepository } from './localStorageBattleRepository';
import { LocalStorageOrganismRepository } from './localStorageOrganismRepository';
import { LocalStorageSettingsRepository } from './localStorageSettingsRepository';
import { LocalStorageWorkspaceMetaRepository } from './localStorageWorkspaceMetaRepository';
import type { AppRepositories, WorkspaceSnapshot } from './repositories';
import {
  captureDataKeys,
  discardUnreadableStamp,
  hasSchemaStamp,
  measureStorageUsage,
  removeDataKeys,
  restoreDataKeys,
  type RawDataKeys,
} from './localStorageAccess';

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
    workspaceMeta: new LocalStorageWorkspaceMetaRepository(),

    /**
     * Data-only (FR-8.5 / Decision F.2 / AC5): battles + organisms + `gol:workspace` (Story 7.2),
     * never `gol:settings`. The
     * import path (Story 5.8) reuses this, which is precisely what makes importing a friend's
     * battle unable to destroy the importer's theme — no snapshot-and-restore needed.
     *
     * Re-seeding DEFAULT_WORKSPACE afterwards is Story 1.5's helper (`ensureDefaultOrganism`),
     * invoked by the caller — Story 5.10's `resetWorkspace()` composition — rather than buried here.
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

    // `async` because the seam is Promise-shaped for every mode (AR-2/27) — a connected-mode
    // repository's answer is a real network round-trip. It cannot throw on a healthy store: the
    // meter only ever reads getItem() strings and sums key + value lengths (FD3) — it never parses.
    async storageUsage() {
      return measureStorageUsage();
    },

    // The opaque capture is the raw `gol:battles` / `gol:organisms` / `gol:workspace` / `gol:schema`
    // strings (Story 5.8
    // owner ruling). The casts are the brand's whole point: only this object builds or reads one.
    async snapshotWorkspace() {
      return captureDataKeys() as unknown as WorkspaceSnapshot;
    },

    async restoreWorkspace(snapshot) {
      restoreDataKeys(snapshot as unknown as RawDataKeys);
    },

    // Story 5.11's recovery seam. Reads `gol:schema` only; a newer stamp throws before any write.
    async discardUnreadableStamp() {
      discardUnreadableStamp();
    },
  };
}
