# Deferred Work

Items surfaced during reviews that were consciously deferred rather than fixed at the time. Each entry names the story that should pick it up.

## Deferred from: code review of 1-1-turborepo-monorepo-scaffold (2026-07-16)

- **`turbo run test` is vacuously green** — `turbo.json` declares a `test` task but no workspace defines a `test` script (all five resolve to `<NONEXISTENT>` in `--dry=json`); a real run reports `Tasks: 4 successful` from the `^build` typechecks alone and exits 0. A CI gate wired to `npm test` cannot distinguish "no runner exists" from "tests pass". Deferred: Vitest lands in Story 1.2, which is the story that must make this gate meaningful.

- **`@gol/persistence` has no DOM lib** — `tsconfig.base.json` sets `"lib": ["ES2022"]` with no DOM, and `packages/persistence/tsconfig.json` extends it unchanged. The package's own placeholder comment says localStorage implementations land in Story 1.4, and the first line of real `localStorage` code will not typecheck. Deferred: Story 1.4 adds the DOM lib (or a narrower `lib` addition) alongside the code that needs it — adding it now would be scaffolding for unwritten code.

- **`@gol/test-utils` is inside the app's bundle boundary** — it is listed in `apps/web/next.config.mjs` `transpilePackages` alongside the three production packages and sits in web's `devDependencies`. Test fakes are one stray import away from compiling into the browser bundle, with nothing to stop it. Deferred: boundary enforcement is the AR-46 lint rule in Story 1.2; that rule is the right mechanism, rather than a hand-rolled guard here.
