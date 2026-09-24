---
baseline_commit: e06da2e
---

# Story 4.20: Usage Visibility UI

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a user,
I want to see where an organism is used,
so that I understand the impact of editing or deleting it.

## Acceptance Criteria

From `epics.md#Story 4.20: Usage Visibility UI` (`:1227-1238`), decomposed into what a reviewer can
check independently. **Both derivations already exist and are 100% covered** — Story 4.19 shipped
`resolveOrganismUsage` and `buildRuleReferenceIndex` / `referencingOrganismIds` in `@gol/domain`.
This story builds **no domain logic**: it is the editor's first FOOTER, its first disclosure
overlay, and the prop that carries battle summaries into the modal. **Read FD1–FD14 before touching
a file** — the four things that go wrong silently here (Escape closing the whole editor instead of
the popover; a second MUI `Modal` nested inside the fullScreen editor `Dialog`; a count derived a
second way so the three surfaces agree only by coincidence; a raw `summary.name` rendering as an
empty list item) are settled there.

1. **The editor grows a footer, and it holds the usage indicator only.** A `<footer>` inside
   `<OrganismEditorModal>`'s `Shell`, after `<EditorBody>`, `flexShrink: 0` — the mockup's
   `.editor-footer` (`clinical-lab-theme/organism-editor.html:818-828, :1222-1235`). It renders on
   every open, in both create and edit sessions (UX-DR6: "persistent"). ⚠️ **Save does NOT move
   into it** and the organism name does NOT move into the header: that is the three-way spec
   divergence Story 4.3 recorded (`deferred-work.md:791-808`, FD1) and it stays recorded, not
   resolved by this story. The header keeps Back / centred title / Save + ✕ exactly as shipped.

2. **"Used in [N] Battle(s)" is always rendered; "Targeted by [M] organism rule(s)" only when M > 0.**
   Copy comes from ONE exported helper each, so the footer and Story 4.17's dialog cannot drift
   (AC5). Real pluralisation, never the spec's `(s)` shorthand — `Used in 1 Battle` /
   `Used in 3 Battles`, `Targeted by 1 organism rule` / `Targeted by 2 organism rules`, the
   `battleCountLabel` precedent. `M === 0` renders **nothing at all** for the rules half (NFR-4.1 —
   no dead affordance, no "Targeted by 0").

3. **A non-zero count is a disclosure; a zero count is plain text.** Each label with a non-zero
   count is a `<button type="button">` carrying `aria-expanded` and `aria-controls`; clicking it
   opens a **read-only** panel of names and clicking again closes it. `Used in 0 Battles` renders
   as text with **no button, no `aria-expanded`, no panel** (UX-DR6: "without expansion").
   - the battles panel lists **battle names**, the rules panel lists the **names of the organisms
     whose rules target this one** — names only;
   - **the panel's scroll region is focusable (`tabIndex={0}` plus an accessible name); nothing
     inside it is interactive — no link, nothing navigates, nothing writes** (FR-1.7, M7: the editor
     may be a modal over an in-progress battle, so navigation would abandon unsaved grid work — and
     a scroll container cannot navigate, so the amendment keeps the constraint that mattered).
     ⚠️ **Amended 2026-09-24** from "nothing inside either panel is focusable" by the owner's
     decision on review item D2; axe's `scrollable-region-focusable` requires exactly this of the
     capped list below;
   - **the name list is capped at `min(60vh, 400px)` with `overflowY: auto`, and each name is
     truncated to ONE line** (`whiteSpace: nowrap` + `textOverflow: ellipsis`, the full text kept in
     the DOM so a screen reader still reads it; `Panel` carries a `maxWidth` so a 100-character
     battle name cannot set the width instead). Without the cap a panel opening upward from the
     footer pushes its FIRST names past the top of the viewport, unreachable — nothing scrolls, and
     neither `toBeVisible` nor axe sees clipping (**added 2026-09-24**, the same decision);
   - at most one panel is open at a time.

