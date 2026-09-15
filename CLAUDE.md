# Game of Life Studio

Client-only Next.js (App Router) + TypeScript (strict) app for designing and running
multi-organism cellular automata ("Battles"). Turborepo monorepo, statically exported,
$0 hosting. **There is no backend in the MVP.**

## Before writing any code

Read **`docs/project-context.md`** — it carries the non-obvious rules that code
otherwise violates while still compiling and passing tests. The load-bearing ones:

- **Repositories are injected, never imported** — the dual-mode seam depends on it.
- **No DOM types in `packages/*`** — only `apps/web` has the `dom` lib (engine purity).
- **Hot simulation state lives in refs, never React state** — the 60 FPS budget.
- **One immutable MUI theme** + `--gol-*` CSS variables; the Canvas grid is outside MUI.
- **Grid dimensions are parameters, never constants**; rules persist library **ids**, not refs.

## Where the specs live

- `docs/planning-artifacts/architecture.md` — the umbrella. Its **Cross-Cutting Decisions
  (A–K) and Minor Resolutions (M1–M15) are authoritative** for anything spanning areas.
- `docs/planning-artifacts/rfcs/RFC-00*.md` — each owns one area in depth. Within one area
  the RFC wins; for a cross-cutting concern the Architecture Decision wins.
- Where `docs/project-context.md` and an RFC disagree, the context file flags a deliberate
  override (some RFC snippets are stale). Surface any *new* conflict — don't silently pick one.

## Working state

- `docs/implementation-artifacts/sprint-status.yaml` — story tracker and current phase.
- Per-story files (`1-1-*.md`, …) carry a Dev Agent Record each. **Completed epics are
  archived into `epic-N/`; every epic in progress stays flat beside `sprint-status.yaml`.**
  Two epics can be in progress at once — `implement-next-story` runs them as parallel
  lanes (`--epic N`, one per working tree); each is archived on its own completion.
  That split is not cosmetic — the BMad skills glob story files *non-recursively* off
  `implementation_artifacts` (create-story writes `{implementation_artifacts}/{story_key}.md`
  and reads `{epic}-{prev}-*.md`; retrospective reads `{epic}-{n}-*.md`; dev-story
  scans `*-*-*.md`). Move an epic's stories down only once it is done, or those lookups
  silently find nothing. Cross-epic artifacts (`deferred-work.md`, `lane-gates.yaml`, the
  validation docs) stay at the root.

## Workflow

- BMad skills (`/bmad-dev-story`, `/bmad-create-story`, the agent personas) auto-load
  `docs/project-context.md` on activation — you don't need to restate project facts to them.
- `.claude/skills/implement-next-story/` is a **git subtree of
  [sidiar/implement-next-story](https://github.com/sidiar/implement-next-story)**, configured by
  `implement-next-story.toml` at the repo root. Fix the skill upstream (or `git subtree push`);
  `git subtree pull --prefix=.claude/skills/implement-next-story <url> main` brings it back.
- **Nothing reaches `main` without Sidiar's explicit go-ahead.** In direct work, present the
  file list and a suggested message, then wait. Story subagents running under
  `implement-next-story` may commit and push to their own `story/*` branch without asking —
  merging that branch is always Sidiar's call. Approval for one merge does not carry to the next.
  With two lanes open, merge one PR at a time and let the other lane sync (its next run does
  it) and go green before merging it — the repo has no branch protection to enforce that.
