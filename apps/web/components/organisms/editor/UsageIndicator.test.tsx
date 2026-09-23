import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import UsageIndicator, { type UsageIndicatorProps } from './UsageIndicator';

/**
 * Story 4.20, AC2/AC3/AC4: the footer's presentation contract. Every derivation is the modal's
 * (FD11) — this component is handed resolved names and a number, so every case below is a literal.
 *
 * The Escape case is the one that cannot be seen by reading the component (FD4): MUI's `Modal`
 * listens for Escape on the modal root, so an unstopped `keydown` closes the whole editor. It is
 * asserted here against an ancestor handler, and again through the real modal in
 * `OrganismEditorModal.test.tsx`.
 */

const NAMES = ['Glider Wars', 'Corner Standoff'];

function mount(overrides: Partial<UsageIndicatorProps> = {}) {
  const onAncestorKeyDown = vi.fn();
  const result = render(
    // The ancestor handler stands in for the MUI `Modal` root's own Escape listener.
    <div onKeyDown={onAncestorKeyDown}>
      <p>outside</p>
      <UsageIndicator battleNames={NAMES} ruleCount={0} referencingNames={[]} {...overrides} />
    </div>,
  );
  return { ...result, onAncestorKeyDown };
}

function battlesTrigger() {
  return screen.getByRole('button', { name: /Used in/ });
}

describe('UsageIndicator — the battles label (AC2, AC3)', () => {
  it('renders zero as plain text: no button, no aria-expanded, no panel', () => {
    mount({ battleNames: [] });

    expect(screen.getByText('Used in 0 Battles')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(document.querySelector('[aria-expanded]')).toBeNull();
    expect(document.querySelector('[data-usage-battles-panel]')).toBeNull();
  });

  it('pluralises through the shared helper', () => {
    mount({ battleNames: ['Only One'] });

    expect(screen.getByRole('button', { name: 'Used in 1 Battle' })).toBeInTheDocument();
  });

  it('renders a non-zero count as a collapsed disclosure', () => {
    mount();

    const trigger = battlesTrigger();
    expect(trigger).toHaveAccessibleName('Used in 2 Battles');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  it('opens a read-only panel of battle names and closes it on a second click', async () => {
    const user = userEvent.setup();
    mount();

    await user.click(battlesTrigger());

    const trigger = battlesTrigger();
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    const panel = document.querySelector('[data-usage-battles-panel]');
    expect(panel).not.toBeNull();
    // `aria-controls` names the panel only while it exists — a reference to an id that is not in
    // the document is what axe flags on the collapsed state.
    expect(trigger.getAttribute('aria-controls')).toBe(panel?.getAttribute('id'));
    expect(
      within(panel as HTMLElement)
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual(NAMES);

    await user.click(battlesTrigger());

    expect(battlesTrigger()).toHaveAttribute('aria-expanded', 'false');
    expect(document.querySelector('[data-usage-battles-panel]')).toBeNull();
  });

  it('nothing inside the panel is focusable, a link, or navigable (FR-1.7, M7)', async () => {
    const user = userEvent.setup();
    mount();

    await user.click(battlesTrigger());

    const panel = document.querySelector('[data-usage-battles-panel]') as HTMLElement;
    expect(within(panel).queryByRole('link')).not.toBeInTheDocument();
    expect(within(panel).queryByRole('button')).not.toBeInTheDocument();
    expect(panel.querySelectorAll('a, button, input, [tabindex]')).toHaveLength(0);
  });

  it('keeps focus on the trigger while the panel is open', async () => {
    const user = userEvent.setup();
    mount();

    await user.click(battlesTrigger());

    expect(battlesTrigger()).toHaveFocus();
  });
});

describe('UsageIndicator — the rules label (AC2, AC5, FD13)', () => {
  it('renders nothing at all for M === 0 (NFR-4.1)', () => {
    mount({ ruleCount: 0, referencingNames: [] });

    expect(screen.queryByText(/Targeted by/)).not.toBeInTheDocument();
    expect(document.querySelector('[data-usage-rules]')).toBeNull();
  });

  it('counts RULES in the label and lists ORGANISMS in the panel', async () => {
    const user = userEvent.setup();
    mount({ ruleCount: 2, referencingNames: ['Aggressive Colonizer'] });

    // Two rules, one referencing organism — a panel whose item count equals M would be wrong.
    const trigger = screen.getByRole('button', { name: 'Targeted by 2 organism rules' });
    await user.click(trigger);

    const panel = document.querySelector('[data-usage-rules-panel]') as HTMLElement;
    expect(
      within(panel)
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual(['Aggressive Colonizer']);
  });

  it('pluralises one rule', () => {
    mount({ ruleCount: 1, referencingNames: ['Aggressive Colonizer'] });

    expect(screen.getByRole('button', { name: 'Targeted by 1 organism rule' })).toBeInTheDocument();
  });
});

describe('UsageIndicator — dismissal (AC3, AC4)', () => {
  it('opens at most one panel at a time', async () => {
    const user = userEvent.setup();
    mount({ ruleCount: 1, referencingNames: ['Aggressive Colonizer'] });

    await user.click(battlesTrigger());
    expect(document.querySelector('[data-usage-battles-panel]')).not.toBeNull();

    await user.click(screen.getByRole('button', { name: /Targeted by/ }));

    expect(document.querySelector('[data-usage-battles-panel]')).toBeNull();
    expect(document.querySelector('[data-usage-rules-panel]')).not.toBeNull();
  });

  it('Escape closes the panel and does NOT reach an ancestor keydown handler (FD4)', async () => {
    const user = userEvent.setup();
    const { onAncestorKeyDown } = mount();

    await user.click(battlesTrigger());
    await user.keyboard('{Escape}');

    expect(document.querySelector('[data-usage-battles-panel]')).toBeNull();
    expect(onAncestorKeyDown).not.toHaveBeenCalled();
    // Focus is back on (never left) the trigger, so a second Escape is the editor's.
    expect(battlesTrigger()).toHaveFocus();
  });

  it('Escape with no panel open passes straight through to the ancestor', async () => {
    const user = userEvent.setup();
    const { onAncestorKeyDown } = mount();

    battlesTrigger().focus();
    await user.keyboard('{Escape}');

    expect(onAncestorKeyDown).toHaveBeenCalledTimes(1);
  });

  it('a pointerdown outside the footer closes the open panel', async () => {
    const user = userEvent.setup();
    mount();

    await user.click(battlesTrigger());
    await user.click(screen.getByText('outside'));

    expect(document.querySelector('[data-usage-battles-panel]')).toBeNull();
  });

  it('a pointerdown inside the panel leaves it open', async () => {
    const user = userEvent.setup();
    mount();

    await user.click(battlesTrigger());
    await user.click(screen.getByText(NAMES[0]));

    expect(document.querySelector('[data-usage-battles-panel]')).not.toBeNull();
  });

  it('has no axe violations with a panel open', async () => {
    const user = userEvent.setup();
    const { container } = mount({ ruleCount: 2, referencingNames: ['Aggressive Colonizer'] });

    await user.click(battlesTrigger());

    expect((await axe(container)).violations).toEqual([]);
  });
});
