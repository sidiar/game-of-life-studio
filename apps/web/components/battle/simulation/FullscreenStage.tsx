'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { styled } from '@mui/material/styles';
import type { GenPerSec, PopulationEntry } from '@/lib/battle/useSimulation';
import CycleDigits from './CycleDigits';
import PopulationPills from './PopulationPills';
import TransportControls, { type SimulationControlBarProps } from './TransportControls';

/**
 * The immersive Run stage (spec §3.14; `petri-dish-play-mode-fullscreen.html`): a title row above
 * the dish, a HUD below it, the dish itself as `children`. Presentational and total — no hook
 * beyond one focus effect, no state, no `sim`: the HUD reads the hook's <= 10 Hz published values
 * (`cycle`, `population`, `genPerSec` — M2) that `<BattleSimulationView>` hands it, the same ones
 * the sidebar reads, and the transport is the bar's own cluster (`<TransportControls>`, FD7) in a
 * second home. Nothing here runs per cycle (NFR-1.1, AR-29).
 *
 * `active` (Story 3.18 FD2 (a), an amendment to §3.14's `{ battleTitle, onExit, hud, transport,
 * children }`): the component is MOUNTED IN BOTH STATES and renders its chrome only while active.
 * The reason is React's reconciliation, and it is the load-bearing line of the story (see the
 * fragment below): `children` is the live `<PetriDishCanvas>` inside its wrappers, and an element
 * keeps its DOM node only while its ancestor chain has the same component types at the same child
 * positions. A stage that mounted only while fullscreen would put a NEW element type above the
 * canvas in one state — an unmount + remount, the renderer destroyed and rebuilt, one blank frame —
 * exactly what the epic's "never remounted" AC forbids (FD2 (c)). Mounted always, with `children`
 * at a fixed slot, the dish keeps its canvas, its `GridRenderer` and its attached loop across
 * enter and exit; only its BOX changes, which `PlaybackDish`'s `ResizeObserver` answers with
 * `renderer.resize` (AC4).
 *
 * `<FullscreenTopOverlay>` and `<FullscreenHUD>` are private children of this file (spec §3.3's
 * rule for `<EditorSidebar>` / `<EditorMain>`; `simulation/README.md`'s "`<FullscreenStage>` and
 * its two parts").
 *
 * FD4 (a), where this deviates from the mockup and why: the mockup FLOATS the top bar and the HUD
 * over the dish (`position: fixed`, a `rgba` gradient, `rgba(26,26,26,.82)` + `backdrop-filter:
 * blur(8px)`), adds a `box-shadow` glow, and sizes the dish `min(94vw, 138vh)`. None of that ships:
 * (1) AR-46 bans the four `rgba` literals and the token layer should not grow two translucent
 * surfaces for one screen; (2) text over a translucent panel over arbitrary organism cells has no
 * gate-able contrast, while every pair used here — accent / text-primary / text-secondary on
 * bg-primary / bg-secondary — is already a row in `themeTokens.test.ts`; (3) `backdrop-filter`
 * over a canvas repainting at up to 60 FPS forces per-frame recomposition of the region beneath
 * it, which RFC-003's "no UI animation during simulation steps" rule exists to keep off the budget
 * (NFR-1.1). So: three IN-FLOW rows in a flex column, an opaque `--gol-bg-primary` stage (the
 * view's `SimulationLayout`, not this file), a `--gol-bg-secondary` HUD panel with `--gol-border`;
 * no gradient, no blur, no glow, no `transition` anywhere (the mid-fade axe trap every bar on this
 * route records). Mockup-refresh candidate (`deferred-work.md`).
 *
 * NOT rendered, by story: the mockup's `.fs-hint` line (`Press F to exit …`) and its `keydown`
 * script are Story 3.19's, together with the handlers that make them true (NFR-4.1 forbids a hint
 * with nothing behind it); no Back, no speed slider (FD6), no grid-size control, no sidebar.
 */

export interface FullscreenHudValues {
  readonly cycle: number;
  /** The hook's published, pre-sorted entries (`sim.population`), straight through. */
  readonly population: readonly PopulationEntry[];
  readonly genPerSec: GenPerSec;
}

export interface FullscreenStageProps {
  /** FD2 (a): chrome is rendered only while true; `children` is rendered in BOTH states. */
  active: boolean;
  /** As GIVEN — `<BattlePage>` applies `battleDisplayName` once (trap 22). */
  battleTitle: string;
  onExit(): void;
  hud: FullscreenHudValues;
  /** The bar's own props, whole (spec §3.13) — `<TransportControls>` renders them (FD7). */
  transport: SimulationControlBarProps;
  /** The live dish inside its UNCHANGED wrappers (AC4). */
  children: ReactNode;
}

