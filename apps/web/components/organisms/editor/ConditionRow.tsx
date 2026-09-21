'use client';

import { useId, useState, type ReactNode } from 'react';
import { styled } from '@mui/material/styles';
import { CELL_STATES, CONDITION_PROPERTIES } from '@gol/domain';
import {
  cellStateLabel,
  conditionPropertyLabel,
  type ConditionDraft,
  defaultConditionFor,
  isCellState,
  isConditionProperty,
  isNumericOperator,
  numericBoundsFor,
  operatorLabel,
  operatorsFor,
  type OrganismOption,
  ORGANISM_REQUIRED,
  validateConditionDraft,
  withOperator,
} from '@/lib/organisms/conditionDraft';
import { ErrorText as BaseErrorText, SelectInput, TextInput } from './fieldStyles';

/**
 * One condition row — `property -> operator -> value -> ✕` (Story 4.11, AC2). Fully CONTROLLED,
 * like every field in this editor: `<ConditionsEditor>` owns the list and this is a thin view over
 * one `ConditionDraft`, with `index` driving every derived name — "Condition N" is NEVER stored
 * (it renumbers on delete, the `<RuleCard>` "Rule N" precedent).
 *
 * `touched` is the ONLY local state (4.5 FD3): the draft — including its raw, possibly-invalid
 * numeric text — lives in the parent. Visibility of the row's error follows `touched` (4.5 FD2),
 * per-field: a numeric input flips its own flag on its first `change`, never on blur, never on
 * mount; `pair` needs BOTH the min and max flags. A property change or a scalar<->range operator
 * change clears `touched` — the inputs are new (AC4). Story 4.13's `showAllErrors` override shows
 * every error regardless of `touched` once a Save has been attempted — and it is sticky for the
 * life of the modal (4.13 FD3), so after the first refusal that `touched` reset is a no-op: a new
 * numeric input opens red until it is valid.
 *
 * FD1 — the five-property list follows the AC / design doc / PRD order (Cell State first), not
 * the mockup's four-option selector. FD2 — the cell-state labels carry the PRD's parentheticals.
 * FD5 — a one-option operator `<select>` stays enabled: it is a real control showing a real
 * choice. FD6 — the organism `<select>` never renders blank: a fallback option is prepended when
 * the pattern matches no library entry. FD7 — delete is immediate, no confirmation.
 *
 * No `role="group"` here and no `<li>` (FD4): the position in each control's `aria-label` is what
 * a screen reader needs, and the fieldset in `<ConditionsEditor>` is the one group.
 *
 * (Story 4.11) (Story 4.13) (FR-2.5) (UX-DR10) (UX-DR14) (UX-DR17) (AR-46) (Decision C) (Decision E)
 */

// `.condition-row` (`:628-634`).
const Row = styled('div')({
  display: 'grid',
  gridTemplateColumns: '2fr 1fr 2fr auto',
  gap: '10px',
  marginBottom: '10px',
  alignItems: 'center',
});

// Every grid child: a long property/organism label truncates natively rather than pushing the ✕
// out of the column at the compressed tier.
const gridChild = { minWidth: 0 } as const;

const RowSelect = styled(SelectInput)(gridChild);
const RowInput = styled(TextInput)({ ...gridChild, textAlign: 'center' }); // `.number-input` (:651-661)

// One flex cell holding both Min/Max inputs, so the row's grid keeps exactly four columns.
const RangeCell = styled('div')({
  display: 'flex',
  gap: '8px',
  alignItems: 'center',
  minWidth: 0,
});

const RangeInput = styled(TextInput)({ minWidth: 0, flex: 1, textAlign: 'center' });

const RangeDash = styled('span')({
  color: 'var(--gol-text-secondary)',
  flexShrink: 0,
});

// `<RuleCard>`'s `DeleteButton` rule set, copied (second caller, AC2).
const DeleteButton = styled('button')({
  ...gridChild,
  background: 'transparent',
  border: '1px solid var(--gol-border-control)',
  color: 'var(--gol-text-secondary)',
  padding: '6px 10px',
  fontSize: '12px',
  fontFamily: 'inherit',
  lineHeight: 1,
  cursor: 'pointer',
  minWidth: '32px',
  '&:hover': {
    borderColor: 'var(--gol-danger)',
    color: 'var(--gol-danger)',
  },
  '&:focus-visible': {
    outline: '2px solid var(--gol-accent)',
    outlineOffset: '2px',
  },
});

// `fieldStyles.ts`'s shared `ErrorText` (the validated-input idiom), plus `gridColumn`.
const ErrorText = styled(BaseErrorText)({
  gridColumn: '1 / -1',
});

type Touched = { readonly value: boolean; readonly min: boolean; readonly max: boolean };
const UNTOUCHED: Touched = { value: false, min: false, max: false };

export interface ConditionRowProps {
  draft: ConditionDraft;
  /** 0-based; every name derives from it. */
  index: number;
  organisms: readonly OrganismOption[];
  /** `organisms[0]?.id ?? ''` — computed once by the parent, the pattern a property switch
   * to Organism Type opens on (AC3). */
  defaultOrganismId: string;
  onChange(next: ConditionDraft): void;
  onDelete(id: string): void;
  /** Story 4.13's Save-time override: every error shows regardless of `touched`. */
  showAllErrors: boolean;
}

