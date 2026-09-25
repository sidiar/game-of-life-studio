import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import OrganismDeleteConfirmDialog, {
  type OrganismDeleteConfirmDialogProps,
} from './OrganismDeleteConfirmDialog';

// The Dialog PORTALS to document.body, so every query goes through `screen` and axe scans
// `document.body` — scoping either to render()'s `container` would pass against an empty tree.

afterEach(() => {
  vi.restoreAllMocks();
});

function props(
  overrides: Partial<OrganismDeleteConfirmDialogProps> = {},
): OrganismDeleteConfirmDialogProps {
  return {
    open: true,
    organismName: 'Glider',
    pending: false,
    onCancel: vi.fn(),
    onConfirm: vi.fn(),
    ...overrides,
  };
}

describe('OrganismDeleteConfirmDialog', () => {
  it('asks the PRD question, quoting the name, under the title "Delete Organism?"', () => {
    render(<OrganismDeleteConfirmDialog {...props()} />);

    const dialog = screen.getByRole('dialog', { name: 'Delete Organism?' });
    expect(dialog).toHaveAccessibleDescription('Are you sure you want to delete “Glider”?');
  });

  it('renders the display fallback the caller resolved, never an empty quote', () => {
    render(<OrganismDeleteConfirmDialog {...props({ organismName: 'Unnamed organism' })} />);

    expect(
      screen.getByText('Are you sure you want to delete “Unnamed organism”?'),
    ).toBeInTheDocument();
  });

  it('focuses Cancel on open, and Cancel precedes Delete Organism in DOM order', () => {
    render(<OrganismDeleteConfirmDialog {...props()} />);

    const cancel = screen.getByRole('button', { name: 'Cancel' });
    expect(cancel).toHaveFocus();
    const buttons = screen.getAllByRole('button').map((button) => button.textContent);
    expect(buttons).toEqual(['Cancel', 'Delete Organism']);
  });

  it('Cancel, Escape and the backdrop each call onCancel, never onConfirm', async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    const onConfirm = vi.fn();
    render(<OrganismDeleteConfirmDialog {...props({ onCancel, onConfirm })} />);

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await user.keyboard('{Escape}');
    await user.click(document.querySelector('.MuiBackdrop-root') as HTMLElement);

    expect(onCancel).toHaveBeenCalledTimes(3);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('Delete Organism calls onConfirm', async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    const onConfirm = vi.fn();
    render(<OrganismDeleteConfirmDialog {...props({ onCancel, onConfirm })} />);

    await user.click(screen.getByRole('button', { name: 'Delete Organism' }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('while pending, both buttons are disabled and neither Escape nor the backdrop cancels', async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    render(<OrganismDeleteConfirmDialog {...props({ pending: true, onCancel })} />);

    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Delete Organism' })).toBeDisabled();
    await user.keyboard('{Escape}');
    await user.click(document.querySelector('.MuiBackdrop-root') as HTMLElement);

    expect(onCancel).not.toHaveBeenCalled();
  });

  it('keeps the name rendered while open flips to false, until the exit transition ends', async () => {
    const onExited = vi.fn();
    const { rerender } = render(<OrganismDeleteConfirmDialog {...props({ onExited })} />);
    const dialog = screen.getByRole('dialog', { name: 'Delete Organism?' });

    rerender(<OrganismDeleteConfirmDialog {...props({ open: false, onExited })} />);

    expect(dialog).toHaveTextContent('Are you sure you want to delete “Glider”?');
    await waitFor(() => expect(onExited).toHaveBeenCalledTimes(1));
  });

  it('has no axe violations', async () => {
    render(<OrganismDeleteConfirmDialog {...props()} />);

    expect((await axe(document.body)).violations).toEqual([]);
  });
});
