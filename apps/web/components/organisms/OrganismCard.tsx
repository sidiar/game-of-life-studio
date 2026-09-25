'use client';

import { useId } from 'react';
import { styled } from '@mui/material/styles';
import type { Organism } from '@gol/domain';
import { toDisplayOrganism } from '@/lib/displayOrganisms';
import { PROTECTED_DELETE_MESSAGE } from '@/lib/organisms/usageLabels';

// Mockup: .organism-card / .card-header / .organism-color / .organism-name / .card-stats /
// .stat-item / .rules-preview / .card-actions / .action-btn / .organism-card.preloaded::before
// (organism-library.html:192-261, 309-332, 404-444). Story 4.2's FD1 trimmed the mockup's usage
// line, rules SENTENCE and action buttons off the card — Dominance/Aging/rule-count ship, "Used in
// N battles" is FR-1.7's (4.19/4.20), the rules sentence needs Story 4.10's action/condition
// vocabulary. The action row is Edit (Story 4.17), Clone (Story 4.18) and Delete (Story 4.21's
// block, Story 4.22's confirm and protected state): `<OrganismLibrary>` passes `onRequestDelete`
// on every card, and the verdict behind it decides whether Delete confirms, explains a block, or —
// on the protected default — renders disabled with its reason as visible text (M9, FD6).
//
// The tab-stop policy, decided in Story 4.17 (closing Story 4.2's provisional FD5) and extended in
// Stories 4.21/4.22: a card has Edit then Clone as its first two keyboard stops, and Delete as the
// third on every card EXCEPT the protected one, where the native `disabled` button is skipped. Its
// reason stays reachable anyway — as text in browse mode, and as the button's description
// (`aria-describedby`) — so a keyboard user loses a dead stop, not the explanation. The 4.17
// decision was "the article is not a stop", not "one stop per card"; a stop wrapping a stop is
// legal but noisy, which is why the article itself stays out of the tab order regardless of how
// many buttons it holds. `aria-labelledby` stays on the article
// (it still names the region for a screen reader's landmark/article navigation), and
// `:focus-within` still lifts the card when any button is focused, so the keyboard path keeps the
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

// Mockup: .card-actions (:309-312). Edit, Clone and Delete — the last on every card the Library
// passes a handler for, which since Story 4.22 is every card.
const CardActions = styled('div')({
  display: 'flex',
  gap: '8px',
  marginTop: '16px',
});

// Mockup: .action-btn (:314-332, :342-349), with the house substitutions:
//   1. border: var(--gol-border-control), not var(--gol-border) — SC 1.4.11 needs 3:1 for a
//      boundary that identifies a CONTROL; --gol-border measures 1.57:1 (`BattleTile.tsx`'s
//      `actionChrome` records the measurement and the forbidden fix).
//   2. ❌ NO `transition`. The mockup's `all 0.2s` is exactly the trap this page's `<CreateButton>`
//      records (`OrganismLibrary.tsx`): an axe scan landing mid-fade measures a contrast no settled
//      state has, and the Library's e2e scans right after the editor closes — when this button has
//      just been re-focused and is mid-hover-transition on a real pointer.
//   3. A real `:focus-visible` ring, since these buttons ARE the card's keyboard stops.
// Renamed from `EditButton` (Story 4.18): the substitutions above now serve three buttons, not
// one. `flex: 1` splits the row evenly, which is what the mockup's `.card-actions` does for its
// multi-button row. `&:disabled` / `&:disabled:hover` are the mockup's own disabled state
// (`:342-349`) — the disabled hover is reset so a disabled button gives no false affordance.
//
// Story 4.21: the `[data-danger]` attribute selector is Delete's variant (mockup `.action-btn
// .delete`, `:334-341`), the same `&[data-system]` precedent `<Card>` above uses rather than a
// `styled(ActionButton)` fork — one component, one set of substitutions, an attribute for the one
// colour that differs. No `transition` override needed: this file's own `ActionButton` already
// carries none (the `<SidebarFooter>`/`<CreateButton>` mid-fade axe trap this file's head comment
// records), so Delete needs no opt-out of one.
const ActionButton = styled('button')({
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
  '&:disabled': {
    opacity: 0.4,
    cursor: 'not-allowed',
  },
  '&:disabled:hover': {
    borderColor: 'var(--gol-border-control)',
    background: 'transparent',
    transform: 'none',
  },
  '&[data-danger]': {
    color: 'var(--gol-danger)',
  },
  // `:not(:disabled)`: this rule and `&:disabled:hover` above have equal specificity, so without
  // it the LATER one wins and the protected card's disabled Delete would turn red on hover — the
  // false affordance the disabled reset exists to remove (Story 4.22).
  '&[data-danger]:hover:not(:disabled)': {
    borderColor: 'var(--gol-danger)',
  },
  '@media (prefers-reduced-motion: reduce)': {
    '&:hover': { transform: 'none' },
  },
});

// Mockup: .organism-card.preloaded::before (:220-232) — reimplemented as REAL TEXT, not a
// pseudo-element, so it is in the accessibility tree beside the disabled Delete it explains (AC3,
// M9; the reason itself is `ProtectedNote`, below). No `aria-label` on it (Story 4.2 review): a
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

