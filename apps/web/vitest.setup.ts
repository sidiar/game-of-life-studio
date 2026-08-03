// Extends Vitest's `expect` with jest-dom matchers (toBeInTheDocument, etc.) and
// registers React Testing Library cleanup. Loaded via test.setupFiles so every
// apps/web test file inherits both.
//
// vitest-axe's toHaveNoViolations matcher is intentionally NOT wired: its type
// augmentation targets the legacy `Vi` namespace that Vitest 4 no longer exposes,
// so tsc rejects it. Tests use vitest-axe's `axe()` runner and assert on
// `results.violations` directly instead — same coverage, no matcher-type conflict.
import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// This config does not enable Vitest globals, so RTL's automatic afterEach
// cleanup (which only self-registers when a global afterEach exists) never runs.
// Without this, renders accumulate across tests in the same file — e.g. two
// <main> landmarks, which trips axe. Register cleanup explicitly.
afterEach(() => {
  cleanup();
});
