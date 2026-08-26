'use client';

import { styled } from '@mui/material/styles';
import CreateBattleLink from './CreateBattleLink';

// Mockup split (Story 1.12, spec conflict 2): the clinical theme styles .empty-state
// (clinical-lab-theme/battle-gallery.html:425-451) but never renders it — the markup, copy and
// glyph came from a commented-out block in the biotech (Epic 6) file
// (biotech-terminal-theme/battle-gallery.html:961-966), whose own CTA is the same .create-button
// Story 2.2 now wires here. Structure and copy come from that block, styled values from the
// clinical CSS, same resolution Stories 1.10/1.11 used for this split.
//
// One deliberate departure from that CSS: EmptyDescription's bottom margin stays 16px rather than
// .empty-state-description's 30px — a spacing call made once (Story 1.12) and not revisited here,
// since no AC in this story governs the empty-state's internal spacing.
const EmptyState = styled('div')({
  textAlign: 'center',
  padding: '80px 20px',
  color: 'var(--gol-text-secondary)',
});

// aria-hidden (forced decision 3): every fact this glyph conveys is already text in the heading
// and paragraphs below it, so an accessible name would be a duplicate announcement — same
// reasoning as AppShell.tsx's <LogoAccent aria-hidden="true">◉</LogoAccent>.
const EmptyIcon = styled('div')({
  fontSize: '64px',
  marginBottom: '20px',
  opacity: 0.3,
});

// <h2>, not <h3>: the page's only <h1> is "Battle Gallery" (BattleGallery.tsx SectionTitle), and
// skipping straight to <h3> here would trip axe's heading-order rule.
const EmptyTitle = styled('h2')({
  fontSize: '24px',
  fontWeight: 600,
  margin: '0 0 12px',
  color: 'var(--gol-text-primary)',
});

const EmptyDescription = styled('p')({
  fontSize: '14px',
  maxWidth: '400px',
  margin: '0 auto 16px',
});

// The designed first-run view (architecture M1: first run seeds zero battles "so the Gallery
// shows the 'Create Your First Battle' prompt" — this is the production default, not an edge
// case). No props: fixed copy, no data inputs.
//
// The CTA is now the real control (AC2, Story 2.2) — it replaces the inert sentence text
// ("Create your first battle to begin.") that shipped as a placeholder specifically awaiting this
// story. Label per spec conflict #2 (FR-7.4 + this story's own AC1 both name it "Create Your First
// Battle", overriding the mockups' shared "+ Create New Battle"). Shares CreateBattleLink with the
// Gallery toolbar's CTA (Task 5) rather than styling the control twice.
export default function GalleryEmptyState() {
  return (
    <EmptyState>
      <EmptyIcon aria-hidden="true">∅</EmptyIcon>
      <EmptyTitle>No Battles Yet</EmptyTitle>
      <EmptyDescription>
        Game of Life Studio is a workspace for cellular battles: a grid where several organisms,
        each with its own rules for birth, survival and death, compete for space one generation at a
        time.
      </EmptyDescription>
      <CreateBattleLink href="/battle/new">Create Your First Battle</CreateBattleLink>
    </EmptyState>
  );
}
