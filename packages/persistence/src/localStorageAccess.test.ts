import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMigrator, CURRENT_FORMAT_VERSION, isFormatMigrationError } from '@gol/domain';
import type { FormatMigration } from '@gol/domain';
import { CorruptDataError } from './errors';
import {
  ensureCurrentAtRestFormat,
  hasSchemaStamp,
  measureStorageUsage,
  QuotaExceededError,
  readCollection,
  readStoredValue,
  removeDataKeys,
  STORAGE_KEYS,
  storageBytesOf,
  writeDataKey,
  writeSettingsKey,
} from './localStorageAccess';

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

    // jsdom 30.0.1 enforces a ~5-10MB per-origin quota (undocumented exact figure, verified
    // empirically); 6MB reliably clears it without depending on the precise ceiling.
    expect(() => writeDataKey(STORAGE_KEYS.battles, { huge: 'x'.repeat(6_000_000) })).toThrow(
      QuotaExceededError,
    );
    expect(localStorage.getItem(STORAGE_KEYS.battles)).toBe(before);
  });

  it('does not fail the caller when only the trailing stamp write hits quota', () => {
    // The data write (call 1) must succeed while the schema-stamp write (call 2) fails — the
    // narrow window where a save genuinely persisted but the accompanying stamp did not.
    const originalSetItem = Storage.prototype.setItem;
    let calls = 0;
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (
      this: Storage,
      key: string,
      value: string,
    ) {
      calls += 1;
      if (calls === 2) {
        const error = new Error('mock quota failure') as Error & { name: string };
        error.name = 'QuotaExceededError';
        throw error;
      }
      originalSetItem.call(this, key, value);
    });

    expect(() => writeDataKey(STORAGE_KEYS.battles, { a: 1 })).not.toThrow();
    // The data write went through; the stamp write failed and was swallowed rather than reported
    // as a failed save. The next successful writeDataKey call re-attempts the stamp.
    expect(readStoredValue(STORAGE_KEYS.battles)).toEqual({ a: 1 });
    expect(localStorage.getItem(STORAGE_KEYS.schema)).toBeNull();
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
    // The edit keeps the CURRENT version: since Story 5.7 a foreign version is a format question
    // (a newer one refuses the write), so the marker key is what proves the stamp was left alone.
    const edited = JSON.stringify({ formatVersion: CURRENT_FORMAT_VERSION, marker: 'hand-edited' });
    localStorage.setItem(STORAGE_KEYS.schema, edited);
    writeDataKey(STORAGE_KEYS.organisms, {});

    expect(localStorage.getItem(STORAGE_KEYS.schema)).toBe(edited);
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

describe('hasSchemaStamp (Story 1.5 AC1)', () => {
  it('is false with no gol:schema record — the RFC-006 Decision 7 first-run trigger', () => {
    expect(hasSchemaStamp()).toBe(false);
  });

  it('is true once a data write has stamped the schema', () => {
    writeDataKey(STORAGE_KEYS.battles, {});

    expect(hasSchemaStamp()).toBe(true);
  });

  it('stays true after removeDataKeys — Clear All does not un-stamp the store', () => {
    writeDataKey(STORAGE_KEYS.battles, {});
    removeDataKeys();

    expect(hasSchemaStamp()).toBe(true);
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

describe('storage usage (AR-14, Story 5.2)', () => {
  it('storageBytesOf([]) is 0', () => {
    expect(storageBytesOf([])).toBe(0);
  });

  it('storageBytesOf pins the UTF-16 × 2 constant', () => {
    // 'k' + 'v' = 2 code units × 2 bytes = 4.
    expect(storageBytesOf([['k', 'v']])).toBe(4);
  });

  it('counts a non-BMP character as two UTF-16 code units, not one code point', () => {
    // '😀' is a surrogate pair — .length is 2, so this pins UTF-16 code-unit accounting, not
    // Array.from()'s code-point count (which would report 1 and half the byte figure).
    expect(storageBytesOf([['', '😀']])).toBe(4);
  });

  it('measureStorageUsage() is { bytes: 0 } on an empty store', () => {
    expect(measureStorageUsage()).toEqual({ bytes: 0 });
  });

  it('does not count a key outside STORAGE_KEYS', () => {
    localStorage.setItem('unrelated', 'x'.repeat(1000));

    expect(measureStorageUsage()).toEqual({ bytes: 0 });
  });

  it('counts all four STORAGE_KEYS, including gol:settings and gol:schema', () => {
    writeDataKey(STORAGE_KEYS.battles, { 'battle-1': {} });
    writeDataKey(STORAGE_KEYS.organisms, { 'organism-1': {} });
    writeSettingsKey(STORAGE_KEYS.settings, { theme: 'clinical-lab' });

    const stored: Array<readonly [string, string]> = [
      STORAGE_KEYS.schema,
      STORAGE_KEYS.battles,
      STORAGE_KEYS.organisms,
      STORAGE_KEYS.settings,
    ].map((key) => [key, localStorage.getItem(key) as string]);

    expect(measureStorageUsage()).toEqual({ bytes: storageBytesOf(stored) });
  });

  it('counts a non-JSON gol:battles record and does not throw (FD3)', () => {
    localStorage.setItem(STORAGE_KEYS.battles, '{not json');
    // readCollection throws on the same store — the meter must not.
    expect(() => readCollection(STORAGE_KEYS.battles)).toThrow(CorruptDataError);

    expect(() => measureStorageUsage()).not.toThrow();
    expect(measureStorageUsage().bytes).toBeGreaterThan(0);
  });
});

describe('the at-rest format check (Story 5.7, AR-11)', () => {
  const BATTLES = JSON.stringify({ 'battle-1': { name: 'Stored battle' } });
  const ORGANISMS = JSON.stringify({ 'org-1': { name: 'Stored organism' } });

  function seed(stamp: string | null): void {
    localStorage.setItem(STORAGE_KEYS.battles, BATTLES);
    localStorage.setItem(STORAGE_KEYS.organisms, ORGANISMS);
    if (stamp !== null) localStorage.setItem(STORAGE_KEYS.schema, stamp);
  }

  function snapshot(): Array<string | null> {
    return [STORAGE_KEYS.battles, STORAGE_KEYS.organisms, STORAGE_KEYS.schema].map((key) =>
      localStorage.getItem(key),
    );
  }

  it('lets reads proceed on a current stamp and writes nothing', () => {
    seed(JSON.stringify({ formatVersion: CURRENT_FORMAT_VERSION }));
    const before = snapshot();
    const setItem = vi.spyOn(Storage.prototype, 'setItem');

    expect(readCollection(STORAGE_KEYS.battles)).toEqual(JSON.parse(BATTLES));
    expect(readCollection(STORAGE_KEYS.organisms)).toEqual(JSON.parse(ORGANISMS));
    expect(setItem).not.toHaveBeenCalled();
    expect(snapshot()).toEqual(before);
  });

  it('lets reads proceed with no stamp (fresh, or settings-only) and writes nothing', () => {
    seed(null);
    const setItem = vi.spyOn(Storage.prototype, 'setItem');

    expect(readCollection(STORAGE_KEYS.battles)).toEqual(JSON.parse(BATTLES));
    expect(setItem).not.toHaveBeenCalled();
    expect(localStorage.getItem(STORAGE_KEYS.schema)).toBeNull();
  });

  it('does not read the collections on the identity path — a corrupt gol:battles cannot break an organism read', () => {
    seed(JSON.stringify({ formatVersion: CURRENT_FORMAT_VERSION }));
    localStorage.setItem(STORAGE_KEYS.battles, '{ not json');

    expect(readCollection(STORAGE_KEYS.organisms)).toEqual(JSON.parse(ORGANISMS));
  });

  it('rejects a newer stamp as CorruptDataError caused by newer-version, leaving every key byte-identical', () => {
    seed(JSON.stringify({ formatVersion: CURRENT_FORMAT_VERSION + 1 }));
    const before = snapshot();

    let thrown: unknown;
    try {
      readCollection(STORAGE_KEYS.battles);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(CorruptDataError);
    const cause = (thrown as CorruptDataError).cause;
    expect(isFormatMigrationError(cause) && cause.code).toBe('newer-version');
    expect((thrown as Error).message).toContain('newer version');
    expect(snapshot()).toEqual(before);
  });

  it.each([
    ['not JSON', 'x'],
    ['JSON but not an object', '"x"'],
    ['an array', '[]'],
    ['an object with no formatVersion', '{}'],
    ['a string formatVersion', JSON.stringify({ formatVersion: '1' })],
  ])('rejects a stamp that is %s as CorruptDataError', (_label, stamp) => {
    seed(stamp);

    expect(() => readCollection(STORAGE_KEYS.organisms)).toThrow(CorruptDataError);
    expect(localStorage.getItem(STORAGE_KEYS.schema)).toBe(stamp);
  });

  it('refuses a data write under a newer stamp before touching the store', () => {
    // `replaceAll` writes without reading, so the read-side check alone would let this build
    // overwrite a newer format's data — and leave its stamp for the next read to reject.
    seed(JSON.stringify({ formatVersion: CURRENT_FORMAT_VERSION + 1 }));
    const before = snapshot();

    expect(() => writeDataKey(STORAGE_KEYS.battles, { 'battle-9': {} })).toThrow(CorruptDataError);
    expect(snapshot()).toEqual(before);
  });

  it('propagates a non-migration error from the migrator unchanged', () => {
    seed(JSON.stringify({ formatVersion: 1 }));
    const bug = new TypeError('a bug, not a format problem');

    expect(() =>
      ensureCurrentAtRestFormat(() => {
        throw bug;
      }),
    ).toThrow(bug);
  });

  describe('write-back through a synthetic v1 → v2 migrator', () => {
    // Renames every stored name, so a migrated byte is distinguishable from an original one.
    const renameAll = (collection: unknown) =>
      Object.fromEntries(
        Object.entries(collection as Record<string, { name: string }>).map(([id, record]) => [
          id,
          { ...record, name: `${record.name} (v2)` },
        ]),
      );
    const step: FormatMigration = (doc, representation) => {
      expect(representation).toBe('at-rest');
      return { battles: renameAll(doc['battles']), organisms: renameAll(doc['organisms']) };
    };
    const migrator = createMigrator({ migrations: { 1: step }, currentVersion: 2 });

    /**
     * Fails the FIRST `setItem` to one key, the way a full store does. Only the first: the rollback
     * then restores that key's original, which fits because the store held it a moment ago.
     */
    function failWritesTo(target: string) {
      const originalSetItem = Storage.prototype.setItem;
      let failed = false;
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (
        this: Storage,
        key: string,
        value: string,
      ) {
        if (key === target && !failed) {
          failed = true;
          const error = new Error('mock quota failure') as Error & { name: string };
          error.name = 'QuotaExceededError';
          throw error;
        }
        originalSetItem.call(this, key, value);
      });
    }

    it('writes both migrated collections and restamps', () => {
      seed(JSON.stringify({ formatVersion: 1 }));

      ensureCurrentAtRestFormat(migrator);

      expect(readStoredValue(STORAGE_KEYS.battles)).toEqual({
        'battle-1': { name: 'Stored battle (v2)' },
      });
      expect(readStoredValue(STORAGE_KEYS.organisms)).toEqual({
        'org-1': { name: 'Stored organism (v2)' },
      });
      expect(readStoredValue(STORAGE_KEYS.schema)).toEqual({ formatVersion: 2 });
    });

    it('restores battles and leaves the stamp alone when the organisms write hits quota', () => {
      seed(JSON.stringify({ formatVersion: 1 }));
      const before = snapshot();
      failWritesTo(STORAGE_KEYS.organisms);

      expect(() => ensureCurrentAtRestFormat(migrator)).toThrow(QuotaExceededError);
      expect(snapshot()).toEqual(before);
    });

    it('restores both data keys when the stamp write itself fails', () => {
      // Migrated data under the old stamp would be migrated AGAIN on the next load.
      seed(JSON.stringify({ formatVersion: 1 }));
      const before = snapshot();
      failWritesTo(STORAGE_KEYS.schema);

      expect(() => ensureCurrentAtRestFormat(migrator)).toThrow(QuotaExceededError);
      expect(snapshot()).toEqual(before);
    });

    it('rolls back to an absent key when a collection had never been written', () => {
      localStorage.setItem(STORAGE_KEYS.battles, BATTLES);
      localStorage.setItem(STORAGE_KEYS.schema, JSON.stringify({ formatVersion: 1 }));
      failWritesTo(STORAGE_KEYS.schema);

      expect(() => ensureCurrentAtRestFormat(migrator)).toThrow(QuotaExceededError);
      expect(localStorage.getItem(STORAGE_KEYS.organisms)).toBeNull();
      expect(localStorage.getItem(STORAGE_KEYS.battles)).toBe(BATTLES);
    });

    it.each<[string, unknown]>([
      ['an array', []],
      ['a Map (serialises as {})', new Map([['org-1', {}]])],
      ['absent', undefined],
    ])('rejects a step whose organisms output is %s, writing nothing', (_label, organisms) => {
      seed(JSON.stringify({ formatVersion: 1 }));
      const before = snapshot();
      const broken = createMigrator({
        migrations: { 1: (doc) => ({ ...doc, organisms }) },
        currentVersion: 2,
      });

      expect(() => ensureCurrentAtRestFormat(broken)).toThrow(CorruptDataError);
      expect(snapshot()).toEqual(before);
    });

    it('rejects a migrator whose result carries no usable formatVersion, writing nothing', () => {
      // Only an injected migrator can do this (`migrate` stamps after every step); the stamp it
      // would have written makes every later read throw, so it is refused up front.
      seed(JSON.stringify({ formatVersion: 1 }));
      const before = snapshot();
      const unstamped = () => ({ battles: {}, organisms: {}, formatVersion: '2' });

      expect(() => ensureCurrentAtRestFormat(unstamped)).toThrow(CorruptDataError);
      expect(snapshot()).toEqual(before);
    });
  });
});
