'use client';

import { useId, useLayoutEffect, useRef, useState } from 'react';
import { styled } from '@mui/material/styles';
import { Fieldset, Legend, Description } from './fieldStyles';
import { PALETTE, resolvePaletteColor } from '@/lib/palette/paletteRegistry';
import { displayColor, MAX_AGE_SHADE } from '@/lib/palette/displayColor';

/**
 * The Basic Information column's second control (Story 4.8, FR-2.3, UX-DR7/UX-DR17): a selected-
 * colour chip beside a "Change Color ▾" disclosure button, which opens a keyboard-operable colour
 * radio group over the RFC-007 palette. Mounted directly under `<OrganismNameField>` through the
 * `basicInfo` slot fragment (`<OrganismEditorLayout>`, Story 4.4) — the mockup's
 * `name -> color -> dominance -> aging` order (`organism-editor.html:919-952`), closing the 4.6
 * deferred item that recorded this insertion point. A SECOND child in the existing fragment, never
 * a fourth region, never a child of the layout. The DRAFT is fully controlled, like its siblings —
 * `<OrganismEditorModal>` owns it (RFC-005 Decision 1) and this is a thin view over
 * `draft.colorToken`: no draft state here, no effect that touches the draft, no repository, no
 * library (AC6) — the field does not know which tokens are in use (Story 4.9). The one piece of
 * local state is the disclosure's open/closed flag: view chrome, never draft data, and it resets
 * with the mount.
 *
 * Mockup: `organism-editor.html:212-297` (CSS), `:919-952` (markup), `:1263-1285` (the collapse +
 * click script). Design doc: `organism-editor-design.md:163-206, 528, 549, 755-757, 796-798` —
 * where the two disagree (the doc's 100×100 display and always-open grid predate the mockup's
 * 44×44 chip and collapse) the mockup wins (Sidiar, 2026-09-16; FD7).
 *
 * Forced decisions, each recorded in full in the story file:
 * - FD1 — a `<fieldset>` named by its `<legend>` (also `aria-labelledby`, the 4.7 FD2 lesson
 *   applied before it bites) wrapping the chip row and a `role="radiogroup"` grid of native
 *   visually-hidden radios copied from `GridSettingsSection.tsx` — never MUI `<RadioGroup>` (new
 *   modules in the editor chunk, DOM matching no mockup locator, `cssVariables: true`'s
 *   unauthored derived-state tokens, `deferred-work.md:87`) and never hand-rolled `role="radio"`
 *   buttons (a native group gives arrow-key roving, wrap-around, the single tab stop and the
 *   already-checked no-op for free). `HiddenRadio`/`VisuallyHidden` are a COPY, not an import,
 *   across the mode split (Task 7 records the resulting third hand-copy as deferred work).
 * - FD4 — the glows are CSS (`currentColor` / `--gol-accent` on a low-opacity pseudo-element) —
 *   zero new `--gol-*` token, zero colour math in `lib/palette/colorMath.ts`. Three selection
 *   channels (WCAG 1.4.1): the native `checked` state, the accent border, and the `✓`. The chip,
 *   the selected swatch's fill and the aging strip's cap cell are all `displayColor(token,
 *   MAX_AGE_SHADE)` — the identity shade, the SAME string every one of them paints (AC4).
 * - FD6 — no in-use marking, no reuse warning, no `title` hints — Story 4.9's surface.
 * - FD7 — the mockup's disclosure: the grid is `display: none` until "Change Color ▾" opens it, and
 *   a POINTER pick collapses it again with focus handed to the button (the mockup's script
 *   `:1280-1283`). A keyboard pick (arrow keys, Space) leaves it open — collapsing under a roving
 *   focus would drop the user on `<body>` between every arrow press. The grid is the mockup's
 *   `repeat(8, 1fr)` (~27px cells in the 270px column; 24px+ spacing between centres satisfies
 *   WCAG 2.5.8 through its spacing exception at every tier).
 *
 * The fieldset is the GROUP ("Organism Color"); the grid, not the fieldset, is the radiogroup —
 * with the grid hidden most of the time a fieldset-as-radiogroup would announce an empty radio
 * group. Both point at the same legend, so the radiogroup is found by the same name once it
 * exists. The chip's name is plain text, NOT a live region: the radio change already announces
 * the new name, and a live region would read it a second time (the Story 3.13 trap).
 *
 * Followers: Story 4.9 adds the in-use marking and the reuse warning under the chip row; Story
 * 4.14 reads `draft.colorToken` for the preview grid; Story 4.17 seeds `value` from a record.
 * `useId()` for every id — the field is not a singleton (Story 4.24's battle-origin editor is a
 * second instance, and two groups sharing a `name` would deselect each other).
 *
 * (Story 4.8) (Story 4.7) (Story 4.6) (Story 4.2) (Story 1.7) (FR-2.3) (M6) (RFC-007) (AR-46)
 * (NFR-2.1)
 */

