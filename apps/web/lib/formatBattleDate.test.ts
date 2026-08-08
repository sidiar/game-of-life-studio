import { describe, expect, it } from 'vitest';
import { formatBattleDate } from './formatBattleDate';

describe('formatBattleDate', () => {
  it('formats a known ISO date as "Mon D, YYYY" in en-US', () => {
    expect(formatBattleDate(new Date('2026-07-20T09:00:00.000Z'))).toBe('Jul 20, 2026');
  });

  // The formatter pins timeZone: 'UTC' precisely so this holds. With the host zone, a 09:00Z
  // instant renders as the previous calendar day anywhere at UTC-10 or further west, and a
  // 23:00Z instant as the next day east of UTC+1 — the assertion would pass on a UTC CI runner
  // and fail on a developer machine, or vice versa.
  it('is stable across host timezones at both ends of the UTC day', () => {
    expect(formatBattleDate(new Date('2026-07-20T00:30:00.000Z'))).toBe('Jul 20, 2026');
    expect(formatBattleDate(new Date('2026-07-20T23:30:00.000Z'))).toBe('Jul 20, 2026');
  });
});
