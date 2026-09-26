---
baseline_commit: d61aec5e76ad0ef1e1e215bde4c8da434582c7c1
---

# Story 4.24: Edit Organism from Battle

Status: in-progress

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a user,
I want to tweak an organism mid-battle-design,
so that I can adjust behavior without losing my grid.

## Acceptance Criteria

Epics source (`docs/planning-artifacts/epics.md` §Story 4.24) comes first, verbatim. The numbered
ACs after it are the implementation-level contract this story is reviewed against.

> **Given** the battle roster, **When** Epic 4 lands, **Then** the per-row ✎ pencils render for the
> first time (FR-3.3 pencil affordance; spec §3.4)
> **Given** a pencil, **When** clicked, **Then** the editor opens as a modal over the mounted
> `<BattlePage>` — no route change; the unsaved grid, undo ring, and battle dirty state are
> preserved beneath (FR-3.12, M5, AR-33)
> **And** the in-use warning uses the battle variant: Edit Anyway / Cancel only, and the header reads
> "◄ Back to Battle" (FR-1.3, UX-DR5)
> **Given** Save & Close, **When** completed, **Then** the battle grid re-renders with the updated
> organism, with no battle save required (FR-3.12)

"Save & Close" in the last line is stale. Story 4.16 Task 11 made Save keep the editor open, with
Back / ✕ / Escape returning to the entry context (`organism-editor-design.md` "Exit Points", amended
2026-09-22). This story reads that line as **"Save, then Back to Battle"**, which the
`deferred-work.md` entry "The battle-origin flows still specify 'Save & Close'" asks for.

1. **Pencils render (FR-3.3, spec §3.4).** Each roster row in the Lab sidebar's Organisms section
   gets an edit button beside its selection `<Row>` button, inside the same `<li>`. It is never
   nested inside the row button (see the `OrganismRoster.tsx` `Row` comment on why). The button:
   - shows the `✎` glyph, `aria-hidden`;
   - has the accessible name `Edit <organism name>` and `title="Edit organism"`;
   - carries `data-edit-organism-id={organism.id}`;
   - follows the mockup's `.organism-edit-btn` (26×26, 1px `--gol-border`, `--gol-text-secondary`,
     accent border and text on hover and focus-visible, no raw hex per AR-46, reduced-motion safe).
   It renders **only when an `onEditOrganism` prop is passed** (spec §3.3/§3.4 `onEditOrganism?(id)`).
   No pencil renders in the degraded `libraryUnavailable` branch, next to the Eraser, or in Run mode,
   because Run has no roster.
2. **A pencil acts on its own row and leaves selection alone (FD1).** Activating it opens the edit
   flow for that row's organism. It does not change `selectedTool` or `aria-pressed` on any row, and
   it does not start a paint stroke.
3. **Usage is counted at click time, with the open battle included (M5, M7, Decision H, FD2).** On
   activation `<BattlePage>` calls `repositories.battles.list()` and computes usage with
   `resolveOrganismUsage(buildUsageIndex(summaries), id, openBattle)`. `openBattle` is:
   - `id`: `saveStamp?.id ?? loadedIdentity?.id ?? null`, i.e. `persistedId`;
   - `organismIds`: the ids with `count > 0` in `computeEditorGridStats(grid, rosterIds).perOrganism`
     (the placed set, never `rosterIds`; see the `OpenBattleUsage` doc).
   - **N ≥ 1:** the in-use warning opens first.
   - **N = 0:** the editor opens directly. This is the case of an organism added to the session
     roster but never painted and used nowhere else (Decision H.2), and matches the Library's 4.17
     rule.
   - Re-entrancy: a second pencil activation while the fetch is in flight, or while any window is
     mounted, is a no-op.
   - **Failure:** if `list()` rejects, no dialog opens. An alert appears in the Lab's existing
     `saveError` slot, reading `Couldn't check where this organism is used, so it can't be edited
     right now.` A later save, export or pencil attempt clears it.
4. **The editor opens over the mounted page (FR-3.12, M5, AR-33).** No route change: the URL stays
   the same and `<BattlePage>` never unmounts. The editor is the same lazily-loaded
   `<OrganismEditorModal>` as the Library's, with `origin="battle"`. Its header's Back reads
   `← Back to Battle` (the shipped `backLabelFor`; `←` is the house glyph, 4.3 FD3). It opens fully
   populated on the organism (4.17 AC). Throughout the editor's and the gate's open and exit windows:
   - the page behind is `inert`;
   - `grid`, the undo ring (`canUndo` and what Undo restores), `battleName`, `isDirty` / `data-dirty`
     and the selected tool are unchanged;
   - no `beforeunload` listener is added or removed (`useDirtyGuard` keys on `isDirty` alone);
   - `useLeaveGuard` / `<UnsavedChangesDialog>` never opens.
5. **The battle variant of the in-use warning (FR-1.3, M5, FD3).** `<OrganismInUseDialog>` gains an
   `origin: OrganismEditorOrigin` prop.
   - **`'battle'`:** exactly two actions, `Cancel` (autofocused, first) and `Edit Anyway`
     (contained, last). No Clone & Edit exists in the DOM, and no clone code path is reachable from
     the battle origin (`useOrganismEditorModal('battle', …)` receives no `onCloneAndEdit`). The body
     sentence is the battle-variant copy (FD3).
   - **`'library'`:** unchanged: three actions and the verbatim PRD sentence.
   - The title stays `Used in N Battle(s)` (`battleCountLabel`), counting the open battle.
   - **Edit Anyway** opens the editor only after the gate's exit (the existing `proceedRef` handoff).
     **Cancel**, Escape and backdrop change nothing, and focus returns to the pencil.
6. **The warning's count is expandable (FR-1.3 "expandable to reveal which Battles per FR-1.7", M7;
   the `deferred-work.md` 4-17 entry "The DIALOG's half is still open", which stands on this story).**
   In **both** variants the gate renders the same `<UsageIndicator>` the editor footer uses, below
   the body sentence. It shows the read-only battle-name disclosure and, when M > 0, the "Targeted
   by [M] organism rule(s)" disclosure. Names only, no navigation.
   - `requestEdit` takes the resolved usage (names, rule count, referencing names), not a bare count.
   - The Library's `onRequestEdit` passes the same derivation its footer uses.
   - Escape layering inside the gate follows 4.20 D5: the first Escape closes an open panel only, and
     the next one cancels the gate.
