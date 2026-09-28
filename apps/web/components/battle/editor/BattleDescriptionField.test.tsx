import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import { MAX_BATTLE_DESCRIPTION_LENGTH } from '@gol/domain';
import BattleDescriptionField from './BattleDescriptionField';

describe('BattleDescriptionField (Story 7.2, FR-9.5)', () => {
  it('is a labelled textarea with a counter bound by aria-describedby', () => {
    render(<BattleDescriptionField value="Hello" onChange={vi.fn()} />);

    const field = screen.getByRole('textbox', { name: 'Description' });
    expect(field.tagName).toBe('TEXTAREA');
    expect(field).toHaveAttribute('maxLength', String(MAX_BATTLE_DESCRIPTION_LENGTH));
    const counter = document.getElementById(field.getAttribute('aria-describedby') ?? '');
    expect(counter).toHaveTextContent(`5 / ${MAX_BATTLE_DESCRIPTION_LENGTH}`);
  });

  it('reports each edit to the caller', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<BattleDescriptionField value="" onChange={onChange} />);

    await user.type(screen.getByRole('textbox', { name: 'Description' }), 'A');
    expect(onChange).toHaveBeenCalledWith('A');
  });

  it('clamps a value that arrives over the cap (IME/paste/autofill paths)', () => {
    const onChange = vi.fn();
    render(<BattleDescriptionField value="" onChange={onChange} />);

    fireEvent.change(screen.getByRole('textbox', { name: 'Description' }), {
      target: { value: 'x'.repeat(MAX_BATTLE_DESCRIPTION_LENGTH + 5) },
    });
    expect(onChange).toHaveBeenCalledWith('x'.repeat(MAX_BATTLE_DESCRIPTION_LENGTH));
  });

  it('shows the polite cap notice only at the cap', () => {
    const { rerender } = render(
      <BattleDescriptionField
        value={'x'.repeat(MAX_BATTLE_DESCRIPTION_LENGTH - 1)}
        onChange={vi.fn()}
      />,
    );
    expect(screen.queryByRole('status')).not.toBeInTheDocument();

    rerender(
      <BattleDescriptionField
        value={'x'.repeat(MAX_BATTLE_DESCRIPTION_LENGTH)}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByRole('status')).toHaveTextContent(
      `Description limit reached — ${MAX_BATTLE_DESCRIPTION_LENGTH} characters.`,
    );
  });

  it('is disabled during a save', () => {
    render(<BattleDescriptionField value="" onChange={vi.fn()} disabled />);
    expect(screen.getByRole('textbox', { name: 'Description' })).toBeDisabled();
  });

  it('has no axe violations, at the cap included', async () => {
    const { container } = render(
      <BattleDescriptionField
        value={'x'.repeat(MAX_BATTLE_DESCRIPTION_LENGTH)}
        onChange={vi.fn()}
      />,
    );
    expect((await axe(container)).violations).toEqual([]);
  });
});
