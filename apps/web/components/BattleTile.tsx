'use client';

import type { KeyboardEvent } from 'react';
import { styled } from '@mui/material/styles';
import { formatBattleDate } from '@/lib/formatBattleDate';
import type { TileOrganism } from '@/lib/tileOrganisms';

// A battle may legally place 255 organisms (Decision G.3) — the mockup's 2-3 dots is not the
// bound, and an uncapped row reflows the whole tile. Organisms beyond the cap fold into the "+n"
// indicator, whose own tooltip lists their names — nothing is ever unreachable (silent-failure
// trap: "the dot row must be capped; the name list must not be").
const MAX_VISIBLE_DOTS = 6;

export interface BattleTileProps {
  name: string;
  gridSize: { cols: number; rows: number };
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

const DotRow = styled('span')({
  display: 'flex',
  gap: '6px',
});

// Groups a dot (or the "+n" indicator) with its own tooltip so :hover/:focus-within on the
// wrapper covers the tooltip's rendered area too, not just the dot — WCAG 1.4.13's "hoverable"
// requirement (a sighted pointer user must be able to move onto the tooltip without it vanishing).
const DotWrapper = styled('span')({
  position: 'relative',
  display: 'inline-flex',
});

// Mockup: .participant-dot (battle-gallery.html:338-345), but a real <button> with a real
// accessible name — not a bare <div>. The mockup's ::before hover tooltip is CSS-only: no
// accessible name, unreachable by keyboard (WCAG 1.4.13 requires focus to reveal the same content
// hover does). aria-label carries the name directly to assistive tech; the visual Tooltip below
// is aria-hidden to avoid double-announcing it.
const Dot = styled('button')({
  width: '12px',
  height: '12px',
  borderRadius: '2px',
  border: '1px solid var(--gol-border)',
  padding: 0,
  cursor: 'pointer',
  '&:focus-visible': {
    outline: '2px solid var(--gol-accent)',
    outlineOffset: '2px',
  },
});

const MoreIndicator = styled(Dot)({
  width: 'auto',
  minWidth: '20px',
  height: '16px',
  padding: '0 4px',
  fontSize: '10px',
  lineHeight: '14px',
  color: 'var(--gol-text-tertiary)',
  background: 'transparent',
});

// Mockup: .participant-dot::before (battle-gallery.html:347-368) — same visual, now a real
// element toggled by :hover/:focus-within on the wrapper rather than a CSS-only pseudo-element,
// so keyboard focus reveals it exactly like a mouse hover does.
const Tooltip = styled('span')({
  position: 'absolute',
  bottom: '100%',
  right: 0,
  transform: 'translateY(-8px)',
  background: 'var(--gol-bg-primary)',
  border: '1px solid var(--gol-accent)',
  color: 'var(--gol-accent)',
  padding: '6px 10px',
  fontSize: '11px',
  whiteSpace: 'nowrap',
  opacity: 0,
  pointerEvents: 'none',
  transition: 'opacity 0.2s, transform 0.2s',
  zIndex: 100,
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
  fontWeight: 500,
});

// A structural sibling selector (`button + span`), not an Emotion component-selector
// interpolation (`${Tooltip}`) — MUI's `styled()` does not resolve that trick outside Emotion's
// own `css` tag (confirmed by inspecting the emitted CSS: it literalizes to the string
// "no_component_selector" instead of a class selector, so the rule silently never matches).
// Tooltip is always the single <span> immediately after the trigger <button> here, so the plain
// combinator is exact and has no such fragility.
const DotWrapperWithTooltip = styled(DotWrapper)({
  '&:hover button + span, &:focus-within button + span': {
    opacity: 1,
    transform: 'translateY(-10px)',
  },
});

// WCAG 1.4.13 "dismissible": Escape moves focus off the trigger, which drops :focus-within and
// hides the tooltip — without this, a keyboard user has no way to close it short of tabbing away.
function dismissOnEscape(event: KeyboardEvent<HTMLButtonElement>) {
  if (event.key === 'Escape') event.currentTarget.blur();
}

export default function BattleTile({ name, gridSize, updatedAt, organisms }: BattleTileProps) {
  const visibleDots = organisms.slice(0, MAX_VISIBLE_DOTS);
  const overflow = organisms.slice(MAX_VISIBLE_DOTS);

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
        <DotRow>
          {visibleDots.map((organism) => (
            <DotWrapperWithTooltip key={organism.id}>
              <Dot
                type="button"
                aria-label={organism.name}
                style={{ backgroundColor: organism.color }}
                onKeyDown={dismissOnEscape}
              />
              <Tooltip aria-hidden="true">{organism.name}</Tooltip>
            </DotWrapperWithTooltip>
          ))}
          {overflow.length > 0 && (
            <DotWrapperWithTooltip>
              <MoreIndicator
                type="button"
                aria-label={`${overflow.length} more organism${overflow.length === 1 ? '' : 's'}: ${overflow.map((o) => o.name).join(', ')}`}
                onKeyDown={dismissOnEscape}
              >
                +{overflow.length}
              </MoreIndicator>
              <Tooltip aria-hidden="true">{overflow.map((o) => o.name).join(', ')}</Tooltip>
            </DotWrapperWithTooltip>
          )}
        </DotRow>
      </TileFooter>
    </Tile>
  );
}
