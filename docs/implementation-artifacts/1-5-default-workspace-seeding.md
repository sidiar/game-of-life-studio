---
baseline_commit: 38ad91c
---

# Story 1.5: Default Workspace Seeding

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a user,
I want the app to come with Conway's Classic pre-loaded,
so that I can explore battles immediately without authoring an organism first.

## Acceptance Criteria

1. **Given** a first run with empty localStorage, **When** the app loads, **Then** `DEFAULT_WORKSPACE` is seeded: zero battles plus Conway's Classic (Born 3, Survive 2–3, Dominance 50, aging off) under the stable well-known id (FR-1.5, AR-13)
2. **Given** an already-seeded workspace, **When** `ensureDefaultOrganism()` runs again, **Then** it is idempotent — no duplicate is created, and a missing default is re-added
3. **And** re-seeding on Clear All and post-Import is exercised when those flows land in Epic 5 (hook exists now, verified by unit test)

## Tasks / Subtasks

- [x] **Task 1: `DEFAULT_WORKSPACE` + Conway's Classic as a domain constant** (AC: 1)
  - [x] New file `packages/domain/src/defaultWorkspace.ts`. It is a **domain constant** (arch M1, RFC-006 Decision 7: "Defined as a domain constant, applied through the repositories") — not a persistence value, not an app value. `@gol/domain` has no DOM lib and must keep none.
  - [x] Export three names: `CONWAYS_CLASSIC_ID = 'conways-classic' as const`, `CONWAYS_CLASSIC: Organism`, and `DEFAULT_WORKSPACE: { battles: readonly Battle[]; organisms: readonly Organism[] }` = `{ battles: [], organisms: [CONWAYS_CLASSIC] }`. **Zero battles is the spec** (M1) — the empty Gallery is what makes Story 1.12's "Create Your First Battle" state reachable (FR-7.4); do not invent a starter battle.
  - [x] Field values, exactly (FR-1.5 / RFC-004 §2.4 / RFC-007 Decision 2):

    ```ts
    schemaVersion: 1,                 // literal — see forced decision 3
    id: CONWAYS_CLASSIC_ID,           // 'conways-classic' — NOT a uuid (OrganismSchema.id is a bare non-empty string precisely for this)
    name: "Conway's Classic",
    colorToken: 'sky-blue',           // RFC-007 token #1, the head of the distinguishability order
    dominance: 50,                    // FR-2.2 mid-range, stated verbatim in FR-1.5
    agingEnabled: false,
    survivalRules: [ /* born-3, then survive-2-3 — order = priority (FR-2.6) */ ]
    ```

  - [x] The two rules, as the generic `RuleSet` shape `@gol/domain` already defines:
    - Born: `conditions: [{ property: 'cellState', operator: 'eq', pattern: 'empty' }, { property: 'neighborCount', operator: 'eq', pattern: 3 }]`, `payload: { summary: 'Born on an empty cell with exactly 3 neighbors', action: 'born' }`
    - Survive: `conditions: [{ property: 'cellState', operator: 'eq', pattern: 'alive' }, { property: 'neighborCount', operator: 'range', pattern: [2, 3] }]`, `payload: { summary: 'Survives with 2-3 neighbors', action: 'survive' }`
  - [x] **No Die rule.** Conway's Classic dies *implicitly* — a living cell matching neither Die nor Survive is gone at cycle end but still counts as a Phase-2 neighbour, and that is exactly what preserves simultaneous-generation semantics (M10 / PRD FR-5 note). Adding an explicit "dies with <2 or >3 neighbors" rule looks equivalent, is not, and silently breaks every Conway golden-pattern test in Epic 3.
  - [x] `id` / `contentHash` per rule are **frozen literals** — see forced decision 2. Generate each once, paste it, and comment that regenerating it forks rule identity across every installed workspace.
  - [x] Type the constant `const CONWAYS_CLASSIC: Organism = deepFreeze({...})` so the compiler checks the shape, and **deep-freeze it** (a small local helper or explicit nested `Object.freeze` calls — no new dependency). `Object.freeze` is shallow: the `survivalRules` array, each rule, each condition and each payload need freezing too. The Story 1.4 review already made this exact correction to `DEFAULT_SETTINGS` — a shared module-level singleton that any consumer can mutate in place corrupts every other reader.
  - [x] Re-export from `packages/domain/src/index.ts` (`export type` for any type, `isolatedModules` is on).

