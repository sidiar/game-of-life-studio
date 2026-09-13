import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// apps/web component/unit tests run in jsdom via React Testing Library.
//
// ⚠️ NO `passWithNoTests` (removed in Story 3.7, story FD4). It was inherited from the Story 1.2
// scaffold rather than chosen: with it on, a typo in the `include` glob below is a GREEN run over
// zero tests, and this is the one workspace with no coverage gate to notice the absence.
// @vitejs/plugin-react supplies the React 19 automatic JSX transform for tests
// (Next's own SWC transform doesn't apply under Vitest).
export default defineConfig({
  plugins: [react()],
  resolve: {
    // Mirrors tsconfig.json's "@/*": ["./*"]. Next's webpack/SWC build resolves that alias on its
    // own; raw Vite (what Vitest runs on) has no idea tsconfig `paths` exist unless told directly.
    alias: {
      '@': fileURLToPath(new URL('.', import.meta.url)),
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    // Unit/component tests only. Playwright e2e specs live in e2e/ and must NOT
    // be picked up by Vitest (they import @playwright/test, a different runner).
    include: ['**/*.test.{ts,tsx}'],
    // scripts/ holds the palette CVD sweep — a reporting run that prints a table and asserts
    // nothing. It shares the *.test.ts suffix so Vitest can resolve the lib imports, and is run
    // deliberately via vitest.sweep.config.mts, never as part of `npm test`.
    exclude: ['e2e/**', 'node_modules/**', 'out/**', '.next/**', 'scripts/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      // Reported, never gated. apps/web has NO coverage threshold BY DESIGN (RFC-008 Decision 3 /
      // Alt 5) — it is the Metric 4 counter-metric, the deliberate answer to "coverage everywhere"
      // becoming a target. Story 3.7 turned the gate on for the three packages and left this one
      // alone on purpose; do not add a threshold here.
      //
      // `include` is set anyway, for the reporter rather than for a gate: without it Vitest 4 lists
      // only the files a test loaded, which makes the printed number quietly flattering. `*.bench.ts`
      // is excluded because `vitest run` never executes it (it is `vitest bench`'s glob), so it
      // would sit at 0% forever.
      include: ['app/**/*.{ts,tsx}', 'components/**/*.{ts,tsx}', 'lib/**/*.{ts,tsx}'],
      exclude: ['**/*.test.{ts,tsx}', '**/*.bench.{ts,tsx}'],
    },
  },
});
