# Game of Life Studio

Client-only Next.js (App Router) + TypeScript (strict) app for designing and running
multi-organism cellular automata ("Battles"). Turborepo monorepo, statically exported,
$0 hosting. **There is no backend in the MVP.**

For architecture and the rules AI agents must follow, see [`CLAUDE.md`](./CLAUDE.md) and
[`docs/project-context.md`](./docs/project-context.md).

## Requirements

- Node **24** (`.nvmrc`; `engine-strict=true` fails the install on older Node)
- npm 11+ (workspaces)

```bash
npm install
```

## Common scripts

| Script                            | What it does                                               |
| --------------------------------- | ---------------------------------------------------------- |
| `npm run dev:standalone`          | Next dev server in standalone (static-export) mode         |
| `npm run build:standalone`        | Static export to `apps/web/out`                            |
| `npm run typecheck`               | `tsc --noEmit` across every workspace                      |
| `npm run lint` / `npm run format` | ESLint (flat config) / Prettier over the repo              |
| `npm test`                        | Vitest unit/component tests                                |
| `npm run test:coverage`           | Vitest with v8 coverage                                    |
| `npm run e2e`                     | Playwright e2e + axe (Chromium/Firefox/WebKit/tablet)      |
| `npm run bundle:check`            | Fails if the home route's first-load JS exceeds the budget |
| `npm run ci`                      | **The full quality gate — see below**                      |

## Quality gate & deployment

The GitHub Actions workflow in `.github/workflows/ci.yml` runs on every PR and on every push
to `main`:

- **`npm run ci`** is the local mirror of that pipeline — same stages, same order (the stage
  list lives in the header comment of `ci.yml`; keep the two in lockstep). Run it before opening
  a PR — the pre-commit hook does **not** cover the whole gate.
- **The husky pre-commit hook is the fast subset only** (`lint-staged`: ESLint + Prettier on
  changed files, then a project-wide `npm run typecheck`). It deliberately skips tests, e2e, and
  the bundle check so commits stay quick.
- **Deploy.** On `main`, once `quality` and `e2e` are both green, the `deploy` job publishes the
  static export to GitHub Pages at **<https://game-of-life-studio.com>**. A red run leaves the
  previous deployment live. The custom domain is bound by `apps/web/public/CNAME`, which the
  export copies into `out/` verbatim. Domain, DNS, Pages settings, rollback and troubleshooting
  live in [`docs/ops.md`](./docs/ops.md).
- **Clean-room dry run (do this at epic boundaries).** A warm local tree hides "works on my
  machine" bugs — stale `node_modules`, uncommitted files, env drift — that the CI checkout
  catches. Reproduce a clean checkout and run the gate:

  ```bash
  git archive --format=tar HEAD | (mkdir -p /tmp/gol-clean && tar -x -C /tmp/gol-clean)
  cd /tmp/gol-clean && npm ci && npm run ci
  ```
