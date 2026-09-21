'use client';

import { useCallback, useEffect, useId, useRef } from 'react';
import { styled } from '@mui/material/styles';
import {
  appendCondition,
  type ConditionDraft,
  createNewConditionDraft,
  type OrganismOption,
  removeCondition,
  replaceCondition,
} from '@/lib/organisms/conditionDraft';
import { RULE_NEEDS_CONDITION } from '@/lib/organisms/ruleDraft';
import { ErrorText, Fieldset, Legend } from './fieldStyles';
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
 *
 * Story 4.13 flags a zero-condition card at Save: `showAllErrors && conditions.length === 0`
 * mounts a `role="alert"` line between the legend and the rows, and marks "+ Add Condition" —
 * the control that fixes the error — with `aria-describedby` and `data-invalid` (FD4: `group` and
 * `button` do not allow `aria-invalid` in ARIA 1.2; axe's `aria-allowed-attr` fails either).
 *
 * (Story 4.11) (Story 4.13) (UX-DR10) (UX-DR14) (UX-DR17)
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
  // Story 4.13 (FD4): the border-only boundary cue — `aria-invalid` is not allowed on `button` in
  // ARIA 1.2 (axe `aria-allowed-attr`), so the button carries `data-invalid` + `aria-describedby`
  // instead; the label text stays `--gol-text-secondary`, never `--gol-danger` (that pairing on
  // `--gol-bg-hover`, the hover fill, is the 4.48:1 pair `themeTokens.test.ts` deliberately does
  // not gate).
  '&[data-invalid]': {
    borderColor: 'var(--gol-danger)',
  },
});

export interface ConditionsEditorProps {
  conditions: readonly ConditionDraft[];
  organisms: readonly OrganismOption[];
  /** Updater-style (the RulesEditor FD8 contract), already bound to the owning rule by <RuleCard>. */
  onConditionsChange(
    update: (conditions: readonly ConditionDraft[]) => readonly ConditionDraft[],
  ): void;
  /** Story 4.13's Save-time override: with zero rows, flags the card at the control that fixes it
   * ("+ Add Condition") rather than the fieldset (FD4). Passed through to every `<ConditionRow>`. */
  showAllErrors: boolean;
}

export default function ConditionsEditor({
  conditions,
  organisms,
  onConditionsChange,
  showAllErrors,
}: ConditionsEditorProps) {
  const rootRef = useRef<HTMLFieldSetElement>(null);
  const prevIdsRef = useRef<readonly string[] | null>(null);
  const defaultOrganismId = organisms[0]?.id ?? '';
  const errorId = useId();
  const needsCondition = showAllErrors && conditions.length === 0;

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
      {needsCondition && (
        <ErrorText id={errorId} role="alert" data-rule-error>
          <span aria-hidden="true">{'⚠︎'}</span> {RULE_NEEDS_CONDITION}
        </ErrorText>
      )}
      {conditions.map((condition, index) => (
        <ConditionRow
          key={condition.id}
          draft={condition}
          index={index}
          organisms={organisms}
          defaultOrganismId={defaultOrganismId}
          onChange={handleChange}
          onDelete={handleDelete}
          showAllErrors={showAllErrors}
        />
      ))}
      <AddConditionButton
        type="button"
        data-add-condition
        aria-describedby={needsCondition ? errorId : undefined}
        data-invalid={needsCondition || undefined}
        onClick={addCondition}
      >
        + Add Condition
      </AddConditionButton>
    </Fieldset>
  );
}
