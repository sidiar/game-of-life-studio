import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
// Story 4.20, FD6: the two formatters now live in `lib/organisms/usageLabels.ts` (the editor
// footer renders the same copy). The assertions below are unchanged by the move — that is what
// makes it a move.
import {
  battleCountLabel,
  organismInUseMessage,
  type OrganismGateUsage,
} from '@/lib/organisms/usageLabels';
import OrganismInUseDialog, { type OrganismInUseDialogProps } from './OrganismInUseDialog';

// MUI's Dialog PORTALS to document.body — render()'s own `container` never contains it. Every
// query here goes through `screen` and every axe run is scoped to `document.body`; scoping either
// to `container` would silently pass against an empty tree.

// Story 4.24: the gate takes the RESOLVED usage — `battleNames.length` is N.
function usageOf(
  battleNames: readonly string[],
  ruleCount = 0,
  referencingNames: readonly string[] = [],
): OrganismGateUsage {
  return { battleNames, ruleCount, referencingNames };
}

const TWO_BATTLES = usageOf(['Glider Wars', 'Three-Way Skirmish']);

/** The dialog's action row — the usage disclosure above it is a `<button>` too (AC6). */
function actionRow(): HTMLElement {
  const actions = document.querySelector<HTMLElement>('.MuiDialogActions-root');
  if (actions === null) throw new Error('no action row');
  return actions;
}

