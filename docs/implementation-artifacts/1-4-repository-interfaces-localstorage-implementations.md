---
baseline_commit: aad2348
---

# Story 1.4: Repository Interfaces & localStorage Implementations

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a developer,
I want integrity-aware repository contracts with localStorage implementations behind DI,
so that all persistence is swappable, versioned from the first write, and quota-safe.

## Acceptance Criteria

1. **Given** `@gol/persistence`, **When** interfaces are defined, **Then** `BattleRepository`/`OrganismRepository`/`SettingsRepository` are async, `battles.list()` returns lightweight `BattleSummary` projections without deserializing any grid, and bulk `replaceAll` + data-only `clearAll` exist (AR-6/15)
2. **Given** the localStorage implementations, **When** data is written, **Then** it lands under `gol:battles`/`gol:organisms`/`gol:settings` with dense `gridState` at rest, and `gol:schema` is stamped on the very first write (AR-9/11)
3. **Given** a write that would exceed quota, **When** `setItem` fails, **Then** the candidate-string-then-`setItem` strategy guarantees existing data is never truncated and a non-destructive `QuotaExceededError` surfaces to the caller (AR-14, NFR-7.2)
4. **And** the repository factory selects the localStorage implementation via `NEXT_PUBLIC_MODE`, injected by props at the page boundary — no global store (AR-2/27)
5. **And** `clearAll` cannot touch `gol:settings` by construction (Decision F / AR-12)

## Tasks / Subtasks

- [x] **Task 1: Make `@gol/persistence` able to compile and test DOM code** (AC: 2)
  - [x] Add `"lib": ["ES2022", "DOM"]` to **`packages/persistence/tsconfig.json`'s own `compilerOptions`**. This closes the Story 1.1 deferred item (`deferred-work.md`) that named this story explicitly. **Never** add `dom` to `tsconfig.base.json` — engine purity in `domain`/`simulation` is compiler-enforced by its absence (project-context). Note `lib` fully replaces the base value, so `ES2022` must be repeated.
  - [x] Switch `packages/persistence/vitest.config.ts` from `environment: 'node'` to `'jsdom'` and add `jsdom` to that package's `devDependencies`. **Verified for you:** jsdom 30.0.1 (already installed at the root via `apps/web`) provides a real `localStorage` **and enforces a quota** — a 6 MB `setItem` throws `DOMException` with `name === 'QuotaExceededError'` and `code === 22`. Replace the config's now-false `// packages/* are pure TS — node environment, no DOM` comment with a WHY comment naming localStorage.
  - [x] Drop `passWithNoTests: true` from `packages/persistence/vitest.config.ts` — this story is what ends that package's vacuously-green state (same move Story 1.3 made for `@gol/domain`). Leave the coverage block alone; the ~80% gate flips in Story 3.7.
  - [x] Add `zod` to `@gol/persistence` `dependencies` **only if** you reference `z.*` directly (likely, for `z.input<typeof BattleSchema>` as the at-rest record type). Calling `BattleSchema.parse()` alone needs no zod import. npm workspaces hoists one copy, so there is no duplicate-instance risk.
  - [x] Replace the `packages/persistence/src/index.ts` placeholder (`GOL_PERSISTENCE` / `PERSISTENCE_DEPENDS_ON`) with real exports — remove it, don't leave it alongside. Story 1.3's Task-1 precedent: a placeholder kept beside real exports is the thing that broke three packages' builds.

- [x] **Task 2: `SettingsSchema` + `DEFAULT_SETTINGS` in `@gol/domain`** (AC: 1, 2)
  - [x] **This closes an open question, deliberately — see "Decisions this story is forced to make" below.** RFC-006's Open Questions list the concrete `SettingsSchema` as unfinalized; `SettingsRepository` cannot be typed without it, so it lands here as the minimum shape and nothing more.
  - [x] Define in `packages/domain/src/settingsSchema.ts` (camelCase, never dotted) with **one field per FR-8.6–8.12**, each carrying a `.default()` so `SettingsSchema.parse({})` yields a fully-populated record: `theme` (`'clinical-lab'` default | `'biotech-terminal'`, FR-8.6), `gridLines` (boolean, default `true`, FR-8.7), `cellAnimation` (boolean, default `true`, FR-8.8), `defaultGridSize` (`EditableGridPresetSchema`, default `{cols:100,rows:60}`, FR-8.10), `autoSave` (boolean, **default `false`** — FR-8.11 is explicitly default-Disabled), `defaultSpeed` (the FR-4.2 gen/sec ladder `1|2|5|10|20`, default `10`, FR-8.12). There is no FR-8.9.
  - [x] Export `DEFAULT_SETTINGS = SettingsSchema.parse({})` so the constant and the schema defaults can never drift.
  - [x] Also define `CURRENT_FORMAT_VERSION = 1 as const` in `@gol/domain` — Task 4's `gol:schema` stamp needs it now, and Story 5.3's export envelope reuses the same constant (RFC-006 Decision 2). Single-sourcing it here avoids the later "two ones that must agree" problem.
  - [x] Re-export from `packages/domain/src/index.ts`. **Schema only** — no Settings UI, no theme application, no `data-theme` attribute (Stories 1.9 / 5.1 / 6.x).

