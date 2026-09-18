'use client';

import { styled } from '@mui/material/styles';
import HotkeyHints from './HotkeyHints';
import TransportControls, { type SimulationControlBarProps } from './TransportControls';

export type { SimulationControlBarProps } from './TransportControls';

/**
 * Spec §3.13: the Run bottom bar — "keyboard hints left, transport buttons right". Story 3.19
 * ships the LEFT half: the hint line (`Shortcuts: Space Play/Pause • → Next • Esc Stop`) lands
 * together with `useSimulationHotkeys`, the handlers that make it true (NFR-4.1 forbids a hint
 * with nothing behind it — the reason 3.12 and 3.18 both left this half here). `<Bar>` is now
 * `justifyContent: 'space-between'`, as its own comment promised it would become.
 *
 * Since Story 3.18 (FD7 (a)) the transport trio itself lives in `<TransportControls>` — the shared
 * piece the fullscreen HUD renders too — and this component is the bar CHROME around it plus the
 * hint: full width, top border, `--gol-bg-secondary`. `SimulationControlBarProps` is declared in
 * `TransportControls.tsx` and re-exported here, so the type has one declaration and its importers
 * one name.
 *
 * Presentational and total, the `<SidebarFooter>` shape: no hook, no state, no repository, no
 * `sim` — the view is the one place that decides what a press MEANS; the hint line is FD6's shared
 * `<HotkeyHints>`, styled here per the mockup's `.keyboard-hint` (`petri-dish-play-mode.html:518-530`).
 * `SimulationControlBar.test.tsx`'s tab-order test passes unchanged because nothing in the hint is
 * focusable.
 */

// `<EditorStatusBar>`'s `Bar` values, now `justifyContent: 'space-between'` — the hint fills the
// left half, the transport keeps the right.
const Bar = styled('div')({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '20px',
  padding: '12px 25px',
  minWidth: 0,
  background: 'var(--gol-bg-secondary)',
  borderTop: '1px solid var(--gol-border)',
});

// Mockup: `.keyboard-hint` (`petri-dish-play-mode.html:518-530`) — `10px`, `--gol-text-secondary`,
// `letter-spacing: 0.5px`, uppercase (DOM text stays sentence case, trap 15); each `<kbd>`
// `--gol-text-primary`, `600`, `margin: 0 3px`. `minWidth: 0; flex: 1` so the line WRAPS at
// NFR-3.1's 1024px floor rather than pushing the transport off the bar (trap 16) — the transport
// keeps its own `flexShrink: 0` (`TransportControls.tsx`).
const HintLine = styled(HotkeyHints)({
  fontSize: '10px',
  color: 'var(--gol-text-secondary)',
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
  minWidth: 0,
  flex: 1,
  '& kbd': {
    color: 'var(--gol-text-primary)',
    margin: '0 3px',
  },
});

// The chassis hint's three entries, exactly the mockup's words (FD11): Play/Pause, Next, Stop —
// prefixes of the buttons' own `Next cycle` / `Stop & reset`, not new verbs.
const CHASSIS_HINT_ENTRIES = [
  { key: 'Space', label: 'Play/Pause' },
  { key: '→', label: 'Next', arrow: true },
  { key: 'Esc', label: 'Stop' },
] as const;

export default function SimulationControlBar(props: SimulationControlBarProps) {
  return (
    <Bar>
      <HintLine lead="Shortcuts: " entries={CHASSIS_HINT_ENTRIES} />
      <TransportControls {...props} />
    </Bar>
  );
}
