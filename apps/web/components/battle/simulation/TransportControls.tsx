'use client';

import { styled } from '@mui/material/styles';
import type { SimulationStatus } from '@/lib/battle/useSimulation';

/**
 * The transport trio — Play/Pause, Next cycle, Stop & reset — as ONE cluster with two homes:
 * `<SimulationControlBar>` (the Run chassis's bottom bar, spec §3.13) and `<FullscreenStage>`'s
 * HUD (spec §3.14). Story 3.18 FD7 (a) lifted it out of `SimulationControlBar.tsx`, where Story
 * 3.12 wrote it, so that the four decisions 3.12 made stay ONE implementation: the single
 * Play/Pause button whose name states the NEXT action (3.12 FD1), the colour pairs (3.12 FD2), the
 * always-enabled Stop (3.12 FD5) and the REAL `disabled` on Step (3.12 FD6). The two hosts never
 * coexist — the bar unmounts while the stage is active — so `getByRole('group', { name:
 * 'Simulation controls' })` stays unique on the page.
 *
 * The three accessible names are the same in both homes (`Play`/`Pause`, `Next cycle`, `Stop &
 * reset`), NOT the fullscreen mockup's shorter `Play`/`Next`/`Stop`: the names are part of the
 * route's test vocabulary, and Story 3.19's hotkey hints (`<HotkeyHints>`, in each bar's own file)
 * name the SHORTER verbs — `Play/Pause`, `Next`, `Stop` — as prefixes of these accessible names,
 * never a second set (FD11). No `aria-keyshortcuts` here (FD8 (a)): this cluster is shared with
 * Story 4.15's preview panel, where no hotkey hook is ever mounted, and the hint line is the
 * disclosure instead.
 *
 * Presentational and total, the `<SidebarFooter>` shape: "fired on a real press and nothing
 * else". No hook, no state, no repository, no `sim` — the view is the one place that decides what
 * a press MEANS; this component only reports it. `SimulationControlBarProps` is spec §3.13's four
 * members exactly and is declared HERE (once) — `<SimulationControlBar>` re-exports the type so
 * its own importers are unaffected by the lift.
 *
 * Three colour decisions (3.12 FD2), because the mockup has cyan / amber / red and the token layer
 * has only cyan and red:
 * - Play/Pause is the route's primary accent pair (`--gol-accent` fill) — the mockup's own value,
 *   no decision to make.
 * - Stop & reset is a danger OUTLINE, hover brightening the TEXT/border to `--gol-danger-hover`
 *   rather than tinting the surface: the mockup's 10% danger tint measures under 4.5:1 for danger
 *   text on `--gol-bg-secondary` (the same trap `themeTokens.test.ts` already records for
 *   `--gol-danger` on `--gol-bg-hover`), so a filled/tinted hover would ship an AA failure.
 *   `themeTokens.test.ts` gates `danger-hover` on both bar backgrounds instead.
 * - Next cycle is the secondary/neutral outline (`UndoButton`'s pair) rather than a new `warning`
 *   token family for one control — recorded as a token-layer candidate for Epic 6
 *   (`deferred-work.md`).
 */

// `role="group"` + `aria-label`: a bare `<div>`'s implicit `generic` role prohibits an
// author-assigned accessible name (the same restriction `<BattleHeader>`'s `<ModeToggle>` and
// `<EditorStatusBar>`'s `<StatItem>` both work around) — this is the named cluster axe expects for
// a `group` role (3.12 trap 8: `title` on the disabled Step is a description, not a name).
const Transport = styled('div')({
  display: 'flex',
  gap: '10px',
  alignItems: 'center',
  flexShrink: 0,
});

/**
 * Story 2.13 forced decision 5, option (c), repeated here rather than imported: `simulation/`
 * must not reach into `editor/` (`simulation/README.md`'s "anything from `editor/` reached for out
 * of convenience... is a design change"). A plain style OBJECT, not a base component — spread into
 * three `styled('button')`s below, the cost of the wall paid once per file rather than tunnelled
 * through an import. Not byte-identical: the first three members (`display` / `alignItems` /
 * `gap`) are this cluster's additions for the glyph-plus-label layout (the mockup's `.control-btn`)
 * and have no counterpart in the editor's object — everything from `fontSize` down matches it
 * field for field.
 *
 * ❌ No raw hex or `rgb()` anywhere in this file — AR-46 is a live lint rule on `apps/web`, and
 * every colour below is an existing `--gol-*` token.
 */
const barButtonBase = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '8px',
  fontSize: '11px',
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
  fontFamily: 'inherit',
  cursor: 'pointer',
  '&:focus-visible': {
    outline: '2px solid var(--gol-accent)',
    outlineOffset: '2px',
  },
  '&:disabled': {
    background: 'var(--gol-action-disabled-bg)',
    borderColor: 'var(--gol-border)',
    color: 'var(--gol-action-disabled)',
    cursor: 'not-allowed',
  },
} as const;

