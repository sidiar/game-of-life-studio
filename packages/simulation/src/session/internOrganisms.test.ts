import { MOCK_ORGANISM_IDS, createMockOrganisms } from '@gol/test-utils';
import { describe, expect, it } from 'vitest';

import { cellSelectors } from '../gol/cellSubject';
import type { CellSubject } from '../gol/cellSubject';
import { operators } from '../engine/operators';
import { internOrganismIds, NO_MATCH_REF } from './internOrganisms';

const cell = (over: Partial<CellSubject> = {}): CellSubject => ({
  state: 'occupied',
  organismType: 1,
  age: 0,
  neighborCount: 0,
  occupantNeighborCount: 0,
  ...over,
});

describe('internOrganismIds (AR-8, Decision E.3, M14)', () => {
  it('maps roster index i to ref i + 1, with slot 0 reserved for empty', () => {
    const ids = createMockOrganisms().map((organism) => organism.id);
    const refById = internOrganismIds(ids);

    expect(refById.get(MOCK_ORGANISM_IDS.aggressiveColonizer)).toBe(1);
    expect(refById.get(MOCK_ORGANISM_IDS.patientDefender)).toBe(2);
    expect(refById.get(MOCK_ORGANISM_IDS.chaoticSpreader)).toBe(3);
    // Trap 1: the off-by-one that produces a plausible battle rather than a failing test. No ref
    // is ever 0, because 0 is the dense encoding's EMPTY cell value.
    expect([...refById.values()]).not.toContain(0);
    expect(Math.min(...refById.values())).toBe(1);
  });

  it('reads back as organisms[ref - 1], not organisms[ref]', () => {
    const organisms = createMockOrganisms();
    const refById = internOrganismIds(organisms.map((organism) => organism.id));
    const ref = refById.get(MOCK_ORGANISM_IDS.chaoticSpreader) ?? 0;

    expect(organisms[ref - 1]?.id).toBe(MOCK_ORGANISM_IDS.chaoticSpreader);
  });

  it('rejects a duplicate id rather than letting the later index win silently', () => {
    expect(() => internOrganismIds(['a', 'b', 'a'])).toThrow(/duplicate organism id "a"/);
  });

  it('is empty for an empty roster', () => {
    expect(internOrganismIds([]).size).toBe(0);
  });
});

// FD6, and Trap 3 — the single most damaging way to get the sentinel wrong. `eq` is unguarded by
// design (operators.ts), so these are the two comparisons that decide whether "occupied by an
// organism this battle does not include" is `false` everywhere or `true` on every empty cell.
describe('NO_MATCH_REF matches nothing (FD6, Decision E.3)', () => {
  it('is a number that can never equal a real ref', () => {
    const refById = internOrganismIds(createMockOrganisms().map((organism) => organism.id));
    for (const ref of refById.values()) {
      expect(operators.eq(ref, NO_MATCH_REF)).toBe(false);
    }
  });

  it('never matches an occupied cell, through the real selector', () => {
    const value = cellSelectors.organismType(cell({ organismType: 1 }));
    expect(operators.eq(value, NO_MATCH_REF)).toBe(false);
  });

  it('never matches an EMPTY cell, whose organismType is null', () => {
    const value = cellSelectors.organismType(cell({ state: 'empty', organismType: null }));
    expect(operators.eq(value, NO_MATCH_REF)).toBe(false);
    // The counter-example that makes the choice load-bearing: `null` as the sentinel would
    // AFFIRMATIVELY match every empty cell, so a `born` rule targeting an absent organism would
    // populate the entire grid.
    expect(operators.eq(value, null)).toBe(true);
    // …and `0`, the other tempting sentinel, is the reserved empty slot itself.
    expect(NO_MATCH_REF).not.toBe(0);
  });
});
