import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import { displayColor, MAX_AGE_SHADE } from '@/lib/palette/displayColor';
import { PALETTE } from '@/lib/palette/paletteRegistry';
import ColorPickerField, { type ColorPickerFieldProps } from './ColorPickerField';

/** jsdom normalises an inline `hsl(...)` `style.background` to `rgb(...)` on the way in
 * (`OrganismLibrary.test.tsx`'s identical probe) — round-tripping through a throwaway element
 * gives the same normalisation the component's own inline style went through. */
function jsdomNormalizedColor(color: string): string {
  const probe = document.createElement('span');
  probe.style.background = color;
  return probe.style.background;
}

/** A real controlled round trip — the `DominanceField.test.tsx` harness shape — seeded at
 * `PALETTE[0].id` unless overridden. */
function ControlledHarness({
  seed = PALETTE[0].id,
  onChange,
}: { seed?: string; onChange?: (colorToken: string) => void } = {}) {
  const [value, setValue] = useState(seed);
  return (
    <ColorPickerField
      value={value}
      onChange={(next) => {
        onChange?.(next);
        setValue(next);
      }}
    />
  );
}

const radiogroup = () => screen.getByRole('radiogroup', { name: 'Organism Color' });
const radio = (name: string) => screen.getByRole('radio', { name });
const checkedRadio = () => screen.getByRole('radio', { checked: true });
const selectedName = () => document.querySelector('[data-selected-name]') as HTMLElement;
const selectedSwatch = () => document.querySelector('[data-selected-swatch]') as HTMLElement;

