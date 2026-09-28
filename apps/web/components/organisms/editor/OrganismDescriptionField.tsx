'use client';

import { styled } from '@mui/material/styles';
import { useId } from 'react';
import { MAX_ORGANISM_DESCRIPTION_LENGTH } from '@gol/domain';
import {
  exceedsOrganismDescriptionLength,
  validateOrganismDescription,
} from '@/lib/organisms/organismDescription';
import { ErrorText as BaseErrorText, Description, Field, Label } from './fieldStyles';

// `<OrganismNameField>`'s `Input` rule set on a textarea (Story 7.2 FD8 — the same editor, the same
// cap pattern), plus what a multi-line control needs: `resize: vertical` and the mockup's ~72px
// minimum. No `transition`, for the reason the name field records (an axe scan mid-fade measures a
// border no settled state has). `display: block` drops the inline-block baseline gap under it.
const TextArea = styled('textarea')({
  display: 'block',
  width: '100%',
  minHeight: '72px',
  resize: 'vertical',
  background: 'var(--gol-bg-hover)',
  border: '1px solid var(--gol-border-control)',
  color: 'var(--gol-text-primary)',
  padding: '12px 14px',
  fontSize: '14px',
  lineHeight: 1.4,
  fontFamily: 'inherit',
  '&:focus-visible': {
    outline: '2px solid var(--gol-accent)',
    outlineOffset: '-2px',
  },
  '&[aria-invalid="true"]': {
    borderColor: 'var(--gol-danger)',
  },
});

const Meta = styled('div')({
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'baseline',
  gap: '12px',
  marginTop: '4px',
});

const ErrorText = styled(BaseErrorText)({ flex: 1, minWidth: 0 });

const CharCount = styled('div')({
  fontSize: '11px',
  color: 'var(--gol-text-tertiary)',
  textAlign: 'right',
  marginLeft: 'auto',
  whiteSpace: 'nowrap',
  '&[data-over-limit]': {
    color: 'var(--gol-danger)',
  },
});

export interface OrganismDescriptionFieldProps {
  value: string;
  onChange(description: string): void;
  /** Defaults to the schema's own constant — never a literal. */
  maxLength?: number;
  /** Accepted for parity with `<OrganismNameField>`'s Save-time override. The description's only
   * error is over-limit, which shows immediately regardless, so this changes nothing today. */
  showAllErrors: boolean;
}

/**
 * The organism description (FR-9.5, Story 7.2), directly under the name. Optional free text shown
 * read-only on the organism's card. Follows `<OrganismNameField>`'s REFUSE pattern (Story 7.2 FD8):
 * no `maxLength` attribute and no clamp — over the cap is a displayed `role="alert"` error that the
 * Save gate (`validateOrganismDraft`) enumerates and focuses via `data-organism-description`. The
 * counter is `aria-describedby`-only, never a live region (it would announce every keystroke).
 */
export default function OrganismDescriptionField({
  value,
  onChange,
  maxLength = MAX_ORGANISM_DESCRIPTION_LENGTH,
}: OrganismDescriptionFieldProps) {
  const inputId = useId();
  const helperId = useId();
  const counterId = useId();
  const errorId = useId();

  // Optional field: over-limit is the only error, and it is immediate (the name field's FD2 rule
  // for over-limit), so there is no `touched` state to track.
  const error = validateOrganismDescription(value, maxLength);
  const overLimit = exceedsOrganismDescriptionLength(value, maxLength);

  return (
    <Field>
      <Label htmlFor={inputId}>Description</Label>
      <TextArea
        id={inputId}
        value={value}
        data-organism-description
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={error !== null}
        // Error first while mounted (an absent id fails axe's `aria-valid-attr-value`), then the
        // helper line and the counter.
        aria-describedby={
          error !== null ? `${errorId} ${helperId} ${counterId}` : `${helperId} ${counterId}`
        }
      />
      <Description id={helperId}>Optional. Shown on the organism&apos;s card.</Description>
      <Meta>
        {error !== null && (
          <ErrorText id={errorId} role="alert">
            <span aria-hidden="true">{'⚠︎'}</span> {error}
          </ErrorText>
        )}
        <CharCount id={counterId} data-over-limit={overLimit || undefined}>
          {value.length} / {maxLength}
        </CharCount>
      </Meta>
    </Field>
  );
}
