import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import { CONWAYS_CLASSIC } from '@gol/test-utils';
import { ruleActionLabel, RULE_ACTIONS, type RuleDraft } from '@/lib/organisms/ruleDraft';
import RuleCard, { type RuleCardProps } from './RuleCard';

// Conway's Born rule minus `contentHash` — a real `RuleDraft`, typed by the destructure alone.
const RULE: RuleDraft = (({ contentHash: _contentHash, ...draft }) => draft)(
  CONWAYS_CLASSIC.survivalRules[0],
);

/** A lone `<li>` outside a `<ol role="list">` trips axe's `listitem` rule (the Story 4.8
 * `container` precedent) — render inside a real list wrapper here. */
function renderCard(overrides: Partial<RuleCardProps> = {}) {
  const onChange = vi.fn();
  const onDelete = vi.fn();
  const props: RuleCardProps = {
    rule: RULE,
    index: 0,
    onChange,
    onDelete,
    ...overrides,
  };
  const utils = render(
    <ol role="list" aria-label="Survival rules">
      <RuleCard {...props} />
    </ol>,
  );
  return { ...utils, onChange, onDelete };
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
    renderCard({ rule: { ...(RULE as RuleDraft), payload: { ...RULE.payload, summary: 'abc' } } });

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
          rule={{ ...(RULE as RuleDraft), payload: { ...RULE.payload, action: 'die' } }}
          index={0}
          onChange={onChange}
          onDelete={vi.fn()}
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
    expect(describedBy).not.toBeNull();
    expect(document.getElementById(describedBy!)).toHaveTextContent(
      `${RULE.payload.summary.length} / 100`,
    );
  });

  it('has no axe violations', async () => {
    const { container } = renderCard();

    const results = await axe(container);
    expect(results.violations).toEqual([]);
  });
});