describe('ColorPickerField', () => {
  // (a)
  it('is a fieldset radiogroup named "Organism Color", described, with PALETTE.length radios in registry order', () => {
    render(<ColorPickerField value={PALETTE[0].id} onChange={() => {}} />);

    const group = radiogroup();
    expect(group.tagName).toBe('FIELDSET');
    const describedBy = group.getAttribute('aria-describedby');
    if (describedBy === null) throw new Error('aria-describedby is absent');
    expect(document.getElementById(describedBy)).toHaveTextContent(
      'Pick any color — colors are reusable.',
    );

    const radios = within(group).getAllByRole('radio');
    expect(radios).toHaveLength(PALETTE.length);
    expect(radios.every((r) => (r as HTMLInputElement).disabled === false)).toBe(true);
    // DOM order == registry order (the AC) — checked by name, in order, never a literal count
    // alone.
    PALETTE.forEach((entry, i) => {
      expect(radios[i]).toHaveAccessibleName(entry.name);
    });
  });

  // (b)
  it('initial state: PALETTE[0] checked, named, painted and marked', () => {
    render(<ColorPickerField value={PALETTE[0].id} onChange={() => {}} />);

    const checked = checkedRadio();
    expect(checked).toHaveAccessibleName(PALETTE[0].name);
    expect(selectedName()).toHaveTextContent(PALETTE[0].name);

    const swatch = selectedSwatch();
    expect(swatch).toHaveAttribute('aria-hidden', 'true');
    expect(swatch.style.background).not.toBe('');
    expect(swatch.style.background).toBe(
      jsdomNormalizedColor(displayColor(PALETTE[0].id, MAX_AGE_SHADE)),
    );

    const marks = screen.getAllByText('✓');
    expect(marks).toHaveLength(1);
    const swatchLabel = marks[0].closest('[data-color-token]');
    expect(swatchLabel).toHaveAttribute('data-color-token', PALETTE[0].id);
  });

  // (c)
  it('clicking a swatch selects it, moving the name, the mark and both swatch backgrounds together', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ControlledHarness onChange={onChange} />);

    await user.click(radio(PALETTE[3].name));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(PALETTE[3].id);
    expect(checkedRadio()).toHaveAccessibleName(PALETTE[3].name);
    expect(selectedName()).toHaveTextContent(PALETTE[3].name);

    // The ✓ (the third selection channel) moved too — a mark left on the old swatch would
    // otherwise pass on the radio and name assertions alone.
    const marks = screen.getAllByText('✓');
    expect(marks).toHaveLength(1);
    expect(marks[0].closest('[data-color-token]')).toHaveAttribute(
      'data-color-token',
      PALETTE[3].id,
    );

    const largeBackground = selectedSwatch().style.background;
    const smallSwatch = document.querySelector(
      `[data-color-token="${PALETTE[3].id}"]`,
    ) as HTMLElement;
    expect(largeBackground).not.toBe('');
    expect(largeBackground).toBe(smallSwatch.style.background);
  });

  // (d)
  it('re-selecting the current colour is a no-op', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ColorPickerField value={PALETTE[0].id} onChange={onChange} />);

    await user.click(radio(PALETTE[0].name));

    expect(onChange).not.toHaveBeenCalled();
  });

  // (e)
  it('arrow keys move focus and select through onChange', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ControlledHarness onChange={onChange} />);

    radio(PALETTE[0].name).focus();
    await user.keyboard('{ArrowRight}');
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenLastCalledWith(PALETTE[1].id);
    expect(radio(PALETTE[1].name)).toBeChecked();
    expect(radio(PALETTE[1].name)).toHaveFocus();

    await user.keyboard('{ArrowLeft}');
    expect(onChange).toHaveBeenCalledTimes(2);
    expect(onChange).toHaveBeenLastCalledWith(PALETTE[0].id);
    expect(radio(PALETTE[0].name)).toBeChecked();
  });

  it('arrow-right wraps from the last entry back to the first', async () => {
    const user = userEvent.setup();
    render(<ControlledHarness seed={PALETTE[PALETTE.length - 1].id} />);

    radio(PALETTE[PALETTE.length - 1].name).focus();
    await user.keyboard('{ArrowRight}');

    expect(radio(PALETTE[0].name)).toBeChecked();
  });

  // (f)
  it('is one tab stop: the checked radio, not every radio', async () => {
    const user = userEvent.setup();
    render(
      <>
        <button type="button">before</button>
        <ControlledHarness />
        <button type="button">after</button>
      </>,
    );

    screen.getByRole('button', { name: 'before' }).focus();
    await user.tab();
    expect(checkedRadio()).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: 'after' })).toHaveFocus();
  });

  // (g)
  it('is controlled: a click leaves the prop value checked until value changes; rerender moves it', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { rerender } = render(<ColorPickerField value={PALETTE[0].id} onChange={onChange} />);

    await user.click(radio(PALETTE[2].name));
    expect(checkedRadio()).toHaveAccessibleName(PALETTE[0].name);

    rerender(<ColorPickerField value={PALETTE[2].id} onChange={onChange} />);
    expect(checkedRadio()).toHaveAccessibleName(PALETTE[2].name);
    expect(selectedName()).toHaveTextContent(PALETTE[2].name);
  });

  // (h)
  it('every swatch paints the identity shade of its own token', () => {
    render(<ColorPickerField value={PALETTE[0].id} onChange={() => {}} />);

    for (const entry of PALETTE) {
      const label = document.querySelector(`[data-color-token="${entry.id}"]`) as HTMLElement;
      expect(label.style.background).not.toBe('');
      expect(label.style.background).toBe(
        jsdomNormalizedColor(displayColor(entry.id, MAX_AGE_SHADE)),
      );
    }
  });

  // (i)
  it('a label click selects exactly once (no double fire from the wrapped radio)', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ColorPickerField value={PALETTE[0].id} onChange={onChange} />);

    const label = document.querySelector(`[data-color-token="${PALETTE[4].id}"]`) as HTMLElement;
    await user.click(label);

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(PALETTE[4].id);
  });

  // (j)
  it('has no axe violations at the default and at a later swatch', async () => {
    const props: ColorPickerFieldProps = { value: PALETTE[0].id, onChange: () => {} };
    const { container: firstContainer, unmount: unmountFirst } = render(
      <ColorPickerField {...props} />,
    );
    expect((await axe(firstContainer)).violations).toEqual([]);
    unmountFirst();

    const { container: secondContainer, unmount: unmountSecond } = render(
      <ColorPickerField value={PALETTE[7].id} onChange={() => {}} />,
    );
    expect((await axe(secondContainer)).violations).toEqual([]);
    unmountSecond();
  });
});
