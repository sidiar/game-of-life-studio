import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// apps/web component/unit tests run in jsdom via React Testing Library.
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
    passWithNoTests: true,
    // Unit/component tests only. Playwright e2e specs live in e2e/ and must NOT
    // be picked up by Vitest (they import @playwright/test, a different runner).
    include: ['**/*.test.{ts,tsx}'],
    exclude: ['e2e/**', 'node_modules/**', 'out/**', '.next/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      // apps/web has no coverage gate by design (RFC-008 Decision 3 counter-metric).
    },
  },
});
