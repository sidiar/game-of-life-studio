import { describe, expect, it } from 'vitest';
import {
  CorruptDataError,
  NewerFormatVersionError,
  QuotaExceededError,
  STORAGE_KEYS,
} from '@gol/persistence';
import { classifyStorageFailure, pickStorageFailure } from './storageFailure';
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
    expect(pickStorageFailure([other, full, settings, workspace, newer])).toBe('newer-version');
    expect(pickStorageFailure([other, full, settings, workspace])).toBe('corrupt-workspace');
    expect(pickStorageFailure([other, full, settings])).toBe('corrupt-settings');
    expect(pickStorageFailure([other, undefined, full])).toBe('storage-full');
    expect(pickStorageFailure([undefined, other])).toBe('unavailable');
  });
});

describe('storage failure copy (FD6)', () => {
  it.each(Object.entries(messages))(
    '%s names no key, story ID or dead-section word',
    (_n, text) => {
      expect(text).not.toMatch(/gol:|Story|\bFR-|\bAR-/u);
      expect(text).not.toMatch(/theme|display|simulation|auto-save/iu);
    },
  );
});
