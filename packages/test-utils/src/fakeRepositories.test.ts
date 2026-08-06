import { describe, expect, it } from 'vitest';
import {
  BattleSchema,
  DEFAULT_SETTINGS,
  OrganismSchema,
  type Battle,
  type Organism,
} from '@gol/domain';
import { CorruptDataError } from '@gol/persistence';
import { createFakeRepositories } from './fakeRepositories';

const PRESET = { cols: 50, rows: 30 } as const;

function gridWith(values: number[]): number[][] {
  const grid = Array.from({ length: PRESET.rows }, () =>
    Array.from({ length: PRESET.cols }, () => 0),
  );
  values.forEach((v, i) => {
    grid[Math.floor(i / PRESET.cols)][i % PRESET.cols] = v;
  });
  return grid;
}

function makeBattle(id: string, name = 'Test Battle'): Battle {
  return BattleSchema.parse({
    id,
    name,
    organismIds: ['conways-classic'],
    gridSize: PRESET,
    gridState: gridWith([1]),
    createdAt: '2026-08-03T10:00:00.000Z',
    updatedAt: '2026-08-03T11:00:00.000Z',
  });
}

function makeOrganism(id: string, name = 'Test Organism'): Organism {
  return OrganismSchema.parse({
    schemaVersion: 1,
    id,
    name,
    colorToken: 'vermillion',
    dominance: 50,
    agingEnabled: false,
    survivalRules: [
      {
        id: 'rule-1',
        contentHash: 'hash-1',
        conditions: [{ property: 'neighborCount', operator: 'eq', pattern: 3 }],
        payload: { summary: 'Born with exactly 3 neighbours', action: 'born' },
      },
    ],
  });
}

const ID_A = '123e4567-e89b-12d3-a456-426614174000';
const ID_B = '223e4567-e89b-12d3-a456-426614174001';

describe('battles', () => {
  it('round-trips a battle through JSON with timestamps rehydrated as Dates', async () => {
    const repos = createFakeRepositories();
    const battle = makeBattle(ID_A);

    await repos.battles.save(battle);
    const loaded = await repos.battles.load(ID_A);

    expect(loaded).toEqual(battle);
    expect(loaded?.createdAt).toBeInstanceOf(Date);
  });

  it('returns null for an id never stored, and throws CorruptDataError for a stored-but-invalid record', async () => {
    const repos = createFakeRepositories({ raw: { battles: { [ID_B]: { id: ID_B } } } });

    expect(await repos.battles.load(ID_A)).toBeNull();
    await expect(repos.battles.load(ID_B)).rejects.toThrow(CorruptDataError);
  });

  it('a fake battle store does not hand back a live reference the caller can mutate', async () => {
    const repos = createFakeRepositories();
    const battle = makeBattle(ID_A);

    await repos.battles.save(battle);
    // Mutating the object the caller passed to save() must not corrupt the store.
    (battle as { name: string }).name = 'Mutated after save';

    const loaded = await repos.battles.load(ID_A);
    expect(loaded?.name).toBe('Test Battle');
  });

  it('list() returns summaries with no gridState field', async () => {
    const repos = createFakeRepositories();
    await repos.battles.save(makeBattle(ID_A));

    const [summary] = await repos.battles.list();

    expect('gridState' in summary).toBe(false);
  });

  it('list() skips a record too corrupt to parse rather than throwing', async () => {
    const repos = createFakeRepositories({
      raw: { battles: { [ID_B]: { nothing: true } } },
    });
    await repos.battles.save(makeBattle(ID_A));

    const summaries = await repos.battles.list();

    expect(summaries.map((s) => s.id)).toEqual([ID_A]);
  });

  it('listFull() skips a corrupt battle rather than failing the whole export', async () => {
    const repos = createFakeRepositories({
      raw: { battles: { [ID_B]: { nothing: true } } },
    });
    await repos.battles.save(makeBattle(ID_A));

    const battles = await repos.battles.listFull();

    expect(battles.map((b) => b.id)).toEqual([ID_A]);
  });

  it('exists() is presence-only — true even for a present-but-corrupt record', async () => {
    const repos = createFakeRepositories({ raw: { battles: { [ID_A]: { id: ID_A } } } });

    expect(await repos.battles.exists(ID_A)).toBe(true);
    await expect(repos.battles.load(ID_A)).rejects.toThrow(CorruptDataError);
  });

  it('delete() removes only the targeted battle and is a no-op for an absent id', async () => {
    const repos = createFakeRepositories();
    await repos.battles.save(makeBattle(ID_A));
    await repos.battles.save(makeBattle(ID_B));

    await repos.battles.delete(ID_A);

    expect(await repos.battles.exists(ID_A)).toBe(false);
    expect(await repos.battles.exists(ID_B)).toBe(true);
    await expect(repos.battles.delete(ID_A)).resolves.toBeUndefined();
  });

  it('replaceAll() replaces the whole collection rather than merging into it', async () => {
    const repos = createFakeRepositories();
    await repos.battles.save(makeBattle(ID_A));

    await repos.battles.replaceAll([makeBattle(ID_B)]);

    expect(await repos.battles.exists(ID_A)).toBe(false);
    expect(await repos.battles.exists(ID_B)).toBe(true);
  });
});

