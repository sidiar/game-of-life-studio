import {
  BattleSchema,
  CONWAYS_CLASSIC,
  CURRENT_FORMAT_VERSION,
  OrganismSchema,
  ORGANISM_SCHEMA_VERSION,
  ruleTargetIds,
  WorkspaceExportSchema,
  type Battle,
  type Organism,
  type SurvivalRule,
} from '@gol/domain';
// ⚠️ IMPORTED WITHOUT A `package.json` EDGE, and NOT by preference — declaring it is not currently
// possible (Story 5.3; re-measured 2026-09-22 while implementing the owner's decision to declare
// it). `@gol/test-utils` depends on `@gol/persistence`, so the reverse edge closes a package cycle.
// Turbo 2.10.5 only WARNS about that cycle on tasks with no `^` dependency — `typecheck`, `test`,
// `test:coverage`, which `turbo.json` deliberately gives none — but `build` and `build:standalone`
// both carry `dependsOn: ["^build"]`, and there it is a hard error that exits 1 before running
// anything: `x Cyclic dependency detected: @gol/test-utils#build, @gol/persistence#build`.
// `build:standalone` is step 7 of `npm run ci` and `npm run ci:dev`, so the edge breaks every gate
// chain, locally and on the PR. Until the fakes are split out of `@gol/test-utils` (the clean fix,
// in `deferred-work.md`), this import resolves through the workspace symlink and needs no task
// ordering, because these packages export TS source and have no emit step (`build` is
// `tsc --noEmit`). ⚠️ The known cost is a cache gap: Turbo hashes `test:coverage` from DECLARED
// dependencies only, so a change to `fakeRepositories.ts` that breaks this test replays the previous
// green run. The alternative the project's testing rules rule out is worse: a hand-rolled fake
// repository here would be free to disagree with the real store's contract, which is the one thing
// `createFakeRepositories` exists to prevent.
import {
  createFakeRepositories,
  createMockOrganisms,
  emptyGrid,
  MOCK_ORGANISM_IDS,
} from '@gol/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createWorkspaceSerializer } from './workspaceSerializer';
import { CorruptDataError, ExportError, ImportError } from './errors';
import type { AppRepositories } from './repositories';

const PRESET = { cols: 50, rows: 30 } as const;
const EXPORTED_AT = '2026-01-01T00:00:00.000Z';

/** Fixed clock — injected, so `exportedAt` is asserted exactly rather than with a regex (FD5). */
const fixedNow = () => new Date(EXPORTED_AT);

function seededBattle(): Battle {
  const gridState = emptyGrid(PRESET.cols, PRESET.rows);
  gridState[2][3] = 1;
  gridState[9][8] = 1;

  return BattleSchema.parse({
    id: '6f3c2f5c-2f4a-4a2f-8f5d-7b1e9c3a1d20',
    name: 'Seeded battle',
    organismIds: [CONWAYS_CLASSIC.id],
    gridSize: PRESET,
    gridState,
    createdAt: '2025-12-01T00:00:00.000Z',
    updatedAt: '2025-12-02T00:00:00.000Z',
  });
}

