import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
// Story 4.20, FD6: the two formatters now live in `lib/organisms/usageLabels.ts` (the editor
// footer renders the same copy). The assertions below are unchanged by the move — that is what
// makes it a move.
import { battleCountLabel, organismInUseMessage } from '@/lib/organisms/usageLabels';
import OrganismInUseDialog, { type OrganismInUseDialogProps } from './OrganismInUseDialog';

// MUI's Dialog PORTALS to document.body — render()'s own `container` never contains it. Every
// query here goes through `screen` and every axe run is scoped to `document.body`; scoping either
// to `container` would silently pass against an empty tree.

function renderDialog(overrides: Partial<OrganismInUseDialogProps> = {}) {
  const onCancel = vi.fn();
  const onCloneAndEdit = vi.fn();
  const onEditAnyway = vi.fn();
  const result = render(
    <OrganismInUseDialog
      open
      usedInBattles={2}
      pending={false}
      onCancel={onCancel}
      onCloneAndEdit={onCloneAndEdit}
      onEditAnyway={onEditAnyway}
      {...overrides}
    />,
  );
  return { ...result, onCancel, onCloneAndEdit, onEditAnyway };
}

describe('OrganismInUseDialog (Story 4.17 AC2 / Story 4.18 AC8 — FR-1.3)', () => {
  it('(a) pluralises the title and the PRD sentence for one battle', () => {
    renderDialog({ usedInBattles: 1 });

    expect(screen.getByRole('dialog', { name: 'Used in 1 Battle' })).toBeInTheDocument();
    expect(
      screen.getByText(
        'This organism is used in 1 Battle. Editing it will affect all Battles that use it. Clone this organism first to create a Battle-specific variant?',
      ),
    ).toBeInTheDocument();
  });

  it('(a) three buttons, in DOM order, with their accessible names', () => {
    renderDialog({ usedInBattles: 2 });

    expect(screen.getByRole('dialog', { name: 'Used in 2 Battles' })).toBeInTheDocument();
    expect(
      screen.getByText(
        'This organism is used in 2 Battles. Editing it will affect all Battles that use it. Clone this organism first to create a Battle-specific variant?',
      ),
    ).toBeInTheDocument();
    expect(screen.getAllByRole('button').map((button) => button.textContent)).toEqual([
      'Cancel',
      'Clone & Edit',
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
    const { onCancel, onCloneAndEdit, onEditAnyway } = renderDialog();

    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onCloneAndEdit).not.toHaveBeenCalled();
    expect(onEditAnyway).not.toHaveBeenCalled();
  });

  it('(b) Clone & Edit fires onCloneAndEdit only', async () => {
    const user = userEvent.setup();
    const { onCancel, onCloneAndEdit, onEditAnyway } = renderDialog();

    await user.click(screen.getByRole('button', { name: 'Clone & Edit' }));

    expect(onCloneAndEdit).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
    expect(onEditAnyway).not.toHaveBeenCalled();
  });

  it('(c) Edit Anyway fires onEditAnyway only', async () => {
    const user = userEvent.setup();
    const { onCancel, onCloneAndEdit, onEditAnyway } = renderDialog();

    await user.click(screen.getByRole('button', { name: 'Edit Anyway' }));

    expect(onEditAnyway).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
    expect(onCloneAndEdit).not.toHaveBeenCalled();
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

  it('(c) pending disables all three buttons; Escape and a backdrop click call nothing', async () => {
    const user = userEvent.setup();
    const { onCancel, onCloneAndEdit, onEditAnyway } = renderDialog({ pending: true });

    const dialog = screen.getByRole('dialog');
    within(dialog)
      .getAllByRole('button')
      .forEach((button) => expect(button).toBeDisabled());

    await user.keyboard('{Escape}');
    expect(onCancel).not.toHaveBeenCalled();
    expect(onCloneAndEdit).not.toHaveBeenCalled();
    expect(onEditAnyway).not.toHaveBeenCalled();

    // The backdrop half, which the title claimed and the body never performed (review
    // 2026-09-22). MUI routes a backdrop click through the same `onClose` as Escape, so this is
    // the second reason the `if (pending) return;` guard has to live there.
    await user.click(document.querySelector('.MuiBackdrop-root') as HTMLElement);
    expect(onCancel).not.toHaveBeenCalled();
  });

  // The positive control for both halves of (c): with `pending` false the SAME two gestures do
  // reach `onCancel`. Without it, (c) would pass against a dialog that ignores Escape and the
  // backdrop unconditionally.
  it('(c2) positive control: with pending false, a backdrop click IS Cancel', async () => {
    const user = userEvent.setup();
    const { onCancel } = renderDialog({ pending: false });

    await user.click(document.querySelector('.MuiBackdrop-root') as HTMLElement);

    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('open={false} renders no dialog at all', () => {
    renderDialog({ open: false });

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('(e) axe with pending=false', async () => {
    renderDialog();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus());

    expect((await axe(document.body)).violations).toEqual([]);
  });

  it('(e) axe with pending=true', async () => {
    renderDialog({ pending: true });

    expect((await axe(document.body)).violations).toEqual([]);
  });
});
