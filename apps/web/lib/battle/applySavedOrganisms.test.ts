import { describe, expect, it } from 'vitest';
import type { Organism } from '@gol/domain';
import { CONWAYS_CLASSIC, createMockOrganisms } from '@gol/test-utils';
import { adoptSavedOrganism, applySavedOrganisms } from './applySavedOrganisms';

const [first, second] = createMockOrganisms();
const LIST: readonly Organism[] = [CONWAYS_CLASSIC, first, second];

describe('applySavedOrganisms (Story 4.24, FD5)', () => {
  it('returns the list ITSELF when nothing was saved — the memo keeps its identity', () => {
    expect(applySavedOrganisms(LIST, [])).toBe(LIST);
  });

  it('replaces a saved record by id, in place, leaving the order and the others untouched', () => {
    const edited: Organism = { ...first, name: 'Renamed', colorToken: 'gold' };

    const result = applySavedOrganisms(LIST, [edited]);

    expect(result.map((organism) => organism.id)).toEqual(LIST.map((organism) => organism.id));
    expect(result[1]).toBe(edited);
    expect(result[0]).toBe(CONWAYS_CLASSIC);
    expect(result[2]).toBe(second);
    // Never mutates the loaded list.
    expect(LIST[1]).toBe(first);
  });

  it('appends a saved record the list does not hold (the Story 4.25 branch)', () => {
    const created: Organism = { ...first, id: 'created-in-battle', name: 'New' };

    expect(applySavedOrganisms(LIST, [created]).map((organism) => organism.id)).toEqual([
      ...LIST.map((organism) => organism.id),
      'created-in-battle',
    ]);
  });
});

describe('adoptSavedOrganism (Story 4.24)', () => {
  it('appends a first adoption and replaces a later one of the same id', () => {
    const v1: Organism = { ...first, name: 'v1' };
    const v2: Organism = { ...first, name: 'v2' };
    const other: Organism = { ...second, name: 'other' };

    const once = adoptSavedOrganism([], v1);
    expect(once).toEqual([v1]);
    const twice = adoptSavedOrganism([...once, other], v2);
    expect(twice).toEqual([v2, other]);
  });
});
