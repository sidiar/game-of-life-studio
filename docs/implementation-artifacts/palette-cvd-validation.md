# Palette CVD + Dark-Background Validation

**Story:** 1.7 — Palette Token Registry & Display-Color LUT (AC1, Task 4)
**Reproduces with** (both from `apps/web/`):

```bash
npx vitest run lib/palette/paletteCvd.test.ts                      # the five hard gates
npx vitest run --config vitest.sweep.config.mts --disable-console-intercept   # the tables below
```

The first enforces the gates (also covered by `turbo run test --filter=web` and `npm run ci`).
The second is `scripts/paletteCvdSweep.test.ts`, which regenerates every number in this document
by driving the same `displayColor` / `paletteCvd` modules the gates use — so the tables cannot
drift from the implementation. It is excluded from `npm test` and asserts nothing.

⚠️ Note the path is relative to `apps/web`, not the repo root, and is under `lib/palette/` since
the Story 4.9 folder refactor (it was `lib/paletteCvd.test.ts` when this doc was first written).
`npx vitest run apps/web/lib/palette/paletteCvd.test.ts` from inside `apps/web` matches nothing
and **exits 0** — a green run that asserted nothing.

**Date:** 2026-08-06 (revised after code review, same day)

## What is being validated

Every check below runs against **what a user actually sees** — the `displayColor(token,
ageShade)` output at every one of the 8 age shades — not the raw registry hexes. The hexes
(`PaletteColor.hex`) are an authoring input; under the Story 1.7 forced-decision-1 relative
saturation ramp, `displayColor(token, 7)` reproduces `entry.hex` — to within ≤1/255 per channel,
which for all 20 tokens is currently zero drift — so the age-cap shade is where the registry's
curated values and the rendered pixel coincide. All seven younger shades render a less-saturated
relative of that same hue/lightness.

⚠️ That equality is on **channel values, not on the string.** `PALETTE_SOURCE` stores uppercase
hexes (`#56B4E9`) while `rgbToHex` emits lowercase, and neither side canonicalises, so a check
written literally as `pixelHexAt(id, 7) === entry.hex` fails on all 20 tokens for a reason that
has nothing to do with colour. Compare case-folded, or compare RGB channels.

## Method

1. **WCAG 2.x contrast** (`relativeLuminance`, `contrastRatio` — G1/G2): sRGB channels are
   linearised with WCAG's own breakpoint (`c <= 0.03928 ? c/12.92 : ((c+0.055)/1.055)^2.4`), then
   combined as `L = 0.2126R + 0.7152G + 0.0722B`. Contrast is `(lighter + 0.05) / (darker + 0.05)`.
2. **CIE L\*a\*b\* ΔE76** (`srgbToLab`, `deltaE76` — G3/G4): linear sRGB → CIE XYZ via the
   standard D65 sRGB matrix (IEC 61966-2-1) → L\*a\*b\* via the CIE 1976 `f(t)` piecewise cube
   root, normalised against the D65 white point. ΔE76 is plain Euclidean distance in L\*a\*b\*.
3. **CVD simulation** (`simulateCvd` — G4 only): Machado, Oliveira & Fernandes (2009)
   severity-1.0 matrices for protanopia, deuteranopia and tritanopia, applied to **linear** sRGB
   and clamped to `[0, 1]` per channel.
4. Every step above operates on **linearised** sRGB. Running any of this on gamma-encoded 0-255
   values produces plausible-looking but wrong numbers — there is no test that would catch that
   mistake other than comparing against the worst-pair table below.

⚠️ **Known limitation — the CVD matrices push colours out of gamut, and the clamp is load-bearing.**
Measured over the 20 registry hexes × 3 CVD types, **19 of 180 channel evaluations land outside
`[0,1]`, with excursions up to 0.224** in linear light (the tritan matrix's `1.255528` red-row
coefficient dominates). `simulateCvd` clamps each channel to `[0,1]`, so for those tokens ΔE76 is
measured against a gamut-wall projection rather than the unclamped simulation. Two colours that
clamp to the same wall are pushed artificially *closer* (conservative — the gate gets stricter),
but a pair where only one member clamps can be pushed artificially *apart*, so a G4 pass can rest
partly on a clamping artefact. This is inherent to applying Machado matrices in a bounded sRGB
space and is not corrected here; it is recorded so a future re-tune does not mistake a clamp
artefact for real separation.

