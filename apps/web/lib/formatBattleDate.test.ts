import { describe, expect, it } from 'vitest';
import { formatBattleDate } from './formatBattleDate';

describe('formatBattleDate', () => {
  it('formats a known ISO date as "Mon D, YYYY" in en-US, locale-independent', () => {
    expect(formatBattleDate(new Date('2026-07-20T09:00:00.000Z'))).toBe('Jul 20, 2026');
  });

  it('returns a stable placeholder for an absent createdAt (Story 1.10 AC3, optional field)', () => {
    expect(formatBattleDate(undefined)).toBe('Unknown');
  });
});
