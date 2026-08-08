import type { Organism } from '@gol/domain';
import { displayColor, MAX_AGE_SHADE } from '@/lib/displayColor';
import { DEFAULT_COLOR_TOKEN } from '@/lib/paletteRegistry';

export interface TileOrganism {
  id: string;
  name: string;
  color: string;
}

// FR-1.4's delete guard makes a dangling id unreachable in normal use — an imported or
// hand-edited workspace is the case, and Story 5.11 owns the user-facing corruption story. No
// console warning here: the e2e asserts a clean console and paletteIndexOf already warns-once on
// an unknown TOKEN (Decision I.4), which this fallback deliberately avoids triggering by using a
// known token rather than an unknown one.
const FALLBACK_NAME = 'Unknown organism';

/**
 * Resolves a battle's organismIds (Decision H.1: exactly the placed set) against the current
 * roster for display. Colour is `displayColor(colorToken, MAX_AGE_SHADE)` — the identity shade
 * (Story 1.7: `displayColor(token, 7) === PALETTE[token].hex`), NOT `ageShadeFor(0, agingEnabled)`
 * (that is the age-0 shade for an AGING organism, which would render Patient Defender's identity
 * dot washed out) and NOT `resolvePaletteColor(token).hex` directly (same colour today, but this
 * is the LUT Story 1.11's cells go through — sharing it is what keeps a dot from ever disagreeing
 * with its own thumbnail).
 */
export function resolveTileOrganisms(
  organismIds: readonly string[],
  roster: readonly Organism[],
): TileOrganism[] {
  const byId = new Map(roster.map((o) => [o.id, o] as const));

  return organismIds.map((id) => {
    const organism = byId.get(id);
    if (organism === undefined) {
      return { id, name: FALLBACK_NAME, color: displayColor(DEFAULT_COLOR_TOKEN, MAX_AGE_SHADE) };
    }
    return { id, name: organism.name, color: displayColor(organism.colorToken, MAX_AGE_SHADE) };
  });
}
