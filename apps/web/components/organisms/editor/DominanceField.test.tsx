import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import { MAX_DOMINANCE, MIN_DOMINANCE, NEW_ORGANISM_DOMINANCE } from '@gol/domain';
import DominanceField, { type DominanceFieldProps } from './DominanceField';

/** A real controlled round trip — the shape `<OrganismEditorModal>`'s `setDominance` provides —
 * the `OrganismNameField.test.tsx` / `BattleNameField.test.tsx` harness shape. */
function ControlledHarness({ min, max }: Pick<DominanceFieldProps, 'min' | 'max'> = {}) {
  const [value, setValue] = useState(NEW_ORGANISM_DOMINANCE);
  return <DominanceField value={value} onChange={setValue} min={min} max={max} />;
}

const slider = () => screen.getByRole('slider', { name: 'Dominance' });
const textbox = () => screen.getByRole('textbox', { name: 'Dominance value' });

describe('DominanceField', () => {
  // (a)
  it('names the slider "Dominance" through a real <label for> (AC1, AC7)', () => {
    render(<DominanceField value={NEW_ORGANISM_DOMINANCE} onChange={() => {}} />);

    const input = slider();
    expect(input).toHaveAttribute('type', 'range');
    expect(input).toHaveAttribute('min', String(MIN_DOMINANCE));
    expect(input).toHaveAttribute('max', String(MAX_DOMINANCE));
    expect(input).toHaveAttribute('step', '1');
    expect(input).toHaveValue(String(NEW_ORGANISM_DOMINANCE));
    const label = screen.getByText('Dominance');
    expect(label.tagName).toBe('LABEL');
    expect(label).toHaveAttribute('for', input.id);
  });

  // (b) FD2's pin — the FAILING case is `type="number"`.
  it('the numeric input is inputMode="numeric" and type="text", not type="number" (AC1)', () => {
    render(<DominanceField value={NEW_ORGANISM_DOMINANCE} onChange={() => {}} />);

    const input = textbox();
    expect(input).toHaveAttribute('type', 'text');
    expect(input).toHaveAttribute('inputMode', 'numeric');
    expect(input).toHaveValue(String(NEW_ORGANISM_DOMINANCE));
  });

  // (c) Assert the attribute EXISTS before splitting (the 4.5 review's `''.split()` lesson).
  it('both controls share one aria-describedby pointing at the description text (AC1, AC7)', () => {
    render(<DominanceField value={NEW_ORGANISM_DOMINANCE} onChange={() => {}} />);

    const sliderDescribedBy = slider().getAttribute('aria-describedby');
    const textboxDescribedBy = textbox().getAttribute('aria-describedby');
    if (sliderDescribedBy === null || textboxDescribedBy === null) {
      throw new Error('aria-describedby is absent');
    }
    expect(sliderDescribedBy).toBe(textboxDescribedBy);
    expect(document.getElementById(sliderDescribedBy)).toHaveTextContent(
      'Priority in conflict resolution (1-100, higher wins)',
    );
  });

  // (d)
  it('renders "1" and "100" as decorative, aria-hidden end marks derived from the constants (AC1, AC7)', () => {
    const { container } = render(
      <DominanceField value={NEW_ORGANISM_DOMINANCE} onChange={() => {}} />,
    );

    const hiddenMarks = container.querySelectorAll('[aria-hidden="true"] > span');
    expect(Array.from(hiddenMarks).map((el) => el.textContent)).toEqual([
      String(MIN_DOMINANCE),
      String(MAX_DOMINANCE),
    ]);
  });

  // (e) jsdom does not step a range from the keyboard (3.13 trap 2) — `fireEvent.change` is the
  // unit-level "both ways" proof; the keyboard contract is Playwright's.
  it('slider change calls onChange once and the textbox follows, through the harness (AC4, AC6)', () => {
    render(<ControlledHarness />);

    fireEvent.change(slider(), { target: { value: '42' } });

    expect(textbox()).toHaveValue('42');
    expect(slider()).toHaveValue('42');
  });

  it('a bare onChange spy receives the slider value exactly once', () => {
    const onChange = vi.fn();
    render(<DominanceField value={NEW_ORGANISM_DOMINANCE} onChange={onChange} />);

    fireEvent.change(slider(), { target: { value: '42' } });

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(42);
  });

  // (f) input -> slider, live: no blur needed.
  it('typing an in-range value commits live and moves the slider on every keystroke (AC4)', async () => {
    const user = userEvent.setup();
    render(<ControlledHarness />);

    await user.click(textbox());
    await user.clear(textbox());
    await user.type(textbox(), '4');
    expect(slider()).toHaveValue('4');

    await user.type(textbox(), '2');
    expect(textbox()).toHaveValue('42');
    expect(slider()).toHaveValue('42');
  });

  // (g) out of range snaps on commit, never live.
  it('an out-of-range typed value does not commit live; blur snaps it to the boundary (AC5)', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { rerender } = render(
      <DominanceField value={NEW_ORGANISM_DOMINANCE} onChange={onChange} />,
    );

    await user.click(textbox());
    await user.clear(textbox());
    await user.type(textbox(), '150');

    expect(onChange).not.toHaveBeenCalledWith(150);
    expect(slider()).toHaveValue(String(NEW_ORGANISM_DOMINANCE));

    await user.tab();

    expect(onChange).toHaveBeenCalledWith(MAX_DOMINANCE);
    rerender(<DominanceField value={MAX_DOMINANCE} onChange={onChange} />);
    expect(textbox()).toHaveValue(String(MAX_DOMINANCE));
    expect(slider()).toHaveValue(String(MAX_DOMINANCE));
  });

  it.each(['0', '-5'])('snaps %j to MIN_DOMINANCE on blur', async (typed) => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<DominanceField value={NEW_ORGANISM_DOMINANCE} onChange={onChange} />);

    await user.click(textbox());
    await user.clear(textbox());
    await user.type(textbox(), typed);
    await user.tab();

    expect(onChange).toHaveBeenCalledWith(MIN_DOMINANCE);
  });

  // (h) non-integer is rejected and reverts.
  it.each(['5.5', '', 'abc'])(
    'rejects non-integer text %j: onChange never called, and it reverts on blur (AC5)',
    async (invalid) => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      render(<DominanceField value={NEW_ORGANISM_DOMINANCE} onChange={onChange} />);

      await user.click(textbox());
      await user.clear(textbox());
      if (invalid !== '') await user.type(textbox(), invalid);

      expect(onChange).not.toHaveBeenCalled();

      await user.tab();

      expect(onChange).not.toHaveBeenCalled();
      expect(textbox()).toHaveValue(String(NEW_ORGANISM_DOMINANCE));
      expect(slider()).toHaveValue(String(NEW_ORGANISM_DOMINANCE));
    },
  );

  // (i) Enter commits without blurring.
  it('Enter commits an out-of-range value without moving focus off the textbox (AC5)', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { rerender } = render(
      <DominanceField value={NEW_ORGANISM_DOMINANCE} onChange={onChange} />,
    );

    await user.click(textbox());
    await user.clear(textbox());
    await user.type(textbox(), '150');
    await user.keyboard('{Enter}');

    expect(onChange).toHaveBeenCalledWith(MAX_DOMINANCE);
    rerender(<DominanceField value={MAX_DOMINANCE} onChange={onChange} />);
    expect(textbox()).toHaveValue(String(MAX_DOMINANCE));
    expect(document.activeElement).toBe(textbox());
  });

  // (j) controlled, never a local mirror that drifts (Story 3.13 trap 9's shape).
  it('is controlled: an unmoved value prop leaves the slider in place; a rerender moves both controls (AC4)', () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <DominanceField value={NEW_ORGANISM_DOMINANCE} onChange={onChange} />,
    );

    fireEvent.change(slider(), { target: { value: '42' } });
    expect(onChange).toHaveBeenCalledWith(42);
    expect(slider()).toHaveValue(String(NEW_ORGANISM_DOMINANCE));

    rerender(<DominanceField value={42} onChange={onChange} />);
    expect(slider()).toHaveValue('42');
    expect(textbox()).toHaveValue('42');
  });

  // (k) no-op edits do not call onChange — a `setDraft` functional update always builds a new
  // object, so an unguarded no-op keystroke would re-render the whole modal for nothing.
  it('does not call onChange for a no-op focus/blur or re-typing the current value (AC4)', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<DominanceField value={NEW_ORGANISM_DOMINANCE} onChange={onChange} />);

    await user.click(textbox());
    await user.tab();
    expect(onChange).not.toHaveBeenCalled();

    await user.click(textbox());
    await user.clear(textbox());
    await user.type(textbox(), String(NEW_ORGANISM_DOMINANCE));
    expect(onChange).not.toHaveBeenCalled();
  });

  // (l) tab order inside Basic Information: name -> slider -> numeric input. Here, a preceding
  // focusable element stands in for the name field.
  it('keyboard order: Tab from a preceding control lands on the slider, then the textbox (AC6)', async () => {
    const user = userEvent.setup();
    render(
      <>
        <button type="button">Preceding</button>
        <DominanceField value={NEW_ORGANISM_DOMINANCE} onChange={() => {}} />
      </>,
    );

    screen.getByRole('button', { name: 'Preceding' }).focus();
    await user.tab();
    expect(slider()).toHaveFocus();
    await user.tab();
    expect(textbox()).toHaveFocus();
  });

  // (m) axe at 1, 5 and 100, and mid-edit with an out-of-range text.
  describe('has no axe accessibility violations (AC8)', () => {
    it.each([MIN_DOMINANCE, NEW_ORGANISM_DOMINANCE, MAX_DOMINANCE])('at value %i', async (v) => {
      const { container, unmount } = render(<DominanceField value={v} onChange={() => {}} />);

      expect((await axe(container)).violations).toEqual([]);
      unmount();
    });

    it('while the textbox holds an out-of-range, uncommitted value', async () => {
      const user = userEvent.setup();
      const { container } = render(
        <DominanceField value={NEW_ORGANISM_DOMINANCE} onChange={() => {}} />,
      );

      await user.click(textbox());
      await user.clear(textbox());
      await user.type(textbox(), '150');

      expect((await axe(container)).violations).toEqual([]);
    });
  });
});
