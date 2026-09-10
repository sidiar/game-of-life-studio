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

// Keyed PER-LUT (Story 1.11 Task 7), not on a bare ref number: a ref is an index into ONE
// battle's roster, so Battle A's corrupt ref 3 and Battle B's corrupt ref 3 are unrelated
// defects — a single module-level Set conflated them, permanently suppressing the second
// battle's warning once the first had fired. One LUT is built per battle (battleThumbnail.ts), so
// LUT identity IS battle identity for this purpose. A WeakMap also means the registry cannot grow
// for the process lifetime — a LUT that is no longer referenced anywhere else becomes eligible for
// collection, taking its warned-refs Set with it (unlike `warnedUnknownTokens` in
// paletteRegistry.ts, which stays a plain Set and Story 5.7's unbounded-growth item).
let warnedOutOfRangeRefs = new WeakMap<RefToFillGroup, Set<number>>();

/**
 * Clears the out-of-range-ref warn-once registry. Exported because the registry is a module
 * singleton that `vi.restoreAllMocks()` does not touch, which silently makes every "warns once"
 * assertion depend on being the first in its file to touch that ref. Call it from `afterEach`.
 * A WeakMap cannot be iterated or cleared in place — replacing the binding is the only way to
 * reset it, and every LUT-keyed entry becomes unreachable garbage at that point regardless.
 */
export function resetColourStateWarnings(): void {
  warnedOutOfRangeRefs = new WeakMap<RefToFillGroup, Set<number>>();
}

function warnOutOfRangeRefOnce(lut: RefToFillGroup, ref: number): void {
  let warnedForLut = warnedOutOfRangeRefs.get(lut);
  if (warnedForLut === undefined) {
    warnedForLut = new Set<number>();
    warnedOutOfRangeRefs.set(lut, warnedForLut);
  }
  if (warnedForLut.has(ref)) return;
  warnedForLut.add(ref);
  console.warn(
    `[colourStateGroups] Ref ${ref} is outside the palette LUT — skipping the cell (treated as ` +
      'empty). A stale or hand-edited grid can carry a ref the current roster no longer covers.',
  );
}

/**
 * The "this cell paints nothing" colour state. Valid fill-group ids run 0..159 (20 tokens x 8
 * shades), so any value above that range is free; 0xFFFF is chosen because the dirty baseline
 * buffer is a `Uint16Array` and this is its maximum — a zero-filled fresh buffer therefore reads
 * as "group 0" rather than accidentally as "empty", which is what forces `drawFull` to prime the
 * baseline explicitly instead of relying on the allocation (Story 2.3).
 */
export const EMPTY_COLOUR_STATE = 0xffff;

/**
 * The single per-cell colour state both paint paths compare and batch on: `fillGroupOf` already
 * folds occupant token AND age shade into one number (Decision B.2), which is exactly AC1's
 * "dirty on occupant OR age-shade change" rule in one comparison.
 *
 * Extracted from `groupByColourState`'s loop in Story 2.3 so the dirty path re-uses the
 * out-of-range guard rather than re-deriving it: a second call site computing `fillGroupOf`
 * directly would read past `lut.size` off the typed array and reintroduce the phantom-organism
 * paint this guard exists to stop, with the warn-once registry none the wiser.
 */
export function colourStateAt(grid: RenderableGrid, lut: RefToFillGroup, index: number): number {
  const ref = grid.occupant[index];
  if (ref === 0) return EMPTY_COLOUR_STATE;
  if (ref >= lut.size) {
    warnOutOfRangeRefOnce(lut, ref);
    return EMPTY_COLOUR_STATE;
  }
  return fillGroupOf(lut, ref, grid.age[index]);
}

/** Splits a fill-group id back into its two coordinates — the inverse of `tokenIndex * 8 + shade`. */
export function tokenIndexOfGroup(groupId: number): number {
  return Math.floor(groupId / 8);
}

export function ageShadeOfGroup(groupId: number): number {
  return groupId % 8;
}

/**
 * ⚠️ ALLOCATION PROFILE — MEASURED IN STORY 3.7, and the answer was "leave it alone"
 * (deferred-work.md, 1.8 review, which parked "a `number[]` per group, plus `Array.from` + `sort` +
 * an object spread on every call" for the first story with a harness). At the NFR-1.1 baseline —
 * 100x60, 20 organisms, 20 distinct colour tokens, a grid stepped 50 cycles so the age ramp is
 * live — this whole function costs **0.033-0.041 ms**, about 0.25% of a 16.67 ms frame and ~0.3% of
 * the 14.5 ms the engine step next door spends. Redesigning it would buy back a rounding error.
 * The per-frame repaint decision is not where the frame budget goes; Phase 2 of the engine is.
 * `lib/canvas/repaintDecision.bench.ts` keeps the number honest from here on.
 */
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
    // Empty is the majority of most grids, and an out-of-range ref is folded to the same state
    // (with its warn-once diagnostic) inside colourStateAt — either way the background fill this
    // path always lays down first already covers the cell.
    const groupId = colourStateAt(grid, lut, index);
    if (groupId === EMPTY_COLOUR_STATE) continue;

    let group = groups.get(groupId);
    if (group === undefined) {
      group = {
        tokenIndex: tokenIndexOfGroup(groupId),
        ageShade: ageShadeOfGroup(groupId),
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
