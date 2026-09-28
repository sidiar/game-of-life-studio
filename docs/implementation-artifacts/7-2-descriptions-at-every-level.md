---
baseline_commit: 0ab2e3b
---

# Story 7.2: Descriptions at Every Level

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a user,
I want battles, organisms, and whole workspaces to carry open-text descriptions,
so that what I'm observing explains itself — the guide layer the no-tutorial rule allows.

## Acceptance Criteria

1. **Given** `OrganismSchema` and `BattleSchema`, **When** extended, **Then** each gains an optional, length-capped `description` (constants following the `MAX_*_NAME_LENGTH` precedent); every existing stored record parses unchanged, absent ≡ none (FR-9.5)
2. **And** the export envelope gains an optional workspace-level `description`; **`formatVersion` stays 1** (owner ruling 2026-09-28 — no backward-compat obligation; an older build importing a newer file strips descriptions silently, accepted) and all three levels round-trip export → import (FR-9.5)
3. **And** the 7.1 manifest's per-preset description becomes a projection: the lockstep test asserts manifest description ≡ envelope description (FR-9.1, FR-9.5)
4. **Given** the Organism Editor and the Battle Editor, **When** editing, **Then** each offers a description field near the name, participating in the existing dirty tracking, validation, and save paths (FR-9.5)
5. **Given** display surfaces, **When** a description exists, **Then** it is shown read-only where the entity is observed — organism cards, battle surfaces (visible from Play Mode's vicinity, not buried in Edit), and a home for the workspace description (gallery header is the candidate; placement per the UX notes) — and an absent description renders nothing, no placeholder chrome (FR-9.5)

## Tasks / Subtasks

- [x] **Task 1 — Domain: caps, schemas, the absent-normalizer** (AC: 1, 2)
  - [x] 1.1 `organismSchema.ts`: `MAX_ORGANISM_DESCRIPTION_LENGTH = 280` beside `MAX_ORGANISM_NAME_LENGTH`, with a WHY comment in the same voice (FD1); `OrganismSchema.description: z.string().max(MAX_ORGANISM_DESCRIPTION_LENGTH).optional()`. `ORGANISM_SCHEMA_VERSION` stays `1` — an additive optional field needs no restamp (Decision I.4).
  - [x] 1.2 `battleSchema.ts`: `MAX_BATTLE_DESCRIPTION_LENGTH = 280`; add the same optional field to **both** `BattleSchema` and `BattleSummarySchema` (the summary's Zod strip IS its projection — omit it there and the gallery never sees it). Update the summary's comment block that enumerates its field list.
  - [x] 1.3 New `packages/domain/src/workspaceMetaSchema.ts`: `MAX_WORKSPACE_DESCRIPTION_LENGTH = 500`, `WorkspaceMetaSchema = z.object({ description: z.string().max(MAX_WORKSPACE_DESCRIPTION_LENGTH).optional() })`, `type WorkspaceMeta`, `EMPTY_WORKSPACE_META` (frozen `{}`) (FD4).
  - [x] 1.4 Shared helper `normalizeDescription(text: string): string | undefined` (in `workspaceMetaSchema.ts` or a sibling `description.ts`): trims; returns `undefined` for an empty/whitespace-only result (FD2). Every save/export builder uses it so absent ≡ none has one definition.
  - [x] 1.5 `workspaceExportSchema.ts`: `BattleExportSchema.description` optional + capped; `WorkspaceExportSchema.description: z.string().max(MAX_WORKSPACE_DESCRIPTION_LENGTH).optional()` at the envelope's top level (FD3). `formatVersion` stays `z.literal(CURRENT_FORMAT_VERSION)` = 1. Add a comment beside the new envelope field recording the owner ruling (older v1 build strips it silently — accepted) — the Zod-strip mechanism the `settings` comment already describes.
  - [x] 1.6 `workspaceExportProjection.ts`: `toBattleExport` / `fromBattleExport` carry `description` **only when present** (`...(b.description !== undefined && { description: b.description })`) — writing `description: undefined` breaks the exact-`toEqual` round-trip tests. `toEnvelope` gains an optional workspace description (extend `ExportMeta` or add a parameter — dev's call) emitted only when defined; `fromEnvelope` returns `{ battles, organisms, meta: WorkspaceMeta }`.
  - [x] 1.7 `pristineWorkspace.ts`: `isPristineWorkspace(battleCount, organisms, workspaceDescription?: string)` — a non-empty (post-normalize) workspace description ⇒ NOT pristine (FD6). Default keeps the two existing test files compiling.
  - [x] 1.8 Barrel (`index.ts`): export the three caps, `WorkspaceMetaSchema`, `WorkspaceMeta`, `EMPTY_WORKSPACE_META`, `normalizeDescription`.
  - [x] 1.9 Tests (domain is ≥90% **per file**): cap boundaries for all three (at-cap passes, cap+1 fails, `battleSchema.test.ts:150` precedent); a record without `description` parses and comes back **without the key**; `BattleSummarySchema` keeps `description`; projection round-trip with and without descriptions at all three levels (extend the fast-check round-trip generators to sometimes include one); `toEnvelope` output has no `description` key when none is given (`workspaceExportProjection.test.ts:239` "…and nothing else" stays true); pristine false with a description. Update `battleSchema.test.ts:186-195`'s exact-key assertion only if its fixture gains a description.

- [x] **Task 2 — Persistence: the `gol:workspace` key and its port** (AC: 2)
  - [x] 2.1 `localStorageAccess.ts`: add `workspace: 'gol:workspace'` to `STORAGE_KEYS`; add it to `DATA_KEYS` (Clear All clears it — Decision F.2 extended, not changed: still never settings). New `writeMetaKey(key, value)`: runs `ensureCurrentAtRestFormat()` then `writeKey` **and does not stamp** (FD4 — stamping would re-open the stamped-but-no-Conway seeding hole on an unstamped store; skipping the format check would let this build write into a newer-format store, AR-11).
  - [x] 2.2 `RawDataKeys` gains `workspace`; `captureDataKeys` captures it; `restoreDataKeys` removes/restores it with the other data keys (stamp still removed first and written last). Extend the foreign-snapshot type guard to the new field. This is what keeps a failed import's rollback byte-identical for the description.
  - [x] 2.3 At-rest migration: **do not** extend `ensureCurrentAtRestFormat`'s doc or `writeBackMigrated` (the registry is empty; nothing migrates it yet). Add a comment at both sites naming `gol:workspace` as not yet carried, and a `deferred-work.md` entry: the first `formatVersion` bump that touches workspace meta must add it to the doc, the candidates and the rollback (FD4).
  - [x] 2.4 `repositories.ts`: `WorkspaceMetaRepository { load(): Promise<WorkspaceMeta>; save(meta: WorkspaceMeta): Promise<void> }` — `load` never null, absent ⇒ `{}` (the `SettingsRepository` shape); a present-but-invalid record throws `CorruptDataError('gol:workspace')`. `AppRepositories.workspaceMeta: WorkspaceMetaRepository`. Update the doc comments that say "battles + organisms" (`WorkspaceSnapshot`, `clearAll`).
  - [x] 2.5 New `localStorageWorkspaceMetaRepository.ts` modelled on `localStorageSettingsRepository.ts` (33 lines) but writing through `writeMetaKey`; `save` normalizes (FD2) and writes `{}` when there is no description (or removes the key — pick one, pin it in a test). Wire into `createLocalStorageRepositories.ts`; export the type from `index.ts`.
  - [x] 2.6 `workspaceSerializer.ts`: `exportWorkspace` reads `repos.workspaceMeta.load()` in its `Promise.all` and passes the description to `toEnvelope`; **`exportBattle` carries no workspace description** (FD3). A corrupt `gol:workspace` must not fail the export: catch its `CorruptDataError` and export without a description (the same fault-isolation stance `listFull()` takes for a corrupt record) — pin it.
  - [x] 2.7 `workspaceImport.ts` `applyImport`: inside the guarded try, after `battles.replaceAll` and before `ensureDefaultOrganism`, `await repos.workspaceMeta.save(incoming.meta)` when it carries a description (`clearAll` already removed the old one). Update the pipeline header (step 6) and the Decision F paragraph.
  - [x] 2.8 `packages/test-utils/src/fakeRepositories.ts`: `workspaceMeta` member mirroring the real contract — no stamp on save; `clearAll` clears it; `FakeWorkspaceData` + `snapshotWorkspace`/`restoreWorkspace` carry it (extend the `instanceof Map` guard); `storageUsage` pushes the `gol:workspace` entry through `storageBytesOf`; `FakeSeed` gains `workspaceMeta?` (validated via `parseSeed`) and `raw.workspaceMeta?`.
  - [x] 2.9 Tests (persistence ~80% aggregate, test-utils ~80%): repo absent ⇒ `{}`, round-trip, corrupt ⇒ `CorruptDataError`, save does **not** stamp a fresh store, save refuses a newer-format store; `clearAll` clears it and keeps settings + stamp; snapshot/restore restores it byte-identical including absent; import writes it, import of a file without one leaves none, a write failure after it rolls it back; serializer export includes it / `exportBattle` omits it / corrupt meta degrades. **Update deliberately** (they pin the old key set): `localStorageAccess.test.ts:206-220, 249-261, 285`; `createLocalStorageRepositories.test.ts:157, 184, 203-216` (the `removeItem` order — keep stamp-first); `fakeRepositories.test.ts` clearAll/storageUsage/snapshot cases.

- [x] **Task 3 — Organism Editor + organism cards** (AC: 4, 5)
  - [x] 3.1 `apps/web/lib/organisms/organismDraft.ts`: `OrganismDraft` gains `description: string` (always a string in the draft); `createNewOrganismDraft` seeds `''`; `organismDraftFrom` seeds `organism.description ?? ''`; **add it to `isOrganismDraftDirty`** (field-by-field — miss it and edits never dirty the editor); `validateOrganismDraft` pushes a `{ kind: 'description' }` over-limit error right after the name's (document order).
  - [x] 3.2 New `apps/web/lib/organisms/organismDescription.ts` mirroring `organismName.ts`: over-limit check + message only (optional field — no "required" error).
  - [x] 3.3 `organismRecord.ts` `projectOrganismForSave`: add `description` via `normalizeDescription`, **key omitted when absent** — `organismDraft.test.ts:95-100`'s `projectOrganismForSave(organismDraftFrom(o))` `toEqual(o)` identity must stay green over `CONWAYS_CLASSIC` and the mocks (it also keeps `isPristineWorkspace` deep-equal working: a description key on Conway's Classic makes the workspace non-pristine, correctly).
  - [x] 3.4 `organismClone.ts` `cloneOrganismRecord`: carry `description` (conditional spread). Add a clone test.
  - [x] 3.5 New `apps/web/components/organisms/editor/OrganismDescriptionField.tsx`: a `styled('textarea')` reusing the name input's rules + `resize: vertical`, `min-height` ~72px (mockup); label "Description", helper line "Optional. Shown on the organism's card." (`Description` from `fieldStyles.ts`); the **name field's refuse pattern** (FD8): no `maxLength` attribute, `N / 280` counter, over-limit error `role="alert"` with `aria-invalid`/`aria-describedby` exactly as `OrganismNameField.tsx:136-187`, `showAllErrors`, and a `data-organism-description` focus hook. No `aria-live` counter.
  - [x] 3.6 `OrganismEditorModal.tsx`: `setDescription` beside `setName` (618-629); mount the field directly after `<OrganismNameField>` (~1098-1102) with `showAllErrors={saveAttempted}`; add the `description` case to `errorTargetSelector` (396-408). The battle-origin editor (`BattlePage.tsx:1641`) mounts the same modal — nothing separate.
  - [x] 3.7 `OrganismCard.tsx`: wrap `CardName` in a `minWidth: 0` column and render a `CardDescription` `<p>` under it **only when** `normalizeDescription(organism.description ?? '')` is defined; 13px, `--gol-text-secondary`, `overflowWrap: 'anywhere'`, `whiteSpace: 'pre-line'`, 2-line clamp (`display: '-webkit-box'`, `WebkitLineClamp: 2`, `WebkitBoxOrient: 'vertical'`, `overflow: 'hidden'` — first clamp in the codebase; put it in one shared style object both clamps use). Switch `CardHeader` to `alignItems: 'flex-start'` if the chip re-centres badly. Read `organism.description` directly — do **not** widen `DisplayOrganism` (`displayOrganisms.test.ts:9` pins it). No new tab stop: the card is deliberately non-interactive, and the full text is reachable through the existing Edit action (FD10).
  - [x] 3.8 Tests: `organismDraft.test.ts:27-33` (new-draft `toEqual` gains `description: ''`); dirty on description edit; over-limit blocks Save and focuses the field; save writes/omits the key; `OrganismEditorModal.test.tsx:204` and `:564` textbox counts (2 → 3) and the tab-order test at `:458-472` (description now between name and Change Color); card renders description / renders **nothing** (no element) without one / whitespace-only ⇒ nothing; axe on the card and modal. Check `apps/web/e2e/organisms.spec.ts` Tab sequences.

- [x] **Task 4 — Battle Editor + battle surfaces** (AC: 4, 5)
  - [x] 4.1 `newBattleDraft.ts` / `useBattleDraft.ts` `toDraft()`: carry `description` (`''` for new, `battle.description ?? ''` for loaded).
  - [x] 4.2 `BattlePage.tsx`: a `descriptionState` twin of `nameState` (419-431, same value-keyed reseed); `handleDescriptionChange` copying `handleNameChange` (472-478) **including the `savingRef` lock** and `setIsDirty(true)`; pass into `persistBattle` and **add it to `persistBattle`'s deps** (984) — a stale closure saves the old text. Not part of undo history (the name isn't either).
  - [x] 4.3 `battleRecord.ts` `projectBattleForSave`: `BattleRecordStamps` gains `description?: string`; the return writes it via `normalizeDescription`, key omitted when absent (the builder is field-by-field — miss it and save drops it silently).
  - [x] 4.4 New `apps/web/components/battle/editor/BattleDescriptionField.tsx` following **`BattleNameField`'s clamp pattern** (FD8): fully controlled, native `maxLength` **and** `.slice(0, maxLength)` in `onChange`, `N / 280` counter via `aria-describedby`, the at-cap `role="status"` notice ("Description limit reached — 280 characters."), `disabled` during save. No MUI TextField (bundle rule in `BattleNameField.tsx:95-103`). Mount it in `BattleEditorView.tsx` directly under `<BattleNameField>` inside the "Battle Name" `SidebarSection` (910-920) — or retitle that section "Battle Details" if two fields under "Battle Name" reads wrong (dev's call; keep the section order).
  - [x] 4.5 `BattleHeader.tsx`: optional `battleDescription` prop; render it under the `<Title>` h1 in a `minWidth: 0` column as quiet supporting text (13px, secondary, `max-width: 640px`, `whiteSpace: 'pre-line'`, `overflowWrap: 'anywhere'`), in **both** Lab and Run — full text, not clamped (FD9: the mockup's §4 "play-description"; the 280 cap bounds it to ~3 lines). Absent ⇒ no element. `BattlePage` passes the **saved** description (the loaded draft's, not the live edit) so the header does not reflow per keystroke; verify the editor canvas auto-fit (`BattlePage.tsx:172-188`) still fits after the header grows (measure-based, but check at the 1194×834 tablet project). Fullscreen overlay: out of scope.
  - [x] 4.6 `BattleTile.tsx` + `BattleGallery.tsx`: pass `description={summary.description}` (tiles are built field-by-field at 349-363); render a clamped (2-line, shared clamp style) `<p>` **between `PetriDish` and `TileFooter`** (mockup §1 `.tile-description`), only when present. Plain text under the title link's `::after` overlay — no new tab stop; `BattleTile.test.tsx`'s pinned tab order must stay green.
  - [x] 4.7 Tests: `battleRecord.test.ts` writes/omits; BattlePage: description edit dirties, save persists it (extend the field-by-field saved-record assertions ~1709/1803), reload shows it, locked during save; `BattleDescriptionField` clamp + counter + notice + axe; `BattleHeader` shows/omits; tile shows/omits (no element when absent).

