# RFC-003: Frontend UI Architecture & Styling Strategy

**Status:** Approved
**Date:** 2026-06-05
**Approved:** 2026-07-13
**Author:** Architecture Team

## Summary

This RFC defines the styling architecture for Game of Life Studio, including theme system implementation, component library selection, CSS strategy, and animation approach. The solution must support dual Clinical Lab and Biotech Terminal themes with instant switching under 100ms without FOUC, maintain a reasonable bundle size for static deployment, and provide consistent animation performance across all interfaces.

The architecture is built on **Material UI (MUI) v6** as the component library, with **one theme object wired to an app-owned CSS-variable token layer** (`--gol-*`, per `[data-theme]` block) for fast, FOUC-free, attribute-driven theme switching (Decision 2, revised — arch Decision J).

## Links

- [Main Architecture Document](/docs/planning-artifacts/architecture.md)
- [UX Design Specification](/docs/planning-artifacts/ux-designs/ux-GameOfLife-2026-05-27/ux-design-complete.md)
- [Product Requirements Document](/docs/planning-artifacts/prds/prd-GameOfLife-2026-05-26/prd.md) (FR-8, NFR-8)

## Overview

### Purpose & Goals

**Primary Purpose:**
Establish a scalable, performant frontend UI architecture that supports dual themes, responsive design requirements, smooth animations, and maintains accessibility standards while keeping bundle size acceptable for static deployment.

**Goals:**
1. **Theme System:** Instant theme switching (<100ms) with zero Flash of Unstyled Content (FOUC)
2. **Performance:** Acceptable bundle size for Standalone mode, validated against budget
3. **Animations:** Smooth, hardware-accelerated animations for all interactions
4. **Maintainability:** Clear separation of concerns, typed styles, easy debugging
5. **Accessibility:** Clinical Lab theme meets WCAG AA compliance with proper ARIA patterns and keyboard navigation
6. **Developer Experience:** Fast development builds, hot reload, type-safe styling, broad component coverage

### Background

The Game of Life Studio presents unique frontend challenges:

**Theme Requirements:**
- **NFR-8.2:** Runtime theme switching within 100ms
- **NFR-8.5:** Theme loads before first paint (no FOUC)
- **NFR-8.3:** The Clinical Lab theme meets WCAG AA contrast requirements and is the recommended theme for accessibility. The Biotech Terminal theme is a stylistic option and is not held to the same contrast guarantees.
- Two completely different visual identities (Clinical Lab vs Biotech Terminal)
- Different color palettes, typography, spacing, and animation styles
- Different animation styles (subtle lifts vs glowing scan lines)

**Performance Budget Considerations:**
- Static export bundle should stay within target (~200KB initial / ~300KB total) — to be validated by benchmarking after MUI integration
- Theme switching must complete within ~16ms to avoid frame drops
- CSS repaint/reflow must stay minimal to maintain 60 FPS
- Animations cannot interfere with simulation engine performance

**Component Inventory:**
- Navigation (Battle Gallery, Settings)
- Cards (Battle tiles, Organism cards)
- Forms (Organism Editor with complex rule builder)
- Controls (Toggles, sliders, dropdowns, autocomplete) — the Edit-Mode Organism Dropdown carries a per-row **edit (pencil)** affordance (FR-3.12)
- Modals (Organism Editor full-screen overlay) — a `Dialog` reachable from **both** the Organism Library and the Battle Editor (FR-3.12, M5); when opened from a battle it overlays the mounted `<BattlePage>` rather than navigating, so the in-progress grid is preserved (RFC-005 Decision 3 note)
- Canvas elements (Petri Dish grid — special considerations, handled outside MUI)

### High Level Design Proposal

#### Decision 1: Component Library

**Decision:** Material UI (MUI) v6 core (`@mui/material`, MIT-licensed, free)

**Rationale:**
- Comprehensive component catalog covers the full inventory: Navigation, Cards, Forms, Sliders, Toggles (`Switch`, `ToggleButtonGroup`), Dropdowns, searchable dropdowns (`Autocomplete`), Modals (`Dialog`), Progress indicators, and Tooltips — eliminating significant bespoke component work.
- First-class Next.js (App Router) integration with documented SSR setup.
- Strong built-in accessibility (ARIA roles, focus management, keyboard navigation).
- MIT-licensed core is free; advanced `@mui/x-*` premium packages are **not** required and must not be imported.

