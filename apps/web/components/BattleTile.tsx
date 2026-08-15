'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { styled } from '@mui/material/styles';
import type { Organism } from '@gol/domain';
import type { BattleRepository } from '@gol/persistence';
import { formatBattleDate } from '@/lib/formatBattleDate';
import { toThumbnailSource } from '@/lib/battleThumbnail';
import type { GridRendererColors } from '@/lib/gridRenderer';
import type { RefToFillGroup } from '@/lib/refToFillGroup';
import type { RenderableGrid } from '@/lib/renderableGrid';
import type { TileOrganism } from '@/lib/tileOrganisms';
import { useInView } from '@/lib/useInView';
import PetriDishCanvas from './PetriDishCanvas';

// A battle may legally place 255 organisms (Decision G.3) — the mockup's 2-3 dots is not the
// bound, and an uncapped row reflows the whole tile. Organisms beyond the cap fold into the "+n"
// indicator, whose own tooltip lists their names — nothing is ever unreachable (silent-failure
// trap: "the dot row must be capped; the name list must not be").
const MAX_VISIBLE_DOTS = 6;

// BattleSummarySchema.name is `z.string().max(100)` with no lower bound, so "" parses and lists.
// An empty <h2> is both unidentifiable and an axe `empty-heading` violation, which would fail the
// gallery e2e's zero-violations assertion for the whole page over one bad record.
const UNTITLED_BATTLE = 'Untitled battle';

// Exported (Story 1.13) so <BattleGallery> can compute the identical fallback for the delete
// dialog's body without a second, independently-maintained copy of this ternary — the tile's own
// <h2> and the dialog naming the same battle must never be able to drift from each other.
export function battleDisplayName(name: string): string {
  return name.trim() === '' ? UNTITLED_BATTLE : name;
}

export interface BattleTileProps {
  battleId: string;
  name: string;
  gridSize: { cols: number; rows: number };
  updatedAt: Date;
  organisms: readonly TileOrganism[];
  // The thumbnail's own inputs (Story 1.11, AC1/M4). battles/roster are typed to the interfaces
  // (AR-2/27) — this component never imports a concrete repository.
  battles: BattleRepository;
  roster: readonly Organism[];
  showGridLines: boolean; // FR-8.7, resolved once by the Gallery
  gridColors: GridRendererColors | null; // null when the theme token layer is absent
  // Story 1.13 — the parent owns the confirmation dialog and the repository call; this component
  // only reports the request. No args: the parent already knows this tile's id/name from the
  // summary it rendered the tile from (AR-2/27 — a repository call belongs to the owner of the
  // repositories, which is <BattleGallery>, not this presentational component).
  onRequestDelete(): void;
}

// Mockup: .battle-tile (clinical-lab-theme/battle-gallery.html:242-255). No `cursor: pointer` —
// the mockup has it because its tile navigates; ours does not until Story 2.2. `:focus-within`
// alongside `:hover` gives the keyboard path the same tile-level state change the mouse path does
// (the parity gap the Story 1.9 review found on AppNav). Transitions are enumerated rather than
// `all` so a property added to this rule later cannot start animating by accident.
const Tile = styled('article')({
  background: 'var(--gol-bg-secondary)',
  border: '1px solid var(--gol-border)',
  padding: '20px',
  transition: 'border-color 0.3s, transform 0.3s, box-shadow 0.3s',
  position: 'relative',
  '&:hover, &:focus-within': {
    borderColor: 'var(--gol-accent)',
    transform: 'translateY(-2px)',
    boxShadow: 'var(--gol-shadow-tile-hover)',
    // Story 1.13: reveals TileActions under the SAME hover/focus-within trigger this rule already
    // uses, giving the keyboard path the delete button's tab-order presence the mouse-only mockup
    // (`.battle-tile:hover .tile-actions { display: block }`) never had to think about. A plain
    // attribute selector rather than an Emotion cross-component selector — unambiguous and matches
    // this file's own Tooltip `[data-open]` precedent below.
    '& [data-tile-actions]': {
      opacity: 1,
    },
  },
  '@media (prefers-reduced-motion: reduce)': {
    transition: 'none',
    '&:hover, &:focus-within': { transform: 'none' },
  },
});

