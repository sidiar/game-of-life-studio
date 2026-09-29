import {
  createWorkspaceSerializer,
  type AppRepositories,
  type ImportSummary,
} from '@gol/persistence';
import { APP_VERSION } from '@/lib/appVersion';
import {
  fetchPresetManifest,
  fetchPresetText,
  PRESET_FETCH_TIMEOUT_MS,
  withPresetTimeout,
} from './presetFetch';

type Fetch = typeof fetch;

export interface LoadDefaultPresetDeps {
  /** Injected so tests serve the real preset files off disk without stubbing a global. */
  fetch: Fetch;
  repos: AppRepositories;
  timeoutMs?: number;
}

/**
 * Loads the manifest's default preset into the workspace through the FR-8.4 import pipeline — a
 * whole-workspace replace with no dialog (the first-visit store is pristine, FR-9.2).
 *
 * Rejects on ANY failure and never swallows one: the caller (`useWorkspaceSeed`) owns the silent
 * FR-1.5 fallback. The serializer is built here, not passed in, so the import pipeline stays inside
 * the dynamically imported chunk this module is loaded as (FD4) — a hook that built it would pull
 * the serializer into every route's first-load bundle for code that runs once per browser (AR-3).
 *
 * The timeout covers the network phase only — both fetches and both body reads, under one
 * `AbortController`. The import itself is never raced: an abort cannot stop a write region already
 * in progress, `applyImport` owns its own rollback, and a late import landing after the caller had
 * already fallen back would be a second writer racing the Conway seed.
 */
export async function loadDefaultPreset({
  fetch: fetchFn,
  repos,
  timeoutMs = PRESET_FETCH_TIMEOUT_MS,
}: LoadDefaultPresetDeps): Promise<ImportSummary> {
  const text = await withPresetTimeout(async (signal) => {
    const manifest = await fetchPresetManifest(fetchFn, signal);
    // The schema guarantees defaultPresetId names a listed entry; the guard keeps the type honest.
    const entry = manifest.workspaces.find((w) => w.id === manifest.defaultPresetId);
    if (entry === undefined) throw new Error('defaultPresetId names no listed entry');
    return fetchPresetText(fetchFn, entry, signal);
  }, timeoutMs);

  const serializer = createWorkspaceSerializer({
    repos,
    appVersion: APP_VERSION,
    now: () => new Date(),
  });
  return serializer.importWorkspace(text);
}