4. **Escape closes the panel, not the editor.** ⚠️ With a panel open, Escape must close the panel
   and leave the editor mounted; a second Escape then closes the editor as it does today. MUI's
   `Modal` listens for Escape on the modal root, so a bubbling `keydown` reaches
   `handleRequestClose` and closes the WHOLE editor — the intuitive implementation passes every
   other bullet here and loses the user's draft (FD4). Also pinned: an outside pointerdown closes
   the open panel; focus stays on / returns to the trigger that opened it; the footer is reachable
   by Tab after the three columns; axe reports zero violations with a panel open.
   ⚠️ **Amended 2026-09-24** (owner's decision on review item D1): the focus clause is "**after
   Escape**, focus is on the trigger" — an outside `pointerdown` deliberately leaves focus where the
   press landed (a restore there is either overridden by the click's own `mousedown` focus or steals
   focus from a field the user chose), and tabbing away leaves the panel open, from where Escape
   still closes the panel rather than the editor.
   ⚠️ **Amended 2026-09-24** (owner's decision on review item D5): **a HELD Escape closes one layer.**
   Once Escape has closed a panel, keydowns carrying `repeat` are swallowed until the matching
   keyup, so the auto-repeat does not go on to close the editor; a deliberate second press does. A
   panel opened during the hold is likewise not closed by the repeat (third review, 2026-09-24).

5. **One derivation and one label, across all three surfaces (the AC's "counts are consistent").**
   - the VALUE is `resolveOrganismUsage(index, organismId).length` — never `index.get(id)?.length`.
     `<OrganismLibrary>`'s Story 4.17 edit-warning count (`OrganismLibrary.tsx:419`) moves onto the
     same call in this story, so Story 4.24 later supplies `openBattle` in ONE place (FD8, FD9);
   - `M` is `index.get(id)?.length ?? 0` over `buildRuleReferenceIndex` (a count of RULES) while the
     rules panel lists `referencingOrganismIds(index, id)` (distinct ORGANISMS) — the two numbers
     the 4.19 module's head comment separates. A panel whose item count equals M is wrong when one
     organism targets this one from two rules;
   - the COPY is one exported function per label, imported by both the footer and
     `<OrganismInUseDialog>`. `battleCountLabel` moves out of `OrganismInUseDialog.tsx` into
     `apps/web/lib/organisms/usageLabels.ts` (FD6) so the dialog's chunk is not what the editor
     imports for a string.

6. **The modal receives battle summaries as DATA, never a repository.** New prop
   `battleSummaries: readonly Pick<BattleSummary, 'id' | 'name' | 'organismIds'>[]` on
   `OrganismEditorModalProps`, passed from `<OrganismLibrary>`'s already-settled `summaries`
   (`OrganismLibrary.tsx:258`). ❌ No `BattleRepository` on the modal, no `createRepositories()`,
   no `battles.list()` from inside the editor (AR-2/AR-27) — `organisms` stays the modal's only
   injected repository, and it is still only used for Save. ⚠️ **Amended 2026-09-24** (owner's
   decision on review item D3): what this closes is the **footer half** of
   `deferred-work.md:2431` — that entry's `battles`-on-the-modal question ("Story 4.20 … will need
   `battles` on the modal too"), answered with DATA. It does **not** close the entry: FR-1.3's
   expandable "[N] Battle(s)" on `<OrganismInUseDialog>` (`prd.md:125`, FR-1.7, M7) is untouched
   here (AC9) and is re-pointed at Story 4.24.

7. **Names are resolved through the existing display helpers, never raw.** Battle names through
   `battleDisplayName` (`apps/web/lib/battleDisplayName.ts` — `''`, whitespace and invisible-only
   names all become `Untitled Battle`); organism names through the `Unnamed organism` fallback in
   `apps/web/lib/displayOrganisms.ts`. A raw `summary.name` or `organism.name` reaching an `<li>`
   renders an empty list item for a record the schema permits (neither has a lower length bound).
   A `battleId` of `null` renders **"Current Battle (unsaved)"** (RFC-005 Decision 8) — forced by
   `OrganismUsageEntry.battleId: string | null`, unreachable until Story 4.24 passes an
   `openBattle`, unit-tested here and recorded as such (FD9).

8. **Create mode reports zero without a special case.** The subject is
   `organism?.id ?? saveStamp?.id ?? null`; a `null` subject, and an id in neither index, both yield
   `N = 0` / `M = 0` and therefore "Used in 0 Battles" with no expansion and no rules label. The
   counts are the **open-time snapshot** — `library` and `battleSummaries` do not refresh while the
   editor is mounted (the hook reloads only after close, by design, Story 4.16 Task 11), and a
   just-saved new organism is in no battle and targeted by no rule, so the snapshot is not stale in
   any reachable way (FD7).

9. **Scope: nothing else moves.** `<OrganismCard>`'s stat block, the card's rules sentence and the
   Library's focus-after-rename edge are **not** picked up here — three `deferred-work.md` entries
   point at "Story 4.20" as the next Library touch, and this story touches `<OrganismLibrary>` for
   one prop and one call site. They are **re-pointed in place** (annotate, don't delete), not
   silently left reading as pending on a story that shipped (Task 7). No file under
   `packages/*` is modified — no domain change, no barrel edit, hence no two-lane barrel collision.

10. **Gates.** `npm run ci:dev` green from the worktree root (its real exit code recorded), the
    `/organisms` bundle measured and **reported** against its 305 KB entry — the budget is not
    raised in this story; if the measurement crowds it, say so and stop rather than edit
    `scripts/check-bundle-size.mjs`. `spec:check` passes on every ID written into a comment.

## Tasks / Subtasks

- [x] **Task 1 — Read before writing (AC: all).**
  - [x] `apps/web/components/organisms/editor/OrganismEditorModal.tsx` end to end — the `Shell` /
        `EditorHeader` / `EditorBody` chain, `saveStamp`, `others`, `handleRequestClose`, and the
        head comment's "No footer is built: it is Story 4.20's surface".
  - [x] `packages/domain/src/usageIndex.ts` and `ruleReferenceIndex.ts` head comments — the
        rules-vs-organisms split (AC5) and the `placedOnLiveGrid` / erase-window hazard are stated
        there and must not be re-derived.
  - [x] `apps/web/components/organisms/OrganismInUseDialog.tsx:27-42` (the copy helpers you move)
        and `OrganismLibrary.tsx:239-263, :416-421` (where `summaries`, `usage` and the 4.17 count
        live).
  - [x] `apps/web/components/organisms/editor/fieldStyles.ts` — the `styled()` + `--gol-*` house
        style every editor control follows; and `ColorPickerField.tsx` for the biggest existing
        `styled()` subtree in this folder.
  - [x] The mockup: `clinical-lab-theme/organism-editor.html:325-390` (`.footer-usage-note`,
        `.usage-popover`), `:818-828` (`.editor-footer`), `:1222-1235` (the markup).
  - [x] Re-read FD1–FD14 below.

- [x] **Task 2 — `apps/web/lib/organisms/usageLabels.ts` + its test (AC: 2, 5, 7).**
  - [x] Move `battleCount` / `battleCountLabel` / `organismInUseMessage` here verbatim from
        `OrganismInUseDialog.tsx`; update that file and `OrganismInUseDialog.test.tsx` to import
        them. No behaviour change, no re-wording — the existing assertions
        (`OrganismInUseDialog.test.tsx:62-65`) must pass untouched.
  - [x] Add `ruleTargetCountLabel(m: number): string` → `Targeted by 1 organism rule` /
        `Targeted by 2 organism rules`.
  - [x] Add `usageBattleNames(entries: readonly OrganismUsageEntry[], summaries): readonly string[]`
        — each entry's `battleId` resolved through a `Map` built from `summaries` and passed through
        `battleDisplayName`; `battleId === null` → `'Current Battle (unsaved)'` (FD9). Order is the
        entry order `resolveOrganismUsage` returns.
  - [x] Add `referencingOrganismNames(ids: readonly string[], library): readonly string[]` — each id
        resolved against `library` and passed through the `Unnamed organism` fallback.
  - [x] Unit tests for every branch including the `null` battleId, an empty/invisible battle name,
        an empty organism name, and the singular/plural boundary at 1 for both labels.

- [x] **Task 3 — `<UsageIndicator>` (AC: 2, 3, 4).**
  - [x] New `apps/web/components/organisms/editor/UsageIndicator.tsx`, props:
        `battleNames: readonly string[]`, `ruleCount: number`, `referencingNames: readonly string[]`.
        It renders labels and panels; it derives nothing and imports nothing from `@gol/domain`
        (FD11 — the derivations are the modal's, the presentation is this component's).
  - [x] Two independent disclosures (FD12), each: `<button type="button" aria-expanded aria-controls>`
        + a `styled('div')` panel with a `<p>` section title and a `<ul>`/`<li>` name list. Mockup
        styling: `.footer-usage-note` (11px, uppercase, `--gol-text-secondary`, the count in
        `--gol-accent`), `.usage-popover` (absolute, `bottom: 150%`, `min-width: 200px`,
        `--gol-bg-hover` background, `--gol-border`). Tokens only — the AR-46 no-raw-hex rule is
        active on `apps/web`. **Deviation, recorded (Completion Notes, `deferred-work.md`):** the
        accent lands on the `▾` caret, not the digits — the label is one exported string (AC5), so
        there is no element around the count to colour.
  - [x] Zero count → plain text, no `<button>`, no `aria-expanded`, no panel (AC3).
  - [x] Opening one panel closes the other.
  - [x] ⚠️ **Escape handling (FD4).** ~~An `onKeyDown` on the footer root~~ **A `document`
        capture-phase `keydown` listener, armed only while a panel is open** (review 2026-09-23 —
        a footer-scoped handler misses a keydown whose target is outside the footer: Tab-away, or
        a Safari click on the trigger): when the key is `Escape`, close the panel, call
        `event.stopPropagation()` and return focus to the opener — MUI's `Modal` listens on the
        modal root, so without the stop the editor itself closes. Cover it in a unit test that
        asserts the editor `onClose` prop was NOT called.
  - [x] Outside dismissal: a `document` `pointerdown` listener, added only while a panel is open,
        that ignores events inside the footer root (`ref.current.contains(event.target)`). Removed
        in the effect's cleanup.
  - [x] Focus stays on the trigger (no `autoFocus` into the panel — nothing in it is interactive);
        after Escape, focus is on the trigger. ⚠️ **Amended 2026-09-24** (decision D1): an outside
        dismissal is NOT a focus-restoring path — focus follows the press.
  - [x] **(2026-09-24, decision D5)** A held Escape closes ONE layer: `swallowRepeatsUntilKeyUp()`
        arms a `document` capture `keydown` that stops every Escape carrying `repeat`, plus a
        one-shot capture `keyup` that disarms both; unmount is the other disarm path. The panel
        listener itself ignores a `repeat` keydown (third review). Pinned by modal test 56 with a
        SYNTHETIC repeat event — dispatched on the focused trigger, not `document` as the decision's
        letter said, because an event whose target is `document` never reaches React's root
        container in the jsdom harness and the assertion would be vacuous; mutation-checked.
  - [x] **(2026-09-24, decision D2)** The name list — not `Panel` — is the scroll region:
        `maxHeight: min(60vh, 400px)`, `overflowY: auto`, `tabIndex={0}` and
        `aria-labelledby` → `PanelTitle` for its accessible name (axe's
        `scrollable-region-focusable`). Capping the list rather than the panel keeps the section
        title pinned above it.
  - [x] **(2026-09-24, decision D2)** `NameItem` truncates to one line (`whiteSpace: nowrap`,
        `overflow: hidden`, `textOverflow: ellipsis`) and `Panel` gains a `maxWidth` — a wrapped
        name would inflate the very height the cap bounds. The DOM keeps the full text.
  - [x] `data-usage-battles` / `data-usage-rules` hooks on the two triggers and
        `data-usage-battles-panel` / `data-usage-rules-panel` on the panels, the house `data-*`
        convention the e2e and unit tests query by.

- [x] **Task 4 — Wire it into the modal (AC: 1, 5, 6, 8).**
  - [x] Add `battleSummaries` to `OrganismEditorModalProps` with the AR-2/AR-27 comment (AC6) —
        beside `library`, not in `OrganismEditorLifecycleProps` (that interface is the hook's half
        and the hook has no battle list).
  - [x] `const subjectId = organism?.id ?? saveStamp?.id ?? null;` (FD7).
  - [x] `useMemo` the two indexes on their inputs — `buildUsageIndex(battleSummaries)` and
        `buildRuleReferenceIndex(library)` — at THIS call site (RFC-005 Decision 8; the domain
        package memoizes nothing, deliberately).
  - [x] Counts: `resolveOrganismUsage(usageIndex, subjectId)` when `subjectId !== null`, else `[]`;
        `M = ruleIndex.get(subjectId)?.length ?? 0`; names via Task 2's helpers. ⚠️ Pass `library`,
        not `others`, to `referencingOrganismNames` — `others` exists to keep an organism from
        warning about its own colour and from targeting itself in the dropdown, and using it here
        would drop a legitimate name whenever the referencing organism IS the one being resolved.
        (Self-references are already excluded inside `buildRuleReferenceIndex`, Decision E.5 — do
        not filter them a second time.)
  - [x] Render a `styled('footer')` after `<EditorBody>` holding `<UsageIndicator>`; extend the
        modal's head comment where it currently says "No footer is built: it is Story 4.20's
        surface", and keep FD1's Save/name divergence note intact.
  - [x] `OrganismEditorModal.test.tsx`: counts in create mode (0/0, no expansion), an edit session
        on a placed organism (label, panel, names), `M > 0` rendering the second label and `M === 0`
        rendering neither label nor panel, the two-rules-one-organism case (M = 2, one name), and
        the Escape case from Task 3.

- [x] **Task 5 — `<OrganismLibrary>` (AC: 5, 6).**
  - [x] Pass `battleSummaries={summaries}` to `<OrganismEditorModal>`, beside the existing
        `library={sorted}` / `organisms={organisms}` — the SAME settled array the usage index is
        built from, so both surfaces read one source.
  - [x] Switch `onRequestEdit` (`:419`) from `usage.get(organism.id)?.length ?? 0` to
        `resolveOrganismUsage(usage, organism.id).length`, with a comment naming FD8: one derivation
        for the warning, the footer and (Story 4.21) the delete block, and one argument for Story
        4.24 to add.
  - [x] `OrganismLibrary.test.tsx`: the existing 4.17 warning assertions still pass; add one that
        the modal receives the summaries.

- [x] **Task 6 — e2e (AC: 3, 4).**
  - [x] Extend `apps/web/e2e/organisms.spec.ts` (its `seedExtraOrganisms` init-script layering is
        already there — do NOT add a sixth copy of `buildSeedPayload`; seed a battle that places a
        library organism through the existing helper).
  - [x] Cover: the footer renders with the editor; a placed organism's label opens a panel naming
        the seeded battle; Escape closes the panel and the editor is STILL open; a second Escape
        closes the editor; an unused organism's label is not a button; zero console errors.
  - [x] One axe scan with a panel open and settled, following the block's existing
        settle convention (`:452-470` — a 300 ms wait, then `new AxeBuilder({ page }).analyze()`; there is no
        `disableRules` in this spec).

- [x] **Task 7 — Re-point the five `deferred-work.md` entries that name this story (AC: 9).**
  - [x] `:2431` (the `[N]` is plain text; "will need `battles` on the modal too") — record the
        **footer half as closed by this story**, with the prop's name. ⚠️ **Corrected 2026-09-24**
        (decision D3): the entry is NOT struck through as done — FR-1.3's expandable count on
        `<OrganismInUseDialog>` (`prd.md:125`, FR-1.7, M7) is still open and now stands on
        Story 4.24.
  - [x] `:743-755` (the card's rules-preview sentence) and `:775-788` (the card's stat-cell
        semantics) — annotate in place: Story 4.20 is the editor FOOTER, not the card; re-point at
        the next story that reshapes `<OrganismCard>` (4.21/4.22 add its Delete action).
  - [x] `:2493-2503` (focus lost after renaming an organism out of the active search filter) —
        annotate: 4.20 touches the Library for one prop and one call site and does not reach the
        focus-restore path; it stands on **Story 4.23**, the entry's own alternative.
  - [x] `:791-808` (the header/footer three-way divergence) — annotate with what this story
        actually built: the footer exists and holds the usage indicator only; Save and the name did
        not move; the UX reconciliation is still the next UX touch's.
  - [x] Add this story's own deferrals, including the unreachable-until-4.24
        `'Current Battle (unsaved)'` branch (FD9) and FD12's divergence from the UX doc's
        single-popover phrasing.

- [x] **Task 8 — Gates (AC: 10).**
  - [x] `npm run ci:dev` from the worktree root; paste the real exit code. Never `npm run ci`
        (the four-browser matrix is CI's job), never a piped invocation (`| tail` reports tail's
        status, which masked a real `format:check` failure once already).
  - [x] Report the `/organisms` gzip figure the bundle stage prints against the 305 KB entry. Do not
        edit `scripts/check-bundle-size.mjs`.
  - [x] Record every command and its real output summary in the Dev Agent Record.

### Review Findings

Reviewed on **Fable** against an **Opus** implementation (2026-09-23), via three parallel adversarial
layers (Blind Hunter, Edge Case Hunter, Acceptance Auditor) plus a local WebKit run of the new e2e
block. 6 `patch`, 2 `decision-needed`, 0 `defer`, 10 dismissed.

- [x] [Review][Decision] **Focus after an outside dismissal, and a panel left open by Tab** — AC4
      pins "focus stays on / returns to the trigger that opened it" and Task 3 says "after Escape
      or an outside dismissal, focus is on the trigger". Escape now returns focus to the opener on
      every path (patched below), but an outside `pointerdown` only closes the panel: focus follows
      the click (the field the user pressed, or the Dialog paper via its `tabIndex=-1`), and the
      component's own comment ("return[s] to it for free") was wrong about that. Forcing focus back
      to the trigger on `pointerdown` would be overridden by the click's own `mousedown` focus and,
      where it won, would steal focus from a field the user deliberately clicked. Sibling case:
      Tab/Shift+Tab away from an open panel leaves it open over the body (no `focusout` close);
      Escape from there now closes the panel, not the editor. Options: **(a)** keep pointer
      semantics — focus follows the click — and amend the Task 3 bullet to "after Escape"; **(b)**
      restore focus to the trigger on outside dismissal only when the press landed on nothing
      focusable (the paper), via a `click`-phase restore; **(c)** additionally close the panel on
      `focusout` leaving the footer (`relatedTarget` outside `rootRef`). (a) is what ships today.
      **Owner's decision (2026-09-24): (a).** Keep pointer semantics — focus follows the click.
      No code change is needed for the behaviour itself; the spec moves instead. Amend the Task 3
      bullet and AC4's focus clause to read "after Escape, focus is on the trigger", and delete the
      component comment's claim that an outside dismissal returns focus to it "for free". The
      Tab-away sibling case is accepted as it stands: the panel stays open, and Escape from there
      closes the panel, not the editor.
- [x] [Review][Decision] **A long name list opens past the top of the viewport** — `Panel` is
      `position: absolute; bottom: 150%` with no `maxHeight`/`overflow`. An organism placed in
      more battles than fit between the footer and the viewport top (~25–30 rows at 12px + 4px
      padding on a 720px-tall window) has its first names clipped and unreachable — nothing in the
      panel is focusable or scrollable, and neither `toBeVisible` nor axe sees clipping. Options:
      **(a)** `maxHeight: min(60vh, 400px); overflowY: auto` and make the panel a focusable
      scroll region (`tabIndex={0}` + accessible name) — axe's `scrollable-region-focusable`
      requires it, which contradicts AC3's "nothing inside either panel is focusable"; **(b)** cap
      the list at N rows and render "… and K more" as the last item, keeping the panel static;
      **(c)** accept — the workspace library is uncapped but a single organism in 30+ battles is
      outside the MVP's expected scale; record it. `[apps/web/components/organisms/editor/UsageIndicator.tsx:Panel]`
      **Owner's decision (2026-09-24): (a), plus per-row truncation.** Two changes, one on each
      axis — the row count and the row width:
      1. **Cap and scroll (the vertical fix).** `maxHeight: min(60vh, 400px); overflowY: auto` on
         the scrolling element, made a focusable scroll region (`tabIndex={0}` plus an accessible
         name), because axe's `scrollable-region-focusable` requires exactly that. **AC3 is
         amended**: its "nothing inside either panel is focusable" bullet becomes "the panel's
         scroll region is focusable (`tabIndex={0}`, accessible name); nothing inside it is
         interactive — no link, nothing navigates, nothing writes". The FR-1.7 / M7 reason for the
         original bullet was *navigation away from an unsaved battle*, which a scroll container
         cannot do, so the amendment keeps the constraint that actually mattered and drops only the
         part that blocked reaching the names.
      2. **Truncate each name to one line (the horizontal fix).** Replace `NameItem`'s
         `overflowWrap: 'anywhere'` with `whiteSpace: nowrap; overflow: hidden; textOverflow:
         ellipsis` and give `Panel` a `maxWidth`, so one long battle name no longer wraps across
         two or three rows and inflate the height the cap above is bounding. The DOM keeps the full
         text, so a screen reader still reads the whole name — the truncation is visual only. Note
         the CSS renders a single-character `…` rather than two periods; that is the browser's
         ellipsis and the house behaviour, not a deviation worth a literal `..`.
      Both parts need the existing "nothing focusable" assertions updated (the unit tests and the
      Chromium axe scan), and axe must come back clean with a panel open at 1 row and at 40 rows.
      The capture-phase Escape handler already covers a keydown raised inside the scroll region.
- [x] [Review][Patch] **Escape closes the EDITOR whenever focus is outside the footer — the FD4
      failure on two reachable paths** [apps/web/components/organisms/editor/UsageIndicator.tsx:handleKeyDown]
      — the Escape handler was a React `onKeyDown` on the footer `Row`, so it only saw a `keydown`
      whose target was inside the footer. (1) **Safari/WebKit (Mac port): a mouse click does not
      focus a `<button>`** (`HTMLFormControlElement::isMouseFocusable` is `false` off GTK/WPE), so
      focus stays on the Dialog paper and the first Escape closes the editor with the panel still
      open. **Reproduced locally**: `npx playwright test --project=webkit -g "usage visibility
      footer"` → tests 2 and 3 fail (`toBeFocused` "inactive"; dialog gone after the first
      Escape). CI's WebKit is the GTK port, which DOES focus buttons on click, so the matrix would
      have stayed green while real Safari users lost drafts. (2) **Any engine**: a click inside the
      open panel (allowed, keeps it open) lands focus on the Dialog paper (`tabIndex=-1`); the next
      Escape targets the paper, bypasses the Row and hits `useModal`'s root handler →
      `handleRequestClose` → draft gone (no dirty guard until Story 4.23). Fix: the Escape listener
      is a `document` **capture-phase** `keydown`, armed only while a panel is open (the same shape
      as the `pointerdown` dismissal), which `stopPropagation`s before the event reaches React's
      root and therefore before MUI's Modal handler; it also returns focus to the trigger that
      opened the panel. Opening a panel now `focus()`es its trigger explicitly so "focus is on the
      trigger while open" is an engine-independent fact. Pinned by two new `UsageIndicator` tests
      (`fireEvent.click` — no focus side effect, the Safari shape; and focus moved to a
      `tabIndex=-1` ancestor, the paper shape), modal test 54 (panel click → Escape → editor still
      open, `onClose` not called, focus back on the trigger) and e2e test 3, which now clicks
      inside the panel before the first Escape.
- [x] [Review][Patch] **e2e test 3 could pass with `stopPropagation` deleted** [apps/web/e2e/organisms.spec.ts:test 3]
      — after the first Escape it asserted `toBeVisible()` immediately; a closing MUI Dialog is
      still in the DOM for its ~195 ms fade (opacity does not affect Playwright visibility), so a
      regression that closed both panel and editor passed the "editor still open" check. The
      assertion now waits out the fade window (the block's 300 ms settle convention) before
      asserting the dialog is still there.
- [x] [Review][Patch] **`aria-controls` dropped on the collapsed state on a false premise**
      [apps/web/components/organisms/editor/UsageIndicator.tsx:disclosure] — AC3 and Task 3 say the
      trigger carries `aria-expanded` AND `aria-controls`; the code set `aria-controls` only while
      open, justified (in the comment, the unit test and the Dev Agent Record) by "a reference to an
      absent id is what axe flags on the collapsed state". axe-core 4.12.1's `aria-valid-attr-value`
      pre-check for `aria-controls` explicitly returns early when `aria-expanded="false"`
      (`axe.js:27133-27139`). `aria-controls` is now unconditional; a new axe assertion on the
      collapsed state pins the corrected claim.
- [x] [Review][Patch] **Console-error capture missing on the Escape/unmount and listener-removal
      paths** [apps/web/e2e/organisms.spec.ts:tests 3–4] — Task 6 lists "zero console errors", but
      only tests 1–2 collected `console.error`/`pageerror`; test 3 (Escape → close → unmount) and
      test 4 (document listener removal during a click) asserted nothing. Both now collect and
      assert `[]`, the block's inline convention.
- [x] [Review][Patch] **AC4's "footer is reachable by Tab after the three columns" pinned but never
      asserted** [apps/web/components/organisms/editor/OrganismEditorModal.test.tsx] — modal test 55
      focuses the last focusable control in `EditorBody` and tabs once, expecting the battles
      trigger.
- [x] [Review][Patch] **Claims the diff contradicts** — (1) modal comment and the new
      `deferred-work.md` entry say the rule-index memo "never hits" / "re-runs per render": the
      editor's own re-renders (every keystroke) keep the same `library` reference, so the memo
      hits; it re-runs only when `<OrganismLibrary>` re-renders (open/save/close) — reworded in
      both places [apps/web/components/organisms/editor/OrganismEditorModal.tsx, docs/implementation-artifacts/deferred-work.md].
      (2) The `deferred-work.md` closure note says "the dialog's own count now reads
      `resolveOrganismUsage`" — the dialog reads a number prop; `<OrganismLibrary>`'s
      `onRequestEdit` is what changed. (3) Dev Agent Record: "the only thing this story added to
      the eager graph is nothing at all" — `OrganismLibrary.tsx` (eager) newly imports
      `resolveOrganismUsage`; the module was already in the graph, the 297.5 KB figure stands.
      (4) Task 6 cites a `disableRules` convention at `:453-473` that does not exist in the spec
      (the convention is the 300 ms settle); Task 7 says "four" entries and lists five. (5)
      `usageLabels.test.ts` "resolves ids … in id order" passed one id — now two.

Dismissed (10): `<footer>`→`contentinfo` inside the dialog (AC1 names the element and
`EditorHeader` is already `styled('header')`, the Story 4.3 precedent); 24×24 target size (no
WCAG 2.2 / 2.5.8 requirement in the specs; the mockup's own 11px label); `<OrganismCard>` "left on
the raw map read" (the card derives no usage at all — its contract says so); rules panel overflow
at phone width (no project below 1024, NFR-3.1); dangling battle id → "Untitled Battle" (the
index and the name map are built from the SAME array in one render — unreachable by construction,
not by data); `pointerdown` on a disabled control not closing the panel (the next press anywhere
does); `ruleCount > 0` with empty names (impossible from the modal's one derivation); duplicate
summary ids (Story 5.11's corruption story); IME `isComposing` on Escape (nothing in the footer
accepts input); per-render `Map`/resolve cost (measured trivial, same class as `others`).

### Review Findings — second pass (2026-09-24)

Reviewed on **Fable** against an **Opus** implementation, after the owner's D1/D2 decisions landed
in `8f41abf`, via the same three parallel layers. 3 `decision-needed`, 4 `patch`, 2 `defer`,
3 dismissed. CI on `8f41abf`: **green** — quality and all four e2e projects. The `b330cdc` failure
was `BattlePage.test.tsx` "is restored to the pre-mount title on unmount" — a `main` race, not this
branch's: that commit changed one markdown file, and no BattlePage import reaches anything this
branch touched (verified against the run log and the import graph).

- [x] [Review][Decision] **FR-1.3's edit-warning `[N]` is still plain text, and the deferred entry
      that tracked it now reads as closed** — PRD FR-1.3's AC says the warning's "[N] Battle(s)"
      count "is expandable to reveal which Battles per FR-1.7"; FR-1.7 and M7 both name the edit
      warning as one of the three surfaces with the read-only click-through, and Story 4.17
      explicitly handed that click-through to 4.20 (`4-17-edit-organism-from-library.md:56-57`,
      `:836`). This story read the epic's "counts are consistent across all surfaces" as derivation
      + label only (AC5), and `<OrganismInUseDialog>`'s render is unchanged — `battleCountLabel(...)`
      as a plain `DialogTitle`, no names, no "Targeted by [M]". Yet `deferred-work.md:2431-2438`
      ("The `[N]` in 'Used in N Battles' is plain text — no battle names, no click-through") is
      struck through as **✅ Closed in Story 4.20**, and AC6 says "Closes `deferred-work.md:2420-2422`".
      The entry describes the DIALOG, which is exactly as it was — it must not read as done.
      Options: **(a)** implement the click-through on `<OrganismInUseDialog>` in this story
      (`<UsageIndicator>` + `usageLabels.ts` make it cheap; the dialog then takes the resolved
      names, or `battleSummaries`, and M as props); **(b)** re-point: un-strike the entry, reword
      its closure to "the FOOTER half closed in 4.20; the dialog's click-through stands on the next
      dialog touch" (4.24 already owns `Current Battle (unsaved)` on this surface, or a story of its
      own), and correct AC6's "Closes" claim and Task 7's first bullet; **(c)** accept the story's
      reading and amend PRD FR-1.3 / FR-1.7 / M7 to drop the edit-warning surface — a spec change
      outside this story. [apps/web/components/organisms/OrganismInUseDialog.tsx, docs/implementation-artifacts/deferred-work.md:2431]
      **Owner's decision (2026-09-24): (b), re-point and correct the claim.** The dialog's
      click-through is NOT implemented here — AC9's "nothing else moves" stands, and the diff stays
      honest. Do all four of these:
      1. **Un-strike `deferred-work.md:2431-2438`** and reword its closure so it says what actually
         happened: the FOOTER half closed in Story 4.20; the FR-1.3 edit-warning dialog's
         click-through is still open. The entry must not read as done.
      2. **Re-point it at Story 4.24** (`4-24-edit-organism-from-battle`), which already owns this
         dialog's `Current Battle (unsaved)` case and is the remaining epic-4 story that touches
         this surface. Name the PRD citation (`prd.md:125`, FR-1.7, M7) in the re-pointed entry so
         4.24 inherits the requirement rather than the rumour of it.
      3. **Correct AC6's "Closes `deferred-work.md:2420-2422`" claim** and Task 7's first bullet to
         claim only the footer disclosure.
      4. Leave `<OrganismInUseDialog>`'s render as it is. No new props, no `<UsageIndicator>`.
      The PRD requirement stays unmet — deliberately, and now visibly so rather than hidden behind
      a false tick.
- [x] [Review][Decision] **Escape from a control outside the footer pulls focus onto the trigger
      and swallows the key** — D1 accepted that Tab / Shift+Tab leaves the panel open and that
      Escape from there closes the panel, not the editor; it did not lay out where focus GOES. As
      written the capture listener runs `openerRef.current?.focus()` unconditionally, so a keyboard
      user who tabbed into the name field or a rule `<select>` (or opened a native `<select>` popup
      with Alt+Down — Firefox and WebKit dispatch the Escape keydown to the document while the popup
      is open) and pressed Escape loses their place — the objection D1 itself used to reject a
      restore on outside dismissal. `stopPropagation` in the capture phase also hides that keydown
      from every other document-level Escape consumer while a panel is open. Options: **(a)** keep —
      AC4 as amended says "after Escape, focus is on the trigger", and this is that, on every path;
      **(b)** restore focus to the trigger only when the keydown's target is inside `rootRef`, or is
      the Dialog paper / `body` (i.e. not a control the user chose) — still close the panel and still
      stop propagation; **(c)** close the panel on `focusout` leaving `rootRef` (the first review's
      option (c)), which makes the path unreachable. [apps/web/components/organisms/editor/UsageIndicator.tsx:handleKeyDown]
      **Owner's decision (2026-09-24): (a), keep.** Escape closes the panel and returns focus to
      the trigger on every path, as AC4 (amended) already says. This is **not** in tension with
      D1: the two dismissals are deliberately different, and the reason is the conventional one —
      a POINTER dismissal leaves focus where the user pointed, because they chose that spot;
      a KEYBOARD dismissal returns focus to the trigger, because a keyboard user needs a defined
      landing place and has not chosen one. Record that rationale next to the handler, so a later
      reader does not "fix" the asymmetry back into a contradiction. Add a `deferred-work.md` entry
      for the accepted cost: Escape from a control outside the footer moves the caret off that
      control, and option (b) (restore only when the target is inside `rootRef`, the paper or
      `body`) is the named revisit if it ever bites. No code change.
- [x] [Review][Decision] **A held Escape closes the panel and then the editor** — the first
      `keydown` closes the panel; React flushes and the effect cleanup removes the capture listener
      long before the key's auto-repeat (250–500 ms delay, then ~30 ms period), so the next repeated
      `keydown` "has no listener and falls through to the editor as it always has" (the comment's
      words) and, with no dirty guard until Story 4.23, takes the draft. MUI's `useModal` does not
      check `event.repeat` either. Neither `user.keyboard` nor `page.keyboard.press` sets `repeat`,
      so no test can see it. Options: **(a)** accept — a held Escape reads as "close everything",
      and 4.23's guard is the real protection for the draft; **(b)** after closing a panel, keep
      swallowing `event.repeat` keydowns until the matching `keyup` (a ref flag plus a one-shot
      `keyup` listener), so one press closes one layer. [apps/web/components/organisms/editor/UsageIndicator.tsx:handleKeyDown]
      **Owner's decision (2026-09-24): (b), swallow repeats until keyup.** After a panel closes,
      keep swallowing `keydown` events whose `event.repeat` is true until the matching `keyup`
      arrives — a ref flag plus a one-shot `keyup` listener. One press closes one layer: a held
      Escape closes the panel and stops there, and a second deliberate press closes the editor as
      it does today. The draft is the reason: there is no dirty guard until Story 4.23, so this
      path is destructive today and merely untidy after 4.23.
      Note the testability limit the review found: neither `user.keyboard` nor `page.keyboard.press`
      sets `repeat`, so no ordinary test can drive it. Pin it by **dispatching a synthetic
      `KeyboardEvent('keydown', { key: 'Escape', repeat: true })`** at the document and asserting
      the editor stays mounted — and say in a comment that the synthetic event is standing in for a
      real auto-repeat, so the test is not mistaken for a user-path test.
- [x] [Review][Patch] **D2 made a click inside the panel land focus INSIDE the footer, so the two
      tests that pin FD4's out-of-footer path against MUI's real root handler no longer do — and
      three comments plus two story passages still describe the old shape**
      [apps/web/components/organisms/editor/UsageIndicator.tsx:handleKeyDown, apps/web/e2e/organisms.spec.ts:test 3, apps/web/components/organisms/editor/OrganismEditorModal.test.tsx:test 54, apps/web/components/organisms/editor/UsageIndicator.test.tsx, docs/implementation-artifacts/4-20-usage-visibility-ui.md:FD3 + Task 3]
      — the `<li>` click now focuses the `tabIndex={0}` list, which is inside `rootRef`, so a
      regression to a footer-scoped `onKeyDown` would pass modal test 54 and e2e test 3 unchanged.
      Both now also move focus onto the Organism Name field (programmatically — a `pointerdown`
      would close the panel; this is the Tab-away path D1 accepted) before Escape; the unit
      pointerdown test pins D1's "focus stays where the press landed"; the Escape-effect comment,
      e2e test 3's comment, the unit test's comment, FD3 ("nothing in it is focusable") and Task 3's
      "an `onKeyDown` on the footer root" are corrected to the shipped design.
- [x] [Review][Patch] **e2e test 6 asserts the LIST's top is on screen while the record claims the
      PANEL's** [apps/web/e2e/organisms.spec.ts:test 6] — `PanelTitle` (10px + 8px margin) and the
      panel's 10px padding sit above the list; the assertion passes with the title clipped off the
      top of the viewport, the clipping D2 was raised for. The panel's own top is now asserted too.
- [x] [Review][Patch] **The index-in-key guard for duplicate display names is untested**
      [apps/web/components/organisms/editor/UsageIndicator.test.tsx] — deleting `-${index}` from
      `NameItem`'s key passes every suite: no fixture has two identical display names in one panel,
      and the only guard is the e2e clean-console gate over unique fillers. A unit test now renders
      two `Untitled Battle` rows with `console.error` spied.
- [x] [Review][Patch] **`N = 0, M > 0` — the case FD12 was written for — is rendered by no test**
      [apps/web/components/organisms/editor/UsageIndicator.test.tsx] — every rules-label case keeps
      `battleNames = NAMES`. A unit test now mounts `battleNames: []` with `ruleCount: 1`: plain
      text beside a working rules disclosure, Escape included.
- [x] [Review][Defer] **`openPanel` is never reconciled when the disclosure it names stops
      rendering** [apps/web/components/organisms/editor/UsageIndicator.tsx:openPanel] — deferred,
      unreachable until Story 4.24: `battleSummaries` and `library` are open-time snapshots, so no
      count changes while a panel is open today. With a live `openBattle` a count can drop to 0
      with its panel open: the panel unmounts but the capture Escape listener stays armed, and the
      next Escape is swallowed (no panel, editor stays open, `openerRef` points at a detached
      button) with no console error for the e2e gate to see. Not patched here: the obvious derived
      fix (void `openPanel` when its count is 0) reopens the panel spontaneously when the count
      returns, and an effect-based reset is the `react-hooks/set-state-in-effect` lint error
      `project-context.md` records — 4.24 owns the shape, with a live count to test it against.
- [x] [Review][Defer] **A saved-but-renamed open battle would list its stored name, not the one on
      screen** [apps/web/lib/organisms/usageLabels.ts:usageBattleNames] — deferred, unreachable
      until Story 4.24: the `battleId: null` path is handled (`UNSAVED_BATTLE_LABEL`), but a
      `battleId !== null` entry with `placedOnLiveGrid: true` resolves through `summaries` only,
      while RFC-005 Decision 8 labels the open battle from the live name. The signature grows an
      input in 4.24; the unit test pins only `entry(null, true)`.

Dismissed (3): `<footer>`→`contentinfo` inside the dialog (already dismissed 2026-09-23 on AC1 and
the `styled('header')` precedent; axe is clean with a panel open); truncated names with no sighted
reveal (already this story's own deferral in `deferred-work.md`, D2's follow-through); the
"exactly one `[tabindex]`" assertion running on the battles panel only (both panels come from the
one `disclosure()` helper, so it is a test of the helper).

### Review Findings — third pass (2026-09-24)

Reviewed on **Fable** against an **Opus** implementation, after the owner's D3/D4/D5 decisions landed
in `6d8615a` and the branch was synced with `main` in `45b2ce0` (#76, #77), via the same three
parallel layers. 0 `decision-needed`, 9 `patch`, 1 `defer`, 5 dismissed. CI on `45b2ce0`: **green** —
quality and all four e2e projects (run 36003099174). The sync's keep-both resolution of
`deferred-work.md` was diffed line-by-line against both parents: nothing from either side is missing
except ONE blank line (patched below), no conflict marker remains, and `main`'s only change under
`packages/domain` that this story reads is a comment-only edit to `ruleReferenceIndex.ts` — 5-4's
`organismClosure` is a new module beside it, so `resolveOrganismUsage` / `buildRuleReferenceIndex`
return exactly what they did. D5's mutation check was re-run here: with the
`swallowRepeatsUntilKeyUp()` call deleted, modal test 56 fails on `onClose` — the synthetic repeat
event is a real assertion, and its "dispatched on the trigger, not `document`" deviation is correct
(in the jsdom harness React's root container is RTL's `<div>` and, for the portal, `document.body`;
an event whose target is `document` reaches neither).

- [x] [Review][Patch] **A panel opened MID-HOLD is closed by the auto-repeat — one hold, two layers**
      [apps/web/components/organisms/editor/UsageIndicator.tsx:handleKeyDown] — the repeat guard
      protects the EDITOR, but the panel-close listener itself acted on any Escape keydown: hold
      Escape (panel A closes, guard armed), open panel B with Enter/Space during the hold, and the
      next repeat closes B too — the guard's `stopPropagation` does not suppress a sibling listener
      on the same node. `handleKeyDown` now stops propagation and then IGNORES a keydown carrying
      `repeat` (the panel stays, the editor stays; a deliberate press after release closes it), so
      D5's "one press closes one layer" holds for a panel opened during the hold as well. Pinned by
      a new `UsageIndicator` test (mutation-checked).
- [x] [Review][Patch] **Escape that cancels an IME composition closed the panel and moved focus
      mid-composition** [apps/web/components/organisms/editor/UsageIndicator.tsx:handleKeyDown] —
      the first review dismissed IME on the grounds that nothing in the footer accepts input, but D1
      accepted Tab-away with the panel open, so focus CAN be in the Organism Name field while a panel
      is up. Firefox and WebKit deliver the composition-cancelling Escape as `key: 'Escape'` with
      `isComposing` / `keyCode 229`; MUI's own root handler skips `which === 229`, this listener did
      not. It now mirrors MUI: a composing keydown is not ours and passes through untouched (MUI
      skips it too). Pinned by a new `UsageIndicator` test.
- [x] [Review][Patch] **The FD4 comment's ordering reason is a test-harness fact, not a production
      one** [apps/web/components/organisms/editor/UsageIndicator.tsx:handleKeyDown,
      apps/web/components/organisms/editor/OrganismEditorModal.test.tsx:test 56] — "capture on
      `document` runs before React's root listener on every path" is false in the App Router: Next
      calls `hydrateRoot(document)` (`next/dist/client/app-index.js:32,293`), so React's delegated
      capture AND bubble listeners live on `document`, registered before ours. What actually keeps
      the key from MUI is that `stopPropagation` from a document-capture listener cancels the BUBBLE
      phase, where `useModal`'s `onKeyDown` lives; an `onKeyDownCapture` consumer would still see
      it. The behaviour is correct; both comments now state the real mechanism.
- [x] [Review][Patch] **The guard's boundary is undocumented** [apps/web/components/organisms/editor/UsageIndicator.tsx:swallowRepeatsUntilKeyUp]
      — the keyup disarm is hygiene with no observable effect (a stale guard only ever stops
      `repeat` keydowns, and a fresh hold's first keydown is never one), so no test can pin it; and
      a platform that delivers auto-repeat as keyup/keydown pairs without `repeat` (classic X11
      without detectable auto-repeat, some remote-desktop bridges) is outside the guard entirely.
      The comment now says both rather than implying the hold is fully covered.
- [x] [Review][Patch] **`deferred-work.md` citations drifted off their entries — and FD9 quotes a
      sentence D3's rewrite deleted** [docs/implementation-artifacts/4-20-usage-visibility-ui.md:FD9,
      References, AC1, Task 7; docs/implementation-artifacts/deferred-work.md:2894,2903] — FD9 and
      the References still cited `:2420-2422` (now the struck 4.17 Clone & Edit entry) and FD9
      quoted "an unread prop is a lie", which the re-pointed entry no longer contains; this story's
      own annotations shifted the header/footer entry to `:791-808`, the stat-cell entry to
      `:775-788` and the focus-after-rename entry to `:2493-2503`, while Task 7 and AC1 kept the
      baseline numbers; the story's FD9 deferral entry cited `:2420` and its FD12 entry `:786`. All
      re-pointed to the current lines, and FD9's quote is marked as the entry's ORIGINAL wording.
- [x] [Review][Patch] **The modal's prop comment still says the story "closes" the FR-1.3 entry**
      [apps/web/components/organisms/editor/OrganismEditorModal.tsx:battleSummaries] — after D3
      the entry is open on its dialog half; the comment now claims the `battles`-on-the-modal half
      only and names Story 4.24 for the rest.
- [x] [Review][Patch] **D5's shipped behaviour and the accent-on-caret deviation have no AC/Task
      text** [docs/implementation-artifacts/4-20-usage-visibility-ui.md:AC4, Task 3] — D1 and D2
      each got an amendment bullet; D5 (a held Escape closes one layer; the test's synthetic repeat
      is dispatched on the trigger) lived only in the decision paragraph, the Completion Notes and
      the Change Log, and Task 3's ticked styling bullet still said "the count in `--gol-accent`"
      while the caret carries it. AC4 gains the held-Escape sentence; Task 3 gains a D5 bullet and
      the accent bullet carries its deviation note.
- [x] [Review][Patch] **`D1`–`D5` are cited as authority in production comments without naming
      where they resolve** [apps/web/components/organisms/editor/UsageIndicator.tsx:head comment] —
      the labels are numbered only inside this story file, which no comment named, and `spec:check`
      cannot validate them. One sentence in the component's head comment now points at the story
      file's Review Findings.
- [x] [Review][Patch] **The sync dropped the blank line before this story's first `deferred-work.md`
      section** [docs/implementation-artifacts/deferred-work.md:2886] — the keep-both resolution
      put `main`'s "5-4 round 2" section directly against `## Deferred from: Story
      4-20-usage-visibility-ui implementation`; `docs` is in `.prettierignore`, so no gate saw it.
      Restored.
- [x] [Review][Defer] **A second modal opened over the editor WITHOUT a pointerdown, with a panel
      open, has its Escape eaten by the panel's capture listener** [apps/web/components/organisms/editor/UsageIndicator.tsx:handleKeyDown]
      — deferred, unreachable until Story 4.23: every overlay path today is a click (✕, Back,
      pointerdown closes the panel first) or the editor's own Escape (which only reaches MUI once
      no panel is open), and the editor contains no keyboard-opened MUI overlay (native
      `<select>`s handle Escape themselves; the D4 entry records that class). 4.23's
      unsaved-changes confirm is the first surface that could open over the editor from a keyboard
      or programmatically while `openPanel !== null`; the Escape would then close the hidden panel
      and pull focus out of the confirm. Guard for 4.23: close the panel from `handleRequestClose`
      (or on the confirm's `open` transition) before the second modal mounts.

Dismissed (5): a dangling battle id rendering "Untitled Battle" rather than an "unknown" label
(already dismissed 2026-09-23 — index and name map come from the same array); stale `openPanel`
after its disclosure unmounts (already deferred to 4.24, second pass); the 2026-09-23 Change Log
saying "re-pointed or closed" (dated history — it was struck through that day, and the 2026-09-24
entry records the un-strike); modal test 56 sitting before 55 in the file (numbering is the story's,
order is cosmetic); `buildUsageIndex` run once at the Library and once at the modal per open
(already dismissed 2026-09-23 on the same measurement as `others`).


## Dev Notes

### Forced decisions

- **FD1 — The footer holds the usage indicator ONLY.** `organism-editor-design.md:101-126` and
  `epics.md:230` (UX-DR5) put Back / centred title / Save + Close in a HEADER; the 2026-06-01 mockup
  revision (`ORGANISM-EDITOR-UPDATES.md:9-20`) instead puts the name in the header, Back in the
  sidebar footer and Save in the editor footer beside this indicator. Story 4.3 followed the AC
  (spec-authority order) and recorded the divergence for the next UX touch. This story is the one
  that builds the footer and it does **not** resolve that conflict: moving Save would rewrite a
  shipped header, three e2e tests and the `SAVE_SX` mid-fade fix for a change no AC asks for.

- **FD2 — The footer spans the full editor width.** The mockup's `.editor-footer` comment says
  "only in main content area, not under sidebar" because the mockup has a left SIDEBAR with its own
  footer holding Back. This editor has no sidebar footer (Back is in the header, Story 4.3), so
  scoping the footer to the middle columns would put it under a column boundary that means nothing
  here. `flexShrink: 0` inside `Shell`, after `EditorBody` — the same chain `EditorHeader` sits at
  the top of.

- **FD3 — Plain disclosure, not MUI `Popover`.** Three reasons, in order of weight: (a) a MUI
  `Popover` is a `Modal`, so it nests a second focus trap and a second `aria-hidden` layer inside
  the fullScreen editor `Dialog` — the exact interaction class `project-context.md`'s live-region /
  `inert` rule records, and the panel needs neither (nothing in it is interactive — its one
  focusable node is the name list's scroll region, decision D2); (b) `apps/web` has
  no MUI overlay precedent outside `Dialog` and one `Tooltip`, and the editor's own controls are
  native `<select>`/`<input>` in `styled()` (RFC-003 Decision 3 puts static chrome in `styled()`);
  (c) it adds the MUI overlay stack to a chunk that does not carry it. The mockup's own
  implementation is a plain absolutely-positioned div.

- **FD4 — Escape must `stopPropagation`.** MUI's `Modal` attaches its Escape handler at the modal
  root, and this footer is inside that root, so an unstopped `keydown` closes the EDITOR — losing an
  unsaved draft to a key press whose only visible effect should be closing a names list. Nothing
  catches this: it typechecks, the panel does close, and only an assertion that the editor is still
  open sees it. (`disableEscapeKeyDown` was removed from `Modal` in MUI v9 — `<DeleteBattleDialog>`
  records the finding — so there is no prop-level alternative.)

- **FD5 — Outside dismissal is `pointerdown` on `document`, armed only while open.** The mockup
  uses a permanent `click` listener; a listener that exists whenever the editor is mounted is one
  more thing to unbind correctly on every close path. Ignore events inside the footer root, or the
  trigger's own press closes and immediately reopens.

- **FD6 — The copy helpers move to `lib/organisms/usageLabels.ts`.** `battleCountLabel` lives in
  `OrganismInUseDialog.tsx` today, which `<OrganismLibrary>` reaches only through `next/dynamic`
  precisely to keep the MUI `Dialog` stack out of `/organisms`'s first load. The editor importing a
  string from that module would staple the two lazy chunks together. A `lib/` module both import is
  the seam (`battleDisplayName.ts` moved out of `<BattleTile>` for the same reason).

- **FD7 — The counts are the open-time snapshot, and that is correct.** `library` and
  `battleSummaries` are the arrays `<OrganismLibrary>` had when the editor opened; the hook reloads
  only after close (Story 4.16, Task 11). Nothing can change either while the editor is up: battles
  are not editable from here, and the only organism this session writes is the subject itself —
  which, newly created, is in no battle and targeted by no rule. Do **not** add a reload, a
  repository read or a refresh effect to keep them live.

- **FD8 — One derivation, or the consistency AC is satisfied by coincidence.** `index.get(id)?.length`
  and `resolveOrganismUsage(index, id).length` return the same number today, for exactly as long as
  no caller passes an `openBattle`. Story 4.24 will pass one, and whichever surface was left on the
  raw map read starts disagreeing with the others at that moment — the failure the AC's "consistent
  across all surfaces" exists to prevent. Move the 4.17 call now, while the two are provably equal.

- **FD9 — No `openBattle` prop in this story.** The M7 live-grid union needs a live grid, and
  nothing that mounts this editor has one until Story 4.24 opens it over `<BattlePage>`. A prop
  that every caller passes as `undefined` is the unread prop this repo already refused once
  (`deferred-work.md:2431`, in that entry's ORIGINAL 2026-09-22 wording — "it is deliberately NOT
  passed there today — an unread prop is a lie" — since reworded by decision D3). The
  `battleId === null → 'Current Battle (unsaved)'` branch in `usageBattleNames` is a
  different thing: it is forced by `OrganismUsageEntry`'s own type, named by RFC-005 Decision 8, and
  lives in a unit-tested pure function rather than in a rendered affordance. Record it as
  unreachable-until-4.24 in `deferred-work.md`.

- **FD10 — Names go through the display helpers.** `BattleSummarySchema.name` and
  `OrganismSchema.name` both have no lower bound, so `''` parses and lists.
  `battleDisplayName('')` → `Untitled Battle` also strips the invisible-character class
  (`​`, the bidi controls, …) that `trim()` does not; `toDisplayOrganism` /
  `displayOrganisms.ts`'s `Unnamed organism` does the organism half. A raw name in an `<li>` is an
  empty list item that axe does not flag.

- **FD11 — The derivations live at the modal, the presentation in `<UsageIndicator>`.**
  `<UsageIndicator>` takes resolved `string[]`s and a number. It keeps the component testable
  without fixtures, and it keeps `@gol/domain` out of a file whose whole job is layout — the same
  split `<OrganismCard>`/`resolveDisplayOrganisms` already uses.

- **FD12 — Two independent disclosures, not one shared panel.** `organism-editor-design.md:120` says
  "the popover gains a second read-only section", which reads as one panel. Written that way, the
  `N = 0, M > 0` case needs a trigger that is text when one count is zero and a button when the
  other is not — the AC's "Used in 0 Battles renders without expansion" would then depend on a count
  it is not about. Two labels, each owning its own disclosure, makes that rule uniform and matches
  the AC's "a read-only popover lists the battle (**or** organism) names". Recorded as a deliberate
  divergence for the next UX touch; not a spec edit.

- **FD13 — `M` counts rules; the panel lists organisms.** `buildRuleReferenceIndex`'s value array is
  per RULE and `referencingOrganismIds` de-duplicates to organisms. One organism targeting this one
  from two rules is `M = 2` with ONE name in the panel. A test asserting `panel items === M` looks
  right and encodes the confusion the 4.19 module's head comment exists to prevent.

- **FD14 — Do not filter self-references again.** `ruleTargets` drops `selfId` at the source
  (Decision E.5 — deleting an organism deletes its own rules with it), so the subject can never
  appear among its own referencing organisms. A second filter in the UI is dead code that hides a
  regression if the domain rule ever changes.

### Project Structure Notes

- New files: `apps/web/components/organisms/editor/UsageIndicator.tsx` (+ `.test.tsx`),
  `apps/web/lib/organisms/usageLabels.ts` (+ `.test.ts`). Both land in folders that already hold
  their kind; camelCase for the non-component file, PascalCase `.tsx` for the component.
- Modified: `OrganismEditorModal.tsx`, `OrganismInUseDialog.tsx` (+ its test — imports only),
  `OrganismLibrary.tsx` (+ its test), `apps/web/e2e/organisms.spec.ts`,
  `docs/implementation-artifacts/deferred-work.md`.
- ❌ Nothing under `packages/*`. No `@gol/domain` barrel edit — every symbol this story needs is
  already exported (`packages/domain/src/index.ts:60-61, :72-73`). That is also why this story has
  no two-lane barrel collision with epic 5.
- `apps/web` has **no coverage gate** (deliberate counter-metric) — write the tests the ACs name,
  not tests to raise a number.
- The editor chunk is behind `next/dynamic`; the bundle gate measures `/organisms`'s first load, so
  a footer inside the lazy modal should not move it. Measure and report anyway — chunk splitting has
  surprised this gate before (`check-bundle-size.mjs`'s Story 2.14 note).

### References

- [Source: docs/planning-artifacts/epics.md#Story 4.20: Usage Visibility UI] (`:1227-1238`)
- [Source: docs/planning-artifacts/epics.md#UX-DR6] (`:231`) and FR-1.7 (`:39`)
- [Source: docs/planning-artifacts/architecture.md#M7] (`:353`) — read-only click-through, names
  only, no navigation; all surfaces consume the one usage index
- [Source: docs/planning-artifacts/architecture.md#Decision E.5] (`:234`) — rule references are
  first-class; FR-1.7 surfaces the referencing organism names
- [Source: docs/planning-artifacts/architecture.md#Decision H] (`:269`) — "used" = placed on
  `initialGrid`, one definition for the warning, the block and the footer list
- [Source: docs/planning-artifacts/ux-designs/ux-GameOfLife-2026-05-27/organism-editor-design.md]
  (`:120` the usage indicator; `:101-126` the header/footer layout)
- [Source: docs/planning-artifacts/ux-designs/ux-GameOfLife-2026-05-27/clinical-lab-theme/organism-editor.html]
  (`:325-390`, `:818-828`, `:1222-1235`)
- [Source: packages/domain/src/usageIndex.ts] — `resolveOrganismUsage`, `OrganismUsageEntry`
- [Source: packages/domain/src/ruleReferenceIndex.ts] — `buildRuleReferenceIndex`,
  `referencingOrganismIds`, and the rules-vs-organisms note
- [Source: docs/implementation-artifacts/4-19-usage-rule-reference-derivations.md#Acceptance Criteria]
  — AC2/AC3/AC4 pin the shapes this story renders
- [Source: docs/implementation-artifacts/deferred-work.md] (`:743-755`, `:775-788`, `:791-808`,
  `:2431-2452`, `:2493-2503` — current lines as of the 2026-09-24 third review; this story's own
  annotations moved the baseline's `:772`/`:786`/`:2420`/`:2463` starts)
- [Source: docs/project-context.md] — repositories injected not imported; one immutable theme +
  `--gol-*`; the live-region/`inert` trap; `npm run ci:dev` is the dev gate; the commit gate

## Dev Agent Record

### Agent Model Used

Claude Opus 5 (1M context) — `claude-opus-5[1m]`, the story file's `Dev Model: opus` call.

### Debug Log References

Every command run from the worktree root (`.claude/worktrees/lane-epic-4`), none piped:

| Command | Result |
|---|---|
| `npx vitest run lib/organisms/usageLabels.test.ts` (in `apps/web`) | 12 passed |
| `npx vitest run components/organisms/OrganismInUseDialog.test.tsx` | 13 passed — **unedited assertions**, proving Task 2 was a move |
| `npx vitest run components/organisms/editor/UsageIndicator.test.tsx` | 15 passed |
| `npx vitest run components/organisms/editor/OrganismEditorModal.test.tsx` | 95 passed (7 new) |
| `npx vitest run components/organisms/OrganismLibrary.test.tsx` | 57 passed (2 new) |
| `npx playwright test --project=chromium -g "usage visibility footer"` | 5 passed (18.8s), first run |
| `npm run ci:dev` (attempt 1) | **exit 1** — `format:check` on four new/edited test files only (no lint error, no test failure). Fixed with `npx prettier --write`. |
| `npm run ci:dev` (attempt 2) | **exit 0** (the real code, echoed from `$?`, not a pipe) |

`ci:dev` attempt 2 detail: typecheck 5/5 · lint 0 errors (1 pre-existing `BattleGallery.tsx`
`exhaustive-deps` warning, untouched) · format:check clean · spec:check clean · boundary:check clean
· coverage — `@gol/domain` 10 files, `@gol/simulation` 23, `@gol/persistence` 8, `@gol/test-utils` 6,
`web` **122 files / 2091 tests**, all green · build:standalone 5/5 · bundle:check all five routes
within budget · bench + bench:check **9.100 ms against the 16.667 ms budget** (45.4% headroom) ·
e2e Chromium **260 passed (1.8m)**.

**Bundle, AC10 (reported, not gated up):** `/organisms` first-load JS **297.5 KB gzip against its
305 KB budget — 7.5 KB headroom**, ✓ within budget. `scripts/check-bundle-size.mjs` was NOT edited.
The footer rides inside the `next/dynamic` editor chunk, which is why the first load barely moves;
the only thing this story added to the eager graph is one more named import from a module already
in it (`resolveOrganismUsage`, beside `buildUsageIndex`, in `OrganismLibrary.tsx`) — `usageLabels.ts`
is imported by the two lazy chunks only. (Other routes, unchanged by this story: home 333.8/340, battle
309.5/310, battle/new 309.2/310, settings 291.6/305.)

#### Review decisions D1/D2 (2026-09-24)

Every command run from the worktree root (`.claude/worktrees/lane-epic-4`), none piped:

| Command | Result |
|---|---|
| `npx vitest run components/organisms/editor/UsageIndicator.test.tsx components/organisms/editor/OrganismEditorModal.test.tsx` (in `apps/web`) | 114 passed (the amended "one focusable thing" assertion included) |
| `npx playwright test --project=chromium -g "usage visibility footer"` | **7 passed** (16.8s) — the 5 existing cases + the two new axe/cap cases |
| `npx playwright test --project=webkit --project=firefox -g "usage visibility footer"` | **14 passed** (35.3s) |
| `npm run ci:dev` | **exit 0** (echoed from `$?`, not a pipe) |

`ci:dev` detail: typecheck 5/5 · lint **0 errors** (the same single pre-existing
`BattleGallery.tsx:248` `exhaustive-deps` warning, untouched) · format:check clean · spec:check clean
· boundary:check clean · coverage — `web` **122 files / 2095 tests**, all packages green ·
build:standalone 5/5 · bundle:check all five routes within budget, `/organisms` **297.5 KB gzip /
305 KB — unchanged, 7.5 KB headroom** (`scripts/check-bundle-size.mjs` NOT edited) · bench
**8.982 ms frame against 16.667 ms** (46.1% headroom) · e2e Chromium **262 passed** (2.2m — 260 plus
the two new cases).

**axe, the decision's own gate:** clean with a panel open at **1 row** (e2e test 7 — Conway's
Classic, `Used in 1 Battle`) and at **40 rows** (e2e test 6 — 2 mock battles + 38 seeded fillers), on
all three local engines, plus the jsdom scans (`UsageIndicator`, modal test 53) which cover the
collapsed and 2-row states. No `disableRules`, no exceptions.

#### Review decisions D3/D4/D5 (2026-09-24)

Every command run from the worktree root (`.claude/worktrees/lane-epic-4`), none piped — `ci:dev` was
redirected to a file and its status read from `$?`, which is the real code, not a pipe's:

| Command | Result |
|---|---|
| `npx vitest run components/organisms/editor/OrganismEditorModal.test.tsx -t "held Escape"` (in `apps/web`) | **1 passed** — the new D5 case |
| the same case against the component with the `swallowRepeatsUntilKeyUp()` call deleted (mutation check) | **1 failed** — `onClose` called once by the synthetic repeat — then restored: the test sees the bug |
| `npx vitest run components/organisms/editor/UsageIndicator.test.tsx components/organisms/editor/OrganismEditorModal.test.tsx` | **117 passed** (116 + modal case 56) |
| `npx prettier --check` on the four touched files | clean before `ci:dev`, so no repeat of the first pass's `format:check` failure |
| `npm run ci:dev` | **exit 0** |
| `npx playwright test --project=chromium --project=webkit --project=firefox -g "usage visibility footer"` | **21 passed** (43.2s) — 7 cases x 3 engines, run because D5 touches key handling |

`ci:dev` detail: typecheck 5/5 · lint **0 errors** (the same single pre-existing
`BattleGallery.tsx:248` `exhaustive-deps` warning, untouched) · format:check clean · spec:check clean
(**273 ids** resolve) · boundary:check clean · coverage — `web` **122 files / 2098 tests**, all
packages green · build:standalone 5/5 · bundle:check all five routes within budget, `/organisms`
**297.5 KB gzip / 305 KB — unchanged, 7.5 KB headroom** (`scripts/check-bundle-size.mjs` NOT edited)
· bench **9.473 ms frame against 16.667 ms** (43.2% headroom) · e2e Chromium **262 passed** (2.3m).

### Completion Notes List

- **Task 2 — `lib/organisms/usageLabels.ts`.** `battleCount` / `battleCountLabel` /
  `organismInUseMessage` moved VERBATIM out of `OrganismInUseDialog.tsx` (FD6); that dialog and its
  test now import them, and the test's own assertions are byte-identical, which is the proof it was a
  move. Added `ruleTargetCountLabel`, `usageBattleNames` (entry order, `battleDisplayName`,
  `UNSAVED_BATTLE_LABEL` for `battleId === null`) and `referencingOrganismNames`. The latter resolves
  through `resolveDisplayOrganisms` rather than a second lookup — that module's own contract is that
  a second resolver is what must not be written (Story 2.9), and it already owns both the
  `Unnamed organism` and `Unknown organism` fallbacks.
- **Task 3 — `<UsageIndicator>`.** Two independent disclosures (FD12), each a real `<button>` with
  `aria-expanded` plus `aria-controls` (unconditional — review 2026-09-23: the first cut dropped it
  while collapsed on the claim that axe flags a reference to an absent id; axe's
  `aria-valid-attr-value` skips that check while `aria-expanded="false"`). Zero → `<span>`, no button,
  no panel. `openPanel` is ONE
  `'battles' | 'rules' | null` cell, so "at most one open" is the type's doing rather than two flags
  kept apart. Escape `stopPropagation` (FD4) and a `pointerdown` listener armed only while open (FD5).
  No `@gol/domain` import (FD11).
- **Task 4 — the modal.** New `battleSummaries` prop beside `library` (not on
  `OrganismEditorLifecycleProps` — that interface is the hook's half and the hook has no battle list).
  `subjectId = organism?.id ?? saveStamp?.id ?? null`; both indexes memoised at this call site;
  `resolveOrganismUsage(...)` for N, `ruleIndex.get(id)?.length ?? 0` for M, and `library` — never
  `others` — into `referencingOrganismNames` (FD14). A `styled('footer')` after `<EditorBody>`; the
  head comment's "No footer is built: it is Story 4.20's surface" is replaced by what was built, with
  FD1's Save/name divergence note left intact.
- **Task 5 — the Library.** `battleSummaries={summaries}` (the SAME settled array `usage` is built
  from) and the 4.17 warning count moved onto `resolveOrganismUsage(usage, organism.id).length` while
  the two are still provably equal (FD8).
- **AC8 verified without a special case:** a create session with a NON-empty battle list still reads
  "Used in 0 Battles" (modal test 47) — the zero is the derivation's answer over a `null` subject, not
  an absent input.
- **FD13 pinned both ways:** modal test 50 seeds ONE organism with TWO rules targeting the subject and
  asserts `M = 2` with a single name in the panel.
- **One deliberate deviation from the mockup, recorded in `deferred-work.md`:** `.footer-usage-note
  strong` paints the COUNT in `--gol-accent`; the label here is one exported string (AC5), so there is
  no element around the digits to colour without splitting the formatter's output at the call site.
  The accent moved to the `▾` caret; the hover underline is kept. `--gol-accent` is already gated
  ≥ 4.5:1 on all three backgrounds (`themeTokens.test.ts`), and the panel's shadow is
  `--gol-shadow-tooltip` because AR-46 bans the mockup's `rgba()` literal in a component.
- **`<footer>` inside the dialog is exposed as `contentinfo`** (the unit and e2e tests query it by
  that role) and axe is clean with a panel open in both jsdom and Chromium — the page's own landmarks
  are `inert`/`aria-hidden` behind the modal, so there is no duplicate-landmark finding.
- **No file under `packages/*` was touched** (AC9), hence no `@gol/domain` barrel edit and no two-lane
  collision with epic 5. `spec:check` passes on every ID written into a comment.

**Review decisions D1/D2 (2026-09-24), the owner's answers applied:**

- **D1 — focus after an outside dismissal: option (a), spec-only.** Pointer semantics are kept, so no
  behaviour changed. AC4's focus clause and the Task 3 bullet now read "after Escape, focus is on the
  trigger", each carrying an amendment note, and the component's own comment says the same instead of
  claiming an outside press restores focus. The Tab-away sibling case (the panel stays open; Escape
  from outside the footer still closes the panel, not the editor) is accepted and recorded in
  `deferred-work.md` together with the pointer-focus choice — the alternative, a `focusout` close, is
  a third dismissal path to keep correct on every close, for a panel that does nothing while open.
- **D2 — the long list: option (a) plus per-row truncation, both axes.** The **name list**, not
  `Panel`, is the scroll region: `maxHeight: min(60vh, 400px)`, `overflowY: auto`, `tabIndex={0}` and
  `aria-labelledby` → `PanelTitle`, so its accessible name is the section title already on screen
  rather than a second string to keep in sync. Capping the list rather than the whole panel keeps that
  title pinned above the scrolling names. `NameItem` lost `overflowWrap: 'anywhere'` for
  `whiteSpace: nowrap` + `overflow: hidden` + `textOverflow: ellipsis`, and `Panel` gained
  `maxWidth: 320px` — without a cap on the width a 100-character battle name
  (`MAX_BATTLE_NAME_LENGTH`) simply widens the panel and nothing truncates. The DOM keeps the full
  text, asserted in e2e test 6 (`textContent` equals the full name while `scrollWidth > clientWidth`),
  so the truncation is visual only.
- **AC3 is amended, not quietly reinterpreted:** "nothing inside either panel is focusable" became
  "the panel's scroll region is focusable (`tabIndex={0}`, accessible name); nothing inside it is
  interactive", with the reason stated in both the AC and the component — FR-1.7 / M7 is about
  NAVIGATING away from an unsaved battle, which a scroll container cannot do. The unit assertion moved
  with it: the panel holds no `a`/`button`/`input`/`select`/`textarea` and exactly ONE `[tabindex]`,
  which is the named list.
- **The 40-row fixture is built in the page, not cloned.** `seedFillerBattlesFor` (e2e) writes 38
  battles at the smallest editable preset with a single placed cell (~3 KB each) rather than copying a
  mock battle's 100x60 grid 38 times; the ids are deterministic UUIDs so a failure reproduces. The
  records satisfy the full `BattleSchema`, not only the `BattleSummarySchema` that `/organisms` reads
  — `organismIds` is exactly the placed set (Decision H.1).
- **What the new e2e cases measure that jsdom cannot:** that the region actually scrolls
  (`scrollHeight > clientHeight`), that the panel's top is still on screen
  (`getBoundingClientRect().top >= 0` — the clipping neither `toBeVisible` nor axe reports), that the
  region takes focus, and that a long row is clipped to one line (`scrollWidth > clientWidth`, height
  under 30px). All three engines agree.

**Review decisions D3/D4/D5 (2026-09-24), the owner's answers applied:**

- **D3 — FR-1.3's edit-warning click-through: option (b), re-point and correct the claim.**
  Documentation only. `<OrganismInUseDialog>` is untouched — no new props, no `<UsageIndicator>` —
  so AC9's "nothing else moves" stands and the diff stays honest. (1) `deferred-work.md:2431` is
  **un-struck**: the `~~…~~` and the `✅ Closed in Story 4.20` are gone, and the entry now says what
  happened — the FOOTER half closed in 4.20 (the `<UsageIndicator>` disclosures, and
  `battleSummaries` as the DATA answer to the entry's "will need `battles` on the modal too"), while
  the DIALOG's half is still open, with what that dialog renders today (a plain `DialogTitle`, no
  names, no "Targeted by [M]") spelled out. (2) It is **re-pointed at Story 4.24**
  (`4-24-edit-organism-from-battle`), which already owns this dialog's `Current Battle (unsaved)`
  case, and it carries the requirement's own citations so 4.24 inherits the requirement rather than
  the rumour of it: PRD FR-1.3's AC
  (`docs/planning-artifacts/prds/prd-GameOfLife-2026-05-26/prd.md:125`), FR-1.7 (`prd.md:155-159`)
  and Architecture M7. (3) AC6's "Closes `deferred-work.md:2420-2422`" and Task 7's first bullet now
  claim the **footer half only**, and carry the entry's real line number (`:2431`). **The PRD
  requirement stays unmet — deliberately, and now visibly rather than behind a false tick.**
- **D4 — Escape from a control outside the footer: option (a), keep.** No code change. The rationale
  is recorded next to the handler in `UsageIndicator.tsx`: a POINTER dismissal leaves focus where the
  press landed because the user chose that spot (D1); a KEYBOARD dismissal returns focus to the
  trigger because a keyboard user has chosen nothing and needs the one defined landing place AC4
  names. The two dismissals differ on purpose, and the comment says so, so a later reader does not
  "fix" the asymmetry back into a contradiction. The accepted cost — Escape from the name field, a
  rule `<select>` or a native select popup moves the caret off that control, and the capture-phase
  `stopPropagation` hides that keydown from any other document-level Escape consumer while a panel is
  open — is a new `deferred-work.md` entry naming option (b) (restore only when the target is inside
  `rootRef`, the Dialog paper or `body`) as the revisit.
- **D5 — a held Escape: option (b), swallow `event.repeat` until keyup.** The only code change of the
  three. When Escape closes a panel, `swallowRepeatsUntilKeyUp()` arms a `document` capture `keydown`
  listener that `stopPropagation`s every Escape keydown carrying `repeat`, plus a capture `keyup`
  that disarms both on the first Escape release; the ref holding that disarm IS the flag, and an
  unmount effect is the one close path that must always run it. They are armed imperatively rather
  than from an effect because the panel-open effect's cleanup fires at the exact moment the guard has
  to start. One press now closes one layer: a held Escape closes the panel and stops there, and a
  deliberate second press (`repeat === false`) closes the editor as it always did. A keyup lost to a
  focus change mid-hold leaves the guard armed harmlessly — it only ever stops keydowns that carry
  `repeat`, and those exist only inside a hold. The draft is the reason it is worth a guard at all:
  there is no dirty check until Story 4.23, so this path is destructive today.
- **How D5 is pinned, and the testability limit the review named.** Neither `user.keyboard` nor
  `page.keyboard.press` ever sets `repeat`, so no ordinary test can drive a real auto-repeat. Modal
  test **(56)** holds Escape (`{Escape>}` — keydown with no keyup), dispatches a **synthetic**
  `keydown` with `repeat: true`, asserts the dialog is still mounted and `onClose` was not called,
  then releases (`{/Escape}`) and presses Escape deliberately for the editor's own close. Its comment
  says the synthetic event stands in for the OS's second keydown ~250-500 ms into the hold, so the
  case is not mistaken for a user-path test. **One deviation from the decision's letter, with its
  reason in the comment:** the event is dispatched on the focused trigger, not on `document` — React
  19 delegates to the root CONTAINER, so an event dispatched at `document` never reaches MUI's
  `onKeyDown` at all and the assertion would pass with the guard deleted. Mutation-checked: with the
  `swallowRepeatsUntilKeyUp()` call removed the case fails on `onClose` having been called once.

### File List

New:

- `apps/web/lib/organisms/usageLabels.ts`
- `apps/web/lib/organisms/usageLabels.test.ts`
- `apps/web/components/organisms/editor/UsageIndicator.tsx`
- `apps/web/components/organisms/editor/UsageIndicator.test.tsx`

Modified:

- `apps/web/components/organisms/editor/OrganismEditorModal.tsx`
- `apps/web/components/organisms/editor/OrganismEditorModal.test.tsx`
- `apps/web/components/organisms/OrganismLibrary.tsx`
- `apps/web/components/organisms/OrganismLibrary.test.tsx`
- `apps/web/components/organisms/OrganismInUseDialog.tsx`
- `apps/web/components/organisms/OrganismInUseDialog.test.tsx`
- `apps/web/lib/organisms/useOrganismEditorModal.test.tsx` (the new required prop, `[]`)
- `apps/web/e2e/organisms.spec.ts`
- `docs/implementation-artifacts/deferred-work.md`
- `docs/implementation-artifacts/sprint-status.yaml`
- `docs/implementation-artifacts/4-20-usage-visibility-ui.md` (this file)

### Review Record (2026-09-23)

Reviewer: Claude Fable 5.1 (`claude-fable-5-1`), a different model from the implementation, via
`bmad-code-review` in `full` mode. Commands run from the worktree root, none piped:

| Command | Result |
|---|---|
| `npx playwright test --project=webkit -g "usage visibility footer"` (before patching) | **2 failed / 3 passed** — test 2 `toBeFocused` "inactive", test 3 editor gone after the first Escape (the FD4 failure on Safari) |
| `npx vitest run` on the four touched suites (after patching) | 183 passed (4 new: UsageIndicator ×2, modal 54–55) |
| the same four new tests against the UNPATCHED component | **4 failed**, then restored — the tests see the bug |
| `npx playwright test --project=chromium --project=webkit --project=firefox -g "usage visibility footer"` | **15 passed** (28.8s) |
| `npm run ci:dev` | **exit 0** — typecheck 5/5 · lint 0 errors (the pre-existing `BattleGallery.tsx` warning) · format/spec/boundary clean · coverage green (`web` 122 files) · `/organisms` **297.5 KB / 305 KB** (unchanged) · bench 8.215 ms / 16.667 ms · e2e Chromium **260 passed** (1.7m) |

CI has no run for this branch yet — the workflow triggers on `pull_request` only; the four-engine
matrix runs once the PR is opened. Note for that run: CI's WebKit is the GTK port, which focuses a
button on click, so it would NOT have caught the Safari path; the local Mac WebKit did.

### Review Record — second pass (2026-09-24)

Reviewer: Claude Fable 5.1 again, after the owner's D1/D2 decisions (`8f41abf`). Commands run from
the worktree root, none piped:

| Command | Result |
|---|---|
| `gh run view 35980974636` (CI on `8f41abf`, PR #75) | **success** — quality + e2e chromium / firefox / webkit / tablet |
| `gh run view 35845610726 --log-failed` (CI on `b330cdc`) | 1 failed / 2094 passed: `BattlePage.test.tsx` "is restored to the pre-mount title on unmount" — `b330cdc` touched one markdown file and `BattlePage.tsx` imports nothing this branch changed, so it is a `main` race, not this story's; **left alone here** |
| `npx vitest run` on `UsageIndicator.test.tsx` + `OrganismEditorModal.test.tsx` (after patching) | 116 passed (3 new: D1 pointer-focus, FD12 `N = 0, M > 0`, duplicate display names) |
| the duplicate-names test against `key={name}` (mutation check) | **1 failed**, then restored — the test sees the guard |
| `npx playwright test --project=chromium -g "usage visibility footer"` | 7 passed |
| `npx playwright test --project=webkit --project=firefox -g "usage visibility footer"` | 14 passed |
| `npx tsc --noEmit`, `npx eslint` on the four touched files, `npm run spec:check` | exit 0 / 0 errors / 273 ids resolve |

### Review Record — third pass (2026-09-24)

Reviewer: Claude Fable 5.1 again, after the owner's D3/D4/D5 decisions (`6d8615a`) and the `main`
sync (`45b2ce0`). Commands run from the worktree root, none piped:

| Command | Result |
|---|---|
| `gh run view 36003099174` (CI on `45b2ce0`, PR #75) | **success** — quality + e2e chromium / firefox / webkit / tablet |
| `git diff` of `deferred-work.md` against BOTH merge parents, `+`/`-` lines compared as sets | main's hunks and ours all present; exactly one blank line missing (patched); no marker |
| `git diff 6d8615a 45b2ce0 -- packages/domain/src/ruleReferenceIndex.ts` | comment-only; `usageIndex.ts` untouched — the derivations this story reads are unchanged by 5-4 |
| modal test 56 against the component with `swallowRepeatsUntilKeyUp()` deleted (D5 mutation check, re-run) | **1 failed** on `onClose` called once, then restored |
| `npx vitest run` on the six touched suites (before patching) | 234 passed |
| the two new `UsageIndicator` tests against the component with their guard line deleted (mutation checks) | **1 failed each** (`repeat`; `isComposing`/229), then restored |
| `npx vitest run` on `UsageIndicator.test.tsx` + `OrganismEditorModal.test.tsx` (after patching) | 119 passed (2 new) |
| `npx tsc --noEmit`, `npx eslint`, `npx prettier --check` on the four touched code files, `npm run spec:check` | exit 0 / 0 errors / clean / 273 ids resolve |
| `npx playwright test --project=chromium -g "usage visibility footer"` | 7 passed |

### Change Log

- 2026-09-23 — Story 4.20 implemented: the editor's first footer (`<UsageIndicator>`), the shared
  `usageLabels.ts` copy/name module, `battleSummaries` on the modal, the 4.17 count moved onto
  `resolveOrganismUsage`, 5 new e2e cases, and five `deferred-work.md` entries re-pointed or closed.
  `npm run ci:dev` exit 0. Status → review.
- 2026-09-23 — Code review (Fable): Escape handling moved to a `document` capture listener with
  focus return to the opener, triggers `focus()` themselves on open (Safari), `aria-controls`
  unconditional, e2e test 3 hardened (panel click + post-fade assertion) and error capture added to
  tests 3–4, modal tests 54–55, doc/comment accuracy fixes. Two `[Review][Decision]` items left for
  the owner (focus after outside dismissal; long-list panel height). `npm run ci:dev` exit 0.
  Status → in-progress.
- 2026-09-24 — Owner's review decisions resolved. **D1 (a), spec-only:** pointer semantics kept; AC4
  and the Task 3 bullet amended to "after Escape, focus is on the trigger"; the component comment
  corrected; the Tab-away and pointer-focus residue recorded in `deferred-work.md`. **D2 (a) plus
  per-row truncation:** the panel's name list is now a capped (`min(60vh, 400px)`), scrollable,
  focusable-and-named scroll region and each name truncates to one line, with **AC3 amended**
  accordingly and its "nothing focusable" assertion rewritten as "nothing interactive, exactly one
  `[tabindex]`". Two new e2e cases pin the cap, the scroll, the truncation and axe at 40 rows and at
  1 row on chromium / webkit / firefox. `npm run ci:dev` **exit 0**; `/organisms` 297.5 KB / 305 KB,
  unchanged. Status → review.
- 2026-09-24 — Second code review (Fable), after D1/D2. CI on `8f41abf` green on all four engines.
  4 patches applied: modal test 54 and e2e test 3 move focus OUT of the footer (onto the name
  field) before Escape, since D2's `tabIndex={0}` list made a panel click land inside it; the
  Escape-effect comment, e2e/unit test comments, FD3 and Task 3 corrected to the shipped design;
  e2e test 6 asserts the panel's top on screen, not only the list's; unit tests for D1's
  pointer-focus residue, FD12's `N = 0, M > 0`, and duplicate display names (mutation-checked).
  3 `[Review][Decision]` items left for the owner (the edit-warning click-through PRD FR-1.3 asks
  for and the closed deferred entry; Escape-from-a-field focus steal; held-Escape auto-repeat);
  2 deferred to 4.24. Status → in-progress.

- 2026-09-24 — Owner's second-pass review decisions resolved (D3/D4/D5). **D3 (b), docs only:** the
  `deferred-work.md` entry for FR-1.3's expandable `[N]` is un-struck, reworded to "the footer half
  closed in 4.20", and re-pointed at **Story 4.24** with its PRD FR-1.3 / FR-1.7 / M7 citations;
  AC6 and Task 7's first bullet now claim the footer disclosure only. `<OrganismInUseDialog>`'s
  render is unchanged, so the PRD requirement reads as open rather than falsely ticked.
  **D4 (a), keep:** the pointer-vs-keyboard focus asymmetry's rationale is recorded next to the
  handler, and its accepted cost (Escape from a control outside the footer moves the caret) is a new
  `deferred-work.md` entry naming option (b) as the revisit. **D5 (b):** a held Escape now closes ONE
  layer — `swallowRepeatsUntilKeyUp()` swallows Escape keydowns carrying `repeat` until the matching
  keyup — pinned by modal test (56) with a synthetic repeat event and mutation-checked.
  `npm run ci:dev` **exit 0**; the footer e2e block **21 passed** on chromium / webkit / firefox;
  `/organisms` 297.5 KB / 305 KB, unchanged. Status → review.
- 2026-09-24 — Third code review (Fable), after D3/D4/D5 and the `main` sync. CI on `45b2ce0`
  green on all four engines; the keep-both merge verified line-by-line; D5's mutation check
  re-run. 9 patches applied: the panel listener now ignores a `repeat` Escape (a panel opened
  mid-hold no longer closes with the hold) and passes a composing Escape through like MUI does,
  each with a mutation-checked unit test; the FD4 comment and test 56's comment state the real
  mechanism (bubble-phase cancellation, not listener order — React's root is `document` in the App
  Router); the guard's boundary is documented; drifted `deferred-work.md` citations re-pointed and
  FD9's quote marked as the entry's original wording; the modal's prop comment no longer "closes"
  the FR-1.3 entry; AC4 and Task 3 carry D5 and the accent-on-caret deviation; `D1`–`D5` are
  resolvable from the component; the sync's dropped blank line restored. 1 deferred to Story 4.23
  (a second modal opened without a pointerdown while a panel is open). 0 decisions left.
  Status → done.

Dev Model: opus   # first editor footer + first disclosure overlay in the app, and a prop contract 4.21/4.24 build on — pattern-setting, not pattern-following

Proposed lane gate: none   # apps/web-only; no packages/* or barrel edit, and no epic 5 story touches components/organisms/** or lib/organisms/**

---

This story was implemented with the 'Implement next story' skill with the following stats:

| Phase | Agent model | Agents | Active | Wall clock | Input | Output | Cache write | Cache read | Total tokens |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Step 0 — re-entry guard | — | 0 | 1m 26s | 1m 26s | 36 | 5,927 | 16,876 | 1,058,197 | 1,081,036 |
| Step 1 — create | opus-5 | 1 | 9m 44s | 9m 44s | 200 | 4,089 | 460,463 | 10,139,430 | 10,604,182 |
| Step 2 — implement | opus-5 | 1 | 22m 27s | 22m 27s | 288 | 5,016 | 428,502 | 20,491,488 | 20,925,294 |
| Step 3 — review + PR | fable-5-1 | 4 | 21m 13s | 21m 13s | 4,306 | 17,780 | 1,280,835 | 16,527,526 | 17,830,447 |
| _of which the orchestrator_ | opus-5 | — | — | — | 82 | 24,928 | 56,751 | 2,697,115 | 2,778,876 |
| **Total (create → PR ready)** | | 6 | **54m 50s** | 54m 50s | 4,830 | 32,812 | 2,186,676 | 48,216,641 | **50,440,959** |

Run started 2026-09-23 10:58 CEST; wall clock runs to the point the run stopped for the owner's review. No idle gaps were excluded; Active and Wall clock agree. (A gap counts as idle above 15 min.) Each phase row covers the phase agent, any agents it spawned, and the orchestrator's own turns in that window — the orchestrator row breaks its share out again, it is not additional. Cache reads dominate the token totals and are billed at a fraction of input rate, so read the Input and Output columns for effort and the total only as a ceiling. The orchestrator's final turn is still being written when these numbers are taken.
