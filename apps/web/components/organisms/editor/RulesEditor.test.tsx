import { useEffect, useState } from 'react';
import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import type { SurvivalRule } from '@gol/domain';
import { CONWAYS_CLASSIC, createMockOrganisms } from '@gol/test-utils';
import {
  appendRule,
  createNewRuleDraft,
  ruleActionLabel,
  type RuleDraft,
} from '@/lib/organisms/ruleDraft';
import RulesEditor from './RulesEditor';

const NO_RULES: readonly RuleDraft[] = [];

// One rule of each action, drawn from the mock organisms' real rules — Conway's Classic has no Die
// rule (`defaultWorkspace.ts`'s own comment: order-is-priority means no explicit Die rule is
// needed), so the Die rule comes from a mock organism.
function stripHash(rule: SurvivalRule): RuleDraft {
  const { contentHash: _contentHash, ...draft } = rule;
  return draft;
}

function ruleWithAction(rules: readonly SurvivalRule[], action: RuleDraft['payload']['action']) {
  const rule = rules.find((r) => r.payload.action === action);
  if (!rule) throw new Error(`fixture has no ${action} rule`);
  return rule;
}

const [aggressive] = createMockOrganisms();
const THREE: readonly RuleDraft[] = [
  stripHash(ruleWithAction(CONWAYS_CLASSIC.survivalRules, 'born')),
  stripHash(ruleWithAction(CONWAYS_CLASSIC.survivalRules, 'survive')),
  stripHash(ruleWithAction(aggressive.survivalRules, 'die')),
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

    expect(
      screen.getAllByRole('group').map((g) => within(g).getByText(/^Rule \d$/).textContent),
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
    expect(within(second).getByRole('combobox')).toHaveValue('die');
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
    await user.selectOptions(within(first).getByRole('combobox'), 'survive');

    expect(within(first).getByRole('combobox')).toHaveValue('survive');
    expect(first.querySelector('[data-rule-badge]')).toHaveTextContent(ruleActionLabel('survive'));
    const second = screen.getByRole('group', { name: 'Rule 2' });
    const third = screen.getByRole('group', { name: 'Rule 3' });
    expect(within(second).getByRole('combobox')).toHaveValue('survive');
    expect(second.querySelector('[data-rule-badge]')).toHaveTextContent(ruleActionLabel('survive'));
    expect(within(third).getByRole('combobox')).toHaveValue('die');
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
});