- [x] **Task 5 — Workspace description: home + authoring** (AC: 2, 5)
  - [x] 5.1 Gallery header (`BattleGallery.tsx:317-325`): new prop `workspaceMeta: Pick<WorkspaceMetaRepository, 'load'>`, passed from `app/(gallery)/page.tsx` as `repositories.workspaceMeta`. Load it inside the existing `refresh()` `Promise.all` (251-268) with `.catch(() => EMPTY_WORKSPACE_META)` — cosmetic data degrades like settings, never blocks the page (FD4). Carry it through the `loadReducer` success action / `GalleryState`. Render under `SectionSubtitle` as quiet supporting text (mockup `.workspace-description`: 14px secondary, `max-width: 760px`, 2px left border in `--gol-border`, `whiteSpace: 'pre-line'`) — only when present.
  - [x] 5.2 Settings authoring row (FD7): new `apps/web/components/settings/WorkspaceDescriptionRow.tsx` in the Data Management card, **first row** (above Export — it is what Export will carry). `Row > RowInfo(RowLabel "Workspace description" + RowDescription "Shown at the top of the gallery and carried by Export Workspace.")`, a textarea with the 500 cap (BattleNameField-style clamp + counter; label via `aria-labelledby` to the `RowLabel` h3 or a visually hidden `<label>`), and a Save button styled like `ExportButton` (never `disabled` — FD8 keyboard-trap rule, `pendingRef` no-op instead). Use a column/wrapped layout inside the row rather than changing the shared `Row`. Loads its own value on mount (`workspaceMeta.load()`, failure ⇒ empty + keep the row usable); save flow = `pendingRef` guard → `onMessage(null)` → `await save` → publish `{ role: 'status', text: 'Workspace description saved.' }` / alert if still mounted. Add `'description'` to `DataManagement`'s `OutcomeSource`; mount with `onMessage={(n) => publish('description', n)}`. Re-load its text after `onImported` / `onCleared` (bump a key or pass a reload token).
  - [x] 5.3 `DataManagement` Export row copy (`:209` "all your battles and organisms") → mention descriptions/the workspace description if it now reads false; keep the Clear All dialog copy truthful (it now also clears the workspace description).
  - [x] 5.4 `ImportWorkspaceRow.tsx:198-201`: read `workspaceMeta.load()` alongside `battles.list()`/`organisms.list()` and pass the description to `isPristineWorkspace` (FD6); a rejected read ⇒ not pristine (existing FD3 posture).
  - [x] 5.5 Tests: gallery header shows/omits; a rejected `workspaceMeta.load()` still renders the gallery; row save → status in the shared slot; concurrent second click no-op; reload after import/clear; pristine=false with only a description ⇒ the warning dialog shows. `DataManagement.test.tsx:45-56` `baseProps()` gains the prop; check `SettingsPage.test.tsx:243` button-label lists.

