'use client';

import { styled } from '@mui/material/styles';
import type { GridRendererColors } from '@/lib/canvas/gridRenderer';
import type { RefToFillGroup } from '@/lib/canvas/refToFillGroup';
import type { RenderableGrid } from '@/lib/canvas/renderableGrid';
import PetriDishCanvas from '../PetriDishCanvas';

// This story's slice of spec §3.3's ~13-prop interface: five props, the ones this story can
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
}

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
});

/**
 * `<EditorMain>` is a private layout child (component-tree-battle-page.md §3.3: "`<EditorSidebar>`
 * / `<EditorMain>` are private layout children, not shared") — declared here rather than exported,
 * exactly as `<BattleHeader>`'s file keeps no private siblings public.
 */
function EditorMain({ grid, size, palette, showGridLines, colors }: BattleEditorViewProps) {
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
 * be stubbed here: an empty rendered panel is a dead affordance NFR-4.1 forbids. `instantiates no
 * hooks` per §3.3 — this component is a pure composition, so every value it needs arrives as a
 * prop from `<BattlePage>` rather than being resolved here.
 */
export default function BattleEditorView(props: BattleEditorViewProps) {
  return <EditorMain {...props} />;
}