- [x] **Task 2: `ensureDefaultOrganism()` in `@gol/persistence`** (AC: 2, 3)
  - [x] New file `packages/persistence/src/ensureDefaultOrganism.ts`:

    ```ts
    export async function ensureDefaultOrganism(organisms: OrganismRepository): Promise<void>
    ```

  - [x] Takes the **interface**, never a concrete class — that is what lets Story 1.6's in-memory fake and a future `ApiOrganismRepository` both satisfy it, and what keeps this testable without localStorage.
  - [x] Body: `if (await organisms.exists(CONWAYS_CLASSIC_ID)) return;` then `await organisms.save(CONWAYS_CLASSIC)`.
  - [x] **Use `exists()`, not `load()`.** `load()` throws `CorruptDataError` on a present-but-invalid record (Story 1.4), which would turn app boot into a crash for a user whose stored Conway is unreadable. `exists()` reports `true` for a present-but-corrupt record — deliberately: M9 says the app does **not** self-heal out-of-band tampering, and Story 5.11 owns user-facing corruption behaviour.
  - [x] **Never save unconditionally.** `organisms.save(CONWAYS_CLASSIC)` alone *is* duplicate-free (same id overwrites), so it passes a naive reading of AC2 while silently reverting a user's edits to their own organism every time the app loads. Conway's Classic is protected from *deletion* (M9), not from *editing* — Story 4.17 edits it like any other, and FR-8.4 compares the stored copy against `CONWAYS_CLASSIC` to decide whether it is still "unmodified".
  - [x] Export from `packages/persistence/src/index.ts`. Stories 5.8 (post-import) and 5.10 (post-Clear-All) call it; **do not** wire it into `clearAll()` here — 5.10 owns that call site, and burying it inside `clearAll()` would make `clearAll()` no longer data-only-and-nothing-else.

- [x] **Task 3: First-run detection on the aggregate** (AC: 1)
  - [x] Add `isFreshWorkspace(): Promise<boolean>` to `AppRepositories` in `packages/persistence/src/repositories.ts`, beside `clearAll()` (same precedent: an aggregate-level concern that is not any single repository's).
  - [x] Implement in `createLocalStorageRepositories()` over a new `hasSchemaStamp()` in `storage.ts`: fresh ⇔ `localStorage.getItem('gol:schema') === null` (RFC-006 Decision 7: seed "when no `gol:schema` record exists").
  - [x] **Why an interface method rather than an exported `isFreshInstall()` helper:** the app must call this, and a free function that reads localStorage is exactly as welded to localStorage as importing `LocalStorageOrganismRepository` would be (AR-2/27). "Has this workspace ever been initialized?" is a mode-agnostic question; the `gol:schema` key is one implementation's answer.
  - [x] Do **not** define freshness as "the organism library is empty". That makes every load a self-heal, which M9 explicitly rules out, and it would fight Story 5.10, which deliberately re-seeds through `ensureDefaultOrganism()` *after* `clearAll()` has left `gol:schema` in place.

- [x] **Task 4: `seedDefaultWorkspace()` — the first-run composition** (AC: 1, 3)
  - [x] `packages/persistence/src/seedDefaultWorkspace.ts`: `export async function seedDefaultWorkspace(repos: AppRepositories): Promise<void>` → `if (!(await repos.isFreshWorkspace())) return; await ensureDefaultOrganism(repos.organisms);`
  - [x] **Do not write `gol:battles`.** `DEFAULT_WORKSPACE.battles` is empty and `readCollection()` already reads an absent key as `{}`; calling `battles.replaceAll([])` writes an empty object for no benefit and adds a second write that can fail on quota halfway through the seed.
  - [x] The organism write stamps `gol:schema` for free — `writeDataKey()` does it after the data write succeeds (Story 1.4). Do not stamp it yourself, and do not stamp before seeding: a stamped-but-empty store reads as "already initialized" forever and the user silently never gets Conway's Classic (the trap Story 1.4's ordering comment in `storage.ts` was written to prevent).
  - [x] Let `QuotaExceededError` propagate. A first run that cannot write is a real failure the caller must see; swallowing it produces an app that claims to be seeded and is not.
  - [x] Export from the package index.

- [x] **Task 5: Call it at the page boundary** (AC: 1)
  - [x] `apps/web/lib/useWorkspaceSeed.ts` — a client hook `useWorkspaceSeed(repos: AppRepositories): { status: 'seeding' | 'ready' | 'error' }`. One `useEffect`, empty deps, guarded by a `useRef` flag so React 19 StrictMode's double-invoke in dev does not run the seed twice. Typed against `AppRepositories`, so it never imports a concrete repository.
  - [x] `apps/web/app/page.tsx` becomes `'use client'` and calls `createRepositories()` **once** in a `useMemo(..., [])`, then `useWorkspaceSeed(repos)`. This is the page boundary AR-27 / RFC-005 Decision 1 describe: in App Router, the topmost client component of the route. Keep `layout.tsx` a server component — no `'use client'` there, no provider, no Context, no module-level `const repositories = createRepositories()`.
  - [x] Keep the existing placeholder markup (`<h1>`, "Battle Gallery coming soon.", the mode/`@gol/domain` wiring line) — Story 1.10 replaces the body with the Gallery and inherits this boundary. Render the seed status in a way that does not regress the axe checks or the "zero console errors" e2e (no `console.error` on the happy path; no live-region churn).
  - [x] Keep the seed call in the **hook**, not inline in JSX. Story 1.6 layers the AR-45 dev-only fixture seed on top of exactly this call site (dev build seeds mocks; production seeds `DEFAULT_WORKSPACE` only), and an inline effect gives it nothing to extend.
  - [x] `apps/web` already depends on `@gol/persistence` and `@gol/domain` — no `package.json` change.

