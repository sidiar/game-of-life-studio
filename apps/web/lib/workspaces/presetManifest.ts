/**
 * The contract for `public/workspaces/` — the repo-bundled preset workspace library.
 *
 * Every file in that folder except `index.json` is a full export ENVELOPE
 * (`WorkspaceExportSchema`, `kind: 'workspace'`) — never a second format. That choice is the whole
 * design: a preset is loaded by fetching its static JSON and handing the text to the existing
 * import pipeline (`WorkspaceSerializer.importWorkspace`), which brings validation, format
 * migration (Story 5.7) and the atomic destructive replace with its warning (Stories 5.8/5.9)
 * along for free. No preset-specific parser may ever exist.
 *
 * `index.json` is the manifest a future Settings dropdown reads. It exists because the app is a
 * static export — there is no server to enumerate a directory, so the folder must describe itself.
 * `presetWorkspaces.test.ts` beside this file keeps folder and manifest in lockstep and runs every
 * preset through the production import gate (`validateImportFile`), so a formatVersion bump or a
 * schema change surfaces as a test failure, not as a broken preset in production.
 *
 * Authoring a preset never means writing JSON by hand: build the workspace in the app, use
 * Settings → Export Workspace (Story 5.5), drop the downloaded file here and add a manifest entry.
 *
 * No runtime consumer exists yet — the Settings dropdown and the load-preset URL are future
 * stories; this module is deliberately just the folder's location and the manifest's shape.
 */

/** Where the presets are served from, relative to the site root (statically, from `public/`). */
export const PRESET_WORKSPACES_PATH = '/workspaces';

/** The manifest filename inside {@link PRESET_WORKSPACES_PATH}. */
export const PRESET_MANIFEST_FILE = 'index.json';

export interface PresetWorkspaceEntry {
  /** Stable slug — a future load-preset URL will address a preset by this, so it must not change. */
  id: string;
  /** Display name for the Settings dropdown. */
  name: string;
  /** One or two sentences for the dropdown / confirmation copy. */
  description: string;
  /** The envelope's filename inside {@link PRESET_WORKSPACES_PATH}. */
  file: string;
}

export interface PresetWorkspaceManifest {
  workspaces: PresetWorkspaceEntry[];
}
