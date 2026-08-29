'use client';

import { styled } from '@mui/material/styles';

/**
 * Mockup: `.stats-bar` (clinical-lab-theme/petri-dish-lab-mode.html:510-523) — the Lab bottom bar.
 *
 * The mockup pins it with `position: fixed; bottom: 0; left: 320px`, where 320px is the width of a
 * sidebar Story 2.9 has not built yet: reproducing that literal offset today would leave the bar
 * starting 320px from the left of nothing, and would need `.grid-container`'s hardcoded
 * `padding-bottom: 80px` to keep the dish out from under it. IN FLOW instead, as the last row of
 * `<MainContent>`'s existing flex column — the same picture (a bar spanning the bottom of the main
 * area, the dish ending above it), with the dish's reserve COMPUTED from the bar's real height
 * rather than guessed at. The mockup's picture, not its CSS — the same call `GridContainer`
 * already made about that same 80px (BattleEditorView.tsx:187-190 — the 80px stays unreproduced
 * permanently, not "until 2.12").
 *
 * `justifyContent: 'space-between'` (Story 2.12) — the mockup's own value, now that the left half
 * carries real content (`StatsGroup` below) rather than the empty placeholder Story 2.8 declined
 * to ship (NFR-4.1: an empty `.stats-left` is exactly the inert rendered chrome that rule forbids).
 */
const Bar = styled('div')({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '20px',
  padding: '12px 25px',
  // review (2026-08-28): a flex item's `min-width: auto` floor is its CONTENT width, so without
  // this the bar refuses to shrink below the stats row's natural width and widens the whole route
  // instead — measured at 700x500 with only three organisms as `document.scrollWidth` 823 against
  // a 700px viewport, and reached at ~10 organisms even at 1280px (a Playwright project viewport).
  // `MAX_ROSTER_SIZE` is 255, so the row's width has no upper bound of its own.
  minWidth: 0,
  background: 'var(--gol-bg-secondary)',
  borderTop: '1px solid var(--gol-border)',
});

/**
 * Mockup: `.stats-left` (:527-531). Forced decision 3 (AC5): a NAMED REGION, not a live region —
 * `<section>` maps to the ARIA `region` landmark only once it carries an accessible name, which is
 * what `aria-label` below supplies. The stats are a passive summary of a surface the user is
 * directly manipulating; a live region (`role="status"`) would announce after every commit AND
 * every undo, interrupting the drag/undo flow with a number the user just caused. WCAG 1.3.1 and
 * 1.4.1 need LABELS, not announcement, and a landmark is what makes the group identifiable and
 * navigable (deferred-work.md's "unidentified run of numbers" entry, AC5).
 */
const StatsGroup = styled('section')({
  display: 'flex',
  gap: '25px',
  alignItems: 'center',
  // review (2026-08-28): this is the half that gives ground. `minWidth: 0` lets it shrink past its
  // content width (see `<Bar>`), and `overflowX: 'auto'` keeps the surplus INSIDE the bar as a
  // contained scroll rather than letting it widen the document — the route's premise is that
  // nothing scrolls, and a bar that grows the page breaks it for every element, not just itself.
  // Paired with `flexShrink: 0` on `<RightGroup>` so UNDO is never the control pushed off-screen.
  minWidth: 0,
  overflowX: 'auto',
});

/**
 * Mockup: `.stat-item` (:533-537). `role="group"` (Task 5, AC5): a bare `<div>`'s implicit
 * `generic` role PROHIBITS an author-assigned accessible name (`aria-label`/`aria-labelledby`) —
 * the exact restriction `BattleTile.tsx`'s `TooltipTrigger` comment names for `aria-label` on a
 * bare `<span>`, and axe's `aria-prohibited-attr` flags it the same way regardless of which
 * naming attribute is used. `group` is a role ARIA naming explicitly supports, which is what lets
 * `Generation`/`Living Cells`/the empty-Population case below combine their label and value into
 * ONE programmatically-determinable name (AC5, WCAG 1.3.1/1.4.1) without inventing a non-standard
 * role.
 */
const StatItem = styled('div')({
  display: 'flex',
  gap: '8px',
  alignItems: 'center',
});

