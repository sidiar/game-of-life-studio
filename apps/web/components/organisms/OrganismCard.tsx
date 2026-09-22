'use client';

import { useId } from 'react';
import { styled } from '@mui/material/styles';
import type { Organism } from '@gol/domain';
import { toDisplayOrganism } from '@/lib/displayOrganisms';

// Mockup: .organism-card / .card-header / .organism-color / .organism-name / .card-stats /
// .stat-item / .rules-preview / .card-actions / .action-btn / .organism-card.preloaded::before
// (organism-library.html:192-261, 309-332, 404-444). Story 4.2's FD1 trimmed the mockup's usage
// line, rules SENTENCE and action buttons off the card — Dominance/Aging/rule-count ship, "Used in
// N battles" is FR-1.7's (4.19/4.20), the rules sentence needs Story 4.10's action/condition
// vocabulary. Of the action row, Edit ships (Story 4.17); Clone/Delete are 4.18/4.22 and join the
// same row (a button that does nothing is a dead affordance, NFR-4.1).
//
// The tab-stop policy, decided in Story 4.17 (closing Story 4.2's provisional FD5): the Edit
// button is the card's ONE keyboard stop, and the `<article>` is not focusable. A stop wrapping a
// stop is legal but noisy — every card would cost two Tabs. `aria-labelledby` stays on the article
// (it still names the region for a screen reader's landmark/article navigation), and
// `:focus-within` still lifts the card when its button is focused, so the keyboard path keeps the
// hover state (the Story 1.9 parity rule).
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
// hover/focus-within lift and its reduced-motion escape. `:focus-within` matches when the Edit
// button inside is focused, which is what gives the keyboard path the same state as hover (the
// Story 1.9 parity rule); the article itself is not focusable (Story 4.17), so it carries no
// `:focus-visible` ring — the button has its own. **No `cursor: pointer` on the article**: the
// surface has no click action of its own (the Edit BUTTON has the cursor), and a pointer cursor on
// a non-interactive surface is a dead affordance (NFR-4.1).
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

// Mockup: .card-actions (:309-312). Edit only, today; Story 4.18's Clone and 4.22's Delete join it.
const CardActions = styled('div')({
  display: 'flex',
  gap: '8px',
  marginTop: '16px',
});

// Mockup: .action-btn (:314-332), with the house substitutions:
//   1. border: var(--gol-border-control), not var(--gol-border) — SC 1.4.11 needs 3:1 for a
//      boundary that identifies a CONTROL; --gol-border measures 1.57:1 (`BattleTile.tsx`'s
//      `actionChrome` records the measurement and the forbidden fix).
//   2. ❌ NO `transition`. The mockup's `all 0.2s` is exactly the trap this page's `<CreateButton>`
//      records (`OrganismLibrary.tsx`): an axe scan landing mid-fade measures a contrast no settled
//      state has, and the Library's e2e scans right after the editor closes — when this button has
//      just been re-focused and is mid-hover-transition on a real pointer.
//   3. A real `:focus-visible` ring, since this button IS the card's keyboard stop.
const EditButton = styled('button')({
  flex: 1,
  background: 'transparent',
  border: '1px solid var(--gol-border-control)',
  color: 'var(--gol-text-primary)',
  padding: '10px 14px',
  fontSize: '12px',
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
  cursor: 'pointer',
  fontFamily: 'inherit',
  '&:hover': {
    borderColor: 'var(--gol-accent)',
    background: 'var(--gol-bg-hover)',
    transform: 'translateY(-1px)',
  },
  '&:focus-visible': {
    outline: '2px solid var(--gol-accent)',
    outlineOffset: '2px',
  },
  '@media (prefers-reduced-motion: reduce)': {
    '&:hover': { transform: 'none' },
  },
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
  /**
   * The Edit button's click (Story 4.17, FR-1.3). The `<BattleTile>` `onRequestDelete(): void`
   * contract: the card knows nothing about usage — the Library computes the count and decides
   * whether the FR-1.3 warning or the editor opens.
   */
  onRequestEdit(): void;
}

/**
 * One organism in the Library grid (AC1, AC2, AC3, AC6; `Story 4.2`, `FR-1.1`). `organism` is a plain
 * domain value, never a repository (`AR-2`, `AR-27`) — the Library injects repositories at the
 * page boundary and passes down resolved records, never a repository reference, to this component.
 * The Edit action (Story 4.17) renders on EVERY card, Conway's Classic included: M9 protects it
 * from deletion, not editing.
 */
export default function OrganismCard({
  organism,
  system = false,
  onRequestEdit,
}: OrganismCardProps) {
  const display = toDisplayOrganism(organism);
  // `useId()`, not a hand-rolled id — this is a hydrated, statically exported page
  // (`BattleNameField.tsx:110-113`'s precedent), and a hardcoded id breaks the moment the grid
  // renders a second card.
  const nameId = useId();

  return (
    <Card aria-labelledby={nameId} data-system={system ? '' : undefined}>
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
      <CardActions>
        {/* `aria-label`, not visible text alone: every card's button reads "Edit", and a screen
            reader's button list needs to tell them apart. `data-edit-organism-id` is the focus
            restore's lookup key (`useOrganismEditorModal`) — the id, not the name, because names
            are not unique. */}
        <EditButton
          type="button"
          aria-label={`Edit ${display.name}`}
          data-edit-organism-id={organism.id}
          onClick={() => onRequestEdit()}
        >
          Edit
        </EditButton>
      </CardActions>
      {system && <SystemTag>SYSTEM</SystemTag>}
    </Card>
  );
}
