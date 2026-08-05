---
baseline_commit: ba1ef61
---

# Story 1.6: Test Utilities & Dev Fixture Workspace

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a developer,
I want shared test utilities and a dev-only fixture workspace,
so that every story tests against canonical data and the running dev app is never empty.

## Acceptance Criteria

1. **Given** `@gol/test-utils`, **When** consumed by any package, **Then** it provides grid builders, in-memory fake repositories implementing the Story 1.4 interfaces, fixed RNG seeds, and the canonical organisms (Conway's Classic + the three PRD organisms) (AR-5)
2. **Given** the AR-45 mock set, **When** defined, **Then** the 3 mock organisms jointly cover all five condition properties, all six operands including `range`, ≥ 1 aging-enabled organism, distinct Dominance values, and ≥ 1 explicit Die-action rule, and the 2 mock battles place them
3. **Given** a dev build, **When** the app starts, **Then** the mock fixtures are auto-seeded; **Given** a production build, **Then** only the FR-1.5 `DEFAULT_WORKSPACE` seeding runs — mock data is unreachable (AR-45)

## Tasks / Subtasks

- [x] **Task 1: Grid builders** (AC: 1)
  - [x] New file `packages/test-utils/src/gridBuilders.ts`. These build the **dense at-rest shape only** — `number[][]`, `0` = empty, `v` = `index + 1` into `organismIds` (RFC-006 Decision 2 / RFC-001). That is the shape `BattleSchema.gridState` validates.
  - [x] Minimum surface:
    - `emptyGrid(cols: number, rows: number): number[][]` — all zeros. **`cols`/`rows` are parameters, never constants** (Decision A); a hardcoded 100/60 anywhere in this file is a bug.
    - `gridFromPattern(rows: readonly string[], legend: Record<string, number>): number[][]` — ASCII-art builder. `'.'` (or any char mapped to `0`) is empty. Throws on a ragged input (rows of unequal length) and on an unmapped character — a silently-mis-sized grid produces a `BattleSchema` failure hundreds of lines away from its cause.
    - `placePattern(grid, pattern, atCol, atRow): number[][]` — stamps a small pattern into a larger grid at an offset, returning a **new** grid. Throws if the pattern would spill out of bounds.
  - [x] Every builder is **pure and returns a fresh array** — no in-place mutation of an input grid, no shared row references (`Array(rows).fill([])` hands every row the *same* array; use `Array.from({ length: rows }, () => …)`).
  - [x] ❌ **Do not build the typed-array `Grid`** (`occupant: Uint8Array` / `age: Uint16Array`, double buffering, `resizeGrid`) — that is Story 3.3 and its shape is not frozen yet. ❌ **Do not build sparse `cells` conversion** — that is the Story 5.3 serializer.
  - [x] ❌ **Do not ship a Conway golden-pattern catalogue** (blinker/glider/block/beehive constants). Epic 3 owns those and will consume `gridFromPattern` to express them; adding them here builds against a test suite that does not exist. The fixture battles in Task 3 are the only patterns this story needs.

- [x] **Task 2: In-memory fake repositories** (AC: 1)
  - [x] New file `packages/test-utils/src/fakeRepositories.ts`, exporting `createFakeRepositories(seed?: FakeSeed): AppRepositories`.
  - [x] Implements the **Story 1.4 interfaces verbatim** (`packages/persistence/src/repositories.ts`) — read that file first; each method carries a documented contract this fake must honour, and a fake that quietly disagrees is worse than no fake at all:
    - `battles.list()` returns **`BattleSummary` projections** (no `gridState`), not full battles.
    - `load()` returns `null` for absent; a present-but-**invalid** record throws `CorruptDataError` (imported from `@gol/persistence`, not re-defined).
    - `exists()` is presence-only — `true` even for a present-but-corrupt record.
    - `settings.load()` is never null; an absent record resolves to `DEFAULT_SETTINGS`.
    - `clearAll()` clears battles + organisms and **never** settings (Decision F / AR-12) — pin this with a test.
    - `isFreshWorkspace()` is `true` only until the first **data** write stamps the store. Model the stamp as an explicit boolean flag set inside the battle/organism write path. **Do not** define it as "the organism map is empty" — that is the M9-forbidden self-heal, and it is the exact trap Story 1.5's Task 3 called out.
    - `list()`/`listFull()` **skip** a record too corrupt to parse rather than throwing (Story 1.4 review) — one bad battle must not blank the Gallery.
  - [x] **Round-trip through JSON + the Zod schema on every write and read**, exactly as the localStorage repositories do: `save()` stores `JSON.parse(JSON.stringify(entity))`, `load()` returns `Schema.parse(stored)`. This is not ceremony — it is what makes a test that passes against the fake also pass against `LocalStorageBattleRepository`. A fake that stores the caller's object by reference hands back a live reference the caller can mutate in place, and silently keeps `Date` objects that the real store cannot.
    - ⚠️ **`structuredClone` is not available here.** `packages/*` compile with `lib: ["ES2022"]` and no `@types/node` — `structuredClone` does not typecheck. The JSON round-trip above is the mechanism, and `BattleSchema`'s `IsoTimestamp` transform re-hydrates `createdAt`/`updatedAt` back to `Date` on read.
  - [x] `FakeSeed` lets a test pre-populate the store: `{ battles?, organisms?, settings?, raw? }`. The `raw` escape hatch writes records **bypassing validation** so tests can inject corruption (the only way to exercise the `CorruptDataError` / skip-corrupt-record paths). Everything else validates on the way in.
  - [x] ❌ **No quota-failure injection, no latency simulation, no call spies** in this story. Nothing consumes them yet; add them in the story that first needs one.

- [x] **Task 3: Canonical organisms + the AR-45 mock workspace** (AC: 1, 2)
  - [x] New file `packages/test-utils/src/mockWorkspace.ts`.
  - [x] **Conway's Classic is imported, never restated** — `import { CONWAYS_CLASSIC, CONWAYS_CLASSIC_ID } from '@gol/domain'` and re-export it as part of the canonical set. A second copy of that constant here would drift from the FR-8.4 "unmodified default" baseline the moment either is edited (Story 1.5 named this story as the consumer).
  - [x] The three PRD organisms (PRD user journey, prd.md:30-45) — **names verbatim**: `"Aggressive Colonizer"`, `"Patient Defender"`, `"Chaotic Spreader"`.
  - [x] **Ids are stable string literals**, not UUIDs — `OrganismSchema.id` is a bare non-empty string precisely so well-known ids are legal (that is what makes `'conways-classic'` work). Export them as a frozen constant:

    ```ts
    export const MOCK_ORGANISM_IDS = {
      aggressiveColonizer: 'mock-aggressive-colonizer',
      patientDefender: 'mock-patient-defender',
      chaoticSpreader: 'mock-chaotic-spreader',
    } as const;
    ```

    They must be stable literals because an `organismType` condition **persists the target's library id** (Decision E) — a generated id would make the cross-referencing rule in the coverage matrix below unresolvable on the next run.
  - [x] **Battle ids must be UUIDs** — `BattleSchema.id` is `z.uuid()`, unlike organisms. Generate two once and paste them as frozen literals (`MOCK_BATTLE_IDS`).
  - [x] **Export factories, not frozen singletons:** `createMockOrganisms(): Organism[]`, `createMockBattles(): Battle[]`, `createMockWorkspace(): { organisms: Organism[]; battles: Battle[] }`. Each call returns fresh objects.
    - This deliberately diverges from `CONWAYS_CLASSIC`'s deep-frozen-singleton shape, and the reason is worth a comment: Conway is a **persisted baseline** that must be referentially identical everywhere, so freezing is the protection. These are **test inputs** that tests will mutate; a fresh copy per call gives the same protection without needing a `deepFreeze` helper that `@gol/domain` does not export.
  - [x] Fixture organisms are **plain objects typed as `Organism`** (Story 1.5's precedent) so the compiler checks the shape — and a test parses each through `OrganismSchema`, because the type annotation cannot catch a typo'd operand or an out-of-range dominance.
  - [x] **Dominance: `80` / `45` / `20`** (Aggressive / Patient / Chaotic). ⚠️ This is a deliberate deviation from the PRD's literal `8` / `5` / `3`: those numbers predate FR-2.2's 1–100 scale, and on that scale all three lose every conflict to Conway's Classic (Dominance 50), which would make the fixture battles visually degenerate the moment Epic 3 runs them. The values preserve the PRD's relative ordering, stay distinct from each other (AR-45) **and** from Conway's 50 (no tie-break RNG in a fixture, so what you see in dev is reproducible). **Record this deviation in the Dev Agent Record.**
  - [x] **Colour tokens** — real RFC-007 Decision 2 token ids, from the CVD-robust core: `vermillion`, `azure`, `bluish-green`. Never a raw hex (the schema's own `#` guard rejects it), and never `sky-blue` (Conway holds it — reuse is legal but pointless here, and it would make the dev grid ambiguous).
  - [x] **Aging:** Patient Defender has `agingEnabled: true` (AR-45's ≥1, and it matches the PRD's "cells fade in"). The other two are `false`.
  - [x] **Rule coverage — the AR-45 matrix.** The three organisms must *jointly* cover every row. Schema constraints that make the naive version fail (`packages/domain/src/survivalRuleSchema.ts`):
    - `cellState` accepts **only** `operator: 'eq'`, pattern `empty | alive | occupied`.
    - `organismType` accepts **only** `operator: 'eq'`, pattern = a target organism's library **id string**.
    - `age` / `neighborCount` / `occupantNeighborCount` accept all six operators. `range` requires a `[min, max]` tuple with `min <= max`; every other operator requires a **scalar**. Mixing these is the single most likely parse failure in this task.

    A worked, schema-valid assignment (adjust freely as long as every row below stays covered):

    | Organism | Rule | Conditions | Action |
    |---|---|---|---|
    | Aggressive Colonizer | born | `cellState eq empty` + `neighborCount eq 3` | `born` |
    | Aggressive Colonizer | survive | `cellState eq alive` + `neighborCount gte 2` | `survive` |
    | Aggressive Colonizer | die | `cellState eq alive` + `neighborCount gt 5` | `die` |
    | Patient Defender | born | `cellState eq empty` + `neighborCount range [3,4]` | `born` |
    | Patient Defender | survive | `cellState eq alive` + `occupantNeighborCount lt 2` | `survive` |
    | Patient Defender | die | `cellState eq alive` + `age gte 8` | `die` |
    | Chaotic Spreader | born | `cellState eq occupied` + `organismType eq mock-aggressive-colonizer` | `born` |
    | Chaotic Spreader | survive | `cellState eq alive` + `neighborCount lte 4` | `survive` |

    Coverage check: properties `cellState` ✓ `organismType` ✓ `age` ✓ `neighborCount` ✓ `occupantNeighborCount` ✓ · operators `eq` ✓ `gt` ✓ `lt` ✓ `gte` ✓ `lte` ✓ `range` ✓ · aging-enabled ≥1 ✓ · distinct dominance ✓ · explicit `die` ≥1 ✓ (two).
  - [x] **Rule `id` / `contentHash`:** frozen literals, same as Story 1.5 — generated once with the canonicalization already pinned in `packages/domain/src/defaultWorkspace.ts` and pasted. Generate them with a throwaway script, **not** by hand:

    ```js
    import { createHash, randomUUID } from 'node:crypto';
    const sortKeysDeep = (v) =>
      Array.isArray(v)
        ? v.map(sortKeysDeep)
        : v && typeof v === 'object'
          ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortKeysDeep(v[k])]))
          : v;
    const contentHash = (rule) =>
      createHash('sha256')
        .update(JSON.stringify(sortKeysDeep({ conditions: rule.conditions, payload: rule.payload })))
        .digest('hex');
    ```

    Unlike Conway's, these hashes are **not** a cross-install baseline — regenerating them is harmless, and they need no identity-pinning test. They must match the scheme anyway, so that Epic 4's real hasher can be validated against a set larger than two rules. Extend the existing `deferred-work.md` entry (Story 1.5, forced decision 2) to name these fixtures alongside the seed.
  - [x] **The two mock battles** (AR-45), built with the Task 1 builders — do **not** hand-write a 1500- or 6000-element `gridState` literal:
    - Battle A: `gridSize: { cols: 50, rows: 30 }`, places the three mock organisms.
    - Battle B: `gridSize: { cols: 100, rows: 60 }`, places the three mock organisms **plus Conway's Classic** — this is the multi-organism competition Epic 3 is meant to be watchable on, and it exercises the second editable preset for the Story 1.10/1.11 Gallery tiles and thumbnails. (Battle B referencing `CONWAYS_CLASSIC_ID` is why the dev seed must run *after* `seedDefaultWorkspace()` — see Task 4.)
    - ⚠️ **`organismIds` ≡ the placed set** (Decision H.1, enforced by `BattleSchema.superRefine`): every roster entry needs ≥1 cell on the grid, cell values are `index + 1`, no duplicate ids, and `gridState` dimensions must match `gridSize` exactly. All four are superRefine failures, so the fixture parse test in Task 5 is what catches them.
    - `createdAt` / `updatedAt` are **fixed literal dates**, never `new Date()` — a per-run timestamp makes the Story 1.10 sort order non-reproducible and the fixtures non-comparable across dev sessions. Give the two battles **different** `updatedAt` values so "sorted by last modified" has a defined answer.

- [x] **Task 4: Dev-only fixture seeding** (AC: 3)
  - [x] New file `packages/test-utils/src/seedDevFixtures.ts`:

    ```ts
    export async function seedDevFixtures(repos: AppRepositories): Promise<void>
    ```

  - [x] It takes the **`AppRepositories` interface** (AR-2/27) — never a concrete repository, never `createRepositories()`. Writes the mock organisms via `organisms.save()` and the mock battles via `battles.save()`.
  - [x] **The function itself reads no environment variable and makes no dev/prod decision.** The caller decides. That is what makes it unit-testable against the Task 2 fakes and keeps the one env read in one place.
  - [x] Wire it in `apps/web/lib/useWorkspaceSeed.ts` — Story 1.5 deliberately kept the seed call in this hook so this story had somewhere to extend:

    ```ts
    const fresh = await repos.isFreshWorkspace();   // read BEFORE seeding — the seed stamps the store
    await seedDefaultWorkspace(repos);
    if (fresh && process.env.NODE_ENV === 'development') {
      const { seedDevFixtures } = await import('@gol/test-utils');
      await seedDevFixtures(repos);
    }
    ```

  - [x] **Gate on `fresh`, read *before* `seedDefaultWorkspace()`.** The default seed's organism write stamps `gol:schema`, so `isFreshWorkspace()` is already `false` by the time it returns. Without the pre-read the fixtures either never seed or re-seed on every load — and re-seeding every load resurrects a fixture you just deleted in dev, which is the M9 self-heal in miniature.
  - [x] **`process.env.NODE_ENV === 'development'`, not `!== 'production'`.** Vitest runs with `NODE_ENV === 'test'`; the `!==` form would seed mock data into every `apps/web` unit test and break the existing exact-key assertions in `page.test.tsx` and the e2e. Next inlines `NODE_ENV` at build time, so `"production" === "development"` is statically false and the whole branch — including the dynamic import — is dead-code-eliminated from the production bundle. That elimination is what AC3's "mock data is unreachable" means; Task 6 verifies it against the real artifact.
  - [x] **Read `process.env.NODE_ENV` inside the effect, not at module scope.** A module-scope `const IS_DEV = …` is evaluated at import time, before `vi.stubEnv` can take effect, and the Task 5 dev-path test would then be silently vacuous.
  - [x] **The import must be dynamic.** `@gol/test-utils` is a **devDependency** of `apps/web` and the ESLint import boundary (Story 1.2) bans static imports of it from non-test app code. Verified against the current config: a static `import { … } from '@gol/test-utils'` errors under `no-restricted-imports`; an `await import('@gol/test-utils')` inside the guard passes. Add a comment naming *why* it is dynamic — the next reader will otherwise "clean it up" into a static import and either fail lint or ship fixtures to production. If a future ESLint does start flagging the dynamic form, add a narrowly-scoped `eslint-disable-next-line` with that reason — **do not** widen the rule's `ignores` to cover `lib/`.
  - [x] `status` stays `'seeding' | 'ready' | 'error'` — `'ready'` now means *both* seeds finished. Do not add a fourth status; the StrictMode `hasRun` / `mounted` ref machinery in this hook is load-bearing (Story 1.5 review) — extend the promise chain, do not restructure the effect.
  - [x] ❌ **Do not touch `next.config.mjs`** — `transpilePackages` already lists `@gol/test-utils`. ❌ **Do not move `@gol/test-utils` out of `devDependencies`**; it must stay a devDependency, and the DCE'd branch is what keeps that honest.

- [x] **Task 5: Fixed RNG seeds** (AC: 1)
  - [x] New file `packages/test-utils/src/seededRng.ts`: `export const FIXED_SEED = 20260716;` (any stable integer — comment that the *value* is arbitrary and the *stability* is the point) and `export function createSeededRng(seed: number): { int(maxExclusive: number): number }`.
  - [x] Implementation: a small deterministic PRNG (mulberry32 / xorshift32 — ~6 lines, no dependency). `int(n)` returns a uniform integer in `[0, n)`. Must be pure-functional in the RFC-004 sense at the call site (`deps.rng.int(top.length)`) while carrying its own advancing state internally — that is the one place a closure over mutable state is correct, and it needs a comment saying so given the no-classes/no-internal-state rule for the engine itself.
  - [x] ⚠️ **Do not add `@gol/simulation` as a dependency of `@gol/test-utils`.** RFC-004 uses an `Rng` type it never defines; Epic 3 will define it in `@gol/simulation`, whose own tests will then consume these fakes — and `test-utils → simulation` + `simulation → test-utils` is a workspace cycle that Turborepo rejects outright. Declare the shape **structurally and locally**; TypeScript is structural, so it will satisfy Epic 3's `Rng` with no change when that type lands.
  - [x] Guard against the two classic mistakes with a test: the same seed produces the same sequence across two independently created generators, and different seeds diverge.

- [x] **Task 6: Package index, tests, and verification** (AC: 1–3)
  - [x] Rewrite `packages/test-utils/src/index.ts` to export the real surface (builders, fakes, mock workspace, `seedDevFixtures`, RNG, `MOCK_*_IDS`, the re-exported Conway constants). `export type { … }` for every type — `isolatedModules` is on and a bare `export { SomeType }` fails to compile.
    - Delete the `GOL_TEST_UTILS` / `TEST_UTILS_DEPENDS_ON` placeholders. They exist only as Story 1.1's workspace-graph proof, and the real code now imports `@gol/domain` and `@gol/persistence` for real — the edges are exercised by the build itself. Verified: nothing outside that file references either symbol.
  - [x] **Tests live in `packages/test-utils/src/*.test.ts`** (co-located `*.test.ts`; this repo has never used a `__tests__` folder). Required:
    - `mockWorkspace.test.ts` — every mock organism parses under `OrganismSchema`; every mock battle parses under `BattleSchema` (this is what catches the four superRefine traps); the **AR-45 coverage matrix is asserted mechanically** — derive the sets of `property` / `operator` values *from the fixtures* and assert each expected set is fully covered, rather than hand-listing what you believe you wrote. A hand-listed assertion passes forever after someone edits a rule.
    - Also assert: exactly 3 mock organisms and 2 mock battles; ≥1 has `agingEnabled: true`; the three dominance values are distinct (and distinct from Conway's); ≥1 rule has `action: 'die'`; every `organismType` condition's `pattern` resolves to an id that exists in the canonical set (a dangling target is a Decision E corruption that nothing else here would catch); two calls to `createMockOrganisms()` return **non-identical** objects (proves the factory, not a shared singleton).
    - `fakeRepositories.test.ts` — the interface-contract behaviours listed in Task 2, each as its own case. The two that matter most: `clearAll()` leaves settings untouched, and `isFreshWorkspace()` flips on the first data write and **stays false** when the organism map is later emptied.
    - `gridBuilders.test.ts` — dimensions match the requested `cols`/`rows`; rows are independent arrays (mutating row 0 does not change row 1); `gridFromPattern` rejects ragged input and unmapped characters; `placePattern` rejects out-of-bounds and does not mutate its input.
    - `seededRng.test.ts` — determinism and divergence (Task 5).
    - `seedDevFixtures.test.ts` — against `createFakeRepositories()`: seeding an empty workspace writes 3 organisms and 2 battles; every battle's `organismIds` resolves against the organism store after seeding (the referential-integrity assertion — this is the test that would catch Battle B referencing Conway when Conway has not been seeded).
  - [x] **`apps/web/app/page.test.tsx`** — add two cases and leave the existing five alone:
    - With `vi.stubEnv('NODE_ENV', 'development')` before render: the fixtures seed (assert `gol:battles` holds both `MOCK_BATTLE_IDS` and `gol:organisms` holds all three mock ids alongside `conways-classic`). `vi.unstubAllEnvs()` in `afterEach`, beside the existing `localStorage.clear()`.
    - Without the stub (default `NODE_ENV === 'test'`): `gol:battles` is untouched and `gol:organisms` holds **only** `conways-classic` — the negative half of AC3.
    - Test files are exempt from the `@gol/test-utils` import boundary, so these may import `MOCK_BATTLE_IDS` statically.
  - [x] **E2E** (`apps/web/e2e/home.spec.ts`) — Playwright runs against the **production static export** (`build:standalone`, then `serve out`), so it is the one gate that proves AC3's production half end-to-end: after loading `/`, assert `localStorage.getItem('gol:battles')` is `null` and `gol:organisms` has exactly the one `conways-classic` key. The existing reload/no-duplicate assertion already covers part of this — extend it rather than adding a near-duplicate spec. There is **no** e2e for the dev-seeded path; the Playwright config deliberately never serves `next dev`.
  - [x] **Verify the fixtures are absent from the shipped bundle** (AC3, "unreachable"): after `npm run build:standalone`, `grep -r "Aggressive Colonizer" apps/web/out` must return nothing. Record the command and its result in the Dev Agent Record — this is the only direct evidence the DCE actually happened, and a passing e2e does not imply it.
  - [x] **Do not add `@gol/test-utils` as a dependency of `@gol/domain` or `@gol/persistence`.** `test-utils` already depends on both, so either edge is a workspace cycle Turborepo rejects. Their tests keep their inline fixtures. `@gol/simulation` and `apps/web` are the packages that may consume test-utils.
  - [x] `npm run typecheck`, `npm run lint`, `npm run test` green, then **`npm run ci`** end-to-end before calling the story done, and report the **actual** result — including the bundle number (246.7 KB gzip / 300 KB as of Story 1.5; it should be effectively unchanged, and a jump is the signal that the fixtures leaked into the production bundle).

## Dev Notes

### Decisions this story is forced to make (flag them in the Dev Agent Record)

AR-5 and AR-45 name the deliverables but not their shapes. Each below has a recommended resolution; if you take a different one, say so rather than deciding silently.

1. **How the dev build is detected, and where.** The ESLint import boundary (Story 1.2) forbids `apps/web` non-test code from statically importing `@gol/test-utils`, and AR-45 requires dev builds to seed from exactly that package. **Resolution: one `process.env.NODE_ENV === 'development'` guard in `useWorkspaceSeed`, wrapping a dynamic `await import('@gol/test-utils')`** (Task 4). Verified against the current config: the static form errors, the dynamic form passes, and Next's build-time `NODE_ENV` inlining makes the branch statically dead in production. The alternatives are both worse: adding a `lib/` exemption to the lint rule removes the guard for every future file, and a new `NEXT_PUBLIC_*` flag would put a second env read next to `lib/mode.ts`'s deliberately-single read-point and require the same "defaults must match `next.config.mjs`" discipline for no benefit.
2. **Mock Dominance values.** The PRD's `8` / `5` / `3` predate FR-2.2's 1–100 scale and lose every conflict to Conway's 50. **Resolution: `80` / `45` / `20`** — PRD ordering preserved, AR-45's distinctness satisfied, no tie-break RNG in a fixture. Names, colours, aging flags, and born/survive intent stay as the PRD wrote them.
3. **Fixtures as factories, not frozen singletons.** `CONWAYS_CLASSIC` is a deep-frozen singleton because it is a persisted baseline. **Resolution: `createMock*()` factories returning fresh objects** — the fixtures are test *inputs*, and a fresh copy per call gives mutation safety without `@gol/domain` having to export its private `deepFreeze`.
4. **The `Rng` shape.** RFC-004 uses `deps.rng.int(n)` but never declares the type, and the package that will declare it (`@gol/simulation`, Epic 3) will itself consume these fakes. **Resolution: declare the shape structurally and locally in `seededRng.ts`; never add `@gol/simulation` to this package's dependencies** — that edge is a Turborepo-rejected cycle, and TypeScript's structural typing makes the eventual `Rng` a zero-churn adoption.

### Silent-failure traps — the intuitive implementation is wrong

- ⚠️ **`!== 'production'` looks equivalent to `=== 'development'` and is not.** Vitest sets `NODE_ENV === 'test'`, so the `!==` form seeds fixtures into every `apps/web` unit test and breaks the existing exact-key assertions in `page.test.tsx` — which would then get "fixed" by loosening them, quietly destroying the AC3 negative case.
- ⚠️ **Reading `isFreshWorkspace()` after `seedDefaultWorkspace()` always returns `false`.** The default seed's organism write stamps `gol:schema` (Story 1.4's `writeDataKey`). Read freshness first, or the fixtures never seed.
- ⚠️ **Seeding fixtures on every dev load is not a convenience, it is the M9 self-heal.** A fixture you deleted while testing Story 1.13's delete flow would silently come back on reload, and you would spend the afternoon debugging the delete.
- ⚠️ **A module-scope `const IS_DEV = process.env.NODE_ENV === 'development'` cannot be stubbed.** It is evaluated at import time, before `vi.stubEnv` runs, so the dev-path test passes vacuously. Read it inside the effect.
- ⚠️ **`organismType` and `cellState` accept only `operator: 'eq'`.** All six operators must therefore be covered by the three *numeric* properties. A `{ property: 'organismType', operator: 'gte' }` condition is a discriminated-union parse failure whose Zod message points at the union, not at the operator.
- ⚠️ **`range` needs a tuple; every other operator needs a scalar.** `{ operator: 'range', pattern: 3 }` and `{ operator: 'eq', pattern: [2, 3] }` both fail the same refine, and an inverted `[max, min]` fails a second one.
- ⚠️ **`BattleSchema.superRefine` rejects a roster member with zero placed cells** (`organismIds` ≡ the placed set, Decision H.1). Listing four organisms and painting three is the most likely way the fixture battles fail to parse.
- ⚠️ **`Array(rows).fill([])` gives every row the same array reference.** Writing one cell writes the whole column. Use `Array.from({ length: rows }, () => …)`.
- ⚠️ **`structuredClone` does not typecheck in `packages/*`** — `lib: ["ES2022"]`, no `@types/node`. Round-trip through `JSON.stringify` + the Zod schema instead, which also re-hydrates `Battle`'s `Date` fields.
- ⚠️ **A fake that stores objects by reference is not a fake, it is a shared mutable global.** The caller can reach into the store through the object it saved, and the test that passes against it fails against localStorage.
- ⚠️ **`test-utils` has no DOM lib.** Fakes are `Map`/object-backed. If something in here appears to need `localStorage`, it belongs in `@gol/persistence` — and that is the design telling you so (`tsconfig.base.json` has no `dom`; only `persistence` and `apps/web` add it).
- ⚠️ **Adding `@gol/test-utils` to `@gol/domain`'s or `@gol/persistence`'s dependencies creates a workspace cycle** that Turborepo rejects when it builds the task graph. Their tests keep their inline fixtures — Story 1.5's Task 6 already anticipated this and told 1.5 not to hand-roll a fake that this story would replace.

### Previous story intelligence (1.4–1.5)

- **`npm run ci` is where cross-package breakage surfaces, not `npm test`.** Story 1.4's placeholder removal typechecked and tested green, then failed `build:standalone` on this very package. You are rewriting `packages/test-utils/src/index.ts` — that is the exact file that broke.
- **No gate in the pipeline renders strictly except one test.** Story 1.5 shipped a hook that was green across the whole of `npm run ci` and broken in `npm run dev`, because unit tests mount bare and e2e runs the production export. You are editing that same hook. The `<StrictMode>` case in `page.test.tsx` is the only place that reproduces dev; keep it green and consider whether your change needs a strict variant of its own.
- **`useWorkspaceSeed`'s `hasRun` / `mounted` ref pair is load-bearing and non-obvious** — the two have deliberately different lifetimes (see the comments in the file and the Story 1.5 review). Extend the promise chain inside the existing `if (!hasRun.current)` block; do not restructure the effect or "simplify" the refs.
- **`apps/web/vitest.config.mts` carries a `resolve.alias` for `@/*`** — use `@/lib/...` imports, not relative ones. The 1.4 review flagged that deviation once already.
- **`list()` skips corrupt records rather than throwing**, and **`exists()` reports `true` for a present-but-corrupt record** (1.4 review). Your fakes must reproduce both, or every test written against them will encode the wrong contract.
- **`assertSafeCollectionId()` guards `'__proto__'`** on organism save/replaceAll. The `mock-*` ids pass; keep them plain safe strings.
- **Comment convention:** every non-obvious line carries a WHY naming the failure it prevents, citing the governing id (`(AR-45)`, `(Decision H.1)`, `(RFC-008 Decision 4)`). The dynamic import, the `=== 'development'` choice, the pre-read of `isFreshWorkspace()`, the factories-not-singletons choice, and the local `Rng` shape each need one.
- **Coverage gate is not live yet** (flips Story 3.7) and `@gol/test-utils` has no gate at all. Test the invariants, not a number — but note that a fixture that fails to parse is a *correctness* bug for every downstream story, which is why the schema-parse tests are non-negotiable.
- **Commit gate stands:** present the file list and a suggested message, then wait for Sidiar. Approval never carries between commits.

### Why this package has more downstream consumers than it looks

Getting the shapes right now is cheap; every one of these stories consumes them:

| Story | Consumes |
|---|---|
| 1.10 / 1.11 / 1.12 | the two fixture battles — Gallery tiles, thumbnails, and the empty state's negative case |
| 2.x | `createFakeRepositories()` for the editor's save/load paths |
| 3.1–3.6 | `gridFromPattern` for the Conway golden patterns; `FIXED_SEED` / `createSeededRng` for the FR-5.4 tie-break; the mock organisms as the multi-organism conflict subjects |
| 3.7 | the bench harness's grids, across all four presets |
| 4.19–4.21 | the mock organisms' `organismType` rule as the rule-reference-index fixture |
| 5.3–5.8 | fixture battles + organisms as the serializer round-trip and atomic-import subjects |

### What NOT to build (scope boundaries)

- ❌ **The typed-array `Grid`** (`Uint8Array` occupant / `Uint16Array` age, double buffering, `resizeGrid`) — Story 3.3.
- ❌ **Sparse `cells` conversion / the export envelope** — Story 5.3.
- ❌ **The Conway golden-pattern catalogue and the non-GoL generic-engine subject** — Epic 3 (RFC-008 Decision 4). Ship the builder; Epic 3 expresses the patterns with it.
- ❌ **The `Rng` interface as a published type** — `@gol/simulation`, Epic 3. Structural shape only, here.
- ❌ **The palette registry / `PALETTE` / `displayColor` LUT** — Story 1.7. Fixtures store token *strings*; nothing resolves them to hex yet.
- ❌ **Quota/latency/spy instrumentation on the fakes** — add it in the story that first needs it.
- ❌ **Property-based tests (fast-check)** — the engine invariants they cover do not exist yet (Epic 3). `fast-check` is installed; leave it unused.
- ❌ **Battle Gallery, tiles, thumbnails, empty state** — Stories 1.10–1.12. The home page keeps its placeholder body; the fixtures are only observable through localStorage this story.
- ❌ **Theme tokens, MUI, app shell** — Story 1.9.
- ❌ **Wiring `ensureDefaultOrganism()` into `clearAll()` or an import path** — Stories 5.10 / 5.8 own those call sites. The dev fixture seed is *not* re-run after Clear All in this story.
- ❌ **Repository Context / provider / global singleton** — AR-27 forbids it; `createRepositories()` once at the page boundary, passed down.

### Project Structure Notes

```
packages/test-utils/src/
  gridBuilders.ts          emptyGrid, gridFromPattern, placePattern                    [new]
  gridBuilders.test.ts                                                                 [new]
  fakeRepositories.ts      createFakeRepositories() -> AppRepositories                  [new]
  fakeRepositories.test.ts                                                             [new]
  mockWorkspace.ts         MOCK_*_IDS, createMockOrganisms/Battles/Workspace           [new]
  mockWorkspace.test.ts    schema parse + the AR-45 coverage matrix, derived            [new]
  seedDevFixtures.ts       seedDevFixtures(repos: AppRepositories)                      [new]
  seedDevFixtures.test.ts                                                               [new]
  seededRng.ts             FIXED_SEED, createSeededRng                                  [new]
  seededRng.test.ts                                                                     [new]
  index.ts                 real surface replaces the Story 1.1 placeholders            [rewritten]

apps/web/
  lib/useWorkspaceSeed.ts  + fresh pre-read, + guarded dynamic dev-fixture seed        [modified]
  app/page.test.tsx        + dev-path (vi.stubEnv) and no-fixtures-by-default cases    [modified]
  e2e/home.spec.ts         + production build seeds no battles / only Conway           [modified]

docs/implementation-artifacts/
  deferred-work.md         extend the 1.5 contentHash entry to cover these fixtures    [modified]
```

No `package.json` changes: `@gol/test-utils` already declares `@gol/domain` + `@gol/persistence`, `apps/web` already devDepends on `@gol/test-utils`, and `next.config.mjs` already transpiles it. Filenames are **camelCase, never dotted**.

### References

- [Source: docs/planning-artifacts/epics.md#Story 1.6] — story statement + the three ACs
- [Source: docs/planning-artifacts/epics.md#Additional Requirements] — **AR-5** (`@gol/test-utils`: grid builders, fake repositories, fixed RNG seeds, canonical organisms), **AR-45** (dev fixture workspace: 3 mock organisms + 2 mock battles, dev builds only, the full coverage matrix), AR-39/40/41/42 (test pyramid, golden patterns, property tests, canvas decision-logic testing — all Epic 3 consumers), AR-27 (no global store; injection at the page boundary)
- [Source: docs/planning-artifacts/epics.md#Story 1.10 / 1.12 / 4.x] — the downstream ACs that read "dev builds also show the AR-45 fixtures"
- [Source: docs/planning-artifacts/rfcs/RFC-008-testing-and-tooling-strategy.md#Decision 4] — shared fixtures: grid builders, fake repositories, fixed seeds, canonical organisms ("Conway's Classic" + the three PRD organisms); seeded RNG with a fixed seed in tests and a fresh seed in production
- [Source: docs/planning-artifacts/rfcs/RFC-008-testing-and-tooling-strategy.md#Decision 9] — per-package `vitest.config`, shared helpers in `@gol/test-utils`, e2e in `apps/web/e2e`
- [Source: docs/planning-artifacts/rfcs/RFC-008-testing-and-tooling-strategy.md#Next Steps] — step 1 is literally "stand up `@gol/test-utils`"; step 2 (golden patterns, non-GoL subject) is Epic 3 and out of scope here
- [Source: docs/planning-artifacts/rfcs/RFC-004-simulation-rules-engine.md#2.4] — the persisted rule shape; `id` opaque-and-generated vs `contentHash` deterministic
- [Source: docs/planning-artifacts/rfcs/RFC-004-simulation-rules-engine.md#3.1] — `SimulationDeps.rng` / `deps.rng.int(n)` — the only appearance of `Rng`, which the RFC never declares (forced decision 4)
- [Source: docs/planning-artifacts/rfcs/RFC-006-persistence-workspace-schema.md#Decision 2] — dense `gridState: number[][]` at rest (`0` = empty, `v` = index+1 into `organismIds`); sparse is wire-only
- [Source: docs/planning-artifacts/rfcs/RFC-006-persistence-workspace-schema.md#Decision 7] — the `gol:schema` stamp as the first-run signal the fake must model
- [Source: docs/planning-artifacts/rfcs/RFC-007-organism-colour-palette.md#Decision 2] — the 20 tokens; `vermillion` / `azure` / `bluish-green` are #2 / #7 / #3 of the CVD-robust core
- [Source: docs/planning-artifacts/architecture.md#Decision A] — grid dimensions are parameters, never constants; the editable presets are 50×30 and 100×60 only
- [Source: docs/planning-artifacts/architecture.md#Decision E] — rules persist the target organism's stable **library id**, never a numeric ref (why the mock ids are frozen literals)
- [Source: docs/planning-artifacts/architecture.md#Decision F] — `clearAll()` is data-only and can never reach `gol:settings`
- [Source: docs/planning-artifacts/architecture.md#Decision H] — H.1: `organismIds` ≡ the placed set; H.4: `BattleSummary` as the lightweight projection
- [Source: docs/planning-artifacts/architecture.md#Minor Resolutions] — **M9** (no self-heal on a plain at-rest load — why the fixture seed is gated on freshness)
- [Source: docs/planning-artifacts/prds/prd-GameOfLife-2026-05-26/prd.md#User Journey] — the three PRD organisms verbatim: Aggressive Colonizer / Patient Defender / Chaotic Spreader, with their colours, aging flags, and born/survive intent (Dominance rescaled — forced decision 2)
- [Source: docs/project-context.md#Testing Rules] — shared fixtures come from `@gol/test-utils`; don't hand-roll a fake repo; determinism is a precondition; no pixel-snapshotting the Canvas
- [Source: docs/project-context.md#Language-Specific Rules] — no DOM types in `packages/*`; `isolatedModules` re-export form; cross-package imports by package name
- [Source: docs/implementation-artifacts/1-5-default-workspace-seeding.md] — `CONWAYS_CLASSIC` is imported not restated; the `useWorkspaceSeed` extension point; the StrictMode ref pair; the `contentHash` canonicalization pinned in `defaultWorkspace.ts`
- [Source: docs/implementation-artifacts/1-4-repository-interfaces-localstorage-implementations.md] — the repository contracts the fakes must reproduce (`exists()` on corrupt records, `list()` skipping corrupt records, `npm run ci` as the only cross-package gate)
- [Source: docs/implementation-artifacts/deferred-work.md] — the Story 1.5 `contentHash` entry these fixtures extend; nothing else here blocks this story

## Dev Agent Record

### Agent Model Used

Claude Opus 5 (claude-opus-5), via the `bmad-dev-story` workflow.

### Debug Log References

- `npm run typecheck` — green (5/5 packages).
- `npm run lint` — green, no output (0 problems). One transient failure fixed mid-task: `mockWorkspace.ts` imported `CONWAYS_CLASSIC` without using it (`@typescript-eslint/no-unused-vars`); removed the unused import.
- `npm run format:check` — green after one `prettier --write` pass over 5 newly-created/edited files (line-length wrapping only, no semantic change).
- `npm run test` — green, 233 tests across 5 packages (`@gol/test-utils` 55, `@gol/domain` 85, `@gol/persistence` 82, `web` 11, `@gol/simulation` 0 via `passWithNoTests`). Up from 176 at Story 1.5: +55 new in `@gol/test-utils`, +2 in `page.test.tsx`.
- DCE verification: `npm run build:standalone` then `grep -r "Aggressive Colonizer" apps/web/out` → **no matches** (grep exit code 1). Also checked `"Patient Defender"`, `"Chaotic Spreader"`, `"mock-aggressive-colonizer"`, `"seedDevFixtures"` — all absent from `apps/web/out`. This is the direct evidence backing AC3's "mock data is unreachable in production."
- `npm run ci` (typecheck → lint → format:check → test:coverage → build:standalone → bundle:check → e2e) — **green end-to-end**, single run, no retries needed.
  - Bundle: **246.7 KB gzip / 300 KB budget (53.3 KB headroom)** — byte-identical to the Story 1.5 baseline noted in the story brief, confirming the dev fixtures did not leak into the production bundle.
  - e2e: **12/12 passed** (chromium, firefox, webkit, tablet × 3 specs), including the extended `home.spec.ts` assertion that `gol:battles` is `null` and `gol:organisms` holds only `conways-classic` against the real static export.
  - Coverage (informational only — the ≥90% gate is not live until Story 3.7): `@gol/test-utils` 91.35% stmts / 79.31% branch; `@gol/domain` 100%; `@gol/persistence` 99.19%; `apps/web` 93.75% (no gate by design).

### Completion Notes List

- All 6 tasks complete; all acceptance criteria (AC1–AC3) satisfied and verified per the debug log above.
- **Forced decisions — took the recommended resolution on all 4, no deviations:**
  1. Dev-build detection: single `process.env.NODE_ENV === 'development'` guard inside `useWorkspaceSeed`'s existing effect, wrapping a dynamic `await import('@gol/test-utils')`. Verified the static form is lint-rejected and the dynamic form passes.
  2. Mock Dominance values: `80` / `45` / `20` (Aggressive / Patient / Chaotic) — PRD's `8`/`5`/`3` deviation as specified, all three distinct from each other and from Conway's `50`.
  3. Fixtures as factories (`createMockOrganisms()`, `createMockBattles()`, `createMockWorkspace()`), never frozen singletons — verified with an explicit non-identity test on each factory.
  4. `Rng` shape declared structurally and locally in `seededRng.ts`; `@gol/simulation` was not added as a dependency of `@gol/test-utils`.
- **No new spec conflicts surfaced** between the story, the referenced RFCs, and `docs/project-context.md` — the story's own guidance matched the shipped code at every point checked (repository contracts, ESLint import-boundary config, `useWorkspaceSeed`'s ref lifetimes, `BattleSchema`/`OrganismSchema`/`SurvivalRuleSchema` shapes).
- **One self-caught fixture-content bug, not a spec deviation:** the first draft of Aggressive Colonizer's `born` rule (`cellState eq empty` + `neighborCount eq 3`, summary "Born on an empty cell with exactly 3 neighbors") reproduced Conway's Classic's `BORN_RULE` verbatim, including its summary text, which made the two rules' `contentHash` collide byte-for-byte under the pinned canonicalization. Reworded the summary text (content/intent unchanged) before generating the final literals — no collisions remain among the 8 mock-rule hashes or against Conway's 2.
- **`useWorkspaceSeed.ts` (highest historical defect rate area):** extended the existing promise chain inside the `if (!hasRun.current)` block exactly as instructed — did not restructure the effect or touch the `hasRun`/`mounted` ref pair. Added `repos.isFreshWorkspace()` as the first link (read before `seedDefaultWorkspace()`, per the M9 self-heal trap), then a conditional dynamic-import link, before the existing `.then(setStatus('ready'))`/`.catch(setStatus('error'))` tail. The pre-existing StrictMode regression test in `app/page.test.tsx` (`'reaches "ready" under StrictMode, and still seeds exactly once'`) was left untouched and is still green.
- **AR-45 coverage matrix test is mechanically derived**, not hand-listed: `mockWorkspace.test.ts` maps over the actual `survivalRules[].conditions[]` of `createMockOrganisms()` to build the covered `property`/`operator` sets at test-run time, then compares each against the schema's known full set (`ALL_CONDITION_PROPERTIES` / `ALL_OPERATORS`, cited to `survivalRuleSchema.ts`). Editing a fixture rule without updating coverage would fail this test rather than pass silently.
- Extended `docs/implementation-artifacts/deferred-work.md`'s Story 1.5 `contentHash` entry to name the 8 new mock-rule literals alongside Conway's 2, per Task 3's instruction.
- Extended `apps/web/e2e/home.spec.ts`'s existing reload/no-duplicate test in place (per the story's "extend rather than add a near-duplicate spec" instruction) rather than adding a new test block.

### File List

**New:**
- `packages/test-utils/src/gridBuilders.ts`
- `packages/test-utils/src/gridBuilders.test.ts`
- `packages/test-utils/src/fakeRepositories.ts`
- `packages/test-utils/src/fakeRepositories.test.ts`
- `packages/test-utils/src/mockWorkspace.ts`
- `packages/test-utils/src/mockWorkspace.test.ts`
- `packages/test-utils/src/seedDevFixtures.ts`
- `packages/test-utils/src/seedDevFixtures.test.ts`
- `packages/test-utils/src/seededRng.ts`
- `packages/test-utils/src/seededRng.test.ts`

**Modified:**
- `packages/test-utils/src/index.ts` (rewritten — real surface replaces the Story 1.1 placeholders)
- `apps/web/lib/useWorkspaceSeed.ts` (extended promise chain: freshness pre-read + gated dynamic dev-fixture seed)
- `apps/web/app/page.test.tsx` (+2 cases: dev-stub fixture seeding, no-stub negative case)
- `apps/web/e2e/home.spec.ts` (extended existing test: asserts no AR-45 fixtures against the production export)
- `docs/implementation-artifacts/deferred-work.md` (extended Story 1.5 contentHash entry)
- `docs/implementation-artifacts/sprint-status.yaml` (status → in-progress → review)
- `docs/implementation-artifacts/1-6-test-utilities-dev-fixture-workspace.md` (this file — task checkboxes, Dev Agent Record, Status)

## Change Log

- 2026-08-05: Story created (context engine run against epics 1.6, AR-5/AR-45, RFC-008 Decisions 4/9, RFC-004 §2.4/§3.1, RFC-006 Decisions 2/7, RFC-007 Decision 2, architecture Decisions A/E/F/H + M9, the PRD user journey, and the shipped Story 1.3/1.4/1.5 code + ESLint/Playwright/Turbo configs). Status → ready-for-dev.
- 2026-08-05: Implemented all 6 tasks (grid builders, fake repositories, AR-45 canonical organisms/mock workspace, dev-only fixture seeding wired into `useWorkspaceSeed`, fixed-seed RNG, package index rewrite + full test suite). All 4 forced decisions taken as recommended, no deviations. `npm run ci` green end-to-end (bundle 246.7 KB gzip / 300 KB, unchanged from Story 1.5; e2e 12/12; DCE grep for mock fixture strings in `apps/web/out` returns nothing). Status → review.
