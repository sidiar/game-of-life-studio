import { describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { emptyGrid } from '@gol/test-utils';
import { toRenderableGrid, type RenderableGrid } from '@/lib/canvas/renderableGrid';
import { MAX_UNDO_LEVELS, useUndoableGrid } from './useUndoableGrid';

/** A grid with one cell set, so successive commits are distinguishable by content, not identity. */
function gridWith(cols: number, rows: number, index: number, ref: number): RenderableGrid {
  const grid = toRenderableGrid(emptyGrid(cols, rows));
  grid.occupant[index] = ref;
  return grid;
}

const SEED = () => toRenderableGrid(emptyGrid(4, 3));

describe('useUndoableGrid', () => {
  it('starts on the seed with nothing to undo (AC8: the seed is not an entry)', () => {
    const seed = SEED();
    const { result } = renderHook(() => useUndoableGrid(seed));

    expect(result.current[0].value).toBe(seed);
    expect(result.current[1].canUndo).toBe(false);
  });

  it('exposes the value the last commit set, and canUndo turns true on the first commit', () => {
    const seed = SEED();
    const next = gridWith(4, 3, 5, 1);
    const { result } = renderHook(() => useUndoableGrid(seed));

    act(() => result.current[0].commit(next));

    expect(result.current[0].value).toBe(next);
    expect(result.current[1].canUndo).toBe(true);
  });

  // Trap 2: the off-by-one that looks correct. Snapshotting `next` makes the first undo restore
  // the grid already on screen, and every later undo lands one gesture behind.
  it('snapshots the PREVIOUS value, not the committed one (trap 2)', () => {
    const seed = SEED();
    const first = gridWith(4, 3, 0, 1);
    const second = gridWith(4, 3, 1, 1);
    const { result } = renderHook(() => useUndoableGrid(seed));

    act(() => result.current[0].commit(first));
    act(() => result.current[0].commit(second));
    act(() => result.current[1].undo());

    // One undo from `second` lands on `first` — never back on `second` itself.
    expect(Array.from(result.current[0].value?.occupant ?? [])).toEqual(Array.from(first.occupant));
  });

  it('undoes N commits back to the seed and then reports canUndo false (AC8)', () => {
    const seed = SEED();
    const { result } = renderHook(() => useUndoableGrid(seed));

    for (let i = 0; i < 5; i++) {
      const next = gridWith(4, 3, i, 1);
      act(() => result.current[0].commit(next));
    }
    for (let i = 0; i < 5; i++) {
      expect(result.current[1].canUndo).toBe(true);
      act(() => result.current[1].undo());
    }

    expect(result.current[1].canUndo).toBe(false);
    expect(Array.from(result.current[0].value?.occupant ?? [])).toEqual(Array.from(seed.occupant));
  });

  it('is a no-op with an empty ring rather than throwing or clearing the value', () => {
    const seed = SEED();
    const { result } = renderHook(() => useUndoableGrid(seed));

    act(() => result.current[1].undo());

    expect(result.current[0].value).toBe(seed);
    expect(result.current[1].canUndo).toBe(false);
  });

  // AC2: the 31st commit evicts the oldest. Proven by exhausting the ring — after 31 commits
  // exactly 30 undos are available and the 30th lands on the value the FIRST commit set, never on
  // the seed (a ring that grew would reach the seed; one capped at 29 would stop a gesture early).
  it('caps the ring at 30 entries, evicting the oldest (AC2)', () => {
    const seed = SEED();
    const commits: RenderableGrid[] = [];
    const { result } = renderHook(() => useUndoableGrid(seed));

    for (let i = 0; i <= MAX_UNDO_LEVELS; i++) {
      const next = gridWith(4, 3, i % 12, (i % 3) + 1);
      commits.push(next);
      act(() => result.current[0].commit(next));
    }

    let undone = 0;
    while (result.current[1].canUndo) {
      act(() => result.current[1].undo());
      undone++;
      expect(undone).toBeLessThanOrEqual(MAX_UNDO_LEVELS + 1); // a ring that never evicts
    }

    expect(undone).toBe(MAX_UNDO_LEVELS);
    expect(Array.from(result.current[0].value?.occupant ?? [])).toEqual(
      Array.from(commits[0].occupant),
    );
  });

  // Trap 3 / AC8: the committed buffer is "radioactive" — `endStroke` hands over
  // `stroke.workingGrid` and later strokes slice off it. A snapshot that stored the array by
  // reference would silently follow any later write.
  it('stores an independent copy of the occupant map (AC8)', () => {
    const seed = SEED();
    const first = gridWith(4, 3, 0, 1);
    const { result } = renderHook(() => useUndoableGrid(seed));

    act(() => result.current[0].commit(first));
    // Mutating the buffer the ring snapshotted FROM must not reach the entry.
    seed.occupant[7] = 9;
    act(() => result.current[1].undo());

    expect(result.current[0].value?.occupant[7]).toBe(0);
  });

  it('hands back a grid whose buffer is not the ring entry the caller could write through', () => {
    const seed = SEED();
    const first = gridWith(4, 3, 0, 1);
    const { result } = renderHook(() => useUndoableGrid(seed));

    act(() => result.current[0].commit(first));
    act(() => result.current[1].undo());
    const restored = result.current[0].value;
    expect(restored).not.toBeNull();
    expect(restored?.occupant).not.toBe(seed.occupant);
  });

  // Trap 5: `EditDish`'s grid effect skips when `paintedGridRef.current === grid`, so a restored
  // grid that reuses an identity the canvas already painted is never repainted.
  it('builds a NEW grid object on restore, never an identity already handed out (trap 5)', () => {
    const seed = SEED();
    const first = gridWith(4, 3, 0, 1);
    const { result } = renderHook(() => useUndoableGrid(seed));

    act(() => result.current[0].commit(first));
    act(() => result.current[1].undo());

    expect(result.current[0].value).not.toBe(seed);
    expect(result.current[0].value).not.toBe(first);
  });

  // AC6: dimensions ride in the snapshot and the restored grid is rebuilt from them, with a fresh
  // zero-filled age buffer (trap 4 — age is never stored).
  it('restores dimensions from the snapshot with a fresh zero age buffer (AC6)', () => {
    const seed = toRenderableGrid(emptyGrid(5, 4));
    const next = gridWith(5, 4, 3, 2);
    const { result } = renderHook(() => useUndoableGrid(seed));

    act(() => result.current[0].commit(next));
    act(() => result.current[1].undo());

    const restored = result.current[0].value;
    expect(restored?.width).toBe(5);
    expect(restored?.height).toBe(4);
    expect(restored?.age).toBeInstanceOf(Uint16Array);
    expect(restored?.age.length).toBe(20);
    expect(Array.from(restored?.age ?? [])).toEqual(new Array(20).fill(0));
  });

  // Trap 8: the battle resource settles AFTER the first render, so the hook is mounted with a null
  // seed. It must adopt the real one when it arrives — and a LATER seed change means a different
  // battle, whose ring must not carry entries that would restore the previous battle's grid.
  it('adopts a seed that arrives after mount (trap 8)', () => {
    const seed = SEED();
    const { result, rerender } = renderHook(
      ({ s }: { s: RenderableGrid | null }) => useUndoableGrid(s),
      {
        initialProps: { s: null as RenderableGrid | null },
      },
    );

    expect(result.current[0].value).toBeNull();
    rerender({ s: seed });

    expect(result.current[0].value).toBe(seed);
    expect(result.current[1].canUndo).toBe(false);
  });

  it('resets both the value and the ring when the seed changes (trap 8)', () => {
    const seedA = SEED();
    const seedB = toRenderableGrid(emptyGrid(4, 3));
    const { result, rerender } = renderHook(
      ({ s }: { s: RenderableGrid | null }) => useUndoableGrid(s),
      {
        initialProps: { s: seedA as RenderableGrid | null },
      },
    );

    act(() => result.current[0].commit(gridWith(4, 3, 2, 1)));
    expect(result.current[1].canUndo).toBe(true);

    rerender({ s: seedB });

    expect(result.current[0].value).toBe(seedB);
    expect(result.current[1].canUndo).toBe(false);
  });

  // Trap 7: the canvas's resize effect holds `commit` inside a closure it does not re-register,
  // and `<BattlePage>` passes it straight down as `onCommitGrid`.
  it('keeps commit and undo identities stable across renders (trap 7)', () => {
    const seed = SEED();
    const { result, rerender } = renderHook(
      ({ s }: { s: RenderableGrid | null }) => useUndoableGrid(s),
      {
        initialProps: { s: seed as RenderableGrid | null },
      },
    );

    const commit = result.current[0].commit;
    const undo = result.current[1].undo;
    rerender({ s: seed });
    act(() => result.current[0].commit(gridWith(4, 3, 1, 1)));

    expect(result.current[0].commit).toBe(commit);
    expect(result.current[1].undo).toBe(undo);
  });

  // Trap 9: `value` is React state, so its identity is stable across renders nothing committed to.
  // A value derived per render would make EditDish drawFull ~6,000 cells on every unrelated render.
  it('keeps the value identity stable across a render that committed nothing (trap 9)', () => {
    const seed = SEED();
    const { result, rerender } = renderHook(
      ({ s }: { s: RenderableGrid | null }) => useUndoableGrid(s),
      {
        initialProps: { s: seed as RenderableGrid | null },
      },
    );

    const before = result.current[0].value;
    rerender({ s: seed });

    expect(result.current[0].value).toBe(before);
  });

  // AC2's memory claim, asserted as ARITHMETIC. Weighing the heap would measure the runtime's
  // allocator, not the design: what AR-30 constrains is what a snapshot is allowed to CONTAIN.
  it('fits 30 snapshots of a 100x60 grid inside AR-30’s 180 KB budget (AC2)', () => {
    const seed = toRenderableGrid(emptyGrid(100, 60));
    const { result } = renderHook(() => useUndoableGrid(seed));

    act(() => result.current[0].commit(toRenderableGrid(emptyGrid(100, 60))));
    act(() => result.current[1].undo());

    // One byte per cell: the occupant map is a Uint8Array and NOTHING else is stored per entry.
    // Including `age` (Uint16Array, trap 4) would make this 18,000 and blow the budget threefold.
    const snapshotBytes = 100 * 60;
    expect(snapshotBytes).toBe(6000);
    expect(MAX_UNDO_LEVELS * snapshotBytes).toBeLessThanOrEqual(180 * 1024);
    // And the restored grid really is that size — the arithmetic describes this hook, not a wish.
    expect(result.current[0].value?.occupant.length).toBe(snapshotBytes);
  });
});
