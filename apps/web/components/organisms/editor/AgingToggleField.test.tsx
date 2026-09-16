import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import { MAX_AGE_SHADE } from '@/lib/palette/displayColor';
import { DEFAULT_COLOR_TOKEN, PALETTE } from '@/lib/palette/paletteRegistry';
import AgingToggleField, { type AgingToggleFieldProps } from './AgingToggleField';

/** A real controlled round trip — the `DominanceField.test.tsx:9-27` shape. */
function ControlledHarness({
  colorToken = DEFAULT_COLOR_TOKEN,
  onChange,
}: Partial<Pick<AgingToggleFieldProps, 'colorToken' | 'onChange'>> = {}) {
  const [value, setValue] = useState(false);
  return (
    <AgingToggleField
      value={value}
      colorToken={colorToken}
      onChange={(next) => {
        onChange?.(next);
        setValue(next);
      }}
    />
  );
}

/** The whole draft shape, for the "flipping writes only the flag" test (k) — the draft is
 * surfaced as text so the test can assert `colorToken` is byte-identical across a flip without
 * re-deriving a colour string that jsdom's `cssstyle` might normalise. */
function DraftHarness() {
  const [draft, setDraft] = useState({ agingEnabled: false, colorToken: DEFAULT_COLOR_TOKEN });
  return (
    <>
      <AgingToggleField
        value={draft.agingEnabled}
        colorToken={draft.colorToken}
        onChange={(agingEnabled) => setDraft((d) => ({ ...d, agingEnabled }))}
      />
      <output data-testid="draft-color-token">{draft.colorToken}</output>
    </>
  );
}

const toggle = () => screen.getByRole('switch', { name: 'Aging Degradation' });

