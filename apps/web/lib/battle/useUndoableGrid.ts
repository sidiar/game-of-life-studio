'use client';

import { useCallback, useMemo, useState } from 'react';
import type { RenderableGrid } from '@/lib/canvas/renderableGrid';

/**
 * FR-3.8 / AR-30: thirty REVERSIBLE GESTURES, not thirty stored values. The ring holds only
 * PREVIOUS values — the current one is `value` and is never an entry — so after N commits there
 * are exactly N entries and N undos land on the seed (trap 6/10). Getting either end of that
 * wrong gives an effective depth of 29, or 31 snapshots at 186 KB.
 */
export const MAX_UNDO_LEVELS = 30;

/**
 * One ring entry: the occupant map and its DIMENSIONS, per RFC-005 Decision 6 — nothing else.
 *
 * ⚠️ No `age`. Every initial grid is age-zero everywhere (RFC-005 "Representation note"), so the
 * age buffer carries no information — but it is a `Uint16Array`, twice the width of the occupant
 * map, so storing it would make a snapshot 18 KB instead of 6 KB and thirty levels 540 KB instead
 * of 176 KB, breaking AR-30's ≤180 KB budget threefold with every test still green. `restore()`
 * rebuilds a zero-filled one instead.
 *
 * ⚠️ The occupant values are dense refs — `roster index + 1` (RFC-006 Decision 2) — not organism
 * ids. An entry is therefore only meaningful while `rosterIds` keeps the ordering it had when the
 * entry was taken. That holds because the roster is APPEND-ONLY (`<BattlePage>`'s union comment
 * forbids reordering); the undo ring is the second thing a reorder would silently corrupt, after
 * the grid itself. ❌ Do not "fix" this by storing organism ids: that is a different encoding, 30×
 * larger, and it contradicts Decision E's runtime-only rule.
 *
 * Spelled `cols`/`rows` — RFC-005 Decision 6's own field names — while `RenderableGrid` spells the
 * same two numbers `width`/`height` (RFC-004 §3.4). The seam is crossed in exactly two places
 * (`snapshot` and `restore` below) and nowhere else, which is the same "make the boundary explicit
 * rather than let two spellings drift" call `assertGridMatchesSize` already documents.
 */
interface GridSnapshot {
  readonly occupant: Uint8Array;
  readonly cols: number;
  readonly rows: number;
}

interface UndoableGridState {
  /** The current initial grid. `null` only before the battle resource has settled. */
  readonly value: RenderableGrid | null;
  /** One call per COMMITTED gesture (paint stroke, erase, and from 2.14/2.15 resize and Clear). */
  commit(next: RenderableGrid): void;
}

interface UndoableGridHistory {
  undo(): void;
  /**
   * A reactive BOOLEAN, deliberately not RFC-005 Decision 6's `canUndo: () => …` snippet form.
   * The RFC's snippet reads the ring out of a `useRef`, so a function over it triggers no
   * re-render and the UNDO button's `disabled` would freeze at its mount value — which cannot
   * satisfy the RFC's own epic AC ("the button is disabled when canUndo is false", FR-3.8).
   * `component-tree-battle-page.md` §4 and §3.8 both declare the boolean; the snippet is
   * illustrative, as several already are. Divergence recorded in the Story 2.8 Dev Agent Record.
   */
  readonly canUndo: boolean;
}

/** One state cell, so the value and its history can never be observed out of step (trap 1). */
interface UndoableGridInternal {
  readonly value: RenderableGrid | null;
  /** Newest LAST. Every entry is a value this hook once held and no longer does. */
  readonly past: readonly GridSnapshot[];
  /**
   * The seed this value and ring were built from. Held IN the state cell rather than in a ref
   * because React's documented "adjusting state when a prop changes" pattern compares the previous
   * prop out of state — and `react-hooks/refs` rejects reading or writing a ref during render
   * outright (a lint error, not a warning, inside a `use*` function). One cell also means the
   * comparison can never be a tick out of step with what it guards.
   */
  readonly seed: RenderableGrid | null;
}

function snapshot(grid: RenderableGrid): GridSnapshot {
  // `.slice()`, never `.subarray()` — subarray returns a VIEW onto the same buffer, which is the
  // one-character version of storing the grid by reference. `endStroke` hands over
  // `stroke.workingGrid` and later strokes slice fresh copies off it, so today nothing writes
  // through a committed buffer — but that is a convention, not a compiler guarantee
  // (`readonly Uint8Array` is readonly on the PROPERTY, not the contents), and 2.14/2.15 add new
  // commit sources. 6 KB removes the whole class.
  return { occupant: grid.occupant.slice(), cols: grid.width, rows: grid.height };
}

