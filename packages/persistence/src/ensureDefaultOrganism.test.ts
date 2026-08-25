import { CONWAYS_CLASSIC, CONWAYS_CLASSIC_ID } from '@gol/domain';
import { afterEach, describe, expect, it } from 'vitest';
import { ensureDefaultOrganism } from './ensureDefaultOrganism';
import { LocalStorageOrganismRepository } from './localStorageOrganismRepository';
import { STORAGE_KEYS } from './localStorageAccess';

afterEach(() => {
  localStorage.clear();
});

describe('ensureDefaultOrganism (AC2, AC3)', () => {
  it("adds Conway's Classic when absent", async () => {
    const organisms = new LocalStorageOrganismRepository();

    await ensureDefaultOrganism(organisms);

    expect(await organisms.load(CONWAYS_CLASSIC_ID)).toEqual(CONWAYS_CLASSIC);
  });

  it('is idempotent — a second call creates no duplicate', async () => {
    const organisms = new LocalStorageOrganismRepository();

    await ensureDefaultOrganism(organisms);
    await ensureDefaultOrganism(organisms);

    const list = await organisms.list();
    expect(list.filter((o) => o.id === CONWAYS_CLASSIC_ID)).toHaveLength(1);
  });

  it('does NOT overwrite a modified stored Conway — protected from deletion, not editing', async () => {
    const organisms = new LocalStorageOrganismRepository();
    const edited = { ...CONWAYS_CLASSIC, dominance: 75 };
    await organisms.save(edited);

    await ensureDefaultOrganism(organisms);

    // An unconditional save() would silently revert the user's edit on every app load.
    expect((await organisms.load(CONWAYS_CLASSIC_ID))?.dominance).toBe(75);
  });

  it('re-adds a missing default after it is deleted out from under it', async () => {
    const organisms = new LocalStorageOrganismRepository();
    await ensureDefaultOrganism(organisms);
    await organisms.delete(CONWAYS_CLASSIC_ID);

    await ensureDefaultOrganism(organisms);

    expect(await organisms.load(CONWAYS_CLASSIC_ID)).toEqual(CONWAYS_CLASSIC);
  });

  it('does not throw when the stored record is present but corrupt', async () => {
    // exists() reports true for a present-but-corrupt record (M9: no self-heal on a plain
    // at-rest load) — ensure must gate on exists(), not load(), or boot itself crashes.
    localStorage.setItem(
      STORAGE_KEYS.organisms,
      JSON.stringify({ [CONWAYS_CLASSIC_ID]: { garbage: true } }),
    );
    const organisms = new LocalStorageOrganismRepository();

    await expect(ensureDefaultOrganism(organisms)).resolves.toBeUndefined();
    // The corrupt record is left untouched — ensure neither heals nor overwrites it.
    await expect(organisms.load(CONWAYS_CLASSIC_ID)).rejects.toThrow();
  });
});
