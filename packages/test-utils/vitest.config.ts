import { defineConfig } from 'vitest/config';

// Each package owns its Vitest config (RFC-008 Decision 9). packages/* are pure
// TS — node environment, no DOM.
//
// ⚠️ NO `passWithNoTests` (removed in Story 3.7). Its comment used to read "No engine code exists
// yet", which stopped being true in Story 3.1. A fixtures package whose whole suite is deleted or
// mis-globbed must fail, not pass green.
export default defineConfig({
  test: {
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: ['**/*.test.ts', '**/*.bench.ts'],
      // ⚠️ AR-39 DOES NOT NAME THIS PACKAGE (story AC11) — the coverage table lists domain,
      // simulation, persistence and apps/web, and @gol/test-utils falls through every one of them.
      // Decided rather than inherited from a glob:
      //
      //   - NOT 90%. It sat at 89.47% branches when this was written, so the core tier would have
      //     reddened CI on the fixtures package the day it landed — and inventing a >=90%
      //     requirement AR-39 never states is exactly the coverage-for-its-own-sake RFC-008 Risk 1
      //     rejects.
      //   - NOT "no gate" either. apps/web's zero-gate is a deliberate counter-metric about UI
      //     coverage theatre (RFC-008 Decision 3, Alt 5); this package is not UI. A broken fixture
      //     here weakens the tests of every package that consumes it, silently — which is the
      //     failure `passWithNoTests`'s removal above only half covers.
      //
      // So it takes the same ~80% tier as @gol/persistence: a real floor it clears with margin
      // (94.34% statements / 89.47% branches when this landed).
      //
      // ⚠️ AGGREGATE, and here that is MEASURED rather than preferred: `mockWorkspace.ts` sits at
      // 75% branches, so `perFile: true` at this tier would fail on the day it landed. The two core
      // packages take per-file precisely because it is free there; this one cannot.
      thresholds: {
        statements: 80,
        branches: 80,
        functions: 80,
        lines: 80,
      },
    },
  },
});
