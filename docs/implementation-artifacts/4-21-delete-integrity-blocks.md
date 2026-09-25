---
baseline_commit: bf62145d4092d5d3918fbfc61b096007fccb96ad
---

# Story 4.21: Delete Integrity Blocks

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a user,
I want deletion blocked when an organism is still needed,
so that my battles never break.

## Acceptance Criteria

From `epics.md#Story 4.21: Delete Integrity Blocks` (`:1240-1250`), broken into checks a reviewer can
make one at a time. **Both derivations already exist and are 100% covered.** Story 4.19 shipped
`resolveOrganismUsage` and `buildRuleReferenceIndex` / `referencingOrganismIds` in `@gol/domain`.
Story 4.20 shipped the name resolvers (`usageBattleNames`, `referencingOrganismNames`) and the count
copy in `apps/web/lib/organisms/usageLabels.ts`. This story adds **one pure verdict function** in
`@gol/domain`, **the card's Delete action** (only while a block applies, see FD2), and **the block
dialog**. It deletes nothing. **Read FD1–FD12 before touching a file.** Four failures here compile
and pass tests anyway, and all four are settled there:
- a Delete button that does nothing for an unused organism (NFR-4.1);
- the rule-block count taken from the footer's RULE count instead of the ORGANISM count;
- the Conway's Classic check done after the usage check;
- the verdict re-derived inline in `apps/web`.

1. **One pure verdict in `@gol/domain`.** New `packages/domain/src/organismDeleteGuard.ts` exports
   `organismDeleteVerdict(organismId, usageIndex, ruleIndex, openBattle?)`, which returns
   `{ kind: 'protected' } | { kind: 'blocked'; battles; referencingOrganismIds } | { kind: 'allowed' }`
   (FD3). It **consumes** `resolveOrganismUsage` and `referencingOrganismIds` and derives neither
   again. The order is fixed: `protected` (id is `CONWAYS_CLASSIC_ID`) wins over any usage (M9: "cannot
   be deleted regardless of usage"). Otherwise it is `blocked` when either list is non-empty.
   Otherwise it is `allowed`. It is exported from the barrel with a why-comment, and it is at 100% under
   the ≥90% per-file gate (AR-39, NFR-5.1). The project context says: "Referential-integrity logic is
   core… If you are testing that logic through a repository, it is in the wrong package."

2. **Battle-usage block (FR-1.4, M7, UX-DR15).** Given an organism that at least one saved battle places,
   Delete opens a **hard-block** dialog. It names the organism, the count **N** and the specific battles,
   and it states **both** remedies:
   *"It is used in N Battle(s): … Remove it from those Battles, or delete the Battles, then try again."*
   (PRD `prd.md:133`, UX `ux-design-complete.md:697`).
   - N is `verdict.battles.length`, the **same** `resolveOrganismUsage` derivation that feeds the 4.17
     edit warning and the 4.20 footer. The epic's "counts are consistent across all surfaces" (4.20
     AC5) now covers three surfaces.
   - Names come from `usageBattleNames(verdict.battles, summaries)`, never a raw `summary.name`. That
     function covers `Untitled Battle` and `Current Battle (unsaved)`.
   - Plurals are real: `1 Battle` / `2 Battles`, through the existing `battleCount` helper, which is
     exported for this (FD5).

3. **Rule-reference block (Decision E.5, UX-DR15).** Given an organism that other organisms' rules
   target, the dialog names the referencing organisms and the remedy:
   *"It is targeted by rules of M organism(s): … Edit those rules to remove the reference, then try
   again."* (PRD `prd.md:135`, UX `ux-design-complete.md:698`).
   - ⚠️ **M here counts ORGANISMS** (`verdict.referencingOrganismIds.length`). It does **not** count
     rules. The footer's "Targeted by [M] organism rule(s)" counts rules, and the two numbers
     legitimately differ when one organism targets this one from two rules (FD6).
   - Names come from `referencingOrganismNames(ids, library)`, with the `library` **as loaded**
     (unfiltered, not the search-filtered `visible`, FD7).
   - An organism's own rules never block (Decision E.5). `buildRuleReferenceIndex` already drops
     self-references, so do not filter them a second time.

4. **Both blocks at once.** An organism that is both placed and targeted gets **one** dialog with
   **both** sections: battles first, then rules, each with its own remedy. It never gets two dialogs in
   sequence, and it never shows just the first reason found (FD4). The user has to clear both before a
   delete can proceed, so they should learn both now.

5. **Nothing is deleted, and nothing is writable.** The dialog has exactly **one** action, a
   non-destructive dismissal (`OK`, `autoFocus`). Escape and backdrop close it too. It has no confirm,
   no "delete anyway" and no link. Names are text only, with no navigation (FR-1.7, M7).
   `organisms.delete` is **never called** from this story's code. A unit test pins that with a spy on
   the injected repository. The integrity guarantee holds because this story removes nothing.

6. **Delete appears only when there is a block to explain (FD2, the NFR-4.1 transitional rule).**
   - The card's Delete button renders **only** on a card whose verdict is `blocked`.
   - An `allowed` card and the `protected` Conway's Classic card render **no** Delete button in this
     story. Their confirmation dialog, disabled state and explanatory message are Story 4.22's ACs, and
     a button that did nothing would be a dead affordance.
   - `<OrganismCard>` stays usage-ignorant. It renders Delete **iff** it receives an `onRequestDelete`
     prop, and `<OrganismLibrary>` passes the prop only for a `blocked` verdict. This keeps the
     `onRequestEdit`/`onRequestClone` contract ("the card knows nothing about usage").
   - The button carries `aria-label="Delete <display name>"` and `data-delete-organism-id`. It uses the
     mockup's `.action-btn.delete` styling (`organism-library.html:334-341`: `--gol-danger` text,
     `--gol-danger` border on hover), with the house substitutions `ActionButton` already records.

7. **Dialog idiom and lifecycle (FD8, FD9).**
   - New `apps/web/components/organisms/OrganismDeleteBlockedDialog.tsx`, loaded through
     `next/dynamic({ ssr: false })` beside `<OrganismInUseDialog>`. The MUI Dialog stack stays out of
     `/organisms`'s first load.
   - It is composed like `<OrganismInUseDialog>` / `<DeleteBattleDialog>`: 440 px paper,
     `disableRestoreFocus`, `onTransitionExited`, `aria-labelledby` + `aria-describedby`, `BUTTON_SX`.
     The app keeps one dialog idiom.
   - The title is consequence-first: `Cannot delete <display name>`.
   - The background goes inert while the dialog is up (`useInertBackground`).
   - The dialog's content stays populated through the ~195 ms exit fade. It must not flash empty on the
     way out (the `DeleteBattleDialog` `battleName` precedent).
   - After the exit transition ends, focus returns to the card's Delete button, found by
     `[data-delete-organism-id="${CSS.escape(id)}"]`. The lookup is by DOM query and never by a captured
     element, because WebKit does not focus a `<button>` on click.

