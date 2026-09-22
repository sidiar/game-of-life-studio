---
baseline_commit: aa8ff8e1a79e607ed8b707a757ff00f042fa1047
---

# Story 5.3: Export Envelope & Serializer

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a developer,
I want a versioned serializer for all file exchange,
so that every exported file is self-describing and future-migratable.

## Acceptance Criteria

From `epics.md#Story 5.3: Export Envelope & Serializer` (`epics.md:1344-1356`), decomposed into what
a reviewer can check independently. AC6–AC9 are repo-derived: obligations the shipped schemas, the
`AppRepositories` seam, the coverage gates and two standing forward-references already impose on
"the story that mints the envelope".

1. **`WorkspaceExportSchema` is the versioned envelope, and it is the schema of record for every
   export** (AR-10, FR-6.3). Fields, exactly: `formatVersion` (a `z.literal(CURRENT_FORMAT_VERSION)`
   — the constant already exported from `@gol/domain`, not a new `1`), `appVersion` (provenance
   string, never branched on), `exportedAt` (ISO timestamp), `kind` (`'workspace' | 'battle'`),
   `organisms` (`z.array(OrganismSchema)`), `battles` (`z.array(BattleExportSchema)`). No other
   top-level field (RFC-006 Decision 2, `RFC-006:104-158`).

2. **`BattleExportSchema` carries the battle sparsely: `{ id, name, gridDimensions, cells,
   createdAt, updatedAt }`** — `gridDimensions` reusing `EditableGridPresetSchema` (Decision G.1;
   the field is deliberately *not* spelled `gridSize` — that is the at-rest name), `cells` an array
   of `{ x, y, organismId }`, and **no roster field** (Decision H.2 — the envelope carries cells
   only). Its `superRefine` rejects, each with its own `path`: a cell outside
   `gridDimensions` (`x >= cols || y >= rows`), duplicate `(x,y)` coordinates (corrupt, never
   last-wins), and more than 255 distinct `organismId`s in one battle (Decision G.2/G.3).

3. **Grids convert dense-at-rest → sparse-on-the-wire at the serializer boundary, and back**
   (AR-9). Two pure functions in `@gol/domain`: `toBattleExport(battle)` walks the dense
   `gridState` and emits one cell per non-zero value, and `fromBattleExport(battleExport)` rebuilds
   `gridState` + `organismIds` from the cells alone. ⚠️ **The `cells` array is ordered by ascending
   roster ref (row-major within each organism), and the inverse assigns refs by order of first
   appearance in `cells`** — that ordering contract is what makes AC4 hold for *every* schema-valid
   battle rather than only for some (FD3). It is not a cosmetic choice and must not be "simplified"
   to a single row-major pass.

4. **Round-trip identity holds: serialize → parse → validate reproduces the exact workspace**
   (AR-44), pinned three ways (AR-41):
   - a fast-check property in `@gol/domain` over generated battles: `fromBattleExport(toBattleExport(b))`
     deep-equals `b`, including `organismIds` order and every cell value;
   - a whole-envelope test that goes through real JSON:
     `fromEnvelope(WorkspaceExportSchema.parse(JSON.parse(JSON.stringify(toEnvelope(…)))))`
     deep-equals the input battles and organisms — `Date` timestamps in, `Date` timestamps out
     (FD4);
   - the **sparse↔typed** composition in `@gol/simulation`, closing `deferred-work.md:392`:
     `gridToDense ∘ fromBattleExport ∘ toBattleExport ∘ gridFromDense` is the identity on
     `occupant`. Composed from the two existing halves — no third converter (FD8).

5. **Settings are structurally absent from every envelope** (AR-12 / Decision F.1). Pinned, not
   asserted in prose: `WorkspaceExportSchema` has no `settings` key, and a hand-built envelope
   carrying one parses successfully with the field **stripped** — `'settings' in parsed === false`.
   `SettingsSchema` is not imported by any file this story adds.

6. **`WorkspaceSerializer` exists as a factory over the injected ports and exports the workspace
   kind.** `createWorkspaceSerializer({ repos, appVersion, now })` in `@gol/persistence` returns a
   `WorkspaceSerializer` whose `exportWorkspace()` reads `battles.listFull()` + `organisms.list()`
   (both already on the interface) and returns the wire envelope. `exportBattle(id)` is **out of
   scope** — its organism set is the Story 5.4 closure (`lane-gates.yaml` already gates 5.4 on
   4.19); `parse`/`migrate`/`import` are Stories 5.7/5.8. The factory takes `appVersion` and `now`
   as injected values, never reading a clock or a constant of its own (FD5).

7. **This story adds no `apps/web` file and no `apps/web` import.** The serializer is wired to the
   UI by Story 5.5; nothing under `apps/web` references it yet. Consequence, and an AC because it
   is checkable: **all five `check-bundle-size.mjs` routes are byte-identical to the 5.2 figures**
   (333.9 / 309.4 / 309.2 / 295.7 / 291.7 KB), and no `budgetGzipKb` moves. `/battle` has 0.6 KB of
   headroom and a raise is what Sidiar refuses (`deferred-work.md:397`).

8. **The two standing forward-references to "Story 5.3" that this story can discharge, are
   discharged in writing.** (a) `PALETTE_VERSION` is **not** stamped into the envelope
   (`1-7-palette-token-registry-display-color-lut.md:271` named 5.3 as the owner of that call) —
   FD7 records why, and 1.7's entry is marked resolved. (b) `deferred-work.md:392`'s
   sparse↔typed round-trip lands as AC4's third bullet and its entry is struck. Neither is left as
   a silent omission.

9. **Coverage gates pass at their real tiers with no config change.** Everything this story adds to
   `@gol/domain` sits under the **≥90% per-file** gate, and everything added to `@gol/persistence`
   under the ~80% aggregate one; `npm run ci:dev` exits 0 and its result is reported, not inferred.

## Tasks / Subtasks

