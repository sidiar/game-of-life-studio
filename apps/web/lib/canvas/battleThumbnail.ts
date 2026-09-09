/**
 * Battle -> (RenderableGrid, RefToFillGroup), as a pure unit (Story 1.11 Task 3). The whole
 * dense->renderable conversion lives here so the tile component holds no data logic and the
 * conversion is testable without a DOM. Both halves already exist (Story 1.8): `toRenderableGrid`
 * and `buildRefToFillGroup`. ❌ Do not reimplement either — the dense at-rest cell value IS the
 * runtime OrganismRef (M14).
 *
 * ⚠️ CORRECTED (Story 3.4): the LUT built here is NOT what that story's interning step produces —
 * see `refToFillGroup.ts`'s header. Story 3.4's map is `library id -> OrganismRef` and feeds rule
 * compilation; this one is `OrganismRef -> fill group` and is palette-dependent. They share the
 * roster ordering, nothing more.
 */
import type { Battle, Organism } from '@gol/domain';
import { buildRefToFillGroup, type RefToFillGroup } from './refToFillGroup';
import { toRenderableGrid, type RenderableGrid } from './renderableGrid';

/**
 * Throws only what its two collaborators throw: `toRenderableGrid` on a ragged/out-of-range
 * `gridState`, `buildRefToFillGroup` on a >255-organism roster. The caller catches — see Task 5's
 * degradation contract.
 *
 * Parameter widened from `Battle` to `Pick<Battle, 'gridState' | 'organismIds'>` (Story 2.4 Task
 * 6) — a structural widening, so every existing `Battle` call site (BattleTile) is unaffected.
 * `NewBattleDraft` (`lib/battle/newBattleDraft.ts`) carries the same two fields with the same shapes and
 * so satisfies this without adaptation, which is what lets `<BattlePage>` reuse this conversion
 * for the unsaved-draft path instead of hand-rolling the dense->renderable loop or the LUT a
 * second time. The function's name is now narrower than its signature — a rename candidate,
 * recorded as deferred work rather than done here.
 */
export function toThumbnailSource(
  battle: Pick<Battle, 'gridState' | 'organismIds'>,
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
