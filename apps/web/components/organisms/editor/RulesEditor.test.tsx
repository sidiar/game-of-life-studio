import { useEffect, useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import type { SurvivalRule } from '@gol/domain';
import { CONWAYS_CLASSIC, createMockOrganisms } from '@gol/test-utils';
import {
  appendRule,
  createNewRuleDraft,
  ruleActionLabel,
  ruleDraftFrom,
  type RuleDraft,
} from '@/lib/organisms/ruleDraft';
import RulesEditor from './RulesEditor';

const NO_RULES: readonly RuleDraft[] = [];
const ORGANISMS = [
  { id: 'org-a', name: 'Alpha' },
  { id: 'org-b', name: 'Beta' },
];

// Deterministic id counter, never `crypto` — matches the `ruleDraft.test.ts` idiom.
function counter() {
  let n = 0;
  return () => `c${++n}`;
}

// One rule of each action, drawn from the mock organisms' real rules — Conway's Classic has no Die
// rule (`defaultWorkspace.ts`'s own comment: order-is-priority means no explicit Die rule is
// needed), so the Die rule comes from a mock organism.
function ruleWithAction(rules: readonly SurvivalRule[], action: RuleDraft['payload']['action']) {
  const rule = rules.find((r) => r.payload.action === action);
  if (!rule) throw new Error(`fixture has no ${action} rule`);
  return rule;
}

const [aggressive] = createMockOrganisms();
const THREE: readonly RuleDraft[] = [
  ruleDraftFrom(ruleWithAction(CONWAYS_CLASSIC.survivalRules, 'born'), counter()),
  ruleDraftFrom(ruleWithAction(CONWAYS_CLASSIC.survivalRules, 'survive'), counter()),
  ruleDraftFrom(ruleWithAction(aggressive.survivalRules, 'die'), counter()),
];

/** Holds `rules` in real state and wires `onRulesChange`/`onAddRule` to the modal's own shape
 * (Task 6): the id is minted OUTSIDE the updater, exactly as `<OrganismEditorModal>`'s `addRule`
 * does, so this harness exercises the real contract. `HarnessAdd` stands in for the layout's
 * header action (outside `<RulesEditor>` in the real tree, `<OrganismEditorModal>`'s to render) —
 * it calls the SAME `onAddRule`, since both controls share one id-minting callback. `onState`
 * reports every committed `rules` array, so a test can assert on REFERENCES the DOM cannot show. */
function Harness({
  initial,
  onState,
}: {
  initial: readonly RuleDraft[];
  onState?: (rules: readonly RuleDraft[]) => void;
}) {
  const [rules, setRules] = useState<readonly RuleDraft[]>(initial);
  useEffect(() => {
    onState?.(rules);
  }, [rules, onState]);
  const addRule = () => {
    const id = crypto.randomUUID();
    setRules((current) => appendRule(current, createNewRuleDraft(id)));
  };
  return (
    <>
      <button type="button" onClick={addRule}>
        Harness Add
      </button>
      <RulesEditor
        rules={rules}
        organisms={ORGANISMS}
        onRulesChange={(update) => setRules((current) => update(current))}
        onAddRule={addRule}
      />
    </>
  );
}

describe('RulesEditor', () => {
  it('shows the empty state with zero rules', () => {
    const { container } = render(<Harness initial={NO_RULES} />);

    // The attribute is the e2e's locator — pin it here so a rename fails in jsdom, not WebKit.
    expect(container.querySelector('[data-rules-empty-state]')).not.toBeNull();
    expect(screen.getByText('No Rules Defined')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Add rules to define when cells are born, survive, or die during simulation.',
      ),
    ).toBeInTheDocument();
    const button = screen.getByRole('button', { name: '+ Add Rule' });
    expect(button).toHaveAttribute('data-add-rule', 'empty');
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
    expect(screen.queryByRole('group')).not.toBeInTheDocument();
  });

  it('adding from the empty state mounts the list, focuses the new Summary', async () => {
    const user = userEvent.setup();
    render(<Harness initial={NO_RULES} />);

    await user.click(screen.getByRole('button', { name: '+ Add Rule' }));

    expect(screen.queryByText('No Rules Defined')).not.toBeInTheDocument();
    const list = screen.getByRole('list', { name: 'Survival rules' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(1);
    const group = screen.getByRole('group', { name: 'Rule 1' });
    expect(within(group).getByRole('combobox')).toHaveValue('born');
    const summary = within(group).getByRole('textbox', { name: 'Summary' });
    expect(summary).toHaveValue('');
    expect(document.activeElement).toBe(summary);
  });

  it('add appends, keeps earlier rules by reference, focuses the new Summary', async () => {
    const user = userEvent.setup();
    let latest: readonly RuleDraft[] = [];
    render(
      <Harness
        initial={THREE}
        onState={(rules) => {
          latest = rules;
        }}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Harness Add' }));

    expect(screen.getAllByRole('listitem')).toHaveLength(4);
    expect(latest).toHaveLength(4);
    expect(latest[0]).toBe(THREE[0]);
    expect(latest[1]).toBe(THREE[1]);
    expect(latest[2]).toBe(THREE[2]);
    const group = screen.getByRole('group', { name: 'Rule 4' });
    const summary = within(group).getByRole('textbox', { name: 'Summary' });
    expect(document.activeElement).toBe(summary);
  });

  it('cards render in order, labelled by position', () => {
    render(<Harness initial={THREE} />);

    // The condition fieldsets are `group`s too now (AC1/AC11c) — filter to the rule cards.
    expect(
      screen
        .getAllByRole('group', { name: /^Rule \d$/ })
        .map((g) => within(g).getByText(/^Rule \d$/).textContent),
    ).toEqual(['Rule 1', 'Rule 2', 'Rule 3']);
    const badges = document.querySelectorAll('[data-rule-badge]');
    expect(Array.from(badges).map((b) => b.textContent)).toEqual(
      (['born', 'survive', 'die'] as const).map(ruleActionLabel),
    );
  });

  it('deleting the middle renumbers and focuses the Summary of the card now at that position', async () => {
    const user = userEvent.setup();
    render(<Harness initial={THREE} />);

    await user.click(screen.getByRole('button', { name: 'Delete rule 2' }));

    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    expect(screen.getByRole('group', { name: 'Rule 1' })).toBeInTheDocument();
    const second = screen.getByRole('group', { name: 'Rule 2' });
    expect(within(second).getByRole('combobox', { name: 'Action' })).toHaveValue('die');
    // The neighbour's Summary, not its Delete (AC5) — Enter auto-repeats on a `<button>`, so
    // another destructive control would let a held Enter cascade deletions.
    expect(document.activeElement).toBe(within(second).getByRole('textbox', { name: 'Summary' }));
  });

  it('deleting the last focuses the new last card Summary', async () => {
    const user = userEvent.setup();
    render(<Harness initial={THREE} />);

    await user.click(screen.getByRole('button', { name: 'Delete rule 3' }));

    const second = screen.getByRole('group', { name: 'Rule 2' });
    expect(document.activeElement).toBe(within(second).getByRole('textbox', { name: 'Summary' }));
  });

  // The cascade the Summary target exists to prevent (AC5): after a keyboard delete, focus is on
  // an `<input>` with no `<form>` around it, so a repeated Enter has nothing left to activate.
  it('a second Enter after a keyboard delete removes nothing more', async () => {
    const user = userEvent.setup();
    render(<Harness initial={THREE} />);

    screen.getByRole('button', { name: 'Delete rule 2' }).focus();
    await user.keyboard('{Enter}');
    expect(screen.getAllByRole('listitem')).toHaveLength(2);

    await user.keyboard('{Enter}');

    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    const second = screen.getByRole('group', { name: 'Rule 2' });
    expect(document.activeElement).toBe(within(second).getByRole('textbox', { name: 'Summary' }));
  });

  it('deleting the only rule returns to the empty state, focused on Add Rule', async () => {
    const user = userEvent.setup();
    render(<Harness initial={[THREE[0]]} />);

    await user.click(screen.getByRole('button', { name: 'Delete rule 1' }));

    expect(screen.getByText('No Rules Defined')).toBeInTheDocument();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: '+ Add Rule' }));
  });

  // The delete rule's OTHER branch: focus a user placed on a real control inside the list is
  // left alone. `fireEvent.click` dispatches the click without the focus move a pointer makes —
  // the shape of a mouse click in a browser that does not focus buttons on click.
  it('deleting while focus sits in another card leaves that focus alone', async () => {
    render(<Harness initial={THREE} />);

    const third = screen.getByRole('group', { name: 'Rule 3' });
    const summary = within(third).getByRole('textbox', { name: 'Summary' });
    summary.focus();
    fireEvent.click(screen.getByRole('button', { name: 'Delete rule 1' }));

    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    expect(document.activeElement).toBe(summary);
    expect(screen.getByRole('group', { name: 'Rule 2' })).toContainElement(summary);
  });

  it('a summary keystroke round-trips and moves no focus', async () => {
    const user = userEvent.setup();
    render(<Harness initial={THREE} />);

    const first = screen.getByRole('group', { name: 'Rule 1' });
    const summary = within(first).getByRole('textbox', { name: 'Summary' });
    summary.focus();
    await user.type(summary, 'a');

    expect(summary).toHaveValue(`${THREE[0].payload.summary}a`);
    const second = screen.getByRole('group', { name: 'Rule 2' });
    expect(within(second).getByRole('textbox', { name: 'Summary' })).toHaveValue(
      THREE[1].payload.summary,
    );
    expect(document.activeElement).toBe(summary);
  });

  it('an action change round-trips without touching other badges', async () => {
    const user = userEvent.setup();
    render(<Harness initial={THREE} />);

    const first = screen.getByRole('group', { name: 'Rule 1' });
    await user.selectOptions(within(first).getByRole('combobox', { name: 'Action' }), 'survive');

    expect(within(first).getByRole('combobox', { name: 'Action' })).toHaveValue('survive');
    expect(first.querySelector('[data-rule-badge]')).toHaveTextContent(ruleActionLabel('survive'));
    const second = screen.getByRole('group', { name: 'Rule 2' });
    const third = screen.getByRole('group', { name: 'Rule 3' });
    expect(within(second).getByRole('combobox', { name: 'Action' })).toHaveValue('survive');
    expect(second.querySelector('[data-rule-badge]')).toHaveTextContent(ruleActionLabel('survive'));
    expect(within(third).getByRole('combobox', { name: 'Action' })).toHaveValue('die');
    expect(third.querySelector('[data-rule-badge]')).toHaveTextContent(ruleActionLabel('die'));
  });

  it('mounting with a seeded list steals no focus', () => {
    render(<Harness initial={THREE} />);

    expect(document.activeElement).toBe(document.body);
  });

  it('has no axe violations with three rules', async () => {
    const { container } = render(<Harness initial={THREE} />);
    expect((await axe(container)).violations).toEqual([]);
  });

  it('has no axe violations in the empty state', async () => {
    const { container } = render(<Harness initial={NO_RULES} />);
    expect((await axe(container)).violations).toEqual([]);
  });

  // Story 4.11, Task 8 (m): a condition edit round-trips through the rules list, and the outer
  // (rule-count) focus effect stays inert — same rule count, so it must not fight the inner
  // (condition-count) effect that DID just move focus.
  it('a condition edit round-trips through the rules list and moves no focus', async () => {
    const user = userEvent.setup();
    let latest: readonly RuleDraft[] = [];
    render(
      <Harness
        initial={THREE}
        onState={(rules) => {
          latest = rules;
        }}
      />,
    );

    const first = screen.getByRole('group', { name: 'Rule 1' });
    await user.click(within(first).getByRole('button', { name: '+ Add Condition' }));

    const newProperty = within(first).getByRole('combobox', { name: 'Condition 3 property' });
    expect(document.activeElement).toBe(newProperty);

    await user.selectOptions(newProperty, 'neighborCount');
    const value = within(first).getByRole('textbox', { name: 'Condition 3 value' });
    await user.type(value, '4');

    expect(latest[0].conditions[2]).toMatchObject({ property: 'neighborCount', pattern: '4' });
    expect(latest[1]).toBe(THREE[1]);
    expect(latest[2]).toBe(THREE[2]);
    expect(document.activeElement).toBe(
      within(screen.getByRole('group', { name: 'Rule 1' })).getByRole('textbox', {
        name: 'Condition 3 value',
      }),
    );
  });

  // Story 4.12, Task 4. jsdom performs no layout, so every `[data-rule-id]` card's
  // `getBoundingClientRect()` is spied per element (the `<PetriDishCanvas>` `RECT` idiom) — tops
  // `0 / 112 / 224`, height 100, so the 12px gap sits between them.
  function rectsFor(tops: readonly number[]) {
    const cards = document.querySelectorAll<HTMLElement>('[data-rule-id]');
    cards.forEach((el, i) => {
      const top = tops[i];
      if (top === undefined) return;
      vi.spyOn(el, 'getBoundingClientRect').mockReturnValue({
        top,
        height: 100,
        bottom: top + 100,
        left: 0,
        right: 500,
        width: 500,
        x: 0,
        y: top,
        toJSON() {
          return {};
        },
      });
    });
  }

  function badges() {
    return Array.from(document.querySelectorAll('[data-rule-badge]')).map((b) => b.textContent);
  }

  describe('rule reordering (Story 4.12)', () => {
    it('ArrowDown moves the rule, renumbers, re-focuses the moved handle, announces; a same-length change elsewhere still moves no focus', async () => {
      const user = userEvent.setup();
      let latest: readonly RuleDraft[] = [];
      render(
        <Harness
          initial={THREE}
          onState={(rules) => {
            latest = rules;
          }}
        />,
      );

      screen.getByRole('button', { name: 'Reorder rule 1' }).focus();
      await user.keyboard('{ArrowDown}');

      expect(badges()).toEqual(['Survive', 'Born', 'Die']);
      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Reorder rule 2' }));
      const second = screen.getByRole('group', { name: 'Rule 2' });
      expect(within(second).getByRole('combobox', { name: 'Action' })).toHaveValue('born');
      expect(screen.getByRole('status')).toHaveTextContent('Rule moved to position 2 of 3');
      expect(latest[0]).toBe(THREE[1]);
      expect(latest[2]).toBe(THREE[2]);

      // The existing same-length habit (Story 4.10/4.11): a keystroke elsewhere moves no focus —
      // the pending-focus ref set by the reorder above was cleared on this render.
      const third = screen.getByRole('group', { name: 'Rule 3' });
      const thirdSummary = within(third).getByRole('textbox', { name: 'Summary' });
      await user.type(thirdSummary, 'x');
      expect(document.activeElement).toBe(thirdSummary);
    });

    it('ArrowUp moves it back; the identical sentence is announced by a fresh node', async () => {
      const user = userEvent.setup();
      render(<Harness initial={THREE} />);

      screen.getByRole('button', { name: 'Reorder rule 1' }).focus();
      await user.keyboard('{ArrowDown}');
      const firstSpan = screen.getByRole('status').querySelector('span');

      await user.keyboard('{ArrowUp}');
      expect(badges()).toEqual(['Born', 'Survive', 'Die']);
      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Reorder rule 1' }));

      await user.keyboard('{ArrowDown}');
      const secondSpan = screen.getByRole('status').querySelector('span');
      expect(secondSpan).not.toBe(firstSpan);
      expect(screen.getByRole('status')).toHaveTextContent('Rule moved to position 2 of 3');
    });

    it('boundary keys are consumed no-ops: no move, no focus change, no announcement', () => {
      let latest: readonly RuleDraft[] = [];
      render(
        <Harness
          initial={THREE}
          onState={(rules) => {
            latest = rules;
          }}
        />,
      );

      const first = screen.getByRole('button', { name: 'Reorder rule 1' });
      first.focus();
      expect(fireEvent.keyDown(first, { key: 'ArrowUp' })).toBe(false);
      expect(document.activeElement).toBe(first);
      expect(latest).toBe(THREE);

      const third = screen.getByRole('button', { name: 'Reorder rule 3' });
      third.focus();
      expect(fireEvent.keyDown(third, { key: 'ArrowDown' })).toBe(false);
      expect(document.activeElement).toBe(third);
      expect(latest).toBe(THREE);
      expect(screen.getByRole('status')).toBeEmptyDOMElement();
    });

    it('a pointer drag down shows dragging then the after indicator, and commits on drop', () => {
      let latest: readonly RuleDraft[] = [];
      render(
        <Harness
          initial={THREE}
          onState={(rules) => {
            latest = rules;
          }}
        />,
      );
      rectsFor([0, 112, 224]);

      const handle1 = screen.getByRole('button', { name: 'Reorder rule 1' });
      fireEvent.pointerDown(handle1, { button: 0, isPrimary: true, pointerId: 1 });

      const listItems = () => screen.getAllByRole('listitem');
      expect(listItems()[0]).toHaveAttribute('data-dragging');
      expect(document.querySelectorAll('[data-drop]')).toHaveLength(0);

      fireEvent.pointerMove(handle1, { pointerId: 1, buttons: 1, clientY: 300 });
      expect(listItems()[2]).toHaveAttribute('data-drop', 'after');
      expect(listItems()[0]).not.toHaveAttribute('data-drop');
      expect(listItems()[1]).not.toHaveAttribute('data-drop');

      fireEvent.pointerUp(handle1, { pointerId: 1 });

      expect(badges()).toEqual(['Survive', 'Die', 'Born']);
      expect(document.querySelectorAll('[data-dragging]')).toHaveLength(0);
      expect(document.querySelectorAll('[data-drop]')).toHaveLength(0);
      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Reorder rule 3' }));
      expect(screen.getByRole('status')).toHaveTextContent('Rule moved to position 3 of 3');
      expect(latest).not.toBe(THREE);
    });

    it('a pointer drag up shows the before indicator, and commits on drop', () => {
      render(<Harness initial={THREE} />);
      rectsFor([0, 112, 224]);

      const handle3 = screen.getByRole('button', { name: 'Reorder rule 3' });
      fireEvent.pointerDown(handle3, { button: 0, isPrimary: true, pointerId: 1 });
      fireEvent.pointerMove(handle3, { pointerId: 1, buttons: 1, clientY: 40 });

      const listItems = screen.getAllByRole('listitem');
      expect(listItems[0]).toHaveAttribute('data-drop', 'before');

      fireEvent.pointerUp(handle3, { pointerId: 1 });
      expect(badges()).toEqual(['Die', 'Born', 'Survive']);
    });

    it('a pointer drag back to its own slot commits nothing', () => {
      let latest: readonly RuleDraft[] = [];
      render(
        <Harness
          initial={THREE}
          onState={(rules) => {
            latest = rules;
          }}
        />,
      );
      rectsFor([0, 112, 224]);

      const handle2 = screen.getByRole('button', { name: 'Reorder rule 2' });
      fireEvent.pointerDown(handle2, { button: 0, isPrimary: true, pointerId: 1 });
      fireEvent.pointerMove(handle2, { pointerId: 1, buttons: 1, clientY: 300 });
      expect(document.querySelectorAll('[data-drop]')).toHaveLength(1);

      fireEvent.pointerMove(handle2, { pointerId: 1, buttons: 1, clientY: 160 });
      expect(document.querySelectorAll('[data-drop]')).toHaveLength(0);

      fireEvent.pointerUp(handle2, { pointerId: 1 });
      expect(latest).toBe(THREE);
      expect(screen.getByRole('status')).toBeEmptyDOMElement();
    });

    it('Escape mid-drag cancels the drag and is stopped before a keydown listener above it', () => {
      const spy = vi.fn();
      let latest: readonly RuleDraft[] = [];
      render(
        <div onKeyDown={spy}>
          <Harness
            initial={THREE}
            onState={(rules) => {
              latest = rules;
            }}
          />
        </div>,
      );
      rectsFor([0, 112, 224]);

      const handle1 = screen.getByRole('button', { name: 'Reorder rule 1' });
      fireEvent.pointerDown(handle1, { button: 0, isPrimary: true, pointerId: 1 });
      fireEvent.pointerMove(handle1, { pointerId: 1, buttons: 1, clientY: 300 });

      fireEvent.keyDown(handle1, { key: 'Escape' });

      expect(document.querySelectorAll('[data-dragging]')).toHaveLength(0);
      expect(document.querySelectorAll('[data-drop]')).toHaveLength(0);
      expect(spy).not.toHaveBeenCalled();

      fireEvent.pointerUp(handle1, { pointerId: 1 });
      expect(latest).toBe(THREE);

      // The listener lived only for the life of the drag — gone now, so Escape reaches the spy.
      fireEvent.keyDown(handle1, { key: 'Escape' });
      expect(spy).toHaveBeenCalledTimes(1);
    });

    it('pointercancel mid-drag cancels the drag', () => {
      let latest: readonly RuleDraft[] = [];
      render(
        <Harness
          initial={THREE}
          onState={(rules) => {
            latest = rules;
          }}
        />,
      );
      rectsFor([0, 112, 224]);

      const handle1 = screen.getByRole('button', { name: 'Reorder rule 1' });
      fireEvent.pointerDown(handle1, { button: 0, isPrimary: true, pointerId: 1 });
      fireEvent.pointerMove(handle1, { pointerId: 1, buttons: 1, clientY: 300 });
      fireEvent.pointerCancel(handle1, { pointerId: 1 });

      expect(document.querySelectorAll('[data-dragging]')).toHaveLength(0);
      expect(document.querySelectorAll('[data-drop]')).toHaveLength(0);
      expect(latest).toBe(THREE);
    });

    it('a second pointer is ignored: still exactly one dragging card, and its moves are unaffected', () => {
      render(<Harness initial={THREE} />);
      rectsFor([0, 112, 224]);

      const handle1 = screen.getByRole('button', { name: 'Reorder rule 1' });
      const handle2 = screen.getByRole('button', { name: 'Reorder rule 2' });
      fireEvent.pointerDown(handle1, { button: 0, isPrimary: true, pointerId: 1 });
      fireEvent.pointerDown(handle2, { pointerId: 2, button: 0, isPrimary: false });

      expect(document.querySelectorAll('[data-dragging]')).toHaveLength(1);
      expect(screen.getAllByRole('listitem')[0]).toHaveAttribute('data-dragging');

      fireEvent.pointerMove(handle1, { pointerId: 2, buttons: 1, clientY: 300 });
      expect(document.querySelectorAll('[data-drop]')).toHaveLength(0);
    });

    it('has no axe violations after a keyboard reorder (status populated)', async () => {
      const { container } = render(<Harness initial={THREE} />);

      const handle = screen.getByRole('button', { name: 'Reorder rule 1' });
      handle.focus();
      fireEvent.keyDown(handle, { key: 'ArrowDown' });

      expect((await axe(container)).violations).toEqual([]);
    });
  });
});
