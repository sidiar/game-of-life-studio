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

  it('AC4 round trip: the exact bytes the real download seam writes parse through WorkspaceExportSchema, and fromEnvelope reproduces the store', async () => {
    const mockWorkspace = createMockWorkspace();
    const repos = createFakeRepositories(mockWorkspace);
    const serializer = createWorkspaceSerializer({
      repos,
      appVersion: '1.2.3',
      now: () => new Date('2026-01-05T12:00:00.000Z'),
    });

    // The REAL `downloadJsonFile` runs (default seam), so what is captured is the exact Blob text
    // the user's file would hold — not a re-stringify of the value in the test. jsdom lacks the
    // Blob URL API: stubbed here and removed in `finally` (never left installed across files).
    let capturedBlob: Blob | undefined;
    URL.createObjectURL = (blob: Blob) => {
      capturedBlob = blob;
      return 'blob:fake-url';
    };
    URL.revokeObjectURL = () => {};
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    try {
      await exportWorkspaceToFile(serializer);
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
    // Asserted on the RAW file, not the parse output: Zod strips unknown keys, so a `settings` key
    // would vanish from `parsed` and the check could never fail (AR-12 / Decision F.1).
    expect('settings' in raw).toBe(false);
    const parsed = WorkspaceExportSchema.parse(raw);
    const { battles, organisms } = fromEnvelope(parsed);

    expect(battles.map((b) => b.id).sort()).toEqual(mockWorkspace.battles.map((b) => b.id).sort());
    expect(organisms.map((o) => o.id).sort()).toEqual(
      mockWorkspace.organisms.map((o) => o.id).sort(),
    );
    for (const battle of mockWorkspace.battles) {
      expect(battles.find((b) => b.id === battle.id)).toEqual(battle);
    }
    for (const organism of mockWorkspace.organisms) {
      expect(organisms.find((o) => o.id === organism.id)).toEqual(organism);
    }
  });
});
