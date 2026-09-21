'use client';

import { useId, useState } from 'react';
import { styled } from '@mui/material/styles';
import { MAX_ORGANISM_NAME_LENGTH } from '@gol/domain';
import { exceedsOrganismNameLength, validateOrganismName } from '@/lib/organisms/organismName';
import { ErrorText as BaseErrorText, Field, Label } from './fieldStyles';

// `<BattleNameField>`'s `Input` rule set (the reviewed idiom for this exact control — tokens,
// focus ring, `--gol-border-control` in place of the decorative `--gol-border` the mockup uses,
// SC 1.4.11), minus three things it has and this field must not:
//   - no `marginBottom` — `<Meta>` below owns the gap;
//   - no `:disabled` — there is no disabled state here;
//   - no `transition` and therefore no reduced-motion block (FD5). `<BattleNameField>` keeps
//     `transition: border-color 0.2s` safely because its border never changes colour on a state
//     flip. Here the border animates `--gol-border-control` → `--gol-danger` on every validity
//     change, and an axe scan landing mid-fade measures a boundary no settled state has — the trap
//     `<BackButton>` (Story 4.3), `<EditorStatusBar>`, `<SidebarFooter>` and `<ModeButton>` each
//     record.
// The invalid border is `--gol-danger` on `--gol-bg-hover` — 4.48:1 (`deferred-work.md`'s
// danger-on-hover entry), which fails 4.5:1 for TEXT but clears the 3:1 a non-text boundary needs
// (SC 1.4.11). That is why nothing danger-coloured ever goes INSIDE the input: the error text and
// the counter sit on the column's `--gol-bg-secondary` (4.90:1).
const Input = styled('input')({
  width: '100%',
  background: 'var(--gol-bg-hover)',
  border: '1px solid var(--gol-border-control)',
  color: 'var(--gol-text-primary)',
  padding: '12px 14px',
  fontSize: '14px',
  fontFamily: 'inherit',
  '&::placeholder': {
    color: 'var(--gol-text-secondary)',
    opacity: 0.8,
  },
  '&:focus-visible': {
    outline: '2px solid var(--gol-accent)',
    outlineOffset: '-2px',
  },
  '&[aria-invalid="true"]': {
    borderColor: 'var(--gol-danger)',
  },
});

// The row under the input: error line (when any) on the left, counter on the right. With no error
// the counter is the only child and `marginLeft: auto` keeps it right-aligned (the mockup's
// `.char-count`).
const Meta = styled('div')({
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'baseline',
  gap: '12px',
  marginTop: '4px',
});

// The design doc's "red text and warning icon" (`organism-editor-design.md:772-777`), at the
// counter's 11px scale, in the house error colour `<SaveErrorLine>` (`BattleEditorView.tsx`)
// established. `fieldStyles.ts`'s shared `ErrorText` (Story 4.13, the third-caller lift) plus this
// field's own layout rule: `flex: 1; minWidth: 0` so a long message wraps instead of pushing the
// counter out of `<Meta>`'s flex row.
const ErrorText = styled(BaseErrorText)({
  flex: 1,
  minWidth: 0,
});

// Mockup: `.char-count`. `--gol-text-tertiary`, the token themes.css raised to clear 4.5:1 for
// small text (AR-46: no raw hex). The over-limit colour flips on a `data-*` attribute + selector —
// `<BattleHeader>`'s `data-mode-value` idiom — rather than a `shouldForwardProp` styled prop.
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

export interface OrganismNameFieldProps {
  value: string;
  onChange(name: string): void;
  /** Defaults to `MAX_ORGANISM_NAME_LENGTH` — the schema's own constant, never a literal. A `50`
   * written here would be a second source for a number `OrganismSchema` already owns. */
  maxLength?: number;
  /** Story 4.13's Save-time override: every error shows regardless of `touched` (4.5 FD2 kept for
   * the untouched, unattempted case). */
  showAllErrors: boolean;
}

