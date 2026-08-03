# Deferred Work

Items surfaced during reviews that were consciously deferred rather than fixed at the time. Each entry names the story that should pick it up.

## Deferred from: code review of 1-1-turborepo-monorepo-scaffold (2026-07-16)

- ~~**`turbo run test` is vacuously green**~~ — **✅ Resolved in Story 1.2.** Vitest is installed; `test`/`test:coverage` are real per-workspace scripts (verified via `--dry=json` — no `<NONEXISTENT>`). Empty packages pass via `passWithNoTests`; `apps/web` has a wiring-proof test. `npm test` now executes a real runner.

- **`@gol/persistence` has no DOM lib** — `tsconfig.base.json` sets `"lib": ["ES2022"]` with no DOM, and `packages/persistence/tsconfig.json` extends it unchanged. The package's own placeholder comment says localStorage implementations land in Story 1.4, and the first line of real `localStorage` code will not typecheck. Deferred: Story 1.4 adds the DOM lib (or a narrower `lib` addition) alongside the code that needs it — adding it now would be scaffolding for unwritten code.

- ~~**`@gol/test-utils` is inside the app's bundle boundary**~~ — **✅ Resolved in Story 1.2.** A `no-restricted-imports` ESLint rule now forbids `apps/web` non-test code from importing `@gol/test-utils` (test/spec/e2e exempt). NOTE: this is a **separate import-boundary rule**, not AR-46 (which bans raw colour literals) — the original note conflated the two.

## Deferred from: code review of 1-2-ci-pipeline-quality-gates (2026-08-03)

- **`nextScopedToWeb` blanket-rewrites `files` globs in `eslint.config.mjs`** — re-scopes every `eslint-config-next` sub-config that has a `files` glob to `apps/web/**/*.{js,jsx,mjs,ts,tsx}` uniformly, which could clobber narrower intentional scoping if Next's flat-config array shape changes. Currently verified working (`eslint .` clean, exit 0). Revisit only if `eslint-config-next` changes shape or lint starts misbehaving.
- **Bundle-budget gate's gzip assumption and regex-scrape approach** — `scripts/check-bundle-size.mjs` measures gzipped transfer size, but most real static hosts (Vercel/Netlify/Cloudflare Pages) negotiate Brotli, not gzip, so the gate may not reflect real transfer bytes on the eventual host. It also finds assets via a regex scrape of `index.html` rather than walking Next's build manifest. Revisit once an actual $0 static host is chosen (deploy story).
- **No hash/timestamp ties `bundle:check`'s checked bundle to the current commit** — a stale `out/` from a previous run could theoretically be checked instead of a fresh one if `build:standalone` is skipped or fails silently upstream. Speculative for the current single-job-chain local pipeline; revisit if CI staging changes.
- **`packages/{domain,simulation,persistence,test-utils}/vitest.config.ts` are byte-identical with no shared base config** — any future coverage-config change (e.g. the Story 3.7 gate flip) needs editing in four places with no mechanism to keep them in sync. Matches this repo's established per-package-owns-its-config convention, so not a defect — a shared base is a nice-to-have DRY improvement, best considered alongside the Story 3.7 coverage-gate work.
- **GitHub Actions pinned by major-version tag (`@v4`), not commit SHA** — standard supply-chain hardening step, skipped here. Low priority for a single-maintainer repo with no remote/external contributors yet; revisit once the repo has a remote and other contributors.
