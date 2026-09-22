import { describe, expect, it } from 'vitest';
import {
  MAX_ORGANISM_NAME_LENGTH,
  ORGANISM_SCHEMA_VERSION,
  OrganismSchema,
  type Organism,
} from '@gol/domain';
import { CONWAYS_CLASSIC, createMockOrganisms } from '@gol/test-utils';
import { CLONE_NAME_SUFFIX, cloneOrganismName, cloneOrganismRecord } from './organismClone';

// Deterministic id counter, never `crypto` — the `organismRecord.test.ts` idiom.
function counter(prefix: string) {
  let n = 0;
  return () => `${prefix}${++n}`;
}

describe('cloneOrganismName', () => {
  it('appends the suffix to a short name', () => {
    expect(cloneOrganismName('Glider')).toBe('Glider (Copy)');
  });

  it('a 50-character name yields a 50-character result ending in " (Copy)" that OrganismSchema accepts', () => {
    const name = 'x'.repeat(50);
    const result = cloneOrganismName(name);
    expect(result).toHaveLength(50);
    expect(result.endsWith(CLONE_NAME_SUFFIX)).toBe(true);
    expect(() =>
      OrganismSchema.parse({
        schemaVersion: ORGANISM_SCHEMA_VERSION,
        id: 'id',
        name: result,
        colorToken: 'azure',
        dominance: 5,
        agingEnabled: false,
        survivalRules: [],
      }),
    ).not.toThrow();
  });

  it('truncates the head at 43 characters for a 44-character name (43 + " (Copy)" = 50)', () => {
    const name = 'x'.repeat(44);
    const result = cloneOrganismName(name);
    expect(result).toBe('x'.repeat(43) + CLONE_NAME_SUFFIX);
    expect(result).toHaveLength(50);
  });

  it('a blank name yields "(Copy)" with no leading space', () => {
    expect(cloneOrganismName('')).toBe('(Copy)');
  });

  it('a whitespace-only name yields "(Copy)" with no leading space', () => {
    expect(cloneOrganismName('   ')).toBe('(Copy)');
  });

  it('a name ending in a space does not yield a double space', () => {
    expect(cloneOrganismName('Bob ')).toBe('Bob (Copy)');
  });

  it('cloning a clone yields "X (Copy) (Copy)"', () => {
    expect(cloneOrganismName('Glider (Copy)')).toBe('Glider (Copy) (Copy)');
  });

  it('respects an injected maxLength', () => {
    expect(cloneOrganismName('Glider', 10)).toBe('Gli (Copy)');
  });
});