/**
 * The Basic Information column's first control (Story 4.5, FR-2.1): a labelled, required organism
 * name with a live "N / 50" counter and the inline error state (`organism-editor-design.md:129-159,
 * 751-753, 772-777`). Fully CONTROLLED — `<OrganismEditorModal>` owns the draft (RFC-005 Decision 1)
 * and this is a thin view over `draft.name`, exactly like `<BattleNameField>` over `battleName`.
 *
 * Forced decisions, each recorded in the story file:
 * - FD1 — REFUSE, don't clamp: no `maxLength` attribute, no `.slice()`. Over-limit is a displayed
 *   error the AC and Story 4.13's Save gate both enumerate; a clamp makes it unreachable dead text.
 * - FD2 — the required error waits for the first edit (`touched`); the over-limit error is
 *   immediate and does NOT wait for `touched`: a value that arrives over the cap without an edit
 *   (a seeded draft, a lowered cap) is flagged on mount, so the counter's `--gol-danger` and
 *   `aria-invalid` can never disagree. Story 4.13 adds `showAllErrors`, the Save-time override:
 *   `touched || overLimit || showAllErrors` — the field's own logic is otherwise unchanged.
 * - FD3 — the draft lives in the modal, not here; this component holds only `touched`.
 * - FD4 — the error line is `role="alert"`, mounted only while an error is visible, so it announces
 *   once per transition and never per keystroke; the counter stays `aria-describedby`-only.
 * - FD5 — no `transition` on the input (see `Input`).
 * - FD6 — plain `styled('input')`, not MUI `TextField`: the theme has no `MuiTextField` /
 *   `MuiOutlinedInput` / `MuiFormHelperText` overrides, and a first `TextField` would render
 *   Material's floating label, notched outline and 250ms outline transition, none of which the flat
 *   mockup input has.
 *
 * ❌ No `<form>` (Story 2.11's reasoning): a `<form>` around one text input submits implicitly on
 * Enter, which under `output: 'export'` is a full page reload that discards the draft.
 *
 * Ids: `useId()` for both, because unlike the dialog title this is not a singleton — Story 4.11's
 * condition rows and Story 4.24's battle-origin editor make a second instance plausible. The modal
 * test and the e2e locate the field by its accessible name and follow `aria-describedby`, never a
 * literal id. Colours are `--gol-*` tokens throughout (AR-46).
 */
export default function OrganismNameField({
  value,
  onChange,
  maxLength = MAX_ORGANISM_NAME_LENGTH,
  showAllErrors,
}: OrganismNameFieldProps) {
  const inputId = useId();
  const counterId = useId();
  const errorId = useId();

  // FD2: flips on the first change event — never on blur (tabbing through an untouched field to
  // reach the next control is not an error) and never on mount (a fresh editor does not open red).
  // Story 4.13's `showAllErrors` is the Save-time override, applied below alongside `touched`.
  const [touched, setTouched] = useState(false);
  const error = validateOrganismName(value, maxLength);
  // The SAME predicate the validator uses (`organismName.ts`), so the counter's red and the error
  // line cannot disagree. Over-limit bypasses `touched`: the required error is the only one an
  // untouched field may hide — a value over the cap is wrong however it got there, and hiding the
  // alert while the counter is already red would leave colour as the only indicator (SC 1.4.1).
  const overLimit = exceedsOrganismNameLength(value, maxLength);
  const visibleError = touched || overLimit || showAllErrors ? error : null;

  return (
    <Field>
      {/* The visible label IS the accessible name (`<label for>`): no `aria-label`, which would be
          a second, overriding name for a control that already has a visible one (SC 2.5.3). */}
      <Label htmlFor={inputId}>Organism Name</Label>
      <Input
        id={inputId}
        type="text"
        value={value}
        // The gate's focus target (Story 4.13, `errorTargetSelector`) — the modal must not locate
        // this control by its label text.
        data-organism-name
        // FD1 — deliberately NOT `BattleNameField.tsx`'s `.slice(0, maxLength)` + `maxLength`
        // attribute. That clamp exists because the battle name is live-bound with no validating
        // gate, so over-limit had to be made unreachable. The organism editor HAS a gate: this
        // story's AC and Story 4.13's Save ("name missing/over-limit … when Save is attempted")
        // both enumerate over-limit as a DISPLAYED error, which a clamp turns into dead text. The
        // over-limit error below is the boundary feedback, so there is no cap notice either.
        onChange={(event) => {
          setTouched(true);
          onChange(event.target.value);
        }}
        placeholder="e.g., Aggressive Colonizer"
        aria-required="true"
        aria-invalid={visibleError !== null}
        // Error FIRST so it is read first; the counter always. The error id is listed ONLY while
        // the alert is mounted — a describedby pointing at an absent id fails axe's
        // `aria-valid-attr-value`.
        aria-describedby={visibleError !== null ? `${errorId} ${counterId}` : counterId}
      />
      <Meta>
        {visibleError !== null && (
          <ErrorText id={errorId} role="alert">
            {/* U+FE0E pins TEXT presentation: bare U+26A0 is left to the platform, and an emoji
                rendering paints its own colours, ignoring `--gol-danger`. */}
            <span aria-hidden="true">{'\u26A0\uFE0E'}</span> {visibleError}
          </ErrorText>
        )}
        {/* ⚠️ `value.length` — UTF-16 code units, which is what Zod's `.max()` counts. Code
            points or graphemes would read "nicer" for an emoji and disagree with the schema. */}
        <CharCount id={counterId} data-over-limit={overLimit || undefined}>
          {value.length} / {maxLength}
        </CharCount>
      </Meta>
    </Field>
  );
}
