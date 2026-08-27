'use client';

import { useMemo, useState } from 'react';
import { styled } from '@mui/material/styles';
import type { GridRendererColors } from '@/lib/canvas/gridRenderer';
import type { RefToFillGroup } from '@/lib/canvas/refToFillGroup';
import type { RenderableGrid } from '@/lib/canvas/renderableGrid';
import type { DisplayOrganism } from '@/lib/displayOrganisms';
import { ERASER_TOOL, refForTool, type Tool } from '@/lib/tool';
import PetriDishCanvas from '../PetriDishCanvas';
import EditorStatusBar from './EditorStatusBar';
import OrganismRoster from './OrganismRoster';

// This story's slice of spec §3.3's ~13-prop interface: the ones this story can actually wire and
// verify. The REST of the sidebar (<BattleNameField> 2.11, <GridSettingsSection> 2.14,
// <EditorToolsSection> 2.15, <SidebarFooter> 2.16) and the rest of <EditorStatusBar>'s interface
// (stats 2.12, SAVE 2.13) bring the rest with them — declaring their props now would be an
// unverifiable claim this story cannot back up.
export interface BattleEditorViewProps {
  grid: RenderableGrid;
  size: { cols: number; rows: number };
  palette: RefToFillGroup;
  showGridLines: boolean; // FR-8.7
  // null when the theme token layer is absent (always under jsdom) — see EditorMain below.
  colors: GridRendererColors | null;
  /**
   * The roster union `<BattlePage>` owns (spec §3.1 `sessionRoster`, Decision H.2): the battle's
   * own `organismIds` followed by anything selected this session that is not in it yet. The
   * palette LUT is built over this SAME array, which is what keeps every ref resolved here a
   * valid index into it (trap 3 — an out-of-range ref paints as EMPTY with only a warn-once).
   *
   * ⚠️ Kept ALONGSIDE `roster` below, not replaced by it (Story 2.9 trap 2). This is the IDENTITY
   * array `refForTool` indexes; `roster` is the same order but not necessarily the same length,
   * because `resolveDisplayOrganisms` de-duplicates repeated ids. Deriving the refs from the
   * resolved list would shift every ref after a duplicate by one and repaint the grid.
   */
  rosterIds: readonly string[];
  /**
   * The SAME roster, resolved to names and colours for display (spec §3.4's `roster`, typed
   * `OrganismSummary[]` there — a type that does not exist; see the Story 2.9 Dev Agent Record).
   * `<BattlePage>` resolves it once so the chip a row paints and the cell the dish paints go
   * through one LUT.
   */
  roster: readonly DisplayOrganism[];
  /** AC7: `organisms.list()` failed. The roster's ids survive; its names and colours do not. */
  libraryUnavailable?: boolean;
  /**
   * THE undoable-commit seam (spec §3.3: "the one undoable-commit seam"). Story 2.6's stroke,
   * 2.7's erase, 2.8's undo source, 2.14's resize and 2.15's Clear all arrive here — one commit
   * per gesture, carrying a new grid value (RFC-005 Decision 6).
   */
  onCommitGrid(next: RenderableGrid): void;
  /**
   * Spec §3.3's `onUndo(): void; canUndo: boolean` line (FR-3.8), forwarded straight to
   * `<EditorStatusBar>`. `canUndo` is a BOOLEAN, not RFC-005 Decision 6's `() => boolean` snippet:
   * a function over a ref never re-renders, so the button's `disabled` would freeze at its mount
   * value — see `useUndoableGrid.ts` and the Story 2.8 Dev Agent Record.
   */
  onUndo(): void;
  canUndo: boolean;
}

/**
 * `<EditorMain>`'s own props: everything `<BattleEditorView>` receives, minus the roster it has
 * already resolved against, plus the resolved selection. The roster props stop here on purpose — a
 * layout child has no business re-deriving a ref its parent already holds.
 */
type EditorMainProps = Omit<
  BattleEditorViewProps,
  'rosterIds' | 'roster' | 'libraryUnavailable'
> & {
  tool: Tool;
  toolRef: number | null;
};

