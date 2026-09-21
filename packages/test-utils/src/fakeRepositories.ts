import {
  BattleSchema,
  BattleSummarySchema,
  CURRENT_FORMAT_VERSION,
  OrganismSchema,
  SettingsSchema,
  type Battle,
  type BattleSummary,
  type Organism,
  type Settings,
} from '@gol/domain';
import {
  assertSafeCollectionId,
  CorruptDataError,
  STORAGE_KEYS,
  storageBytesOf,
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
 * Seed-time validation for the non-`raw` paths (review 2026-08-05). The FakeSeed doc comment
 * promises these "validate on the way in" while `raw` bypasses it, but the compile-time `Battle`/
 * `Organism` annotation is not validation: a fixture cast through `as Battle` behaved exactly like
 * `raw` with no signal, which made the two paths indistinguishable and the promise false.
 */
function parseSeed(
  schema: { safeParse(value: unknown): { success: boolean } },
  label: string,
  value: unknown,
): unknown {
  const stored = roundTrip(value);
  if (!schema.safeParse(stored).success) {
    throw new Error(
      `createFakeRepositories: seeded ${label} is not valid — use the \`raw\` escape hatch to ` +
        `store a deliberately corrupt record.`,
    );
  }
  return stored;
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
    for (const battle of seed.battles) {
      battleStore.set(battle.id, parseSeed(BattleSchema, 'battle', battle));
    }
    if (seed.battles.length > 0) stamped = true;
  }
  if (seed?.organisms) {
    for (const organism of seed.organisms) {
      assertSafeCollectionId(organism.id);
      organismStore.set(organism.id, parseSeed(OrganismSchema, 'organism', organism));
    }
    if (seed.organisms.length > 0) stamped = true;
  }
  if (seed?.settings) settingsStore = parseSeed(SettingsSchema, 'settings', seed.settings);
  // The `length > 0` guard matches the validated paths above: seeding an EMPTY collection stores
  // nothing, so it must not stamp either. Without it `{ raw: { battles: {} } }` reported an
  // already-initialized workspace holding zero records, and the two seeding paths disagreed about
  // the one flag the whole M9 self-heal protection rests on.
  if (seed?.raw?.battles && Object.keys(seed.raw.battles).length > 0) {
    for (const [id, record] of Object.entries(seed.raw.battles)) battleStore.set(id, record);
    stamped = true;
  }
  if (seed?.raw?.organisms && Object.keys(seed.raw.organisms).length > 0) {
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
      // The same guard LocalStorageOrganismRepository.save() opens with. OrganismSchema.id is a
      // bare non-empty string (so 'conways-classic' is legal), which lets '__proto__' through to a
      // plain-object collection where it rebinds the prototype instead of storing a record. A Map
      // would survive it — but then a test asserting the rejection would pass here and fail
      // against the real store, which is the one thing this fake exists not to do.
      assertSafeCollectionId(organism.id);
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
      // Guarded before the clear, matching LocalStorageOrganismRepository.replaceAll(): a rejected
      // id must not have already emptied the collection.
      for (const organism of newOrganisms) assertSafeCollectionId(organism.id);
      organismStore.clear();
      for (const organism of newOrganisms) organismStore.set(organism.id, roundTrip(organism));
      stamped = true;
    },
  };

  const settings: SettingsRepository = {
    async load() {
      // Never null — an absent record resolves to the defaults (RFC-006 Decision 7). Parsed fresh
      // rather than returning the DEFAULT_SETTINGS singleton, because that constant is
      // Object.freeze'd while LocalStorageSettingsRepository.load() returns a new
      // SettingsSchema.parse({}) each call: handing back the frozen object made a caller that
      // mutates loaded settings throw against the fake and succeed against the real store — the
      // reference-vs-copy divergence roundTrip() prevents everywhere else in this file, inverted.
      if (settingsStore === undefined) return SettingsSchema.parse({});
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

    // Mirrors the real meter through the SAME exported helper (storageBytesOf) rather than
    // re-stating the arithmetic — the assertSafeCollectionId precedent (FD8): a fake that
    // re-derives a formula is free to drift from it. Builds the entries the real localStorage
    // store would hold and hands them to the shared formula.
    //
    // One deliberate divergence from the real store: after the last record in a collection is
    // deleted, the real store still holds `gol:battles -> "{}"` (writeDataKey's empty-collection
    // write), while this fake's map is simply empty and contributes no pair. The gap is
    // `(12 + 2) * 2 = 28` bytes per collection — invisible at one-decimal KB precision — and not
    // worth a per-collection "ever written" flag beside `stamped`.
    async storageUsage() {
      const entries: Array<readonly [string, string]> = [];
      if (stamped) {
        entries.push([
          STORAGE_KEYS.schema,
          JSON.stringify({ formatVersion: CURRENT_FORMAT_VERSION }),
        ]);
      }
      if (battleStore.size > 0) {
        entries.push([STORAGE_KEYS.battles, JSON.stringify(Object.fromEntries(battleStore))]);
      }
      if (organismStore.size > 0) {
        entries.push([STORAGE_KEYS.organisms, JSON.stringify(Object.fromEntries(organismStore))]);
      }
      if (settingsStore !== undefined) {
        entries.push([STORAGE_KEYS.settings, JSON.stringify(settingsStore)]);
      }
      return { bytes: storageBytesOf(entries) };
    },
  };
}
