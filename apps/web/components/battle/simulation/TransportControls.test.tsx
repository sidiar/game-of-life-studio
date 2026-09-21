import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { axe } from 'vitest-axe';
import TransportControls from './TransportControls';

/** `SimulationControlBar.test.tsx`'s shape: one prop-set helper, `compact`/`disabled` default off
 * (Story 4.15's first caller — every existing render is unaffected). */
function renderTransport(overrides: Partial<ComponentProps<typeof TransportControls>> = {}) {
  return render(
    <TransportControls
      status="paused"
      onPlayPause={vi.fn()}
      onStep={vi.fn()}
      onStop={vi.fn()}
      {...overrides}
    />,
  );
}

describe('TransportControls — compact and disabled (Story 4.15)', () => {
  it('defaults to no data-compact, and Play enabled', () => {
    renderTransport();
    // No attribute at all — not `data-compact="false"` (a boolean prop would stringify), so the
    // existing callers' DOM is byte-identical to before Story 4.15 (AC9).
    expect(screen.getByRole('group', { name: 'Simulation controls' })).not.toHaveAttribute(
      'data-compact',
    );
    expect(screen.getByRole('button', { name: 'Play' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Next cycle' })).toBeEnabled();
  });

  it('compact renders data-compact="true" on the group, with the same accessible names', () => {
    renderTransport({ compact: true });
    expect(screen.getByRole('group', { name: 'Simulation controls' })).toHaveAttribute(
      'data-compact',
      'true',
    );
    expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next cycle' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Stop & reset' })).toBeInTheDocument();
  });

  it('disabled while paused disables Play and Next cycle, leaves Stop enabled and LIVE, and a click on either disabled button fires nothing', () => {
    const onPlayPause = vi.fn();
    const onStep = vi.fn();
    const onStop = vi.fn();
    renderTransport({ disabled: true, onPlayPause, onStep, onStop });

    const play = screen.getByRole('button', { name: 'Play' });
    const step = screen.getByRole('button', { name: 'Next cycle' });
    const stop = screen.getByRole('button', { name: 'Stop & reset' });

    expect(play).toBeDisabled();
    expect(step).toBeDisabled();
    expect(stop).toBeEnabled();

    // The `BattleEditorView.test.tsx` trap-6 idiom: `toBeDisabled()` pins the attribute; the click
    // proves no handler is reachable through it (React refuses a listener on a disabled element,
    // same as a real click would).
    fireEvent.click(play);
    fireEvent.click(step);
    expect(onPlayPause).not.toHaveBeenCalled();
    expect(onStep).not.toHaveBeenCalled();
    // The one behavioural claim of "Stop stays enabled" (3.12 FD5): its handler still fires.
    fireEvent.click(stop);
    expect(onStop).toHaveBeenCalledTimes(1);
  });

  it('axe: disabled while paused has no violations', async () => {
    const { container } = renderTransport({ disabled: true });
    expect((await axe(container)).violations).toEqual([]);
  });
});