/**
 * The sidebar + main row. `<BattlePage>`'s `Root` is a flex COLUMN (header, then this), so the
 * Lab chassis needs its own row inside it — the mockup's `.sidebar { margin-top: 64px }` offsets a
 * `position: fixed` header this app deliberately keeps IN FLOW, and reproducing that offset would
 * leave a 64px gap under a header that never moved. The mockup's picture, not its CSS — the same
 * call `BattleHeader.tsx`, `GridContainer` and `EditorStatusBar.tsx` have each already made.
 */
const EditorLayout = styled('div')({
  flex: 1,
  display: 'flex',
  // Without this, a flex ITEM's min-height:auto floor keeps the row at its content height and the
  // sidebar's own `overflow-y: auto` never engages — the whole page scrolls instead.
  minHeight: 0,
});

// Mockup: .sidebar (clinical-lab-theme/petri-dish-lab-mode.html:98-109), minus the margin-top
// offset above and minus the footer (Story 2.16 — a Back button is the only thing that goes in it,
// and an empty sticky bar is the dead chrome NFR-4.1 forbids).
//
// `flexShrink: 0` so the 320px column is a constant the dish can be laid out against rather than
// a negotiation — paired with `minWidth: 0` on <MainContent>, which is what actually lets the dish
// give ground (trap 11: this story makes deferred-work.md's centred-flex overflow entry worse, and
// its fix belongs to Story 2.12; being deliberate about which side shrinks is the cheap half).
const EditorSidebar = styled('aside')({
  width: '320px',
  flexShrink: 0,
  display: 'flex',
  flexDirection: 'column',
  padding: '25px',
  paddingBottom: 0,
  background: 'var(--gol-bg-secondary)',
  borderRight: '1px solid var(--gol-border)',
  overflowY: 'hidden',
});

// Mockup: .sidebar-content (:110-118). The scrolling region — 2.11, 2.14 and 2.15 add sections
// into this same column and the `gap` is what will space them.
const SidebarContent = styled('div')({
  flex: 1,
  overflowY: 'auto',
  display: 'flex',
  flexDirection: 'column',
  gap: '25px',
  paddingBottom: '20px',
});

/**
 * Mockup: .sidebar-section / .sidebar-section-title (:149-164).
 *
 * Forced decision 5 (Story 2.9): built as a module-private styled pair NOW, exported only when a
 * second consumer arrives. Stories 2.11 (Battle Name), 2.14 (Grid Info) and 2.15 (Tools) each
 * mount a section into this same shell, so the frame is certainly shared — but a file move is
 * cheap and a premature public API is not, and with one consumer there is nothing yet to tell us
 * whether the shared thing is a styled pair or a `<SidebarSection title=…>` component.
 */
const SidebarSection = styled('section')({
  border: '1px solid var(--gol-border)',
  padding: '15px',
  background: 'var(--gol-bg-primary)',
});

// <h2>, where the mockup uses <h3>: the battle title is the route's only <h1> (BattleHeader), so
// h2 is the next level down and the sidebar's sections are siblings of each other. Reproducing the
// literal h3 would skip a level for no reason and trip axe's heading-order rule the moment 2.11
// adds the second section.
const SidebarSectionTitle = styled('h2')({
  fontSize: '13px',
  fontWeight: 600,
  color: 'var(--gol-text-primary)',
  textTransform: 'uppercase',
  letterSpacing: 'var(--gol-letter-spacing-title)',
  margin: '0 0 12px 0',
  paddingBottom: '8px',
  borderBottom: '1px solid var(--gol-border)',
});

// Mockup: .main-content (:434-441).
//
// Story 2.8: `position: relative` is GONE. Story 2.5 kept it as the containing block <EditorStatusBar>
// would one day position against; the status bar has now arrived and does not position at all — it
// is the last row of this flex column (EditorStatusBar.tsx records why the mockup's
// `position: fixed; left: 320px` is not reproduced). A retained property whose only justification
// is a future that already happened differently is dead CSS with a comment vouching for it.
const MainContent = styled('div')({
  flex: 1,
  // A flex item's default `min-width: auto` is its CONTENT width, so without this the dish refuses
  // to shrink below its own intrinsic size and pushes the sidebar off-screen instead (Story 2.9 —
  // the first story where anything competes with the dish for width).
  minWidth: 0,
  display: 'flex',
  flexDirection: 'column',
  background: 'var(--gol-bg-primary)',
});

