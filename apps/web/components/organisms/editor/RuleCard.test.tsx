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
  overrides: Partial<
    Omit<
      RuleCardProps,
      | 'onChange'
      | 'onDelete'
      | 'onConditionsChange'
      | 'onMove'
      | 'onDragStart'
      | 'onDragOver'
      | 'onDragEnd'
      | 'onDragCancel'
    >
  > = {},
) {
  const onChange = vi.fn();
  const onDelete = vi.fn();
  const onConditionsChange = vi.fn();
  const onMove = vi.fn();
  const onDragStart = vi.fn();
  const onDragOver = vi.fn();
  const onDragEnd = vi.fn();
  const onDragCancel = vi.fn();
  const props: RuleCardProps = {
    rule: RULE,
    index: 0,
    organisms: ORGANISMS,
    onChange,
    onDelete,
    onConditionsChange,
    onMove,
    onDragStart,
    onDragOver,
    onDragEnd,
    onDragCancel,
    dragging: false,
    dropIndicator: null,
    describedBy: 'instr',
    ...overrides,
  };
  const utils = render(
    <>
      <span id="instr">Press Up Arrow or Down Arrow to move this rule.</span>
      <ol role="list" aria-label="Survival rules">
        <RuleCard {...props} />
      </ol>
    </>,
  );
  return {
    ...utils,
    onChange,
    onDelete,
    onConditionsChange,
    onMove,
    onDragStart,
    onDragOver,
    onDragEnd,
    onDragCancel,
  };
}

