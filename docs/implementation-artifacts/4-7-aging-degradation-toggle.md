---
baseline_commit: ba8b4f7
---

# Story 4.7: Aging Degradation Toggle

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a user,
I want to toggle visual aging per organism,
so that I can choose whether my organism fades in with age.

## Acceptance Criteria

From `epics.md#Story 4.7: Aging Degradation Toggle` (`:1066-1076`), decomposed into what a reviewer
can check independently. AC5–AC9 are repo-derived: the obligations the shipped shell (Story 4.3),
the layout's slot contract (Story 4.4), the draft seam (Story 4.5 / Story 4.6), the engine's own
"never reads `agingEnabled`" pin (Story 3.6) and the CI gates already impose on "the third control
inside the editor".

1. **The Basic Information column renders an Aging Degradation control directly under the
   dominance control: a visible label "Aging Degradation", the description "Cells increase
   saturation as they age", and a row holding the state text ("Off" / "On") on the left and a
   pill switch on the right.** `<AgingToggleField>` (new, `components/organisms/editor/`) mounts
   through `<OrganismEditorLayout basicInfo={…}>` after `<DominanceField>` — a third element in the
   existing fragment, never a fourth region, never a child of the layout. Mockup
   `organism-editor.html:448-492` (CSS) and `:968-976` (markup), script `:1248-1261`; design doc
   `organism-editor-design.md:256-274`. The mockup places Color between Name and Dominance —
   Story 4.8 inserts the picker there; this story renders name → dominance → aging. (FR-2.4,
   UX-DR9)

2. **The switch is a real switch, keyboard-operable, correctly named and described.** A native
   `<button type="button" role="switch" aria-checked={value}>` (FD1) — `getByRole('switch', {
   name: 'Aging Degradation' })` resolves; the name comes from `aria-labelledby` pointing at the
   visible `<label>`, whose `htmlFor` also targets the button so a label click toggles it (FD2). No
   `aria-label`. `aria-describedby` points at the description paragraph. Space and Enter toggle
   it (native button activation); Arrow keys do nothing. Tab order inside Basic Information is
   name → slider → dominance textbox → switch. The "Off" / "On" text is `aria-hidden` — the
   switch's own `aria-checked` already announces the state, and a visible copy would be read
   twice (FD3, Story 3.13 trap 5). (UX-DR17)

3. **A new organism opens with the switch Off, and the draft is the single holder of the
   value.** `OrganismDraft` becomes `Pick<Organism, 'name' | 'dominance' | 'agingEnabled' |
   'colorToken'>`; `createNewOrganismDraft()` returns `{ name: '', dominance:
   NEW_ORGANISM_DOMINANCE, agingEnabled: false, colorToken: DEFAULT_COLOR_TOKEN }` (FD5).
   `<OrganismEditorModal>` passes `value={draft.agingEnabled}` / `onChange={setAgingEnabled}` (a
   functional `setDraft` update, the `setDominance` shape) and `colorToken={draft.colorToken}`.
   `OrganismEditorModalProps` is **unchanged**; `useOrganismEditorModal.ts` is untouched. A fresh
   draft per open is still the `mounted` gate's doing — no reset effect, no `key`. (RFC-005
   Decision 1, design doc `:530` "Aging: OFF")

4. **The saturation-progression example strip renders under the switch, eight cells for ages
   0 → 7, painted through the display-colour LUT from the draft's current colour token — and it
   is a live preview of what the toggle does.** Cell *i* is
   `displayColor(colorToken, ageShadeFor(i, agingEnabled))` (FD4, via the pure
   `agingExampleColors(colorToken, agingEnabled)` helper in `lib/organisms/agingExample.ts`): with
   the switch **On** the strip is the FR-5.7 ramp (pale at age 0 → the token's identity colour at
   age 7); with the switch **Off** all eight cells are the identity colour — exactly how the
   renderer would paint that organism (`refToFillGroup.ts` / Story 3.9 go through the same
   `ageShadeFor`). The strip is `aria-hidden` (its meaning is already carried in text by the
   description and the switch state), carries `data-aging-example` on the container and
   `data-age="0"…"7"` on the cells, and the cell colour is an inline `style` (the `<OrganismCard>`
   AR-46 precedent for organism colour — never a `--gol-*` token, never a styled prop). Changing
   `colorToken` re-derives every cell — Story 4.8's "selecting a swatch updates the aging example
   strip immediately" is satisfied by this prop and nothing else. (FR-2.4, FR-5.7, UX-DR9,
   RFC-007)

5. **The toggle is visual-only, and this story proves it by touching nothing that runs a cycle
   or paints a cell.** No file under `packages/simulation`, `apps/web/lib/canvas` or
   `apps/web/lib/palette` changes. The existing pins stand as the AC's evidence:
   `threePhaseStep.test.ts:140-144` ("carries no agingEnabled for the engine to branch on" — the
   roster entry's exact key set is `['dominance']`), `conflictPhase.ts:155` (age advances
   regardless of the flag) and `displayColor.test.ts:62-66` (a non-aging organism resolves to the
   age-cap shade). The field's only read of the flag is `ageShadeFor`, and flipping the switch
   writes `agingEnabled` and nothing else on the draft. (FR-2.4, Decision B)

