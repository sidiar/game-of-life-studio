/**
 * The per-battle OrganismRef -> fill-group LUT (Story 1.8 Task 2, AR-23). This is the object the
 * frozen GridRenderer contract calls `palette` — deferred from Story 1.7 because its shape needed
 * the renderer's inner loop to dictate it rather than being guessed.
 *
 * The dense at-rest encoding and the runtime OrganismRef are the SAME number: `gridState` cell
 * value `v` is `index + 1` into `battle.organismIds` (RFC-006/BattleSchema), and RFC-004 §2.1
 * interns ids to refs in that same roster order. So `ref = occupant value` needs no translation
 * layer in Epic 1 — this LUT is exactly the one Story 3.4 will produce from its interning step.
 */
import type { Organism } from '@gol/domain';
import { ageShadeFor } from './displayColor';
import { DEFAULT_COLOR_TOKEN, paletteIndexOf } from './paletteRegistry';

export interface RefToFillGroup {
  readonly tokenIndex: Uint8Array; // [ref] -> palette index (0..19). Slot 0 unused: ref 0 = empty.
  readonly aging: Uint8Array; // [ref] -> 1 when agingEnabled
  readonly size: number; // roster length + 1 — the exclusive upper bound on a valid ref
}

// Uint8Array occupant values top out at 255 (Decision G.3). A larger roster would silently
// truncate the LUT's allocation instead of the caller's schema-level bug surfacing here.
const MAX_ROSTER_SIZE = 255;

const warnedMissingOrganismIds = new Set<string>();

function warnMissingOrganismOnce(organismId: string): void {
  if (warnedMissingOrganismIds.has(organismId)) return;
  warnedMissingOrganismIds.add(organismId);
  console.warn(
    `[refToFillGroup] Roster id "${organismId}" has no matching organism — falling back to ` +
      `"${DEFAULT_COLOR_TOKEN}" / non-aging (Decision I.4).`,
  );
}

/**
 * Resolves every roster organism's colour token and aging flag ONCE per battle, not per cell per
 * frame. `paletteIndexOf` already warns once per unknown token; calling it here — rather than in
 * the render loop — puts that diagnostic on a once-per-battle path and guarantees the renderer
 * only ever sees in-range indices. This closes the Story 1.7 deferred item
 * (deferred-work.md:53: "displayColorAt clamps a corrupt numeric index silently ... pick this up
 * in Story 1.8 when the renderer's inner loop exists"): the diagnostic is affordable precisely
 * because it does not live in the loop.
 */
export function buildRefToFillGroup(
  organismIds: readonly string[],
  organismsById: ReadonlyMap<string, Pick<Organism, 'colorToken' | 'agingEnabled'>>,
): RefToFillGroup {
  if (organismIds.length > MAX_ROSTER_SIZE) {
    throw new Error(
      `buildRefToFillGroup: roster has ${organismIds.length} organisms, exceeds the ` +
        `${MAX_ROSTER_SIZE}-organism cap (Decision G.3)`,
    );
  }

  const size = organismIds.length + 1;
  const tokenIndex = new Uint8Array(size);
  const aging = new Uint8Array(size);

  for (let i = 0; i < organismIds.length; i++) {
    const ref = i + 1; // roster index + 1 = OrganismRef; slot 0 stays unused (empty)
    const organismId = organismIds[i];
    const organism = organismsById.get(organismId);

    // A roster entry with no matching organism must still render (mid-import, a hand-edited
    // record) — degrade-and-warn, not throw, per Decision I.4. Throwing here would blank the
    // whole Gallery over one dangling reference.
    if (organism === undefined) {
      warnMissingOrganismOnce(organismId);
      tokenIndex[ref] = paletteIndexOf(DEFAULT_COLOR_TOKEN);
      aging[ref] = 0;
      continue;
    }

    tokenIndex[ref] = paletteIndexOf(organism.colorToken);
    aging[ref] = organism.agingEnabled ? 1 : 0;
  }

  return { tokenIndex, aging, size };
}

/**
 * Group key = tokenIndex * 8 + ageShade — deliberately the same arithmetic displayColorAt uses to
 * index its 160-entry table (`safeIndex * SHADE_COUNT + safeShade`, displayColor.ts). Group id
 * and colour index are the same number; the renderer never needs a second lookup table.
 */
export function fillGroupOf(lut: RefToFillGroup, ref: number, age: number): number {
  const shade = ageShadeFor(age, lut.aging[ref] === 1);
  return lut.tokenIndex[ref] * 8 + shade;
}
