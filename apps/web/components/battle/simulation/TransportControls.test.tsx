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
    expect(screen.getByRole('group', { name: 'Simulation controls' })).not.toHaveAttribute(
      'data-compact',
      'true',
    );
    expect(screen.getByRole('button', { name: 'Play' })).toBeEnabled();
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

  it('disabled while paused disables Play and Next cycle, leaves Stop enabled, and a click fires nothing', () => {
    const onPlayPause = vi.fn();
    renderTransport({ disabled: true, onPlayPause });

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
    expect(onPlayPause).not.toHaveBeenCalled();
  });

  it('axe: disabled while paused has no violations', async () => {
    const { container } = renderTransport({ disabled: true });
    expect((await axe(container)).violations).toEqual([]);
  });
});
