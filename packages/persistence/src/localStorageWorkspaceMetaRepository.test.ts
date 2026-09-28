import { afterEach, describe, expect, it } from 'vitest';
import { CURRENT_FORMAT_VERSION, MAX_WORKSPACE_DESCRIPTION_LENGTH } from '@gol/domain';
import { LocalStorageWorkspaceMetaRepository } from './localStorageWorkspaceMetaRepository';
import { CorruptDataError, NewerFormatVersionError } from './errors';
import { hasSchemaStamp, STORAGE_KEYS } from './localStorageAccess';

afterEach(() => {
  localStorage.clear();
});

function repo() {
  return new LocalStorageWorkspaceMetaRepository();
}

describe('LocalStorageWorkspaceMetaRepository (Story 7.2)', () => {
  it('loads {} when gol:workspace was never written — never null', async () => {
    expect(await repo().load()).toEqual({});
  });

  it('round-trips a description', async () => {
    await repo().save({ description: 'Lab notes.' });
    expect(await repo().load()).toEqual({ description: 'Lab notes.' });
  });

  it('normalizes on save: trims, and writes {} for a blank description', async () => {
    await repo().save({ description: '  Lab notes.\n' });
    expect(await repo().load()).toEqual({ description: 'Lab notes.' });

    await repo().save({ description: '   ' });
    expect(localStorage.getItem(STORAGE_KEYS.workspace)).toBe('{}');
    expect(Object.keys(await repo().load())).toEqual([]);

    await repo().save({});
    expect(localStorage.getItem(STORAGE_KEYS.workspace)).toBe('{}');
  });

  it('throws CorruptDataError for a present-but-invalid record', async () => {
    localStorage.setItem(
      STORAGE_KEYS.workspace,
      JSON.stringify({ description: 'x'.repeat(MAX_WORKSPACE_DESCRIPTION_LENGTH + 1) }),
    );
    await expect(repo().load()).rejects.toThrow(CorruptDataError);

    localStorage.setItem(STORAGE_KEYS.workspace, 'null');
    await expect(repo().load()).rejects.toThrow(CorruptDataError);

    localStorage.setItem(STORAGE_KEYS.workspace, '{not json');
    await expect(repo().load()).rejects.toThrow(CorruptDataError);
  });

  it('does not stamp a fresh store', async () => {
    await repo().save({ description: 'Lab notes.' });
    expect(hasSchemaStamp()).toBe(false);
  });

  it('refuses to write into a newer-format store, leaving it untouched (AR-11)', async () => {
    localStorage.setItem(
      STORAGE_KEYS.schema,
      JSON.stringify({ formatVersion: CURRENT_FORMAT_VERSION + 1 }),
    );
    await expect(repo().save({ description: 'x' })).rejects.toThrow(NewerFormatVersionError);
    expect(localStorage.getItem(STORAGE_KEYS.workspace)).toBeNull();
  });
});
