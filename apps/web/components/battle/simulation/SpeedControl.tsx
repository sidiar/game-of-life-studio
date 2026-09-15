'use client';

import { useId } from 'react';
import { styled } from '@mui/material/styles';
import { SPEED_LADDER, speedIndex } from '@/lib/battle/simulationSpeed';
import type { GenPerSec } from '@/lib/battle/useSimulation';

/**
 * Spec §3.12: a detented slider over the canonical gen/sec ladder (Decision D.1), adjustable
 * DURING playback — the parent hands the new speed to `useSimulation.setSpeed`, a ref write the
 * loop reads on its next frame (AR-34, Story 3.10), so a move never restarts the loop, never
 * re-clones the grid and never pauses (FR-4.2 "without pausing").
 *
 * Presentational and total, the `<SimulationControlBar>` shape: no hook beyond `useId`, no state,
 * no repository, no `sim`. `SpeedControlProps` is spec §3.12's two members exactly, because Story
 * 3.18's `<FullscreenHUD>` and Story 4.15's preview panel render this same control (spec §7). The
 * value is CONTROLLED by `genPerSec` — the hook is the only holder of the speed (3.10 FD6), and a
 * local mirror is precisely the drift that design exists to prevent.
 *
 * Story 3.13 FD1, option (a): a native `<input type="range">` rather than MUI `<Slider>`. Its
 * value is the ladder INDEX (`min 0`, `max 4`, `step 1` — the mockup's own scheme,
 * `petri-dish-play-mode.html:652`), which makes it detented by construction: there is no
 * in-between value to snap. That is also why `aria-valuetext` is mandatory here and not a nicety —
 * `aria-valuenow` is the index the browser exposes, and without the text a screen reader announces
 * "3" for 10 gen/sec. Native keyboard semantics (arrows, Home/End) and `role="slider"` come free.
 * MUI's `Slider` was set aside on three facts: it pulls a new module into the route with the
 * least bundle headroom (AR-35); its DOM (`<span role="slider">` over a hidden input) matches no
 * mockup locator; and `deferred-work.md` (Story 1.9 review) records that under `cssVariables:
 * true` MUI emits `--mui-palette-Slider-primaryTrack: var(--gol-accent)` — the inactive rail is
 * INVISIBLE until someone authors a shade token and a `styleOverride`, a design call no mockup
 * specifies. Story 3.16's Grid Size slider takes this idiom — whether by promoting a shared
 * `<LadderSlider>` or by copying these blocks is 3.16's call (`deferred-work.md`, the 3-13
 * section); 4.6 and 6.9 should follow it too.
 */

// Mockup: `.speed-control` (petri-dish-play-mode.html:246-250).
const Control = styled('div')({
  display: 'flex',
  flexDirection: 'column',
  gap: '12px',
});

// Mockup: `.speed-label-row` (:252-256).
const LabelRow = styled('div')({
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
});

// Mockup: `.speed-label` (:258-263), as a REAL `<label for>` (FD2): the visible text IS the
// accessible name, one string. Sentence case in the DOM, uppercase by CSS (3.12 trap 15) — and
// spelled out, never "gen / sec": `/` is announced as "slash" or dropped depending on the engine.
const Label = styled('label')({
  fontSize: '11px',
  color: 'var(--gol-text-secondary)',
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
});

// Mockup: `.speed-value` (:265-269). `aria-hidden` at the call site — the slider's own
// `aria-valuetext` carries this fact, and a second source would be announced twice.
const Value = styled('span')({
  fontSize: '14px',
  color: 'var(--gol-accent)',
  fontWeight: 600,
});

