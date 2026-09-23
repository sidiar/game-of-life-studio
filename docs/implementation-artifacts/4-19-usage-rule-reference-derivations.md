---
baseline_commit: 30aaff9
---

# Story 4.19: Usage & Rule-Reference Derivations

Status: in-progress

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a developer,
I want usage and rule-reference indexes as pure derivations,
so that integrity checks are cheap, consistent, and never stored.

## Acceptance Criteria

From `epics.md#Story 4.19: Usage & Rule-Reference Derivations` (`:1214-1225`), decomposed into what a
reviewer can check independently and **corrected for what already exists**: the epic's first AC —
`buildUsageIndex` — landed in Story 4.17 and is on `main` today. This story's real surface is the
**two things that do not exist**: the M7 live-grid union and the Decision E.5 rule-reference index.
**Read FD1–FD12 before touching a file** — the four things that can silently go wrong here (a union
that drops a still-persisted saved reference when the open grid is erased; an "M organism rule(s)"
count derived from a structure that only carries organism ids; a self-reference that makes Story
5.4's closure loop; a domain module that imports `@gol/test-utils` and creates a package cycle) are
settled there.

1. **`buildUsageIndex` is not re-implemented, re-signed or moved.** `packages/domain/src/usageIndex.ts`
   already builds `organismId → battleId[]` from `readonly Pick<BattleSummary, 'id' | 'organismIds'>[]`
   with zero grid deserialization (AR-15, Decision H.4, RFC-005 Decision 8), is barrel-exported, and
   is at 100%. Its five existing tests and `<OrganismLibrary>`'s `usage.get(id)?.length ?? 0` read
   idiom (`OrganismLibrary.tsx:263, :419`) still pass **unchanged** — a diff that edits
   `buildUsageIndex`'s body or signature is out of scope and fails this AC. Only its head comment
   changes (Task 7).

2. **The open battle unions with the saved index, deduped by battle id.** New in `usageIndex.ts`:
   `resolveOrganismUsage(index, organismId, openBattle?)` → `readonly OrganismUsageEntry[]`, where
   `OrganismUsageEntry = { battleId: string | null; isOpenBattle: boolean }` (FD3). Pinned:
   - a saved-only organism yields its index entries in index order, every one `isOpenBattle: false`;
   - an organism placed on the open battle's live grid but on no saved battle yields exactly ONE
     entry, `isOpenBattle: true`, with the open battle's `id` — or `battleId: null` when the open
     battle has never been saved (the caller labels that one **"Current Battle (unsaved)"**, RFC-005
     Decision 8; domain resolves no names);
   - an organism placed on an open battle that IS in the saved index yields **one** entry for that
     battle, not two, carrying its saved `battleId` **and** `isOpenBattle: true`;
   - ⚠️ **an organism the saved index lists for the open battle but whose cells have been erased in
     the live, unsaved session still yields that entry** (`isOpenBattle: false` — the live grid does
     not place it) — Decision H.3: a saved reference counts until the erase is saved, and FR-1.4's
     remedy is "erase its cells **and save**". A union implemented as "live grid wins for the open
     battle" passes every other bullet here and breaks this one silently;
   - `openBattle` omitted, `null`, or placing nothing is exactly `buildUsageIndex`'s answer;
   - the count Story 4.20 renders is `entries.length`; the block Story 4.21 applies is
     `entries.length > 0`. No caller does arithmetic (FD3).

3. **The rule-reference index derives from library rule patterns, per RULE.** New module
   `packages/domain/src/ruleReferenceIndex.ts`:
   `buildRuleReferenceIndex(organisms) → ReadonlyMap<string, readonly RuleReference[]>` keyed by
   `targetOrganismId`, where `RuleReference = { organismId: string; ruleId: string }` (FD5) — built
   by scanning every `survivalRules[].conditions[]` entry whose `property === 'organismType'` and
   taking its `pattern` as the target's stable library id (Decision E; `pattern`, **not** a field
   called `targetOrganismId` — that name exists nowhere in the schema). Pinned:
   - one organism whose rule targets another produces one entry under the target, carrying the
     **referencing organism's id and that rule's id**;
   - entries appear in organism input order, then rule order within an organism (`survivalRules`
     order is priority, FR-2.6 — the caller sorts if a display order matters);
   - two `organismType` conditions in ONE rule both naming X yield **one** entry (a rule references
     a target once), while two different rules of the same organism naming X yield **two** —
     `M` is a count of RULES (FD5, FD9);
   - **self-references are excluded** at the source: an organism whose own rule targets its own id
     contributes no entry, under its own key or any other (Decision E.5 — deleting an organism
     deletes its own rules with it; FD6);
   - a target id that matches no organism in the input **still gets an entry** (FD8);
   - no input organism is mutated and no returned array aliases an input.

4. **`targetOrganismId → referencingOrganismId[]` is one call away.**
   `referencingOrganismIds(index, targetOrganismId) → readonly string[]` returns the **de-duplicated**
   referencing organism ids in first-reference order — the epic's literal index shape, and what Story
   4.20's popover lists and Story 4.21's block names. Pinned: an organism targeting X from three
   rules appears ONCE here while `index.get(X)!.length === 3`; an unknown key returns an empty
   array (not `undefined` — this one is a list, not a map read).

5. **The forward edge exists, so Story 5.4 reuses instead of re-deriving.**
   `ruleTargetIds(organism) → readonly string[]` — every organism id THIS organism's rules target,
   de-duplicated, in condition order, self excluded. It is the single definition of "a rule targets
   X" that `buildRuleReferenceIndex` folds over (FD7), and it is what Story 5.4's transitive export
   closure walks (`lane-gates.yaml:45-49` — "5.4 must consume 4.19's module, not define it").
   Pinned: an organism with no rules, or no `organismType` condition, returns `[]`; a self-target is
   absent; a dangling target is present.
   ⚠️ **This story builds NO closure, no cycle guard and no visited set** — that is Story 5.4's AC,
   including its "A targets B, B targets C" and cycle-termination tests.

6. **Both derivations live in `packages/domain` under the ≥90% per-file gate (AR-39, NFR-5.1).**
   `usageIndex.ts` and `ruleReferenceIndex.ts` are pure functions over already-typed structures:
   no `zod` import and no re-parse (types are proven at the persistence boundary), no DOM type, no
   repository, no React, no memoization inside the package (FD10), no new dependency in
   `packages/domain/package.json`. Both files land at **100% on all four metrics** — `perFile: true`
   means a new file at 0% fails the whole package's gate, and `include: ['src/**/*.ts']` means it is
   measured whether or not a test imports it.

