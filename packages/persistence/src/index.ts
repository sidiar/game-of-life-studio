// Story 1.1's workspace-graph proof is no longer a placeholder: the repositories below import
// @gol/domain schemas for real, so the declared "@gol/domain": "*" edge is exercised by the
// build itself rather than by a stub kept alive for that purpose.

export type {
  AppRepositories,
  BattleRepository,
  OrganismRepository,
  SettingsRepository,
  StorageUsage,
} from './repositories';

export { createLocalStorageRepositories } from './createLocalStorageRepositories';

export { ensureDefaultOrganism } from './ensureDefaultOrganism';
export { seedDefaultWorkspace } from './seedDefaultWorkspace';

export { LocalStorageBattleRepository } from './localStorageBattleRepository';
export { LocalStorageOrganismRepository } from './localStorageOrganismRepository';
export { LocalStorageSettingsRepository } from './localStorageSettingsRepository';

// Callers need these to tell "storage is full" apart from "stored data is unreadable" — both are
// recoverable states the UI reports differently (NFR-7.2 / NFR-7.3).
export { CorruptDataError } from './errors';
export { QuotaExceededError, STORAGE_KEYS } from './localStorageAccess';
export type { StorageKey } from './localStorageAccess';

// The AR-14 usage meter (Story 5.2). `storageBytesOf` is the pure formula @gol/test-utils' fake
// shares so it cannot drift from the real meter; `measureStorageUsage` is the localStorage reader
// the page-boundary test derives its expected figure from. Production code reaches the meter only
// through `AppRepositories.storageUsage()`.
export { measureStorageUsage, storageBytesOf } from './localStorageAccess';

// Exported so @gol/test-utils' in-memory fakes can enforce the identical id guard rather than
// re-stating it (review 2026-08-05). A fake that accepts an id LocalStorageOrganismRepository
// rejects lets a test go green against a save the real store would have thrown on — and two
// copies of the rule would be free to drift apart silently.
export { assertSafeCollectionId } from './errors';
