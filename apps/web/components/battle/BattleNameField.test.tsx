import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import BattleNameField from './BattleNameField';

/** A real controlled round trip — the same shape `<BattlePage>`'s `handleNameChange` provides —
 * rather than a mocked `onChange` that never feeds a new value back in. Needed for the
 * `maxLength` test below: a controlled input only stays truncated if the CALLER re-renders with
 * the truncated value, which a bare `vi.fn()` cannot simulate. */
function ControlledHarness({ maxLength }: { maxLength?: number }) {
  const [value, setValue] = useState('');
  return <BattleNameField value={value} onChange={setValue} maxLength={maxLength} />;
}

describe('BattleNameField', () => {
  it('renders the given value (AC1)', () => {
    render(<BattleNameField value="Triple Threat" onChange={() => {}} />);

    expect(screen.getByRole('textbox', { name: /battle name/i })).toHaveValue('Triple Threat');
  });

  it('shows the placeholder, never a value, on an empty name (AC1)', () => {
    render(<BattleNameField value="" onChange={() => {}} />);

    const input = screen.getByRole('textbox', { name: /battle name/i });
    expect(input).toHaveValue('');
    expect(input).toHaveAttribute('placeholder', 'Untitled Battle');
  });

  // AC1: "N / 100" and it tracks typing — one uncontrolled render per keystroke, since the
  // component is fully controlled and takes no state of its own (spec §3.5).
  it('the counter reads "N / maxLength" and updates as the caller’s value changes (AC1)', () => {
    const { rerender } = render(
      <BattleNameField value="abc" onChange={() => {}} maxLength={100} />,
    );

    expect(screen.getByText('3 / 100')).toBeInTheDocument();

    rerender(<BattleNameField value="abcdefghij" onChange={() => {}} maxLength={100} />);

    expect(screen.getByText('10 / 100')).toBeInTheDocument();
    expect(screen.queryByText('3 / 100')).toBeNull();
  });

  // ⚠️ UTF-16 code units, not code points — Dev Notes' table. An astral-plane character (an emoji)
  // pins the distinction: `[...value].length` would read "2 / 100" here and disagree with both the
  // DOM `maxLength` attribute and Zod's `.max()`, which both count code units.
  it('counts UTF-16 code units, not code points, so an emoji counts as 2 (Dev Notes)', () => {
    // `{...}` deliberately — a JSX attribute STRING (`value="\u{1F44D}"`) is raw text, not a JS
    // string literal, and would not interpret the escape at all.
    render(<BattleNameField value={'a\u{1F44D}b'} onChange={() => {}} maxLength={100} />);

    // "a" (1) + the thumbs-up emoji (a surrogate pair, 2 code units) + "b" (1) = 4.
    expect(screen.getByText('4 / 100')).toBeInTheDocument();
  });

  it('enforces the cap via the native maxLength attribute (forced decision 6)', () => {
    render(<BattleNameField value="" onChange={() => {}} maxLength={5} />);

    expect(screen.getByRole('textbox', { name: /battle name/i })).toHaveAttribute('maxlength', '5');
  });

  it('defaults maxLength to 100 when the caller omits it', () => {
    render(<BattleNameField value="" onChange={() => {}} />);

    expect(screen.getByRole('textbox', { name: /battle name/i })).toHaveAttribute(
      'maxlength',
      '100',
    );
  });

  // The UA truncates typed input at `maxLength` — @testing-library/user-event v14 honours the
  // attribute, so this is real coverage of forced decision 6's chosen mechanism (native
  // enforcement), not a simulated one. Needs a REAL controlled round trip (ControlledHarness): a
  // controlled input only stays truncated if the caller re-renders with the truncated value on
  // every keystroke, the same as `<BattlePage>` does.
  it('typed input never exceeds maxLength, enforced by the browser (forced decision 6)', async () => {
    const user = userEvent.setup();
    render(<ControlledHarness maxLength={3} />);

    await user.type(screen.getByRole('textbox', { name: /battle name/i }), 'abcdef');

    expect(screen.getByRole('textbox', { name: /battle name/i })).toHaveValue('abc');
    expect(screen.getByText('3 / 3')).toBeInTheDocument();
  });

  it('calls onChange with the raw new value on a keystroke (AC1)', async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();
    render(<BattleNameField value="Battle" onChange={handleChange} />);

    // A single keystroke against a value already supplied by the caller: `onChange` receives the
    // FULL resulting string (`event.target.value`), not a delta.
    await user.type(screen.getByRole('textbox', { name: /battle name/i }), '!', {
      initialSelectionStart: 6,
      initialSelectionEnd: 6,
    });

    expect(handleChange).toHaveBeenCalledWith('Battle!');
  });

  // The multi-keystroke case needs a REAL controlled round trip — a mocked onChange that never
  // feeds a new value back leaves the input's own value frozen at the caller's last-supplied
  // prop between events (ordinary controlled-input behaviour), which would make every keystroke
  // after the first land on an empty field rather than accumulate.
  it('accumulates typed keystrokes when the caller feeds the value back (AC1)', async () => {
    const user = userEvent.setup();
    render(<ControlledHarness />);

    await user.type(screen.getByRole('textbox', { name: /battle name/i }), 'Hi');

    expect(screen.getByRole('textbox', { name: /battle name/i })).toHaveValue('Hi');
  });

  // Forced decision 4: the counter is ASSOCIATED with the input (aria-describedby), not a stray
  // number and not an `aria-live` region spammed on every keystroke.
  it('associates the counter with the input via aria-describedby (forced decision 4)', () => {
    render(<BattleNameField value="abc" onChange={() => {}} maxLength={100} />);

    const input = screen.getByRole('textbox', { name: /battle name/i });
    const describedBy = input.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    const counter = document.getElementById(describedBy as string);
    expect(counter).toHaveTextContent('3 / 100');
    expect(counter).not.toHaveAttribute('aria-live');
  });

  it('is keyboard-operable: tabbing in, typing, and reading the value back (AC8)', async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();
    render(<BattleNameField value="" onChange={handleChange} />);

    await user.tab();
    expect(screen.getByRole('textbox', { name: /battle name/i })).toHaveFocus();
    await user.keyboard('Go');

    expect(handleChange).toHaveBeenCalledWith('G');
    expect(handleChange).toHaveBeenLastCalledWith('o');
  });

  it('has no axe accessibility violations (AC8)', async () => {
    const { container } = render(
      <BattleNameField value="Three-Way Skirmish" onChange={() => {}} />,
    );

    expect((await axe(container)).violations).toEqual([]);
  });
});