6. **The toggle state round-trips through the editor's draft; the persisted field already
   exists.** `OrganismSchema.agingEnabled: z.boolean()` has been in `@gol/domain` since Story 1.3
   and is not touched. In this story the round trip is draft-level: a click reaches
   `draft.agingEnabled` and the switch, the state text and the strip all re-render from it on the
   same commit; an exit discards it (the library's real-`mounted`-gate test). Persisting it is
   Story 4.16's (Save stays `disabled`); seeding it from a stored organism is Story 4.17's. Say so
   in the Dev Agent Record rather than claiming the persisted half here. (FR-2.4)

7. **axe passes with the control in place, in jsdom and in the served app, in both states.**
   vitest-axe on `<AgingToggleField>` Off and On (`unmount` between scans) → `[]`; on
   `<OrganismEditorModal open origin="library">` → `[]`; `@axe-core/playwright` on `/organisms`
   with the dialog open and the switch On → `[]`. Colours are `--gol-*` tokens throughout; every
   text/background pair the control uses is an already-gated `themeTokens.test.ts` row; the On
   knob is `--gol-on-accent` on `--gol-accent`, not the mockup's `--text-primary` (FD6); no
   `transition` anywhere in the control (Story 4.5 FD5). (AR-46, UX-DR17)

8. **Every existing guard is retargeted, never loosened, and the shared field chrome is
   extracted rather than copied a third time.** `OrganismEditorModal.test.tsx`'s "exactly two
   textboxes and one slider" becomes "exactly two textboxes, one slider and **one switch**, all
   inside Basic Information"; its tab-order test grows one `user.tab()` to the switch;
   `OrganismLibrary.test.tsx`'s reopen test grows a switch click before the exit and asserts
   unchecked after. `Field` / `Label` / `Description` move to
   `components/organisms/editor/fieldStyles.ts` (FD7 — the Story 4.6 review's pointer at this
   exact story) and `OrganismNameField.tsx` / `DominanceField.tsx` import them; **no test of
   4.3/4.4/4.5/4.6 is edited for that refactor** (jsdom asserts no styles — if one goes red, the
   rule set drifted). `OrganismEditorLayout.test.tsx` and `useOrganismEditorModal.test.tsx` are
   **not edited**; the six earlier e2e blocks in `organisms.spec.ts` stay verbatim. (AR-44)

9. **The bundle gate passes and `/organisms`'s first load does not move.** `npm run
   build:standalone` + `node scripts/check-bundle-size.mjs` before (on `main`, `ba8b4f7`) and
   after, all four routes recorded both times. The field, the helper and `fieldStyles.ts` are
   imported **only from files already inside the lazy editor chunk** (4216 B gzip after 4.6);
   `displayColor` / `paletteRegistry` are already in `/organisms`'s first load through
   `<OrganismCard>`, so the strip adds no module to the route. `/organisms` (budget 305, baseline
   **295.3 KB**) stays within ±0.5 KB noise; a move of ≳ +1 KB means a new module was imported
   from `OrganismLibrary.tsx`, `useOrganismEditorModal.ts` or another first-load file — a
   finding, not a number to nudge. **No budget is raised.** `npm run ci > ci.log 2>&1; echo $?`
   green locally (exit code to a file, never piped) and CI on the pushed branch checked with
   `gh run list --limit 1`, not inferred.

## Tasks / Subtasks

- [x] **Task 1 — The draft grows `agingEnabled` and `colorToken`** (AC: 3)
  - [x] `apps/web/lib/organisms/organismDraft.ts`: `OrganismDraft = Pick<Organism, 'name' |
        'dominance' | 'agingEnabled' | 'colorToken'>`; `createNewOrganismDraft()` returns `{ name:
        '', dominance: NEW_ORGANISM_DOMINANCE, agingEnabled: false, colorToken:
        DEFAULT_COLOR_TOKEN }` — `DEFAULT_COLOR_TOKEN` from `@/lib/palette/paletteRegistry`
        (the `displayOrganisms.ts` import shape). Doc block: `agingEnabled` seeds `false` per the
        design doc's "Aging: OFF" (`organism-editor-design.md:530`) — a boolean has no range to
        single-source, so no `NEW_ORGANISM_AGING_ENABLED` constant (it would be a name for
        `false`); it happens to equal `CONWAYS_CLASSIC.agingEnabled`, which is a coincidence, not
        a derivation. `colorToken` seeds at `DEFAULT_COLOR_TOKEN` **as a stopgap the strip needs
        today**: Story 4.8 replaces this seed with the M6 next-unused / least-used derivation (which
        needs the library's tokens — 4.8 decides whether the factory takes an argument or the modal
        derives it); nothing else may read the seed's VALUE as meaningful. Update the "grows one
        field per story" list: 4.6 and 4.7 done, 4.8 changes the `colorToken` seed and adds the
        picker, 4.10 adds `survivalRules`.
  - [x] `organismDraft.test.ts`: the seed test becomes `toEqual({ name: '', dominance:
        NEW_ORGANISM_DOMINANCE, agingEnabled: false, colorToken: DEFAULT_COLOR_TOKEN })` (derived —
        import the token, never re-type `'sky-blue'`); keep "distinct object per call".

- [x] **Task 2 — The example strip's colours, pure** (AC: 4)
  - [x] `apps/web/lib/organisms/agingExample.ts` (no React, no DOM):
        ```ts
        import { ageShadeFor, displayColor, MAX_AGE_SHADE } from '@/lib/palette/displayColor';
        /** One canvas colour string per age 0..MAX_AGE_SHADE, exactly as the renderer would paint
         *  a cell of that age for this organism: `displayColor(token, ageShadeFor(age, agingEnabled))`.
         *  Off → every entry is the identity colour (Decision B.2: a non-aging organism keys as
         *  `(token, 7)`); On → the FR-5.7 ramp. Length is `MAX_AGE_SHADE + 1`, never a literal 8. */
        export function agingExampleColors(colorToken: string, agingEnabled: boolean): readonly string[]
        ```
        Header comment: why it goes through `ageShadeFor` and not `agingEnabled ? age : 7` (the
        `displayColor.ts` doc says the intuitive form is the spec violation); why it is a `lib`
        module (the strip's colours are a derivation with an exact unit test, the `dominance.ts`
        placement).
  - [x] `agingExample.test.ts`: (1) length is `MAX_AGE_SHADE + 1`; (2) Off → every entry
        `===` `displayColor(token, MAX_AGE_SHADE)`; (3) On → entry *i* `===`
        `displayColor(token, i)` for every *i*, entries 0 and `MAX_AGE_SHADE` differ, entry
        `MAX_AGE_SHADE` equals the Off value (the identity colour is the same in both states);
        (4) two different known tokens give different arrays. Use known tokens only
        (`DEFAULT_COLOR_TOKEN`, and a second from `PALETTE[1].id`) — an unknown token would trip
        `paletteIndexOf`'s warn-once, which is Story 1.7's contract, not this helper's.

- [x] **Task 3 — Extract the field chrome** (AC: 8) (FD7)
  - [x] `apps/web/components/organisms/editor/fieldStyles.ts`: move `Field` (`margin: '0 0 20px
        0'`), `Label` (13px / 500 / `--gol-text-primary` / `margin 0 0 8px 0`, `display: block`)
        and `Description` (11px / `--gol-text-tertiary` / `margin 4px 0 0 0` / `lineHeight 1.4`)
        here, **rule sets byte-identical** to `DominanceField.tsx:11-34`, comments moved with them
        (mockup `.form-field` / `.field-label` / `.field-description`, the 4.5 note about the
        label's dropped 20px top margin, the `--gol-text-tertiary` contrast note). Named exports;
        `.ts` not `.tsx` (no JSX — `styled('div')({…})` only); camelCase file name.
  - [x] `OrganismNameField.tsx` and `DominanceField.tsx`: delete the local `Field` / `Label` (and
        `Description`) and `import { Field, Label, Description } from './fieldStyles'`. The
        "COPY of `<OrganismNameField>`'s `Label`" comment in `DominanceField.tsx:15-17` goes — it
        describes the copy this task removes. Nothing else in either file changes; their tests
        run unedited and stay green.
  - [x] `deferred-work.md:1079-` (the 4.6 review section): strike the "`Field` / `Label` /
        `Slider` styled blocks now exist in three hand copies" item's `Field`/`Label` half as
        `✅ Resolved in Story 4.7 (fieldStyles.ts)`; the `Slider` half stays open (it is 3.16's
        `<RangeSlider>` question, and `SpeedControl.tsx` is across the mode split).

- [x] **Task 4 — `<AgingToggleField>`** (AC: 1, 2, 4, 5, 7)
  - [x] `apps/web/components/organisms/editor/AgingToggleField.tsx` — `'use client'`; `styled`
        from `@mui/material/styles` only; `useId` from React; `Field`, `Label`, `Description` from
        `./fieldStyles`; `agingExampleColors` from `@/lib/organisms/agingExample`; `MAX_AGE_SHADE`
        from `@/lib/palette/displayColor` (for the caption). ❌ No `@mui/material/Switch`, no
        `FormControlLabel` (FD1). ❌ No hidden `<input type="checkbox">` (FD1). ❌ No `<form>`.
        ❌ Nothing imported from `components/battle/**`. Props:
        ```ts
        export interface AgingToggleFieldProps {
          value: boolean;
          onChange(agingEnabled: boolean): void;
          /** The draft's palette token; the example strip paints `displayColor(colorToken, …)`. */
          colorToken: string;
        }
        ```
  - [x] Structure and styles (mockup `organism-editor.html:448-492, 968-976`, values verbatim
        unless noted; every colour a `--gol-*` token — AR-46; no `transition` anywhere):
        ```
        <Field>
          <Label id={labelId} htmlFor={switchId}>Aging Degradation</Label>
          <Description id={descriptionId}>Cells increase saturation as they age</Description>
          <Row>                                  div — `.toggle-container`: display flex;
                                                 justify-content space-between; align-items center;
                                                 margin-top 10px
            <StateText aria-hidden="true" data-on={value ? 'true' : undefined}>{value ? 'On' : 'Off'}</StateText>
                                                 span — `.toggle-label`: font-size 12px; color
                                                 var(--gol-text-secondary); '&[data-on]': color
                                                 var(--gol-accent) (the mockup script's inline
                                                 colour flip, as a data attribute)
            <Switch id={switchId} type="button" role="switch" aria-checked={value}
                    aria-labelledby={labelId} aria-describedby={descriptionId}
                    onClick={() => onChange(!value)} />
                                                 button — `.toggle-switch`: position relative;
                                                 width 50px; height 26px; padding 0; background
                                                 var(--gol-bg-hover); border 1px solid
                                                 var(--gol-border-control) (NOT the mockup's
                                                 decorative --border — SC 1.4.11, the settled
                                                 substitution); border-radius 13px (the mockup's
                                                 pill — the settings mockup's own note calls it out,
                                                 so this is one of the few rounded things in
                                                 Clinical Lab); cursor pointer; flex none;
                                                 font: inherit.
                                                 '&::before' (the knob): content '""'; position
                                                 absolute; width 20px; height 20px; top 2px; left
                                                 2px; border-radius 50%; background
                                                 var(--gol-text-tertiary).
                                                 '&[aria-checked="true"]': background
                                                 var(--gol-accent); border-color var(--gol-accent).
                                                 '&[aria-checked="true"]::before': left 26px;
                                                 background var(--gol-on-accent) (FD6 — NOT the
                                                 mockup's --text-primary).
                                                 '&:focus-visible': outline 2px solid
                                                 var(--gol-accent); outline-offset 2px.
          </Row>
          <Strip aria-hidden="true" data-aging-example>
                                                 div — margin-top 10px (no mockup element; FD4)
            <Cells>                              div — display flex; gap 3px
              {colors.map((color, age) => <Cell key={age} data-age={age} style={{ backgroundColor: color }} />)}
                                                 div — flex 1; height 20px; border 1px solid
                                                 var(--gol-border) (the decorative border, on
                                                 purpose: a pale shade on --gol-bg-secondary needs
                                                 an edge, and this strip is not a control)
            </Cells>
            <Marks><span>Age 0</span><span>Age {MAX_AGE_SHADE}</span></Marks>
                                                 div — `.dominance-labels` rule set: display flex;
                                                 justify-content space-between; font-size 11px;
                                                 color var(--gol-text-tertiary); margin-top 4px
          </Strip>
        </Field>
        ```
        `const colors = agingExampleColors(colorToken, value)` — computed per render, no memo
        (eight table lookups; a `useMemo` would cost more than it saves). The `Marks` block is a
        copy of `DominanceField`'s — leave it a copy; two callers of a two-line rule set is not the
        third-copy threshold FD7 acts on.
  - [x] Header comment: mockup refs (`:448-492, 968-976, 1248-1261`), design-doc refs
        (`:256-274, 530`), FD1–FD7 one sentence each, the axe `button-name` fact behind FD2, the
        "strip is a live preview" reading and where it is flagged (FD4). Cite `(Story 4.7)`,
        `(Story 4.6)`, `(Story 4.5)`, `(Story 3.9)`, `(FR-2.4)`, `(FR-5.7)`, `(Decision B)`,
        `(AR-46)` exactly as `spec:check` tokenises them. Name the followers: Story 6.6, Story 6.7
        and Story 6.10's Settings toggle rows are the next native switches — copy the `Switch` /
        `StateText` blocks there (across the route split, never import), the way 4.6 copied 3.13's
        slider. `useId()` for all three ids (`labelId`, `switchId`, `descriptionId`) — the field is
        not a singleton (Story 4.24's battle-origin editor is a second instance).
  - [x] `AgingToggleField.test.tsx` — a `ControlledHarness` (real `useState` round trip, the
        `DominanceField.test.tsx:9-27` shape, `colorToken` defaulting to `DEFAULT_COLOR_TOKEN`)
        plus a `vi.fn()` variant where call counts matter. Cases, each guarding a named failure:
        (a) `getByRole('switch', { name: 'Aging Degradation' })` is a `<button type="button">`,
            `aria-checked="false"` / `not.toBeChecked()` at `value={false}`; its
            `aria-labelledby` resolves to the `<label>` whose `for` equals the switch's id (assert
            both attributes EXIST before resolving — the 4.5 review's `''.split()` lesson); it has
            **no** `aria-label`.
        (b) `aria-describedby` is exactly the description's id and that element's text is
            "Cells increase saturation as they age".
        (c) **click toggles**: `user.click(switch)` → `onChange(true)` once; through the harness
            `toBeChecked()` and the state text reads "On" (`getByText('On')` — `getByText` does not
            filter `aria-hidden`); click again → `onChange(false)`, "Off".
        (d) **label click toggles**: `user.click(label)` → `onChange(true)` exactly once (no
            double fire from label activation + button click).
        (e) **keyboard**: focus the switch, `user.keyboard(' ')` → toggled; `user.keyboard('{Enter}')`
            → toggled back; `user.keyboard('{ArrowRight}')` → `onChange` not called.
        (f) **controlled**: with a `vi.fn()` parent that never updates `value`, a click leaves the
            switch `aria-checked="false"` (3.13 trap 9's shape); `rerender` with `value` true →
            checked and "On".
        (g) **the state text is hidden from AT**: `getByText('Off').closest('[aria-hidden="true"]')`
            is not null (the element is, or sits inside, an `aria-hidden` node).
        (h) **strip structure**: exactly `MAX_AGE_SHADE + 1` elements with `[data-age]` inside
            `[data-aging-example]`, which is `aria-hidden="true"`; `data-age` runs `0..7` in order.
        (i) **strip Off is flat, On is a ramp**: read every cell's `style.backgroundColor`; at
            `value={false}` all eight are equal; after `rerender` with `value={true}` there are
            eight distinct values and cell 7's is unchanged from the Off value. (Do not string-
            compare against `agingExampleColors` here — jsdom's `cssstyle` may normalise `hsl()`;
            the exact strings are Task 2's test. Structural invariants are enough.)
        (j) **token change repaints**: `rerender` with `colorToken={PALETTE[1].id}` → cell 7's
            `style.backgroundColor` differs from its `DEFAULT_COLOR_TOKEN` value (Story 4.8's hook).
        (k) **flipping writes only the flag**: through a harness whose state is the whole draft
            shape `{ agingEnabled, colorToken }`, a click changes `agingEnabled` and leaves
            `colorToken` identical (the "visual-only" AC at the field's seam).
        (l) axe → `[]` Off and On (`unmount` between scans — 3.13's series pattern).
        jsdom has no layout: never assert the knob position, widths or computed token colours.

- [x] **Task 5 — Mount it in the shell** (AC: 3, 6, 8, 9)
  - [x] `OrganismEditorModal.tsx:13-16, 136-150, 167-171, 229-234`: static relative import of
        `./AgingToggleField` (inside the lazy chunk — the reasoning at `:7-12`);
        ```ts
        const setAgingEnabled = useCallback(
          (agingEnabled: boolean) => setDraft((d) => ({ ...d, agingEnabled })),
          [],
        );
        …
        basicInfo={
          <>
            <OrganismNameField value={draft.name} onChange={setName} />
            <DominanceField value={draft.dominance} onChange={setDominance} />
            <AgingToggleField
              value={draft.agingEnabled}
              onChange={setAgingEnabled}
              colorToken={draft.colorToken}
            />
          </>
        }
        ```
        The component doc (`:136-150`) keeps every sentence; add "Story 4.7's `agingEnabled` and
        `colorToken`" where it names the draft. Save stays `disabled` (Story 4.3 FD4 / 4.16's
        cross-fade trap).
  - [x] `OrganismEditorModal.test.tsx:110-123`: retarget the guard — Basic Information contains
        `getByRole('textbox', { name: 'Organism Name' })`, `getByRole('slider', { name:
        'Dominance' })`, `getByRole('textbox', { name: 'Dominance value' })` and
        `getByRole('switch', { name: 'Aging Degradation' })`; the dialog contains exactly **two**
        textboxes, exactly **one** slider and exactly **one** switch. Retitle to name Story 4.7.
        Add: (1) the editor opens with the switch unchecked and "Off" showing; (2) a click
        round-trips through the modal's own state (checked, "On", and the strip's cell 0 and cell
        7 now differ); `:184-193` (tab order) grows one `user.tab()` → the switch has focus. The
        existing axe test scans the control for free — do not duplicate it.
  - [x] `OrganismLibrary.test.tsx:411-440`: extend the reopen test with one
        `user.click(screen.getByRole('switch', { name: 'Aging Degradation' }))` before the exit
        (assert `toBeChecked()`), and after the reopen assert `not.toBeChecked()` — the draft's
        third field must not survive either, and this is the only test that goes through the real
        `mounted` gate. No new test file; the existing case grows three lines.

- [x] **Task 6 — e2e against the served static export** (AC: 1, 2, 4, 7, 8)
  - [x] `apps/web/e2e/organisms.spec.ts`: new `test.describe('aging degradation toggle (Story
        4.7)')` after the 4.6 block (`:930-1071`), reusing module-scope `openEditor` (`:23-29`) and
        the console/pageerror capture idiom. A local `openAgingToggle(page)` mirrors
        `openDominanceControl` (`:933-941`): locate through the region —
        `dialog.getByRole('region', { name: 'Basic Information' }).getByRole('switch', { name:
        'Aging Degradation' })` — and the strip as `basicInfo.locator('[data-aging-example]')`.
        Tests:
        1. **Opens Off, description visible, strip has eight equal cells, zero console errors**:
           `await expect(switch).not.toBeChecked()` (Playwright reads `aria-checked` on
           `role="switch"`), `toHaveAttribute('aria-checked', 'false')`, `getByText('Off')`
           visible, description visible, `strip.locator('[data-age]')` `toHaveCount(8)` —
           `MAX_AGE_SHADE` lives in `apps/web/lib`, which this spec does not import today (only
           `@gol/*`), so write the literal with a comment naming the constant, the way
           `:1058-1070` writes the description string. Read all eight `background-color`s via
           `evaluateAll(getComputedStyle)`; assert exactly one distinct value.
        2. **Click toggles On and the strip becomes a ramp**: `switch.click()` → `toBeChecked()`,
           "On" visible; the eight computed colours are now eight distinct values and cell 7's is
           unchanged from step 1; `click()` again → `not.toBeChecked()`, "Off", flat again.
        3. **Keyboard**: focus the dominance textbox, `press(browserName === 'webkit' ? 'Alt+Tab' :
           'Tab')` → the switch `toBeFocused()` (the Story 4.1 WebKit idiom in this file);
           `press('Space')` → checked; `press('Enter')` → unchecked; `press('ArrowRight')` →
           still unchecked.
        4. **Label click toggles**: `dialog.getByText('Aging Degradation', { exact: true }).click()`
           → checked (pins FD2's `htmlFor` half in a real browser).
        5. **axe with the switch On**: `AxeBuilder` after step 2's first click (no transition on
           the control, so no extra wait beyond `openEditor`'s settle) → `[]`. This is the scan
           that measures "On" in `--gol-accent` on `--gol-bg-secondary` for real.
        6. **Description is associated**: `aria-describedby` resolves (`[id="…"]` selector —
           `useId` ids carry colons) to "Cells increase saturation as they age".
  - [x] Keep every 4.1–4.6 assertion verbatim; no earlier block is edited.

- [x] **Task 7 — Bundle measurement, docs, verification** (AC: 9)
  - [x] Measure before (on `main`, all four routes + the editor chunk — the 4.6 review's "before
        was partial" item) and after Task 6; record in the Dev Agent Record. Do **not** edit
        `budgetGzipKb`.
  - [x] `deferred-work.md`: add `## Deferred from: Story 4-7-aging-degradation-toggle
        (2026-09-16)` with: (1) **the mockup has no example strip** — the eight-cell strip, its
        20px height, 3px gap, `--gol-border` edge and "Age 0 / Age 7" caption are this story's
        values (design doc `:271-273` sketches `░ ▒ ▓ █` only); a mockup-refresh note; (2) **the
        On knob is `--gol-on-accent`, not the mockup's `--text-primary`** (FD6) and **the track
        border is `--gol-border-control`, not `--border`** — the SC 1.4.11 substitutions, a
        mockup-refresh note; (3) **no `transition` on the switch** (mockup `all 0.3s`) — the
        Story 4.5 FD5 rule, so the knob jumps; a motion-design call for the UX touch, not a
        defect; (4) **`colorToken` is seeded at `DEFAULT_COLOR_TOKEN` as a stopgap** — Story 4.8
        owns the M6 derivation and must replace the seed, not add a second source; until then a
        new organism's strip is sky-blue, which is Conway's Classic's token — do not read anything
        into that; (5) **the strip is a live preview (flat when Off), not a permanent ramp** —
        FD4's reconciliation of `epics.md:1074` ("when rendered … shows the strip (pale → full)")
        with `organism-editor-design.md:271` ("Visual Example (when ON)"); flagged for Sidiar — a
        permanent ramp is a one-line change (`displayColor(token, age)` instead of the
        `ageShadeFor` form) and the tests' Off-state invariants would flip; (6) **Epic 6's three
        Settings toggle rows (6.6 / 6.7 / 6.10) now have a native-switch precedent** — the
        `Switch` / `StateText` blocks are copy candidates across the route split; whether a shared
        `<ToggleSwitch>` is promoted (and where it lives) is Story 6.6's call, the same shape as
        3.16's `<RangeSlider>` question; (7) **the 4.13 Save gate has nothing to check here** —
        `agingEnabled` is a boolean the switch can only set to `true`/`false`.
  - [x] `docs/project-context.md` — **no new rule**: the axe `button-name` fact (a `<label for>`
        does not name a `<button>` for axe) is recorded in the component header and this story;
        promote it to the context file only if a second story trips on it.
  - [x] `npm run ci > ci.log 2>&1; echo $?` — paste the exit code, the bundle lines, the domain
        coverage line (unchanged — nothing in `packages/*` is touched) and the e2e summary into
        the Dev Agent Record. ⚠️ `deferred-work.md:1008-1016` records that the LOCAL four-project
        matrix exits 1 on a pre-existing Story 3.12 e2e (macOS WebKit `Tab` → `<body>`); if that
        is what fails, say so with the test name and confirm the remote run instead — never "fix"
        it here. Push to `story/4-7-aging-degradation-toggle`; check `gh run list --limit 1` after
        the PR opens.

### Review Findings

Reviewed on **Opus** against a **Sonnet** implementation (2026-09-16), via three parallel adversarial
layers (Blind Hunter, Edge Case Hunter, Acceptance Auditor). 0 `decision-needed`, 11 `patch`, 0
`defer`, 24 dismissed as noise (spec-mandated shapes, future-story concerns, pairs already gated by
`themeTokens.test.ts`, claims the docs diff already answers). All patches applied in the review
commit.

- [x] [Review][Patch] `Cells` comment cited a mockup class (`.example-strip`) that does not exist — the mockup has no strip (FD4, this story's own deferred item 1) [apps/web/components/organisms/editor/AgingToggleField.tsx:87]
- [x] [Review][Patch] `fieldStyles.ts` header claimed "no test of 4.5/4.6 is edited" while the same commit edits `OrganismEditorModal.test.tsx`; reworded to name the two field tests that actually run unedited [apps/web/components/organisms/editor/fieldStyles.ts:7]
- [x] [Review][Patch] `fieldStyles.ts` `.form-field` mockup ref pointed at the dominance CSS (`:390-448`); `.form-field` is at `:153` (a `DominanceField.tsx` inaccuracy promoted to the shared module) [apps/web/components/organisms/editor/fieldStyles.ts:13]
- [x] [Review][Patch] Modal doc block had a ~135-char unwrapped line after the Story 4.7 insertion; reflowed [apps/web/components/organisms/editor/OrganismEditorModal.tsx:139]
- [x] [Review][Patch] `organismDraft.ts` "grows one field per story" list omitted 4.8 (Task 1 asked for it) [apps/web/lib/organisms/organismDraft.ts:10]
- [x] [Review][Patch] Modal round-trip test indexed cell `7` as a literal and looked the strip up on `document.body`; now `MAX_AGE_SHADE`, scoped to the dialog, asserting the strip and its cell count exist before indexing (a TypeError is not a finding) [apps/web/components/organisms/editor/OrganismEditorModal.test.tsx:552]
- [x] [Review][Patch] Off-state "flat strip" assertions were vacuous — eight empty `style.backgroundColor`s (jsdom) or eight `rgba(0, 0, 0, 0)`s (Playwright) are also "one distinct value"; both now assert the first cell is painted [apps/web/components/organisms/editor/AgingToggleField.test.tsx:206, apps/web/e2e/organisms.spec.ts:1107]
- [x] [Review][Patch] Label-click test only proved Off → On; now clicks back and pins a single `onChange(false)` [apps/web/components/organisms/editor/AgingToggleField.test.tsx:128]
- [x] [Review][Patch] Test (a) named the switch's `id` `htmlFor` and then compared it to the label's `for` — reads backwards; renamed `switchId` [apps/web/components/organisms/editor/AgingToggleField.test.tsx:89]
- [x] [Review][Patch] Dev Agent Record said "six" deferred items; seven were written (the 4.13 Save-gate note was omitted) [docs/implementation-artifacts/4-7-aging-degradation-toggle.md Completion Notes]
- [x] [Review][Patch] The 4.6 review's `Field`/`Label`/`Slider` item was rewritten wholesale instead of having its `Field`/`Label` half struck; original prose restored with the half struck and the `Slider` half left open, as Task 3 asked [docs/implementation-artifacts/deferred-work.md:1091]

Noted, not patched: the strike of the 4.6 "before bundle measurement was partial" item was outside
Task 3's instruction but is factually resolved by this story's Task 7 measurement — left in place.
The two owner flags the story itself raised (FD4 live-preview vs permanent ramp; FD5 `colorToken`
seed as a 4.8 stopgap) are recorded in `deferred-work.md` and are not review decisions.

## Dev Notes

### Forced decisions (made here so the dev agent does not have to)

- **FD1 — A native `<button type="button" role="switch" aria-checked>`, not MUI `<Switch>` and
  not a hidden checkbox.** Three facts against MUI, the same three 3.13/4.6 recorded for the
  slider: `@mui/material/Switch` is a new module in the editor chunk (AR-35); its DOM (`<span
  class="MuiSwitch-root">` over a hidden input) matches no mockup locator; and under
  `cssVariables: true` MUI emits `--mui-palette-Switch-primaryDisabledColor: var(--gol-accent)`,
  so a disabled MUI switch looks enabled until someone authors a shade token and a `styleOverride`
  (`deferred-work.md:87` names "Switch → Epic 6" as the first consumer — it still has none). A
  hidden `<input type="checkbox" role="switch">` (the `GridSettingsSection.tsx` shape) exists
  there because a radio GROUP needs native radio semantics and arrow-key roving; a switch's whole
  contract is `aria-checked` + Space, which a `<button>` gives natively — plus Enter, which the
  APG switch pattern permits — and the focus ring lands on the visible control with a plain
  `:focus-visible`, no `:focus-within` and no `:has()` (Firefox 112 floor, NFR-2.1). The track is
  the button's own box; the knob is its `::before`, exactly the mockup's construction. The
  mockup's `<div class="toggle-switch">` is not focusable and not a control; this is the mockup's
  look on a real control.

- **FD2 — The name is `aria-labelledby={labelId}`; `htmlFor` stays for the click.** axe-core
  names a `<button>` by `subtreeText` only (`axe.js:17350-17351`, `namingMethods: 'subtreeText'`
  — the `labelText` method applies to `input`/`select`/`textarea`/`meter`/`progress`/`output`),
  so a switch named through `<label for>` alone is an axe `button-name` violation even though
  jsdom's `dom-accessibility-api` (which treats `button` as labelable) resolves it — the exact
  "passes in unit tests, fails in axe" trap. `aria-labelledby` pointing at the
  visible label is the one mechanism all three agree on, and it is the ONLY name (no
  `aria-label`, no visually-hidden text inside the button — Story 4.5 AC5's "no second name"
  rule). The `<label htmlFor={switchId}>` is kept because a `<button>` IS a labelable element:
  clicking the label activates it (one `click` on the button, one `onChange`), which is the
  affordance every other field's label has; it contributes nothing to the name. `Label` is the
  shared `styled('label')` — no `as="span"` trick.

- **FD3 — The "Off" / "On" text is `aria-hidden`, and the state is never colour alone.** The
  switch's `aria-checked` is the state for assistive technology; a visible "On" that is also read
  makes the same announcement twice (3.13 trap 5, the `aria-hidden` marks). Sighted users get
  three channels — the knob's position, the text, the accent fill — so WCAG 1.4.1 is met without
  the text being in the tree. The text colour flip is a `data-on` attribute (the
  `GridSettingsSection` data-attribute idiom), never inline `style` — the token stays in CSS.

- **FD4 — The strip is a live `ageShadeFor` preview: eight cells, flat when Off, the ramp when
  On.** `epics.md:1074` says the toggle "shows the saturation-progression example strip (pale →
  full, age 0 → 7)" *when rendered*; `organism-editor-design.md:271` labels the example "when
  ON". Rendering the strip always but deriving each cell through `ageShadeFor(age, agingEnabled)`
  satisfies both readings and adds the one thing neither asked for but both imply: the strip shows
  *this organism's* cells at ages 0–7 as the renderer will paint them, so flipping the switch is
  what makes the ramp appear — the most direct explanation of what the toggle does that a UI can
  give. It reuses the function `refToFillGroup.ts` (Story 3.9) uses, so the preview cannot
  disagree with the dish (`displayColor.ts:22-30` records why the intuitive `agingEnabled ? age :
  0` form is a spec violation). Eight cells because `MAX_AGE_SHADE + 1` — derived, and NOT the
  engine's `MAX_RELEVANT_AGE` (the two collide at 7 by coincidence; never share the constant).
  The strip is `aria-hidden`: its information is the description sentence plus the switch state,
  both already in the tree, and a `role="img"` label would have to re-type "30% → 100%" — a
  third source for FR-5.7's numbers. ⚠️ **Flagged for the owner** (Task 7's deferred item 5): if
  Sidiar wants the ramp visible while Off, change `agingExampleColors` to ignore `agingEnabled`
  and flip the Off-state invariants in the tests. Not a silent pick — the divergence is recorded.

- **FD5 — The draft grows `agingEnabled` and `colorToken` in this story.** `agingEnabled` is the
  AC's field. `colorToken` joins now because the strip needs *the organism's current colour
  token* and the draft is the only legitimate holder (Story 4.5 FD3's one-object rule): passing
  `DEFAULT_COLOR_TOKEN` straight from the modal would be a second holder that Story 4.8 would
  have to find and delete. Seeding at `DEFAULT_COLOR_TOKEN` is a stopgap the doc block says so;
  4.8 replaces the seed with the M6 derivation. After this story the draft lacks only
  `survivalRules` (4.10) before it is `Omit<Organism, 'id' | 'schemaVersion'>`. Consequences the
  later stories rely on: 4.8 wires `setColorToken` and the strip already follows; 4.16 parses a
  draft whose `agingEnabled` already satisfies `z.boolean()`; 4.17 seeds both fields from a
  loaded record and the switch/strip show them with no translation; 4.23 diffs them like any
  other field.

- **FD6 — Tokens: `--gol-on-accent` for the On knob, `--gol-border-control` for the track
  edge, no new token, no `transition`.** The mockup's On knob is `--text-primary` (white) on
  `--accent` (cyan): 1.8:1, below SC 1.4.11's 3:1 for a state indicator. `--gol-on-accent` exists
  for exactly "the thing drawn on top of accent" (buttons' text) and is a gated pair against every
  accent state in `themeTokens.test.ts:78-83`. The Off knob is `--gol-text-tertiary` on
  `--gol-bg-hover` (gated text pair, comfortably above 3:1). The track edge is
  `--gol-border-control` — `--gol-border` measures 1.57:1, the `<BattleNameField>` substitution
  every control boundary here makes. "Off"/"On" in `--gol-text-secondary` / `--gol-accent` on
  `--gol-bg-secondary` are gated rows. The strip cells' edge is the decorative `--gol-border` on
  purpose: the strip is not a control. No `transition` (mockup `all 0.3s`): Story 4.5 FD5 — an
  axe scan landing mid-fade measures a ratio no settled state has, and 2.13/2.14/2.15 each lost
  a scan to it. `themes.css` and `lib/theme.ts` are **untouched**.

- **FD7 — `fieldStyles.ts` is born here, as the 4.6 review said it should be.** The review's
  deferred item names "a third editor field (4.7's toggle, 4.8's picker)" as the moment the
  `Field`/`Label` copies become an extraction. Three callers is the threshold this repo uses
  (Story 4.5 FD6: no abstraction over one caller; the 2.9 `displayOrganisms` rename over two). It
  stays inside `components/organisms/editor/` — a sibling module, not a cross-mode primitive —
  and `Description` rides along because two of the three fields use it. Rule sets move
  byte-identical; nothing visual changes, and the proof is that no test of 4.5/4.6 is edited.

### What exists — read these before writing a line

| File | Why it matters here |
|---|---|
| `apps/web/components/organisms/editor/DominanceField.tsx` | **The immediate precedent** (Story 4.6): `Field`/`Label`/`Description` (moving to `fieldStyles.ts`), `Row`, `Marks` (copy for the strip caption), the `useId` + `aria-describedby` discipline, the header-comment shape (mockup refs, FD list, spec ids), no `transition`. |
| `apps/web/components/organisms/editor/DominanceField.test.tsx:9-27` | The `ControlledHarness` shape; the `vi.fn()` variant; the axe series with `unmount`; "assert the attribute exists before resolving it". |
| `apps/web/components/organisms/editor/OrganismNameField.tsx:9-21` | `Field` / `Label` to delete once `fieldStyles.ts` exists; the label's dropped-top-margin comment moves with it. |
| `apps/web/components/organisms/editor/OrganismEditorModal.tsx:7-16, 136-150, 156-171, 229-234` | **The file being modified**: import block reasoning, the doc block to extend, the draft `useState` + `setName`/`setDominance` (add `setAgingEnabled`), the `basicInfo` fragment that gains a third child. Everything else stays. |
| `apps/web/components/organisms/editor/OrganismEditorModal.test.tsx:107-123, 145-193, 201-` | The "exactly two textboxes and one slider" guard to retarget; the round-trip test shapes; the tab-order test to extend; the axe test that now covers the control. |
| `apps/web/components/organisms/OrganismLibrary.test.tsx:407-440` | The only test that reopens through the real `mounted` gate — extend with a switch click. |
| `apps/web/components/battle/editor/GridSettingsSection.tsx:85-135` | The data-attribute-over-`:has()` reasoning (Firefox 112 floor) and the "state by three channels" comment — the idiom `data-on` follows. **Read, never import** (across the mode split). Its hidden-input shape is NOT copied (FD1). |
| `apps/web/components/organisms/OrganismCard.tsx:19-23, 184, 193-194` | The AR-46 inline-`style` precedent for organism colour (the strip cells), and the card's own "Aging: Yes/No" stat — reads `organism.agingEnabled`, untouched. |
| `apps/web/lib/palette/displayColor.ts` | `MAX_AGE_SHADE`, `ageShadeFor`, `displayColor` — the LUT the strip goes through. **Read, do not modify.** Its `ageShadeFor` doc is FD4's authority. |
| `apps/web/lib/palette/displayColor.test.ts:15-83` | The identity (`displayColor(token, 7)` reproduces the hex), the ramp span and `ageShadeFor` pins — what Task 2's test builds on rather than re-proving. |
| `apps/web/lib/palette/paletteRegistry.ts:32-52, 58, 63` | `PALETTE` (a second known token for tests), `DEFAULT_COLOR_TOKEN` (the draft's stopgap seed and Conway's Classic's token — the `displayOrganisms.ts` comment on why that coincidence matters elsewhere). |
| `apps/web/lib/displayOrganisms.ts:1-3, 67-74` | The import shape for `DEFAULT_COLOR_TOKEN` / `displayColor` from `lib`; `toDisplayOrganism` uses the identity shade — the same value the Off strip shows. |
| `apps/web/lib/canvas/refToFillGroup.ts:20-25` | The renderer's consumer of `agingEnabled` via `ageShadeFor` (Story 3.9) — cite it; do not touch it. |
| `packages/simulation/src/strategy/threePhaseStep.test.ts:140-144`, `phaseDeps.ts:35-41`, `conflictPhase.ts:155` | AC5's evidence: the engine carries no `agingEnabled` and age advances regardless. **Do not touch `packages/*` at all in this story.** |
| `apps/web/lib/organisms/organismDraft.ts` (+ test) | Grows two fields; the "grows one field per story" list to update. |
| `apps/web/lib/organisms/dominance.ts` | The pure-helper-in-`lib` precedent `agingExample.ts` mirrors (header reasoning, derived constants). |
| `apps/web/components/organisms/editor/OrganismEditorLayout.tsx:45-53, 172-182` | The `basicInfo` slot. **Read, do not modify.** |
| `apps/web/lib/organisms/useOrganismEditorModal.ts` | **Read, do not modify** — `OrganismEditorModalProps` unchanged. |
| `apps/web/components/organisms/OrganismLibrary.tsx:30` | The `dynamic()` boundary. ❌ Never import the field, the helper or `fieldStyles.ts` here. |
| `apps/web/app/themes.css:19-46` | Tokens in play (`--gol-bg-hover`, `--gol-border-control`, `--gol-border`, `--gol-accent`, `--gol-on-accent`, `--gol-text-secondary`, `--gol-text-tertiary`). Nothing added. |
| `apps/web/lib/themeTokens.test.ts:55-83, 125-151` | The gated text pairs (every pair FD6 names) and the control-boundary pairs; why no new row is needed. |
| `apps/web/e2e/organisms.spec.ts:1-29, 930-1071` | `openEditor`, the region-scoped locator helper, the WebKit `Alt+Tab` idiom, the `[id="…"]` describedby resolution, the console-capture idiom. |
| `node_modules/axe-core/axe.js:17300-17352` | The naming-method table behind FD2 (`button` → `subtreeText`). |
| `docs/planning-artifacts/ux-designs/…/clinical-lab-theme/organism-editor.html:448-492, 968-976, 1248-1261` | `.toggle-container` / `.toggle-label` / `.toggle-switch` CSS, the markup (label, description, "Off", the div switch) and the click script (class flip + label text/colour flip). |
| `docs/planning-artifacts/ux-designs/…/clinical-lab-theme/settings.html:221-255, 428, 477, 489, 544` | The same `.toggle-switch` rule set on the Settings page — Epic 6's rows; the page note calling the pill shape out. Read for parity; nothing built here. |
| `docs/planning-artifacts/ux-designs/…/organism-editor-design.md:256-274, 530` | Label, description, "OFF (default): gray toggle", "ON: accent … pale (30%) … full at age 7 (FR-5.7)", the `░ ▒ ▓ █` example sketch, "Aging: OFF" for a new organism. |
| `docs/implementation-artifacts/4-6-dominance-control.md` | FD1–FD6, the review patches (label-click double fire is the analogue of "slider supersedes buffer"; derive numbers; exact-count guards; assert attributes exist), the bundle figures (chunk 4216 B, `/organisms` 295.3 KB). |
| `docs/implementation-artifacts/4-5-organism-name-field.md` | FD3 (one draft object), FD5 (no transition), FD6 (`styled()` over MUI form components). |
| `docs/implementation-artifacts/deferred-work.md:87, 1052-1100` | The MUI Switch derived-token trap (unchanged); the 4.6 sections (the `Field`/`Label` extraction pointer this story closes; the `type="number"` and colour-order notes). |
| `docs/implementation-artifacts/lane-gates.yaml` | 4.15/4.24/4.25 gated on Epic 3; this story proposes no gate (see the last line of this file). |

### Architecture compliance

- **RFC-005 Decision 1 / Decision 7, AR-33** — `agingEnabled` and `colorToken` are ephemeral UI
  state in the modal's draft; no global store, no Context, no repository anywhere in this story
  (AR-2 / AR-27 untouched — nothing is persisted; Save stays `disabled`).
- **FR-2.4 / FR-5.7 / Decision B** — the toggle is a render input only; the engine's key-set
  pin is the proof and is not touched. The strip reads the LUT through `ageShadeFor`, the same
  path as `refToFillGroup.ts` (B.2: non-aging keys as `(token, 7)`).
- **RFC-007 / AR-26 / Decision I** — the strip resolves a *token* at render time through
  `displayColor`; no hex is stored, computed or typed; an unknown token degrades through
  `paletteIndexOf`'s fallback (never reached with the draft's seed).
- **UX-DR9 / UX-DR17** — saturation-progression example; keyboard-operable switch; ARIA name,
  state and description.
- **AR-39** — nothing lands in `packages/*`; the helper and the field live in `apps/web`
  (presentation), where there is no coverage gate but every test guards a named failure.
- **AR-35 / bundle** — everything new is reached only through `OrganismEditorModal.tsx`; no new
  MUI module; `@mui/material/styles` is the only MUI import in the field.
- **RFC-003 Decision 3 / Decision J / AR-46** — `styled()` + `var(--gol-*)`; organism colour is
  an inline `style` string from the LUT; the only literals are sizes (50/26/20/13px, 2/26px, 3px,
  11/12px) from the mockup or this story's strip.
- **NFR-4.1** — no placeholder controls; the switch is fully live; the strip is real data.
- **NFR-2.1** — no `:has()`, no `:focus-within` needed; `aria-checked` attribute selectors and
  `::before` work on every floor engine.
- **SC 1.4.11 / 1.4.3 / 1.4.1** — track edge and On knob on gated pairs (FD6); state by position
  + text + colour (FD3).
- **Spec-id hygiene** — `spec:check` tokenises `FR-2.4`, `FR-5.7`, `FR-5.6`, `FR-2.3`, `FR-1.5`,
  `NFR-2.1`, `NFR-4.1`, `AR-26`, `AR-33`, `AR-35`, `AR-39`, `AR-44`, `AR-46`, `RFC-002`,
  `RFC-005`, `RFC-007`, `Decision B`, `Decision I`, `M6`, `Story 4.7`, `Story 4.6`, `Story 4.5`,
  `Story 4.8`, `Story 3.9`, `Story 3.13`, `Story 1.7`, `Story 6.6`, `Story 6.7`, `Story 6.10`;
  write them exactly so. `UX-DR9`, `UX-DR17`, `FD*`, `SC n.n.n` are not checked.

### Library / framework notes (installed versions, no research needed)

- **React 19.2** — `aria-checked={boolean}` renders `"true"`/`"false"`; `role="switch"` on a
  `<button>` is passed through; `useId()` ids contain colons (use `[id="…"]` in e2e selectors).
  Inline `style={{ backgroundColor }}` with an `hsl(h, s%, l%)` string is fine.
- **jsdom (Vitest 4)** — `button.labels` exists and `label.click()` activates a labelled button
  (test (d)); `cssstyle` may normalise `hsl()` on `element.style` — compare cells to each other,
  not to the helper's string (test (i)).
- **@testing-library** — `getByRole('switch', { name })` computes the name from `aria-labelledby`;
  `getByText` does not filter `aria-hidden` (so "Off"/"On" are reachable); `user.keyboard(' ')`
  and `'{Enter}'` on a focused `<button>` fire `click`.
- **jest-dom** — `toBeChecked()` supports `role="switch"` with `aria-checked`; `toHaveFocus()`.
- **Playwright 1.62** — `toBeChecked()` reads `aria-checked` for `role="switch"`; `click()` on a
  50×26 button is trivially actionable; `press('Space')` / `press('Enter')` activate a focused
  button in all three engines; WebKit needs `Alt+Tab` to move focus off a text input (the 4.1
  idiom). `locator.evaluateAll((els) => els.map((el) => getComputedStyle(el).backgroundColor))`
  returns `rgb(r, g, b)` strings — compare them to each other.
- **axe-core 4.12** — `button-name` requires a name from `aria-labelledby` / `aria-label` /
  subtree / `title` (not `<label for>`, FD2); `aria-allowed-role` permits `switch` on `button`;
  `aria-required-attr` requires `aria-checked` on `role="switch"` — never omit it, even when
  false; `aria-valid-attr-value` requires every referenced id to exist; `color-contrast` is
  measured e2e only and does **not** skip `aria-hidden` text — axe measures what is visible —
  which is why "Off"/"On" must sit on gated pairs (FD6).
- **MUI 9.3.1 `styled()`** — `styled('button')` forwards `type`, `role`, `aria-*`, `id`;
  attribute selectors (`'&[aria-checked="true"]'`) and `'&::before'` work as nested keys.
- **eslint-config-next / jsx-a11y** — `label-has-associated-control` is satisfied by `htmlFor`;
  `role-supports-aria-props` accepts `aria-checked` on `switch`; `no-noninteractive-element-…`
  rules do not fire on a `<button>`.

### Testing standards

- `apps/web` has **no coverage gate** — every test guards a named failure: the name coming from
  a `<label for>` only (a, e2e 4), a missing `aria-checked` (a), a double `onChange` from a label
  click (d), a switch that stops following the prop (f), the state text reaching the tree (g), a
  strip with a literal-8 cell count (h), an Off strip that still ramps or an On strip that is
  flat (i, e2e 1–2), a strip that ignores the token (j), a flip that touches another draft field
  (k), the control landing outside Basic Information (modal test), a third field surviving a
  reopen (library test).
- `packages/*` **are not touched**; the domain/simulation coverage lines must read exactly as on
  `main`.
- Never snapshot the control; never assert computed colours in jsdom; never mock `useId`.
- The 4.3/4.4 tests must not be edited; the 4.5/4.6 tests are **retargeted** only where this
  story legitimately changes a count or a tab hop (the modal guard, the tab-order test) or
  extends the reopen test. If any other 4.5/4.6 test fails — including after the `fieldStyles.ts`
  move — the change is wrong, not the test.
- Do not add an `afterEach` that sweeps `[aria-hidden]` nodes (`deferred-work.md:785-793`).

### Previous story intelligence (Story 4.6)

- The draft seam is in place and this story adds two fields to the type, two lines to the
  factory and one setter to the modal — nothing structural. `setDominance`'s functional-update
  shape is the one to copy.
- 4.6's review patches are this story's habits: assert `aria-describedby` / `aria-labelledby`
  **exist** before resolving them; derive every number from the export (`MAX_AGE_SHADE + 1`, not
  `8`); assert exact counts ("exactly one switch"); pin the on-mount state (opens Off); prove
  round trips through a **controlled harness**, not a bare `vi.fn()` (the 4.6 (g)/(i) finding);
  a second input channel (there: the slider; here: the label click) must be pinned for
  single-fire.
- 4.6 FD3's "a slider move discards the textbox buffer" has no analogue here — the switch has no
  buffer; the only two-channel concern is the label/button double fire (test d).
- 4.5 FD5 (no `transition`) and FD6 (plain `styled()` over MUI form components — the theme has no
  `MuiSwitch` override and this story adds none) carry over verbatim.
- 4.6 measured the editor chunk at **4216 B gzip** and `/organisms` at **295.3 KB**. Expect the
  chunk +≈1 KB, routes byte-identical (the LUT is already in first load via `<OrganismCard>`).
- The 4.6 review's `Field`/`Label` extraction pointer is executed here (FD7); its `Slider` half
  and the "draft lags the textbox until blur" item stay open, untouched.

### Git intelligence

`main` is at `ba8b4f7` (#41, Story 4.6 merged 2026-09-15; #40, Story 3.13, merged just before
it). The last app-code commits are 4.6's (`6f82520` feat, `7740381` review patches) and 3.13's
focus-ring fix (`6a520ba` — `SpeedControl.tsx` only). **Shared code surfaces with the open Epic 3
lane (3.14–3.19): none** — they write `components/battle/**`, `lib/battle/**`,
`battleRoute.spec.ts`; this story writes `components/organisms/editor/**`, `lib/organisms/**`,
`OrganismLibrary.test.tsx`, `organisms.spec.ts` and docs. `lib/palette/**` and `lib/canvas/**`
are read only. The only file both lanes write is `deferred-work.md` (append-only; the Step S sync
keeps both hunks).

### Project Structure Notes

- New: `components/organisms/editor/AgingToggleField.tsx` (+ `.test.tsx`),
  `components/organisms/editor/fieldStyles.ts`, `lib/organisms/agingExample.ts` (+ `.test.ts`).
- Modified: `components/organisms/editor/OrganismEditorModal.tsx` (+ test),
  `components/organisms/editor/OrganismNameField.tsx` and `DominanceField.tsx` (import
  `fieldStyles`), `components/organisms/OrganismLibrary.test.tsx` (one test extended),
  `lib/organisms/organismDraft.ts` (+ test), `e2e/organisms.spec.ts`,
  `docs/implementation-artifacts/deferred-work.md` (new section + one strike-through in the 4.6
  review section), `sprint-status.yaml`.
- Naming: component PascalCase `.tsx`; non-component TS camelCase, never dotted
  (`fieldStyles.ts`, `agingExample.ts`); helper `agingExampleColors`; data attributes
  `data-aging-example`, `data-age`, `data-on`.
- Untouched on purpose: `OrganismEditorLayout.tsx` (+ test), `useOrganismEditorModal.ts` (+
  test), `OrganismLibrary.tsx`, `OrganismCard.tsx`, `lib/theme.ts`, `app/themes.css`, everything
  under `components/battle/`, `lib/palette/`, `lib/canvas/`, all of `packages/*`,
  `playwright.config.ts`, `scripts/check-bundle-size.mjs` budgets, `docs/project-context.md`,
  `deferred-work.md:87`.

### What NOT to build

- ❌ No MUI `<Switch>` / `<FormControlLabel>`, no `MuiSwitch` theme override.
- ❌ No hidden `<input type="checkbox">` behind a styled track — FD1.
- ❌ No `aria-label` on the switch; no visually-hidden text inside it — FD2.
- ❌ No `role="img"` + label on the strip; no re-typed "30%" / "10%" / "100%" anywhere — FD4.
- ❌ No colour picker, no `setColorToken`, no next-unused derivation — Story 4.8 (the draft's
  `colorToken` seed is a stopgap, not a feature).
- ❌ No Save enablement, no persistence, no loading from a record — 4.16 / 4.17.
- ❌ No shared `<ToggleSwitch>` across `organisms/editor/` and Epic 6's settings — 6.6's call;
  crossing the route split is a design change.
- ❌ No engine or renderer change of any kind; no new test in `packages/*` — AC5's evidence
  already exists.
- ❌ No `transition`, no `:has()`, no new `--gol-*` token — FD6.
- ❌ No `deferred-work.md:87` edit — the MUI Switch trap is still unresolved because still unused.

### Open flags for the owner (not blockers — the story proceeds on the FD)

- **FD4's reading of "the strip"** (live preview, flat when Off) reconciles `epics.md:1074` with
  `organism-editor-design.md:271`; the alternative (a permanent ramp) is a one-line change.
  Recorded in Task 7's deferred item 5.
- **FD5's `colorToken` seed** pre-empts Story 4.8's field; 4.8 must replace the seed, not add a
  second source. Recorded in Task 7's deferred item 4.

### References

- `docs/planning-artifacts/epics.md:1066-1076` (Story 4.7 ACs), `:46` FR-2.4, `:86` FR-5.7,
  `:234` UX-DR9, `:242` UX-DR17, `:1078-1089` (4.8 — the picker updates the strip), `:1177-1187`
  (4.16), `:1189-1200` (4.17 — "opens fully populated (… aging …)"), `:1264-1275` (4.23),
  `:1512-1570` (6.6 / 6.7 / 6.10 — the next toggles).
- `docs/planning-artifacts/prds/prd-GameOfLife-2026-05-26/prd.md:180-184` (FR-2.4: "when
  disabled, cells render at full saturation regardless of age"), `:374-378` (FR-5.7), `:810-811`
  (glossary).
- `docs/planning-artifacts/architecture.md:168-178` (Decision B — B.1 age is engine state, B.2
  non-aging keys as `(token, 7)`), `:347` (M1 — Conway's Classic `agingEnabled: false`).
- `docs/planning-artifacts/rfcs/RFC-002-grid-rendering-technology.md:191-211` (the
  `refToGroup` LUT and `ageShade = agingEnabled ? min(age, 7) : 7`);
  `RFC-004-simulation-rules-engine.md:628-629` ("`agingEnabled` is a RENDER input, never read by
  the strategy"); `RFC-007-organism-colour-palette.md:14, 30` (Decision B.3 finalised — the aging
  transform); `RFC-005-application-state-modes-undo.md:15, 57` (Decision 1 — ephemeral UI state).
- `docs/planning-artifacts/ux-designs/ux-GameOfLife-2026-05-27/organism-editor-design.md:256-274,
  530`; `clinical-lab-theme/organism-editor.html:448-492, 968-976, 1248-1261`;
  `clinical-lab-theme/settings.html:221-255, 544`.
- `docs/implementation-artifacts/4-6-dominance-control.md` (FD1–FD6, review findings, bundle
  figures); `4-5-organism-name-field.md` (FD3, FD5, FD6); `4-4-three-column-responsive-layout.md`
  (FD6 — slots); `3-13-speed-control.md` (trap 5 — `aria-hidden` marks, trap 9 — controlled).
- `docs/implementation-artifacts/deferred-work.md:87, 785-793, 1008-1016, 1052-1100`.
- `docs/implementation-artifacts/lane-gates.yaml`.
- `docs/project-context.md` — Framework rules (three state categories, components split by mode,
  no repository import, `styled()` + tokens, the `ctx.fillStyle` token trap — the strip is DOM,
  not canvas, so an `hsl()` string in `style` is fine), Testing rules (axe, never snapshot, no
  coverage padding, Playwright viewport band), Code Quality (AR-46, `spec:check`, camelCase
  files, comments explain why), Commit gate.

## Dev Agent Record

### Agent Model Used

Sonnet (claude-sonnet-5), via `bmad-dev-story`.

### Debug Log References

- `apps/web`: `npx vitest run` — 87 test files, 1311 tests, all passing (includes the 3 new files
  and the 4 edited files this story touches).
- `npx tsc --noEmit -p apps/web/tsconfig.json` — clean, both before wiring the modal and after.
- `npm run lint` — 0 errors, 1 pre-existing warning (`BattleGallery.tsx` `exhaustive-deps`,
  unrelated to this story).
- `npm run format:check` — clean (after one `prettier --write` pass on the three files whose
  formatting drifted from hand-editing: `OrganismEditorModal.test.tsx`, `e2e/organisms.spec.ts`,
  `agingExample.test.ts`).
- Bundle: `npm run build:standalone && node scripts/check-bundle-size.mjs`, measured twice —
  before this story's changes (stashed the working tree back to `main`/`ba8b4f7`, the frontmatter
  `baseline_commit`) and after. All four routes byte-identical: `home` 333.4 KB (budget 340),
  `battle` 308.7 KB (budget 310), `battle/new` 308.6 KB (budget 310), `organisms` 295.3 KB (budget
  305). The lazy editor chunk moved 4226 B → 4744 B gzip (+518 B) — under the "expect +≈1 KB"
  estimate in the Dev Notes.
- e2e: the new `aging degradation toggle (Story 4.7)` describe block (6 tests) run individually
  across all four Playwright projects first (`chromium`, `firefox`, `webkit`, `tablet` — 24/24
  passed, including the WebKit `Alt+Tab` keyboard idiom).
- `spec:check` and `boundary:check` run standalone: both clean (249/249 cited spec ids resolve;
  7 escape shapes rejected, 2 legitimate engine imports accepted).
- `bench` + `bench:check`: NFR-1.1 frame at 100×60×20 organisms measured **9.335 ms** against the
  **16.667 ms** budget (44.0% headroom) — within budget, unaffected by this story (AC5's "touches
  nothing that runs a cycle" holds).
- `npm run ci` was attempted as one command twice; both times the harness killed the background
  process on host memory pressure (unrelated to this repo or story) partway through the `e2e`
  stage, after `typecheck` → `lint` → `format:check` → `spec:check` → `boundary:check` →
  `test:coverage` → `build:standalone` → `bundle:check` → `bench` → `bench:check` had all
  completed and passed. The `e2e` stage was therefore run **per Playwright project** instead
  (`npx playwright test --project=<name> --workers=2`), which is functionally the same gate the
  `ci` script chains, just split to fit available memory:

  ```
  chromium: 145 passed, 1 skipped — exit 0
  firefox:  145 passed, 1 skipped — exit 0
  webkit:   144 passed, 1 failed, 1 skipped — exit 1
  tablet:   144 passed, 1 failed, 1 skipped — exit 1
  ```

  The one failure on both WebKit-based projects is `battleRoute.spec.ts:2214` — `Transport
  controls (Story 3.12) › Tab reaches Play, Next cycle, Stop & reset in order …` — the
  **pre-existing, documented** macOS WebKit `Tab → <body>` gap
  (`deferred-work.md:1008-1016`, reproduced on the untouched baseline at `ba8b4f7` per that
  entry and per the Story 3.13 review). `battleRoute.spec.ts` is not in this story's File List
  and was not touched. Per the story's own instruction (Task 7), this is named rather than
  "fixed" here — a composed `npm run ci` on this branch would exit 1 locally for the same
  pre-existing reason, exactly as it does on `main`. Every test this story added or touched — all
  24 new `aging degradation toggle` cases across all four projects, plus every retargeted
  4.5/4.6/reopen test — passed on every project, including both WebKit-based ones.
- The remote gate (`gh run list --limit 1`) is checked once this branch has a PR — per this
  worktree's instructions, opening the PR is the next step's job, not this one's. *(Review,
  2026-09-16: PR #42 opened; run 35073064710 on `8b822fe` — `quality` pass 2m36s, `e2e` pass
  8m22s. The macOS-only WebKit `Tab → <body>` failure did not reproduce on `ubuntu-latest`, as
  `deferred-work.md`'s Story 3.12 entry predicts.)*

### Completion Notes List

- AC1–AC9 all satisfied. `<AgingToggleField>` mounts as the third child of the `basicInfo`
  fragment, under `<DominanceField>`, per AC1; it is a native `<button role="switch">` (FD1) named
  via `aria-labelledby` (FD2, the axe `button-name` fact); the "Off"/"On" text is `aria-hidden`
  (FD3); the eight-cell example strip is a live `ageShadeFor` preview (FD4); no
  `packages/simulation`, `apps/web/lib/canvas` or `apps/web/lib/palette` file was touched (AC5 —
  confirmed by `git diff --stat` against `ba8b4f7`); the draft round-trips through
  `OrganismEditorModal`'s own state and is discarded on exit, proven through the real `mounted`
  gate in `OrganismLibrary.test.tsx` (AC3, AC6); axe is clean in jsdom (both states, on the field
  and on the modal) and in the served app with the switch On (AC7); every 4.3/4.4/4.5/4.6 test
  file runs unedited except the two retargeted guards the story names —
  `OrganismEditorModal.test.tsx`'s Basic-Information-contents guard and its tab-order test, plus
  `OrganismLibrary.test.tsx`'s reopen test — and `fieldStyles.ts` now has three callers (AC8); the
  bundle gate passes with all four routes byte-identical (AC9).
- `agingEnabled` and `colorToken` were added to `OrganismDraft` together (FD5): the strip needs the
  draft's own colour token, and the draft is RFC-005 Decision 1's single ephemeral-UI-state holder.
  `colorToken` seeds at `DEFAULT_COLOR_TOKEN` as a stopgap Story 4.8 must replace, not add to —
  recorded in `deferred-work.md`.
- `fieldStyles.ts` was born in this story (FD7, the Story 4.6 review's pointer): `Field`, `Label`
  and `Description` moved out of `DominanceField.tsx` and `OrganismNameField.tsx` byte-identical;
  neither file's own test was edited, which is the proof nothing visual moved.
- The persisted half of this AC (Story 4.16's Save parse, Story 4.17's load-time seed) is
  explicitly **not** built here — `OrganismSchema.agingEnabled` already existed since Story 1.3 and
  is untouched; only the draft-level round trip is this story's scope (AC6).
- Seven open items recorded in `deferred-work.md` under "Deferred from: Story
  4-7-aging-degradation-toggle (2026-09-16)": the mockup's missing example strip, the FD6 token
  substitutions, no `transition` (FD5), the `colorToken` stopgap seed (FD5), the FD4 live-vs-
  permanent-ramp flag for Sidiar, the Epic 6 native-switch precedent, and the note that the 4.13
  Save gate has nothing to check for a boolean.
- `deferred-work.md:87`'s MUI-Switch trap entry was **not** edited, per the story's explicit "What
  NOT to build" instruction — this control still has no MUI consumer.

### File List

- New:
  - `apps/web/components/organisms/editor/AgingToggleField.tsx`
  - `apps/web/components/organisms/editor/AgingToggleField.test.tsx`
  - `apps/web/components/organisms/editor/fieldStyles.ts`
  - `apps/web/lib/organisms/agingExample.ts`
  - `apps/web/lib/organisms/agingExample.test.ts`
- Modified:
  - `apps/web/lib/organisms/organismDraft.ts`
  - `apps/web/lib/organisms/organismDraft.test.ts`
  - `apps/web/components/organisms/editor/OrganismNameField.tsx`
  - `apps/web/components/organisms/editor/DominanceField.tsx`
  - `apps/web/components/organisms/editor/OrganismEditorModal.tsx`
  - `apps/web/components/organisms/editor/OrganismEditorModal.test.tsx`
  - `apps/web/components/organisms/OrganismLibrary.test.tsx`
  - `apps/web/e2e/organisms.spec.ts`
  - `docs/implementation-artifacts/deferred-work.md`
  - `docs/implementation-artifacts/sprint-status.yaml`

### Change Log

- 2026-09-16 — Story file created (create-story): ACs decomposed, FD1–FD7 recorded, precedent
  and spec map compiled; status → ready-for-dev.
- 2026-09-16 — Implemented (dev-story): draft grows `agingEnabled`/`colorToken` (Task 1);
  `agingExampleColors` pure helper (Task 2); `fieldStyles.ts` extracted, `OrganismNameField`/
  `DominanceField` retargeted (Task 3); `<AgingToggleField>` built (Task 4); mounted in
  `OrganismEditorModal` and its tests retargeted/extended, plus the `OrganismLibrary` reopen test
  (Task 5); e2e block added across all four Playwright projects (Task 6); bundle measured before
  and after, `deferred-work.md` updated, `npm run ci` run (Task 7). Status → review.
- 2026-09-16 — Code review (Opus, `bmad-code-review`): 11 patches applied (comment accuracy,
  vacuous Off-strip assertions, literal cell index, label-click round trip, docs counts); CI on
  PR #42 green (`quality` + `e2e`). Status → done.

Dev Model: sonnet   # follows the 4.5/4.6 editor-field pattern (draft grows a field, controlled field in the basicInfo fragment, pure helper in lib, LUT already exists); the one new idiom — a native `<button role="switch">` and its naming — is fully pinned in FD1/FD2 with the axe fact behind it
Proposed lane gate: none
