---
baseline_commit: c1a4bbbf7ee7b0766ebb53a6fcc127c378b11888
---

# Story 5.2: Workspace Statistics

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a user,
I want to see what my workspace holds and how much space it uses,
so that I can manage capacity before it becomes a problem.

## Acceptance Criteria

From `epics.md#Story 5.2: Workspace Statistics` (`epics.md:1332-1342`), decomposed into what a
reviewer can check independently. AC5–AC8 are repo-derived: obligations the shipped 5.1 code, the
`AppRepositories` seam and the CI gates already impose on "the story that adds the AR-14 meter".

1. **The Workspace Statistics card shows three tiles: Saved Battles, Organisms, Storage Used —
   in that order.** The two 5.1 tiles are unchanged (labels, `toLocaleString('en-US')` counts,
   `<dl>` / `div`-wrapped `<dt>`+`<dd>` groups, `column-reverse` visual order). The third tile is
   the mockup's (`settings.html:387-388`: value `2.4 KB` above label `Storage Used`), rendered by
   the same `StatItem` / `StatLabel` / `StatValue` styled primitives — no new styling. The
   `(Story 5.2)` slot comment in `WorkspaceStatistics.tsx:112` is gone (FR-8.2).

2. **The storage figure is the AR-14 usage meter over the `gol:*` namespaces, and only those.**
   A new `AppRepositories.storageUsage(): Promise<StorageUsage>` (`StorageUsage = { bytes: number }`)
   on the aggregate — beside `clearAll()` / `isFreshWorkspace()`, for the same reason those live
   there (FD1). The localStorage implementation sums, for every key in `STORAGE_KEYS` that is
   present (`gol:schema`, `gol:battles`, `gol:organisms`, `gol:settings`), `key.length +
   value.length` UTF-16 code units × 2 bytes (FD2). It reads raw strings and **never parses** —
   a corrupt (non-JSON) record still counts and never throws (FD3). Keys outside `STORAGE_KEYS`
   are not counted; `navigator.storage.estimate()` is **not** called (FD4 — a recorded conflict
   with `RFC-006:268`).

3. **The figure is formatted "in KB/MB with appropriate precision" (FR-8.2) by one pure
   function**, `formatStorageSize(bytes)` in `apps/web/lib/settings/formatStorageSize.ts`:
   below 1 MiB → KB with exactly one decimal (`0.0 KB`, `2.4 KB`, `1,023.9 KB`); at or above
   1 MiB → MB with exactly two decimals (`1.00 MB`, `1.62 MB`). Binary units (1024), uppercase
   `KB` / `MB` as the mockup spells them, `'en-US'` locale pin with the house thousands separator
   (FD5). Never bytes, never `KiB`, never a unit picked by rounding.

4. **Values refresh when returning to the page after data changes — page-scoped loading, no
   subscription (RFC-005 Decision 1, `RFC-005:95`).** Every mount of `<SettingsPage>` re-runs
   `battles.list()`, `organisms.list()` **and** `storageUsage()` through `useAsyncResource`; the
   meter rides the same resource as the counts and re-runs on the seed flip exactly as they do
   (FD6). Proven twice: a jsdom unmount → `battles.save()` → remount test whose Saved Battles
   and Storage Used both change; and an e2e that reads Storage Used on `/settings`, creates and
   saves a battle through the real app (`/` → `/battle/new` → paint → name → Save → Back to
   Battles → Settings link, **all client-side navigation**), and reads Saved Battles `1` and a
   strictly larger Storage Used. No `storage` event listener, no `visibilitychange`, no polling —
   "real-time" in FR-8.2 is satisfied by the epic AC's own reading (`epics.md:1342`), and
   cross-tab liveness is what RFC-005 explicitly declines.

5. **The seam stays whole.** `SettingsPage` receives the meter as a fourth injected prop typed to
   the interface — `workspace: Pick<AppRepositories, 'storageUsage'>` — passed as
   `workspace={repositories}` from the page boundary (FD7). No concrete repository import, no
   `createRepositories()` below the page file, no free function that reads `localStorage` from
   `apps/web`. The in-memory fake (`packages/test-utils/src/fakeRepositories.ts`) gains
   `storageUsage()` mirroring the real formula through the **same exported helper**
   (`storageBytesOf`), so the two cannot drift (FD8). Every existing test that spreads a fake
   (`BattlePage.test.tsx`, `useBattleDraft.test.tsx`) keeps compiling untouched — the widening is
   additive.

6. **Every 5.1 guard is retargeted, not loosened.** Term counts go 2 → **3** in
   `SettingsPage.test.tsx` (six sites) and `settings/page.test.tsx` (two). The `readStats()`
   length guard, the `aria-busy` pins, the `settings.save`-never-called spy, the `gol:settings`
   null-in-`afterEach`, the no-Epic-6-text negative match and the axe checks all still pass with
   three tiles. The e2e's `statValue()` helper (`settings.spec.ts:8-10`) is what makes the
   insertion safe — that is why the review wrote it — use it, never `definition.nth(i)`.

7. **`gol:settings` is still read, never written.** Measuring it is a `getItem`; the 5.1 e2e
   byte-identity tests and the page test's `afterEach` assertion keep passing unchanged
   (Decision F / AR-12).

8. **Coverage and bundle gates stay green without a budget touch.** `packages/persistence`
   (≥80% aggregate) and `packages/test-utils` (≥80% aggregate) cover the new code with tests that
   guard a named failure each. All five `check-bundle-size.mjs` routes are measured before and
   after; **no `budgetGzipKb` changes** (FD9 — `/battle` has 0.7 KB headroom, and a raise is what
   Sidiar refuses). `npm run ci:dev` exits 0; CI on the pushed branch is checked, not inferred.

## Tasks / Subtasks