describe('organisms', () => {
  it('round-trips an organism through JSON + the Zod schema', async () => {
    const repos = createFakeRepositories();
    const organism = makeOrganism('mock-org');

    await repos.organisms.save(organism);
    const loaded = await repos.organisms.load('mock-org');

    expect(loaded).toEqual(organism);
  });

  it('list() skips a corrupt organism rather than blanking the library', async () => {
    const repos = createFakeRepositories({
      raw: { organisms: { corrupt: { nothing: true } } },
    });
    await repos.organisms.save(makeOrganism('mock-org'));

    const organisms = await repos.organisms.list();

    expect(organisms.map((o) => o.id)).toEqual(['mock-org']);
  });
});

describe('settings', () => {
  it('load() is never null — an absent record resolves to DEFAULT_SETTINGS', async () => {
    const repos = createFakeRepositories();

    expect(await repos.settings.load()).toEqual(DEFAULT_SETTINGS);
  });

  it('round-trips a saved settings record', async () => {
    const repos = createFakeRepositories();
    await repos.settings.save({ ...DEFAULT_SETTINGS, theme: 'biotech-terminal' });

    expect((await repos.settings.load()).theme).toBe('biotech-terminal');
  });

  it('does not stamp the workspace — a settings save alone leaves isFreshWorkspace() true', async () => {
    const repos = createFakeRepositories();
    await repos.settings.save({ ...DEFAULT_SETTINGS, theme: 'biotech-terminal' });

    expect(await repos.isFreshWorkspace()).toBe(true);
  });
});

