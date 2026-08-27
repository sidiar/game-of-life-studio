'use client';

import { styled } from '@mui/material/styles';
import type { DisplayOrganism } from '@/lib/displayOrganisms';
import { ERASER_TOOL, type Tool } from '@/lib/tool';

/**
 * Mockup: `.used-organisms-list` (clinical-lab-theme/petri-dish-lab-mode.html:192-198).
 *
 * A real `<ul>`/`<li>` where the mockup uses divs: the roster IS a list, and the count ("list with
 * 3 items") is the one fact a screen-reader user cannot get from the rows themselves. Costs two
 * styled primitives and no bundle worth measuring.
 */
const RosterList = styled('ul')({
  listStyle: 'none',
  margin: 0,
  padding: 0,
  display: 'flex',
  flexDirection: 'column',
});

const RosterListItem = styled('li')({
  display: 'block',
});

/**
 * Forced decision 6 (bundle): `styled('button')`, not `@mui/material/ListItemButton`. The whole
 * point of deleting Story 2.7's `ToggleButtonGroup` was to hand ~10 KB gzip back to `/battle`
 * (deferred-work.md); replacing it with MUI's list primitives would spend the win on the same
 * afternoon. This is the `<EditorStatusBar>` house style, applied to a row: real focus-visible
 * ring, enumerated transitions, `prefers-reduced-motion` escape, no raw hex (AR-46).
 *
 * The row is ONE button spanning chip + name — not a div with a click handler and not a nested
 * control. Story 4.24's per-row ✎ is the thing that will eventually sit BESIDE it (a button inside
 * a button is invalid and unreachable by keyboard), which is why the row's own hit area stops at
 * its own element rather than being pushed onto the `<li>`.
 */
const Row = styled('button')({
  width: '100%',
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
  padding: '10px 12px',
  background: 'transparent',
  border: 'none',
  borderBottom: '1px solid var(--gol-border)',
  // Reserved on every row, painted only on the selected one — a border that appears on selection
  // would shift the whole list sideways by 3px as the user arrows down it.
  borderLeft: '3px solid transparent',
  color: 'var(--gol-text-primary)',
  font: 'inherit',
  textAlign: 'left',
  cursor: 'pointer',
  transition: 'background-color 0.2s, border-color 0.2s',
  '&:last-of-type': {
    borderBottom: 'none',
  },
  '&:hover': {
    background: 'var(--gol-bg-hover)',
  },
  '&:focus-visible': {
    outline: '2px solid var(--gol-accent)',
    outlineOffset: '-2px',
  },
  // WCAG 1.4.1: the mockup distinguishes `.organism-item.selected` by BACKGROUND ALONE, which is
  // colour as the only channel. The accent edge is the second channel — `aria-pressed` covers
  // assistive tech, this covers sighted users who cannot separate #1a1a1a from #222222.
  '&[aria-pressed="true"]': {
    background: 'var(--gol-bg-hover)',
    borderLeftColor: 'var(--gol-accent)',
  },
  '@media (prefers-reduced-motion: reduce)': {
    transition: 'none',
  },
});

/**
 * Mockup: `.organism-color` (:200-205). Trap 9: DECORATIVE. The row already carries the
 * organism's name as visible text, so an accessible name here would make every row announce its
 * organism twice. `aria-hidden` at the call site, and it is a `<span>` with no text to begin with.
 *
 * The `background` is an inline style rather than a token: it is a RESOLVED runtime hex from
 * `displayColor` (the same LUT the dish's cells go through), not a literal — which is what keeps
 * a chip from ever disagreeing with the cells it describes, and why AR-46 has nothing to object
 * to here. `<BattleTile>`'s organism dots already establish this exact pattern.
 */
const ColorChip = styled('span')({
  width: '16px',
  height: '16px',
  flexShrink: 0,
  border: '1px solid var(--gol-border)',
});

const RosterName = styled('span')({
  flex: 1,
  fontSize: '11px',
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
  // A 50-character organism name in a 320px column must not push the chip out of the row.
  overflowWrap: 'anywhere',
});

