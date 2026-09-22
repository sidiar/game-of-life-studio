import { describe, expect, it } from 'vitest';
import {
  MAX_ORGANISM_NAME_LENGTH,
  ORGANISM_SCHEMA_VERSION,
  OrganismSchema,
  type Organism,
} from '@gol/domain';
import { CONWAYS_CLASSIC, createMockOrganisms } from '@gol/test-utils';
import { CLONE_NAME_SUFFIX, cloneOrganismName, cloneOrganismRecord } from './organismClone';

/** True when any UTF-16 code unit is a surrogate without its partner — what a cut landing inside
 * a surrogate pair leaves behind. Spelled out because `String#toWellFormed` is ES2024 and
 * `tsconfig.base.json` is `lib: ["ES2022"]`. */
function hasLoneSurrogate(value: string): boolean {
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(i + 1);
      if (Number.isNaN(next) || next < 0xdc00 || next > 0xdfff) return true;
      i += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      return true;
    }
  }
  return false;
}

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

  // Review 2026-09-22. `maxLength - CLONE_NAME_SUFFIX.length` went negative and `String#slice`
  // reads a negative end as an offset from the END of the string, so a SMALLER cap produced a
  // LONGER name. Unreachable from the two shipped call sites, which take the default, but the
  // parameter is exported and the docblock advertises it as part of the contract.
  it.each([0, 1, 5, CLONE_NAME_SUFFIX.length])(
    'a maxLength below the suffix length (%i) yields the bare suffix, never a longer name',
    (maxLength) => {
      expect(cloneOrganismName('HelloWorld', maxLength)).toBe('(Copy)');
    },
  );

  // Review 2026-09-22. `slice` counts UTF-16 code units, so the cut could land BETWEEN a surrogate
  // pair and persist a lone surrogate — U+FFFD on every card and in both `aria-label`s, an
  // organism unsearchable by its own visible text, and a `name` that is not well-formed UTF-8 for
  // the Epic 5 export envelope. Zod's `.max()` counts code units too and does not catch it.
  it('never splits a surrogate pair: a 25-emoji name (50 code units) truncates to whole emoji', () => {
    const result = cloneOrganismName('👾'.repeat(25));
    expect(result.endsWith(CLONE_NAME_SUFFIX)).toBe(true);
    expect(result.length).toBeLessThanOrEqual(MAX_ORGANISM_NAME_LENGTH);
    // No unpaired surrogate anywhere. (`String#toWellFormed` is ES2024; this repo's lib is
    // ES2022, so the check is spelled out.)
    expect(hasLoneSurrogate(result)).toBe(false);
    expect([...result].every((c) => c === '👾' || ' (Copy)'.includes(c))).toBe(true);
  });

  it('a name whose cut lands mid-pair loses the whole code point, not half of it', () => {
    // 43 'x' + an emoji: the cut at 43 is already a boundary, so the emoji is simply dropped.
    const result = cloneOrganismName('x'.repeat(43) + '👾');
    expect(result).toBe('x'.repeat(43) + CLONE_NAME_SUFFIX);
    // 42 'x' + emoji + filler: the cut at 43 falls INSIDE the pair and must back off to 42.
    const midPair = cloneOrganismName('x'.repeat(42) + '👾' + 'y'.repeat(10));
    expect(midPair).toBe('x'.repeat(42) + CLONE_NAME_SUFFIX);
    expect(hasLoneSurrogate(midPair)).toBe(false);
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
      // AC4's second half, which only the CONWAYS_CLASSIC case pinned (review 2026-09-22): the
      // clone's rule ids are disjoint from the source's AND hold no internal duplicate.
      const cloneIds = clone.survivalRules.map((r) => r.id);
      const sourceIds = source.survivalRules.map((r) => r.id);
      expect(new Set(cloneIds).size).toBe(cloneIds.length);
      expect(cloneIds.filter((id) => sourceIds.includes(id))).toEqual([]);
    }
  });
});
