---
name: implement-next-story
description: Implement exactly one story from sprint-status.yaml end to end — create-story, dev-story, code-review — each in a fresh subagent with its own model. Stops at review for approval; safe to re-run. Use when the user says "implement the next story".
---

# Implement Next Story

Orchestrates **one** story through BMad's three steps. Does not implement anything
itself — it spawns subagents and reads their artifacts off disk.

One invocation = one story, ending with a PR open for Sidiar to merge. Repetition is
the caller's job — normally just asking again.

**Paths:** sprint status is `docs/implementation-artifacts/sprint-status.yaml`.
Story files for the epic in progress sit flat beside it.

**Stats:** every step is timed and token-counted by `story-run-stats.py`, in this skill
directory. Call `mark` at each boundary as you go — a mark you skip is a phase you
cannot reconstruct afterwards — and `report` at the end. See *Run stats* below.

---

## Step 0 — Re-entry guard (always run first)

Mark the clock before anything else, so a run that stops at the guard is still measured:

```bash
python3 .claude/skills/implement-next-story/story-run-stats.py mark step0
```

Get to a clean, current `main` first — `git checkout main && git pull`. A dirty working
tree means Sidiar has work in progress: STOP, do not stash or clobber it.

Then, in order:

- **Any open `story/*` PR** → STOP. Report the PR and that it is waiting on Sidiar. Do
  **not** start another story: one open story PR at a time. If in a loop,
  `ScheduleWakeup` with `noop: true`. Query it as:

  ```bash
  gh pr list --state open --json number,url,isDraft,headRefName \
    --jq '[.[] | select(.headRefName | startswith("story/"))]'
  ```

  `--head` takes an exact branch name, not a prefix — `--head story/` matches nothing and
  would fail open, starting a second story on top of an unmerged one.
- **Any `story/*` branch without an open PR** → STOP: a previous run died partway, most
  likely on a usage limit. Report the branch, whether it has commits, and whether it is
  pushed. Recovery is Sidiar's call — delete the branch to redo the story, or push and
  open the PR by hand. Never resume into it and never delete it yourself.

  ```bash
  git branch -a --list '*story/*'
  ```

- **The first `backlog` story is not the lowest-numbered incomplete one** → STOP. A story
  sitting at `ready-for-dev` or `in-progress` with no branch means Step 1 died mid-write,
  leaving a partial story file. Report it; do not skip past it to the next `backlog`
  story, which is what a naive scan would do.
- **No `backlog` story left in the epic in progress** (reading `sprint-status.yaml` on
  `main`) → STOP. Report the epic is complete. If in a loop, `ScheduleWakeup` with
  `stop: true`.
- **Otherwise** → the first `backlog` story, top to bottom, is this run's target.

**Why the PR and not the status field:** `sprint-status.yaml` is versioned, so it says
different things on different refs. On a story branch, `done` means *implemented and
reviewed* — a proposal. On `main`, `done` means *merged*, because merging is the only
thing that writes it there. `main` is therefore the source of truth for epic state, and
the set of open PRs is the source of truth for "is something awaiting approval." Two
questions, two signals — don't try to answer one with the other.

A PR closed without merging is a rejected story: its `done` never reaches `main`, the
story stays `backlog` there, and the next run redoes it. That is correct, not a bug.

**Why the extra checks:** a run halted by a usage limit stops wherever it was, with no
wind-down. The open-PR check alone misses every state before the PR exists — a partial
story file, an unpushed commit, a pushed branch. Each of those would otherwise cause the
next run to silently skip a story or redo one. Assume any interruption is a limit hit
and leave the wreckage for Sidiar rather than guessing at recovery.

This guard is what makes the skill safe to fire repeatedly. Never skip it.

## Step 1 — Create the story (Opus)

```bash
python3 .claude/skills/implement-next-story/story-run-stats.py mark step1
```

Spawn a subagent: `model: "opus"`, `subagent_type: "general-purpose"`.
Do **not** use `fork` — it inherits context and ignores the model override.

