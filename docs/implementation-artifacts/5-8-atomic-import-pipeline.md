---
baseline_commit: 388dd205a8d3cd05fc50ddf004bce51d05b444e6
---

# Story 5.8: Atomic Import Pipeline

Status: in-progress

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a developer,
I want import to be all-or-nothing,
so that a bad file can never destroy a user's workspace.

## Acceptance Criteria

Source: `epics.md#Story 5.8: Atomic Import Pipeline` (`docs/planning-artifacts/epics.md:1408-1419`),
governed by AR-10 / AR-12 / AR-13 / AR-44 (`epics.md:169-172`, `:218`), architecture **Decision F**
(`architecture.md:238-248`), **M8** / **M9**, and RFC-006 **Decision 5** (import), **Decision 3**
(migration), **Decision 6** (settings) and **Decision 7** (post-import seeding). The ACs are split
here so a reviewer can check each one on its own.

1. **The pipeline, in this order and no other (AR-10 / RFC-006 Decision 5).** `importWorkspace(fileText)`
   runs these steps in order:
   1. `JSON.parse`;
   2. `migrate(parsed, 'envelope')` (Story 5.7's `@gol/domain` `migrate`);
   3. `WorkspaceExportSchema.safeParse`, the full schema with every `superRefine`;
   4. a referential-closure assertion (AC3);
   5. snapshot the current workspace;
   6. `clearAll()`, then `organisms.replaceAll`, then `battles.replaceAll`, then `ensureDefaultOrganism`;
   7. on any failure in step 6, restore from the snapshot.

   Steps 1–4 write nothing. No storage call of any kind happens before step 5.
2. **Typed failures.** Every rejection is an `ImportError` (a class in `@gol/persistence`, the
   same pattern as `ExportError`). Its `code` is one of:
   - `'not-json'`: `JSON.parse` threw;
   - `'newer-version'`: `migrate` threw `FormatMigrationError` code `'newer-version'`. The error
     carries `foundVersion` and `supportedVersion`;
   - `'corrupt'`: any other migration failure (missing, invalid or non-integer `formatVersion`, a
     non-object document), or a schema failure. The Zod issues are carried for diagnostics;
   - `'dangling-reference'`: the closure assertion failed. The error carries the dangling ids;
   - `'write-failed'`: a write in step 6 threw and the rollback **succeeded**. The workspace is
     identical to its pre-import state. `cause` is the write's error, so a `QuotaExceededError`
     stays identifiable;
   - `'rollback-failed'`: a write threw **and** the restore threw too. The workspace is **not**
     guaranteed unchanged. Both errors are carried.

   Story 5.9 words these codes. This story only guarantees that each one is distinct and true.
3. **Closure assertion (RFC-006 Decision 5 / Decision E.5).** Two kinds of id must be in the
   envelope's own `organisms[]`:
   - every `cells[].organismId` in every battle;
   - every rule target of **every** organism in the file, not only those that battles place.

   "Rule target" means Story 4.19's `ruleTargetIds`, with no second derivation (the Story 5.4
   precedent). A self-reference is not a dangling reference. Conway's Classic gets no special
   treatment: a file whose rule targets `conways-classic` without carrying it is dangling, even
   though step 6 would re-add Conway's Classic.
4. **Battle-kind files use the same destructive semantics (FR-8.4 / M8).** A `kind: 'battle'`
   envelope replaces the whole workspace with its one battle and its organisms. The code path is
   the same, and nothing branches on `kind`.
5. **Post-import invariants (FR-1.5 / AR-13 / AR-12).**
   - After any successful import, Conway's Classic exists (`ensureDefaultOrganism`, which runs
     inside the rollback-guarded region).
   - An imported `conways-classic` record, possibly edited, is kept as imported and is not
     overwritten.
   - `gol:settings` is byte-identical after success, after `write-failed`, and after every
     pre-write rejection. This holds **by construction**: nothing in the import path references
     the settings repository, the snapshot never contains settings, and `clearAll()` is data-only
     (Decision F.2).
6. **Integration tests (AR-44)** run against the **real** localStorage repositories under jsdom.
   Each of the following leaves `gol:battles`, `gol:organisms`, `gol:schema` and `gol:settings`
   byte-identical to the pre-import state:
   - corrupt JSON;
   - schema-invalid data;
   - a newer `formatVersion`;
   - a closure violation;
   - a mid-replace failure (a quota stub on the battles write, after the organisms write
     succeeded).

   The success path is covered for both `kind`s: the file's contents are listed, Conway's Classic
   is present, and settings are untouched.
7. **Nothing else moves.** `WorkspaceExportSchema`, `migrate`, the `AppRepositories` interface and
   `@gol/test-utils`' fakes are unchanged (FD2). No UI ships: Story 5.9 owns the picker, the
   warning and the copy. `npm run ci:dev` is green.

## Tasks / Subtasks

