import {
  BattleSchema,
  CONWAYS_CLASSIC,
  CURRENT_FORMAT_VERSION,
  WorkspaceExportSchema,
  type Battle,
} from '@gol/domain';
// ⚠️ IMPORTED WITHOUT A `package.json` EDGE, deliberately (Story 5.3). `@gol/test-utils` depends on
// `@gol/persistence`, so declaring the reverse edge makes Turbo report "Circular package dependency
// detected" on every task in the repo. The import resolves through the workspace symlink and needs
// no task ordering — these packages export TS source and have no emit step (`build` is
// `tsc --noEmit`). The alternative the project's testing rules rule out is worse: a hand-rolled
// fake repository here would be free to disagree with the real store's contract, which is the one
// thing `createFakeRepositories` exists to prevent. Recorded in `deferred-work.md`.
import { createFakeRepositories } from '@gol/test-utils';
import { describe, expect, it } from 'vitest';
import { createWorkspaceSerializer } from './workspaceSerializer';

const PRESET = { cols: 50, rows: 30 } as const;
const EXPORTED_AT = '2026-01-01T00:00:00.000Z';

/** Fixed clock — injected, so `exportedAt` is asserted exactly rather than with a regex (FD5). */
const fixedNow = () => new Date(EXPORTED_AT);

function seededBattle(): Battle {
  const gridState = Array.from({ length: PRESET.rows }, () =>
    Array.from({ length: PRESET.cols }, () => 0),
  );
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