**Scope notes:**
- Pre-set color swatches will be offered for any color selection; **no color-picker component is needed**, so MUI's lack of a free color picker is not a constraint.
- **Organism colours are domain data, not theme tokens** — identical across both themes and defined by the palette registry in **RFC-007**, separate from this RFC's CSS-variable theming.
- The Petri Dish grid is rendered outside MUI (see grid rendering architecture); MUI covers all surrounding UI chrome.

**Import discipline (bundle hygiene):**
```ts
// Import individual components so tree-shaking keeps the bundle lean
import Button from '@mui/material/Button'
import Slider from '@mui/material/Slider'
import Tooltip from '@mui/material/Tooltip'
// Avoid: import { Button, Slider } from '@mui/material' in code paths
// where the bundler cannot tree-shake effectively.
```

#### Decision 2: Theme System Architecture

**Decision *(revised 2026-07-09 — adversarial finding #8)*:** **One `createTheme()` object + an app-owned CSS-variable token layer.** All theme-varying values live as `--gol-*` custom properties in a dedicated CSS file, defined per `[data-theme='…']` block; the single MUI theme references only `var(--gol-*)` strings. Switching themes flips the `data-theme` attribute on `<html>` — **the theme object, `ThemeProvider`, and the React tree never change.**

**Rationale:**
- The previous draft built **two** `createTheme()` objects and swapped which one `ThemeProvider` received. That swap is a React re-render through Emotion — precisely the runtime recomputation the CSS-variables argument claims to avoid — so it could not substantiate the <100ms / <16ms claims (finding #8). With one immutable theme, a switch is a pure attribute flip: the browser recomputes variable values and repaints; no JS beyond `setAttribute`.
- **Why not MUI's `colorSchemes` mechanism** (the packaged CSS-vars mode): color schemes vary the **palette only** — typography, shape, and `components.styleOverrides` are theme-level — while Clinical Lab vs Biotech Terminal differ in font (sans vs monospace), radius (4 vs 0), and component overrides. And Material UI's scheme API is typed/documented for `light`/`dark`; two *dark* brand themes would have to squat those slots, breaking `applyStyles('dark')`, system-mode, and cross-tab semantics. MUI's architectural *direction* (attribute-driven CSS variables) is exactly what this design follows — with our own token layer because MUI's can't express these differences.
- This matches the PRD's acceptance criteria **verbatim**: NFR-8.2 "theme applied via data attribute on root element"; NFR-8.4 "theme definitions isolated in dedicated CSS files", "component styles reference only CSS variable names", "adding a new theme requires only (1) new CSS variable definitions, (2) theme registration in settings"; NFR-8.5 inline-script-before-paint.

**Token layer (`themes.css` — the dedicated file, NFR-8.4):**
```css
:root[data-theme='clinical-lab'] {
  --gol-bg: #0a0a0a;         --gol-surface: #1a1a1a;
  --gol-accent: #00d4ff;     --gol-on-accent: #0a0a0a;   /* dark text on cyan accent */
  --gol-accent-2: #00d4ff;
  --gol-text: #ffffff;       --gol-text-2: #999999;
  --gol-divider: #333333;
  --gol-font: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  --gol-radius: 4px;
}
:root[data-theme='biotech-terminal'] {
  --gol-bg: #000000;         --gol-surface: #0a0f0a;
  --gol-accent: #00ff41;     --gol-on-accent: #000000;   /* black text on green accent */
  --gol-accent-2: #00ffff;
  --gol-text: #00ff41;       --gol-text-2: #33ff77;
  --gol-divider: #1a3a1a;
  --gol-font: 'Courier New', Courier, monospace;
  --gol-radius: 0px;
}
```

**The single theme (references variables only — never concrete values):**
```ts
import { createTheme } from '@mui/material/styles'

const golTheme = createTheme({
  palette: {
    mode: 'dark',   // both themes are dark; constant, so MUI's mode-dependent behaviour never flips
    background: { default: 'var(--gol-bg)', paper: 'var(--gol-surface)' },
    primary: { main: 'var(--gol-accent)', contrastText: 'var(--gol-on-accent)' },
    secondary: { main: 'var(--gol-accent-2)' },
    text: { primary: 'var(--gol-text)', secondary: 'var(--gol-text-2)' },
    divider: 'var(--gol-divider)',
  },
  typography: { fontFamily: 'var(--gol-font)' },
  components: {
    // Shared overrides, parameterized by tokens — the Terminal's square-corner aesthetic is
    // just --gol-radius: 0 (see Risk 2); radius goes through overrides (not shape.borderRadius)
    // because MUI does arithmetic on the numeric shape value, which a var() string can't support.
    MuiPaper:  { styleOverrides: { root: { borderRadius: 'var(--gol-radius)' } } },
    MuiButton: { styleOverrides: { root: { borderRadius: 'var(--gol-radius)', textTransform: 'none' } } },
  },
})
```

**Constraints this imposes (accepted):**
- **No JS colour math on theme values** — `alpha(theme.palette.primary.main, 0.5)` can't compute over a `var()` string. Any derived shade becomes its own token (e.g. `--gol-accent-hover`), defined per theme block.
- `contrastText` values are supplied explicitly per theme (MUI can't compute contrast from a variable) — already the case above.
- `palette.mode` is constant `'dark'`; a future light theme would keep `mode: 'dark'` semantics or revisit this decision.

**Synchronous loading to prevent FOUC (NFR-8.5):**
```html
<!DOCTYPE html>
<html>
<head>
  <!-- This script must run before body renders. Theme preference lives in the gol:settings
       record (RFC-006 Decision 7 — no second source of truth); parse defensively. -->
  <script>
    (function () {
      var theme = 'clinical-lab';
      try { theme = JSON.parse(localStorage.getItem('gol:settings')).theme || theme } catch (e) {}
      document.documentElement.setAttribute('data-theme', theme);
    })();
  </script>
</head>
```

The theme object is created once at module scope and mounted once; `ThemeProvider` never changes identity. The Settings toggle writes the `data-theme` attribute and persists the choice through the settings repository (RFC-005 Decision 9) — the attribute is the single runtime switch, keeping the inline script and React tree in sync by construction.

#### Decision 3: CSS Strategy & Styling Engine

**Decision:** Emotion (MUI's default styling engine) with disciplined `sx` usage, plus Next.js SSR style extraction.

**Rationale:**
- MUI v6 ships with Emotion. Because the single theme's token values are CSS custom properties (Decision 2) and the theme object never changes identity, Emotion generates each style once — a theme switch invalidates nothing.
- Component structural styles (spacing, radius, padding) still resolve through Emotion on first render; this residual overhead is accepted for now and mitigated below.

**`sx` prop discipline:**
- Use `sx` for genuinely dynamic, per-instance values only.
- For static, reusable styles, prefer theme `styleOverrides` or `styled()` components so styles are generated once rather than per render.

**Custom global CSS** (e.g., keyframes) lives in MUI's `GlobalStyles` component or a global stylesheet; it composes cleanly with Emitted styles.

#### Decision 4: Animation Strategy

**Decision:** MUI built-in transitions for standard UI, custom CSS keyframes for terminal effects, Framer Motion only for complex interactive animation.

**Standard UI transitions (hardware-accelerated):**
```tsx
import Fade from '@mui/material/Fade'
import Collapse from '@mui/material/Collapse'
// Fade, Slide, Zoom, Grow, Collapse cover modal/panel/list transitions.
// Clinical Lab "subtle lift" hovers are configured via theme transitions
// and component styleOverrides (e.g., transform: translateY(-1px)).
```

**Biotech Terminal scan-line / glow effects (custom keyframes):**
MUI has no terminal-style animation primitives; these are authored as CSS keyframes and injected via `GlobalStyles`:
```css
@keyframes scanline {
  0%   { transform: translateY(-100%); }
  100% { transform: translateY(100%); }
}
.scanner {
  animation: scanline 8s linear infinite;
}
```

**Complex interactive animation (Framer Motion, used sparingly):**
```tsx
import { motion } from 'framer-motion'

function OrganismCard() {
  return (
    <motion.div
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      transition={{ type: 'spring', stiffness: 400 }}
    >
      {/* Card content */}
    </motion.div>
  )
}
```

**Performance rules:**
- Canvas animations (grid) handled separately in `GridRenderer`, not via MUI/Framer Motion.
- Prefer CSS/transform-based animation for all UI.
- No UI animation running during simulation steps.
- Debounce/throttle interactive animations.

#### Decision 5: Accessibility Architecture

**Decision:** Rely on MUI's built-in semantic/ARIA patterns, with the **Clinical Lab theme as the accessibility-compliant, recommended default**.

**Rationale:**
- MUI components provide correct roles, focus management, and keyboard interaction out of the box, reducing hand-rolled ARIA risk.
- The **Clinical Lab** theme is designed and validated to meet WCAG AA contrast ratios (≥4.5:1 for normal text) and is presented to users as the recommended theme.
- The **Biotech Terminal** theme is a stylistic option. Its high-saturation green-on-black palette is not guaranteed to meet WCAG AA across all surfaces and is explicitly out of scope for the contrast guarantee.

**Contrast handling (Clinical Lab):**
```ts
// palette.primary.contrastText is set to a dark value so text on the
// cyan accent meets the >4.5:1 contrast requirement.
primary: { main: '#00d4ff', contrastText: '#0a0a0a' }
```

### Risks & Mitigations

**Risk 1: Bundle Size Growth**
- **Risk:** MUI + Emotion increase bundle size versus hand-rolled CSS.
- **Mitigation:**
  - Per-component imports for effective tree-shaking (Next.js handles this).
  - Avoid premium `@mui/x-*` packages entirely.
  - Dynamic imports for heavy, rarely-used components (e.g., Organism Editor).
  - Benchmark against the ~300KB total budget after integration and monitor with a bundle analyzer.

**Risk 2: Biotech Terminal Theme Requires Heavy Overriding**
- **Risk:** MUI's Material Design defaults (rounded corners, elevation shadows, color roles) fight the monospace, green-on-black terminal aesthetic.
- **Mitigation:**
  - Centralize overrides in the theme's `components.styleOverrides`.
  - Budget extra time (~1–2 days) for the Terminal theme specifically; Clinical Lab maps cleanly to MUI defaults.

**Risk 3: Emotion Runtime Overhead**
- **Risk:** Structural styles still resolve through Emotion at runtime on first render.
- **Mitigation:**
  - The immutable single theme (Decision 2) means styles are generated once — no theme-driven recomputation ever.
  - `sx`-prop discipline (dynamic values only).
  - Monitor **Pigment CSS** (`@mui/material-pigment-css`, build-time extraction) as a future migration path if profiling shows the overhead is material.

**Risk 4: Theme Switch Performance Impact**
- **Risk:** Switching themes triggers a repaint.
- **Mitigation:**
  - The switch is a single `data-theme` attribute flip — no React render, no Emotion work, no theme-object change (Decision 2); the browser recomputes variable values and repaints, comfortably inside the <100ms / <16ms budgets.
  - Scope variables to minimize cascade; use `will-change` sparingly.

**Risk 5: Cross-Browser CSS Inconsistency**
- **Risk:** CSS renders differently across browsers.
- **Mitigation:**
  - Autoprefixer in the build pipeline.
  - Test across all target browsers.
  - Progressive enhancement for newer features.

### Alternatives Considered

**Alternative 1: Custom component system (CSS Modules + Tailwind)**
- **Pros:** Smallest possible bundle, full control over both themes, no library lock-in, build-time CSS (no runtime overhead).
- **Cons:** Significant bespoke work to build and maintain a full component library; accessibility must be hand-rolled and audited; slower development velocity.
- **Rejected because:** The component-building and accessibility burden outweighs the bundle savings for a Studio-mode (non-embedded) app. MUI's coverage and built-in a11y deliver better velocity and correctness at an acceptable bundle cost.

**Alternative 2: Ant Design**
- **Pros:** Comprehensive component set, included theme system.
- **Cons:** Heavier default footprint; design language even harder to bend toward the dual bespoke themes; less idiomatic Next.js/Emotion integration than MUI.
- **Rejected because:** MUI's CSS-variables theming is a better fit for fast, FOUC-free switching and custom theming.

**Alternative 3: Pure Tailwind (no component library)**
- **Pros:** Single styling approach, utilities for everything, no runtime CSS.
- **Cons:** Long class strings, weak encapsulation for complex components, no built-in accessible component behavior.
- **Rejected because:** Still requires building accessible components by hand.

**Alternative 4: CSS-in-JS only (styled-components/Emotion without a component library)**
- **Pros:** Component-scoped styles, dynamic theming.
- **Cons:** Runtime overhead, no component catalog, no built-in accessibility.
- **Rejected because:** Provides the styling engine but none of MUI's component or a11y value.

---

**Status:** Approved (2026-07-13)

**Next Steps (implementation):**
1. Build MUI theme-switching prototype (CSS-variables mode + FOUC script)
2. Benchmark bundle size against the ~300KB budget and validate switching <100ms
3. Validate WCAG AA contrast for the Clinical Lab theme
4. Build out Biotech Terminal `styleOverrides` and custom keyframe effects