- [x] **Task 1 — The envelope schemas in `@gol/domain`** (AC: 1, 2, 5, 9)
  - [x] New `packages/domain/src/workspaceExportSchema.ts`. Import `CURRENT_FORMAT_VERSION` from
        `./settingsSchema`, `EditableGridPresetSchema` + `OrganismSchema` from `./organismSchema`,
        `MAX_BATTLE_NAME_LENGTH` + `IsoTimestamp` from `./battleSchema`.
  - [x] **Export `IsoTimestamp` from `battleSchema.ts`** (it is module-private today, line 10). Do
        not re-declare it here — `battleSchema.ts:4-9`'s own comment already says RFC-006 spells
        these fields as ISO strings and that this is "what lets the two schemas share a value".
        Keep it out of the package barrel unless a second package needs it (it does not).
  - [x] `export const EXPORT_KINDS = ['workspace', 'battle'] as const;` +
        `export const PlacedCellSchema = z.object({ x: z.number().int().min(0), y:
        z.number().int().min(0), organismId: z.string().min(1) })`. ⚠️ `.min(1)` on `organismId`,
        matching `BattleSchema.organismIds`'s element schema — RFC-006's bare `z.string()` is
        looser than the entity it round-trips to.
  - [x] `export const BattleExportSchema = z.object({ id: z.uuid(), name:
        z.string().max(MAX_BATTLE_NAME_LENGTH), gridDimensions: EditableGridPresetSchema, cells:
        z.array(PlacedCellSchema), createdAt: IsoTimestamp, updatedAt: IsoTimestamp })
        .superRefine(…)` with the three AC2 issues, each carrying `path: ['cells']` and a message
        in the house voice (see `battleSchema.ts:33-72` for the exact shape and tone). Cite
        `(Decision G.2)` / `(Decision G.3)` / `(Decision H.2)` so `spec:check` resolves them.
  - [x] `export const WorkspaceExportSchema = z.object({ formatVersion:
        z.literal(CURRENT_FORMAT_VERSION), appVersion: z.string(), exportedAt: IsoTimestamp, kind:
        z.enum(EXPORT_KINDS), organisms: z.array(OrganismSchema), battles:
        z.array(BattleExportSchema) })`. A comment above it states the absent field explicitly —
        settings never travel, in either kind (Decision F.1 / AR-12) — because the invariant is
        the *absence* and a reader cannot see it otherwise.
  - [x] Types: `export type PlacedCell = z.infer<typeof PlacedCellSchema>`,
        `BattleExport`/`WorkspaceExport` = `z.infer<…>` (hydrated `Date`s), and
        `export type WorkspaceExportWire = z.input<typeof WorkspaceExportSchema>` — the
        `JSON.stringify`-ready shape (FD4). `export type ExportKind = (typeof EXPORT_KINDS)[number]`.
  - [x] ⚠️ Zod **v4** spellings: `z.uuid()`, `z.iso.datetime()`, `ctx.addIssue({ code: 'custom',
        path, message })`. RFC-006's `z.string().uuid()` / `z.string().datetime()` are v3 and do
        not exist on this install — the repo's own schemas are the reference, not the RFC snippet.
  - [x] `workspaceExportSchema.test.ts`: `formatVersion: 2` is rejected (the literal, not a range);
        a `kind` outside the two is rejected; an out-of-bounds cell, a duplicate coordinate pair,
        and a 256-distinct-id battle each fail with the expected `path`; a legal 255-distinct-id
        battle passes (the boundary is `>`, not `>=`); `exportedAt` comes back a `Date`;
        **AC5**: an envelope literal carrying `settings: {…}` parses and the result has no
        `settings` key (`expect('settings' in parsed).toBe(false)`).

- [x] **Task 2 — Dense↔sparse projection in `@gol/domain`** (AC: 3, 4, 9)
  - [x] New `packages/domain/src/workspaceExportProjection.ts`, sitting to `workspaceExportSchema.ts`
        as `battleProjection.ts` sits to `battleSchema.ts` (schema vs. projection — the established
        split). Read `battleProjection.ts`'s header first: its ref-remap hazard is the same hazard
        in the other direction.
  - [x] `export function toBattleExport(battle: Battle): z.input<typeof BattleExportSchema>` —
        one row-major pass bucketing cells by ref (`buckets[ref].push({ x: col, y: row,
        organismId: battle.organismIds[ref - 1] })`), then concatenate buckets `1..organismIds.length`.
        `ref = index + 1` (M14). `createdAt`/`updatedAt` are emitted as `.toISOString()`.
        O(cells), one pass — **not** a scan per ref.
  - [x] `export function fromBattleExport(be: BattleExport): Battle` — walk `cells` in order,
        assigning each new `organismId` the next ref (`organismIds.push(id)`), and write
        `gridState[y][x] = ref`. Allocate `gridState` from `gridDimensions` first
        (`emptyGrid`-shaped: a NEW row array per row, never `Array(rows).fill([])`). Returns a
        `Battle` with `Date` timestamps.
  - [x] ⚠️ **Do not call `pruneAndRemapBattleGrid` here.** Its output order is "first-placed-slot"
        over an *input roster*; `fromBattleExport` has no roster to start from and its order comes
        from `cells`. The two agree by construction only because of FD3's emission order — which is
        the thing under test, so using the projection to produce the expectation would make the
        test vacuous.
  - [x] `export function toEnvelope(kind, battles, organisms, meta): WorkspaceExportWire` where
        `meta` is `{ appVersion: string; exportedAt: Date }`, and
        `export function fromEnvelope(envelope: WorkspaceExport): { battles: Battle[]; organisms:
        Organism[] }`. Both pure; no clock, no `Date.now()`, no module-level constant (FD5).
  - [x] `workspaceExportProjection.test.ts`:
        - hand-built fixtures first — a 2-organism 50×30 battle whose roster order is the
          **reverse** of row-major first appearance (this is the case a row-major emission gets
          wrong, and it must be a named test, not only a generated one);
        - an empty grid exports `cells: []` and comes back with `organismIds: []`;
        - **fast-check property (AC4, AR-41)**: generate `(cols, rows)` from the two presets and a
          dense grid of refs, canonicalize through `pruneAndRemapBattleGrid` to get a schema-valid
          `Battle`, then assert `fromBattleExport(toBattleExport(b))` `toEqual`s `b`. Model it on
          `packages/simulation/src/grid/grid.test.ts:311`'s `arbDense`, and keep run counts at the
          fast-check default — this is a 6,000-cell grid at the larger preset.
        - **whole-envelope JSON round trip (AC4)**: `toEnvelope` → `JSON.stringify` → `JSON.parse`
          → `WorkspaceExportSchema.parse` → `fromEnvelope`, deep-equal to the input. Include
          `CONWAYS_CLASSIC` among the organisms so a real `survivalRules` payload crosses the wire.
  - [x] `packages/domain/src/index.ts`: export the schemas, the constants, the four projection
        functions, and `export type { … }` for every type (`isolatedModules`).