- [x] **Task 3: Repository interfaces + `BattleSummary`** (AC: 1)
  - [x] `BattleSummary` (`{ id, name, gridSize, organismIds, updatedAt }` — Decision H.4) and its Zod projection schema go in **`@gol/domain`** beside `BattleSchema`, not in persistence: it needs `EditableGridPresetSchema` and the same ISO→`Date` timestamp transform, and duplicating that transform is how the two shapes drift. The **interfaces** live in `@gol/persistence` per AC1.
  - [x] `packages/persistence/src/repositories.ts` — interfaces only, no implementations:

    ```ts
    interface BattleRepository {
      save(battle: Battle): Promise<void>
      load(id: string): Promise<Battle | null>
      list(): Promise<BattleSummary[]>      // lightweight — Gallery + AR-15 usage index
      listFull(): Promise<Battle[]>         // WorkspaceSerializer export (Story 5.5)
      delete(id: string): Promise<void>
      exists(id: string): Promise<boolean>
      replaceAll(battles: Battle[]): Promise<void>
    }
    interface OrganismRepository { /* same CRUD, no listFull — no heavy field to omit */ }
    interface SettingsRepository { load(): Promise<Settings>; save(s: Settings): Promise<void> }
    interface AppRepositories {
      battles: BattleRepository; organisms: OrganismRepository; settings: SettingsRepository
      clearAll(): Promise<void>              // data-only — lives HERE, not on a repository (RFC-001)
    }
    ```

  - [x] **Every method is `Promise`-returning even though localStorage is synchronous.** This is the whole point of the seam (RFC-006 Decision 7: "the interface is async precisely so this swap requires no UI change"). A sync signature here silently welds every future caller to a synchronous store.
  - [x] `SettingsRepository.load()` returns `Settings`, **never `null`** — a fresh install has no record and falls back to `DEFAULT_SETTINGS` (RFC-006 Decision 7).

- [x] **Task 4: Storage primitives — keys, safe write, quota, schema stamp** (AC: 2, 3)
  - [x] `packages/persistence/src/storage.ts`. Keys exactly as RFC-006 Decision 7 (AR-9): `gol:schema`, `gol:battles`, `gol:organisms`, `gol:settings`. Export them as one frozen constant — no string literals scattered across repository files.
  - [x] **Candidate-string-then-`setItem` (AC3).** Build the complete next-state object, `JSON.stringify` it to a candidate string, then a single `setItem`. If `setItem` throws, the previous value is untouched because it was never mutated, and the operation reports failure. **Anti-patterns that violate AC3 and still appear to work:** `removeItem` before `setItem`; writing a placeholder/empty value first; mutating the parsed object and writing incrementally; any two-phase write to the same key.
  - [x] Export a **project-owned `QuotaExceededError`** (a `class extends Error` with a `name`) thrown after detecting the browser's. Detection must be defensive across NFR-2.1's four browsers — Chrome/Edge/Safari throw `DOMException` `name: 'QuotaExceededError'`/`code: 22`, Firefox has historically used `NS_ERROR_DOM_QUOTA_REACHED`/`code: 1014`. Match on name **or** code, never on message text. Rethrow anything unrecognized untouched.
  - [x] `gol:schema` stamp (AC2): written on the first successful write, holding `{ formatVersion: CURRENT_FORMAT_VERSION }`. **Stamp AFTER the data write succeeds, never before** — see the ordering trap in Dev Notes. Write it only when absent; do not rewrite on every save.
  - [x] Export a `CorruptDataError` for parse failures. **Do not branch on `formatVersion`** — reading and stamping is this story; the migration registry is Story 5.7 and `formatVersion` is the only version anything ever branches on (Decision I).

