import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { GRID_PRESETS } from '@/lib/battle/gridPresets';
import GridSizeControl, { type GridSizeControlProps } from './GridSizeControl';

/** The `SpeedControl.test.tsx` shape: one prop-set helper defaulting to the common case. */
function renderControl(overrides: Partial<GridSizeControlProps> = {}) {
  const onChange = vi.fn();
  const utils = render(
    <GridSizeControl
      value={{ cols: 100, rows: 60 }}
      onChange={onChange}
      disabled={false}
      {...overrides}
    />,
  );
  return { ...utils, onChange };
}

const slider = () => screen.getByRole('slider', { name: 'Grid dimensions' });

describe('GridSizeControl (Story 3.16)', () => {
  // AC2: ONE native range input over the four presets, named by a real `<label for>` and
  // announcing the true dimensions through `aria-valuetext`.
  it('renders one slider over the four presets, at index 1 for 100x60, announcing the size', () => {
    renderControl();

    expect(screen.getAllByRole('slider')).toHaveLength(1);
    const input = slider();
    expect(input).toHaveAttribute('type', 'range');
    expect(input).toHaveValue('1');
    expect(input).toHaveAttribute('min', '0');
    expect(input).toHaveAttribute('max', '3');
    expect(input).toHaveAttribute('step', '1');
    expect(input).toHaveAttribute('aria-valuetext', '100 by 60 cells');
  });

  // The index and the announced text must agree for every ladder member.
  it.each(GRID_PRESETS)('renders %o at its ladder index with matching valuetext', (preset) => {
    const index = GRID_PRESETS.indexOf(preset);
    renderControl({ value: preset });

    expect(slider()).toHaveValue(String(index));
    expect(slider()).toHaveAttribute('aria-valuetext', `${preset.cols} by ${preset.rows} cells`);
    expect(screen.getByText(`${preset.cols} × ${preset.rows}`)).toBeInTheDocument();
  });

  // AC3: `onChange` receives the SAME preset object reference (`toBe`), never a copy — so the
  // view can hand it to `sim.resizeLive` without building one.
  it('maps a change to index 2 to onChange(GRID_PRESETS[2]), exactly once, by reference', () => {
    const { onChange } = renderControl();

    fireEvent.change(slider(), { target: { value: '2' } });

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(GRID_PRESETS[2]);
    expect(onChange.mock.calls[0][0]).toBe(GRID_PRESETS[2]);
  });

  // AC5: a real `disabled` attribute, the hint always present and wired as the description.
  it('renders disabled with the hint always present and wired as the description', () => {
    const { rerender, onChange } = renderControl();
    expect(slider()).toBeEnabled();
    expect(screen.getByText('Adjustable while paused')).toBeInTheDocument();
    expect(slider()).toHaveAccessibleDescription('Adjustable while paused');

    rerender(<GridSizeControl value={{ cols: 100, rows: 60 }} onChange={onChange} disabled />);

    expect(slider()).toBeDisabled();
    expect(screen.getByText('Adjustable while paused')).toBeInTheDocument();
    expect(slider()).toHaveAccessibleDescription('Adjustable while paused');
  });

  // AC8 / FD4: an off-ladder size renders the TRUE dimensions and sits at thumb 0, without
  // throwing — the view's own 7x5 fixture exercises this on every mount.
  it('renders an off-preset size at thumb 0 with the true dimensions, without throwing', () => {
    expect(() => renderControl({ value: { cols: 7, rows: 5 } })).not.toThrow();

    expect(slider()).toHaveValue('0');
    expect(slider()).toHaveAttribute('aria-valuetext', '7 by 5 cells');
    expect(screen.getByText('7 × 5')).toBeInTheDocument();
  });

  it('has no axe violations enabled or disabled', async () => {
    const { container, unmount } = renderControl();
    expect((await axe(container)).violations).toEqual([]);
    unmount();

    const { container: disabledContainer } = renderControl({ disabled: true });
    expect((await axe(disabledContainer)).violations).toEqual([]);
  });
});
