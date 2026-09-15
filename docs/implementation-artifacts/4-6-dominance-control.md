---
baseline_commit: 14ac287
---

# Story 4.6: Dominance Control

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a user,
I want to set my organism's dominance,
so that I control how it fares in conflicts.

## Acceptance Criteria

From `epics.md#Story 4.6: Dominance Control` (`:1053-1064`), decomposed into what a reviewer can
check independently. AC6–AC9 are repo-derived: the obligations the shipped shell (Story 4.3), the
layout's slot contract (Story 4.4), the draft seam (Story 4.5), the domain coverage gate and the CI
gates already impose on "the second control inside the editor".

1. **The Basic Information column renders a Dominance control directly under the name field:
   a visible label "Dominance", the description "Priority in conflict resolution (1-100, higher
   wins)", a 1–100 slider and a numeric input side by side, and the end labels "1" / "100" under
   the slider.** `<DominanceField>` (new, `components/organisms/editor/`) mounts through
   `<OrganismEditorLayout basicInfo={…}>` after `<OrganismNameField>` — a fragment in the slot,
   never a fourth region, never a child of the layout. Mockup `organism-editor.html:390-448`
   (CSS) and `:954-964` (markup); design doc `organism-editor-design.md:209-250`. The mockup places
   Color between Name and Dominance — Story 4.8 inserts the picker there; this story renders
   name → dominance. (FR-2.2, UX-DR8)

2. **The range and the new-organism default are `@gol/domain` constants, and nothing re-types
   `1`, `100` or `5`.** `packages/domain/src/organismSchema.ts` gains `MIN_DOMINANCE = 1`,
   `MAX_DOMINANCE = 100` and `NEW_ORGANISM_DOMINANCE = 5`; `OrganismSchema.dominance` reads the
   first two (`z.number().int().min(MIN_DOMINANCE).max(MAX_DOMINANCE)`); `index.ts` exports all
   three. `NEW_ORGANISM_DOMINANCE` is the UX-DR8 default for a **new draft** — distinct from
   `CONWAYS_CLASSIC.dominance` (50, FR-1.5), which does not change. Schema tests derive from the
   constants and pin the three numbers once. `packages/domain` stays at 100% per file.
   (FR-2.2, AR-39)