- [x] **Task 5: `LocalStorageBattleRepository`** (AC: 1, 2, 3)
  - [x] Storage shape is `gol:battles → Record<id, BattleRecord>` — **one key, the whole collection** (RFC-006 Decision 7). Do not invent per-battle keys (`gol:battles:<id>`) or a stored summary index; both contradict RFC-006, and a stored index also contradicts AR-15's "no stored structure".
  - [x] `save()`: read collection → set `battles[battle.id]` → candidate-string → `setItem`. `JSON.stringify` converts the `Date` fields to the exact ISO form `BattleSchema` accepts on the way back in, so no manual timestamp formatting is needed.
  - [x] `load(id)`: return `null` when the id is absent; run the **full `BattleSchema.parse`** and throw `CorruptDataError` when the record exists but fails. **Never collapse corrupt → `null`** (see traps).
  - [x] `list()`: parse each record through the **`BattleSummary` projection schema only** — no `BattleSchema.parse`, no dense→typed grid conversion, no thumbnail work. `listFull()` is the one that runs the full parse.
  - [x] `replaceAll(battles)`: replaces the whole `gol:battles` collection in a single write. Used by Story 5.8's atomic import.
  - [x] `gridState` stays **dense** at rest (`number[][]`, `0` = empty, `v` = `organismIds[v-1]`). Sparse `cells[]` is wire-only and belongs to Story 5.3's serializer — no dense↔sparse conversion in this story. The dense↔typed-array conversion belongs to Epic 3.

- [x] **Task 6: `LocalStorageOrganismRepository` + `LocalStorageSettingsRepository`** (AC: 1, 2)
  - [x] Organisms mirror the battle repository against `gol:organisms`, parsing with `OrganismSchema`. No `listFull` (nothing heavy to project away).
  - [x] **`OrganismRepository.delete()` is dumb CRUD.** Do **not** implement the FR-1.4 / M7 "blocked while referenced by any battle" guard here. That predicate is integrity logic, belongs in `@gol/domain` under the ≥90% gate, and lands with Epic 4 — project-context is explicit: "If you are testing that logic through a repository, it is in the wrong package." Same for Conway's Classic delete-protection (M9).
  - [x] Settings: single record under `gol:settings`; `load()` parses through `SettingsSchema` and falls back to `DEFAULT_SETTINGS` when the key is absent. A **partial** stored record (written by an older build) should also come back fully populated — that is what the per-field `.default()`s in Task 2 buy you.

- [x] **Task 7: `createLocalStorageRepositories()` + data-only `clearAll`** (AC: 1, 5)
  - [x] Assemble the `AppRepositories` object in `@gol/persistence`. `clearAll()` removes **only** `gol:battles` and `gol:organisms`.
  - [x] **`clearAll` must not be able to reach `gol:settings` — by construction, not by convention (AC5, Decision F.2).** Enumerate the two data keys explicitly. Do **not** iterate `Object.keys(localStorage)` and filter by a `gol:` prefix — that reads settings into the deletion path and makes AC5 one typo away from false.
  - [x] `clearAll()` also leaves `gol:schema` alone: it stamps the *format* of the store, which Clear All does not change. Re-seeding `DEFAULT_WORKSPACE` after Clear All is Story 1.5's helper, invoked by Story 5.10 — not here.

- [x] **Task 8: Repository factory in `apps/web`** (AC: 4)
  - [x] `apps/web/lib/repositoryFactory.ts` — **not** in `@gol/persistence`. The factory reads mode via `import { APP_MODE } from '@/lib/mode'` (project-context), and `@/*` resolves inside `apps/web` only. RFC-001's `repository.factory.ts` snippet is stale twice over: the dotted filename (camelCase-never-dotted wins) and its direct `process.env.NEXT_PUBLIC_MODE` read (`lib/mode.ts` is the single read-point — dynamic env access yields `undefined` in the browser bundle).
  - [x] `createRepositories(): AppRepositories` returns the localStorage set for `'standalone'`. Connected/`Api*` repositories are post-MVP — do not stub them; a `throw new Error('connected mode is post-MVP')` on the non-standalone branch is the honest MVP behaviour.
  - [x] **Wiring stops here.** No page consumes it yet — the Gallery is Story 1.10. Do not add a repository Context, a provider, a global singleton, or a module-level `const repositories = createRepositories()`. RFC-001's `AppContext`/`useAppContext` snippet is superseded by AR-27 (no global store; props from the page boundary). `apps/web` already declares `@gol/persistence` as a dependency — no package.json change needed.

