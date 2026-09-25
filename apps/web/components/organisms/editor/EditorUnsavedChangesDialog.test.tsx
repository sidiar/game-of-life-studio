import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import EditorUnsavedChangesDialog from './EditorUnsavedChangesDialog';

// MUI's Dialog PORTALS to document.body — render()'s own `container` never contains it. Every
// query here goes through `screen` and every axe run is scoped to `document.body`. The editor-level
// flows (which outcome runs when, focus restore, the inert window) are
// `OrganismEditorModal.test.tsx`'s; this file pins the component's own contract.

function renderDialog(overrides: Partial<Parameters<typeof EditorUnsavedChangesDialog>[0]> = {}) {
  const onKeepEditing = vi.fn();
  const onDiscard = vi.fn();
  const onSave = vi.fn();
  const result = render(
    <EditorUnsavedChangesDialog
      open
      onKeepEditing={onKeepEditing}
      onDiscard={onDiscard}
      onSave={onSave}
      {...overrides}
    />,
  );
  return { ...result, onKeepEditing, onDiscard, onSave };
}

describe('EditorUnsavedChangesDialog (Story 4.23 — UX-DR16)', () => {
  it('quotes UX-DR16’s copy and offers exactly Keep Editing, Discard, Save in that DOM order (FD4)', () => {
    renderDialog();

    const dialog = screen.getByRole('dialog', { name: 'Unsaved Changes' });
    expect(dialog).toHaveAccessibleDescription('You have unsaved changes. Discard changes?');
    expect(screen.getAllByRole('button').map((button) => button.textContent)).toEqual([
      'Keep Editing',
      'Discard',
      'Save',
    ]);
  });

  it('autoFocuses Keep Editing, so an immediate Enter changes nothing', () => {
    renderDialog();

    expect(screen.getByRole('button', { name: 'Keep Editing' })).toHaveFocus();
  });

  it('open={false} renders no dialog at all', () => {
    renderDialog({ open: false });

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it.each([
    ['Keep Editing', 'onKeepEditing'],
    ['Discard', 'onDiscard'],
    ['Save', 'onSave'],
  ] as const)('%s fires %s only', async (name, callback) => {
    const user = userEvent.setup();
    const spies = renderDialog();

    await user.click(screen.getByRole('button', { name }));

    for (const key of ['onKeepEditing', 'onDiscard', 'onSave'] as const) {
      expect(spies[key]).toHaveBeenCalledTimes(key === callback ? 1 : 0);
    }
  });

  it('Escape maps to Keep Editing', async () => {
    const user = userEvent.setup();
    const { onKeepEditing, onDiscard, onSave } = renderDialog();

    await user.keyboard('{Escape}');

    expect(onKeepEditing).toHaveBeenCalledTimes(1);
    expect(onDiscard).not.toHaveBeenCalled();
    expect(onSave).not.toHaveBeenCalled();
  });

  // FD10, the confirmation's own layer. ⚠️ SYNTHETIC: neither `user.keyboard` nor Playwright ever
  // sets `repeat`. Dispatched on the focused button inside the dialog, never on `document` — React
  // delegates to its root container, so an event targeted at `document` never reaches MUI's
  // `onKeyDown` and the test would pass with the guard deleted (the Story 4.20 D5 test's note).
  it('a repeat-carrying Escape does NOT dismiss it (FD10); a genuine one does', () => {
    const { onKeepEditing } = renderDialog();
    const keepEditing = screen.getByRole('button', { name: 'Keep Editing' });

    fireEvent.keyDown(keepEditing, { key: 'Escape', repeat: true });
    expect(onKeepEditing).not.toHaveBeenCalled();

    fireEvent.keyDown(keepEditing, { key: 'Escape', repeat: false });
    expect(onKeepEditing).toHaveBeenCalledTimes(1);
  });

  it('fires onExited once the close transition has finished', async () => {
    const onExited = vi.fn();
    const { rerender, onKeepEditing, onDiscard, onSave } = renderDialog({ onExited });

    rerender(
      <EditorUnsavedChangesDialog
        open={false}
        onKeepEditing={onKeepEditing}
        onDiscard={onDiscard}
        onSave={onSave}
        onExited={onExited}
      />,
    );

    await vi.waitFor(() => expect(onExited).toHaveBeenCalledTimes(1));
  });

  it('has no axe violations', async () => {
    renderDialog();

    expect((await axe(document.body)).violations).toEqual([]);
  });
});
