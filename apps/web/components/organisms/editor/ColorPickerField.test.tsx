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

// Story 4.9: every render now needs `usersByToken` and `seedValue`. A module-level empty map for
// the 4.8 cases that do not care about reuse, mechanically threaded through every render below.
const NO_USERS: ReadonlyMap<string, readonly string[]> = new Map();

/** A real controlled round trip — the `DominanceField.test.tsx` harness shape — seeded at
 * `PALETTE[0].id` unless overridden. `seedValue` defaults to the harness's own `seed` (FD2: the
 * token it opened on), overridable independently for the (n) "silent on the seed" case. */
function ControlledHarness({
  seed = PALETTE[0].id,
  seedValue,
  usersByToken = NO_USERS,
  onChange,
}: {
  seed?: string;
  seedValue?: string;
  usersByToken?: ReadonlyMap<string, readonly string[]>;
  onChange?: (colorToken: string) => void;
} = {}) {
  const [value, setValue] = useState(seed);
  return (
    <ColorPickerField
      value={value}
      onChange={(next) => {
        onChange?.(next);
        setValue(next);
      }}
      usersByToken={usersByToken}
      seedValue={seedValue ?? seed}
    />
  );
}

/** The renders that pass a bare `value`/`onChange` pair below all get the two new required props
 * mechanically added through this helper, so the 4.8 cases stay otherwise unedited. */
function renderField(overrides: {
  value: string;
  onChange: (colorToken: string) => void;
  usersByToken?: ReadonlyMap<string, readonly string[]>;
  seedValue?: string;
}) {
  const { value, onChange, usersByToken = NO_USERS, seedValue = PALETTE[0].id } = overrides;
  return render(
    <ColorPickerField
      value={value}
      onChange={onChange}
      usersByToken={usersByToken}
      seedValue={seedValue}
    />,
  );
}

const group = () => screen.getByRole('group', { name: 'Organism Color' });
const toggle = () => screen.getByRole('button', { name: 'Change Color' });
const radiogroup = () => screen.getByRole('radiogroup', { name: 'Organism Color' });
const radio = (name: string) => screen.getByRole('radio', { name });
const checkedRadio = () => screen.getByRole('radio', { checked: true });
const selectedName = () => document.querySelector('[data-selected-name]') as HTMLElement;
const selectedSwatch = () => document.querySelector('[data-selected-swatch]') as HTMLElement;

/** The mockup's disclosure (FD7): the palette is collapsed until "Change Color ▾" opens it, so
 * every test that reaches a radio goes through the button first. */
async function openPalette(user: ReturnType<typeof userEvent.setup>) {
  await user.click(toggle());
  expect(toggle()).toHaveAttribute('aria-expanded', 'true');
}

