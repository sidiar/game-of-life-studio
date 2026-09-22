'use client';

import { useId, useLayoutEffect, useRef, useState } from 'react';
import { styled } from '@mui/material/styles';
import { Fieldset, Legend, Description } from './fieldStyles';
import { PALETTE, resolvePaletteColor } from '@/lib/palette/paletteRegistry';
import { displayColor, MAX_AGE_SHADE } from '@/lib/palette/displayColor';
import { colorReuseWarning } from '@/lib/organisms/colorReuse';

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
 * library (AC6) — the field is told which tokens are in use through `usersByToken` and holds no
 * state about it. The one piece of local state is the disclosure's open/closed flag: view chrome,
 * never draft data, and it resets with the mount.
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
 * - 4.9 FD1 — two REQUIRED props, `usersByToken` and `seedValue`: required, not
 *   optional-with-default, because an optional prop is how a later picker forgets to wire them and
 *   ships one that never warns.
 * - 4.9 FD3 — the reuse warning lives in an always-mounted `role="status"` region: a live region
 *   has to exist before its content changes to be announced reliably.
 * - 4.9 FD4 — the in-use dot is a CSS pseudo-element on the swatch label with EMPTY alt text
 *   (`content: "•" / ""`), never a `title`: generated content otherwise joins the radio's
 *   accessible NAME (accname §2F.ii), exactly as an un-hidden `<span>` would.
 * - 4.9 FD5 — the warning text is `--gol-danger` on the column's own background, with NO tint:
 *   the mockup's translucent danger tint measures under the AA floor.
 * - 4.9 FD6 — the reuse status region sits AFTER the swatch grid, inside the fieldset: after the
 *   chip row it would shift the grid under a roving keyboard focus.
 *   (The unprefixed FD1/FD4/FD7 above and below are Story 4.8's.)
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
 * Consumers: Story 4.14 reads `draft.colorToken` for the preview grid; an edit session
 * (Story 4.17) seeds `value` and `seedValue` from the record, and the modal hands this field a
 * `usersByToken` built from the library MINUS the organism under edit — which is why a re-pick of
 * the record's own colour is silent by the same `seedValue` comparison.
 * `useId()` for every id — the field is not a singleton (Story 4.24's battle-origin editor is a
 * second instance, and two groups sharing a `name` would deselect each other).
 *
 * (Story 4.9) (Story 4.8) (Story 4.7) (Story 4.6) (Story 4.2) (Story 1.7) (FR-2.3) (M6) (RFC-007)
 * (AR-46) (NFR-2.1)
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
  // `.in-use::after` (`:275-286`), moved to `::before`: `::after` is already the selected glow
  // above, and a selected in-use swatch has to show both (Story 4.9, FD4). The mockup's `#fff` /
  // `rgba(0,0,0,0.9)` become `--gol-text-primary` / `--gol-bg-primary` (AR-46). Decorative — but
  // NOT outside the accessibility tree by construction: accname §2F.ii folds generated `content`
  // into a label's text alternative, and every engine does (a bare `"•"` names the radio
  // "• Sky Blue" — Story 4.9 review, measured in Chromium's own AX tree). The `/ ""` alt-text form
  // is what keeps it out of the name; where an engine lacks it the declaration drops and the dot
  // simply does not paint. The in-use fact reaches assistive tech through the FD3 status region.
  '&[data-in-use="true"]::before': {
    content: '"•" / ""',
    position: 'absolute',
    top: '-1px',
    right: '3px',
    fontSize: '13px',
    lineHeight: 1,
    color: 'var(--gol-text-primary)',
    textShadow: '0 0 3px var(--gol-bg-primary)',
    pointerEvents: 'none',
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

// `.color-reuse-warning` (`:288-297`) minus the mockup's translucent tint (FD5 — measured under
// the AA floor on this surface). `--gol-danger` for the text (the mockup's `--warning` IS
// `--gol-danger`, Story 1.13), `border-left` carries the box's identity so no new `--gol-*` token
// is needed for a surface only this one control uses. No `transition` (AR-46's neighbours already
// paid for this lesson — a scan mid-fade measures a ratio no settled state has).
const ReuseWarning = styled('p')({
  margin: '10px 0 0 0',
  padding: '8px 10px',
  fontSize: '11px',
  lineHeight: 1.4,
  color: 'var(--gol-danger)',
  borderLeft: '2px solid var(--gol-danger)',
  display: 'flex',
  gap: '6px',
  alignItems: 'flex-start',
  overflowWrap: 'anywhere',
  minWidth: 0,
});

export interface ColorPickerFieldProps {
  /** The draft's palette token. */
  value: string;
  onChange(colorToken: string): void;
  /**
   * Token -> display names of the OTHER organisms using it (`usersByColorToken`). Drives the
   * in-use dots and the reuse warning. Required, not optional-with-default: an optional prop lets
   * a later picker forget it and ship one that never warns (Story 4.9, FD1).
   */
  usersByToken: ReadonlyMap<string, readonly string[]>;
  /**
   * The token the draft opened on. The warning is never raised on it (PRD FR-2.3: the
   * system-assigned default does not itself raise it) — a token comparison, not provenance (Story
   * 4.8 AC3, Story 4.9 FD2).
   */
  seedValue: string;
}

export default function ColorPickerField({
  value,
  onChange,
  usersByToken,
  seedValue,
}: ColorPickerFieldProps) {
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

  // Story 4.9: derived per render, no memo, no effect. `warning` is null on the seed token even
  // when it collides (FD2) — a token comparison, not a "was this the default?" flag.
  const users = usersByToken.get(value) ?? [];
  const warning = value === seedValue ? null : colorReuseWarning(users);
  const inUse = (token: string) => (usersByToken.get(token)?.length ?? 0) > 0;

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
      <Description id={descriptionId}>
        {'Pick any color — colors are reusable. If another organism already uses your pick, a ' +
          "non-blocking warning appears (they'll share a color on the grid)."}
      </Description>
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
            data-in-use={inUse(entry.id)}
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
      {/* FD3/FD6: always mounted, after the grid, inside the fieldset — visible whether the
          palette is collapsed (under the chip row) or open (under the swatches a keyboard user is
          arrowing through), and it never shifts the grid under a roving focus. A plain div: the
          region carries no styles of its own, so a `styled()` wrapper would be a class for nothing. */}
      <div role="status" data-color-reuse-status>
        {warning !== null && (
          <ReuseWarning data-color-reuse-warning>
            <span aria-hidden="true">{'⚠︎'}</span> {warning}
          </ReuseWarning>
        )}
      </div>
    </Fieldset>
  );
}
