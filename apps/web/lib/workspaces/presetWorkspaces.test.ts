/**
 * The lockstep gate for `public/workspaces/` (see presetManifest.ts for the folder's contract).
 *
 * Reads the REAL folder off disk — no fixtures — so a preset that rots (schema change,
 * formatVersion bump, hand-edited JSON) or a folder/manifest mismatch fails CI here rather than
 * shipping as a preset that explodes at import time in production. `validateImportFile` is the
 * exact gate `importWorkspace` runs (parse → migrate → schema → referential closure), so passing
 * here IS passing the production import, minus only the repository writes.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { validateImportFile } from '@gol/persistence';
import { PRESET_ID_PATTERN, PRESET_MANIFEST_FILE } from './presetManifest';

// `dirname(fileURLToPath(...))`, not `new URL('.', import.meta.url)` or `process.cwd()`: this is
// the same idiom `app/routes.test.ts` and `lib/themeTokens.test.ts` already use to read a file off
// disk under this jsdom-environment suite, and it works here too — the PoC's claim that
// `fileURLToPath` throws under jsdom does not hold in this config.
const LIB_DIR = dirname(fileURLToPath(import.meta.url));
const PRESETS_DIR = join(LIB_DIR, '..', '..', 'public', 'workspaces');

/** Asserts the manifest's shape before trusting it — a hand-edited manifest missing a field must
 * fail with a readable message here, not a `TypeError` two lines down. */
function readManifest(): { defaultPresetId: string; workspaces: Record<string, unknown>[] } {
  const raw: unknown = JSON.parse(readFileSync(join(PRESETS_DIR, PRESET_MANIFEST_FILE), 'utf8'));
  expect(raw && typeof raw === 'object', 'index.json must contain a JSON object').toBe(true);
  const manifest = raw as Record<string, unknown>;
  expect(typeof manifest.defaultPresetId, 'index.json.defaultPresetId must be a string').toBe(
    'string',
  );
  expect(Array.isArray(manifest.workspaces), 'index.json.workspaces must be an array').toBe(true);
  return manifest as { defaultPresetId: string; workspaces: Record<string, unknown>[] };
}

const manifest = readManifest();

const folderEntries = readdirSync(PRESETS_DIR).filter((f) => f !== PRESET_MANIFEST_FILE);

describe('preset workspace manifest', () => {
  it('has at least one preset, each with a non-empty id, name, description and file', () => {
    expect(manifest.workspaces.length).toBeGreaterThan(0);
    for (const entry of manifest.workspaces) {
      for (const field of ['id', 'name', 'description', 'file'] as const) {
        expect(entry[field], `manifest entry ${JSON.stringify(entry)} field "${field}"`).toMatch(
          /\S/,
        );
      }
    }
  });

  it('never repeats an id or a file — a duplicate would make a future preset URL ambiguous', () => {
    const ids = manifest.workspaces.map((w) => w.id);
    const files = manifest.workspaces.map((w) => w.file);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(files).size).toBe(files.length);
  });

  it('every id is a lowercase kebab slug (PRESET_ID_PATTERN) — Story 7.6 addresses a preset by id in a URL', () => {
    for (const entry of manifest.workspaces) {
      expect(String(entry.id), `manifest entry id "${entry.id}"`).toMatch(PRESET_ID_PATTERN);
    }
  });

  it('defaultPresetId names exactly one listed entry', () => {
    const ids = manifest.workspaces.map((w) => w.id);
    expect(
      ids.filter((id) => id === manifest.defaultPresetId),
      `defaultPresetId "${manifest.defaultPresetId}" must match exactly one entry id; entries: ${ids.join(', ')}`,
    ).toHaveLength(1);
  });

  it('every file ends in .json, is not index.json, and carries no path segment', () => {
    for (const entry of manifest.workspaces) {
      const file = String(entry.file);
      expect(file, `manifest entry file "${file}" must end in .json`).toMatch(/\.json$/);
      expect(file, `manifest entry file "${file}" must not be the manifest itself`).not.toBe(
        PRESET_MANIFEST_FILE,
      );
      expect(
        file,
        `manifest entry file "${file}" must contain no "/", "\\" or ".." — it is concatenated into a fetch URL`,
      ).not.toMatch(/\/|\\|\.\./);
    }
  });

  it('lists exactly the entries present in the folder — no orphans in either direction', () => {
    const listed = manifest.workspaces.map((w) => String(w.file)).sort();
    // Every folder entry other than index.json, any extension — a stray notes.txt or a
    // mis-extensioned preset.JSON must fail here, not ship silently (FD6).
    expect([...folderEntries].sort()).toEqual(listed);
  });
});

describe('preset workspace envelopes', () => {
  // Static, not it.each over folderEntries: an empty folder must fail the manifest test above,
  // and a per-file loop over zero files would be a green run over nothing.
  it('every preset passes the production import gate (validateImportFile)', () => {
    for (const entry of manifest.workspaces) {
      const fileText = readFileSync(join(PRESETS_DIR, String(entry.file)), 'utf8');
      // Throws ImportError on any invalid file — the assertion is that it does not.
      const envelope = validateImportFile(fileText);
      expect(envelope.kind, `${entry.file} must be a whole-workspace envelope`).toBe('workspace');
    }
  });
});