- [x] **Task 1: `findDanglingReferences` in `@gol/domain`** (AC: 3)
  - [x] 1.1 Add a new file, `packages/domain/src/referentialClosure.ts` (camelCase, never dotted).
    It exports `findDanglingReferences(envelope: Pick<WorkspaceExport, 'battles' | 'organisms'>)`.
    The function returns a readonly list of `{ kind: 'cell' | 'rule-target', id, referencedBy }`
    entries:
    - `referencedBy` is the battle id for a cell, or the organism id for a rule target;
    - each `(kind, id, referencedBy)` appears at most once;
    - the list is empty when the closure holds.

    Build the id set once, then walk the cells and `ruleTargetIds(organism)` for every organism.
    The function is pure and throws nothing (FD4).
  - [x] 1.2 Write a header WHY comment in the style of `organismClosure.ts`:
    - the edge is `ruleTargetIds` and nothing else;
    - the walk is not transitive, because every organism is checked directly, which makes
      transitivity implied;
    - Conway's Classic gets no exemption (AC3).
  - [x] 1.3 Add `referentialClosure.test.ts`, under the ≥90% per-file gate. It covers:
    - a valid envelope returns `[]`;
    - a cell id missing from `organisms[]`;
    - a rule target missing from `organisms[]`, on an organism that **no battle places**;
    - a self-reference is not reported;
    - a chain (A→B, B→C with C absent) reports exactly C;
    - the same missing id referenced twice by one battle's cells is reported once;
    - a real `toEnvelope` output from a battle and its `organismClosure` returns `[]`. This test
      pins export and import as inverses.
  - [x] 1.4 Barrel: append **one contiguous block at the end** of `packages/domain/src/index.ts`,
    so the two-lane sync's `[[sync.rules]]` resolves the barrel mechanically. Give it a WHY comment
    in the barrel's style.

- [x] **Task 2: `ImportError` in `@gol/persistence`** (AC: 2)
  - [x] 2.1 In `packages/persistence/src/errors.ts`, add `class ImportError extends Error`:
    - `name: 'ImportError'`;
    - `readonly code: ImportErrorCode`, the six codes from AC2;
    - optional typed detail fields: `foundVersion` / `supportedVersion` for `'newer-version'`,
      `issues` for `'corrupt'` from a schema failure, `dangling` for `'dangling-reference'`,
      `rollbackError` for `'rollback-failed'`;
    - `options.cause`.

    Messages are plain English and developer-facing, and they carry no story IDs. The UI copy is
    Story 5.9's. The WHY comment explains why `'write-failed'` and `'rollback-failed'` must stay
    distinct: 5.9's "your workspace is unchanged" is true only for the first.
  - [x] 2.2 Export `ImportError` and `type ImportErrorCode` from the persistence barrel, with a WHY
    comment beside `ExportError`'s.

