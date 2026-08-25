import { SettingsSchema, type Settings } from '@gol/domain';
import type { SettingsRepository } from './repositories';
import { CorruptDataError, describeIssues } from './errors';
import { readStoredValue, STORAGE_KEYS, writeSettingsKey } from './localStorageAccess';

/**
 * Device-local preferences under `gol:settings` (Decision F). This record is the one thing in the
 * store that never enters an export envelope and that clearAll() cannot reach.
 */
export class LocalStorageSettingsRepository implements SettingsRepository {
  async load(): Promise<Settings> {
    const stored = readStoredValue(STORAGE_KEYS.settings);
    // A fresh install has no record at all — not an error, and not null: callers expect a usable
    // Settings (RFC-006 Decision 7). Parsing `{}` also backfills a record written by a build that
    // predated a field, via the per-field defaults on SettingsSchema. An ABSENT key (undefined) is
    // the only thing that falls back to `{}` — a PRESENT literal `null` is a value that fails to be
    // a settings object and must fall through to the corrupt branch below, consistent with
    // readCollection()'s explicit null handling for battles/organisms.
    const parsed = SettingsSchema.safeParse(stored === undefined ? {} : stored);
    if (!parsed.success) {
      // Present-but-invalid is distinct from absent, consistent with the other repositories.
      // Boot does not depend on this path: the FOUC script reads the theme with its own defensive
      // parse (Decision J.3), and Story 5.11 owns the user-facing corruption behaviour.
      throw new CorruptDataError(STORAGE_KEYS.settings, describeIssues(parsed.error.issues));
    }
    return parsed.data;
  }

  async save(settings: Settings): Promise<void> {
    // writeSettingsKey, not writeDataKey: a settings write must never stamp gol:schema.
    writeSettingsKey(STORAGE_KEYS.settings, settings);
  }
}
