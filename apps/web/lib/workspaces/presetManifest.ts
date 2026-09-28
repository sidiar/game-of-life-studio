/**
 * The contract for `public/workspaces/` — the repo-bundled preset workspace library.
 *
 * Every file in that folder except `index.json` is a full export ENVELOPE
 * (`WorkspaceExportSchema`, `kind: 'workspace'`) — never a second format. That choice is the whole
 * design: a preset is loaded by fetching its static JSON and handing the text to the existing
 * import pipeline (`WorkspaceSerializer.importWorkspace`), which brings validation, format
 * migration (Story 5.7) and the atomic destructive replace with its warning (Stories 5.8/5.9)
 * along for free. No preset-specific parser may ever exist (FR-9.1).
 *
 * `index.json` is the manifest a future Settings dropdown reads. It exists because the app is a
 * static export — there is no server to enumerate a directory, so the folder must describe itself.
 * `presetWorkspaces.test.ts` beside this file keeps folder and manifest in lockstep and runs every
 * preset through the production import gate (`validateImportFile`), so a formatVersion bump or a
 * schema change surfaces as a test failure, not as a broken preset in production.
 *
 * Authoring a preset never means writing JSON by hand: build the workspace in the app, use
 * Settings → Export Workspace (Story 5.5), drop the downloaded file here and add a manifest entry
 * naming it (and, for the first preset, generate it via Story 7.1's Task 2 route instead of a
 * hand save).
 *
 * No runtime consumer exists yet: Story 7.4 is the first reader of `defaultPresetId` (first-visit
 * auto-load), Story 7.5 reads the manifest for the Settings loader, and Story 7.6 addresses a
 * preset by `id` from a shareable link. This module is deliberately just the folder's location and
 * the manifest's shape — no fetch, no loader, no hook, no UI, and no `zod` dependency: the
 * manifest's runtime parse boundary belongs to whichever of those stories first fetches it. Story
 * 7.2 later turns each entry's `description` into a projection of its envelope's own workspace
 * description; nothing here anticipates that.
 *
 * This module never imports anything from `public/` (FD5, Story 7.1) — importing preset JSON into
 * app code would pull every preset into the JS bundle (AR-3 growth gate) and defeat the "drop a
 * file to author" model. Only `presetWorkspaces.test.ts` reads the folder, off disk with
 * `node:fs`.
 */

/** Where the presets are served from, relative to the site root (statically, from `public/`). */
export const PRESET_WORKSPACES_PATH = '/workspaces';

/** The manifest filename inside {@link PRESET_WORKSPACES_PATH}. */
export const PRESET_MANIFEST_FILE = 'index.json';

/**
 * Preset ids are lowercase kebab slugs (Story 7.1 FD3): one or more `[a-z0-9]` runs joined by
 * single hyphens, no leading/trailing/double hyphen. A slug needs no URL-encoding and cannot
 * smuggle a path segment, which matters because Story 7.6 addresses a preset by id inside a URL.
 * Ids are stable forever once shipped — a shared link names them, so renaming one breaks every
 * link already handed out.
 */
export const PRESET_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export interface PresetWorkspaceEntry {
  /** Stable slug matching {@link PRESET_ID_PATTERN}; never renamed once shipped. */
  id: string;
  /** Display name for the Settings dropdown. */
  name: string;
  /** One or two sentences for the dropdown / confirmation copy. */
  description: string;
  /** The envelope's filename inside {@link PRESET_WORKSPACES_PATH}. */
  file: string;
}

export interface PresetWorkspaceManifest {
  /**
   * Names the entry (by `id`) that loads on first visit (Story 7.1 FD2). A per-entry `default:
   * boolean` was rejected: it admits zero or two defaults and needs its own test to forbid both,
   * where a single top-level id admits only "names a listed entry or doesn't" — the lockstep gate
   * already checks that. Story 7.4 is this field's first reader.
   */
  defaultPresetId: string;
  workspaces: PresetWorkspaceEntry[];
}
