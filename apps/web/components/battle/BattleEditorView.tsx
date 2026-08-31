'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { styled } from '@mui/material/styles';
import { MAX_BATTLE_NAME_LENGTH, type EditableGridPreset } from '@gol/domain';
import type { GridRendererColors } from '@/lib/canvas/gridRenderer';
import type { RefToFillGroup } from '@/lib/canvas/refToFillGroup';
import type { RenderableGrid } from '@/lib/canvas/renderableGrid';
import type { DisplayOrganism } from '@/lib/displayOrganisms';
import { clearGrid } from '@/lib/clearGrid';
import { computeEditorGridStats } from '@/lib/gridStats';
import { countClippedLivingCells, resizeGrid } from '@/lib/resizeGrid';
import { ERASER_TOOL, refForTool, type Tool } from '@/lib/tool';
import { useInertBackground } from '@/lib/useInertBackground';
import PetriDishCanvas from '../PetriDishCanvas';
import BattleNameField from './BattleNameField';
import EditorStatusBar, { type EditorStatusBarStats } from './EditorStatusBar';
import EditorToolsSection from './EditorToolsSection';
import GridSettingsSection, { presetKey } from './GridSettingsSection';
import OrganismRoster from './OrganismRoster';
import SidebarSection from './SidebarSection';

/**
 * Forced decision 4, option (b): the resize warning is loaded ON DEMAND, not statically imported.
 *
 * `/battle` is the tightest bundle budget in the repo, and the MUI `Dialog` stack is not cheap —
 * Story 1.13 measured its arrival on the home route at **+18.1 KB gzip** (288.2 -> 306.3) against
 * the 8.5 KB of headroom Story 2.13 left here. A static import does not fit, and the budget is
 * never raised without Sidiar's explicit approval (both existing raises in
 * `scripts/check-bundle-size.mjs` carry his name and the measurement they came from).
 *
 * AR-35 already sanctions this shape — "per-component imports for tree-shaking; **dynamic import
 * for heavy components**" — so this is an established convention arriving early rather than a new
 * one, and it is the first working example for Epic 4's lazy `<OrganismEditorModal>` (spec §3.15).
 * The chunk is genuinely rare: it loads only when a shrink would actually clip living cells.
 *
 * ⚠️ **Story 2.16's `<UnsavedChangesDialog>` lands on this same route and inherits this call.**
 *
 * `ssr: false` because the dialog can never be part of the first paint (`open` is false until a
 * user gesture) and this app is a static export — prerendering a closed dialog would put the whole
 * stack back into the route's HTML, which is the cost this avoids.
 *
 * **Measured, all three variants, same tree (Story 2.14 Task 8):**
 * static import 320.8 KB — **over the 310 budget by 10.8 KB**, i.e. option (a) does not fit and
 * would need a raise only Sidiar can give; `React.lazy` + `<Suspense>` 303.0 KB; this
 * (`next/dynamic`) **304.1 KB**. The 1.1 KB `next/dynamic` costs over bare `React.lazy` buys the
 * convention AR-35 names and the Suspense boundary it manages itself, on a route that has 6.0 KB
 * of headroom either way.
 */
const ResizeClipWarningDialog = dynamic(() => import('./ResizeClipWarningDialog'), { ssr: false });