function restore(entry: GridSnapshot): RenderableGrid {
  // A NEW object every time. `EditDish`'s grid effect skips when `paintedGridRef.current === grid`
  // (Object.is), so handing back an identity the canvas has already painted would leave the dish
  // showing the undone state while React state holds the restored one — model and view disagreeing
  // silently until some later full repaint. Rebuilding is also what makes the restored grid carry
  // the SNAPSHOT's dimensions rather than the current value's, which is the groundwork Story 2.14
  // (resize) inherits.
  return {
    width: entry.cols,
    height: entry.rows,
    occupant: entry.occupant.slice(),
    age: new Uint16Array(entry.cols * entry.rows),
  };
}

/**
 * The editor's grid state and its undo history, in one hook (RFC-005 Decision 6, AR-30,
 * component-tree-battle-page.md §4). Owned by `<BattlePage>` — the lowest common ancestor of the
 * Lab and Run views — so the history survives Lab↔Run mode switches and dies with the mount when
 * the user returns to the Gallery. **Component lifetime IS the undo lifetime:** there is no reset
 * call, no persistence, no serialisation, and nothing here ever touches a repository.
 *
 * Not in `lib/canvas/`: undo is an editor concept, not a rendering one — the same argument
 * `lib/battle/tool.ts` makes for itself.
 *
 * `seed` is `RenderableGrid | null` rather than spec §4's bare `Grid` because `<BattlePage>`'s
 * battle resource settles AFTER the first render, and every hook there precedes four early
 * returns. `useState(seed)` would capture that first-render `null` forever and leave a permanently
 * blank editor with no error anywhere (trap 8) — so the seed is adopted when it arrives, and a
 * LATER seed change (a different battle) resets the value and the ring together. Carrying entries
 * across a seed change would let undo restore a different battle's grid.
 */
export function useUndoableGrid(
  seed: RenderableGrid | null,
): readonly [UndoableGridState, UndoableGridHistory] {
  const [state, setState] = useState<UndoableGridInternal>(() => ({ value: seed, past: [], seed }));

  // Forced decision 3: the ring lives in `useState` beside the value, NOT in a `useRef` with a
  // separate reactive flag. RFC-005 Decision 6 contradicts itself here — its prose says "a bounded
  // ring … in local state", its snippet puts `past` in a ref — and only the prose can give a
  // `canUndo` that actually re-renders the button. One state cell also means the two can never
  // disagree, which is the failure shape `lib/battle/tool.ts`'s trap 7 warns about. The cost is one
  // ≤30-element array copy per COMMITTED GESTURE (~240 bytes of pointer churn, once per pointer-up
  // — never per pointer-move), which is why the ref version buys nothing worth its second
  // container.

  if (state.seed !== seed) {
    // Setting state during render is deliberate and is React's documented "adjusting state when a
    // prop changes" pattern: React re-runs the body immediately, and the new state carries the new
    // seed so the second pass is a no-op — it cannot loop. An effect would render one frame of the
    // OLD battle's grid first, and `useState(seed)` alone would capture the first render's `null`
    // forever (trap 8).
    setState({ value: seed, past: [], seed });
  }

  const commit = useCallback((next: RenderableGrid) => {
    // A functional update, so the ring this appends to is always the live one — never a ring
    // captured by a closure the canvas's resize effect has been holding since mount (trap 7).
    setState((prev) => {
      // Nothing to snapshot before the seed has arrived. Unreachable from the editor (nothing
      // renders the canvas while `value` is null), and it must not push a null-shaped entry if it
      // ever becomes reachable.
      if (prev.value === null) return { ...prev, value: next, past: [] };
      // Snapshot the CURRENT value, never `next` (trap 2). Snapshotting `next` makes the first
      // undo restore the grid already on screen — so it looks like it worked — and every later
      // undo land one gesture behind.
      const entry = snapshot(prev.value);
      const past =
        prev.past.length < MAX_UNDO_LEVELS
          ? [...prev.past, entry]
          : // FIFO eviction: drop the oldest so the ring is exactly MAX_UNDO_LEVELS again.
            [...prev.past.slice(prev.past.length - MAX_UNDO_LEVELS + 1), entry];
      return { ...prev, value: next, past };
    });
  }, []);

  const undo = useCallback(() => {
    setState((prev) => {
      // AC5: with an empty ring this is a no-op, not a throw and not a clear. The button is
      // `disabled` in that state, so reaching here means a programmatic call or a race.
      if (prev.past.length === 0) return prev;
      const entry = prev.past[prev.past.length - 1];
      return { ...prev, value: restore(entry), past: prev.past.slice(0, -1) };
    });
  }, []);

  // Memoised on the two things that actually change, so a render that committed nothing hands back
  // the same two objects. `commit`/`undo` are stable by construction above — the canvas's resize
  // effect holds one of them in a closure it deliberately does not re-register.
  return useMemo(
    () =>
      [
        { value: state.value, commit },
        { undo, canUndo: state.past.length > 0 },
      ] as const,
    [state.value, state.past.length, commit, undo],
  );
}
