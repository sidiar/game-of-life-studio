import { describe, expect, it } from 'vitest';
import { CONWAYS_CLASSIC } from './defaultWorkspace';
import { isPristineWorkspace } from './pristineWorkspace';
import type { Organism } from './organismSchema';

/** A mutable plain-JSON clone — `CONWAYS_CLASSIC` is deep-frozen, so every mutating test builds
 * its own copy first. JSON round-tripping is safe here: every `Organism` field is a plain JSON
 * value (no `Date`, no `undefined`). */
function clone(): Organism {
  return JSON.parse(JSON.stringify(CONWAYS_CLASSIC)) as Organism;
}

/** Rebuilds an object with its keys inserted in the REVERSE of their current order, recursively —
 * proves the comparison does not degrade to a `JSON.stringify` comparison, which the header
 * comment on `pristineWorkspace.ts` forbids. */
function reorderKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(reorderKeys);
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).reverse();
    const reordered: Record<string, unknown> = {};
    for (const [key, val] of entries) reordered[key] = reorderKeys(val);
    return reordered;
  }
  return value;
}

describe('isPristineWorkspace', () => {
  it('is pristine for zero battles and the seed alone', () => {
    expect(isPristineWorkspace(0, [CONWAYS_CLASSIC])).toBe(true);
  });

  it('is pristine for a deep copy of the seed with every object key reordered', () => {
    const reordered = reorderKeys(clone()) as Organism;
    expect(isPristineWorkspace(0, [reordered])).toBe(true);
  });

  it('is not pristine with one battle present, even with the seed alone in the library', () => {
    expect(isPristineWorkspace(1, [CONWAYS_CLASSIC])).toBe(false);
  });

  it('is not pristine with a second organism present', () => {
    const second: Organism = { ...clone(), id: 'second', name: 'Second' };
    expect(isPristineWorkspace(0, [CONWAYS_CLASSIC, second])).toBe(false);
  });

  it('is not pristine with zero organisms — "fresh" is not "pristine" (FR-8.4 requires the seed present and unmodified)', () => {
    expect(isPristineWorkspace(0, [])).toBe(false);
  });

  it('is not pristine when the name is edited', () => {
    const edited = clone();
    edited.name = 'Edited Name';
    expect(isPristineWorkspace(0, [edited])).toBe(false);
  });

  it('is not pristine when colorToken is edited', () => {
    const edited = clone();
    edited.colorToken = 'crimson-red';
    expect(isPristineWorkspace(0, [edited])).toBe(false);
  });

  it('is not pristine when dominance is edited', () => {
    const edited = clone();
    edited.dominance = 51;
    expect(isPristineWorkspace(0, [edited])).toBe(false);
  });

  it('is not pristine when agingEnabled is edited', () => {
    const edited = clone();
    edited.agingEnabled = true;
    expect(isPristineWorkspace(0, [edited])).toBe(false);
  });

  it("is not pristine when one rule's payload summary is edited", () => {
    const edited = clone();
    edited.survivalRules[0].payload.summary = 'Edited summary';
    expect(isPristineWorkspace(0, [edited])).toBe(false);
  });

  it("is not pristine when a condition's pattern is edited", () => {
    const edited = clone();
    const condition = edited.survivalRules[0].conditions[1];
    if (condition.property !== 'neighborCount') throw new Error('fixture drifted');
    condition.pattern = 4;
    expect(isPristineWorkspace(0, [edited])).toBe(false);
  });

  it('is not pristine when rule order is swapped', () => {
    const edited = clone();
    edited.survivalRules = [edited.survivalRules[1], edited.survivalRules[0]];
    expect(isPristineWorkspace(0, [edited])).toBe(false);
  });

  it('is not pristine for a same-id organism carrying an extra rule', () => {
    const edited = clone();
    edited.survivalRules = [...edited.survivalRules, { ...clone().survivalRules[0], id: 'extra' }];
    expect(isPristineWorkspace(0, [edited])).toBe(false);
  });

  // Story 7.2 FD6: a workspace description is user content the destructive replace would destroy.
  it('is not pristine when the workspace carries a description, even with the seed alone', () => {
    expect(isPristineWorkspace(0, [CONWAYS_CLASSIC], 'My lab notes')).toBe(false);
  });

  it('stays pristine for an empty or whitespace-only workspace description (absent ≡ none)', () => {
    expect(isPristineWorkspace(0, [CONWAYS_CLASSIC], '')).toBe(true);
    expect(isPristineWorkspace(0, [CONWAYS_CLASSIC], '   ')).toBe(true);
  });

  it("is not pristine when the seed organism's description was edited", () => {
    expect(isPristineWorkspace(0, [{ ...clone(), description: 'edited' }])).toBe(false);
  });

  // Story 7.3 ruling D4: stores seeded before D1 hold the stock Conway without a description.
  describe('pre-D1 stock shape (no description key)', () => {
    function withoutDescription(): Organism {
      const stock = clone();
      delete stock.description;
      return stock;
    }

    it('is pristine for the current constant', () => {
      expect(isPristineWorkspace(0, [CONWAYS_CLASSIC])).toBe(true);
    });

    it('is pristine for the stock organism minus its description', () => {
      expect(isPristineWorkspace(0, [withoutDescription()])).toBe(true);
    });

    it('is not pristine when the description was edited', () => {
      expect(isPristineWorkspace(0, [{ ...clone(), description: 'edited' }])).toBe(false);
    });

    it('is not pristine when description-less but otherwise edited', () => {
      const edited = withoutDescription();
      edited.dominance = 51;
      expect(isPristineWorkspace(0, [edited])).toBe(false);
    });
  });
});
