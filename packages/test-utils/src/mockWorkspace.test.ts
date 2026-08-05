import { describe, expect, it } from 'vitest';
import { BattleSchema, CONWAYS_CLASSIC, CONWAYS_CLASSIC_ID, OrganismSchema } from '@gol/domain';
import {
  createMockBattles,
  createMockOrganisms,
  createMockWorkspace,
  MOCK_BATTLE_IDS,
  MOCK_ORGANISM_IDS,
} from './mockWorkspace';

// The schema's own condition-property / operator universe (survivalRuleSchema.ts). Fixed by the
// spec, not by what this file happens to contain — the COVERED sets below are what get derived
// from the fixtures; this is what "full coverage" is measured against.
const ALL_CONDITION_PROPERTIES = [
  'cellState',
  'organismType',
  'age',
  'neighborCount',
  'occupantNeighborCount',
] as const;
const ALL_OPERATORS = ['eq', 'gt', 'lt', 'gte', 'lte', 'range'] as const;

describe('schema validity', () => {
  it('every mock organism parses under OrganismSchema', () => {
    for (const organism of createMockOrganisms()) {
      expect(() => OrganismSchema.parse(organism)).not.toThrow();
    }
  });

  it('every mock battle parses under BattleSchema (catches the four superRefine traps)', () => {
    for (const battle of createMockBattles()) {
      // createMockBattles() returns the OUTPUT shape (Date fields already hydrated), but
      // BattleSchema's IsoTimestamp expects ISO strings on the way IN — round-trip through JSON
      // first, exactly as the localStorage repositories do, so this exercises the real parse path
      // rather than handing the schema a shape it was never meant to accept.
      const roundTripped = JSON.parse(JSON.stringify(battle)) as unknown;
      expect(() => BattleSchema.parse(roundTripped)).not.toThrow();
    }
  });
});

describe('AR-45 coverage matrix — derived from the fixtures, not hand-listed', () => {
  it('the 3 mock organisms jointly cover all five condition properties', () => {
    const organisms = createMockOrganisms();
    const coveredProperties = new Set(
      organisms.flatMap((o) => o.survivalRules.flatMap((r) => r.conditions.map((c) => c.property))),
    );

    expect(coveredProperties).toEqual(new Set(ALL_CONDITION_PROPERTIES));
  });

  it('the 3 mock organisms jointly cover all six operators, including range', () => {
    const organisms = createMockOrganisms();
    const coveredOperators = new Set(
      organisms.flatMap((o) => o.survivalRules.flatMap((r) => r.conditions.map((c) => c.operator))),
    );

    expect(coveredOperators).toEqual(new Set(ALL_OPERATORS));
  });

  it('at least one organism has agingEnabled: true', () => {
    const organisms = createMockOrganisms();
    expect(organisms.some((o) => o.agingEnabled)).toBe(true);
  });

  it("the three dominance values are distinct from each other and from Conway's 50", () => {
    const dominances = createMockOrganisms().map((o) => o.dominance);
    expect(new Set(dominances).size).toBe(dominances.length);
    expect(dominances).not.toContain(CONWAYS_CLASSIC.dominance);
  });

  it('at least one rule has action: "die"', () => {
    const organisms = createMockOrganisms();
    const dieRuleCount = organisms
      .flatMap((o) => o.survivalRules)
      .filter((r) => r.payload.action === 'die').length;

    expect(dieRuleCount).toBeGreaterThanOrEqual(1);
  });

  it('every organismType condition targets an id present in the canonical set', () => {
    const organisms = createMockOrganisms();
    const canonicalIds = new Set([...organisms.map((o) => o.id), CONWAYS_CLASSIC_ID]);

    const organismTypeTargets = organisms
      .flatMap((o) => o.survivalRules)
      .flatMap((r) => r.conditions)
      .filter((c) => c.property === 'organismType')
      .map((c) => c.pattern);

    // At least one organismType condition must exist (Chaotic Spreader's born rule) — otherwise
    // this assertion would vacuously pass with an empty array.
    expect(organismTypeTargets.length).toBeGreaterThanOrEqual(1);
    for (const target of organismTypeTargets) {
      expect(canonicalIds.has(target)).toBe(true);
    }
  });
});

describe('factories, not frozen singletons', () => {
  it('createMockOrganisms() returns non-identical objects on each call', () => {
    const first = createMockOrganisms();
    const second = createMockOrganisms();

    expect(first).not.toBe(second);
    expect(first[0]).not.toBe(second[0]);
    expect(first).toEqual(second);
  });

  it('createMockBattles() returns non-identical objects on each call', () => {
    const first = createMockBattles();
    const second = createMockBattles();

    expect(first).not.toBe(second);
    expect(first[0]).not.toBe(second[0]);
  });
});

describe('counts and ids', () => {
  it('exactly 3 mock organisms and 2 mock battles', () => {
    const workspace = createMockWorkspace();

    expect(workspace.organisms).toHaveLength(3);
    expect(workspace.battles).toHaveLength(2);
  });

  it('mock organism ids match the exported MOCK_ORGANISM_IDS constant', () => {
    const ids = createMockOrganisms().map((o) => o.id);
    expect(ids).toEqual([
      MOCK_ORGANISM_IDS.aggressiveColonizer,
      MOCK_ORGANISM_IDS.patientDefender,
      MOCK_ORGANISM_IDS.chaoticSpreader,
    ]);
  });

  it('mock battle ids match the exported MOCK_BATTLE_IDS constant', () => {
    const ids = createMockBattles().map((b) => b.id);
    expect(ids).toEqual([MOCK_BATTLE_IDS.battleA, MOCK_BATTLE_IDS.battleB]);
  });
});

describe('the two mock battles', () => {
  it('Battle A is 50x30 and places the three mock organisms', () => {
    const [battleA] = createMockBattles();
    expect(battleA.gridSize).toEqual({ cols: 50, rows: 30 });
    expect(new Set(battleA.organismIds)).toEqual(
      new Set([
        MOCK_ORGANISM_IDS.aggressiveColonizer,
        MOCK_ORGANISM_IDS.patientDefender,
        MOCK_ORGANISM_IDS.chaoticSpreader,
      ]),
    );
  });

  it("Battle B is 100x60 and places the three mock organisms plus Conway's Classic", () => {
    const [, battleB] = createMockBattles();
    expect(battleB.gridSize).toEqual({ cols: 100, rows: 60 });
    expect(new Set(battleB.organismIds)).toEqual(
      new Set([
        MOCK_ORGANISM_IDS.aggressiveColonizer,
        MOCK_ORGANISM_IDS.patientDefender,
        MOCK_ORGANISM_IDS.chaoticSpreader,
        CONWAYS_CLASSIC_ID,
      ]),
    );
  });

  it('the two battles have distinct updatedAt values (sort order is defined)', () => {
    const [battleA, battleB] = createMockBattles();
    expect(battleA.updatedAt.getTime()).not.toBe(battleB.updatedAt.getTime());
  });

  it('timestamps are fixed literals, not the current time', () => {
    const now = Date.now();
    for (const battle of createMockBattles()) {
      expect(battle.createdAt.getTime()).toBeLessThan(now - 1000 * 60 * 60 * 24);
      expect(battle.updatedAt.getTime()).toBeLessThan(now - 1000 * 60 * 60 * 24);
    }
  });
});
