# Design notes — why each rule is there

`SKILL.md` states the rules; this file records where they came from, section by section
in the order the README lists them. Each is labelled: **incident** (something went wrong
and the rule is the fix), **observed** (the rule was designed up front and the runs since
bear it out), or **anticipated** (designed up front and never yet exercised). The source
project is a Next.js/TypeScript app; thirty stories went through the skill between
2026-08-26 and 2026-09-15.

## The PR is the state machine

*Designed, observed over thirty merges.* The first version of the skill replaced a *commit* gate with a *merge* gate. Until then the
project's rule was "nothing is committed without an explicit go-ahead", which is the right
rule for a human pair and the wrong one for a delegated agent: an agent that stops to ask
before every commit is not delegated. The first commit's message puts the resolution this
way:

> Sprint status is then maintained by the merge itself: the file is versioned, so `done`
> on a branch means "implemented and reviewed" while `done` on main means "merged". Nobody
> hand-edits it, and a PR closed unmerged correctly leaves the story as backlog to be
> redone.

Two questions, two signals. "What is done?" is answered by `main`. "What awaits a human?" is
answered by the set of open PRs. Reading the status file on a branch, or treating an open
PR as done, each gives a wrong answer to the other question, so the rule is stated as a
prohibition: don't. Thirty-eight merged PRs later, the status file has never been
hand-edited on `main`; the closed-unmerged case has not come up yet.

## The re-entry guard fails closed

*Anticipated, in part.* Step 0 was written for a failure mode that had not yet happened: a
usage-limit halt.

> It stops on a dirty tree, an open story PR, an orphaned `story/*` branch, or a
> status-order anomaly — the last two being the states a usage-limit halt leaves behind,
> which the open-PR check alone cannot see. It never self-recovers; interrupted runs are
> reported and left for [the owner].

Thirty runs later, the dangling-branch and partial-story-file checks have never tripped.
They stay because the cost of a false negative (silently redoing or skipping a story) is
much higher than the cost of the check. The open-PR check, by contrast, trips on most
runs — it is what turns "implement the next story" into a no-op while a PR waits.

One bug in that check was caught at design time rather than in production: `gh pr list
--head` takes an exact branch name, so `--head story/` matches nothing and would *fail
open*, letting a second story start on top of an unmerged one. The skill filters on a
prefix with `--jq` instead, and the note stays in `SKILL.md` so nobody simplifies it back.

