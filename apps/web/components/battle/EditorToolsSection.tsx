'use client';

import { styled } from '@mui/material/styles';

/**
 * Spec §3.7's Tools section (FR-3.7). Presentational and total: no repository, no grid, no
 * derivation of its own — it receives one callback and one flag and renders one button.
 *
 * The mockup's Tools section ships FOUR buttons (`petri-dish-lab-mode.html:407-421`, markup
 * `:727-733`); spec §3.7 keeps TWO for the MVP and §9.3 excludes the other pair. This story ships
 * the first of the two:
 * - "EXPORT BATTLE" is Epic 5 (FR-6.1/7.13) — absent → not rendered (NFR-4.1). Forced decision 3:
 *   `onExport?()` is NOT declared on these props yet — Story 5.6 adds it when it has something to
 *   pass, following the precedent Story 2.14 set for the other direction ("the remaining sidebar
 *   sections bring whatever they need with them").
 * - "RESET TO SAVED" and "RANDOMIZE" have NO backing FR at all (§9.3 excludes them from the MVP
 *   outright — not deferred, not in the product).
 *
 * ⚠️ Label: "CLEAR PETRI DISH" in the UI, "Reset Grid" in the ACs (spec §9.4) — the mockup's Clear
 * button IS FR-3.7's Reset Grid, under two names for two audiences. Do not invent a third.
 */

/**
 * `.tool-btn` (`petri-dish-lab-mode.html:407-421`), the sidebar button idiom `<GridSettingsSection>`
 * already established with the same two substitutions this route settled there:
 *
 * ⚠️ **`--gol-border-control`, not the mockup's decorative `--gol-border`** (trap 10). That border
 * measures 1.57:1 against `--gol-bg-primary`; this button's border is its only boundary, so SC
 * 1.4.11's 3:1 applies — `themeTokens.test.ts` asserts the split exists precisely so it keeps
 * being used.
 *
 * ❌ **No `transition`** (trap 9). The three settled states are three different validated colour
 * pairs — resting `--gol-text-secondary`-on-transparent, hover `--gol-text-primary`-on-
 * `--gol-bg-hover`, disabled `--gol-action-disabled`-on-`--gol-action-disabled-bg` — and Stories
 * 2.13/2.14 each lost a transition here to an axe scan that landed mid-fade and measured a control
 * at a ratio no settled state ever has.
 */
const ToolButton = styled('button')({
  width: '100%',
  background: 'transparent',
  border: '1px solid var(--gol-border-control)',
  color: 'var(--gol-text-secondary)',
  padding: '10px',
  fontSize: '11px',
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
  cursor: 'pointer',
  fontFamily: 'inherit',
  '&:hover:not(:disabled)': {
    borderColor: 'var(--gol-text-secondary)',
    color: 'var(--gol-text-primary)',
    background: 'var(--gol-bg-hover)',
  },
  // Trap 8: `:focus-visible`, not `<GridSettingsSection>`'s `:focus-within`. That workaround exists
  // because ITS focusable element is a visually-hidden radio inside a <label>; this is a REAL
  // <button> that receives focus itself, so `:focus-visible` is both correct and better — no ring
  // on a mouse click.
  '&:focus-visible': {
    outline: '2px solid var(--gol-accent)',
    outlineOffset: '2px',
  },
  // The same pre-validated disabled pair every other control on this route uses.
  '&:disabled': {
    background: 'var(--gol-action-disabled-bg)',
    borderColor: 'var(--gol-border)',
    color: 'var(--gol-action-disabled)',
    cursor: 'not-allowed',
  },
});

export interface EditorToolsSectionProps {
  /** FR-3.7. `<BattleEditorView>`'s `handleClear` carries its own already-empty guard (AC3) and
   * `isSaving` guard (trap 6) — this component fires the callback unconditionally on a real click,
   * exactly as `<BattleNameField>`'s `onChange` and `<GridSettingsSection>`'s `onResize` do. */
  onClear(): void;
  /** The visible half of `<BattlePage>`'s edit lock (trap 6), mirroring
   * `<BattleNameField disabled={isSaving}>` and `<GridSettingsSection disabled={isSaving}>`. */
  disabled?: boolean;
}

export default function EditorToolsSection({ onClear, disabled = false }: EditorToolsSectionProps) {
  return (
    <ToolButton type="button" onClick={onClear} disabled={disabled}>
      Clear Petri Dish
    </ToolButton>
  );
}
