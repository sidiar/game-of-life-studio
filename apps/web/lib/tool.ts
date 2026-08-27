/**
 * The editor's tool model (component-tree-battle-page.md#3.4). Lives in `lib/` rather than inside
 * any one component because three of them need it: `<PetriDishCanvas>` (`components/`),
 * `<BattleEditorView>` (`components/battle/`) and, from Story 2.9, `<OrganismRoster>` — declaring
 * it inside any one of those would make the other two import from a sibling component file. Not
 * `lib/canvas/`: a tool is an editor concept, not a rendering one.
 *
 * ⚠️ Spec §3.4 gives `Tool` as a TWO-arm union, `{ kind: 'organism'; organismId } | { kind:
 * 'eraser' }`. Only the organism arm ships here. The eraser is Story 2.7's acceptance criterion
 * verbatim, and declaring its arm now would leave an unreachable branch nothing can exercise —
 * the same call Story 2.4 made for `<BattleEditorView>`'s 13-prop interface.
 */
import { CONWAYS_CLASSIC_ID } from '@gol/domain';

export type Tool = { kind: 'organism'; organismId: string };

/**
 * The selection until the roster UI exists (Story 2.9). A module-level constant, not a fresh
 * literal per render: it seeds `<BattleEditorView>`'s `selectedTool` state and feeds a memo, and a
 * churning identity there would rebuild the resolved ref on every render.
 *
 * Conway's Classic is always present in a production workspace (M9: protected, re-seeded after
 * import), so this id always resolves against the session roster union `<BattlePage>` builds.
 */
export const DEFAULT_TOOL: Tool = Object.freeze({
  kind: 'organism',
  organismId: CONWAYS_CLASSIC_ID,
});

/**
 * Exhaustiveness tripwire for `kind`, mirroring `PetriDishCanvas.tsx`'s `assertUnhandledVariant`.
 * Its job is to stop COMPILING the moment Story 2.7 widens `Tool` with `{ kind: 'eraser' }`
 * without a matching arm below — without it, a widened union type-checks unchanged and the eraser
 * silently resolves to whichever ref the last arm happens to produce.
 */
function assertUnhandledToolKind(kind: never): never {
  throw new Error(`Unhandled Tool kind: ${String(kind)}`);
}

/**
 * Resolves a tool to the numeric `OrganismRef` the grid buffer stores, or `null` when the tool's
 * organism is not in the roster at all.
 *
 * `index + 1` is the one number that ties `gridState`, `OrganismRef` and the palette LUT together
 * (RFC-006 Decision 2: dense cell value = roster index + 1; `refToFillGroup.ts` builds the LUT on
 * the same encoding, with slot 0 reserved for empty). An off-by-one here paints the wrong
 * organism's colour with nothing logged anywhere, which is why it is a unit rather than an inline
 * expression at the call site.
 *
 * `null`, never 0, for a miss: 0 is a legitimate ref meaning "empty", which is exactly what Story
 * 2.7's eraser will write. Folding "unresolvable" into it would make an unknown organism erase.
 */
export function refForTool(tool: Tool, rosterIds: readonly string[]): number | null {
  // Destructured FIRST so the exhaustiveness check actually bites. `Tool` is a one-arm union
  // today, and TypeScript does not narrow a non-union object type to `never` in a `default`
  // clause — `assertUnhandledToolKind(tool)` would not compile at all. A local of literal type
  // `'organism'` does narrow, and widens to `'organism' | 'eraser'` the moment Story 2.7 adds the
  // second arm, which is exactly when this must stop compiling.
  const { kind } = tool;
  switch (kind) {
    case 'organism': {
      const index = rosterIds.indexOf(tool.organismId);
      return index === -1 ? null : index + 1;
    }
    default:
      return assertUnhandledToolKind(kind);
  }
}
