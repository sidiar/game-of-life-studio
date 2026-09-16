'use client';

import { useId } from 'react';
import { styled } from '@mui/material/styles';
import { Field, Label, Description } from './fieldStyles';
import { agingExampleColors } from '@/lib/organisms/agingExample';
import { MAX_AGE_SHADE } from '@/lib/palette/displayColor';

// Mockup: `.toggle-container` (`clinical-lab-theme/organism-editor.html:968-976`).
const Row = styled('div')({
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginTop: '10px',
});

// Mockup: `.toggle-label` — the mockup script's inline colour flip, reproduced as a `data-on`
// attribute (the `GridSettingsSection.tsx` data-attribute idiom) rather than inline `style`, so
// the token stays in CSS (FD3).
const StateText = styled('span')({
  fontSize: '12px',
  color: 'var(--gol-text-secondary)',
  '&[data-on]': {
    color: 'var(--gol-accent)',
  },
});

/**
 * Mockup: `.toggle-switch` and its `::before` knob (`:448-492`). A native
 * `<button type="button" role="switch" aria-checked>` (FD1) — never MUI `<Switch>`, never a
 * hidden `<input type="checkbox">`. The track is the button's own box; the knob is its `::before`.
 * On knob is `--gol-on-accent` (FD6 — NOT the mockup's `--text-primary`, which fails SC 1.4.11 at
 * 1.8:1 on `--gol-accent`). Track edge is `--gol-border-control` (NOT the mockup's decorative
 * `--border`, the same `<BattleNameField>` substitution every control boundary here makes). No
 * `transition` anywhere (Story 4.5 FD5) — an axe scan landing mid-fade measures a ratio no settled
 * state has.
 */
const Switch = styled('button')({
  position: 'relative',
  width: '50px',
  height: '26px',
  padding: 0,
  background: 'var(--gol-bg-hover)',
  border: '1px solid var(--gol-border-control)',
  borderRadius: '13px',
  cursor: 'pointer',
  flex: 'none',
  font: 'inherit',
  '&::before': {
    content: '""',
    position: 'absolute',
    width: '20px',
    height: '20px',
    top: '2px',
    left: '2px',
    borderRadius: '50%',
    background: 'var(--gol-text-tertiary)',
  },
  '&[aria-checked="true"]': {
    background: 'var(--gol-accent)',
    borderColor: 'var(--gol-accent)',
  },
  '&[aria-checked="true"]::before': {
    left: '26px',
    background: 'var(--gol-on-accent)',
  },
  '&:focus-visible': {
    outline: '2px solid var(--gol-accent)',
    outlineOffset: '2px',
  },
});

// No mockup element (FD4) — the strip is this story's own addition.
const Strip = styled('div')({
  marginTop: '10px',
});

// Mockup: `.dominance-labels` rule set, reused verbatim for the strip's own end caption.
const Marks = styled('div')({
  display: 'flex',
  justifyContent: 'space-between',
  fontSize: '11px',
  color: 'var(--gol-text-tertiary)',
  marginTop: '4px',
});

// Mockup: `.example-strip` container for the eight cells.
const Cells = styled('div')({
  display: 'flex',
  gap: '3px',
});

// Decorative edge on purpose: a pale shade on `--gol-bg-secondary` needs a visible boundary, and
// this strip is not a control (unlike `Switch`'s boundary, which SC 1.4.11 gates).
const Cell = styled('div')({
  flex: 1,
  height: '20px',
  border: '1px solid var(--gol-border)',
});

export interface AgingToggleFieldProps {
  value: boolean;
  onChange(agingEnabled: boolean): void;
  /** The draft's palette token; the example strip paints `displayColor(colorToken, …)`. */
  colorToken: string;
}