/**
 * FR-3.3 / M6's same-colour warning: "two **non-blocking** warnings". Non-blocking in both
 * directions (trap 5) — the row stays enabled and selectable, nothing is disabled, no dialog
 * opens; and it is not silent either, so BOTH rows of a colliding pair carry it, not just the
 * second one to appear.
 *
 * Real text, not a bare glyph with a `title`: `title` is not announced by every screen reader and
 * is invisible to touch entirely. The words become part of the row's accessible name, which is
 * the point — a user who cannot see that two chips match is exactly the user the warning is for.
 */
const DuplicateColorWarning = styled('span')({
  fontSize: '10px',
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
  color: 'var(--gol-text-secondary)',
  flexShrink: 0,
});

/**
 * Mockup: `.organism-eraser` (:338-350) — `border-top` + `margin-top`, OUTSIDE the list container
 * (AC1: pinned at the bottom, visually separated, not an entry in the roster). It is a sibling of
 * `<RosterList>` for that reason and not merely styled to look like one: the eraser is not one of
 * the battle's organisms and must not be counted as one by the list's own semantics.
 */
const EraserRow = styled(Row)({
  marginTop: '15px',
  borderTop: '1px solid var(--gol-border)',
  borderBottom: 'none',
  background: 'var(--gol-bg-primary)',
});

/**
 * Forced decision 1 (Story 2.9), landing between the story's options (b) and (c) — and the split
 * is measured, not stylistic.
 *
 * The mockup's `#ff6600` is a raw literal AR-46 rejects in `apps/web`, and no orange `--gol-*`
 * token exists. Option (a), adding one, is the most faithful but obliges **Story 6.1** to override
 * it in the Biotech Terminal block — a cross-story commitment taken on behalf of an unwritten
 * story, for one control's colour.
 *
 * Option (b) — `--gol-danger` for the whole row — was implemented first and FAILED WCAG AA: axe
 * measured `#ff3366` on the selected/hover background `--gol-bg-hover` (`#222222`) at **4.48:1**
 * against the 4.5 threshold for 11px text. It clears 4.5 against `--gol-bg-primary`, which is why
 * the resting row looked fine and only the SELECTED eraser failed — and NFR-8.3 designates
 * Clinical Lab the AA-guaranteed theme, so this is a defect, not a preference.
 *
 * So: the NAME uses the neutral text ramp every other row uses (option (c)), and `--gol-danger`
 * carries the ✕ box, where the same 4.48 is measured against the **3:1** non-text threshold
 * (WCAG 1.4.11) and passes with room. The glyph inside is `aria-hidden`, so it is exempt from the
 * text-contrast rule by construction rather than by luck. Position, the separator and the red ✕
 * carry the distinction; the word does not have to.
 */
const EraserIcon = styled('span')({
  width: '16px',
  height: '16px',
  flexShrink: 0,
  border: '1px solid var(--gol-danger)',
  color: 'var(--gol-danger)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: '12px',
  lineHeight: 1,
});

const EraserName = styled(RosterName)({
  fontWeight: 600,
});

/**
 * AC7 (`deferred-work.md`, owned by this story): the organism library failed to load, so the
 * roster's names and colours are unknowable. Before this story `<BattlePage>` rendered a fully
 * successful page in that state and the roster would have been an EMPTY LIST — a page reporting
 * no problem, offering nothing to place, and explaining nothing.
 *
 * A plain paragraph, deliberately not `role="status"`: this is static content present on first
 * paint, not an update, and a live region that never updates is noise. The route's `role="status"`
 * belongs to `<BattleLoading>`.
 */
const DegradedNotice = styled('p')({
  margin: '0 0 8px',
  fontSize: '11px',
  lineHeight: 1.5,
  color: 'var(--gol-text-secondary)',
});

/**
 * This story's slice of spec §3.4's `OrganismRosterProps` — the four props it can wire and verify,
 * plus AC7's failure fact. The same discipline `<BattleEditorView>` and `<EditorStatusBar>` each
 * applied to their own oversized spec interfaces.
 *
 * ❌ No `library` and no `onAddToRoster` — Story 2.10 owns the search box, the "+ ADD ORGANISM"
 * dropdown and every write to `sessionRoster`. ❌ No `onEditOrganism` (the per-row ✎ first renders
 * in Story 4.24) and no `onCreateOrganism` — Epic 4. Declaring them now would be an unverifiable
 * claim, and rendering their controls would be the dead affordance NFR-4.1 forbids.
 */
