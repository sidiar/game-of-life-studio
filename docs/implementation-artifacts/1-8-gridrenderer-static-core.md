---
baseline_commit: 8fd3da7
---

# Story 1.8: GridRenderer Static Core

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a user,
I want battle grids drawn crisply and identically wherever they appear,
so that a battle looks the same in the Gallery as it will in the editor.

## Acceptance Criteria

1. **Given** the `GridRenderer` contract, **When** implemented, **Then** it exposes `renderStatic(grid)` (loopless one-shot) and `drawFull(grid)` (full repaint), constructed with `(canvas, size, palette LUT)` (AR-22/25)
2. **Given** any grid dimensions, **When** laid out, **Then** auto-fit computes `cellSize = floor(canvasPx / dimension)` so the whole grid is always visible (FR-3.2 groundwork)
3. **Given** the frozen-contract rule, **When** contract tests run, **Then** the renderer never calls `requestAnimationFrame`, never mutates the grid, and owns no scheduling — Epic 3 wraps it without modifying it (RFC-002, party-mode churn review)
4. **And** grid-line overlay support (`setGridLines`, default on) is present (FR-8.7 consumption; toggle UI lands in Epic 6)
5. **And** decision logic (auto-fit math, batch grouping keys) is tested as pure units — no pixel snapshots beyond a smoke check (AR-42)

## Tasks / Subtasks

- [x] **Task 1: The grid shape the renderer reads** (AC: 1)
  - [x] New file `apps/web/lib/renderableGrid.ts`. Declare the **read-only structural view** the renderer consumes — field names **verbatim from RFC-004 §3.4**, so Story 3.3's real `Grid` satisfies it structurally with zero adaptation and zero import:

    ```ts
    export interface RenderableGrid {
      readonly width: number;      // cols — RFC-004 §3.4 names them width/height, NOT cols/rows
      readonly height: number;     // rows
      readonly occupant: Uint8Array;   // 0 = empty; 1..255 = OrganismRef = dense roster index + 1
      readonly age: Uint16Array;       // Uint16, not Uint8 — canonical (Decision B.5)
    }
    ```

    ⚠️ **Declare it in `apps/web`, do not create it in `packages/simulation`.** Story 3.3 owns the real `Grid` (double buffering, `resizeGrid`, Moore neighbourhood). Structural typing joins the two for free and in the right direction: `apps/web` already depends on `@gol/simulation`, never the reverse. Writing a placeholder `Grid` into `packages/simulation` now would make 3.3 a rename-and-merge exercise and hand the engine package a type it did not design.
  - [x] Same file — the **dense→typed adapter** the Gallery path needs (Story 1.11 is the first caller):

    ```ts
    export function toRenderableGrid(gridState: readonly (readonly number[])[]): RenderableGrid
    ```

    At rest a battle is dense `gridState: number[][]` (`BattleSchema`, RFC-006 Decision 2); **age is 0 in every initial grid** (RFC-005 "Representation note"), so allocate a zero-filled `Uint16Array` and copy occupants row-major. Reject a ragged input eagerly with a message naming the row — the `gridBuilders.ts` convention (a malformed grid otherwise fails as a blank canvas three stories later).
  - [x] ❌ **No `resizeGrid`, no double-buffered grid pair, no sparse conversion, no round-trip property tests** — all Story 3.3 / 5.3. This adapter is ~15 lines and moves data one direction.
  - [x] Tests (`renderableGrid.test.ts`): round-trip a `gridFromPattern` fixture from `@gol/test-utils` through `toRenderableGrid` and back by index; `age` is all zeros and is a `Uint16Array`; `occupant` is a `Uint8Array` of length `width * height`; a ragged input throws naming the row; a `0x0` grid produces empty buffers without throwing.

- [x] **Task 2: The per-battle `OrganismRef → fill-group` LUT** (AC: 1, 5)
  - [x] New file `apps/web/lib/refToFillGroup.ts`. This is the object the frozen contract calls `palette` — deferred from Story 1.7 precisely so its shape could be dictated by the renderer's inner loop rather than guessed.

    ```ts
    export interface RefToFillGroup {
      readonly tokenIndex: Uint8Array;  // [ref] -> palette index (0..19). Slot 0 unused: ref 0 = empty.
      readonly aging: Uint8Array;       // [ref] -> 1 when agingEnabled
      readonly size: number;            // roster length + 1 — the exclusive upper bound on a valid ref
    }

    export function buildRefToFillGroup(
      organismIds: readonly string[],                                   // the battle's roster, in order
      organismsById: ReadonlyMap<string, Pick<Organism, 'colorToken' | 'agingEnabled'>>,
    ): RefToFillGroup

    export function fillGroupOf(lut: RefToFillGroup, ref: number, age: number): number
    ```

  - [x] ⚠️ **The dense at-rest encoding and the runtime `OrganismRef` are the same number.** `gridState` cell value `v` is `index + 1` into `battle.organismIds` (RFC-006/`BattleSchema`), and RFC-004 §2.1 interns ids to refs in that same roster order. So `ref = occupant value` needs **no** translation layer in Epic 1, and the LUT built here is exactly the one Story 3.4 will produce from its interning step. Do not build a second id→ref map.
  - [x] **Group key = `tokenIndex * 8 + ageShade`** — deliberately the same arithmetic `displayColorAt` uses to index its 160-entry table (`safeIndex * SHADE_COUNT + safeShade`, `displayColor.ts:68`). Group id and colour index are the same number; the renderer never needs a second lookup table. `ageShade = aging[ref] ? min(age, 7) : 7` — reuse `ageShadeFor(age, agingEnabled)` from `@/lib/displayColor` rather than re-deriving it.
  - [x] ⚠️ **Resolve `colorToken` here, once per battle — never in the render loop.** `buildRefToFillGroup` calls `paletteIndexOf(token)` (Story 1.7), which already warns exactly once per unknown token. That places every unknown-token diagnostic on a path that runs once per battle instead of once per cell per frame, and it means the renderer only ever sees indices that are in range. **This closes the Story 1.7 deferred item** ("`displayColorAt` clamps a corrupt numeric index silently … pick this up in Story 1.8 when the renderer's inner loop exists" — `deferred-work.md:53`): the answer is that the diagnostic is affordable because it does not live in the loop. Record that resolution.
  - [x] ⚠️ **A roster entry with no matching organism must still render.** A battle can reference an organism id the library no longer resolves (mid-import, a hand-edited record). Fall back to `DEFAULT_COLOR_TOKEN` + `agingEnabled: false` and warn **once per id**, matching Decision I.4's degrade-and-warn posture. Throwing here blanks the whole Gallery over one dangling reference.
  - [x] ⚠️ **Cap the roster at 255 and say so.** `Uint8Array` occupant values top out at 255 (Decision G.3); `organismIds.length > 255` is a caller bug the schema already rejects, but the LUT allocating `length + 1` slots would silently truncate. Throw with the actual length.
  - [x] Tests (`refToFillGroup.test.ts`): built from the three AR-45 mock organisms (`@gol/test-utils`), refs 1–3 map to the `vermillion`/`azure`/`bluish-green` palette indices with `aging` `0/1/0`; `fillGroupOf` returns `tokenIndex*8 + 7` for both non-aging organisms **at every age 0..99** and `tokenIndex*8 + min(age,7)` for the aging one; every group id produced across all refs × ages 0..99 is `< 160`; slot 0 is never read (assert `fillGroupOf(lut, 0, …)` is not called by design — the renderer skips empties, see Task 4); a roster id absent from the map falls back to the `sky-blue` index and warns once; a 256-entry roster throws.

