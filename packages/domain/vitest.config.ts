import { defineConfig } from 'vitest/config';

// Each package owns its Vitest config (RFC-008 Decision 9). packages/* are pure
// TS — node environment, no DOM.
//
// ⚠️ NO `passWithNoTests` (removed in Story 3.7). Its comment used to read "No engine code exists
// yet", which stopped being true in Story 3.1. With it on, a mis-globbed `include` or a deleted
// suite is a GREEN run over zero tests — the failure a coverage gate cannot see, because there is
// nothing to be uncovered.
export default defineConfig({
  test: {
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      // ⚠️ `include` IS THE GATE (Story 3.7, measured). Vitest 4 reports only files LOADED during
      // the run unless this says otherwise, so without it a file no test imports is absent from the
      // report entirely and a 90% threshold is a floor on the tested subset rather than on the
      // package. Measured on this tree with a probe file: 100% (73/73) without it, 96.05% (73/76)
      // with it and the untested file listed at 0%. (`coverage.all` is gone in Vitest 4 — this pair
      // is the mechanism.)
      include: ['src/**/*.ts'],
      // Tests are the instrument, not the subject. `*.bench.ts` is excluded for a sharper reason:
      // `vitest run` does not execute it at all, so it would sit in the denominator at 0% forever
      // and turn the engine's threshold into a measure of how much benchmark code exists.
      exclude: ['**/*.test.ts', '**/*.bench.ts'],
      // AR-39 / NFR-5.1: the >=90% floor on the two core packages, ENFORCED from Story 3.7. The
      // four vitest.config.ts files stop being byte-identical here — they now carry different
      // thresholds, different environments and different `include` sets — which is why they stay
      // four files rather than becoming a shared base (story FD3, closing deferred-work.md's
      // "byte-identical with no shared base config" entry). Duplication that has become divergence
      // is not duplication.
      thresholds: {
        statements: 90,
        branches: 90,
        functions: 90,
        lines: 90,
        // ⚠️ PER FILE, not aggregate (story FD4). An aggregate threshold lets one 0%-covered file
        // hide behind a package sitting at 99% — MEASURED on this tree: a probe file no test
        // imports took @gol/domain to 96.05% and PASSED a 90% aggregate while contributing nothing.
        // Free today: with `include` on, both core packages are at 100% on every file, so this
        // costs nothing now and closes the hole the aggregate is only a proxy for.
        perFile: true,
        // ❌ NEVER `autoUpdate`. It rewrites this file with whatever the last run produced, which
        // turns a floor into a record of the last run rather than a threshold.
      },
    },
  },
});