function renderDialog(overrides: Partial<OrganismInUseDialogProps> = {}) {
  const onCancel = vi.fn();
  const onCloneAndEdit = vi.fn();
  const onEditAnyway = vi.fn();
  const result = render(
    <OrganismInUseDialog
      open
      origin="library"
      usage={TWO_BATTLES}
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
    renderDialog({ usage: usageOf(['Glider Wars']) });

    expect(screen.getByRole('dialog', { name: 'Used in 1 Battle' })).toBeInTheDocument();
    expect(
      screen.getByText(
        'This organism is used in 1 Battle. Editing it will affect all Battles that use it. Clone this organism first to create a Battle-specific variant?',
      ),
    ).toBeInTheDocument();
  });

  it('(a) three buttons, in DOM order, with their accessible names', () => {
    renderDialog({ usage: TWO_BATTLES });

    expect(screen.getByRole('dialog', { name: 'Used in 2 Battles' })).toBeInTheDocument();
    expect(
      screen.getByText(
        'This organism is used in 2 Battles. Editing it will affect all Battles that use it. Clone this organism first to create a Battle-specific variant?',
      ),
    ).toBeInTheDocument();
    expect(
      within(actionRow())
        .getAllByRole('button')
        .map((button) => button.textContent),
    ).toEqual(['Cancel', 'Clone & Edit', 'Edit Anyway']);
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

    // The three ACTIONS — the read-only usage disclosure stays usable (it changes nothing).
    within(actionRow())
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

describe('OrganismInUseDialog — the battle variant (Story 4.24, FR-1.3, M5, FD3)', () => {
  it('has exactly two actions, Cancel first and autofocused, Edit Anyway last and contained', async () => {
    renderDialog({ origin: 'battle', onCloneAndEdit: undefined });

    expect(screen.getByRole('dialog', { name: 'Used in 2 Battles' })).toBeInTheDocument();
    const buttons = within(actionRow()).getAllByRole('button');
    expect(buttons.map((button) => button.textContent)).toEqual(['Cancel', 'Edit Anyway']);
    expect(buttons[1]).toHaveClass('MuiButton-contained');
    expect(screen.queryByRole('button', { name: 'Clone & Edit' })).toBeNull();
    await waitFor(() => expect(buttons[0]).toHaveFocus());
  });

  it('withholds Clone & Edit even if a callback is passed — the origin decides', () => {
    renderDialog({ origin: 'battle' });

    expect(screen.queryByRole('button', { name: 'Clone & Edit' })).toBeNull();
  });

  it('shows the battle sentence, not the PRD clone question', () => {
    renderDialog({ origin: 'battle', usage: usageOf(['Glider Wars']) });

    expect(
      screen.getByText(
        'This organism is used in 1 Battle. Editing it will affect all Battles that use it. To make a variant for this Battle only, clone it in the Organism Library and select the clone here.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Clone this organism first/)).toBeNull();
  });

  it('Edit Anyway and Cancel fire their own callbacks only', async () => {
    const user = userEvent.setup();
    const { onCancel, onEditAnyway } = renderDialog({
      origin: 'battle',
      onCloneAndEdit: undefined,
    });

    await user.click(screen.getByRole('button', { name: 'Edit Anyway' }));
    expect(onEditAnyway).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('axe: the battle variant', async () => {
    renderDialog({ origin: 'battle', onCloneAndEdit: undefined });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus());

    expect((await axe(document.body)).violations).toEqual([]);
  });
});

describe('OrganismInUseDialog — the expandable count (Story 4.24, AC6, FR-1.7, M7)', () => {
  it.each(['library', 'battle'] as const)(
    '%s: the battle disclosure lists the names behind N, read-only',
    async (origin) => {
      const user = userEvent.setup();
      renderDialog({ origin, usage: usageOf(['Glider Wars', 'Current Battle (unsaved)']) });

      const trigger = screen.getByRole('button', { name: /^Used in 2 Battles/ });
      expect(trigger).toHaveAttribute('aria-expanded', 'false');
      await user.click(trigger);

      expect(trigger).toHaveAttribute('aria-expanded', 'true');
      const panel = document.querySelector<HTMLElement>('[data-usage-battles-panel]');
      if (panel === null) throw new Error('no panel');
      expect(
        within(panel)
          .getAllByRole('listitem')
          .map((item) => item.textContent),
      ).toEqual(['Glider Wars', 'Current Battle (unsaved)']);
      // Names only — nothing to navigate to (M7).
      expect(within(panel).queryByRole('link')).toBeNull();
      expect(within(panel).queryByRole('button')).toBeNull();
    },
  );

  it('renders the rule disclosure only when M > 0, with the referencing names', async () => {
    const user = userEvent.setup();
    renderDialog({ usage: usageOf(['Glider Wars'], 2, ['Aggressive Colonizer']) });

    await user.click(screen.getByRole('button', { name: /^Targeted by 2 organism rules/ }));
    const panel = document.querySelector<HTMLElement>('[data-usage-rules-panel]');
    if (panel === null) throw new Error('no panel');
    expect(within(panel).getByText('Aggressive Colonizer')).toBeInTheDocument();
  });

  it('renders no rule disclosure when M = 0', () => {
    renderDialog({ usage: usageOf(['Glider Wars']) });

    expect(screen.queryByRole('button', { name: /Targeted by/ })).toBeNull();
  });

  // Story 4.20 D5 inside the gate: one Escape closes one layer. The indicator's document-capture
  // listener runs before MUI's bubble-phase handler, so the first Escape closes the panel only.
  it('Escape layering: the first Escape closes an open panel only, the next one cancels the gate', async () => {
    const user = userEvent.setup();
    const { onCancel } = renderDialog({ origin: 'battle', onCloneAndEdit: undefined });
    const trigger = screen.getByRole('button', { name: /^Used in 2 Battles/ });
    await user.click(trigger);
    expect(document.querySelector('[data-usage-battles-panel]')).not.toBeNull();

    await user.keyboard('{Escape}');

    expect(document.querySelector('[data-usage-battles-panel]')).toBeNull();
    expect(onCancel).not.toHaveBeenCalled();
    expect(trigger).toHaveFocus();

    await user.keyboard('{Escape}');

    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('axe: both variants with the battle panel open', async () => {
    const user = userEvent.setup();
    const { unmount } = renderDialog({
      usage: usageOf(['Glider Wars'], 1, ['Aggressive Colonizer']),
    });
    await user.click(screen.getByRole('button', { name: /^Used in 1 Battle/ }));
    expect((await axe(document.body)).violations).toEqual([]);
    unmount();

    renderDialog({ origin: 'battle', onCloneAndEdit: undefined });
    await user.click(screen.getByRole('button', { name: /^Used in 2 Battles/ }));
    expect((await axe(document.body)).violations).toEqual([]);
  });
});
