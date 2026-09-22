---
baseline_commit: 28c5c64
---

# Story 4.18: Clone Organism

Status: in-progress

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a user,
I want to clone an organism,
so that I can make variants without touching the original.

## Acceptance Criteria

From `epics.md#Story 4.18: Clone Organism` (`:1202-1212`), decomposed into what a reviewer can check
independently. AC4–AC12 are repo-derived: the obligations the code written FOR this story by
4.2/4.16/4.17 imposes (every `Story 4.18` forward reference in `apps/web` — `OrganismCard.tsx:13,
:137`, `OrganismInUseDialog.tsx:64-67`, `useOrganismEditorModal.ts`'s `proceedRef` comment,
`ruleContentHash.ts`'s consumer list), the deferred-work entry addressed to it
(`deferred-work.md:2405-2411`), and the CI gates. **Read the Dev Notes' forced decisions FD1–FD12
before touching a file** — the four things that can silently go wrong here (a clone whose name
overflows `MAX_ORGANISM_NAME_LENGTH` and is REFUSED by `OrganismSchema.parse`; a clone that shares
its source's rule ids; a clone whose card never appears because the Library only reloads on an
editor save; a second `role="status"` node that breaks every existing e2e count assertion) are
settled there.

1. **Every card carries a Clone action beside Edit.** `<OrganismCard>` renders a second visible
   button in the existing `CardActions` row (mockup `organism-library.html:439-442` — Edit / Clone /
   Delete; 4.22 adds the third): text **"Clone"**, accessible name `Clone <display name>`,
   `data-clone-organism-id="<id>"`, same `.action-btn` chrome as Edit (FD4 — `EditButton` becomes a
   shared `ActionButton`; **no `transition`**, `--gol-border-control`). It renders on EVERY card,
   Conway's Classic included — M9 protects the default from **deletion**, not from being cloned, and
   the mockup renders the preloaded card's Clone enabled (`:441`, only Delete is `disabled` there).
   Clicking it calls the card's new `onRequestClone()` prop; the card knows nothing else (the
   `<BattleTile>` `onRequestDelete(): void` contract). **The card's Clone does NOT open the editor** —
   the AC's card action creates the organism and stops there.

