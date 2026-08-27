import { describe, expect, it } from 'vitest';
import { CONWAYS_CLASSIC } from '@gol/domain';
import { displayColor, MAX_AGE_SHADE } from '@/lib/palette/displayColor';
import { DEFAULT_COLOR_TOKEN } from '@/lib/palette/paletteRegistry';
import { resolveDisplayOrganisms } from './displayOrganisms';

describe('resolveDisplayOrganisms', () => {
  it('resolves a known id to its roster name and identity-shade colour', () => {
    const [resolved] = resolveDisplayOrganisms([CONWAYS_CLASSIC.id], [CONWAYS_CLASSIC]);

    expect(resolved).toEqual({
      id: CONWAYS_CLASSIC.id,
      name: CONWAYS_CLASSIC.name,
      color: displayColor(CONWAYS_CLASSIC.colorToken, MAX_AGE_SHADE),
      colorToken: CONWAYS_CLASSIC.colorToken,
    });
  });

  // Story 2.9 AC4/trap 4: the same-colour warning compares TOKENS, so the token has to survive
  // resolution. Pinned as its own claim because the resolved `color` above would keep this file
  // green while `colorToken` silently went missing — and FR-3.3's warning would simply stop
  // firing, with no failure anywhere.
  it('carries the organism’s colorToken through, alongside the resolved hex', () => {
    const [resolved] = resolveDisplayOrganisms([CONWAYS_CLASSIC.id], [CONWAYS_CLASSIC]);

    expect(resolved.colorToken).toBe(CONWAYS_CLASSIC.colorToken);
  });

  it('resolves a dangling id (present in organismIds, absent from the roster) to a fallback, never throwing', () => {
    const [resolved] = resolveDisplayOrganisms(['ghost-organism'], []);

    expect(resolved.id).toBe('ghost-organism');
    expect(resolved.name).toBe('Unknown organism');
    expect(resolved.color).toBe(displayColor(DEFAULT_COLOR_TOKEN, MAX_AGE_SHADE));
    // The reported token is the one this entry is actually painted in — so AC4's warning stays
    // truthful about dangling ids rather than treating them as colourless.
    expect(resolved.colorToken).toBe(DEFAULT_COLOR_TOKEN);
  });

  it('preserves organismIds order, one entry per id', () => {
    const other = { ...CONWAYS_CLASSIC, id: 'other-id', name: 'Other' };
    const resolved = resolveDisplayOrganisms(
      [other.id, CONWAYS_CLASSIC.id],
      [CONWAYS_CLASSIC, other],
    );

    expect(resolved.map((o) => o.id)).toEqual([other.id, CONWAYS_CLASSIC.id]);
  });

  it('returns an empty array for an empty roster reference', () => {
    expect(resolveDisplayOrganisms([], [])).toEqual([]);
  });

  // BattleSchema rejects duplicate organismIds; BattleSummarySchema (what list() parses) does not,
  // so a hand-edited record reaches here with repeats and would collide React keys.
  it('drops duplicate ids, keeping the first occurrence and the surrounding order', () => {
    const other = { ...CONWAYS_CLASSIC, id: 'other-id', name: 'Other' };
    const resolved = resolveDisplayOrganisms(
      [CONWAYS_CLASSIC.id, other.id, CONWAYS_CLASSIC.id],
      [CONWAYS_CLASSIC, other],
    );

    expect(resolved.map((o) => o.id)).toEqual([CONWAYS_CLASSIC.id, other.id]);
  });

  // OrganismSchema.name has no .min(1), so "" parses and would reach aria-label — leaving the dot
  // with no accessible name at all.
  it('substitutes a placeholder for an empty or whitespace-only organism name', () => {
    const unnamed = { ...CONWAYS_CLASSIC, id: 'blank-id', name: '   ' };
    const [resolved] = resolveDisplayOrganisms([unnamed.id], [unnamed]);

    expect(resolved.name).toBe('Unnamed organism');
  });
});