// Mockup: .grid-container (:443-450). The mockup's padding-bottom: 80px reserves space for its
// `position: fixed` status bar. Story 2.8's <EditorStatusBar> is IN FLOW below this box instead,
// so `flex: 1` yields it the bar's real height and there is nothing left to reserve — the 80px
// stays unreproduced permanently, not "until 2.12".
const GridContainer = styled('div')({
  flex: 1,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '30px',
});

// Mockup: .petri-dish-grid (:452-459). Same box in every colour-availability state — the canvas
// (rendered only when `colors` resolves) fills it via DishCanvas below; the degraded state leaves
// it empty, matching BattleTile's PetriDish pattern.
const PetriDishBox = styled('div')({
  width: '100%',
  maxWidth: '1000px',
  aspectRatio: '5 / 3',
  background: 'var(--gol-bg-primary)',
  border: '2px solid var(--gol-border)',
});

// The canvas fills the box — the same `styled(PetriDishCanvas)` pattern BattleTile's DishCanvas
// uses.
const DishCanvas = styled(PetriDishCanvas)({
  width: '100%',
  height: '100%',
  display: 'block',
  // Forced decision 6 (Story 2.5): the mockup's `.petri-dish-grid` carries no `cursor` rule
  // (petri-dish-lab-mode.html:452-459), so there is nothing to copy — but a paintable surface
  // that keeps the default arrow reads as inert. `crosshair` over `cell` because the pointer is
  // placing a point, and it is the affordance every drawing surface already uses. One line, and
  // reversible. Styled HERE, not in <PetriDishCanvas>, because only the EDIT variant is
  // paintable and this styled wrapper is edit-only.
  cursor: 'crosshair',
  // Story 2.6 forced decision 4 / AC8, closing the deferred-work.md entry this story owns.
  // `touch-action: none` is the declarative, capture-friendly form RFC-002 Risk 5's whole
  // rationale for Pointer Events (touch support) actually needs: it must be CSS on the element
  // receiving the pointer, set BEFORE the gesture starts — setting it from inside a handler is
  // too late for the gesture already in progress. Without it, a touch drag on the dish scrolls
  // the page instead of painting, fighting `<PetriDishCanvas>`'s stroke for the same input.
  // `userSelect: 'none'` is the narrower mouse-side counterpart: a fast mouse drag across the
  // dish would otherwise start a native text/image selection, the same "browser fighting the
  // gesture" AC8 names for touch. Neither of these calls `event.preventDefault()` on
  // pointer-down — both are declarative CSS the UA reads before the gesture starts, which is
  // sufficient for what AC8 actually asks (no scroll, no selection); `preventDefault()` would
  // additionally suppress native drag-and-drop, which nothing here needs and which cannot be
  // expressed as CSS, so it stays unused rather than added "for completeness".
  touchAction: 'none',
  userSelect: 'none',
});

/**
 * `<EditorMain>` is a private layout child (component-tree-battle-page.md §3.3: "`<EditorSidebar>`
 * / `<EditorMain>` are private layout children, not shared") — declared here rather than exported,
 * exactly as `<BattleHeader>`'s file keeps no private siblings public.
 *
 * Story 2.9: the provisional tool toggle is GONE from here, along with its `ToolbarRow`,
 * `handleToolKindChange` and both `@mui/material` component imports. Story 2.7 shipped it with a
 * comment promising exactly this ("Story 2.9's `<OrganismRoster>` replaces this whole block … in
 * one commit"), and AC3 is that promise: a battle route carrying two tool pickers is the worst
 * form of the dead affordance NFR-4.1 forbids — two live controls for one piece of state.
 */