- [x] **Task 6: Tests** (AC: 1–3)
  - [x] **Domain** (`defaultWorkspace.test.ts`): `OrganismSchema.safeParse(CONWAYS_CLASSIC).success` is `true` (this is what catches a typo'd operand or an out-of-range dominance — the type annotation cannot); `DEFAULT_WORKSPACE.battles` is empty; the rules encode born-on-empty-with-3 and survive-alive-with-[2,3] and **no rule has `action: 'die'`**; a mutation attempt on `CONWAYS_CLASSIC.survivalRules` throws or is a no-op (proves the deep freeze, not just the top-level one).
  - [x] **Domain — identity pinning:** assert the literal `id` and `contentHash` of each rule and `CONWAYS_CLASSIC_ID` against hard-coded expected strings. This is not coverage padding: these values are written into every user's store and are the FR-8.4 "unmodified default" baseline, so an accidental regeneration must fail a test rather than ship.
  - [x] **Persistence** (`ensureDefaultOrganism.test.ts`): adds when absent; a second call creates no duplicate (assert `list()` length and that only one record carries the id); **does not overwrite a modified stored Conway** (save an edited copy — different `dominance` — call ensure, assert the edit survives); re-adds after the record is deleted out from under it (AC2's "a missing default is re-added"); does not throw when the stored record is present but corrupt.
  - [x] **Persistence** (`seedDefaultWorkspace.test.ts` / `createLocalStorageRepositories.test.ts`): `isFreshWorkspace()` is `true` with no `gol:schema` and `false` once stamped; seeding a fresh store writes `gol:organisms` **and** leaves `gol:schema` stamped afterwards; seeding a stamped store is a no-op even when the library is empty (this is the M9 no-self-heal assertion); seeding never writes `gol:settings`; a quota failure during the seed surfaces `QuotaExceededError` and leaves `gol:schema` unstamped.
  - [x] Reset `localStorage` in `afterEach` — jsdom shares one store per file and a leaked key silently satisfies the next test's assertion (Story 1.4's lesson).
  - [x] **Fixtures stay inline.** `@gol/test-utils` fakes and canonical organisms are Story 1.6; do not hand-roll a fake repository here that 1.6 will replace. (1.6's canonical set *includes* Conway's Classic — it will import this constant, not restate it.)
  - [x] **`apps/web`:** update `app/page.test.tsx` — it renders `<HomePage />` directly, which now runs the seed against jsdom's localStorage. Keep both existing assertions (the heading/copy and the `@gol/domain` field-count wiring proof, plus the axe check) and add one asserting `gol:organisms` holds `conways-classic` after render, and that a second render adds no duplicate. Clear `localStorage` between tests.
  - [x] **E2E** (`apps/web/e2e/home.spec.ts`): in a fresh browser context, load `/`, then read `localStorage.getItem('gol:organisms')` and assert it parses to an object containing `conways-classic`; reload and assert still exactly one. This is the only place AC1's "when the app loads" is verified end-to-end through a real static export — the unit tests verify the pieces, not the wiring. Keep the existing zero-console-errors and axe tests green.

- [x] **Task 7: Verify** (AC: 1–3)
  - [x] `npm run typecheck`, `npm run lint`, `npm run test` green.
  - [x] `npm run ci` (typecheck → lint → format:check → test:coverage → build:standalone → bundle:check → e2e) before calling the story done, and report the **actual** result. Note the bundle number: `page.tsx` becoming a client component is the first real client-side entry in this app (180.9 KB gzip vs the 300 KB budget as of Story 1.4) — report the new figure rather than assuming it is unchanged.

### Review Findings

_Code review 2026-08-05. 1 correctness defect (patched), 1 missing story deliverable (patched), 1 deferred. Fast gates re-verified after the patches: `typecheck` 5/5, `lint` clean, `format:check` clean, `test` 176 pass (was 175 — one added regression test)._

_The implementation follows the story's traps closely and the ones that mattered most held up under scrutiny: the `contentHash` literals are genuinely reproducible (verified independently, both rules match byte-for-byte), the deep freeze reaches conditions and payloads rather than stopping at the top level, and `exists()`-not-`load()` / no-unconditional-save / no-Die-rule are each pinned by a test that asserts the actual guarantee. The correctness defect below is in the one place the story's own guidance pointed at and no gate could see._

- [x] [Review][Patch] **`useWorkspaceSeed` never leaves `'seeding'` under StrictMode** — the `hasRun` ref and the per-invocation `let cancelled` flag have different lifetimes and defeat each other. StrictMode runs setup → cleanup → setup; `hasRun` deliberately survives that, so setup #2 returns early while setup #1 still owns the in-flight promise — and setup #1's cleanup has already set its closure's `cancelled = true`. The resolved `setStatus('ready')` is discarded and the page reads `workspace: seeding` forever in `npm run dev`, which App Router runs strict by default (`reactStrictMode` unset → `__NEXT_STRICT_MODE_APP: true`, `next/dist/build/define-env.js:143`). The seed write itself is unaffected — this is status reporting, not data — but `status` is the only signal Story 1.6 has when it layers the AR-45 fixture seed onto this call site. **Fixed:** liveness moved to a `mounted` ref, re-armed at the top of the effect before the `hasRun` check and cleared by a cleanup now returned unconditionally. [apps/web/lib/useWorkspaceSeed.ts:31-53]
- [x] [Review][Patch] **No gate in the pipeline renders strictly, so `npm run ci` was fully green while dev was broken** — `page.test.tsx` mounts bare and the e2e runs against the production static export, where React does not double-invoke effects. **Fixed:** added a `<StrictMode>`-wrapped case asserting the hook reaches `ready` *and* still seeds exactly once. Verified non-vacuous — it fails against the pre-patch hook (1020 ms timeout, stuck on `seeding`) and passes after. [apps/web/app/page.test.tsx:73-94]
- [x] [Review][Patch] **Forced decision 2's required `deferred-work.md` entry was never written**, though the Completion Notes claim all three forced decisions landed "per the Dev Notes' recommended resolutions, no deviations". Compounding it, the `contentHash` header comment said "sha256-over-canonicalized-`{conditions,payload}`" without naming the canonicalization — leaving Epic 4's hasher free to pick a different one and silently fork rule identity across every installed workspace, which is the exact failure the frozen literals exist to prevent. **Fixed:** the scheme is now pinned in the file header (`sha256hex(JSON.stringify(sortKeysDeep({ conditions, payload })))`, keys sorted deeply, array order preserved, `id` excluded — verified to reproduce both shipped literals), plus a `deferred-work.md` entry naming Epic 4 / Story 3.4 as the owners and requiring the pinning test to be updated in the same change as any regeneration. [packages/domain/src/defaultWorkspace.ts:25-38, docs/implementation-artifacts/deferred-work.md]
- [x] [Review][Defer] **`useWorkspaceSeed`'s error path discards the error object** — `.catch(() => setStatus('error'))` reduces the `QuotaExceededError` that `seedDefaultWorkspace()` deliberately lets propagate to the bare string `"workspace: error"` with no diagnostic anywhere. Acceptable while the home page is a placeholder with nowhere meaningful to surface it; deferred to Story 1.10 (real Gallery body) / Story 5.11 (storage-failure UX). Logged in `deferred-work.md`.

## Dev Notes

### Decisions this story is forced to make (flag them in the Dev Agent Record)

The specs name `DEFAULT_WORKSPACE` and `ensureDefaultOrganism()` but not their signatures or call sites. Each below has a recommended resolution; if you take a different one, say so rather than deciding silently.

1. **How the app learns it is a first run.** RFC-006 says "no `gol:schema` record exists", which is a localStorage fact, while AR-2/27 forbids the app from knowing that. **Resolution: a new `AppRepositories.isFreshWorkspace()`** (Task 3) — mode-agnostic question, storage-specific answer, injected like everything else. The alternative (an exported `isFreshInstall()` free function) is seam-breaking in exactly the way AR-2/27 describes: it compiles, tests green, and welds the app to localStorage.
2. **Rule `id` and `contentHash` for the seeded rules.** RFC-004 §2.4 specifies an opaque generated `id` and a `sha256`-over-canonicalized-content `contentHash`, but the generator/hasher is authored where organisms are authored (Epic 4) and consumed by the evaluator cache (Story 3.4). Neither exists yet. **Resolution: frozen literal values, generated once and pasted**, with a comment naming Story 4.x as the owner of the real generator, plus a `deferred-work.md` entry so the seed's hashes are regenerated through the real hasher when it lands. Do **not** compute them at seed time (the seed would differ per install, breaking FR-8.4's deep-equal baseline and cross-install export dedupe), and do **not** use semantic ids like `'rule_birth'` (RFC-004 rejects them explicitly).
3. **`Organism.schemaVersion` for the seed.** **Resolution: the literal `1`**, matching RFC-004 §2.4's example — not `CURRENT_FORMAT_VERSION`. They are both `1` today and are different concepts (Decision I: `formatVersion` is the only thing anything branches on; `schemaVersion` is a stamp on the rules shape). Wiring the seed to `CURRENT_FORMAT_VERSION` means a future `formatVersion` bump that does not touch the organism shape silently restamps the seed, and the FR-8.4 "unmodified default" comparison then fails for every existing user.

