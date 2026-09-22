import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import { CELL_STATES, CONDITION_PROPERTIES, NUMERIC_OPERATORS } from '@gol/domain';
import {
  cellStateLabel,
  conditionPropertyLabel,
  createNewConditionDraft,
  MAX_AGE_LITERAL,
  MIN_LESS_THAN_MAX,
  operatorLabel,
  ORGANISM_REQUIRED,
  wholeNumberMessage,
  type ConditionDraft,
} from '@/lib/organisms/conditionDraft';
import ConditionRow, { type ConditionRowProps } from './ConditionRow';

const ORGANISMS = [
  { id: 'org-a', name: 'Alpha' },
  { id: 'org-b', name: 'Beta' },
];

/** Rendered inside a real `<fieldset>` — the row's one group in production is `<ConditionsEditor>`'s
 * fieldset, and rows are not list items (FD4), so no list wrapper is needed. The callbacks are not
 * overridable: the helper returns its own mocks (the `RuleCard.test.tsx` rule). */
function renderRow(
  draft: ConditionDraft,
  overrides: Partial<Omit<ConditionRowProps, 'draft' | 'onChange' | 'onDelete'>> = {},
) {
  const onChange = vi.fn();
  const onDelete = vi.fn();
  const props: ConditionRowProps = {
    draft,
    index: 0,
    organisms: ORGANISMS,
    defaultOrganismId: 'org-a',
    onChange,
    onDelete,
    showAllErrors: false,
    ...overrides,
  };
  const utils = render(
    <fieldset>
      <ConditionRow {...props} />
    </fieldset>,
  );
  const rerenderRow = (next: ConditionDraft) =>
    utils.rerender(
      <fieldset>
        <ConditionRow {...props} draft={next} />
      </fieldset>,
    );
  return { ...utils, onChange, onDelete, rerenderRow };
}

const optionTexts = (select: HTMLElement) =>
  within(select)
    .getAllByRole('option')
    .map((option) => option.textContent);

const NEIGHBOR_EMPTY: ConditionDraft = {
  id: 'c1',
  property: 'neighborCount',
  operator: 'eq',
  pattern: '',
};