// Mockup: `.stat-label` (:539-544).
const StatLabel = styled('span')({
  fontSize: '10px',
  color: 'var(--gol-text-secondary)',
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
});

// Mockup: `.stat-value` (:546-549).
const StatValue = styled('span')({
  fontSize: '14px',
  color: 'var(--gol-text-primary)',
  fontWeight: 600,
});

// Holds one `PopulationEntry` per roster organism, replacing the mockup's slash-separated inline
// spans (:809-813) with the epic AC's required colour chip per entry (see the module doc comment).
const PopulationEntries = styled('span')({
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
});

/**
 * One roster organism's population entry. `role="img"` — the same technique
 * `BattleTile.tsx`'s `TooltipTrigger` uses for its colour dots: a naming role is required for
 * `aria-label` to survive the accessible-name algorithm (a bare `<span>`'s implicit `generic` role
 * strips it, and axe's `aria-prohibited-attr` would flag it). `role="img"` also makes its children
 * — the decorative chip and the bare count — NOT independently navigable, which is what keeps a
 * screen reader from re-reading the count a second time after announcing the combined label.
 */
const PopulationEntry = styled('span')({
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
});

/**
 * Mockup: `.organism-color` reused verbatim (`OrganismRoster.tsx`'s `ColorChip`) — copied, not
 * forked, per Task 1. `aria-hidden="true"` at the call site below: it is decorative given the
 * entry's own `aria-label` already states the organism's name.
 *
 * The mockup instead colours the *numbers* (three inline hexes). A chip is what the epic AC
 * requires ("per-organism population counts with color chips") and what keeps colour a REDUNDANT
 * channel rather than the only one (WCAG 1.4.1) — see the Dev Notes "Colour, contrast, and why a
 * chip is not optional" section. Colouring the numbers too is permissible but not required, and
 * this story does not add it: it would need its own contrast-sweep test against a TUNABLE palette
 * (RFC-007 Decision 1), which is real scope this story's AC does not ask for.
 */
const ColorChip = styled('span')({
  width: '16px',
  height: '16px',
  flexShrink: 0,
  border: '1px solid var(--gol-border)',
});

/**
 * Forced decision 2 (Story 2.8): a `styled('button')`, not `@mui/material/Button`.
 *
 * The mockup's control is a plain `<button class="btn">` (:589-601), and `Button` is currently
 * imported by `DeleteBattleDialog` alone — a GALLERY-route component — so pulling it onto the
 * battle route would spend part of a ~3.3 KB bundle headroom (deferred-work.md) on a control the
 * mockup does not style like a MUI button anyway. What MUI would have given for free is the
 * disabled and focus-visible treatment, so both are written out here: a REAL `disabled` attribute
 * (never a CSS-only grey — assistive tech reads the attribute, not the colour) and the same
 * `2px solid var(--gol-accent)` focus ring the Story 1.9 review established for every new
 * interactive chrome element.
 *
 * ❌ No raw hex anywhere in this file — AR-46 is a live lint rule on `apps/web`, and every colour
 * below is an existing `--gol-*` token, or (the chips) an already-resolved runtime hex passed
 * through inline `style` — the same mechanism `<ColorChip>` already used in `<OrganismRoster>`.
 */
const barButtonBase = {
  fontSize: '11px',
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
  fontFamily: 'inherit',
  cursor: 'pointer',
  '&:focus-visible': {
    outline: '2px solid var(--gol-accent)',
    // Deliberately OUTSIDE the box, and load-bearing for SAVE specifically: SAVE is filled in
    // `--gol-accent`, so a ring of the same colour drawn AT the edge (offset 0, or the negative
    // offset `<BattleNameField>`'s inset ring uses) would be invisible against its own fill. At
    // +2px the ring is separated from the fill by a band of `--gol-bg-secondary` and reads on
    // both buttons.
    outlineOffset: '2px',
  },
  '&:disabled': {
    background: 'var(--gol-action-disabled-bg)',
    borderColor: 'var(--gol-border)',
    color: 'var(--gol-action-disabled)',
    cursor: 'not-allowed',
  },
} as const;