// Spec §3.3's ~13-prop interface. Story 2.14 adds NOTHING to it: the resize is derived from
// `grid` and committed through the existing `onCommitGrid` seam, so <GridSettingsSection> and its
// confirm dialog need no new input from <BattlePage> (see the resize handler below, and the ❌ in
// this component's own doc comment). The remaining sidebar sections (<EditorToolsSection> 2.15,
// <SidebarFooter> 2.16) bring whatever they need with them — declaring their props now would be an
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
   * Story 2.10 (FR-7.15, spec §3.4): the full shared library minus `rosterIds` — resolved for
   * display exactly like `roster` above, by the same `<BattlePage>` call so a dropdown entry can
   * never disagree with the row it becomes. `<OrganismRoster>`'s add control renders this list;
   * this component does not touch it beyond forwarding.
   */
  library: readonly DisplayOrganism[];
  /**
   * Story 2.10 code review (AC8, trap 7): the WORKSPACE library holds nothing at all, as opposed
   * to `library` above being empty because the roster has consumed it. Two different facts, two
   * different messages — see `<OrganismRoster>`'s add control. ❌ Not `libraryUnavailable`: the
   * list loaded fine, it is simply empty.
   */
  workspaceEmpty?: boolean;
  /**
   * Story 2.10 (AC3): "+ ADD ORGANISM" -> `sessionRoster` (Decision H.2). `<BattlePage>` owns the
   * write; this component wraps it with forced decision 1's add-AND-select policy before handing
   * it to `<OrganismRoster>` — see `handleAddToRoster` below.
   */
  onAddToRoster(organismId: string): void;
  /**
   * Story 2.10 (AC5, Decision G.3): `rosterIds.length >= MAX_ROSTER_SIZE`, computed by
   * `<BattlePage>` off the IDENTITY array — never `roster.length` (trap 2). The add control
   * disables itself and states the limit rather than letting a 256th ref be spent.
   */
  atCap: boolean;
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
  /**
   * Story 2.11 (spec §3.5, AC1/AC2): the LIVE edited value — `<BattlePage>` owns it, seeded from
   * the loaded battle's stored name. Threaded straight to `<BattleNameField>`; this component does
   * not read it for anything else (the header is fed separately, by `<BattlePage>`, not through
   * this component at all).
   */
  battleName: string;
  /** Story 2.11 (AC1, AC3): fires on every keystroke; `<BattlePage>` sets both the name and
   * `isDirty` in the same handler. */
  onNameChange(name: string): void;
  /**
   * Story 2.13 (FR-7.8, spec §3.3 lists both as PROPS): forwarded to `<EditorStatusBar>`
   * untouched. ⚠️ Unlike `stats` these are INPUTS, not derivations — `<BattlePage>` owns the dirty
   * flag (AR-27/28) and owns what a save means, so this component neither computes nor interprets
   * either one.
   */
  isDirty: boolean;
  onSave(): void;
  /**
   * Story 2.13 (AC5 / NFR-7.2, forced decision 4b): a refused save's message, or `null`. Rendered
   * as a `role="alert"` line ABOVE the status bar, in flow — not inside the bar, whose right group
   * is `flexShrink: 0` and whose overflow the 2026-08-28 review had to fix; and not a modal, which
   * over an editor whose state is fully intact would be a worse answer than a line of text.
   */
  saveError: string | null;
  /** Story 2.13 (AC4): a write is in flight, so SAVE is unavailable — see its prop comment on
   * `EditorStatusBarProps`. */
  isSaving: boolean;
}

/**
 * `<EditorMain>`'s own props: everything `<BattleEditorView>` receives, minus the roster it has
 * already resolved against, plus the resolved selection. The roster props stop here on purpose — a
 * layout child has no business re-deriving a ref its parent already holds.
 */
type EditorMainProps = Omit<
  BattleEditorViewProps,
  | 'rosterIds'
  | 'roster'
  | 'libraryUnavailable'
  | 'library'
  | 'workspaceEmpty'
  | 'onAddToRoster'
  | 'atCap'
  | 'battleName'
  | 'onNameChange'
> & {
  tool: Tool;
  toolRef: number | null;
  /**
   * Story 2.12 (spec §6, trap 5): `<BattleEditorView>` DERIVES the stats; they are not an input
   * to it, so this lives on `EditorMainProps`, never on `BattleEditorViewProps`. Adding it there
   * would force `<BattlePage>` to supply a value it does not compute and would move the
   * derivation up a level.
   */
  stats: EditorStatusBarStats;
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
  // review (2026-08-28): the HEIGHT counterpart, and the other half of AC6. `min-height: auto` is
  // the same content floor in the block direction; without this, this column grows to its
  // content's height instead of being bounded by `<EditorLayout>`'s row, and every percentage
  // height below it resolves against a container that has already expanded to fit.
  minHeight: 0,
  display: 'flex',
  flexDirection: 'column',
  background: 'var(--gol-bg-primary)',
});