3. **The draft grows `dominance`, seeded at `NEW_ORGANISM_DOMINANCE`; a fresh editor opens with
   both the slider and the numeric input at 5.** `OrganismDraft` becomes
   `Pick<Organism, 'name' | 'dominance'>`; `createNewOrganismDraft()` returns
   `{ name: '', dominance: NEW_ORGANISM_DOMINANCE }`. `<OrganismEditorModal>` passes
   `value={draft.dominance}` / `onChange={setDominance}` (a functional `setDraft` update — the
   sibling Story 4.5's `setName` comment already anticipates). `OrganismEditorModalProps` is
   **unchanged**; `useOrganismEditorModal.ts` is untouched. A fresh draft per open is still the
   `mounted` gate's doing — no reset effect, no `key`. (RFC-005 Decision 1, UX-DR8)

4. **Slider and numeric input stay in sync both ways, live.** Moving the slider (pointer or
   keyboard) writes the draft and the numeric input shows the new value on the same render.
   Typing an in-range integer into the numeric input writes the draft on that keystroke and the
   slider moves with it — no "apply" step. The draft is the single holder of the value; neither
   control keeps a mirror that can drift (Story 3.13 FD1's "controlled, never `defaultValue`"
   rule). (FR-2.2, UX-DR8)

5. **Typed out-of-range values snap to min/max; non-integers are rejected — and the draft can
   never hold anything but an integer in `[MIN_DOMINANCE, MAX_DOMINANCE]`.** On **commit**
   (blur, or Enter) the numeric input's text is parsed: an integer outside the range is clamped
   and written (`150` → `100`, `0` → `1`, `-5` → `1`); an empty, non-numeric or non-integer text
   (`''`, `abc`, `5.5`, `1e2`, `5.`) writes nothing and the field reverts to the draft's value.
   While the text is out of range or invalid the draft and the slider hold their last value. No
   error message and no red state — the design doc specifies auto-correction for this field
   (`organism-editor-design.md:759-761`), not an error, and because the draft is always valid
   Story 4.13's Save gate has nothing to check here. (FR-2.2, UX-DR8)

6. **The slider is keyboard-operable with native semantics — ArrowLeft/Right/Up/Down step by 1,
   Home/End jump to 1/100 — pinned in a real browser, and the tab order inside Basic Information
   is name → slider → numeric input.** The slider is a native `<input type="range">` (FD1), so
   this comes from the platform; jsdom does not step a range from the keyboard, so the unit test
   uses `fireEvent.change` and the keyboard contract lives in Playwright (Story 3.13's split).
   (UX-DR17)

7. **Accessible names and descriptions are right, and nothing announces per keystroke.** The
   slider's name is "Dominance" through a real `<label htmlFor={sliderId}>`
   (`getByRole('slider', { name: 'Dominance' })`; no `aria-label` on it). The numeric input's name
   is "Dominance value" via `aria-label` — it has no visible label of its own, and "Dominance" is
   contained in the name (SC 2.5.3); `getByRole('textbox', { name: 'Dominance value' })`. Both
   carry `aria-describedby={descriptionId}` pointing at the description paragraph. The "1" / "100"
   end labels are `aria-hidden` (the slider already exposes `aria-valuemin`/`aria-valuemax`
   natively — a visible copy would be announced twice, Story 3.13 trap 5). No `aria-live`, no
   `role="status"`, no `aria-valuetext` (the value IS the dominance — 3.13 needed valuetext only
   because its value was a ladder index). Colours are `--gol-*` tokens throughout; the thumb glow
   is an authored token (FD5); no `transition` anywhere in the control (Story 4.5 FD5). (UX-DR17,
   AR-46)

8. **axe passes with the control in place, in jsdom and in the served app, and every existing
   guard is retargeted, never loosened.** vitest-axe on `<DominanceField>` at 1, 5 and 100 and
   while editing an out-of-range text → `[]`; on `<OrganismEditorModal open origin="library">` →
   `[]`; `@axe-core/playwright` on `/organisms` with the dialog open, after a keyboard slider move
   → `[]`. `OrganismEditorModal.test.tsx`'s "exactly one textbox in the dialog" (Story 4.5 review
   patch) becomes "exactly **two** textboxes in the dialog, both inside Basic Information: 'Organism
   Name' and 'Dominance value'" — the guard's purpose (no stray textbox in header/footer) is kept.
   `OrganismEditorLayout.test.tsx` and `useOrganismEditorModal.test.tsx` are **not edited**; the
   five earlier e2e blocks in `organisms.spec.ts` stay verbatim. (AR-44, UX-DR17)

9. **The bundle gate passes and `/organisms`'s first load does not move.** `npm run
   build:standalone` + `node scripts/check-bundle-size.mjs` before (on `main`, `14ac287` — code
   identical to Story 4.5's after-measurement) and after. The field and the parse helpers are
   imported **only from `OrganismEditorModal.tsx`** and land in the lazy editor chunk (3521 B gzip
   after 4.5); `/organisms` (budget 305, baseline **295.3 KB**) stays within ±0.5 KB noise. A move
   of ≳ +1 KB on `/organisms` means a new module was imported from `OrganismLibrary.tsx`,
   `useOrganismEditorModal.ts` or another first-load file — a finding, not a number to nudge. **No
   budget is raised.** `npm run ci > ci.log 2>&1; echo $?` green locally (exit code captured to
   a file, never piped) and CI on the pushed branch checked with `gh run list --limit 1`, not
   inferred.

## Tasks / Subtasks

- [x] **Task 1 — The range and the default become domain constants** (AC: 2)
  - [x] `packages/domain/src/organismSchema.ts`: above `OrganismSchema`, next to
        `MAX_ORGANISM_NAME_LENGTH`, in the same comment shape:
        ```ts
        // FR-2.2 (Story 4.6): the dominance range, single-sourced — `OrganismSchema.dominance`
        // enforces it and `apps/web`'s `<DominanceField>` imports it rather than re-typing 1 / 100.
        export const MIN_DOMINANCE = 1;
        export const MAX_DOMINANCE = 100;
        // The value a NEW organism opens at in the editor (UX-DR8 "default 5") — a product default
        // like `DEFAULT_SETTINGS`, not a schema bound. NOT `CONWAYS_CLASSIC.dominance` (50,
        // FR-1.5): the protected default is deliberately mid-range; a new custom organism starts low.
        export const NEW_ORGANISM_DOMINANCE = 5;
        ```
        `dominance: z.number().int().min(MIN_DOMINANCE).max(MAX_DOMINANCE), // FR-2.2`. Nothing
        else in the schema changes. (`UX-DR8` is prose, not a `spec:check` id; `FR-2.2`,
        `FR-1.5`, `Story 4.6` are — write them exactly so.)
  - [x] `packages/domain/src/index.ts`: add the three to the `organismSchema` export list.
  - [x] `organismSchema.test.ts:77-88`: derive the three rejection tests from the constants
        (`MIN_DOMINANCE - 1`, `MAX_DOMINANCE + 1`, `MIN_DOMINANCE + 0.5`); add `accepts dominance
        of exactly MIN_DOMINANCE` and `… exactly MAX_DOMINANCE`; add one pin test
        `MIN_DOMINANCE is 1, MAX_DOMINANCE is 100, NEW_ORGANISM_DOMINANCE is 5` (the numbers UX-DR8
        states, pinned once so a drift fails here and not in a slider). A constant adds no branch —
        `packages/domain` stays 100 / 100 / 100 / 100.
  - [x] `defaultWorkspace.test.ts:16` (`CONWAYS_CLASSIC.dominance` is 50) is **unchanged** — that
        is the point of the comment above.

- [x] **Task 2 — Parse and clamp, pure** (AC: 5)
  - [x] `apps/web/lib/organisms/dominance.ts` (no React, no DOM):
        ```ts
        import { MAX_DOMINANCE, MIN_DOMINANCE } from '@gol/domain';
        /** `null` unless `text` (trimmed) is a plain decimal integer: `^-?\d+$`. `5.5`, `5.`,
         *  `1e2`, `+5`, `''` and `abc` are all `null`. The value may be OUTSIDE the range — clamping
         *  is `clampDominance`'s job, so the two concerns stay separately testable. */
        export function parseDominanceText(text: string): number | null
        /** `n` clamped into `[min, max]`. Defaults are the schema's own constants, never literals.
         *  `Infinity` (a 400-digit paste goes through `Number()` to `Infinity`) clamps to `max`. */
        export function clampDominance(n: number, min = MIN_DOMINANCE, max = MAX_DOMINANCE): number
        /** True when `n` needs no clamping — the field's "commit live on this keystroke" predicate. */
        export function isDominanceInRange(n: number, min = MIN_DOMINANCE, max = MAX_DOMINANCE): boolean
        ```
        Header comment: Story 4.11's Age / Neighbor-count inputs will want the same shape; they
        generalise it to `integerInput.ts` when they are the second caller (the Story 4.5 FD6
        reasoning — no abstraction over one caller). Use `Number(text)` after the regex, never
        `parseInt` (which accepts `5abc`).
  - [x] `dominance.test.ts`: `parseDominanceText` — `'5'` → 5, `' 42 '` → 42, `'007'` → 7,
        `'150'` → 150 (NOT clamped here), `'-5'` → -5, `'0'` → 0; `''`, `'   '`, `'abc'`, `'5.5'`,
        `'5.'`, `'.5'`, `'1e2'`, `'+5'`, `'5 5'` → `null`; a 400-digit string → a finite or
        `Infinity` number, never `null` (it is an integer text). `clampDominance` — 0 → 1, 101 →
        100, 5 → 5, 1 → 1, 100 → 100, `Infinity` → 100, `-Infinity` → 1; defaults derive from the
        exports (assert `clampDominance(0) === MIN_DOMINANCE`, never `=== 1`). `isDominanceInRange`
        — the four boundary cases.

- [x] **Task 3 — The draft grows `dominance`** (AC: 3)
  - [x] `apps/web/lib/organisms/organismDraft.ts`: `OrganismDraft = Pick<Organism, 'name' |
        'dominance'>`; `createNewOrganismDraft()` returns `{ name: '', dominance:
        NEW_ORGANISM_DOMINANCE }` (import the constant from `@gol/domain`; a `5` here is a second
        source). Update the doc block's "grows one field per story" list: 4.6 is now done, the
        remaining are 4.7 `agingEnabled`, 4.8 `colorToken`, 4.10 `survivalRules`.
  - [x] `organismDraft.test.ts`: the seed test becomes `toEqual({ name: '', dominance:
        NEW_ORGANISM_DOMINANCE })` (derived); keep "distinct object per call".

- [x] **Task 4 — `<DominanceField>`** (AC: 1, 4, 5, 6, 7, 8)
  - [x] `apps/web/components/organisms/editor/DominanceField.tsx` — `'use client'`; `styled` from
        `@mui/material/styles` only; `useId`, `useState` from React; imports `MAX_DOMINANCE`,
        `MIN_DOMINANCE` from `@gol/domain` and the three helpers from `@/lib/organisms/dominance`.
        ❌ No `@mui/material/Slider`, no `TextField` (FD1, FD2). ❌ No `<form>` (Story 2.11 FD5).
        ❌ Nothing imported from `components/battle/**` — copy Story 3.13's `Slider` styled block
        (see "What exists"), never reach across `battle/simulation/` ↔ `organisms/editor/`
        (`project-context.md`, components split by mode). Props:
        ```ts
        export interface DominanceFieldProps {
          value: number;
          onChange(dominance: number): void;
          /** Default to the schema's constants, never literals. */
          min?: number;
          max?: number;
        }
        ```
  - [x] Structure and styles (mockup `organism-editor.html:390-448, 954-964`, values verbatim;
        every colour a `--gol-*` token — AR-46):
        ```
        <Field>                                   div — margin: 0 0 20px 0 (the 4.5 `.form-field`)
          <Label htmlFor={sliderId}>Dominance</Label>
                                                  label — COPY OrganismNameField's `Label` rule set
                                                  (13px / 500 / text-primary / margin 0 0 8px 0)
          <Description id={descriptionId}>Priority in conflict resolution (1-100, higher wins)</Description>
                                                  p — mockup `.field-description` (:165-170): font-size
                                                  11px; color var(--gol-text-tertiary); margin 4px 0 0 0;
                                                  line-height 1.4. Tertiary is the token themes.css
                                                  raised to clear 4.5:1 for small text.
          <Row>                                   div — `.dominance-container`: display flex;
                                                  align-items center; gap 15px; margin-top 10px
            <Slider id={sliderId} type="range" min={min} max={max} step={1} value={value}
                    aria-describedby={descriptionId}
                    onChange={(e) => onChange(Number(e.currentTarget.value))} />
                                                  input — see the Slider block below
            <ValueInput type="text" inputMode="numeric" value={text ?? String(value)}
                        aria-label="Dominance value" aria-describedby={descriptionId}
                        onFocus onChange onBlur onKeyDown />
                                                  input — `.dominance-value`: background
                                                  var(--gol-bg-hover); border 1px solid
                                                  var(--gol-border-control) (NOT the mockup's decorative
                                                  --border — SC 1.4.11, the BattleNameField substitution);
                                                  color var(--gol-text-primary); padding 8px 12px;
                                                  font-size 16px; font-family inherit; font-weight 600;
                                                  width 60px; text-align center; flex: none;
                                                  '&:focus-visible': outline 2px solid var(--gol-accent),
                                                  outline-offset -2px. No transition.
          </Row>
          <Marks aria-hidden="true"><span>{min}</span><span>{max}</span></Marks>
                                                  div — `.dominance-labels`: display flex;
                                                  justify-content space-between; font-size 11px; color
                                                  var(--gol-text-tertiary); margin-top 4px
        </Field>
        ```
        The `Slider` block — Story 3.13's `SpeedControl.tsx` `Slider` with the editor mockup's
        thumb (`:398-426`): `flex: 1; height: 6px; margin: 0; background: var(--gol-border-control)
        ; appearance: none; WebkitAppearance: none; cursor: pointer;` — **no `borderRadius`**
        (Clinical Lab is sharp; the editor mockup sets none, unlike the play mockup's 3px) —
        `'&::-webkit-slider-thumb'` and `'&::-moz-range-thumb'`: `appearance: none;
        WebkitAppearance: none` (webkit only); `width: 20px; height: 20px; background:
        var(--gol-accent); border: 2px solid var(--gol-bg-primary); borderRadius: '50%';
        boxShadow: 'var(--gol-shadow-slider-thumb)'` (Task 5's token); `'&::-moz-range-track'`:
        `height: 6px; background: var(--gol-border-control)` (Firefox paints its native track
        over the input's background unless this is styled — 3.13 trap 7); `'&:focus-visible'`:
        `outline: 2px solid var(--gol-accent); outlineOffset: 2px`. Track fill is
        `--gol-border-control`, not the mockup's `--bg-hover` + `--border`: a 6px track is the
        control's only boundary (SC 1.4.11) and `--gol-border` measures 1.57:1 — the substitution
        3.13 records; the pair is already a gated row in `themeTokens.test.ts`, so no new contrast
        row.
  - [x] Behaviour (FD3):
        ```ts
        // `null` = not editing: the input shows `String(value)` and follows the slider for free.
        // A string = the user's in-progress text. No effect syncs the two — the derivation does.
        const [text, setText] = useState<string | null>(null);
        const commit = () => {
          if (text === null) return;
          const parsed = parseDominanceText(text);
          if (parsed !== null) onChange(clampDominance(parsed, min, max)); // snap on commit
          setText(null);                                                  // invalid → revert
        };
        onFocus={() => setText(String(value))}
        onChange={(e) => {
          const next = e.currentTarget.value;
          setText(next);
          const parsed = parseDominanceText(next);
          if (parsed !== null && isDominanceInRange(parsed, min, max)) onChange(parsed); // live
        }}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter') commit(); }}   // never touch Escape (Dialog's)
        ```
        Guard both `onChange` calls with `parsed !== value`: `setDraft((d) => ({ ...d, dominance }))`
        always builds a new object, so an unguarded no-op keystroke re-renders the whole modal for
        nothing (test k). Enter commits **without** blurring — the user may keep typing. Do not
        `preventDefault` or `stopPropagation` on any key: Escape must still reach the `Dialog`
        (`onClose`), and Story 4.23 inserts its guard there, not here.
  - [x] Header comment: mockup refs (`:390-448, 954-964, 1286-1294`), design-doc refs
        (`:209-250, 529, 759-761`), FD1–FD6 one sentence each, the "why not `type=number`" facts
        (FD2), and the ids. Cite `(Story 4.6)`, `(Story 3.13)`, `(Story 4.5)`, `(FR-2.2)`,
        `(RFC-005)`, `(AR-46)` exactly as `spec:check` tokenises them. `useId()` for all three ids
        (the field is not a singleton — Story 4.24's battle-origin editor is a second instance).
  - [x] `DominanceField.test.tsx` — a `ControlledHarness` (real `useState` round trip, the
        `BattleNameField.test.tsx:9-16` / `OrganismNameField.test.tsx` shape) plus a `vi.fn()`
        variant where call counts matter. Cases, each guarding a named failure:
        (a) `getByRole('slider', { name: 'Dominance' })` resolves through a `<label>` whose `for`
            equals the slider's id; `type="range"`, `min`/`max`/`step` attributes derived from
            `MIN_DOMINANCE`/`MAX_DOMINANCE`/`1`; value `'5'` when `value={NEW_ORGANISM_DOMINANCE}`
            (jest-dom reads a range's value as a string — 3.13's tests show the shape).
        (b) `getByRole('textbox', { name: 'Dominance value' })` has `inputMode="numeric"`, is
            `type="text"` (this FAILS on `type="number"` — the FD2 pin), shows `'5'`.
        (c) both controls' `aria-describedby` is exactly the description's id, and that element's
            text is the description string (assert the attribute EXISTS before splitting — the
            4.5 review's `''.split()` lesson).
        (d) the "1" / "100" marks are inside an `aria-hidden="true"` element and derive from the
            constants.
        (e) **slider → input**: `fireEvent.change(slider, { target: { value: '42' } })` →
            `onChange(42)` once; through the harness the textbox reads `'42'` (jsdom does not step
            a range from the keyboard — 3.13 trap 2 — so this is the unit-level "both ways" proof).
        (f) **input → slider, live**: `user.click(textbox)`, `user.clear`, `user.type('42')` →
            after `'4'` the harness value is 4 and the slider reads `'4'`; after `'42'` both read
            42 — no blur needed.
        (g) **out of range snaps on commit**: type `'150'` → slider still at the last in-range
            value (15), `onChange` NOT called with 150; `user.tab()` (blur) → `onChange(100)`, the
            textbox reads `'100'`, the slider `'100'`. Same for `'0'` → 1 and `'-5'` → 1.
        (h) **non-integer is rejected and reverts**: from 5, type `'5.5'` → `onChange` never
            called; blur → textbox reads `'5'`, slider `'5'`. Same for `''` (cleared) and `'abc'`.
        (i) **Enter commits without blurring**: type `'150'`, press Enter → `onChange(100)`,
            textbox `'100'`, and `document.activeElement` is still the textbox.
        (j) **controlled**: with a `vi.fn()` parent that does not update `value`, a slider change
            leaves the slider at the prop value (3.13 trap 9's shape); `rerender` with a new
            `value` moves both controls.
        (k) **no-op edits do not call onChange**: focus (text becomes `'5'`), type nothing, blur
            → `onChange` not called; `user.clear` then type `'5'` (the value it already holds) →
            still not called.
        (l) keyboard order: `user.tab()` from a preceding focusable lands on the slider, the next
            on the textbox.
        (m) axe → `[]` at values 1, 5 and 100 and with an out-of-range text mid-edit
            (`unmount` between scans — 3.13's series pattern).
        jsdom has no layout: never assert colours, widths, or the thumb.

- [x] **Task 5 — The thumb glow token** (AC: 7)
  - [x] `apps/web/app/themes.css`, at the end of the bare `:root` block, after
        `--gol-accent-tint`:
        ```css
        /* Range-slider thumb glow (Story 4.6). Mockup: .dominance-slider::-webkit-slider-thumb,
           box-shadow: 0 0 8px rgba(0, 212, 255, 0.3) (organism-editor.html:415). Same construction
           as --gol-shadow-tile-hover — composed from --gol-accent-channel so Epic 6's override block
           retunes it for free, authored here because AR-46 bans the literal in <DominanceField>.
           Story 3.13's speed slider has no glow (its own mockup has none); the token is named for
           the control class, not this field, so a later slider that wants it references it. */
        --gol-shadow-slider-thumb: 0 0 8px rgb(var(--gol-accent-channel) / 0.3);
        ```
        `themeTokens.test.ts` parses **hex** tokens only (`HEX_TOKEN_RE`), so a shadow token
        needs no contrast row and does not move the `>= 16` floor. `lib/theme.ts` is **not**
        touched — no `MuiSlider` override exists because no MUI Slider renders (FD1), and
        `deferred-work.md:87`'s MUI-Slider entry stays open, unedited.

- [x] **Task 6 — Mount it in the shell** (AC: 3, 8, 9)
  - [x] `OrganismEditorModal.tsx:163-166, 224`: static relative import of `./DominanceField`
        (inside the lazy chunk — the 4.4/4.5 reasoning at `:7-12`);
        ```ts
        const setDominance = useCallback(
          (dominance: number) => setDraft((d) => ({ ...d, dominance })),
          [],
        );
        …
        basicInfo={
          <>
            <OrganismNameField value={draft.name} onChange={setName} />
            <DominanceField value={draft.dominance} onChange={setDominance} />
          </>
        }
        ```
        Update the `setName` comment (`:164-165`) — the sibling it anticipated now exists. The
        component doc (`:135-150`) keeps every sentence; add "and `dominance` (Story 4.6)" where
        it names the draft. Save stays `disabled` (Story 4.3 FD4 / 4.16's cross-fade trap).
  - [x] `OrganismEditorModal.test.tsx:108-120`: retarget the Story 4.5 guard — Basic Information
        contains `getByRole('textbox', { name: 'Organism Name' })`, `getByRole('slider', { name:
        'Dominance' })` and `getByRole('textbox', { name: 'Dominance value' })`; the dialog
        contains exactly **two** textboxes and exactly **one** slider (header/footer/other regions
        still cannot smuggle one in). Add: (1) the editor opens at `NEW_ORGANISM_DOMINANCE` on
        both controls (derived); (2) a slider change round-trips through the modal's own state
        (`fireEvent.change` → textbox shows the value); (3) typing into the textbox moves the
        slider. The existing axe test scans the control for free — do not duplicate it.
  - [x] `OrganismLibrary.test.tsx:410-420` ("reopens with an empty … name field — the draft does
        not survive an exit"): extend the same test with one slider change before the exit and
        assert the reopened slider reads `NEW_ORGANISM_DOMINANCE` — the draft's second field must
        not survive either, and this is the only test that goes through the real `mounted` gate.
        No new test file; the existing case grows two lines.

- [x] **Task 7 — e2e against the served static export** (AC: 1, 4, 5, 6, 7, 8)
  - [x] `apps/web/e2e/organisms.spec.ts`: new `test.describe('dominance control (Story 4.6)')`
        after the 4.5 block (`:787-923`), reusing module-scope `openEditor` (`:18-24`) and the
        console/pageerror capture idiom. Import `MAX_DOMINANCE`, `MIN_DOMINANCE`,
        `NEW_ORGANISM_DOMINANCE` from `@gol/domain` — derive every number (the 4.5 review's
        "nothing re-types 50" patch). Locate through the region:
        `dialog.getByRole('region', { name: 'Basic Information' }).getByRole('slider', { name:
        'Dominance' })` and `…getByRole('textbox', { name: 'Dominance value' })`. Tests:
        1. **Opens at the default, both controls, description visible, zero console errors**:
           slider `toHaveValue(String(NEW_ORGANISM_DOMINANCE))`, textbox the same, the
           description text visible, `min`/`max` attributes derived.
        2. **Keyboard operates the slider and the textbox follows**: `slider.focus()`,
           `toBeFocused()`, `press('End')` → both `'100'`; `press('Home')` → both `'1'`;
           `press('ArrowRight')` → `'2'`; `press('ArrowUp')` → `'3'`; `press('ArrowLeft')` →
           `'2'`; `press('ArrowDown')` → `'1'` (the 3.13 e2e at `battleRoute.spec.ts:2316-2345`,
           verbatim shape). Then `press(browserName === 'webkit' ? 'Alt+Tab' : 'Tab')` lands on
           the textbox (the WebKit focus idiom Story 4.1 established in this file).
        3. **Typing syncs live, snaps on commit, rejects non-integers**: `textbox.fill('42')` →
           slider `'42'` without blur; `fill('150')` → slider still `'42'`; `press('Tab')` →
           textbox `'100'`, slider `'100'`; `fill('0')` + `press('Enter')` → both `'1'` and the
           textbox still focused; `fill('5.5')` + `press('Tab')` → both `'1'` (reverted);
           `fill('')` + `press('Tab')` → both `'1'`. `fill()` on a `type="text"` input works with
           any string — on `type="number"` Playwright throws `Cannot type text into
           input[type=number]` for `'5.5'`-adjacent cases like `'abc'`, which is one of FD2's
           reasons.
        4. **Slider drag path**: `slider.fill('77')` (Playwright sets a range's value and
           dispatches `input`/`change` — the 3.13 idiom) → textbox `'77'`.
        5. **axe after a keyboard move**, at the project's default viewport: `AxeBuilder` after
           step 2's `End` (no transition on the control, so no extra wait beyond `openEditor`'s
           settle) → `[]`. This is the scan that measures the description's `--gol-text-tertiary`
           on `--gol-bg-secondary` and the 16px/600 value text on `--gol-bg-hover` for real.
        6. **Descriptions are associated**: both controls' `aria-describedby` resolve
           (`[id="…"]` selector — `useId` ids carry colons) to the description text.
  - [x] Keep every 4.1–4.5 assertion verbatim; no earlier block is edited.

- [x] **Task 8 — Bundle measurement, docs, verification** (AC: 9)
  - [x] Measure before (on `main`) and after Task 7; record all four routes and the editor
        chunk's gzip size in the Dev Agent Record. Do **not** edit `budgetGzipKb`.
  - [x] `deferred-work.md`: add `## Deferred from: Story 4-6-dominance-control (2026-09-15)`
        with: (1) **the mockup's `<input type="number">` is not reproduced** — `type="text"
        inputMode="numeric"` (FD2), a mockup-refresh note, not a behaviour change; (2) **the
        mockup's Color-before-Dominance order** — Story 4.8 mounts the picker between name and
        dominance in the `basicInfo` fragment (a pointer for 4.8, not a divergence); (3)
        **`parseDominanceText` / `clampDominance` are dominance-named** — Story 4.11's numeric
        condition inputs generalise them to `integerInput.ts` when they become the second caller;
        (4) **Story 4.13's "numeric invalidity"** — the dominance draft is always valid by
        construction, so that AC's item refers to 4.11's condition inputs; 4.13 should confirm and
        not add a dominance gate; (5) **Story 6.9's default-speed setting and 3.16's Grid Size
        slider** now have two native-range precedents (`SpeedControl.tsx`, `DominanceField.tsx`)
        with one thumb glow token between them — whichever lands the `<LadderSlider>` decision
        (3.13's deferred item) decides whether the glow is the house thumb.
  - [x] `docs/project-context.md` — **no new rule**: nothing here is a compiles-and-is-wrong
        trap; the native-range decision is recorded in 3.13's and this story's code headers.
  - [x] `npm run ci > ci.log 2>&1; echo $?` — paste the exit code, the bundle lines, the domain
        coverage line (must still read 100 / 100) and the e2e summary into the Dev Agent Record.
        ⚠️ `deferred-work.md:1008-1016` records that the LOCAL four-project matrix exits 1 on a
        pre-existing Story 3.12 e2e (macOS WebKit `Tab` → `<body>`); if that is what fails, say
        so with the test name and confirm the remote run instead — never "fix" it here. Push to
        `story/4-6-dominance-control`; check `gh run list --limit 1` after the PR opens.

## Dev Notes

### Forced decisions (made here so the dev agent does not have to)

- **FD1 — A native `<input type="range">`, not MUI `<Slider>`, following Story 3.13.** 3.13
  (`SpeedControl.tsx`, in review on `story/3-13-speed-control` at the time of writing — on `main`
  once #40 merges) is the app's first slider and settled the idiom on three facts that hold here
  unchanged: MUI's `Slider` pulls a new module into the route (AR-35); its DOM (`<span
  role="slider">` over a hidden input) matches no mockup locator; and under `cssVariables: true`
  MUI emits `--mui-palette-Slider-primaryTrack: var(--gol-accent)` so the inactive rail is
  invisible until someone authors a shade token and a `styleOverride` (`deferred-work.md:87`,
  `theme.ts:118-125`). Its header says in so many words "4.6 and 6.9 should follow it too". Both
  mockups (`petri-dish-play-mode.html:652`, `organism-editor.html:959`) are native ranges. Native
  gives `role="slider"`, `aria-valuemin/max/now`, arrows/Home/End/PageUp/PageDown for free, and a
  `value` that the browser clamps to `min`/`max` and snaps to `step` before `input` fires. The
  styled blocks are **copied**, never imported — `battle/simulation/` and `organisms/editor/` do
  not reach across (`project-context.md`); the `<LadderSlider>` promotion question is 3.16's
  (`deferred-work.md`, the 3-13 section) and a continuous 1–100 slider is not a ladder anyway.

- **FD2 — The numeric input is `type="text" inputMode="numeric"`, not the mockup's
  `type="number"`.** Four facts: (1) a number input's `.value` is the *sanitised* value — `5.`
  reads as `''`, `abc` reads as `''` — so a controlled React input holds a state that disagrees
  with what is on screen, and "non-integers are rejected" cannot be asserted against what the
  user typed; (2) Playwright's `fill()` throws `Cannot type text into input[type=number]` for
  non-numeric strings, so the AC's rejection path would be untestable e2e; (3) the Basic
  Information column is a scroll container (Story 4.4 FD2), and a focused number input consumes
  wheel events as value changes on some engines — a silent dominance change while scrolling the
  column; (4) Firefox lets any text be typed into a number input and merely flags `badInput`. A
  text input with `inputMode="numeric"` shows a numeric keyboard on touch, gives the parser the
  exact keystrokes, and keeps `getByRole('textbox')` the locator. The keyboard-stepping the
  number type would have offered is the slider's job (AC6); no `role="spinbutton"` is claimed,
  because that role obliges the APG arrow-key contract this story does not implement.

- **FD3 — Live in range, snap on commit, revert on invalid; the buffer is `string | null`.** The
  numeric input holds `text` only while the user is editing (`null` otherwise, when it renders
  `String(value)` and follows the slider with no effect). An in-range integer commits on the
  keystroke — that is what "in sync both ways" means, and it matches the mockup's `input`-event
  sync (`organism-editor.html:1286-1294`). Out-of-range integers wait for blur/Enter and then
  snap: snapping live would turn a typed `0` (en route to nothing useful, but still) into `1` and
  the next keystroke into `15`, and holding is what every engine's own number input does. Invalid
  text never reaches the draft; on commit the field reverts, silently — the design doc lists
  auto-correction for this field and no message (`organism-editor-design.md:759-761`), and a red
  state for a value that cannot be saved wrong would be an error with no remedy to name.

- **FD4 — The draft is the only holder and is valid by construction.** `dominance` joins
  `OrganismDraft` (Story 4.5 FD3's one-object-per-editor rule); both controls are thin controlled
  views over it; `clampDominance` runs before every commit. Consequences the later stories rely
  on: 4.13's Save gate has no dominance check to write; 4.16 parses a draft whose `dominance`
  already satisfies `OrganismSchema`; 4.17 seeds the draft from a loaded record and both controls
  show it with no clamp on display; 4.23 diffs `dominance` against its seed like any other field.

- **FD5 — The thumb glow is an authored token, `--gol-shadow-slider-thumb`.** The mockup's
  `box-shadow: 0 0 8px rgba(0, 212, 255, 0.3)` is this control's (3.13 declined it because its
  own mockup has none). AR-46 bans the literal in a component; `--gol-shadow-tile-hover` and
  `--gol-accent-tint` are the precedent for composing a translucent accent from
  `--gol-accent-channel` in `themes.css`. One line, hex-free, so `themeTokens.test.ts` needs
  nothing. `lib/theme.ts` is untouched.

- **FD6 — Names: the label owns the slider; the textbox gets `aria-label="Dominance value"`.** A
  `<label for>` can name one control. The slider is the AC's primary ("a 1–100 slider and an
  editable numeric input"), so it takes the visible label, exactly as 3.13's label does.
  The textbox has no visible label of its own — its visible context IS "Dominance" — so an
  `aria-label` is not the "second, overriding name" Story 4.5 AC5 refused; it is the only name,
  and "Dominance" is contained in it (SC 2.5.3). `aria-labelledby={labelId}` on both would give
  two controls the identical name and leave role as the only differentiator. The "1"/"100" marks
  are decorative (the slider exposes its own bounds) and `aria-hidden`, 3.13 trap 5.

### What exists — read these before writing a line

| File | Why it matters here |
|---|---|
| `apps/web/components/battle/simulation/SpeedControl.tsx` (on `story/3-13-speed-control`, or `main` once merged) | **The slider precedent.** Its header lists the three facts against MUI Slider and names 4.6 as a follower; copy the `Slider` styled block (track/thumb/`::-moz-range-track`/focus ring) and swap in the editor mockup's thumb. **Copy, never import.** |
| `apps/web/components/battle/simulation/SpeedControl.test.tsx` | `fireEvent.change` for a range in jsdom (trap 2), the controlled-not-`defaultValue` test (trap 9), the `getByLabelText` ↔ `<label for>` assertion, the axe series with `unmount`. |
| `apps/web/e2e/battleRoute.spec.ts:141-145, 2316-2345, 2370-2390` | The slider locator by name, the End/Home/Arrow keyboard test verbatim, and `slider.fill('4')` as the drag stand-in. |
| `apps/web/components/organisms/editor/OrganismNameField.tsx` | `Field`, `Label` rule sets to copy; the `useId` + `aria-describedby` discipline; the `ControlledHarness` shape in its test; FD5's no-transition rule. |
| `apps/web/components/organisms/editor/OrganismEditorModal.tsx:7-12, 135-150, 163-166, 224` | **The file being modified**: import block reasoning, the doc block to extend, the draft `useState` + `setName` (add `setDominance`), the `basicInfo` mount that becomes a fragment. Everything else stays. |
| `apps/web/components/organisms/editor/OrganismEditorModal.test.tsx:108-120, 122-140, 147-` | The "exactly one textbox" guard to retarget to two textboxes + one slider; the round-trip test shape; the axe test that now covers the control. |
| `apps/web/components/organisms/OrganismLibrary.test.tsx:409-425` | The only test that reopens through the real `mounted` gate — extend it with a slider change. |
| `apps/web/lib/organisms/organismDraft.ts` (+ test) | Grows `dominance`; update the "grows one field per story" list. |
| `apps/web/lib/organisms/organismName.ts` | The pure-validator-in-`lib` precedent `dominance.ts` mirrors (header reasoning, default-from-constant params). |
| `apps/web/components/organisms/editor/OrganismEditorLayout.tsx:45-53, 175-197` | The `basicInfo` slot. **Read, do not modify.** |
| `apps/web/lib/organisms/useOrganismEditorModal.ts` | **Read, do not modify** — `OrganismEditorModalProps` unchanged. |
| `apps/web/components/organisms/OrganismLibrary.tsx:30, 229, 321` | The `dynamic()` boundary. ❌ Never import the field or helpers here. |
| `packages/domain/src/organismSchema.ts:8-14, 36`, `index.ts:4-8`, `organismSchema.test.ts:77-88` | The constant/comment shape to mirror; the bare `1`/`100` to replace; the export list; the boundary tests to derive. |
| `packages/domain/src/defaultWorkspace.ts:70` | `CONWAYS_CLASSIC.dominance: 50` — stays; the comment on `NEW_ORGANISM_DOMINANCE` names the difference. |
| `apps/web/app/themes.css:19-70, 107-120` | Tokens in play (`--gol-bg-hover`, `--gol-border-control`, `--gol-accent`, `--gol-bg-primary`, `--gol-text-tertiary`); the `--gol-shadow-tile-hover` / `--gol-accent-tint` construction the new token copies. |
| `apps/web/lib/themeTokens.test.ts:20-70` | Parses hex tokens only; the `>= 16` floor; why a shadow token needs no row. |
| `apps/web/lib/theme.ts:118-125` and `deferred-work.md:87` | The MUI Slider derived-token trap — the reason FD1 does not render one; leave both unedited. |
| `eslint.config.mjs:18-39` | AR-46: `rgb()/rgba()` literals are lint errors in `.ts/.tsx` — the glow MUST be a token. |
| `docs/planning-artifacts/ux-designs/…/clinical-lab-theme/organism-editor.html:165-170, 390-448, 954-964, 1286-1294` | `.field-description`, the dominance CSS, markup (label, description, range `value="8"`, number input, "1"/"100" labels) and the input-event sync script. `value="8"` is the mockup's sample organism; the new-organism default is 5 (design doc `:529`). |
| `docs/planning-artifacts/ux-designs/…/organism-editor-design.md:209-250, 520-535, 759-761` | Layout sketch, "Default Value: 5 (for new organisms)", "Range: Must be 1-100 / Auto-correct: snap to min/max". No non-integer message exists. |
| `docs/implementation-artifacts/4-5-organism-name-field.md` | FD1–FD6 (refuse/clamp reasoning, draft seam, no transition, `styled('input')` over MUI), the review patches (assert `aria-describedby` exists; derive numbers; exactly-N guards), bundle figures. |
| `docs/implementation-artifacts/3-13-speed-control.md` (on the 3.13 branch) | Traps 2/5/7/9 (jsdom range, aria-hidden marks, `::-moz-range-track`, controlled), the native-range FD, the deferred `<LadderSlider>` item. |
| `docs/implementation-artifacts/deferred-work.md:87, 745-750, 976-1016, 1018-1050` | MUI Slider trap (unchanged); `<OrganismCard>` dominance stat (unrelated, do not touch); the 3.13 sections (local WebKit `Tab` failure in the 3.12 block — pre-existing); the 4.5 sections. |
| `docs/implementation-artifacts/lane-gates.yaml` | 4.15/4.24/4.25 gated on Epic 3; this story's proposed row is at the end of this file. |

### Architecture compliance

- **RFC-005 Decision 1 / Decision 7, AR-33** — `dominance` is ephemeral UI state in the modal's
  draft; no global store, no Context, no repository anywhere in this story (AR-2 / AR-27
  untouched — nothing is persisted; Save stays `disabled`).
- **FR-2.2 / UX-DR8 / UX-DR17** — integer 1–100; slider + synced editable numeric input;
  default 5; out-of-range snaps; non-integers rejected; slider keyboard-operable; ARIA names and
  descriptions.
- **AR-39** — the range constants land in `packages/domain` at 100% per file; parse/clamp live in
  `apps/web/lib/organisms/` (UI input handling, not domain logic — the `organismName.ts`
  placement).
- **AR-35 / bundle** — everything new is reached only through `OrganismEditorModal.tsx`; no new
  MUI module; `@mui/material/styles` is the only MUI import in the field.
- **RFC-003 Decision 3 / Decision J / AR-46** — `styled()` + `var(--gol-*)`; the glow is a token;
  the only literals are sizes (6/20/60px, 8/12/15px, 11/13/16px) from the mockup.
- **NFR-4.1** — no placeholder controls; the control is fully live from this story.
- **SC 1.4.11 / 1.4.3** — track and value-input boundary on `--gol-border-control`; description
  in `--gol-text-tertiary` on `--gol-bg-secondary` (gated pair); value text `--gol-text-primary`
  on `--gol-bg-hover` (gated pair).
- **Spec-id hygiene** — `spec:check` tokenises `FR-2.2`, `FR-1.5`, `NFR-4.1`, `AR-33`, `AR-35`,
  `AR-39`, `AR-46`, `RFC-003`, `RFC-005`, `Story 4.6`, `Story 3.13`, `Story 4.5`, `Story 4.8`,
  `Story 4.11`, `Story 4.13`; write them exactly so. `UX-DR8`, `UX-DR17`, `FD*`, `SC n.n.n` are not
  checked.

### Library / framework notes (installed versions, no research needed)

- **React 19.2** — `onChange` on a range input fires on every `input` event (each pixel of a
  drag); `value={number}` on a range is fine (React stringifies). `useId()` ids contain colons.
- **jsdom (Vitest 4)** — clamps a range value to `min`/`max` but does **not** snap to `step`
  and does **not** step on arrow keys; unit tests write integer strings via `fireEvent.change`
  and leave keyboard semantics to Playwright (3.13's split). `user-event` does not drive range
  inputs.
- **@testing-library/user-event 14.6** — `user.type` / `user.clear` on the text input work
  normally; `user.tab()` triggers blur → the commit path.
- **jest-dom** — `toHaveValue` on a range input returns a **string** in this repo's tests
  (`SpeedControl.test.tsx` asserts `'3'`); on a text input, a string too.
- **Playwright 1.62** — `fill()` on `type="range"` sets the value and dispatches `input` +
  `change`; on `type="text"` it accepts any string; on `type="number"` it throws for non-numeric
  text (FD2). `keyboard.press('End' | 'Home' | 'ArrowRight' …)` drives a focused native range in
  all three engines (3.13 proved it on the four projects). WebKit needs `Alt+Tab` to move focus
  off a control (the 4.1 idiom in this file).
- **axe-core 4.12** — `aria-valid-attr-value` requires every `aria-describedby` id to exist;
  `label` passes for the slider via `<label for>` and for the textbox via `aria-label`;
  `color-contrast` is measured e2e only.
- **MUI 9.3.1 `styled()`** — `styled('input')` forwards `type`, `min`, `max`, `step`,
  `inputMode`, `aria-*`; vendor pseudo-elements (`'&::-webkit-slider-thumb'`, `'&::-moz-range-thumb'`,
  `'&::-moz-range-track'`) work as nested keys — 3.13 shipped exactly this.
- **Zod 4** — `.int()` rejects `5.5`; `.min()/.max()` are inclusive — the same bounds
  `clampDominance` uses.

### Testing standards

- `apps/web` has **no coverage gate** — every test guards a named failure: `type="number"`
  creeping back (b, e2e 3), a live commit of an out-of-range value (g), a non-integer reaching
  the draft (h), a slider that stops following the prop (j), a description id that does not
  resolve (c, e2e 6), the control landing outside Basic Information (modal test), a second field
  surviving a reopen (library test), and a per-keystroke re-render from no-op commits (k).
- `packages/domain` **is** gated at 90% per file and sits at 100% — constants add no branch;
  keep it that way (no helper function in the schema file).
- Never snapshot the control; never assert computed colours in jsdom; never mock `useId`.
- The 4.3/4.4 tests must not be edited; the 4.5 tests are **retargeted** only where this story
  legitimately changes the count (the textbox guard). If any other 4.5 test fails, the mount is
  wrong, not the test.
- Do not add an `afterEach` that sweeps `[aria-hidden]` nodes (`deferred-work.md:785-793`).

### Previous story intelligence (Story 4.5)

- The draft seam is in place: `useState<OrganismDraft>(createNewOrganismDraft)` in the modal,
  functional updates per field, `OrganismEditorModalProps` untouched, fresh draft per open via
  the `mounted` gate. This story adds a field to the type, a line to the factory and a setter to
  the modal — nothing structural.
- 4.5's review patches are this story's habits: assert `aria-describedby` **exists** before
  splitting it; derive every number from the domain export; assert exact counts ("exactly two
  textboxes"), not just presence; test the exact boundaries (1 and 100 are valid, 0 and 101
  snap); pin the on-mount state (opens at 5, no error).
- 4.5 FD5 (no `transition` on a control whose visual state flips) and FD6 (plain `styled('input')`,
  not MUI form components — the theme has no `MuiSlider`/`MuiTextField` overrides and this story
  adds none) carry over verbatim.
- 4.5 measured the editor chunk at **3521 B gzip** and `/organisms` at **295.3 KB**. Expect
  chunk +≈1 KB, routes byte-identical.
- The 4.3 FD1 header/footer divergence is still open (`deferred-work.md:753-767`) — irrelevant
  here; the control goes in the column as the AC says.

### Git intelligence

`main` is at `14ac287` (#39, the `implement-next-story` subtree — no app code changed since 4.5's
merge `b2434c7`). **Story 3.13 is in `review` on `story/3-13-speed-control`** (commit `0596d11`,
"feat: Speed Control (story 3.13)" — `components/battle/simulation/SpeedControl.tsx` + test,
`lib/battle/simulationSpeed.ts`, `BattleSimulationView.tsx`, `battleRoute.spec.ts`, its story
file and `deferred-work.md`). It is the native-range precedent FD1 follows; it touches neither
`theme.ts` nor `themes.css`, so the only file both stories write is `deferred-work.md` (append-only,
the Step S sync rule keeps both hunks). **Shared code surfaces with the open Epic 3 lane
(3.14–3.19): none** — they write `components/battle/**`, `lib/battle/**`, `battleRoute.spec.ts`;
this story writes `components/organisms/editor/**`, `lib/organisms/**`, four lines of
`packages/domain`, one token in `themes.css`, `organisms.spec.ts` and docs. If 3.13's review
changes the `Slider` block before this story's dev starts, copy the merged version.

### Project Structure Notes

- New: `components/organisms/editor/DominanceField.tsx` (+ `.test.tsx`),
  `lib/organisms/dominance.ts` (+ `.test.ts`).
- Modified: `components/organisms/editor/OrganismEditorModal.tsx` (+ test),
  `components/organisms/OrganismLibrary.test.tsx` (one test extended),
  `lib/organisms/organismDraft.ts` (+ test), `packages/domain/src/organismSchema.ts` (+ test),
  `packages/domain/src/index.ts`, `apps/web/app/themes.css` (one token), `e2e/organisms.spec.ts`,
  `docs/implementation-artifacts/deferred-work.md`, `sprint-status.yaml`.
- Naming: component PascalCase `.tsx`; non-component TS camelCase, never dotted (`dominance.ts`);
  constants SCREAMING_CASE (`MIN_DOMINANCE`, `MAX_DOMINANCE`, `NEW_ORGANISM_DOMINANCE`);
  helpers `parseDominanceText` / `clampDominance` / `isDominanceInRange`; token
  `--gol-shadow-slider-thumb`.
- Untouched on purpose: `OrganismEditorLayout.tsx` (+ test), `useOrganismEditorModal.ts` (+
  test), `OrganismLibrary.tsx`, `OrganismCard.tsx`, `lib/theme.ts`, everything under
  `components/battle/`, `packages/persistence`, `playwright.config.ts`,
  `scripts/check-bundle-size.mjs` budgets, `docs/project-context.md`, `deferred-work.md:87`.

### What NOT to build

- ❌ No MUI `<Slider>`, no `MuiSlider` theme override, no `<TextField>`.
- ❌ No `role="spinbutton"` and no arrow-key stepping on the textbox — that is the slider's job.
- ❌ No error message, red border or `role="alert"` for dominance — the draft is always valid.
- ❌ No Save enablement, no persistence, no aging toggle, no colour picker (4.7/4.8/4.16).
- ❌ No shared `<LadderSlider>` / `<RangeSlider>` primitive across `battle/` and `organisms/` —
  3.16's decision, and crossing the mode split is a design change.
- ❌ No `deferred-work.md:87` edit — the MUI Slider trap is still unresolved because still unused.

### References

- `docs/planning-artifacts/epics.md:1053-1064` (Story 4.6 ACs), `:44` FR-2.2, `:233` UX-DR8,
  `:242` UX-DR17, `:1078-1089` (4.8 — inserts Color above Dominance), `:1115-1126` (4.11 — the
  next numeric inputs), `:1140-1151` (4.13 — "numeric invalidity"), `:1177-1187` (4.16),
  `:1189-1200` (4.17 — seeds the draft), `:1264-1275` (4.23).
- `docs/planning-artifacts/prds/prd-GameOfLife-2026-05-26/prd.md:141` (Conway's 50), `:168-170`
  (FR-2.2), `:358-362` (how dominance resolves conflicts — the "higher wins" the description
  states).
- `docs/planning-artifacts/rfcs/RFC-003-frontend-ui-architecture.md:57, 68, 82` (the component
  catalog lists Slider — an inventory, not a mandate; FD1 records why native), `:167-179`
  (Decision 3 — `styled()`); `RFC-005-application-state-modes-undo.md:15, 57, 281-296`.
- `docs/planning-artifacts/architecture.md:356` (M10 — Dominance decides Phase 2 claims; the
  value this control edits).
- `docs/planning-artifacts/ux-designs/ux-GameOfLife-2026-05-27/organism-editor-design.md:209-250,
  529, 759-761`; `clinical-lab-theme/organism-editor.html:165-170, 390-448, 954-964, 1286-1294`;
  `clinical-lab-theme/petri-dish-play-mode.html:272-297, 652` (the other native range).
- `docs/implementation-artifacts/4-5-organism-name-field.md` (FD1–FD6, review findings);
  `3-13-speed-control.md` (FD1, traps 2/5/7/9); `4-4-three-column-responsive-layout.md` (FD2 —
  the column scrolls; FD6 — slots).
- `docs/implementation-artifacts/deferred-work.md:87, 745-750, 785-793, 976-1016, 1018-1050`.
- `docs/implementation-artifacts/lane-gates.yaml`.
- `docs/project-context.md` — Framework rules (three state categories, components split by mode,
  no repository import, `styled()` + tokens), Testing rules (axe, never snapshot, no coverage
  padding, Playwright viewport band), Code Quality (AR-46, `spec:check`, camelCase files, comments
  explain why), Commit gate.

## Dev Agent Record

### Agent Model Used

claude-sonnet-5 (dev-story)

### Debug Log References

- `packages/domain`: `npx vitest run --coverage` → 6 files, 104 tests, 100/100/100/100 (unchanged
  gate, constants add no branch).
- `apps/web`: `npx vitest run --coverage` (via `npm run test:coverage`) → 84 files, 1254 tests
  passed; no regressions in any 4.3/4.4/4.5 test.
- `npm run typecheck` — 5/5 packages, clean (no errors).
- `npm run lint` — 0 errors, 1 pre-existing unrelated warning (`BattleGallery.tsx` exhaustive-deps,
  not touched by this story).
- `npm run format:check` — clean.
- `npm run spec:check` — 243/243 cited ids resolve.
- `npm run boundary:check` — 7 escape shapes rejected, 2 legitimate imports accepted (unchanged).
- Bundle (`npm run build:standalone && npm run bundle:check`):
  - Before, measured on `main` (`14ac287`) in an isolated worktree: `/organisms` 295.3 KB gzip
    (budget 305), editor chunk N/A pre-4.6.
  - After: `/organisms` **295.3 KB gzip** — byte-identical (0.0 KB move, well within the ±0.5 KB
    noise band). `home` 333.4 KB (budget 340), `battle` 308.6 KB (budget 310), `battle/new`
    308.6 KB (budget 310) — all unchanged and within budget. The lazy editor chunk (containing
    `DominanceField` + `dominance.ts`, located by grepping the built chunks for "Dominance
    value") is **4216 B gzip**, up from 4.5's measured 3521 B (+695 B, ≈+0.68 KB — matches the
    Dev Notes' "expect chunk +≈1 KB, routes byte-identical").
- `npm run bench` + `npm run bench:check` — 100×60×20 frame 6.125 ms mean against the 16.667 ms
  budget (10.5 ms / 63% headroom); untouched by this story (no engine changes). No budget raised.
- `npm run e2e` (local four-project matrix: chromium, firefox, webkit, tablet) — 534 passed,
  2 failed, `npm run ci`'s combined exit code **1**. Both failures are
  `battleRoute.spec.ts:2208` "Transport controls (Story 3.12) › Tab reaches Play, Next cycle,
  Stop & reset in order …" on `[webkit]` and `[tablet]` only — the pre-existing, CI-green,
  macOS-WebKit-only `Tab`-to-`<body>` failure recorded on the (not-yet-merged) `story/3-13-speed-
  control` branch's `deferred-work.md` as reproducing on the untouched baseline `14ac287`. Every
  one of this story's own tests — including all 24 "dominance control (Story 4.6)" e2e instances
  (6 tests × 4 projects) and the retargeted 4.5 block — passed on every project. Not "fixed"
  here per the story's own instruction; will be checked on the remote gate after push
  (`gh run list`).
- `npm run ci` reproduces the same single stage failure (`web#e2e`), for the same two pre-existing
  cases, with every earlier stage (typecheck → lint → format:check → spec:check →
  boundary:check → test:coverage → build:standalone → bundle:check → bench → bench:check) green.

### Completion Notes List

- Domain constants `MIN_DOMINANCE` (1), `MAX_DOMINANCE` (100), `NEW_ORGANISM_DOMINANCE` (5) added
  to `organismSchema.ts`/`index.ts`; `OrganismSchema.dominance` now reads the first two. Schema
  tests derive the boundary cases from the constants and pin all three numbers once.
  `defaultWorkspace.test.ts` (`CONWAYS_CLASSIC.dominance` = 50) left unchanged, as designed.
- Pure `parseDominanceText` / `clampDominance` / `isDominanceInRange` helpers added in
  `apps/web/lib/organisms/dominance.ts`, fully unit-tested (19 cases) including the 400-digit /
  `Infinity` edge.
- `OrganismDraft` grows `dominance`, seeded at `NEW_ORGANISM_DOMINANCE`, via a functional
  `setDraft` update mirroring `setName`.
- `<DominanceField>` built as a native `<input type="range">` + `type="text" inputMode="numeric"`
  pair (FD1/FD2), following Story 3.13's `SpeedControl.tsx` `Slider` block (copied, not imported)
  with the editor mockup's own thumb (glow via the new `--gol-shadow-slider-thumb` token, FD5).
  Behaviour matches FD3 exactly: live commit while in range, snap-on-commit (blur/Enter) when out
  of range, silent revert on non-integer/empty text, guarded against no-op `onChange` calls.
  21 unit tests cover cases (a)–(m) from the story's test list, plus the axe series.
- Mounted in `<OrganismEditorModal>` directly under `<OrganismNameField>` in the `basicInfo`
  fragment; `OrganismEditorModal.test.tsx`'s "exactly one textbox" guard retargeted to "exactly
  two textboxes and one slider", plus new mount/round-trip/default-value assertions.
  `OrganismLibrary.test.tsx`'s real-`mounted`-gate reopen test extended to prove `dominance` does
  not survive an exit either.
- e2e: new `dominance control (Story 4.6)` describe block in `organisms.spec.ts` (6 tests), every
  number derived from `@gol/domain`, locating both controls through the Basic Information region;
  all 4.1–4.5 blocks kept verbatim.
- `themes.css` gained one token (`--gol-shadow-slider-thumb`); `lib/theme.ts` and
  `deferred-work.md:87`'s MUI-Slider entry left untouched, as specified.
- `deferred-work.md` gained a `Story 4-6-dominance-control` section recording the five items the
  story's Task 8 calls out (FD2's type divergence, the mockup's Color-before-Dominance order,
  the dominance-named helpers awaiting a second caller, Story 4.13's Save-gate scope, and the
  shared native-range/thumb-glow precedent question for 3.16/6.9).
- All 8 tasks / 31 subtasks complete; every AC (1–9) satisfied and independently verifiable per
  its own test(s).

### File List

**New:**
- `apps/web/components/organisms/editor/DominanceField.tsx`
- `apps/web/components/organisms/editor/DominanceField.test.tsx`
- `apps/web/lib/organisms/dominance.ts`
- `apps/web/lib/organisms/dominance.test.ts`

**Modified:**
- `apps/web/components/organisms/editor/OrganismEditorModal.tsx`
- `apps/web/components/organisms/editor/OrganismEditorModal.test.tsx`
- `apps/web/components/organisms/OrganismLibrary.test.tsx`
- `apps/web/lib/organisms/organismDraft.ts`
- `apps/web/lib/organisms/organismDraft.test.ts`
- `packages/domain/src/organismSchema.ts`
- `packages/domain/src/organismSchema.test.ts`
- `packages/domain/src/index.ts`
- `apps/web/app/themes.css`
- `apps/web/e2e/organisms.spec.ts`
- `docs/implementation-artifacts/deferred-work.md`
- `docs/implementation-artifacts/sprint-status.yaml`

### Change Log

- 2026-09-15 — Story file created (create-story): ACs decomposed, FD1–FD6 recorded, precedent
  and spec map compiled; status → ready-for-dev.
- 2026-09-15 — Implemented (dev-story): all 8 tasks / 31 subtasks complete, all ACs satisfied;
  `npm run ci` green except the pre-existing, documented Story 3.12 local-WebKit/tablet `Tab`
  failure (reproduces on untouched `main`); bundle byte-identical on `/organisms` (295.3 KB);
  status → review.

Dev Model: sonnet   # follows patterns that already exist — 3.13's native-range slider block, 4.5's draft seam and lib-validator idiom — with the one new behaviour (numeric-text commit semantics) fully pinned in FD3 and the test list
Proposed lane gate: story: 4-6-dominance-control / requires: 3-13-speed-control / why: 3.13 is the app's first range slider and its header names 4.6 as a follower of its native-range idiom (the Slider styled block, fireEvent.change and keyboard-e2e patterns); if 3.13's review reshapes that block after 4.6 copies it, the two sliders diverge on main — soft gate, decline if 3.13 merges before 4.6's dev step starts
