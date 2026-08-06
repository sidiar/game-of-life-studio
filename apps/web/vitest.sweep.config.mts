import { defineConfig } from 'vitest/config';

// Runs `scripts/paletteCvdSweep.test.ts` only — the reporting half of the Story 1.7 palette
// validation, kept out of `npm test` by vitest.config.mts's `scripts/**` exclude. It prints the
// worst-pair matrix that docs/implementation-artifacts/palette-cvd-validation.md records; the
// four hard gates live in lib/paletteCvd.test.ts and run with the normal suite.
//
// Separate config rather than a flag on the main one: the sweep needs no jsdom, no React plugin
// and no setup file, and keeping it out of the default `include` is what stops it from printing a
// table on every `npm test`.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['scripts/**/*.test.ts'],
  },
});
