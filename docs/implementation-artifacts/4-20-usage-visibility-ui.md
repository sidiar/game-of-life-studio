---
baseline_commit: e06da2e
---

# Story 4.20: Usage Visibility UI

Status: in-progress

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
   divergence Story 4.3 recorded (`deferred-work.md:786-800`, FD1) and it stays recorded, not
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
   - nothing inside either panel is focusable, nothing is a link, nothing navigates and nothing
     writes (FR-1.7, M7: the editor may be a modal over an in-progress battle, so navigation would
     abandon unsaved grid work);
   - at most one panel is open at a time.

4. **Escape closes the panel, not the editor.** ⚠️ With a panel open, Escape must close the panel
   and leave the editor mounted; a second Escape then closes the editor as it does today. MUI's
   `Modal` listens for Escape on the modal root, so a bubbling `keydown` reaches
   `handleRequestClose` and closes the WHOLE editor — the intuitive implementation passes every
   other bullet here and loses the user's draft (FD4). Also pinned: an outside pointerdown closes
   the open panel; focus stays on / returns to the trigger that opened it; the footer is reachable
   by Tab after the three columns; axe reports zero violations with a panel open.

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
   injected repository, and it is still only used for Save. Closes `deferred-work.md:2420-2422`
   ("Story 4.20 … will need `battles` on the modal too").

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
        active on `apps/web`.
  - [x] Zero count → plain text, no `<button>`, no `aria-expanded`, no panel (AC3).
  - [x] Opening one panel closes the other.
  - [x] ⚠️ **Escape handling (FD4).** An `onKeyDown` on the footer root: when a panel is open and
        the key is `Escape`, close it and call `event.stopPropagation()` — MUI's `Modal` listens on
        the modal root, so without the stop the editor itself closes. Cover it in a unit test that
        asserts the editor `onClose` prop was NOT called.
  - [x] Outside dismissal: a `document` `pointerdown` listener, added only while a panel is open,
        that ignores events inside the footer root (`ref.current.contains(event.target)`). Removed
        in the effect's cleanup.
  - [x] Focus stays on the trigger (no `autoFocus` into the panel — nothing in it is focusable);
        after Escape or an outside dismissal, focus is on the trigger.
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
  - [x] `:2420-2422` (battles on the modal) — mark **closed by this story** with the prop's name.
  - [x] `:743-752` (the card's rules-preview sentence) and `:772-782` (the card's stat-cell
        semantics) — annotate in place: Story 4.20 is the editor FOOTER, not the card; re-point at
        the next story that reshapes `<OrganismCard>` (4.21/4.22 add its Delete action).
  - [x] `:2463-2471` (focus lost after renaming an organism out of the active search filter) —
        annotate: 4.20 touches the Library for one prop and one call site and does not reach the
        focus-restore path; it stands on **Story 4.23**, the entry's own alternative.
  - [x] `:786-800` (the header/footer three-way divergence) — annotate with what this story
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

- [ ] [Review][Decision] **Focus after an outside dismissal, and a panel left open by Tab** — AC4
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
- [ ] [Review][Decision] **A long name list opens past the top of the viewport** — `Panel` is
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
  `inert` rule records, and the panel needs neither (nothing in it is focusable); (b) `apps/web` has
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
  (`deferred-work.md:2420-2422`: "it is deliberately NOT passed there today — an unread prop is a
  lie"). The `battleId === null → 'Current Battle (unsaved)'` branch in `usageBattleNames` is a
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
- [Source: docs/implementation-artifacts/deferred-work.md] (`:743-752`, `:772-782`, `:786-800`,
  `:2420-2422`, `:2463-2471`)
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
