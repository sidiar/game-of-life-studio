/**
 * Battle -> (RenderableGrid, RefToFillGroup), as a pure unit (Story 1.11 Task 3). The whole
 * dense->renderable conversion lives here so the tile component holds no data logic and the
 * conversion is testable without a DOM. Both halves already exist (Story 1.8): `toRenderableGrid`
 * and `buildRefToFillGroup`. ❌ Do not reimplement either — the dense at-rest cell value IS the
 * runtime OrganismRef, and the LUT built here is exactly the one Story 3.4's interning step will
 * produce.
 */
import type { Battle, Organism } from '@gol/domain';
import { buildRefToFillGroup, type RefToFillGroup } from './refToFillGroup';
import { toRenderableGrid, type RenderableGrid } from './renderableGrid';

/**
 * Throws only what its two collaborators throw: `toRenderableGrid` on a ragged/out-of-range
 * `gridState`, `buildRefToFillGroup` on a >255-organism roster. The caller catches — see Task 5's
 * degradation contract.
 */
export function toThumbnailSource(
  battle: Battle,
  roster: readonly Organism[],
): { grid: RenderableGrid; palette: RefToFillGroup } {
  // Built once per battle, not per ref — buildRefToFillGroup resolves every roster organism's
  // colour token exactly once from this map.
  const organismsById = new Map(roster.map((o) => [o.id, o] as const));

  return {
    grid: toRenderableGrid(battle.gridState),
    palette: buildRefToFillGroup(battle.organismIds, organismsById),
  };
}