✅ **G5 closes the "normal vision only" gap G1/G2 originally had** (Story 4.9). `relativeLuminance`
split into `luminanceOfLinear(LinearRgb)` + a thin hex wrapper, and `contrastRatio` into
`contrastRatioOfLinear(LinearRgb, LinearRgb)` + a thin hex wrapper — three lines each, per
`deferred-work.md`'s estimate — so a CVD-simulated colour now has a call path to a contrast
number. G5 simulates **both** the pixel and the `#0a0a0a` background before comparing them (FD7:
a contrast ratio is defined within one colour space, and passing one simulated and one raw colour
is the "plausible-looking but wrong" class this document's Method section warns about). Measured
worst-case contrast vs simulated `#0a0a0a` across all 20 tokens × 8 shades: normal 3.06, protan
3.23, **deutan 2.96**, tritan 3.06 — matching this document's earlier manual figures exactly, and
clearing the 2.5 threshold on every mode.

All math lives in `apps/web/lib/palette/paletteCvd.ts`, imported only by its own test,
`themeTokens.test.ts`, and the Story 6.11 re-confirmation — never by component code.

## The five hard gates (enforced in `paletteCvd.test.ts`)

| Gate | Rule | Threshold | Measured worst |
|---|---|---|---|
| **G1 — visibility** | Every token, at the age-cap shade (7), vs. both `#0a0a0a` (Clinical Lab) and `#000000` (Biotech Terminal) | contrast ≥ **3.0** | **5.12** (`vermillion`, vs `#0a0a0a`) |
| **G2 — visibility while young** | Every token, at every shade 0-7, vs. `#0a0a0a` | contrast ≥ **2.5** | **3.06** (`bluish-green`, shade 0) |
| **G3 — normal-vision distinctness** | All 20 tokens pairwise, at the age-cap shade, normal vision | ΔE76 ≥ **8.0** | **12.79** (`azure`/`indigo`) |
| **G4 — CVD-robust core** | Tokens 1-8 pairwise, at every shade 0-7, under normal + protan + deutan + tritan | ΔE76 ≥ **4.0** | **4.77** (protan, `bluish-green`/`coral-red`) |
| **G5 — visibility under CVD simulation** | Every token, at every shade 0-7, vs. simulated `#0a0a0a`, under protan + deutan + tritan (both sides simulated) | contrast ≥ **2.5** | **2.96** (deutan, `bluish-green`, shade 0) |

**Why these thresholds:** 3.0/2.5 sit just under WCAG's 3:1 "graphical object" contrast
guidance — cells are non-text UI elements, and 2.5 gives headroom before the ramp's low-shade
end (organisms are still identifiable at birth, not just at the age cap). 8.0 ΔE76 is the
conventional "clearly distinct to normal vision" threshold; 4.0 is the conventional "just
noticeable difference" floor — the CVD core is held to the lower, achievable bar because
simulated colour-vision deficiency compresses the gamut a great deal (see below).

**Why the full 20-token set is not gated under CVD simulation:** RFC-007 Decision 2 states
plainly that a CVD-safe 20-hue set is not achievable with hue alone — qualitative CVD-safe
palettes max out around 8-12 colours. Gating all 20 under simulation would either fail on day
one or force a threshold low enough to silently defeat G4's real protection on the 8-colour core.
The full-20 matrix is measured and recorded below; the product-level mitigation for the residue
is the FR-3.3 same-colour co-placement warning (Stories 4.8/4.9).

## Worst-pair table (measured against this implementation)

Minimum pairwise ΔE76 over `displayColor` outputs, and minimum contrast vs. `#0a0a0a`:

⚠️ Since Story 4.9 (G5), the `mode` column's contrast is **per-row honest**: a CVD row simulates
the `#0a0a0a` background too, rather than reusing the normal-vision figure on every row (the gap
this document used to record as an ungated path).

| shade | mode | core 1–8 worst pair | all 20 worst pair | min contrast vs `#0a0a0a` |
|---|---|---|---|---|
| 0 | normal | 13.55 (reddish-purple/coral-red) | 6.29 (coral-red/rose) | 3.06 |
| 0 | protan | 5.50 (sky-blue/reddish-purple) | 2.31 (violet/indigo) | 3.23 |
| 0 | deutan | 9.24 (sky-blue/reddish-purple) | 2.85 (mint/rose) | 2.96 |
| 0 | tritan | 6.65 (sky-blue/azure) | 4.02 (cyan/mint) | 3.06 |
| 3 | normal | 23.98 (vermillion/amber) | 11.38 (violet/indigo) | 3.99 |
| 3 | protan | 11.90 (bluish-green/coral-red) | 2.18 (violet/indigo) | 3.71 |
| 3 | deutan | 14.44 (vermillion/amber) | 1.21 (reddish-purple/teal) | 3.78 |
| 3 | tritan | 10.72 (sky-blue/azure) | 6.51 (tangerine/rose) | 4.06 |
| 7 | normal | 31.49 (vermillion/coral-red) | 12.79 (azure/indigo) | 5.12 |
| 7 | protan | 7.17 (bluish-green/coral-red) | 1.88 (violet/indigo) | 4.04 |
| 7 | deutan | 17.04 (amber/yellow) | 1.32 (lavender/periwinkle) | 4.95 |
| 7 | tritan | 9.00 (vermillion/coral-red) | 5.73 (teal/mint) | 5.07 |

G5's all-shade floor per mode (what the gate actually asserts, sampling all 8 shades rather than
the three rows above): normal **3.06** (shade 0), protan **3.23** (shade 0), deutan **2.96**
(shade 0), tritan **3.06** (shade 0).

