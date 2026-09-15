# Changelog

Dates are the dates the change landed in the source project; the skill was extracted
with its history on 2026-09-15.

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
