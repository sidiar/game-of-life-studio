import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import DeleteBattleDialog from './DeleteBattleDialog';

// MUI's Dialog PORTALS to document.body — render()'s own `container` never contains it. Every
// query below goes through `screen` (which searches document.body) rather than `container`, and
// axe runs are scoped to `document.body` too. Scoping either to `container` would silently pass
// against an empty tree (Story 1.12 review pattern: "tests that cannot fail").

afterEach(() => {
  vi.restoreAllMocks();
});

describe('DeleteBattleDialog', () => {
  it('renders with the accessible name "Delete Battle?" and the battle name in the body (AC1)', () => {
    render(
      <DeleteBattleDialog
        open
        battleName="Triple Threat"
        pending={false}
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );
    expect(screen.getByRole('dialog', { name: 'Delete Battle?' })).toBeInTheDocument();
    expect(screen.getByText(/Triple Threat/)).toBeInTheDocument();
    expect(screen.getByText(/permanently deleted/i)).toBeInTheDocument();
  });

  it('open={false} renders no dialog at all (MUI unmounts by default)', () => {
    render(
      <DeleteBattleDialog
        open={false}
        battleName="Triple Threat"
        pending={false}
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('Cancel fires onCancel and not onConfirm', async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    const onConfirm = vi.fn();
    render(
      <DeleteBattleDialog
        open
        battleName="Triple Threat"
        pending={false}
        onCancel={onCancel}
        onConfirm={onConfirm}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('Delete fires onConfirm and not onCancel', async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    const onConfirm = vi.fn();
    render(
      <DeleteBattleDialog
        open
        battleName="Triple Threat"
        pending={false}
        onCancel={onCancel}
        onConfirm={onConfirm}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Delete Battle' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('pending disables both buttons', () => {
    render(
      <DeleteBattleDialog
        open
        battleName="Triple Threat"
        pending
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Delete Battle' })).toBeDisabled();
  });

  // MUI's focus trap runs in jsdom (unlike a hand-rolled native <dialog>), so this IS
  // unit-testable here — the browser-only assertions (Tab cycling past the last control, Escape
  // in a real browser) live in e2e/deleteBattle.spec.ts.
  it('starts focus on Cancel', () => {
    render(
      <DeleteBattleDialog
        open
        battleName="Triple Threat"
        pending={false}
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus();
  });

  // `pending` disables both buttons, but Escape and the backdrop do not go through them — without
  // an explicit guard they close the dialog as if cancelled while battles.delete() runs on to
  // completion, destroying the battle after the user made the documented cancel gesture
  // (code review 2026-08-14).
  it('ignores Escape while a delete is in flight', async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    render(
      <DeleteBattleDialog
        open
        battleName="Triple Threat"
        pending
        onCancel={onCancel}
        onConfirm={vi.fn()}
      />,
    );

    await user.keyboard('{Escape}');
    expect(onCancel).not.toHaveBeenCalled();

    // Falsifiable: the same key press with pending=false must still cancel, so this test cannot
    // pass by Escape being broken outright.
    onCancel.mockClear();
    render(
      <DeleteBattleDialog
        open
        battleName="Triple Threat"
        pending={false}
        onCancel={onCancel}
        onConfirm={vi.fn()}
      />,
    );
    await user.keyboard('{Escape}');
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('has no axe violations', async () => {
    render(
      <DeleteBattleDialog
        open
        battleName="Triple Threat"
        pending={false}
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );
    const results = await axe(document.body);
    expect(results.violations).toEqual([]);
  });
});