// `.color-selected-row` (`:220-225`).
const SelectedRow = styled('div')({
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
  marginTop: '12px',
  marginBottom: '12px',
});

// `.color-selected` (`:212-218`), the `<OrganismCard>` `ColorChip` idiom — the inline `color` IS
// the colour, so `border` and the glow's `currentColor` both read it with zero colour math. The
// mockup's `0 0 15px rgba(<colour>, 0.3)` is a pseudo-element at 0.3 opacity for the same reason.
const SelectedSwatch = styled('div')({
  width: '44px',
  height: '44px',
  flex: 'none',
  position: 'relative',
  border: '3px solid currentColor',
  '&::after': {
    content: '""',
    position: 'absolute',
    inset: 0,
    boxShadow: '0 0 15px currentColor',
    opacity: 0.3,
    pointerEvents: 'none',
  },
});

const SelectedName = styled('span')({
  fontSize: '13px',
  fontWeight: 500,
  color: 'var(--gol-text-primary)',
  minWidth: 0,
});

// `.color-toggle` (`:227-244`) — the `<OrganismEditorModal>` `BackButton` rule set at the mockup's
// `8px 14px`, with the control boundary on `--gol-border-control` (the mockup's `--border` on a
// control is the themes.css departure #2). The DOM text is sentence case and CSS uppercases it,
// so the accessible name stays "Change Color" while the mockup's "CHANGE COLOR" is what renders;
// the caret is presentational.
const ToggleButton = styled('button')({
  marginLeft: 'auto',
  flex: 'none',
  background: 'transparent',
  border: '1px solid var(--gol-border-control)',
  color: 'var(--gol-text-secondary)',
  padding: '8px 14px',
  fontSize: '11px',
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
  cursor: 'pointer',
  fontFamily: 'inherit',
  '&:hover': {
    borderColor: 'var(--gol-accent)',
    color: 'var(--gol-accent)',
  },
  '&:focus-visible': {
    outline: '2px solid var(--gol-accent)',
    outlineOffset: '2px',
  },
});

// `.color-palette` (`:246-254`). `display: none` when collapsed, exactly the mockup: the radios
// leave the tab order and the accessibility tree with it, and the button is the way in.
const SwatchGrid = styled('div')({
  display: 'grid',
  gridTemplateColumns: 'repeat(8, 1fr)',
  gap: '8px',
  '&[hidden]': {
    display: 'none',
  },
});

