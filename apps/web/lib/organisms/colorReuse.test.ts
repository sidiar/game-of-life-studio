import { describe, expect, it } from 'vitest';
import type { Organism } from '@gol/domain';
import { CONWAYS_CLASSIC, createMockOrganisms } from '@gol/test-utils';
import { toDisplayOrganism } from '@/lib/displayOrganisms';
import { colorReuseWarning, usersByColorToken } from './colorReuse';

describe('usersByColorToken', () => {
  it('an empty organism list maps to an empty map', () => {
    expect(usersByColorToken([])).toEqual(new Map());
  });

  it('three organisms on three distinct tokens produce three singleton entries, names verbatim', () => {
    const [a, b, c] = createMockOrganisms();
    const map = usersByColorToken([a, b, c]);

    expect(map.get(a.colorToken)).toEqual([a.name]);
    expect(map.get(b.colorToken)).toEqual([b.name]);
    expect(map.get(c.colorToken)).toEqual([c.name]);
  });

  it('two organisms sharing a token collect into one entry, in INPUT order', () => {
    const [a, b] = createMockOrganisms();
    const shared: Organism = { ...b, colorToken: a.colorToken };

    const forward = usersByColorToken([a, shared]);
    expect(forward.get(a.colorToken)).toEqual([a.name, shared.name]);

    // Reversing the input reverses the order in the entry — pins the "input order", not "registry
    // order" or "alphabetical" claim.
    const reversed = usersByColorToken([shared, a]);
    expect(reversed.get(a.colorToken)).toEqual([shared.name, a.name]);
  });

  it('an organism with an empty stored name reads "Unnamed organism"', () => {
    const [a] = createMockOrganisms();
    const blank: Organism = { ...a, name: '' };

    const map = usersByColorToken([blank]);

    // Imported from a toDisplayOrganism call, never a literal — the fallback string lives in one
    // place (`lib/displayOrganisms.ts`).
    expect(map.get(blank.colorToken)).toEqual([toDisplayOrganism(blank).name]);
  });

  it('an unknown palette token is kept as a key', () => {
    const [a] = createMockOrganisms();
    const corrupt: Organism = { ...a, colorToken: 'not-a-real-token' };

    const map = usersByColorToken([corrupt]);

    expect(map.has('not-a-real-token')).toBe(true);
    expect(map.get('not-a-real-token')).toEqual([corrupt.name]);
  });

  it('CONWAYS_CLASSIC resolves under its own real name', () => {
    const map = usersByColorToken([CONWAYS_CLASSIC]);

    expect(map.get(CONWAYS_CLASSIC.colorToken)).toEqual([CONWAYS_CLASSIC.name]);
  });
});

describe('colorReuseWarning', () => {
  it('no names -> null', () => {
    expect(colorReuseWarning([])).toBeNull();
  });

  it('one name', () => {
    expect(colorReuseWarning(["Conway's Classic"])).toBe(
      "Conway's Classic already uses this color.",
    );
  });

  it('two names', () => {
    expect(colorReuseWarning(['A', 'B'])).toBe('A and B already use this color.');
  });

  it('three names', () => {
    expect(colorReuseWarning(['A', 'B', 'C'])).toBe('A, B and 1 more already use this color.');
  });

  it('five names', () => {
    expect(colorReuseWarning(['A', 'B', 'C', 'D', 'E'])).toBe(
      'A, B and 3 more already use this color.',
    );
  });
});

// The (2) `three organisms on three distinct tokens` / (3) `two organisms sharing a token` cases
// above use `Organism` names verbatim (non-empty in every fixture), so `toDisplayOrganism` and the
// production code agree trivially there; the (4) empty-name case is the one that actually
// exercises the fallback, and it is pinned against the real function above.
