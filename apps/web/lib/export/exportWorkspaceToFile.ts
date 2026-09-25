import type { WorkspaceSerializer } from '@gol/persistence';
import { downloadJsonFile } from './downloadJsonFile';
import { workspaceExportFilename } from './workspaceExportFilename';

/**
 * The reusable export seam (AC6, Story 5.5) — reused rather than re-assembled inline wherever the
 * app writes a whole-workspace file. Story 5.6's Entire Workspace choice (`<ExportBattleDialog>`,
 * `apps/web/lib/export/battleExporter.ts`) is the second caller, unchanged from `<DataManagement>`'s
 * own; Story 5.9's import-time "Export First" prompt is the third and does not exist yet.
 *
 * A single-BATTLE export is a DIFFERENT function, `exportBattleToFile.ts` (Story 5.6) — same shape,
 * a different envelope kind and a different filename source, not a variant of this one.
 *
 * Runs `exportWorkspace()`, derives the filename from the SAME `exportedAt` the envelope carries
 * (FD4 — one `now()` call per export, never a second), and hands both to `downloadJsonFile`.
 * Resolves once the download has been handed to the browser; rejects with the serializer's own
 * error and never calls `download` in that case. It never swallows an error and never shows UI —
 * that is the caller's job (`DataManagement.tsx`'s alert, here).
 *
 * `download` is a test seam only — `downloadJsonFile` in production, injected in tests — and is
 * never a prop anywhere in the component tree (FD3).
 */
export async function exportWorkspaceToFile(
  serializer: Pick<WorkspaceSerializer, 'exportWorkspace'>,
  download: (filename: string, value: unknown) => void = downloadJsonFile,
): Promise<void> {
  const envelope = await serializer.exportWorkspace();
  const filename = workspaceExportFilename(new Date(envelope.exportedAt));
  download(filename, envelope);
}
