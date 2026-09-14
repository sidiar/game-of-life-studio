import type { Organism } from '@gol/domain';
import type { RenderableGrid } from '@/lib/canvas/renderableGrid';
import { computeEditorGridStats } from './gridStats';

/**
 * One row of Run mode's population bars (`component-tree-battle-page.md` §3.12, FR-4.6).
 *
 * `extinct` is `count === 0` spelled out so the consumer (`<PopulationStats>`, Story 3.14) renders
 * the extinct styling off a flag rather than re-deriving it from a number — and so the ORDER this
 * module produces (living first, extinct last) is readable in the data, not only in the sort.
 */
export interface PopulationEntry {
  readonly organismId: string;
  readonly name: string;
  readonly colorToken: string;
  readonly count: number;
  /** `count / totalLiving * 100`; `0` when nothing lives. Sums to <= 100, never over (see below). */
  readonly pct: number;
  readonly extinct: boolean;
}

/**
 * THIS is the call site `gridStats.ts`'s header reserved for Play mode ("Leave a comment at the
 * call site (Story 3.14 / M2)"): the sort, the percentages and the extinction flags live here; the
 * CADENCE lives in `useSimulation` (Story 3.10), which calls this only at publish time — at most
 * 10 Hz (M2, AR-29) — never per cycle. Population is a derived view, never engine state, and one
 * O(cells) sweep per publish is the whole cost.
 *
 * Order (FR-4.6): living organisms by `count` descending, ties in ROSTER order, then every extinct
 * organism in roster order. `Array.prototype.sort` is stable, so roster order on ties would hold
 * without help — the comparator still tie-breaks on roster index explicitly so the ordering is a
 * stated contract rather than an engine property a test could pass on by accident.
 *
 * Joined to `organisms` BY ID, never by index (`gridStats.ts` trap 1): `computeEditorGridStats`
 * de-duplicates ids, so its `perOrganism` can be shorter than the roster and every index after a
 * duplicate is shifted.
 *
 * `pct` sums to <= 100: a ref beyond the roster is counted in `livingCells` but attributed to
 * nobody (`gridStats.ts` trap 2). The engine can never produce one — every ref reaching a live
 * grid came from the compiled roster (`claims.ts` invariant 2) — so this is the persisted-grid
 * corruption case, documented rather than guarded.
 *
 * One entry per DISTINCT id, first occurrence wins — the same de-duplication
 * `computeEditorGridStats` applies, which has already aggregated every duplicate slot's tally onto
 * that id. One entry per SLOT would hand the aggregated count to each duplicate and push the `pct`
 * sum past 100. A duplicate-id roster never reaches a session (`compileSession` throws on it), but
 * `useSimulation` derives the initial population during render, BEFORE that throw, so the
 * invariant is kept here rather than assumed.
 */
export function derivePopulation(
  grid: RenderableGrid,
  organisms: readonly Pick<Organism, 'id' | 'name' | 'colorToken'>[],
): readonly PopulationEntry[] {
  const stats = computeEditorGridStats(
    grid,
    organisms.map((o) => o.id),
  );
  const countById = new Map<string, number>();
  for (const { organismId, count } of stats.perOrganism) countById.set(organismId, count);

  const totalLiving = stats.livingCells;

  const seen = new Set<string>();
  const indexed = organisms.flatMap((organism, rosterIndex) => {
    if (seen.has(organism.id)) return [];
    seen.add(organism.id);
    const count = countById.get(organism.id) ?? 0;
    const entry: PopulationEntry = {
      organismId: organism.id,
      name: organism.name,
      colorToken: organism.colorToken,
      count,
      pct: totalLiving === 0 ? 0 : (count / totalLiving) * 100,
      extinct: count === 0,
    };
    return [{ entry, rosterIndex }];
  });

  // Sorted in place — `indexed` is the fresh array from the map above, nothing shared. Extinct
  // after living, then count descending, then roster.
  indexed.sort((a, b) => {
    if (a.entry.extinct !== b.entry.extinct) return a.entry.extinct ? 1 : -1;
    if (a.entry.count !== b.entry.count) return b.entry.count - a.entry.count;
    return a.rosterIndex - b.rosterIndex;
  });

  return indexed.map(({ entry }) => entry);
}