- [x] **Task 3: Auto-fit layout — pure math, no canvas** (AC: 2, 5)
  - [x] New file `apps/web/lib/gridLayout.ts`:

    ```ts
    export interface GridLayout {
      readonly cellSize: number;      // device px, integer, >= 1
      readonly originX: number;       // device px — leftover space split, grid centred
      readonly originY: number;
      readonly drawWidth: number;     // cellSize * cols
      readonly drawHeight: number;
      readonly gridLinesVisible: boolean;
    }

    export function computeGridLayout(
      canvas: { width: number; height: number },   // BACKING-STORE px, not CSS px
      size: { cols: number; rows: number },
      showGridLines: boolean,
    ): GridLayout
    ```

  - [x] `cellSize = max(1, floor(min(canvas.width / cols, canvas.height / rows)))` — A.5's formula applied to **both** axes, taking the smaller so the whole grid fits (FR-3.2: "whole grid always visible"). ⚠️ Taking only one axis is the literal reading of `cellSize = floor(canvasPx / dimension)` and it clips the other dimension off-canvas.
  - [x] ⚠️ **The `max(1, …)` is load-bearing, not defensive garnish.** A Gallery tile is ~200 px wide; at 200×120 that is `floor(200/200) = 1`. One tile size smaller and the floor hits **0** — `fillRect(x, y, 0, 0)` paints nothing, and the whole Gallery renders as empty petri dishes with no error anywhere. Clamp, and accept that the grid overflows the canvas at that point (it is clipped by the canvas edge, which is the graceful outcome).
  - [x] **Centre the grid.** `originX = floor((canvas.width - cellSize*cols) / 2)`, same for Y. `floor` on integer inputs keeps the origin integral — a fractional origin re-introduces the seams the integer `cellSize` exists to remove. Without centring, the leftover (up to `cols - 1` px) becomes a dead bar on one side and the dish looks mis-mounted.
  - [x] **`gridLinesVisible = showGridLines && cellSize >= MIN_GRID_LINE_CELL_SIZE`** with `MIN_GRID_LINE_CELL_SIZE = 4`. At `cellSize` 1–3 a 1 px line per cell consumes 25–100% of every cell and the thumbnail becomes a grey rectangle. FR-8.7 says the toggle "applies to Gallery tiles" — it does; it simply has nothing legible to draw below the threshold. State this in a comment; a reviewer will otherwise read it as the toggle being ignored.
  - [x] Tests (`gridLayout.test.ts`): exact `cellSize` for 100×60 and 50×30 at several canvas sizes; the constraining axis is the smaller ratio (assert with a deliberately non-5:3 canvas — a tall canvas must be limited by width); `cellSize` never 0 (sweep every preset against canvas widths 1..300); centring leaves `originX/originY >= 0` and `origin*2 + drawWidth <= canvas.width + 1`; grid lines suppressed at `cellSize < 4` and present at `>= 4` when requested; `showGridLines: false` always wins; a `0x0` canvas does not divide by zero or produce `NaN`. Property test (fast-check) over `cols/rows/canvas` in realistic ranges: `cellSize * cols <= canvas.width || cellSize === 1`, and `cellSize` is always a positive integer.

- [x] **Task 4: Colour-state batch grouping — pure, no canvas** (AC: 5)
  - [x] New file `apps/web/lib/colourStateGroups.ts`:

    ```ts
    export interface FillGroup {
      readonly groupId: number;      // tokenIndex * 8 + ageShade — also the displayColorAt coordinate
      readonly tokenIndex: number;
      readonly ageShade: number;
      readonly cells: number[];      // flat grid indices (row * width + col)
    }

    export function groupByColourState(grid: RenderableGrid, lut: RefToFillGroup): FillGroup[]
    ```

  - [x] ❌ **Never key by organism (Decision B.2 / AR-23).** Organism-keyed batching is unbounded — 255 rosterable organisms — while colour-state keying folds every organism sharing a palette token into one group, bounding the result at **20 tokens × 8 shades = 160** regardless of roster size. That bound is what makes M6 (colours are reusable) and G.3 (255 per battle) free.
  - [x] **Skip `occupant === 0` before anything else.** Empty is the majority of most grids and has no group; the background fill already covers it.
  - [x] ⚠️ **Guard a ref outside the LUT.** `occupant` is `Uint8Array`, so a stale or hand-edited grid can carry a ref ≥ `lut.size`. Skip such cells (treat as empty) and warn once — reading past a `Uint8Array` yields `undefined`, which becomes `NaN * 8 + …` and lands in `displayColorAt`'s silent clamp, painting a real organism's colour on a phantom cell.
  - [x] Return groups **sorted by `groupId`** so draw order is deterministic and two renders of the same grid produce byte-identical call sequences — that determinism is what makes Task 5's recording-context assertions stable, and later what makes a Playwright smoke check reproducible.
  - [x] Tests (`colourStateGroups.test.ts`): a hand-built grid with two organisms sharing one `colorToken` produces **one** group, not two (the Decision B.2 headline); an aging organism at ages 0..9 produces exactly 8 groups (ages ≥ 7 fold); a non-aging organism at any age produces exactly one group with `ageShade === 7`; every returned `groupId` equals `tokenIndex * 8 + ageShade`; an all-empty grid returns `[]`; a 20-token × 8-shade worst-case grid returns ≤ 160 groups; cell indices are exhaustive and disjoint across groups (their union equals the set of non-zero occupants); an out-of-range ref is skipped and warns once.

