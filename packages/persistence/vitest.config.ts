import { defineConfig } from 'vitest/config';

// Each package owns its Vitest config (RFC-008 Decision 9). This one deviates from its siblings'
// `environment: 'node'`: the repositories under test call localStorage directly, which node does
// not provide. jsdom supplies a real Storage implementation AND enforces a quota, so the AR-14
// quota path can be exercised against a genuine DOMException rather than only a hand-stubbed one.
export default defineConfig({
  test: {
    environment: 'jsdom',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      // The ~80% gate for this package (AR-39) is deliberately NOT enforced yet — it flips on
      // with the rest in Story 3.7. Infra only.
    },
  },
});
