import { afterEach, describe, expect, it, vi } from 'vitest';
import { CURRENT_FORMAT_VERSION } from '@gol/domain';
import {
  CorruptDataError,
  QuotaExceededError,
  readCollection,
  readStoredValue,
  removeDataKeys,
  STORAGE_KEYS,
  writeDataKey,
  writeSettingsKey,
} from './storage';

// jsdom keeps ONE localStorage per test file. Without this, a key left behind by an earlier test
// silently satisfies a later assertion.
afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

/** Makes the next setItem fail the way a full store does, without filling the store. */
function stubQuotaFailure(name: string, code: number) {
  return vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    const error = new Error('mock quota failure') as Error & { name: string; code: number };
    error.name = name;
    error.code = code;
    throw error;
  });
}

describe('readCollection', () => {
  it('returns an empty collection when the key has never been written', () => {
    expect(readCollection(STORAGE_KEYS.battles)).toEqual({});
  });

  it('round-trips a written collection', () => {
    writeDataKey(STORAGE_KEYS.battles, { 'battle-1': { name: 'Test' } });

    expect(readCollection(STORAGE_KEYS.battles)).toEqual({ 'battle-1': { name: 'Test' } });
  });

  it('throws CorruptDataError when the stored value is not JSON', () => {
    localStorage.setItem(STORAGE_KEYS.battles, '{ this is not json');

    expect(() => readCollection(STORAGE_KEYS.battles)).toThrow(CorruptDataError);
  });

  it('throws CorruptDataError when the stored value is JSON but not an id-keyed object', () => {
    // An array parses fine but would silently produce numeric "ids" downstream.
    localStorage.setItem(STORAGE_KEYS.battles, '[]');

    expect(() => readCollection(STORAGE_KEYS.battles)).toThrow(CorruptDataError);
  });
});

describe('readStoredValue', () => {
  it('returns undefined for an absent key so callers can distinguish it from a stored null', () => {
    expect(readStoredValue(STORAGE_KEYS.settings)).toBeUndefined();
  });
});

describe('quota handling (AC3)', () => {
  it('translates a Chrome/Safari-shaped QuotaExceededError and leaves the previous value intact', () => {
    writeDataKey(STORAGE_KEYS.battles, { 'battle-1': { name: 'Original' } });
    const before = localStorage.getItem(STORAGE_KEYS.battles);
    stubQuotaFailure('QuotaExceededError', 22);

    expect(() =>
      writeDataKey(STORAGE_KEYS.battles, { 'battle-1': { name: 'Replacement' } }),
    ).toThrow(QuotaExceededError);
    // The half that actually proves "never truncated": a removeItem-then-setItem implementation
    // throws exactly the same error and fails this line.
    expect(localStorage.getItem(STORAGE_KEYS.battles)).toBe(before);
  });

  it('translates the Firefox-shaped quota error', () => {
    stubQuotaFailure('NS_ERROR_DOM_QUOTA_REACHED', 1014);

    expect(() => writeDataKey(STORAGE_KEYS.battles, {})).toThrow(QuotaExceededError);
  });

  it('translates the legacy QUOTA_EXCEEDED_ERR name', () => {
    stubQuotaFailure('QUOTA_EXCEEDED_ERR', 22);

    expect(() => writeDataKey(STORAGE_KEYS.battles, {})).toThrow(QuotaExceededError);
  });

  it('propagates a non-quota write failure unchanged rather than mislabelling it', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('SecurityError: storage is disabled');
    });

    expect(() => writeDataKey(STORAGE_KEYS.battles, {})).toThrow('storage is disabled');
    expect(() => writeDataKey(STORAGE_KEYS.battles, {})).not.toThrow(QuotaExceededError);
  });

  it('surfaces a real unstubbed jsdom quota failure without truncating the stored value', () => {
    writeDataKey(STORAGE_KEYS.battles, { 'battle-1': { name: 'Original' } });
    const before = localStorage.getItem(STORAGE_KEYS.battles);

    expect(() => writeDataKey(STORAGE_KEYS.battles, { huge: 'x'.repeat(6_000_000) })).toThrow(
      QuotaExceededError,
    );
    expect(localStorage.getItem(STORAGE_KEYS.battles)).toBe(before);
  });
});

describe('gol:schema stamp (AC2)', () => {
  it('is absent before any write', () => {
    expect(localStorage.getItem(STORAGE_KEYS.schema)).toBeNull();
  });

  it('is stamped with the current format version on the first data write', () => {
    writeDataKey(STORAGE_KEYS.battles, {});

    expect(readStoredValue(STORAGE_KEYS.schema)).toEqual({
      formatVersion: CURRENT_FORMAT_VERSION,
    });
  });

  it('is not rewritten by subsequent writes', () => {
    writeDataKey(STORAGE_KEYS.battles, {});
    // A hand-edited stamp would be clobbered by a re-stamp on every save; it must be written once.
    localStorage.setItem(STORAGE_KEYS.schema, JSON.stringify({ formatVersion: 99 }));
    writeDataKey(STORAGE_KEYS.organisms, {});

    expect(readStoredValue(STORAGE_KEYS.schema)).toEqual({ formatVersion: 99 });
  });

  it('is NOT created when the data write it accompanies fails on quota', () => {
    stubQuotaFailure('QuotaExceededError', 22);

    expect(() => writeDataKey(STORAGE_KEYS.battles, {})).toThrow(QuotaExceededError);
    // A stamped-but-empty store makes Story 1.5 skip DEFAULT_WORKSPACE seeding (it seeds only
    // when gol:schema is absent), leaving the user with no Conway's Classic and no error.
    expect(localStorage.getItem(STORAGE_KEYS.schema)).toBeNull();
  });

  it('is NOT created by a settings write', () => {
    // Settings are device-local, not workspace data (Decision F). If a theme toggle stamped the
    // schema, a user who changed the theme before creating anything would trip the same
    // stamped-but-empty seeding hole as above.
    writeSettingsKey(STORAGE_KEYS.settings, { theme: 'clinical-lab' });

    expect(localStorage.getItem(STORAGE_KEYS.settings)).not.toBeNull();
    expect(localStorage.getItem(STORAGE_KEYS.schema)).toBeNull();
  });
});

describe('removeDataKeys (AC5)', () => {
  it('removes both data keys and cannot reach settings or the schema stamp', () => {
    writeDataKey(STORAGE_KEYS.battles, { 'battle-1': {} });
    writeDataKey(STORAGE_KEYS.organisms, { 'organism-1': {} });
    writeSettingsKey(STORAGE_KEYS.settings, { theme: 'biotech-terminal' });
    const settingsBefore = localStorage.getItem(STORAGE_KEYS.settings);

    removeDataKeys();

    expect(localStorage.getItem(STORAGE_KEYS.battles)).toBeNull();
    expect(localStorage.getItem(STORAGE_KEYS.organisms)).toBeNull();
    expect(localStorage.getItem(STORAGE_KEYS.settings)).toBe(settingsBefore);
    // The stamp describes the format of the store, which Clear All does not change.
    expect(localStorage.getItem(STORAGE_KEYS.schema)).not.toBeNull();
  });
});
