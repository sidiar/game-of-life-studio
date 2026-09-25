import { afterEach, describe, expect, it } from 'vitest';
import { CURRENT_FORMAT_VERSION, OrganismSchema, type Organism } from '@gol/domain';
import { LocalStorageOrganismRepository } from './localStorageOrganismRepository';
import { CorruptDataError } from './errors';
import { STORAGE_KEYS } from './localStorageAccess';

afterEach(() => {
  localStorage.clear();
});

/** Built through the schema, so a fixture that drifts out of spec fails here rather than later. */
function makeOrganism(id: string, name = 'Test Organism'): Organism {
  return OrganismSchema.parse({
    schemaVersion: 1,
    id,
    name,
    colorToken: 'cyan',
    dominance: 50,
    agingEnabled: false,
    survivalRules: [
      {
        id: `${id}-rule-1`,
        contentHash: `${id}-hash-1`,
        conditions: [{ property: 'neighborCount', operator: 'eq', pattern: 3 }],
        payload: { summary: 'Born with exactly 3 neighbours', action: 'born' },
      },
    ],
  });
}

function repo() {
  return new LocalStorageOrganismRepository();
}

describe('save / load', () => {
  it('round-trips an organism', async () => {
    const organism = makeOrganism('conways-classic');

    await repo().save(organism);

    expect(await repo().load('conways-classic')).toEqual(organism);
  });

  it('lands under gol:organisms', async () => {
    await repo().save(makeOrganism('conways-classic'));

    expect(localStorage.getItem(STORAGE_KEYS.organisms)).not.toBeNull();
  });

  it('accepts a stable well-known id rather than requiring a uuid', async () => {
    // FR-1.5's protected default is identified by 'conways-classic', not a UUID.
    await expect(repo().save(makeOrganism('conways-classic'))).resolves.toBeUndefined();
  });

  it('returns null for an id that was never stored', async () => {
    expect(await repo().load('missing')).toBeNull();
  });

  it('throws CorruptDataError — never null — for a stored but invalid record', async () => {
    localStorage.setItem(STORAGE_KEYS.organisms, JSON.stringify({ broken: { id: 'broken' } }));

    await expect(repo().load('broken')).rejects.toThrow(CorruptDataError);
  });

  it('preserves siblings when saving one', async () => {
    await repo().save(makeOrganism('first', 'First'));
    await repo().save(makeOrganism('second', 'Second'));

    expect(await repo().list()).toHaveLength(2);
  });
});

describe('list', () => {
  it('returns every stored organism', async () => {
    await repo().save(makeOrganism('first'));
    await repo().save(makeOrganism('second'));

    expect((await repo().list()).map((o) => o.id).sort()).toEqual(['first', 'second']);
  });

  it('returns an empty array when nothing has been stored', async () => {
    expect(await repo().list()).toEqual([]);
  });

  it('skips a corrupt organism rather than failing the whole list', async () => {
    await repo().save(makeOrganism('first'));
    const existing = JSON.parse(localStorage.getItem(STORAGE_KEYS.organisms) ?? '{}');
    localStorage.setItem(
      STORAGE_KEYS.organisms,
      JSON.stringify({ ...existing, broken: { nothing: true } }),
    );

    // One bad organism must not blank the whole library — the good one still lists.
    expect((await repo().list()).map((o) => o.id)).toEqual(['first']);
  });
});

describe('exists / delete', () => {
  it('reports existence', async () => {
    await repo().save(makeOrganism('first'));

    expect(await repo().exists('first')).toBe(true);
    expect(await repo().exists('second')).toBe(false);
  });

  it('deletes unconditionally — the FR-1.4 usage guard is NOT a repository concern', async () => {
    // M7's "blocked while any battle places it" and M9's Conway's Classic protection are domain
    // rules applied by the caller. Implementing them here would bury integrity logic behind a
    // repository, out of reach of the >=90% gate that covers it.
    await repo().save(makeOrganism('conways-classic'));

    await repo().delete('conways-classic');

    expect(await repo().exists('conways-classic')).toBe(false);
  });

  it('is a no-op when deleting an id that is not stored', async () => {
    await expect(repo().delete('missing')).resolves.toBeUndefined();
  });
});

describe('replaceAll', () => {
  it('replaces the whole collection rather than merging into it', async () => {
    await repo().save(makeOrganism('first'));

    await repo().replaceAll([makeOrganism('second')]);

    expect(await repo().exists('first')).toBe(false);
    expect(await repo().exists('second')).toBe(true);
  });

  it('leaves gol:settings untouched', async () => {
    localStorage.setItem(STORAGE_KEYS.settings, '{"theme":"biotech-terminal"}');

    await repo().replaceAll([makeOrganism('first')]);

    expect(localStorage.getItem(STORAGE_KEYS.settings)).toBe('{"theme":"biotech-terminal"}');
  });
});

describe('reserved id', () => {
  // OrganismSchema.id is a bare non-empty string (deliberately, for well-known ids like
  // 'conways-classic'), unlike Battle.id's z.uuid(). '__proto__' would otherwise silently vanish
  // from the plain-object collection instead of being stored.
  it('rejects "__proto__" on save rather than silently losing the record', async () => {
    await expect(repo().save(makeOrganism('__proto__'))).rejects.toThrow();
  });

  it('rejects "__proto__" within replaceAll', async () => {
    await expect(repo().replaceAll([makeOrganism('__proto__')])).rejects.toThrow();
  });
});

describe('the at-rest format check (Story 5.7)', () => {
  // `list()` skips a single unreadable record; a whole store on a newer format is a different
  // fault and must not be skipped past as "no organisms".
  it('rejects load and list with CorruptDataError on a newer gol:schema stamp', async () => {
    await repo().save(makeOrganism('org-a'));
    localStorage.setItem(
      STORAGE_KEYS.schema,
      JSON.stringify({ formatVersion: CURRENT_FORMAT_VERSION + 1 }),
    );

    await expect(repo().load('org-a')).rejects.toThrow(CorruptDataError);
    await expect(repo().list()).rejects.toThrow(CorruptDataError);
  });

  it('rejects replaceAll on a newer stamp and leaves the store byte-identical', async () => {
    await repo().save(makeOrganism('org-a'));
    localStorage.setItem(
      STORAGE_KEYS.schema,
      JSON.stringify({ formatVersion: CURRENT_FORMAT_VERSION + 1 }),
    );
    const before = localStorage.getItem(STORAGE_KEYS.organisms);

    await expect(repo().replaceAll([makeOrganism('org-b')])).rejects.toThrow(CorruptDataError);
    expect(localStorage.getItem(STORAGE_KEYS.organisms)).toBe(before);
  });
});