// Mockup: `.fs-top` (petri-dish-play-mode-fullscreen.html:38-52) — IN FLOW (FD4), not
// `position: fixed`; no gradient, no `pointer-events` dance (nothing sits under it). Vertical
// padding is 12px, not the mockup's 18px: in flow, every pixel of this row is a pixel the dish
// does not get (the layout is height-bound at 16:9), and the mockup's values were drawn for rows
// that FLOATED over the dish. Measured at 1280×720 (Story 3.18 Dev Agent Record): with the
// mockup's values the fullscreen dish came out SMALLER than the chassis's (501px vs 517px tall).
const TopOverlay = styled('div')({
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: '16px',
  padding: '12px 24px',
});

// Mockup: `.fs-title` (:54-63) — the row that holds the heading and its badge. The badge is a
// SIBLING of the `<h1>`, never inside it (trap 9): the heading's accessible name must be exactly
// the battle title, both for RTL's exact `{ name }` match and for what a screen reader announces.
const TitleRow = styled('div')({
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
  minWidth: 0,
});

// `.fs-title`'s typography on an `<h1>`: the header is UNMOUNTED while the stage is up (FD9), so
// this is the route's single level-1 heading in fullscreen — the `BattlePage.test.tsx` single-h1
// invariant holds in both states. `minWidth: 0` + `overflowWrap: anywhere` is the header's own
// 100-character rule (`BattleHeader.tsx`'s `Title`).
const Title = styled('h1')({
  margin: 0,
  fontSize: '14px',
  fontWeight: 600,
  // The DOM text is the title as typed; CSS uppercases it (trap 15 of `<SidebarFooter>`).
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
  color: 'var(--gol-text-secondary)',
  minWidth: 0,
  overflowWrap: 'anywhere',
});

// Mockup: `.fs-mode-badge` (:65-72) verbatim — accent text, accent border, tokens only.
const ModeBadge = styled('span')({
  color: 'var(--gol-accent)',
  border: '1px solid var(--gol-accent)',
  padding: '2px 8px',
  fontSize: '10px',
  fontWeight: 600,
  letterSpacing: '1px',
  textTransform: 'uppercase',
  flexShrink: 0,
});

// Mockup: `.fs-exit` (:74-92) minus its `rgba(0, 0, 0, 0.4)` surface (FD4: transparent on the
// stage's own opaque `--gol-bg-primary`) and minus `transition: all 0.2s` (the axe mid-fade trap).
// `--gol-border-control`, not `--gol-border`: SC 1.4.11 needs the control token's 3:1 against
// `--gol-bg-primary` (`themeTokens.test.ts`'s control pairs). Hover is the mockup's own accent
// border + text (`:89-92`).
const ExitButton = styled('button')({
  background: 'transparent',
  border: '1px solid var(--gol-border-control)',
  color: 'var(--gol-text-primary)',
  padding: '8px 16px',
  fontSize: '11px',
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
  cursor: 'pointer',
  fontFamily: 'inherit',
  flexShrink: 0,
  '&:hover': {
    borderColor: 'var(--gol-accent)',
    color: 'var(--gol-accent)',
  },
  '&:focus-visible': {
    outline: '2px solid var(--gol-accent)',
    outlineOffset: '2px',
  },
});

interface FullscreenTopOverlayProps {
  battleTitle: string;
  onExit(): void;
}

function FullscreenTopOverlay({ battleTitle, onExit }: FullscreenTopOverlayProps) {
  const exitRef = useRef<HTMLButtonElement>(null);

  // AC7: the Exit button takes focus on mount. The control that had focus — the header's
  // Fullscreen button — has just UNMOUNTED (FD9), so without this focus falls to `<body>` and a
  // keyboard user's next Tab restarts from the top of the document. A mount effect rather than
  // `autoFocus` so the move is explicit in the file that owns the button. `.focus()` is not
  // state, so this is not `react-hooks/set-state-in-effect` territory; under `<StrictMode>` the
  // effect runs twice and focusing the same element twice is idempotent (trap 7).
  useEffect(() => {
    exitRef.current?.focus();
  }, []);

  return (
    <TopOverlay>
      <TitleRow>
        <Title>{battleTitle}</Title>
        <ModeBadge>Run</ModeBadge>
      </TitleRow>
      <ExitButton ref={exitRef} type="button" onClick={onExit}>
        {/* The glyph is decorative and sits in axe's symbol range (the 3.17 FD4 shape):
            `aria-hidden` keeps it out of the accessible name, which is exactly "Exit fullscreen". */}
        <span aria-hidden="true">⛶</span> Exit fullscreen
      </ExitButton>
    </TopOverlay>
  );
}