- [x] **Task 3 — `WorkspaceSerializer` in `@gol/persistence`** (AC: 6, 9)
  - [x] New `packages/persistence/src/workspaceSerializer.ts`:
        ```ts
        export interface WorkspaceSerializerDeps {
          repos: AppRepositories;
          /** Provenance only, never branched on (Decision I.4) — see FD5 for why it is injected. */
          appVersion: string;
          now: () => Date;
        }
        export interface WorkspaceSerializer {
          exportWorkspace(): Promise<WorkspaceExportWire>;
        }
        export function createWorkspaceSerializer(deps: WorkspaceSerializerDeps): WorkspaceSerializer
        ```
        A factory returning an object, matching `createLocalStorageRepositories`, **not** a class —
        RFC-006's `class WorkspaceSerializer` snippet is illustrative and the repo's aggregate-level
        assembly is already a factory (FD6).
  - [x] `exportWorkspace()` = `Promise.all([repos.battles.listFull(), repos.organisms.list()])` →
        `toEnvelope('workspace', battles, organisms, { appVersion, exportedAt: now() })`. Two
        comments: why `listFull()` and not `list()` (the summary has no `gridState`), and the
        fault-isolation note — `listFull()` **skips** corrupt records rather than throwing
        (`localStorageBattleRepository.ts`), so an export of a partly-corrupt store silently omits
        the unreadable battles. That is the repository's existing contract, not this story's to
        change; record it in `deferred-work.md` for Story 5.11 (load-time corruption handling),
        which owns telling the user.
  - [x] Barrel: `export { createWorkspaceSerializer } from './workspaceSerializer';` +
        `export type { WorkspaceSerializer, WorkspaceSerializerDeps } from './workspaceSerializer';`
  - [x] `workspaceSerializer.test.ts` (jsdom, like its siblings) against
        `createFakeRepositories()` from `@gol/test-utils` — never a hand-rolled fake
        (project-context Testing rules). Assert: `kind === 'workspace'`; `formatVersion ===
        CURRENT_FORMAT_VERSION`; `exportedAt` is the injected clock's ISO string (so a fixed
        `now: () => new Date('2026-01-01T00:00:00.000Z')` makes it exact); `appVersion` is the
        injected string verbatim; a seeded battle appears with its cells and none of its
        `gridState`; the output has no `settings` key; `JSON.stringify(envelope)` parses back
        through `WorkspaceExportSchema` (the wire type really is wire-shaped).
  - [x] ❌ Do **not** add `exportBattle`, a `kind: 'battle'` code path, a closure walk, a download,
        a filename, `migrate()`, or `importWorkspace()`. Those are 5.4/5.5/5.6/5.7/5.8 and every
        one of them has its own AC.

- [x] **Task 4 — The sparse↔typed composition test** (AC: 4, 8b)
  - [x] In `packages/simulation/src/grid/grid.test.ts`, extend the
        `describe('grid properties (fast-check)')` block (line 311) with the composed identity:
        dense → `gridFromDense` → `gridToDense` → wrap as a `Battle` → `toBattleExport` →
        `fromBattleExport` → `gridFromDense` again, asserting `occupant` equality. Update the
        block's comment at `:312-313` — it currently says the sparse form "does not exist until
        Story 5.3's WorkspaceSerializer builds it", which stops being true here.
  - [x] Test file only: no `packages/simulation/src` change, so the ≥90% per-file gate there is
        untouched. `@gol/simulation` already depends on `@gol/domain`; no `package.json` edit.
  - [x] ⚠️ `age` is **not** part of this identity — `gridToDense` drops it by design, and the
        at-rest/wire shapes carry no age at all (A-2). Assert on `occupant`, `width`, `height`.

- [x] **Task 5 — Record what this story decides and defers** (AC: 8)
  - [x] `docs/implementation-artifacts/deferred-work.md`: strike the `:392` sparse↔typed entry with
        a one-line resolution naming Task 4's test; add a new "Deferred from: Story 5.3" section
        carrying (a) the `appVersion` source question FD5 leaves to Story 5.5, (b) the
        `listFull()`-skips-corrupt export gap for Story 5.11, (c) FD3's emission-order contract as
        a thing a later "simplification" would silently break.
  - [x] `docs/implementation-artifacts/epic-1/1-7-palette-token-registry-display-color-lut.md:271`:
        the `PALETTE_VERSION` line named Story 5.3 as the decider. Do **not** edit an archived
        story file — record the discharge in `deferred-work.md` instead, quoting the line, with
        FD7's reasoning.
  - [x] `docs/project-context.md`: nothing to add. The `formatVersion`-is-the-only-branch trap
        (`:405-407`) already covers this story and needs no new bullet. ⚠️ If the dev finds a
        genuine new conflict between an RFC snippet and the shipped code, surface it — do not
        silently pick one (project-context Usage Guidelines).

