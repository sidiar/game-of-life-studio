import {
  BattleSchema,
  BattleSummarySchema,
  DEFAULT_SETTINGS,
  OrganismSchema,
  SettingsSchema,
  type Battle,
  type BattleSummary,
  type Organism,
  type Settings,
} from '@gol/domain';
import {
  CorruptDataError,
  STORAGE_KEYS,
  type AppRepositories,
  type BattleRepository,
  type OrganismRepository,
  type SettingsRepository,
} from '@gol/persistence';

/**
 * Pre-populates a fake store. `battles`/`organisms`/`settings` validate on the way in (same as a
 * real save would produce a well-formed record); `raw` bypasses validation entirely — the only way
 * to seed a corrupt record so a test can exercise the CorruptDataError / skip-corrupt-record paths
 * that a validated seed could never produce.
 */
export interface FakeSeed {
  battles?: readonly Battle[];
  organisms?: readonly Organism[];
  settings?: Settings;
  raw?: {
    battles?: Record<string, unknown>;
    organisms?: Record<string, unknown>;
    settings?: unknown;
  };
}

// `structuredClone` does not typecheck here — packages/* compile with lib: ["ES2022"] and no
// @types/node (Decision, this story). JSON.stringify + JSON.parse is the mechanism the real
// localStorage repositories use too, so a value stored this way and read back through
// Schema.parse() exercises the exact same Date-hydration path (BattleSchema's IsoTimestamp
// transform) as the real store — a fake that skipped this step would hand back a live object
// reference the caller could mutate in place, which localStorage never does.
function roundTrip(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value)) as unknown;
}

/**
 * In-memory implementation of the Story 1.4 `AppRepositories` interfaces (`packages/persistence/
 * src/repositories.ts`), built for tests that must not touch `localStorage`/jsdom. Every method
 * reproduces the documented contract of its localStorage counterpart — see the comments on each
 * method below for the specific behaviour being mirrored.
 */
