import { describe, expect, it } from 'vitest';
import { organismClosure } from './organismClosure';
import { ORGANISM_SCHEMA_VERSION, OrganismSchema, type Organism } from './organismSchema';
import type { Condition, SurvivalRule } from './survivalRuleSchema';

// ⚠️ Local literals only — `@gol/test-utils` depends on `@gol/domain`, so importing it here would
// close a package cycle (the same note `ruleReferenceIndex.test.ts` and
// `workspaceExportProjection.test.ts` carry).

const targets = (pattern: string): Condition => ({
  property: 'organismType',
  operator: 'eq',
  pattern,
});

/** A rule whose `organismType` conditions name `targetIds`, in that order, plus a realistic non-target condition. */
function rule(id: string, targetIds: readonly string[]): SurvivalRule {
  return {
    id,
    contentHash: `content-${id}`,
    conditions: [
      { property: 'cellState', operator: 'eq', pattern: 'alive' },
      ...targetIds.map(targets),
    ],
    payload: { summary: `rule ${id}`, action: 'survive' },
  };
}

/** `organism(id, targetsPerRule)` — one rule per entry in `targetsPerRule`, no rules if omitted. */
function organism(
  id: string,
  targetsPerRule: readonly (readonly string[])[] = [],
): Pick<Organism, 'id' | 'survivalRules'> {
  return {
    id,
    survivalRules: targetsPerRule.map((targetIds, i) => rule(`${id}-r${i}`, targetIds)),
  };
}

describe('organismClosure (AC1, AC2)', () => {
  it('includes every seed present in the library, even one with no rules', () => {
    const a = organism('a');
    expect(organismClosure(['a'], [a])).toEqual([a]);
  });

  it('pulls in a one-hop rule target', () => {
    const a = organism('a', [['b']]);
    const b = organism('b');
    expect(organismClosure(['a'], [a, b])).toEqual([a, b]);
  });

  it('walks a chained reference A→B→C from seed [A]', () => {
    const a = organism('a', [['b']]);
    const b = organism('b', [['c']]);
    const c = organism('c');
    expect(organismClosure(['a'], [a, b, c]).map((o) => o.id)).toEqual(['a', 'b', 'c']);
  });

  it('terminates on a 2-cycle A↔B, returning both exactly once', () => {
    const a = organism('a', [['b']]);
    const b = organism('b', [['a']]);
    expect(organismClosure(['a'], [a, b]).map((o) => o.id)).toEqual(['a', 'b']);
  });

  it('terminates on a 3-cycle A→B→C→A, returning all three exactly once', () => {
    const a = organism('a', [['b']]);
    const b = organism('b', [['c']]);
    const c = organism('c', [['a']]);
    expect(organismClosure(['a'], [a, b, c]).map((o) => o.id)).toEqual(['a', 'b', 'c']);
  });

  it('does NOT include an organism reached only through the reverse index — X targets A does not pull in X', () => {
    const x = organism('x', [['a']]);
    const a = organism('a');
    expect(organismClosure(['a'], [x, a]).map((o) => o.id)).toEqual(['a']);
  });

  it('excludes an organism nobody reaches, even if it targets a closure member', () => {
    const a = organism('a');
    const unreached = organism('unreached', [['a']]);
    expect(organismClosure(['a'], [a, unreached]).map((o) => o.id)).toEqual(['a']);
  });

  it('skips a dangling seed (absent from the library) without throwing', () => {
    const a = organism('a');
    expect(organismClosure(['missing', 'a'], [a]).map((o) => o.id)).toEqual(['a']);
  });

  it('skips a dangling mid-chain target and still includes what it did reach — A→missing, A→B still included', () => {
    const a = organism('a', [['missing', 'b']]);
    const b = organism('b');
    expect(organismClosure(['a'], [a, b]).map((o) => o.id)).toEqual(['a', 'b']);
  });

  it('returns a repeated seed id once', () => {
    const a = organism('a');
    expect(organismClosure(['a', 'a'], [a]).map((o) => o.id)).toEqual(['a']);
  });

  it('returns an organism reached by two paths once', () => {
    const a = organism('a', [['c']]);
    const b = organism('b', [['c']]);
    const c = organism('c');
    expect(organismClosure(['a', 'b'], [a, b, c]).map((o) => o.id)).toEqual(['a', 'b', 'c']);
  });

  it('returns [] for empty seeds', () => {
    const a = organism('a');
    expect(organismClosure([], [a])).toEqual([]);
  });

  it('returns [] for an empty library', () => {
    expect(organismClosure(['a'], [])).toEqual([]);
  });

  it('preserves library input order regardless of seed or rule-target order', () => {
    const a = organism('a', [['c']]);
    const b = organism('b', [['a']]);
    const c = organism('c');
    // Library order is c, a, b; seeds given in reverse of that.
    expect(organismClosure(['b', 'a'], [c, a, b]).map((o) => o.id)).toEqual(['c', 'a', 'b']);
  });

  it('returns the library’s own records — same references — in a fresh array, never the library array itself', () => {
    const a = organism('a');
    const b = organism('b');
    const library = [a, b];

    const result = organismClosure(['a', 'b'], library);

    expect(result).not.toBe(library);
    expect(result[0]).toBe(a);
    expect(result[1]).toBe(b);
  });

  it('does not mutate the input array or its records', () => {
    const a = organism('a', [['b']]);
    const b = organism('b');
    const library = Object.freeze([a, b]);

    expect(() => organismClosure(['a'], library)).not.toThrow();
    expect(library).toEqual([a, b]);
  });

  it('accepts a fixture that has been through OrganismSchema.parse — the constraint is structural, not literal-only', () => {
    const parsed: Organism = OrganismSchema.parse({
      schemaVersion: ORGANISM_SCHEMA_VERSION,
      id: 'parsed-organism',
      name: 'Parsed Organism',
      colorToken: 'azure',
      dominance: 50,
      agingEnabled: false,
      survivalRules: [rule('parsed-organism-r0', ['target'])],
    });
    const target = organism('target');

    expect(organismClosure(['parsed-organism'], [parsed, target]).map((o) => o.id)).toEqual([
      'parsed-organism',
      'target',
    ]);
  });
});
