import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import { CONWAYS_CLASSIC } from '@gol/test-utils';
import {
  ruleActionLabel,
  ruleDraftFrom,
  RULE_ACTIONS,
  type RuleDraft,
} from '@/lib/organisms/ruleDraft';
import RuleCard, { type RuleCardProps } from './RuleCard';

// Deterministic id counter, never `crypto` — matches the `ruleDraft.test.ts` idiom.
function counter() {
  let n = 0;
  return () => `c${++n}`;
}

// Conway's Born rule as a real `RuleDraft`, via the bridge (not a hand-destructure).
const RULE: RuleDraft = ruleDraftFrom(CONWAYS_CLASSIC.survivalRules[0], counter());

const ORGANISMS = [
  { id: 'org-a', name: 'Alpha' },
  { id: 'org-b', name: 'Beta' },
];

/** A lone `<li>` outside a `<ol role="list">` trips axe's `listitem` rule (the Story 4.8
 * `container` precedent) — render inside a real list wrapper here. The callbacks are not
 * overridable: the helper returns its own mocks, and an override would be asserted against a mock
 * that was never wired. */
function renderCard(
  overrides: Partial<Omit<RuleCardProps, 'onChange' | 'onDelete' | 'onConditionsChange'>> = {},
) {
  const onChange = vi.fn();
  const onDelete = vi.fn();
  const onConditionsChange = vi.fn();
  const props: RuleCardProps = {
    rule: RULE,
    index: 0,
    organisms: ORGANISMS,
    onChange,
    onDelete,
    onConditionsChange,
    ...overrides,
  };
  const utils = render(
    <ol role="list" aria-label="Survival rules">
      <RuleCard {...props} />
    </ol>,
  );
  return { ...utils, onChange, onDelete, onConditionsChange };
}

