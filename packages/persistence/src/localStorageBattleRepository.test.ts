import { afterEach, describe, expect, it, vi } from 'vitest';
import { BattleSchema, type Battle } from '@gol/domain';
import { LocalStorageBattleRepository } from './localStorageBattleRepository';
import { CorruptDataError, QuotaExceededError, STORAGE_KEYS } from './storage';

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

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

/** Built through the schema, so a fixture that drifts out of spec fails here rather than later. */
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

const ID_A = '123e4567-e89b-12d3-a456-426614174000';
const ID_B = '223e4567-e89b-12d3-a456-426614174001';

function repo() {
  return new LocalStorageBattleRepository();
}

describe('save / load', () => {
  it('round-trips a battle through JSON with timestamps rehydrated as Dates', async () => {
    const battle = makeBattle(ID_A);

    await repo().save(battle);
    const loaded = await repo().load(ID_A);

    expect(loaded).toEqual(battle);
    // The regression guard for the ISO-timestamp resolution: JSON.stringify writes Dates as ISO
    // strings, and BattleSchema must hydrate them back. Equality alone would pass on raw strings.
    expect(loaded?.createdAt).toBeInstanceOf(Date);
    expect(loaded?.updatedAt).toBeInstanceOf(Date);
  });

  it('writes the dense gridState at rest (sparse cells are wire-only)', async () => {
    await repo().save(makeBattle(ID_A));

    const stored = JSON.parse(localStorage.getItem(STORAGE_KEYS.battles) ?? '{}');
    expect(stored[ID_A].gridState).toHaveLength(PRESET.rows);
    expect(stored[ID_A].gridState[0]).toHaveLength(PRESET.cols);
  });

  it('lands under gol:battles', async () => {
    await repo().save(makeBattle(ID_A));

    expect(localStorage.getItem(STORAGE_KEYS.battles)).not.toBeNull();
  });

  it('returns null for an id that was never stored', async () => {
    expect(await repo().load(ID_A)).toBeNull();
  });

  it('throws CorruptDataError — never null — for a stored but invalid record', async () => {
    // Collapsing this to null reads as "no such battle": the editor would treat it as new and the
    // next save would overwrite a record that was merely unparseable.
    localStorage.setItem(STORAGE_KEYS.battles, JSON.stringify({ [ID_A]: { id: ID_A } }));

    await expect(repo().load(ID_A)).rejects.toThrow(CorruptDataError);
  });

  it('preserves sibling battles when saving one', async () => {
    await repo().save(makeBattle(ID_A, 'First'));
    await repo().save(makeBattle(ID_B, 'Second'));

    expect((await repo().load(ID_A))?.name).toBe('First');
    expect((await repo().load(ID_B))?.name).toBe('Second');
  });

  it('overwrites an existing battle with the same id', async () => {
    await repo().save(makeBattle(ID_A, 'Before'));
    await repo().save(makeBattle(ID_A, 'After'));

    expect(await repo().list()).toHaveLength(1);
    expect((await repo().load(ID_A))?.name).toBe('After');
  });
});

describe('list (AC1 — lightweight projection)', () => {
  it('returns summaries carrying no gridState', async () => {
    await repo().save(makeBattle(ID_A));

    const [summary] = await repo().list();

    expect('gridState' in summary).toBe(false);
    expect(summary.organismIds).toEqual(['conways-classic']);
    expect(summary.updatedAt).toBeInstanceOf(Date);
  });

  it('returns an empty array when nothing has been stored', async () => {
    expect(await repo().list()).toEqual([]);
  });

  // This is what proves list() genuinely never reads the grid, rather than doing a full parse and
  // deleting the field afterwards — the latter would throw here.
  it('lists a battle whose gridState is corrupt, while load() rejects it', async () => {
    const stored = { ...makeBattle(ID_A), gridState: 'not-a-grid' };
    localStorage.setItem(STORAGE_KEYS.battles, JSON.stringify({ [ID_A]: stored }));

    expect(await repo().list()).toHaveLength(1);
    await expect(repo().load(ID_A)).rejects.toThrow(CorruptDataError);
  });

  it('throws CorruptDataError when a record is unusable even as a summary', async () => {
    localStorage.setItem(STORAGE_KEYS.battles, JSON.stringify({ [ID_A]: { nothing: true } }));

    await expect(repo().list()).rejects.toThrow(CorruptDataError);
  });
});

describe('listFull', () => {
  it('returns fully parsed battles including gridState', async () => {
    await repo().save(makeBattle(ID_A));

    const [full] = await repo().listFull();

    expect(full.gridState).toHaveLength(PRESET.rows);
    expect(full.createdAt).toBeInstanceOf(Date);
  });
});

describe('exists / delete', () => {
  it('reports existence without loading the battle', async () => {
    await repo().save(makeBattle(ID_A));

    expect(await repo().exists(ID_A)).toBe(true);
    expect(await repo().exists(ID_B)).toBe(false);
  });

  it('removes only the targeted battle', async () => {
    await repo().save(makeBattle(ID_A));
    await repo().save(makeBattle(ID_B));

    await repo().delete(ID_A);

    expect(await repo().exists(ID_A)).toBe(false);
    expect(await repo().exists(ID_B)).toBe(true);
  });

  it('is a no-op when deleting an id that is not stored', async () => {
    await expect(repo().delete(ID_A)).resolves.toBeUndefined();
  });
});

describe('replaceAll', () => {
  it('replaces the whole collection rather than merging into it', async () => {
    await repo().save(makeBattle(ID_A));

    await repo().replaceAll([makeBattle(ID_B)]);

    expect(await repo().exists(ID_A)).toBe(false);
    expect(await repo().exists(ID_B)).toBe(true);
  });

  it('empties the collection when given no battles', async () => {
    await repo().save(makeBattle(ID_A));

    await repo().replaceAll([]);

    expect(await repo().list()).toEqual([]);
  });

  it('leaves gol:settings untouched', async () => {
    localStorage.setItem(STORAGE_KEYS.settings, '{"theme":"biotech-terminal"}');

    await repo().replaceAll([makeBattle(ID_A)]);

    expect(localStorage.getItem(STORAGE_KEYS.settings)).toBe('{"theme":"biotech-terminal"}');
  });
});

describe('quota (AC3)', () => {
  it('surfaces QuotaExceededError and leaves the stored collection intact', async () => {
    await repo().save(makeBattle(ID_A, 'Original'));
    const before = localStorage.getItem(STORAGE_KEYS.battles);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      const error = new Error('full') as Error & { name: string };
      error.name = 'QuotaExceededError';
      throw error;
    });

    await expect(repo().save(makeBattle(ID_B, 'Rejected'))).rejects.toThrow(QuotaExceededError);
    expect(localStorage.getItem(STORAGE_KEYS.battles)).toBe(before);
  });
});
