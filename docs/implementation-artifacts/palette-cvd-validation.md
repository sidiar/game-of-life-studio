# Palette CVD + Dark-Background Validation

**Story:** 1.7 — Palette Token Registry & Display-Color LUT (AC1, Task 4)
**Reproduces with:** `npx vitest run apps/web/lib/paletteCvd.test.ts` (from `apps/web/`, or
`turbo run test --filter=web` for the full suite) — the four gates below are exactly what that
file enforces in CI. The worst-pair table further down was captured with a throwaway
`tsx` script during development (not checked in); rerun it by looping `contrastRatio`/`deltaE76`
over `displayColor` outputs across all pairs/shades/modes as described in Method below.
**Date:** 2026-08-06

## What is being validated

Every check below runs against **what a user actually sees** — the `displayColor(token,
ageShade)` output at every one of the 8 age shades — not the raw registry hexes. The hexes
(`PaletteColor.hex`) are an authoring input; under the Story 1.7 forced-decision-1 relative
saturation ramp, `displayColor(token, 7)` reproduces `entry.hex` exactly, so the age-cap shade
is where the registry's curated values and the rendered pixel coincide. All seven younger shades
render a less-saturated relative of that same hue/lightness.

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

All math lives in `apps/web/lib/paletteCvd.ts`, imported only by its own test and by the Story
4.9 / 6.11 re-confirmations — never by component code.

## The four hard gates (enforced in `paletteCvd.test.ts`)

| Gate | Rule | Threshold | Measured worst |
|---|---|---|---|
| **G1 — visibility** | Every token, at the age-cap shade (7), vs. both `#0a0a0a` (Clinical Lab) and `#000000` (Biotech Terminal) | contrast ≥ **3.0** | **5.12** (`vermillion`, vs `#0a0a0a`) |
| **G2 — visibility while young** | Every token, at every shade 0-7, vs. `#0a0a0a` | contrast ≥ **2.5** | **3.06** (`bluish-green`, shade 0) |
| **G3 — normal-vision distinctness** | All 20 tokens pairwise, at the age-cap shade, normal vision | ΔE76 ≥ **8.0** | **12.79** (`azure`/`indigo`) |
| **G4 — CVD-robust core** | Tokens 1-8 pairwise, at every shade 0-7, under normal + protan + deutan + tritan | ΔE76 ≥ **4.0** | **4.77** (protan, `bluish-green`/`coral-red`) |

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

| shade | mode | core 1–8 worst pair | all 20 worst pair | min contrast vs `#0a0a0a` |
|---|---|---|---|---|
| 0 | normal | 13.55 (reddish-purple/coral-red) | 6.29 (coral-red/rose) | 3.06 |
| 0 | protan | 5.50 (sky-blue/reddish-purple) | 2.31 (violet/indigo) | 3.06 |
| 0 | deutan | 9.24 (sky-blue/reddish-purple) | 2.85 (mint/rose) | 3.06 |
| 0 | tritan | 6.65 (sky-blue/azure) | 4.02 (cyan/mint) | 3.06 |
| 3 | normal | 23.98 (vermillion/amber) | 11.38 (violet/indigo) | 3.99 |
| 3 | protan | 11.90 (bluish-green/coral-red) | 2.18 (violet/indigo) | 3.99 |
| 3 | deutan | 14.44 (vermillion/amber) | 1.21 (reddish-purple/teal) | 3.99 |
| 3 | tritan | 10.72 (sky-blue/azure) | 6.51 (tangerine/rose) | 3.99 |
| 7 | normal | 31.49 (vermillion/coral-red) | 12.79 (azure/indigo) | 5.12 |
| 7 | protan | 7.17 (bluish-green/coral-red) | 1.88 (violet/indigo) | 5.12 |
| 7 | deutan | 17.04 (amber/yellow) | 1.32 (lavender/periwinkle) | 5.12 |
| 7 | tritan | 9.00 (vermillion/coral-red) | 5.73 (teal/mint) | 5.12 |

Worst case across **all eight shades** — what G4 actually gates on: core-8 protan **4.77**,
tritan **6.65**, deutan **9.24**, normal **13.55**; all-20 (recorded, not gated) deutan **1.21**,
protan **1.88**.

These numbers land within ~0.1–0.4 of the values RFC-007's context engine run measured against
the same hexes before this story's code existed (recorded in the story file's Task 4), with one
exception: the low-saturation shade-0 "worst pair" identity shifts slightly (the story's context
run found `sky-blue`/`azure` at 13.17 normal-core-shade-0; this implementation finds
`reddish-purple`/`coral-red` at 13.55). At low saturation several pairs sit within a fraction of
a ΔE unit of each other, so which one is nominally "worst" is sensitive to sub-percent rounding
choices; the important property — that every number here is comfortably on the same side of its
gate as the story's own reproduction table predicted — holds throughout.

## Known-indistinguishable pairs under CVD (informational — not gated)

These pairs, among the full 20-token set, fall below what most CVD simulations would call
reliably distinguishable at one or more shades. Product's mitigation is the FR-3.3 same-colour
warning at organism creation/edit time (Stories 4.8/4.9), not a palette change — RFC-007 Decision
2 already accepts this residue as the cost of a 20-colour set.

- **Deutan:** `lavender` / `periwinkle` (age-cap shade, ΔE76 1.32); `violet` / `indigo`
  (mid-ramp, ΔE76 1.21)
- **Protan:** `violet` / `indigo` (age-cap shade, ΔE76 1.88; also the worst pair at shade 0 and 3)
- **Tritan:** `teal` / `mint` (age-cap shade, ΔE76 5.73); `cyan` / `mint` (shade 0, ΔE76 4.02)

## For Stories 4.9 and 6.11

Re-run `paletteCvd.test.ts` (or the equivalent ad-hoc script) against any re-tuned hex before
accepting a change. A gate failure should be fixed by re-tuning that entry's `hex`
(RFC-007 Decision 1 — zero data migration) — never by lowering a threshold, and never by
renaming or removing a token `id` (a persisted, destructive change requiring a `formatVersion`
migration step per Decision I.4).
