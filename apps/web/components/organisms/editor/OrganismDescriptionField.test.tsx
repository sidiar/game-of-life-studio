import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { MAX_ORGANISM_DESCRIPTION_LENGTH } from '@gol/domain';
import OrganismDescriptionField from './OrganismDescriptionField';

const describedBy = (el: HTMLElement) =>
  (el.getAttribute('aria-describedby') ?? '').split(' ').map((id) => document.getElementById(id));

describe('OrganismDescriptionField (Story 7.2, FR-9.5)', () => {
  it('is a labelled textarea with the helper line and a counter, and no error while valid', () => {
    render(<OrganismDescriptionField value="Hi" onChange={vi.fn()} showAllErrors={false} />);

    const field = screen.getByRole('textbox', { name: 'Description' });
    expect(field.tagName).toBe('TEXTAREA');
    expect(field).toHaveAttribute('data-organism-description');
    expect(field).toHaveAttribute('aria-invalid', 'false');
    expect(describedBy(field).map((el) => el?.textContent)).toEqual([
      "Optional. Shown on the organism's card.",
      `2 / ${MAX_ORGANISM_DESCRIPTION_LENGTH}`,
    ]);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('refuses rather than clamps: no maxLength, and an over-limit value passes through unchanged', () => {
    const onChange = vi.fn();
    render(<OrganismDescriptionField value="" onChange={onChange} showAllErrors={false} />);
    const field = screen.getByRole('textbox', { name: 'Description' });
    expect(field).not.toHaveAttribute('maxLength');

    const over = 'x'.repeat(MAX_ORGANISM_DESCRIPTION_LENGTH + 3);
    fireEvent.change(field, { target: { value: over } });
    expect(onChange).toHaveBeenCalledWith(over);
  });

  it('over the cap shows the alert first in aria-describedby and flags the counter', () => {
    const over = 'x'.repeat(MAX_ORGANISM_DESCRIPTION_LENGTH + 1);
    render(<OrganismDescriptionField value={over} onChange={vi.fn()} showAllErrors={false} />);

    const field = screen.getByRole('textbox', { name: 'Description' });
    expect(field).toHaveAttribute('aria-invalid', 'true');
    const [error, , counter] = describedBy(field);
    expect(error).toHaveAttribute('role', 'alert');
    expect(error).toHaveTextContent(
      `Description cannot exceed ${MAX_ORGANISM_DESCRIPTION_LENGTH} characters`,
    );
    expect(counter).toHaveAttribute('data-over-limit');
  });

  it('has no axe violations, valid or over the cap', async () => {
    const { container, rerender } = render(
      <OrganismDescriptionField value="Hi" onChange={vi.fn()} showAllErrors={false} />,
    );
    expect((await axe(container)).violations).toEqual([]);

    rerender(
      <OrganismDescriptionField
        value={'x'.repeat(MAX_ORGANISM_DESCRIPTION_LENGTH + 1)}
        onChange={vi.fn()}
        showAllErrors={false}
      />,
    );
    expect((await axe(container)).violations).toEqual([]);
  });
});
