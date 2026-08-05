// Story 1.1's workspace-graph proof is no longer a placeholder: the repositories below import
// @gol/domain schemas for real, so the declared "@gol/domain": "*" edge is exercised by the
// build itself rather than by a stub kept alive for that purpose.

export type {
  AppRepositories,
  BattleRepository,
  OrganismRepository,
  SettingsRepository,
} from './repositories';

export { createLocalStorageRepositories } from './createLocalStorageRepositories';

export { ensureDefaultOrganism } from './ensureDefaultOrganism';
export { seedDefaultWorkspace } from './seedDefaultWorkspace';

export { LocalStorageBattleRepository } from './localStorageBattleRepository';
export { LocalStorageOrganismRepository } from './localStorageOrganismRepository';
export { LocalStorageSettingsRepository } from './localStorageSettingsRepository';

// Callers need these to tell "storage is full" apart from "stored data is unreadable" — both are
// recoverable states the UI reports differently (NFR-7.2 / NFR-7.3).
export { CorruptDataError, QuotaExceededError, STORAGE_KEYS } from './storage';
export type { StorageKey } from './storage';
