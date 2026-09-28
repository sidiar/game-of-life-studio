import { CONWAYS_CLASSIC, isPristineWorkspace, type Battle } from '@gol/domain';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createLocalStorageRepositories } from './createLocalStorageRepositories';
import { resetWorkspace } from './resetWorkspace';
import { STORAGE_KEYS } from './localStorageAccess';

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

// A trivially schema-valid battle (the seedDefaultWorkspace.test.ts shape) — no organisms placed,
// so organismIds/gridState stay empty/zero-filled, which is all this file needs a battle for.
function makeBattle(id: string, name: string): Battle {
  return {
    id,
    name,
    organismIds: [],
    gridSize: { cols: 50, rows: 30 },
    gridState: Array.from({ length: 30 }, () => Array.from({ length: 50 }, () => 0)),
    createdAt: new Date('2026-08-05T00:00:00.000Z'),
    updatedAt: new Date('2026-08-05T00:00:00.000Z'),
  };
}

describe('resetWorkspace (AC3, AC4 — the AR-44 real-localStorage integration test)', () => {
  it("clears battles, re-seeds an edited Conway's Classic, and leaves the workspace pristine", async () => {
    const repos = createLocalStorageRepositories();
    await repos.battles.save(makeBattle('123e4567-e89b-12d3-a456-426614174000', 'Battle One'));
    await repos.battles.save(makeBattle('223e4567-e89b-12d3-a456-426614174000', 'Battle Two'));
    // Conway's Classic, EDITED (renamed) — "factory state" means this gets replaced, not kept.
    await repos.organisms.save({ ...CONWAYS_CLASSIC, name: 'My Renamed Conway' });
    await repos.organisms.save({ ...CONWAYS_CLASSIC, id: 'second-organism', name: 'Second' });

    await resetWorkspace(repos, repos.organisms);

    expect(await repos.battles.list()).toEqual([]);
    const organisms = await repos.organisms.list();
    expect(organisms).toEqual([CONWAYS_CLASSIC]);
    expect(isPristineWorkspace((await repos.battles.list()).length, organisms)).toBe(true);
  });

  it('never touches gol:settings — byte-identical before and after (Decision F.3 / AR-12)', async () => {
    const repos = createLocalStorageRepositories();
    const seededSettings = JSON.stringify({ theme: 'biotech-terminal', gridLines: false });
    localStorage.setItem(STORAGE_KEYS.settings, seededSettings);
    await repos.organisms.save({ ...CONWAYS_CLASSIC, name: 'Edited' });

    await resetWorkspace(repos, repos.organisms);

    expect(localStorage.getItem(STORAGE_KEYS.settings)).toBe(seededSettings);
  });

  it('leaves gol:schema stamped — the store is not "fresh" afterwards', async () => {
    const repos = createLocalStorageRepositories();
    await repos.organisms.save({ ...CONWAYS_CLASSIC, name: 'Edited' });
    expect(localStorage.getItem(STORAGE_KEYS.schema)).not.toBeNull();

    await resetWorkspace(repos, repos.organisms);

    expect(localStorage.getItem(STORAGE_KEYS.schema)).not.toBeNull();
    expect(await repos.isFreshWorkspace()).toBe(false);
  });

  it('is idempotent — a store already at factory state stays at factory state', async () => {
    const repos = createLocalStorageRepositories();
    await repos.organisms.save(CONWAYS_CLASSIC); // seed once, unedited

    await resetWorkspace(repos, repos.organisms);
    await resetWorkspace(repos, repos.organisms);

    expect(await repos.battles.list()).toEqual([]);
    expect(await repos.organisms.list()).toEqual([CONWAYS_CLASSIC]);
  });

  it('clears a per-record-corrupt battle too — clearAll() removes keys, it never parses', async () => {
    const repos = createLocalStorageRepositories();
    // A raw, schema-invalid record written directly — clearAll() must not need to parse it to
    // remove it.
    localStorage.setItem(STORAGE_KEYS.battles, JSON.stringify({ 'bad-id': { not: 'a battle' } }));
    await repos.organisms.save(CONWAYS_CLASSIC);

    await resetWorkspace(repos, repos.organisms);

    expect(await repos.battles.list()).toEqual([]);
    expect(localStorage.getItem(STORAGE_KEYS.battles)).toBeNull();
  });

  it('rejects on a mid-reset write failure and completes on a retry (FD3, idempotent retry)', async () => {
    const repos = createLocalStorageRepositories();
    await repos.battles.save(makeBattle('323e4567-e89b-12d3-a456-426614174000', 'Battle Three'));
    await repos.organisms.save({ ...CONWAYS_CLASSIC, name: 'Edited' });

    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('mock storage failure');
    });

    await expect(resetWorkspace(repos, repos.organisms)).rejects.toThrow('mock storage failure');
    // The clear itself uses removeItem, not setItem, so it already ran — the organisms write is
    // what failed, leaving the store cleared but without Conway's Classic re-seeded.
    expect(await repos.battles.list()).toEqual([]);

    spy.mockRestore();

    // A second call, with the write path working again, completes the reset.
    await resetWorkspace(repos, repos.organisms);
    expect(await repos.organisms.list()).toEqual([CONWAYS_CLASSIC]);
  });
});
