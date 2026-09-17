---
baseline_commit: 92a3d4dbf60b8bd7fee295aba1b1a6fcd703490f
---

# Story 4.10: Rule Cards & Empty State

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a user,
I want my survival rules as manageable cards,
so that I can build up behavior rule by rule.

## Acceptance Criteria

From `epics.md#Story 4.10: Rule Cards & Empty State` (`:1103-1113`), decomposed into what a
reviewer can check independently. AC4's action selector, AC6's draft shape and AC7–AC10 are
repo-derived: the obligations Story 4.4's shipped `<OrganismEditorLayout>` (its deferred
`.rules-header` note names this story), Story 4.8/4.9's `<OrganismEditorModal>` draft pattern, the
`@gol/domain` `SurvivalRuleSchema` (which a freshly added rule **cannot** satisfy — see FD2), the
token layer and the CI gates impose. Rule **conditions** are Story 4.11's; **reordering** is
4.12's; the Save-time **validation** is 4.13's; the **hasher and persistence** are 4.16's. Nothing
here touches a repository (AR-2 / AR-27) or the engine.

1. **The Rules column's heading pair sits in a header row with a persistent "+ Add Rule"
   action.** `<OrganismEditorLayout>` gains a `rulesAction?: ReactNode` slot (the Story 4.4
   deferred note: *"Story 4.10 restructures the Rules column heading into that row and should add
   the slot then"*), rendered to the right of the Survival Rules `<h3>` + description in the
   mockup's `.rules-header` row (`organism-editor.html:495-504`, markup `:991-997`). The modal
   fills it with `<AddRuleButton>` — visible text **"+ Add Rule"**, the mockup's `.btn-add-rule`
   (`:506-525`) in tokens. It renders **unconditionally**, empty state or not (the `<BattleGallery>`
   FD2 precedent: the persistent affordance, not first-run guidance). The three region names, the
   `<h2>` → three `<h3>` heading order, the `aria-labelledby` wiring and every tier's widths are
   unchanged — the 4.4 e2e block runs **unedited**. (UX-DR10, UX-DR5)

2. **With zero rules the column shows the centred empty state, and nothing else below the
   header.** Icon `◯` (aria-hidden, `--gol-text-secondary` at the Gallery empty state's 0.3
   opacity), the text **"No Rules Defined"**, the explanation **"Add rules to define when cells
   are born, survive, or die during simulation."** (`organism-editor-design.md:420-442`, verbatim),
   and a second `<AddRuleButton>` — the empty state's primary action. No `<ol>` is mounted while
   the list is empty (a "list, 0 items" is noise). The title is a `<p>`, not a heading (FD5). A new
   organism opens in this state (`organism-editor-design.md:526-531`: "Rules: Empty state
   message"). (UX-DR12)

3. **"+ Add Rule" — either control — appends one card with the default action and moves focus
   into it.** The new rule is `createNewRuleDraft(crypto.randomUUID())`: action **`born`**
   (`organism-editor-design.md:587`, "Default action: Born"), summary `''`, `conditions: []`, an
   opaque uuid `id` (RFC-004 §2.4 — never semantic, never derived from content; the
   `<BattlePage>` save path's own `crypto.randomUUID()` idiom, bare, no fallback). It lands at the
   **bottom** of the list (`:586`); the empty state unmounts on the first add; focus moves to the
   new card's **Summary** input (`:588`, "Focus moves to Summary input") on every add, from either
   button, pointer or keyboard (FD6). Adding never touches any other card's state.

4. **Each rule renders as a card: header `⋮⋮ · [Born] · Rule N · ✕`, body `Summary` then
   `Action`.** In the AC's order — drag handle, coloured action badge, rule label, delete button
   (UX-DR10; `organism-editor-design.md:321-357`) — **not** the 2026-06-01 mockup revision's
   accordion (`ORGANISM-EDITOR-UPDATES.md:52-84`: name-centre, caret, collapsed-by-default,
   "Delete Rule" in the footer). The AC is the story's authority and the divergence is recorded,
   the Story 4.3 FD1 precedent (FD1). Concretely:
   - The card is `<li>` → `<div role="group" aria-labelledby={labelId} data-rule-card
     data-rule-id={rule.id}>` inside an `<ol role="list" aria-label="Survival rules">` (order is
     priority — FR-2.6 — so an **ordered** list; explicit `role="list"` because `list-style: none`
     drops the semantics in Safari, the `<PopulationStats>`/`<CardGrid>` idiom).
   - **Drag handle**: a real `<button type="button" disabled aria-label="Reorder rule N">` holding
     `⋮⋮` (aria-hidden) — genuinely `disabled` until Story 4.12 wires reordering, never a no-op
     span that looks live (the Save button's NFR-4.1 reasoning, FD4). `data-drag-handle` for 4.12.
   - **Action badge**: `<span data-action={action} data-rule-badge>` with the text `Born` /
     `Survive` / `Die` from `ruleActionLabel`; coloured **by data-attribute selector** —
     `'&[data-action="born"]'` → `var(--gol-rule-born)`, `"survive"` → `var(--gol-rule-survive)`,
     `"die"` → `var(--gol-rule-die)` — three literal rules, **never** a `var(--gol-rule-${action})`
     template (AC7). Border 1px in the action colour, text in the action colour, **transparent
     background** (the mockup's 5% tint is dropped, FD3), `borderRadius: 'var(--gol-radius)'` (the
     mockup's `2px` is the one Clinical Lab radius the token layer says is 0 — recorded).
   - **Rule label**: `<span id={labelId}>Rule N</span>`, N = index + 1, **derived every render,
     never stored** — it renumbers on delete here and on drop in 4.12 (UX-DR11 "renumbering on
     drop" only works if nothing persists the number). The group's accessible name is exactly
     `Rule N`.
   - **Delete**: `<button type="button" aria-label="Delete rule N">` with `✕` (aria-hidden), the
     mockup's `.btn-delete-condition` shape (`:683-695`: transparent, 1px `--gol-border-control`,
     `--gol-text-secondary`; hover → `--gol-danger` border and text; no transition). `data-rule-delete`.
   - **Body — Summary**: `<label for>` "Summary" → `<input type="text">` with placeholder
     **"e.g., Death by overpopulation"** (`:361`), **clamped** to `MAX_RULE_SUMMARY_LENGTH` (100)
     by both the native `maxLength` attribute and `.slice(0, max)` in the change handler (the
     `<BattleNameField>` FD6b idiom — FD2 explains why this field clamps where the name field
     refuses), with an `aria-describedby` counter `N / 100` (the `<OrganismNameField>` `CharCount`,
     no over-limit colour because over-limit is unreachable). Optional: empty is valid, no
     `aria-required`, no error state.
   - **Body — Action**: `<label for>` "Action" → a native `<select>` (the `<OrganismRoster>`
     `AddSelect` decision: zero bundle, free keyboard/AT, no MUI `Select`/Menu stack in the editor
     chunk) with the three options in `RULE_ACTIONS` order — `born` "Born", `survive` "Survive",
     `die` "Die" — mirroring the mockup's `.action-selector` (`:1022-1027`). Changing it updates the
     badge on the same commit. The mockup's per-action `.action-description` paragraph is **not**
     built (FD7). No later story owns an action selector and a badge that cannot change is dead
     UI, so it ships here (FD4 (b)).
   Card chrome: `.rule-card` (`:527-536` — `--gol-bg-secondary`, 1px `--gol-border`, 12px gap;
   hover border `--gol-accent`, **no transition**); `.rule-header` (`:542-548` — flex, 12px gap,
   `15px 18px`, **no** `cursor: pointer`, **no** hover background: the card is not clickable);
   `.rule-body` (`:619-622` — `0 18px 18px`, 1px top border). Every colour is a `--gol-*` token
   (AR-46). (FR-2.5, UX-DR10, UX-DR17)

5. **Delete removes the card immediately — no confirmation — renumbers the rest, and keeps
   focus in the column.** (`organism-editor-design.md:592-593`; readiness-report 2026-07-16 issue
   #3, resolved in the story's favour. → The "no confirmation" half is superseded by Story 4.26,
   which puts a confirmation dialog in front of the delete; the focus rule below is unchanged.) After a delete, focus moves to the **Summary** field of the
   card now occupying the removed index (the next card), or the last card's when the last was
   removed, or the empty state's "+ Add Rule" when no card remains (FD6) — the owner's review
   decision (2026-09-17): a neighbouring Delete button was rejected because a held or
   double-tapped Enter auto-repeats on keydown and would cascade deletions with no confirmation
   and no undo; one Shift+Tab from the Summary reaches that card's Delete. Deleting rule 1 of
   three leaves "Rule 1" and "Rule 2" — the labels are positions.

6. **The rules live in the draft, as `RuleDraft`s — not `SurvivalRule`s — and every mutation is
   a pure helper.** `apps/web/lib/organisms/ruleDraft.ts` (new, no React, no DOM) exports:
   `RuleAction` (`= SurvivalRule['payload']['action']`), `RULE_ACTIONS` (derived from the schema's
   enum `.options`, never a second literal tuple), `ruleActionLabel(action)`, `NEW_RULE_ACTION`
   (`'born'`), `MAX_RULE_SUMMARY_LENGTH` (`100`), the `RuleDraft` interface (`{ id, conditions:
   readonly Condition[], payload: { summary, action } }` — the persisted rule's exact nesting
   **minus `contentHash`**, with `conditions` allowed empty), `createNewRuleDraft(id)`,
   `appendRule(rules, rule)`, `removeRule(rules, id)`, `updateRulePayload(rules, id, patch)`.
   `OrganismDraft` grows `survivalRules: readonly RuleDraft[]`; `createNewOrganismDraft` seeds
   `[]` (a fresh array per call). `<OrganismEditorModal>` holds the rules inside the one draft
   object (never a second `useState`), exposes one updater-style setter (FD8) and mounts
   `<RulesEditor>` in the `rules` slot and `<AddRuleButton>` in `rulesAction`. **No `contentHash`
   is computed anywhere** (the hasher is Story 4.16's — `deferred-work.md:38-41` — and must match
   `defaultWorkspace.ts`'s scheme byte-for-byte; a partial hasher here would fork it silently).
   Save stays Story 4.16's inert `disabled` button. (RFC-005 Decision 1, RFC-004 §2.4, AR-33)

7. **Three rule-action tokens join the Clinical Lab block, and the born green is gated.**
   `themes.css` gains `--gol-rule-born: #00ff41` (the mockup's `--action-born`, `:16`), and two
   aliases `--gol-rule-survive: var(--gol-accent)` and `--gol-rule-die: var(--gol-danger)`
   (`:17-18` — the mockup's survive IS the accent and its die IS the danger token; one name per
   action so Epic 6's override block retunes each independently — Biotech's survive is `#00ffff`,
   not its accent, `biotech-terminal-theme/organism-editor.html:17-19`). `themeTokens.test.ts`
   gains `rule-born` in the **text-pairs** loop (≥ 4.5 on all three backgrounds — measured 14.50 /
   12.75 / 11.65) and a comment that the two aliases are gated through their targets (the hex
   regex cannot see a `var()` value, and must not — `--gol-action-active` is the precedent). Not
   `--gol-success` (MUI's `palette.success` stays a Material default "until it has a real
   consumer", and a rule action is not a success state) and not `--gol-action-born` (the
   `--gol-action-*` namespace is MUI's state layers). The "every `--gol-*` reference resolves" test
   is why the badge uses three literal selectors: its regex is `var\((--gol-[a-z0-9-]+)` and a
   template literal would register `--gol-rule-` as an undefined token. `theme.ts` untouched.
   (AR-46, Decision J, NFR-8.4)

8. **axe passes with cards and with the empty state, in jsdom and in the served app.** vitest-axe
   on `<RulesEditor>` with three rules (one of each action) → `[]`; on the empty state → `[]`; on
   the modal after two adds and one action change → `[]`; `@axe-core/playwright` on `/organisms`
   with the dialog open in the empty state and again with three cards (Born / Survive / Die) →
   `[]` — the scan that measures the badge colours and the delete button's border on the real
   card fill. The Die badge's `--gol-danger` on `--gol-bg-secondary` is the already-gated 4.90:1
   pair; there is no `--gol-bg-hover` surface under any badge (FD3). No `:has()`, no `transition`
   on anything new (NFR-2.1; the axe mid-fade trap every editor control records). (UX-DR17, NFR-8.3)

9. **Every existing guard is retargeted only where this story legitimately changes the DOM.**
   `OrganismEditorLayout.test.tsx`: the omitted-slot test's `childNodes` shape changes for the
   header wrapper (Task 1 states the new assertion) and one test is added for the `rulesAction`
   slot; the other five cases are **unedited**. `OrganismEditorModal.test.tsx`: **no render
   changes** to the 25 existing cases (the count guard still sees exactly two textboxes, one
   slider, one switch and zero comboboxes at open — the empty state has none). `organismDraft.
   test.ts`: the `toEqual` gains `survivalRules: []`. `organisms.spec.ts`: the 4.3, 4.4 and
   4.5–4.9 blocks **unedited** — the 4.3 focus-trap loop sees Back and Close within four Tabs
   before any Rules control; the 4.4 heading-order test enumerates every heading and this story
   adds none (FD5). `ColorPickerField`, `DominanceField`, `AgingToggleField`, `OrganismNameField`
   (+ tests), `useOrganismEditorModal` (+ test), `OrganismLibrary` (+ test): **unedited**. (AR-44)

10. **The bundle gate passes and no route's first load moves.** Everything new reaches the client
    only through `OrganismEditorModal.tsx` (the lazy editor chunk): `RulesEditor`, `RuleCard`,
    `AddRuleButton`, `lib/organisms/ruleDraft.ts`. `@gol/domain`'s `SurvivalRuleSchema` (read for
    `RULE_ACTIONS`) is already in every route's first load through the persistence layer's
    `safeParse`. `/` (340), `/battle` (310), `/battle/new` (310) and `/organisms` (305) stay within
    ±0.5 KB of `main`; the editor chunk grows (expect ≈ +2.0–3.0 KB gzip: three components, the
    empty state, the helpers). **No budget is raised.** `packages/*` untouched; the
    domain/simulation coverage lines read exactly as on `main`. `npm run ci > ci.log 2>&1; echo
    $?` locally; CI on the pushed branch checked with `gh run list --limit 1`.

## Tasks / Subtasks

- [x] **Task 1 — The layout grows a header row and the `rulesAction` slot** (AC: 1, 9)
  - [x] `OrganismEditorLayout.tsx`: two new styled primitives —
        ```ts
        // Mockup: `.rules-header` (`organism-editor.html:495-500`) — the row that puts an action
        // beside a column's heading pair. Used by all three columns so their DOM shape stays
        // identical (SC 1.3.2); only Rules fills the slot today. Carries the 20px the description
        // used to.
        const ColumnHeader = styled('div')({
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: '16px',
          marginBottom: '20px',
        });
        // `.rules-header-info` (`:502-504`). `minWidth: 0` so a long description wraps rather than
        // pushing the action out of the column at the fold tier.
        const ColumnHeaderInfo = styled('div')({ flex: 1, minWidth: 0 });
        ```
        `ColumnDescription`'s margin becomes `0` (the header owns the gap — visually identical for
        Basic Information and Preview). Each column renders
        `<ColumnHeader><ColumnHeaderInfo><ColumnTitle id=…/><ColumnDescription/></ColumnHeaderInfo>{action}</ColumnHeader>{slot}`;
        only the Rules column passes `{rulesAction}`. The `aria-labelledby` targets are unchanged.
        Props doc: `rulesAction?: ReactNode` — "the Rules header's action — Story 4.10's persistent
        '+ Add Rule'. Rendered beside the heading pair, outside the `rules` slot, so the list and
        the empty state below never own the header." Update the `rules` slot doc from "Story 4.10
        (rule cards / empty state) mounts here" to past tense. Header comment: strike the FD list's
        implication that the heading pair is bare; add one line for the header row.
  - [x] `OrganismEditorLayout.test.tsx`: **retarget** `'renders only the heading pair in a column
        whose slot is omitted'` → for every region, `childNodes` has length **1**, that node is a
        `DIV` (the header) whose only child is a `DIV` (the info) whose `childNodes` are exactly
        `H3` then `P` — the same "no placeholder, no coming-soon" guard, one level down. **Add**
        `'renders rulesAction inside the Survival Rules header and nowhere else'`: render with
        `rulesAction={<button data-testid="probe-action" />}` → the probe is inside the Rules
        region, is a child of the region's first child (the header), is a **sibling after** the
        info div, and is absent from the other two regions; with `rulesAction` omitted, the Rules
        header has exactly one child. The other five cases are unedited; axe still `[]`.

- [x] **Task 2 — The draft vocabulary, pure** (AC: 6)
  - [x] `apps/web/lib/organisms/ruleDraft.ts`:
        ```ts
        import { SurvivalRuleSchema, type Condition, type SurvivalRule } from '@gol/domain';

        export type RuleAction = SurvivalRule['payload']['action'];
        /** The schema's own enum, in its own order — the `<select>` and the badge read this. */
        export const RULE_ACTIONS: readonly RuleAction[] =
          SurvivalRuleSchema.shape.payload.shape.action.options;
        /** Born / Survive / Die — the badge text and the option text (UX-DR10). */
        export function ruleActionLabel(action: RuleAction): string
        /** `organism-editor-design.md:587` — a new rule opens as Born. */
        export const NEW_RULE_ACTION: RuleAction = 'born';
        /** UX-DR10's 100 — the EDITOR's cap, tighter than the schema's 120 (FD2). */
        export const MAX_RULE_SUMMARY_LENGTH = 100;
        /** The `<select>`'s string meets the enum here — the one narrowing, never an `as`. */
        export function isRuleAction(value: string): value is RuleAction

        /**
         * A rule under edit: the persisted `SurvivalRule`'s exact nesting minus `contentHash`, with
         * `conditions` allowed empty. `SurvivalRuleSchema` requires >= 1 condition and a non-empty
         * hash — neither exists the moment "+ Add Rule" is pressed (conditions are Story 4.11's,
         * the hash is Story 4.16's), so the draft cannot be the persisted type. Same nesting on
         * purpose: 4.16 parses `{ ...rule, contentHash }`, 4.17 seeds `rules.map(strip hash)`.
         */
        export interface RuleDraft {
          readonly id: string;
          readonly conditions: readonly Condition[];
          readonly payload: { readonly summary: string; readonly action: RuleAction };
        }
        export function createNewRuleDraft(id: string): RuleDraft
        export function appendRule(rules: readonly RuleDraft[], rule: RuleDraft): readonly RuleDraft[]
        export function removeRule(rules: readonly RuleDraft[], id: string): readonly RuleDraft[]
        export function updateRulePayload(
          rules: readonly RuleDraft[], id: string, patch: Partial<RuleDraft['payload']>,
        ): readonly RuleDraft[]
        ```
        `createNewRuleDraft` takes the id — it does **not** call `crypto.randomUUID()` itself, so
        it is pure and the test needs no spy; the caller mints. `removeRule` / `updateRulePayload`
        return **the same array** when `id` matches nothing (no spurious re-render, and the test
        pins it). Header comment: why `lib/organisms/` (the mirror of `organismDraft.ts`), why not
        `@gol/domain` (draft shapes are editor state, not persisted shapes — the schema's own
        comment at `survivalRuleSchema.ts:4-5`: "property-specific tightening … is editor-level UX
        (Epic 4), not schema"), why `MAX_RULE_SUMMARY_LENGTH` lives here and not beside
        `MAX_ORGANISM_NAME_LENGTH` (that one IS the schema's bound; this one is inside it).
  - [x] `ruleDraft.test.ts`: `RULE_ACTIONS` equals `['born', 'survive', 'die']` and every entry
        parses through `SurvivalRuleSchema.shape.payload.shape.action`; `isRuleAction` is true for
        each and false for `''`, `'Born'` and `'dead'`; `ruleActionLabel` gives the three strings; `createNewRuleDraft('x')` → `{ id: 'x', conditions: [], payload: { summary:
        '', action: 'born' } }` and `payload.action === NEW_RULE_ACTION`; a 100-char summary
        **parses** through `SurvivalRuleSchema.shape.payload` (the cap is inside the schema's —
        the property that matters, since the domain package exports no `120`); `appendRule` puts
        the rule last and returns a new array; `removeRule` removes by id, preserves order, returns
        the **same reference** for an unknown id; `updateRulePayload` patches `summary` alone,
        `action` alone, leaves every other rule **by reference**, same-reference for an unknown id.
        Fixtures: `CONWAYS_CLASSIC.survivalRules` stripped of `contentHash` are valid `RuleDraft`s
        — use them for the three-rule cases (test files are exempt from the import boundary).
  - [x] `organismDraft.ts`: `OrganismDraft = Pick<Organism, 'name' | 'dominance' | 'agingEnabled'
        | 'colorToken'> & { survivalRules: readonly RuleDraft[] }`; `createNewOrganismDraft` adds
        `survivalRules: []`. Rewrite the header's "until it is `Omit<Organism, 'id' |
        'schemaVersion'>`" — it never will be, because the rules are `RuleDraft`s; say so and point
        at 4.16's parse. `organismDraft.test.ts`: the `toEqual` gains `survivalRules: []`; add one
        assertion that two calls' `survivalRules` are **distinct arrays** (the seed-diff reasoning
        already in the file, now for the array).

- [x] **Task 3 — `<AddRuleButton>`** (AC: 1, 2)
  - [x] `components/organisms/editor/AddRuleButton.tsx`: a `styled('button')` default export, the
        `<CreateBattleLink>` shape (one control, two mount points). Mockup `.btn-add-rule`
        (`:506-525`): `background: var(--gol-accent)`, `color: var(--gol-on-accent)`, no border,
        `padding: 10px 18px`, `fontSize: 12px`, `fontWeight: 600`, `fontFamily: inherit`,
        `textTransform: uppercase` (DOM text stays "+ Add Rule" — the `<CreateButton>` note),
        `letterSpacing: 0.5px`, `cursor: pointer`, `whiteSpace: nowrap`, `flexShrink: 0`; hover
        `background: var(--gol-accent-hover)` — **no** `translateY`, **no** `transition` (the
        editor's `<BackButton>` rule set: an axe scan mid-fade); `&:focus-visible` `2px solid
        var(--gol-accent)` offset 2px. Callers always pass `type="button"` and a `data-add-rule`
        value (`"header"` | `"empty"`) — the e2e's disambiguator, since both controls share one
        accessible name (FD9).

- [x] **Task 4 — `<RuleCard>`** (AC: 4, 8)
  - [x] `components/organisms/editor/RuleCard.tsx`:
        ```ts
        export interface RuleCardProps {
          rule: RuleDraft;
          /** 0-based position — the label, the names and the ids derive from it, nothing stores it. */
          index: number;
          onChange(id: string, patch: Partial<RuleDraft['payload']>): void;
          onDelete(id: string): void;
        }
        ```
        Structure (ids from `useId()` — three per card: label, summary, counter, action; this is
        the multi-instance case the name field's comment anticipated):
        ```
        <Card as li>                                    listitem — `.rule-card` (:527-536)
          <Group role="group" aria-labelledby={labelId} data-rule-card data-rule-id={rule.id}>
            <CardHeader>                                `.rule-header` (:542-548), no cursor, no hover bg
              <DragHandle type="button" disabled aria-label={`Reorder rule ${n}`} data-drag-handle>
                <span aria-hidden="true">⋮⋮</span>      `.drag-handle` (:555-563) — text-tertiary,
              </DragHandle>                             16px, transparent, no border, `cursor: default`
              <ActionBadge data-action={rule.payload.action} data-rule-badge>
                {ruleActionLabel(rule.payload.action)}  `.action-badge` (:576-603) minus tints (FD3)
              </ActionBadge>
              <RuleLabel id={labelId}>Rule {n}</RuleLabel>   `.rule-name` (:565-573): flex 1, 14px/500
              <DeleteButton type="button" aria-label={`Delete rule ${n}`} data-rule-delete
                onClick={() => onDelete(rule.id)}>
                <span aria-hidden="true">✕</span>
              </DeleteButton>
            </CardHeader>
            <CardBody>                                  `.rule-body` (:619-622)
              <Field>
                <Label htmlFor={summaryId}>Summary</Label>
                <SummaryInput id={summaryId} type="text" value={rule.payload.summary}
                  maxLength={MAX_RULE_SUMMARY_LENGTH}
                  onChange={(e) => onChange(rule.id, { summary: e.target.value.slice(0, MAX_RULE_SUMMARY_LENGTH) })}
                  placeholder="e.g., Death by overpopulation"
                  aria-describedby={counterId} data-rule-summary />
                <CharCount id={counterId}>{rule.payload.summary.length} / {MAX_RULE_SUMMARY_LENGTH}</CharCount>
              </Field>
              <Field>
                <Label htmlFor={actionId}>Action</Label>
                <ActionSelect id={actionId} value={rule.payload.action}
                  onChange={(e) => onChange(rule.id, { action: e.target.value as RuleAction })}
                  data-rule-action>
                  {RULE_ACTIONS.map((a) => <option key={a} value={a}>{ruleActionLabel(a)}</option>)}
                </ActionSelect>
              </Field>
            </CardBody>
          </Group>
        </Card>
        ```
        The select's `onChange` narrows through `isRuleAction(e.target.value)` before calling
        `onChange` — **no `as RuleAction` cast** (project-context: no escape hatches); an unknown
        value (unreachable — the options are `RULE_ACTIONS`) is dropped. `Field` / `Label` are `fieldStyles.ts`'s (a sibling module — the 4.8 comment
        already names "a rule group" as the next caller). `SummaryInput` and `ActionSelect` share
        one local `controlRules` object (bg `--gol-bg-hover`, 1px `--gol-border-control` — SC
        1.4.11, the name field's substitution for the mockup's decorative `--gol-border` — text
        primary, `padding: 10px 12px`, 13px, `fontFamily: inherit`, `width: 100%`, focus-visible
        `2px solid var(--gol-accent)` offset `-2px`, placeholder `--gol-text-secondary` at 0.8; the
        select adds `cursor: pointer` and keeps the UA arrow — the `<AddSelect>` FD3 reasoning). Two
        callers today (the name field's `Input` is the other) — **below** the three-callers lift
        threshold (Story 4.7 FD7); 4.11's condition inputs are the third and lift it into
        `fieldStyles.ts` then. `CharCount` is copied from `OrganismNameField.tsx` minus the
        `data-over-limit` rule (unreachable here) — same threshold note.
        `ActionBadge`: `border: 1px solid`, `padding: 4px 10px`, `fontSize: 10px`, `fontWeight:
        600`, `textTransform: uppercase`, `letterSpacing: 0.5px`, `borderRadius: var(--gol-radius)`,
        `flexShrink: 0`, `background: transparent`, and three sibling keys
        `'&[data-action="born"]': { color: 'var(--gol-rule-born)', borderColor: 'var(--gol-rule-born)' }`
        etc. `DeleteButton`: `.btn-delete-condition` (`:683-695`) — `padding: 6px 10px`, 12px,
        `fontFamily: inherit`, `lineHeight: 1`, `cursor: pointer`, `minWidth: 32px` (a 24px+ target,
        SC 2.5.8); hover border/text `--gol-danger`; focus-visible ring. `DragHandle`:
        `background: transparent`, `border: 0`, `padding: 0 4px`, `color: var(--gol-text-tertiary)`,
        16px, `cursor: default`, `lineHeight: 1`; `'&:disabled'` keeps the same colour (axe
        exempts disabled controls; the point is the attribute, not the paint).
        Header comment: FD1 (AC over the 2026-06-01 accordion), FD3 (tints dropped, measured),
        FD4 (disabled handle; the selector ships here), FD7 (no action description); the
        followers line — 4.11 adds "Conditions (all must match)" after Action, 4.12 enables the
        handle, 4.13 flags a zero-condition card. Cite `(Story 4.10)`.
  - [x] `RuleCard.test.tsx` — a `renderCard(overrides)` helper over a `RULE` fixture (Conway's Born
        rule minus `contentHash`, `index: 0`), `onChange`/`onDelete` as `vi.fn()`:
        (a) **structure and names**: `getByRole('group', { name: 'Rule 1' })`; inside it a disabled
            `button` named `Reorder rule 1`, a `button` named `Delete rule 1`, a `textbox` named
            `Summary` whose value is the fixture summary, a `combobox` named `Action` whose value is
            `born` with exactly three options whose text is `Born`, `Survive`, `Die` **in
            `RULE_ACTIONS` order** (derive the expected text through `ruleActionLabel`, never
            literals); `[data-rule-badge]` reads `Born` and has `data-action="born"`.
        (b) **index drives every name**: `index: 4` → `Rule 5`, `Reorder rule 5`, `Delete rule 5`.
        (c) **typing calls onChange with the id and the summary**: `user.type(textbox, 'x')` →
            `onChange('<id>', { summary: '<fixture>x' })` (controlled — the value does not move
            until the parent re-renders; assert the call, not the DOM).
        (d) **clamps**: an `input` event carrying a 101-character value → `onChange` receives
            exactly 100 characters (`fireEvent.input`, the `<BattleNameField>` test's paste path);
            the counter reads `<len> / 100` for the rendered value.
        (e) **action change calls onChange**: `user.selectOptions(combobox, 'die')` →
            `onChange('<id>', { action: 'die' })`; re-render with `payload.action: 'die'` → the
            badge reads `Die` and `data-action="die"`.
        (f) **delete calls onDelete with the id, once**.
        (g) **the handle is genuinely disabled**: `toBeDisabled()`, and a click on it calls nothing.
        (h) **counter association**: the textbox's `aria-describedby` resolves to the counter.
        (i) axe → `[]` on the render `container` (a lone `<li>` outside a list trips `listitem` —
            render inside a `<ol role="list">` wrapper in the helper, the 4.8 `container` precedent).
        jsdom has no layout: never assert the badge colour, the border, or the glyphs' paint.

- [x] **Task 5 — `<RulesEditor>`: the list, the empty state, the focus rule** (AC: 2, 3, 5, 8) (FD5, FD6, FD8)
  - [x] `components/organisms/editor/RulesEditor.tsx`:
        ```ts
        export interface RulesEditorProps {
          rules: readonly RuleDraft[];
          /**
           * Updater-style, like `setState`: the modal applies it inside ONE functional `setDraft`,
           * so two rule mutations in one batch cannot clobber each other (FD8). The list helpers
           * in `ruleDraft.ts` are what callers pass.
           */
          onRulesChange(update: (rules: readonly RuleDraft[]) => readonly RuleDraft[]): void;
          /**
           * The modal's `addRule` — the SAME callback the header's `<AddRuleButton>` calls, so the
           * id is minted in one place (the modal) for both controls. The empty state's CTA calls
           * this; nothing in here mints an id.
           */
          onAddRule(): void;
        }
        ```
        Renders **either** `<RulesList as ol role="list" aria-label="Survival rules">` of
        `<RuleCard key={rule.id} rule index onChange onDelete />` **or** the empty state:
        ```
        <EmptyState data-rules-empty-state>          `textAlign: center; padding: 60px 20px;
                                                     color: var(--gol-text-secondary)`
          <EmptyIcon aria-hidden="true">◯</EmptyIcon>  48px, `opacity: 0.3`, `marginBottom: 16px`
          <EmptyTitle>No Rules Defined</EmptyTitle>   a `<p>` (FD5): 16px/600, text-primary, `0 0 8px`
          <EmptyDescription>Add rules to define when cells are born, survive, or die during simulation.</EmptyDescription>
                                                     `<p>` 13px, `lineHeight: 1.6`, `maxWidth: 360px`, `0 auto 20px`
          <AddRuleButton type="button" data-add-rule="empty" onClick={onAddRule}>+ Add Rule</AddRuleButton>
        </EmptyState>
        ```
        `onChange` → `onRulesChange((rules) => updateRulePayload(rules, id, patch))`; `onDelete` →
        `onRulesChange((rules) => removeRule(rules, id))`. Both `useCallback` with `[onRulesChange]`.
        **Focus follows the list diff (FD6)** — one `useEffect` keyed on `rules`, with
        `prevIdsRef: useRef<readonly string[] | null>(null)` and `rootRef` on the component's
        root `<div>`:
        - first run (`prev === null`): record ids, do nothing (a seeded list — Story 4.17 — must
          not steal focus on mount);
        - `ids.length === prev.length + 1` and the last id is not in `prev`: focus
          `[data-rule-id="<id>"] [data-rule-summary]` — unconditionally (the design doc's
          intended move);
        - `ids.length === prev.length - 1`: `removedIndex` = the first position where `prev` and
          `ids` diverge; if `document.activeElement` is loose (`null`, `body`, or **outside
          `rootRef`** — the `<BattleEditorView>` `focusIsLoose` idiom, adapted: the deleted button
          is gone, so focus has fallen to `body`), focus `[data-rule-summary]` at
          `Math.min(removedIndex, ids.length - 1)` — the owner's review decision (2026-09-17): a
          neighbouring Delete button was rejected because Enter auto-repeats on keydown and would
          cascade deletions with no confirmation — or `[data-add-rule="empty"]` when the list is
          now empty;
        - anything else (same length — 4.11's condition edits, 4.12's reorder, a summary
          keystroke): nothing.
        Then record `ids`. All lookups are `rootRef.current?.querySelector(...)` — never
        `document` (two editors are not a reachable state, but the root scope is free and makes
        the rule local). Header comment: why a diff and not a `pendingFocus` ref set by the
        handlers — the header "+ Add Rule" lives in the layout's slot, outside this component, and
        a diff needs no coordination with it (FD6); why not `autoFocus` on the new card (a seeded
        list would autofocus its last card on mount; `autoFocus` also fights MUI's focus trap on
        the dialog's first paint).
  - [x] `RulesEditor.test.tsx` — a `Harness` that holds `rules` in `useState`, wires
        `onRulesChange` to `setRules((rules) => update(rules))` and `onAddRule` to
        mint-and-append (`crypto.randomUUID()` + `appendRule(createNewRuleDraft(id))` — the modal's
        Task 6 shape, so the test exercises the real contract; the `ControlledHarness` idiom),
        plus `NO_RULES = []` and a `THREE = [born, survive, die]` fixture built from the mock
        organisms' rules (one of each action, `contentHash` stripped):
        (a) **empty state**: with `NO_RULES` → `[data-rules-empty-state]` present, text "No Rules
            Defined" and the explanation, one `button` named `+ Add Rule` with
            `data-add-rule="empty"`, **no** `list` role, no `group`.
        (b) **add from the empty state**: click → the empty state is gone; `getByRole('list', {
            name: 'Survival rules' })` has one `listitem`; the group is `Rule 1`; its badge reads
            `Born`; its Summary is `''`; **`document.activeElement` is that Summary textbox**.
        (c) **add appends**: with `THREE` → click the harness's add → four items, the fourth is
            `Rule 4`, the first three are unchanged **by reference** in the harness's state; focus
            on `Rule 4`'s Summary.
        (d) **cards render in order, labelled by position**: with `THREE` → groups `Rule 1`,
            `Rule 2`, `Rule 3` in DOM order; badges `Born`, `Survive`, `Die`.
        (e) **delete the middle**: click `Delete rule 2` → two items, groups now `Rule 1` and
            `Rule 2`, the second's badge reads `Die` (the old third), and `document.activeElement`
            is `Rule 2`'s **Summary** textbox (the card now at the removed index — the owner's
            review decision, 2026-09-17, non-destructive over another Delete button).
        (f) **delete the last**: with `THREE`, click `Delete rule 3` → focus is `Rule 2`'s Summary.
        (g) **delete the only rule**: one rule → click its delete → the empty state is back and
            `document.activeElement` is its `+ Add Rule`.
        (h) **a summary keystroke round-trips through the harness and moves no focus**: focus the
            `Rule 1` Summary, type `a` → its value is `…a`; the other cards' summaries unchanged;
            `activeElement` still that textbox (same-length diff → no move).
        (i) **an action change round-trips**: `selectOptions` `Rule 1`'s Action to `survive` →
            badge `Survive`; the other two badges unchanged.
        (j) **mount with a seeded list steals no focus**: render `THREE` → `activeElement` is
            `body`.
        (k) **unknown-id patches are inert**: (through the harness) calling `onRulesChange` with
            `updateRulePayload(rules, 'nope', …)` re-renders nothing observable — optional; the
            helper test already pins the same-reference return. Skip if it needs a contortion.
        (l) axe → `[]` with `THREE`, and `[]` in the empty state (scan the `container`).
        Never assert on `PALETTE`, never snapshot, never mock `useId`; derive every badge string
        through `ruleActionLabel`.

- [x] **Task 6 — The modal holds the rules and fills both slots** (AC: 6, 9)
  - [x] `OrganismEditorModal.tsx`:
        ```ts
        import AddRuleButton from './AddRuleButton';
        import RulesEditor from './RulesEditor';
        import { appendRule, createNewRuleDraft, type RuleDraft } from '@/lib/organisms/ruleDraft';
        …
        // One updater-style setter for the whole list (FD8): `<RulesEditor>` passes the pure list
        // helpers, and applying them inside the functional `setDraft` is what keeps two rule
        // mutations in one batch from clobbering each other — the same reason `setName` and
        // `setDominance` are functional.
        const setSurvivalRules = useCallback(
          (update: (rules: readonly RuleDraft[]) => readonly RuleDraft[]) =>
            setDraft((d) => ({ ...d, survivalRules: update(d.survivalRules) })),
          [],
        );
        // The id is minted HERE, outside the updater — React may run an updater twice in
        // development, and an impure one would mint two ids and keep one at random.
        const addRule = useCallback(() => {
          const id = crypto.randomUUID();
          setSurvivalRules((rules) => appendRule(rules, createNewRuleDraft(id)));
        }, [setSurvivalRules]);
        …
        <OrganismEditorLayout
          basicInfo={…unchanged…}
          rulesAction={
            <AddRuleButton type="button" onClick={addRule} data-add-rule="header">
              + Add Rule
            </AddRuleButton>
          }
          rules={
            <RulesEditor rules={draft.survivalRules} onRulesChange={setSurvivalRules} onAddRule={addRule} />
          }
        />
        ```
        The component doc's list of what the draft holds gains "Story 4.10's `survivalRules`";
        the `library` prop doc is **unchanged**. Save stays `disabled`. Nothing else in the file
        changes.
  - [x] `OrganismEditorModal.test.tsx` — **no render edits** to the 25 existing cases. Add, each
        scoped `within(dialog)` / `within(rulesRegion)`:
        (1) **opens in the empty state with the header action** (Story 4.10): the Survival Rules
            region contains `[data-rules-empty-state]`, exactly **two** buttons named `+ Add Rule`
            (`data-add-rule` `header` and `empty`, header first in DOM order), no `list`; the
            Basic Information and Preview regions contain no `+ Add Rule`.
        (2) **the header action adds through the modal**: click the header button → one `Rule 1`
            group in the Rules region, its Summary focused, Save still `disabled`; the
            Basic Information textbox count is still 2 (the summary is a third textbox in the
            dialog — assert `within(rules)` has one textbox, `within(basic)` two).
        (3) **the draft round-trips**: add two, type into `Rule 2`'s Summary, select `die` on
            `Rule 1` → `Rule 1`'s badge reads `Die`, `Rule 2`'s Summary holds the text, `Rule 2`'s
            badge still `Born`; delete `Rule 1` → the survivor is labelled `Rule 1`, keeps the typed
            summary and the `Born` badge.
        (4) **axe after two adds and one action change** → `[]` (AC8's modal scan).

- [x] **Task 7 — Tokens and the contrast gate** (AC: 7)
  - [x] `apps/web/app/themes.css`, in the bare `:root` block after the `--gol-grid-line` entry:
        ```css
        /* Rule-action colours (Story 4.10). Mockup: --action-born / --action-survive / --action-die
           (clinical-lab-theme/organism-editor.html:16-18). Survive IS the accent and Die IS the
           danger token in this theme, so those two are aliases — one name per action anyway,
           because Epic 6's Biotech block retunes them independently (its survive is #00ffff, not
           its #00ff41 accent). Born is a new hue: gated as small TEXT (the 10px badge) against all
           three backgrounds in themeTokens.test.ts. Not --gol-success — MUI's palette.success stays
           a Material default until something IS a success state — and not --gol-action-*, which is
           MUI's state-layer namespace above. */
        --gol-rule-born: #00ff41;
        --gol-rule-survive: var(--gol-accent);
        --gol-rule-die: var(--gol-danger);
        ```
  - [x] `apps/web/lib/themeTokens.test.ts`: in the text-pairs block, `rule-born` joins
        `textTokens` (three new cases; measured 14.50 / 12.75 / 11.65 — well above 4.5) with a
        comment that `rule-survive` / `rule-die` are `var()` aliases the hex regex cannot parse and
        are gated through `accent` and `danger` already (the `--gol-action-active` precedent for an
        alias token). Do **not** touch the token-count floor (16) or add a channel token.

- [x] **Task 8 — e2e against the served static export** (AC: 1, 2, 3, 4, 5, 8)
  - [x] `apps/web/e2e/organisms.spec.ts`: append `test.describe('rule cards & empty state (Story
        4.10)')` after the 4.9 block, reusing the module-scope `openEditor`. Locators:
        `rules = dialog.getByRole('region', { name: 'Survival Rules' })`; the header action
        `rules.locator('[data-add-rule="header"]')` and the empty CTA `rules.locator('[data-add-rule=
        "empty"]')` — **never** `rules.getByRole('button', { name: '+ Add Rule' })` alone, which
        matches two in the empty state and fails strict mode (FD9); a card by
        `rules.getByRole('group', { name: 'Rule 1' })`; its controls by role **within** the group.
        Tests:
        1. **Opens in the empty state, zero console errors**: `[data-rules-empty-state]` visible
           with "No Rules Defined"; both add controls visible; no `list`; the header row puts the
           header action's box **to the right of and top-aligned with** the Survival Rules `<h3>`
           (`boundingBox` — x greater, |y − h3.y| ≤ 4).
        2. **The empty CTA adds and focuses the Summary**: click → empty state hidden; `Rule 1`
           group visible; `rules.getByRole('list', { name: 'Survival rules' })` has one item;
           `toBeFocused()` on `Rule 1`'s Summary textbox; the badge text is `Born`; the Action
           combobox value is `born`.
        3. **The header action appends, and the cards renumber on delete**: the header action
           clicked three times → `Rule 1..3`, and after each click the **newest** card's Summary is
           focused (AC3 — from the header control too); set `Rule 2`'s Action to `Survive` and
           `Rule 3`'s to `Die` (`selectOption`); badges read Born / Survive / Die; click `Delete
           rule 1` → two groups `Rule 1` (badge Survive) and `Rule 2` (badge Die); `Rule 1`'s
           **Summary** is focused (the owner's review decision, 2026-09-17 — non-destructive over
           another Delete button).
        4. **Summary clamps at 100 with the counter agreeing**: `fill` 120 characters into a
           Summary → value length **100**, counter reads `100 / 100`.
        5. **Keyboard**: the tab order inside a card is delete → Summary → Action (the handle is
           `disabled`, so it is skipped). With two cards, from `Delete rule 1` (`.focus()`): `Tab`
           → `Rule 1`'s Summary, `Tab` → `Rule 1`'s Action, `Tab` → `Delete rule 2`; WebKit via
           `Alt+Tab` (the 4.3 block's note).
           `Enter` on the focused `Delete rule 2` removes it and `Rule 1`'s **Summary** is focused
           (the last card's — FD6's "last was removed" branch, landing on Summary per the owner's
           review decision).
        6. **The handle is disabled**: `Reorder rule 1` `toBeDisabled()`.
        7. **axe in the empty state** and **axe with three cards** (Born / Survive / Die) → `[]`.
        Literals (`'Born'`, `'Survive'`, `'Die'`, the empty-state strings) each carry the 4.7/4.8
        literal-with-comment rule (this spec imports only `@gol/*`).
  - [x] ⚠️ Run e2e against **this tree's** build: `deferred-work.md:1294-1297` records that
        `playwright.config.ts` reuses whichever worktree's `serve` holds port 4173. `lsof -i :4173`
        first; state the result in the Dev Agent Record.

- [x] **Task 9 — Bundle measurement, docs, verification** (AC: 9, 10)
  - [x] Measure before (on `main`, `92a3d4d`, all four routes + the editor chunk — grep
        `.next/static/chunks/*.js` for `Organism Color`) and after Task 8; record both in the Dev
        Agent Record. Do **not** edit `budgetGzipKb`.
  - [x] `deferred-work.md`:
        - `:954-957` (the `.rules-header` row, 4-4 section): strike as `✅ Resolved in Story 4.10`
          (prose kept — the `rulesAction` slot).
        - `:725-729` (the card's rules sentence, 4-2 section): **re-point** — this story defines the
          action vocabulary (`ruleActionLabel`) but the sentence needs the **condition**
          vocabulary, which is Story 4.11's; "Pick this up in Story 4.11" with one line saying so.
        - `:746-750` (the card's stat cells as `<dl>`): re-point the same way (4.11 / 4.20).
        - `:38-41` (the hasher): append one line — Story 4.10 mints rule **ids** only
          (`crypto.randomUUID()`, the persisted format's shape) and computes no hash; the entry
          stays open for 4.16.
        - Add `## Deferred from: Story 4-10-rule-cards-empty-state (2026-09-17)` with: (1) **the
          2026-06-01 accordion revision is not followed** (FD1) — cards are always expanded, no
          caret, no collapse, delete in the header; the same UX reconciliation touch 4.3 asked for
          should settle which card the mockup shows; (2) **the drag handle ships `disabled`** (FD4)
          until Story 4.12 — a visible affordance with no behaviour, deliberately honest rather
          than absent because the AC lists it; (3) **the mockup's per-action description copy is
          not built** (FD7) — "Successful birth will depend on organism dominance rules" and "cells
          that are alive and belong to the same organism" are engine claims (Decision C, M10) that
          need verifying against `packages/simulation` before shipping as help text; Story 4.11
          (the condition builder, where cell-state semantics get explained) is the home; (4) **the
          summary cap is silent to AT** — clamped like the battle name but without Story 2.13's
          at-cap polite notice; the field is optional and the counter is `aria-describedby`-only;
          6.11 may add the notice if the battle-name one proves its worth; (5) **UX-DR10's 100 vs
          RFC-004 §2.4's 120** (FD2) — the editor caps at 100, the schema still accepts 120 for
          records that arrive by import/migration; the next RFC touch should either lower the
          schema (a persisted-shape change, 5.7's) or raise UX-DR10; (6) **two "+ Add Rule"
          controls share one accessible name in the empty state** (FD9) — the `<BattleGallery>`
          precedent had two labels from the specs, this one has one; a screen-reader user hears the
          same button twice; if that is unwanted the empty-state CTA can take "Add your first rule"
          (a copy decision); (7) **the badge's `2px` radius and the 5% tints** are the mockup
          values dropped for `--gol-radius` (0) and no background (FD3 — `--gol-danger` on a 5%
          danger tint measures 4.72:1, one axe rounding from the floor, and the `rgba` literal is
          AR-46 territory anyway); (8) **the empty-state title is a `<p>`** (FD5), not the
          Gallery's `<h2>` — a conditional `<h4>` under the column's `<h3>` would appear and vanish
          with the list; (9) **4.11 may widen `RuleDraft.conditions`** to a `ConditionDraft[]` for
          half-typed rows — the type is `readonly Condition[]` today because nothing here edits
          them; (10) **4.17 seeds `survivalRules` by stripping `contentHash`** from the record's
          rules — and must not re-mint ids (identity is stable across edits, RFC-004 §2.4).
  - [x] `docs/project-context.md` — **no new rule**. Candidate only if a second story trips on
        it: "`themeTokens.test.ts` regexes `var(--gol-…)` out of source — a token name built from
        a template literal registers as an undefined token; use one literal selector per value".
  - [x] `npm run ci > ci.log 2>&1; echo $?` — paste the exit code, the bundle lines, the domain
        coverage line (unchanged) and the e2e summary into the Dev Agent Record. ⚠️
        `deferred-work.md:1017-1018`: the LOCAL WebKit/tablet projects fail a pre-existing Story
        3.12 e2e (`battleRoute.spec.ts`, plain `Tab` → `<body>` on macOS WebKit); if that is what
        fails, say so with the test name and confirm the remote run instead — never "fix" it here.
        Push to `story/4-10-rule-cards-empty-state`; check `gh run list --limit 1` after the PR
        opens.

### Review Findings

Reviewed on **Opus** against a **Sonnet** implementation (2026-09-17), via three parallel adversarial
layers (Blind Hunter — diff only; Edge Case Hunter — diff + repo; Acceptance Auditor — diff + story +
project-context). Local gates run by the reviewer: typecheck → lint → format:check → spec:check →
boundary:check → test:coverage, exit 0 (97 web test files). No GitHub Actions run existed for the
branch at review time — `ci.yml` triggers on `main` pushes and `pull_request` only — so the remote
gate is the PR's run, checked after this review.

- [x] [Review][Decision] Delete lands focus on another destructive control — after a delete, focus
      moves to the neighbouring card's Delete button (AC5 / FD6, `organism-editor-design.md:592-593`),
      whose accessible name is now the same `Delete rule N` but refers to a different rule. Enter on a
      `<button>` activates on keydown and auto-repeats, so a held or double-tapped Enter cascades
      deletions with no confirmation and no undo; Space (keyup) does not repeat. The behaviour is
      exactly what the AC specifies, so this is the owner's call, not a patch. Options: (1) keep as
      specified — serial keyboard deletion is a feature, the cascade is accepted; (2) land on the
      neighbouring card's **Summary** instead (non-destructive; one Shift+Tab reaches its Delete) —
      changes AC5, RulesEditor tests (e)/(f) and e2e tests 3/5; (3) keep the Delete target but ignore
      `event.repeat` on the delete button's keydown (stops the hold, not the double-tap); (4) land on
      the header "+ Add Rule" (outside the list). [`apps/web/components/organisms/editor/RulesEditor.tsx`]
      **Owner decision (Sidiar, 2026-09-17): option 2.** After a delete, focus lands on the
      neighbouring card's **Summary** field (same neighbour-selection rule as before: the card that
      took the removed card's index, else the new last card; header "+ Add Rule" when the list is
      empty [sic — the empty state's "+ Add Rule", as AC5, FD6 and test (g) pin; the two controls
      share one name and one callback, so the behaviour is the same]). Update AC5 and FD6 in this file to say Summary, adjust RulesEditor tests (e)/(f) and
      e2e tests 3/5 accordingly, and note that one Shift+Tab from the Summary reaches that card's
      Delete.
      **Resolved (dev-story, 2026-09-17):** `RulesEditor.tsx`'s delete-focus branch now targets
      `[data-rule-summary]` instead of `[data-rule-delete]`; AC5, FD6, the Task 5 subtask text and
      Task 8's test-3/5 descriptions updated to match; `RulesEditor.test.tsx` (e)/(f) and
      `organisms.spec.ts` e2e tests 3 and 5 reassert focus on the neighbour's Summary.
- [x] [Review][Patch] Rule ids are interpolated unescaped into attribute selectors in the focus
      effect — `RuleDraft.id` is `string` (`SurvivalRuleSchema` is `z.string().min(1)`, not a uuid),
      and Story 4.17 seeds ids from persisted records; an id holding `"` or `\` makes `querySelector`
      throw inside `useEffect` and unmounts the editor. Use `CSS.escape`.
      [`apps/web/components/organisms/editor/RulesEditor.tsx:107-110,126-129`]
- [x] [Review][Patch] The non-loose branch of the delete focus rule is untested — every delete test
      clicks via `user.click`, which focuses the button first, so focus is always loose after removal;
      nothing proves focus placed in another card is left alone.
      [`apps/web/components/organisms/editor/RulesEditor.test.tsx`]
- [x] [Review][Patch] The "loose focus" comment does not explain its own third clause — `!root.contains(active)`
      is load-bearing (MUI's `FocusTrap` polls every 50 ms and re-focuses the dialog root when
      `activeElement` is `<body>`, which can win the race against this effect; and a Safari mouse click
      does not focus a button, so focus is still wherever it was), but the comment says "never steal
      focus the user placed somewhere real", which that clause contradicts.
      [`apps/web/components/organisms/editor/RulesEditor.tsx:116-121`]
- [x] [Review][Patch] Dead `removedIndex === -1` fallback — with `ids.length === prev.length - 1`,
      `findIndex` reaches `prev`'s last index where `ids[i]` is `undefined`, so `-1` is unreachable.
      [`apps/web/components/organisms/editor/RulesEditor.tsx:112-113`]
- [x] [Review][Patch] Test (c)'s title claims a by-reference check the body never makes ("keeps
      earlier rules by reference") — the harness exposes no state, and only the item count and focus
      are asserted. [`apps/web/components/organisms/editor/RulesEditor.test.tsx:89-99`]
- [x] [Review][Patch] Test helpers reach for escape hatches the project forbids — `as unknown as
      RuleDraft` plus a non-null `!` in `RulesEditor.test.tsx`, `RULE as RuleDraft` in
      `RuleCard.test.tsx`; `ruleDraft.test.ts`'s `toDraft` shows the typed shape that needs neither.
      [`apps/web/components/organisms/editor/RulesEditor.test.tsx:20-30`, `RuleCard.test.tsx:10-18`]
- [x] [Review][Patch] The modal's `setSurvivalRules` defeats the helpers' same-reference contract —
      `removeRule`/`updateRulePayload` return the same array for an unknown id "so no spurious
      re-render", but the setter spreads a new draft object regardless.
      [`apps/web/components/organisms/editor/OrganismEditorModal.tsx:221-225`]
- [x] [Review][Patch] `--gol-rule-survive` / `--gol-rule-die` are `var()` aliases that no gate
      resolves — the "every `--gol-*` reference resolves" scan reads `.ts/.tsx` only, never
      `themes.css`'s own `var()` references, so renaming `--gol-accent` or `--gol-danger` would leave
      both badges uncoloured with CI green (`--gol-action-active` and `--gol-grid-line` have the same
      gap). [`apps/web/lib/themeTokens.test.ts:203-240`]
- [x] [Review][Patch] Dev Agent Record claims not backed by the record — "exit code and full gate
      output recorded below" is followed by no exit code, no coverage line and no e2e summary (Task 9);
      AC10's "CI on the pushed branch checked with `gh run list`" is ticked although no run existed
      (the workflow triggers on `main` and `pull_request` only); the layout test additions are
      counted as one (there are two). [`docs/implementation-artifacts/4-10-rule-cards-empty-state.md`]
- [x] [Review][Patch] `CardBody` deviates from the pinned `.rule-body` (`0 18px 18px`) with
      `paddingTop: 18px` and no recorded why — the mockup's zero top padding leans on `.field-label`'s
      20px top margin, which `fieldStyles.Label` deliberately dropped; the Task 4 followers line
      (4.11 Conditions after Action, 4.13's zero-condition flag) is also missing from the header.
      [`apps/web/components/organisms/editor/RuleCard.tsx:147-152`]
- [x] [Review][Patch] Badge assertions weakened to `<select>` value assertions in RulesEditor test
      (i) and modal test (3), and neither jsdom empty-state test pins `[data-rules-empty-state]` —
      the attribute the e2e relies on. [`apps/web/components/organisms/editor/RulesEditor.test.tsx`,
      `OrganismEditorModal.test.tsx`]
- [x] [Review][Patch] e2e keyboard test title says "delete -> Summary -> Action inside a card" but
      the body starts at card 1's Summary — Delete → Summary is never verified.
      [`apps/web/e2e/organisms.spec.ts:1327-1346`]
- [x] [Review][Patch] Orphaned three-word line left by a comment re-wrap.
      [`apps/web/components/organisms/editor/OrganismEditorModal.tsx:158-160`]
- [x] [Review][Defer] Story-level citation drift: AC4 / Task 4 cite `.btn-delete-condition` at
      `organism-editor.html:683-695` as `--gol-text-secondary`, `padding: 6px 10px`, 1px
      `--gol-border-control`; the mockup's rule sits at `:672-680` with `--text-tertiary`, `padding:
      8px`, `border: var(--border)`. The code follows the story text.
      [`docs/implementation-artifacts/4-10-rule-cards-empty-state.md:AC4`] — deferred, pre-existing
      (create-story authoring; a spec touch, not a code change)

Dismissed as noise (17): the WebKit mouse-click focus assertion in e2e test 3 (evidence is CI's,
not speculation — checked on the PR run); the "handle click calls nothing" test, the unused
`data-rule-card`/`data-drag-handle`/`data-rule-action` hooks, the second layout test, `type="button"`
at the call sites, the Save-disabled assertion and the bare `crypto.randomUUID()` (each pinned by
the story); `React.memo` on `<RuleCard>` (reference stability serves Story 4.23's dirty diff, the
editor is not a hot path); `--gol-rule-die` contrast (gated in the danger-pairs block); the `<li>`
hover border (mockup); `Partial` with an explicit `undefined`, surrogate-pair and IME clamping
(UTF-16 units match the schema's `.max` and native `maxLength`, the name field's idiom); an
out-of-enum action, duplicate ids and reorder-plus-delete or two adds in one batch (unreachable
until 4.12/4.17 seed or reorder, and same-length diffs are inert by design).

**Second pass** — reviewed on **Opus** (2026-09-17) against the Sonnet resume commit `132501a`
(decision 2: post-delete focus → the neighbour's Summary), same three layers. Remote gate: PR #51's
run `35225718572` on `132501a` — quality + e2e **green**. Decision 2 landed completely and
consistently (effect, header comment, tests (e)/(f), e2e 3/5, AC5/FD6/Task 5/Task 8, Change Log);
no first-pass patch regressed. What remains:

- [x] [Review][Decision] A pointer double-click on ✕ still cascades deletions — decision 2 closed
      the keyboard cascade only. Every card has the same geometry (one-line Summary, fixed header),
      so when card N is removed the card below slides synchronously into the same slot (a discrete
      event commits before the next click is dispatched), and the second click of a double-click —
      or any rapid re-click — is hit-tested against the *new* ✕ at the same coordinates and deletes
      the neighbour too, with no confirmation and no undo (AC5). The last card is the only one
      where nothing lands under the cursor. Options: (1) accept — two clicks are two deliberate
      actions, and the removal is recoverable until Save via Cancel/Close
      (`organism-editor-design.md:593`); (2) ignore a click whose `event.detail > 1` on the Delete
      button (stops the double-click, costs a deliberate rapid second delete at the same spot);
      (3) defer to the story that gives the editor undo/confirmation.
      [`apps/web/components/organisms/editor/RuleCard.tsx:216-221`]
      **Owner decision (Sidiar, 2026-09-17): option 3 — defer.** A later story adds a rule-delete
      confirmation dialog to the Organism Editor (the Story 1.13 `DeleteBattleDialog` pattern in
      UX-DR15's editor vocabulary); no code changes here.
      **Resolved (dev-story, 2026-09-17): deferred to deferred-work.md — picked up by Story 4.26
      (Rule-Delete Confirmation Dialog), added to `epics.md` and `sprint-status.yaml` in `0575e72`.**
- [x] [Review][Patch] The decision's rationale is untested — nothing proves a second Enter after a
      keyboard delete removes nothing. [`apps/web/components/organisms/editor/RulesEditor.test.tsx`]
- [x] [Review][Patch] Review provenance in code comments — `Owner decision (review, 2026-09-17)`
      is the "as requested" form project-context bans; `RulesEditor.tsx:138` says "as before" (a
      lineage only git shows); "one Shift+Tab reaches that card's Delete" is unconditional, but
      Safari's default keyboard settings skip `<button>`s (Option+Shift+Tab — the reason the same
      spec presses `Alt+Tab`); `organisms.spec.ts:1602` carries no why at all. Keep the why, cite
      AC5, drop the provenance. [`apps/web/components/organisms/editor/RulesEditor.tsx:15-17,135-139`,
      `RulesEditor.test.tsx:154-156`, `apps/web/e2e/organisms.spec.ts:1602,1639-1640`]
- [x] [Review][Patch] First-pass "escape hatches" patch not fully applied — two now-redundant
      `RULE as RuleDraft` casts and a non-null `describedBy!` survive.
      [`apps/web/components/organisms/editor/RuleCard.test.tsx:83,98,138`]
- [x] [Review][Patch] `renderCard` returns its own mocks even when `overrides` supplies `onChange`
      / `onDelete` — a future override would assert against a mock that was never wired. Narrow the
      overrides type. [`apps/web/components/organisms/editor/RuleCard.test.tsx:16-31`]
- [x] [Review][Patch] First-pass "orphaned line" patch only moved it — a five-word line remains.
      [`apps/web/components/organisms/editor/OrganismEditorModal.tsx:160-162`]
- [x] [Review][Patch] The recorded owner decision says "header `+ Add Rule` when the list is
      empty"; code, AC5 and test (g) target the empty state's CTA (same name and callback, so the
      behaviour is identical — the record is wrong, not the code).
      [`docs/implementation-artifacts/4-10-rule-cards-empty-state.md:682`]
- [x] [Review][Patch] Task 8 test-5 text still starts "from `Rule 1`'s Summary"; the e2e has
      started on `Delete rule 1` since the first-pass patch, and `132501a` edited the end of that
      paragraph without the start. [`docs/implementation-artifacts/4-10-rule-cards-empty-state.md:593-595`]

Dismissed as noise (7): implicit form submission on the Summary's Enter (no `<form>` in the editor,
`OrganismNameField.tsx:112`); the empty-list branch landing on the empty CTA, an Enter-activated
button (AC5's own target, and adding is non-destructive); the `organism-editor-design.md:592-593`
citation (the doc names no focus target, so nothing there disagrees); the focus ring/caret a
pointer delete now shows and the soft keyboard a tap-delete raises on touch (inherent to the
Summary target the owner chose — the add move already focuses an input by design, `:588`);
`crypto.randomUUID()` in an insecure context (pinned bare by AC3, `<BattlePage>` precedent);
`data-rule-delete` now having no code consumer (AC4's locator vocabulary, the first pass's
`data-rule-card` reasoning); the PR body being stale (the hand-off step, not the diff).

**Third pass** — reviewed on **Opus** (2026-09-17) against the two docs-only commits `1041162`
(decision 3 recorded: defer) and `0575e72` (Story 4.26 added), same three layers. Remote gate:
PR #51's run `35231768952` on the patch commit `4dcb758` — quality + e2e **green** (`35230764687`
on `0575e72` went quality-green, e2e cancelled by the next push under workflow concurrency; the
code tree is identical). The decision item is ticked with the owner's recorded
choice, the `deferred-work.md` entry sits under the right section and names Story 4.26, Story 4.26
is well-formed against 1.13/4.24/4.25 and consistent with AC5 as amended by decision 2, the
sprint-status row is in place, and no first- or second-pass patch regressed. What remains is
bookkeeping:

- [x] [Review][Patch] Story 4.26 reverses a reconciled no-confirmation rule that three documents
      still assert with no forward pointer — `epics.md` Story 4.10 AC3 ("removes it immediately"),
      this file's AC5 ("no confirmation", citing readiness-report issue #3) and
      `organism-editor-design.md:593` ("no confirmation dialog (aligned with epics Story 4.10)").
      The decision is the owner's; the gap is that the next reader finds two authoritative docs
      contradicting each other. Add a `→ Story 4.26` pointer at the three sites and say
      "supersedes" in 4.26's own AC. [`docs/planning-artifacts/epics.md:1113,1312`,
      `docs/implementation-artifacts/4-10-rule-cards-empty-state.md:104-106`,
      `docs/planning-artifacts/ux-designs/ux-GameOfLife-2026-05-27/organism-editor-design.md:593`]
- [x] [Review][Patch] The story file is one commit stale against `deferred-work.md` — the owner
      decision, its resolution note, the Completion Note and the Change Log all say "a later story"
      although `0575e72` created Story 4.26 in the same push; the File List omits
      `docs/planning-artifacts/epics.md`; and the owner-decision line says "mirroring UX-DR15's
      organism-level delete confirmation" where 4.26 pins the Story 1.13 `DeleteBattleDialog`
      pattern. [`docs/implementation-artifacts/4-10-rule-cards-empty-state.md:781-784,1202-1208,1233,1257-1261`]
- [x] [Review][Patch] Deferred entry slips: "`<RuleCard>`'s decision 2" — `132501a` changed
      `RulesEditor.tsx`'s delete-focus effect, not `RuleCard`; "hit-" / "tests" split across a
      soft line break renders as "hit- tests"; "sprint board" for `sprint-status.yaml`.
      [`docs/implementation-artifacts/deferred-work.md:1525-1533`]
- [x] [Review][Patch] 4.26's closing argument is asserted, not required — "no second delete can be
      reached at the same coordinates" holds, but the double-click's second click still lands on
      whatever the opening dialog has put under the pointer (MUI's backdrop during the Fade → an
      instant dismiss; the paper → nothing), and no AC asks for the regression test that proves a
      pointer double-click removes at most one rule. Record both as pick-up notes for 4.26's
      create-story in the deferred entry; the owner-approved AC text is left as is.
      [`docs/implementation-artifacts/deferred-work.md:1531-1535`]

Dismissed as noise (14): adding a story via a dev-story resume without a correct-course record
(the owner approved the story and `epics.md` carries no per-epic story count to drift); option 3
"undo/confirmation" narrowed to confirmation (the owner's recorded choice); options 1/2 not
recorded as rejected (the owner's call, recorded as such); the deferred decision ticked `[x]`
(decision 1 uses the same form); the "(AC5)" citation (AC5 is the delete AC); AC2's two When/Then
pairs on one line and "Rule N"'s base (Story 1.13's form; the labels are positions per AC5);
"rewritten around it" (AC4's intent is plain); the ledger placement (verified, `:1511`); adding
"rule-delete confirmation" to the UX-DR15 line (DR15 summarises the UX spec, which the pointer at
`:593` now covers); nested-Escape semantics with 4.23, capturing the rule by id at open time,
whitespace-only summaries, focus fallback when the opener has unmounted (4.26's create-story
forced decisions, not this delta); a lane gate for 4.26 on 4.23 (intra-epic order, not a
cross-lane dependency).

## Dev Notes

### Forced decisions (made here so the dev agent does not have to)

- **FD1 — The card follows the AC / design doc (`⋮⋮ [Born] Rule N ✕`, always open), not the
  2026-06-01 accordion revision.** `ORGANISM-EDITOR-UPDATES.md:52-84` and the shipped mockup
  (`organism-editor.html:1006-1060`) collapse cards by default, put the rule name centre, a caret
  right, and "Delete Rule" in the body footer. UX-DR10 and the epics AC say drag handle, badge,
  label, delete — and an accordion is a second interaction model (expand/collapse state per card,
  one-open-at-a-time) that no AC asks for and 4.11/4.12 would have to thread through. Story 4.3
  faced the same fork for the header and took the AC; the same reasoning and the same recording
  (`deferred-work.md`) apply. Visual values (`.rule-card`, `.rule-header`, `.action-badge`,
  `.select-input`, `.btn-delete-condition`) still come from the mockup's CSS — the *structure* is
  the AC's, the *paint* is the mockup's, exactly the split 1.12 and 4.8 used.

- **FD2 — Rules are `RuleDraft`s; the summary clamps at 100 and never errors.** `SurvivalRuleSchema`
  requires `conditions.min(1)` and a non-empty `contentHash`; "+ Add Rule" produces neither, so the
  draft cannot hold the persisted type — `RuleDraft` is that type minus the hash with an emptiable
  `conditions` array, same nesting so 4.16's parse and 4.17's seed are one spread each. The
  summary: UX-DR10 says ≤ 100, RFC-004 §2.4 / the schema say `.max(120)`. Story 4.13's Save gate
  enumerates name, colour, zero-condition rules and numeric validity — **not** summary length — so
  an over-limit summary would have no gate and could reach the parse; that is exactly the
  `<BattleNameField>` situation ("live-bound with no validating gate, so over-limit had to be made
  unreachable"), so this field **clamps** (attribute + slice) where the name field refuses. The
  editor's 100 lives in `apps/web` (the schema's own comment: property-specific tightening is
  editor-level UX); the schema's 120 is untouched — a UI story does not change a persisted shape
  (Decision I), and anything the UI accepts parses. Conflict surfaced, not silently picked: the
  deferred item names both numbers for the next RFC touch.

- **FD3 — Badges are border + text in the action colour on a transparent background; no header
  hover.** The mockup's 5% tints are `rgba` literals (AR-46) that would need three more tokens to
  express, and the Die one measures **4.72:1** for `--gol-danger` text over the tint on
  `--gol-bg-secondary` — one axe rounding from the floor (the 4.9 FD5 class). Without the tint the
  pair is the gated 4.90:1. The mockup's `.rule-header:hover { background: --bg-hover }` belongs to
  the accordion (a clickable header); this card's header is not clickable, and `--gol-danger` on
  `--gol-bg-hover` is **4.48:1** — the pair `themeTokens.test.ts` deliberately excludes. So: no
  hover background anywhere under a badge. Card hover is the border → `--gol-accent`, no
  transition. Born green on the three backgrounds measures 14.50 / 12.75 / 11.65.

- **FD4 — The drag handle ships as a `disabled` button; the action `<select>` ships here.** (a)
  The AC lists a drag handle; 4.12 gives it behaviour. A span that looks like a handle and does
  nothing is the "control that looks live and does nothing" the Save button's comment calls the
  worse lie; a real button with `disabled` is what Story 4.3 shipped for Save, and 4.12 removes one
  attribute and adds handlers. (b) The AC's "colored action badge" and "+ Add Rule appends a new
  card with a default action" imply an action that can change, and no later story (4.11
  conditions, 4.12 order, 4.13 validation, 4.16 save) owns a selector. The mockup has one
  (`.action-selector`). Shipping the badge without the selector would leave every rule Born
  forever until some story invents the control; so it ships here, native (the `<AddSelect>`
  reasoning: zero bundle, free keyboard and AT).

- **FD5 — "No Rules Defined" is a `<p>`, not a heading.** The Gallery empty state uses an `<h2>`
  under the page's `<h1>`; here the column already has its `<h3>`, and a conditional `<h4>` would
  appear and disappear with the list — and change the 4.4 e2e's enumeration of every heading in
  the dialog. A styled paragraph carries the same text at the same weight with no landmark churn.

- **FD6 — Focus follows the list diff, inside `<RulesEditor>`.** Three moves are required: to the
  new card's Summary on add (design doc `:588`), to a neighbour's **Summary** on delete (the
  deleted button is gone, focus has fallen to `<body>`, "the tab order restarts at the top" — the
  failure `useOrganismEditorModal` and `<BattleEditorView>` both guard), and to the empty CTA when
  the last card goes. The header "+ Add Rule" lives in the layout's slot, outside `<RulesEditor>`,
  so a `pendingFocus` ref set by handlers would need the modal to thread a token through two
  components; diffing `rules` against the previous ids inside one effect needs no coordination and
  is inert for every same-length change (4.11's condition edits, 4.12's reorder). `autoFocus` on
  the newest card is wrong twice: a seeded list (4.17) would focus its last card on mount, and it
  races MUI's focus trap on first paint. The delete move keeps the "loose focus" guard; the add
  move is unconditional because it is the designed behaviour. **Owner decision (review,
  2026-09-17): the delete move targets the neighbour's Summary field, not its Delete button** — a
  `<button>` fires on keydown and auto-repeats, so a held or double-tapped Enter on a neighbouring
  Delete would cascade deletions with no confirmation and no undo; landing on the Summary is
  non-destructive, and one Shift+Tab from there reaches that card's Delete.

- **FD7 — The mockup's per-action description paragraph is not built.** "The following rules apply
  to cells that are empty or occupied by another organism. Successful birth will depend on
  organism dominance rules." is help text making engine claims (Decision C's relative cell state,
  M10's precedence). NFR-4.1 forbids copy the build cannot vouch for, and nothing in this story
  runs the engine. Story 4.11 — where the condition builder explains what `empty` / `alive` /
  `occupied` mean — is where that copy earns its place, verified. Recorded.

- **FD8 — One updater-style setter for the list.** The modal's per-field setters are functional
  (`setDraft((d) => …)`) "so `setDominance` cannot clobber a name change that landed in the same
  batch". A `onChange(nextRules)` computed from the `rules` prop would be a non-functional write of
  one slice; `onRulesChange((rules) => …)` applied inside the modal's functional `setDraft` keeps
  the property, and the pure helpers (`appendRule`, `removeRule`, `updateRulePayload`) are what
  callers pass — tested once, in `ruleDraft.test.ts`, not per component.

- **FD9 — Both "+ Add Rule" controls render in the empty state.** `<BattleGallery>` FD2: the
  toolbar CTA "renders UNCONDITIONALLY across loading/error/empty/ready. It is the persistent
  affordance, not first-run guidance". The Gallery's two carry different labels because FR-7.4 and
  the mockup gave it two; UX-DR12 and the `.rules-header` give this one the same label twice.
  Tests disambiguate by `data-add-rule`; the copy question is recorded, not decided here.

### What exists — read these before writing a line

| File | Why it matters here |
|---|---|
| `apps/web/components/organisms/editor/OrganismEditorLayout.tsx` | **Modified.** Read all 197 lines: the six styled primitives, the three module ids, `ColumnTitle`/`ColumnDescription` (`:148-164`), the `rules` slot doc (`:49-50`), FD1–FD6 in the header. What is preserved: every tier rule, `minWidth/minHeight: 0`, the `MainGroup` fold, the heading order. |
| `apps/web/components/organisms/editor/OrganismEditorLayout.test.tsx` | The six cases; `:71-82` is the one that changes shape (Task 1). |
| `apps/web/components/organisms/editor/OrganismEditorModal.tsx:151-212, 268-288` | The component doc (grows one clause), the draft/seed `useState`s and the four functional setters (the fifth joins them), the `<OrganismEditorLayout basicInfo=…>` call (gains two slots). Nothing else. |
| `apps/web/components/organisms/editor/OrganismEditorModal.test.tsx:28, 109-147, 404-412` | `LIBRARY`, the region/count guard (why the empty state must add no textbox/combobox), the axe case's shape. |
| `apps/web/components/organisms/editor/OrganismNameField.tsx:24-80, 141-183` | `Input`, `Meta`, `CharCount` rule sets and the `useId` discipline the card copies (below the lift threshold — Task 4). The `role="alert"` idiom is **not** copied: the summary has no error state. |
| `apps/web/components/organisms/editor/fieldStyles.ts` | `Field`, `Label` — the card's body reuses them; `Fieldset`/`Legend` are **not** used (a `role="group"` div, not a fieldset — a `<legend>` cannot be a flex header row across engines). |
| `apps/web/components/organisms/editor/ColorPickerField.tsx:141-200` | The `data-*` attribute + selector idiom (`data-selected`, `data-in-use`) the badge's `data-action` follows; the "never `:has()`" rule. |
| `apps/web/components/organisms/OrganismLibrary.tsx:96-119, 309, 324` | `CreateButton` (the accent-button rule set `<AddRuleButton>` mirrors at the mockup's smaller size), `<CardGrid role="list">`, the modal mount. **Untouched.** |
| `apps/web/components/gallery/GalleryEmptyState.tsx`, `CreateBattleLink.tsx` | The empty-state primitives (icon at 0.3 opacity, aria-hidden glyph, one shared CTA control) and the two-mount-points reasoning FD9 leans on. Read only. |
| `apps/web/components/gallery/BattleGallery.tsx:290-302` | FD2 — the persistent affordance beside a first-run CTA. Read only. |
| `apps/web/components/battle/editor/OrganismRoster.tsx:17-34, 228-268` | `RosterList` (list-style none + `<li>`), `AddSelect` (native `<select>`, UA arrow, why) — the select and list idioms. Read only. |
| `apps/web/components/battle/editor/BattleNameField.tsx:76-82, 115-131` | The clamp (attribute + `.slice`) and its stated cost — FD2's precedent for the summary. Read only. |
| `apps/web/components/battle/editor/BattleEditorView.tsx:722-736` | `focusIsLoose` — the guard FD6's delete move adapts. Read only. |
| `apps/web/components/battle/BattlePage.tsx:692-708` | Bare `crypto.randomUUID()`, no fallback, with its secure-context reasoning — the id mint. Read only. |
| `apps/web/components/battle/simulation/PopulationStats.tsx:156` (+ test `:149`) | `role="list"` explicit on a `list-style: none` list, pinned by test. |
| `apps/web/lib/organisms/organismDraft.ts` (+ test) | **Modified** (Task 2) — the "grows one field per story" list and the seed-diff reasoning. |
| `apps/web/lib/organisms/colorReuse.ts` (+ test) | The pure-helper-in-`lib/organisms/` shape and header style `ruleDraft.ts` mirrors. |
| `apps/web/lib/organisms/useOrganismEditorModal.ts:79-104` | The focus-restore effect (`mounted` clearing, loose-focus check, `[data-create-organism]` lookup). **Untouched** — and a value import of anything from the editor defeats the dynamic boundary. |
| `packages/domain/src/survivalRuleSchema.ts` | `.min(1)` on conditions (`:60`), `summary.max(120)` (`:48`), the enum (`:49`), the header comment on editor-level tightening (`:3-5`). **Untouched.** |
| `packages/domain/src/defaultWorkspace.ts:30-60` | The hash scheme and the two Conway rules — the fixtures, and what this story must **not** compute. |
| `apps/web/app/themes.css` | **Modified** (Task 7). The alias precedent (`--gol-action-active: var(--gol-text-primary)`, `:78`), the composite-token precedent, the "Story 6.1 adds an override block" rule. |
| `apps/web/lib/themeTokens.test.ts:56-95, 197-250` | The text-pairs loop (gains `rule-born`), the `var(--gol-` reference scan (why three literal selectors). |
| `apps/web/e2e/organisms.spec.ts:11-30, 457-523, 777-789, 1372-1506` | `openEditor`, the 4.4 helpers (`boxOf`, `openLayout`), the heading-order test that must stay green, the 4.9 block shape to append after. |
| `docs/planning-artifacts/ux-designs/…/clinical-lab-theme/organism-editor.html:16-18, 495-525, 527-553, 555-573, 576-603, 619-625, 636-653, 683-695, 712-726, 991-999, 1006-1060, 1304-1343` | Tokens, `.rules-header`, `.btn-add-rule`, `.rule-card`/`.rule-header`, `.drag-handle`/`.rule-name`, `.action-badge`, `.rule-body`, `.select-input`, the two delete buttons, the header markup, card 1's markup, the accordion/selector scripts (what FD1 declines). **No empty-state markup exists in either theme's mockup** — the design doc's ASCII is the only spec of its shape. |
| `docs/planning-artifacts/ux-designs/…/organism-editor-design.md:302-374, 420-442, 526-531, 582-599` | Rules header, rule card (header components, summary input), empty state, opening state, rule management (default Born, focus to Summary, delete without confirmation). |
| `docs/planning-artifacts/ux-designs/…/ORGANISM-EDITOR-UPDATES.md:52-84` | The accordion revision FD1 records and declines. |
| `docs/implementation-artifacts/deferred-work.md:26, 29, 38-41, 725-729, 746-750, 954-957, 1017-1018, 1294-1297` | Duplicate ids (out of scope), UTF-16 counting, the hasher, the two 4.2 items to re-point, the 4.4 item to strike, the WebKit flake, the port-reuse trap. |
| `docs/implementation-artifacts/4-4-three-column-responsive-layout.md` | FD1–FD6, the review patches, `:262-272` (the deferred note that assigns the slot to this story). |
| `docs/implementation-artifacts/4-9-color-reuse-warning-cvd-validation.md` | The review findings as habits: assert the thing moved; derive names, never literals; a generated-content glyph joins an accessible name (why every glyph here is `aria-hidden` on a real node inside a button whose name is `aria-label`); an empty `styled('div')({})` is dead weight. |
| `docs/implementation-artifacts/lane-gates.yaml` | 4.15/4.24/4.25 gated on Epic 3; this story proposes no gate. |

### Architecture compliance

- **FR-2.5 / FR-2.6** — summary + action per rule; list order is priority (an `<ol>`); conditions
  and reordering are the next two stories.
- **RFC-004 §2.4** — opaque generated `id` (uuid), never semantic, minted once at creation and
  stable across edits; `contentHash` is content-addressing computed at authoring time — **4.16**,
  matching `defaultWorkspace.ts`'s documented scheme.
- **RFC-005 Decision 1 / AR-33** — the rules are ephemeral modal state inside the one draft
  object; no Context, no store, no repository (AR-2 / AR-27).
- **RFC-003 Decision 3 / Decision J / AR-46** — `styled()` + `var(--gol-*)` only; three new
  tokens, two aliases; the mockup's `rgba` tints and `2px` radius become nothing and `--gol-radius`.
- **AR-35 / bundle** — no new MUI module; native `<select>`; everything new rides the lazy editor
  chunk.
- **NFR-4.1** — the handle is `disabled` (honest), the action description copy is not shipped
  (unverified), Save stays `disabled`.
- **NFR-2.1** — no `:has()`, no `transition` on new chrome; `useId` per instance.
- **UX-DR10 / UX-DR12 / UX-DR17** — card anatomy, empty state, keyboard operation (every control
  is a native button/input/select; focus is managed on add and delete).
- **Spec-id hygiene** — `spec:check` tokenises `FR-2.5`, `FR-2.6`, `NFR-2.1`, `NFR-4.1`,
  `NFR-8.3`, `NFR-8.4`, `AR-2`, `AR-27`, `AR-33`, `AR-35`, `AR-44`, `AR-46`, `RFC-003`, `RFC-004`,
  `RFC-005`, `Decision C`, `Decision I`, `Decision J`, `M10`, `Story 4.10`, `Story 4.11`, `Story
  4.12`, `Story 4.13`, `Story 4.16`, `Story 4.17`, `Story 4.3`, `Story 4.4`, `Story 4.7`, `Story
  4.8`, `Story 4.9`, `Story 4.2`, `Story 2.13`, `Story 3.12`, `Story 6.1`, `Story 6.11`; write them
  exactly so. `UX-DR*`, `FD*`, `SC n.n.n` are not checked.

### Library / framework notes (installed versions, no research needed)

- **React 19.2** — `useId()` per card (four ids); an effect keyed on `rules` with a `useRef` of the
  previous ids is the diff (FD6); updaters must be pure (dev double-invocation) — mint ids outside.
- **`crypto.randomUUID()`** — present in Vitest 4's jsdom environment (`BattlePage.test.tsx` spies
  on it); a served `localhost` is a secure context for Playwright. No polyfill, no fallback.
- **Zod 4 (`@gol/domain`)** — `SurvivalRuleSchema.shape.payload.shape.action.options` is the
  typed tuple `['born', 'survive', 'die']`; reading it costs nothing new in the bundle.
- **jsdom / @testing-library** — `<select>` is `combobox`; `user.selectOptions(el, 'die')`;
  `toBeDisabled()` on the handle; `document.activeElement` is reliable after `.focus()` and after
  a removed element loses focus (falls to `body`); `getByRole('group', { name })` resolves
  `aria-labelledby`; a lone `<li>` outside a list trips axe's `listitem` — render cards inside an
  `<ol role="list">` in the card test.
- **Playwright 1.62** — `getByRole(role, { name })` is a case-insensitive **substring** match
  unless `exact: true`: `'Rule 1'` also matches `Rule 10`+ and `'Delete rule 1'` matches `Delete
  rule 12` — pass `exact: true` on every numbered name. `selectOption('die')` on the combobox;
  `toBeFocused()`; `toBeDisabled()`. `fill()` sets the value programmatically and **bypasses** the
  `maxLength` attribute — which is exactly why the `.slice` clamp exists and what e2e test 4
  measures (the same fact `BattleNameField.tsx:121-128` records for IME/dictation/autofill).
- **MUI 9.3.1 `styled()`** — `'&[data-action="born"]'` and its two siblings are plain keys on
  the badge; `'&:disabled'` on the handle.

### Testing standards

- `apps/web` has **no coverage gate** — every test guards a named failure: a card that keeps a
  stored number (b, e), a handle that acts (g), a clamp that lets 101 through (d, e2e 4), focus
  that falls to `<body>` after a delete (e, f, g), a seeded list that steals focus (j), a list
  role Safari drops (a), an updater that mints two ids (the modal round-trip), a token the regex
  cannot see (Task 7).
- `packages/*` **are not touched**; the domain/simulation coverage lines must read exactly as on
  `main`. `lib/organisms/ruleDraft.ts` gets exact tests anyway.
- Never snapshot; never assert computed colours in jsdom; never mock `useId` or
  `crypto.randomUUID` (the harness mints real ids; assert on names and positions, not id values);
  derive every badge/option string through `ruleActionLabel`, never literals — the e2e's literals
  each carry a comment naming their source.
- Story 4.4's layout test is **retargeted** only in the omitted-slot case (the header wrapper);
  if any other 4.1–4.9 test fails, the change is wrong, not the test.
- Do not add an `afterEach` that sweeps `[aria-hidden]` nodes (`deferred-work.md`).

### Previous story intelligence (Story 4.9)

- The modal's draft pattern is settled: one typed object, functional setters, the seed held
  beside it. This story adds one field, one updater-style setter, one `addRule`, and two slots.
- 4.9's review found that CSS generated content **joins** a control's accessible name — every
  decorative glyph here (`⋮⋮`, `✕`, `◯`) is a real `aria-hidden` node, and every button that
  wears one takes its name from `aria-label`. Test names with `toHaveAccessibleName`, exact.
- 4.9's review struck an empty `styled('div')({})`: `ColumnHeaderInfo` carries real rules
  (`flex: 1; minWidth: 0`); if a wrapper ends up with none, use a plain element.
- 4.9's owner review re-confirmed **the mockup wins over the design doc** for paint; FD1 is the
  one place the *structure* follows the AC over the mockup, and says why.
- 4.9 measured the editor chunk at 6168 B gzip after review; measure `main` fresh.

### Git intelligence

`main` is at `92a3d4d` (the `next-env.d.ts` untrack after #49). The last app-code commits are
4.9's (`components/organisms/editor/**`, `lib/organisms/colorReuse.*`, `lib/palette/paletteCvd.*`,
`organisms.spec.ts`) and 3.16's (`components/battle/simulation/**`, `lib/battle/**`,
`battleRoute.spec.ts`). **Shared code surfaces with the open Epic 3 lane (3.17–3.19): none of
this story's component or lib files.** Two shared *files*: `apps/web/app/themes.css` (this story
appends three tokens; 3.18's fullscreen HUD may append its own — both are append-only additions
to the same block and merge cleanly) and `apps/web/lib/themeTokens.test.ts` (one array entry).
`deferred-work.md` is append-only plus strike-throughs (the Step S sync keeps both hunks).

### Project Structure Notes

- New: `components/organisms/editor/AddRuleButton.tsx`, `RuleCard.tsx` (+ test),
  `RulesEditor.tsx` (+ test); `lib/organisms/ruleDraft.ts` (+ test).
- Modified: `components/organisms/editor/OrganismEditorLayout.tsx` (+ test),
  `OrganismEditorModal.tsx` (+ test), `lib/organisms/organismDraft.ts` (+ test),
  `app/themes.css`, `lib/themeTokens.test.ts`, `e2e/organisms.spec.ts`,
  `docs/implementation-artifacts/deferred-work.md`, `sprint-status.yaml`.
- Naming: non-component TS camelCase (`ruleDraft.ts`); helpers `createNewRuleDraft`,
  `appendRule`, `removeRule`, `updateRulePayload`, `ruleActionLabel`; data attributes
  `data-rule-card`, `data-rule-id`, `data-rule-badge`, `data-rule-delete`, `data-rule-summary`,
  `data-rule-action`, `data-drag-handle`, `data-add-rule`, `data-rules-empty-state`; tokens
  `--gol-rule-born|survive|die`.
- Untouched on purpose: `OrganismNameField/DominanceField/AgingToggleField/ColorPickerField.tsx`
  (+ tests), `fieldStyles.ts`, `useOrganismEditorModal.ts` (+ test), `OrganismLibrary.tsx` (+ test),
  `OrganismCard.tsx`, `colorReuse.ts`, `theme.ts`, every file under `components/battle/**` and
  `packages/*`, `playwright.config.ts`, `scripts/check-bundle-size.mjs` budgets,
  `docs/project-context.md`.

### What NOT to build

- ❌ No `contentHash`, no hasher, no `sortKeysDeep` — Story 4.16 (`deferred-work.md:38-41`).
- ❌ No condition rows, no "+ Add Condition", no "Conditions (all must match)" label — Story 4.11.
- ❌ No drag, no drop zones, no keyboard reordering, no enabled handle — Story 4.12.
- ❌ No validation, no "no rules defined" warning, no zero-condition error, no Save enablement —
  Story 4.13 / 4.16.
- ❌ No accordion: no expand/collapse state, no caret, no `.rule-header:hover` — FD1.
- ❌ No per-action description paragraph — FD7.
- ❌ No `Fieldset`/`Legend` for the card — a `role="group"` div (FD in Task 4).
- ❌ No MUI `Select`, `Chip`, `List`, `Card`, `IconButton` for the card — `styled()` primitives
  and a native `<select>` (AR-35, the bundle).
- ❌ No `useState` inside `<RuleCard>` or `<RulesEditor>` except none — both are controlled views;
  the only ref state is `prevIdsRef` (FD6).
- ❌ No `document.querySelector` — scope every lookup to `rootRef`.
- ❌ No `var(--gol-rule-${action})` template — three literal selectors (AC7).
- ❌ No `rgba`/`rgb(var(…))` badge tint, no `--gol-rule-*-tint` token, no `2px` radius — FD3.
- ❌ No `transition`, no `translateY` lift on the add button, no `:has()`.
- ❌ No `role="status"`/`aria-live` for add or delete — focus movement carries the change.
- ❌ No stored rule number, no `label` field on `RuleDraft` — positions are derived.
- ❌ No `Intl.*`, no pluralisation helpers for "Rule N".
- ❌ No change to `SurvivalRuleSchema`, `OrganismSchema`, or any `@gol/*` package.
- ❌ No re-mint of ids on any change — an id is minted once, in `addRule`.

### Open flags for the owner (not blockers — the story proceeds on the FD)

- **The summary cap is 100 in the editor and 120 in the schema** (FD2). Safe (UI ⊂ schema), but two
  numbers for one concept; the next RFC-004 / UX touch should pick one.
- **Two identically-named "+ Add Rule" buttons in the empty state** (FD9). If a distinct empty-state
  label is wanted ("Add your first rule"), it is a one-string change.
- **The 2026-06-01 accordion revision is declined again** (FD1, after 4.3's FD1 for the header).
  Two stories have now taken the AC over that revision; the UX docs need the reconciliation touch
  4.3 asked for.

### References

- `docs/planning-artifacts/epics.md:1103-1113` (Story 4.10 ACs), `:1115-1126` (4.11 — what is
  not here), `:1128-1138` (4.12 — renumbering on drop), `:1140-1151` (4.13 — the Save gate's
  list), `:235` (UX-DR10), `:237` (UX-DR12), `:239` (UX-DR14).
- `docs/planning-artifacts/prds/prd-GameOfLife-2026-05-26/prd.md:187-210` (FR-2.5 in full,
  FR-2.6).
- `docs/planning-artifacts/architecture.md:188` (Decision C), `:222` (Decision E — ids at rest),
  `:289` (Decision J), `:356` (M10 — order is priority within a phase).
- `docs/planning-artifacts/rfcs/RFC-004-simulation-rules-engine.md:486-502` (§2.4 — rule
  identity: opaque id + content hash), `:569` (`summary: z.string().max(120)`).
- `docs/planning-artifacts/rfcs/RFC-005-application-state-modes-undo.md` (Decision 1 — three
  state categories), `RFC-003-frontend-ui-architecture.md:167` (Decision 3 — `styled()` for static
  chrome).
- `docs/planning-artifacts/ux-designs/ux-GameOfLife-2026-05-27/clinical-lab-theme/
  organism-editor.html:16-18, 495-726, 991-1060, 1304-1343`; `organism-editor-design.md:302-374,
  420-442, 526-531, 582-599, 747-770`; `ORGANISM-EDITOR-UPDATES.md:52-84`;
  `biotech-terminal-theme/organism-editor.html:17-19`.
- `docs/planning-artifacts/implementation-readiness-report-2026-07-16.md:318, 401` (issue #3 —
  delete without confirmation, resolved in the story's favour).
- `docs/implementation-artifacts/4-4-three-column-responsive-layout.md` (FD1–FD6, `:262-272`);
  `4-3-editor-modal-shell.md` (FD1 — the AC-over-revision precedent); `4-8-…` / `4-9-…` (the
  draft pattern, the review habits); `2-13-save-battle.md` (the at-cap notice this story does not
  replicate); `1-12-gallery-empty-state` → `epic-1/` (the empty-state primitives).
- `docs/implementation-artifacts/deferred-work.md:26, 29, 38-41, 725-729, 746-750, 954-957,
  1017-1018, 1294-1297`.
- `docs/implementation-artifacts/lane-gates.yaml`.
- `docs/project-context.md` — Framework rules (three state categories; `styled()` + tokens; no
  repository import), Testing rules (axe; never snapshot; no coverage padding; the Playwright
  viewport band), Code Quality (AR-46 and its lint regex; `spec:check`; camelCase files; comments
  explain why), Commit gate.

## Dev Agent Record

### Agent Model Used

claude-sonnet-5 (Claude Sonnet 5), via the `bmad-dev-story` skill.

### Debug Log References

- `lsof -i :4173` before running e2e: nothing bound to the port (the `deferred-work.md:1294-1297`
  port-reuse trap did not apply this run) — e2e ran against this tree's own `serve out -l 4173`.
- `npm run ci > ci.log 2>&1; echo $?` — exit code and full gate output recorded below.
  - **Review correction (2026-09-17, Opus):** nothing below records the exit code, the
    domain/simulation coverage line or the e2e summary — the "green" in the Change Log was asserted,
    not evidenced, and the dev agent's local `bench:check` / full `ci` runs were contaminated by the
    Epic 3 lane's CPU load. What the review re-ran on this tree: `typecheck → lint → format:check →
    spec:check → boundary:check → test:coverage`, exit 0 (97 web test files; `spec:check` resolves
    254 ids), plus the seven touched unit-test files after the review patches. The remote gate is
    the PR's run — `ci.yml` triggers on `main` pushes and `pull_request` only, so **no GitHub Actions
    run existed for this branch before the PR opened**; AC10's "checked with `gh run list`" could
    not have happened at dev time. The PR's CI result is recorded in the PR body.
- Bundle sizes measured twice: once against this branch's build (`node
  scripts/check-bundle-size.mjs` after `npm run build:standalone`), once against a throwaway git
  worktree checked out at `main` (`92a3d4dbf60b8bd7fee295aba1b1a6fcd703490f`, node_modules cloned
  via APFS `cp -c` to avoid a slow reinstall) built the same way, then removed
  (`git worktree remove --force`). Editor-chunk gzip size found by `grep -rl "Organism Color"
  .next/static/chunks/*.js` then `gzip -c <file> | wc -c`, per Task 8/9.
  - Routes (gzip, first load): home 333.4 → 333.5 KB (budget 340), battle 308.7 → 308.8 KB (budget
    310), battle/new 308.7 → 308.7 KB (budget 310), organisms 295.4 → 295.4 KB (budget 305). Every
    route moved ≤ 0.1 KB — well inside the ±0.5 KB band. No budget raised.
  - Editor chunk (lazy, gzip): 6162 B on `main` → 7708 B after this story, +1546 B (~1.5 KB) for
    three new components, the empty state and `ruleDraft.ts`'s helpers — under the ≈+2.0–3.0 KB
    estimate in AC10.
- `npm run ci`'s `format:check` step first failed on 4 files
  (`RuleCard.tsx`, `RulesEditor.test.tsx`, `organisms.spec.ts`, `ruleDraft.ts`); fixed with
  `npx prettier --write` on those four (whitespace/wrapping only, confirmed by re-running the
  affected `vitest` files — no behavioural change) and the gate re-run from a clean log.
- The full Playwright run of `organisms.spec.ts` (all 8 stories' blocks, all 4 projects) showed one
  unrelated flake: `organism card grid (Story 4.2) › has no axe accessibility violations after
  hydration or in the zero-match state` timed out on `firefox` under parallel load; re-run alone it
  passed in 10.1s. Pre-existing test, not touched by this story — not "fixed" here per the
  `deferred-work.md:1017-1018` precedent for flagging rather than patching a flake outside scope.

### Completion Notes List

- Implemented all 10 ACs / 9 tasks: the layout's header row + `rulesAction` slot (Task 1); the pure
  `RuleDraft` vocabulary in `lib/organisms/ruleDraft.ts` plus `organismDraft.ts`'s new
  `survivalRules` field (Task 2); `<AddRuleButton>` (Task 3); `<RuleCard>` (Task 4); `<RulesEditor>`
  with the empty state and the focus-follows-the-list-diff rule (Task 5); the modal's
  `setSurvivalRules`/`addRule` wiring (Task 6); the three `--gol-rule-*` tokens and the
  `themeTokens.test.ts` gate (Task 7); the e2e block (Task 8); deferred-work / sprint-status /
  bundle measurement (Task 9).
- FD1–FD9 followed exactly as forced in Dev Notes: the AC's card anatomy over the accordion
  revision (FD1), `RuleDraft` minus `contentHash` with a 100-char editor clamp inside the schema's
  120 (FD2), untinted transparent badges (FD3), a genuinely `disabled` drag handle with the action
  `<select>` shipped here (FD4), the empty-state title as a `<p>` (FD5), focus-follows-the-diff
  inside `<RulesEditor>` (FD6), no per-action description copy (FD7), one updater-style
  `setSurvivalRules` (FD8), both "+ Add Rule" controls sharing one accessible name, disambiguated by
  `data-add-rule` (FD9).
- All nine "what NOT to build" items were honoured: no `contentHash`/hasher, no condition rows, no
  drag/reorder, no Save-time validation, no accordion, no per-action description, no
  `Fieldset`/`Legend` on the card, no MUI form controls, no extra `useState` beyond `prevIdsRef`, no
  bare `document.querySelector` (every lookup is scoped to `<RulesEditor>`'s `rootRef`), no
  `var(--gol-rule-${action})` template, no badge tint/`2px` radius, no transition/`:has()`, no
  `aria-live` region for add/delete, no stored rule number, no `Intl.*`, no `@gol/*` schema change,
  no re-minted ids.
- Every existing guard from AC9 stayed exactly as specified: `OrganismEditorLayout.test.tsx`'s
  omitted-slot case retargeted one level down (header wrapper) plus two new `rulesAction` cases
  (the probe placement, and the omitted-slot header having exactly one child — miscounted as one in
  the first draft of this record), the other five unedited; `OrganismEditorModal.test.tsx`'s 25 existing cases unedited, 4 new added;
  `organismDraft.test.ts`'s `toEqual` gained `survivalRules: []` plus a distinct-array assertion;
  the 4.3/4.4/4.5–4.9 `organisms.spec.ts` blocks unedited, the new block appended after 4.9's.
- One deliberate divergence from the AC's literal pseudocode: `data-rule-card`/`data-rule-id` sit
  on the inner `role="group"` div (as the Task 4 pseudocode's `<Group>` shows), not on the `<li>`
  — matches the story text exactly, called out here only because it is easy to misread as "the
  card wrapper."
- 2026-09-17 — Resumed to resolve the one outstanding `[Review][Decision]` item: the owner picked
  option 2 (neighbouring **Summary**, not another Delete button, after a delete). Changed
  `RulesEditor.tsx`'s delete-focus branch to `[data-rule-summary]`; updated its FD6 header comment;
  updated AC5, FD6, the Task 5 subtask bullet and Task 8's test-3/test-5 descriptions in this file
  to say Summary; updated `RulesEditor.test.tsx` tests (e) and (f) and `organisms.spec.ts` e2e
  tests 3 and 5 to assert focus on the neighbour's Summary textbox instead of its Delete button.
  No other behaviour changed — the neighbour-selection rule (index-match, else new-last, else the
  empty CTA) and the "loose focus" guard are untouched.
- 2026-09-17 — Resumed to resolve the second pass's outstanding `[Review][Decision]` item: the
  owner picked option 3 (defer) on the pointer double-click cascade on ✕. No code changed;
  recorded the owner decision and resolution note against the review item, appended a bullet to
  `deferred-work.md`'s `## Deferred from: code review of 4-10-rule-cards-empty-state (2026-09-17)`
  section naming the pick-up point (a later Epic 4 story adding a rule-delete confirmation dialog
  to the Organism Editor), and marked `4-10-rule-cards-empty-state` `review` in
  `sprint-status.yaml`. The owner then had that story created in the same push (`0575e72`):
  Story 4.26 Rule-Delete Confirmation Dialog in `epics.md`,
  `4-26-rule-delete-confirmation-dialog: backlog` in `sprint-status.yaml`, and the deferred
  entry pointed at it.

### File List

**New**
- `apps/web/lib/organisms/ruleDraft.ts`
- `apps/web/lib/organisms/ruleDraft.test.ts`
- `apps/web/components/organisms/editor/AddRuleButton.tsx`
- `apps/web/components/organisms/editor/RuleCard.tsx`
- `apps/web/components/organisms/editor/RuleCard.test.tsx`
- `apps/web/components/organisms/editor/RulesEditor.tsx`
- `apps/web/components/organisms/editor/RulesEditor.test.tsx`

**Modified**
- `apps/web/components/organisms/editor/OrganismEditorLayout.tsx`
- `apps/web/components/organisms/editor/OrganismEditorLayout.test.tsx`
- `apps/web/components/organisms/editor/OrganismEditorModal.tsx`
- `apps/web/components/organisms/editor/OrganismEditorModal.test.tsx`
- `apps/web/lib/organisms/organismDraft.ts`
- `apps/web/lib/organisms/organismDraft.test.ts`
- `apps/web/app/themes.css`
- `apps/web/lib/themeTokens.test.ts`
- `apps/web/e2e/organisms.spec.ts`
- `docs/implementation-artifacts/deferred-work.md`
- `docs/implementation-artifacts/sprint-status.yaml`
- `docs/planning-artifacts/epics.md` (Story 4.26 added; 4.10 AC3 pointer)
- `docs/planning-artifacts/ux-designs/ux-GameOfLife-2026-05-27/organism-editor-design.md` (Deleting a Rule step 2 pointer)
- `docs/implementation-artifacts/4-10-rule-cards-empty-state.md` (this file)

### Change Log

- 2026-09-17 — Story file created (create-story): ACs decomposed, FD1–FD9 recorded, precedent and
  spec map compiled; status → ready-for-dev.
- 2026-09-17 — Implemented (dev-story): all 9 tasks complete, all 10 ACs satisfied. `npm run ci`
  green (see Dev Agent Record for the exact figures); status → review.
- 2026-09-17 — Code review (Opus, three adversarial layers): 13 patches applied (see Review
  Findings), 1 deferred, 1 `decision-needed` left for the owner (focus landing on the neighbouring
  Delete after a delete); the Dev Agent Record's verification claims corrected; status →
  in-progress pending that decision.
- 2026-09-17 — Resolved the outstanding review decision (option 2, Sidiar): delete-focus now
  targets the neighbouring card's Summary field, not its Delete button; AC5, FD6, the Task 5/8
  spec text, `RulesEditor.tsx`, `RulesEditor.test.tsx` (e)/(f) and `organisms.spec.ts` e2e tests
  3/5 updated to match; status → review.
- 2026-09-17 — Second review pass (Opus) on `132501a`: decision 2 verified complete; CI run
  `35225718572` green. 7 patches applied (a "second Enter removes nothing" unit test; review
  provenance dropped from four comments with the why and the Safari Shift+Tab caveat kept; the
  first pass's leftover `as RuleDraft` casts and `describedBy!` removed and `renderCard`'s
  overrides narrowed; the modal's orphan comment line folded; the recorded owner decision's
  "header + Add Rule" corrected to the empty-state CTA; Task 8 test-5 text realigned with the
  e2e). 1 new `decision-needed` (pointer double-click on ✕ cascades deletions); status →
  in-progress pending that decision.
- 2026-09-17 — Resolved the second pass's outstanding review decision (option 3, Sidiar): deferred
  the pointer double-click cascade on ✕ to a later story that adds a rule-delete confirmation
  dialog to the Organism Editor; no code changes. Bullet appended to `deferred-work.md`'s
  `## Deferred from: code review of 4-10-rule-cards-empty-state (2026-09-17)` section; status →
  review.
- 2026-09-17 — Story 4.26 Rule-Delete Confirmation Dialog created at the owner's direction
  (`0575e72`): added to `epics.md` after 4.25 and to `sprint-status.yaml` as `backlog`; the
  deferred entry now names it as the pick-up point.
- 2026-09-17 — Third code-review pass (Opus) on the two docs commits: 0 `decision-needed`, 4
  `patch` (applied in `4dcb758`: `→ Story 4.26` pointers at the three no-confirmation sites; this
  file brought level with `deferred-work.md`; deferred-entry slips; two pick-up notes for 4.26's
  create-story), 0 `defer`, 14 dismissed. Status → done; `sprint-status.yaml` synced. PR #51 run
  `35231768952` on `4dcb758` green.

Dev Model: sonnet   # follows the settled editor pattern (one draft field, controlled views, a layout slot, functional setters); every choice later stories build on — the RuleDraft shape, the three tokens, the diff-driven focus rule, the updater-style setter — is pinned as FD1–FD9 with the exact signatures, so the dev step executes rather than designs
Proposed lane gate: none

---

This story was implemented with the 'Implement next story' skill with the following stats:

| Phase | Agent model | Agents | Active | Wall clock | Input | Output | Cache write | Cache read | Total tokens |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Step 0 — re-entry guard | — | 0 | 27s | 27s | 12 | 2,670 | 6,292 | 325,688 | 334,662 |
| Step 1 — create-story | opus-5 | 1 | 20m 41s | 20m 41s | 208 | 88,981 | 993,315 | 17,614,883 | 18,697,387 |
| Step 2 — dev-story | sonnet-5 | 1 | 40m 23s | 40m 23s | 776 | 107,383 | 1,424,690 | 91,376,167 | 92,909,016 |
| Step 3 — code review + PR | opus-5 | 4 | 35m 55s | 35m 55s | 564 | 153,144 | 1,500,224 | 35,607,114 | 37,261,046 |
| _of which the orchestrator_ | opus-5 | — | — | — | 50 | 11,177 | 35,165 | 1,525,112 | 1,571,504 |
| **Total (create-story → PR ready)** | | 6 | **1h 37m** | 1h 37m | 1,560 | 352,178 | 3,924,521 | 144,923,852 | **149,202,111** |

Run started 2026-09-17 10:23 CEST; wall clock runs to the point the run stopped for the owner's review. No idle gaps were excluded; Active and Wall clock agree. (A gap counts as idle above 15 min.) Each phase row covers the phase agent, any agents it spawned, and the orchestrator's own turns in that window — the orchestrator row breaks its share out again, it is not additional. Cache reads dominate the token totals and are billed at a fraction of input rate, so read the Input and Output columns for effort and the total only as a ceiling. The orchestrator's final turn is still being written when these numbers are taken.
