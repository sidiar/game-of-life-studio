'use client';

import { useId } from 'react';
import { styled } from '@mui/material/styles';
import type { EditableGridPreset } from '@gol/domain';

/**
 * Spec §3.6's Grid Info section, plus FR-3.11's resize control ("the mockup shows read-only Grid
 * Info; FR-3.11/Decision A added edit-mode resize afterward").
 *
 * Presentational and total: no repository, no grid, no derivation of its own. `livingCells`
 * arrives from `<BattleEditorView>`'s existing `stats` memo (forced decision 6a) — a second
 * `computeEditorGridStats` call here would be a second pass over the whole occupant map, per
 * committed gesture, for a number the parent already holds.
 */

// Mockup: `.control-group` (clinical-lab-theme/petri-dish-lab-mode.html:166-170).
const ControlGroup = styled('div')({
  display: 'flex',
  flexDirection: 'column',
  gap: '12px',
});

// Mockup: `.control-item` (:172-176).
const ControlItem = styled('div')({
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
});

// Mockup: `.control-label` (:178-183).
const ControlLabel = styled('span')({
  fontSize: '11px',
  color: 'var(--gol-text-secondary)',
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
});

// Mockup: `.control-value` (:185-189).
const ControlValue = styled('span')({
  fontSize: '13px',
  color: 'var(--gol-text-primary)',
  fontWeight: 600,
});

// The two presets side by side. `.tool-btn`'s `width: 100%` stacking (:407) is the mockup's idiom
// for a column of full-width actions; two mutually exclusive options read better as one row, and
// the sidebar is a fixed 320px so both fit at any viewport.
const PresetRow = styled('div')({
  display: 'flex',
  gap: '8px',
  marginTop: '4px',
});

/**
 * One preset option. The `<input type="radio">` inside is VISUALLY hidden, never `display: none`
 * and never `hidden` — both remove it from the accessibility tree and from the tab order, which is
 * exactly the semantics this borrows the native control for.
 *
 * Styling is `.tool-btn`'s (`petri-dish-lab-mode.html:407-421`), which is the mockup's own sidebar
 * button idiom and the one Story 2.15's Tools section will use too.
 *
 * ⚠️ `--gol-border-control`, not the mockup's decorative `--gol-border` (1.57:1): this border is
 * the control's only boundary, so SC 1.4.11 applies — the same substitution `<BattleNameField>`
 * and `<OrganismRoster>`'s search input each record.
 */
const PresetOption = styled('label')({
  flex: 1,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '6px',
  background: 'transparent',
  border: '1px solid var(--gol-border-control)',
  color: 'var(--gol-text-secondary)',
  padding: '10px',
  fontSize: '11px',
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
  cursor: 'pointer',
  // The radio is positioned against this box, so a browser scrolling focus into view scrolls to
  // the option the user is actually on.
  position: 'relative',
  // ❌ No `transition`. Selected, unselected and disabled are three different validated colour
  // pairs, and `<EditorStatusBar>`'s two buttons each lost their transition to an axe scan that
  // landed mid-fade and measured an ENABLED control at a ratio no settled state ever has. The same
  // trap applies verbatim here.
  '&:hover': {
    background: 'var(--gol-bg-hover)',
    borderColor: 'var(--gol-text-secondary)',
  },
  /**
   * `:focus-within`, NOT `:focus-visible`. The focused element is the visually-hidden radio and
   * the ring has to land on the box the user can see, which from the wrapper means either
   * `&:has(input:focus-visible)` or this. `:has()` shipped in Firefox 121 and NFR-2.1's floor is
   * Firefox 112, so a `:has()` ring is simply absent for nine Firefox versions — a keyboard user
   * with no visible focus indicator, which is the one thing this rule exists to prevent. The cost
   * of `:focus-within` is a ring that also appears when the option is clicked with a mouse; that
   * is a control the user just activated, and a visible ring on it is not a defect.
   */
  '&:focus-within': {
    outline: '2px solid var(--gol-accent)',
    outlineOffset: '2px',
  },
  // AC8 / WCAG 1.4.1: selection is carried by THREE redundant channels — the accent border, the
  // brighter text, and the ✓ glyph — never by colour alone, and the native radio's own CHECKED
  // state is what carries it to assistive technology (no `aria-checked` attribute is written; the
  // platform already exposes it, and a second source could disagree). Driven by a data attribute
  // rather than `&:has(input:checked)` for the Firefox-floor reason above.
  '&[data-selected="true"]': {
    borderColor: 'var(--gol-accent)',
    color: 'var(--gol-text-primary)',
    background: 'var(--gol-bg-hover)',
  },
  // The same pre-validated disabled PAIR every other control on this route uses —
  // `--gol-action-disabled` on `--gol-action-disabled-bg` — rather than a new one.
  '&[data-disabled="true"]': {
    background: 'var(--gol-action-disabled-bg)',
    borderColor: 'var(--gol-border)',
    color: 'var(--gol-action-disabled)',
    cursor: 'not-allowed',
  },
});

