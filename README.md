# Game of Life Studio

Client-only Next.js (App Router) + TypeScript (strict) app for designing and running
multi-organism cellular automata ("Battles"). Turborepo monorepo, statically exported,
$0 hosting. **There is no backend in the MVP.**

For architecture and the rules AI agents must follow, see [`CLAUDE.md`](./CLAUDE.md) and
[`docs/project-context.md`](./docs/project-context.md).

## How it was built

One person, Claude Code, and a spec-first process on [BMad Method](https://github.com/bmad-code-org/BMAD-METHOD) v6.
Everything the agents worked from is in the repo, in the order it was written:

1. **Plan** (May–July 2026) — [brief](./docs/planning-artifacts/briefs) → [PRD](./docs/planning-artifacts/prds)
   → [UX design](./docs/planning-artifacts/ux-designs) → eight [RFCs](./docs/planning-artifacts/rfcs)
   and [`architecture.md`](./docs/planning-artifacts/architecture.md) → an
   [adversarial cross-document review](./docs/planning-artifacts/review-adversarial-architecture-rfcs.md)
   of all of them → two implementation-readiness reports → [`epics.md`](./docs/planning-artifacts/epics.md):
   six epics, 96 stories, every one traceable to a PRD requirement.
2. **Deliver** (from 2026-07-16) — one story at a time: a _create_ agent writes the story file
   from the epic and the specs, a _dev_ agent implements it, a _review_ agent on a different
   model audits the diff against the acceptance criteria and patches what it can. Each story
   file under [`docs/implementation-artifacts/`](./docs/implementation-artifacts) carries the
   dev record, the review findings and — since 2026-08-26 — the run's time and token cost per
   phase, measured from the agents' own transcripts.
3. **The pipeline** — since 2026-08-26 the three agents are driven by
   [`implement-next-story`](https://github.com/sidiar/implement-next-story), a Claude Code skill
   written for this project and consumed here as a git subtree
   (`.claude/skills/implement-next-story`, configured by
   [`implement-next-story.toml`](./implement-next-story.toml)). It takes the next `backlog`
   story off [`sprint-status.yaml`](./docs/implementation-artifacts/sprint-status.yaml), runs
   create → implement → review in fresh subagents, opens the pull request and stops. It never
   merges. Two epics run as parallel lanes in git worktrees, with cross-epic dependencies as
   rows in [`lane-gates.yaml`](./docs/implementation-artifacts/lane-gates.yaml). 53 story PRs
   since then; the median story is 67 minutes from start to PR open (the skill's
   README has the full table, and its [`DESIGN.md`](https://github.com/sidiar/implement-next-story/blob/main/DESIGN.md)
   records which rules came from incidents on this repo).

What the human does: reads and merges the PRs, answers the `[Review][Decision]` items a review
leaves in the story file (a PR with one open stays a draft), approves gate rows, and keeps
[`deferred-work.md`](./docs/implementation-artifacts/deferred-work.md) — the running list of
what each story chose not to do — honest.

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
