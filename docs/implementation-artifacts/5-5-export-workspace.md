---
baseline_commit: 024b9ed00c5ae0f94d43c630a66431a0afe3f3a5
---

# Story 5.5: Export Workspace

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a user,
I want to download my whole workspace as one file,
so that I have a backup and can move between machines.

## Acceptance Criteria

From `epics.md#Story 5.5: Export Workspace` (`epics.md:1369-1379`), split into items a reviewer can
check one at a time. Three obligations earlier stories passed to this one are added: Story 5.1 left
the **Data Management card** to render here for the first time (`deferred-work.md:2192`, 5.1 FD4).
Story 5.3 left the **`appVersion` source** here (`deferred-work.md:2556-2567`) and the
**Blob/download/filename** half of the export path (`workspaceSerializer.ts:32-36`). Stories 5.6
("Entire Workspace behaves as 5.5") and 5.9 ("Export Current Workspace First (running 5.5)") both
reuse what this story builds, so AC6 pins it as a reusable seam. **Read FD1–FD10 before touching a
file.**

1. **A Data Management card renders on `/settings`, for the first time, containing exactly one
   row: Export Workspace.** A second `.settings-section` card (the same `Card`/`CardTitle` look as
   `<WorkspaceStatistics>`) is headed `<h2>Data Management</h2>`. It has one `.settings-item` row
   (mockup `clinical-lab-theme/settings.html:392-403`): an `<h3>Export Workspace</h3>` label, the
   description "Download a JSON file containing all your battles and organisms for backup or
   transfer", and a primary `.btn` button whose visible text is **Export** and whose accessible
   name is **"Export workspace"**. The accessible name contains the visible text, as WCAG 2.5.3
   requires. The card comes **after** Workspace Statistics, inside the same `Container`, under the
   same `status === 'ready'` gate (FD6). There are **no** Import, Auto-Save or Clear All rows. Those
   belong to 5.9, 6.10 and 5.10, and a row with no working control is the dead section 5.1's FD4
   forbids. There is no card-level description paragraph either (FD7).

2. **Clicking Export downloads a `kind: 'workspace'` file holding every battle and every
   organism, with metadata** (FR-8.3, FR-6.3). The click calls the injected
   `WorkspaceSerializer.exportWorkspace()` exactly once. That returns the `WorkspaceExportWire`
   envelope: `formatVersion`, `appVersion`, `exportedAt`, `kind: 'workspace'`, all `organisms`,
   and all `battles` with sparse `cells`. The page stringifies it and hands it to the browser as a
   `.json` download (FD3). No settings travel in the file (AR-12 / Decision F.1 — the envelope has
   no settings field, so this holds by construction; still assert it).

3. **The default filename is `game-of-life-workspace-YYYY-MM-DD.json`** (FR-8.3). The date is the
   export's **local calendar date**, taken from the **same clock reading** that stamps
   `exportedAt`. It is derived as `new Date(envelope.exportedAt)`, so there is one `now()` call
   per export, never two (FD4). Month and day are zero-padded. A pure
   `workspaceExportFilename(date: Date): string` is unit-tested with dates built from local
   components (`new Date(2026, 0, 5, …)` ⇒ `game-of-life-workspace-2026-01-05.json`), so the test
   does not depend on the runner's time zone.

4. **The exported file passes the serializer's own validation — round-trip sanity** (AR-44).
   Proven twice, and not by a runtime parse in the product (FD5):
   - **Component/unit level:** a test builds a real `createWorkspaceSerializer` over
     `createFakeRepositories(createMockWorkspace())`. It captures the **exact string** handed to the
     download seam and runs `WorkspaceExportSchema.parse(JSON.parse(captured))`, which must
     succeed. `fromEnvelope` of the parsed file must then reproduce the fake store's battles and
     organisms: the same ids, and each battle `toEqual` its stored record.
   - **E2E level (Chromium in `ci:dev`, all four projects in CI):** seed `gol:*` with
     `createMockWorkspace()` via `addInitScript`, visit `/settings`, click Export, and catch the
     Playwright `download`. Assert `suggestedFilename()` matches
     `/^game-of-life-workspace-\d{4}-\d{2}-\d{2}\.json$/`. Read the file and run
     `WorkspaceExportSchema.parse` on it (import from `@gol/domain`, the pattern
     `CURRENT_FORMAT_VERSION` already uses in e2e). Assert `kind === 'workspace'`, that the battle
     and organism id sets equal the seeded ones, and that the file has no `settings` key.

5. **`appVersion` has one source: `apps/web/package.json`'s `version`** (FD2). A new
   `apps/web/lib/appVersion.ts` exports `APP_VERSION`, read from that file's `version`. It is the
   only place the app learns its own version. The `/settings` page boundary passes it to
   `createWorkspaceSerializer({ repos, appVersion: APP_VERSION, now: () => new Date() })`. A unit
   test pins `APP_VERSION === <package.json>.version` and that it is a non-empty string. Today that
   is `"0.0.0"`, and the value is provenance only: nothing branches on it (Decision I.4).

6. **The export path is a reusable seam, not settings-page code** (Stories 5.6 and 5.9 reuse
   it). The page-independent pieces live under `apps/web/lib/export/`:
   - `workspaceExportFilename(date)` (AC3);
   - `downloadJsonFile(filename, value)`, the only code in the repo that touches `Blob`,
     `URL.createObjectURL` or an `<a download>` (FD3);
   - `exportWorkspaceToFile(serializer)`, which runs `exportWorkspace()`, then `downloadJsonFile`
     with the AC3 filename, and resolves when the download has been handed to the browser. It
     rejects with the serializer's own error. It never swallows an error and never shows UI.

   The settings component calls `exportWorkspaceToFile`. It does not re-assemble those three steps
   inline. No file under `components/settings/` touches `Blob` or `URL`.

7. **Repositories and the serializer are injected, never imported** (AR-2 / AR-27). The serializer
   is built **once** at the page boundary (`app/(gallery)/settings/page.tsx`, inside the existing
   `useMemo`, or a second `useMemo` keyed on `repositories`). It is passed down as a prop typed
   `Pick<WorkspaceSerializer, 'exportWorkspace'>`, never the whole interface. This follows the
   5.2 FD7 `Pick` precedent: `exportBattle` is not something this page calls. No component under
   `components/settings/` imports `createWorkspaceSerializer`, `createRepositories` or a concrete
   repository.

