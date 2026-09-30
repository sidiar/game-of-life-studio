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
// left half, the transport keeps the right. `flexWrap` for NFR-3.1's 700px floor: when the hint's
// 240px basis and the transport no longer fit side by side, the transport drops to its own row
// (and wraps its buttons there) instead of running off the bar's right edge.
const Bar = styled('div')({
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '12px 20px',
  padding: '12px 25px',
  minWidth: 0,
  background: 'var(--gol-bg-secondary)',
  borderTop: '1px solid var(--gol-border)',
});

// Mockup: `.keyboard-hint` (`petri-dish-play-mode.html:518-530`) — `10px`, `--gol-text-secondary`,
// `letter-spacing: 0.5px`, uppercase (DOM text stays sentence case, trap 15); each `<kbd>`
// `--gol-text-primary`, `600`, `margin: 0 3px`. `minWidth: 0` so the line wraps its own words
// rather than pushing the transport off the bar (trap 16); the 240px basis is the narrowest it may
// get before the `<Bar>` wraps the transport onto the next row — below it the hint went one word
// per line (measured at 744px, iPad mini portrait).
const HintLine = styled(HotkeyHints)({
  fontSize: '10px',
  color: 'var(--gol-text-secondary)',
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
  minWidth: 0,
  flex: '1 1 240px',
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
