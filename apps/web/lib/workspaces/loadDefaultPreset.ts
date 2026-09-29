import {
  createWorkspaceSerializer,
  type AppRepositories,
  type ImportSummary,
} from '@gol/persistence';
import { APP_VERSION } from '@/lib/appVersion';
import {
  PRESET_MANIFEST_FILE,
  PRESET_WORKSPACES_PATH,
  PresetWorkspaceManifestSchema,
  type PresetWorkspaceEntry,
  type PresetWorkspaceManifest,
} from './presetManifest';

/**
 * The fetch-phase budget for the first-visit preset (Story 7.4 FD3). The UX call is that a
 * Conway-only studio beats a spinner, so a slow or hung request must give up and let the FR-1.5
 * fallback seed run. 5 s is generous for the ~396 KB envelope (far smaller gzipped from the static
 * host) on broadband while still bounding a request that never answers.
 */
export const PRESET_FETCH_TIMEOUT_MS = 5000;

type Fetch = typeof fetch;

export interface LoadDefaultPresetDeps {
  /** Injected so tests serve the real preset files off disk without stubbing a global. */
  fetch: Fetch;
  repos: AppRepositories;
  timeoutMs?: number;
}

async function fetchOk(fetchFn: Fetch, path: string, signal: AbortSignal): Promise<Response> {
  const response = await fetchFn(path, { signal });
  if (!response.ok) throw new Error(`GET ${path} failed: HTTP ${response.status}`);
  return response;
}

/**
 * Fetches and PARSES the manifest — never casts it (see `presetManifest.ts`). Exported for the
 * Settings loader (Story 7.5) and the preset link (Story 7.6), which need the same boundary.
 */
export async function fetchPresetManifest(
  fetchFn: Fetch,
  signal: AbortSignal,
): Promise<PresetWorkspaceManifest> {
  const response = await fetchOk(
    fetchFn,
    `${PRESET_WORKSPACES_PATH}/${PRESET_MANIFEST_FILE}`,
    signal,
  );
  return PresetWorkspaceManifestSchema.parse(await response.json());
}

/**
 * The envelope as TEXT: the import pipeline (`importWorkspace`) owns the JSON parse, migration and
 * validation, so parsing here would be a second, preset-specific parser (FR-9.1).
 */
export async function fetchPresetText(
  fetchFn: Fetch,
  entry: PresetWorkspaceEntry,
  signal: AbortSignal,
): Promise<string> {
  const response = await fetchOk(fetchFn, `${PRESET_WORKSPACES_PATH}/${entry.file}`, signal);
  return response.text();
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
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let text: string;
  try {
    const manifest = await fetchPresetManifest(fetchFn, controller.signal);
    // The schema guarantees defaultPresetId names a listed entry; the guard keeps the type honest.
    const entry = manifest.workspaces.find((w) => w.id === manifest.defaultPresetId);
    if (entry === undefined) throw new Error('defaultPresetId names no listed entry');
    text = await fetchPresetText(fetchFn, entry, controller.signal);
  } finally {
    clearTimeout(timer);
  }

  const serializer = createWorkspaceSerializer({
    repos,
    appVersion: APP_VERSION,
    now: () => new Date(),
  });
  return serializer.importWorkspace(text);
}
