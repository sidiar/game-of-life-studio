import { describe, expect, it } from 'vitest';
import { CONWAYS_CLASSIC } from '@gol/domain';
import { displayColor, MAX_AGE_SHADE } from '@/lib/displayColor';
import { DEFAULT_COLOR_TOKEN } from '@/lib/paletteRegistry';
import { resolveTileOrganisms } from './tileOrganisms';

describe('resolveTileOrganisms', () => {
  it('resolves a known id to its roster name and identity-shade colour', () => {
    const [resolved] = resolveTileOrganisms([CONWAYS_CLASSIC.id], [CONWAYS_CLASSIC]);

    expect(resolved).toEqual({
      id: CONWAYS_CLASSIC.id,
      name: CONWAYS_CLASSIC.name,
      color: displayColor(CONWAYS_CLASSIC.colorToken, MAX_AGE_SHADE),
    });
  });

  it('resolves a dangling id (present in organismIds, absent from the roster) to a fallback, never throwing', () => {
    const [resolved] = resolveTileOrganisms(['ghost-organism'], []);

    expect(resolved.id).toBe('ghost-organism');
    expect(resolved.name).toBe('Unknown organism');
    expect(resolved.color).toBe(displayColor(DEFAULT_COLOR_TOKEN, MAX_AGE_SHADE));
  });

  it('preserves organismIds order, one entry per id', () => {
    const other = { ...CONWAYS_CLASSIC, id: 'other-id', name: 'Other' };
    const resolved = resolveTileOrganisms([other.id, CONWAYS_CLASSIC.id], [CONWAYS_CLASSIC, other]);

    expect(resolved.map((o) => o.id)).toEqual([other.id, CONWAYS_CLASSIC.id]);
  });

  it('returns an empty array for an empty roster reference', () => {
    expect(resolveTileOrganisms([], [])).toEqual([]);
  });
});
