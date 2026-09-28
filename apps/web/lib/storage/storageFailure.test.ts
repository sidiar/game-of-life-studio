import { describe, expect, it } from 'vitest';
import {
  CorruptDataError,
  NewerFormatVersionError,
  QuotaExceededError,
  STORAGE_KEYS,
} from '@gol/persistence';
import {
  classifyStorageFailure,
  pickStorageFailure,
  UNCLASSIFIED_STORAGE_FAILURE,
} from './storageFailure';
import * as messages from './storageFailureMessages';

describe('classifyStorageFailure (Story 5.11, FD2)', () => {
  it('classifies a newer format FIRST — never as corrupt, even under gol:schema', () => {
    const newer = new NewerFormatVersionError(STORAGE_KEYS.schema, 2, 1, 'x');
    expect(newer).toBeInstanceOf(CorruptDataError);
    expect(classifyStorageFailure(newer)).toBe('newer-version');
  });

  it.each([STORAGE_KEYS.battles, STORAGE_KEYS.organisms, STORAGE_KEYS.schema])(
    'classifies a CorruptDataError under %s as corrupt workspace data',
    (key) => {
      expect(classifyStorageFailure(new CorruptDataError(key, 'x'))).toBe('corrupt-workspace');
    },
  );

  it('classifies a CorruptDataError under gol:settings as corrupt settings', () => {
    expect(classifyStorageFailure(new CorruptDataError(STORAGE_KEYS.settings, 'x'))).toBe(
      'corrupt-settings',
    );
  });

  it('classifies a refused write as storage full', () => {
    expect(classifyStorageFailure(new QuotaExceededError(STORAGE_KEYS.organisms))).toBe(
      'storage-full',
    );
  });

  it.each([
    ['a SecurityError DOMException', new DOMException('blocked', 'SecurityError')],
    ['a plain Error', new Error('boom')],
    ['a thrown string', 'boom'],
    ['null', null],
  ])('classifies %s as unavailable', (_label, error) => {
    expect(classifyStorageFailure(error)).toBe('unavailable');
  });
});

describe('pickStorageFailure (FD2 priority)', () => {
  const newer = new NewerFormatVersionError(STORAGE_KEYS.schema, 2, 1, 'x');
  const workspace = new CorruptDataError(STORAGE_KEYS.battles, 'x');
  const settings = new CorruptDataError(STORAGE_KEYS.settings, 'x');
  const full = new QuotaExceededError(STORAGE_KEYS.organisms);
  const other = new Error('boom');

  it('returns null when nothing failed, skipping undefined entries', () => {
    expect(pickStorageFailure([])).toBeNull();
    expect(pickStorageFailure([undefined, undefined])).toBeNull();
  });

  it('orders newer > corrupt workspace > corrupt settings > storage full > unavailable', () => {
    const kindOf = (errors: unknown[]) => pickStorageFailure(errors)?.kind;
    expect(kindOf([other, full, settings, workspace, newer])).toBe('newer-version');
    expect(kindOf([other, full, settings, workspace])).toBe('corrupt-workspace');
    expect(kindOf([other, full, settings])).toBe('corrupt-settings');
    expect(kindOf([other, undefined, full])).toBe('storage-full');
    expect(kindOf([undefined, other])).toBe('unavailable');
  });

  // Owner ruling D2 (b): the failed keys travel with the kind, so the copy can name them.
  it('carries the distinct CorruptDataError keys of the picked corrupt kind, and only those', () => {
    const organisms = new CorruptDataError(STORAGE_KEYS.organisms, 'x');
    expect(pickStorageFailure([workspace, settings, organisms, workspace])).toEqual({
      kind: 'corrupt-workspace',
      corruptKeys: [STORAGE_KEYS.battles, STORAGE_KEYS.organisms],
    });
    expect(pickStorageFailure([other, settings])).toEqual({
      kind: 'corrupt-settings',
      corruptKeys: [STORAGE_KEYS.settings],
    });
    // A newer stamp is a CorruptDataError too — its key never leaks into a corrupt line.
    expect(pickStorageFailure([newer, workspace])).toEqual({
      kind: 'newer-version',
      corruptKeys: [],
    });
    expect(pickStorageFailure([full])).toEqual({ kind: 'storage-full', corruptKeys: [] });
  });

  it('falls back to a non-destructive, key-less unavailable', () => {
    expect(UNCLASSIFIED_STORAGE_FAILURE).toEqual({ kind: 'unavailable', corruptKeys: [] });
  });
});

describe('corruptWorkspaceMessage (owner ruling D2 (b))', () => {
  it.each([
    [[STORAGE_KEYS.battles], messages.CORRUPT_BATTLES_MESSAGE],
    [[STORAGE_KEYS.organisms], messages.CORRUPT_ORGANISMS_MESSAGE],
    [[STORAGE_KEYS.battles, STORAGE_KEYS.organisms], messages.CORRUPT_WORKSPACE_MESSAGE],
    // The stamp is what every collection read failed through, so it wins over either collection.
    [[STORAGE_KEYS.organisms, STORAGE_KEYS.schema], messages.CORRUPT_FORMAT_MESSAGE],
    [[STORAGE_KEYS.schema], messages.CORRUPT_FORMAT_MESSAGE],
    [[], messages.CORRUPT_WORKSPACE_MESSAGE],
  ])('%j → its own line', (keys, text) => {
    expect(messages.corruptWorkspaceMessage(keys)).toBe(text);
  });

  it('names only what failed, and always what the reset deletes', () => {
    expect(messages.CORRUPT_BATTLES_MESSAGE).not.toMatch(/organisms could not/u);
    expect(messages.CORRUPT_ORGANISMS_MESSAGE).not.toMatch(/battles could not/u);
    for (const text of [
      messages.CORRUPT_BATTLES_MESSAGE,
      messages.CORRUPT_ORGANISMS_MESSAGE,
      messages.CORRUPT_FORMAT_MESSAGE,
      messages.CORRUPT_WORKSPACE_MESSAGE,
    ]) {
      expect(text).toContain('which deletes all battles and organisms');
      expect(text).toContain('nothing has been changed');
    }
  });
});

describe('storage failure copy (FD6)', () => {
  it.each(Object.entries(messages).filter(([, v]) => typeof v === 'string'))(
    '%s names no key, story ID or dead-section word',
    (_n, text) => {
      expect(text).not.toMatch(/gol:|Story|\bFR-|\bAR-/u);
      expect(text).not.toMatch(/theme|display|simulation|auto-save/iu);
    },
  );
});
