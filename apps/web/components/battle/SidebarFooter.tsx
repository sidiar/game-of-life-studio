'use client';

import { styled } from '@mui/material/styles';

/**
 * Spec §3.9's pinned "← BACK TO BATTLES" footer (FR-7.10). Presentational and total: no router, no
 * repository, no state, no guard — `<BattlePage>` runs the FR-7.9 unsaved-changes guard and owns
 * the navigation, and this component only reports the press.
 *
 * Spec §8 lists it as a shared primitive (both sidebars, and Epic 4's Library), which is why it is
 * its own file rather than markup inside `<BattleEditorView>`. ❌ But NO run-mode prop, branch or
 * variant is added speculatively — Epic 3 mounts this same component in the Run sidebar and brings
 * whatever it needs with it, exactly as Story 2.14/2.15's sections did for this column.
 *
 * ⚠️ It is NOT a `<SidebarSection>` and carries no `<h2>` (trap 9). The route's heading structure
 * stays at four sidebar headings — Organisms, Battle Name, Grid Info, Tools — and both the unit
 * and e2e heading-order assertions still read four. A fifth means this was mounted wrong.
 */

/**
 * Mockup: `.sidebar-footer` (`clinical-lab-theme/petri-dish-lab-mode.html:120-127`), reproducing
 * the PICTURE and dropping the CSS whose only justification is the mockup — this route's settled
 * convention (`margin-top: 64px`, `position: relative` and the 80px status-bar reserve are all
 * precedents).
 *
 * ⚠️ `margin-top: auto` is what pins this footer to the bottom of the column; the mockup's
 * `position: sticky; bottom: 0` is INERT here and is not reproduced (trap 12). Sticky positions an
 * element against its nearest SCROLLING ancestor, and `<EditorSidebar>` is `overflow-y: hidden` —
 * the scroll region is `<SidebarContent>`, which this element is a SIBLING of, not a child. The
 * mockup's `background` goes with it: it exists to occlude content scrolling underneath a sticky
 * bar, and nothing scrolls under this one (the sidebar's own `--gol-bg-secondary` shows through).
 *
 * `margin-top: auto` is kept even though `<SidebarContent>`'s `flex: 1` already consumes the free
 * space, because it is the pin that does not depend on a sibling's flex value staying what it is.
 */
const Footer = styled('div')({
  marginTop: 'auto',
  padding: '12px 0',
  // Decorative separation between the scrolling sections and the footer — not a control boundary,
  // so the decorative `--gol-border` is correct here (the BUTTON's own border is the 3:1 case; see
  // below).
  borderTop: '1px solid var(--gol-border)',
});

/**
 * Mockup: `.back-btn` (`:129-147`), with this route's two settled substitutions — the same pair
 * `<EditorToolsSection>` and `<GridSettingsSection>` already carry:
 *
 * ⚠️ **`--gol-border-control`, not the mockup's decorative `--gol-border`** (trap 10). That border
 * measures 1.57:1 against `--gol-bg-primary`; this border is the button's ONLY boundary, so SC
 * 1.4.11's 3:1 applies. `themeTokens.test.ts` asserts the split exists precisely so it keeps being
 * used.
 *
 * ❌ **No `transition`** (trap 11). The mockup has `transition: all 0.2s`; Stories 2.13, 2.14 and
 * 2.15 each lost one here to an axe scan that landed mid-fade and measured a control at a contrast
 * ratio no settled state has.
 *
 * ⚠️ The label colour is `--gol-text-primary`, the mockup's own value for `.back-btn` — NOT the
 * `--gol-text-secondary` its `.tool-btn` sibling uses. Both are validated pairs against all three
 * backgrounds (`themeTokens.test.ts`), so the mockup's distinction is honoured rather than
 * normalised away: this is the column's one navigational control, and it reads as the primary
 * thing in the footer.
 */
const BackButton = styled('button')({
  width: '100%',
  background: 'transparent',
  border: '1px solid var(--gol-border-control)',
  color: 'var(--gol-text-primary)',
  padding: '10px 20px',
  fontSize: '11px',
  fontWeight: 600,
  // Trap 15: the DOM text is sentence case and CSS uppercases it, so the accessible name stays
  // "Back to Battles" while the mockup's "BACK TO BATTLES" is what renders.
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
  cursor: 'pointer',
  fontFamily: 'inherit',
  '&:hover:not(:disabled)': {
    background: 'var(--gol-bg-hover)',
    borderColor: 'var(--gol-text-secondary)',
  },
  // A real `<button>` that takes focus itself, so `:focus-visible` — not `<GridSettingsSection>`'s
  // `:focus-within` workaround, which exists only because ITS focusable element is a
  // visually-hidden radio inside a `<label>`.
  '&:focus-visible': {
    outline: '2px solid var(--gol-accent)',
    outlineOffset: '2px',
  },
  // The same pre-validated disabled trio every other control on this route uses.
  '&:disabled': {
    background: 'var(--gol-action-disabled-bg)',
    borderColor: 'var(--gol-border)',
    color: 'var(--gol-action-disabled)',
    cursor: 'not-allowed',
  },
});

export interface SidebarFooterProps {
  /**
   * FR-7.10. Fired on a real press and nothing else — `<BattlePage>` decides whether that means a
   * navigation or a confirmation (FR-7.9), exactly as `<EditorToolsSection>`'s `onClear` leaves
   * the emptiness policy to its caller.
   */
  onBack(): void;
  /**
   * Forced decision 3, option (a): the visible half of `<BattlePage>`'s edit lock, mirroring
   * `<BattleNameField>`, `<GridSettingsSection>` and `<EditorToolsSection>`, which are all
   * `disabled={isSaving}`.
   */
  disabled?: boolean;
}

export default function SidebarFooter({ onBack, disabled = false }: SidebarFooterProps) {
  return (
    <Footer>
      <BackButton
        type="button"
        onClick={onBack}
        disabled={disabled}
        // The focus-restore target for every dialog close path that stays on the page (AC6).
        // Resolved by DOM lookup at restore time rather than captured as an element — WebKit does
        // not focus a `<button>` on click, so `document.activeElement` at open time is `<body>`
        // there. The idiom `<DeleteBattleDialog>` (`data-delete-battle-id`) and
        // `<GridSettingsSection>` (`data-grid-preset`) already established on this route.
        data-back-to-battles=""
      >
        {/* Trap 13: the glyph is decorative and the accessible name must be exactly "Back to
            Battles" — a screen reader announcing "left arrow back to battles" is noise. Same
            treatment `<GridSettingsSection>` and `<EditorStatusBar>` give their own glyphs. */}
        <span aria-hidden="true">←</span> Back to Battles
      </BackButton>
    </Footer>
  );
}
