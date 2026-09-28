import { CONWAYS_CLASSIC, CURRENT_FORMAT_VERSION, type Battle } from '@gol/domain';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createLocalStorageRepositories } from './createLocalStorageRepositories';
import { NewerFormatVersionError } from './errors';
import { STORAGE_KEYS } from './localStorageAccess';
import { recoverWorkspace } from './recoverWorkspace';

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

// A non-default settings record, written RAW so the assertion is on bytes (Decision F / AR-12).
const SETTINGS_RAW = JSON.stringify({ theme: 'biotech-terminal', gridLines: false });
const CURRENT_STAMP = JSON.stringify({ formatVersion: CURRENT_FORMAT_VERSION });

function makeBattle(id: string): Battle {
  return {
    id,
    name: 'A Battle',
    organismIds: [],
    gridSize: { cols: 50, rows: 30 },
    gridState: Array.from({ length: 30 }, () => Array.from({ length: 50 }, () => 0)),
    createdAt: new Date('2026-08-05T00:00:00.000Z'),
    updatedAt: new Date('2026-08-05T00:00:00.000Z'),
  };
}

const rawKeys = () =>
  Object.fromEntries(Object.values(STORAGE_KEYS).map((key) => [key, localStorage.getItem(key)]));

async function expectDefaultWorkspace() {
  const repos = createLocalStorageRepositories();
  expect(await repos.battles.list()).toEqual([]);
  expect(await repos.organisms.list()).toEqual([CONWAYS_CLASSIC]);
  expect(localStorage.getItem(STORAGE_KEYS.schema)).toBe(CURRENT_STAMP);
  expect(localStorage.getItem(STORAGE_KEYS.settings)).toBe(SETTINGS_RAW);
}

describe('recoverWorkspace (Story 5.11 — AR-44 real-localStorage, one case per namespace)', () => {
  it.each([
    ['gol:battles is not JSON', STORAGE_KEYS.battles, '{not json'],
    ['gol:battles is an array', STORAGE_KEYS.battles, '[]'],
    ['gol:organisms is not JSON', STORAGE_KEYS.organisms, '{not json'],
  ])('recovers when %s', async (_label, key, raw) => {
    const repos = createLocalStorageRepositories();
    await repos.battles.save(makeBattle('123e4567-e89b-12d3-a456-426614174000'));
    await repos.organisms.save({ ...CONWAYS_CLASSIC, name: 'Edited' });
    localStorage.setItem(STORAGE_KEYS.settings, SETTINGS_RAW);
    localStorage.setItem(key, raw);

    await recoverWorkspace(repos, repos.organisms);

    await expectDefaultWorkspace();
  });

  it.each([
    ['not JSON', '{not json'],
    ['a string version', '{"formatVersion":"2"}'],
    ['an array', '[]'],
  ])('recovers when the gol:schema stamp is unusable (%s) — the 5.10 FD4 case', async (_l, raw) => {
    const repos = createLocalStorageRepositories();
    await repos.battles.save(makeBattle('223e4567-e89b-12d3-a456-426614174000'));
    await repos.organisms.save({ ...CONWAYS_CLASSIC, name: 'Edited' });
    localStorage.setItem(STORAGE_KEYS.settings, SETTINGS_RAW);
    localStorage.setItem(STORAGE_KEYS.schema, raw);

    await recoverWorkspace(repos, repos.organisms);

    await expectDefaultWorkspace();
  });

  it('refuses a NEWER stamp — rejects with NewerFormatVersionError, every key byte-identical', async () => {
    const repos = createLocalStorageRepositories();
    await repos.battles.save(makeBattle('323e4567-e89b-12d3-a456-426614174000'));
    await repos.organisms.save(CONWAYS_CLASSIC);
    localStorage.setItem(STORAGE_KEYS.settings, SETTINGS_RAW);
    localStorage.setItem(
      STORAGE_KEYS.schema,
      JSON.stringify({ formatVersion: CURRENT_FORMAT_VERSION + 1 }),
    );
    const before = rawKeys();

    await expect(recoverWorkspace(repos, repos.organisms)).rejects.toBeInstanceOf(
      NewerFormatVersionError,
    );
    expect(rawKeys()).toEqual(before);
  });

  it('rejects on a failed Conway write and completes on a retry (idempotent)', async () => {
    const repos = createLocalStorageRepositories();
    await repos.organisms.save({ ...CONWAYS_CLASSIC, name: 'Edited' });
    localStorage.setItem(STORAGE_KEYS.settings, SETTINGS_RAW);
    localStorage.setItem(STORAGE_KEYS.schema, '{not json');

    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('mock storage failure');
    });
    await expect(recoverWorkspace(repos, repos.organisms)).rejects.toThrow('mock storage failure');
    spy.mockRestore();

    await recoverWorkspace(repos, repos.organisms);
    await expectDefaultWorkspace();
  });

  it('resets a healthy store like Story 5.10 does — the stamp is kept, not discarded', async () => {
    const repos = createLocalStorageRepositories();
    await repos.battles.save(makeBattle('423e4567-e89b-12d3-a456-426614174000'));
    await repos.organisms.save({ ...CONWAYS_CLASSIC, name: 'Edited' });
    localStorage.setItem(STORAGE_KEYS.settings, SETTINGS_RAW);
    const removeSpy = vi.spyOn(Storage.prototype, 'removeItem');

    await recoverWorkspace(repos, repos.organisms);

    expect(removeSpy).not.toHaveBeenCalledWith(STORAGE_KEYS.schema);
    await expectDefaultWorkspace();
  });
});
