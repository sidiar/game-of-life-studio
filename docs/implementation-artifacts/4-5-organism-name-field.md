---
baseline_commit: c8ffa1b
---

# Story 4.5: Organism Name Field

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a user,
I want to name my organism,
so that I can identify it across the library and battles.

## Acceptance Criteria

From `epics.md#Story 4.5: Organism Name Field` (`:1041-1051`), decomposed into what a reviewer can
check independently. AC6–AC8 are repo-derived: the obligations the shipped shell (Story 4.3), the
layout's slot contract (Story 4.4), the domain package's coverage gate and the CI gates already
impose on "the first story that puts a control inside the editor".

1. **The Basic Information column renders a labelled, required text input for the organism's
   name, with a live "N / 50" character count.** `<OrganismNameField>` (new,
   `components/organisms/editor/`) mounts through `<OrganismEditorLayout basicInfo={…}>` — the
   named slot Story 4.4 built for exactly this, never a fourth region and never a child of the
   layout. Visible `<label for>` "Organism Name", placeholder "e.g., Aggressive Colonizer",
   `aria-required="true"` (mockup `organism-editor.html:912-916`, design doc
   `organism-editor-design.md:129-159`). The counter reads `{value.length} / {maxLength}` in UTF-16
   code units — what `OrganismSchema.name`'s `.max()` counts — and updates on every keystroke
   (settles `deferred-work.md:29`, which names this story). (FR-2.1, UX-DR14)

