import { describe, expect, it } from 'vitest';
import type { BattleSummary } from './battleSchema';
import { buildUsageIndex, resolveOrganismUsage, type OpenBattleUsage } from './usageIndex';

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

// The open battle's placed set, as the CALLER computes it (never a grid — see `OpenBattleUsage`).
const openBattle = (id: string | null, organismIds: string[]): OpenBattleUsage => ({
  id,
  organismIds,
});

describe('resolveOrganismUsage', () => {
  it('returns one non-open entry per saved battle, in index order, when no battle is open (the derivation degrades to buildUsageIndex)', () => {
    const index = buildUsageIndex([
      summary('battle-1', ['shared']),
      summary('battle-2', ['shared']),
    ]);

    expect(resolveOrganismUsage(index, 'shared')).toEqual([
      { battleId: 'battle-1', placedOnLiveGrid: false },
      { battleId: 'battle-2', placedOnLiveGrid: false },
    ]);
  });

  it('treats an explicit null openBattle exactly as an omitted one (the caller passes the open battle or nothing)', () => {
    const index = buildUsageIndex([summary('battle-1', ['shared'])]);

    expect(resolveOrganismUsage(index, 'shared', null)).toEqual(
      resolveOrganismUsage(index, 'shared'),
    );
  });

  it('returns no entry for an organism in neither the index nor the open battle (Story 4.21 blocks on `entries.length > 0`)', () => {
    const index = buildUsageIndex([summary('battle-1', ['placed'])]);

    expect(resolveOrganismUsage(index, 'never-placed', openBattle('battle-1', ['placed']))).toEqual(
      [],
    );
  });

  it('ignores an open battle that places nothing of this organism (an open battle is not itself usage — Decision H.2)', () => {
    const index = buildUsageIndex([summary('battle-1', ['shared'])]);

    expect(resolveOrganismUsage(index, 'shared', openBattle('battle-9', ['other']))).toEqual([
      { battleId: 'battle-1', placedOnLiveGrid: false },
    ]);
  });

  it('adds exactly one open entry carrying the open battle id for an organism on no saved battle (M7 — a battle open in a session counts too)', () => {
    const index = buildUsageIndex([summary('battle-1', ['other'])]);

    expect(resolveOrganismUsage(index, 'fresh', openBattle('battle-9', ['fresh']))).toEqual([
      { battleId: 'battle-9', placedOnLiveGrid: true },
    ]);
  });

  it('carries battleId null when the open battle has never been saved (the caller labels that entry, RFC-005 Decision 8)', () => {
    const index = buildUsageIndex([]);

    expect(resolveOrganismUsage(index, 'fresh', openBattle(null, ['fresh']))).toEqual([
      { battleId: null, placedOnLiveGrid: true },
    ]);
  });

  it('flags the saved entry rather than appending a second one when the open battle is already in the index (deduped by battle id, Decision H.3)', () => {
    const index = buildUsageIndex([
      summary('battle-1', ['shared']),
      summary('battle-2', ['shared']),
    ]);

    expect(resolveOrganismUsage(index, 'shared', openBattle('battle-2', ['shared']))).toEqual([
      { battleId: 'battle-1', placedOnLiveGrid: false },
      { battleId: 'battle-2', placedOnLiveGrid: true },
    ]);
  });

  it('keeps the saved entry for the open battle after its cells are erased but not yet saved (Decision H.3 — FR-1.4 asks for erase AND save)', () => {
    const index = buildUsageIndex([summary('battle-1', ['shared'])]);

    expect(resolveOrganismUsage(index, 'shared', openBattle('battle-1', []))).toEqual([
      { battleId: 'battle-1', placedOnLiveGrid: false },
    ]);
  });

  it('returns a fresh array that does not alias the index (the index is reused across reads)', () => {
    const index = buildUsageIndex([summary('battle-1', ['shared'])]);

    expect(resolveOrganismUsage(index, 'shared')).not.toBe(index.get('shared'));
  });
});