// Mockup: .tile-actions (clinical-lab-theme/battle-gallery.html:395-400). Departure: the mockup
// reveals this with `display: none` under `.battle-tile:hover`, which removes the control from the
// tab order entirely — unsatisfiable against AC5's "keyboard-operable". `opacity` reveals it
// instead, under the same hover/focus-within trigger `Tile` above already reacts to (via
// `[data-tile-actions]`, set on this component below), giving the keyboard path the same reveal
// the mouse path gets — the same parity fix the Story 1.9 review applied to AppNav.
const TileActions = styled('div')({
  position: 'absolute',
  top: '18px',
  right: '18px',
  opacity: 0,
  transition: 'opacity 0.2s',
  // A pointer that cannot hover never fires the reveal above, and opacity: 0 does NOT remove the
  // button from hit-testing — so on touch every tile carried an invisible but fully tappable
  // destructive control, and a tap opened a delete confirmation for a button the user never saw
  // (code review 2026-08-14; Playwright's own visibility check treats opacity: 0 as visible, which
  // is why the tablet project never caught it). Permanently visible there instead.
  '@media (hover: none)': {
    opacity: 1,
  },
  '@media (prefers-reduced-motion: reduce)': {
    transition: 'none',
  },
});

// Mockup: .action-menu-btn (battle-gallery.html:406-419). Two departures from the literal CSS,
// both re-applications of rules this repo already wrote down:
//   1. border: var(--gol-border-control), not var(--gol-border) — SC 1.4.11 needs 3:1 for a
//      boundary that identifies a CONTROL; --gol-border (#333333) measures only 1.57:1. Repainting
//      --gol-border itself is the fix themeTokens.test.ts:99-115 explicitly forbids.
//   2. This is the first real consumer of --gol-bg-hover (deferred from the Story 1.9 review) —
//      painted here as a RESTING surface, not a hover state.
const DeleteButton = styled('button')({
  background: 'var(--gol-bg-hover)',
  border: '1px solid var(--gol-border-control)',
  color: 'var(--gol-text-secondary)',
  width: '28px',
  height: '28px',
  padding: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
  fontSize: '16px',
  fontFamily: 'inherit',
  transition: 'border-color 0.2s, color 0.2s',
  '&:hover, &:focus-visible': {
    borderColor: 'var(--gol-accent)',
    color: 'var(--gol-accent)',
  },
  '&:focus-visible': {
    outline: '2px solid var(--gol-accent)',
    outlineOffset: '2px',
  },
  '@media (prefers-reduced-motion: reduce)': {
    transition: 'none',
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
//
// `minWidth: 0` + `overflowWrap` because a flex item defaults to `min-width: auto` and so refuses
// to shrink below its max-content width: a 100-character name with no spaces (the schema's only
// constraint is max(100)) would otherwise spill across the neighbouring tile and push the document
// into horizontal scroll, since the grid track is a fixed `minmax(320px, 1fr)`.
const TileTitle = styled('h2')({
  fontSize: '18px',
  fontWeight: 600,
  margin: 0,
  color: 'var(--gol-text-primary)',
  minWidth: 0,
  overflowWrap: 'anywhere',
});

const TileStats = styled('span')({
  fontSize: '12px',
  color: 'var(--gol-text-secondary)',
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
  whiteSpace: 'nowrap',
});

// Same box in EVERY thumbnail state ('idle' | 'loading' | 'ready' | 'unavailable') — a tile that
// changes height when its thumbnail arrives reflows the whole Gallery grid mid-scroll. The canvas
// (rendered only in 'ready') fills it via DishCanvas below; every other state leaves it empty.
const PetriDish = styled('div')({
  width: '100%',
  aspectRatio: '5 / 3',
  background: 'var(--gol-bg-primary)',
  border: '1px solid var(--gol-border)',
  marginBottom: '16px',
  overflow: 'hidden',
});

const DishCanvas = styled(PetriDishCanvas)({
  width: '100%',
  height: '100%',
  display: 'block',
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

const DotWrapper = styled('span')({
  position: 'relative',
  display: 'inline-flex',
});

// Mockup: .participant-dot (battle-gallery.html:338-345). `role="img"` rather than a <button>:
// the dot has no activation behaviour, and a <button> that does nothing on Enter/Space is a dead
// affordance that also announces itself to assistive tech as actionable. `role="img"` is a naming
// role, so `aria-label` is permitted here — on a bare <span> (implicit role `generic`) it would be
// stripped by the accessible-name algorithm and flagged by axe's `aria-prohibited-attr`.
// `tabIndex` keeps the tile keyboard-reachable (AC5) without promising a click.
//
// ⚠️ 12x12 with a 6px gap is below WCAG 2.2 SC 2.5.8's 24px target minimum. Retained deliberately
// to match the mockup (Sidiar, 2026-08-08 review) and recorded in deferred-work.md — axe cannot
// see it, `target-size` ships disabled in axe-core 4.12.1.
const Dot = styled('span')({
  width: '12px',
  height: '12px',
  borderRadius: '2px',
  border: '1px solid var(--gol-border)',
  padding: 0,
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
  textAlign: 'center',
});

// Mockup: .participant-dot::before (battle-gallery.html:347-368) — same visual, including the
// mockup's drop shadow, now a real element rather than a CSS-only pseudo-element so it can carry
// the hover/focus parity WCAG SC 1.4.13 requires.
//
// `maxWidth` + wrapping rather than the mockup's `nowrap`: the "+n" tooltip's content is every
// remaining organism name, which at the 255-organism bound is one unwrappable line extending left
// off-screen (it is anchored `right: 0`, and left overflow is not scrollable in LTR).
//
// `pointerEvents` flips to `auto` only when shown, and `::after` bridges the 10px gap the reveal
// transform opens up: SC 1.4.13 "hoverable" requires that a pointer user can move onto the tooltip
// without it vanishing, and :hover matches an ancestor for out-of-flow descendants too, so the
// bridge is what keeps the traverse inside the wrapper's hover region.
const Tooltip = styled('span')({
  position: 'absolute',
  bottom: '100%',
  right: 0,
  transform: 'translateY(-8px)',
  background: 'var(--gol-bg-primary)',
  border: '1px solid var(--gol-accent)',
  boxShadow: 'var(--gol-shadow-tooltip)',
  color: 'var(--gol-accent)',
  padding: '6px 10px',
  fontSize: '11px',
  maxWidth: '240px',
  width: 'max-content',
  overflowWrap: 'anywhere',
  opacity: 0,
  pointerEvents: 'none',
  transition: 'opacity 0.2s, transform 0.2s',
  zIndex: 100,
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
  fontWeight: 500,
  '&[data-open]': {
    opacity: 1,
    transform: 'translateY(-10px)',
    pointerEvents: 'auto',
  },
  '&[data-open]::after': {
    content: '""',
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    height: '10px',
  },
  '@media (prefers-reduced-motion: reduce)': {
    transition: 'none',
  },
});

interface TooltipTriggerProps {
  label: string;
  tooltip: string;
  more?: boolean;
  color?: string;
  children?: ReactNode;
}

/**
 * A focusable, individually-named organism marker with a tooltip that satisfies WCAG SC 1.4.13.
 *
 * Visibility is React state rather than a pure `:hover`/`:focus-within` CSS rule because the
 * criterion's "dismissible" clause needs an Escape handler that works for a *pointer* user too —
 * who has no focused element to receive a keydown, hence the document-level listener — and because
 * dismissal must not move focus (the earlier `blur()` implementation dropped the user at
 * `<body>`, restarting the tab order at the top of the document).
 */
function TooltipTrigger({ label, tooltip, more, color, children }: TooltipTriggerProps) {
  const [open, setOpen] = useState(false);
  const Trigger = more ? MoreIndicator : Dot;

  useEffect(() => {
    if (!open) return;
    function dismiss(event: globalThis.KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('keydown', dismiss);
    return () => document.removeEventListener('keydown', dismiss);
  }, [open]);

  return (
    <DotWrapper
      onPointerEnter={() => setOpen(true)}
      onPointerLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      <Trigger
        role="img"
        tabIndex={0}
        aria-label={label}
        style={color === undefined ? undefined : { backgroundColor: color }}
      >
        {children}
      </Trigger>
      {/* aria-hidden: the trigger's aria-label already carries this text, so exposing the tooltip
          as well would announce every organism name twice. */}
      <Tooltip aria-hidden="true" data-open={open || undefined}>
        {tooltip}
      </Tooltip>
    </DotWrapper>
  );
}

// The tile's own thumbnail lifecycle (Story 1.11 Task 5). 'idle' before the observer has fired,
// 'loading' while battles.load() is in flight, 'ready' once a grid/palette pair exists to paint,
// 'unavailable' for every degradation row in the Dev Notes table (corrupt load, null load,
// toThumbnailSource throwing, gridColors === null) — all four collapse to the same blank dish.
type ThumbnailState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ready'; grid: RenderableGrid; palette: RefToFillGroup }
  | { kind: 'unavailable' };

export default function BattleTile({
  battleId,
  name,
  gridSize,
  updatedAt,
  organisms,
  battles,
  roster,
  showGridLines,
  gridColors,
  onRequestDelete,
}: BattleTileProps) {
  const displayName = battleDisplayName(name);
  const visibleDots = organisms.slice(0, MAX_VISIBLE_DOTS);
  const overflow = organisms.slice(MAX_VISIBLE_DOTS);
  const overflowNames = overflow.map((o) => o.name).join(', ');

  const [containerRef, inView] = useInView<HTMLDivElement>();
  const [thumbnail, setThumbnail] = useState<ThumbnailState>({ kind: 'idle' });

  // Guards the ONE battles.load() call per tile LIFETIME (not once per effect setup — StrictMode's
  // double invocation, and the same reason useWorkspaceSeed.ts uses a ref rather than relying on
  // the dependency array). Keyed on the BATTLE ID actually loaded, not a plain boolean (Story 1.13
  // review deferral, 1.11): the declared deps [inView, gridColors, battles, battleId, roster]
  // otherwise say something the old `!hasLoadStarted.current` boolean guard did not honour — every
  // one of them was inert after the first load. `key={summary.id}` in <BattleGallery> already
  // forces a remount when the id changes, so on the delete path this guard only has to be TRUTHFUL
  // about what it depends on; it does not change the happy-path behaviour. A roster/battles
  // identity change after a delete-triggered reload() deliberately does NOT re-fetch this tile's
  // grid (the surviving battle's grid did not change) — a roster change invalidating an
  // already-painted palette is the separate, still-open `setPalette` item (deferred-work.md, 1.8
  // review, owned by Story 2.10).
  //
  // The latch is RELEASED again when a load ends 'unavailable' (code review 2026-08-14). Set
  // before the promise settles and never cleared, it made a single failed load permanent for the
  // tile's whole mount: reload() re-runs this effect but the guard had already claimed the id, so
  // a tile blanked by one transient corrupt read stayed blank with no retry edge at all.
  const loadedBattleId = useRef<string | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;

    if (inView && gridColors !== null && loadedBattleId.current !== battleId) {
      loadedBattleId.current = battleId;
      setThumbnail({ kind: 'loading' });

      battles
        .load(battleId)
        .then((battle) => {
          // Deleted between list() and this tile's turn — a real race, not a corruption case.
          if (battle === null) return { kind: 'unavailable' as const };
          // Roster is already in hand from the Gallery's organisms.list() — never re-listed per
          // tile.
          const { grid, palette } = toThumbnailSource(battle, roster);
          return { kind: 'ready' as const, grid, palette };
        })
        // Every degradation row collapses here: a CorruptDataError from load() (the crowded e2e
        // fixture — organismIds past the placed set fails BattleSchema's Decision H.1 superRefine
        // even though BattleSummarySchema listed it fine), and a ragged/out-of-range gridState
        // from toThumbnailSource. The tile's metadata already rendered from list() alone and must
        // stay intact — no console.error on any of these paths (gallery.spec.ts asserts a clean
        // console); buildRefToFillGroup's own console.warn for a dangling roster id is unaffected.
        .catch(() => ({ kind: 'unavailable' as const }))
        .then((next) => {
          // Released so a later effect run (a reload() after a delete) can try this battle again.
          // Kept claimed on success — that is the once-per-lifetime guarantee the ref exists for.
          if (next.kind === 'unavailable') loadedBattleId.current = null;
          if (mounted.current) setThumbnail(next);
        });
    }

    return () => {
      mounted.current = false;
    };
  }, [inView, gridColors, battles, battleId, roster]);

  return (
    <Tile>
      <TileHeader>
        <TileTitle>{displayName}</TileTitle>
        <TileStats>
          {gridSize.cols} × {gridSize.rows}
        </TileStats>
      </TileHeader>
      <PetriDish ref={containerRef} aria-hidden="true">
        {thumbnail.kind === 'ready' && gridColors !== null && (
          <DishCanvas
            variant="static"
            grid={thumbnail.grid}
            size={gridSize}
            palette={thumbnail.palette}
            showGridLines={showGridLines}
            colors={gridColors}
          />
        )}
      </PetriDish>
      <TileFooter>
        <TileDate>{formatBattleDate(updatedAt)}</TileDate>
        <DotRow>
          {visibleDots.map((organism) => (
            <TooltipTrigger
              key={organism.id}
              label={organism.name}
              tooltip={organism.name}
              color={organism.color}
            />
          ))}
          {overflow.length > 0 && (
            <TooltipTrigger
              more
              label={`${overflow.length} more organism${overflow.length === 1 ? '' : 's'}: ${overflowNames}`}
              tooltip={overflowNames}
            >
              +{overflow.length}
            </TooltipTrigger>
          )}
        </DotRow>
      </TileFooter>
      {/* DOM-last, not DOM-first: `position: absolute` keeps it visually top-right (matching the
          mockup) independent of source order, and putting it after the dots in the DOM keeps the
          established tab order (Story 1.10: first Tab lands on the first organism dot) intact — a
          destructive "delete this card" action reads naturally as the tile's LAST tab stop, not
          its first, and moving it earlier silently pulled focus in front of every dot instead. */}
      <TileActions data-tile-actions="">
        {/* aria-label carries the battle name so every tile's delete button has a distinct
            accessible name (AC1); `title` gives the pointer tooltip the mockup's `title="Actions"`
            provided. The glyph is deliberately a BMP character (Story 1.12 Dev Notes) — outside
            axe-core's ignoreUnicode/textIsEmojis range, so it gets a REAL color-contrast check
            rather than landing in `incomplete`, which is what we want for a real control. */}
        <DeleteButton
          type="button"
          // How <BattleGallery> finds this button again to restore focus to it after a cancelled
          // confirmation. NOT document.activeElement captured at click time: WebKit does not focus
          // a <button> on click at all, so that read returns <body> there and the "restore" is a
          // no-op on one engine only (code review 2026-08-14). The id is a UUID, so it is always
          // safe to interpolate into the attribute selector.
          data-delete-battle-id={battleId}
          aria-label={`Delete ${displayName}`}
          title={`Delete ${displayName}`}
          // Wrapped, not passed directly: onRequestDelete's contract is `(): void` — passing it
          // straight to onClick hands it the DOM MouseEvent as an argument instead.
          onClick={() => onRequestDelete()}
        >
          <span aria-hidden="true">×</span>
        </DeleteButton>
      </TileActions>
    </Tile>
  );
}
