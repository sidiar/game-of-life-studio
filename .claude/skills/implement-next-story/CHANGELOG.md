# Changelog

Dates are the dates the change landed in the source project; the skill was extracted
with its history on 2026-09-15.

## 1.1.0 — 2026-09-16

The working tree names the lane, and a tree can be held by one run at a time. After two
terminals in the primary checkout were told `--epic 3` and `--epic 4` while epic 4's
worktree sat idle beside them:

- `lane-gates.py resolve [--epic N]` — the lane this working tree serves, from
  `git worktree list`: a worktree named `lane-epic-N` is epic N's, a bare call inside it
  needs no flag, and the primary checkout refuses `--epic N` while that worktree exists.
  Step 0 runs it instead of reasoning about the board by eye.
- `lane-gates.py lock acquire | release | status` — one lock per working tree, in its git
  dir (`.git/` or `.git/worktrees/<name>/`), never tracked. Step 0 takes it, every exit
  releases it, and a second session in the same tree stops at Step 0 with the holder's
  session, epic, story and last activity. A holder silent for an hour is taken over.
- Step 2's re-check now also asks `lock status`.
- `fixtures/`-independent tests for both, on throwaway git repos with real worktrees.

## 1.0.0 — 2026-09-15

First standalone release. The skill as it ran thirty stories in its source project,
decoupled from that project:

- Paths and project-specific sync rules come from `implement-next-story.toml`
  (`[paths]`, `[[sync.rules]]`), read by `SKILL.md` and by `lane-gates.py`; no config is an
  error, not a guess.
- Script invocations resolve through `{skill_dir}` — `${CLAUDE_PLUGIN_ROOT}` as a plugin,
  `.claude/skills/implement-next-story` copied in.
- The human role is "the owner", defined once.
- `## Adapter surface` names every BMad and runtime seam.
- Plugin and marketplace manifests, `fixtures/`, `tests/`, `README.md`, `DESIGN.md`.

## Before extraction

- 2026-09-14 — `story-run-stats.py` reports *active* time with idle gaps excluded and
  listed, beside the raw wall clock.
- 2026-09-13 — one lane per working tree: the worktree recipe and the pre-Step-2 tree
  check, after two lanes launched in one checkout.
- 2026-09-13 — lanes (`--epic N`) and mechanical cross-epic gates: `lane-gates.yaml`,
  `lane-gates.py`, *Opening a lane*, Step S (sync with `main`), the merge-desk rules.
- 2026-09-09 — Opus-implemented stories are reviewed on Fable; the review model is a
  lookup from the dev model.
- 2026-08-26 — every phase is timed and token-counted from the runtime's transcripts
  (`story-run-stats.py`).
- 2026-08-26 — the review model is derived from the dev model, never the same one.
- 2026-08-26 — first version: Step 0 re-entry guard, create → dev → review in fresh
  subagents, the PR as the state machine, the commit gate moved to a merge gate.