7. **Nothing consumes them yet, and nothing else changes.** No file under `apps/web` is modified:
   Story 4.20 wires the footer and popover, Story 4.21 the delete blocks, Story 5.4 the closure. The
   only non-`packages/domain` edits are the barrel (Task 6) and the two documentation corrections in
   Task 7. `npm run ci:dev` is green, including `spec:check` on every ID this story's comments cite.

8. **The two stale notes that point at this story are corrected in the same commit.**
   `usageIndex.ts`'s head comment says Story 4.19 extends "THIS module" with both additions — half
   true after FD2 — and `deferred-work.md:2437-2440` says the same; `deferred-work.md:2707-2712`
   asks whether the index counts rules or organisms and is answered by FD5. All three are updated in
   place (annotate, don't delete — the repo's convention for a superseded entry, `deferred-work.md`
   review 2026-09-22), so the next reader is not sent to the wrong module or left with an open
   question that has been closed.

## Tasks / Subtasks

- [x] **Task 1 — Read before writing (AC: all).**
  - [x] Read `packages/domain/src/usageIndex.ts` end to end, including its head comment: it is the
        module you extend and the style you match.
  - [x] Read `packages/domain/src/survivalRuleSchema.ts` — the `organismType` variant is
        `{ property: 'organismType', operator: 'eq', pattern: <library id> }`; `ConditionSchema` is a
        `z.discriminatedUnion('property', …)`, so narrowing is `condition.property === 'organismType'`
        and nothing else is needed.
  - [x] Read `packages/domain/src/battleProjection.ts` and `workspaceExportProjection.ts` for the
        file-level-JSDoc-with-a-hazard-paragraph convention every derivation module here follows.
  - [x] Re-read FD1–FD12 below.

- [x] **Task 2 — `resolveOrganismUsage` in `usageIndex.ts` (AC: 2).**
  - [x] Add `export interface OpenBattleUsage { readonly id: string | null; readonly organismIds: readonly string[] }`
        with the FD4 comment: `organismIds` is exactly the set with ≥1 cell on the live `initialGrid`
        (Decision H), computed by the caller — `packages/domain` never sees a grid, let alone
        `RenderableGrid` (an `apps/web` type; `packages/*` has no `dom` lib).
  - [x] Add `export interface OrganismUsageEntry { readonly battleId: string | null; readonly isOpenBattle: boolean }`.
  - [x] Implement `export function resolveOrganismUsage(index: UsageIndex, organismId: string, openBattle?: OpenBattleUsage | null): readonly OrganismUsageEntry[]`
        per FD3: start from `index.get(organismId) ?? []` mapped to `{ battleId, isOpenBattle: false }`;
        if `openBattle` places `organismId`, either flip the matching saved entry's `isOpenBattle` to
        `true` (same `battleId`) or append one entry when its id is absent or `null`.
  - [x] Comment the Decision H.3 hazard **in the code**, not only here: the saved entry survives an
        unsaved erase.
  - [x] Tests in `usageIndex.test.ts`, one `describe('resolveOrganismUsage')` beside the existing
        one, covering every bullet of AC2 including the erase-window case and the `null`-id case.