/**
 * The native radio, kept in the accessibility tree and in the tab order and merely moved out of
 * sight. ❌ Never `display: none`, `visibility: hidden` or the `hidden` attribute — each of those
 * removes the control from both, which is precisely what this borrows a native radio FOR. Clipped
 * at a real 1px rather than sized to 0x0, which some engines' focus heuristics skip.
 */
const HiddenRadio = styled('input')({
  position: 'absolute',
  width: '1px',
  height: '1px',
  margin: 0,
  padding: 0,
  opacity: 0,
});

/**
 * The radio's accessible name. Spelled out ("50 by 30") because the visible text is `aria-hidden`:
 * `×` (U+00D7) is announced as "times", "multiplication sign" or nothing at all depending on the
 * screen reader, and a size is read as "by" in every one of them.
 */
const VisuallyHidden = styled('span')({
  position: 'absolute',
  width: '1px',
  height: '1px',
  overflow: 'hidden',
  clipPath: 'inset(50%)',
  whiteSpace: 'nowrap',
});

// Decorative: the option's own text and `aria-checked` already state which one is selected, so
// announcing a check mark as well would read the same fact twice.
const SelectedMark = styled('span')({
  fontSize: '10px',
  lineHeight: 1,
});

/**
 * The set of sizes an Edit-mode grid may take (Decision A.2, H-9, FR-4.9). ⚠️ The Play-mode
 * expansion sizes {150×90, 200×120} are Story 3.16's, are ephemeral, and must never appear here:
 * `projectBattleForSave` parses `gridSize` through `EditableGridPresetSchema`, so a third size
 * would not fail at this control — it would fail three frames later, at save, as a Zod error
 * about a field the user never touched.
 *
 * Typed as `EditableGridPreset` so the schema's union, not this array, is the authority on what
 * the members may be: adding an entry the schema does not allow is a type error here.
 */
export const EDITABLE_GRID_PRESETS: readonly EditableGridPreset[] = [
  { cols: 50, rows: 30 },
  { cols: 100, rows: 60 },
];

/**
 * The stable identity of a preset, for the `data-grid-preset` attribute
 * `<BattleEditorView>`'s restore-focus effect queries after the warning dialog closes (AC8).
 * Exported so the two sides cannot drift into two spellings of the same string.
 */
export function presetKey(preset: { cols: number; rows: number }): string {
  return `${preset.cols}x${preset.rows}`;
}

export interface GridSettingsSectionStats {
  /** `grid.width * grid.height` — derived from the GRID, never from a stored `gridSize` (trap 1). */
  totalCells: number;
  livingCells: number;
}

export interface GridSettingsSectionProps {
  /**
   * The grid's CURRENT dimensions.
   *
   * ⚠️ Spec §3.6 types this `EditableGridPreset`; it is `{ cols: number; rows: number }` here, and
   * the deviation is deliberate. The facts this section renders come from the live grid (trap 1),
   * whose `width`/`height` are plain numbers — narrowing them to the schema's literal union would
   * mean parsing, in a render path, a value that has already been validated at load and is
   * re-validated at save. A grid that somehow sits outside the two presets still renders its true
   * size here and simply matches no option, which is a better outcome than a component that throws
   * while displaying a fact.
   */
  gridSize: { cols: number; rows: number };
  stats: GridSettingsSectionStats;
  /**
   * FR-3.11. Fires only for a preset that is NOT the current one (trap 7): re-selecting the
   * current size is a no-op here, so no caller can turn it into an equal-but-new grid that still
   * pushes an undo entry and sets the dirty flag.
   */
  onResize(preset: EditableGridPreset): void;
  /** The visible half of `<BattlePage>`'s edit lock (trap 8) — `handleCommitGrid` refuses commits
   * while a save is in flight, and a control that stays live during one produces a click that
   * appears to do nothing. Mirrors `<BattleNameField disabled={isSaving}>`. */
  disabled?: boolean;
}

