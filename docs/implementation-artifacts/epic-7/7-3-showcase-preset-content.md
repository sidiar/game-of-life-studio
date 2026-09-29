---
baseline_commit: ad6cc635b36e919a8c2141a45d08906d73620115
---

# Story 7.3: Showcase Preset Content

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a first-time visitor,
I want the default preset to look alive the moment I press play,
so that I taste the essence of the game in seconds and want to stay.

## Acceptance Criteria

1. **Given** the default preset's battles, **When** run, **Then** visible multi-organism competition (colonies colliding, spreading, trading territory) develops within the first ~5 seconds at default speed, on both bundled battles' grids (FR-9.2 rationale; this story gates 7.4's ship)
2. **And** the preset carries Conway's Classic plus at least three distinct, well-named organisms whose colors are CVD-distinct (AR-26 palette), each battle satisfying Decision H.1
3. **And** gallery thumbnails of the preset battles read as intriguing, not sparse (the tiles are the first thing a visitor sees before pressing anything)
4. **And** the content passes the 7.1 lockstep gate and replaces (or demotes from default) the dev-fixture starter preset
5. **And** the workspace, every battle, and every organism carry authored descriptions (FR-9.5): the preset explains what the visitor is watching

## Tasks / Subtasks

- [x] **Task 1: Design and tune the content headlessly** (AC: 1, 2, 3)
  - [x] 1.1 Create a throwaway exploration harness (never committed): a Vitest file under `apps/web/scripts/`, run with `npx vitest run --config vitest.sweep.config.mts scripts/<file>.test.ts` from `apps/web` (the 7.1/7.2 route (b) location, which `vitest.config.mts` excludes from `npm test`). It builds candidate organisms + battles in memory and runs them through the real engine (FD4's composition). Per cycle, it prints population per organism, ownership transfers, and optionally an ASCII frame every ~10 cycles.
  - [x] 1.2 Design the roster within FD3's constraints: Conway's Classic (stock) plus ≥3 new organisms with distinct CVD-core colors, distinct dominance values, and at least one organism that is born into `occupied` cells (the territory-trade mechanism).
  - [x] 1.3 Design two battles (FD3): one 100×60 and one 50×30. Each places ≥3 organisms as dense seeded-random colonies whose fronts meet early. At least one battle places Conway's Classic.
  - [x] 1.4 Iterate until, for both battles under several seeds, over the first `5 × DEFAULT_SETTINGS.defaultSpeed` cycles (= 50 today): every placed organism is still alive, territory changes hands continuously, and the grid is neither frozen nor overrun by one colour. Also check a longer horizon (~300 cycles, 30 s): a run that settles into one colour, or into still-life, in under ~15 s is a weak showcase. Aim for a battle that keeps evolving.
- [x] **Task 2: Generate the preset through the serializer** (AC: 2, 4, 5)
  - [x] 2.1 Generate the envelope with the FD2 composition (throwaway script, same folder as 1.1, may be the same file): `createFakeRepositories()` → `seedDefaultWorkspace(repos)` (stock Conway's Classic) → save the organisms → save the battles (via `projectBattleForSave`) → `repos.workspaceMeta.save({ description })` → `createWorkspaceSerializer({ repos, appVersion: APP_VERSION, now: () => new Date() }).exportWorkspace()` → `JSON.stringify(envelope, null, 2)` → write `apps/web/public/workspaces/<id>.json`. Delete the script afterwards.
  - [x] 2.2 `npx prettier --write apps/web/public/workspaces/`. Formatting is the only allowed edit (7.1 FD4). Do not hand-touch ids, `exportedAt`, or hashes.
  - [x] 2.3 Record the route, the seed(s) used for colony placement, and the final roster (name / colorToken / dominance / aging / rule list) in the Dev Agent Record, so the content can be reasoned about without re-deriving it from the JSON.
- [x] **Task 3: Manifest: replace the starter** (AC: 4)
  - [x] 3.1 `git rm apps/web/public/workspaces/starter-workspace.json`. Replace its `index.json` entry with the new preset's entry (`id`, `name`, `description` = the envelope's workspace description verbatim, `file` = `<id>.json`) and point `defaultPresetId` at it (FD1). `git add` the new file (the lockstep compares against git-tracked files, 7.1 owner ruling D1c).
  - [x] 3.2 `presetManifest.ts` head comment: "that is how the first preset was produced" is still true in substance. Reword it only if it now reads false, and add one sentence to the authoring path: to improve an existing preset, import it in the app, edit, set the workspace description, and export again (FD2).
- [x] **Task 4: Showcase gate test** (AC: 1, 2)
  - [x] 4.1 New `apps/web/lib/workspaces/presetShowcase.test.ts` per FD4: loads the manifest's **default** preset off disk, `validateImportFile` → `fromEnvelope`, and for each battle runs the headless engine for `SHOWCASE_CYCLES = 5 × DEFAULT_SETTINGS.defaultSpeed` cycles under a small fixed seed set. Named floors with WHY comments; failure messages name the battle, the seed and the organism.
  - [x] 4.2 Static content assertions in the same file: roster = Conway's Classic (deep-equal to `CONWAYS_CLASSIC`) + ≥3 others; all `colorToken`s distinct and inside the CVD-robust core (`PALETTE.slice(0, 8)`); all dominance values distinct; every organism, every battle and the workspace have a non-blank description; the preset has exactly two battles, one per editable grid preset (FD3).
  - [x] 4.3 Negative proof (manual, reverted, not committed): weaken the content, for example by feeding the test a copy of the old starter envelope or by lowering a colony's density to a few cells. Confirm the gate goes red with a readable message. Record it in the Dev Agent Record.
- [x] **Task 5: Visual check and verify** (AC: 1, 3)
  - [x] 5.1 Visual check (FD5): `npm run dev` → Settings → Import the new preset file (dev builds start with the AR-45 fixtures, and the import replaces them) → gallery: both thumbnails read dense and multi-coloured → open each battle, press Play at default speed, watch ~5 s. Take screenshots (gallery + each battle at ~5 s) into the scratchpad or `/tmp`, not the repo, and describe what was seen in the Dev Agent Record. A throwaway Playwright script is fine for this. Do not commit it.
  - [x] 5.2 `npm run ci:dev` green (never four-browser `npm run ci`). `bundle:check` must show no route growth: nothing in app code imports preset JSON (7.1 FD5).

### Review Findings

Code review 2026-09-29 (Opus; Blind Hunter + Edge Case Hunter + Acceptance Auditor). 3 decision-needed, 6 patch, 0 defer, 10 dismissed.

- [x] [Review][Decision] D1: Conway's Classic ships without a description (AC5 vs FD2/M9) — AC5 says "every organism" carries an authored description, and the envelope's `conways-classic` record has none. `presetShowcase.test.ts` exempts it (`for (const organism of others)`). The spec contradicts itself: FD2 says "never modify it" and Task 4.2 deep-equals `CONWAYS_CLASSIC`, while M9 only protects Conway's Classic from deletion and FR-9.5 makes descriptions editable wherever an entity is edited. Options:
  - (a) Add a description to `CONWAYS_CLASSIC` in `@gol/domain`. This changes the seed for every workspace, and per 7.2 FD6/M16 it may affect the pristine check, so re-verify 7.4's first-visit detection.
  - (b) Ship a description-only edit of Conway's Classic inside the preset. This amends FD2, and the test deep-equals everything except `description`.
  - (c) Rule the stock Conway's Classic exempt from AC5 and record the exemption. The workspace and battle descriptions explain it. This is the status quo.
  - **Owner ruling (Sidiar, 2026-09-29): (a).** Add an authored description to `CONWAYS_CLASSIC` in `@gol/domain`, so the preset's `conways-classic` record carries it too (still deep-equal to `CONWAYS_CLASSIC`), and drop the showcase test's exemption. Re-verify every pristine/seed check this touches (7.2 FD6/M16; the fresh-workspace gate 7.4 will rely on).
- [x] [Review][Decision] D2: Tug of War (50×30) is a thin showcase. It passes every 5 s gate: 109 transfers, 45 % max share, all three organisms alive. But Moss Weavers' only invasion rule targets Ember Raiders, who are not placed in it, so only one front trades territory (Amber Tide taking Conway's cells). Nobody invades the Weavers. The dish settles to a few static colonies by ~15 s, which Task 1.4 calls "a weak showcase". This is not an AC violation, since AC1's bar is ~5 s. Options:
  - (a) Accept as is. The 100×60 flagship sorts first and keeps evolving to 300 cycles, and the battle description says openly that "the first seconds are the show".
  - (b) Re-tune. For example, place Ember Raiders in Tug of War too, or give the Weavers an invasion rule that works there, so both fronts trade territory. Then re-export through the app and re-measure the FD4 floors in the same PR.
  - (c) Additionally raise the gate's horizon or add a longer-horizon check (e.g. all organisms alive at 150 cycles) so that post-5 s liveliness is protected by CI.
  - **Owner ruling (Sidiar, 2026-09-29): (a).** Accept as is; no change.
- [x] [Review][Decision] D3: Confirm the preset's display name and id, "Colony Clash" / `colony-clash` (FD1 owner veto). The id is stable forever once merged (7.1 FD3). Options:
  - (a) Keep it.
  - (b) Rename before merge. This means a new `<id>.json` plus the `index.json` entry and `defaultPresetId`, and the showcase and lockstep tests follow automatically.
  - **Owner ruling (Sidiar, 2026-09-29): (a).** Keep "Colony Clash" / `colony-clash`; no change.
- [x] [Review][Patch] Organism descriptions say "touches on two sides", but the invasion rules are own `neighborCount gte 2` over all 8 neighbours, diagonals included [apps/web/public/workspaces/colony-clash.json]
- [x] [Review][Patch] The workspace description tells the visitor how to use the app ("Press play on…", "open an organism…"), against FD3's voice rule [apps/web/public/workspaces/colony-clash.json, index.json]
- [x] [Review][Patch] The `SEEDS` comment claims the seed set proves determinism, but nothing compares results across seeds [apps/web/lib/workspaces/presetShowcase.test.ts:39]
- [x] [Review][Patch] The test title claims "Conway in at least one" battle without a dedicated assertion, and FD3's "each battle places ≥3 organisms" is unasserted [apps/web/lib/workspaces/presetShowcase.test.ts:157]
- [x] [Review][Patch] FD2's gallery order (the 100×60 flagship has the newest `updatedAt`) is unasserted, and a re-export through the app could silently reorder the tiles [apps/web/lib/workspaces/presetShowcase.test.ts]
- [x] [Review][Patch] The `presetManifest.ts` head comment says "that is how the first preset was produced", but the first preset (the starter) is deleted by this story [apps/web/lib/workspaces/presetManifest.ts:27]

Second review 2026-09-29 of the ruling-pass commit `7585f7b` (Opus; Blind Hunter + Edge Case Hunter + Acceptance Auditor). 2 decision-needed, 4 patch, 0 defer, 12 dismissed.

- [x] [Review][Decision] D4: Stores seeded before D1 keep a description-less Conway's Classic, which `isPristineWorkspace` now reads as modified. `ensureDefaultOrganism` is exists-gated (M9: it never overwrites a stored Conway), so nothing backfills the new description. An untouched workspace from before this change (including real users of the deployed site) therefore (1) never shows Conway's description, contrary to D1's intent that every organism a visitor meets is described, and (2) fails `isPristineWorkspace`'s deep-equal (`pristineWorkspace.ts:76`, one key fewer). That means an unneeded FR-8.4 destructive-replace warning on Settings Import today, and on 7.5 Load Preset and 7.6 Preset Link, whose ACs suppress it only for a pristine workspace. The same happens after importing an older export whose file carries the description-less Conway. It fails safe: no data loss. **7.4 is not affected**, because its gate is `isFreshWorkspace()`, which checks the `gol:schema` stamp and never inspects content. Options:
  - (a) Accept. Record the trade-off in `deferred-work.md` so 7.5's story creator sees it. Legacy users get one extra warning until they Clear All or import.
  - (b) Widen `isPristineWorkspace` to also accept the pre-D1 stock shape (deep-equal to `CONWAYS_CLASSIC` minus `description`). Nothing is lost by replacing it, so this does not weaken the data-loss guard. Legacy users still never see the description.
  - (c) Add a one-time backfill: a stored Conway deep-equal to the pre-D1 stock record (exactly untouched) gets the new description on boot. This fixes both symptoms without overriding an edit, but it is a new migration path, beside M9's "no self-heal".
  - **Owner ruling (Sidiar, 2026-09-29): (b).** Widen `isPristineWorkspace` to also accept the pre-D1 stock shape (`CONWAYS_CLASSIC` minus `description`), with a test. No backfill.
- [x] [Review][Decision] D5: The wording of Conway's Classic's authored description. It is the seed for every workspace, not only the preset. It is factually right against the rules and within the cap (236/280), but three things are loose. (1) "born with exactly 3 neighbors" does not say own-kind, although `neighborCount` counts only same-organism neighbours (`cellSubject.ts`). That is the precision the first review patched into the other organisms ("touches on two sides"). (2) "Dominance 50, no aging, and no way to invade" is a parameter list. It goes stale when the user edits Conway's, and `organismClone.ts:94` copies it into every clone, where it becomes false as soon as the clone is tuned. The preset's other organisms also cite their dominance, so this is house style, not a violation. (3) "Dense random soup keeps it alive; sparse seeds fade out" reads like authoring advice more than FD3's "what to watch for", and is only loosely true. Any change means re-exporting `colony-clash.json`, since the lockstep test deep-equals it. Options:
  - (a) Keep the text as is.
  - (b) A minimal precision fix: "born with exactly 3 neighbors of its own kind" (both copies, same PR).
  - (c) Rewrite towards FD3's voice, e.g. drop the parameter list and add what to watch for in a mixed dish ("it only defends, so watch invaders eat into its blue colonies").
  - **Owner ruling (Sidiar, 2026-09-29): (c).** Rewrite in FD3's voice: own-kind neighbours, no parameter list (it goes stale on edit and is copied into clones), say what to watch for. Re-export `colony-clash.json` so it stays deep-equal.
- [x] [Review][Patch] The comment defending key omission gives a reason that is now backwards: an unedited Conway's Classic does carry a stored `description` key [apps/web/lib/organisms/organismRecord.ts:52]
- [x] [Review][Patch] The test title "is not pristine when the seed organism gained a description" is stale: the seed already has one, so the case now tests an edited description [packages/domain/src/pristineWorkspace.test.ts:110]
- [x] [Review][Patch] The Dev Agent Record points the legacy-store caveat at 7.4, but 7.4 gates on `isFreshWorkspace()` (stamp-based) and is unaffected. The stories actually affected are Settings Import, 7.5 and 7.6 [docs/implementation-artifacts/epic-7/7-3-showcase-preset-content.md, Completion Notes]
- [x] [Review][Patch] The File List omits the D1 changes to `presetShowcase.test.ts` (exemption dropped) and `colony-clash.json` (re-exported) [docs/implementation-artifacts/epic-7/7-3-showcase-preset-content.md, File List]

Third review 2026-09-29 of the D4–D5 ruling commit `1277013` (Opus; Blind Hunter + Edge Case Hunter + Acceptance Auditor). 0 decision-needed, 5 patch, 0 defer, 8 dismissed.

- [x] [Review][Patch] The Completion Notes are stale after D4/D5: the D1 bullet quotes the superseded 236-char description as current, and the D1-ripple caveat still says a pre-D1 store is not pristine ("Open as D4") [docs/implementation-artifacts/epic-7/7-3-showcase-preset-content.md, Completion Notes]
- [x] [Review][Patch] The File List lists `defaultWorkspace.ts` and `pristineWorkspace.test.ts` twice, is split by a blank line, and puts two files on one bullet [docs/implementation-artifacts/epic-7/7-3-showcase-preset-content.md, File List]
- [x] [Review][Patch] Two of the "four new tests" duplicate existing ones (edited description; the current constant is pristine), so the Change Log overstates coverage; the case that pins "nothing else loosens" (a present-but-`undefined` `description` key) is untested [packages/domain/src/pristineWorkspace.test.ts:122]
- [x] [Review][Patch] The comment says a missing `description` key makes an unedited Conway's Classic fail `isPristineWorkspace`; after D4 the description-less stock shape is pristine [apps/web/lib/organisms/organismRecord.ts:51]
- [x] [Review][Patch] The `CONWAYS_CLASSIC` description comment says "well under" the cap at 251/280, and does not warn that changing the text (or any field) strands every earlier-seeded store as non-pristine, since M9 never overwrites a stored Conway and `PRE_D1_CONWAYS_CLASSIC` derives from the live constant [packages/domain/src/defaultWorkspace.ts:71]

## Dev Notes

### Forced decisions (made here so the dev agent does not have to)

- **FD1: Replace the starter; do not demote it.** Delete `starter-workspace.json` and its manifest entry; the new preset becomes the manifest's only entry and its `defaultPresetId`. The starter is the AR-45 dev-fixture roster with `mock-*` ids and 2×2 blocks, which is not catalogue-quality content, and 7.7 owns the catalogue. Removing the id breaks nothing: no consumer of a preset id exists yet (7.4–7.6 are unshipped), so no link has ever named `starter-workspace`. **From this story on, the new id is stable forever** (7.1 FD3). Choose it deliberately: a lowercase kebab slug of the preset's display name. The display name and id are the dev's call and must be "well-named" (AC2); state the choice in the Completion Notes for the owner to veto at review.
- **FD2: Authoring route = the headless serializer composition (7.1/7.2 route (b)), built from the editors' own save projections.** Do not hand-write envelope JSON (FR-9.1).
  - **Organisms:** domain records with `schemaVersion: ORGANISM_SCHEMA_VERSION`, `id: crypto.randomUUID()` (what the Organism Editor mints; uuids, not `mock-*` style literals), rule `id`s from `crypto.randomUUID()`, and every rule's `contentHash` from `ruleContentHash` (`apps/web/lib/organisms/ruleContentHash.ts`, the editor's hasher). Parse each through `OrganismSchema.parse` before saving. `projectOrganismForSave` is acceptable too if building `OrganismDraft`s is convenient; either way no hash is typed by hand.
  - **Battles:** go through `projectBattleForSave(grid, rosterIds, stamps)` (`apps/web/lib/battle/battleRecord.ts`). It is the Battle Editor's own save projection and performs the Decision H.1 prune + Decision E.2 remap, so H.1 holds by construction. `id: crypto.randomUUID()`, `name`, `description`, and `createdAt`/`updatedAt` from the script's clock. Give the two battles different `updatedAt` values so the gallery order is deliberate: the 100×60 flagship is newest, so it sorts first (FR-7.3 "sorted by last modified").
  - **Conway's Classic:** `seedDefaultWorkspace(repos)` gives the stock record. Never modify it: M9 protects it, and a modified copy would ship a variant under the protected id.
  - Future edits go through the app: import the preset in the dev server, edit it in the editors (and the workspace description in Settings → Data Management), Export Workspace, Prettier. The envelope is the source of truth, so no generator script is committed (7.1 "What NOT to build").
