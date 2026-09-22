import { describe, expect, it } from 'vitest';
import { CONWAYS_CLASSIC } from './defaultWorkspace';
import { CURRENT_FORMAT_VERSION } from './settingsSchema';
import {
  BattleExportSchema,
  EXPORT_KINDS,
  WorkspaceExportSchema,
  type BattleExportWire,
  type WorkspaceExportWire,
} from './workspaceExportSchema';

// Hand-built literals are the EXCEPTION in this repo's testing rules, allowed here for exactly the
// reason the exception exists: these cases test what the schema REFUSES (and, for AC5, what it
// silently drops), which no fixture derived from a valid battle can produce.

const BATTLE_ID = '6f3c2f5c-2f4a-4a2f-8f5d-7b1e9c3a1d20';

function battleExport(overrides: Partial<BattleExportWire> = {}): BattleExportWire {
  return {
    id: BATTLE_ID,
    name: 'Fixture',
    gridDimensions: { cols: 50, rows: 30 },
    cells: [{ x: 1, y: 2, organismId: CONWAYS_CLASSIC.id }],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z',
    ...overrides,
  };
}

function envelope(overrides: Partial<WorkspaceExportWire> = {}): WorkspaceExportWire {
  return {
    formatVersion: CURRENT_FORMAT_VERSION,
    appVersion: '0.0.0-test',
    exportedAt: '2026-01-03T00:00:00.000Z',
    kind: 'workspace',
    organisms: [CONWAYS_CLASSIC],
    battles: [battleExport()],
    ...overrides,
  };
}

/** Distinct, schema-legal organism ids, one cell each, laid out row-major inside 50x30. */
function cellsForDistinctOrganisms(count: number): BattleExportWire['cells'] {
  return Array.from({ length: count }, (_, i) => ({
    x: i % 50,
    y: Math.floor(i / 50),
    organismId: `organism-${i}`,
  }));
}

describe('WorkspaceExportSchema (AC1)', () => {
  it('accepts the envelope and hydrates exportedAt into a Date', () => {
    const parsed = WorkspaceExportSchema.parse(envelope());

    expect(parsed.exportedAt).toBeInstanceOf(Date);
    expect(parsed.exportedAt.toISOString()).toBe('2026-01-03T00:00:00.000Z');
    expect(parsed.formatVersion).toBe(CURRENT_FORMAT_VERSION);
  });

  it('rejects a formatVersion the literal does not name — a newer file is a parse failure, not a range check (Decision I)', () => {
    const result = WorkspaceExportSchema.safeParse({ ...envelope(), formatVersion: 2 });

    expect(result.success).toBe(false);
    expect(result.error?.issues.some((i) => i.path[0] === 'formatVersion')).toBe(true);
  });

  it('rejects a kind outside the two export kinds', () => {
    const result = WorkspaceExportSchema.safeParse({ ...envelope(), kind: 'organism' });

    expect(result.success).toBe(false);
    expect(result.error?.issues.some((i) => i.path[0] === 'kind')).toBe(true);
  });

  it('names exactly the two RFC-006 kinds, and accepts both', () => {
    expect([...EXPORT_KINDS]).toEqual(['workspace', 'battle']);
    for (const kind of EXPORT_KINDS) {
      expect(WorkspaceExportSchema.safeParse(envelope({ kind })).success).toBe(true);
    }
  });

  it('rejects a malformed exportedAt at its own path — hand-edited files are the stated use case', () => {
    const result = WorkspaceExportSchema.safeParse(envelope({ exportedAt: 'yesterday' }));

    expect(result.success).toBe(false);
    expect(result.error?.issues.some((i) => i.path[0] === 'exportedAt')).toBe(true);
  });

  it('carries appVersion verbatim — provenance, never branched on (Decision I.4)', () => {
    const parsed = WorkspaceExportSchema.parse(envelope({ appVersion: 'anything at all' }));

    expect(parsed.appVersion).toBe('anything at all');
  });
});

describe('collection ids are unique (Review Decision 3)', () => {
  const OTHER_BATTLE_ID = '0c1b7a64-9a4e-4d1b-9f2c-3a5d6e7f8091';

  it('rejects two battles sharing an id, at the battles path', () => {
    const result = WorkspaceExportSchema.safeParse(
      envelope({ battles: [battleExport(), battleExport({ name: 'Same id, other name' })] }),
    );

    expect(result.success).toBe(false);
    expect(result.error?.issues.some((i) => i.path.join('.') === 'battles')).toBe(true);
  });

  it('rejects two organisms sharing an id, at the organisms path', () => {
    const result = WorkspaceExportSchema.safeParse(
      envelope({ organisms: [CONWAYS_CLASSIC, { ...CONWAYS_CLASSIC, name: 'Impostor' }] }),
    );

    expect(result.success).toBe(false);
    expect(result.error?.issues.some((i) => i.path.join('.') === 'organisms')).toBe(true);
  });

  it('accepts distinct ids in both collections', () => {
    const result = WorkspaceExportSchema.safeParse(
      envelope({ battles: [battleExport(), battleExport({ id: OTHER_BATTLE_ID })] }),
    );

    expect(result.success).toBe(true);
  });

  it('does NOT constrain how many battles a kind carries — cardinality is Story 5.4’s, once it mints exportBattle', () => {
    expect(
      WorkspaceExportSchema.safeParse(
        envelope({
          kind: 'battle',
          battles: [battleExport(), battleExport({ id: OTHER_BATTLE_ID })],
        }),
      ).success,
    ).toBe(true);
    expect(WorkspaceExportSchema.safeParse(envelope({ kind: 'battle', battles: [] })).success).toBe(
      true,
    );
  });
});

