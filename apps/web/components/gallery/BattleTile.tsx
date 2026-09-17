'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { styled } from '@mui/material/styles';
import Tooltip from '@mui/material/Tooltip';
import type { Organism } from '@gol/domain';
import type { BattleRepository } from '@gol/persistence';
import { battleDisplayName } from '@/lib/battleDisplayName';
import { formatBattleDate } from '@/lib/gallery/formatBattleDate';
import { battleHref } from '@/lib/battle/battleRoute';
import { toThumbnailSource } from '@/lib/canvas/battleThumbnail';
import type { GridRendererColors } from '@/lib/canvas/gridRenderer';
import type { RefToFillGroup } from '@/lib/canvas/refToFillGroup';
import type { RenderableGrid } from '@/lib/canvas/renderableGrid';
import type { DisplayOrganism } from '@/lib/displayOrganisms';
import { useInView } from '@/lib/gallery/useInView';
import PetriDishCanvas from '../PetriDishCanvas';

// A battle may legally place 255 organisms (Decision G.3) — the mockup's 2-3 dots is not the
// bound, and an uncapped row reflows the whole tile. Organisms beyond the cap fold into the "+n"
// indicator, whose own tooltip lists their names — nothing is ever unreachable (silent-failure
// trap: "the dot row must be capped; the name list must not be").
const MAX_VISIBLE_DOTS = 6;