describe('RuleCard', () => {
  it('renders the structure and names for Rule 1', () => {
    renderCard();

    const group = screen.getByRole('group', { name: 'Rule 1' });
    const reorder = within(group).getByRole('button', { name: 'Reorder rule 1' });
    expect(reorder).toBeDisabled();
    expect(within(group).getByRole('button', { name: 'Delete rule 1' })).toBeInTheDocument();
    const summary = within(group).getByRole('textbox', { name: 'Summary' });
    expect(summary).toHaveValue(RULE.payload.summary);
    const combobox = within(group).getByRole('combobox', { name: 'Action' });
    expect(combobox).toHaveValue('born');
    const optionTexts = within(combobox)
      .getAllByRole('option')
      .map((option) => option.textContent);
    expect(optionTexts).toEqual(RULE_ACTIONS.map(ruleActionLabel));
    const badge = document.querySelector('[data-rule-badge]');
    expect(badge).toHaveTextContent('Born');
    expect(badge).toHaveAttribute('data-action', 'born');
  });

  it('derives every name from index', () => {
    renderCard({ index: 4 });

    expect(screen.getByRole('group', { name: 'Rule 5' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reorder rule 5' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete rule 5' })).toBeInTheDocument();
  });

  it('typing calls onChange with the id and the appended summary', async () => {
    const user = userEvent.setup();
    const { onChange } = renderCard();

    const summary = screen.getByRole('textbox', { name: 'Summary' });
    await user.type(summary, 'x');

    expect(onChange).toHaveBeenCalledWith(RULE.id, { summary: `${RULE.payload.summary}x` });
  });

  it('clamps an over-limit input to exactly 100 characters', () => {
    const { onChange } = renderCard();
    const summary = screen.getByRole('textbox', { name: 'Summary' });

    fireEvent.input(summary, { target: { value: 'x'.repeat(101) } });

    expect(onChange).toHaveBeenCalledWith(RULE.id, { summary: 'x'.repeat(100) });
  });

  it('reflects the rendered value in the counter', () => {
    renderCard({ rule: { ...RULE, payload: { ...RULE.payload, summary: 'abc' } } });

    expect(screen.getByText('3 / 100')).toBeInTheDocument();
  });

  it('an action change calls onChange, and the badge updates on re-render', () => {
    const { onChange, rerender } = renderCard();
    const combobox = screen.getByRole('combobox', { name: 'Action' });

    fireEvent.change(combobox, { target: { value: 'die' } });
    expect(onChange).toHaveBeenCalledWith(RULE.id, { action: 'die' });

    rerender(
      <ol role="list" aria-label="Survival rules">
        <RuleCard
          rule={{ ...RULE, payload: { ...RULE.payload, action: 'die' } }}
          index={0}
          organisms={ORGANISMS}
          onChange={onChange}
          onDelete={vi.fn()}
          onConditionsChange={vi.fn()}
        />
      </ol>,
    );
    const badge = document.querySelector('[data-rule-badge]');
    expect(badge).toHaveTextContent('Die');
    expect(badge).toHaveAttribute('data-action', 'die');
  });

  it('delete calls onDelete with the id, once', async () => {
    const user = userEvent.setup();
    const { onDelete } = renderCard();

    await user.click(screen.getByRole('button', { name: 'Delete rule 1' }));

    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(onDelete).toHaveBeenCalledWith(RULE.id);
  });

  it('the handle is genuinely disabled and a click on it calls nothing', async () => {
    const user = userEvent.setup();
    const { onChange, onDelete } = renderCard();

    const handle = screen.getByRole('button', { name: 'Reorder rule 1' });
    expect(handle).toBeDisabled();
    await user.click(handle);

    expect(onChange).not.toHaveBeenCalled();
    expect(onDelete).not.toHaveBeenCalled();
  });

  it('the summary textbox is described by the counter', () => {
    renderCard();

    const summary = screen.getByRole('textbox', { name: 'Summary' });
    const describedBy = summary.getAttribute('aria-describedby');
    if (describedBy === null) throw new Error('Summary has no aria-describedby');
    expect(document.getElementById(describedBy)).toHaveTextContent(
      `${RULE.payload.summary.length} / 100`,
    );
  });

  it('has no axe violations', async () => {
    const { container } = renderCard();

    const results = await axe(container);
    expect(results.violations).toEqual([]);
  });

  it("renders the Conditions group with Conway's Born rows (Story 4.11)", () => {
    renderCard();

    const group = screen.getByRole('group', { name: 'Rule 1' });
    expect(
      within(group).getByRole('group', { name: 'Conditions (all must match)' }),
    ).toBeInTheDocument();
    expect(within(group).getByRole('combobox', { name: 'Condition 1 property' })).toHaveValue(
      'cellState',
    );
    expect(within(group).getByRole('combobox', { name: 'Condition 1 value' })).toHaveValue('empty');
    expect(within(group).getByRole('combobox', { name: 'Condition 2 property' })).toHaveValue(
      'neighborCount',
    );
    expect(within(group).getByRole('combobox', { name: 'Condition 2 operator' })).toHaveValue('eq');
    expect(within(group).getByRole('textbox', { name: 'Condition 2 value' })).toHaveValue('3');
  });

  it('clicking + Add Condition calls onConditionsChange with the rule id and an appending updater', () => {
    const { onConditionsChange } = renderCard();

    fireEvent.click(screen.getByRole('button', { name: '+ Add Condition' }));

    expect(onConditionsChange).toHaveBeenCalledTimes(1);
    const [id, updater] = onConditionsChange.mock.calls[0];
    expect(id).toBe(RULE.id);
    const next = updater(RULE.conditions);
    expect(next).toHaveLength(3);
    expect(next[2]).toMatchObject({ property: 'cellState', operator: 'eq', pattern: 'empty' });
  });

  it("has no axe violations with Conway's Survive rule (cellState + range)", async () => {
    const survive = ruleDraftFrom(CONWAYS_CLASSIC.survivalRules[1], counter());
    const { container } = renderCard({ rule: survive });

    const results = await axe(container);
    expect(results.violations).toEqual([]);
  });
});
