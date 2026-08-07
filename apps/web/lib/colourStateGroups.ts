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

/**
 * Clears the out-of-range-ref warn-once registry. Exported because the registry is a module
 * singleton that `vi.restoreAllMocks()` does not touch, which silently makes every "warns once"
 * assertion depend on being the first in its file to touch that ref. Call it from `afterEach`.
 * A ref is battle-relative, so this key is also wrong across battles — see deferred-work.md
 * (Story 1.11), which owns the re-keying.
 */
export function resetColourStateWarnings(): void {
  warnedOutOfRangeRefs.clear();
}

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

  // Bound the sweep by the DECLARED dimensions, not by occupant.length. As a public function this
  // is reachable without GridRenderer's assertGridMatchesSize, and an over-long occupant would
  // otherwise emit phantom cells at row >= height that the renderer paints outside the grid
  // rectangle. A short age buffer is just as silent: age[index] is undefined, which becomes NaN
  // and clamps to shade 0, painting those cells at the newborn colour.
  const cellCount = grid.width * grid.height;
  if (grid.occupant.length < cellCount || grid.age.length < cellCount) {
    throw new Error(
      `groupByColourState: grid ${grid.width}x${grid.height} needs ${cellCount} cells, but ` +
        `occupant has ${grid.occupant.length} and age has ${grid.age.length}`,
    );
  }

  for (let index = 0; index < cellCount; index++) {
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