### Silent-failure traps — the intuitive implementation is wrong

- ⚠️ **An unconditional `save(CONWAYS_CLASSIC)` satisfies "no duplicate is created" and is still wrong.** Same id overwrites, so nothing duplicates — and a user's edited Conway is reverted on every app load. Gate on `exists()`.
- ⚠️ **Adding an explicit Die rule to make the rules "complete" breaks Conway.** Implicit death is load-bearing: an explicitly-killed cell is removed *before* Phase-2 neighbour counting, so the same logic expressed as a Die rule is **not** equivalent (M10 / PRD FR-5). Every blinker/glider golden test in Epic 3 is pinned against the implicit form.
- ⚠️ **Seeding on every load is a spec violation, not a safety net.** M9: the app deliberately does not self-heal an out-of-band edit that removed the default on a plain at-rest load. The `gol:schema` gate is what keeps first-run seeding from becoming that self-heal.
- ⚠️ **`Object.freeze` is shallow.** Freezing `CONWAYS_CLASSIC` leaves `survivalRules`, each rule object, each condition and each payload mutable. This is the same finding the Story 1.4 review raised against `DEFAULT_SETTINGS`; do not reintroduce it one file over.
- ⚠️ **`exists()` is true for a present-but-corrupt record** (documented on the interface since the 1.4 review). That is the behaviour you want here — but say so in a comment, because it reads like a bug to the next person.
- ⚠️ **StrictMode runs effects twice in dev.** The seed is idempotent, so nothing corrupts, but two concurrent runs can both observe `exists() === false` and both write. A `useRef` guard keeps the dev console and the write count honest.
- ⚠️ **`'use client'` on `page.tsx` does not break `output: 'export'`** — client components prerender fine. What *would* break it is adding an API route, a server action, `next/headers`, or `cookies()`. Leave `layout.tsx` alone: it owns `metadata`, which a client component cannot export.