describe('contract fidelity with the localStorage repositories', () => {
  // LocalStorageOrganismRepository.save()/replaceAll() open with this guard: OrganismSchema.id is a
  // bare non-empty string, so '__proto__' reaches a plain-object collection and rebinds its
  // prototype instead of storing a record. A Map-backed fake survives it — which is exactly why it
  // has to reject the id explicitly, or a test asserting the rejection goes green here and fails
  // against the real store.
  it('organisms.save() rejects the __proto__ id, matching the real repository', async () => {
    const repos = createFakeRepositories();
    const organism = { ...makeOrganism('placeholder'), id: '__proto__' };

    await expect(repos.organisms.save(organism)).rejects.toThrow(/__proto__/);
  });

  it('organisms.replaceAll() rejects __proto__ before clearing the collection', async () => {
    const repos = createFakeRepositories({ organisms: [makeOrganism('keeper')] });
    const organism = { ...makeOrganism('placeholder'), id: '__proto__' };

    await expect(repos.organisms.replaceAll([organism])).rejects.toThrow(/__proto__/);
    // The real replaceAll builds its collection before writing, so a rejected id leaves the
    // existing records in place.
    expect((await repos.organisms.list()).map((o) => o.id)).toEqual(['keeper']);
  });

  // The real load() returns a fresh SettingsSchema.parse({}) each call, while DEFAULT_SETTINGS is
  // Object.freeze'd — returning the singleton made a caller that mutates loaded settings throw
  // here and succeed against localStorage.
  it('settings.load() returns a fresh, mutable object for an absent record', async () => {
    const repos = createFakeRepositories();

    const first = await repos.settings.load();
    const second = await repos.settings.load();

    expect(first).toEqual(DEFAULT_SETTINGS);
    expect(first).not.toBe(second);
    expect(Object.isFrozen(first)).toBe(false);
  });

  // The FakeSeed contract is that `raw` bypasses validation and everything else does not. The
  // compile-time annotation is not validation: a fixture cast `as Battle` behaved exactly like
  // `raw`, leaving the two paths indistinguishable.
  it('a seeded record that fails its schema is rejected unless it goes through raw', () => {
    const notABattle = { id: ID_A, name: 'broken' } as unknown as Battle;

    expect(() => createFakeRepositories({ battles: [notABattle] })).toThrow(/not valid/);
    expect(() =>
      createFakeRepositories({ raw: { battles: { [ID_A]: { junk: true } } } }),
    ).not.toThrow();
  });

  it('an empty raw collection does not stamp the workspace', async () => {
    // Seeding nothing stores nothing, so both seed paths must agree that the workspace is still
    // fresh — the flag the whole M9 self-heal protection rests on.
    const raw = createFakeRepositories({ raw: { battles: {} } });
    const validated = createFakeRepositories({ battles: [] });

    expect(await raw.isFreshWorkspace()).toBe(true);
    expect(await validated.isFreshWorkspace()).toBe(true);
  });
});

describe('clearAll (Decision F / AR-12)', () => {
  it('clears battles and organisms but leaves settings untouched', async () => {
    const repos = createFakeRepositories();
    await repos.battles.save(makeBattle(ID_A));
    await repos.organisms.save(makeOrganism('mock-org'));
    await repos.settings.save({ ...DEFAULT_SETTINGS, theme: 'biotech-terminal' });

    await repos.clearAll();

    expect(await repos.battles.list()).toEqual([]);
    expect(await repos.organisms.list()).toEqual([]);
    expect((await repos.settings.load()).theme).toBe('biotech-terminal');
  });
});

describe('isFreshWorkspace', () => {
  it('is true on an empty fake', async () => {
    const repos = createFakeRepositories();

    expect(await repos.isFreshWorkspace()).toBe(true);
  });

  it('flips false on the first data write', async () => {
    const repos = createFakeRepositories();
    await repos.organisms.save(makeOrganism('mock-org'));

    expect(await repos.isFreshWorkspace()).toBe(false);
  });

  // The exact M9 self-heal trap this task calls out: freshness must not be re-derived from
  // "is the organism map empty" after the map has been legitimately emptied.
  it('stays false when the organism map is later emptied — not re-derived from emptiness', async () => {
    const repos = createFakeRepositories();
    await repos.organisms.save(makeOrganism('mock-org'));
    await repos.organisms.delete('mock-org');

    expect(await repos.organisms.list()).toEqual([]);
    expect(await repos.isFreshWorkspace()).toBe(false);
  });

  it('stays false after clearAll — the stamp survives Clear All by design', async () => {
    const repos = createFakeRepositories();
    await repos.organisms.save(makeOrganism('mock-org'));

    await repos.clearAll();

    expect(await repos.isFreshWorkspace()).toBe(false);
  });

  it('a seed with pre-populated data reports an already-initialized workspace', async () => {
    const repos = createFakeRepositories({ organisms: [makeOrganism('mock-org')] });

    expect(await repos.isFreshWorkspace()).toBe(false);
  });
});
