# Deferred Work

Items surfaced during reviews that were consciously deferred rather than fixed at the time. Each entry names the story that should pick it up.

## Deferred from: code review of 1-1-turborepo-monorepo-scaffold (2026-07-16)

- ~~**`turbo run test` is vacuously green**~~ — **✅ Resolved in Story 1.2.** Vitest is installed; `test`/`test:coverage` are real per-workspace scripts (verified via `--dry=json` — no `<NONEXISTENT>`). Empty packages pass via `passWithNoTests`; `apps/web` has a wiring-proof test. `npm test` now executes a real runner.

- **`@gol/persistence` has no DOM lib** — `tsconfig.base.json` sets `"lib": ["ES2022"]` with no DOM, and `packages/persistence/tsconfig.json` extends it unchanged. The package's own placeholder comment says localStorage implementations land in Story 1.4, and the first line of real `localStorage` code will not typecheck. Deferred: Story 1.4 adds the DOM lib (or a narrower `lib` addition) alongside the code that needs it — adding it now would be scaffolding for unwritten code.

- ~~**`@gol/test-utils` is inside the app's bundle boundary**~~ — **✅ Resolved in Story 1.2.** A `no-restricted-imports` ESLint rule now forbids `apps/web` non-test code from importing `@gol/test-utils` (test/spec/e2e exempt). NOTE: this is a **separate import-boundary rule**, not AR-46 (which bans raw colour literals) — the original note conflated the two.