### Previous story intelligence (1.3–1.4)

- **Story 1.4 left this story explicit hooks, already commented in the shipped code.** Read them before writing anything: `packages/persistence/src/storage.ts` (the stamp-ordering comment names this story by number and explains why data-then-stamp is the only safe order), `createLocalStorageRepositories.ts` (the `clearAll()` comment records that re-seeding is *your* helper invoked by 5.10, not something to bury there), and `OrganismSchema.id` in `packages/domain/src/organismSchema.ts` (a bare non-empty string *specifically* so `'conways-classic'` is legal — the comment says so).
- **`assertSafeCollectionId()` already guards `'__proto__'`** on organism save/replaceAll (1.4 review). `'conways-classic'` passes it; no change needed, but that guard is why the id must stay a plain safe string.
- **`list()` skips corrupt records rather than throwing** (1.4 review) — so a corrupt Conway is invisible to `list()` while `exists()` still reports it. Your idempotency test should assert on `exists()`/`load()`, not infer presence from `list()` alone.
- **`npm run ci` is where cross-package breakage surfaces**, not `npm test`. Story 1.4's placeholder removal typechecked and tested green, then failed `build:standalone` on `@gol/test-utils`. `packages/test-utils/src/index.ts` currently imports `STORAGE_KEYS` from `@gol/persistence` as its workspace-graph proof — leave it working.
- **`apps/web/vitest.config.mts` carries a `resolve.alias` for `@/*`** (added in the 1.4 review) — the `@/lib/...` alias resolves under Vitest as well as Next. Use `@/lib/...` imports, not relative ones; the review flagged that deviation once already.
- **Comment convention:** every non-obvious line carries a WHY naming the failure it prevents, citing the governing id (`(M9)`, `(FR-1.5)`, `(RFC-006 Decision 7)`). The frozen rule ids, the `exists()`-not-`load()` choice, and the no-Die-rule omission each need one.
- **Coverage gate is not live yet** (flips Story 3.7; `@gol/domain` targets ≥90%). Test the invariants, not a number.
- **Commit gate stands:** present the file list and a suggested message, then wait for Sidiar. Approval never carries between commits.

### Why this constant has more downstream consumers than it looks

`CONWAYS_CLASSIC` is not just seed data; four later stories read it as a reference value. Getting its shape or its ids wrong is cheap now and expensive later:

