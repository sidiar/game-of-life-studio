import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import { MAX_ORGANISM_NAME_LENGTH } from '@gol/domain';
import OrganismNameField from './OrganismNameField';

/** A real controlled round trip — the shape `<OrganismEditorModal>`'s `setName` provides — rather
 * than a mocked `onChange` that never feeds a new value back in (`BattleNameField.test.tsx`'s
 * harness). Load-bearing for the over-limit test: whether a 6th character is KEPT is only
 * observable if the caller re-renders with whatever the field handed it. */
function ControlledHarness({ maxLength }: { maxLength?: number }) {
  const [value, setValue] = useState('');
  return <OrganismNameField value={value} onChange={setValue} maxLength={maxLength} />;
}

const field = () => screen.getByRole('textbox', { name: 'Organism Name' });

describe('OrganismNameField', () => {
  // (a) The accessible name comes from `<label for>`, not text proximity or an `aria-label`
  // (SC 2.5.3) — the 4.4 review's id-equality lesson: match the id, not merely the text.
  it('is a required textbox labelled "Organism Name" through <label for> (AC1, AC5)', () => {
    render(<OrganismNameField value="" onChange={() => {}} />);

    const input = field();
    expect(input).toBeRequired();
    expect(input).not.toHaveAttribute('aria-label');
    const label = screen.getByText('Organism Name');
    expect(label.tagName).toBe('LABEL');
    expect(label).toHaveAttribute('for', input.id);
  });

  // (b)
  it('shows the placeholder and an empty value on an empty draft (AC1)', () => {
    render(<OrganismNameField value="" onChange={() => {}} />);

    expect(field()).toHaveValue('');
    expect(field()).toHaveAttribute('placeholder', 'e.g., Aggressive Colonizer');
  });

  // (c) Derived from the export, never `50` — a literal would pin a default that had drifted from
  // `OrganismSchema`'s own cap and keep the suite green while doing it.
  it('the counter defaults to the schema’s cap and tracks the caller’s value (AC1, AC2)', () => {
    const { rerender } = render(<OrganismNameField value="" onChange={() => {}} />);

    expect(screen.getByText(`0 / ${MAX_ORGANISM_NAME_LENGTH}`)).toBeInTheDocument();

    rerender(<OrganismNameField value="Glider" onChange={() => {}} />);

    expect(screen.getByText(`6 / ${MAX_ORGANISM_NAME_LENGTH}`)).toBeInTheDocument();
    expect(screen.queryByText(`0 / ${MAX_ORGANISM_NAME_LENGTH}`)).toBeNull();
  });

  // (d) UTF-16 code units, not code points — what `OrganismSchema.name.max()` counts
  // (`deferred-work.md`'s code-unit entry). `{...}` deliberately: a JSX attribute STRING is raw
  // text and would not interpret the escape.
  it('counts UTF-16 code units, so an emoji counts as 2 (AC1)', () => {
    render(<OrganismNameField value={'a\u{1F44D}b'} onChange={() => {}} maxLength={10} />);

    expect(screen.getByText('4 / 10')).toBeInTheDocument();
  });

  // (e) FD2: a fresh editor does not open red. The required error waits for the first edit.
  it('shows no error on mount with an empty value (AC3)', () => {
    render(<OrganismNameField value="" onChange={() => {}} />);

    const input = field();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(input).not.toBeInvalid();
    // Exactly ONE describedby token — the counter's — and it resolves.
    const ids = (input.getAttribute('aria-describedby') ?? '').split(/\s+/);
    expect(ids).toHaveLength(1);
    expect(document.getElementById(ids[0] as string)).toHaveTextContent(
      `0 / ${MAX_ORGANISM_NAME_LENGTH}`,
    );
  });

  // (f) Once edited, an emptied field is an error — and the alert's id is the FIRST describedby
  // token (read first), the counter's still present after it.
  it('shows the required error after the field has been edited and emptied (AC3, AC5)', async () => {
    const user = userEvent.setup();
    render(<ControlledHarness />);

    await user.type(field(), 'a');
    expect(screen.queryByRole('alert')).toBeNull();
    await user.keyboard('{Backspace}');

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Organism name is required');
    expect(field()).toBeInvalid();
    const ids = (field().getAttribute('aria-describedby') ?? '').split(/\s+/);
    expect(ids).toHaveLength(2);
    expect(ids[0]).toBe(alert.id);
    expect(document.getElementById(ids[1] as string)).toHaveTextContent(
      `0 / ${MAX_ORGANISM_NAME_LENGTH}`,
    );
  });

  // (g) FD1 — the pin. A `maxLength` attribute or a `.slice()` clamp would leave the input at
  // five characters and make the over-limit error unreachable dead text (AC4, Story 4.13's gate).
  it('keeps an over-limit value and shows the over-limit error — no truncation (AC3, AC4)', async () => {
    const user = userEvent.setup();
    render(<ControlledHarness maxLength={5} />);

    await user.type(field(), 'abcdef');

    expect(field()).toHaveValue('abcdef');
    expect(field()).not.toHaveAttribute('maxlength');
    expect(screen.getByRole('alert')).toHaveTextContent('Name cannot exceed 5 characters');
    expect(field()).toBeInvalid();
    const counter = screen.getByText('6 / 5');
    expect(counter).toHaveAttribute('data-over-limit');
  });

  // (h) Ordering: over-limit is reported before required, so a whitespace string over the cap is
  // not told to "type more".
  it('reports over-limit rather than required for over-limit whitespace (AC3)', async () => {
    const user = userEvent.setup();
    render(<ControlledHarness maxLength={2} />);

    await user.type(field(), '   ');

    expect(screen.getByRole('alert')).toHaveTextContent('Name cannot exceed 2 characters');
  });

  // (i) The alert unmounts with the error, so `aria-describedby` never points at an id that is not
  // in the DOM (axe `aria-valid-attr-value`).
  it('clears the error, aria-invalid and the describedby reference once valid again (AC5)', async () => {
    const user = userEvent.setup();
    render(<ControlledHarness />);

    await user.type(field(), 'a');
    await user.keyboard('{Backspace}');
    expect(screen.getByRole('alert')).toBeInTheDocument();
    await user.type(field(), 'b');

    expect(screen.queryByRole('alert')).toBeNull();
    expect(field()).not.toBeInvalid();
    const ids = (field().getAttribute('aria-describedby') ?? '').split(/\s+/);
    expect(ids).toHaveLength(1);
    expect(document.getElementById(ids[0] as string)).toHaveTextContent(
      `1 / ${MAX_ORGANISM_NAME_LENGTH}`,
    );
  });

  // (j) `onChange` receives the FULL resulting string (`event.target.value`), not a delta.
  it('calls onChange with the full new value on a keystroke (AC1)', async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();
    render(<OrganismNameField value="Glider" onChange={handleChange} />);

    await user.type(field(), '!', { initialSelectionStart: 6, initialSelectionEnd: 6 });

    expect(handleChange).toHaveBeenCalledWith('Glider!');
  });

  // The multi-keystroke case needs the REAL round trip: against a bare `vi.fn()` the value prop
  // stays pinned at '' and every keystroke replaces the last.
  it('accumulates typed keystrokes when the caller feeds the value back (AC1)', async () => {
    const user = userEvent.setup();
    render(<ControlledHarness />);

    await user.type(field(), 'Hi');

    expect(field()).toHaveValue('Hi');
  });

  // (k) AC5's keyboard clause.
  it('is keyboard-operable: Tab lands on the input and typing edits it (AC5)', async () => {
    const user = userEvent.setup();
    render(<ControlledHarness />);

    await user.tab();
    expect(field()).toHaveFocus();
    await user.keyboard('Go');

    expect(field()).toHaveValue('Go');
  });

  // (l) The counter is describedby-only (Story 2.11 FD4); the alert carries its liveness through
  // the role alone, never an explicit `aria-live="assertive"` — the `BattleNameField.test.tsx`
  // shape for the cap notice, inverted for an error.
  it('keeps the counter silent and lets role="alert" carry the error’s liveness (AC5)', async () => {
    const user = userEvent.setup();
    render(<ControlledHarness />);

    await user.type(field(), 'a');
    await user.keyboard('{Backspace}');

    const ids = (field().getAttribute('aria-describedby') ?? '').split(/\s+/);
    const counter = document.getElementById(ids[1] as string);
    expect(counter).not.toHaveAttribute('aria-live');
    expect(counter).not.toHaveAttribute('role');
    expect(screen.getByRole('alert')).not.toHaveAttribute('aria-live', 'assertive');
  });

  // (m) Three states, because the describedby list and the alert differ in each.
  describe('has no axe accessibility violations (AC7)', () => {
    it('clean', async () => {
      const { container } = render(<OrganismNameField value="Glider" onChange={() => {}} />);

      expect((await axe(container)).violations).toEqual([]);
    });

    it('with the required error visible', async () => {
      const user = userEvent.setup();
      const { container } = render(<ControlledHarness />);
      await user.type(field(), 'a');
      await user.keyboard('{Backspace}');
      expect(screen.getByRole('alert')).toBeInTheDocument();

      expect((await axe(container)).violations).toEqual([]);
    });

    it('with the over-limit error visible', async () => {
      const user = userEvent.setup();
      const { container } = render(<ControlledHarness maxLength={3} />);
      await user.type(field(), 'abcd');
      expect(screen.getByRole('alert')).toBeInTheDocument();

      expect((await axe(container)).violations).toEqual([]);
    });
  });
});
