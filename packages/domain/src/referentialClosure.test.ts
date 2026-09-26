import { describe, expect, it } from 'vitest';
import { BattleSchema, type Battle } from './battleSchema';
import { organismClosure } from './organismClosure';
import { ORGANISM_SCHEMA_VERSION, OrganismSchema, type Organism } from './organismSchema';
import { findDanglingReferences } from './referentialClosure';
import type { SurvivalRule } from './survivalRuleSchema';
import { WorkspaceExportSchema, type WorkspaceExport } from './workspaceExportSchema';
import { toEnvelope } from './workspaceExportProjection';

// ⚠️ Local literals only — `@gol/test-utils` depends on `@gol/domain`, so importing it here would
// close a package cycle (the same note `organismClosure.test.ts` carries).

const PRESET = { cols: 50, rows: 30 } as const;
const BATTLE_ID = '6f3c2f5c-2f4a-4a2f-8f5d-7b1e9c3a1d20';
const OTHER_BATTLE_ID = '11111111-1111-4111-8111-111111111111';

/** One rule per entry in `targetsPerRule`, each naming its targets through `organismType`. */
function organism(id: string, targetsPerRule: readonly (readonly string[])[] = []): Organism {
  const survivalRules: SurvivalRule[] = targetsPerRule.map((targetIds, i) => ({
    id: `${id}-r${i}`,
    contentHash: `content-${id}-${i}`,
    conditions: [
      { property: 'cellState', operator: 'eq', pattern: 'alive' },
      ...targetIds.map((pattern) => ({
        property: 'organismType' as const,
        operator: 'eq' as const,
        pattern,
      })),
    ],
    payload: { summary: `rule ${id}-${i}`, action: 'survive' },
  }));
  return OrganismSchema.parse({
    schemaVersion: ORGANISM_SCHEMA_VERSION,
    id,
    name: id,
    colorToken: 'azure',
    dominance: 50,
    agingEnabled: false,
    survivalRules,
  });
}

type EnvelopeBattle = WorkspaceExport['battles'][number];

function battle(id: string, organismIds: readonly string[]): EnvelopeBattle {
  return {
    id,
    name: id,
    gridDimensions: PRESET,
    cells: organismIds.map((organismId, x) => ({ x, y: 0, organismId })),
    createdAt: new Date('2025-12-01T00:00:00.000Z'),
    updatedAt: new Date('2025-12-02T00:00:00.000Z'),
  };
}

describe('findDanglingReferences (AC3)', () => {
  it('returns [] when every cell and every rule target resolves inside the envelope', () => {
    const envelope = {
      organisms: [organism('a', [['b']]), organism('b')],
      battles: [battle(BATTLE_ID, ['a'])],
    };
    expect(findDanglingReferences(envelope)).toEqual([]);
  });

  it('reports a cell whose organismId is absent from organisms[], attributed to its battle', () => {
    const envelope = { organisms: [organism('a')], battles: [battle(BATTLE_ID, ['a', 'ghost'])] };
    expect(findDanglingReferences(envelope)).toEqual([
      { kind: 'cell', id: 'ghost', referencedBy: BATTLE_ID },
    ]);
  });

  it('reports a rule target absent from organisms[] on an organism that NO battle places', () => {
    const envelope = {
      organisms: [organism('a'), organism('unplaced', [['ghost']])],
      battles: [battle(BATTLE_ID, ['a'])],
    };
    expect(findDanglingReferences(envelope)).toEqual([
      { kind: 'rule-target', id: 'ghost', referencedBy: 'unplaced' },
    ]);
  });

  it('does not report a self-reference', () => {
    const envelope = { organisms: [organism('a', [['a']])], battles: [] };
    expect(findDanglingReferences(envelope)).toEqual([]);
  });

  it('reports exactly the missing link of a chain A→B→C with C absent', () => {
    const envelope = {
      organisms: [organism('a', [['b']]), organism('b', [['c']])],
      battles: [battle(BATTLE_ID, ['a'])],
    };
    expect(findDanglingReferences(envelope)).toEqual([
      { kind: 'rule-target', id: 'c', referencedBy: 'b' },
    ]);
  });

  it('reports the same missing id once per battle, however many of its cells name it', () => {
    const envelope = {
      organisms: [],
      battles: [battle(BATTLE_ID, ['ghost', 'ghost', 'ghost']), battle(OTHER_BATTLE_ID, ['ghost'])],
    };
    expect(findDanglingReferences(envelope)).toEqual([
      { kind: 'cell', id: 'ghost', referencedBy: BATTLE_ID },
      { kind: 'cell', id: 'ghost', referencedBy: OTHER_BATTLE_ID },
    ]);
  });

  it('reports a missing target once per organism, however many of its rules name it', () => {
    // Pins the "each (kind, id, referencedBy) at most once" contract on its rule-target half:
    // the module has no per-organism set of its own — it leans on `ruleTargetIds`' cross-rule
    // de-duplication, which this test keeps honest.
    const envelope = {
      organisms: [organism('a', [['ghost'], ['ghost']])],
      battles: [],
    };
    expect(findDanglingReferences(envelope)).toEqual([
      { kind: 'rule-target', id: 'ghost', referencedBy: 'a' },
    ]);
  });

  it('gives Conway’s Classic no exemption — a rule targeting it without carrying it is dangling', () => {
    const envelope = { organisms: [organism('a', [['conways-classic']])], battles: [] };
    expect(findDanglingReferences(envelope)).toEqual([
      { kind: 'rule-target', id: 'conways-classic', referencedBy: 'a' },
    ]);
  });

  it('accepts what export writes: toEnvelope over a battle and its organismClosure returns []', () => {
    const a = organism('a', [['b']]);
    const b = organism('b', [['c']]);
    const c = organism('c');
    const unrelated = organism('unrelated', [['elsewhere']]);
    const gridState = Array.from({ length: PRESET.rows }, () =>
      Array.from({ length: PRESET.cols }, () => 0),
    );
    gridState[4][7] = 1;
    const placed: Battle = BattleSchema.parse({
      id: BATTLE_ID,
      name: 'export fixture',
      organismIds: ['a'],
      gridSize: PRESET,
      gridState,
      createdAt: '2025-12-01T00:00:00.000Z',
      updatedAt: '2025-12-02T00:00:00.000Z',
    });

    const closure = organismClosure(placed.organismIds, [a, b, c, unrelated]);
    const wire = toEnvelope('battle', [placed], closure, {
      appVersion: 'test',
      exportedAt: new Date('2026-01-01T00:00:00.000Z'),
    });
    const envelope = WorkspaceExportSchema.parse(JSON.parse(JSON.stringify(wire)) as unknown);

    expect(findDanglingReferences(envelope)).toEqual([]);
  });
});
