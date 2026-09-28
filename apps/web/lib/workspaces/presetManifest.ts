/**
 * The contract for `public/workspaces/` — the repo-bundled preset workspace library.
 *
 * Every git-tracked file in that folder except `index.json` is a full export ENVELOPE
 * (`WorkspaceExportSchema`, `kind: 'workspace'`) — never a second format. That choice is the whole
 * design: a preset is loaded by fetching its static JSON and handing the text to the existing
 * import pipeline (`WorkspaceSerializer.importWorkspace`), which brings validation, format
 * migration (Story 5.7) and the atomic destructive replace (Story 5.8) along for free. The
 * replace WARNING is not part of that pipeline: it is Story 5.9's UI, so each preset caller
 * supplies (or deliberately skips) its own. No preset-specific parser may ever exist (FR-9.1).
 *
 * `index.json` is the manifest a future Settings dropdown reads. It exists because the app is a
 * static export — there is no server to enumerate a directory, so the folder must describe itself.
 * `presetWorkspaces.test.ts` beside this file keeps the folder's git-tracked files and the manifest
 * in lockstep (owner ruling D1c) and runs every
 * preset through the production import gate (`validateImportFile`), so a formatVersion bump or a
 * schema change surfaces as a test failure, not as a broken preset in production.
 *
 * Authoring a preset never means writing JSON by hand: build the workspace in the app, use
 * Settings → Export Workspace (Story 5.5), drop the downloaded file here named exactly
 * `<id>.json` for its preset id (owner ruling D2a), run `npx prettier --write apps/web/public/workspaces/` (the raw export is
 * `JSON.stringify(v, null, 2)`, which `format:check` rejects; formatting is the only edit
 * allowed), add a manifest entry naming it (its `description` copied from the envelope's workspace
 * description — set that in Settings → Data Management → Workspace description before exporting),
 * and `git add` it — the lockstep compares the manifest
 * against git-tracked files, so an untracked new preset fails as missing. The same serializer composition may be run
 * headlessly instead of through the UI — that is how the first preset was produced — but the file
 * is always the serializer's output, never hand-edited. To improve an existing preset, import it in
 * the app, edit it in the editors (and the workspace description in Settings), and export again.
 *
 * No runtime consumer exists yet: Story 7.4 is the first reader of `defaultPresetId` (first-visit
 * auto-load), Story 7.5 reads the manifest for the Settings loader, and Story 7.6 addresses a
 * preset by `id` from a shareable link. This module is deliberately just the folder's location and
 * the manifest's shape — no fetch, no loader, no hook, no UI, and no `zod` dependency: the
 * manifest's runtime parse boundary belongs to Story 7.4, the first story that fetches it. Since
 * Story 7.2 each entry's `description` is a projection of its envelope's own workspace
 * description (FR-9.5), pinned equal by the lockstep test — the manifest keeps its copy only so
 * the Settings loader (7.5) can list presets without fetching every envelope.
 *
 * This module never imports anything from `public/` (FD5, Story 7.1) — importing preset JSON into
 * app code would pull every preset into the JS bundle (AR-3 growth gate) and defeat the "drop a
 * file to author" model. Only `presetWorkspaces.test.ts` reads the folder: the presets off disk
 * with `node:fs`, the tracked file list through `git ls-files`.
 */

/**
 * Where the presets are served from, relative to the site root (statically, from `public/`).
 * Root-absolute on purpose: `next.config.mjs` sets no `basePath` (the site is served from a
 * custom domain via `public/CNAME`). Adding a `basePath` means prefixing this too.
 */
export const PRESET_WORKSPACES_PATH = '/workspaces';

/** The manifest filename inside {@link PRESET_WORKSPACES_PATH}. */
export const PRESET_MANIFEST_FILE = 'index.json';

/**
 * Preset ids are lowercase kebab slugs (Story 7.1 FD3): one or more `[a-z0-9]` runs joined by
 * single hyphens, no leading/trailing/double hyphen. A slug needs no URL-encoding and cannot
 * smuggle a path segment, which matters because Story 7.6 addresses a preset by id inside a URL.
 * Ids are stable forever once shipped — a shared link names them, so renaming one breaks every
 * link already handed out. Since {@link PresetWorkspaceEntry.file} is required to equal
 * `${id}.json` (owner ruling D2a), this pattern is also what keeps `file` URL-safe.
 */
export const PRESET_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export interface PresetWorkspaceEntry {
  /** Stable slug matching {@link PRESET_ID_PATTERN}; never renamed once shipped. */
  id: string;
  /** Display name for the Settings dropdown. */
  name: string;
  /**
   * One or two sentences for the dropdown / confirmation copy. MUST equal the envelope's own
   * workspace `description` (Story 7.2, FR-9.5) — a projection, never a second source;
   * `presetWorkspaces.test.ts` enforces it.
   */
  description: string;
  /**
   * The envelope's filename inside {@link PRESET_WORKSPACES_PATH} — always exactly `${id}.json`
   * (Story 7.1 owner ruling D2a: one file name per preset, not a free-form string). Because `id`
   * already matches {@link PRESET_ID_PATTERN}, tying `file` to it this way makes `file` URL-safe
   * for free — no separate character-blocklist check is needed. Enforced by
   * `presetWorkspaces.test.ts`.
   */
  file: string;
}

/**
 * The manifest's shape. These types describe data that arrives over the network: never
 * `as PresetWorkspaceManifest` a fetched body. Parse it at the fetch boundary (Story 7.4), as
 * `presetWorkspaces.test.ts` does with its structural checks.
 */
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
