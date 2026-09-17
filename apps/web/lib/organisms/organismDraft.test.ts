import { describe, expect, it } from 'vitest';
import { NEW_ORGANISM_DOMINANCE } from '@gol/domain';
import { defaultColorToken } from '@/lib/palette/defaultColorToken';
import { PALETTE } from '@/lib/palette/paletteRegistry';
import { createNewOrganismDraft } from './organismDraft';

describe('createNewOrganismDraft', () => {
  it('seeds an empty name, NEW_ORGANISM_DOMINANCE, aging off, the M6 colour default and no rules for the given library', () => {
    const usedColorTokens = [PALETTE[1].id, PALETTE[2].id];
    expect(createNewOrganismDraft(usedColorTokens)).toEqual({
      name: '',
      dominance: NEW_ORGANISM_DOMINANCE,
      agingEnabled: false,
      colorToken: defaultColorToken(usedColorTokens),
      survivalRules: [],
    });
  });

  // A value the old DEFAULT_COLOR_TOKEN stopgap could not have produced — the test that would have
  // gone red on the old seed.
  it('with one token already used, seeds the NEXT unused entry — not PALETTE[0]', () => {
    expect(createNewOrganismDraft([PALETTE[0].id]).colorToken).toBe(PALETTE[1].id);
  });

  // The seed must never be shared between two opens of the editor: Story 4.23 diffs the draft
  // against its seed, and a shared object would make every edit also an edit of the baseline.
  it('returns a distinct object on every call', () => {
    const first = createNewOrganismDraft([]);
    const second = createNewOrganismDraft([]);
    expect(first).not.toBe(second);
    expect(first).toEqual(second);
  });

  // Story 4.10: a shared empty array would make every rule mutation through one call's reference
  // visible to the other — the same seed-diff reasoning the scalar fields already have.
  it('returns distinct survivalRules arrays on every call', () => {
    const first = createNewOrganismDraft([]);
    const second = createNewOrganismDraft([]);
    expect(first.survivalRules).not.toBe(second.survivalRules);
  });
});