- **FD3: Content constraints (the showcase recipe).**
  - **Roster:** Conway's Classic (sky-blue, dominance 50) + **3–5** new organisms. Colours are **distinct tokens from the CVD-robust core, tokens 1–8** (`sky-blue` is Conway's; pick from `vermillion`, `bluish-green`, `amber`, `reddish-purple`, `yellow`, `azure`, `coral-red`). That core is what palette gate G4 verifies pairwise under protan/deutan/tritan at every shade (`docs/implementation-artifacts/palette-cvd-validation.md`), which is AC2's "CVD-distinct". Tokens 9–20 are not CVD-gated pairwise, so do not use them.
  - **Dominance:** distinct values, none equal to 50. Equal dominance falls to the tie-break RNG, and production mints a fresh seed per run, so ties would make the showcase look different every visit. Distinct values keep it deterministic apart from seed-independent dynamics.
  - **Engine semantics that decide whether content "looks alive":**
    - `neighborCount` counts **same-organism** neighbours only; `occupantNeighborCount` counts **other** organisms (`cellSubject.ts`).
    - `cellState` is relative to the evaluating organism.
    - Rules are first-match in list order.
    - Death runs before survival, and birth vs survival compete **by dominance alone**: incumbency gives no protection.
    - A cell nobody claims clears (implicit death, M10).

    Colonies only **trade territory** if some organism can claim a cell another organism holds. That means a `born` rule on `cellState eq occupied`, optionally narrowed by `organismType` (a library id) and gated on the attacker's own `neighborCount`, so invasion happens at a front rather than everywhere. Without one, colonies merely abut. Conway's Classic (B3/S23 on its own cells) decays from sparse seeds and sustains from ~35–50 % random soup, so seed it as soup.
  - **Rule summaries** (`payload.summary`, ≤ `MAX_RULE_SUMMARY_LENGTH` = 100) must read as plain explanations. They are the rule-level layer the descriptions build on (FR-9.5 rationale).
  - **Aging:** at least one aging-enabled organism is encouraged. The renderer's age ramp makes fronts visibly "fresh vs old". It is optional.
  - **Battles: exactly two.** One **100×60** (the default grid for new battles; the flagship) and one **50×30** (bigger cells, so its thumbnail reads well at tile size). Each places **≥3 organisms**, and at least one places Conway's Classic. Every roster organism appears in at least one battle, so no library organism is dead weight.
  - **Placement:** dense seeded-random colonies (~35–50 % fill) in territories whose fronts meet within the first ~10–20 cycles. Avoid tiny patterns: the thumbnail is the `initialGrid` (M4, rendered on demand) and must read as a busy, multi-coloured dish (AC3). Place with a seeded RNG (`createRng(seed)` from `@gol/simulation`) so the script reproduces; record the seed.
  - **Descriptions (FR-9.5, caps from Story 7.2):** workspace ≤ 500, battle ≤ 280, organism ≤ 280. Plain text, no markdown (UX §5). Voice: tell the visitor what they are watching and what to look for ("the amber front eats…"), not how to use the app. The **workspace description is also the manifest description**, verbatim (7.2 projection gate).