describe('settings never travel (AC5, AR-12 / Decision F.1)', () => {
  it('has no settings key on the schema, so an envelope carrying one parses with the field STRIPPED', () => {
    const withSettings = {
      ...envelope(),
      settings: { theme: 'biotech-terminal', gridLines: false },
    };

    const parsed = WorkspaceExportSchema.parse(withSettings);

    expect('settings' in parsed).toBe(false);
  });
});

describe('BattleExportSchema (AC2)', () => {
  it('accepts a sparse battle and hydrates both timestamps', () => {
    const parsed = BattleExportSchema.parse(battleExport());

    expect(parsed.createdAt).toBeInstanceOf(Date);
    expect(parsed.updatedAt).toBeInstanceOf(Date);
    expect(parsed.cells).toEqual([{ x: 1, y: 2, organismId: CONWAYS_CLASSIC.id }]);
  });

  it('has no roster field — an envelope that carries organismIds loses it (Decision H.2)', () => {
    const parsed = BattleExportSchema.parse({
      ...battleExport(),
      organismIds: [CONWAYS_CLASSIC.id],
    });

    expect('organismIds' in parsed).toBe(false);
  });

  it('rejects a cell outside gridDimensions, at the cells path (Decision G.2)', () => {
    const tooFarRight = BattleExportSchema.safeParse(
      battleExport({ cells: [{ x: 50, y: 0, organismId: 'a' }] }),
    );
    const tooFarDown = BattleExportSchema.safeParse(
      battleExport({ cells: [{ x: 0, y: 30, organismId: 'a' }] }),
    );

    expect(tooFarRight.success).toBe(false);
    expect(tooFarRight.error?.issues[0]?.path).toEqual(['cells']);
    expect(tooFarDown.success).toBe(false);
    expect(tooFarDown.error?.issues[0]?.path).toEqual(['cells']);
  });

  it('accepts the last in-bounds cell of each preset — the bound is >=, not > (Decision A)', () => {
    expect(
      BattleExportSchema.safeParse(battleExport({ cells: [{ x: 49, y: 29, organismId: 'a' }] }))
        .success,
    ).toBe(true);
    expect(
      BattleExportSchema.safeParse(
        battleExport({
          gridDimensions: { cols: 100, rows: 60 },
          cells: [{ x: 99, y: 59, organismId: 'a' }],
        }),
      ).success,
    ).toBe(true);
  });

  it('rejects a repeated (x,y) — duplicates are corrupt, never last-wins', () => {
    const result = BattleExportSchema.safeParse(
      battleExport({
        cells: [
          { x: 3, y: 4, organismId: 'a' },
          { x: 3, y: 4, organismId: 'b' },
        ],
      }),
    );

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['cells']);
  });

  it('accepts the same organism at two different coordinates', () => {
    const result = BattleExportSchema.safeParse(
      battleExport({
        cells: [
          { x: 3, y: 4, organismId: 'a' },
          { x: 4, y: 4, organismId: 'a' },
        ],
      }),
    );

    expect(result.success).toBe(true);
  });

  it('accepts exactly 255 distinct organisms and rejects 256 — the boundary is > (Decision G.3)', () => {
    expect(
      BattleExportSchema.safeParse(battleExport({ cells: cellsForDistinctOrganisms(255) })).success,
    ).toBe(true);

    const over = BattleExportSchema.safeParse(
      battleExport({ cells: cellsForDistinctOrganisms(256) }),
    );
    expect(over.success).toBe(false);
    expect(over.error?.issues[0]?.path).toEqual(['cells']);
  });

  it('rejects an empty organismId — the wire schema is as tight as the roster it rebuilds', () => {
    const result = BattleExportSchema.safeParse(
      battleExport({ cells: [{ x: 0, y: 0, organismId: '' }] }),
    );

    expect(result.success).toBe(false);
  });

  it('rejects a negative or fractional coordinate', () => {
    expect(
      BattleExportSchema.safeParse(battleExport({ cells: [{ x: -1, y: 0, organismId: 'a' }] }))
        .success,
    ).toBe(false);
    expect(
      BattleExportSchema.safeParse(battleExport({ cells: [{ x: 1.5, y: 0, organismId: 'a' }] }))
        .success,
    ).toBe(false);
  });

  it('rejects a grid size that is not one of the two editable presets (Decision A / H-9)', () => {
    const result = BattleExportSchema.safeParse(
      battleExport({
        gridDimensions: { cols: 200, rows: 120 } as unknown as BattleExportWire['gridDimensions'],
      }),
    );

    expect(result.success).toBe(false);
  });

  it('rejects a name over the shared cap and a non-uuid id', () => {
    expect(BattleExportSchema.safeParse(battleExport({ name: 'x'.repeat(101) })).success).toBe(
      false,
    );
    expect(BattleExportSchema.safeParse(battleExport({ id: 'not-a-uuid' })).success).toBe(false);
  });

  it('accepts an empty battle — no cells is a legal export', () => {
    expect(BattleExportSchema.safeParse(battleExport({ cells: [] })).success).toBe(true);
  });
});
