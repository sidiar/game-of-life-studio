import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import RuleDeleteConfirmDialog, {
  type RuleDeleteConfirmDialogProps,
} from './RuleDeleteConfirmDialog';

// The Dialog PORTALS to document.body, so every query goes through `screen` and axe scans
// `document.body` — scoping either to render()'s `container` would pass against an empty tree.

afterEach(() => {
  vi.restoreAllMocks();
});

function props(
  overrides: Partial<RuleDeleteConfirmDialogProps> = {},
): RuleDeleteConfirmDialogProps {
  return {
    open: true,
    ruleLabel: 'Death by overpopulation',
    onCancel: vi.fn(),
    onConfirm: vi.fn(),
    ...overrides,
  };
}

/** FD4's guard: waits for the paper's `data-entered`, the real ~225ms jsdom `Fade` timer. MUI puts
 * `role="dialog"` directly on the Paper element, so the accessible dialog node IS the one
 * `slotProps.paper` merges `data-entered` onto. */
async function waitForEntered() {
  await waitFor(() =>
    expect(screen.getByRole('dialog', { name: 'Delete Rule?' })).toHaveAttribute(
      'data-entered',
      '',
    ),
  );
}

describe('RuleDeleteConfirmDialog', () => {
  it('asks "Delete Rule?", quoting the label and naming its conditions', () => {
    render(<RuleDeleteConfirmDialog {...props()} />);

    const dialog = screen.getByRole('dialog', { name: 'Delete Rule?' });
    expect(dialog).toHaveAccessibleDescription(
      '“Death by overpopulation” and its conditions will be removed from this organism.',
    );
  });

  it('renders the Rule N fallback label the caller resolved', () => {
    render(<RuleDeleteConfirmDialog {...props({ ruleLabel: 'Rule 3' })} />);

    expect(
      screen.getByText('“Rule 3” and its conditions will be removed from this organism.'),
    ).toBeInTheDocument();
  });

  it('focuses Cancel on open, and Cancel precedes Delete Rule in DOM order', () => {
    render(<RuleDeleteConfirmDialog {...props()} />);

    const cancel = screen.getByRole('button', { name: 'Cancel' });
    expect(cancel).toHaveFocus();
    const buttons = screen.getAllByRole('button').map((button) => button.textContent);
    expect(buttons).toEqual(['Cancel', 'Delete Rule']);
  });

  it('Cancel calls onCancel once entered, never onConfirm', async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    const onConfirm = vi.fn();
    render(<RuleDeleteConfirmDialog {...props({ onCancel, onConfirm })} />);
    await waitForEntered();

    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('Escape calls onCancel once entered, never onConfirm', async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    const onConfirm = vi.fn();
    render(<RuleDeleteConfirmDialog {...props({ onCancel, onConfirm })} />);
    await waitForEntered();

    await user.keyboard('{Escape}');

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('the backdrop calls onCancel once entered, never onConfirm', async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    const onConfirm = vi.fn();
    render(<RuleDeleteConfirmDialog {...props({ onCancel, onConfirm })} />);
    await waitForEntered();

    await user.click(document.querySelector('.MuiBackdrop-root') as HTMLElement);

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  // `fireEvent`, not `user-event`: synchronous, so the action provably lands before the real
  // ~225ms `Fade` timer can set `entered` — the "before" is asserted, not assumed.
  it.each(['Cancel', 'Escape'] as const)(
    '%s is live BEFORE entered too — only the backdrop and Delete Rule are guarded',
    (mode) => {
      const onCancel = vi.fn();
      render(<RuleDeleteConfirmDialog {...props({ onCancel })} />);
      const dialog = screen.getByRole('dialog', { name: 'Delete Rule?' });
      expect(dialog).not.toHaveAttribute('data-entered');

      if (mode === 'Cancel') fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
      else fireEvent.keyDown(dialog, { key: 'Escape' });

      expect(onCancel).toHaveBeenCalledTimes(1);
    },
  );

  // FD5: a held Escape's auto-repeat is ignored; a genuine press still cancels.
  it('a repeat-carrying Escape is ignored (FD5); a genuine one cancels', async () => {
    const onCancel = vi.fn();
    render(<RuleDeleteConfirmDialog {...props({ onCancel })} />);
    await waitForEntered();
    const dialog = screen.getByRole('dialog', { name: 'Delete Rule?' });

    fireEvent.keyDown(dialog, { key: 'Escape', repeat: true });
    expect(onCancel).not.toHaveBeenCalled();

    fireEvent.keyDown(dialog, { key: 'Escape', repeat: false });
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('Delete Rule calls onConfirm once entered', async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    const onConfirm = vi.fn();
    render(<RuleDeleteConfirmDialog {...props({ onCancel, onConfirm })} />);
    await waitForEntered();

    await user.click(screen.getByRole('button', { name: 'Delete Rule' }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
  });

  // FD4's own proof in jsdom: a backdrop click and a Delete Rule click fired BEFORE `data-entered`
  // do nothing — the real double-click cascade proof (a genuine `dblclick()`) is the e2e's.
  // `fireEvent` (synchronous) so both clicks provably land before the ~225ms `Fade` timer sets
  // `entered` — with `user-event`'s async clicks a slow runner could cross it mid-test.
  it('a backdrop click and a Delete Rule click fired before entered do nothing', async () => {
    const onCancel = vi.fn();
    const onConfirm = vi.fn();
    render(<RuleDeleteConfirmDialog {...props({ onCancel, onConfirm })} />);

    expect(screen.getByRole('dialog', { name: 'Delete Rule?' })).not.toHaveAttribute(
      'data-entered',
    );

    fireEvent.click(screen.getByRole('button', { name: 'Delete Rule' }));
    const backdrop = document.querySelector('.MuiBackdrop-root') as HTMLElement;
    fireEvent.mouseDown(backdrop);
    fireEvent.click(backdrop);

    expect(onConfirm).not.toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();
  });

  // Enter's activation of a focused button is the browser's own default action, not this dialog's
  // callback — jsdom never synthesizes that click itself, so the only observable trace of the
  // guard is whether it cancels the keydown (`fireEvent.keyDown`'s own return value, `false` only
  // when a cancelable event was `preventDefault()`-ed). The `<EditorUnsavedChangesDialog>` idiom.
  it.each(['Cancel', 'Delete Rule'])(
    'a repeat-carrying Enter on %s is prevented from activating it (FD5); a genuine one is not',
    (name) => {
      render(<RuleDeleteConfirmDialog {...props()} />);
      const button = screen.getByRole('button', { name });

      expect(fireEvent.keyDown(button, { key: 'Enter', repeat: true })).toBe(false);
      expect(fireEvent.keyDown(button, { key: 'Enter', repeat: false })).toBe(true);
    },
  );

  it('keeps the label rendered while open flips to false, until the exit transition ends', async () => {
    const onExited = vi.fn();
    const { rerender } = render(<RuleDeleteConfirmDialog {...props({ onExited })} />);
    const dialog = screen.getByRole('dialog', { name: 'Delete Rule?' });

    rerender(<RuleDeleteConfirmDialog {...props({ open: false, onExited })} />);

    expect(dialog).toHaveTextContent(
      '“Death by overpopulation” and its conditions will be removed from this organism.',
    );
    await waitFor(() => expect(onExited).toHaveBeenCalledTimes(1));
  });

  it('has no axe violations', async () => {
    render(<RuleDeleteConfirmDialog {...props()} />);
    await waitForEntered();

    expect((await axe(document.body)).violations).toEqual([]);
  });
});
