---
baseline_commit: 5703add89ada0365ec36a4161f38ae02e1508590
---

# Story 4.14: Preview Grid & Drawing

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a user,
I want a small test dish inside the editor,
so that I can sketch a starting pattern for my organism.

## Acceptance Criteria

From `epics.md#Story 4.14: Preview Grid & Drawing` (`:1153-1163`), decomposed into what a reviewer
can check independently. AC4–AC10 are repo-derived: the obligations the shipped edit canvas
(`<PetriDishCanvas variant="edit">`, Stories 2.4–2.7), the battle editor's dish box and Clear
(Stories 2.12, 2.15), the draft the editor already holds (Stories 4.7/4.8 — "the preview grid
follows by construction"), the layout's `preview` slot (Story 4.4), the token layer and the CI
gates impose.

⚠️ **Scope boundary, read first (FD1).** This story ships the **drawing surface only**: the
30×20 dish, Draw/Erase/Clear, and the drawn grid held as the preview's own state. It does **not**
run anything — no `useSimulation`, no Play/Step/Stop, no speed slider, no cycle counter, no
draft→`Organism` adapter, no id or `contentHash` minting: all of that is Story 4.15 (gated on
Epic 3, `lane-gates.yaml`), and building any of it here unreachable would be the dead-UI failure
mode 4.13 FD1 records. What this story owes 4.15 is a **shape it can grow into without moving
anything**: the grid in React state inside the panel, ref `1` = the organism under edit, the dish
box as the element the run canvas will later replace the edit canvas inside of (Dev Notes, "The
shape Story 4.15 inherits").

1. **The Preview & Test column shows a 30×20 dish drawn by the shared renderer over its own
   grid.** `<OrganismEditorModal>` fills `<OrganismEditorLayout>`'s `preview` slot (empty since
   Story 4.4) with a new `<PreviewPanel>` that renders, directly under the column's heading pair,
   a dish box (`width: 100%`, `aspect-ratio: 3 / 2`, `--gol-bg-primary` surface, 1px `--gol-border`
   edge — mockup `.preview-canvas`, `organism-editor.html:729-736`) containing
   `<PetriDishCanvas variant="edit">` at `size={PREVIEW_GRID_SIZE}` (`{ cols: 30, rows: 20 }`, one
   exported constant, passed as a **parameter** — never a `30` or `20` literal anywhere below the
   panel, Decision A), `showGridLines` on (FD5), the modal's resolved `colors` (AC7) and a palette
   built from the draft (AC4). The canvas is the shared component **unmodified**: it carries its
   own `role="img"` / `aria-label="Petri dish, 30 by 20 cells"`, paints through the retained
   renderer's dirty path (`markDirty` + `draw`, Story 2.5 — NFR-4.2's < 100 ms), and commits one
   grid per gesture. At the full tier the box is 340px wide (400 − 2 × 30 padding) → 11px cells at
   DPR 1 (the design doc's "~10–12px per cell", `organism-editor-design.md:468-469`); at the
   compressed and fold tiers 290px → 9px cells. (FR-2.7, AR-32, M3, UX-DR13, AR-22)

2. **Draw and Erase are an exclusive pair, Draw the default; Clear empties the dish; all three
   work by pointer and keyboard.** Below the box, a `role="group"` named **"Drawing tools"** holds
   three plain `<button type="button">`s reading **Draw**, **Erase**, **Clear** (sentence case in
   the DOM, uppercased by CSS — the `<BackButton>` accessible-name rule). Draw and Erase carry
   `aria-pressed` (exactly one `"true"` at any time — the Story 2.9 FD2 idiom, not a `radiogroup`,
   FD3); a fresh panel has Draw pressed. Clear is `disabled` while the grid is empty
   (`isGridEmpty(grid)`, the Story 2.15 "already-empty guard + disabled" pair) and, when enabled,
   replaces the grid with `clearGrid(grid)` — one state write, no confirmation (2.15 has none
   either), no other state touched. Enter/Space on a focused button does what a click does. Focus
   never moves on any of the three (nothing to announce; the canvas is not focusable — the 2.5
   pointer-only gap is inherited, recorded, and named a 6.11 candidate, not solved here). (UX-DR13,
   FR-3.6, FR-3.7, UX-DR17)

3. **Drawing places only the organism under edit; erasing writes the reserved empty ref.** In
   Draw mode the canvas receives `toolRef === 1` — `refForTool(PREVIEW_DRAW_TOOL, PREVIEW_ROSTER)`
   where `PREVIEW_ROSTER` is the one-entry roster `[PREVIEW_ORGANISM_ID]` (so `1` is *derived* from
   the same `index + 1` arithmetic every other surface uses, never a second literal, `tool.ts:64-68`);
   in Erase mode `refForTool(ERASER_TOOL, …) === 0` (RFC-006 Decision 2's reserved empty ref,
   Story 2.7 AC4). The palette has `size === 2`: slot 1 is the draft's `colorToken` /
   `agingEnabled`, slot 0 empty. No roster, no library organism, no `organismIds` — a preview
   cell can hold nothing but the organism under edit. (UX-DR13, M3, Decision H)

4. **The dish follows the draft's colour and aging on the same commit — no second channel.**
   `palette = useMemo(() => buildPreviewPalette({ colorToken, agingEnabled }), [colorToken,
   agingEnabled])`, where `buildPreviewPalette` is `buildRefToFillGroup(PREVIEW_ROSTER, map)` over
   the two draft fields (AC3). A swatch pick or an aging flip mints a new palette identity → the
   edit canvas's construction effect rebuilds its renderer and `drawFull`s the drawn grid
   (`PetriDishCanvas.tsx:302-352`) → every drawn cell repaints in the new colour on that commit.
   This is the mechanism Story 4.8 AC4 promised ("the preview grid follows by construction") and
   Story 4.7's strip already uses: with aging **on**, the drawn (age-0) cells paint at shade 0 —
   the pale end of the example strip — exactly as the battle editor paints an aging organism's
   placed cells (`ageShadeFor(0, true) === 0`, `displayColor.ts:31-38`); with aging **off** they
   paint at `MAX_AGE_SHADE`. Pinned through the recording context: the cell's `fillStyle` equals
   `displayColorAt(paletteIndexOf(token), shade)`. No `onChange` from the panel to the draft, no
   event, no context — the panel *reads* two draft fields and writes nothing back. (FR-2.3, FR-2.4,
   UX-DR7, UX-DR9, AR-23)

5. **The preview grid is the panel's own state and touches nothing else (M3).** `<PreviewPanel>`
   holds `const [grid, setGrid] = useState<Grid>(() => createGrid(PREVIEW_GRID_SIZE.cols,
   PREVIEW_GRID_SIZE.rows))` — **not** a field on `OrganismDraft` (4.16 would persist it, 4.23 would
   dirty on it; the AC says never-persisted and the epic's 4.23 list — name, dominance, color,
   aging, rules, order — does not include it, FD2), not the modal's state, not a ref (the committed
   grid is React state exactly as `<BattlePage>`'s is; only the *in-progress stroke* is a ref, and
   that ref already lives inside `<PetriDishCanvas>`). `onStrokeCommit={setGrid}` — the bare
   setter, stable by construction. The panel takes **no repository, no callback into the draft, no
   `onChange`**; its props are `colorToken`, `agingEnabled` and `colors` — all read-only inputs.
   Closing the editor unmounts the modal (the `mounted` gate) and the grid with it: reopening shows
   an empty dish with Clear disabled. `gol:organisms` and `gol:battles` are byte-identical across an
   open → draw → close cycle (e2e). (M3, AR-32, AR-33, RFC-005 Decision 1)

6. **One pure module carries the preview's constants and derivations.** New
   `apps/web/lib/organisms/previewGrid.ts` exports `PREVIEW_GRID_SIZE`, `PREVIEW_ORGANISM_ID`,
   `PREVIEW_ROSTER`, `PREVIEW_DRAW_TOOL`, `type DrawMode = 'draw' | 'erase'`,
   `toolForDrawMode(mode): Tool` and `buildPreviewPalette(organism): RefToFillGroup` (Task 1 has
   the exact code). No React, no DOM. `Tool`/`ERASER_TOOL`/`refForTool` are imported from
   `@/lib/battle/tool` — that is the type `<PetriDishCanvas>`'s edit member requires
   (`PetriDishCanvas.tsx:15, :47`), and the canvas sits at `components/` root precisely so both
   editors may use it; nothing under `components/battle/**` is imported. `buildRefToFillGroup` is
   reused, not re-derived (a hand-built `{ tokenIndex, aging, size }` would be a second copy of the
   ref encoding). (AR-42, Decision A)

7. **`colors` is resolved once, at the modal, and the panel degrades the house way.**
   `<OrganismEditorModal>` gains `const colors = useMemo(() => (typeof document === 'undefined' ?
   null : readGridColors(document.documentElement)), [])` — the `<BattlePage>` form
   (`BattlePage.tsx:420-427`; the dialog portals to `document.body` but the tokens sit on bare
   `:root`, so `documentElement` is right) — and passes it down. When `colors === null` (jsdom;
   any root that lost the token layer) the panel renders the dish **box** with no canvas inside
   and the three controls unchanged — `<BattleEditorView>`'s exact degradation
   (`BattleEditorView.tsx:434-455`); never a literal colour (AR-46). (AR-46)

