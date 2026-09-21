---
baseline_commit: 0fa68102ece15da0630af2c3dcb62e42f9e9f40e
---

# Story 4.13: Editor Validation & Feedback

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a user,
I want clear errors and confirmations when saving,
so that I always know what's wrong and what succeeded.

## Acceptance Criteria

From `epics.md#Story 4.13: Editor Validation & Feedback` (`:1140-1151`), decomposed into what a
reviewer can check independently. AC5–AC10 are repo-derived: the obligations the shipped fields
(4.5's `touched`/`role="alert"` idiom, 4.6's clamp-by-construction, 4.8's palette-only token,
4.11's `validateConditionDraft` and per-row `touched`, 4.10/4.12's cards and focus effects), the
deferred-work entries addressed to this story (`deferred-work.md:1098-1102, 1137-1143, 1160-1167,
1217-1219, 1259-1262, 1596-1599, 1606-1609`), the token layer and the CI gates impose.

⚠️ **Scope boundary, read first (FD1).** This story makes Save a **live validation gate**. It does
**not** persist (Story 4.16 — "the Save action is now live"), does not close the editor on success
(the design doc's save flow step 4, `organism-editor-design.md:553-559`, is *after* step 3
"Organism saved to library"), and therefore does **not** show the "Organism saved successfully"
toast nor the post-save "no rules defined" warning: both report on a save that this branch cannot
perform, and `main` deploys to a public GitHub Pages site on every green merge (`ci.yml:176-190`),
so a toast that says "saved" over an unpersisted draft would be shipped as a lie (NFR-4.1 — the
exact reasoning the current `disabled` Save comment records at `OrganismEditorModal.tsx:272-277`).
The epic's AC3 (warning) and AC4 (toast) are re-homed onto **Story 4.16's success path** — the
proposal is in *Open flags*, with proposed AC text. What this story owes AC3 is the **non-blocking
half**: zero rules is not an error, the gate passes it, nothing red appears.

