'use client';

import { styled } from '@mui/material/styles';

// Mockup: .header (clinical-lab-theme/petri-dish-lab-mode.html:33-45). `position: fixed` is
// deliberately NOT reproduced: the mockup pins the bar and offsets the body under it, and this
// story ships no body to offset. Story 2.4's auto-fit canvas sizes off the space this header
// leaves, so pinning it is that story's call to make against a real layout, not a detail to guess
// at here. Static chrome goes through styled(), not sx (RFC-003 Decision 3).
const Header = styled('header')({
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '20px 30px',
  borderBottom: '1px solid var(--gol-border)',
  background: 'var(--gol-bg-primary)',
});

// Mockup: .logo (petri-dish-lab-mode.html:47-53). This is an <h1>, not the gallery shell's
// <div> wordmark: the battle route drops AppShell entirely (the layout split, this story), so the
// battle title is the only heading candidate on the route and it IS what the document is about.
// The gallery branch keeps its own rule — AppShell's brand mark stays a <div> so BattleGallery's
// "Battle Gallery" remains that document's sole <h1>. Nothing automated enforces single-<h1>
// (axe has no duplicate-h1 rule); BattlePage.test.tsx's h1-count assertion is this route's guard.
//
// `overflowWrap` + `minWidth: 0` because BattleSchema caps names at 100 characters with no
// constraint on spaces: a 100-character unbroken name would otherwise push the document into
// horizontal scroll rather than wrapping.
const Title = styled('h1')({
  fontSize: '18px',
  fontWeight: 600,
  margin: 0,
  letterSpacing: 'var(--gol-letter-spacing-title)',
  color: 'var(--gol-text-primary)',
  textTransform: 'uppercase',
  minWidth: 0,
  overflowWrap: 'anywhere',
});

// Mockup: .header-actions (petri-dish-play-mode.html:55-59 / lab-mode:55-59) — the right-hand
// cluster the mode toggle sits in. Its `gap` is what will space Story 3.18's fullscreen button off
// the toggle; today it holds the toggle alone.
const Actions = styled('div')({
  display: 'flex',
  gap: '15px',
  alignItems: 'center',
});

// Mockup: .mode-toggle (:62-66). Story 3.11 forced decision 2, option (a): two plain `<button>`s
// with `aria-pressed` inside a named group — the toggle-button pattern axe understands, and no MUI
// import on the tightest bundle in the repo (`<EditorStatusBar>`'s FD2 made the same call for
// UNDO/SAVE). ❌ Not `ToggleButtonGroup`: Story 2.7 shipped one and 2.9 removed it with its
// `@mui/material` imports (BattleEditorView.tsx records why).
const ModeToggle = styled('div')({
  display: 'flex',
  border: '1px solid var(--gol-border)',
  background: 'var(--gol-bg-secondary)',
});

