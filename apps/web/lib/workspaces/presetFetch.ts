import {
  PRESET_MANIFEST_FILE,
  PRESET_WORKSPACES_PATH,
  PresetWorkspaceManifestSchema,
  type PresetWorkspaceEntry,
  type PresetWorkspaceManifest,
} from './presetManifest';

// The preset fetch helpers, split out of `loadDefaultPreset.ts` (Story 7.5 FD1). This module
// imports nothing from `@gol/persistence` (no serializer), so any route can import it cheaply.
// Callers: Story 7.4's first-visit loader, Story 7.5's Settings row, and Story 7.6's preset link.

/**
 * The network-phase budget for a preset fetch (Story 7.4 FD3, shared by Story 7.5's Settings row).
 * A slow or hung request must give up: the first-visit load falls back to the FR-1.5 Conway seed
 * (a Conway-only studio beats a spinner), and the Settings row reports a failure the user can
 * retry. 5 s is generous for the ~396 KB envelope (far smaller gzipped from the static host) on
 * broadband while still bounding a request that never answers.
 */
export const PRESET_FETCH_TIMEOUT_MS = 5000;

type Fetch = typeof fetch;

/**
 * Runs `run` with an `AbortSignal` that aborts after `timeoutMs`; the timer is always cleared. The
 * timeout covers whatever `run` awaits, so callers pass ONLY the network phase (never an import).
 */
export async function withPresetTimeout<T>(
  run: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number = PRESET_FETCH_TIMEOUT_MS,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await run(controller.signal);
  } finally {
    clearTimeout(timer);
  }
}

async function fetchOk(fetchFn: Fetch, path: string, signal: AbortSignal): Promise<Response> {
  const response = await fetchFn(path, { signal });
  if (!response.ok) throw new Error(`GET ${path} failed: HTTP ${response.status}`);
  return response;
}

/** Fetches and PARSES the manifest — never casts it (see `presetManifest.ts`). */
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
