import { describe, expect, it } from 'vitest';
import { NO_RULES_WARNING, ORGANISM_SAVED, saveOutcomeMessage } from './saveOutcome';

describe('saveOutcomeMessage', () => {
  it('is ORGANISM_SAVED alone for an organism with one rule', () => {
    expect(
      saveOutcomeMessage({
        survivalRules: [
          { id: 'r1', contentHash: 'h', conditions: [], payload: { summary: '', action: 'born' } },
        ],
      }),
    ).toBe(ORGANISM_SAVED);
  });

  it('is both sentences, space-joined, for zero rules', () => {
    expect(saveOutcomeMessage({ survivalRules: [] })).toBe(`${ORGANISM_SAVED} ${NO_RULES_WARNING}`);
  });

  it('the exact strings', () => {
    expect(ORGANISM_SAVED).toBe('Organism saved successfully.');
    expect(NO_RULES_WARNING).toBe('No rules defined. Organism will have no living cells.');
  });
});
