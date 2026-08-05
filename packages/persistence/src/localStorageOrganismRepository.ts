import { OrganismSchema, type Organism } from '@gol/domain';
import type { OrganismRepository } from './repositories';
import {
  CorruptDataError,
  describeIssues,
  readCollection,
  STORAGE_KEYS,
  writeDataKey,
} from './storage';

/**
 * The workspace-shared Organism Library (FR-7.15) under a single `gol:organisms` key. Battles
 * reference these by id, so an edit here propagates to every battle automatically.
 */
export class LocalStorageOrganismRepository implements OrganismRepository {
  async save(organism: Organism): Promise<void> {
    const collection = readCollection(STORAGE_KEYS.organisms);
    collection[organism.id] = organism;
    writeDataKey(STORAGE_KEYS.organisms, collection);
  }

  async load(id: string): Promise<Organism | null> {
    const record = readCollection(STORAGE_KEYS.organisms)[id];
    if (record === undefined) return null;

    const parsed = OrganismSchema.safeParse(record);
    if (!parsed.success) {
      throw new CorruptDataError(
        STORAGE_KEYS.organisms,
        `organism "${id}" — ${describeIssues(parsed.error.issues)}`,
      );
    }
    return parsed.data;
  }

  async list(): Promise<Organism[]> {
    const collection = readCollection(STORAGE_KEYS.organisms);
    return Object.entries(collection).map(([id, record]) => {
      const parsed = OrganismSchema.safeParse(record);
      if (!parsed.success) {
        throw new CorruptDataError(
          STORAGE_KEYS.organisms,
          `organism "${id}" — ${describeIssues(parsed.error.issues)}`,
        );
      }
      return parsed.data;
    });
  }

  /**
   * Unconditional. The FR-1.4 / M7 delete guard and M9's Conway's Classic protection are domain
   * rules the caller applies — see the OrganismRepository interface comment.
   */
  async delete(id: string): Promise<void> {
    const collection = readCollection(STORAGE_KEYS.organisms);
    if (!(id in collection)) return;
    delete collection[id];
    writeDataKey(STORAGE_KEYS.organisms, collection);
  }

  async exists(id: string): Promise<boolean> {
    return id in readCollection(STORAGE_KEYS.organisms);
  }

  async replaceAll(organisms: Organism[]): Promise<void> {
    const collection: Record<string, Organism> = {};
    for (const organism of organisms) collection[organism.id] = organism;
    writeDataKey(STORAGE_KEYS.organisms, collection);
  }
}
