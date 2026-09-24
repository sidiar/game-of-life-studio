import { afterEach, describe, expect, it } from 'vitest';
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

  describe('in a zone whose local day differs from UTC', () => {
    const originalTz = process.env.TZ;
    afterEach(() => {
      if (originalTz === undefined) delete process.env.TZ;
      else process.env.TZ = originalTz;
    });

    it('names the file by the LOCAL day, so a switch to getUTC* fails even on a UTC CI runner', () => {
      // Node re-reads TZ on assignment. 11:30 UTC on Jan 5 is 01:30 on Jan 6 in UTC+14 — the only
      // shape of test that can tell getDate() from getUTCDate() when the runner itself is UTC.
      process.env.TZ = 'Pacific/Kiritimati';
      expect(workspaceExportFilename(new Date('2026-01-05T11:30:00.000Z'))).toBe(
        'game-of-life-workspace-2026-01-06.json',
      );
    });
  });
});
