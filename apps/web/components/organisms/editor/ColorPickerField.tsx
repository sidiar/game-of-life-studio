'use client';

import { useId } from 'react';
import { styled } from '@mui/material/styles';
import { Fieldset, Legend, Description } from './fieldStyles';
import { PALETTE, resolvePaletteColor } from '@/lib/palette/paletteRegistry';
import { displayColor, MAX_AGE_SHADE } from '@/lib/palette/displayColor';

/**
 * The Basic Information column's second control (Story 4.8, FR-2.3, UX-DR7/UX-DR17): a keyboard-
 * operable colour radio group over the RFC-007 palette, with a large selected-colour display above
 * it. Mounted directly under `<OrganismNameField>` through the `basicInfo` slot fragment
 * (`<OrganismEditorLayout>`, Story 4.4) — the mockup's `name -> color -> dominance -> aging` order
 * (`organism-editor.html:919-952`), closing the 4.6 deferred item that recorded this insertion
 * point. A SECOND child in the existing fragment, never a fourth region, never a child of the
 * layout. Fully CONTROLLED, like its siblings — `<OrganismEditorModal>` owns the draft (RFC-005
 * Decision 1) and this is a thin view over `draft.colorToken`: no `useState`, no `useEffect`, no
 * repository, no library (AC6) — the field does not know which tokens are in use (Story 4.9).
 *
 * Mockup: `organism-editor.html:212-297` (CSS), `:919-952` (markup), `:1263-1285` (the collapse +
 * click script — the collapse is NOT reproduced, FD7). Design doc:
 * `organism-editor-design.md:163-206, 528, 549, 755-757, 796-798`.
 *
 * Forced decisions, each recorded in full in the story file:
 * - FD1 — a `<fieldset role="radiogroup">` named by its `<legend>` (also `aria-labelledby`, the
 *   4.7 FD2 lesson applied before it bites), wrapping native visually-hidden radios copied from
 *   `GridSettingsSection.tsx` — never MUI `<RadioGroup>` (new modules in the editor chunk, DOM
 *   matching no mockup locator, `cssVariables: true`'s unauthored derived-state tokens,
 *   `deferred-work.md:87`) and never hand-rolled `role="radio"` buttons (a native group gives
 *   arrow-key roving, wrap-around, the single tab stop and the already-checked no-op for free).
 *   `HiddenRadio`/`VisuallyHidden` are a COPY, not an import, across the mode split (Task 7 records
 *   the resulting third hand-copy as deferred work).
 * - FD4 — the glow is CSS (`currentColor` on a 30% pseudo-element); the selected swatch is an
 *   inset ring + a `✓` mark, never the mockup's accent border + raw `rgba` glow — zero new
 *   `--gol-*` token, zero colour math in `lib/palette/colorMath.ts`. Three selection channels
 *   (WCAG 1.4.1): the native `checked` state, the inset ring, and the `✓`. The large display, the
 *   selected swatch's fill and the aging strip's cap cell are all `displayColor(token,
 *   MAX_AGE_SHADE)` — the identity shade, the SAME string every one of them paints (AC4).
 * - FD6 — no in-use marking, no reuse warning, no `title` hints — Story 4.9's surface.
 * - FD7 — every swatch always visible (no "Change Color ▾" collapse), `repeat(auto-fill, 40px)`
 *   rather than the mockup's `repeat(8, 1fr)` (which yields sub-24px targets at the compressed
 *   tier, below WCAG 2.5.8).
 *
 * One name, one group: a plain fieldset (`group`) wrapping a separate `role="radiogroup"` div
 * would announce "Organism Color" twice — the fieldset itself carries the role.
 *
 * Followers: Story 4.9 adds the in-use marking and the reuse warning under the selected row;
 * Story 4.14 reads `draft.colorToken` for the preview grid; Story 4.17 seeds `value` from a
 * record. `useId()` for every id — the field is not a singleton (Story 4.24's battle-origin editor
 * is a second instance, and two groups sharing a `name` would deselect each other).
 *
 * (Story 4.8) (Story 4.7) (Story 4.6) (Story 4.2) (Story 1.7) (FR-2.3) (M6) (RFC-007) (AR-46)
 * (NFR-2.1)
 */

const SelectedRow = styled('div')({
  display: 'flex',
  alignItems: 'center',
  gap: '20px', // mockup 12px, widened so the 20px glow never reaches the name text
  marginTop: '12px',
  marginBottom: '12px',
});

// `.color-selected` (`:212-218`), the `<OrganismCard>` `ColorChip` idiom — the inline `color` IS
// the colour, so `border` and the glow's `currentColor` both read it with zero colour math.
const SelectedSwatch = styled('div')({
  width: '100px',
  height: '100px',
  flex: 'none',
  position: 'relative',
  border: '3px solid currentColor',
  '&::after': {
    content: '""',
    position: 'absolute',
    inset: 0,
    boxShadow: '0 0 20px currentColor',
    opacity: 0.3,
    pointerEvents: 'none',
  },
});

