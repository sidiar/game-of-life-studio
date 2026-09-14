'use client';

import { useState } from 'react';
import { styled } from '@mui/material/styles';
import { MAX_ROSTER_SIZE } from '@/lib/canvas/refToFillGroup';
import type { DisplayOrganism } from '@/lib/displayOrganisms';
import { normalizeOrganismSearch, organismNameMatches } from '@/lib/organisms/organismNameMatches';
import { ERASER_TOOL, type Tool } from '@/lib/battle/tool';

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
  // Review (2026-08-27): this was `Row`'s own `&:last-of-type`, which never matched — each `Row`
  // is the ONLY `<button>` inside its own `<li>` (see `RosterListItem` below), so it was trivially
  // "last of its type" on every single row, and no row ever showed the mockup's separator. Scoped
  // here instead, against the true last `<li>` in the list.
  '& > li:last-child > button': {
    borderBottom: 'none',
  },
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
 * Mockup: `.add-organism-container` (:281-289). `border-top` + `padding-top` is the mockup's own
 * separation from the roster list above it — the eraser stays OUTSIDE this container entirely
 * (Task 3: "the eraser stays LAST and stays outside `<RosterList>`").
 */
const AddContainer = styled('div')({
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
  marginBottom: '15px',
  paddingTop: '15px',
  borderTop: '1px solid var(--gol-border)',
});

/**
 * Mockup: `.organism-search` (:290-311). Forced decision 2 (Story 2.10): styled primitives only,
 * the `<EditorStatusBar>` house style — real focus-visible ring (`2px solid var(--gol-accent)`,
 * not the mockup's `border-color` swap, for consistency with every other control in this file),
 * enumerated transitions, a `prefers-reduced-motion` escape.
 */
const SearchInput = styled('input')({
  background: 'var(--gol-bg-secondary)',
  // Story 2.10 code review: `--gol-border-control`, NOT the mockup's literal `var(--border)`.
  // themes.css departure #2 splits the two on purpose — `--gol-border` (#333333) is decorative
  // (dividers, card edges) and measures 1.57:1, while SC 1.4.11 needs 3:1 for a boundary that
  // IDENTIFIES a control. This border is this input's ONLY boundary, so it is squarely covered.
  // `<BattleTile>`'s DeleteButton records the same departure verbatim, and `<EditorStatusBar>` —
  // the house style this block claims to follow — already uses the control token.
  border: '1px solid var(--gol-border-control)',
  color: 'var(--gol-text-primary)',
  padding: '10px 12px',
  fontSize: '11px',
  fontFamily: 'inherit',
  letterSpacing: '0.5px',
  textTransform: 'uppercase',
  transition: 'border-color 0.2s',
  '&::placeholder': {
    color: 'var(--gol-text-secondary)',
    opacity: 0.8,
  },
  '&:focus-visible': {
    outline: '2px solid var(--gol-accent)',
    outlineOffset: '-2px',
  },
  '@media (prefers-reduced-motion: reduce)': {
    transition: 'none',
  },
});

/**
 * Mockup: `.organism-dropdown` (:312-336). Forced decision 2 (Story 2.10), option (a): a native
 * `<select>` — zero bundle, free keyboard and screen-reader behaviour, free mobile picker. The
 * mockup's first `<option>` ("+ ADD ORGANISM") is the visible placeholder, which is NOT an
 * accessible name for the `<select>` itself (an `<option>`'s text is never exposed as its parent's
 * name) — `aria-label` supplies the one Story 2.9's lesson says must be added deliberately when
 * there is no visible label to prefer instead.
 *
 * Forced decision 3: the mockup's arrow is a `background-image` data-URI SVG with `fill='%23ffffff'`
 * — a raw hex wearing a URL escape, and AR-46 territory regardless of whether the lint rule
 * tokenises it. `currentColor` inside an SVG loaded as a CSS `background-image` does NOT resolve
 * against the host element's colour (it needs the SVG to be inline, or a `mask-image`, neither of
 * which is worth building for one arrow) — so option (a), the UA's OWN arrow, is what ships:
 * `appearance: none` and the mockup's `background-image` are both simply absent below, rather than
 * reproduced and then hidden.
 */
