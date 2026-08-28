import type { RenderableGrid } from '@/lib/canvas/renderableGrid';

/**
 * Story 2.12 (AC3, spec §3.8 widened — see `BattleEditorView.tsx`'s composition step for the
 * display-facing shape `<EditorStatusBar>` actually receives). This module carries only what a
 * single pass over `grid.occupant` can produce: a count, per roster id. Names and colours are
 * `DisplayOrganism`'s job (`displayOrganisms.ts`) and are joined on top of this, by id, one level
 * up — see the Dev Notes "stats shape" section for why resolving colour here would be a second
 * `displayColor` call site.
 *
 * Not `lib/canvas/`: counting occupants is not a rendering concern. Not `packages/simulation`:
 * that package does not exist yet, and `RenderableGrid` itself lives in `apps/web` for the same
 * reason (`renderableGrid.ts`'s own comment). Leave a comment at the call site (Story 3.14 / M2)
 * rather than pre-building a cadence, throttle or sort/percentage API here — that is Play mode's,
 * FR-4.6, out of scope for the Lab bar this story ships.
 */
export interface OrganismPopulation {
  organismId: string;
  count: number;
}

export interface EditorGridStats {
  livingCells: number;
  /** One entry per DE-DUPLICATED `rosterIds` id (forced decision 1a), in first-occurrence order. */
  perOrganism: readonly OrganismPopulation[];
}

/**
 * One pass over `grid.occupant`, tallying into a `Uint32Array` indexed by ref (index 0 = empty,
 * unused) — never `Array.prototype.filter`/`reduce` per organism (that is `rosterIds.length`
 * passes over the grid) and never a `Map` keyed by string per cell.
 *
 * ⚠️ Counts by **ref -> `rosterIds[ref - 1]` -> id**, never `roster[ref - 1]` (Dev Notes trap 1):
 * `rosterIds` is the identity array a ref actually indexes; `roster` is the same order
 * de-duplicated by `resolveDisplayOrganisms`, so its length can be shorter and every index after a
 * duplicate id is shifted. A duplicate id in `rosterIds` aggregates its cells onto ONE entry here
 * (forced decision 1a), matching what `roster` (and so `<OrganismRoster>`) renders as a single row.
 *
 * ⚠️ A ref beyond `rosterIds.length` (a corrupt/hand-edited `gridState` — Decision I.4's dangling-
 * ref case) is counted in `livingCells` — it IS an occupied cell — and attributed to nobody
 * (Dev Notes trap 2). `sum(perOrganism.count) <= livingCells` is the invariant this produces, not
 * a bug to "fix" by dropping the cell from `livingCells`. No throw, no console warning:
 * `buildRefToFillGroup` already warns once per dangling id (Decision I.4), and this pass runs per
 * commit.
 */
export function computeEditorGridStats(
  grid: RenderableGrid,
  rosterIds: readonly string[],
): EditorGridStats {
  // Slot 0 is unused (ref 0 = empty); slots 1..rosterIds.length map to rosterIds[ref - 1].
  const tally = new Uint32Array(rosterIds.length + 1);
  let livingCells = 0;

  for (let i = 0; i < grid.occupant.length; i++) {
    const ref = grid.occupant[i];
    if (ref === 0) continue;
    livingCells++;
    if (ref <= rosterIds.length) tally[ref]++;
    // else: an out-of-range ref. Counted above in livingCells, attributed to nobody.
  }

  // De-duplicate rosterIds onto one entry per first-occurrence id, aggregating every ref that
  // resolves to it (forced decision 1a) — a duplicate id can occupy more than one ref slot, and
  // every slot's tally must reach the same output entry.
  const countByOrganismId = new Map<string, number>();
  const order: string[] = [];
  for (let i = 0; i < rosterIds.length; i++) {
    const id = rosterIds[i];
    const ref = i + 1;
    const existing = countByOrganismId.get(id);
    if (existing === undefined) {
      order.push(id);
      countByOrganismId.set(id, tally[ref]);
    } else {
      countByOrganismId.set(id, existing + tally[ref]);
    }
  }

  const perOrganism = order.map((organismId) => ({
    organismId,
    count: countByOrganismId.get(organismId) ?? 0,
  }));

  return { livingCells, perOrganism };
}
