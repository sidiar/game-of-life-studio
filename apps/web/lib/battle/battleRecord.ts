import {
  EditableGridPresetSchema,
  pruneAndRemapBattleGrid,
  type Battle,
  type EditableGridPreset,
} from '@gol/domain';
import type { RenderableGrid } from '@/lib/canvas/renderableGrid';

/**
 * The identity and timestamps a save stamps onto the projected record. Deliberately NOT part of
 * `NewBattleDraft`: the draft has no `id`/`createdAt`/`updatedAt` precisely because minting them
 * before a save would be a lie the moment the user leaves `/battle/new` without saving
 * (`newBattleDraft.ts`, Story 2.2 forced decision 5). `<BattlePage>` supplies them at the one
 * moment they become true.
 */
export interface BattleRecordStamps {
  id: string;
  /** The RAW edited name, including `''` — `battleDisplayName` is a DISPLAY fallback and is never
   * stored (createNewBattleDraft's own comment records why). */
  name: string;
  /** Minted on first save and preserved on every save after (trap 3). */
  createdAt: Date;
  /** Bumped every save — this is what re-sorts the Gallery (`sortByLastModified`, FR-7.3). */
  updatedAt: Date;
}

/**
 * Projects the live editor state onto the record `BattleRepository.save` stores (FR-7.8).
 *
 * This is the literal inverse of `toRenderableGrid`: runtime `Uint8Array` occupancy back to the
 * dense `number[][]` a battle holds at rest (AR-9 / RFC-006 Decision 2 — "dense at rest, sparse on
 * the wire"). The sparse form and the export envelope are Epic 5's serializer and appear nowhere
 * here.
 *
 * The referential-integrity half — the Decision H.1 prune and the Decision E.2 remap — is NOT
 * implemented here. It lives in `@gol/domain`'s `pruneAndRemapBattleGrid`, over the at-rest shape
 * that package owns and under its ≥90% gate; this module only converts shapes and stamps
 * identity. Splitting it that way is the only arrangement where neither package imports the
 * other's type: `RenderableGrid` is declared in `apps/web` (see `renderableGrid.ts`) and
 * `packages/*` compiles without `dom` and must never reach into the app.
 *
 * ⚠️ **A projection, not a state transition.** Every array returned is new; `grid`, `rosterIds`
 * and the loaded record's own arrays are untouched and keep their identities, which is what lets
 * a save leave the undo ring, the session roster and the painted dish exactly as they were.
 *
 * ⚠️ `gridSize` comes from the LIVE grid, never from the draft the editor was seeded with (Story
 * 2.8 forced decision 4 made the grid the single source for dimensions, and Story 2.14's resize
 * then needs no change here). It is parsed through `EditableGridPresetSchema` rather than
 * asserted: a grid outside the two editable presets (Decision G.1 / H-9) must fail LOUDLY at this
 * boundary, where the message names the field, rather than as a `superRefine` dimension mismatch
 * from inside the repository three frames later.
 */
export function projectBattleForSave(
  grid: RenderableGrid,
  rosterIds: readonly string[],
  stamps: BattleRecordStamps,
): Battle {
  const gridSize: EditableGridPreset = EditableGridPresetSchema.parse({
    cols: grid.width,
    rows: grid.height,
  });

  // Densify: row-major, one new array per row. `occupant` is a `Uint8Array`, so every value is
  // already an integer in 0..255 — the range check `toRenderableGrid` performs on the way IN has
  // no counterpart here because the typed array itself is the guarantee on the way out.
  const dense = Array.from({ length: grid.height }, (_, row) =>
    Array.from({ length: grid.width }, (_, col) => grid.occupant[row * grid.width + col]),
  );

  const { organismIds, gridState } = pruneAndRemapBattleGrid(dense, rosterIds);

  return {
    id: stamps.id,
    name: stamps.name,
    gridSize,
    gridState,
    organismIds,
    createdAt: stamps.createdAt,
    updatedAt: stamps.updatedAt,
  };
}
