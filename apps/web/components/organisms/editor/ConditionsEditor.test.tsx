import { useEffect, useState } from 'react';
import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import { CONWAYS_CLASSIC } from '@gol/test-utils';
import { conditionDraftFrom, type ConditionDraft } from '@/lib/organisms/conditionDraft';
import ConditionsEditor from './ConditionsEditor';

const ORGANISMS = [
  { id: 'org-a', name: 'Alpha' },
  { id: 'org-b', name: 'Beta' },
];

const NONE: readonly ConditionDraft[] = [];

// Conway's Survive rule — a cell-state row and a range row — through the bridge, with
// deterministic ids (never `crypto`).
const TWO: readonly ConditionDraft[] = CONWAYS_CLASSIC.survivalRules[1].conditions.map(
  (condition, i) => conditionDraftFrom(condition, `k${i + 1}`),
);

/** Holds `conditions` in real state and wires `onConditionsChange` to the updater shape
 * `<RuleCard>` binds (the `RulesEditor.test.tsx` harness). `onState` reports every committed array,
 * so a test can assert on REFERENCES the DOM cannot show. */
function Harness({
  initial,
  onState,
}: {
  initial: readonly ConditionDraft[];
  onState?: (conditions: readonly ConditionDraft[]) => void;
}) {
  const [conditions, setConditions] = useState<readonly ConditionDraft[]>(initial);
  useEffect(() => {
    onState?.(conditions);
  }, [conditions, onState]);
  return (
    <ConditionsEditor
      conditions={conditions}
      organisms={ORGANISMS}
      onConditionsChange={(update) => setConditions((current) => update(current))}
    />
  );
}

const property = (n: number) => screen.getByRole('combobox', { name: `Condition ${n} property` });
const addButton = () => screen.getByRole('button', { name: '+ Add Condition' });

describe('ConditionsEditor', () => {
  // (a)
  it('renders the group and the add action alone with zero rows', () => {
    render(<Harness initial={NONE} />);

    expect(screen.getByRole('group', { name: 'Conditions (all must match)' })).toBeInTheDocument();
    expect(screen.getAllByRole('button')).toHaveLength(1);
    expect(addButton()).toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  // (b)
  it('adding from empty mounts one cellState row and focuses its property select', async () => {
    const user = userEvent.setup();
    render(<Harness initial={NONE} />);

    await user.click(addButton());

    expect(screen.getAllByRole('combobox', { name: /^Condition \d property$/ })).toHaveLength(1);
    expect(property(1)).toHaveValue('cellState');
    expect(document.activeElement).toBe(property(1));
  });

  // (c)
  it('add appends, keeps the earlier drafts by reference, and focuses the new row', async () => {
    const user = userEvent.setup();
    let latest: readonly ConditionDraft[] = [];
    render(
      <Harness
        initial={TWO}
        onState={(conditions) => {
          latest = conditions;
        }}
      />,
    );

    await user.click(addButton());

    expect(screen.getAllByRole('combobox', { name: /^Condition \d property$/ })).toHaveLength(3);
    expect(latest).toHaveLength(3);
    expect(latest[0]).toBe(TWO[0]);
    expect(latest[1]).toBe(TWO[1]);
    expect(document.activeElement).toBe(property(3));
  });

  // (d)
  it('rows render in order, named by position', () => {
    render(<Harness initial={TWO} />);

    expect(property(1)).toHaveValue('cellState');
    expect(property(2)).toHaveValue('neighborCount');
    expect(screen.getByRole('combobox', { name: 'Condition 2 operator' })).toHaveValue('range');
    expect(screen.getByRole('textbox', { name: 'Condition 2 minimum' })).toHaveValue('2');
    expect(screen.getByRole('textbox', { name: 'Condition 2 maximum' })).toHaveValue('3');
  });

  // (e)
  it('deleting the first renumbers the survivor and focuses its property select', async () => {
    const user = userEvent.setup();
    render(<Harness initial={TWO} />);

    await user.click(screen.getByRole('button', { name: 'Delete condition 1' }));

    expect(screen.getAllByRole('combobox', { name: /^Condition \d property$/ })).toHaveLength(1);
    expect(property(1)).toHaveValue('neighborCount');
    expect(document.activeElement).toBe(property(1));
  });

  // (f)
  it('deleting the last focuses the new last row', async () => {
    const user = userEvent.setup();
    const three: readonly ConditionDraft[] = [
      ...TWO,
      { id: 'k3', property: 'age', operator: 'eq', pattern: '5' },
    ];
    render(<Harness initial={three} />);

    await user.click(screen.getByRole('button', { name: 'Delete condition 3' }));

    expect(screen.getAllByRole('combobox', { name: /^Condition \d property$/ })).toHaveLength(2);
    expect(document.activeElement).toBe(property(2));
  });

  // (g)
  it('deleting the only row focuses + Add Condition', async () => {
    const user = userEvent.setup();
    render(<Harness initial={[TWO[0]]} />);

    await user.click(screen.getByRole('button', { name: 'Delete condition 1' }));

    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(document.activeElement).toBe(addButton());
  });

  // (h) The delete rule's OTHER branch: focus a user placed on a real control inside the fieldset
  // is left alone. `fireEvent.click` dispatches the click without the focus move a pointer makes.
  it('deleting while focus sits in another row leaves that focus alone', () => {
    render(<Harness initial={TWO} />);

    const min = screen.getByRole('textbox', { name: 'Condition 2 minimum' });
    min.focus();
    fireEvent.click(screen.getByRole('button', { name: 'Delete condition 1' }));

    expect(screen.getAllByRole('combobox', { name: /^Condition \d property$/ })).toHaveLength(1);
    expect(document.activeElement).toBe(min);
    expect(min).toHaveAccessibleName('Condition 1 minimum');
  });

  // (i)
  it('a value edit round-trips and moves no focus', async () => {
    const user = userEvent.setup();
    render(<Harness initial={TWO} />);

    const min = screen.getByRole('textbox', { name: 'Condition 2 minimum' });
    await user.type(min, '1');

    expect(min).toHaveValue('21');
    expect(document.activeElement).toBe(min);
  });

  // (j) A seeded card (Story 4.17) must not steal focus on mount.
  it('mounting with rows steals no focus', () => {
    render(<Harness initial={TWO} />);

    expect(document.activeElement).toBe(document.body);
  });

  // (k)
  it('has no axe violations with rows and with none', async () => {
    const withRows = render(<Harness initial={TWO} />);
    expect((await axe(withRows.container)).violations).toEqual([]);
    withRows.unmount();

    const empty = render(<Harness initial={NONE} />);
    expect((await axe(empty.container)).violations).toEqual([]);
  });
});
