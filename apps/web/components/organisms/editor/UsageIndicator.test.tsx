import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
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
    // The ancestor handler stands in for the MUI `Modal` root's own Escape listener, and its
    // `tabIndex={-1}` for the Dialog paper — where focus lands after a click on anything that is
    // not itself focusable, such as a name inside a panel.
    <div onKeyDown={onAncestorKeyDown} tabIndex={-1} data-testid="ancestor">
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

  it('renders a non-zero count as a collapsed disclosure carrying aria-expanded AND aria-controls (AC3)', async () => {
    const { container } = mount();

    const trigger = battlesTrigger();
    expect(trigger).toHaveAccessibleName('Used in 2 Battles');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(trigger).toHaveAttribute('aria-controls');
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
    // Review (2026-09-23): the attribute was once dropped while collapsed on the claim that axe
    // flags a reference to an absent id — axe's `aria-valid-attr-value` skips that check while
    // `aria-expanded="false"`, which this scan of the COLLAPSED state pins.
    expect((await axe(container)).violations).toEqual([]);
  });

  it('opens a read-only panel of battle names and closes it on a second click', async () => {
    const user = userEvent.setup();
    mount();

    await user.click(battlesTrigger());

    const trigger = battlesTrigger();
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    const panel = document.querySelector('[data-usage-battles-panel]');
    expect(panel).not.toBeNull();
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

  // AC3 as amended by the owner's decision on review item D2 (2026-09-24): the name list is a
  // CAPPED scroll region, and axe's `scrollable-region-focusable` requires a scrollable container
  // with no focusable content to be focusable itself. So the list carries `tabIndex={0}` and an
  // accessible name, and the constraint that actually mattered — FR-1.7 / M7, nothing that
  // NAVIGATES away from an unsaved battle — is asserted as "nothing interactive" instead.
  it('the name list is the ONE focusable thing in the panel: a named scroll region, nothing interactive (FR-1.7, M7)', async () => {
    const user = userEvent.setup();
    mount();

    await user.click(battlesTrigger());

    const panel = document.querySelector('[data-usage-battles-panel]') as HTMLElement;
    expect(within(panel).queryByRole('link')).not.toBeInTheDocument();
    expect(within(panel).queryByRole('button')).not.toBeInTheDocument();
    expect(panel.querySelectorAll('a, button, input, select, textarea')).toHaveLength(0);

    const region = within(panel).getByRole('list');
    expect(region).toHaveAttribute('tabindex', '0');
    // Named by the title already on screen, not a second copy of the string.
    expect(region).toHaveAccessibleName('Used in these Battles');
    // …and it is the only focusable node in the panel, scroll region included.
    expect(panel.querySelectorAll('[tabindex]')).toHaveLength(1);
  });

  it('keeps focus on the trigger while the panel is open', async () => {
    const user = userEvent.setup();
    mount();

    await user.click(battlesTrigger());

    expect(battlesTrigger()).toHaveFocus();
  });

  // Review (2026-09-23): on Safari a mouse click does not focus a `<button>`, so the component
  // focuses its trigger itself. `fireEvent.click` has no focus side effect — the Safari shape —
  // where `user.click` always focuses and would pass without the fix.
  it('focuses the trigger on open even where the engine does not (WebKit)', () => {
    mount();

    fireEvent.click(battlesTrigger());

    expect(battlesTrigger()).toHaveFocus();
    expect(document.querySelector('[data-usage-battles-panel]')).not.toBeNull();
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

  // Review (2026-09-23), FD4's second reachable path: focus leaves the footer with the panel open
  // — Tab-away (accepted by decision D1), or a Safari click on the trigger — so the keydown never
  // passes through the footer. A footer-scoped handler missed it and the editor closed; the
  // document-capture listener does not. (A click inside the panel used to be this path too; since
  // D2 it lands on the list's scroll region, inside the footer — see "a pointerdown inside".)
  it('Escape closes the panel, returns focus to the trigger and reaches no ancestor when focus has left the footer', async () => {
    const user = userEvent.setup();
    const { onAncestorKeyDown } = mount();

    await user.click(battlesTrigger());
    screen.getByTestId('ancestor').focus();
    expect(battlesTrigger()).not.toHaveFocus();

    await user.keyboard('{Escape}');

    expect(document.querySelector('[data-usage-battles-panel]')).toBeNull();
    expect(onAncestorKeyDown).not.toHaveBeenCalled();
    expect(battlesTrigger()).toHaveFocus();
  });

  it('Escape with no panel open passes straight through to the ancestor', async () => {
    const user = userEvent.setup();
    const { onAncestorKeyDown } = mount();

    battlesTrigger().focus();
    await user.keyboard('{Escape}');

    expect(onAncestorKeyDown).toHaveBeenCalledTimes(1);
  });

  // Review (2026-09-24, third pass), the other half of D5: a panel opened MID-HOLD. The auto-repeat
  // guard protects the editor, but a sibling listener on the same node still runs after its
  // `stopPropagation`, so the panel-close listener must itself ignore a keydown carrying `repeat` —
  // or one hold closes the panel opened during it. The event is synthetic for the same reason as
  // the modal's held-Escape case: no test driver ever sets `repeat`.
  it('ignores an Escape keydown carrying `repeat` — the panel stays open and the ancestor is not reached (D5)', () => {
    const { onAncestorKeyDown } = mount();

    fireEvent.click(battlesTrigger());
    fireEvent.keyDown(battlesTrigger(), { key: 'Escape', repeat: true });

    expect(document.querySelector('[data-usage-battles-panel]')).not.toBeNull();
    expect(onAncestorKeyDown).not.toHaveBeenCalled();
  });

  // Review (2026-09-24, third pass): an Escape that cancels an IME composition. Firefox and WebKit
  // deliver it as `key: 'Escape'` with `isComposing` / `keyCode` 229 — reachable since D1 leaves a
  // panel open while focus is in the name field. MUI's root handler skips `which === 229`; this
  // listener mirrors that, so the composing keydown passes through untouched (the ancestor sees it,
  // as MUI would — and ignores it).
  it('leaves a composing Escape alone: the panel stays open and the keydown passes through', () => {
    const { onAncestorKeyDown } = mount();

    fireEvent.click(battlesTrigger());
    screen.getByTestId('ancestor').focus();
    fireEvent.keyDown(screen.getByTestId('ancestor'), {
      key: 'Escape',
      isComposing: true,
      keyCode: 229,
    });

    expect(document.querySelector('[data-usage-battles-panel]')).not.toBeNull();
    expect(onAncestorKeyDown).toHaveBeenCalledTimes(1);
    expect(battlesTrigger()).not.toHaveFocus();
  });

  // Decision D1 (2026-09-24): an outside press is NOT a focus-restoring path — focus follows the
  // press (here onto the `tabIndex=-1` ancestor, the paper's stand-in), never back to the trigger.
  it('a pointerdown outside the footer closes the open panel and leaves focus where the press landed (D1)', async () => {
    const user = userEvent.setup();
    mount();

    await user.click(battlesTrigger());
    await user.click(screen.getByText('outside'));

    expect(document.querySelector('[data-usage-battles-panel]')).toBeNull();
    expect(screen.getByTestId('ancestor')).toHaveFocus();
    expect(battlesTrigger()).not.toHaveFocus();
  });

  // Since decision D2 the list is the panel's one focusable node, so a press on a name lands
  // focus there — inside the footer, where a footer-scoped handler would still see the keydown.
  it('a pointerdown inside the panel leaves it open and focuses the list', async () => {
    const user = userEvent.setup();
    mount();

    await user.click(battlesTrigger());
    await user.click(screen.getByText(NAMES[0]));

    const panel = document.querySelector('[data-usage-battles-panel]') as HTMLElement;
    expect(panel).not.toBeNull();
    expect(within(panel).getByRole('list')).toHaveFocus();
  });

  // FD12's reason for two independent disclosures: with N = 0 the battles half is plain text and
  // the rules half is still a working disclosure — the shape one shared panel could not render
  // without a trigger that is text for one count and a button for the other.
  it('renders N = 0 as plain text beside a working rules disclosure (FD12)', async () => {
    const user = userEvent.setup();
    const { onAncestorKeyDown } = mount({
      battleNames: [],
      ruleCount: 1,
      referencingNames: ['Aggressive Colonizer'],
    });

    expect(screen.getByText('Used in 0 Battles')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Used in/ })).not.toBeInTheDocument();
    const trigger = screen.getByRole('button', { name: 'Targeted by 1 organism rule' });

    await user.click(trigger);
    const panel = document.querySelector('[data-usage-rules-panel]') as HTMLElement;
    expect(
      within(panel)
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual(['Aggressive Colonizer']);

    await user.keyboard('{Escape}');
    expect(document.querySelector('[data-usage-rules-panel]')).toBeNull();
    expect(onAncestorKeyDown).not.toHaveBeenCalled();
    expect(trigger).toHaveFocus();
  });

  // Two battles can resolve to the SAME display name (`Untitled Battle`); the index in the key is
  // what keeps React from warning — and a name-only key passes every other test here.
  it('renders duplicate display names as separate rows without a React key warning', async () => {
    const user = userEvent.setup();
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      mount({ battleNames: ['Untitled Battle', 'Untitled Battle'] });

      await user.click(battlesTrigger());

      const panel = document.querySelector('[data-usage-battles-panel]') as HTMLElement;
      expect(
        within(panel)
          .getAllByRole('listitem')
          .map((li) => li.textContent),
      ).toEqual(['Untitled Battle', 'Untitled Battle']);
      expect(consoleError).not.toHaveBeenCalled();
    } finally {
      consoleError.mockRestore();
    }
  });

  it('has no axe violations with a panel open', async () => {
    const user = userEvent.setup();
    const { container } = mount({ ruleCount: 2, referencingNames: ['Aggressive Colonizer'] });

    await user.click(battlesTrigger());

    expect((await axe(container)).violations).toEqual([]);
  });
});
