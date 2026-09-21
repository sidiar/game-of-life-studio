---
baseline_commit: 3ae861f61383f0ec29c5de5d0abd2f99da6e2014
---

# Story 4.15: Preview Simulation

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a user,
I want to run my organism in isolation while I edit,
so that I can iterate on rules with instant feedback.

## Acceptance Criteria

From `epics.md#Story 4.15: Preview Simulation` (`:1165-1175`), decomposed into what a reviewer can
check independently. AC5–AC11 are repo-derived: the obligations `useSimulation` (Story 3.10),
the transport / speed / cycle components (3.12–3.14, lifted by 3.18), the extinction semantics
(3.15), the drawing panel this story grows into (4.14) and the CI gates impose. **Read the Dev
Notes' forced decisions FD1–FD9 before touching a file** — this story's whole difficulty is
*when the run is bound to which organism*, and FD2 settles it.

1. **Play runs the drawn pattern through a second, isolated `useSimulation` instance — the same
   hook, the same engine, unchanged.** `<PreviewPanel>` calls `useSimulation(grid, roster, {
   genPerSec: PREVIEW_STARTING_SPEED })` exactly once per render, where `grid` is the panel's own
   drawn grid (4.14 AC5 — the run's `initialGrid`, cloned by the hook, never written, AR-31) and
   `roster` is a one-element array holding the organism under edit (ref `1` = `roster[0]`, M14 —
   the same `index + 1` arithmetic `PREVIEW_ROSTER` already encodes for drawing). Nothing in
   `packages/simulation` or `lib/battle/useSimulation.ts` changes in *behaviour* (the one edit
   there is a type, AC5). No second loop, no second scheduler, no `stepGridBuffers` composed by
   hand (`deferred-work.md:693-699`). The battle's state is never read or written: no
   repository, no `<BattlePage>` import, no shared ref; `gol:organisms` / `gol:battles` are
   byte-identical across an open → draw → run → close cycle (e2e). (FR-2.7, AR-32, M3, RFC-005
   Decision 5)

2. **The run uses the live, unsaved rules — and a rule edit applies on the NEXT run, never to a
   run in progress (FD2).** The roster is panel state that *follows the draft while the run is
   at rest* (`status === 'paused' && cycle === 0`) and is *frozen* otherwise. Concretely: draw a
   blinker, give the organism Conway's rules, Play → it oscillates; delete every rule while it
   plays → it keeps oscillating (the run holds the organism it started with); Stop → Play → it
   dies at cycle 1 (implicit death, M10 — zero rules survive nothing). A fresh draft has zero
   rules, so the very first Play of a drawn cell auto-pauses at cycle `0001` with an empty dish
   — truthful, and the fastest possible demonstration that rules matter. No `debounce`, no
   "real-time" restart on keystroke (the design doc's `:515`/`:789` lines are superseded by the
   epic AC — Open flags). (UX-DR13, AC text "rule edits apply on the next run")

3. **The transport, speed and cycle controls are the Run mode's own components, reused.** Below
   the drawing tools (4.14), a new block renders, in DOM order: `<TransportControls compact
   status={sim.status} onPlayPause={handlePlayPause} onStep={sim.step} onStop={sim.stop}
   disabled={startBlocked}>` (the `role="group"` named **"Simulation controls"**, buttons
   **Play**⇄**Pause**, **Next cycle**, **Stop & reset** — 3.12 FD1/FD5/FD6 unchanged: one
   Play/Pause element whose name states the next action, Step `disabled` while playing with its
   `title`, Stop always enabled); then `<SpeedControl genPerSec={sim.genPerSec}
   onChange={sim.setSpeed} />` (the detented slider named **"Generations per second"** over
   `SPEED_LADDER` 1 | 2 | 5 | 10 | 20, `aria-valuetext` "10 generations per second", live during
   playback — a ref write, no restart, AR-34); then a **Cycle** readout rendering
   `<CycleDigits cycle={sim.cycle} />` (zero-padded `0000`, padding `aria-hidden`, 3.14 FD6).
   The speed persists across runs and across at-rest rebinds (it is hook state, not part of the
   session key). Nothing is re-authored: no second Play/Pause flip, no second slider, no second
   padding rule. (FR-4.2, FR-4.3, FR-4.4, FR-4.5, AR-34, UX-DR13)

4. **Extinction auto-pauses, exactly as in a battle.** When the loop drives a cycle that leaves
   the dish empty, the hook's own extinction branch stops the loop and publishes `status:
   'paused'` at the exact extinction cycle (3.15 FD1) — the Play/Pause button reads **Play**
   again, the counter freezes, the drawing tools stay disabled (the run is not at rest — Stop
   returns to the sketch, FD3). Still-lifes, oscillators and gliders keep running (Decision B.5:
   extinction-only — a test asserting a blinker auto-pauses encodes a spec violation). No new
   `status` value, no indicator, no live region (3.15 FD4 — the union stays `'paused' |
   'playing'`; this story was the last candidate consumer and declines). (FR-2.7, FR-4.7,
   Decision B.5)

5. **The organism the run compiles is derived from the draft by one pure adapter, and the hook
   accepts exactly what it reads.** New `apps/web/lib/organisms/previewOrganism.ts` exports
   `previewOrganismFrom({ colorToken, survivalRules }): SimulationOrganism | null` — `null` iff
   any rule is unrunnable (zero conditions, or a condition `parseConditionDraft` rejects); each
   rule goes through a new `parseRuleDraft(rule)` in `ruleDraft.ts` (the `SurvivalRule` minus
   `contentHash`, conditions via `conditionFromDraft` — the mirror of `ruleDraftFrom`, and the
   half Story 4.16's save path reuses before hashing) and receives the **session-only
   `contentHash` stand-in `rule.id`** (FD5). `useSimulation`'s `organisms` parameter is narrowed
   from `readonly Organism[]` to a new exported `SimulationOrganism = Pick<Organism, 'id' |
   'name' | 'colorToken' | 'dominance' | 'survivalRules'>` — the five fields the hook,
   `compileSession` and `derivePopulation` read, and not one more (FD6: no fake
   `schemaVersion`, no fake `agingEnabled`). `Organism[]` still assigns; `<BattleSimulationView>`
   and `useSimulation.test.ts` are unedited. Property-pinned: for every draft whose rules pass
   `validateOrganismDraft` (name errors aside), `compileSession([previewOrganismFrom(draft)])`
   does not throw — the Save gate and the preview cannot disagree about what a bad rule is
   (`parseConditionDraft` is the one definition, `conditionDraft.ts:22-25`). (M12, M13, AR-21,
   Decision E)

6. **An unrunnable draft blocks the START of a run — never a run in progress — and says why.**
   `startBlocked = atRest && liveOrganism === null`. While blocked, Play/Pause and Next cycle
   carry a real `disabled` (3.12 FD6 — never CSS-only) and a hint line reading **"Fix the rule
   errors to run the preview."** renders directly under the transport group; Stop stays enabled
   (3.12 FD5). A rule edited to invalid *mid-run* changes nothing — the frozen roster is valid
   and Pause/Step/Stop keep working; Stop brings the block into effect. "+ Add Rule" on a fresh
   draft blocks immediately (a zero-condition rule cannot fire, `ruleDraft.ts:42-47`); adding its
   first condition (the `cellState = empty` default, valid by construction) unblocks. The name
   field's error never blocks — the name is not a run input. (NFR-4.1, UX-DR14 vocabulary)

7. **The dish swaps between the drawing surface and the run surface on `atRest`, inside the same
   box.** At rest, `PreviewDishBox` holds `<PetriDishCanvas variant="edit">` exactly as 4.14
   shipped it (the drawn grid, `onStrokeCommit={setGrid}`); otherwise it holds `<PetriDishCanvas
   variant="playback" size={PREVIEW_GRID_SIZE} palette={palette} showGridLines colors
   onRendererReady={sim.attachRenderer}>` — the `<BattleSimulationView>` wiring
   (`BattleSimulationView.tsx:414-421`), `attachRenderer` passed straight through (it is
   `useCallback`-stable; a wrapper defeats `PlaybackDish`'s ref discipline). Both are
   `styled(PetriDishCanvas)`: the edit one keeps 4.14's `crosshair`, the run one is the Run
   view's `DishCanvas` rule set (no cursor, no `touch-action`). Draw/Erase carry `disabled={!
   atRest}`, Clear `disabled={!atRest || empty}` — the sketch cannot change under a live grid,
   and the hook's `initialGrid` stays the reference the session was keyed on (3.10 obligation
   1). A colour pick or aging flip mid-run still repaints on the same commit (4.14 AC4 holds:
   the palette identity rebuilds the playback renderer, which re-attaches and `paintFull`s the
   live front — the 3.16 rebuild path). `paintFull` after Stop repaints the initial clone before
   the swap; the incoming edit canvas then `drawFull`s the same grid. (RFC-005 Decision 3/4, AR-31)

8. **Hot state stays in refs; React sees only the published view.** The panel adds no `useState`
   for anything the engine owns: the buffers, loop, cycle counter and renderer are the hook's
   refs (AR-29). The panel re-renders at the hook's publish cadence (≤ 10 Hz, M2) and on user
   action — the Story 3.11 AC9 discipline: `handlePlayPause` is `useCallback([status, play,
   pause])`, `sim.step` / `sim.stop` / `sim.setSpeed` / `sim.attachRenderer` are passed straight
   through, never wrapped per render. `data-status={sim.status}` and `data-cycle={sim.cycle}`
   ride on `PreviewDishBox` in every state (the test handle, 3.11 FD7). (NFR-1.1, AR-29, M2)

9. **`<TransportControls>` grows two optional props and nothing else changes for its two
   existing callers.** `compact?: boolean` (renders `data-compact` on the group; the cluster
   wraps — `flex-wrap: wrap`, each button `flex: 1 1 auto`, centred — so the three full labels fit
   a 290px column without overflow; FD8) and `disabled?: boolean` (Play/Pause and Next cycle get
   `disabled`; Stop does not). Declared on a new `TransportControlsProps = SimulationControlBarProps
   & { … }` so `SimulationControlBarProps` stays spec §3.13's four members and `<SimulationControlBar>`
   (which spreads its props) and `<FullscreenStage>` are byte-identical in behaviour —
   `SimulationControlBar.test.tsx` and `FullscreenStage.test.tsx` pass **unedited** (the refactor's
   proof, the 3.16 `<LadderSlider>` precedent for "an addition that never fires for the existing
   caller"). The accessible names do not change — not the mockup's `Play / Step / Stop` (3.18 FD11:
   the names are the test vocabulary). At the compressed tier (1280) and the full tier (1440) the
   Preview & Test region has no horizontal overflow (`scrollWidth <= clientWidth`, e2e). (AR-44)

10. **Every existing guard is retargeted only where this story legitimately changes the DOM.**
    (a) `OrganismEditorModal.test.tsx:131-136` — "mounts … in Basic Information and nowhere else"
    asserts `getAllByRole('slider')` is `1` over the whole dialog, and its comment says "nowhere
    else means the whole dialog" on purpose. The speed slider is a legitimate second: the count
    becomes `2` with a comment naming it (the Preview & Test column's "Generations per second",
    Story 4.15), and a new line pins `within(basic).getAllByRole('slider')` at `1` so the
    Basic-Information claim is still exact. Nothing else in that file changes. (b) `PreviewPanel.test.tsx`:
    every 4.14 case passes with the new props supplied by `mount()`'s defaults (`survivalRules:
    []`) — the `Drawing tools` group still holds exactly three buttons; the Draw/Erase/Clear cases
    are at rest throughout. (c) `organisms.spec.ts` 4.14 block: `tool(dialog, name)` uses exact
    names, so `Play` / `Next cycle` / `Stop & reset` never collide; the keyboard walk ends at
    Clear and asserts nothing after it. (d) `PetriDishCanvas.tsx` (+ test), `previewGrid.ts` (+
    test), `conditionDraft.ts`, `organismDraft.ts`, `OrganismEditorLayout.tsx`, `SpeedControl.tsx`,
    `LadderSlider.tsx`, `CycleDigits.tsx`, `CycleCounter.tsx`, `PopulationPills.tsx`,
    `SimulationControlBar.tsx`, `FullscreenStage.tsx`, `BattleSimulationView.tsx`, everything else
    under `components/battle/**`, `packages/**`: **unedited**. If any other test fails, the change
    is wrong, not the test. (AR-44)

11. **axe passes in every settled state; the bundle gate passes; no route's first load moves.**
    vitest-axe: the panel at rest → `[]`; blocked (hint visible) → `[]`; mid-run (playback canvas
    mounted, tools disabled) → `[]`; the modal with the panel (the existing axe cases) → `[]`.
    `@axe-core/playwright` on `/organisms` with the editor open at rest, then paused after an
    extinction (settled, `waitForTimeout(300)`) → `[]`. **No new token, no literal colour, no
    `transition`** (`themes.css`, `themeTokens.test.ts` untouched). Everything new rides
    `OrganismEditorModal.tsx`'s lazy chunk — `useSimulation`, the `@gol/simulation` session/loop/
    strategy modules, `<TransportControls>`, `<SpeedControl>`/`<LadderSlider>`, `<CycleDigits>`,
    `previewOrganism.ts`. Expect the editor chunk to grow by roughly 8–15 KB gzip (record the
    figure); `/` (340), `/battle` (310), `/battle/new` (310), `/organisms` (305) stay within ±0.5 KB
    of `main` **unless** Turbopack re-splits the engine modules the `/battle` route already ships
    (`check-bundle-size.mjs`'s Story 2.14 note) — a move above that on any route is measured,
    explained in the Dev Agent Record, and **no budget is raised** without the owner. `bench` is
    unaffected (`packages/*` untouched). `npm run ci:dev > ci.log 2>&1; echo $?` locally; CI on the
    PR checked with `gh run list --limit 1` **after the PR opens**. (NFR-8.3, AR-35, AR-46)

## Tasks / Subtasks

- [x] **Task 1 — `parseRuleDraft` in `ruleDraft.ts`; the preview organism adapter** (AC: 5, 6)
  - [x] `apps/web/lib/organisms/ruleDraft.ts` — append after `updateRuleConditions`, before
        `ruleDraftFrom` (its mirror):
        ```ts
        /** A rule ready for the engine, minus the hash the save path mints (Story 4.16): `id` kept
         * (RFC-004 §2.4), every condition through `conditionFromDraft`. Story 4.15's preview stamps
         * a session-only `contentHash` on top; 4.16 stamps the real one. */
        export type ParsedRuleDraft = Omit<SurvivalRule, 'contentHash'>;

        /**
         * The persisted-shape view of a rule draft — the inverse of `ruleDraftFrom`, and the ONE
         * place a `RuleDraft` becomes engine input. `null` when the rule cannot run: no conditions
         * (`ruleNeedsCondition` — `[].every` is true, so the engine would fire it for every cell,
         * `validateRules.ts`), or a condition `parseConditionDraft` rejects. Reads the SAME parse
         * `validateConditionDraft` reads (`conditionDraft.ts:22-25`), so the Save gate (Story 4.13)
         * and a runnable preview (Story 4.15) cannot disagree about what "invalid" means.
         */
        export function parseRuleDraft(rule: RuleDraft): ParsedRuleDraft | null {
          if (ruleNeedsCondition(rule)) return null;
          const conditions: Condition[] = [];
          for (const draft of rule.conditions) {
            const condition = conditionFromDraft(draft);
            if (condition === null) return null;
            conditions.push(condition);
          }
          return { id: rule.id, conditions, payload: rule.payload };
        }
        ```
        Imports: `type Condition` from `@gol/domain`; `conditionFromDraft` joins the existing
        `conditionDraft` import. `payload` is passed by reference (frozen-shape, never mutated
        downstream — `internRule` copies, `compileEvaluators.ts:134-143`).
  - [x] `ruleDraft.test.ts` — append: (a) a rule with zero conditions → `null`; (b) a rule whose
        one condition is `neighborCount eq 'abc'` → `null`; (c) `CONWAYS_CLASSIC.survivalRules`
        round-trips: `parseRuleDraft(ruleDraftFrom(rule, nextId))` equals `{ id, conditions,
        payload }` of the source (`toEqual` on the three fields; `contentHash` absent — assert
        `'contentHash' in parsed === false`); (d) the parsed object's `conditions` is a NEW array
        (not the draft's) and carries no `id` on any condition (the `conditionDraft.ts:266`
        contract); (e) a `range` draft `['2','3']` parses to `pattern: [2, 3]` (numbers, not text).
  - [x] `apps/web/lib/organisms/previewOrganism.ts` (new; no React, no DOM):
        ```ts
        import { NEW_ORGANISM_DOMINANCE, type SurvivalRule } from '@gol/domain';
        import type { SimulationOrganism } from '@/lib/battle/useSimulation';
        import type { OrganismDraft } from './organismDraft';
        import { PREVIEW_ORGANISM_ID } from './previewGrid';
        import { parseRuleDraft } from './ruleDraft';

        /**
         * The organism the preview RUNS (Story 4.15, FR-2.7 / M3): the draft's live rules under the
         * session id the drawing surface already paints with (`PREVIEW_ORGANISM_ID`, so ref 1 on the
         * drawn grid IS this organism — M14). Session-only: never persisted, never compared with a
         * library id, never handed to a repository. Story 4.16's save adapter is a SIBLING of this
         * function (real id, real `schemaVersion`, real hashes) that shares `parseRuleDraft`.
         *
         * `name` and `dominance` are constants, deliberately: nothing renders the name (the preview
         * shows no population reading — FD9), and dominance decides Phase-3 conflicts BETWEEN
         * organisms (`conflictPhase.ts`), which a one-organism roster never has. Reading them off the
         * draft would rebind the run on every name keystroke and every dominance drag for a value
         * that cannot change a single cell. `colorToken` IS read: it is `derivePopulation`'s type
         * and it is what a future population reading would show.
         */
        export const PREVIEW_ORGANISM_NAME = 'Organism under edit';

        export function previewOrganismFrom(
          draft: Pick<OrganismDraft, 'colorToken' | 'survivalRules'>,
        ): SimulationOrganism | null {
          const survivalRules: SurvivalRule[] = [];
          for (const rule of draft.survivalRules) {
            const parsed = parseRuleDraft(rule);
            if (parsed === null) return null;
            // FD5 — the session-only `contentHash` stand-in. `validateSurvivalRules` rejects an
            // empty hash because the per-session evaluator cache is keyed on the ordered join of a
            // LIST's hashes (`compileEvaluators.ts:125-127`) — a collision there hands one
            // organism another's evaluators. This session has ONE organism, so no two lists are
            // ever compared and any non-empty string is correct; the rule's own id is unique per
            // rule and stable across edits. ❌ Not a content address (AR-21) — never persisted,
            // never exported; Story 4.16's hasher mints the real one at save time.
            survivalRules.push({ ...parsed, contentHash: rule.id });
          }
          return {
            id: PREVIEW_ORGANISM_ID,
            name: PREVIEW_ORGANISM_NAME,
            colorToken: draft.colorToken,
            dominance: NEW_ORGANISM_DOMINANCE,
            survivalRules,
          };
        }
        ```
  - [x] `previewOrganism.test.ts`: (a) a fresh draft (`createNewOrganismDraft([])`) → an organism
        with `id === PREVIEW_ORGANISM_ID`, `survivalRules` `[]`, `colorToken` the draft's; (b)
        Conway's rules as drafts (`ruleDraftFrom`) → two rules, `contentHash === rule.id` each,
        conditions equal to `CONWAYS_CLASSIC.survivalRules[i].conditions`; (c) a zero-condition rule
        anywhere → `null`; a `neighborCount eq ''` → `null`; (d) **the compile guarantee**:
        `compileSession([organism])` does not throw for (a) and (b), and `refById.get(
        PREVIEW_ORGANISM_ID) === 1`; (e) **the two views agree** (fast-check): generate drafts
        from an arbitrary over the four condition kinds with text patterns drawn from
        `['', 'abc', '-1', '0', '3', '8', '9', '999', '1000']` and range pairs from the same pool,
        plus `organismType` patterns from `['', 'conways-classic']`, 0–3 rules × 0–3 conditions;
        assert `previewOrganismFrom(draft) === null` ⇔ `validateOrganismDraft({ ...draft, name:
        'x' }).length > 0`, and whenever non-null, `compileSession([organism])` does not throw
        (`numRuns: 200`); (f) `organismType eq 'conways-classic'` compiles (the target is absent
        from the roster → `NO_MATCH_REF`, Decision E.3 — not an error; pin by reading
        `refById.size === 1`); (g) the returned object satisfies `SimulationOrganism` and has
        exactly the five keys (`Object.keys(...).sort()` — a fake `schemaVersion` creeping in
        fails here, FD6).

- [x] **Task 2 — `useSimulation`: accept what it reads** (AC: 5)
  - [x] `apps/web/lib/battle/useSimulation.ts`: add, beside `PlaybackRenderer`:
        ```ts
        /**
         * What the hook reads off an organism, and nothing more (the `CompilableOrganism` /
         * `PlaybackRenderer` `Pick` discipline): `id` + `survivalRules` for `compileSession`,
         * `dominance` for the strategy's `OrganismRuntime`, `name` + `colorToken` for
         * `derivePopulation`. `@gol/domain`'s `Organism` assigns in unchanged; Story 4.15's draft
         * organism — which has no `schemaVersion` and whose `agingEnabled` is the renderer's
         * business, not the engine's — is the second caller and the reason this is not `Organism`.
         */
        export type SimulationOrganism = Pick<
          Organism,
          'id' | 'name' | 'colorToken' | 'dominance' | 'survivalRules'
        >;
        ```
        and replace the three `readonly Organism[]` (`SessionKey.organisms`, the `useSimulation`
        signature's `organisms` parameter, and nothing else — `RunView` reads through `SessionKey`)
        with `readonly SimulationOrganism[]`. Consumer obligation 2 in the head comment gains one
        clause: "(or any `SimulationOrganism` — Story 4.15's preview passes a draft-derived one)".
        `import type { Organism }` stays (the `Pick` source). `tsc` is the proof: `BattleSimulationView`,
        `BattlePage`, `useSimulation.test.ts`, `FullscreenStage` compile unedited.
  - [x] `useSimulation.test.ts`: one appended case — the hook accepts a roster typed as
        `SimulationOrganism[]` built without `schemaVersion`/`agingEnabled` and runs one step
        (`createFakeScheduler`, `:34`); everything else untouched.

- [x] **Task 3 — `<TransportControls>`: `compact` and `disabled`** (AC: 6, 9)
  - [x] `apps/web/components/battle/simulation/TransportControls.tsx`:
        - `Transport` gains `'&[data-compact="true"]': { flexWrap: 'wrap' }` with the comment: the
          preview column is 290–340px (`OrganismEditorLayout`'s `PreviewColumn`) and the three full
          labels sum past it (measured ≈ 380px at 11px/600 with the 18px padding); wrapping keeps
          ONE implementation and ONE set of accessible names (FD8) — the mockup's `Play / Step /
          Stop` shorthand is not adopted, for 3.18 FD11's reason. Never `overflow: hidden`, never
          a font-size step (the names would still be the same; the *clothes* are what differ).
        - `barButtonBase` gains `'[data-compact="true"] > &': { flex: '1 1 auto', justifyContent:
          'center' }` — on the base object, so all three buttons share it and no button is
          special-cased.
        - Props:
          ```ts
          export interface TransportControlsProps extends SimulationControlBarProps {
            /** Story 4.15: the cluster wraps to fit a narrow column (`data-compact` on the group).
             *  `<SimulationControlBar>` and the HUD never pass it. */
            compact?: boolean;
            /** Story 4.15: a run may not START — Play/Pause and Next cycle are `disabled` (real, 3.12
             *  FD6), Stop is not (3.12 FD5). Never true while playing: the caller's own contract. */
            disabled?: boolean;
          }
          ```
          `SimulationControlBarProps` is **unchanged** (spec §3.13's four members; the bar spreads
          its props, `SimulationControlBar.tsx:68`). Signature: `TransportControls({ status,
          onPlayPause, onStep, onStop, compact = false, disabled = false }: TransportControlsProps)`.
        - Markup: `<Transport role="group" aria-label="Simulation controls" data-compact={compact}>`;
          Play/Pause `disabled={disabled}`; Step `disabled={playing || disabled}` (its `title` logic
          unchanged: only the playing case names a reason — the preview's hint line names the other).
        - Head comment: one sentence per prop; the "shared with Story 4.15's preview panel" sentence
          already there gets "(its first `compact`/`disabled` caller)".
  - [x] `SimulationControlBar.test.tsx` — **unedited** (AC9's proof). Add
        `TransportControls.test.tsx` (new, small): (a) default render has no `data-compact="true"`
        and Play enabled; (b) `compact` → `data-compact="true"` on the group, names unchanged; (c)
        `disabled` while paused → Play and Next cycle `toBeDisabled()`, Stop enabled, a click on Play
        fires nothing (`onPlayPause` not called — the button is genuinely disabled, the 3.12 test
        idiom: never `user.click` a disabled element to "prove" it, assert `toBeDisabled()` then
        assert the spy); (d) axe on (c) → `[]`.

- [x] **Task 4 — `<PreviewPanel>`: the session, the roster snapshot, the swap, the controls**
      (AC: 1, 2, 3, 4, 6, 7, 8)
  - [x] `apps/web/components/organisms/editor/PreviewPanel.tsx`. New imports: `useCallback` (already),
        `DEFAULT_SETTINGS` from `@gol/domain`; `useSimulation, type SimulationOrganism` from
        `@/lib/battle/useSimulation`; `TransportControls` from
        `../../battle/simulation/TransportControls`; `SpeedControl` from
        `../../battle/simulation/SpeedControl`; `CycleDigits` from
        `../../battle/simulation/CycleDigits`; `previewOrganismFrom` from
        `@/lib/organisms/previewOrganism`; `type RuleDraft` from `@/lib/organisms/ruleDraft`.
        (Relative imports into `components/battle/simulation/` are sanctioned for this panel by
        `simulation/README.md` — "Story 4.15's preview panel is the next consumer" — and no lint
        boundary spans `components/organisms/` ↔ `components/battle/`; the `editor/`↔`simulation/`
        wall is `components/battle/`'s own.)
  - [x] Module constants (beside `PREVIEW_GRID_LINES`, same reasoning):
        ```ts
        // FR-8.12's starting speed is a persisted setting the modal cannot read (no settings
        // repository at the editor's boundary — 4.14 FD5's reasoning), so the preview starts at the
        // schema's own default (Decision D.1's 10 gen/s) and the slider is the user's control from
        // there. Story 6.9 decides whether the setting reaches the preview.
        const PREVIEW_STARTING_SPEED = DEFAULT_SETTINGS.defaultSpeed;
        // AC6's hint, verbatim — the Save gate's vocabulary (UX-DR14): a zero-condition rule IS a
        // "rule error" there (`RULE_NEEDS_CONDITION`), and so it is here.
        const PREVIEW_BLOCKED_HINT = 'Fix the rule errors to run the preview.';
        ```
  - [x] Props — one new member:
        ```ts
        /** Story 4.15: the draft's live rules, read on every render. The run compiles them
         *  (`previewOrganismFrom`) — at rest on every change, mid-run never (FD2). */
        survivalRules: readonly RuleDraft[];
        ```
  - [x] Body — the 4.14 state stays exactly as it is (`mode`, `grid`, `palette`, `tool`, `toolRef`,
        `empty`, `handleClear`); add, after `palette`:
        ```tsx
        // The organism the NEXT run would compile — `null` while a rule cannot run (AC6). Memoised on
        // the two draft fields it reads: a name keystroke or a dominance drag must not touch it (see
        // `previewOrganism.ts`).
        const liveOrganism = useMemo(
          () => previewOrganismFrom({ colorToken, survivalRules }),
          [colorToken, survivalRules],
        );
        // FD2 — the run's roster is PANEL STATE, so its identity — the hook's session key (3.10
        // obligation 1) — moves only when this component says so. Seeded from the live organism
        // (a fresh or record-seeded draft is always runnable); `[]` is the type-total fallback for
        // an unrunnable seed, which Play (`startBlocked`) never lets run.
        const [roster, setRoster] = useState<readonly SimulationOrganism[]>(() =>
          liveOrganism === null ? [] : [liveOrganism],
        );
        // The one hook call (M3: "a second isolated `useSimulation` instance"). `grid` is the drawn
        // sketch — the run's `initialGrid`, cloned by the hook (AR-31); the options literal is not
        // part of the key (3.11's reasoning), so no memo.
        const sim = useSimulation(grid, roster, { genPerSec: PREVIEW_STARTING_SPEED });
        // "At rest" = nothing has happened yet: paused at cycle 0 — after mount, after Stop, or after
        // a Pause that beat the first cycle. Everything below keys on it: which canvas is mounted,
        // whether the tools are live, whether the roster may follow the draft.
        const atRest = sim.status === 'paused' && sim.cycle === 0;
        // Render-phase adjustment — React's documented "adjusting state when a prop changes", the
        // same form `useSimulation` and `useUndoableGrid` use (never a `setState` in an effect,
        // `react-hooks/set-state-in-effect`): at rest the roster follows the draft, so the next
        // Play compiles the rules as they are NOW; mid-run it is frozen, so a rule edit changes
        // nothing until Stop (AC2 — "rule edits apply on the next run"). An unrunnable draft
        // (`null`) leaves the last runnable roster in place; `startBlocked` keeps it from running.
        if (atRest && liveOrganism !== null && roster[0] !== liveOrganism) {
          setRoster([liveOrganism]);
        }
        const startBlocked = atRest && liveOrganism === null;

        // 3.12 FD3: the PANEL decides what Play/Pause means; the cluster gets one handler. Deps are
        // the three members, never `sim` — a new object per publish (3.11's trap).
        const { status, play, pause } = sim;
        const handlePlayPause = useCallback(() => {
          if (status === 'playing') pause();
          else play();
        }, [status, play, pause]);
        ```
        `handleClear` is unchanged (the guard inside the updater); Clear's `disabled` becomes
        `!atRest || empty`, Draw/Erase's `disabled={!atRest}`.
  - [x] Styled blocks (`styled()` + `var(--gol-*)`; **no `transition`**, no new token):
        - `PreviewRunCanvas = styled(PetriDishCanvas)({ width: '100%', height: '100%', display:
          'block' })` — `BattleSimulationView.tsx`'s `DishCanvas` (`:243-248`), copied with a pointer:
          no `crosshair`, no `touch-action` (nothing to paint, nothing to capture). `PreviewCanvas`
          (4.14) is unchanged and stays the edit surface.
        - `SimulationSection = styled('div')({ marginTop: '20px', display: 'flex', flexDirection:
          'column', gap: '16px' })` — mockup `.sim-controls`' `margin-top: 20px` (`organism-editor.html:770-776`);
          the grid-of-three is replaced by the reused cluster's own layout (FD8).
        - `RunHint = styled('p')({ margin: '-6px 0 0', fontSize: '11px', color:
          'var(--gol-text-secondary)' })` — the 3.16 "Adjustable while paused" hint's clothes.
        - `CycleBlock = styled('div')({ textAlign: 'center' })`, `CycleLabel = styled('div')({
          fontSize: '12px', fontWeight: 500, color: 'var(--gol-text-secondary)', marginBottom: '5px'
          })`, `CycleValue = styled('div')({ fontSize: '36px', fontWeight: 600, color:
          'var(--gol-accent)', fontVariantNumeric: 'tabular-nums', letterSpacing: '2px' })` — mockup
          `.cycle-counter` / `.cycle-label` / `.cycle-value` (`:798-815`) with the house's
          `tabular-nums` (3.14: an odometer, not a quantity) and the HUD's `2px` tracking in place of
          the mockup's `-1px` (a zero-padded run reads better spaced than squeezed; a style call,
          recorded).
  - [x] Markup:
        ```tsx
        <>
          <PreviewDishBox data-preview-dish data-status={sim.status} data-cycle={sim.cycle}>
            {colors !== null &&
              (atRest ? (
                <PreviewCanvas
                  variant="edit"
                  grid={grid}
                  size={PREVIEW_GRID_SIZE}
                  palette={palette}
                  showGridLines={PREVIEW_GRID_LINES}
                  colors={colors}
                  tool={tool}
                  toolRef={toolRef}
                  onStrokeCommit={setGrid}
                />
              ) : (
                <PreviewRunCanvas
                  variant="playback"
                  size={PREVIEW_GRID_SIZE}
                  palette={palette}
                  showGridLines={PREVIEW_GRID_LINES}
                  colors={colors}
                  onRendererReady={sim.attachRenderer}
                />
              ))}
          </PreviewDishBox>
          <DrawingControls role="group" aria-label="Drawing tools">
            <ToolButton type="button" aria-pressed={mode === 'draw'} disabled={!atRest} onClick={() => setMode('draw')}>Draw</ToolButton>
            <ToolButton type="button" aria-pressed={mode === 'erase'} disabled={!atRest} onClick={() => setMode('erase')}>Erase</ToolButton>
            <ToolButton type="button" onClick={handleClear} disabled={!atRest || empty}>Clear</ToolButton>
          </DrawingControls>
          <SimulationSection>
            <TransportControls
              compact
              status={sim.status}
              onPlayPause={handlePlayPause}
              onStep={sim.step}
              onStop={sim.stop}
              disabled={startBlocked}
            />
            {startBlocked && <RunHint>{PREVIEW_BLOCKED_HINT}</RunHint>}
            <SpeedControl genPerSec={sim.genPerSec} onChange={sim.setSpeed} />
            <CycleBlock data-preview-cycle>
              <CycleLabel>Cycle</CycleLabel>
              <CycleValue>
                <CycleDigits cycle={sim.cycle} />
              </CycleValue>
            </CycleBlock>
          </SimulationSection>
        </>
        ```
        Comments (WHY, at the site): why the swap keys on `atRest` and not on `status` (a paused run
        at cycle 42 must keep the live grid and the run surface — FD3); why the tools disable on
        `!atRest` (the sketch is the session's `initialGrid` reference); why `sim.step` / `sim.stop`
        / `sim.setSpeed` / `sim.attachRenderer` go straight through (stable, 3.10); why the hint is a
        plain `<p>` and not a live region (it appears on keystrokes — a `status` region would
        announce on every one; 3.14 FD8's reasoning at a lower cadence); the tag line gains
        `(Story 4.15) (AR-32) (FR-4.7)`. Rewrite the head comment's ASCII to the shipped shape (the
        "4.15 adds" arrows become the description).
  - [x] `PreviewPanel.test.tsx`: extend `mount()` with `survivalRules: []` in the defaults and a
        `installFrameDriver()` copied from `BattleSimulationView.test.tsx:68-107` with a pointer
        comment (second copy — record in `deferred-work.md`; the `distinctColorCount` rule: lift on
        the third). Helpers: `conwayRules()` → `CONWAYS_CLASSIC.survivalRules.map((r) =>
        ruleDraftFrom(r, () => crypto.randomUUID()))`; `blinker()` → draw cells (14,10), (15,10),
        (16,10) by pointer events through `centreOfCell` (the 4.14 rig); `transport()` →
        `screen.getByRole('group', { name: 'Simulation controls' })`; `box()` →
        `container.querySelector('[data-preview-dish]')`. New cases, appended after the 4.14 block:
        13. **at rest: the transport, the slider and the cycle readout render; Play enabled, Next
            cycle enabled, Stop enabled; slider at 10 gen/s** (`aria-valuetext` "10 generations per
            second"); `box()` has `data-status="paused"` and `data-cycle="0"`; the group carries
            `data-compact="true"`; the `Drawing tools` group still has exactly three buttons.
        14. **a fresh draft (zero rules) + one drawn cell: Play → the first frame steps to cycle 1,
            the dish is empty, the run auto-pauses** (AC4): `installFrameDriver()`; draw (5,5);
            `user.click(Play)` → `data-status="playing"`, Play now reads **Pause**; `frame(0)`
            (primes the clock, no delta — 3.8 FD4), `frame(100)` (one cycle at 10 gen/s,
            `msPerCycle` = 100) → `data-status="paused"`, `data-cycle="1"`, the button reads **Play**;
            `pending() === 0` (the loop requested no further frame — 3.8 AC7). Draw, Erase and
            Clear are **disabled** (not at rest — FD3). The playback canvas is mounted (a SECOND
            `getContext` call on a NEW canvas element — the recording map has two entries).
        15. **Stop returns to the sketch: cycle 0, tools enabled, the edit canvas back with the
            drawn cell** (AC7): after (14), `user.click(Stop & reset)` → `data-cycle="0"`,
            `data-status="paused"`; Clear `toBeEnabled()` (the drawn cell survived — the sketch is
            the initial grid, never the live one); the recording map now has THREE entries (a
            fresh edit canvas) and its latest context received a `fillStyle` equal to
            `displayColorAt(paletteIndexOf('vermillion'), MAX_AGE_SHADE)` (the cell repainted).
        16. **Conway's rules + a blinker: it survives three driven cycles (no auto-pause — Decision
            B.5) and the counter follows** : mount with `survivalRules: conwayRules()`; `blinker()`;
            Play; `frame(0)`, `frame(100)`, `frame(200)`, `frame(300)` → `data-cycle` is `"3"`
            (cadence: `cyclesPerPublish(10) === 1`, every cycle publishes), `data-status` still
            `"playing"`; `pending() === 1`.
        17. **rule edits mid-run change nothing; Stop → Play applies them** (AC2 — the story's
            central claim): mount with Conway + blinker; Play; `frame(0)`, `frame(100)`,
            `frame(200)` → cycle 2 playing; `rerender` with `survivalRules: []` (the roster is
            frozen) → `frame(300)`, `frame(400)` → cycle 4,
            still playing, dish NOT empty (assert through the transport: the button still reads
            **Pause**); `user.click(Pause)`; `user.click(Stop & reset)` → cycle 0; `user.click(Play)`;
            `frame(0)`, `frame(100)` → cycle 1 and **paused** (zero rules — implicit death,
            extinction). The reverse direction too: mount with `[]`, draw one cell, Play → dies at
            1; Stop; `rerender` with `conwayRules()` and a blinker; Play → survives 3 frames.
        18. **rule edits AT REST rebind the run without touching the speed**: mount; set the
            slider to index 2 (`fireEvent.change(slider, { target: { value: '2' } })`, the
            SpeedControl trap-2 form) → `aria-valuetext` "5 generations per second"; `rerender`
            with `survivalRules: conwayRules()` → the slider still reads 5 (hook state survives
            the rebind; `data-cycle` stays `"0"`); then draw a cell at rest → still 5.
        19. **Next cycle from rest: exactly one cycle, the run surface mounts, tools disable, no
            frame requested** (FR-4.3): draw a cell (zero rules); `user.click(Next cycle)` →
            `data-cycle="1"`, `data-status="paused"`, `raf` not called (`raf.mock.calls.length ===
            0` — manual step bypasses the loop, 3.12); Draw disabled; Next cycle still enabled
            (paused); Play enabled.
        20. **Next cycle while playing is disabled with its title** (3.12 FD6, inherited): after
            Play, `Next cycle` `toBeDisabled()` with `title` "Available while paused".
        21. **an unrunnable draft blocks the start and shows the hint; a runnable one unblocks**
            (AC6): `rerender` with `survivalRules: [createNewRuleDraft('r1')]` (zero conditions) →
            Play `toBeDisabled()`, Next cycle `toBeDisabled()`, Stop enabled, `getByText(
            'Fix the rule errors to run the preview.')` present; Draw/Erase still enabled (at
            rest); `rerender` with the rule given one `createNewConditionDraft('c1')` → Play
            enabled, hint gone. Then: a run in progress is never blocked — mount Conway + blinker,
            Play, one frame, `rerender` with `[createNewRuleDraft('r1')]` → Pause still enabled,
            Next cycle disabled only because playing, no hint; Pause → Next cycle enabled (the
            frozen roster is runnable); Stop → blocked, hint visible.
        22. **a colour pick mid-run repaints the run surface on the same commit** (4.14 AC4 holds
            during a run): Conway + blinker, Play, one frame; `rerender` with `colorToken: 'azure'`
            → the recording map gains a context (the playback renderer rebuilt), and it received a
            `fillStyle` equal to `displayColorAt(paletteIndexOf('azure'), MAX_AGE_SHADE)` after
            the rerender (the hook's `paintFull` on re-attach).
        23. **a rerender with the same props rebinds nothing**: after mount, `rerender` with
            identical props → `getContext` call count unchanged AND `data-status` / `data-cycle`
            unchanged; and — the FD2 tripwire — a name-only change cannot be observed here (the
            panel has no `name` prop), so instead assert `previewOrganismFrom` is called once per
            distinct `[colorToken, survivalRules]` pair: `vi.spyOn` the module export via
            `vi.mock('@/lib/organisms/previewOrganism', { spy: true })`, rerender twice with the
            same array → one call.
        24. **unmount mid-run stops the loop**: Play, one frame → `unmount()` → `caf` called with
            the last requested handle, `pending() === 0` (3.10 obligation 3 — no loop survives the
            panel).
        25. **the `Simulation controls` group precedes the slider which precedes the cycle readout
            in DOM order, all after Clear** (tab order = DOM order): `compareDocumentPosition`.
        26. axe: at rest → `[]`; blocked (21) → `[]`; mid-run (14, before Stop) → `[]`.
        Guard `resetRefToFillGroupWarnings()` / `resetColourStateWarnings()` / `vi.restoreAllMocks()`
        in `afterEach` (already there).

- [x] **Task 5 — Wire the panel into the modal** (AC: 1, 6, 10)
  - [x] `OrganismEditorModal.tsx`: `<PreviewPanel … survivalRules={draft.survivalRules} />` — one
        prop. Header comment: the per-story sentence becomes "Story 4.14's preview panel reads
        `colorToken`/`agingEnabled` and holds its own grid (M3); Story 4.15's run reads
        `survivalRules` and compiles them at the next Play"; tag line gains `(Story 4.15)`. Nothing
        else — no state, no handler, no repository.
  - [x] `OrganismEditorModal.test.tsx`: (a) **retarget** `:131-136` — `within(dialog).getAllByRole(
        'slider')` becomes `toHaveLength(2)` with a comment ("the second is the Preview & Test
        column's speed slider, Story 4.15 — the whole-dialog count stays deliberate"), plus
        `expect(within(basic).getAllByRole('slider')).toHaveLength(1)` right after it; the
        textbox/switch/radio counts, the title and every other assertion stay as they are; (b) append, in the 4.14 `describe`'s sibling `describe('preview simulation
        (Story 4.15)')`: (25) **the Preview & Test region holds the `Simulation controls` group, the
        `Generations per second` slider and a `Cycle` readout reading `0000`** — `within(preview)`;
        (26) **"+ Add Rule" blocks Play through the real draft; the first condition unblocks it**
        (AC6 through the UI): click the header's `+ Add Rule` → `within(preview).getByRole('button',
        { name: 'Play' })` `toBeDisabled()` + the hint; click `+ Add Condition` on the new card
        (the 4.11 path — `cellState = empty` default) → Play enabled, hint gone; (27) **a headless
        run under jsdom's bare root** (`colors === null` → no canvas, the hook runs headless — 3.10's
        documented state): `installFrameDriver()` (the same copy — put it in the test's helpers
        region), no `enableCanvasRendering()`; draw nothing (an empty grid runs: cycle 1 leaves it
        empty → extinction → paused at 1): Play → `frame(0)`, `frame(100)` → the Cycle readout's
        text is `0001` (`CycleDigits` renders `000` hidden + `1`; assert via `toHaveTextContent(
        '0001')`) and the button reads Play; the draft is untouched (the name field still holds what
        was typed before Play — the 4.14 test-23 oracle); (28) **Escape mid-run closes the dialog
        and stops the loop**: Play, one frame, `user.keyboard('{Escape}')` → `onClose` called once;
        rerender `open={false}` → `caf` called, `pending() === 0`; (29) axe with the run paused after
        extinction (27's end state) → `[]`.

- [x] **Task 6 — e2e against the served static export** (AC: 1, 2, 3, 4, 6, 7, 9, 11)
  - [x] `organisms.spec.ts`: append `test.describe('preview simulation (Story 4.15)')` after the 4.14
        block, reusing its helper shapes (copy `preview`/`dish`/`tool`/`cellCentre` locally or hoist
        them to the file's top helper region — hoisting is the better call since two blocks now share
        them; do it in place, no behaviour change, the 4.14 tests must pass unedited). Add
        `transport = (dialog) => preview(dialog).getByRole('group', { name: 'Simulation controls' })`,
        `run = (dialog, name) => transport(dialog).getByRole('button', { name, exact: true })`,
        `cycle = (dialog) => preview(dialog).locator('[data-preview-cycle]')` (the attribute on
        `CycleBlock` — an attribute beats a text lookup for an odometer; assert with
        `toHaveTextContent('Cycle0001')` or a regex on the digits), `box = (dialog) =>
        dialog.locator('[data-preview-dish]')`. The rules-column locators are the 4.11/4.13 blocks'
        (`+ Add Rule` in the header, `+ Add Condition` inside the card). Tests:
        1. **the controls render at rest, no horizontal overflow, zero console errors**: Play /
           Next cycle / Stop & reset enabled; slider `aria-valuetext` "10 generations per second";
           cycle `0000`; `box` `data-status="paused"` `data-cycle="0"`; the Preview & Test region's
           `scrollWidth <= clientWidth` (compressed tier, 1280); `errors` `[]`. Then the same
           overflow assertion behind the 4.14 block's one-off `setViewportSize(1440 × 900)` (full
           tier) — in a second test.
        2. **draw one cell (zero rules) → Play → auto-pause at cycle 1 with an empty dish; tools
           disabled; Stop restores the sketch** (AC2, AC4, AC7): click `cellCentre(5,5)`; `run(
           'Play').click()` → `await expect(box).toHaveAttribute('data-status', 'paused')` (the
           default 5 s expect timeout covers the 100 ms cycle) and `data-cycle` `"1"`; `run('Play')`
           visible again (the name flipped back); `tool('Draw')`/`('Erase')`/`('Clear')` all
           `toBeDisabled()`; `expect.poll(() => distinctColorCount(dish(dialog)))` `<= 2` (empty:
           background + grid line); `run('Stop & reset').click()` → `data-cycle="0"`, Clear
           `toBeEnabled()`, `distinctColorCount` `> 2` (the drawn cell is back).
        3. **Next cycle from rest advances exactly one cycle and stays paused** (FR-4.3): draw a
           cell; `run('Next cycle').click()` → `data-cycle="1"`, `data-status="paused"`, Draw
           disabled; `run('Next cycle')` still enabled; `run('Stop & reset').click()` → 0.
        4. **speed: the slider is the ladder; a change while playing neither pauses nor resets**
           (FR-4.2): no rules are authored through the UI here (the condition builder's e2e path
           is 4.11/4.13's; the zero-rule draft dies at cycle 1, which is all this test needs).
           `slider.fill('0')` → `aria-valuetext` "1 generation per second", the marks read `1 2 5
           10 20`; keyboard `End` → "20 generations per second". Then draw a cell, `fill('0')` (1
           gen/s), Play → `waitForTimeout(300)` → `data-cycle` still `"0"` and `data-status`
           `"playing"` (the first cycle is 1000 ms away); `fill('4')` (20 gen/s) while playing →
           `await expect(box).toHaveAttribute('data-status', 'paused')` at `data-cycle="1"` (the
           ref write took effect with no restart — a restart would have re-cloned and stayed
           `playing` at 0 for another second). One timing read, generous bounds.
        5. **"+ Add Rule" blocks Play with the hint; "+ Add Condition" unblocks** (AC6):
           `dialog.getByRole('button', { name: '+ Add Rule' }).first().click()` → `run('Play')`
           `toBeDisabled()`, `preview.getByText('Fix the rule errors to run the preview.')` visible,
           `run('Stop & reset')` enabled; add a condition (the 4.11 spec's locator) → Play enabled,
           hint hidden.
        6. **isolation (M3)**: read `gol:organisms` / `gol:battles` before; draw, Play, wait for the
           auto-pause, Stop, Close; both byte-identical; reopen → cycle `0000`, Clear disabled (a
           fresh dish and a fresh run).
        7. **keyboard**: draw a cell; `tool('Clear').focus()`; Tab (WebKit `Alt+Tab`) → Play
           focused; `Enter` → status playing, the focused button now reads Pause (same element,
           3.12 FD1); wait for the auto-pause; Tab → Next cycle (enabled while paused) → Tab → Stop &
           reset → Tab → the slider; `ArrowLeft` → "5 generations per second".
        8. **axe**: at rest with the controls → `[]`; paused after the extinction (settled, 300 ms)
           → `[]`.
  - [x] ⚠️ Run e2e against **this tree's** build: `lsof -i :4173` first (`deferred-work.md:1360-1364`);
        state the result in the Dev Agent Record. `npm run ci:dev` (Chromium only).

- [x] **Task 7 — Bundle measurement, docs, verification** (AC: 11)
  - [x] Measure before (on `main`, temporary worktree — the 4.14 method) and after: all four routes +
        the editor chunk (`grep -rl "Organism Color" apps/web/out/_next/static/chunks/*.js`, `gzip -c
        | wc -c`); record both. Do **not** edit `budgetGzipKb`. If `/organisms` or `/battle` moves by
        more than ±0.5 KB, say why.
  - [x] `deferred-work.md` (append-only plus strike-throughs; `main`'s hunks first on sync):
        - `:1637-1639` (4.15's `contentHash`): append "— ✅ **Decided in Story 4.15 (FD5): the
          session-only stand-in is the rule's own `id`** (`previewOrganism.ts`); the preview never
          needs the real hash (one organism per session — no two lists are compared), so 4.16's
          hasher does NOT replace it."
        - `:514` (the second mint site): append "— **Story 4.15 adds no mint site**: the preview
          reuses `useSimulation`'s `mintSeed` through the hook; the RNG-level check stays deferred
          on the same terms."
        - `:1707-1714` (3.18's 4.15 pointers): append "— **Done in Story 4.15** for
          `<TransportControls>` (with `compact`/`disabled`), `<CycleDigits>` and `<SpeedControl>`;
          `<PopulationPills>` was NOT mounted (FD9) — see the 4-15 section."
        - `:2101-2106` (4.14's `PREVIEW_ORGANISM_ID` placeholder): append "— **Story 4.15 keeps the
          id as the preview organism's SESSION identity** (`previewOrganismFrom`) rather than
          replacing it: the drawn grid's ref 1, the palette's slot 1 and the compiled roster's ref 1
          all resolve through one constant. Story 4.17's self-reference (`organismType eq <own id>`)
          is the reason the adapter will one day take `selfId` and rewrite that pattern to
          `PREVIEW_ORGANISM_ID` before compiling — not built here (no caller has an id; the 4.9 FD1
          dead-handle rule)."
        - Add `## Deferred from: Story 4-15-preview-simulation (<date>)` with: (1) **no population
          reading in the preview** (FD9) — spec §8/§3.12 name a "compact `PopulationStats`" and the
          3.18 pointer names `<PopulationPills>`; the editor mockup has none, the AC has none, and a
          pill would show the run's *snapshot* colour/name beside a canvas that follows the live
          palette (4.14 AC4) — two colours for one organism the moment a swatch is picked mid-run.
          Candidate: a living-cell count line (`sim.population[0]?.count`), which cannot go stale;
          decide with the next UX pass. (2) **design-doc amendment candidates**
          (`organism-editor-design.md:512-516`, `:789`, `:849-850`): "Updates in real-time as rules
          change" / "Debounce preview simulation updates (300ms after rule change)" / OQ-3 are
          answered by the epic AC — rule edits apply on the next run, never mid-run (FD2); and the
          mockup (`organism-editor.html:770-815, :1208-1217`) shows no speed slider and a uniform
          `.btn-sim` trio — the shipped surface is the Run mode's cluster (FD8) plus the design doc's
          slider. (3) **`installFrameDriver` is at two copies** (`BattleSimulationView.test.tsx`,
          `PreviewPanel.test.tsx`; three if the modal test copies it too — then lift to
          `@/test-support`). (4) **Stop is the only way back to the sketch after an auto-pause**
          (FD3): an auto-paused run at cycle N shows an empty dish with the tools disabled until Stop;
          an "auto-pause returns to rest" shortcut was considered and rejected (a paused run at
          cycle N must keep its live grid for Step — the two states are indistinguishable at the
          hook). A "Stop to draw again" affordance is a copy candidate. (5) **`organismType`
          conditions never match in the preview** — the roster is one organism, so "Occupied by X"
          compiles to `NO_MATCH_REF` (Decision E.3; the design doc's "runs organism in isolation").
          A hint beside such a condition ("does not apply in the preview") is a candidate for the
          rules column, not the panel. (6) **the preview's starting speed is the schema default**
          (`DEFAULT_SETTINGS.defaultSpeed`), not the user's FR-8.12 setting — Story 6.9 decides,
          on the same terms as 4.14's grid-lines entry. (7) **`Play` disabled carries no `title`**
          — the hint line is the disclosure; 3.12 FD6's `title` on Step stays for the playing case
          only. (8) **`compact` wraps rather than shrinks** (FD8) — at 290px the cluster renders as
          two rows (Play + Next cycle, then Stop & reset full width); a three-up grid needed the
          mockup's short labels, which 3.18 FD11 rejected for the shared cluster. (9) **a Pause
          that beats the first cycle returns to rest** (`cycle === 0`): the dish flips back to the
          edit surface — by design (nothing happened), recorded because it looks like a bug to
          someone who presses Play/Pause quickly at 1 gen/s. (10) **4.24/4.25 will mount this panel
          over `<BattlePage>`** — in Lab mode only (the pencils and "+ Create" are Lab-side), so two
          `Simulation controls` groups never coexist; the modal's `inert` on the page behind is the
          second guard. Say so in 4.24's story.
  - [x] `docs/project-context.md` — **no new rule**. Candidate only if a second story trips on it:
        "a run's roster is a snapshot — follow the draft at rest, freeze it mid-run".
  - [x] `npm run ci:dev > ci.log 2>&1; echo $?` — paste the exit code, the bundle lines (all four
        routes + the editor chunk before/after), the four coverage lines (`packages/*` byte-identical)
        and the e2e summary into the Dev Agent Record. Push to `story/4-15-preview-simulation`;
        `gh run list --limit 1` after the PR opens.

### Review Findings

Code review 2026-09-21 (opus, `review_mode: full`; layers: Blind Hunter, Edge Case Hunter,
Acceptance Auditor). 0 `decision-needed`, 12 `patch`, 1 `defer`, 18 dismissed. Dismissed as
spec'd-by-design or out of scope: Stop enabled at rest (3.12 FD5), `colorToken` in the session
key (AC5), a `disabled` guard against `playing` inside `<TransportControls>` (the caller's
contract, FD4), the empty-grid "extinction" modal case (Task 5 test 27 as written), a `try/catch`
around `compileSession` (What NOT to build), `useMemo` cache discard re-keying an at-rest run
(theoretical, no user-visible effect), the render-phase `setRoster` "double session" (a discarded
render runs no effects — `initialView` only), cosmetic comment placements.

- [x] [Review][Patch] `<TransportControls>` emitted `data-compact="false"` on both existing callers (a boolean `data-*` stringifies) — now `compact ? 'true' : undefined`; test (a) pins "no attribute" [apps/web/components/battle/simulation/TransportControls.tsx]
- [x] [Review][Patch] `TransportControls.test.tsx` (c) never proved Step is unreachable nor that Stop's handler still fires while `disabled` — both asserted [apps/web/components/battle/simulation/TransportControls.test.tsx]
- [x] [Review][Patch] `previewOrganism.test.ts`: tautological `dominance: organism!.dominance` → `NEW_ORGANISM_DOMINANCE`; three redundant `expect(() => compileSession(...)).not.toThrow()` beside a live call dropped [apps/web/lib/organisms/previewOrganism.test.ts]
- [x] [Review][Patch] `PreviewPanel.test.tsx` test 14 lacked the spec'd construction oracle (a playback canvas that mounts but never builds its renderer passed) — the recording map grows + `contexts.has(runCanvas)` [apps/web/components/organisms/editor/PreviewPanel.test.tsx]
- [x] [Review][Patch] test 21 inlined the condition literal instead of `createNewConditionDraft('c1')` — the real "+ Add Condition" default is now what unblocks [apps/web/components/organisms/editor/PreviewPanel.test.tsx]
- [x] [Review][Patch] test 23's FD2 tripwire had no positive control (`not.toHaveBeenCalled` passes vacuously if the `{ spy: true }` mock stops intercepting) — a new rules identity now pins `toHaveBeenCalledTimes(1)`; test 18 retitled to what it asserts [apps/web/components/organisms/editor/PreviewPanel.test.tsx]
- [x] [Review][Patch] the `[]` empty-roster seed (`useState` initialiser for an initially unrunnable draft) was never mounted into — new case: blocked from the first render, Stop a safe no-op, roster follows once runnable [apps/web/components/organisms/editor/PreviewPanel.test.tsx]
- [x] [Review][Patch] `installFrameDriver` reached its third (fourth, with 3.19's `BattlePage.test.tsx`) copy and the spec's own rule says lift on the third — lifted to `apps/web/test-support/frameDriver.ts`; all four test files import it (helper move only, no assertion touched) [apps/web/test-support/frameDriver.ts]
- [x] [Review][Patch] `organisms.spec.ts`: the 4.15 block copied `preview`/`dish`/`tool`/`cellCentre`/`distinctColorCount` and its comment cited a `deferred-work.md` hoist record that did not exist — the 4.14 helpers are hoisted to file scope (the spec's preferred call), the copies and the false comment removed [apps/web/e2e/organisms.spec.ts]
- [x] [Review][Patch] e2e test 2 dropped the "sketch came back" repaint oracle; e2e test 4 dropped the spec'd marks assertion and its speed-change read was satisfiable by the OLD speed (default 5 s expect ≫ the ~700 ms remaining at 1 gen/s) — the painted cell is now located from the image itself (`paintedCell`: bounding box of pixels absent from the empty dish's palette) and its interior pixel must go away on extinction and come back after Stop (a colour count cannot serve — an empty and a one-cell dish both rasterise to 6 shades; a whole-raster hash cannot either — stroke vs full repaint blend the edges differently; a CSS-geometry cell read drifts a cell at DPR 2); marks `1 2 5 10 20` asserted; the paused read bounded at 500 ms. Verified on chromium/firefox/webkit/tablet × 2 [apps/web/e2e/organisms.spec.ts]
- [x] [Review][Patch] e2e test 6 compared `[null, null]` if the key were wrong; the keyboard test self-asserted (`:focus` locator `toBeFocused()`), never read the Pause name, and raced the 100 ms auto-pause at 10 gen/s — `before[0]` non-null guard; 1 gen/s window; the focused element's name asserted Play → Pause → Play; `ArrowRight` → 2 gen/s [apps/web/e2e/organisms.spec.ts]
- [x] [Review][Patch] docs: `OrganismEditorModal.tsx` head comment said the rules compile "at the next Play" (they compile eagerly at rest, `useMemo`); Dev Agent Record said the e2e block has 10 tests (9) and "no task deviated" (test 22's oracle is the `getContextSpy` count, not the map size — correct under the per-canvas rig; `useSimulation.test.ts`'s `mount` helper parameter type was widened alongside the appended case); `deferred-work.md` bundle figure 0.65 → 0.63 KB; the `Play`-disabled entry now names the missing `aria-describedby` too [docs/implementation-artifacts/4-15-preview-simulation.md]
- [x] [Review][Defer] `cellCentre` in `organisms.spec.ts` hard-codes 30×20 (the unit tests read `PREVIEW_GRID_SIZE`; the Playwright spec has no transpile path into `@/lib`) [apps/web/e2e/organisms.spec.ts:2306] — deferred, pre-existing (4.14's helper; recorded in `deferred-work.md`)

Proposed lane-gates row: none — the diff touches no file an Epic 5 story (settings shell,
statistics, export/import pipeline, migration registry, clear-all-data, corruption handling)
needs; `deferred-work.md` is append-only and merges cleanly.

## Dev Notes

### Forced decisions (made here so the dev agent does not have to)

- **FD1 — One always-mounted `useSimulation` in `<PreviewPanel>`; no run child, no mode state.**
  Two shapes were possible. (a) A `<PreviewRun>` child mounted only while running (the
  `<BattlePage>` → `<BattleSimulationView>` form, hook inside the child, "unmount to leave Run").
  (b) The panel itself calls the hook on every render and derives "run vs sketch" from the hook's
  own published view. (b) is taken: the hook already models "at rest" as `paused` at cycle 0 —
  after mount, after `stop()`, after an early `pause()` — and every control this story mounts
  needs the hook *before* Play is pressed (Next cycle from rest, the slider, the counter's
  `0000`). A child would need a "sketch" transport that forwards into a not-yet-mounted hook. The
  cost of (b) is one session per at-rest rebind (a stroke, a rule edit, a colour pick): a
  `compileSession` of one organism, a 600-cell clone and a loop object — microseconds, and the
  renderer is NOT rebuilt (the hook's session effect touches refs only). The 4.14 FD4 concern —
  a renderer rebuild per keystroke — does not apply: the palette memo is untouched and the
  session key excludes `name`/`dominance`/`agingEnabled` (`previewOrganism.ts`).

- **FD2 — The roster is panel state; it follows the draft at rest and is frozen otherwise.** The
  AC says "rule edits apply on the next run". The hook restarts a run on a new `organisms`
  reference (3.10 FD2), so *when* the reference changes is the whole design: a memo keyed on the
  rules would restart a playing run on every keystroke (the design doc's "real-time" reading —
  superseded, Open flags); a snapshot taken only at Play needs Play to mean two things. The
  render-phase adjustment (`if (atRest && liveOrganism !== null && roster[0] !== liveOrganism)
  setRoster([liveOrganism])`) is React's documented "adjusting state when a prop changes" — the
  same form `useSimulation.ts:353-360` and `useUndoableGrid` use, and the form the
  `react-hooks/set-state-in-effect` rule leaves for exactly this. It is total: at rest the next
  Play always compiles the current rules; mid-run (playing, paused at N > 0, auto-paused) nothing
  moves until Stop; an unrunnable draft leaves the last runnable roster in place and
  `startBlocked` keeps it from running. The hook's `sameKey` guard on `publish`/`settleStopped`
  covers the rebind window (a frame stepping the old session cannot merge onto the new key).

- **FD3 — "At rest" (`paused && cycle === 0`) is the swap key and the tools' gate; Stop is the
  way back after an auto-pause.** Keying the canvas swap on `status` alone would return the edit
  surface on every Pause — and the sketch is NOT the live grid at cycle 42 (AR-31: the initial
  grid is the reference, the live one is disposable). Keying on `cycle === 0` alone would show
  the run surface for a playing run at cycle 0 (correct) and the edit surface for a paused run
  at 0 (correct — nothing happened). So: rest ⇔ both. After an extinction the run is paused at
  N > 0: the run surface stays (an empty dish, a frozen counter, Play re-labelled — 3.15 FD4's
  whole signal), the tools stay disabled, and Stop & reset (FR-4.4 "return to initial state") is
  the sketch's return — the `<BattlePage>` Run→Lab in miniature (RFC-005 Decision 4). An
  "auto-pause returns to rest" shortcut was rejected: at the hook, an auto-paused run and a
  user-paused run are the same state, and a user-paused run must keep its grid for Step.

- **FD4 — Play/Step disable on an unrunnable draft, with a visible hint; never a silent skip,
  never a throw.** Three readings of "the simulation uses the live rules" when a rule cannot be
  parsed: skip the bad rule (the run silently disagrees with the visible rules — the exact class
  of failure M12 exists to make loud), let `compileSession` throw (unreachable anyway — the
  adapter cannot build a `Condition` from `'abc'`), or refuse to start. Refusing with a real
  `disabled` (3.12 FD6) and a one-line reason (NFR-4.1 — a disabled control with no reason is
  the dead affordance) is the house form. The gate is `previewOrganismFrom(...) === null`, which
  is *exactly* the Save gate's rule/condition errors (`parseConditionDraft` + `ruleNeedsCondition`
  — Task 1 test (e) pins the equivalence); the name error is excluded because a name is not a
  run input. A run in progress is never blocked (FD2: its roster is a valid snapshot).

- **FD5 — `contentHash` stand-in = the rule's `id`.** `validateSurvivalRules` rejects an empty
  hash (`validateRules.ts:295-304`) because the per-session evaluator cache is keyed on the
  ordered join of a list's hashes and a collision hands one organism another's evaluators. With
  one organism per session no two lists are compared, so any non-empty, per-rule string is
  correct; the draft `id` is unique per rule, stable across edits, and already there. The
  alternatives — building 4.16's canonicalisation here (half a hasher that could be mistaken for
  the real scheme) or an async `crypto.subtle.digest` per keystroke — buy nothing for the
  preview. Never persisted, never exported; 4.16's hasher does not replace it. Closes
  `deferred-work.md:1637`.

- **FD6 — `useSimulation` accepts `SimulationOrganism` (a `Pick`), not a faked `Organism`.** The
  draft has no `schemaVersion` (4.16 stamps it at save) and `agingEnabled` is the renderer's
  input, never the engine's (`compileEvaluators.ts:24-29`'s corrected note). Stamping
  `schemaVersion: 1` on a session object is the kind of stamp Decision I says is "asserted,
  never switched on" — here it would be neither, just a lie to satisfy a type. The hook, like
  `CompilableOrganism`, `PlaybackRenderer` and `derivePopulation`, should take what it reads.
  Type-only; `tsc` proves every existing caller compiles unedited.

- **FD7 — The panel's props grow by `survivalRules` only; `name` and `dominance` stay out.**
  `derivePopulation` needs a `name` (constant — nothing renders it, FD9) and `OrganismRuntime` a
  `dominance` (constant — Phase 3 arbitrates between organisms, and there is one). Reading them
  from the draft would rebind the run on every name keystroke and every dominance drag for a
  value that cannot change a cell. If a population reading ever lands (FD9's candidate), the
  name becomes a prop then.

- **FD8 — Reuse `<TransportControls>` with a `compact` prop that wraps; do not re-author the
  mockup's `.btn-sim` trio.** The mockup (`organism-editor.html:770-796, :1208-1210`) draws three
  identical `.btn-tool`-styled buttons "▶ Play / ▸ Step / ■ Stop" in a 3-column grid; the shipped
  cluster is accent Play / outline Next cycle / danger Stop & reset with the Run route's
  accessible names. The names are the route's test vocabulary and 3.18 FD11 rejected the short
  set even for the fullscreen HUD; 3.12's four decisions (one flipping Play/Pause element, the
  colour pairs, always-enabled Stop, real `disabled` on Step) should exist once. The three full
  labels do not fit three-up in 290px (≈ 380px needed), so `compact` lets the cluster wrap
  (`flex-wrap: wrap`, `flex: 1 1 auto`) — two rows at both tiers, no label wrapping, no font
  step, no `overflow: hidden`. The `<LadderSlider>` `disabled` precedent (3.16): an addition on
  the shared component that never fires for its existing callers, proven by their tests passing
  unedited. `SimulationControlBarProps` stays the spec's four members (the bar spreads it).

- **FD9 — No population reading.** Spec §8/§3.12 say "compact `PopulationStats`" and the 3.18
  pointer says `<PopulationPills>`; the epic AC and the editor mockup have neither. The pill
  would render the run's *snapshot* `colorToken`/`name` (published from `key.organisms`) beside a
  canvas that follows the live palette (4.14 AC4) — a swatch pick mid-run shows two colours for
  one organism. A count-only line has no such problem and is recorded as the candidate; the AC's
  extinction signal is already complete without it (3.15 FD4). Not built; `deferred-work.md`.

### What exists — read these before writing a line

| File | Why it matters here |
|---|---|
| `apps/web/lib/battle/useSimulation.ts` | **Modified (type only).** The head comment's consumer obligations 1–6 (`:74-95`) — every one binds this panel; `SessionKey` (`:174-179`); the render-phase reset (`:348-360`) this story's FD2 mirrors one level up; `publish`/`settleStopped`'s `sameKey` guard (`:365-393`); `attachRenderer` + `paintFull` (`:395-469`) — why a late attach paints; `step()` throws while playing (`:488-498`); `stop()` re-clones and re-seeds (`:500-524`); `setSpeed` is a ref write (`:526-533`). |
| `apps/web/lib/battle/useSimulation.test.ts:34` | `createFakeScheduler` — the injected form; the panel test uses the window-spy form instead (below). |
| `apps/web/components/battle/simulation/BattleSimulationView.tsx:263-287, 407-424` | The one-hook-call, `handlePlayPause` deps, straight-through `sim.step`/`sim.stop`/`sim.setSpeed`/`sim.attachRenderer`, the playback canvas wiring. **Unedited.** |
| `apps/web/components/battle/simulation/BattleSimulationView.test.tsx:68-107` | `installFrameDriver()` — copy with a pointer (`frame(now)` inside `act`; `pending()`; `lastHandle()`). |
| `apps/web/components/battle/simulation/TransportControls.tsx` | **Modified.** `Transport` (`:48-53`), `barButtonBase` (`:68-88`), the props (`:150-162`), the markup (`:164-213`); 3.12's four decisions restated in the head comment. |
| `apps/web/components/battle/simulation/SimulationControlBar.tsx:5-7, 68` | Spreads `props` into `<TransportControls>` — why the new props live on a separate `TransportControlsProps`. |
| `apps/web/components/battle/simulation/SpeedControl.tsx`, `LadderSlider.tsx` | `SpeedControlProps` (`:31-36`); the range-input idiom, `aria-valuetext`, jsdom's "write integer strings" trap (`LadderSlider.tsx:194-198`). **Unedited.** |
| `apps/web/components/battle/simulation/CycleDigits.tsx`, `FullscreenStage.tsx:258-266, 331-338` | The padded digits and the HUD's own size block around them — the shape `CycleBlock`/`CycleValue` copies. |
| `apps/web/components/battle/simulation/README.md` | "Story 4.15's preview panel is the next consumer of `<TransportControls>`, `<CycleDigits>` … — never `<HotkeyHints>`". |
| `apps/web/components/PetriDishCanvas.tsx:56-74, 782-940` | The `playback` member: `onRendererReady(renderer \| null)`, construction keyed on `cols`/`rows`/`palette`/`colors` (a palette change rebuilds and re-attaches — AC7's mid-run repaint), the cleanup detaches through the ref. **Unedited.** |
| `apps/web/components/organisms/editor/PreviewPanel.tsx` | **Modified.** The 4.14 shape and its head-comment ASCII naming what this story adds (`:24-41`); `PreviewDishBox`'s definite-width rule (`:57-69`) — both canvases observe it. |
| `apps/web/components/organisms/editor/PreviewPanel.test.tsx:1-95` | The rig: per-canvas recording contexts (the map's size is the construction oracle), `stubCanvasRect`, `centreOfCell`, `mount()`. |
| `apps/web/components/organisms/editor/OrganismEditorModal.tsx:243-272, 468-473` | The draft, the `colors` memo, the `preview=` slot. **Modified (one prop).** |
| `apps/web/components/organisms/editor/OrganismEditorModal.test.tsx:118-141, 966-1090` | The slider-count assertion to scope (AC10 a); the 4.14 block's `enableCanvasRendering` idiom and the "draft unchanged" oracle. |
| `apps/web/lib/organisms/previewGrid.ts` | `PREVIEW_ORGANISM_ID`, `PREVIEW_ROSTER` (ref 1), `PREVIEW_GRID_SIZE`. **Unedited** — the adapter imports the id. |
| `apps/web/lib/organisms/ruleDraft.ts:55-75, 136-145` | `RuleDraft`, `ruleNeedsCondition`, `ruleDraftFrom` (the inverse of the new `parseRuleDraft`; the fixtures' source of `RuleDraft`s). **Modified (append).** |
| `apps/web/lib/organisms/conditionDraft.ts:14-25, 264-341` | "`conditionFromDraft` (the persisted-shape view, Story 4.16's save and **Story 4.15's preview**)" — the parse this story consumes, never re-implements. |
| `apps/web/lib/organisms/organismDraft.ts:23-25, 93-118` | `OrganismDraft`; `validateOrganismDraft` — the Save gate whose rule/condition errors are exactly `previewOrganismFrom === null`. |
| `apps/web/lib/battle/population.ts:50-53`, `simulationSpeed.ts:20-60`, `rafScheduler.ts` | `derivePopulation`'s `Pick`; `SPEED_LADDER`, `msPerCycle`, `cyclesPerPublish` (why every cycle publishes at 10 gen/s); the window-bound scheduler the tests spy. |
| `packages/simulation/src/session/compileEvaluators.ts:14-35, 125-157, 288-342` | `CompilableOrganism`; the cache key over `contentHash` (FD5); `internRule` — an absent `organismType` target is `NO_MATCH_REF`, not an error; `compileSession` validates the whole roster first. |
| `packages/simulation/src/session/validateRules.ts:12-17, 227-304` | "the IN-MEMORY path … Story 4.15's draft organism straight out of the editor" — every check the adapter's output must pass; the `contentHash` check. |
| `packages/domain/src/defaultWorkspace.ts:20-60`, `settingsSchema.ts:31-33, 42` | `CONWAYS_CLASSIC` (the test fixture's rules); `DEFAULT_SETTINGS.defaultSpeed`. |
| `docs/planning-artifacts/epics.md:49, 69-74, 123, 197-202, 238, 1165-1175` | FR-2.7, FR-4.2–4.5/4.7, FR-8.12, AR-29/31/32/33/34, UX-DR13, the story's ACs. |
| `docs/planning-artifacts/architecture.md:184, 212-216, 348-349` | Decision B.5, D.1–D.3, M2, M3. |
| `docs/planning-artifacts/rfcs/RFC-005-application-state-modes-undo.md:177` | The M3 callout: "reuses the RFC-004 engine and this hook unchanged". |
| `docs/planning-artifacts/component-tree-battle-page.md:255-269, 297-308, 375, 463-467` | §3.10's `playback` member and "preview reuse 4"; §3.12's reuse line; §4 "instantiated twice"; §8's table. |
| `docs/planning-artifacts/ux-designs/ux-GameOfLife-2026-05-27/organism-editor-design.md:484-516, 615-631, 789, 849-850` | The controls, the behaviour list (with the superseded "real-time" line), the testing steps, the debounce line, OQ-3. |
| `docs/planning-artifacts/ux-designs/ux-GameOfLife-2026-05-27/clinical-lab-theme/organism-editor.html:770-815, 1208-1217` | `.sim-controls`, `.btn-sim`, `.cycle-counter`/`.cycle-label`/`.cycle-value`, the markup (no slider, no JS). |
| `docs/implementation-artifacts/4-14-preview-grid-drawing.md` (FD1, "The shape Story 4.15 inherits", Review Findings) | The shape this story fills without moving anything; the review's test-strength lessons. |
| `docs/implementation-artifacts/epic-3/3-10-*.md`, `3-11-*.md`, `3-12-*.md`, `3-15-*.md`, `3-18-*.md` | The hook contract; the view's AC9 render discipline; 3.12 FD1–FD6; 3.15 FD1/FD4; 3.18 FD7/FD8/FD11 and its lane-gate proposal (satisfied: 3.18 is done). |
| `docs/implementation-artifacts/deferred-work.md:514, 693-699, 1289-1300, 1330-1340, 1637-1639, 1707-1714, 1836-1839, 2101-2106` | The mint-site note, the `stepGridBuffers` "reuse, don't re-derive", the compact-variant and `status`-union threads, the `contentHash` note, 3.18's pointers, the `aria-keyshortcuts` rejection, 4.14's placeholder note. |
| `docs/implementation-artifacts/lane-gates.yaml` | 4.15 requires 3.15 (`done`); this story proposes no gate. |

### Architecture compliance

- **M3 / AR-32 / RFC-005 Decision 5** — a second `useSimulation` over the panel's own grid; the
  hook and the engine are reused with one type widened and zero behaviour changed; no battle
  state is reachable from the panel (no repository, no `<BattlePage>` import).
- **AR-29 / NFR-1.1 / M2** — the engine's state stays in the hook's refs; the panel re-renders at
  publish cadence; `handlePlayPause` keys on `[status, play, pause]`; every other hook callback
  is passed through unwrapped.
- **AR-31 / RFC-005 Decision 4** — the drawn grid is the run's `initialGrid`, cloned; the live
  grid is discarded on Stop; the tools are disabled while a live grid exists so the reference the
  session was keyed on cannot move under it.
- **Decision B.5 / FR-4.7** — extinction-only auto-pause through the hook's own branch; no
  still-life detection, no new status.
- **Decision D.1–D.3 / AR-34 / FR-4.2** — the ladder is `SPEED_LADDER`; speed is a ref write
  through `sim.setSpeed`; the preview starts at the schema default.
- **M12 / M13 / Decision E.3 / AR-21** — the draft organism goes through `compileSession`'s
  validation sweep once, before its first cycle; `Organism` → `CompilableOrganism` structurally;
  an absent `organismType` target is a never-match; the `contentHash` stand-in is opaque and
  session-only.
- **M14 / RFC-006 Decision 2** — ref `1` = `roster[0]` = `PREVIEW_ORGANISM_ID`, the same id the
  drawing tool and the palette resolve.
- **Decision A / AR-17** — `PREVIEW_GRID_SIZE` is the parameter to `createGrid`, both canvases and
  (via the hook) the renderer; no `30`/`20` literal.
- **RFC-003 Decision 3 / Decision J / AR-46** — `styled()` + `var(--gol-*)`; no new token, no
  literal, no `transition`; the reused components bring their own gated pairs.
- **AR-35 / bundle** — no dependency; everything new rides the editor's lazy chunk.
- **AR-42 / AR-44** — decisions pinned through the recording context, the `data-*` handles and
  the control states; the e2e's pixel reads are the permitted smoke check.
- **Spec-id hygiene** — `spec:check` tokenises `FR-2.7`, `FR-4.2`, `FR-4.3`, `FR-4.4`, `FR-4.5`,
  `FR-4.7`, `FR-8.12`, `NFR-1.1`, `NFR-4.1`, `NFR-8.3`, `AR-2`, `AR-17`, `AR-21`, `AR-27`, `AR-29`,
  `AR-31`, `AR-32`, `AR-33`, `AR-34`, `AR-35`, `AR-42`, `AR-44`, `AR-46`, `RFC-002`, `RFC-003`,
  `RFC-004`, `RFC-005`, `RFC-006`, `Decision A`, `Decision B`, `Decision D`, `Decision E`,
  `Decision I`, `Decision J`, `M2`, `M3`, `M10`, `M12`, `M13`, `M14`, `Story 2.14`, `Story 3.8`,
  `Story 3.10`, `Story 3.11`, `Story 3.12`, `Story 3.13`, `Story 3.14`, `Story 3.15`, `Story 3.16`,
  `Story 3.18`, `Story 3.19`, `Story 4.9`, `Story 4.11`, `Story 4.13`, `Story 4.14`, `Story 4.15`,
  `Story 4.16`, `Story 4.17`, `Story 4.24`, `Story 4.25`, `Story 6.9`, `Story 6.11`; write them
  exactly so. `UX-DR*`, `FD*`, `AC*` are not checked.

### Library / framework notes (installed versions, no research needed)

- **React 19.2** — `setState` during render of the same component re-runs the body immediately
  and discards the in-progress output (the FD2 adjustment; the hook's own reset runs in the same
  re-run); passive effects from a discrete event (a click) flush synchronously after commit, so
  the playback canvas's `attachRenderer` lands before the next macrotask — the loop's first RAF
  callback finds a renderer either way (3.10 Trap 1 covers both orders).
- **RAF under jsdom** — `window.requestAnimationFrame` exists; the tests replace it with a manual
  queue (`installFrameDriver`). `rafScheduler` looks the global up at call time, which is why a
  `vi.spyOn(window, …)` is a complete fake and no `scheduler` prop is needed (3.11 FD4).
- **`msPerCycle(10) = 100`** — `frame(0)` primes the loop's clock with no delta (3.8 FD4),
  `frame(100)` banks 100 ms and steps once (a larger delta is clamped to `msPerCycle`, Decision
  D.3 — still one step); `cyclesPerPublish(10) === 1`, so every
  cycle publishes and `data-cycle` follows each frame.
- **Emotion `styled(Component)`** — preserves the wrapped component's props union;
  `styled(PetriDishCanvas)` with `variant="playback"` type-checks (the Run view does it).
- **jsdom + `<input type="range">`** — `fireEvent.change(slider, { target: { value: '2' } })`
  with an integer string (jsdom clamps but does not snap — `LadderSlider.tsx:194-198`).
- **Playwright 1.62** — `locator.fill('0')` on a range input sets the value and fires `input`;
  `expect.poll` for timing-bound reads; WebKit's `Alt+Tab`; `toBeDisabled()`.
- **vitest-axe / @axe-core/playwright** — a `button` with `disabled` and no `title` passes; a
  `<p>` hint needs no role; `data-*` attributes are inert to axe.

### Testing standards

- `apps/web` has **no coverage gate** — every test guards a named failure: a run that restarts on
  a keystroke or fails to restart on Stop (Task 4 tests 17/18), a skipped or thrown-on invalid
  rule (21), a Step that reaches the loop (19), a Stop that loses the sketch (15), a still-life
  that auto-pauses (16 — the B.5 trap), a loop surviving unmount (24), a renderer not rebuilt on
  a mid-run palette change (22), a per-render rebind (23), a shared component whose defaults
  changed (Task 3 a), a slider assertion widened rather than scoped (Task 5 a), a modal that
  runs headless wrongly (27), an overflowing cluster (e2e 1), a preview that persists (e2e 6).
- `packages/*` **untouched** — their coverage lines exactly as on `main`.
- Never snapshot; never assert computed colours in jsdom; never assert `canvas.width` in the
  browser; never run axe mid-transition; never click a disabled button to prove it is inert;
  never assert a still-life auto-pauses; never assert on an unseeded outcome (one organism has
  no ties — the RNG is never consulted, so every preview run here is deterministic anyway).
- The 3.11–3.19 tests, the 4.3–4.14 tests and the 3.12/3.18 transport tests are retargeted
  **only** as AC10 lists; if any other test fails, the change is wrong, not the test.
- Write every test file Tasks 1–6 name **before** ticking the task; record what each test
  actually does (the 4.14 review habit: an assertion satisfied by history, an oracle that proves
  a repaint but not a reconstruction, a drag test satisfied by the pointer-down alone — slice
  recordings after a marker, count `getContext` calls, erase a known cell).

### Previous story intelligence (Story 4.14)

- The review found 15 test-strength patches and no source changes: assertions satisfied by
  cumulative recording history (slice after a marker), `drawFull` used as a construction oracle
  (it is also the external-change path — count `getContext`), a spy installed after `render`
  (dead — the construction effect already ran), `toHaveBeenCalled` where `Times(1)` was
  available, an `img` not scoped to the box, a dev record naming the wrong uncovered branch and
  the whole-suite count as the spec's. Carry every one of those into Task 4's cases.
- CI went red on WebKit/tablet for a `toBeCloseTo(…, 0)` on a bordered `aspect-ratio` box; use
  ranges, and check the real run (`gh run list`) rather than inferring from Chromium.
- The 4.14 shape was built so this story "adds without moving": `grid` in panel state (the
  initial grid), ref `1` = the organism under edit, `PreviewDishBox` as the swap site. Fill it;
  do not restructure it. `previewGrid.ts` is not edited.
- `lsof -i :4173` before e2e; paste the actual exit code; keep AC text, FD text, comments and the
  Dev Agent Record in step.

### Git intelligence

`main` is at `3ae861f` (merge of #64, the lane-5 gates row; #63 was 4.14). The last app-code
commits are 4.14's (`components/organisms/editor/{PreviewPanel,OrganismEditorModal}.*`,
`lib/organisms/previewGrid.*`, `e2e/organisms.spec.ts`). `useSimulation.ts` and the
`simulation/` components were last touched by 3.18/3.19 and are stable. **Only Epic 4 is in
progress** (`sprint-status.yaml`; Epic 5 is `backlog` with its lane analysed and one gate on
4.19): no other lane shares `useSimulation.ts` or `TransportControls.tsx` today. This story's
files: `components/organisms/editor/{PreviewPanel,OrganismEditorModal}.*`,
`lib/organisms/{previewOrganism,ruleDraft}.*`, `lib/battle/useSimulation.ts` (+ one test case),
`components/battle/simulation/TransportControls.tsx` (+ new test), `e2e/organisms.spec.ts`,
`deferred-work.md`.

### Project Structure Notes

- New: `apps/web/lib/organisms/previewOrganism.ts` (+ `.test.ts`);
  `apps/web/components/battle/simulation/TransportControls.test.tsx`.
- Modified: `apps/web/components/organisms/editor/PreviewPanel.tsx` (+ `.test.tsx`);
  `apps/web/components/organisms/editor/OrganismEditorModal.tsx` (+ `.test.tsx`, one scoped
  assertion + new cases); `apps/web/lib/organisms/ruleDraft.ts` (+ `.test.ts`, append);
  `apps/web/lib/battle/useSimulation.ts` (type) (+ `.test.ts`, one case);
  `apps/web/components/battle/simulation/TransportControls.tsx` (two optional props);
  `apps/web/e2e/organisms.spec.ts`; `docs/implementation-artifacts/deferred-work.md`,
  `sprint-status.yaml`.
- Naming: `SimulationOrganism`, `ParsedRuleDraft`, `parseRuleDraft`, `previewOrganismFrom`,
  `PREVIEW_ORGANISM_NAME`, `PREVIEW_STARTING_SPEED`, `PREVIEW_BLOCKED_HINT`,
  `TransportControlsProps` (`compact`, `disabled`); panel locals `liveOrganism`, `roster`, `sim`,
  `atRest`, `startBlocked`, `handlePlayPause`; styled `PreviewRunCanvas`, `SimulationSection`,
  `RunHint`, `CycleBlock`, `CycleLabel`, `CycleValue`; data attributes `data-status`,
  `data-cycle` (on `[data-preview-dish]`), `data-compact` (on the transport group),
  `data-preview-cycle`; accessible names "Simulation controls", "Play"/"Pause", "Next cycle",
  "Stop & reset", "Generations per second"; hint text "Fix the rule errors to run the preview."
- Untouched on purpose: `PetriDishCanvas.tsx` (+ test), `previewGrid.ts` (+ test),
  `conditionDraft.ts`, `organismDraft.ts`, `OrganismEditorLayout.tsx`, `SpeedControl.tsx`,
  `LadderSlider.tsx`, `CycleDigits.tsx`, `CycleCounter.tsx`, `PopulationPills.tsx`,
  `SimulationControlBar.tsx` (+ test), `FullscreenStage.tsx` (+ test),
  `BattleSimulationView.tsx` (+ test), `useSimulationHotkeys.ts`, `population.ts`,
  `simulationSpeed.ts`, `rafScheduler.ts`, `packages/**`, `themes.css`, `themeTokens.test.ts`,
  `theme.ts`, `playwright.config.ts`, `scripts/check-bundle-size.mjs`, `docs/project-context.md`.

### What NOT to build

- ❌ No second loop, scheduler, `stepGridBuffers` call, RNG or seed mint — the hook owns the run
  (AR-29; `deferred-work.md:514, 693-699`).
- ❌ No `<PreviewRun>` child, no `runMode` state, no `key` trick on the panel (FD1/FD2).
- ❌ No debounce, no rule-change restart of a running run, no "real-time" re-compile (FD2).
- ❌ No skipping of invalid rules, no `try/catch` around `compileSession` in the panel (FD4 — the
  adapter makes the throw unreachable; the hook's stance on `RuleCompilationError` stands).
- ❌ No real `contentHash` computation, no `crypto.subtle`, no canonical-JSON helper (FD5).
- ❌ No fake `schemaVersion`/`agingEnabled` on the session organism (FD6); no `name`/`dominance`
  props on the panel (FD7).
- ❌ No `<PopulationPills>`, no `<PopulationStats>`, no living-cell count (FD9 — recorded).
- ❌ No `<HotkeyHints>`, no `useSimulationHotkeys`, no `aria-keyshortcuts` (README; 3.19 FD8 (a)).
- ❌ No new `status` value, no "auto-paused" indicator, no live region for the extinction or the
  hint (3.15 FD4; 3.14 FD8).
- ❌ No `<GridSizeControl>`, no `resizeLive` — the preview is 30×20 (Decision A; UX-DR13).
- ❌ No edit to `SimulationControlBarProps`, to `<SimulationControlBar>`, to `<FullscreenStage>`,
  to the accessible names, to `<SpeedControl>`/`<LadderSlider>`/`<CycleDigits>` (AC9, AC10).
- ❌ No label shortening (`Play / Step / Stop`), no `overflow: hidden`, no font-size step on the
  cluster (FD8).
- ❌ No settings repository in the modal for FR-8.12 (the 4.14 FD5 reasoning; Story 6.9).
- ❌ No `readGridColors` in the panel; no literal colour fallback (4.14 FD7, AR-46).
- ❌ No `width: auto` on the dish box (4.14 AC8 — both canvases observe it).
- ❌ No `transition`, no new `--gol-*` token, no hex.
- ❌ No MUI `Button`/`Slider` — the reused components are `styled('button')`/`styled('input')`.
- ❌ No `document.querySelector` from components; no `scrollIntoView`.

### Open flags for the owner (not blockers — the story proceeds on the FD)

- **The design doc says the preview "updates in real-time as rules change" (`:515`) and asks for
  a 300 ms debounce (`:789`); the epic AC says "rule edits apply on the next run".** The epic
  governs (OQ-3, `:849-850`, is thereby answered). FD2 implements the AC; the design doc lines
  are recorded as amendment candidates, never edited from a story.
- **The mockup's preview transport is three uniform `.btn-sim` buttons in a 3-column grid and
  shows no speed slider; the design doc has the slider and the epic AC requires it.** FD8 ships
  the Run route's cluster (wrapped) and the slider. If the owner prefers the mockup's uniform
  look for the editor, that is a `compact` clothing change inside `<TransportControls>`, not a
  second implementation.
- **`useSimulation` now accepts `SimulationOrganism` (a `Pick`)** (FD6). A type-only change to
  an Epic 3 file; surfaced because it is the one edit outside `components/organisms/**` and
  `TransportControls.tsx`.
- **No population reading (FD9)** where spec §8/§3.12 name a compact one. Recorded with the
  staleness reason and a count-only candidate.

### References

- `docs/planning-artifacts/epics.md:1165-1175` (Story 4.15 ACs), `:1153-1163` (4.14),
  `:1177-1187` (4.16 — the save adapter this story's `parseRuleDraft` feeds), `:1189-1200`
  (4.17 — the self-reference case the adapter will one day take `selfId` for), `:49` (FR-2.7),
  `:69-74` (FR-4.2–4.7), `:123` (FR-8.12), `:197-202` (AR-29/31/32/33/34), `:238` (UX-DR13).
- `docs/planning-artifacts/architecture.md:184` (B.5), `:212-216` (D.1–D.3), `:348-349` (M2, M3).
- `docs/planning-artifacts/rfcs/RFC-005-application-state-modes-undo.md:177`;
  `RFC-004-simulation-rules-engine.md:654-656, 788-814`; `RFC-002-grid-rendering-technology.md:272`.
- `docs/planning-artifacts/component-tree-battle-page.md:255-269, 297-308, 375, 463-467`.
- `docs/planning-artifacts/ux-designs/ux-GameOfLife-2026-05-27/organism-editor-design.md:91-95,
  484-516, 615-631, 789-794, 846-850`.
- `docs/planning-artifacts/ux-designs/ux-GameOfLife-2026-05-27/clinical-lab-theme/organism-editor.html:770-815,
  1208-1217`.
- `docs/planning-artifacts/prds/prd-GameOfLife-2026-05-26/prd.md:212-216` (FR-2.7's two ACs: its
  own instance, the same engine and auto-stop).
- `docs/implementation-artifacts/4-14-preview-grid-drawing.md` (FD1–FD7, "The shape Story 4.15
  inherits", Review Findings); `epic-3/3-10-*` (the contract, FD2/FD3, obligations 1–6),
  `3-11-*` (AC9, FD3, FD4), `3-12-*` (FD1–FD6), `3-15-*` (FD1, FD4), `3-16-*` (FD1 (a) — the
  `disabled` addition precedent), `3-18-*` (FD7, FD8, FD11, the lane-gate proposal).
- `docs/implementation-artifacts/deferred-work.md:514, 693-699, 1289-1300, 1330-1340, 1637-1639,
  1707-1714, 1836-1839, 2101-2106`.
- `docs/implementation-artifacts/lane-gates.yaml`.
- `docs/project-context.md` — Framework rules (hot state in refs; three state categories; the
  Canvas grid outside MUI; `components/battle/` split by mode), Critical rules (no classes in the
  engine; grid dimensions are parameters; auto-stop is extinction-only; the evaluator cache is
  session-scoped; `fillStyle` + `var()` is a no-op), Testing rules (no gate on `apps/web`; never
  pixel-test; determinism; the Playwright viewport band), Code Quality (AR-46; `spec:check`;
  comments explain why), Commit gate.

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5 (claude-sonnet-5)

### Debug Log References

- `npm run ci:dev > ci.log 2>&1; echo $?` → **exit 0** (full chain: typecheck → lint →
  format:check → spec:check → boundary:check → test:coverage → build:standalone → bundle:check →
  bench → bench:check → e2e:chromium).
- Coverage (packages untouched, byte-identical shape to `main`): `@gol/domain` 100/100/100/100;
  `@gol/simulation` 100/100/100/100; `@gol/persistence` 99.19/96.07/100/100 (aggregate, unchanged
  from its own gate); `@gol/test-utils` 94.44/90.09/100/97.07 (aggregate, unchanged). `apps/web`
  has no gate (96.76/92.41/97.48/98.34, informational).
- Bundle (`check-bundle-size.mjs`, this branch's build): home 333.8 KB / 340 KB (6.2 headroom);
  `/battle` 309.4 KB / 310 KB (0.6 headroom); `/battle/new` 309.1 KB / 310 KB (0.9 headroom);
  `/organisms` 295.6 KB / 305 KB (9.4 headroom) — all four routes within ±0.5 KB of `main`
  (`main`: 333.8 / 309.3 / 309.1 / 295.6), no explanation needed there.
  - Editor lazy chunk (`grep -rl "Organism Color" .../chunks/*.js`, gzip): **main 12124 bytes →
    this branch 12772 bytes (+648 bytes / +0.63 KB gzip)** — far under the "roughly 8–15 KB"
    estimate on the single-chunk method. Investigated: Turbopack split the newly-shared
    `@gol/simulation` session/loop/strategy graph (already shipped by `/battle`) into **two NEW
    chunk files** rather than folding it into the modal's own chunk (branch has 33 chunk files vs
    `main`'s 31; the two new ones are 5403 and 5407 bytes gzip, ≈10.6 KB together). The whole
    app's total chunk-gzip weight grew **+7795 bytes (+7.6 KB)** net (some code moved OUT of
    previously editor-only chunks into the new shared ones, offsetting part of the addition).
    None of this touches any route's first-load JS (confirmed above) because it is the editor's
    lazy-loaded group, not eagerly loaded anywhere. Recorded per AC11's own anticipated caveat;
    `deferred-work.md`'s new 4-15 section has the full note. `budgetGzipKb` untouched.
- Bench (`bench:check`): frame at 100×60×20 = 7.521 ms (step 7.385 + repaint-diff 0.136) against
  the 16.667 ms budget — 9.146 ms / 54.9% headroom. `packages/simulation` step numbers are
  unchanged in shape from Story 3.7's baseline (no engine code touched).
- e2e:chromium (full suite): **225 passed, 1 skipped** (a pre-existing skip, unrelated to this
  story). `organisms.spec.ts` alone (re-run standalone, twice, for stability): **97/97 passed**
  both times, including the new `preview simulation (Story 4.15)` block (9 tests — corrected by the
  review; the Dev record originally said 10).
- `lsof -i :4173` before every e2e run: empty (port free) each time.

### Completion Notes List

- Implemented Tasks 1–7 exactly as specified in the story's Dev Notes/Tasks — `parseRuleDraft`,
  `previewOrganismFrom`, `SimulationOrganism`, `TransportControls`'s `compact`/`disabled`, the
  `<PreviewPanel>` run wiring (roster snapshot, canvas swap, transport/speed/cycle), the modal's
  one-prop wire-through, and the e2e block.
- Two test-strength issues found and fixed while driving `organisms.spec.ts`'s new block against
  the real build (not caught by the unit-test layer, since jsdom's canvas is a fake context):
  1. `[data-preview-cycle]` sits on `CycleBlock`, which contains BOTH the "Cycle" label and the
     digits — its full text is `"Cycle0000"`, not `"0000"`. Fixed the two e2e assertions that
     expected the bare digits.
  2. A colour-count oracle for "the dish went empty" using a hardcoded `<= 2` failed on real
     anti-aliased canvas output (measured 6, not the assumed background+grid-line pair). Replaced
     with a RELATIVE comparison (`< ` the drawn-cell count captured before Play) for the
     went-empty half, and dropped the symmetric "came back" numeric check in favour of the
     already-present `Clear` enabled/disabled oracle, which is exact and was already proven
     reliable by the 4.14 tests.
- `apps/web/lib/battle/useSimulation.test.ts`'s new `SimulationOrganism` roster case initially
  asserted `cycle === 1` without calling `play()` first (an oversight while transcribing the test)
  — the loop never runs while paused, so `cycle` stayed `0`. Added the missing `play()` call.
- No HALTs. No new dependencies. Every new file/function name matches the Project Structure Notes
  list. Two recorded deviations from the spec'd test text (added by the review): Task 4 test 22's
  rebuilt-renderer oracle is the `getContextSpy` call count, not "the recording map gains a
  context" — under `installPerCanvasRecording` the map is keyed by canvas element and a rebuild
  on the same run canvas returns the same context, so the spec's oracle could never fire; and Task
  2's `useSimulation.test.ts` edit also widened the shared `mount(grid, roster, h)` helper's
  parameter type from `readonly Organism[]` to `readonly SimulationOrganism[]` (the new case does
  not typecheck through it otherwise; `Organism[]` still assigns).

### File List

- New: `apps/web/lib/organisms/previewOrganism.ts`, `apps/web/lib/organisms/previewOrganism.test.ts`,
  `apps/web/components/battle/simulation/TransportControls.test.tsx`,
  `apps/web/test-support/frameDriver.ts` (review lift)
- Modified: `apps/web/lib/organisms/ruleDraft.ts`, `apps/web/lib/organisms/ruleDraft.test.ts`,
  `apps/web/lib/battle/useSimulation.ts`, `apps/web/lib/battle/useSimulation.test.ts`,
  `apps/web/components/battle/simulation/TransportControls.tsx`,
  `apps/web/components/organisms/editor/PreviewPanel.tsx`,
  `apps/web/components/organisms/editor/PreviewPanel.test.tsx`,
  `apps/web/components/organisms/editor/OrganismEditorModal.tsx`,
  `apps/web/components/organisms/editor/OrganismEditorModal.test.tsx`, `apps/web/e2e/organisms.spec.ts`,
  `docs/implementation-artifacts/deferred-work.md`, `docs/implementation-artifacts/sprint-status.yaml`;
  review lift only (helper import, no assertion touched): `apps/web/components/battle/simulation/BattleSimulationView.test.tsx`,
  `apps/web/components/battle/BattlePage.test.tsx`

### Change Log

- 2026-09-21 — Story file created (create-story): ACs decomposed, FD1–FD9 recorded (the at-rest
  roster snapshot, the `contentHash` stand-in, the hook's `Pick`, the reused cluster with
  `compact`/`disabled`, no population reading), precedent and spec map compiled; status →
  ready-for-dev.
- 2026-09-21 — Code review (opus, full mode): 0 decisions, 12 patch groups applied (test-strength
  and helper-lift patches, one source nit — `data-compact` no longer emitted as `"false"` on the
  existing callers), 1 defer, 18 dismissed; `installFrameDriver` lifted to `@/test-support`; e2e
  block verified on all four Playwright projects ×2. Status → done.
- 2026-09-21 — Implemented (dev-story): all 7 tasks complete, all ACs satisfied. `npm run ci:dev`
  exit 0 (typecheck/lint/format/spec-check/boundary-check/coverage/build/bundle/bench/bench-check/
  e2e:chromium all green — 225 e2e passed, 1843+109+407+82 unit tests passed). Two e2e
  test-strength fixes made while validating against the real build (see Completion Notes). Status
  → review.

Dev Model: sonnet   # follows the 3.10/3.11 contract as its second consumer with the two genuinely new pieces (the render-phase roster snapshot, the draft→organism adapter) pinned as exact code, tests and oracles; nothing here is a pattern later stories build on beyond `parseRuleDraft`, which is ten lines with a named inverse
Proposed lane gate: none
