/**
 * The read-only structural view GridRenderer reads (Story 1.8 Task 1, AC1). Field names are
 * verbatim from RFC-004 §3.4's `Grid` — `width`/`height`/`occupant`/`age`, NOT `cols`/`rows` —
 * so Story 3.3's real typed-array `Grid` satisfies this interface structurally, with zero
 * adaptation and zero import. Declared in apps/web (not packages/simulation, which does not exist
 * yet and does not own this type until 3.3 lands): apps/web already depends on @gol/simulation,
 * never the reverse, so building the join here is the only direction that doesn't invert that
 * dependency or steal 3.3's design (Dev Notes, forced decision 2).
 */
export interface RenderableGrid {
  readonly width: number; // cols
  readonly height: number; // rows
  readonly occupant: Uint8Array; // 0 = empty; 1..255 = OrganismRef = dense roster index + 1
  readonly age: Uint16Array; // Uint16, not Uint8 — canonical (Decision B.5)
}

/**
 * Adapts a battle's at-rest dense grid (`BattleSchema.gridState`, RFC-006 Decision 2) into a
 * `RenderableGrid`. Age is always zero here — every initial grid has `age === 0` everywhere
 * (RFC-005 "Representation note") — so this allocates a zero-filled `Uint16Array` rather than
 * reading age from anywhere; there is nowhere to read it from at this boundary.
 *
 * Validates eagerly and throws, naming the offending row (the `gridBuilders.ts` convention): a
 * ragged `gridState` that reached the canvas would otherwise paint a plausible-looking but wrong
 * dish, with the real defect three stories away from where it surfaced.
 */
export function toRenderableGrid(gridState: readonly (readonly number[])[]): RenderableGrid {
  const height = gridState.length;
  const width = height > 0 ? gridState[0].length : 0;

  const occupant = new Uint8Array(width * height);
  for (let row = 0; row < height; row++) {
    const line = gridState[row];
    if (line.length !== width) {
      throw new Error(
        `toRenderableGrid: row ${row} has ${line.length} cells, expected ${width} (ragged input)`,
      );
    }
    for (let col = 0; col < width; col++) {
      occupant[row * width + col] = line[col];
    }
  }

  return { width, height, occupant, age: new Uint16Array(width * height) };
}
