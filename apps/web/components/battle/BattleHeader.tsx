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

export interface BattleHeaderProps {
  battleTitle: string;
  // All three are ABSENT in Epic 2 and the header renders nothing for them — the mode toggle and
  // the fullscreen button are Epic 3. A rendered-but-inert control is precisely what NFR-4.1
  // forbids, so their absence is asserted in this component's tests rather than left implicit.
  mode?: 'lab' | 'run';
  onModeToggle?(next: 'lab' | 'run'): void;
  onEnterFullscreen?(): void;
}

// Display only (component-tree-battle-page.md §3.2): the title is TEXT, never an input.
// In-place renaming is <BattleNameField> in the sidebar (Story 2.11), and no Save, Back or dirty
// indicator belongs here either.
export default function BattleHeader({ battleTitle }: BattleHeaderProps) {
  return (
    <Header>
      <Title>{battleTitle}</Title>
    </Header>
  );
}
