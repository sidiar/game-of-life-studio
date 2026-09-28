import { normalizeDescription, WorkspaceMetaSchema, type WorkspaceMeta } from '@gol/domain';
import type { WorkspaceMetaRepository } from './repositories';
import { CorruptDataError, describeIssues } from './errors';
import { readStoredValue, STORAGE_KEYS, writeMetaKey } from './localStorageAccess';

/**
 * Workspace-level metadata under `gol:workspace` (FR-9.5, Story 7.2). Modelled on the settings
 * repository's never-null shape, but it is DATA: `clearAll()` removes it and the import snapshot
 * captures it. Written through `writeMetaKey` — format-checked (AR-11), never stamped.
 */
export class LocalStorageWorkspaceMetaRepository implements WorkspaceMetaRepository {
  async load(): Promise<WorkspaceMeta> {
    const stored = readStoredValue(STORAGE_KEYS.workspace);
    // Absent ⇒ no description. A PRESENT `null` is a value that fails to be a meta record and falls
    // through to the corrupt branch, as `gol:settings` treats it.
    if (stored === undefined) return {};
    const parsed = WorkspaceMetaSchema.safeParse(stored);
    if (!parsed.success) {
      throw new CorruptDataError(STORAGE_KEYS.workspace, describeIssues(parsed.error.issues));
    }
    return parsed.data;
  }

  async save(meta: WorkspaceMeta): Promise<void> {
    // Always a record, `{}` when there is no description — never a removed key, so "save" stays one
    // format-checked write rather than a remove that would bypass the check.
    const description =
      meta.description === undefined ? undefined : normalizeDescription(meta.description);
    writeMetaKey(STORAGE_KEYS.workspace, description === undefined ? {} : { description });
  }
}
