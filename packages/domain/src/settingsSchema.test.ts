import { describe, expect, it } from 'vitest';
import { CURRENT_FORMAT_VERSION, DEFAULT_SETTINGS, SettingsSchema } from './settingsSchema';

describe('SettingsSchema', () => {
  it('parses an empty object into the full default record (fresh install has no stored key)', () => {
    // A fresh install has no gol:settings key at all, so the repository parses {} and must get a
    // complete record back rather than a bag of undefined (RFC-006 Decision 7).
    expect(SettingsSchema.parse({})).toEqual(DEFAULT_SETTINGS);
  });

  it('defaults auto-save to disabled — FR-8.11 is explicitly opt-in', () => {
    expect(DEFAULT_SETTINGS.autoSave).toBe(false);
  });

  it('backfills only the absent fields of a partial record written by an older build', () => {
    const parsed = SettingsSchema.parse({ theme: 'biotech-terminal', gridLines: false });

    expect(parsed.theme).toBe('biotech-terminal');
    expect(parsed.gridLines).toBe(false);
    // Untouched fields still arrive populated — this is what keeps a record written before a
    // field existed loadable by the build that added it.
    expect(parsed.cellAnimation).toBe(true);
    expect(parsed.defaultSpeed).toBe(10);
  });

  it('rejects an unknown theme', () => {
    expect(SettingsSchema.safeParse({ theme: 'midnight' }).success).toBe(false);
  });

  it('rejects a speed outside the FR-4.2 gen/sec ladder', () => {
    expect(SettingsSchema.safeParse({ defaultSpeed: 15 }).success).toBe(false);
  });

  it('rejects a default grid size that is not an editable preset', () => {
    // 150x90 is Play-mode ephemeral expansion — it must never reach a persisted schema (H-9).
    expect(SettingsSchema.safeParse({ defaultGridSize: { cols: 150, rows: 90 } }).success).toBe(
      false,
    );
  });
});

describe('DEFAULT_SETTINGS', () => {
  it('carries the FR-8.6-8.12 documented defaults', () => {
    expect(DEFAULT_SETTINGS).toEqual({
      theme: 'clinical-lab',
      gridLines: true,
      cellAnimation: true,
      defaultGridSize: { cols: 100, rows: 60 },
      autoSave: false,
      defaultSpeed: 10,
    });
  });
});

describe('CURRENT_FORMAT_VERSION', () => {
  it('is 1 — the initial at-rest format stamped into gol:schema', () => {
    expect(CURRENT_FORMAT_VERSION).toBe(1);
  });
});