- [x] **Task 1 — The AR-14 meter in `@gol/persistence`** (AC: 2, 5, 8)
  - [x] `packages/persistence/src/repositories.ts`: add
        `export interface StorageUsage { bytes: number }` (doc: "bytes the workspace occupies in
        the backing store — UTF-16 bytes for localStorage; a connected-mode repository reports
        whatever its server meters") and `storageUsage(): Promise<StorageUsage>` on
        `AppRepositories` with a doc comment in the style of `isFreshWorkspace()`'s: a
        mode-agnostic question ("how much space does this workspace take?") with a
        storage-specific answer; on the aggregate, not a repository, because it spans every
        namespace (RFC-006 Alternative 1's reasoning, same as `clearAll()`); cite `(AR-14)`,
        `(FR-8.2)`, `(RFC-006 Decision 7)`.
  - [x] `packages/persistence/src/localStorageAccess.ts` — **in this file, not a new module**
        (FD9): add `storageBytesOf(entries: Iterable<readonly [string, string]>): number`
        (sum of `key.length + value.length`, × `BYTES_PER_UTF16_CODE_UNIT = 2`) and
        `measureStorageUsage(): StorageUsage` iterating `Object.values(STORAGE_KEYS)`, pushing
        `[key, value]` for every non-`null` `localStorage.getItem(key)`. Comment WHY ×2 (FD2) and
        WHY not `navigator.storage.estimate()` (FD4) — both are the unobvious part; cite
        `(AR-14)` / `(RFC-006 Decision 7)` exactly so `spec:check` resolves them. No JSON.parse
        anywhere in the path (FD3).
  - [x] `packages/persistence/src/createLocalStorageRepositories.ts`: `async storageUsage() {
        return measureStorageUsage(); }` with a two-line comment (why `async` — the seam is
        Promise-shaped; why it cannot throw on a healthy store — it never parses).
  - [x] `packages/persistence/src/index.ts`: export `measureStorageUsage`, `storageBytesOf`, and
        `export type { StorageUsage }` (add it to the existing `export type {…} from
        './repositories'` list — `isolatedModules`).
  - [x] `localStorageAccess.test.ts`, new `describe('storage usage (AR-14, Story 5.2)')`:
        `storageBytesOf([])` is `0`; `[['k', 'v']]` is `4` (two units × 2 — pins the constant);
        a non-BMP character (`'😀'`, two code units) counts `4` bytes on its own (pins UTF-16
        accounting over code points); `measureStorageUsage()` is `{ bytes: 0 }` on an empty
        store; a `localStorage.setItem('unrelated', …)` is **not** counted; all four
        `STORAGE_KEYS` are counted, `gol:settings` and `gol:schema` included (write via
        `writeDataKey` + `writeSettingsKey`, then assert `bytes === storageBytesOf([...the four
        stored pairs])`); a non-JSON `gol:battles` (`setItem` raw `'{not json'`) is counted and
        does not throw (FD3 — `readCollection` throws on the same store, this must not).
  - [x] `createLocalStorageRepositories.test.ts`: `storageUsage()` grows after `battles.save()`
        and shrinks after `clearAll()` — but not to zero while the stamp and a settings record
        remain (the same two-key survival `clearAll (AC5)` already pins).
  - [x] `apps/web/lib/repositoryFactory.test.ts`: one line beside the `clearAll` one —
        `typeof createRepositories().storageUsage === 'function'`.

- [x] **Task 2 — The fake mirrors the meter** (AC: 5, 8)
  - [x] `packages/test-utils/src/fakeRepositories.ts`: `async storageUsage()` on the returned
        aggregate. Build the entries the real store would hold and hand them to `storageBytesOf`
        imported from `@gol/persistence` (the `assertSafeCollectionId` precedent — one formula,
        never two): `[STORAGE_KEYS.schema, JSON.stringify({ formatVersion:
        CURRENT_FORMAT_VERSION })]` when `stamped`; `[STORAGE_KEYS.battles,
        JSON.stringify(Object.fromEntries(battleStore))]` when `battleStore.size > 0`; same for
        organisms; `[STORAGE_KEYS.settings, JSON.stringify(settingsStore)]` when `settingsStore
        !== undefined`. Comment the one deliberate divergence (FD8): the real store keeps an
        emptied `{}` record under a data key after the last delete; the fake counts a collection
        only while it holds records — ≤ 30 bytes apart, invisible at KB precision, and not worth
        a per-collection "written" flag. `CURRENT_FORMAT_VERSION` comes from `@gol/domain` (already
        an import source in this file).
  - [x] `fakeRepositories.test.ts`, new `describe('storageUsage (AR-14)')`: an empty fake reports
        `0`; grows after `battles.save()`; a settings-only save reports exactly
        `storageBytesOf([[STORAGE_KEYS.settings, JSON.stringify(<the roundTripped record>)]])`
        (derive the expected from the same helper, never a literal); `clearAll()` leaves only the
        stamp (`> 0`, `< before`); `isFreshWorkspace()` is unaffected by measuring (a read never
        stamps).

- [x] **Task 3 — `formatStorageSize`** (AC: 3)
  - [x] New `apps/web/lib/settings/formatStorageSize.ts` (new folder — Epic 5/6 settings helpers
        live here, mirroring `lib/gallery/` and `lib/organisms/`). `const KB = 1024; const MB =
        KB * 1024;` `export function formatStorageSize(bytes: number): string` — `bytes < MB` →
        `${(bytes / KB).toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits:
        1 })} KB`, else the MB branch with `2`/`2`. Header comment: the `'en-US'` pin
        (`formatBattleDate.ts:1-6` reasoning — an unpinned locale renders `12,3 KB` on de-DE and
        fails a test written on en-US), the binary-unit choice and the precision rule (FD5), and
        the precondition (a finite integer ≥ 0 — the meter never produces anything else; no
        clamping code for inputs that cannot occur).
  - [x] `formatStorageSize.test.ts`: `0` → `'0.0 KB'`; `2458` → `'2.4 KB'` (the mockup's number);
        `1023` → `'1.0 KB'`; `1024` → `'1.0 KB'`; `1536` → `'1.5 KB'`; `MB - 1` → `'1,024.0 KB'`
        (the boundary is the value, not the rounding — pin it so nobody "fixes" it into a unit
        flip at `999.95 KB`); `MB` → `'1.00 MB'`; `Math.round(1.62 * MB)` → `'1.62 MB'` (RFC-006's
        soft-target workspace); `10 * MB + 512 * KB` → `'10.50 MB'`; a result never contains
        `'KiB'`, `'bytes'` or a lowercase unit.

- [x] **Task 4 — `<SettingsPage>` + `<WorkspaceStatistics>`** (AC: 1, 4, 5, 6, 7)
  - [x] `SettingsPage.tsx` props: add `workspace: Pick<AppRepositories, 'storageUsage'>`
        (`import type { AppRepositories, … } from '@gol/persistence'`). Doc comment: FD7 — why a
        `Pick` and not the aggregate (the "unused prop that lies about what the component reads"
        rule Story 4.1 set; 5.10 widens the `Pick` to `'storageUsage' | 'clearAll'` when it
        reads the second member). Rename `countsResource` → `statsResource`; its loader becomes
        `Promise.all([battles.list(), organisms.list(), workspace.storageUsage()])` with deps
        `[battles, organisms, workspace, seedStatus]` (a fixed length of four — the
        `useAsyncResource` ⚠️ is about runtime shape, not about this edit). Update the "two
        resources" comment: the meter rides the counts resource because it has the counts'
        deps — the seed writes `gol:organisms`, so the figure is stale until the flip re-runs it
        (FD6). `const storageBytes = statsResource.data?.[2].bytes ?? 0;` and pass
        `storageBytes={storageBytes}` down. Nothing else in the fold changes: a rejecting
        `storageUsage()` is an `'error'` like a rejecting `list()` (FD6 says why that is fine).
  - [x] `WorkspaceStatistics.tsx`: prop `storageBytes: number`; third `<StatItem>` — `<StatLabel>
        Storage Used</StatLabel>` / `<StatValue>{formatStorageSize(storageBytes)}</StatValue>` —
        **after** Organisms (the mockup's order, AC1). Delete the `(Story 5.2)` slot comment;
        rewrite the component doc: the three tiles are the card's complete set for the MVP
        (FR-8.2 names exactly these), the value is UTF-16 bytes from the AR-14 meter formatted by
        `formatStorageSize` (cite FD2/FD5 by story). Nothing else in the file moves — the styled
        primitives are Story 5.1's and correct for N tiles.
  - [x] `app/(gallery)/settings/page.tsx`: add `workspace={repositories}` to the `<SettingsPage>`
        element. The header comment's AR-2 sentence already covers a fourth interface-typed prop;
        no other edit.
  - [x] `SettingsPage.test.tsx`: every `toHaveLength(2)` → `3` (the readStats length guard makes
        a missed site fail loudly — good, but do them all); every `<SettingsPage …>` element gains
        `workspace={repos}` (the fake IS the aggregate, so the `Pick` is satisfied by passing it
        whole — same as the page does). New tests: **(a)** ready → `readStats()['Storage Used']`
        equals `formatStorageSize((await repos.storageUsage()).bytes)` for a
        `createMockWorkspace()` seed, and is not `'0.0 KB'`; **(b)** the seeding → ready flip
        re-runs the meter too — extend the existing flip test with `vi.spyOn(repos,
        'storageUsage')` and `toHaveBeenCalledTimes(2)`; **(c)** page-scoped refresh (AC4):
        render → `Saved Battles` `0` → capture `Storage Used` → `unmount()` → `await
        repos.battles.save(createMockWorkspace().battles[0])` → render again → `Saved Battles`
        `1` and `Storage Used` both equal to the fresh `formatStorageSize(...)` and different from
        the captured value; **(d)** a rejecting `workspace.storageUsage()` (`{ storageUsage:
        vi.fn().mockRejectedValue(new Error('boom')) }`) renders the alert — same fold as the
        list rejection; **(e)** `settings.save` still never called (extend the existing test's
        wait to three terms; no new test). The loading-while-seeding test gains
        `expect(usage).toHaveResolved()` beside the three existing spies, or it goes vacuous the
        same way the review found the original one.
  - [x] `app/(gallery)/settings/page.test.tsx`: `toHaveLength(2)` → `3` (two sites). Production
        seed: `Storage Used` equals `formatStorageSize(measureStorageUsage().bytes)` (the real
        jsdom store, measured **after** ready — the seed has written by then) and is not
        `'0.0 KB'` (Conway's Classic + the stamp are always there — M9). `NODE_ENV=development`:
        the figure is strictly larger than the production one (the AR-45 fixtures carry two
        100×60-class grids) — read both as numbers via a tiny `kbOf(text)` helper, do not
        hardcode either. `afterEach`'s `gol:settings` null assertion is untouched and now also
        proves the meter's `getItem` on that key is read-only (AC7).

- [x] **Task 5 — e2e** (AC: 1, 4, 6, 7)
  - [x] `apps/web/e2e/settings.spec.ts`: the first test's hydration block gains
        `await expect(page.getByRole('term').filter({ hasText: 'Storage Used' })).toBeVisible()`
        and `await expect(statValue(page, 'Storage Used')).toHaveText(/^\d[\d,]*\.\d KB$/)` (the
        production seed is a few KB — assert the SHAPE, not a number that moves with every
        Conway's Classic edit). Keep `statValue()` exactly as the review wrote it.
  - [x] New test `'refreshes on return after a save — page-scoped loading (Story 5.2 AC4)'`:
        listeners first; `goto('/settings')`; hydration signal; `Saved Battles` `0`; capture
        `Storage Used` text → `before`. Then **only client-side navigation from here on** (a
        `goto` re-runs any init script and, more to the point, would prove a reload, not a
        return): click nav `Battles` → `getByRole('link', { name: 'Create Your First Battle' })`
        → `toHaveURL('/battle/new')` → `getByRole('img', { name: /petri dish/i }).click()` →
        `getByRole('textbox', { name: /battle name/i }).fill('Measured In Settings')` → `Save`
        → `await expect(save).toBeDisabled()` and `[data-dirty]` `'false'` (the write has
        resolved — `battleRoute.spec.ts:1155-1156` is the precedent for this signal) →
        `getByRole('button', { name: 'Back to Battles' })` (clean draft, no guard dialog) →
        `toHaveURL('/')` → nav `Settings` link → `Saved Battles` `1`, `Organisms` `1`, and
        `Storage Used` parses (strip `,`, `KB`/`MB` → KB) to a number **strictly greater** than
        `before`. `errors` `[]`. Comment why this is the only shape that proves AC4: the
        prerendered body says "Loading settings…", so a stale-but-hydrated page and a fresh mount
        look identical unless the data actually changed in between.
  - [x] Prerender test: unchanged (the raw HTML still carries the `Loading settings…` body; the
        tile labels are client-rendered). The `gol:settings` byte-identity pair and the axe test
        are unchanged and must pass with three tiles — run them.
  - [x] Do **not** add a `seedWorkspace` helper to this file — the save flow above needs no seed,
        and `deferred-work.md:198` records the third fork of that helper as the point past which
        the next divergence goes silent.

- [x] **Task 6 — Bundle measurement, docs, verification** (AC: 8)
  - [x] `npm run build:standalone && node scripts/check-bundle-size.mjs` **before** touching
        code (record the five figures — the 5.1 record has them: 333.8 / 309.3 / 309.1 / 295.6 /
        291.5) and again after. Expect `settings` +≤ 1 KB (the third tile + `formatStorageSize`)
        and the other four +≤ 0.3 KB (the meter is on every route's graph through
        `createRepositories`). **If `/battle` or `/battle/new` (0.7 / 0.9 KB headroom) crosses
        310 KB: do not raise `budgetGzipKb`. Stop, record the numbers in the Dev Agent Record,
        and surface it as a decision for Sidiar** — the accepted mechanism change
        (`deferred-work.md:397`, the growth ratchet) is its own story, and a fifth raise smuggled
        into this one is exactly what he refused. FD9 explains why the code is shaped to make
        this unlikely.
  - [x] `docs/implementation-artifacts/deferred-work.md`: add `## Deferred from: Story
        5-2-workspace-statistics implementation (<date>)` with: **(a)** RFC-006 Decision 7's
        "`navigator.storage.estimate()` where available, falling back to summing serialized
        lengths" (`RFC-006:268`) is **not followed** — FD4's three reasons — a docs-reconciliation
        item for the next RFC-006 touch, not edited here (Sidiar owns RFC amendments); **(b)** the
        meter's unit is UTF-16 bytes (×2) while `RFC-006:268`'s "~12 KB per 100×60 battle"
        arithmetic counts code units — the meter will show roughly double that prose figure per
        battle; same reconciliation item, flagged so nobody "fixes" the constant to match the
        prose. Then append one sentence to the 5.1 `RFC-005:172` entry: Story 5.2 added a fourth
        prop (`workspace`, a `Pick` of the aggregate), so the tree line is now two props short.
  - [x] `docs/project-context.md`, under **Silent-failure traps**, one bullet: `navigator.storage
        .estimate()` is not the localStorage meter — Chromium's `usage` excludes localStorage
        entirely (it meters IndexedDB / Cache Storage / OPFS against the origin quota), Firefox's
        includes it, and neither can be scoped to `gol:*`; the AR-14 meter sums `STORAGE_KEYS`
        value lengths × 2 (UTF-16) and never calls `estimate()`, whatever `RFC-006:268` says. Keep
        it to three lines; it is a rule the RFC actively points the wrong way on, which is the
        bar this file sets.
  - [x] `npm run ci:dev > /tmp/ci.log 2>&1; echo $?` (never piped). Paste the exit code, the five
        bundle lines (before and after) and the e2e summary into the Dev Agent Record. Push to
        `story/5-2-workspace-statistics`; check `gh run list --limit 1` once the PR exists.

### Review Findings

Reviewed on **Opus** against a **Sonnet** implementation (2026-09-21), via three parallel adversarial
layers (Blind Hunter, Edge Case Hunter, Acceptance Auditor). 32 unique findings: 10 `patch` (all
applied below), 0 `decision-needed`, 0 `defer`, 22 dismissed.

- [x] [Review][Patch] The `KiB` guard was vacuous — `/kib|bytes|kb$|mb$/` is case-sensitive, so
      `1.0 KiB` passed the test named for forbidding it; now `/kib|mib|bytes/i` plus the positive
      shape `/^[\d,]+\.\d+ (KB|MB)$/` [apps/web/lib/settings/formatStorageSize.test.ts:46-56]
- [x] [Review][Patch] FD8 divergence comment's arithmetic was wrong — `(12 + 2) * 2 = 28` fits
      neither key (`gol:battles` is 11 code units → 26, `gol:organisms` 13 → 30); the spec's FD8
      carries the same `12` [packages/test-utils/src/fakeRepositories.ts:280-283]
- [x] [Review][Patch] Three prose sites said the meter sums "value lengths" while `storageBytesOf`
      sums `key.length + value.length` — the load-bearing rule file documented a formula the code
      does not implement [docs/project-context.md:421-424; docs/implementation-artifacts/deferred-work.md:2207-2209;
      packages/persistence/src/createLocalStorageRepositories.ts:41-42]
- [x] [Review][Patch] Dev Agent Record miscounts — "all six `toHaveLength(2)` sites" (baseline had
      four; the spec's six was never measured) and "8 tests in `localStorageAccess.test.ts`" (seven)
      [docs/implementation-artifacts/5-2-workspace-statistics.md:559,580]
- [x] [Review][Patch] The appended RFC-005 sentence said "two props short" — the RFC types one
      repository and the page now takes four, so three [docs/implementation-artifacts/deferred-work.md:2175]
- [x] [Review][Patch] Stale `readStats()` comment named two tiles ("Saved Battles, then Organisms")
      while the file's own assertions read `stats['Storage Used']` off that pairing
      [apps/web/app/(gallery)/settings/page.test.tsx:24]
- [x] [Review][Patch] The persistence meter test's comment claimed "the same two-key survival" but
      never wrote a settings record, so `afterClear > 0` was satisfied by the stamp alone and
      Decision F was not pinned through the meter; its `empty` baseline was named but never
      asserted `0` [packages/persistence/src/createLocalStorageRepositories.test.ts:108-127]
- [x] [Review][Patch] The NFR-7.2/7.3 "tell storage-full apart from unreadable" comment sat above an
      export block that now also carried the meter helpers; split into its own export with its own
      reason [packages/persistence/src/index.ts:22-31]
- [x] [Review][Patch] Test name "with the house thousands separator" asserted `'10.50 MB'`, which
      has none — the only separator pin is `MB - 1 → '1,024.0 KB'`; renamed to what it checks
      [apps/web/lib/settings/formatStorageSize.test.ts:42]
- [x] [Review][Patch] `const workspace = createMockWorkspace()` (the user's data) three lines from
      `workspace={repos}` (the repository aggregate) in the same test — renamed the locals
      `mockWorkspace` [apps/web/components/settings/SettingsPage.test.tsx:63,93,259]

Dismissed with reason (not noise, but decided by the spec or covered by a documented precondition):
prefix-scan vs `STORAGE_KEYS` enumeration (FD2); the 1 MiB boundary on the raw value (FD5);
`StorageUsage` as a one-field object (AC2); `workspace` as the prop name (FD7); NaN/negative/GB-tier
inputs to `formatStorageSize` (documented precondition — the meter only sums lengths, localStorage
caps near 10 MiB); `workspace` object identity in the deps (`useAsyncResource`'s documented
precondition, satisfied by the page's `useMemo`); `vi.stubEnv` restore (the file's `afterEach`
already calls `vi.unstubAllEnvs()`); `kbOf` / `toKb` duplicated across jsdom and Playwright (two
runtimes, no shared alias in `e2e/`); the fake re-stating the stored record shapes (FD8 accepts it —
the formula is shared, the shapes are the fake's to model); `?? 0` on the ready branch (unreachable
without data; 5.1's pattern); the e2e "Create Your First Battle" link (the standalone build's
production seed writes no battles) and its rounding step (a saved battle is ≥ 12 KB, the KB step
is ~0.1 KB); a never-settling `storageUsage()` (RFC-005's hook has no timeout by design).

## Dev Notes

### Forced decisions (made here so the dev agent does not have to)

- **FD1 — The meter is `AppRepositories.storageUsage()`, on the aggregate.** Three shapes were
  possible: a free `measureStorageUsage()` called from `apps/web` (rejected — it is the
  `isFreshInstall()` free function Story 1.5 FD1 refused, welded to localStorage while typechecking
  clean); a method on one repository (rejected — it spans all four namespaces, and RFC-006
  Alternative 1 rejects per-repository operations that span collections, which is why `clearAll()`
  is on the aggregate); or the aggregate. Connected mode answers the same question from a server
  (`Api*` reports what its backend meters), so the port is mode-agnostic and the answer is
  storage-specific — the `isFreshWorkspace()` argument verbatim. The `packages/persistence`
  helper is still exported (`measureStorageUsage`) so the page test can compute its expected value
  from the real jsdom store, and `storageBytesOf` so the fake shares the arithmetic (FD8).

- **FD2 — Bytes are UTF-16 code units × 2, over key AND value, for every `STORAGE_KEYS` entry
  present.** Every major engine stores localStorage strings as UTF-16; Chromium meters its
  per-origin localStorage quota (10 MiB) in exactly these bytes — which is why the folk "5 MB
  limit" measures as ~5 M *characters*. `String.prototype.length` is the code-unit count, so
  `(key.length + value.length) * 2` is the engine's own accounting, not an estimate, and needs no
  encoder. Counting code units and calling them bytes (what most snippets do) under-reports by
  half. `gol:settings` and `gol:schema` are counted: they are app storage in the `gol:*`
  namespace, and the epic AC says "over the `gol:*` namespaces", not "over the data keys".
  Enumerating `STORAGE_KEYS` rather than prefix-scanning `localStorage` is the same call
  `removeDataKeys` makes for the opposite reason: `writeKey` takes a `StorageKey`, so the
  enumerated set IS the namespace by construction — a future fifth key is counted the day it is
  registered, and nothing outside the app's own writes can inflate the figure.

- **FD3 — The meter never parses.** It reads `getItem` strings and sums lengths. So a corrupt
  `gol:battles` that makes `readCollection` throw `CorruptDataError` still measures — the meter's
  job is to explain quota pressure, and a corrupt 3 MB record is the single most important thing
  for it to show. It also means the only way `storageUsage()` rejects is a storage-access failure
  (`getItem` itself throwing — Safari private mode with storage disabled), in which case every
  `list()` on the page has already rejected too, which is why folding it into the counts resource
  (FD6) loses nothing.

- **FD4 — `navigator.storage.estimate()` is not used; this is a recorded conflict with
  `RFC-006:268`, not a silent pick.** Three reasons, any one sufficient: (1) Chromium's
  `estimate().usage` does **not include localStorage** — it meters IndexedDB, Cache Storage and
  OPFS against the origin's quota; a fresh install with 1 KB in `gol:*` reports whatever the
  Next chunks in Cache Storage happen to weigh, or 0; (2) Firefox's does include it — so the same
  workspace reads differently per browser, on a page whose job is a truthful number; (3) it is
  origin-wide and cannot be scoped to `gol:*`, which the epic AC (`epics.md:1341`, the later and
  more specific text) requires. The RFC's own "falling back to summing serialized lengths" is the
  correct path and becomes the only path. The epic AC wins over the RFC snippet here as a
  cross-cutting concern (the meter is the seam's, not persistence-internal), and
  `project-context.md`'s "surface any new conflict" rule is why Task 6 writes it down twice
  (deferred-work + the trap bullet) rather than once in a code comment.

- **FD5 — Formatting: binary units, `KB` one decimal below 1 MiB, `MB` two decimals from 1 MiB,
  `'en-US'`.** Binary because that is the unit the quota is specified in (Chromium: 10 MiB;
  RFC-006: "5 MB per-origin") and the unit developer tooling reports, so the number the user sees
  is comparable to the ceiling it is measured against. Uppercase `KB`/`MB` because the mockup
  spells them so (`settings.html:388`) and `Intl`'s unit style would render `kB`. One decimal in
  KB (mockup: `2.4 KB`); two in MB because a single saved 100×60 battle is 12–24 KB ≈ 0.01–0.02 MB
  — at one decimal the figure would not move when the user saves a battle, and AC4's "refresh
  after data changes" would be true and invisible. The 1 MiB boundary is on the raw value, so
  `1,048,575` bytes renders `1,024.0 KB`; that is correct and pinned, not a bug to smooth over
  with a rounding-aware unit pick. `toLocaleString('en-US', …)` is the house pin
  (`GridSettingsSection`, `PopulationStats`, `formatBattleDate`; `deferred-work.md:429`).

- **FD6 — The meter rides the counts resource, not a third resource.** FD3 of Story 5.1 split
  settings from counts because they have different deps and different futures. The meter has the
  counts' deps exactly: `useWorkspaceSeed` writes `gol:organisms` (and the stamp) at this
  boundary, so a figure measured mid-seed is stale by one organism until the flip re-runs it —
  the same reason the counts re-run. One `Promise.all` of three, deps `[battles, organisms,
  workspace, seedStatus]`. Its failure mode is FD3's. A third `useAsyncResource` would add a
  third status to fold and a third "loading" edge for nothing.

- **FD7 — A fourth prop, `workspace: Pick<AppRepositories, 'storageUsage'>`, not the whole
  aggregate and not a bare function.** Story 4.1 refused "the unused prop that lies about what the
  component reads"; passing `repositories: AppRepositories` would hand `<SettingsPage>` `clearAll`
  and `isFreshWorkspace` it does not call (yet). A bare `storageUsage={repositories.storageUsage}`
  function prop detaches the method from its object — fine today (neither implementation uses
  `this`) and a `this` trap the day one does. The `Pick` says exactly what is read, is satisfied
  by passing the aggregate whole (`workspace={repositories}`, `workspace={repos}` in tests), and
  is widened by 5.10 to `'storageUsage' | 'clearAll'` in one token. `AppRepositories` is an
  interface from `@gol/persistence` — AR-2 holds.

- **FD8 — The fake mirrors the meter through the exported `storageBytesOf`, and diverges in one
  documented place.** The 2026-08-05 review's `assertSafeCollectionId` rule: a fake that re-states
  a formula is free to drift from it. The fake builds the pairs the real store would hold and
  calls the same helper. The one divergence: after the last record is deleted the real store holds
  `gol:battles → "{}"` (the `writeDataKey` of an empty collection) while the fake's map is empty
  and it emits no pair — 12 + 2 code units × 2 = 28 bytes, invisible at one-decimal KB. Modelling
  it needs a per-collection "ever written" flag beside `stamped`; not worth it, so the comment
  says so instead.

- **FD9 — The meter lives in `localStorageAccess.ts`, and no budget moves.** `/battle` has 0.7 KB
  of headroom against a 310 KB budget that Sidiar has declined to raise (`deferred-work.md:397`).
  The meter is on every route's module graph (`createRepositories` → `createLocalStorageRepositories`
  → the aggregate method), so it costs every route its gzip weight — ~0.1–0.2 KB for the code.
  Stories 2.14 and 4.1 both saw ~1 KB chunk-splitting shifts from *adding a module to the graph*
  with almost no code in it; putting the two functions in the existing namespace-owner file (where
  `STORAGE_KEYS` and `removeDataKeys` already are) adds bytes without adding a module. If it
  still crosses, Task 6 says what to do: stop and ask, never raise.

### What exists — read these before writing a line

| File | Why it matters here |
|---|---|
| `apps/web/components/settings/SettingsPage.tsx` | The fold, the two resources (FD3 of 5.1), `countsResource` → grows to three loads. Its comments name 5.2 as the story that "grows the counts one". |
| `apps/web/components/settings/WorkspaceStatistics.tsx` | Styled primitives for N tiles; `:112` is the `(Story 5.2)` slot; `:89` names Storage Used as this story's; the doc comment names Storage Used as this story's. |
| `apps/web/components/settings/SettingsPage.test.tsx` | `readStats()` (index-paired, length-guarded), the non-vacuous "loading while seeding" shape (`:23-56`), the flip test (`:147-181`) to extend, `toHaveLength(2)` at six sites. |
| `apps/web/app/(gallery)/settings/page.tsx` + `.test.tsx` | Add one prop; `afterEach` null assertion is AC7's proof; the `NODE_ENV=development` test is where the "strictly larger" figure lives. |
| `apps/web/e2e/settings.spec.ts` | `statValue()` (`:8-10`) — the review wrote it for exactly this insertion; the listener-before-goto and hydration-signal discipline. |
| `apps/web/e2e/battleRoute.spec.ts:1126-1173` | The save flow (petri-dish click, name fill, `Save` disabled + `data-dirty="false"` as the write-resolved signal) the AC4 e2e copies — minus its seed helpers. |
| `apps/web/e2e/createBattle.spec.ts:86-100` | "Create Your First Battle" from a genuinely empty workspace; `Back to Battles` leaves a clean draft with no dialog. |
| `packages/persistence/src/localStorageAccess.ts` | `STORAGE_KEYS`, `writeKey`'s AR-14 comment, `removeDataKeys`'s enumerate-don't-scan stance — the meter goes here (FD9). |
| `packages/persistence/src/createLocalStorageRepositories.ts` + `.test.ts` | `clearAll` / `isFreshWorkspace` — the aggregate-method shape and doc-comment voice to copy. |
| `packages/persistence/src/repositories.ts` | `AppRepositories` and the `isFreshWorkspace()` doc that FD1 quotes. |
| `packages/test-utils/src/fakeRepositories.ts` + `.test.ts` | `stamped`, the store maps, the `roundTrip` discipline; `assertSafeCollectionId` import is the shared-helper precedent for `storageBytesOf`. |
| `apps/web/lib/useAsyncResource.ts` | Fixed-length deps, branch on `status` first — unchanged, re-read the four ⚠️. |
| `apps/web/lib/gallery/formatBattleDate.ts` | The locale-pin comment to echo in `formatStorageSize.ts`. |
| `apps/web/lib/repositoryFactory.test.ts:26-28` | The one-line "exposes X on the assembled set" shape. |
| `scripts/check-bundle-size.mjs` | Five routes, `/battle` at 0.7 KB headroom; formula and the no-raise history. |
| `docs/planning-artifacts/ux-designs/…/clinical-lab-theme/settings.html:282-314,377-390` | `.stat-item` CSS (already shipped) and the `2.4 KB` / `Storage Used` tile. |

### Architecture compliance

- **AR-14 / RFC-006 Decision 7** — the usage meter (FR-8.2) is the monitoring half of AR-14; the
  quota-exceeded half (`QuotaExceededError`, candidate-string-then-`setItem`) shipped in Story 1.4
  and is untouched. The RFC's `estimate()` line is overridden with a record (FD4).
- **AR-2 / AR-27** — port on the interface, injected at the page boundary, `Pick`-typed prop;
  the fake implements the same interface; no `localStorage` read anywhere under `apps/web`.
- **Decision F / AR-12** — `gol:settings` is measured by a `getItem`; nothing writes it. The
  5.1 byte-identity tests are the regression net.
- **RFC-005 Decision 1 / `RFC-005:95`** — page-scoped loading, "no real-time cross-page
  sharing"; the epic AC's "refresh when returning" is the exact reading. No `storage` event.
- **Decision J / AR-46** — no new colours, no new styled components; the third tile reuses 5.1's.
- **No DOM types in `packages/*`** — `measureStorageUsage` touches `localStorage` inside
  `packages/persistence`, the ONE package whose tsconfig carries `DOM`. `storageBytesOf` is pure
  ES2022 and is what `@gol/test-utils` (no DOM lib) imports — do not move `measureStorageUsage`
  into the fake's package, it will not compile there.
- **Coverage gates** — persistence and test-utils are 80% aggregate; the new code is small and
  fully exercised by Tasks 1–2. `apps/web` has no gate: every test above names its failure.
- **Spec-id hygiene** — `AR-14`, `FR-8.2`, `RFC-006 Decision 7`, `RFC-005`, `Decision F`,
  `AR-12`, `M9`, `Story 5.2` — write them exactly so; `spec:check` tokenises code comments too.

### Library / framework notes (installed versions, no research needed)

- **`String.prototype.length`** is UTF-16 code units in every engine — the accounting FD2
  needs, for free; no `TextEncoder` (which would give UTF-8 bytes, the wrong unit).
- **`Number.prototype.toLocaleString('en-US', { minimumFractionDigits, maximumFractionDigits })`**
  — Node 24 ships full ICU; jsdom and all four Playwright browsers agree on `en-US` output.
- **Vitest 4 + jsdom** — `localStorage` in `packages/persistence` tests is a real `Storage`;
  `Object.values(STORAGE_KEYS)` on a frozen `as const` object is typed `StorageKey[]`.
- **Playwright 1.62** — client-side navigation via `getByRole('link').click()` does not re-run
  `addInitScript`; `page.goto` does. The AC4 e2e uses no init script at all.
- **Next 16 App Router** — leaving `/settings` for `/` unmounts `SettingsRoute` (Decision K:
  routes unmount hard); returning mounts a fresh one, `useMemo` builds new repositories, every
  `useAsyncResource` effect fires. The Router Cache holds RSC payloads, never client state.

### Testing standards

- Derive every expected figure from the store or the fixture (`measureStorageUsage()`,
  `repos.storageUsage()`, `storageBytesOf([...])`, `createMockWorkspace().battles.length`) —
  never a literal KB. The one literal-shaped assertion is the e2e regex on the production seed,
  and it pins the format, not the number.
- Persistence tests run in jsdom (its `vitest.config` says why); `localStorage.clear()` in
  `beforeEach` as the file already does.
- The fake's tests are contract tests: assert relations (`0` empty, grows, shrinks-not-to-zero)
  plus one exact equality through the shared helper.
- Do not pixel- or snapshot-test anything; the third tile is the same `StatItem` axe already
  measured in 5.1's e2e (`accent / bg-hover` 8.99:1).
- Never assert on `estimate()`; never mock `navigator.storage` — nothing should reference it.

### Previous story intelligence

- **Story 5.1** (`5-1-settings-page-shell.md`) — this story's direct parent: FD3 (two resources,
  why the counts resource re-runs on the seed flip — FD6 here rides that), FD4 (Storage Used
  deferred here because it "needs the AR-14 usage meter, a `packages/persistence` addition with
  its own coverage floor"), FD7 (`<dl>` shape). Review lessons that bind here: the
  loading-while-seeding test went vacuous on two microtask ticks — use `toHaveResolved()` on
  every spy; `readStats()` needs its length guard; e2e values are read by term, never by
  position (`statValue()`); AC ids in test names must move when the assertion does. The Dev Agent
  Record's discovery — `<dd>`'s "definition" role is name-from-author-prohibited — is why all
  three readers pair by index and why the e2e walks up to the term's wrapper.
- **Story 1.4 / 1.5** (`epic-1/`) — `writeKey`'s AR-14 candidate-string comment and the
  `isFreshWorkspace()` "mode-agnostic question, storage-specific answer" doc are the two
  paragraphs FD1 and FD2 extend; `DATA_KEYS` is enumerated, never prefix-scanned, and FD2 follows.
- **Story 1.6** — the fake's `stamped` flag semantics (never "the map is empty"); FD8's schema
  pair keys off it.
- **Story 4.1** — "no unused prop that lies about what the component reads" → FD7's `Pick`.
- **Story 2.13** (`battleRoute.spec.ts:1126`) — the save-resolved signal (`Save` disabled +
  `data-dirty="false"`) the AC4 e2e waits on before navigating.

### Git intelligence

Last 12 commits on `main`: Story 5.1 (this page), the lane-5 gates row, Story 4.14 (preview
grid), 4.13. None touch `packages/persistence` or `packages/test-utils` — the last edits there
were Story 4.14's fixtures (`mockWorkspace.ts`) and Story 3.7's coverage configs. Surfaces shared
with the Epic 4 lane on this story: `packages/test-utils/src/fakeRepositories.ts` (additive
method at the end of the returned object — Epic 4's open stories consume the fake read-only,
via spread; no 4.x story hand-rolls an `AppRepositories` literal, checked across
`BattlePage.test.tsx`, `useBattleDraft.test.tsx`, `repositoryFactory.test.ts`) and
`packages/persistence/src/index.ts` (additive exports). Neither is a dependency; see the
lane-gate line at the end.

### Project Structure Notes

- New: `apps/web/lib/settings/formatStorageSize.ts` (+ `.test.ts`).
- Modified: `packages/persistence/src/{repositories,localStorageAccess,createLocalStorageRepositories,index}.ts`
  (+ two tests), `packages/test-utils/src/fakeRepositories.ts` (+ test),
  `apps/web/components/settings/{SettingsPage,WorkspaceStatistics}.tsx` (+ `SettingsPage.test.tsx`),
  `apps/web/app/(gallery)/settings/page.tsx` (+ `.test.tsx`), `apps/web/e2e/settings.spec.ts`,
  `apps/web/lib/repositoryFactory.test.ts`, `docs/implementation-artifacts/deferred-work.md`,
  `docs/project-context.md` (one bullet).
- Naming: `formatStorageSize.ts` camelCase, never dotted; `StorageUsage` is a type, not a Zod
  schema (no `Schema` suffix — nothing parses it).
- Variances, recorded not absorbed: `RFC-006:268` (`estimate()` — FD4; code-unit arithmetic —
  FD2) → `deferred-work.md` (Task 6). `RFC-005:172`'s tree line falls further behind (four props)
  → one sentence appended to the 5.1 entry.
- Untouched on purpose: `scripts/check-bundle-size.mjs` (measured, not edited — FD9),
  `OrganismLibrary.tsx`, `BattleGallery.tsx`, `AppShell.tsx`, every RFC, `e2e/organisms.spec.ts`,
  `packages/domain`.

### References

- `docs/planning-artifacts/epics.md:1332-1342` — Story 5.2 ACs; `:114` FR-8.2; `:173` AR-14;
  `:1319-1330` (5.1, the parent); `:1433-1443` (5.10 — the next reader of the `workspace` prop).
- `docs/planning-artifacts/prds/prd-GameOfLife-2026-05-26/prd.md:493-497` — FR-8.2 ("KB or MB
  with appropriate precision"; "update in real-time when battles/organisms are added or
  removed"); `:651-657` NFR-7.1/7.2 (`:658` NFR-7.3).
- `docs/planning-artifacts/rfcs/RFC-006-persistence-workspace-schema.md:257-271` — Decision 7:
  the key namespace, the monitoring line (`:268`) FD4 overrides and FD2 re-units, the
  quota-exceeded half already shipped.
- `docs/planning-artifacts/rfcs/RFC-005-application-state-modes-undo.md:89-110` (Decision 1,
  `useAsyncResource`), `:95` ("page-scoped data, no real-time cross-page sharing"), `:338`.
- `docs/planning-artifacts/architecture.md:238-249` — Decision F; `:302-330` Decision K.
- `docs/planning-artifacts/ux-designs/ux-GameOfLife-2026-05-27/clinical-lab-theme/settings.html:282-314,377-390`.
- `docs/implementation-artifacts/5-1-settings-page-shell.md` — FD3/FD4/FD7, review findings,
  the `<dd>` role note, the five bundle figures (`:552-558`).
- `docs/implementation-artifacts/deferred-work.md:198` (seed-helper fork — do not add a fourth),
  `:397` (bundle gate: mechanism, never a raise), `:429` (locale pin), `:2146-2175` (5.1's three
  entries — append to the `RFC-005:172` one).
- `docs/implementation-artifacts/lane-gates.yaml` — the 5-vs-4 analysis; this story has no row.
- `docs/project-context.md` — Framework rules (AR-27, no DOM in `packages/*` except persistence),
  Testing rules (fakes from `@gol/test-utils`, derive expectations), Code Quality (`spec:check`),
  Development Workflow (`ci:dev`, commit gate).

## Dev Agent Record

### Agent Model Used

claude-sonnet-5 (Claude Sonnet 5), via the `implement-next-story` skill's `bmad-dev-story` phase.

### Debug Log References

- `npm run ci:dev > /tmp/ci-5-2.log 2>&1; echo $?` → exit code **0**. Full chain: typecheck →
  lint (1 pre-existing warning, unrelated: `BattleGallery.tsx:248` `react-hooks/exhaustive-deps`
  — not touched by this story) → format:check → spec:check → boundary:check → test:coverage →
  build:standalone → bundle:check → bench → bench:check → e2e:chromium.
- Coverage: `packages/persistence` 99.26% stmts / 96.22% branch / 100% funcs / 100% lines
  (aggregate gate ≥80% — the one uncovered branch, `localStorageAccess.ts:46-49`, is the
  pre-existing `isQuotaExceeded` non-object guard, untouched by this story).
  `packages/test-utils` 94.67% stmts / 90.82% branch / 100% funcs / 97.2% lines (aggregate gate
  ≥80%).
- Bundle (`node scripts/check-bundle-size.mjs`), before → after this story (5.1's recorded
  figures → this story's, gzipped transfer):
  - home (`/`): 333.8 → 333.9 KB (budget 340, 6.1 KB headroom)
  - battle (`/battle`): 309.3 → 309.4 KB (budget 310, 0.6 KB headroom)
  - battle/new (`/battle/new`): 309.1 → 309.2 KB (budget 310, 0.8 KB headroom)
  - organisms (`/organisms`): 295.6 → 295.7 KB (budget 305, 9.3 KB headroom)
  - settings (`/settings`): 291.5 → 291.7 KB (budget 305, 13.3 KB headroom)
  - All five within budget; `settings` grew 0.2 KB (≤1 KB expected) and the other four 0.1 KB
    each (≤0.3 KB expected — the meter sits on every route's graph through
    `createRepositories`). No `budgetGzipKb` raised (AC8/FD9).
- `bench:check`: 7.135 ms frame (step 6.982 ms + repaint-diff 0.153 ms) against the 16.667 ms
  budget — 9.532 ms headroom (57.2%). Unaffected by this story (no engine-path code touched).
- `e2e:chromium`: 224 passed, 1 skipped (pre-existing skip, unrelated to this story).
- `npx playwright test --project=chromium e2e/settings.spec.ts` run standalone during
  development: 8/8 passed, including the new AC4 test
  (`refreshes on return after a save — page-scoped loading`).
- `npm run build:standalone` pushed to `story/5-2-workspace-statistics`; `gh run list --limit 1`
  is the next phase's job to check (CI fires on `pull_request` only, so no run appears from this
  push).

### Completion Notes List

- Task 1: `AppRepositories.storageUsage(): Promise<StorageUsage>` added to
  `packages/persistence/src/repositories.ts`. `storageBytesOf` (pure formula) and
  `measureStorageUsage` (the localStorage-specific reader) added to
  `packages/persistence/src/localStorageAccess.ts` — same file as `STORAGE_KEYS` (FD9, no new
  module in the bundle graph). `createLocalStorageRepositories()` wires `storageUsage()` to
  `measureStorageUsage()`. All four re-exported from `index.ts`. New tests: 7 in
  `localStorageAccess.test.ts` (empty, the ×2 constant, a non-BMP code-unit pin, empty-store
  measure, an unrelated key excluded, all four `STORAGE_KEYS` counted including
  `gol:settings`/`gol:schema`, a non-JSON `gol:battles` counted without throwing) + 1 in
  `createLocalStorageRepositories.test.ts` (grows on save, shrinks-not-to-zero after `clearAll`)
  + 1 in `repositoryFactory.test.ts`. `packages/persistence` tests: 90/90 passed.
- Task 2: `createFakeRepositories()`'s aggregate gained `storageUsage()`, built from the same
  `storageBytesOf` helper (never a re-derived formula) over the entries the real store would
  hold, with the one documented divergence noted in-line (FD8: an emptied collection contributes
  no pair in the fake vs. `"{}"` in the real store, ≤28 bytes, invisible at KB precision). 5 new
  tests in `fakeRepositories.test.ts`. `packages/test-utils` tests: 94/94 passed.
- Task 3: `apps/web/lib/settings/formatStorageSize.ts` (new folder, mirroring `lib/gallery/` /
  `lib/organisms/`) — binary units, 1 decimal below 1 MiB, 2 decimals from 1 MiB, `'en-US'` pin.
  10 tests in `formatStorageSize.test.ts`, including the mockup's `2458 → '2.4 KB'` and the
  1 MiB-boundary-on-the-raw-value pin (`MB - 1 → '1,024.0 KB'`, not a unit flip).
- Task 4: `WorkspaceStatistics` gained the third `<StatItem>` (Storage Used, after Organisms) and
  dropped the `(Story 5.2)` slot comment. `SettingsPage` gained the `workspace:
  Pick<AppRepositories, 'storageUsage'>` prop; `countsResource` renamed `statsResource`, its
  loader now `Promise.all([battles.list(), organisms.list(), workspace.storageUsage()])` with
  deps `[battles, organisms, workspace, seedStatus]`. The page boundary
  (`app/(gallery)/settings/page.tsx`) passes `workspace={repositories}`. `SettingsPage.test.tsx`:
  all four `toHaveLength(2)` sites moved to `3` (the spec said six; the baseline had four), every render call gained `workspace={repos}`, and
  5 new/extended tests (Storage Used equals the shared formula; the seeding→ready flip re-runs
  `storageUsage` too — `toHaveBeenCalledTimes(2)`; page-scoped refresh via
  unmount/save/remount; a rejecting `workspace.storageUsage()` renders the alert; the
  loading-while-seeding test's spy list gained the usage spy with `toHaveResolved()`).
  `app/(gallery)/settings/page.test.tsx`: both `toHaveLength(2)` sites moved to `3`; the
  production test now also asserts `Storage Used === formatStorageSize(measureStorageUsage().bytes)`
  and `!== '0.0 KB'`; one new test proves the `NODE_ENV=development` figure is strictly larger
  than production via a `kbOf()` helper that parses the rendered text back to KB (never a
  hardcoded literal on either side). `apps/web` test suite (whole package, not gated): 112 test
  files, 1839 tests, all passed.
- Task 5: `e2e/settings.spec.ts` — the hydration test gained a Storage Used shape assertion
  (`/^\d[\d,]*\.\d KB$/`, never a number that moves with Conway's Classic). New test
  `'refreshes on return after a save — page-scoped loading (Story 5.2 AC4)'`: reads Storage Used
  on `/settings`, saves a battle entirely through client-side navigation (no `goto`, no seed
  helper — `deferred-work.md:198`'s "no fourth fork" is honoured), and asserts Saved Battles `1`
  and Storage Used strictly larger than before. `statValue()` used throughout, never
  `definition.nth(i)`. 8/8 passed standalone; all 224 e2e (Chromium) passed in the full `ci:dev`
  run.
- Task 6: bundle measured before/after (see Debug Log — all five routes within budget, no raise);
  `deferred-work.md` gained a `## Deferred from: Story 5-2-workspace-statistics implementation`
  section (the `estimate()` non-follow and the UTF-16-vs-code-unit doubling, both flagged as
  docs-reconciliation items for the next RFC-006 touch) plus one appended sentence on the 5.1
  `RFC-005:172` entry; `docs/project-context.md` gained one bullet under Silent-failure traps.
  `npm run ci:dev` exit 0 — see Debug Log for every stage's figures.
- One formatting fix during the loop: `packages/test-utils/src/fakeRepositories.ts`'s
  `storageUsage()` array literal needed `prettier --write` (multi-line vs. single-line array
  formatting) — caught by `format:check`, fixed, re-verified.
- No HALT conditions triggered. No new dependencies. No bundle budget raised.

### File List

**New:**
- `apps/web/lib/settings/formatStorageSize.ts`
- `apps/web/lib/settings/formatStorageSize.test.ts`

**Modified:**
- `packages/persistence/src/repositories.ts`
- `packages/persistence/src/localStorageAccess.ts`
- `packages/persistence/src/localStorageAccess.test.ts`
- `packages/persistence/src/createLocalStorageRepositories.ts`
- `packages/persistence/src/createLocalStorageRepositories.test.ts`
- `packages/persistence/src/index.ts`
- `packages/test-utils/src/fakeRepositories.ts`
- `packages/test-utils/src/fakeRepositories.test.ts`
- `apps/web/components/settings/SettingsPage.tsx`
- `apps/web/components/settings/SettingsPage.test.tsx`
- `apps/web/components/settings/WorkspaceStatistics.tsx`
- `apps/web/app/(gallery)/settings/page.tsx`
- `apps/web/app/(gallery)/settings/page.test.tsx`
- `apps/web/e2e/settings.spec.ts`
- `apps/web/lib/repositoryFactory.test.ts`
- `docs/implementation-artifacts/deferred-work.md`
- `docs/project-context.md`
- `docs/implementation-artifacts/sprint-status.yaml` (status transitions)

### Change Log

- 2026-09-21: Story 5.2 implemented — AR-14 usage meter (`AppRepositories.storageUsage()`), the
  fake's mirror through the shared `storageBytesOf` helper, `formatStorageSize`, the third
  Workspace Statistics tile, and the AC4 page-scoped-refresh proof (jsdom + e2e). All ACs (1–8)
  satisfied; no bundle budget raised; `npm run ci:dev` exit 0. Status → review.
- 2026-09-21: Code review (Opus over Sonnet) — 10 patches applied (vacuous `KiB` guard, FD8
  arithmetic, "value lengths" → key + value in three prose sites, record miscounts, RFC-005 prop
  count, stale `readStats()` order, settings record + `0` baseline in the persistence meter test,
  `index.ts` export split, a test name, `mockWorkspace` locals), 0 deferred, 0 decisions. Full
  `npm run ci` (all four Playwright projects): 888 passed / 8 red, all eight pre-existing and
  local-only (2× the Story 3.12 `toBeFocused` on WebKit/tablet; 6× 30 s `page.goto` contention
  timeouts that pass serially with `--workers=1`, 12/12). Post-patch gates green; bundle
  unchanged (333.9 / 309.4 / 309.2 / 295.7 / 291.7 KB). Status → done.

Dev Model: sonnet   # every design call (aggregate port, UTF-16 unit, estimate() refusal, Pick prop, resource fold, format rule, file placement) is fixed in FD1–FD9; what remains follows the 5.1 / 1.4 / 1.6 patterns
Proposed lane gate: none

---

This story was implemented with the 'Implement next story' skill with the following stats:

| Phase | Agent model | Agents | Active | Wall clock | Input | Output | Cache write | Cache read | Total tokens |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Step 0 — re-entry guard | — | 0 | 27s | 27s | 10 | 2,130 | 3,614 | 512,488 | 518,242 |
| Step 1 — create | opus-5 | 1 | 13m 05s | 13m 05s | 150 | 55,086 | 389,784 | 9,766,826 | 10,211,846 |
| Step 2 — implement | sonnet-5 | 1 | 13m 12s | 13m 12s | 432 | 54,218 | 548,583 | 33,158,137 | 33,761,370 |
| Step 3 — review + PR | opus-5 | 4 | 14m 31s | 14m 31s | 416 | 91,775 | 779,448 | 20,747,095 | 21,618,734 |
| _of which the orchestrator_ | opus-5 | — | — | — | 42 | 15,652 | 28,379 | 2,293,871 | 2,337,944 |
| **Total (create → PR ready)** | | 6 | **41m 15s** | 41m 15s | 1,008 | 203,209 | 1,721,429 | 64,184,546 | **66,110,192** |

Run started 2026-09-21 20:02 CEST; wall clock runs to the point the run stopped for the owner's review. No idle gaps were excluded; Active and Wall clock agree. (A gap counts as idle above 15 min.) Each phase row covers the phase agent, any agents it spawned, and the orchestrator's own turns in that window — the orchestrator row breaks its share out again, it is not additional. Cache reads dominate the token totals and are billed at a fraction of input rate, so read the Input and Output columns for effort and the total only as a ceiling. The orchestrator's final turn is still being written when these numbers are taken.