describe('ColorPickerField', () => {
  // (a)
  it('is a fieldset group named "Organism Color" whose radiogroup, once opened, is described and holds PALETTE.length radios in registry order', async () => {
    const user = userEvent.setup();
    renderField({ value: PALETTE[0].id, onChange: () => {} });

    expect(group().tagName).toBe('FIELDSET');
    await openPalette(user);

    const grid = radiogroup();
    expect(grid.tagName).not.toBe('FIELDSET');
    const describedBy = grid.getAttribute('aria-describedby');
    if (describedBy === null) throw new Error('aria-describedby is absent');
    // AC4: the description grows the mockup's second sentence.
    expect(document.getElementById(describedBy)).toHaveTextContent(
      "Pick any color — colors are reusable. If another organism already uses your pick, a non-blocking warning appears (they'll share a color on the grid).",
    );

    const radios = within(grid).getAllByRole('radio');
    expect(radios).toHaveLength(PALETTE.length);
    expect(radios.every((r) => (r as HTMLInputElement).disabled === false)).toBe(true);
    // DOM order == registry order (the AC) — checked by name, in order, never a literal count
    // alone.
    PALETTE.forEach((entry, i) => {
      expect(radios[i]).toHaveAccessibleName(entry.name);
    });
  });

  // (b)
  it('initial state: PALETTE[0] checked, named, painted and marked', async () => {
    const user = userEvent.setup();
    renderField({ value: PALETTE[0].id, onChange: () => {} });
    await openPalette(user);

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
    await openPalette(user);

    await user.click(radio(PALETTE[3].name));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(PALETTE[3].id);
    expect(selectedName()).toHaveTextContent(PALETTE[3].name);
    // A pointer pick collapses the palette (FD7) — reopen it to read the radios back.
    expect(toggle()).toHaveAttribute('aria-expanded', 'false');
    await openPalette(user);
    expect(checkedRadio()).toHaveAccessibleName(PALETTE[3].name);

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
    renderField({ value: PALETTE[0].id, onChange });
    await openPalette(user);

    await user.click(radio(PALETTE[0].name));

    expect(onChange).not.toHaveBeenCalled();
  });

  // (e)
  it('arrow keys move focus and select through onChange', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ControlledHarness onChange={onChange} />);
    await openPalette(user);

    radio(PALETTE[0].name).focus();
    await user.keyboard('{ArrowRight}');
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenLastCalledWith(PALETTE[1].id);
    expect(radio(PALETTE[1].name)).toBeChecked();
    expect(radio(PALETTE[1].name)).toHaveFocus();
    // A keyboard pick leaves the palette open (FD7): the roving focus stays where it is.
    expect(toggle()).toHaveAttribute('aria-expanded', 'true');

    await user.keyboard('{ArrowLeft}');
    expect(onChange).toHaveBeenCalledTimes(2);
    expect(onChange).toHaveBeenLastCalledWith(PALETTE[0].id);
    expect(radio(PALETTE[0].name)).toBeChecked();
    expect(toggle()).toHaveAttribute('aria-expanded', 'true');
  });

  it('arrow-right wraps from the last entry back to the first', async () => {
    const user = userEvent.setup();
    render(<ControlledHarness seed={PALETTE[PALETTE.length - 1].id} />);
    await openPalette(user);

    radio(PALETTE[PALETTE.length - 1].name).focus();
    await user.keyboard('{ArrowRight}');

    expect(radio(PALETTE[0].name)).toBeChecked();
  });

  // (f)
  it('is one tab stop collapsed (the button) and two open (the button, then the checked radio only)', async () => {
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
    expect(toggle()).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: 'after' })).toHaveFocus();

    await openPalette(user);
    toggle().focus();
    await user.tab();
    expect(checkedRadio()).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: 'after' })).toHaveFocus();
  });

  // (k) — FD7, the disclosure itself.
  it('starts collapsed: no radio is reachable, the button says so, and it toggles both ways', async () => {
    const user = userEvent.setup();
    renderField({ value: PALETTE[0].id, onChange: () => {} });

    expect(toggle()).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument();
    expect(screen.queryAllByRole('radio')).toHaveLength(0);
    // `aria-controls` names the grid, hidden or not.
    const controls = toggle().getAttribute('aria-controls');
    if (controls === null) throw new Error('aria-controls is absent');
    expect(document.getElementById(controls)).toHaveAttribute('hidden');

    await openPalette(user);
    expect(document.getElementById(controls)).not.toHaveAttribute('hidden');
    expect(radiogroup()).toBe(document.getElementById(controls));

    await user.click(toggle());
    expect(toggle()).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument();
  });

  // (l) — FD7: a pointer pick collapses the palette and hands focus to the button, never `<body>`.
  it('a pointer pick collapses the palette and focuses the button', async () => {
    const user = userEvent.setup();
    render(<ControlledHarness />);
    await openPalette(user);

    await user.click(radio(PALETTE[5].name));

    expect(toggle()).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument();
    expect(toggle()).toHaveFocus();
    expect(selectedName()).toHaveTextContent(PALETTE[5].name);
  });

  // (g)
  it('is controlled: a click leaves the prop value checked until value changes; rerender moves it', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { rerender } = renderField({ value: PALETTE[0].id, onChange });
    await openPalette(user);

    await user.click(radio(PALETTE[2].name));
    await openPalette(user);
    expect(checkedRadio()).toHaveAccessibleName(PALETTE[0].name);

    rerender(
      <ColorPickerField
        value={PALETTE[2].id}
        onChange={onChange}
        usersByToken={NO_USERS}
        seedValue={PALETTE[0].id}
      />,
    );
    expect(checkedRadio()).toHaveAccessibleName(PALETTE[2].name);
    expect(selectedName()).toHaveTextContent(PALETTE[2].name);
  });

  // (h)
  it('every swatch paints the identity shade of its own token', () => {
    renderField({ value: PALETTE[0].id, onChange: () => {} });

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
    renderField({ value: PALETTE[0].id, onChange });
    await openPalette(user);

    const label = document.querySelector(`[data-color-token="${PALETTE[4].id}"]`) as HTMLElement;
    await user.click(label);

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(PALETTE[4].id);
  });

  // (j)
  it('has no axe violations collapsed at the default and open at a later swatch', async () => {
    const user = userEvent.setup();
    const props: ColorPickerFieldProps = {
      value: PALETTE[0].id,
      onChange: () => {},
      usersByToken: NO_USERS,
      seedValue: PALETTE[0].id,
    };
    const { container: firstContainer, unmount: unmountFirst } = render(
      <ColorPickerField {...props} />,
    );
    expect((await axe(firstContainer)).violations).toEqual([]);
    unmountFirst();

    const { container: secondContainer, unmount: unmountSecond } = renderField({
      value: PALETTE[7].id,
      onChange: () => {},
    });
    await openPalette(user);
    expect((await axe(secondContainer)).violations).toEqual([]);
    unmountSecond();
  });

  // Story 4.9 — the fixture reused by cases (4.9 k)-(4.9 q); prefixed because 4.8's FD7 cases
  // above already hold (k) and (l). Names are literals here — they are test data, not `PALETTE`
  // values.
  const USERS: ReadonlyMap<string, readonly string[]> = new Map([
    [PALETTE[0].id, ["Conway's Classic"]],
    [PALETTE[2].id, ['A', 'B']],
    [PALETTE[3].id, ['A', 'B', 'C']],
  ]);

  // (4.9 k)
  it('warns on a colliding pick', async () => {
    const user = userEvent.setup();
    render(<ControlledHarness seed={PALETTE[1].id} usersByToken={USERS} />);
    await openPalette(user);

    await user.click(radio(PALETTE[0].name));

    expect(screen.getByRole('status')).toHaveTextContent(
      "Conway's Classic already uses this color.",
    );
    // The pick proceeded exactly as an unwarned one: the chip moved with it.
    expect(selectedName()).toHaveTextContent(PALETTE[0].name);
    // Reopen: a pointer pick collapsed the palette (FD7).
    await openPalette(user);
    expect(radio(PALETTE[0].name)).toBeChecked();
    expect(document.querySelector('[aria-invalid]')).toBeNull();
    const radios = within(radiogroup()).getAllByRole('radio');
    expect(radios).toHaveLength(PALETTE.length);
    expect(radios.every((r) => (r as HTMLInputElement).disabled === false)).toBe(true);
  });

  // (4.9 l)
  it('the sentence scales with the number of users', async () => {
    const user = userEvent.setup();
    render(<ControlledHarness seed={PALETTE[1].id} usersByToken={USERS} />);
    await openPalette(user);

    await user.click(radio(PALETTE[2].name));
    expect(screen.getByRole('status')).toHaveTextContent('A and B already use this color.');

    await openPalette(user);
    await user.click(radio(PALETTE[3].name));
    expect(screen.getByRole('status')).toHaveTextContent('A, B and 1 more already use this color.');
  });

  // (4.9 m)
  it('clears on a non-conflicting pick', async () => {
    const user = userEvent.setup();
    render(<ControlledHarness seed={PALETTE[1].id} usersByToken={USERS} />);
    await openPalette(user);
    await user.click(radio(PALETTE[0].name));
    expect(screen.getByRole('status')).not.toBeEmptyDOMElement();

    await openPalette(user);
    await user.click(radio(PALETTE[5].name));

    expect(screen.getByRole('status')).toBeEmptyDOMElement();
    expect(document.querySelector('[data-color-reuse-warning]')).toBeNull();
  });

  // (4.9 n)
  it('is silent on the seed, even when it is in use', async () => {
    const user = userEvent.setup();

    // Direct: seeded and valued at the same in-use token.
    const direct = renderField({
      value: PALETTE[0].id,
      onChange: () => {},
      usersByToken: USERS,
      seedValue: PALETTE[0].id,
    });
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
    direct.unmount();

    // Through the harness: pick something else (warns), then re-pick the seed (FD2 — silent).
    render(<ControlledHarness seed={PALETTE[0].id} usersByToken={USERS} />);
    await openPalette(user);
    await user.click(radio(PALETTE[2].name));
    expect(screen.getByRole('status')).toHaveTextContent('A and B already use this color.');

    await openPalette(user);
    await user.click(radio(PALETTE[0].name));
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
  });

  // (4.9 o)
  it('marks every in-use swatch with the dot, and the accessible name never gains it', async () => {
    const user = userEvent.setup();
    render(<ControlledHarness seed={PALETTE[1].id} usersByToken={USERS} />);
    await openPalette(user);

    for (const entry of PALETTE) {
      const label = document.querySelector(`[data-color-token="${entry.id}"]`);
      const expected =
        entry.id === PALETTE[0].id || entry.id === PALETTE[2].id || entry.id === PALETTE[3].id
          ? 'true'
          : 'false';
      expect(label).toHaveAttribute('data-in-use', expected);
    }

    // jsdom does not compute generated content, so this cannot see a `::before` glyph join the
    // name — the browser-side guard is the e2e `toHaveAccessibleName` (Story 4.9 review).
    expect(checkedRadio()).toHaveAccessibleName(PALETTE[1].name);
  });

  // (4.9 p)
  it('the status region is mounted before any warning exists', () => {
    renderField({ value: PALETTE[0].id, onChange: () => {} });

    expect(screen.getByRole('status')).toBeEmptyDOMElement();
  });

  // (4.9 q)
  it('has no axe violations with the warning visible and the dot painted', async () => {
    const user = userEvent.setup();
    const { container } = render(<ControlledHarness seed={PALETTE[1].id} usersByToken={USERS} />);
    await openPalette(user);
    await user.click(radio(PALETTE[0].name));

    expect((await axe(container)).violations).toEqual([]);
  });
});