export interface BattleTileProps {
  battleId: string;
  name: string;
  gridSize: { cols: number; rows: number };
  updatedAt: Date;
  organisms: readonly DisplayOrganism[];
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

// Mockup: .battle-tile (clinical-lab-theme/battle-gallery.html:242-255). `cursor: pointer` is
// restored now that the tile navigates (this story) — the comment that used to sit here said it
// waited on Story 2.2, which was simply wrong: epics.md puts tile-click in Story 2.1 and only the
// New Battle CTA in Story 2.2. `position: relative` is load-bearing beyond the delete button now:
// it is the containing block for TitleLink's stretched `::after` overlay below. `:focus-within`
// alongside `:hover` gives the keyboard path the same tile-level state change the mouse path does
// (the parity gap the Story 1.9 review found on AppNav). Transitions are enumerated rather than
// `all` so a property added to this rule later cannot start animating by accident.
const Tile = styled('article')({
  background: 'var(--gol-bg-secondary)',
  border: '1px solid var(--gol-border)',
  padding: '20px',
  cursor: 'pointer',
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
// Story 3.17: the band grows from one control to a row. `display: flex` + `gap` is the biotech
// mockup's own band (`biotech-terminal-theme/battle-gallery.html:382-388`), lifted here now that
// this repo actually renders two actions side by side; everything below (position, reveal, touch,
// reduced-motion) is unchanged.
const TileActions = styled('div')({
  position: 'absolute',
  top: '18px',
  right: '18px',
  display: 'flex',
  gap: '6px',
  // Above TitleLink's stretched overlay (this story). Without it the overlay — which covers the
  // whole tile — swallows every click aimed at Delete, and the destructive control silently
  // becomes a second "open this battle" button. `opacity: 0` does not remove an element from
  // hit-testing, so this is a real collision, not a theoretical one.
  zIndex: 1,
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
//
// Story 3.17: lifted into a plain object so Run (a link) and Delete (a button) share ONE
// definition of this chrome — both ⚠️ notes above travel with it. `DeleteButton` still consumes it
// through `styled('button')`; `RunLink` below adds only `textDecoration: 'none'`, which an anchor
// needs and a button never did.
const actionChrome = {
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
} as const;

const DeleteButton = styled('button')(actionChrome);

// The Run affordance (AC1, FD1(a)): pure navigation, so a `styled(Link)`, never a `<button>` +
// `onClick` — the same Story 2.2 FD1 / 2.16 FD1 line `CreateBattleLink.tsx` draws. Shares Delete's
// 28x28 chrome via `actionChrome`, spread rather than passed as a second argument (emotion's
// `styled()` call form takes exactly one styles argument); `textDecoration: 'none'` is the one
// addition an anchor needs that a button never did.
const RunLink = styled(Link)({ ...actionChrome, textDecoration: 'none' });

// `display: flex` stays even though TileTitle is now its only child (the grid-size stat that used
// to sit beside it is gone — Sidiar, 2026-08-25, see the removal note on forced decision 2 in
// 1-10-battle-gallery-tiles-sorting.md) — TileTitle's own `minWidth: 0` overflow guard below only
// works because it is a flex item; switching this to a plain block would silently drop that guard.
// `justifyContent`/`gap` are gone with the second child they used to space against.
const TileHeader = styled('header')({
  display: 'flex',
  alignItems: 'center',
  marginBottom: '16px',
  // Reserves the band TileActions floats over. That control is absolutely positioned against the
  // Tile's border box (right: 18px), and Story 3.17 widened it from one 28px control to a 6px-gap
  // row of two: 18 + 28 + 6 + 28 = 80px from the tile's right edge, while this header's content box
  // stops at the Tile's own 20px padding — an overlap of 80 − 20 = 60px, plus 8px of breathing room
  // (the same margin the 2026-08-25 review derived for the single-control band). Until that review
  // this was reserved only as a side effect of the grid-size stat sitting there: a `nowrap` sibling
  // under `justify-content: space-between` shrank the title clear of the band. Removing the stat
  // took the reservation with it, so a long name's first line ran under the delete button —
  // permanently under `@media (hover: none)`, where the band never fades out. Padding, not a margin
  // on TileTitle, so the reservation survives any future addition to the band.
  paddingRight: '68px',
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

// The stretched-link pattern (this story, AC1). The anchor wraps the TITLE TEXT only and grows an
// `::after` overlay across the whole Tile, rather than the anchor wrapping the tile's content:
// nesting <TileActions>'s delete <button> inside an anchor is invalid HTML that browsers reparse
// silently, and the visible effect is that Delete starts navigating. The Story 1.13
// `@media (hover: none)` fix makes that button permanently visible on touch, so it would be a
// permanent trap there.
//
// The overlay's containing block is Tile (`position: relative`), so this element must stay
// unpositioned. The outline on :focus-visible wraps the anchor's own inline box — the text — not
// the pseudo-element, which is why the keyboard ring lands on the title rather than the tile.
const TitleLink = styled(Link)({
  color: 'inherit',
  textDecoration: 'none',
  '&::after': {
    content: '""',
    position: 'absolute',
    inset: 0,
  },
  '&:hover': {
    color: 'var(--gol-accent)',
  },
  // Keyboard parity with the hover rule above — the same gap the Story 1.9 review found on
  // AppNav. textDecoration: 'none' leaves the UA outline as the only focus signal otherwise, in a
  // colour never chosen against this background.
  '&:focus-visible': {
    outline: '2px solid var(--gol-accent)',
    outlineOffset: '2px',
  },
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

// `position: relative` + `zIndex` for the same reason TileActions carries them (this story): the
// dots are focusable tooltip triggers, and TitleLink's full-tile overlay sits above them
// otherwise — hovering a dot would hit the overlay instead and the tooltip would never open. Only
// the keyboard path would still work, which is exactly the kind of half-broken state that reads
// as fine in a unit test.
const DotRow = styled('span')({
  display: 'flex',
  gap: '6px',
  position: 'relative',
  zIndex: 1,
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

interface TooltipTriggerProps {
  label: string;
  tooltip: string;
  more?: boolean;
  color?: string;
  children?: ReactNode;
}

// Mockup: .participant-dot::before (battle-gallery.html:347-368) — the visual (accent border,
// bg-primary fill, --gol-shadow-tooltip drop shadow, uppercase 11px label) now lives in
// theme.ts's `MuiTooltip` styleOverrides rather than a styled('span') here.
//
// MUI `Tooltip` (Sidiar, 2026-08-25) — reverses Story 1.10 Task 3's rejection of MUI's Tooltip
// (Task 7's bundle-budget note: 18.6 KB headroom at the time; "zero new MUI component imports").
// Measured cost: +10.7 KB gzip, landing the home route at 317.5 KB. The budget moved 320 -> 330
// for it, leaving 12.5 KB headroom — see `scripts/check-bundle-size.mjs`, which is authoritative
// for all four of those figures; do not restate them anywhere else.
//
// The hand-rolled open-state/Escape-listener machinery this replaced is no longer needed: MUI's
// Tooltip already satisfies WCAG SC 1.4.13 — hoverable (interactive by default,
// `disableInteractive` defaults to `false`), dismissible (its own document `keydown` listener
// closes on Escape — `Tooltip.js:444-451` — without moving focus, the exact failure the earlier
// `blur()` attempt had), and persistent (stays open while the pointer is over either the trigger
// or the tooltip content). `enterDelay={0}`: the mockup's hover reveal was instant; MUI's own
// default is a 100ms hover-intent delay, which the earlier implementation never had.
//
// No `aria-describedby` double-announcement either: MUI's `describeChild` prop defaults to
// `false`, and — regardless of that flag — `children.props` is spread last in Tooltip.js's own
// prop merge, so the `aria-label` below always wins over whatever aria-* MUI would otherwise set.
function TooltipTrigger({ label, tooltip, more, color, children }: TooltipTriggerProps) {
  const Trigger = more ? MoreIndicator : Dot;

  return (
    <Tooltip title={tooltip} enterDelay={0} leaveDelay={0}>
      <Trigger
        role="img"
        tabIndex={0}
        aria-label={label}
        style={color === undefined ? undefined : { backgroundColor: color }}
      >
        {children}
      </Trigger>
    </Tooltip>
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
        <TileTitle>
          {/* Architecture Decision K: the battle route takes the id as a QUERY PARAMETER, never as
              a dynamic path segment — `/battle/[id]` cannot be built under `output: 'export'` at
              all. The id is a uuid, so it needs no encoding, but encodeURIComponent is not free
              insurance to skip: BattleSummary.id is only as trustworthy as the stored record.
              Story 3.17: built through `battleHref` (`lib/battle/battleRoute.ts`) rather than an
              inline template, so this link and Run's below cannot spell the param differently. */}
          <TitleLink href={battleHref(battleId)}>{displayName}</TitleLink>
        </TileTitle>
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
          mockup) independent of source order, and putting it after the dots in the DOM keeps
          Delete as the tile's LAST tab stop. The full order is title link → organism dots → Run →
          Delete (Story 3.17, FD5); Story 2.1 moved the FIRST stop off the leading dot when the
          title became a link, and BattleTile.test.tsx pins the whole sequence. A destructive
          "delete this card" action reads naturally last, and moving it earlier silently pulls
          focus in front of the rest. */}
      <TileActions data-tile-actions="">
        {/* AC1, FD1(a)/FD4(a): pure navigation, so a link — never a button + router.push (2.2
            FD1 / 2.16 FD1). `aria-label`/`title` carry `displayName` so every tile's Run is
            distinct, the same reasoning Delete's own label uses below; the untitled fallback still
            reads "Run Untitled Battle" (Trap 5). The glyph is the transport bar's own Play glyph
            (`SimulationControlBar.tsx`) — the same verb reads as the same verb in both places
            (FD4) — `aria-hidden` because axe's emoji regex would otherwise flag a symbol-only
            name as `incomplete`; the pair's contrast is already gated by `themeTokens.test.ts`.
            ❌ No `data-run-battle-id`: nothing restores focus here, since a link navigates away
            rather than opening a dialog to cancel (contrast Delete's own attribute below). */}
        <RunLink
          href={battleHref(battleId, { mode: 'run' })}
          aria-label={`Run ${displayName}`}
          title={`Run ${displayName}`}
        >
          <span aria-hidden="true">▶</span>
        </RunLink>
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