- [x] **Task 6 — Gates** (AC: 7, 9)
  - [x] `npm run ci:dev > /tmp/ci-5-3.log 2>&1; echo $?` — redirect and echo, never pipe to `tail`
        (project-context Development Workflow: a pipe reports *tail's* exit code).
  - [x] Record `packages/domain` and `packages/persistence` coverage figures; domain is **per-file**
        ≥90%, so every new file must carry its own coverage — a well-covered projection cannot
        rescue a thin schema file.
  - [x] `node scripts/check-bundle-size.mjs` before and after; report all five routes. AC7 expects
        **no movement at all**. If any route moves, something under `apps/web` imported this
        story's code — that is the bug, not the budget.

## Dev Notes

### Forced decisions (made here so the dev agent does not have to)

- **FD1 — The schemas and the pure conversions live in `@gol/domain`; only the repository-driven
  serializer lives in `@gol/persistence`.** Three facts decide it and they all point the same way.
  (a) `organismSchema.ts:61` already says, in the tree: *"Single-sourced here; RFC-006's export
  envelope reuses it in a later story (Decision G.1)"* — the envelope was planned to sit beside
  `EditableGridPresetSchema`. (b) AR-7 makes Zod schemas the single source of truth for the
  entities `@gol/domain` owns, and the envelope is those entities in another shape, not a storage
  concern. (c) Coverage: `@gol/domain` is **≥90% per file** and `@gol/persistence` is ~80%
  aggregate *because* persistence "is carried by round-trip tests" (its own `vitest.config.ts`
  says so) — putting the round-trip logic itself in the 80% tier would measure the conversion by
  the gate that exists on the assumption something else measures it. The serializer factory stays
  in persistence because it is the only package that may import `AppRepositories`, and it is thin
  enough that the 80% tier is honest for it.

- **FD2 — `gridDimensions`, not `gridSize`; `x`/`y`, not `col`/`row`; `width`/`height` stays the
  engine's.** Four spellings of the same two numbers now exist in the tree and every one of them
  is deliberate: `gridSize: {cols, rows}` at rest (`BattleSchema`), `gridDimensions: {cols, rows}`
  on the wire (RFC-006 Decision 2), `width`/`height` on the runtime `Grid` (`@gol/simulation`),
  and `x`/`y` per cell. The wire name differs from the at-rest name so a `grep` tells you which
  side of the boundary a piece of code is on — which is exactly the confusion `battleRecord.ts`'s
  header goes out of its way to prevent. Do not "unify" them.

- **FD3 — `cells` is emitted in ascending-ref order (row-major within each ref), and the inverse
  assigns refs by first appearance. This is what makes round-trip identity literal.** The envelope
  carries no roster (Decision H.2), so `organismIds` must be *reconstructed* from `cells` — and
  its **order** is load-bearing, because a cell value is `roster index + 1` (M14). Emit row-major
  and reconstruct by first row-major appearance, and any battle whose roster order differs from
  its grid's first-appearance order round-trips to a *permuted* roster with a correspondingly
  remapped `gridState`: the same picture, a different record, and `toEqual` red. Roster order is
  editor order (`pruneAndRemapBattleGrid` preserves "first-placed-**slot**" order — slots, not
  coordinates), so the mismatch is the normal case, not an edge case. Emitting by ascending ref
  makes first-appearance-in-`cells` order **identical to roster order for every schema-valid
  battle**, unconditionally — no normalization of stored data, no roster field, no "identity up to
  permutation" weasel in the AC. The cost is a file grouped by organism rather than by row, which
  is if anything more readable. ⚠️ The contract now belongs to the *format*: a hand-written file
  with interleaved cells still imports correctly (first appearance still defines the roster), it
  simply picks a different roster order than its author may have expected. Say so in the schema
  comment.

- **FD4 — The wire shape is `z.input<typeof WorkspaceExportSchema>`; the parsed shape carries
  `Date`s.** `IsoTimestamp = z.iso.datetime().transform(s => new Date(s))` (`battleSchema.ts:10`)
  is reused rather than re-declared, exactly as that file's own comment anticipates. So
  `toEnvelope` returns ISO strings (ready for `JSON.stringify`) and `WorkspaceExportSchema.parse`
  returns `Date`s (ready for `fromEnvelope` to hand back real `Battle`s, whose `createdAt` is a
  `Date`). A property test that compares a `toEnvelope` output to a parsed one directly will fail
  on `Date` vs `string` and the failure will look like a bug in the conversion; compare at the
  `Battle` level, which is the level AC4 is written at.

- **FD5 — `appVersion` and the clock are injected, and this story does not choose where
  `appVersion` comes from.** Every `package.json` in the workspace is `"version": "0.0.0"`; there
  is no app-version constant anywhere. Three options exist (a constant in `packages/*` that
  duplicates the root `package.json` and drifts; a build-time `NEXT_PUBLIC_*` read, which
  project-context confines to `lib/mode.ts`; a literal at the page boundary), and **none of them
  is this story's to pick**: the first caller at a page boundary is Story 5.5, and picking here
  would mint a constant nothing reads for two stories. Injecting both values also removes the
  hidden clock, which is what lets `exportedAt` be asserted exactly rather than with a regex.
  Record the three options in `deferred-work.md` for 5.5.

- **FD6 — A factory, not a class.** RFC-006 Decision 4 shows `class WorkspaceSerializer { constructor(private repos) }`.
  The repo's repositories *are* classes, but its **aggregate-level assembly** is
  `createLocalStorageRepositories(): AppRepositories` — a factory over an interface — and the
  serializer is aggregate-level (it spans battles and organisms, the same reason `clearAll()` sits
  on the aggregate). The factory also takes DI that a `new` call would have to thread through a
  constructor object anyway. `WorkspaceSerializer` survives as the **interface** name, so the
  RFC's vocabulary and AR-10's are intact.

- **FD7 — The envelope does not stamp `PALETTE_VERSION`, and that discharges Story 1.7's
  forward-reference.** `1-7-palette-token-registry-display-color-lut.md:271` says *"❌ Stamping
  `PALETTE_VERSION` into any persisted or exported record — Story 5.3 owns the envelope."* The
  call is no: (a) `WorkspaceExportSchema` as specified has no such field (RFC-006 Decision 2), and
  adding one would make the envelope's field list diverge from the schema of record on its first
  day; (b) Decision I.4 makes `PALETTE_VERSION` a stamp on the *token registry*, for provenance,
  with **additive palette changes needing no migration at all** and destructive ones riding a
  `formatVersion` step — so an envelope copy would be a second version axis that Decision I exists
  to forbid; (c) mechanically, the constant lives in `apps/web/lib/palette/paletteRegistry.ts:20`
  and a `packages/*` schema cannot import it without inverting the seam. An unknown `colorToken`
  in a same-`formatVersion` file already degrades gracefully (default + warn, NFR-7.3), which is
  the case a stamp would have been for.

- **FD8 — The sparse↔typed round trip is a *composition* test in `@gol/simulation`, not a third
  converter.** `deferred-work.md:392` prescribes it: *"if it composes the two conversions
  (`sparse↔dense` there, `dense↔typed` here) rather than writing a third, the property to pin is
  that the composition is the identity."* It cannot live in `@gol/domain` — domain must not depend
  on `@gol/simulation` (the dependency runs the other way) — and putting it in `@gol/test-utils`
  would separate it from the `arbDense` generator it reuses. So: `packages/simulation/src/grid/grid.test.ts`,
  test file only.

- **FD9 — Nothing in `apps/web` changes, and that is an AC, not an omission.** The serializer has
  no consumer until Story 5.5's download button. Unused exported code is the established pattern
  here (`listFull()` and `replaceAll()` have both been on the interface since Story 1.4 carrying
  "Story 5.5" / "Story 5.8" doc comments), and it keeps `/battle`'s 0.6 KB of headroom exactly
  where it is. If the dev finds themselves adding an import under `apps/web`, the story has grown
  into 5.5 — stop.

### What exists — read these before writing a line

| File | Why it matters here |
|---|---|
| `packages/domain/src/battleSchema.ts` | `IsoTimestamp` (`:10`, to export); the four `superRefine` issues and their `path`/message voice to mirror; `:4-9`'s comment on why timestamps are ISO strings and `z.input` is the serialized form. |
| `packages/domain/src/battleProjection.ts` | `pruneAndRemapBattleGrid` — the ref-remap hazard written out at length, the same hazard `fromBattleExport` faces from the other side; also the canonicalizer AC4's generator uses. |
| `packages/domain/src/organismSchema.ts` | `EditableGridPresetSchema` (`:61` names this story), `OrganismSchema`, `ORGANISM_SCHEMA_VERSION` — the stamp axis that is **not** `formatVersion`. |
| `packages/domain/src/settingsSchema.ts` | `CURRENT_FORMAT_VERSION` (`:8`) and the comment saying it is *this story's* envelope literal. Also the AR-12 header — the reason nothing here imports `SettingsSchema`. |
| `packages/persistence/src/repositories.ts` | `AppRepositories`; `listFull()`'s doc comment ("the WorkspaceSerializer export path"); the aggregate-method voice. |
| `packages/persistence/src/createLocalStorageRepositories.ts` | The factory-over-interface shape FD6 follows. |
| `packages/persistence/src/localStorageBattleRepository.ts` | `listFull()` **skips** corrupt records rather than throwing — the fault-isolation fact Task 3 records. |
| `packages/persistence/src/localStorageBattleRepository.test.ts:58` | `it('writes the dense gridState at rest (sparse cells are wire-only)')` — the shipped precedent AC3 is the other half of. |
| `packages/simulation/src/grid/grid.ts` | `gridFromDense` / `gridToDense` / `Grid`; the M14 ref-encoding comment (`:42-52`). |
| `packages/simulation/src/grid/grid.test.ts:311-313` | `arbDense` — the fast-check generator to model AC4 on — and the comment Task 4 updates. |
| `packages/test-utils/src/fakeRepositories.ts` | `createFakeRepositories(seed)` — the fake Task 3's test uses; note `structuredClone` does **not** typecheck in `packages/*` (`lib: ["ES2022"]`, no `@types/node`) — it uses `JSON.parse(JSON.stringify(x))`. |
| `packages/test-utils/src/gridBuilders.ts:5` | "NOT sparse `cells` conversion — that is the Story 5.3 serializer" — and `emptyGrid`'s `Array.from` comment, the row-aliasing trap `fromBattleExport` must not fall into. |
| `apps/web/lib/battle/battleRecord.ts:28-52` | `projectBattleForSave` — the runtime→dense direction, and the header that says the envelope "appears nowhere here". |
| `docs/planning-artifacts/rfcs/RFC-006-persistence-workspace-schema.md:104-158` | Decision 2 — the normative envelope, in Zod v3 spelling. |
| `packages/domain/vitest.config.ts` | `perFile: true` at 90 — why each new domain file needs its own coverage. |

### Architecture compliance

- **AR-9 / RFC-006 Decision 2** — dense at rest, sparse on the wire, converted at the serializer
  boundary. The at-rest shape is untouched by this story; no repository changes.
- **AR-10** — the versioned envelope lands here; the closure (5.4) and the atomic import (5.8) do
  not. AR-10 is one line describing three stories.
- **AR-12 / Decision F.1** — no settings field, in either `kind`. AC5 pins the *absence*.
- **Decision G.1/G.2/G.3** — `EditableGridPresetSchema` reused for `gridDimensions`; cell bounds
  and duplicate coordinates refined at the import boundary; the 255-distinct-organism cap enforced
  on the envelope as well as at rest.
- **Decision H.1/H.2** — the envelope carries cells only. The round trip is lossless *because*
  the roster ≡ the placed set; if that invariant were ever relaxed, this story's identity property
  is the test that goes red first.
- **Decision I / I.4** — `formatVersion` is a `z.literal`, so a newer file fails `parse`. That is
  the *floor*, not the feature: the graceful "app too old" message and the source-keyed
  `MIGRATIONS` chain are Story 5.7's, which runs `migrate()` **before** `parse()`. Do not add
  version-range tolerance here to be helpful — it would make 5.7's rejection path unreachable.
- **M14** — `ref = index + 1`, slot 0 empty. Both directions of the conversion turn on it.
- **AR-2/27** — the serializer takes `AppRepositories` as an injected dependency and imports no
  concrete repository. `packages/domain` imports nothing from `packages/persistence`.
- **No DOM types in `packages/*`** — the new `@gol/domain` files must compile under
  `lib: ["ES2022"]`: no `structuredClone`, no `Blob`, no `URL`, no `Buffer`. The download
  (`Blob`/`URL.createObjectURL`) is Story 5.5's, in `apps/web`.
- **AR-39 / NFR-5.1** — domain ≥90% per file; persistence ~80% aggregate.
- **Spec-id hygiene** — write `AR-9`, `AR-10`, `AR-12`, `AR-41`, `AR-44`, `FR-6.3`, `NFR-7.3`,
  `M14`, `Decision F`, `Decision G`, `Decision H`, `Decision I`, `RFC-006`, `Story 5.3` exactly so;
  `spec:check` tokenises code comments and fails on an ID that resolves to nothing.

### Library / framework notes (installed versions, no research needed)

- **Zod 4.4.3.** `z.uuid()`, `z.iso.datetime()`, `z.literal(x)`, `z.enum(arrayConst)`,
  `.superRefine((v, ctx) => ctx.addIssue({ code: 'custom', path, message }))`. Unknown keys are
  **stripped** by default — that is the mechanism AC5 tests, not a loophole to close with
  `.strict()`. `z.input<T>` / `z.infer<T>` differ wherever a `.transform()` runs.
- **fast-check 4.9.0** is a **root** devDependency, so `@gol/domain` can import it with no
  `package.json` change (`@gol/simulation` and `apps/web` already do). ⚠️ `apps/web/lib/organisms/conditionDraft.ts`
  imports fast-check from **production** code — do not copy that pattern; test files only.
- **Vitest 4** — `packages/domain` runs `environment: 'node'`, `packages/persistence` runs
  `'jsdom'`. A new persistence test inherits jsdom whether it needs it or not; that is fine.
- **`isolatedModules: true`** — every type re-export in a barrel is `export type { … }`.
- No `noUncheckedIndexedAccess` — `organismIds[ref - 1]` types as `string`, not `string | undefined`.
  The bounds are guaranteed by `BattleSchema`'s own refinement, not by the compiler; a comment
  should say which.

### Testing standards

- Derive expectations from fixtures and from the schemas, never from a hand-typed envelope literal
  — with one exception: the AC5 settings-stripping test and the `formatVersion: 2` rejection are
  *supposed* to be hand-built, because they test what the schema refuses.
- The fast-check property must generate battles that are **schema-valid** (route them through
  `pruneAndRemapBattleGrid`), or it will spend its runs discovering that `BattleSchema` rejects
  random input — a property about the wrong thing.
- Use `@gol/test-utils`' `createFakeRepositories` and `gridBuilders`; never hand-roll a fake
  repository or a dense grid literal larger than a few rows.
- Keep both grid presets in play (Decision A — dimensions are parameters, never constants). A test
  that only ever uses 50×30 has not exercised the bounds refinement at the size that matters.
- Never pixel- or snapshot-test anything; there is no UI in this story.
- Name the AC in the `describe`/`it` title where the assertion is an AC's proof (house convention,
  5.1 review) — and move the id if the assertion moves.