- [x] **Task 5: `GridRenderer`** (AC: 1, 2, 3, 4)
  - [x] New file `apps/web/lib/gridRenderer.ts`. **Class**, per the frozen contract — this is the one place a class is correct: the no-classes rule is scoped to the engine (`packages/simulation` and the rules layer), and the renderer holds genuine instance state (canvas, context, layout, overlay cache) that Epic 3 hands around via `onRendererReady`.

    ```ts
    export interface GridRendererColors {
      readonly background: string;    // the dish surface (--gol-bg-primary in Story 1.9)
      readonly gridLine: string;      // --gol-border at the mockup's 0.3 alpha
    }

    export interface GridRendererOptions {
      readonly colors: GridRendererColors;
      readonly showGridLines?: boolean;      // default TRUE (FR-8.7)
      readonly desynchronized?: boolean;     // default FALSE — see the trap below
    }

    export class GridRenderer {
      constructor(
        canvas: HTMLCanvasElement,
        size: { cols: number; rows: number },
        palette: RefToFillGroup,
        options: GridRendererOptions,
      )
      drawFull(grid: RenderableGrid): void
      renderStatic(grid: RenderableGrid): void
      resize(size: { cols: number; rows: number }): void
      setGridLines(on: boolean): void
    }
    ```

  - [x] **Ship exactly these four methods.** `draw(grid)` and `markDirty(cells)` are Story **2.3** — the component tree lists all six under one contract block but its own note scopes Epic 1 to "`renderStatic` + `drawFull`". Implementing dirty tracking now means implementing it blind, before any editing gesture exists to shape it.
  - [x] **Context acquisition.** `canvas.getContext('2d', { alpha: false, desynchronized })`. **Throw a named error if it returns `null`** — a silently context-less renderer produces a blank Gallery with a clean console. `alpha: false` is RFC-002's; it makes the un-painted canvas **opaque black**, so `drawFull` must fill the background across the *entire* backing store (not just `drawWidth × drawHeight`) or the centring margins render as black bars instead of dish surface.
  - [x] ⚠️ **`desynchronized` defaults to `false`, against RFC-002's snippet.** RFC-002 §"Recommended Solution" sets it unconditionally, but that flag requests a low-latency compositing surface per canvas; the Gallery mounts up to ~50 of them (NFR-7.2). It is an interactive-surface optimisation — Epic 3's playback canvas opts in. Surface this as a deliberate narrowing, not an oversight.
  - [x] **Device-pixel sizing — this is what "crisply" in the story statement means.** On construction and on `resize`, set `canvas.width = round(cssWidth * dpr)` / `canvas.height = round(cssHeight * dpr)` from `canvas.clientWidth/clientHeight` and `window.devicePixelRatio ?? 1`, then compute the layout against the **backing-store** size and draw in backing-store pixels.
    - ⚠️ **Do not call `ctx.scale(dpr, dpr)`.** The tempting pattern — scale the context and keep drawing in CSS px — makes `cellSize` fractional in device space at any non-integer DPR (1.25, 1.5 are common), and every cell edge lands mid-pixel: soft, seamed cells. That is exactly the artefact this AC exists to prevent. Compute the integer `cellSize` in device px and draw there; `setTransform(1, 0, 0, 1, 0, 0)` after acquiring the context and leave it alone.
    - ⚠️ `clientWidth`/`clientHeight` are **0** for an unattached canvas — jsdom, and any pre-layout call. Fall back to the canvas's existing `width`/`height` attributes rather than producing a 0×0 backing store.
  - [x] **`drawFull(grid)` order — background, cells, lines:**
    1. Assert `grid.width === size.cols && grid.height === size.rows`, and `occupant.length === width * height`, and `age.length === occupant.length`. ⚠️ **A dimension mismatch is the highest-value assertion in this file:** without it a grid one row short reads garbage off the end of the typed array and paints a plausible-looking but wrong dish, and a grid one row long silently leaves stale cells on screen. Throw with both shapes in the message.
    2. `ctx.fillStyle = colors.background; ctx.fillRect(0, 0, canvas.width, canvas.height)` — whole backing store (see `alpha: false` above).
    3. `groupByColourState(grid, palette)`; for each group: `ctx.fillStyle = displayColorAt(group.tokenIndex, group.ageShade)`, then `ctx.beginPath()`, then one `ctx.rect(...)` per cell, then one `ctx.fill()`.
       - ⚠️ **`beginPath()` per group is mandatory, not stylistic.** Canvas paths accumulate: omit it and group *n*'s `fill()` re-fills every rect from groups 1..*n* in group *n*'s colour. The visible result is "the last organism's colour wins", the invisible result is O(n²) fill work. This is the single most common way this loop is written wrong, and no unit test that only checks colours-per-group would catch it — assert the `beginPath`/`fill` call *counts* explicitly.
       - One `fillStyle` write and one `fill()` per group is the entire point of batching (AR-23). A per-cell `fillStyle` write is the anti-pattern RFC-002 §3 opens with.
    4. Grid lines, when `layout.gridLinesVisible` — see below.
  - [x] **Grid lines: `fillRect`, not `stroke`.** Draw `cols + 1` vertical and `rows + 1` 1 px bars with `fillRect(x, originY, 1, drawHeight)`. A stroked 1 px line centred on an integer coordinate straddles two pixels and renders as a soft 2 px grey band; the standard fix is a 0.5 offset, which then breaks the moment DPR changes. `fillRect` on integer coordinates is exact at every DPR and needs no offset dance. Confine lines to the grid rectangle (`originX..originX+drawWidth`) — never the full canvas, or they run out across the centring margin.
    - Cache the overlay per RFC-002 Risk 4 **only if it is free to do so**: build it into an offscreen canvas on layout change and `drawImage` it per repaint. If `document.createElement('canvas')` + `getContext` is unavailable (jsdom), fall back to drawing lines directly — the cache is an optimisation and must not be a hard dependency. Note for the reviewer: at ≤ 320 `fillRect` calls this cache buys little in Epic 1; it is built now because Epic 2/3 repaint at 60 Hz and the contract already names it.
  - [x] **`renderStatic(grid)` vs `drawFull(grid)` — keep them distinct even though Epic 1's bodies coincide.** Document the contract now, because Story 2.3 gives them different dirty-state behaviour: `drawFull` is "repaint everything **and reset dirty state**" for a renderer that will keep being driven; `renderStatic` is the **terminal** one-shot for a surface nothing will drive again (Gallery tile, editor-preview still — M4/AR-25). Do **not** export one as an alias of the other, and do not have 1.11 call `drawFull`.
  - [x] **`resize(size)`** — recompute the backing store from the current CSS box, recompute the layout, invalidate the grid-line overlay cache, and full-repaint the last grid drawn. It serves both grid-dimension changes (Decision A) and canvas-box changes (fullscreen re-layout, Story 3.18) per the contract comment. It must be safe to call before any grid has been drawn (re-layout only).
  - [x] **`setGridLines(on)`** — store, invalidate the overlay cache, repaint the last grid if there is one. No-op-repaint when the value is unchanged.
  - [x] ⚠️ **Never mutate `grid`.** Read `occupant`/`age`; write nothing. The renderer also holds no reference the caller can be surprised by — keep the last-drawn grid reference for `resize`'s repaint and document that it is a borrow, not ownership.
  - [x] ⚠️ **No `requestAnimationFrame`, `setTimeout`, `setInterval`, or `queueMicrotask` anywhere in this file** (AC3). Scheduling lives exclusively in `SimulationLoop` (Story 3.8). The renderer is a function of its inputs.

