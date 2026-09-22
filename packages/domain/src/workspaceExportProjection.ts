/**
 * The dense-at-rest <-> sparse-on-the-wire conversion (AR-9), and the envelope assembly around it.
 *
 * This file sits to `workspaceExportSchema.ts` exactly as `battleProjection.ts` sits to
 * `battleSchema.ts`: the schema says what a shape IS, the projection moves between two of them.
 * Read `battleProjection.ts`'s header first — its ref-remap hazard is this file's hazard seen from
 * the other side. There a roster is pruned and the grid must be rewritten to match; here there is
 * no roster at all, and one has to be rebuilt such that the grid still means what it meant.
 *
 * ⚠️ **THE ORDERING CONTRACT, AND WHY IT IS NOT COSMETIC.** A cell value is `roster index + 1`
 * (M14). The envelope carries no roster (Decision H.2), so `fromBattleExport` reconstructs
 * `organismIds` from `cells` — by order of FIRST APPEARANCE, because that is the only ordering the
 * wire form contains. `toBattleExport` therefore emits `cells` grouped by ASCENDING REF (row-major
 * within each group), which makes first-appearance order identical to roster order for every
 * schema-valid battle, unconditionally.
 *
 * A single row-major pass would look simpler and be wrong in the normal case, not an edge case:
 * roster order is editor order (`pruneAndRemapBattleGrid` preserves first-placed-SLOT order, which
 * is about slots, not coordinates), so a battle whose second organism happens to occupy the top row
 * would round-trip to a PERMUTED roster with a correspondingly remapped `gridState` — the same
 * picture, a different record, and `toEqual` red. Do not "simplify" the two-pass emission.
 *
 * ⚠️ **`pruneAndRemapBattleGrid` is deliberately NOT called here.** Its output order is
 * first-placed-slot over an INPUT roster; `fromBattleExport` has no roster to start from. The two
 * agree only because of the emission order above — which is the thing under test, so reaching for
 * the projection to produce the expectation would make the test vacuous.
 */

import type { Battle } from './battleSchema';
import type { Organism } from './organismSchema';
import { CURRENT_FORMAT_VERSION } from './settingsSchema';
import type {
  BattleExport,
  BattleExportWire,
  ExportKind,
  PlacedCell,
  WorkspaceExport,
  WorkspaceExportWire,
} from './workspaceExportSchema';

/**
 * Everything the envelope stamps that is not data. Both values are INJECTED (Story 5.3 FD5): there
 * is no app-version constant in this workspace yet and picking one here would mint something
 * nothing reads until Story 5.5, and a hidden clock would force `exportedAt` to be asserted with a
 * regex instead of exactly.
 */
export interface ExportMeta {
  /** Provenance only, never branched on (Decision I.4). */
  appVersion: string;
  exportedAt: Date;
}

/**
 * Dense `gridState` -> sparse `cells`, one pass over the grid plus one concatenation.
 *
 * Bucketed by ref rather than scanned once per ref: a 100x60 grid is 6,000 cells and a roster may
 * hold 255 entries (Decision G.3), so the per-ref scan is 1.5M reads for the same answer.
 */
export function toBattleExport(battle: Battle): BattleExportWire {
  const { organismIds, gridState } = battle;

  // Indexed by ref, slot 0 unused (M14) — the same "index by ref, ignore 0" shape
  // `pruneAndRemapBattleGrid`'s `isPlaced` table uses.
  const buckets: PlacedCell[][] = Array.from({ length: organismIds.length + 1 }, () => []);

  for (let y = 0; y < gridState.length; y++) {
    const row = gridState[y];
    for (let x = 0; x < row.length; x++) {
      const ref = row[x];
      if (ref === 0) continue;
      // `organismIds[ref - 1]` types as `string` (no `noUncheckedIndexedAccess`), and it really is
      // one: `BattleSchema.superRefine` rejects any grid holding a value above `organismIds.length`.
      // The guarantee is the schema's, not the compiler's — a `Battle` that never went through
      // `parse` could break it.
      buckets[ref].push({ x, y, organismId: organismIds[ref - 1] });
    }
  }

  const cells: PlacedCell[] = [];
  for (let ref = 1; ref <= organismIds.length; ref++) {
    for (const cell of buckets[ref]) cells.push(cell);
  }

  return {
    id: battle.id,
    name: battle.name,
    gridDimensions: battle.gridSize,
    cells,
    createdAt: battle.createdAt.toISOString(),
    updatedAt: battle.updatedAt.toISOString(),
  };
}

/**
 * Sparse `cells` -> dense `gridState` + the reconstructed roster. The inverse of the above for
 * every battle `BattleSchema` accepts; see the header for why that holds universally rather than
 * up to a permutation.
 */
export function fromBattleExport(battleExport: BattleExport): Battle {
  const { cols, rows } = battleExport.gridDimensions;

  // A NEW row array per row. `Array(rows).fill([])` hands every row the SAME reference, so one
  // cell write would write a whole column (the trap `emptyGrid` carries the same note about).
  const gridState: number[][] = Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => 0),
  );

  const organismIds: string[] = [];
  const refById = new Map<string, number>();

  for (const cell of battleExport.cells) {
    let ref = refById.get(cell.organismId);
    if (ref === undefined) {
      organismIds.push(cell.organismId);
      ref = organismIds.length; // ref = index + 1 (M14).
      refById.set(cell.organismId, ref);
    }
    gridState[cell.y][cell.x] = ref;
  }

  return {
    id: battleExport.id,
    name: battleExport.name,
    organismIds,
    // Spread rather than aliased: the caller holds a freshly parsed envelope it may keep, and a
    // `Battle` sharing its `gridDimensions` object would let a later in-place edit of one change
    // the other (the no-aliasing rule `PrunedBattleGrid` states for its two arrays).
    gridSize: { ...battleExport.gridDimensions },
    gridState,
    createdAt: battleExport.createdAt,
    updatedAt: battleExport.updatedAt,
  };
}

/**
 * Assembles the wire envelope. Pure: no clock, no `Date.now()`, no module-level constant beyond
 * `CURRENT_FORMAT_VERSION`, which is the one value that must NOT be injected — it is the schema's
 * own literal and a caller-supplied version would let an export claim a format it is not
 * (Decision I).
 */
export function toEnvelope(
  kind: ExportKind,
  battles: readonly Battle[],
  organisms: readonly Organism[],
  meta: ExportMeta,
): WorkspaceExportWire {
  return {
    formatVersion: CURRENT_FORMAT_VERSION,
    appVersion: meta.appVersion,
    exportedAt: meta.exportedAt.toISOString(),
    kind,
    organisms: [...organisms],
    battles: battles.map(toBattleExport),
  };
}

/**
 * The inverse, over an envelope that has already been through `WorkspaceExportSchema.parse` — so
 * its timestamps are `Date`s and its structure is proven. Import's destructive whole-workspace
 * replace (M8) is Story 5.8's; this only hands back the two collections.
 */
export function fromEnvelope(envelope: WorkspaceExport): {
  battles: Battle[];
  organisms: Organism[];
} {
  return {
    battles: envelope.battles.map(fromBattleExport),
    organisms: [...envelope.organisms],
  };
}