// Mockup: .grid-container (:443-450). The mockup's padding-bottom: 80px reserves space for its
// `position: fixed` status bar. Story 2.8's <EditorStatusBar> is IN FLOW below this box instead,
// so `flex: 1` yields it the bar's real height and there is nothing left to reserve — the 80px
// stays unreproduced permanently, not "until 2.12".
//
// ⚠️ A `display: 'grid'` + `placeItems: 'center'` version of this container was tried during
// Story 2.12 and reverted. That experiment was paired with a `width: 'auto'` `<PetriDishBox>`,
// which the review then reverted as well (see that component's own ⚠️ note — an auto width
// re-broke `<PetriDishCanvas>`'s ResizeObserver invariant). Flex is kept here regardless: it is
// unchanged in kind from before this story, `align-items: center` is what the dish-overflow
// entry describes, and the shipped `<PetriDishBox>` bounds itself on BOTH axes
// (`maxHeight: '100%'` + `minWidth: 0`) rather than relying on the container's display mode to
// do it. Changing this container is not required by AC6 and would put the narrow-viewport
// regression test (e2e, 700x500) at risk for no gain.
const GridContainer = styled('div')({
  flex: 1,
  // review (2026-08-28) — AC6's load-bearing line, and the reason the story's first commit did not
  // actually fix the overflow it set out to fix. `flex: 1` alone does NOT bound this box: a flex
  // item's `min-height: auto` floor is its CONTENT height, so this container silently grew to
  // whatever `<PetriDishBox>` asked for, and the child's `maxHeight: '100%'` then resolved against
  // that already-expanded height — a cap that can never bind. Measured before this line at
  // 1400x420: `documentElement.scrollHeight` 784 vs `clientHeight` 420, i.e. the dish still ran
  // 278px past the fold, exactly the defect deferred-work.md describes. With `minHeight: 0` the
  // container is bounded by the column instead, and the child's cap becomes real.
  minHeight: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '30px',
});

