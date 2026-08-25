import { afterEach, describe, expect, it } from 'vitest';
import { BattleSchema, DEFAULT_SETTINGS, OrganismSchema } from '@gol/domain';
import { createLocalStorageRepositories } from './createLocalStorageRepositories';
import { LocalStorageBattleRepository } from './localStorageBattleRepository';
import { LocalStorageOrganismRepository } from './localStorageOrganismRepository';
import { LocalStorageSettingsRepository } from './localStorageSettingsRepository';
import { STORAGE_KEYS } from './localStorageAccess';

afterEach(() => {
  localStorage.clear();
});

const BATTLE_ID = '123e4567-e89b-12d3-a456-426614174000';

function battle() {
  return BattleSchema.parse({
    id: BATTLE_ID,
    name: 'Test Battle',
    organismIds: ['conways-classic'],
    gridSize: { cols: 50, rows: 30 },
    gridState: Array.from({ length: 30 }, (_, row) =>
      Array.from({ length: 50 }, (_, col) => (row === 0 && col === 0 ? 1 : 0)),
    ),
    createdAt: '2026-08-03T10:00:00.000Z',
    updatedAt: '2026-08-03T11:00:00.000Z',
  });
}

function organism() {
  return OrganismSchema.parse({
    schemaVersion: 1,
    id: 'conways-classic',
    name: "Conway's Classic",
    colorToken: 'cyan',
    dominance: 50,
    agingEnabled: false,
    survivalRules: [
      {
        id: 'rule-1',
        contentHash: 'hash-1',
        conditions: [{ property: 'neighborCount', operator: 'eq', pattern: 3 }],
        payload: { summary: 'Born with exactly 3 neighbours', action: 'born' },
      },
    ],
  });
}

describe('createLocalStorageRepositories', () => {
  it('assembles the three localStorage repositories', () => {
    const repos = createLocalStorageRepositories();

    expect(repos.battles).toBeInstanceOf(LocalStorageBattleRepository);
    expect(repos.organisms).toBeInstanceOf(LocalStorageOrganismRepository);
    expect(repos.settings).toBeInstanceOf(LocalStorageSettingsRepository);
  });
});

describe('clearAll (AC5)', () => {
  it('removes battles and organisms', async () => {
    const repos = createLocalStorageRepositories();
    await repos.battles.save(battle());
    await repos.organisms.save(organism());

    await repos.clearAll();

    expect(await repos.battles.list()).toEqual([]);
    expect(await repos.organisms.list()).toEqual([]);
  });

  it('cannot touch gol:settings — the import path reuses it, so this is what protects the theme', async () => {
    const repos = createLocalStorageRepositories();
    await repos.settings.save({ ...DEFAULT_SETTINGS, theme: 'biotech-terminal' });
    await repos.battles.save(battle());
    const settingsBefore = localStorage.getItem(STORAGE_KEYS.settings);

    await repos.clearAll();

    expect(localStorage.getItem(STORAGE_KEYS.settings)).toBe(settingsBefore);
    expect((await repos.settings.load()).theme).toBe('biotech-terminal');
  });

  it('leaves the gol:schema stamp in place — Clear All does not change the store format', async () => {
    const repos = createLocalStorageRepositories();
    await repos.battles.save(battle());

    await repos.clearAll();

    expect(localStorage.getItem(STORAGE_KEYS.schema)).not.toBeNull();
  });

  it('is a no-op on an already-empty store', async () => {
    const repos = createLocalStorageRepositories();

    await expect(repos.clearAll()).resolves.toBeUndefined();
  });

  it('does not re-seed — DEFAULT_WORKSPACE seeding is Story 1.5, invoked by the caller', async () => {
    const repos = createLocalStorageRepositories();
    await repos.organisms.save(organism());

    await repos.clearAll();

    expect(await repos.organisms.list()).toEqual([]);
  });
});

describe('isFreshWorkspace (Story 1.5 AC1)', () => {
  it('is true with no gol:schema record', async () => {
    const repos = createLocalStorageRepositories();

    expect(await repos.isFreshWorkspace()).toBe(true);
  });

  it('is false once the workspace has been stamped by a data write', async () => {
    const repos = createLocalStorageRepositories();
    await repos.organisms.save(organism());

    expect(await repos.isFreshWorkspace()).toBe(false);
  });

  it('stays false after clearAll — the stamp survives Clear All by design (Story 5.10 re-seeds)', async () => {
    const repos = createLocalStorageRepositories();
    await repos.organisms.save(organism());
    await repos.clearAll();

    expect(await repos.isFreshWorkspace()).toBe(false);
  });
});