describe('createWorkspaceSerializer (AC6)', () => {
  it('exports the workspace kind stamped with the schema’s formatVersion (AC1)', async () => {
    const serializer = createWorkspaceSerializer({
      repos: createFakeRepositories(),
      appVersion: '1.2.3',
      now: fixedNow,
    });

    const envelope = await serializer.exportWorkspace();

    expect(envelope.kind).toBe('workspace');
    expect(envelope.formatVersion).toBe(CURRENT_FORMAT_VERSION);
  });

  it('takes appVersion and the clock from its injected deps, never from a constant or Date.now()', async () => {
    const serializer = createWorkspaceSerializer({
      repos: createFakeRepositories(),
      appVersion: 'provenance-string',
      now: fixedNow,
    });

    const envelope = await serializer.exportWorkspace();

    expect(envelope.appVersion).toBe('provenance-string');
    expect(envelope.exportedAt).toBe(EXPORTED_AT);
  });

  it('reads listFull(), so a battle arrives with its cells and no gridState (AC3)', async () => {
    const battle = seededBattle();
    const serializer = createWorkspaceSerializer({
      repos: createFakeRepositories({ battles: [battle], organisms: [CONWAYS_CLASSIC] }),
      appVersion: '1.2.3',
      now: fixedNow,
    });

    const envelope = await serializer.exportWorkspace();

    expect(envelope.battles).toHaveLength(1);
    const exported = envelope.battles[0];
    expect(exported.cells).toEqual([
      { x: 3, y: 2, organismId: CONWAYS_CLASSIC.id },
      { x: 8, y: 9, organismId: CONWAYS_CLASSIC.id },
    ]);
    expect(exported.gridDimensions).toEqual(PRESET);
    expect('gridState' in exported).toBe(false);
    expect('gridSize' in exported).toBe(false);
    expect('organismIds' in exported).toBe(false);
    expect(envelope.organisms).toEqual([CONWAYS_CLASSIC]);
  });

  it('carries no settings, even when the store holds some (AC5, AR-12 / Decision F.1)', async () => {
    const repos = createFakeRepositories({ battles: [seededBattle()] });
    await repos.settings.save({
      theme: 'biotech-terminal',
      gridLines: false,
      cellAnimation: false,
      defaultGridSize: PRESET,
      autoSave: true,
      defaultSpeed: 20,
    });
    const serializer = createWorkspaceSerializer({ repos, appVersion: '1.2.3', now: fixedNow });

    const envelope = await serializer.exportWorkspace();

    expect('settings' in envelope).toBe(false);
  });

  it('really is wire-shaped: JSON.stringify of the result parses back through the envelope schema (AC4)', async () => {
    const serializer = createWorkspaceSerializer({
      repos: createFakeRepositories({ battles: [seededBattle()], organisms: [CONWAYS_CLASSIC] }),
      appVersion: '1.2.3',
      now: fixedNow,
    });

    const envelope = await serializer.exportWorkspace();
    const parsed = WorkspaceExportSchema.parse(JSON.parse(JSON.stringify(envelope)) as unknown);

    expect(parsed.exportedAt).toBeInstanceOf(Date);
    expect(parsed.exportedAt.toISOString()).toBe(EXPORTED_AT);
    expect(parsed.battles[0].cells).toHaveLength(2);
  });

  it('exports an empty workspace as empty collections rather than failing', async () => {
    const serializer = createWorkspaceSerializer({
      repos: createFakeRepositories(),
      appVersion: '1.2.3',
      now: fixedNow,
    });

    const envelope = await serializer.exportWorkspace();

    expect(envelope.battles).toEqual([]);
    expect(envelope.organisms).toEqual([]);
  });
});

