'use client';

import { useId, useState } from 'react';
import { styled } from '@mui/material/styles';
import { formatBattleDate } from '@/lib/formatBattleDate';
import type { TileOrganism } from '@/lib/tileOrganisms';

// A battle may legally place 255 organisms (Decision G.3) — the mockup's 2-3 dots is not the
// bound, and an uncapped row reflows the whole tile. The full list always renders inside the
// disclosure panel.
const MAX_VISIBLE_DOTS = 6;

export interface BattleTileProps {
  name: string;
  gridSize: { cols: number; rows: number };
  createdAt: Date | undefined;
  updatedAt: Date;
  organisms: readonly TileOrganism[];
}

// Mockup: .battle-tile (clinical-lab-theme/battle-gallery.html:242-255). No `cursor: pointer` —
// the mockup has it because its tile navigates; ours does not until Story 2.2. `:focus-within`
// alongside `:hover` gives the keyboard path the same tile-level state change the mouse path does
// (the parity gap the Story 1.9 review found on AppNav).
const Tile = styled('article')({
  background: 'var(--gol-bg-secondary)',
  border: '1px solid var(--gol-border)',
  padding: '20px',
  transition: 'all 0.3s',
  position: 'relative',
  '&:hover, &:focus-within': {
    borderColor: 'var(--gol-accent)',
    transform: 'translateY(-2px)',
    boxShadow: 'var(--gol-shadow-tile-hover)',
  },
});

const TileHeader = styled('header')({
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginBottom: '16px',
  gap: '12px',
});

// The tile heading is <h2>: the page's only <h1> is "Battle Gallery" (Story 1.9). A tile <h3>
// would skip a level, which axe's heading-order rule does check.
const TileTitle = styled('h2')({
  fontSize: '18px',
  fontWeight: 600,
  margin: 0,
  color: 'var(--gol-text-primary)',
});

const TileStats = styled('span')({
  fontSize: '12px',
  color: 'var(--gol-text-secondary)',
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
  whiteSpace: 'nowrap',
});

// Story 1.11 puts a canvas here. aria-hidden: it carries no information yet — a placeholder box.
const PetriDish = styled('div')({
  width: '100%',
  aspectRatio: '5 / 3',
  background: 'var(--gol-bg-primary)',
  border: '1px solid var(--gol-border)',
  marginBottom: '16px',
});

const TileFooter = styled('footer')({
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  fontSize: '12px',
  color: 'var(--gol-text-tertiary)',
  gap: '12px',
});

const TileDate = styled('span')({
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
});

// The FR-7.3 metadata trigger. FR-7.3 permits a tooltip OR an expandable section; the mockup's
// `.participant-dot::before` hover tooltip is mouse-only — unreachable by keyboard or AT, and it
// cannot carry both dates in one place — so this is a real disclosure button, not CSS-only. It is
// also what makes AC5's "keyboard-focusable" honest: a real control with a real effect, not
// `tabIndex` on the tile itself.
const DisclosureButton = styled('button')({
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  background: 'transparent',
  border: 'none',
  padding: 0,
  color: 'inherit',
  font: 'inherit',
  fontSize: '12px',
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
  cursor: 'pointer',
  '&:focus-visible': {
    outline: '2px solid var(--gol-accent)',
    outlineOffset: '2px',
  },
});

const DotRow = styled('span')({
  display: 'flex',
  gap: '4px',
});

const Dot = styled('span')({
  width: '12px',
  height: '12px',
  borderRadius: '2px',
  border: '1px solid var(--gol-border)',
  display: 'inline-block',
});

const MoreCount = styled('span')({
  color: 'var(--gol-text-tertiary)',
});

const Panel = styled('div')({
  marginTop: '12px',
  paddingTop: '12px',
  borderTop: '1px solid var(--gol-border)',
});

const DateList = styled('dl')({
  display: 'grid',
  gridTemplateColumns: 'auto 1fr',
  gap: '4px 8px',
  margin: '0 0 12px',
  fontSize: '12px',
  color: 'var(--gol-text-secondary)',
});

const OrganismList = styled('ul')({
  listStyle: 'none',
  margin: 0,
  padding: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: '6px',
});

const OrganismListItem = styled('li')({
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  fontSize: '12px',
  color: 'var(--gol-text-primary)',
});

export default function BattleTile({
  name,
  gridSize,
  createdAt,
  updatedAt,
  organisms,
}: BattleTileProps) {
  const [open, setOpen] = useState(false);
  // A hardcoded id breaks the moment two tiles render — aria-controls would silently point at the
  // wrong panel rather than failing.
  const panelId = useId();

  const visibleDots = organisms.slice(0, MAX_VISIBLE_DOTS);
  const hiddenCount = organisms.length - visibleDots.length;

  return (
    <Tile>
      <TileHeader>
        <TileTitle>{name}</TileTitle>
        <TileStats>
          {gridSize.cols} × {gridSize.rows}
        </TileStats>
      </TileHeader>
      <PetriDish aria-hidden="true" />
      <TileFooter>
        <TileDate>{formatBattleDate(updatedAt)}</TileDate>
        <DisclosureButton
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((prev) => !prev)}
        >
          <DotRow aria-hidden="true">
            {visibleDots.map((organism) => (
              <Dot key={organism.id} style={{ backgroundColor: organism.color }} />
            ))}
            {hiddenCount > 0 && <MoreCount>+{hiddenCount} more</MoreCount>}
          </DotRow>
          {organisms.length} organism{organisms.length === 1 ? '' : 's'}
        </DisclosureButton>
      </TileFooter>
      {open && (
        <Panel id={panelId}>
          <DateList>
            <dt>Created</dt>
            <dd>{formatBattleDate(createdAt)}</dd>
            <dt>Modified</dt>
            <dd>{formatBattleDate(updatedAt)}</dd>
          </DateList>
          <OrganismList>
            {organisms.map((organism) => (
              <OrganismListItem key={organism.id}>
                <Dot aria-hidden="true" style={{ backgroundColor: organism.color }} />
                {organism.name}
              </OrganismListItem>
            ))}
          </OrganismList>
        </Panel>
      )}
    </Tile>
  );
}
