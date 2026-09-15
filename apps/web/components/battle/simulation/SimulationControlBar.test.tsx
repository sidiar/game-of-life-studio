import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import SimulationControlBar from './SimulationControlBar';

/**
 * `EditorStatusBar.test.tsx`'s shape (Task 1): one prop-set helper defaulting to the common case
 * — `status: 'paused'` — so a test about `'playing'` overrides exactly that.
 */
function renderBar(overrides: Partial<ComponentProps<typeof SimulationControlBar>> = {}) {
  return render(
    <SimulationControlBar
      status="paused"
      onPlayPause={vi.fn()}
      onStep={vi.fn()}
      onStop={vi.fn()}
      {...overrides}
    />,
  );
}

describe('SimulationControlBar', () => {
  it('renders three buttons named Play, Next cycle and Stop & reset inside a named group, while paused', () => {
    renderBar();

    expect(screen.getByRole('group', { name: 'Simulation controls' })).toBeInTheDocument();
    expect(screen.getAllByRole('button')).toHaveLength(3);
    expect(screen.getByRole('button', { name: 'Play' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Next cycle' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Stop & reset' })).toBeEnabled();
  });

  it('reads Pause, disables Next cycle with its title, and keeps Stop enabled, while playing', () => {
    renderBar({ status: 'playing' });

    expect(screen.getByRole('button', { name: 'Pause' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'Play' })).toBeNull();
    const step = screen.getByRole('button', { name: 'Next cycle' });
    expect(step).toBeDisabled();
    expect(step).toHaveAttribute('title', 'Available while paused');
    expect(screen.getByRole('button', { name: 'Stop & reset' })).toBeEnabled();
  });

  // FD1: no aria-pressed on the toggle — a control whose name states the action it will perform
  // is not a pressed-state toggle.
  it('carries no aria-pressed on the Play/Pause button in either state', () => {
    const { rerender } = renderBar();
    expect(screen.getByRole('button', { name: 'Play' })).not.toHaveAttribute('aria-pressed');

    rerender(
      <SimulationControlBar
        status="playing"
        onPlayPause={vi.fn()}
        onStep={vi.fn()}
        onStop={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: 'Pause' })).not.toHaveAttribute('aria-pressed');
  });

  it('Play press calls onPlayPause once, and neither onStep nor onStop', async () => {
    const user = userEvent.setup();
    const onPlayPause = vi.fn();
    const onStep = vi.fn();
    const onStop = vi.fn();
    renderBar({ onPlayPause, onStep, onStop });

    await user.click(screen.getByRole('button', { name: 'Play' }));

    expect(onPlayPause).toHaveBeenCalledTimes(1);
    expect(onStep).not.toHaveBeenCalled();
    expect(onStop).not.toHaveBeenCalled();
  });

  it('Next cycle press calls onStep once while paused', async () => {
    const user = userEvent.setup();
    const onStep = vi.fn();
    renderBar({ onStep });

    await user.click(screen.getByRole('button', { name: 'Next cycle' }));

    expect(onStep).toHaveBeenCalledTimes(1);
  });

  // Trap 1: a real `disabled` attribute means user-event does not dispatch a click at all.
  it('Next cycle press while playing fires nothing — the button is genuinely disabled', async () => {
    const user = userEvent.setup();
    const onStep = vi.fn();
    renderBar({ status: 'playing', onStep });

    await user.click(screen.getByRole('button', { name: 'Next cycle' }));

    expect(onStep).not.toHaveBeenCalled();
  });

  it('Stop & reset calls onStop once in both statuses', async () => {
    const user = userEvent.setup();
    const onStopPaused = vi.fn();
    const paused = renderBar({ onStop: onStopPaused });
    await user.click(screen.getByRole('button', { name: 'Stop & reset' }));
    expect(onStopPaused).toHaveBeenCalledTimes(1);
    paused.unmount();

    const onStopPlaying = vi.fn();
    renderBar({ status: 'playing', onStop: onStopPlaying });
    await user.click(screen.getByRole('button', { name: 'Stop & reset' }));
    expect(onStopPlaying).toHaveBeenCalledTimes(1);
  });

  // The Play/Pause button is the SAME element across the label flip — focus must survive it.
  it('keeps the same Play/Pause DOM element across a rerender from paused to playing', () => {
    const { rerender } = renderBar();
    const before = screen.getByRole('button', { name: 'Play' });

    rerender(
      <SimulationControlBar
        status="playing"
        onPlayPause={vi.fn()}
        onStep={vi.fn()}
        onStop={vi.fn()}
      />,
    );

    const after = screen.getByRole('button', { name: 'Pause' });
    expect(after).toBe(before);
  });

  it('tab order while paused is Play, Next cycle, Stop & reset', async () => {
    const user = userEvent.setup();
    renderBar();

    await user.tab();
    expect(screen.getByRole('button', { name: 'Play' })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: 'Next cycle' })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: 'Stop & reset' })).toHaveFocus();
    await user.tab();
    expect(document.body).toHaveFocus();
  });

  // Trap 10: while playing, Next cycle is `disabled` and drops out of the tab sequence entirely —
  // two stops, not three.
  it('tab order while playing skips the disabled Next cycle: Pause, Stop & reset', async () => {
    const user = userEvent.setup();
    renderBar({ status: 'playing' });

    await user.tab();
    expect(screen.getByRole('button', { name: 'Pause' })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: 'Stop & reset' })).toHaveFocus();
    await user.tab();
    expect(document.body).toHaveFocus();
  });

  it('Enter and Space on Play both fire onPlayPause once each', async () => {
    const user = userEvent.setup();
    const onPlayPause = vi.fn();
    renderBar({ onPlayPause });

    screen.getByRole('button', { name: 'Play' }).focus();
    await user.keyboard('{Enter}');
    expect(onPlayPause).toHaveBeenCalledTimes(1);

    await user.keyboard(' ');
    expect(onPlayPause).toHaveBeenCalledTimes(2);
  });

  it('has no axe violations paused or playing', async () => {
    const paused = renderBar();
    expect((await axe(paused.container)).violations).toEqual([]);
    paused.unmount();

    const playing = renderBar({ status: 'playing' });
    expect((await axe(playing.container)).violations).toEqual([]);
  });
});