const UndoButton = styled('button')({
  ...barButtonBase,
  background: 'transparent',
  border: '1px solid var(--gol-border-control)',
  color: 'var(--gol-text-primary)',
  padding: '8px 16px',
  // ⚠️ **No `transition`** — removed 2026-08-28, and the claim that used to sit here ("safe on UNDO
  // because both states paint dark-on-dark, unlike SAVE") was simply WRONG. The disabled pair is
  // `--gol-action-disabled` on `--gol-action-disabled-bg`, i.e. white@30% on white@12%, which
  // resolves to **#727272 on #353535 — 2.54:1**. That never showed up because axe EXEMPTS disabled
  // controls from `color-contrast` (WCAG 1.4.3 does not apply to inactive components), so the
  // settled state is never scanned. The cross-fade is: on the disabled→enabled edge the button is
  // already `enabled` in the DOM while its colours still sit near the disabled endpoint, and a scan
  // landing in that window measures an ENABLED control at 2.54:1. Caught by
  // `battleRoute.spec.ts:601` ("no axe violations on /battle/new after a drag") — the same failure
  // SAVE's own comment below records at 3.76:1, from the same cause, found the same way.
  //
  // ❌ Do not restore it, on either button. The `:disabled` colours are only ever legitimate while
  // the control is genuinely disabled; any animation between that pair and an enabled one paints
  // frames nobody validated, and `themeTokens.test.ts` cannot see intermediate frames.
  //
  // (The rule this replaces was enumerated rather than the mockup's `all 0.2s`, for the reason
  // `BattleTile` records: with `all`, any property added later starts animating by accident.)
  // Review (2026-08-28): the forced-decision-5 `barButtonBase` extraction dropped this rule
  // entirely — `barButtonBase` only carries the treatment SAVE and UNDO share, and UNDO's hover
  // (unlike its focus/disabled states) is NOT one of those, so it needs restating here.
  '&:hover:not(:disabled)': {
    background: 'var(--gol-bg-hover)',
    borderColor: 'var(--gol-text-secondary)',
  },
  // ❌ No `prefers-reduced-motion` block: there is no transition left for it to switch off, and an
  // empty escape hatch reads as though one still exists.
});

/**
 * Mockup: `.save-btn` (clinical-lab-theme/petri-dish-lab-mode.html:608-624) — the SOLID accent
 * button beside UNDO's outline one. The mockup's `#00b8e0` hover is `var(--gol-accent-hover)`;
 * ❌ no raw hex (AR-46 is a live lint rule on `apps/web`).
 *
 * Story 2.13 forced decision 5, option (c): the two buttons share `barButtonBase` — a plain style
 * OBJECT, not a base component. (a) would duplicate the type/focus/disabled treatment and let the
 * two drift; (b), a `variant` prop, is indirection a two-instance component cannot justify; a
 * `styled(BaseButton)` composition would add a real wrapper component to a chunk with 9.5 KB of
 * headroom. A spread object costs nothing at runtime and still leaves exactly one definition of
 * the shared behaviour.
 *
 * ⚠️ **No `transition`, deliberately — the one thing this button does NOT share with UNDO.** SAVE's
 * two states are two DIFFERENT validated colour pairs: `--gol-on-accent` on `--gol-accent` when
 * enabled, `--gol-action-disabled` on `--gol-action-disabled-bg` when not. A cross-fade between
 * them animates through pairs nobody validated, and `themeTokens.test.ts` cannot see intermediate
 * frames. Measured: with a 0.2s fade, the axe scan that runs right after a placement enables this
 * button caught it mid-transition at **3.76:1** (fg `#214147` on bg `#10a5c3`) and failed on all
 * four Playwright projects. Do not "restore consistency" by adding one back here.
 *
 * ⚠️ Updated 2026-08-28: this used to add "UNDO cross-fades within ONE pair (dark on dark) and
 * keeps its transition" — untrue, and UNDO has since lost its transition to the SAME failure at
 * 2.54:1. See `UndoButton` above. NEITHER button animates between a disabled and an enabled
 * palette; that is now the rule for this bar, not a SAVE-specific exception.
 */