Worst case across **all eight shades** — what G4 actually gates on: core-8 protan **4.77**
(`bluish-green`/`coral-red`, shade 5), tritan **6.65**, deutan **9.24**, normal **13.55**;
all-20 (recorded, not gated) deutan **1.21** (`reddish-purple`/`teal`, shade 3), protan **1.53**
(`teal`/`rose`, shade 2), tritan **4.02**, normal **6.29**.

⚠️ **The three sampled rows above understate the all-shade minima — read them together with this
line, not instead of it.** Several pairs dip between shades 0, 3 and 7: the all-20 protan worst is
`teal`/`rose` at shade 2 (**1.53**), a pair that appears in none of the sampled rows, and the
core-8 protan worst is at shade 5 (**4.77**), below all three of its sampled values. G4 gates on
every shade, so the gate is unaffected — but a reader who eyeballs only the table will read the
protan floor as 1.88 rather than 1.53. Run the sweep for the full per-shade picture.

These numbers land within ~0.1–0.45 of the values RFC-007's context engine run measured against
the same hexes before this story's code existed (recorded in the story file's Task 4), and the
nominal "worst pair" identity shifts in several cells, not just one:

| cell | story's run | this implementation |
|---|---|---|
| 0 / normal, core-8 | 13.17 (`sky-blue`/`azure`) | 13.55 (`reddish-purple`/`coral-red`) |
| 0 / deutan, core-8 | 9.69 (`sky-blue`/`reddish-purple`) | 9.24 (same pair — Δ 0.45) |
| 0 / tritan, all-20 | 4.07 (`coral-red`/`rose`) | 4.02 (`cyan`/`mint`) |
| 3 / tritan, all-20 | 6.72 (`coral-red`/`rose`) | 6.51 (`tangerine`/`rose`) |

**Why, and why it is benign:** this pipeline measures the pixel a user actually gets, so it
quantizes twice on the way to Lab — through `formatHsl`'s 1-decimal-place HSL string, then to an
8-bit hex — where the story's pre-implementation run worked in continuous floats. At low
saturation several pairs sit within a fraction of a ΔE unit of one another, so which is nominally
"worst" flips easily; the 0.45 deutan delta is the same pair, just measured after quantization.
The property that matters — every number is comfortably on the same side of its gate as the
story's table predicted — holds throughout. The story's own "±0.1 is fine" tolerance was written
before the relative-ramp resolution and is too tight for the shade-0 end; treat ±0.5 at low
saturation as expected, and a *gate* failure (not a table wobble) as the real signal.

## Known-indistinguishable pairs under CVD (informational — not gated)

These pairs, among the full 20-token set, fall below what most CVD simulations would call
reliably distinguishable at one or more shades. Product's mitigation is the FR-3.3 same-colour
warning at organism creation/edit time (Stories 4.8/4.9), not a palette change — RFC-007 Decision
2 already accepts this residue as the cost of a 20-colour set.

The list is **measured**, not curated: it is every all-20 pair whose ΔE76 drops below the 4.0 G4
threshold at *any* shade under *any* simulation, emitted directly by the sweep. Each entry gives
the pair's minimum and the shade it occurs at.

