'use client';

import type { ReactNode } from 'react';
import { styled } from '@mui/material/styles';

// Mockup: clinical-lab-theme/about.html. A static page — no repository, no seed, no storage read:
// nothing here depends on the workspace, so the page boundary injects nothing.

export const LINKEDIN_URL = 'https://www.linkedin.com/in/arielsidi/';
export const GITHUB_URL = 'https://github.com/sidiar/game-of-life-studio';
export const CONTACT_EMAIL = 'hello@game-of-life-studio.com';
export const CONWAY_WIKI_URL = 'https://en.wikipedia.org/wiki/Conway%27s_Game_of_Life';

const HEADING_ID = 'about-heading';

// Mockup: .section-header/.section-title/.section-subtitle — the same hand copy SettingsPage.tsx
// carries (its FD6 comment records why the lift is still owed).
const SectionHeader = styled('div')({
  marginBottom: '35px',
});

const SectionTitle = styled('h1')({
  fontSize: '32px',
  fontWeight: 600,
  margin: '0 0 8px',
  letterSpacing: 'var(--gol-letter-spacing-title)',
  color: 'var(--gol-text-primary)',
});

const SectionSubtitle = styled('p')({
  fontSize: '14px',
  color: 'var(--gol-text-secondary)',
  margin: 0,
});

// Mockup: .about — a reading column beside the decorative specimen, collapsing to one column.
const Layout = styled('div')({
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 680px) minmax(0, 1fr)',
  gap: '48px',
  alignItems: 'start',
  '@media (max-width: 900px)': {
    gridTemplateColumns: '1fr',
  },
});

const Body = styled('div')({
  display: 'flex',
  flexDirection: 'column',
  gap: '24px',
});

const Panel = styled('section')({
  backgroundColor: 'var(--gol-bg-secondary)',
  border: '1px solid var(--gol-border)',
  padding: '28px',
});

// Styled as a small label, but it IS each panel's heading — an <h2> under the page's single <h1>,
// so screen-reader heading navigation lands on every panel.
const PanelLabel = styled('h2')({
  fontSize: '11px',
  fontWeight: 600,
  color: 'var(--gol-accent)',
  textTransform: 'uppercase',
  letterSpacing: '1px',
  margin: '0 0 14px',
});

const Paragraph = styled('p')({
  fontSize: '16px',
  lineHeight: 1.65,
  color: 'var(--gol-text-secondary)',
  margin: 0,
  '& strong': {
    color: 'var(--gol-text-primary)',
    fontWeight: 600,
  },
});

const Author = styled('div')({
  display: 'flex',
  alignItems: 'center',
  gap: '18px',
});

const AuthorMark = styled('div')({
  width: '56px',
  height: '56px',
  border: '2px solid var(--gol-accent)',
  borderRadius: '4px',
  display: 'grid',
  placeItems: 'center',
  fontSize: '20px',
  fontWeight: 600,
  color: 'var(--gol-accent)',
  flexShrink: 0,
});

const AuthorName = styled('p')({
  fontSize: '20px',
  fontWeight: 600,
  letterSpacing: '-0.3px',
  color: 'var(--gol-text-primary)',
  margin: 0,
});

const AuthorRole = styled('p')({
  fontSize: '13px',
  color: 'var(--gol-text-secondary)',
  margin: '4px 0 0',
});

const LinkRow = styled('div')({
  display: 'flex',
  gap: '12px',
  flexWrap: 'wrap',
  marginTop: '20px',
});

// Mockup: .link-button / .link-button.primary. The boundary is --gol-border-control, not the
// decorative --gol-border (themes.css departure #2): it is a control edge.
const LinkButton = styled('a', {
  shouldForwardProp: (prop) => prop !== 'primary',
})<{ primary?: boolean }>(({ primary }) => ({
  display: 'inline-flex',
  alignItems: 'center',
  gap: '10px',
  backgroundColor: primary ? 'var(--gol-accent)' : 'transparent',
  color: primary ? 'var(--gol-on-accent)' : 'var(--gol-text-primary)',
  border: `1px solid ${primary ? 'var(--gol-accent)' : 'var(--gol-border-control)'}`,
  padding: '12px 20px',
  fontSize: '13px',
  fontWeight: 600,
  textTransform: primary ? 'none' : 'uppercase',
  letterSpacing: '0.5px',
  textDecoration: 'none',
  transition: 'all 0.2s',
  '&:hover': primary
    ? { backgroundColor: 'var(--gol-accent-hover)', borderColor: 'var(--gol-accent-hover)' }
    : { borderColor: 'var(--gol-accent)', color: 'var(--gol-accent)' },
  // Same ring as AppNav's NavItem — axe does not evaluate focus visibility.
  '&:focus-visible': {
    outline: '2px solid var(--gol-accent)',
    outlineOffset: '2px',
  },
}));

// A link inside running text, not a `LinkButton`: accent colour plus an underline, so it stays
// identifiable without relying on colour alone (SC 1.4.1), and the same new-tab ↗ the buttons carry.
const InlineLink = styled('a')({
  color: 'var(--gol-accent)',
  textDecoration: 'underline',
  textUnderlineOffset: '3px',
  '&:hover': {
    color: 'var(--gol-accent-hover)',
  },
  '&:focus-visible': {
    outline: '2px solid var(--gol-accent)',
    outlineOffset: '2px',
  },
});

function ExternalLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <LinkButton href={href} target="_blank" rel="noopener noreferrer">
      {children} <span aria-hidden="true">↗</span>
    </LinkButton>
  );
}

// Mockup: .specimen — a static glider on a 12×12 dish. Purely decorative (aria-hidden); DOM
// cells, not the Canvas renderer, because nothing here simulates.
const SPECIMEN_SIZE = 12;
const GLIDER = new Set(['2,4', '3,5', '4,3', '4,4', '4,5']);

const Specimen = styled('div')({
  backgroundColor: 'var(--gol-bg-secondary)',
  border: '1px solid var(--gol-border)',
  padding: '24px',
  position: 'sticky',
  top: '30px',
  '@media (max-width: 900px)': {
    position: 'static',
    maxWidth: '320px',
  },
});

const SpecimenGrid = styled('div')({
  display: 'grid',
  gridTemplateColumns: `repeat(${SPECIMEN_SIZE}, 1fr)`,
  gap: '2px',
  aspectRatio: '1',
  marginBottom: '16px',
});

const Cell = styled('div', {
  shouldForwardProp: (prop) => prop !== 'alive',
})<{ alive: boolean }>(({ alive }) => ({
  backgroundColor: alive ? 'var(--gol-accent)' : 'var(--gol-bg-primary)',
  borderRadius: '1px',
  boxShadow: alive ? '0 0 6px var(--gol-accent)' : 'none',
}));

const SpecimenCaption = styled('div')({
  fontSize: '11px',
  color: 'var(--gol-text-tertiary)',
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
  display: 'flex',
  justifyContent: 'space-between',
});

function GliderSpecimen() {
  const cells = [];
  for (let r = 0; r < SPECIMEN_SIZE; r++) {
    for (let c = 0; c < SPECIMEN_SIZE; c++) {
      cells.push(<Cell key={`${r},${c}`} alive={GLIDER.has(`${r},${c}`)} />);
    }
  }
  return (
    <Specimen aria-hidden="true" data-testid="about-specimen">
      <SpecimenGrid>{cells}</SpecimenGrid>
      <SpecimenCaption>
        <span>Specimen: glider</span>
        <span>Gen 0</span>
      </SpecimenCaption>
    </Specimen>
  );
}

/** The `/about` page body: who built the studio, where the source lives, how to get in touch. */
export default function AboutPage() {
  return (
    <section aria-labelledby={HEADING_ID}>
      <SectionHeader>
        <SectionTitle id={HEADING_ID}>About</SectionTitle>
        <SectionSubtitle>Who made this, how it was built, and how to get in touch</SectionSubtitle>
      </SectionHeader>

      <Layout>
        <Body>
          <Panel aria-labelledby="about-studio">
            <PanelLabel id="about-studio">The studio</PanelLabel>
            <Paragraph>
              {/* ⚠️ Keep an HTML entity (`&apos;`) out of any MULTI-LINE text that opens with a
                space after a tag: Next 16.2's SWC drops that leading space (the page shipped
                "Studiotakes" that way — Vitest's transform keeps it, so only the built HTML shows
                it). The apostrophe now sits inside the link's own one-line text. */}
              <strong>Game of Life Studio</strong> takes{' '}
              <InlineLink href={CONWAY_WIKI_URL} target="_blank" rel="noopener noreferrer">
                Conway&apos;s Game of Life <span aria-hidden="true">↗</span>
              </InlineLink>{' '}
              and turns it into a battle: several organisms, each with its own rules, share one
              petri dish and compete for space. Design an organism, drop it into a battle, press
              play, and see who survives.
            </Paragraph>
          </Panel>

          <Panel aria-labelledby="about-author">
            <PanelLabel id="about-author">Made by</PanelLabel>
            <Author>
              <AuthorMark aria-hidden="true">AS</AuthorMark>
              <div>
                <AuthorName>Ariel Sidi</AuthorName>
                <AuthorRole>Senior software engineer · Barcelona</AuthorRole>
              </div>
            </Author>
            <LinkRow>
              <ExternalLink href={LINKEDIN_URL}>LinkedIn</ExternalLink>
            </LinkRow>
          </Panel>

          <Panel aria-labelledby="about-built">
            <PanelLabel id="about-built">How it was built</PanelLabel>
            <Paragraph>
              Curious how this site was built? It&apos;s all open on GitHub: the code, the planning
              documents behind it, and the AI-assisted, spec-driven workflow that delivered it story
              by story.
            </Paragraph>
            <LinkRow>
              <ExternalLink href={GITHUB_URL}>View on GitHub</ExternalLink>
            </LinkRow>
          </Panel>

          <Panel aria-labelledby="about-contact">
            <PanelLabel id="about-contact">Say hello</PanelLabel>
            <Paragraph>
              I hope you enjoy this site as much as I enjoyed building it. I&apos;d be happy to hear
              from you: feedback, ideas, suggestions, or a bug you found. Please get in touch.
            </Paragraph>
            <LinkRow>
              <LinkButton
                primary
                href={`mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent('Game of Life Studio')}`}
              >
                {CONTACT_EMAIL}
              </LinkButton>
            </LinkRow>
          </Panel>
        </Body>

        <GliderSpecimen />
      </Layout>
    </section>
  );
}
