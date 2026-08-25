import { describe, expect, it } from 'vitest';
import { CONWAYS_CLASSIC } from '@gol/domain';
import { displayColor, MAX_AGE_SHADE } from '@/lib/palette/displayColor';
import { DEFAULT_COLOR_TOKEN } from '@/lib/palette/paletteRegistry';
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

  // BattleSchema rejects duplicate organismIds; BattleSummarySchema (what list() parses) does not,
  // so a hand-edited record reaches here with repeats and would collide React keys.
  it('drops duplicate ids, keeping the first occurrence and the surrounding order', () => {
    const other = { ...CONWAYS_CLASSIC, id: 'other-id', name: 'Other' };
    const resolved = resolveTileOrganisms(
      [CONWAYS_CLASSIC.id, other.id, CONWAYS_CLASSIC.id],
      [CONWAYS_CLASSIC, other],
    );

    expect(resolved.map((o) => o.id)).toEqual([CONWAYS_CLASSIC.id, other.id]);
  });

  // OrganismSchema.name has no .min(1), so "" parses and would reach aria-label — leaving the dot
  // with no accessible name at all.
  it('substitutes a placeholder for an empty or whitespace-only organism name', () => {
    const unnamed = { ...CONWAYS_CLASSIC, id: 'blank-id', name: '   ' };
    const [resolved] = resolveTileOrganisms([unnamed.id], [unnamed]);

    expect(resolved.name).toBe('Unnamed organism');
  });
});