Tell it to invoke `bmad-create-story` for the target story, and to end its story file
with one line naming the model the dev step should use:

```
Dev Model: sonnet   # one-line justification
```

Default `sonnet`. Choose `opus` only when the story is architecture-shaping — it
picks a pattern that later stories build on, rather than following one that exists.

## Step 2 — Implement (model from the story file)

```bash
python3 .claude/skills/implement-next-story/story-run-stats.py mark step2
```

Read the `Dev Model:` line from the story file just written. Spawn a subagent with
that model and tell it to:

1. **First**, create and switch to branch `story/{story_key}` off `main`. Do this
   *before* any implementation, so a mid-story failure leaves `main` clean.
2. Invoke `bmad-dev-story`. It runs to completion on its own and leaves the story at
   `review`. Let it — do not add your own checkpoints inside it.
3. Commit the work in one commit, message `feat: {story title} (story {id})`.
4. Push the branch to `origin`. **Never push to `main`.** The PR is Step 3's job.

The push is what gets CI to run before anyone reviews — so the reviewer reads real
lint/typecheck/test results rather than the dev agent's account of them.

## Step 3 — Review (the model Step 2 did *not* use)

```bash
python3 .claude/skills/implement-next-story/story-run-stats.py mark step3
```

Re-read the `Dev Model:` line from the story file and spawn a fresh subagent on the
**other** model — the complement, never a fixed choice:

| Step 2 ran on | Step 3 reviews on |
| --- | --- |
| `sonnet` | `opus` |
| `opus`   | `sonnet` |

Two models, never one. A model reviewing its own output re-runs the reasoning that
produced the bug and agrees with itself; the split exists to break that. Escalating dev
to Opus does **not** license an Opus review — it forces a Sonnet one. State in the spawn
prompt which model implemented the story and that this review is deliberately the other
one, so the reviewer knows it is the second pair of eyes.

Before spawning, assert the choice out loud: *"Step 2 ran on X, so Step 3 spawns Y."*
If X and Y are the same, you have mis-derived it — stop and recompute.

**Auto-apply patches.** At `bmad-code-review`'s step 5 prompt, always choose
**"Apply every patch"** — no per-finding confirmation. There is no human in this run to
answer it, and the `patch` bucket is defined as fixes that are unambiguous without one.

**Never auto-resolve `decision-needed` findings.** That bucket exists precisely because
the correct fix needs Sidiar's intent. Leave them unresolved and carry them to the hand-back in Step 5.

Tell it to check the CI run for the pushed branch (`gh run list --branch story/{story_key}`)
and treat a red run as a finding. If it fixes anything, that lands as its **own** commit
on the same branch, pushed — never amended into the dev commit. The two-commit shape
is the record of what was implemented versus what review changed.

In that same commit, set the story to `done` in `sprint-status.yaml` — **but only if no
`decision-needed` findings remain**. On the branch that reads as "implemented and
reviewed"; it becomes true of the project when the PR merges, which is the point —
Sidiar never hand-edits the status file. If decisions are outstanding the story is not
done, so leave the status alone.

Finally, open the PR with `gh pr create --base main --head story/{story_key}`
(never `--auto`). Add `--draft` **iff** `decision-needed` findings remain: a draft PR
means "Sidiar has calls to make before this can merge." Either way the PR opens, so the
Step 0 guard sees it and no new story starts.

Body follows the house shape — see PR #1:

- one paragraph: what the story adds and why it lands now
- **What's in it** — the two commits by SHA, each with its rationale
- **Verification** — CI result for the branch, plus the ACs it satisfies
- **Review** — patches applied, items deferred, and any `decision-needed` findings
  written out as explicit questions for Sidiar

Then **STOP**. Do not merge, do not enable auto-merge, do not approve your own PR.

## Step 4 — Record the run stats

The PR is open, so the run is over: stop the clock and write the numbers down.