8. **A failed export is reported and leaves nothing half-done.** If `exportWorkspace()` rejects,
   for example with `CorruptDataError` when a whole `gol:*` collection is unreadable
   (`workspaceSerializer.ts:80-89`), no download is triggered. The card shows a `role="alert"`
   message in plain, non-technical words. It says the workspace could not be exported and that
   nothing was changed (export is read-only, so that claim is simply true). It shows no stack trace
   and no `error.message`. The next click clears the alert, and the page stays usable. A second
   click while an export is in flight does nothing: it starts no second `exportWorkspace()` call.
   This is done **without** disabling the focused button (FD8).

9. **Keyboard-operable, axe-clean, no regressions.** Tab reaches the Export button after the nav
   links. Enter and Space both trigger it (a native `<button>`). vitest-axe on `SettingsPage`
   (ready state, and the error state with the alert showing) and `@axe-core/playwright` on the
   served `/settings` after hydration both report `[]`. The existing statistics tests are
   unchanged and still green. Their `readStats()` pairs every `term`/`definition` on the page by
   index, so the new card must add **no** `<dt>`/`<dd>`. `gol:settings` is still never written:
   5.1's AC5 assertions keep passing. `npm run ci:dev` is green, including `spec:check` on every ID
   the new comments cite and `bundle:check` with `/settings` inside its existing 305 KB budget. If
   it is not, stop and flag it. **Never raise the budget** (see the owner's bundle-gate
   preference in `deferred-work.md`).

10. **The stale forward-references to this story are corrected in place** (the 5.3/5.4 review
    lesson: a comment that describes a future state goes stale in the next story). The places:
    - `SettingsPage.tsx`: the `Container` comment at `:57-60` ("Story 5.5 adds the second") and
      the `aria-busy` comment at `:127-130`. The latter says the card lives "outside this wrapper"
      and is now false; the card is inside it (FD6).
    - `packages/persistence/src/workspaceSerializer.ts:32-36`: the `exportWorkspace` JSDoc
      ("… is Story 5.5's and belongs in `apps/web`").
    - `packages/persistence/src/index.ts:39-42` ("Story 5.5 calls it from the page boundary …").
    - `packages/persistence/src/repositories.ts:22` ("the WorkspaceSerializer export path
      (Story 5.5)").
    - `packages/domain/src/workspaceExportProjection.ts:~46` ("nothing reads until Story 5.5").

    Each is reworded to state what now exists, with a file pointer. No code in those four package
    files changes.

    In `deferred-work.md`, annotate two entries as closed by this story, keeping their text: the
    5.1 "Data Management renders for the first time in Story 5.5" entry (`:2192`) and the 5.3
    "Where `appVersion` comes from" entry (`:2556`). Also add one new entry for the
    `saveFailureMessage.ts` note (FD9).

## Tasks / Subtasks

- [x] **Task 1: Read before writing (AC: all).**
  - [x] `apps/web/components/settings/SettingsPage.tsx` and `WorkspaceStatistics.tsx` end to end:
        the `Card`/`CardTitle` styles, the `status` fold, the `Container`, and the 5.2 FD7 `Pick`
        comment on the `workspace` prop.
  - [x] `apps/web/app/(gallery)/settings/page.tsx` + `page.test.tsx`: the boundary and its
        `afterEach` AC5 assertion (it must keep passing).
  - [x] `apps/web/components/settings/SettingsPage.test.tsx`: the `readStats()` index pairing
        (AC9) and the seeding-gate tests.
  - [x] `packages/persistence/src/workspaceSerializer.ts`: `exportWorkspace()`'s `listFull()`
        note, and the `CorruptDataError` it can reject with.
  - [x] `packages/domain/src/workspaceExportProjection.ts` (`fromEnvelope`) and
        `workspaceExportSchema.ts` (`WorkspaceExportSchema`, `WorkspaceExportWire`).
  - [x] `apps/web/e2e/settings.spec.ts` and `apps/web/e2e/createBattle.spec.ts:23-40`: the
        `addInitScript` seeding idiom and `STORAGE_KEYS`.
  - [x] `apps/web/components/organisms/OrganismLibrary.tsx:106-133` (`CreateButton`): the house
        primary-button idiom. Copy it; do not import from that file (FD10).
  - [x] The mockup: `docs/planning-artifacts/ux-designs/ux-GameOfLife-2026-05-27/clinical-lab-theme/settings.html:131-217`
        (`.settings-section-description`, `.settings-group`, `.settings-item*`, `.btn`) and
        `:392-403` (the Export row).

- [x] **Task 2: `apps/web/lib/appVersion.ts` (AC: 5).**
  - [x] `import packageJson from '../package.json';`
        `export const APP_VERSION: string = packageJson.version;` (`resolveJsonModule` is already
        on in `tsconfig.base.json`). Add a header comment: provenance only (Decision I.4), the
        single source (FD2), and why `apps/web/package.json` and not the root one.
  - [x] `appVersion.test.ts`: it equals `package.json`'s `version` (read the JSON in the test the
        same way) and is a non-empty string.

- [x] **Task 3: `apps/web/lib/export/` (AC: 3, 6).**
  - [x] `workspaceExportFilename.ts` + `.test.ts`: the pure local-date formatter. Test with
        zero-padding (Jan 5), a two-digit month and day (Dec 31), and a late-evening local time,
        all built from local components.
  - [x] `downloadJsonFile.ts` + `.test.ts`, following FD3. In jsdom, stub `URL.createObjectURL` /
        `URL.revokeObjectURL` (jsdom lacks them, so define them per test and restore) and spy on
        `HTMLAnchorElement.prototype.click`. Assert:
        - the Blob's type is `application/json` and its text is `JSON.stringify(value, null, 2)`;
        - `download` equals the filename;
        - click is called once;
        - the anchor is removed from the document;
        - the object URL is revoked (after the deferred tick; use fake timers or `vi.waitFor`).
  - [x] `exportWorkspaceToFile.ts` + `.test.ts`:
        `exportWorkspaceToFile(serializer: Pick<WorkspaceSerializer, 'exportWorkspace'>,
        download = downloadJsonFile): Promise<void>`. The optional second parameter is the test
        seam: default in production, injected in tests. It is **not** a prop anywhere. Tests:
        - the filename comes from `envelope.exportedAt` (injected `now`);
        - a rejecting serializer rejects with the **same** error and never calls `download`;
        - the AC4 unit round trip: real `createWorkspaceSerializer` over
          `createFakeRepositories(createMockWorkspace())`, parse the captured string, then
          `fromEnvelope` equals the store.

