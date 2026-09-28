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
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { validateImportFile } from '@gol/persistence';
import { PRESET_MANIFEST_FILE, type PresetWorkspaceManifest } from './presetManifest';

// process.cwd(), not import.meta.url — the jsdom environment rewrites module URLs to an http
// scheme, so fileURLToPath throws here. Vitest always runs with cwd = apps/web (the workspace
// that owns this config), which makes the public/ path stable.
const PRESETS_DIR = join(process.cwd(), 'public', 'workspaces');

const manifest = JSON.parse(
  readFileSync(join(PRESETS_DIR, PRESET_MANIFEST_FILE), 'utf8'),
) as PresetWorkspaceManifest;

const envelopeFiles = readdirSync(PRESETS_DIR).filter(
  (f) => f.endsWith('.json') && f !== PRESET_MANIFEST_FILE,
);

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

  it('lists exactly the envelope files present in the folder — no orphans in either direction', () => {
    const listed = manifest.workspaces.map((w) => w.file).sort();
    expect(listed).toEqual([...envelopeFiles].sort());
  });
});

describe('preset workspace envelopes', () => {
  // Static, not it.each over envelopeFiles: an empty folder must fail the manifest test above,
  // and a per-file loop over zero files would be a green run over nothing.
  it('every preset passes the production import gate (validateImportFile)', () => {
    for (const entry of manifest.workspaces) {
      const fileText = readFileSync(join(PRESETS_DIR, entry.file), 'utf8');
      // Throws ImportError on any invalid file — the assertion is that it does not.
      const envelope = validateImportFile(fileText);
      expect(envelope.kind, `${entry.file} must be a whole-workspace envelope`).toBe('workspace');
    }
  });
});