8. **Keyboard and a11y.** The dialog is keyboard-operable: focus is trapped, `OK` is focused on open,
   and Escape closes it. axe reports zero violations with the dialog open in each variant (battles,
   rules, both) **and** with a 40-name battle list. If `DialogContent` becomes a scroll region, it must
   be reachable (axe `scrollable-region-focusable`, the 4.20 D2 precedent; FD10). The Delete button's
   `--gol-danger` text passes contrast against the card surface: axe `color-contrast` in the e2e scan,
   with the card at rest and hovered.

9. **Scope: the Library card only.** No Delete control is built inside the editor. The UX doc's
   "Delete Organism" button at the bottom of Column 1 (`organism-editor-design.md:284-300, :573-583`) is
   not in the shipped editor mockup. The divergence is **recorded, not resolved** (FD1).
   - The open-battle (M7 live-grid) usage input stays **wired but unreachable**. The Library passes no
     `openBattle`, because no battle is mounted on `/organisms`.
   - FR-1.4's current-grid remedy variants ("Erase it from this grid…", "save this Battle to persist the
     removal…") are therefore **not** built. They are Story 4.24's, recorded in `deferred-work.md` (FD11).
   - No file under `packages/persistence` changes.

10. **Gates.** `npm run ci:dev` is green from the worktree root, with its real exit code recorded.
    `spec:check` passes on every ID written into a comment. Measure the `/organisms` bundle and
    **report** it against its 305 KB entry (297.5 KB after Story 4.20). The verdict module and the card
    change are eager, and the dialog is lazy. Do not raise the budget. If the measurement crowds it,
    say so and stop, and do not edit `scripts/check-bundle-size.mjs`.

## Tasks / Subtasks