1. **Save is an enabled control that runs the gate; an invalid draft is refused with every error
   shown at once.** The header's Save `<Button>` loses `disabled` and gains `onClick={handleSave}`.
   On click, `validateOrganismDraft(draft)` (AC5) runs; when it returns ≥ 1 error the modal flips
   `saveAttempted` to `true` — **sticky for the life of the mount** (a fresh draft per open is the
   `mounted` gate's doing, so no reset is needed) — and every field renders its error regardless of
   its own `touched` state (the "Save-time show-everything override" 4.5 FD2, 4.11 AC4 and the
   4.11 review's option 1 all reserve for this story). Concretely, after one Save on a draft with
   an empty name, a rule with zero conditions, and a rule whose Age range row has Min `5` and Max
   `` (never typed into): the name input carries `aria-invalid="true"` + the `--gol-danger` border
   + the "Organism name is required" alert line; the zero-condition card shows "Rule must have at
   least one condition" (AC6); the range row shows "Max must be a whole number from 0 to 999" with
   `aria-invalid` on Max (the 4.11 deferred "Max hidden while Min untouched" gap, closed here). The
   errors stay **derived**: typing a name removes its line on the keystroke, adding a condition
   removes the rule's line — no second Save is needed to clear anything. Nothing here calls a
   repository, closes the dialog, or touches `onClose` (AR-2 / AR-27; Story 4.23 owns the dirty
   scope). (UX-DR14, FR-2.1, FR-2.5, NFR-4.2)

2. **Focus moves to the first invalid field, in document order, on every refused Save.** The
   first element of the error list (name → rules in list order → within a rule, its zero-condition
   error or its condition rows in order) is focused by an effect that runs on the render carrying
   the error lines, scoped to the modal's own shell (`shellRef`, never `document.querySelector`),
   via `errorTargetSelector(target)` (AC7): the name `<input>` (`[data-organism-name]`), a
   zero-condition rule's **"+ Add Condition"** button (`[data-rule-id="…"] [data-add-condition]`
   — the control that fixes the error), or the offending numeric/organism control
   (`[data-rule-id="…"] [data-condition-id="…"] [data-condition-value|min|max]`; a `pair` error
   targets **Min**). A second Save after the name is fixed lands on the next error. `focus()`
   scrolls the independently-scrolling Rules column (Story 4.4) to the target natively — no
   `scrollIntoView` call. A valid draft moves no focus. (UX-DR14, UX-DR17)

3. **Errors are announced: the per-field `role="alert"` lines stay, no summary region is added
   (FD6).** Each error line that becomes visible on Save mounts as the existing
   `<ErrorText role="alert">` (4.5 FD4, 4.11 AC4) and announces once; the focused control's
   `aria-describedby` points at its own line, so a screen-reader user hears the first error with
   the focus move even when nothing newly mounted (a repeated Save with the same errors). The
   4.5 deferred question (`deferred-work.md:1098-1102`) is answered: keep `alert`, no summary —
   a refused save is the assertive case (`deferred-work.md:358`), and a summary would be a third
   reading of the same sentence. (UX-DR17)

4. **Zero rules is not an error; the gate passes it and nothing red appears (the non-blocking half
   of the epic's AC3).** With a valid name and `survivalRules: []`, Save renders no alert, sets no
   `aria-invalid`, moves no focus, and leaves the empty state (`[data-rules-empty-state]`) exactly
   as Story 4.10 built it. `validateOrganismDraft` never inspects `survivalRules.length`. The
   warning text ("No rules defined. Organism will have no living cells.", design doc `:764`) is
   **not rendered here** — it is delivered with the save it warns about (FD1, Open flags).
   (UX-DR14)

5. **`validateOrganismDraft` is one pure, document-ordered validator over the existing per-field
   validators — and checks nothing the fields already make impossible.** In
   `lib/organisms/organismDraft.ts`: `validateOrganismDraft(draft): readonly DraftError[]`, where
   `DraftError = { target: DraftErrorTarget; message: string }` and `DraftErrorTarget` is the
   union `{ kind: 'name' } | { kind: 'rule'; ruleId } | { kind: 'condition'; ruleId; conditionId;
   field: ConditionDraftField }`. It calls `validateOrganismName` (4.5 — "the SAME function for the
   Save gate", `organismName.ts:7`), then per rule in order: `ruleNeedsCondition(rule)` (AC6) **or**
   (a rule with rows has no zero-condition error) each row's `validateConditionDraft` (4.11 — "the
   function 4.13's gate calls per condition row", `deferred-work.md:1141-1143`). **No** colour
   check (`draft.colorToken` is always a `PALETTE` id by construction, `deferred-work.md:1259-1262`
   — the epic's "no color" item is unreachable and recorded so), **no** dominance check (always a
   clamped integer, `:1137-1143`), **no** `agingEnabled` check (`:1217-1219`), **no** summary
   check (clamped at 100, 4.10 FD2). `[]` means valid. No Zod call (project-context: Zod parses at
   boundaries — 4.16's save is the boundary; this is the displayed-error view of the same parse,
   the 4.11 "one parse, two views" idiom). (FR-2.1, FR-2.5, AR-39)

6. **A rule with zero conditions is flagged at Save, on the control that fixes it.**
   `ruleDraft.ts` exports `RULE_NEEDS_CONDITION = 'Rule must have at least one condition'` (design
   doc `:768`, verbatim) and `ruleNeedsCondition(rule)`. `<ConditionsEditor>` gains a required
   `showAllErrors: boolean` prop; when `showAllErrors && conditions.length === 0` it renders, between
   the legend and the add button, `<ErrorText id={errorId} role="alert" data-rule-error>` with the
   `⚠︎` glyph (U+26A0 U+FE0E, `aria-hidden`) + the message, and the "+ Add Condition" button carries
   `aria-describedby={errorId}` and `data-invalid` (→ `borderColor: var(--gol-danger)`). **No
   `aria-invalid` on the fieldset, the group or the button** — ARIA 1.2 does not allow it on
   `group`/`button` and axe's `aria-allowed-attr` fails it (FD4); the `data-invalid` selector is
   the boundary cue, the alert is the text, the describedby is the association. Adding a row
   removes all three on the same render. A freshly added rule (zero rows) shows **nothing** until a
   Save is attempted — never red on add (4.5 FD2's "never on mount", applied to a new card).
   (UX-DR14, UX-DR17, FR-2.5)

7. **The override is one boolean, threaded, never a context; visibility stays derived.**
   `showAllErrors` is a **required** prop on `<OrganismNameField>`, `<RulesEditor>`, `<RuleCard>`,
   `<ConditionsEditor>` and `<ConditionRow>` (an optional prop is how a later caller ships a dead
   handle — 4.9 FD1). Name: `visibleError = touched || overLimit || showAllErrors ? error : null`.
   Row: `visible = error !== null && (showAllErrors || (error.field === 'pair' ? touched.min &&
   touched.max : touched[error.field]))`. The `touched` state, the `invalidAttrs` helper, the
   `aria-describedby` listed **only while the alert is mounted** (4.5's `aria-valid-attr-value`
   rule) are all unchanged. The organism-type `<select>` joins `invalidAttrs('value')` (FD8) so an
   `ORGANISM_REQUIRED` row (`pattern: ''`, reachable through Story 4.17 seeds) gets the same border
   and association as a numeric input. The modal passes `showAllErrors={saveAttempted}` to the name
   field and to `<RulesEditor>`; `<DominanceField>`, `<ColorPickerField>`, `<AgingToggleField>` get
   nothing (AC5 — no error to show).

8. **A valid Save is honest about what did not happen (FD1, transitional).** When the gate passes,
   the modal renders — in flow, directly under the header, above the body — a
   `<SaveNotice role="status" data-save-notice>` reading **"Valid organism — saving to the library
   is not available yet."** (`--gol-text-secondary` on `--gol-bg-primary`, 12px, the
   `<SaveErrorLine>` placement idiom from `BattleEditorView.tsx:376-400` minus the danger colour: this
   is not an error). It is shown while `noticeRequested && errors.length === 0` (derived — a later
   edit that makes the draft invalid hides it; a refused Save clears `noticeRequested`), mounted
   conditionally so `role="status"` announces on appearance. Story 4.16 **deletes** the notice, its
   test and this AC when it inserts the repository write, the close and the toast into this exact
   branch. The alternative — a valid Save that does nothing — is what `OrganismEditorModal.tsx:273`
   names "the worse lie". (NFR-4.1, NFR-4.2)

9. **Every existing guard is retargeted only where this story legitimately changes the DOM.**
   (a) `OrganismEditorModal.test.tsx:53-58` "renders Save as a genuinely disabled button" →
   "renders Save as an enabled button"; `:97-105` "does nothing when Save is activated" → deleted,
   replaced by Task 6's gate cases; `:283-285` the `outerHTML` before/after comparison **stays**
   (a colour pick still leaves Save byte-identical) — only its comment changes ("Story 4.16's
   inert button" → "the Story 4.13 gate does not react to a pick"). (b) `e2e/organisms.spec.ts:305`
   `toBeDisabled()` → `toBeEnabled()`; `:1439-1442` `toBeDisabled()` → `toBeEnabled()`, the
   `outerHTML` comparison stays, comment retargeted. (c) `RuleCard.test.tsx`'s `renderCard`,
   `RulesEditor.test.tsx`'s `Harness`, `ConditionsEditor.test.tsx`'s and `ConditionRow.test.tsx`'s
   render helpers, `OrganismNameField.test.tsx`'s renders each gain `showAllErrors: false` as the
   default (overridable) — **no existing assertion changes**: with the override `false`, every
   shipped behaviour is byte-identical by construction (the Story 4.7 proof idiom). (d) Everything
   else — `DominanceField`, `ColorPickerField`, `AgingToggleField`, `OrganismEditorLayout`,
   `useOrganismEditorModal`, `OrganismLibrary` (+ tests), the 4.1–4.4, 4.6–4.10 and 4.12 e2e
   blocks — **unedited**. (AR-44)

10. **axe passes in every settled state; the bundle gate passes; no route's first load moves.**
    vitest-axe: the modal with the three AC1 errors visible → `[]`; with the AC8 notice → `[]`;
    `<ConditionsEditor>` with the rule error → `[]`. `@axe-core/playwright` on `/organisms` after a
    refused Save (name + rule errors visible, focus on the name field) → `[]`, using the 4.5 e2e
    idiom (`waitForTimeout(300)` for the header Button's own MUI transition before the scan). The
    `--gol-danger` border on the add-condition button sits on the card's `--gol-bg-secondary`
    (≥ 3:1, the gated pair); every error line is the existing `ErrorText` on the same surface
    (4.90:1). **No new token**, no literal — `themes.css` and `themeTokens.test.ts` untouched
    (AR-46). Everything new rides `OrganismEditorModal.tsx`'s lazy chunk (`organismDraft.ts`,
    `ruleDraft.ts` are imported only from it); `/` (340), `/battle` (310), `/battle/new` (310),
    `/organisms` (305) stay within ±0.5 KB of `main`; the editor chunk grows (expect ≈ +1.0–1.5 KB
    gzip). **No budget is raised.** `npm run ci:dev > ci.log 2>&1; echo $?` locally; CI on the PR
    checked with `gh run list --limit 1` **after the PR opens**. (NFR-8.3, AR-35, AR-46)

## Tasks / Subtasks

- [x] **Task 1 — The rule-level check** (AC: 6)
  - [x] `apps/web/lib/organisms/ruleDraft.ts`, after `MAX_RULE_SUMMARY_LENGTH`:
        ```ts
        /** Design doc `:768`, verbatim. The displayed-error view of `SurvivalRuleSchema`'s
         * `conditions.min(1)` (Story 4.13); the persisted-shape view is Story 4.16's parse. */
        export const RULE_NEEDS_CONDITION = 'Rule must have at least one condition';

        /** A rule with no rows cannot fire (FR-2.5: AND over zero conditions is not a rule the
         * engine accepts — `conditions.min(1)`). A rule WITH rows is judged row by row by
         * `validateConditionDraft`; the two are exclusive, never additive. */
        export function ruleNeedsCondition(rule: RuleDraft): boolean {
          return rule.conditions.length === 0;
        }
        ```
  - [x] `ruleDraft.test.ts`, `describe('ruleNeedsCondition')`: `createNewRuleDraft('x')` → `true`;
        a rule with one `createNewConditionDraft` row → `false`; `RULE_NEEDS_CONDITION` equals the
        design doc string (pin the literal — the message is UI copy, the test is where a drift
        is caught).

- [x] **Task 2 — `validateOrganismDraft`, pure and ordered** (AC: 4, 5)
  - [x] `apps/web/lib/organisms/organismDraft.ts`, after `createNewOrganismDraft` (imports:
        `validateOrganismName` from `./organismName`; `type ConditionDraftField`,
        `validateConditionDraft` from `./conditionDraft`; `ruleNeedsCondition`,
        `RULE_NEEDS_CONDITION` from `./ruleDraft`):
        ```ts
        // --- Validity — the Save gate's view (Story 4.13). One validator over the fields' own. ---

        /** Where an error lives, in the shape the modal's focus effect resolves to a control
         * (`errorTargetSelector`) — ids, never indices: a rule's index changes on reorder
         * (Story 4.12) while its id does not (RFC-004 §2.4). */
        export type DraftErrorTarget =
          | { readonly kind: 'name' }
          | { readonly kind: 'rule'; readonly ruleId: string }
          | {
              readonly kind: 'condition';
              readonly ruleId: string;
              readonly conditionId: string;
              readonly field: ConditionDraftField;
            };

        export interface DraftError {
          readonly target: DraftErrorTarget;
          readonly message: string;
        }

        /**
         * Every displayed error the draft holds, in DOCUMENT order — name (Basic Information
         * column), then each rule in list order, then within a rule either its zero-condition
         * error OR its rows' errors in row order (exclusive: a rule with rows has no
         * zero-condition error). `[]` is "valid". The first entry is what Save focuses.
         *
         * Calls the SAME validators the fields render from (`validateOrganismName`,
         * `validateConditionDraft`) so the gate and the inline lines cannot disagree about
         * what "invalid" means — the `organismName.ts` header's contract. Deliberately checks
         * NOTHING for `colorToken` (always a PALETTE id — seeded by `defaultColorToken`, written
         * only by a radio whose value is one), `dominance` (clamped before every commit,
         * `<DominanceField>` FD4), `agingEnabled` (a boolean) or a rule's summary (clamped at
         * `MAX_RULE_SUMMARY_LENGTH`): each is valid by construction and a check here would be
         * dead code with a message no user can reach. Zero rules is NOT an error (design doc
         * `:551, :764-765`: "Allow save but show warning") — the warning belongs to the save
         * that proceeds (Story 4.16), not to this gate. No Zod: this is the displayed-error
         * view; 4.16's parse at the persistence boundary is the other view of the same facts.
         */
        export function validateOrganismDraft(draft: OrganismDraft): readonly DraftError[] {
          const errors: DraftError[] = [];
          const nameError = validateOrganismName(draft.name);
          if (nameError !== null) errors.push({ target: { kind: 'name' }, message: nameError });
          for (const rule of draft.survivalRules) {
            if (ruleNeedsCondition(rule)) {
              errors.push({ target: { kind: 'rule', ruleId: rule.id }, message: RULE_NEEDS_CONDITION });
              continue;
            }
            for (const condition of rule.conditions) {
              const error = validateConditionDraft(condition);
              if (error !== null) {
                errors.push({
                  target: { kind: 'condition', ruleId: rule.id, conditionId: condition.id, field: error.field },
                  message: error.message,
                });
              }
            }
          }
          return errors;
        }
        ```
        Update the file header: the draft "grows one field per story" sentence gains "and Story
        4.13's validator reads all of them".
  - [x] `organismDraft.test.ts`, `describe('validateOrganismDraft')`: (a) a fresh
        `createNewOrganismDraft([])` → exactly one error, `{ kind: 'name' }`, message
        `ORGANISM_NAME_REQUIRED`; (b) name `'Glider'`, no rules → `[]` (**zero rules is valid**);
        (c) a 51-char name → the too-long message, `{ kind: 'name' }`; (d) one rule with zero rows
        → `[{ kind: 'rule', ruleId }]` with `RULE_NEEDS_CONDITION`; (e) one rule with a `cellState`
        row → `[]`; (f) one rule with an Age `range` row `['5', '']` → one `condition` error,
        `field: 'max'`, message `wholeNumberMessage('Max must be', 0, MAX_AGE_LITERAL)`; (g) a rule
        with a scalar row `''` and an organismType row `''` → two condition errors in row order
        (`value`, `value`), messages `wholeNumberMessage('Enter', …)` then `ORGANISM_REQUIRED`;
        (h) **order**: empty name + rule A (zero rows) + rule B (one invalid row) → targets
        `[name, rule A, condition in B]` — and after `moveRule` puts B first → `[name, condition
        in B, rule A]` (ids, not indices); (i) a rule with rows carries **no** `rule` error even
        when every row is invalid; (j) colour/dominance/aging never appear: a draft with
        `colorToken: 'not-a-token'`, `dominance: 999`, `agingEnabled: true` and a valid name →
        `[]` (pins AC5's "checks nothing the fields make impossible" — if a later story adds a
        check, this test is the conversation); (k) a fast-check property: for a draft built from
        `fc.string()` name, `fc.array` of rules each with `fc.nat({ max: 3 })` rows of scalar text
        from `fc.oneof(fc.constant(''), fc.integer({ min: 0, max: 8 }).map(String))`, the error
        count equals `(validateOrganismName(name) !== null ? 1 : 0) + Σ rules (rows === 0 ? 1 :
        rows.filter(invalid).length)` and the targets' `ruleId`s appear in `survivalRules` order
        (the `lib/battle/resizeGrid.test.ts` `fc.assert(fc.property(…))` idiom; cover the empty-name
        bound explicitly — the 4.11 review's "arbitrary never reached half the domain").

- [x] **Task 3 — The override reaches every field** (AC: 6, 7, 9c)
  - [x] `OrganismNameField.tsx`: props gain `/** Story 4.13's Save-time override: every error
        shows regardless of `touched` (4.5 FD2 kept for the untouched, unattempted case). */
        showAllErrors: boolean;` (required). `visibleError = touched || overLimit || showAllErrors ?
        error : null`. `Input` gains `data-organism-name` (the gate's focus target — the modal
        must not locate it by label text). Rewrite the `:129-131` comment (the override is here
        now) and the FD2 header bullet's last clause.
  - [x] `OrganismNameField.test.tsx`: every render gains `showAllErrors={false}`; add (r) **the
        override reveals the required error on an untouched empty field**: `showAllErrors` →
        alert `ORGANISM_NAME_REQUIRED`, `aria-invalid`, describedby order `[alert.id, counter.id]`;
        (s) **the override reveals nothing on a valid value**: `value="Glider"` + `showAllErrors`
        → no alert, not invalid; (t) **flipping the override on an untouched field mounts the
        alert once** (`rerender` from `false` to `true` → `getAllByRole('alert')` length 1); (u)
        axe with the override-revealed error → `[]`; (v) the input carries `data-organism-name`.
  - [x] `ConditionRow.tsx`: props gain `showAllErrors: boolean` (required). `visible = error !==
        null && (showAllErrors || (error.field === 'pair' ? touched.min && touched.max :
        touched[error.field]))`. The organism-type `<RowSelect>` gains `{...invalidAttrs('value')}`
        (FD8 — the `cellState` select never errors and gets nothing). Header comment: the
        visibility sentence gains the override clause; `(Story 4.13)` joins the tag line.
  - [x] `ConditionRow.test.tsx`: renders gain `showAllErrors: false`; add (o) **a fresh scalar row
        under the override shows its bounds error untouched**: Age `eq` `''` + `showAllErrors` →
        alert `wholeNumberMessage('Enter', 0, MAX_AGE_LITERAL)`, value input `aria-invalid`;
        (p) **a Max-first gap is closed**: range `['5', '']` + override → the Max message, Max
        invalid, Min not; (q) **an empty organism select under the override**: `organisms: []`,
        pattern `''` + override → alert `ORGANISM_REQUIRED`, the combobox `aria-invalid="true"` and
        `aria-describedby` = alert id; without the override → no alert, no `aria-invalid` (the 4.11
        AC5 case, now with the association); (r) **a valid row under the override shows nothing**;
        (s) axe with (p) visible → `[]`.
  - [x] `ConditionsEditor.tsx`: props gain `showAllErrors: boolean` (required, passed to every
        `<ConditionRow>`). `const errorId = useId()`; `const needsCondition = showAllErrors &&
        conditions.length === 0`. Copy `<ConditionRow>`'s `ErrorText` rule set **minus
        `gridColumn`** (third copy in the editor — `OrganismNameField`, `ConditionRow`, here — so
        **lift it into `fieldStyles.ts` as `export const ErrorText`** with the `flex: 1; minWidth: 0`
        of the name field dropped (that was `<Meta>`'s flex row; the two other callers add their own
        layout rule via `styled(ErrorText)({ gridColumn: '1 / -1' })` / `styled(ErrorText)({ flex:
        1, minWidth: 0 })`) — the Story 4.7 three-callers threshold, and `fieldStyles.ts`'s header
        already names the shape). Markup, between `<Legend>` and the rows:
        ```tsx
        {needsCondition && (
          <ErrorText id={errorId} role="alert" data-rule-error>
            <span aria-hidden="true">{'⚠︎'}</span> {RULE_NEEDS_CONDITION}
          </ErrorText>
        )}
        ```
        and on the add button: `aria-describedby={needsCondition ? errorId : undefined}`
        `data-invalid={needsCondition || undefined}`; `AddConditionButton` gains `'&[data-invalid]':
        { borderColor: 'var(--gol-danger)' }` (border only — the label stays
        `--gol-text-secondary`; `--gol-danger` text on `--gol-bg-hover` (the hover fill) is the
        4.48:1 pair `themeTokens.test.ts` deliberately does not gate). Comment: why the button and
        not the fieldset carries the association (FD4: `aria-invalid` is not allowed on `group` or
        `button` in ARIA 1.2 — axe `aria-allowed-attr`; the describedby IS allowed on a button, and
        the button is the control that fixes the error, which is also why it is the focus target);
        why `data-invalid` rather than a class. `(Story 4.13) (UX-DR14) (UX-DR17)` on the header.
  - [x] `ConditionsEditor.test.tsx`: renders gain `showAllErrors: false`; add (l) **zero rows +
        override → the alert, the button described and marked**: `getByRole('alert')` has
        `RULE_NEEDS_CONDITION`; `getByRole('button', { name: '+ Add Condition' })` has
        `aria-describedby` = alert id and `data-invalid`; (m) **zero rows without the override →
        nothing** (the existing (:51) case, plus `queryByRole('alert')` null and no `data-invalid`);
        (n) **adding a row clears all three** on the same render (`await user.click(add)` →
        `queryByRole('alert')` null, no `aria-describedby`, no `data-invalid`); (o) **rows + override
        → no rule error**, only the rows' own; (p) axe with (l) → `[]`.
  - [x] `RuleCard.tsx`: props gain `showAllErrors: boolean` (required), passed to
        `<ConditionsEditor>`. Header: "Story 4.13 flags a zero-condition card at Save" → "Story 4.13
        threads `showAllErrors` through to `<ConditionsEditor>`, which flags a zero-condition card at
        Save". `RuleCard.test.tsx`: `renderCard` gains `showAllErrors: false` (overridable); add (t)
        **a zero-condition card under the override shows the rule alert inside its group**
        (`within(group).getByRole('alert')`), and (u) **a card with Conway's rows under the
        override shows none**.
  - [x] `RulesEditor.tsx`: props gain `showAllErrors: boolean` (required), passed to every
        `<RuleCard>`. `RulesEditor.test.tsx`: `Harness` gains `showAllErrors` (default `false`);
        add (y) **the override reaches every card**: `THREE` with the first rule's conditions
        emptied → exactly one alert, inside `Rule 1`'s group.

- [x] **Task 4 — The gate, the focus, the notice: `<OrganismEditorModal>`** (AC: 1, 2, 3, 4, 8)
  - [x] State: `const [saveAttempted, setSaveAttempted] = useState(false)`; `const [focusRequest,
        setFocusRequest] = useState<{ seq: number; target: DraftErrorTarget } | null>(null)`;
        `const [noticeRequested, setNoticeRequested] = useState(false)`; `const shellRef =
        useRef<HTMLDivElement>(null)` on `<Shell ref={shellRef}>`. All ephemeral UI state (the
        three-category rule) — the draft object is **not** widened with validation state.
  - [x] Per render: `const errors = validateOrganismDraft(draft);` (cheap — a name check and a
        scan of the rows; the fields recompute the same per-field validators anyway, and a
        `useMemo` keyed on `draft` would hit exactly as often as the draft changes, i.e. every
        keystroke). `const noticeVisible = noticeRequested && errors.length === 0;`
  - [x] `handleSave` (`useCallback` on `[errors]`):
        ```ts
        const first = errors[0];
        if (first === undefined) {
          setNoticeRequested(true);           // FD1 — honest, transitional; Story 4.16 replaces
          return;                             // this branch with the write, the close, the toast
        }
        setNoticeRequested(false);
        setSaveAttempted(true);
        setFocusRequest((r) => ({ seq: (r?.seq ?? 0) + 1, target: first.target }));
        ```
  - [x] `errorTargetSelector`, exported from the modal file (pinned by the test — the attribute
        names are the components' contract, kept beside the one caller rather than in `lib/`, the
        `cardControl` precedent):
        ```ts
        /** The control that FIXES the error, for `focus()` — not merely the nearest element. Ids
         * through `CSS.escape` (Story 4.17 seeds them from records). A `pair` error lands on Min:
         * the message names both, the first is where the user starts. */
        export function errorTargetSelector(target: DraftErrorTarget): string {
          switch (target.kind) {
            case 'name':
              return '[data-organism-name]';
            case 'rule':
              return `[data-rule-id="${CSS.escape(target.ruleId)}"] [data-add-condition]`;
            case 'condition': {
              const field = target.field === 'pair' ? 'min' : target.field;
              return `[data-rule-id="${CSS.escape(target.ruleId)}"] [data-condition-id="${CSS.escape(target.conditionId)}"] [data-condition-${field}]`;
            }
          }
        }
        ```
  - [x] The focus effect — keyed on `focusRequest` (its `seq` makes a repeated first error a fresh
        request):
        ```ts
        useEffect(() => {
          if (focusRequest === null) return;
          shellRef.current
            ?.querySelector<HTMLElement>(errorTargetSelector(focusRequest.target))
            ?.focus();
        }, [focusRequest]);
        ```
        Comment: why an effect and not the click handler (the alert line and the `aria-describedby`
        that names it mount on the render `saveAttempted` produces; focusing before that render
        reads a control with no description); why `shellRef` (the dialog portals to `document.body`
        — a `document.querySelector` would work and is exactly what the house forbids: every lookup
        through a ref, `<RulesEditor>`'s rule); why no `scrollIntoView` (`focus()` scrolls the
        nearest scrollable ancestor — the Rules column — on every engine; a second scroll call
        would fight it).
  - [x] The notice (AC8): `const SaveNotice = styled('p')({ margin: 0, padding: '10px 30px',
        fontSize: '12px', lineHeight: 1.5, color: 'var(--gol-text-secondary)', background:
        'var(--gol-bg-primary)', borderBottom: '1px solid var(--gol-border)' })` and
        `export const SAVE_UNAVAILABLE_NOTICE = 'Valid organism — saving to the library is not
        available yet.'`; rendered `{noticeVisible && <SaveNotice role="status"
        data-save-notice>{SAVE_UNAVAILABLE_NOTICE}</SaveNotice>}` between `</EditorHeader>` and
        `<EditorBody>`. Comment: transitional — Story 4.16 deletes it; why `status` not `alert` (not
        an error, must not interrupt — `deferred-work.md:358`'s polite/assertive line); why
        conditionally mounted (announces on appearance); why derived from `errors.length` (a stale
        "valid" over an invalid draft would be the lie this line exists to avoid).
  - [x] The Save button: `<Button type="button" variant="contained" onClick={handleSave}
        sx={BUTTON_SX}>` — `disabled` gone. Rewrite the `:272-277` comment: Save is the gate
        (Story 4.13); what it does on each branch; the persistence it still lacks (Story 4.16 —
        "the repository write, the close and the toast land in `handleSave`'s valid branch, replacing
        the notice"); the 4.3 deferred `:793-799` cross-fade note does **not** bite (the button never
        flips `disabled` at runtime any more — the edge was between builds, not states).
  - [x] Pass `showAllErrors={saveAttempted}` to `<OrganismNameField>` and `<RulesEditor>`.
  - [x] Header comment: the draft sentence gains "Story 4.13's gate (`validateOrganismDraft`,
        `saveAttempted`, focus-to-first-invalid)"; `(Story 4.13) (UX-DR14) (UX-DR17)`.
  - [x] `OrganismEditorModal.test.tsx` (retarget per AC9a; append after the 4.12 cases): (11)
        **Save on a fresh draft refuses, reveals the name error, focuses the name field, closes
        nothing**: `await user.click(Save)` → `within(dialog).getByRole('alert')` has
        `ORGANISM_NAME_REQUIRED`, the "Organism Name" textbox `toBeInvalid()`, `toHaveFocus()`,
        `onClose` not called, dialog present; (12) **three errors at once, first focused, all
        derived**: type nothing, add two rules via the header, in rule 2 add a condition and set
        property `Age of Cell`, operator `range`, Min `5` (Max untouched) → Save → alerts: name,
        `RULE_NEEDS_CONDITION` inside `Rule 1`, the Max message inside `Rule 2` (`getAllByRole
        ('alert')` length 3); name field focused; then type `Glider` → the name alert is gone
        **without** a Save (2 alerts); Save again → focus is on `Rule 1`'s `+ Add Condition`; click
        it → `Rule 1`'s alert gone; Save → focus on `Rule 2`'s `Condition 1 maximum`; type `9` →
        no alerts; (13) **a pair error focuses Min**: range Min `9` Max `2` → Save → the `Min must
        be less than Max` alert; focus on `Condition 1 minimum`; (14) **zero rules + valid name is
        not refused** (AC4): type `Glider`, Save → `queryAllByRole('alert')` empty, no
        `[aria-invalid="true"]` anywhere, `document.activeElement` is still the Save button, the
        empty state still rendered, and `getByRole('status')` (scoped `within(dialog)`) has
        `SAVE_UNAVAILABLE_NOTICE` (AC8); (15) **the notice hides when the draft turns invalid and
        clears on a refused Save**: continue from (14), clear the name → `queryByRole('status')`
        null (scoped — the Rules column has none while empty); Save → name alert, and after typing
        the name back the status is **not** back (cleared by the refusal) until the next valid
        Save; (16) **`errorTargetSelector`** (`describe`): the three shapes, `pair` → `min`, an id
        with a quote is escaped (`CSS.escape`); (17) **a reorder keeps the target**: rule A (zero
        rows) then rule B, Save → focus on A's add button; `ArrowDown` on A's handle (A is now
        second) → Save → focus still on A's add button (ids, not indices — Task 2h at the DOM);
        (18) axe with (12)'s three errors → `[]`; axe with (14)'s notice → `[]`.

- [x] **Task 5 — e2e against the served static export** (AC: 1, 2, 3, 4, 8, 9b, 10)
  - [x] `organisms.spec.ts`: retarget `:305` and `:1439-1442` per AC9b. Append `test.describe
        ('editor validation & feedback (Story 4.13)')` after the 4.12 block, forking `openRules` /
        `cardGroup` / `row` (local to the 4.11 describe) and `const save = (dialog) =>
        dialog.getByRole('button', { name: 'Save' })`. Tests:
        1. **A fresh editor's Save is refused: the name error, the red state, focus on the name
           field, zero console errors**: `openRules`; `save.click()` → `dialog.getByRole('alert')`
           `toHaveText(/Organism name is required/)`; the "Organism Name" textbox
           `toHaveAttribute('aria-invalid', 'true')` and `toBeFocused()`; the dialog still visible;
           `errors` `[]`.
        2. **Three errors at once, in document order; each clears on its own fix; focus walks the
           list**: `headerAdd.click()` ×2; in `cardGroup(2)`: `+ Add Condition`, property → `Age
           of Cell`, operator → `range`, Min `5`; `save.click()` → `dialog.getByRole('alert')`
           `toHaveCount(3)`; name focused; fill name `Glider` → count 2; `save.click()` →
           `cardGroup(1).getByRole('button', { name: '+ Add Condition' })` `toBeFocused()` and
           `toHaveAttribute('data-invalid', '')`, and its `aria-describedby` resolves to the alert
           (the 4.5 `[id="…"]` attribute-selector idiom — `useId` ids carry colons); click it →
           count 1; `save.click()` → `row(cardGroup(2), 1).max` `toBeFocused()` and
           `aria-invalid`; fill `9` → count 0.
        3. **Zero rules is not refused; the notice is honest** (AC4/AC8): `openRules`; fill name
           `Glider`; `save.click()` → `dialog.getByRole('alert')` `toHaveCount(0)`,
           `dialog.locator('[aria-invalid="true"]')` `toHaveCount(0)`, `rules.locator
           ('[data-rules-empty-state]')` visible, `dialog.locator('[data-save-notice]')`
           `toHaveText(SAVE_UNAVAILABLE_NOTICE)` (import the constant? — the spec imports only
           `@gol/*`; use the literal with the source comment, as 4.10 does for labels), `save`
           `toBeFocused()` (focus did not move — WebKit: assert `not(name).toBeFocused()` instead,
           the 4.3 WebKit-focus note; the four-browser matrix on the PR decides).
        4. **Keyboard-only refusal**: Tab to Save (or `save.focus()`), `Enter` → same as test 1;
           `Escape` afterwards still closes the dialog (the gate adds no listener).
        5. **axe after a refused Save** (name + rule errors visible, name focused) → `[]`, with the
           4.5 idiom's `await page.waitForTimeout(300)` before `new AxeBuilder({ page }).analyze()`.
  - [x] ⚠️ Run e2e against **this tree's** build: `deferred-work.md:1356-1359`'s port-reuse trap
        (`lsof -i :4173` first; state the result in the Dev Agent Record). `npm run ci:dev`
        (Chromium only).

- [x] **Task 6 — Bundle measurement, docs, verification** (AC: 10)
  - [x] Measure before (on `main`: all four routes + the editor chunk — `grep -rl "Organism
        Color" .next/static/chunks/*.js`, `gzip -c | wc -c`) and after Task 5; record both. Do
        **not** edit `budgetGzipKb`.
  - [x] `deferred-work.md` (append-only plus strike-throughs; `main`'s hunks first on sync):
        - `:1098-1102` (4.5 — `role="alert"` per field vs summary): strike as `✅ Resolved in Story
          4.13 (FD6)` — per-field alerts stay, no summary; the possible double reading of the first
          error (alert mount + describedby on focus) is accepted and recorded.
        - `:1137-1143` (4.6 — numeric invalidity ≠ dominance): strike as `✅ Confirmed in Story 4.13`
          — no dominance check written.
        - `:1160-1167` (4.6 review — the dominance draft lags the textbox): **partial** — for the
          gate it is moot (FD7: a pointer Save blurs first, a keyboard Save means focus already
          left the textbox, no hotkey exists); the *when-is-the-draft-read* question is re-pointed
          to Story 4.23 (dirty diff) and Story 4.16 (the persisted value).
        - `:1217-1219` (4.7 — nothing to check for `agingEnabled`): `✅ Confirmed in Story 4.13`.
        - `:1259-1262` (4.8 — "no color" unreachable): `✅ Confirmed in Story 4.13` — the epic's
          AC item is recorded as unreachable by construction; no colour check.
        - `:1596-1599` (4.11 — Max hidden while Min untouched): `✅ Resolved in Story 4.13` (the
          override).
        - `:1606-1609` (4.11 — Age cap 999 at the override): note "surfaces at Save from 4.13".
        - Add `## Deferred from: Story 4-13-editor-validation-feedback (<date>)` with: (1) **the
          "Organism saved successfully" toast and the post-save "No rules defined. Organism will
          have no living cells." warning are Story 4.16's** (FD1) — with the proposed AC text from
          *Open flags*, the design-doc step order, the public-deploy reasoning, and the toast-host
          facts a 4.16 create-story needs (`useInertBackground.ts:66-68` sweeps body children
          appended while the dialog is open — publish the toast on `onExited`, not on save; MUI
          `Snackbar` is the first consumer of the no-op `--mui-palette-SnackbarContent-bg`,
          `deferred-work.md:92`; the "Organism deleted" toast is 4.22's — `epics.md:1260`); (2)
          **the AC8 notice is transitional** — Story 4.16 deletes `SaveNotice`,
          `SAVE_UNAVAILABLE_NOTICE`, `noticeRequested`, modal tests (14)/(15) and e2e 3; (3) **no
          summary live region** (FD6); (4) **no `aria-invalid` on the Conditions group** (FD4) —
          revisit only if an AT is found not to read a button's describedby; (5) **the double
          announcement** of the first error on Save (alert mount + focus describedby) — accepted;
          (6) **no Save hotkey** (Ctrl/Cmd+S) — none is specified; if one lands, FD7's "focus has
          already left the textbox" no longer holds for `<DominanceField>` and a flush is due; (7)
          **`ErrorText` now lives in `fieldStyles.ts`** (three callers) — `VisuallyHidden` is still
          at two copies; (8) **the mockup has no error CSS at all** (`organism-editor.html` — no
          `error`/`invalid` rule sets); this story's values are 4.5's/4.11's reading of the design
          doc's prose (`:772-777`); (9) **a rule whose every row is invalid shows N row errors, no
          rule-level roll-up** — by design (AC5 exclusivity).
  - [x] `docs/project-context.md` — **no new rule**. Candidate only if a second story trips on it:
        "`aria-invalid` is not allowed on `group`/`button` — associate through `aria-describedby`
        on the fixing control".
  - [x] `npm run ci:dev > ci.log 2>&1; echo $?` — paste the exit code, the bundle lines, the
        domain / simulation / test-utils coverage lines and the e2e summary into the Dev Agent
        Record. Push to `story/4-13-editor-validation-feedback`; `gh run list --limit 1` after the
        PR opens.

## Dev Notes

### Forced decisions (made here so the dev agent does not have to)

- **FD1 — Save becomes the gate now; the toast and the post-save warning ride Story 4.16's
  success path; a valid Save is honest and transitional.** The epic lists four things for this
  story; two of them (the "Organism saved successfully" toast, the "no rules defined" warning
  *on save*) report on a persisted save, and the design doc places both **after** "Organism saved
  to library" and "Editor closes" (`organism-editor-design.md:553-559`) — the toast must outlive
  the modal, on the Library. Nothing persists before 4.16, and `main` deploys to a public site
  on every green merge (`ci.yml:176-190`, README "Quality gate & deployment"). A toast saying
  "saved" over a draft that vanishes on close is a shipped lie about data loss — worse than the
  `disabled` button Story 4.3 chose over a no-op for exactly the NFR-4.1 reason
  (`OrganismEditorModal.tsx:272-277`). Building the toast here unreachable (no caller until 4.16)
  would be dead UI with tests that cannot be run end to end — the 4.11 review's "tests ticked but
  never written" failure mode by construction. So: the gate, the errors, the focus, the
  announcement and the non-blocking pass for zero rules land here and are e2e-proven; the success
  half is proposed for 4.16 (Open flags). The valid branch is not silent: the in-flow
  `role="status"` notice (AC8) says exactly what happened and what did not, and 4.16 deletes it.
  This is the 2.13/`EditorStatusBar` lineage: the house reports save outcomes in flow, above the
  body, never in a floating layer.

- **FD2 — One validator, document-ordered, over the validators the fields already render from.**
  `validateOrganismDraft` composes `validateOrganismName` and `validateConditionDraft` (both built
  with "4.13 calls the SAME function" in their headers) plus the one new rule-level check. It
  returns a list in DOM order so "first invalid field" is `errors[0]` — no second sort, no DOM
  walk. It checks **nothing** for colour, dominance, aging or summary: each is valid by
  construction (`deferred-work.md:1137-1143, 1217-1219, 1259-1262`; 4.10 FD2), and a check with a
  message no user can reach is dead text. The epic's "no color" item is thereby recorded as
  unreachable, not implemented. Zero rules is not an error (design doc `:551`).

- **FD3 — The override is a threaded boolean, sticky after the first refusal.** `showAllErrors`
  flows modal → name field, and modal → `<RulesEditor>` → `<RuleCard>` → `<ConditionsEditor>` →
  `<ConditionRow>` — five hops, all required props. A Context was rejected: the house has no
  Context-as-state (project-context: three categories, no global store), and five explicit hops
  are what make "who reads the override" greppable. Sticky because un-sticking it (clearing on
  every edit) would hide a still-present error the moment the user touched an unrelated field —
  the 4.11 "Max hidden while Min untouched" class of gap, reintroduced. The fields' own `touched`
  logic is untouched: with the override `false`, every shipped behaviour is byte-identical (the
  Story 4.7 proof — the pre-existing tests pass with only the new prop added).

- **FD4 — The zero-condition error hangs off "+ Add Condition", not the fieldset.** ARIA 1.2 lists
  `aria-invalid` on textbox/combobox/listbox/slider/spinbutton/checkbox/radiogroup/gridcell/tree
  — not on `group` (the fieldset) nor `button`; axe's `aria-allowed-attr` fails either. The
  button IS the control that fixes the error, so it is the focus target (AC2) and the natural
  host of `aria-describedby`; `data-invalid` paints the red boundary. The error line sits under
  the legend where the rows would be — "below the field" for a field that has no rows.

- **FD5 — Focus-to-first-invalid is an effect keyed on an attempt sequence, scoped to the shell.**
  The alert line and the `aria-describedby` naming it mount on the render `saveAttempted`
  produces; a `focus()` inside the click handler runs before that render and focuses a control
  with no description yet. `seq` makes the same first target twice a fresh request (the 4.12 FD4
  `key={seq}` idea applied to an effect dep). `shellRef` because the `Dialog` portals to
  `document.body` and the house forbids `document.querySelector` from components
  (`<RulesEditor>`'s rule); `errorTargetSelector` stays in the modal file beside its one caller
  (the `cardControl`/`rowControl` precedent — selectors are the component's contract, not lib's).

- **FD6 — Per-field `role="alert"` stays; no summary region.** The 4.5 deferred item asked this
  story to choose. A refused save is the assertive case (`deferred-work.md:358`); the inline lines
  already are, mounted once per transition (4.5 FD4). A summary ("3 errors") would be a third
  reading of what the alert and the focused control's describedby already say. The one cost —
  the first error may be read twice on Save (its alert mounts, then focus lands on a control
  described by it) — is accepted and recorded.

- **FD7 — No draft flush for `<DominanceField>`.** The gate reads `draft`, which lags the
  textbox until blur/Enter (`deferred-work.md:1160-1167`). Every Save path in this story blurs it
  first: a pointer click on Save fires `blur` (→ `commit`) before `click`, and React flushes the
  discrete `blur`'s state update before the `click` handler runs; a keyboard Save (Enter/Space)
  means focus is already on Save. No hotkey exists. And dominance is never invalid anyway — the
  concern is *which value* is read, which is 4.16's (persisted value) and 4.23's (dirty diff).
  Recorded; a Save hotkey is the trigger to revisit.

- **FD8 — The organism-type `<select>` joins the `invalidAttrs` idiom.** 4.11 left
  `ORGANISM_REQUIRED` reachable only through an empty library or a 4.17 seed with a dangling id,
  and never marked the select. Under the override the row's alert mounts for it; leaving the
  combobox un-associated would be the one error line without a control pointing at it. One spread.

### What exists — read these before writing a line

| File | Why it matters here |
|---|---|
| `apps/web/components/organisms/editor/OrganismEditorModal.tsx` | **Modified.** The draft and its setters (`:193-235`), the `Shell`/`EditorHeader`/`EditorBody` (`:75-152`, the notice slots between the last two), the Save button and its comment (`:272-280`), the header comment's per-story sentence (`:154-165`). |
| `apps/web/components/organisms/editor/OrganismEditorModal.test.tsx` | `LIBRARY` (`:28`), the disabled-Save cases to retarget (`:53-58`, `:97-105`, `:283-285`), the 4.10–4.12 cases to append after (`:404-657`); every query through `screen` (the portal note `:22-25`). |
| `apps/web/components/organisms/editor/OrganismNameField.tsx` | **Modified.** `touched`/`visibleError` (`:129-139`), the `Input` (`:146-167`, gains `data-organism-name`), FD2 and the `:131` comment that names this story. |
| `apps/web/components/organisms/editor/ConditionRow.tsx` | **Modified.** `touched`/`visible`/`invalidAttrs` (`:133-146`), the organism select (`:169-187`), the range/scalar inputs (`:191-235`), `ErrorText` (`:101-108`, to lift). |
| `apps/web/components/organisms/editor/ConditionsEditor.tsx` | **Modified.** Props (`:56-63`), the fieldset/legend/add-button markup (`:129-147`), `AddConditionButton` (`:35-54`), the focus effect (`:90-127`, untouched). |
| `apps/web/components/organisms/editor/RuleCard.tsx`, `RulesEditor.tsx` | **Modified** (pass-through only). Props (`RuleCard.tsx:216-244`; `RulesEditor.tsx:102-117`), the `<ConditionsEditor>` mount (`RuleCard.tsx:418-422`), the `rules.map` (`RulesEditor.tsx:374-393`). |
| `apps/web/components/organisms/editor/fieldStyles.ts` | **Modified.** Gains `ErrorText` (the third caller lifts it — the header's own threshold, `:4-7`). |
| `apps/web/lib/organisms/organismDraft.ts` (+ test) | **Modified** (Task 2). The draft type (`:20-22`), the factory (`:42-50`), the header's per-story sentence (`:5-18`). |
| `apps/web/lib/organisms/ruleDraft.ts` (+ test) | **Modified** (Task 1). `MAX_RULE_SUMMARY_LENGTH` (`:36`), `RuleDraft` (`:53-57`), `createNewRuleDraft` (`:62-64`, `conditions: []`). |
| `apps/web/lib/organisms/organismName.ts` | `validateOrganismName` (`:43-50`) — the header (`:3-13`) promises this story calls it. Unedited. |
| `apps/web/lib/organisms/conditionDraft.ts` | `ConditionDraftField`/`ConditionDraftError` (`:236-242`), the messages (`:244-255`), `parseConditionDraft` order (`:269-331`), `validateConditionDraft` (`:333-336`). Unedited. |
| `apps/web/components/organisms/editor/DominanceField.tsx:131-141, 164-174, 199-223` | FD3/FD4 (clamp by construction), `commit` on blur/Enter — why FD7 holds. Unedited. |
| `apps/web/components/organisms/editor/ColorPickerField.tsx:46-54, 248-265, 380-390` | The always-mounted status region and the `⚠︎` glyph idiom; why the notice is `status`. Unedited. |
| `apps/web/components/battle/editor/BattleEditorView.tsx:376-400, 458-460` | `<SaveErrorLine>` — the in-flow save-outcome line the notice's placement follows (across the mode split: copied shape, never imported). |
| `apps/web/components/battle/BattlePage.tsx:754-756, 788-791` | Why a save-outcome line is cleared at the start of every attempt (an identical message re-rendered in place would not re-announce). |
| `apps/web/lib/organisms/useOrganismEditorModal.ts` | **Unedited** — no save surface here in this story (FD1); its `import type` rule (`:24-27`) is why nothing in `lib/` may import the modal's values. |
| `apps/web/components/organisms/OrganismLibrary.tsx:200-212, 319-324` | The comment that names where 4.16's repository prop arrives; unedited. |
| `apps/web/e2e/organisms.spec.ts:1-32, 298-310, 793-930, 1424-1444, 1680-1720` | `openEditor`, the Save-disabled assertions, the 4.5 block's alert/aria-invalid/describedby/axe idioms, the 4.11 block's `openRules`/`cardGroup`/`row`. |
| `apps/web/lib/themeTokens.test.ts:102-140, 203-256` | Danger pairs gated on `bg-primary`/`bg-secondary` only (never `bg-hover` text); the `var(--gol-…` source scan. |
| `docs/planning-artifacts/ux-designs/…/organism-editor-design.md:545-565, 747-777` | The save flow (why the toast is 4.16's), the canonical messages, "focus first error". |
| `docs/planning-artifacts/epics.md:1140-1151, 1177-1187, 1264-1275` | This story, 4.16 (where AC3/AC4's visible halves go), 4.23 (the dirty scope this story must not start). |
| `docs/implementation-artifacts/4-5-organism-name-field.md` (FD2, FD4, Task 6 item 3), `4-11-condition-builder.md` (AC4, AC5, FD3, the review's option 1), `4-10-rule-cards-empty-state.md` (FD2, "What NOT to build"), `4-12-rule-reordering.md` (the habits) | The decisions this story inherits. |
| `docs/implementation-artifacts/deferred-work.md:92, 358, 793-799, 1098-1102, 1137-1143, 1160-1167, 1217-1219, 1259-1262, 1356-1359, 1596-1599, 1606-1609` | The entries Task 6 closes or re-points; the Snackbar no-op; the polite/assertive line; the port trap. |
| `.github/workflows/ci.yml:176-190`, `README.md` "Quality gate & deployment" | `main` is public — FD1's load-bearing fact. |
| `docs/implementation-artifacts/lane-gates.yaml` | 4.15/4.24/4.25 gated on Epic 3; this story proposes no gate. |

### Architecture compliance

- **RFC-005 Decision 1 / AR-33** — `saveAttempted`, `focusRequest`, `noticeRequested` are
  ephemeral modal-local state; the draft object is not widened; no dirty flag (Story 4.23).
- **AR-2 / AR-27** — no repository reaches this story; the modal still persists nothing (FD1).
- **Decision I** — no persisted-shape change; `OrganismSchema.name` still admits `''` (5.7/5.8).
- **RFC-004 §2.4** — error targets are rule/condition **ids**, never indices (AC5, Task 4 (17)).
- **AR-39 / AR-45** — `packages/*` untouched; `apps/web` has no coverage gate, every test guards
  a named failure.
- **RFC-003 Decision 3 / Decision J / AR-46** — `styled()` + `var(--gol-*)` only; no new token; no
  `transition` on anything that flips with validity (the axe-mid-fade rule).
- **AR-35 / bundle** — no dependency; everything rides the lazy editor chunk (AC10).
- **NFR-4.1 / NFR-4.2** — Save now does what it looks like it does on both branches, within a
  frame; the notice is the honest transitional feedback (FD1).
- **UX-DR14 / UX-DR17** — inline errors with red border + icon below each field, focus to first
  invalid, errors announced; the toast and the post-save warning are re-homed, not dropped.
- **Spec-id hygiene** — `spec:check` tokenises `FR-1.2`, `FR-2.1`, `FR-2.5`, `NFR-4.1`, `NFR-4.2`,
  `NFR-8.3`, `AR-2`, `AR-27`, `AR-33`, `AR-35`, `AR-39`, `AR-44`, `AR-45`, `AR-46`, `RFC-003`,
  `RFC-004`, `RFC-005`, `Decision I`, `Decision J`, `M5`, `Story 4.3`, `Story 4.4`, `Story 4.5`,
  `Story 4.7`, `Story 4.9`, `Story 4.10`, `Story 4.11`, `Story 4.12`, `Story 4.13`, `Story 4.16`,
  `Story 4.17`, `Story 4.22`, `Story 4.23`; write them exactly so. `UX-DR*`, `FD*`, `AC*` are
  not checked.

### Library / framework notes (installed versions, no research needed)

- **React 19.2** — a discrete event's state update (the textbox `blur` → `commit`) is flushed
  before the next discrete event's handler (`click`) runs — FD7; `useEffect` keyed on an object
  with a `seq` re-runs per request even for the same target; `data-*={undefined}` omits the
  attribute (`data-invalid`); an updater `(r) => ({ seq: (r?.seq ?? 0) + 1, … })` is pure.
- **ARIA 1.2 / axe-core 4.x** — `aria-invalid` allowed on textbox/combobox/… not on `group` or
  `button` (`aria-allowed-attr`); `aria-describedby` allowed on any element; a `describedby` to
  an absent id fails `aria-valid-attr-value` (so list the error id **only while mounted**, the 4.5
  rule); several `role="alert"` regions mounting in one render are each announced.
- **jsdom 30** — `CSS.escape` exists (`<RulesEditor>` uses it under test); `focus()` works and
  `document.activeElement` reflects it; `scrollIntoView` is a no-op (do not assert scroll).
- **@testing-library/user-event 14** — `user.click(button)` dispatches pointerdown → (blur of
  the previously focused element) → pointerup → click, so FD7's order holds in unit tests too.
- **MUI 9.3.1** — `Button` keeps its own 250 ms colour transition; it no longer flips `disabled`
  at runtime here, so no cross-fade edge (the 4.3 deferred note stands for any story that flips
  it); the e2e axe scan after a click still waits 300 ms (the 4.5 idiom). `Dialog` Escape path
  unchanged.
- **Playwright 1.62** — `toBeFocused()`, `toHaveAttribute('aria-invalid', 'true')`,
  `toHaveCount(n)` on `getByRole('alert')`; on WebKit a `<button>` is not focused by a click (assert
  "focus did not move" as "not on the name field" there).
- **fast-check** (installed) — `fc.string()`, `fc.array(…, { maxLength: 4 })`, `fc.nat({ max: 3 })`;
  `fc.assert(fc.property(…))`, default 100 runs.

### Testing standards

- `apps/web` has **no coverage gate** — every test guards a named failure: a Save that still does
  nothing (modal 11), an error hidden behind `touched` after Save (name r, row o/p/q, conditions
  l), focus that does not move or moves to the wrong control (modal 11–13, 17; e2e 1–2), a
  zero-rules draft refused (modal 14, e2e 3), a stale "valid" notice over an invalid draft (modal
  15), a `describedby` to an unmounted id (conditions n), an index-based target broken by a
  reorder (modal 17), `aria-invalid` on a group/button (axe cases), a validator that checks colour
  or dominance (Task 2 j), a check order that disagrees with the DOM (Task 2 h, k).
- `packages/*` **untouched** — their coverage lines exactly as on `main`.
- Never snapshot; never assert computed colours or scroll positions in jsdom; never mock `useId`
  or `crypto.randomUUID`; never run axe mid-transition (the 300 ms wait).
- The 4.3–4.12 tests are retargeted **only** as AC9 lists; if any other test fails, the change is
  wrong, not the test.
- Write every test file Tasks 1–5 name **before** ticking the task — the 4.11 review found two
  ticked tasks whose test files did not exist; the 4.12 review found a Dev Agent Record that
  misstated which tests scroll. Record what each test actually does.

### Previous story intelligence (Story 4.12)

- Review found: handlers closing over per-render callbacks behind `eslint-disable`s (fix: honest
  deps — here `handleSave` depends on `errors`, a per-render array; that is fine because nothing
  memoises on it downstream); layout read inside a state updater (keep every updater pure —
  `setFocusRequest`'s updater touches no DOM); a stale ref stealing focus on a later keystroke
  (here: the focus effect is keyed on the request, never on `draft`, so a keystroke re-runs
  nothing); comments asserting things the diff contradicted.
- The habits: prove every "unchanged" claim by leaving the old test unedited; make the arbitrary
  cover the bounds; a Dev Agent Record carries the exit code, coverage lines and e2e summary,
  never the word "green".
- The dev step hit a usage limit mid-run and was resumed by hand; keep the record updated as you
  go, not at the end.
- WebKit does not focus a `<button>` on click — every "focus did not move" assertion needs the
  WebKit form; the four-browser matrix on the PR is where it is proven.

### Git intelligence

`main` is at `0fa6810` (docs merge #60 after 4.12's #59). The last app-code commits are 4.12's
(`components/organisms/editor/{RuleCard,RulesEditor,OrganismEditorModal}.*`,
`lib/organisms/ruleDraft.*`, `packages/domain/src/*`, `organisms.spec.ts`). **Only Epic 4 is in
progress** (`sprint-status.yaml`): no other lane, no shared surface, no gate. This story's files
are `components/organisms/editor/**`, `lib/organisms/{organismDraft,ruleDraft}.*`,
`e2e/organisms.spec.ts`, `deferred-work.md` — all inside the epic-4 lane.

### Project Structure Notes

- New: nothing — no new component, no new lib file (a validator joins the draft's own file, a
  rule check joins the rule's; the notice is a `styled('p')` in the modal).
- Modified: `components/organisms/editor/{OrganismEditorModal,OrganismNameField,ConditionRow,
  ConditionsEditor,RuleCard,RulesEditor}.tsx` (+ tests), `fieldStyles.ts`;
  `lib/organisms/{organismDraft,ruleDraft}.ts` (+ tests); `e2e/organisms.spec.ts`;
  `docs/implementation-artifacts/deferred-work.md`, `sprint-status.yaml`.
- Naming: `validateOrganismDraft`, `DraftError`, `DraftErrorTarget`, `ruleNeedsCondition`,
  `RULE_NEEDS_CONDITION`, `errorTargetSelector`, `SAVE_UNAVAILABLE_NOTICE`; props `showAllErrors`;
  state `saveAttempted`, `focusRequest`, `noticeRequested`; data attributes `data-organism-name`,
  `data-rule-error`, `data-invalid`, `data-save-notice` (existing: `data-rule-id`,
  `data-condition-id`, `data-condition-value|min|max`, `data-add-condition`,
  `data-rules-empty-state`, `data-condition-error`).
- Untouched on purpose: `DominanceField.tsx`, `ColorPickerField.tsx`, `AgingToggleField.tsx`,
  `OrganismEditorLayout.tsx`, `AddRuleButton.tsx`, `useOrganismEditorModal.ts`,
  `OrganismLibrary.tsx`, `organismName.ts`, `conditionDraft.ts`, `themes.css`,
  `themeTokens.test.ts`, `theme.ts`, every file under `components/battle/**`, `packages/**`,
  `playwright.config.ts`, `scripts/check-bundle-size.mjs`, `docs/project-context.md`.

### What NOT to build

- ❌ No repository call, no `organisms.save`, no `contentHash`, no id minting — Story 4.16.
- ❌ No toast, no `Snackbar`, no toast host on the Library, no `onSave`/`onSaved` prop on the modal
  or the hook — Story 4.16 (FD1). A prop nothing calls is a dead handle.
- ❌ No close-on-save, no `onClose` from the gate — the design doc closes after the write.
- ❌ No "No rules defined. Organism will have no living cells." text anywhere — it rides 4.16.
- ❌ No dirty flag, no unsaved-changes guard — Story 4.23.
- ❌ No colour, dominance, aging or summary validation — valid by construction (FD2).
- ❌ No Zod in the gate — the displayed-error view never parses (project-context).
- ❌ No summary live region, no `aria-live` on the shell, no error count — FD6.
- ❌ No `aria-invalid` on the fieldset, the rule group or any button — FD4.
- ❌ No `<form>`, no `type="submit"`, no Enter-to-save on text fields (Story 2.11's reasoning:
  under `output: 'export'` an implicit submit reloads the page and discards the draft).
- ❌ No `document.querySelector` — every lookup through `shellRef`.
- ❌ No `scrollIntoView` — `focus()` scrolls.
- ❌ No `transition` on the add-condition button's border, on `ErrorText`, or on the notice.
- ❌ No clearing of `saveAttempted` on edits — sticky (FD3).
- ❌ No Save hotkey — none is specified (and FD7 depends on its absence).
- ❌ No change to `<DominanceField>` (no flush — FD7), `<ColorPickerField>`, `<AgingToggleField>`.

### Open flags for the owner (not blockers — the story proceeds on the FD)

- **The epic's AC3 (warning) and AC4 (toast) are proposed to move to Story 4.16** (FD1). They
  describe feedback on a *persisted* save, which does not exist before 4.16, and `main` is a
  public deployment. Proposed AC text for 4.16 (to be added to `epics.md` at the owner's call):
  "**And** on a successful save the editor closes and the Library shows the 'Organism saved
  successfully' toast — an in-flow `role="status"` region on the Library, published once the
  editor's exit transition has finished (`onExited`), never while the dialog is open
  (`useInertBackground` sweeps body children appended under a dialog); **And** when the saved
  organism has zero rules the toast is accompanied by the non-blocking 'No rules defined. Organism
  will have no living cells.' warning." If the owner would rather keep both in 4.13, the
  alternative is a fake-success toast on the public site for the 4.13→4.16 window — this story
  declines it, but the choice is the owner's.
- **The AC8 notice copy** ("Valid organism — saving to the library is not available yet.") is this
  story's wording; any other honest sentence is a one-string change. The alternative — a silent
  valid Save — is what the modal's own comment calls the worse lie.
- **Keeping per-field `role="alert"`** (FD6) means the first error can be read twice on Save. If an
  AT is found to make that intolerable, the fix is the inline line dropping to `role="status"` plus
  one assertive summary — a follow-up, not a re-architecture.

### References

- `docs/planning-artifacts/epics.md:1140-1151` (Story 4.13 ACs), `:1026` (4.3 — "Save inert until
  4.16"), `:1049-1051` (4.5 — "orchestrated fully in 4.13"), `:1126` (4.11 — "enforced via 4.13's
  validation"), `:1185-1187` (4.16 — "the Save action is now live"), `:1272-1275` (4.23), `:239`
  (UX-DR14), `:242` (UX-DR17), `:135-136` (NFR-4.1/4.2), `:1260` (the "Organism deleted" toast is
  4.22's).
- `docs/planning-artifacts/ux-designs/ux-GameOfLife-2026-05-27/organism-editor-design.md:41-49,
  112-115, 156-159, 545-565, 608-611, 723-743, 747-777`.
- `docs/planning-artifacts/prds/prd-GameOfLife-2026-05-26/prd.md:119-121, 165-170, 187-204,
  624-628, 687-692`.
- `docs/planning-artifacts/rfcs/RFC-005-application-state-modes-undo.md:57, 199, 281-299`
  (Decision 7 — two dirty scopes; "Save & Close" is the exit point's name, the button reads
  "Save").
- `docs/planning-artifacts/rfcs/RFC-003-frontend-ui-architecture.md:58, 79-85, 229-236, 250-252`.
- `packages/domain/src/organismSchema.ts:10-48`, `survivalRuleSchema.ts:78-85`
  (`conditions.min(1)` — the schema source of AC6).
- `docs/implementation-artifacts/4-5-organism-name-field.md` (FD1, FD2, FD4, Task 6 item 3);
  `4-6-dominance-control.md` (FD3, FD4, review deferral `:441`); `4-8-…` (the colour note);
  `4-10-rule-cards-empty-state.md` (FD2, FD6, What NOT to build); `4-11-condition-builder.md`
  (AC4, AC5, AC6, FD3, FD6, FD8, the review's option 1); `4-12-rule-reordering.md` (Review
  Findings, the habits).
- `docs/implementation-artifacts/deferred-work.md:92, 358, 793-799, 1098-1102, 1137-1143,
  1160-1167, 1217-1219, 1259-1262, 1356-1359, 1596-1599, 1606-1609`.
- `docs/implementation-artifacts/lane-gates.yaml`.
- `.github/workflows/ci.yml:176-190`; `README.md` "Quality gate & deployment".
- `docs/project-context.md` — Language rules (no escape hatches), Framework rules (three state
  categories; no repository import; `styled()` + tokens), Testing rules (no gate on `apps/web`;
  axe; never snapshot; fast-check; the Playwright viewport band), Code Quality (AR-46;
  `spec:check`; comments explain why), Commit gate.

## Dev Agent Record

### Agent Model Used

claude-sonnet-5 (Claude Code)

### Debug Log References

- `npm run ci:dev > ci.log 2>&1; echo $?` → **exit code 0** (first attempt was exit 1 on
  `format:check` alone — 6 files needed `prettier --write`; re-run was clean).
- Coverage (`test:coverage`, unchanged packages confirm no drift):
  - `@gol/domain`: 100/100/100/100 stmts/branch/funcs/lines, 109 tests, 6 files.
  - `@gol/simulation`: 100/100/100/100, 407 tests, 23 files.
  - `@gol/persistence`: 99.19/96.07/100/100 aggregate, 82 tests, 7 files (≥80% floor).
  - `@gol/test-utils`: 94.44/90.09/100/97.07 aggregate, 89 tests, 6 files (≥80% floor).
  - `apps/web` (no gate): 96.67/92.35/97.41/98.3, **1777 tests, 106 files**.
- Bundle (`npm run bundle:check`, against `apps/web/out`):
  - `/` 333.8 KB / 340 KB budget (6.2 KB headroom) — unchanged from Story 4.12's post-review 333.8.
  - `/battle` 309.3 KB / 310 KB (0.7 KB) — was 309.0; `/battle/new` 309.1 KB / 310 KB (0.9 KB) —
    was 308.9. Both ≤ +0.3 KB, inside the ±0.5 KB tolerance (unrelated route JSON churn).
  - `/organisms` 295.6 KB / 305 KB (9.4 KB) — **byte-identical to Story 4.12's post-review
    figure.** Expected: every new line here rides the lazy editor chunk, never `/organisms`'s
    first load.
  - Editor chunk (`grep -rl "Organism Color" out/_next/static/chunks/*.js` → one file,
    `gzip -c | wc -c`): **10826 B → 11391 B gzip (+565 B / +0.55 KB)** — under the ≈ +1.0–1.5 KB
    estimate. **No budget raised.**
- Bench (`npm run bench` + `bench:check`): frame **10.202 ms** of the 16.667 ms budget (6.464 ms
  headroom, 38.8% of the frame) — unaffected by this story (no engine/render code touched); the
  measured drift from 4.12's 7.560 ms is machine-load noise between runs, not a regression this
  story could cause (no `packages/*` file changed — coverage lines above are identical to `main`).
- e2e (Chromium only, `npm run e2e:chromium`): **209 passed, 1 skipped** (pre-existing,
  unrelated) across `apps/web/e2e/**`, including the new `editor validation & feedback
  (Story 4.13)` block (5 tests) and the two retargeted Story 4.3/4.9 assertions
  (`toBeDisabled()` → `toBeEnabled()`).
- Port-reuse trap check (`deferred-work.md`'s entry): `lsof -i :4173` returned nothing before the
  e2e run — no stale preview server.
- `gh run list --limit 1` — **not run**: this story has not been pushed yet; the check runs after
  the PR opens, per Task 6.

### Completion Notes List

- Implemented Save as the live validation gate over the existing per-field validators, exactly as
  scoped by FD1: no persistence, no close, no toast, no post-save warning — those AC3/AC4 halves
  are proposed to Story 4.16 in a new `deferred-work.md` section (Open flags carried over from the
  story file).
- `validateOrganismDraft` (`lib/organisms/organismDraft.ts`) composes `validateOrganismName` and
  `validateConditionDraft` plus one new `ruleNeedsCondition` check (`lib/organisms/ruleDraft.ts`),
  in document order, returning `DraftError[]` with id-based targets (never indices) so a reorder
  cannot desync the focus target from the erroring control.
- `showAllErrors` threaded as a required boolean prop through `OrganismNameField` → (independently)
  `RulesEditor` → `RuleCard` → `ConditionsEditor` → `ConditionRow`; every pre-existing test gained
  `showAllErrors={false}` and passed unedited, proving the override is inert when off (the Story
  4.7 proof idiom).
- `OrganismEditorModal` gained `saveAttempted` (sticky), `focusRequest` (seq-keyed), and
  `noticeRequested` — all ephemeral local state, no widening of the `OrganismDraft` object
  (RFC-005 Decision 1 / AR-33). `errorTargetSelector` and `SAVE_UNAVAILABLE_NOTICE` are exported
  for the test suite, both explicitly marked transitional (Story 4.16 deletes the notice).
- `ErrorText` lifted from `OrganismNameField.tsx`/`ConditionRow.tsx` into `fieldStyles.ts` at its
  third caller (`ConditionsEditor.tsx`) per the Story 4.7 three-callers threshold; both original
  call sites now wrap the shared base with their own layout rule, byte-identical rendered output.
- Retargeted exactly the tests AC9 lists (`OrganismEditorModal.test.tsx:53-58` disabled→enabled,
  `:97-105` deleted, `:283-285` comment-only, `e2e/organisms.spec.ts:305` and `:1439-1442`
  disabled→enabled) plus one test AC9 does not name but that the behaviour change broke:
  `OrganismLibrary.test.tsx`'s "opens the editor..." case also asserted `toBeDisabled()` on Save
  and needed the same retarget. No other pre-existing assertion was touched.
- `deferred-work.md` updated per Task 6: seven prior entries closed/confirmed/partially-resolved
  (4.5's alert-vs-summary question, 4.6's two dominance entries, 4.7's aging entry, 4.8's colour
  entry, 4.11's two entries), plus a new "Deferred from: Story 4-13" section with the nine items
  Task 6 specifies (the toast/warning proposal for 4.16, the transitional notice, FD6/FD4/FD6
  again/no-hotkey/ErrorText-location/no-mockup-CSS/no-rollup notes).
- `docs/project-context.md` left unedited, as instructed — no new rule met the "unobvious" bar on
  its own.

### File List

- `apps/web/lib/organisms/ruleDraft.ts` (+ `ruleDraft.test.ts`)
- `apps/web/lib/organisms/organismDraft.ts` (+ `organismDraft.test.ts`)
- `apps/web/components/organisms/editor/OrganismNameField.tsx` (+ `.test.tsx`)
- `apps/web/components/organisms/editor/ConditionRow.tsx` (+ `.test.tsx`)
- `apps/web/components/organisms/editor/ConditionsEditor.tsx` (+ `.test.tsx`)
- `apps/web/components/organisms/editor/RuleCard.tsx` (+ `.test.tsx`)
- `apps/web/components/organisms/editor/RulesEditor.tsx` (+ `.test.tsx`)
- `apps/web/components/organisms/editor/fieldStyles.ts`
- `apps/web/components/organisms/editor/OrganismEditorModal.tsx` (+ `.test.tsx`)
- `apps/web/components/organisms/OrganismLibrary.test.tsx` (one assertion retargeted; AC9-adjacent
  fix, not separately scoped by a task)
- `apps/web/e2e/organisms.spec.ts`
- `docs/implementation-artifacts/deferred-work.md`
- `docs/implementation-artifacts/sprint-status.yaml`
- `docs/implementation-artifacts/4-13-editor-validation-feedback.md` (this file)

### Change Log

- 2026-09-21 — Story file created (create-story): ACs decomposed, FD1–FD8 recorded, precedent and
  spec map compiled; the toast and the post-save warning proposed for Story 4.16 (Open flags);
  status → ready-for-dev.
- 2026-09-21 — Implemented (dev-story): Tasks 1–6 complete. Save is now the live validation gate
  (`validateOrganismDraft`, `showAllErrors`, focus-to-first-invalid, the honest transitional
  `SaveNotice`); `ErrorText` lifted to `fieldStyles.ts`; `deferred-work.md` updated per Task 6;
  `npm run ci:dev` green (exit 0), including the new Story 4.13 unit, component and e2e coverage.
  Status → review.

Dev Model: sonnet   # follows settled patterns — 4.5/4.11's touched-plus-override error idiom, the ErrorText/⚠︎ line, data-attribute selectors with CSS.escape, the 2.13 in-flow status line; the one new shape (a document-ordered validateOrganismDraft with id-based targets and an attempt-keyed focus effect) is pinned with exact code, selectors and tests, and 4.16 consumes it without reshaping it
Proposed lane gate: none