- [x] **Task 3: the pipeline** (AC: 1, 2, 4, 5)
  - [x] 3.1 Add a new file, `packages/persistence/src/workspaceImport.ts`. It holds two things:
    - **`validateImportFile(fileText: string): WorkspaceExport`**, the pure half (steps 1–4). It
      throws `ImportError` and touches no storage. It also rejects an organism id of `__proto__`
      as `'corrupt'`, by calling `assertSafeCollectionId` inside a try/catch (FD6), so
      `replaceAll`'s own guard can never fire after `clearAll()`. It is exported from the barrel
      so Story 5.9 can validate at file-pick time, before its warning, if it chooses to.
    - **`applyImport(repos: AppRepositories, envelope: WorkspaceExport): Promise<ImportSummary>`**,
      the writing half (steps 5–7). It returns `{ kind, battleCount, organismCount }` for 5.9's
      confirmation. `organismCount` is the count **after** `ensureDefaultOrganism`, which means
      it includes a Conway's Classic that the import added.
  - [x] 3.2 Map migration errors with `isFormatMigrationError`:
    - `'newer-version'` becomes `ImportError('newer-version')`, carrying the versions, with a
      `typeof foundVersion === 'number'` check rather than a cast (the 5.7 review patch);
    - every other code becomes `'corrupt'`;
    - an error that is not a `FormatMigrationError` (a step's programming error) passes through
      unwrapped, as it does at rest.
  - [x] 3.3 **Snapshot and rollback use the repository interfaces (FD2).** Implement them as
    follows:
    - The snapshot is `{ battles: await repos.battles.listFull(), organisms: await repos.organisms.list(), wasFresh: await repos.isFreshWorkspace() }`.
    - A snapshot read that throws (a whole collection that is corrupt, or
      `NewerFormatVersionError`) propagates **unchanged** before anything is written. The fault is
      in the store, not the file, and 5.11 owns that fault.
    - The write region is `clearAll()`, then `organisms.replaceAll(envelope.organisms)`, then
      `battles.replaceAll(fromEnvelope(envelope).battles)`, then
      `ensureDefaultOrganism(repos.organisms)`.
    - Organisms are written before battles, and `clearAll()` runs first. Put the WHY in a comment:
      the peak store size is then never old battles plus new organisms plus new battles.
    - On a throw in the write region, restore:
      1. call `clearAll()`;
      2. call `organisms.replaceAll(snapshot.organisms)`;
      3. call `battles.replaceAll(snapshot.battles)`;
      4. if `snapshot.wasFresh`, call `ensureDefaultOrganism` (FD3);
      5. throw `ImportError('write-failed', { cause })`.

      If the restore itself throws, throw `ImportError('rollback-failed')` carrying both errors.
      Never swallow either error.
  - [x] 3.4 On `WorkspaceSerializer`, add `importWorkspace(fileText: string): Promise<ImportSummary>`.
    It is `applyImport(repos, validateImportFile(fileText))`, and the pure half runs before any
    `await` that touches `repos`. Update the factory JSDoc, which currently says "`parse` /
    `importWorkspace` are still absent, and are Story 5.8's". Also update the interface JSDoc,
    which should name the pipeline and point at `workspaceImport.ts`.
  - [x] 3.5 Barrel: export `validateImportFile` and the type `ImportSummary`. Keep `applyImport`
    internal unless a test needs it through the barrel (it should not).

- [x] **Task 4: tests** (AC: 1–6)
  - [x] 4.1 New file `packages/persistence/src/workspaceImport.test.ts` (jsdom). Use real
    `createLocalStorageRepositories()` and seed a pre-import workspace through the repositories:
    - Conway's Classic;
    - one custom organism;
    - one battle;
    - a `gol:settings` record written through `settings.save`.

    Capture the four raw `getItem` strings. For each failure case in AC6, assert both of these:
    - the `ImportError.code`;
    - all four strings are byte-identical afterwards.

    A `setItem` spy alone misses a `removeItem`, so compare the strings (the Story 5.7 testing
    rule).
  - [x] 4.2 Build the failure cases like this:
    - **not-json**: `'{'`.
    - **corrupt**, one case each:
      - a missing `formatVersion`;
      - `formatVersion: '1'`;
      - a schema failure, such as a cell outside `gridDimensions`, a duplicate organism id, or
        `kind: 'battle'` with two battles. This proves that the superRefines run;
      - an organism id of `__proto__`.
    - **newer-version**: `formatVersion: CURRENT_FORMAT_VERSION + 1`. Spy on the schema, which is
      never consulted.
    - **dangling-reference**: a cell id that is absent from the file, and a rule target that is
      absent from the file.
    - **mid-replace failure**: stub `Storage.prototype.setItem` so that only the `gol:battles`
      write after the `gol:organisms` write fails. It throws a `DOMException` named
      `QuotaExceededError`. Assert `'write-failed'`, `cause instanceof QuotaExceededError`, and
      four byte-identical keys. The stub must fail **only the first** battles write, or the
      restore's own battles write fails too. That was Story 5.7's red test.
    - **rollback-failed**: stub so that both the import's battles write and the restore's battles
      write fail. Assert the code and that both errors are carried. Do not assert that the
      workspace is identical, because that guarantee is exactly what this code disclaims.
  - [x] 4.3 Success cases:
    - A workspace-kind file built from another seeded store via
      `createWorkspaceSerializer(...).exportWorkspace()` and JSON round-tripped. After the import:
      - `listFull()` / `list()` equal the source at the `Battle` / `Organism` level (not wire
        level, per the `WorkspaceExportWire` note);
      - Conway's Classic is present;
      - `gol:settings` is byte-identical;
      - `ImportSummary` is correct.
    - A battle-kind file from `exportBattle(id)` whose closure **lacks** Conway's Classic. It
      replaces the whole workspace: the old battles are gone, and Conway's Classic is re-added.
    - A file that carries an **edited** `conways-classic`. The imported record is kept, and
      `ensureDefaultOrganism` does not revert it.
    - A snapshot read that throws. Pre-seed a newer `gol:schema` stamp: the import rejects with
      `NewerFormatVersionError` (not `ImportError`), and nothing is written.
  - [x] 4.4 Serializer-level: in `workspaceSerializer.test.ts`, add one test with the
    `@gol/test-utils` fakes. It proves that `importWorkspace` is mode-agnostic (it runs over the
    interface, with no localStorage). For the call-order assertion (no repository method is called
    before validation completes), wrap the fake's methods in `vi.fn` pass-throughs rather than
    editing the fake.

- [x] **Task 5: records** (AC: 7)
  - [x] 5.1 In `deferred-work.md`, add a "Deferred from: Story 5-8" section that records FD1–FD7.
    The RFC-006 variances are:
    - `ImportError`'s six codes versus the RFC's three;
    - `validateImportFile` / `applyImport` split out of the serializer;
    - `findDanglingReferences` returns a list and is not named `assertReferentialClosure`.

    **Strike** the entries this story discharges, and **annotate**, without striking, the entries
    it only touches. Never delete an entry:
    - `:33` (`replaceAll` drops duplicate ids): discharged, because `WorkspaceExportSchema`'s
      duplicate-id `superRefine` runs before `replaceAll` on the only bulk path. Strike it.
    - `:55` (`seedDevFixtures` partial failure): annotate. The import's snapshot/rollback lives
      over `AppRepositories` in `workspaceImport.ts` and could be reused there. It is not taken
      here.
    - `:107` (`battles.load()` full-collection parse): annotate. Import reads and writes in bulk
      only (`listFull` / `replaceAll`), so no per-id path was needed. The entry stays open.
    - `:235` (a readonly `Battle`): annotate. Import does not write through a `Battle`, because
      `fromBattleExport` allocates fresh arrays. The prediction did not hold, so re-defer.
  - [x] 5.2 Run `npm run ci:dev` redirected to a file, then `echo $?`. Never pipe it. The
    `/settings` and battle routes import `createWorkspaceSerializer`, so they grow. If a route
    grows, refresh the baseline in the same change with
    `npm run build:standalone && npm run bundle:baseline`. Never hand-edit
    `scripts/bundle-baselines.json`.
  - [x] 5.3 Fill in the Dev Agent Record, including every forced decision you deviated from.

### Review Findings

Code review 2026-09-25 (Fable 5, full mode; layers: Blind Hunter, Edge Case Hunter, Acceptance
Auditor — Auditor verdict: every AC/FD compliant). Buckets below; dismissed noise dropped at
triage (2 items: a battle-id `__proto__` gap that `BattleExportSchema`'s `z.uuid()` forbids, and
the Task 5.1 "RFC's three" vs deferred-work's "RFC's four" baseline count, where the lasting
record in `deferred-work.md` is the internally consistent one).

- [ ] [Review][Decision] **Rollback materializes an absent `gol:battles` key, so `'write-failed'`'s
  "byte-identical" guarantee is false for the store shape every user has before saving their first
  battle** — `restore()` (`packages/persistence/src/workspaceImport.ts:197-201`) runs
  `battles.replaceAll(snapshot.battles)`; `seedDefaultWorkspace` deliberately never writes
  `gol:battles`, so a first-load workspace has that key **absent**. A failed import over it rolls
  back to `gol:battles = "{}"` where `getItem` was previously `null` — semantically identical
  (every reader treats `null` and `"{}"` the same; no data loss), but not byte-identical, and
  `storageUsage()` changes. The AC6 fixtures never cover this shape. This is a third concrete limit
  of **FD2**'s repository-level snapshot, beside its recorded (a)/(b) — one owner ruling covers all
  of them. Options:
  - (a) Accept as a documented FD2 limit: add it as limit (c) to the FD2 entry in
    `deferred-work.md`, optionally with a test pinning the semantic equivalence. Zero code change;
    the `'write-failed'` guarantee reads "equivalent", not "byte-identical", for this shape (as FD3
    already does for the fresh case).
  - (b) Adopt FD2's lossless alternative: an opaque `snapshotWorkspace()` / `restoreWorkspace()`
    pair on `AppRepositories` capturing the raw `gol:battles` / `gol:organisms` / `gol:schema`
    strings (absent stays absent). Closes this, FD2 (a), FD2 (b) and FD3 in one move; costs an
    interface change every mode and `@gol/test-utils`' fakes must mirror. Cheapest before Story
    5.9 wires the import.
- [x] [Review][Patch] **Serializer ordering test cannot fail for the regression it guards**
  [`packages/persistence/src/workspaceSerializer.test.ts`] — `calls.indexOf('clearAll')` is `-1`
  when the call is absent and `-1 < anyIndex` passes, so dropping `clearAll()` entirely (or
  reordering around an absent entry) passes vacuously; the test also never asserts
  `ensureDefaultOrganism`'s position after `battles.replaceAll`. Fixed: assert the full ordered
  write-region subsequence with presence guaranteed.
- [x] [Review][Patch] **`ImportErrorCode` JSDoc overstates `'write-failed'`**
  [`packages/persistence/src/errors.ts`] — "the workspace is exactly as it was" is false in the
  FD3 fresh-workspace rollback (the store comes back stamped, with Conway's Classic ensured —
  "equivalent after its first load", per the story's own FD3). A 5.9 developer reading only
  `errors.ts` would ship copy that is false in that case. Fixed: the caveat now rides in the JSDoc.
- [x] [Review][Patch] **Cross-rule dedup of `dangling` is promised but unpinned**
  [`packages/domain/src/referentialClosure.test.ts`] — the "each `(kind, id, referencedBy)` at most
  once" contract leans on `ruleTargetIds`' per-organism `Set` (verified: it does de-duplicate
  across rules), but no test had two rules on one organism naming the same missing target. Fixed:
  test added, pinning one report.
- [x] [Review][Patch] **`deferred-work.md:33` discharged on a half-tested claim**
  [`packages/persistence/src/workspaceImport.test.ts`] — the discharge cites the duplicate-id
  `superRefine` for "battles and organisms", but the corrupt matrix exercised only a duplicate
  organism id. Fixed: duplicate battle id case added (rejected `'corrupt'`, store untouched).
- [x] [Review][Defer] **Concurrent-writer race in the snapshot→restore window**
  [`packages/persistence/src/workspaceImport.ts:157-176`] — deferred, pre-existing. A write landing
  between the snapshot reads and a step-6 failure (second tab, or a same-tab save racing the
  import) is silently reverted by the whole-collection restore, under an error whose message says
  the workspace was restored. Read-modify-write without cross-tab isolation is the codebase's
  existing norm for every `save()`; this window is merely the widest. No UI caller exists until
  Story 5.9 — its wiring should decide (e.g. block saves while an import is in flight). Recorded in
  `deferred-work.md`.

## Dev Notes

### Forced decisions (made here so the dev agent does not have to)

- **FD1: the pure half and the writing half are separate functions, and the serializer
  composes them.** `validateImportFile` (steps 1–4) is pure and storage-free, and it is what Story
  5.9 needs if it validates at file-pick time. `applyImport` (steps 5–7) is the only part that
  holds `AppRepositories`. `WorkspaceSerializer.importWorkspace(fileText)` keeps RFC-006
  Decision 5's name and signature. The pipeline lives in its own file so that
  `workspaceSerializer.ts` stays the thin export factory it is today.
- **FD2: ⚠️ the snapshot reads through the repository interfaces (`listFull()` + `list()`), and
  the restore writes through them (`clearAll` + `replaceAll`). There is no new `AppRepositories`
  method.** This is the shape the architecture chose: Cross-RFC reconciliation 1
  (`architecture.md:336`) added `listFull` / `replaceAll` / `clearAll` "the bulk methods the
  serializer needs", and RFC-006 Decision 5's `snapshotCurrent()` / `restore()` sit on the
  serializer, which holds only repositories. It keeps import mode-agnostic, and it leaves the
  fakes and the interface untouched. **Known limits, flagged for the owner:**
  - (a) `listFull()` / `list()` **skip** a per-record-corrupt entry. A mid-replace rollback
    therefore does not restore such a record. The workspace comes back as every *readable* record,
    not as the exact bytes. The AC6 fixture is a healthy store, where both are the same.
  - (b) A whole-collection-corrupt store fails the snapshot read, so it cannot be imported over.
    The user cannot import a backup to escape corruption until Story 5.11's reset.

  The alternative is an opaque `snapshotWorkspace()` / `restoreWorkspace()` pair on
  `AppRepositories`. The localStorage implementation would capture the raw `gol:battles` /
  `gol:organisms` / `gol:schema` strings. That shape is lossless and closes (a), (b) and FD3.
  It costs an interface change that every mode and `@gol/test-utils`' fakes must mirror, and it
  departs from the architecture's named bulk methods. It is a change the owner may prefer. It is
  not the dev agent's to make.
- **FD3: rollback over a fresh workspace re-ensures Conway's Classic.** `replaceAll` stamps
  `gol:schema` (`writeDataKey`). A rollback that restores an empty snapshot therefore leaves a
  **stamped-but-empty** store, and `isFreshWorkspace()` would never seed it again: the exact hole
  the Story 1.4 ordering comment describes. So when `snapshot.wasFresh`, the rollback ends with
  `ensureDefaultOrganism`, which is what the next load's seed would have done. This is unreachable
  from `/settings` today, because `useWorkspaceSeed` runs there first. Test it anyway, because it
  is one line and it is the trap. This case is the one place where "identical to pre-import"
  means "equivalent to pre-import after its first load".
- **FD4: `findDanglingReferences` returns a list and throws nothing.** `@gol/domain` has no
  classes (Story 5.7 FD4), and a result list is cheaper than an interface-plus-factory error for a
  check with one caller. The persistence pipeline turns a non-empty list into
  `ImportError('dangling-reference')`. Existing comments in `organismClosure.ts` and
  `workspaceSerializer.ts`, and in `deferred-work.md`, say "Story 5.8's
  `assertReferentialClosure`". Name the pipeline's local step `assertReferentialClosure` so that
  those references stay true. Do not rewrite them.
- **FD5: `ImportError` has six codes, not RFC-006's three (`'not-json' | 'newer-version' |
  'corrupt'` in Decision 3, plus `'write-failed'` in Decision 5).** It adds two:
  - `'dangling-reference'`: a file that references missing organisms is a different user message
    from a file that is not a workspace at all;
  - `'rollback-failed'`: the one outcome where "your workspace is unchanged" would be a lie.

  `'missing-step'` from `migrate` maps to `'corrupt'`, as it does at rest. It is unreachable for
  the production registry (5.7's integrity test).
- **FD6: an organism id of `__proto__` is rejected in the pure half.** `OrganismSchema.id` is a
  bare non-empty string, so a crafted file parses. `LocalStorageOrganismRepository.replaceAll`
  would throw on it **after** `clearAll()` had run. The rollback would recover, but the pure half
  is where a file's validity is decided, and the rule already exists as `assertSafeCollectionId`,
  so reuse it. Do not re-state the rule.
- **FD7: strip, not `.strict()`.** This was settled by the owner's decision on the 5.7 review
  (`deferred-work.md:27`, option (a)). Unknown keys, including a `settings` key in a hand-edited
  file, are stripped by the parse. That strip **is** the AR-12 mechanism at import
  (`WorkspaceExportSchema` JSDoc). Do not add a `settings` check, and do not tighten any schema.

### What exists: read these before writing a line

- `packages/persistence/src/workspaceSerializer.ts`: the factory, `WorkspaceSerializerDeps`, the
  JSDoc lines to update, and the `listFull()` skip caveat that FD2 inherits.
- `packages/persistence/src/errors.ts`:
  - `CorruptDataError`, `NewerFormatVersionError` (5.7) and `ExportError`, which is the class
    pattern for `ImportError`;
  - `assertSafeCollectionId`;
  - `describeIssues`, reusable for the `'corrupt'` message.
- `packages/persistence/src/localStorageAccess.ts`:
  - `writeDataKey`: it runs `ensureCurrentAtRestFormat()` before every write (the 5.7 review
    patch), writes the data, then stamps;
  - `removeDataKeys` (what `clearAll` does): battles and organisms only, and the stamp survives;
  - `QuotaExceededError`.
- `packages/persistence/src/localStorage{Battle,Organism}Repository.ts`: `replaceAll` builds the
  whole collection and makes a single `writeDataKey` call; `list` / `listFull` skip corrupt
  records.
- `packages/persistence/src/createLocalStorageRepositories.ts`: `clearAll` / `isFreshWorkspace`.
- `packages/persistence/src/ensureDefaultOrganism.ts`: `exists`, then `save`, and it never
  overwrites an existing record (AC5's edited-Conway case relies on this).
- `packages/domain/src/formatMigrations.ts`: `migrate(raw, 'envelope')`, `isFormatMigrationError`,
  and the error's `code` / `foundVersion` / `supportedVersion`. On the identity path, `migrate`
  returns its input **by reference**.
- `packages/domain/src/workspaceExportSchema.ts`: the literal `formatVersion` and why it stays a
  literal, the duplicate-id and `kind: 'battle'` cardinality `superRefine`, and
  `WorkspaceExport` (hydrated `Date`s) vs `WorkspaceExportWire`.
- `packages/domain/src/workspaceExportProjection.ts`: `fromEnvelope` / `fromBattleExport`. They
  rebuild `organismIds` from `cells` in first-appearance order, and **must not be "simplified"**
  (the ordering contract).
- `packages/domain/src/ruleReferenceIndex.ts:88`: `ruleTargetIds(organism)`. It already
  de-duplicates and drops self-references.
- `packages/domain/src/organismClosure.ts`: the header style to mirror, and the "dangling id is
  skipped at export and rejected at import" contract this story completes.
- `packages/test-utils/src/fakeRepositories.ts`: `createFakeRepositories(seed)`. It has no
  failure injection (Story 1.6), so wrap methods in the test file instead.
- `packages/persistence/src/workspaceSerializer.test.ts`: the header explains why `@gol/test-utils`
  is imported with no `package.json` edge. Follow it, and do not add the edge (it creates a cycle
  that breaks `build`).

### Architecture compliance

- **AR-10 / RFC-006 Decision 5** set the pipeline order. **Decision F / AR-12**: settings are
  untouchable by construction, and there is no snapshot-and-restore of settings. **M8**: import is
  a destructive whole-workspace replace, even for a battle file. **M9 / AR-13**: Conway's Classic
  is re-ensured after import.
- **AR-11 / Decision I**: `formatVersion` is the only thing branched on. Never branch on
  `appVersion`, `schemaVersion` or `kind`. Migration runs before the parse.
- **AR-2/27**: the pipeline takes `AppRepositories` as a parameter. It imports no concrete
  repository and does not call `createLocalStorageRepositories()` outside tests. The page boundary
  is still the only caller of the factory (Story 5.9 wires it).
- **No DOM types in `packages/domain`.** `findDanglingReferences` is pure.
- **No classes in `@gol/domain`.** `ImportError` is a class, but only in `@gol/persistence`, next
  to `CorruptDataError` / `ExportError`.
- **Spec-ID citations** must resolve under `npm run spec:check`: `AR-10`, `AR-12`, `AR-13`,
  `AR-44`, `M8`, `M9`, `Decision F`, `Decision E.5`, `RFC-006`, `NFR-7.3`, `FR-8.4`, `FR-1.5`,
  `Story 5.9`, `Story 5.11`. Write each ID exactly as the specs spell it.

### Library / framework notes

- No new dependency. Zod 4.4.3 is installed. Use `safeParse` and read `.error.issues`. Keep the
  Zod v4 spellings. Timestamps hydrate to `Date` through `IsoTimestamp`, and `replaceAll`
  re-serialises them as the identical ISO strings.
- No web research was needed. Every API this story touches is in-repo, and no library version
  changes.

### Testing standards

- `packages/domain` has a **≥90% per-file** gate, so `referentialClosure.ts` must reach it.
  `packages/persistence` has a **~80% aggregate** gate, and it is carried by the AC6 integration
  tests. Do not pad coverage.
- In a stub for `Storage.prototype.setItem`, fail by **key and occurrence**, not by key alone,
  because the rollback writes the same keys again. Restore mocks in `afterEach`, not at a test's
  tail (5.7 review patch).
- To prove "nothing was written", compare raw `getItem` strings **before and after**. A `setItem`
  spy is only a supplement to that comparison.
- No e2e. No UI ships (Story 5.9). The existing e2e suite must stay green.

### Previous story intelligence

- **Story 5.7 (done, #84):**
  - `migrate` is in `@gol/domain`. It returns input by reference on identity, and it rejects
    `'newer-version'` **before** any parse.
  - `NewerFormatVersionError` is a `CorruptDataError` subclass, used for a newer **at-rest**
    stamp. `writeDataKey` now runs the format check before every write, so an import over a
    newer-stamped store fails at the snapshot read (Task 4.3).
  - The owner kept Zod's strip (FD7).
  - Test lessons from 5.7:
    - a quota stub must fail only the first write to its key;
    - use deep-frozen inputs to prove non-mutation;
    - restore mocks in `afterEach`.
  - 5.7's Task 1.3 already reserved the mapping of `FormatMigrationError` into `ImportError` for
    this story.
- **Story 5.6 (done, #82):** `lib/export/` in `apps/web` is the export seam. `exportBattle(id)`
  reads the **saved** battle. Runtime strings carry no story IDs.
- **Stories 5.3 / 5.4:**
  - the envelope and the projections are in `@gol/domain`;
  - the serializer is a factory, not a class;
  - RFC variances are **recorded in `deferred-work.md`**, not absorbed;
  - the owner rules on flagged FDs;
  - the closure consumes `ruleTargetIds`, the one definition of "a rule targets X".
- **Stories 1.4 / 1.5:** the data-then-stamp ordering, and the stamped-but-empty trap (FD3).
  `isFreshWorkspace()` asks about presence only. `clearAll()` keeps the stamp.

### Git intelligence

`main` is at `388dd20` (#84 Story 5.7 merged, after #83 Story 4.22). Epic 5's recent work is in
`packages/domain` (`formatMigrations.ts`, `organismSchema.ts`), `packages/persistence`
(`localStorageAccess.ts`, `errors.ts`) and `apps/web/lib/export/`. This story touches the domain
barrel. It collides on every two-lane sync, and `[[sync.rules]]` resolves it. It also touches
`packages/persistence/src/{errors,index,workspaceSerializer}.ts`. The Epic 4 lane's remaining
stories (4.23–4.26) are editor and battle UI in `apps/web` over the existing repository API.

### Project Structure Notes

- New:
  - `packages/domain/src/referentialClosure.ts` + `.test.ts`;
  - `packages/persistence/src/workspaceImport.ts` + `workspaceImport.test.ts`.
- Modified:
  - `packages/domain/src/index.ts` (one block, appended at the end);
  - `packages/persistence/src/errors.ts` (`ImportError`);
  - `packages/persistence/src/index.ts`;
  - `packages/persistence/src/workspaceSerializer.ts` (`importWorkspace` + JSDoc);
  - `packages/persistence/src/workspaceSerializer.test.ts` (one mode-agnostic case).
- Docs: `deferred-work.md` and `sprint-status.yaml`. `scripts/bundle-baselines.json` changes only
  if a route grows, and only through the tool.
- Untouched on purpose:
  - `apps/web`;
  - `repositories.ts` (FD2);
  - `@gol/test-utils`;
  - `workspaceExportSchema.ts`;
  - `formatMigrations.ts`;
  - `localStorageAccess.ts`;
  - every `package.json`.

### What NOT to build

- ❌ Any UI: the file picker, the warning, Export-First or the copy (Story 5.9).
- ❌ A merge or add import, or any branch on `kind` (M8).
- ❌ A snapshot or restore of `gol:settings`, or a check for a `settings` key in the file
  (Decision F, FD7).
- ❌ A new `AppRepositories` method or a fake change (FD2). This belongs to the owner.
- ❌ A second "rule targets X" derivation (use `ruleTargetIds`), or a Conway's Classic exemption
  in the closure check (AC3).
- ❌ Loosening `WorkspaceExportSchema.formatVersion`, or bumping `CURRENT_FORMAT_VERSION`.
- ❌ Corruption UX for the **store** (Story 5.11). A snapshot-read failure propagates unchanged.

### Open flags for the owner (not blockers: the story proceeds on the FDs)

- **FD2** is the story's architecture-shaping call. The repository-level snapshot loses
  per-record-corrupt entries on rollback, and it cannot import over a whole-collection-corrupt
  store. The lossless alternative is an opaque `snapshotWorkspace` / `restoreWorkspace` pair on
  `AppRepositories`, which is an interface change. Changing course is cheapest before Story 5.9
  wires it up.
- **FD5** adds two `ImportError` codes beyond RFC-006. Story 5.9's copy branches on them.

### References

- `docs/planning-artifacts/epics.md:1408-1419` (5.8), `:1421-1432` (5.9, the consumer),
  `:1447-1458` (5.11), `:168-172` (AR-9 to AR-13), `:218` (AR-44).
- `docs/planning-artifacts/architecture.md:238-248` (Decision F), `:336` (the bulk methods),
  `:354` (M8).
- `docs/planning-artifacts/rfcs/RFC-006-persistence-workspace-schema.md`: Decision 3 (`migrate`,
  `ImportError`), Decision 5 (the import pipeline), Decision 6 (settings), Decision 7 (post-import
  `ensureDefaultOrganism`), Alternative 1 (no per-repository bulk ops).
- `docs/implementation-artifacts/5-7-migration-registry.md`: FD4, FD9 and the review findings.
- `docs/implementation-artifacts/deferred-work.md`: `:27`, `:33`, `:55`, `:107`, `:235`, `:2622-2638`
  (the partly-corrupt export, which is unimportable by design), and the 5.7 sections.
- `docs/project-context.md`: repositories are injected, `clearAll()` never touches settings,
  import is destructive, Conway's Classic is re-seeded, the coverage tiers, `ci:dev` is never
  piped, and the bundle growth ratchet.

## Dev Agent Record

### Agent Model Used

Claude Opus 5.5 (1M context) — `claude-opus-5-5[1m]`, via `/bmad-dev-story` under `implement-next-story` (lane epic-5).

### Debug Log References

- Red phase: `referentialClosure.test.ts` failed to load before `referentialClosure.ts` existed.
  Rollback tests were mutation-checked: removing the `restore(...)` call fails the three
  write-failure tests; removing the fresh-snapshot `ensureDefaultOrganism` fails the FD3 test only.
- `npm run ci:dev > scratchpad/ci.log 2>&1; echo $?` → **EXIT 0** (typecheck, lint, format:check,
  spec:check, boundary:check, coverage, build:standalone, bundle:check, bench, bench:check,
  e2e:chromium). Coverage: `@gol/domain` 100% all files (`referentialClosure.ts` 100/100/100/100);
  `@gol/persistence` 99.22% stmts / 97.16% branches aggregate (150 tests).
- Bundle: every route grew slightly (home +0.3, /battle +0.2, /battle/new +0.2, /organisms +0.3,
  /settings +1.6 KB gzip) — refreshed with `npm run build:standalone && npm run bundle:baseline`
  (tool-written), then `bundle:check`, `format:check` and `spec:check` re-run green.

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created
- **Task 1:** `findDanglingReferences` in `@gol/domain` (`referentialClosure.ts`) — pure, returns a
  readonly list of `{ kind, id, referencedBy }`, walks `ruleTargetIds` for every organism (no
  transitivity, no Conway exemption), de-duplicated per battle for cells. Exported with its
  `DanglingReference` type in one block appended at the end of the domain barrel. 8 tests,
  including the `toEnvelope` ∘ `organismClosure` inverse.
- **Task 2:** `ImportError` (six codes) in `errors.ts`, with `foundVersion` / `supportedVersion` /
  `issues` / `dangling` / `rollbackError` and `cause`; developer-facing messages per code. The
  `dangling` field reuses `@gol/domain`'s `DanglingReference` type rather than re-declaring it.
- **Task 3:** `workspaceImport.ts` — `validateImportFile` (steps 1–4, pure; `__proto__` → `'corrupt'`
  via `assertSafeCollectionId`; local step named `assertReferentialClosure`) and `applyImport`
  (snapshot via `listFull`/`list`/`isFreshWorkspace`, write region clearAll → organisms → battles →
  ensure, restore with the FD3 re-ensure, `'write-failed'` / `'rollback-failed'`).
  `fromEnvelope` runs before the snapshot so nothing pure sits in the write region.
  `organismCount` is derived (incoming count + 1 when Conway was absent) rather than re-read, so
  a successful write is never followed by a storage read that could fail it.
  `WorkspaceSerializer.importWorkspace` composes them; both JSDocs updated. Barrel exports
  `ImportError`, `ImportErrorCode`, `ImportErrorDetails`, `validateImportFile`, `ImportSummary`;
  `applyImport` stays internal.
- **Task 4:** `workspaceImport.test.ts` (20 tests, real localStorage repositories under jsdom, raw
  `getItem` comparison of all four keys) covers every AC6 case plus rollback-failed, the FD3 fresh
  rollback, the snapshot-read `NewerFormatVersionError` passthrough, both success kinds and the
  edited-Conway case. `workspaceSerializer.test.ts` gains two fake-backed tests using `vi.fn`
  pass-through wrappers (validation precedes every repository call; a rejected file touches none).
- **Task 5:** `deferred-work.md` — new "Deferred from: Story 5-8" section (FD1–FD7 and the three
  RFC-006 variances); `:33` struck (discharged), `:55` / `:107` / `:235` annotated, none deleted.
- **Deviations from the FDs:** none. Two small additions beyond the task text: `ImportErrorDetails`
  is barrel-exported as a type (the constructor's parameter type), and the corrupt cases include a
  non-object document (`[...]`) alongside the listed ones.
- **Not covered by a test:** the pass-through of a non-`FormatMigrationError` thrown by `migrate`
  (no seam without mocking `@gol/domain`; the production registry is empty). The branch is three
  lines and mirrors `ensureCurrentAtRestFormat`'s.
- **Owner flags (unchanged from the story):** FD2 (repository-level snapshot, lossy for
  per-record-corrupt entries) and FD5 (six codes).

### File List

- `packages/domain/src/referentialClosure.ts` (new)
- `packages/domain/src/referentialClosure.test.ts` (new)
- `packages/domain/src/index.ts`
- `packages/persistence/src/errors.ts`
- `packages/persistence/src/index.ts`
- `packages/persistence/src/workspaceImport.ts` (new)
- `packages/persistence/src/workspaceImport.test.ts` (new)
- `packages/persistence/src/workspaceSerializer.ts`
- `packages/persistence/src/workspaceSerializer.test.ts`
- `scripts/bundle-baselines.json` (tool-written by `npm run bundle:baseline`)
- `docs/implementation-artifacts/deferred-work.md`
- `docs/implementation-artifacts/sprint-status.yaml`
- `docs/implementation-artifacts/5-8-atomic-import-pipeline.md`


Dev Model: opus   # architecture-shaping: fixes the import pipeline's snapshot/rollback shape (FD2), the ImportError contract Story 5.9 words, and the pure/writing split 5.9 may call at file-pick time
Proposed lane gate: none — 5.8 touches only packages/domain (new referentialClosure.ts + barrel block) and packages/persistence (errors.ts, index.ts, workspaceSerializer.ts, new workspaceImport.ts); no AppRepositories or fake change, no apps/web change, and Epic 4's remaining 4.23–4.26 are editor/battle UI over the existing repository API

## Change Log

- 2026-09-25 — Story 5.8 implemented: atomic import pipeline (`validateImportFile` / `applyImport`,
  `WorkspaceSerializer.importWorkspace`), `ImportError` with six codes, `findDanglingReferences` in
  `@gol/domain`, AR-44 integration tests over real localStorage, deferred-work records, bundle
  baselines refreshed. Status → review.
- 2026-09-25 — Code review (Fable 5, full mode): 4 patches applied (write-region ordering asserted
  as an exact sequence, `'write-failed'` JSDoc caveat, cross-rule dedup test, duplicate-battle-id
  corrupt case), 1 deferred (snapshot-window concurrent-writer race → `deferred-work.md`, Story 5.9
  wiring), 1 owner decision left open (rollback materializes an absent `gol:battles` key — FD2
  limit (c) vs opaque snapshot), 2 dismissed. Status → in-progress pending the FD2/limit-(c) ruling.
