---
baseline_commit: b4991b5f5fc843236bcc266f2eb8ed502174f11d
---

# Story 2.11: Battle Name & Dirty Tracking

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a user,
I want to name my battle and have the app know when I have unsaved work,
so that my collection stays organized and my changes are protected.

## Acceptance Criteria

Verbatim from `epics.md#Story 2.11: Battle Name & Dirty Tracking`, decomposed into the eight things
a reviewer can independently check. **AC6 is a `deferred-work.md` entry that names Story 2.11 as
owner** — inherited debt coming due, not extra scope. **AC7 is a Story 2.9 forced decision that
named this story as its trigger**, likewise.

1. **AC1 — The "Battle Name" sidebar section: an input, a live counter, a hard cap of 100.**
   The sidebar grows its SECOND section (mockup `petri-dish-lab-mode.html:703-707`,
   `.sidebar-section` #2, directly below Organisms): a text input pre-filled with the battle's
   stored name and a right-aligned character count reading **"N / 100"**, where N is the current
   value's length and updates on every keystroke. The input enforces `maxLength = 100`
   (FR-3.9; `BattleSchema.name` is `z.string().max(100)` — `battleSchema.ts:15,89`).
   ⚠️ **100, not the mockup's 50.** The mockup writes `maxlength="50"` and "13 / 50"; spec §9.10
   records that as superseded ("the 50-char cap belongs to **Organism** names, which the mockup
   likely borrowed"), and the 2026-07-16 readiness report re-confirms it (decision #4). The owning
   RFC wins.
   ⚠️ The cap is **imported, never re-typed** — see Task 2. A literal `100` in the component is a
   second source for a number `BattleSchema` already owns, and drift there is a save that throws
   `ZodError` from inside Story 2.13's write path.

2. **AC2 — The header title tracks the field live, and an empty name reads "Untitled Battle".**
   `<BattleHeader>`'s `<h1>` currently renders `battleDisplayName(draft.name)` — the STORED name.
   After this story it renders the live edited value: typing in the sidebar updates the header on
   the same paint, with no save, no blur and no debounce. Clearing the field (or leaving only
   whitespace — `battleDisplayName` trims) shows **"Untitled Battle"**.
   ⚠️ The header stays **display-only text** (spec §3.2: "no name editing" in the header). Do not
   turn the `<h1>` into an input, and do not add a second name control anywhere.

3. **AC3 — A name edit makes the battle dirty.** `isDirty` is a `<BattlePage>` state cell
   (spec §6: "`battleName`, `isDirty` | ephemeral | BattlePage"). The first keystroke flips it to
   true, and nothing in this story ever flips it back — clearing is Story 2.13's (a successful
   save) and Story 2.16's guard is its first real consumer.

4. **AC4 — Any grid commit makes the battle dirty, without destabilising the commit seam.**
   A click (2.5), a drag stroke (2.6), an erase (2.7) — and, when they land, Clear (2.15) and a
   confirmed resize (2.14) — all arrive at the ONE `onCommitGrid` seam, so wrapping that one
   function covers every present and future commit source. `<BattlePage>` currently passes
   `useUndoableGrid`'s `commit` straight through.
   ⚠️ **The wrapper's identity must be as stable as `commit`'s is.** `PetriDishCanvas`'s
   `EditDish` holds the commit handler in a closure its resize effect deliberately does not
   re-register (`BattlePage.tsx`'s own comment on `onCommitGrid`, and Story 2.5 trap 7). A wrapper
   rebuilt per render silently breaks that, and the symptom is a mid-stroke resize committing
   through a stale closure — not a test failure.
   ⚠️ **Undo is NOT wrapped, and this is deliberate** — see Dev Notes → *Undo and the dirty flag*.

5. **AC5 — `isDirty` starts false, is observable, and reaches no repository.**
   A freshly loaded `/battle?id=…` and a freshly seeded `/battle/new` are both **clean** — the
   seed adoption is not an edit. Nothing this story writes reaches `repositories.*`: there is no
   save path until 2.13, and `isDirty`/`battleName` are ephemeral (RFC-005 §1, spec §6).
   ⚠️ This story has **no UI consumer for `isDirty`** (SAVE is 2.13; the guard is 2.16), so it must
   be made observable without shipping a dead affordance — see forced decision 3.

6. **AC6 — Every battle no longer shares one browser-tab title.**
   (`deferred-work.md`:167, verbatim: "**Pick this up in Story 2.11**, which owns the battle name
   as an editable field and is the first story with a reason to care what the tab says.") Both
   battle pages are `'use client'`, so neither can export `metadata`; the root layout's static
   `title: 'Game of Life Studio'` is the only one, and `/battle?id=<any>`, `/battle/new`, the
   not-found body and the error body all render under it. After this story the tab title carries
   the battle's live display name, updates as the field is typed, and **is restored when the page
   unmounts** (see the trap in Dev Notes — a client navigation back to the Gallery may not rewrite
   the head on its own). The not-found and error bodies must not claim a battle name they do not
   have. Settle the entry in `deferred-work.md` with the evidence.

7. **AC7 — The sidebar-section shell stops being module-private.**
   Story 2.9's forced decision 5 recorded, verbatim: "built as a module-private styled pair NOW,
   exported only when a second consumer arrives. Stories 2.11 (Battle Name), 2.14 (Grid Info) and
   2.15 (Tools) each mount a section into this same shell". **This story is that second consumer**,
   so the promised call comes due: `SidebarSection` / `SidebarSectionTitle` either move to a shared
   home or become a `<SidebarSection title=…>` component (forced decision 2). Whichever, the second
   section renders in the mockup's order (**Organisms, then Battle Name**) with the mockup's 25px
   gap, and **heading order stays valid** — `BattleEditorView.tsx`'s own comment predicted "it would
   skip a level for no reason and trip axe's heading-order rule the moment 2.11 adds the second
   section", so this is the story where that prediction is tested rather than trusted.

8. **AC8 — Keyboard-operable, axe-clean, bundle re-measured.**
   The name input is reachable and operable by keyboard alone, has an accessible name, and its
   character counter is **associated with the input** rather than announced as a stray number or
   spammed as a live region on every keystroke (forced decision 4). `vitest-axe` on the rendered
   sidebar reports zero violations and the `/battle` + `/battle/new` Playwright axe scans stay at
   zero, including after typing. Report `bundle:check`'s measured gzip and headroom for all three
   routes. Story 2.10 left **`/battle` 299.4 KB (10.6 KB headroom)**, **`/battle/new` 299.3 KB
   (10.7 KB)** and **`/` 326.5 KB (3.5 KB)**; budgets are 310 / 310 / 330 KB. A budget is never
   raised unilaterally — if one is exceeded, **STOP and ask Sidiar**.

## Tasks / Subtasks

- [x] **Task 1 — Read before writing (all ACs)**
  - [x] `apps/web/components/battle/BattlePage.tsx` in full — the four early returns and the rule
        that **every hook precedes all of them**; the `newDraft` / `loadedDraft` / `draft` memo
        chain; `useUndoableGrid`'s `[{ value: grid, commit: commitGrid }, …]` destructure; the
        `<BattleHeader battleTitle={battleDisplayName(draft.name)} />` line; the `onCommitGrid`
        comment that already names this story ("❌ No `isDirty` here — Story 2.11 owns dirty
        tracking"); `data-mode={mode}` on `Root` (the precedent forced decision 3 leans on).
  - [x] `apps/web/components/battle/BattleEditorView.tsx` in full — the props interface and its
        "REST of the sidebar (`<BattleNameField>` 2.11 …)" note, `SidebarSection` /
        `SidebarSectionTitle` and Story 2.9 forced decision 5, `SidebarContent`'s `gap: 25px`, and
        the `Omit<BattleEditorViewProps, …>` list that keeps sidebar props out of `<EditorMain>`.
  - [x] `apps/web/components/battle/BattleHeader.tsx` — the `<h1>` `Title` (already carries
        `overflowWrap: 'anywhere'` + `minWidth: 0` *because* names cap at 100 with no space
        constraint) and its "In-place renaming is `<BattleNameField>` in the sidebar (Story 2.11)"
        comment.
  - [x] `apps/web/lib/battleDisplayName.ts` — the whole file. It already trims, already returns
        title-case "Untitled Battle", and is already the third consumer's shared home. ❌ Do not
        write a second fallback.
  - [x] `apps/web/lib/useUndoableGrid.ts` — specifically the `state.seed !== seed` in-render
        adjust and its comment. **That is the pattern AC1's pre-fill has to reuse** (Task 3).
  - [x] `apps/web/components/battle/OrganismRoster.tsx` `SearchInput` — the house style for a
        styled `<input>` in this sidebar (`--gol-border-control` and the SC 1.4.11 reason,
        `2px solid var(--gol-accent)` focus-visible, enumerated transitions, reduced-motion escape).
  - [x] `apps/web/components/battle/EditorStatusBar.tsx` — the `type="button"` comment that names
        this story's field by name ("a bare `<button>` inside a future `<form>`"). See forced
        decision 5.
  - [x] `packages/domain/src/battleSchema.ts` (both `.max(100)` sites) and
        `packages/domain/src/index.ts` (the export surface Task 2 extends).
  - [x] `docs/implementation-artifacts/deferred-work.md` — the tab-title entry (~line 167, AC6's),
        and the mid-stroke-scroll entry (~line 237) which explicitly names "Story 2.11/2.14/2.15
        adding more sections" as making its precondition worse. ❌ **Do not fix that one here** —
        Story 2.14 owns it; annotate it and move on.
  - [x] `docs/planning-artifacts/component-tree-battle-page.md` §3.1, §3.2, §3.5, §6, §9.10.
  - [x] `docs/planning-artifacts/rfcs/RFC-005-application-state-modes-undo.md` Decision 7
        (lines 281-301) — **and read the Dev Notes conflict note before implementing to it.**
  - [x] The mockup: `.battle-name-input` / `.char-count` CSS (`petri-dish-lab-mode.html:381-403`)
        and the markup at `:703-707`.

- [x] **Task 2 — One source for the 100 (AC1)**
  - [x] Export a named cap from `@gol/domain` (suggest `MAX_BATTLE_NAME_LENGTH = 100` in
        `battleSchema.ts`, re-exported from `index.ts` beside `CURRENT_FORMAT_VERSION` — the
        established shape for a domain constant).
  - [x] Use it at **both** `.max(…)` sites in `battleSchema.ts` (`BattleSchema` and
        `BattleSummarySchema`) and in the new component's `maxLength` and counter.
  - [x] ❌ Do not re-declare `100` in `apps/web`, and ❌ do not put the constant in `apps/web` —
        the schema owns the cap, and the component is the borrower. This is the same
        "`MAX_ROSTER_SIZE` is imported, never re-declared" rule Story 2.10 applied
        (`refToFillGroup.ts`).
  - [x] `packages/domain` has no `dom` lib and must not gain one — a number needs none.

- [x] **Task 3 — `<BattlePage>`: `battleName`, `isDirty`, and the wrapped commit (AC2–AC5)**
  - [x] Add `battleName` as `<BattlePage>` state, **seeded from `draft.name` by the same in-render
        adjust `useUndoableGrid` uses** — not `useState(draft?.name ?? '')`. The battle resource
        settles AFTER the first render and every hook here precedes four early returns, so a plain
        initialiser captures `''`/`undefined` forever and leaves the field permanently empty for
        every saved battle. Compare the seed by VALUE (`draft?.name ?? null`) and record the
        residual honestly (Dev Notes → *Seeding the name*).
  - [x] Add `isDirty` as `<BattlePage>` state, initial `false`.
  - [x] `handleNameChange(name)` — `useCallback`, sets both the name and `isDirty`. Both setters
        fire in one handler, so React batches them into one commit.
  - [x] Wrap the commit seam: `handleCommitGrid = useCallback((next) => { commitGrid(next);
        setIsDirty(true); }, [commitGrid])`. ⚠️ `commitGrid` is stable by construction
        (`useUndoableGrid` returns a `useCallback` with `[]` deps) and `setIsDirty` is stable, so
        the wrapper is stable — **assert that**, because AC4's real risk is a churning identity,
        not a missing flag.
  - [x] ❌ Do **not** wrap `undo`. Dev Notes explains why; record the reasoning in the code as a
        WHY comment rather than leaving the asymmetry unexplained.
  - [x] Feed the header from the live value: `battleDisplayName(battleName)`, not `draft.name`.
  - [x] Make `isDirty` observable per forced decision 3.
  - [x] ❌ No repository call anywhere in this story. ❌ No debounce, no auto-save (FR-8.11 is
        Epic 6 and RFC-006 owns its trigger).

- [x] **Task 4 — `<BattleNameField>` (AC1, AC8)**
  - [x] New component `apps/web/components/battle/BattleNameField.tsx`, spec §3.5's interface
        exactly: `{ value: string; onChange(name: string): void; maxLength?: number }`. Fully
        controlled — it holds **no state of its own** (contrast `<OrganismRoster>`'s search text,
        which spec §6 does assign to the component).
  - [x] Styled primitives only, `SearchInput`'s house style. ❌ No `@mui/material/TextField`,
        `Input`, `FormControl` or `FormHelperText` — Story 2.9 won ~10 KB back by not spending it
        and Story 2.10 held the line (its forced decision 5); 3.5 KB of headroom on `/` is the
        budget this shares a chunk with.
  - [x] ❌ No raw hex — AR-46 is a live lint rule on `apps/web`. The mockup's `.char-count` uses
        `var(--text-tertiary)` → **`var(--gol-text-tertiary)`** (`#8a8a8a`, already raised from the
        UX spec's `#666666` in themes.css departure #1 precisely so small text clears 4.5:1 on all
        three backgrounds). ❌ No new token is needed. The mockup's input border is `var(--border)`
        → use **`--gol-border-control`**, the same SC 1.4.11 substitution `SearchInput` and
        `<BattleTile>`'s DeleteButton both record: `--gol-border` is decorative at 1.57:1, and this
        border is the input's ONLY boundary.
  - [x] Placeholder `"Untitled Battle"` per the mockup — and note it is a PLACEHOLDER, never a
        value (`newBattleDraft.ts` already records why: seeding the literal would make Story 2.13
        persist "Untitled Battle" as a real name and force the user to delete it first).
  - [x] Counter text: `${value.length} / ${maxLength}`. ⚠️ `value.length` — UTF-16 code units,
        which is what BOTH the DOM `maxLength` attribute and Zod's `.max()` count. `[...value].length`
        (code points) reads "nicer" for emoji and would disagree with both, so the counter would
        show 99 on a value the schema rejects.
  - [x] Accessibility per forced decision 4.
  - [x] ❌ No `<form>` element and no submit handler — forced decision 5.

- [x] **Task 5 — The sidebar section shell and the wiring (AC1, AC7)**
  - [x] Settle forced decision 2 and apply it: `SidebarSection` / `SidebarSectionTitle` shared, or
        a `<SidebarSection title=…>` component. Record which and why.
  - [x] Mount Battle Name as the second section of `<SidebarContent>`, after Organisms
        (mockup order: **Organisms · Battle Name · Grid Info · Tools · Back**; the last three are
        2.14/2.15/2.16 and stay absent).
  - [x] Thread `battleName` + `onNameChange` through `<BattleEditorView>`'s props, and **extend the
        `Omit<…>` list** so neither leaks into `<EditorMain>` — the same boundary the roster props
        respect.
  - [x] Verify the heading level: `SidebarSectionTitle` is an `<h2>` under the header's single
        `<h1>`, and two `<h2>` siblings is valid heading order. Assert it (axe's `heading-order`
        is the check `BattleEditorView.tsx`'s comment was written against).

- [x] **Task 6 — Settle the browser-tab-title entry (AC6)**
  - [x] Set `document.title` from `<BattlePage>`, in a `useEffect` declared **above all four early
        returns**.
  - [x] Handle the non-battle branches: `draft === null` (not-found / error) must not claim a name.
  - [x] **Restore the previous title in the effect's cleanup.** Read the trap in Dev Notes before
        deciding the format — a client navigation to a route whose inherited metadata is unchanged
        may leave the imperative title in place, so the Gallery would keep the last battle's name in
        its tab.
  - [x] Decide and record the format (suggest `"<display name> · Game of Life Studio"`, keeping the
        root layout's `metadata.title` as the suffix so the two do not drift into two brands). ❌ Do
        not add a dirty marker to the title — that is inventing scope with no AC behind it.
  - [x] Update `deferred-work.md`: close the entry with the evidence, and record any residual (e.g.
        the not-found/error titles, and the static export's prerendered `<title>`, which the effect
        cannot change).

- [x] **Task 7 — Tests (AC1–AC8)**
  - [x] `BattleNameField.test.tsx` (new): renders the value; the counter reads "N / 100" and tracks
        typing; `maxLength` is on the input; `onChange` receives the raw new value; the counter is
        associated with the input; keyboard-only operation via `@testing-library/user-event` v14;
        `vitest-axe` clean. ⚠️ Assert the counter uses code UNITS — one test with an astral-plane
        character (an emoji) pins it, and a `[...value].length` implementation fails it.
  - [x] `BattlePage.test.tsx`: the field pre-fills from a LOADED battle's stored name (the seed
        trap — a test on `/battle/new` alone would pass with a broken `useState` initialiser);
        typing updates the `<h1>` live; clearing the field shows "Untitled Battle"; the page starts
        clean and goes dirty on a name edit (AC3) and on a painted cell (AC4); no repository write
        happens for either (assert the fake repos' call counts, the Story 2.10 precedent — not by
        inspecting storage); the tab title (AC6) is set for a loaded battle, tracks typing, is NOT
        set to a battle name in the not-found branch, and is restored on unmount. ⚠️ Reuse the
        existing helpers (`findEditorCanvas`, `findRecording`, `renderNewRoute`, `seeded`); the file
        already carries a duplicated-helper finding — do not add a third harness.
  - [x] `BattleEditorView.test.tsx`: the Battle Name section renders in the sidebar after Organisms;
        `onNameChange` reaches the parent; neither new prop leaks to `<EditorMain>`. Extend the
        existing `renderEditor` default props rather than hand-copying a new prop set into four call
        sites (Story 2.8's own recorded lesson in that file).
  - [x] `apps/web/e2e/battleRoute.spec.ts`: on "Three-Way Skirmish" the sidebar field shows the
        stored name; typing changes the `<h1>` live and changes the tab title; a reload restores the
        stored name (nothing was persisted — AC5, and it stays true until 2.13); on `/battle/new`
        clearing the field leaves the `<h1>` reading "Untitled Battle". Axe stays at zero on
        `/battle` and `/battle/new` after typing.
  - [x] `packages/domain` tests: the exported cap is the value both schemas enforce (a 101-character
        name fails `BattleSchema` and `BattleSummarySchema`). ⚠️ `packages/domain` is on the **≥90%**
        coverage floor (NFR-5.1) — a new export needs real coverage, not a padding test.

- [x] **Task 8 — Verification and budget (AC8)**
  - [x] `npm run ci` in full. ⚠️ **Never pipe it to `tail`** — the pipe reports tail's exit code and
        has already masked a real `format:check` failure once. Redirect to a file and echo `$?`.
  - [x] Record `bundle:check`'s measured gzip and headroom for `/`, `/battle` and `/battle/new`
        against Story 2.10's numbers (326.5 / 299.4 / 299.3 KB; budgets 330 / 310 / 310). If a
        budget is exceeded, **STOP and ask Sidiar**.
  - [x] `npm run spec:check` passes — every `FR-x.y`, `RFC-00n`, `Decision X`, `Mn` and `Story N.M`
        tag written into new code must resolve under `docs/`.

- [x] **Task 9 — Story record**
  - [x] Fill the Dev Agent Record: each forced decision below with the option taken and why, the
        RFC-005 D7 conflict resolution as actually implemented, verification commands with their
        real output summary, and the File List.
  - [x] `sprint-status.yaml`: `2-11-battle-name-dirty-tracking: review` when the work is done.

### Review Findings

Code review, 2026-08-27 (Opus, second pair of eyes on a Sonnet implementation). Three layers ran:
Blind Hunter, Edge Case Hunter, Acceptance Auditor. 1 decision-needed, 9 patch, 5 defer, 4 dismissed.

- [ ] [Review][Decision] **Forced decision 6 (native `maxLength` only) may need reversing to (b), a clamp in the change handler** — the story pre-recorded (a) "with a test", and (a) is what shipped and what `BattleNameField.test.tsx` pins. The review found that the DOM `maxLength` attribute is a UA guarantee for ordinary typing ONLY: it is not applied to text committed by an active IME (a long CJK phrase into a field already near the cap), nor to `document.execCommand('insertText')`, browser voice dictation, or a password-manager/autofill write. Each of those fires an `input` event whose `event.target.value` is over 100, and nothing downstream clamps it — `BattleNameField`'s handler passes `event.target.value` through verbatim and `<BattlePage>`'s `handleNameChange` stores it. The observable result is a counter reading "104 / 100" with no error state, over a `battleName` that `BattleSchema.name`'s `.max(100)` will reject at Story 2.13's save. The fix is one expression (`onChange(event.target.value.slice(0, maxLength))`), but the story itself flagged the consequence — "it changes what `onChange` receives and therefore what the counter can ever show" — so this is a reversal of a recorded decision, not a bug fix. **Sidiar's call.** Not resolved in review; the story is NOT `done` while it stands.

- [x] [Review][Patch] Title `MutationObserver`'s re-assertions are now bounded [apps/web/components/battle/BattlePage.tsx:239-268] — a callback that writes back what it observes re-queues itself as a microtask, so any second reactive title writer starved the event loop and froze the tab permanently (reproduced against the built export in review: no paint, no timers, no input, no CDP recovery). Capped at 10 corrections, then the observer disconnects. The hydration race needs exactly one, and re-writing an identical title never spends the budget.
- [x] [Review][Patch] `maxLength = 100` re-declared in `apps/web`, the one thing Task 2 forbids twice [apps/web/components/battle/BattleNameField.tsx:81] — now defaults to `@gol/domain`'s `MAX_BATTLE_NAME_LENGTH`. The test that pinned the literal now derives from the export.
- [x] [Review][Patch] The whitespace comment inverted its own logic ("PERMANENTLY false" → TRUE) [apps/web/components/battle/BattlePage.tsx:268].
- [x] [Review][Patch] `draft === null` documented as the not-found/error branch when it is also the loading branch [apps/web/components/battle/BattlePage.tsx:253].
- [x] [Review][Patch] `handleCommitGrid`'s comment claimed the test asserts the prop's identity directly; the test's own comment says the opposite [apps/web/components/battle/BattlePage.tsx:514]. Comment corrected to name the structural guarantee; the missing assertion is deferred.
- [x] [Review][Patch] `expect(localStorage.length).toBe(0)` is permanently green under `createFakeRepositories()` and Task 7 excluded it explicitly [apps/web/components/battle/BattlePage.test.tsx] — removed, call-count spies kept.
- [x] [Review][Patch] An NFR-4.1 absence guard was weakened to a bare `toHaveLength(1)` rather than re-scoped [apps/web/components/battle/BattleEditorView.test.tsx] — now scoped by accessible name, so it fails if the one textbox is the wrong one.
- [x] [Review][Patch] The keyboard-operability test asserted `'o'` as the last `onChange`, which is the symptom of an unfed controlled input, not the contract [apps/web/components/battle/BattleNameField.test.tsx] — now runs through `ControlledHarness` and asserts the accumulated value.
- [x] [Review][Patch] Forced decision 3 promised `data-dirty` would give "both unit and e2e a real assertion"; only the unit half shipped [apps/web/e2e/battleRoute.spec.ts] — e2e assertion added, both states.
- [x] [Review][Patch] `deferred-work.md`'s AC6 closure described the wrong effect as the `[]`-deps one and never mentioned the `MutationObserver` at all; the Dev Agent Record's lint evidence named a warning the gate does not emit. Both corrected with the real evidence.

- [x] [Review][Defer] The direct `onCommitGrid` identity assertion Task 3 required was never written [apps/web/components/battle/BattlePage.test.tsx] — deferred, `vi.mock` is file-hoisted and would replace the child for ~40 other tests.
- [x] [Review][Defer] `battleDisplayName` does not treat invisible-only names (U+200B, U+2060, U+00AD) as empty [apps/web/lib/battleDisplayName.ts] — deferred, pre-existing helper shared with the Gallery.
- [x] [Review][Defer] `" · Game of Life Studio"` is a fourth hand-typed copy of the app name [apps/web/components/battle/BattlePage.tsx:262] — deferred, pre-existing on three of four sites.
- [x] [Review][Defer] Reaching the 100-character cap is unannounced in every modality [apps/web/components/battle/BattleNameField.tsx] — deferred, an enhancement beyond AC8.
- [x] [Review][Defer] While mounted, `<BattlePage>` silently reverts any other writer of `document.title` [apps/web/components/battle/BattlePage.tsx:239] — deferred, no second title owner exists before Story 2.16.

**Verified, not findings.** The RFC-005 D7 conflict is resolved as the claimed event flag with no value-comparison residue. All six forced decisions are implemented as recorded. The `document.title` read-back genuinely closes the whitespace loop — the getter's output is a fixed point of setter+getter for every case walked (leading/trailing/doubled spaces, `\n`, `\t`, NBSP, U+3000, astral-plane characters), and jsdom normalises identically to the browser. The observer is load-bearing and was confirmed so empirically, by instrumenting the `document.title` setter against the built static export: the only two assignments in the page's life are the effect's own, then one from inside the observer callback — which by its guard fires only when the title had been changed out from under it, i.e. Next's metadata `<title>` element really does land after the effect. `handleCommitGrid`'s identity is stable by construction. Every hook precedes all four early returns. Bundle numbers in the Dev Agent Record reproduce to the decimal.


## Dev Notes

### ⚠️ Spec conflict to resolve deliberately: what "dirty" MEANS

Two authorities describe `isDirty` differently, and they disagree on a reachable case.

- **`epics.md` (this story's ACs)** — an **event flag**: "**When** typed, **Then** … `isDirty`
  becomes true"; "**Given** any grid commit …, **When** it lands, **Then** `isDirty` becomes true".
- **RFC-005 Decision 7 (line 285)** — a **value comparison**: "set when `initialGrid` or
  `battleName` **differs from the last-saved value**; cleared on successful Save (FR-7.8) or fresh
  load."

They diverge whenever an edit is undone or retyped back: paint a cell then Undo, or clear the name
and retype it exactly. The flag says dirty; the comparison says clean.

**Resolution for this story: implement the event flag, and record it.** Three reasons, in order:

1. **The comparison is not implementable yet.** "The last-saved value" does not exist until Story
   2.13 creates one. For `/battle/new` there is no saved value at all, ever, until the first save.
2. **The failure modes are not symmetric.** A false *positive* costs one extra confirmation dialog
   (2.16) and one redundant write (2.13). A false *negative* loses the user's work silently. FR-7.9
   exists to prevent the second.
3. **Authority order.** `project-context.md` fixes it as Architecture Decisions → owning RFC →
   companion specs; RFC-005 owns this area, and the ACs are the story contract. Where a story's AC
   is the more conservative reading of its own RFC, the AC is what ships and the divergence is
   recorded — the same treatment `canUndo: boolean` got against RFC-005 Decision 6's
   `() => boolean` snippet in Story 2.8.

**Surface this in the Dev Agent Record**, and note that Story 2.13 may narrow the flag to the RFC's
comparison once a saved baseline exists — this story neither blocks nor pre-empts that.

### Undo and the dirty flag

`<BattlePage>`'s existing comment already stakes half of this out: "an undo that cleared it would be
wrong anyway (undoing to the seed is not the same as being saved)." The other half is why undo need
not **set** it either:

`canUndo` is `state.past.length > 0`, and the ring is empty until a commit lands — and the ring
resets when the seed changes (a different battle). So **an undo can never be the first mutation of a
session**: whatever made it possible already set `isDirty`. Wrapping `undo` would be code that
cannot change an outcome, which is worse than no code, because a later reader has to prove that
again. Leave `onUndo={undo}` untouched and say so in a comment.

### Seeding the name (the trap that makes every SAVED battle open blank)

`<BattlePage>` renders four early returns, and every hook precedes all of them. On the first render
`battleResource` has not settled, so `draft` is `null`. `useState(draft?.name ?? '')` captures that
`''` **forever** — `/battle/new` looks perfect (its name genuinely is `''`) and every
`/battle?id=…` opens with an empty name field over a header that still shows the right title until
the first keystroke wipes it. This is the same shape as `useUndoableGrid`'s trap 8, in the same
component, one hook away.

Use the same fix `useUndoableGrid` documents — React's "adjusting state when a prop changes":

```ts
const [name, setName] = useState<{ value: string; seed: string | null }>(…)
if (name.seed !== seedName) setName({ value: seedName ?? '', seed: seedName })
```

Setting state during render is deliberate here and cannot loop: React re-runs the body immediately
and the new state carries the new seed, so the second pass is a no-op. An effect would render one
frame of the wrong name first.

⚠️ **`react-hooks/refs` rejects reading or writing a ref during render** inside a `use*` function —
that is a lint *error*, not a warning, and it is why `useUndoableGrid` holds the seed in the state
cell rather than a ref. `<BattlePage>` is a component rather than a hook, but keep the state-cell
shape anyway: one cell means the value and the seed it was built from can never be observed a tick
out of step.

**Compare the seed by VALUE (`draft?.name ?? null`), not by draft identity.** `newDraft` is a memo
over `[battleId, settings]` and `loadedDraft` over `[loadedBattle]`, so their identities churn for
reasons that have nothing to do with the name — a settings resolution arriving after the battle
would blow away a typed name if the comparison keyed on identity.

**Residual to record:** two different battles that share a name will not reset the field if
`battleId` changes on a *mounted* `<BattlePage>`. That is the identical hole `sessionRoster` has
(`deferred-work.md`, already tracked from the Story 2.9 review and re-raised in 2.10's) — do not fix
it here, but **add the name field to that entry** so the eventual fix covers both.

### The commit-seam identity is the load-bearing part of AC4

`onCommitGrid` is currently `useUndoableGrid`'s `commit` verbatim, and two things depend on that
identity being stable:

- `EditDish`'s resize effect holds it in a closure it deliberately does not re-register
  (`PetriDishCanvas.tsx`; `BattlePage.tsx`'s own prop comment says so).
- `EditDish`'s construction effect tears the retained renderer down when its deps churn — Story 2.5
  trap 7, re-learned in Story 2.10's `setPalette` work.

So the wrapper must be `useCallback(…, [commitGrid])` and nothing more. Do not inline an arrow into
the JSX. **A test that asserts the prop's identity is unchanged across an unrelated re-render is
worth more here than a test that asserts the flag flipped** — the flag is obvious and the identity
is not.

### The tab title: why a cleanup is required, not optional

Next's App Router applies `metadata` to the head on navigation. Both battle pages are `'use client'`
and export none, so they inherit the root layout's static `title` — which means a client navigation
from `/battle` back to `/` moves between two routes whose *declared* metadata is identical. There is
no guarantee Next rewrites a `<title>` it believes did not change, so an imperatively-set
`document.title` can survive the navigation and leave the Gallery's tab reading the last battle's
name. Capture the title on mount and restore it in the effect's cleanup.

Also note: this is a **static export**. The prerendered `battle.html` will always ship the root
title in its `<title>`; the effect only fixes the *live* tab. Say so when closing the entry rather
than claiming more than was delivered — a crawler or a cold bookmark still sees "Game of Life
Studio".

`useEffect` never runs during the export's prerender, so no `typeof document === 'undefined'` guard
is needed (unlike the `colors` memo, which runs in the render body and does need one).

### Character counting, three ways, only one of which is right

| Counter | `"a👍b"` | Agrees with DOM `maxLength`? | Agrees with Zod `.max()`? |
|---|---|---|---|
| `value.length` (UTF-16 code units) | 4 | ✅ | ✅ |
| `[...value].length` (code points) | 3 | ❌ | ❌ |
| `Intl.Segmenter` graphemes | 3 | ❌ | ❌ |

Both enforcement points count code units, so the counter must too. The "friendlier" versions produce
a field that reads "98 / 100" and still fails to save.

### What NOT to build

- ❌ **A SAVE button, or anything that reads `isDirty` as an affordance** — Story 2.13. A disabled
  SAVE rendered "for completeness" is the dead affordance NFR-4.1 forbids, and `<EditorStatusBar>`'s
  own comment already reserves that slot ("❌ No `onSave` / `isDirty` and no SAVE button — Story
  2.13").
- ❌ **`useDirtyGuard` / `beforeunload` / the unsaved-changes dialog** — Story 2.16 (FR-7.9,
  RFC-005 D7). This story produces the flag; 2.16 consumes it.
- ❌ **Clearing `isDirty`** — there is nothing that could legitimately clear it before a save exists.
- ❌ **Auto-save (FR-8.11)** — Epic 6's toggle, RFC-006's trigger. Not a debounce, not a draft write.
- ❌ **Grid Info / Tools / Back sidebar sections** — 2.14 / 2.15 / 2.16.
- ❌ **Editing the name from the header** — spec §3.2 is explicit.
- ❌ **A `gridSize` or `organismIds` change of any kind** — this story touches neither.
- ❌ **Fixing the mid-stroke-scroll geometry entry** (`deferred-work.md` ~line 237) even though this
  story makes `<SidebarContent>` taller. Story 2.14 owns it; annotate.

### Forced decisions (record the option taken and why in the Dev Agent Record)

1. **Where `battleName` lives.** Spec §6 says `<BattlePage>` and the ACs say `<BattlePage>` owns
   `isDirty`, so this is nearly settled — but the *seed-adoption* mechanism is a real choice:
   (a) inline in `<BattlePage>` with `useUndoableGrid`'s documented pattern; (b) extract a tiny
   `useSeededState<T>(seed)` hook and refactor `useUndoableGrid` onto it.
   **Suggested: (a).** (b) is a refactor of a hook with a 30-entry ring and its own trap list, for
   one caller's benefit, in a story that touches neither. Note (b) as the obvious follow-up if 2.14
   adds a third seeded cell.

2. **The sidebar-section shell (AC7).** Story 2.9 explicitly deferred this to its second consumer:
   (a) export `SidebarSection` / `SidebarSectionTitle` from a shared module (they are two styled
   primitives, and consumers compose them); (b) build a `<SidebarSection title="…">` component that
   owns the heading level. (b) centralises the `<h2>` decision that axe's `heading-order` depends on
   and gives 2.14/2.15/2.16 one thing to mount; (a) is the smaller move. Story 2.9's own words —
   "with one consumer there is nothing yet to tell us whether the shared thing is a styled pair or a
   `<SidebarSection title=…>` component" — mean this story is expected to answer it, not to defer it
   again. Whichever wins, the primitives must leave `BattleEditorView.tsx`'s module scope so 2.14
   and 2.15 do not each re-derive them.

3. **How `isDirty` is observed with no UI consumer (AC5).** Options: (a) a `data-dirty` attribute on
   `<BattlePage>`'s `Root`, mirroring the existing `data-mode={mode}` and its stated reason ("mode
   is read here so the state cell is not merely declared"); (b) thread it to `<BattleEditorView>`
   and stop, leaving an unread prop; (c) ship 2.13's SAVE early; (d) leave it write-only.
   **Suggested: (a).** It is an exact precedent in the same file, it is not a control (so NFR-4.1
   is not engaged), and it gives both unit and e2e a real assertion. (c) is scope theft, (d) is a
   state cell no reviewer can verify, (b) is (d) with an extra prop.
   Render it in both states (`'true'` / `'false'`), not conditionally — an absent attribute and a
   false one are indistinguishable to a test that got the selector wrong.

4. **The input's accessible name and its counter (AC8).** The mockup gives the input no `<label>`;
   the visible "Battle Name" section heading is what a sighted user reads.
   - Name: (a) `aria-label="Battle name"` (the `<OrganismRoster>` precedent, used there precisely
     because there was no visible label to prefer); (b) a visually-hidden `<label htmlFor>`;
     (c) `aria-labelledby` pointing at the section heading's id.
   - Counter: (a) `aria-describedby` on the input pointing at the counter element — announced when
     the field takes focus, silent while typing; (b) `aria-live="polite"` on the counter — announced
     on **every keystroke**, which is noise; (c) unassociated — a stray number no screen-reader user
     can attribute to the field.
   **Suggested: name (a) or (b); counter (a), never (b).** Generate ids with React's `useId()` —
   this is a statically exported, hydrated page, so a hand-rolled id risks a server/client mismatch
   and a hardcoded one breaks the moment anything renders two fields.

5. **Wrapping element (AC1).** (a) a plain `<div>` inside the section; (b) a `<form>`.
   **Suggested: (a), and record it**, because `EditorStatusBar.tsx` currently carries a comment
   defending `type="button"` against "a bare `<button>` inside a future `<form>` (Story 2.11's
   battle name field)". A `<form>` with a single text input triggers **implicit submission** on
   Enter, which under `output: 'export'` is a full page reload that discards the grid, the undo ring
   and the session roster. There is no submit action here — the field is live-bound. Update that
   `EditorStatusBar` comment to say the `<form>` never arrived, rather than leaving it pointing at a
   future that did not happen.

6. **Enforcing the cap (AC1).** (a) rely on the native `maxLength` attribute (the UA truncates typed
   and pasted input); (b) additionally clamp in the change handler.
   **Suggested: (a), with a test.** The DOM attribute is the correct, accessible mechanism and
   `@testing-library/user-event` v14 honours it, so the behaviour is testable. If (b) is chosen,
   note that it changes what `onChange` receives and therefore what the counter can ever show.

### Traps carried in from the last three stories

1. **Every hook precedes all four early returns in `<BattlePage>`.** A hook added below one is a
   conditional hook. The fix people reach for — moving the return — is what would break the branch
   order the Story 2.1 review established. Add hooks at the top.
2. **`readGridColors` / `colors` runs in the render body and needs its `typeof document` guard;
   your `document.title` effect does not.** Do not copy the guard into the effect and do not remove
   it from the memo.
3. **`BattlePage.test.tsx` has load-dependent timing.** Use the existing `findEditorCanvas` /
   `findRecording` helpers, which wrap the reads in `waitFor` — do not reintroduce a bare
   `container.querySelector('canvas') as HTMLCanvasElement`.
4. **`createMockWorkspace()` is asserted by `@gol/test-utils`' own tests and by the gallery e2e** —
   do not edit `mockWorkspace.ts` to get a fixture. Battle A is "Three-Way Skirmish", battle B is
   "Grand Colony War" (`MOCK_BATTLE_IDS.battleA` / `.battleB`).
5. **`npm run ci` is not proof CI is green** — check `gh run list` after pushing. And never pipe the
   gate's output.

### Testing standards summary

- Vitest + RTL for units; `@testing-library/user-event` **v14** for keyboard; `vitest-axe` for
  component-level a11y; Playwright + `@axe-core/playwright` for route-level.
- `apps/web` has **no coverage gate** (deliberate counter-metric); `packages/domain` is at **≥90%**
  (NFR-5.1), which the new exported constant lands in. Do not write coverage-padding tests — they
  are rejected in review.
- Never pixel/snapshot-test the Canvas.

## Project Structure Notes

New:

- `apps/web/components/battle/BattleNameField.tsx` + `BattleNameField.test.tsx` — component
  PascalCase `.tsx`, co-located test, matching every other file in `components/battle/`.
- Possibly `apps/web/components/battle/SidebarSection.tsx` (forced decision 2). If a shared
  primitives home is chosen instead, keep it inside `components/battle/` — these are battle-sidebar
  chrome, not app-wide layout, and `components/layout/` is the gallery shell's.

Updated:

- `apps/web/components/battle/BattlePage.tsx` — `battleName`, `isDirty`, the wrapped commit, the
  live header title, the tab-title effect, `data-dirty`.
- `apps/web/components/battle/BattleEditorView.tsx` — two new props, the `Omit<…>` list, the second
  sidebar section, the section-shell extraction.
- `apps/web/components/battle/EditorStatusBar.tsx` — the stale `<form>` comment (forced decision 5).
- `packages/domain/src/battleSchema.ts` + `src/index.ts` — the exported cap.
- `apps/web/components/battle/BattlePage.test.tsx`, `BattleEditorView.test.tsx`,
  `apps/web/e2e/battleRoute.spec.ts`, and `packages/domain`'s schema tests.
- `docs/implementation-artifacts/deferred-work.md` — close the tab-title entry; annotate the
  mid-stroke-scroll entry and the `battleId`-swap-reset entry.
- `docs/implementation-artifacts/sprint-status.yaml`.

Conventions that apply and are easy to violate here:

- Non-component TS files are **camelCase, never dotted**.
- `isolatedModules: true` — re-export types with `export type { … }`.
- Cross-package imports use the package name (`@gol/domain`), never a relative path.
- Comments explain **why**, not what; cite governing IDs exactly as the specs spell them
  (`FR-3.9`, `RFC-005`, `Decision H.2`, `M6`) — `spec:check` fails the build on an ID that resolves
  to nothing, and a hyphenated `M-9` matches nothing and is silently exempt forever.

## References

- [Source: docs/planning-artifacts/epics.md#Story 2.11: Battle Name & Dirty Tracking] — the ACs.
- [Source: docs/planning-artifacts/prds/prd-GameOfLife-2026-05-26/prd.md#FR-3.9: Name Battle] —
  "a text name for the current Battle scenario".
- [Source: docs/planning-artifacts/prds/prd-GameOfLife-2026-05-26/prd.md#FR-7.9: Unsaved Changes
  Warning] — the flag's eventual consumer (Story 2.16).
- [Source: docs/planning-artifacts/component-tree-battle-page.md#3.5 `<BattleNameField>`] — the
  component interface and `maxLength = 100`.
- [Source: docs/planning-artifacts/component-tree-battle-page.md#3.1 `<BattlePage>`] — `battleName`
  and `isDirty` as ephemeral local state.
- [Source: docs/planning-artifacts/component-tree-battle-page.md#3.2 `<BattleHeader>`] — display
  only, no name editing, "Untitled Battle" fallback.
- [Source: docs/planning-artifacts/component-tree-battle-page.md#3.3 `<BattleEditorView>`] —
  `battleName` / `onNameChange(name)` in the props contract; sidebar order.
- [Source: docs/planning-artifacts/component-tree-battle-page.md#6. State-management separation
  matrix] — `battleName`, `isDirty` | ephemeral | BattlePage | readers.
- [Source: docs/planning-artifacts/component-tree-battle-page.md#9. UX-mockup reconciliation & open
  items] — item 10, the 100-vs-50 supersession.
- [Source: docs/planning-artifacts/rfcs/RFC-005-application-state-modes-undo.md#Decision 7:
  Dirty-tracking and the navigation guard — two local scopes] — and the conflict note above.
- [Source: docs/planning-artifacts/rfcs/RFC-001-multi-mode-architecture.md] — `BattleSchema.name`
  ≤ 100, realised in `packages/domain/src/battleSchema.ts`.
- [Source: docs/implementation-artifacts/deferred-work.md] — the browser-tab-title entry (AC6), the
  mid-stroke-scroll entry, the `battleId`-swap reset entry.
- [Source: docs/planning-artifacts/ux-designs/ux-GameOfLife-2026-05-27/clinical-lab-theme/petri-dish-lab-mode.html]
  — `.battle-name-input` / `.char-count` (:381-403), markup (:703-707).
- [Source: docs/implementation-artifacts/2-10-add-organisms-from-library.md] — the Story 2.9/2.10
  forced decisions this story inherits, and the bundle baseline.
- [Source: docs/project-context.md] — auto-loaded; the repository-injection, no-global-store,
  one-theme, AR-46 and verification rules all apply unchanged.

## Dev Agent Record

### Agent Model Used

sonnet (Claude Opus 5, running as the Sonnet-designated dev agent per the story's own `Dev Model` line)

### Debug Log References

- `npm run typecheck` (turbo, all packages) — 0 errors.
- `npm run lint` (`eslint .`) — 0 errors, 1 pre-existing warning. ⚠️ Corrected in the code review (2026-08-27): the warning the gate actually emits is `react-hooks/exhaustive-deps` at `apps/web/components/gallery/BattleGallery.tsx:248`, a file this story does not touch — not the `deferred-work.md` config-match warning recorded here on the first pass. The conclusion (pre-existing, unrelated) is unchanged; the evidence was wrong.
- `npm run format:check` (`prettier --check .`) — all files match Prettier style.
- `npm run spec:check` (`node scripts/check-spec-ids.mjs`) — "all 147 cited ids resolve."
- `npm run test:coverage` (turbo, all packages) — full monorepo suite green; `packages/domain` 86 tests (incl. the new `MAX_BATTLE_NAME_LENGTH` boundary test), `apps/web` 699 tests (incl. new `BattleNameField.test.tsx` 12, and the extended `BattlePage.test.tsx` / `BattleEditorView.test.tsx` suites).
- `npm run build:standalone` — builds clean; static export of `/`, `/battle`, `/battle/new`, `/_not-found`.
- `npm run bundle:check` — all three routes within budget:
  - `/`: 326.6 KB gzip / 330 KB budget (3.4 KB headroom; was 326.5/3.5 KB at Story 2.10 — unaffected by this story's code, day-to-day float).
  - `/battle`: 299.9 KB gzip / 310 KB budget (10.1 KB headroom; was 299.4/10.6 KB).
  - `/battle/new`: 299.9 KB gzip / 310 KB budget (10.1 KB headroom; was 299.3/10.7 KB).
  - No budget exceeded; nothing to escalate to Sidiar.
- `npm run e2e` — full Playwright suite (chromium, firefox, webkit, tablet) green, including the new Story 2.11 tests in `battleRoute.spec.ts` on all four projects.
- `npm run ci` (the full local gate, run once end-to-end after the above individual commands had each already been verified green) — green.

### Completion Notes List

**Spec conflict — what "dirty" means (Dev Notes' own flagged conflict).** Implemented the **event flag** reading (epics.md ACs), not RFC-005 Decision 7's **value-comparison** reading. `isDirty` is set `true` by the first name edit or the first grid commit and is never cleared by this story. Reasoning (matches the story's own pre-recorded analysis, confirmed rather than second-guessed): (1) "last-saved value" doesn't exist until Story 2.13; (2) a false positive costs one redundant save/dialog, a false negative loses work silently — FR-7.9's whole point; (3) authority order puts the AC (the story contract, the more conservative reading) ahead of a companion RFC where they diverge. Story 2.13 may narrow this to the RFC's comparison once a saved baseline exists; this story neither blocks nor pre-empts that.

**Forced decision 1 — where `battleName` lives.** Option (a): inline in `<BattlePage>`, reusing `useUndoableGrid`'s documented in-render "adjust state when a prop changes" pattern (one `{ value, seed }` state cell, seed compared by VALUE — `draft?.name ?? null` — never by `draft`'s own identity, since `newDraft`/`loadedDraft` are memos that churn identity for reasons unrelated to the name). No `useSeededState<T>` extraction; noted as the obvious follow-up if Story 2.14 adds a third seeded cell.

**Forced decision 2 — the sidebar-section shell (AC7).** Option (b): a new `<SidebarSection title="…">` component (`apps/web/components/battle/SidebarSection.tsx`), not a re-exported styled pair. It owns the `<h2>` decision axe's heading-order rule depends on; `<BattleEditorView>` now mounts `<SidebarSection title="Organisms">` and `<SidebarSection title="Battle Name">` as siblings, in mockup order, with the mockup's 25px gap (unchanged, `SidebarContent`'s own `gap`). 2.14/2.15 have one thing to mount instead of re-deriving the pair.

**Forced decision 3 — observing `isDirty` with no UI consumer (AC5).** Option (a): `data-dirty={isDirty}` on `<BattlePage>`'s `Root`, mirroring the existing `data-mode`. Rendered in both states (`'true'`/`'false'`), never conditionally.

**Forced decision 4 — accessible name / counter association (AC8).** Name: `aria-label="Battle name"` (the `<OrganismRoster>` `SearchInput` precedent — no other visible label to prefer). Counter: `aria-describedby` pointing at a `useId()`-generated id on the counter `<div>` — announced once on focus, silent while typing; never `aria-live`.

**Forced decision 5 — wrapping element (AC1).** A plain `<div>`, no `<form>`. Updated `EditorStatusBar.tsx`'s stale comment (it anticipated a future `<form>` around this field) to say the `<form>` never arrived and why.

**Forced decision 6 — enforcing the cap (AC1).** Native `maxLength` attribute only, no clamp in the change handler; pinned with a controlled-round-trip test (`BattleNameField.test.tsx`) that types past the cap and asserts the browser truncates.

**Unplanned implementation finding — the tab title (AC6) needed more than the Dev Notes' plain `document.title` effect, discovered via e2e, not anticipated by the story spec:**

1. **A one-time race against Next 16's own metadata commit.** On initial hydration, Next's App Router (the `MetadataBoundary`/`OutletBoundary` machinery behind `export const metadata` in `app/layout.tsx`) writes the root layout's static `<title>` into the real DOM *after* this component's own first title write — observed via a `MutationObserver` probe against the built static export served from `out/` (never reproduced against `next dev`). A bare `document.title = …` effect (the Dev Notes' literal suggestion) loses that race and leaves the tab reading "Game of Life Studio" at rest until the user's first keystroke forces a second write, which fails AC6 ("carries the battle's live display name" from the moment the page settles). Fixed with a `MutationObserver` that reasserts a `desiredTitleRef` value whenever anything else changes `document.title`, attached once for the life of the mount (not per-keystroke) and disconnected before the pre-mount title is restored on unmount — deterministic cleanup ordering was necessary here, which is why the tab-title code is two effects sharing one ref rather than two independent `[]`-deps effects.
2. **A genuine hang, found by an e2e test that typed a literal space.** The HTML spec's `document.title` **getter** strips and collapses ASCII whitespace (verified directly: `document.title = 'a  b'` reads back `'a b'`). Storing the un-normalised template string (`` `${name} · Game of Life Studio` ``) in the observer's comparison ref meant any `battleName` ending in — or containing doubled — whitespace (an entirely ordinary mid-typing state, e.g. typing "New Skirmish" one character at a time passes through "New ") made the observer's `document.title !== desired` check permanently true: browser normalises → observer reasserts → browser normalises again → forever, a same-tick `MutationObserver` retrigger loop with no macrotask in between, starving the event loop so *every* further keystroke (and, from outside the page, every further Playwright/CDP command) hung indefinitely. First reproduced by an e2e typing `' Renamed'`/`'New Skirmish'` via `pressSequentially`; root-caused with a battery of throwaway Playwright probes against the served static export (bisecting by field, by route, by exact character) before being pinned down to whitespace normalisation specifically. Fixed by reading `document.title` **back** immediately after assignment and storing *that* (the browser's own normalised form) as the comparison value, rather than the raw template string. Verified against a second latent hang of the identical shape: a jsdom unit test that mounted two `<BattlePage>` instances SIMULTANEOUSLY (each with its own observer) produced the same infinite tug-of-war fighting over one `document.title` — fixed by unmounting the first instance before mounting the second (also the only way two `<BattlePage>`s could ever coexist in the real app, which never happens today). Confirmed the final fix on all four e2e Playwright projects (chromium, firefox, webkit, tablet) and under jsdom (Vitest); none reproduce the hang after the fix.

**Sidebar/e2e assertions widened, not narrowed, by the second section.** Several pre-existing tests queried `getByRole('textbox')` bare to assert the roster's search box was absent at the roster cap; Battle Name's always-present textbox now also matches that query, so those assertions were re-scoped to `{ name: /search organisms/i }` (both in `BattlePage.test.tsx` and `battleRoute.spec.ts`) — the underlying claims (search box absent at cap) are unchanged, only the selector's specificity.

**Residuals recorded in `deferred-work.md`, not fixed here (explicitly out of scope):**
- The tab-title entry (line 167, AC6's) is closed, with the static-export prerender residual noted honestly (the effect fixes the *live* tab only; a crawler/cold bookmark still sees the root layout's static title).
- The mid-stroke-scroll entry (~line 237) is annotated — Battle Name is the predicted second `<SidebarSection>`; still Story 2.14's fix.
- The `sessionRoster`/`chosenTool` battleId-swap-reset entry is annotated to note `battleName` has the identical gap (reachable only once same-mount battle-to-battle navigation exists, which nothing does today).

### File List

**New:**
- `apps/web/components/battle/BattleNameField.tsx`
- `apps/web/components/battle/BattleNameField.test.tsx`
- `apps/web/components/battle/SidebarSection.tsx`

**Modified:**
- `apps/web/components/battle/BattlePage.tsx` — `battleName`/`isDirty` state, the wrapped commit seam (`handleCommitGrid`), the live header title, the tab-title effects + `MutationObserver`, `data-dirty` on `Root`.
- `apps/web/components/battle/BattlePage.test.tsx` — new `describe('BattlePage — battle name & dirty tracking (Story 2.11)')` block; one pre-existing `AC5` cap test's selector narrowed (see Completion Notes).
- `apps/web/components/battle/BattleEditorView.tsx` — `battleName`/`onNameChange` props, `Omit<…>` list extended, `<SidebarSection>` adopted for both sections, module-private `SidebarSection`/`SidebarSectionTitle` removed.
- `apps/web/components/battle/BattleEditorView.test.tsx` — `renderEditor` default props extended; two structural tests updated for the second section; new `describe('BattleEditorView — the Battle Name section (Story 2.11)')` block.
- `apps/web/components/battle/EditorStatusBar.tsx` — stale `<form>`-anticipation comment corrected (forced decision 5).
- `apps/web/e2e/battleRoute.spec.ts` — 5 new Story 2.11 tests; two pre-existing tests updated for the second `<h2>` / the narrowed textbox selector.
- `packages/domain/src/battleSchema.ts` — exported `MAX_BATTLE_NAME_LENGTH`, both `.max()` sites now reference it.
- `packages/domain/src/battleSchema.test.ts` — new boundary test for the exported constant.
- `packages/domain/src/index.ts` — re-exports `MAX_BATTLE_NAME_LENGTH`.
- `docs/implementation-artifacts/deferred-work.md` — tab-title entry closed; mid-stroke-scroll and battleId-swap-reset entries annotated.
- `docs/implementation-artifacts/sprint-status.yaml` — `2-11-battle-name-dirty-tracking: review`.

Dev Model: sonnet   # follows the sidebar-section, seeded-state, styled-primitive and prop-threading patterns Stories 2.8-2.10 already established; no new architecture

---

This story was implemented with the 'Implement next story' skill with the following stats:

| Phase | Agent model | Agents | Wall clock | Input | Output | Cache write | Cache read | Total tokens |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Step 0 — re-entry guard | — | 0 | 25s | 20 | 3,214 | 11,871 | 398,151 | 413,256 |
| Step 1 — create-story | opus-5 | 1 | 8m 41s | 180 | 9,080 | 394,801 | 8,322,216 | 8,726,277 |
| Step 2 — dev-story | sonnet-5 | 1 | 51m 33s | 1,250 | 60,589 | 930,259 | 188,072,216 | 189,064,314 |
| Step 3 — code review + PR | opus-5 | 4 | 28m 06s | 640 | 63,846 | 2,111,420 | 41,549,806 | 43,725,712 |
| _of which the orchestrator_ | opus-5 | — | — | 64 | 12,461 | 44,857 | 1,502,509 | 1,559,891 |
| **Total (create-story → PR ready)** | | 6 | **1h 28m** | 2,090 | 136,729 | 3,448,351 | 238,342,389 | **241,929,559** |

Run started 2026-08-27 17:53 CEST; wall clock runs to the point the run stopped for Sidiar's review. Each phase row covers the phase agent, any agents it spawned, and the orchestrator's own turns in that window — the orchestrator row breaks its share out again, it is not additional. Cache reads dominate the token totals and are billed at a fraction of input rate, so read the Input and Output columns for effort and the total only as a ceiling. The orchestrator's final turn is still being written when these numbers are taken.
