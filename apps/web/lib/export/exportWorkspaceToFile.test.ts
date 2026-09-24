import { describe, expect, it, vi } from 'vitest';
import { fromEnvelope, WorkspaceExportSchema } from '@gol/domain';
import { createFakeRepositories, createMockWorkspace } from '@gol/test-utils';
import { createWorkspaceSerializer, type WorkspaceSerializer } from '@gol/persistence';
import { exportWorkspaceToFile } from './exportWorkspaceToFile';
import { workspaceExportFilename } from './workspaceExportFilename';

describe('exportWorkspaceToFile', () => {
  it('derives the filename from envelope.exportedAt — one clock reading, not a second (FD4)', async () => {
    const exportedAt = '2026-03-09T23:45:00.000Z';
    const serializer: Pick<WorkspaceSerializer, 'exportWorkspace'> = {
      exportWorkspace: vi.fn().mockResolvedValue({
        formatVersion: 1,
        appVersion: '0.0.0',
        exportedAt,
        kind: 'workspace',
        organisms: [],
        battles: [],
      }),
    };
    const download = vi.fn();

    await exportWorkspaceToFile(serializer, download);

    expect(download).toHaveBeenCalledTimes(1);
    const [filename, value] = download.mock.calls[0];
    expect(filename).toBe(workspaceExportFilename(new Date(exportedAt)));
    expect((value as { exportedAt: string }).exportedAt).toBe(exportedAt);
  });

  it('rejects with the serializer’s own error and never calls download', async () => {
    const error = new Error('boom');
    const serializer: Pick<WorkspaceSerializer, 'exportWorkspace'> = {
      exportWorkspace: vi.fn().mockRejectedValue(error),
    };
    const download = vi.fn();

    await expect(exportWorkspaceToFile(serializer, download)).rejects.toBe(error);
    expect(download).not.toHaveBeenCalled();
  });

  it('AC4 round trip: the string handed to download parses through WorkspaceExportSchema, and fromEnvelope reproduces the store', async () => {
    const mockWorkspace = createMockWorkspace();
    const repos = createFakeRepositories(mockWorkspace);
    const serializer = createWorkspaceSerializer({
      repos,
      appVersion: '1.2.3',
      now: () => new Date('2026-01-05T12:00:00.000Z'),
    });

    let captured = '';
    const download = (_filename: string, value: unknown) => {
      captured = JSON.stringify(value);
    };

    await exportWorkspaceToFile(serializer, download);

    const parsed = WorkspaceExportSchema.parse(JSON.parse(captured) as unknown);
    const { battles, organisms } = fromEnvelope(parsed);

    expect(battles.map((b) => b.id).sort()).toEqual(mockWorkspace.battles.map((b) => b.id).sort());
    expect(organisms.map((o) => o.id).sort()).toEqual(
      mockWorkspace.organisms.map((o) => o.id).sort(),
    );
    for (const battle of mockWorkspace.battles) {
      const roundTripped = battles.find((b) => b.id === battle.id);
      expect(roundTripped).toEqual(battle);
    }
  });
});
