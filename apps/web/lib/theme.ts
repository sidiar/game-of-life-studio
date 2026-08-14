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
  // Pinned in Story 1.13 — the delete-confirmation dialog's filled Button reads error.main for its
  // fill, error.contrastText for its label and error.dark for its hover fill; left unset, all
  // three are Material's raw dark-mode defaults (#f44336 and friends), invisible to AR-46 because
  // they appear in no source file. `dark` is AUTHORED, not derived: augmentColor()'s
  // lighten()/darken() cannot parse a var() string and returns its input unchanged rather than
  // throwing (see the cssVariables comment below), so a derived `dark` would silently equal `main`
  // and the hover fill would produce no visual feedback — the exact defect already recorded for
  // secondary/--gol-accent-2. warning/info/success/grey/common remain Material defaults; nothing
  // in the app renders them yet (deferred-work.md, 1.9 review).
  error: {
    main: 'var(--gol-danger)',
    mainChannel: 'var(--gol-danger-channel)',
    light: 'var(--gol-danger-hover)',
    dark: 'var(--gol-danger)',
    contrastText: 'var(--gol-on-danger)',
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
  // Pinned in code review 2026-08-07. Left unset, MUI fills every one of these with a raw
  // rgba(255,255,255,α) dark-mode default — invisible to AR-46 (it appears in no source file)
  // and frozen across a data-theme flip. Every component already on screen reads action.*, so
  // unlike the status colours (only `error` now pinned, Story 1.13; warning/info/success remain
  // deferred) it could not wait. The *Opacity numbers stay numeric: MUI multiplies them, so a
  // var() string breaks them.
  action: {
    active: 'var(--gol-action-active)',
    activeChannel: 'var(--gol-text-primary-channel)',
    hover: 'var(--gol-action-hover)',
    hoverOpacity: 0.08,
    selected: 'var(--gol-action-selected)',
    selectedChannel: 'var(--gol-text-primary-channel)',
    selectedOpacity: 0.16,
    focus: 'var(--gol-action-focus)',
    focusOpacity: 0.12,
    disabled: 'var(--gol-action-disabled)',
    disabledBackground: 'var(--gol-action-disabled-bg)',
    disabledOpacity: 0.38,
    activatedOpacity: 0.24,
  },
  divider: 'var(--gol-border)',
  dividerChannel: 'var(--gol-border-channel)',
};

const golTheme = createTheme({
  // NOT a deviation from Decision J — the thing that makes Decision J implementable. With this
  // on, MUI emits `--mui-palette-*: var(--gol-*)` once at :root and every component reads
  // `var(--mui-…, var(--gol-…))`, so a data-theme flip propagates through both layers by pure
  // CSS recomputation — no React re-render. Without it, <Button> throws on render (alpha() in
  // its variant styles) even though CssBaseline, Paper, Typography, TextField, Dialog etc. all
  // render fine — a shell that looks complete and detonates the first time Story 1.13 renders a
  // button. This is NOT MUI's `colorSchemes` light/dark mode API, which Decision J.1 rejects;
  // cssVariables here backs a single, constant, dark palette.
  //
  // ⚠️ It does NOT eliminate all JS colour math (corrected in code review 2026-08-07 — the
  // earlier claim of "zero JS colour math" is not what the build produces). createThemeWithVars
  // still derives some component tokens through lighten()/darken(), which return their input
  // unchanged on a var() string rather than throwing, so the shipped stylesheet carries
  // `--mui-palette-Slider-primaryTrack: var(--gol-accent)` — identical to the active track — and
  // the same for LinearProgress-primaryBg, Switch-primaryDisabledColor and SnackbarContent-bg.
  // Nothing renders those components yet; each is deferred to the story that first does
  // (deferred-work.md, code review of 1-9). Any component reading a derived token needs an
  // authored --gol-* shade plus a styleOverride, exactly as --gol-accent-active already does.
  cssVariables: true,
  palette: paletteConfig,
  typography: { fontFamily: 'var(--gol-font)' },
  // A plain 0, not var(--gol-radius): MUI does arithmetic on this value (e.g. `borderRadius / 2`
  // for a sub-component), which a var() string cannot support. The two styleOverrides below are
  // not enough on their own — everything that reads shape.borderRadius directly rather than
  // inheriting Paper (OutlinedInput/TextField, Chip, Alert, Tooltip, Snackbar, ToggleButton,
  // Slider) shipped 4px rounded corners against a theme whose departure #3 is sharp corners
  // (code review 2026-08-07; Story 1.10's search input was the first case). Safe at 0 because
  // 0/2 === 0, and 0 is the same in both themes, so this is not a token the theme flip needs.
  shape: { borderRadius: 0 },
  components: {
    // Radius goes through styleOverrides, not shape.borderRadius: MUI does arithmetic on the
    // numeric shape value (e.g. `shape.borderRadius / 2` for a sub-component), which a var()
    // string cannot support (RFC-003 Decision 2).
    MuiPaper: { styleOverrides: { root: { borderRadius: 'var(--gol-radius)' } } },
    // Story 1.13 is the first story to ship a live <Button> (lib/theme.test.tsx's Button/
    // IconButton are a render-proof test, not shipped UI), and it is the delete dialog's
    // confirm/cancel pair — the clinical settings mockup's `.btn` family (settings.html:181-198)
    // is uppercase, which reverses the prior blanket `textTransform: 'none'`. No other Button is
    // rendered anywhere yet, so nothing existing depends on the old value.
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 'var(--gol-radius)',
          fontSize: '13px',
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.5px',
          padding: '12px 24px',
        },
      },
    },
    // Dialog surface (Story 1.13). backgroundImage: 'none' is load-bearing — Paper applies a
    // lightness overlay gradient in dark mode, and without this the rendered surface is not
    // --gol-bg-secondary, silently invalidating every contrast ratio themeTokens.test.ts gates for
    // it (the same class of drift the 1.9 review found with --gol-bg-hover). The border is
    // --gol-border, not --gol-border-control: a dialog edge is decorative, not a control boundary
    // (the same split themeTokens.test.ts:99-115 protects for BattleTile's delete button).
    MuiDialog: {
      styleOverrides: {
        paper: {
          background: 'var(--gol-bg-secondary)',
          border: '1px solid var(--gol-border)',
          maxWidth: '440px',
          backgroundImage: 'none',
        },
      },
    },
    // MuiBackdrop's default is a raw rgba(0, 0, 0, 0.5) that AR-46 cannot see (it lives in MUI's
    // source, not ours) and that a data-theme flip would never change — --gol-backdrop replaces it,
    // the same reasoning as --gol-shadow-tooltip and --gol-grid-line (Story 1.10/1.11).
    MuiBackdrop: {
      styleOverrides: { root: { backgroundColor: 'var(--gol-backdrop)' } },
    },
    MuiDialogTitle: {
      styleOverrides: {
        root: { fontSize: '18px', fontWeight: 600, color: 'var(--gol-text-primary)' },
      },
    },
    MuiDialogContentText: {
      styleOverrides: {
        root: { color: 'var(--gol-text-secondary)', fontSize: '14px' },
      },
    },
  },
});

export default golTheme;