- **FD4: A committed showcase gate, not only an eyeball check.** AC1 is otherwise unverifiable in CI, and 7.3 gates 7.4's ship: a later edit that kills the showcase must go red. `apps/web/lib/workspaces/presetShowcase.test.ts`:
  - **Input:** `index.json` → the `defaultPresetId` entry → its file off disk (same `dirname(fileURLToPath(import.meta.url))` path idiom as `presetWorkspaces.test.ts`; reuse its manifest-reading approach rather than re-deriving paths) → `validateImportFile(text)` → `fromEnvelope(envelope)` for dense `Battle`s + `Organism`s.
  - **Engine composition** (same as `useSimulation.ts:274-305`): roster = `battle.organismIds.map(id => organismsById.get(id))` in roster order; `const compiled = compileSession(roster)`; `let buffers = createGridBuffers(gridFromDense(battle.gridState))`; `const deps = { ...compiled, organisms: roster, rng: createRng(seed) }`; loop `buffers = stepGridBuffers(buffers, deps)`; read `buffers.front.occupant` (a `Uint8Array`, value = roster index + 1, 0 = empty).
  - **Horizon:** `SHOWCASE_CYCLES = 5 * DEFAULT_SETTINGS.defaultSpeed` (derived from `@gol/domain`'s `DEFAULT_SETTINGS`, never the literal 50: "~5 seconds at default speed" is the spec). Seeds: a fixed small set (e.g. 3 literals). The tie-break RNG only matters on equal dominance, which FD3 rules out, but the set proves it.
  - **Assertions per battle × seed:**
    - (a) the grid never empties within the horizon;
    - (b) every roster organism still has ≥1 cell at `SHOWCASE_CYCLES`: all colours still on screen after 5 s;
    - (c) **ownership transfers** summed over the horizon (a cell non-empty with organism A at cycle t and organism B ≠ A at t+1) reach a named floor `MIN_TERRITORY_TRANSFERS`: colonies trade territory rather than just abut;
    - (d) no single organism holds more than a named share (e.g. 90 %) of live cells at the horizon: the visitor still sees a contest.

    Calibrate the floors from measured values: set each at roughly half the minimum measured across seeds, and record the measurements in the Dev Agent Record and in a WHY comment. A floor at 1 proves nothing; a floor at the measured value is flaky to content tweaks.
  - **Static content assertions:** see Task 4.2.
  - **Scope and cost:** this reads only the *default* preset. 7.7's catalogue presets are not required to meet the default's bar. 100×60 × 50 cycles × 3 seeds is trivially cheap; keep it well under a second. No coverage gate applies (apps/web), so test behaviour, don't pad.
- **FD5: Thumbnails and "looks alive" are also checked by eye, once, not by pixel tests.** Never pixel/snapshot-test the Canvas (project-context). Task 5.1's manual dev-server pass plus screenshots kept out of the repo is the evidence. The owner reviews the actual look at PR time.
- **FD6: Dev fixtures (AR-45) are untouched.** `mockWorkspace.ts` / `seedDevFixtures.ts` keep seeding dev builds. Their coverage duty (all five condition properties, all six operands) is orthogonal to showcase content, e2e specs depend on them, and 7.4's AC keeps the dev branch unchanged. The preset does not need to cover the AR-45 matrix.
- **FD7: No app-code change beyond the new test.** No loader, fetch, hook or UI: 7.4 (auto-load), 7.5 (Settings row) and 7.6 (link) own those. Nothing imports preset JSON (bundle gate). `presetManifest.ts` gets comment edits only if Task 3.2 finds text made false.

### What exists: read these before writing a line

- `apps/web/public/workspaces/index.json`, `starter-workspace.json`: current manifest (one entry, `defaultPresetId: "starter-workspace"`) and the envelope this story replaces.
- `apps/web/lib/workspaces/presetManifest.ts`: contract + documented authoring path (head comment). `presetWorkspaces.test.ts`: the lockstep gate (manifest structural parse, slug ids, `file === ${id}.json`, git-tracked lockstep, `validateImportFile` per preset, manifest description ≡ envelope description). It must stay green untouched. The new test is a sibling file, not an edit to it.
- `packages/test-utils/src/mockWorkspace.ts`: the current fixture roster. It is a reference for how rules/battles are shaped in code, and also a contrast: its 2×2 blocks are exactly the "sparse" look AC3 rejects.
- `packages/domain/src/defaultWorkspace.ts`: `CONWAYS_CLASSIC` / `CONWAYS_CLASSIC_ID`. `seedDefaultWorkspace` is in `@gol/persistence`.
- `packages/domain/src/workspaceExportProjection.ts`: `fromEnvelope(envelope) → { battles, organisms, meta }` (sparse wire → dense). `packages/persistence/src/workspaceImport.ts:57`: `validateImportFile(text): WorkspaceExport`.
- `packages/persistence/src/workspaceSerializer.ts`: `createWorkspaceSerializer({ repos, appVersion, now }).exportWorkspace()`, which reads `repos.workspaceMeta` for the workspace description (Story 7.2).
- `packages/simulation/src/index.ts`: `compileSession`, `createGridBuffers`, `gridFromDense`, `stepGridBuffers`, `createRng`, `isGridEmpty`, `Grid` (`occupant: Uint8Array`, `age: Uint16Array`, `width`, `height`). `apps/web/lib/battle/useSimulation.ts:255-305` is the reference composition.
- `packages/simulation/src/gol/cellSubject.ts`: the five rule properties and their per-organism semantics (FD3).
- `apps/web/lib/palette/paletteRegistry.ts`: `PALETTE` order (tokens 1–8 = CVD core; do not reorder). `apps/web/lib/battle/simulationSpeed.ts` + `packages/domain/src/settingsSchema.ts`: `defaultSpeed` 10 gen/s, `msPerCycle = 1000 / genPerSec`.
- `apps/web/lib/organisms/ruleContentHash.ts`, `organismRecord.ts` (`projectOrganismForSave`), `apps/web/lib/battle/battleRecord.ts` (`projectBattleForSave`): the editors' save projections (FD2).
- `packages/domain/src/organismSchema.ts`, `battleSchema.ts`, `survivalRuleSchema.ts`: caps, H.1 superRefine, condition/operand shapes (`range` is a `[min, max]` tuple; `organismType` pattern is a library id string).
- `apps/web/vitest.sweep.config.mts`: the config for throwaway `scripts/**` tests.

### Architecture compliance

- **FR-9.1:** the preset is an FR-8.3 envelope produced by the serializer; no second format, no hand-written JSON; lockstep gate green.
- **Decision H.1:** each battle's `organismIds` ≡ placed set, guaranteed by going through `projectBattleForSave` and re-checked by `validateImportFile` (schema superRefine).
- **Decision E:** `organismType` conditions persist the target's **library id**, never a numeric ref.
- **M9:** Conway's Classic ships unmodified under its protected id.
- **Decision A / G.1:** battle grids are only 50×30 or 100×60 (`EditableGridPresetSchema`, enforced inside `projectBattleForSave`).
- **AR-26 / NFR-8.3:** CVD-core tokens only (FD3).
- **Engine purity / determinism:** the test injects fixed seeds and never asserts on unseeded randomness (project-context "Determinism is a precondition").
- **Comments explain WHY; cite IDs exactly** (`FR-9.2`, `FR-9.5`, `AR-26`, `Decision H`, `M9`, `Story 7.3`); `npm run spec:check` fails on an unresolvable ID.
- Naming: `presetShowcase.test.ts` (camelCase); preset file `<id>.json` (kebab slug).

### Library / framework notes

No new dependencies, and nothing version-sensitive, so no web research is needed. Vitest 4 (jsdom env in apps/web; the engine is pure and runs there fine). The throwaway generator runs under `vitest.sweep.config.mts`, which is `environment: 'node'`: Node 24's global `crypto.randomUUID()` / `crypto.subtle` (used by `ruleContentHash`) are available there. The committed showcase test needs no hashing and runs in apps/web's default jsdom env.

### Testing standards

- `presetShowcase.test.ts` reads the **real** shipped preset: no fixtures, no mocks. Its value is gating the shipped content.
- Failure messages name the battle, seed, and organism (the 7.1 review standard).
- Static loop over the default preset's battles, not `it.each` over the folder (the 7.1 comment's reason: a vacuous zero-case loop must not pass).
- `presetWorkspaces.test.ts` stays untouched and green.
- Local gate: `npm run ci:dev`; don't pipe it through `tail`.

