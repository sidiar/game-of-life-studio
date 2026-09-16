---
baseline_commit: ec350f8
---

# Story 4.8: Color Picker & Selection Defaults

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a user,
I want to pick my organism's color from the palette,
so that it's recognizable on the grid.

## Acceptance Criteria

From `epics.md#Story 4.8: Color Picker & Selection Defaults` (`:1078-1089`), decomposed into what a
reviewer can check independently. AC6–AC10 are repo-derived: the obligations the shipped shell
(Story 4.3), the layout's slot contract (Story 4.4), the draft seam (Story 4.5 / 4.6 / 4.7), the
`colorToken` stopgap Story 4.7 left for this story, the Story 1.7 palette registry's own contract
and the CI gates already impose on "the fourth control inside the editor".

1. **The Basic Information column renders an Organism Color control between the name field and
   the dominance control: a visible group label "Organism Color", the description "Pick any color
   — colors are reusable.", the selected colour as a 44×44 chip (3px border in the colour, a
   soft glow in the colour) with the palette entry's `name` as visible text beside it and a
   "Change Color ▾" disclosure button that opens the palette — collapsed at mount — as every one
   of the palette's tokens in an 8-per-row swatch grid (the mockup, `organism-editor.html:212-254,
   919-952`; the design doc's 100×100 / always-open layout is superseded — Sidiar, 2026-09-16).**
   `<ColorPickerField>` (new,
   `components/organisms/editor/`) mounts through `<OrganismEditorLayout basicInfo={…}>` as the
   **second** child of the existing fragment — `name → color → dominance → aging`, the mockup's
   order (`organism-editor.html:919-952`), closing the 4.6 deferred item "the mockup's
   Color-before-Dominance order is not followed". Never a fourth region, never a child of the
   layout. The swatch count is `PALETTE.length` — derived, never a literal 20 (RFC-007 Decision 2:
   the palette is developer-extensible; a hard-coded count is the bug the token model exists to
   prevent). Swatches iterate `PALETTE` **in registry order** — that order is load-bearing data
   (`paletteRegistry.ts:28-31`), and the picker is the second place after the default derivation
   where it shows. Mockup `organism-editor.html:212-297` (CSS), `:919-952` (markup), `:1263-1285`
   (script); design doc `organism-editor-design.md:163-206`. (FR-2.3, UX-DR7)

2. **The picker is a real radio group: keyboard-operable, one tab stop, correctly named and
   described.** A `<fieldset role="radiogroup">` whose `<legend>` is the visible "Organism Color"
   label (FD1) — `getByRole('radiogroup', { name: 'Organism Color' })` resolves in jsdom, axe and
   Playwright; `aria-describedby` points at the description. Each swatch is a `<label>` wrapping a
   **visually-hidden native `<input type="radio">`** (the `GridSettingsSection.tsx` idiom, copied
   — never imported across the mode split) whose accessible name is the palette entry's `name`
   (`getByRole('radio', { name: 'Sky Blue' })`) — never a hex, never the token id (RFC-007
   Decision 3: "the picker shows the swatch + `name`, never a raw hex"). All radios share one
   `useId()` `name`. Tab order inside Basic Information: name textbox → the **checked** radio (the
   group's single tab stop) → slider → dominance textbox → switch. Arrow keys move and select
   within the group, wrapping (native radio behaviour — nothing hand-rolled); Space on an
   unchecked focused radio checks it; a label click checks its radio (one `change`, one
   `onChange`). The selected state is carried by **three channels** (WCAG 1.4.1): the native
   `checked` state (what AT reads — no `aria-checked` attribute is written), an inset accent ring
   separated from the fill by a background-coloured gap, and a centred `✓` mark (FD4). The large
   display and the `✓` are `aria-hidden`; the selected entry's `name` text is plain text, not a
   live region (the radio change already announces it — Story 3.13 trap 5). (UX-DR17)

3. **A new organism opens on the M6 default token — the next unused palette token in registry
   order, falling back to the least-used token (ties by registry order) once every token is in
   use — derived from the loaded library, and the draft is the single holder of the value.**
   `defaultColorToken(usedColorTokens)` (new, pure, `lib/palette/defaultColorToken.ts`, FD2)
   walks `PALETTE`; `createNewOrganismDraft(usedColorTokens: readonly string[])` takes the
   library's tokens and seeds `colorToken` from it (FD3) — the Story 4.7 stopgap seed
   (`DEFAULT_COLOR_TOKEN`) is **replaced, not joined**: after this story no line in
   `organismDraft.ts` mentions `DEFAULT_COLOR_TOKEN`. `<OrganismEditorModal>` gains one required
   prop, `library: readonly Organism[]` (FD5), reads `library.map((o) => o.colorToken)` **once, in
   the `useState` lazy initialiser**, and passes `value={draft.colorToken}` /
   `onChange={setColorToken}` (a functional `setDraft` update, the `setAgingEnabled` shape).
   `<OrganismLibrary>` passes `library={sorted}`. The system-assigned default raises **no**
   warning of any kind (PRD FR-2.3: "the warning is raised only for a user's explicit
   selection") — trivially true here since Story 4.9 owns the warning, but the derivation must not
   grow a "was this the default?" flag for 4.9 to consume; 4.9 compares tokens, not provenance. A
   fresh draft per open is still the `mounted` gate's doing — no reset effect, no `key`. (FR-2.3,
   M6, RFC-007 Decision 3, RFC-005 Decision 1)

4. **Selecting a swatch updates the large display, its name text and the aging example strip on
   the same commit; the preview grid follows by construction.** The draft's `colorToken` is the
   only source: `<AgingToggleField colorToken={draft.colorToken}>` already re-derives its eight
   cells from it (Story 4.7 AC4, test (j)), and Story 4.14's preview grid will read the same
   field — this story adds **no** second channel (no callback into the strip, no event, no
   context). Pinned three ways: the large display's inline background, the selected swatch's
   inline background and strip cell `MAX_AGE_SHADE`'s inline background are the **same string**
   (`displayColor(token, MAX_AGE_SHADE)` — the identity shade `<OrganismCard>` and
   `<OrganismRoster>` paint, so the picker can never disagree with the card or the dish). (FR-2.3,
   UX-DR7, RFC-007 Decision 4)

5. **No swatch is ever disabled, greyed, hidden or filtered.** Every radio is enabled; the
   in-use state is **not** marked in this story (the mockup's `.in-use::after` dot and the
   `title` hints are Story 4.9's colour-reuse surface — FD6). Collapsed is not hidden in this
   sense: the mockup's "Change Color ▾" disclosure hides the whole grid until opened (FD7), never a
   subset of it. `disabled` is not a prop of `<ColorPickerField>`.
   (M6, UX-DR7)

6. **The picker is a thin controlled view; it holds no state of its own.** Props are exactly
   `{ value: string; onChange(colorToken: string): void }`. No `useState`, no `useEffect`, no
   repository, no library — the field does not know which tokens are in use (that is 4.9's
   addition). A `value` outside `PALETTE` checks no radio and shows the registry's fallback entry
   through `resolvePaletteColor` (Decision I.4's degrade-and-warn — Story 1.7's contract, not
   re-tested here); it is unreachable today because the seed comes from `PALETTE`.

7. **axe passes with the control in place, in jsdom and in the served app, on the default and on
   a user-picked swatch.** vitest-axe on `<ColorPickerField>` → `[]`; on `<OrganismEditorModal
   open origin="library" library={…}>` → `[]`; `@axe-core/playwright` on `/organisms` with the
   dialog open and a non-default swatch selected → `[]`. Chrome colours are `--gol-*` tokens
   throughout (AR-46); the **only** non-token colours are organism colours, applied as inline
   `style` strings from the LUT (the `<OrganismCard>` precedent), and the `✓` mark's ink is
   `--gol-bg-primary` — every palette token clears ≥ 5.12:1 against it (G1,
   `palette-cvd-validation.md:79`), so the mark passes axe's 4.5:1 on every swatch. No new
   `--gol-*` token, no `transition` anywhere in the control (Story 4.5 FD5), no `:has()`
   (NFR-2.1's Firefox 112 floor). (AR-46, UX-DR17, NFR-8.3)

8. **Every existing guard is retargeted, never loosened, and the shared field chrome grows
   rather than being copied.** `OrganismEditorModal.test.tsx`'s Basic-Information guard becomes
   "exactly two textboxes, one slider, one switch **and `PALETTE.length` radios**, all inside
   Basic Information"; its tab-order test grows one `user.tab()` between the name field and the
   slider (the checked radio); every `render(<OrganismEditorModal …/>)` in that file and in
   `useOrganismEditorModal.test.tsx:78` gains `library={…}` (a required prop — FD5).
   `OrganismLibrary.test.tsx`'s reopen test grows a swatch pick before the exit and asserts the
   default is back after; one new test there pins the M6 seed against a fixture that **contains
   Conway's Classic** (FD8 — with the mocks-only fixture the derived default coincides with
   `DEFAULT_COLOR_TOKEN` and the test cannot tell the derivation from the stopgap it replaced).
   `fieldStyles.ts` gains `Fieldset` and `Legend` sharing the `Label` rule set through one object
   (FD1); `OrganismNameField.test.tsx`, `DominanceField.test.tsx`, `AgingToggleField.test.tsx`,
   `OrganismEditorLayout.test.tsx` and every earlier e2e block run **unedited**. (AR-44)

9. **The bundle gate passes and no route's first load moves.** `npm run build:standalone` +
   `node scripts/check-bundle-size.mjs` before (on `main`, `ec350f8`) and after, all four routes
   and the editor chunk recorded both times. Everything new is imported **only from files already
   inside the lazy editor chunk** (4744 B gzip after 4.7); `PALETTE`, `displayColor` and
   `resolvePaletteColor` are already in `/organisms`'s first load through `<OrganismCard>`;
   `OrganismLibrary.tsx` gains a prop, not an import; `useOrganismEditorModal.ts` changes a
   **type name only**. `/organisms` (budget 305, baseline **295.3 KB**), `/battle` (308.7 of 310 —
   1.3 KB of headroom, the tightest route) and `/` stay within ±0.5 KB noise; `lib/palette/
   colorMath.ts` and `displayColor.ts` are **not touched** (FD4 keeps the glow in CSS precisely so
   nothing in `/battle`'s module graph changes). A move of ≳ +1 KB on any route means a new
   module was imported from a first-load file — a finding, not a number to nudge. **No budget is
   raised.** `npm run ci > ci.log 2>&1; echo $?` green locally (exit code to a file, never piped)
   and CI on the pushed branch checked with `gh run list --limit 1`, not inferred.

10. **`packages/*` are untouched.** The derivation lives in `apps/web/lib/palette/` because it
    walks `PALETTE`, which only `apps/web` can import (Story 1.7: no DOM, no registry in
    `packages/*`); it is not referential-integrity logic (project-context "core" rule), so AR-39's
    ≥ 90 % gate does not apply — but it still gets an exact unit test plus a property test.
    The domain/simulation coverage lines read exactly as on `main`.

## Tasks / Subtasks

- [x] **Task 1 — The M6 derivation, pure** (AC: 3, 10) (FD2)
  - [x] `apps/web/lib/palette/defaultColorToken.ts` (no React, no DOM):
        ```ts
        import { PALETTE } from './paletteRegistry';
        /**
         * FR-2.3 / M6 / RFC-007 Decision 3: the token a NEW organism defaults to. The first
         * registry entry no organism uses, in registry order ("safe core first" — tokens 1–8 are
         * the CVD-robust core, so small libraries stay in it without effort); once every entry is
         * in use, the entry with the fewest users, ties to the earlier registry position (PRD
         * FR-2.3: "least-used … ties broken by palette order"). `usedColorTokens` is one entry per
         * organism (duplicates count — that is what "least-used" measures); tokens not in the
         * registry are ignored, since they occupy no palette entry. Never throws, never returns a
         * token outside PALETTE, and never reads DEFAULT_COLOR_TOKEN — the empty-library answer is
         * PALETTE[0] because it is first, not because it is the default.
         */
        export function defaultColorToken(usedColorTokens: readonly string[]): string
        ```
        Implementation: count into a `Map<string, number>`; first pass returns the first
        `PALETTE` entry with no count; second pass keeps the entry with the strictly smallest
        count (`<`, so the earlier entry wins ties). Two passes over 20 entries — no sort, no
        allocation beyond the map. Header comment: why it is in `lib/palette/` (it walks the
        registry's order, which is that module's data) and not `lib/organisms/` or `@gol/domain`
        (the registry cannot be imported from `packages/*`); cite `(FR-2.3)`, `(M6)`,
        `(RFC-007)`, `(Story 4.8)`, `(Story 1.7)`.
  - [x] `defaultColorToken.test.ts` — exact cases, every number derived from `PALETTE`:
        (1) `[]` → `PALETTE[0].id`; (2) `[PALETTE[0].id]` → `PALETTE[1].id`; (3) the first three
        ids in any order → `PALETTE[3].id` (input order is irrelevant); (4) every id once →
        `PALETTE[0].id` (all tied at 1 → registry order); (5) every id once plus `PALETTE[0].id`
        again → `PALETTE[1].id`; (6) every id twice plus every id but `PALETTE[5].id` a third time
        → `PALETTE[5].id`; (7) `['not-a-token']` → `PALETTE[0].id` and `[PALETTE[0].id,
        'not-a-token']` → `PALETTE[1].id` (unknown tokens occupy nothing); (8) duplicates of an
        unused token do not make it used: `[PALETTE[1].id, PALETTE[1].id]` → `PALETTE[0].id`.
        Plus **fast-check** (installed; `lib/canvas/dirtyCells.test.ts` is the import shape):
        for an arbitrary array drawn from `PALETTE` ids ∪ two unknown strings, the result is in
        `PALETTE`; if some id is unused the result is unused and no earlier registry entry is
        unused; otherwise the result's count is the minimum and no earlier entry shares that
        count. Do not spy on `console.warn` — this module never calls `paletteIndexOf`.

- [x] **Task 2 — The draft seeds from the library** (AC: 3) (FD3)
  - [x] `apps/web/lib/organisms/organismDraft.ts`: `createNewOrganismDraft(usedColorTokens:
        readonly string[]): OrganismDraft` returns `{ name: '', dominance:
        NEW_ORGANISM_DOMINANCE, agingEnabled: false, colorToken:
        defaultColorToken(usedColorTokens) }`. Delete the `DEFAULT_COLOR_TOKEN` import and the
        whole "seeds at `DEFAULT_COLOR_TOKEN` as a stopgap" sentence; replace with: `colorToken`
        is the M6 default for the library the editor opened over — the caller passes one token
        per organism (Story 4.25's battle-origin editor passes the same list; Story 4.17 does not
        call this factory at all, it seeds from the record). Update the "grows one field per
        story" list: 4.8 done; 4.10 adds `survivalRules`.
  - [x] `organismDraft.test.ts`: the seed test takes a fixture of tokens and asserts
        `colorToken === defaultColorToken(fixture)` **and**, with `[PALETTE[0].id]`, equals
        `PALETTE[1].id` (a value the stopgap could not have produced — the test that would have
        gone red on the old seed); keep "distinct object per call" (now
        `createNewOrganismDraft([])` twice).

- [x] **Task 3 — The shared chrome grows `Fieldset` / `Legend`** (AC: 8) (FD1)
  - [x] `apps/web/components/organisms/editor/fieldStyles.ts`: lift `Label`'s rule set into a
        module-level `const labelRules = { display: 'block', fontSize: '13px', fontWeight: 500,
        color: 'var(--gol-text-primary)', margin: '0 0 8px 0' } as const;` and define
        `export const Label = styled('label')(labelRules);` (byte-identical output — the proof is
        that the three field tests run unedited). Add:
        ```ts
        // A grouped control's `Field`: the UA's fieldset chrome reset (border, padding, and the
        // `min-inline-size: min-content` default that stops a fieldset shrinking inside a flex
        // column), then exactly `Field`'s rhythm. `<ColorPickerField>` is the first caller; a rule
        // group (Story 4.11's condition rows) is the next candidate.
        export const Fieldset = styled('fieldset')({ border: 0, padding: 0, minWidth: 0, margin: '0 0 20px 0' });
        // `Label`'s rules on the element that names a fieldset. `padding: 0` because legends carry a
        // UA inline padding `Label` never had.
        export const Legend = styled('legend')({ ...labelRules, padding: 0 });
        ```
        Header comment: add one sentence naming the two additions and that `labelRules` is the
        one place the label typography lives.

- [x] **Task 4 — `<ColorPickerField>`** (AC: 1, 2, 4, 5, 6, 7)
  - [x] `apps/web/components/organisms/editor/ColorPickerField.tsx` — `'use client'`; `styled`
        from `@mui/material/styles` only; `useId` from React; `Fieldset`, `Legend`, `Description`
        from `./fieldStyles`; `PALETTE`, `resolvePaletteColor` from `@/lib/palette/paletteRegistry`;
        `displayColor`, `MAX_AGE_SHADE` from `@/lib/palette/displayColor`. ❌ No
        `@mui/material/Radio` / `RadioGroup` / `FormControlLabel` (FD1 — the 4.6/4.7 reasoning:
        new MUI modules in the chunk, DOM that matches no mockup locator, and the
        `cssVariables: true` derived-token trap `deferred-work.md:87` records). ❌ Nothing
        imported from `components/battle/**` — `HiddenRadio` and `VisuallyHidden` are **copied**
        from `GridSettingsSection.tsx:132-160` with their comments (the 4.6 slider precedent;
        third copy of `VisuallyHidden` is deferred-work material, not this story's — see Task 7).
        Props:
        ```ts
        export interface ColorPickerFieldProps {
          /** The draft's palette token. */
          value: string;
          onChange(colorToken: string): void;
        }
        ```
  - [x] Structure and styles (mockup `organism-editor.html:212-297, 919-952`, design doc
        `:184-206`; every chrome colour a `--gol-*` token — AR-46; organism colours inline; no
        `transition` anywhere):
        ```
        <Fieldset role="radiogroup" aria-labelledby={legendId} aria-describedby={descriptionId}>
          <Legend id={legendId}>Organism Color</Legend>
          <Description id={descriptionId}>Pick any color — colors are reusable.</Description>
                                           (mockup `:922`'s first sentence, verbatim; the second
                                            sentence promises the warning Story 4.9 builds — FD6)
          <SelectedRow>                    div — `.color-selected-row` (`:220-225`): display flex;
                                           align-items center; gap 20px (mockup 12px — widened so
                                           the 20px glow never reaches the name text); margin-top
                                           12px; margin-bottom 12px
            <SelectedSwatch aria-hidden="true" data-selected-swatch={value}
                            style={{ background: color, color }} />
                                           div — `.color-selected` (`:212-218`) at the AC's size:
                                           width 100px; height 100px; flex none; position relative;
                                           border 3px solid currentColor (the `<OrganismCard>`
                                           `ColorChip` idiom — the inline `color` IS the colour).
                                           '&::after' (FD4 — the glow): content '""'; position
                                           absolute; inset 0; box-shadow 0 0 20px currentColor;
                                           opacity 0.3; pointer-events none. The design doc's
                                           `0 0 20px rgba(colour, 0.3)` with no colour math and no
                                           alpha string: the shadow is full-strength currentColor
                                           on a pseudo-element painted at 30 %.
            <SelectedName data-selected-name>{selected.name}</SelectedName>
                                           span — font-size 13px; font-weight 500; color
                                           var(--gol-text-primary). Plain text — NOT a live region.
          </SelectedRow>
          <SwatchGrid>                     ⚠️ SUPERSEDED 2026-09-16 (see FD7 and the Change Log):
                                           the shipped grid is the mockup's `repeat(8, 1fr)` behind
                                           a "Change Color ▾" disclosure, the chip is 44×44.
                                           div — `.color-palette` (`:246-250`) with a fixed cell:
                                           display grid; grid-template-columns repeat(auto-fill,
                                           40px); gap 8px. 40px is the design doc's swatch size
                                           (`:196`); auto-fill is what makes "rows" follow the
                                           column (270px inner → 5 per row, 230px at the compressed
                                           tier → 4, the fold → as many as fit) instead of the
                                           mockup's `repeat(8, 1fr)`, which yields 27px targets in a
                                           320px column — below WCAG 2.5.8's 24px minimum at the
                                           compressed tier. (FD7)
            {PALETTE.map((entry) => (
              <Swatch key={entry.id} data-color-token={entry.id} data-selected={entry.id === value}
                      style={{ background: displayColor(entry.id, MAX_AGE_SHADE) }}>
                                           label — `.color-swatch` (`:256-273`): width 40px; height
                                           40px; position relative; cursor pointer; display flex;
                                           align-items center; justify-content center. NO border:
                                           the fill IS the boundary and every token clears G1
                                           against the dark surfaces (SC 1.4.11 met by the palette
                                           gate, not by a `--gol-border` edge that measures 1.57:1).
                                           '&:hover': outline 2px solid var(--gol-text-secondary);
                                           outline-offset 2px (the mockup's accent-border + scale
                                           hover is dropped: a scale with no transition jumps, and
                                           an accent hover is indistinguishable from the focus ring).
                                           '&:focus-within': outline 2px solid var(--gol-accent);
                                           outline-offset 2px (the `PresetOption` reasoning —
                                           `:focus-within`, not `:has()`, Firefox 112 floor).
                                           '&[data-selected="true"]': box-shadow
                                           'inset 0 0 0 2px var(--gol-bg-secondary), inset 0 0 0 4px
                                           var(--gol-accent)' — a 2px accent ring INSIDE the fill,
                                           separated from it by a 2px gap in the column's own
                                           background, so it reads on every fill including `cyan`
                                           and `sky-blue`, and never collides with the outer focus
                                           outline. (FD4)
                <HiddenRadio type="radio" name={groupName} value={entry.id}
                             checked={entry.id === value} onChange={() => onChange(entry.id)} />
                                           the `GridSettingsSection` copy: position absolute; 1px ×
                                           1px; margin 0; padding 0; opacity 0 — never display:none,
                                           never `hidden`. `onChange` fires only on a CHANGE of the
                                           checked radio, so re-selecting the current colour calls
                                           nothing (the platform's no-op, not a guard).
                {entry.id === value && <SelectedMark aria-hidden="true">✓</SelectedMark>}
                                           span — font-size 16px; line-height 1; color
                                           var(--gol-bg-primary) (G1: every token ≥ 5.12:1 against
                                           it — `palette-cvd-validation.md:79`); pointer-events none.
                <VisuallyHidden>{entry.name}</VisuallyHidden>
                                           the `GridSettingsSection` copy — the radio's accessible
                                           name is the entry's `name`, from the label's text.
              </Swatch>
            ))}
          </SwatchGrid>
        </Fieldset>
        ```
        `const selected = resolvePaletteColor(value); const color = displayColor(value,
        MAX_AGE_SHADE);` — computed per render, no memo (one map lookup and one table index).
        `groupName`, `legendId`, `descriptionId` from `useId()` — the field is not a singleton
        (Story 4.24's battle-origin editor is a second instance, and two radio groups sharing a
        `name` would deselect each other). `data-selected-swatch={value}` and `data-color-token`
        are the e2e/test hooks; `data-selected` drives the ring, never `&:has(input:checked)`.
  - [x] Header comment: mockup refs (`:212-297, 919-952, 1263-1285`), design-doc refs
        (`:163-206, 528, 549, 755-757, 796-798`), FD1/FD4/FD6/FD7 one sentence each, the three
        selection channels, why the fieldset is the radiogroup (one name, one group — a fieldset
        `group` wrapping a separate `radiogroup` announces "Organism Color" twice), why the selected
        name is not live. Cite `(Story 4.8)`, `(Story 4.7)`, `(Story 4.6)`, `(Story 4.2)`,
        `(Story 1.7)`, `(FR-2.3)`, `(M6)`, `(RFC-007)`, `(AR-46)`, `(NFR-2.1)` exactly as
        `spec:check` tokenises them. Name the followers: Story 4.9 adds the in-use marking and the
        reuse warning under `<SelectedRow>`; Story 4.14 reads `draft.colorToken` for the preview
        grid; Story 4.17 seeds `value` from a record.
  - [x] `ColorPickerField.test.tsx` — a `ControlledHarness` (real `useState` round trip, the
        `DominanceField.test.tsx:9-27` shape, seeded at `PALETTE[0].id`) plus a `vi.fn()` variant
        where call counts matter. `jsdomNormalizedColor` (the `OrganismLibrary.test.tsx:13-18`
        probe) for every inline-colour comparison — never string-compare an `hsl()` to
        `displayColor`'s output. Cases, each guarding a named failure:
        (a) `getByRole('radiogroup', { name: 'Organism Color' })` is a `<fieldset>`; its
            `aria-describedby` **exists** (assert before resolving — the 4.5 review's `''.split()`
            lesson) and resolves to "Pick any color — colors are reusable."; it contains exactly
            `PALETTE.length` radios, all enabled, whose accessible names are
            `PALETTE.map((c) => c.name)` **in order** (the registry order is the AC).
        (b) **initial state**: exactly one radio checked, named `PALETTE[0].name`; the
            `[data-selected-name]` text equals it; `[data-selected-swatch]` is `aria-hidden` and its
            `style.background` equals the normalised `displayColor(PALETTE[0].id, MAX_AGE_SHADE)`;
            exactly one `✓` exists and it sits inside the swatch whose `data-color-token` is
            `PALETTE[0].id`.
        (c) **click selects**: `user.click(getByRole('radio', { name: PALETTE[3].name }))` →
            `onChange(PALETTE[3].id)` exactly once; through the harness the checked radio, the
            name text, the `✓` and the large swatch's background all move to `PALETTE[3]`, and the
            large swatch's background **equals** that swatch's own inline background (AC4's
            "same string" pin at the field's seam).
        (d) **re-selecting the current colour is a no-op**: `user.click` on the checked radio →
            `onChange` not called.
        (e) **keyboard**: focus the checked radio, `user.keyboard('{ArrowRight}')` →
            `onChange(PALETTE[1].id)` and (through the harness) that radio checked and focused;
            `'{ArrowLeft}'` → back to `PALETTE[0]`; from a harness seeded at
            `PALETTE[PALETTE.length - 1].id`, `'{ArrowRight}'` → `PALETTE[0].id` (wraps).
            user-event 14's `walkRadio` drives this (`GridSettingsSection.test.tsx:120` is the
            precedent); the real-browser authority is e2e test 3.
        (f) **one tab stop**: render `<button>before</button>` + the harness + `<button>after</button>`;
            focus "before", `user.tab()` → the checked radio has focus; `user.tab()` → "after" has
            focus (the group is one stop, not twenty). user-event 14's tab walk skips the unchecked
            radios of a group that has a checked one; should it not in this jsdom, keep the first
            assertion and let e2e test 3 carry the second — the real browser is the authority.
        (g) **controlled**: with a `vi.fn()` parent that never updates `value`, a click on
            `PALETTE[2]`'s radio leaves `PALETTE[0]`'s radio checked (React re-asserts the
            controlled `checked` — 3.13 trap 9's shape); `rerender` with `value={PALETTE[2].id}` →
            checked and the name text updated.
        (h) **every swatch paints the identity shade**: for each `PALETTE` entry, the `<label>`
            with that `data-color-token` has `style.background` equal to the normalised
            `displayColor(entry.id, MAX_AGE_SHADE)`.
        (i) **label click selects once**: `user.click` on the `[data-color-token]` label of
            `PALETTE[4]` → `onChange(PALETTE[4].id)` exactly once (no double fire from the label
            activating the radio).
        (j) axe → `[]` at `PALETTE[0].id` and, after `rerender`, at `PALETTE[7].id` (`unmount`
            between scans — 3.13's series pattern).
        jsdom has no layout: never assert the ring, the glow, widths or computed token colours.

- [x] **Task 5 — Mount it in the shell, thread the library** (AC: 3, 4, 8, 9) (FD5)
  - [x] `OrganismEditorModal.tsx`:
        ```ts
        import type { Organism } from '@gol/domain';
        import ColorPickerField from './ColorPickerField';   // static, inside the lazy chunk (:7-12)
        …
        /** The lifecycle half — what `useOrganismEditorModal` assembles and nothing more. */
        export interface OrganismEditorLifecycleProps {
          open: boolean;
          origin: OrganismEditorOrigin;
          onClose(): void;
          onExited?(): void;
        }
        export interface OrganismEditorModalProps extends OrganismEditorLifecycleProps {
          /**
           * The loaded library — an entity list, never a repository (AR-2/AR-27: this modal still
           * calls nothing that persists). Read ONCE, at mount, for the M6 default-colour seed
           * (Story 4.8); Story 4.9 reads names for the reuse warning, 4.11 the organism-type
           * dropdown, 4.17 excludes the organism under edit. The seed is taken from whatever the
           * caller had loaded at open time (FD9).
           */
          library: readonly Organism[];
        }
        …
        const [draft, setDraft] = useState<OrganismDraft>(() =>
          createNewOrganismDraft(library.map((organism) => organism.colorToken)),
        );
        const setColorToken = useCallback(
          (colorToken: string) => setDraft((d) => ({ ...d, colorToken })),
          [],
        );
        …
        basicInfo={
          <>
            <OrganismNameField value={draft.name} onChange={setName} />
            <ColorPickerField value={draft.colorToken} onChange={setColorToken} />
            <DominanceField value={draft.dominance} onChange={setDominance} />
            <AgingToggleField value={draft.agingEnabled} onChange={setAgingEnabled} colorToken={draft.colorToken} />
          </>
        }
        ```
        Move the existing doc comments (`:34-42`) onto the lifecycle interface unchanged. The
        component doc (`:136-157`) keeps every sentence; add "Story 4.8's `colorToken` seed from
        `library`" where it names the draft, and note the `useState` initialiser now closes over
        a prop — legitimate because it runs once per mount and the `mounted` gate guarantees a
        mount per open. Save stays `disabled` (Story 4.3 FD4 / 4.16's cross-fade trap).
  - [x] `apps/web/lib/organisms/useOrganismEditorModal.ts`: the `import type` and the two
        `OrganismEditorModalProps` mentions (`:44`, `:120`) become `OrganismEditorLifecycleProps`;
        the `modalProps` doc line becomes "Spread onto `<OrganismEditorModal {...modalProps}
        library={…} />` — the data half is the caller's." **Nothing else in the file changes**;
        it stays type-only across the dynamic boundary (`:24-27`'s warning holds verbatim).
  - [x] `OrganismLibrary.tsx:321`: `<OrganismEditorModal {...modalProps} library={sorted} />`.
        One-line comment: `sorted` is the same list the cards render, so the editor's default
        colour is derived from exactly what the user sees; unmemoised because the modal reads it
        once (Story 4.9 reads it per render and that is still one prop). No new import.
  - [x] `OrganismEditorModal.test.tsx`: module-level `const LIBRARY = [CONWAYS_CLASSIC,
        ...createMockOrganisms()];` (`@gol/test-utils` — test files are exempt from the import
        boundary) and `library={LIBRARY}` on every `render` (a mechanical edit of the prop, not a
        rewrite). Retarget the guard (`:110-123`): Basic Information also contains
        `getByRole('radiogroup', { name: 'Organism Color' })`; the dialog contains exactly
        `PALETTE.length` radios. Retitle to name Story 4.8. Add: (1) **opens on the M6 default**
        — the checked radio's name is `resolvePaletteColor(defaultColorToken(LIBRARY.map((o) =>
        o.colorToken))).name` (derived — with `LIBRARY`'s four tokens `sky-blue`, `vermillion`,
        `azure`, `bluish-green`, that is `PALETTE[3]`, a value the stopgap could not produce; do
        not write `'Amber'`); (2) **a swatch pick round-trips and repaints the strip on the same
        commit** — click `PALETTE[9]`'s radio, then the checked radio, `[data-selected-name]`,
        `[data-selected-swatch]`'s background and the aging strip's cell `MAX_AGE_SHADE` background
        (scoped to the dialog, existence asserted before indexing — the 4.7 review's patch) all
        agree; `:218-232` (tab order) grows one `user.tab()` → the checked radio has focus, before
        the slider. The existing axe test scans the control for free — do not duplicate it.
  - [x] `useOrganismEditorModal.test.tsx:78`: `library={[]}` — the hook's test is about lifecycle
        and an empty library is a legal, honest input there.
  - [x] `OrganismLibrary.test.tsx`: (1) extend the reopen test (`:411-445`) with
        `user.click(screen.getByRole('radio', { name: PALETTE[10].name }))` before the exit
        (assert checked) and, after the reopen, assert the checked radio is
        `resolvePaletteColor(defaultColorToken(mocks.map((o) => o.colorToken))).name` — the
        fourth draft field must not survive either, and this is the only test that goes through
        the real `mounted` gate; (2) **new**: "seeds the picker at the next unused token of the
        loaded library (M6)" — fixture `[CONWAYS_CLASSIC, ...createMockOrganisms()]`, open the
        editor, assert the checked radio is `PALETTE[3].name` **and** that it is not
        `resolvePaletteColor(DEFAULT_COLOR_TOKEN).name` (FD8: the assertion that distinguishes the
        derivation from the stopgap). No new test file.

- [x] **Task 6 — e2e against the served static export** (AC: 1, 2, 4, 5, 7, 8)
  - [x] `apps/web/e2e/organisms.spec.ts`: new `test.describe('color picker & selection defaults
        (Story 4.8)')` after the 4.7 block, reusing module-scope `openEditor` and the
        console/pageerror capture idiom. A local `openColorPicker(page)` mirrors
        `openDominanceControl`: `dialog.getByRole('region', { name: 'Basic Information'
        }).getByRole('radiogroup', { name: 'Organism Color' })`. The production seed holds **one**
        organism, Conway's Classic on token #1 (`:153-190` pins this), so the M6 default is the
        registry's **second** entry — write the literal `'Vermillion'` with a comment naming
        `PALETTE[1]` and why (this spec imports only `@gol/*`, the 4.7 precedent for literals);
        likewise `'Amber'` for a user pick. Tests:
        1. **Opens on the next unused token, all swatches enabled, zero console errors**: the
           radiogroup is visible; `getByRole('radio')` count is 20 (comment: `PALETTE.length`);
           `locator('input[type="radio"]:disabled')` count 0; the `Vermillion` radio
           `toBeChecked()`; `[data-selected-name]` reads "Vermillion"; the description is visible.
        2. **A pick updates the display, the name and the aging strip together**: click the
           `Amber` radio → checked; name reads "Amber"; read `background-color` via
           `getComputedStyle` off `[data-selected-swatch]`, off `[data-color-token="amber"]` and
           off the aging strip's `[data-age="7"]` cell (comment: `MAX_AGE_SHADE`) — assert all
           three are one distinct value and that it differs from the value read before the click
           (the 4.7 review's "not vacuous" rule: assert the first is painted, not `rgba(0, 0, 0,
           0)`).
        3. **Keyboard**: focus the name textbox, `press(browserName === 'webkit' ? 'Alt+Tab' :
           'Tab')` → the checked radio `toBeFocused()`; `press('ArrowRight')` → the next radio is
           checked and focused and the name text changed; `press(tabKey)` → the dominance slider
           `toBeFocused()` (one tab stop, then out).
        4. **Label click selects**: `dialog.locator('[data-color-token="teal"]').click()` → the
           `Teal` radio checked (pins the label/radio association in a real browser).
        5. **axe with a user-picked swatch**: `AxeBuilder` after test 2's click (no transition on
           the control, so no extra wait beyond `openEditor`'s settle) → `[]`. This is the scan
           that measures the `✓` on a real fill and the ring for real.
        6. **Description is associated**: the radiogroup's `aria-describedby` resolves (`[id="…"]`
           — `useId` ids carry colons) to "Pick any color — colors are reusable.".
  - [x] Keep every 4.1–4.7 assertion verbatim; no earlier block is edited. The 4.7 keyboard test
        ("Tab from the dominance textbox reaches the switch") is unaffected by the insertion —
        the picker sits **before** dominance.

- [x] **Task 7 — Bundle measurement, docs, verification** (AC: 9)
  - [x] Measure before (on `main`, `ec350f8`, all four routes + the editor chunk) and after
        Task 6; record in the Dev Agent Record. Do **not** edit `budgetGzipKb`.
  - [x] `deferred-work.md`: strike the 4.7 section's "`colorToken` is seeded at
        `DEFAULT_COLOR_TOKEN` as a stopgap" item as `✅ Resolved in Story 4.8` (keep the prose,
        strike it — the 4.7 review's rule for the 4.6 item), and the 4.6 section's "the mockup's
        Color-before-Dominance order is not followed" item likewise. Add `## Deferred from: Story
        4-8-color-picker-selection-defaults (2026-09-16)` with: (1) **the mockup's "Change Color ▾"
        collapse toggle and `.collapsed` palette are not built** (FD7) — the AC says every swatch
        displays; a mockup-refresh note; (2) **the swatch grid is `repeat(auto-fill, 40px)`, not
        the mockup's `repeat(8, 1fr)`** (FD7 — 27px targets in a 320px column), and the selected
        swatch's state is an inset ring + `✓`, not the mockup's accent border + `rgba` glow; the
        hover is an outline, not the mockup's scale; a mockup-refresh note; (3) **the large
        display is 100×100 per the AC / design doc, not the mockup's 44×44**, and its background is
        the identity colour, not the design doc's "60 % opacity" — the display shows what the grid
        paints; flagged for the UX touch; (4) **the description carries only the mockup's first
        sentence** — Story 4.9 appends the warning sentence when the warning exists (NFR-4.1: no
        copy that promises behaviour the build lacks); (5) **the seed is read at mount from the
        library as loaded** (FD9) — opening the editor during the `loading`/`seeding` window
        (single-digit ms on localStorage) seeds from an empty list, i.e. `PALETTE[0]`, which
        always collides with Conway's Classic; if this is ever observed, the fix is gating
        `requestCreate` on `status === 'ready'` in `<OrganismLibrary>` (with the `error` branch
        handled), **never** re-seeding the draft in an effect; **flagged for Sidiar**; (6)
        **`VisuallyHidden` / `HiddenRadio` now exist in two hand copies** (`GridSettingsSection.tsx`,
        `ColorPickerField.tsx`) across the mode split — the third caller decides whether a
        `components/a11y/` primitive is born, the same shape as the 3.16 `<RangeSlider>` question;
        (7) **Story 4.13's "no color" validation item is unreachable by construction** —
        `draft.colorToken` is always a `PALETTE` id (seeded by `defaultColorToken`, written only
        by a radio whose `value` is a `PALETTE` id); 4.13 should confirm and not add a
        colour-specific check, the same note the 4.6 section left for dominance; (8) **Story 4.25
        must pass the battle's library** to `createNewOrganismDraft` / the modal's `library` prop
        — the roster is not the library, and a default derived from the roster alone would reuse
        a token another library organism holds.
  - [x] `docs/project-context.md` — **no new rule**: nothing here is unobvious beyond what the
        component headers record; promote the fieldset-as-radiogroup naming fact only if a second
        story trips on it.
  - [x] `npm run ci > ci.log 2>&1; echo $?` — paste the exit code, the bundle lines, the domain
        coverage line (unchanged — nothing in `packages/*` is touched) and the e2e summary into
        the Dev Agent Record. ⚠️ `deferred-work.md:1008-1016` records that the LOCAL four-project
        matrix exits 1 on a pre-existing Story 3.12 e2e (macOS WebKit `Tab` → `<body>`); if that
        is what fails, say so with the test name and confirm the remote run instead — never "fix"
        it here. Push to `story/4-8-color-picker-selection-defaults`; check `gh run list --limit
        1` after the PR opens.

### Review Findings

Reviewed on **Opus** against a **Sonnet** implementation (2026-09-16), via three parallel adversarial
layers (Blind Hunter, Edge Case Hunter, Acceptance Auditor). 0 `decision-needed`, 8 `patch`, 0
`defer`, 20 dismissed as noise (spec-mandated shapes — the derived expectations, the e2e literals,
the `data-selected="false"` serialisation, the AC6 unknown-`value` path "not re-tested here";
verified false positives — `sorted` is the unfiltered library, the ring gap's `--gol-bg-secondary`
IS the column's background, 4.24/4.25 are both battle-origin instances; and jsdom timeouts that
measure ≤ 250 ms per test standalone — a machine-load artefact of three reviewers and a full run
sharing one CPU). All patches applied in the review commit; CI on the PR is the remote authority.

- [x] [Review][Patch] Test (c) never asserted the `✓` moved (Task 4 (c) lists it among the four things that move); now pins exactly one mark, inside `PALETTE[3]`'s swatch [apps/web/components/organisms/editor/ColorPickerField.test.tsx:97]
- [x] [Review][Patch] Test (e) had no `onChange` spy (Task 4 (e): "`onChange(PALETTE[1].id)`") and its title promised "wrapping at both ends" while the wrap lives in the next test; now asserts both callbacks and is retitled [apps/web/components/organisms/editor/ColorPickerField.test.tsx:127]
- [x] [Review][Patch] The fast-check property's least-used branch was unreachable — a default-size `fc.array` over 22 alternatives almost never contains all 20 ids, so `someUnused` was always true; a second arbitrary prepends every id, forcing the branch on every run [apps/web/lib/palette/defaultColorToken.test.ts:44]
- [x] [Review][Patch] e2e test 3 omitted "the name text changed" after `ArrowRight` (Task 6 test 3) and located the next radio by `nth(2)`; now by name (`Bluish Green`, PALETTE[2]) with the `[data-selected-name]` assertion [apps/web/e2e/organisms.spec.ts:1280]
- [x] [Review][Patch] e2e test 1's `:disabled` count of 0 was vacuous (a selector matching nothing also counts 0); now `:enabled` counted to 20 [apps/web/e2e/organisms.spec.ts:1231]
- [x] [Review][Patch] Modal round-trip test compared the display's background only to the strip's cap cell — two stale backgrounds also agree; now both are pinned to the normalised `displayColor(PALETTE[9].id, MAX_AGE_SHADE)` [apps/web/components/organisms/editor/OrganismEditorModal.test.tsx:227]
- [x] [Review][Patch] Header comment lacked the "why the selected name is not live" sentence Task 4 lists; added [apps/web/components/organisms/editor/ColorPickerField.tsx:49]
- [x] [Review][Patch] Three test comments said "the deleted `DEFAULT_COLOR_TOKEN` stopgap" while the constant still exists (it is the Decision I.4 fallback; only the 4.7 *seed* was deleted); reworded [apps/web/components/organisms/editor/OrganismEditorModal.test.tsx:25, apps/web/components/organisms/OrganismLibrary.test.tsx:245]

Noted, not patched: the FD9 loading-window seed (an editor opened before `organisms.list()`
resolves seeds `PALETTE[0]`) was raised independently by two layers; it is the story's own owner
flag, already recorded in `deferred-work.md`'s 4-8 section with the one acceptable fix, and is not
a review decision. AC2's "Space checks an unchecked focused radio" is asserted nowhere — native
behaviour the task lists did not ask for; left as is.

## Dev Notes

### Forced decisions (made here so the dev agent does not have to)

- **FD1 — A `<fieldset role="radiogroup">` named by its `<legend>`, wrapping native
  visually-hidden radios — not MUI `<RadioGroup>`, not `role="radio"` buttons, not a `<label>`
  that labels nothing.** Three facts against MUI, the same three 3.13/4.6/4.7 recorded:
  `@mui/material/Radio` + `RadioGroup` + `FormControlLabel` are new modules in the editor chunk
  (AR-35); their DOM matches no mockup locator; and under `cssVariables: true` MUI's derived
  state tokens are unauthored (`deferred-work.md:87`). Against hand-rolled `role="radio"` buttons:
  a native group gives arrow-key roving, wrap-around, the single tab stop and the "already-checked
  fires nothing" no-op for free (`GridSettingsSection.tsx`'s own reasoning at its `PresetRow`),
  and the platform exposes `checked` to AT with no `aria-checked` to keep in sync. Against a
  `<Label>` (`styled('label')`) as the group's title: a `<label>` with no `htmlFor` and no wrapped
  control labels nothing — it would pass `eslint-config-next`'s jsx-a11y subset (which does not
  enable `label-has-associated-control`) and still be semantically false. A fieldset is the
  element HTML has for "these controls are one thing", `role="radiogroup"` is in its allowed-role
  list, and its legend names it in all three accessible-name implementations this repo tests
  against (dom-accessibility-api, axe-core, Playwright — each resolves `fieldset → legend` by
  element type, before role). `aria-labelledby={legendId}` is written as well so the explicit
  path and the native path agree — the 4.7 FD2 lesson, applied before it bites. One group, one
  name: a plain fieldset (`group`) wrapping a separate `role="radiogroup"` div would announce
  "Organism Color" twice.

- **FD2 — `defaultColorToken` is a pure function in `lib/palette/`, next to the registry.** It is
  a walk over `PALETTE`'s order, and that order is `paletteRegistry.ts`'s data ("load-bearing …
  Story 4.8 assigns colours to new organisms by walking it", `:28-31`). It cannot live in
  `@gol/domain` (the registry is `apps/web`-only — Story 1.7's package-purity fact) and is not
  referential-integrity logic, so project-context's "core stays in `packages/domain`" rule does
  not reach it. Two passes, no sort: the least-used fallback is a `min` with a strict `<`, which
  is what makes ties fall to the earlier registry position without a comparator. Unknown tokens
  are ignored rather than counted — they occupy no palette entry, so counting them would make a
  corrupt record "use up" a colour that no organism displays.

- **FD3 — The factory takes the tokens, not the organisms, and not a pre-computed seed.**
  `createNewOrganismDraft(usedColorTokens)` keeps the draft factory the **single** seed source
  (Story 4.5 FD3's one-object rule): Story 4.23 diffs the draft against `createNewOrganismDraft(
  sameTokens)`, and if the modal computed the token itself there would be two places to keep
  agreeing. Tokens rather than `Organism[]` because the factory needs nothing else, and a
  factory that takes the entity list invites reading `name` from it one day. Story 4.17 does not
  call this factory (it seeds from the record); Story 4.25 calls it with the **library**'s tokens
  (deferred item 8).

- **FD4 — The glow is CSS (`currentColor` on a 30 % pseudo-element); the selected swatch is an
  inset ring + `✓`; nothing in `lib/palette/colorMath.ts` or `displayColor.ts` changes.** The
  design doc wants `0 0 20px rgba(colour, 0.3)`. Producing that string needs an alpha formatter
  (`formatHsla`) in `colorMath.ts`, which sits in `/battle`'s first-load graph at 1.3 KB of
  headroom — for a shadow. Setting the inline `color` to the identity colour (the `<OrganismCard>`
  `ColorChip` idiom, AR-46-clean) and painting `box-shadow: 0 0 20px currentColor` on an `::after`
  at `opacity: 0.3` gives the same result with zero JS and zero new modules. The selected swatch's
  state: the mockup's accent border + `rgba(0,212,255,.4)` glow needs either a raw `rgba` (AR-46)
  or a new `--gol-shadow-*` token, and an accent border is invisible on the `cyan`/`sky-blue`
  fills. An **inset** two-layer `box-shadow` — 2px of `--gol-bg-secondary`, then 2px of
  `--gol-accent` — draws a ring inside the fill with a background-coloured gap, so it reads on
  every fill, costs no token, and leaves the outer `:focus-within` outline (2px accent at 2px
  offset) as a distinct, non-overlapping state. The `✓` in `--gol-bg-primary` is the third
  channel and is measured by axe on every fill: G1 guarantees ≥ 5.12:1 (`palette-cvd-
  validation.md:79`), above the 4.5:1 axe wants for 16px text, so the mark cannot fail a scan on
  any current or future token that passes the palette gate.

- **FD5 — The modal gains `library: readonly Organism[]` as a required prop; the props type
  splits into a lifecycle half (the hook's) and the data half (the caller's).** The default
  derivation needs the library's tokens; the modal cannot load them (AR-2/AR-27: no repository in
  a component that is not the page boundary) and `useOrganismEditorModal` must stay
  lifecycle-only (its header: a value import of anything from the modal defeats the dynamic
  boundary — a type-only rename is all it takes here). Required, not optional-with-default: the
  real caller always has the list, and an optional prop would let Story 4.25 forget it and ship a
  default that collides silently. `Organism[]` rather than `string[]` because Story 4.9 needs
  names next story and 4.11 the entities; threading the narrowest type now and widening it in a
  fortnight is the churn the one-object rule exists to avoid. The `useState` initialiser reads it
  once — see FD9 for what that means.

- **FD6 — No in-use marking, no warning, no `title` hints in this story.** `epics.md:1099` gives
  the warning to Story 4.9 with its own AC; the mockup's `.in-use::after` dot and its `title`
  ("— in use by another organism (still selectable)") are the same surface. A dot with no
  explanation is a question the UI cannot yet answer, and a `title` is not announced by every
  screen reader (the `<OrganismRoster>` warning's reasoning). The description therefore carries
  only the mockup's first sentence; the second promises the warning and lands with it (NFR-4.1).

- **FD7 — The mockup's disclosure: 44×44 chip, "Change Color ▾" button, palette collapsed at
  mount, `repeat(8, 1fr)`.** *(Rewritten 2026-09-16.)* As created, this story dropped the
  mockup's collapse (`:227-254, 1263-1269`) for the design doc's always-open 100×100 / 40px
  layout (`:170-182, 196`) and the epic AC text derived from it; Sidiar overruled that on the
  first review of the shipped column — the mockup is the authority where the two disagree, and
  the epic AC wording is corrected to match. What ships: the `<fieldset>` is the group; the grid
  is the `role="radiogroup"`, `hidden` until the button (`aria-expanded`, `aria-controls`) opens
  it — a fieldset-as-radiogroup would announce an empty radio group while collapsed. A POINTER
  pick (`MouseEvent.detail > 0`) collapses the grid again and a layout effect hands focus to the
  button in the same commit — after the DOM update, so the label activation's own
  focus-the-radio step (Chromium, Gecko) finds the radio unrenderable and the button keeps focus;
  never `<body>`. A KEYBOARD pick (arrow keys, Space — `detail === 0`) leaves the grid open:
  collapsing under a roving focus would drop the user between every arrow press. The mockup's
  `repeat(8, 1fr)` gives ~27px cells in the 270px column and ~22px at the compressed tier; with
  the 8px gap the centre-to-centre spacing is ≥ 30px, which is WCAG 2.5.8's spacing exception, so
  the size objection the original FD7 raised does not hold. The open/closed flag is the field's
  only local state — view chrome, never draft data. The selected swatch is the mockup's accent
  border + accent glow (a pseudo-element at 0.4, FD4) + the `✓`; the hover is the mockup's accent
  border + `scale(1.05)`, disabled under `prefers-reduced-motion`.

- **FD8 — The M6 seed is tested against a fixture that contains Conway's Classic.**
  `createMockOrganisms()` uses `vermillion`, `azure`, `bluish-green` — none of them `sky-blue` —
  so with the mocks alone `defaultColorToken` returns `PALETTE[0].id`, which **equals**
  `DEFAULT_COLOR_TOKEN`: a test on that fixture passes against the stopgap seed this story
  deletes. Prepending `CONWAYS_CLASSIC` (`sky-blue`) makes the answer `PALETTE[3]` (`amber`), a
  value only the derivation produces. Every assertion derives the expected name through
  `resolvePaletteColor(defaultColorToken(tokens)).name`; the e2e, which cannot import the
  registry, writes the literal with a comment (the 4.7 precedent), and the production seed there
  is Conway's Classic alone, so its answer is `PALETTE[1]`.

- **FD9 — The seed is read once, at mount, from the library the caller had loaded; the
  loading-window race is documented, not engineered around.** `<OrganismLibrary>` renders the
  create button in every status (Story 4.2/4.3's deliberate "creating does not depend on the list
  having loaded"), so a click during `loading`/`seeding` mounts the modal with `library = []` and
  seeds `PALETTE[0]`. That window is the `organisms.list()` localStorage read — single-digit
  milliseconds — followed by the lazy chunk fetch, which is longer; in practice the list is there
  first, and every existing e2e already opens the editor immediately after `goto`. The two
  "fixes" are both worse: re-seeding the draft in an effect when the library arrives is state
  synchronised in an effect (RFC-005 Decision 1's anti-pattern, and it would overwrite a user's
  pick); gating the modal mount on `status === 'ready'` leaves the background `inert` with nothing
  on screen and strands the user on the `error` branch. Recorded as deferred item 5 with the one
  acceptable fix (gate `requestCreate`, handle `error`) if it is ever observed.

### What exists — read these before writing a line

| File | Why it matters here |
|---|---|
| `apps/web/components/organisms/editor/AgingToggleField.tsx` | **The immediate precedent** (Story 4.7): `Field`/`Label`/`Description` from `fieldStyles`, `useId` discipline, the header-comment shape (mockup refs, FD list, spec ids), no `transition`, inline organism colour on the strip cells; `colorToken` prop — the strip already follows this story's picks (AC4). **Read, do not modify.** |
| `apps/web/components/organisms/editor/AgingToggleField.test.tsx` | Test (j) "token change repaints" is this story's hook at the strip's seam; the `ControlledHarness` + `vi.fn()` split; axe series with `unmount`. |
| `apps/web/components/organisms/editor/fieldStyles.ts` | **Grows `Fieldset`/`Legend`** (Task 3). `Label`'s rule set becomes `labelRules`; output byte-identical. |
| `apps/web/components/organisms/editor/OrganismEditorModal.tsx:7-17, 30-43, 136-177, 233-246` | **The file being modified**: import block reasoning, the props interface to split (FD5), the doc block to extend, the draft `useState` (becomes a closure over `library`) + setters (add `setColorToken`), the `basicInfo` fragment that gains a **second** child. Everything else stays. |
| `apps/web/components/organisms/editor/OrganismEditorModal.test.tsx:1-7, 110-123, 137-160, 218-232` | 19 `render` sites gaining `library={LIBRARY}`; the count guard to retarget; the strip round-trip shape (cells looked up through the dialog, existence asserted first); the tab-order test to extend. |
| `apps/web/lib/organisms/useOrganismEditorModal.ts:4-7, 43-45, 120-128` | **Type-name change only** (`OrganismEditorLifecycleProps`); the header's `import type` warning is why nothing else may change. Its test (`:78`) gains `library={[]}`. |
| `apps/web/components/organisms/OrganismLibrary.tsx:249, 321` | `sorted` (the list to pass) and the modal mount (gains `library={sorted}`). ❌ Never import the field, the derivation or `fieldStyles.ts` here (`:30`'s dynamic boundary). |
| `apps/web/components/organisms/OrganismLibrary.test.tsx:13-18, 411-445` | `jsdomNormalizedColor` (copy the probe into the field test); the only test through the real `mounted` gate — extend it (Task 5). |
| `apps/web/components/battle/editor/GridSettingsSection.tsx:66-160, 286-323` | `PresetOption` (`:focus-within` not `:has()`, `data-selected` not `:has(input:checked)`, three selection channels, no `transition`), `HiddenRadio`, `VisuallyHidden`, `SelectedMark`, the `useId()` group name and the "native radios, not `role="radio"` buttons" reasoning. **Read, copy the two hidden primitives, never import** (across the mode split). |
| `apps/web/components/battle/editor/GridSettingsSection.test.tsx:48-70, 120` | Radio assertions (`toBeChecked`, no `aria-checked` attribute) and the `user.keyboard('{ArrowLeft}')` radio-walk precedent. |
| `apps/web/e2e/battleRoute.spec.ts:1214-1219, 1245, 1349-1350` | `.click()` on a visually-hidden radio works in all three engines; `toBeFocused()` on one after arrow navigation. |
| `apps/web/components/organisms/OrganismCard.tsx:20-23, 78-84, 184` | The AR-46 inline-`style` precedent with `color` + `currentColor` border — FD4's construction. The card chip paints `displayColor(token, MAX_AGE_SHADE)` — the same string the picker must paint. |
| `apps/web/lib/palette/paletteRegistry.ts:10-18, 28-63, 111-113` | `PaletteColor.name` ("human label for the Story 4.8 picker"), the order comment naming this story, `PALETTE`, `DEFAULT_COLOR_TOKEN` (no longer read by the draft), `resolvePaletteColor`. **Read, do not modify.** |
| `apps/web/lib/palette/paletteRegistry.test.ts:29-53` | Pins 20 entries, unique ids AND unique names (so radio names are unique), the core-8 order — what Task 1's tests build on rather than re-proving. |
| `apps/web/lib/palette/displayColor.ts:9, 71-73` | `MAX_AGE_SHADE`, `displayColor` — the identity shade. **Read, do not modify.** |
| `apps/web/lib/palette/colorMath.ts` | **Not touched** (FD4). Its `formatHsl` doc explains the AR-46 template exemption — the reason an alpha variant is not free. |
| `apps/web/lib/displayOrganisms.ts:67-74` | `toDisplayOrganism` — `displayColor(colorToken, MAX_AGE_SHADE)` is the identity the whole app paints; cite it. |
| `apps/web/components/battle/editor/BattleEditorView.tsx:502-512` | `findDuplicateColorIds` — the FR-3.3 token-count derivation; the shape 4.9 will mirror, and the reason the picker compares tokens, never hexes. Read for context; untouched. |
| `apps/web/lib/organisms/organismDraft.ts` (+ test) | The seed to replace; the "grows one field per story" list to update. |
| `apps/web/lib/organisms/agingExample.ts` | The pure-helper-in-`lib` shape (header reasoning, derived lengths) `defaultColorToken.ts` mirrors. |
| `apps/web/lib/canvas/dirtyCells.test.ts` | The `fast-check` import shape in `apps/web`. |
| `apps/web/components/organisms/editor/OrganismEditorLayout.tsx:82-108` | The Basic Information column: 320px / 280px compressed, 25px padding, **its own scroll container** (4.4 FD2 anticipated ~700px of content — the column now exceeds a 720px viewport and scrolls; Playwright scrolls into view on click/focus). **Read, do not modify.** |
| `apps/web/app/themes.css:19-46, 34, 49` | Tokens in play (`--gol-bg-primary`, `--gol-bg-secondary`, `--gol-accent`, `--gol-text-primary`, `--gol-text-secondary`, `--gol-text-tertiary`); the two shadow tokens that exist and why no third is added (FD4). Nothing added. |
| `apps/web/lib/themeTokens.test.ts:55-83, 125-151` | The gated text pairs; why the name text and description need no new row. |
| `docs/implementation-artifacts/palette-cvd-validation.md:79-82` | G1: every token ≥ 5.12:1 against `#0a0a0a` — the number behind the `✓` ink (FD4). |
| `apps/web/e2e/organisms.spec.ts:1-29, 930-941, 1073-1195` | `openEditor`, the region-scoped locator helper, the WebKit `Alt+Tab` idiom, the `[id="…"]` describedby resolution, the console-capture idiom, the literal-with-comment rule for `apps/web/lib` constants. |
| `eslint.config.mjs:22-39, 74-102` | AR-46's selectors: `hsl(`/`rgb(`/hex literals are banned in `.tsx`; `var(--gol-*)` inside `box-shadow` is fine; inline `style` from a LUT string is fine. |
| `docs/planning-artifacts/ux-designs/…/clinical-lab-theme/organism-editor.html:212-297, 919-952, 1263-1285` | `.color-selected` / `.color-selected-row` / `.color-toggle` / `.color-palette` / `.color-swatch` (+ `.selected`, `.in-use::after`) / `.color-reuse-warning` CSS; the markup (label, description, the two-sentence copy, `title` per swatch — all 20 hexes match the registry); the collapse + swatch-click script. |
| `docs/planning-artifacts/ux-designs/…/organism-editor-design.md:163-206, 528, 549, 755-757, 796-798` | Label, description, the 8/8/4 layout sketch, "Large square (100px × 100px)", `3px solid [colour]`, the 0.3 glow, 40px swatches, "In use … still selectable", "Next unused palette color; if all 20 are in use, the least-used color (ties by palette order)", "Color: Must be selected", "in-use colors remain selectable … no filtering". ⚠️ Its colour list (`:184-187`, `#ff0055` …) predates RFC-007 — the registry is the authority; ignore those hexes. |
| `docs/implementation-artifacts/4-7-aging-degradation-toggle.md` | FD1–FD7, the review patches (not-vacuous colour assertions, no literal cell index, strike-not-rewrite in deferred-work), the bundle figures (chunk 4744 B, routes unchanged). |
| `docs/implementation-artifacts/4-6-dominance-control.md` / `4-5-organism-name-field.md` | FD3 (one draft object), FD5 (no transition), FD6 (`styled()` over MUI form components), the review habits (assert attributes exist; derive numbers; exact counts; controlled harness). |
| `docs/implementation-artifacts/deferred-work.md:87, 1058-1148` | The MUI derived-token trap; the 4.6 Color-order pointer and the 4.7 stopgap item — both struck here; the 4.6/4.7 sections' shape for the new section. |
| `docs/implementation-artifacts/lane-gates.yaml` | 4.15/4.24/4.25 gated on Epic 3; this story proposes no gate (see the last line of this file). |

### Architecture compliance

- **RFC-005 Decision 1 / Decision 7, AR-33** — `colorToken` stays ephemeral UI state in the
  modal's draft; the picker is a controlled view; no global store, no Context, no repository
  (AR-2 / AR-27: `library` is an entity list handed down from the page boundary's loaded
  resource, never a repository and never loaded here). Save stays `disabled`.
- **FR-2.3 / M6 / RFC-007 Decision 3** — next-unused then least-used, ties by registry order;
  every token always selectable; nothing disabled; no cap; the default raises no warning.
- **RFC-007 Decision 1 / Decision 2 / AR-26 / Decision I** — the picker renders **tokens**
  resolved at render time (`name` for the label, `displayColor` for the fill); no hex is stored,
  typed or compared; `PALETTE.length` and its order are read, never restated; an unknown token
  degrades through `resolvePaletteColor` (I.4).
- **RFC-007 Decision 4 / Decision B.2** — the swatch fill, the large display and the strip's cap
  cell are all `displayColor(token, MAX_AGE_SHADE)`: the identity shade, the colour the renderer
  keys a non-aging organism by.
- **UX-DR7 / UX-DR17** — 20 swatches in rows, large selected display with glow, no disabled
  swatches; keyboard-operable radio group, ARIA name/description, three selection channels.
- **AR-39** — nothing lands in `packages/*`; the derivation lives in `apps/web/lib/palette`
  (registry-adjacent) with exact + property tests despite no gate.
- **AR-35 / bundle** — everything new is reached only through `OrganismEditorModal.tsx`; no new
  MUI module; `@mui/material/styles` is the only MUI import in the field; `/battle`'s graph is
  untouched (FD4).
- **RFC-003 Decision 3 / Decision J / AR-46** — `styled()` + `var(--gol-*)`; organism colour is
  an inline `style` string from the LUT; the only literals are sizes (100/40/20/16/13/8/4/3/2px,
  0.3) from the mockup, the design doc or this story.
- **NFR-4.1** — no placeholder controls; no copy promising the 4.9 warning.
- **NFR-2.1** — no `:has()`, no `inset`-dependent layout beyond a pseudo-element (`inset`
  shorthand: Safari 14.5 / Firefox 66 — under the floor); `:focus-within` on the label.
- **SC 1.4.11 / 1.4.3 / 1.4.1 / 2.5.8** — fills clear G1; the `✓` ink clears 4.5:1 on every
  fill; three selection channels; 40px targets.
- **Spec-id hygiene** — `spec:check` tokenises `FR-2.3`, `FR-3.3`, `NFR-2.1`, `NFR-4.1`,
  `NFR-8.3`, `AR-2`, `AR-26`, `AR-27`, `AR-33`, `AR-35`, `AR-39`, `AR-44`, `AR-46`, `RFC-003`,
  `RFC-005`, `RFC-007`, `Decision B`, `Decision I`, `M6`, `Story 4.8`, `Story 4.9`, `Story 4.7`,
  `Story 4.6`, `Story 4.5`, `Story 4.4`, `Story 4.2`, `Story 4.11`, `Story 4.13`, `Story 4.14`,
  `Story 4.17`, `Story 4.23`, `Story 4.24`, `Story 4.25`, `Story 3.13`, `Story 1.7`; write them
  exactly so. `UX-DR7`, `UX-DR17`, `FD*`, `G1`, `SC n.n.n` are not checked.

### Library / framework notes (installed versions, no research needed)

- **React 19.2** — a controlled `<input type="radio" checked onChange>` re-asserts `checked`
  after the browser flips it, so a parent that ignores `onChange` leaves the original checked
  (test (g)); `useState(() => …)` runs once per mount and may close over props; `useId()` ids
  contain colons (use `[id="…"]` in e2e selectors).
- **jsdom (Vitest 4)** — `cssstyle` normalises an inline `hsl()` to `rgb()` on `element.style`
  — compare through `jsdomNormalizedColor`, never against the raw LUT string; `label.click()`
  activates a wrapped radio; no layout (no ring, no glow, no widths).
- **@testing-library/user-event 14.6** — `walkRadio` (`dist/esm/event/radio.js`): Arrow
  Left/Up/Right/Down on a focused radio moves focus to the next enabled radio of the same
  `name` (wrapping) and dispatches `click` on it — test (e); `user.tab()` lands on the checked
  radio of a group and leaves the group on the next tab (test (f)); `user.click` on an
  `opacity: 0` 1px input works (pointer-events are the only check).
- **@testing-library/dom** — `getByRole('radiogroup', { name })` on a `<fieldset role="radiogroup">`
  computes the name from `aria-labelledby` (and from the legend without it);
  `getByRole('radio', { name })` from the label's text; `getAllByRole('radio')` returns DOM order.
- **jest-dom** — `toBeChecked()` on native radios; `toHaveFocus()`; `toBeEnabled()`.
- **Playwright 1.62** — `getByRole('radio', { name }).click()` on a visually-hidden radio inside
  a label is the `battleRoute.spec.ts:1245` idiom (never `.check()` — `:1214-1219`); `toBeChecked()`
  / `toBeFocused()` on native radios; `press('ArrowRight')` on a focused radio checks the next
  one in all three engines; WebKit needs `Alt+Tab` to move focus off a text input (the 4.1
  idiom); `locator.evaluate((el) => getComputedStyle(el).backgroundColor)` returns `rgb(r, g, b)`
  — compare to each other.
- **axe-core 4.12** — `aria-allowed-role` permits `radiogroup` on `fieldset`;
  `aria-required-children` has no requirement for `radiogroup`; the fieldset's name comes from
  `aria-labelledby` (first) or the legend; radios are named by their label's text (`labelText`
  applies to `input`); `color-contrast` measures `aria-hidden` text — the `✓` must clear 4.5:1
  on every fill (FD4's G1 argument); an `opacity: 0` input is skipped by contrast rules.
- **MUI 9.3.1 `styled()`** — `styled('fieldset')` / `styled('legend')` forward `role`, `aria-*`,
  `id`; attribute selectors (`'&[data-selected="true"]'`), `'&::after'` and `'&:focus-within'`
  work as nested keys; multi-layer `boxShadow` strings pass through verbatim.
- **eslint-config-next / jsx-a11y** — the subset it enables (`aria-props`, `aria-proptypes`,
  `role-has-required-aria-props`, `role-supports-aria-props`, …) accepts `role="radiogroup"` +
  `aria-labelledby` + `aria-describedby` on a fieldset; `label-has-associated-control` is not
  enabled, which is why FD1 chose the fieldset on semantics rather than on lint.

### Testing standards

- `apps/web` has **no coverage gate** — every test guards a named failure: a literal 20 or a
  re-ordered registry (a, h), a derivation that still returns the stopgap (Task 2, FD8, modal
  test 1, library test 2), a picker that ignores the prop (g), a second `onChange` from the label
  (i), a group that is twenty tab stops (f), a display that disagrees with its own swatch (c) or
  with the strip (modal test 2, e2e 2), a disabled swatch (e2e 1), a control landing outside
  Basic Information (modal guard), a fourth field surviving a reopen (library test 1).
- `packages/*` **are not touched**; the domain/simulation coverage lines must read exactly as on
  `main`. `lib/palette/defaultColorToken.ts` gets exact + property tests anyway.
- Never snapshot the control; never assert computed colours in jsdom; never mock `useId`; never
  assert on `PALETTE` **values** (names, ids, hexes) as literals in jsdom tests — index into
  `PALETTE`. The e2e's two literals (`'Vermillion'`, `'Amber'`) each carry a comment naming their
  index and the production-seed fact that makes them right.
- The 4.3/4.4 tests must not be edited; the 4.5/4.6/4.7 tests are **retargeted** only where this
  story legitimately changes a count, a tab hop or the required prop (the modal guard, the
  tab-order test, the `library` prop on every render, the reopen test). If any other earlier test
  fails — including after the `labelRules` refactor — the change is wrong, not the test.
- Do not add an `afterEach` that sweeps `[aria-hidden]` nodes (`deferred-work.md:785-793`).

### Previous story intelligence (Story 4.7)

- The draft seam is complete for this story's purposes: `colorToken` already exists on
  `OrganismDraft`, the strip already consumes it, and 4.7 left the seed as a documented stopgap
  for this story to **replace** (deferred item 4). This story changes the factory's signature,
  adds one setter and one prop — nothing structural beyond the props-type split (FD5).
- 4.7's review patches are this story's habits: assert `aria-describedby` / `aria-labelledby`
  **exist** before resolving them; derive every number (`PALETTE.length`, `MAX_AGE_SHADE`); scope
  DOM lookups to the dialog and assert existence before indexing; make colour assertions
  non-vacuous (assert the first value is painted); strike deferred items, never rewrite them;
  keep counts in the Dev Agent Record honest (seven items means seven).
- 4.7 FD2's "the name mechanism all three implementations agree on" is why FD1 writes
  `aria-labelledby` alongside the legend rather than trusting one path.
- 4.5 FD5 (no `transition`) and FD6 (plain `styled()` over MUI form components) carry over
  verbatim; 4.7 FD6's "no new token" carries over via FD4.
- 4.7 measured the editor chunk at **4744 B gzip** and all four routes byte-identical
  (`/organisms` 295.3 KB). Expect the chunk +≈1.5–2 KB (twenty swatches are one `map`, but the
  fieldset chrome, the derivation and the test hooks add up); routes byte-identical.
- 4.7's FD4 owner flag (live-preview vs permanent ramp) is untouched by this story; if Sidiar
  flips it, nothing here changes.

### Git intelligence

`main` is at `ec350f8` (the lane-tooling merge after #43, Story 3.14, and #42, Story 4.7 — both
merged 2026-09-16). The last app-code commits are 3.14's (`components/battle/simulation/**`,
`lib/battle/**`, `battleRoute.spec.ts`) and 4.7's (`components/organisms/editor/**`,
`lib/organisms/**`, `organisms.spec.ts`). **Shared code surfaces with the open Epic 3 lane
(3.15–3.19): none** — they write `components/battle/**`, `lib/battle/**`, `battleRoute.spec.ts`
(3.17 also `components/gallery/**`); this story writes `components/organisms/**`,
`lib/organisms/**`, `lib/palette/defaultColorToken.*`, `organisms.spec.ts` and docs.
`lib/palette/{paletteRegistry,displayColor,colorMath}.ts`, `lib/canvas/**` and
`components/battle/**` are read only. The only file both lanes write is `deferred-work.md`
(append-only sections plus two strike-throughs inside Epic-4-owned sections; the Step S sync
keeps both hunks).

### Project Structure Notes

- New: `components/organisms/editor/ColorPickerField.tsx` (+ `.test.tsx`),
  `lib/palette/defaultColorToken.ts` (+ `.test.ts`).
- Modified: `components/organisms/editor/OrganismEditorModal.tsx` (+ test),
  `components/organisms/editor/fieldStyles.ts`, `lib/organisms/organismDraft.ts` (+ test),
  `lib/organisms/useOrganismEditorModal.ts` (type name; + test, one prop),
  `components/organisms/OrganismLibrary.tsx` (one prop; + test), `e2e/organisms.spec.ts`,
  `docs/implementation-artifacts/deferred-work.md` (new section + two strike-throughs),
  `sprint-status.yaml`.
- Naming: component PascalCase `.tsx`; non-component TS camelCase, never dotted
  (`defaultColorToken.ts`); helper `defaultColorToken`; data attributes `data-selected-swatch`,
  `data-selected-name`, `data-color-token`, `data-selected`.
- Untouched on purpose: `OrganismEditorLayout.tsx` (+ test), `OrganismNameField.tsx`,
  `DominanceField.tsx`, `AgingToggleField.tsx` (+ their tests), `OrganismCard.tsx`,
  `lib/palette/{paletteRegistry,displayColor,colorMath,paletteCvd}.ts`, `lib/displayOrganisms.ts`,
  `lib/theme.ts`, `app/themes.css`, everything under `components/battle/` and `lib/canvas/`, all of
  `packages/*`, `playwright.config.ts`, `scripts/check-bundle-size.mjs` budgets,
  `docs/project-context.md`, `deferred-work.md:87`.

### What NOT to build

- ❌ No MUI `<Radio>` / `<RadioGroup>` / `<FormControlLabel>`, no `MuiRadio` theme override — FD1.
- ❌ No `role="radio"` buttons with a hand-rolled roving `tabIndex` — FD1.
- ❌ No `aria-checked` attribute on the radios (the platform exposes `checked`; a second source can
  disagree — `GridSettingsSection.tsx:106-110`).
- ❌ No in-use dot, no `title` per swatch, no "[Organism] already uses this color" warning, no
  usage counting in the field — Story 4.9 (FD6).
- ❌ No collapse on a KEYBOARD pick, no `useState` for anything but the disclosure flag — FD7.
- ❌ No `formatHsla`, no colour math for the glow, no new `--gol-*` token, no raw `rgba` — FD4.
- ❌ No `:has()`; the mockup's `transition` / `scale()` hover ship only under
  `prefers-reduced-motion: no-preference`.
- ❌ No live region on the selected name; no `role="img"` on the large display.
- ❌ No effect that re-seeds `colorToken` when `library` changes — FD9.
- ❌ No `usedColorTokens` prop on the field, no `library` read inside the field — AC6.
- ❌ No optional `library` prop with a `[]` default — FD5.
- ❌ No preview grid, no `setColorToken` consumer beyond the draft — Story 4.14 reads the draft.
- ❌ No Save enablement, no persistence, no loading from a record — 4.16 / 4.17.
- ❌ No engine, renderer or `lib/palette` registry/LUT change; no new test in `packages/*`.
- ❌ No `deferred-work.md:87` edit — the MUI derived-token trap is still unresolved because still
  unused.

### Open flags for the owner (not blockers — the story proceeds on the FD)

- **FD9's loading-window seed** (an editor opened before `organisms.list()` resolves seeds
  `PALETTE[0]`, which always collides with Conway's Classic). Recorded in Task 7's deferred
  item 5 with the one acceptable fix if it is ever observed.
- **The large display paints the identity colour at full opacity**, not the design doc's "60 %
  opacity" (`:192`) — the display shows what the grid paints. Recorded in deferred item 3.

### References

- `docs/planning-artifacts/epics.md:1078-1089` (Story 4.8 ACs), `:45` FR-2.3, `:232` UX-DR7,
  `:242` UX-DR17, `:258` (FR-2.3 → Epic 4), `:641` (FR-3.3's battle warning — the other M6
  warning), `:1091-1101` (4.9 — warning + CVD check), `:1153-1163` (4.14 — preview grid reads the
  draft), `:1189-1200` (4.17 — "opens fully populated (… color …)"), `:1290-1300` (4.25).
- `docs/planning-artifacts/prds/prd-GameOfLife-2026-05-26/prd.md:172-178` (FR-2.3 in full: the
  least-used fallback, ties by palette order, "the system-assigned default … does not itself
  raise it", "selected by swatch/name").
- `docs/planning-artifacts/architecture.md:178` (Decision B.2 — identity shade `(token, 7)`),
  `:287` (Decision I.4 — unknown tokens degrade and warn), `:352` (M6 in full).
- `docs/planning-artifacts/rfcs/RFC-007-organism-colour-palette.md:43` (tokens, not hex), `:57`
  (`name` is the picker's label), `:75-78` (Decision 2 — order = default assignment order,
  developer-extensible), `:110-117` (Decision 3 — always selectable, default = next unused,
  "swatch + `name`, never a raw hex", usage derived from loaded organisms), `:119` (Decision 4);
  `RFC-005-application-state-modes-undo.md:15, 57` (Decision 1 — ephemeral UI state).
- `docs/planning-artifacts/ux-designs/ux-GameOfLife-2026-05-27/organism-editor-design.md:163-206,
  528, 549, 755-757, 796-798`; `clinical-lab-theme/organism-editor.html:212-297, 919-952,
  1263-1285`.
- `docs/implementation-artifacts/palette-cvd-validation.md:79-82` (G1–G4 thresholds and floors).
- `docs/implementation-artifacts/4-7-aging-degradation-toggle.md` (FD1–FD7, review findings,
  bundle figures); `4-6-dominance-control.md` (FD1–FD6, review findings);
  `4-5-organism-name-field.md` (FD3, FD5, FD6); `4-4-three-column-responsive-layout.md` (FD2 —
  each column scrolls; FD4 — tiers are CSS); `3-13-speed-control.md` (trap 5 — `aria-hidden`
  marks, trap 9 — controlled).
- `docs/implementation-artifacts/deferred-work.md:87, 785-793, 1008-1016, 1058-1148`.
- `docs/implementation-artifacts/lane-gates.yaml`.
- `docs/project-context.md` — Framework rules (three state categories, components split by mode,
  no repository import, `styled()` + tokens, the `ctx.fillStyle` token trap — the picker is DOM,
  not canvas, so an `hsl()` string in `style` is fine), Testing rules (axe, never snapshot, no
  coverage padding, Playwright viewport band), Code Quality (AR-46, `spec:check`, camelCase
  files, comments explain why), Commit gate.

## Dev Agent Record

### Agent Model Used

Sonnet (claude-sonnet-5), via `bmad-dev-story`.

### Debug Log References

- `npm run typecheck` — green (5/5 packages).
- `npm run lint` (targeted + full via `npm run ci`) — clean, no findings on new/changed files.
- `npx prettier --check` — two rounds; `ColorPickerField.tsx`, `ColorPickerField.test.tsx` and
  `OrganismEditorModal.test.tsx` needed one `prettier --write` pass, then clean.
- `node scripts/check-spec-ids.mjs` — ✓ 250 cited ids resolve.
- `node scripts/check-engine-boundary.mjs` — ✓ 7 escape shapes rejected, 2 legitimate imports
  accepted (unchanged — `packages/*` untouched).
- `npm run test:coverage` — 1362/1362 web tests green; `@gol/domain` 100/100/100/100 (unchanged);
  `@gol/simulation` 100/100/100/100 (unchanged); `@gol/persistence` 99.19/96.07/100/100
  (unchanged); `@gol/test-utils` 94.44/90.09/100/97.07 (unchanged) — all four cache-hit, confirming
  AC10 (`packages/*` untouched).
- `npm run build:standalone` + `npm run bundle:check`:
  - `/` 333.4 KB (budget 340, 6.6 KB headroom) — byte-identical to pre-story.
  - `/battle` 308.7 KB (budget 310, 1.3 KB headroom) — byte-identical to pre-story.
  - `/battle/new` 308.6 KB (budget 310, 1.4 KB headroom) — byte-identical to pre-story.
  - `/organisms` 295.4 KB (budget 305, 9.6 KB headroom) — **+0.1 KB** vs the 4.7 baseline
    (295.3 KB), inside the ±0.5 KB noise floor.
  - Editor chunk (the file containing `ColorPickerField`/`Organism Color`, found by grepping
    `.next/static/chunks/*.js`): **5427 B gzip**, up from 4.7's measured 4744 B (**+683 B**) — the
    twenty-swatch map, the fieldset chrome and the new test hooks, exactly as anticipated.
- `npm run bench` + `npm run bench:check` — 100×60×20 step 10.701 ms + repaint-diff 0.203 ms =
  10.904 ms frame vs the 16.667 ms budget (5.763 ms / 34.6% headroom); unrelated to this story
  (`packages/*` untouched) and not gated by it.
- `npm run ci > ci.log 2>&1; echo $?` → **exit 1** on the LOCAL four-project Playwright matrix.
  Two failures, both **pre-existing and unrelated to this story**:
  `[webkit]` and `[tablet]` › `battleRoute.spec.ts:2218` › *Transport controls (Story 3.12) › Tab
  reaches Play, Next cycle, Stop & reset in order…* — exactly the macOS-WebKit `Tab` → `<body>`
  flake `deferred-work.md:1008-1016` already records. Per that note and the story's own
  instruction, this was not "fixed" here. All 622 other e2e tests passed, including every new
  Story 4.8 test on all four projects (chromium/firefox/webkit/tablet, run individually to
  confirm — 49 + 18 = 67 assertions, zero failures). Typecheck, lint, format:check, spec:check,
  boundary:check, coverage, build, bundle:check and bench:check all passed inside this same run.
  Remote CI to be checked via `gh run list --limit 1` once pushed (this branch has not opened a PR
  yet — that is a later step per the calling instructions).

### Completion Notes List

- Implemented all 7 tasks exactly as specified: the pure M6 derivation (`defaultColorToken`), the
  draft's colour seed replacing the Story 4.7 `DEFAULT_COLOR_TOKEN` stopgap, the shared
  `Fieldset`/`Legend` chrome, `<ColorPickerField>` itself (native radiogroup, three selection
  channels, CSS-only glow), the modal wiring (`library` prop, lifecycle/data props split,
  `setColorToken`), the e2e block, and the bundle/deferred-work/CI verification.
- `DEFAULT_COLOR_TOKEN` is no longer imported by `organismDraft.ts` — confirmed by grep; the M6
  derivation never reads it either (FD2).
- One deviation from the illustrative test code in the story: `data-selected-name` is written as
  the bare boolean JSX shorthand (`<SelectedName data-selected-name>`), which React renders as
  `data-selected-name="true"` — functionally identical to the attribute-selector use in every
  test, just noting it's not the empty-string form some markup snippets implied.
- `ColorPickerField.test.tsx`'s axe assertions scan the render `container` (not `document.body`),
  matching `DominanceField.test.tsx`'s precedent — scanning `document.body` for a component
  rendered outside any landmark trips axe's `region` rule, which is a false alarm for a field
  tested in isolation (the modal-level axe test in `OrganismEditorModal.test.tsx` already covers
  the field inside real page structure).
- `OrganismLibrary.test.tsx`'s reopen test (Task 5 item 1) picks `PALETTE[10]` before exit and
  asserts the M6-derived name after reopen; because that fixture (`createMockOrganisms()` alone,
  no Conway's Classic) derives to `PALETTE[0]` — numerically equal to `DEFAULT_COLOR_TOKEN` — the
  NEW test right after it (FD8) is the one that actually distinguishes the derivation from the
  deleted stopgap, using a fixture that prepends `CONWAYS_CLASSIC`.
- Deferred-work.md: struck the 4.6 "Color-before-Dominance" item and the 4.7 "`DEFAULT_COLOR_TOKEN`
  stopgap" item (both marked "✅ Resolved in Story 4.8", prose kept per the 4.7 review's
  strike-not-rewrite rule); added the Story 4.8 section with all 8 items from Task 7, including
  the FD9 loading-window flag and the Story 4.25 library-vs-roster note.
- No HALT conditions were hit. No new dependencies were added. No `packages/*` file was touched.

### File List

**New:**
- `apps/web/lib/palette/defaultColorToken.ts`
- `apps/web/lib/palette/defaultColorToken.test.ts`
- `apps/web/components/organisms/editor/ColorPickerField.tsx`
- `apps/web/components/organisms/editor/ColorPickerField.test.tsx`

**Modified:**
- `apps/web/lib/organisms/organismDraft.ts`
- `apps/web/lib/organisms/organismDraft.test.ts`
- `apps/web/components/organisms/editor/fieldStyles.ts`
- `apps/web/components/organisms/editor/OrganismEditorModal.tsx`
- `apps/web/components/organisms/editor/OrganismEditorModal.test.tsx`
- `apps/web/lib/organisms/useOrganismEditorModal.ts`
- `apps/web/lib/organisms/useOrganismEditorModal.test.tsx`
- `apps/web/components/organisms/OrganismLibrary.tsx`
- `apps/web/components/organisms/OrganismLibrary.test.tsx`
- `apps/web/e2e/organisms.spec.ts`
- `docs/implementation-artifacts/deferred-work.md`
- `docs/implementation-artifacts/sprint-status.yaml`
- `docs/implementation-artifacts/4-8-color-picker-selection-defaults.md` (this file)

### Change Log

- 2026-09-16 — Story file created (create-story): ACs decomposed, FD1–FD9 recorded, precedent
  and spec map compiled; status → ready-for-dev.
- 2026-09-16 — Implemented (dev-story): all 7 tasks complete, `npm run ci` run locally (exit 1 on
  two pre-existing, unrelated Story 3.12 WebKit/tablet flakes only — see Debug Log References);
  status → review.
- 2026-09-16 — Code review (Opus, three adversarial layers): 8 patches applied in the review commit
  (test-fidelity gaps against Task 4/6, a property test whose least-used branch was unreachable,
  two comment corrections); 0 decision-needed; status → done.
- 2026-09-16 — Owner review of PR #45 (Sidiar): the column did not match the mockup — FD7 had
  followed the design doc's always-open 100×100 layout. Reworked to the mockup: 44×44 chip,
  "Change Color ▾" disclosure (collapsed at mount, pointer pick collapses + focuses the button,
  keyboard pick keeps it open), `repeat(8, 1fr)` grid, accent border + glow + `scale(1.05)`
  hover on the swatches. AC1/AC5/FD7 rewritten, the three FD7 deferred-work bullets struck, the
  epic AC wording corrected. Unit: 130/130 `components/organisms`; e2e block 24/24 on all four
  projects; typecheck/lint/format clean.

Dev Model: sonnet   # follows the 4.5/4.6/4.7 editor-field pattern (draft field already exists, controlled field in the basicInfo fragment, pure helper in lib, native radio group per the GridSettingsSection precedent); the two shaping choices — the modal's `library` prop / props-type split and the factory taking the library's tokens — are pinned in FD3/FD5, so nothing is left for later stories to discover
Proposed lane gate: none

---

This story was implemented with the 'Implement next story' skill with the following stats:

| Phase | Agent model | Agents | Active | Wall clock | Input | Output | Cache write | Cache read | Total tokens |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Step 0 — re-entry guard | — | 0 | 41s | 41s | 16 | 2,808 | 6,566 | 378,288 | 387,678 |
| Step 1 — create-story | opus-5 | 1 | 18m 42s | 18m 42s | 182 | 81,843 | 890,109 | 13,821,212 | 14,793,346 |
| Step 2 — dev-story | sonnet-5 | 1 | 36m 19s | 36m 19s | 522 | 87,309 | 1,374,536 | 58,372,744 | 59,835,111 |
| Step 3 — code review + PR | opus-5 | 4 | 26m 48s | 26m 48s | 400 | 93,451 | 1,229,984 | 20,502,011 | 21,825,846 |
| _of which the orchestrator_ | opus-5 | — | — | — | 48 | 8,723 | 25,605 | 1,245,331 | 1,279,707 |
| **Total (create-story → PR ready)** | | 6 | **1h 22m** | 1h 22m | 1,120 | 265,411 | 3,501,195 | 93,074,255 | **96,841,981** |

Run started 2026-09-16 16:22 CEST; wall clock runs to the point the run stopped for the owner's review. No idle gaps were excluded; Active and Wall clock agree. (A gap counts as idle above 15 min.) Each phase row covers the phase agent, any agents it spawned, and the orchestrator's own turns in that window — the orchestrator row breaks its share out again, it is not additional. Cache reads dominate the token totals and are billed at a fraction of input rate, so read the Input and Output columns for effort and the total only as a ceiling. The orchestrator's final turn is still being written when these numbers are taken.