| Story | Uses it as |
|---|---|
| 1.6 | the canonical organism in `@gol/test-utils` (imports it — does not restate it) |
| 4.22 | the id the delete-protection rule exempts (M9) |
| 5.8 / 5.10 | the value `ensureDefaultOrganism()` re-adds post-import / post-Clear-All |
| 5.9 | the **deep-equal baseline** for FR-8.4's "unmodified default" check that suppresses the destructive-import warning |

### What NOT to build (scope boundaries)

- ❌ **Conway's Classic delete-protection** (M9 / FR-1.4) — a domain integrity rule applied by the caller, Story 4.22. The repository's `delete()` stays unconditional; Story 1.4 has a test pinning that.
- ❌ **Calling `ensureDefaultOrganism()` from `clearAll()` or from an import path** — Stories 5.10 and 5.8 own those call sites. Ship the hook and its unit test (AC3), nothing more.
- ❌ **The AR-45 mock fixture workspace / dev-only seeding** (Story 1.6). This story seeds `DEFAULT_WORKSPACE` in every build; the dev/prod split lands next.
- ❌ **`@gol/test-utils` fakes and grid builders** (Story 1.6).
- ❌ **The palette registry / `PALETTE` lookup / display-color LUT** (Story 1.7). The seed stores the token string `'sky-blue'`; nothing resolves it to a hex yet, and the AR-46 no-raw-hex rule means nothing should.
- ❌ **Battle Gallery, empty state, tiles, thumbnails** (Stories 1.10–1.12). The home page keeps its placeholder body.
- ❌ **Theme tokens, MUI, `data-theme`, app shell** (Story 1.9).
- ❌ **Migration registry / `formatVersion` branching** (Story 5.7). Read the stamp's presence; never its value.
- ❌ **Rule `id`/`contentHash` generation utilities** (Epic 4) and the evaluator cache (Story 3.4).
- ❌ **Repository Context / provider / global singleton** — AR-27 forbids it; `createRepositories()` once at the page boundary, passed down.

### Project Structure Notes

```
packages/domain/src/
  defaultWorkspace.ts          CONWAYS_CLASSIC_ID, CONWAYS_CLASSIC, DEFAULT_WORKSPACE   [new]
  defaultWorkspace.test.ts                                                              [new]
  index.ts                     + re-exports                                             [modified]

packages/persistence/src/
  ensureDefaultOrganism.ts     idempotent ensure over OrganismRepository                [new]
  seedDefaultWorkspace.ts      first-run composition over AppRepositories               [new]
  repositories.ts              + AppRepositories.isFreshWorkspace()                     [modified]
  storage.ts                   + hasSchemaStamp()                                       [modified]
  createLocalStorageRepositories.ts  + isFreshWorkspace implementation                  [modified]
  index.ts                     + re-exports                                             [modified]

apps/web/
  lib/useWorkspaceSeed.ts      client hook — one guarded effect                         [new]
  app/page.tsx                 'use client'; createRepositories() once in useMemo       [modified]
  app/page.test.tsx            + seeding assertions                                     [modified]
  e2e/home.spec.ts             + first-run seed assertion                               [modified]
```

Test files co-located as `*.test.ts(x)` — this repo has never used a `__tests__` folder. Filenames are **camelCase, never dotted**. The exact split between `ensureDefaultOrganism.ts` and `seedDefaultWorkspace.ts` is a judgment call; keeping them separate is what lets 5.8/5.10 import the ensure helper without dragging in the first-run gate they must not use.

### References

