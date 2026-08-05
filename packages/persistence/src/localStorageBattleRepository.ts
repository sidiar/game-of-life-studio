import { BattleSchema, BattleSummarySchema, type Battle, type BattleSummary } from '@gol/domain';
import type { BattleRepository } from './repositories';
import {
  CorruptDataError,
  describeIssues,
  readCollection,
  STORAGE_KEYS,
  writeDataKey,
} from './storage';

/**
 * The whole collection lives under a single `gol:battles` key (RFC-006 Decision 7). Per-battle
 * keys or a stored summary index would both read better here and both contradict the spec — the
 * latter also contradicts AR-15's "no stored structure".
 *
 * A consequence worth being honest about: JSON.parse necessarily materialises every gridState
 * array, so `list()` is lightweight in the sense that matters (no BattleSchema parse, no
 * dense->typed conversion, no thumbnail render) rather than literally not touching grids.
 */
export class LocalStorageBattleRepository implements BattleRepository {
  async save(battle: Battle): Promise<void> {
    const collection = readCollection(STORAGE_KEYS.battles);
    // JSON.stringify renders the Date fields as the exact `Z`-suffixed ISO form BattleSchema
    // accepts on the way back in, so no manual timestamp formatting is needed.
    collection[battle.id] = battle;
    writeDataKey(STORAGE_KEYS.battles, collection);
  }

  async load(id: string): Promise<Battle | null> {
    const record = readCollection(STORAGE_KEYS.battles)[id];
    if (record === undefined) return null;

    const parsed = BattleSchema.safeParse(record);
    if (!parsed.success) {
      // Deliberately NOT null: `null` means "no such battle", which would let a caller treat a
      // merely-unparseable record as absent and overwrite it on the next save.
      throw new CorruptDataError(
        STORAGE_KEYS.battles,
        `battle "${id}" — ${describeIssues(parsed.error.issues)}`,
      );
    }
    return parsed.data;
  }

  async list(): Promise<BattleSummary[]> {
    const collection = readCollection(STORAGE_KEYS.battles);
    return Object.entries(collection).map(([id, record]) => {
      const parsed = BattleSummarySchema.safeParse(record);
      if (!parsed.success) {
        throw new CorruptDataError(
          STORAGE_KEYS.battles,
          `battle "${id}" summary — ${describeIssues(parsed.error.issues)}`,
        );
      }
      return parsed.data;
    });
  }

  async listFull(): Promise<Battle[]> {
    const ids = Object.keys(readCollection(STORAGE_KEYS.battles));
    const battles: Battle[] = [];
    for (const id of ids) {
      const battle = await this.load(id);
      // load() returns null only for an absent id, which cannot happen for a key we just read.
      if (battle !== null) battles.push(battle);
    }
    return battles;
  }

  async delete(id: string): Promise<void> {
    const collection = readCollection(STORAGE_KEYS.battles);
    if (!(id in collection)) return;
    delete collection[id];
    writeDataKey(STORAGE_KEYS.battles, collection);
  }

  async exists(id: string): Promise<boolean> {
    return id in readCollection(STORAGE_KEYS.battles);
  }

  async replaceAll(battles: Battle[]): Promise<void> {
    const collection: Record<string, Battle> = {};
    for (const battle of battles) collection[battle.id] = battle;
    writeDataKey(STORAGE_KEYS.battles, collection);
  }
}