7. **Live usage in the battle-origin editor (M7, RFC-005 Decision 8, FD4).** The modal gains an
   optional `openBattle?: { id: string | null; name: string; organismIds: readonly string[] } | null`
   prop. It forwards `{ id, organismIds }` to `resolveOrganismUsage` for its footer.
   `usageBattleNames` gains an optional open-battle `{ id, name }` input, and labels:
   - a never-saved open battle (`battleId === null`) as `Current Battle (unsaved)`;
   - an entry whose `battleId === openBattle.id` by the **live** name (through `battleDisplayName`),
     not the stored summary name.
   The Library passes no `openBattle`, so its behaviour is unchanged. On `/battle/new`, the footer
   and the gate both list `Current Battle (unsaved)`, which is now asserted through the UI (the
   `deferred-work.md` 4-20 entry).
8. **Return: the grid re-renders, no battle save needed (FR-3.12, FR-7.15, FD5).** If the session
   saved at least once, then after the editor has fully exited:
   - `<BattlePage>` adopts the last saved record (the hook's close-time `onSaved`);
   - the roster row (name, chip, shared-colour warning), the dish's cell colours and the add-dropdown
     reflect the saved organism;
   - `isDirty` is unchanged (a clean battle stays clean, a dirty one stays dirty);
   - the grid's cells and roster order are unchanged (no ref shifts, no undo entry).
   If the session never saved, nothing changes. The next Lab → Run toggle runs the updated rules,
   because `runOrganisms` recompiles on its new identity.
9. **No Delete from the battle origin (FD6).** The battle-origin editor gets no `onRequestDelete`,
   so it renders no Delete button (the 4.22 FD11 "renders iff present" contract). The
   `organismDeleteVerdict` `openBattle` argument and FR-1.4's current-grid remedy copy stay unwritten
   and are re-pointed in `deferred-work.md`.
10. **Focus and unsaved-changes behaviour carry over unchanged (4.23, FD7).** The editor's own
    unsaved-changes guard works exactly as in the Library (Discard / Keep Editing / Save), and it is
    independent of the battle's dirty flag in both directions. On close, focus returns to the pencil
    that opened it (`[data-edit-organism-id]`, looked up at restore time).
11. **Lab-only, one simulation surface (4.15 hand-off, 3.19 lane gate).** The pencil exists only in
    Lab. The editor's preview `useSimulation` therefore never coexists with a Run view. The Run
    hotkeys (`useSimulationHotkeys`, Run-only, with its `[role="dialog"]` presence check) are not
    touched. A Lab → Run → Lab round trip after an edit renders the pencils again, with focus
    behaviour unchanged.
12. **Bundle.** The editor modal and the in-use gate reach `/battle` and `/battle/new` only through
    `next/dynamic` (`ssr: false`), requested on first use. `useOrganismEditorModal` is imported
    statically: it is a hook, and it imports the modal and gate as **types only**. If either route
    grows past its 8 KB allowance, refresh its baseline in this PR (`npm run build:standalone` then
    `npm run bundle:baseline`, never a hand edit).
13. **Tests and gate.**
    - **Unit:** the `OrganismRoster` pencil tests (render iff prop, name, no selection change,
      degraded branch); the `OrganismInUseDialog` variant tests (two vs three actions, copy, the
      indicator, axe for both); `usageLabels` for the live-name and unsaved labels;
      `useOrganismEditorModal` for the new `requestEdit` usage shape and the battle origin without
      clone; and `BattlePage` tests for AC2–AC4, AC8 (overlay adoption, no dirty change, list
      rejection alert, re-entrancy) and AC9.
    - **e2e:** a new battle-origin spec covering a pencil on a saved battle with a painted organism:
      gate (2 buttons) → Edit Anyway → change colour → Save → Back to Battle. It asserts that the
      canvas-adjacent roster chip changed, the URL is unchanged, `data-dirty` is unchanged, Undo still
      restores the pre-open grid, and `localStorage` holds the new organism while the battle record
      is untouched.
    - **e2e:** an unsaved `/battle/new` pencil shows `Current Battle (unsaved)` in the gate's
      disclosure.
    - **e2e:** axe runs with the gate and with the editor open over the battle.
    - `npm run ci:dev` is green.

## Tasks / Subtasks

- [x] **Task 1: The pencil (AC1, AC2).**
  - [x] In `OrganismRoster.tsx`, add `onEditOrganism?(organismId: string): void` to
        `OrganismRosterProps`. Replace the "❌ Still no `onEditOrganism`" paragraph with the shipped
        fact; `onCreateOrganism` stays absent (Story 4.25).
  - [x] Render a `styled('button')` edit control as a sibling of `<Row>` inside `<RosterListItem>`,
        and make the `<li>` a flex row so `<Row>` keeps `flex: 1`. Put **no** click handler on the
        `<li>`. The pencil's click never reaches `<Row>` because they are siblings, so no
        `stopPropagation` is needed.
  - [x] Style per AC1 with `--gol-*` tokens only. The pencil needs its own `border-bottom` so the row
        rule stays continuous (the `Row` draws `borderBottom`). The selected-row accent edge stays on
        `<Row>`.
  - [x] Thread `onEditOrganism` through `BattleEditorView` (`BattleEditorViewProps`, spec §3.3
        already declares it) to `<OrganismRoster>`. Add nothing else to the view's interface.
- [x] **Task 2: `useOrganismEditorModal` battle-origin support (AC3, AC5, AC6, AC10).**
  - [x] Change `requestEdit(organism, usedInBattles: number)` to
        `requestEdit(organism, usage: OrganismGateUsage)`, where
        `OrganismGateUsage = { battleNames: readonly string[]; ruleCount: number; referencingNames:
        readonly string[] }`. The gate opens iff `battleNames.length >= 1`. `gate` state holds the
        usage and `gateProps` forwards it together with `origin`. Update the head comment and the
        `requestEdit` doc.
  - [x] `onCloneAndEdit` stays optional. With `origin === 'battle'`, `handleGateCloneAndEdit` must
        be unreachable: the dialog renders no button, and add a hook-side guard (bail when
        `origin === 'battle'`), matching the "hold the invariant in the hook" rule its comments
        record.
  - [x] Focus restore: the pencil's `data-edit-organism-id` matches the existing lookup. The
        `[data-create-organism]` fallback finds nothing on `/battle` until 4.25, and that is
        acceptable: the pencil cannot disappear during the session (AC9, FD5). Record this in the
        comment.
  - [x] Update `useOrganismEditorModal.test.tsx` for the new signature. Add tests for the battle
        origin with no clone path and for the gate usage forwarded to `gateProps`.
- [x] **Task 3: `<OrganismInUseDialog>` variants and the indicator (AC5, AC6, FD3).**
  - [x] Props: add `origin: OrganismEditorOrigin` (import type) and replace `usedInBattles` with the
        usage fields, or keep `usedInBattles` derived from `battleNames.length`, as long as there is
        one source.
  - [x] Render Clone & Edit iff `origin === 'library'`. `onCloneAndEdit` becomes optional in the
        props.
  - [x] Copy: `'library'` keeps `organismInUseMessage(n)`. `'battle'` uses a new
        `organismInUseBattleMessage(n)` in `usageLabels.ts` (FD3 text).
  - [x] Render `<UsageIndicator battleNames ruleCount referencingNames />` in `DialogContent` after
        the sentence. Import it statically from `./editor/UsageIndicator`. Both files are lazy
        chunks, so no first-load cost moves. Verify that its capture Escape listener closes a panel
        before the gate's `onClose` sees the key (4.20 D5), and pin that with a test.
  - [x] Update the head comment: the battle variant has landed, and the "4.24 will need an `origin`
        prop" paragraph becomes the shipped fact.
  - [x] `OrganismInUseDialog.test.tsx`: both variants, the button sets and order, autofocus on
        Cancel, the copy, the indicator's disclosure, the Escape layering, and axe for both.
- [x] **Task 4: Library caller update (AC6).**
  - [x] In `OrganismLibrary.tsx`, `onRequestEdit` builds `OrganismGateUsage` from
        `resolveOrganismUsage(usage, id)` → `usageBattleNames(entries, summaries)`, the rule index
        count, and `referencingOrganismNames(...)`. These are the footer's derivations, so all
        surfaces agree (4.20 AC "counts consistent"). Pass `origin` through `gateProps`, which the
        hook supplies.
  - [x] Update `OrganismLibrary.test.tsx` and any 4.17/4.18 e2e that counted the gate's buttons or
        read its content. Retarget them; do not weaken them.
- [x] **Task 5: `usageLabels` and the modal's `openBattle` (AC7, FD4).**
  - [x] `usageBattleNames(entries, summaries, openBattle?: { id: string | null; name: string } |
        null)`. The `null` id gives `UNSAVED_BATTLE_LABEL`. An `entry.battleId === openBattle.id`
        (non-null) gives `battleDisplayName(openBattle.name)`. Otherwise it gives the summary name.
        Update the `UNSAVED_BATTLE_LABEL` comment ("unreachable until 4.24" → reachable from the
        battle origin).
  - [x] Add the `openBattle` prop to `OrganismEditorModal`. Forward `{ id, organismIds }` to
        `resolveOrganismUsage` and `{ id, name }` to `usageBattleNames`. Rewrite the `:558-563`
        comment: 4.24 passes it, the Library does not. `openBattle` is an open-time snapshot, which
        is safe because the page behind is `inert` for the editor's whole window, so the grid
        cannot change under it (FD4).
  - [x] `usageLabels.test.ts`: the live-name and unsaved cases. `OrganismEditorModal.test.tsx`: the
        footer counts and names with an `openBattle`, on both the saved and the unsaved path.
- [x] **Task 6: `<BattlePage>` wiring (AC3, AC4, AC8, AC9, AC12, FD2, FD5).**
  - [x] Add `next/dynamic` imports for `OrganismEditorModal` and `OrganismInUseDialog`
        (`ssr: false`), the `ExportBattleDialog` precedent. Call
        `useOrganismEditorModal('battle', { onSaved: adoptSavedOrganism })` in `<BattlePage>`, the
        component that renders the modal (the hook's placement rule). Mount the gate iff
        `gateMounted` and the modal iff `mounted`, as the Library does.
  - [x] **The library overlay (FD5).** Add a
        `const [savedOrganisms, setSavedOrganisms] = useState<readonly Organism[]>(NO_SAVED)`, plus
        a pure `applySavedOrganisms(list, saved)` helper in `apps/web/lib/battle/` (new file,
        camelCase, unit-tested) that replaces by id. Append-if-absent is a no-op branch today, and
        4.25 is where it becomes reachable, so document it but do not build for it. The helper
        returns `list` itself when `saved` is empty.
        - Derive `organisms = useMemo(() => organismsResource.data === undefined ? undefined :
          applySavedOrganisms(organismsResource.data, savedOrganisms), [organismsResource.data,
          savedOrganisms])`. Its identity changes only on a load or an adoption: `palette`,
          `runOrganisms`, `rosterIds` and `roster` all key on it (see their comments on why a
          churning identity is a crash or a renderer teardown).
        - `adoptSavedOrganism(record)` replaces or inserts in `savedOrganisms` by id.
        - ❌ Never call `organismsResource.reload()` here (FD5).
  - [x] **The pencil handler.** `handleEditOrganism(id)` is a synchronous `useCallback` that `void`s
        an inner async run:
        - Latch: a `editPendingRef` set synchronously, and bail if the latch is set, if the hook's
          `mounted || gateMounted`, or if `savingRef.current`.
        - Clear `editOrganismError`, then `await repositories.battles.list()`.
        - Alive check: the `exportMountedRef` idiom. Reuse that ref if its lifetime fits, or add a
          sibling.
        - Look up the organism in `organisms`, and bail if it is absent.
        - Build `openBattle` from `grid`, `rosterIds`, `persistedId` and `battleName`, resolve the
          usage, then call `requestEdit(organism, usage)` and stash `summaries` in state for the
          modal's `battleSummaries` and `openBattle`.
        - On rejection, set `editOrganismError`.
        - `finally`: release the latch.
        - Pass the handler to `<BattleEditorView onEditOrganism>` in Lab only.
  - [x] Render the error in the existing shared slot: `saveError={saveError ?? exportError ??
        editOrganismError}`. `persistBattle` and the export paths clear it where they clear the other
        two (the 5.6 FD9 lesson: clear all the messages that share a slot).
  - [x] The modal's props:
        - `{...modalProps}`;
        - `library={sortLibrary(organisms ?? [])}`, memoised;
        - `battleSummaries={editSummaries}`;
        - `organisms={repositories.organisms}` (injected; AR-2/AR-27);
        - `openBattle={editOpenBattle}`;
        - no `onRequestDelete`, no `deleteError`, no `onSaveSucceeded`.
  - [x] Touch nothing in `persistBattle`, `useDirtyGuard`, `useLeaveGuard`, `useUndoableGrid`,
        `sessionRoster` or `rosterIds`' seeding logic.
- [x] **Task 7: Tests (AC13).**
  - [x] `OrganismRoster.test.tsx`:
        - the pencil renders iff `onEditOrganism` is passed;
        - its name and `data-edit-organism-id`;
        - a click calls the callback with the row's id and does not call `onSelectTool`;
        - no pencil renders in the degraded branch or on the Eraser;
        - axe;
        - update the `:290` "no pencil yet" assertion by inverting it, not deleting it.
  - [x] `BattlePage.test.tsx` (or a new `BattlePage.editOrganism.test.tsx`, the `.export`/
        `.modeToggle` split precedent), using `@gol/test-utils` fakes:
        - N ≥ 1 opens the two-button gate, and N = 0 (a session-added, unpainted organism) opens the
          editor directly;
        - after Edit Anyway, the Back label reads "Back to Battle";
        - the grid, `data-dirty` and the undo state are unchanged across open → close;
        - Save → Back → the roster row shows the new name and colour, `data-dirty` is unchanged,
          and `organisms.list` was **not** called again;
        - a rejecting `battles.list()` shows the alert and opens no dialog;
        - a double activation fetches once;
        - no Delete button renders in the editor.
  - [x] The new e2e file `apps/web/e2e/editOrganismFromBattle.spec.ts` covers the AC13 flows. Seed
        through the existing `addInitScript` helpers, and verify writes in `localStorage` directly.
        Before running axe, wait on the dialog container's opacity (the 4.23 mid-fade trap).
- [x] **Task 8: Comments and docs hygiene.**
  - [x] Sweep forward-looking "Story 4.24" comments so each states the shipped fact:
        - `OrganismEditorModal.tsx` (`:80`, `:167`, `:186-188`, `:424`, `:558-563`);
        - `OrganismLibrary.tsx:538-539`;
        - `DominanceField.tsx:150` and `AgingToggleField.tsx:159`, where the second instance now
          exists, so verify each claim still holds;
        - `OrganismRoster.tsx:44,417`;
        - `BattlePage.tsx:673` (this story does not make the adjust reachable; see FD8);
        - `useOrganismEditorModal.ts:229,264`;
        - `usageLabels.ts`;
        - `packages/domain/src/organismDeleteGuard.ts:31` and `index.ts:77`, comment-only. Keep the
          `@gol/domain` barrel's export lines untouched, because the barrel collides across lanes.
  - [x] In `deferred-work.md`, update each entry that names 4.24, anchoring on the entry titles and
        never on line numbers:
        - **Close:** "The DIALOG's half is still open" (4-17), "No `origin`/`cloneable` prop" (4-18),
          "`'Current Battle (unsaved)'` branch is unreachable until Story 4.24" (4-20),
          "A saved-but-renamed open battle would list its stored name" (4-20, second pass), and
          "The battle-origin flows still specify 'Save & Close'" (4-16).
        - **Re-point with the reason:** "The `openBattle` argument on `organismDeleteVerdict`"
          (4-21) and "Story 4.24's battle-origin editor decides whether to pass `onRequestDelete`"
          (4-22). Both are decided as no Delete from the battle origin (FD6) and stay open for
          whichever story first offers Delete over a live grid.
        - **Re-point with the reason:** "`openPanel` is never reconciled" (4-20, second pass). It
          is still unreachable, because `openBattle` is an open-time snapshot under an inert page
          (FD4).
        - **Re-point to 4.25 or leave, with a reason:** the 3-17 "live run dropped to Lab" and 3-18
          "roster adjust exits fullscreen" entries, and the 3-11 note. Each is unreachable under
          4.24 by construction (FD8).
        - **Record:** the 4-15 "mount this panel over `<BattlePage>` in Lab only" hand-off as
          honoured (AC11), and the 2-10 "same-name organisms indistinguishable" entry as not
          addressed. 4.24 adds identity by pencil-per-row, not by name, so re-point it to 4.25 or
          the Epic 4 UX reconciliation.
- [x] **Task 9: Gate.** Run `npm run ci:dev` without piping it (Chromium e2e only, never the
      four-browser `ci` locally). Handle any bundle baseline refresh per AC12.

### Review Findings

Review 2026-09-26 (Fable, three parallel layers: Blind Hunter / Edge Case Hunter / Acceptance
Auditor, full mode against this story file).

- [ ] [Review][Decision] **The gate fires with circular copy when the only battle using the
      organism is the open battle itself.** On `/battle/new`, paint the seeded organism (used in no
      saved battle) and press its ✎: the gate reads "Used in 1 Battle. Editing it will affect all
      Battles that use it. To make a variant for this Battle only, clone it in the Organism Library
      and select the clone here." — but the one battle it "affects" is the battle the user is
      already editing, so the warning gates nothing and the clone advice is circular. The behaviour
      follows AC3/AC5 as written (the open battle counts; N ≥ 1 gates), so this is shipped-as-spec'd
      and sharpens Question 2 (FD3 copy) rather than contradicting an AC. Options:
      **(a)** keep as shipped — counting stays uniform and every placed-organism edit gets a gate;
      **(b)** special-case the sentence when `battleNames` is exactly the open battle's own entry
      (e.g. "used only in this Battle"), keeping the gate;
      **(c)** treat sole-open-battle usage like N = 0 and open the editor directly — diverges from
      AC5's "counting the open battle" and needs its own AC wording.
- [x] [Review][Patch] The gate's usage panel is top-clipped by the Dialog Paper once the battle
      list outgrows the small gate dialog — `overflowY: 'visible'` was set on `DialogContent` only,
      while MUI's Paper keeps `overflowY: 'auto'`, and the panel opens UPWARD (`bottom: 150%`), so
      names above the Paper's top edge are unreachable (the UsageIndicator's own recorded
      clipped-top class, one container out) [apps/web/components/organisms/OrganismInUseDialog.tsx]
- [x] [Review][Patch] The ✎ renders on an unresolved "Unknown organism" row and its press silently
      no-ops after wiping the shared alert slot — withhold the pencil when
      `organism.unresolved` (no record to edit; the NFR-4.1 dead-affordance rule the degraded
      branch already follows) [apps/web/components/battle/editor/OrganismRoster.tsx:576]
- [x] [Review][Patch] The pencil handler's blanket `catch {}` misattributes every non-repository
      throw to the usage-read refusal and swallows the error — narrow the catch to the
      `battles.list()` await (the export path's own shape), so a compute-stage bug surfaces on the
      console instead of wearing the refusal copy [apps/web/components/battle/BattlePage.tsx:1127]
- [x] [Review][Patch] The gate and the editor footer can order the "Targeted by [M]" referencing
      names differently — the footer builds its rule index from the SORTED `library` prop, the two
      gate callers built theirs from the unsorted loaded list; same N and M, different name order
      in the same flow — build the gate's index over the sorted list
      [apps/web/components/organisms/OrganismLibrary.tsx:529, apps/web/components/battle/BattlePage.tsx:1113]
- [x] [Review][Patch] The page-level adoption test asserts the new name but not the new colour,
      though Task 7 claims both ("the roster row shows the new name and colour") — the chip half of
      the overlay adoption was pinned only in the Chromium e2e
      [apps/web/components/battle/BattlePage.editOrganism.test.tsx:207]
- [x] [Review][Patch] Stale two-member invariant comment on the shared alert slot ("The two cannot
      both be non-null…") — unamended for the third member the same hunk adds
      [apps/web/components/battle/BattlePage.tsx:1399]
- [x] [Review][Defer] The gate's open-battle snapshot can be stale if the page changes during the
      pencil's fetch window (`battleName`/`persistedId`/`grid` are click-time closures; the page is
      not inert until a window mounts) — unreachable at localStorage speed; the sibling of the
      dev-recorded Export/Back race, owned by the same AR-2 API-repository story — deferred,
      recorded in deferred-work.md
- [x] [Review][Defer] The `savedOrganisms` overlay is never cleared, so any future
      `organismsResource.reload()` on this page would have session edits silently overwrite the
      freshly loaded truth by id — latent until something reloads (Story 5.11 touches this
      neighbourhood) — deferred, recorded in deferred-work.md
- [x] [Review][Defer] The gate's dialog title and the disclosure trigger carry the identical
      accessible name ("Used in N Battles") — a screen reader hears the same name for the dialog
      and a button inside it, and every test needs `.MuiDialogActions-root` scoping to
      disambiguate — deferred to the Epic 4 UX reconciliation, recorded in deferred-work.md
- [x] [Review][Defer] `origin='library'` with `onCloneAndEdit` undefined renders the PRD's clone
      question with no Clone & Edit button — representable but unreachable through the hook today;
      copy and capability are not coupled — deferred, recorded in deferred-work.md
- [x] [Review][Defer] The pencil and Export/Back guards are asymmetric during the fetch window —
      already recorded by this story's own deferred-work entry ("The pencil press is not locked
      against a concurrent Export / Back"), no second entry added — deferred, pre-recorded

## Dev Notes

### Forced decisions (defaults written in; follow them unless the owner overrides)

- **FD1: The pencil edits its own row and does not select it.** PRD FR-3.3 and FR-3.12 say "acts on
  the currently selected organism", which was written for a single-select dropdown. The shipped
  control is a roster list with a pencil per row (spec §9.8: follow the mockup's structure and honour
  FR-3.3's semantics). The mockup's `onclick="event.stopPropagation(); …"` shows the pencil acting
  independently of selection. Making the pencil also select its row would silently change the paint
  tool, which is a side effect the user did not ask for. **Question 1** asks the owner to confirm.
- **FD2: Usage is fetched at click time, not held as page state.** `<BattlePage>` loads no battle
  summaries today. A page-lifetime resource would go stale on this battle's own save: the H.1 prune
  rewrites this battle's summary, and `resolveOrganismUsage`'s "the open battle adds, never removes"
  rule would then over-report from the stale summary. A click-time `list()` is always current, costs
  one localStorage read per pencil press, and also feeds the editor footer's `battleSummaries`. If the
  count cannot be read, the edit is refused rather than opened unwarned. This follows the hook's own
  warning that "a `0` read while that list is still loading opens a placed organism unwarned". The
  alert is published from the call site before any dialog mounts, so the live-region trap
  (`project-context.md`) does not apply.
- **FD3: Battle-variant copy.** The PRD's FR-1.3 sentence ends "Clone this organism first to create a
  Battle-specific variant?". That question offers an action that the battle variant, by the same
  PRD, does not have. Default battle copy:
  `This organism is used in N Battle(s). Editing it will affect all Battles that use it. To make a
  variant for this Battle only, clone it in the Organism Library and select the clone here.` This is
  the PRD's own FR-1.3 battle bullet, rephrased as instructions (`prd.md:127`). **Question 2.**
- **FD4: `openBattle` is an open-time snapshot.** It is computed in the pencil handler, and the page
  behind the gate and the editor is `inert`: no paint, no undo, no rename. The live grid therefore
  cannot change during the window. This is also why the 4.20 second-pass "`openPanel` never
  reconciled" defect stays unreachable: counts cannot move while a panel is open.
- **FD5: Adopt the saved record as an overlay, and never re-list the library.** The Library calls
  `reload()` on `onSaved`. On `<BattlePage>` that is a trap. `useAsyncResource.reload()` that
  **rejects** sets `status: 'error'` with `data: undefined`, and from there:
  1. `libraryUnavailable` blanks the roster into the degraded notice mid-session.
  2. `rosterIds`' seed branch (`placed.length === 0 && defaultInLibrary`) flips on `/battle/new`
     because `defaultInLibrary` reads `organisms`. Index 0 changes hands and every painted cell
     repaints as another organism. This is Story 2.10 trap 1, the silent-repaint class, and the next
     battle save would persist it.
  The overlay has no failure path, because the record is exactly what `organisms.save` just wrote.
  It is synchronous at the editor's exit, and it touches only the edited organism. `rosterIds` lists
  `organisms` among its deps, so an adoption recomputes it to a new array. The contents are equal
  (`draft`, `sessionRoster` and `rosterSettled` don't move, and the adopted record keeps its id), so
  only its identity churns, once per adoption. That is acceptable, because a colour change must
  rebuild `palette` anyway. The **contents** must not change, and a unit test pins that the roster
  order is unchanged. 4.25 reuses the same overlay for a created organism,
  which is why the append branch is named but not built.
- **FD6: No Delete in the battle-origin editor.** From the battle, the organism is in the session
  roster, and it may be unplaced (a session add) and referenced by no saved battle, which makes it
  deletable. Deleting it would leave `rosterIds` holding a dangling id, which makes `runOrganisms`
  null, disables RUN, and turns the row into "Unknown organism". M5 scopes the battle entry to
  **editing**. Delete stays in the Library. The 4.21/4.22 deferrals remain open with that reason.
- **FD7: The hook, not a battle copy of it.** `useOrganismEditorModal` already takes an `origin`,
  guards programmatic callers, and was written with "Story 4.24's battle-origin entry" in mind
  (`:229`, `:264`). Reuse it. Do not write a battle-specific lifecycle, and do not reuse
  `useLeaveGuard` for this: its focus target and props are battle-shaped (4.23 anti-pattern).
- **FD8: The Run-mode deferrals stay unreachable.** The library changes only at the editor's exit,
  and the editor opens only from Lab. So the "library changes under a running session" cases (3-11,
  3-17, 3-18) cannot occur under 4.24. The in-render `mode === 'run' && runOrganisms === null`
  adjust is inherited and is not exercised. Say so in `deferred-work.md` rather than building the
  stop-and-explain notice.

### What already exists (reuse, do not rebuild)

- `OrganismEditorModal` (`origin: 'library' | 'battle'`, `backLabelFor`), `OrganismEditorLifecycleProps`,
  the 4.23 unsaved-changes guard, `saveOrganism`, and the close-time `onSaved` hand-off
  (`useOrganismEditorModal.handleExited`).
- `useOrganismEditorModal`: the three-phase lifecycle, one `useInertBackground(anyMounted)`, the
  gate handoff, the `data-edit-organism-id` focus lookup, and the programmatic-caller guards.
- `@gol/domain`: `buildUsageIndex`, `resolveOrganismUsage`, `OpenBattleUsage`,
  `buildRuleReferenceIndex`, `referencingOrganismIds`. No domain change is needed.
- `usageLabels.ts`: `battleCountLabel`, `organismInUseMessage`, `usageBattleNames`,
  `UNSAVED_BATTLE_LABEL`, `referencingOrganismNames`, `ruleTargetCountLabel`.
- `<UsageIndicator>`: the read-only disclosures, 4.20 D1/D4/D5, and the imperative `closePanel`.
- `computeEditorGridStats` (`lib/battle/gridStats.ts`) for the placed set, and `sortLibrary`
  (`lib/organisms/sortLibrary.ts`).
- The `BattlePage` export dialog: its `dynamic()` call, `exportMountedRef` for liveness after an
  await, and the shared `saveError ?? exportError` slot.

### Current state of the files this story modifies

- **`components/battle/editor/OrganismRoster.tsx` (539 lines).**
  - Each `<RosterListItem>` holds one `<Row>` button: chip, name, and an optional "Shared colour".
  - Props: `roster, selectedTool, onSelectTool, duplicateColorIds?, libraryUnavailable?, library,
    workspaceEmpty?, onAddToRoster, atCap?`.
  - **Preserve:** `aria-pressed` selection, the pinned Eraser outside the list, the degraded
    branch, and Forced decision 6 (no MUI list primitives, for the bundle).
- **`components/battle/editor/BattleEditorView.tsx`.** It owns `chosenTool` and renders the roster
  inside `<SidebarSection title="Organisms">` (`:855-865`). It gains one optional pass-through prop.
- **`components/battle/BattlePage.tsx` (1285 lines).**
  - `organismsResource` (`:299`) and `organisms = organismsResource.data` (`:460`).
  - `rosterIds` (`:527-580`) with its seed-branch coupling to `organisms`, then `roster`, `library`,
    `palette` and `runOrganisms`, all keyed on `[rosterIds, organisms]`.
  - `isDirty` (`:379`), `savingRef` (`:409`), `persistBattle` (`:864-891`), `persistedId` (`:961`),
    the export dialog lifecycle (`:915-1030`), and the Lab render (`:1187`).
  - **Preserve:** every one of those comments' invariants. In particular, `organisms` must stay
    memo-stable, and nothing here may set `isDirty`.
- **`components/organisms/OrganismInUseDialog.tsx` (153 lines).** Three buttons, no `origin`. The
  head comment `:72-75` reserves the variant for this story.
- **`lib/organisms/useOrganismEditorModal.ts` (417 lines).** `requestEdit(organism, usedInBattles)`.
  `gateProps` carries `usedInBattles`.
- **`components/organisms/editor/OrganismEditorModal.tsx` (1187 lines).**
  `resolveOrganismUsage(usageIndex, subjectId)` without `openBattle` (`:564`).
- **`components/organisms/OrganismLibrary.tsx`.** `onRequestEdit` (`:543-548`) passes a bare count.
- **`lib/organisms/usageLabels.ts`.** `usageBattleNames(entries, summaries)`.

### Anti-patterns (these compile and pass tests, and are still wrong)

- ❌ `organismsResource.reload()` on the battle page (FD5: a rejection repaints the grid).
- ❌ `openBattle.organismIds = rosterIds`. The roster includes unpainted session adds, which
  over-reports every count (the `OpenBattleUsage` doc).
- ❌ A page-lifetime battle-summaries resource (FD2: stale after this battle's own save).
- ❌ A static import of `OrganismEditorModal` or `OrganismInUseDialog` into `BattlePage.tsx`. Also a
  value import of either from `useOrganismEditorModal.ts`, which must stay `import type`.
- ❌ Nesting the pencil inside `<Row>`, or putting the click handler on the `<li>`.
- ❌ Passing `onRequestDelete` or `onCloneAndEdit` from the battle page (FD6, M5).
- ❌ Touching `isDirty`, `useDirtyGuard`, `useLeaveGuard` or the undo ring on any editor event
  (AR-33).
- ❌ A `useEffect` that syncs anything from the editor into page state
  (`react-hooks/set-state-in-effect`). Adoption happens in the `onSaved` callback.
- ❌ Hard-coding "Back to Battle" anywhere. It comes from `backLabelFor(origin)`.

### Project Structure Notes

- New: `apps/web/lib/battle/applySavedOrganisms.ts` (+ `.test.ts`), and
  `apps/web/e2e/editOrganismFromBattle.spec.ts`. Optionally add
  `components/battle/BattlePage.editOrganism.test.tsx`.
- The editor stays in `components/organisms/editor/`. `components/battle/` imports it only through
  `dynamic()`. That is not an `editor/`↔`simulation/` reach, and the battle root rule does not apply
  to a lazily-mounted foreign modal (spec §2 hangs `<OrganismEditorModal>` off `<BattlePage>`).
- No package changes. `packages/domain` is edited in comments only (the barrel is the lane-sync
  collision point).

### Testing standards

- Vitest + RTL + `user-event` 14. Use `@gol/test-utils` fakes, never a hand-rolled repo. Run axe in
  jsdom as the existing dialog tests do.
- For exit-transition assertions, use the 4.22/4.23 technique for `onTransitionExited`.
- Canvas: never pixel-test it. Assert the palette and roster through the DOM (the chip `style`, the
  row name) and through `data-dirty`.
- The e2e stays thin: one happy path, one unsaved-battle labelling check, and axe. Use
  `getByText("Conway's Classic", { exact: true })` (the 4.22 note).
- The local gate is `npm run ci:dev`, and it must not be piped.

### Previous story intelligence (4.23)

- The editor's guard is entirely inside the modal. `useOrganismEditorModal.handleClose` is
  unguarded on purpose, so the battle origin gets Discard / Keep Editing / Save for free, and no
  battle wiring is needed.
- 4.23 FD9: no editor `beforeunload`, explicitly so the battle origin keeps "neither triggers the
  other". Do not add one.
- Reviews on this epic focus on inert unwinding, focus restore and live-region timing. Pin
  orderings with tests, including that the page is live and clickable after Cancel / Back (the 4.22
  leftover-`inert` regression class, now on a new page).
- A held Enter carrying past an unmount re-opens a trigger (the 4.23 second-pass defer). On the
  battle page the trigger is the pencil, so the same carry-over applies. It is pre-existing and not
  in scope.

### Git intelligence

- The recent merges are 4.23 (#86) and 5.8 (#85, the atomic import pipeline, persistence only).
- Lane 5's remaining stories (5.9 import UI, 5.10 clear-all, 5.11 load-time corruption) sit on
  `/settings` and the load path. 5.11 may touch `<BattlePage>`'s library-load error handling near
  `organismsResource`, which is a textual-merge risk only, with no dependency either way.

### Latest tech notes

React 19.2, MUI 9.3 (`onClose(event, reason)`; no `disableEscapeKeyDown`), Next 16 static export,
Playwright 1.62. No new dependencies.

### References

- `docs/planning-artifacts/epics.md` §Story 4.24; FR-1.3 (`:35`), FR-3.3 (`:55`), FR-3.12 (`:64`),
  AR-33 (`:201`), UX-DR5 (`:230`).
- `docs/planning-artifacts/prds/prd-GameOfLife-2026-05-26/prd.md` FR-1.3 (`:123-127`), FR-3.3
  (`:232-236`), FR-3.12 (`:273-279`), FR-1.7 (`:155-159`).
- `docs/planning-artifacts/architecture.md` M5 (`:351`), M7 (`:353`).
- `docs/planning-artifacts/rfcs/RFC-005-application-state-modes-undo.md` `:158`, `:199`, Decision 7
  (`:281`), Decision 8 (`:303`).
- `docs/planning-artifacts/component-tree-battle-page.md` §2 (`:61-62`, `:92`), §3.3/§3.4
  (`:153-154`, `:177-183`), §9.8 (`:482`).
- `docs/planning-artifacts/ux-designs/ux-GameOfLife-2026-05-27/organism-editor-design.md` `:12-38`
  (entry points), `:40-54` (exits and return context);
  `clinical-lab-theme/petri-dish-lab-mode.html` `:237-257` (`.organism-edit-btn`), `:663-680`.
- `docs/implementation-artifacts/deferred-work.md`: the entries listed in Task 8, by title.
- `docs/implementation-artifacts/lane-gates.yaml`: 4.24 requires epic-3, which is satisfied (Epic 3
  is done).
- `docs/project-context.md`: the live-region rule, the three state categories, AR-2/AR-27
  injection, AR-35 dynamic imports, the bundle growth ratchet, and `ci:dev`.

### Questions for Sidiar (saved for the end; defaults are written into the story)

1. **FD1:** should the pencil also select its row as the paint tool? Default: no, it only edits.
2. **FD3:** the battle-variant warning copy drops the PRD's "Clone this organism first…?" question in
   favour of a pointer to the Library. Default: the FD3 sentence. The alternative is to keep the PRD
   sentence verbatim in both variants.
3. **AC6 scope:** the FR-1.3 "expandable [N]" on the gate was re-pointed here from 4.17/4.20, and it
   changes the Library's gate too. Default: build it here. The alternative is to split it into its
   own story.

## Dev Agent Record

### Agent Model Used

Claude Opus 5.5 (bmad-dev-story, implement-next-story lane epic-4)

### Debug Log References

- First `npm run ci:dev`: 5 `BattlePage.test.tsx` cases failed — exact button counts and roster
  row-name listings now see the per-row ✎. Retargeted (counts +1 per row with each pencil asserted
  by name; row listings through a `rosterRows()` helper that excludes `[data-edit-organism-id]`).
- Second run: 4 `battleRoute.spec.ts` e2e failures of the same class — `<li>` text now includes
  the ✎, and Playwright's substring name match hit both `Conway's Classic` and `Edit Conway's
  Classic`. Retargeted to the rows' `button[aria-pressed]` and `exact: true`; the old "no ✎ yet"
  assertion was inverted to "one ✎ per row".
- Third run: green.

### Completion Notes List

- **Pencil (AC1, AC2).** `OrganismRoster` renders a `styled('button')` ✎ as a sibling of `<Row>`
  inside a flex `<li>`, iff `onEditOrganism` is passed; `aria-label="Edit <name>"`,
  `title="Edit organism"`, `data-edit-organism-id`. A sibling `EditCell` carries the row rule so
  the separator stays continuous. Threaded through `BattleEditorView` only.
- **Hook (AC3, AC5, AC6, AC10).** `requestEdit(organism, usage: OrganismGateUsage)`; the gate opens
  iff `battleNames.length >= 1`. `gateProps` carries `origin` and `usage`.
  `handleGateCloneAndEdit` bails on `origin === 'battle'`.
- **Gate (AC5, AC6).** `OrganismInUseDialog` takes `origin` + `usage`; the battle variant renders
  Cancel / Edit Anyway only with `organismInUseBattleMessage` (FD3 default copy). Both variants
  render `<UsageIndicator>` below the sentence; the Escape layering (panel first, then gate) is
  pinned in jsdom.
- **One derivation.** New `lib/organisms/organismGateUsage.ts` (`resolveOrganismGateUsage`) composes
  `resolveOrganismUsage` → `usageBattleNames`, the rule count and `referencingOrganismNames`; the
  Library and the battle page both call it.
- **Live usage (AC7).** `usageBattleNames` takes an optional `{ id, name }` open battle (unsaved →
  `Current Battle (unsaved)`, matching id → live name). `OrganismEditorModal` gains `openBattle`,
  forwarded to both.
- **Battle page (AC3, AC4, AC8, AC9, AC12).** Editor and gate via `next/dynamic` (`ssr: false`);
  `useOrganismEditorModal('battle', { onSaved })` with no clone writer and no Delete. Click-time
  `battles.list()` with a ref latch; open battle = `persistedId`, live name, and the
  `computeEditorGridStats` placed set (never `rosterIds`). Rejection → the shared alert slot
  (`saveError ?? exportError ?? editOrganismError`); save/export/pencil clear all three. Saved
  records are adopted through a new `lib/battle/applySavedOrganisms.ts` overlay into a memoised
  `organisms` — no `reload()`. Nothing touches `isDirty`, the undo ring, `useDirtyGuard` or
  `useLeaveGuard`.
- **Bundle (AC12).** Growth vs committed baselines: `/battle` +2.7 KB, `/battle/new` +2.7 KB,
  `/organisms` +1.0 KB — all under the 8 KB allowance, so no baseline refresh.
- **Docs.** Forward-looking "Story 4.24" comments rewritten as shipped facts (including the two
  comment-only `@gol/domain` edits; barrel export lines untouched). `deferred-work.md`: closed the
  4-16/4-17/4-18/4-20 (×2) entries, re-pointed 4-21 FD11, 4-22 `onRequestDelete`, 4-20 `openPanel`,
  3-11/3-17/3-18 (FD8) and 2-10 (same-name) with reasons, recorded 4-15 as honoured, and added a
  4-24 section (selected-row tint stops at the pencil cell; pencil not latched against a
  same-tick Export/Back behind a slow repository).
- **Owner questions (defaults applied):** Q1 FD1 pencil does not select; Q2 FD3 battle copy; Q3 AC6
  built here, Library gate included.
- **Gate.** `npm run ci:dev` green: typecheck, lint, format, spec, boundary, coverage (web 2410
  tests), build, bundle, bench (9.682 ms headroom, 58.1% of frame), e2e Chromium 295 passed.

### File List

New:
- apps/web/lib/battle/applySavedOrganisms.ts
- apps/web/lib/battle/applySavedOrganisms.test.ts
- apps/web/lib/organisms/organismGateUsage.ts
- apps/web/lib/organisms/organismGateUsage.test.ts
- apps/web/components/battle/BattlePage.editOrganism.test.tsx
- apps/web/e2e/editOrganismFromBattle.spec.ts

Modified:
- apps/web/components/battle/BattlePage.tsx
- apps/web/components/battle/BattlePage.test.tsx
- apps/web/components/battle/editor/BattleEditorView.tsx
- apps/web/components/battle/editor/OrganismRoster.tsx
- apps/web/components/battle/editor/OrganismRoster.test.tsx
- apps/web/components/organisms/OrganismInUseDialog.tsx
- apps/web/components/organisms/OrganismInUseDialog.test.tsx
- apps/web/components/organisms/OrganismLibrary.tsx
- apps/web/components/organisms/OrganismLibrary.test.tsx
- apps/web/components/organisms/editor/OrganismEditorModal.tsx
- apps/web/components/organisms/editor/OrganismEditorModal.test.tsx
- apps/web/components/organisms/editor/AgingToggleField.tsx
- apps/web/components/organisms/editor/ColorPickerField.tsx
- apps/web/components/organisms/editor/DominanceField.tsx
- apps/web/components/organisms/editor/OrganismNameField.tsx
- apps/web/e2e/battleRoute.spec.ts
- apps/web/lib/battle/useSimulationHotkeys.ts
- apps/web/lib/organisms/usageLabels.ts
- apps/web/lib/organisms/usageLabels.test.ts
- apps/web/lib/organisms/useOrganismEditorModal.ts
- apps/web/lib/organisms/useOrganismEditorModal.test.tsx
- packages/domain/src/index.ts (comment only)
- packages/domain/src/organismDeleteGuard.ts (comment only)
- docs/implementation-artifacts/deferred-work.md
- docs/implementation-artifacts/sprint-status.yaml
- docs/implementation-artifacts/4-24-edit-organism-from-battle.md

## Change Log

- 2026-09-26: Story created (create-story, lane epic-4).
- 2026-09-26: Implemented (dev-story): per-row ✎ in the Lab roster; battle-origin editor and
  two-button in-use gate over `<BattlePage>`; expandable usage in both gate variants; live
  open-battle usage in gate and footer; saved-organism overlay adoption. `ci:dev` green. Status →
  review.
- 2026-09-26: Code review (Fable, full mode, three parallel layers). 6 patches applied (gate
  Paper overflow, no pencil on unresolved rows, catch narrowed to `battles.list()`, gate rule
  index over the sorted library, adoption test's colour half, three-member slot comment); 5
  deferred (4 recorded in `deferred-work.md`, 1 pre-recorded by the dev); 3 dismissed; 1 decision
  left open for Sidiar (circular gate copy when the sole using battle is the open one — see
  Review Findings). Status → in-progress pending that decision.

Proposed lane gate: none   # 4.24 needs nothing from lane 5; 5.11 may touch <BattlePage>'s library-load path (textual overlap only, no dependency either way)

Dev Model: opus   # establishes the battle-side editor mount and the library-overlay adoption that 4.25 builds on, with a silent grid-repaint trap (FD5) that a pattern-follower would miss
