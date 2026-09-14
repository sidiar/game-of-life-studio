import { describe, expect, it } from 'vitest';
import { CONWAYS_CLASSIC, type Organism } from '@gol/domain';
import { sortLibrary } from './sortLibrary';

// A minimal, schema-shaped Organism built from CONWAYS_CLASSIC as a base — only `id`/`name` vary
// per test, and every other field is irrelevant to sort order.
function organism(id: string, name: string): Organism {
  return { ...CONWAYS_CLASSIC, id, name };
}

describe('sortLibrary', () => {
  it("pins Conway's Classic first regardless of input position", () => {
    const beta = organism('beta-id', 'Beta');
    const alpha = organism('alpha-id', 'Alpha');
    const conway = { ...CONWAYS_CLASSIC };

    const sorted = sortLibrary([beta, alpha, conway]);

    expect(sorted[0].id).toBe(CONWAYS_CLASSIC.id);
  });

  it('sorts the rest case-folded first, then by raw name', () => {
    const beta = organism('beta-id', 'beta');
    const alphaUpper = organism('alpha-upper-id', 'Alpha');
    const alphaLower = organism('alpha-lower-id', 'alpha');

    const sorted = sortLibrary([beta, alphaUpper, alphaLower]);

    expect(sorted.map((o) => o.name)).toEqual(['Alpha', 'alpha', 'beta']);
  });

  it('breaks a same-name tie by id', () => {
    const first = organism('id-a', 'Twin');
    const second = organism('id-b', 'Twin');

    const sorted = sortLibrary([second, first]);

    expect(sorted.map((o) => o.id)).toEqual(['id-a', 'id-b']);
  });

  it('does not mutate its input array', () => {
    const beta = organism('beta-id', 'Beta');
    const alpha = organism('alpha-id', 'Alpha');
    const input = [beta, alpha];
    const original = [...input];

    sortLibrary(input);

    expect(input).toEqual(original);
  });

  // The pin is by ID, not name — a clone named identically to Conway's Classic must not jump the
  // queue (deferred-work.md:363: names are not unique).
  it('does not pin a different organism that merely shares Conway’s name', () => {
    const impostor = organism('impostor-id', CONWAYS_CLASSIC.name);
    const alpha = organism('alpha-id', 'Alpha');

    const sorted = sortLibrary([impostor, alpha]);

    expect(sorted[0].id).toBe('alpha-id');
  });
});
