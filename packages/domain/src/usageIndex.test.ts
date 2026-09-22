import { describe, expect, it } from 'vitest';
import type { BattleSummary } from './battleSchema';
import { buildUsageIndex } from './usageIndex';

// Minimal literals — `Pick<BattleSummary, 'id' | 'organismIds'>` is the input type precisely so a
// test needs neither a grid nor a timestamp to describe a battle's placed set.
const summary = (id: string, organismIds: string[]): Pick<BattleSummary, 'id' | 'organismIds'> => ({
  id,
  organismIds,
});

describe('buildUsageIndex', () => {
  it('maps an organism placed in two battles to both battle ids, in input order', () => {
    const index = buildUsageIndex([
      summary('battle-1', ['shared', 'only-in-1']),
      summary('battle-2', ['shared']),
    ]);

    expect(index.get('shared')).toEqual(['battle-1', 'battle-2']);
    expect(index.get('only-in-1')).toEqual(['battle-1']);
  });

  it('has no entry for an organism placed in no battle (the caller reads `?.length ?? 0`)', () => {
    const index = buildUsageIndex([summary('battle-1', ['placed'])]);

    expect(index.get('never-placed')).toBeUndefined();
    expect(index.get('never-placed')?.length ?? 0).toBe(0);
  });

  it('counts a battle once when its organismIds repeats an id (no duplicate refine on the summary)', () => {
    const index = buildUsageIndex([summary('battle-1', ['a', 'a'])]);

    expect(index.get('a')).toEqual(['battle-1']);
  });

  it('returns an empty map for no summaries', () => {
    expect(buildUsageIndex([]).size).toBe(0);
  });

  it('accepts a full BattleSummary without narrowing', () => {
    const full: BattleSummary = {
      id: 'b7a1c2d4-5b6e-4f7a-8c9d-0e1f2a3b4c5d',
      name: 'Full',
      gridSize: { cols: 50, rows: 30 },
      organismIds: ['x'],
      updatedAt: new Date('2026-07-20T09:00:00.000Z'),
    };

    expect(buildUsageIndex([full]).get('x')).toEqual([full.id]);
  });
});
