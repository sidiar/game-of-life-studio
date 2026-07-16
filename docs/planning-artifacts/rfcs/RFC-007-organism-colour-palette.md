# RFC-007: Organism Colour Palette & Accessibility

**Status:** Approved
**Date:** 2026-06-23
**Approved:** 2026-07-10
**Author:** Architecture Team

## Summary

This RFC defines the **organism colour system**: a curated, **developer-extensible** palette (currently 20 colours) that organisms select from (FR-2.3), chosen for **distinguishability on dark backgrounds and under colour-vision deficiency (CVD)** (NFR-8.3), and the colour-resolution pipeline that turns a stored colour into the per-age display colours the renderer batches by (Decision B). Colours are **reusable with a warning**, not unique — the palette is a quality tool, not a cap on organism count (Decision 3).

The guiding decision is **decoupling: an organism stores a stable palette *token*, never a raw hex.** Hex (and HSL) values live in a single app-level **registry**, resolved at render time. This makes the palette **tunable** — a colour can be improved later by editing one registry entry, with **no migration of saved organisms** — and keeps organism colours as **theme-independent domain data**, distinct from RFC-003's UI-chrome theming.

This RFC **finalizes Decision B.3** (the aging saturation transform) and resolves review **gap F** (the missing palette spec).

## Links

- [Main Architecture Document](/docs/planning-artifacts/architecture.md) — Decision B (aging), Cross-RFC Reconciliations
- [Product Requirements Document](/docs/planning-artifacts/prds/prd-GameOfLife-2026-05-26/prd.md) — FR-2.3 (palette selection), FR-2.4 / FR-5.7 (aging), NFR-8.3 (accessibility)
- [RFC-001: Multi-Mode Architecture](/docs/planning-artifacts/rfcs/RFC-001-multi-mode-architecture.md) — `Organism` entity (`color` → `colorToken`)
- [RFC-002: Grid Rendering Technology](/docs/planning-artifacts/rfcs/RFC-002-grid-rendering-technology.md) — `displayColor` LUT, batch by colour state (colorToken × age-shade, Decision B.2)
- [RFC-003: Frontend UI Architecture](/docs/planning-artifacts/rfcs/RFC-003-frontend-ui-architecture.md) — UI theming (a *separate* colour system)
- [RFC-004: Rules Engine & Simulation](/docs/planning-artifacts/rfcs/RFC-004-simulation-rules-engine.md) — `OrganismRef`, aging
- [RFC-006: Persistence & Workspace Schema](/docs/planning-artifacts/rfcs/RFC-006-persistence-workspace-schema.md) — export carries the token; destructive palette changes ride the single `formatVersion` migration chain (arch Decision I)

## Overview

### Purpose & Goals

**Primary Purpose:** Give organism colours a single authoritative definition that is accessible, works with the aging visual, and can evolve over time without breaking saved data.

**Goals:**
1. **Decoupled & tunable:** organisms reference a colour by stable token; hex values live in one registry and can be adjusted later with no data migration.
2. **Distinguishable:** 20 colours that are mutually distinct, **on near-black backgrounds**, and **under common CVD types** (deutan/protan/tritan) as far as 20 colours allow.
3. **Aging-compatible:** the palette underpins Decision B's per-age display colours and survives the FR-5.7 saturation ramp without collapsing into indistinguishable greys.
4. **Theme-independent:** organism colours are domain data, identical across both themes — *not* part of RFC-003's themed CSS-variable system.
5. **Future-extensible:** more colours, or per-theme variants for a future light theme, can be added additively without changing organism data.

### Background

**Two distinct colour systems.** RFC-003 owns **UI-chrome** colours: themed, swapped via CSS custom properties, different per theme. This RFC owns **organism** colours: domain data, the same in both themes, resolved into the **Canvas** renderer. Conflating them would couple the life-form data to the UI theme. They are kept separate; RFC-003 cross-references this RFC.

**Why tokens, not hex.** FR-2.3 requires a *pre-set palette* (no free-form picker). If an organism stored a raw hex (`#ff6b5e`), then improving that colour later — for contrast or CVD separation — would leave every existing organism on the old value and require a data migration. Storing a **stable token** and resolving the hex at render time means a palette tweak is a one-line registry edit that every organism picks up automatically. This is RFC-003's "no hard-coded colour values" philosophy (NFR-8.1/8.4) applied to organism data.

**The hard part.** Twenty colours that stay distinct under CVD is not fully achievable with hue alone — qualitative CVD-safe sets max out around 8–12. The palette therefore also varies **lightness**, and the aging ramp is constrained (below) so desaturation does not erase the differences that keep colours apart.