function EditorMain({
  grid,
  size,
  palette,
  showGridLines,
  colors,
  tool,
  toolRef,
  onCommitGrid,
  onUndo,
  canUndo,
}: EditorMainProps) {
  return (
    <MainContent>
      <GridContainer>
        <PetriDishBox>
          {/* `readGridColors` returns null when the token layer is absent (always under jsdom,
              and for any future root that loses it — themeColors.ts). Degrade to the dish BOX
              with no canvas inside, the same "unavailable -> blank dish, same box" pattern
              BattleTile uses — never substitute a literal colour (AR-46, and it would silently
              paint the wrong theme). */}
          {colors !== null && (
            <DishCanvas
              variant="edit"
              grid={grid}
              size={size}
              palette={palette}
              showGridLines={showGridLines}
              colors={colors}
              tool={tool}
              toolRef={toolRef}
              /* The canvas commits; this component only forwards. Nothing is transformed on the
                 way through — <BattlePage> owns what a commit MEANS (held state today, Story
                 2.8's undo ring tomorrow), and a translation layer here would be a second place
                 to keep those two in step. */
              onStrokeCommit={onCommitGrid}
            />
          )}
        </PetriDishBox>
      </GridContainer>
      {/* Spec §3.8 / FR-3.8. Forwarded, never interpreted: the undo ring lives in <BattlePage>
          (RFC-005 Decision 6), so this component holds no history state of its own. */}
      <EditorStatusBar onUndo={onUndo} canUndo={canUndo} />
    </MainContent>
  );
}

/**
 * FR-3.3 / M6: "two organisms placed in the same battle share a colour" — **two non-blocking
 * warnings**, so BOTH members of a colliding pair are returned, never just the later one.
 *
 * ⚠️ Compares `colorToken`, not the resolved hex and not the name (trap 4). The token IS the
 * colour's identity: comparing resolved hexes happens to give the same answer today only because
 * every palette hex is distinct, which quietly makes an FR-3.3 rule depend on the `displayColor`
 * LUT staying collision-free forever.
 */
function findDuplicateColorIds(roster: readonly DisplayOrganism[]): readonly string[] {
  const countByToken = new Map<string, number>();
  for (const organism of roster) {
    countByToken.set(organism.colorToken, (countByToken.get(organism.colorToken) ?? 0) + 1);
  }
  return roster
    .filter((organism) => (countByToken.get(organism.colorToken) ?? 0) > 1)
    .map((organism) => organism.id);
}

/**
 * The EFFECTIVE tool: the user's explicit choice when it is still valid, and the roster's own
 * default otherwise. Forced decision 4 (Story 2.9) is what makes this necessary.
 *
 * `<BattlePage>` used to seed the session roster with `DEFAULT_TOOL.organismId` unconditionally,
 * purely so the first click resolved to a ref. That was invisible plumbing while nothing rendered
 * the roster; the moment it is a visible list, it puts Conway's Classic in every battle's sidebar
 * as a fourth row the user never added and that Decision H says is not part of that battle. The
 * seed is now conditional (`<BattlePage>`), which means `DEFAULT_TOOL` is no longer guaranteed to
 * be IN the roster — so "the default selection" has to be a property of the roster rather than a
 * constant.
 *
 * Derived, not synchronised in an effect: the roster identity changes when the route switches to
 * another battle, and a `useState` seeded from the first roster would keep pointing at an organism
 * the new battle has never heard of — `refForTool` returns null, the dish goes silently
 * unpaintable, and NO row renders as selected (AC2 requires exactly one, always). This derivation
 * makes both impossible without a second state cell to keep in step.
 *
 * ⚠️ Side effect worth knowing: `refForTool` can no longer return null from here. The organism arm
 * is only ever returned after confirming the id is in the roster, and every other path yields the
 * eraser, which resolves to ref 0. See `deferred-work.md` on the `toolRef === null` reclaim
 * ordering, which this closes by construction rather than by reordering the guard.
 */
