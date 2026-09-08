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
// registry (RFC-007 — apps/web/lib/palette/paletteRegistry.ts, whitelisted below).
// AR-46 / NFR-8.1: keeping components token-only is what makes the Epic 6
// second theme a one-file change.
// Named CSS colours ("red") are deliberately NOT matched — too high a
// false-positive risk against unrelated strings.
// ⚠️ The Literal selectors are UNANCHORED (code review 2026-08-07). They were `^…$`, which
// matched a bare literal only — so `borderBottom: '2px solid #333333'`, the plain-string CSS
// shorthand form these style objects actually use, sailed through AC3's gate with a raw hex in
// a component. The TemplateElement selector was already unanchored, which is why the template
// form of the same declaration WAS caught; the two now behave alike. Longest alternative first
// so `#00d4ff` matches as 6 digits rather than backtracking from 3, and a trailing \b so a URL
// fragment like '/docs#abcd-ef' does not read as a colour.
const HEX_PATTERN = '#([0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\\b';
const FUNCTIONAL_COLOUR_PATTERN = '(rgb|rgba|hsl|hsla)\\([^)]*\\)';
const COLOUR_SELECTOR_GROUP = [
  `Literal[value=/${HEX_PATTERN}/]`,
  `Literal[value=/${FUNCTIONAL_COLOUR_PATTERN}/i]`,
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
  // 1.7) and is whitelisted below. Test/spec/e2e files are exempt — a test asserting a literal
  // colour value is not a component-styling violation.
  //
  // ⚠️ This `ignores` list is NOT interchangeable with the import-boundary block's below, which is
  // otherwise near-identical: `paletteRegistry.ts` belongs here and MUST NOT be copied there, or
  // the registry silently loses the @gol/test-utils import boundary. Two blocks, two lists.
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    ignores: [
      'apps/web/**/*.test.{ts,tsx}',
      'apps/web/**/*.spec.{ts,tsx}',
      'apps/web/e2e/**',
      'apps/web/lib/palette/paletteRegistry.ts',
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
  //
  // `@/test-support/**` is banned by the SAME rule for the same reason. It holds the app's own
  // test doubles — the ones that cannot live in @gol/test-utils because they need DOM types, which
  // `packages/*` deliberately do not have (project-context: engine purity). `recordingContext2d`
  // sat in `lib/` until 2026-09-08, where nothing stopped a production module importing it; the
  // move only means something with this pattern beside it.
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
            {
              group: ['@/test-support', '@/test-support/**'],
              message:
                'apps/web/test-support holds test doubles — importing one from app code would ' +
                'bundle it into the browser. It lives outside lib/ precisely so this rule can ' +
                'catch that.',
            },
          ],
        },
      ],
    },
  },

  // Import boundary: the generic rules engine (packages/simulation/src/engine/) must import
  // NOTHING GoL-specific. AR-16 makes it parametric over an arbitrary subject; AR-40 tests that
  // claim with a non-Game-of-Life subject. A `@gol/domain` import here typechecks, passes every
  // test, and silently ends the reusability the layer exists for — the failure is invisible, so
  // the boundary has to be mechanical. Story 3.2 lands the GoL layer in this SAME package
  // (src/gol/), which is why this is scoped to a DIRECTORY and not to the package: removing
  // `"@gol/domain": "*"` from packages/simulation/package.json would break 3.2 instead.
  //
  // The AR-40 proof test lives inside src/engine/ deliberately, so this rule enforces its
  // "imports nothing from @gol/domain" claim rather than leaving it to review — hence NO test
  // exemption here, unlike the two apps/web blocks above. The AC5 assignability test sits outside
  // this directory precisely because it must import @gol/domain.
  //
  // ⚠️ A THIRD, independent block. Do not merge it into the AR-46 colour block or the
  // @gol/test-utils block above; all three have deliberately non-interchangeable scopes.
  {
    files: ['packages/simulation/src/engine/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@gol/*'],
              message:
                'The generic rules engine must import nothing GoL-specific (AR-16/AR-40). It is ' +
                'parametric over an arbitrary subject S with an opaque payload; the Game of Life ' +
                'binding belongs in packages/simulation/src/gol/, which is a CALLER of this layer.',
            },
            {
              regex: '^\\.\\.($|/)',
              message:
                'src/engine/ is a self-contained boundary (AR-40) — a relative path escaping it ' +
                'reaches GoL code without tripping the @gol/* ban above. Keep the engine leaf-only.',
            },
          ],
        },
      ],
    },
  },

  // Must be last: turn off every stylistic rule that would fight Prettier.
  prettier,
);
