import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import OrganismDeleteBlockedDialog from './OrganismDeleteBlockedDialog';

// MUI's Dialog PORTALS to document.body — render()'s own `container` never contains it. Every
// query below goes through `screen` (which searches document.body), and axe runs are scoped to
// `document.body` too (`DeleteBattleDialog.test.tsx`'s identical precedent).

afterEach(() => {
  vi.restoreAllMocks();
});

describe('OrganismDeleteBlockedDialog', () => {
  it('renders the battle-only variant: title, sentence, names and remedy, with no rule section', () => {
    render(
      <OrganismDeleteBlockedDialog
        open
        organismName="Aggressive Colonizer"
        battleNames={['Three-Way Skirmish', 'Grand Colony War']}
        referencingNames={[]}
        onClose={vi.fn()}
      />,
    );

    const dialog = screen.getByRole('dialog', { name: 'Cannot delete Aggressive Colonizer' });
    expect(within(dialog).getByText('It is used in 2 Battles:')).toBeInTheDocument();
    expect(within(dialog).getByText('Three-Way Skirmish')).toBeInTheDocument();
    expect(within(dialog).getByText('Grand Colony War')).toBeInTheDocument();
    expect(
      within(dialog).getByText(
        'Remove it from those Battles, or delete the Battles, then try again.',
      ),
    ).toBeInTheDocument();
    expect(within(dialog).queryByText(/targeted by rules/i)).not.toBeInTheDocument();
  });

  it('renders the rule-only variant: sentence counts ORGANISMS, names and remedy, with no battle section', () => {
    render(
      <OrganismDeleteBlockedDialog
        open
        organismName="Aggressive Colonizer"
        battleNames={[]}
        referencingNames={['Chaotic Spreader']}
        onClose={vi.fn()}
      />,
    );

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('It is targeted by rules of 1 organism:')).toBeInTheDocument();
    expect(within(dialog).getByText('Chaotic Spreader')).toBeInTheDocument();
    expect(
      within(dialog).getByText('Edit those rules to remove the reference, then try again.'),
    ).toBeInTheDocument();
    expect(within(dialog).queryByText(/used in/i)).not.toBeInTheDocument();
  });

  it('renders BOTH sections, battles before rules, when both lists are non-empty (FD4)', () => {
    render(
      <OrganismDeleteBlockedDialog
        open
        organismName="Aggressive Colonizer"
        battleNames={['Three-Way Skirmish', 'Grand Colony War']}
        referencingNames={['Chaotic Spreader']}
        onClose={vi.fn()}
      />,
    );

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('It is used in 2 Battles:')).toBeInTheDocument();
    expect(within(dialog).getByText('It is targeted by rules of 1 organism:')).toBeInTheDocument();

    // Order: battles section's DOM position precedes the rules section's.
    const battleSentence = within(dialog).getByText('It is used in 2 Battles:');
    const ruleSentence = within(dialog).getByText('It is targeted by rules of 1 organism:');
    expect(
      battleSentence.compareDocumentPosition(ruleSentence) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('has exactly one button, OK, autoFocused', () => {
    render(
      <OrganismDeleteBlockedDialog
        open
        organismName="Aggressive Colonizer"
        battleNames={['Three-Way Skirmish']}
        referencingNames={[]}
        onClose={vi.fn()}
      />,
    );

    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(1);
    expect(buttons[0]).toHaveTextContent('OK');
    expect(buttons[0]).toHaveFocus();
  });

  it('OK calls onClose', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <OrganismDeleteBlockedDialog
        open
        organismName="Aggressive Colonizer"
        battleNames={['Three-Way Skirmish']}
        referencingNames={[]}
        onClose={onClose}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'OK' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('Escape calls onClose', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <OrganismDeleteBlockedDialog
        open
        organismName="Aggressive Colonizer"
        battleNames={['Three-Way Skirmish']}
        referencingNames={[]}
        onClose={onClose}
      />,
    );

    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('a backdrop click calls onClose', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const { container } = render(
      <OrganismDeleteBlockedDialog
        open
        organismName="Aggressive Colonizer"
        battleNames={['Three-Way Skirmish']}
        referencingNames={[]}
        onClose={onClose}
      />,
    );
    // The backdrop is a sibling of the dialog paper, portalled to document.body, not inside
    // render()'s own container — queried the way `DeleteBattleDialog`'s own suite proves the
    // portal (a class selector, since the backdrop carries no role).
    void container;
    const backdrop = document.querySelector('.MuiBackdrop-root') as HTMLElement;
    expect(backdrop).not.toBeNull();

    await user.click(backdrop);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('the organism name stays rendered while `open` flips to false (the exit fade must not flash empty)', () => {
    const { rerender } = render(
      <OrganismDeleteBlockedDialog
        open
        organismName="Aggressive Colonizer"
        battleNames={['Three-Way Skirmish']}
        referencingNames={[]}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByText('Cannot delete Aggressive Colonizer')).toBeInTheDocument();

    rerender(
      <OrganismDeleteBlockedDialog
        open={false}
        organismName="Aggressive Colonizer"
        battleNames={['Three-Way Skirmish']}
        referencingNames={[]}
        onClose={vi.fn()}
      />,
    );

    // Still in the DOM: MUI keeps the paper mounted through the exit transition.
    expect(screen.getByText('Cannot delete Aggressive Colonizer')).toBeInTheDocument();
    expect(screen.getByText('Three-Way Skirmish')).toBeInTheDocument();
  });

  it('has no axe violations in any variant', async () => {
    const { rerender } = render(
      <OrganismDeleteBlockedDialog
        open
        organismName="Aggressive Colonizer"
        battleNames={['Three-Way Skirmish', 'Grand Colony War']}
        referencingNames={[]}
        onClose={vi.fn()}
      />,
    );
    expect((await axe(document.body)).violations).toEqual([]);

    rerender(
      <OrganismDeleteBlockedDialog
        open
        organismName="Aggressive Colonizer"
        battleNames={[]}
        referencingNames={['Chaotic Spreader']}
        onClose={vi.fn()}
      />,
    );
    expect((await axe(document.body)).violations).toEqual([]);

    rerender(
      <OrganismDeleteBlockedDialog
        open
        organismName="Aggressive Colonizer"
        battleNames={['Three-Way Skirmish', 'Grand Colony War']}
        referencingNames={['Chaotic Spreader']}
        onClose={vi.fn()}
      />,
    );
    expect((await axe(document.body)).violations).toEqual([]);
  });

  it('has no axe violations with a 40-name battle list (FD10)', async () => {
    const names = Array.from({ length: 40 }, (_, i) => `Filler Battle ${i}`);
    render(
      <OrganismDeleteBlockedDialog
        open
        organismName="Aggressive Colonizer"
        battleNames={names}
        referencingNames={[]}
        onClose={vi.fn()}
      />,
    );

    expect((await axe(document.body)).violations).toEqual([]);
  });
});
