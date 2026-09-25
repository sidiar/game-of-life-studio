import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import { CONWAYS_CLASSIC, createMockOrganisms } from '@gol/test-utils';
import { PROTECTED_DELETE_MESSAGE } from '@/lib/organisms/usageLabels';
import { displayColor, MAX_AGE_SHADE } from '@/lib/palette/displayColor';
import OrganismCard from './OrganismCard';

// jsdom normalises an inline `hsl(...)`/hex `style.background` to `rgb(...)` on the way in
// (`OrganismRoster.test.tsx`'s identical comment) — round-tripping the LUT's own hsl string
// through a throwaway element gives the SAME normalisation the component's own inline style went
// through, rather than hand-converting hsl to rgb here.
function jsdomNormalizedColor(color: string): string {
  const probe = document.createElement('span');
  probe.style.background = color;
  return probe.style.background;
}

describe('OrganismCard', () => {
  it('renders the organism name as a level-2 heading', () => {
    render(
      <OrganismCard organism={CONWAYS_CLASSIC} onRequestEdit={vi.fn()} onRequestClone={vi.fn()} />,
    );

    expect(screen.getByRole('heading', { level: 2, name: "Conway's Classic" })).toBeInTheDocument();
  });

  it('paints the chip with the LUT-resolved identity-shade colour, never a literal hex', () => {
    const { container } = render(
      <OrganismCard organism={CONWAYS_CLASSIC} onRequestEdit={vi.fn()} onRequestClone={vi.fn()} />,
    );

    const chip = container.querySelector('[aria-hidden="true"]') as HTMLElement;
    // Guard first: if jsdom failed to parse the LUT's hsl string, BOTH sides would be '' and the
    // equality below would pass on nothing.
    expect(chip.style.background).not.toBe('');
    expect(chip.style.background).toBe(
      jsdomNormalizedColor(displayColor(CONWAYS_CLASSIC.colorToken, MAX_AGE_SHADE)),
    );
  });

  it('renders Dominance and Aging from the record', () => {
    const [, patientDefender] = createMockOrganisms();

    render(
      <OrganismCard organism={patientDefender} onRequestEdit={vi.fn()} onRequestClone={vi.fn()} />,
    );

    expect(screen.getByText('Dominance')).toBeInTheDocument();
    expect(screen.getByText(String(patientDefender.dominance))).toBeInTheDocument();
    expect(screen.getByText('Aging')).toBeInTheDocument();
    expect(screen.getByText('Yes')).toBeInTheDocument();
  });

  it('renders "No" for a non-aging organism', () => {
    render(
      <OrganismCard organism={CONWAYS_CLASSIC} onRequestEdit={vi.fn()} onRequestClone={vi.fn()} />,
    );

    expect(screen.getByText('No')).toBeInTheDocument();
  });

  it.each([
    [0, 'No rules'],
    [1, '1 rule'],
    [2, '2 rules'],
  ] as const)('shows "%s" -> "%s" as the rule-count label', (count, label) => {
    const organism = {
      ...CONWAYS_CLASSIC,
      survivalRules: CONWAYS_CLASSIC.survivalRules.slice(0, count),
    };

    render(<OrganismCard organism={organism} onRequestEdit={vi.fn()} onRequestClone={vi.fn()} />);

    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it('renders the SYSTEM tag and data-system when system is true', () => {
    const { container } = render(
      <OrganismCard
        organism={CONWAYS_CLASSIC}
        system
        onRequestEdit={vi.fn()}
        onRequestClone={vi.fn()}
      />,
    );

    expect(screen.getByText('SYSTEM')).toBeInTheDocument();
    expect(container.querySelector('article')).toHaveAttribute('data-system', '');
  });

  it('renders neither the SYSTEM tag nor data-system by default', () => {
    const { container } = render(
      <OrganismCard organism={CONWAYS_CLASSIC} onRequestEdit={vi.fn()} onRequestClone={vi.fn()} />,
    );

    expect(screen.queryByText('SYSTEM')).not.toBeInTheDocument();
    expect(container.querySelector('article')).not.toHaveAttribute('data-system');
  });

  // Story 4.17/4.18: the card has TWO keyboard stops — Edit then Clone — and the article is not
  // one of them (the Story 4.17 decision was "the article is not a stop", not "one stop per
  // card").
  it('the article is not a tab stop; Edit then Clone are, each named after the organism and keyed by its id', () => {
    render(
      <OrganismCard organism={CONWAYS_CLASSIC} onRequestEdit={vi.fn()} onRequestClone={vi.fn()} />,
    );

    const article = screen.getByRole('article');
    expect(article).not.toHaveAttribute('tabIndex');
    expect(article).toHaveAccessibleName("Conway's Classic");

    const edit = screen.getByRole('button', { name: "Edit Conway's Classic" });
    expect(edit).toBeEnabled();
    expect(edit).toHaveAttribute('data-edit-organism-id', CONWAYS_CLASSIC.id);
    expect(edit).toHaveTextContent('Edit');

    const clone = screen.getByRole('button', { name: "Clone Conway's Classic" });
    expect(clone).toBeEnabled();
    expect(clone).toHaveAttribute('data-clone-organism-id', CONWAYS_CLASSIC.id);
    expect(clone).toHaveTextContent('Clone');
  });

  it('tab order within a card is Edit then Clone', async () => {
    const user = userEvent.setup();
    render(
      <OrganismCard organism={CONWAYS_CLASSIC} onRequestEdit={vi.fn()} onRequestClone={vi.fn()} />,
    );

    await user.tab();
    expect(screen.getByRole('button', { name: "Edit Conway's Classic" })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: "Clone Conway's Classic" })).toHaveFocus();
  });

  it('names the Edit and Clone buttons after the display name for an all-whitespace name', () => {
    render(
      <OrganismCard
        organism={{ ...CONWAYS_CLASSIC, name: '   ' }}
        onRequestEdit={vi.fn()}
        onRequestClone={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: 'Edit Unnamed organism' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Clone Unnamed organism' })).toBeInTheDocument();
  });

  it('a click on Edit calls onRequestEdit exactly once, with no arguments', async () => {
    const user = userEvent.setup();
    const onRequestEdit = vi.fn();
    render(
      <OrganismCard
        organism={CONWAYS_CLASSIC}
        onRequestEdit={onRequestEdit}
        onRequestClone={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: "Edit Conway's Classic" }));

    expect(onRequestEdit).toHaveBeenCalledTimes(1);
    expect(onRequestEdit).toHaveBeenCalledWith();
  });

  it('a click on Clone calls onRequestClone exactly once and onRequestEdit never', async () => {
    const user = userEvent.setup();
    const onRequestEdit = vi.fn();
    const onRequestClone = vi.fn();
    render(
      <OrganismCard
        organism={CONWAYS_CLASSIC}
        onRequestEdit={onRequestEdit}
        onRequestClone={onRequestClone}
      />,
    );

    await user.click(screen.getByRole('button', { name: "Clone Conway's Classic" }));

    expect(onRequestClone).toHaveBeenCalledTimes(1);
    expect(onRequestClone).toHaveBeenCalledWith();
    expect(onRequestEdit).not.toHaveBeenCalled();
  });

  it('cloning disables ONLY the Clone button; a click on it then calls nothing', async () => {
    const user = userEvent.setup();
    const onRequestClone = vi.fn();
    render(
      <OrganismCard
        organism={CONWAYS_CLASSIC}
        cloning
        onRequestEdit={vi.fn()}
        onRequestClone={onRequestClone}
      />,
    );

    const edit = screen.getByRole('button', { name: "Edit Conway's Classic" });
    const clone = screen.getByRole('button', { name: "Clone Conway's Classic" });
    expect(edit).toBeEnabled();
    expect(clone).toBeDisabled();

    await user.click(clone);
    expect(onRequestClone).not.toHaveBeenCalled();
  });

  // M9 protects Conway's Classic from DELETION, not editing/cloning — the mockup renders its Edit
  // and Clone enabled (only Delete is disabled there).
  it('the SYSTEM card renders Edit and Clone enabled', () => {
    render(
      <OrganismCard
        organism={CONWAYS_CLASSIC}
        system
        onRequestEdit={vi.fn()}
        onRequestClone={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: "Edit Conway's Classic" })).toBeEnabled();
    expect(screen.getByRole('button', { name: "Clone Conway's Classic" })).toBeEnabled();
  });

  it('renders "Unnamed organism" for an all-whitespace name', () => {
    const unnamed = { ...CONWAYS_CLASSIC, name: '   ' };

    render(<OrganismCard organism={unnamed} onRequestEdit={vi.fn()} onRequestClone={vi.fn()} />);

    expect(screen.getByRole('heading', { level: 2, name: 'Unnamed organism' })).toBeInTheDocument();
  });

  it('has no axe accessibility violations', async () => {
    const { container } = render(
      <OrganismCard
        organism={CONWAYS_CLASSIC}
        system
        onRequestEdit={vi.fn()}
        onRequestClone={vi.fn()}
      />,
    );

    const results = await axe(container);
    expect(results.violations).toEqual([]);
  });

  it('has no axe accessibility violations with the Clone button disabled', async () => {
    const { container } = render(
      <OrganismCard
        organism={CONWAYS_CLASSIC}
        cloning
        onRequestEdit={vi.fn()}
        onRequestClone={vi.fn()}
      />,
    );

    const results = await axe(container);
    expect(results.violations).toEqual([]);
  });

  // Story 4.21, FD2: Delete renders iff the caller passes `onRequestDelete` — never a boolean.
  // Story 4.22 made the Library pass it on EVERY card (that inversion is pinned in
  // `OrganismLibrary.test.tsx`); the card's own contract is unchanged, so a caller that passes no
  // handler still gets no Delete.
  describe('Delete (Story 4.21)', () => {
    it('still renders no Delete button when onRequestDelete is not passed, even on the system card', () => {
      render(
        <OrganismCard
          organism={CONWAYS_CLASSIC}
          system
          onRequestEdit={vi.fn()}
          onRequestClone={vi.fn()}
        />,
      );

      expect(screen.queryByRole('button', { name: /^Delete/ })).not.toBeInTheDocument();
      expect(screen.queryByText(PROTECTED_DELETE_MESSAGE)).not.toBeInTheDocument();
    });

    it('renders Delete, correctly labelled and attributed, when onRequestDelete is passed', () => {
      render(
        <OrganismCard
          organism={CONWAYS_CLASSIC}
          onRequestEdit={vi.fn()}
          onRequestClone={vi.fn()}
          onRequestDelete={vi.fn()}
        />,
      );

      const del = screen.getByRole('button', { name: "Delete Conway's Classic" });
      expect(del).toHaveAttribute('data-delete-organism-id', CONWAYS_CLASSIC.id);
      expect(del).toHaveTextContent('Delete');
    });

    it('a click on Delete calls onRequestDelete exactly once, with no arguments', async () => {
      const user = userEvent.setup();
      const onRequestDelete = vi.fn();
      render(
        <OrganismCard
          organism={CONWAYS_CLASSIC}
          onRequestEdit={vi.fn()}
          onRequestClone={vi.fn()}
          onRequestDelete={onRequestDelete}
        />,
      );

      await user.click(screen.getByRole('button', { name: "Delete Conway's Classic" }));

      expect(onRequestDelete).toHaveBeenCalledTimes(1);
      expect(onRequestDelete).toHaveBeenCalledWith();
    });

    it('tab order is Edit then Clone then Delete when Delete renders', async () => {
      const user = userEvent.setup();
      render(
        <OrganismCard
          organism={CONWAYS_CLASSIC}
          onRequestEdit={vi.fn()}
          onRequestClone={vi.fn()}
          onRequestDelete={vi.fn()}
        />,
      );

      await user.tab();
      expect(screen.getByRole('button', { name: "Edit Conway's Classic" })).toHaveFocus();
      await user.tab();
      expect(screen.getByRole('button', { name: "Clone Conway's Classic" })).toHaveFocus();
      await user.tab();
      expect(screen.getByRole('button', { name: "Delete Conway's Classic" })).toHaveFocus();
    });

    it('has no axe accessibility violations with Delete rendered', async () => {
      const { container } = render(
        <OrganismCard
          organism={CONWAYS_CLASSIC}
          onRequestEdit={vi.fn()}
          onRequestClone={vi.fn()}
          onRequestDelete={vi.fn()}
        />,
      );

      const results = await axe(container);
      expect(results.violations).toEqual([]);
    });
  });

  // Story 4.22, FD6: the protected default's Delete is natively disabled, and its reason is
  // visible text the button names as its description.
  describe('protected Delete (Story 4.22)', () => {
    function renderProtected(onRequestDelete = vi.fn()) {
      return render(
        <OrganismCard
          organism={CONWAYS_CLASSIC}
          system
          onRequestEdit={vi.fn()}
          onRequestClone={vi.fn()}
          onRequestDelete={onRequestDelete}
        />,
      );
    }

    it('renders Delete disabled, described by the visible protected message', () => {
      renderProtected();

      const del = screen.getByRole('button', { name: "Delete Conway's Classic" });
      expect(del).toBeDisabled();
      expect(del).toHaveAccessibleDescription(PROTECTED_DELETE_MESSAGE);
      // The description target exists in the DOM and is visible text, not a tooltip (FD6).
      const note = document.getElementById(del.getAttribute('aria-describedby') ?? '');
      expect(note).not.toBeNull();
      expect(note).toHaveTextContent(PROTECTED_DELETE_MESSAGE);
      expect(note).toBeVisible();
    });

    it('a click on the disabled Delete calls nothing', async () => {
      const user = userEvent.setup();
      const onRequestDelete = vi.fn();
      renderProtected(onRequestDelete);

      await user.click(screen.getByRole('button', { name: "Delete Conway's Classic" }));

      expect(onRequestDelete).not.toHaveBeenCalled();
    });

    it('a non-system card has an enabled Delete and no note', () => {
      const [aggressive] = createMockOrganisms();
      render(
        <OrganismCard
          organism={aggressive}
          onRequestEdit={vi.fn()}
          onRequestClone={vi.fn()}
          onRequestDelete={vi.fn()}
        />,
      );

      const del = screen.getByRole('button', { name: `Delete ${aggressive.name}` });
      expect(del).toBeEnabled();
      expect(del).not.toHaveAttribute('aria-describedby');
      expect(screen.queryByText(PROTECTED_DELETE_MESSAGE)).not.toBeInTheDocument();
    });

    it('tab order on the protected card is Edit then Clone — the disabled Delete is skipped', async () => {
      const user = userEvent.setup();
      renderProtected();

      await user.tab();
      expect(screen.getByRole('button', { name: "Edit Conway's Classic" })).toHaveFocus();
      await user.tab();
      expect(screen.getByRole('button', { name: "Clone Conway's Classic" })).toHaveFocus();
      await user.tab();
      expect(document.body).toHaveFocus();
    });

    it('has no axe accessibility violations', async () => {
      const { container } = renderProtected();

      expect((await axe(container)).violations).toEqual([]);
    });
  });
});