### Project Structure Notes

- New: `apps/web/public/workspaces/<id>.json`, `apps/web/lib/workspaces/presetShowcase.test.ts`.
- Modified: `apps/web/public/workspaces/index.json`; possibly `apps/web/lib/workspaces/presetManifest.ts` (comments only, Task 3.2).
- Deleted: `apps/web/public/workspaces/starter-workspace.json`.
- Throwaway, never committed: `apps/web/scripts/*.test.ts` harness/generator, Playwright screenshot script, screenshots.

### What NOT to build

- No loader / fetch / auto-load / Settings row / link (7.4–7.6). No catalogue presets beyond the one default (7.7).
- No change to AR-45 fixtures, `useWorkspaceSeed`, schemas, or the lockstep test.
- No committed generator script; no build step writing presets.
- No pixel or snapshot tests of thumbnails or runs.
- No badges or "sample" labelling on preset battles (UX §4: preset battles are ordinary battles).

### Previous story intelligence

- **7.1:** the lockstep compares against **git-tracked** files (owner ruling D1c), so `git add` the new preset and `git rm` the starter, or the gate names them as orphans. `file` must equal `${id}.json` (D2a); the slug pattern admits `index`, so don't choose it. Route (b) throwaway-script generation via `vitest.sweep.config.mts` from `apps/web` worked; delete the script after. The review hit stale comments hard: re-read `presetManifest.ts` after the swap.
- **7.2:** workspace description lives behind `repos.workspaceMeta` (M16); the serializer exports it, and `createFakeRepositories()` has a `workspaceMeta` member. The manifest description must equal the envelope's `description` exactly (whitespace included; `normalizeDescription` trims on save, so copy the *saved* value). Caps: organism/battle 280, workspace 500 (constants `MAX_ORGANISM_DESCRIPTION_LENGTH`, `MAX_BATTLE_DESCRIPTION_LENGTH`, `MAX_WORKSPACE_DESCRIPTION_LENGTH` in `@gol/domain`). A workspace description makes the workspace non-pristine (FD6 of 7.2), which is irrelevant here but matters to 7.4/7.5.
- **7.2 display surfaces** exist now: the gallery header shows the workspace description, tiles show a 2-line clamped battle description, the battle header shows the full battle description, and organism cards show a 2-line clamp. Write the first ~2 lines of each battle/organism description to stand alone, because that is what the tile/card shows.