/**
 * The Basic Information column's third control (Story 4.7, FR-2.4, UX-DR9): a keyboard-operable
 * switch that turns per-organism visual aging on/off, with a live saturation-progression example
 * strip beneath it. Mounted directly under `<DominanceField>` through the `basicInfo` slot
 * fragment (`<OrganismEditorLayout>`, Story 4.4) — a third element in the existing fragment, never
 * a fourth region, never a child of the layout. Fully CONTROLLED, like its siblings —
 * `<OrganismEditorModal>` owns the draft (RFC-005 Decision 1) and this is a thin view over
 * `draft.agingEnabled` / `draft.colorToken`.
 *
 * Mockup: `organism-editor.html:448-492` (CSS), `:968-976` (markup), `:1248-1261` (the click
 * script this component reproduces in React). Design doc: `organism-editor-design.md:256-274`
 * (label, description, OFF/ON descriptions), `:530` ("Aging: OFF" for a new organism).
 *
 * Forced decisions, each recorded in the story file:
 * - FD1 — a native `<button type="button" role="switch" aria-checked>`, not MUI `<Switch>` and
 *   not a hidden checkbox: MUI's `Switch` is a new module in the editor chunk (AR-35) whose DOM
 *   matches no mockup locator, and under `cssVariables: true` a disabled MUI switch looks enabled
 *   with no authored shade token (`deferred-work.md:87`). A switch's whole contract is
 *   `aria-checked` + Space (plus Enter, APG-permitted), which a `<button>` gives natively, with the
 *   focus ring landing on the visible control via plain `:focus-visible` (no `:has()`, no
 *   `:focus-within` — Firefox 112 floor, NFR-2.1).
 * - FD2 — the name is `aria-labelledby={labelId}`, never `aria-label`: axe-core names a `<button>`
 *   by `subtreeText` only, so a switch named through `<label for>` alone is an axe `button-name`
 *   violation even though jsdom's `dom-accessibility-api` resolves it fine — "passes in unit
 *   tests, fails in axe". `htmlFor` is kept anyway so a label click activates the button (one
 *   `click`, one `onChange`); it contributes nothing to the name.
 * - FD3 — the "Off"/"On" text is `aria-hidden`: the switch's own `aria-checked` already announces
 *   the state to assistive technology, and a visible copy read too would announce it twice (3.13
 *   trap 5). Sighted users still get three channels — knob position, text, accent fill — so
 *   WCAG 1.4.1 is met without the text in the tree. The colour flip is a `data-on` attribute, never
 *   inline `style` (the token stays in CSS).
 * - FD4 — the strip is a live `ageShadeFor` preview, not a static illustration: it always renders
 *   eight cells, but each cell's colour is derived through `agingExampleColors(colorToken, value)`
 *   — flat (the identity colour) when Off, the FR-5.7 ramp when On — so flipping the switch is what
 *   makes the ramp appear. This reconciles `epics.md:1074`'s "shows the strip … when rendered" with
 *   `organism-editor-design.md:271`'s "when ON" reading; flagged for the owner in
 *   `deferred-work.md` as a one-line reversal if a permanent ramp is wanted instead. `aria-hidden`:
 *   its information is already carried by the description sentence and the switch state.
 * - FD5 — no `transition` anywhere (Story 4.5 FD5, carried over).
 * - FD6 — `--gol-on-accent` for the On knob (not the mockup's `--text-primary`, which fails SC
 *   1.4.11), `--gol-border-control` for the track edge (not the mockup's decorative `--border`),
 *   no new token.
 * - FD7 — `Field`/`Label`/`Description` come from `fieldStyles.ts` (born in this story) rather
 *   than a third hand copy.
 *
 * Followers: Story 6.6, Story 6.7 and Story 6.10's Settings toggle rows are the next native
 * switches — copy the `Switch`/`StateText` blocks there (across the route split, never import),
 * the way Story 4.6 copied Story 3.13's slider.
 *
 * `useId()` for all three ids (`labelId`, `switchId`, `descriptionId`) — the field is not a
 * singleton (Story 4.24's battle-origin editor is a second instance). Colours are `--gol-*` tokens
 * throughout (AR-46). (Story 4.7) (Story 4.6) (Story 4.5) (Story 3.9) (FR-2.4) (FR-5.7)
 * (Decision B) (AR-46)
 */
export default function AgingToggleField({ value, onChange, colorToken }: AgingToggleFieldProps) {
  const labelId = useId();
  const switchId = useId();
  const descriptionId = useId();

  // Eight table lookups per render — no `useMemo`, which would cost more than it saves here.
  const colors = agingExampleColors(colorToken, value);

  return (
    <Field>
      <Label id={labelId} htmlFor={switchId}>
        Aging Degradation
      </Label>
      <Description id={descriptionId}>Cells increase saturation as they age</Description>
      <Row>
        <StateText aria-hidden="true" data-on={value ? 'true' : undefined}>
          {value ? 'On' : 'Off'}
        </StateText>
        <Switch
          id={switchId}
          type="button"
          role="switch"
          aria-checked={value}
          aria-labelledby={labelId}
          aria-describedby={descriptionId}
          onClick={() => onChange(!value)}
        />
      </Row>
      <Strip aria-hidden="true" data-aging-example>
        <Cells>
          {colors.map((color, age) => (
            <Cell key={age} data-age={age} style={{ backgroundColor: color }} />
          ))}
        </Cells>
        <Marks>
          <span>Age 0</span>
          <span>Age {MAX_AGE_SHADE}</span>
        </Marks>
      </Strip>
    </Field>
  );
}