function resolveSelectedTool(
  chosen: Tool | null,
  roster: readonly DisplayOrganism[],
  libraryUnavailable: boolean,
): Tool {
  // AC7: nothing in the roster can be named or coloured, so nothing in it can be meaningfully
  // chosen. Erasing still works — it needs no organism — and saying so is what the degraded
  // notice does.
  if (libraryUnavailable) return ERASER_TOOL;

  if (chosen !== null) {
    if (chosen.kind === 'eraser') return chosen;
    if (roster.some((organism) => organism.id === chosen.organismId)) return chosen;
  }

  // Spec §3.3 leaves the initial selection to the story and suggests exactly this: "first roster
  // row; eraser when the roster is empty".
  const first = roster[0];
  return first === undefined ? ERASER_TOOL : { kind: 'organism', organismId: first.id };
}

/**
 * The Lab-mode composition root (component-tree-battle-page.md §3.3, §2). Composes
 * `<EditorSidebar>` — which ships with exactly ONE real section, Organisms — and `<EditorMain>`,
 * which carries `<EditorStatusBar>` (Story 2.8).
 *
 * ❌ No sidebar footer and no Back button (Story 2.16). ❌ No Battle Name (2.11), Grid Info (2.14)
 * or Tools (2.15) section. Story 2.4 declined to ship a half-built sidebar and that call stands:
 * what arrives here is one complete responsibility, not a panel of placeholders for five.
 *
 * ⚠️ §3.3's "instantiates no hooks" line is about the GRID and UNDO hooks, which live in
 * `<BattlePage>` (`useUndoableGrid`, Story 2.8) — the same section's State line explicitly
 * assigns `selectedTool: Tool` to THIS component as its ephemeral local state, and
 * `duplicateColorIds` to it as a derivation. The hooks below are those two lines, not a violation
 * of the other; the doc comment previously read as the stronger claim and was corrected rather
 * than obeyed.
 */
export default function BattleEditorView({
  rosterIds,
  roster,
  libraryUnavailable = false,
  ...rest
}: BattleEditorViewProps) {
  // The user's EXPLICIT choice, and only that. `null` means "has not chosen yet", which is a
  // different fact from any particular tool and is why it is not seeded with one — see
  // `resolveSelectedTool`.
  const [chosenTool, setChosenTool] = useState<Tool | null>(null);

  const selectedTool = useMemo(
    () => resolveSelectedTool(chosenTool, roster, libraryUnavailable),
    [chosenTool, roster, libraryUnavailable],
  );

  // Forced decision 2 (Story 2.5): the tool -> ref resolution lives HERE, not in the canvas.
  // This component owns the selection and the canvas is a rendering surface with no business
  // knowing what an organism id is. Memoised so the canvas's `toolRef` identity is stable across
  // unrelated renders.
  //
  // ⚠️ `rosterIds`, not `roster` (trap 2) — see the prop's own comment.
  const toolRef = useMemo(() => refForTool(selectedTool, rosterIds), [selectedTool, rosterIds]);

  // Spec §6 assigns this derivation to this component, memoised on roster identity — "recomputed
  // per committed gesture, never per pointer-move" (NFR-4.2). `roster`'s identity changes only
  // when <BattlePage>'s own memo rebuilds it, which is per load and per roster change, not per
  // render.
  const duplicateColorIds = useMemo(() => findDuplicateColorIds(roster), [roster]);

  return (
    <EditorLayout>
      <EditorSidebar>
        <SidebarContent>
          <SidebarSection>
            <SidebarSectionTitle>Organisms</SidebarSectionTitle>
            {/* Selection stays HERE (spec §3.3, §6): the roster is handed the value and the
                setter and holds none of its own. `setChosenTool` is passed directly — it is a
                stable identity, and wrapping it would only add a layer that can drift. */}
            <OrganismRoster
              roster={roster}
              selectedTool={selectedTool}
              onSelectTool={setChosenTool}
              duplicateColorIds={duplicateColorIds}
              libraryUnavailable={libraryUnavailable}
            />
          </SidebarSection>
        </SidebarContent>
      </EditorSidebar>
      <EditorMain {...rest} tool={selectedTool} toolRef={toolRef} />
    </EditorLayout>
  );
}