const SaveButton = styled('button')({
  ...barButtonBase,
  background: 'var(--gol-accent)',
  border: '1px solid var(--gol-accent)',
  color: 'var(--gol-on-accent)',
  padding: '8px 20px',
  '&:hover:not(:disabled)': {
    background: 'var(--gol-accent-hover)',
    borderColor: 'var(--gol-accent-hover)',
  },
});

// The bar's right half (Story 2.12): wraps UNDO alone today so `justifyContent: 'space-between'`
// has two children — `<StatsGroup>` on the left, this on the right — and gives Story 2.13's SAVE
// button a slot to land in beside it without a third top-level child changing the split.
const RightGroup = styled('div')({
  display: 'flex',
  alignItems: 'center',
  gap: '20px',
  // review (2026-08-28): never the side that shrinks. UNDO is the bar's only control, and a
  // growing stats row must not be able to push it out of the viewport (measured before this line:
  // `button.right` 864 at a 700px viewport). Story 2.13's SAVE lands here and inherits the same
  // protection.
  flexShrink: 0,
});

/**
 * One roster organism's live cell count (spec §3.8, widened — see `BattleEditorView.tsx`'s
 * composition step and the story's Dev Notes "stats shape" section for why `colorToken` is
 * resolved to a concrete `color` one level up rather than here).
 */
export interface EditorStatusBarPopulation {
  organismId: string;
  name: string;
  /** The already-resolved identity-shade hex — the SAME value `<OrganismRoster>`'s row chip
   * paints for this organism, carried through rather than re-resolved (one `displayColor` call
   * site, not two). */
  color: string;
  count: number;
}

/**
 * AC3/AC4: derived once per commit in `<BattleEditorView>` (`computeEditorGridStats` +
 * `<DisplayOrganism>` join), and handed down as a plain, inert prop — this component holds none of
 * it as state.
 */
export interface EditorStatusBarStats {
  livingCells: number;
  /** One entry per roster organism, in roster order, `count` INCLUDING zero (AC3). */
  perOrganism: readonly EditorStatusBarPopulation[];
}

/**
 * Spec §3.8's `EditorStatusBarProps`, complete as of Story 2.13: the UNDO pair, the stats row
 * (Story 2.12) and the SAVE pair. The bar shipped with each responsibility complete rather than as
 * a placeholder for the rest, which is why it was a real component in Story 2.8 and not the
 * half-built panel Story 2.4 declined.
 *
 * ❌ No Grid Zoom slider — superseded (§9.1, whole-grid auto-fit replaced the viewport model), and
 * the one thing §3.8 lists that this bar will never grow. ❌ No "saved" toast: the disabled SAVE
 * button IS the success signal in the mockup, and a save FAILURE is reported above the bar rather
 * than inside it (Story 2.13 forced decision 4 — an arbitrary-length message on the
 * `flexShrink: 0` side would reopen the horizontal overflow the 2026-08-28 review measured).
 */
export interface EditorStatusBarProps {
  onUndo(): void;
  /** FR-3.8: "the button is disabled when `canUndo` is false". A boolean, so it re-renders. */
  canUndo: boolean;
  stats: EditorStatusBarStats;
  /** FR-7.8 (spec §3.8). Fires the save; `<BattlePage>` owns everything a save MEANS. */
  onSave(): void;
  /** FR-7.8 (spec §3.8): SAVE is enabled exactly when there is something to save. */
  isDirty: boolean;
  /**
   * A third prop beyond spec §3.8's two, and deliberate. `battles.save()` is a whole-collection
   * read-modify-write (`localStorageBattleRepository.ts`), so two interleaved saves can lose one —
   * SAVE has to be genuinely unavailable while a write is in flight, not merely re-entrancy-guarded
   * inside the handler, or the control advertises an availability it does not have.
   *
   * ❌ NOT folded into `isDirty` by the caller: the battle IS still dirty during the write — that
   * is what `data-dirty` on the page root reports — so passing `isDirty && !isSaving` would make
   * the prop's name false for the duration.
   */
  isSaving: boolean;
}