/** One rule targeting `targetId` via `organismType`, or none when omitted — for the chained fixture below. */
function chainOrganism(id: string, targetId?: string): Organism {
  const survivalRules: SurvivalRule[] =
    targetId === undefined
      ? []
      : [
          {
            id: `${id}-rule`,
            contentHash: `content-${id}`,
            conditions: [
              { property: 'cellState', operator: 'eq', pattern: 'alive' },
              { property: 'organismType', operator: 'eq', pattern: targetId },
            ],
            payload: { summary: `${id} targets ${targetId}`, action: 'survive' },
          },
        ];

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

/** A battle whose entire placed set is the one organism id — the closure seed (Decision H.1). */
function battlePlacingOnly(id: string, organismId: string): Battle {
  const gridState = emptyGrid(PRESET.cols, PRESET.rows);
  gridState[0][0] = 1;

  return BattleSchema.parse({
    id,
    name: 'exportBattle fixture',
    organismIds: [organismId],
    gridSize: PRESET,
    gridState,
    createdAt: '2025-12-01T00:00:00.000Z',
    updatedAt: '2025-12-02T00:00:00.000Z',
  });
}

describe('createWorkspaceSerializer.exportBattle (AC3)', () => {
  it('exports kind: "battle" carrying exactly the one battle, and passes WorkspaceExportSchema.parse', async () => {
    const battle = battlePlacingOnly(
      '11111111-1111-4111-8111-111111111111',
      MOCK_ORGANISM_IDS.chaoticSpreader,
    );
    const serializer = createWorkspaceSerializer({
      repos: createFakeRepositories({ battles: [battle], organisms: createMockOrganisms() }),
      appVersion: '1.2.3',
      now: fixedNow,
    });

    const envelope = await serializer.exportBattle(battle.id);

    expect(envelope.kind).toBe('battle');
    expect(envelope.battles).toHaveLength(1);
    expect(envelope.battles[0].id).toBe(battle.id);
    expect(() => WorkspaceExportSchema.parse(envelope)).not.toThrow();
  });

  it('rejects with ExportError("not-found") when no battle exists under the given id (RFC-006 Decision 4)', async () => {
    const serializer = createWorkspaceSerializer({
      repos: createFakeRepositories({ organisms: createMockOrganisms() }),
      appVersion: '1.2.3',
      now: fixedNow,
    });
    const missingId = '00000000-0000-4000-8000-000000000000';

    const rejection = serializer.exportBattle(missingId);

    await expect(rejection).rejects.toBeInstanceOf(ExportError);
    await expect(rejection).rejects.toMatchObject({ code: 'not-found', id: missingId });
  });

  it('rejects with CorruptDataError — never ExportError, never an envelope — when the stored battle breaks Decision H.1 (an unplaced roster entry)', async () => {
    // The invariant `exportBattle` relies on instead of pruning: `load()` parses through
    // `BattleSchema`, whose H.1 check rejects a roster member with no cell on the grid. Seeded via
    // `raw` because the validated seed path would refuse this record. If `load()` ever stopped
    // parsing, this test — not a silent leak of Patient Defender into the file — is what fails.
    const id = '77777777-7777-4777-8777-777777777777';
    const gridState = emptyGrid(PRESET.cols, PRESET.rows);
    gridState[2][3] = 2; // only slot 2 (Chaotic Spreader) is placed; slot 1 is not
    const serializer = createWorkspaceSerializer({
      repos: createFakeRepositories({
        organisms: createMockOrganisms(),
        raw: {
          battles: {
            [id]: {
              id,
              name: 'unpruned roster',
              organismIds: [MOCK_ORGANISM_IDS.patientDefender, MOCK_ORGANISM_IDS.chaoticSpreader],
              gridSize: PRESET,
              gridState,
              createdAt: '2025-12-01T00:00:00.000Z',
              updatedAt: '2025-12-02T00:00:00.000Z',
            },
          },
        },
      }),
      appVersion: '1.2.3',
      now: fixedNow,
    });

    await expect(serializer.exportBattle(id)).rejects.toBeInstanceOf(CorruptDataError);
  });

  it('exports exactly the rule-aware closure — a battle placing only Chaotic Spreader also exports Aggressive Colonizer, but not the unplaced, unreferenced Patient Defender', async () => {
    const battle = battlePlacingOnly(
      '22222222-2222-4222-8222-222222222222',
      MOCK_ORGANISM_IDS.chaoticSpreader,
    );
    const library = createMockOrganisms();
    // The fixture relationship this test rests on, stated rather than assumed: Chaotic Spreader
    // targets exactly Aggressive Colonizer, and Aggressive Colonizer targets nothing further.
    const byId = new Map(library.map((o) => [o.id, o]));
    expect(ruleTargetIds(byId.get(MOCK_ORGANISM_IDS.chaoticSpreader)!)).toEqual([
      MOCK_ORGANISM_IDS.aggressiveColonizer,
    ]);
    expect(ruleTargetIds(byId.get(MOCK_ORGANISM_IDS.aggressiveColonizer)!)).toEqual([]);
    expect(byId.has(MOCK_ORGANISM_IDS.patientDefender)).toBe(true);
    const serializer = createWorkspaceSerializer({
      repos: createFakeRepositories({ battles: [battle], organisms: library }),
      appVersion: '1.2.3',
      now: fixedNow,
    });

    const envelope = await serializer.exportBattle(battle.id);

    const exportedIds = envelope.organisms.map((o) => o.id).sort();
    expect(exportedIds).toEqual(
      [MOCK_ORGANISM_IDS.chaoticSpreader, MOCK_ORGANISM_IDS.aggressiveColonizer].sort(),
    );
  });

  it('walks a chained reference through the repository — A placed, A→B→C exports all three', async () => {
    const c = chainOrganism('c');
    const b = chainOrganism('b', 'c');
    const a = chainOrganism('a', 'b');
    const battle = battlePlacingOnly('33333333-3333-4333-8333-333333333333', 'a');
    const serializer = createWorkspaceSerializer({
      repos: createFakeRepositories({ battles: [battle], organisms: [a, b, c] }),
      appVersion: '1.2.3',
      now: fixedNow,
    });

    const envelope = await serializer.exportBattle(battle.id);

    expect(envelope.organisms.map((o) => o.id)).toEqual(['a', 'b', 'c']);
  });

  it('takes appVersion and the clock from its injected deps, exactly as exportWorkspace does', async () => {
    const battle = battlePlacingOnly(
      '55555555-5555-4555-8555-555555555555',
      MOCK_ORGANISM_IDS.chaoticSpreader,
    );
    const serializer = createWorkspaceSerializer({
      repos: createFakeRepositories({ battles: [battle], organisms: createMockOrganisms() }),
      appVersion: 'provenance-string',
      now: fixedNow,
    });

    const envelope = await serializer.exportBattle(battle.id);

    expect(envelope.appVersion).toBe('provenance-string');
    expect(envelope.exportedAt).toBe(EXPORTED_AT);
  });

  it('carries no settings, even when the store holds some (AR-12)', async () => {
    const battle = battlePlacingOnly(
      '66666666-6666-4666-8666-666666666666',
      MOCK_ORGANISM_IDS.chaoticSpreader,
    );
    const repos = createFakeRepositories({ battles: [battle], organisms: createMockOrganisms() });
    await repos.settings.save({
      theme: 'biotech-terminal',
      gridLines: false,
      cellAnimation: false,
      defaultGridSize: PRESET,
      autoSave: true,
      defaultSpeed: 20,
    });
    const serializer = createWorkspaceSerializer({ repos, appVersion: '1.2.3', now: fixedNow });

    const envelope = await serializer.exportBattle(battle.id);

    expect('settings' in envelope).toBe(false);
  });
});

/**
 * Wraps every repository method of `repos` in a `vi.fn` pass-through that logs its name into
 * `calls` — the fake itself has no failure or call-order seam (Story 1.6), and editing it would
 * change `@gol/test-utils` for one assertion.
 */
function recordingRepos(repos: AppRepositories, calls: string[]): AppRepositories {
  const wrap = <T extends object>(target: T, prefix: string): T => {
    const wrapped = { ...target };
    for (const [name, method] of Object.entries(target) as [string, unknown][]) {
      if (typeof method !== 'function') continue;
      Object.assign(wrapped, {
        [name]: vi.fn((...args: unknown[]) => {
          calls.push(`${prefix}${name}`);
          return (method as (...a: unknown[]) => unknown).apply(target, args);
        }),
      });
    }
    return wrapped;
  };
  return {
    ...wrap(repos, ''),
    battles: wrap(repos.battles, 'battles.'),
    organisms: wrap(repos.organisms, 'organisms.'),
    settings: wrap(repos.settings, 'settings.'),
  };
}

describe('createWorkspaceSerializer.importWorkspace (mode-agnostic)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('runs over the AppRepositories interface alone, validating the file before any repository call', async () => {
    const calls: string[] = [];
    const repos = recordingRepos(
      createFakeRepositories({ battles: [seededBattle()], organisms: [CONWAYS_CLASSIC] }),
      calls,
    );
    const originalSafeParse = WorkspaceExportSchema.safeParse.bind(WorkspaceExportSchema);
    vi.spyOn(WorkspaceExportSchema, 'safeParse').mockImplementation((input) => {
      calls.push('validate');
      return originalSafeParse(input);
    });
    const incoming = chainOrganism('solo');
    const battle = battlePlacingOnly('44444444-4444-4444-8444-444444444444', incoming.id);
    const source = createWorkspaceSerializer({
      repos: createFakeRepositories({ battles: [battle], organisms: [incoming] }),
      appVersion: '1.2.3',
      now: fixedNow,
    });
    const file = JSON.stringify(await source.exportWorkspace());
    const serializer = createWorkspaceSerializer({ repos, appVersion: '1.2.3', now: fixedNow });

    const summary = await serializer.importWorkspace(file);

    expect(calls[0]).toBe('validate');
    expect(calls).not.toContain('settings.load');
    expect(calls).not.toContain('settings.save');
    // The write region as an exact filtered sequence, not `indexOf` comparisons: `indexOf` is -1
    // for an absent call and `-1 < i` passes, so a dropped `clearAll()` (or a dropped ensure)
    // would slip through — and end-state assertions cannot catch it, because `replaceAll`
    // overwrites whole collections either way. This is the one test guarding the ordering itself.
    const writeRegion = calls.filter((name) =>
      [
        'clearAll',
        'organisms.replaceAll',
        'battles.replaceAll',
        'organisms.exists',
        'organisms.save',
      ].includes(name),
    );
    expect(writeRegion).toEqual([
      'clearAll',
      'organisms.replaceAll',
      'battles.replaceAll',
      // `ensureDefaultOrganism` runs LAST, inside the guarded region: `exists`, then — Conway's
      // Classic being absent from this file — the `save` that re-adds it.
      'organisms.exists',
      'organisms.save',
    ]);
    expect((await repos.battles.listFull()).map((b) => b.id)).toEqual([battle.id]);
    expect((await repos.organisms.list()).map((o) => o.id)).toEqual([
      incoming.id,
      CONWAYS_CLASSIC.id,
    ]);
    expect(summary).toEqual({ kind: 'workspace', battleCount: 1, organismCount: 2 });
  });

  it('never touches a repository when the file is rejected', async () => {
    const calls: string[] = [];
    const repos = recordingRepos(createFakeRepositories({ organisms: [CONWAYS_CLASSIC] }), calls);
    const serializer = createWorkspaceSerializer({ repos, appVersion: '1.2.3', now: fixedNow });

    await expect(serializer.importWorkspace('not json')).rejects.toBeInstanceOf(ImportError);

    expect(calls).toEqual([]);
  });
});
