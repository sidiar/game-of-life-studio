'use client';

import { useCallback, useMemo, useState, type MouseEvent as ReactMouseEvent } from 'react';
import { styled } from '@mui/material/styles';
// Per-component imports only (AR-35) — no `@mui/x-*`, and the barrel is never imported.
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import type { GridRendererColors } from '@/lib/canvas/gridRenderer';
import type { RefToFillGroup } from '@/lib/canvas/refToFillGroup';
import type { RenderableGrid } from '@/lib/canvas/renderableGrid';
import { DEFAULT_TOOL, ERASER_TOOL, refForTool, type Tool } from '@/lib/tool';
import PetriDishCanvas from '../PetriDishCanvas';

// This story's slice of spec §3.3's ~13-prop interface: seven props, the ones this story can
// actually wire and verify. The sidebar (<OrganismRoster> 2.9, <BattleNameField> 2.11,
// <GridSettingsSection> 2.14, <EditorToolsSection> 2.15, <SidebarFooter> 2.16) and
// <EditorStatusBar> (2.12) bring the rest with them — declaring their props now would be an
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
   */
  rosterIds: readonly string[];
  /**
   * THE undoable-commit seam (spec §3.3: "the one undoable-commit seam"). Story 2.6's stroke,
   * 2.7's erase, 2.8's undo source, 2.14's resize and 2.15's Clear all arrive here — one commit
   * per gesture, carrying a new grid value (RFC-005 Decision 6).
   */
  onCommitGrid(next: RenderableGrid): void;
}

/**
 * `<EditorMain>`'s own props: everything `<BattleEditorView>` receives, minus the roster it has
 * already resolved against, plus the resolved selection. `rosterIds` stops here on purpose — a
 * layout child has no business re-deriving a ref its parent already holds.
 */
type EditorMainProps = Omit<BattleEditorViewProps, 'rosterIds'> & {
  tool: Tool;
  toolRef: number | null;
  onSelectTool(tool: Tool): void;
};

// Mockup: .main-content (clinical-lab-theme/petri-dish-lab-mode.html:434-441). The mockup's
// margin-top: 64px offsets a position: fixed header this app deliberately does not pin
// (BattleHeader.tsx) — reproducing the offset without the pin would leave a 64px gap under a
// header that never moved. `position: relative` is the future containing block for 2.12's
// <EditorStatusBar> overlay; nothing positions against it yet.
const MainContent = styled('div')({
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  background: 'var(--gol-bg-primary)',
  position: 'relative',
});

// Story 2.7's provisional tool toggle (forced decision 1(a) — see the toggle's own comment
// below). No mockup row backs this exact strip; it is a placeholder, not a reproduction.
const ToolbarRow = styled('div')({
  display: 'flex',
  justifyContent: 'center',
  padding: '16px 30px 0',
});

// Mockup: .grid-container (:443-450). The mockup's padding-bottom: 80px reserves space for the
// status bar — Story 2.12 restores it; 80px of empty reserve under nothing today would not match
// the mockup's own picture, only its literal CSS.
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
  onSelectTool,
}: EditorMainProps) {
  // MUI's exclusive ToggleButtonGroup fires onChange with `value === null` when the user clicks
  // the ALREADY-selected option (Dev Notes "Latest technical information") — ignored rather than
  // clearing the tool, which an unhandled null would do. `selectedTool` stays the single source of
  // truth either way: this only ever forwards one of the two real `Tool` values to it, never a
  // second "is the eraser on" boolean living beside the union (trap 7).
  const handleToolKindChange = useCallback(
    (_event: ReactMouseEvent<HTMLElement>, value: 'organism' | 'eraser' | null) => {
      if (value === null) return;
      onSelectTool(value === 'eraser' ? ERASER_TOOL : DEFAULT_TOOL);
    },
    [onSelectTool],
  );

  return (
    <MainContent>
      {/* Story 2.7 AC5's provisional toggle — forced decision 1(a): a two-option
          `ToggleButtonGroup` rather than a stub `<EditorSidebar>` (Story 2.4 already declined to
          ship a half-built panel) or a hand-rolled single toggle button (a group renders the
          selection's actual two-state shape and gives keyboard operation + `aria-pressed` for
          free). PROVISIONAL: Story 2.9's `<OrganismRoster>` replaces this whole block — roster
          rows plus a pinned eraser row — in one commit; nothing here is a down payment on that
          component, so deleting this block deletes the feature cleanly. */}
      <ToolbarRow>
        <ToggleButtonGroup
          value={tool.kind}
          exclusive
          onChange={handleToolKindChange}
          aria-label="Editing tool"
          size="small"
        >
          <ToggleButton value="organism" aria-label="Draw">
            Draw
          </ToggleButton>
          <ToggleButton value="eraser" aria-label="Erase">
            Erase
          </ToggleButton>
        </ToggleButtonGroup>
      </ToolbarRow>
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
    </MainContent>
  );
}

/**
 * The Lab-mode composition root (component-tree-battle-page.md §3.3, §2). Today composes ONLY
 * `<EditorMain>` — the sidebar and `<EditorStatusBar>` are later stories (2.9-2.16) and must not
 * be stubbed here: an empty rendered panel is a dead affordance NFR-4.1 forbids.
 *
 * ⚠️ §3.3's "instantiates no hooks" line is about the GRID and UNDO hooks, which live in
 * `<BattlePage>` (`useUndoableGrid`, Story 2.8) — the same section's State line explicitly
 * assigns `selectedTool: Tool` to THIS component as its ephemeral local state. Story 2.5's
 * `useState` below is that line, not a violation of the other; the doc comment previously read as
 * the stronger claim and was corrected rather than obeyed.
 */
export default function BattleEditorView({ rosterIds, ...rest }: BattleEditorViewProps) {
  // AC5: Conway's Classic until Story 2.9's roster UI replaces this whole selection with a real
  // one. Story 2.7 is the one that reads the setter — `<EditorMain>`'s provisional toggle both
  // DISPLAYS this state and SETS it, and nothing else does: no second "is the eraser on" boolean
  // beside the union (trap 7), which is how the two would silently disagree.
  const [selectedTool, setSelectedTool] = useState<Tool>(DEFAULT_TOOL);

  // Forced decision 2 (Story 2.5): the tool -> ref resolution lives HERE, not in the canvas.
  // This component already owns `selectedTool` and will own the roster wiring in 2.9, and the
  // canvas is a rendering surface with no business knowing what an organism id is. Memoised so
  // the canvas's `toolRef` identity is stable across unrelated renders.
  const toolRef = useMemo(() => refForTool(selectedTool, rosterIds), [selectedTool, rosterIds]);

  return (
    <EditorMain {...rest} tool={selectedTool} toolRef={toolRef} onSelectTool={setSelectedTool} />
  );
}
