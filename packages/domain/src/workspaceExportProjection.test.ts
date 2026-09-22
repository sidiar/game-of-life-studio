import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { pruneAndRemapBattleGrid } from './battleProjection';
import { BattleSchema, type Battle } from './battleSchema';
import { CONWAYS_CLASSIC } from './defaultWorkspace';
import type { EditableGridPreset, Organism } from './organismSchema';
import { CURRENT_FORMAT_VERSION } from './settingsSchema';
import {
  fromBattleExport,
  fromEnvelope,
  toBattleExport,
  toEnvelope,
} from './workspaceExportProjection';
import { WorkspaceExportSchema } from './workspaceExportSchema';

// ⚠️ The dense grids below are built locally rather than with `@gol/test-utils`' `emptyGrid`, which
// is the repo's rule everywhere else. `@gol/test-utils` imports `@gol/domain` (and
// `@gol/persistence`), so a dependency from here would close a package cycle — the fixtures are
// available to every OTHER package's tests and deliberately not to this one's.
function denseGrid(cols: number, rows: number): number[][] {
  return Array.from({ length: rows }, () => Array.from({ length: cols }, () => 0));
}

const PRESETS = [
  { cols: 50, rows: 30 },
  { cols: 100, rows: 60 },
] as const satisfies readonly EditableGridPreset[];

const BATTLE_ID = '6f3c2f5c-2f4a-4a2f-8f5d-7b1e9c3a1d20';
const CREATED_AT = '2026-01-01T00:00:00.000Z';
const UPDATED_AT = '2026-02-03T04:05:06.000Z';

/** Builds a battle through `BattleSchema.parse`, so no fixture here can be invalid unnoticed. */
function battle(
  gridSize: EditableGridPreset,
  organismIds: readonly string[],
  gridState: readonly (readonly number[])[],
): Battle {
  return BattleSchema.parse({
    id: BATTLE_ID,
    name: 'Fixture',
    organismIds,
    gridSize,
    gridState,
    createdAt: CREATED_AT,
    updatedAt: UPDATED_AT,
  });
}

describe('toBattleExport (AC3)', () => {
  it('emits one cell per non-zero value, with x = column and y = row', () => {
    const grid = denseGrid(50, 30);
    grid[2][3] = 1;
    grid[7][11] = 1;
    const b = battle(PRESETS[0], ['alpha'], grid);

    const exported = toBattleExport(b);

    expect(exported.cells).toEqual([
      { x: 3, y: 2, organismId: 'alpha' },
      { x: 11, y: 7, organismId: 'alpha' },
    ]);
    expect(exported.gridDimensions).toEqual({ cols: 50, rows: 30 });
    expect(exported.gridDimensions).not.toBe(b.gridSize);
  });

  it('emits ISO strings for both timestamps — the wire shape is JSON-ready (FD4)', () => {
    const exported = toBattleExport(battle(PRESETS[0], [], denseGrid(50, 30)));

    expect(exported.createdAt).toBe(CREATED_AT);
    expect(exported.updatedAt).toBe(UPDATED_AT);
  });

  it('exports an empty grid as cells: [] and rebuilds it with an empty roster', () => {
    const b = battle(PRESETS[1], [], denseGrid(100, 60));

    const exported = toBattleExport(b);
    const back = fromBattleExport(parseWireBattle(exported));

    expect(exported.cells).toEqual([]);
    expect(back.organismIds).toEqual([]);
    expect(back.gridState.length).toBe(60);
    expect(back.gridState[0].length).toBe(100);
    expect(back.gridState.flat().every((v) => v === 0)).toBe(true);
  });

  // ⚠️ THE CASE A SINGLE ROW-MAJOR PASS GETS WRONG (FD3), named rather than left to the generator.
  // Roster order is editor order, so a roster whose SECOND entry happens to sit higher on the grid
  // is the normal case. Emitting row-major would put 'alpha' first, `fromBattleExport` would give
  // it ref 1, and the battle would come back with a permuted roster and a remapped grid: the same
  // picture, a different record.
  it('orders cells by ascending ref, not row-major, so a reversed roster still round-trips (AC3/AC4)', () => {
    const grid = denseGrid(50, 30);
    grid[0][0] = 2; // 'alpha' — first in row-major order, SECOND in the roster.
    grid[0][1] = 2;
    grid[5][0] = 1; // 'beta' — later on the grid, FIRST in the roster.
    const b = battle(PRESETS[0], ['beta', 'alpha'], grid);

    const exported = toBattleExport(b);

    expect(exported.cells).toEqual([
      { x: 0, y: 5, organismId: 'beta' },
      { x: 0, y: 0, organismId: 'alpha' },
      { x: 1, y: 0, organismId: 'alpha' },
    ]);
    expect(fromBattleExport(parseWireBattle(exported))).toEqual(b);
  });
});

