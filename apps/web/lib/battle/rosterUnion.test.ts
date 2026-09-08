import { describe, expect, it } from 'vitest';
import { buildRefToFillGroup, MAX_ROSTER_SIZE } from '@/lib/canvas/refToFillGroup';
import { buildRosterIds } from './rosterUnion';

describe('buildRosterIds', () => {
  it('puts the battle’s own organismIds first, in their stored order', () => {
    expect(buildRosterIds(['a', 'b', 'c'], [])).toEqual(['a', 'b', 'c']);
  });

  it('appends a session entry that is not already placed', () => {
    expect(buildRosterIds(['a', 'b'], ['z'])).toEqual(['a', 'b', 'z']);
  });

  it('de-duplicates a session entry the battle already placed, without moving it', () => {
    expect(buildRosterIds(['a', 'b'], ['a'])).toEqual(['a', 'b']);
  });

  it('never mutates the caller’s arrays (they are the loaded Battle record’s own)', () => {
    const battleIds = ['a', 'b'];
    const session = ['z'];

    const union = buildRosterIds(battleIds, session);

    expect(battleIds).toEqual(['a', 'b']);
    expect(session).toEqual(['z']);
    expect(union).not.toBe(battleIds);
  });
});

// AC9 / trap 1. The undo ring and every placed cell are keyed on an entry's INDEX (`cell = roster
// index + 1`, RFC-006 Decision 2), so this is the invariant that a roster sort would break with
// no error anywhere. Asserted directly rather than inferred from a rendering test, because the
// symptom of breaking it is silently-wrong colours, not a failure.
describe('buildRosterIds — the append-only invariant (AC9)', () => {
  it('keeps every pre-existing entry at the index it already had, across a roster change', () => {
    const before = buildRosterIds(['a', 'b', 'c'], []);
    const after = buildRosterIds(['a', 'b', 'c'], ['z', 'y']);

    // Not `toContain`: the claim is about POSITION. A sorted union still contains every id.
    for (const [index, id] of before.entries()) expect(after[index]).toBe(id);
    expect(after).toEqual(['a', 'b', 'c', 'z', 'y']);
  });

  it('removes nothing when the session roster grows', () => {
    const before = buildRosterIds(['a', 'b'], ['z']);
    const after = buildRosterIds(['a', 'b'], ['z', 'y']);

    expect(after.slice(0, before.length)).toEqual([...before]);
    expect(after.length).toBeGreaterThan(before.length);
  });

  it('does not reorder the battle’s ids to match the session roster’s order', () => {
    // The session lists them in the OPPOSITE order — a union built session-first, or one that
    // sorted, would put 'b' at index 0 and repaint every 'a' cell as 'b'.
    expect(buildRosterIds(['a', 'b'], ['b', 'a'])).toEqual(['a', 'b']);
  });
});

// AC8 / trap 7. `buildRefToFillGroup` throws above the cap, inside a render-phase `useMemo`.
describe('buildRosterIds — the 255 cap (AC8, Decision G.3)', () => {
  const CAPPED = Array.from({ length: MAX_ROSTER_SIZE }, (_, i) => `organism-${i}`);

  it('drops a session entry that would make the union a 256th', () => {
    const union = buildRosterIds(CAPPED, ['one-too-many']);

    expect(union).toHaveLength(MAX_ROSTER_SIZE);
    expect(union).not.toContain('one-too-many');
  });

  it('produces a union buildRefToFillGroup accepts, where the unguarded append threw (AC8)', () => {
    // The pre-2.9 behaviour, pinned so the guard's absence is what fails here: a raw append over
    // a full roster is exactly what tore the editor down.
    expect(() => buildRefToFillGroup([...CAPPED, 'one-too-many'], new Map())).toThrow(
      /exceeds the 255-organism cap/,
    );

    expect(() =>
      buildRefToFillGroup(buildRosterIds(CAPPED, ['one-too-many']), new Map()),
    ).not.toThrow();
  });

  it('still de-duplicates at the cap rather than dropping an already-placed id', () => {
    const union = buildRosterIds(CAPPED, [CAPPED[0]]);

    expect(union).toEqual(CAPPED);
  });

  it('fills the last free slot when the roster is one short of the cap', () => {
    const oneShort = CAPPED.slice(0, MAX_ROSTER_SIZE - 1);

    const union = buildRosterIds(oneShort, ['last', 'dropped']);

    expect(union).toHaveLength(MAX_ROSTER_SIZE);
    expect(union[MAX_ROSTER_SIZE - 1]).toBe('last');
    expect(union).not.toContain('dropped');
  });
});
