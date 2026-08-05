import { describe, expect, it } from 'vitest';
import { CONWAYS_CLASSIC, CONWAYS_CLASSIC_ID, DEFAULT_WORKSPACE } from './defaultWorkspace';
import { OrganismSchema } from './organismSchema';

describe('CONWAYS_CLASSIC', () => {
  it('parses as a valid Organism (FR-1.5)', () => {
    // Catches a typo'd operand or an out-of-range field that the type annotation alone cannot.
    expect(OrganismSchema.safeParse(CONWAYS_CLASSIC).success).toBe(true);
  });

  it('carries the FR-1.5 documented field values', () => {
    expect(CONWAYS_CLASSIC.id).toBe(CONWAYS_CLASSIC_ID);
    expect(CONWAYS_CLASSIC.id).toBe('conways-classic');
    expect(CONWAYS_CLASSIC.name).toBe("Conway's Classic");
    expect(CONWAYS_CLASSIC.colorToken).toBe('sky-blue');
    expect(CONWAYS_CLASSIC.dominance).toBe(50);
    expect(CONWAYS_CLASSIC.agingEnabled).toBe(false);
    expect(CONWAYS_CLASSIC.schemaVersion).toBe(1);
  });

  it('encodes born-on-empty-with-3-neighbors and survive-alive-with-[2,3] (RFC-004 §2.4)', () => {
    const [bornRule, surviveRule] = CONWAYS_CLASSIC.survivalRules;

    expect(bornRule.payload.action).toBe('born');
    expect(bornRule.conditions).toEqual([
      { property: 'cellState', operator: 'eq', pattern: 'empty' },
      { property: 'neighborCount', operator: 'eq', pattern: 3 },
    ]);

    expect(surviveRule.payload.action).toBe('survive');
    expect(surviveRule.conditions).toEqual([
      { property: 'cellState', operator: 'eq', pattern: 'alive' },
      { property: 'neighborCount', operator: 'range', pattern: [2, 3] },
    ]);
  });

  it('carries no Die rule — death resolves implicitly at cycle-end (M10)', () => {
    // An explicit Die rule looks equivalent and is not: it removes the cell before Phase-2
    // neighbour counting, breaking every Conway golden-pattern test in Epic 3.
    expect(CONWAYS_CLASSIC.survivalRules.some((r) => r.payload.action === 'die')).toBe(false);
    expect(CONWAYS_CLASSIC.survivalRules).toHaveLength(2);
  });

  // Identity pinning (not coverage padding): these values are written into every user's store
  // and are the FR-8.4 "unmodified default" baseline. An accidental regeneration must fail a
  // test, not ship silently.
  it('pins the frozen rule ids and content hashes', () => {
    expect(CONWAYS_CLASSIC_ID).toBe('conways-classic');
    const [bornRule, surviveRule] = CONWAYS_CLASSIC.survivalRules;
    expect(bornRule.id).toBe('1fcc1002-5f8a-4cf0-9fab-2c0c20492d51');
    expect(bornRule.contentHash).toBe(
      'd9b3d443a42e63c10526023503302a87b0676110bf7e5c146625a5237026d93d',
    );
    expect(surviveRule.id).toBe('27855506-28f8-46c2-a85b-1464557a121d');
    expect(surviveRule.contentHash).toBe(
      '1a7f0de8227e3031c7000336705781a2df139b445be381f351a4df1cb67c0918',
    );
  });

  it('is deep-frozen — a mutation attempt throws or is a no-op', () => {
    // ESM modules run in strict mode already, so an assignment to a frozen property throws
    // TypeError rather than silently no-op-ing — that's what proves the freeze, not the no-op.
    expect(() => {
      // @ts-expect-error — intentional mutation attempt to prove the freeze
      CONWAYS_CLASSIC.survivalRules.push({});
    }).toThrow();
    expect(() => {
      // No @ts-expect-error needed: 'die' is a valid SurvivalPayload.action value at the type
      // level — it's the runtime freeze this assertion targets, not the compiler.
      CONWAYS_CLASSIC.survivalRules[0].payload.action = 'die';
    }).toThrow();
    expect(() => {
      CONWAYS_CLASSIC.survivalRules[0].conditions[0].pattern = 'occupied';
    }).toThrow();
  });
});

describe('DEFAULT_WORKSPACE', () => {
  it('seeds zero battles (M1) — the empty Gallery reachable state is the spec', () => {
    expect(DEFAULT_WORKSPACE.battles).toEqual([]);
  });

  it("seeds exactly Conway's Classic as the sole organism", () => {
    expect(DEFAULT_WORKSPACE.organisms).toEqual([CONWAYS_CLASSIC]);
  });
});