## High Level Design Proposal

### Decision 1: Token-referenced palette (no hard-coded hex on organisms)

**Decision:** Organism colours are defined once in an ordered **registry**; organisms reference an entry by its stable `id` (`colorToken`). Hex/HSL are resolved at render time.

```ts
// One app-level registry — the single source of truth for organism colours.
export interface PaletteColor {
  readonly id: string        // STABLE token, never reused (e.g. 'sky-blue') — what organisms store
  readonly name: string      // human label shown in the picker (decoupled from the hex)
  readonly hex: string       // base (full-saturation, age-cap) colour — TUNABLE without data migration
  readonly h: number; readonly s: number; readonly l: number   // derived from hex; cached for the aging ramp
}

export const PALETTE_VERSION = 1 as const
export const PALETTE: readonly PaletteColor[]   // the current 20 entries (Decision 2) — developer-extensible; appending is additive (no migration)

// Organisms store the TOKEN, not the hex:
//   RFC-001 Organism:  color: '#ff6b5e'   ──►   colorToken: 'coral-red'
// Resolution:  organism.colorToken → PALETTE.find(c => c.id === token) → base colour → age shades (Decision 4)
```

**Migration safety (with RFC-006):**
- **Adjusting** an entry's `hex`/`name` → **no migration** (organisms reference the `id`).
- **Adding** a token → safe (additive).
- **Removing/renaming** a token `id` → a **destructive** change: it bumps the envelope `formatVersion` and lands as a token-rewrite step in RFC-006's single migration chain (arch Decision I; `PALETTE_VERSION` stamps the registry for provenance — it is never independently branched on). An organism pointing at a missing token still falls back to a default and warns (NFR-7.3).

### Decision 2: The colour palette (currently 20 tokens)

**Decision:** A curated set of tokens (currently 20), **ordered by distinguishability** (the default assignment order — Decision 3). The set is **developer-extensible**: because organisms store a token `id` and additions are additive (Decision 1), a developer can append new CVD-checked tokens later with **zero saved-data impact** and no end-user color authoring (still palette-only for MVP). The first ~8 are the most CVD-robust (Okabe-Ito / Paul-Tol–derived); the remainder fill in using hue **and** lightness separation.

| # | Token (`id`) | Name | Hex (starting value) |
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

**Design criteria (the durable part — the hexes are tunable):**
- **Visible on near-black** — every colour clears a minimum luminance against Clinical Lab `#0a0a0a` and Biotech Terminal `#000000`.
- **Hue + lightness spread** — colours differ in *both* hue and lightness, so they remain separable for CVD users (who lose some hue discrimination) **and** when desaturated by aging (Decision 4).
- **Safe core first** — tokens 1–8 are maximally separated; since most battles use 3–5 organisms, the default assignment order keeps small battles in the robust range.
- **No free-form colours (MVP)** — FR-2.3 is palette-only; this keeps the set curated, CVD-checked, and tunable. The palette is **developer-extensible** (append CVD-checked tokens later, additive per Decision 1); end-user colour authoring stays out of scope for MVP.

> The starting hexes above are a principled first cut and **must be validated with CVD simulation** (Next Steps). Because organisms reference tokens, that validation can re-tune any hex with **zero saved-data impact**.

### Decision 3: Selection & allocation (FR-2.3)

**Decision:** The palette is a pool of tokens. **Every token is always selectable — colours may be reused across organisms.** Choosing a token another organism already uses is permitted but raises a **non-blocking warning** in the Organism Editor (e.g. *"[Name] already uses this colour"*). A new organism still **defaults to the next unused token in distinguishability order** (Decision 2) for convenience, so small battles stay in the robust range without effort.

- **The palette does not cap organism count.** Colour uniqueness is no longer enforced; the token set is a curation/quality tool, not a ceiling. Organism count is bounded only by storage (NFR-7.2), and creation/clone (FR-1.2 / FR-1.6) never runs out of a colour to assign.
- **Grid-level disambiguation.** Because colours can repeat, two organisms sharing a colour are visually indistinguishable *on a grid*. When two organisms placed in the **same Battle** share a colour, the Battle surfaces a second non-blocking warning (FR-3.3). Distinguishability is only *guaranteed* while the number of distinct co-placed colours is ≤ the palette size; beyond that, repetition is by design and the user is told.
- The picker shows the swatch + `name` (never a raw hex), reinforcing the decoupling.
- Usage is derived from loaded organisms (no separate store), consistent with RFC-005's derivation approach.

