'use client';

import { useId } from 'react';
import { styled } from '@mui/material/styles';
import type { Organism } from '@gol/domain';
import { toDisplayOrganism } from '@/lib/displayOrganisms';

// Mockup: .organism-card / .card-header / .organism-color / .organism-name / .card-stats /
// .stat-item / .rules-preview / .organism-card.preloaded::before
// (organism-library.html:192-261, 404-444). FD1 trims the mockup's usage line, rules SENTENCE and
// action buttons off the card — Dominance/Aging/rule-count ship, "Used in N battles" is FR-1.7's
// (4.19/4.20), the rules sentence needs Story 4.10's action/condition vocabulary, and Edit/Clone/
// Delete are 4.17/4.18/4.22 (a button that does nothing is a dead affordance, NFR-4.1).
//
// FD5: the `<article>` itself is the tab stop, for now. Organism cards open a modal in Story 4.17,
// which does not exist yet, so there is no inner control to be the stop instead — `tabIndex={0}` +
// `aria-labelledby` names the stop after the organism it represents and lights the hover state via
// `:focus-within`. Story 4.17 decides whether the article stays a stop once Edit lands inside it.
//
// AR-46: the organism's resolved colour is an inline `style`, never a styled prop or a token —
// `RFC-007` Decision 5 says organism colours are not theme variables, and there is no
// `--gol-organism-*` token layer for them (the `<OrganismRoster>` `ColorChip` / `<BattleTile>` dot
// precedent, AR-46-clean).
function ruleCountLabel(count: number): string {
  if (count === 0) return 'No rules';
  if (count === 1) return '1 rule';
  return `${count} rules`;
}

// Copies `<BattleTile>`'s `Tile` shape (`BattleTile.tsx:52-76`) — surface, border, padding,
// `position: relative` (the SYSTEM tag's containing block), enumerated transitions, the
// hover/focus-within lift and its reduced-motion escape — plus a real `:focus-visible` ring, which
// `<BattleTile>` does not need because ITS focusable element is the nested title link, not the
// article itself. `:focus-within` matches the article ITSELF when it is the focused element, which
// is what gives the keyboard path the same state as hover (the Story 1.9 parity rule). **No
// `cursor: pointer`**: this card has no click action until Story 4.17, and a pointer cursor on a
// non-interactive surface is a dead affordance (NFR-4.1).
const Card = styled('article')({
  background: 'var(--gol-bg-secondary)',
  border: '1px solid var(--gol-border)',
  padding: '20px',
  position: 'relative',
  transition: 'border-color 0.3s, transform 0.3s, box-shadow 0.3s',
  '&:hover, &:focus-within': {
    borderColor: 'var(--gol-accent)',
    transform: 'translateY(-2px)',
    boxShadow: 'var(--gol-shadow-tile-hover)',
  },
  // The rest border for the protected default (AC3, M9). Same value as the hover/focus rule above,
  // so a system card's border simply stays accent — its hover feedback is the lift + shadow alone
  // (mockup `.preloaded`, `:213-215`, does the same).
  '&[data-system]': {
    borderColor: 'var(--gol-accent)',
  },
  '&:focus-visible': {
    outline: '2px solid var(--gol-accent)',
    outlineOffset: '2px',
  },
  '@media (prefers-reduced-motion: reduce)': {
    transition: 'none',
    '&:hover, &:focus-within': { transform: 'none' },
  },
});

const CardHeader = styled('div')({
  display: 'flex',
  gap: '14px',
  alignItems: 'center',
  marginBottom: '16px',
  paddingBottom: '12px',
  borderBottom: '1px solid var(--gol-border)',
});

// Mockup: .organism-color (:238-243). Decorative-by-association only in the sense that the name
// beside it already carries the organism's identity as text — unlike `<OrganismRoster>`'s chip,
// which sits inside a `<button>` whose accessible name IS the row, this chip has no independent
// accessible-name obligation of its own; `aria-hidden` keeps it out of the tree entirely.
const ColorChip = styled('span')({
  width: '48px',
  height: '48px',
  flexShrink: 0,
  border: '2px solid currentColor',
  borderRadius: '4px',
});