2. **A clone is created, persisted, and the grid refreshes in place.** One `organisms.save()` with a
   record carrying a FRESH `crypto.randomUUID()` id, followed by `resource.reload()` (FD3/FD9 — the
   writer reloads, not the editor's `onSaved`): after the click the grid holds exactly ONE more card,
   in `sortLibrary` position, and the count badge reads one more (`5 Organisms` → `6 Organisms`) on
   the SAME node. `organisms.list()` was called exactly twice (mount + reload), `organisms.save()`
   exactly once, and no battle is written (`battles.save` never called; `gol:battles` byte-identical).
   The source record is byte-identical afterwards.

3. **The clone's fields are the source's, except id and name.** `colorToken`, `dominance`,
   `agingEnabled` and the rule list (same rules, same ORDER — order is priority, FR-2.6) are copied
   verbatim; `schemaVersion` is `ORGANISM_SCHEMA_VERSION` (Decision I.4 / the Story 4.17 restamp
   decision — a written record is stamped with the shape it was written in); `id` is fresh; `name` is
   AC5's. No colour is re-allocated, no `defaultColorToken()` call, and **no colour-reuse warning is
   raised** — M6 raises FR-2.3's warning only for an explicit user *selection*, and a clone selects
   nothing (FD12).

4. **Rule identity: fresh rule ids, the source's `contentHash`es, no aliasing.** Each cloned rule
   gets a NEW opaque id from an injected `nextRuleId()` (RFC-004 §2.4: an `id` is "assigned once at
   creation" and "identical rules share a `contentHash` but keep distinct `id`s"), and keeps the
   source's `contentHash` UNCHANGED — the hash is over `{ conditions, payload }` with `id` excluded
   (`ruleContentHash.ts`'s scheme), so a copied rule's hash is already correct and the clone needs no
   `crypto.subtle` and no `await` (FD1). Pinned: for `CONWAYS_CLASSIC` and every
   `createMockOrganisms()` record, the clone's rule `contentHash`es `toEqual` the source's in order,
   every rule `id` differs from the source's, and no two rules in the clone share an id. The clone is
   also structurally independent — no `conditions` array, condition object or rule object is shared
   by reference with the source (`OrganismSchema.parse` at the end of the projection is what
   guarantees it; a bare `{ ...rule, id }` spread keeps the source's `conditions` reference, and
   `CONWAYS_CLASSIC` is `deepFreeze`d).

5. **The name is `[Name] (Copy)`, and the 50-character cap can never refuse a clone.**
   `cloneOrganismName(name)` = `name.slice(0, MAX_ORGANISM_NAME_LENGTH - ' (Copy)'.length).trimEnd()`
   + `' (Copy)'`, and exactly `'(Copy)'` when that head is empty (FD2). Pinned: a short name gets the
   plain suffix; a 50-character name yields a 50-character result ENDING in ` (Copy)` that
   `OrganismSchema.parse` accepts; a name that is blank or whitespace-only yields `'(Copy)'` with no
   leading space; a name ending in a space does not yield a double space; cloning a clone yields
   `X (Copy) (Copy)` (truncated by the same rule). **No uniqueness pass, no `(Copy 2)`** —
   `Organism.name` has no uniqueness constraint (the standing naming entry,
   `deferred-work.md:1455-1465`), and two identically named clones are legal, sorted deterministically
   by `sortLibrary`'s raw-name→id tie-break.

6. **Editing the clone never affects the source, and editing the source never affects the clone.**
   They are two records under two ids in one `gol:organisms` collection (the repository's `save()` is
   a keyed upsert). Pinned end to end: clone → open the clone's editor → rename + recolour → Save →
   the SOURCE card's name, colour, dominance, aging and rule count are unchanged and its stored
   record is byte-identical; and the reverse (edit the source after cloning → the clone's record is
   byte-identical). Every battle that placed the source still places the source — a clone changes no
   battle's `organismIds` (Decision H) and creates no reference to itself.

7. **Cloning is uncapped by the palette (FR-1.6, M6).** No cap check, no palette arithmetic, no
   failure path when every token is already in use: cloning the same organism N times produces N
   records all holding the SAME `colorToken` (pinned for N = 3), each an ordinary manually-managed
   Library organism with no zero-reference GC (M5's Library aside, PRD FR-1.6 AC3). The per-battle
   255 cap (Decision G.3) is not in play — a clone is placed on no grid.

8. **The in-use dialog gains Clone & Edit, and a `pending` window.** `<OrganismInUseDialog>` props
   gain `onCloneAndEdit(): void` and `pending: boolean`; the actions become, in DOM order, **Cancel**
   (`autoFocus`, outlined, `color="inherit"`) → **Clone & Edit** (text) → **Edit Anyway**
   (`variant="contained"`) — the `<UnsavedChangesDialog>` three-action shape, with Edit Anyway
   keeping the contained slot it shipped with in 4.17 (no visual re-decision, no churn in the pinned
   4.17 assertions). While `pending`: all three buttons are `disabled` and `onClose` returns early,
   so Escape and backdrop cannot dismiss the dialog mid-write (`disableEscapeKeyDown` was removed from
   MUI v9 — `onClose` is the only place that guard can live; `<DeleteBattleDialog>` records the
   finding). The title and the body sentence are unchanged — and the body's question ("Clone this
   organism first to create a Battle-specific variant?") is answerable from this story on, closing
   the one-story dead-copy window the 4.17 review's owner decision accepted.

9. **Clone & Edit writes the clone FIRST, then opens the editor ON THE CLONE.** The hook's existing
   handoff carries it: `handleGateCloneAndEdit` sets `gatePending`, awaits the injected writer,
   stashes the RESULT in `proceedRef` (never the source), retargets `restoreFocusRef` to the clone's
   id, and closes the gate; `handleGateExited` is UNCHANGED and opens the editor on whatever
   `proceedRef` holds. Pinned: the editor is absent while the warning is still in the DOM and present
   after it is gone (one modal on screen at a time, FD3 of 4.17); the editor's name field reads the
   CLONE's name; a Save in that session upserts the CLONE's id (`saveStamp` is seeded from the
   record the modal was mounted with) and `organisms.list()` length is unchanged by it; the
   background stays `inert` across the whole handoff. On a FAILED clone `proceedRef` stays `null`,
   the gate exits, no editor opens, and AC10's alert is on screen.

10. **A refused write is reported, and nothing already stored changes.** Both entry points route a
    rejection through `saveFailureMessage(error, 'organism')` into ONE `role="alert"` line in the
    Library (`data-clone-error`), cleared at the start of the next attempt. Pinned for
    `QuotaExceededError` (the quota sentence), for `CorruptDataError` (the unreadable-data sentence)
    and for a generic error, with `gol:organisms` byte-identical after the refusal and a retry
    succeeding. ⚠️ **It is `role="alert"`, never a second `role="status"`** — the count badge is the
    page's only status node and `e2e/organisms.spec.ts`'s `countBadge = page.getByRole('status')` is
    unscoped, so a second one turns every 4.16/4.17 badge assertion into a strict-mode failure (FD10).
    Success gets no new sentence: the new card plus the badge's own count change is the announcement.

11. **One click, one clone; nothing else is started.** A double-click on Clone writes ONCE — a
    `cloningRef` latch is the authority and the button's `disabled` is the affordance (FD5); the
    latch covers both entry points, so a Clone & Edit cannot start while a card clone is in flight.
    Cancel on the gate still writes nothing. No editor opens from the card's Clone. Story 4.19's
    derivations, 4.20's footer/popover, 4.21/4.22's Delete, 4.23's dirty scope and 4.24/4.25's
    battle-origin entries are NOT started. No rename prompt, no "clone into a battle", no `?id=` on
    the URL (Decision K.5).

12. **Gates.** `npm run ci:dev` green (typecheck, lint, format, `spec:check`, `boundary:check`,
    coverage — `packages/*` untouched and unmoved; `apps/web` reported only — `build:standalone`,
    `bundle:check` within every route's budget, bench, bench:check, Chromium e2e). axe passes on the
    Library with Clone buttons rendered, with the clone alert visible, with the three-action in-use
    dialog open and settled, and with the editor open on a clone. No new `--gol-*` token, no hex, no
    `transition` on the new button. Spec IDs written exactly as the specs spell them.

## Tasks / Subtasks

- [x] **Task 1 — the clone projection (AC3, AC4, AC5, FD1, FD2)** —
  `apps/web/lib/organisms/organismClone.ts` (+ `.test.ts`)
  - [x] `export const CLONE_NAME_SUFFIX = ' (Copy)';` and
        `export function cloneOrganismName(name: string, maxLength: number = MAX_ORGANISM_NAME_LENGTH): string`
        — `const head = name.slice(0, maxLength - CLONE_NAME_SUFFIX.length).trimEnd(); return head === '' ? CLONE_NAME_SUFFIX.trimStart() : head + CLONE_NAME_SUFFIX;`
        Docblock: FR-1.6's "[Original Name] (Copy)"; WHY truncate rather than let the schema refuse
        (`OrganismSchema.name` is `.max(50)` and `<OrganismNameField>` lets the user type exactly 50 —
        a 57-character clone name would make Clone fail on precisely the names the editor allows);
        WHY the suffix survives truncation rather than being dropped (a clone that reads identically
        to its source in the grid is the outcome the suffix exists to prevent); WHY `trimEnd` (a cut
        mid-space, and a source name that already ends in one); WHY `'(Copy)'` for a blank name
        (a leading space, on a record whose card already reads `Unnamed organism`). The `maxLength`
        parameter exists for the same reason `organismName.ts`'s does — the tests state the bound.
  - [x] `export function cloneOrganismRecord(source: Organism, id: string, nextRuleId: () => string): Organism`
        — builds `{ schemaVersion: ORGANISM_SCHEMA_VERSION, id, name: cloneOrganismName(source.name),
        colorToken: source.colorToken, dominance: source.dominance, agingEnabled: source.agingEnabled,
        survivalRules: source.survivalRules.map((rule) => ({ ...rule, id: nextRuleId() })) }` and
        returns `OrganismSchema.parse(record)`. **Synchronous** — no `await`, no `ruleContentHash`.
        Docblock: the sibling of `projectOrganismForSave` (a record→record projection rather than a
        draft→record one) and the reason it is not routed through
        `organismDraftFrom` + `projectOrganismForSave` (FD1: that path re-hashes every rule
        asynchronously to reproduce digits it already has, and it is the editor's path, gated on
        `validateOrganismDraft` — a clone of a schema-legal record outside the editor's tighter
        numeric bounds would be REFUSED by it, `deferred-work.md`'s 4.11/4.17 bounds entry);
        rule ids re-minted per RFC-004 §2.4 with the `contentHash` carried over because `id` is
        excluded from the hash input; `nextRuleId` injected, never `crypto` inside (the
        `ruleDraftFrom`/`organismDraftFrom` contract); `OrganismSchema.parse` LAST — the
        "Zod at boundaries" parse, and the thing that makes the clone structurally independent of a
        possibly-frozen source (a spread copies the `conditions` REFERENCE).
  - [x] Tests: (a) `cloneOrganismName` — `'Glider'` → `'Glider (Copy)'`; `'x'.repeat(50)` →
        length 50 and `endsWith(' (Copy)')` and `OrganismSchema` accepts it; `'x'.repeat(44)` (head
        cut at 43); `''` and `'   '` → `'(Copy)'`; `'Bob '` → `'Bob (Copy)'`; `'Glider (Copy)'` →
        `'Glider (Copy) (Copy)'`; (b) `cloneOrganismRecord(CONWAYS_CLASSIC, 'clone-1', nextId)` —
        every scalar equals the source's except `id` and `name`; `schemaVersion ===
        ORGANISM_SCHEMA_VERSION`; rules in order with the source's `contentHash`es and `payload`s and
        `conditions` deep-equal; every rule `id` fresh (count `nextId` calls = rule count; assert the
        id SET is disjoint from the source's and has no internal duplicate); (c) the same over every
        `createMockOrganisms()` record (a table test — the fixtures carry `organismType`,
        `cellState` and range conditions); (d) **non-aliasing**: `clone.survivalRules[0] !==
        source.survivalRules[0]`, `clone.survivalRules[0].conditions !==
        source.survivalRules[0].conditions`, and mutating the clone's conditions array does not throw
        on the `deepFreeze`d `CONWAYS_CLASSIC` and does not change the source; (e) an
        `organismType` condition's `pattern` still names the SOURCE's target id, unchanged (FD12);
        (f) a zero-rule organism clones to a zero-rule clone; (g) a source with a 50-character name
        round-trips through `OrganismSchema.parse` without throwing (the regression AC5 exists for).

- [x] **Task 2 — the card's Clone button (AC1, FD4, FD5)** —
  `apps/web/components/organisms/OrganismCard.tsx` (+ `.test.tsx`)
  - [x] Rename `EditButton` → `ActionButton` (same styles, unchanged) and render BOTH buttons from
        it. Update its comment: the substitutions now serve two buttons; `flex: 1` splits the row
        evenly, which is what the mockup's `.card-actions` does.
  - [x] Props gain `onRequestClone(): void` and `cloning?: boolean` (default `false`). Render, after
        the Edit button inside `<CardActions>`:
        `<ActionButton type="button" aria-label={`Clone ${display.name}`} data-clone-organism-id={organism.id} disabled={cloning} onClick={() => onRequestClone()}>Clone</ActionButton>`.
        Add a `&:disabled` block to `ActionButton` from the mockup's `.action-btn:disabled`
        (`:342-349`): `opacity: 0.4`, `cursor: 'not-allowed'`, and `&:disabled:hover` resetting
        `borderColor`/`background`/`transform` (the mockup disables the hover for exactly this
        reason).
  - [x] Update the head comment (`:13`) and the `CardActions` comment (`:137`) to present tense:
        Edit and Clone ship; Delete is 4.22's and joins the same row. Update the tab-stop paragraph
        (`:15-21`): the card now has TWO keyboard stops, both real actions — the Story 4.17 decision
        was "the article is not a stop", not "one stop per card", and nothing about it changes.
  - [x] Tests: the Clone button exists on every card including the SYSTEM one, its accessible name
        is `Clone <name>` (and `Clone Unnamed organism` for a blank name), it carries
        `data-clone-organism-id`, a click calls `onRequestClone` exactly once and `onRequestEdit`
        never; `cloning` disables ONLY the Clone button (Edit stays enabled) and a click on it then
        calls nothing; tab order within a card is Edit then Clone; axe with both buttons and with
        Clone disabled. Every existing `render(<OrganismCard …/>)` gains `onRequestClone={vi.fn()}`
        (mechanical).

- [x] **Task 3 — the dialog's third action (AC8, FD6)** —
  `apps/web/components/organisms/OrganismInUseDialog.tsx` (+ `.test.tsx`)
  - [x] Props gain `onCloneAndEdit(): void` and `pending: boolean`. `onClose={() => { if (pending) return; onCancel(); }}` (the `<UnsavedChangesDialog>` guard, with its comment's reason —
        `disableEscapeKeyDown` is gone in MUI v9). All three `<Button>`s take `disabled={pending}`.
        Insert between Cancel and Edit Anyway:
        `<Button type="button" onClick={onCloneAndEdit} disabled={pending} sx={BUTTON_SX}>Clone &amp; Edit</Button>`
        (text variant, default colour — the middle slot's shape in the three-action precedent).
  - [x] Rewrite the head comment's "Two actions, not the AC's three" paragraph: three actions now;
        Clone & Edit routes through `useOrganismEditorModal`'s injected writer and the `proceedRef`
        handoff; `pending` is the clone's write window and is why `onClose` is guarded; the
        battle-origin variant (FR-3.12 / Story 4.24) is **Edit Anyway / Cancel only** — no Clone &
        Edit from the Battle Editor (M5, PRD `:127`) — so 4.24 will need an `origin` prop or a
        `cloneable` flag, and this comment is where that lands. `organismInUseMessage` is unchanged:
        its clone sentence is now true.
  - [x] Tests: (a) the three buttons in DOM order with their accessible names; (b) Clone & Edit →
        `onCloneAndEdit` once, the other two never; (c) `pending` → all three disabled, Escape calls
        nothing, a backdrop click calls nothing; (d) not `pending` → Escape calls `onCancel` (the
        existing test, unchanged); (e) axe with `pending` true and false. Existing tests gain
        `onCloneAndEdit={vi.fn()} pending={false}` (mechanical).

- [x] **Task 4 — the hook: Clone & Edit (AC9, AC11, FD7, FD11)** —
  `apps/web/lib/organisms/useOrganismEditorModal.ts` (+ `.test.tsx`)
  - [x] `UseOrganismEditorModalOptions` gains
        `onCloneAndEdit?(source: Organism): Promise<Organism | null>` — docblock: injected by the
        component that HOLDS the repository (AR-2/AR-27 — this hook imports none), returns the new
        record or `null` when the write was refused AND already reported by its owner. Held in an
        `onCloneAndEditRef` latest-value ref, exactly as `onSaved` is, so `gateProps`' identity does
        not track a changing option.
  - [x] `const [gatePending, setGatePending] = useState(false);`
  - [x] `handleGateCloneAndEdit`: a synchronous `useCallback` that `void`s an inner async run (never
        an `async` callback handed straight to a `(): void` prop). The run: bail if `gate === null`
        or `gatePending`; `setGatePending(true)`; `const clone = await onCloneAndEditRef.current?.(gate.organism) ?? null;`
        `setGatePending(false)`; `proceedRef.current = clone;` if `clone !== null` →
        `restoreFocusRef.current = { kind: 'edit', organismId: clone.id }` (FD11 — focus lands on
        what the user just made; the DOM lookup's create-button fallback still covers a filtered-out
        card); `setGateOpen(false)` in BOTH branches.
  - [x] `gateProps` gains `pending: gatePending` and `onCloneAndEdit: handleGateCloneAndEdit`; the
        memo's deps grow accordingly. `handleGateExited`, `handleGateCancel`, `handleGateEditAnyway`,
        `requestEdit`, `requestCreate` and the inert/focus effects are **unchanged**.
  - [x] Present-tense the `proceedRef` comment ("Story 4.18's Clone & Edit stashes the CLONE
        instead" → it does) and add one paragraph to the head comment: the clone's WRITE belongs to
        the caller (the hook owns sequencing, not persistence); `pending` exists so the gate cannot
        be dismissed between the write starting and `proceedRef` being stashed, which is the only
        window in which a Cancel could strand a written clone behind no editor; a failed clone
        resolves to `null` and the handoff degenerates to a plain Cancel.
  - [x] Tests (the `Probe` gains a `cloneResult` the test controls and renders `pending` through the
        real `<OrganismInUseDialog {...gateProps} />`):
        (a) Clone & Edit on a used organism → the injected writer is called ONCE with the SOURCE;
        while its promise is unsettled `gateProps.pending` is true, the gate is still open and the
        editor is not mounted; after it resolves → the gate closes, and after its `onExited` the
        editor is mounted+open with `modalProps.organism` === the CLONE (never the source);
        (b) a `null` result → the gate closes, `onExited` unmounts it, the editor never mounts, and
        focus is on the SOURCE card's Edit button;
        (c) focus after (a): Back on the editor → after its `onExited`, focus is on the CLONE's
        `[data-edit-organism-id]` button; with that node removed, on the create button;
        (d) the background stays `inert` throughout (a) — before, during `pending`, across the
        handoff and until the editor closes (the existing `appendBackground`/`isInert` rig);
        (e) a second Clone & Edit click while `pending` calls the writer only once;
        (f) no `onCloneAndEdit` option supplied → the button resolves to `null` and behaves as (b)
        (nothing throws);
        (g) `gateProps` identity is stable across an unrelated re-render (append to the existing
        stability test).

- [x] **Task 5 — the Library: the writer, the latch, the alert (AC2, AC7, AC10, AC11, FD3, FD9, FD10)** —
  `apps/web/components/organisms/OrganismLibrary.tsx` (+ `.test.tsx`)
  - [x] `const cloningRef = useRef<string | null>(null);` `const [cloning, setCloning] = useState<string | null>(null);`
        `const [cloneError, setCloneError] = useState<string | null>(null);` — the id being cloned,
        not a boolean (FD5: only the clicked card's button disables, and the id is what the test
        asserts on).
  - [x] ```ts
        const cloneOrganism = useCallback(
          async (source: Organism): Promise<Organism | null> => {
            if (cloningRef.current !== null) return null;
            cloningRef.current = source.id;
            setCloning(source.id);
            setCloneError(null);
            try {
              const clone = cloneOrganismRecord(source, crypto.randomUUID(), () => crypto.randomUUID());
              await organisms.save(clone);
              reload();
              return clone;
            } catch (error) {
              setCloneError(saveFailureMessage(error, 'organism'));
              return null;
            } finally {
              cloningRef.current = null;
              setCloning(null);
            }
          },
          [organisms, reload],
        );
        ```
        Comment: ONE writer for both entry points (FD3) — the card's Clone and the gate's Clone &
        Edit differ only in what happens after; the `reload()` belongs HERE and not to the editor's
        `onSaved` (FD9: a Clone & Edit closed WITHOUT a save never fires `onSaved`, so the clone's
        card would be missing until the next page load — and reloading here also means the editor's
        `library` already holds the clone, so its `others` filter and the 4.9 reuse warning see the
        real workspace); the two ids are minted at the call site, as `saveOrganism` mints the
        editor's (the repository mints none); the `cloningRef` latch is the authority and the
        button's `disabled` the affordance; a rejection is REPORTED and returned as `null` (never
        rethrown into the hook, which owns no error surface).
  - [x] Card wiring: `<OrganismCard … cloning={cloning === organism.id} onRequestClone={() => { void cloneOrganism(organism); }} />`.
        Hook wiring: `useOrganismEditorModal('library', { onSaved, onCloneAndEdit: cloneOrganism })`.
  - [x] The alert line, rendered directly under `<Toolbar>` and OUTSIDE the `aria-busy` wrapper
        (the same reason the toolbar is — it must not be withheld while a reload is in flight):
        `{cloneError !== null && <StatusText role="alert" data-clone-error>{cloneError}</StatusText>}`.
        Comment: WHY `role="alert"` and not a second `role="status"` (FD10 — the count badge is the
        page's only status node and the e2e's `getByRole('status')` is unscoped); WHY there is no
        success sentence (the new card and the badge's own count change already announce it; the
        alternative is in the story's Open flags).
  - [x] Tests (`OrganismLibrary.test.tsx`, new `describe('clone organism (Story 4.18)')`, using
        `createMockWorkspace()` + the 4.17 block's unused Glider):
        (a) Clone on an unused organism → `organisms.save` called once with a record whose `id`
        differs from every seeded id, whose `name` is `<source> (Copy)`, whose `colorToken`/
        `dominance`/`agingEnabled` equal the source's and whose rules carry the source's hashes with
        fresh ids; the grid gains exactly one card in `sortLibrary` position; the badge reads one
        more on the SAME node; `organisms.list` called exactly twice; `battles.save`/`battles.list`
        untouched beyond the mount read;
        (b) Clone on Conway's Classic → allowed; the clone is NOT rendered as SYSTEM (no `data-system`)
        and sorts by name, not first;
        (c) clone three times → three records, all with the SAME `colorToken`, names all
        `X (Copy)`, and no error (AC7);
        (d) a double click before the first write settles (a deferred `save` promise) → `save` called
        ONCE, and the clicked card's Clone button is disabled while it is in flight and enabled after
        (positive control: a second click after the settle calls `save` again);
        (e) `organisms.save` rejecting with `QuotaExceededError` → `[data-clone-error]` carries the
        quota sentence, no card is added, the badge is unchanged, `organisms.list` called once
        (no reload), and a retry after a `mockResolvedValue` succeeds and clears the alert; the same
        with `CorruptDataError` and with a plain `Error`;
        (f) the clone's own Edit opens the editor DIRECTLY (its usage count is 0 — it is placed in
        no battle), populated with the clone's fields (AC6's first half, at unit level);
        (g) Clone & Edit from the gate: a used organism → gate → Clone & Edit → `save` once → the
        editor opens on the CLONE (its name field reads `<source> (Copy)`), the warning is gone by
        then, and the SOURCE's stored record is byte-identical;
        (h) Clone & Edit with a rejecting `save` → no editor, `[data-clone-error]` visible, focus on
        the source's Edit button;
        (i) axe with the alert visible and with the three-action dialog settled.
  - [x] `page.test.tsx`: add one line — the page renders Clone buttons once ready.

- [x] **Task 6 — comment bookkeeping (no behaviour)**
  - [x] `apps/web/lib/organisms/ruleContentHash.ts` — its consumer list names "Story 4.18's clone".
        **That is now wrong and must be corrected, not present-tensed**: the clone COPIES hashes and
        never calls this function (FD1). Replace that clause with one sentence saying so and why
        (`id` is excluded from the hash input, so a copied rule's hash is already its own).
  - [x] Present-tense: `OrganismCard.tsx:13, :137` (Clone ships), `OrganismInUseDialog.tsx:64-67`
        (three actions), `useOrganismEditorModal.ts`'s `proceedRef` comment, `sortLibrary.ts`'s "a
        user can clone Conway's Classic" (they can, from this story on). Do NOT touch
        `colorReuse.ts`, `organismRecord.ts` or `organismDraft.ts` — this story adds no consumer to
        any of them.

- [x] **Task 7 — e2e (AC1–AC11, AC12)** — `apps/web/e2e/organisms.spec.ts`
  - [x] New block `test.describe('clone organism (Story 4.18)')` appended after the 4.17 block,
        reusing that block's hoisted helpers (`seedWorkspace`, `seedExtraOrganisms`, `settled`,
        `editorDialog`, `inUseDialog`, `back`, `countBadge`, `storage`) — **no sixth seed-helper
        copy** (the standing extraction entry's trigger is still not met; this story touches one
        spec). Add locals `cloneButton(page, name)` and `editButton(page, name)` (lift 4.17's if it
        is still block-scoped; lifting is allowed, forking is not).
        1. **card Clone: one new card, persisted, no editor** — Glider's Clone → the badge goes
           `5 Organisms` → `6 Organisms`, a card named `Glider (Copy)` is visible, NO dialog ever
           appeared, zero console errors; `gol:organisms` parsed holds 6 ids, the new record's
           `colorToken`/`dominance`/`agingEnabled` equal Glider's, its rule `contentHash`es equal
           Glider's in order and its rule ids do not; `gol:battles` byte-identical; reload the page
           and the card is still there.
        2. **the clone is independent** — open the clone's Edit (it gates with nothing: 0 battles),
           rename to `Glider Variant`, pick a different swatch, Save, Back → the `Glider` card is
           unchanged and Glider's stored record `toEqual` its pre-flow value.
        3. **Conway's Classic clones** — Clone on the SYSTEM card → `Conway's Classic (Copy)` exists,
           carries no `SYSTEM` tag, and `conways-classic`'s record is byte-identical.
        4. **Clone & Edit from the in-use warning** — Aggressive Colonizer's Edit → the
           `Used in 2 Battles` dialog now shows three buttons → Clone & Edit → the warning goes, THEN
           the editor appears (assert the editor is absent while the warning is present) with the
           name field reading `Aggressive Colonizer (Copy)` → Back → the badge reads one more, both
           cards exist, `gol:battles` byte-identical and the SOURCE record unchanged.
        5. **focus** — after 4's Back, the `Edit Aggressive Colonizer (Copy)` button is focused
           (Chromium/Firefox; WebKit: not inside a dialog — the standing branch).
        6. **quota, in a real browser** — the 4.16 quota idiom (fill `localStorage` until the write
           is refused) → the `[data-clone-error]` alert carries the quota sentence, the badge is
           unchanged, `gol:organisms` is byte-identical, and a retry after freeing space succeeds.
        7. **keyboard** — Tab from the search input reaches the first card's Edit then its Clone;
           Enter on Clone creates the copy.
        8. **axe** — with the alert visible, and with the three-action dialog settled.
  - [x] `npx playwright test e2e/organisms.spec.ts --project=chromium` first, then `npm run ci:dev`.
        `lsof -i :4173` before starting.

- [x] **Task 8 — docs, bundle, status (AC12)**
  - [x] `deferred-work.md`: strike `:2405-2411` ("Clone & Edit is not rendered on the in-use dialog")
        as `✅ Closed in Story 4.18`; annotate the 4.9 naming entry (`:1455-1465`) with one more
        consumer (two clones of one organism produce two records named `X (Copy)`). Add
        `## Deferred from: Story 4-18-clone-organism (<date>)` with: (1) no success sentence for a
        clone — alert-only, the alternative recorded; (2) the card's Clone does not open the editor
        and offers no rename prompt (the AC's shape); (3) `X (Copy) (Copy)` rather than a
        `(Copy 2)` allocator, and the truncation rule for names at the 50-cap; (4) focus after a
        card Clone stays on the Clone button — the new card is not focused and is not announced
        beyond the count badge; (5) **for Story 4.19/4.21**: a clone creates no reference TO the
        source, but its copied rules DO add a second `organismType` reference to every organism the
        source's rules target, so a rule-reference count rises by cloning — the E.5 derivation must
        count rules, not organisms, if that is the intent; (6) a route-level unmount mid-clone lands
        the write and reports nothing (the same residual `:2370`-ish already records for the editor's
        save); (7) no `origin`/`cloneable` prop on `<OrganismInUseDialog>` yet — Story 4.24's
        battle-origin warning must NOT show Clone & Edit (M5, PRD `:127`), and the dialog's head
        comment says where that lands.
  - [x] Bundle: `npm run build:standalone && npm run bundle:check`; record all five routes.
        `/organisms` first load gains the Clone button, `organismClone.ts` and the writer — expect
        ≤ 0.6 KB gzip; the in-use dialog chunk gains one button. If any route moves more than
        ±0.5 KB beyond that, say why.
  - [x] `sprint-status.yaml`: `4-18-clone-organism: in-progress` at start, `review` at the end; Dev
        Agent Record with every command and its actual exit code.

### Review Findings

Reviewed 2026-09-22 on **Opus 5** against the Sonnet implementation (`e2ed44f`), via three parallel
layers (Blind Hunter, Edge Case Hunter, Acceptance Auditor). 2 decision-needed, 17 patches (all
applied), 6 defers, 4 dismissed. Decisions are the owner's, after the PR. The branch was also
synced with `main` (epic 5's #71 had landed; the only conflict was both lanes appending to
`deferred-work.md`, resolved by keeping both sections).

Two real bugs were found and fixed, both in the Clone & Edit handoff and both invisible to the
story's own tests; one accessibility regression was reproduced in a real browser before being
fixed. The acceptance audit found no FD unimplemented and no task ticked that the diff does not
deliver — every remaining finding is a missing pin or an edge case.

- [ ] [Review][Decision] **A Clone & Edit that fails is never announced, and on success the count
  badge's announcement is suppressed too — the Library's alert and badge both live in the
  `inert`/`aria-hidden` background while the gate is still mounted.** `setCloneError(...)` and
  `setGateOpen(false)` land in one commit, so the `role="alert"` node is INSERTED into a subtree
  `useInertBackground` has already marked `inert` (MUI defers its own `aria-hidden` removal to the
  end of the transition). A live region inserted inside a hidden subtree is dropped by assistive
  tech, and once the gate exits the node already exists, so nothing re-announces it. The same
  mechanism suppresses the successful path's `role="status"` badge change, so FD10's "the new card
  plus the badge's own count change is the announcement" does not hold for this entry point. A
  sighted user does see both; a screen-reader user gets silence from Clone & Edit either way. Note
  the hook already solves exactly this for the editor's own save — `handleExited` defers `onSaved`
  until after `mounted` clears, for this stated reason — and the clone path does not get that
  treatment. Options: **(1)** accept it — the failure is visible on screen, and the window closes
  in ~195 ms; **(2)** defer the error the same way `onSaved` is deferred, reporting it after the
  gate has exited (a hook→Library channel, ~15 lines, mirrors an idiom already in this file);
  **(3)** keep the gate OPEN on failure and render the message inside the dialog, which also
  removes the "the write landed nowhere visible" window entirely.
- [ ] [Review][Decision] **A Clone click that loses the `cloningRef` latch is dropped in total
  silence — no clone, no message, no disabled state.** `cloneOrganism` opens with
  `if (cloningRef.current !== null) return null;`, which returns BEFORE `setCloneError` is ever
  touched, while `useOrganismEditorModal`'s option contract documents `null` as "the write was
  refused AND already reported by its owner". Two reachable paths: clicking a SECOND card's Clone
  while the first is in flight (FD5 disables only the clicked card, so the other button is live and
  clickable), and a Clone & Edit while a card clone is in flight — the case AC11 claims "the latch
  covers both entry points", which it does only in the sense that it silently discards one. The
  user's only signal is a count badge that does not move. AC10 says a refused write is reported.
  This is a contradiction inside the spec (Task 5 prescribes exactly this code), not a dev
  deviation, which is why it is here rather than patched. Options: **(1)** accept the silent drop —
  the window is sub-millisecond against localStorage; **(2)** disable EVERY card's Clone while any
  write is in flight, which makes the dropped click impossible but reverses FD5's flicker argument;
  **(3)** report a distinct "a clone is already in progress" line, which needs copy no spec
  supplies. Note the window widens from sub-millisecond to arbitrary behind the AR-2 seam when
  RFC-001's API repository lands.
- [x] [Review][Patch] **A second Clone & Edit during the gate's ~195 ms exit fade wrote a SECOND,
  orphaned clone** [`apps/web/lib/organisms/useOrganismEditorModal.ts` `handleGateCloneAndEdit`] —
  `setGatePending(false)` ran when the writer resolved, but `setGateOpen(false)` only STARTS the
  fade, and Story 4.17's own comment in this file records that the dialog stays clickable
  throughout it. All three buttons re-enabled and `gate` is cleared only in `handleGateExited`, so
  a second click passed the guard and wrote again; `proceedRef` holds only the second, leaving the
  first orphaned in the library with no editor and no mention. `pending` now spans write AND fade,
  released in `handleGateExited`; hook test (e2).
- [x] [Review][Patch] **Cancel or Escape during that same fade discarded a clone that was already
  written** [`useOrganismEditorModal.ts` `handleGateCancel`] — `proceedRef.current = null` with the
  record already in localStorage and already drawn on the grid: the user performed a Cancel, a
  record exists, and no editor ever opens. The 4.17 "last action before the fade ends wins" rule is
  safe for Edit Anyway, which writes nothing, and is not safe here. `handleGateCancel` and
  `handleGateEditAnyway` now bail while the handoff is pending — the hook-level guard, matching
  what the 4.17 review added to `requestEdit`/`requestCreate`, since the dialog's `disabled` means
  nothing to a programmatic caller; hook test (e2).
- [x] [Review][Patch] **Focus was lost to `<body>` after every card Clone** [`OrganismLibrary.tsx`]
  — disabling a button that HOLDS focus blurs it, and no browser restores focus when the attribute
  clears. Reproduced in Chromium against the built export: after Enter on a card's Clone,
  `document.activeElement` was `BODY`, so a keyboard user's next Tab restarted from the top of the
  document. `deferred-work.md` asserted the opposite ("the click never moves focus"). Added
  `refocusCloneRef` + a `[cloning]` effect that restores focus on the commit that re-enables the
  button, and corrected the deferred-work entry; unit test (j) and an assertion in e2e test 7.
- [x] [Review][Patch] **The hook's re-entrancy guard was a render-closure value, not the
  authority** [`useOrganismEditorModal.ts`] — `gatePending` was React state read from the render
  closure, so two calls landing in ONE tick both saw `false` and both ran the writer. Now a
  `gatePendingRef` set synchronously before any await, with the state kept only as what `pending`
  renders from — the same split `<OrganismLibrary>`'s `cloningRef` documents.
- [x] [Review][Patch] **`cloneOrganismName` returned a LONGER name for a SMALLER cap**
  [`organismClone.ts`] — `maxLength - CLONE_NAME_SUFFIX.length` went negative and `String#slice`
  reads a negative end as an offset from the END, so `cloneOrganismName('HelloWorld', 0)` gave
  `'Hel (Copy)'`, 10 characters for a cap of 0. `Math.max(0, …)`; table test over 0/1/5/7.
- [x] [Review][Patch] **`cloneOrganismName` split surrogate pairs, persisting a lone surrogate**
  [`organismClone.ts`] — `'👾'.repeat(25)` (50 code units, exactly the cap) truncated to
  `'👾'×21 + '\ud83d'`. That renders as U+FFFD on the card and in both `aria-label`s, makes the
  organism unsearchable by its own visible text, and is not well-formed UTF-8 for the Epic 5 export
  envelope; Zod's `.max()` counts code units too and does not catch it. Added `cutAtCodePoint`;
  two tests. Grapheme clusters (ZWJ sequences) remain deferred.
- [x] [Review][Patch] **The `cloningRef` latch was never exercised by the test that names it**
  [`OrganismLibrary.test.tsx` (d)] — two bare `fireEvent.click`s each flush React synchronously, so
  the second landed on an already-`disabled` button and never reached `onClick`; deleting the latch
  left the test green. Both clicks now dispatch inside one `act`, with no commit between them.
- [x] [Review][Patch] **The hook's latch test waited for a re-render before the second call**
  [`useOrganismEditorModal.test.tsx` (e)] — which is exactly the stale-closure path it exists to
  cover, so the guard under test was read from a fresh closure. Both calls now land in one tick.
- [x] [Review][Patch] **A test title claimed a backdrop click it never performed**
  [`OrganismInUseDialog.test.tsx` (c)] — the body pressed only Escape, although AC8 and Task 3 both
  name the backdrop. Added the backdrop click plus (c2), a positive control proving the same
  gesture DOES reach `onCancel` when `pending` is false.
- [x] [Review][Patch] **AC6's reverse direction was pinned by no test** — nothing edited the SOURCE
  after cloning and compared the clone's record. Library test (k).
- [x] [Review][Patch] **AC9's "a Save in that session upserts the CLONE's id and `list()` length is
  unchanged" was pinned by no test** — the one place a clone's editor is saved is the card-Clone
  path, and it asserts only that the source is unchanged. Library test (l).
- [x] [Review][Patch] **FD5's distinguishing claim was untested** — the id-not-boolean choice exists
  so other cards stay enabled, and no test asserted another card's Clone is live mid-flight. Added
  to (d).
- [x] [Review][Patch] **AC12's fourth required axe state — the editor open ON A CLONE — was scanned
  nowhere** — added to e2e test 2, which already opens it.
- [x] [Review][Patch] **Task 4 subtask (g) was ticked with no artifact** — no test covered
  `onCloneAndEdit` as a latest-value ref (the analogous `onSaved` case has one). Hook test (g).
- [x] [Review][Patch] **AC4's "no two rules in the clone share an id" was asserted only for
  `CONWAYS_CLASSIC`** — added to the `createMockOrganisms()` table test.
- [x] [Review][Patch] **An `expect(...)` with no matcher inside `waitFor`**
  [`OrganismLibrary.test.tsx` (b)] — asserts nothing; the wait worked only because `getByRole`
  throws. Replaced with `findByRole`.
- [x] [Review][Patch] **A test asserted against `workspace.organisms[0]` rather than the record it
  names** [`OrganismLibrary.test.tsx` (g)] — the index is the used organism today, but nothing pins
  the fixture's order, so a reordering would silently turn it into "an untouched bystander is
  unchanged". Resolved by name.
- [x] [Review][Defer] Grapheme clusters (ZWJ sequences) still split on truncation — deferred,
  needs `Intl.Segmenter` and a rule for a cluster longer than the budget.
- [x] [Review][Defer] A stale clone alert survives every state change except the next clone
  attempt — deferred, "when does an error clear" is a product choice.
- [x] [Review][Defer] Truncation can push a clone out of the active search filter, so it is created
  invisibly — deferred, needs a decision on whether a create clears the filter.
- [x] [Review][Defer] Two page-level `role="alert"` nodes can coexist (clone failure + resource load
  error) — deferred, no unscoped alert query exists in e2e today.
- [x] [Review][Defer] `gatePending` has no timeout: an injected writer that never settles leaves an
  undismissable modal — deferred, unreachable against localStorage, owned by RFC-001's API
  repository story.
- [x] [Review][Defer] `onCloneAndEdit` is optional while the button always renders, so a consumer
  that omits it gets a dead affordance — deferred, pre-existing; Story 4.24's `origin`/`cloneable`
  prop already has its own entry.

**Dismissed (4):** `reload()` blanking the grid on every clone (it is stale-while-revalidate —
`status` never returns to `'loading'`, verified in `useAsyncResource`); condition objects carrying
their own ids and so reproducing the rule-id aliasing one level down (the schema gives conditions
no id); `data-clone-organism-id` as dead code (AC1 mandates it, and the focus patch above now reads
it); the `battleSave` negative lacking a positive control (`battleList`'s call count on the same
spied object is in the same block).


## Dev Notes

### Forced decisions (made here so the dev agent does not have to)

- **FD1 — The clone is a pure, SYNCHRONOUS record→record projection in
  `apps/web/lib/organisms/organismClone.ts`; rule ids are re-minted and `contentHash`es are
  copied.** Three candidates for the projection: (i) round-trip through
  `organismDraftFrom(source, nextId)` + `projectOrganismForSave(draft, newId)` — reuses two shipped
  functions, but re-computes every rule's SHA-256 asynchronously to reproduce digits it already has,
  drags `crypto.subtle` (and its secure-context caveat) onto a path that needs no crypto, and routes
  a persisted record through the EDITOR's parse — whose numeric bounds are deliberately tighter than
  the schema's (`age ≤ 999`, `neighborCount ≤ 8`, strict `min < max`;
  `deferred-work.md`'s 4.11/4.17 entry), so a schema-legal record would be refused by its own clone;
  (ii) `structuredClone` + field fixes — copies `contentHash` correctly but silently keeps rule ids
  and skips the schema parse; (iii) an explicit projection ending in `OrganismSchema.parse`. (iii) it
  is. Rule ids: RFC-004 §2.4 defines `id` as "opaque, generated … assigned once at creation" and
  states "Identical rules share a `contentHash` but keep distinct `id`s" — the clone's rules are
  created now. The cost of keeping them is not hypothetical: Decision E.5's rule-reference index
  (Story 4.19) and any `Map<ruleId, …>` over the workspace would collide silently across the two
  organisms. `contentHash` is copied because `ruleContentHash.ts`'s scheme hashes
  `{ conditions, payload }` with `id` excluded — recomputing it produces the same 64 hex digits, and
  two organisms legitimately sharing a hash is the design (`compileEvaluators.ts`'s cache key is the
  ordered join of a rule LIST's hashes, so the clone gets a cache hit, not a collision).
  `OrganismSchema.parse` is load-bearing beyond validation: it rebuilds every nested array and
  object, so the clone shares nothing by reference with a source whose rules may be `deepFreeze`d
  (`CONWAYS_CLASSIC`) — a bare `{ ...rule, id }` keeps the source's `conditions` reference.

- **FD2 — `[Name] (Copy)` truncates the head rather than overflowing the 50-character cap.**
  `OrganismSchema.name` is `z.string().max(50)` and `<OrganismNameField>` lets the user type exactly
  50, so `name + ' (Copy)'` is a 57-character record that `OrganismSchema.parse` THROWS on — Clone
  would fail on precisely the names the editor allows, with the generic failure sentence and no way
  for the user to understand it. Of the three fixes — truncate the head, drop the suffix when it does
  not fit, refuse the clone — only the first keeps the AC's marker on every clone; the second
  produces a clone indistinguishable from its source in the grid (the exact thing the suffix exists
  to prevent), and the third is a button that fails. `trimEnd()` on the head so a cut landing on a
  space, or a source name that already ends in one, does not yield `"Foo  (Copy)"`. A blank or
  whitespace-only source name yields exactly `'(Copy)'` — no leading space on a record whose card
  otherwise reads `Unnamed organism`. **No uniqueness pass**: `Organism.name` has no uniqueness
  constraint anywhere (schema, repository or UI), the PRD asks only for "a default name like
  '[Original Name] (Copy)'", and a `(Copy 2)` allocator is a second naming model to maintain for a
  cosmetic gain — `sortLibrary` already tie-breaks identical names deterministically by id, and the
  standing naming entry (`deferred-work.md:1455-1465`) owns the accessible-name consequence.

- **FD3 — ONE writer, in `<OrganismLibrary>`, injected into the hook.** The card's Clone and the
  gate's Clone & Edit differ only in what happens AFTER the write, so there is one
  `cloneOrganism(source): Promise<Organism | null>`: mint both ids, project, `organisms.save()`,
  `reload()`, return the clone — or report the failure and return `null`. It lives in the Library
  because that is the component holding the injected `OrganismRepository` (AR-2/AR-27: the card, the
  dialog and the hook import no repository and receive none), and it reaches the hook as an OPTION,
  not as a repository. `null` rather than a throw: the hook owns sequencing and has no error surface;
  the Library owns the alert.

- **FD4 — The card's Clone is the mockup's second `.action-btn`, and `EditButton` becomes
  `ActionButton`.** `organism-library.html:439-442` is a three-button row and Story 4.17 already
  built the first button's chrome with the house substitutions (`--gol-border-control` for SC 1.4.11;
  **no `transition`** — the mockup's `all 0.2s` is the `<CreateButton>` axe trap this page records).
  Forking a `CloneButton` with identical styles is the duplication 4.22 would then triple. The
  disabled state comes from the mockup's own `.action-btn:disabled` (`:342-349`), including its
  hover reset. The card gains a second keyboard stop: Story 4.17's decision was "the `<article>` is
  not a stop", not "one stop per card" — two stops for two real actions is exactly what the mockup
  and `<BattleTile>`'s action row already do.

- **FD5 — Re-entrancy is a `cloningRef` latch plus a `disabled` attribute, and the state is an id,
  not a boolean.** A double-click on Clone writes two records with two ids — there is no uniqueness
  anywhere to catch it, and the user sees two identical cards. The ref is the authority (it is set
  synchronously, before any await, and covers a programmatic caller); `disabled` is the affordance.
  The state holds the id so only the clicked card's button disables — disabling every card's Clone
  for a sub-millisecond localStorage write would be a visible flicker across the whole grid. The
  latch is shared with the gate's path, so the two entry points cannot interleave.

- **FD6 — Cancel / Clone & Edit / Edit Anyway, with Edit Anyway keeping the contained slot.** The UX
  doc lists the options as "Edit Anyway" | "Clone & Edit" | "Cancel"
  (`organism-editor-design.md:541`); the house dialog idiom is safe-first-`autoFocus`,
  middle, recommended-last-`contained` (`<UnsavedChangesDialog>`'s Cancel / Discard Changes /
  Save & Leave). Keeping Edit Anyway contained means this story inserts a button and re-decides no
  visual hierarchy, and every 4.17 assertion about Cancel's `autoFocus` and Edit Anyway's variant
  stands. `pending` is not cosmetic: without the `onClose` guard, Escape during the write closes the
  gate, `handleGateExited` runs before `proceedRef` is stashed, and the clone is written with no
  editor and no explanation. `disableEscapeKeyDown` was removed from MUI v9's Modal, so the guard has
  exactly one home.

- **FD7 — The hook sequences the clone through the EXISTING `proceedRef` handoff; only `gatePending`
  is new.** `handleGateExited` is untouched: it opens the editor on whatever `proceedRef` holds, and
  a failed clone leaves it `null`, degenerating to a Cancel. The async write is `void`-wrapped rather
  than handed to the `(): void` prop as an `async` function. The awaited resolution can land after a
  route-level unmount of the Library — no new guard: React 19 does not warn, nothing is rendered from
  the resolution but state the unmounted tree discards, and the identical residual is already
  recorded for the editor's own save.

- **FD8 — The clone's editor session is an ORDINARY edit session, and `library` already holds the
  clone.** Because the writer reloads (FD9), `sorted` has settled with the clone by the time the
  editor mounts, so `saveStamp = { id: clone.id }` (from the modal's `organism` prop), `others =
  library.filter(o => o.id !== clone.id)` excludes the clone and INCLUDES the source — which is
  correct on both surfaces: the 4.9 colour-reuse warning will name the source if the user re-picks
  the shared token (they really are two organisms on one token, M6), and the organism-type dropdown
  lists the source (a rule targeting the clone itself is what 4.17's FD8 excludes anyway). If the
  reload has not settled yet, the same views simply lack the clone for a frame — a strictly smaller
  list, no wrong answer. Nothing in the modal changes for this story.

- **FD9 — The writer reloads; the editor's `onSaved` is not the refresh path for a clone.**
  `onSaved` fires only when a save happened in the editor session, so a Clone & Edit closed WITHOUT
  saving would leave a written clone with no card until the next page load — a record the user
  created and cannot see. Reloading inside the writer fixes that and, as a bonus, makes FD8's
  `library` correct. The reload lands while the gate may still be open: harmless, because the
  background is `aria-hidden`/`inert` for that window (so the count badge's live region announces
  nothing behind the modal), and `useInertBackground`'s MutationObserver sweeps newly appended BODY
  children — a re-render of the section in place is not one.

- **FD10 — The failure surface is ONE `role="alert"`, and adding a `role="status"` would break the
  existing e2e.** `e2e/organisms.spec.ts`'s 4.17 block defines `countBadge = (page) =>
  page.getByRole('status')` — unscoped. A second status node on `/organisms` makes that locator
  resolve to two elements and every badge assertion in the 4.16 and 4.17 blocks fails Playwright's
  strict mode, in a story that never touched them. `role="alert"` is also the right semantics (a
  refused write is an error, and the Library's existing `'error'` StatusText already uses it — the
  two are mutually exclusive by status). Success gets no sentence: the new card and the badge's own
  count change are already the announcement, and inventing outcome copy with no spec behind it is
  what the Open flags are for.

- **FD11 — After Clone & Edit, focus restores to the CLONE's Edit button.** `requestEdit` set
  `restoreFocusRef` to the SOURCE's id; the clone handler retargets it, because that is the record
  the user just created and just edited, and the DOM lookup already falls back to the create button
  when the card is absent (a filter that excludes the clone's name — the narrow case the 4.17 review
  deferred for the rename path). After a FAILED clone the ref is left pointing at the source, which
  is the only card that exists.

- **FD12 — What the clone deliberately does not get.** No new colour (FR-1.6: "the clone reuses the
  source organism's color"), no `defaultColorToken()` call, and **no FR-2.3 reuse warning** — M6
  raises it only for an explicit user *selection*, and cloning selects nothing (the system-assigned
  default does not raise it either, by the same sentence). No cap check of any kind (M6: the
  workspace library is uncapped; G.3's 255 bounds one BATTLE's roster, and a clone is placed on no
  grid). No rename prompt and no editor from the card's Clone. No change to any battle: a clone
  appears in no `organismIds`, so `buildUsageIndex` gives it 0 and its own Edit opens directly. The
  copied rules' `organismType` patterns still name the SOURCE's targets — correct for a variant, and
  the reason a clone raises every targeted organism's rule-reference count (a note for 4.19/4.21).

### What exists — read these before writing a line

| File | Why it matters here |
|---|---|
| `apps/web/components/organisms/OrganismCard.tsx` (+ `.test.tsx`) | **Modified.** The head comment naming 4.18 (`:13`), `CardActions` (`:137-141`), `EditButton` → `ActionButton` (`:143-182`), the tab-stop paragraph (`:15-21`), props (`:160-175`), the Edit button's render. The mockup's `.action-btn:disabled` is `organism-library.html:342-349`. |
| `apps/web/components/organisms/OrganismInUseDialog.tsx` (+ `.test.tsx`) | **Modified.** `OrganismInUseDialogProps`, the unguarded `onClose`, the two `<Button>`s, `BUTTON_SX`, and the head comment's "Two actions, not the AC's three" paragraph — which is this story's brief, written by 4.17. `organismInUseMessage` / `battleCountLabel` are unchanged. |
| `apps/web/components/battle/UnsavedChangesDialog.tsx:61-133` | **The three-action dialog to copy** — the `if (pending) return;` guard on `onClose` with its MUI-v9 reason, `disabled={pending}` on all three, Cancel-first `autoFocus` + outlined + `color="inherit"`, the middle button plain, the last `variant="contained"`. |
| `apps/web/lib/organisms/useOrganismEditorModal.ts` (+ `.test.tsx`) | **Modified.** `UseOrganismEditorModalOptions`, `onSavedRef` (the latest-value-ref idiom to copy for `onCloneAndEditRef`), `proceedRef` and its comment naming this story, `restoreFocusRef`, `handleGateCancel`/`handleGateEditAnyway`/`handleGateExited`, `gateProps`. ⚠️ `import type` only from the modal and dialog modules — changing either to a value import defeats both `dynamic()` boundaries and only the bundle gate would notice. |
| `apps/web/components/organisms/OrganismLibrary.tsx` (+ `.test.tsx`) | **Modified.** The two `dynamic()` imports and their reasons, the one `useAsyncResource` over `Promise.all([organisms.list(), battles.list()])`, `const { reload } = resource`, `onSaved`, the hook call, `onRequestEdit`, the card map, `<StatusText role="alert">` in the `'error'` branch, the `CountBadge role="status"`. Tests: the per-test `createFakeRepositories({ organisms, battles })`, the 4.16/4.17 blocks' idioms. |
| `apps/web/lib/organisms/organismRecord.ts` | `projectOrganismForSave(draft, id)` — the projection whose SHAPE the clone mirrors (boundary parse last, `ORGANISM_SCHEMA_VERSION` stamped, name raw) and whose PATH it deliberately does not reuse (FD1). Unchanged. |
| `apps/web/lib/organisms/ruleContentHash.ts` | The hash scheme — `sha256hex(JSON.stringify(sortKeysDeep({ conditions, payload })))`, `id` excluded. Its consumer list names this story and is **wrong**; Task 6 corrects it. |
| `apps/web/lib/organisms/organismDraft.ts` / `ruleDraft.ts:159-169` | `organismDraftFrom(organism, nextId)` / `ruleDraftFrom(rule, nextId)` — the injected-`nextId` contract the clone follows, and the round-trip this story does NOT use. Unchanged. |
| `apps/web/lib/organisms/sortLibrary.ts` | The grid order, and a header that already anticipates "a user can clone Conway's Classic and rename the clone identically" — the pin is by id, so a clone never displaces the default. |
| `apps/web/lib/saveFailureMessage.ts` | `saveFailureMessage(error, 'organism')` — the three branches (quota / corrupt / generic), each stating that stored data is untouched. The clone's only failure copy; write none. |
| `apps/web/lib/organisms/colorReuse.ts` + `editor/ColorPickerField.tsx` | `usersByColorToken` / `colorReuseWarning` and the `seedValue`-never-warns rule — why a clone raises no warning at creation and what the user sees if they later re-pick the shared token. |
| `apps/web/lib/palette/defaultColorToken.ts` | The next-unused / least-used allocator — the CREATE path's, **not** the clone's (FD12). Do not call it. |
| `packages/domain/src/organismSchema.ts` | `MAX_ORGANISM_NAME_LENGTH = 50`, `ORGANISM_SCHEMA_VERSION`, `OrganismSchema` (`name: z.string().max(50)` — no `.min(1)`, no uniqueness; `id: z.string().min(1)`). The cap FD2 exists for. |
| `packages/domain/src/survivalRuleSchema.ts` | `SurvivalRuleSchema` (`id`/`contentHash` non-empty opaque strings, no uniqueness refine over the list), `OrganismTypeCondition.pattern` = another organism's LIBRARY id (Decision E). |
| `packages/domain/src/defaultWorkspace.ts` | `CONWAYS_CLASSIC` (`deepFreeze`d — the non-aliasing test's subject), `CONWAYS_CLASSIC_ID`. |
| `packages/persistence/src/localStorageOrganismRepository.ts:11-16` | `save()` is a keyed UPSERT on `organism.id` — a clone needs nothing but a fresh id. `list()` skips an unparseable record; `assertSafeCollectionId` runs on save. |
| `packages/simulation/src/session/compileEvaluators.ts:99-127` | `cacheKeyFor` — the ordered join of a rule LIST's `contentHash`es, and the note that two rules may legally share a hash. Why a clone's copied hashes are a cache hit, not a collision. |
| `packages/test-utils/src/mockWorkspace.ts` / `fakeRepositories.ts:77` | `createMockOrganisms()` (deep clones per call), `createMockWorkspace()`, `MOCK_ORGANISM_IDS`, `createFakeRepositories({ organisms, battles })`. |
| `apps/web/e2e/organisms.spec.ts:3090-3384` | The copied seed helpers, `seedExtraOrganisms`, and the whole 4.17 block whose helpers this story reuses — `settled`, `editorDialog`, `inUseDialog`, `back`, `countBadge`, `storage`, and the WebKit focus branch. The 4.16 block (`:2844`) carries the real-browser quota idiom. |
| `docs/implementation-artifacts/deferred-work.md:1455-1465, 2405-2411` | The naming entry this story adds a consumer to, and the entry that IS this story's brief. |
| `docs/implementation-artifacts/4-17-edit-organism-from-library.md` (FD3–FD9, Review Findings) | The gate's sequencing, the focus-restore idiom, the re-entrancy guard, and the owner decision (2026-09-22) that kept the clone sentence in the dialog copy on the promise that 4.18 makes it true. |
| `docs/planning-artifacts/epics.md:1202-1212` | Story 4.18's ACs. `:1189-1200` (4.17), `:1214-1250` (4.19–4.21), `:38, :254` (FR-1.6 traceability). |
| `docs/planning-artifacts/prds/prd-GameOfLife-2026-05-26/prd.md:125-127, 147-151, 177` | FR-1.3's two context variants, FR-1.6's three ACs verbatim, FR-2.3's "never run out of a color". |
| `docs/planning-artifacts/architecture.md:351-353` | **M5** (Library clones are manually managed — no zero-reference GC; no Clone & Edit from the Battle Editor) and **M6** (uncapped, reusable colours, the three disambiguated "20"s). `:261` — G.3, the per-battle 255. |
| `docs/planning-artifacts/rfcs/RFC-004-simulation-rules-engine.md` §2.4 | Rule identity: `id` opaque and assigned once at creation; identical rules share a `contentHash` but keep distinct ids. The authority behind FD1. |
| `docs/planning-artifacts/ux-designs/ux-GameOfLife-2026-05-27/organism-editor-design.md:537-544` and `clinical-lab-theme/organism-library.html:309-349, 404-442` | The warning's three options, and the card action row's CSS (including `.action-btn:disabled`) and markup. |
| `docs/implementation-artifacts/lane-gates.yaml` | No gate on 4.18; this story proposes none. |

### Architecture compliance

- **AR-2 / AR-27 / RFC-001 §1** — the clone's only repository call is `organisms.save()` on the
  injected, interface-typed prop inside `<OrganismLibrary>`; the card, the dialog, the hook and
  `organismClone.ts` import no repository and receive none. The hook receives a FUNCTION, not a
  repository. Test: swapping to an API repository edits no component.
- **FR-1.6 / M6 / M5** — "[Original Name] (Copy)", the source's colour, uncapped by the palette, an
  ordinary manually-managed organism with no zero-reference GC. **Decision G.3** is untouched — a
  clone is placed on no grid.
- **Decision E / RFC-004 §2.4** — `organismType` patterns stay stable LIBRARY ids and are copied
  verbatim (never a numeric ref); rule ids are opaque and minted at creation; `contentHash` stays a
  faithful content address, so two organisms sharing one is the design, not a bug.
- **Decision I.4 / AR-11** — `schemaVersion` is stamped from `ORGANISM_SCHEMA_VERSION`, never
  branched on, never carried over from the source (the Story 4.17 restamp decision, which the clone
  follows for the same reason: the record is written NOW, in this shape).
- **Decision H** — a clone changes no battle's `organismIds`; usage stays "placed", so the clone's
  own count is 0 by construction. **M9** — Conway's Classic is cloneable; the clone is not protected
  and carries no SYSTEM tag.
- **Decision K.5** — no route, no `?id=`; every surface here is a modal or a card.
- **RFC-005 Decision 1 / AR-33** — `cloning` and `cloneError` are ephemeral UI state in the Library,
  `gatePending` in the hook; no store, no Context, no persisted flag.
- **RFC-003 Decision 3 / Decision J / AR-46 / AR-35** — `styled()` + `var(--gol-*)`; no new token,
  no hex, no `transition` on the action buttons; per-component MUI imports; no new `dynamic()`
  boundary (the dialog already is one).
- **Zod at boundaries** — `OrganismSchema.parse` once, at the end of the clone projection, before the
  record crosses into persistence. No re-parse of the source.
- **Spec-id hygiene** — `spec:check` tokenises `FR-1.3`, `FR-1.6`, `FR-2.3`, `FR-2.6`, `FR-3.12`,
  `FR-7.15`, `NFR-4.1`, `NFR-7.2`, `AR-2`, `AR-11`, `AR-27`, `AR-33`, `AR-35`, `AR-46`, `RFC-001`,
  `RFC-003`, `RFC-004`, `RFC-005`, `RFC-007`, `Decision C`, `Decision E`, `Decision G`, `Decision H`,
  `Decision I`, `Decision J`, `Decision K`, `M5`, `M6`, `M9`, `Story 4.2`, `Story 4.9`, `Story 4.11`,
  `Story 4.16`, `Story 4.17`, `Story 4.18`, `Story 4.19`, `Story 4.20`, `Story 4.21`, `Story 4.22`,
  `Story 4.23`, `Story 4.24`; write them exactly so. `UX-DR*`, `FD*`, `AC*` are not checked.

### Library / framework notes (installed versions, no research needed)

- **React 19.2** — `void`-wrap the async gate handler rather than passing an `async` function to a
  `(): void` prop. A `setState` after an unmount is inert and unwarned; the `finally` that clears the
  latch still runs.
- **MUI `Dialog` v9** — `disableEscapeKeyDown` no longer exists on `Modal`; the `onClose` callback is
  the only guard point, and it fires for Escape AND backdrop. `onTransitionExited` fires once per
  close. `autoFocus` on Cancel is honoured by the focus trap, and a `disabled` Cancel is skipped by
  it — with all three disabled while `pending`, the trap keeps focus on the paper, which is why the
  window must stay short (a localStorage write).
- **Zod 4** — `OrganismSchema.parse` returns freshly constructed objects and arrays for every nested
  schema, which is what makes the clone structurally independent; it THROWS (not `safeParse`) on the
  name overflow FD2 removes.
- **`crypto.randomUUID()`** — available in the same secure-context conditions as the editor's save
  path (Story 2.13 forced decision 2); no polyfill, no fallback. Two calls per clone (the record id
  and each rule id) — the rule-id generator is injected so a test can count them.
- **Testing Library** — `getByRole('dialog', { name: /^Used in \d+ Battles?$/ })` still resolves the
  gate; `within(dialog).getByRole('button', { name: 'Clone & Edit' })` for the new action (the
  accessible name has a real `&`, written `&amp;` in JSX). For the latch test, resolve `save` from a
  deferred promise held by the test, the 4.16 idiom.
- **Playwright 1.62** — `getByRole('button', { name: 'Clone Glider', exact: true })`; the settle
  idiom is `.MuiDialog-container` opacity 1, never `toBeVisible()` alone.

### Testing standards

- `apps/web` has **no coverage gate** — every test guards a named failure: a clone refused by the
  name cap (clone name tests), a clone sharing its source's rule ids (clone record tests), a clone
  that mutates its source (the aliasing test), two records from one double-click (Library d), a
  written clone with no card (Library g / e2e 4), a silent refused write (Library e / e2e 6), an
  editor opened on the SOURCE instead of the clone (hook a), a gate dismissed mid-write (dialog c),
  a second `role="status"` (the whole 4.16/4.17 e2e, which is the test).
- `packages/*` are **untouched** — no file moves into or out of them, so `packages/domain` stays at
  100% per file and the persistence/simulation/test-utils gates are unaffected. If the dev step finds
  itself editing a package, that is a signal to re-read FD1, not a licence.
- Never snapshot; never assert computed colours in jsdom; never run axe mid-transition; every
  `not.toHaveBeenCalled` needs a positive control in the same block; every "focus is on X" asserts
  `document.activeElement`; count `list()`/`save()` calls, never just `toHaveBeenCalled`.
- Write every test Tasks 1–7 name **before** ticking the task; record what each test actually does.

### Previous story intelligence (Story 4.17)

- The 4.17 review found, and this story inherits, three lessons worth re-reading: a close action
  landing DURING an exit fade must win (hence FD6's `pending` — the equivalent window here is the
  write, not the fade); a request landing while a window is still mounted must be a no-op (the
  `anyMounted` guard is already in place and unchanged); and an AC's "nothing is written" claim needs
  its own test with a positive control in the same block.
- The 4.17 owner decision (2026-09-22) kept the dialog's "Clone this organism first…" sentence on the
  explicit promise that **this story** makes it true. AC8 is that promise; do not reword the copy.
- The 4.16 lesson that still bites: comments go stale one patch later. Keep the AC text, the FD text,
  the code comments and the Dev Agent Record in step as you go.
- `lsof -i :4173` before e2e; paste actual exit codes; `npm run ci:dev`, never `npm run ci`.

### Git intelligence

`main` is at `28c5c64` (merge of #70, 4.17). The last app-code commit is 4.17's
(`packages/domain/src/usageIndex.*`, `components/organisms/{OrganismCard,OrganismLibrary,
OrganismInUseDialog}.*`, `components/organisms/editor/{OrganismEditorModal,ConditionRow}.*`,
`lib/organisms/{useOrganismEditorModal,organismDraft}.*`, `app/(gallery)/organisms/page.*`,
`e2e/organisms.spec.ts`). **Two epics are in progress**: Epic 5 has 5.1/5.2 merged (#65/#67) and 5.3
(export envelope serializer) next; 5.x touches `packages/persistence`, `lib/settings/**` and
`components/settings/**`, and reads `organisms.list()`/`battles.list()` without editing the Library.
This story's files: `apps/web/lib/organisms/{organismClone,useOrganismEditorModal}.*`,
`apps/web/components/organisms/{OrganismCard,OrganismLibrary,OrganismInUseDialog}.*`,
`apps/web/app/(gallery)/organisms/page.test.tsx`, the comment-only touches in Task 6,
`e2e/organisms.spec.ts`, `deferred-work.md`, `sprint-status.yaml`. **No package file, and no file
Epic 5's next stories touch.**

### Project Structure Notes

- New: `apps/web/lib/organisms/organismClone.ts` (+ `.test.ts`).
- Modified: `OrganismCard.tsx` (+ test); `OrganismInUseDialog.tsx` (+ test);
  `useOrganismEditorModal.ts` (+ test); `OrganismLibrary.tsx` (+ test);
  `app/(gallery)/organisms/page.test.tsx` (one line); comment-only files in Task 6;
  `e2e/organisms.spec.ts`; `deferred-work.md`; `sprint-status.yaml`.
- Naming: `cloneOrganismRecord`, `cloneOrganismName`, `CLONE_NAME_SUFFIX`; card prop
  `onRequestClone`, card prop `cloning`, styled `ActionButton`, attribute `data-clone-organism-id`;
  dialog props `onCloneAndEdit`, `pending`; hook option `onCloneAndEdit`, local `gatePending`,
  handler `handleGateCloneAndEdit`, ref `onCloneAndEditRef`; Library `cloneOrganism`, `cloning`,
  `cloningRef`, `cloneError`, attribute `data-clone-error`.
- Untouched on purpose: every file under `packages/`; `organismRecord.ts`, `organismDraft.ts`,
  `ruleDraft.ts`, `conditionDraft.ts`, `colorReuse.ts`, `defaultColorToken.ts`, `saveOutcome.ts`,
  `OrganismEditorModal.tsx` and every `editor/` component, `useAsyncResource.ts`,
  `useInertBackground.ts`, `saveFailureMessage.ts`, `themes.css`, `theme.ts`,
  `playwright.config.ts`, `scripts/check-bundle-size.mjs`, `docs/project-context.md`,
  `lane-gates.yaml`.

### What NOT to build

- ❌ No `organisms.clone()` on the repository interface — the projection is pure and the write is an
  ordinary `save()`.
- ❌ No `ruleContentHash` call, no `await`, no `crypto.subtle` in the clone path.
- ❌ No round-trip through `organismDraftFrom` + `projectOrganismForSave` (FD1).
- ❌ No `defaultColorToken()` call, no colour reassignment, no reuse warning at clone time.
- ❌ No uniqueness pass on names, no `(Copy 2)`, no rename prompt, no inline rename on the card.
- ❌ No editor opened by the card's Clone; no clone offered from the Battle Editor (M5 — 4.24's
  warning is Edit Anyway / Cancel only).
- ❌ No second `role="status"` on `/organisms`; no success sentence for a clone.
- ❌ No change to `handleGateExited`, `requestEdit`, `requestCreate`, the inert union or the focus
  effect; no second `useInertBackground` call; no stacked dialogs.
- ❌ No usage/rule-reference derivation (4.19), no footer or popover (4.20), no Delete (4.21/4.22),
  no dirty scope (4.23).
- ❌ No new e2e seed module and no sixth copy of the seed helpers; no edit to the five existing
  copies.
- ❌ No `transition` on `ActionButton`; no new `--gol-*` token; no hex.

### Open flags for the owner (not blockers — the story proceeds on the FD)

- **A clone's success is announced only by the new card and the count badge (FD10).** A symmetric
  outcome line ("[Name] added to your library.") would need copy no spec supplies and a second live
  region the e2e's unscoped `getByRole('status')` cannot tolerate without a same-story fix to the
  4.16/4.17 blocks. Say the word and it is a small, contained follow-up.
- **`X (Copy) (Copy)` rather than `X (Copy 2)` (FD2).** The PRD's "a default name like" allows
  either; an allocator is a second naming model and needs a uniqueness scan the workspace has never
  had.
- **A clone's name is truncated at 50 characters (FD2)**, keeping the ` (Copy)` marker and cutting
  the source's name. The alternative — drop the marker — makes a long-named clone indistinguishable
  from its source in the grid.
- **Rule ids are re-minted (FD1).** If a future story wants a clone's rules to be recognisably "the
  same rules" (a diff view, a merge on import), keeping the source ids is a one-line revert — but it
  puts two organisms' rules under one id and Story 4.19's rule-reference index should decide first.
- **Focus after Clone & Edit lands on the clone's Edit button (FD11).** Restoring to the source's is
  a one-line revert if the owner prefers "you came from here".
- **Clone & Edit appears on the Library's warning only by construction, not by a prop.** Story 4.24
  must add an `origin` (or `cloneable`) prop to withhold it from the Battle Editor's warning (M5).
  Flagged in the dialog's head comment and in `deferred-work.md` rather than pre-built here.

### References

- `docs/planning-artifacts/epics.md:1202-1212` (Story 4.18 ACs), `:1189-1200` (4.17), `:1214-1250`
  (4.19–4.21), `:38, :254` (FR-1.6 traceability).
- `docs/planning-artifacts/prds/prd-GameOfLife-2026-05-26/prd.md:123-127, 147-151, 170-179`;
  `.decision-log.md:302, 446, 485-502` (the H-1 clone-lifecycle decision and the 2026-07-08 removal
  of Clone & Edit from the Battle Editor only).
- `docs/planning-artifacts/architecture.md:261` (G.3), `:276-287` (I), `:351-353` (M5, M6),
  `:263-274` (H).
- `docs/planning-artifacts/rfcs/RFC-004-simulation-rules-engine.md` §2.4 (rule identity);
  `RFC-005-application-state-modes-undo.md:159-172` (the Library's repositories);
  `RFC-007-organism-colour-palette.md` Decision 1/3 (token registry, reuse).
- `docs/planning-artifacts/ux-designs/ux-GameOfLife-2026-05-27/organism-editor-design.md:24-38,
  537-544`; `ux-design-complete.md:684-696`;
  `clinical-lab-theme/organism-library.html:309-349, 404-442`.
- `docs/implementation-artifacts/4-17-edit-organism-from-library.md` (FD3–FD9, the Review Findings'
  owner decision); `4-16-create-save-organism.md` (the save path, the close-lock, `reload()`);
  `4-2-organism-card-grid.md` (FD1/FD5 — the action row and the tab-stop policy).
- `docs/implementation-artifacts/deferred-work.md:1455-1465, 2405-2411`.
- `docs/implementation-artifacts/lane-gates.yaml`.
- `docs/project-context.md` — Framework rules (repositories injected, never imported; three state
  categories; one immutable theme), Language rules (strict TS, `isolatedModules`, Zod at
  boundaries), Testing rules (no coverage gate on `apps/web`; shared fixtures from
  `@gol/test-utils`; the Playwright viewport band), Code Quality (AR-46; `spec:check`; comments
  explain why), Critical rules (never persist a numeric ref; grid dimensions are parameters), the
  Commit gate.

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5 — via `bmad-dev-story` under `implement-next-story` (lane epic 4), 2026-09-22.

### Debug Log References

- Task 1: `npx vitest run apps/web/lib/organisms/organismClone.test.ts` — first run 1 failed (a
  hand-miscalculated `maxLength` fixture in the test itself: `cloneOrganismName('Glider', 10)`
  expected `'G (Copy)'`, actual `'Gli (Copy)'` — `10 - CLONE_NAME_SUFFIX.length(7) = 3`, corrected
  to `'Gli (Copy)'`) → 15 passed.
- Task 2: `npx vitest run apps/web/components/organisms/OrganismCard.test.tsx` — 19 passed, first
  run (mechanical `onRequestClone={vi.fn()}` addition to every existing render).
- Task 3: `npx vitest run apps/web/components/organisms/OrganismInUseDialog.test.tsx` — 12 passed,
  first run.
- Task 4: `npx vitest run apps/web/lib/organisms/useOrganismEditorModal.test.tsx` — 33 passed
  (7 new, the `Clone & Edit from the gate` block), first run.
- Task 5: `npx vitest run apps/web/components/organisms/OrganismLibrary.test.tsx` — first run 2
  failed: (a) `battleList` expected once, actual twice — `reload()` re-runs the SAME shared
  `useAsyncResource` fetcher (`Promise.all([organisms.list(), battles.list()])`, Story 4.17 FD2),
  so a clone's reload reads battles again too, exactly as the 4.17 save-flow's own reload does;
  fixed the test's own expectation, not the code. (e) the quota-then-retry test never actually
  persisted on retry — `organisms.save` had been fully mocked with `mockRejectedValueOnce`, and the
  planned `mockResolvedValueOnce(undefined)` follow-up bypassed the real repository; removed it —
  `vi.spyOn`'s default behaviour (call through once the once-queue is exhausted) already does the
  right thing. → 50 passed on re-run.
- Task 6: no tests (comment-only); `npx tsc --noEmit -p apps/web/tsconfig.json` — 0 errors.
- Task 7: `lsof -i :4173` — free, both times. First `npx playwright test e2e/organisms.spec.ts
  --project=chromium -g "clone organism"` run: 2 failed — test 1's `page.reload()` re-ran the
  seeding `addInitScript`s and wiped the just-created clone back to the original 5-organism seed
  (the identical trap Story 4.17's e2e test 3 already worked around); replaced with the same
  client-side nav-link round trip 4.17 uses. Test 4's `getByRole('heading', { name: USED })` had no
  `exact: true` and Playwright's substring match resolved to both "Aggressive Colonizer" and its
  own "Aggressive Colonizer (Copy)" (strict-mode violation); added `exact: true`. Re-run: 8/8 passed
  (16.2s); the 4.17 block re-run clean too (7/7, 19.9s) — the lifted module-scope helpers didn't
  regress it.
- Task 8: bundle numbers below; `deferred-work.md` edits are prose-only (no test).
- **`npm run ci:dev` — exit 0 on the fourth attempt** (2026-09-22). Runs 1–3 each turned up exactly
  one failure, in a DIFFERENT file each time, none of them a file this story touches: run 1's two
  e2e failures were the real bugs above (fixed before run 2); run 2 timed out `OrganismLibrary.test
  .tsx`'s pre-existing "(h) has no axe violations..." (4.17's own test) at the default 5000ms under
  full 5-workspace parallel `test:coverage` load — passes in **9.8s** run alone; run 3 timed out
  `BattlePage.test.tsx`'s pre-existing "is restored to the pre-mount title on unmount" (Story 2.11)
  the same way — passes in **8.47s** run alone. Both are the project's documented shared-CPU
  contention flake class (project-context.md's Story 3.17 note, previously recorded for e2e only;
  same mechanism reproduces it in `vitest` coverage runs under this sandbox). Run 4, clean: web
  **120 files / 2040 tests**; domain 116 (100% per file), simulation 407, persistence 90,
  test-utils 95 — `test:coverage` 5/5 workspaces green · `build:standalone` ✓ · `bundle:check` ✓
  (five routes below) · `bench` + `bench:check` ✓ (8.829 ms headroom, 53.0% of the frame) ·
  `e2e:chromium` ✓ **255 passed, 1 skipped** (the standing skip).

### Completion Notes List

- **Task 1** — `apps/web/lib/organisms/organismClone.ts` (new): `CLONE_NAME_SUFFIX`,
  `cloneOrganismName` (head-truncate + `trimEnd`, blank → bare suffix trimmed of its leading
  space), `cloneOrganismRecord` (synchronous, `OrganismSchema.parse` last, rule ids re-minted via
  the injected `nextRuleId`, `contentHash` copied verbatim, no `ruleContentHash` call, no `await`).
  Tests (a)–(g) as specified, plus the maxLength case and the CONWAYS_CLASSIC + every
  `createMockOrganisms()` record table test.
- **Task 2** — `OrganismCard.tsx`: `EditButton` → `ActionButton` (adds `&:disabled` /
  `&:disabled:hover` from the mockup, no `transition`); `onRequestClone(): void` and
  `cloning?: boolean` props; the Clone button after Edit inside `CardActions`, `flex: 1` splitting
  the row; head/`CardActions`/tab-stop comments present-tensed for two real stops. Tests: existing
  renders gain `onRequestClone={vi.fn()}` (mechanical); new tab-order, disabled-only-Clone, click
  isolation, whitespace-name and axe-with-disabled-Clone tests.
- **Task 3** — `OrganismInUseDialog.tsx`: `onCloneAndEdit(): void` and `pending: boolean` props;
  `onClose` gains the `if (pending) return;` guard (the `<UnsavedChangesDialog>` shape); Clone &
  Edit inserted between Cancel and Edit Anyway (text variant, `&amp;` in JSX); all three buttons
  `disabled={pending}`; head comment rewritten for three actions and the 4.24 `origin`/`cloneable`
  flag this story does NOT add. Tests (a)–(e) as specified plus the pending-disables-all-three /
  Escape-and-backdrop-no-op case and axe at both `pending` values.
- **Task 4** — `useOrganismEditorModal.ts`: `onCloneAndEdit?(source): Promise<Organism | null>`
  option held in an `onCloneAndEditRef` latest-value ref (the `onSavedRef` idiom); `gatePending`
  state; `handleGateCloneAndEdit` — a synchronous `useCallback` that `void`s an inner async IIFE
  (bails on no gate organism or an in-flight write, awaits the injected writer, retargets
  `restoreFocusRef` to the clone's id on success, stashes the result in the EXISTING `proceedRef`,
  closes the gate in both branches); `gateProps` gains `pending`/`onCloneAndEdit` with deps grown
  accordingly. `handleGateExited`, `handleGateCancel`, `handleGateEditAnyway`, `requestEdit`,
  `requestCreate` and the inert/focus effects are untouched, as specified. Tests (a)–(g): the Probe
  gained a `cloneResult` prop; `waitFor` around every `pending`/`open` transition rather than a
  fixed microtask-tick count (the file's own deferred-promise idiom, matched to the modal's
  `resolveSave`/`waitFor` pattern rather than raw `act()` counting).
- **Task 5** — `OrganismLibrary.tsx`: `cloningRef` (authority) + `cloning`/`cloneError` state; ONE
  `cloneOrganism(source)` writer (mint both ids at the call site, `cloneOrganismRecord`,
  `organisms.save`, `reload()`, catch → `saveFailureMessage(error, 'organism')` → `null`); card
  wiring (`cloning={cloning === organism.id}`, `onRequestClone`); hook wiring
  (`onCloneAndEdit: cloneOrganism`); the `[data-clone-error]` `<StatusText role="alert">` outside
  `aria-busy`, under the toolbar. Tests (a)–(i) as specified (QuotaExceededError/CorruptDataError/
  plain-Error split into three focused tests rather than one long one); `page.test.tsx` gains the
  one-line Clone-button assertion.
- **Task 6** — `ruleContentHash.ts`'s consumer list corrected (the clone is explicitly named as a
  NON-consumer, with the `id`-excluded-from-hash reason); `sortLibrary.ts`'s "a user can clone
  Conway's Classic" sentence was already written present-tense/forward-looking and needed no edit;
  `OrganismCard.tsx`, `OrganismInUseDialog.tsx` and `useOrganismEditorModal.ts`'s Story-4.18
  comments present-tensed as each task above landed them (no separate pass needed).
- **Task 7** — `e2e/organisms.spec.ts`: `editButton`, `editorDialog`, `inUseDialog`, `back`,
  `countBadge`, `settled` and `storage` lifted from the 4.17 `describe` block to module scope
  (`cloneButton` added alongside, new); the 4.17 block's own body updated to use the lifted
  versions (no behaviour change, confirmed by re-running it green). New
  `test.describe('clone organism (Story 4.18)')` with tests 1–8 as specified. Two bugs found and
  fixed during the RED→GREEN pass are recorded in the Debug Log above (the `page.reload()` reseed
  trap and the unscoped `exact: true` heading match).
- **Task 8** — `deferred-work.md`: the `:2405-2411`-area "Clone & Edit is not rendered" entry
  struck as ✅ Closed in Story 4.18; the 4.9-review naming entry annotated with the clone as a
  third consumer; new `## Deferred from: Story 4-18-clone-organism (2026-09-22)` section with the
  seven items the story specified. **Bundle** (gzipped first-load / budget): home 333.7 / 340 KB
  (6.3 KB headroom, unchanged from 4.17), battle 309.5 / 310 (0.5 KB, unchanged), battle/new 309.3
  / 310 (0.7 KB, unchanged), **organisms 297.1 / 305 (7.9 KB headroom; was 296.3 / 8.7 in 4.17 — a
  +0.8 KB move**, ~0.2 KB over the story's ≤0.6 KB estimate for the new Clone button +
  `organismClone.ts` + the writer + the alert markup + the in-use dialog's third button; well
  inside the 7.9 KB headroom, so no action taken), settings 291.5 / 305 (13.5 KB, unchanged).
  `sprint-status.yaml`: `4-18-clone-organism: in-progress` at start, `review` at the end.

### File List

New:
- `apps/web/lib/organisms/organismClone.ts`
- `apps/web/lib/organisms/organismClone.test.ts`

Modified:
- `apps/web/components/organisms/OrganismCard.tsx`, `OrganismCard.test.tsx`
- `apps/web/components/organisms/OrganismInUseDialog.tsx`, `OrganismInUseDialog.test.tsx`
- `apps/web/lib/organisms/useOrganismEditorModal.ts`, `useOrganismEditorModal.test.tsx`
- `apps/web/components/organisms/OrganismLibrary.tsx`, `OrganismLibrary.test.tsx`
- `apps/web/app/(gallery)/organisms/page.test.tsx`
- `apps/web/lib/organisms/ruleContentHash.ts` (comment only)
- `apps/web/e2e/organisms.spec.ts`
- `docs/implementation-artifacts/deferred-work.md`
- `docs/implementation-artifacts/sprint-status.yaml`

Dev Model: sonnet   # every design choice is pre-made in FD1–FD12; the dev step follows the existing action-row, three-action-dialog, proceedRef-handoff and save-failure patterns rather than choosing one.

Proposed lane gate: none

---

This story was implemented with the 'Implement next story' skill with the following stats:

| Phase | Agent model | Agents | Active | Wall clock | Input | Output | Cache write | Cache read | Total tokens |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Step 0 — re-entry guard | — | 0 | 43s | 43s | 38 | 5,552 | 14,250 | 1,117,483 | 1,137,323 |
| Step 1 — create | opus-5 | 2 | 12m 57s | 12m 57s | 284 | 7,641 | 930,048 | 13,884,279 | 14,822,252 |
| Step 2 — implement | sonnet-5 | 1 | 33m 44s | 33m 44s | 766 | 10,647 | 775,731 | 95,952,914 | 96,740,058 |
| Step 3 — review + PR | opus-5 | 4 | 36m 25s | 36m 25s | 734 | 14,075 | 1,906,735 | 45,027,146 | 46,948,690 |
| _of which the orchestrator_ | opus-5 | — | — | — | 106 | 23,032 | 61,531 | 3,542,745 | 3,627,414 |
| **Total (create → PR ready)** | | 7 | **1h 23m** | 1h 23m | 1,822 | 37,915 | 3,626,764 | 155,981,822 | **159,648,323** |

Run started 2026-09-22 19:52 CEST; wall clock runs to the point the run stopped for the owner's review. No idle gaps were excluded; Active and Wall clock agree. (A gap counts as idle above 15 min.) Each phase row covers the phase agent, any agents it spawned, and the orchestrator's own turns in that window — the orchestrator row breaks its share out again, it is not additional. Cache reads dominate the token totals and are billed at a fraction of input rate, so read the Input and Output columns for effort and the total only as a ceiling. The orchestrator's final turn is still being written when these numbers are taken.