export default function ConditionRow({
  draft,
  index,
  organisms,
  defaultOrganismId,
  onChange,
  onDelete,
  showAllErrors,
}: ConditionRowProps) {
  const [touched, setTouched] = useState<Touched>(UNTOUCHED);
  const errorId = useId();
  const n = index + 1;

  const error = validateConditionDraft(draft);
  const visible =
    error !== null &&
    (showAllErrors || (error.field === 'pair' ? touched.min && touched.max : touched[error.field]));
  const errorField = visible ? error.field : null;

  // The visible error's own input(s) — `pair` names both range inputs.
  const invalidAttrs = (field: 'value' | 'min' | 'max') =>
    errorField === field || (field !== 'value' && errorField === 'pair')
      ? ({ 'aria-invalid': 'true' as const, 'aria-describedby': errorId } as const)
      : {};

  let valueCell: ReactNode;
  if (draft.property === 'cellState') {
    valueCell = (
      <RowSelect
        aria-label={`Condition ${n} value`}
        value={draft.pattern}
        data-condition-value
        onChange={(event) => {
          const value = event.target.value;
          if (isCellState(value)) onChange({ ...draft, pattern: value });
        }}
      >
        {CELL_STATES.map((state) => (
          <option key={state} value={state}>
            {cellStateLabel(state)}
          </option>
        ))}
      </RowSelect>
    );
  } else if (draft.property === 'organismType') {
    const hasMatch = organisms.some((organism) => organism.id === draft.pattern);
    valueCell = (
      <RowSelect
        aria-label={`Condition ${n} value`}
        value={draft.pattern}
        data-condition-value
        {...invalidAttrs('value')}
        onChange={(event) => onChange({ ...draft, pattern: event.target.value })}
      >
        {!hasMatch && (
          <option value={draft.pattern}>
            {draft.pattern === '' ? ORGANISM_REQUIRED : 'Unknown organism'}
          </option>
        )}
        {organisms.map((organism) => (
          <option key={organism.id} value={organism.id}>
            {organism.name}
          </option>
        ))}
      </RowSelect>
    );
  } else if (draft.operator === 'range') {
    valueCell = (
      <RangeCell>
        <RangeInput
          aria-label={`Condition ${n} minimum`}
          type="text"
          inputMode="numeric"
          placeholder="Min"
          value={draft.pattern[0]}
          data-condition-min
          {...invalidAttrs('min')}
          onChange={(event) => {
            setTouched((t) => ({ ...t, min: true }));
            onChange({ ...draft, pattern: [event.target.value, draft.pattern[1]] });
          }}
        />
        <RangeDash aria-hidden="true">{'—'}</RangeDash>
        <RangeInput
          aria-label={`Condition ${n} maximum`}
          type="text"
          inputMode="numeric"
          placeholder="Max"
          value={draft.pattern[1]}
          data-condition-max
          {...invalidAttrs('max')}
          onChange={(event) => {
            setTouched((t) => ({ ...t, max: true }));
            onChange({ ...draft, pattern: [draft.pattern[0], event.target.value] });
          }}
        />
      </RangeCell>
    );
  } else {
    const { min, max } = numericBoundsFor(draft.property);
    valueCell = (
      <RowInput
        aria-label={`Condition ${n} value`}
        type="text"
        inputMode="numeric"
        placeholder={`${min}–${max}`}
        value={draft.pattern}
        data-condition-value
        {...invalidAttrs('value')}
        onChange={(event) => {
          setTouched((t) => ({ ...t, value: true }));
          onChange({ ...draft, pattern: event.target.value });
        }}
      />
    );
  }

  return (
    <Row data-condition-row data-condition-id={draft.id}>
      <RowSelect
        aria-label={`Condition ${n} property`}
        value={draft.property}
        data-condition-property
        onChange={(event) => {
          const value = event.target.value;
          if (isConditionProperty(value)) {
            setTouched(UNTOUCHED);
            onChange(defaultConditionFor(draft.id, value, defaultOrganismId));
          }
        }}
      >
        {CONDITION_PROPERTIES.map((property) => (
          <option key={property} value={property}>
            {conditionPropertyLabel(property)}
          </option>
        ))}
      </RowSelect>

      <RowSelect
        aria-label={`Condition ${n} operator`}
        value={draft.operator}
        data-condition-operator
        onChange={(event) => {
          if (draft.property === 'cellState' || draft.property === 'organismType') return;
          const value = event.target.value;
          if (isNumericOperator(value)) {
            const next = withOperator(draft, value);
            if ((next.operator === 'range') !== (draft.operator === 'range')) {
              setTouched(UNTOUCHED);
            }
            onChange(next);
          }
        }}
      >
        {operatorsFor(draft.property).map((operator) => (
          <option key={operator} value={operator}>
            {operatorLabel(operator)}
          </option>
        ))}
      </RowSelect>

      {valueCell}

      <DeleteButton
        type="button"
        aria-label={`Delete condition ${n}`}
        data-condition-delete
        onClick={() => onDelete(draft.id)}
      >
        <span aria-hidden="true">✕</span>
      </DeleteButton>

      {visible && error !== null && (
        <ErrorText id={errorId} role="alert" data-condition-error>
          <span aria-hidden="true">{'⚠︎'}</span> {error.message}
        </ErrorText>
      )}
    </Row>
  );
}
