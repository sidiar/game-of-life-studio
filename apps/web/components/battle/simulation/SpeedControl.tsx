'use client';

import { SPEED_LADDER, speedIndex } from '@/lib/battle/simulationSpeed';
import type { GenPerSec } from '@/lib/battle/useSimulation';
import LadderSlider from './LadderSlider';

/**
 * Spec §3.12: a detented slider over the canonical gen/sec ladder (Decision D.1), adjustable
 * DURING playback — the parent hands the new speed to `useSimulation.setSpeed`, a ref write the
 * loop reads on its next frame (AR-34, Story 3.10), so a move never restarts the loop, never
 * re-clones the grid and never pauses (FR-4.2 "without pausing").
 *
 * Presentational and total, the `<SimulationControlBar>` shape: no hook beyond `<LadderSlider>`'s
 * own `useId`, no state, no repository, no `sim`. `SpeedControlProps` is spec §3.12's two members
 * exactly, because Story 3.18's `<FullscreenHUD>` and Story 4.15's preview panel render this same
 * control (spec §7). The value is CONTROLLED by `genPerSec` — the hook is the only holder of the
 * speed (3.10 FD6), and a local mirror is precisely the drift that design exists to prevent.
 *
 * Story 3.13 FD1, option (a): a native `<input type="range">` rather than MUI `<Slider>` — see
 * `<LadderSlider>`'s head comment for the full reasoning (index-valued, `aria-valuetext`-labelled,
 * MUI `Slider` set aside on bundle/DOM/inactive-rail grounds). Story 3.16 FD1 (a) promoted that
 * idiom out of this file into `<LadderSlider>`, with THIS component as its first caller — this
 * file now composes the ladder-specific vocabulary (gen/sec spelling, the "generation(s) per
 * second" grammar) over the shared shell, and `SpeedControl.test.tsx` passing unchanged is the
 * refactor's proof: same DOM, same ARIA, same styles.
 */

export interface SpeedControlProps {
  /** The hook's published speed (`sim.genPerSec`) — the ONLY source of the slider's position. */
  genPerSec: GenPerSec;
  /** The view passes `sim.setSpeed` straight through (it is `useCallback`-stable, Story 3.10). */
  onChange(v: GenPerSec): void;
}

export default function SpeedControl({ genPerSec, onChange }: SpeedControlProps) {
  return (
    <LadderSlider
      label="Generations per second"
      valueLabel={`${genPerSec} gen/s`}
      valueText={`${genPerSec} ${genPerSec === 1 ? 'generation' : 'generations'} per second`}
      index={speedIndex(genPerSec)}
      max={SPEED_LADDER.length - 1}
      marks={SPEED_LADDER.map(String)}
      onIndexChange={(index) => onChange(SPEED_LADDER[index])}
    />
  );
}