// `.color-swatch` (`:256-273`): a square cell that follows the column's width, the control
// boundary on `--gol-border-control`, the accent border on hover and when selected.
const Swatch = styled('label')({
  aspectRatio: '1',
  minWidth: 0,
  position: 'relative',
  boxSizing: 'border-box',
  border: '2px solid var(--gol-border-control)',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  transition: 'border-color 0.2s, transform 0.2s',
  '&:hover': {
    borderColor: 'var(--gol-accent)',
    transform: 'scale(1.05)',
  },
  // `:focus-within`, not `:has()` — the `PresetOption` reasoning (Firefox 112 floor, NFR-2.1): the
  // focused element is the visually-hidden radio, and the ring has to land on the visible box.
  '&:focus-within': {
    outline: '2px solid var(--gol-accent)',
    outlineOffset: '2px',
  },
  // The mockup's `.selected`: accent border + a soft accent glow (a pseudo-element at 0.4 opacity
  // stands in for its `rgba(0, 212, 255, 0.4)` — no second accent token, FD4).
  '&[data-selected="true"]': {
    borderColor: 'var(--gol-accent)',
    '&::after': {
      content: '""',
      position: 'absolute',
      inset: '-2px',
      boxShadow: '0 0 12px var(--gol-accent)',
      opacity: 0.4,
      pointerEvents: 'none',
    },
  },
  '@media (prefers-reduced-motion: reduce)': {
    transition: 'none',
    '&:hover': { transform: 'none' },
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

// Decorative: the swatch's own `data-selected` border and the checked radio already carry the
// state; the ink is `--gol-bg-primary` because G1 guarantees every palette token clears >= 5.12:1
// against it (`palette-cvd-validation.md:79`), above axe's 4.5:1 floor for this text — on every
// current or future token that passes the palette gate.
const SelectedMark = styled('span')({
  fontSize: '14px',
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
  const paletteId = useId();
  const [expanded, setExpanded] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const focusToggleOnCollapse = useRef(false);

  // Computed per render, no memo — one map lookup and one table index (AC6: a `value` outside
  // PALETTE checks no radio and degrades through `resolvePaletteColor`, Decision I.4).
  const selected = resolvePaletteColor(value);
  const color = displayColor(value, MAX_AGE_SHADE);

  // FD7: a pointer pick closes the palette (`detail` counts the clicks; a keyboard-synthesised
  // click on a radio — Space, an arrow key — carries 0).
  const collapseAfterPointerPick = (event: React.MouseEvent<HTMLLabelElement>) => {
    if (event.detail === 0) return;
    focusToggleOnCollapse.current = true;
    setExpanded(false);
  };

  // Focus lands on the button in the same commit that hides the grid — a layout effect, so the
  // browser never paints a frame with focus on `<body>`, and after the DOM update, so the label
  // activation's own focus-the-radio step (Chromium, Gecko) finds the radio unrenderable and
  // leaves the button focused. View chrome only; the draft is untouched.
  useLayoutEffect(() => {
    if (expanded || !focusToggleOnCollapse.current) return;
    focusToggleOnCollapse.current = false;
    toggleRef.current?.focus();
  }, [expanded]);

  return (
    <Fieldset aria-labelledby={legendId}>
      <Legend id={legendId}>Organism Color</Legend>
      <Description id={descriptionId}>Pick any color — colors are reusable.</Description>
      <SelectedRow>
        <SelectedSwatch
          aria-hidden="true"
          data-selected-swatch={value}
          style={{ background: color, color }}
        />
        <SelectedName data-selected-name>{selected.name}</SelectedName>
        <ToggleButton
          ref={toggleRef}
          type="button"
          aria-expanded={expanded}
          aria-controls={paletteId}
          onClick={() => setExpanded((open) => !open)}
        >
          Change Color <span aria-hidden="true">{expanded ? '▴' : '▾'}</span>
        </ToggleButton>
      </SelectedRow>
      <SwatchGrid
        id={paletteId}
        role="radiogroup"
        aria-labelledby={legendId}
        aria-describedby={descriptionId}
        hidden={!expanded}
      >
        {PALETTE.map((entry) => (
          <Swatch
            key={entry.id}
            data-color-token={entry.id}
            data-selected={entry.id === value}
            style={{ background: displayColor(entry.id, MAX_AGE_SHADE) }}
            onClick={collapseAfterPointerPick}
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