### Decision 4: Display-colour resolution & the aging transform (finalizes Decision B.3)

**Decision:** A per-battle LUT maps `(colorToken, ageShade)` to a concrete colour — organism identity never enters the mapping (a separate `OrganismRef → colorToken` indirection, built at simulation start, feeds it), which is what makes RFC-002's **colour-state batching** (Decision B.2) sound: organisms sharing a token share fill groups.

```ts
// ageShade = min(age, 7)              // visual cap (FR-5.7)
// saturation = 0.30 + 0.10 * ageShade // 30% at birth → 100% at age 7 (FR-5.7)
// LIGHTNESS IS HELD CONSTANT across the ramp; only saturation varies.
function displayColor(c: PaletteColor, ageShade: number): string {
  const s = 0.30 + 0.10 * ageShade
  return hsl(c.h, s, c.l)             // hue & lightness from the registry; saturation from age
}
// Precompute once per battle: PALETTE entries in use × 8 age-shades  →  ≤160 colours (RFC-002 §3).
```

**The CVD ↔ aging tension, resolved.** FR-5.7 desaturates young cells toward grey, which *reduces* colour separation — worst for CVD users. The mitigation lives in Decision 2: because base colours are separated in **lightness** (not only hue and saturation), and the ramp **holds lightness constant**, the lightness differences that distinguish two colours **persist even at 30% saturation**. So a young (desaturated) coral-red and a young teal still differ in lightness, not just hue. (The effect is also transient — a cell reaches full saturation by age 7.)

### Decision 5: Theme independence & future per-theme variants

**Decision:** Organism colours are identical across both themes and are **not** CSS theme variables. Both MVP themes are dark, so one palette serves both.

- A future **light** theme could require per-theme hexes; the registry supports this additively (an entry could carry `hexByTheme`) **without changing organism data** — organisms still reference the token. Flagged, not built.
- UI feedback on cells (hover, selection outline, grid lines) uses **theme tokens** (RFC-003), never palette colours, so it never collides with an organism colour.

## Risks & Mitigations

**Risk 1: 20 colours cannot all be CVD-distinguishable via hue alone.**
- *Mitigation:* hue **+ lightness** separation (Decision 2); a maximally-safe core (1–8) surfaced first by the assignment order; validate with CVD simulation.

**Risk 2: Aging desaturation erases colour separation, especially for CVD.**
- *Mitigation:* constant-lightness ramp + lightness-separated base colours (Decision 4); effect is transient (≤7 cycles).

**Risk 3: Tuning the palette breaks saved organisms.**
- *Mitigation:* the token model — adjusting a hex needs no migration; only removing/renaming a token does (a `formatVersion` step in RFC-006's single chain — arch Decision I — with a default-fallback + warning).

**Risk 4: Colours invisible on dark backgrounds.**
- *Mitigation:* minimum-luminance criterion validated against `#0a0a0a` and `#000000`.

**Risk 5: Organism colours clash with UI feedback colours.**
- *Mitigation:* hover/selection/grid-line cues use theme tokens (RFC-003), kept disjoint from the organism palette (Decision 5).

## Alternatives Considered

**Alternative 1: Store the hex on the organism (RFC-001's original `color: hex`).**
- *Rejected:* hard-codes the colour, blocks future tuning, and requires a data migration to improve any colour. The token model removes all three problems.

**Alternative 2: Free-form colour picker.**
- *Rejected:* contradicts FR-2.3 (palette-only) and makes CVD-safety / dark-bg visibility / distinctness impossible to guarantee.

**Alternative 3: Per-theme organism palettes now.**
- *Rejected for MVP:* both themes are dark, so one palette suffices; the registry can add per-theme variants additively later without touching organism data.

**Alternative 4: Algorithmically generated colours (evenly spaced hues).**
- *Rejected:* even hue spacing guarantees neither CVD-safety nor dark-background visibility; a curated, validated set is better and is still tunable via the registry.

**Alternative 5: Vary the aging ramp by lightness instead of saturation.**
- *Rejected:* FR-5.7 specifies a *saturation* ramp; changing lightness with age would fight the dark-background visibility budget and the FR-5.7 wording. Holding lightness constant (Decision 4) preserves both FR-5.7 and CVD separation.

---

**Status:** Approved (2026-07-10)

**Next Steps (implementation):**
1. Validate the 20 starting hexes with CVD simulation (Color Oracle / Coblis / programmatic) on both backgrounds; re-tune as needed (no saved-data migration required).
2. Lock `PALETTE_VERSION = 1`.