### Git intelligence

`main` @ `ad6cc63` (#99, Story 7.2 merged). The last commits are 7.2's review/ruling passes and a Firefox swatch hit-target fix (`cc1fcd2`). Nothing touches the engine, serializer or preset folder since 7.2's starter regeneration.

### References

- [Source: docs/planning-artifacts/epics.md#Story 7.3: Showcase Preset Content] and #Epic 7 intro
- [Source: docs/planning-artifacts/prds/prd-GameOfLife-2026-05-26/prd.md#FR-9.2 (rationale), #FR-9.1, #FR-9.5]
- [Source: docs/planning-artifacts/prds/prd-GameOfLife-2026-05-26/CHANGELOG-preset-workspace-library.md]
- [Source: docs/planning-artifacts/ux-designs/ux-GameOfLife-2026-05-27/preset-workspace-library-design.md §4 (content presentation), §5 (descriptions)]
- [Source: docs/planning-artifacts/architecture.md: Decision H (H.1), Decision E, Decision A, M9, M10, M16]
- [Source: docs/implementation-artifacts/palette-cvd-validation.md: G4 CVD-robust core, tokens 1–8]
- [Source: docs/project-context.md: determinism, no canvas pixel tests, bundle growth gate, spec:check]
- [Source: docs/implementation-artifacts/epic-7/7-1-preset-workspace-foundations.md, 7-2-descriptions-at-every-level.md]

### Open questions for the owner (answered provisionally above)

1. **FD1:** the preset's display name / id are the dev's pick (stable forever once merged); veto at review.
2. **FD4:** a committed "showcase" test with calibrated floors (survival of all colours, territory transfers, no runaway single colour at 5 s). The floors are content-calibrated, so a future deliberate redesign of the default preset re-calibrates them in the same PR.

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5.5

### Debug Log References

- Throwaway harness/generator `apps/web/scripts/showcase.test.ts` (route (b), `vitest.sweep.config.mts`) and a Playwright screenshot script were deleted before the commit. Colony placement RNG seeds: `7301` (Four Corners) and `7302` (Tug of War), via `createRng(seed)`, fill 45 % per region.
- Negative proof (4.3, reverted): pointing the default preset at the old starter envelope fails 7 showcase tests, e.g. `battle "Three-Way Skirmish", seed 1: "Patient Defender" has no cells left`, and `battle "Three-Way Skirmish" description: expected undefined to be truthy`. Raising `MIN_TERRITORY_TRANSFERS` to 5000 fails with `battle "Four Corners", seed 1: only 267 territory transfers (need 5000)`.
- Visual check (5.1, dev server + Playwright, screenshots kept in the scratchpad, not the repo): gallery tiles are dense and four-/three-coloured, workspace description shown above them; both battles at cycle 50 (~5 s at 10 gen/s) show every colour alive (Four Corners 244/170/129/70 cells, Tug of War 62/48/28), fronts colliding. Honest note: Life-family soup burns off, so by 5 s the dish is sparser (about 15-20 % live) than the tile; at 300 cycles all four Four Corners organisms are still alive, Tug of War has settled to a few colonies.

### Completion Notes List

- Route: headless serializer composition (FD2): `createFakeRepositories` -> `seedDefaultWorkspace` -> organisms saved after `OrganismSchema.parse` (uuid ids, `ruleContentHash` hashes) -> battles via `projectBattleForSave` -> `workspaceMeta.save` -> `exportWorkspace` -> Prettier.
- **Name/id choice for owner veto (FD1): "Colony Clash", id `colony-clash`** (stable forever). Starter deleted, manifest replaced, `defaultPresetId: colony-clash`.
- Final roster (name / colorToken / dominance / aging / rules in order):
  - Conway's Classic (stock) / sky-blue / 50 / no / B3, S2-3.
  - Ember Raiders / vermillion / 70 / no / raid an Amber Tide cell (occupied + organismType Amber Tide + own neighborCount >= 2); born empty with 3; survive 2-3.
  - Moss Weavers / bluish-green / 75 / no / overgrow an Ember Raiders cell (occupied + organismType + own neighborCount >= 2); born empty with 3; born empty with 6; survive 2-3.
  - Amber Tide / amber / 60 / aging on / die at age >= 30; flood a Conway's Classic cell (occupied + organismType + >= 2); born empty with 3; survive 2-3.
  - Invasion chain: Weavers -> Raiders -> Tide -> Conway (each invader outranks its prey, so it wins the birth-vs-survival contest).
- Battles: Four Corners 100x60 (newest): Conway TL, Weavers TR, Raiders BR, Tide BL. Tug of War 50x30: Weavers | Tide | Conway (Raiders appear only in Four Corners).
- Measured over 50 cycles (identical for all seeds, no dominance ties): Four Corners 267 transfers, Tug of War 109; max single-organism share 40 % / 45 %. Gate floors: `MIN_TERRITORY_TRANSFERS = 50`, `MAX_LIVE_SHARE = 0.9`. Tuning history: Amber Tide with B34/S234 and Weavers with S2-4 both overran the dish; first-match invasion at neighborCount >= 3 gave too few transfers, >= 2 gave 200-450.
- AC5 gap (Conway's Classic without a description): resolved by owner ruling D1 (a), see below.
- **D1 applied (owner ruling (a)):** `CONWAYS_CLASSIC` now carries an authored description (`packages/domain/src/defaultWorkspace.ts`; the D1 text was superseded by D5 below) `colony-clash.json` re-exported via headless import -> edit -> export (only Conway's `description` and `exportedAt` changed; manifest unchanged, as the workspace description did not change). The showcase test's Conway exemption is dropped. D2 and D3: accepted as is, no change.
- D1 ripple, adjusted: fixtures that used `CONWAYS_CLASSIC` as the description-less case now strip the key (`workspaceExportProjection.test.ts`, `OrganismCard.test.tsx`, `organismClone.test.ts`, `organismDraft.test.ts`), and the 7.2 import e2e (`settings.spec.ts`) expects two described cards, since every import re-seeds the stock organism. Pristine / seed / reset / ensureDefaultOrganism checks compare against the constant and stay green. Caveat: a store seeded before this change holds Conway's WITHOUT a description (M9: never overwritten, no backfill), so its visitors never see Conway's description; resolved as D4 (b) below for the pristine check. 7.4 is not affected: its gate is `isFreshWorkspace()`, which checks the `gol:schema` stamp, not content.
- **D4 applied (owner ruling (b)):** `isPristineWorkspace` also accepts `PRE_D1_CONWAYS_CLASSIC` (`CONWAYS_CLASSIC` with the `description` key omitted); nothing else loosens (a present-but-`undefined`, empty or edited description is still modified). No backfill, so legacy stores keep a description-less Conway by design.
- **D5 applied (owner ruling (c)):** `CONWAYS_CLASSIC.description` (251/280): "The original Game of Life rules: a cell is born with exactly 3 neighbors of its own kind and survives with 2 or 3, otherwise it dies. It can only defend, never take a cell from another organism, so in a mixed dish watch invaders eat into its colonies." `colony-clash.json` re-exported (only Conway's `description` and `exportedAt` changed).
- Tug of War is weak past ~15 s (small dish settles into a few colonies); it satisfies every 5 s gate. The 100x60 flagship keeps evolving to 300 cycles.
- `presetManifest.ts`: added one sentence to the authoring path (improve an existing preset via import, edit, export). "How the first preset was produced" is still true.
- `npm run ci:dev` green (typecheck, lint with one pre-existing `BattleGallery.tsx` warning, format, spec:check, boundary, coverage, build, bundle:check, bench, e2e chromium 314 passed / 1 skipped).

### File List

- apps/web/public/workspaces/colony-clash.json (new; D1: re-exported with Conway's description; D5: description rewritten)
- apps/web/public/workspaces/index.json (modified)
- apps/web/public/workspaces/starter-workspace.json (deleted)
- apps/web/lib/workspaces/presetShowcase.test.ts (new; D1: Conway exemption dropped)
- apps/web/lib/workspaces/presetManifest.ts (comment only)
- packages/domain/src/defaultWorkspace.ts (modified; D1: Conway's description; D5: rewritten)
- packages/domain/src/pristineWorkspace.ts (modified; D4: pre-D1 stock shape accepted)
- packages/domain/src/defaultWorkspace.test.ts (modified)
- packages/domain/src/workspaceExportProjection.test.ts (modified)
- apps/web/components/organisms/OrganismCard.test.tsx (modified)
- apps/web/lib/organisms/organismClone.test.ts (modified)
- apps/web/lib/organisms/organismDraft.test.ts (modified)
- apps/web/e2e/settings.spec.ts (modified)
- apps/web/lib/organisms/organismRecord.ts (comment only, second and third review)
- packages/domain/src/pristineWorkspace.test.ts (modified; test title, second review; D4 tests)
- docs/implementation-artifacts/epic-7/7-3-showcase-preset-content.md
- docs/implementation-artifacts/sprint-status.yaml

### Change Log

- 2026-09-28: Story 7.3 implemented: Colony Clash default preset replaces the dev-fixture starter; showcase gate test added.
- 2026-09-29: Code review (Opus): 6 patches applied. Organism and workspace descriptions were corrected by a headless import → edit → export (FD2 route; only `description` fields and `exportedAt` changed) and the manifest was synced. The showcase test gained seed-independence, flagship-order, Conway-placed and ≥3-organisms-per-battle assertions, and one `presetManifest.ts` comment was reworded. D1–D3 are left open for the owner.
- 2026-09-29: Owner rulings on review decisions: D1 (a) applied (authored `CONWAYS_CLASSIC` description, preset re-exported, exemption dropped, ripple fixtures adjusted); D2 and D3 (a) accepted, no work.
- 2026-09-29: Second review (Opus) of the ruling pass `7585f7b`: 4 patches applied (a stale `organismRecord.ts` comment, a stale pristine test title, the legacy-store caveat re-aimed from 7.4 to Settings Import / 7.5 / 7.6, File List completed). D4 (the pre-D1 store's Conway is not pristine and is never backfilled) and D5 (Conway's description wording) are left open for the owner.
- 2026-09-29: Owner rulings D4 (b) and D5 (c) applied: `isPristineWorkspace` also accepts the pre-D1 stock Conway (constant minus `description`); `CONWAYS_CLASSIC` description rewritten in FD3 voice (own-kind neighbours, no parameter list, what to watch for; 251/280) and `colony-clash.json` re-exported via the FD2 import → edit → export route (only Conway's `description` + `exportedAt` changed; manifest unchanged, it carries the workspace description).
- 2026-09-29: Third review (Opus) of the D4–D5 commit `1277013`: 5 patches applied (two duplicate pristine tests replaced by a present-but-`undefined` description case, stale `organismRecord.ts` and `defaultWorkspace.ts` comments, Completion Notes brought up to D4/D5, File List de-duplicated). No decisions left open. `npm run ci:dev` green.

Dev Model: sonnet   # content authoring + one test following existing patterns (route (b) generation, lockstep-test idiom, useSimulation's engine composition); every structural choice is pinned in FD1–FD7, nothing for later stories to build on
Proposed lane gate: none

---

This story was implemented with the 'Implement next story' skill with the following stats:

| Phase | Agent model | Agents | Active | Wall clock | Input | Output | Cache write | Cache read | Total tokens |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Step 0 — re-entry guard | — | 0 | 22s | 22s | 18 | 2,485 | 9,434 | 512,625 | 524,562 |
| Step 1 — create | opus-5-5 | 1 | 6m 01s | 6m 01s | 120 | 3,024 | 281,097 | 7,169,866 | 7,454,107 |
| Step 2 — implement | sonnet-5-5 | 1 | 16m 01s | 16m 01s | 198 | 4,773 | 254,164 | 9,959,042 | 10,218,177 |
| Step 3 — review + PR | opus-5-5 | 4 | 12m 15s | 12m 15s | 342 | 12,164 | 541,670 | 12,913,641 | 13,467,817 |
| _of which the orchestrator_ | opus-5-5 | — | — | — | 52 | 13,882 | 33,202 | 1,642,116 | 1,689,252 |
| **Total (create → PR ready)** | | 6 | **34m 39s** | 34m 39s | 678 | 22,446 | 1,086,365 | 30,555,174 | **31,664,663** |

Run started 2026-09-28 23:36 CEST; wall clock runs to the point the run stopped for the owner's review. No idle gaps were excluded; Active and Wall clock agree. (A gap counts as idle above 15 min.) Each phase row covers the phase agent, any agents it spawned, and the orchestrator's own turns in that window — the orchestrator row breaks its share out again, it is not additional. Cache reads dominate the token totals and are billed at a fraction of input rate, so read the Input and Output columns for effort and the total only as a ceiling. The orchestrator's final turn is still being written when these numbers are taken.