describe('fromBattleExport (AC3)', () => {
  it('assigns refs by first appearance in cells — a hand-written interleaved file still imports', () => {
    const back = fromBattleExport(
      parseWireBattle({
        id: BATTLE_ID,
        name: 'Interleaved',
        gridDimensions: { cols: 50, rows: 30 },
        cells: [
          { x: 0, y: 0, organismId: 'first' },
          { x: 1, y: 0, organismId: 'second' },
          { x: 2, y: 0, organismId: 'first' },
        ],
        createdAt: CREATED_AT,
        updatedAt: UPDATED_AT,
      }),
    );

    expect(back.organismIds).toEqual(['first', 'second']);
    expect(back.gridState[0].slice(0, 3)).toEqual([1, 2, 1]);
  });

  it('allocates a NEW row array per row — writing one cell never writes a column', () => {
    const back = fromBattleExport(
      parseWireBattle({
        id: BATTLE_ID,
        name: 'Aliasing probe',
        gridDimensions: { cols: 50, rows: 30 },
        cells: [{ x: 4, y: 4, organismId: 'alpha' }],
        createdAt: CREATED_AT,
        updatedAt: UPDATED_AT,
      }),
    );

    expect(back.gridState[0]).not.toBe(back.gridState[1]);
    expect(back.gridState.filter((row) => row[4] !== 0)).toHaveLength(1);
  });

  it('hydrates timestamps as Dates and copies gridDimensions rather than aliasing it', () => {
    const wire = {
      id: BATTLE_ID,
      name: 'Fixture',
      gridDimensions: { cols: 50, rows: 30 },
      cells: [],
      createdAt: CREATED_AT,
      updatedAt: UPDATED_AT,
    };
    const parsed = parseWireBattle(wire);

    const back = fromBattleExport(parsed);

    expect(back.createdAt).toBeInstanceOf(Date);
    expect(back.createdAt.toISOString()).toBe(CREATED_AT);
    expect(back.gridSize).not.toBe(parsed.gridDimensions);
    expect(back.gridSize).toEqual({ cols: 50, rows: 30 });
  });
});

