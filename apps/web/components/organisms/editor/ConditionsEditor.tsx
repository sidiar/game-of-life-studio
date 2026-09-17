'use client';

import { useCallback, useEffect, useRef } from 'react';
import { styled } from '@mui/material/styles';
import {
  appendCondition,
  type ConditionDraft,
  createNewConditionDraft,
  type OrganismOption,
  removeCondition,
  replaceCondition,
} from '@/lib/organisms/conditionDraft';
import { Fieldset, Legend } from './fieldStyles';
import ConditionRow from './ConditionRow';

/**
 * The Conditions block mounted after Action in every `<RuleCard>` (Story 4.11, AC1): a `<fieldset>`
 * labelled "Conditions (all must match)", its rows in order, then a persistent "+ Add Condition"
 * action — rendered UNCONDITIONALLY, with zero rows or many. A fieldset, not a list (AC2's FD4
 * reasoning): the AC-mandated visible label needs a `<legend>` to be programmatically associated,
 * and per-row groups would add a third announcement level for information a name like
 * "Condition 2 minimum" already carries.
 *
 * **Focus follows the row diff** (AC8, `<RulesEditor>`'s FD6 effect transposed to one fieldset per
 * card — two cards' effects cannot see each other's rows, since each is scoped to its own
 * `rootRef`): first run records ids and does nothing (a seeded card, Story 4.17, must not steal
 * focus); add -> focus the new row's property select; delete -> the non-loose-focus rule
 * (`<RulesEditor>`'s `focusIsLoose` idiom) targets the row now at the removed index, else the last
 * row, else `[data-add-condition]` when no row remains — every target is non-destructive (the
 * Story 4.10 AC5 reasoning); any other change moves nothing.
 */

const AddConditionButton = styled('button')({
  width: '100%',
  background: 'transparent',
  border: '1px solid var(--gol-border-control)',
  color: 'var(--gol-text-secondary)',
  padding: '10px',
  fontSize: '12px',
  fontWeight: 500,
  fontFamily: 'inherit',
  cursor: 'pointer',
  '&:hover': {
    borderColor: 'var(--gol-accent)',
    color: 'var(--gol-accent)',
    background: 'var(--gol-bg-hover)',
  },
  '&:focus-visible': {
    outline: '2px solid var(--gol-accent)',
    outlineOffset: '2px',
  },
});

export interface ConditionsEditorProps {
  conditions: readonly ConditionDraft[];
  organisms: readonly OrganismOption[];
  /** Updater-style (the RulesEditor FD8 contract), already bound to the owning rule by <RuleCard>. */
  onConditionsChange(
    update: (conditions: readonly ConditionDraft[]) => readonly ConditionDraft[],
  ): void;
}

export default function ConditionsEditor({
  conditions,
  organisms,
  onConditionsChange,
}: ConditionsEditorProps) {
  const rootRef = useRef<HTMLFieldSetElement>(null);
  const prevIdsRef = useRef<readonly string[] | null>(null);
  const defaultOrganismId = organisms[0]?.id ?? '';

  const handleChange = useCallback(
    (next: ConditionDraft) => onConditionsChange((c) => replaceCondition(c, next)),
    [onConditionsChange],
  );

  const handleDelete = useCallback(
    (id: string) => onConditionsChange((c) => removeCondition(c, id)),
    [onConditionsChange],
  );

  const addCondition = useCallback(() => {
    // Minted OUTSIDE the updater — React may run an updater twice.
    const id = crypto.randomUUID();
    onConditionsChange((c) => appendCondition(c, createNewConditionDraft(id)));
  }, [onConditionsChange]);

  useEffect(() => {
    const ids = conditions.map((c) => c.id);
    const prev = prevIdsRef.current;
    const root = rootRef.current;

    if (prev === null) {
      prevIdsRef.current = ids;
      return;
    }

    const rowControl = (id: string, control: string) =>
      root?.querySelector<HTMLElement>(`[data-condition-id="${CSS.escape(id)}"] ${control}`);

    if (ids.length === prev.length + 1) {
      const addedId = ids.find((id) => !prev.includes(id));
      if (addedId !== undefined) {
        rowControl(addedId, '[data-condition-property]')?.focus();
      }
    } else if (ids.length === prev.length - 1) {
      const removedIndex = prev.findIndex((id, i) => ids[i] !== id);

      const active = document.activeElement;
      const focusIsLoose = active === null || active === document.body || !root?.contains(active);
      if (focusIsLoose) {
        if (ids.length === 0) {
          root?.querySelector<HTMLElement>('[data-add-condition]')?.focus();
        } else {
          const targetId = ids[Math.min(removedIndex, ids.length - 1)];
          if (targetId !== undefined) {
            rowControl(targetId, '[data-condition-property]')?.focus();
          }
        }
      }
    }
    // Same-length changes (a value edit, an operator change) move no focus.

    prevIdsRef.current = ids;
  }, [conditions]);

  return (
    <Fieldset ref={rootRef} data-conditions>
      <Legend>Conditions (all must match)</Legend>
      {conditions.map((condition, index) => (
        <ConditionRow
          key={condition.id}
          draft={condition}
          index={index}
          organisms={organisms}
          defaultOrganismId={defaultOrganismId}
          onChange={handleChange}
          onDelete={handleDelete}
        />
      ))}
      <AddConditionButton type="button" data-add-condition onClick={addCondition}>
        + Add Condition
      </AddConditionButton>
    </Fieldset>
  );
}