- [x] **Task 6: Tests** (AC: 3, 5)
  - [x] **The canvas problem, and its resolution.** jsdom implements `<canvas>` the element but **`getContext('2d')` returns `null`** without the native `canvas` package. Do **not** add `canvas`/`node-canvas` (native build, install fragility on a `engine-strict` Node 24 repo) and do **not** add `vitest-canvas-mock` — the same call this project made in Story 1.7 when it declined a colour-science library. Instead:
    - New file `apps/web/lib/recordingContext2d.ts` — a hand-rolled recording double implementing **only** the members `gridRenderer.ts` actually uses. Type it against a narrow structural alias (`type Canvas2D = Pick<CanvasRenderingContext2D, 'fillStyle' | 'fillRect' | 'beginPath' | 'rect' | 'fill' | 'drawImage' | 'setTransform'>`) declared in `gridRenderer.ts` and used as the renderer's internal context type, so the double satisfies it **structurally with no cast**. It records an ordered call log (`{ op, args }[]`) plus every `fillStyle` assignment in sequence.
    - Install it by spying on the prototype: `vi.spyOn(HTMLCanvasElement.prototype, 'getContext')`. That spy's declared return type forces exactly **one** `as unknown as` in the test helper — put it there, alone, with a comment naming why. Nowhere else.
    - This file is test-only and must never be imported by component code, matching the `paletteCvd.ts` convention (`paletteCvd.ts:1-10`). It carries no colour literals, so it needs no AR-46 whitelist.
  - [x] **Contract tests** (`gridRenderer.test.ts`) — AC3, the ones the party-mode churn review asked for:
    - **No scheduling, behaviourally:** spy on `globalThis.requestAnimationFrame`, `setTimeout`, `setInterval` and assert zero calls across construct → `drawFull` → `renderStatic` → `resize` → `setGridLines`.
    - **No scheduling, structurally:** read `gridRenderer.ts` off disk with `node:fs` and assert the source matches none of `/requestAnimationFrame|setTimeout|setInterval|queueMicrotask/`. Belt and braces on purpose: the behavioural test only covers the paths it exercises, and this contract is what Epic 3 is being promised.
    - **Never mutates the grid:** snapshot `occupant` and `age` (`Uint8Array.from(...)`) before every call and assert byte-equality after. `Object.freeze` does not protect typed-array contents — comparing buffers is the only real check.
    - **Owns no scheduling state:** `drawFull` called twice with the same grid produces two identical call logs (idempotent, no internal accumulation).
  - [x] **Draw-behaviour tests** through the recording double:
    - Draw order is background-fill → cell groups → grid lines.
    - **Exactly one `beginPath` and one `fill` per group, and exactly one `fillStyle` write per group** — the count assertions that catch the missing-`beginPath` bug.
    - `rect` call count equals the number of non-empty cells; each `rect`'s `(x, y, w, h)` equals `(originX + col*cellSize, originY + row*cellSize, cellSize, cellSize)`.
    - Two organisms sharing a `colorToken` yield one `fillStyle` write, not two (Decision B.2, end to end).
    - Conway's Classic (`agingEnabled: false`) renders at its token's **age-cap** colour — assert the emitted string equals `displayColor('sky-blue', 7)`, i.e. `#56B4E9`'s HSL form. This is the MVP default battle's code path.
    - Grid lines: `cols + 1 + rows + 1` bars when `cellSize >= 4`; none when `setGridLines(false)`; none at `cellSize < 4` even with lines on.
    - Background covers the full backing store (`fillRect(0, 0, canvas.width, canvas.height)`), not just the grid rectangle.
    - A grid whose dimensions disagree with the renderer's `size` throws, with both shapes in the message.
  - [x] ❌ **No pixel or image snapshots** (AR-42). Everything above is decision logic or a call log. The only visual confirmation this story is entitled to is a smoke check, and there is no route rendering a canvas yet — so **no new e2e spec this story**; Story 1.11 adds the Gallery-tile smoke check when a canvas is actually on screen.
  - [x] Where a fixture is needed, build it from `@gol/test-utils` (`emptyGrid`, `gridFromPattern`, `placePattern`, `createMockOrganisms`) through `toRenderableGrid`. Do not hand-roll grid literals — that is what AR-5 exists for. Import via `@/lib/...` (the `vitest.config.mts` alias), not relative paths.

- [x] **Task 7: Verification** (AC: 1–5)
  - [x] `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm test`, then **`npm run ci`** end-to-end. Report the **actual** result.
  - [x] **Bundle: expect it unchanged at 246.7 KB gzip / 300 KB.** Nothing in `apps/web`'s entry graph imports the renderer yet — Story 1.11 is the first consumer. A jump means something (most likely `recordingContext2d.ts` or a test fixture) leaked into a page's import chain. Record the number either way.
  - [x] Confirm `npx eslint apps/web/lib/gridRenderer.ts` is clean **without** any new AR-46 whitelist entry. If a colour literal was needed anywhere, the injection design in Task 5 was not followed.
  - [x] Record in the Dev Agent Record: each forced decision below and the resolution taken; the `desynchronized` narrowing; the resolution of the Story 1.7 deferred `displayColorAt` item; and whether the grid-line overlay cache is active or fell back to direct drawing under jsdom.

## Dev Notes

### Decisions this story is forced to make (flag them in the Dev Agent Record)