2. **The cap is `MAX_ORGANISM_NAME_LENGTH`, exported from `@gol/domain`, and nothing re-types
   `50`.** `packages/domain/src/organismSchema.ts` gains the constant and `OrganismSchema.name`
   reads it (`z.string().max(MAX_ORGANISM_NAME_LENGTH)`); `index.ts` exports it; the field's
   `maxLength` prop defaults to it. The schema's boundary test asserts against the constant, plus
   one new test that exactly `MAX_ORGANISM_NAME_LENGTH` characters is accepted. `packages/domain`
   stays at 100% per file. ❌ No `.min(1)` on the schema — `deferred-work.md:97` assigns that
   persisted-shape change to Stories 5.7/5.8; "required" is enforced by the editor (this story's
   error state, Story 4.13's Save gate), not by the parse. (FR-2.1, AR-39)

3. **Empty and over-limit input show the inline error style below the field.** Two messages,
   copied from `organism-editor-design.md:751-753`: `Organism name is required` (value is empty or
   whitespace-only) and `Name cannot exceed 50 characters` (`value.length > maxLength`, the number
   interpolated from the constant). The error state is: `aria-invalid="true"` on the input, the
   input's border `--gol-danger`, an error line under the field in `--gol-danger` with an
   `aria-hidden` ⚠ glyph, and the counter itself turning `--gol-danger` when over the limit (design
   doc `:772-777` — "red text and warning icon", "red border on invalid field"). The required
   error appears only once the field has been **edited** (FD2 — a fresh editor does not open red);
   the over-limit error appears the moment the value exceeds the cap. Save-triggered display,
   focus-to-first-invalid and the summary announcement remain Story 4.13's. (UX-DR14)

4. **Over-limit is reachable: there is no native `maxLength` attribute and no clamp** (FD1).
   The field is the *refuse* form, not Story 2.11's *clamp* form: typing a 51st character is
   accepted and shown as an error, so the AC's "over-limit … shows the inline error" and 4.13's
   "name missing/over-limit … When Save is attempted" are both reachable states rather than dead
   text. The mockup's `maxlength="50"` attribute (`organism-editor.html:915`) is deliberately not
   reproduced and the divergence is recorded in `deferred-work.md`. (FR-2.1, UX-DR14)

5. **The field's accessible name comes from its `<label>`, and its error is programmatically
   associated.** `getByRole('textbox', { name: 'Organism Name' })` resolves through `<label
   htmlFor={inputId}>` — no `aria-label` (it would be a second, overriding name for a control that
   already has a visible one; SC 2.5.3). `aria-describedby` lists the counter id always and the
   error id in addition while an error is visible (error first, so it is read first). The error
   line is `role="alert"` and exists **only while an error is visible** — mounted once per
   transition, so it announces on arrival and never per keystroke (the `<CapNotice>` reasoning,
   `BattleNameField.tsx:152-169`; FD4). The counter stays `aria-describedby`-only, never live
   (Story 2.11 FD4). Keyboard: Tab reaches the input, typing edits it, nothing else is needed.
   (UX-DR17)

6. **The editor's draft state exists, and it lives in the shell.** `<OrganismEditorModal>` owns
   `useState<OrganismDraft>` seeded by `createNewOrganismDraft()` (new,
   `lib/organisms/organismDraft.ts`, FD3) and passes `value`/`onChange` to the field — the field
   is fully controlled, exactly like `<BattleNameField>`. A fresh draft per open comes free from
   `<OrganismLibrary>`'s `mounted` gate (the modal is unmounted after every exit) — ❌ no reset
   effect, no `key` trick. `OrganismEditorModalProps` is **unchanged**, so
   `useOrganismEditorModal.ts` and its `import type` seam are untouched. (RFC-005 Decision 1 and
   Decision 7 — ephemeral UI state, local to the modal; AR-33's editor-scoped dirty flag is
   Story 4.23's and will diff *this* draft against its seed.)

7. **axe passes with the field in every state, in jsdom and in the served app.** vitest-axe on
   `<OrganismNameField>` clean / with the required error / with the over-limit error → `[]`, and on
   `<OrganismEditorModal open origin="library">` → `[]`; `@axe-core/playwright` on `/organisms`
   with the dialog open and the **over-limit error visible** → `[]` (this is the scan that
   measures `--gol-danger` text on `--gol-bg-secondary` for real: 4.90:1 — it clears 4.5, and it
   is the only background the error line may ever sit on; `deferred-work.md:305` records the same
   token at 4.48:1 on `--gol-bg-hover`, which is why nothing danger-coloured goes *inside* the
   input). No `transition` on the input (FD5). Existing guards are retargeted, never loosened:
   `OrganismEditorLayout.test.tsx` is **not edited** (the layout still renders no slot content of
   its own); `OrganismEditorModal.test.tsx` keeps all 11 assertions and gains the field checks;
   the four e2e blocks in `organisms.spec.ts` stay verbatim. (AR-44, UX-DR17)

8. **The bundle gate passes and `/organisms`'s first load does not move.** `npm run
   build:standalone` + `node scripts/check-bundle-size.mjs` before (on `main`, `c8ffa1b`) and
   after. The field, the validator and the draft factory are imported **only from
   `OrganismEditorModal.tsx`**, so they land in the lazy editor chunk (`2819 B` gzip after 4.4)
   and `/organisms` (budget 305, baseline **295.2 KB**) stays within ±0.5 KB noise. A move of
   ≳ +1 KB on `/organisms` means one of the three new modules was imported from
   `OrganismLibrary.tsx`, `useOrganismEditorModal.ts` or another first-load file — a finding, not a
   number to nudge. **No budget is raised.** `npm run ci` green locally (exit code captured to a
   file, never piped) and CI on the pushed branch checked with `gh run list --limit 1`, not
   inferred.

## Tasks / Subtasks

- [x] **Task 1 — The cap becomes a domain constant** (AC: 2)
  - [x] `packages/domain/src/organismSchema.ts`: above `OrganismSchema`, `export const
        MAX_ORGANISM_NAME_LENGTH = 50;` with a comment in the shape of `battleSchema.ts:14-18`:
        cite `(FR-2.1)` and name UX-DR14 in prose (it is not a `spec:check` id); the single
        source; `apps/web`'s `<OrganismNameField>` imports it rather than re-typing `50`;
        `battleSchema.ts` already records that the mockup's "/ 50" belongs to organism names.
        `name: z.string().max(MAX_ORGANISM_NAME_LENGTH)`. Nothing else in the schema changes.
  - [x] `packages/domain/src/index.ts`: `export { OrganismSchema, EditableGridPresetSchema,
        MAX_ORGANISM_NAME_LENGTH } from './organismSchema';`.
  - [x] `organismSchema.test.ts:53-55`: the rejection test builds its name from the constant
        (`'x'.repeat(MAX_ORGANISM_NAME_LENGTH + 1)`); add `accepts a name of exactly
        MAX_ORGANISM_NAME_LENGTH characters` and `MAX_ORGANISM_NAME_LENGTH is 50` (pins the number
        the UX spec states, so a drift fails here and not in a counter). No `.min(1)` test — there
        is no `.min(1)`.

- [x] **Task 2 — `validateOrganismName` and the draft factory** (AC: 3, 6)
  - [x] `apps/web/lib/organisms/organismName.ts` (pure, no React, no DOM):
        ```ts
        import { MAX_ORGANISM_NAME_LENGTH } from '@gol/domain';
        export const ORGANISM_NAME_REQUIRED = 'Organism name is required';
        export function organismNameTooLong(maxLength: number): string {
          return `Name cannot exceed ${maxLength} characters`;
        }
        /** `null` when valid. Length is UTF-16 code units — what `OrganismSchema.name.max()` counts. */
        export function validateOrganismName(
          name: string,
          maxLength: number = MAX_ORGANISM_NAME_LENGTH,
        ): string | null
        ```
        Order: too-long first (a 60-space string is over-limit, not "required"), then
        `name.trim().length === 0` → required. ⚠️ `trim()` is for the *required* check only — the
        stored value is never trimmed here (Story 4.16 decides what it persists). Header comment:
        Story 4.13 calls this same function for the Save gate and focus-to-first-invalid, so the
        field and the gate cannot disagree.
  - [x] `organismName.test.ts`: `''` and `'   '` → required; `'a'`, exactly `maxLength` chars →
        `null`; `maxLength + 1` → the too-long message with the number interpolated; a
        `maxLength + 1`-unit string made of emoji (surrogate pairs) → too-long (code units, not
        code points — the `deferred-work.md:29` case); default `maxLength` is
        `MAX_ORGANISM_NAME_LENGTH` (derive the assertion from the export, never `50`).
  - [x] `apps/web/lib/organisms/organismDraft.ts` (FD3):
        ```ts
        import type { Organism } from '@gol/domain';
        /**
         * The editor's unsaved organism (RFC-005 Decision 1: ephemeral UI state, local to the modal).
         * Grows one field per story — 4.6 `dominance`, 4.7 `agingEnabled`, 4.8 `colorToken`, 4.10
         * `survivalRules` — until it is `Omit<Organism, 'id' | 'schemaVersion'>` and Story 4.16 parses
         * it into an `Organism`. Story 4.17 seeds it from a loaded record; Story 4.23 diffs it
         * against that seed for the editor's own dirty scope (AR-33).
         */
        export type OrganismDraft = Pick<Organism, 'name'>;
        export function createNewOrganismDraft(): OrganismDraft {
          return { name: '' };
        }
        ```
        `organismDraft.test.ts`: a fresh draft has `name: ''`; two calls return distinct objects
        (the seed must never be shared between opens). Mirror of `lib/battle/newBattleDraft.ts`.

- [x] **Task 3 — `<OrganismNameField>`** (AC: 1, 3, 4, 5, 7)
  - [x] `apps/web/components/organisms/editor/OrganismNameField.tsx` — `'use client'`; `styled`
        from `@mui/material/styles` only; `useId`, `useState` from React; imports
        `MAX_ORGANISM_NAME_LENGTH` from `@gol/domain` and `validateOrganismName` from
        `@/lib/organisms/organismName`. ❌ No `@mui/material/TextField` / `FormControl` /
        `FormHelperText` / `InputLabel` (FD6). ❌ No `<form>` (Story 2.11 FD5 — implicit submit on
        Enter under `output: 'export'` is a full reload). Props:
        ```ts
        export interface OrganismNameFieldProps {
          value: string;
          onChange(name: string): void;
          /** Defaults to `MAX_ORGANISM_NAME_LENGTH` — the schema's own constant, never a literal. */
          maxLength?: number;
        }
        ```
  - [x] Structure and styles (mockup `organism-editor.html:153-208`, values verbatim; every
        colour a `--gol-*` token — AR-46):
        ```
        <Field>                              div — margin: 0 0 20px 0 (mockup .form-field)
          <Label htmlFor={inputId}>Organism Name</Label>
                                             label — display: block; font-size: 13px; font-weight: 500;
                                             color: var(--gol-text-primary); margin: 0 0 8px 0
                                             (mockup .field-label minus its 20px top margin — the
                                             column description above already carries 20px)
          <Input id={inputId} type="text" value placeholder="e.g., Aggressive Colonizer"
                 aria-required="true" aria-invalid={visibleError !== null}
                 aria-describedby={visibleError ? `${errorId} ${counterId}` : counterId}
                 onChange={…} />
                                             input — COPY `BattleNameField.tsx:20-51`'s `Input` rule
                                             set: width 100%; background var(--gol-bg-hover);
                                             border 1px solid var(--gol-border-control); color
                                             var(--gol-text-primary); padding 12px 14px; font-size
                                             14px; font-family inherit; ::placeholder
                                             var(--gol-text-secondary) @ .8; :focus-visible outline
                                             2px solid var(--gol-accent) / offset -2px.
                                             DROP: `marginBottom`, `transition`, the reduced-motion
                                             block and `:disabled` (FD5; no disabled state here).
                                             ADD: '&[aria-invalid="true"]': { borderColor:
                                             'var(--gol-danger)' } — 4.48:1 on --gol-bg-hover, a
                                             non-text boundary held to 3:1 (SC 1.4.11).
          <Meta>                             div — display: flex; justify-content: space-between;
                                             align-items: baseline; gap: 12px; margin-top: 4px
            {visibleError && <ErrorText id={errorId} role="alert">
                                <span aria-hidden="true">⚠</span> {visibleError}
                             </ErrorText>}
                                             p — margin 0; font-size: 11px; line-height: 1.4; color:
                                             var(--gol-danger); flex: 1; min-width: 0 (a long
                                             message wraps instead of pushing the counter out)
            <CharCount id={counterId} data-over-limit={value.length > maxLength || undefined}>
              {value.length} / {maxLength}
            </CharCount>
                                             div — font-size: 11px; color: var(--gol-text-tertiary);
                                             text-align: right; margin-left: auto; white-space:
                                             nowrap; '&[data-over-limit]': { color: 'var(--gol-danger)' }
        ```
        When there is no error, `<Meta>` holds the counter alone — `margin-left: auto` keeps it
        right-aligned (the mockup's `.char-count`). `data-*` + attribute selector, not a
        `shouldForwardProp` styled prop: the `data-mode-value` idiom `<BattleHeader>` uses.
  - [x] Behaviour:
        ```ts
        const [touched, setTouched] = useState(false);           // FD2
        const error = validateOrganismName(value, maxLength);
        const visibleError = touched ? error : null;
        onChange={(event) => { setTouched(true); onChange(event.target.value); }}
        ```
        `touched` is the component's own ephemeral state (like `<OrganismRoster>`'s search text,
        RFC-005 Decision 1) and flips on the first change event — never on blur, never on mount.
        ❌ No `maxLength` attribute, no `.slice()` (FD1 — the comment on `onChange` must say why
        this differs from `BattleNameField.tsx:129-130`, citing the AC and Story 4.13's gate).
        ❌ No cap notice (`<CapNotice>`): with no UA truncation there is no silent boundary — the
        over-limit error *is* the boundary feedback.
  - [x] Header comment: mockup line refs (`:153-208, 912-916`), design-doc refs (`:129-159,
        751-753, 772-777`), FD1–FD6 in one sentence each, and the ids the modal/e2e depend on. Cite
        `(Story 4.5)`, `(Story 2.11)`, `(Story 4.13)`, `(FR-2.1)`, `(RFC-005)`, `(AR-46)` exactly as
        `spec:check` tokenises them; `UX-DR14`, `UX-DR17`, `FD*`, `SC n.n.n` are not checked.
        `useId()` for both ids (the field is not a singleton the way the dialog title is — Story
        4.11's condition rows and 4.24's battle-origin editor make a second instance plausible).
  - [x] `OrganismNameField.test.tsx` — reuse `BattleNameField.test.tsx`'s `ControlledHarness`
        shape (a real `useState` round trip, never a `vi.fn()` that drops the value — its
        `:9-16` comment says why). Cases, each guarding a named failure:
        (a) `getByRole('textbox', { name: 'Organism Name' })` resolves and `toBeRequired()`; the
            label element's `htmlFor` equals the input id (not merely matching text).
        (b) placeholder is `e.g., Aggressive Colonizer` and the value is `''` on an empty draft.
        (c) counter reads `0 / ${MAX_ORGANISM_NAME_LENGTH}` by default (derived from the export);
            `rerender` with a longer value updates it and the old text is gone.
        (d) `'a\u{1F44D}b'` reads `4 / N` (code units — the `deferred-work.md:29` case).
        (e) **no error on mount**: empty value, `queryByRole('alert')` is `null`,
            `aria-invalid` is `"false"` (or absent), `aria-describedby` is exactly the counter id.
        (f) **required after edit**: type `a`, then Backspace → `getByRole('alert')` has text
            `Organism name is required`, input `toBeInvalid()`, `aria-describedby` starts with the
            alert's id and still contains the counter id; the alert's `id` IS the first token
            (assert the id equality, not just presence — the 4.4 review's `aria-labelledby`
            lesson).
        (g) **over-limit is reachable**: `maxLength={5}`, `user.type` six characters → the input
            holds all six (no truncation — this is the FD1 pin; it FAILS on a `maxLength`
            attribute or a clamp), the alert reads `Name cannot exceed 5 characters`, the counter
            reads `6 / 5` and carries `data-over-limit`.
        (h) **over-limit beats required**: `maxLength={2}`, `'   '` (three spaces) → the too-long
            message, not the required one.
        (i) error clears: from (f), type `b` → no alert, `aria-invalid` false, describedby back to
            the counter alone.
        (j) `onChange` receives the full new value on each keystroke; typed keystrokes accumulate
            through the harness.
        (k) keyboard: `user.tab()` lands on the input, typing edits it (AC5).
        (l) the counter has no `aria-live` and no `role` (it is describedby-only, Story 2.11 FD4);
            the alert is not `aria-live="assertive"` by attribute (role alone carries it — mirror
            `BattleNameField.test.tsx:213`'s shape).
        (m) axe → `[]` in three states: clean, required error visible, over-limit error visible.
        jsdom has no layout: never assert colours, widths or the ⚠ glyph's position.

- [x] **Task 4 — Mount it in the shell** (AC: 6, 7, 8)
  - [x] `OrganismEditorModal.tsx`: `import { useCallback, useState } from 'react'`; static
        relative imports of `./OrganismNameField` and `@/lib/organisms/organismDraft` (this file
        is already inside the lazy chunk — a static import here is correct, the 4.4 reasoning at
        `:7-10`).
        ```ts
        const [draft, setDraft] = useState<OrganismDraft>(createNewOrganismDraft);
        const setName = useCallback((name: string) => setDraft((d) => ({ ...d, name })), []);
        …
        <OrganismEditorLayout basicInfo={<OrganismNameField value={draft.name} onChange={setName} />} />
        ```
        `useState(createNewOrganismDraft)` — the lazy-initialiser form, so the factory runs once
        per mount, not per render. `setName` is a functional update so 4.6's `setDominance`
        sibling cannot clobber it.
  - [x] Update the component doc (`:124-140`): "Holds no state" becomes "holds the editor's
        draft (`OrganismDraft`, RFC-005 Decision 1) and nothing else — no repository call; the
        lifecycle stays `useOrganismEditorModal`'s; a fresh draft per open is the `mounted` gate's
        doing". Keep every other sentence. Save stays `disabled` — FD4 of 4.3 and the cross-fade
        trap in `deferred-work.md:768-775` are Story 4.16's; the name's validity does **not** gate
        Save here.
  - [x] `OrganismEditorModal.test.tsx`: add (1) the Basic Information region contains
        `getByRole('textbox', { name: 'Organism Name' })` and the other two regions contain no
        textbox (`within(region).queryByRole('textbox')` → `null`); (2) typing into it round-trips
        through the modal's own state (`user.type(input, 'Glider')` → `toHaveValue('Glider')` and
        the counter reads `6 / 50`-derived-from-the-constant); (3) the field opens **without** an
        error (`queryByRole('alert')` null). The existing axe test now scans the field for free —
        do not duplicate it. `useOrganismEditorModal.test.tsx` is not touched (no props changed).

- [x] **Task 5 — e2e against the served static export** (AC: 1, 3, 4, 5, 7)
  - [x] `apps/web/e2e/organisms.spec.ts`: new `test.describe('organism name field (Story 4.5)')`
        after the 4.4 block, reusing the module-scope `openEditor` (`:17-22`) and the
        console/pageerror capture idiom (`:31-34`). Locate the field as
        `dialog.getByRole('region', { name: 'Basic Information' }).getByRole('textbox', { name:
        'Organism Name' })`. Tests:
        1. **Labelled, required, counted**: field visible inside the Basic Information region,
           `toHaveAttribute('aria-required', 'true')`, counter `0 / 50` visible; `fill('Aggressive
           Colonizer')` → counter `20 / 50`, no alert, `aria-invalid` not `"true"`. Zero console
           errors.
        2. **Over-limit is an error, not a truncation**: `fill('x'.repeat(51))` → the input holds
           51 characters (`toHaveValue` on the exact string — this FAILS under a `maxlength`
           attribute, which is the point), `getByRole('alert')` reads `Name cannot exceed 50
           characters`, input `aria-invalid="true"`, the counter reads `51 / 50`; then `fill('')`
           → alert reads `Organism name is required`; then `fill('Glider')` → no alert.
        3. **axe with the over-limit error visible** at the project's default viewport:
           `AxeBuilder` after the 4.3 settle (the container-opacity wait in `openEditor` already
           ran; no transition exists on the field, so no extra wait) → `[]`. This is the scan that
           measures danger text on `--gol-bg-secondary` and the danger border on
           `--gol-bg-hover`.
        4. **Counter and error are associated**: read the input's `aria-describedby`, split on
           whitespace, and assert `page.locator('#' + id)` for each — the counter id resolves to
           the `N / 50` text and, with an error visible, the first id resolves to the alert.
           Ids come from `useId()` (`:r1:`-style, colons included) — use `page.locator(`[id="${id}"]`)`
           rather than a CSS `#` selector, which cannot take a colon unescaped.
  - [x] Keep the WebKit `Alt+Tab` branch and every 4.1–4.4 assertion as they are; no test in the
        earlier blocks is edited. `fill()` is used rather than `type()` for the 51-character
        string — Playwright's `fill` sets the value and dispatches `input`, which is exactly the
        bypass path FD1 says must not be clamped.

- [x] **Task 6 — Bundle measurement, docs, verification** (AC: 8)
  - [x] Measure before (on `main`) and after Task 5; record all four routes and the editor
        chunk's gzip size in the Dev Agent Record. Do **not** edit `budgetGzipKb`.
  - [x] `deferred-work.md`: add `## Deferred from: Story 4-5-organism-name-field (2026-09-15)`
        with: (1) **the mockup's `maxlength="50"` attribute is not reproduced** — the AC and
        4.13 make over-limit an error state, so the field refuses rather than clamps (FD1),
        diverging from Story 2.11's ratified clamp on the battle name; the next UX touch should
        either drop the attribute from the mockup or, if the intent was UA truncation, say so and
        this story flips (add `maxLength` + the 2.11 clamp, delete test (g)/e2e 2's exact-value
        assertions — a 10-line change); (2) **`OrganismSchema.name` still admits `''`** — the
        editor is the only "required" gate until 5.7/5.8 (`deferred-work.md:97`); an imported
        file with an empty organism name loads and renders an empty card title today;
        (3) **`role="alert"` per field vs. a Save-time summary** — 4.13 should decide whether the
        per-field alert stays when it adds the summary announcement, or the inline line drops to
        `role="status"` to avoid a double announcement on Save; (4) **the 2026-06-01 mockup
        header shows the organism name as display text** (`organism-editor.html:49-55, 900`) —
        the shell's title is the static "Organism Editor" (4.3 FD1); the story that resolves the
        header/footer divergence (`deferred-work.md:753-767`) decides whether the live draft name
        replaces it.
  - [x] `docs/project-context.md` — **no new rule**: the seam this story adds (draft in the
        modal, validator shared with the Save gate) is recorded in the code's own headers and
        here; nothing in it is a "compiles-and-is-wrong" trap yet. Bump nothing.
  - [x] `npm run ci > ci.log 2>&1; echo $?` — paste the exit code, the bundle lines, the domain
        coverage line (must still read 100 / 100) and the e2e summary into the Dev Agent Record.
        Push to `story/4-5-organism-name-field`; check `gh run list --limit 1` after the PR opens.

### Review Findings

Reviewed on **Fable** against an **Opus** implementation, via three parallel adversarial layers
(Blind Hunter, Edge Case Hunter, Acceptance Auditor); 18 findings dismissed as noise.

- [x] [Review][Patch] The over-limit error waits for `touched`, contradicting the component's own "immediate" claim — a value that arrives over the cap (a seed, a lowered cap) turns the counter red with `aria-invalid="false"` and no alert; and the counter's `overLimit` re-derives a predicate the validator already owns [apps/web/components/organisms/editor/OrganismNameField.tsx:151-154]
- [x] [Review][Patch] No component test at the exact boundary (`value.length === maxLength` is valid, not red, not invalid) and none for the over-limit-on-mount path [apps/web/components/organisms/editor/OrganismNameField.test.tsx]
- [x] [Review][Patch] "A fresh draft per open is the `mounted` gate's doing" is asserted in the modal's doc but no test opens, types, exits and reopens through the real gate [apps/web/components/organisms/OrganismLibrary.test.tsx]
- [x] [Review][Patch] `(attr ?? '').split(/\s+/)` is `['']` for an absent attribute, so every `toHaveLength(1)` on `aria-describedby` passes with the attribute missing [apps/web/components/organisms/editor/OrganismNameField.test.tsx (e)(f)(i)(l), apps/web/e2e/organisms.spec.ts]
- [x] [Review][Patch] AC7 says axe passes "in every state" in the served app, but the only real-browser scan is the over-limit state; the required state (placeholder visible beside the danger border) is never measured [apps/web/e2e/organisms.spec.ts]
- [x] [Review][Patch] "and nowhere else" asserts no textbox in the two other regions only — a second textbox in the header or footer would pass; assert exactly one in the dialog [apps/web/components/organisms/editor/OrganismEditorModal.test.tsx]
- [x] [Review][Patch] `⚠` (U+26A0) is left to the platform's presentation choice; an emoji rendering ignores `--gol-danger`. Pin text presentation with U+FE0E [apps/web/components/organisms/editor/OrganismNameField.tsx:179]
- [x] [Review][Patch] The e2e block re-types `50`/`51` six times while AC2 says nothing re-types `50` and the unit tests derive from `MAX_ORGANISM_NAME_LENGTH` [apps/web/e2e/organisms.spec.ts]
- [x] [Review][Defer] The counter's description is the bare text "0 / 50" — a screen reader announces "zero slash fifty" with no unit [apps/web/components/organisms/editor/OrganismNameField.tsx] — deferred, pre-existing: the same shape `<BattleNameField>` ships (Story 2.11 FD4), so any wording change belongs to both fields at once

## Dev Notes

### Forced decisions (made here so the dev agent does not have to)

- **FD1 — Refuse, don't clamp: no `maxLength` attribute, no `.slice()`.** Story 2.11's FD6 went
  the other way on Sidiar's call (2026-08-28): the battle name is live-bound with no validating
  gate, so the only way to keep the counter honest was to make over-limit unreachable, at the
  accepted cost of silently truncating a paste. The organism editor *has* a gate: Story 4.13's
  Save refuses invalid fields and moves focus to the first one. That is why this story's AC
  (`epics.md:1050`), 4.13's AC (`:1148`) and the design doc (`:751-753`) all enumerate "over-limit"
  as a *displayed error* — a state a clamp makes unreachable and turns into dead text. The
  mockup's `maxlength="50"` (`organism-editor.html:915`) is the designer's shorthand for "≤ 50",
  and it loses to three prose sources that say "show the error". Reversible in ten lines; flagged
  in `deferred-work.md` (Task 6) rather than silently picked.

- **FD2 — The required error waits for the first edit; the over-limit error is immediate.** The
  design doc says "show validation error if empty on save attempt" (`:158`); a fresh editor
  opening red on every field is the hostile form NFR-4.1's "self-explanatory" is not. `touched`
  flips on the first change event — not on blur (tabbing through an untouched field to reach the
  dominance slider is not an error) and not on mount. Over-limit can only arise through a change,
  so it is covered by the same flag. Story 4.13 adds the Save-time override (a `showErrors`-style
  prop that forces `visibleError = error`); it is not added now because nothing would read it
  (4.3's "a prop nothing reads" rule).

- **FD3 — The draft is a typed object in the modal, from the first field.** `useState<OrganismDraft>`
  in `<OrganismEditorModal>` with `OrganismDraft = Pick<Organism, 'name'>` — one cell that grows a
  field per story, not one `useState` per field. Reasons: 4.17 seeds the whole draft from a loaded
  `Organism` in one assignment; 4.23 diffs one object against one seed; 4.16 parses one object.
  Five independent cells would make each of those a five-way merge. The type is a `Pick` of the
  domain entity so the field types are the schema's, never re-declared. The modal, not
  `useOrganismEditorModal`, holds it: the hook is in the first-load chunk and owns lifecycle only,
  and 4.24 reuses that hook over `<BattlePage>` with the same modal. Mirrors
  `lib/battle/newBattleDraft.ts` / `useBattleDraft.ts`'s "one shape, seeded once" reasoning.

- **FD4 — The inline error is `role="alert"`, rendered only while visible; the counter stays
  describedby-only.** An error the user has to fix is the class `<SaveErrorLine role="alert">`
  (`BattleEditorView.tsx:392-400, 460`) already established; the *limit notice* on the battle name
  is `role="status"` because it reports an enforced cap, not a fault (`BattleNameField.tsx:152-169`).
  Because the element exists only while an error is visible, it announces once per transition and
  is silent across the other 49 keystrokes — the noise Story 2.11's FD4 refused. If 4.13's Save
  summary makes this a double announcement, the fix is that story's (Task 6 item 3).

- **FD5 — No `transition` on the input.** `BattleNameField` keeps `transition: border-color 0.2s`
  safely because its border never changes colour on a state flip. Here the border animates
  `--gol-border-control` → `--gol-danger` on every validity change, and an axe scan landing
  mid-fade measures a boundary no settled state has — the exact trap `<BackButton>` (4.3),
  `<EditorStatusBar>`, `<SidebarFooter>` and `<ModeButton>` each record. No transition, so no
  reduced-motion block either.

- **FD6 — Plain `styled('input')`, not MUI `TextField`.** `theme.ts` has no `MuiTextField` /
  `MuiOutlinedInput` / `MuiFormHelperText` overrides — a `TextField` here would be the first in the
  repo and would render Material's floating label, notched outline, 250ms outline transition and
  helper-text metrics, none of which the flat mockup input has, and all of which would need
  overrides that no other consumer wants. `<BattleNameField>` is the shipped, reviewed idiom for
  this exact control (tokens, focus ring, `--gol-border-control`, code-unit counter,
  `aria-describedby`); this story copies its mechanics and adds the label and the error state. The
  two components stay separate (`battle/editor/` vs `organisms/editor/` — reaching across is a
  design change per `project-context.md`) and differ in kind (clamp vs refuse, cap notice vs
  error); a shared `<NameField>` would be an abstraction over two callers that disagree.

### What exists — read these before writing a line

| File | Why it matters here |
|---|---|
| `apps/web/components/battle/editor/BattleNameField.tsx` | **The precedent.** Copy `Input`'s rule set (`:20-51`), the `useId` + `aria-describedby` counter (`:104-150`), the code-unit comment (`:145-148`); do NOT copy the `maxLength`/clamp (`:82, 107, 129-130`) or `<CapNotice>` (FD1). |
| `apps/web/components/battle/editor/BattleNameField.test.tsx` | `ControlledHarness` (`:9-16`), the code-unit test (`:51-58`), the describedby test (`:158`), the "no `aria-live` attribute" shape (`:213`), the axe idiom. |
| `apps/web/components/organisms/editor/OrganismEditorModal.tsx:116-140, 201-208` | **The file being modified**: `EditorBody`, the doc block to update, the `<OrganismEditorLayout />` mount that gains `basicInfo`. Everything else stays — header, `Dialog` props, `disabled` Save. |
| `apps/web/components/organisms/editor/OrganismEditorModal.test.tsx` | Portalled-dialog discipline (`screen`, never `container`); the region test to extend; the axe test that now covers the field. |
| `apps/web/components/organisms/editor/OrganismEditorLayout.tsx:45-53, 175-197` | The `basicInfo` slot and its doc ("Story 4.5 (name) … mount here"). **Read, do not modify.** |
| `apps/web/lib/organisms/useOrganismEditorModal.ts:4-7, 24-27` | **Read, do not modify** — the `import type` seam AC8 measures; `OrganismEditorModalProps` must not change. |
| `apps/web/components/organisms/OrganismLibrary.tsx:30, 229, 321` | The `dynamic()` boundary; the modal mount (unchanged). ❌ Never import the field, validator or draft factory here. |
| `apps/web/components/battle/editor/BattleEditorView.tsx:392-400, 460` | `<SaveErrorLine role="alert">` — the house assertive error line (colour, size) the inline error follows. |
| `apps/web/components/battle/BattleHeader.tsx:98-137` | The `data-*` attribute + `'&[data-…]'` selector idiom for state-driven styles (used for `data-over-limit`). |
| `packages/domain/src/organismSchema.ts:14`, `battleSchema.ts:14-18`, `index.ts` | The bare `50` to replace; the `MAX_BATTLE_NAME_LENGTH` comment to mirror; the export line. |
| `packages/domain/src/organismSchema.test.ts:53-55` | The boundary test to derive from the constant. |
| `apps/web/lib/battle/newBattleDraft.ts` | The draft-factory precedent `organismDraft.ts` mirrors (shape, header reasoning). |
| `apps/web/app/themes.css:19-70` | Tokens: `--gol-bg-hover` (input fill), `--gol-border-control`, `--gol-danger`, `--gol-text-tertiary`/`-secondary`/`-primary`, `--gol-accent`. No `--gol-danger-text` exists — do not mint one. |
| `docs/implementation-artifacts/clinical-lab-contrast-validation.md:35-64` | Validated pairs. `--gol-danger` is not in the table; `deferred-work.md:305` gives 4.48:1 on `bg-hover` and "clears 4.5 on `bg-secondary`" (4.90:1) — the error line sits on `bg-secondary` only. |
| `apps/web/e2e/organisms.spec.ts:5, 17-22, 31-34, 266-450, 451-784` | `CREATE`, `openEditor`, the console-capture idiom, the 4.3 block (settled-axe pattern, WebKit branch), the 4.4 block (region locators). |
| `docs/planning-artifacts/ux-designs/…/clinical-lab-theme/organism-editor.html:153-208, 906-916` | `.form-field`/`.field-label`/`.text-input`/`.char-count` CSS (values above) and the field markup: label "Organism Name", placeholder, `maxlength="50"` (not reproduced — FD1). **No error-state CSS and no ARIA anywhere in the file.** |
| `docs/planning-artifacts/ux-designs/…/organism-editor-design.md:129-159, 547-556, 723-744, 747-777` | Label/placeholder/max; "required, show error if empty on save attempt"; the two error messages (verbatim copy); "red text and warning icon, red border, focus first invalid on save". |
| `docs/implementation-artifacts/4-4-three-column-responsive-layout.md` | FD2 (columns scroll — the field is the first content in the ~700px budget), FD6 (named slots), the review's `aria-labelledby` id-equality lesson, bundle figures. |
| `docs/implementation-artifacts/epic-2/2-11-battle-name-dirty-tracking.md:278-297, 613-623` | FD4 (aria scheme), FD5 (no form), FD6 and its reversal to clamp — the decision FD1 here consciously departs from. |
| `docs/implementation-artifacts/deferred-work.md:29, 97, 305, 753-767, 768-775, 934-939` | Code-unit counting (settled here), no `.min(1)` (stays deferred), danger-on-hover contrast, the header/footer divergence (the name stays in the column), Save's cross-fade (4.16's), the content-height budget. |
| `docs/implementation-artifacts/lane-gates.yaml` | 4.24/4.25 gated on `epic-3`; this story touches none of Epic 3's surfaces. |

### Architecture compliance

- **RFC-005 Decision 1 / Decision 7, AR-33** — the draft is ephemeral UI state local to the modal;
  the editor's dirty scope (4.23) will be derived from it, independent of the battle's. No global
  store, no Context, no repository anywhere in this story (AR-2 / AR-27 untouched — nothing is
  persisted).
- **FR-2.1 / UX-DR14 / UX-DR17** — labelled, required, ≤ 50 with a live count; inline error with
  red border and icon below the field; label association, `aria-invalid`, `aria-describedby`,
  `role="alert"`, keyboard-reachable.
- **AR-39** — the constant lands in `packages/domain` at 100% per file; the validator's copy
  lives in `apps/web` (UI strings are not domain logic).
- **AR-35 / bundle** — everything new is reached only through `OrganismEditorModal.tsx`, inside
  the `next/dynamic` boundary; `@mui/material/styles` is the only MUI import.
- **RFC-003 Decision 3 / Decision J / AR-46** — `styled()` + `var(--gol-*)`; the only literals
  are sizes (11/13/14px, 4/8/12/14/20px) matching the mockup and `BattleNameField`.
- **NFR-4.1** — no placeholder controls, no "coming soon"; the field is fully live. Save remains
  genuinely `disabled` (4.16 enables it).
- **SC 1.4.3 / 1.4.11** — danger text only on `--gol-bg-secondary` (4.90:1); danger border on
  `--gol-bg-hover` (4.48:1 ≥ 3:1). Never put danger text inside the input or on a hover surface.
- **Spec-id hygiene** — `spec:check` tokenises `FR-2.1`, `NFR-4.1`, `AR-33`, `AR-39`, `AR-46`,
  `RFC-003`, `RFC-005`, `Story 4.5`, `Story 2.11`, `Story 4.13`, `Story 4.16`; write them exactly
  so. `UX-DR14`, `UX-DR17`, `FD*`, `SC n.n.n`, `Decision 7` (RFC-relative) and
  `deferred-work.md:NNN` are not checked.

### Library / framework notes (installed versions, no research needed)

- **React 19.2 / `useId()`** — ids look like `:r1:`; in Playwright use an attribute selector
  (`[id="…"]`), never `#:r1:`. `useState(fn)` lazy initialiser runs once per mount.
- **@testing-library/user-event 14.6** — `user.type` honours a `maxlength` attribute (which is
  why test (g) proves there is none); `user.tab()` follows DOM order. `fireEvent.change` is not
  needed anywhere in this story — there is no bypass path to simulate because nothing clamps.
- **jest-dom** — `toBeRequired()` accepts `aria-required="true"`; `toBeInvalid()` accepts
  `aria-invalid="true"`; `toHaveAccessibleName` resolves `<label for>`.
- **vitest-axe 0.1** — `axe(container).violations` → `[]`; the `toHaveNoViolations` matcher is
  deliberately not wired (`vitest.setup.ts:5-8`). Rules that matter here: `label`,
  `aria-valid-attr-value` (every `aria-describedby` id must exist in the DOM — hence the error id is
  listed only while the alert is rendered), `color-contrast` (jsdom skips it; the e2e scan is the
  real one).
- **Playwright 1.62** — `fill()` sets the value directly and fires `input`; it does not respect
  `maxlength` the way `type()`/`pressSequentially()` do, which is exactly the path FD1 keeps open.
  `getByRole('alert')` finds `role="alert"` regardless of `aria-live`.
- **axe-core 4.12 (Playwright)** — `color-contrast` measures the settled colour; with no
  transition on the input the scan can run immediately after `fill()`.
- **MUI 9.3.1 `styled()`** — a `styled('label')`/`styled('input')`/`styled('p')` forwards `htmlFor`,
  `id`, `aria-*`, `data-*` untouched. No `shouldForwardProp` needed with the `data-*` idiom.
- **Zod 4** — `z.string().max(n)` counts UTF-16 code units (`String.prototype.length`); the
  counter and the validator use the same measure, so what the field calls valid, the schema parses.

### Testing standards

- `apps/web` has **no coverage gate** — every test above guards a named failure: a `maxlength`
  attribute or clamp creeping back (g, e2e 2), the required error firing on mount (e), an
  `aria-describedby` pointing at an unmounted id (i, e2e 4), a counter that disagrees with the
  schema's measure (d), a label that matches by text but not by `for` (a), danger text on the
  wrong background (e2e 3), the field landing outside the Basic Information region (modal test 1),
  and the draft state not round-tripping through the shell (modal test 2).
- `packages/domain` **is** gated at 90% per file and sits at 100% — a constant adds no branch;
  keep it that way (no helper function in the schema file).
- Never snapshot the field; never assert computed colours in jsdom; never mock `useId`.
- The 4.3/4.4 tests must not be edited; if one fails, the field or the mount is wrong, not the
  test. `OrganismEditorLayout.test.tsx` (d) "renders only the heading pair" still passes because
  that test renders the layout with no slots — it is the *modal* that passes `basicInfo`.
- Do not add a story-4.5 `afterEach` that sweeps `[aria-hidden]` nodes (`deferred-work.md:785-793`
  records why that idiom is a defect).

### Previous story intelligence (Story 4.4)

- The layout's three slots are `ReactNode`s rendered after each column's heading pair; `basicInfo`
  is the one to use, addressed by name so the field cannot land in the wrong column (4.4 FD6).
  The column is its own scroll container (`overflow-y: auto`, FD2) — the field is the first
  ~90px of a ~700px budget that must not be assumed to fit 720px; nothing here needs `tabIndex`
  on the column (axe's `scrollable-region-focusable` is satisfied by the focusable input the
  column now contains — do not add one).
- 4.4's review caught an `aria-labelledby` test that matched text without checking the id;
  test (a) and (f) here assert id equality for the same reason.
- 4.4 measured the editor chunk at **2819 B gzip** and `/organisms` at **295.2 KB**; the modal's
  static import of the layout did not move first load. Expect the same shape: chunk +≈1 KB,
  routes byte-identical.
- 4.3 FD1's header/footer divergence is still **open** (`deferred-work.md:753-767`): the name
  goes in the Basic Information column as this story's AC says ("Given the Basic Info column"),
  not in the header — and the header's static title stays (Task 6 item 4 records the mockup's
  live-name header as the open question).
- 4.3 FD4: Save is `disabled` and its enabled edge is 4.16's cross-fade trap — the name's
  validity must not toggle Save in this story.

### Git intelligence

Last 12 commits on `main`: Story 4.4 (layout + review fixes — `components/organisms/editor/**`,
`e2e/organisms.spec.ts`, `deferred-work.md`, `project-context.md`), Story 3.11 (mode toggle + run
view — `BattleHeader`, `BattlePage`, `PetriDishCanvas`, `components/battle/simulation/**`,
`e2e/battleRoute.spec.ts`), a `useBattleDraft` alias-test fix, and lane-sync/run-stats commits.
**Shared surfaces with the open Epic 3 lane (3.12–3.19): none.** 3.12–3.19 write
`components/battle/**`, `lib/battle/**` and `battleRoute.spec.ts`; 3.19's "hotkeys suspended
while an input has focus" is battle-route-only and the organism editor is not mounted there until
4.24 (gated on `epic-3`). This story writes `components/organisms/editor/**`, two new
`lib/organisms/` modules, three lines of `packages/domain`, `organisms.spec.ts` and docs.

### Project Structure Notes

- New: `components/organisms/editor/OrganismNameField.tsx` (+ `.test.tsx`),
  `lib/organisms/organismName.ts` (+ `.test.ts`), `lib/organisms/organismDraft.ts` (+ `.test.ts`).
- Modified: `components/organisms/editor/OrganismEditorModal.tsx` (+ test),
  `packages/domain/src/organismSchema.ts` (+ test), `packages/domain/src/index.ts`,
  `e2e/organisms.spec.ts`, `docs/implementation-artifacts/deferred-work.md`, `sprint-status.yaml`.
- Naming: components PascalCase `.tsx`; non-component TS camelCase, never dotted
  (`organismName.ts`, `organismDraft.ts`); the constant is `MAX_ORGANISM_NAME_LENGTH`
  (SCREAMING_CASE, the `MAX_BATTLE_NAME_LENGTH` precedent); message constants
  `ORGANISM_NAME_REQUIRED` / `organismNameTooLong()`.
- Untouched on purpose: `OrganismEditorLayout.tsx` (+ test), `useOrganismEditorModal.ts` (+ test),
  `OrganismLibrary.tsx`, `OrganismCard.tsx`, `app/(gallery)/organisms/page.tsx`, `lib/theme.ts`,
  `themes.css`, everything under `components/battle/`, `packages/persistence`,
  `playwright.config.ts`, `scripts/check-bundle-size.mjs` budgets, `docs/project-context.md`.

### References

- `docs/planning-artifacts/epics.md:1041-1051` (Story 4.5 ACs), `:43` FR-2.1, `:135` NFR-4.1,
  `:201` AR-33, `:218` AR-44, `:220` AR-46, `:239` UX-DR14, `:242` UX-DR17, `:1140-1151` (4.13 —
  Save-time orchestration), `:1177-1187` (4.16 — persistence), `:1189-1200` (4.17 — seeding the
  draft), `:1264-1275` (4.23 — dirty scope over the draft).
- `docs/planning-artifacts/prds/prd-GameOfLife-2026-05-26/prd.md:163-166` (FR-2.1 — the PRD
  states no length; 50 is UX-DR14's).
- `docs/planning-artifacts/rfcs/RFC-005-application-state-modes-undo.md:15` (ephemeral UI state),
  `:57, 199, 281-296` (Decision 7 — the editor's own dirty scope); `RFC-003-frontend-ui-architecture.md:58`
  (the editor Dialog), `:167-179` (Decision 3 — `styled()` vs `sx`).
- `docs/planning-artifacts/architecture.md:351` (M5 — modal over the battle, the 4.24 origin the
  draft must not care about).
- `docs/planning-artifacts/ux-designs/ux-GameOfLife-2026-05-27/organism-editor-design.md:129-159,
  547-556, 723-744, 747-777`; `clinical-lab-theme/organism-editor.html:49-55, 153-208, 900,
  906-916`; `ORGANISM-EDITOR-UPDATES.md:9-21` (the header-name revision, open);
  `UX-PHASE-COMPLETION-REVIEW.md:45` ("text input with character counter (50 char max)").
- `docs/implementation-artifacts/4-4-three-column-responsive-layout.md` (FD2, FD6, review
  findings); `4-3-editor-modal-shell.md` (FD1, FD4, FD5); `epic-2/2-11-battle-name-dirty-tracking.md`
  (FD4–FD6 and the clamp reversal).
- `docs/implementation-artifacts/deferred-work.md:29, 97, 305, 753-767, 768-775, 785-793, 934-939`.
- `docs/implementation-artifacts/clinical-lab-contrast-validation.md:35-64`.
- `docs/implementation-artifacts/lane-gates.yaml`.
- `docs/project-context.md` — Framework rules (three state categories, no repository import,
  `styled()` + tokens), Testing rules (axe, never snapshot, no coverage padding, fixtures), Code
  Quality (AR-46, `spec:check`, camelCase files, comments explain why), Commit gate.

## Dev Agent Record

### Agent Model Used

Claude Opus 5 (claude-opus-5), via `bmad-dev-story` on branch `story/4-5-organism-name-field`
from `origin/main` `c8ffa1b`.

### Implementation Plan

Tasks executed in the story's order, each red → green → refactor:

1. **Domain constant** — test first (`organismSchema.test.ts` imports `MAX_ORGANISM_NAME_LENGTH`;
   2 new cases red), then `export const MAX_ORGANISM_NAME_LENGTH = 50` above `OrganismSchema`,
   `name: z.string().max(MAX_ORGANISM_NAME_LENGTH)`, re-exported from `index.ts`. No `.min(1)`.
2. **Validator + draft factory** — `lib/organisms/organismName.ts` (`ORGANISM_NAME_REQUIRED`,
   `organismNameTooLong(n)`, `validateOrganismName(name, max = MAX_ORGANISM_NAME_LENGTH)`:
   too-long first, then `trim().length === 0`); `lib/organisms/organismDraft.ts`
   (`OrganismDraft = Pick<Organism, 'name'>`, `createNewOrganismDraft()` → fresh `{ name: '' }`).
3. **`<OrganismNameField>`** — `styled('label'|'input'|'div'|'p')` only (FD6); no `maxLength`
   attribute, no clamp (FD1); `touched` flips on first change (FD2); `role="alert"` error line
   mounted only while an error is visible, listed first in `aria-describedby`, counter always
   listed (FD4); no `transition` on the input (FD5); `data-over-limit` + attribute selector for
   the counter's danger colour; three `useId()`s.
4. **Mount** — `<OrganismEditorModal>` gains `useState<OrganismDraft>(createNewOrganismDraft)` +
   a functional `setName`, passes `basicInfo={<OrganismNameField … />}`. Props unchanged;
   `useOrganismEditorModal.ts`, `OrganismEditorLayout.tsx` (+ test), `OrganismLibrary.tsx`
   untouched. Save stays `disabled`.
5. **e2e** — one new `describe` block after 4.4's, reusing `openEditor`; four tests (labelled /
   required / counted; over-limit-is-an-error via `fill()`; axe with the over-limit error visible;
   `aria-describedby` id resolution with `[id="…"]` selectors). Earlier blocks verbatim.
6. **Measurement + docs** — bundle before/after, `deferred-work.md` entry (4 items),
   `project-context.md` untouched (no new compiles-and-is-wrong rule), full `npm run ci`.

### Debug Log References

- Test (e) in `OrganismNameField.test.tsx` first used a DOM-wide `querySelector('[id]…')` to find
  the counter; replaced with "exactly one `aria-describedby` token, and it resolves to the
  counter text" — the assertion the AC actually states.
- Test (j) originally rendered two fields in one case; split into "full value on a keystroke" and
  "accumulates through the harness" for one failure per test.
- `OrganismEditorModal.test.tsx` needed one Prettier reflow (a `within(within(…))` line); no
  logic change.
- The "Pages directory cannot be found" line ESLint prints for `apps/web` is the config's standing
  stderr note (pre-existing, exit 0), not a finding.

### Completion Notes List

- **AC1** — `<OrganismNameField>` renders in the Basic Information region through the `basicInfo`
  slot: visible `<label for>` "Organism Name", placeholder "e.g., Aggressive Colonizer",
  `aria-required="true"`, counter `{value.length} / {maxLength}` (UTF-16 code units; the emoji
  test pins `'a👍b'` → `4 / N`). Modal test asserts the other two regions contain no textbox.
- **AC2** — `MAX_ORGANISM_NAME_LENGTH` exported from `@gol/domain`; the schema, the validator's
  default, the field's default and every test derive from it. `organismSchema.test.ts` gains
  "exactly MAX accepted" and "MAX is 50". `packages/domain`: 100 / 100 / 100 / 100 per file. No
  `.min(1)`.
- **AC3** — both messages verbatim from the design doc; `aria-invalid="true"` + `--gol-danger`
  border on the input, `⚠` (aria-hidden) + message in `--gol-danger` under the field, counter
  `--gol-danger` via `data-over-limit`. Required waits for the first edit (FD2, pinned by the
  "no error on mount" tests in both the field and the modal); over-limit is immediate.
- **AC4** — no `maxlength` attribute, no `.slice()`. Unit test (g) types six characters into a
  `maxLength={5}` field and asserts all six are kept; e2e 2 `fill()`s 51 characters and asserts
  `toHaveValue` on the exact string. Divergence from the mockup recorded in `deferred-work.md`.
- **AC5** — accessible name via `<label htmlFor>` (test asserts `for === input.id`, no
  `aria-label`); `aria-describedby` = `errorId counterId` while an error is visible, `counterId`
  otherwise — tests assert the alert's `id` IS the first token and that every token resolves,
  in jsdom and in all four Playwright projects. The counter has no `aria-live`/`role`; the alert
  carries no explicit `aria-live="assertive"`.
- **AC6** — draft state (`OrganismDraft`) lives in `<OrganismEditorModal>` via the lazy
  `useState` initialiser; `OrganismEditorModalProps` unchanged; `useOrganismEditorModal.ts` (+
  test) untouched; no reset effect / `key`. Modal test proves typing round-trips through the
  modal's own state (`Glider` → `6 / 50`).
- **AC7** — vitest-axe `[]` for the field clean / required error / over-limit error, and for the
  open modal (the existing test, now covering the field); `@axe-core/playwright` `[]` on
  `/organisms` with the over-limit error visible on chromium, firefox, webkit and tablet — the
  scan that measures `--gol-danger` on `--gol-bg-secondary` and the danger border on
  `--gol-bg-hover` for real. No `transition` on the input. `OrganismEditorLayout.test.tsx` not
  edited; `OrganismEditorModal.test.tsx` keeps all 11 prior cases (+3); the four earlier e2e
  blocks verbatim.
- **AC8** — bundle before (on `c8ffa1b`, code identical to `main`) vs after, gzip:

  | Route | Before | After | Budget |
  |---|---|---|---|
  | `/` | 333.3 KB | 333.3 KB | 340 |
  | `/battle` | 308.6 KB | 308.6 KB | 310 |
  | `/battle/new` | 308.5 KB | 308.5 KB | 310 |
  | `/organisms` | 295.3 KB | **295.3 KB** | 305 |

  (Story 4.4 recorded `/organisms` at 295.2 KB; the 0.1 KB is Story 3.11's merge, present in
  both columns here.) Editor chunk (the one file containing `Organism Editor`, and the only file
  containing `Aggressive Colonizer`): `2-mmibo5fkke9.js` 9775 B raw / **3521 B gzip** vs 4.4's
  7751 B / 2819 B → **+0.7 KB gzip**. All four routes byte-identical → the three new modules
  are reached only through `OrganismEditorModal.tsx`. No budget edited.
- **Verification** — `npm run ci > ci.log 2>&1; echo $?` → **`0`**. Gate order typecheck → lint →
  format:check → spec:check (241 cited ids resolve) → boundary:check → coverage
  (`@gol/domain` 101 tests, 100% all files; `web` 81 files / 1185 tests) → build:standalone →
  bundle:check (four routes within budget, figures above) → bench (frame 7.598 ms vs 16.667 ms
  budget, 54.4% headroom) → bench:check → e2e (**484 passed, 4 skipped** — the pre-existing
  pointer-conditional skips in `deleteBattle.spec.ts`, not this story's). Standalone
  `npx playwright test e2e/organisms.spec.ts` earlier: 120 passed across the four projects.
  `gh run list --limit 1` is to be checked after the branch is pushed (outside this workflow's
  step; the push is the orchestrator's).
- **Untouched on purpose**: `docs/project-context.md` (the seam is recorded in the code headers
  and here; nothing new is a compiles-and-is-wrong trap), `OrganismEditorLayout.tsx` (+ test),
  `useOrganismEditorModal.ts` (+ test), `OrganismLibrary.tsx`, `theme.ts`, `themes.css`,
  `check-bundle-size.mjs` budgets, everything under `components/battle/`.

### File List

New:
- `apps/web/components/organisms/editor/OrganismNameField.tsx`
- `apps/web/components/organisms/editor/OrganismNameField.test.tsx`
- `apps/web/lib/organisms/organismName.ts`
- `apps/web/lib/organisms/organismName.test.ts`
- `apps/web/lib/organisms/organismDraft.ts`
- `apps/web/lib/organisms/organismDraft.test.ts`

Modified:
- `apps/web/components/organisms/editor/OrganismEditorModal.tsx`
- `apps/web/components/organisms/editor/OrganismEditorModal.test.tsx`
- `apps/web/e2e/organisms.spec.ts`
- `packages/domain/src/organismSchema.ts`
- `packages/domain/src/organismSchema.test.ts`
- `packages/domain/src/index.ts`
- `docs/implementation-artifacts/deferred-work.md`
- `docs/implementation-artifacts/sprint-status.yaml`
- `docs/implementation-artifacts/4-5-organism-name-field.md`

### Change Log

- 2026-09-15 — Story file created (create-story): ACs decomposed, FD1–FD6 recorded, precedent
  and spec map compiled; status → ready-for-dev.
- 2026-09-15 — Implemented (dev-story): `MAX_ORGANISM_NAME_LENGTH` in `@gol/domain`;
  `validateOrganismName` + `OrganismDraft`/`createNewOrganismDraft` in `lib/organisms/`;
  `<OrganismNameField>` (refuse-not-clamp, edit-gated required error, `role="alert"` line,
  code-unit counter) mounted through `<OrganismEditorLayout basicInfo>` with the draft held in
  `<OrganismEditorModal>`; 16 field + 3 modal + 8 validator + 2 draft + 3 schema unit tests;
  4 e2e tests; `deferred-work.md` entry; `/organisms` first load unchanged at 295.3 KB, editor
  chunk +0.7 KB gzip; `npm run ci` exit 0. Status → review.
- 2026-09-15 — Code review (Fable, three parallel adversarial layers; the implementation was Opus).
  0 decision-needed, 8 patch (all applied), 1 defer, 18 dismissed. Patches: over-limit no longer
  waits for `touched` and the counter shares the validator's `exceedsOrganismNameLength` predicate;
  `⚠` pinned to text presentation (U+FE0E); tests added for the exact boundary, over-limit on
  mount, and a reopen through the real `mounted` gate (`OrganismLibrary.test.tsx`); the
  `aria-describedby` assertions can no longer pass on an absent attribute; the modal test asserts
  exactly one textbox in the dialog; the e2e derives every number from `MAX_ORGANISM_NAME_LENGTH`
  and gains a required-state axe scan (the placeholder pairing). Status → done.

Dev Model: opus   # architecture-shaping: introduces the editor's draft-state seam (`OrganismDraft` in the shell, seeded by a factory) that 4.6–4.8, 4.16, 4.17 and 4.23 build on, the shared validator/inline-error idiom 4.11/4.13 reuse, and consciously reverses Story 2.11's ratified clamp — three patterns picked, not followed
Proposed lane gate: none

---

This story was implemented with the 'Implement next story' skill with the following stats:

| Phase | Agent model | Agents | Active | Wall clock | Input | Output | Cache write | Cache read | Total tokens |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Step 0 — re-entry guard | — | 0 | 23s | 23s | 10 | 1,552 | 3,447 | 302,412 | 307,421 |
| Step 1 — create-story | opus-5, sonnet-5 | 3 | 12m 34s | 12m 34s | 368 | 83,306 | 691,233 | 15,179,943 | 15,954,850 |
| Step 2 — dev-story | opus-5 | 1 | 18m 49s | 18m 49s | 222 | 54,454 | 277,457 | 15,196,205 | 15,528,338 |
| Step 3 — code review + PR | fable-5-1 | 4 | 25m 53s | 25m 53s | 5,130 | 98,026 | 2,028,590 | 23,169,400 | 25,301,146 |
| _of which the orchestrator_ | opus-5 | — | — | — | 50 | 9,312 | 22,188 | 1,681,675 | 1,713,225 |
| **Total (create-story → PR ready)** | | 8 | **57m 39s** | 57m 39s | 5,730 | 237,338 | 3,000,727 | 53,847,960 | **57,091,755** |

Run started 2026-09-15 09:16 CEST; wall clock runs to the point the run stopped for Sidiar's review. No idle gaps were excluded; Active and Wall clock agree. (A gap counts as idle above 15 min.) Each phase row covers the phase agent, any agents it spawned, and the orchestrator's own turns in that window — the orchestrator row breaks its share out again, it is not additional. Cache reads dominate the token totals and are billed at a fraction of input rate, so read the Input and Output columns for effort and the total only as a ceiling. The orchestrator's final turn is still being written when these numbers are taken.
