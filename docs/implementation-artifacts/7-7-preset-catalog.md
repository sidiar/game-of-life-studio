---
baseline_commit: 9504be0672977f6d61e5b51f4c59570b47b313d4
---

# Story 7.7: Preset Catalog

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a visitor exploring beyond the default,
I want a set of curated preset workspaces,
so that the Settings loader and preset links have somewhere interesting to go.

## Acceptance Criteria

1. **Given** the preset folder, **When** this story completes, **Then** at least three presets beyond the default ship, each authored through the app (export path), each passing the 7.1 lockstep gate, each fully described at workspace, battle, and organism level (FR-9.1, FR-9.5)
2. **And** every preset is reachable through the Settings loader and by preset link (FR-9.3, FR-9.4), and the default preset designation is unchanged unless deliberately re-pointed
3. **And** any preset built for scale holds the NFR-1.1 frame budget on its shipped grid, verified before inclusion

Epic context (epics.md, Story 7.7): deliberately last; content curation is open-ended, **quality over quantity**; final selection, grouping into workspaces, and naming are in-story. The owner + agent brainstorm candidates (2026-09-28) are Conway's Menagerie, Mirror Match, Stress Test, Rock–Paper–Scissors, The Worm, Dominance Ladder. FD1 below turns that list into a prioritised pick with engine-feasibility notes.

## Tasks / Subtasks

