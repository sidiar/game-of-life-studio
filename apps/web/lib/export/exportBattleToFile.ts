import type { WorkspaceSerializer } from '@gol/persistence';
import { downloadJsonFile } from './downloadJsonFile';
import { battleExportFilename } from './battleExportFilename';

/**
 * The Battle Only export seam (AC3, AC5, AC11, Story 5.6) — `exportWorkspaceToFile`'s shape,
 * applied to a single battle.
 *
 * Runs `exportBattle(id)`, derives the filename from the EXPORTED envelope's own battle name
 * (`envelope.battles[0].name`, FD7) — never from live editor state, matching Story 5.5 FD4's "one
 * source per file" rule — and hands both to `download`. Resolves once the download has been
 * handed to the browser; rejects with the serializer's own error and never calls `download` in
 * that case. It never swallows an error and never shows UI — that is the caller's job
 * (`<BattlePage>`'s `exportError`).
 *
 * `download` is a test seam only, exactly like `exportWorkspaceToFile`'s — never a prop anywhere
 * in the component tree (FD3).
 */
export async function exportBattleToFile(
  serializer: Pick<WorkspaceSerializer, 'exportBattle'>,
  id: string,
  download: (filename: string, value: unknown) => void = downloadJsonFile,
): Promise<void> {
  const envelope = await serializer.exportBattle(id);
  const filename = battleExportFilename(envelope.battles[0].name);
  download(filename, envelope);
}