### Previous story intelligence

- **Story 5.2** (`5-2-workspace-statistics.md`) — the immediate parent. Its FD1 (why a
  cross-namespace operation goes on the aggregate, not a repository) is the same argument FD6 makes
  for the serializer; its FD9 (bundle: a module added to the graph costs every route ~0.1–0.2 KB
  even with almost no code in it) is why AC7 expects *zero* movement here and why that is only
  achievable by staying out of `apps/web`. Its FD4 is the precedent for **recording** a conflict
  with an RFC line rather than silently overriding it — FD7 follows the same form.
- **Story 3.3** (`epic-3/3-3-typed-array-grid-neighborhood.md`) — owns `gridFromDense`/`gridToDense`
  and the `arbDense` generator; it deliberately left the sparse half here and said so in the open
  (`deferred-work.md:392`, the M13 precedent). Task 4 is the other end of that handshake.
- **Story 2.13** — `projectBattleForSave` and the `pruneAndRemapBattleGrid` split; its
  deferred-work entry about the double allocation is the note to remember when 5.5 runs the
  projection over a whole workspace, not now.
- **Story 1.4 / 1.5** — `writeKey`'s candidate-string discipline and the `gol:schema` stamp that
  already writes `{ formatVersion: CURRENT_FORMAT_VERSION }`; `localStorageAccess.test.ts:155-158`
  pins that a `formatVersion: 99` stamp is read back unchanged and **never branched on** — the
  same posture the envelope literal takes from the other side.