describe('AgingToggleField', () => {
  // (a)
  it('names the switch "Aging Degradation" through aria-labelledby, is a real button, and has no aria-label', () => {
    render(<AgingToggleField value={false} onChange={() => {}} colorToken={DEFAULT_COLOR_TOKEN} />);

    const button = toggle();
    expect(button.tagName).toBe('BUTTON');
    expect(button).toHaveAttribute('type', 'button');
    expect(button).toHaveAttribute('aria-checked', 'false');
    expect(button).not.toBeChecked();
    expect(button).not.toHaveAttribute('aria-label');

    const labelledBy = button.getAttribute('aria-labelledby');
    const htmlFor = button.getAttribute('id');
    if (labelledBy === null || htmlFor === null) {
      throw new Error('aria-labelledby or id is absent');
    }
    const label = document.getElementById(labelledBy);
    expect(label?.tagName).toBe('LABEL');
    expect(label).toHaveAttribute('for', htmlFor);
    expect(label).toHaveTextContent('Aging Degradation');
  });

  // (b)
  it('aria-describedby points at the description text', () => {
    render(<AgingToggleField value={false} onChange={() => {}} colorToken={DEFAULT_COLOR_TOKEN} />);

    const describedBy = toggle().getAttribute('aria-describedby');
    if (describedBy === null) throw new Error('aria-describedby is absent');
    expect(document.getElementById(describedBy)).toHaveTextContent(
      'Cells increase saturation as they age',
    );
  });

  // (c)
  it('click toggles: onChange fires once each way, and the harness reflects checked/text state', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ControlledHarness onChange={onChange} />);

    await user.click(toggle());
    expect(onChange).toHaveBeenNthCalledWith(1, true);
    expect(toggle()).toBeChecked();
    expect(screen.getByText('On')).toBeInTheDocument();

    await user.click(toggle());
    expect(onChange).toHaveBeenNthCalledWith(2, false);
    expect(toggle()).not.toBeChecked();
    expect(screen.getByText('Off')).toBeInTheDocument();
  });

  // (d)
  it('label click toggles exactly once (no double fire from label activation + button click)', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ControlledHarness onChange={onChange} />);

    await user.click(screen.getByText('Aging Degradation'));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(true);
  });

  // (e)
  it('Space and Enter toggle the focused switch; ArrowRight does nothing', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ControlledHarness onChange={onChange} />);

    toggle().focus();
    await user.keyboard(' ');
    expect(onChange).toHaveBeenLastCalledWith(true);

    await user.keyboard('{Enter}');
    expect(onChange).toHaveBeenLastCalledWith(false);

    onChange.mockClear();
    await user.keyboard('{ArrowRight}');
    expect(onChange).not.toHaveBeenCalled();
  });

  // (f)
  it('is controlled: a click with a value prop that never updates leaves it unchecked; a rerender moves it', () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <AgingToggleField value={false} onChange={onChange} colorToken={DEFAULT_COLOR_TOKEN} />,
    );

    toggle().click();
    expect(onChange).toHaveBeenCalledWith(true);
    expect(toggle()).toHaveAttribute('aria-checked', 'false');

    rerender(<AgingToggleField value onChange={onChange} colorToken={DEFAULT_COLOR_TOKEN} />);
    expect(toggle()).toBeChecked();
    expect(screen.getByText('On')).toBeInTheDocument();
  });

  // (g)
  it('the state text is hidden from assistive technology', () => {
    render(<AgingToggleField value={false} onChange={() => {}} colorToken={DEFAULT_COLOR_TOKEN} />);

    expect(screen.getByText('Off').closest('[aria-hidden="true"]')).not.toBeNull();
  });

  // (h)
  it('the strip has exactly MAX_AGE_SHADE + 1 cells, hidden from AT, ordered 0..7', () => {
    const { container } = render(
      <AgingToggleField value={false} onChange={() => {}} colorToken={DEFAULT_COLOR_TOKEN} />,
    );

    const strip = container.querySelector('[data-aging-example]');
    expect(strip).toHaveAttribute('aria-hidden', 'true');
    const cells = strip!.querySelectorAll('[data-age]');
    expect(cells).toHaveLength(MAX_AGE_SHADE + 1);
    expect(Array.from(cells).map((el) => el.getAttribute('data-age'))).toEqual(
      Array.from({ length: MAX_AGE_SHADE + 1 }, (_, i) => String(i)),
    );
  });

  // (i)
  it('strip is flat when Off and a ramp when On; the last cell is unchanged between states', () => {
    const { container, rerender } = render(
      <AgingToggleField value={false} onChange={() => {}} colorToken={DEFAULT_COLOR_TOKEN} />,
    );

    const readCells = () =>
      Array.from(container.querySelectorAll('[data-age]')).map(
        (el) => (el as HTMLElement).style.backgroundColor,
      );

    const offColors = readCells();
    expect(new Set(offColors).size).toBe(1);

    rerender(<AgingToggleField value onChange={() => {}} colorToken={DEFAULT_COLOR_TOKEN} />);
    const onColors = readCells();
    expect(new Set(onColors).size).toBe(MAX_AGE_SHADE + 1);
    expect(onColors[MAX_AGE_SHADE]).toBe(offColors[MAX_AGE_SHADE]);
  });

  // (j)
  it('a colorToken change repaints the strip', () => {
    const { container, rerender } = render(
      <AgingToggleField value onChange={() => {}} colorToken={DEFAULT_COLOR_TOKEN} />,
    );

    const lastCell = () =>
      (container.querySelectorAll('[data-age]')[MAX_AGE_SHADE] as HTMLElement).style
        .backgroundColor;
    const before = lastCell();

    rerender(<AgingToggleField value onChange={() => {}} colorToken={PALETTE[1].id} />);
    expect(lastCell()).not.toBe(before);
  });

  // (k)
  it('flipping the switch writes only agingEnabled, never colorToken', async () => {
    const user = userEvent.setup();
    render(<DraftHarness />);

    expect(screen.getByTestId('draft-color-token')).toHaveTextContent(DEFAULT_COLOR_TOKEN);

    await user.click(toggle());

    expect(toggle()).toBeChecked();
    expect(screen.getByTestId('draft-color-token')).toHaveTextContent(DEFAULT_COLOR_TOKEN);
  });

  // (l)
  describe('has no axe accessibility violations', () => {
    it.each([false, true])('at value %s', async (v) => {
      const { container, unmount } = render(
        <AgingToggleField value={v} onChange={() => {}} colorToken={DEFAULT_COLOR_TOKEN} />,
      );

      expect((await axe(container)).violations).toEqual([]);
      unmount();
    });
  });
});
