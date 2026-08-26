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

---

## Step 0 — Re-entry guard (always run first)

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

## Step 3 — Review (Opus)

Spawn a fresh `model: "opus"` subagent to invoke `bmad-code-review` on the branch.
This must be a different model than Step 2 used whenever Step 2 ran on Sonnet —
that separation is the point of the split.

**Auto-apply patches.** At `bmad-code-review`'s step 5 prompt, always choose
**"Apply every patch"** — no per-finding confirmation. There is no human in this run to
answer it, and the `patch` bucket is defined as fixes that are unambiguous without one.

**Never auto-resolve `decision-needed` findings.** That bucket exists precisely because
the correct fix needs Sidiar's intent. Leave them unresolved and carry them to Step 4.

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

## Step 4 — Hand back to Sidiar

Report, briefly:

- story id and title, and its status on the branch (`done`, or unchanged if decisions
  are outstanding)
- the PR number and URL, and CI status
- which model implemented it
- the file list
- patches auto-applied, and any `decision-needed` findings awaiting Sidiar's call

Then **STOP**. Nothing "waits" — the run simply ends, and the open PR is where the
work sits until Sidiar merges it. The gate is the **merge**: nothing reaches `main`
without their explicit go-ahead, and approval of one story's merge does not carry
to the next.


---

## Subagent instructions — apply to all three spawns

- **Report terse.** The artifacts are on disk; the report is not the deliverable.
  Status, files touched, blockers. No implementation narratives — they would
  accumulate in this context across the epic and defeat the fresh-context design.
- **Commit only to `story/{story_key}`.** Never commit or push to `main`. Only Step 3
  opens the PR, and no agent ever merges one — merging is Sidiar's, always.
- **HALT conditions belong to the BMad skills.** If a subagent halts, surface the
  reason and stop the run. Do not work around it.