const AddSelect = styled('select')({
  background: 'var(--gol-bg-secondary)',
  // `--gol-border-control` for the same SC 1.4.11 reason as `SearchInput` above.
  border: '1px solid var(--gol-border-control)',
  color: 'var(--gol-text-primary)',
  padding: '10px 12px',
  fontSize: '11px',
  fontFamily: 'inherit',
  letterSpacing: '0.5px',
  textTransform: 'uppercase',
  cursor: 'pointer',
  transition: 'border-color 0.2s',
  '&:hover': {
    borderColor: 'var(--gol-text-secondary)',
  },
  '&:focus-visible': {
    outline: '2px solid var(--gol-accent)',
    outlineOffset: '-2px',
  },
  '@media (prefers-reduced-motion: reduce)': {
    transition: 'none',
  },
});

/**
 * AC5's cap message, AC8's two "nothing to add" states — one plain-paragraph primitive for all
 * three, the same pattern `DegradedNotice` below establishes for AC7's failure message. Never
 * `role="status"`: none of the three is a live update the user is mid-interaction with when it
 * first appears — the control simply renders in whichever of its four states already applies.
 */
const AddMessage = styled('p')({
  margin: 0,
  fontSize: '11px',
  lineHeight: 1.5,
  color: 'var(--gol-text-secondary)',
});

/**
 * Story 2.10: `<OrganismSearchAdd>` (component-tree-battle-page.md §2) — built PRIVATE here rather
 * than extracted to its own file, the same call Story 2.9 made for `SidebarSection` (forced
 * decision 5 there): one consumer, and a file move is cheap later if a second one arrives.
 *
 * Four states, in priority order:
 * 1. **At the cap** (AC5, Decision G.3) — the roster identity array is full. No search, no
 *    select: typing would filter a list nothing can be added from.
 * 2. **Library empty** (AC8, NFR-4.1) — nothing to add, and nothing to search. Two sentences, not
 *    one: `library` is a difference, so it reads empty both when the roster has consumed the
 *    workspace and when the workspace itself is empty (`workspaceEmpty`), and only one of those
 *    is "every library organism is already in this battle" (code review, trap 7).
 * 3. **Search matches nothing** (AC8) — a DIFFERENT fact from #2, and stated differently: the
 *    library has organisms, this search text just does not match any of them. The search input
 *    stays rendered so the user can see and clear what they typed.
 * 4. **Normal** — the search input plus a `<select>` of whatever it currently filters to.
 *
 * The search text is this component's OWN state (spec §6: "roster search filter | ephemeral |
 * OrganismRoster | itself") — it is never read by anything outside this function, and it never
 * touches `roster`'s identity (trap 3: filtering inside the memo that feeds `resolveSelectedTool`
 * would make that scan per-render).
 */
