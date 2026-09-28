'use client';

import { useId } from 'react';
import { styled } from '@mui/material/styles';
import { MAX_BATTLE_DESCRIPTION_LENGTH } from '@gol/domain';

// `<BattleNameField>`'s `Input` rule set on a textarea (Story 7.2 FD8 — the same editor, the same
// clamp pattern), plus `resize: vertical` and a ~72px minimum. The enumerated `border-color`
// transition is safe here for the reason the name field records: nothing animated changes on
// `:disabled`, so no axe scan can land mid-fade.
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
  transition: 'border-color 0.2s',
  marginBottom: '4px',
  '&:focus-visible': {
    outline: '2px solid var(--gol-accent)',
    outlineOffset: '-2px',
  },
  '&:disabled': {
    background: 'var(--gol-action-disabled-bg)',
    color: 'var(--gol-action-disabled)',
    cursor: 'not-allowed',
  },
  '@media (prefers-reduced-motion: reduce)': {
    transition: 'none',
  },
});

// The visible label: the section heading above names the NAME field, so this control needs its own.
const Label = styled('label')({
  display: 'block',
  margin: '16px 0 8px',
  fontSize: '12px',
  fontWeight: 500,
  color: 'var(--gol-text-secondary)',
});

// `<BattleNameField>`'s counter and cap-notice rules.
const CharCount = styled('div')({
  fontSize: '11px',
  color: 'var(--gol-text-tertiary)',
  textAlign: 'right',
});

const CapNotice = styled('div')({
  fontSize: '11px',
  color: 'var(--gol-text-secondary)',
  textAlign: 'right',
});

export interface BattleDescriptionFieldProps {
  value: string;
  onChange(description: string): void;
  /** Defaults to the schema's own `MAX_BATTLE_DESCRIPTION_LENGTH` — never a re-typed literal. */
  maxLength?: number;
  /** The visible half of `<BattlePage>`'s edit lock, exactly as on `<BattleNameField>`. */
  disabled?: boolean;
}

/**
 * The battle description (FR-9.5, Story 7.2), under the name in the Lab sidebar. Fully controlled;
 * `<BattlePage>` owns the value and the dirty flag.
 *
 * Follows `<BattleNameField>`'s CLAMP pattern (Story 7.2 FD8): native `maxLength` for ordinary
 * typing plus `.slice(0, maxLength)` for the IME/dictation/autofill writes the attribute does not
 * cover, an `aria-describedby` counter (never a live region — it would announce every keystroke),
 * and the one polite `role="status"` notice rendered only at the cap. ❌ No MUI `TextField` (the
 * bundle rule `<BattleNameField>` records) and no `<form>` (implicit submit would reload the page).
 */
export default function BattleDescriptionField({
  value,
  onChange,
  maxLength = MAX_BATTLE_DESCRIPTION_LENGTH,
  disabled = false,
}: BattleDescriptionFieldProps) {
  const inputId = useId();
  const counterId = useId();

  return (
    <div>
      <Label htmlFor={inputId}>Description</Label>
      <TextArea
        id={inputId}
        value={value}
        onChange={(event) => onChange(event.target.value.slice(0, maxLength))}
        maxLength={maxLength}
        aria-describedby={counterId}
        disabled={disabled}
      />
      <CharCount id={counterId}>
        {value.length} / {maxLength}
      </CharCount>
      {value.length >= maxLength && (
        <CapNotice role="status">Description limit reached — {maxLength} characters.</CapNotice>
      )}
    </div>
  );
}