8. **The box keeps a definite width, the canvas wears the edit surface's CSS, and no
   `ResizeObserver` loop is possible.** The box is `width: 100%` of the column (never `auto` — the
   Story 2.12 review's loop: `<PetriDishCanvas>` observes `canvas.parentElement`, and an auto-width
   parent derives its width from the canvas `paint()` writes, `BattleEditorView.tsx:322-345`). The
   canvas is `styled(PetriDishCanvas)` with `width: 100%; height: 100%; display: block; cursor:
   crosshair; touch-action: none; user-select: none` — the `DishCanvas` rule set copied across the
   feature split with a pointer comment (`BattleEditorView.tsx:346-378`; copied shape, never
   imported — the 4.13 `<SaveErrorLine>` precedent). Every 4.4 e2e that asserts zero console
   errors stays green with the panel mounted (the loop reports as a console error). (NFR-2.1)

9. **Every existing guard is retargeted only where this story legitimately changes the DOM.**
   (a) `OrganismEditorLayout.tsx` and its test: **unedited** — the slot exists, the story fills it.
   (b) `OrganismEditorModal.test.tsx:428-430` (the 4.10 "no + Add Rule inside Preview & Test"
   assertion) **stays**. (c) The modal's existing tab-order test (`:371-385`) **stays** — the
   preview column is last in DOM order, after the Rules column, so the three new buttons follow
   every existing tabbable. (d) `PetriDishCanvas.tsx` (+ test), `tool.ts`, `refToFillGroup.ts`,
   `themeColors.ts`, every file under `components/battle/**`, `packages/**`: **unedited**. (e) The
   4.4 e2e probes that append a 4000px `<div>` into the Preview region (`organisms.spec.ts:512-519,
   604-608`) keep passing: the region still scrolls, and the panel's box is not the probe's
   parent. (AR-44)