export function createFakeRepositories(seed?: FakeSeed): AppRepositories {
  const battleStore = new Map<string, unknown>();
  const organismStore = new Map<string, unknown>();
  let settingsStore: unknown;

  // Fresh ⇔ no data write has ever happened — modelled as an explicit flag stamped by the write
  // path, exactly like `gol:schema` (RFC-006 Decision 7). NEVER "the organism map is empty": an
  // empty map after every organism was deleted is a fully-initialized workspace with zero
  // organisms, not a fresh one. Treating the two the same is the M9-forbidden self-heal that
  // Story 1.5's Task 3 named as the exact trap here (Story 1.6 Task 2).
  let stamped = false;

  if (seed?.battles) {
    for (const battle of seed.battles) battleStore.set(battle.id, roundTrip(battle));
    if (seed.battles.length > 0) stamped = true;
  }
  if (seed?.organisms) {
    for (const organism of seed.organisms) organismStore.set(organism.id, roundTrip(organism));
    if (seed.organisms.length > 0) stamped = true;
  }
  if (seed?.settings) settingsStore = roundTrip(seed.settings);
  if (seed?.raw?.battles) {
    for (const [id, record] of Object.entries(seed.raw.battles)) battleStore.set(id, record);
    stamped = true;
  }
  if (seed?.raw?.organisms) {
    for (const [id, record] of Object.entries(seed.raw.organisms)) organismStore.set(id, record);
    stamped = true;
  }
  if (seed?.raw && 'settings' in seed.raw) settingsStore = seed.raw.settings;

  const battles: BattleRepository = {
    async save(battle) {
      battleStore.set(battle.id, roundTrip(battle));
      stamped = true;
    },

    async load(id) {
      // `null` means absent; a present-but-invalid record throws CorruptDataError — collapsing the
      // two would let a caller treat an unparseable record as new and silently overwrite it.
      if (!battleStore.has(id)) return null;
      const parsed = BattleSchema.safeParse(battleStore.get(id));
      if (!parsed.success) {
        throw new CorruptDataError(STORAGE_KEYS.battles, `battle "${id}" is not valid`, {
          cause: parsed.error,
        });
      }
      return parsed.data;
    },

    async list() {
      // BattleSummary projections, never full battles (AC1) — and a record too corrupt even for
      // the lightweight projection is SKIPPED, not thrown, so one bad battle never blanks the
      // whole Gallery (Story 1.4 review).
      const summaries: BattleSummary[] = [];
      for (const record of battleStore.values()) {
        const parsed = BattleSummarySchema.safeParse(record);
        if (parsed.success) summaries.push(parsed.data);
      }
      return summaries;
    },

    async listFull() {
      // Same fault-isolation stance as list(): a corrupt battle must not fail the whole export.
      const result: Battle[] = [];
      for (const record of battleStore.values()) {
        const parsed = BattleSchema.safeParse(record);
        if (parsed.success) result.push(parsed.data);
      }
      return result;
    },

    async delete(id) {
      // A no-op delete performs no write (matches LocalStorageBattleRepository) — it must not
      // stamp an otherwise-fresh workspace.
      if (!battleStore.has(id)) return;
      battleStore.delete(id);
      stamped = true;
    },

    async exists(id) {
      // Presence-only — true even for a present-but-corrupt record, same as load() throwing while
      // exists() still reports true.
      return battleStore.has(id);
    },

    async replaceAll(newBattles) {
      battleStore.clear();
      for (const battle of newBattles) battleStore.set(battle.id, roundTrip(battle));
      stamped = true;
    },
  };

  const organisms: OrganismRepository = {
    async save(organism) {
      organismStore.set(organism.id, roundTrip(organism));
      stamped = true;
    },

    async load(id) {
      if (!organismStore.has(id)) return null;
      const parsed = OrganismSchema.safeParse(organismStore.get(id));
      if (!parsed.success) {
        throw new CorruptDataError(STORAGE_KEYS.organisms, `organism "${id}" is not valid`, {
          cause: parsed.error,
        });
      }
      return parsed.data;
    },

    async list() {
      // Skipped, not thrown (Story 1.4 review): one corrupt organism must not blank the library.
      const result: Organism[] = [];
      for (const record of organismStore.values()) {
        const parsed = OrganismSchema.safeParse(record);
        if (parsed.success) result.push(parsed.data);
      }
      return result;
    },

    async delete(id) {
      if (!organismStore.has(id)) return;
      organismStore.delete(id);
      stamped = true;
    },

    async exists(id) {
      return organismStore.has(id);
    },

    async replaceAll(newOrganisms) {
      organismStore.clear();
      for (const organism of newOrganisms) organismStore.set(organism.id, roundTrip(organism));
      stamped = true;
    },
  };

  const settings: SettingsRepository = {
    async load() {
      // Never null — an absent record resolves to DEFAULT_SETTINGS (RFC-006 Decision 7).
      if (settingsStore === undefined) return DEFAULT_SETTINGS;
      const parsed = SettingsSchema.safeParse(settingsStore);
      if (!parsed.success) {
        throw new CorruptDataError(STORAGE_KEYS.settings, 'settings record is not valid', {
          cause: parsed.error,
        });
      }
      return parsed.data;
    },

    async save(newSettings) {
      settingsStore = roundTrip(newSettings);
      // Settings never stamp the workspace (Decision F) — a theme toggle before anything else
      // exists must not make isFreshWorkspace() report an already-initialized workspace.
    },
  };

  return {
    battles,
    organisms,
    settings,

    async clearAll() {
      // Data-only: battles + organisms, never settings (Decision F / AR-12).
      battleStore.clear();
      organismStore.clear();
      // The stamp survives Clear All by design — Story 5.10 re-seeds DEFAULT_WORKSPACE against an
      // already-stamped store, never a fresh one.
    },

    async isFreshWorkspace() {
      return !stamped;
    },
  };
}