// Mockup: .mode-btn (:68-95) verbatim, minus `transition: all 0.2s` (the axe mid-fade trap
// `<EditorStatusBar>` and `<SidebarFooter>` both record — a scan landing mid-fade measures a
// contrast no settled state has) and minus `position: relative` (nothing is positioned against
// it). `:first-child` carries the divider between the pair, as in the mockup.
//
// Forced decision 3, option (a): the ACTIVE colour is MODE-DEPENDENT, because the two mockups
// disagree and both are right. The lab mockup's `.mode-btn.active` is neutral
// (`--gol-bg-hover` / `--gol-text-primary`, :87-90); the play mockup's is accent
// (`rgba(0, 212, 255, 0.1)` / `var(--accent)`, play-mode:87-90) — the same "the simulation is
// live" signal that turns the play dish's border accent. `--gol-accent-tint` is that rgba as a
// token (themes.css; Story 4.2 authored it for exactly this value — AR-46 forbids the literal).
// The neutral rule is the base; the `data-mode-value="run"` selector layers the accent pair over
// it for the RUN button only.
//
// `&:hover` is scoped to `:not([aria-pressed="true"]):not(:disabled)` — the mockup's
// `.mode-btn:not(.active):hover`, plus the disabled exclusion the mockup never needed because it
// never disabled anything. The disabled trio is the pre-validated set every control on this route
// wears (`<SidebarFooter>`, `<EditorToolsSection>`, `<GridSettingsSection>`).
const ModeButton = styled('button')({
  background: 'transparent',
  border: 'none',
  color: 'var(--gol-text-secondary)',
  padding: '8px 20px',
  fontSize: '11px',
  fontWeight: 600,
  // Trap 15 (`<SidebarFooter>`): DOM text stays sentence case ("Lab", "Run") so the accessible
  // names do; CSS renders the mockup's LAB / RUN.
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
  cursor: 'pointer',
  fontFamily: 'inherit',
  '&:first-of-type': {
    borderRight: '1px solid var(--gol-border)',
  },
  '&[aria-pressed="true"]': {
    background: 'var(--gol-bg-hover)',
    color: 'var(--gol-text-primary)',
  },
  '&[data-mode-value="run"][aria-pressed="true"]': {
    background: 'var(--gol-accent-tint)',
    color: 'var(--gol-accent)',
  },
  '&:hover:not([aria-pressed="true"]):not(:disabled)': {
    background: 'var(--gol-bg-hover)',
    color: 'var(--gol-text-primary)',
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
});

export type BattleMode = 'lab' | 'run';

export interface BattleHeaderProps {
  battleTitle: string;
  /**
   * Spec §3.2: both OPTIONAL, and the toggle renders only when BOTH are supplied — a `mode` with
   * nothing wired behind it would be the rendered-but-inert control NFR-4.1 forbids (Story 2.1
   * asserted zero controls for exactly that reason; Story 3.11 supplies both from `<BattlePage>`
   * and the count test flipped to "exactly two buttons").
   */
  mode?: BattleMode;
  onModeToggle?(next: BattleMode): void;
  /**
   * Story 3.11: the visible half of `<BattlePage>`'s edit lock (`isSaving`) AND the "this roster
   * cannot run" refusal (AC7, forced decision 4). Reaches the RUN button only — LAB is always
   * reachable from Run, because neither reason is a reason to trap the user there.
   */
  disabled?: boolean;
  /** Lands as `title` on the RUN button, so a disabled control states WHY (NFR-4.1). */
  disabledReason?: string;
  /** Still ABSENT from the render — the fullscreen button is Story 3.18. */
  onEnterFullscreen?(): void;
}

// Display only (component-tree-battle-page.md §3.2): the title is TEXT, never an input.
// In-place renaming is <BattleNameField> in the sidebar (Story 2.11), and no Save, Back or dirty
// indicator belongs here either. The one control it owns is the Lab⇄Run toggle (FR-3.10):
// `<BattlePage>` owns `mode` and this component only reports the press (AR-28).
export default function BattleHeader({
  battleTitle,
  mode,
  onModeToggle,
  disabled = false,
  disabledReason,
}: BattleHeaderProps) {
  const showToggle = mode !== undefined && onModeToggle !== undefined;
  return (
    <Header>
      <Title>{battleTitle}</Title>
      {showToggle && (
        <Actions>
          <ModeToggle role="group" aria-label="Mode">
            {/* The ACTIVE button is a no-op, never a re-set: `onModeToggle` fires only for a
                genuine change, so `<BattlePage>` never renders for a mode it is already in. */}
            <ModeButton
              type="button"
              data-mode-value="lab"
              aria-pressed={mode === 'lab'}
              onClick={() => mode !== 'lab' && onModeToggle('lab')}
            >
              Lab
            </ModeButton>
            <ModeButton
              type="button"
              data-mode-value="run"
              aria-pressed={mode === 'run'}
              disabled={disabled}
              title={disabled ? disabledReason : undefined}
              onClick={() => mode !== 'run' && onModeToggle('run')}
            >
              Run
            </ModeButton>
          </ModeToggle>
        </Actions>
      )}
    </Header>
  );
}