- [x] **Task 9: Tests** (AC: 1–5)
  - [x] Round-trip: `save()` → `load()` returns an equal Battle, with `createdAt`/`updatedAt` back as real `Date`s. This is the regression test for the ISO-timestamp resolution Story 1.3's review made specifically for this story — assert `instanceof Date`, not just equality.
  - [x] `list()` returns summaries; assert the returned objects **have no `gridState` key**. Add a battle whose stored record is deliberately un-`BattleSchema`-parseable in a field the summary does not project, and assert `list()` still succeeds while `load()` throws — that is what proves the projection is genuinely lightweight rather than a full parse with fields deleted afterwards.
  - [x] **AC3 quota, both halves.** Force the throw by stubbing `setItem` (`vi.spyOn(Storage.prototype, 'setItem')`) to throw a `DOMException('', 'QuotaExceededError')`; a real 6 MB fill also works against jsdom if you prefer an unstubbed path. Assert **both**: the project's `QuotaExceededError` surfaces to the caller, **and** `getItem` still returns the byte-identical prior value. The second assertion is the one that actually tests "never truncated" — a test that only checks the throw passes against a `removeItem`-first implementation.
  - [x] Firefox-shaped quota error (`code: 1014` / `NS_ERROR_DOM_QUOTA_REACHED`) is also translated; a non-quota `setItem` failure propagates unchanged.
  - [x] AC5: seed all four keys, call `clearAll()`, assert `gol:battles` and `gol:organisms` are gone and `gol:settings` is **byte-identical**. Add the same assertion around `replaceAll()`.
  - [x] AC2: `gol:schema` absent before the first write, present with `formatVersion: 1` after; and a second write does not rewrite it. Plus the ordering trap: when the data write throws quota, assert `gol:schema` was **not** created.
  - [x] Settings: absent key → `DEFAULT_SETTINGS`; partial stored record → missing fields defaulted; round-trip.
  - [x] Factory: returns the localStorage implementations under `'standalone'`. Keep it a unit test in `apps/web` — no page rendering.
  - [x] Reset `localStorage` between tests (`afterEach`) — jsdom shares one store across a file, so a leaked key from an earlier test silently satisfies a later assertion.
  - [x] Fixtures are **inline**. `@gol/test-utils` canonical fixtures and the in-memory fake repositories that implement these interfaces are Story 1.6 — do not build them here, and do not hand-roll a fake repo that 1.6 will replace.

