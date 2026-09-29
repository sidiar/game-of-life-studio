import { isPristineWorkspace } from '@gol/domain';
import {
  createWorkspaceSerializer,
  validateImportFile,
  type AppRepositories,
  type ImportSummary,
} from '@gol/persistence';
import { APP_VERSION } from '@/lib/appVersion';
import { exportWorkspaceToFile } from '@/lib/export/exportWorkspaceToFile';
import { importFailureMessage } from '@/lib/import/importFailureMessage';
import { loadDefaultPreset } from './loadDefaultPreset';
import {
  fetchPresetManifest,
  fetchPresetText,
  PRESET_FETCH_TIMEOUT_MS,
  withPresetTimeout,
} from './presetFetch';
import { PRESET_ID_PATTERN, type PresetWorkspaceEntry } from './presetManifest';

// The preset link's decision logic (Story 7.6, FR-9.4), reached ONLY by a dynamic `import()` from
// `<PresetLinkArrival>` (FD3). That is what lets this module statically import the serializer, the
// manifest zod schema and the import pipeline without any of it entering `/`'s first-load bundle
// (AR-3). It never calls `createRepositories()` (AR-2/27): the page's repositories arrive as a dep.
//
// NOTHING here writes before step 4 (`unknown` + first visit -> the default preset) or `load()`.
// That is what makes "Your workspace was not changed" true in the download-failure copy.

type Fetch = typeof fetch;

export type PresetLinkPlan =
  | { kind: 'unknown'; defaultLoaded: boolean }
  | { kind: 'download-failed' }
  | { kind: 'invalid-file'; message: string }
  | {
      kind: 'ready';
      entry: PresetWorkspaceEntry;
      pristine: boolean;
      /** Never rejects: a pipeline failure resolves `{ ok: false }` with the user-facing copy. */
      load(): Promise<{ ok: true; summary: ImportSummary } | { ok: false; message: string }>;
      /** Rejects on failure, like `exportWorkspaceToFile`. */
      exportCurrent(): Promise<void>;
    };

export interface PreparePresetLinkDeps {
  presetId: string;
  fetch: Fetch;
  repos: AppRepositories;
  /** The seed deferred the first-visit preset for this link (FD5). */
  firstVisit: boolean;
  timeoutMs?: number;
}

/**
 * Fetch -> validate -> pristine check (FD4, the same order as Story 7.5), so a network failure never
 * shows a dialog that then fails. The pristine read is `LoadPresetRow`'s; a rejected read counts as
 * NOT pristine (an extra warning, never a skipped one).
 */
export async function preparePresetLink({
  presetId,
  fetch: fetchFn,
  repos,
  firstVisit,
  timeoutMs = PRESET_FETCH_TIMEOUT_MS,
}: PreparePresetLinkDeps): Promise<PresetLinkPlan> {
  // A syntactically invalid id can never name a preset: no fetch at all.
  if (!PRESET_ID_PATTERN.test(presetId)) return unknown(fetchFn, repos, firstVisit, timeoutMs);

  let entry: PresetWorkspaceEntry | undefined;
  try {
    const manifest = await withPresetTimeout(
      (signal) => fetchPresetManifest(fetchFn, signal),
      timeoutMs,
    );
    entry = manifest.workspaces.find((w) => w.id === presetId);
  } catch {
    return { kind: 'download-failed' };
  }
  if (entry === undefined) return unknown(fetchFn, repos, firstVisit, timeoutMs);

  const found = entry;
  let text: string;
  try {
    text = await withPresetTimeout((signal) => fetchPresetText(fetchFn, found, signal), timeoutMs);
  } catch {
    return { kind: 'download-failed' };
  }

  try {
    validateImportFile(text);
  } catch (error) {
    // Reachable only through deploy skew: the lockstep gate validates every shipped preset.
    return { kind: 'invalid-file', message: importFailureMessage(error) };
  }

  let pristine: boolean;
  try {
    const [battleSummaries, organisms, meta] = await Promise.all([
      repos.battles.list(),
      repos.organisms.list(),
      repos.workspaceMeta.load(),
    ]);
    pristine = isPristineWorkspace(battleSummaries.length, organisms, meta.description);
  } catch {
    pristine = false;
  }

  const serializer = createWorkspaceSerializer({
    repos,
    appVersion: APP_VERSION,
    now: () => new Date(),
  });
  return {
    kind: 'ready',
    entry: found,
    pristine,
    async load() {
      try {
        return { ok: true, summary: await serializer.importWorkspace(text) };
      } catch (error) {
        return { ok: false, message: importFailureMessage(error) };
      }
    },
    exportCurrent: () => exportWorkspaceToFile(serializer),
  };
}

/**
 * An unknown link on a first visit loads the DEFAULT preset (FD5: "the normal app" for someone who
 * has never been here). A failure there is swallowed silently: the Conway-only store the deferred
 * seed wrote stays (the FR-1.5 fallback, as in Story 7.4). Without `firstVisit` nothing is written.
 */
async function unknown(
  fetchFn: Fetch,
  repos: AppRepositories,
  firstVisit: boolean,
  timeoutMs: number,
): Promise<PresetLinkPlan> {
  if (!firstVisit) return { kind: 'unknown', defaultLoaded: false };
  try {
    await loadDefaultPreset({ fetch: fetchFn, repos, timeoutMs });
    return { kind: 'unknown', defaultLoaded: true };
  } catch {
    return { kind: 'unknown', defaultLoaded: false };
  }
}
