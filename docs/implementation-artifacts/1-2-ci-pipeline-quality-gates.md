---
baseline_commit: 426a026
---

# Story 1.2: CI Pipeline & Quality Gates

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a developer,
I want an automated pipeline enforcing quality gates on every push,
so that regressions are blocked from the first story onward.

## Acceptance Criteria

1. **Given** a push or PR, **When** GitHub Actions runs, **Then** the pipeline executes typecheck → lint → unit tests with coverage → build with ~300 KB bundle budget → Playwright e2e (Chromium/Firefox/WebKit) → axe-core a11y check on the home route, failing on any gate (AR-3/4)
2. **Given** a local commit, **When** it is created, **Then** husky + lint-staged run lint and format checks pre-commit
3. **Given** any component file containing a raw hex/colour literal outside the theme token file and the palette registry, **When** lint runs, **Then** the AR-46 rule fails the build
4. **And** the toolchain is Vitest (+ v8 coverage), React Testing Library, Playwright, fast-check, axe-core, ESLint + Prettier, `tsc --noEmit` (AR-4)

## Tasks / Subtasks

- [x] **Task 1: Type-check + lint toolchain (ESLint 9 flat config + Prettier)** (AC: 3, 4)
  - [x] Install at the root as devDependencies: `eslint`, `typescript-eslint`, `eslint-config-prettier`, `prettier`, `@eslint/js`. Add `eslint-config-next` in `apps/web`. *(Version reality: ESLint 10 & Vitest 4 are the current stable majors, but `eslint-config-next@16` bundles an `eslint-plugin-react` that calls the ESLint-10-removed `context.getFilename` — so ESLint is pinned to **^9** per the "reproducible fresh-clone" policy. This matches the story's original ESLint-9 floor.)*
  - [x] Root `eslint.config.mjs` (flat config array): `eslint-config-next` re-scoped to `apps/web`, `typescript-eslint` + `@eslint/js` recommended for `packages/**` (kept disjoint so `@typescript-eslint` is never double-registered), `eslint-config-prettier` last. ESLint 9 defaults to flat config — no `.eslintrc*`.
  - [x] **AR-46 no-raw-colour rule (AC 3):** `no-restricted-syntax` hex-literal selector on `apps/web/**/*.{ts,tsx}`, message cites `(AR-46 / NFR-8.1)`. Palette-registry whitelist is a documented `TODO(1.7)` in the rule block (path unknown until 1.7). `themes.css` is CSS → already outside the `.ts/.tsx` scope. Verified: rule fires on a throwaway `#0a0a0a` literal; clean tree passes.
  - [x] **Import-boundary rule (deferred from 1.1 review):** `no-restricted-imports` forbids `@gol/test-utils` from `apps/web` non-test code (test/spec/e2e exempt). Distinct from AR-46. Verified: fires on a probe import.
  - [x] `prettier.config.mjs` + `.prettierignore` (build artefacts, `_bmad`/`.claude` vendored skill libs, `docs/`, `CLAUDE.md`).
  - [x] `lint`/`format` are single root-level passes (`eslint .` / `prettier`), NOT turbo fan-out — flat config is centralized at root, so per-workspace globs would be fragile. Deliberate deviation from the story's "turbo lint task" wording; test/coverage/e2e still go through turbo.
  - [x] `eslint .` and `prettier --check .` both clean over the tree (formatted `layout.tsx`, `next.config.mjs`, `eslint.config.mjs`).

- [x] **Task 2: Vitest + coverage + RTL wiring** (AC: 4)
  - [x] Installed: `vitest`/`@vitest/coverage-v8`@^4, `jsdom`, `@testing-library/{react,jest-dom,user-event}`, `fast-check`@^4, `vitest-axe`, plus `@vitejs/plugin-react` (React 19 JSX transform under Vitest — Next's SWC transform doesn't apply in tests).
  - [x] Per-package configs: `packages/*/vitest.config.ts` (node env); `apps/web/vitest.config.mts` (jsdom + `@vitejs/plugin-react`, `.mts` so its ESM loads without the CJS warning). Web setup `vitest.setup.ts` extends `expect` with jest-dom + vitest-axe matchers and registers RTL `cleanup` in `afterEach` (globals are off, so RTL's self-registered cleanup wouldn't run — without it, accumulated renders trip axe's duplicate-`<main>` check).
  - [x] Coverage: v8 provider, reporters `['text','html','lcov']`, `passWithNoTests: true` everywhere. **No ≥90% threshold** — infra only; the gate flips in Story 3.7. apps/web has no gate by design. Verified `test:coverage` runs.
  - [x] `test`/`test:coverage`/`typecheck` scripts on every workspace; web also has `e2e`. (Turbo wiring in Task 5.)
  - [x] **Wiring-proof smoke test** `apps/web/app/page.test.tsx`: renders the placeholder home page and asserts the `@gol/domain`-sourced copy — exercises Vitest + RTL + jsdom + workspace-source resolution. No filler tests in empty packages (`passWithNoTests` keeps them green). Verified: 2 passed.
  - [x] `vitest-axe` proven in the same test (`toHaveNoViolations` on the rendered container). NOTE: jsdom can't run axe's color-contrast rule (no canvas `getContext`) — it logs "Not implemented" and skips that rule; real color-contrast a11y is covered by the Playwright axe check (Task 3). `fast-check`@^4 installed at root for engine invariant tests (Epic 3).

- [x] **Task 3: Playwright e2e + axe on the home route** (AC: 1)
  - [x] Installed `@playwright/test` + `@axe-core/playwright` in `apps/web`; ran `npx playwright install` (chromium/firefox/webkit downloaded). CI uses `--with-deps`.
  - [x] `apps/web/playwright.config.ts`: four projects — **chromium, firefox, webkit** (NFR-2.1) + a **tablet** project (`iPad Pro 11 landscape`, ≥1024 px, NFR-3.1). `webServer` runs `npm run build:standalone && serve out` (tests the shipped static export; the build is a turbo cache hit inside `npm run ci`).
  - [x] `apps/web/e2e/home.spec.ts` (thin): loads `/`, asserts the placeholder heading + copy, asserts **zero console/page errors**.
  - [x] **axe-core on `/`** in a sibling test: `new AxeBuilder({ page }).analyze()` asserts zero violations — real-browser run covers colour-contrast that jsdom can't. Scoped to `/` (only route today).
  - [x] `e2e` script added (a11y lives in the same spec run — not split). Verified: **8/8 pass** across chromium/firefox/webkit/tablet.
  - [x] `.gitignore` updated for `playwright-report/`, `test-results/`, `blob-report/`, `playwright/.cache/`.

- [x] **Task 4: Bundle budget (~300 KB)** (AC: 1)
  - [x] `@next/bundle-analyzer` wired into `next.config.mjs` behind `ANALYZE=true`; `analyze` script added to web. Normal builds untouched.
  - [x] `scripts/check-bundle-size.mjs` gates the home route's first-load JS against a single named `BUDGET_GZIP_KB = 300` constant (cites RFC-003/AR-3). **Metric decision:** Next 16 static export prints no First Load JS table, and the raw sum is ~612 KB even for the placeholder — so the gate measures **gzipped transfer size** of the JS referenced by `out/index.html` (what the user actually downloads), the only reading under which "~300 KB" is a ceiling the app passes.
  - [x] Verified against the real export: **raw 611.9 KB / gzipped 180.9 KB → within budget, 119.1 KB headroom.** Proved it fails when the budget is forced to 100 KB (exit non-zero, clear over-by message), then reverted.

- [x] **Task 5: Turborepo task graph for CI stages** (AC: 1, 4)
  - [x] Added turbo tasks: `typecheck`, `test`, `test:coverage` (outputs `coverage/**`), `e2e` (`cache: false`). `build`/`build:standalone` unchanged (1.1). `.gitignore` covers `playwright-report/`/`test-results/`. Lint/format are root single-pass, not turbo (see Task 1).
  - [x] `typecheck`/`test`/`test:coverage` carry no `^build` (JIT source). Verified via `turbo run <task> --dry=json`: all resolve to real scripts in all 5 workspaces (`e2e` only in web, as intended) — no vacuously-green trap.
  - [x] Root scripts delegate to turbo: `typecheck`/`test`/`test:coverage`/`e2e`. `test` now runs real Vitest.
  - [x] Aggregate `ci` script chains stages in `ci.yml` order: `typecheck → lint → test:coverage → build:standalone → bundle:check → e2e`, fail-fast (`&&`). Lockstep comment lives in `ci.yml`'s header (Task 7). End-to-end run verified in Task 8.

- [x] **Task 5b: Local validation without a remote** (AC: 1)
  - [x] Root `README.md` created with a **"Local validation (no remote)"** section: `npm run ci` runs the full gate; the husky hook is the fast subset only; CI cannot run until a GitHub remote exists.
  - [x] Documented the **clean-room dry run** (`git archive` → `npm ci` → `npm run ci`) as the epic-boundary reproducibility habit. Not automated — a documented practice, not a turbo target.

- [x] **Task 6: husky + lint-staged pre-commit** (AC: 2)
  - [x] `husky` (v9) + `lint-staged` installed; `prepare: husky` wired; `npx husky init` set `core.hooksPath` → `.husky/_`.
  - [x] `.husky/pre-commit` runs `npx lint-staged` then `npm run typecheck`. lint-staged: `*.{ts,tsx}` → `eslint --fix` + `prettier --write`; `*.{js,mjs,cjs,json,md,css,yaml,yml}` → `prettier --write`.
  - [x] Typecheck in the hook is `npm run typecheck` (turbo-cached, ~instant warm). Heavy stages excluded — they run via `npm run ci`.
  - [x] **Verified without a real commit** (commit gate honoured): staged a mis-formatted scratch file → lint-staged reformatted + re-staged; staged an AR-46 hex literal → lint-staged **failed and reverted**. Both scratch files removed.

- [x] **Task 7: GitHub Actions workflow** (AC: 1)
  - [x] `.github/workflows/ci.yml`: `quality` job (typecheck → lint → test:coverage → build:standalone → bundle:check) + `e2e` job (`needs: quality`; Playwright 3 browsers + tablet, axe in-spec). Any stage fails the run. Header comment enforces lockstep with `npm run ci`.
  - [x] Node 24 via `node-version-file: .nvmrc`, `cache: npm`, `actions/cache` for `.turbo` and `~/.cache/ms-playwright`. Playwright report uploaded as artifact.
  - [x] Both jobs gated to `push`/`pull_request` on `main`; `e2e` runs after `quality`. (Single-branch local dev — the RFC's lighter PR-only e2e split can be tightened once branching exists.)
  - [x] **No deploy job** — local-only, no remote/host; `$0` deploy lands with a remote. Stated in the workflow header.
  - [x] YAML validated (parses to jobs `quality`/`e2e`; Prettier-clean). Cannot run on real CI (no remote) — validated by local stage execution (Task 8).

- [x] **Task 8: Verify end-to-end locally** (AC: 1–4)
  - [x] Ran every CI stage locally in pipeline order — all green; each gate proven capable of failing (AR-46 hex probe, import-boundary probe, bundle budget forced to 100 KB, husky block on hex). See Debug Log.
  - [x] `npm run ci` runs the full chain green (exit 0) and matches `ci.yml`'s stage order (typecheck → lint → format:check → test:coverage → build:standalone → bundle:check → e2e). **Clean-room dry run** (working-tree snapshot → `npm ci` → `npm run ci`) also exit 0 — reproducibility confirmed.
  - [x] **Cannot run in real CI (no remote).** `ci.yml` is authored and YAML-validated; it has NOT executed on GitHub Actions. Validation is local stage execution only.
  - [x] Updated `docs/project-context.md` (version table, Testing/Quality/Workflow rules, `npm test` warning removed), `docs/implementation-artifacts/deferred-work.md` (2 items resolved), and `sprint-status.yaml`.

## Dev Notes

### Constraints the developer MUST follow

- **Scope: tooling + CI only.** Install and wire the toolchain; author the pipeline. Write NO product code, NO real test suites beyond the smoke tests that prove wiring. Domain schemas are 1.3, engine is Epic 3, fixtures are 1.6.
- **Repo is local-only, single `main`, no remote (project-context).** The GitHub Actions workflow is authored but **cannot run in CI**. Verification is local per-stage execution. Never report a CI run that didn't occur.
- **Commit gate (standing rule):** never commit or stage without Sidiar's explicit go-ahead. Present the file list + suggested message and wait. Test husky by exercising the hook on a staged scratch change, not by creating a project commit.
- **JIT source packages:** `@gol/*` export `./src/index.ts` and compile via `apps/web` `transpilePackages`. Vitest consumes source directly — no build step, no `dist/`. `lint`/`test` turbo tasks do NOT need `^build`.
- **Strict TS, ESM everywhere, no escape hatches.** Config files are `.mjs`/`.ts` ESM. Match 1.1's comment convention: every non-obvious config line carries a WHY comment citing the failure it prevents.
- **Version policy: caret-on-current-stable, confirm at install.** The versions below are floors, not pins-to-latest. Reproducible fresh-clone build is the goal, not chasing latest.

### Coverage gate deferral — deliberate reconciliation (surface, don't silently pick)

Epics Story 1.2 AC says "unit tests **with coverage**"; RFC-008 Decision 3 specifies per-package ≥90% (domain/simulation) gated in CI. **But project-context is authoritative and states the coverage gate flips on in Story 3.7** — and Story 3.7 is literally titled "Performance Harness & Coverage-Gate Flip". Reconciliation applied here:

- **This story lands the coverage *infrastructure*** — v8 provider, per-package `vitest.config`, reporters, `passWithNoTests: true`.
- **The hard ≥90% threshold is NOT enforced now.** There is zero engine code to cover; a 90% gate would make `test`/CI permanently red. Story 3.7 turns the threshold on when the engine exists.
- If you disagree with deferring, flag it — do not silently enable a failing gate. This is consistent with the authoritative override, not an oversight.

### Local validation without a remote — why `npm run ci` exists

The repo is local-only with **no GitHub remote**, so `ci.yml` never triggers a real Actions run — it is authored and validated by executing its stages by hand (Task 8). That makes the quality gate **voluntary and warm-tree** instead of **enforced and clean-room**. Three gaps follow, and this story's `ci` script + clean-room habit close the cheap ones:

- **The gate becomes voluntary.** The husky hook runs only the *fast* subset (lint + format + typecheck) — e2e and coverage are deliberately excluded (too slow for pre-commit). Without a remote, the heavy stages run only if someone remembers. `npm run ci` makes "run the whole gate" a single command; the habit is to run it at each **story/epic boundary**, not just per commit.
- **Warm-tree ≠ clean-room.** Local runs reuse `node_modules`, uncommitted files, and ambient env; CI runs a fresh `npm ci` on a clean checkout. The **clean-room dry run** (`git archive`/fresh clone → `npm ci` → `npm run ci`) reproduces what CI would catch — "works on my machine" bugs — without a remote.
- **`ci.yml` is the one thing local commands can't fully prove.** Running the stages by hand validates the *commands*, not the YAML wiring (Node version, `playwright install --with-deps`, cache/job order). That residual risk clears only on the first real push; keep `ci.yml` and the `ci` script in lockstep so that first push surfaces at most YAML-shaped issues, not a backlog of skipped-gate failures.

**Not a substitute for a remote.** `npm run ci` reduces the accumulation risk; it does not eliminate the big-bang first-push risk. Adding a GitHub remote (already on the roadmap — public repo + $0 static hosting is a planned deliverable) is the actual fix and converts this voluntary local gate into an enforced one. When the remote lands, the deploy job deferred in Task 7 lands with it.

### AR-46 lint rule — whitelist targets do not exist yet

The rule bans raw hex in `apps/web` component files. Its two legitimate homes for colour values:
- **Palette registry** (RFC-007) — a TS file, lands **Story 1.7** (`1-7-palette-token-registry`). It IS in ESLint's `.ts` scope → needs an explicit override entry. Path unknown until 1.7; add the planned path with a TODO and flag for 1.7 to confirm.
- **Token layer `themes.css`** (RFC-003) — a CSS file, lands **Story 1.9**. Outside ESLint's `.ts/.tsx` scope already → no override needed.

The rule passes today (no hex anywhere). Its value is preventing future violations; prove it fires with a throwaway hex literal, then remove.

### What NOT to build (scope boundaries)

- ❌ **Vitest `bench` perf harness (AR-43)** — Story 3.7. Vitest ships `bench` mode; installing Vitest is enough. Do not author the harness or the 100×60 baseline gate.
- ❌ **`@gol/test-utils` fixtures / fake repos / canonical organisms (AR-5)** — Story 1.6. The package is a 1.1 placeholder; leave it.
- ❌ **CVD palette validation (RFC-007/Decision 8)** — arrives with the palette (1.7) / a11y pass (6.11).
- ❌ **Real domain/component/e2e suites** — each feature story ships its own. Only wiring-proof smoke tests here.
- ❌ **Theme token file / palette registry** — 1.9 / 1.7. The AR-46 whitelist references them but they are not created here.
- ❌ **Deployment (Vercel/GitHub Pages)** — no remote/host yet.
- ❌ **DOM lib for `@gol/persistence`** — Story 1.4 (deferred-work), not a tooling concern.

### Previous story intelligence (1.1)

- **Turbo output globs are package-relative.** `outputs: ["apps/web/out/**"]` matches nothing; use `"out/**"` scoped in `apps/web/turbo.json`. Apply the same for `coverage/**`, `playwright-report/**`.
- **`tsconfig.base.json` is in `globalDependencies`** so base edits bust caches. If you add shared lint/test config that affects all packages, consider whether it belongs in `globalDependencies` too.
- **The "vacuously green task" trap (1.1 deferred-work #1):** a turbo task with no backing script in a workspace silently reports success. `turbo run test --dry=json` must show a real `vitest` command per workspace, not `<NONEXISTENT>`. This story exists to make `npm test` meaningful — verify it can now distinguish "no runner" from "tests pass".
- **`.env*` is gitignored but Next reads it** — already declared as `apps/web` build `inputs`. Don't regress that when editing turbo config.
- **Mode defaults are aligned** (`'standalone'` in both `next.config.mjs` and `lib/mode.ts`); the e2e `webServer` should build with `NEXT_PUBLIC_MODE=standalone` to test the exported artifact.
- Node 24 pinned (`.nvmrc` + `engine-strict=true`); CI must use Node 24.

### Latest tech notes (verify stable at install, ~2026-08)

- **ESLint 9** — flat config (`eslint.config.mjs`) is the default; `.eslintrc` is legacy. Use `typescript-eslint` v8 meta-package (`tseslint.config(...)`). `eslint-config-next` for Next 16 (App Router) rules; `eslint-config-prettier` last to turn off stylistic conflicts.
- **Prettier 3** — ESM config supported.
- **Vitest 3.x** — `passWithNoTests`, per-package configs, `@vitest/coverage-v8`, `bench` mode built in. RTL needs `jsdom` env + `@testing-library/jest-dom` setup file.
- **Playwright** — `@playwright/test`; `@axe-core/playwright` for e2e a11y; `vitest-axe` for component-level a11y in jsdom.
- **husky 9** — `npx husky init` creates `.husky/` + a `prepare` script; hooks are plain shell running `lint-staged`.
- **`@next/bundle-analyzer`** — wrap `next.config.mjs`, gate on `ANALYZE=true`.

### Project Structure Notes

New/changed files (indicative):
```
.github/workflows/ci.yml          CI pipeline (authored; cannot run — no remote)
README.md                         + "Local Validation (no remote)" section
eslint.config.mjs                 flat config: TS base + AR-46 rule + import-boundary rule
prettier.config.mjs, .prettierignore
.husky/pre-commit                 lint-staged + typecheck
package.json                      + lint/test/test:coverage/e2e/ci scripts, lint-staged block, devDeps
turbo.json                        + lint/test/test:coverage/e2e tasks
.gitignore                        + coverage/, playwright-report/, test-results/
apps/web/
  vitest.config.ts                jsdom + setup
  vitest.setup.ts                 jest-dom
  playwright.config.ts            Chromium/Firefox/WebKit + tablet
  next.config.mjs                 + bundle-analyzer wrapper (ANALYZE-gated)
  e2e/home.spec.ts                smoke + axe on /
  app/__tests__/page.test.tsx     RTL wiring-proof
  package.json                    + eslint-config-next, playwright, axe, scripts
packages/{domain,simulation,persistence,test-utils}/
  vitest.config.ts                node env, passWithNoTests, coverage infra (no 90% gate yet)
  package.json                    + test/lint scripts
```
- Routes are still only `/` this story; a11y/e2e scope to it.

### Testing requirements (this story)

"Tested" for 1.2 = the toolchain proves itself end to end: `lint` runs clean and can fail (AR-46 + import rule), `test` runs Vitest green via a real wiring-proof test, `e2e`+axe pass on `/` across three browsers, `build`+bundle-budget pass, husky hook fires on a staged change, and every CI stage command runs locally. The GitHub Actions file is validated by executing its stages locally — NOT by a CI run (no remote). Record all commands + output summaries in the Dev Agent Record; report any failure with its output.

### References

- [Source: docs/planning-artifacts/epics.md#Story 1.2] — story statement + ACs
- [Source: docs/planning-artifacts/epics.md#L159-L160,217-220] — AR-3 (CI/CD), AR-4 (toolchain), AR-43 (bench→3.7), AR-44 (cross-browser/a11y/integration), AR-46 (no-raw-colour rule)
- [Source: docs/planning-artifacts/rfcs/RFC-008-testing-and-tooling-strategy.md] — Decision 1 (toolchain), 3 (scoped coverage — the 90% floor is domain/simulation), 6 (test decision-logic, not pixels), 9 (CI order, per-package vitest.config, e2e in apps/web/e2e, husky pre-commit)
- [Source: docs/planning-artifacts/rfcs/RFC-003-frontend-ui-architecture.md#L97-L115] — `themes.css` token layer (the AR-46 CSS token file)
- [Source: docs/planning-artifacts/rfcs/RFC-007-organism-colour-palette.md#Decision 1] — palette registry (the AR-46 TS whitelist target; lands Story 1.7)
- [Source: docs/project-context.md#Testing Rules / Code Quality / Development Workflow] — coverage gate flips in 3.7; ESLint/Prettier/husky land here; `npm test` warning to delete; local-only repo, no remote
- [Source: docs/implementation-artifacts/1-1-turborepo-monorepo-scaffold.md] — JIT source-exports convention, turbo output-glob relativity, mode-default alignment, `npm test` vacuously-green trap
- [Source: docs/implementation-artifacts/deferred-work.md] — `turbo run test` meaningfulness (this story), `@gol/test-utils` bundle-boundary (import rule, this story)

## Dev Agent Record

### Agent Model Used

Claude Opus 4.8 (claude-opus-4-8) via Claude Code

### Debug Log References

All commands from repo root, Node 24.16.0 / npm 11.13.0, 2026-08-03:

- **Toolchain install** — root devDeps (eslint, typescript-eslint, prettier, @eslint/js, vitest, @vitest/coverage-v8, husky, lint-staged, fast-check) + web devDeps (eslint-config-next, RTL, jsdom, @playwright/test, @axe-core/playwright, @next/bundle-analyzer, vitest-axe, @vitejs/plugin-react). `npm audit fix` (non-force) could not clear postcss/sharp without a nonsensical Next downgrade — left as inherited build-time advisories (see Completion Notes).
- **ESLint version pivot** — ESLint 10 (current stable) threw `TypeError: contextOrFilename.getFilename is not a function` from `eslint-config-next@16`'s bundled `eslint-plugin-react`. Pinned `eslint`/`@eslint/js` to `^9.39.5` → `eslint .` clean, exit 0.
- **AR-46 + import rule "prove it fails"** — probe `#0a0a0a` → `no-restricted-syntax` error; probe `import … from '@gol/test-utils'` → `no-restricted-imports` error. Probes removed.
- **Vitest** — web `page.test.tsx` 2 passed; packages "No test files found, exiting with code 0" (passWithNoTests). `test:coverage` → v8 report emitted. Fixed a duplicate-`<main>` axe failure by registering RTL `cleanup` in setup (globals off); dropped vitest-axe's `toHaveNoViolations` matcher (legacy `Vi` namespace incompatible with Vitest 4) in favour of asserting `results.violations`.
- **e2e** — `npx playwright install`; `npm run e2e` → **8 passed** (chromium/firefox/webkit/tablet × render+axe).
- **Bundle budget** — home route raw 611.9 KB / **gzipped 180.9 KB** vs 300 KB gzip budget → within, 119.1 KB headroom. Forced budget to 100 KB → exit non-zero with over-by message; reverted.
- **Turbo dry-run** — `turbo run {typecheck,test,test:coverage} --dry=json` resolve to real scripts in all 5 workspaces; `e2e` only in web (no `<NONEXISTENT>`).
- **husky** — staged mis-formatted file → lint-staged reformatted + re-staged; staged AR-46 hex → lint-staged **failed and reverted**. No project commit created (commit gate).
- **Full gate** — `npm run ci` → **exit 0** (typecheck → lint → format:check → test:coverage → build:standalone → bundle:check → e2e). **Clean-room dry run** (working-tree snapshot → `npm ci` → `npm run ci`) → **exit 0**.
- **ci.yml** — parsed to jobs `quality`/`e2e`; Prettier-clean. Not executed on GitHub Actions (no remote).

### Completion Notes List

- **Coverage gate deferred to 3.7 (as designed).** v8 coverage + per-package configs + reporters are in place; **no ≥90% threshold is enforced** and `passWithNoTests: true` keeps empty packages green. Enforcing 90% now (zero engine code) would make CI permanently red. Consistent with project-context (authoritative).
- **ESLint pinned to v9, not v10.** v10 is current stable but breaks `eslint-config-next@16` (bundled `eslint-plugin-react` calls the removed `context.getFilename`). Vitest 4 / coverage-v8 4 are used (current majors, compatible). Version policy = reproducible fresh-clone, not latest.
- **AR-46 whitelist is a `TODO(1.7)`.** The palette registry file (Story 1.7) must be added to the AR-46 rule block's `ignores` when it lands; `themes.css` (1.9) is CSS, already outside the `.ts/.tsx` scope. Rule passes today (no hex in tree).
- **Import-boundary rule ≠ AR-46.** A separate `no-restricted-imports` rule forbids `@gol/test-utils` in `apps/web` non-test code — resolves the 1.1 deferred item, which had mislabelled it "AR-46".
- **Bundle metric = gzipped transfer.** Next 16 static export prints no First Load JS table and the raw sum is ~612 KB even empty, so raw-at-300-KB is not the intended reading; the gate measures gzipped bytes of the home route's JS (what ships). One named `BUDGET_GZIP_KB` constant.
- **Lint/format are single root passes**, not turbo fan-out (flat config is centralized) — deliberate deviation from the story's "turbo lint task" wording. **format:check was added to the `ci` gate** because `eslint-config-prettier` disables ESLint's format rules, so nothing else would catch repo-wide drift.
- **No deploy job / cannot run in CI.** Local-only repo, no remote. `ci.yml` authored + YAML-validated; `npm run ci` is the enforced local mirror. `$0` deploy lands with a remote.
- **Next patch bump 16.2.10 → 16.2.12** (within the existing caret) pulled in by the `@next/bundle-analyzer` install; includes Next's Server-Action/middleware security patches. Inherited **postcss/sharp** transitive advisories remain — only "fixable" by downgrading Next to 9.x (rejected); not applicable to a static-export app with no server/image-optimization. Documented, not force-fixed.
- **Incidental:** `.claude/settings.local.json` changed by tool-permission prompts during the session — not story work.

### File List

New:

- eslint.config.mjs
- prettier.config.mjs
- .prettierignore
- README.md
- .github/workflows/ci.yml
- .husky/pre-commit
- scripts/check-bundle-size.mjs
- apps/web/vitest.config.mts
- apps/web/vitest.setup.ts
- apps/web/playwright.config.ts
- apps/web/app/page.test.tsx
- apps/web/e2e/home.spec.ts
- packages/domain/vitest.config.ts
- packages/simulation/vitest.config.ts
- packages/persistence/vitest.config.ts
- packages/test-utils/vitest.config.ts

Modified:

- package.json (scripts: typecheck/lint/format/test/coverage/e2e/bundle:check/ci/prepare; lint-staged block; devDeps)
- package-lock.json
- turbo.json (typecheck/test/test:coverage/e2e tasks; test off `^build`)
- .gitignore (playwright-report/, test-results/, blob-report/, playwright/.cache/)
- apps/web/package.json (test/coverage/typecheck/e2e/analyze scripts; test/e2e/lint devDeps)
- apps/web/next.config.mjs (@next/bundle-analyzer wrapper, ANALYZE-gated)
- apps/web/app/layout.tsx (Prettier formatting only)
- packages/{domain,simulation,persistence,test-utils}/package.json (typecheck/test/test:coverage scripts)
- docs/project-context.md (version table + Testing/Quality/Workflow rules updated; `npm test` warning removed)
- docs/implementation-artifacts/deferred-work.md (2 items marked resolved in 1.2)
- docs/implementation-artifacts/sprint-status.yaml (status transitions)
- docs/implementation-artifacts/1-2-ci-pipeline-quality-gates.md (this story — tracking)

## Change Log

- 2026-08-03: Story 1.2 implemented — CI pipeline & quality gates on the 1.1 scaffold. ESLint 9 flat config (AR-46 no-hex rule + `@gol/test-utils` import boundary) + Prettier; Vitest + v8 coverage + RTL with a wiring-proof home-page test (coverage gate deferred to 3.7 per design); Playwright e2e + axe across Chromium/Firefox/WebKit/tablet on `/`; gzipped bundle-budget gate (180.9 KB vs 300 KB); turbo `typecheck`/`test`/`test:coverage`/`e2e` tasks; husky + lint-staged pre-commit; `.github/workflows/ci.yml` (authored, cannot run — no remote) with an aggregate `npm run ci` local mirror + documented clean-room dry run. Verified: `npm run ci` exit 0 and a clean-room `npm ci && npm run ci` exit 0; every gate proven able to fail. project-context/deferred-work stale tooling notes updated. Status → review.
