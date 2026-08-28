/**
 * The Decision H.1 prune and the Decision E.2 remap, over the AT-REST shape this package already
 * owns (`BattleSchema.gridState` / `BattleSchema.organismIds`).
 *
 * Why here and not in `apps/web`: this is referential-integrity logic — the same invariants
 * `BattleSchema.superRefine` already encodes, on the entity this package owns, under the NFR-5.1
 * ≥90% gate. `apps/web` keeps only the runtime-typed-array → dense conversion, because
 * `RenderableGrid` is an `apps/web` type and a `packages/*` file must never import one. Story 5.8's
 * atomic import needs this same remap and imports it from here rather than reaching into the app.
 *
 * ⚠️ THE HAZARD THIS FUNCTION EXISTS FOR. A cell value is `roster index + 1` — an index into
 * whichever array it was written against. Pruning `organismIds` shifts every entry after the
 * removed slot, so a projection that prunes the roster and copies the grid verbatim writes cells
 * that index the WRONG organism. Half of those cases fail `superRefine`'s
 * `v <= organismIds.length` check and are caught loudly; the other half — pruning an entry with a
 * later one still placed — stay in range, save, load, render, and silently attribute every
 * surviving cell to a different organism. That is why the remap is a table built once and applied
 * to every cell, never an assumption that the numbers still mean what they did.
 */

/** A pruned, remapped pair. Both arrays are NEW — nothing here aliases its input (Story 2.13). */
export interface PrunedBattleGrid {
  /** Exactly the placed set, de-duplicated, in first-placed-slot order (Decision H.1). */
  organismIds: string[];
  /** The same grid, rewritten against `organismIds` above (Decision E.2). */
  gridState: number[][];
}

/**
 * Projects a battle's roster and grid onto the shape `BattleSchema` accepts at rest.
 *
 * Three things happen in one pass-pair, and they are inseparable:
 *
 * 1. **Prune** (Decision H.1) — a roster entry with no cell on the grid is dropped. That covers
 *    both an organism whose last cell was erased and a session-added-but-never-painted entry
 *    (Decision H.2 — those are session state and were never part of the record).
 * 2. **De-duplicate** — `organismIds` at rest is a SET (`superRefine` rejects repeats), while the
 *    live roster union can legitimately hold the same id twice (an imported or hand-edited record
 *    whose `organismIds` repeated an id; `BattleSummarySchema` has no duplicate check, so
 *    `buildRosterIds` preserves it). Repeated slots collapse onto ONE output slot and their cells
 *    merge — the same fold `computeEditorGridStats` applies to the population counts, so the
 *    status bar and the saved record agree about how many organisms a battle has. A save is the
 *    one moment this repo can heal such a record.
 * 3. **Remap** (Decision E.2) — every cell is rewritten through an explicit `oldRef → newRef`
 *    table. Never `indexOf` per cell, never a `Map<string, …>` keyed per cell: a 100×60 grid is
 *    6,000 cells and the roster can hold 255 entries (Decision G.3).
 *
 * ⚠️ **An out-of-range ref is written as 0 (the cell is dropped).** A ref above
 * `organismIds.length` resolves to no organism, so there is nothing to remap it to, and carrying
 * it through unchanged would produce a record that fails its OWN schema
 * (`v <= organismIds.length`) — i.e. a battle that cannot be re-loaded. It is only reachable from
 * an already-corrupt or hand-edited `gridState`, and such a cell is ALREADY invisible in the
 * editor (`groupByColourState` folds a ref past the palette to EMPTY), so dropping it makes the
 * stored record agree with what the user is looking at rather than losing something they can see.
 *
 * The output satisfies every `BattleSchema.superRefine` invariant by construction: dimensions are
 * untouched, no cell exceeds `organismIds.length`, every roster entry has at least one placed
 * cell, and no id appears twice.
 */
export function pruneAndRemapBattleGrid(
  gridState: readonly (readonly number[])[],
  organismIds: readonly string[],
): PrunedBattleGrid {
  const rosterLength = organismIds.length;

  // Pass 1 — which refs actually appear on the grid. Indexed by ref (slot 0 = empty, unused), so
  // this is one array read per cell rather than a set insertion.
  const isPlaced = new Uint8Array(rosterLength + 1);
  for (const row of gridState) {
    for (const value of row) {
      // `> rosterLength` is the dangling-ref case (Decision I.4); it marks nothing as placed and
      // is written as 0 in pass 2 below.
      if (value > 0 && value <= rosterLength) isPlaced[value] = 1;
    }
  }

  // The `oldRef → newRef` table, built ONCE. `Uint8Array` is sound because the pruned roster can
  // never be longer than the input one, which the schema caps at 255 (Decision G.3).
  const remap = new Uint8Array(rosterLength + 1);
  const nextOrganismIds: string[] = [];
  const newRefById = new Map<string, number>();
  for (let index = 0; index < rosterLength; index++) {
    const ref = index + 1;
    if (isPlaced[ref] === 0) continue; // Decision H.1 / H.2 — pruned.
    const id = organismIds[index];
    const existing = newRefById.get(id);
    if (existing === undefined) {
      nextOrganismIds.push(id);
      const newRef = nextOrganismIds.length;
      newRefById.set(id, newRef);
      remap[ref] = newRef;
    } else {
      // A duplicate id: this slot's cells merge into the slot the first occurrence claimed.
      remap[ref] = existing;
    }
  }

  // Pass 2 — a NEW row array per row, never a mutation of the input (the caller may be holding a
  // pristine loaded record; see `<BattlePage>`'s `toDraft` and deferred-work.md's mutable-`Battle`
  // entry).
  const nextGridState = gridState.map((row) =>
    row.map((value) => (value > 0 && value <= rosterLength ? remap[value] : 0)),
  );

  return { organismIds: nextOrganismIds, gridState: nextGridState };
}