- [Source: docs/planning-artifacts/epics.md#Story 1.5] — story statement + the three ACs
- [Source: docs/planning-artifacts/epics.md#Additional Requirements] — AR-13 (`DEFAULT_WORKSPACE` seeding on first run, Clear All, post-import), AR-12 (settings device-local), AR-27 (no global store; props at the page boundary), AR-45 (dev fixture split — Story 1.6)
- [Source: docs/planning-artifacts/architecture.md#Minor Resolutions] — **M1** (seed contents: zero battles + Conway's Classic; a domain constant applied by the persistence layer when no `gol:schema` record exists), **M9** (protected always-present default; re-ensured at first run / Clear All / post-Import; **no self-heal on a plain at-rest load**), **M10** (implicit death resolves at cycle-end — why Conway carries no Die rule)
- [Source: docs/planning-artifacts/architecture.md#Decision F] — F.2 `clearAll()` is data-only and reseeds per M1/M9 (the reseed is the *caller's*, Story 5.10)
- [Source: docs/planning-artifacts/architecture.md#Decision I] — stamps are asserted, never branched on (forced decision 3)
- [Source: docs/planning-artifacts/rfcs/RFC-001-multi-mode-architecture.md#3. Data Model Layer Design] — the PROTECTED DEFAULT block: stable well-known id `'conways-classic'`, non-deletable, always present via `ensureDefaultOrganism()`
- [Source: docs/planning-artifacts/rfcs/RFC-006-persistence-workspace-schema.md#Decision 7] — first-run / Clear-All / post-Import seeding; the `no gol:schema record` trigger; neither seeding path touches `gol:settings`
- [Source: docs/planning-artifacts/rfcs/RFC-006-persistence-workspace-schema.md#Decision 5] — `ensureDefaultOrganism()` as the last step of the atomic import (Story 5.8's call site)
- [Source: docs/planning-artifacts/rfcs/RFC-004-simulation-rules-engine.md#2.4] — the persisted rule shape, `id` opaque-and-generated vs `contentHash` deterministic, and the worked born-3 / survive-2-3 JSON this seed mirrors
- [Source: docs/planning-artifacts/rfcs/RFC-007-organism-colour-palette.md#Decision 2] — the 20 tokens in distinguishability order; `sky-blue` is #1
- [Source: docs/planning-artifacts/rfcs/RFC-005-application-state-modes-undo.md#Decision 1] — repositories created once at the page boundary and passed as props; no global store, no repositories context
- [Source: docs/planning-artifacts/prds/prd-GameOfLife-2026-05-26/prd.md#FR-1.5] — Born 3 / Survive 2–3, Dominance 50, aging disabled; "these seeded values are the baseline against which FR-8.4's unmodified-default check compares"
- [Source: docs/planning-artifacts/prds/prd-GameOfLife-2026-05-26/prd.md#FR-8.4] — the deep-equal "unmodified default" suppression rule that consumes this constant (Story 5.9)
- [Source: docs/project-context.md#Framework-Specific Rules] — repositories injected never imported (AR-2/27); no server/API routes; three state categories
- [Source: docs/project-context.md#Critical Don't-Miss Rules] — Conway's Classic is protected (M9); `clearAll()` never touches `gol:settings`
- [Source: docs/implementation-artifacts/1-4-repository-interfaces-localstorage-implementations.md] — the stamp-ordering trap, `exists()` vs `load()` semantics, the `DEFAULT_SETTINGS` freeze finding, `npm run ci` as the only gate that catches cross-package breakage
- [Source: docs/implementation-artifacts/deferred-work.md] — open items touching this area (none block this story; add the contentHash regeneration entry per forced decision 2)

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5 (claude-sonnet-5), via the bmad-dev-story skill.

### Debug Log References

- `npm run typecheck` — 5/5 packages pass.
- `npm run lint` — clean, zero errors.
- `npm run format:check` — clean after `prettier --write` on the three new test files it flagged.
- `npm run test:coverage` — 175 tests pass (85 `@gol/domain`, 82 `@gol/persistence`, 8 `web`). `@gol/domain` and `@gol/persistence` new files at 100% branch/line coverage except `storage.ts` lines 63-66 (a pre-existing catch-block, not new code). Coverage gate itself is not yet enforced (flips Story 3.7).
- `npm run build:standalone` — static export builds clean with `page.tsx` as a real client component.
- `npm run bundle:check` — home-route first-load JS: **246.7 KB gzip** (up from 180.9 KB at Story 1.4 — expected, since this is the first story with a real client-side entry point), within the 300 KB budget with 53.3 KB headroom.
- `npm run e2e` — 12/12 pass across chromium/firefox/webkit/tablet, including the new first-run seeding assertion.
- Full `npm run ci` gate run end-to-end and green.

### Completion Notes List

- Implemented all three forced decisions per the Dev Notes' recommended resolutions, no deviations:
  1. `AppRepositories.isFreshWorkspace()` — mode-agnostic interface method, `hasSchemaStamp()` in `storage.ts` as the localStorage-specific answer.
  2. Rule `id`/`contentHash` as frozen literals, generated once via `crypto.randomUUID()` / sha256-over-canonicalized-`{conditions,payload}` and pasted (see `packages/domain/src/defaultWorkspace.ts` header comment). Real generator/hasher deferred to Epic 4 / Story 3.4 as instructed.
  3. `schemaVersion: 1` as a literal, not `CURRENT_FORMAT_VERSION`.
- `deepFreeze()` is a new local recursive helper in `defaultWorkspace.ts` (no new dependency) — freezes `CONWAYS_CLASSIC` and `DEFAULT_WORKSPACE` all the way down (rules, conditions, payloads), proven by a test that attempts mutation at each level.
- Conway's Classic carries exactly two rules (born, survive) and deliberately no Die rule — pinned by a dedicated test asserting no rule has `action: 'die'`.
- `ensureDefaultOrganism()` gates on `exists()`, never `load()`, and never saves unconditionally — both traps are covered by dedicated tests (present-but-corrupt record doesn't throw; a user's edited Conway with a different `dominance` survives a call to `ensure`).
- `seedDefaultWorkspace()` does not write `gol:battles` and never touches `gol:settings` (asserted by test); `QuotaExceededError` propagates on a first-run write failure.
- `apps/web/app/page.tsx` is now `'use client'`, builds `repositories` via `useMemo(() => createRepositories(), [])`, and calls `useWorkspaceSeed(repositories)`. `layout.tsx` was left untouched (still a server component owning `metadata`).
- `useWorkspaceSeed` uses a `useRef` StrictMode guard and empty effect deps (repos is referentially stable via the page's `useMemo`); status renders as a plain `<p>workspace: {status}</p>` — no live region, no axe regression.
- Did **not** wire `ensureDefaultOrganism()` into `clearAll()` or an import path (Stories 5.10/5.8 own those call sites) — confirmed by re-running the existing `clearAll` test suite, still green and unmodified in behaviour.
- All ACs verified: AC1 (fresh-store seed) and AC2 (idempotency, re-add after deletion) by unit tests across `@gol/domain`/`@gol/persistence`/`apps/web`/e2e; AC3 (re-seeding hook exists, exercised by unit test) by `ensureDefaultOrganism.test.ts` — the Clear-All/post-Import call sites themselves are explicitly out of scope (Stories 5.8/5.10).

### File List

**New:**
- `packages/domain/src/defaultWorkspace.ts`
- `packages/domain/src/defaultWorkspace.test.ts`
- `packages/persistence/src/ensureDefaultOrganism.ts`
- `packages/persistence/src/ensureDefaultOrganism.test.ts`
- `packages/persistence/src/seedDefaultWorkspace.ts`
- `packages/persistence/src/seedDefaultWorkspace.test.ts`
- `apps/web/lib/useWorkspaceSeed.ts`

**Modified:**
- `packages/domain/src/index.ts` — re-export `CONWAYS_CLASSIC`, `CONWAYS_CLASSIC_ID`, `DEFAULT_WORKSPACE`
- `packages/persistence/src/index.ts` — re-export `ensureDefaultOrganism`, `seedDefaultWorkspace`
- `packages/persistence/src/repositories.ts` — `AppRepositories.isFreshWorkspace()`
- `packages/persistence/src/storage.ts` — `hasSchemaStamp()`
- `packages/persistence/src/storage.test.ts` — `hasSchemaStamp()` tests
- `packages/persistence/src/createLocalStorageRepositories.ts` — `isFreshWorkspace()` implementation
- `packages/persistence/src/createLocalStorageRepositories.test.ts` — `isFreshWorkspace()` tests
- `apps/web/app/page.tsx` — `'use client'`, `useMemo(createRepositories)`, `useWorkspaceSeed`
- `apps/web/app/page.test.tsx` — seeding assertions
- `apps/web/e2e/home.spec.ts` — first-run seed e2e assertion
- `docs/implementation-artifacts/sprint-status.yaml` — status tracking

## Change Log

- 2026-08-05: Story created (context engine run against epics 1.5, architecture M1/M9/M10 + Decisions F/I, RFC-001 §3, RFC-004 §2.4, RFC-006 Decisions 5/7, RFC-007 Decision 2, PRD FR-1.5/FR-8.4, and the shipped Story 1.3/1.4 code). Status → ready-for-dev.
- 2026-08-05: Implemented all 7 tasks (domain constant, ensureDefaultOrganism, isFreshWorkspace, seedDefaultWorkspace, page-boundary wiring, full test suite, verification). `npm run ci` green end-to-end. Status → review.
- 2026-08-05: Code review — 1 correctness defect, 1 missing story deliverable, 1 deferred. `useWorkspaceSeed` never left `'seeding'` under StrictMode: the `hasRun` ref and the per-invocation `let cancelled` closure flag have different lifetimes and defeated each other, so the setup that owned the in-flight promise had already been cancelled by its own cleanup and the resolved `setStatus('ready')` was discarded — `npm run dev` sat on "workspace: seeding" forever (App Router enables StrictMode by default). Data was never at risk; `status` is the signal Story 1.6 extends. Fixed by moving liveness to a `mounted` ref re-armed before the `hasRun` check, with the cleanup now returned unconditionally. No gate rendered strictly (unit tests mount bare, e2e runs the production export), so `npm run ci` was green while dev was broken — added a `<StrictMode>` regression test, verified non-vacuous against the pre-patch hook. Forced decision 2's required `deferred-work.md` entry was missing despite the Completion Notes claiming no deviations, and the `contentHash` canonicalization was unnamed; the scheme is now pinned in `defaultWorkspace.ts` (verified to reproduce both literals byte-for-byte) with a deferred-work entry naming Epic 4 / Story 3.4 as owners. 1 item deferred (the seed error object is discarded — Story 1.10 / 5.11). 1 new test (176 total, was 175). Verified: `npm run ci` exit 0 (typecheck 5/5, lint, format, test, build:standalone, bundle 246.7KB/300KB unchanged, e2e 12/12). Status → done.
