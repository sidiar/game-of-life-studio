import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import OrganismInUseDialog, {
  battleCountLabel,
  organismInUseMessage,
  type OrganismInUseDialogProps,
} from './OrganismInUseDialog';

// MUI's Dialog PORTALS to document.body — render()'s own `container` never contains it. Every
// query here goes through `screen` and every axe run is scoped to `document.body`; scoping either
// to `container` would silently pass against an empty tree.

function renderDialog(overrides: Partial<OrganismInUseDialogProps> = {}) {
  const onCancel = vi.fn();
  const onEditAnyway = vi.fn();
  const result = render(
    <OrganismInUseDialog
      open
      usedInBattles={2}
      onCancel={onCancel}
      onEditAnyway={onEditAnyway}
      {...overrides}
    />,
  );
  return { ...result, onCancel, onEditAnyway };
}

describe('OrganismInUseDialog (Story 4.17, AC2 — FR-1.3)', () => {
  it('(a) pluralises the title and the PRD sentence for one battle', () => {
    renderDialog({ usedInBattles: 1 });

    expect(screen.getByRole('dialog', { name: 'Used in 1 Battle' })).toBeInTheDocument();
    expect(
      screen.getByText(
        'This organism is used in 1 Battle. Editing it will affect all Battles that use it. Clone this organism first to create a Battle-specific variant?',
      ),
    ).toBeInTheDocument();
  });

  it('(a) pluralises the title and the PRD sentence for two battles, and offers exactly two actions', () => {
    renderDialog({ usedInBattles: 2 });

    expect(screen.getByRole('dialog', { name: 'Used in 2 Battles' })).toBeInTheDocument();
    expect(
      screen.getByText(
        'This organism is used in 2 Battles. Editing it will affect all Battles that use it. Clone this organism first to create a Battle-specific variant?',
      ),
    ).toBeInTheDocument();
    // A COUNT, not two presence checks: Clone & Edit is Story 4.18's, and a button that does
    // nothing must not appear here.
    expect(screen.getAllByRole('button').map((button) => button.textContent)).toEqual([
      'Cancel',
      'Edit Anyway',
    ]);
  });

  it('the two formatters are the single source of the copy', () => {
    expect(battleCountLabel(1)).toBe('Used in 1 Battle');
    expect(battleCountLabel(3)).toBe('Used in 3 Battles');
    expect(organismInUseMessage(1)).toContain('used in 1 Battle.');
    expect(organismInUseMessage(3)).toContain('used in 3 Battles.');
  });

  it('(b) Cancel fires onCancel only', async () => {
    const user = userEvent.setup();
    const { onCancel, onEditAnyway } = renderDialog();

    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onEditAnyway).not.toHaveBeenCalled();
  });

  it('(c) Edit Anyway fires onEditAnyway only', async () => {
    const user = userEvent.setup();
    const { onCancel, onEditAnyway } = renderDialog();

    await user.click(screen.getByRole('button', { name: 'Edit Anyway' }));

    expect(onEditAnyway).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('(d) Escape is Cancel', async () => {
    const user = userEvent.setup();
    const { onCancel, onEditAnyway } = renderDialog();

    await user.keyboard('{Escape}');

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onEditAnyway).not.toHaveBeenCalled();
  });

  it('(e) Cancel is focused on open — an immediate Enter changes nothing', async () => {
    const user = userEvent.setup();
    const { onCancel, onEditAnyway } = renderDialog();

    await waitFor(() => expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus());
    // The claim in the title, exercised: Enter on the focused button is Cancel, never Edit Anyway.
    await user.keyboard('{Enter}');

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onEditAnyway).not.toHaveBeenCalled();
  });

  it('open={false} renders no dialog at all', () => {
    renderDialog({ open: false });

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('(f) has no axe violations', async () => {
    renderDialog();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus());

    expect((await axe(document.body)).violations).toEqual([]);
  });
});