describe('RuleCard', () => {
  it('renders the structure and names for Rule 1', () => {
    renderCard();

    const group = screen.getByRole('group', { name: 'Rule 1' });
    const reorder = within(group).getByRole('button', { name: 'Reorder rule 1' });
    expect(reorder).toBeEnabled();
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
      <>
        <span id="instr">instructions</span>
        <ol role="list" aria-label="Survival rules">
          <RuleCard
            rule={{ ...RULE, payload: { ...RULE.payload, action: 'die' } }}
            index={0}
            organisms={ORGANISMS}
            onChange={onChange}
            onDelete={vi.fn()}
            onConditionsChange={vi.fn()}
            onMove={vi.fn()}
            onDragStart={vi.fn()}
            onDragOver={vi.fn()}
            onDragEnd={vi.fn()}
            onDragCancel={vi.fn()}
            dragging={false}
            dropIndicator={null}
            describedBy="instr"
          />
        </ol>
      </>,
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

  it('the handle is enabled, and a plain click calls neither onChange, onDelete nor onMove', async () => {
    const user = userEvent.setup();
    const { onChange, onDelete, onMove } = renderCard();

    const handle = screen.getByRole('button', { name: 'Reorder rule 1' });
    expect(handle).toBeEnabled();
    await user.click(handle);

    expect(onChange).not.toHaveBeenCalled();
    expect(onDelete).not.toHaveBeenCalled();
    expect(onMove).not.toHaveBeenCalled();
  });

  it('the handle is described by the list-level instructions node', () => {
    renderCard();

    const handle = screen.getByRole('button', { name: 'Reorder rule 1' });
    expect(handle.getAttribute('aria-describedby')).toBe('instr');
  });

  it('ArrowDown / ArrowUp call onMove with index +/- 1 and are consumed', () => {
    const { onMove } = renderCard({ index: 2 });
    const handle = screen.getByRole('button', { name: 'Reorder rule 3' });

    expect(fireEvent.keyDown(handle, { key: 'ArrowDown' })).toBe(false);
    expect(onMove).toHaveBeenCalledWith(RULE.id, 3);

    expect(fireEvent.keyDown(handle, { key: 'ArrowUp' })).toBe(false);
    expect(onMove).toHaveBeenCalledWith(RULE.id, 1);
  });

  it('ArrowUp at index 0 calls onMove with -1 — the card does not clamp', () => {
    const { onMove } = renderCard({ index: 0 });
    const handle = screen.getByRole('button', { name: 'Reorder rule 1' });

    fireEvent.keyDown(handle, { key: 'ArrowUp' });

    expect(onMove).toHaveBeenCalledWith(RULE.id, -1);
  });

  it.each(['Enter', ' ', 'ArrowLeft', 'Home'])(
    'other keys (%s) are left alone: onMove not called, not prevented',
    (key) => {
      const { onMove } = renderCard();
      const handle = screen.getByRole('button', { name: 'Reorder rule 1' });

      expect(fireEvent.keyDown(handle, { key })).toBe(true);
      expect(onMove).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['altKey', 'ArrowDown'],
    ['ctrlKey', 'ArrowUp'],
    ['metaKey', 'ArrowDown'],
    ['shiftKey', 'ArrowUp'],
  ])(
    "a modified arrow (%s + %s) is somebody else's chord: not a move, not consumed",
    (mod, key) => {
      const { onMove } = renderCard({ index: 1 });
      const handle = screen.getByRole('button', { name: 'Reorder rule 2' });

      expect(fireEvent.keyDown(handle, { key, [mod]: true })).toBe(true);
      expect(onMove).not.toHaveBeenCalled();
    },
  );

  it('pointer plumbing: down starts, move reports, up ends; a move after up is ignored', () => {
    const { onDragStart, onDragOver, onDragEnd } = renderCard();
    const handle = screen.getByRole('button', { name: 'Reorder rule 1' });

    fireEvent.pointerDown(handle, { button: 0, isPrimary: true, pointerId: 1 });
    expect(onDragStart).toHaveBeenCalledWith(RULE.id);
    expect(onDragStart).toHaveBeenCalledTimes(1);

    fireEvent.pointerMove(handle, { pointerId: 1, buttons: 1, clientY: 240 });
    expect(onDragOver).toHaveBeenCalledWith(RULE.id, 240);

    fireEvent.pointerUp(handle, { pointerId: 1 });
    expect(onDragEnd).toHaveBeenCalledWith(RULE.id);
    expect(onDragEnd).toHaveBeenCalledTimes(1);

    fireEvent.pointerMove(handle, { pointerId: 1, buttons: 1, clientY: 300 });
    expect(onDragOver).toHaveBeenCalledTimes(1);
  });

  it('pointer guards: wrong button, non-primary, another pointerId, and a released-buttons self-heal', () => {
    const { onDragStart, onDragOver, onDragCancel, onDragEnd } = renderCard();
    const handle = screen.getByRole('button', { name: 'Reorder rule 1' });

    fireEvent.pointerDown(handle, { button: 2, isPrimary: true, pointerId: 1 });
    expect(onDragStart).not.toHaveBeenCalled();

    fireEvent.pointerDown(handle, { button: 0, isPrimary: false, pointerId: 1 });
    expect(onDragStart).not.toHaveBeenCalled();

    fireEvent.pointerDown(handle, { button: 0, isPrimary: true, pointerId: 1 });
    expect(onDragStart).toHaveBeenCalledTimes(1);

    fireEvent.pointerMove(handle, { pointerId: 2, buttons: 1, clientY: 50 });
    expect(onDragOver).not.toHaveBeenCalled();

    fireEvent.pointerMove(handle, { pointerId: 1, buttons: 0, clientY: 50 });
    expect(onDragCancel).toHaveBeenCalledWith(RULE.id);
    expect(onDragCancel).toHaveBeenCalledTimes(1);
    expect(onDragOver).not.toHaveBeenCalled();

    // The ref was cleared by the self-heal above — a pointerup carrying the SAME id is no longer
    // recognised as the active drag.
    fireEvent.pointerUp(handle, { pointerId: 1 });
    expect(onDragEnd).not.toHaveBeenCalled();
  });

  it('pointercancel mid-drag calls onDragCancel', () => {
    const { onDragStart, onDragCancel } = renderCard();
    const handle = screen.getByRole('button', { name: 'Reorder rule 1' });

    fireEvent.pointerDown(handle, { button: 0, isPrimary: true, pointerId: 1 });
    expect(onDragStart).toHaveBeenCalledTimes(1);

    fireEvent.pointerCancel(handle, { pointerId: 1 });
    expect(onDragCancel).toHaveBeenCalledTimes(1);
  });

  it('a second pointerDown mid-drag starts nothing', () => {
    const { onDragStart } = renderCard();
    const handle = screen.getByRole('button', { name: 'Reorder rule 1' });

    fireEvent.pointerDown(handle, { button: 0, isPrimary: true, pointerId: 1 });
    fireEvent.pointerDown(handle, { button: 0, isPrimary: true, pointerId: 2 });

    expect(onDragStart).toHaveBeenCalledTimes(1);
  });

  it('state props reach the <li>: dragging and dropIndicator toggle data attributes', () => {
    const { rerender } = renderCard({ dragging: true, dropIndicator: null });
    expect(screen.getByRole('listitem')).toHaveAttribute('data-dragging');
    expect(screen.getByRole('listitem')).not.toHaveAttribute('data-drop');

    rerender(
      <>
        <span id="instr">instructions</span>
        <ol role="list" aria-label="Survival rules">
          <RuleCard
            rule={RULE}
            index={0}
            organisms={ORGANISMS}
            onChange={vi.fn()}
            onDelete={vi.fn()}
            onConditionsChange={vi.fn()}
            onMove={vi.fn()}
            onDragStart={vi.fn()}
            onDragOver={vi.fn()}
            onDragEnd={vi.fn()}
            onDragCancel={vi.fn()}
            dragging={false}
            dropIndicator="after"
            describedBy="instr"
          />
        </ol>
      </>,
    );
    expect(screen.getByRole('listitem')).not.toHaveAttribute('data-dragging');
    expect(screen.getByRole('listitem')).toHaveAttribute('data-drop', 'after');

    rerender(
      <>
        <span id="instr">instructions</span>
        <ol role="list" aria-label="Survival rules">
          <RuleCard
            rule={RULE}
            index={0}
            organisms={ORGANISMS}
            onChange={vi.fn()}
            onDelete={vi.fn()}
            onConditionsChange={vi.fn()}
            onMove={vi.fn()}
            onDragStart={vi.fn()}
            onDragOver={vi.fn()}
            onDragEnd={vi.fn()}
            onDragCancel={vi.fn()}
            dragging={false}
            dropIndicator={null}
            describedBy="instr"
          />
        </ol>
      </>,
    );
    expect(screen.getByRole('listitem')).not.toHaveAttribute('data-dragging');
    expect(screen.getByRole('listitem')).not.toHaveAttribute('data-drop');
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
