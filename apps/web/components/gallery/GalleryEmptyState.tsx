'use client';

import { styled } from '@mui/material/styles';

// Mockup split (Story 1.12, spec conflict 2): the clinical theme styles .empty-state
// (clinical-lab-theme/battle-gallery.html:425-451) but never renders it — the only markup, copy
// and glyph are a commented-out block in the biotech (Epic 6) file
// (biotech-terminal-theme/battle-gallery.html:961-966). Structure and copy come from there, styled
// values from the clinical CSS, same resolution Stories 1.10/1.11 used for this split.
//
// Two deliberate departures from that CSS, both prescribed by the story's Task 1 table:
// EmptyDescription's bottom margin is 16px where .empty-state-description says 30px (the mockup's
// 30px gap sat above a button this story does not ship), and EmptyPrompt has no mockup class at all
// — see its own comment below.
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

// No mockup class for this line — the biotech block's single <p> holds both the explanation and
// the prompt; splitting them here (Task 1) keeps "what is this app" and "what do I do" as two
// sentences instead of one, and gives the prompt its own emphasis colour.
const EmptyPrompt = styled('p')({
  fontSize: '14px',
  maxWidth: '400px',
  margin: '0 auto',
  color: 'var(--gol-text-primary)',
});

// The designed first-run view (architecture M1: first run seeds zero battles "so the Gallery
// shows the 'Create Your First Battle' prompt" — this is the production default, not an edge
// case). No props: fixed copy, no data inputs. Deliberately renders no button, link, or other
// focusable control (AC2) — the FR-7.4 prompt ships as sentence text until Story 2.2 wires the
// real CTA; a title-cased standalone line here would read as a dead button.
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
      <EmptyPrompt>Create your first battle to begin.</EmptyPrompt>
    </EmptyState>
  );
}
