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

## Local validation (no remote)

This repository is **local-only — there is no GitHub remote yet**, so the GitHub Actions
workflow in `.github/workflows/ci.yml` never runs on push. Quality is therefore enforced
by running the gate yourself:

- **`npm run ci`** runs the entire pipeline in the same order as `ci.yml`:
  `typecheck → lint → test:coverage → build:standalone → bundle:check → e2e`, stopping at the
  first failure. Run it before you consider a change done — the pre-commit hook does **not**
  cover the whole gate.
- **The husky pre-commit hook is the fast subset only** (`lint-staged`: ESLint + Prettier on
  changed files). It deliberately skips tests, e2e, and the bundle check so commits stay quick.
  Running the heavy stages is on you until CI exists.
- **Clean-room dry run (do this at epic boundaries).** A warm local tree hides "works on my
  machine" bugs — stale `node_modules`, uncommitted files, env drift — that a clean CI checkout
  would catch. Reproduce a clean checkout and run the gate:

  ```bash
  git archive --format=tar HEAD | (mkdir -p /tmp/gol-clean && tar -x -C /tmp/gol-clean)
  cd /tmp/gol-clean && npm ci && npm run ci
  ```

When a GitHub remote is added, `ci.yml` runs automatically on push/PR and becomes the enforced
gate; `npm run ci` stays the local mirror of it (keep the two in lockstep).
