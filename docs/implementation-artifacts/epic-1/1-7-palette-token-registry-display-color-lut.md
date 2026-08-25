---
baseline_commit: a76508e
---

# Story 1.7: Palette Token Registry & Display-Color LUT

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a user,
I want organisms to have distinguishable, consistent colors everywhere they appear,
so that I can tell life forms apart at a glance in any view.

## Acceptance Criteria

1. **Given** the palette registry, **When** defined, **Then** it contains 20 curated tokens ordered by distinguishability, with the CVD-consideration check documented (AR-26, NFR-8.3)
2. **Given** an organism's `colorToken`, **When** rendered, **Then** hex is resolved at render time from the registry — never stored on the organism (AR-26)
3. **Given** `displayColor(token, ageShade)`, **When** computed, **Then** the LUT applies the constant-lightness saturation ramp (30% at age 0, +10%/cycle, 100% cap at age 7) and non-aging organisms resolve to the age-cap base color (FR-5.7 groundwork; consumed fully in Epic 3)
4. **And** LUT arithmetic is unit-tested; the registry file is a whitelisted location for the AR-46 lint rule

## Tasks / Subtasks

- [x] **Task 1: The palette token registry** (AC: 1, 2)
  - [x] New file `apps/web/lib/paletteRegistry.ts`. This is the **only** file in the repo permitted to contain organism-colour hex literals (Task 5 whitelists it for AR-46).
  - [x] Shape, per RFC-007 Decision 1 — but with `h`/`s`/`l` **derived from the hex at module init, never hand-written**:

    ```ts
    export interface PaletteColor {
      readonly id: string;    // STABLE token — what organisms persist. Never reused, never renamed.
      readonly name: string;  // human label for the Story 4.8 picker — decoupled from the hex
      readonly hex: string;   // authoring value — TUNABLE with zero data migration (RFC-007 Decision 1)
      readonly h: number;     // 0-360, derived
      readonly s: number;     // 0-1, derived — the token's OWN saturation, and the anchor
                              //   the age ramp scales against (decision 1). Load-bearing, not decorative.
      readonly l: number;     // 0-1, derived
    }
    export const PALETTE_VERSION = 1 as const;
    export const PALETTE: readonly PaletteColor[];   // exactly 20, in RFC-007 Decision 2 order
    ```

    RFC-007's snippet declares `h`/`s`/`l` as fields "derived from hex; cached". Deriving them once at module load **is** that cache and makes drift impossible; a hand-written triple that disagrees with its own hex is a silent-failure surface with no test that would catch it.
  - [x] The 20 entries, **verbatim from RFC-007 Decision 2, in this exact order** — the order is the FR-2.3 default-assignment order (Story 4.8) and the "safe core first" guarantee, so it is load-bearing data, not presentation:

    | # | `id` | `name` | `hex` |
    |---|---|---|---|
    | 1 | `sky-blue` | Sky Blue | `#56B4E9` |
    | 2 | `vermillion` | Vermillion | `#D55E00` |
    | 3 | `bluish-green` | Bluish Green | `#009E73` |
    | 4 | `amber` | Amber | `#E69F00` |
    | 5 | `reddish-purple` | Reddish Purple | `#CC79A7` |
    | 6 | `yellow` | Yellow | `#F0E442` |
    | 7 | `azure` | Azure | `#3B82F6` |
    | 8 | `coral-red` | Coral Red | `#FF6B5E` |
    | 9 | `teal` | Teal | `#2DD4BF` |
    | 10 | `violet` | Violet | `#B388FF` |
    | 11 | `lime` | Lime | `#A3E635` |
    | 12 | `magenta` | Magenta | `#F25CC1` |
    | 13 | `cyan` | Cyan | `#67E8F9` |
    | 14 | `tangerine` | Tangerine | `#FB923C` |
    | 15 | `indigo` | Indigo | `#818CF8` |
    | 16 | `mint` | Mint | `#6EE7B7` |
    | 17 | `rose` | Rose | `#FB7185` |
    | 18 | `chartreuse` | Chartreuse | `#D9F99D` |
    | 19 | `lavender` | Lavender | `#C4B5FD` |
    | 20 | `periwinkle` | Periwinkle | `#93C5FD` |

    ⚠️ **Tokens 1–8 are the CVD-robust core** (Okabe-Ito / Paul-Tol derived). Task 4's hard gate applies to them specifically. Do not reorder.
  - [x] Resolution API — **fallback, never throw, never reject** (Decision I.4 / NFR-7.3):

    ```ts
    export const DEFAULT_COLOR_TOKEN = 'sky-blue';        // token #1, and Conway's Classic's token
    export function resolvePaletteColor(token: string): PaletteColor   // unknown -> default + warn once
    export function paletteIndexOf(token: string): number              // unknown -> index of the default
    ```

    ⚠️ **An unknown token is a degrade-and-warn case, not an error.** A file written by a newer build, or one whose token a future `formatVersion` step has not yet rewritten, must still render (Decision I.4: *"Unknown tokens in a same-format file still degrade gracefully (default + warn)"*). Throwing here would turn a cosmetic mismatch into a blank Gallery.
  - [x] **Warn once per unknown token, not once per call.** This resolves inside the render path; an un-deduped `console.warn` fires per cell per frame and drowns the console at 60 FPS. Keep a module-level `Set<string>` of already-warned tokens. Note the existing e2e asserts a clean console on the happy path — no known token may ever warn.
  - [x] Tests (`apps/web/lib/paletteRegistry.test.ts`): exactly 20 entries; all `id`s unique; all `name`s unique; ids are kebab-case and contain no `#`; the first 8 ids equal the CVD-core list in order; every derived `h`/`s`/`l` round-trips back to its own `hex` (within 1/255 per channel) — the test that proves the derivation, not the transcription; `resolvePaletteColor('not-a-token')` returns the `sky-blue` entry and warns exactly once across repeated calls; `PALETTE_VERSION === 1`.