1. **⚠️ The frozen contract's constructor is `(canvas, size, palette)` — this story adds a fourth parameter for colours.** The renderer needs a background and a grid-line colour. It cannot hold literals (AR-46 bans raw hex in `apps/web` outside the palette registry), it cannot read `--gol-*` tokens (they land in Story **1.9**, after this one), and it cannot inherit CSS (the Canvas grid is drawn outside MUI — Decision J). Injection is the only option that is correct both now and after 1.9, and it matches the project's DI posture (AR-27): the caller resolves tokens, the renderer paints what it is given.
   - The alternative — `getComputedStyle(canvas).getPropertyValue('--gol-bg-primary')` inside the renderer — welds the renderer to the DOM and the theme layer, returns empty strings in jsdom and before 1.9, and re-reads on every theme flip. Rejected.
   - **This is a deviation from a document labelled "frozen contract".** It is additive and there are no existing call sites, but surface it rather than quietly widening the signature. From the mockups the Story 1.9 values will be `--gol-bg-primary` (`#0a0a0a`) for the dish and `--gol-border` (`#333333`) at 0.3 alpha for the lines (`clinical-lab-theme/petri-dish-lab-mode.html:452-468`).

2. **⚠️ Which `Grid` does the renderer read, given Story 3.3 has not happened?** The contract says `draw(grid: Grid)` meaning RFC-004 §3.4's typed arrays; the only grids that exist today are dense `number[][]`. **Resolution: declare a read-only `RenderableGrid` in `apps/web` with RFC-004's exact field names** (`width`/`height`/`occupant`/`age`) so 3.3's real `Grid` satisfies it structurally, plus a one-way `toRenderableGrid` adapter for the dense at-rest form. Rejected alternatives: rendering `number[][]` directly (breaks the frozen contract and forces a rewrite in Epic 3, and has no `age` at all, so batching cannot be built or tested); creating a placeholder `Grid` in `packages/simulation` (steals 3.3's design and inverts who owns the engine's types).

3. **⚠️ `cellSize` is computed and drawn in device pixels, not CSS pixels.** The AC quotes `floor(canvasPx / dimension)` without saying which pixels. Choosing CSS px and then `ctx.scale(dpr, dpr)` — the conventional HiDPI recipe — makes every cell edge fractional in device space at DPR 1.25/1.5 and produces exactly the soft, seamed grid the story statement's "crisply" rules out. Device-pixel integers with an identity transform is the resolution; the cost is that the layout must be recomputed when DPR changes (a `resize` call, which Story 2.4 already wires to the container observer).

4. **⚠️ Canvas is untestable in jsdom, and this story refuses to add a dependency for it.** `getContext('2d')` returns `null` under jsdom. AR-42 already says the testable surface is decision logic as pure units — Tasks 3 and 4 exist to make the interesting parts canvas-free. What remains (draw order, batching call counts) is covered by a hand-rolled recording double satisfying a narrow structural context type. Adding `canvas` (native) or `vitest-canvas-mock` (an unmaintained jest port) buys pixel fidelity this story is explicitly forbidden from asserting on.

5. **`renderStatic` and `drawFull` have identical bodies in Epic 1 and must still be two methods.** Collapsing them is the obvious simplification and it is wrong: Story 2.3 gives `drawFull` dirty-state reset semantics that a terminal one-shot must not carry, and Story 1.11 must call `renderStatic` so the Gallery's fifty tile renderers never enter the driven-renderer state machine. Two names, one shared private implementation, two doc comments.

### Spec conflicts surfaced (do not silently pick one — this is the project rule)

- **⚠️ Grid dimensions are named `cols`/`rows` in one spec and `width`/`height` in the other.** The frozen contract constructs with `size: { cols, rows }` (`component-tree-battle-page.md:388`); RFC-004 §3.4's `Grid` carries `width`/`height`. They are the same two numbers. **Resolution: keep both, verbatim** — the constructor takes `{ cols, rows }` (the contract wins for its own signature), the grid exposes `width`/`height` (RFC-004 wins for its own type) — and make `drawFull` **assert they agree**. Renaming either would break a frozen contract or pre-empt Story 3.3; the assertion converts the naming seam from a silent-corruption surface into a loud one.
- **⚠️ RFC-002 sets `desynchronized: true` unconditionally; this story defaults it off.** The flag is an interactive-latency optimisation, and the Gallery mounts ~50 canvases (NFR-7.2) — 50 low-latency compositing surfaces is not what RFC-002 §"Recommended Solution" had in mind when it wrote a snippet about the editor canvas. Exposed as an option so Epic 3's playback surface opts in. Narrowing, not contradiction, but flag it.
- **⚠️ RFC-002 prescribes double buffering; this story ships one buffer for cells and one cached overlay for grid lines.** Double buffering pays for itself when partial repaints are composited (Epic 2's dirty regions, Epic 3's 60 Hz loop). For a one-shot full repaint it is a second full-size allocation and a `drawImage` for no benefit — and at ~50 Gallery tiles it is 50 extra canvases. **Story 2.3 is the right place** for the cell-layer buffer, when dirty regions make the composite meaningful. RFC-002 Risk 4's grid-line overlay cache *is* built here because the contract names it on `setGridLines`.

### Silent-failure traps — the intuitive implementation is wrong

- ⚠️ **Missing `ctx.beginPath()` between groups.** Paths accumulate; group *n*'s `fill()` repaints groups 1..*n* in group *n*'s colour. Looks like "the last organism wins", costs O(n²), and passes any test that only checks which colours were used. Assert the call counts.
- ⚠️ **`floor(canvasPx / dimension)` can be 0.** At Gallery-tile sizes it very nearly is. Zero-sized `fillRect` paints nothing and throws nothing — an empty Gallery with a clean console. Clamp to ≥ 1.
- ⚠️ **`alpha: false` makes the unpainted canvas opaque black.** Fill the whole backing store, not just the grid rectangle, or the centring margins render as black bars around the dish.
- ⚠️ **`ctx.scale(dpr, dpr)` re-fractionalises the integer cell size.** Draw in device pixels with an identity transform.
- ⚠️ **`clientWidth`/`clientHeight` are 0 before layout and under jsdom** — a 0×0 backing store renders nothing. Fall back to the canvas's `width`/`height` attributes.
- ⚠️ **Age 0 renders at 30% saturation, and that is correct.** Every initial grid has `age === 0` everywhere, so an *aging* organism looks pale in the Gallery and the editor. That is FR-5.7 / Decision B.3 working, not a bug — but it looks like one, so comment it where the shade is computed.
- ⚠️ **Non-aging organisms key as `(token, 7)`, not `(token, 0)`** — reuse `ageShadeFor`, do not re-derive. Conway's Classic is non-aging; getting this backwards washes out every default battle and every thumbnail (the trap Story 1.7 was built around — do not re-introduce it downstream of the function that solves it).
- ⚠️ **Batching by organism compiles, renders correctly, and is a spec violation** (Decision B.2). The bound must be palette-derived (≤ 160), not roster-derived (≤ 255).
- ⚠️ **A ref ≥ `lut.size` reads `undefined` off a `Uint8Array`** and lands in `displayColorAt`'s silent clamp, painting a real colour on a phantom cell. Skip and warn once.
- ⚠️ **A grid/size dimension mismatch is silent** — short reads garbage, long leaves stale cells. Assert on every draw.
- ⚠️ **Stroked 1 px grid lines straddle pixel boundaries.** `fillRect` at integer coordinates instead; no 0.5 offset, which breaks again at the next DPR.
- ⚠️ **Grid dimensions are parameters, never constants** (Decision A). No `100`, no `60`, no `6000` anywhere — 100×60 is a default and a perf baseline, not a size.