- [x] **Task 10: Correct RFC-001 §3's unimplementable load snippet** (deferred item, assigned to this story)
  - [x] `deferred-work.md` (from the 1.3 review) hands this story the call: RFC-001 §3 shows `BattleSchema.transform(...).parse(JSON.parse(raw))` to hydrate timestamps, which cannot work — a Zod transform runs *after* validation, so `z.date()` rejects the ISO string first. The code already resolved it (`z.iso.datetime().transform(...)`, matching RFC-006's spelling).
  - [x] Update RFC-001 §3's snippet to match the shipped schema and note the RFC-006 alignment, then strike the item from `deferred-work.md`. Per project-context, conflicts are propagated deliberately rather than silently patched — so if you disagree with the resolution, raise it instead of editing.

- [x] **Task 11: Verify** (AC: 1–5)
  - [x] `npm run typecheck`, `npm run lint`, `npm run test` green. Confirm `@gol/persistence` shows a real Vitest summary line, not "No test files found".
  - [x] `npm run ci` (typecheck → lint → format:check → test:coverage → build:standalone → bundle:check → e2e) — run it before calling the story done and report the **actual** result. Story 1.3 hit `format:check` and cross-package build failures only at this stage.

## Dev Notes

### Decisions this story is forced to make (flag them in the Dev Agent Record)

Three questions the specs leave open land on this story because the code cannot be written without an answer. Each has a recommended resolution; if you take a different one, say so rather than deciding silently.

1. **Concrete `SettingsSchema`** — RFC-006 Open Questions leave it unfinalized ("should be finalized here or in a small companion"). **Resolution: define it now in `@gol/domain`** (Task 2), minimal, one field per FR-8.6–8.12 with defaults. Deferring means `SettingsRepository` is typed `unknown`, which Story 1.9's theme read and Story 6.5's FOUC script cannot consume.
2. **Unknown-key posture at load** — `deferred-work.md` assigns the strict-vs-strip decision to "Story 1.4 (repository load) and Story 5.7/5.8". **Resolution: keep Zod's default strip, change no domain schema, and document the consequence** (a record written by a newer build loses its new fields when an older build re-saves it). Making schemas `.strict()` now would reject exactly the forward-compatible records the Story 5.7 migration chain exists to upgrade — the two must be decided together, and 5.7 owns the chain.
3. **Corrupt vs missing at `load()`** — no spec states it. **Resolution: `null` means absent, a typed `CorruptDataError` means present-but-invalid.** Story 5.11 (Load-Time Corruption Handling) builds the user-facing behaviour on top; this story only has to keep the two distinguishable.

### Silent-failure traps — the intuitive implementation is wrong

- ⚠️ **Stamp `gol:schema` AFTER the data write succeeds.** Stamping first, then failing the data write on quota, leaves a stamped-but-empty store — and Story 1.5 seeds `DEFAULT_WORKSPACE` precisely "when no `gol:schema` record exists" (RFC-006 Decision 7). The user then has no Conway's Classic and no error. localStorage has no multi-key transaction; the reverse failure (data written, stamp write fails) is the recoverable one, because the next load simply re-stamps.
- ⚠️ **Corrupt must not return `null`.** `load()` collapsing a parse failure into `null` reads as "no such battle" to every caller. The Battle Editor then treats it as a new battle and the next `save()` overwrites a record that was merely unparseable — the same data loss AC3 forbids on the quota path, arriving through the parse path instead.
- ⚠️ **"Without deserializing any grid" (AC1) is a bound on the *work*, not on `JSON.parse`.** With `gol:battles` as one collection key, `JSON.parse` unavoidably materialises every `gridState` array. What AC1/Decision H.4 buy is that `list()` runs no `BattleSchema.parse`, no dense→typed-array conversion, and no thumbnail render. Do not "fix" this by splitting into per-battle keys or caching a summary index — both contradict RFC-006 Decision 7 and AR-15. Say so in the Dev Agent Record rather than claiming a guarantee the storage shape cannot give.
- ⚠️ **Classes are correct here.** project-context's "❌ No classes in the engine" scopes to `packages/simulation` and the rules layer. RFC-001 specifies `class LocalStorageBattleRepository implements BattleRepository` — persistence is the one place classes are the designed shape.
- ⚠️ **`lib` replaces, it does not extend.** `"lib": ["DOM"]` alone in the persistence tsconfig silently drops ES2022 and breaks unrelated code. Write both entries.
- ⚠️ **`BattleSchema`'s parse input is the JSON shape, its output carries `Date`s.** `Battle` (`z.infer`) has `Date`; the at-rest record is `z.input<typeof BattleSchema>` with ISO strings. Type the storage record with `z.input<...>`, and let `JSON.stringify` do the `Date`→ISO conversion on save — it produces exactly the `Z`-suffixed form `z.iso.datetime()` accepts.

### Performance note — do not pre-optimise

Every `save()` re-reads, re-parses, and re-writes the whole collection: at NFR-7.2's soft ceiling (~50 battles × ≤24 KB) that is ~1.2 MB of JSON per write, which may not meet NFR-1.4's <10 ms p95. This is inherent to RFC-006's one-key-per-collection shape and is **accepted for this story**. The storage meter (Story 5.2) and the perf harness (Story 3.7) are where it gets measured. Do not restructure the key layout to chase it; if you observe it, record the number in the Dev Agent Record.

### Previous story intelligence (1.1–1.3)

- **`@gol/persistence` currently holds a placeholder** (`GOL_PERSISTENCE`, `PERSISTENCE_DEPENDS_ON = BattleSchema`) whose comment names this story. Story 1.3's lesson: removing a placeholder that other packages import breaks their builds — here the direction is inbound only (`apps/web` depends on `@gol/persistence`, and its `page.tsx` imports `@gol/domain`, not persistence), so removal is safe. Verify with `npm run build:standalone` anyway, which is where Story 1.3's equivalent breakage surfaced.
- **The `BattleSchema` you are parsing with was hardened by the 1.3 review**, not just ported: timestamps hydrate from ISO, `organismIds` rejects duplicates and empty strings, `colorToken` rejects raw hex, `superRefine` issues carry a `path`. Read `packages/domain/src/battleSchema.ts` before writing the load path — the four structural invariants are what a corrupt record will trip.
- **JIT source packages, no build step.** `@gol/*` export `./src/index.ts` directly; `apps/web` compiles them via `transpilePackages`. No `dist/`, no emit. `typecheck`/`test` turbo tasks deliberately carry no `^build` — don't reintroduce one.
- **Comment convention:** every non-obvious line carries a WHY naming the failure it prevents, citing the governing id (`(AR-14)`, `(Decision F.2)`, `(RFC-006 Decision 7)`). Established across 1.1–1.3; the tsconfig `lib` line and the `clearAll` key enumeration both need one.
- **Coverage gate is not live yet** (flips Story 3.7; `@gol/persistence` targets ~80%). Write tests for the invariants, not for a number.
- **Commit gate stands:** present the file list and a suggested message, then wait for Sidiar. Approval never carries between commits.

### What NOT to build (scope boundaries)

- ❌ **Seeding** — `DEFAULT_WORKSPACE`, `ensureDefaultOrganism()`, Conway's Classic (Story 1.5). This story stamps `gol:schema`; it does not populate anything.
- ❌ **`@gol/test-utils` fixtures / in-memory fake repositories** (Story 1.6) — even though they implement these interfaces.
- ❌ **`WorkspaceSerializer`, export envelope, dense↔sparse conversion, referenced-organism closure** (Stories 5.3–5.6).
- ❌ **Migration registry, `formatVersion` branching, corruption UI** (Stories 5.7, 5.11). Stamp and read only.
- ❌ **Storage meter / `navigator.storage.estimate()`** (FR-8.2, Story 5.2). Quota *handling* is in scope; quota *reporting* is not.
- ❌ **Auto-save / debounce** (FR-8.11, RFC-006 Decision 8) — the settings flag exists as data; nothing consumes it.
- ❌ **Referential-integrity guards** — organism delete-block (M7), Conway's Classic protection (M9), usage index (AR-15). Domain logic, Epic 4.
- ❌ **Settings UI, theme application, `data-theme`, FOUC script** (Stories 1.9, 5.1, 6.x).
- ❌ **`Api*` repositories / connected mode** — post-MVP (RFC-006 Decision 9).
- ❌ **Repository Context / provider / global singleton** — AR-27 forbids it; props from the page boundary.

### Project Structure Notes

```
packages/domain/src/
  settingsSchema.ts        SettingsSchema, DEFAULT_SETTINGS, CURRENT_FORMAT_VERSION   [new]
  battleSchema.ts          + BattleSummarySchema / BattleSummary                       [modified]
  index.ts                 + re-exports                                                [modified]

packages/persistence/src/
  repositories.ts          BattleRepository, OrganismRepository, SettingsRepository,
                           AppRepositories — interfaces only
  storage.ts               STORAGE_KEYS, safe read/write, QuotaExceededError,
                           CorruptDataError, schema stamp
  localStorageBattleRepository.ts
  localStorageOrganismRepository.ts
  localStorageSettingsRepository.ts
  createLocalStorageRepositories.ts   AppRepositories assembly + data-only clearAll
  index.ts                 re-exports (replaces the placeholder)

apps/web/lib/
  repositoryFactory.ts     createRepositories() — reads APP_MODE                       [new]
```

Test files co-located as `*.test.ts` (the pattern 1.2/1.3 established — this repo has never used a `__tests__` folder). The exact file split within `packages/persistence/src/` is a judgment call; the **names must be camelCase, never dotted**, and the interfaces must be importable without pulling in a concrete implementation.

### References

- [Source: docs/planning-artifacts/epics.md#Story 1.4] — story statement + the five ACs
- [Source: docs/planning-artifacts/epics.md#Additional Requirements] — AR-6 (repository pattern + DI, `BattleSummary`, bulk methods), AR-9 (key namespace, dense at rest), AR-11 (single migration registry — stamps only here), AR-12 (settings device-local), AR-14 (quota strategy), AR-15 (usage index from summaries, no stored structure), AR-27 (no global store, props at page boundary), AR-39 (~80% persistence coverage)
- [Source: docs/planning-artifacts/rfcs/RFC-001-multi-mode-architecture.md#1. Persistence Abstraction Pattern] — `BattleRepository` method list, `BattleSummary` fields, `AppRepositories`, `clearAll` scope comment, `class LocalStorage*Repository`. **§3's Battle load snippet is unimplementable — Task 10 corrects it.**
- [Source: docs/planning-artifacts/rfcs/RFC-001-multi-mode-architecture.md#2. Implementation Switching Strategy] — factory pattern; its `process.env` read and `AppContext` snippets are stale (project-context / AR-27 win)
- [Source: docs/planning-artifacts/rfcs/RFC-006-persistence-workspace-schema.md#Decision 1] — `AppRepositories` vs the `Workspace` aggregate; `SettingsRepository` is the renamed RFC-001 `WorkspaceRepository`
- [Source: docs/planning-artifacts/rfcs/RFC-006-persistence-workspace-schema.md#Decision 6] — settings never travel; `clearAll()` data-only
- [Source: docs/planning-artifacts/rfcs/RFC-006-persistence-workspace-schema.md#Decision 7] — the four keys, candidate-string-then-`setItem`, quota-exceeded messaging, async-for-IndexedDB rationale, seeding trigger (`no gol:schema record`)
- [Source: docs/planning-artifacts/rfcs/RFC-006-persistence-workspace-schema.md#Open Questions] — `SettingsSchema` unfinalized (closed by Task 2)
- [Source: docs/planning-artifacts/architecture.md#Decision F] — F.2 `clearAll()` data-only, by construction
- [Source: docs/planning-artifacts/architecture.md#Decision G] — G.2/G.3 the structural invariants a corrupt record trips at load
- [Source: docs/planning-artifacts/architecture.md#Decision H] — H.1 `organismIds` ≡ placed set; **H.4 `BattleSummary` fields**
- [Source: docs/planning-artifacts/architecture.md#Decision I] — I.3/I.4 stamps are asserted, never branched on
- [Source: docs/project-context.md#Framework-Specific Rules] — repositories injected never imported (AR-2/27); `APP_MODE` single read-point; no global store
- [Source: docs/project-context.md#Language-Specific Rules] — `packages/persistence` adds `"lib": ["ES2022", "DOM"]` to its **own** tsconfig; camelCase-never-dotted filenames; Zod parses at boundaries
- [Source: docs/implementation-artifacts/1-3-domain-entities-zod-schemas.md] — ISO-timestamp resolution and its two regression tests; placeholder-removal fallout
- [Source: docs/implementation-artifacts/deferred-work.md] — `@gol/persistence` DOM lib (Task 1); RFC-001 §3 snippet correction (Task 10); strict-vs-strip posture (Decision 2 above)

## Dev Agent Record

### Agent Model Used

Claude Opus 5 (claude-opus-5) via Claude Code

### Debug Log References

All commands from repo root, Node 24.16.0 / npm 11.13.0, 2026-08-03:

- **`npm install jsdom@^30.0.1 --save-dev -w @gol/persistence`** — already hoisted at the root via `apps/web`, so this only added the declaration.
- **Red phase confirmed per module** — `settingsSchema.test.ts`, `battleSchema.test.ts` (summary block), `storage.test.ts` each run and fail before their implementation existed (module-not-found, then 6 failing summary assertions).
- **`npx vitest run --root packages/persistence`** → 5 files, 60 tests. `@gol/persistence` no longer runs under `passWithNoTests` (real Vitest summary line).
- **`npm run ci` — first run FAILED at `lint`:** two `@typescript-eslint/no-unused-vars` errors — a leftover `DEFAULT_SETTINGS` import in `localStorageSettingsRepository.ts` (residue of a re-export removed during refactor) and an unused `_name` binding from a destructuring-rest in `battleSchema.test.ts`. Both fixed.
- **Second run FAILED at `format:check`** on `localStorageSettingsRepository.ts` and `storage.test.ts` → `npx prettier --write`, clean after.
- **Third run FAILED at `build:standalone`:** `@gol/test-utils` — `error TS2305: Module '"@gol/persistence"' has no exported member 'GOL_PERSISTENCE'`. Removing the persistence placeholder broke `packages/test-utils/src/index.ts`, which imported it as its Story 1.1 workspace-graph proof. **The story's Dev Notes predicted this class of breakage but assessed the direction as inbound-only and therefore safe — that assessment was wrong**, and only the full-gate build caught it. Repointed onto `STORAGE_KEYS` rather than dropped, per the Story 1.3 review precedent (dropping leaves the dependency declared in `package.json` but never compiled). That run also took 17m29s on a cold Next build; a warm `npm run build` afterwards was 4.4s.
- **Mutation check on the AC3 tests** — temporarily inserted `localStorage.removeItem(key)` before the `setItem` in `writeKey` (the classic "never truncated" violation that still throws the correct error). Exactly 3 tests failed, all three being the "leaves the previous value intact" assertions, and nothing else. Source restored and re-verified at 60/60 before the final gate. **A background `npm run ci` was running concurrently with this mutation, so that run's result was discarded rather than reported; the gate was re-run on clean source.**
- **`npm run ci` (final, clean source): exit 0** — typecheck 5/5, lint clean, format clean, coverage (domain 77, persistence 60, web 6 = 143 tests), `build:standalone`, bundle 180.9 KB gzip vs 300 KB budget, Playwright e2e 8/8 across Chromium/Firefox/WebKit/tablet.
- **`@gol/persistence` coverage:** 98.16% stmts / 88.88% branch / 100% funcs / 98.94% lines — comfortably above AR-39's ~80% target for this package (the gate itself still flips in Story 3.7).

### Completion Notes List

- **Three forced decisions resolved as the story recommended**, all three flagged here rather than taken silently:
  1. `SettingsSchema` + `DEFAULT_SETTINGS` defined in `@gol/domain` (closes an RFC-006 Open Question), one field per FR-8.6–8.12 with a `.default()` each so `parse({})` yields a complete record.
  2. Unknown-key posture left at Zod's default **strip**; no domain schema changed. Recorded in `deferred-work.md` as now resting wholly with Stories 5.7/5.8.
  3. `load()` returns `null` only for absent; present-but-invalid throws `CorruptDataError`.
- **A fourth decision surfaced during implementation and is NOT in the story — please review it.** A **settings write must not stamp `gol:schema`**. AC2 says the stamp lands "on the very first write", but settings are device-local, not workspace data (Decision F). Had settings writes stamped it, a user who changed the theme before creating anything would leave a stamped-but-empty store, and Story 1.5 seeds `DEFAULT_WORKSPACE` *only when `gol:schema` is absent* — so they would silently get no Conway's Classic. Implemented as two distinct write paths (`writeDataKey` stamps, `writeSettingsKey` does not), each with a test.
- **Stamp ordering is data-then-stamp**, per the story's trap note, with a test asserting the stamp is *not* created when the data write fails on quota.
- **AC3 is tested on both halves** — that the project's `QuotaExceededError` surfaces, *and* that `getItem` still returns the byte-identical prior value. The mutation check above confirms the second assertion is what carries the guarantee.
- **`list()`'s "no grid deserialization" is honest about its limit.** With `gol:battles` as one collection key, `JSON.parse` unavoidably materialises every `gridState`; what the projection avoids is the `BattleSchema` parse, the dense→typed conversion, and any thumbnail work. The test that pins this lists a battle whose `gridState` is `'not-a-grid'` while `load()` rejects the same record — a full-parse-then-delete implementation fails it. Key layout was left exactly as RFC-006 Decision 7 specifies.
- **Settings corruption throws rather than silently reverting to defaults**, consistent with the other repositories. App boot does not depend on it: the FOUC script reads the theme with its own defensive parse (Decision J.3), and Story 5.11 owns user-facing corruption behaviour. Flagging in case review prefers a silent fallback.
- **Scope held.** No seeding, no serializer/envelope, no migration or `formatVersion` branching, no storage meter, no auto-save, no referential-integrity guards, no settings UI, no `Api*` repositories, no Context/provider/singleton. The organism repository has an explicit test asserting `delete()` is unconditional, so the M7 guard cannot be added here unnoticed.
- **Factory wiring stops at the factory**, as scoped — no page consumes it yet (Gallery is Story 1.10), so the bundle is unchanged at 180.9 KB. A test asserts constructing repositories touches neither `getItem` nor `setItem`, which is what makes the module safe to import from a statically exported route.
- **RFC-001 §3 corrected (Task 10)** — and it had three defects, not the one `deferred-work.md` named: the unimplementable `z.date()` + `.transform().parse()` pair, a per-battle `battle-${id}` key contradicting RFC-006 Decision 7's single collection key, and a `save()` that re-parsed an in-memory `Battle` whose `Date` fields the input schema rejects. `z.string().uuid()` was also updated to `z.uuid()` to match the Zod v4 deprecation already applied in code. Both `deferred-work.md` entries assigned to this story are struck.

### File List

New:

- packages/domain/src/settingsSchema.ts
- packages/domain/src/settingsSchema.test.ts
- packages/persistence/src/repositories.ts
- packages/persistence/src/storage.ts
- packages/persistence/src/storage.test.ts
- packages/persistence/src/localStorageBattleRepository.ts
- packages/persistence/src/localStorageBattleRepository.test.ts
- packages/persistence/src/localStorageOrganismRepository.ts
- packages/persistence/src/localStorageOrganismRepository.test.ts
- packages/persistence/src/localStorageSettingsRepository.ts
- packages/persistence/src/localStorageSettingsRepository.test.ts
- packages/persistence/src/createLocalStorageRepositories.ts
- packages/persistence/src/createLocalStorageRepositories.test.ts
- apps/web/lib/repositoryFactory.ts
- apps/web/lib/repositoryFactory.test.ts

Modified:

- packages/domain/src/battleSchema.ts (`BattleSummarySchema` / `BattleSummary` added)
- packages/domain/src/battleSchema.test.ts (summary projection tests)
- packages/domain/src/index.ts (settings + summary re-exports)
- packages/persistence/package.json (`jsdom` devDependency)
- packages/persistence/tsconfig.json (`"lib": ["ES2022", "DOM"]`)
- packages/persistence/vitest.config.ts (jsdom environment; `passWithNoTests` removed)
- packages/persistence/src/index.ts (placeholder replaced with real exports)
- packages/test-utils/src/index.ts (workspace-graph proof repointed off the removed `GOL_PERSISTENCE` placeholder onto `STORAGE_KEYS`)
- package-lock.json
- docs/planning-artifacts/rfcs/RFC-001-multi-mode-architecture.md (§3 schema + repository snippet corrected)
- docs/implementation-artifacts/deferred-work.md (two items resolved, strict-vs-strip decision recorded)
- docs/implementation-artifacts/sprint-status.yaml (status transitions)
- docs/implementation-artifacts/1-4-repository-interfaces-localstorage-implementations.md (this story — tracking)

## Change Log

- 2026-08-03: Story 1.4 implemented — repository interfaces (`BattleRepository`/`OrganismRepository`/`SettingsRepository`/`AppRepositories`, all async) and their localStorage implementations behind the `gol:*` key namespace, with candidate-string-then-`setItem` quota safety, a cross-browser `QuotaExceededError` translation, `CorruptDataError` distinguishing present-but-invalid from absent, a `gol:schema` stamp written after the data write it accompanies, a data-only `clearAll` that enumerates its two keys so `gol:settings` is unreachable, and the `BattleSummary` projection that keeps `list()` off the grid. `SettingsSchema`/`DEFAULT_SETTINGS`/`CURRENT_FORMAT_VERSION` added to `@gol/domain` (closes an RFC-006 open question); mode selection added as `apps/web/lib/repositoryFactory.ts`. 80 new tests (143 total); persistence at 98.16% stmts. Two `deferred-work.md` items closed, including a three-defect correction to RFC-001 §3. Verified: `npm run ci` exit 0. Status → review.
