import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { SPEED_LADDER, speedIndex } from '@/lib/battle/simulationSpeed';
import SpeedControl, { type SpeedControlProps } from './SpeedControl';

/**
 * `SimulationControlBar.test.tsx`'s shape: one prop-set helper defaulting to the common case —
 * `genPerSec: 10`, the ladder's default (FR-8.12) — so a test about another speed overrides
 * exactly that.
 */
function renderControl(overrides: Partial<SpeedControlProps> = {}) {
  const onChange = vi.fn();
  const utils = render(<SpeedControl genPerSec={10} onChange={onChange} {...overrides} />);
  return { ...utils, onChange };
}

const slider = () => screen.getByRole('slider', { name: 'Generations per second' });

describe('SpeedControl (Story 3.13)', () => {
  // AC2 / FD1: ONE native range input whose value is the ladder INDEX (`min 0`, `max 4`,
  // `step 1`), named by its visible label and announcing the SPEED through `aria-valuetext` — a
  // screen reader that read the index would hear "3 of 4" for 10 gen/sec.
  it('renders one slider over the ladder, at index 3 for the default 10 gen/sec, announcing the speed', () => {
    renderControl();

    expect(screen.getAllByRole('slider')).toHaveLength(1);
    const input = slider();
    expect(input).toHaveAttribute('type', 'range');
    expect(input).toHaveValue('3');
    expect(input).toHaveAttribute('min', '0');
    expect(input).toHaveAttribute('max', '4');
    expect(input).toHaveAttribute('step', '1');
    expect(input).toHaveAttribute('aria-valuetext', '10 generations per second');
  });

  // The rendered value and the valuetext must agree for every member — a control that indexes
  // the ladder can drift from the label it prints if either side is spelled separately.
  it.each(SPEED_LADDER)('renders %i gen/s at its ladder index with matching valuetext', (speed) => {
    renderControl({ genPerSec: speed });

    expect(slider()).toHaveValue(String(speedIndex(speed)));
    expect(slider()).toHaveAttribute('aria-valuetext', `${speed} generations per second`);
    expect(screen.getByText(`${speed} gen/s`)).toBeInTheDocument();
  });

  // Trap 2: jsdom does not step a range input from the keyboard, so `fireEvent.change` is how a
  // unit test moves it (keyboard semantics are pinned in Playwright). The handler maps the
  // event's INDEX back through `SPEED_LADDER` — the parent receives a speed, never a position.
  it('maps a change to index 4 to onChange(20), exactly once', () => {
    const { onChange } = renderControl();

    fireEvent.change(slider(), { target: { value: '4' } });

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(20);
  });

  it('maps a change to index 0 to onChange(1)', () => {
    const { onChange } = renderControl();

    fireEvent.change(slider(), { target: { value: '0' } });

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(1);
  });

  // Trap 9: CONTROLLED by `genPerSec`, never `defaultValue`. A parent that does not update the
  // prop keeps the slider where it was; a parent that does moves it. Both halves matter — under
  // `defaultValue` the first half fails (the DOM keeps the user's value) and Run -> Lab -> Run's
  // re-seed from `startingSpeed` would be silently missed.
  it('is controlled: the value follows the genPerSec prop, not the last change event', () => {
    const { onChange, rerender } = renderControl();

    fireEvent.change(slider(), { target: { value: '4' } });
    expect(onChange).toHaveBeenCalledWith(20);
    expect(slider()).toHaveValue('3');

    rerender(<SpeedControl genPerSec={20} onChange={onChange} />);
    expect(slider()).toHaveValue('4');
    expect(slider()).toHaveAttribute('aria-valuetext', '20 generations per second');
    expect(screen.getByText('20 gen/s')).toBeInTheDocument();
  });

  // FD2 (a): a REAL `<label for>` association — the visible text and the accessible name are one
  // string. This reddens under `aria-label`: `getByLabelText` resolves through the label element,
  // not the attribute.
  it('names the slider through a real <label for> reading "Generations per second"', () => {
    renderControl();

    const input = screen.getByLabelText('Generations per second');
    expect(input).toBe(slider());
    const label = screen.getByText('Generations per second');
    expect(label.tagName).toBe('LABEL');
    expect(label).toHaveAttribute('for', input.id);
  });

  // Trap 5: the value and the five marks are decorative — the slider's own `aria-valuetext`
  // already carries the speed, and unhidden text here would be announced a second time.
  it('hides the value and the five ladder marks from assistive technology', () => {
    const { container } = renderControl();

    expect(screen.getByText('10 gen/s')).toHaveAttribute('aria-hidden', 'true');
    const marks = Array.from(container.querySelectorAll('[aria-hidden="true"] > span'));
    expect(marks.map((mark) => mark.textContent)).toEqual(['1', '2', '5', '10', '20']);
  });

  // AC7: axe-clean at the bottom, the default and the top of the ladder — the `unmount` series
  // pattern, one mount per position so no stale DOM leaks between scans.
  it('has no axe violations at ladder positions 0, 3 and 4', async () => {
    for (const speed of [1, 10, 20] as const) {
      const { container, unmount } = renderControl({ genPerSec: speed });
      expect((await axe(container)).violations).toEqual([]);
      unmount();
    }
  });
});
