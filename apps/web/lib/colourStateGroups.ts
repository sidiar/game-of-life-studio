/**
 * Colour-state batch grouping — pure, no canvas (Story 1.8 Task 4, AC5). Folds every occupied
 * cell into a group keyed by `(colorToken, ageShade)`, never by organism (Decision B.2 / AR-23):
 * organism-keyed batching is unbounded (255 rosterable organisms), while colour-state keying
 * bounds the result at 20 tokens x 8 shades = 160 groups regardless of roster size. That bound is
 * what makes M6 (colours are reusable) and G.3 (255 per battle) free.
 */
import type { RenderableGrid } from './renderableGrid';
import { fillGroupOf, type RefToFillGroup } from './refToFillGroup';

export interface FillGroup {
  readonly groupId: number; // tokenIndex * 8 + ageShade — also the displayColorAt coordinate
  readonly tokenIndex: number;
  readonly ageShade: number;
  readonly cells: number[]; // flat grid indices (row * width + col)
}

const warnedOutOfRangeRefs = new Set<number>();

function warnOutOfRangeRefOnce(ref: number): void {
  if (warnedOutOfRangeRefs.has(ref)) return;
  warnedOutOfRangeRefs.add(ref);
  console.warn(
    `[colourStateGroups] Ref ${ref} is outside the palette LUT — skipping the cell (treated as ` +
      'empty). A stale or hand-edited grid can carry a ref the current roster no longer covers.',
  );
}

export function groupByColourState(grid: RenderableGrid, lut: RefToFillGroup): FillGroup[] {
  // groupId -> in-progress group. A Map (not a 160-slot array) because most grids use only a
  // handful of the 160 possible groups, and insertion order doesn't matter — the result is
  // re-sorted by groupId below regardless.
  const groups = new Map<number, { tokenIndex: number; ageShade: number; cells: number[] }>();

  for (let index = 0; index < grid.occupant.length; index++) {
    const ref = grid.occupant[index];
    if (ref === 0) continue; // Empty is the majority of most grids; the background fill covers it.

    // occupant is a Uint8Array, so a stale or hand-edited grid can carry a ref >= lut.size.
    // Reading past that bound would read undefined off the typed array, becoming NaN * 8 + shade
    // and landing in displayColorAt's silent clamp — painting a real organism's colour on a
    // phantom cell. Skip and warn once instead.
    if (ref >= lut.size) {
      warnOutOfRangeRefOnce(ref);
      continue;
    }

    const age = grid.age[index];
    const groupId = fillGroupOf(lut, ref, age);

    let group = groups.get(groupId);
    if (group === undefined) {
      group = {
        tokenIndex: lut.tokenIndex[ref],
        ageShade: groupId - lut.tokenIndex[ref] * 8,
        cells: [],
      };
      groups.set(groupId, group);
    }
    group.cells.push(index);
  }

  // Sorted by groupId so draw order is deterministic and two renders of the same grid produce
  // byte-identical call sequences — what makes GridRenderer's recording-context assertions stable.
  return Array.from(groups.entries())
    .sort(([a], [b]) => a - b)
    .map(([groupId, group]) => ({ groupId, ...group }));
}
