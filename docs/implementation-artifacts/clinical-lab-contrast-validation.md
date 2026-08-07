# Clinical Lab Token Layer — WCAG AA Contrast Validation

**Story:** 1.9 — Clinical Lab Theme Tokens & App Shell (AC5, Task 6)
**Reproduces with** (from `apps/web/`):

```bash
npx vitest run lib/themeTokens.test.ts
```

This is also covered by `turbo run test --filter=web` and `npm run ci`. The test **parses the
shipped `apps/web/app/themes.css`** (a `--gol-([a-z0-9-]+):\s*(#[0-9a-f]{6})` sweep over the real
file, not a re-declared copy in TypeScript) and asserts every pair below against it — so this
table cannot drift from the CSS the app actually ships. Following the Story 1.7 lesson: the
command above matches a real file, and was run to produce every number in this document.

## Method

`contrastRatio` (from `apps/web/lib/paletteCvd.ts`, Story 1.7) is reused, not reimplemented:
sRGB channels are linearised with WCAG's own breakpoint
(`c <= 0.03928 ? c/12.92 : ((c+0.055)/1.055)^2.4`), combined as
`L = 0.2126R + 0.7152G + 0.0722B`, and contrast is `(lighter + 0.05) / (darker + 0.05)`.

WCAG applies different thresholds to different roles, so pairs are classified, not lumped:

- **Text pairs → ≥ 4.5:1** (SC 1.4.3): each of `text-primary`, `text-secondary`, `text-tertiary`,
  `accent` against each of the three backgrounds (`bg-primary`, `bg-secondary`, `bg-hover`); plus
  `on-accent` against each of `accent`, `accent-hover`, `accent-active` (button text on its own
  fill).
- **Control pairs → ≥ 3:1** (SC 1.4.11): `border-control` (input/outlined-control boundaries) and
  `accent` (the focus ring) against each of the three backgrounds.
- **Decorative — excluded, not gated**: `border` against the backgrounds. SC 1.4.11 covers
  boundaries needed to *identify* a control; a divider or card edge is not one. See "Excluded
  pair" below.

## Text pairs (SC 1.4.3, ≥ 4.5:1) — all pass

| Pair | Ratio | Needs |
|---|---|---|
| text-primary / bg-primary | 19.80 | 4.5 |
| text-primary / bg-secondary | 17.40 | 4.5 |
| text-primary / bg-hover | 15.91 | 4.5 |
| text-secondary / bg-primary | 6.95 | 4.5 |
| text-secondary / bg-secondary | 6.11 | 4.5 |
| text-secondary / bg-hover | 5.58 | 4.5 |
| text-tertiary / bg-primary | 5.73 | 4.5 |
| text-tertiary / bg-secondary | 5.04 | 4.5 |
| **text-tertiary / bg-hover** | **4.61** | 4.5 |
| accent / bg-primary | 11.18 | 4.5 |
| accent / bg-secondary | 9.83 | 4.5 |
| accent / bg-hover | 8.99 | 4.5 |
| on-accent / accent | 11.18 | 4.5 |
| on-accent / accent-hover | 12.87 | 4.5 |
| on-accent / accent-active | 7.05 | 4.5 |

## Control pairs (SC 1.4.11, ≥ 3:1) — all pass

| Pair | Ratio | Needs |
|---|---|---|
| border-control / bg-primary | 3.88 | 3 |
| border-control / bg-secondary | 3.41 | 3 |
| **border-control / bg-hover** | **3.12** | 3 |
| accent / bg-primary (focus ring) | 11.18 | 3 |
| accent / bg-secondary (focus ring) | 9.83 | 3 |
| accent / bg-hover (focus ring) | 8.99 | 3 |

The two **bolded** rows above are the binding constraints: `--gol-text-tertiary` cannot go below
`#828282` and `--gol-border-control` cannot go below `#666666` without one of these pairs failing.

## Excluded pair — `--gol-border` (decorative, not a control boundary)

| Pair | Ratio | SC 1.4.11 applies? |
|---|---|---|
| border / bg-primary | 1.57 | No — decorative |
| border / bg-secondary | 1.38 | No — decorative |
| border / bg-hover | 1.26 | No — decorative |

`--gol-border` (`#333333`) is the mockup's divider/card-edge colour and is **deliberately excluded
from the gate**, not an oversight: SC 1.4.11 covers the boundary needed to *identify a control*, and
a decorative divider is not one. Forcing 3:1 here would mean repainting every hairline in the
Clinical Lab mockup for no accessibility gain, so the boundary role was **split into a second
token** instead (`themeTokens.test.ts` documents this exclusion inline so a future reviewer does
not "fix" it by asserting 3:1 on `--gol-border`).

## The three departures from the UX spec, and why

`ux-design-complete.md#Clinical Lab Theme` and `clinical-lab-theme/battle-gallery.html` specify
`--text-tertiary: #666666` and a single `--border: #333333`. Measured against this
implementation's `contrastRatio`, both fail AC5:

- **`--text-tertiary #666666`** — 3.45:1 on `#0a0a0a`, 3.03:1 on `#1a1a1a`. It is body/metadata/
  placeholder text, which SC 1.4.3 requires at 4.5:1. **Resolution:** raised to `#8a8a8a`
  (5.73 / 5.04 / 4.61 across the three backgrounds above — passes all three; `#828282` is the true
  floor).
- **`--border #333333` used for control boundaries** — 1.57:1 / 1.38:1, below the 3:1 SC 1.4.11
  requires of a control's own boundary. **Resolution:** rather than repaint every divider, the
  boundary role was split: `--gol-border` (`#333333`) stays for decorative dividers/card edges
  (not covered by SC 1.4.11 — see above), and a new **`--gol-border-control`** (`#6e6e6e`, added
  this story) carries the boundary of inputs and outlined controls, where SC 1.4.11 does apply
  (3.88 / 3.41 / 3.12 — passes all three).

The third departure is not a contrast matter but belongs with the other two, since all three are
places this implementation knowingly diverges from a written spec (added in code review
2026-08-07 — Task 6 asked for three and this doc shipped two):

- **`--gol-radius: 0px` against RFC-003 Decision 2's `4px`** — not a WCAG issue; a conflict
  between two specs. RFC-003 Decision 2's illustrative theme snippet says `4px`, but
  `ux-design-complete.md` states "Border radius: 0 (sharp corners)" and no
  `clinical-lab-theme/*.html` element sets a radius anywhere. **Resolution:** `0px`, because for a
  purely visual property the mockups are the authority and the RFC snippet is illustrative — the
  same class of stale-snippet override `project-context.md` already records for
  `repositoryFactory.ts` naming and the factory's `APP_MODE` read. Knock-on: `theme.shape
  .borderRadius` is also set to a plain `0` (code review 2026-08-07) — the two `styleOverrides`
  alone left every component that reads `shape.borderRadius` directly, rather than inheriting
  Paper, rendering at MUI's default `4px`.

All three departures are commented inline in `apps/web/app/themes.css`. Story 1.10's search input
and metadata rows are the first consumers of `--gol-border-control`; they would fail their own axe
check if this were deferred.

## For future stories

Re-run `lib/themeTokens.test.ts` against any re-tuned Clinical Lab hex before accepting a change.
A gate failure should be fixed by adjusting that token's hex in `themes.css` — never by lowering a
threshold. Biotech Terminal (Story 6.1) does not carry the WCAG AA guarantee (architecture
Cross-RFC Reconciliation 5) and needs no equivalent doc.
