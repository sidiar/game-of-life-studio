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
 * rather than guessed at. The mockup's picture, not its CSS — the call `GridContainer` already
 * made about that same 80px.
 *
 * `justifyContent: flex-end` because the bar's left half is stats (Generation · Living Cells ·
 * per-organism counts) and those are Story 2.12's — an empty `.stats-left` placeholder is exactly
 * the inert rendered chrome NFR-4.1 forbids.
 */
const Bar = styled('div')({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'flex-end',
  gap: '20px',
  padding: '12px 25px',
  background: 'var(--gol-bg-secondary)',
  borderTop: '1px solid var(--gol-border)',
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
 * below is an existing `--gol-*` token. No new token was needed.
 */
const UndoButton = styled('button')({
  background: 'transparent',
  border: '1px solid var(--gol-border-control)',
  color: 'var(--gol-text-primary)',
  padding: '8px 16px',
  fontSize: '11px',
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
  fontFamily: 'inherit',
  cursor: 'pointer',
  // Enumerated, never the mockup's `all 0.2s` — with `all`, any property added to this block later
  // starts animating by accident, including a layout-affecting one (BattleTile's recorded reason).
  transition: 'background-color 0.2s, border-color 0.2s, color 0.2s',
  '&:hover:not(:disabled)': {
    background: 'var(--gol-bg-hover)',
    borderColor: 'var(--gol-text-secondary)',
  },
  '&:focus-visible': {
    outline: '2px solid var(--gol-accent)',
    outlineOffset: '2px',
  },
  '&:disabled': {
    background: 'var(--gol-action-disabled-bg)',
    borderColor: 'var(--gol-border)',
    color: 'var(--gol-action-disabled)',
    cursor: 'not-allowed',
  },
  '@media (prefers-reduced-motion: reduce)': {
    transition: 'none',
  },
});

/**
 * This story's slice of spec §3.8's `EditorStatusBarProps`: the UNDO pair, and nothing else.
 *
 * ❌ No `stats` prop and no Generation / Living Cells / Population row — Story 2.12. ❌ No `onSave`
 * / `isDirty` and no SAVE button — Story 2.13. ❌ No Grid Zoom slider — superseded (§9.1). The bar
 * ships with one real, complete responsibility rather than a placeholder for three; 2.12 and 2.13
 * ADD to it, which is why it is a real component here and not the half-built panel Story 2.4
 * declined (that one's later stories would have unpicked it).
 */
export interface EditorStatusBarProps {
  onUndo(): void;
  /** FR-3.8: "the button is disabled when `canUndo` is false". A boolean, so it re-renders. */
  canUndo: boolean;
}

export default function EditorStatusBar({ onUndo, canUndo }: EditorStatusBarProps) {
  return (
    <Bar>
      {/* `type="button"` explicitly: a bare <button> inside a future <form> (Story 2.11's battle
          name field) defaults to type="submit" and would submit it. */}
      <UndoButton type="button" onClick={onUndo} disabled={!canUndo}>
        Undo
      </UndoButton>
    </Bar>
  );
}
