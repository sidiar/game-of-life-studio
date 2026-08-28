'use client';

import { useId } from 'react';
import { styled } from '@mui/material/styles';
import { MAX_BATTLE_NAME_LENGTH } from '@gol/domain';

// Mockup: `.battle-name-input` (clinical-lab-theme/petri-dish-lab-mode.html:381-403). Visual sizing
// (14px, no text-transform) is copied straight from the mockup's OWN rule for this field — unlike
// `<OrganismRoster>`'s `SearchInput`, which borrows its 11px/uppercase styling from the MOCKUP'S
// `.organism-search`, a different element with different typography. A battle name is content the
// user typed and reads back, not a filter label; upper-casing it here would misrepresent what they
// entered on every subsequent render.
//
// ⚠️ `--gol-border-control`, NOT the mockup's literal `var(--border)` — the same SC 1.4.11
// substitution `SearchInput` and `<BattleTile>`'s DeleteButton both record: `--gol-border` is
// decorative at 1.57:1, and this border is the input's ONLY boundary. The real focus-visible ring
// (`2px solid var(--gol-accent)`, not the mockup's `border-color` swap) and the enumerated
// transition + `prefers-reduced-motion` escape ARE the house style Task 4 asks for — the
// accessibility mechanics `SearchInput` established, reused here rather than re-derived.
const Input = styled('input')({
  width: '100%',
  background: 'var(--gol-bg-hover)',
  border: '1px solid var(--gol-border-control)',
  color: 'var(--gol-text-primary)',
  padding: '12px 14px',
  fontSize: '14px',
  fontFamily: 'inherit',
  transition: 'border-color 0.2s',
  marginBottom: '4px',
  '&::placeholder': {
    color: 'var(--gol-text-secondary)',
    opacity: 0.8,
  },
  '&:focus-visible': {
    outline: '2px solid var(--gol-accent)',
    outlineOffset: '-2px',
  },
  '@media (prefers-reduced-motion: reduce)': {
    transition: 'none',
  },
});

// Mockup: `.char-count` (:397-403). `--gol-text-tertiary`, not the mockup's literal `--text-
// tertiary` — themes.css departure #1 already raised this token from the UX spec's #666666 to
// #8a8a8a precisely so small text clears 4.5:1 on all three backgrounds (AR-46: no raw hex, and no
// new token needed).
const CharCount = styled('div')({
  fontSize: '11px',
  color: 'var(--gol-text-tertiary)',
  textAlign: 'right',
});

export interface BattleNameFieldProps {
  value: string;
  onChange(name: string): void;
  /** FR-3.9 / `BattleSchema.name`'s cap. Defaults to `@gol/domain`'s `MAX_BATTLE_NAME_LENGTH`,
   * the schema's OWN constant — never a re-typed literal (Task 2). A `100` written here would be a
   * second source for a number `BattleSchema` already owns, and the drift it allows ends as a
   * `ZodError` from Story 2.13's write path with the counter still reading "/ 100".
   *
   * Enforced twice, deliberately: the native `maxLength` attribute stops ordinary typing at the
   * UA, and the change handler clamps whatever still arrives over the cap (forced decision 6b). */
  maxLength?: number;
}

/**
 * The "Battle Name" sidebar section's control (component-tree-battle-page.md §3.5). Fully
 * CONTROLLED — no state of its own (contrast `<OrganismRoster>`'s search text, which spec §6 does
 * assign to the component): `<BattlePage>` owns `battleName` and this is a thin, testable view over
 * it.
 *
 * ❌ No `<form>` and no submit handler (forced decision 5). A bare `<button>` already exists in this
 * sidebar's footer-to-be (`<EditorStatusBar>`'s Undo), and a `<form>` wrapping a single text input
 * triggers implicit submission on Enter — under `output: 'export'` that is a full page reload that
 * discards the grid, the undo ring and the session roster. There is no submit action here; the
 * field is live-bound through `onChange` alone.
 *
 * ❌ No `@mui/material/TextField` / `Input` / `FormControl` / `FormHelperText` — Story 2.9 won ~10 KB
 * back by not spending it and Story 2.10 held the line; `/` shares this chunk's headroom.
 */
export default function BattleNameField({
  value,
  onChange,
  maxLength = MAX_BATTLE_NAME_LENGTH,
}: BattleNameFieldProps) {
  // Forced decision 4: `useId()`, not a hardcoded string — this is a statically exported, hydrated
  // page, so a hand-rolled id risks a server/client mismatch, and a hardcoded one breaks the moment
  // anything ever renders a second `<BattleNameField>`.
  const counterId = useId();

  return (
    <div>
      <Input
        type="text"
        value={value}
        // Forced decision 6, reversed to option (b) on Sidiar's call (2026-08-28). The native
        // `maxLength` attribute below is a UA guarantee for ORDINARY TYPING ONLY — it is not applied
        // to text committed by an active IME, nor to `document.execCommand('insertText')`, browser
        // voice dictation, or a password-manager/autofill write. Each of those fires an `input`
        // event whose `event.target.value` is ALREADY over the cap; without this clamp it flows
        // through to `battleName` and the counter reads "104 / 100" with no error state, over a name
        // `BattleSchema.name`'s `.max()` rejects at Story 2.13's save. The clamp makes the counter
        // structurally unable to exceed its denominator. Accepted cost, flagged when the decision
        // was taken: an over-long paste is silently truncated rather than shown and refused.
        onChange={(event) => onChange(event.target.value.slice(0, maxLength))}
        maxLength={maxLength}
        placeholder="Untitled Battle"
        // Forced decision 4, name (a): `aria-label`, the `<OrganismRoster>` `SearchInput` precedent
        // — used there, and here, precisely because the visible "Battle Name" section heading is
        // the sighted label and there is no OTHER visible label to prefer.
        aria-label="Battle name"
        // Forced decision 4, counter (a): `aria-describedby`, announced once when the field takes
        // focus and silent while typing — never `aria-live` (every keystroke would be announced,
        // which is noise) and never unassociated (a stray number no screen-reader user can
        // attribute to the field).
        aria-describedby={counterId}
      />
      {/* ⚠️ `value.length` — UTF-16 code units, which is what BOTH the DOM `maxLength` attribute
          and Zod's `.max()` count. `[...value].length` (code points) or `Intl.Segmenter` graphemes
          read "nicer" for an astral-plane character (an emoji) and would disagree with both,
          showing e.g. "99 / 100" on a value the schema actually rejects. */}
      <CharCount id={counterId}>
        {value.length} / {maxLength}
      </CharCount>
    </div>
  );
}