// `minWidth: 0` + `overflowWrap: 'anywhere'` — `<BattleTile>`'s `TileTitle` (`:163-177`) explains
// the 50-char no-space name case against a flex item's `min-width: auto` default. **h2**, not h3:
// the page's only h1 is "Organism Library" (`OrganismLibrary.tsx`), so a card heading one level
// down is correct, and axe's heading-order rule checks it.
const CardName = styled('h2')({
  fontSize: '18px',
  fontWeight: 600,
  margin: 0,
  color: 'var(--gol-text-primary)',
  minWidth: 0,
  overflowWrap: 'anywhere',
});

const CardStats = styled('div')({
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: '12px',
  marginBottom: '16px',
});

const StatItem = styled('div')({
  background: 'var(--gol-bg-hover)',
  border: '1px solid var(--gol-border)',
  padding: '10px',
  textAlign: 'center',
});

const StatLabel = styled('div')({
  fontSize: '11px',
  color: 'var(--gol-text-secondary)',
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
  margin: '0 0 4px',
});

const StatValue = styled('div')({
  fontSize: '18px',
  fontWeight: 600,
  color: 'var(--gol-accent)',
  margin: 0,
});

// FD1: a COUNT only ("N rules" / "1 rule" / "No rules"), not the mockup's natural-language
// sentence ("Born: 3 neighbors | Survive: 2-3 neighbors") — that needs a rule summariser over
// action/condition vocabulary Story 4.10 defines; writing a one-off version here means writing it
// twice.
const RulesLine = styled('p')({
  fontSize: '12px',
  color: 'var(--gol-text-secondary)',
  margin: 0,
});

// Mockup: .organism-card.preloaded::before (:220-232) — reimplemented as REAL TEXT, not a
// pseudo-element, so it is in the accessibility tree and a screen reader hears why Delete will be
// disabled once Story 4.22 adds it (AC3, M9). No `aria-label` on it (Story 4.2 review): a
// role-less `<span>` is ARIA `generic`, where `aria-label` is PROHIBITED — assistive tech ignores
// it and reads the text node anyway, and axe only files it as "needs review" (not a violation)
// because the span has text, which is why the `[]`-violations assertions never caught it. The
// visible text IS the accessible text. `--gol-accent-tint` is a new token (FD6): the
// mockup's fill is `rgba(0, 212, 255, 0.1)`, a raw literal AR-46 bans in this file, and
// `--gol-bg-hover` is the wrong token to reuse — that is a neutral surface, not an accent.
const SystemTag = styled('span')({
  position: 'absolute',
  top: '12px',
  right: '12px',
  fontSize: '10px',
  fontWeight: 600,
  color: 'var(--gol-accent)',
  background: 'var(--gol-accent-tint)',
  border: '1px solid var(--gol-border)',
  padding: '3px 8px',
  letterSpacing: '0.5px',
});

export interface OrganismCardProps {
  organism: Organism;
  /**
   * Passed by `<OrganismLibrary>`, which owns the M9 knowledge (`organism.id === CONWAYS_CLASSIC_ID`)
   * — this card stays dumb about which organism is protected.
   */
  system?: boolean;
}

/**
 * One organism in the Library grid (AC1, AC2, AC3, AC6; `Story 4.2`, `FR-1.1`). `organism` is a plain
 * domain value, never a repository (`AR-2`, `AR-27`) — the Library injects repositories at the
 * page boundary and passes down resolved records, never a repository reference, to this component.
 */
export default function OrganismCard({ organism, system = false }: OrganismCardProps) {
  const display = toDisplayOrganism(organism);
  // `useId()`, not a hand-rolled id — this is a hydrated, statically exported page
  // (`BattleNameField.tsx:110-113`'s precedent), and a hardcoded id breaks the moment the grid
  // renders a second card.
  const nameId = useId();

  return (
    <Card tabIndex={0} aria-labelledby={nameId} data-system={system ? '' : undefined}>
      <CardHeader>
        <ColorChip aria-hidden="true" style={{ background: display.color, color: display.color }} />
        <CardName id={nameId}>{display.name}</CardName>
      </CardHeader>
      <CardStats>
        <StatItem>
          <StatLabel>Dominance</StatLabel>
          <StatValue>{organism.dominance}</StatValue>
        </StatItem>
        <StatItem>
          <StatLabel>Aging</StatLabel>
          <StatValue>{organism.agingEnabled ? 'Yes' : 'No'}</StatValue>
        </StatItem>
      </CardStats>
      <RulesLine>{ruleCountLabel(organism.survivalRules.length)}</RulesLine>
      {system && <SystemTag>SYSTEM</SystemTag>}
    </Card>
  );
}
