'use client';

import { styled } from '@mui/material/styles';
import TransportControls, { type SimulationControlBarProps } from './TransportControls';

export type { SimulationControlBarProps } from './TransportControls';

/**
 * Spec §3.13: the Run bottom bar — "keyboard hints left, transport buttons right". This bar
 * ships the RIGHT half only: the hints half (SPACE / → / ESC) is Story 3.19's, landing together
 * with the handlers that make them true (NFR-4.1 forbids a hint with nothing behind it). Until
 * then `<Bar>` stays `justifyContent: 'flex-end'` — 3.19 flips it to `space-between` once the left
 * region has real content.
 *
 * Since Story 3.18 (FD7 (a)) the transport trio itself lives in `<TransportControls>` — the shared
 * piece the fullscreen HUD renders too — and this component is the bar CHROME around it: full
 * width, top border, `--gol-bg-secondary`. Same DOM, same ARIA, same styles as before the lift;
 * `SimulationControlBar.test.tsx` passing unchanged is the refactor's proof (the Story 3.16
 * `<LadderSlider>` shape). `SimulationControlBarProps` is declared in `TransportControls.tsx` and
 * re-exported here, so the type has one declaration and its importers one name.
 *
 * Presentational and total, the `<SidebarFooter>` shape: no hook, no state, no repository, no
 * `sim` — the view is the one place that decides what a press MEANS.
 */

// `<EditorStatusBar>`'s `Bar` values, minus its `justifyContent: 'space-between'` (that bar has
// two halves today; this one has one, right-aligned, until 3.19).
const Bar = styled('div')({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'flex-end',
  gap: '20px',
  padding: '12px 25px',
  minWidth: 0,
  background: 'var(--gol-bg-secondary)',
  borderTop: '1px solid var(--gol-border)',
});

export default function SimulationControlBar(props: SimulationControlBarProps) {
  return (
    <Bar>
      <TransportControls {...props} />
    </Bar>
  );
}