### Previous story intelligence (1.4–1.7)

- **`npm run ci` is where cross-package breakage surfaces, not `npm test`.** Three stories have now been green on `npm test` and broken further down (1.4 on `build:standalone`, 1.5 on `npm run dev`, 1.7's validation doc on a command that matched zero files and exited 0). Run the full gate, and **run any command you put in a comment or doc**.
- **Story 1.6's and 1.7's reviews both hunted ticked-but-unshipped subtasks.** 1.6 had two (an export never added, factories shallower than required); 1.7 had none. The equivalent risks here are the structural no-scheduling test (easy to tick without writing) and the `beginPath`-count assertions (easy to write as a colour check that passes either way). Open the file before ticking.
- **Comment convention:** every non-obvious line carries a WHY naming the failure it prevents, citing the governing id (`(Decision B.2)`, `(AR-23)`, `(A.5)`, `(RFC-002 Risk 4)`). The `max(1, …)` clamp, the `beginPath` call, the device-px choice, the `desynchronized: false` default, and the grid-line suppression threshold each need one. **No review artefacts in code.**
- **`apps/web/vitest.config.mts` aliases `@`** — use `@/lib/...`. It also excludes `scripts/**`; nothing in this story belongs there.
- **Test-only modules are marked by doc comment, not by lint** (`paletteCvd.ts`). `recordingContext2d.ts` follows that precedent; the reviewer will check the bundle figure rather than a rule.
- **`displayColorAt` is the hot-path entry and it clamps silently** — Story 1.7 deferred the diagnostic to this story. Resolve it by resolving tokens at LUT-build time (Task 2), which removes the corrupt-index path rather than instrumenting it.
- **Commit gate stands:** present the file list and a suggested message, then wait for Sidiar. Approval never carries between commits.

### What NOT to build (scope boundaries)

- ❌ **`draw(grid)`, `markDirty(cells)`, dirty-region tracking, cell-layer double buffering** — Story **2.3**.
- ❌ **`<PetriDishCanvas>`, any React component, any pointer→cell mapping** — Stories 2.4/2.5. This story ships a non-React module only; nothing mounts it.
- ❌ **Gallery tiles, thumbnails, `<BattleTile>`** — Story **1.11**, the first caller of `renderStatic`.
- ❌ **`--gol-*` tokens, `themes.css`, MUI, `createTheme()`** — Story **1.9**. Colours arrive as constructor arguments.
- ❌ **`SimulationLoop`, RAF, the time accumulator, `msPerCycle`** — Story **3.8**. AC3 is precisely the promise that this file contains none of it.
- ❌ **The typed-array `Grid` module, `resizeGrid`, Moore neighbourhood, double-buffered pairs** — Story **3.3**.
- ❌ **Organism interning / `id → OrganismRef`** — Story **3.4**. The dense roster index already *is* the ref (Task 2).
- ❌ **A performance benchmark or the coverage-gate flip** — Story **3.7** owns `vitest bench` and the 100×60 hard gate. Do not add a bench file.
- ❌ **Cell animation (FR-8.8), hover highlighting, zoom/pan** — Epic 6 / not in scope; A.5's always-whole-grid auto-fit is why there is no viewport to pan.
- ❌ **A canvas or colour dependency** (`canvas`, `vitest-canvas-mock`, PixiJS). Alternatives 1/4 in RFC-002 are rejected; the test double is ~60 lines.

### Project Structure Notes

```
apps/web/lib/
  renderableGrid.ts        RenderableGrid (structural, RFC-004 field names) + toRenderableGrid   [new]
  renderableGrid.test.ts                                                                          [new]
  refToFillGroup.ts        RefToFillGroup, buildRefToFillGroup, fillGroupOf                       [new]
  refToFillGroup.test.ts                                                                          [new]
  gridLayout.ts            computeGridLayout — auto-fit math, centring, grid-line threshold       [new]
  gridLayout.test.ts                                                                              [new]
  colourStateGroups.ts     groupByColourState — (colorToken, ageShade) batching                   [new]
  colourStateGroups.test.ts                                                                       [new]
  gridRenderer.ts          GridRenderer: drawFull, renderStatic, resize, setGridLines             [new]
  gridRenderer.test.ts     contract tests + recording-double draw behaviour                       [new]
  recordingContext2d.ts    test-only Canvas2D recording double (never imported by app code)       [new]
```

No `package.json` changes, no new dependencies, no ESLint changes (the injected-colour design means no AR-46 whitelist is needed — if one seems necessary, the design was not followed). Filenames are **camelCase, never dotted**. Everything lives in `apps/web` because the renderer needs DOM types and `packages/*` are compiled without the `dom` lib by design.

### References

- [Source: docs/planning-artifacts/epics.md#Story 1.8] — story statement + the five ACs verbatim
- [Source: docs/planning-artifacts/epics.md#Additional Requirements] — **AR-22** (Canvas 2D outside MUI, auto-fit `floor(canvasPx/dimension)`), **AR-23** (batch by `(colorToken, min(age,7))`, ≤160 groups, per-battle ref→fill-group LUT), **AR-25** (loopless `renderStatic`, never stored), **AR-42** (decision logic as pure units, no pixel snapshots), **AR-46** (no raw colour literals), **AR-5** (fixtures come from `@gol/test-utils`)
- [Source: docs/planning-artifacts/epics.md#Story 1.11 / 2.3 / 2.4 / 3.9] — the downstream consumers and exactly which methods each adds
- [Source: docs/planning-artifacts/component-tree-battle-page.md#5] — the **frozen `GridRenderer` contract**, its six methods, the "never calls rAF / never advances state" rule, and the Epic 1/2/3 split
- [Source: docs/planning-artifacts/component-tree-battle-page.md#3.10] — `<PetriDishCanvas>` (Story 2.4+): mounts the canvas, delegates all drawing here, `palette: RefToFillGroup`
- [Source: docs/planning-artifacts/rfcs/RFC-002-grid-rendering-technology.md#High Level Design Proposal] — Canvas 2D, `alpha: false` / `desynchronized`, the batching loop, double buffering
- [Source: docs/planning-artifacts/rfcs/RFC-002-grid-rendering-technology.md#3] — batch by colour state, `refToGroup` + `displayColor`, dirty on occupant **or age-shade** change
- [Source: docs/planning-artifacts/rfcs/RFC-002-grid-rendering-technology.md#Risk 4] — grid lines on a separate cached overlay
- [Source: docs/planning-artifacts/rfcs/RFC-002-grid-rendering-technology.md#§5 note] — the static one-shot `renderStatic` for M4 thumbnails and preview stills
- [Source: docs/planning-artifacts/rfcs/RFC-004-simulation-rules-engine.md#3.4] — the `Grid` typed-array shape (`width`/`height`/`occupant: Uint8Array`/`age: Uint16Array`) this story mirrors structurally
- [Source: docs/planning-artifacts/rfcs/RFC-004-simulation-rules-engine.md#2.1] — `OrganismRef` = index into the battle's dense organisms array
- [Source: docs/planning-artifacts/rfcs/RFC-005-application-state-modes-undo.md#Representation note] — `initialGrid` is the typed-array shape; dense ↔ typed conversion at the load/save boundary; **age is 0 in the initial state**
- [Source: docs/planning-artifacts/architecture.md#Decision A.5] — auto-fit: whole grid always visible, re-lays-out and full-repaints on resize
- [Source: docs/planning-artifacts/architecture.md#Decision B.2] — batch by `(colorToken, min(age,7))`; non-aging keys as `(token, 7)`; ≤160 groups, palette-derived not roster-derived
- [Source: docs/planning-artifacts/architecture.md#Decision B.3 / B.5] — the saturation ramp and the `MAX_RELEVANT_AGE` constant that must not be conflated with the visual cap
- [Source: docs/planning-artifacts/architecture.md#Decision G.3 / H.1] — 255 organisms per battle; `organismIds` ≡ the placed set
- [Source: docs/planning-artifacts/architecture.md#Minor Resolutions M4] — thumbnails rendered on demand through the existing renderer, never stored
- [Source: docs/implementation-artifacts/1-7-palette-token-registry-display-color-lut.md] — `displayColorAt(tokenIndex, shade)` and its `tokenIndex * 8 + shade` table layout; `ageShadeFor`; `paletteIndexOf`'s warn-once fallback; the "what NOT to build" note deferring `buildRefToFillGroup` to this story
- [Source: docs/implementation-artifacts/deferred-work.md:53] — the deferred `displayColorAt` silent-clamp diagnostic, explicitly assigned to this story
- [Source: apps/web/lib/displayColor.ts:44-73] — the 160-entry table and its indexing arithmetic, which Task 2's group key must match
- [Source: packages/domain/src/battleSchema.ts:20-45] — `gridState` dense encoding, `v ≤ organismIds.length`, dims match `gridSize`
- [Source: packages/test-utils/src/gridBuilders.ts] — `emptyGrid` / `gridFromPattern` / `placePattern`, and the eager-validation convention `toRenderableGrid` follows
- [Source: packages/test-utils/src/mockWorkspace.ts:169-197] — the AR-45 mock organisms (`vermillion` non-aging, `azure` aging, `bluish-green` non-aging) Task 2's tests build on
- [Source: docs/planning-artifacts/ux-designs/.../clinical-lab-theme/petri-dish-lab-mode.html:452-468] — dish surface `--bg-primary` `#0a0a0a`, grid lines `--border` `#333333` at 0.3 opacity, 5:3 aspect (every preset is 5:3, so auto-fit wastes no space)
- [Source: docs/project-context.md#Framework-Specific Rules] — the Canvas grid is drawn outside MUI; hot state in refs; no DOM types in `packages/*`
- [Source: docs/project-context.md#Critical Don't-Miss Rules] — never batch by organism; grid dimensions are never constants; `Uint16Array` age / `Uint8Array` occupant

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5 (claude-sonnet-5), via the `bmad-dev-story` skill.

### Debug Log References

- `npm run typecheck` (root, `turbo run typecheck`): clean, all 5 packages.
- `npm run lint` → `npx eslint apps/web/lib/*.ts` for the new/changed files: clean, **no new AR-46 whitelist entry** added to `eslint.config.mjs`.
- `npm run format:check`: clean after one `prettier --write` pass on `colourStateGroups.ts`/`.test.ts` and `gridRenderer.test.ts` during development.
- `npm test` (`apps/web`): 12 files, **157 tests passed** (19 new in `gridRenderer.test.ts`, plus `renderableGrid.test.ts` 5, `refToFillGroup.test.ts` 6, `gridLayout.test.ts` 10, `colourStateGroups.test.ts` 8).
- `npm run ci` end-to-end (typecheck → lint → format:check → test:coverage → build:standalone → bundle:check → e2e): **all green**. `web` coverage 94.82% stmts / 85.13% branch (no gate on `apps/web` by design — RFC-008 Decision 3). e2e: 12/12 Playwright specs passed across chromium/firefox/webkit/tablet.
- Bundle check: **246.7 KB gzip / 300 KB budget, 53.3 KB headroom — unchanged from the pre-story baseline**, confirming nothing in this story's file set leaked into the Next.js entry graph (Story 1.11 is the first consumer).
- jsdom confirmed to print `Not implemented: HTMLCanvasElement's getContext() method: without installing the canvas npm package` for every canvas the recording double doesn't explicitly intercept — this is `gridRenderer.test.ts`'s "construction throws when getContext returns null" case exercising real, unmocked jsdom, and is also what the grid-line overlay canvas hits every time (see Completion Notes).

### Completion Notes List

**Five forced decisions (Dev Notes) — resolutions taken:**

1. **Fourth constructor parameter (`GridRendererOptions.colors`).** Implemented exactly as scoped: `background`/`gridLine` are injected strings, resolved by the caller (Story 1.9 will pass `--gol-*` values via `getComputedStyle`); the renderer holds no DOM/theme dependency and no colour literal. Flagged as a deviation from the "frozen" constructor signature in the file's own doc comments, per the Dev Notes instruction.
2. **`RenderableGrid` structural seam.** Declared in `apps/web/lib/renderableGrid.ts` with RFC-004 §3.4's exact field names (`width`/`height`/`occupant`/`age`); Story 3.3's real `Grid` will satisfy it with zero adaptation. `toRenderableGrid` is the one-way dense→typed adapter, ~25 lines, no resize/round-trip logic.
3. **Device-pixel auto-fit.** `GridRenderer` sizes the backing store from `clientWidth/clientHeight * devicePixelRatio` (falling back to the canvas's existing `width`/`height` attributes pre-layout/under jsdom), computes `GridLayout` against that backing-store size, and holds an identity transform for its lifetime (`setTransform(1,0,0,1,0,0)`) — never `ctx.scale(dpr, dpr)`.
4. **No-new-dependency canvas testing.** `recordingContext2d.ts` is a hand-rolled double implementing only the `Canvas2D` alias's members (`fillStyle`/`fillRect`/`beginPath`/`rect`/`fill`/`drawImage`/`setTransform`), installed via `vi.spyOn(HTMLCanvasElement.prototype, 'getContext')` scoped to one canvas instance (`this === canvas`); every other canvas — critically, the grid-line overlay's offscreen canvas — falls through to real, unmocked jsdom, which returns `null`. Exactly one `as unknown as CanvasRenderingContext2D` cast exists in the whole file, at the mock's return statement, with a comment naming why.
5. **`renderStatic`/`drawFull` stay two methods**, sharing a private `paint()` body, each with its own doc comment explaining the Story 2.3 divergence it exists to leave room for. Neither is exported as an alias of the other.

**`desynchronized` narrowing:** implemented as documented — defaults to `false` (against RFC-002's unconditional-`true` snippet), exposed as a constructor option for Epic 3's playback surface to opt into. Comment in `gridRenderer.ts` cites the ~50-tile Gallery cost (NFR-7.2) as the reason.

**Story 1.7 deferred `displayColorAt` silent-clamp item — resolved as scoped.** `buildRefToFillGroup` (`refToFillGroup.ts`) calls `paletteIndexOf` once per roster organism at LUT-build time (once per battle), not once per cell per frame. Every `tokenIndex` slot the renderer's inner loop reads is therefore already in `[0, PALETTE.length)`, so `displayColorAt`'s silent clamp is never exercised on a corrupt index during a real render — the diagnostic moved to a path that is affordable to run. Verified by `refToFillGroup.test.ts`'s "falls back to the default token and warns once" case.

**Grid-line overlay cache: built the mechanism, but it never activates under jsdom.** `rebuildGridLineOverlay()` creates an offscreen `<canvas>` and calls its own `getContext('2d')`; under jsdom (no native `canvas` package) that call returns `null` regardless of the recording double installed on the *primary* canvas, since the spy in `recordingContext2d.ts` is scoped to one specific `HTMLCanvasElement` instance. Every test run therefore exercises the RFC-002 Risk 4 fallback path — direct `fillRect` line drawing — never the cached `drawImage` path. This is the correct behaviour for Epic 1 (no route mounts a canvas yet); the cached path activates the first time this code runs in a real browser (Story 2.4+).

**Spec conflicts surfaced (Dev Notes) — all three implemented as documented, not silently resolved:**
- `cols`/`rows` (constructor) vs `width`/`height` (`RenderableGrid`) kept as two names for the same two numbers; `assertGridMatchesSize` throws a named `GridRendererDimensionMismatchError` naming both shapes if they disagree.
- `desynchronized` defaults `false`, narrowing RFC-002's unconditional `true` — see above.
- Cell-layer double buffering deferred to Story 2.3; only the grid-line overlay is cached here, per RFC-002 Risk 4's explicit scope.

**One additional design call beyond the story's named forced decisions**, made and documented in `gridRenderer.ts`'s `resize()` doc comment: if `resize()` is called with a NEW `{ cols, rows }` (a genuine grid-dimension change, Story 2.14) rather than an unchanged size (a canvas-box-only change, Story 3.18), the previously-drawn `lastGrid` no longer matches and `resize()` skips the repaint rather than throwing or painting stale content — it waits for the caller's next `drawFull` with a correctly-sized grid. No test in this story exercises the dimension-change path (Story 2.14 is out of scope), so this is a forward-looking contract note, not a tested behaviour.

**No pixel/image snapshots** were added (AR-42) — every assertion in the six new test files is over decision logic (auto-fit math, batch grouping keys, dimension checks) or an ordered call log from the recording double. No new e2e spec — no route mounts a canvas yet (Story 1.11).

### File List

- `apps/web/lib/renderableGrid.ts` (new)
- `apps/web/lib/renderableGrid.test.ts` (new)
- `apps/web/lib/refToFillGroup.ts` (new)
- `apps/web/lib/refToFillGroup.test.ts` (new)
- `apps/web/lib/gridLayout.ts` (new)
- `apps/web/lib/gridLayout.test.ts` (new)
- `apps/web/lib/colourStateGroups.ts` (new)
- `apps/web/lib/colourStateGroups.test.ts` (new)
- `apps/web/lib/gridRenderer.ts` (new)
- `apps/web/lib/gridRenderer.test.ts` (new)
- `apps/web/lib/recordingContext2d.ts` (new, test-only)

## Change Log

- 2026-08-06: Story created (context engine run against epics 1.8 + AR-22/23/25/42/46, RFC-002 §3/§5/Risk 4, RFC-004 §2.1/§3.4, RFC-005's representation note, architecture Decisions A.5/B.2/B.3/G.3/M4, the frozen `GridRenderer` contract in `component-tree-battle-page.md`, the Clinical Lab petri-dish mockup, and the shipped Story 1.3–1.7 code). Five forced decisions are flagged for the Dev Agent Record — the colour-injection fourth constructor parameter, the `RenderableGrid` structural seam standing in for Story 3.3's `Grid`, device-pixel auto-fit, the no-new-dependency canvas testing strategy, and keeping `renderStatic`/`drawFull` distinct. Three spec conflicts surfaced rather than silently resolved: `cols/rows` vs `width/height`, `desynchronized` defaulting off against RFC-002's snippet, and deferring cell-layer double buffering to Story 2.3. Status → ready-for-dev.
- 2026-08-06: Implemented Tasks 1–7. All 7 tasks / 51 subtasks complete; `npm run ci` green end-to-end; bundle unchanged at 246.7 KB gzip. Status → review.