- [x] **Task 6 — Preset manifest projection + starter regeneration** (AC: 3)
  - [x] 6.1 `presetWorkspaces.test.ts`: in the envelope loop, assert `envelope.description === entry.description` (message names the file and both values). The manifest keeps its own `description` (the Settings loader, 7.5, reads the manifest without fetching every envelope) — it is a projection, pinned by this assertion, never a second source.
  - [x] 6.2 Regenerate `apps/web/public/workspaces/starter-workspace.json` **through the serializer** (7.1 FD4 — never hand-edit): route (a) in-app (dev server → Settings → set the workspace description to the manifest's current sentence → Export Workspace) or route (b) the throwaway-script composition from 7.1's Debug Log with `repos.workspaceMeta.save({ description: <manifest sentence> })` before `exportWorkspace()`. Then `npx prettier --write apps/web/public/workspaces/`. Record the route in the Dev Agent Record. The content is otherwise unchanged (7.3 replaces it).
  - [x] 6.3 `presetManifest.ts`: update the head comment's last Story 7.2 sentence ("nothing here anticipates that") and the `PresetWorkspaceEntry.description` doc to say it must equal the envelope's workspace `description`, enforced by the lockstep test; add "set the workspace description in Settings" to the authoring steps.

- [x] **Task 7 — E2E, docs, verify** (AC: 1–5)
  - [x] 7.1 One Chromium-meaningful e2e in `apps/web/e2e/settings.spec.ts` (or `gallery.spec.ts`): import an envelope carrying all three descriptions (extend the organism literal at `settings.spec.ts:314-330`) → gallery shows the workspace description and the tile description → organisms page shows the card description → open the battle and see the description in the header in Run mode. Plus: an organism/battle without a description renders no description element.
  - [x] 7.2 `deferred-work.md`: a **variance entry** — `gol:workspace` extends RFC-006 Decision 7's closed four-key list and Decision 1's `AppRepositories`; Decision F.2 / FR-8.5 "clearAll clears battles + organisms" now also clears workspace meta (still never settings). Plus the at-rest-migration blind spot from 2.3. Do not edit the RFC or architecture doc (surface, don't silently amend — CLAUDE.md).
  - [x] 7.3 `npm run ci:dev` green (never four-browser `npm run ci`). If `bundle:check` shows route growth, refresh the baseline in the same change (`npm run build:standalone` → `npm run bundle:baseline`) and commit the JSON — never hand-edit it.

### Review Findings

_Code review 2026-09-28 (Sonnet; Blind Hunter + Edge Case Hunter + Acceptance Auditor, full diff `0ab2e3b..e0faec9`): 6 decision-needed, 4 patch, 0 defer, 5 dismissed._

- [x] [Review][Decision] `gol:workspace` + `AppRepositories.workspaceMeta` extends RFC-006's closed key/port shapes (FD4) — already disclosed as a variance in `deferred-work.md`, surfaced here per CLAUDE.md's "surface, don't silently pick one." Options: **(a)** fold the extension into RFC-006 Decision 7 (key list) and Decision 1 (`AppRepositories` shape) now; **(b)** leave it as a disclosed variance and revisit when a second story needs the pattern; **(c)** rule the addition invalid and redesign the seam. [docs/implementation-artifacts/deferred-work.md:3960-3972]
  - **Owner ruling (Sidiar, 2026-09-28): (a) — fold it into the specs, as a new Minor Spec Resolution `M16` in `architecture.md`** (not an amendment to Decision F, which stays about settings; the M14/M15 precedent for story-found spec gaps). Propagate consistently: RFC-006 Decision 7 key list → five keys (+ `gol:workspace`); RFC-006 Decision 1 `AppRepositories` → + `workspaceMeta: WorkspaceMetaRepository`; Decision F.2 / RFC-006 `clearAll()` / architecture.md Cross-RFC Reconciliation #1 and M8 wording → "battles + organisms + workspace meta — never `gol:settings`"; M16 also records that `gol:workspace` is not yet carried by the at-rest format chain and that **the first `formatVersion` bump must add it** (doc, candidates, rollback). Widen `scripts/check-spec-ids.mjs`'s bound to `M16`; FR-8 traceability row cites M16. Then retire the corresponding ⚠️ variance entry in `deferred-work.md` (resolved → M16). PRD FR-8.5 text is product-owned: flag it, do not edit it silently.
- [x] [Review][Decision] `WorkspaceDescriptionRow` adds a brand-new Settings **authoring** surface (FD7) — the ACs only require a *display* home for the workspace description; import already made one settable. Options: **(a)** keep the authoring row as shipped; **(b)** cut it from this story (import-only, non-editable workspace description) and give Story 7.3+ the authoring UI once export/preset needs are clearer. [apps/web/components/settings/WorkspaceDescriptionRow.tsx]
  - **Owner ruling (Sidiar, 2026-09-28): (a) — keep the authoring row as shipped** in Settings → Data Management. It is the surface FR-9.5 ("editable in the app") and FR-9.1 (presets authored in-app, never handwritten) imply but never name; Story 7.3 needs it to author the showcase preset's workspace description. No PRD change. Add one line to `docs/planning-artifacts/ux-designs/ux-GameOfLife-2026-05-27/preset-workspace-library-design.md`'s "Workspace description" bullet naming Settings → Data Management as its edit surface (the gallery header stays display-only).
- [x] [Review][Decision] `isPristineWorkspace` now treats a workspace holding only a description (zero battles, stock Conway's Classic) as **not pristine** (FD6), so Import's destructive-replace warning fires solely because someone typed a workspace description. Options: **(a)** keep as shipped (a description is user content the replace would destroy); **(b)** exclude the description from the pristine check so only battles/organisms gate the warning. [packages/domain/src/pristineWorkspace.ts:63-77]
  - **Owner ruling (Sidiar, 2026-09-28): (a) — keep as shipped.** A user-typed workspace description is data the destructive replace would destroy, so it makes the workspace non-pristine and the FR-8.4 warning fires (consistent with M16 treating it as data for Clear All). No code change; M16 states it in one clause (pristine = zero battles + stock Conway's Classic only + no workspace description).
- [x] [Review][Decision] Clear All's dialog body (`CLEAR_ALL_WARNING_TEXT`, documented as "FR-8.5's warning sentence, verbatim" from Story 5.10's AC2) and the Clear button's accessible name (`"Clear data (all battles and organisms)"`) were left unchanged even though Clear All now also deletes the workspace description, and `ClearAllDataRow`'s own row blurb was updated to say so — Task 5.3 asked to "keep the Clear All dialog copy truthful." Already flagged as open drift in `deferred-work.md`. Options: **(a)** update both strings now to name the workspace description (a wording change beyond Story 5.10's pinned AC2 text, pending unless FR-8.5 itself is reworded); **(b)** leave as disclosed drift until the FD4 decision above is resolved, since folding `gol:workspace` into FR-8.5 formally is what would license the wording change; **(c)** other. [apps/web/lib/clearAll/clearAllMessages.ts:8-9, apps/web/components/settings/ClearAllDataRow.tsx:213]
  - **Owner ruling (Sidiar, 2026-09-28): (b) — leave it.** PRD FR-8.5's sentence, `CLEAR_ALL_WARNING_TEXT` and the Clear button's accessible name all stay as they are ("all battles and organisms"); the understatement is accepted for short explanatory text, and `ClearAllDataRow`'s row blurb already names the workspace description. No code or PRD change. Reword the matching `deferred-work.md` entry from open drift to an accepted, owner-ruled wording choice.
- [x] [Review][Decision] `WorkspaceDescriptionRow`'s in-flight `save()` is not cancelled, awaited, or ordered against Import/Clear All's replace/clear of the same `gol:workspace` key — FD6's "no cross-row locking" precedent was written for the read-only pristine check and for which row's *status message* wins (`DataManagement`'s `ownerRef`/`publish`), not for two writers of the same storage key. If a description Save is in flight when Import or Clear All completes, the save can land after the destructive operation and either resurrect a stale description post-Clear-All or clobber the freshly imported one. Options: **(a)** have Import/Clear All await or cancel a pending description save before proceeding; **(b)** disable/ignore the description Save while an Import or Clear All is in flight; **(c)** accept as an extension of the existing FD6 "no cross-row locking" stance and document it explicitly there. [apps/web/components/settings/WorkspaceDescriptionRow.tsx:137-151, apps/web/components/settings/DataManagement.tsx:237-250]
  - **Owner ruling (Sidiar, 2026-09-28): (c) — accept and document; no coordination code.** The race is unreachable in localStorage mode: `LocalStorageWorkspaceMetaRepository.save()` calls `writeMetaKey` synchronously before any `await` (the write lands at click time; only the status message is pending), Import and Clear All run behind modal confirmation dialogs, and `DataManagement` remounts the row (`descriptionKey`) after both, so no stale text survives in the field. Add a comment at `WorkspaceDescriptionRow`'s save handler and extend FD6's "no cross-row locking" note stating exactly this; add a `deferred-work.md` entry: connected mode (async `WorkspaceMetaRepository`) must order a description save against Import/Clear All.
- [x] [Review][Decision] `WorkspaceDescriptionRow` has no dirty-tracking or leave-guard, unlike the Organism/Battle editors' full dirty-tracking + `useLeaveGuard` (AC4 for those editors) — a user who edits the workspace description and navigates away without pressing the always-enabled Save button loses the edit silently, with no `useLeaveGuard`-style warning and no `data-dirty` hook for e2e verification. Options: **(a)** add a lightweight leave-guard/beforeunload warning matching the editors' pattern; **(b)** accept as an intentionally lighter-weight Settings row (no other Settings field carries such a guard either) and document the gap; **(c)** auto-save on blur instead of a manual Save button, removing the loss window. [apps/web/components/settings/WorkspaceDescriptionRow.tsx:153-186]
  - **Owner ruling (Sidiar, 2026-09-28): (b) — accept as a lighter-weight Settings row; no leave guard, no auto-save.** FR-8.1 permits "apply immediately or on confirm"; this row is the on-confirm form with a visible Save directly under the field, and `useLeaveGuard` is editor machinery not worth generalizing for a few sentences of text. Record the accepted gap in one line in the story's FD notes and a `deferred-work.md` entry (revisit if users lose edits).
- [x] [Review][Patch] `WorkspaceExportSchema`'s `superRefine` enforced battle-count cardinality for `kind: 'battle'` but never enforced the schema's own documented invariant "a `kind: 'battle'` file never carries [a `description`]" — a hand-edited/corrupted single-battle file carrying a top-level `description` parsed successfully and `applyImport` would silently set the importer's workspace description from it (it branches on presence, not `kind`). Added a matching refinement issue at the `description` path, alongside the existing cardinality check; covered by two new tests. [packages/domain/src/workspaceExportSchema.ts, packages/domain/src/workspaceExportSchema.test.ts]
- [x] [Review][Patch] `WorkspaceDescriptionRow`'s Save fired from `value` (initial `''`) even before the mount effect's `load()` resolved: a Save click that landed first wrote `''` over the real stored description, and the load's own `.then` (unaware a save had just run) then repainted the field with the pre-save text — storage and UI silently disagreed. Added a `loadedRef` guard so Save is a no-op (matching the existing `pendingRef` no-op-not-disabled pattern, FD8) until the initial read has settled, success or failure alike. Covered by a new regression test. [apps/web/components/settings/WorkspaceDescriptionRow.tsx]
- [x] [Review][Patch] `isPristineWorkspace`'s new guard clause was a braceless multi-line `if` — a latent trap for a future edit adding a second statement to the branch without adding braces. Reformatted with braces (Prettier-applied); behaviour unchanged. [packages/domain/src/pristineWorkspace.ts:68-73]
- [x] [Review][Patch] `BattleHeader.tsx`'s `TitleColumn` comment claimed `minWidth: 0` "moves here from being only the h1's concern," but the `Title` (`<h1>`) styled block still independently keeps its own `minWidth: 0` a few lines above — the rule was duplicated, not moved, and the comment misdescribed it for the next reader. Corrected the wording. [apps/web/components/battle/BattleHeader.tsx:32-47]

Dismissed as noise (5): `OrganismDescriptionField`'s unused `showAllErrors` prop (documented intentional parity — the description's only error is immediate regardless of the prop, verified against `OrganismNameField`'s actual Save-time-override use of it); `WorkspaceMetaRepository.save()` / the fake repository's `workspaceMeta.save()` not re-validating the cap before writing (matches `LocalStorageSettingsRepository.save()`'s identical no-validation-on-write pattern — not a new deviation); `WorkspaceDescriptionRow`'s Save button giving no in-flight affordance (documented FD8 design, matching `ExportButton`'s identical precedent); `exportBattle` never carrying the workspace description (flagged and accepted as intentional per M8 in the story's own Dev Notes, not a new defect).

`npm run ci:dev` after patches: see Dev Agent Record.

## Dev Notes

### Forced decisions (made here so the dev agent does not have to)

- **FD1 — Caps: organism 280, battle 280, workspace 500** (UTF-16 code units, what `z.string().max()` measures). 280 is the mockup's organism cap (`preset-workspace-library.html:403`, "/ 280"); battles take the same number because the battle description renders **unclamped** in the header (FD9) and 280 bounds that to ~3 lines at the mockup's 640px. The workspace line is one per workspace and gets more room. Constants live beside their `MAX_*_NAME_LENGTH` twins (workspace in its new schema file); components import them, never re-type the number.
- **FD2 — Absent ≡ empty ≡ whitespace-only, and it is normalized at write time.** Schemas accept `description?: string` (no `.min(1)`: a stored `''` must not turn a record corrupt). Every builder (organism save, clone, battle save, workspace meta save, export projection) goes through `normalizeDescription` — trim, `undefined` if empty — and **omits the key** rather than writing `undefined`/`''`. Display surfaces render only when the normalized value is defined. This keeps the draft↔record identity tests, the envelope exact-shape test and `isPristineWorkspace`'s deep-equal working.
- **FD3 — Wire shape.** Organism: automatic (`WorkspaceExportSchema.organisms` reuses `OrganismSchema`). Battle: `BattleExportSchema.description` + the two projection functions (both field-by-field today — they drop it otherwise). Workspace: a **top-level** optional `description` on the envelope (not a `workspace: {}` sub-object — one field, and the epic names "a workspace-level `description`"). `formatVersion` stays 1 (owner ruling, FR-9.5). **`exportBattle` (kind `'battle'`) carries no workspace description** — the file is one battle, not a workspace; importing it replaces the workspace (M8) and so clears the importer's description. That is M8 working as specified.
- **FD4 — The workspace description lives in a new data key `gol:workspace` behind a new port `AppRepositories.workspaceMeta`.** It has no other home: `gol:settings` is device-local, never exported and survives Clear All (Decision F / AR-12) — the opposite of every property this value needs (travels with export, replaced by import, cleared by Clear All). Rules: in `DATA_KEYS`; captured/restored by the import snapshot; counted by the storage meter (automatic via `STORAGE_KEYS`); written with the format check but **without stamping** (a description is not the workspace's initialization; stamping it could strand an unstamped store without Conway's Classic — the seeding-hole comment in `localStorageAccess.ts`); a corrupt record throws `CorruptDataError('gol:workspace')` from the repository but **every UI reader degrades to no description** (gallery `.catch`, export omits it, Settings row starts empty) — never a page-blocking storage-failure notice. `clearAll()` clearing it is what lets `resetWorkspace`/`recoverWorkspace` heal a corrupt one with no signature change. **This extends RFC-006 Decision 7 and Decision 1 — record the variance (Task 7.2).** **→ Folded into the specs as M16 (owner ruling, 2026-09-28).**
- **FD5 — Import writes the description inside the guarded region** (after `battles.replaceAll`, before `ensureDefaultOrganism`), so a failure after it rolls it back through the snapshot like every other write.
- **FD6 — A workspace description makes the workspace non-pristine.** It is user content the destructive replace would destroy; skipping the FR-8.4 warning over it would be silent data loss. Stories 7.4 (fresh gate — unaffected) and 7.5/7.6 (pristine suppression) inherit this through `isPristineWorkspace`.
- **FD7 — The workspace description is edited in Settings → Data Management**, not the gallery. The epic's ACs only require a display home, but FR-9.5 says descriptions are "editable in the app" and FR-9.1 forbids handwriting preset JSON — without an in-app editor, Story 7.3 could not author its preset's workspace description at all. Settings is where workspace-level operations live (Export/Import/Clear All); an edit affordance on the gallery header would be exactly the "add a description" nudge / placeholder chrome the UX notes forbid when the description is absent. **Accepted gap (owner ruling, 2026-09-28):** the row has no dirty-tracking or leave guard — a lighter-weight Settings row (FR-8.1 "apply on confirm", Save directly under the field); unsaved edits are lost on navigation, tracked in `deferred-work.md`.
- **FD8 — Each description field copies its own editor's name-cap pattern** (UX notes §5: "Cap feedback follows the existing name-cap pattern"). Organism Editor: **refuse** (no `maxLength`, over-limit error, Save gate, focus target — `OrganismNameField` FD1). Battle Editor and the Settings row: **clamp** (`maxLength` + `.slice`, counter, at-cap status notice — `BattleNameField`). The two editors already differ; do not unify them here.
- **FD9 — Battle description in the Battle page = under the h1 in `<BattleHeader>`, both modes, unclamped.** The mockup's §4 places it "under the battle name in the run header"; the header is visible in Run (Play) mode and Lab alike, which satisfies "visible from Play Mode's vicinity, not buried in Edit". Shows the saved value (not per-keystroke). Fullscreen overlay out of scope.
- **FD10 — Clamps: 2 lines on organism cards and gallery tiles; full text elsewhere.** The UX note's "full text on the card's existing expansion/detail affordance" — the card has none (it is deliberately non-interactive); the existing detail affordance is **Edit**, which shows the full text in the editor. Do not add a show-more toggle (new tab stop, breaks the pinned tab-policy tests). The clamped text stays whole in the accessibility tree. `whiteSpace: 'pre-line'` keeps author newlines; plain text only — no markdown, no links (UX §5).
- **FD11 — Dev fixtures (`mockWorkspace.ts`) stay description-less.** Content is 7.3's. A fixture change would also change what the starter preset regeneration produces beyond the one workspace sentence.

### What exists: read these before writing a line

Domain / persistence (all field-by-field — a missed builder drops the field **silently**, because every `z.object` strips unknown keys):
- `packages/domain/src/organismSchema.ts`, `battleSchema.ts` (`BattleSchema` + `BattleSummarySchema`), `workspaceExportSchema.ts`, `workspaceExportProjection.ts` (`toBattleExport` 85-94, `fromBattleExport` 130-140, `toEnvelope` 149-168, `fromEnvelope` 175-186), `pristineWorkspace.ts`, `formatMigrations.ts` (`MIGRATIONS` empty; `MigratableDocument` open-ended).
- `packages/persistence/src/localStorageAccess.ts` — `STORAGE_KEYS` (8-13), `DATA_KEYS` (20), `ensureCurrentAtRestFormat` (166-220), `writeBackMigrated` (281-315), `writeDataKey` (357, stamps) / `writeSettingsKey` (376, no check), `removeDataKeys`, `RawDataKeys`/`captureDataKeys`/`restoreDataKeys` (386-437), `measureStorageUsage`.
- `packages/persistence/src/repositories.ts`, `createLocalStorageRepositories.ts`, `localStorageSettingsRepository.ts` (template), `workspaceSerializer.ts`, `workspaceImport.ts` (`applyImport` 145-179), `resetWorkspace.ts`/`recoverWorkspace.ts` (unchanged signatures).
- `packages/test-utils/src/fakeRepositories.ts` — the only other `AppRepositories` implementation (typed literal at :265 — will not compile without the new member). apps/web test objects spread a real fake, so they keep compiling.

apps/web:
- Organism: `lib/organisms/organismDraft.ts` (type 33-35, seeds 57-65/78-86, validate 126-151, dirty 191-201), `organismName.ts`, `organismRecord.ts:33-57`, `organismClone.ts:84-100`, `components/organisms/editor/OrganismNameField.tsx`, `fieldStyles.ts`, `OrganismEditorModal.tsx` (setters 618-629, `errorTargetSelector` 396-408, save 717-788, field mount ~1098), `components/organisms/OrganismCard.tsx` (header 72-104, render 314-378).
- Battle: `lib/battle/newBattleDraft.ts`, `useBattleDraft.ts:72-79`, `battleRecord.ts:16-25,53-81`, `components/battle/BattlePage.tsx` (name state 419-431, dirty 437, `handleNameChange` 472-478, `persistBattle` 925-984, header 1515-1517), `editor/BattleNameField.tsx`, `editor/BattleEditorView.tsx:910-920`, `BattleHeader.tsx` (Title 30-39, render 212).
- Gallery: `components/gallery/BattleGallery.tsx` (header 317-325, refresh 245-268, tiles 349-363), `BattleTile.tsx` (dish 456-467, footer 468-489), `app/(gallery)/page.tsx`.
- Settings: `components/settings/SettingsCard.tsx` (Row primitives, `RowOutcome` rule 78-91), `DataManagement.tsx` (`OutcomeSource` 55, `publish` 172-180, Export row 182-215, slot 230), `ImportWorkspaceRow.tsx:198-201`, `SettingsPage.tsx`, `app/(gallery)/settings/page.tsx`.
- Presets: `lib/workspaces/presetManifest.ts`, `presetWorkspaces.test.ts` (envelope loop ~189-210), `public/workspaces/index.json`, `starter-workspace.json`.
- Storage failure: `lib/storage/storageFailure.ts:26-30` classifies any non-settings `CorruptDataError` as `'corrupt-workspace'` — which is why FD4 has every UI reader catch `gol:workspace` failures locally rather than let one reach it.

### Architecture compliance

- **Repositories injected, never imported (AR-2/27).** The new port reaches components as a prop from the page boundary (`repositories.workspaceMeta`), typed as a `Pick` of the interface — the Story 5.2 FD7 narrowing rule every Settings/Gallery prop follows.
- **Decision F / AR-12:** settings still never travel and are never touched by import or Clear All. The new key is **data**, not settings.
- **Decision I:** `formatVersion` stays 1; nothing branches on anything else. Additive optional fields need no migration step and no organism restamp.
- **M8:** import stays a whole-workspace replace, description included.
- **No DOM types in `packages/*`**; `@gol/domain` stays pure; `normalizeDescription` is plain string logic.
- **One theme, `--gol-*` tokens only** (AR-46 no-raw-hex lint). No new tokens needed: `--gol-text-secondary`, `--gol-text-tertiary`, `--gol-border`, `--gol-danger`, `--gol-bg-hover`, `--gol-border-control` exist.
- **Comments explain WHY; cite IDs exactly** (`FR-9.5`, `FR-9.1`, `Decision F`, `Decision I`, `M8`, `AR-12`, `Story 7.2`) — `npm run spec:check` fails on unresolvable IDs.
- **Live regions:** the Settings row publishes only through the shared DataManagement slot and never while a dialog is open (it opens none). No new `role="alert"` host outside the existing patterns.

### Library / framework notes

No new dependencies. Zod v4 spellings (`z.iso.datetime()`, `ctx.addIssue({ code: 'custom' })`). `-webkit-line-clamp` is supported unprefixed-enough in all four Playwright engines via the `display: -webkit-box` form. MUI core only — no TextField in the battle editor (bundle); a `styled('textarea')` everywhere.

### Testing standards

- Domain ≥90% per file (new `workspaceMetaSchema.ts` included); persistence/test-utils ~80% aggregate; apps/web no gate — test behaviour, never pad.
- Round-trip tests at all three levels, with **and** without descriptions; "absent ⇒ no key" asserted explicitly (not merely `toEqual`, which ignores `undefined` values — use `'description' in x` / `Object.keys`).
- Every display surface: a present-description test **and** an absent test asserting no element at all (AC5's "no placeholder chrome").
- axe (`vitest-axe`) on new fields and changed cards/header.
- `npm run ci:dev` is the gate; don't pipe it through `tail`.

### Project Structure Notes

- New: `packages/domain/src/workspaceMetaSchema.ts` (+ test), `packages/persistence/src/localStorageWorkspaceMetaRepository.ts` (+ test), `apps/web/lib/organisms/organismDescription.ts`, `apps/web/components/organisms/editor/OrganismDescriptionField.tsx` (+ test), `apps/web/components/battle/editor/BattleDescriptionField.tsx` (+ test), `apps/web/components/settings/WorkspaceDescriptionRow.tsx` (+ test).
- `BattleDescriptionField` lives in `battle/editor/` (Lab only); `BattleHeader` is already at `battle/` root (both modes) — no promotion needed.
- Naming: camelCase non-component TS files, PascalCase components.

### What NOT to build

- No markdown/links/rich text; no "add a description" nudge; no placeholder text on display surfaces.
- No fullscreen-overlay description; no card show-more toggle.
- No preset content (7.3), no fetch/loader (7.4–7.6), no manifest runtime parser.
- No `formatVersion` bump, no migration step.
- No edits to RFC-006 / architecture.md — variance goes to `deferred-work.md`.

### Previous story intelligence (7.1)

- The lockstep gate lives in `apps/web/lib/workspaces/presetWorkspaces.test.ts`: static loop over `manifest.workspaces`, failures collected with the file name, git-tracked comparison (owner ruling D1c), `file === ${id}.json` (D2a). Add the projection assertion inside the existing envelope loop so its failures collect the same way.
- The starter preset is regenerated through the serializer, then Prettier — the only allowed edit (7.1 FD4 / Task 2.2). 7.1 used route (b) (throwaway vitest file under `apps/web/scripts/`, run with `vitest.sweep.config.mts`, deleted after) — reusable here.
- Reviews on 7.1 hit stale comments hard: update every comment and doc-string these changes make untrue ("battles + organisms", "four STORAGE_KEYS", `presetManifest.ts`'s 7.2 sentence).

### Git intelligence

`main` @ `0ab2e3b` (#97, Story 7.1 merged; #98 settled the import-dialog axe flake by waiting for the Fade — reuse that pattern if a new e2e touches the import warning dialog).

### References

- [Source: docs/planning-artifacts/epics.md#Story 7.2: Descriptions at Every Level]
- [Source: docs/planning-artifacts/prds/prd-GameOfLife-2026-05-26/prd.md#FR-9.5, #FR-9.1]
- [Source: docs/planning-artifacts/prds/prd-GameOfLife-2026-05-26/CHANGELOG-preset-workspace-library.md]
- [Source: docs/planning-artifacts/ux-designs/ux-GameOfLife-2026-05-27/preset-workspace-library-design.md §5] and mockup `clinical-lab-theme/preset-workspace-library.html` (§1 gallery header + tiles, §4 play header, §5 editing + card)
- [Source: docs/planning-artifacts/architecture.md — Decision F (F.2), Decision I, M8, M9]
- [Source: docs/planning-artifacts/rfcs/RFC-006-persistence-workspace-schema.md — Decision 1, Decision 7 (the four-key list this story extends)]
- [Source: docs/project-context.md — repositories injected, spec:check, bundle growth gate, live-region trap]
- [Source: docs/implementation-artifacts/7-1-preset-workspace-foundations.md]

### Open questions for the owner (answered provisionally by the FDs above)

1. **FD4/FD7** — a new persisted key + repository port for the workspace description, and a Settings row to edit it. Neither is in the epic text; both follow from FR-9.5 (round-trip, editable in-app) + FR-9.1 (never handwritten). An alternative is to make the workspace description preset-only (import-carried, not editable, not re-exported) — but then 7.3 cannot author one through the app.
2. **FD6** — a description-only workspace counts as non-pristine (import warns).

## Dev Agent Record

### Agent Model Used

Claude Opus 5.5 (claude-opus-5-5)

### Debug Log References

- Task 6.2 route (b): throwaway `apps/web/scripts/generateStarterWorkspace.test.ts` (deleted after
  use), run with `npx vitest run --config vitest.sweep.config.mts scripts/generateStarterWorkspace.test.ts`
  from `apps/web` — `createFakeRepositories()` → `seedDefaultWorkspace` → `seedDevFixtures` →
  `repos.workspaceMeta.save({ description: <index.json's starter description> })` →
  `createWorkspaceSerializer({ repos, appVersion: APP_VERSION, now: () => new Date() }).exportWorkspace()`
  → `JSON.stringify(envelope, null, 2)`, then `npx prettier --write apps/web/public/workspaces/`.
  Resulting diff: `exportedAt` plus the new top-level `description` only — content otherwise
  unchanged. The lockstep assertion was confirmed red by temporarily editing the manifest sentence
  (restored).
- `npm run ci:dev` first run: 3 `storageCorruption.spec.ts` byte-identity cases failed because
  `readRawKeys` iterates `STORAGE_KEYS` (now including `gol:workspace`) while the seeded fixture
  lacked it; fixed by seeding a real `gol:workspace` description in `workspaceRaw()` (the checks now
  cover it too). One `organisms.spec.ts` tab-order case updated for the new description stop.
- `BattlePage.createOrganism.test.tsx` "a click opens the editor…" timed out once under a
  parallel partial run (lazy dialog `findByRole`); green in isolation and in both full `ci:dev` runs.
- `npm run lint`'s one warning (`BattleGallery.tsx` `state` → `useMemo` deps) is pre-existing on
  `main` (verified by linting `origin/main`'s file) — not introduced here.

### Completion Notes List

- Domain: `MAX_ORGANISM_DESCRIPTION_LENGTH` / `MAX_BATTLE_DESCRIPTION_LENGTH` (280) beside their
  name twins; new `workspaceMetaSchema.ts` (`MAX_WORKSPACE_DESCRIPTION_LENGTH` 500,
  `WorkspaceMetaSchema`, `EMPTY_WORKSPACE_META`, `normalizeDescription`). Optional `description` on
  `OrganismSchema`, `BattleSchema`, `BattleSummarySchema`, `BattleExportSchema` and the envelope's
  top level; `formatVersion` stays 1 (owner-ruling comment beside the field). Projections carry the
  key only when present; `fromEnvelope` returns `meta`; `isPristineWorkspace` takes an optional
  workspace description (FD6). Domain per-file coverage ≥ 96% (100% lines).
- Persistence: `gol:workspace` in `STORAGE_KEYS` and `DATA_KEYS`; `writeMetaKey` (format check, no
  stamp); `RawDataKeys` capture/restore carry it (stamp still removed first / written last);
  `WorkspaceMetaRepository` port + `LocalStorageWorkspaceMetaRepository` (save writes `{}` when there
  is no description — pinned); serializer exports it (corrupt ⇒ omitted, non-corrupt failure still
  rejects), `exportBattle` never carries it; import writes it inside the guarded region. The
  at-rest-migration blind spot is commented at both sites. Test-utils fake mirrors all of it.
- Organism: draft `description: string`, dirty + over-limit gate (focus via
  `data-organism-description`), normalized save with key omitted, clone carries it. New
  `OrganismDescriptionField` (refuse pattern) under the name; card shows a 2-line clamped `<p>`
  only when present (`data-card-description`), no new tab stop.
- Battle: draft/`toDraft` carry it; `BattlePage` `descriptionState` twin with the save lock and a
  `saved` member so the header shows the last SAVED text (FD9); `persistBattle` deps updated.
  New `BattleDescriptionField` (clamp pattern) under the name in the "Battle Name" section (title
  kept, so the sidebar keeps its four pinned headings). `BattleHeader` renders it under the h1 in
  both modes, unclamped; gallery tiles render a clamped `<p>` between dish and footer.
- Workspace: gallery header shows it (load `.catch`ed to empty — never reaches the storage-failure
  classifier); new `WorkspaceDescriptionRow` is Data Management's first row (clamp textarea, never-
  disabled Save with `pendingRef`, publishes through the shared slot as `'description'`, remounted
  via a `key` bump after import / Clear All). Import's pristine check reads it (FD6). Export and
  Clear All row descriptions name the workspace description; FR-8.5's verbatim dialog sentence left
  unchanged and flagged in `deferred-work.md`.
- Presets: lockstep test asserts manifest description ≡ envelope description; starter preset
  regenerated through the serializer; `presetManifest.ts` docs updated.
- Shared `components/descriptionStyles.ts` holds the pre-line/overflow rules and the one 2-line
  clamp both clamped surfaces use.
- `deferred-work.md`: the RFC-006 Decision 7 / Decision 1 / Decision F.2 variance, the migration
  blind spot, and the unchanged FR-8.5 dialog copy. Owner questions (FD4/FD7, FD6) implemented on
  their provisional answers.
- Bundle: every route +0.5–0.8 KB gzip (within the 8 KB allowance); baseline refreshed with
  `npm run bundle:baseline` after `build:standalone`.
- Verification: `npm run ci:dev` exit 0 — typecheck, lint (1 pre-existing warning), format:check,
  spec:check, boundary:check, test:coverage (domain 289, persistence 203, test-utils 105,
  simulation 408, web 2705 tests), build:standalone, bundle:check, bench + bench:check,
  e2e:chromium 314 passed / 1 skipped.
- ✅ Resolved 6 review decisions per owner rulings (Sidiar, 2026-09-28): M16 minted and propagated
  (RFC-006 D1/D5/D6/D7, Decision F.2/F.4, Reconciliation #1, M8, FR-8 row; spec-id bound → M16);
  FD7 row kept + UX spec edit surface named; FD6 kept (M16 (c)); Clear All copy kept as accepted
  wording; save race documented (row comment, FD6 note, connected-mode deferral); leave-guard gap
  accepted (FD7 note, deferral). Two stale "recorded as a variance" code comments now cite M16.
  No behaviour change; PRD untouched.

### File List

New:
- packages/domain/src/workspaceMetaSchema.ts
- packages/domain/src/workspaceMetaSchema.test.ts
- packages/persistence/src/localStorageWorkspaceMetaRepository.ts
- packages/persistence/src/localStorageWorkspaceMetaRepository.test.ts
- apps/web/components/descriptionStyles.ts
- apps/web/lib/organisms/organismDescription.ts
- apps/web/components/organisms/editor/OrganismDescriptionField.tsx
- apps/web/components/organisms/editor/OrganismDescriptionField.test.tsx
- apps/web/components/battle/editor/BattleDescriptionField.tsx
- apps/web/components/battle/editor/BattleDescriptionField.test.tsx
- apps/web/components/settings/WorkspaceDescriptionRow.tsx
- apps/web/components/settings/WorkspaceDescriptionRow.test.tsx

Modified:
- packages/domain/src/organismSchema.ts, organismSchema.test.ts
- packages/domain/src/battleSchema.ts, battleSchema.test.ts
- packages/domain/src/workspaceExportSchema.ts, workspaceExportSchema.test.ts
- packages/domain/src/workspaceExportProjection.ts, workspaceExportProjection.test.ts
- packages/domain/src/pristineWorkspace.ts, pristineWorkspace.test.ts
- packages/domain/src/index.ts
- packages/persistence/src/localStorageAccess.ts, localStorageAccess.test.ts
- packages/persistence/src/repositories.ts
- packages/persistence/src/createLocalStorageRepositories.ts, createLocalStorageRepositories.test.ts
- packages/persistence/src/workspaceSerializer.ts, workspaceSerializer.test.ts
- packages/persistence/src/workspaceImport.ts, workspaceImport.test.ts
- packages/persistence/src/index.ts
- packages/test-utils/src/fakeRepositories.ts, fakeRepositories.test.ts
- apps/web/lib/organisms/organismDraft.ts, organismDraft.test.ts
- apps/web/lib/organisms/organismRecord.ts
- apps/web/lib/organisms/organismClone.ts, organismClone.test.ts
- apps/web/components/organisms/editor/OrganismEditorModal.tsx, OrganismEditorModal.test.tsx
- apps/web/components/organisms/OrganismCard.tsx, OrganismCard.test.tsx
- apps/web/lib/battle/newBattleDraft.ts
- apps/web/lib/battle/useBattleDraft.ts
- apps/web/lib/battle/battleRecord.ts, battleRecord.test.ts
- apps/web/components/battle/BattlePage.tsx, BattlePage.test.tsx
- apps/web/components/battle/BattleHeader.tsx, BattleHeader.test.tsx
- apps/web/components/battle/editor/BattleEditorView.tsx, BattleEditorView.test.tsx,
  BattleEditorView.clearGuards.test.tsx, BattleEditorView.statsMemo.test.tsx
- apps/web/components/gallery/BattleGallery.tsx, BattleGallery.test.tsx,
  BattleGallery.gridLines.test.tsx
- apps/web/components/gallery/BattleTile.tsx, BattleTile.test.tsx
- apps/web/app/(gallery)/page.tsx
- apps/web/app/(gallery)/settings/page.tsx
- apps/web/components/settings/DataManagement.tsx, DataManagement.test.tsx
- apps/web/components/settings/ImportWorkspaceRow.tsx, ImportWorkspaceRow.test.tsx
- apps/web/components/settings/ClearAllDataRow.tsx, ClearAllDataRow.test.tsx
- apps/web/components/settings/SettingsPage.tsx, SettingsPage.test.tsx
- apps/web/lib/workspaces/presetManifest.ts
- apps/web/lib/workspaces/presetWorkspaces.test.ts
- apps/web/public/workspaces/starter-workspace.json
- apps/web/e2e/settings.spec.ts
- apps/web/e2e/organisms.spec.ts
- apps/web/e2e/storageCorruption.spec.ts
- scripts/bundle-baselines.json
- docs/implementation-artifacts/deferred-work.md
- docs/implementation-artifacts/sprint-status.yaml
- docs/implementation-artifacts/7-2-descriptions-at-every-level.md

Owner-ruling pass (2026-09-28):
- docs/planning-artifacts/architecture.md
- docs/planning-artifacts/rfcs/RFC-006-persistence-workspace-schema.md
- docs/planning-artifacts/ux-designs/ux-GameOfLife-2026-05-27/preset-workspace-library-design.md
- scripts/check-spec-ids.mjs
- apps/web/components/settings/WorkspaceDescriptionRow.tsx
- packages/persistence/src/repositories.ts
- packages/persistence/src/localStorageAccess.ts
- docs/implementation-artifacts/deferred-work.md

### Change Log

- 2026-09-28 — Story 7.2 implemented: optional, capped descriptions on organisms, battles and the
  workspace (new `gol:workspace` key + `AppRepositories.workspaceMeta` port); editor fields,
  read-only display surfaces, Settings authoring row, preset manifest projection; variance recorded
  in `deferred-work.md`. Status → review.
- 2026-09-28 — Code review (Sonnet; Blind Hunter + Edge Case Hunter + Acceptance Auditor, full diff
  `0ab2e3b..e0faec9`): 4 patches applied (schema refinement closing a `kind: 'battle'` +
  `description` gap; a `WorkspaceDescriptionRow` Save-before-load race guard; a braceless `if` in
  `isPristineWorkspace`; a misleading comment in `BattleHeader.tsx`), each with a new/extended test;
  6 decision-needed items left unresolved in Review Findings (FD4's RFC-006 extension, FD7's new
  Settings authoring surface, FD6's pristine-check widening, the Clear All dialog copy vs. its
  pinned Story 5.10 text, a workspaceMeta write race between the description row and Import/Clear
  All, and the description row's missing leave-guard); 5 findings dismissed as consistent with
  existing patterns or already-accepted intent. `npm run ci:dev` green after patches (typecheck,
  lint, format:check, spec:check, boundary:check, coverage, build, bundle:check — 0 KB growth on
  every route, bench, bench:check, e2e:chromium 314 passed/1 skipped). Status → in-progress
  (decision-needed items pending owner ruling).
- 2026-09-28 — Owner rulings (Sidiar) applied to the 6 review decisions, all checked off: FD4 →
  new Minor Spec Resolution M16 in `architecture.md`, propagated to RFC-006 Decisions 1/5/6/7,
  Decision F.2/F.4, Cross-RFC Reconciliation #1, M8 and the FR-8 traceability row;
  `scripts/check-spec-ids.mjs` widened to M16; FD7 authoring row kept (UX spec names Settings →
  Data Management as the edit surface); FD6 pristine widening kept (stated in M16 (c)); Clear All
  copy kept (`deferred-work.md` entry reworded to an accepted wording choice); description-save
  race accepted and documented (row comment, FD6 note extended, connected-mode entry added);
  leave-guard gap accepted (FD7 note + `deferred-work.md` entry). PRD untouched. Status → review.

Dev Model: opus   # architecture-shaping (FD4: new gol:workspace key + AppRepositories.workspaceMeta that 7.4–7.6 build on); owner chose opus dev + sonnet review because Fable is unavailable (2026-09-28)
Review Model: sonnet-5   # second pair of eyes per project convention; ran full review (Blind Hunter + Edge Case Hunter + Acceptance Auditor) against 0ab2e3b..e0faec9 (2026-09-28)
Proposed lane gate: none — only epic 7 is in progress; the diff touches no epic-6 surface

---

This story was implemented with the 'Implement next story' skill with the following stats:

| Phase | Agent model | Agents | Active | Wall clock | Input | Output | Cache write | Cache read | Total tokens |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Step 0 — re-entry guard | — | 0 | 20s | 20s | 12 | 2,463 | 8,749 | 335,214 | 346,438 |
| Step 1 — create | opus-5-5 | 4 | 10m 11s | 10m 11s | 384 | 8,369 | 990,595 | 15,897,909 | 16,897,257 |
| Step 2 — implement | opus-5-5 | 1 | 35m 34s | 35m 34s | 432 | 5,223 | 607,219 | 50,838,561 | 51,451,435 |
| Step 3 — review + PR | sonnet-5 | 4 | 22m 32s | 22m 32s | 664 | 41,459 | 1,865,921 | 41,749,033 | 43,657,077 |
| _of which the orchestrator_ | opus-5-5 | — | — | — | 56 | 18,628 | 37,414 | 1,794,224 | 1,850,322 |
| **Total (create → PR ready)** | | 9 | **1h 08m** | 1h 08m | 1,492 | 57,514 | 3,472,484 | 108,820,717 | **112,352,207** |

Run started 2026-09-28 18:16 CEST; wall clock runs to the point the run stopped for the owner's review. No idle gaps were excluded; Active and Wall clock agree. (A gap counts as idle above 15 min.) Each phase row covers the phase agent, any agents it spawned, and the orchestrator's own turns in that window — the orchestrator row breaks its share out again, it is not additional. Cache reads dominate the token totals and are billed at a fraction of input rate, so read the Input and Output columns for effort and the total only as a ceiling. The orchestrator's final turn is still being written when these numbers are taken.
