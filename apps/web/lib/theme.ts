import { createTheme } from '@mui/material/styles';

// The single, module-scope, immutable MUI theme (Decision J). Created ONCE at import time and
// exported as a const — no factory function, no useMemo wrapper, no second createTheme() call
// anywhere in the app. Decision J's whole claim is that ThemeProvider never receives a new theme
// identity; a factory here would silently break that the moment someone called it twice.
//
// RFC-003's own theme snippet does not run (Story 1.9 Dev Notes, silent-failure trap 1):
// `palette.primary.main: 'var(--gol-accent)'` alone throws at construction — MUI's
// augmentColor() derives light/dark via lighten()/darken(), which cannot parse a var() string.
// Fix has two parts, both required:
//   1. Every palette colour below supplies light/dark/contrastText explicitly — nothing is
//      derived, so augmentColor() never runs its lighten()/darken() path.
//   2. cssVariables: true (see below) — without it, <Button>/<IconButton> still throw at
//      *render* (not construction) from alpha() inside their variant styles, even once (1) is
//      fixed.
//
// ⚠️ TYPES TRAP, verified against @mui/material 9.3.1: `createTheme`'s exported `ThemeOptions`
// redeclares `palette?: PaletteOptions` directly in its own body — the plain, non-cssVariables
// shape with no `mainChannel`/`defaultChannel`/`primaryChannel`/`dividerChannel` members. That
// redeclaration wins over whatever `cssVariables: true` might otherwise unlock (MUI's typed
// Channel fields exist only under `colorSchemes.{light,dark}.palette`, the `extendTheme` /
// CssVarsProvider API J.1 rejects — not under a flat top-level `palette`). So the *runtime*
// object below is correct and necessary, but passing it as an inline object literal fails
// tsc with TS2353 ("… does not exist in type 'PaletteColorOptions'") on every *Channel key,
// even though MUI accepts and requires them at runtime. Declaring it as its own `const` first
// (inferred type, not literally inline) sidesteps TypeScript's excess-property check — which
// only fires on object literals checked directly against a target type, not on already-typed
// variables passed by reference — without an `as`/`@ts-expect-error` escape hatch anywhere.
const paletteConfig = {
  mode: 'dark' as const, // Constant — both themes are dark (J.2). Never derived, never toggled.
  background: {
    default: 'var(--gol-bg-primary)',
    defaultChannel: 'var(--gol-bg-primary-channel)',
    paper: 'var(--gol-bg-secondary)',
    paperChannel: 'var(--gol-bg-secondary-channel)',
  },
  primary: {
    main: 'var(--gol-accent)',
    mainChannel: 'var(--gol-accent-channel)',
    light: 'var(--gol-accent-hover)',
    dark: 'var(--gol-accent-active)',
    contrastText: 'var(--gol-on-accent)',
  },
  secondary: {
    main: 'var(--gol-accent-2)',
    mainChannel: 'var(--gol-accent-2-channel)',
    light: 'var(--gol-accent-2)',
    dark: 'var(--gol-accent-2)',
    contrastText: 'var(--gol-on-accent)',
  },
  text: {
    primary: 'var(--gol-text-primary)',
    primaryChannel: 'var(--gol-text-primary-channel)',
    secondary: 'var(--gol-text-secondary)',
    secondaryChannel: 'var(--gol-text-secondary-channel)',
    disabled: 'var(--gol-text-tertiary)',
    // Left unset, MUI fills this with its own dark-mode default (`rgba(255, 255, 255, 0.5)`) —
    // a raw literal AR-46 can't catch because it never appears in our source. Pin it to a token
    // explicitly so every rendered colour still traces to themes.css.
    icon: 'var(--gol-text-secondary)',
  },
  divider: 'var(--gol-border)',
  dividerChannel: 'var(--gol-border-channel)',
};

const golTheme = createTheme({
  // NOT a deviation from Decision J — the thing that makes Decision J implementable. With this
  // on, MUI emits `--mui-palette-*: var(--gol-*)` once at :root and every component reads
  // `var(--mui-…, var(--gol-…))`, so a data-theme flip still propagates through both layers by
  // pure CSS recomputation — zero JS colour math, zero React re-render. Without it, <Button>
  // throws on render (alpha() in its variant styles) even though CssBaseline, Paper, Typography,
  // TextField, Dialog etc. all render fine — a shell that looks complete and detonates the first
  // time Story 1.13 renders a button. This is NOT MUI's `colorSchemes` light/dark mode API, which
  // Decision J.1 rejects; cssVariables here backs a single, constant, dark palette.
  cssVariables: true,
  palette: paletteConfig,
  typography: { fontFamily: 'var(--gol-font)' },
  components: {
    // Radius goes through styleOverrides, not shape.borderRadius: MUI does arithmetic on the
    // numeric shape value (e.g. `shape.borderRadius / 2` for a sub-component), which a var()
    // string cannot support (RFC-003 Decision 2).
    MuiPaper: { styleOverrides: { root: { borderRadius: 'var(--gol-radius)' } } },
    MuiButton: {
      styleOverrides: { root: { borderRadius: 'var(--gol-radius)', textTransform: 'none' } },
    },
  },
});

export default golTheme;
