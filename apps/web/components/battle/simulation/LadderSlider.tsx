'use client';

import { useId } from 'react';
import { styled } from '@mui/material/styles';

/**
 * Story 3.16 FD1, option (a): the detented-slider idiom Story 3.13's `<SpeedControl>` introduced,
 * promoted to a shared primitive rather than copied. `<SpeedControl>` is this component's first
 * caller and `<GridSizeControl>` its second — both are Run-mode, so no `editor/` <-> `simulation/`
 * wall crosses (the `barButtonBase` copy in `<SimulationControlBar>` exists BECAUSE that wall does;
 * here there is no wall, which is what tips the choice from copying to promoting). The refactor's
 * own proof is `SpeedControl.test.tsx` passing UNCHANGED: this file holds the DOM and ARIA
 * `SpeedControl.tsx` (pre-3.16) had, generalised over props, not redesigned, and its styles moved
 * verbatim. Two additions are `<GridSizeControl>`'s alone and never fire for `<SpeedControl>`: the
 * `:disabled` rules (it never passes `disabled`) and `aria-describedby` (omitted when `describedBy`
 * is undefined). What the unchanged test pins is DOM + ARIA; jsdom computes no pseudo-element
 * style, so "same styles" rests on the verbatim move, not on a test.
 *
 * The index-valued native `<input type="range">` idiom (Story 3.13 FD1): the value is a LADDER
 * POSITION, not the underlying value, which makes it detented by construction (no in-between
 * position to snap) and gives native keyboard semantics and `role="slider"` for free. `aria-valuetext`
 * is mandatory — `aria-valuenow` is the index the browser exposes, and without the text a screen
 * reader announces the position, not the value (`SpeedControl.tsx`'s original comment on this).
 *
 * Rider (FD1): NO thumb glow (`--gol-shadow-slider-thumb` stays `<DominanceField>`'s, Story 4.6) —
 * neither Run-mode mockup's slider has one, and a glow here would change `<SpeedControl>`'s
 * rendered styles, which the refactor's proof forbids. The 4-6 deferred entry's "house thumb"
 * question is answered: not for the Run sidebar's sliders.
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

// Mockup: `.speed-label` (:258-263), as a REAL `<label for>`: the visible text IS the accessible
// name, one string. Sentence case in the DOM, uppercase by CSS (3.12 trap 15).
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
 * literal anyway (FD1's rider above).
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
  // The ring goes on the thumb, not the input: the input is the 6 px track, so an outline on it is
  // a 10 px band the 16 px thumb overhangs (Story 3.13 review decision (b)). The input's own ring is
  // suppressed only because the thumb's replaces it — SC 2.4.7 is met by the thumb ring.
  '&:focus-visible': {
    outline: 'none',
  },
  '&:focus-visible::-webkit-slider-thumb': {
    outline: '2px solid var(--gol-accent)',
    outlineOffset: '2px',
  },
  '&:focus-visible::-moz-range-thumb': {
    outline: '2px solid var(--gol-accent)',
    outlineOffset: '2px',
  },
  // Story 3.16 Task 2 (b): the pre-validated disabled pair every other control on this route uses
  // — `--gol-action-disabled` thumb on `--gol-action-disabled-bg` track — rather than a new token.
  // Disabled controls are exempt from SC 1.4.3, so no new contrast row either. Both vendor thumb
  // pseudo-elements need their own `&:disabled::-*` rule; a bare `&:disabled` alone does not reach
  // into either shadow-DOM-like pseudo-element.
  '&:disabled': {
    background: 'var(--gol-action-disabled-bg)',
    cursor: 'not-allowed',
  },
  '&:disabled::-webkit-slider-thumb': {
    background: 'var(--gol-action-disabled)',
  },
  '&:disabled::-moz-range-thumb': {
    background: 'var(--gol-action-disabled)',
  },
  '&:disabled::-moz-range-track': {
    background: 'var(--gol-action-disabled-bg)',
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

export interface LadderSliderProps {
  /** The visible label, and — through a real `<label for>` — the slider's accessible name. */
  label: string;
  /** The `aria-hidden` value span's text (e.g. `"10 gen/s"`, `"100 × 60"`). */
  valueLabel: string;
  /** `aria-valuetext` — the only thing assistive tech hears for the position. */
  valueText: string;
  /** The current ladder position (`min 0`). */
  index: number;
  /** `max` — the ladder's last index. */
  max: number;
  /** The `aria-hidden` marks row, one per ladder position, in order. */
  marks: readonly string[];
  /** Fires with the NEW index on a change — the caller maps it back through its own ladder. */
  onIndexChange(index: number): void;
  disabled?: boolean;
  /** `aria-describedby` — a caller-owned hint element's id (Story 3.16's "Adjustable while paused"). */
  describedBy?: string;
}

export default function LadderSlider({
  label,
  valueLabel,
  valueText,
  index,
  max,
  marks,
  onIndexChange,
  disabled = false,
  describedBy,
}: LadderSliderProps) {
  const id = useId();

  return (
    <Control>
      <LabelRow>
        <Label htmlFor={id}>{label}</Label>
        <Value aria-hidden="true">{valueLabel}</Value>
      </LabelRow>
      {/* React's `onChange` on a range input fires on every `input` event — each detent crossed
          during a drag. Every browser sanitises a range value to `min`/`max` AND to `step` before
          `input` fires, so the index is always a ladder position and the caller's tuple lookup
          needs no guard. jsdom clamps but does NOT snap to `step` — tests write integer strings,
          never fractions (SpeedControl trap 2 / GridSizeControl trap 6). */}
      <Slider
        id={id}
        type="range"
        min={0}
        max={max}
        step={1}
        value={index}
        disabled={disabled}
        aria-valuetext={valueText}
        aria-describedby={describedBy}
        onChange={(event) => onIndexChange(Number(event.currentTarget.value))}
      />
      <Marks aria-hidden="true">
        {/* Keyed by ladder POSITION: the label is decoration a caller may repeat (two rungs
            spelled alike), the index is the identity. */}
        {marks.map((mark, position) => (
          <span key={position}>{mark}</span>
        ))}
      </Marks>
    </Control>
  );
}
