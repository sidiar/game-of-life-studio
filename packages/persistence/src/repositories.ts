import type { Battle, BattleSummary, Organism, Settings } from '@gol/domain';

/*
 * Persistence ports (RFC-001 §1 / RFC-006 Decision 1).
 *
 * Every method returns a Promise even though the MVP implementation is synchronous localStorage.
 * That is the whole point of the seam: it lets the IndexedDB escape hatch (RFC-006 Decision 7) or
 * a connected-mode Api* repository drop in without a single caller changing. Synchronous
 * signatures here would weld every future consumer to a synchronous store.
 *
 * Consumers receive these as props from the page boundary and type against the INTERFACE, never
 * an implementation (AR-2/27). A component that imports LocalStorageBattleRepository has already
 * broken the seam — and it will compile, pass its tests, and look fine in review.
 */

export interface BattleRepository {
  save(battle: Battle): Promise<void>;
  /** `null` means no such battle. A stored-but-invalid record throws CorruptDataError instead. */
  load(id: string): Promise<Battle | null>;
  /** Lightweight summaries for the Gallery and the AR-15 usage index (Decision H.4). */
  list(): Promise<BattleSummary[]>;
  /** Fully parsed battles — read by the WorkspaceSerializer export path (`workspaceSerializer.ts`,
   * called from `apps/web`'s `/settings` page boundary, Story 5.5). */
  listFull(): Promise<Battle[]>;
  delete(id: string): Promise<void>;
  /** Presence only — a present-but-corrupt record still reports `true` even though `load()` throws. */
  exists(id: string): Promise<boolean>;
  /** Bulk replace of the whole collection — the atomic import path (Story 5.8). */
  replaceAll(battles: Battle[]): Promise<void>;
}

export interface OrganismRepository {
  save(organism: Organism): Promise<void>;
  load(id: string): Promise<Organism | null>;
  /** No listFull counterpart: an organism has no heavy field worth projecting away. */
  list(): Promise<Organism[]>;
  /**
   * Unconditional CRUD delete. The FR-1.4 / M7 "blocked while any battle places it" guard and
   * Conway's Classic protection (M9) are integrity rules owned by @gol/domain and applied by the
   * caller — implementing them here would bury core logic behind a repository, where the ≥90%
   * gate does not reach it.
   */
  delete(id: string): Promise<void>;
  /** Presence only — a present-but-corrupt record still reports `true` even though `load()` throws. */
  exists(id: string): Promise<boolean>;
  replaceAll(organisms: Organism[]): Promise<void>;
}

export interface SettingsRepository {
  /** Never null — an absent record resolves to DEFAULT_SETTINGS (RFC-006 Decision 7). */
  load(): Promise<Settings>;
  save(settings: Settings): Promise<void>;
}

/** Bytes the workspace occupies in the backing store (AR-14). */
export interface StorageUsage {
  /**
   * UTF-16 bytes for a localStorage-backed workspace; a connected-mode repository reports
   * whatever its server meters — the number is mode-agnostic, only its derivation is not.
   */
  bytes: number;
}

export interface AppRepositories {
  battles: BattleRepository;
  organisms: OrganismRepository;
  settings: SettingsRepository;
  /**
   * Data-only: battles + organisms, never settings (Decision F.2 / AR-12). It lives on the
   * aggregate rather than on a repository because it spans two of them — RFC-006 Alternative 1
   * rejects per-repository bulk operations for exactly that reason.
   */
  clearAll(): Promise<void>;
  /**
   * "Has this workspace ever been initialized?" — mode-agnostic question, storage-specific answer
   * (Story 1.5 forced decision 1). A free `isFreshInstall()` function reading localStorage
   * directly would be exactly as welded to localStorage as importing `LocalStorageOrganismRepository`
   * (AR-2/27): it compiles, tests green, and breaks the seam. `true` only when the workspace has
   * never been stamped (RFC-006 Decision 7) — NOT when the organism library happens to be empty,
   * which would turn every load into an M9-forbidden self-heal.
   */
  isFreshWorkspace(): Promise<boolean>;
  /**
   * "How much space does this workspace take?" — the same mode-agnostic-question,
   * storage-specific-answer shape as `isFreshWorkspace()` (AR-14 / FR-8.2 / RFC-006 Decision 7).
   * It lives on the aggregate, not a repository, because it spans every `gol:*` namespace — the
   * same reasoning that puts `clearAll()` here rather than on one repository.
   */
  storageUsage(): Promise<StorageUsage>;
}
