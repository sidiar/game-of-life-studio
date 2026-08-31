import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import UnsavedChangesDialog from './UnsavedChangesDialog';

// MUI's Dialog PORTALS to document.body — render()'s own `container` never contains it. Every
// query here goes through `screen` and every axe run is scoped to `document.body`; scoping either
// to `container` would silently pass against an empty tree.

function renderDialog(overrides: Partial<Parameters<typeof UnsavedChangesDialog>[0]> = {}) {
  const onCancel = vi.fn();
  const onDiscard = vi.fn();
  const onSaveAndLeave = vi.fn();
  const result = render(
    <UnsavedChangesDialog
      open
      pending={false}
      onCancel={onCancel}
      onDiscard={onDiscard}
      onSaveAndLeave={onSaveAndLeave}
      {...overrides}
    />,
  );
  return { ...result, onCancel, onDiscard, onSaveAndLeave };
}

describe('UnsavedChangesDialog (Story 2.16, AC3/AC6 — FR-7.9)', () => {
  it('quotes FR-7.9’s prompt and offers exactly the three actions', () => {
    renderDialog();

    expect(screen.getByRole('dialog', { name: 'Unsaved Changes' })).toBeInTheDocument();
    expect(screen.getByText('You have unsaved changes. Save before leaving?')).toBeInTheDocument();

    // A COUNT, not three presence checks: a fourth action (an "Export first", a "Don't ask
    // again") is exactly the kind of scope this dialog must not grow silently.
    const buttons = screen.getAllByRole('button');
    expect(buttons.map((button) => button.textContent)).toEqual([
      'Cancel',
      'Discard Changes',
      'Save & Leave',
    ]);
  });

  it('open={false} renders no dialog at all (MUI unmounts by default)', () => {
    renderDialog({ open: false });

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('Cancel fires onCancel only', async () => {
    const user = userEvent.setup();
    const { onCancel, onDiscard, onSaveAndLeave } = renderDialog();

    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onDiscard).not.toHaveBeenCalled();
    expect(onSaveAndLeave).not.toHaveBeenCalled();
  });

  it('Discard Changes fires onDiscard only', async () => {
    const user = userEvent.setup();
    const { onCancel, onDiscard, onSaveAndLeave } = renderDialog();

    await user.click(screen.getByRole('button', { name: 'Discard Changes' }));

    expect(onDiscard).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
    expect(onSaveAndLeave).not.toHaveBeenCalled();
  });

  it('Save & Leave fires onSaveAndLeave only', async () => {
    const user = userEvent.setup();
    const { onCancel, onDiscard, onSaveAndLeave } = renderDialog();

    await user.click(screen.getByRole('button', { name: 'Save & Leave' }));

    expect(onSaveAndLeave).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
    expect(onDiscard).not.toHaveBeenCalled();
  });

  it('Escape routes to Cancel — there is no disableEscapeKeyDown in MUI v9 (AC6)', async () => {
    const user = userEvent.setup();
    const { onCancel, onDiscard, onSaveAndLeave } = renderDialog();

    await user.keyboard('{Escape}');

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onDiscard).not.toHaveBeenCalled();
    expect(onSaveAndLeave).not.toHaveBeenCalled();
  });

  // Forced decision 4(a): the SAFE action is what an immediate Enter press hits, which needs both
  // `autoFocus` and first place in DOM order — the convention both shipped dialogs record.
  it('focuses Cancel on open, and Cancel is first in DOM order (AC6)', () => {
    renderDialog();

    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus();
    expect(screen.getAllByRole('button')[0]).toHaveAccessibleName('Cancel');
  });

  it('traps focus inside the dialog (AC6)', async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.tab();
    expect(screen.getByRole('button', { name: 'Discard Changes' })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: 'Save & Leave' })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('dialog')).toContainElement(document.activeElement as HTMLElement);
  });

  describe('pending — a save started from this dialog is in flight', () => {
    it('disables all three actions', () => {
      renderDialog({ pending: true });

      for (const name of ['Cancel', 'Discard Changes', 'Save & Leave']) {
        expect(screen.getByRole('button', { name })).toBeDisabled();
      }
    });

    // ⚠️ The Story 1.13 review's bug, in this dialog's shape: without the `onClose` guard, Escape
    // reads as a cancel while `battles.save()` runs on to completion — the user makes the
    // documented "changes nothing" gesture and the write lands anyway.
    it('refuses Escape while pending', async () => {
      const user = userEvent.setup();
      const { onCancel } = renderDialog({ pending: true });

      await user.keyboard('{Escape}');

      expect(onCancel).not.toHaveBeenCalled();
    });
  });

  it('has no axe violations (AC6)', async () => {
    renderDialog();

    expect((await axe(document.body)).violations).toEqual([]);
  });
});