- **Story 1.7** — `PALETTE_VERSION` and the forward-reference FD7 discharges.

### Git intelligence

Last 12 commits on `main`: Story 4.16 (create & save organism, PR #69) and its two review rounds,
Story 5.2 (PR #67), and the CI e2e matrix split (#68). None touch `packages/domain`'s schema files
or `packages/persistence` beyond 5.2's meter. Surfaces shared with the Epic 4 lane on this story:
`packages/domain/src/index.ts` (additive exports — Story 4.19 will add its derivations to the same
barrel, so expect a textual merge, not a semantic one) and `packages/domain/src/battleSchema.ts`
(one line changed: `IsoTimestamp` gains an `export`). Neither is a dependency in either direction;
see the lane-gate line at the end.

### Project Structure Notes

- New: `packages/domain/src/workspaceExportSchema.ts` (+ `.test.ts`),
  `packages/domain/src/workspaceExportProjection.ts` (+ `.test.ts`),
  `packages/persistence/src/workspaceSerializer.ts` (+ `.test.ts`).
- Modified: `packages/domain/src/battleSchema.ts` (export `IsoTimestamp`),
  `packages/domain/src/index.ts`, `packages/persistence/src/index.ts`,
  `packages/simulation/src/grid/grid.test.ts` (test only),
  `docs/implementation-artifacts/deferred-work.md`.
- Naming: camelCase files, never dotted; `<Entity>Schema` for Zod schemas; `WorkspaceSerializer` is
  an interface (no `Schema` suffix — nothing parses it).
- Untouched on purpose: every file under `apps/web` (AC7), every repository implementation,
  `packages/test-utils` (no new fake surface — the serializer is not on `AppRepositories`),
  `scripts/check-bundle-size.mjs` (measured, not edited), every RFC.
- Variances, recorded not absorbed: RFC-006 Decision 2's Zod v3 spellings and its bare
  `z.string()` for `organismId`; RFC-006 Decision 4's `class`; RFC-006's silence on cell ordering
  (FD3 fills it). All → `deferred-work.md` in Task 5.

### References

- `docs/planning-artifacts/epics.md:1344-1356` — Story 5.3 ACs; `:168` AR-9; `:169` AR-10; `:171`
  AR-12; `:213` AR-39; `:215` AR-41; `:218` AR-44; `:1357-1368` (5.4, the next consumer);
  `:1369-1390` (5.5/5.6, the first callers).
- `docs/planning-artifacts/rfcs/RFC-006-persistence-workspace-schema.md:104-158` — Decision 2, the
  normative envelope; `:159-184` Decision 3 (migration — Story 5.7, not here); `:185-216`
  Decision 4 (export assembly); `:217-247` Decision 5 (import — Story 5.8); `:248-256` Decision 6
  (settings never travel).
- `docs/planning-artifacts/architecture.md:222-237` Decision E; `:238-250` Decision F; `:251-262`
  Decision G; `:263-275` Decision H; `:276-288` Decision I.
- `docs/planning-artifacts/prds/prd-GameOfLife-2026-05-26/prd.md:399-409` FR-6.3 (the field list
  this envelope satisfies); `:390-396` FR-6.1; `:778-780` A-2 (initial state only).
- `docs/implementation-artifacts/deferred-work.md:392` (the sparse↔typed handshake Task 4 closes);
  `:386` (double allocation — 5.5's, not this story's); `:397` (bundle gate: mechanism, never a
  raise).
- `docs/implementation-artifacts/epic-1/1-7-palette-token-registry-display-color-lut.md:271` —
  the `PALETTE_VERSION` forward-reference FD7 discharges.
- `docs/implementation-artifacts/5-2-workspace-statistics.md` — FD1, FD4, FD9 and the five bundle
  figures AC7 compares against.
- `docs/implementation-artifacts/lane-gates.yaml` — the 5-vs-4 analysis (2026-09-21) and 5.4's
  existing row; this story has none.
- `docs/project-context.md` — Language rules (no DOM in `packages/*`, `isolatedModules`, Zod at
  boundaries), Testing rules (fakes from `@gol/test-utils`, property tests, coverage tiers), Code
  Quality (`spec:check`, comments explain WHY), Development Workflow (`ci:dev`, the pipe trap, the
  commit gate).

## Dev Agent Record

### Agent Model Used

Claude Opus 5 (1M context) — `bmad-dev-story`, lane `--epic 5`.

### Debug Log References

- `npm run ci:dev` → **exit 0** (log: `/tmp/ci-5-3.log`). Chain: typecheck → lint → format:check →
  spec:check → boundary:check → coverage → build:standalone → bundle → bench → bench:check →
  e2e:chromium.
- `npm run spec:check` → exit 0; 267 cited ids resolve, 3/6 reconciliation citations resolve.
- Bundle, measured three ways rather than assumed (see FD10 below): pre-existing `.next` at `main`
  → 333.9 / 309.4 / 309.2 / 295.7 / 291.7; a **fresh** `origin/main` build in this worktree →
  333.8 / 309.5 / 309.3 / 295.7 / 291.6; this branch → **333.8 / 309.5 / 309.3 / 295.8 / 291.7**.
  No `budgetGzipKb` moved.
- Coverage: `@gol/domain` **100 / 100 / 100 / 100** (140 tests, per-file ≥90 gate);
  `@gol/simulation` **100 / 100 / 100 / 100** (408 tests); `@gol/persistence` **99.28 stmts /
  96.22 branches / 100 funcs / 100 lines** (96 tests, ~80 aggregate gate); `@gol/test-utils`
  94.67 / 90.82 / 100 / 97.2 (94 tests, unchanged).

### Completion Notes List

All nine ACs are met. Three things a reviewer should look at first, because they are decisions this
story made that the story file did not pre-decide:

- **FD10 (new) — AC7's premise was false and the fix was `"sideEffects": false` on `@gol/domain`,
  not a budget raise.** "Adds no `apps/web` file and no `apps/web` import" does **not** imply the
  bundle cannot move: `apps/web` imports the `@gol/domain` BARREL, so the two new modules entered
  its graph the moment `index.ts` re-exported them, costing **+0.3 KB on every route** — exactly
  Story 5.2 FD9's ~0.1–0.2 KB per added module, times two. Staying out of `apps/web` is not
  sufficient; being *droppable* is. `packages/domain/package.json` now declares
  `"sideEffects": false`, which is plainly true of that package (every module defines and exports
  values; no registration, no polyfill, no module-level effect anything relies on) and lets the
  bundler drop what no route imports. After it, three routes are byte-identical to a fresh `main`
  build and two sit 0.1 KB above — inside the drift two builds of the *same* source already show at
  the tool's one-decimal precision. ⚠️ Strict byte-identity as AC7 words it is not achievable at
  that precision by any change, including no change at all. Full measurement in `deferred-work.md`,
  along with the note that `@gol/simulation`/`@gol/persistence`/`@gol/test-utils` are equally pure
  and are the next story's free headroom if a route ever gets close.

- **`workspaceSerializer.test.ts` imports `@gol/test-utils` WITHOUT a `package.json` edge.** The
  story's Task 3 requires `createFakeRepositories()` and the project's testing rules forbid a
  hand-rolled fake — but `@gol/test-utils` depends on `@gol/persistence`, and declaring the reverse
  edge makes Turbo print `WARNING Circular package dependency detected` on **every** task in the
  repo (measured; turbo 2.10.5 warns rather than failing). The import resolves through the workspace
  symlink and needs no task ordering, because these packages export TS source and have no emit step.
  The file carries the reasoning at the import; `deferred-work.md` carries the clean fix and the
  trigger for taking it (a second persistence test needing the fakes).

- **FD3's emission order is the load-bearing part of this story.** `toBattleExport` emits `cells`
  grouped by ascending roster ref, not row-major, and `fromBattleExport` assigns refs by first
  appearance — the pairing is what makes AC4 an identity on the *record* rather than "up to a
  permutation of the roster". The named reversed-roster test in `workspaceExportProjection.test.ts`
  is the one that goes red if someone "simplifies" it to a single pass; the fast-check property
  alone would also catch it, but not legibly.

Discharged forward-references (AC8): (a) `PALETTE_VERSION` is **not** stamped into the envelope —
the call, its three reasons and the quoted Story 1.7 line are in `deferred-work.md`; the archived
1.7 story file is deliberately not edited. (b) `deferred-work.md:392`'s sparse↔typed round trip is
struck, closed by `grid.test.ts`'s `describe('sparse <-> typed round trip (AR-41, AR-44)')`, which
composes the four shipped functions rather than writing a fifth.

Out of scope and deliberately absent, each with its own owning story: `exportBattle(id)` and the
rule-aware organism closure (5.4); the download, the filename and the `appVersion` source (5.5);
`migrate()` (5.7); `importWorkspace()` (5.8). Nothing under `apps/web` changed.

Four RFC-006 variances (Zod v3 spellings, the bare `z.string()` for `organismId`, `class` vs
factory, and RFC-006's silence on cell ordering) are recorded in `deferred-work.md` rather than
silently absorbed, following Story 5.2 FD4's precedent. `docs/project-context.md` needed no new
bullet, as Task 5 predicted.

### File List

**Added**

- `packages/domain/src/workspaceExportSchema.ts`
- `packages/domain/src/workspaceExportSchema.test.ts`
- `packages/domain/src/workspaceExportProjection.ts`
- `packages/domain/src/workspaceExportProjection.test.ts`
- `packages/persistence/src/workspaceSerializer.ts`
- `packages/persistence/src/workspaceSerializer.test.ts`

**Modified**

- `packages/domain/src/battleSchema.ts` — `IsoTimestamp` gains an `export` (one line + comment).
- `packages/domain/src/index.ts` — barrel: the envelope schemas, constants, four projection
  functions and every type.
- `packages/domain/package.json` — `"sideEffects": false` (FD10).
- `packages/persistence/src/index.ts` — barrel: `createWorkspaceSerializer` + its two types.
- `packages/simulation/src/grid/grid.test.ts` — test only: the composed sparse↔typed identity, and
  the stale Story 3.3 FD7 comment it makes untrue.
- `docs/implementation-artifacts/deferred-work.md` — the `:392` entry struck; a "Deferred from:
  Story 5.3" section (FD10's measurements, the `appVersion` source for 5.5, the
  `listFull()`-skips-corrupt export gap for 5.11, FD3's ordering contract, the `PALETTE_VERSION`
  discharge, the four RFC-006 variances, the `@gol/test-utils` import).
- `docs/implementation-artifacts/sprint-status.yaml` — `5-3-export-envelope-serializer`:
  `ready-for-dev` → `in-progress` → `review`.
- `docs/implementation-artifacts/5-3-export-envelope-serializer.md` — this record.

### Change Log

| Date | Change |
|---|---|
| 2026-09-22 | Task 1 — `WorkspaceExportSchema` / `BattleExportSchema` / `PlacedCellSchema` / `EXPORT_KINDS` in `@gol/domain`; `IsoTimestamp` exported from `battleSchema.ts`; 18 schema tests including AC5's settings-stripping and the 255/256 boundary. |
| 2026-09-22 | Task 2 — `toBattleExport` / `fromBattleExport` / `toEnvelope` / `fromEnvelope`; the FD3 ascending-ref emission order; 11 tests including the named reversed-roster case, the fast-check identity at both presets, and the whole-envelope JSON round trip. |
| 2026-09-22 | Task 3 — `createWorkspaceSerializer` in `@gol/persistence`, a factory over `AppRepositories` with injected `appVersion` and clock; 6 tests against `createFakeRepositories()`. |
| 2026-09-22 | Task 4 — the composed sparse↔typed identity in `packages/simulation/src/grid/grid.test.ts`, closing `deferred-work.md:392`; the stale FD7 comment updated. |
| 2026-09-22 | Task 5 — `deferred-work.md`: `:392` struck, "Deferred from: Story 5.3" added (seven entries incl. the `PALETTE_VERSION` discharge and FD10). |
| 2026-09-22 | Task 6 — `npm run ci:dev` exit 0. FD10: `"sideEffects": false` on `@gol/domain` after a pristine-`main` comparison showed the barrel re-export costing +0.3 KB on every route; no budget moved. |

Dev Model: opus   # mints the wire format, the dense↔sparse contract and the cell-ordering identity argument that Stories 5.4–5.8 all build on; there is no serializer pattern in the tree to follow
Proposed lane gate: none