const SelectedName = styled('span')({
  fontSize: '13px',
  fontWeight: 500,
  color: 'var(--gol-text-primary)',
});

// `.color-palette` (`:246-250`) with a FIXED cell rather than the mockup's `repeat(8, 1fr)` (FD7):
// `auto-fill` follows the column's width — 5 per row at the full tier, 4 at the compressed tier,
// as many as fit at the fold — instead of a hard-coded column count that shrinks below WCAG
// 2.5.8's 24px minimum target size at the compressed tier.
const SwatchGrid = styled('div')({
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, 40px)',
  gap: '8px',
});

// `.color-swatch` (`:256-273`). NO border: the fill IS the boundary, and every palette token
// clears G1 against the dark surfaces this app paints on (SC 1.4.11 met by the palette gate, not
// by a `--gol-border` edge that measures 1.57:1).
const Swatch = styled('label')({
  width: '40px',
  height: '40px',
  position: 'relative',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  '&:hover': {
    outline: '2px solid var(--gol-text-secondary)',
    outlineOffset: '2px',
  },
  // `:focus-within`, not `:has()` — the `PresetOption` reasoning (Firefox 112 floor, NFR-2.1): the
  // focused element is the visually-hidden radio, and the ring has to land on the visible box.
  '&:focus-within': {
    outline: '2px solid var(--gol-accent)',
    outlineOffset: '2px',
  },
  // An INSET two-layer ring, separated from the fill by a 2px gap in the column's own background
  // — so it reads on every fill, including `cyan` and `sky-blue`, and never collides with the
  // outer `:focus-within` outline (FD4).
  '&[data-selected="true"]': {
    boxShadow: 'inset 0 0 0 2px var(--gol-bg-secondary), inset 0 0 0 4px var(--gol-accent)',
  },
});

// The `GridSettingsSection.tsx` copy (never imported — the mode split). Clipped at a real 1px
// rather than sized to 0x0, which some engines' focus heuristics skip. Never `display: none`,
// never `hidden` — both remove the control from the accessibility tree and the tab order, which is
// exactly the semantics this borrows the native radio for.
const HiddenRadio = styled('input')({
  position: 'absolute',
  width: '1px',
  height: '1px',
  margin: 0,
  padding: 0,
  opacity: 0,
});

// The `GridSettingsSection.tsx` copy. The radio's accessible name — the palette entry's `name`,
// never a hex, never the token id (RFC-007 Decision 3).
const VisuallyHidden = styled('span')({
  position: 'absolute',
  width: '1px',
  height: '1px',
  overflow: 'hidden',
  clipPath: 'inset(50%)',
  whiteSpace: 'nowrap',
});

// Decorative: the swatch's own `data-selected` ring and the checked radio already carry the
// state; the ink is `--gol-bg-primary` because G1 guarantees every palette token clears >= 5.12:1
// against it (`palette-cvd-validation.md:79`), above axe's 4.5:1 floor for this 16px text — on
// every current or future token that passes the palette gate.
const SelectedMark = styled('span')({
  fontSize: '16px',
  lineHeight: 1,
  color: 'var(--gol-bg-primary)',
  pointerEvents: 'none',
});

export interface ColorPickerFieldProps {
  /** The draft's palette token. */
  value: string;
  onChange(colorToken: string): void;
}

export default function ColorPickerField({ value, onChange }: ColorPickerFieldProps) {
  const legendId = useId();
  const descriptionId = useId();
  const groupName = useId();

  // Computed per render, no memo — one map lookup and one table index (AC6: a `value` outside
  // PALETTE checks no radio and degrades through `resolvePaletteColor`, Decision I.4).
  const selected = resolvePaletteColor(value);
  const color = displayColor(value, MAX_AGE_SHADE);

  return (
    <Fieldset role="radiogroup" aria-labelledby={legendId} aria-describedby={descriptionId}>
      <Legend id={legendId}>Organism Color</Legend>
      <Description id={descriptionId}>Pick any color — colors are reusable.</Description>
      <SelectedRow>
        <SelectedSwatch
          aria-hidden="true"
          data-selected-swatch={value}
          style={{ background: color, color }}
        />
        <SelectedName data-selected-name>{selected.name}</SelectedName>
      </SelectedRow>
      <SwatchGrid>
        {PALETTE.map((entry) => (
          <Swatch
            key={entry.id}
            data-color-token={entry.id}
            data-selected={entry.id === value}
            style={{ background: displayColor(entry.id, MAX_AGE_SHADE) }}
          >
            <HiddenRadio
              type="radio"
              name={groupName}
              value={entry.id}
              checked={entry.id === value}
              onChange={() => onChange(entry.id)}
            />
            {entry.id === value && <SelectedMark aria-hidden="true">✓</SelectedMark>}
            <VisuallyHidden>{entry.name}</VisuallyHidden>
          </Swatch>
        ))}
      </SwatchGrid>
    </Fieldset>
  );
}
