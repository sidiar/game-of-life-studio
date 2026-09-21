# Game of Life Studio

[Conway's Game of Life](https://en.wikipedia.org/wiki/Conway%27s_Game_of_Life) with more
than one kind of life. Organisms with their own birth and survival rules share one grid and
compete; you set up the battle, press play, and watch who wins, who coexists and who goes
extinct.

**▶ Live at <https://game-of-life-studio.com>** — runs entirely in the browser; nothing to
install, nothing stored anywhere but your own browser.

![Four organisms competing on a 200×120 grid: a Patient Defender colony expands across the
centre while an Aggressive Colonizer holds the corner and a Chaotic Spreader scavenges its
edge](docs/media/battle.gif)

**Status (2026-09):** battle gallery, grid editor and Play mode are live; the custom-organism
editor (Epic 4 of 6) is in progress, sharing and theming are next.

## Why it's interesting

- **It's a multi-organism cellular automaton, not another Life clone.** Every organism carries
  its own ordered rule set — birth and survival conditions that can look at neighbour counts, at
  _which_ organism occupies a cell, and at how long a cell has been alive. Put three organisms
  on one grid and the questions the classic version can't ask become the whole point.
- **The engine holds 60 FPS in plain TypeScript, no worker, no WebGL.** The grid steps through
  double-buffered typed arrays (`Uint8Array` occupants, `Uint16Array` ages), rules are compiled
  to per-organism evaluators once per run, and the Canvas renderer repaints only after a step,
  batching cells by colour state so draw cost is bounded by the palette (≤ 160 fill groups), not
  by the number of organisms. A CI benchmark fails the build if the baseline frame goes over
  budget, and the engine packages compile without the DOM lib — both are enforced by tooling,
  not by convention.
- **It was built by a spec-driven agentic pipeline, and the whole trail is in the repo.** Brief
  → PRD → eight RFCs → adversarial review → 96 stories grouped in six epics, each story
  written, implemented and reviewed by separate Claude Code agents through a skill built for
  this project, with its time and token cost recorded. The next section is the tour.

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

What the human does, story by story: reads and merges the PRs, answers the `[Review][Decision]`
items a review leaves in the story file (a PR with one open stays a draft), approves gate rows,
and keeps [`deferred-work.md`](./docs/implementation-artifacts/deferred-work.md) — the running
list of what each story chose not to do — honest.

What the human does, epic by epic: a **refactor pass**. Once an epic is merged, a thorough read
of its code, then the architectural improvements the story agents don't propose on their own,
each one worked out in conversation with Claude Code and committed separately with the prefix
`HITL refactor:` (`git log --grep='HITL refactor'`, 11 so far). Among them:
[regrouping `lib/` and `components/` into feature folders along their dependency seams](https://github.com/sidiar/game-of-life-studio/commit/44972dc),
[replacing a hand-synchronised ref + state race guard with a pure reducer](https://github.com/sidiar/game-of-life-studio/commit/4c1951b),
[extracting `useBattleDraft` out of the battle page](https://github.com/sidiar/game-of-life-studio/commit/d94b4c9)
(and `useLeaveGuard`, `useDocumentTitle` before it), and
[a CI gate that fails the build when a spec ID cited in code no longer resolves](https://github.com/sidiar/game-of-life-studio/commit/34eae20)
— the `spec:check` in the scripts table below.

## Run it locally

- Node **24** (`.nvmrc`; `engine-strict=true` fails the install on older Node)
- npm 11+ (workspaces)

```bash
npm install
npm run dev:standalone   # http://localhost:3000
```

| Script                            | What it does                                                                  |
| --------------------------------- | ----------------------------------------------------------------------------- |
| `npm run dev:standalone`          | Next dev server in standalone (static-export) mode                            |
| `npm run build:standalone`        | Static export to `apps/web/out`                                               |
| `npm run typecheck`               | `tsc --noEmit` across every workspace                                         |
| `npm run lint` / `npm run format` | ESLint (flat config) / Prettier over the repo                                 |
| `npm test`                        | Vitest unit/component tests                                                   |
| `npm run test:coverage`           | Vitest with v8 coverage                                                       |
| `npm run e2e`                     | Playwright e2e + axe (Chromium/Firefox/WebKit/tablet)                         |
| `npm run e2e:chromium`            | The same suite, Chromium only                                                 |
| `npm run bench` / `bench:check`   | Engine benchmark at the 100×60 × 20-organism baseline / fail over budget      |
| `npm run bundle:check`            | Fails if a route's first-load JS exceeds its gzipped budget                   |
| `npm run spec:check`              | Fails if a spec ID cited in code (`RFC-004 §3.5`, `AR-2`…) no longer resolves |
| `npm run boundary:check`          | Proves the engine-boundary ESLint rule still fires on every escape shape      |
| `npm run ci` / `npm run ci:dev`   | **The full quality gate — see below** / same, e2e on Chromium only            |

## Quality gate & deployment

The GitHub Actions workflow in `.github/workflows/ci.yml` runs on every PR and on every push
to `main`:

- **`npm run ci`** is the local mirror of that pipeline — same stages, same order (the stage
  list lives in the header comment of `ci.yml`; keep the two in lockstep). Run it before opening
  a PR — the pre-commit hook does **not** cover the whole gate. `npm run ci:dev` is the
  everyday variant: identical, except e2e runs on Chromium only.
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

## Where the docs live

| Path                                                                                   | What it is                                                                                                                     |
| -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| [`docs/planning-artifacts/architecture.md`](./docs/planning-artifacts/architecture.md) | The umbrella. Its Cross-Cutting Decisions (A–K) are authoritative for anything spanning areas                                  |
| [`docs/planning-artifacts/rfcs/`](./docs/planning-artifacts/rfcs)                      | Eight RFCs, one per area: modes, rendering, UI, rules engine, state & undo, persistence, colour, testing                       |
| [`docs/planning-artifacts/`](./docs/planning-artifacts)                                | Brief, PRD, UX design, the adversarial review, readiness reports and [`epics.md`](./docs/planning-artifacts/epics.md)          |
| [`docs/project-context.md`](./docs/project-context.md) · [`CLAUDE.md`](./CLAUDE.md)    | The rules AI agents (and humans) must follow when writing code here — the non-obvious ones                                     |
| [`docs/implementation-artifacts/`](./docs/implementation-artifacts)                    | Story files with their dev and review records, `sprint-status.yaml`, `deferred-work.md`, `lane-gates.yaml`, validation reports |
| [`docs/ops.md`](./docs/ops.md)                                                         | Domain, DNS, GitHub Pages, rollback                                                                                            |