// Mockup: `.fs-hud`'s placement (:131-148) — `bottom: 40px`, centred — as an IN-FLOW row (FD4):
// the centring is `justifyContent`, the offset is bottom padding — 16px rather than the mockup's
// 40px, for the reason `TopOverlay` records: a floating panel's 40px clearance from the viewport
// edge is dead height once the row is in flow, and the dish pays for it.
const HudRow = styled('div')({
  display: 'flex',
  justifyContent: 'center',
  padding: '0 24px 16px',
});

// Mockup: `.fs-hud`'s panel (:131-148) minus `position: fixed`, the `rgba` surface and
// `backdrop-filter` (FD4) — `--gol-bg-secondary` opaque, `--gol-border`. `flexWrap` + `maxWidth:
// 94vw` are the mockup's own overflow policy for a wide roster.
const HudPanel = styled('div')({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexWrap: 'wrap',
  gap: '20px',
  padding: '12px 20px',
  maxWidth: '94vw',
  background: 'var(--gol-bg-secondary)',
  border: '1px solid var(--gol-border)',
});

// Mockup: `.hud-group` (:150-154).
const HudGroup = styled('div')({
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
});

// Mockup: `.hud-label` (:156-161).
const HudLabel = styled('span')({
  fontSize: '10px',
  color: 'var(--gol-text-secondary)',
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
});

// Mockup: `.hud-cycle-value` (:163-169) — the HUD's own size/colour block around the shared
// `<CycleDigits>` (FD8): 20px here, 32px in the sidebar's `<CycleCounter>`.
const HudCycleValue = styled('span')({
  fontSize: '20px',
  fontWeight: 600,
  color: 'var(--gol-accent)',
  fontVariantNumeric: 'tabular-nums',
  letterSpacing: '2px',
});

// Mockup: `.hud-speed-value` (:171-175). A READ-OUT (FD6), not `<SpeedControl>`'s slider: §3.14
// gives `hud.genPerSec` as a value and the mockup draws `10 gen/s` as text; a presenter changes
// speed from the chassis, and 3.19 adds no speed keys.
const HudSpeedValue = styled('span')({
  fontSize: '13px',
  fontWeight: 600,
  color: 'var(--gol-text-primary)',
});

// Mockup: `.hud-divider` (:177-181). `aria-hidden` at the call site — a decorative rule.
const HudDivider = styled('span')({
  width: '1px',
  height: '28px',
  background: 'var(--gol-border)',
  flexShrink: 0,
});

interface FullscreenHUDProps {
  hud: FullscreenHudValues;
  transport: SimulationControlBarProps;
}

function FullscreenHUD({ hud, transport }: FullscreenHUDProps) {
  return (
    <HudRow>
      <HudPanel>
        <HudGroup>
          <HudLabel>Cycle</HudLabel>
          <HudCycleValue>
            <CycleDigits cycle={hud.cycle} />
          </HudCycleValue>
        </HudGroup>
        {/* Empty roster → the whole group is omitted, divider included, so the panel never
            shows a rule with nothing after it. */}
        {hud.population.length > 0 && (
          <>
            <HudDivider aria-hidden="true" />
            <HudGroup>
              <PopulationPills entries={hud.population} />
            </HudGroup>
          </>
        )}
        <HudDivider aria-hidden="true" />
        <HudGroup>
          <HudLabel>Speed</HudLabel>
          <HudSpeedValue>{`${hud.genPerSec} gen/s`}</HudSpeedValue>
        </HudGroup>
        <HudDivider aria-hidden="true" />
        <TransportControls {...transport} />
      </HudPanel>
    </HudRow>
  );
}

export default function FullscreenStage({
  active,
  battleTitle,
  onExit,
  hud,
  transport,
  children,
}: FullscreenStageProps) {
  return (
    // THE load-bearing line (FD2 (a), AC4): a fragment with THREE FIXED SLOTS. React reconciles
    // unkeyed children by position, and `{active && …}` leaves `false` in its slot rather than
    // removing it — so `children` (the dish's wrappers and the canvas) is at slot 1 whether the
    // stage is active or not, under the same ancestor types, and keeps its DOM node, its
    // `GridRenderer` and its attached loop across enter and exit. A `{active ? <>…{children}…</> :
    // children}` here would move `children` between depths and REMOUNT the canvas
    // (`BattleSimulationView.test.tsx`'s "same canvas node" assertions are the tripwire).
    <>
      {active && <FullscreenTopOverlay battleTitle={battleTitle} onExit={onExit} />}
      {children}
      {active && <FullscreenHUD hud={hud} transport={transport} />}
    </>
  );
}
