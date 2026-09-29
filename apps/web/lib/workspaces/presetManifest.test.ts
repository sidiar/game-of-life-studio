import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PRESET_MANIFEST_FILE, PresetWorkspaceManifestSchema } from './presetManifest';

const SHIPPED_MANIFEST = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'public',
  'workspaces',
  PRESET_MANIFEST_FILE,
);

const entry = (id: string, overrides: Record<string, unknown> = {}) => ({
  id,
  name: 'A preset',
  description: 'Something to watch.',
  file: `${id}.json`,
  ...overrides,
});

describe('PresetWorkspaceManifestSchema', () => {
  it('accepts the shipped index.json', () => {
    const raw: unknown = JSON.parse(readFileSync(SHIPPED_MANIFEST, 'utf8'));
    expect(PresetWorkspaceManifestSchema.safeParse(raw).success).toBe(true);
  });

  it('accepts a minimal well-formed manifest and returns it unchanged', () => {
    const manifest = { defaultPresetId: 'a-b', workspaces: [entry('a-b'), entry('c')] };
    expect(PresetWorkspaceManifestSchema.parse(manifest)).toEqual(manifest);
  });

  it.each([
    ['uppercase', 'Colony'],
    ['leading hyphen', '-colony'],
    ['double hyphen', 'colony--clash'],
    ['path segment', '../colony'],
    ['empty', ''],
  ])('rejects an id that is not a kebab slug (%s)', (_label, id) => {
    const manifest = { defaultPresetId: id, workspaces: [entry(id)] };
    expect(PresetWorkspaceManifestSchema.safeParse(manifest).success).toBe(false);
  });

  it('rejects an entry whose file is not `${id}.json`', () => {
    const manifest = {
      defaultPresetId: 'colony',
      workspaces: [entry('colony', { file: 'other.json' })],
    };
    expect(PresetWorkspaceManifestSchema.safeParse(manifest).success).toBe(false);
  });

  it('rejects an entry whose file would be the manifest itself', () => {
    const manifest = { defaultPresetId: 'index', workspaces: [entry('index')] };
    expect(PresetWorkspaceManifestSchema.safeParse(manifest).success).toBe(false);
  });

  it('rejects a defaultPresetId that names no listed entry', () => {
    const manifest = { defaultPresetId: 'missing', workspaces: [entry('colony')] };
    const result = PresetWorkspaceManifestSchema.safeParse(manifest);
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((i) => i.path.join('.'))).toContain('defaultPresetId');
  });

  it('rejects duplicate ids', () => {
    const manifest = { defaultPresetId: 'colony', workspaces: [entry('colony'), entry('colony')] };
    expect(PresetWorkspaceManifestSchema.safeParse(manifest).success).toBe(false);
  });

  it('rejects a blank name or description', () => {
    for (const field of ['name', 'description']) {
      const manifest = {
        defaultPresetId: 'colony',
        workspaces: [entry('colony', { [field]: ' ' })],
      };
      expect(PresetWorkspaceManifestSchema.safeParse(manifest).success, field).toBe(false);
    }
  });

  it('rejects an empty workspace list', () => {
    expect(
      PresetWorkspaceManifestSchema.safeParse({ defaultPresetId: 'x', workspaces: [] }).success,
    ).toBe(false);
  });

  it.each([null, [], 'index', 42, {}])('rejects a non-manifest value (%j)', (value) => {
    expect(PresetWorkspaceManifestSchema.safeParse(value).success).toBe(false);
  });
});
