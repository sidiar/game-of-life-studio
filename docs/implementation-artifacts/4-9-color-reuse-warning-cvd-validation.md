---
baseline_commit: 457b232
---

# Story 4.9: Color Reuse Warning & CVD Validation

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a user,
I want to reuse colors knowingly,
so that palette limits never block me but I'm warned about ambiguity.

## Acceptance Criteria

From `epics.md#Story 4.9: Color Reuse Warning & CVD Validation` (`:1091-1101`), decomposed into
what a reviewer can check independently. AC5–AC10 are repo-derived: the obligations Story 4.8's
shipped `<ColorPickerField>` and its FD6 hand-off ("Story 4.9 adds the in-use marking and the
reuse warning under the chip row"), Story 1.7's existing CVD validation (which this story
**re-confirms and extends — it does not create it**), the two deferred-work items addressed to
this story by name, and the CI gates impose.

1. **Picking a swatch that another organism in the loaded library already uses shows a
   non-blocking warning, and the selection proceeds exactly as an unwarned pick does.** The
   warning is the mockup's `.color-reuse-warning` box (`organism-editor.html:288-297`) rendered
   below the palette grid inside the Organism Color fieldset: a `⚠︎` glyph (aria-hidden, U+26A0
   U+FE0E — the `<OrganismNameField>` idiom) and the text `colorReuseWarning(names)` produces —
   one user: **"Conway's Classic already uses this color."**; two: **"A and B already use this
   color."**; three or more: **"A, B and N more already use this color."** (N = count − 2;
   names in library order — the order the cards render). It lives inside an **always-mounted
   `role="status"` region** (FD3) so the change is announced politely; nothing else changes:
   the picked radio is checked, the chip / name / aging strip update as in Story 4.8 AC4, every
   radio stays enabled, no `aria-invalid` appears anywhere, the description is unchanged, and
   Save is untouched (it is still Story 4.16's inert `disabled` button — the AC's "save is
   unaffected" is asserted as "nothing about Save's DOM changes across the pick"). (FR-2.3, M6,
   UX-DR7, RFC-007 Decision 3)

