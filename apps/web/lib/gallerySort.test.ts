import { describe, expect, it } from 'vitest';
import type { BattleSummary } from '@gol/domain';
import { sortByLastModified } from './gallerySort';

function summary(overrides: Partial<BattleSummary> & { id: string }): BattleSummary {
  return {
    name: 'Battle',
    gridSize: { cols: 50, rows: 30 },
    organismIds: [],
    updatedAt: new Date('2026-08-01T00:00:00.000Z'),
    ...overrides,
  };
}

describe('sortByLastModified', () => {
  it('sorts descending by updatedAt — most recent first (AC2, FR-7.1)', () => {
    const oldest = summary({ id: 'a', name: 'A', updatedAt: new Date('2026-07-01T00:00:00.000Z') });
    const newest = summary({ id: 'b', name: 'B', updatedAt: new Date('2026-08-01T00:00:00.000Z') });
    const middle = summary({ id: 'c', name: 'C', updatedAt: new Date('2026-07-15T00:00:00.000Z') });

    expect(sortByLastModified([oldest, newest, middle]).map((b) => b.id)).toEqual(['b', 'c', 'a']);
  });

  it('breaks an equal updatedAt tie by name, ascending', () => {
    const tie = new Date('2026-08-01T00:00:00.000Z');
    const zebra = summary({ id: 'z', name: 'Zebra Battle', updatedAt: tie });
    const apple = summary({ id: 'a', name: 'Apple Battle', updatedAt: tie });

    expect(sortByLastModified([zebra, apple]).map((b) => b.id)).toEqual(['a', 'z']);
  });

  it('breaks an equal updatedAt AND name tie by id, ascending', () => {
    const tie = new Date('2026-08-01T00:00:00.000Z');
    const second = summary({ id: 'b-id', name: 'Same Name', updatedAt: tie });
    const first = summary({ id: 'a-id', name: 'Same Name', updatedAt: tie });

    expect(sortByLastModified([second, first]).map((b) => b.id)).toEqual(['a-id', 'b-id']);
  });

  it('does not mutate the input array', () => {
    const input = [
      summary({ id: 'a', updatedAt: new Date('2026-07-01T00:00:00.000Z') }),
      summary({ id: 'b', updatedAt: new Date('2026-08-01T00:00:00.000Z') }),
    ];
    const originalOrder = input.map((b) => b.id);

    sortByLastModified(input);

    expect(input.map((b) => b.id)).toEqual(originalOrder);
  });

  it('returns an empty array unchanged', () => {
    expect(sortByLastModified([])).toEqual([]);
  });
});