What did interrupt runs was different. Story 3.7 halted on a benchmark budget it could
not meet without touching something the spec forbade; it raised the conflict, recommended
one resolution, and stopped. The resolution was the owner's to make, and the run's review
phase reads 65 h 45 m on the clock because it resumed three days later, once they had made
it. In story 3.11 the dev subagent hit a usage limit before its bookkeeping; after the
reset the same orchestrator session spawned a second one to verify the diff and close the
story, which is why the run kept its marks and its report shows the 3 h 30 m reset as an
excluded gap rather than as work. Neither produced wreckage — the HALT rule ("HALT
conditions belong to the BMad skills; surface the reason and stop") did its job — but
3.7's number is why *Active* exists (below).

## One lane per working tree

*Incident.* On 2026-09-13 the skill became lane-aware, and two lanes were launched
the same afternoon from the same checkout. Both passed Step 0 — the tree was clean each
time it was checked — and the first lane's `feat:` commit (story 3.8, PR #26) swept in the
second lane's status lines (`epic-4: in-progress`, `4-1: ready-for-dev`), which lane 4's
create-story had just written into the working tree they shared. The fix — PR #25, opened
before either story PR and merged after both — is the worktree recipe in *Lanes* and the
check right before Step 2 branches:

> Two lanes launched bare in the same checkout pass each other's Step 0 unnoticed — the
> tree is still clean when the second one checks — and the first lane's `feat:` commit
> then sweeps in the second lane's story-status lines. That happened today with 3-8 and
> 4-1.

The lesson generalises: a guard that runs once at the start is a guard against the state at
the start. Anything that must hold at the moment of an irreversible step (branching,
committing) is re-checked at that moment, cheaply, even though it "just passed".

## Never the same model twice

*Incident, then a second one.* Two commits, two weeks apart.

The first version hard-coded the reviewer as Opus and read the implementer from the story
file. The bug was obvious once seen and invisible until then:

> Step 3 hardcoded Opus, so an Opus-implemented story got an Opus review and the two-model
> split silently collapsed.

The fix derived the reviewer as the *complement* of the dev model — which created the second
problem. Stories are escalated to Opus precisely because they are architecture-shaping, the
ones later stories inherit a pattern from. The complement rule sent exactly those diffs to
Sonnet, the weakest available reviewer:

> The complement rule sent architecture-shaping stories — the ones escalated to Opus
> precisely because they set a pattern later stories inherit — to the weakest available
> reviewer. Route those to Fable instead.

Hence the table rather than a rule: `sonnet → opus`, `opus → fable`. Fable sits only on the
Opus row so it never touches the default path, and Step 3 makes the orchestrator say the
derivation out loud before spawning — *"Step 2 ran on X, so Step 3 spawns Y"* — because a
collapsed split is silent and a stated one is not. Ten stories have run Opus + Fable so far.

One impression rode along, from those ten runs rather than from a comparison: Fable seemed
to do worse under step-by-step prescription than Opus or Sonnet, so its review prompt is
deliberately shorter — the goal, the branch, the two hard rules, and the method left to it.

## Gates are rows, not memory

*Anticipated.* When the second epic opened, the two epics' dependencies were analysed once, by hand, and
written down as three rows in `lane-gates.yaml` with an `analysed` entry recording the pair
and the date. `lane-gates.py` reads the rows at every Step 0 and answers *open* or *gated*
with exit codes, so the orchestrator never reasons about a dependency table — it runs a
command. The alternative, remembering dependencies in the skill text or the session, was
rejected in one line: *if it is not a row, it is not a gate.*

No run has yet reached a gated story — the gated ones sit late in their epic — so the rows
have been read on every Step 0 since and have never said *gated* to a live run. And that
first analysis was committed directly to `main`, before the skill required a PR for it;
*Opening a lane* is the same event with the PR the rules now demand.

## Step S — the sync that has never conflicted

*Anticipated.* Five story PRs have been synced with `main` after the other lane merged first (#26, #33,
#35, #36, #37). All five were clean merges; the conflict rules have never been exercised.
The step exists anyway, because the repo has no branch protection and the failure it guards
against is structural: two PRs can each be green against the `main` they were cut from and
merge to a red `main`. The two mechanisms named in the skill — a gate that measures the
whole tree, and an identifier both branches minted sequentially — are the ones the source
project's CI actually has (a per-route bundle budget; a numbered register of spec
resolutions). They were identified by reading the gates, not by being burned. Two rules
ship with the skill; the project-specific ones live in `implement-next-story.toml` so the
skill stays honest about which resolutions are universal.

## Active time, not wall clock

*Incident.* The first stats table had one time column, mark-to-mark. Story 3.7's 65-hour review phase
made it useless as a measure of work, and the next two runs after the fix showed the
general case: 3.11 read 4 h 44 m on the clock and 74 minutes active; 4.4 read 4 h 30 m and
61 minutes.

> Wall clock between marks counted usage-limit resets and sleep as work. Active time drops
> any >15 min silence across session + subagent transcripts; excluded gaps are listed
> under the table.

The 15-minute threshold is empirical: the longest silence real work produced in thirty
runs (a CI poll, a long tool call) was about ten minutes; the shortest pause worth excluding
was thirty. The footnote lists every excluded gap so an Active figure is auditable against
its wall clock rather than trusted.

## Measured, not estimated

*Designed, observed.* Token counts are the `usage` blocks the API reported on every
assistant turn, summed
per phase over every subagent transcript that *started* inside the phase window. That
attribution rule is what lets `bmad-code-review`'s three parallel hunters count against
Step 3 instead of against nothing, and it works only because phases never overlap.

The orchestrator's own turns are counted too, and broken out: about 9 % of output tokens
across thirty runs. Keeping it there is a design constraint, not an accident — the
subagents report tersely, the orchestrator never reads a transcript (it reads the story
file's `Dev Model:` line and the printed stats table, nothing larger), and Step 4
(writing the stats) is done in-line because a fourth agent would add its tokens to the
number it was reporting. The skill's value is that its own context stays small across an
entire epic.
