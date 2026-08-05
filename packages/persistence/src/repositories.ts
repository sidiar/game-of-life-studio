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
  /** Fully parsed battles — the WorkspaceSerializer export path (Story 5.5). */
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
}
