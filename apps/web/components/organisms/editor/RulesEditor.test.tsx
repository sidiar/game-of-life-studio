import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
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
function stripHash(rule: { contentHash: string } & Record<string, unknown>): RuleDraft {
  const { contentHash: _contentHash, ...draft } = rule;
  return draft as unknown as RuleDraft;
}

const [aggressive] = createMockOrganisms();
const THREE: readonly RuleDraft[] = [
  stripHash(CONWAYS_CLASSIC.survivalRules[0]), // born
  stripHash(CONWAYS_CLASSIC.survivalRules[1]), // survive
  stripHash(aggressive.survivalRules.find((r) => r.payload.action === 'die')!), // die
];

/** Holds `rules` in real state and wires `onRulesChange`/`onAddRule` to the modal's own shape
 * (Task 6): the id is minted OUTSIDE the updater, exactly as `<OrganismEditorModal>`'s `addRule`
 * does, so this harness exercises the real contract. `HarnessAdd` stands in for the layout's
 * header action (outside `<RulesEditor>` in the real tree, `<OrganismEditorModal>`'s to render) —
 * it calls the SAME `onAddRule`, since both controls share one id-minting callback. */
function Harness({ initial }: { initial: readonly RuleDraft[] }) {
  const [rules, setRules] = useState<readonly RuleDraft[]>(initial);
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
    render(<Harness initial={NO_RULES} />);

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
    render(<Harness initial={THREE} />);

    await user.click(screen.getByRole('button', { name: 'Harness Add' }));

    expect(screen.getAllByRole('listitem')).toHaveLength(4);
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

  it('deleting the middle renumbers and focuses the delete button now at that position', async () => {
    const user = userEvent.setup();
    render(<Harness initial={THREE} />);

    await user.click(screen.getByRole('button', { name: 'Delete rule 2' }));

    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    expect(screen.getByRole('group', { name: 'Rule 1' })).toBeInTheDocument();
    const second = screen.getByRole('group', { name: 'Rule 2' });
    expect(within(second).getByRole('combobox')).toHaveValue('die');
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Delete rule 2' }));
  });

  it('deleting the last focuses the new last card delete button', async () => {
    const user = userEvent.setup();
    render(<Harness initial={THREE} />);

    await user.click(screen.getByRole('button', { name: 'Delete rule 3' }));

    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Delete rule 2' }));
  });

  it('deleting the only rule returns to the empty state, focused on Add Rule', async () => {
    const user = userEvent.setup();
    render(<Harness initial={[THREE[0]]} />);

    await user.click(screen.getByRole('button', { name: 'Delete rule 1' }));

    expect(screen.getByText('No Rules Defined')).toBeInTheDocument();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: '+ Add Rule' }));
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
    const second = screen.getByRole('group', { name: 'Rule 2' });
    const third = screen.getByRole('group', { name: 'Rule 3' });
    expect(within(second).getByRole('combobox')).toHaveValue('survive');
    expect(within(third).getByRole('combobox')).toHaveValue('die');
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
