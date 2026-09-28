/**
 * The lockstep gate for `public/workspaces/` (see presetManifest.ts for the folder's contract).
 *
 * Reads the REAL folder off disk — no fixtures — so a preset that rots (schema change,
 * formatVersion bump, hand-edited JSON) or a folder/manifest mismatch fails CI here rather than
 * shipping as a preset that explodes at import time in production. `validateImportFile` is the
 * exact gate `importWorkspace` runs (parse → migrate → schema → unsafe-id guard → referential
 * closure), so passing here IS passing the production import, minus only the repository writes.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { validateImportFile } from '@gol/persistence';
import { PRESET_ID_PATTERN, PRESET_MANIFEST_FILE } from './presetManifest';

// `dirname(fileURLToPath(...))`, the idiom `app/routes.test.ts` uses and explains: resolving the
// filename first and then taking its directory avoids `new URL('.', import.meta.url)`, which can
// throw under Vitest's module loader when import.meta.url is not yet a file:// URL.
const LIB_DIR = dirname(fileURLToPath(import.meta.url));
const PRESETS_DIR = join(LIB_DIR, '..', '..', 'public', 'workspaces');

type ManifestEntry = { id: string; name: string; description: string; file: string };

/** Reads and parses a file with a message that names it, not a bare ENOENT / SyntaxError. */
function readJson(path: string): unknown {
  let text: string;
  try {
    text = readFileSync(path, 'utf8');
  } catch (cause) {
    throw new Error(`cannot read ${path}`, { cause });
  }
  try {
    return JSON.parse(text);
  } catch (cause) {
    throw new Error(`${path} is not valid JSON`, { cause });
  }
}

/** Asserts the manifest's shape, entries included, before trusting it. A hand-edited manifest
 * missing a field or holding a non-object entry must fail with a readable message here, not a
 * `TypeError` two lines down. */
function readManifest(): { defaultPresetId: string; workspaces: ManifestEntry[] } {
  const raw = readJson(join(PRESETS_DIR, PRESET_MANIFEST_FILE));
  expect(
    raw !== null && typeof raw === 'object' && !Array.isArray(raw),
    'index.json must contain a JSON object',
  ).toBe(true);
  const manifest = raw as Record<string, unknown>;
  expect(typeof manifest.defaultPresetId, 'index.json.defaultPresetId must be a string').toBe(
    'string',
  );
  expect(Array.isArray(manifest.workspaces), 'index.json.workspaces must be an array').toBe(true);
  for (const entry of manifest.workspaces as unknown[]) {
    expect(
      entry !== null && typeof entry === 'object' && !Array.isArray(entry),
      `manifest entry ${JSON.stringify(entry)} must be an object`,
    ).toBe(true);
    for (const field of ['id', 'name', 'description', 'file'] as const) {
      expect(
        typeof (entry as Record<string, unknown>)[field],
        `manifest entry ${JSON.stringify(entry)} field "${field}" must be a string`,
      ).toBe('string');
    }
  }
  return manifest as { defaultPresetId: string; workspaces: ManifestEntry[] };
}

/** Values that occur more than once, so a failure names them instead of "expected 1 to be 2". */
function duplicates(values: string[]): string[] {
  return [...new Set(values.filter((v, i) => values.indexOf(v) !== i))];
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
    expect(duplicates(manifest.workspaces.map((w) => w.id)), 'duplicate preset ids').toEqual([]);
    expect(duplicates(manifest.workspaces.map((w) => w.file)), 'duplicate preset files').toEqual(
      [],
    );
  });

  it('every id is a lowercase kebab slug (PRESET_ID_PATTERN) — Story 7.6 addresses a preset by id in a URL', () => {
    for (const entry of manifest.workspaces) {
      expect(entry.id, `manifest entry id "${entry.id}"`).toMatch(PRESET_ID_PATTERN);
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
      const file = entry.file;
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
    const listed = manifest.workspaces.map((w) => w.file).sort();
    // Every folder entry other than index.json, any extension — a stray notes.txt or a
    // mis-extensioned preset.JSON must fail here, not ship silently (FD6).
    expect([...folderEntries].sort()).toEqual(listed);
  });
});

describe('preset workspace envelopes', () => {
  // Static, not it.each over folderEntries: an empty folder must fail the manifest test above,
  // and a per-file loop over zero files would be a green run over nothing.
  it('every preset passes the production import gate (validateImportFile)', () => {
    const failures: string[] = [];
    for (const entry of manifest.workspaces) {
      try {
        const fileText = readFileSync(join(PRESETS_DIR, entry.file), 'utf8');
        // Throws ImportError on any invalid file; that error carries no file name, so it is
        // collected under the preset's file and every bad preset is reported, not just the first.
        const envelope = validateImportFile(fileText);
        if (envelope.kind !== 'workspace') {
          failures.push(
            `${entry.file}: kind "${envelope.kind}", expected a whole-workspace envelope`,
          );
        }
      } catch (error) {
        failures.push(`${entry.file}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    expect(failures, `presets failing the import gate:\n${failures.join('\n')}`).toEqual([]);
  });
});