// = `SaveButton`'s pair (`<EditorStatusBar>`) — the mockup's `.control-btn-play` is literally
// `var(--accent)` on `var(--bg-primary)`, so no decision here (3.12 FD2). `11px 18px` per the play
// mockup's `.control-btn`, not `SaveButton`'s own `8px 20px`.
//
// ❌ No `transition` (Story 2.13's rule, restated here): a cross-fade between the enabled and
// disabled palettes paints frames `themeTokens.test.ts` cannot see, and this route has already
// lost one to an axe scan landing mid-fade (`EditorStatusBar.tsx`'s comment block is the record).
const PlayPauseButton = styled('button')({
  ...barButtonBase,
  background: 'var(--gol-accent)',
  border: '1px solid var(--gol-accent)',
  color: 'var(--gol-on-accent)',
  padding: '11px 18px',
  '&:hover:not(:disabled)': {
    background: 'var(--gol-accent-hover)',
    borderColor: 'var(--gol-accent-hover)',
  },
});

// = `UndoButton`'s pair — Next cycle and Undo are the two "exactly one step" buttons on this
// route, in the same bar position, in the same clothes (3.12 FD2 option (b)): a rhyme, not a
// compromise, and no new token family for one control.
const StepButton = styled('button')({
  ...barButtonBase,
  background: 'transparent',
  border: '1px solid var(--gol-border-control)',
  color: 'var(--gol-text-primary)',
  padding: '11px 18px',
  '&:hover:not(:disabled)': {
    background: 'var(--gol-bg-hover)',
    borderColor: 'var(--gol-text-secondary)',
  },
});

// 3.12 FD2 (a): danger outline; hover brightens the TEXT and border to `--gol-danger-hover`, the
// surface stays `--gol-bg-secondary` throughout. 3.12 trap 11: `--gol-danger` on `--gol-bg-hover`
// measures 4.48:1 and is deliberately excluded from the gate — a "fill the surface on hover"
// treatment would paint danger text on exactly that background and fail AA. `--gol-danger-hover`
// measures ≈5.3:1 on `--gol-bg-secondary` and ≈6.0:1 on `--gol-bg-primary` — `themeTokens.test.ts`
// gates both as a fact, not an estimate.
const StopButton = styled('button')({
  ...barButtonBase,
  background: 'transparent',
  border: '1px solid var(--gol-danger)',
  color: 'var(--gol-danger)',
  padding: '11px 18px',
  '&:hover:not(:disabled)': {
    borderColor: 'var(--gol-danger-hover)',
    color: 'var(--gol-danger-hover)',
  },
});

// Mockup: `.control-btn-icon` (petri-dish-play-mode.html:239-244). `aria-hidden`: the button's own
// text is the accessible name (3.12 trap 13/14 — sentence case in the DOM, CSS uppercases it), and
// the glyph would otherwise be read a second time.
const Icon = styled('span')({
  fontSize: '15px',
  lineHeight: 1,
});

export interface SimulationControlBarProps {
  readonly status: SimulationStatus;
  /**
   * ONE handler for the toggle (3.12 FD3): the cluster never sees `sim` and never decides
   * play-vs-pause — `<BattleSimulationView>` reads `status` and calls the right verb. A fifth prop
   * here (separate `onPlay`/`onPause`) is the spec deviation FD3 rejected.
   */
  onPlayPause(): void;
  /** Paused-only (FR-4.3/4.5); the view passes `sim.step` straight through. */
  onStep(): void;
  /** Always enabled (3.12 FD5); the view passes `sim.stop` straight through. */
  onStop(): void;
}

export default function TransportControls({
  status,
  onPlayPause,
  onStep,
  onStop,
}: SimulationControlBarProps) {
  const playing = status === 'playing';

  return (
    <Transport role="group" aria-label="Simulation controls">
      {/* 3.12 FD1: ONE button, ONE DOM element across the flip — the accessible name states the
          NEXT action ("Play" while paused, "Pause" while playing), no `aria-pressed`. WAI-ARIA's
          toggle-button guidance is explicit that a button with `aria-pressed` must not also
          change its label; the two signals together would announce "Pause, pressed" for a
          running sim. */}
      <PlayPauseButton type="button" onClick={onPlayPause}>
        {playing ? (
          <>
            <Icon aria-hidden="true">⏸</Icon>
            Pause
          </>
        ) : (
          <>
            <Icon aria-hidden="true">▶</Icon>
            Play
          </>
        )}
      </PlayPauseButton>
      {/* 3.12 FD6: a REAL `disabled`, never CSS-only — the route's policy for every disabled control
          (3.12 trap 1: a `pointer-events: none` grey does not stop `sim.step()`'s throw from being
          reachable). `title` states why (the RUN button's precedent, Story 3.11 AC7); the
          keyboard gap that leaves is Story 6.11's route-wide sweep, not this story's. */}
      <StepButton
        type="button"
        onClick={onStep}
        disabled={playing}
        title={playing ? 'Available while paused' : undefined}
      >
        <Icon aria-hidden="true">⏭</Icon>
        Next cycle
      </StepButton>
      {/* 3.12 FD5: always enabled — FR-4.4 attaches no precondition, and `stop()` mints a fresh seed
          even at cycle 0, so it is never quite a no-op. */}
      <StopButton type="button" onClick={onStop}>
        <Icon aria-hidden="true">⏹</Icon>
        Stop & reset
      </StopButton>
    </Transport>
  );
}