describe('ConditionRow', () => {
  // (a)
  it('a fresh row names its three controls and delete by position, with the default options', () => {
    renderRow(createNewConditionDraft('c1'));

    const property = screen.getByRole('combobox', { name: 'Condition 1 property' });
    expect(property).toHaveValue('cellState');
    expect(optionTexts(property)).toEqual(CONDITION_PROPERTIES.map(conditionPropertyLabel));
    const operator = screen.getByRole('combobox', { name: 'Condition 1 operator' });
    expect(optionTexts(operator)).toEqual([operatorLabel('eq')]);
    const value = screen.getByRole('combobox', { name: 'Condition 1 value' });
    expect(value).toHaveValue('empty');
    expect(optionTexts(value)).toEqual(CELL_STATES.map(cellStateLabel));
    expect(screen.getByRole('button', { name: 'Delete condition 1' })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  // (b)
  it('index drives every name', () => {
    renderRow(createNewConditionDraft('c1'), { index: 2 });

    expect(screen.getByRole('combobox', { name: 'Condition 3 property' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Condition 3 operator' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Condition 3 value' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete condition 3' })).toBeInTheDocument();
  });

  // (c)
  it("a property change calls onChange with that property's default row", async () => {
    const user = userEvent.setup();
    const { onChange } = renderRow(createNewConditionDraft('c1'));
    const property = screen.getByRole('combobox', { name: 'Condition 1 property' });

    await user.selectOptions(property, 'neighborCount');
    expect(onChange).toHaveBeenLastCalledWith({
      id: 'c1',
      property: 'neighborCount',
      operator: 'eq',
      pattern: '',
    });

    await user.selectOptions(property, 'organismType');
    expect(onChange).toHaveBeenLastCalledWith({
      id: 'c1',
      property: 'organismType',
      operator: 'eq',
      pattern: 'org-a',
    });
  });

  // (d)
  it('a numeric scalar renders a textbox with the bounds placeholder and six operators', () => {
    const { rerenderRow } = renderRow(NEIGHBOR_EMPTY);

    const value = screen.getByRole('textbox', { name: 'Condition 1 value' });
    expect(value).toHaveAttribute('placeholder', '0–8');
    expect(value).toHaveAttribute('type', 'text');
    expect(value).toHaveAttribute('inputMode', 'numeric');
    const operator = screen.getByRole('combobox', { name: 'Condition 1 operator' });
    expect(optionTexts(operator)).toEqual(NUMERIC_OPERATORS.map(operatorLabel));

    rerenderRow({ ...NEIGHBOR_EMPTY, property: 'age' });
    expect(screen.getByRole('textbox', { name: 'Condition 1 value' })).toHaveAttribute(
      'placeholder',
      '0–999',
    );
  });

  // (e) FD3 — the draft holds what the user typed, never a parse of it.
  it('typing stores the raw text: never dropped, never clamped', async () => {
    const user = userEvent.setup();
    const { onChange } = renderRow(NEIGHBOR_EMPTY);
    const value = screen.getByRole('textbox', { name: 'Condition 1 value' });

    await user.type(value, '3');
    expect(onChange).toHaveBeenLastCalledWith({ ...NEIGHBOR_EMPTY, pattern: '3' });

    fireEvent.input(value, { target: { value: 'abc' } });
    expect(onChange).toHaveBeenLastCalledWith({ ...NEIGHBOR_EMPTY, pattern: 'abc' });
  });

  // (f)
  it('operator to range resets the pattern; scalar to scalar keeps it', async () => {
    const user = userEvent.setup();
    const { onChange } = renderRow({ ...NEIGHBOR_EMPTY, pattern: '3' });
    const operator = screen.getByRole('combobox', { name: 'Condition 1 operator' });

    await user.selectOptions(operator, 'range');
    expect(onChange).toHaveBeenLastCalledWith({
      id: 'c1',
      property: 'neighborCount',
      operator: 'range',
      pattern: ['', ''],
    });

    await user.selectOptions(operator, 'gt');
    expect(onChange).toHaveBeenLastCalledWith({
      id: 'c1',
      property: 'neighborCount',
      operator: 'gt',
      pattern: '3',
    });
  });

  // (g) The pair error waits for BOTH inputs to be touched; the alert unmounts with the error, so
  // `aria-describedby` never points at an absent id.
  it('range renders Min / Max, and the pair error waits for both to be touched', async () => {
    const user = userEvent.setup();
    const range: ConditionDraft = {
      id: 'c1',
      property: 'neighborCount',
      operator: 'range',
      pattern: ['', ''],
    };
    const { rerenderRow } = renderRow(range);

    const min = () => screen.getByRole('textbox', { name: 'Condition 1 minimum' });
    const max = () => screen.getByRole('textbox', { name: 'Condition 1 maximum' });
    expect(min()).toHaveAttribute('placeholder', 'Min');
    expect(max()).toHaveAttribute('placeholder', 'Max');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(min()).not.toHaveAttribute('aria-invalid');
    expect(max()).not.toHaveAttribute('aria-invalid');

    await user.type(min(), '3');
    rerenderRow({ ...range, pattern: ['3', ''] });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    await user.type(max(), '2');
    rerenderRow({ ...range, pattern: ['3', '2'] });
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent(MIN_LESS_THAN_MAX);
    expect(min()).toHaveAttribute('aria-invalid', 'true');
    expect(max()).toHaveAttribute('aria-invalid', 'true');
    expect(min()).toHaveAttribute('aria-describedby', alert.id);
    expect(max()).toHaveAttribute('aria-describedby', alert.id);

    rerenderRow({ ...range, pattern: ['3', '3'] });
    expect(screen.getByRole('alert')).toHaveTextContent(MIN_LESS_THAN_MAX);

    rerenderRow({ ...range, pattern: ['1', '3'] });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(min()).not.toHaveAttribute('aria-invalid');
    expect(max()).not.toHaveAttribute('aria-invalid');
    expect(min()).not.toHaveAttribute('aria-describedby');
    expect(max()).not.toHaveAttribute('aria-describedby');
  });

  // (h) An invalid draft rendered fresh shows nothing until its input is touched (4.5 FD2). The
  // keystroke has to CHANGE the value — React swallows an `input` event whose value equals the
  // controlled one — and the draft stays what the parent holds (`onChange` is a mock here).
  it('a scalar bounds error shows only once the input is touched', () => {
    const { rerenderRow } = renderRow({ ...NEIGHBOR_EMPTY, pattern: '9' });
    const value = () => screen.getByRole('textbox', { name: 'Condition 1 value' });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(value()).not.toHaveAttribute('aria-invalid');

    fireEvent.input(value(), { target: { value: '99' } });
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a whole number from 0 to 8');
    expect(value()).toHaveAttribute('aria-invalid', 'true');

    rerenderRow({ ...NEIGHBOR_EMPTY, property: 'age', pattern: '1000' });
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a whole number from 0 to 999');
  });

  // (i) A property change clears `touched` — the inputs are new (AC4).
  it('a property change clears touched', async () => {
    const user = userEvent.setup();
    const { rerenderRow } = renderRow({ ...NEIGHBOR_EMPTY, pattern: '9' });
    fireEvent.input(screen.getByRole('textbox', { name: 'Condition 1 value' }), {
      target: { value: '99' },
    });
    expect(screen.getByRole('alert')).toBeInTheDocument();

    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Condition 1 property' }),
      'cellState',
    );
    rerenderRow(createNewConditionDraft('c1'));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    rerenderRow({ ...NEIGHBOR_EMPTY, pattern: '9' });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    fireEvent.input(screen.getByRole('textbox', { name: 'Condition 1 value' }), {
      target: { value: '99' },
    });
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  // (j) FD6 — the organism select never renders blank.
  it('the organism select lists the library by name with id values, and never renders blank', async () => {
    const user = userEvent.setup();
    const organismRow: ConditionDraft = {
      id: 'c1',
      property: 'organismType',
      operator: 'eq',
      pattern: 'org-b',
    };
    const { onChange, rerenderRow } = renderRow(organismRow);

    const value = () => screen.getByRole('combobox', { name: 'Condition 1 value' });
    expect(value()).toHaveValue('org-b');
    expect(optionTexts(value())).toEqual(['Alpha', 'Beta']);
    expect(
      within(value())
        .getAllByRole('option')
        .map((option) => (option as HTMLOptionElement).value),
    ).toEqual(['org-a', 'org-b']);

    await user.selectOptions(value(), 'org-a');
    expect(onChange).toHaveBeenLastCalledWith({ ...organismRow, pattern: 'org-a' });

    rerenderRow({ ...organismRow, pattern: 'ghost' });
    expect(optionTexts(value())).toEqual(['Unknown organism', 'Alpha', 'Beta']);
    expect(value()).toHaveValue('ghost');
  });

  it('an empty library with an empty pattern shows "Select an organism"', () => {
    renderRow(
      { id: 'c1', property: 'organismType', operator: 'eq', pattern: '' },
      { organisms: [], defaultOrganismId: '' },
    );

    const value = screen.getByRole('combobox', { name: 'Condition 1 value' });
    expect(optionTexts(value)).toEqual(['Select an organism']);
    expect(value).toHaveValue('');
  });

  // Story 4.17 (AC6): with no OTHER organism to target — the organism under edit is the sole
  // library entry — the property option is disabled so the unfixable `ORGANISM_REQUIRED` state is
  // unreachable through the UI; a row already ON the property keeps rendering its value cell.
  it('disables the Organism Type property option when the organism list is empty, and only then (Story 4.17)', () => {
    const { rerenderRow, unmount } = renderRow(createNewConditionDraft('c1'), {
      organisms: [],
      defaultOrganismId: '',
    });

    const property = () => screen.getByRole('combobox', { name: 'Condition 1 property' });
    const organismTypeOption = () =>
      within(property()).getByRole('option', { name: conditionPropertyLabel('organismType') });
    expect(organismTypeOption()).toBeDisabled();
    for (const other of CONDITION_PROPERTIES.filter((p) => p !== 'organismType')) {
      expect(
        within(property()).getByRole('option', { name: conditionPropertyLabel(other) }),
      ).toBeEnabled();
    }

    rerenderRow({ id: 'c1', property: 'organismType', operator: 'eq', pattern: 'ghost' });
    expect(organismTypeOption()).toBeDisabled();
    const value = screen.getByRole('combobox', { name: 'Condition 1 value' });
    expect(value).toHaveValue('ghost');
    expect(optionTexts(value)).toEqual(['Unknown organism']);

    unmount();
    renderRow(createNewConditionDraft('c1'), { organisms: [ORGANISMS[0]] });
    expect(organismTypeOption()).toBeEnabled();
  });

  // (k)
  it('delete calls onDelete with the row id, once', async () => {
    const user = userEvent.setup();
    const { onDelete } = renderRow(createNewConditionDraft('c1'));

    await user.click(screen.getByRole('button', { name: 'Delete condition 1' }));

    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(onDelete).toHaveBeenCalledWith('c1');
  });

  // (l) FD5 — a real control showing a real choice; disabled would drop it from the tab order.
  it('the one-option operator select stays enabled', () => {
    renderRow(createNewConditionDraft('c1'));

    expect(screen.getByRole('combobox', { name: 'Condition 1 operator' })).not.toBeDisabled();
  });

  // (m)
  it('has no axe violations on a cellState row, an organism row, and a range row with the pair alert visible', async () => {
    const user = userEvent.setup();
    const cell = renderRow(createNewConditionDraft('c1'));
    expect((await axe(cell.container)).violations).toEqual([]);
    cell.unmount();

    const organism = renderRow({
      id: 'c1',
      property: 'organismType',
      operator: 'eq',
      pattern: 'org-a',
    });
    expect((await axe(organism.container)).violations).toEqual([]);
    organism.unmount();

    const range: ConditionDraft = {
      id: 'c1',
      property: 'neighborCount',
      operator: 'range',
      pattern: ['', ''],
    };
    const { container, rerenderRow } = renderRow(range);
    await user.type(screen.getByRole('textbox', { name: 'Condition 1 minimum' }), '3');
    await user.type(screen.getByRole('textbox', { name: 'Condition 1 maximum' }), '2');
    rerenderRow({ ...range, pattern: ['3', '2'] });
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect((await axe(container)).violations).toEqual([]);
  });

  // (o) Story 4.13's Save-time override: a fresh, untouched scalar row shows its bounds error.
  it('(o) a fresh scalar row under the override shows its bounds error untouched (Story 4.13)', () => {
    renderRow({ ...NEIGHBOR_EMPTY, property: 'age', pattern: '' }, { showAllErrors: true });

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent(wholeNumberMessage('Enter', 0, MAX_AGE_LITERAL));
    const value = screen.getByRole('textbox', { name: 'Condition 1 value' });
    expect(value).toHaveAttribute('aria-invalid', 'true');
  });

  // (p) The 4.11 "Max hidden while Min untouched" gap, closed by the override.
  it('(p) a Max-first gap is closed by the override (Story 4.13)', () => {
    const range: ConditionDraft = {
      id: 'c1',
      property: 'age',
      operator: 'range',
      pattern: ['5', ''],
    };
    renderRow(range, { showAllErrors: true });

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent(wholeNumberMessage('Max must be', 0, MAX_AGE_LITERAL));
    const max = screen.getByRole('textbox', { name: 'Condition 1 maximum' });
    const min = screen.getByRole('textbox', { name: 'Condition 1 minimum' });
    expect(max).toHaveAttribute('aria-invalid', 'true');
    expect(min).not.toHaveAttribute('aria-invalid');
  });

  // (q) The empty organism select under the override (the 4.11 AC5 case, now with the association).
  it('(q) an empty organism select shows its error only under the override (Story 4.13)', () => {
    const draft: ConditionDraft = {
      id: 'c1',
      property: 'organismType',
      operator: 'eq',
      pattern: '',
    };
    const { rerender } = renderRow(draft, { organisms: [], defaultOrganismId: '' });

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    const value = screen.getByRole('combobox', { name: 'Condition 1 value' });
    expect(value).not.toHaveAttribute('aria-invalid');

    rerender(
      <fieldset>
        <ConditionRow
          draft={draft}
          index={0}
          organisms={[]}
          defaultOrganismId=""
          onChange={vi.fn()}
          onDelete={vi.fn()}
          showAllErrors={true}
        />
      </fieldset>,
    );

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent(ORGANISM_REQUIRED);
    expect(value).toHaveAttribute('aria-invalid', 'true');
    expect(value).toHaveAttribute('aria-describedby', alert.id);
  });

  // (r) A valid row shows nothing, override or not.
  it('(r) a valid row under the override shows nothing (Story 4.13)', () => {
    renderRow({ ...NEIGHBOR_EMPTY, pattern: '3' }, { showAllErrors: true });

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Condition 1 value' })).not.toHaveAttribute(
      'aria-invalid',
    );
  });

  // (s) axe with (p) visible.
  it('(s) has no axe violations with the Max-first gap visible under the override (Story 4.13)', async () => {
    const range: ConditionDraft = {
      id: 'c1',
      property: 'age',
      operator: 'range',
      pattern: ['5', ''],
    };
    const { container } = renderRow(range, { showAllErrors: true });
    expect(screen.getByRole('alert')).toBeInTheDocument();

    expect((await axe(container)).violations).toEqual([]);
  });
});
