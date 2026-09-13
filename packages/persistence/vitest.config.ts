import { defineConfig } from 'vitest/config';

// Each package owns its Vitest config (RFC-008 Decision 9). This one deviates from its siblings'
// `environment: 'node'`: the repositories under test call localStorage directly, which node does
// not provide. jsdom supplies a real Storage implementation AND enforces a quota, so the AR-14
// quota path can be exercised against a genuine DOMException rather than only a hand-stubbed one.
//
// This package never carried `passWithNoTests` — it has had a real suite since Story 1.4.
export default defineConfig({
  test: {
    environment: 'jsdom',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      // See the core packages' configs: without `include`, Vitest 4 reports only the files a test
      // actually loaded, so a threshold on top of it is a floor on the tested subset rather than on
      // the package (`coverage.all` is gone in Vitest 4; this pair replaced it).
      include: ['src/**/*.ts'],
      exclude: ['**/*.test.ts', '**/*.bench.ts'],
      // AR-39's ~80% tier, ENFORCED from Story 3.7 — deliberately lower than the core packages'
      // 90%, because this package's correctness is carried by round-trip tests rather than by unit
      // coverage of every branch.
      //
      // ⚠️ AGGREGATE, not `perFile` (story FD4) — the one place the two core packages and this one
      // deliberately differ. Measured on this tree, per-file would be free here too; it is not
      // taken because an 80% FLOOR PER FILE on the package AR-39 marks as the round-trip-carried
      // one tightens the gate past what AR-39 asks for, and the first legitimately hard-to-cover
      // persistence file would then block a story with nothing to do with it. The measured
      // per-file worst case is `localStorageAccess.ts` at 90.47% branches — a later story that
      // wants per-file here can take it knowing that number.
      thresholds: {
        statements: 80,
        branches: 80,
        functions: 80,
        lines: 80,
      },
    },
  },
});