describe('cloneOrganismRecord', () => {
  it('every scalar equals the source except id and name; schemaVersion is ORGANISM_SCHEMA_VERSION', () => {
    const nextId = counter('rule-');
    const clone = cloneOrganismRecord(CONWAYS_CLASSIC, 'clone-1', nextId);
    expect(clone.id).toBe('clone-1');
    expect(clone.name).toBe(cloneOrganismName(CONWAYS_CLASSIC.name));
    expect(clone.schemaVersion).toBe(ORGANISM_SCHEMA_VERSION);
    expect(clone.colorToken).toBe(CONWAYS_CLASSIC.colorToken);
    expect(clone.dominance).toBe(CONWAYS_CLASSIC.dominance);
    expect(clone.agingEnabled).toBe(CONWAYS_CLASSIC.agingEnabled);
  });

  it('rules are in order with the source contentHash/payload/conditions, and every rule id is fresh', () => {
    let calls = 0;
    const nextId = () => `rule-${++calls}`;
    const clone = cloneOrganismRecord(CONWAYS_CLASSIC, 'clone-1', nextId);

    expect(clone.survivalRules).toHaveLength(CONWAYS_CLASSIC.survivalRules.length);
    clone.survivalRules.forEach((rule, i) => {
      const source = CONWAYS_CLASSIC.survivalRules[i];
      expect(rule.contentHash).toBe(source.contentHash);
      expect(rule.payload).toEqual(source.payload);
      expect(rule.conditions).toEqual(source.conditions);
      expect(rule.id).not.toBe(source.id);
    });

    expect(calls).toBe(CONWAYS_CLASSIC.survivalRules.length);

    const sourceIds = new Set(CONWAYS_CLASSIC.survivalRules.map((r) => r.id));
    const cloneIds = clone.survivalRules.map((r) => r.id);
    // disjoint from the source's ids
    cloneIds.forEach((id) => expect(sourceIds.has(id)).toBe(false));
    // no internal duplicate
    expect(new Set(cloneIds).size).toBe(cloneIds.length);
  });

  it('is non-aliasing: rule objects and conditions arrays are not shared by reference with the source', () => {
    const clone = cloneOrganismRecord(CONWAYS_CLASSIC, 'clone-1', counter('rule-'));
    expect(clone.survivalRules[0]).not.toBe(CONWAYS_CLASSIC.survivalRules[0]);
    expect(clone.survivalRules[0].conditions).not.toBe(CONWAYS_CLASSIC.survivalRules[0].conditions);
    // Mutating the clone's conditions array does not throw against a deepFrozen source, and does
    // not change the source.
    expect(() =>
      clone.survivalRules[0].conditions.push(clone.survivalRules[0].conditions[0]),
    ).not.toThrow();
    expect(CONWAYS_CLASSIC.survivalRules[0].conditions).not.toEqual(
      clone.survivalRules[0].conditions,
    );
  });

  it('an organismType condition pattern still names the SOURCE target id, unchanged', () => {
    const [spreader] = createMockOrganisms().filter((o) =>
      o.survivalRules.some((r) => r.conditions.some((c) => c.property === 'organismType')),
    );
    const clone = cloneOrganismRecord(spreader, 'clone-1', counter('rule-'));
    const sourceCondition = spreader.survivalRules
      .flatMap((r) => r.conditions)
      .find((c) => c.property === 'organismType');
    const cloneCondition = clone.survivalRules
      .flatMap((r) => r.conditions)
      .find((c) => c.property === 'organismType');
    expect(sourceCondition).toBeDefined();
    expect(cloneCondition).toEqual(sourceCondition);
  });

  it('a zero-rule organism clones to a zero-rule clone', () => {
    const zeroRule: Organism = { ...CONWAYS_CLASSIC, survivalRules: [] };
    const clone = cloneOrganismRecord(zeroRule, 'clone-1', counter('rule-'));
    expect(clone.survivalRules).toEqual([]);
  });

  it('a source with a 50-character name round-trips through OrganismSchema.parse without throwing', () => {
    const longName: Organism = { ...CONWAYS_CLASSIC, name: 'x'.repeat(50) };
    expect(() => cloneOrganismRecord(longName, 'clone-1', counter('rule-'))).not.toThrow();
  });

  it('the same over every createMockOrganisms() record', () => {
    for (const source of createMockOrganisms()) {
      let calls = 0;
      const nextId = () => `id-${++calls}`;
      const clone = cloneOrganismRecord(source, `clone-of-${source.id}`, nextId);
      expect(clone.id).toBe(`clone-of-${source.id}`);
      expect(clone.name).toBe(cloneOrganismName(source.name));
      expect(clone.colorToken).toBe(source.colorToken);
      expect(clone.dominance).toBe(source.dominance);
      expect(clone.agingEnabled).toBe(source.agingEnabled);
      clone.survivalRules.forEach((rule, i) => {
        const src = source.survivalRules[i];
        expect(rule.contentHash).toBe(src.contentHash);
        expect(rule.payload).toEqual(src.payload);
        expect(rule.conditions).toEqual(src.conditions);
        expect(rule.id).not.toBe(src.id);
      });
      expect(calls).toBe(source.survivalRules.length);
    }
  });
});
