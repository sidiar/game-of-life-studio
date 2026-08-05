import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '@gol/domain';
import { LocalStorageSettingsRepository } from './localStorageSettingsRepository';
import { CorruptDataError, STORAGE_KEYS } from './storage';

afterEach(() => {
  localStorage.clear();
});

function repo() {
  return new LocalStorageSettingsRepository();
}

describe('load', () => {
  it('falls back to the defaults when no record has been written', async () => {
    // A fresh install simply has no gol:settings key (RFC-006 Decision 7) — this must not be an
    // error, and must not be null: every consumer expects a usable Settings.
    expect(await repo().load()).toEqual(DEFAULT_SETTINGS);
  });

  it('backfills the absent fields of a partial record written by an older build', async () => {
    localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify({ theme: 'biotech-terminal' }));

    const settings = await repo().load();

    expect(settings.theme).toBe('biotech-terminal');
    expect(settings.gridLines).toBe(DEFAULT_SETTINGS.gridLines);
    expect(settings.defaultSpeed).toBe(DEFAULT_SETTINGS.defaultSpeed);
  });

  it('throws CorruptDataError for a stored record that is invalid rather than merely partial', async () => {
    localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify({ theme: 'midnight' }));

    await expect(repo().load()).rejects.toThrow(CorruptDataError);
  });

  it('treats a literal null at rest as corrupt, not as an absent key', async () => {
    // Consistent with readCollection()'s explicit null handling for battles/organisms — a PRESENT
    // null is a value that fails to be a settings object, not the same as no key at all.
    localStorage.setItem(STORAGE_KEYS.settings, 'null');

    await expect(repo().load()).rejects.toThrow(CorruptDataError);
  });
});

describe('save', () => {
  it('round-trips a full settings record', async () => {
    const settings = { ...DEFAULT_SETTINGS, theme: 'biotech-terminal' as const, gridLines: false };

    await repo().save(settings);

    expect(await repo().load()).toEqual(settings);
  });

  it('lands under gol:settings', async () => {
    await repo().save(DEFAULT_SETTINGS);

    expect(localStorage.getItem(STORAGE_KEYS.settings)).not.toBeNull();
  });

  it('does not stamp gol:schema — settings are not workspace data', async () => {
    // Decision F: settings are device-local preferences. Stamping here would make a user who
    // changed the theme before creating anything look "already initialised" to Story 1.5's
    // seeding check, which fires only when gol:schema is absent.
    await repo().save(DEFAULT_SETTINGS);

    expect(localStorage.getItem(STORAGE_KEYS.schema)).toBeNull();
  });
});