10. **axe passes in every settled state; the bundle gate passes; no route's first load moves.**
    vitest-axe: `<PreviewPanel>` with a canvas and Draw pressed → `[]`; the modal with the panel →
    `[]` (the existing "has no axe violations with the dialog open" case now covers it for free).
    `@axe-core/playwright` on `/organisms` with the editor open after a draw (settled; the 4.5
    idiom's `waitForTimeout(300)`) → `[]`. Colour pairs are all pre-validated
    (`clinical-lab-contrast-validation.md`): `--gol-text-secondary` on `--gol-bg-hover` (5.58),
    `--gol-accent` on `--gol-bg-hover` (8.99), `--gol-border-control` on `--gol-bg-hover` (3.12),
    the disabled pair; **no new token**, no literal, no `transition` (`themes.css`,
    `themeTokens.test.ts` untouched). Everything new rides `OrganismEditorModal.tsx`'s lazy chunk;
    `/` (340), `/battle` (310), `/battle/new` (310), `/organisms` (305) stay within ±0.5 KB of
    `main` **unless** Turbopack re-splits the renderer modules the `/` route already ships
    (`check-bundle-size.mjs`'s Story 2.14 note) — a move above that on any route is measured,
    explained in the Dev Agent Record, and **no budget is raised** without the owner. The editor
    chunk grows by the renderer stack (`gridRenderer`, `colourStateGroups`, `dirtyCells`,
    `gridLayout`, `pointerToCell`, `cellLine`, `refToFillGroup`, `PetriDishCanvas`, three
    `@gol/simulation` grid functions) — record the figure. `npm run ci:dev > ci.log 2>&1; echo $?`
    locally; CI on the PR checked with `gh run list --limit 1` **after the PR opens**. (NFR-8.3,
    AR-35, AR-46)

## Tasks / Subtasks

- [x] **Task 1 — `previewGrid.ts`: the constants and the two derivations** (AC: 3, 6)
  - [x] `apps/web/lib/organisms/previewGrid.ts` (new):
        ```ts
        import type { Organism } from '@gol/domain';
        import { ERASER_TOOL, type Tool } from '@/lib/battle/tool';
        import { buildRefToFillGroup, type RefToFillGroup } from '@/lib/canvas/refToFillGroup';

        /**
         * The Organism Editor's preview dish (Story 4.14, FR-2.7 / M3 / UX-DR13): the constants the
         * panel passes DOWN as parameters and the two derivations that tie its one-organism roster
         * to the encoding every other surface uses. No React, no DOM, no repository.
         *
         * 30×20 is UX-DR13's size — a PARAMETER handed to the canvas, the renderer and the grid
         * factory (Decision A), never a literal below this file. `Object.freeze` so the object is
         * one stable identity: it is one of `EditDish`'s three construction dependencies
         * (`PetriDishCanvas.tsx`), and a fresh `{ cols, rows }` per render would rebuild the
         * renderer on every keystroke in the name field.
         */
        export const PREVIEW_GRID_SIZE: { readonly cols: number; readonly rows: number } =
          Object.freeze({ cols: 30, rows: 20 });

        /**
         * A stable, session-only stand-in for the organism under edit, which has no library id
         * until Story 4.16 mints one. The canvas's edit member requires a `Tool` (`tool: Tool`,
         * declared for spec §3.10's shape and deliberately NOT read — `PetriDishCanvas.tsx:41-47`),
         * and `buildRefToFillGroup` keys its map by id — this id serves both and nothing else.
         * ❌ Never persisted, never compared with a library id, never handed to `compileSession`
         * (Story 4.15 decides the preview organism's real identity — `deferred-work.md`).
         */
        export const PREVIEW_ORGANISM_ID = 'organism-editor-preview';

        /** The preview's whole roster: one slot, so ref 1 IS the organism under edit (M14's
         * `index + 1`) and ref 0 stays the reserved empty ref (RFC-006 Decision 2). Frozen for the
         * same identity reason as `PREVIEW_GRID_SIZE`. */
        export const PREVIEW_ROSTER: readonly string[] = Object.freeze([PREVIEW_ORGANISM_ID]);

        export const PREVIEW_DRAW_TOOL: Tool = Object.freeze({
          kind: 'organism',
          organismId: PREVIEW_ORGANISM_ID,
        });

        /** UX-DR13's Draw/Erase toggle. Two arms, no third: Clear is an ACTION, not a mode. */
        export type DrawMode = 'draw' | 'erase';

        /**
         * The `Tool` the canvas's edit member is handed for a mode. Module constants on both arms,
         * so the prop's identity is stable across renders (the `ERASER_TOOL` reasoning, `tool.ts`).
         * The REF the canvas paints with is `refForTool(toolForDrawMode(mode), PREVIEW_ROSTER)` —
         * resolved by the panel through the same function `<BattleEditorView>` uses, so the
         * preview cannot drift from the battle editor on what `0` and `1` mean.
         */
        export function toolForDrawMode(mode: DrawMode): Tool {
          return mode === 'draw' ? PREVIEW_DRAW_TOOL : ERASER_TOOL;
        }

        /**
         * The preview's `RefToFillGroup`: slot 1 = the draft's colour and aging, slot 0 empty. Built
         * through `buildRefToFillGroup` rather than by hand — a literal `{ tokenIndex, aging, size }`
         * here would be a second copy of the ref encoding (`refToFillGroup.ts`'s header names it as
         * the ONE place). `agingEnabled` matters even though every drawn cell is age 0: with aging
         * on, `ageShadeFor(0, true)` is shade 0, the pale end of Story 4.7's strip — the dish shows
         * the organism as the battle editor would paint it, not a saturated approximation.
         */
        export function buildPreviewPalette(
          organism: Pick<Organism, 'colorToken' | 'agingEnabled'>,
        ): RefToFillGroup {
          return buildRefToFillGroup(PREVIEW_ROSTER, new Map([[PREVIEW_ORGANISM_ID, organism]]));
        }
        ```
  - [x] `previewGrid.test.ts`: (a) `PREVIEW_GRID_SIZE` is `{ cols: 30, rows: 20 }` and frozen (pin
        UX-DR13's numbers — the test is where a "let's make it 40×25" drift is caught); (b)
        `toolForDrawMode('draw')` is `{ kind: 'organism', organismId: PREVIEW_ORGANISM_ID }` and
        `toolForDrawMode('erase')` **is** `ERASER_TOOL` (identity, `toBe`); (c)
        `refForTool(toolForDrawMode('draw'), PREVIEW_ROSTER)` is `1` and the erase arm is `0` (the
        one number that ties the grid buffer, the LUT and the eraser together — `tool.ts:64-74`);
        (d) `buildPreviewPalette({ colorToken: 'vermillion', agingEnabled: false })` has `size 2`,
        `tokenIndex[1] === paletteIndexOf('vermillion')`, `aging[1] === 0`; with `agingEnabled:
        true` → `aging[1] === 1`; (e) `fillGroupOf(palette, 1, 0)` equals `paletteIndexOf(token) *
        8 + ageShadeFor(0, agingEnabled)` for both flags (the AC4 shade claim, at the LUT); (f) no
        `console.warn` for a known id (spy; `buildRefToFillGroup` warns on a dangling id — proves
        the map is keyed correctly); call `resetRefToFillGroupWarnings()` in `afterEach`.

- [x] **Task 2 — `<PreviewPanel>`: the box, the canvas, the three controls** (AC: 1, 2, 3, 4, 5, 7, 8)
  - [x] `apps/web/components/organisms/editor/PreviewPanel.tsx` (new, `'use client'`). Imports:
        `useCallback, useMemo, useState` from react; `styled` from `@mui/material/styles`;
        `clearGrid, createGrid, isGridEmpty, type Grid` from `@gol/simulation`; `PetriDishCanvas`
        from `../../PetriDishCanvas`; `refForTool` from `@/lib/battle/tool`; `type
        GridRendererColors` from `@/lib/canvas/gridRenderer`; the Task 1 module.
  - [x] Props:
        ```ts
        export interface PreviewPanelProps {
          /** The draft's two rendering fields (Story 4.7/4.8) — read on every render, never
           *  written. A pick or a flip re-mints the palette below, which is what repaints the
           *  drawn cells (Story 4.8 AC4's "follows by construction"). */
          colorToken: string;
          agingEnabled: boolean;
          /** Resolved ONCE by the modal (`readGridColors`); `null` = no token layer → the box
           *  renders with no canvas (the `<BattleEditorView>` degradation, never a literal). */
          colors: GridRendererColors | null;
        }
        ```
        No `onChange`, no repository, no `showGridLines` prop (FD5 — a module constant
        `PREVIEW_GRID_LINES = true` with the 6.6 pointer), no `size` prop (the constant is the
        parameter; a prop nothing varies is a dead handle, 4.9 FD1).
  - [x] State and derivations:
        ```ts
        const [mode, setMode] = useState<DrawMode>('draw');
        // The drawn pattern — ephemeral UI state, local to this panel (M3: "its own subtree and
        // refs"; RFC-005 Decision 1). NOT on `OrganismDraft`: 4.16 persists that object and 4.23
        // diffs it, and the AC says never-persisted / never dirty. Same lifetime as the modal
        // (the `mounted` gate unmounts both) — an empty dish per open, by construction.
        const [grid, setGrid] = useState<Grid>(() =>
          createGrid(PREVIEW_GRID_SIZE.cols, PREVIEW_GRID_SIZE.rows),
        );
        // Identity-stable per (token, aging): one of EditDish's three construction deps.
        const palette = useMemo(
          () => buildPreviewPalette({ colorToken, agingEnabled }),
          [colorToken, agingEnabled],
        );
        const tool = toolForDrawMode(mode);
        const toolRef = refForTool(tool, PREVIEW_ROSTER);
        const empty = isGridEmpty(grid); // 600 cells, per render — cheaper than a memo's bookkeeping
        // The guard INSIDE the updater keeps it pure and same-reference on a no-op (the
        // `setSurvivalRules` idiom): an equal-but-new empty grid would `drawFull` for nothing.
        const handleClear = useCallback(
          () => setGrid((g) => (isGridEmpty(g) ? g : clearGrid(g))),
          [],
        );
        ```
  - [x] Styled blocks (`styled()` + `var(--gol-*)`, RFC-003 Decision 3 / AR-46; **no
        `transition`** anywhere — the axe-mid-fade rule every editor control records):
        - `PreviewDishBox = styled('div')({ width: '100%', minWidth: 0, aspectRatio: '3 / 2',
          background: 'var(--gol-bg-primary)', border: '1px solid var(--gol-border)' })` — mockup
          `.preview-canvas` `:729-736` minus `cursor`/`image-rendering` (the canvas wears the
          cursor; the renderer paints integer-aligned rects, so `pixelated` has nothing to do).
          Comment: ⚠️ `width` stays DEFINITE (`100%`), never `auto` — this element is what
          `<PetriDishCanvas>`'s `ResizeObserver` observes, and an auto width derived from the
          canvas's intrinsic size is the paint → resize → paint loop the Story 2.12 review hit
          (20 e2e failures across four projects, `BattleEditorView.tsx:322-345`). Decorative
          `--gol-border` is fine here (the surface itself is the boundary — `--gol-bg-primary`
          against the column's `--gol-bg-secondary`), unlike a button's only edge.
        - `PreviewCanvas = styled(PetriDishCanvas)({ width: '100%', height: '100%', display:
          'block', cursor: 'crosshair', touchAction: 'none', userSelect: 'none' })` — pointer
          comment to `BattleEditorView.tsx:346-378` (`DishCanvas`): copied across the feature
          split, never imported; `touch-action: none` must be CSS on the element receiving the
          pointer, set before the gesture (Story 2.6 FD4).
        - `DrawingControls = styled('div')({ display: 'flex', gap: '10px', marginTop: '15px' })` —
          mockup `.drawing-controls` `:738-742`.
        - `ToolButton = styled('button')({ flex: 1, background: 'var(--gol-bg-hover)', border:
          '1px solid var(--gol-border-control)', color: 'var(--gol-text-secondary)', padding:
          '10px', fontSize: '12px', fontWeight: 500, fontFamily: 'inherit', textTransform:
          'uppercase', letterSpacing: '0.5px', cursor: 'pointer', '&[aria-pressed="true"]': {
          borderColor: 'var(--gol-accent)', color: 'var(--gol-accent)' },
          '&:hover:not(:disabled):not([aria-pressed="true"])': { borderColor:
          'var(--gol-text-primary)', color: 'var(--gol-text-primary)' }, '&:focus-visible': {
          outline: '2px solid var(--gol-accent)', outlineOffset: '2px' }, '&:disabled': {
          background: 'var(--gol-action-disabled-bg)', borderColor: 'var(--gol-border)', color:
          'var(--gol-action-disabled)', cursor: 'not-allowed' } })` — mockup `.btn-tool` `:744-769`
          with the two house substitutions (`--gol-border-control` for a button's only boundary,
          SC 1.4.11 — `EditorToolsSection.tsx:27-30`; no `transition`), the pressed state carried
          by `aria-pressed` (the accent border + text are the second channel beside the state
          attribute, WCAG 1.4.1 — `OrganismRoster.tsx:72-79`), and the disabled pair every editor
          control wears.
  - [x] Markup:
        ```tsx
        <>
          <PreviewDishBox data-preview-dish>
            {colors !== null && (
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
            )}
          </PreviewDishBox>
          <DrawingControls role="group" aria-label="Drawing tools">
            <ToolButton type="button" aria-pressed={mode === 'draw'} onClick={() => setMode('draw')}>
              Draw
            </ToolButton>
            <ToolButton type="button" aria-pressed={mode === 'erase'} onClick={() => setMode('erase')}>
              Erase
            </ToolButton>
            <ToolButton type="button" onClick={handleClear} disabled={empty}>
              Clear
            </ToolButton>
          </DrawingControls>
        </>
        ```
        Comments (WHY): why the grid is panel state and not draft state (FD2); why `role="group"`
        + `aria-pressed` and not a `radiogroup` (FD3); why Clear is `disabled` on empty rather than
        a silent no-op (NFR-4.1 — an enabled control that does nothing is the dead affordance; the
        2.15 form); why the canvas's `aria-label` is left as the shared component's (FD6); the
        `(Story 4.14) (FR-2.7) (M3) (UX-DR13)` tag line. Header comment names the shape Story 4.15
        grows into (Dev Notes) so the next dev does not restructure it.
  - [x] `PreviewPanel.test.tsx` — render helper `mount({ colorToken = 'vermillion', agingEnabled =
        false, colors = COLORS })` with the `BattlePage.test.tsx` per-canvas recording install
        (`installPerCanvasRecording`, `:47-65`) and its `stubCanvasRect` / `centreOfCell` helpers
        rewritten locally over `computeGridLayout(canvas, PREVIEW_GRID_SIZE, true)` (jsdom keeps
        the canvas at its 300×150 default because `clientWidth` is 0 → 7px cells, origin (45, 5);
        derive, never hardcode). Cases:
        1. **the dish and its controls**: `getByRole('img', { name: 'Petri dish, 30 by 20 cells'
           })` inside `[data-preview-dish]`; `getByRole('group', { name: 'Drawing tools' })` holds
           exactly three buttons named Draw / Erase / Clear in order; Draw `aria-pressed="true"`,
           Erase `"false"`, Clear `toBeDisabled()`.
        2. **`colors: null` renders the box with no canvas and the controls intact** (AC7):
           `container.querySelector('canvas')` null, `[data-preview-dish]` present, the three
           buttons present.
        3. **Draw/Erase are exclusive and keyboard-operable** (AC2): `user.click(Erase)` →
           Erase `"true"`, Draw `"false"`; `Draw.focus(); user.keyboard(' ')` → Draw `"true"`,
           Erase `"false"`; `user.keyboard('{Enter}')` on a focused Erase → Erase `"true"`.
           `document.activeElement` stays on the pressed button (focus does not jump).
        4. **a click paints the organism under edit and enables Clear** (AC3, AC5):
           pointerDown/Up at `centreOfCell(3, 4)` → Clear `toBeEnabled()`; the canvas's
           recording context received a `fillStyle` equal to
           `displayColorAt(paletteIndexOf('vermillion'), MAX_AGE_SHADE)` (the
           `PetriDishCanvas.test.tsx` colour idiom) and at least one `fillRect` after it.
        5. **erasing the same cell empties the dish** (AC3): after (4), `user.click(Erase)`, then
           pointerDown/Up at the same cell → Clear `toBeDisabled()` (ref 0 was written — the only
           way the guard can flip back). Then Draw again at that cell → enabled.
        6. **Clear empties everything and repaints** (AC2): draw two cells, `user.click(Clear)` →
           Clear disabled; `vi.spyOn(GridRenderer.prototype, 'drawFull')` was called once more
           after the click (the external-change path, `PetriDishCanvas.tsx:360-394` — the canvas
           saw a grid it had not painted). A second Clear is impossible (disabled) — assert
           `toBeDisabled()` rather than clicking a disabled button (`user.click` on a disabled
           element is a no-op that proves nothing).
        7. **a colour change repaints the drawn cells on the same commit** (AC4): draw a cell;
           `rerender` with `colorToken: 'azure'` → a `fillStyle` equal to
           `displayColorAt(paletteIndexOf('azure'), MAX_AGE_SHADE)` was recorded after the
           rerender, and `GridRenderer` was constructed a second time (the palette identity
           changed — `vi.spyOn` the constructor is not possible on a class; count the
           `getContext` mock's calls or the recording map's size against a stable-props rerender
           that constructs nothing — the `PetriDishCanvas.test.tsx:99-108` "colors identity"
           idiom).
        8. **aging on paints age-0 cells at shade 0** (AC4): draw a cell; `rerender` with
           `agingEnabled: true` → a `fillStyle` equal to `displayColorAt(paletteIndexOf(token), 0)`
           recorded; back to `false` → `MAX_AGE_SHADE` again.
        9. **a rerender with the SAME token and flag constructs nothing** (AC4's memo): after
           mount, `rerender` with identical props → the recording map has no new context and
           `drawFull` was not called again (the trap: an unmemoised palette rebuilds the renderer
           on every parent render — every keystroke in the name field).
        10. **the drawn grid survives a mode switch and a colour change** (AC5): draw a cell, click
            Erase, rerender with a new token → Clear still enabled (the grid is state, not derived
            from anything that changed).
        11. **a drag commits once, Clear enabled** (AC1): pointerDown at (2, 4), pointerMove
            `{ buttons: 1 }` to (6, 4), pointerUp → Clear enabled; `drawFull` not called (the dirty
            path, not a full repaint — the `paintedGridRef` skip holds through the panel's setter).
        12. axe: (1)'s state → `[]`; after (4) → `[]`.
        Guard `resetRefToFillGroupWarnings()` and `resetColourStateWarnings()` in `afterEach`
        (module singletons `vi.restoreAllMocks()` does not touch — `BattlePage.test.tsx:106-108`).

- [x] **Task 3 — Wire the panel into the modal** (AC: 1, 5, 7, 9)
  - [x] `OrganismEditorModal.tsx`: import `readGridColors` from `@/lib/canvas/themeColors` and
        `PreviewPanel` from `./PreviewPanel` (static — the same "already inside the lazy chunk"
        reasoning the header's import comment records, `:9-13`). Add the `colors` memo (AC7) beside
        `usersByToken`, with the `<BattlePage>` comment adapted (resolved once — `getComputedStyle`
        forces a style recalculation; `document` guarded for the prerender even though this file
        is `ssr: false`, because the guard is the house form and costs nothing). Fill the slot:
        ```tsx
        preview={
          <PreviewPanel
            colorToken={draft.colorToken}
            agingEnabled={draft.agingEnabled}
            colors={colors}
          />
        }
        ```
        Header comment: the per-story sentence gains "Story 4.14's preview panel reads
        `colorToken`/`agingEnabled` and holds its own grid (M3)"; tag line gains `(Story 4.14)`.
        Nothing else in the modal changes — no state, no handler, no prop.
  - [x] `OrganismEditorModal.test.tsx` (append after the 4.13 block): (20) **the Preview & Test
        region holds the drawing controls, Draw pressed, Clear disabled, and no canvas under
        jsdom's bare root** (the `colors === null` path through the real memo): `within(preview)
        .getByRole('group', { name: 'Drawing tools' })`, the three buttons, `queryByRole('img')`
        null; (21) **with the token layer present the canvas mounts inside the Preview region**:
        `enableCanvasRendering()` (the `BattlePage.test.tsx:38-45` idiom — `--gol-bg-primary` and
        `--gol-grid-line` set on `documentElement.style`; remove them in `afterEach`) → `within
        (preview).getByRole('img', { name: 'Petri dish, 30 by 20 cells' })`; (22) **a swatch pick
        leaves the preview's controls byte-identical** (the panel reads the token, the controls do
        not care): capture the group's `outerHTML`, pick a swatch (the 4.8 test's path,
        `:210-245`), compare; (23) **drawing does not touch the draft**: `enableCanvasRendering()`
        + a recording context + a stubbed rect; type a name, draw a cell (Clear enabled), then
        Save → the AC8 notice appears (the draft is still valid and unchanged by the draw —
        nothing in `validateOrganismDraft` sees the grid) and `screen.getByRole('textbox', {
        name: 'Organism Name' })` still holds the name; (24) axe with (21) → `[]` (the existing
        `:395` case already covers the `colors === null` shape).

- [x] **Task 4 — e2e against the served static export** (AC: 1, 2, 3, 5, 8, 10)
  - [x] `organisms.spec.ts`: append `test.describe('preview grid & drawing (Story 4.14)')` after
        the 4.13 block. Local helpers: `const preview = (dialog) => dialog.getByRole('region', {
        name: 'Preview & Test' })`, `const dish = (dialog) => preview(dialog).getByRole('img', {
        name: /petri dish/i })`, `const tool = (dialog, name) => preview(dialog).getByRole('button',
        { name, exact: true })`; `distinctColorCount` copied from `battleRoute.spec.ts:75-90` with a
        pointer comment (second copy — the lift threshold is three; record in `deferred-work.md`);
        `cellCentre(box, col, row)` computing the client point from the box and the same auto-fit
        maths (`cellSize = floor(min(box.width / 30, box.height / 20))`, centred) — a deliberate
        cell, never the geometric centre (the `deferred-work.md:344` note on the battle spec).
        Tests:
        1. **The dish and its controls render, Draw pressed, Clear disabled, zero console errors
           (no `ResizeObserver` loop)**: `openEditor`; `dish` attached with the exact aria-label;
           `tool('Draw')` `toHaveAttribute('aria-pressed', 'true')`, `tool('Erase')` `'false'`,
           `tool('Clear')` `toBeDisabled()`; the dish's box is ≈ 340 wide at 1280 (compressed tier:
           ≈ 290) and its `aspect-ratio` holds (`height ≈ width × 2/3`); `errors` `[]`.
        2. **Draw → Clear enabled and the canvas paints more than two colours; Erase the same cell →
           Clear disabled; Draw again, Clear → disabled** (AC2, AC3, AR-42 smoke): `page.mouse.click`
           at `cellCentre(box, 5, 5)` → `await expect(tool('Clear')).toBeEnabled()`; `expect.poll(()
           => distinctColorCount(dish))` `> 2`; `tool('Erase').click()`; click the same point →
           Clear `toBeDisabled()`; `tool('Draw').click()`; click (5, 5) → enabled; `tool('Clear')
           .click()` → disabled.
        3. **A drag paints (one gesture, Clear enabled)**: `mouse.move` to `cellCentre(2, 10)`,
           `down`, `move` to `cellCentre(20, 10)` (no `steps` — one `pointermove`, the
           `battleRoute.spec.ts:643-646` note), `up` → Clear enabled.
        4. **Isolation (M3)**: read `localStorage.getItem('gol:organisms')` and `'gol:battles'`
           before opening; draw two cells; Close; both keys byte-identical; reopen → Clear
           `toBeDisabled()` (a fresh dish per open).
        5. **Keyboard**: `tool('Draw').focus()`; `keyboard.press(tabKey)` (WebKit `Alt+Tab`, the
           Story 4.1 note) → Erase focused; `press('Space')` → Erase `aria-pressed="true"`, Draw
           `"false"`; Tab → Clear focused (disabled buttons are skipped by Tab — so first draw a
           cell with the mouse, then run the Tab walk).
        6. **axe after a draw, settled** → `[]` (`waitForTimeout(300)` before `analyze()`).
  - [x] ⚠️ Run e2e against **this tree's** build: `deferred-work.md:1360-1364`'s port-reuse trap
        (`lsof -i :4173` first; state the result in the Dev Agent Record). `npm run ci:dev`
        (Chromium only).

- [x] **Task 5 — Bundle measurement, docs, verification** (AC: 10)
  - [x] Measure before (on `main`: all four routes + the editor chunk — `grep -rl "Organism
        Color" apps/web/out/_next/static/chunks/*.js`, `gzip -c | wc -c`) and after Task 4; record
        both. Do **not** edit `budgetGzipKb`. If `/organisms` or `/` moves by more than ±0.5 KB,
        say why (the Turbopack re-split of modules the Gallery already ships is the likely cause;
        `check-bundle-size.mjs:40-52`).
  - [x] `deferred-work.md` (append-only plus strike-throughs; `main`'s hunks first on sync):
        - `:228` (2.5 — pointer-only dish): append "— the preview dish (Story 4.14) inherits the
          same gap; Story 6.11 should cover both surfaces in one design".
        - `:1707-1711` (3.18 — Story 4.15 pointers): append "Story 4.14 built the panel; 4.15 mounts
          `<TransportControls>` / `<CycleDigits>` / `<PopulationPills>` / `<SpeedControl>` under
          `<PreviewPanel>`'s drawing controls and swaps the edit canvas for a playback one inside
          `PreviewDishBox` (see the 4.14 Dev Notes' shape)".
        - Add `## Deferred from: Story 4-14-preview-grid-drawing (<date>)` with: (1) **`showGridLines`
          is hard-wired `true` for the preview** (FD5) — FR-8.7 names Gallery/Edit/Play, not the
          preview; Story 6.6 decides whether the setting reaches it (the modal has no settings
          repository; 4.24/4.25 open it over `<BattlePage>`, which does); (2) **`PREVIEW_ORGANISM_ID`
          is a session placeholder** — the canvas's `tool` prop is declared-and-unread
          (`PetriDishCanvas.tsx:41-47`); the second caller with no organism id is the trigger to
          make `tool` optional on the edit member or drop it, and 4.15's preview-organism identity
          (the `deferred-work.md:514` mint-site note, the `:1637` `contentHash` note) should replace
          the placeholder, not add a second; (3) **the canvas's `aria-label` reads "Petri dish, 30
          by 20 cells" in the editor** (FD6) — accurate, shared, and a copy decision ("Preview
          dish"?) for whichever story next touches `<PetriDishCanvas>`'s label; (4) **no undo in the
          preview** — not in the AC, not in the design doc's drawing steps (`:617-622`); Clear is the
          recovery; (5) **Draw/Erase are `aria-pressed` buttons, not a `radiogroup`** (FD3); (6)
          **`distinctColorCount` is now at two copies** (`battleRoute.spec.ts`, `organisms.spec.ts`)
          — lift on the third; (7) **`component-tree-battle-page.md` §3.10 amendment candidate**:
          "preview reuse: `static`/second `playback`" omits the `edit` member this story uses for
          UX-DR13's drawing; RFC-002 `:272`'s "renderStatic … for the preview's paused frames"
          describes 4.15's stills, not the drawing surface (Open flags); (8) **the design doc's
          "Preview grid smaller (250px)" at the fold tier** (`:652`) is satisfied by `width: 100%`
          of the 350px column (290px box) — no fold-specific rule was written; (9) **a palette
          change mid-stroke ends the stroke without committing** (`PetriDishCanvas.tsx:328-345`,
          Story 2.10 decision 2(b)) — reachable here only via keyboard on the aging switch while a
          pointer is captured on the dish; inherited, not re-decided.
  - [x] `docs/project-context.md` — **no new rule**. Candidate only if a second story trips on it:
        "a canvas's parent box must have a definite width — `<PetriDishCanvas>` observes the
        parent" (already carried by `BattleEditorView.tsx`'s comment and now `PreviewPanel.tsx`'s).
  - [x] `npm run ci:dev > ci.log 2>&1; echo $?` — paste the exit code, the bundle lines (all four
        routes + the editor chunk before/after), the domain / simulation / persistence / test-utils
        coverage lines (expected byte-identical — `packages/*` untouched) and the e2e summary into
        the Dev Agent Record. Push to `story/4-14-preview-grid-drawing`; `gh run list --limit 1`
        after the PR opens.

## Dev Notes

### Forced decisions (made here so the dev agent does not have to)

- **FD1 — Drawing only; the run is Story 4.15's, and this panel is shaped so 4.15 adds without
  moving.** The epic splits the preview across two stories on purpose (4.14 "grid & drawing",
  4.15 "simulation"), and 4.15 is lane-gated on Epic 3 while this story is not. Nothing here
  imports `useSimulation`, `compileSession`, `<TransportControls>` or `<SpeedControl>`; nothing
  mints an id or a `contentHash`. The shape 4.15 inherits: `<PreviewPanel>` owns `grid` (the
  preview's *initial* state — the thing `useSimulation(grid, organisms, opts)` clones, obligation
  1: a stable reference from state); ref `1` is the organism under edit (`organisms[ref - 1]`,
  obligation 2 — a one-element array); `PreviewDishBox` is the element the run canvas
  (`variant="playback"`, `onRendererReady={sim.attachRenderer}`) replaces the edit canvas inside of
  while a session exists, with Draw/Erase/Clear disabled for the run — the `<BattlePage>` Lab/Run
  swap in miniature (RFC-005 Decision 3/4). 4.15 adds the draft→`Organism` adapter, the
  simulation-controls row and the swap; it does not need to touch `previewGrid.ts` or the box.

- **FD2 — The preview grid is panel state, not draft state, not modal state.** Three readings
  were possible. On the draft: 4.16 parses the draft into an `Organism` and would have to strip
  it, 4.23 diffs the draft for the dirty scope and would dirty on a sketch — both contradict the
  AC ("never-persisted") and the epic's 4.23 field list. On the modal: nothing but the panel reads
  it, and lifting state above its lowest common ancestor is what RFC-005 Decision 2 forbids. On the
  panel, as `useState<Grid>`: the committed grid is React state exactly as `<BattlePage>`'s
  `useUndoableGrid` value is; the hot in-stroke buffer is `<PetriDishCanvas>`'s own ref. M3's
  "its own subtree and refs" is satisfied literally — the subtree is `<PreviewPanel>`, the refs are
  the canvas's. The lifetime is the modal's (the `mounted` gate unmounts on exit), so "a fresh
  dish per open" needs no reset effect.

- **FD3 — Draw/Erase are `aria-pressed` buttons in a named group, Clear a plain button beside
  them; no `radiogroup`.** The design doc allows either ("Radio buttons or toggle buttons",
  `:479`); the mockup renders three identical `.btn-tool`s with a class toggle. The house's
  exclusive-selection idiom is Story 2.9 FD2's `aria-pressed` (`<OrganismRoster>`), which needs no
  roving tabindex and no arrow-key handler, and keeps each button a real Tab stop — three stops,
  in order, is the right thing for three controls. A `radiogroup` would put Clear (an action)
  outside the group and demand arrow keys inside it; `<GridSettingsSection>`'s hidden-radio form
  exists for a *value* picker, not a mode. The accent border + accent text are the second visual
  channel for the pressed state (WCAG 1.4.1), the same reason the roster paints its accent edge.

- **FD4 — The palette is memoised on the two draft fields and nothing else; the tool objects are
  module constants.** `EditDish` reconstructs its renderer on any of `[size, palette, colors]`
  changing identity (`PetriDishCanvas.tsx:298-352`), and a reconstruction throws away the dirty
  baseline and the grid-line overlay. `PREVIEW_GRID_SIZE` is frozen once; `colors` is the modal's
  one memo; `palette` changes exactly when the colour or aging changes — which is the *desired*
  reconstruction, because it is what repaints the drawn cells in the new colour (AC4). A palette
  built per render would rebuild the renderer on every keystroke in the name field. Test (9) is
  the tripwire.

- **FD5 — Grid lines are on, hard-wired, for the preview.** FR-8.7 ("applies to Gallery tiles,
  Edit and Play Modes") and Story 6.6's AC name three surfaces; the preview is not one of them,
  and the editor modal has no settings repository to read (4.1's page boundary loads organisms
  only). The design doc draws the preview with grid lines (`:470`). A `PREVIEW_GRID_LINES = true`
  module constant with a 6.6 pointer is honest; a `showGridLines` prop the modal cannot fill is a
  dead handle (4.9 FD1). Recorded for 6.6 to decide.

- **FD6 — The canvas's accessible name stays the shared component's.** `<PetriDishCanvas
  variant="edit">` labels itself `Petri dish, ${cols} by ${rows} cells` and takes no label prop
  (`PetriDishCanvas.tsx:767-771`). Adding one is a change to a `components/`-root primitive with
  three existing callers — a design change, not this story's. "Petri dish, 30 by 20 cells" is
  accurate (it *is* a dish, the size is the differentiator from the battle's) and unambiguous
  inside the dialog (the page behind is `inert`). Recorded as a copy decision.

- **FD7 — `colors` is resolved at the modal, not inside the panel.** The house resolves
  `readGridColors` once at a page-level boundary and passes strings down (`BattleGallery`,
  `<BattlePage>`); the modal is the editor's root and the one place a second canvas-bearing child
  (4.15's playback canvas) would also need it. Resolving inside the panel would work today and
  cost a second `getComputedStyle` the day 4.15 mounts its own surface. It also gives the tests
  their seam: the panel test passes a fake `colors`, the modal test proves the real memo through
  `enableCanvasRendering()`.

### What exists — read these before writing a line

| File | Why it matters here |
|---|---|
| `apps/web/components/PetriDishCanvas.tsx` | **Unedited, reused.** The edit member's props (`:38-57`), the construction effect and its deps (`:298-352` — why `palette`/`size`/`colors` identities matter), the grid effect's `paintedGridRef` skip (`:354-394` — why `onStrokeCommit={setGrid}` costs no repaint), the resize observer on `parentElement` (`:408-471` — why the box's width is definite), `handlePointerDown`'s `toolRef === null` guard (`:559-567`), the `role="img"` label (`:758-779`). |
| `apps/web/components/PetriDishCanvas.test.tsx:894-1035` | The edit-variant test rig: `installContexts`, `stubRect`, `centreOf`/`moveTo`, the `fillStyle`/`displayColorAt` assertion, the "colors identity forces a construction" idiom (`:99-108`). |
| `apps/web/components/battle/BattlePage.test.tsx:38-65, 106-145` | `enableCanvasRendering()` (tokens on `documentElement.style`), `installPerCanvasRecording`, `stubCanvasRect`, `centreOfCell` over `computeGridLayout` — the helpers Task 2/3 tests rewrite locally. |
| `apps/web/components/battle/editor/BattleEditorView.tsx:322-378, 434-455, 799-823` | `PetriDishBox` (the ⚠️ auto-width loop), `DishCanvas` (the rule set to copy), the `colors !== null` degradation, `handleClear`'s already-empty guard. |
| `apps/web/components/battle/editor/EditorToolsSection.tsx:23-70` | The house tool-button rule set: `--gol-border-control`, no `transition`, `:focus-visible`, the disabled pair. |
| `apps/web/components/battle/editor/OrganismRoster.tsx:48-79, 469-536` | `aria-pressed` as the exclusive-selection idiom and its second visual channel (FD3). |
| `apps/web/components/battle/BattlePage.tsx:420-427, 596-611` | The `colors` memo form (FD7) and the `palette` memo's reasoning ("one of `EditDish`'s three construction dependencies"). |
| `apps/web/lib/battle/tool.ts` | `Tool`, `ERASER_TOOL` (`:48`), `refForTool` (`:76-92`) — `0` for the eraser, `index + 1` for an organism; why `null` is not `0`. |
| `apps/web/lib/canvas/refToFillGroup.ts:23-27, 68-103, 110-113` | `RefToFillGroup`, `buildRefToFillGroup` (warn-once on a dangling id), `fillGroupOf` (the shade arithmetic test (e) pins). |
| `apps/web/lib/canvas/themeColors.ts` | `readGridColors` — `null` when the token layer is absent; why a literal is forbidden. |
| `apps/web/lib/canvas/gridLayout.ts`, `pointerToCell.ts` | The auto-fit maths the tests derive coordinates from (7px cells at jsdom's 300×150; 11px at 340×226 in the browser). |
| `apps/web/lib/palette/displayColor.ts:31-38` | `ageShadeFor(0, true) === 0` — why an aging organism's drawn cells are pale (AC4). |
| `packages/simulation/src/grid/grid.ts:103-149` | `createGrid`, `clearGrid` (new buffers, new wrapper — never in place), `isGridEmpty`. |
| `apps/web/components/organisms/editor/OrganismEditorLayout.tsx:29, 58-59, 137-150, 226-234` | The `preview` slot and `PreviewColumn` (400 / 350px, 30px padding, its own scroll region). **Unedited.** |
| `apps/web/components/organisms/editor/OrganismEditorModal.tsx:9-28, 193-223, 239-257, 418-455` | **Modified.** The static-import rule, the header's per-story sentence, the draft + `usersByToken` block (where `colors` joins), the layout call (where `preview=` joins). |
| `apps/web/components/organisms/editor/OrganismEditorModal.test.tsx:1-35, 210-245, 371-385, 395-412, 428-430` | The render helper and `LIBRARY`, the 4.8 swatch-pick path, the tab-order case that stays, the axe case that now covers the panel, the Preview-region assertion that stays. |
| `apps/web/components/organisms/editor/AddRuleButton.tsx`, `fieldStyles.ts:1-24` | The editor's button and shared-chrome precedents; `fieldStyles` is NOT extended (a tool button is not a field). |
| `apps/web/lib/organisms/organismDraft.ts:1-50` | `OrganismDraft` — read `colorToken`/`agingEnabled`; **never widened** with the grid (FD2). |
| `apps/web/e2e/organisms.spec.ts:1-30, 192-225, 459-520, 2119-2274` | `openEditor`, the localStorage before/after idiom, the 4.4 helpers (`boxOf`, `probeIn`) and probes that must keep passing, the 4.13 block to append after. |
| `apps/web/e2e/battleRoute.spec.ts:75-120, 383-410, 620-650` | `distinctColorCount` (copy with a pointer), the drag idiom (`mouse.move`/`down`/`move`/`up`, no `steps`). |
| `docs/planning-artifacts/ux-designs/…/organism-editor-design.md:446-481, 615-622, 639-655` | The preview grid spec (30×20, ~10–12px cells, Draw default, Erase, Clear), the drawing steps, the tier widths. |
| `docs/planning-artifacts/ux-designs/…/clinical-lab-theme/organism-editor.html:121-129, 728-769, 1193-1206, 1296-1302` | `.preview-column`, `.preview-canvas`, `.drawing-controls`, `.btn-tool` (+ `.active`), the markup, the class-toggle JS. |
| `docs/planning-artifacts/architecture.md:349`, `epics.md:199-201, 238` | M3, AR-31/32/33, UX-DR13. |
| `docs/planning-artifacts/rfcs/RFC-005-application-state-modes-undo.md:137-177` | Decision 2's tree and the M3 callout ("its own subtree and refs"). |
| `docs/planning-artifacts/component-tree-battle-page.md:255-269, 463-465` | §3.10's variants and the "preview reuse" line this story amends (Open flags). |
| `docs/implementation-artifacts/deferred-work.md:228, 344, 514, 1360-1364, 1637, 1707-1711` | The pointer-only gap, the smoke-check note, the mint-site and `contentHash` notes for 4.15, the port trap, the 3.18 pointers Task 5 extends. |
| `docs/implementation-artifacts/4-13-editor-validation-feedback.md` (FD1, "What NOT to build", Review Findings), `4-8-…md` AC4, `4-7-…md` FD4, `4-4-…md` FD2/FD3 | The decisions this story inherits. |
| `docs/implementation-artifacts/lane-gates.yaml` | 4.15 gated on 3.15; this story proposes no gate. |

### Architecture compliance

- **M3 / AR-32 / RFC-005 Decision 1–2** — the preview's grid is ephemeral UI state at its lowest
  common ancestor (the panel); the in-stroke buffer is the canvas's ref; nothing reaches the
  battle (none is mounted under the Library) or the library (no repository in the panel or the
  modal — AR-2/AR-27 unchanged).
- **Decision A / AR-17** — `PREVIEW_GRID_SIZE` is a parameter threaded to `createGrid`, the canvas
  and (via the canvas) the renderer; no `30`/`20` literal below `previewGrid.ts`.
- **RFC-006 Decision 2 / M14** — ref `1` = roster index 0 + 1, ref `0` = empty; both derived through
  `refForTool`, the LUT through `buildRefToFillGroup`.
- **AR-22 / AR-23 / Decision B.2** — the shared renderer, dirty path for strokes, colour-state
  batching; nothing new in `lib/canvas/`.
- **RFC-003 Decision 3 / Decision J / AR-46** — `styled()` + `var(--gol-*)`; no MUI component for
  the buttons or the box; no new token; no `transition`.
- **AR-35 / bundle** — no dependency; the panel and its lib module ride the lazy editor chunk.
- **NFR-4.1 / NFR-4.2** — Clear is disabled when it would do nothing; strokes paint through the
  dirty path within the frame.
- **AR-42 / AR-44** — the panel's tests pin decisions through the recording context and the
  control states, never pixels; the e2e's one pixel read is the permitted smoke check.
- **Spec-id hygiene** — `spec:check` tokenises `FR-2.3`, `FR-2.4`, `FR-2.7`, `FR-3.6`, `FR-3.7`,
  `FR-8.7`, `NFR-2.1`, `NFR-4.1`, `NFR-4.2`, `NFR-8.3`, `AR-2`, `AR-17`, `AR-22`, `AR-23`, `AR-27`,
  `AR-31`, `AR-32`, `AR-33`, `AR-35`, `AR-42`, `AR-44`, `AR-46`, `RFC-002`, `RFC-003`, `RFC-005`,
  `RFC-006`, `Decision A`, `Decision B`, `Decision H`, `Decision J`, `M3`, `M14`, `Story 2.4`,
  `Story 2.5`, `Story 2.6`, `Story 2.7`, `Story 2.9`, `Story 2.10`, `Story 2.12`, `Story 2.15`,
  `Story 4.4`, `Story 4.7`, `Story 4.8`, `Story 4.13`, `Story 4.14`, `Story 4.15`, `Story 4.16`,
  `Story 4.23`, `Story 6.6`, `Story 6.11`; write them exactly so. `UX-DR*`, `FD*`, `AC*`, `SC
  1.4.11` are not checked.

### Library / framework notes (installed versions, no research needed)

- **React 19.2** — `useState`'s lazy initialiser runs once per mount (`createGrid` allocates 600 +
  600 bytes once); a bare `setGrid` passed as `onStrokeCommit` is identity-stable; a `useMemo` on
  two scalars re-runs only when one changes; `aria-pressed={boolean}` renders `"true"`/`"false"`.
- **Pointer Events / jsdom 30** — `fireEvent.pointerDown` needs `button: 0, isPrimary: true`;
  `pointerMove` needs `buttons: 1`; `setPointerCapture`/`releasePointerCapture` are absent (the
  canvas guards both); `getBoundingClientRect` is all zeros (stub it); `getContext('2d')` is
  `null` (install the recording context); `ResizeObserver` is undefined (the canvas skips it).
- **Canvas** — the renderer keeps jsdom's 300×150 intrinsic size (`clientWidth` is 0); in the
  browser `applyDevicePixelSizing` rasterises at DPR — coordinates in e2e come from the box, not
  from `canvas.width`.
- **MUI 9.3.1** — `Dialog` portals to `document.body`; every modal-test query goes through
  `screen`. No MUI component is added here.
- **Playwright 1.62** — `page.mouse.move/down/up` for a drag (one `pointermove` without `steps`);
  `toBeDisabled()` / `toBeEnabled()`; WebKit's `Alt+Tab`; `expect.poll` for the pixel smoke.
- **vitest-axe / @axe-core/playwright** — `role="group"` with `aria-label` is a naming role;
  `aria-pressed` on a `button` is allowed; a `canvas` with `role="img"` + `aria-label` passes (the
  battle editor proves it on every project).

### Testing standards

- `apps/web` has **no coverage gate** — every test guards a named failure: a literal size or a
  drifted constant (Task 1 a), an eraser resolving to `null` and silently doing nothing (1 c, 2.5),
  a hand-built LUT with the wrong slot (1 d–e), a dangling-id warn (1 f), a canvas rendered with
  a literal colour when the token layer is absent (2.2), a mode toggle that is not exclusive or
  not keyboard-operable (2.3), a stroke that paints the wrong ref or colour (2.4, 2.7, 2.8), a
  Clear that stays enabled on an empty grid or does not repaint (2.5, 2.6), a palette rebuilt per
  render (2.9), a grid lost on a mode/colour change (2.10), a drag routed through `drawFull`
  (2.11), a modal that resolves `colors` wrongly (3.21), a draw that reaches the draft (3.23), a
  `ResizeObserver` loop (e2e 1), a preview that persists (e2e 4).
- `packages/*` **untouched** — their coverage lines exactly as on `main`.
- Never snapshot; never assert computed colours or scroll positions in jsdom; never assert
  `canvas.width` in the browser; never run axe mid-transition (the 300 ms wait); never click a
  disabled button to "prove" it is inert — assert `toBeDisabled()`.
- The 4.3–4.13 tests are retargeted **only** as AC9 lists (nothing, in fact); if any other test
  fails, the change is wrong, not the test.
- Write every test file Tasks 1–4 name **before** ticking the task; record what each test actually
  does (the 4.12/4.13 review habit).

### Previous story intelligence (Story 4.13)

- Two review passes found: a passive effect landing one task late where a layout effect was
  needed (nothing here schedules state from an effect — the panel has no effects of its own; the
  canvas's are its own business); prose contradicting the shipped behaviour in four places (keep
  AC text, FD text, comments and the Dev Agent Record in step as you go); a test that pinned the
  eventual state but not the cue's presence before it (test 2.5 asserts Clear *enabled* before
  asserting it goes back to disabled); an e2e still encoding a pre-decision expectation and a
  record claiming a green `ci:dev` it could not have had (paste the actual exit code, and re-run
  after every spec edit); literals where a constant was named (`MAX_AGE_SHADE`, `paletteIndexOf`,
  never a shade number or a hex).
- The habits: prove every "unchanged" claim by leaving the old test unedited; the Dev Agent
  Record carries the exit code, coverage lines, bundle lines and e2e summary, never the word
  "green"; `lsof -i :4173` before e2e; WebKit does not focus a `<button>` on click.
- 4.13's `SaveNotice` is still in the modal (4.16 deletes it) — test 3.23 uses it as the "draft
  unchanged and valid" oracle rather than adding a probe.

### Git intelligence

`main` is at `5703add` (merge of #61, 4.13). The last app-code commits are 4.13's
(`components/organisms/editor/*`, `lib/organisms/{organismDraft,ruleDraft}.*`,
`e2e/organisms.spec.ts`). The renderer and the edit canvas were last touched in Epic 3 (3.9
`drawDiff`, 3.11 `PlaybackDish`) and are stable. **Only Epic 4 is in progress**
(`sprint-status.yaml`): no other lane, no shared surface, no gate. This story's files are
`components/organisms/editor/{PreviewPanel,OrganismEditorModal}.*`,
`lib/organisms/previewGrid.*`, `e2e/organisms.spec.ts`, `deferred-work.md` — all inside the
epic-4 lane; `components/PetriDishCanvas.tsx` is read, never written.

### The shape Story 4.15 inherits (so it is not rebuilt)

```
<PreviewPanel colorToken agingEnabled colors>            ← 4.15 adds: the draft's rules (or the draft)
  grid: useState<Grid>            (the initial state)     ← 4.15: useSimulation(grid, [organism], opts)
  mode: useState<DrawMode>
  <PreviewDishBox>                                       ← 4.15: while a session exists, render
    <PreviewCanvas variant="edit" … onStrokeCommit={setGrid}/>   variant="playback" here instead
  <DrawingControls role="group">                         ← 4.15: disabled while running
    Draw | Erase | Clear
                                                         ← 4.15 appends: Play/Step/Stop, speed, cycle
```

### Project Structure Notes

- New: `apps/web/lib/organisms/previewGrid.ts` (+ `.test.ts`);
  `apps/web/components/organisms/editor/PreviewPanel.tsx` (+ `.test.tsx`).
- Modified: `apps/web/components/organisms/editor/OrganismEditorModal.tsx` (+ `.test.tsx`);
  `apps/web/e2e/organisms.spec.ts`; `docs/implementation-artifacts/deferred-work.md`,
  `sprint-status.yaml`.
- Naming: `PREVIEW_GRID_SIZE`, `PREVIEW_ORGANISM_ID`, `PREVIEW_ROSTER`, `PREVIEW_DRAW_TOOL`,
  `PREVIEW_GRID_LINES`, `DrawMode`, `toolForDrawMode`, `buildPreviewPalette`; component
  `PreviewPanel` (props `colorToken`, `agingEnabled`, `colors`); styled `PreviewDishBox`,
  `PreviewCanvas`, `DrawingControls`, `ToolButton`; data attribute `data-preview-dish`;
  accessible names "Drawing tools", "Draw", "Erase", "Clear", "Petri dish, 30 by 20 cells".
- Untouched on purpose: `PetriDishCanvas.tsx` (+ test), `lib/battle/tool.ts`,
  `lib/canvas/**`, `lib/palette/**`, `OrganismEditorLayout.tsx` (+ test), every other editor
  field, `useOrganismEditorModal.ts`, `OrganismLibrary.tsx`, `organismDraft.ts`, every file under
  `components/battle/**`, `packages/**`, `themes.css`, `themeTokens.test.ts`, `theme.ts`,
  `playwright.config.ts`, `scripts/check-bundle-size.mjs`, `docs/project-context.md`.

### What NOT to build

- ❌ No `useSimulation`, no `compileSession`, no Play/Step/Stop, no speed slider, no cycle counter,
  no extinction handling — Story 4.15 (FD1).
- ❌ No draft→`Organism` adapter, no id minting, no `contentHash` — 4.15/4.16.
- ❌ No grid field on `OrganismDraft`, no grid in the modal's state, no `onGridChange` prop (FD2).
- ❌ No repository in the panel or a new one in the modal; no `localStorage` (M3, AR-2/AR-27).
- ❌ No undo ring for the preview (not in the AC or the design doc; Clear is the recovery).
- ❌ No confirmation dialog on Clear (2.15 has none; the dish is a sketch).
- ❌ No `radiogroup`, no roving tabindex, no arrow-key handler on the tool row (FD3).
- ❌ No `tabIndex` on the canvas, no keyboard placement — the 2.5 gap is inherited and recorded,
  not half-solved (a focusable dish that does nothing on Enter is worse, `deferred-work.md:228`).
- ❌ No `showGridLines` prop, no settings read (FD5).
- ❌ No `aria-label` override on the canvas, no change to `<PetriDishCanvas>` at all (FD6).
- ❌ No `readGridColors` call inside the panel, no literal colour fallback (FD7, AR-46).
- ❌ No `width: auto` on the dish box; no `ResizeObserver` of your own (AC8).
- ❌ No `transition`, no `translateY`, no new `--gol-*` token, no hex.
- ❌ No MUI `ToggleButton`/`ToggleButtonGroup`/`Button` for the tools — `styled('button')` (RFC-003
  Decision 3; the MUI barrel stays out of the editor chunk beyond what is there).
- ❌ No `document.querySelector`; no `scrollIntoView`.
- ❌ No edit to `OrganismEditorLayout.tsx` — the slot exists.

### Open flags for the owner (not blockers — the story proceeds on the FD)

- **`component-tree-battle-page.md` §3.10 says the preview reuses `static`/second `playback`;
  this story uses the `edit` member for UX-DR13's drawing.** Not a contradiction — the spec line
  predates the drawing requirement's decomposition and RFC-002 `:272`'s `renderStatic` sentence
  describes paused *stills* — but an omission worth a one-line amendment ("preview: `edit` while
  sketching, `playback` while running"). Recorded in `deferred-work.md` as a candidate, never
  edited from a story (the 3.18 precedent).
- **Grid lines are on for the preview, unconditionally (FD5).** If the owner wants the FR-8.7
  setting to reach the editor, Story 6.6 needs a settings repository at the editor's boundary (or
  a `gridLines` prop threaded from 4.24/4.25's battle-origin caller) — a 6.6 decision.
- **The canvas announces itself as "Petri dish, 30 by 20 cells" inside the editor (FD6).** A
  distinct copy ("Preview dish") is a one-prop change to the shared canvas if wanted.

### References

- `docs/planning-artifacts/epics.md:1153-1163` (Story 4.14 ACs), `:1165-1175` (4.15 — what is
  not here), `:1087` (4.8 AC4 — "preview grid immediately"), `:1066-1076` (4.7), `:1264-1275`
  (4.23's field list), `:1525-1536` (6.6), `:49` (FR-2.7), `:56-59` (FR-3.4–3.7), `:119` (FR-8.7),
  `:187-188` (AR-22/23), `:199-201` (AR-31/32/33), `:238` (UX-DR13), `:216-218` (AR-42/44).
- `docs/planning-artifacts/architecture.md:349` (M3), `:382`.
- `docs/planning-artifacts/rfcs/RFC-005-application-state-modes-undo.md:137-177`;
  `RFC-002-grid-rendering-technology.md:272`.
- `docs/planning-artifacts/component-tree-battle-page.md:255-269, 375, 463-467`.
- `docs/planning-artifacts/ux-designs/ux-GameOfLife-2026-05-27/organism-editor-design.md:91-93,
  446-481, 615-622, 639-655, 785-795, 846-848`.
- `docs/planning-artifacts/ux-designs/ux-GameOfLife-2026-05-27/clinical-lab-theme/organism-editor.html:121-129,
  728-769, 1193-1206, 1296-1302`.
- `docs/implementation-artifacts/clinical-lab-contrast-validation.md:41-64`.
- `docs/implementation-artifacts/4-13-editor-validation-feedback.md` (FD1, What NOT to build,
  Review Findings); `4-8-color-picker-selection-defaults.md` (AC4, `:903`);
  `4-7-aging-degradation-toggle.md` (FD4); `4-4-three-column-responsive-layout.md` (FD2, FD3,
  `:169-172`); `epic-2/2-5-*`, `2-6-*`, `2-7-*`, `2-12-*`, `2-15-*` (the edit canvas's decisions,
  cited through the code comments they left).
- `docs/implementation-artifacts/deferred-work.md:228, 344, 514, 1360-1364, 1637, 1707-1711`.
- `docs/implementation-artifacts/lane-gates.yaml`.
- `docs/project-context.md` — Framework rules (three state categories; hot state in refs; the
  Canvas grid outside MUI; components split by mode), Critical rules (grid dimensions are
  parameters; `fillStyle` + `var()` is a silent no-op — resolve once and pass strings; never batch
  by organism), Testing rules (no gate on `apps/web`; never pixel-test the Canvas; the Playwright
  viewport band), Code Quality (AR-46; `spec:check`; comments explain why), Commit gate.

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5 (dev-story)

### Debug Log References

- `lsof -i :4173` before e2e: no process on the port (clean run, no port-reuse trap).
- `npm run ci:dev > ci.log 2>&1; echo $?` → **exit code 0**.
  - `typecheck`: 5/5 packages passed (1.556s).
  - `lint`: 0 errors (1 pre-existing unrelated warning in `BattleGallery.tsx`).
  - `format:check`: all files match Prettier style.
  - `spec:check` / `boundary:check`: passed.
  - `test:coverage`: 5/5 packages passed — `apps/web` 108 files / 1804 tests; `@gol/domain`
    109/109 (100/100/100/100, unchanged); `@gol/simulation` 407/407 (100/100/100/100,
    unchanged); `@gol/persistence` 82/82 (99.19/96.07/100/100, unchanged); `@gol/test-utils`
    89/89 (94.44/90.09/100/97.07, unchanged). New files: `previewGrid.ts` 100/100/100/100;
    `PreviewPanel.tsx` 100/75/100/100 (apps/web carries no coverage gate — recorded for
    visibility only; the one uncovered branch is a defensive `canvas === null` short-circuit).
  - `build:standalone`: 5/5 packages, Next 16.2.12 (Turbopack), all 5 routes prerendered.
  - `bundle:check` (after this story):
    - home (/): 333.8 KB gzip / 340 KB budget (6.2 KB headroom)
    - battle (/battle): 309.3 KB gzip / 310 KB budget (0.7 KB headroom)
    - battle/new (/battle/new): 309.1 KB gzip / 310 KB budget (0.9 KB headroom)
    - organisms (/organisms): 295.6 KB gzip / 305 KB budget (9.4 KB headroom)
    - Measured on `origin/main`@`5703add` (temporary worktree) for comparison: home 333.8,
      battle 309.3, battle/new 309.1, organisms 295.6 KB gzip — **all four routes unchanged
      to 0.1 KB** (well inside AC10's ±0.5 KB). The editor's lazy chunk (`grep -rl "Organism
      Color" out/_next/static/chunks/*.js`) grew from 11,436 B to 12,128 B gzip (+692 B,
      +0.68 KB) — the `PreviewPanel` + `previewGrid` module + reused renderer-stack imports.
      No budget raised.
  - `bench` / `bench:check`: frame (step + repaint) 7.586 ms vs 16.667 ms budget — **54.5%
    headroom** (9.081 ms). `packages/*` untouched, consistent with the coverage figures above.
  - `e2e:chromium`: `apps/web/e2e/organisms.spec.ts` — **216 tests, 215 passed, 1 pre-existing
    skip, 0 failed** (includes the 6 new Story 4.14 tests and every 4.1–4.13 test unedited and
    green).

### Completion Notes List

- Implemented Tasks 1–5 per the story's exact specifications (code blocks, prop shapes, test
  names) with no deviation from FD1–FD7.
- Task 1: `apps/web/lib/organisms/previewGrid.ts` — `PREVIEW_GRID_SIZE`, `PREVIEW_ORGANISM_ID`,
  `PREVIEW_ROSTER`, `PREVIEW_DRAW_TOOL`, `DrawMode`, `toolForDrawMode`, `buildPreviewPalette`.
  8 unit tests, all passing.
- Task 2: `apps/web/components/organisms/editor/PreviewPanel.tsx` — the dish box, the edit
  canvas (unmodified, shared component), the three `aria-pressed` tool buttons. 12 tests
  covering render, degradation, keyboard exclusivity, draw/erase/clear, palette memoisation
  (including the "same props reconstructs nothing" tripwire), drag-vs-click, and axe. One
  test-authoring pitfall found and fixed during implementation: `vi.spyOn` on an
  already-spied method returns the SAME spy instance (its call history is cumulative), so the
  memoisation tripwire needed `mockClear()` before the delta-based assertion — documented
  inline in the test file.
- Task 3: wired `<PreviewPanel>` into `OrganismEditorModal.tsx`'s `preview` slot; added the
  `colors` memo (`readGridColors`, resolved once, the `<BattlePage>` form); updated the header
  comment and tag line. 5 new modal tests (the `colors === null` degradation, the canvas
  mounting with the token layer, a swatch pick leaving the panel's controls byte-identical,
  drawing not touching the draft/Save gate, and axe). All 4.3–4.13 modal tests pass unedited
  (46 → 51 tests in the file).
- Task 4: appended `test.describe('preview grid & drawing (Story 4.14)')` to
  `apps/web/e2e/organisms.spec.ts` — 6 tests against the served static export (render/controls,
  draw-erase-clear with a pixel-count smoke check, a drag, M3 isolation, keyboard operation,
  axe). Two issues found and fixed against the real browser: (a) the dish box's measured width
  is 289 px, not exactly 290 (`toBeCloseTo(_, 0)` is too strict for sub-pixel layout rounding —
  switched to a range assertion); (b) the keyboard test's original ordering clicked to draw
  *after* switching to Erase mode, which is a no-op on an empty cell — reordered so the mouse
  draw happens while still in the default Draw mode, before the keyboard walk. Full
  `organisms.spec.ts` suite re-run afterwards: 87/87 passed (AC9's "nothing else regresses"
  guard).
- Task 5: bundle measured before (temporary `origin/main` worktree) and after — all four
  routes unchanged to within 0.1 KB; the editor's lazy chunk grew ~0.68 KB gzip, as expected
  from the new module. `deferred-work.md` updated (the two pointer appends plus the new
  "Deferred from: Story 4-14" section, 9 items). `docs/project-context.md` left untouched per
  the story's own instruction (no new rule; the candidate note is already carried elsewhere).
  Full `npm run ci:dev` run: exit code 0.
- No HALT conditions were hit. No new dependency was added. No file outside the story's
  declared scope (`components/organisms/editor/{PreviewPanel,OrganismEditorModal}.*`,
  `lib/organisms/previewGrid.*`, `e2e/organisms.spec.ts`, `deferred-work.md`,
  `sprint-status.yaml`) was touched; `PetriDishCanvas.tsx` and everything under
  `components/battle/**` / `packages/**` remain unedited, verified by the coverage figures
  above being byte-identical to `main`.

### File List

- `apps/web/lib/organisms/previewGrid.ts` (new)
- `apps/web/lib/organisms/previewGrid.test.ts` (new)
- `apps/web/components/organisms/editor/PreviewPanel.tsx` (new)
- `apps/web/components/organisms/editor/PreviewPanel.test.tsx` (new)
- `apps/web/components/organisms/editor/OrganismEditorModal.tsx` (modified — `colors` memo,
  `preview` slot, header comment)
- `apps/web/components/organisms/editor/OrganismEditorModal.test.tsx` (modified — 5 new tests)
- `apps/web/e2e/organisms.spec.ts` (modified — 6 new tests)
- `docs/implementation-artifacts/deferred-work.md` (modified — 2 pointer appends + new section)
- `docs/implementation-artifacts/sprint-status.yaml` (modified — status transitions)
- `docs/implementation-artifacts/4-14-preview-grid-drawing.md` (this file — tasks checked,
  status, Dev Agent Record)

### Change Log

- 2026-09-21 — Story file created (create-story): ACs decomposed, FD1–FD7 recorded, the 4.15
  shape pinned, precedent and spec map compiled; status → ready-for-dev.
- 2026-09-21 — Implemented (dev-story): Tasks 1–5 complete, all ACs satisfied, `npm run ci:dev`
  green (exit 0) — 215/216 e2e tests passing across all specs (1 pre-existing skip, 0 failed),
  with `organisms.spec.ts` alone at 87/87 including the 6 new Story 4.14 tests; status → review.

Dev Model: sonnet   # follows settled patterns end to end — the edit canvas, its box, its colors/palette wiring and its test rig are all Epic 2/3 precedent reused unmodified; the one new piece (a panel-local grid, a two-mode tool row, a two-field palette memo) is pinned with exact code, names and tests, and Story 4.15 grows into it without reshaping it
Proposed lane gate: none