export interface OrganismRosterProps {
  /**
   * Decision H.2's roster union, resolved for display and in ROSTER ORDER (spec §3.4: "render
   * order = list order"). ⚠️ Render order only — this array is NOT the one `refForTool` indexes;
   * see `displayOrganisms.ts` on why the two can differ in length (trap 2).
   */
  roster: readonly DisplayOrganism[];
  /** Controlled selection (spec §3.3, §6): owned by `<BattleEditorView>`, never mirrored here. */
  selectedTool: Tool;
  onSelectTool(tool: Tool): void;
  /** FR-3.3 / M6 — the ids of every organism sharing a `colorToken` with another in this battle. */
  duplicateColorIds?: readonly string[];
  /** AC7: `organisms.list()` failed, so nothing can be named, coloured, or placed. */
  libraryUnavailable?: boolean;
}

/**
 * The Lab sidebar's Organisms section (component-tree-battle-page.md §3.4, FR-3.3 / FR-3.6).
 *
 * Selection is CONTROLLED and this component holds no state at all: spec §3.3 assigns
 * `selectedTool` to `<BattleEditorView>`, and a local mirror here is the second source of truth
 * that would silently disagree with the ref the canvas is actually painting.
 *
 * Spec §9.8 already settled FR-3.3's "Organism Dropdown" wording against the mockup's roster list:
 * follow the mockup's structure, honour FR-3.3's semantics. Not re-opened here.
 */
export default function OrganismRoster({
  roster,
  selectedTool,
  onSelectTool,
  duplicateColorIds,
  libraryUnavailable = false,
}: OrganismRosterProps) {
  const eraserSelected = selectedTool.kind === 'eraser';

  return (
    <>
      {libraryUnavailable ? (
        <DegradedNotice>
          The organism library could not be read, so this battle’s organisms cannot be listed.
          Placing organisms is unavailable — erasing still works.
        </DegradedNotice>
      ) : (
        roster.length > 0 && (
          <RosterList>
            {/* React key = organism id. `resolveDisplayOrganisms` de-duplicates ids for exactly
                this reason — a repeated key is a React console error, and the e2e asserts a clean
                console. */}
            {roster.map((organism) => {
              const selected =
                selectedTool.kind === 'organism' && selectedTool.organismId === organism.id;
              return (
                <RosterListItem key={organism.id}>
                  <Row
                    type="button"
                    // Forced decision 2 (Story 2.9): `aria-pressed` on plain buttons, not a
                    // `radiogroup`/`listbox` pair. The exclusive selection spans the list AND the
                    // pinned eraser, which sit in different containers by AC1's own requirement,
                    // so a radiogroup would have to own both through a wrapper and hand-roll
                    // roving tabindex + arrow keys. `aria-pressed` announces exactly one pressed
                    // row, keeps every row independently tab-reachable (which matters more as the
                    // roster grows toward 255), and is what the deleted `ToggleButtonGroup`
                    // already exposed — so the contract users and tests query is unchanged.
                    aria-pressed={selected}
                    onClick={() => onSelectTool({ kind: 'organism', organismId: organism.id })}
                  >
                    {/* Trap 9: decorative — the name beside it is the row's accessible name. */}
                    <ColorChip aria-hidden="true" style={{ background: organism.color }} />
                    <RosterName>{organism.name}</RosterName>
                    {duplicateColorIds?.includes(organism.id) === true && (
                      <DuplicateColorWarning>Shared colour</DuplicateColorWarning>
                    )}
                  </Row>
                </RosterListItem>
              );
            })}
          </RosterList>
        )
      )}
      {/* FR-3.6. OUTSIDE <RosterList> — the eraser is a tool, not one of the battle's organisms,
          and counting it as a list item would report "4 organisms" for a roster of 3. */}
      <EraserRow
        type="button"
        aria-pressed={eraserSelected}
        onClick={() => onSelectTool(ERASER_TOOL)}
      >
        <EraserIcon aria-hidden="true">✕</EraserIcon>
        <EraserName>Eraser</EraserName>
      </EraserRow>
    </>
  );
}