- **Protan:** `teal`/`rose` **1.53** (shade 2) · `violet`/`indigo` **1.88** (shade 7) ·
  `lavender`/`periwinkle` **2.79** (shade 3) · `yellow`/`lime` **3.37** (shade 7)
- **Deutan:** `reddish-purple`/`teal` **1.21** (shade 3) · `lavender`/`periwinkle` **1.32**
  (shade 7) · `mint`/`rose` **2.85** (shade 0) · `violet`/`indigo` **3.43** (shade 0)
- **Tritan:** none below 4.0. Closest are `cyan`/`mint` **4.02** (shade 0) and `teal`/`mint`
  **5.73** (shade 7) — recorded because they are the tritan floor, not because they breach it.

⚠️ **This supersedes the shorter list prescribed in the story file** (`1-7-…md`, Task 4), which
named `protan: yellow/lime, violet/indigo` and `deutan: lavender/periwinkle, violet/indigo`. That
list was written against the *absolute*-saturation ramp, before Sidiar's 2026-08-06 resolution
made the ramp relative to each token's own saturation, and it does not survive re-measurement: it
omits the actual worst pair in both modes (`teal`/`rose` under protan, `reddish-purple`/`teal`
under deutan) and attributes ΔE76 1.21 to deutan `violet`/`indigo`, which in fact measures 3.43.
Resolved in favour of the measurement (code review 2026-08-06). `yellow`/`lime` is retained — it
does breach 4.0, at 3.37.

## For Story 6.11

Re-run `paletteCvd.test.ts` (or the equivalent ad-hoc script) against any re-tuned hex before
accepting a change. A gate failure should be fixed by re-tuning that entry's `hex`
(RFC-007 Decision 1 — zero data migration) — never by lowering a threshold, and never by
renaming or removing a token `id` (a persisted, destructive change requiring a `formatVersion`
migration step per Decision I.4).

## Story 4.9 re-confirmation (2026-09-16)

Re-run against the shipped registry, ahead of the reuse-warning feature this story also ships.

- **The registry hexes are unchanged since 2026-08-06.** `git log --follow -- apps/web/lib/palette/paletteRegistry.ts` shows exactly three commits: the two Story 1.7 commits (`86bfec7`, `8fd3da7`) and the Story 4.9-era folder refactor (`44972dc`, a pure move — `lib/paletteRegistry.ts` → `lib/palette/paletteRegistry.ts`). No hex, name or `id` has moved.
- **G1–G5 floors as measured today** (unchanged from the table above, now gated at G5 too): G1 **5.12** (`vermillion`), G2 **3.06** (`bluish-green`, shade 0), G3 **12.79** (`azure`/`indigo`), G4 **4.77** (protan, `bluish-green`/`coral-red`, shade 5), G5 **2.96** (deutan, `bluish-green`, shade 0).
- **What changed in the code, not the palette:** `relativeLuminance(hex)` split into `luminanceOfLinear(LinearRgb)` + a thin hex wrapper; `contrastRatio(hexA, hexB)` split into `contrastRatioOfLinear(LinearRgb, LinearRgb)` + a thin hex wrapper; `paletteCvd.test.ts` gained the G5 `describe` block (20 new cases — every token, every shade, all 3 CVD types); `scripts/paletteCvdSweep.test.ts`'s `minContrast` takes an optional `CvdType` and simulates the background under it, so the worst-pair table's contrast column is per-row honest instead of reusing the normal-vision figure on every CVD row.
- **G5 simulates the background too** (FD7) — the doc's original "measured manually" figures (normal 3.06, protan 3.23, deutan 2.96, tritan 3.06) did not record whether `#0a0a0a` itself went through `simulateCvd` before the comparison. It now does, on both sides, always. Practically the figures land on the same numbers recorded before this story (the Machado rows sum to ≈1, so a near-neutral background barely moves under simulation) — but the *method* is now pinned, so the next re-tune compares like with like rather than re-deriving the question.
- **All five gates are green on the current hexes.** No hex was re-tuned, no threshold was lowered, no token `id` was renamed — Task 5's stop rule was not triggered.
- Pointer: Story 6.11 re-confirms this validation again, against the **final rendered output** (the epics.md reference this document already carries) — this section is Story 4.9's snapshot, not a claim that nothing will need re-measuring later.