- [x] **Task 1: Explore and tune candidates headlessly** (AC: 1, 3)
  - [x] 1.1 Create a throwaway harness (never committed) under `apps/web/scripts/`, run from `apps/web` with `npx vitest run --config vitest.sweep.config.mts scripts/<file>.test.ts`. This is the 7.3 route: it builds candidate organisms + battles in memory and runs them through the real engine with the FD5 composition, printing population per organism, ownership transfers, and an ASCII frame every ~10 cycles.
  - [x] 1.2 Work down the FD1 priority list. For each candidate, tune within FD2/FD3 until it reads as its pitch says (FD1 gives each candidate's "reads as intended" test). **Timebox each candidate** (roughly one tuning pass of a few iterations). If a candidate cannot be made to read as intended, drop it, record why in the Dev Agent Record, and take the next one on the list.
  - [x] 1.3 Stop at **three** catalogue presets that pass (AC1's minimum). A fourth is allowed only if it is already clearly good; do not pad (quality over quantity).
- [x] **Task 2: Generate each preset through the serializer** (AC: 1)
  - [x] 2.1 For each chosen preset, use the 7.3 FD2 composition in a throwaway script (same folder, may be the same file): `createFakeRepositories()` → `seedDefaultWorkspace(repos)` (stock Conway's Classic) → save organisms (each through `OrganismSchema.parse`, `crypto.randomUUID()` ids, rule `contentHash` from `ruleContentHash`) → save battles via `projectBattleForSave` → `repos.workspaceMeta.save({ description })` → `createWorkspaceSerializer({ repos, appVersion: APP_VERSION, now: () => new Date() }).exportWorkspace()` → `JSON.stringify(envelope, null, 2)` → write `apps/web/public/workspaces/<id>.json`. **One fresh `createFakeRepositories()` per preset**: a preset must not carry another preset's organisms. Delete the script afterwards.
  - [x] 2.2 `npx prettier --write apps/web/public/workspaces/`. Formatting is the only allowed edit (7.1 FD4). Never hand-touch ids, hashes, or `exportedAt`.
  - [x] 2.3 Record in the Dev Agent Record, per preset: route, placement seed(s), the roster (name / colorToken / dominance / aging / rules in order), the battles (name / grid / organisms placed), and the "reads as intended" evidence from 1.2.
- [x] **Task 3: Manifest** (AC: 1, 2)
  - [x] 3.1 Append one `index.json` entry per new preset **after** `colony-clash` (`id`, `name`, `description` = the envelope's workspace description verbatim, `file` = `<id>.json`). **`defaultPresetId` stays `"colony-clash"`** (FD6). `git add` each new file (the lockstep reads git-tracked files, 7.1 owner ruling D1c).
  - [x] 3.2 Ids follow FD4 (kebab slug of the display name, stable forever once merged; never `spiral-wars`, `link-test`, `index`).
- [x] **Task 4: Catalogue gate test** (AC: 1, 2, 3)
  - [x] 4.1 New `apps/web/lib/workspaces/presetCatalog.test.ts` per FD7 (reads every manifest preset off disk; static structural and liveness assertions; `defaultPresetId` pinned to `colony-clash`).
  - [x] 4.2 Negative proof (manual, reverted, not committed): blank one organism's description in a copy of an envelope, or add a 21st organism to a battle, and confirm the gate goes red with a message naming the preset and entity. Record it in the Dev Agent Record.
- [x] **Task 5: Reachability, e2e** (AC: 2)
  - [x] 5.1 `apps/web/e2e/presetLink.spec.ts`: add one test per FD8 that walks every **non-default** manifest entry: a fresh context → `/?preset=<id>` → each of that preset's battle names is visible as a gallery heading. Fix the stale comment "the manifest ships one entry" beside `routeLinkTestPreset` (the test-side preset is still needed; only the reason's wording changes).
  - [x] 5.2 `apps/web/e2e/loadPreset.spec.ts`: add one assertion (inside an existing test that renders the row, or one small new test) that the Load Preset select's options are exactly the manifest's names, the default suffixed ` (default)` and listed first (the row's `orderEntries` behaviour).
- [x] **Task 6: Scale verification, only if a scale preset ships** (AC: 3)
  - [x] 6.1 Per FD3: measure `step()` on the shipped battle's own roster and grid (throwaway, same composition as the bench) and record the numbers against the 16.667 ms budget in the Dev Agent Record. If no preset is built for scale, write "AC3: no scale preset shipped (FD3)" in the Completion Notes instead.
- [x] **Task 7: Visual check and verify** (AC: 1, 2)
  - [x] 7.1 `npm run dev` → Settings → Load Preset (or Import the file) for each new preset → gallery thumbnails read well → open each battle, press Play at default speed, watch ~10 s. Screenshots into the scratchpad or `/tmp`, never the repo. Describe what was seen per battle in the Dev Agent Record.
  - [x] 7.2 `npm run ci:dev` green (never the four-browser `npm run ci`). `bundle:check` must show no route growth: nothing in app code imports preset JSON (7.1 FD5).

### Review Findings

Code review 2026-09-29 (opus; Blind Hunter + Edge Case Hunter + Acceptance Auditor). 0 decision-needed, 9 patch, 1 defer, 20 dismissed. Two independent re-implementations of the engine semantics (scratchpad, not committed) reproduced the Dev Agent Record's Four Ranks numbers exactly, and were used to check the content claims below.

- [x] [Review][Patch] Glider Gun and Eater: the R-pentomino meets other organisms, which breaks FD1 ("placed far enough apart that it never meets another organism"; "textbook self for at least 100 cycles"). Its debris touches the eater from about cycle 95, destroys one glider on cycles 224–237, and touches the pulsar from cycle 155. The pulsar is reduced to still debris by about cycle 2500. The battle's "Far off" and the workspace's "every pattern behaves as it would in the original game" are false. Fix: move the R-pentomino into its own battle. [apps/web/public/workspaces/conways-menagerie.json]
- [x] [Review][Patch] Four Ranks description: "reddish-purple … ends up holding most of the dish" is false. Sovereign holds 504 of 6000 cells at cycle 100 and 267 at cycle 300 (4–8 % of the dish, about 72 % of the live cells). [apps/web/public/workspaces/dominance-ladder.json]
- [x] [Review][Patch] Sandwich description: "reddish-purple meets vermilion and outranks it too" does not happen. The run is deterministic (no dominance ties) and freezes by about cycle 100–200 at Knight 30 / Sovereign 32 cells, and vermilion is never absorbed. [apps/web/public/workspaces/dominance-ladder.json]
- [x] [Review][Patch] Mirror Match battle description: "the blue side keeps its ground" is false. Conway's side falls 1208 → 342 → 192 by cycle 300; it only thins far less than the amber side (52). [apps/web/public/workspaces/mirror-match.json]
- [x] [Review][Patch] Violet Sovereign description: "needs 2 neighbors of its own kind" should read "at least 2" (the rule is `gte 2`; FD3 precision). [apps/web/public/workspaces/dominance-ladder.json]
- [x] [Review][Patch] Pulsar description: "a ring of cells" is imprecise. A pulsar is four symmetric groups of 3-cell bars. [apps/web/public/workspaces/conways-menagerie.json]
- [x] [Review][Patch] Battle `createdAt`/`updatedAt` is later than the envelope's `exportedAt` in all three presets (the generator stamps `t0 + n s`). A real export through the app cannot produce that. Stamp battles before the export instead. [apps/web/public/workspaces/*.json]
- [x] [Review][Patch] e2e (g) needs three changes. The heading match is a substring match, so add `exact: true`. It never proves that only the linked preset loaded, so assert that the default's battle headings are absent. It grows by one cold page load per preset under the default 30 s timeout on the per-browser matrix, so mark it `test.slow()`. [apps/web/e2e/presetLink.spec.ts]
- [x] [Review][Patch] presetCatalog.test.ts: a preset with zero battles passes every per-battle gate, and the liveness comment's "a zero-case loop cannot pass" holds only for presets, not battles. Assert that every preset ships at least one battle. [apps/web/lib/workspaces/presetCatalog.test.ts]
- [x] [Review][Defer] Stock Conway's Classic description ("watch invaders eat into its colonies") reads oddly in presets with no invaders (Conway's Menagerie, Mirror Match) or where it is unplaced (Dominance Ladder) [packages/domain CONWAYS_CLASSIC] — deferred, pre-existing: M9 and 7.3 D4/D5 forbid editing it per preset

## Dev Notes

### Forced decisions (made here so the dev agent does not have to)

- **FD1: Selection, in priority order, with each candidate's engine reality.** Take candidates top-down until three pass Task 1.2. The order puts the ones the engine supports cleanly first.

  1. **Dominance Ladder** (lowest risk). 3–5 organisms with **identical rules** except dominance (distinct values, e.g. 20 / 40 / 60 / 80), each with an invasion rule `born` on `cellState eq occupied` gated on its own `neighborCount gte 2` (no `organismType` narrowing: it attacks anyone), plus B3/S23 on its own cells. Birth vs survival is resolved by dominance alone, so the higher colony eats the lower at every contact line. *Reads as intended when*: at every front the higher-dominance colour advances, and the ordering of who absorbs whom is visible within ~10 s. Colours ordered along the ladder in the description so the visitor can read it ("the reddish-purple outranks everything").
  2. **Conway's Menagerie**. ⚠️ `neighborCount` counts **same-organism** neighbours only, so classic Life interactions (a glider gun feeding an eater, an R-pentomino wrecking a pulsar) work **only when every pattern involved is the same organism**. Different organisms do not see each other as neighbours; they only contest cells. So: interacting patterns are all Conway's Classic (the stock record). For colour variety, standalone showpieces may be **recoloured clones** of Conway's Classic (identical B3/S23 rules, a new uuid, a descriptive name such as "Pulsar Field"), each placed far enough apart that it never meets another organism (a clone that meets a different organism behaves non-classically). Give clones distinct dominance values anyway, so any accidental contact is deterministic. ⚠️ Grid edges are **hard** (FR-5.9: no wrap), so a glider stream reaching an edge decays into debris; place guns so their stream runs into an eater (Eater 1) or the long axis of the 100×60 grid. Patterns must be cell-accurate: decode standard RLE in the throwaway script, never hand-type coordinates, and verify each in the harness (a Gosper gun's population is periodic with period 30 and grows by one glider, 5 cells, per period; a blinker/pulsar oscillates; a glider translates). Gosper glider gun RLE (36×9): `24bo$22bobo$12b2o6b2o12b2o$11bo3bo4b2o12b2o$2o8bo5bo3b2o$2o8bo3bob2o4bobo$10bo5bo7bo$11bo3bo$12b2o!`. Candidate grouping: one 100×60 "grand collision" battle (gun + eater, R-pentomino, pulsars) and at most one or two quiet showpiece battles. *Reads as intended when*: each named pattern behaves as its textbook self for at least 100 cycles (except the deliberate chaos of a methuselah).
  3. **Rock–Paper–Scissors**. ⚠️ **Strictly cyclic predation by dominance is impossible**: dominance is a total order, and a `born`-on-`occupied` claim beats the victim's `survive` claim only if the attacker outranks it. With A eats B eats C eats A, one of the three predator links always points upward. What *can* work: an attacker takes a cell freely wherever the victim makes **no** survival claim that cycle (the cell is then uncontested; unclaimed cells clear, M10). So the "uphill" link succeeds only where the victim is not defending (outside its S rule's neighbour window), and the two "downhill" links succeed everywhere. Target each attack with `organismType` (the victim's library id) gated on the attacker's own `neighborCount`. Tuning goal: spiral or wave fronts where each colour visibly chases the next. This is the candidate most likely to fail its timebox: if after tuning one colour simply wins, or the dish freezes, drop it (Task 1.2).
  4. **Mirror Match**. Conway's Classic vs a recoloured clone with `agingEnabled: true` and a `die` rule at some age (first in the list, so it wins first-match). Two organisms with no invasion rules never take each other's cells; they only contest **empty** cells where both B3 rules match, and equal dominance there falls to the tie-break RNG, which production reseeds per run (the dish looks different on every visit). Either accept that (catalogue presets are not held to 7.3's determinism bar) and say "identical rules, identical rank" in the description, or give the clone a dominance one step away and say so. Symmetric opening: mirror one seeded soup across the vertical midline. *Reads as intended when*: the mortal side's population visibly diverges from the immortal side's within ~10 s.
  5. **The Worm** (experimental per the epic). A static ground organism (`survive` always, e.g. `cellState eq alive`, never born) tunnelled by a spreader whose `born` rule targets `organismType` ground. Only if 1–4 leave a slot open; drop it at the first sign that the movement does not read as a worm.
  6. **Stress Test**. See FD3: the NFR-1.1 guarantee covers **up to 20 organisms**, not 255, and the palette has only 20 tokens. Not recommended for this story; if built at all, it is the 20-organism "full house" described in FD3.

  Grouping: **one candidate = one preset workspace** (each a separate manifest entry), 1–3 battles each. Do not merge candidates into one workspace; the Settings list and links address workspaces, so each should have one clear identity.

- **FD2: Authoring route = the 7.3 FD2 route, unchanged.** Headless serializer composition built from the editors' own save projections; no hand-written envelope JSON (FR-9.1); no committed generator (7.1 "What NOT to build"). Read 7.3's FD2 bullets (Organisms / Battles / Conway's Classic) in `docs/implementation-artifacts/7-3-showcase-preset-content.md` and follow them exactly. In particular: Conway's Classic is always the **stock** record from `seedDefaultWorkspace` and is never modified (M9; 7.3 D4/D5: its description text is load-bearing for `isPristineWorkspace`); give battles distinct `updatedAt` values so the intended flagship sorts first in the gallery (FR-7.3).

- **FD3: Content constraints.**
  - **Colours**: distinct tokens within each preset, taken from the CVD-robust core (tokens 1–8: `sky-blue` is Conway's; `vermillion`, `bluish-green`, `amber`, `reddish-purple`, `yellow`, `azure`, `coral-red`) whenever the preset has ≤ 8 organisms. Tokens 9–20 are not pairwise CVD-gated; use them only if a preset needs more than 8 colours, and say so in the Dev Agent Record.
  - **Grids**: only 50×30 or 100×60 (`EditableGridPresetSchema`, Decision A / G.1). Larger Play-mode sizes are never persisted.
  - **Organisms per battle: ≤ 20.** NFR-1.1 guarantees 60 FPS at 100×60 with **up to 20 co-placed organisms**; beyond that it promises only graceful degradation. Phase 2 cost is `cells × organisms × rules-until-first-match` (project-context, Testing Rules), and the bench already measures 20 organisms × 50 rules at 5.6 ms locally / 12.0 ms on CI against 16.667 ms. A 255-organism battle would run roughly 12× that and cannot hold the budget, so "dozens-to-255 organisms" from the brainstorm is out of AC3's reach. FD7 asserts the ≤ 20 cap.
  - **What counts as "built for scale" (AC3)**: any battle with more than 8 organisms, or one whose total rule count exceeds the bench fixture's 50. For such a battle, Task 6 measures `step()` on its own roster and grid: the throwaway composition `threePhaseStep.bench.ts` uses (`compileSession(roster)`, `createGridBuffers(gridFromDense(battle.gridState))`, a fixed-seed `createRng`, 25 warm-up + 100 measured steps), mean per step, compared with the 16.667 ms budget minus the measured repaint cost (`npm run bench` prints it; ~0.07 ms). Record the local number and state the headroom; CI runners measured about 2.1× slower than a laptop (`performance-baseline-validation.md`), so require the local mean to be under **~7.5 ms** (the ratio's margin), or drop the battle. Never gate timing in a committed unit test (flaky); the committed guard is FD7's structural cap.
  - **Engine semantics** (identical to 7.3 FD3; re-read it there): `neighborCount` = same-organism neighbours; `occupantNeighborCount` = other organisms; `cellState` is relative to the evaluating organism; rules are first-match in list order; a rule's `conditions` are ANDed; death runs before birth/survival; birth vs survival compete **by dominance alone** (ties: tie-break RNG); unclaimed cells clear (M10); edges are hard (FR-5.9).
  - **Rule summaries** (`payload.summary`, ≤ `MAX_RULE_SUMMARY_LENGTH` = 100, the editor cap in `apps/web/lib/organisms/ruleDraft.ts`; the schema allows 120): plain explanations, and precise (7.3 review: "own `neighborCount gte 2`" is "at least 2 neighbours of its own kind", diagonals included, not "touches on two sides").
  - **Descriptions** (FR-9.5, caps from Story 7.2): workspace ≤ 500, battle ≤ 280, organism ≤ 280; plain text, no markdown (UX §5). Voice: what the visitor is watching and what to look for, never how to use the app (7.3 review patch). No parameter lists that go stale on edit (7.3 D5: "dominance 70, aging on" is out; "outranks the amber tide" is fine). The first ~2 lines of each battle/organism description must stand alone (tile and card clamp to 2 lines). The workspace description **is** the manifest description, verbatim (7.2 projection gate).
  - **File size**: keep each envelope in the same order of magnitude as `colony-clash.json` (~400 KB prettified, two battles). The preset fetch has a 5 s timeout (`PRESET_FETCH_TIMEOUT_MS`), so a multi-megabyte file would fail on slow links. At most 3 battles per preset.

- **FD4: Names and ids.** Display names are the dev's call ("names that invite a click", UX §4); the brainstorm names are good defaults. Id = lowercase kebab slug of the display name (`PRESET_ID_PATTERN`; e.g. `dominance-ladder`, `conways-menagerie`, `rock-paper-scissors`, `mirror-match`). **Stable forever once merged** (7.1 FD3: links name them). Forbidden ids: `spiral-wars` (the e2e suite's "unknown id", `presetLink.spec.ts` tests (d)–(f): shipping it turns those tests red), `link-test` (the e2e's test-side preset), `index` (the manifest), and `colony-clash` (taken). State the chosen names and ids in the Completion Notes for owner veto at review.

- **FD5: Engine composition for the harness and the liveness check** (the same as `presetShowcase.test.ts` and `useSimulation.ts`): roster = `battle.organismIds.map(id => organismsById.get(id))` in roster order; `const compiled = compileSession(roster)`; `let buffers = createGridBuffers(gridFromDense(battle.gridState))`; `const deps = { ...compiled, organisms: roster, rng: createRng(seed) }`; loop `buffers = stepGridBuffers(buffers, deps)`; read `buffers.front.occupant` (`Uint8Array`, roster index + 1, 0 = empty). Reuse `presetShowcase.test.ts`'s loading and measuring code as the model; do not import from it (test files do not export).

- **FD6: The default stays `colony-clash`.** AC2's "unchanged unless deliberately re-pointed": this story does not re-point it. New entries are appended after it. `presetShowcase.test.ts` keeps reading only the default and stays untouched; catalogue presets are **not** held to its bar (its head comment says so).

- **FD7: A committed catalogue gate, `apps/web/lib/workspaces/presetCatalog.test.ts`.** AC1's "fully described" and AC3's structural half are checkable in CI, and a later edit to a catalogue preset must not silently break them. Sibling of `presetShowcase.test.ts`, same idioms (`dirname(fileURLToPath(import.meta.url))` path, `validateImportFile` → `fromEnvelope`, real files, no fixtures). Assertions:
  - (a) the manifest has **≥ 4** entries (the default + AC1's three), and `defaultPresetId === 'colony-clash'` (a WHY comment: re-pointing the default is a deliberate act that edits this line);
  - (b) for **every** manifest preset: the workspace, every battle and every organism have a non-blank description (FR-9.5). This includes `colony-clash`: it already passes, and "every preset" is the rule;
  - (c) any organism with id `conways-classic` deep-equals `CONWAYS_CLASSIC` (M9: the protected default ships unmodified in every preset);
  - (d) every battle's `organismIds.length ≤ 20`, with a named constant (e.g. `NFR_1_1_MAX_ORGANISMS = 20`) and a WHY comment citing NFR-1.1 and FD3;
  - (e) every non-Conway organism in a preset is placed in at least one of its battles (no library dead weight; Conway's Classic is exempt because every workspace carries it, and import re-seeds it anyway);
  - (f) within each battle, `colorToken`s are distinct (two same-coloured organisms in one dish are unreadable);
  - (g) liveness: for each catalogue battle (every non-default preset), running the FD5 composition with one fixed seed for `5 * DEFAULT_SETTINGS.defaultSpeed` cycles never empties the grid (dead content fails). No transfer floors, no share caps: those are the default's bar only (FD6).

  Static loops over the parsed manifest, never `it.each` over the folder (the 7.1 reason: a zero-case loop must not pass green); here (a) already fails an empty catalogue. Failure messages name the preset id, the battle and the organism. Keep the whole file well under a couple of seconds.

- **FD8: Reachability is by construction; the e2e proves it once.** The Settings row (`LoadPresetRow`) and the link (`PresetLinkArrival`) both read `index.json` at runtime and have no per-preset code, so a manifest entry *is* reachability. Task 5's two e2e additions prove it on the real manifest: the link test on a **fresh** context (pristine: no dialog, per 7.6 AC1) visits `/?preset=<id>` for every non-default entry and checks that preset's battle names (read off the envelope on disk, as the file's existing `presetBattleNames` does) appear as level-2 headings; the select test checks the options. No new component or unit test is needed. The e2e runs on the per-browser matrix, so keep the loop lean: one visit per preset, no axe re-runs.

- **FD9: No app-code change.** No loader, UI, schema or engine change. Nothing imports preset JSON (bundle gate). `presetManifest.ts` changes only if a comment now reads false (its head comment already describes N presets and the authoring path; likely no edit).

### What exists: read these before writing a line

- `docs/implementation-artifacts/7-3-showcase-preset-content.md`: **the recipe this story repeats N times**. FD2 (authoring route), FD3 (content constraints and engine semantics), the Dev Agent Record (tuning history: B34/S234 and S2-4 overran the dish; invasion at own `neighborCount gte 3` gave too few transfers, `gte 2` gave 200–450), and all three review rounds (description voice, precision of "neighbours of its own kind", Conway's description).
- `apps/web/public/workspaces/index.json`, `colony-clash.json`: the manifest (one entry, `defaultPresetId: "colony-clash"`) and a real envelope to compare shapes against.
- `apps/web/lib/workspaces/presetManifest.ts`: contract and authoring path (head comment). `presetWorkspaces.test.ts`: the lockstep gate (structural manifest parse, slug ids, `file === ${id}.json`, git-tracked lockstep, `validateImportFile` per preset, manifest description ≡ envelope description). Stays **untouched** and green; it already loops over every entry.
- `apps/web/lib/workspaces/presetShowcase.test.ts`: the model for FD7's loading, engine loop and failure-message style. Untouched.
- `apps/web/components/settings/LoadPresetRow.tsx`: native `<select>`, `orderEntries` puts the default first, the default's option reads `"<name> (default)"`; the echo under the label shows the selected entry's description. Built for N entries (7.5 Dev Notes: "do not special-case one entry").
- `apps/web/components/gallery/PresetLinkArrival.tsx`, `apps/web/lib/workspaces/presetLink.ts`: `/?preset=<id>`; pristine → load without a dialog; unknown id → alert.
- `apps/web/e2e/presetLink.spec.ts`, `apps/web/e2e/loadPreset.spec.ts`: the two specs Task 5 extends. Both read the real manifest off disk at the top of the file. Follow their file-local helper conventions (`seedWorkspace`, `statValue`, `galleryTitles`).
- `packages/simulation/src/strategy/threePhaseStep.bench.ts` + `packages/test-utils/src/benchmarkRoster.ts`: the NFR-1.1 fixture shape (20 organisms, 50 rules, 100 measured iterations after 25 warm-up) that FD3's measurement mirrors. `docs/implementation-artifacts/performance-baseline-validation.md`: the budget derivation and the CI/laptop ratio.
- `packages/simulation/src/gol/cellSubject.ts`, `packages/simulation/src/strategy/conflictPhase.ts`: the rule properties and the dominance resolution / implicit clear that decide FD1's feasibility notes.
- `packages/domain/src/survivalRuleSchema.ts`, `organismSchema.ts`, `battleSchema.ts`: caps, condition shapes (`range` is `[min, max]`; `organismType` pattern is a library id), H.1 superRefine, `EditableGridPresetSchema`.
- `apps/web/lib/palette/paletteRegistry.ts`: `PALETTE` order (tokens 1–8 = CVD core).
- `apps/web/lib/organisms/ruleContentHash.ts`, `organismRecord.ts`, `apps/web/lib/battle/battleRecord.ts` (`projectBattleForSave`): the editors' save projections (FD2).
- `apps/web/vitest.sweep.config.mts`: config for throwaway `scripts/**` tests (node env; `crypto.randomUUID` / `crypto.subtle` available).

### Architecture compliance

- **FR-9.1**: every preset is an FR-8.3 envelope produced by the serializer; no second format; lockstep gate green.
- **FR-9.3 / FR-9.4**: reachability through the existing manifest-driven row and link; no per-preset code.
- **FR-9.5**: descriptions at all three levels, caps from 7.2, manifest description = envelope description.
- **NFR-1.1 / AR-43**: ≤ 20 organisms per battle (FD3, FD7); any scale battle measured before inclusion (Task 6).
- **Decision H.1**: `organismIds` ≡ placed set via `projectBattleForSave`, re-checked by `validateImportFile`.
- **Decision E**: `organismType` conditions persist the target's **library id**, never a numeric ref.
- **M9**: Conway's Classic ships unmodified under its protected id in every preset.
- **Decision A / G.1**: grids only 50×30 or 100×60.
- **AR-26 / NFR-8.3**: CVD-core tokens by default (FD3).
- **Determinism**: tests inject fixed seeds; never assert on unseeded randomness.
- **Comments explain WHY; cite IDs exactly** (`FR-9.1`, `FR-9.5`, `NFR-1.1`, `M9`, `Story 7.7`); `npm run spec:check` fails on an unresolvable ID.
- Naming: `presetCatalog.test.ts` (camelCase); preset files `<id>.json` (kebab slug).

### Library / framework notes

No new dependencies and nothing version-sensitive, so no web research is needed. Vitest 4 (apps/web default env jsdom; the engine is pure and runs there). Throwaway scripts run under `vitest.sweep.config.mts` (`environment: 'node'`). Playwright for the two e2e additions.

### Testing standards

- `presetCatalog.test.ts` reads the **real** shipped presets: no fixtures, no mocks. Its value is gating shipped content.
- Failure messages name the preset id, battle and organism (the 7.1 review standard).
- `presetWorkspaces.test.ts` and `presetShowcase.test.ts` stay untouched and green.
- e2e stays thin (project-context): two small additions, no new spec file.
- No pixel or snapshot tests of thumbnails or runs (project-context: never pixel-test the Canvas).
- Local gate: `npm run ci:dev`; don't pipe it through `tail`.

### Project Structure Notes

- New: `apps/web/public/workspaces/<id>.json` × 3 (or 4), `apps/web/lib/workspaces/presetCatalog.test.ts`.
- Modified: `apps/web/public/workspaces/index.json`, `apps/web/e2e/presetLink.spec.ts`, `apps/web/e2e/loadPreset.spec.ts`; possibly `apps/web/lib/workspaces/presetManifest.ts` (comments only, FD9).
- Throwaway, never committed: `apps/web/scripts/*.test.ts` harness/generator, any timing script, Playwright screenshot script, screenshots.

### What NOT to build

- No change to the default preset, `presetShowcase.test.ts`, `presetWorkspaces.test.ts`, the loader, the Settings row, the link flow, schemas, the engine, or AR-45 fixtures.
- No "copy preset link" UI (7.6 open question 2; not in this AC).
- No badges or "sample" labelling on preset battles (UX §4).
- No committed generator script, no build step writing presets, no committed timing test.
- No preset beyond what passes its timebox; no 255-organism battle (FD3).

### Previous story intelligence

- **7.3** (the direct template): see "What exists". Its reviews spent three rounds on description precision and voice; get those right the first time (FD3 Descriptions). Its Tug of War was accepted but called thin past ~15 s; a catalogue preset's value is watching it longer than 5 s, so check the ~300-cycle horizon in the harness too.
- **7.5**: the row is a native select built for N entries; the default is listed first with ` (default)`; the loaded outcome message reads `Loaded “<name>” — your workspace now has N battles and M organisms.` Deferred items (dialog chunk failure, cross-row concurrency) are not this story's.
- **7.6**: `/?preset=<id>`, the id is a URL slug; `spiral-wars` is the e2e's unknown id (FD4). The spec already defines a test-side `link-test` preset; its comment "the manifest ships one entry" goes stale with this story (Task 5.1).
- **7.4**: first visit loads the default only; this story does not touch it.
- **7.1**: the lockstep compares **git-tracked** files, so `git add` new presets; `file` must equal `${id}.json`.
- **7.2**: manifest description must equal the envelope's `description` exactly (the saved, trimmed value).

### Git intelligence

`main` @ `9504be0` (#103, Story 7.6 merged). The last commits are 7.6's feature, review fixes and owner rulings D1–D3 (link notice, arrival flow, e2e spec). Nothing touches the engine, serializer, schemas or preset folder since 7.3's `colony-clash.json` re-export.

### References

- [Source: docs/planning-artifacts/epics.md#Story 7.7: Preset Catalog] and #Epic 7 intro
- [Source: docs/planning-artifacts/epics.md: NFR-1.1, AR-43, FR-9.1, FR-9.3, FR-9.4, FR-9.5]
- [Source: docs/planning-artifacts/ux-designs/ux-GameOfLife-2026-05-27/preset-workspace-library-design.md §4, §5]
- [Source: docs/planning-artifacts/architecture.md: Decision A, Decision E, Decision H (H.1), M9, M10]
- [Source: docs/project-context.md: Testing Rules (bench budget, Phase 2 cost, determinism, no canvas pixel tests), bundle growth gate]
- [Source: docs/implementation-artifacts/performance-baseline-validation.md]
- [Source: docs/implementation-artifacts/7-3-showcase-preset-content.md, 7-5-load-preset-from-settings.md, 7-6-preset-link.md]
- [Source: docs/implementation-artifacts/palette-cvd-validation.md: G4 CVD-robust core, tokens 1–8]

### Open questions for the owner (answered provisionally above)

1. **FD3**: the brainstorm's "Stress Test, dozens-to-255 organisms" cannot hold NFR-1.1 (guaranteed only up to 20 organisms), so it is deprioritised and capped at 20. Veto if a degradation-showcase preset outside the frame budget is wanted (that would need an AC3 amendment).
2. **FD1**: selection order Dominance Ladder → Conway's Menagerie → Rock–Paper–Scissors → Mirror Match → The Worm → Stress Test, with timeboxed drops recorded. Names and ids are the dev's pick; veto at review (ids are stable forever once merged).
3. **FD7 (a)**: the catalogue gate pins `defaultPresetId === 'colony-clash'`, so re-pointing the default needs a deliberate test edit.

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5.5

### Debug Log References

- Throwaway harness (`apps/web/scripts/catLib.ts`, `ladder/menag/mirror/rps/gun/gen.test.ts`, run via `vitest.sweep.config.mts`) kept in the session scratchpad, never committed. Route: `createFakeRepositories` -> `seedDefaultWorkspace` -> organisms (`OrganismSchema.parse`, uuid ids, `ruleContentHash`) -> battles via `projectBattleForSave` -> `workspaceMeta.save` -> `exportWorkspace` -> Prettier; one fresh repository set per preset.
- Candidates, in FD1 order: Dominance Ladder (kept), Conway's Menagerie (kept), Rock-Paper-Scissors (DROPPED, see below), Mirror Match (kept as the third). The Worm and Stress Test were not attempted (three presets passed; FD3 rules Stress Test out).
- **RPS dropped (timebox, Task 1.2).** 16 variants tried (attacker own `neighborCount` gte 1/2, victim-side `occupantNeighborCount` gate 0/3/4/5 on the uphill link, dominance P 80 > R 60 > S 40, three vertical sectors, 50 % soup). In every run Rock (the one preyed on by the top-ranked Paper) was extinct or near-extinct by cycle 100-200 and the dish burned down to two colours; no spiral or wave fronts formed (Life-family soup is not an excitable medium, and the upward link only wins where the victim is not defending). Best variant kept 3 colours alive to cycle 300 only as a static remnant.
- Ladder tuning: quadrant layout (transfers 1813 over 400 cycles, Sovereign alive with 267-504 cells, lower ranks fade in rank order) beat the "domino" stripe layouts (all four colonies thinned to a similar size, rank order not readable). Mirror Match: mortal die-age 10 at 40 % density (age 6 extinguishes the mortal side too early, 25+ barely diverges within 10 s).
- Gosper gun + eater placement found by a plain-Life search (eater at (50,36) relative to the gun at (3,3), orientation 0): population is periodic (period 30) from cycle ~237 on through 600 in the real engine, i.e. the eater digests every glider.
- Negative proof (4.2, reverted): blanking `Mortal Mirror`'s description in `mirror-match.json` fails `presetCatalog.test.ts` with `mirror-match: organism "Mortal Mirror" description: expected '' to be truthy`.
- Visual check (7.1, dev server + Playwright, screenshots in the scratchpad): Load Preset via `/?preset=<id>` (dialog on the dev fixtures, then Load) for all three; gallery thumbnails read well (Menagerie shows gun, eater, pulsar, R-pentomino, and the Garden's colour-coded oscillators). Four Ranks in Run mode at cycle 100: Sovereign 504 (72 %), Knight 105, Moss 71, Squire 20, matching the headless numbers. The other five battles were verified headlessly (below) rather than watched.
- AC3 / Task 6: no scale preset shipped (FD3): every battle places at most 6 organisms and at most 12 rules in total, so nothing exceeds the 8-organism / 50-rule "built for scale" line.

### Completion Notes List

- **Names and ids for owner veto (FD4, stable forever once merged):** "Dominance Ladder" / `dominance-ladder`, "Conway's Menagerie" / `conways-menagerie`, "Mirror Match" / `mirror-match`. `defaultPresetId` stays `colony-clash` (FD6); the new entries follow it in the manifest.
- Per preset (route = FD2; colours all from the CVD-robust core, tokens 1-8; grids 100x60 and 50x30 only; the 100x60 battle is the newest so it sorts first):
  - **Dominance Ladder**: Conway's Classic (stock, unused in battles) + Lowly Moss / bluish-green / 20, Amber Squire / amber / 40, Ember Knight / vermillion / 60, Violet Sovereign / reddish-purple / 80; none age; rules in order: take over a rival cell (occupied + own `neighborCount` gte 2), born empty with 3, survive 2-3. Battles: Four Ranks 100x60 (four quarters, 45 % soup, seeds 1-4; 1296 territory transfers in 50 cycles, all four alive at 300) and Sandwich 50x30 (Knight | Moss | Sovereign thirds, 45 % soup, seeds 21-23; Moss extinct by ~cycle 50, 389 transfers in 50 cycles, Knight and Sovereign both alive at 300).
  - **Conway's Menagerie**: Conway's Classic (stock) + six recoloured clones with identical B3/S23 and distinct dominance: Pulsar / amber / 10, R-Pentomino / vermillion / 20, Pentadecathlon / reddish-purple / 30, Toad / bluish-green / 40, Beacon / azure / 60, Blinker / yellow / 70. Patterns decoded from RLE, never hand-typed. Battles: Glider Gun and Eater 100x60 (Conway's gun at (3,3) + eater at (50,36); pulsar at (78,8)), R-Pentomino 100x60 (alone at (48,28); moved out of the gun battle at review) and Oscillator Garden 50x30 (pulsar, pentadecathlon, toad, beacon, blinker, plus a Conway's beehive and block). The Garden is periodic with period 30 across 300 cycles; the gun/eater battle is periodic from ~237 to 600.
  - **Mirror Match**: Conway's Classic (stock, dominance 50) + Mortal Mirror / amber / 50 / aging on; rules in order: die at age >= 10, born empty with 3, survive 2-3. Equal dominance on purpose (FD1 option one): the description says so and the tie-break RNG decides contested empty cells. Battles: Mirror Match 100x60 (exact mirror soup, 40 %, seed 5; populations at cycles 0/50/100/200/300: 1208/1208, 342/232, 305/102, 255/78, 192/52) and Short Lives 50x30 (mirror soup 40 %, seed 7; the mortal side thins to 4 cells by cycle 100 but the dish never empties).
- Gate `presetCatalog.test.ts` (FD7 a-g) added; `presetShowcase.test.ts` and `presetWorkspaces.test.ts` untouched and green. Two e2e additions (link reachability for every non-default entry on fresh contexts; Load Preset options equal the manifest, default first). The stale "manifest ships one entry" comment reworded.
- `npm run ci:dev` green (328 chromium e2e passed, bundle growth within allowance, bench checks passed).
- Open observation, not a defect: Life-family soups burn off, so every mixed-soup battle is far sparser at 300 cycles than at cycle 0; the Ladder's Sovereign is the one that keeps a visible presence.

### File List

- apps/web/public/workspaces/dominance-ladder.json (new)
- apps/web/public/workspaces/conways-menagerie.json (new)
- apps/web/public/workspaces/mirror-match.json (new)
- apps/web/public/workspaces/index.json (three entries appended after colony-clash)
- apps/web/lib/workspaces/presetCatalog.test.ts (new)
- apps/web/e2e/presetLink.spec.ts (test (g), comment reworded)
- apps/web/e2e/loadPreset.spec.ts (options assertion)
- docs/implementation-artifacts/7-7-preset-catalog.md
- docs/implementation-artifacts/sprint-status.yaml

### Change Log

- 2026-09-29: Code review (opus): 9 patches applied. All three presets were regenerated through the same serializer route (so every uuid and `exportedAt` changed; nothing was merged yet). The R-pentomino moved into its own battle, so no Menagerie pattern meets another organism (FD1): the gun and eater settle into period 30 and the pulsar stays 48/56/72 through 1200 cycles. The R-pentomino settles by about cycle 900. The Four Ranks, Sandwich and Mirror Match descriptions were corrected to match the headless runs (numbers in Review Findings; populations through 1200 cycles unchanged by regeneration because placement seeds are fixed). Sovereign now reads "at least 2", and the Pulsar wording was fixed. Battles are stamped before `exportedAt`. e2e (g) now uses `exact: true`, checks the default's battles are absent and runs under `test.slow()`. The catalogue gate asserts at least one battle per preset.
- 2026-09-29: Story 7.7 implemented: three catalogue presets (Dominance Ladder, Conway's Menagerie, Mirror Match) exported through the serializer, manifest entries, `presetCatalog.test.ts` gate, two e2e additions. Rock-Paper-Scissors dropped at its timebox.

Dev Model: sonnet   # content authoring + one gate test + two e2e additions, all following 7.3's established route and presetShowcase.test.ts's idioms; not architecture-shaping (no new pattern later stories build on); feasibility traps pinned in FD1/FD3
Proposed lane gate: none

---

This story was implemented with the 'Implement next story' skill with the following stats:

| Phase | Agent model | Agents | Active | Wall clock | Input | Output | Cache write | Cache read | Total tokens |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Step 0 — re-entry guard | — | 0 | 32s | 32s | 20 | 8,459 | 14,873 | 567,777 | 591,129 |
| Step 1 — create | opus-5-5 | 1 | 6m 36s | 6m 36s | 122 | 1,774 | 244,272 | 6,074,823 | 6,320,991 |
| Step 2 — implement | sonnet-5-5 | 1 | 28m 14s | 28m 14s | 222 | 4,944 | 617,832 | 12,377,317 | 13,000,315 |
| Step 3 — review + PR | opus-5-5 | 4 | 20m 08s | 20m 08s | 394 | 16,017 | 641,189 | 14,980,124 | 15,637,724 |
| _of which the orchestrator_ | opus-5-5 | — | — | — | 50 | 21,082 | 33,281 | 1,582,116 | 1,636,529 |
| **Total (create → PR ready)** | | 6 | **55m 31s** | 55m 31s | 758 | 31,194 | 1,518,166 | 34,000,041 | **35,550,159** |

Run started 2026-09-29 15:28 CEST; wall clock runs to the point the run stopped for the owner's review. No idle gaps were excluded; Active and Wall clock agree. (A gap counts as idle above 15 min.) Each phase row covers the phase agent, any agents it spawned, and the orchestrator's own turns in that window — the orchestrator row breaks its share out again, it is not additional. Cache reads dominate the token totals and are billed at a fraction of input rate, so read the Input and Output columns for effort and the total only as a ceiling. The orchestrator's final turn is still being written when these numbers are taken.