/**
 * Mockup: `.speed-slider` and its thumb (:271-297).
 *
 * ⚠️ `--gol-border-control` for the track, not the mockup's decorative `var(--border)`: a 6 px
 * track is the control's only boundary, so SC 1.4.11 applies, and `--gol-border` on
 * `--gol-bg-primary` measures 1.57:1 — the same substitution `<BattleNameField>`,
 * `<OrganismRoster>` and `<GridSettingsSection>` each record. Every pair here is already a gated
 * row in `themeTokens.test.ts` (AR-46, NFR-8.1): no new token, no new contrast row.
 *
 * With `appearance: none`, Blink and WebKit paint the input's own `background` as the track;
 * Firefox paints its native track over it unless `::-moz-range-track` is styled too (trap 7).
 *
 * ❌ No `transition` (Story 2.13's rule): this route has lost three of them to an axe scan landing
 * mid-fade — `EditorStatusBar.tsx`'s comment block is the record. ❌ No `box-shadow`: the editor
 * mockup's dominance thumb carries an `rgba()` glow that is not this control's, and AR-46 bans the
 * literal anyway.
 */
const Slider = styled('input')({
  width: '100%',
  height: '6px',
  margin: 0,
  background: 'var(--gol-border-control)',
  borderRadius: '3px',
  appearance: 'none',
  WebkitAppearance: 'none',
  cursor: 'pointer',
  '&::-webkit-slider-thumb': {
    appearance: 'none',
    WebkitAppearance: 'none',
    width: '16px',
    height: '16px',
    background: 'var(--gol-accent)',
    borderRadius: '50%',
    border: 0,
  },
  '&::-moz-range-thumb': {
    appearance: 'none',
    width: '16px',
    height: '16px',
    background: 'var(--gol-accent)',
    borderRadius: '50%',
    border: 0,
  },
  '&::-moz-range-track': {
    height: '6px',
    background: 'var(--gol-border-control)',
    borderRadius: '3px',
  },
  '&:focus-visible': {
    outline: '2px solid var(--gol-accent)',
    outlineOffset: '2px',
  },
});

// Mockup: `.speed-presets` (:299-306). Decorative — the ladder is what the slider's own range
// already exposes, so the marks are `aria-hidden` at the call site (trap 5).
const Marks = styled('div')({
  display: 'flex',
  justifyContent: 'space-between',
  fontSize: '10px',
  color: 'var(--gol-text-secondary)',
  letterSpacing: '0.5px',
  marginTop: '-5px',
});

export interface SpeedControlProps {
  /** The hook's published speed (`sim.genPerSec`) — the ONLY source of the slider's position. */
  genPerSec: GenPerSec;
  /** The view passes `sim.setSpeed` straight through (it is `useCallback`-stable, Story 3.10). */
  onChange(v: GenPerSec): void;
}

export default function SpeedControl({ genPerSec, onChange }: SpeedControlProps) {
  const id = useId();

  return (
    <Control>
      <LabelRow>
        <Label htmlFor={id}>Generations per second</Label>
        <Value aria-hidden="true">{genPerSec} gen/s</Value>
      </LabelRow>
      {/* React's `onChange` on a range input fires on every `input` event — each detent crossed
          during a drag — which is what "live during playback" means. Every browser sanitises a
          range value to `min`/`max` AND to `step` before `input` fires, so the index is always a
          ladder position and the tuple lookup needs no guard: a runtime check would test for a
          state the element cannot be in. jsdom clamps but does NOT snap to `step` — a unit test
          that writes `'2.6'` gets `onChange(undefined)` and a `NaN` period that silently freezes
          the loop — so tests write integer strings, never fractions. `aria-valuetext` is the only
          thing assistive tech hears for the position (the value span is hidden), so it must be
          grammatical at 1 gen/sec too. */}
      <Slider
        id={id}
        type="range"
        min={0}
        max={SPEED_LADDER.length - 1}
        step={1}
        value={speedIndex(genPerSec)}
        aria-valuetext={`${genPerSec} ${genPerSec === 1 ? 'generation' : 'generations'} per second`}
        onChange={(event) => onChange(SPEED_LADDER[Number(event.currentTarget.value)])}
      />
      <Marks aria-hidden="true">
        {SPEED_LADDER.map((speed) => (
          <span key={speed}>{speed}</span>
        ))}
      </Marks>
    </Control>
  );
}
