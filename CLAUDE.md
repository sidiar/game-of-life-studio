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
  (A–J) and Minor Resolutions (M1–M10) are authoritative** for anything spanning areas.
- `docs/planning-artifacts/rfcs/RFC-00*.md` — each owns one area in depth. Within one area
  the RFC wins; for a cross-cutting concern the Architecture Decision wins.
- Where `docs/project-context.md` and an RFC disagree, the context file flags a deliberate
  override (some RFC snippets are stale). Surface any *new* conflict — don't silently pick one.

## Working state

- `docs/implementation-artifacts/sprint-status.yaml` — story tracker and current phase.
- Per-story files (`1-1-*.md`, …) carry a Dev Agent Record each. **Completed epics are
  archived into `epic-N/`; the epic in progress stays flat beside `sprint-status.yaml`.**
  That split is not cosmetic — the BMad skills glob story files *non-recursively* off
  `implementation_artifacts` (create-story writes `{implementation_artifacts}/{story_key}.md`
  and reads `{epic}-{prev}-*.md`; retrospective reads `{epic}-{n}-*.md`; dev-story
  scans `*-*-*.md`). Move an epic's stories down only once it is done, or those lookups
  silently find nothing. Cross-epic artifacts (`deferred-work.md`, the validation docs)
  stay at the root.

## Workflow

- BMad skills (`/bmad-dev-story`, `/bmad-create-story`, the agent personas) auto-load
  `docs/project-context.md` on activation — you don't need to restate project facts to them.
- **Never commit or stage without Sidiar's explicit go-ahead:** present the file list and a
  suggested message, then wait. Approval for one commit does not carry to the next.
