'use client';

import { useId, useState } from 'react';
import { styled } from '@mui/material/styles';
import { MAX_DOMINANCE, MIN_DOMINANCE } from '@gol/domain';
import { clampDominance, isDominanceInRange, parseDominanceText } from '@/lib/organisms/dominance';

// Mockup: `.form-field` (`clinical-lab-theme/organism-editor.html:390-448, 954-964`). Same rule
// set as `<OrganismNameField>`'s `Field` — the 4.5 `.form-field` — so the two controls' vertical
// rhythm in Basic Information matches.
const Field = styled('div')({
  margin: '0 0 20px 0',
});

// COPY of `<OrganismNameField>`'s `Label` rule set (13px / 500 / text-primary / margin 0 0 8px 0)
// — the two labels must look identical, and importing across sibling field components would be a
// coupling neither needs.
const Label = styled('label')({
  display: 'block',
  fontSize: '13px',
  fontWeight: 500,
  color: 'var(--gol-text-primary)',
  margin: '0 0 8px 0',
});

// Mockup: `.field-description` (`organism-editor.html:165-170`). `--gol-text-tertiary` is the
// token themes.css raised to clear 4.5:1 for small text on `--gol-bg-secondary` (AR-46, the
// gated pair `themeTokens.test.ts` already covers).
const Description = styled('p')({
  fontSize: '11px',
  color: 'var(--gol-text-tertiary)',
  margin: '4px 0 0 0',
  lineHeight: 1.4,
});

// Mockup: `.dominance-container` (`:954-964`).
const Row = styled('div')({
  display: 'flex',
  alignItems: 'center',
  gap: '15px',
  marginTop: '10px',
});

/**
 * Mockup: `.dominance-slider` and its thumb (`:390-426`). Story 3.13's `SpeedControl.tsx` `Slider`
 * block, COPIED (never imported — `battle/simulation/` and `organisms/editor/` do not reach across
 * one another, `project-context.md`), with the editor mockup's own thumb glow swapped in (FD5) and
 * no `borderRadius` on the track: Clinical Lab's chrome is sharp and this mockup sets none, unlike
 * the play mockup's 3px rail. Track fill is `--gol-border-control`, not the mockup's decorative
 * `--bg-hover` + `--border` pair — a 6px track is the control's only boundary (SC 1.4.11) and
 * `--gol-border` measures 1.57:1, the same substitution 3.13's slider already records; the pair is
 * an existing gated row in `themeTokens.test.ts`, so this adds no new contrast row.
 */
const Slider = styled('input')({
  flex: 1,
  height: '6px',
  margin: 0,
  background: 'var(--gol-border-control)',
  appearance: 'none',
  WebkitAppearance: 'none',
  cursor: 'pointer',
  '&::-webkit-slider-thumb': {
    appearance: 'none',
    WebkitAppearance: 'none',
    width: '20px',
    height: '20px',
    background: 'var(--gol-accent)',
    border: '2px solid var(--gol-bg-primary)',
    borderRadius: '50%',
    boxShadow: 'var(--gol-shadow-slider-thumb)',
  },
  '&::-moz-range-thumb': {
    appearance: 'none',
    width: '20px',
    height: '20px',
    background: 'var(--gol-accent)',
    border: '2px solid var(--gol-bg-primary)',
    borderRadius: '50%',
    boxShadow: 'var(--gol-shadow-slider-thumb)',
  },
  // Firefox paints its native track over the input's own `background` unless this is styled too
  // (3.13 trap 7).
  '&::-moz-range-track': {
    height: '6px',
    background: 'var(--gol-border-control)',
  },
  '&:focus-visible': {
    outline: '2px solid var(--gol-accent)',
    outlineOffset: '2px',
  },
});

// Mockup: `.dominance-value` (`:428-441`). `--gol-border-control`, NOT the mockup's decorative
// `--border` (SC 1.4.11 — the same `<BattleNameField>` substitution every control boundary here
// makes). No `transition` (Story 4.5 FD5 — a control whose visual state never flips a colour).
const ValueInput = styled('input')({
  background: 'var(--gol-bg-hover)',
  border: '1px solid var(--gol-border-control)',
  color: 'var(--gol-text-primary)',
  padding: '8px 12px',
  fontSize: '16px',
  fontFamily: 'inherit',
  fontWeight: 600,
  width: '60px',
  textAlign: 'center',
  flex: 'none',
  '&:focus-visible': {
    outline: '2px solid var(--gol-accent)',
    outlineOffset: '-2px',
  },
});

// Mockup: `.dominance-labels` (`:443-448`). Decorative — the slider already exposes its own bounds
// through `aria-valuemin`/`aria-valuemax`, so a visible copy would be announced twice (3.13 trap
// 5) and these are `aria-hidden`.
const Marks = styled('div')({
  display: 'flex',
  justifyContent: 'space-between',
  fontSize: '11px',
  color: 'var(--gol-text-tertiary)',
  marginTop: '4px',
});

export interface DominanceFieldProps {
  value: number;
  onChange(dominance: number): void;
  /** Default to the schema's constants, never literals. */
  min?: number;
  max?: number;
}

