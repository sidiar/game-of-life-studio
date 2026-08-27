/**
 * The editor's tool model (component-tree-battle-page.md#3.4). Lives in `lib/` rather than inside
 * any one component because three of them need it: `<PetriDishCanvas>` (`components/`),
 * `<BattleEditorView>` (`components/battle/`) and, from Story 2.9, `<OrganismRoster>` — declaring
 * it inside any one of those would make the other two import from a sibling component file. Not
 * `lib/canvas/`: a tool is an editor concept, not a rendering one.
 *
 * Spec §3.4's TWO-arm union, verbatim (Story 2.7): `{ kind: 'organism'; organismId } | { kind:
 * 'eraser' }`. The eraser arm carries no payload — there is nothing to select, only a mode — and
 * `refForTool` resolves it to `0`, the reserved "empty" ref (RFC-006 Decision 2), never `null`.
 */
import { CONWAYS_CLASSIC_ID } from '@gol/domain';

export type Tool = { kind: 'organism'; organismId: string } | { kind: 'eraser' };

/**
 * The selection until the roster UI exists (Story 2.9). A module-level constant, not a fresh
 * literal per render: it seeds `<BattleEditorView>`'s `selectedTool` state and feeds a memo, and a
 * churning identity there would rebuild the resolved ref on every render.
 *
 * Conway's Classic is always present in a production workspace (M9: protected, re-seeded after
 * import), so this id always resolves against the session roster union `<BattlePage>` builds.
 */
export const DEFAULT_TOOL: Extract<Tool, { kind: 'organism' }> = Object.freeze({
  kind: 'organism',
  organismId: CONWAYS_CLASSIC_ID,
});

/**
 * The eraser selection (Story 2.7 AC4/AC5) — a module-level constant for the same reason
 * `DEFAULT_TOOL` is one: it feeds `<BattleEditorView>`'s `selectedTool` state and the `toolRef`
 * memo keyed on it, and a fresh `{ kind: 'eraser' }` literal per render would churn that memo's
 * identity on every unrelated re-render.
 */
export const ERASER_TOOL: Tool = Object.freeze({ kind: 'eraser' });

/**
 * Exhaustiveness tripwire for `kind`, mirroring `PetriDishCanvas.tsx`'s `assertUnhandledVariant`.
 * `Tool` is a two-arm union now that Story 2.7 added `{ kind: 'eraser' }`; this still guards it
 * against a THIRD arm arriving without a matching case below — none is planned, which is
 * precisely when a tripwire earns its keep rather than becoming dead code to delete.
 */
function assertUnhandledToolKind(kind: never): never {
  throw new Error(`Unhandled Tool kind: ${String(kind)}`);
}

/**
 * Resolves a tool to the numeric `OrganismRef` the grid buffer stores, `0` for the eraser
 * (Story 2.7 AC4), or `null` when an organism tool's organism is not in the roster at all.
 *
 * `index + 1` is the one number that ties `gridState`, `OrganismRef` and the palette LUT together
 * (RFC-006 Decision 2: dense cell value = roster index + 1; `refToFillGroup.ts` builds the LUT on
 * the same encoding, with slot 0 reserved for empty). An off-by-one here paints the wrong
 * organism's colour with nothing logged anywhere, which is why it is a unit rather than an inline
 * expression at the call site.
 *
 * ⚠️ The eraser returns `0`, never `null` — `0` is the reserved "empty" ref (RFC-006 Decision 2),
 * exactly what erasing means. `null` stays reserved for "an organism tool whose organism is not
 * in the roster" — `handlePointerDown`'s `if (toolRef === null) return;` treats that as a no-op,
 * and an eraser that resolved to `null` would hit the same guard and silently do nothing at every
 * press, with every existing test still green (this file's own trap, now realised).
 */
export function refForTool(tool: Tool, rosterIds: readonly string[]): number | null {
  // Destructured FIRST so the exhaustiveness check actually bites — TypeScript does not narrow a
  // non-union object type to `never` in a `default` clause, so `assertUnhandledToolKind(tool)`
  // would not compile at all without this. A local of literal type `'organism' | 'eraser'` does
  // narrow, and stops compiling the moment a third arm joins `Tool` without a matching case below.
  const { kind } = tool;
  switch (kind) {
    case 'organism': {
      const index = rosterIds.indexOf(tool.organismId);
      return index === -1 ? null : index + 1;
    }
    case 'eraser':
      return 0;
    default:
      return assertUnhandledToolKind(kind);
  }
}
