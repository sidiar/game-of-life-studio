import { defineConfig } from 'vitest/config';

// Each package owns its Vitest config (RFC-008 Decision 9). packages/* are pure
// TS — node environment, no DOM.
export default defineConfig({
  test: {
    environment: 'node',
    // No engine code exists yet (schemas 1.3, engine Epic 3), so a package with
    // zero test files must stay green rather than error "no tests found".
    passWithNoTests: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      // The >=90% GATE on domain/simulation is deliberately NOT enforced here:
      // it flips on in Story 3.7 once there is engine code to cover. Turning it
      // on now (zero source) would make CI permanently red. Infra only.
    },
  },
});
