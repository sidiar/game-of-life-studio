import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import ResizeClipWarningDialog from './ResizeClipWarningDialog';

// MUI's Dialog PORTALS to document.body — render()'s own `container` never contains it. Every
// query here goes through `screen` and every axe run is scoped to `document.body`; scoping either
// to `container` would silently pass against an empty tree.

function renderDialog(overrides: Partial<Parameters<typeof ResizeClipWarningDialog>[0]> = {}) {
  const onCancel = vi.fn();
  const onConfirm = vi.fn();
  const result = render(
    <ResizeClipWarningDialog
      open
      targetSize={{ cols: 50, rows: 30 }}
      clippedLivingCells={42}
      onCancel={onCancel}
      onConfirm={onConfirm}
      {...overrides}
    />,
  );
  return { ...result, onCancel, onConfirm };
}

describe('ResizeClipWarningDialog', () => {
  // AC3: the consequence is stated BEFORE the action — the heading names what is lost, and the
  // body quantifies it, so a reader who stops at either has already been told the destructive part.
  it('names the consequence in the heading and quantifies it in the body (AC3)', () => {
    renderDialog();

    expect(screen.getByRole('dialog', { name: 'Cells Will Be Discarded' })).toBeInTheDocument();
    expect(screen.getByText(/discards 42 living cells/i)).toBeInTheDocument();
    expect(screen.getByText(/50 by 30/i)).toBeInTheDocument();
    // Undoability is part of the consequence the user is weighing (AC4), not a separate promise.
    expect(screen.getByText(/undo/i)).toBeInTheDocument();
  });

  // ⚠️ LIVING cells, never cells — the dialog only ever opens when the count is at least one, and
  // the singular is what the one-cell case must read.
  it('says "1 living cell", singular, for a single clipped cell', () => {
    renderDialog({ clippedLivingCells: 1 });

    expect(screen.getByText(/discards 1 living cell that/i)).toBeInTheDocument();
  });

  it('open={false} renders no dialog at all (MUI unmounts by default)', () => {
    renderDialog({ open: false });

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('Cancel fires onCancel and never onConfirm (AC3)', async () => {
    const user = userEvent.setup();
    const { onCancel, onConfirm } = renderDialog();

    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('Escape fires onCancel — there is no disableEscapeKeyDown in MUI v9 (AC3, AC8)', async () => {
    const user = userEvent.setup();
    const { onCancel, onConfirm } = renderDialog();

    await user.keyboard('{Escape}');

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('the confirm button fires onConfirm and never onCancel', async () => {
    const user = userEvent.setup();
    const { onCancel, onConfirm } = renderDialog();

    await user.click(screen.getByRole('button', { name: 'Resize Grid' }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
  });

  // The destructive-confirm convention `<DeleteBattleDialog>` records: the SAFE action is what an
  // immediate Enter press hits, which needs both `autoFocus` and first place in DOM order.
  it('focuses Cancel on open, and Cancel is first in DOM order (AC8)', () => {
    renderDialog();

    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus();
    const buttons = screen.getAllByRole('button');
    expect(buttons[0]).toHaveAccessibleName('Cancel');
  });

  // AC8: focus is TRAPPED — tabbing past the last control comes back into the dialog rather than
  // escaping to the page behind it.
  it('traps focus inside the dialog (AC8)', async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.tab();
    expect(screen.getByRole('button', { name: 'Resize Grid' })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('dialog')).toContainElement(document.activeElement as HTMLElement);
  });

  it('has no axe violations (AC8)', async () => {
    renderDialog();

    expect((await axe(document.body)).violations).toEqual([]);
  });
});