```bash
python3 .claude/skills/implement-next-story/story-run-stats.py mark end
python3 .claude/skills/implement-next-story/story-run-stats.py report \
  --story-file docs/implementation-artifacts/{story_key}.md --write
```

That prints the table and appends it to the end of the story file under the line
*"This story was implemented with the 'Implement next story' skill with the following
stats:"*. Re-running replaces the previous block rather than stacking a second one, so a
re-run of Step 4 is safe.

Commit it on the story branch and push, so the PR carries it:

```bash
git add docs/implementation-artifacts/{story_key}.md
git commit -m "docs: record implement-next-story run stats (story {id})"
git push
```

This is a deliberate third commit. It does not blur the two-commit shape Step 3 protects —
that split is about *implementation vs. review*, and this commit touches no code. Leave the
PR body's two-commit list alone for the same reason: it describes the work, and this is
bookkeeping about the run.

Do this yourself. Do **not** spawn an agent for it: a fourth agent would add its own
tokens to the very numbers it is reporting.

## Step 5 — Hand back to Sidiar

Report, briefly:

- story id and title, and its status on the branch (`done`, or unchanged if decisions
  are outstanding)
- the PR number and URL, and CI status
- which model implemented it, and which reviewed it — name both, so a collapsed
  split is visible in the hand-back rather than only in the commit trailers
- the file list
- patches auto-applied, and any `decision-needed` findings awaiting Sidiar's call
- the stats table — paste it into the hand-back as printed, so the wall clock and token
  cost of the run are visible without opening the story file

Then **STOP**. Nothing "waits" — the run simply ends, and the open PR is where the
work sits until Sidiar merges it. The gate is the **merge**: nothing reaches `main`
without their explicit go-ahead, and approval of one story's merge does not carry
to the next.


---

## Run stats

`story-run-stats.py mark <label>` stamps a boundary; `report` turns consecutive
boundaries into phases. Labels, in order: `step0`, `step1`, `step2`, `step3`, `end`.
Marks are kept in `$TMPDIR/implement-next-story-$CLAUDE_CODE_SESSION_ID.json`.

Each phase gets: wall clock, the model(s) its agents ran on, and tokens split
input / output / cache-write / cache-read. Token counts are the `usage` blocks the
runtime already recorded per assistant message — measured, not estimated.

Three things worth knowing about what the numbers mean:

- **A phase's cost is its whole subtree.** The report attributes every subagent
  transcript that *started* inside a phase window, so `bmad-code-review`'s three
  hunters count against Step 3, not against nothing. This works only because the
  phases run strictly one after another — never overlap two spawns.
- **The orchestrator is counted too**, folded into whichever phase window its turns
  fall in, and broken out again in an *of which* row. That row is a subset, not an
  addition — do not sum it into the total when narrating the table.
- **Cache reads dominate and mean less than they look.** They are billed at a
  fraction of input rate. Read Input and Output for real effort; treat the grand total
  as a ceiling.

The script reads the subagent transcripts under
`~/.claude/projects/*/$CLAUDE_CODE_SESSION_ID/subagents/` and prints only the aggregate.
Never `cat`, `tail`, or `Read` those files yourself — they are full JSONL transcripts and
would blow out the context this skill exists to keep small.

**A run split across sessions loses its marks** (they are keyed to the session id), and
`report` then covers only the phases marked in the current session. That is a degraded
report, not a failure — say so in the hand-back rather than presenting partial numbers as
the whole run.

## Subagent instructions — apply to all three spawns

- **Report terse.** The artifacts are on disk; the report is not the deliverable.
  Status, files touched, blockers. No implementation narratives — they would
  accumulate in this context across the epic and defeat the fresh-context design.
- **Commit only to `story/{story_key}`.** Never commit or push to `main`. Only Step 3
  opens the PR, and no agent ever merges one — merging is Sidiar's, always.
- **HALT conditions belong to the BMad skills.** If a subagent halts, surface the
  reason and stop the run. Do not work around it.