- [x] **Task 2: Colour math primitives** (AC: 3)
  - [x] New file `apps/web/lib/colorMath.ts` — pure, dependency-free, no DOM: `hexToRgb`, `rgbToHsl`, `hslToRgb`, `rgbToHex`, `hexToHsl`, `formatHsl`.
  - [x] ⚠️ **`hex` is normalised on the way in.** Accept `#RRGGBB` only (the registry writes nothing else); reject anything else loudly at module init rather than producing `NaN` channels that surface as a black grid three stories later.
  - [x] `formatHsl(h, sPercent, lPercent): string` emits the **legacy comma form** — `hsl(201.2, 76.9%, 62.5%)`. Canvas `fillStyle` accepts both syntaxes in current engines, but the e2e matrix runs Chromium/Firefox/**WebKit** and the comma form is the one with no version floor. Round `h`, `s` and `l` to **1 decimal place** — `s` is fractional under the decision-1 ramp, so it needs the same treatment as the other two.
  - [x] ⚠️ **Build the string by template substitution, never as a literal.** `` `hsl(${h}, ${s}%, ${l}%)` `` splits into template elements (`hsl(`, `, `, `%, `, `%)`) and none matches AR-46's `(rgb|rgba|hsl|hsla)\([^)]*\)` selector — so `colorMath.ts` needs **no** lint whitelist. A helper that returned a literal `'hsl(0, 0%, 0%)'` fallback would fail lint; return via the same template path.
  - [x] Tests (`colorMath.test.ts`): hex→HSL→hex round-trips for all 20 registry hexes and for the achromatic edge cases (`#000000`, `#ffffff`, `#808080` — `s === 0`, and `rgbToHsl` must not divide by zero); hue wrap at the red boundary (`#ff0001` vs `#ff0100`); `formatHsl` rounding is stable and produces no `-0`.

- [x] **Task 3: The display-colour LUT** (AC: 3)
  - [x] New file `apps/web/lib/displayColor.ts`:

    ```ts
    export const MAX_AGE_SHADE = 7;        // FR-5.7 visual cap — NOT the engine's MAX_RELEVANT_AGE
    export function ageShadeFor(age: number, agingEnabled: boolean): number;   // aging ? min(age,7) : 7
    export function displayColor(token: string, ageShade: number): string;
    export function displayColorAt(tokenIndex: number, ageShade: number): string;  // hot path, no lookup
    ```

  - [x] **Precompute the whole table at module init — all 20 tokens × 8 shades = 160 strings.** RFC-007 says "per battle, entries in use"; the full table is 160 short strings built once, which is strictly less work than any per-battle construction and removes an entire class of stale-cache bug. Flag this as forced decision 3.
  - [x] The transform — **relative to the token's own saturation** (decision 1, Sidiar 2026-08-06), lightness held constant:

    ```
    s = entry.s * (30 + 10 * ageShade) / 100      // 30% … 100% OF THE TOKEN'S OWN SATURATION
    color = hsl(entry.h, s%, entry.l)
    ```

    At `ageShade = 7` this is exactly `entry.s` — i.e. **`displayColor(token, 7)` reproduces `entry.hex`**. That equality is the point of the decision and Task 3's strongest test.
    - ⚠️ **Mind the rounding budget on that identity.** `hex → h/s/l → 1-dp string → rgb` is a lossy round-trip; assert the identity as **≤1/255 per channel**, not on the string. If any token drifts by more than that, raise `formatHsl`'s precision to 2 dp rather than weakening the assertion — the identity is what makes the picker swatch and the grid cell provably the same colour.
  - [x] ⚠️ **Compute the ramp factor as an integer percent (`30 + 10 * shade`) before scaling.** In IEEE-754 the float form `0.30 + 0.10 * shade` gives `0.7000000000000001` at shade 4 and `0.9999999999999999` at shade 7 — the latter is what would break the `displayColor(token, 7) === hex` identity above by a hair.
  - [x] ⚠️ **`ageShadeFor` is where non-aging organisms are handled, and it returns 7, not 0.** A non-aging organism renders at its token's **age-cap** colour (architecture B.2: *"a non-aging organism renders at its token's base colour … its group key is `(token, 7)`"*). The intuitive `agingEnabled ? min(age,7) : 0` renders every non-aging organism at 30% saturation — a washed-out grid that looks like a rendering bug and is a spec violation. Conway's Classic has `agingEnabled: false`, so this is the code path the entire MVP's default battle takes.
  - [x] ⚠️ **Clamp defensively:** `ageShade` out of `[0, 7]` (negative, fractional, `NaN`, or an un-capped raw age) must clamp rather than index off the end of the table and return `undefined` into `ctx.fillStyle` — which silently paints the previous group's colour instead of throwing.
  - [x] Tests (`displayColor.test.ts`): **`displayColor(id, 7)` round-trips to `entry.hex` for all 20 tokens** (the decision-1 identity — the single most valuable assertion in this story); the ramp produces exactly `30%…100%` *of the token's own saturation* across shades 0–7; **lightness is byte-identical across all 8 shades of the same token** (the constant-lightness invariant — the property the CVD mitigation depends on, so assert it directly, for every token); hue is identical across all 8 shades; `ageShadeFor(0, false) === 7` and `ageShadeFor(0, true) === 0`; `ageShadeFor(99, true) === 7`; out-of-range and `NaN` shades clamp; the table has exactly 160 distinct entries and `displayColor(token, s) === displayColorAt(paletteIndexOf(token), s)` for all 160 combinations; an unknown token resolves through the Task 1 fallback rather than throwing.

- [x] **Task 4: CVD + dark-background validation, gated and documented** (AC: 1)
  - [x] New file `apps/web/lib/paletteCvd.ts` — the validation math, imported **only** by its test and by the Story 4.9 / 6.11 re-confirmations. It must never be imported by component code (Task 6 verifies the bundle is unchanged).
  - [x] Pure functions, no dependency (nothing in this toolchain does colour science, and adding one for a check that runs in CI is not worth the bundle/audit surface):
    - `relativeLuminance(hex)` and `contrastRatio(hexA, hexB)` — WCAG 2.x definition, on **linear** sRGB.
    - `srgbToLab(rgb)` (D65) and `deltaE76(labA, labB)`.
    - `simulateCvd(rgbLinear, type)` for `'protan' | 'deutan' | 'tritan'` — Machado et al. (2009) severity-1.0 matrices, applied in **linear** sRGB, clamped to `[0,1]`:

      ```
      protan  [ 0.152286,  1.052583, -0.204868]  [ 0.114503, 0.786281, 0.099216]  [-0.003882, -0.048116, 1.051998]
      deutan  [ 0.367322,  0.860646, -0.227968]  [ 0.280085, 0.672501, 0.047413]  [-0.011820,  0.042940, 0.968881]
      tritan  [ 1.255528, -0.076749, -0.178779]  [-0.078411, 0.930809, 0.147602]  [ 0.004733,  0.691367, 0.303900]
      ```

    - ⚠️ **Every step operates on linearised sRGB.** Running the CVD matrices or the luminance sum on gamma-encoded 0–255 values produces plausible-looking numbers that are simply wrong, and nothing downstream would catch it. The reproduction table below is the check that your implementation is right.
  - [x] The check evaluates **what users actually see** — i.e. `displayColor` outputs at every age shade — **not the raw registry hexes.** The hexes are an authoring input; a cell is never painted with one (see forced decision 1).
  - [x] **Hard gates** (`paletteCvd.test.ts` — these fail CI):
    - **G1 — visibility.** Every token, at the age-cap shade, has contrast ratio ≥ **3.0** against both `#0a0a0a` (Clinical Lab) and `#000000` (Biotech Terminal). *Actual worst: 5.12 / 5.43 (`vermillion`).*
    - **G2 — visibility while young.** Every token, at **every** shade 0–7, has contrast ratio ≥ **2.5** against `#0a0a0a`. *Actual worst: 3.00.*
    - **G3 — normal-vision distinctness.** All 20 tokens are pairwise ≥ **8.0** ΔE76 at the age-cap shade under normal vision. *Actual worst: 12.79 (`azure`/`indigo`).*
    - **G4 — CVD-robust core.** Tokens **1–8** are pairwise ≥ **4.0** ΔE76 at **every** shade 0–7 under normal, protan, deutan **and** tritan simulation. *Actual worst: 4.74 (protan, `bluish-green`/`coral-red`).*
  - [x] ❌ **Do NOT gate all 20 tokens under CVD simulation — it is not achievable and the spec says so.** RFC-007 Decision 2: *"Twenty colours that stay distinct under CVD is not fully achievable with hue alone — qualitative CVD-safe sets max out around 8–12."* Measured, the full set bottoms out at ΔE76 **1.32** (`lavender`/`periwinkle` under deutan at the age cap) and **1.57** (`reddish-purple`/`teal`, deutan, mid-ramp). A gate that "obviously should" cover all 20 fails on day one, and the tempting fix — lowering the threshold until it passes — silently deletes G4's real protection. The all-20 matrix is **recorded, not gated**; product already handles the residue with the FR-3.3 same-colour warning.
  - [x] **Reproduction table — verify your implementation against these before trusting the gates.** Minimum pairwise ΔE76 over `displayColor` outputs, under the decision-1 relative ramp:

    | shade | mode | core 1–8 worst pair | all 20 worst pair | min contrast vs `#0a0a0a` |
    |---|---|---|---|---|
    | 0 | normal | 13.17 (sky-blue/azure) | 6.24 (coral-red/rose) | 3.05 |
    | 0 | protan | 5.85 (sky-blue/reddish-purple) | 2.26 (violet/indigo) | 3.05 |
    | 0 | deutan | 9.69 (sky-blue/reddish-purple) | 2.87 (mint/rose) | 3.05 |
    | 0 | tritan | 6.63 (sky-blue/azure) | 4.07 (coral-red/rose) | 3.05 |
    | 3 | normal | 24.05 (vermillion/amber) | 11.56 (violet/indigo) | 4.01 |
    | 3 | protan | 11.68 (bluish-green/coral-red) | 2.13 (violet/indigo) | 4.01 |
    | 3 | deutan | 14.61 (vermillion/amber) | 1.14 (reddish-purple/teal) | 4.01 |
    | 3 | tritan | 10.66 (sky-blue/azure) | 6.72 (coral-red/rose) | 4.01 |
    | 7 | normal | 31.50 (vermillion/coral-red) | 12.79 (azure/indigo) | 5.12 |
    | 7 | protan | 7.17 (bluish-green/coral-red) | 1.88 (violet/indigo) | 5.12 |
    | 7 | deutan | 17.03 (amber/yellow) | 1.32 (lavender/periwinkle) | 5.12 |
    | 7 | tritan | 9.00 (vermillion/coral-red) | 5.73 (teal/mint) | 5.12 |

    Worst case across **all** eight shades — what G4 actually gates on: core-8 protan **4.74**, tritan **6.63**, deutan **9.69**, normal **13.17**; all-20 deutan **1.57**, protan **1.88**.

    Numbers within ~±0.1 are fine (rounding). Numbers that are wildly different mean the pipeline is wrong — most likely a missing sRGB linearisation. If a gate genuinely fails, **re-tune that entry's `hex`** (explicitly permitted, zero data migration, RFC-007 Decision 1) and record the change; **never rename or remove a token `id`** — that is a destructive change requiring a `formatVersion` migration step (Decision I.1), and `sky-blue` / `vermillion` / `bluish-green` / `azure` are already persisted by shipped fixtures.
  - [x] **New doc `docs/implementation-artifacts/palette-cvd-validation.md`** — this is what AC1's "documented check" means. It must contain: the method (linear sRGB → Machado severity-1.0 → CIE-Lab → ΔE76; WCAG contrast on linear luminance), the four gate thresholds and why each is set where it is, the full worst-pair table above, the **named list of pairs that are known-indistinguishable under CVD** (deutan: `lavender`/`periwinkle`, `violet`/`indigo`; protan: `yellow`/`lime`, `violet`/`indigo`; tritan: `teal`/`mint`, `cyan`/`mint`) with a pointer to the FR-3.3 same-colour warning as the product mitigation, the exact command that reproduces it, and the date. Stories 4.9 and 6.11 both re-confirm against this document — write it for them, not as a ceremony.

- [x] **Task 5: Wire the registry into the toolchain and the existing code** (AC: 2, 4)
  - [x] **`eslint.config.mjs`** — add `'apps/web/lib/paletteRegistry.ts'` to the **AR-46 block's** `ignores` and replace the `TODO(1.7)` comment with a statement of the rule (organism-colour hexes live in the registry and the `--gol-*` token layer, nowhere else).
    - ⚠️ **The AR-46 block only.** The `no-restricted-imports` block directly below it carries an identical `files`/`ignores` pair; adding the registry there would exempt it from the `@gol/test-utils` import boundary too. Two blocks, one edit.
    - Verify both directions: `npx eslint apps/web/lib/paletteRegistry.ts` is clean, and a scratch hex literal added to any other `apps/web` non-test file still errors (then remove it).
  - [x] **`packages/domain/src/organismSchema.ts`** — the `colorToken` comment currently promises *"validation against the real palette registry lands in Story 1.7."* **Correct it; do not implement it.** Tightening the schema to the 20 known ids would reject exactly the records Decision I.4 requires to load with a fallback, and would put `@gol/domain` (no DOM, no app imports) in the position of depending on an `apps/web` module. Rewrite the comment to say resolution-with-fallback happens at render time in `apps/web/lib/paletteRegistry.ts`, and that the `#` guard remains the schema's only colour check. **No behavioural change to the schema in this story.**
  - [x] **New test `apps/web/lib/paletteTokenUsage.test.ts`** — the cross-package guard the schema deliberately does not provide: every `colorToken` on `CONWAYS_CLASSIC` (`@gol/domain`) and on all three AR-45 mock organisms (`@gol/test-utils`) resolves to a **real** registry entry, i.e. `PALETTE.some(c => c.id === token)` — assert membership directly, **not** via `resolvePaletteColor`, which by design returns the default for a bad token and would make this test pass on exactly the failure it exists to catch. Currently in use: `sky-blue`, `vermillion`, `azure`, `bluish-green`.
    - This lives in `apps/web` because it is the only workspace that can import the registry, `@gol/domain` **and** `@gol/test-utils` at once; test files are exempt from the Story 1.2 import boundary, so the `@gol/test-utils` import is legal here.

- [x] **Task 6: Verification** (AC: 1–4)
  - [x] `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run test` green, then **`npm run ci`** end-to-end. Report the **actual** result, including the bundle figure.
  - [x] **Bundle: expect it effectively unchanged from 246.7 KB gzip / 300 KB** (the Story 1.6 baseline). Nothing in `apps/web` imports the registry yet — Story 1.8 is the first consumer — so a jump means `paletteCvd.ts` or the 160-string table got pulled into the entry graph. Record the number either way.
  - [x] Record in the Dev Agent Record: the four forced decisions and which resolution you took; the actual measured worst-case numbers from Task 4 (not the ones copied from this story — yours); any hex you re-tuned and why.

### Review Findings

_Code review 2026-08-06 (three parallel layers: blind adversarial, edge-case, acceptance audit). 2 decision-needed, 15 patch items, 9 deferred, 5 dismissed as noise. **All decision and patch items resolved and applied the same day** (Sidiar: check in a sweep script; record the measured pair list). The 9 deferred items are logged in `deferred-work.md`. Full `npm run ci` green after the fixes: 351 tests, 12/12 e2e, bundle unchanged at 246.7 KB gzip._

_**The code is correct and every AC is met.** All 20 registry rows were compared character-for-character against RFC-007 Decision 2 — ids, names, hexes and order are exact. The four traps this story was written around all landed right: the ramp scales `entry.s` (not an absolute 100%), the ramp percent is integer-first, `ageShadeFor(_, false)` returns `7`, and the AR-46 whitelist went into the `no-restricted-syntax` block with the `no-restricted-imports` boundary block left byte-unchanged. `organismSchema.ts` is comment-only. **No ticked-but-unshipped subtask was found** — the Story 1.6 failure mode did not recur. The four gate figures were independently recomputed twice from scratch and reproduce exactly (G1 5.12, G2 3.06, G3 12.79, G4 4.77 — the last at shade 5, a genuine non-monotone dip, not a transcription error). 108/108 web tests green._

_**The defects are concentrated in `palette-cvd-validation.md` — which is the AC1 deliverable and the artifact Stories 4.9 and 6.11 re-confirm against — and in `colorMath`'s handling of non-finite input.**_

- [x] [Review][Decision] **The worst-pair table has no checked-in reproducer** — Task 4 required the doc to carry "the exact command that reproduces it". The doc states the table "was captured with a throwaway `tsx` script during development (not checked in)"; `paletteCvd.test.ts` asserts only `>= threshold` and never emits a number, so nothing in the repo regenerates the table and every figure in it (and in four test-file header comments) rots silently on the first hex re-tune. Two reviewers independently had to re-implement the sweep to verify it. Options: (a) check the sweep script in under `scripts/`, (b) add a dump mode to `paletteCvd.test.ts` behind an env flag, (c) accept prose-only and drop the numbers. [docs/implementation-artifacts/palette-cvd-validation.md:4-8]
- [x] [Review][Decision] **The story's prescribed known-indistinguishable pair list disagrees with measurement — which governs?** — Task 4 names the list to record (`protan: yellow/lime, violet/indigo`). Measured over all 8 shades, protan `yellow`/`lime` bottoms out at **3.37** while three *unlisted* protan pairs are worse: `teal`/`rose` **1.53**, `violet`/`indigo` **1.88**, `lavender`/`periwinkle` **2.79**. Likewise the worst deutan pair overall is `reddish-purple`/`teal` (**1.21**), which the list omits entirely. Recording the story's list verbatim documents the wrong pairs; recording the measured set deviates from the story text. Recommend the measured set (superset), with a note that the story's prescribed list predates the relative-ramp resolution. Per the project rule this conflict is surfaced, not silently resolved. [docs/implementation-artifacts/palette-cvd-validation.md:100-103]
- [x] [Review][Patch] **The documented reproduction command runs zero tests and exits 0** — `npx vitest run apps/web/lib/paletteCvd.test.ts` run from `apps/web/` (as the doc instructs) resolves against a root that is already `apps/web`, so the filter never matches: `No test files found, exiting with code 0`. Verified. A future 4.9/6.11 re-confirmation gets a green exit having asserted nothing — exactly the silent-failure shape this story was written to avoid. Correct form: `npx vitest run lib/paletteCvd.test.ts` (46 tests pass). [docs/implementation-artifacts/palette-cvd-validation.md:4]
- [x] [Review][Patch] **The all-shade summary understates the all-20 protan worst case** — doc records "all-20 … protan **1.88**"; the true minimum over all pairs and shades is **1.53** (`teal`/`rose`, shade 2). The table samples only shades 0/3/7 and `teal`/`rose` dips between them, so the summary line inherits a sampling gap. (deutan 1.21 and all four core-8 figures are correct.) [docs/implementation-artifacts/palette-cvd-validation.md:80-82]
- [x] [Review][Patch] **The pair list misattributes ΔE76 1.21 to deutan `violet`/`indigo`** — the doc's own worst-pair table two sections above assigns 1.21 to `reddish-purple`/`teal`. Measured, deutan `violet`/`indigo` bottoms out at **3.43** (shade 0) and is 6.38 at the age cap. The doc contradicts itself. [docs/implementation-artifacts/palette-cvd-validation.md:100-101]
- [x] [Review][Patch] **`colorMath` primitives accept non-finite input and return plausible garbage** — `hexToRgb` rejects malformed input loudly, but its four siblings have no input discipline, and each failure is silent rather than loud. Verified cases: `rgbToHex({r:NaN,…})` → `"#NaNNaNNaN"` (the clamp is `Math.max(0, Math.min(255, Math.round(n)))`, and NaN survives every step); `formatHsl(NaN,…)` → `"hsl(NaN, NaN%, NaN%)"`, which assigned to `ctx.fillStyle` is a **no-op** that keeps the previous fill colour — precisely the failure `displayColor.ts` clamps against, but the h/s/l inputs are unguarded; `rgbToHsl(NaN,0,0)` → all-NaN, because `max === min` is false for NaN so the achromatic short-circuit never fires; `hslToRgb(NaN|Infinity, 0.5, 0.5)` → `{r:64,g:64,b:64}`, a plausible mid-grey with no throw and no NaN to trace; `hslToRgb(0,0,2)` → `{r:510,…}`, unclamped on the achromatic path. Latent today (PALETTE h/s/l derive from validated hexes) but these are the primitives Stories 1.8/4.8 build on. Note: the obvious `return 'hsl(0, 0%, 0%)'` guard **fails AR-46 lint** — normalise inside `round1` so the return still flows through the template path. [apps/web/lib/colorMath.ts:37,64,93,110]
- [x] [Review][Patch] **`paletteIndexOf`'s missing-default throw fires mid-render instead of at module init** — the `fallbackIndex === undefined` check sits inside the unknown-token branch, so if `DEFAULT_COLOR_TOKEN` were ever renamed the app boots fine and then hard-throws the first time an organism carries an unknown token — turning the degrade-and-warn path (Decision I.4) into a crash inside the render loop, in the one function whose doc comment says throwing "would turn a cosmetic mismatch into a blank Gallery". Move the check to module scope beside the `PALETTE` derivation. [apps/web/lib/paletteRegistry.ts:90-95]
- [x] [Review][Patch] **Nothing pins `DEFAULT_COLOR_TOKEN` to `sky-blue`** — Task 1's test list requires showing `resolvePaletteColor('not-a-token')` "returns the `sky-blue` entry", but both assertions are self-referential: `PALETTE.find(c => c.id === DEFAULT_COLOR_TOKEN)` and `displayColor(DEFAULT_COLOR_TOKEN, 3)`. Repointing the default at any other token keeps every test green, even though `sky-blue` being the default is load-bearing (Conway's Classic, FR-2.3 head-of-order). One literal assertion fixes it. [apps/web/lib/paletteRegistry.test.ts:78, apps/web/lib/displayColor.test.ts:115]
- [x] [Review][Patch] **G1 tests one background while claiming two** — contrast vs `#000000` is `(L+0.05)/0.05`; contrast vs `#0a0a0a` is `(L+0.05)/0.053035`. The denominator is strictly larger, so contrast-vs-black is **always** greater than contrast-vs-`#0a0a0a` for every colour. The `#000000` assertion is mathematically implied by the one above it and can never fail independently. The gate is sold as covering both themes (Clinical Lab + Biotech Terminal); it covers one. Harmless to correctness, but the doc and test comment overclaim. [apps/web/lib/paletteCvd.test.ts:80-81]
- [x] [Review][Patch] **`hslToRgb`'s achromatic short-circuit is redundant and its justification is false** — the comment says it "avoids the hue-to-rgb helper dividing by an `s` that is exactly 0", but `hueToChannel` never divides by anything, and the general path is already exactly equivalent at `s === 0` (`q = l`, `p = 2l − l = l`, every branch returns `l`). Verified: both paths return `{128,128,128}`. The branch is fine to keep as a fast path — but per the project's comment convention it must name the failure it actually prevents, not a fictional one. [apps/web/lib/colorMath.ts:65-70]
- [x] [Review][Patch] **`ageShadeFor` rounds a fractional age instead of flooring it** — `Math.round` means `ageShadeFor(6.5, true)` → `7`, so an age-6.5 organism renders identically to an age-99 one, and `ageShadeFor(0.5, true)` → `1`, making shade 0 unreachable for any age below 0.5. `Math.floor` is the correct band semantics. Latent while engine ages are integers, but the function's own comment claims to defend against a fractional age and `Math.round` is the one clamp direction that lets a sub-cap age reach the cap shade. [apps/web/lib/displayColor.ts:33]
- [x] [Review][Patch] **Two stale/false comments in `eslint.config.mjs`** — line 21 still reads "the palette registry (RFC-007, **lands Story 1.7**)"; the `TODO(1.7)` inside the AR-46 block itself was correctly retired but this one was missed. Separately, the AR-46 block's comment still says its exemptions "mirror the import-boundary block below", which is now false (4 entries vs 3) — a maintainer re-syncing them by copy would extend the `@gol/test-utils` import exemption to `paletteRegistry.ts`, which is the exact trap the story warned about. [eslint.config.mjs:21,70]
- [x] [Review][Patch] **`simulateCvd`'s gamut clamp fires often, and G4's margins partly rest on it** — measured over the 20 hexes × 3 CVD types, **19 of 180 channel evaluations land outside `[0,1]`, with excursions up to 0.224** in linear light (the tritan matrix's `1.255528` red coefficient dominates). For those tokens ΔE76 is measured against a gamut-wall projection rather than the true simulation. Two colours clamping to the same wall get artificially closer (conservative), but a pair where only one clamps can be pushed artificially apart — so a G4 pass can rest partly on a clamping artefact. Not a bug; an unrecorded methodological caveat that belongs in the validation doc. [apps/web/lib/paletteCvd.ts:131-138]
- [x] [Review][Patch] **The doc's "reproduces `entry.hex` exactly" claim is true only under case-folding** — `rgbToHex` emits lowercase (`Number.prototype.toString(16)`), `PALETTE_SOURCE` hexes are uppercase, and neither side is canonicalised. The *values* round-trip with zero drift for all 20 tokens (verified), but any future check written literally against that documented sentence — `pixelHexAt(id, 7) === entry.hex` — fails on all 20 for a reason unrelated to colour. Either canonicalise case in the registry or qualify the sentence. [docs/implementation-artifacts/palette-cvd-validation.md:16, apps/web/lib/colorMath.ts:98]
- [x] [Review][Patch] **The drift narrative is understated** — the doc claims the only shift from the story's precomputed table is the shade-0 core worst-pair identity. Measured, identities also shift at shade-0 tritan all-20 (`coral-red`/`rose` 4.07 → `cyan`/`mint` 4.02) and shade-3 tritan all-20 (`coral-red`/`rose` 6.72 → `tangerine`/`rose` 6.51), and the deutan shade-0 core delta is 0.45 (9.69 → 9.24), beyond the story's stated "±0.1 is fine" tolerance. The likely benign cause — this pipeline quantizes through `formatHsl`'s 1-dp string and then to 8-bit hex before Lab, which the story's context-engine run presumably did not — is worth stating rather than fixing. [docs/implementation-artifacts/palette-cvd-validation.md:84-91]
- [x] [Review][Patch] **`toBeCloseTo(expectedPercent, 1)` sits exactly on `round1`'s error budget** — `toBeCloseTo(x, 1)` passes when `|diff| < 0.05`; `round1`'s maximum error is exactly 0.05. Any token whose `entry.s * rampPercent` lands on a `.X5` boundary fails the ramp test for a rounding decision the code made deliberately. Given the palette is explicitly designated re-tunable, this is a landmine rather than a tolerance. [apps/web/lib/displayColor.test.ts:32]
- [x] [Review][Patch] **Dev Agent Record File List omits two changed files** — `docs/implementation-artifacts/sprint-status.yaml` (flipped to `review` in the same commit `86bfec7`) and the story file itself. [docs/implementation-artifacts/epic-1/1-7-palette-token-registry-display-color-lut.md:319-332]
- [x] [Review][Defer] **`displayColorAt` clamps a corrupt numeric index silently, with no diagnostic** [apps/web/lib/displayColor.ts:59-65] — deferred, Story 1.8 concern
- [x] [Review][Defer] **The warn-dedupe `Set` is unbounded and `colorToken` has no `.max()` in the schema** [apps/web/lib/paletteRegistry.ts:70, packages/domain/src/organismSchema.ts:22] — deferred, schema was deliberately out of scope this story
- [x] [Review][Defer] **Duplicate ids in `PALETTE_SOURCE` are swallowed at module init — only the unit test catches it** [apps/web/lib/paletteRegistry.ts:65] — deferred, hardening not a defect
- [x] [Review][Defer] **`contrastRatio` cannot accept a CVD-simulated colour — G1/G2 gate normal vision only** [apps/web/lib/paletteCvd.ts:45-57] — deferred, Stories 4.9/6.11
- [x] [Review][Defer] **`paletteTokenUsage.test.ts` is a hand-maintained list; four other fixture files carry `colorToken`s ungated** [apps/web/lib/paletteTokenUsage.test.ts:17-28] — deferred, story specified exactly those two sources
- [x] [Review][Defer] **The AR-46 whitelist is file-granular — a future non-palette literal in `paletteRegistry.ts` is unflagged** [eslint.config.mjs:71-78] — deferred, no live exposure
- [x] [Review][Defer] **`paletteCvd.ts`'s "never imported by component code" rule is enforced by a doc comment only** [apps/web/lib/paletteCvd.ts:1-10] — deferred, candidate lint boundary
- [x] [Review][Defer] **Several assertions are structurally unfalsifiable** (`deltaE76` determinism, `PALETTE_VERSION === 1`, `not.toContain('#')` after the kebab regex, `simulateCvd` clamp, `contrastRatio` symmetry) [apps/web/lib/paletteCvd.test.ts:51-71, apps/web/lib/paletteRegistry.test.ts:47,65] — deferred, test hygiene
- [x] [Review][Defer] **G3/G4 recompute `labA` in the inner loop (~1,792 redundant conversions)** [apps/web/lib/paletteCvd.test.ts:100-129] — deferred, suite runs in 40 ms

## Dev Notes

### Decisions this story is forced to make (flag them in the Dev Agent Record)

1. **⚠️ The registry hexes are NOT at full saturation, but the ramp caps at 100% — so `displayColor(token, 7)` ≠ `entry.hex`.** This is a real inconsistency in RFC-007, not a misreading. RFC-007 Decision 1 describes `hex` as *"base (full-saturation, age-cap) colour"*, and Decision 4's ramp ends at an **absolute** `S = 100%`. Measured, only 5 of the 20 hexes are actually at `S = 100%`:

   | | | | | |
   |---|---|---|---|---|
   | sky-blue **77%** | vermillion 100% | bluish-green 100% | amber 100% | reddish-purple **45%** |
   | yellow **85%** | azure **91%** | coral-red 100% | teal **66%** | violet 100% |
   | lime **78%** | magenta **85%** | cyan **92%** | tangerine **96%** | indigo **89%** |
   | mint **72%** | rose **95%** | chartreuse **88%** | lavender **95%** | periwinkle **96%** |

   So the age-cap colour is more vivid than the swatch the RFC's table implies — dramatically so for `reddish-purple` (45% → 100%).

   **Resolution (Sidiar, 2026-08-06): the ramp is relative to each token's own saturation.** `s(shade) = entry.s × (30 + 10·shade)/100` — eight levels spanning 30%→100% **of the token's colour**, so `displayColor(token, 7)` lands exactly on `entry.hex` and the curated Okabe-Ito/Tol values are what users actually see at the age cap. For the five tokens already at `S = 100%` this is identical to the literal FR-5.7 reading; for the other fifteen it is the difference between showing the curated colour and showing a more vivid relative of it.

   What this buys and what it costs:
   - ✅ RFC-007's `hex` description ("base, age-cap colour") becomes **true**, and the CVD curation is validated on the colours actually rendered.
   - ✅ Decision B.2's ≤160-group bound is untouched — still one base colour per token, still keyed `(token, 7)`.
   - ✅ The picker swatch (Story 4.8) can render `entry.hex` directly and provably match the grid.
   - ⚠️ The aging cue is **proportionally** uniform but **absolutely** weaker for pale tokens: `reddish-purple` ramps 13.5%→45% saturation where `vermillion` ramps 30%→100%. Aging is less visually obvious on the low-saturation half of the palette. Accepted.
   - 📌 **This deviates from the literal wording of FR-5.7, architecture B.3, and RFC-007 Decision 4**, all of which state absolute percentages. The formula is unchanged apart from the `entry.s` factor, but the specs say "100% saturation at age 7" where the behaviour is now "100% of the organism's saturation". Propagating that wording is a spec task, not this story's — RFC-007 Decision 4 and architecture B.3 are Sidiar's to edit, and **FR-5.7 is product-owned**. Flag it in the Dev Agent Record; do not edit the PRD.

2. **Where the registry lives: `apps/web/lib/`, not a package.** RFC-007 calls it "one app-level registry"; the architecture layer diagram places it in the rendering band; and the only consumers are the renderer (1.8/1.11), the picker (4.8), and the Epic 3 batching — all `apps/web`. Decisive: AC4 requires the registry to be an **AR-46 lint whitelist**, and that rule's `files` glob is `apps/web/**/*.{ts,tsx}` — in `packages/*` the AC would be vacuous because the rule does not reach there. Putting it in `@gol/domain` would also invert the dependency the next decision depends on. Flat `lib/*.ts` files match the existing `mode.ts` / `repositoryFactory.ts` / `useWorkspaceSeed.ts` convention; **camelCase, never dotted.**

3. **One module-level 160-entry table, not a per-battle LUT.** RFC-007 says "precompute once per battle: entries in use × 8 age-shades". The whole table is 20 × 8 = 160 short strings; building it once at module init is cheaper than any per-battle construction, needs no invalidation when a battle's roster changes mid-edit, and cannot go stale. The RFC's per-battle framing exists to bound the count, and the bound is satisfied more simply. *(The per-battle `OrganismRef → fill-group` LUT is a different object and is Story 1.8's — see "What NOT to build".)*

4. **`colorToken` validation stays at render time, not in the Zod schema** — despite the standing comment in `organismSchema.ts` (Task 5). Decision I.4 requires unknown tokens to degrade with a default + warning; a schema `z.enum` would reject them as corrupt, blank the Gallery, and break the Story 5.7 migration path that exists precisely to rewrite tokens. The compensating control is Task 5's fixture cross-check test.

### Spec conflicts surfaced (do not silently pick one — this is the project rule)

- **⚠️ The UX design specifies a completely different 20-colour palette.** `docs/planning-artifacts/ux-designs/.../organism-editor-design.md:185-187` lists an evenly-spaced hue ramp (`#ff0055`, `#ff3366`, `#ff6600`, … `#ff3399`). **RFC-007 wins and the UX hexes are stale:** RFC-007 owns the organism palette per the architecture's tech-stack table, and its Alternative 4 explicitly rejects *"algorithmically generated colours (evenly spaced hues)"* as guaranteeing neither CVD-safety nor dark-background visibility — which is exactly what that list is. What **does** survive from the UX doc is the *layout*: 8/8/4 swatch rows, in-use colours still selectable, selected colour shown large — all Story 4.8 concerns. Build RFC-007's 20; leave the UX doc alone (fixing it is a doc task for whoever picks up 4.8).
- **⚠️ The saturation inconsistency in decision 1** was a genuine RFC-007-internal contradiction (`hex` described as the age-cap colour while the ramp forced `S=100%`). **Resolved by Sidiar 2026-08-06 in favour of a relative ramp** (decision 1). The code change is one factor; the spec wording in RFC-007 Decision 4, architecture B.3 and PRD FR-5.7 still says "100%" in absolute terms and needs a follow-up propagation pass. Do not edit those documents from this story.

### Silent-failure traps — the intuitive implementation is wrong

- ⚠️ **`ageShadeFor(age, agingEnabled=false)` returns `7`, not `0`.** Non-aging = full saturation = the age-cap colour (architecture B.2). Conway's Classic is non-aging, so getting this backwards washes out the default battle and every Gallery thumbnail.
- ⚠️ **`0.30 + 0.10 * ageShade` is not `0.70` at shade 4, nor `1.0` at shade 7.** Build the ramp factor from integer percents (`30 + 10 * shade`) before scaling by `entry.s`, or the shade-7 identity with `entry.hex` misses by a hair.
- ⚠️ **The ramp scales `entry.s`; it does not replace it.** Writing `hsl(h, 30 + 10*shade, l)` — the literal reading of FR-5.7, and the obvious thing to type — discards the token's own saturation and repaints 15 of the 20 colours. Nothing in the type system stops it and every test that only checks "saturation increases with age" still passes.
- ⚠️ **`MAX_AGE_SHADE = 7` is the *visual* cap and is unrelated to the engine's `MAX_RELEVANT_AGE = max(7, maxAgeLiteral + 1)`** (Decision B.5). They collide at 7 by coincidence. Do not share a constant, do not import one for the other — a battle whose rules reference `age > 30` has `MAX_RELEVANT_AGE = 31` and still has exactly 8 age shades.
- ⚠️ **Lightness must be *byte-identical* across a token's 8 shades.** The whole CVD mitigation is "lightness separation survives desaturation" (RFC-007 Decision 4). A `hslToRgb` round-trip that recomputes `l` per shade drifts it by a hair and quietly deletes the property — which is why Task 3 asserts constant lightness directly instead of trusting the formula.
- ⚠️ **An unknown token must not throw** (Decision I.4), and its warning must be deduped — this runs per cell, inside the render loop.
- ⚠️ **Do not linearise twice, or forget to linearise at all** in Task 4. Both produce numbers that look reasonable. The reproduction table is the only thing that will tell you.
- ⚠️ **A raw hex literal anywhere in `apps/web` outside the registry fails lint** — including a "temporary" default in `colorMath.ts` or a test helper in a non-`.test.ts` file. Build strings through `formatHsl`.
- ⚠️ **Adding the registry to the wrong ESLint block** (the `no-restricted-imports` one) silently removes the `@gol/test-utils` import boundary from it. The two blocks look nearly identical.

### Previous story intelligence (1.3–1.6)

- **`npm run ci` is where cross-package breakage surfaces, not `npm test`.** Two stories in a row have been green on `npm test` and broken further down the chain (1.4 on `build:standalone`, 1.5 on `npm run dev`). Run the full gate.
- **Story 1.6's review found two ticked-but-unshipped subtasks** — an export that was never added, and factories that were shallow when the story required deep freshness. Both passed the story's own tests. Before you tick a box, open the file. In this story the equivalent risks are the ESLint whitelist (easy to add to the wrong block and never notice) and the Task 5 comment correction (easy to skip because nothing tests a comment).
- **Comment convention:** every non-obvious line carries a WHY naming the failure it prevents and citing the governing id (`(RFC-007 Decision 4)`, `(Decision B.2)`, `(Decision I.4)`, `(AR-46)`). The `ageShadeFor` non-aging branch, the integer-percent saturation, the warn-once set, and the ESLint block choice each need one. **No review artefacts in code** ("fixed per review", "as requested").
- **Fixtures already persist four tokens** — `sky-blue` (Conway's Classic, pinned by `defaultWorkspace.test.ts`), `vermillion`, `azure`, `bluish-green` (AR-45 mocks), plus `cyan` and `coral-red` in repository/schema test fixtures. Renaming any token id breaks those; re-tuning a hex does not.
- **`apps/web/vitest.config.mts` aliases `@/*`** — use `@/lib/...` imports, not relative ones (the 1.4 review flagged that deviation once already).
- **Coverage gate is not live** (flips Story 3.7) and `apps/web` has no gate by design. Test the invariants, not a number.
- **Commit gate stands:** present the file list and a suggested message, then wait for Sidiar. Approval never carries between commits.

### What NOT to build (scope boundaries)

- ❌ **The per-battle `OrganismRef → fill-group` LUT (`buildRefToFillGroup`)** — Story 1.8. Its shape is dictated by the renderer's inner loop, which does not exist yet; building it blind is the same trap Story 1.6 avoided with the typed-array `Grid`. 1.8's `GridRenderer(canvas, size, palette)` constructor receives *that* object and consumes *this* story's `displayColor` through it.
- ❌ **`GridRenderer`, canvas, dirty regions, auto-fit** — Story 1.8.
- ❌ **The colour picker, swatch grid, "already used" warning, next-unused/least-used default assignment** — Stories 4.8 / 4.9. This story ships the ordered registry those consume; the *order* is the only part of that behaviour it owns.
- ❌ **Theme tokens, `themes.css`, `--gol-*`, MUI, `createTheme()`** — Story 1.9. Organism colours are **not** theme variables (RFC-007 Decision 5); the two systems must not reference each other.
- ❌ **Any change to `OrganismSchema`'s behaviour** — comment only (Task 5, forced decision 4).
- ❌ **`hexByTheme` / per-theme palette variants** — post-MVP (RFC-007 Decision 5, flagged not built).
- ❌ **Stamping `PALETTE_VERSION` into any persisted or exported record** — Story 5.3 owns the envelope. Export the constant; nothing writes it yet.
- ❌ **A colour-science dependency** (chroma-js, culori, color). Four small pure functions, no runtime cost, no audit surface.
- ❌ **Pixel/snapshot tests** — AR-42. The LUT is decision logic and is tested as pure units.
- ❌ **Population bars, legends, tile thumbnails** — Stories 1.11 / 3.14. Nothing renders a colour this story.

### Project Structure Notes

```
apps/web/lib/
  paletteRegistry.ts          PALETTE (20), PALETTE_VERSION, resolvePaletteColor, paletteIndexOf  [new]
  paletteRegistry.test.ts                                                                          [new]
  colorMath.ts                hex<->rgb<->hsl, formatHsl                                           [new]
  colorMath.test.ts                                                                                [new]
  displayColor.ts             160-entry table, displayColor, displayColorAt, ageShadeFor           [new]
  displayColor.test.ts                                                                             [new]
  paletteCvd.ts               contrast + Lab + deltaE76 + Machado CVD matrices (test-only import)  [new]
  paletteCvd.test.ts          the four hard gates                                                  [new]
  paletteTokenUsage.test.ts   every fixture colorToken resolves against PALETTE                    [new]

eslint.config.mjs             AR-46 block: whitelist paletteRegistry.ts, retire TODO(1.7)      [modified]
packages/domain/src/organismSchema.ts   colorToken comment corrected — no behaviour change     [modified]

docs/implementation-artifacts/
  palette-cvd-validation.md   method, thresholds, worst-pair matrix, known-ambiguous pairs         [new]
```

No `package.json` changes and no new dependencies. Filenames are **camelCase, never dotted**.

### References

- [Source: docs/planning-artifacts/epics.md#Story 1.7] — story statement + the four ACs verbatim
- [Source: docs/planning-artifacts/epics.md#Additional Requirements] — **AR-26** (registry, 20 CVD-considered entries ordered by distinguishability, hex resolved at render time, `displayColor(token, ageShade)` with constant-lightness ramp, documented CVD check), **AR-23** (colour-state batching, ≤160 fill groups), **AR-25** (`renderStatic` consumers), **AR-42** (LUT tested as pure units, no pixel snapshots), **AR-46** (no raw colour literals outside the token file and the palette registry)
- [Source: docs/planning-artifacts/epics.md#Story 1.8 / 1.11 / 4.8 / 4.9 / 6.11] — the downstream consumers: renderer constructor, tile thumbnails, the picker, the CVD re-confirmation ACs
- [Source: docs/planning-artifacts/rfcs/RFC-007-organism-colour-palette.md#Decision 1] — token-referenced palette, `PaletteColor` shape, `PALETTE_VERSION`, migration safety (adjust hex = free, remove/rename id = destructive)
- [Source: docs/planning-artifacts/rfcs/RFC-007-organism-colour-palette.md#Decision 2] — the 20 tokens, their order, and the design criteria (dark-bg luminance, hue + lightness spread, safe core first)
- [Source: docs/planning-artifacts/rfcs/RFC-007-organism-colour-palette.md#Decision 4] — `displayColor`, the constant-lightness saturation ramp, and the CVD↔aging tension it resolves
- [Source: docs/planning-artifacts/rfcs/RFC-007-organism-colour-palette.md#Decision 5] — theme independence; organism colours are never CSS theme variables
- [Source: docs/planning-artifacts/rfcs/RFC-007-organism-colour-palette.md#Next Steps] — "validate the 20 starting hexes with CVD simulation … re-tune as needed (no migration)" — the licence Task 4 operates under
- [Source: docs/planning-artifacts/architecture.md#Decision B.2] — batch by `(colorToken, min(age,7))`; non-aging keys as `(token, 7)`; ≤160 groups, palette-derived
- [Source: docs/planning-artifacts/architecture.md#Decision B.3] — HSL S-channel `= 0.30 + 0.10 · ageShade`; lightness held constant
- [Source: docs/planning-artifacts/architecture.md#Decision B.5] — `MAX_RELEVANT_AGE = max(7, maxAgeLiteral + 1)`, the engine constant that must not be conflated with the visual cap
- [Source: docs/planning-artifacts/architecture.md#Decision I.4] — `PALETTE_VERSION` is a stamp never branched on; unknown tokens degrade gracefully (default + warn), they are not corruption
- [Source: docs/planning-artifacts/architecture.md#Minor Resolutions M6] — colours are reusable; the palette is a curation tool, not a cap; FR-3.3 warns on same-colour co-placement
- [Source: docs/planning-artifacts/rfcs/RFC-002-grid-rendering-technology.md#3] — the batching loop and the `refToGroup` / `displayColor` split that Story 1.8 assembles
- [Source: docs/planning-artifacts/component-tree-battle-page.md#5] — `GridRenderer(canvas, size, palette: RefToFillGroup)` frozen contract; `buildRefToFillGroup` as a separate non-React module
- [Source: docs/planning-artifacts/prds/.../prd.md#FR-5.7] — 30% at age 0, +10%/cycle, 100% at age 7
- [Source: docs/planning-artifacts/prds/.../prd.md#FR-2.3] — palette-only selection by swatch/name, reusable, identical across themes
- [Source: docs/planning-artifacts/prds/.../prd.md#NFR-8.3] — "Color-blind users can distinguish between organism colors"
- [Source: docs/planning-artifacts/ux-designs/.../organism-editor-design.md:185-187] — the **stale** 20-hex list (see Spec conflicts); its layout guidance survives for Story 4.8
- [Source: docs/project-context.md#Framework-Specific Rules] — one immutable MUI theme; the Canvas grid is drawn outside MUI; organism colour is not a theme token
- [Source: docs/project-context.md#Critical Don't-Miss Rules] — never batch by organism; `MAX_RELEVANT_AGE` arithmetic; `formatVersion` is the only branched-on version
- [Source: docs/implementation-artifacts/epic-1/1-6-test-utilities-dev-fixture-workspace.md] — the tokens the AR-45 fixtures already persist; the "ticked but unshipped" review lesson; `npm run ci` as the only real gate
- [Source: eslint.config.mjs:66-84] — the AR-46 block, its `TODO(1.7)`, and the near-identical import-boundary block below it
- [Source: packages/domain/src/organismSchema.ts:15-23] — the `colorToken` `#` guard and the stale "validation … lands in Story 1.7" comment Task 5 corrects

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5 (claude-sonnet-5)

### Debug Log References

- `npm run typecheck` — 5/5 packages pass.
- `npm run lint` — clean, no output (both AR-46 directions manually verified: `paletteRegistry.ts` lints clean; a scratch hex literal in another `apps/web/lib` file still errors).
- `npm run format:check` — clean after one `prettier --write` pass on the three files whose Task 3/4 test/source content prettier reformatted.
- `npm test` (`turbo run test`) — 5/5 packages, 349 tests total, all green (persistence 82, test-utils 75, domain 85, web 107, simulation 0/no-tests).
- `npm run ci` — full gate green end-to-end: typecheck → lint → format:check → test:coverage → build:standalone → bundle:check → e2e (12 Playwright tests across chromium/firefox/webkit/tablet, clean console).

### Completion Notes List

**Forced decisions (see Dev Notes for full rationale) — resolutions taken:**

1. **Relative saturation ramp** (Sidiar, 2026-08-06, pre-resolved in the story's Change Log): implemented as specified — `sPercent = entry.s * (30 + 10*shade)` computed with an integer ramp percent before scaling, so `displayColor(token, 7)` reproduces `entry.hex` for all 20 tokens within ≤1/255 per channel (verified in `displayColor.test.ts`; no `formatHsl` precision bump was needed — 1 decimal place held the identity for every token).
2. **Registry location:** `apps/web/lib/paletteRegistry.ts` (flat file, camelCase), matching `mode.ts` / `repositoryFactory.ts` convention. Confirmed `packages/*` was never a candidate — the AR-46 lint glob doesn't reach there.
3. **One module-level 160-entry table:** implemented via `PALETTE.flatMap` at module init in `displayColor.ts`; confirmed all 160 entries are distinct (test asserts `Set.size === 160`).
4. **`colorToken` validation stays at render time:** `organismSchema.ts`'s stale "lands in Story 1.7" comment corrected to describe the render-time resolve-with-fallback design; zero behavioural change to the schema (verified: `organismSchema.test.ts`'s 20 tests are all still green, unmodified).

**Task 4 measured numbers (this implementation, not copied from the story):**
G1 worst 5.12 (`vermillion` vs `#0a0a0a`); G2 worst 3.06 (`bluish-green`, shade 0); G3 worst 12.79 (`azure`/`indigo`); G4 worst 4.77 (protan, `bluish-green`/`coral-red`). All comfortably clear their gates (3.0 / 2.5 / 8.0 / 4.0 respectively). Full worst-pair matrix, method, and the known-indistinguishable-under-CVD pair list are recorded in `docs/implementation-artifacts/palette-cvd-validation.md`. No hex re-tuning was needed — every gate passed on the first implementation with margin comparable to the story's own pre-computed reproduction table (a few low-saturation shade-0 entries differ from the story's numbers by up to ~0.4 ΔE76 with a different nominal "worst pair" identity; documented in the validation doc as expected sensitivity at low saturation, not a pipeline error — the shade-7 and mid-ramp numbers this implementation produces match the story's table almost exactly).

**Bundle:** 246.7 KB gzip / 300 KB budget — byte-identical to the Story 1.6 baseline (53.3 KB headroom), confirming nothing in `apps/web`'s entry graph pulls in the registry, the 160-entry table, or `paletteCvd.ts` yet. Story 1.8 is the first real consumer.

### File List

- `apps/web/lib/paletteRegistry.ts` (new)
- `apps/web/lib/paletteRegistry.test.ts` (new)
- `apps/web/lib/colorMath.ts` (new)
- `apps/web/lib/colorMath.test.ts` (new)
- `apps/web/lib/displayColor.ts` (new)
- `apps/web/lib/displayColor.test.ts` (new)
- `apps/web/lib/paletteCvd.ts` (new)
- `apps/web/lib/paletteCvd.test.ts` (new)
- `apps/web/lib/paletteTokenUsage.test.ts` (new)
- `eslint.config.mjs` (modified — AR-46 block whitelists `paletteRegistry.ts`, `TODO(1.7)` retired)
- `packages/domain/src/organismSchema.ts` (modified — `colorToken` comment corrected, no schema behaviour change)
- `docs/implementation-artifacts/palette-cvd-validation.md` (new)
- `docs/implementation-artifacts/sprint-status.yaml` (modified — story status)
- `docs/implementation-artifacts/epic-1/1-7-palette-token-registry-display-color-lut.md` (this file)

**Added by code review 2026-08-06:**

- `apps/web/scripts/paletteCvdSweep.test.ts` (new — regenerates the validation doc's tables from the real modules)
- `apps/web/vitest.sweep.config.mts` (new — runs the sweep, kept out of `npm test`)
- `apps/web/vitest.config.mts` (modified — excludes `scripts/**`)

## Change Log

- 2026-08-06: **Code review — 2 decisions, 15 patches applied, 9 deferred, 5 dismissed. Status → done.** No AC was violated and no ticked-but-unshipped subtask was found; the four traps the story was built around (relative ramp, integer ramp percent, `ageShadeFor → 7`, correct ESLint block) all landed. The defects were concentrated in `palette-cvd-validation.md`: its reproduction command matched no files and **exited 0**, and its known-indistinguishable pair list omitted the actual worst pair in both protan and deutan while misattributing ΔE76 1.21. Both fixed. Two decisions taken by Sidiar: (1) the worst-pair tables are now regenerated by a checked-in sweep (`apps/web/scripts/paletteCvdSweep.test.ts` + `vitest.sweep.config.mts`, excluded from `npm test`) that drives the real `displayColor`/`paletteCvd` modules, so the doc cannot drift from the code; (2) the pair list records the **measured** superset, superseding the story's Task 4 list, which predates the relative-ramp resolution and does not survive re-measurement. Code fixes: non-finite input discipline in `colorMath` (ingest throws / output degrades, documented as a policy), the missing-default and duplicate-id checks moved to module init out of the render path, `ageShadeFor` floors rather than rounds, `DEFAULT_COLOR_TOKEN` pinned to `sky-blue` by literal, and the ramp tolerance re-expressed against `round1` instead of a `toBeCloseTo` that sat exactly on its error budget. `npm run ci` green end-to-end.
- 2026-08-06: Implemented. All four ACs satisfied: 20-token registry with derived h/s/l and warn-once fallback (Task 1); dependency-free colour-math primitives (Task 2); the 160-entry precomputed display-colour LUT with the relative saturation ramp and `displayColor(token,7) === entry.hex` identity (Task 3); the four CVD/contrast hard gates plus `palette-cvd-validation.md` (Task 4); AR-46 whitelist + `organismSchema.ts` comment fix + cross-package fixture-token test (Task 5). `npm run ci` green end-to-end; bundle unchanged at 246.7 KB gzip. Status → review.
- 2026-08-06: Decision 1 resolved by Sidiar — the age ramp is **relative to each token's own saturation** (`entry.s × (30+10·shade)/100`), so `displayColor(token, 7)` reproduces `entry.hex` and the curated CVD values are what renders. Task 3's formula and tests, Task 4's gate thresholds and reproduction table (recomputed under the relative ramp), and the trap list updated accordingly. Spec-wording propagation to RFC-007 Decision 4 / architecture B.3 / PRD FR-5.7 left as a follow-up outside this story.
- 2026-08-06: Story created (context engine run against epics 1.7 + AR-23/25/26/42/46, RFC-007 Decisions 1/2/4/5 + Next Steps, RFC-002 §3, architecture Decisions B.2/B.3/B.5/I.4/M6, the component tree's frozen `GridRenderer` contract, PRD FR-2.3/FR-5.7/NFR-8.3, the UX organism-editor palette list, and the shipped Story 1.3–1.6 code + `eslint.config.mjs`). The four CVD/contrast gate thresholds were derived by running the check against the RFC-007 hexes before writing the ACs, so the numbers in Task 4 are measured, not aspirational. Two spec conflicts surfaced rather than silently resolved. Status → ready-for-dev.
