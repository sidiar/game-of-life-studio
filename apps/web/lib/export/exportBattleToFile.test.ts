import { describe, expect, it, vi } from 'vitest';
import { fromBattleExport, organismClosure, WorkspaceExportSchema } from '@gol/domain';
import {
  createFakeRepositories,
  createMockWorkspace,
  emptyGrid,
  MOCK_BATTLE_IDS,
} from '@gol/test-utils';
import { createWorkspaceSerializer, type WorkspaceSerializer } from '@gol/persistence';
import { exportBattleToFile } from './exportBattleToFile';
import { battleExportFilename } from './battleExportFilename';

describe('exportBattleToFile', () => {
  it('derives the filename from envelope.battles[0].name, not from an argument (FD7)', async () => {
    const serializer: Pick<WorkspaceSerializer, 'exportBattle'> = {
      exportBattle: vi.fn().mockResolvedValue({
        formatVersion: 1,
        appVersion: '0.0.0',
        exportedAt: '2026-03-09T23:45:00.000Z',
        kind: 'battle',
        organisms: [],
        battles: [
          {
            id: MOCK_BATTLE_IDS.battleA,
            name: 'Triple Threat',
            gridDimensions: { cols: 50, rows: 30 },
            cells: [],
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
          },
        ],
      }),
    };
    const download = vi.fn();

    await exportBattleToFile(serializer, MOCK_BATTLE_IDS.battleA, download);

    expect(serializer.exportBattle).toHaveBeenCalledWith(MOCK_BATTLE_IDS.battleA);
    expect(download).toHaveBeenCalledTimes(1);
    const [filename] = download.mock.calls[0];
    expect(filename).toBe(battleExportFilename('Triple Threat'));
    expect(filename).toBe('triple-threat.json');
  });

  it('rejects with the serializer’s own error and never calls download', async () => {
    const error = new Error('boom');
    const serializer: Pick<WorkspaceSerializer, 'exportBattle'> = {
      exportBattle: vi.fn().mockRejectedValue(error),
    };
    const download = vi.fn();

    await expect(exportBattleToFile(serializer, 'some-id', download)).rejects.toBe(error);
    expect(download).not.toHaveBeenCalled();
  });

  it('AC11 round trip: the exact bytes carry exactly one battle, its rule-aware organism closure, and no settings key', async () => {
    const mockWorkspace = createMockWorkspace();
    const repos = createFakeRepositories(mockWorkspace);
    const serializer = createWorkspaceSerializer({
      repos,
      appVersion: '1.2.3',
      now: () => new Date('2026-01-05T12:00:00.000Z'),
    });
    const battle = mockWorkspace.battles.find((b) => b.id === MOCK_BATTLE_IDS.battleA);
    if (battle === undefined) throw new Error('fixture battle missing');

    let capturedBlob: Blob | undefined;
    URL.createObjectURL = (blob: Blob) => {
      capturedBlob = blob;
      return 'blob:fake-url';
    };
    URL.revokeObjectURL = () => {};
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    try {
      await exportBattleToFile(serializer, MOCK_BATTLE_IDS.battleA);
    } finally {
      clickSpy.mockRestore();
      // @ts-expect-error restoring jsdom to its un-stubbed state.
      delete URL.createObjectURL;
      // @ts-expect-error restoring jsdom to its un-stubbed state.
      delete URL.revokeObjectURL;
    }

    expect(capturedBlob).toBeDefined();
    const captured = await (capturedBlob as Blob).text();
    const raw = JSON.parse(captured) as Record<string, unknown>;
    expect('settings' in raw).toBe(false);

    const parsed = WorkspaceExportSchema.parse(raw);
    expect(parsed.kind).toBe('battle');
    expect(parsed.battles).toHaveLength(1);
    expect(parsed.battles[0].id).toBe(MOCK_BATTLE_IDS.battleA);

    // AC6 (code review 2026-09-25): the exported cells ARE the saved record's grid — decoded back
    // to dense form and compared whole, not just counted.
    expect(fromBattleExport(parsed.battles[0]).gridState).toEqual(battle.gridState);

    const expectedClosure = organismClosure(battle.organismIds, mockWorkspace.organisms);
    expect(parsed.organisms.map((o) => o.id).sort()).toEqual(
      expectedClosure.map((o) => o.id).sort(),
    );
  });

  it('AC10: an empty battle (zero cells, zero organisms) still exports (FD10)', async () => {
    const mockWorkspace = createMockWorkspace();
    const emptyId = 'e5a1c2d4-5b6e-4f7a-8c9d-0e1f2a3b4c99';
    mockWorkspace.battles.push({
      id: emptyId,
      name: '',
      organismIds: [],
      gridSize: { cols: 50, rows: 30 },
      gridState: emptyGrid(50, 30),
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    });
    const repos = createFakeRepositories(mockWorkspace);
    const serializer = createWorkspaceSerializer({
      repos,
      appVersion: '1.2.3',
      now: () => new Date('2026-01-05T12:00:00.000Z'),
    });
    const download = vi.fn();

    await exportBattleToFile(serializer, emptyId, download);

    expect(download).toHaveBeenCalledTimes(1);
    const [filename, value] = download.mock.calls[0];
    expect(filename).toBe('untitled-battle.json');
    const parsed = WorkspaceExportSchema.parse(value);
    expect(parsed.battles).toHaveLength(1);
    expect(parsed.battles[0].cells).toEqual([]);
  });
});