// Mockup: .petri-dish-grid (:452-459). Same box in every colour-availability state — the canvas
// (rendered only when `colors` resolves) fills it via DishCanvas below; the degraded state leaves
// it empty, matching BattleTile's PetriDish pattern.
//
// Story 2.12 (AC6, forced decision 4, option b): `maxHeight: '100%'` is the whole fix — the width
// stays DEFINITE. The pre-2.12 pair (`width: '100%'` with no height cap) let a wide-but-short
// viewport (a laptop, once Story 2.9's 320px sidebar and this story's own in-flow status bar both
// take their share) compute a height taller than `<GridContainer>`'s available space; a centred
// flex item's TOP overflow is unreachable by scrolling, so part of the dish was genuinely
// unviewable (deferred-work.md). `maxHeight: '100%'` bounds the ratio-derived height to whatever
// `<GridContainer>` actually has, and `minWidth: 0` lets this flex item shrink below its
// content's min-content width on a narrow viewport instead of forcing the container wider.
// `maxWidth: '1000px'` is kept so the box still stops growing past its historical ceiling.
//
// ⚠️ DO NOT change `width` to `auto` here. It was shipped that way in this story's first commit
// and reverted in review (2026-08-28), because `<PetriDishBox>` is the element
// `<PetriDishCanvas>`'s `ResizeObserver` OBSERVES (it observes `canvas.parentElement` — see that
// file's Task 4 comment, which states the loop is "broken by construction" precisely because
// "the parent's box is never written by paint()"). An `auto` width makes this box's width
// CONTENT-derived, and its only content is the canvas whose intrinsic `width`/`height` attributes
// `paint()` writes — so paint -> canvas intrinsic size -> parent's auto width -> observer ->
// paint. That re-broke the invariant and produced 20 e2e failures across all four Playwright
// projects, every one of them the browser's `"ResizeObserver loop completed with undelivered
// notifications."` error tripping this suite's clean-console assertions. A definite width
// (`100%`, resolved against the container, never against the canvas) breaks the cycle.
//
// When `maxHeight` binds, the box is no longer exactly 5:3 and `aspect-ratio` yields to the cap.
// That is fine and is not a fallback: `computeGridLayout` takes `Math.min` of the per-axis cell
// sizes and centres the result, so the whole grid stays visible (FR-3.2) — letterboxed inside the
// box rather than clipped by it.
const PetriDishBox = styled('div')({
  width: '100%',
  minWidth: 0,
  maxWidth: '1000px',
  maxHeight: '100%',
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
 * Story 2.13 (AC5, forced decision 4b): a refused save, reported in flow directly above the status
 * bar. There is no mockup for this — the mockup draws no failure state at all — so the styling
 * borrows the bar's own surface (`--gol-bg-secondary`, matching `<EditorStatusBar>`'s `Bar`) and
 * reads as the same piece of bottom chrome rather than as a floating panel.
 *
 * ⚠️ `--gol-danger` on `--gol-bg-secondary` specifically: that pair is gated at ≥4.5:1
 * (`themeTokens.test.ts`), while `--gol-danger` on `--gol-bg-hover` measures 4.48 and is
 * deliberately excluded there. Do not restyle this onto a hover surface.
 *
 * `role="alert"` (assertive) is right here in a way it was NOT for Story 2.12's stats: a failed
 * save is an event the user caused and must not miss, not a passive summary of a surface they are
 * looking at. Rendered CONDITIONALLY (the element appears when the message does), which is what
 * makes an assertive region announce — a permanently mounted one whose text changes announces too,
 * but leaves an empty, named, focusable-by-screen-reader landmark on the page at all other times.
 */
const SaveErrorLine = styled('p')({
  margin: 0,
  padding: '10px 25px',
  fontSize: '12px',
  lineHeight: 1.5,
  color: 'var(--gol-danger)',
  background: 'var(--gol-bg-secondary)',
  borderTop: '1px solid var(--gol-border)',
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
  stats,
  onCommitGrid,
  onUndo,
  canUndo,
  onSave,
  isDirty,
  isSaving,
  saveError,
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
      {/* AC5: above the bar, in flow — so the bar's own layout is untouched and an
          arbitrary-length message cannot push UNDO/SAVE off the `flexShrink: 0` side. */}
      {saveError !== null && <SaveErrorLine role="alert">{saveError}</SaveErrorLine>}
      {/* Spec §3.8 / FR-3.8 / FR-7.8. Forwarded, never interpreted: the undo ring lives in
          <BattlePage> (RFC-005 Decision 6) and so does everything a save means (AR-27/28), so this
          component holds neither history nor save state of its own. `stats` is Story 2.12's
          derivation (below), forwarded the same way. */}
      <EditorStatusBar
        onUndo={onUndo}
        canUndo={canUndo}
        stats={stats}
        onSave={onSave}
        isDirty={isDirty}
        isSaving={isSaving}
      />
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
 *
 * ⚠️ DANGLING ids are excluded from the comparison entirely, on BOTH sides — they are not counted
 * and they are never returned (Story 2.9 review, decision 2, Sidiar's option (b)).
 *
 * The reason is that `resolveDisplayOrganisms`' fallback paints in `DEFAULT_COLOR_TOKEN`, and that
 * token is 'sky-blue' — which is Conway's Classic's OWN token, not a spare. Counting the fallback
 * therefore made the commonest corrupt shape (one dangling id in a battle that also places Conway's
 * Classic) mark a perfectly healthy organism as sharing a colour with a record that does not
 * exist. A user cannot act on that: there is no second organism to recolour.
 *
 * ❌ NOT solved with a sentinel `colorToken` that no palette entry can equal (the review's option
 * (a)). That would keep the pair of danglers warning about each other — which is just as
 * unactionable — and it would push a non-palette token into `DisplayOrganism.colorToken`, a field
 * `<BattleTile>` also reads and Story 4.9's CVD work will read again. Excluding here keeps the
 * fallback's contract honest (`colorToken` remains the token it is actually PAINTED in) and
 * confines the judgement to the one rule that cannot use it.
 */
function findDuplicateColorIds(roster: readonly DisplayOrganism[]): readonly string[] {
  const comparable = roster.filter((organism) => organism.unresolved !== true);

  const countByToken = new Map<string, number>();
  for (const organism of comparable) {
    countByToken.set(organism.colorToken, (countByToken.get(organism.colorToken) ?? 0) + 1);
  }
  return comparable
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
 * `<EditorSidebar>` — which ships with FOUR real sections, Organisms, Battle Name, Grid Info and
 * Tools (Story 2.15) — and `<EditorMain>`, which carries `<EditorStatusBar>` (Story 2.8).
 *
 * ❌ No sidebar footer and no Back button (Story 2.16) — Story 2.4 declined to ship a half-built
 * sidebar and that call stands: each section arrives complete, not as a panel of placeholders for
 * the rest.
 *
 * ❌ **No `gridSize` state, no `pendingSize`, no `draft.gridSize` write** (Story 2.8 forced
 * decision 4). `size` is DERIVED from `grid` in `<BattlePage>`, so a resize is a grid COMMIT and
 * nothing else — a second source for the dimensions would be a render in which `size` and `grid`
 * disagree, and that disagreement is `GridRendererDimensionMismatchError` thrown out of the
 * canvas's passive effect, unmounting the editor. The pending-confirmation state below is the only
 * new cell, it holds a REQUEST rather than a size, and it is cleared without ever being applied on
 * the cancel path.
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
  library,
  workspaceEmpty = false,
  onAddToRoster,
  atCap,
  battleName,
  onNameChange,
  // Story 2.13 (Sidiar's call, 2026-08-28): pulled out of `...rest` for the SAME reason as `grid`
  // below — the name field needs it directly. Still forwarded to `<EditorMain>` explicitly, which
  // is what keeps `<EditorStatusBar>`'s two buttons receiving it.
  isSaving,
  // Story 2.12 (Task 3): destructured explicitly rather than left inside `...rest`, because the
  // stats memo below needs it directly. Forwarded to `<EditorMain>` explicitly further down —
  // pulling it out of the destructure does not remove it from what that component receives.
  grid,
  // Story 2.14: same treatment, same reason — the resize handlers below call it directly. Still
  // forwarded to `<EditorMain>`, which is what keeps the canvas's stroke commits arriving.
  onCommitGrid,
  ...rest
}: BattleEditorViewProps) {
  // The user's EXPLICIT choice, and only that. `null` means "has not chosen yet", which is a
  // different fact from any particular tool and is why it is not seeded with one — see
  // `resolveSelectedTool`.
  const [chosenTool, setChosenTool] = useState<Tool | null>(null);

  // Forced decision 1 (Story 2.10), option (b): add AND select — one intent, one outcome. Wired
  // HERE rather than in `<OrganismRoster>` because the selection (`setChosenTool`) is this
  // component's own state (spec §3.3); `<OrganismRoster>` only ever gets the single callback it
  // already has a slot for. `<BattlePage>`'s `onAddToRoster` and this component's `setChosenTool`
  // both fire inside the same event handler, so React batches them into ONE commit — `roster` and
  // `rosterIds` already include the new id by the time `resolveSelectedTool` re-validates the
  // choice below, so the new row renders selected on the very same paint, never a flash of the old
  // selection first.
  //
  // This is a UX commitment Epic 4's create-from-battle (Story 4.25) inherits: an organism reached
  // via this sidebar becomes both present AND selected in one action.
  const handleAddToRoster = useCallback(
    (organismId: string) => {
      onAddToRoster(organismId);
      setChosenTool({ kind: 'organism', organismId });
    },
    [onAddToRoster],
  );

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

  // AC4 / spec §3.3, §6: "derived per commit … memoized on grid/roster identity — recomputed per
  // committed gesture, never per pointer-move (NFR-4.2)". `useUndoableGrid`'s `commit` AND `undo`
  // both hand back a NEW `grid` object (trap 3), and an in-progress stroke never touches it (the
  // stroke lives in `<PetriDishCanvas>`'s own refs — RFC-005 Decision 6), so this recomputes
  // exactly once per committed gesture and not once per pointer-move.
  const stats = useMemo<EditorStatusBarStats>(() => {
    const gridStats = computeEditorGridStats(grid, rosterIds);

    // Join to display data BY ID (trap 1), never by index: `roster` is `rosterIds` de-duplicated
    // by `resolveDisplayOrganisms`, so `roster[ref - 1]` shifts after any duplicate.
    const byId = new Map(roster.map((organism) => [organism.id, organism] as const));

    return {
      livingCells: gridStats.livingCells,
      perOrganism: gridStats.perOrganism.flatMap(({ organismId, count }) => {
        const organism = byId.get(organismId);
        // `roster` is resolved from this SAME `rosterIds`, so every id `computeEditorGridStats`
        // produces has a matching entry here — this is defensive, not an expected branch.
        if (organism === undefined) return [];
        return [{ organismId, name: organism.name, color: organism.color, count }];
      }),
    };
  }, [grid, rosterIds, roster]);

  /**
   * The confirmation in flight, or `null`. Forced decision 5(a): EPHEMERAL LOCAL state in this
   * component, exactly where spec §3.3's own wiring line puts it ("a shrinking resize that would
   * clip living cells opens `<ResizeClipWarningDialog>` first, then commits") and beside the
   * `selectedTool` cell §6 already assigns here. It is not persisted, not undoable and not shared
   * with Run mode, so putting it in `<BattlePage>` would widen two components' props for nothing.
   *
   * ⚠️ Holds the REQUESTED PRESET and the clip count, never a grid: the grid the confirm commits is
   * built from the CURRENT `grid` at confirm time, so anything that changed under the dialog is
   * resized rather than reverted.
   *
   * Two cells, not one, for the reason `useDeleteBattleDialog` records: the dialog has three
   * phases, not two. `dialogOpen` drives the fade; `pendingResize` outlives it and is cleared only
   * once the exit transition has finished, so the copy does not blank mid-fade.
   */
  const [pendingResize, setPendingResize] = useState<{
    preset: EditableGridPreset;
    clippedLivingCells: number;
  } | null>(null);
  const [resizeDialogOpen, setResizeDialogOpen] = useState(false);

  /**
   * Which preset control to put focus back on once the warning's exit transition has finished
   * (AC8), or `null` for "no move pending". Held as the preset's KEY and resolved by DOM lookup at
   * restore time — never as a captured element — exactly as `useDeleteBattleDialog` does.
   *
   * ⚠️ This exists because MUI's OWN restore-to-trigger is not enough on WebKit, and the reason is
   * already recorded in `<DeleteBattleDialog>`: WebKit does not focus a non-text form control on
   * click, so `document.activeElement` is `<body>` at open time and MUI faithfully restores focus
   * to `<body>` — the "tab order restarts at the top of the document" failure. Caught by
   * `battleRoute.spec.ts`'s cancel test on the webkit and tablet projects, and by nothing else.
   */
  const restoreFocusPresetRef = useRef<string | null>(null);

  /**
   * The focus move, run as an EFFECT keyed on the confirmation clearing rather than from the exit
   * callback directly. Ordering is the point and it has to be guaranteed rather than raced: by the
   * time this runs, MUI has cleared the background's `aria-hidden` and `useInertBackground`'s
   * cleanup has released `inert` — React runs every cleanup for a commit before any setup, and
   * that hook is called ABOVE this one. Focusing any earlier targets a node that is still inert,
   * where `focus()` is a spec-mandated no-op.
   */
  useEffect(() => {
    if (pendingResize !== null) return;

    const key = restoreFocusPresetRef.current;
    if (key === null) return;
    restoreFocusPresetRef.current = null;

    // Do not steal focus the user has already placed somewhere real during the transition.
    // "Loose" includes "still inside the closing dialog" — on WebKit this effect runs while that
    // dialog is still mounted, so a body-only check would skip the restore there.
    const active = document.activeElement;
    const focusIsLoose =
      active === null || active === document.body || active.closest('[role="dialog"]') !== null;
    if (!focusIsLoose) return;

    document.querySelector<HTMLElement>(`[data-grid-preset="${key}"]`)?.focus();
  }, [pendingResize]);

  // Called from the PARENT of the dialog so it spans the exit transition too, and so MUI's own
  // focus-trap move (a child effect) has already happened — both reasons are recorded in full on
  // `useDeleteBattleDialog`'s call. `pendingResize !== null` is exactly the window "a confirmation
  // is on screen in some form".
  useInertBackground(pendingResize !== null);

  /**
   * FR-3.11. A grow, or a shrink that discards nothing, commits IMMEDIATELY; a shrink that would
   * clip living cells opens the warning first and commits nothing until it is confirmed.
   *
   * ⚠️ The already-current preset is refused HERE (trap 7) as well as by the native radio that
   * cannot fire for it — belt and braces, because an equal-but-new grid is not a harmless no-op:
   * it pushes an undo entry and sets `isDirty`, which is a user-visible lie about unsaved work.
   */
  const handleResize = useCallback(
    (preset: EditableGridPreset) => {
      if (grid.width === preset.cols && grid.height === preset.rows) return;

      const clippedLivingCells = countClippedLivingCells(grid, preset);
      if (clippedLivingCells === 0) {
        // ⚠️ Trap 6: a shrink over an empty region applies SILENTLY. Warning about discarding
        // nothing is what teaches a user to dismiss the dialog unread.
        onCommitGrid(resizeGrid(grid, preset));
        return;
      }

      // The control that opened the dialog, so every close path — confirm, cancel, Escape,
      // backdrop — lands focus back on it (AC8).
      restoreFocusPresetRef.current = presetKey(preset);
      setPendingResize({ preset, clippedLivingCells });
      setResizeDialogOpen(true);
    },
    [grid, onCommitGrid],
  );

  // AC4: ONE `onCommitGrid` call, therefore one ring entry, therefore one undo — and the dirty
  // flag comes free through `<BattlePage>`'s `handleCommitGrid`. ❌ No second commit seam.
  //
  // review (2026-08-29): `isSaving` is checked HERE too, not only on the control that opens the
  // dialog. `<GridSettingsSection>`'s `disabled={isSaving}` stops a NEW resize from starting
  // while a save is in flight, but it cannot stop a save that STARTS after the dialog is already
  // open — and `<BattlePage>`'s `handleCommitGrid` silently no-ops under `savingRef` (Trap 8).
  // Without this guard, confirming in that window would close the dialog exactly as it does on
  // success while the grid silently stayed at its old dimensions — a false-success UI, not the
  // "click that appears to do nothing" Trap 8 calls the accepted failure mode for a control left
  // enabled during a save. Guarding here keeps the dialog open instead, matching that convention.
  const handleConfirmResize = useCallback(() => {
    if (pendingResize === null || isSaving) return;
    onCommitGrid(resizeGrid(grid, pendingResize.preset));
    setResizeDialogOpen(false);
  }, [grid, isSaving, onCommitGrid, pendingResize]);

  // AC3: cancel — and Escape, and a backdrop click, which MUI routes through the same callback —
  // change NOTHING. No commit, no undo entry, no dirty flag; the preset control still reads the
  // current grid, because it is rendered from `grid` and `grid` never moved.
  const handleCancelResize = useCallback(() => setResizeDialogOpen(false), []);

  // Only once the fade has finished is it safe to drop the copy the dialog is still rendering.
  const handleResizeDialogExited = useCallback(() => setPendingResize(null), []);

  /**
   * AC2/AC3 (FR-3.7). Spec §3.3 puts Clear here, beside `handleResize` — the same commit seam,
   * one `onCommitGrid` call, nothing else. ❌ No second seam, no `useState`, no touch to
   * `sessionRoster` / `chosenTool` / `battleName` / `rosterIds` (traps: What Clear does NOT do).
   *
   * Forced decision 1, option (a): the already-empty guard lives HERE too, belt-and-braces with
   * the control's own `disabled` — an equal-but-new grid is not a harmless no-op (it would push an
   * undo entry and set `isDirty`, a user-visible lie about unsaved work), and `stats.livingCells`
   * is a render-time value a same-tick commit could otherwise race past.
   *
   * `isSaving` guarded here for the identical reason `handleConfirmResize` carries one (trap 6): a
   * save can start after the render that disabled the button, and `<BattlePage>`'s
   * `handleCommitGrid` would silently no-op under `savingRef` without this — a click that appears
   * to do nothing rather than one that is genuinely inert.
   */
  const handleClear = useCallback(() => {
    if (stats.livingCells === 0 || isSaving) return;
    onCommitGrid(clearGrid(grid));
  }, [grid, isSaving, onCommitGrid, stats.livingCells]);

  return (
    <EditorLayout>
      <EditorSidebar>
        <SidebarContent>
          <SidebarSection title="Organisms">
            {/* Selection stays HERE (spec §3.3, §6): the roster is handed the value and the
                setter and holds none of its own. `setChosenTool` is passed directly — it is a
                stable identity, and wrapping it would only add a layer that can drift. */}
            <OrganismRoster
              roster={roster}
              selectedTool={selectedTool}
              onSelectTool={setChosenTool}
              duplicateColorIds={duplicateColorIds}
              libraryUnavailable={libraryUnavailable}
              library={library}
              workspaceEmpty={workspaceEmpty}
              onAddToRoster={handleAddToRoster}
              atCap={atCap}
            />
          </SidebarSection>
          {/* AC7: the mockup's order is Organisms, then Battle Name — this story's own second
              consumer of the shared shell. `battleName`/`onNameChange` are threaded straight
              through from `<BattlePage>`; this component transforms neither. */}
          <SidebarSection title="Battle Name">
            <BattleNameField
              value={battleName}
              onChange={onNameChange}
              maxLength={MAX_BATTLE_NAME_LENGTH}
              /* The visible half of `<BattlePage>`'s edit lock — see that component's `savingRef`.
                 The lock refuses the change either way; this stops the field from accepting
                 keystrokes it has already decided to discard. */
              disabled={isSaving}
            />
          </SidebarSection>
          {/* AC1: the THIRD section — the mockup's order is Organisms · Battle Name · Grid Info ·
              Tools (2.15) · Back (2.16). Fed from the SAME `stats` memo `<EditorStatusBar>` reads
              (forced decision 6a): "Living Cells" renders in both places by the mockup's own
              design, but the DERIVATION happens once.
              ⚠️ `totalCells` is `grid.width * grid.height` — from the GRID, never from a stored
              `gridSize` (trap 1), which is right until the first resize and then stale. */}
          <SidebarSection title="Grid Info">
            <GridSettingsSection
              gridSize={{ cols: grid.width, rows: grid.height }}
              stats={{ totalCells: grid.width * grid.height, livingCells: stats.livingCells }}
              onResize={handleResize}
              /* Trap 8, and the visible half of `<BattlePage>`'s edit lock: `handleCommitGrid`
                 returns early while a save is in flight, so a live control here would produce a
                 click that appears to do nothing. Same treatment as `<BattleNameField>`. */
              disabled={isSaving}
            />
          </SidebarSection>
          {/* AC1: the FOURTH section — the mockup's order is Organisms · Battle Name · Grid Info ·
              Tools · Back (2.16). Forced decision 1, option (a): `disabled` ties to the SAME
              `stats.livingCells` the emptiness guard above reads, so the control states WHY
              nothing would happen rather than staying live and inert (NFR-4.1). */}
          <SidebarSection title="Tools">
            <EditorToolsSection
              onClear={handleClear}
              disabled={stats.livingCells === 0 || isSaving}
            />
          </SidebarSection>
        </SidebarContent>
      </EditorSidebar>
      <EditorMain
        {...rest}
        grid={grid}
        onCommitGrid={onCommitGrid}
        isSaving={isSaving}
        tool={selectedTool}
        toolRef={toolRef}
        stats={stats}
      />
      {/* Mounted only while a confirmation is in flight, which is also what keeps the lazy chunk
          from being requested at all on the overwhelmingly common path (every grow, and every
          shrink that clips nothing). `targetSize`/`clippedLivingCells` keep their values for the
          whole exit transition — see `pendingResize`'s own comment. */}
      {pendingResize !== null && (
        <ResizeClipWarningDialog
          open={resizeDialogOpen}
          targetSize={pendingResize.preset}
          clippedLivingCells={pendingResize.clippedLivingCells}
          onCancel={handleCancelResize}
          onConfirm={handleConfirmResize}
          onExited={handleResizeDialogExited}
        />
      )}
    </EditorLayout>
  );
}
