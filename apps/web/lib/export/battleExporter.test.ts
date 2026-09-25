import { afterEach, describe, expect, it, vi } from 'vitest';
import { createFakeRepositories, createMockWorkspace, MOCK_BATTLE_IDS } from '@gol/test-utils';
import { downloadJsonFile } from './downloadJsonFile';
import { createBattleExporter } from './battleExporter';

// The download seam is the observable boundary of BOTH methods — mocked here rather than stubbing
// the DOM/Blob APIs, since this test's job is "the factory wires the injected repos through to a
// download", not "the download mechanism itself works" (that is `downloadJsonFile.test.ts`'s job).
vi.mock('./downloadJsonFile');

describe('createBattleExporter (Story 5.6 FD1)', () => {
  afterEach(() => {
    vi.mocked(downloadJsonFile).mockClear();
  });

  it('exportBattle builds from the injected repositories and reaches the download seam', async () => {
    const mockWorkspace = createMockWorkspace();
    const repos = createFakeRepositories(mockWorkspace);
    const exporter = createBattleExporter(repos);

    await exporter.exportBattle(MOCK_BATTLE_IDS.battleA);

    expect(downloadJsonFile).toHaveBeenCalledTimes(1);
    const [filename, value] = vi.mocked(downloadJsonFile).mock.calls[0];
    expect(filename).toBe('three-way-skirmish.json');
    expect((value as { kind: string }).kind).toBe('battle');
  });

  it('exportWorkspace builds from the injected repositories and reaches the download seam', async () => {
    const mockWorkspace = createMockWorkspace();
    const repos = createFakeRepositories(mockWorkspace);
    const exporter = createBattleExporter(repos);

    await exporter.exportWorkspace();

    expect(downloadJsonFile).toHaveBeenCalledTimes(1);
    const [, value] = vi.mocked(downloadJsonFile).mock.calls[0];
    expect((value as { kind: string }).kind).toBe('workspace');
  });

  it('exportBattle rejects with ExportError for an id with no battle, and never downloads', async () => {
    const repos = createFakeRepositories(createMockWorkspace());
    const exporter = createBattleExporter(repos);

    await expect(exporter.exportBattle('00000000-0000-4000-8000-000000000000')).rejects.toThrow();
    expect(downloadJsonFile).not.toHaveBeenCalled();
  });
});