- [x] **Task 4: `DataManagement.tsx` card (AC: 1, 2, 8, 9).**
  - [x] New `apps/web/components/settings/DataManagement.tsx`. Props:
        `{ serializer: Pick<WorkspaceSerializer, 'exportWorkspace'> }`.
        - `<section aria-labelledby>` + `<h2>Data Management</h2>`.
        - One row: `<h3>` label, `<p>` description, and a `styled('button')` with `type="button"`,
          `aria-label="Export workspace"` and visible text "Export".
        - The row control calls `exportWorkspaceToFile(serializer)`.
  - [x] Share the card chrome with `WorkspaceStatistics.tsx`. Either lift `Card`/`CardTitle` into
        `components/settings/SettingsCard.tsx` and have both import it, or copy them. **Lift** is
        preferred: two cards on one page, both in the lane-5-only `components/settings/` folder,
        is the cheapest point to do it. Keep `WorkspaceStatistics`'s rendered DOM and styles
        byte-identical if you lift.
  - [x] Button styles per the mockup `.btn` with the house substitutions:
        - `--gol-accent` background and `--gol-bg-primary` text;
        - `--gol-accent-hover` on hover;
        - keep the `translateY(-1px)` lift;
        - **no `transition: all`**, the mid-fade axe trap;
        - a `:focus-visible` outline;
        - padding `12px 24px`, `13px`, uppercase, `0.5px` letter-spacing, `fontFamily: 'inherit'`.
  - [x] In-flight guard with a `useRef<boolean>` (FD8). Error state in `useState<boolean>`: set on
        rejection, cleared at the start of each click. Render the alert **inside the card, below
        the row**, only while in error. Guard against setting state after unmount; follow the
        closure-flag reasoning in `useAsyncResource.ts`'s docblock. Do not import the hook.
  - [x] Error copy (AC8), e.g. "Your workspace could not be exported. Nothing was changed — try
        again." Keep it free of spec IDs and story numbers, like the 5.4 review patch on runtime
        strings.

- [x] **Task 5: Wire the page (AC: 1, 7, 10).**
  - [x] `page.tsx`: build the serializer at the boundary per AC7 (with `APP_VERSION`,
        `() => new Date()`) and pass `serializer` to `<SettingsPage>`.
  - [x] `SettingsPage.tsx`:
        - add `serializer: Pick<WorkspaceSerializer, 'exportWorkspace'>` to the props, with a
          comment in the 5.2 FD7 `Pick` style;
        - render `<DataManagement serializer={serializer} />` after `<WorkspaceStatistics>` inside
          `Container`;
        - rewrite the two stale comments (AC10).
  - [x] Update every existing `<SettingsPage … />` render in `SettingsPage.test.tsx` to pass a
        serializer. Use the real `createWorkspaceSerializer` over the same fake repos, or a
        `{ exportWorkspace: vi.fn() }` where the test does not care. Do not weaken any existing
        assertion.

- [x] **Task 6: Tests (AC: 1, 2, 4, 8, 9).**
  - [x] `DataManagement.test.tsx` (or new cases in `SettingsPage.test.tsx`; pick one home and say
        why in its header):
        - the heading, the row label and description, the button by role and name
          `/export workspace/i`;
        - clicking calls `exportWorkspace` once and hands the download seam the filename and
          envelope. Mock `@/lib/export/downloadJsonFile` with `vi.mock`, or stub the URL APIs;
        - a double click while pending calls `exportWorkspace` once;
        - a rejection shows `role="alert"`, never calls download, and the next click clears the
          alert;
        - no `term`/`definition` roles are inside the card;
        - axe reports `[]` in the ready and error states.
  - [x] `page.test.tsx`: one wiring case. Click Export at the real boundary (real localStorage
        repositories), capture the download seam, parse through `WorkspaceExportSchema`, check
        `appVersion === APP_VERSION`, and keep the existing `afterEach` (`gol:settings` never
        written).
  - [x] `e2e/settings.spec.ts`: a new `test.describe('export workspace (Story 5.5)')` per AC4's
        e2e bullet, plus an axe scan after the card renders. Keep it thin (RFC-008 Decision 2).
        Do not add a Playwright project.

