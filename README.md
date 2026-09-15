# implement-next-story

A [Claude Code](https://docs.claude.com/en/docs/claude-code) skill that takes the next
story off a [BMad Method](https://github.com/bmad-code-org/BMAD-METHOD) v6 sprint board and
turns it into a pull request: it spawns three fresh subagents in turn — *create the story*,
*implement it*, *review it on a different model* — and stops with the PR open for one human
to merge. It implements nothing itself; it orchestrates, reads artifacts off disk, and
refuses to guess. Two epics can run as parallel lanes with dependency gates between them,
and every run is timed and token-counted per phase.

BMad terms, for readers who don't use it: an *epic* is a group of *stories* (units of work
with acceptance criteria), and `sprint-status.yaml` is the board that lists each story's
status. A *lane* is this skill's word for one epic being worked by one session.

## What it did on a real project

Thirty stories of a Next.js/TypeScript app, 2026-08-26 → 2026-09-15, measured by the
skill itself from the runtime's own transcripts — not estimated. The numbers are in each
story file in the source project; this is the aggregate.

| | Median per story | Notes |
| --- | ---: | --- |
| Time, start → PR open | **67 min** | 22 uninterrupted runs, range 43–106 min |
| &nbsp;&nbsp;re-entry guard | 25 s | no agent; git and two scripts |
| &nbsp;&nbsp;create-story | 10 min | one Opus agent |
| &nbsp;&nbsp;dev-story | 26 min | one agent, Sonnet or Opus per story |
| &nbsp;&nbsp;code review + PR | 32 min | one agent plus the review's three parallel hunters |
| Output tokens | 180 k | 9 % of them the orchestrator's own |
| Cache-read tokens | 82.6 M | 97 % of the 85 M median total; priced at a fraction of the input rate |
| Subagents per run | 6 | create, dev, review, and the review's three hunters |

Thirteen stories were implemented on Sonnet and reviewed on Opus. Seventeen were
implemented on Opus — more than the design expects, because the middle epic was the
simulation engine — and reviewed on Fable for the ten stories after 2026-09-09, when that
pairing was introduced; the seven before it were reviewed on Sonnet, which is the weakness
the pairing fixed. Eight of the thirty runs paused mid-way — a usage-limit reset, a laptop
closed for the night, once for three days while the owner decided a spec conflict — which
is why the report distinguishes *active* time from wall clock: the two most recent paused
runs took 4 h 44 and 4 h 30 on the clock and 74 and 61 minutes of work.

## Five decisions that carry it

- **The PR is the state machine.** `main` is the source of truth for what is done; the set
  of open PRs is the source of truth for what awaits a human. A story branch's `done` is a
  proposal; it becomes fact when the PR merges. Nobody edits the status file by hand.
  ([why](DESIGN.md#the-pr-is-the-state-machine))
- **The re-entry guard fails closed.** Every run starts by asking, in order: is there an open
  PR for this lane, a dangling `story/*` branch, a half-written story file, an unanalysed
  epic pair, a gate not yet satisfied? Any yes stops the run and hands back. That is what
  makes it safe to fire on a loop — and the checks that matter most are re-run right before
  the irreversible step. ([why](DESIGN.md#the-re-entry-guard-fails-closed),
  [the incident](DESIGN.md#one-lane-per-working-tree))
- **Never the same model twice.** The reviewer is derived from the implementer by a lookup
  table, not chosen: Sonnet → Opus, Opus → Fable. The premise is that a model reviewing its
  own output tends to re-run the reasoning that produced the bug; the rule became a table
  after the split silently collapsed once. ([why](DESIGN.md#never-the-same-model-twice))
- **Gates are rows, not memory.** A cross-epic dependency exists only as a line in
  `lane-gates.yaml`, versioned on `main` and checked by a script. Rows are proposed by the
  agents that notice them, approved by the human, and ride the story's PR.
  ([why](DESIGN.md#gates-are-rows-not-memory), [the sync step](DESIGN.md#step-s--the-sync-that-has-never-conflicted))
- **Measured, not estimated.** Every phase reports the tokens the API's `usage` blocks
  recorded for every agent that started inside it, and active time with idle gaps listed so
  the figure is auditable against the wall clock.
  ([why](DESIGN.md#measured-not-estimated), [active vs wall clock](DESIGN.md#active-time-not-wall-clock))

[DESIGN.md](DESIGN.md) tells which of these came from an incident and which were designed
in anticipation and have not fired yet.

## Install

The repo root is the plugin, and `SKILL.md` at the root is its single skill, so it installs
three ways; pick one.

**Marketplace** — the repo is also its own one-plugin marketplace:

```
/plugin marketplace add sidiar/implement-next-story
/plugin install implement-next-story@implement-next-story
```

**Copy-in** — clone (or `git subtree add`, which is how the source project consumes it)
into `.claude/skills/implement-next-story/` in your project. The manifest makes Claude Code
load it as a project-scope plugin the next session, after the workspace trust prompt;
nothing else to install.

**Try it first** — `claude --plugin-dir path/to/implement-next-story` loads it for one
session.

**Configure:** copy `implement-next-story.example.toml` to `implement-next-story.toml` at
your project root and point `[paths]` at your BMad artifacts. Add a `[[sync.rules]]` entry
for each file whose merge conflicts can be resolved mechanically without a human; the
example carries the three from the source project.

**Run:** with BMad's `sprint-status.yaml` holding at least one `backlog` story, say

```
implement the next story
```

or `implement the next story --epic 4` to name the lane. It runs the guard, then
create → dev → review, opens the PR, prints the stats table, and stops. Say it again for
the next story, or put it on `/loop` (Claude Code's recurring-run mode) — the guard makes
repeated firing safe. To run a second epic in parallel, open a git worktree in a fresh
session and run the same phrase with the other `--epic`; SKILL.md's *Lanes* section has
the recipe.

It is built to run unattended, with permission prompts bypassed: it creates branches,
pushes them, and opens PRs without asking. It never merges, never pushes to `main`, and
never resolves a review finding that needs a human decision — those open the PR as a
draft.

`fixtures/` is a three-epic toy board you can point the scripts at without a real project:

```
python3 lane-gates.py --root fixtures list
python3 -m unittest
```

## What it depends on

- **BMad Method v6** (written against 6.8.0) — the three skills `bmad-create-story`,
  `bmad-dev-story`, `bmad-code-review`, and the `sprint-status.yaml` shape. The review
  sorts its findings into `patch` (fix without asking), `defer`, and `decision-needed`
  (needs the human), and offers a literal *"Apply every patch"* menu item; the skill
  always picks it, and a draft PR means `decision-needed` findings remain. The
  *Adapter surface* section of `SKILL.md` lists every seam.
- **Claude Code** (verified 2026-09) — subagents with a per-agent model choice, the
  recurring-run mode, git worktrees, and the session/subagent transcript layout under
  `~/.claude/projects/`, which `story-run-stats.py` reads to count tokens. That layout is
  undocumented and may change with any release.
- **GitHub and the `gh` CLI** — PRs, draft PRs, `gh pr checks --watch`. No GitLab support.
- **Python ≥ 3.11**, standard library only (`tomllib`, no PyYAML — both scripts carry
  strict readers for exactly the file shapes they accept).
- **Models** — Sonnet, Opus, and Fable (Anthropic's largest as of 2026-09, at roughly
  twice Opus's per-token price, which is why it reviews only the Opus-implemented
  stories). The names and the pairing are one table in Step 3 of `SKILL.md`.

## Not in v1

Listed so the omission reads as a decision: the three BMad seams are documented, not
pluggable; no GitLab; no config beyond the TOML. Making the seams pluggable is the
obvious v2 — everything else in the skill is framework-agnostic.

## Attribution

Built on and for [BMad Method](https://github.com/bmad-code-org/BMAD-METHOD) (MIT), whose
skill names and menu text it quotes. This repository is not part of BMad and is not
endorsed by it. Extracted, with history, from the project it was written for. MIT licence.