2. **The warning clears on a non-conflicting pick, and is never raised on the token the draft
   opened on.** Picking a token no other organism uses empties the status region (no box, no
   text). The **seed token** — the M6 default `createNewOrganismDraft` produced (Story 4.8 AC3;
   Story 4.17 will seed it from the record) — never raises the warning, **even when every token
   is in use and the least-used default therefore collides** (PRD FR-2.3: "the system-assigned
   default … does not itself raise it"). This is a token comparison, not provenance (Story 4.8
   AC3's constraint): `value !== seedValue && users.length > 0`. Consequence, recorded not
   engineered around: re-picking the seed after picking something else is also silent (FD2).

3. **Every swatch used by another organism carries the mockup's in-use dot; none is disabled,
   hidden, filtered or `title`d.** The dot is the mockup's `.in-use::after` `•`
   (`organism-editor.html:275-286`) at the swatch's top-right, painted `--gol-text-primary` with a
   `--gol-bg-primary` text-shadow (AR-46 — the mockup's `#fff` / `rgba(0,0,0,0.9)` become tokens),
   driven by `data-in-use="true"` on the `<label>` (the `data-selected` idiom — never
   `:has()`), `aria-hidden` by construction (a CSS pseudo-element has no accessibility-tree
   presence). It coexists with the selected `✓`. The in-use set is "tokens with ≥ 1 user in
   `usersByToken`" — the draft's own token counts only if another organism holds it. No `title`
   attribute on any swatch (FD4). (M6, UX-DR7)

4. **The field description grows the mockup's second sentence, verbatim:** "Pick any color —
   colors are reusable. If another organism already uses your pick, a non-blocking warning
   appears (they'll share a color on the grid)." (`organism-editor.html:922`). Story 4.8 held the
   first sentence back under NFR-4.1 ("no copy promising behaviour the build lacks") and recorded
   the second as deferred item 4 of its section; this story ships the behaviour and the copy
   together and strikes that item. The two 4.8 assertions on the old text (`ColorPickerField.
   test.tsx:66`, `organisms.spec.ts:1359`) are **retargeted** to the new string — the only 4.8
   test edits this story makes besides the required-prop additions of AC5.

5. **Usage is derived, pure, and injected — the field still holds no state and reads no library.**
   `apps/web/lib/organisms/colorReuse.ts` (new, no React, no DOM) exports
   `usersByColorToken(organisms: readonly Organism[]): ReadonlyMap<string, readonly string[]>`
   (token → the display names of the organisms holding it, **input order preserved**, names via
   `toDisplayOrganism` so an empty stored name reads "Unnamed organism" — the `<OrganismLibrary>`
   idiom; unknown tokens are kept as keys, they are harmless to a `PALETTE` lookup) and
   `colorReuseWarning(names: readonly string[]): string | null` (the AC1 sentences; `null` for
   `[]`). `<ColorPickerField>` gains two **required** props — `usersByToken` and `seedValue`
   (FD1) — and keeps exactly one piece of local state (the 4.8 disclosure flag). `<OrganismEditor
   Modal>` holds the seed draft in state beside the live draft (FD2), derives `usersByToken`
   **per render, unmemoised** (the Story 3.7 measurement: a scan of 1,000 organisms is
   0.02–0.04 ms), and passes `seedValue={seed.colorToken}`. Its `library` prop, `useOrganism
   EditorModal`, and `<OrganismLibrary>` are **unchanged** — the modal already receives the
   entity list (Story 4.8 FD5). Story 4.17 excludes the organism under edit before calling
   `usersByColorToken`; nothing here needs to know. (AR-2, AR-27, RFC-005 Decision 1)

6. **The CVD validation is re-confirmed against the shipped registry and its one ungated path is
   closed.** `docs/implementation-artifacts/palette-cvd-validation.md` already records the
   documented check the AC asks for (Story 1.7; the registry's hexes have not changed since —
   `git log -- apps/web/lib/palette/paletteRegistry.ts` shows only the 1.7 commits and a folder
   move). This story: (a) splits `relativeLuminance(hex)` into `luminanceOfLinear(LinearRgb)` +
   a thin hex wrapper and adds `contrastRatioOfLinear(a, b)` in `paletteCvd.ts` (the "three
   lines" `deferred-work.md:56` asks for); (b) adds **G5 — visibility under CVD simulation**
   to `paletteCvd.test.ts`: every token, every shade 0–7, under protan / deutan / tritan, contrast
   ≥ **2.5** against `#0a0a0a` with **both sides simulated** (expected floor: deutan ≈ 2.96 —
   the doc's manual measurement); (c) extends the sweep so its "min contrast" column is
   per-mode; (d) appends a dated **"Story 4.9 re-confirmation"** section to the doc with the
   gate floors as measured today, corrects the doc's stale reproduce paths (`lib/paletteCvd.
   test.ts` → `lib/palette/paletteCvd.test.ts` — the HITL folder refactor moved it), and turns
   its "Contrast is measured under normal vision only" limitation into the G5 description.
   ⚠️ **If the G5 floor measures below 2.5, do not add the gate and do not touch a hex** — record
   the number in the doc and the Dev Agent Record and flag it for Sidiar (a palette re-tune is a
   design call, RFC-007 Decision 1; lowering a threshold is forbidden by the doc's own last
   section). (AR-26, NFR-8.3)

7. **The FR-3.3 battle warning gains the end-to-end assertion deferred to this story.**
   `deferred-work.md:343` ("No test adds a colour-colliding organism THROUGH the add control …
   Story 4.9's CVD work is the natural home"): one new unit test in `BattleEditorView.test.tsx`'s
   existing add-control `describe` — a library organism whose token equals a roster member's,
   added through the combobox, and after the parent's rerender **both** rows read "Shared
   colour". No production code in `components/battle/**` changes; the entry is struck. (FR-3.3,
   M6)

8. **axe passes with the warning visible and the dot painted, in jsdom and in the served app.**
   vitest-axe on the field with a colliding `value` → `[]`; on the modal after a colliding pick →
   `[]`; `@axe-core/playwright` on `/organisms` with the dialog open, the palette expanded and
   "Sky Blue" picked (Conway's Classic's token — the production seed) → `[]`. Warning text is
   `--gol-danger` on the column's `--gol-bg-secondary` — a pair `themeTokens.test.ts` already
   gates at 4.90:1 — with **no tinted background** (FD5: the mockup's 8 % danger tint measures
   4.57:1 and the 10 % variant Story 3.12 rejected measures 4.45:1; AR-46 bans the `rgba` literal
   anyway). No new `--gol-*` token; no `transition` on anything new; no `:has()`. (AR-46, UX-DR17,
   NFR-8.3)

9. **Every existing guard is retargeted, never loosened.** `ColorPickerField.test.tsx`: every
   render gains the two required props (a `renderField` helper or a module-level `NO_USERS` map
   — mechanical), test (a)'s description string changes, nothing else in the 4.8 cases changes.
   `OrganismEditorModal.test.tsx` and `OrganismLibrary.test.tsx`: **no render changes** (the
   modal derives usage from the `library` it already receives). `organisms.spec.ts`: the 4.8
   block changes only the description literal in its last test; the new block is appended after
   it. `useOrganismEditorModal.test.tsx`, `OrganismNameField/DominanceField/AgingToggleField
   .test.tsx`, `OrganismEditorLayout.test.tsx`, every 4.1–4.7 e2e block: **unedited**. (AR-44)

10. **The bundle gate passes and no route's first load moves.** Everything new in `apps/web`
    reaches the client only through `OrganismEditorModal.tsx` (the lazy editor chunk):
    `lib/organisms/colorReuse.ts` is imported by the modal alone; `lib/displayOrganisms.ts`
    is already in `/organisms`'s first load through `<OrganismCard>`. `paletteCvd.ts` is
    test-only (its header rule) — a change there is invisible to the bundle. `/organisms`
    (budget 305), `/battle` (308.7 of 310) and `/` stay within ±0.5 KB; the editor chunk grows
    (expect ≈ +0.8–1.2 KB gzip: the warning box, the dot rule, the formatter). **No budget is
    raised.** `packages/*` untouched; the domain/simulation coverage lines read exactly as on
    `main`. `npm run ci > ci.log 2>&1; echo $?` locally, CI on the pushed branch checked with
    `gh run list --limit 1`.

## Tasks / Subtasks

- [x] **Task 1 — The usage derivation and the sentence, pure** (AC: 5, 1)
  - [x] `apps/web/lib/organisms/colorReuse.ts`:
        ```ts
        import type { Organism } from '@gol/domain';
        import { toDisplayOrganism } from '@/lib/displayOrganisms';

        /**
         * FR-2.3 / M6 / RFC-007 Decision 3: "usage is derived from loaded organisms (no separate
         * store)". Token -> display names of every organism holding it, in INPUT order (the
         * caller passes the list the cards render, so the warning names organisms in the order
         * the user sees them). Names go through `toDisplayOrganism` so an empty stored name
         * reads "Unnamed organism" (the schema has no lower bound on `name`). Unknown tokens are
         * kept — they are harmless to a PALETTE lookup and dropping them would hide a corrupt
         * record from the count. The caller excludes the organism under edit (Story 4.17); this
         * function does not know which one that is. (Story 4.9) (Story 4.8) (Story 2.9)
         */
        export function usersByColorToken(
          organisms: readonly Organism[],
        ): ReadonlyMap<string, readonly string[]>

        /** The AC1 sentence, or null when nobody uses the token. */
        export function colorReuseWarning(names: readonly string[]): string | null
        ```
        Sentences (US "color", the picker's own copy — not the roster's British "Shared colour"):
        1 → `${a} already uses this color.`; 2 → `${a} and ${b} already use this color.`;
        ≥ 3 → `${a}, ${b} and ${n - 2} more already use this color.` Names are user text and are
        interpolated raw (no truncation — a 50-char name wraps; `overflowWrap: 'anywhere'` on
        the box, the `RosterName` idiom). Header comment: why `lib/organisms/` (it walks
        organisms, not the registry — the mirror of `defaultColorToken.ts`'s reasoning for
        `lib/palette/`), why not `@gol/domain` (needs `toDisplayOrganism`, an `apps/web` display
        rule; not referential-integrity logic, so project-context's "core" rule does not reach
        it).
  - [x] `colorReuse.test.ts`: (1) `[]` → empty map; (2) three organisms on three tokens → three
        singleton entries, names verbatim; (3) two on one token → one entry with both names **in
        input order** (reverse the input, assert the reversal); (4) an organism with `name: ''` →
        "Unnamed organism" (import the string from a `toDisplayOrganism` call, never a literal);
        (5) an unknown token is a key. `colorReuseWarning`: `[]` → `null`; one, two, three and
        five names → the four exact sentences (five → "… and 3 more …"). Fixtures from
        `@gol/test-utils` (`createMockOrganisms`, `CONWAYS_CLASSIC`) — test files are exempt from
        the import boundary.

- [x] **Task 2 — The field grows the warning and the dot** (AC: 1, 2, 3, 4, 8) (FD1, FD3, FD4, FD5)
  - [x] `ColorPickerField.tsx` props:
        ```ts
        export interface ColorPickerFieldProps {
          /** The draft's palette token. */
          value: string;
          onChange(colorToken: string): void;
          /**
           * Token -> display names of the OTHER organisms using it (`usersByColorToken`). Drives
           * the in-use dots and the reuse warning. Required, not optional-with-default: an
           * optional prop lets Story 4.24/4.25 forget it and ship a picker that never warns.
           */
          usersByToken: ReadonlyMap<string, readonly string[]>;
          /**
           * The token the draft opened on. The warning is never raised on it (PRD FR-2.3: the
           * system-assigned default does not itself raise it) — a token comparison, not
           * provenance (Story 4.8 AC3).
           */
          seedValue: string;
        }
        ```
        Derivations, per render, no memo: `const users = usersByToken.get(value) ?? [];`
        `const warning = value === seedValue ? null : colorReuseWarning(users);`
        `const inUse = (token: string) => (usersByToken.get(token)?.length ?? 0) > 0;`
  - [x] Structure — the existing JSX with three additions and one text change:
        ```
        <Description id={descriptionId}>Pick any color — colors are reusable. If another organism
          already uses your pick, a non-blocking warning appears (they'll share a color on the
          grid).</Description>                       (AC4 — one string, verbatim)
        …
        <Swatch … data-in-use={inUse(entry.id)} …>  label — adds to the 4.8 rule set:
                                                    '&[data-in-use="true"]::before': content '"•"';
                                                    position absolute; top -1px; right 3px;
                                                    font-size 13px; line-height 1; color
                                                    var(--gol-text-primary); text-shadow 0 0 3px
                                                    var(--gol-bg-primary); pointer-events none.
                                                    `::before`, because `::after` is the 4.8
                                                    selected glow (`inset: -2px` box-shadow) and
                                                    the two must coexist on a selected in-use
                                                    swatch. Never a DOM node: a pseudo-element is
                                                    outside the accessibility tree by construction,
                                                    and a `<span>` inside the label would join the
                                                    radio's accessible NAME (label contents).
        …
        </SwatchGrid>
        <ReuseStatus role="status" data-color-reuse-status>
                                                    div — ALWAYS mounted, empty when clear (FD3):
                                                    a live region has to exist before its content
                                                    changes to be announced reliably. No styles of
                                                    its own.
          {warning !== null && (
            <ReuseWarning data-color-reuse-warning>
                                                    p — `.color-reuse-warning` (`:288-297`) minus
                                                    the tint (FD5): margin 10px 0 0; padding 8px
                                                    10px; font-size 11px; line-height 1.4; color
                                                    var(--gol-danger); border-left 2px solid
                                                    var(--gol-danger); display flex; gap 6px;
                                                    align-items flex-start; overflow-wrap
                                                    anywhere; min-width 0. NO background, NO
                                                    transition.
              <span aria-hidden="true">{'⚠︎'}</span> {warning}
            </ReuseWarning>
          )}
        </ReuseStatus>
        ```
        The status region sits **after** the grid (FD6), inside the fieldset, so it is visible
        whether the palette is open (keyboard pick) or collapsed (pointer pick) and never shifts
        the grid under a roving focus. `aria-describedby` on the radiogroup is **unchanged** (the
        description only). No `aria-invalid`, no `aria-errormessage` — this is not an error.
  - [x] Header comment: replace the FD6 line ("no in-use marking, no reuse warning … Story 4.9's
        surface") with this story's FD1/FD3/FD4/FD5/FD6 in one sentence each; update "the field
        does not know which tokens are in use (Story 4.9)" to "the field is told which tokens are
        in use through `usersByToken` and holds no state about it"; update the followers line
        (4.14 preview grid, 4.17 seeds `value` and `seedValue` from the record and excludes it from
        `usersByToken`). Cite `(Story 4.9)` and keep every existing citation.
  - [x] `ColorPickerField.test.tsx` — a `renderField(overrides)` helper / `NO_USERS = new Map()`
        so the 4.8 cases change only by gaining `usersByToken={NO_USERS} seedValue={PALETTE[0].id}`
        (the `ControlledHarness` gains the same two props, `seedValue` defaulting to its `seed`).
        Test (a)'s description string → the AC4 text. **New cases**, each guarding a named
        failure; the fixture is `USERS = new Map([[PALETTE[0].id, ['Conway\'s Classic']],
        [PALETTE[2].id, ['A', 'B']], [PALETTE[3].id, ['A', 'B', 'C']]])` (names are literals here —
        they are test data, not `PALETTE` values):
        (k) **warns on a colliding pick**: harness seeded at `PALETTE[1].id` with `USERS`; open,
            click `PALETTE[0]`'s radio → `getByRole('status')` has text "Conway's Classic already
            uses this color."; the radio is checked; `[data-selected-name]` moved; **no element
            has `aria-invalid`**; all `PALETTE.length` radios enabled.
        (l) **the sentence scales**: pick `PALETTE[2]` → "A and B already use this color."; pick
            `PALETTE[3]` → "A, B and 1 more already use this color."
        (m) **clears on a non-conflicting pick**: after (k), click `PALETTE[5]`'s radio → the
            status region's text is `''` and `[data-color-reuse-warning]` is absent.
        (n) **silent on the seed, even when in use**: `value={PALETTE[0].id} seedValue={PALETTE[0]
            .id}` with `USERS` → status empty; and through the harness (seed `PALETTE[0]`): pick
            `PALETTE[2]` (warns), pick `PALETTE[0]` again → status empty (FD2's recorded
            consequence, pinned so it is a decision and not an accident).
        (o) **in-use dots**: with `USERS`, the labels for `PALETTE[0]`, `PALETTE[2]`, `PALETTE[3]`
            have `data-in-use="true"` and every other label `"false"`; the checked radio's
            accessible name is still exactly `PALETTE[n].name` (the dot never joins the name).
        (p) **the status region is mounted before any warning exists**: `getByRole('status')`
            resolves on first render with `NO_USERS` and is empty.
        (q) axe → `[]` with the warning visible and the dot painted (collision state), scanning
            the render `container` (the 4.8 precedent — a lone field outside a landmark trips
            `region` on `document.body`).
        jsdom has no layout: never assert the dot glyph, the border or the glyph colour.

- [x] **Task 3 — The modal holds the seed and derives usage** (AC: 5, 2) (FD2)
  - [x] `OrganismEditorModal.tsx`:
        ```ts
        import { usersByColorToken } from '@/lib/organisms/colorReuse';
        …
        // The seed is held, not recomputed: it is what Story 4.23 diffs the draft against (the
        // factory's own contract — "the draft is diffed against its seed"), and it is what makes
        // the FR-2.3 rule "the default never warns" a token comparison rather than a flag (FD2).
        // Story 4.17 replaces this ONE initialiser with the record.
        const [seed] = useState<OrganismDraft>(() =>
          createNewOrganismDraft(library.map((organism) => organism.colorToken)),
        );
        const [draft, setDraft] = useState<OrganismDraft>(seed);
        // Per render, unmemoised: `library` is the caller's unmemoised `sorted` (a `useMemo` keyed
        // on it would never hit), and the scan is 0.02–0.04 ms at 1,000 organisms (Story 3.7's
        // `library-filter` bench). Story 4.17 passes the library MINUS the organism under edit.
        const usersByToken = usersByColorToken(library);
        …
        <ColorPickerField
          value={draft.colorToken}
          onChange={setColorToken}
          usersByToken={usersByToken}
          seedValue={seed.colorToken}
        />
        ```
        The `library` prop's doc comment: "Read ONCE, at mount, for the M6 seed (Story 4.8) and on
        every render for the reuse warning (Story 4.9)". The component doc's "holds the editor's
        draft" sentence gains "and its seed". Nothing else in the file changes; Save stays
        `disabled`.
  - [x] `OrganismEditorModal.test.tsx` — **no render edits**. Add: (1) **warns through the
        modal**: `LIBRARY` holds Conway's Classic on `sky-blue`; open the palette, click
        `resolvePaletteColor(CONWAYS_CLASSIC.colorToken).name`'s radio → the dialog's
        `getByRole('status')` reads "Conway's Classic already uses this color." (derive the name
        from `CONWAYS_CLASSIC.name`, the token's display name from the registry); the strip and
        chip still agree (the 4.8 round-trip assertion, reused); Save is still `disabled` and the
        radio count is unchanged; (2) **the M6 default is silent at open**: status empty on mount
        (the 4.8 "opens on the M6 default" test grows this one line rather than a new test); (3)
        **silent on a colliding default**: a `FULL_LIBRARY` fixture using every `PALETTE` id once
        plus `sky-blue` again (build it from `PALETTE.map(...)`, never 21 literals) → the default
        is `PALETTE[1]` (least-used ties to registry order — `defaultColorToken` is the oracle),
        it is in use, and the status is **empty** on mount; picking `PALETTE[0]` then warns with
        **two** names. Scope every `getByRole('status')` to the dialog (`within(dialog)`).
  - [x] `OrganismLibrary.test.tsx` — **unchanged**, unless the reopen test's `PALETTE[10]` pick now
        collides with a mock (it does not: mocks use `vermillion`, `azure`, `bluish-green`; run it
        to be sure).

- [x] **Task 4 — e2e against the served static export** (AC: 1, 2, 3, 4, 8)
  - [x] `apps/web/e2e/organisms.spec.ts`: change the 4.8 block's last assertion (`:1359`) to the
        AC4 string. Append `test.describe('color reuse warning (Story 4.9)')` reusing the 4.8
        `openColorPicker` shape (copy the helper into the new block — the 4.8 block's is
        block-scoped; or hoist it to module scope, which is a pure move). The production seed is
        Conway's Classic on `sky-blue` (`:153-190`), so the literals are `'Sky Blue'` (PALETTE[0]
        — the colliding pick), `'Amber'` (PALETTE[3] — a free pick) and the sentence
        `"Conway's Classic already uses this color."` — each with the 4.7/4.8 literal-with-comment
        rule (this spec imports only `@gol/*`). Locate the region as
        `basicInfo.getByRole('status')` (the page's count badge is a second `status`, behind the
        inert backdrop — scoping to Basic Information is what keeps this unambiguous). Tests:
        1. **Opens silent, dots mark the seed's token only, zero console errors**: the status
           region is present and empty; expand; `[data-in-use="true"]` count is **1** and it is
           `[data-color-token="sky-blue"]`; the description reads the AC4 text.
        2. **A colliding pick warns and proceeds**: click the `Sky Blue` radio → the status region
           has the sentence, `[data-color-reuse-warning]` is visible; the radio `toBeChecked()`;
           `[data-selected-name]` reads "Sky Blue"; the palette collapsed (a pointer pick — 4.8
           FD7) and the warning is **still visible** under the chip row; the Save button's
           `disabled` attribute is unchanged before/after; `:enabled` radios (re-expanded) still 20.
        3. **Clears**: after test 2's pick, expand and click `Amber` → the status region is empty
           and the box is gone.
        4. **Keyboard**: focus the toggle, Enter, `ArrowLeft` from the checked `Vermillion`
           (PALETTE[1] → PALETTE[0], `Sky Blue`) → the status region has the sentence and the
           palette stays open (a keyboard pick — 4.8 FD7); `ArrowRight` → back on the seed, empty
           again (FD2).
        5. **axe with the warning visible** (after a `Sky Blue` pick, palette re-expanded so the
           dot is on screen) → `[]`. This is the scan that measures `--gol-danger` on the real
           column background and the `•` on a real fill.
  - [x] ⚠️ Run e2e against **this tree's** build: `deferred-work.md:1279-1289` records that
        `playwright.config.ts` reuses whichever worktree's `serve` holds port 4173. Either stop
        the other lane's server or run with a private port; state which in the Dev Agent Record.

- [x] **Task 5 — CVD re-confirmation, G5, the doc** (AC: 6)
  - [x] `apps/web/lib/palette/paletteCvd.ts`:
        ```ts
        /** WCAG 2.x relative luminance of an already-linearised colour — the entry point a
         *  CVD-simulated colour needs, since `simulateCvd` returns LinearRgb and there is no
         *  de-linearising function (nor should there be — see the header). */
        export function luminanceOfLinear({ r, g, b }: LinearRgb): number {
          return 0.2126 * r + 0.7152 * g + 0.0722 * b;
        }
        export function relativeLuminance(hex: string): number {
          return luminanceOfLinear(hexToLinearRgb(hex));
        }
        export function contrastRatioOfLinear(a: LinearRgb, b: LinearRgb): number { … }
        export function contrastRatio(hexA: string, hexB: string): number {
          return contrastRatioOfLinear(hexToLinearRgb(hexA), hexToLinearRgb(hexB));
        }
        ```
        Header: add the Story 4.9 sentence to "imported ONLY by its own test and by the Story 4.9 /
        6.11 re-confirmations" — it is now "and `themeTokens.test.ts`" too (already true; make the
        list honest).
  - [x] `paletteCvd.test.ts` — **G5**, after G4, same shape:
        ```ts
        // G5 — visibility under CVD simulation (Story 4.9). Every token, at every shade 0-7,
        // keeps contrast >= 2.5 against #0a0a0a with BOTH colours passed through the same
        // simulation (the background is near-neutral and the Machado rows sum to ~1, so it
        // barely moves — simulated anyway so the ratio is one colour space, not two). Closes
        // the ungated path palette-cvd-validation.md recorded: G1/G2 could not take a simulated
        // colour because `contrastRatio` took hexes. Measured worst: <fill in> (deutan).
        describe('G5 — visibility under CVD simulation', () => {
          it.each(PALETTE)('$id: contrast >= 2.5 vs #0a0a0a at every shade, under all 3 CVD simulations', …)
        });
        ```
        Threshold **2.5** (G2's — the same "graphical object, young cell" reasoning). Fill the
        measured worst into the comment from the sweep, not from the doc.
  - [x] `scripts/paletteCvdSweep.test.ts`: `minContrast(shade, mode)` — under a CVD mode both the
        pixel and `CLINICAL_LAB_BG` go through `simulateCvd` before `contrastRatioOfLinear`; the
        table column becomes per-row honest. Print an extra line: the all-shade contrast floor
        per mode (the G5 numbers).
  - [x] `docs/implementation-artifacts/palette-cvd-validation.md`: (1) fix the two reproduce
        commands' paths (`lib/palette/paletteCvd.test.ts`; the ⚠️ path-warning paragraph stays,
        corrected); (2) the "four hard gates" table becomes five, G5 row added with its measured
        worst; (3) replace the "⚠️ Contrast (G1/G2) is measured under normal vision only" paragraph
        with a short G5 paragraph; (4) the worst-pair table's contrast column refreshed from the
        sweep (the three sampled rows); (5) append `## Story 4.9 re-confirmation (2026-09-16)`:
        registry hexes unchanged since 2026-08-06 (the `git log` fact), G1–G5 floors as measured
        today, what changed in the code (the split, G5), and the pointer that 6.11 re-confirms
        against final rendered output; (6) "For Stories 4.9 and 6.11" → "For Story 6.11". Keep
        every existing paragraph otherwise — this is an append-and-correct, not a rewrite.
  - [x] ⚠️ If any gate is red on the current hexes: **stop**, record the numbers, flag Sidiar.
        Never lower a threshold, never edit a hex, never rename a token id (Decision I.4 — a
        persisted, destructive change).

- [x] **Task 6 — The FR-3.3 add-control collision test** (AC: 7)
  - [x] `apps/web/components/battle/editor/BattleEditorView.test.tsx`, inside `describe('Battle
        EditorView — the add control …')` (`:803`): a roster of one organism on `vermillion` and
        `ADD_LIBRARY`'s `New Arrival` (already `vermillion`); `selectOptions` the combobox, then
        the parent's rerender with `roster = [...roster, newArrival]` (the existing
        `rerender(<BattleEditorView …>)` shape two tests up) → `getAllByText('Shared colour')`
        has length **2** and both row buttons contain it. Comment: names `deferred-work.md`'s
        entry and that this is the assertion Story 2.10's Dev Notes asked for. **No production
        file under `components/battle/**` changes.**

- [x] **Task 7 — Bundle measurement, docs, verification** (AC: 9, 10)
  - [x] Measure before (on `main`, `457b232`, all four routes + the editor chunk — grep
        `.next/static/chunks/*.js` for `Organism Color`) and after Task 4; record both in the Dev
        Agent Record. Do **not** edit `budgetGzipKb`.
  - [x] `deferred-work.md`: strike as `✅ Resolved in Story 4.9` (prose kept — the 4.7 review's
        rule): the 4-8 section's "The description carries only the mockup's first sentence"
        item; `:56` (`contrastRatio` cannot accept a CVD-simulated colour); `:343` (no test adds
        a colour-colliding organism through the add control). Add `## Deferred from: Story
        4-9-color-reuse-warning-cvd-validation (2026-09-16)` with: (1) **the mockup's per-swatch
        `title` hints are not built** (FD4) — a `title` is not announced by every screen reader
        and is invisible to touch (the `<OrganismRoster>` reasoning); the dot is decorative and
        the information reaches AT at selection time through the status region; a mockup-refresh
        note; (2) **the mockup's 8 % danger tint is dropped** (FD5) — measured 4.57:1 for
        `--gol-danger` text on it, one axe rounding from the 4.5 floor, and Story 3.12 already
        rejected the 10 % variant at 4.45:1; if a tinted surface is wanted, it needs a
        `--gol-danger-text` token tuned for it (the `:305` entry) — Story 6.11's; (3) **the in-use
        dot's non-text contrast is not gated** — `--gol-text-primary` over a `--gol-bg-primary`
        shadow on every fill; SC 1.4.11 reaches it only if the dot is required to understand the
        control, and the status region carries the same fact; Story 6.11 may measure it; (4)
        **re-picking the seed token is silent** (FD2's recorded consequence) — a token
        comparison cannot tell "the default" from "the user chose the default"; PRD FR-2.3 is
        satisfied and the alternative is a provenance flag Story 4.8 AC3 forbade; flagged for
        Sidiar as a product nuance, not a defect; (5) **Story 4.17 must pass the library minus the
        organism under edit** to `usersByColorToken`, and seed `seedValue` from the record —
        otherwise every edit opens on a self-collision warning; (6) **G5 simulates the background
        too**; the doc's earlier manual figure (deutan 2.96) was taken one way or the other
        without saying — record which the gate does so the next re-tune compares like with like.
  - [x] `docs/project-context.md` — **no new rule**. Candidate only if a second story trips on it:
        "a `<span>` inside a `<label>` joins the control's accessible name — decorative marks in a
        label are pseudo-elements or `aria-hidden`".
  - [x] `npm run ci > ci.log 2>&1; echo $?` — paste the exit code, the bundle lines, the domain
        coverage line (unchanged) and the e2e summary into the Dev Agent Record. ⚠️ `deferred-work.
        md:1008-1016`: the LOCAL four-project matrix exits 1 on a pre-existing Story 3.12 e2e
        (macOS WebKit `Tab` → `<body>`); if that is what fails, say so with the test name and
        confirm the remote run instead — never "fix" it here. Push to
        `story/4-9-color-reuse-warning-cvd-validation`; check `gh run list --limit 1` after the PR
        opens.

### Review Findings

Reviewed on **Opus** (2026-09-16) against the **Sonnet** implementation in `2889375`, via three
parallel adversarial layers (Blind Hunter — diff only; Edge Case Hunter — diff + repo; Acceptance
Auditor — diff + this file + `project-context.md`). Diff: `main...HEAD` (merge base `457b232`).
CI on the pushed branch (PR #49, dev commit `2889375`): `quality` green (2m43s), `e2e` green (10m11s, Linux — which confirms the two local `battleRoute.spec.ts:2218` WebKit/tablet failures are the documented macOS-only flake, `deferred-work.md:1008-1016`, not a regression).

- [x] [Review][Patch] The in-use `::before` bullet JOINS the radio's accessible name in every browser — FD4's core premise is wrong [apps/web/components/organisms/editor/ColorPickerField.tsx:192] — accname §2F.ii includes CSS generated `content` in a label's text alternative, and all three engines implement it. Verified empirically with a minimal page in Chromium (CDP `Accessibility.getFullAXTree` names the radio `"• Sky Blue"`), and in Chromium/Firefox/WebKit via Playwright's name computation (`getByRole('radio', { name: 'Sky Blue', exact: true })` finds **0**, `'• Sky Blue'` finds 1). jsdom cannot observe generated content, so test (o) is vacuous on the point it is named for, and the e2e `getByRole('radio', { name })` calls are substring matches that pass either way. Fix: the CSS alt-text form `content: '"•" / ""'` — supported by all three bundled engines (computed `content` retained, name clean) and degrades to "no dot" where unsupported; FD4's mechanism (pseudo-element, no DOM node) is kept. Add a Playwright `toHaveAccessibleName('Sky Blue')` on the in-use radio — the guard that can actually fail — and correct the FD4 comment. (Also noted: the stated reason against the 4.8 `aria-hidden` span idiom — "a node axe still measures for contrast" — is false for this glyph: axe strips U+2022 as punctuation before measuring, which is why the `✓` node passes.)
- [x] [Review][Patch] `palette-cvd-validation.md` attributes commit `44972dc` to "Story 4.9" twice [docs/implementation-artifacts/palette-cvd-validation.md:17, :201] — it is the 2026-08-25 "HITL refactor: group lib/ and components/ into feature folders", which this story's own AC6 names correctly. A reproduce-path doc now blames the wrong event for the move.
- [x] [Review][Patch] The "imported ONLY by …" list is still not honest, in two places [apps/web/lib/palette/paletteCvd.ts:2, docs/implementation-artifacts/palette-cvd-validation.md:75] — `scripts/paletteCvdSweep.test.ts` (edited in this very diff) imports it and is named in neither; the two rewritten sentences also disagree with each other. Pre-existing omission, but Task 5 asked to make the list honest.
- [x] [Review][Patch] AC8's jsdom clause "on the modal after a colliding pick → `[]`" is not implemented [apps/web/components/organisms/editor/OrganismEditorModal.test.tsx:561] — the field scan (q) and the e2e scan exist; the modal gains no axe run after a colliding pick (Task 3 never listed it — an AC/Task inconsistency, resolved here in AC8's favour).
- [x] [Review][Patch] Modal test comments contradict the tests [apps/web/components/organisms/editor/OrganismEditorModal.test.tsx:581, :558] — "grows the 4.8 test … rather than a new test" sits on a new test; "the strip and chip still agree (the 4.8 round-trip assertion, reused)" is claimed but only `[data-selected-name]`, Save and the radio count are asserted. Add the cap-cell/probe assertion and fix the comment.
- [x] [Review][Patch] Test (k) omits the `[data-selected-name]` moved assertion the story specifies [apps/web/components/organisms/editor/ColorPickerField.test.tsx:359] — Task 2 (k) lists it; the test never touches it.
- [x] [Review][Patch] e2e test 2 is thinner than Task 4 specifies [apps/web/e2e/organisms.spec.ts:1419] — no `toBeChecked()` on the picked radio, and "Save's `disabled` attribute is unchanged before/after" is asserted as `toBeDisabled()` after only, which a *blocking* warning would also satisfy. Capture the attribute before the pick and compare.
- [x] [Review][Patch] Duplicate case labels and a miscounting Dev Agent Record [apps/web/components/organisms/editor/ColorPickerField.test.tsx:359] — the file already has `(k)`/`(l)` (4.8's FD7 cases); the new block restarts at `(k)`. Completion Notes say "9 new cases (k–q) … 11 existing" — k–q is 7, `main` had 13 (20 total is right).
- [x] [Review][Patch] `ReuseStatus = styled('div')({})` is a dead Emotion abstraction [apps/web/components/organisms/editor/ColorPickerField.tsx:246] — an empty styled component still registers a class and a wrapper for nothing, in a story that tracks the editor chunk to the byte. A plain `<div role="status">` does the same job.
- [x] [Review][Patch] Unused `contrastRatio` import left in the sweep [apps/web/scripts/paletteCvdSweep.test.ts:22] — `minContrast` moved to `contrastRatioOfLinear`; nothing calls it now (ESLint has no unused-vars rule on this file).
- [x] [Review][Patch] Empty-region assertions lean on jest-dom's `toHaveTextContent('')` special case [apps/web/components/organisms/editor/ColorPickerField.test.tsx:404, :419, :430, :455; OrganismEditorModal.test.tsx:586, :609] — it works only because of an explicit branch whose failure message says to use `toBeEmptyDOMElement()`, the idiom this story's own Dev Notes name and never use.
- [x] [Review][Patch] The silent-but-dotted seed state — the one state FD2 creates — is never asserted [apps/web/components/organisms/editor/OrganismEditorModal.test.tsx:592] — the colliding-default test proves silence but not that the selected seed swatch carries `data-in-use="true"` while the status is empty.
- [x] [Review][Patch] Doc and test nits, one commit [docs/implementation-artifacts/palette-cvd-validation.md:19, :125, :204; deferred-work.md:343; apps/web/lib/palette/paletteCvd.test.ts:157; apps/web/e2e/organisms.spec.ts:1437] — the "G5 all-shade floor per mode" line lists `normal`, which G5 does not gate (G2's); "the figures land on the same numbers recorded before this story" is true of the four shade-0 floors but the refreshed shade-3/7 CVD rows all changed (they were the reused normal-vision figure); the `**Date:** 2026-08-06` header now sits above 2026-09-16 content; `:343`'s "**✅ Resolved in Story 4.9.** the story's" is lowercase after the bold; G5 re-simulates the invariant background inside the innermost loop (the sweep hoists it); the e2e `toHaveCount(20)` lacks the 4.8 block's "20 = PALETTE.length" comment.
- [x] [Review][Patch] FD numbering means two stories in one header [apps/web/components/organisms/editor/ColorPickerField.tsx:28-52] — 4.8's FD1/FD4 and 4.9's FD1/FD3/FD4/FD5/FD6 now share numbers in one list; the old 4.8 FD6 line was replaced by a 4.9 FD6 with unrelated content. Prefix the 4.9 entries so "FDn" is unambiguous.
- [x] [Review][Defer] Two organisms sharing a display name (or both "Unnamed organism") read "A and A already use this color", and a second collision whose sentence is byte-identical is not re-announced by the live region [apps/web/lib/organisms/colorReuse.ts:39] — deferred, pre-existing: the schema allows duplicate names (Story 2.9's display rule), the sentence is still true, and disambiguating needs a product call (id suffix? count?) — recorded in `deferred-work.md`.


## Dev Notes

### Forced decisions (made here so the dev agent does not have to)

- **FD1 — Two required props on the field (`usersByToken`, `seedValue`); the field stays
  stateless and library-blind.** Story 4.8 AC6 fixed the field as a thin controlled view with no
  library read, and named this story as the one that adds "which tokens are in use". The
  narrowest honest shape is the derived map (token → names), because both surfaces need it: the
  dots need the key set, the sentence needs the names. `Organism[]` on the field would invite it
  to derive (and to grow a memo); a `Set<string>` plus a separate `warningNames` would be two
  props that must agree. `seedValue` rather than a `warn: boolean` computed by the modal keeps
  the FR-2.3 rule testable in the field's own test with no modal in the way, and keeps the modal
  ignorant of how the warning is decided. Both required, never optional-with-default — the
  Story 4.8 FD5 reasoning: an optional prop is how Story 4.24/4.25 ships a picker that never
  warns.

- **FD2 — "The default never warns" is `value !== seedValue`, with the seed held in modal state;
  no provenance flag, no per-render recomputation.** PRD FR-2.3 exempts the system-assigned
  default — including the least-used fallback, which by construction collides. Story 4.8 AC3
  forbade a "was this the default?" flag and told this story to compare tokens. Holding the seed
  draft in a second `useState` (initialised from the same factory call the live draft starts
  from) gives that comparison a stable referent, is exactly the object Story 4.23 will diff the
  draft against (`organismDraft.ts`'s header already promises it), and is immune to the Story
  4.8 FD9 loading-window seed (`library = []` → `PALETTE[0]`): a default is a default, so it stays
  silent even if the library arrives a frame later. Recomputing `defaultColorToken(library)` per
  render instead would flip that case into a spontaneous warning on a token the user never
  picked. The one consequence: re-picking the seed after picking something else is silent too.
  Recorded (Task 7 item 4), pinned by test (n), not engineered around — the fix is the flag AC3
  forbade.

- **FD3 — An always-mounted `role="status"` region, polite, whose content is the box or
  nothing.** Three shapes were on the table. `role="alert"` mounted on demand is the
  `<OrganismNameField>` FD4 idiom, but `alert` is assertive — right for an error the user must
  address, wrong for "non-blocking … the selection proceeds". A `status` region mounted **with**
  its content is not reliably announced (live regions must exist before their content changes);
  an always-present container whose children change is. Not a `title`, not `aria-describedby`
  on each in-use radio: a description on the radio plus the status text is the Story 3.13 trap-5
  double announcement ("Sky Blue, radio … Conway's Classic already uses this color" then the
  region reading the same sentence). One announced channel, at the moment the PRD says the
  warning is raised — selection. `<OrganismRoster>`'s "never `role="status"`" comment is about
  content present on first paint; this is an update the user just caused.

- **FD4 — The in-use dot is a CSS pseudo-element on the label; no `title`, no DOM node, no ARIA.**
  A `<span>•</span>` inside the `<label>` joins the radio's accessible name ("Sky Blue •") and
  breaks every 4.8 `getByRole('radio', { name })` exact match; `aria-hidden` on it would fix the
  name but leave a node axe still measures for contrast. A pseudo-element is outside the tree by
  construction. `::before`, because Story 4.8's selected glow already owns `::after` on the same
  element and a selected in-use swatch shows both. The mockup's `title` ("— in use by another
  organism (still selectable)") is dropped for the reason `<OrganismRoster>` records: not
  announced by every screen reader, invisible on touch. The dot's information reaches AT through
  FD3 at selection time.

- **FD5 — Warning text is `--gol-danger` on the column's own `--gol-bg-secondary`, with the
  mockup's translucent danger tint dropped.** Measured with the repo's own `contrastRatio`
  arithmetic: danger on bg-secondary **4.90:1** (already gated in `themeTokens.test.ts`); on the
  mockup's 8 % tint blended over bg-secondary **4.57:1**; on a 10 % tint **4.45:1** — the trap
  Story 3.12 FD2 (a) recorded when it refused a tinted hover for the same reason. 4.57 is one
  rounding from an axe failure on an 11px string, and the `rgba(255, 51, 102, 0.08)` literal (or
  `rgb(var(--gol-danger-channel) / 0.08)` — the lint regex matches the `rgb(` prefix regardless)
  is an AR-46 violation in a `.tsx` file. No new `--gol-*` token for a surface one control uses;
  the `border-left` carries the box's identity. `--gol-danger` for the text (the mockup's
  `--warning` IS `#ff3366`, Story 1.13's danger token) rather than the roster's
  `--gol-text-secondary` — the mockup is explicit and the pair is gated.

- **FD6 — The region sits after the palette grid, inside the fieldset.** Under the chip row and
  above the grid it would push the grid down on a keyboard pick — a layout shift under a roving
  focus, on every arrow press that crosses an in-use swatch. After the grid it is visible in both
  disclosure states (collapsed: directly under the chip row; open: under the swatches the user
  is arrowing through) and moves nothing the user is focused on.

- **FD7 — G5 simulates both the token and the background, at threshold 2.5.** The doc's manual
  figures (normal 3.06, protan 3.23, deutan 2.96, tritan 3.06) do not say whether `#0a0a0a` was
  simulated. It should be: a contrast ratio is defined within one colour space, and passing one
  simulated and one raw colour is the "plausible-looking but wrong" class the module header warns
  about. Practically it barely matters (the Machado rows sum to ≈ 1, so a near-neutral grey maps
  to a near-neutral grey) — which is why the gate can adopt it without moving the floor. 2.5 is
  G2's threshold: the same "graphical object, young cell" reasoning, now under simulation. If the
  measured deutan floor is not ≈ 2.96, the number is the finding — see Task 5's stop rule.

### What exists — read these before writing a line

| File | Why it matters here |
|---|---|
| `apps/web/components/organisms/editor/ColorPickerField.tsx` | **The file being modified.** Read all 304 lines: the props (`:216-220`), the header's FD6 hand-off (`:42`, `:56`), the `Description` string (`:257`), `Swatch`'s rule set with `::after` already taken by the selected glow (`:141-179`), `data-selected` as the state-driving attribute (`:286`), the FD7 pointer-collapse (`:236-252`). What is preserved: every 4.8 behaviour — one tab stop, native radios, the collapse, the three selection channels, `useId` per instance. |
| `apps/web/components/organisms/editor/ColorPickerField.test.tsx` | The `ControlledHarness` (`:21-35`), `jsdomNormalizedColor`, `openPalette`, the locators (`:37-43`), test (a)'s description assertion (`:66`), the axe `container` precedent (`:287-303`). Every 4.8 case must keep passing with the two props added. |
| `apps/web/components/organisms/editor/OrganismEditorModal.tsx:48-57, 174-201, 258-271` | The `library` prop doc (grows one clause), the draft `useState` (gains the held seed), the `basicInfo` fragment (the picker gains two props). Nothing else. |
| `apps/web/components/organisms/editor/OrganismEditorModal.test.tsx:28, 202-251` | `LIBRARY = [CONWAYS_CLASSIC, ...createMockOrganisms()]` — Conway's on `sky-blue`, mocks on `vermillion`/`azure`/`bluish-green`, so the M6 default is `PALETTE[3]` and `PALETTE[0]` is the colliding pick; the 4.8 round-trip test to reuse. |
| `apps/web/components/organisms/editor/OrganismNameField.tsx:55-66, 168-175` | `ErrorText` (11px, `--gol-danger`, `flex: 1; minWidth: 0`) and the `⚠︎` U+26A0 U+FE0E glyph idiom with its comment — the warning box copies the glyph and the colour, not the `role="alert"` (FD3). |
| `apps/web/components/battle/editor/OrganismRoster.tsx:110-126, 268-283` | The FR-3.3 sibling: "non-blocking in both directions", "real text, not a bare glyph with a `title`", and the "never `role="status"` for content present on first paint" reasoning FD3 distinguishes itself from. Read, do not modify. |
| `apps/web/components/battle/editor/BattleEditorView.tsx:495-512` | `findDuplicateColorIds` — the FR-3.3 count derivation `usersByColorToken` mirrors (a `Map<string, number>` pass; this story keeps names, not counts). Read only. |
| `apps/web/components/battle/editor/BattleEditorView.test.tsx:803-850` | The add-control `describe`, `ADD_LIBRARY` (`New Arrival` on `vermillion`), the `selectOptions` + `rerender` shape Task 6 extends. |
| `apps/web/lib/organisms/organismDraft.ts` | "the draft is diffed against its seed" — FD2's licence; the "grows one field per story" list is **unchanged** (this story adds no field). |
| `apps/web/lib/organisms/useOrganismEditorModal.ts` | **Untouched** — lifecycle only; a value import of anything from the modal defeats the dynamic boundary. |
| `apps/web/components/organisms/OrganismLibrary.tsx:249, 321-324` | `sorted` (unmemoised — why the modal does not `useMemo` on it) and the modal mount. **Untouched.** |
| `apps/web/lib/displayOrganisms.ts:54-74` | `toDisplayOrganism` and `UNNAMED_ORGANISM` — the empty-name fallback the sentence reuses. Already in `/organisms`'s first load. Read only. |
| `apps/web/lib/palette/defaultColorToken.ts` (+ test) | The M6 derivation (the oracle for Task 3's colliding-default test) and the pure-helper-in-`lib` shape `colorReuse.ts` mirrors. |
| `apps/web/lib/palette/paletteCvd.ts:1-58` | The header rule (test-only), `hexToLinearRgb`, `relativeLuminance`, `contrastRatio`, `simulateCvd` (`:131`) — the split lands here. |
| `apps/web/lib/palette/paletteCvd.test.ts:74-137` | G1–G4's shape (`it.each(PALETTE)`, `pixelHexAt`, `labFor`, `ALL_MODES`, `CVD_CORE`) — G5 copies G2's loop with `simulateCvd` on both sides. |
| `apps/web/scripts/paletteCvdSweep.test.ts` (+ `vitest.sweep.config.mts`) | `minContrast(shade)` (`:76-79`) is normal-vision only — Task 5 makes it per-mode. Run from `apps/web/`. |
| `apps/web/lib/themeTokens.test.ts:96-130` | The danger-text gate (bg-primary, bg-secondary; bg-hover deliberately excluded at 4.48) and the Story 3.12 tint note — FD5's evidence. **Untouched.** |
| `docs/implementation-artifacts/palette-cvd-validation.md` | The document AC3 refers to. Its reproduce paths are stale (`lib/paletteCvd.test.ts` → `lib/palette/…`), its "normal vision only" paragraph is what G5 closes, its last section is the re-tune rule Task 5 obeys. |
| `docs/planning-artifacts/ux-designs/…/clinical-lab-theme/organism-editor.html:275-297, 922, 927-950` | `.in-use::after`, `.color-reuse-warning` (there is **no markup instance** of the warning — the CSS is the only spec of its shape), the two-sentence description, the `title` hints. |
| `docs/planning-artifacts/ux-designs/…/organism-editor-design.md:168, 200, 757, 797` | "shows a warning", "still selectable", "[Organism Name] already uses this color", "no filtering". Its description text (`:168`) is superseded by the mockup's (the 4.8 precedent: the mockup wins). |
| `docs/implementation-artifacts/deferred-work.md:56, 305, 343, 1155-1196, 1279-1289` | The three items this story strikes; the danger-as-text entry FD5 leans on; the 4-8 section (FD9's loading window, the 4.17/4.25 notes); the Playwright port-reuse trap for local e2e. |
| `docs/implementation-artifacts/4-8-color-picker-selection-defaults.md` | FD1–FD9, the review patches (assert attributes exist; derive names; not-vacuous colour assertions; strike-not-rewrite), the bundle figures (`/organisms` 295.4 KB, editor chunk 5427 B before the mockup fix). |
| `docs/implementation-artifacts/lane-gates.yaml` | 4.15/4.24/4.25 gated on Epic 3; this story proposes no gate. |

### Architecture compliance

- **M6 / FR-2.3 / RFC-007 Decision 3** — every token always selectable; reuse warned, never
  blocked; the default (next-unused or least-used) raises nothing; usage derived from loaded
  organisms, no store; the picker shows names, never hexes (the sentence names organisms, the
  dots mark tokens — no hex appears anywhere).
- **FR-3.3** — the battle-side warning is untouched in code and gains its deferred assertion.
- **RFC-005 Decision 1 / AR-33** — the seed and the draft are ephemeral modal state; the field is
  a controlled view; no Context, no store, no repository (AR-2 / AR-27: `library` is the entity
  list the page boundary loaded).
- **AR-26 / NFR-8.3** — the CVD check stays documented and gated in the repo; G5 adds the
  simulated-visibility gate; no hex moves; token ids never change (Decision I.4).
- **AR-46 / RFC-003 Decision 3 / Decision J** — `styled()` + `var(--gol-*)` only; the mockup's
  `#fff`, `rgba(0,0,0,0.9)` and `rgba(255,51,102,0.08)` become `--gol-text-primary`,
  `--gol-bg-primary` and nothing (FD5).
- **AR-35 / bundle** — no new MUI module; everything new rides the lazy editor chunk;
  `paletteCvd.ts` never enters a bundle.
- **NFR-4.1** — the description now promises exactly what the build does.
- **NFR-2.1** — no `:has()`; `text-shadow` and `::before` are universal.
- **UX-DR7 / UX-DR17** — non-blocking warning, in-use marking, nothing disabled; keyboard
  operation unchanged; announced through a live region.
- **Spec-id hygiene** — `spec:check` tokenises `FR-2.3`, `FR-3.3`, `NFR-2.1`, `NFR-4.1`,
  `NFR-8.3`, `AR-2`, `AR-26`, `AR-27`, `AR-33`, `AR-35`, `AR-44`, `AR-46`, `RFC-003`, `RFC-005`,
  `RFC-007`, `Decision I`, `Decision J`, `M6`, `Story 4.9`, `Story 4.8`, `Story 4.17`, `Story
  4.23`, `Story 4.24`, `Story 4.25`, `Story 3.12`, `Story 3.13`, `Story 3.7`, `Story 2.9`, `Story
  2.10`, `Story 1.7`, `Story 1.13`, `Story 6.11`; write them exactly so. `UX-DR7`, `UX-DR17`,
  `FD*`, `G1`–`G5`, `SC n.n.n` are not checked.

### Library / framework notes (installed versions, no research needed)

- **React 19.2** — two `useState`s from one factory result: `useState(() => factory())` then
  `useState(seed)` — the second's initial value is read once; no effect, no `key`.
- **jsdom (Vitest 4) / @testing-library/dom** — `getByRole('status')` finds a `role="status"`
  div whether or not it has content; `toHaveTextContent('')` / `toBeEmptyDOMElement()` for the
  cleared state; a CSS pseudo-element never appears in the DOM or the accessible name (which is
  the point of FD4); `getByRole('radio', { name })` is an exact string match — the name must stay
  the palette entry's `name`.
- **vitest-axe / axe-core 4.12** — `color-contrast` measures the warning's `--gol-danger` text
  against the resolved ancestor background; jsdom has no computed colours, so the real
  measurement is e2e test 5. A `role="status"` container with no content raises nothing.
- **Playwright 1.62** — `getByRole('status')` scoped to a region; `toBeEmpty()` for the cleared
  state; `toHaveText(string)` is a whitespace-normalised FULL match and the box's text starts with
  the aria-hidden glyph — assert the sentence with `toContainText(sentence)` on
  `[data-color-reuse-warning]` (or `toHaveText(/already uses this color\.$/)`), never
  `toHaveText(sentence)` on the region; `locator('[data-in-use="true"]')` counts labels.
- **MUI 9.3.1 `styled()`** — `'&[data-in-use="true"]::before'` and the existing
  `'&[data-selected="true"]'` + nested `'&::after'` coexist as sibling keys on the same element.

### Testing standards

- `apps/web` has **no coverage gate** — every test guards a named failure: a warning that never
  appears (k), a sentence that miscounts (l), one that never clears (m), a default that warns
  (n, modal 3), a dot that joins the accessible name (o), a region mounted late (p), the FR-3.3
  add path never proven end to end (Task 6), a G5 floor that was only ever eyeballed (Task 5).
- `packages/*` **are not touched**; the domain/simulation coverage lines must read exactly as on
  `main`. `lib/organisms/colorReuse.ts` gets exact tests anyway.
- Never snapshot; never assert computed colours in jsdom; never mock `useId`; never assert on
  `PALETTE` **values** as literals in jsdom tests — index into `PALETTE`; the e2e's literals
  (`'Sky Blue'`, `'Amber'`, the sentence) each carry a comment naming their source.
- Story 4.8's tests are **retargeted** only where this story legitimately changes them: the two
  required props on every field render (mechanical), the description string in two places. If any
  other 4.1–4.8 test fails, the change is wrong, not the test.
- Do not add an `afterEach` that sweeps `[aria-hidden]` nodes (`deferred-work.md:785-793`).

### Previous story intelligence (Story 4.8)

- The field is complete for this story's purposes: `data-selected`, `data-color-token`, the
  `::after` glow, the disclosure, the `useId` discipline. This story adds two props, one
  attribute, one pseudo-element rule, one region — and changes one string.
- 4.8's review patches are this story's habits: assert the thing moved, not just that something
  did (the `✓` finding); derive expected names through the registry; make the e2e count a
  positive (`:enabled` to 20, never `:disabled` to 0); pin both sides of a "same string" claim to
  the LUT, not to each other; reword comments that name deleted things (the `DEFAULT_COLOR_TOKEN`
  finding) — here, the field header's "Story 4.9's surface" sentences become past tense.
- 4.8's owner review (PR #45 → #46) established that **the mockup wins over the design doc** for
  this column. Applied here to the description text and the dot; FD5 is the one place the mockup
  loses, to a measured AA number, and says so.
- 4.8 FD9 (the loading-window seed) is the case FD2's held seed is robust to — leave the deferred
  item as it is; nothing here re-seeds.
- 4.8 measured `/organisms` at 295.4 KB and the editor chunk at 5427 B **before** the mockup-fix
  commit (`9333074`); measure `main` fresh rather than trusting either figure.

### Git intelligence

`main` is at `457b232` (the lane-tooling merge after #46, the 4.8 mockup fix, and #47). The last
app-code commits are 4.8's (`components/organisms/editor/**`, `lib/palette/defaultColorToken.*`,
`lib/organisms/organismDraft.*`, `organisms.spec.ts`) and 3.15's (`components/battle/simulation/**`,
`lib/battle/**`, `battleRoute.spec.ts`). **Shared code surfaces with the open Epic 3 lane
(3.16–3.19): none** — they write `components/battle/simulation/**`, `components/battle/BattlePage
.tsx`, `lib/battle/**`, `battleRoute.spec.ts` (3.17 also `components/gallery/**`); this story writes
`components/organisms/editor/**`, `lib/organisms/colorReuse.*`, `lib/palette/paletteCvd.*`,
`scripts/paletteCvdSweep.test.ts`, `organisms.spec.ts`, **one test file** under
`components/battle/editor/` (Task 6 — a `describe` block no 3.x story touches) and docs. The only
file both lanes write is `deferred-work.md` (append-only sections plus three strike-throughs; the
Step S sync keeps both hunks).

### Project Structure Notes

- New: `lib/organisms/colorReuse.ts` (+ `.test.ts`).
- Modified: `components/organisms/editor/ColorPickerField.tsx` (+ test),
  `components/organisms/editor/OrganismEditorModal.tsx` (+ test), `lib/palette/paletteCvd.ts`
  (+ test), `scripts/paletteCvdSweep.test.ts`, `components/battle/editor/BattleEditorView.test.tsx`
  (test only), `e2e/organisms.spec.ts`, `docs/implementation-artifacts/palette-cvd-validation.md`,
  `docs/implementation-artifacts/deferred-work.md`, `sprint-status.yaml`.
- Naming: non-component TS camelCase, never dotted (`colorReuse.ts`); helpers
  `usersByColorToken`, `colorReuseWarning`, `luminanceOfLinear`, `contrastRatioOfLinear`; data
  attributes `data-in-use`, `data-color-reuse-status`, `data-color-reuse-warning`.
- Untouched on purpose: `OrganismLibrary.tsx` (+ test), `useOrganismEditorModal.ts` (+ test),
  `organismDraft.ts` (+ test), `defaultColorToken.ts`, `paletteRegistry.ts`, `displayColor.ts`,
  `colorMath.ts`, `displayOrganisms.ts`, `fieldStyles.ts`, `OrganismNameField/DominanceField/
  AgingToggleField.tsx`, `OrganismEditorLayout.tsx`, every production file under
  `components/battle/**`, `themes.css`, `theme.ts`, `themeTokens.test.ts`, all of `packages/*`,
  `playwright.config.ts`, `check-bundle-size.mjs` budgets, `docs/project-context.md`.

### What NOT to build

- ❌ No `useState` for the warning, the users, or "did the user pick" — FD1/FD2.
- ❌ No `useEffect` anywhere in the field or for the seed; no `useMemo` on `usersByToken` — AC5.
- ❌ No `role="alert"`, no `aria-live="assertive"`, no live region mounted on demand — FD3.
- ❌ No `aria-describedby` from a radio to the warning or to a per-swatch "in use" text — FD3
  (trap 5).
- ❌ No `<span>` dot inside the label, no `aria-hidden` dot node, no `title` on swatches — FD4.
- ❌ No `rgba`/`rgb(var(…))` tint, no `--gol-danger-tint` token, no `background` on the box — FD5.
- ❌ No `aria-invalid`, no disabled swatch, no Save state change, no dialog — AC1 (non-blocking
  in both directions).
- ❌ No change to `library`'s type, to `useOrganismEditorModal`, or to `<OrganismLibrary>`'s
  mount — the modal already has what it needs.
- ❌ No hex re-tune, no threshold lowered, no token renamed, no "G5 at 2.0 because it fits" —
  Task 5's stop rule.
- ❌ No change to `findDuplicateColorIds`, `<OrganismRoster>`, or any production file under
  `components/battle/**` — Task 6 is a test.
- ❌ No `Intl.ListFormat` for the sentence (a formatter with locale-dependent output in a test
  suite that asserts exact strings); the three hand-written shapes are the spec.
- ❌ No count badge, no "N organisms use this" tooltip, no per-swatch popover — not in any AC.

### Open flags for the owner (not blockers — the story proceeds on the FD)

- **Re-picking the seed token is silent** (FD2). PRD FR-2.3 is satisfied; whether a *deliberate*
  re-selection of the default should warn is a product nuance the token model cannot express
  without the provenance flag Story 4.8 AC3 ruled out. Recorded in Task 7 item 4.
- **The mockup's tinted warning surface is dropped** (FD5) for a measured AA margin. A tuned
  `--gol-danger-text` token would restore it — Story 6.11's palette pass.

### References

- `docs/planning-artifacts/epics.md:1091-1101` (Story 4.9 ACs), `:1078-1089` (4.8), `:191`
  (AR-26), `:1583` (6.11 re-confirms against final rendered output), `:641` (FR-3.3 in the
  battle).
- `docs/planning-artifacts/prds/prd-GameOfLife-2026-05-26/prd.md:172-178` (FR-2.3 in full — the
  warning wording, "raised only for a user's explicit color selection"), `:233-237` (FR-3.3),
  `:687-690` (NFR-8.3), `:624` (NFR-4.1), `:603` (NFR-2.1).
- `docs/planning-artifacts/architecture.md:352` (M6 — "two non-blocking warnings"), `:287`
  (Decision I.4), `:178` (Decision B.2 — why tokens, not hexes, are compared).
- `docs/planning-artifacts/rfcs/RFC-007-organism-colour-palette.md:110-117` (Decision 3 —
  reuse, warning text, usage derived from loaded organisms), `:75-78` (Decision 2 — the CVD
  validation mandate), `:108` (the "must be validated with CVD simulation" note the 1.7 doc
  discharges).
- `docs/planning-artifacts/ux-designs/ux-GameOfLife-2026-05-27/clinical-lab-theme/
  organism-editor.html:275-297, 922, 927-950`; `organism-editor-design.md:168, 200, 757, 797`.
- `docs/implementation-artifacts/palette-cvd-validation.md` (the whole document — G1–G4, the
  clamp limitation, the "normal vision only" limitation G5 closes, the re-tune rule).
- `docs/implementation-artifacts/4-8-color-picker-selection-defaults.md` (AC3, AC5, AC6, FD1,
  FD4–FD9, the review findings, the owner review); `4-5-organism-name-field.md` (FD4 — the alert
  idiom this story deliberately does not copy); `3-13-speed-control.md` (trap 5); `3-12-…` (FD2
  (a) — the tint measurement).
- `docs/implementation-artifacts/deferred-work.md:56, 305, 343, 785-793, 1008-1016, 1155-1196,
  1279-1289`.
- `docs/implementation-artifacts/lane-gates.yaml`.
- `docs/project-context.md` — Framework rules (three state categories; no repository import;
  `styled()` + tokens), Testing rules (axe; never snapshot; no coverage padding; the Playwright
  viewport band), Code Quality (AR-46 and its lint regex; `spec:check`; camelCase files; comments
  explain why), Commit gate.

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5 (claude-sonnet-5).

### Debug Log References

- `npm run ci > ci.log 2>&1; echo $?` — first run exited 1 on `format:check` (4 files needed
  `prettier --write`, no logic change); fixed and re-run. Second run exited 1 on
  `web#e2e` — two failures, both `battleRoute.spec.ts:2218` ("Tab reaches Play, Next cycle, Stop &
  reset in order …", Story 3.12), on `webkit` and `tablet` only. This is the pre-existing,
  documented local-only flake at `deferred-work.md:1008-1016`: plain `Tab` lands on `<body>` on
  macOS WebKit/tablet while Linux CI WebKit passes; "Pre-existing and CI-green, so not changed
  here." Confirmed unrelated to this story — `organisms.spec.ts` (including all 5 new "color reuse
  warning (Story 4.9)" tests) passed on all 4 projects, 216/216. Not fixed, per Task 7's explicit
  instruction and the deferred-work entry's own resolution. Will confirm via `gh run list --limit
  1` once the branch is pushed and CI (Linux) runs.
- Total local e2e: 650 passed, 2 failed (the above, pre-existing), 4 skipped.
- Bundle: measured on `main` (`457b232`) before this story and on this branch after Task 4 (see
  Completion Notes). No budget changed.
- `packages/domain` / `packages/simulation` `test:coverage`: Turbo cache HITS on both runs
  (`8f863d63f8a45b7b` / `8127544fa776f372`) — inputs unchanged, coverage lines read exactly as on
  `main`.
- No other lane's `serve` was holding port 4173 (`lsof -i :4173` empty before the run) —
  `playwright.config.ts`'s `webServer` built and served this tree's own `out/`.

### Completion Notes List

- Task 1: `usersByColorToken`/`colorReuseWarning` added to `apps/web/lib/organisms/colorReuse.ts`
  (pure, no React/DOM). 11 unit tests, including input-order preservation (reversal-pinned) and the
  empty-name fallback sourced from `toDisplayOrganism` rather than a literal.
- Task 2: `ColorPickerField` gained the two required props (`usersByToken`, `seedValue`), the
  in-use `::before` dot, the always-mounted `role="status"` reuse-warning region, and the AC4
  description text. 7 new cases (k–q) added to its test file on top of the 13 existing 4.8 cases
  (all retargeted via a `renderField`/`NO_USERS` helper, mechanical only — no 4.8 assertion
  content changed). 20/20 tests pass. *(Counts corrected in review: the record said 9 + 11.)*
- Task 3: `OrganismEditorModal` now holds a second `useState` for the seed draft and derives
  `usersByToken` from `library` per render (unmemoised, per FD — Story 3.7's measured 0.02–0.04 ms
  at 1,000 organisms). 3 new tests added (warn through the modal; M6 default silent at open; a
  colliding default stays silent and a different pick warns with two names). 25/25 tests pass,
  zero render edits to the 22 pre-existing cases.
- Task 4: `e2e/organisms.spec.ts` — the 4.8 description-text assertion retargeted (1 line) and a
  new `describe('color reuse warning (Story 4.9)')` block (5 tests) appended, reusing the 4.8
  `openColorPicker` shape. All 4 Playwright projects green (chromium/firefox/webkit/tablet),
  216/216 in this file alone.
- Task 5: `paletteCvd.ts` split `relativeLuminance`/`contrastRatio` into `luminanceOfLinear`/
  `contrastRatioOfLinear` (linear-input) plus thin hex wrappers (no behaviour change to the
  existing four gates — confirmed by the pre-existing 46 tests staying green). Added G5 (20 new
  cases: every token, every shade, all 3 CVD types, both sides simulated) — **measured worst: 2.96
  (deutan, `bluish-green`, shade 0)**, matching the doc's prior manual figure exactly and clearing
  the 2.5 floor on every mode. **G5 is green; the Task 5 stop rule was not triggered** — no hex
  re-tuned, no threshold lowered, no token id renamed. `paletteCvdSweep.test.ts`'s `minContrast`
  now takes an optional CVD mode and simulates the background too; the worst-pair table and a new
  "G5 — all-shade contrast floor per mode" line were regenerated and pasted into
  `palette-cvd-validation.md`, which also gained the "Story 4.9 re-confirmation" section, the
  five-gate table, and the corrected reproduce paths.
- Task 6: one new unit test in `BattleEditorView.test.tsx`'s existing add-control `describe` — a
  roster organism and the add library's `New Arrival` both on `vermillion`, added through the
  combobox; both rows read "Shared colour" after the parent's rerender. No production file under
  `components/battle/**` changed.
- Task 7: bundle measured before (`main`, `457b232`) and after (this branch, post-Task 4):

  | route | before | after | budget | Δ |
  |---|---|---|---|---|
  | home (/) | 333.4 KB | 333.4 KB | 340 | 0.0 |
  | battle (/battle) | 308.7 KB | 308.7 KB | 310 | 0.0 |
  | battle/new | 308.6 KB | 308.7 KB | 310 | +0.1 |
  | organisms (/organisms) | 295.3 KB | 295.4 KB | 305 | +0.1 |
  | editor chunk (gzip) | 5706 B | 6170 B | — | +464 B |

  Every route within ±0.5 KB (AC10); no budget raised; `packages/*` untouched;
  domain/simulation coverage lines unchanged (Turbo cache hits). `deferred-work.md` struck three
  items (`:56`, `:343`, and the 4-8 section's description item) and gained a new "Deferred from:
  Story 4-9…" section with the six items the story's Dev Notes named (per-swatch `title` hints not
  built, the dropped tint, the ungated dot contrast, the silent-seed-repick nuance, the Story 4.17
  hand-off, and the G5-simulates-the-background note). `docs/project-context.md` — no new rule
  added, per the task (candidate only, not triggered a second time). Full `npm run ci` run: see
  Debug Log References — green except the pre-existing, documented, unrelated WebKit/tablet e2e
  flake.

### File List

- `apps/web/lib/organisms/colorReuse.ts` (new)
- `apps/web/lib/organisms/colorReuse.test.ts` (new)
- `apps/web/components/organisms/editor/ColorPickerField.tsx`
- `apps/web/components/organisms/editor/ColorPickerField.test.tsx`
- `apps/web/components/organisms/editor/OrganismEditorModal.tsx`
- `apps/web/components/organisms/editor/OrganismEditorModal.test.tsx`
- `apps/web/lib/palette/paletteCvd.ts`
- `apps/web/lib/palette/paletteCvd.test.ts`
- `apps/web/scripts/paletteCvdSweep.test.ts`
- `apps/web/components/battle/editor/BattleEditorView.test.tsx`
- `apps/web/e2e/organisms.spec.ts`
- `docs/implementation-artifacts/palette-cvd-validation.md`
- `docs/implementation-artifacts/deferred-work.md`
- `docs/implementation-artifacts/sprint-status.yaml`

### Change Log

- 2026-09-16 — Story file created (create-story): ACs decomposed, FD1–FD7 recorded, precedent
  and spec map compiled; status → ready-for-dev.
- 2026-09-16 — Implementation complete (dev-story): all 7 tasks done, all ACs satisfied. G5 gate
  green (measured worst 2.96, deutan) — Task 5's stop rule not triggered, no hex/threshold/id
  changed. Bundle within budget on every route (±0.1 KB); no budget raised. Local `npm run ci`
  green except the pre-existing, documented WebKit/tablet transport-controls e2e flake
  (`deferred-work.md:1008-1016`), confirmed unrelated (all Story 4.9 e2e tests pass on all 4
  projects). Status → review.
- 2026-09-16 — Code review (Opus, `bmad-code-review`, full mode; PR #49): 14 patches applied, 1
  deferred, 13 dismissed, 0 decision-needed. The material finding: the in-use `::before` bullet
  joined the radio's accessible name in every browser ("• Sky Blue") — fixed with the CSS alt-text
  form `content: "•" / ""` and pinned by an exact `toHaveAccessibleName` e2e guard; plus AC8's
  missing modal axe scan, the thinner-than-spec assertions in (k), the modal tests and e2e test 2,
  the dead `styled('div')({})` wrapper, the `44972dc` misattribution and importer-list omissions
  in `palette-cvd-validation.md` / `paletteCvd.ts`, and the duplicate (k)/(l) case labels. After
  patches: typecheck/lint/format/spec green; 111/111 in the three touched unit files; 44/44 e2e
  (4.8 + 4.9 blocks, all four projects); bundle within budget, editor chunk 6168 B gzip. Status →
  done.

Dev Model: sonnet   # follows the 4.5–4.8 editor-field pattern (two props on an existing controlled field, a pure helper in lib, a modal wiring change); the shaping choices — the held seed for 4.17/4.23, the usersByToken prop shape for 4.24/4.25, one announced channel, G5 — are pinned as FD1–FD7 so nothing is left for later stories to discover
Proposed lane gate: none

---

This story was implemented with the 'Implement next story' skill with the following stats:

| Phase | Agent model | Agents | Active | Wall clock | Input | Output | Cache write | Cache read | Total tokens |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Step 0 — re-entry guard | — | 0 | 31s | 31s | 16 | 3,887 | 6,185 | 436,322 | 446,410 |
| Step 1 — create-story | opus-5 | 1 | 15m 00s | 15m 00s | 158 | 66,473 | 405,029 | 11,654,628 | 12,126,288 |
| Step 2 — dev-story | sonnet-5 | 1 | 26m 28s | 26m 28s | 732 | 92,482 | 1,259,727 | 83,377,542 | 84,730,483 |
| Step 3 — code review + PR | opus-5 | 4 | 30m 38s | 30m 38s | 432 | 114,322 | 1,104,566 | 25,036,021 | 26,255,341 |
| _of which the orchestrator_ | opus-5 | — | — | — | 52 | 11,433 | 30,099 | 1,566,645 | 1,608,229 |
| **Total (create-story → PR ready)** | | 6 | **1h 12m** | 1h 12m | 1,338 | 277,164 | 2,775,507 | 120,504,513 | **123,558,522** |

Run started 2026-09-16 22:24 CEST; wall clock runs to the point the run stopped for the owner's review. No idle gaps were excluded; Active and Wall clock agree. (A gap counts as idle above 15 min.) Each phase row covers the phase agent, any agents it spawned, and the orchestrator's own turns in that window — the orchestrator row breaks its share out again, it is not additional. Cache reads dominate the token totals and are billed at a fraction of input rate, so read the Input and Output columns for effort and the total only as a ceiling. The orchestrator's final turn is still being written when these numbers are taken.
