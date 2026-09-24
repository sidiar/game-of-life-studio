import { describe, expect, it } from 'vitest';
import { workspaceExportFilename } from './workspaceExportFilename';

describe('workspaceExportFilename', () => {
  it('zero-pads a single-digit month and day', () => {
    expect(workspaceExportFilename(new Date(2026, 0, 5, 9, 30))).toBe(
      'game-of-life-workspace-2026-01-05.json',
    );
  });

  it('keeps a two-digit month and day as-is', () => {
    expect(workspaceExportFilename(new Date(2026, 11, 31, 14, 0))).toBe(
      'game-of-life-workspace-2026-12-31.json',
    );
  });

  it('uses the LOCAL calendar date, not UTC, for a late-evening local time', () => {
    // Built from local components (never a UTC ISO string) — the test does not depend on the
    // runner's time zone: whatever zone runs it, 23:45 local on Jan 5 is still "Jan 5" locally.
    const lateEvening = new Date(2026, 0, 5, 23, 45);
    expect(lateEvening.getFullYear()).toBe(2026);
    expect(lateEvening.getMonth()).toBe(0);
    expect(lateEvening.getDate()).toBe(5);
    expect(workspaceExportFilename(lateEvening)).toBe('game-of-life-workspace-2026-01-05.json');
  });
});
