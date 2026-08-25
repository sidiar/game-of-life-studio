import { CONWAYS_CLASSIC_ID } from '@gol/domain';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createLocalStorageRepositories } from './createLocalStorageRepositories';
import { seedDefaultWorkspace } from './seedDefaultWorkspace';
import { QuotaExceededError, STORAGE_KEYS } from './localStorageAccess';

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('seedDefaultWorkspace (AC1, AC3)', () => {
  it("seeds Conway's Classic and stamps gol:schema on a fresh store", async () => {
    const repos = createLocalStorageRepositories();

    await seedDefaultWorkspace(repos);

    expect(await repos.organisms.exists(CONWAYS_CLASSIC_ID)).toBe(true);
    expect(localStorage.getItem(STORAGE_KEYS.schema)).not.toBeNull();
  });

  it('is a no-op on an already-stamped store, even with an empty library (M9 no-self-heal)', async () => {
    const repos = createLocalStorageRepositories();
    // Stamp the store without seeding — mirrors a corrupted/edited-out-of-band library.
    await repos.battles.save({
      id: '123e4567-e89b-12d3-a456-426614174000',
      name: 'x',
      organismIds: [],
      gridSize: { cols: 50, rows: 30 },
      gridState: Array.from({ length: 30 }, () => Array.from({ length: 50 }, () => 0)),
      createdAt: new Date('2026-08-05T00:00:00.000Z'),
      updatedAt: new Date('2026-08-05T00:00:00.000Z'),
    });
    await repos.organisms.delete(CONWAYS_CLASSIC_ID);

    await seedDefaultWorkspace(repos);

    // A plain at-rest load must not self-heal an out-of-band edit that removed the default.
    expect(await repos.organisms.exists(CONWAYS_CLASSIC_ID)).toBe(false);
  });

  it('never writes gol:settings', async () => {
    const repos = createLocalStorageRepositories();

    await seedDefaultWorkspace(repos);

    expect(localStorage.getItem(STORAGE_KEYS.settings)).toBeNull();
  });

  it('does not write gol:battles — DEFAULT_WORKSPACE.battles is empty, so there is nothing to write', async () => {
    const repos = createLocalStorageRepositories();

    await seedDefaultWorkspace(repos);

    expect(localStorage.getItem(STORAGE_KEYS.battles)).toBeNull();
  });

  it('surfaces QuotaExceededError on a first-run write failure and leaves gol:schema unstamped', async () => {
    const repos = createLocalStorageRepositories();
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      const error = new Error('mock quota failure') as Error & { name: string };
      error.name = 'QuotaExceededError';
      throw error;
    });

    await expect(seedDefaultWorkspace(repos)).rejects.toThrow(QuotaExceededError);
    expect(localStorage.getItem(STORAGE_KEYS.schema)).toBeNull();
  });
});
