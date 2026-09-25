import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import ExportBattleDialog from './ExportBattleDialog';

// MUI's Dialog PORTALS to document.body — render()'s own `container` never contains it. Every
// query here goes through `screen` and every axe run is scoped to `document.body`.

function renderDialog(overrides: Partial<Parameters<typeof ExportBattleDialog>[0]> = {}) {
  const onCancel = vi.fn();
  const onChooseBattle = vi.fn();
  const onChooseWorkspace = vi.fn();
  const result = render(
    <ExportBattleDialog
      open
      needsSave={false}
      neverSaved={false}
      onCancel={onCancel}
      onChooseBattle={onChooseBattle}
      onChooseWorkspace={onChooseWorkspace}
      {...overrides}
    />,
  );
  return { ...result, onCancel, onChooseBattle, onChooseWorkspace };
}

describe('ExportBattleDialog (Story 5.6, AC2/AC7/AC9 — FR-7.13)', () => {
  it('quotes FR-7.13’s prompt and offers exactly the three actions, in order', () => {
    renderDialog();

    expect(screen.getByRole('dialog', { name: 'Export Battle' })).toBeInTheDocument();
    expect(
      screen.getByText('Export this Battle only, or export entire Workspace?'),
    ).toBeInTheDocument();

    const buttons = screen.getAllByRole('button');
    expect(buttons.map((button) => button.textContent)).toEqual([
      'Cancel',
      'Entire Workspace',
      'Battle Only',
    ]);
  });

  // Task 4 (code review 2026-09-25): the COMPUTED description, not the id plumbing — the save
  // note joins it only when it is shown.
  it('computes the accessible description from the prompt, plus the save note when needsSave', () => {
    const { unmount } = renderDialog();
    expect(screen.getByRole('dialog', { name: 'Export Battle' })).toHaveAccessibleDescription(
      'Export this Battle only, or export entire Workspace?',
    );
    unmount();

    renderDialog({ needsSave: true, neverSaved: true });
    expect(screen.getByRole('dialog', { name: 'Export Battle' })).toHaveAccessibleDescription(
      'Export this Battle only, or export entire Workspace? This battle has not been saved yet. ' +
        'Save & Export Battle saves it first; Entire Workspace exports only what is already saved.',
    );
  });

  it('open={false} renders no dialog at all (MUI unmounts by default)', () => {
    renderDialog({ open: false });

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('Cancel fires onCancel only', async () => {
    const user = userEvent.setup();
    const { onCancel, onChooseBattle, onChooseWorkspace } = renderDialog();

    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onChooseBattle).not.toHaveBeenCalled();
    expect(onChooseWorkspace).not.toHaveBeenCalled();
  });

  it('Entire Workspace fires onChooseWorkspace only', async () => {
    const user = userEvent.setup();
    const { onCancel, onChooseBattle, onChooseWorkspace } = renderDialog();

    await user.click(screen.getByRole('button', { name: 'Entire Workspace' }));

    expect(onChooseWorkspace).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
    expect(onChooseBattle).not.toHaveBeenCalled();
  });

  it('Battle Only fires onChooseBattle only', async () => {
    const user = userEvent.setup();
    const { onCancel, onChooseBattle, onChooseWorkspace } = renderDialog();

    await user.click(screen.getByRole('button', { name: 'Battle Only' }));

    expect(onChooseBattle).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
    expect(onChooseWorkspace).not.toHaveBeenCalled();
  });

  it('Escape routes to Cancel', async () => {
    const user = userEvent.setup();
    const { onCancel, onChooseBattle, onChooseWorkspace } = renderDialog();

    await user.keyboard('{Escape}');

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onChooseBattle).not.toHaveBeenCalled();
    expect(onChooseWorkspace).not.toHaveBeenCalled();
  });

  it('focuses Cancel on open, and Cancel is first in DOM order (AC9)', () => {
    renderDialog();

    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus();
    expect(screen.getAllByRole('button')[0]).toHaveAccessibleName('Cancel');
  });

  it('traps focus inside the dialog (AC9)', async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.tab();
    expect(screen.getByRole('button', { name: 'Entire Workspace' })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: 'Battle Only' })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('dialog')).toContainElement(document.activeElement as HTMLElement);
  });

  describe('needsSave — a dirty or never-saved battle (AC7)', () => {
    it('relabels Battle Only to Save & Export Battle, whose accessible name contains its visible text', () => {
      renderDialog({ needsSave: true, neverSaved: false });

      const button = screen.getByRole('button', { name: 'Save & Export Battle' });
      expect(button).toHaveAccessibleName(button.textContent ?? '');
      expect(screen.queryByRole('button', { name: 'Battle Only' })).toBeNull();
    });

    it('explains the save for a dirty, previously-saved battle', () => {
      renderDialog({ needsSave: true, neverSaved: false });

      expect(screen.getByText(/This battle has unsaved changes\./)).toBeInTheDocument();
      expect(screen.queryByText(/has not been saved yet/)).toBeNull();
    });

    it('explains the save differently for a battle that has never been saved', () => {
      renderDialog({ needsSave: true, neverSaved: true });

      expect(screen.getByText(/This battle has not been saved yet\./)).toBeInTheDocument();
      expect(screen.queryByText(/has unsaved changes/)).toBeNull();
    });

    it('needsSave={false} renders neither explanatory line', () => {
      renderDialog({ needsSave: false });

      expect(screen.queryByText(/unsaved changes/)).toBeNull();
      expect(screen.queryByText(/has not been saved yet/)).toBeNull();
      expect(screen.getByRole('button', { name: 'Battle Only' })).toBeInTheDocument();
    });
  });

  it('has no axe violations, plain (AC9)', async () => {
    renderDialog();

    expect((await axe(document.body)).violations).toEqual([]);
  });

  it('has no axe violations, needsSave (AC9)', async () => {
    renderDialog({ needsSave: true, neverSaved: true });

    expect((await axe(document.body)).violations).toEqual([]);
  });
});