export default function EditorStatusBar({
  onUndo,
  canUndo,
  stats,
  onSave,
  isDirty,
  isSaving,
}: EditorStatusBarProps) {
  const hasPopulation = stats.perOrganism.length > 0;

  return (
    <Bar>
      <StatsGroup aria-label="Battle statistics">
        {/* AC2: a literal 0, never state and never a prop. Edit mode has no simulation and no
            cycle — FR-4.5's real counter is Story 3.14's, in the RUN sidebar, over `initialGrid`
            (A-2: the live grid Story 3.14 counts does not exist in Lab mode). Plumbing this as if
            it could change invites a later story to wire the edit bar to a simulation that has
            nothing to drive it.
            `aria-hidden` on both children: the group's own `aria-label` already states the
            combined "Generation: 0", and leaving the children exposed too would read the value a
            second time when an assistive technology walks into the group. */}
        <StatItem role="group" aria-label="Generation: 0">
          <StatLabel aria-hidden="true">Generation</StatLabel>
          <StatValue aria-hidden="true">0</StatValue>
        </StatItem>
        <StatItem role="group" aria-label={`Living Cells: ${stats.livingCells}`}>
          <StatLabel aria-hidden="true">Living Cells</StatLabel>
          <StatValue aria-hidden="true">{stats.livingCells}</StatValue>
        </StatItem>
        {hasPopulation ? (
          <StatItem>
            {/* Plain visible text, not group-labelled: each entry below states its OWN full name
                (organism: count) via `role="img"` + `aria-label`, so this label needs no formal
                association of its own — an assistive technology reads it as ordinary content on
                the way to the entries, which is enough (it is not the sole conveyor of meaning). */}
            <StatLabel>Population</StatLabel>
            <PopulationEntries>
              {stats.perOrganism.map((entry) => (
                <PopulationEntry
                  key={entry.organismId}
                  role="img"
                  aria-label={`${entry.name}: ${entry.count}`}
                >
                  <ColorChip aria-hidden="true" style={{ background: entry.color }} />
                  <StatValue>{entry.count}</StatValue>
                </PopulationEntry>
              ))}
            </PopulationEntries>
          </StatItem>
        ) : (
          // An empty roster (or a battle with nothing placed) must not leave "Population"
          // dangling with nothing after it — a stated placeholder keeps the row's shape and says
          // so, rather than a bare label with nothing to its name.
          <StatItem role="group" aria-label="Population: none">
            <StatLabel aria-hidden="true">Population</StatLabel>
            <StatValue aria-hidden="true">—</StatValue>
          </StatItem>
        )}
      </StatsGroup>
      <RightGroup>
        {/* `type="button"` explicitly: a bare <button> inside a <form> defaults to type="submit" and
            would submit it on click. Story 2.11's battle name field is the `<form>` this comment
            used to anticipate — it never arrived (forced decision 5): a `<form>` around a single
            text input triggers IMPLICIT submission on Enter too, which under `output: 'export'` is a
            full page reload that discards the grid, the undo ring and the session roster. The field
            is a plain `<div>`, live-bound through `onChange` alone. Kept explicit anyway — cheap,
            and correct regardless of what future story adds a `<form>` somewhere else on this
            route. */}
        {/* `isSaving` disables UNDO alongside SAVE (Sidiar's call, 2026-08-28): an undo landing
            mid-write rewinds the grid away from the record being saved, which `<BattlePage>`'s
            edit lock refuses outright. This is the visible half of that refusal — without it the
            control advertises an availability it does not have, the same reasoning `isSaving`'s
            own prop comment gives for SAVE. ⚠️ Composed HERE, not folded into `canUndo` by the
            caller: there IS still history to undo during a write, so a `canUndo && !isSaving`
            prop would make the prop's name false for the duration. */}
        <UndoButton type="button" onClick={onUndo} disabled={!canUndo || isSaving}>
          Undo
        </UndoButton>
        {/* AFTER Undo in DOM order, which IS the tab order (AC8) — the mockup's own order
            (:823-824), and neither button carries a `tabIndex`, so nothing else decides it.
            `disabled` is the real attribute on both, never a CSS-only grey: assistive technology
            reads the attribute, and `!isDirty || isSaving` is the complete condition (AC1/AC4 —
            see `isSaving`'s prop comment for why the two are separate booleans). */}
        <SaveButton type="button" onClick={onSave} disabled={!isDirty || isSaving}>
          Save
        </SaveButton>
      </RightGroup>
    </Bar>
  );
}
