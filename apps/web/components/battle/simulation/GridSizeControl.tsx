'use client';

import { useId } from 'react';
import { styled } from '@mui/material/styles';
import { GRID_PRESETS, gridPresetIndex, type GridPreset } from '@/lib/battle/gridPresets';
import LadderSlider from './LadderSlider';

/**
 * Spec §3.12 / FR-4.9: a detented slider over the four Play-mode grid presets, adjustable only
 * while paused. Presentational and total — no hook beyond `useId`, no state, no `sim`, the
 * `<SpeedControl>` shape — and CONTROLLED by `value`: the hook (`useSimulation`) is the only
 * holder of the live size (3.10 FD6), so this component never derives or remembers a size of its
 * own.
 *
 * `value` is `{ cols: number; rows: number }`, not `GridPreset` (AC8), because it renders
 * `sim.liveSize` — plain numbers reached without narrowing them, in a render path, to the ladder's
 * literal union (the 2.14 `<GridSettingsSection>.gridSize` precedent, `deferred-work.md:420`). The
 * WRITE path (`onChange`) IS preset-typed: the view hands `sim.resizeLive` straight through, and a
 * `GridPreset` is structurally a `LiveSize`.
 *
 * The "Adjustable while paused" hint renders ALWAYS, not only while `disabled` (FD3) — the mockup
 * shows it unconditionally, and a hint that appears only on disable is a sidebar layout shift on
 * every Play/Pause. It is wired as the slider's `aria-describedby` regardless, so the reason is in
 * the accessibility tree whether or not the control is currently reachable.
 *
 * `disabled` is the native attribute (FR-4.9's "only while paused", the route's disabled-state
 * policy — `<GridSettingsSection>`'s preset radios, `<SimulationControlBar>`'s Next-cycle button —
 * revisited route-wide in Story 6.11): a genuinely disabled control removes it from the tab order,
 * which is correct here (there is nothing to interact with over a running loop).
 */

// Mockup: `.control-note` (petri-dish-play-mode.html:311-317).
const Hint = styled('p')({
  margin: '10px 0 0',
  fontSize: '10px',
  color: 'var(--gol-text-tertiary)',
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
});

export interface GridSizeControlProps {
  /** `sim.liveSize` — the ONLY source of the thumb position. */
  value: { cols: number; rows: number };
  /** The view passes `sim.resizeLive` straight through (`useCallback`-stable, Story 3.10). */
  onChange(preset: GridPreset): void;
  /** `sim.status === 'playing'` — FR-4.9's "only while paused". */
  disabled: boolean;
}

export default function GridSizeControl({ value, onChange, disabled }: GridSizeControlProps) {
  const noteId = useId();
  // FD4: unmatched -> thumb at index 0, but the value span and `aria-valuetext` below still read
  // the TRUE dimensions from `value` (trap 5) — never from `GRID_PRESETS[index]`, which for an
  // unmatched size would announce the wrong grid.
  const index = Math.max(0, gridPresetIndex(value));

  return (
    <>
      <LadderSlider
        label="Grid dimensions"
        valueLabel={`${value.cols} × ${value.rows}`}
        valueText={`${value.cols} by ${value.rows} cells`}
        index={index}
        max={GRID_PRESETS.length - 1}
        marks={GRID_PRESETS.map((preset) => String(preset.cols))}
        disabled={disabled}
        describedBy={noteId}
        onIndexChange={(newIndex) => onChange(GRID_PRESETS[newIndex])}
      />
      <Hint id={noteId}>
        <span aria-hidden="true">⚠ </span>
        Adjustable while paused
      </Hint>
    </>
  );
}
