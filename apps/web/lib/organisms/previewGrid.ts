import type { Organism } from '@gol/domain';
import { ERASER_TOOL, type Tool } from '@/lib/battle/tool';
import { buildRefToFillGroup, type RefToFillGroup } from '@/lib/canvas/refToFillGroup';

/**
 * The Organism Editor's preview dish (Story 4.14, FR-2.7 / M3 / UX-DR13): the constants the
 * panel passes DOWN as parameters and the two derivations that tie its one-organism roster
 * to the encoding every other surface uses. No React, no DOM, no repository.
 *
 * 30×20 is UX-DR13's size — a PARAMETER handed to the canvas, the renderer and the grid
 * factory (Decision A), never a literal below this file. `Object.freeze` so the object is
 * one stable identity: it is one of `EditDish`'s three construction dependencies
 * (`PetriDishCanvas.tsx`), and a fresh `{ cols, rows }` per render would rebuild the
 * renderer on every keystroke in the name field.
 */
export const PREVIEW_GRID_SIZE: { readonly cols: number; readonly rows: number } = Object.freeze({
  cols: 30,
  rows: 20,
});

/**
 * A stable, session-only stand-in for the organism under edit, which has no library id
 * until Story 4.16 mints one. The canvas's edit member requires a `Tool` (`tool: Tool`,
 * declared for spec §3.10's shape and deliberately NOT read — `PetriDishCanvas.tsx:41-47`),
 * and `buildRefToFillGroup` keys its map by id — this id serves both and nothing else.
 * ❌ Never persisted, never compared with a library id, never handed to `compileSession`
 * (Story 4.15 decides the preview organism's real identity — `deferred-work.md`).
 */
export const PREVIEW_ORGANISM_ID = 'organism-editor-preview';

/** The preview's whole roster: one slot, so ref 1 IS the organism under edit (M14's
 * `index + 1`) and ref 0 stays the reserved empty ref (RFC-006 Decision 2). Frozen for the
 * same identity reason as `PREVIEW_GRID_SIZE`. */
export const PREVIEW_ROSTER: readonly string[] = Object.freeze([PREVIEW_ORGANISM_ID]);

export const PREVIEW_DRAW_TOOL: Tool = Object.freeze({
  kind: 'organism',
  organismId: PREVIEW_ORGANISM_ID,
});

/** UX-DR13's Draw/Erase toggle. Two arms, no third: Clear is an ACTION, not a mode. */
export type DrawMode = 'draw' | 'erase';

/**
 * The `Tool` the canvas's edit member is handed for a mode. Module constants on both arms,
 * so the prop's identity is stable across renders (the `ERASER_TOOL` reasoning, `tool.ts`).
 * The REF the canvas paints with is `refForTool(toolForDrawMode(mode), PREVIEW_ROSTER)` —
 * resolved by the panel through the same function `<BattleEditorView>` uses, so the
 * preview cannot drift from the battle editor on what `0` and `1` mean.
 */
export function toolForDrawMode(mode: DrawMode): Tool {
  return mode === 'draw' ? PREVIEW_DRAW_TOOL : ERASER_TOOL;
}

/**
 * The preview's `RefToFillGroup`: slot 1 = the draft's colour and aging, slot 0 empty. Built
 * through `buildRefToFillGroup` rather than by hand — a literal `{ tokenIndex, aging, size }`
 * here would be a second copy of the ref encoding (`refToFillGroup.ts`'s header names it as
 * the ONE place). `agingEnabled` matters even though every drawn cell is age 0: with aging
 * on, `ageShadeFor(0, true)` is shade 0, the pale end of Story 4.7's strip — the dish shows
 * the organism as the battle editor would paint it, not a saturated approximation.
 */
export function buildPreviewPalette(
  organism: Pick<Organism, 'colorToken' | 'agingEnabled'>,
): RefToFillGroup {
  return buildRefToFillGroup(PREVIEW_ROSTER, new Map([[PREVIEW_ORGANISM_ID, organism]]));
}