describe('round-trip identity (AC4, AR-41 / AR-44)', () => {
  // Generated battles are canonicalized through `pruneAndRemapBattleGrid` and then PARSED, so the
  // property is about the conversion rather than about BattleSchema rejecting random input.
  const arbBattle = fc
    .tuple(fc.constantFrom(...PRESETS), fc.integer({ min: 0, max: 6 }))
    .chain(([preset, rosterSize]) =>
      fc.record({
        preset: fc.constant(preset),
        rosterSize: fc.constant(rosterSize),
        // Modelled on `packages/simulation/src/grid/grid.test.ts`'s `arbDense`, at the real preset
        // sizes: a generator capped at 12x12 could not produce the roster-order mismatch this
        // property exists for often enough to be meaningful.
        dense: fc.array(
          fc.array(fc.integer({ min: 0, max: rosterSize }), {
            minLength: preset.cols,
            maxLength: preset.cols,
          }),
          { minLength: preset.rows, maxLength: preset.rows },
        ),
      }),
    )
    .map(({ preset, rosterSize, dense }) => {
      const rosterIds = Array.from({ length: rosterSize }, (_, i) => `organism-${i}`);
      const pruned = pruneAndRemapBattleGrid(dense, rosterIds);
      return battle(preset, pruned.organismIds, pruned.gridState);
    });

  // 30s, not Vitest's 5s default: 100 runs over real preset grids (up to 6,000 cells each, each one
  // canonicalized, parsed and compared) legitimately takes seconds, and the default is a hang-guard
  // rather than a budget. A slower CI runner is not a regression — lowering `numRuns` or shrinking
  // the generator to fit the default would silently weaken the property instead.
  it('fromBattleExport(toBattleExport(b)) is the identity on every schema-valid battle', () => {
    fc.assert(
      fc.property(arbBattle, (b) => {
        expect(fromBattleExport(parseWireBattle(toBattleExport(b)))).toEqual(b);
      }),
    );
  }, 30_000);

  it('survives real JSON: toEnvelope -> stringify -> parse -> schema -> fromEnvelope (FD4)', () => {
    const grid = denseGrid(100, 60);
    grid[0][0] = 2;
    grid[59][99] = 1;
    grid[30][30] = 1;
    const battles = [battle(PRESETS[1], ['beta', 'alpha'], grid)];
    // CONWAYS_CLASSIC so a real survivalRules payload — nested conditions, a range pattern —
    // crosses the wire rather than a stub organism with an empty rule list.
    const organisms: Organism[] = [CONWAYS_CLASSIC];

    const wire = toEnvelope('workspace', battles, organisms, {
      appVersion: '1.2.3',
      exportedAt: new Date('2026-03-04T05:06:07.000Z'),
    });
    const parsed = WorkspaceExportSchema.parse(JSON.parse(JSON.stringify(wire)) as unknown);
    const back = fromEnvelope(parsed);

    expect(back.battles).toEqual(battles);
    expect(back.organisms).toEqual(organisms);
    expect(parsed.exportedAt).toBeInstanceOf(Date);
    expect(parsed.exportedAt.toISOString()).toBe('2026-03-04T05:06:07.000Z');
  });
});

describe('toEnvelope (AC1, AC5)', () => {
  it('stamps the schema’s own formatVersion and the injected provenance, and nothing else', () => {
    const wire = toEnvelope('battle', [], [], {
      appVersion: 'test-app',
      exportedAt: new Date('2026-03-04T05:06:07.000Z'),
    });

    expect(wire).toEqual({
      formatVersion: CURRENT_FORMAT_VERSION,
      appVersion: 'test-app',
      exportedAt: '2026-03-04T05:06:07.000Z',
      kind: 'battle',
      organisms: [],
      battles: [],
    });
    expect('settings' in wire).toBe(false);
  });

  it('copies the collections it is handed — the envelope never aliases the caller’s arrays', () => {
    const organisms: Organism[] = [CONWAYS_CLASSIC];
    const wire = toEnvelope('workspace', [], organisms, {
      appVersion: 'test-app',
      exportedAt: new Date(CREATED_AT),
    });

    expect(wire.organisms).not.toBe(organisms);
    expect(wire.organisms).toEqual(organisms);
  });
});

/**
 * Parses a wire battle into the hydrated shape `fromBattleExport` takes. Every fixture goes through
 * the real schema rather than being cast, so a test cannot assert a round trip over a shape the
 * parser would have rejected.
 */
function parseWireBattle(wire: unknown) {
  return WorkspaceExportSchema.parse({
    formatVersion: CURRENT_FORMAT_VERSION,
    appVersion: 'test',
    exportedAt: CREATED_AT,
    kind: 'workspace',
    organisms: [],
    battles: [wire],
  }).battles[0];
}