- [x] **Task 7: Notes (AC: 10).**
  - [x] Reword the four package-file comments listed in AC10 (comments only; diff to confirm).
  - [x] `deferred-work.md`: annotate the two closed entries (`:2192`, `:2556`) with "CLOSED by
        Story 5.5" plus what was chosen, keeping the text. Add a `## Deferred from: Story
        5-5-export-workspace (<date>)` section with the FD9 entry and anything the implementation
        surfaces.

- [x] **Task 8: Gate (AC: 9).**
  - [x] `npm run ci:dev` from the worktree root, **redirected to a file, not piped**. Record the
        real exit code and the `/settings` bundle figure before and after. Never run `npm run ci`
        (the four-browser matrix is CI's job).
  - [x] `spec:check` resolves every ID you wrote (`AR-2`, `AR-12`, `AR-27`, `AR-44`, `FR-8.3`,
        `FR-6.3`, `Decision F.1`, `Decision I.4`, `Story 5.x` …).
  - [x] Record every command and its real result in the Dev Agent Record.

### Review Findings

Reviewed on **Opus** against a **Sonnet** implementation (three parallel layers: Blind Hunter, Edge
Case Hunter, Acceptance Auditor) — 0 decision-needed, 13 patch, 1 defer, 6 dismissed.

- [x] [Review][Patch] `mountedRef` never re-armed under StrictMode — setup → cleanup → setup left it `false`, so the AC8 alert never rendered in `next dev`; now reset in the effect body, pinned by a StrictMode test that fails without it [apps/web/components/settings/DataManagement.tsx:114]
- [x] [Review][Patch] e2e "no `settings` key" asserted on Zod's parse output, which strips unknown keys — vacuous; now asserted on the raw `JSON.parse` of the downloaded file (AC2/AC4) [apps/web/e2e/settings.spec.ts]
- [x] [Review][Patch] AC4 unit round trip re-stringified the value itself instead of capturing the exact bytes the seam writes; now runs the real `downloadJsonFile` and reads the Blob text, and also asserts no raw `settings` key [apps/web/lib/export/exportWorkspaceToFile.test.ts]
- [x] [Review][Patch] Round trip compared organisms by id only; now each organism `toEqual` its stored record too [apps/web/lib/export/exportWorkspaceToFile.test.ts]
- [x] [Review][Patch] AC10 rewrite still said "there is no app-version constant in this workspace yet", contradicting its next sentence [packages/domain/src/workspaceExportProjection.ts:44]
- [x] [Review][Patch] `downloadJsonFile` had no try/finally — a throwing `appendChild`/`click` left a stray `<a>` and a leaked blob URL; now removed and revoked in `finally`, with a test [apps/web/lib/export/downloadJsonFile.ts:21]
- [x] [Review][Patch] Filename expectation hard-coded `2026-01-05` for a `12:00Z` stamp — fails on a UTC+12..+14 runner; now derived via `workspaceExportFilename` [apps/web/components/settings/DataManagement.test.tsx]
- [x] [Review][Patch] "LOCAL, not UTC" filename test could not catch a switch to `getUTC*` on a UTC runner; added a `TZ=Pacific/Kiritimati` case whose local day differs from UTC (verified it fails against a `getUTC*` mutant) [apps/web/lib/export/workspaceExportFilename.test.ts]
- [x] [Review][Patch] AC9 axe ran on `<DataManagement>` alone in the error state; added a `SettingsPage`-level axe scan with the export alert showing [apps/web/components/settings/SettingsPage.test.tsx]
- [x] [Review][Patch] AC9 keyboard operation (Tab reaches Export; Enter and Space trigger it; focus stays) was untested; added a user-event test [apps/web/components/settings/DataManagement.test.tsx]
- [x] [Review][Patch] Page-level `downloadJsonFile` mock never cleared (no `clearMocks` in config) — stale calls for any later Export click; cleared in `afterEach` [apps/web/app/(gallery)/settings/page.test.tsx]
- [x] [Review][Patch] Row missed the mockup's `.settings-item` `padding: 15px 0` and `.settings-item-control` `flex-shrink: 0`; added, and the wrong mockup line citations corrected [apps/web/components/settings/DataManagement.tsx:19-67]
- [x] [Review][Patch] Doc accuracy: `deferred-work.md`'s `appVersion` closure said "option (a)'s shape", contradicting FD2 ("none of those"); and the Dev Agent Record's `/settings` "before" figure (291.5 KB, 5.1's) was not the pre-story baseline (291.7 KB after 5.2) — both corrected [docs/implementation-artifacts/deferred-work.md, this file]
- [x] [Review][Defer] `URL.revokeObjectURL` after `setTimeout(…, 0)` may still be early for real Safari / older Firefox (FileSaver.js waits ~40 s); FD3 pinned 0 ms and Playwright WebKit is green [apps/web/lib/export/downloadJsonFile.ts] — deferred, spec-pinned choice; revisit on a real-Safari report

Dismissed (6): whole `package.json` in the bundle (FD2 accepts the cost; `bundle:check` gates the route); export gated on `ready` (FD6, already an owner flag); no success feedback / busy state (spec forbids both — FD8, "What NOT to build"); download firing after navigating away mid-export (the user asked for it); `NaN` filename on an invalid `exportedAt` (the serializer always stamps ISO via `toISOString`, which throws first); unmount-then-reject test (the guard is covered by the StrictMode test).

## Dev Notes

### Forced decisions (made here so the dev agent does not have to)

**FD1: The Data Management card is a second `<section>` card, not the mockup's single
"Workspace Management" card.** The mockup (`settings.html:369-443`) puts the stats and the action
rows in one card titled "Workspace Management". Story 5.1 already shipped Workspace Statistics as
its own card, and the epic AC names "the Data Management section". So this story adds a second
card beside it rather than merging the two. Its chrome is the same as the stats card. That split
was chosen in 5.1 (AC4/FD4) and is not reopened here.

**FD2: `APP_VERSION` comes from `apps/web/package.json`.** 5.3's hand-off listed three options
(`deferred-work.md:2556`):
- (a) a constant in `packages/*` duplicates the version and drifts;
- (b) a `NEXT_PUBLIC_*` env var needs a `next.config.mjs` `env` block plus a read outside
  `lib/mode.ts`, which project-context forbids;
- (c) a literal at the boundary is honest but lives in the wrong place.

A JSON import of the app's own `package.json` is none of those. It is one module
(`lib/appVersion.ts`), the file the version already lives in, resolved at build time by the
bundler, with no env var and no duplication. It uses `apps/web`'s package.json and not the root's
because `web` is the application: the root is a private workspace container. Both read `0.0.0`
today, and bumping versions is a release concern outside this story. Cost: the bundler may inline
the whole ~1 KB JSON. That is negligible, and it is public anyway (the repo is public). Nothing
branches on the value (Decision I.4).

**FD3: The download mechanism.** `downloadJsonFile(filename, value)`:
1. `new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' })`;
2. `URL.createObjectURL(blob)`;
3. create an `<a>` with `href` and `download = filename`, **append it to `document.body`**, call
   `click()`, and remove it;
4. `URL.revokeObjectURL` in a `setTimeout(…, 0)`.

Notes on the choices:
- Appending before the click is the conservative cross-browser form, since older Firefox ignored
  a click on a detached anchor.
- Revoking on the next task rather than synchronously avoids WebKit cancelling a download whose
  URL was revoked in the same task. The four Playwright projects include WebKit, so this is not
  hypothetical.
- It is pretty-printed with 2-space indentation because this is a user-facing backup/share file
  (FR-6.3 lists what a human would look for), and its size is not on any budget. localStorage is
  not involved.
- No `showSaveFilePicker` (Chromium-only).
- No new dependency (no `file-saver`).

This is the only DOM-touching export code, and it lives in `apps/web` because `packages/*` has no
DOM lib.

**FD4: One clock reading per export.** The filename date comes from `new Date(envelope.exportedAt)`,
not a second `new Date()`, so the name and the metadata can never disagree across a midnight
boundary. It is the **local** calendar date (`getFullYear`/`getMonth`/`getDate`), because
"today's backup" means the user's today. `exportedAt` stays the ISO UTC string it already is. The
two can differ by a calendar day near midnight in non-UTC zones, and that is deliberate. Say so in
the formatter's comment.

**FD5: No runtime `WorkspaceExportSchema.parse` before download.** AC4's "passes the serializer's
own validation" is proven by tests (unit plus e2e on the real downloaded file). It is not
re-checked on every click. The envelope is assembled by `toEnvelope` from records the repositories
**already parsed** through `BattleSchema` / `OrganismSchema` on read, so a runtime parse could only
fail on a `toEnvelope` bug. The round-trip tests in `@gol/domain` (fast-check identity) and here pin
that. A runtime parse would also add `WorkspaceExportSchema` to the `/settings` bundle for a check
with no failing input. If the owner prefers belt-and-braces, it is a one-line addition inside
`exportWorkspaceToFile`, flagged below.

Known, accepted gap: `listFull()` / `list()` **skip** corrupt records, so a partly-corrupt store
exports a silently partial file. That is Story 5.11's, per `deferred-work.md` ("An export of a
partly-corrupt store silently omits…"). **Do not** add skip-counting or a refusal here.

**FD6: The card renders inside `Container`, under the page's existing `ready` gate.** The reasons:
- Exporting before `useWorkspaceSeed` settles would export a pre-seed store, missing Conway's
  Classic on a first visit (M9).
- The `ready` fold already waits for the seed.
- One gate keeps the layout from jumping between two independently loading cards.

The consequence is that if the page is in `error` (say, an unreadable `gol:settings`), Export is
not offered. That is acceptable: the export would read the same failing store, and the recovery
UX for corrupt stores is Story 5.11's. The 5.1 comment that says the card lives "outside this
wrapper" is therefore wrong, and AC10 rewrites it.

**FD7: No card-level description paragraph yet.** The mockup's `.settings-section-description`
("Export, import, and manage your complete workspace…") promises Import and Clear, which don't
exist until 5.9 and 5.10. That is the same no-dead-affordance rule 5.1 FD4 applied, and
`saveFailureMessage.ts:27-31` applies it to copy. The row's own description is accurate today. The
story that adds the last of Import/Clear may add the card description.

**FD8: Re-entrancy without self-disabling.** Setting `disabled` on the focused button while the
export runs drops keyboard focus to `<body>`. `deferred-work.md` records that exact trap for the
editor's and the preview's Clear buttons (Stories 2.15 / 4.14). The export is fast (a
localStorage read), so a `useRef` in-flight flag that makes a second click a no-op is enough. No
`disabled`, no `aria-disabled`, no spinner.

**FD9: `saveFailureMessage.ts` is NOT edited.** Its comment at `:27-31` says "Revisit this copy
when Epic 5 ships export". Export now exists, but it does not **free space**: deleting a battle
does. So the current Quota copy ("delete a battle from the Gallery to free space") is still the
accurate advice, and adding "export first" would be a second, optional step. The file is also
shared with the Epic 4 lane's organism editor (Stories 4.16/4.23 surfaces). A lane-5 edit there
buys a merge risk for no user gain. Record in `deferred-work.md` that the revisit happened and
that the answer was "no change", with this reasoning, so the comment's trigger is discharged
without touching the file.

**FD10: Copy the primary-button styles; don't import them.** `OrganismLibrary.tsx`'s
`CreateButton` is the house idiom, but that file is the Epic 4 lane's live file, and 5.1 FD6
refused to touch it for the same reason. A local `styled('button')` in `DataManagement.tsx`,
following the mockup `.btn` values, is right. Lifting a shared `PrimaryButton` is the deferred
header-lift story's business (`deferred-work.md` 5.1 entry), not this one's.

### What exists: read these before writing a line

| File | Why it matters here |
|---|---|
| `apps/web/components/settings/SettingsPage.tsx` | **Modified.** Props gain `serializer`. `Container` gains the second card. Two stale comments (`:57-60`, `:127-130`). The `status` fold is the gate (FD6). |
| `apps/web/components/settings/WorkspaceStatistics.tsx` | `Card`/`CardTitle` chrome to reuse (lift or copy, Task 4). Its DOM must not change. |
| `apps/web/components/settings/SettingsPage.test.tsx` | **Modified** (every render gains `serializer`). `readStats()` pairs **every** term/definition on the page by index, and the new card must add none. |
| `apps/web/app/(gallery)/settings/page.tsx` (+ `.test.tsx`) | **Modified.** The one `createRepositories()` + `useWorkspaceSeed` boundary. Build the serializer here (AC7). `afterEach` asserts `gol:settings` is never written. Keep it. |
| `packages/persistence/src/workspaceSerializer.ts` | `createWorkspaceSerializer({ repos, appVersion, now })`, `exportWorkspace()`, and the `listFull()` corruption note (FD5). Comment-only edit (AC10). |
| `packages/persistence/src/index.ts` | Exports `createWorkspaceSerializer`, `WorkspaceSerializer`, `CorruptDataError`. Comment-only edit. |
| `packages/domain/src/workspaceExportSchema.ts` / `workspaceExportProjection.ts` | `WorkspaceExportSchema`, `WorkspaceExportWire`, and `fromEnvelope` (the AC4 round trip). Comment-only edit in the projection (`:~46`). **Do not touch the domain barrel.** This story adds no domain export. |
| `packages/test-utils/src/{mockWorkspace,fakeRepositories}.ts` | `createMockWorkspace()`, `MOCK_BATTLE_IDS`, `createFakeRepositories({ battles, organisms })`. |
| `apps/web/lib/repositoryFactory.ts` | `createRepositories()`: call once at the boundary. It is already called in `page.tsx`. |
| `apps/web/lib/useAsyncResource.ts` | Docblock on closure-flag liveness. This is the model for the unmount guard in Task 4, not something to call. |
| `apps/web/lib/saveFailureMessage.ts:27-31` | The "revisit when export ships" note, discharged by FD9 without editing. |
| `apps/web/e2e/settings.spec.ts`, `createBattle.spec.ts:23-40` | E2E template and the `addInitScript` seeding idiom. |
| `scripts/check-bundle-size.mjs:101-110` | `/settings` budget 305 KB. It measured 291.7 KB after 5.2, leaving ~13 KB headroom. `@gol/persistence` has no `sideEffects` flag (the 5.3 entry), so importing the serializer factory costs little; the Zod schemas are already in the route through the repositories. |

### Architecture compliance

- **AR-2 / AR-27**: repositories and the serializer are built once at the page boundary and
  injected as interface-typed props. No Context and no module singleton.
- **Decision F.1 / AR-12**: no envelope carries settings. Export is read-only and never writes
  `gol:*`.
- **FR-8.3 / FR-6.3**: all battles and organisms, metadata (timestamp, app version, format
  version), and the filename pattern.
- **AR-10 / RFC-006 Decision 4**: `exportWorkspace()` reads through `listFull()` + `list()`,
  already implemented. Do not re-implement it or route it through `organismClosure` (5.4 FD9).
- **Decision I.4**: `appVersion` is a provenance stamp and is never branched on.
- **No DOM in `packages/*`**: all `Blob`/`URL`/anchor code lives in `apps/web/lib/export/`.
- **Naming**: camelCase non-component files (`downloadJsonFile.ts`, `workspaceExportFilename.ts`,
  `exportWorkspaceToFile.ts`, `appVersion.ts`), PascalCase components (`DataManagement.tsx`,
  `SettingsCard.tsx` if lifted).
- **One theme / `--gol-*` tokens only**: the AR-46 no-raw-hex lint rule is active. The mockup's
  `#00e5ff` is `--gol-accent-hover`.
- **Strict TS**: no `any`, `!` or `@ts-ignore`. `export type` for type re-exports.

### Library / framework notes

Nothing new is installed. React 19.2, Next 16.2 static export (`output: 'export'`: the download is
entirely client-side, with no route handler), MUI v9 (not used for this button; `styled` only),
Zod 4.4 (tests only in this story), Vitest 4 + RTL + vitest-axe, Playwright (`page.waitForEvent('download')`,
`download.suggestedFilename()`, `download.path()`, and `fs.readFile` in the spec). JSON import:
`resolveJsonModule: true` is in `tsconfig.base.json`, and Next/Turbopack bundle JSON natively.
Use a **default** import (`import packageJson from '../package.json'`). Named imports from JSON
are not reliably supported by bundlers.

### Testing standards

- Every test guards a named failure:
  - a filename that isn't zero-padded or uses UTC;
  - a second clock reading;
  - a download triggered on rejection;
  - a double export on double click;
  - a card that adds `dt`/`dd` and breaks `readStats()`;
  - a file that doesn't parse;
  - `appVersion` drifting from `package.json`;
  - `gol:settings` written.
- Name each `it` as a full sentence stating the invariant, with the reason in parentheses (house
  convention).
- `apps/web` has no coverage gate. Don't pad.
- jsdom lacks `URL.createObjectURL`. Stub per test and restore. Never leave a global stub
  installed across files.
- `npm run ci:dev` is the gate. Report its real exit code, not piped.

### Previous story intelligence

- **Story 5.4** (previous): `exportBattle(id)` was restored to the RFC shape by owner ruling, so
  5.6, not this story, owns "save before export". The review lessons:
  - history is struck, never deleted, in story and deferred-work files;
  - runtime strings carry no story IDs;
  - an invariant you rely on gets a test that pins it.
- **Story 5.3**: minted `createWorkspaceSerializer` with injected `appVersion`/`now` so this story
  could supply them at the boundary. It deferred the version source here (FD2 answers it). Note
  that `"sideEffects": false` is on `@gol/domain` only.
- **Story 5.2**: the `Pick<AppRepositories, 'storageUsage'>` prop precedent (FD7 there). The stats
  resource re-runs on the seed flip. Export needs no resource: it is an event, not a load.
- **Story 5.1**: FD4 (Data Management first renders here), FD6 (a third hand copy of the section
  header rather than touching `OrganismLibrary.tsx`, the same lane-boundary reasoning as FD10
  here), and the `/settings` bundle entry.

### Git intelligence

`main` is at `024b9ed` (#77: 5.6's save-before-export AC; #76: Story 5.4). Epic 5's recent files are
`packages/{domain,persistence}` export modules and `components/settings/`. Epic 4's lane (4.20–4.26)
works in `components/organisms/`, `components/battle/` and `packages/domain` usage/delete guards.
None of those touches `components/settings/`, `app/(gallery)/settings/`, `lib/export/` or the
serializer. This story adds **no** `@gol/domain` barrel export, so there is no two-lane barrel
collision.

### Project Structure Notes

- New: `apps/web/lib/appVersion.ts` (+ test).
- New: `apps/web/lib/export/{workspaceExportFilename,downloadJsonFile,exportWorkspaceToFile}.ts`
  (+ tests).
- New: `apps/web/components/settings/DataManagement.tsx` (+ test).
- Optional new: `apps/web/components/settings/SettingsCard.tsx` (lifted chrome).
- Modified: `SettingsPage.tsx` (+ test), `WorkspaceStatistics.tsx` (only if the chrome is lifted),
  `app/(gallery)/settings/page.tsx` (+ test), `e2e/settings.spec.ts`.
- Comment-only: `packages/persistence/src/{workspaceSerializer,index,repositories}.ts`,
  `packages/domain/src/workspaceExportProjection.ts`.
- Docs: `deferred-work.md`, `sprint-status.yaml`.
- Untouched on purpose: `saveFailureMessage.ts` (FD9), `OrganismLibrary.tsx` (FD10), every
  `package.json`, `packages/domain/src/index.ts`, `scripts/check-bundle-size.mjs`,
  `lane-gates.yaml`, `docs/project-context.md`.

### What NOT to build

- ❌ Import, Auto-Save and Clear All rows (5.9 / 6.10 / 5.10). No card description promising them
  (FD7).
- ❌ Battle export, the export dialog, or the editor's EXPORT BATTLE button (5.6). But do build
  `lib/export/` so 5.6 can reuse it.
- ❌ Any change to `exportWorkspace()`'s behaviour, skip-counting of corrupt records, or a refusal
  on partial stores (5.11, FD5).
- ❌ A runtime schema parse before download (FD5, flagged).
- ❌ A success toast/snackbar. The AC asks for none, and the browser's own download UI is the
  confirmation. (5.9's "success shows confirmation feedback" is about import.)
- ❌ `disabled` on the Export button while exporting (FD8). No new dependency (`file-saver`, etc.).
- ❌ A `NEXT_PUBLIC_APP_VERSION` env var or any `next.config.mjs` change (FD2).
- ❌ A bundle-budget raise (AC9).

### Open flags for the owner (not blockers: the story proceeds on the FDs)

- **FD2: `APP_VERSION` is `apps/web/package.json`'s version, which is `"0.0.0"`.** Every export
  will say `appVersion: "0.0.0"` until someone versions the app. That is honest but uninformative.
  Bumping it is a release decision, not this story's.
- **FD5: there is no runtime self-validation before download.** Tests prove the file parses. If
  you want the product itself to refuse to emit an unparseable file, it is one
  `WorkspaceExportSchema.parse` in `exportWorkspaceToFile`, at a small bundle cost.
- **FD6: Export is unavailable when the Settings page itself is in its error state.** A user whose
  `gol:settings` is corrupt cannot back up their battles from here. Story 5.11's recovery path is
  where that belongs.

### References

- `docs/planning-artifacts/epics.md:1369-1379` (Story 5.5), `:1381-1393` (5.6 reuses "as 5.5"),
  `:1421-1432` (5.9 "Export Current Workspace First (running 5.5)").
- `docs/planning-artifacts/prds/prd-GameOfLife-2026-05-26/prd.md`: FR-8.3 (`:499-505`), FR-6.3
  (`:399-408`), FR-8.4 (`:507-512`, export-first).
- `docs/planning-artifacts/architecture.md`: Decision F / F.1 (`:238-246`), Decision I, M8
  (`:354`).
- `docs/planning-artifacts/rfcs/RFC-006-persistence-workspace-schema.md`: Decision 4
  (`:185-212`).
- `docs/planning-artifacts/ux-designs/ux-GameOfLife-2026-05-27/clinical-lab-theme/settings.html:104-217,369-403`.
- `docs/implementation-artifacts/5-1-settings-page-shell.md` (AC4, FD4, FD6),
  `5-2-workspace-statistics.md` (FD7 `Pick`), `5-3-export-envelope-serializer.md` (FD5 injected
  deps), `5-4-rule-aware-organism-closure.md` (review lessons).
- `docs/implementation-artifacts/deferred-work.md:2192` (Data Management), `:2556-2567`
  (`appVersion`), `:2569-2585` (partial-export gap → 5.11).
- `docs/project-context.md`: repositories injected, no DOM in `packages/*`, no raw hex, axe
  transitions, live-region rule (no dialog here, so an inline alert is safe), `ci:dev` never piped,
  `spec:check` IDs.

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5 (claude-sonnet-5)

### Debug Log References

- `npm run ci:dev` (redirected to a file, not piped, run twice — the first run's real exit code
  was 1, caught by `format:check`; `prettier --write` on the 5 flagged files, rerun, real exit
  code **0**):
  - `typecheck`: pass (all 5 packages).
  - `lint`: pass — 1 pre-existing warning in `BattleGallery.tsx` (`react-hooks/exhaustive-deps`),
    unrelated to this story, 0 errors.
  - `format:check`: pass (after the `prettier --write` above).
  - `spec:check`: **274 cited ids, all resolve** (`AR-2`, `AR-12`, `AR-27`, `AR-44`, `FR-8.3`,
    `FR-6.3`, `Decision F.1`, `Decision I.4` among them — `Decision I.4` resolves via
    `check-spec-ids.mjs`'s sub-decision-declaration fold over architecture.md's `- **I.4 — …`
    list item); 3/3 reconciliation citations resolve.
  - `boundary:check`: pass — 7 escape shapes rejected, 2 legitimate imports accepted.
  - `test:coverage`: pass — `@gol/simulation` 408, `@gol/persistence` 103, `@gol/domain` 202,
    `apps/web` 2075 (all packages' coverage thresholds held; `apps/web` has none, per project rule).
  - `build:standalone`: pass.
  - `bundle:check`: pass, all 5 routes within budget. **`/settings`: ~~291.5 KB gzip before this
    story (Story 5.1's measurement)~~ 291.7 KB gzip before this story (the post-5.2 figure; review
    correction) → 293.7 KB gzip after (budget 305 KB, 11.3 KB headroom)** — ~~+2.2 KB~~ +2.0 KB
    for the Data Management card, the export seam, and `APP_VERSION`. No budget raised.
  - `bench` / `bench:check`: pass — the NFR-1.1 `step()` + repaint-decision benchmark is
    unaffected by this story (no engine-path code touched); 9.302 ms headroom against the
    16.667 ms budget (55.8% of the frame).
  - `e2e:chromium`: pass — **257 passed**, including both new `export workspace (Story 5.5)`
    specs and every pre-existing `settings route (Story 5.1)` spec, unchanged.

### Completion Notes List

- Implemented all 8 tasks: `apps/web/lib/appVersion.ts` (AC5), `apps/web/lib/export/{workspaceExportFilename,downloadJsonFile,exportWorkspaceToFile}.ts` (AC3, AC6), `DataManagement.tsx` + lifted `SettingsCard.tsx` chrome (AC1, AC2, AC8, AC9), wired at `page.tsx`/`SettingsPage.tsx` (AC1, AC7, AC10), tests at every layer (unit, page-boundary wiring, e2e), the four package-file comment rewordings (AC10), and the two `deferred-work.md` closures plus the FD9 entry.
- `WorkspaceStatistics.tsx`'s `Card`/`CardTitle` were lifted into `components/settings/SettingsCard.tsx` (Task 4's preferred option) rather than copied a second time; its rendered DOM/styles are unchanged (`SettingsPage.test.tsx`'s existing statistics assertions stayed green with no edits beyond the added `serializer` prop).
- `SettingsPage.test.tsx`'s "no Epic 6 dead-section text" guard (previously "renders exactly one h1, exactly one h2 …") was updated, not weakened: two `<h2>`s now exist by design (Workspace Statistics + Data Management), and "export" is no longer a forbidden word — it is now a real, live affordance. Import/Auto-Save/Clear All (5.9/6.10/5.10) and Epic 6's rows stay forbidden.
- Every pre-existing `<SettingsPage …/>` render in `SettingsPage.test.tsx` (14 call sites) gained `serializer={{ exportWorkspace: vi.fn() }}` — none of those tests exercise export, so a stub was sufficient and no existing assertion changed.
- The e2e `is prerendered` test's `expect(html).not.toContain('Export')` assertion needed no change: the Data Management card only renders once `useAsyncResource` settles client-side, so the SSR'd/prerendered HTML (status `'loading'`) never contains it.

### File List

**New:**
- `apps/web/lib/appVersion.ts`
- `apps/web/lib/appVersion.test.ts`
- `apps/web/lib/export/workspaceExportFilename.ts`
- `apps/web/lib/export/workspaceExportFilename.test.ts`
- `apps/web/lib/export/downloadJsonFile.ts`
- `apps/web/lib/export/downloadJsonFile.test.ts`
- `apps/web/lib/export/exportWorkspaceToFile.ts`
- `apps/web/lib/export/exportWorkspaceToFile.test.ts`
- `apps/web/components/settings/SettingsCard.tsx`
- `apps/web/components/settings/DataManagement.tsx`
- `apps/web/components/settings/DataManagement.test.tsx`

**Modified:**
- `apps/web/components/settings/WorkspaceStatistics.tsx` (Card/CardTitle lifted to SettingsCard.tsx; DOM/styles unchanged)
- `apps/web/components/settings/SettingsPage.tsx` (serializer prop, renders `<DataManagement>`, AC10 comment rewrites)
- `apps/web/components/settings/SettingsPage.test.tsx` (serializer prop on every render; the dead-section guard test updated)
- `apps/web/app/(gallery)/settings/page.tsx` (builds the serializer at the boundary, AC7)
- `apps/web/app/(gallery)/settings/page.test.tsx` (new AC7 wiring test)
- `apps/web/e2e/settings.spec.ts` (new `export workspace (Story 5.5)` describe block)
- `packages/persistence/src/workspaceSerializer.ts` (comment-only, AC10)
- `packages/persistence/src/index.ts` (comment-only, AC10)
- `packages/persistence/src/repositories.ts` (comment-only, AC10)
- `packages/domain/src/workspaceExportProjection.ts` (comment-only, AC10)
- `docs/implementation-artifacts/deferred-work.md` (two entries struck/closed, one new entry)
- `docs/implementation-artifacts/sprint-status.yaml` (status → in-progress, then review)
- `docs/implementation-artifacts/5-5-export-workspace.md` (this file)

Dev Model: sonnet   # follows existing patterns (5.3's injected serializer, 5.2's Pick prop, 5.1's card chrome); the reusable pieces 5.6/5.9 build on (lib/export seam, APP_VERSION source, download mechanism) are pre-decided in FD2–FD4, so nothing is left to architect.

### Change Log

- Story 5.5: Export Workspace — Data Management card renders on `/settings` for the first time
  (Story 5.1 FD4), with one Export Workspace row that downloads a `kind: 'workspace'` file via the
  reusable `apps/web/lib/export/` seam (Stories 5.6/5.9 will build on it). `APP_VERSION` (`apps/web/lib/appVersion.ts`)
  is now the app's one version source (Story 5.3 FD5's open question, closed).

Proposed lane gate: none   # touches only components/settings, app/(gallery)/settings, new lib/export + lib/appVersion, and comment lines in lane-5 serializer/projection files; no open Epic 4 story (4-20..4-26) uses or reshapes these, and no @gol/domain barrel edit.

---

This story was implemented with the 'Implement next story' skill with the following stats:

| Phase | Agent model | Agents | Active | Wall clock | Input | Output | Cache write | Cache read | Total tokens |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Step 0 — re-entry guard | — | 0 | 15s | 15s | 14 | 2,296 | 6,050 | 391,818 | 400,178 |
| Step 1 — create | opus-5-5 | 1 | 5m 47s | 5m 47s | 112 | 17,659 | 326,713 | 5,962,676 | 6,307,160 |
| Step 2 — implement | sonnet-5 | 1 | 19m 35s | 19m 35s | 570 | 8,729 | 1,159,651 | 52,273,700 | 53,442,650 |
| Step 3 — review + PR | opus-5-5 | 4 | 9m 27s | 9m 27s | 254 | 11,022 | 543,507 | 9,238,538 | 9,793,321 |
| _of which the orchestrator_ | opus-5-5 | — | — | — | 46 | 12,080 | 28,663 | 1,436,035 | 1,476,824 |
| **Total (create → PR ready)** | | 6 | **35m 04s** | 35m 04s | 950 | 39,706 | 2,035,921 | 67,866,732 | **69,943,309** |

Run started 2026-09-24 14:51 CEST; wall clock runs to the point the run stopped for the owner's review. No idle gaps were excluded; Active and Wall clock agree. (A gap counts as idle above 15 min.) Each phase row covers the phase agent, any agents it spawned, and the orchestrator's own turns in that window — the orchestrator row breaks its share out again, it is not additional. Cache reads dominate the token totals and are billed at a fraction of input rate, so read the Input and Output columns for effort and the total only as a ceiling. The orchestrator's final turn is still being written when these numbers are taken.
