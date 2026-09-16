import { styled } from '@mui/material/styles';

/**
 * Shared chrome for the Basic Information column's fields (Story 4.7, FD7 — the Story 4.6 review's
 * pointer at this exact story: "a third editor field (4.7's toggle, 4.8's picker)" is the
 * three-callers threshold this repo uses before an abstraction is born, the same threshold Story
 * 4.5 FD6 records). Rule sets moved here byte-identical from `DominanceField.tsx` — nothing visual
 * changes, and the proof is that `OrganismNameField.test.tsx` and `DominanceField.test.tsx` run
 * unedited (the 4.5/4.6 tests that ARE edited in Story 4.7 are retargeted for the new control's
 * count and tab hop, not for this move). Stays inside
 * `components/organisms/editor/` — a sibling module, not a cross-mode primitive (`project-context.md`'s
 * "components split by mode" rule).
 *
 * Story 4.8 adds `Fieldset` / `Legend`: the UA fieldset-chrome reset and the label rule set for a
 * GROUPED control's name, so `<ColorPickerField>` (the first caller) does not hand-roll either.
 * `labelRules` is the one place the label typography lives — `Label` and `Legend` both read it.
 */

// Mockup: `.form-field` (`clinical-lab-theme/organism-editor.html:153-156`; markup `:912-916`,
// `:954-964`, `:968-976`). Same rule set across every Basic Information field, so the column's
// vertical rhythm matches.
export const Field = styled('div')({
  margin: '0 0 20px 0',
});

// Mockup: `.field-label`, minus its 20px top margin — the column description above already
// carries 20px, and the field is the first thing after it (the Story 4.5 note). 13px / 500 /
// text-primary / margin 0 0 8px 0 — identical across every field's label.
const labelRules = {
  display: 'block',
  fontSize: '13px',
  fontWeight: 500,
  color: 'var(--gol-text-primary)',
  margin: '0 0 8px 0',
} as const;

export const Label = styled('label')(labelRules);

// A grouped control's `Field`: the UA's fieldset chrome reset (border, padding, and the
// `min-inline-size: min-content` default that stops a fieldset shrinking inside a flex column),
// then exactly `Field`'s rhythm. `<ColorPickerField>` is the first caller; a rule group (Story
// 4.11's condition rows) is the next candidate.
export const Fieldset = styled('fieldset')({
  border: 0,
  padding: 0,
  minWidth: 0,
  margin: '0 0 20px 0',
});

// `Label`'s rules on the element that names a fieldset. `padding: 0` because legends carry a UA
// inline padding `Label` never had.
export const Legend = styled('legend')({ ...labelRules, padding: 0 });

// Mockup: `.field-description` (`organism-editor.html:165-170`). `--gol-text-tertiary` is the
// token themes.css raised to clear 4.5:1 for small text on `--gol-bg-secondary` (AR-46, the gated
// pair `themeTokens.test.ts` already covers).
export const Description = styled('p')({
  fontSize: '11px',
  color: 'var(--gol-text-tertiary)',
  margin: '4px 0 0 0',
  lineHeight: 1.4,
});