/**
 * Trap 10: `toLocaleString()` with no argument follows the RUNTIME's locale — `"6,000"` on en-US,
 * `"6 000"` on fr-FR, `"6.000"` on de-DE — so an assertion written on one machine fails on a
 * runner with a different `LANG`, and Playwright's four projects do not all inherit the same one.
 * The locale is pinned rather than left implicit; every string in this app is English.
 */
function formatCount(value: number): string {
  return value.toLocaleString('en-US');
}

export default function GridSettingsSection({
  gridSize,
  stats,
  onResize,
  disabled = false,
}: GridSettingsSectionProps) {
  // Unique per mount so two instances (or a future second sidebar) cannot share a radio group and
  // silently deselect each other.
  const groupName = useId();

  return (
    <ControlGroup>
      {/* `role="group"` + `aria-label`, with both children `aria-hidden` — `<EditorStatusBar>`'s
          established pattern on this route. A bare <div>/<span>'s implicit `generic` role
          PROHIBITS an author-assigned name (axe's `aria-prohibited-attr`), and the combined name
          is also what lets `×` (U+00D7) be spoken as "by": the glyph is inside the hidden half,
          and the label spells the word. */}
      <ControlItem role="group" aria-label={`Grid Size: ${gridSize.cols} by ${gridSize.rows}`}>
        <ControlLabel aria-hidden="true">Grid Size</ControlLabel>
        <ControlValue aria-hidden="true">
          {gridSize.cols} × {gridSize.rows}
        </ControlValue>
      </ControlItem>
      <ControlItem role="group" aria-label={`Total Cells: ${formatCount(stats.totalCells)}`}>
        <ControlLabel aria-hidden="true">Total Cells</ControlLabel>
        <ControlValue aria-hidden="true">{formatCount(stats.totalCells)}</ControlValue>
      </ControlItem>
      {/* ⚠️ "Living Cells" renders here AND in `<EditorStatusBar>` — the mockup's own design
          (:790 sidebar, :800 stats bar), not a duplication to consolidate. What is NOT duplicated
          is the derivation: both are fed from the one `stats` memo in `<BattleEditorView>`. */}
      <ControlItem role="group" aria-label={`Living Cells: ${formatCount(stats.livingCells)}`}>
        <ControlLabel aria-hidden="true">Living Cells</ControlLabel>
        <ControlValue aria-hidden="true">{formatCount(stats.livingCells)}</ControlValue>
      </ControlItem>
      {/* Forced decision 2, taken as (a) with NATIVE radios rather than `role="radio"` buttons.
          Same reasoning — zero new MUI imports on the route with the least bundle headroom, an
          obvious selected state — and native semantics buy two things a hand-rolled group would
          have to re-implement: arrow-key navigation within the group, and an already-checked radio
          firing no change event at all, which is trap 7's no-op enforced by the platform.
          ❌ Not §9.2's literal "preset-picker … consistent with the play sidebar's Grid Size
          control": that control is a 4-stop detented slider, and with TWO options a slider has no
          affordance and reads poorly to a screen reader. §9.2 calls its own line a hint and says a
          mockup refresh "is not blocking". */}
      <PresetRow role="radiogroup" aria-label="Grid size preset">
        {EDITABLE_GRID_PRESETS.map((preset) => {
          const selected = preset.cols === gridSize.cols && preset.rows === gridSize.rows;
          return (
            <PresetOption key={presetKey(preset)} data-selected={selected} data-disabled={disabled}>
              <HiddenRadio
                type="radio"
                name={groupName}
                /* The restore-focus target for `<ResizeClipWarningDialog>` (AC8). A DOM-findable
                   attribute rather than a ref handed upward, for the reason `useDeleteBattleDialog`
                   records: the restore happens after the exit transition, and looking the element
                   up at that moment is what keeps the caller from holding an element reference
                   across a window in which the tree may have changed. `useId`'s `name` is not
                   usable for this — it is per-mount and not stable to write a selector against. */
                data-grid-preset={presetKey(preset)}
                checked={selected}
                disabled={disabled}
                // Fires only on a CHANGE of the checked radio, so activating the already-current
                // preset calls nothing — trap 7, enforced by the platform rather than by a guard
                // someone can delete.
                onChange={() => onResize(preset)}
              />
              {selected && <SelectedMark aria-hidden="true">✓</SelectedMark>}
              <span aria-hidden="true">
                {preset.cols} × {preset.rows}
              </span>
              <VisuallyHidden>
                {preset.cols} by {preset.rows}
              </VisuallyHidden>
            </PresetOption>
          );
        })}
      </PresetRow>
    </ControlGroup>
  );
}