- [x] **Task 3 — `ruleReferenceIndex.ts` (AC: 3, 5).**
  - [x] New file with a file-level JSDoc naming Decision E.5, RFC-005 Decision 8, its consumers
        (Story 4.20's "Targeted by [M] organism rule(s)", Story 4.21's block, Story 5.4's closure) and
        FD5's rules-vs-organisms decision.
  - [x] `export function ruleTargetIds(organism: Pick<Organism, 'id' | 'survivalRules'>): readonly string[]`
        — de-duplicated, condition order, self excluded (FD6, FD7, FD11).
  - [x] `export interface RuleReference { readonly organismId: string; readonly ruleId: string }` and
        `export type RuleReferenceIndex = ReadonlyMap<string, readonly RuleReference[]>`.
  - [x] `export function buildRuleReferenceIndex(organisms: readonly Pick<Organism, 'id' | 'survivalRules'>[]): RuleReferenceIndex`
        — per rule, per target, deduped within a rule (FD9).
  - [x] `export function referencingOrganismIds(index: RuleReferenceIndex, targetOrganismId: string): readonly string[]`
        — deduped organism ids, first-reference order, `[]` for an unknown key (AC4).

- [x] **Task 4 — `ruleReferenceIndex.test.ts` (AC: 3, 4, 5, 6).**
  - [x] Local factory helpers only — a `rule(id, targets)` and an `organism(id, rules)` built from
        object literals. ⚠️ **No `@gol/test-utils` import**: it depends on `@gol/domain`, so importing
        it here is a package cycle (`workspaceExportProjection.test.ts` records the same rule).
  - [x] Cover: single reference; two rules of one organism onto one target (M = 2, one organism);
        two conditions in one rule onto one target (M = 1); two organisms onto one target; a
        self-target; a dangling target; an organism with no rules; an empty input; `ruleTargetIds`
        de-duplication and order; `referencingOrganismIds` de-duplication and its empty-key answer;
        non-aliasing/non-mutation of the input.
  - [x] At least one fixture built through `OrganismSchema.parse` so no fixture here can be invalid
        unnoticed (the `battleSchema.test.ts` / `workspaceExportProjection.test.ts` convention).

- [x] **Task 5 — Coverage (AC: 6).**
  - [x] `npm run test:coverage -w @gol/domain` (or the repo-level equivalent) and confirm both files
        report **100%** statements/branches/functions/lines. `perFile: true` — a branch you added and
        did not test fails the package, not just the file.

- [x] **Task 6 — Barrel (AC: 6, 7).**
  - [x] Extend the existing `usageIndex` block in `packages/domain/src/index.ts` with
        `resolveOrganismUsage` and `export type { OpenBattleUsage, OrganismUsageEntry, UsageIndex }`,
        and add a new block for `ruleReferenceIndex` with a 2–3 line banner in the house style
        (why it is in the barrel, which decision and which stories consume it).
  - [x] ⚠️ **This file is the known two-lane collision point.** Epic 5's export block sits directly
        below; add, never reorder or reflow, and keep the new block after `usageIndex` in the
        existing dependency order so the sync rule resolves it mechanically.

- [x] **Task 7 — Correct the three notes that point here (AC: 8).**
  - [x] `packages/domain/src/usageIndex.ts` head comment: replace "Story 4.19 extends THIS module
        with … the Decision E.5 rule-reference index" with what actually happened — the union landed
        here, the rule-reference index is `ruleReferenceIndex.ts`, and why (FD2).
  - [x] `deferred-work.md:2437-2440`: annotate in place with the same correction and mark it closed
        by this story.
  - [x] `deferred-work.md:2707-2712` (the rules-vs-organisms question): annotate with FD5's answer —
        the index counts rules and `referencingOrganismIds` counts organisms, so the clone case it
        describes is reported as two rules across two organisms, which is the truth on both axes.

- [x] **Task 8 — Gate (AC: 6, 7).**
  - [x] `npm run ci:dev` from the worktree root; paste the actual exit code. Never `npm run ci`
        (four-browser matrix is CI's job), never a piped invocation (`| tail` reports tail's status).
  - [x] Confirm `spec:check` passes — every `AR-*`, `FR-*`, `NFR-*`, `M*`, `Decision *`, `RFC-00*`
        and `Story N.M` token you wrote into a comment must resolve under `docs/`.
  - [x] Record every command and its real output summary in the Dev Agent Record.

### Review Findings

Reviewed on **Fable** against an **Opus** implementation (`f865752`), via three parallel adversarial
layers (Blind Hunter, Edge Case Hunter, Acceptance Auditor). 29 raw findings → 1 decision-needed,
7 patch, 0 defer, 13 dismissed (empty-string ids are schema-impossible at the boundary —
`z.string().min(1)` / `z.uuid()`; `Object.freeze` would break the existing `ReadonlyMap`-over-`Map`
idiom; the optional-and-nullable `openBattle`, the `apps/web` names in `OpenBattleUsage`'s comment
and the three-site module-split rationale are each what the story's Task 2 / FD4 / Task 7 ask for).

- [ ] [Review][Decision] **`OrganismUsageEntry.isOpenBattle` packs two facts into one boolean** —
  "this entry IS the battle open in this session" and "the live grid places this organism". The two
  diverge in exactly the AC2 erase-window case: the saved entry for the open battle comes back
  `{ battleId: 'battle-1', isOpenBattle: false }`, so a consumer that labels `isOpenBattle` entries
  from live state (RFC-005 Decision 8 — the open battle may have been renamed in-session) will label
  this one from the stale saved summary unless it also compares `battleId` to the `openBattle.id` it
  passed in. The flat shape also admits the unreachable `{ battleId: null, isOpenBattle: false }`.
  The code is exactly what FD3 / AC2 pin, so this is the owner's call, cheapest before Story 4.20
  builds on the shape. Options: **(a)** keep the shape as pinned and add a one-line rule to Story
  4.20's notes — "label an entry from live state when `isOpenBattle || battleId === openBattle.id`";
  **(b)** split the fact: `{ battleId, isOpenBattle, placedOnLiveGrid }` (or a discriminated union
  `{ battleId: string; isOpenBattle: boolean } | { battleId: null; isOpenBattle: true }`), which
  removes the impossible state at the cost of amending AC2's pinned bullets and their tests;
  **(c)** dismiss — the caller already holds `openBattle.id`, so the comparison is a one-liner and
  the flat shape stays. [`packages/domain/src/usageIndex.ts:71-74, :91-114`]
- [x] [Review][Patch] Two aliasing assertions are vacuous — they compare a `RuleReference[]` against
  a `SurvivalRule[]` and a `{ organismId, ruleId }` literal against a `SurvivalRule`, objects of
  different types that can never be `toBe`-identical, so the test named "aliases nothing in the
  input" cannot fail on aliasing. Replaced with what CAN alias: two builds over the same input return
  distinct arrays (FD10, a fresh derivation on every read). [`packages/domain/src/ruleReferenceIndex.test.ts:134-143`]
- [x] [Review][Patch] No test fans ONE rule into TWO index keys, and the `ruleTargetIds` test titled
  "in condition order" has one target per rule, so it can only observe rule order. Added a fixture
  where one rule names `['b', 'a']` and the next `['a', 'c']`: `ruleTargetIds` → `['b', 'a', 'c']`
  and the index carries the same `ruleId` under both `'a'` and `'b'`. [`packages/domain/src/ruleReferenceIndex.test.ts:41-46, :73-88`]
- [x] [Review][Patch] The `referencingOrganismIds` first-reference-order test passes a library with
  two entries sharing the id `'rival'` — an input the library cannot contain (ids key the
  repository). With valid input, first-reference order IS organism input order, so the test now
  uses one `rival` with two rules ahead of `hunter`. [`packages/domain/src/ruleReferenceIndex.test.ts:173-181`]
- [x] [Review][Patch] `SurvivalRulesSchema` is a plain `z.array` with no uniqueness refine on
  `rule.id`, so two rules of one organism can share an id and yield two indistinguishable
  `RuleReference`s. The count stays right (FD9 — M counts rules), but `ruleId` is not a stable key
  for a rendered list; documented on `RuleReference` so Story 4.20 does not key the popover on it.
  [`packages/domain/src/ruleReferenceIndex.ts:37-41`]
- [x] [Review][Patch] Redundant assertion: `toBeUndefined()` followed by `?.length ?? 0` → `0` on
  the same value — the second cannot fail once the first passes, and the second is the one the
  test's title is about. Dropped the first. [`packages/domain/src/ruleReferenceIndex.test.ts:123-128`]
- [x] [Review][Patch] Dev Agent Record attributes the per-file lcov counters to the wrong files —
  the `usageIndex.ts` and `ruleReferenceIndex.ts` rows are swapped (fresh run: `ruleReferenceIndex.ts`
  LF 24 / BRF 8 / FNF 5, `usageIndex.ts` LF 16 / BRF 10 / FNF 4). Both are 100% either way; the
  evidence line is corrected. [`docs/implementation-artifacts/4-19-usage-rule-reference-derivations.md` Debug Log]
- [x] [Review][Patch] File List says `sprint-status.yaml` moved `ready-for-dev → in-progress →
  review`; the committed diff is `backlog → review` (the story was created and implemented in one
  commit, so no intermediate state reached git). Corrected. [`docs/implementation-artifacts/4-19-usage-rule-reference-derivations.md` File List]

## Dev Notes

### Forced decisions (made here so the dev agent does not have to)

**FD1 — AC1 is already on `main`; this story's scope is the other three.** `buildUsageIndex` landed
in Story 4.17 because the FR-1.3 edit gate needed it before an edit could open (`deferred-work.md:2437`).
Do not rewrite it, do not "improve" its signature, do not move it. Its five tests and its single
`apps/web` call site (`OrganismLibrary.tsx:263`) are regression surface for this story, not work.

**FD2 — The union extends `usageIndex.ts`; the rule-reference index gets its own module.** The 4.17
note and `usageIndex.ts`'s head comment both say Story 4.19 extends "THIS module" with *both*
additions. That was written before either shape existed, and it is half right. The union is the same
derivation from a second source (Decision H.3 — "the same rule from two sources") and belongs where
`UsageIndex` is defined. The rule-reference index is the **other axis**: the specs keep "used"
(placed, Decision H) and "referenced" (rules, Decision E.5) apart in every document that names them
both, its input is organisms rather than battle summaries, and its only cross-epic consumer
(Story 5.4) imports it alone. One file holding two unrelated inputs would also put the whole of
Story 5.4's dependency behind a module named for battles. **This is a deliberate amendment of a
prior story's note, not an oversight** — Task 7 corrects the note rather than leaving the next reader
to discover the divergence.

**FD3 — The union returns entries, not a count and not a battle-id list.** Shape:
`{ battleId: string | null; isOpenBattle: boolean }[]`. Three requirements force it:
Story 4.20 needs a **count** (`entries.length`), Story 4.20's popover needs a **name per entry**, and
the open battle's name comes from live state (or is "Current Battle (unsaved)") rather than from a
saved summary — so an entry must be able to say "this one is the open battle" and to carry a `null`
id. A plain `readonly string[]` cannot represent the never-saved battle without a magic sentinel; a
`{ savedIds, openPlaces }` pair pushes the dedupe arithmetic onto every caller, which is the second
implementation this story exists to prevent. `packages/domain` resolves **no names** — it has no
access to `BattleSummary.name` for the open battle's live, possibly-renamed state.

**FD4 — The caller computes the open battle's placed set; domain never sees a grid.** `OpenBattleUsage.organismIds`
is "exactly the organisms with ≥1 cell on the live `initialGrid`" (Decision H). In `apps/web` that is
`computeEditorGridStats(grid, rosterIds).perOrganism` filtered to `count > 0`
(`apps/web/lib/battle/gridStats.ts`) — **not** `<BattlePage>`'s roster union (`buildRosterIds`), which
includes session-added-but-never-painted entries that Decision H.2 says are never usage. Write that
distinction into the interface's comment: it is the exact mistake a Story 4.20/4.24 dev will make,
and it over-reports the block. `RenderableGrid` is an `apps/web` type and `packages/*` has no `dom`
lib — a signature taking a grid cannot compile here and must not be attempted.

**FD5 — `M` counts RULES; the popover lists ORGANISMS; one structure yields both.** FR-1.7 renders
"Targeted by **[M] organism rule(s)**" while RFC-005 Decision 8 and the epic describe
`targetOrganismId → referencingOrganismId[]`. Those are two different numbers and the tension was
flagged before this story was written (`deferred-work.md:2707-2712`, from the 4.18 review). Settled:
the index value is `RuleReference[]` (`{ organismId, ruleId }`), so `index.get(target)?.length ?? 0`
is **M** (rules) and `referencingOrganismIds(index, target)` is the deduped **organism** list — one
scan, one structure, both answers, no caller re-deriving either. The epic's AC is satisfied by
`referencingOrganismIds`; the value type is a superset of what it asks for, never a substitute for it.

**FD6 — Self-references are excluded at the source, not at the consumer.** `ruleTargetIds` drops
`organism.id`, so `buildRuleReferenceIndex` can never emit a self entry (Decision E.5: deleting an
organism deletes its own rules with it, so a self-reference must never block its own delete). Doing
it at the consumer instead leaves Story 5.4's closure walking a self-edge and Story 4.21 filtering
the same id in two places. Note a self-reference is *reachable* today — a persisted one renders as
`Unknown organism` in the editor and is accepted, not repaired (Story 4.13 FD8) — so this is a real
input, not a hypothetical.

**FD7 — `ruleTargetIds` is the forward edge, and it is why Story 5.4 has a gate.** `lane-gates.yaml`
blocks Story 5.4 on this story precisely so the export closure consumes one definition of "a rule
targets X" rather than writing a second one over the same conditions. `buildRuleReferenceIndex` folds
over the same notion. Keep the function exported from the barrel even though nothing in this story's
own diff calls it — an unexported forward edge forces Story 5.4 to invert the reverse index, which is
a different (and wrong) algorithm for a forward walk.

**FD8 — A dangling target is indexed, not filtered.** Filtering "targets that exist in the library"
would need the library as a second input and would make the index silently disagree with the data;
worse, it would hide exactly the corruption Story 5.8's referential-closure assertion exists to catch
(Decision E.5(c)). An entry under a key nobody queries costs nothing. The delete block (Story 4.21)
only ever queries ids that exist.

**FD9 — Duplicate conditions inside one rule collapse; duplicate rules do not.** One rule naming X in
two of its conditions is **one** reference (the rule references X, once); two rules of one organism
naming X are **two** (M is a rule count). `conditions` has no uniqueness refine, so a hand-edited or
imported record can repeat one — the same defensive posture `buildUsageIndex` already takes for a
`BattleSummary` whose `organismIds` repeats an id.

**FD10 — No memoization inside `packages/domain`.** RFC-005 Decision 8 memoizes at the call site
(`useMemo` over `battles.list()` / `organisms.list()`), which is what `<OrganismLibrary>` already
does. A cache inside the package would be module-level state in a package whose
`"sideEffects": false` contract forbids import-time registration and whose purity is the reason the
gate is ≥90% here. Every function returns a freshly allocated structure.

**FD11 — Inputs are `Pick<…>`, outputs are `readonly`.** `Pick<Organism, 'id' | 'survivalRules'>` and
`Pick<BattleSummary, 'id' | 'organismIds'>` so a test passes minimal literals while a full entity
still assigns — the convention `buildUsageIndex` already documents, and the reason
`packages/domain` tests never need `@gol/test-utils` (which would be a package cycle: test-utils
depends on domain).

**FD12 — Nothing in `apps/web` is wired this story.** The temptation is to "just" add the footer
count or the delete guard while the module is fresh. Story 4.20 owns the footer and popover, Story
4.21 the blocks, Story 4.22 the safe delete, Story 5.4 the closure. A consumer landing here makes
this story's diff a UI story with no UX AC and takes the derivations out from under the review that
is supposed to scrutinise their semantics.

### What exists — read these before writing a line

| File | Why it matters here |
|---|---|
| `packages/domain/src/usageIndex.ts` (+ `.test.ts`) | **Modified.** `UsageIndex`, `buildUsageIndex` (unchanged — FD1), the head comment Task 7 rewrites, and the `Pick<…>`/input-order/`?.length ?? 0` conventions the new function matches. The existing tests are the regression surface. |
| `packages/domain/src/survivalRuleSchema.ts` | `ConditionSchema` = `z.discriminatedUnion('property', …)`; the `organismType` variant's `pattern` **is** the target's stable library id (Decision E) — there is no field named `targetOrganismId` anywhere. `SurvivalRuleSchema.id` is a non-empty opaque string; `conditions` is `.min(1)` with no cap and no uniqueness refine. `payload` carries **no** organism id (`{ summary, action }`) — a rule references an organism only through a condition. |
| `packages/domain/src/organismSchema.ts` | `Organism.survivalRules` (the field name is `survivalRules`, not `rules`), `id: z.string().min(1)` (plain string — `'conways-classic'` is legal, not a uuid), `OrganismSchema` for the parsed fixture in Task 4. |
| `packages/domain/src/battleSchema.ts` | `BattleSummary` = `{ id, name, gridSize, organismIds, updatedAt }` (Decision H.4). ⚠️ `BattleSummarySchema` has **no** duplicate refine while `BattleSchema.superRefine` does — the asymmetry `buildUsageIndex` de-dupes for. |
| `packages/domain/src/battleProjection.ts`, `workspaceExportProjection.ts` (+ tests) | The derivation-module conventions: file-level JSDoc with a ⚠️ hazard paragraph above the imports, `export function` declarations (never arrow consts), deeply `readonly` inputs, `Map` over `Record`, fresh outputs that never alias inputs, nothing throws, degenerate input normalised with a stated reason. `workspaceExportProjection.test.ts` carries the "cannot import `@gol/test-utils`" note and the fast-check precedent. |
| `packages/domain/src/index.ts` | The barrel: per-module blocks in dependency order, values then `export type { … }`, a 1–3 line banner per block saying why it is exported. The `usageIndex` banner (`:56-59`) is the one Task 6 extends. ⚠️ Epic 5's export block sits directly below — the two-lane collision point. |
| `packages/domain/vitest.config.ts` | `include: ['src/**/*.ts']` + `thresholds.perFile: true` at 90/90/90/90. A new file no test imports is reported at **0%** and fails the package. Never `autoUpdate`. |
| `apps/web/components/organisms/OrganismLibrary.tsx:263, :419` | The live consumer: `useMemo(() => buildUsageIndex(summaries), [summaries])` and `usage.get(organism.id)?.length ?? 0` — the memoize-at-the-call-site pattern FD10 preserves, and the read idiom `resolveOrganismUsage` replaces in Story 4.20 (not here). |
| `apps/web/lib/battle/gridStats.ts` | `computeEditorGridStats(grid, rosterIds) → { livingCells, perOrganism }` — `perOrganism` filtered to `count > 0` is the open battle's placed set (FD4). |
| `apps/web/lib/battle/rosterUnion.ts` + `components/battle/BattlePage.tsx:549` | `buildRosterIds` — the roster union including never-painted session entries. **Not** usage (Decision H.2). Named here so FD4's distinction has a file behind it. |
| `apps/web/components/organisms/editor/OrganismEditorModal.tsx:300, :378` and `editor/ConditionRow.tsx:172, :261-282` | The editor's organism dropdown already excludes self and renders an unresolvable id as `Unknown organism` — the UI side of FD6 and FD8. |
| `packages/simulation/src/session/compileEvaluators.ts:130-150`, `validateRules.ts:193-203` | The engine's own `organismType` handling (library id → numeric ref at compile time). Read for the shape only — **do not** import from or edit `@gol/simulation`; its `@gol/domain` edge is test-only by design (Story 3.2). |
| `packages/persistence/src/repositories.ts:31-46` | `OrganismRepository.delete(id)` is unconditional CRUD, with the comment stating that the FR-1.4 / M7 guard and M9 protection are `@gol/domain`'s and the caller's — i.e. the contract this story's derivations are the first half of. |
| `packages/test-utils/src/mockWorkspace.ts:118-121` + `.test.ts:82-95` | The one canonical `organismType` cross-reference in the fixtures (Chaotic Spreader → Aggressive Colonizer) and the test that pins it. Useful as a mental model; **not importable from `packages/domain`** (cycle — FD11). |
| `docs/implementation-artifacts/deferred-work.md:2437-2440, 2707-2712` | The two entries Task 7 corrects: "Story 4.19 extends THIS module", and the rules-vs-organisms question FD5 answers. |
| `docs/implementation-artifacts/lane-gates.yaml:45-49` | The approved row gating Story 5.4 on this story, and its stated reason — "5.4 must consume 4.19's module, not define it". It is why AC5 exists. |
| `docs/planning-artifacts/epics.md:1214-1225` | Story 4.19's ACs. `:1227-1238` (4.20), `:1240-1250` (4.21), `:1252-1262` (4.22), `:1357-1367` (5.4) — the four consumers whose needs shape the exported surface. |

### Architecture compliance

- **AR-15 / Decision H / Decision H.4 / RFC-005 Decision 8** — usage is *placement*; the saved side
  comes from `BattleSummary.organismIds` with no grid deserialized, the open side from the live
  `initialGrid`'s placed set, and the two union deduped by battle id (Decision H.3, M7).
- **Decision E / Decision E.5 / RFC-004 §2.4** — a rule targets an organism by its **stable library
  id** in an `organismType` condition's `pattern`, never a numeric `OrganismRef`; self-references do
  not block; the index is derived and memoized at the call site, never stored.
- **AR-39 / NFR-5.1 / RFC-008** — referential-integrity logic keeps its pure part in
  `packages/domain` under the ≥90% **per-file** gate. If you find yourself testing this logic through
  a repository or a component, it is in the wrong package.
- **AR-2 / AR-27** — no repository is imported, referenced or typed here. These functions take data.
- **No DOM types in `packages/*`** — `tsconfig.base.json` is `lib: ["ES2022"]`. A signature mentioning
  a grid, a canvas or a React type cannot compile in this package, and that is the design telling you
  where the code goes (FD4).
- **Zod parses at boundaries** — `Organism` and `BattleSummary` are already proven by the time a
  derivation sees them. No `z.` import in either module; `OrganismSchema.parse` appears only in a test
  fixture.
- **`"sideEffects": false`** — no module-level registration, no cache, no mutable module state (FD10).
- **Strict TS / `isolatedModules`** — re-export types with `export type { … }`; no `any`, no
  `@ts-ignore`, no non-null `!`. Narrow the discriminated union by `property`, never by a cast.
- **Naming** — non-component files are camelCase and never dotted: `ruleReferenceIndex.ts`.
- **Spec-id hygiene** — `spec:check` tokenises `AR-2`, `AR-15`, `AR-27`, `AR-39`, `FR-1.3`, `FR-1.4`,
  `FR-1.7`, `FR-2.6`, `NFR-5.1`, `M7`, `M9`, `RFC-004`, `RFC-005`, `RFC-006`, `RFC-008`,
  `Decision E`, `Decision H`, `Decision I`, `Story 4.17`, `Story 4.18`, `Story 4.19`, `Story 4.20`,
  `Story 4.21`, `Story 4.22`, `Story 5.4`, `Story 5.8`. Write them exactly so — a hyphenated `M-7`
  matches nothing and is silently exempt forever. `FD*` and `AC*` are not checked.

### Library / framework notes (installed versions, no research needed)

- **TypeScript 5.9.3 strict** — `ReadonlyMap<string, readonly T[]>` as the public type over a
  `Map<string, T[]>` built internally is the existing idiom (`UsageIndex`); the widening is free and
  needs no cast.
- **Zod 4.4.3** — imported by the schema modules only. `z.discriminatedUnion('property', …)` gives
  exhaustive narrowing on `condition.property`; `OrganismSchema.parse` returns freshly constructed
  nested objects, which is what makes a parsed test fixture safe to reuse across `it` blocks.
- **Vitest 4** — `environment: 'node'` here; `include` is the coverage gate and `perFile: true` is
  the threshold mode. fast-check is installed and used in this package in exactly one file
  (`workspaceExportProjection.test.ts`); a property test is welcome for the dedupe/order invariants
  but is **not** required by any AC — do not add one to raise a number.
- **No new dependency.** `packages/domain/package.json` depends on `zod` alone and stays that way.

### Testing standards

- `packages/domain` is at **100% per file** today and must stay ≥90% per file. Every branch you write
  needs a test — including the `openBattle == null` branch, the `battleId === null` branch, and the
  "already in the saved list" branch of the union.
- Every test guards a **named failure**: a union that drops a saved reference on an unsaved erase
  (AC2's ⚠️ bullet); a union that emits the open battle twice; an index that counts organisms where
  FR-1.7 counts rules (FD5); a self-reference that reaches Story 5.4's closure (FD6); a mutated or
  aliased input; a dangling target silently dropped (FD8).
- Do **not** write a test whose only purpose is to raise coverage — coverage-padding is rejected in
  review.
- Test fixtures are local literals. ⚠️ **`@gol/test-utils` is not importable from `packages/domain`**
  (it depends on domain).
- Name each `it` as a full sentence stating the invariant, with the reason in parentheses — the
  convention in `usageIndex.test.ts` and `battleProjection.test.ts`.
- `npm run ci:dev` is the dev step's gate. Report its real exit code; never pipe it.

### Previous story intelligence (Story 4.18, and 4.17 before it)

- **4.18 left this story a direct instruction and a direct question.** The instruction:
  `buildUsageIndex` is already here, so "its scope shrinks accordingly" (`deferred-work.md:2437`).
  The question: does the rule-reference index count rules or organisms
  (`deferred-work.md:2707-2712`)? FD5 answers it; Task 7 records the answer where the question lives.
- **4.18 also left a live open flag aimed at this story's design**: it re-mints rule ids on a clone
  and noted that "Story 4.19's rule-reference index should decide first" whether cloned rules should
  be recognisably the same rules. This story's `RuleReference` carries `ruleId` and makes no
  cross-organism claim about rule identity, so re-minting stays correct and nothing here reopens it —
  say so in the Dev Agent Record rather than leaving the flag looking unanswered.
- **The recurring 4.16/4.17/4.18 lesson: comments go stale one patch later.** Three files already
  point at this story with text that this story makes wrong. Task 7 is not housekeeping — it is the
  same failure those reviews kept finding, caught before it ships.
- Paste actual exit codes; `npm run ci:dev`, never `npm run ci`.

### Git intelligence

`main` is at `30aaff9` (merge of #73, the live-region/inert project-context rule; #72 was Story
4.18). The last `packages/domain/src` commits are Story 5.3's (`workspaceExportSchema.*`,
`workspaceExportProjection.*`, the barrel) and Story 4.17's (`usageIndex.*`). **Two epics are in
progress.** Epic 5 has 5.1/5.2/5.3 merged and **5.4 next — gated on this story** — and 5.4 will edit
`packages/domain` and the barrel. This story's files: `packages/domain/src/usageIndex.{ts,test.ts}`,
`packages/domain/src/ruleReferenceIndex.{ts,test.ts}`, `packages/domain/src/index.ts`,
`docs/implementation-artifacts/deferred-work.md`, `docs/implementation-artifacts/sprint-status.yaml`.
**`packages/domain/src/index.ts` is the one file both lanes touch** — the barrel collides on every
two-lane sync and `implement-next-story.toml`'s sync rule resolves it, provided this story *appends*
a block in dependency order rather than reordering or reflowing the file.

### Project Structure Notes

- New: `packages/domain/src/ruleReferenceIndex.ts` (+ `.test.ts`).
- Modified: `packages/domain/src/usageIndex.ts` (+ `.test.ts`), `packages/domain/src/index.ts`,
  `docs/implementation-artifacts/deferred-work.md`, `docs/implementation-artifacts/sprint-status.yaml`.
- Naming: `resolveOrganismUsage`, `OpenBattleUsage`, `OrganismUsageEntry`; `ruleTargetIds`,
  `RuleReference`, `RuleReferenceIndex`, `buildRuleReferenceIndex`, `referencingOrganismIds`.
- Untouched on purpose: every file under `apps/web`, `packages/simulation`, `packages/persistence`
  and `packages/test-utils`; `buildUsageIndex`'s body and signature; `survivalRuleSchema.ts`,
  `organismSchema.ts`, `battleSchema.ts`, `battleProjection.ts`, `workspaceExportProjection.ts`;
  `packages/domain/package.json`; `packages/domain/vitest.config.ts`; `lane-gates.yaml`;
  `docs/project-context.md`.

### What NOT to build

- ❌ No transitive closure, visited set or cycle guard — Story 5.4, and its own tests say so.
- ❌ No UI: no footer, no popover, no count label, no delete guard, no dialog copy
  (Stories 4.20/4.21/4.22).
- ❌ No `apps/web` file modified, including `<OrganismLibrary>`'s existing `buildUsageIndex` call.
- ❌ No repository method (`organisms.referencedBy()`, `battles.usageOf()`) — the persistence layer
  deliberately keeps integrity logic out (`repositories.ts:31-46`).
- ❌ No name resolution in `packages/domain` — no battle names, no organism names, no display order.
- ❌ No memo, cache, singleton or module-level state (FD10); no `zod` import in either module.
- ❌ No stored index, no new persisted field, no schema change, no `formatVersion` bump.
- ❌ No grid, `RenderableGrid`, canvas or DOM type in a signature (FD4).
- ❌ No `@gol/test-utils` import from `packages/domain` (package cycle).
- ❌ No edit to `packages/simulation` — its `organismType` handling is the engine's, compiled to
  numeric refs, and its `@gol/domain` edge is test-only.
- ❌ No `M9` Conway's-Classic special case here — the protected default is Story 4.22's, applied by
  the caller, and an organism nothing references is still undeletable if it is the default.

### Open flags for the owner (not blockers — the story proceeds on the FD)

- **The rule-reference index counts RULES and its helper counts ORGANISMS (FD5).** FR-1.7's copy says
  "[M] organism rule(s)" while the epic's index signature is organism-keyed; both are served from one
  structure rather than one being chosen over the other. If the footer should instead read
  "Targeted by [M] organism(s)", Story 4.20 changes one call, not this module.
- **The rule-reference index lives in its own module, not in `usageIndex.ts` (FD2)** — a deliberate
  amendment of Story 4.18's deferred-work note, corrected in place by Task 7 rather than left as a
  silent divergence.
- **The union's open-battle entry can carry `battleId: null` (FD3).** That is how a never-saved
  battle is representable at all without a sentinel id; the "Current Battle (unsaved)" label is the
  caller's, per RFC-005 Decision 8.
- **A dangling rule target is indexed rather than filtered (FD8).** If the owner would rather the
  index be library-closed, it needs the organism list as a second input and a decision about what a
  dangling id *means* — which Story 5.8's import assertion currently owns.
- **`ruleTargetIds` is exported with no caller in this story's diff (FD7)** — it exists for Story
  5.4's gated closure. If the owner prefers a surface with zero unused exports, the alternative is
  Story 5.4 adding it, which is precisely what `lane-gates.yaml` says it must not do.

### References

- `docs/planning-artifacts/epics.md:1214-1225` (Story 4.19 ACs), `:1227-1238` (4.20), `:1240-1250`
  (4.21), `:1252-1262` (4.22), `:1357-1367` (5.4), `:249-256` (FR-1.x traceability).
- `docs/planning-artifacts/architecture.md:234` (Decision E.5 — rule references are first-class),
  `:263-274` (Decision H, H.1–H.4), `:353` (M7), `:381` (FR-1 ownership map).
- `docs/planning-artifacts/rfcs/RFC-005-application-state-modes-undo.md:303-320` (Decision 8 — the
  usage index, the FR-1.4 block, the rule-reference index, FR-1.7's read-only list and the union /
  dedupe rule); `RFC-004-simulation-rules-engine.md` §2.4, §3.5 (rule identity; library id → ref at
  simulation start); `RFC-006-persistence-workspace-schema.md` Decisions 4–5 (the transitive
  closure and the import assertion — Story 5.4 / Story 5.8, not this story);
  `RFC-008-testing-and-tooling-strategy.md` Decision 3 (the ≥90% core scope).
- `docs/planning-artifacts/prds/prd-GameOfLife-2026-05-26/prd.md` FR-1.3 / FR-1.4 / FR-1.7.
- `docs/implementation-artifacts/4-18-clone-organism.md` (FD1–FD12 and the Review Findings that
  produced the two deferred entries above); `4-17-edit-organism-from-library.md` (why
  `buildUsageIndex` landed early).
- `docs/implementation-artifacts/deferred-work.md:2437-2440, 2707-2712`;
  `docs/implementation-artifacts/lane-gates.yaml:45-49`.
- `docs/project-context.md` — Language rules (strict TS, no DOM types in `packages/*`,
  `isolatedModules`, Zod at boundaries), Testing rules (the ≥90% per-file core gate, `include` is the
  gate, no coverage padding, fixtures from `@gol/test-utils` — and why this package cannot),
  Code Quality (comments explain why; cite the governing spec id; `spec:check`; camelCase file
  names), Critical rules (never persist a numeric `OrganismRef`; `organismIds` ≡ the placed set),
  Workflow (`npm run ci:dev`, never piped; the commit gate).

## Dev Agent Record

### Agent Model Used

Claude Opus 5 (1M context) — `claude-opus-5[1m]`, via `bmad-dev-story` in the epic-4 lane worktree.

### Debug Log References

Every command run from the worktree root unless noted, none piped:

| Command | Result |
|---|---|
| `npx vitest run src/usageIndex.test.ts` (in `packages/domain`, RED) | 9 failed / 5 passed of 14 — `TypeError: resolveOrganismUsage is not a function`, the five existing `buildUsageIndex` tests still green |
| `npx vitest run src/usageIndex.test.ts` (GREEN) | 14 passed (1 file) |
| `npx vitest run src/ruleReferenceIndex.test.ts` (RED) | 1 file failed, "no tests" — module did not exist |
| `npx vitest run --coverage` (in `packages/domain`) | exit **0**; 10 files / **179 tests passed**; 100% statements (182/182), branches (63/63), functions (37/37), lines (163/163) |
| per-file check via `coverage/lcov.info` | `ruleReferenceIndex.ts` LF/LH 24/24, BRF/BRH 8/8, FNF/FNH 5/5 · `usageIndex.ts` 16/16, 10/10, 4/4 — both 100% on all four, which `perFile: true` requires (the two rows were swapped in the original record; corrected in review against a fresh run) |
| `npx prettier --write` on the seven touched files | reformatted `usageIndex.test.ts` (import block) and `ruleReferenceIndex.ts`; the rest already clean |
| `npm run ci:dev` (worktree root, redirected to a file, **not piped**) | **`CI_DEV_EXIT=0`** — green |

`npm run ci:dev` stage detail: typecheck 5/5 · lint 0 errors (1 pre-existing
`react-hooks/exhaustive-deps` **warning** in `apps/web/components/gallery/BattleGallery.tsx:248`,
untouched by this story) · format:check clean · **spec:check ✓ — all 273 cited ids resolve** ·
boundary:check ✓ (7 escape shapes rejected, 2 legitimate imports accepted) · test:coverage 5/5
packages, `@gol/domain` 179 tests, per-file table showing `usageIndex.ts` and `…erenceIndex.ts`
both at 100/100/100/100 · build:standalone ✓ · bundle:check ✓ all five routes within budget
(`/organisms` 7.6 KB headroom — unchanged, this story ships no `apps/web` code) · bench ✓
**within budget, 9.262 ms headroom (55.6% of the frame)** against the 16.667 ms NFR-1.1 budget ·
e2e (Chromium only, never the four-browser `npm run ci`) **255 passed, 1 skipped** in 1.8m.

The lint warning is pre-existing on `main` and in a file this story does not touch; `npm run lint`
reports **0 errors**, which is what the gate enforces.

### Completion Notes List

- **AC1 — `buildUsageIndex` untouched.** `git diff -U1 packages/domain/src/usageIndex.ts` removes
  exactly three lines, all of them head comment; the function's body and signature are byte-identical
  and its five tests pass unchanged. No `apps/web` file is modified (`git status` over `apps/web`,
  `packages/simulation`, `packages/persistence`, `packages/test-utils` is empty) — FD12 held.
- **AC2 — the union adds usage and never removes it.** `resolveOrganismUsage` maps the saved index
  first, then flips the matching saved entry in place or appends one; the open battle is consulted
  only to ADD. The Decision H.3 erase window is pinned by its own test ("keeps the saved entry for
  the open battle after its cells are erased but not yet saved") and the hazard is written into the
  function's JSDoc, not just the story. A never-saved open battle (`id: null`) needs no branch of its
  own: no saved entry can carry a `null` battleId, so `findIndex` misses and the entry appends —
  one fewer branch than the story's sketch, and no sentinel id.
- **AC3/AC5 — one scan, one definition of "a rule targets X".** A module-private `ruleTargets(rule,
  selfId)` does the `organismType` narrowing, the within-rule dedupe (FD9) and the self-exclusion
  (FD6) exactly once; `ruleTargetIds` folds it across an organism's rules with a second `Set`, and
  `buildRuleReferenceIndex` folds the same helper per rule so two rules of one organism stay two
  references. That is the FD7 "single definition" the Story 5.4 gate asks for — had
  `buildRuleReferenceIndex` called the public `ruleTargetIds` instead, the organism-level dedupe
  would have silently collapsed M from 2 to 1.
- **AC4 — `referencingOrganismIds` returns `[]`, never `undefined`**, and de-dupes by first
  reference; its test asserts `index.get('prey')?.length === 3` alongside `['hunter']` so the
  rules-vs-organisms distinction (FD5) is pinned in one place.
- **AC6 — both files at 100% on all four metrics**, no `zod` import in either, no DOM type, no
  repository, no memo or module-level state, no new dependency in `packages/domain/package.json`.
  `ruleReferenceIndex.test.ts` imports no `@gol/test-utils` (the package cycle, FD11) and builds one
  fixture through `OrganismSchema.parse`.
- **AC8 / the 4.18 open flag.** All three notes corrected in place rather than deleted:
  `usageIndex.ts`'s head comment now states that the union landed there and the rule-reference index
  did not, and why; `deferred-work.md:2437` is marked closed with the same correction;
  `deferred-work.md:2707` is answered with FD5. On 4.18's clone question specifically — **re-minting
  rule ids on a clone stays correct and nothing here reopens it.** `RuleReference.ruleId` identifies
  a rule within its own organism and makes no cross-organism claim about rule identity, so a clone
  reads as a second organism contributing a second rule, which is the truth on both axes. That is
  recorded at the deferred entry as well as here.
- **No new spec conflict surfaced.** FD2's divergence from the 4.18 note was already declared by the
  story and is now recorded at both sites; nothing else in `docs/project-context.md` or the RFCs
  disagreed with what was written.
- **Deliberately not built** (FD12, "What NOT to build"): no closure/visited set/cycle guard (Story
  5.4), no footer, popover, count label or delete guard (Stories 4.20–4.22), no repository method,
  no name resolution, no property test added merely to raise a number.

### File List

- `packages/domain/src/ruleReferenceIndex.ts` — **new.** `ruleTargetIds`, `RuleReference`,
  `RuleReferenceIndex`, `buildRuleReferenceIndex`, `referencingOrganismIds`, plus the private
  `ruleTargets` helper both public functions fold over.
- `packages/domain/src/ruleReferenceIndex.test.ts` — **new.** 20 tests across the three `describe`s
  (19 at implementation; review added the one-rule-two-keys test and tightened three fixtures);
  local literal fixtures, one `OrganismSchema.parse` fixture, no `@gol/test-utils`.
- `packages/domain/src/usageIndex.ts` — **modified.** Head comment corrected (Task 7);
  `OpenBattleUsage`, `OrganismUsageEntry`, `resolveOrganismUsage` appended. `buildUsageIndex`
  unchanged.
- `packages/domain/src/usageIndex.test.ts` — **modified.** Nine `resolveOrganismUsage` tests added
  beside the five existing ones, which are unchanged.
- `packages/domain/src/index.ts` — **modified.** The `usageIndex` block's banner corrected and
  extended with `resolveOrganismUsage` + both new types; a new `ruleReferenceIndex` block appended
  directly after it, in dependency order. Nothing reordered or reflowed (the two-lane collision
  point).
- `docs/implementation-artifacts/deferred-work.md` — **modified.** Two entries annotated in place
  (`:2437`, `:2707`).
- `docs/implementation-artifacts/sprint-status.yaml` — **modified.** `4-19-…: backlog → review` in
  the implementation commit (the story was created and implemented in one commit, so no intermediate
  `ready-for-dev` / `in-progress` state reached git); `review → in-progress` in the review commit,
  which left one `[Review][Decision]` open for the owner.
- `docs/implementation-artifacts/4-19-usage-rule-reference-derivations.md` — **modified.** Tasks
  checked, this record, Change Log, Status.

## Change Log

- 2026-09-23 — Story 4.19 implemented. Added the M7 open-battle union (`resolveOrganismUsage`) to
  `usageIndex.ts` and the Decision E.5 rule-reference index as its own module
  (`ruleReferenceIndex.ts`, a declared amendment of Story 4.18's note — FD2). Barrel extended;
  the three stale notes pointing at this story corrected in place. No `apps/web` change.
  Status → review.
- 2026-09-23 — Code review (Fable, three adversarial layers). Seven patches applied: the aliasing
  test now asserts something that can fail, one rule fanning into two keys is tested, the
  `referencingOrganismIds` fixture is a valid library, `RuleReference.ruleId`'s non-uniqueness is
  documented, one redundant assertion dropped, two Dev Agent Record bookkeeping errors corrected.
  One `[Review][Decision]` left for the owner (the `isOpenBattle` shape in the erase-window case).
  Status → in-progress.

Dev Model: opus   # this story fixes the module surface that Stories 4.20, 4.21, 4.22 and the gated 5.4 all build on, and settles the rules-vs-organisms semantic the 4.18 review left open — it picks the pattern rather than following one.

Proposed lane gate: none — the governing row already exists and needs no change: `- story: 5-4-rule-aware-organism-closure / requires: 4-19-usage-rule-reference-derivations` (`lane-gates.yaml:45-49`, approved by Sidiar 2026-09-21). This story adds no dependency in the other direction; its only shared surface with Epic 5 is `packages/domain/src/index.ts`, which the sync rule already resolves.