// Story 4.22, FD6: the protected Delete's reason, as visible text under the action row — a native
// `disabled` button is out of the tab order, so a `title` or tooltip (the mockup's hover shortcut)
// would never reach a keyboard or touch user. The `RulesLine` treatment (12px, secondary text), so
// no new token and no raw hex (AR-46).
const ProtectedNote = styled('p')({
  fontSize: '12px',
  color: 'var(--gol-text-secondary)',
  margin: '8px 0 0',
});

export interface OrganismCardProps {
  organism: Organism;
  /**
   * The protected default (M9): the SYSTEM tag, the accent border, and — when Delete renders — a
   * DISABLED Delete with its reason as visible text (Story 4.22). `<OrganismLibrary>` passes the
   * delete verdict's `protected` kind, so M9 has one source; this card stays dumb about which
   * organism is protected and why.
   */
  system?: boolean;
  /**
   * The Edit button's click (Story 4.17, FR-1.3). The `<BattleTile>` `onRequestDelete(): void`
   * contract: the card knows nothing about usage — the Library computes the count and decides
   * whether the FR-1.3 warning or the editor opens.
   */
  onRequestEdit(): void;
  /**
   * The Clone button's click (Story 4.18, AC1). The card knows nothing else — it does not create
   * the clone, does not open an editor, and carries no id of its own beyond what the Library
   * already passed via `organism`. The `<BattleTile>` `onRequestDelete(): void` contract, again.
   */
  onRequestClone(): void;
  /**
   * Disables ONLY the Clone button while this card's clone write is in flight (Story 4.18, FD5) —
   * the Library's `cloningRef` latch is the re-entrancy authority; this is just the affordance.
   * Edit stays enabled throughout, matching the mockup's per-button `disabled` (only Delete is
   * disabled there).
   */
  cloning?: boolean;
  /**
   * The Delete button's click (Story 4.21, FD2). Renders the third `ActionButton` iff this prop is
   * PRESENT — never a `deletable` boolean plus a fixed handler — so a caller decides whether Delete
   * exists at all by whether it passes the prop. `<OrganismLibrary>` passes it on every card since
   * Story 4.22; a surface that passes none keeps rendering no Delete. On a `system` card the button
   * renders `disabled` and this is never called. The card knows nothing about usage, verdicts or
   * indexes — the `<BattleTile>` `onRequestDelete(): void` contract, again.
   */
  onRequestDelete?(): void;
}

/**
 * One organism in the Library grid (AC1, AC2, AC3, AC6; `Story 4.2`, `FR-1.1`). `organism` is a plain
 * domain value, never a repository (`AR-2`, `AR-27`) — the Library injects repositories at the
 * page boundary and passes down resolved records, never a repository reference, to this component.
 * The Edit (Story 4.17) and Clone (Story 4.18) actions render on EVERY card, Conway's Classic
 * included: M9 protects it from deletion, not from editing or cloning. Delete (Story 4.21) renders
 * only when `onRequestDelete` is passed — the Library's job, not this component's — and on the
 * `system` card it renders disabled, with the reason beside it (Story 4.22).
 */
export default function OrganismCard({
  organism,
  system = false,
  onRequestEdit,
  onRequestClone,
  cloning = false,
  onRequestDelete,
}: OrganismCardProps) {
  const display = toDisplayOrganism(organism);
  // `useId()`, not a hand-rolled id — this is a hydrated, statically exported page
  // (`BattleNameField.tsx:110-113`'s precedent), and a hardcoded id breaks the moment the grid
  // renders a second card.
  const nameId = useId();
  const protectedNoteId = useId();
  const deleteProtected = system && onRequestDelete !== undefined;

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
        <ActionButton
          type="button"
          aria-label={`Edit ${display.name}`}
          data-edit-organism-id={organism.id}
          onClick={() => onRequestEdit()}
        >
          Edit
        </ActionButton>
        {/* `data-clone-organism-id` mirrors Edit's lookup attribute — no restore-focus consumer
            reads it today, but it keeps the two actions symmetric for whatever does next. */}
        <ActionButton
          type="button"
          aria-label={`Clone ${display.name}`}
          data-clone-organism-id={organism.id}
          disabled={cloning}
          onClick={() => onRequestClone()}
        >
          Clone
        </ActionButton>
        {/* The third stop, rendered iff the Library passed the prop. `data-danger` selects the
            red variant above; `data-delete-organism-id` is the focus-restore lookup key (Story 4.21
            FD9, Story 4.22 FD8). On the protected card: native `disabled` (M9's wording, the
            mockup's `:442`), described by the note below (FD6). */}
        {onRequestDelete !== undefined && (
          <ActionButton
            type="button"
            aria-label={`Delete ${display.name}`}
            aria-describedby={deleteProtected ? protectedNoteId : undefined}
            data-delete-organism-id={organism.id}
            data-danger=""
            disabled={deleteProtected}
            onClick={() => onRequestDelete()}
          >
            Delete
          </ActionButton>
        )}
      </CardActions>
      {deleteProtected && (
        <ProtectedNote id={protectedNoteId} data-protected-note="">
          {PROTECTED_DELETE_MESSAGE}
        </ProtectedNote>
      )}
      {system && <SystemTag>SYSTEM</SystemTag>}
    </Card>
  );
}