function OrganismSearchAdd({
  library,
  workspaceEmpty,
  onAddToRoster,
  atCap,
}: {
  library: readonly DisplayOrganism[];
  workspaceEmpty: boolean;
  onAddToRoster(organismId: string): void;
  atCap: boolean;
}) {
  const [searchText, setSearchText] = useState('');

  if (atCap) {
    return (
      <AddContainer>
        <AddMessage>
          Roster is full — {MAX_ROSTER_SIZE} organisms is the limit for one battle.
        </AddMessage>
      </AddContainer>
    );
  }

  if (library.length === 0) {
    // Story 2.10 code review (AC8, trap 7): `library` is a DIFFERENCE, so it reads empty for two
    // unrelated reasons and each needs its own true sentence. Claiming "every library organism is
    // already in this battle" for a workspace that holds NO organisms is false — and it is false in
    // exactly the window Story 2.9's decision 1 left for this story to close (a fresh profile, or a
    // bookmarked `/battle/new` opened before the Gallery ever ran the workspace seed), where the
    // roster is empty, the dish is unpaintable, and this message is the user's only signpost.
    return (
      <AddContainer>
        <AddMessage>
          {workspaceEmpty
            ? 'Your organism library is empty — create an organism to place it in a battle.'
            : 'Every library organism is already in this battle.'}
        </AddMessage>
      </AddContainer>
    );
  }

  // AC2's predicate is `organismNameMatches` (`lib/organisms/organismNameMatches.ts`), shared with
  // `<OrganismLibrary>` (Story 4.2) — see that module for the trim/NFC/toLocaleLowerCase rationale
  // (resolves `deferred-work.md:335`).
  const query = normalizeOrganismSearch(searchText);
  // ⚠️ UNMEMOISED, ON PURPOSE — MEASURED IN STORY 3.7 (deferred-work.md, 2.10 review, which flagged
  // this as a per-render scan of the UNCAPPED workspace library, Decision G.3/M6). Benched at
  // `lib/canvas/repaintDecision.bench.ts`'s `library-filter 1000 organisms`: **~0.02-0.04 ms** for
  // a library of 1,000 — far past any realistic workspace, and roughly one keystroke's worth of
  // budget spent on a scan that runs once per render, not in a loop. A `useMemo` here would cost a
  // dependency array and a cache to reason about in exchange for tens of microseconds. Closed, not
  // deferred again. (The report carries the canonical figure.)
  const filtered = library.filter((organism) => organismNameMatches(organism.name, query));

  return (
    <AddContainer>
      <SearchInput
        type="text"
        placeholder="SEARCH ORGANISMS..."
        aria-label="Search organisms"
        value={searchText}
        onChange={(event) => setSearchText(event.target.value)}
      />
      {filtered.length === 0 ? (
        <AddMessage>No organisms match “{searchText}”.</AddMessage>
      ) : (
        // Controlled at `value=""` always — never left uncontrolled to reset itself when the
        // chosen option disappears from `library` on the next render. That would work too (the
        // browser advances to the first remaining option, which is this placeholder), but it
        // depends on DOM removal timing rather than being an explicit fact this component asserts.
        <AddSelect
          aria-label="Add organism to roster"
          value=""
          onChange={(event) => {
            const organismId = event.target.value;
            // The placeholder's own value — selecting it back (or a screen reader announcing the
            // controlled reset) must never call onAddToRoster with an empty id.
            if (organismId !== '') onAddToRoster(organismId);
          }}
        >
          <option value="">+ ADD ORGANISM</option>
          {filtered.map((organism) => (
            <option key={organism.id} value={organism.id}>
              {organism.name}
            </option>
          ))}
        </AddSelect>
      )}
    </AddContainer>
  );
}

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
 * This story's slice of spec §3.4's `OrganismRosterProps` — the roster/selection/warning props
 * Story 2.9 wired, plus THIS story's `library` / `onAddToRoster` / `atCap`. The same discipline
 * `<BattleEditorView>` and `<EditorStatusBar>` each applied to their own oversized spec interfaces.
 *
 * ❌ Still no `onEditOrganism` (the per-row ✎ first renders in Story 4.24) and no
 * `onCreateOrganism` — Epic 4. Declaring them now would be an unverifiable claim, and rendering
 * their controls would be the dead affordance NFR-4.1 forbids.
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
  /** Story 2.10 (FR-7.15): the full shared library minus the roster — the add control's options. */
  library: readonly DisplayOrganism[];
  /**
   * Story 2.10 code review (AC8): the WORKSPACE library holds nothing at all — as distinct from
   * `library` being empty because the roster consumed it. Two facts, two messages.
   */
  workspaceEmpty?: boolean;
  /** Story 2.10 (AC3): "+ ADD ORGANISM" -> `sessionRoster` (Decision H.2). */
  onAddToRoster(organismId: string): void;
  /** Story 2.10 (AC5, Decision G.3): the roster identity array is at the 255-organism cap. */
  atCap?: boolean;
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
  library,
  workspaceEmpty = false,
  onAddToRoster,
  atCap = false,
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
        <>
          {roster.length > 0 && (
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
          )}
          {/* Story 2.10: placed between the roster list and the pinned eraser, matching
              `.add-organism-container`'s own border-top separation from the list above it. Not
              rendered at all when the library failed to load (AC8's third state) — this whole
              branch is the `!libraryUnavailable` arm. */}
          <OrganismSearchAdd
            library={library}
            workspaceEmpty={workspaceEmpty}
            onAddToRoster={onAddToRoster}
            atCap={atCap}
          />
        </>
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