/**
 * The Basic Information column's second control (Story 4.6, FR-2.2, UX-DR8): a 1–100 slider with
 * a synced editable numeric input, mounted directly under `<OrganismNameField>` through the
 * `basicInfo` slot fragment (`<OrganismEditorLayout>`, Story 4.4). Fully CONTROLLED, like
 * `<OrganismNameField>` — `<OrganismEditorModal>` owns the draft (RFC-005 Decision 1) and this is
 * a thin view over `draft.dominance`.
 *
 * Mockup: `organism-editor.html:390-448` (CSS), `:954-964` (markup), `:1286-1294` (the input-event
 * sync script this component reproduces in React). Design doc:
 * `organism-editor-design.md:209-250` (layout), `:529` ("Default Value: 5"), `:759-761`
 * ("Auto-correct: snap to min/max" — no error message for this field).
 *
 * Forced decisions, each recorded in the story file:
 * - FD1 — a native `<input type="range">`, not MUI `<Slider>`, following Story 3.13: MUI's Slider
 *   pulls a new module into the route (AR-35), its DOM matches no mockup locator, and under
 *   `cssVariables: true` its inactive rail is invisible with no authored override
 *   (`deferred-work.md:87`). The styled blocks are copied from `SpeedControl.tsx`, never imported.
 * - FD2 — the numeric input is `type="text" inputMode="numeric"`, not the mockup's
 *   `type="number"`: a number input's `.value` is the SANITISED value (`5.` / `abc` read as
 *   `''`), which would make "non-integers are rejected" unobservable against what the user
 *   actually typed; Playwright's `fill()` throws on non-numeric text for `type="number"`; the
 *   Basic Information column scrolls (Story 4.4 FD2) and a focused number input can consume wheel
 *   events as value changes on some engines; and Firefox lets any text into a number input and
 *   merely flags `badInput`, so the rejection would differ per engine. No `role="spinbutton"` is
 *   claimed — the slider is the keyboard-stepping control.
 * - FD3 — live in range, snap on commit, revert on invalid; the buffer is `string | null`. `null`
 *   means "not editing": the input shows `String(value)` and follows the slider with no effect
 *   syncing the two — the derivation does. An in-range integer commits ON THE KEYSTROKE (that is
 *   what "in sync both ways" means); an out-of-range integer waits for blur/Enter and then snaps;
 *   invalid text (non-integer, empty) never reaches the draft and reverts silently on commit — the
 *   design doc specifies auto-correction here, not an error message. A slider move DISCARDS the
 *   buffer: engines that do not focus a range on pointer-down (WebKit) and touch drags move the
 *   slider without blurring the textbox, and a kept buffer would show a stale number and then
 *   commit it over the slider's value on the next blur.
 * - FD4 — the draft is the only holder and is valid by construction (`clampDominance` runs before
 *   every commit): 4.13's Save gate has nothing to check for this field.
 * - FD5 — the thumb glow is the authored token `--gol-shadow-slider-thumb` (`app/themes.css`),
 *   never a `box-shadow` literal (AR-46).
 * - FD6 — the slider gets the visible `<label for>` (it is the AC's primary control); the numeric
 *   input has no visible label of its own, so `aria-label="Dominance value"` is its only name, not
 *   a second one (SC 2.5.3, Story 4.5 AC5's "no overriding name" rule) — "Dominance" is contained
 *   in it. The "1"/"100" marks are decorative and `aria-hidden` (3.13 trap 5).
 *
 * `useId()` for both ids (the slider's, which the label targets, and the description's): unlike the
 * modal's title this is not a singleton — Story 4.24's battle-origin editor is a second instance. No `transition` anywhere in this control (Story 4.5
 * FD5). Colours are `--gol-*` tokens throughout (AR-46).
 */
export default function DominanceField({
  value,
  onChange,
  min = MIN_DOMINANCE,
  max = MAX_DOMINANCE,
}: DominanceFieldProps) {
  const sliderId = useId();
  const descriptionId = useId();

  // `null` = not editing: the input shows `String(value)` and follows the slider for free. A
  // string = the user's in-progress text. No effect syncs the two — the derivation does.
  const [text, setText] = useState<string | null>(null);

  const commit = () => {
    if (text === null) return;
    const parsed = parseDominanceText(text);
    if (parsed !== null) {
      const clamped = clampDominance(parsed, min, max);
      if (clamped !== value) onChange(clamped); // snap on commit
    }
    setText(null); // invalid, or already at value → revert to following the draft
  };

  return (
    <Field>
      <Label htmlFor={sliderId}>Dominance</Label>
      <Description id={descriptionId}>
        Priority in conflict resolution ({min}-{max}, higher wins)
      </Description>
      <Row>
        <Slider
          id={sliderId}
          type="range"
          min={min}
          max={max}
          step={1}
          value={value}
          aria-describedby={descriptionId}
          onChange={(event) => {
            const next = Number(event.currentTarget.value);
            // The slider supersedes any in-progress text (FD3): without this a textbox that kept
            // focus through the move would show a stale number and commit it on its next blur.
            setText(null);
            if (next !== value) onChange(next);
          }}
        />
        <ValueInput
          type="text"
          inputMode="numeric"
          value={text ?? String(value)}
          aria-label="Dominance value"
          aria-describedby={descriptionId}
          onFocus={() => setText(String(value))}
          onChange={(event) => {
            const next = event.currentTarget.value;
            setText(next);
            const parsed = parseDominanceText(next);
            // Commit live ONLY while the typed value is already in range (FD3) — an out-of-range
            // integer waits for blur/Enter so a typed `0` does not become `1` mid-keystroke.
            if (parsed !== null && isDominanceInRange(parsed, min, max) && parsed !== value) {
              onChange(parsed);
            }
          }}
          onBlur={commit}
          onKeyDown={(event) => {
            // Enter commits WITHOUT blurring — the user may keep typing. Never `preventDefault`
            // or `stopPropagation`: Escape must still reach the Dialog's `onClose` (Story 4.23
            // inserts its guard there, not here).
            if (event.key === 'Enter') commit();
          }}
        />
      </Row>
      <Marks aria-hidden="true">
        <span>{min}</span>
        <span>{max}</span>
      </Marks>
    </Field>
  );
}
