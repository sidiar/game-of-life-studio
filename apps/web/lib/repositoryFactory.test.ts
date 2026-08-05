import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  LocalStorageBattleRepository,
  LocalStorageOrganismRepository,
  LocalStorageSettingsRepository,
} from '@gol/persistence';
import { createRepositories } from './repositoryFactory';

afterEach(() => {
  vi.doUnmock('./mode');
  vi.resetModules();
  vi.restoreAllMocks();
});

describe('createRepositories', () => {
  it('selects the localStorage implementations in standalone mode', () => {
    // NEXT_PUBLIC_MODE is unset under test, and lib/mode.ts defaults to 'standalone' — the same
    // default next.config.mjs uses, which is what keeps the two from claiming different modes.
    const repos = createRepositories();

    expect(repos.battles).toBeInstanceOf(LocalStorageBattleRepository);
    expect(repos.organisms).toBeInstanceOf(LocalStorageOrganismRepository);
    expect(repos.settings).toBeInstanceOf(LocalStorageSettingsRepository);
  });

  it('exposes a data-only clearAll on the assembled set', () => {
    expect(typeof createRepositories().clearAll).toBe('function');
  });

  it('constructs without touching storage, so a static build can import it safely', () => {
    const getItem = vi.spyOn(Storage.prototype, 'getItem');
    const setItem = vi.spyOn(Storage.prototype, 'setItem');

    createRepositories();

    expect(getItem).not.toHaveBeenCalled();
    expect(setItem).not.toHaveBeenCalled();
  });

  it('refuses a mode that has no implementation instead of silently returning localStorage', async () => {
    vi.resetModules();
    vi.doMock('./mode', () => ({ APP_MODE: 'connected' }));

    const { createRepositories: create } = await import('./repositoryFactory');

    expect(() => create()).toThrow(/connected/i);
  });
});
