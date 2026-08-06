// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import next from 'eslint-config-next';
import prettier from 'eslint-config-prettier';

// eslint-config-next ships a flat-config array. Its rule/plugin blocks carry a
// global `files` glob (`**/*.{ts,tsx,...}`); we re-scope those to apps/web only.
// If Next's @typescript-eslint plugin block matched the same files as our own
// typescript-eslint block below, ESLint would throw "Cannot redefine plugin
// @typescript-eslint" — the two blocks register different plugin instances.
// Scoping Next to apps/web and typescript-eslint to packages keeps them disjoint.
const nextScopedToWeb = next.map((config) =>
  config.files ? { ...config, files: ['apps/web/**/*.{js,jsx,mjs,ts,tsx}'] } : config,
);

// A hex/HSL colour literal, e.g. "#0a0a0a" / "#fff" / "#00d4ffcc", also inside a
// template literal (Emotion's `css\`color: #fff\`` pattern), plus rgb()/rgba()/
// hsl()/hsla() functional notation. Raw colours belong only in the token layer
// (themes.css — a CSS file, outside this .ts/.tsx lint scope) and the palette
// registry (RFC-007, lands Story 1.7). AR-46 / NFR-8.1: keeping components
// token-only is what makes the Epic 6 second theme a one-file change.
// Named CSS colours ("red") are deliberately NOT matched — too high a
// false-positive risk against unrelated strings; stays with the 1.7 whitelist work.
const HEX_PATTERN = '#([0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})';
const FUNCTIONAL_COLOUR_PATTERN = '(rgb|rgba|hsl|hsla)\\([^)]*\\)';
const COLOUR_SELECTOR_GROUP = [
  `Literal[value=/^${HEX_PATTERN}$/]`,
  `Literal[value=/^${FUNCTIONAL_COLOUR_PATTERN}$/i]`,
  `TemplateElement[value.raw=/${HEX_PATTERN}|${FUNCTIONAL_COLOUR_PATTERN}/i]`,
].join(', ');

export default tseslint.config(
  {
    // Build artefacts, caches, and generated files are never linted. next-env.d.ts
    // is Next-generated and flip-flops between dev/build variants (Story 1.1).
    ignores: [
      '**/node_modules/**',
      '**/.next/**',
      '**/out/**',
      '**/.turbo/**',
      '**/coverage/**',
      '**/dist/**',
      '**/playwright-report/**',
      '**/test-results/**',
      '**/next-env.d.ts',
    ],
  },

  // packages/* are pure TS (no DOM, no React) — core + typescript-eslint only.
  {
    files: ['packages/**/*.ts'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
  },

  // apps/web is linted by eslint-config-next (React, hooks, jsx-a11y, import,
  // @next/next, and its own typescript-eslint block), re-scoped above.
  ...nextScopedToWeb,
  {
    // @next/next resolves the app root from here; without it the plugin warns it
    // "was not detected" in a monorepo where the config sits above apps/web.
    files: ['apps/web/**/*.{js,jsx,mjs,ts,tsx}'],
    settings: { next: { rootDir: 'apps/web' } },
  },

  // AR-46: no raw colour literals in component code. Organism-colour hexes live in the palette
  // registry (RFC-007) and nowhere else in apps/web outside the --gol-* token layer (themes.css,
  // a CSS file this .ts/.tsx rule never reaches) — `paletteRegistry.ts` is that registry (Story
  // 1.7) and is whitelisted below. Test/spec/e2e files are exempt (mirrors the import-boundary
  // block below) — a test asserting a literal colour value is not a component-styling violation.
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    ignores: [
      'apps/web/**/*.test.{ts,tsx}',
      'apps/web/**/*.spec.{ts,tsx}',
      'apps/web/e2e/**',
      'apps/web/lib/paletteRegistry.ts',
    ],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: COLOUR_SELECTOR_GROUP,
          message:
            'Raw hex/colour literals are banned in components (AR-46 / NFR-8.1). ' +
            'Use a --gol-* token (themes.css) or a palette-registry token (RFC-007).',
        },
      ],
    },
  },

  // Import boundary: apps/web production code must never import @gol/test-utils
  // (fake repos, fixtures) — one stray import welds test doubles into the browser
  // bundle. Distinct from AR-46; both live here but enforce different things.
  // Test and e2e files are exempt (they legitimately consume test-utils).
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    ignores: ['apps/web/**/*.test.{ts,tsx}', 'apps/web/**/*.spec.{ts,tsx}', 'apps/web/e2e/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@gol/test-utils', '@gol/test-utils/**'],
              message:
                '@gol/test-utils is test-only — importing it from app code risks bundling ' +
                'fakes into production. Inject repositories at the page boundary instead (AR-2/27).',
            },
          ],
        },
      ],
    },
  },

  // Must be last: turn off every stylistic rule that would fight Prettier.
  prettier,
);