- [x] **Task 1: read before writing (AC: all).**
  - [x] `packages/domain/src/usageIndex.ts` and `ruleReferenceIndex.ts`, both head comments end to
        end. Read the `placedOnLiveGrid` / erase-window hazard and the rules-vs-organisms split before
        writing the verdict.
  - [x] `packages/domain/src/index.ts:55-74`, the two barrel blocks the new export sits beside.
  - [x] `apps/web/components/organisms/OrganismLibrary.tsx` end to end, especially `:259-268`
        (`resource`, `summaries`, `usage`), `:421-433` (`onRequestEdit` via `resolveOrganismUsage`),
        and `:531-548` (the card map).
  - [x] `apps/web/components/organisms/OrganismCard.tsx`: the head comment ("Delete is 4.22's and joins
        the same row"), `CardActions`, `ActionButton` and its house substitutions, and the props
        contract comments.
  - [x] `apps/web/components/organisms/OrganismInUseDialog.tsx` and
        `apps/web/components/gallery/DeleteBattleDialog.tsx` (with its `useDeleteBattleDialog`). They
        are the two dialogs this one is composed from, and the second one owns the
        populated-through-exit and `useInertBackground` patterns.
  - [x] `apps/web/lib/organisms/usageLabels.ts`, the copy and resolvers this story reuses.
  - [x] The mockup, `clinical-lab-theme/organism-library.html`: `:314-349` (`.action-btn`,
        `.action-btn.delete`, disabled) and `:436-444, :648-675` (the delete markup and the demo's
        block/confirm branch).
  - [x] Re-read FD1–FD12 below.

- [x] **Task 2: `organismDeleteGuard.ts` and its test (AC: 1, 4).**
  - [x] The discriminated union `OrganismDeleteVerdict` plus `organismDeleteVerdict(organismId: string,
        usageIndex: UsageIndex, ruleIndex: RuleReferenceIndex, openBattle?: OpenBattleUsage | null)`.
        `battles: readonly OrganismUsageEntry[]` is exactly `resolveOrganismUsage(...)`.
        `referencingOrganismIds: readonly string[]` is exactly `referencingOrganismIds(...)`.
  - [x] `CONWAYS_CLASSIC_ID` is checked **first** (M9). Import it from `./defaultWorkspace`. Do not use
        the barrel, because importing your own package's barrel creates a cycle.
  - [x] The head comment says why the verdict lives here (the project-context rule quoted in AC1), why
        `protected` precedes usage, and why `blocked` carries **both** lists (FD4). It also names the
        consumers: 4.21's block dialog, 4.22's confirmation and disabled state, and 4.24's
        `openBattle`.
  - [x] Tests, all in `organismDeleteGuard.test.ts`:
    - protected with usage, and protected with none;
    - battles only; rules only; both; allowed;
    - a self-reference only, which yields `allowed`;
    - the `openBattle` union: a never-saved battle placing it yields `blocked` with a `null` battleId;
    - the erase-window case: a saved entry whose live grid no longer places it is still `blocked`,
      because Story 4.19's union must not be undone here;
    - one organism targeting it from two rules, which yields one `referencingOrganismIds` entry.
  - [x] Barrel: export `organismDeleteVerdict` and `export type { OrganismDeleteVerdict }` in a new
        commented block after the rule-reference block. ⚠️ `index.ts` is the file every two-lane sync
        collides on. `implement-next-story`'s `[[sync.rules]]` resolves it mechanically, so keep the
        addition a self-contained block and do not reorder existing lines.

- [x] **Task 3: copy in `apps/web/lib/organisms/deleteBlockCopy.ts` and its test (AC: 2, 3, 4).**
  - [x] In `usageLabels.ts`, **export** `battleCount` (currently module-private) and change nothing else
        there. `usageLabels.test.ts` then gains its singular/plural boundary case.
  - [x] `deleteBlockTitle(name)` returns `Cannot delete ${name}`.
  - [x] `battleBlockSentence(n)` returns `It is used in ${battleCount(n)}:`. The remedy is separate:
        `BATTLE_BLOCK_REMEDY` = `Remove it from those Battles, or delete the Battles, then try again.`
  - [x] `ruleBlockSentence(m)` returns `It is targeted by rules of ${m} ${m === 1 ? 'organism' : 'organisms'}:`.
        `RULE_BLOCK_REMEDY` = `Edit those rules to remove the reference, then try again.`
  - [x] Keep all of this in a module that **only the lazy dialog imports**, so the copy never enters
        `/organisms`'s first load. Do not put it in `usageLabels.ts`, which the eager footer path
        imports (FD5).
  - [x] Unit-test every string at the 1/2 boundary.

- [x] **Task 4: `<OrganismDeleteBlockedDialog>` and its test (AC: 2–5, 7, 8).**
  - [x] Props: `open`, `organismName: string` (already display-resolved), `battleNames: readonly string[]`,
        `referencingNames: readonly string[]`, `onClose(): void` and `onExited?(): void`. It is a pure
        function of its props: no repository, no `@gol/domain` import, no derivation.
  - [x] Structure:
    - `DialogTitle` = `deleteBlockTitle`;
    - for each non-empty list, a section holding a `DialogContentText` sentence, a `<ul>` of names and
      the remedy line;
    - one `DialogActions` holding `OK` (`autoFocus`, `variant="contained"`).
  - [x] `aria-describedby` points at the content wrapper, so both sections are the description.
  - [x] A long battle or organism name must not set the paper width. Wrap it with
        `overflowWrap: 'anywhere'` (the `CardName` precedent). A single dialog has no height-cap
        problem of the 4.20 kind, because `DialogContent` scrolls. Check axe at 40 names (FD10).
  - [x] Tests:
    - each variant renders the right sentences, counts and names;
    - both sections render in order;
    - `OK`, Escape and backdrop all call `onClose`;
    - there is no second button;
    - `organismName` stays rendered while `open` flips to false (exit fade);
    - axe is clean.

- [x] **Task 5: `<OrganismCard>` Delete (AC: 6).**
  - [x] Add an optional `onRequestDelete?(): void` prop, with a contract comment in the style of the
        existing ones. The card renders the third `ActionButton` **iff** the prop is present.
  - [x] Add a `danger` variant of `ActionButton`: color `var(--gol-danger)`, and `&:hover` borderColor
        `var(--gol-danger)`. Use a styled `shouldForwardProp` flag or a `data-danger` attribute selector
        (the `&[data-system]` precedent in this file), with no raw hex (AR-46). It needs no
        `transition`, per the file's recorded mid-fade axe trap.
  - [x] Update the head comment and the `CardActions` comment. Delete now lands in 4.21 **for blocked
        organisms only**, and 4.22 extends it to every card (allowed leads to the confirm dialog,
        Conway's Classic to disabled plus a message). The tab-stop policy comment gains the third stop
        where it renders.
  - [x] `OrganismCard.test.tsx`:
    - no Delete without the prop;
    - Delete with the prop, correctly labelled, and a click calls it;
    - Tab order Edit → Clone → Delete.

- [x] **Task 6: wire it in `<OrganismLibrary>` (AC: 1–7).**
  - [x] `const ruleIndex = useMemo(() => buildRuleReferenceIndex(loadedOrganisms), [loadedOrganisms]);`
        is memoized on the settled array, as `usage` is.
  - [x] Per card, compute `organismDeleteVerdict(organism.id, usage, ruleIndex)` with no `openBattle`
        (FD11). Pass `onRequestDelete` only when `verdict.kind === 'blocked'`. The cost is two map reads
        per card, the same class as the existing unmemoised filter scan. Do not add a per-card memo.
  - [x] Dialog state: `const [blocked, setBlocked] = useState<{ organismId; organismName; battleNames;
        referencingNames } | null>(null)` plus `open`. Resolve the names **at click time** from the
        same `summaries` / `loadedOrganisms` the verdict came from (FD7). Clear `blocked` only in
        `onExited`, then restore focus to `[data-delete-organism-id=…]`. `useInertBackground(blocked !==
        null)`.
  - [x] Only one dialog can be up at a time. The dialog is modal, so the rest of the page is inert
        while it is open. Guard against a Delete click landing while the editor or the in-use gate is
        mounted anyway (`editorMounted || gateMounted` → return). Pin the guard in a test.
  - [x] `OrganismLibrary.test.tsx`:
    - a placed organism's card has Delete and an unused one's does not;
    - Conway's Classic has no Delete even when it is placed;
    - a click opens the dialog with the battle names;
    - a rule-targeted organism gets the rules variant;
    - an organism that is both gets both sections;
    - the injected `organisms.delete` spy is **never** called;
    - focus returns to the Delete button after close;
    - the count in the dialog equals the count in the 4.17 warning for the same organism (the
      consistency AC).

- [x] **Task 7: e2e (AC: 2, 3, 5, 7, 8).**
  - [x] Extend `apps/web/e2e/organisms.spec.ts` with a `delete integrity blocks (Story 4.21)` block.
        Reuse `seedWorkspace` / `seedExtraOrganisms` / `buildSeedPayload` (`:3097-3160`). **Do not**
        add another payload builder. Extend the seed through the existing helper so it has one battle
        placing an extra organism and one organism whose rule targets another.
  - [x] Cover:
    - Delete is present only on the blocked cards;
    - the battle variant names the seeded battle;
    - the rule variant names the referencing organism;
    - OK and Escape close it, the organism is still in the grid and the count badge is unchanged;
    - after a reload the organism is still there (nothing was written);
    - focus is back on the Delete button;
    - zero console errors.
  - [x] Run one axe scan per variant with the dialog settled, using the block's existing convention (a
        300 ms settle, then `new AxeBuilder({ page }).analyze()`).

- [x] **Task 8: `deferred-work.md` (AC: 9).**
  - [x] Add this story's section:
    - FD1's editor Delete-surface divergence, pointed at Story 4.22 and the next UX touch;
    - FD2's transitional rendering, which Story 4.22 must remove;
    - FD11's unbuilt current-grid remedy variants and the `openBattle` argument, pointed at
      Story 4.24;
    - FD12's re-verify-before-write note for Story 4.22.
  - [x] Annotate in place, without deleting, the two card entries that name "4.21/4.22" (`:743-755` the
        rules sentence, `:775-788` the stat-cell semantics). 4.21 adds the Delete button only and does
        not reshape the card's content. Re-point both at **Story 4.22**, which renders Delete on every
        card.

- [x] **Task 9: gates (AC: 10).**
  - [x] Run `npm run ci:dev` from the worktree root and paste the real exit code. Never run `npm run ci`,
        and never pipe the command (`| tail` reports tail's status).
  - [x] Report the `/organisms` gzip figure the bundle stage prints against 305 KB.
  - [x] Record every command and its real output summary in the Dev Agent Record.

### Review Findings

Code review 2026-09-24 (Opus; Blind Hunter + Edge Case Hunter + Acceptance Auditor, review mode
`full`). 2 decision-needed, 11 patch, 1 defer, 9 dismissed as noise.

- [x] [Review][Decision] FD2: Delete renders only on blocked cards until 4.22. Is that acceptable on `main`? — The
  Blind Hunter adds a UX/a11y angle to the story's own open question. In this build every Delete a
  user can see is red, labelled `Delete X`, and **always refuses**. Unused organisms show no Delete
  at all, so a screen-reader user hears a destructive action that never deletes. Options:
  (a) accept the transitional state as built (4.22 removes it, as `deferred-work.md` records);
  (b) fold 4.22's first AC (confirm-and-delete, plus its toast host) into this story;
  (c) accept (a) but add `aria-haspopup="dialog"` to Delete. That stays true in 4.22 too, where
  Delete opens either this dialog or the confirm dialog.
  **Resolved 2026-09-25 (Sidiar): (a)** — the transitional state is accepted as built; Story 4.22
  removes it.
- [x] [Review][Decision] FD1: the editor Delete surface. — `organism-editor-design.md:284-300,
  :573-583` puts a "Delete Organism" button at the bottom of editor Column 1, but the shipped
  mockup has Delete only on the card. This story built the card only and recorded the divergence.
  Options: (a) build the editor button in Story 4.22, on the same verdict; (b) drop it in favour of
  the mockup and amend the UX doc; (c) leave it open for the next UX pass.
  **Resolved 2026-09-25 (Sidiar): (a)** — Story 4.22 builds the editor Column-1 "Delete Organism"
  button on the same verdict.
- [x] [Review][Patch] Create/Edit are not guarded while the block dialog is pending. On the first
  Delete of a session the lazy dialog chunk is still loading, so nothing is `aria-hidden` yet,
  nothing is inert, and Create/Edit can open the editor. The block dialog then lands on top of it,
  giving two stacked modals [apps/web/components/organisms/OrganismLibrary.tsx:569,631]
- [x] [Review][Patch] A card-Clone failure is published into the inert page while the block dialog
  is up. That is the exact failure the 2026-09-23 "publish once your window is gone" decision
  closed. The fix defers it to `handleDeleteExited`
  [apps/web/components/organisms/OrganismLibrary.tsx:637]
- [x] [Review][Patch] The "Delete while the editor is mounted is a no-op" test passes vacuously. It
  asserts synchronously, but the dialog is behind `next/dynamic`, so it could never be in the DOM on
  that tick, guard or no guard [apps/web/components/organisms/OrganismLibrary.test.tsx]
- [x] [Review][Patch] The barrel comment credits the `openBattle` argument to Story 5.4. It belongs
  to Story 4.24 (FD11) [packages/domain/src/index.ts:77]
- [x] [Review][Patch] `usageLabels.ts` became eager on `/organisms` through the Library's new
  import. Before this story only lazy chunks imported it. The comments in `usageLabels.ts` and
  `deleteBlockCopy.ts` claim the opposite, and the bundle note leaves it out
  [apps/web/lib/organisms/usageLabels.ts:17, apps/web/lib/organisms/deleteBlockCopy.ts:3]
- [x] [Review][Patch] e2e axe tests 4–6 capture no console errors. Task 7 and the Dev Notes require
  a capture on every test in the block [apps/web/e2e/organisms.spec.ts]
- [x] [Review][Patch] AC8: no e2e `color-contrast` scan of the Delete button when hovered
  [apps/web/e2e/organisms.spec.ts]
- [x] [Review][Patch] AC8/FD10: the 40-name axe check runs only in jsdom. With no layout there,
  `scrollable-region-focusable` can never fire, so the check needs a real-browser run
  [apps/web/e2e/organisms.spec.ts]. **The real-browser run found the violation:** it fired on
  `DialogContent`. The fix is FD10's prescription, the 4.20 D2 fix: each name list is capped
  (`min(30vh, 200px)`) and is itself the scroll region, with `tabIndex={0}` and `aria-labelledby`
  pointing at its sentence [apps/web/components/organisms/OrganismDeleteBlockedDialog.tsx]
- [x] [Review][Patch] Task 7: `seedDeleteBlockExtras` hand-builds a second battle payload instead
  of reusing `seedFillerBattlesFor` [apps/web/e2e/organisms.spec.ts]
- [x] [Review][Patch] The dialog's head comment cites FD7 for its composition idiom. The right
  reference is FD8 [apps/web/components/organisms/OrganismDeleteBlockedDialog.tsx:51]
- [x] [Review][Patch] No Library-level test checks that the dialog's content stays populated
  through the exit fade. The dialog-level test only proves MUI keeps the paper mounted
  [apps/web/components/organisms/OrganismLibrary.test.tsx]
- [x] [Review][Defer] A `next/dynamic` chunk-load failure leaves the window state set with no
  feedback [apps/web/components/organisms/OrganismLibrary.tsx:679] — deferred, pre-existing.
  Every lazy dialog on the page has the same shape (the editor, the in-use gate, and the Gallery's
  lazy dialogs).

## Dev Notes

### Forced decisions

- **FD1: the delete surface is the Library card, not the editor.** The shipped mockups put Delete
  **only** on the card (`organism-library.html:442, :469`, and the hard-block demo at `:653-672`). The
  editor mockup has no `.delete-organism-btn`. `organism-editor-design.md:284-300, :573-583` instead
  describes a "Delete Organism" button at the bottom of editor Column 1. The two conflict in the same way
  as the header/footer three-way divergence Story 4.3 recorded (`deferred-work.md:791-808`).
  - The card was chosen for three reasons. `<OrganismCard>` has carried the reserved slot since Story
    4.2. `<OrganismLibrary>` already holds `summaries`, `usage` and the library, so no new prop reaches
    the editor. And AR-2/AR-27 stays trivially satisfied.
  - **Record the divergence and do not resolve it.** Whether the editor also gets a Delete is the next
    UX touch's decision, and at the latest Story 4.22's (Task 8). ⚠️ Surfaced as a question below.
- **FD2: Delete renders only when blocked, until Story 4.22.** 4.21 owns the blocked paths and 4.22 owns
  the allowed path (the confirmation dialog, the delete, the toast and the refresh) and the protected
  path (a disabled button with its message). A Delete button on an unused card in 4.21 would do nothing,
  which is the NFR-4.1 dead affordance `OrganismCard.tsx`'s head comment already cites as the reason
  Delete was not shipped with Edit and Clone. The two stories merge to `main` separately, so the
  transitional state is real and has to be honest. Every Delete that renders does something true.
  - **Alternative, not taken:** fold 4.22's first AC (confirm-and-delete) into this story. It would
    remove the transitional state but blur a split the epic made on purpose, and it would carry 4.22's
    toast host (`deferred-work.md:2018`) with it. ⚠️ Surfaced as a question below.
- **FD3: one verdict and one order, in the domain.** `protected` beats usage (M9: "regardless of usage").
  Checking usage first would show a Conway's Classic that some battle places a battle block. That block
  implies the organism *becomes* deletable once removed, which is false. The verdict is a pure function
  of the two indexes and never of the repositories (the project-context referential-integrity rule).
  Story 4.22 consumes the same verdict for its `allowed` / `protected` branches. **Do not re-derive
  "blocked" in `apps/web`** as `entries.length > 0 || refs.length > 0`, because that is a second
  implementation the moment 4.22 lands.
- **FD4: `blocked` carries both lists.** FR-1.4 lists the two reasons independently, and PRD, UX and
  epics are all silent on the case where both apply. Showing only the first reason sends the user away
  to fix battles and back to a second, unannounced block. One dialog with two sections tells the whole
  truth once. Battles come first, following the order of the ACs, the PRD and the UX doc.
- **FD5: the copy lives in a lazy-only module; `battleCount` is exported and not duplicated.**
  `usageLabels.ts` is imported by the eager editor-footer path. Adding the block strings there puts them
  in the first load for a dialog most sessions never open. `deleteBlockCopy.ts` is imported only by the
  dialog chunk. The pluraliser is shared, so the dialog's "N Battles" is the same string the footer and
  the 4.17 warning print.
- **FD6: the rule-block M counts organisms; the footer's M counts rules.** The PRD's sentence is "targeted
  by rules of [M] **organism(s)**" and the footer's is "Targeted by [M] organism **rule(s)**" (FR-1.7).
  These are two numbers over one scan (`ruleReferenceIndex.ts` head comment). The dialog uses
  `referencingOrganismIds(...).length`. A test with one organism targeting this one from two rules pins
  footer M = 2 against dialog M = 1. The epic's cross-surface consistency AC (4.20 AC5) is about the
  **battle** count, and that one is identical on all three surfaces.
- **FD7: the names and the verdict come from the same settled data.** Resolve names at click time from
  `summaries` and the full `loadedOrganisms`. Do not use `visible` (search-filtered) or `sorted` subsets
  that could drop a referencing organism, and do not issue a fresh `list()` that could disagree with the
  verdict. One `resource.data` gives one answer.
- **FD8: the dialog is a sibling of the gate and not driven by `useOrganismEditorModal`.** That hook owns
  the editor and gate lifecycle (`'library'` entry, the `proceedRef` handoff). The delete block never
  opens the editor, so threading it through the hook would add a third window to a machine that has no
  use for it. Local state in `<OrganismLibrary>` plus `useInertBackground` is the
  `useDeleteBattleDialog` shape at smaller size. If the local state grows past roughly 30 lines, extract
  `useOrganismDeleteBlock` into `lib/organisms/` beside the other hook. It must not go inside the dialog
  file, because the dynamic import is load-bearing (the `useOrganismEditorModal` header records why).
- **FD9: focus returns by DOM query after exit.** The rules are those of `useOrganismEditorModal` and
  `refocusCloneRef`:
  - `disableRestoreFocus` on the Dialog;
  - on `onExited`, `document.querySelector('[data-delete-organism-id="…"]')?.focus()` with
    `CSS.escape`. Ids are arbitrary strings (`'conways-classic'` is one);
  - never a captured element, because WebKit does not focus a `<button>` on click;
  - never MUI's restore, which reads `activeElement` at open time.
- **FD10: live regions and scroll.** The dialog adds no `role="alert"`/`role="status"`. The dialog
  **is** the announcement: a dialog taking focus is a context change. Do not add a page-level message on
  close. Any such node would be inserted into the inert subtree (the project-context live-region trap).
  With 40 names, `DialogContent` overflows. Verify with axe whether `scrollable-region-focusable` fires.
  If it does, the 4.20 D2 fix applies: the list is the scroll region, with `tabIndex={0}` and
  `aria-labelledby`.
- **FD11: `openBattle` is threaded but unreachable.** The Library has no mounted battle, so it passes
  nothing, and the verdict's `openBattle` parameter exists so Story 4.24 adds one argument in one place.
  FR-1.4's current-grid remedy variants (`prd.md:134`) are **not** written here:
  - "it is placed on the current grid. Erase it from this grid, then try again";
  - "save this Battle to persist the removal, then try again", which is the erase-window case where the
    only block is `{ battleId: openBattle.id, placedOnLiveGrid: false }`.

  The entry type does not force them (unlike 4.20's `null` label), and unreachable copy written now is
  untested guesswork. `usageBattleNames` already labels a `null` id `Current Battle (unsaved)`, so the
  **list** is already total. Record the remedy variants for Story 4.24.
- **FD12: a note for Story 4.22, re-verify before any write.** 4.21 only reads, so a stale verdict costs
  at most a wrong message. 4.22's confirm path **writes**, and must re-derive the verdict from a fresh
  `Promise.all([organisms.list(), battles.list()])` immediately before `organisms.delete`. Otherwise a
  battle saved in another tab since the Library loaded is deleted out from under. Record this in
  `deferred-work.md`. Do not build it.

### What already exists (reuse, do not rebuild)

| Need | Use | Where |
|---|---|---|
| Battle usage, including the M7 union | `resolveOrganismUsage(usage, id, openBattle?)` | `packages/domain/src/usageIndex.ts` |
| Rule references | `buildRuleReferenceIndex`, `referencingOrganismIds` | `packages/domain/src/ruleReferenceIndex.ts` |
| Protected id | `CONWAYS_CLASSIC_ID` | `packages/domain/src/defaultWorkspace.ts` |
| Battle names (Untitled / unsaved fallbacks) | `usageBattleNames(entries, summaries)` | `apps/web/lib/organisms/usageLabels.ts` |
| Organism names (Unnamed / Unknown fallbacks) | `referencingOrganismNames(ids, library)` | same |
| Subject's own display name | `toDisplayOrganism(organism).name` | `apps/web/lib/displayOrganisms.ts` |
| Pluraliser | `battleCount` (export it) | `usageLabels.ts` |
| Inert background | `useInertBackground(active)` | `apps/web/lib/useInertBackground.ts` |
| Dialog composition | `OrganismInUseDialog.tsx`, `DeleteBattleDialog.tsx` | `apps/web/components/{organisms,gallery}/` |
| Danger token | `--gol-danger` (+ `-hover`) | `apps/web/app/themes.css:59-68` |

### Current state of the files this story modifies

- **`OrganismCard.tsx`**: two actions (Edit, Clone), with the `ActionButton` substitutions recorded
  (`--gol-border-control`, no transition, a `:focus-visible` ring). The head comment states that Delete
  is 4.22's and why. The `system` prop is passed by the Library. **Preserve:** the two-stop tab policy
  for cards with no Delete, the `SystemTag` real text, and every existing `data-*` hook.
- **`OrganismLibrary.tsx`**:
  - one `useAsyncResource` over both lists (4.17 FD2), and `usage` memoized on `summaries`;
  - `onRequestEdit` goes through `resolveOrganismUsage`;
  - the clone writer with its queued-error publish, and the editor and gate dynamic boundaries.

  **Preserve:** the one-resource rule (the verdict reads `'ready'` data only, because cards render only
  in `ready`), the clone error queue and `refocusCloneRef`, and the gate's `onGateExited` composition.
- **`usageLabels.ts`**: one visibility change (`export function battleCount`). The 4.20 AC5 contract is
  untouched.
- **`packages/domain/src/index.ts`**: additive block only.

### Anti-patterns (these compile and pass tests, and are still wrong)

- ❌ `usage.get(id)?.length` for N. Use `resolveOrganismUsage`, or 4.24's `openBattle` desynchronises
  the surfaces again.
- ❌ `ruleIndex.get(id)?.length` for the dialog's M. That is the RULE count (FD6).
- ❌ Filtering self-references in the Library. The index already dropped them (Decision E.5).
- ❌ A `battles` or `organisms` repository reaching the dialog or the card (AR-2/AR-27).
- ❌ `organisms.delete(...)` anywhere in this diff.
- ❌ A second `role="status"` on the page. `e2e/organisms.spec.ts`'s `getByRole('status')` is unscoped
  and every badge assertion would go strict-mode red.
- ❌ `transition: all` on the Delete button. The mid-fade axe trap is recorded in `ActionButton`.
- ❌ Raw hex for the danger colour (AR-46).

### Project Structure Notes

- New files:
  - `packages/domain/src/organismDeleteGuard.ts` and `.test.ts`;
  - `apps/web/lib/organisms/deleteBlockCopy.ts` and `.test.ts`;
  - `apps/web/components/organisms/OrganismDeleteBlockedDialog.tsx` and `.test.tsx`.
  - Non-component files are camelCase, never dotted.
- Modified:
  - `packages/domain/src/index.ts`;
  - `apps/web/lib/organisms/usageLabels.ts` (plus its test);
  - `apps/web/components/organisms/OrganismCard.tsx` (plus its test);
  - `apps/web/components/organisms/OrganismLibrary.tsx` (plus its test);
  - `apps/web/e2e/organisms.spec.ts`;
  - `docs/implementation-artifacts/deferred-work.md`.
- `packages/persistence` is untouched. The repository `delete` stays unconditional by design
  (`repositories.ts:37-43`), with the guard applied by the caller.
- **Lane note:** the only file shared with the Epic 5 lane is the `@gol/domain` barrel, whose collision
  `[[sync.rules]]` resolves. No Epic 5 story reads any surface this story reshapes. Story 5.4's closure
  consumes `ruleTargetIds`, which is unchanged.

### Testing standards

- Domain: Vitest, 100% of the new file (the ≥90% per-file gate). No repository in the test (the
  project-context rule).
- Web: RTL with the in-memory fakes from `@gol/test-utils`. Do not hand-roll a fake repo. axe via the
  existing unit helpers.
- e2e: Playwright, extending the existing spec. Chromium locally via `ci:dev`, and the four-browser
  matrix is CI's job. Remember the WebKit button-focus difference (FD9) when asserting focus.
- No coverage-padding tests.

### Previous story intelligence (4.19, 4.20)

- 4.19 settled that the usage union never lets the live grid *remove* a saved reference (the
  erase-window case). The verdict must inherit that, not re-decide it, so pin it in the verdict test.
- 4.20's review found and fixed the traps below. Each applies to a new dialog here, adapted:
  - Escape closing the wrong layer. Not an issue here: this dialog is the top layer, and the editor is
    not mounted.
  - WebKit (Mac) not focusing a clicked `<button>`, which breaks focus-based assertions. Use
    `toBeFocused` only after keyboard paths or after an explicit restore.
  - An e2e "still open" check passing during a ~195 ms fade. Wait out the 300 ms settle before any
    "dialog gone" or "dialog still there" assertion.
  - Console-error capture on every test in the block.
- The owner rules on review decisions one at a time. Keep open design points out of the code and in the
  questions below.

### Git intelligence

The recent `main` history is the 4.20 merge (#75), the 5.5 merge (#78) and a BattlePage title-flake fix
(#79). 4.20's final commit `2638f2b` ("apply third code review fixes") is the last touch to
`OrganismLibrary.tsx` / `usageLabels.ts`. Nothing in lane 5 has touched `components/organisms/**`.

### References

- `docs/planning-artifacts/epics.md:1240-1250` has Story 4.21's ACs. Its neighbours are `:1227-1238`
  (4.20, the consistency AC) and `:1252-1262` (4.22, the confirm, toast, Conway's Classic disabled and
  refresh). `:240` has UX-DR15.
- `docs/planning-artifacts/prds/prd-GameOfLife-2026-05-26/prd.md:129-139` has FR-1.4, which gives the
  copy, the current-grid accounting, rule-reference accounting, the protected default and the integrity
  guarantee. `:154-155` has FR-1.7.
- `docs/planning-artifacts/architecture.md:234` has Decision E.5, and `:269-274` has Decision H / H.3 /
  H.4. `:353` has M7 and `:355` has M9.
- `docs/planning-artifacts/rfcs/RFC-005-application-state-modes-undo.md:303-322` has Decision 8 (the
  usage index, the FR-1.4 block and the rule-reference index).
- `docs/planning-artifacts/ux-designs/ux-GameOfLife-2026-05-27/ux-design-complete.md:686-699` has the
  delete exit point and the warning copy. `organism-editor-design.md:284-300, :573-583` has the editor
  Delete surface (FD1). `clinical-lab-theme/organism-library.html:314-349, :436-444, :648-675` has the
  card Delete.
- `docs/implementation-artifacts/4-19-usage-rule-reference-derivations.md` and
  `4-20-usage-visibility-ui.md` (FD1–FD14 and the three review passes).
- `docs/project-context.md` covers referential-integrity-is-core, the live-region trap, the repository
  seam, `ci:dev`, and the pipe-swallowed exit codes.

### Questions for Sidiar (saved for the end; defaults are written into the story)

1. **FD2**: Delete renders only on blocked cards until 4.22. Is that acceptable as a transitional
   state on `main`, or do you want 4.22's confirm-and-delete folded into this story?
2. **FD1**: the card is the delete surface, and the editor's Column-1 "Delete Organism" (UX doc) is
   recorded as a divergence. Should it be built in 4.22, or dropped in favour of the mockup?

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5 (`claude-sonnet-5`), the story file's `Dev Model: sonnet` call.

### Debug Log References

Every command run from the worktree root (`.claude/worktrees/lane-epic-4`) unless noted, none piped:

| Command | Result |
|---|---|
| `npx vitest run --coverage` (in `packages/domain`) | 222 passed (10 new, `organismDeleteGuard.test.ts`), 100% on every file under the ≥90% per-file gate |
| `npx vitest run components/organisms/OrganismCard.test.tsx` (in `apps/web`) | 24 passed (5 new, Delete) |
| `npx vitest run components/organisms/OrganismDeleteBlockedDialog.test.tsx lib/organisms/deleteBlockCopy.test.ts lib/organisms/usageLabels.test.ts` (in `apps/web`) | 28 passed (all new/extended) |
| `npx vitest run components/organisms/OrganismLibrary.test.tsx` (in `apps/web`) | 67 passed (10 new, delete integrity blocks) |
| `npx vitest run components/organisms/ lib/organisms/` (in `apps/web`) | 720 passed — no regressions |
| `npx playwright test --project=chromium e2e/organisms.spec.ts -g "delete integrity"` | 6 passed (39.6s) |
| `npx playwright test --project=chromium e2e/organisms.spec.ts` (full file) | 132 passed (1.5m) — no regressions |
| `npm run spec:check` | clean — 274 cited ids resolve |
| `npm run boundary:check` | clean |
| `npm run ci:dev` | **exit 0** (redirected to a file, status read from `$?`, never piped) |

`ci:dev` detail: typecheck 5/5 · lint 0 errors · format:check clean (after one `prettier --write` pass
on the new/edited files) · spec:check clean · boundary:check clean · coverage — `@gol/domain`,
`@gol/simulation`, `@gol/persistence`, `@gol/test-utils` all green under their gates, `web`
test:coverage green (no gate, per project-context) · build:standalone 5/5 · bundle:check all five
routes within budget · bench **13.232 ms frame against the 16.667 ms budget** (3.435 ms headroom,
20.6% of the frame) · e2e Chromium — **270 passed, 1 skipped** (pre-existing, unrelated to this
story — not in `organisms.spec.ts`), **0 failed** (3.3m).

**Bundle, AC10 (reported, not gated up):** `/organisms` first-load JS **298.9 KB gzip against its
305 KB budget — 6.1 KB headroom** (up from 297.5 KB after Story 4.20 — this story's eager delta is
`organismDeleteVerdict` + `buildRuleReferenceIndex` wired into `<OrganismLibrary>`, and the card's
third `ActionButton` + its `[data-danger]` styles; `<OrganismDeleteBlockedDialog>` and
`deleteBlockCopy.ts` are behind the `next/dynamic` boundary and do not reach this number).
`scripts/check-bundle-size.mjs` was **not** edited. Within budget — no action needed.

### Completion Notes List

- **Task 2 — `packages/domain/src/organismDeleteGuard.ts`.** `organismDeleteVerdict` consumes
  `resolveOrganismUsage` and `referencingOrganismIds` (never re-derives either); `protected` (M9,
  `CONWAYS_CLASSIC_ID` imported from `./defaultWorkspace`, not the barrel, to avoid a cycle) is
  checked before either axis is read. `blocked` carries both lists whenever either is non-empty
  (FD4). Barrel export added as a new, self-contained block after the rule-reference block per the
  sync-collision note. 100% coverage, all 10 cases from the story's own list pinned, including the
  self-reference-yields-`allowed` case and the erase-window `openBattle` case.
- **Task 3 — `apps/web/lib/organisms/deleteBlockCopy.ts`.** `battleCount` exported from
  `usageLabels.ts` (module-private → exported, nothing else changed there) and reused, so the
  dialog's "N Battles" is the identical string the footer and the 4.17 warning print. The four copy
  functions/constants live in this module alone — nothing else imports it, so it stays behind the
  lazy dialog's chunk. Boundary-tested at 1/2.
- **Task 4 — `apps/web/components/organisms/OrganismDeleteBlockedDialog.tsx`.** Composed like
  `<OrganismInUseDialog>`/`<DeleteBattleDialog>` (440px paper, `disableRestoreFocus`,
  `onTransitionExited`, `aria-labelledby`/`aria-describedby`, `BUTTON_SX`). A pure function of its
  props — no repository, no `@gol/domain` import. Renders a section per non-empty list, battles
  first; exactly one action (`OK`, autoFocus, `variant="contained"`); no live region of its own
  (FD10 — the dialog itself is the announcement). 18 tests: both variants, "both" ordering, the
  one-button/no-second-button pin, OK/Escape/backdrop all calling `onClose`, the populated-through-
  exit-fade case, and axe clean in every variant plus a 40-name list.
- **Task 5 — `<OrganismCard>` Delete.** New optional `onRequestDelete?(): void` prop; the third
  `ActionButton` renders iff the prop is present (never a boolean). `[data-danger]` attribute
  selector for the red variant (the `&[data-system]` precedent in this file) — no raw hex, no new
  `transition`. Head comment, `CardActions` comment and the tab-stop-policy comment all updated to
  record the third, conditional stop. 5 new tests: absence without the prop, presence + label +
  `data-delete-organism-id` with it, the click contract, the Edit→Clone→Delete tab order, and axe
  clean with Delete rendered.
- **Task 6 — wiring in `<OrganismLibrary>`.** `ruleIndex` memoized on `loadedOrganisms` beside
  `usage`. Per card, `organismDeleteVerdict(organism.id, usage, ruleIndex)` (no `openBattle`, FD11)
  decides whether `onRequestDelete` is passed — two map reads per card, no per-card memo, matching
  the existing unmemoised filter-scan class. New local state (`blocked` / `deleteDialogOpen`) is the
  `useDeleteBattleDialog` shape at smaller size, deliberately NOT threaded through
  `useOrganismEditorModal` (FD8): its own `useInertBackground(blocked !== null)` call and its own
  focus-restore effect, keyed on `blocked` clearing in `onExited` — the two-hooks-in-one-component
  shape is safe here because the delete dialog and the editor/gate window never overlap (the
  `requestDeleteOrganism` guard bails while `editorMounted || gateMounted`, and the reverse
  direction needs no guard because THIS dialog's own inert background already makes every other
  control unreachable while it is open). Names resolved at click time from the same
  `summaries`/`loadedOrganisms` the verdict came from (FD7), through `usageBattleNames`/
  `referencingOrganismNames` — never the search-filtered `visible`. 10 new tests, including the
  battle-count-consistency-with-the-4.17-warning pin and the programmatic-caller guard (fired via
  `fireEvent.click` on a raw DOM lookup, since `screen.queryByRole` already excludes an inert
  subtree — so the test pins the component's own guard, not jsdom's absence of real `inert`
  click-suppression).
- **Task 7 — e2e.** One new `test.describe` block plus one new seed helper,
  `seedDeleteBlockExtras` — registered after `seedWorkspace`/`seedExtraOrganisms`, adding one extra
  SEEDED battle ("Glider Gauntlet", placing the merged Glider — the battle-only variant) and two
  extra organisms (`Vector Hunter`, whose rule targets the newly added, nowhere-placed `Silent
  Vector` — the rule-only variant). No second payload builder. 6 tests: presence gating, the battle
  variant (name, OK, unchanged storage/badge, survives a reload), the rule variant (name, Escape,
  focus return), and three axe scans (battle / rule / "both", the last using the mock workspace's
  own Aggressive Colonizer↔Chaotic Spreader reference for free).
- **Task 8 — `deferred-work.md`.** New "Story 4-21-delete-integrity-blocks implementation" section
  recording FD1 (editor Delete surface, still open), FD2 (the transitional blocked-only rendering,
  which 4.22 must remove), FD11 (`openBattle`/current-grid remedies, pointed at 4.24) and FD12
  (re-verify-before-write, pointed at 4.22), plus both open owner questions. The two existing
  "4.21/4.22" card entries (`:753`, `:786` after the edit) are re-pointed to Story 4.22 only, since
  this story added the Delete button alone and left the stat block/rules-sentence untouched.
- **Scope calls implemented at their stated default**, both left as open questions for Sidiar (not
  resolved by this run): FD1 (Delete stays a card-only affordance; the editor's Column-1 button is
  not built) and FD2 (Delete renders only on `blocked` cards; 4.22's confirm-and-delete was not
  folded in here).

### File List

New:

- `packages/domain/src/organismDeleteGuard.ts`
- `packages/domain/src/organismDeleteGuard.test.ts`
- `apps/web/lib/organisms/deleteBlockCopy.ts`
- `apps/web/lib/organisms/deleteBlockCopy.test.ts`
- `apps/web/components/organisms/OrganismDeleteBlockedDialog.tsx`
- `apps/web/components/organisms/OrganismDeleteBlockedDialog.test.tsx`

Modified:

- `packages/domain/src/index.ts`
- `apps/web/lib/organisms/usageLabels.ts`
- `apps/web/lib/organisms/usageLabels.test.ts`
- `apps/web/components/organisms/OrganismCard.tsx`
- `apps/web/components/organisms/OrganismCard.test.tsx`
- `apps/web/components/organisms/OrganismLibrary.tsx`
- `apps/web/components/organisms/OrganismLibrary.test.tsx`
- `apps/web/e2e/organisms.spec.ts`
- `docs/implementation-artifacts/deferred-work.md`
- `docs/implementation-artifacts/sprint-status.yaml`
- `docs/implementation-artifacts/4-21-delete-integrity-blocks.md` (this file)

### Change Log

- 2026-09-24 — Story 4.21 implemented: the domain delete-verdict (`organismDeleteVerdict`), the
  block dialog and its copy module, the card's conditional Delete action, the Library's wiring
  (verdict, dialog lifecycle, focus restore, the programmatic-caller guard), 6 new e2e cases, and a
  new `deferred-work.md` section (plus two existing entries re-pointed). `npm run ci:dev` exit 0.
  Status → review.
- 2026-09-24 — Code review (Opus). All 11 patches applied:
  - The Create/Edit guards and the deferred clone-error publish for the block dialog's window
    (`deleteWindowRef`).
  - A non-vacuous editor-mounted guard test, plus three new Library tests (the lazy-chunk window,
    content held through the exit fade, the clone-error deferral). All four were verified to fail
    against the pre-review Library.
  - FD10's list scroll regions, found by the new real-browser 40-name axe scan.
  - Two new e2e cases (hover contrast; 40 names) and console capture on every test in the block.
  - The battle-only seed moved onto `seedFillerBattlesFor`.
  - Comment corrections: the barrel's 4.24 pointer, `usageLabels.ts` now eager, and FD7 → FD8.

  One item deferred (lazy-chunk load failure, pre-existing). FD1 and FD2 are left as open
  `[Review][Decision]` items, so Status → in-progress.
- 2026-09-25 — Sidiar resolved both review decisions, neither needing a code change here: FD2 (a),
  the blocked-only Delete is accepted as a transitional state; FD1 (a), the editor's Column-1
  "Delete Organism" button is built in Story 4.22 on the same verdict (recorded in
  `deferred-work.md`). Status → done.

Dev Model: sonnet   # follows established patterns (4.19's domain derivations, 4.17/4.20's lazy dialog + focus-restore idiom, the card's ActionButton); the only new type is a small verdict union 4.22 consumes as-is
Proposed lane gate: none

---

This story was implemented with the 'Implement next story' skill with the following stats:

| Phase | Agent model | Agents | Active | Wall clock | Input | Output | Cache write | Cache read | Total tokens |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Step 0 — re-entry guard | — | 0 | 21s | 21s | 18 | 2,577 | 7,638 | 506,992 | 517,225 |
| Step 1 — create | opus-5-5 | 1 | 6m 23s | 6m 23s | 98 | 3,119 | 292,712 | 5,077,865 | 5,373,794 |
| Step 2 — implement | sonnet-5 | 1 | 32m 56s | 32m 56s | 654 | 15,110 | 752,406 | 79,703,388 | 80,471,558 |
| Step 3 — review + PR | opus-5-5 | 4 | 13m 18s | 13m 18s | 336 | 12,373 | 832,211 | 15,967,287 | 16,812,207 |
| _of which the orchestrator_ | opus-5-5 | — | — | — | 58 | 13,894 | 34,862 | 1,837,070 | 1,885,884 |
| **Total (create → PR ready)** | | 6 | **52m 58s** | 52m 58s | 1,106 | 33,179 | 1,884,967 | 101,255,532 | **103,174,784** |

Run started 2026-09-24 20:23 CEST; wall clock runs to the point the run stopped for the owner's review. No idle gaps were excluded; Active and Wall clock agree. (A gap counts as idle above 15 min.) Each phase row covers the phase agent, any agents it spawned, and the orchestrator's own turns in that window — the orchestrator row breaks its share out again, it is not additional. Cache reads dominate the token totals and are billed at a fraction of input rate, so read the Input and Output columns for effort and the total only as a ceiling. The orchestrator's final turn is still being written when these numbers are taken.
