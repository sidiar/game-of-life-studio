# Adapter contract — what `implement-next-story` needs from a method

An **adapter** is the method-specific part of a story run: how a story gets written, how
it gets implemented, how it gets reviewed. The skill ships with `bmad` (BMad Method v6)
and expects you to be able to write another in an afternoon. This file is the whole
agreement. If it is not written here, the orchestrator does not depend on it.

Written 2026-09-17 against `SKILL.md` 1.1.1. Every obligation below is derived from a
line the orchestrator actually reads or a check it actually runs — nothing is
anticipated.

---

## 1. What an adapter is, and is not

The orchestrator (`SKILL.md`) owns the **run**: the re-entry guard, lanes and locks,
branches and PRs, dependency gates, the merge-desk sync, the run stats, and the hand-back.
It never writes a story, never implements one, never reviews one. For those three it
spawns a subagent per phase and reads the artifacts off disk afterwards.

An adapter supplies **the text of those three spawn prompts** — nothing else.

| The adapter supplies | The adapter never touches |
| --- | --- |
| `## Create` — how to write `{stories_dir}/{story_key}.md` and mark it ready | branches, commits, pushes, PRs (the orchestrator's, always) |
| `## Implement` — how to implement the story to completion | the lock, the lane, the run stats |
| `## Review` — how to review the diff, triage, patch, and settle the status | `{gates_file}` — it may *propose* a row; only the owner writes one |
| `## Requires` — what has to be installed for the prompts to work | another epic's stories, files, or board rows |
| `## Notes` — anything the owner must know to live with it | |

Two things are deliberately **not** pluggable, and the reasons are in `DESIGN.md`:

- **The board format** (`{status_file}`, §3). `done` on `main` means merged, and the
  merge-desk rules depend on the board being a versioned file with one line per story.
  BMad writes this file natively; a method that keeps its board elsewhere has to mirror
  it here.
- **The triage vocabulary** (`patch` / `defer` / `decision-needed`, §6). The draft-PR
  rule, the `done` check, and the hand-back are all written in these three words. An
  adapter maps its tool's vocabulary onto them; it does not bring its own.

---

## 2. Configuration and the adapter file

### `[adapter]` in `implement-next-story.toml`

```toml
[adapter]
name = "bmad"               # ships with the skill: adapters/<name>/adapter.md
# dir = "docs/my-adapter"   # or project-local: <dir>/adapter.md, relative to the repo root
```

Exactly one of `name` / `dir`. Missing table, both keys, neither key, or a file that is
not there → the orchestrator STOPs before Step 0 and says which, like a missing `[paths]`
key. No default: the adapter decides what "implement" means, and that is not a thing to
guess.

The orchestrator reads `adapter.md` **once**, at Step 0 beside the TOML, and holds it
for the run. Keep it around 60 lines — it rides in the orchestrator's context on every
run, and the prompts are handed to subagents verbatim.

### `adapter.md` — five H2 sections, fixed names, this order

```markdown
## Requires
## Create
## Implement
## Review
## Notes
```

`Create`, `Implement` and `Review` are **spawn-prompt text**: the orchestrator prefixes
its own *Subagent instructions* (report terse; name the story; commit only to the story
branch; halts surface, never worked around), appends the section, substitutes the
placeholders, and spawns. Write them as instructions to an agent that has never seen
your method's documentation. Terse beats thorough; the subagent can read your tool's
own files if you name them.

Placeholders the orchestrator substitutes — use them rather than paths of your own:

| Placeholder | Value |
| --- | --- |
| `{story_key}` | the target story's key, e.g. `4-9-color-reuse-warning` |
| `{story_file}` | `{stories_dir}/{story_key}.md`, relative to the repo root |
| `{status_file}`, `{stories_dir}`, `{epics_file}`, `{gates_file}` | the `[paths]` keys, as in `SKILL.md` |
| `{E}` | this lane's epic number |
| `{skill_dir}` | where the skill's scripts live |

Anything else in `{…}` is passed through untouched, so a method that has its own
placeholder syntax does not collide.

`## Requires` and `## Notes` are for the owner, not for a subagent — see §8 and §9.

---

## 3. The board — `{status_file}`

The skill claims this format as its own. BMad Method v6 writes it natively; any other
adapter must produce the same shape, because `lane-gates.py` parses it with a strict
parser and `SKILL.md` Step 0 reads it on `main` for every decision it makes.

```yaml
last_updated: 2026-09-17          # a top-level date; free-form, never read by the skill

development_status:
  epic-4: in-progress             # one row per epic
  4-1-board-grid: done            # one row per story, listed in order
  4-2-cell-toggle: review
  4-3-step-button: backlog
```

- One `development_status:` mapping. Story keys match `^(\d+)-(\d+)-[a-z0-9-]+$` —
  epic, story number, slug — and are listed in the order they are to be done. Epic rows
  are `epic-N`. Comments (`# …`) and blank lines are fine; nested mappings are not.
- **Story statuses**, in order: `backlog → ready-for-dev → in-progress → review → done`.
- **Epic statuses**: `backlog → in-progress → done`. `epic-N: done` is written by the
  owner's close-out, never by an adapter or the skill.
- The board is **versioned**. On a story branch, `done` is a proposal ("implemented and
  reviewed"); on `main`, it is a fact ("merged"), because merging is the only thing that
  writes it there. Step 0 reads `main`, never the branch.

### Who may write which transition

| Phase | May write |
| --- | --- |
| **Create** | story `backlog → ready-for-dev`; and `epic-N: backlog → in-progress` on the epic's first story |
| **Implement** | story `ready-for-dev → in-progress → review` |
| **Review** | story `review → done` (nothing left open), or `review → in-progress` (`decision-needed` findings left in the story file as action items) |
| **Orchestrator** | **no story status, ever.** After Review it *checks* that `done` ⇔ no `decision-needed` findings and STOPs on a mismatch rather than editing. It writes gate rows to `{gates_file}` only when the owner has approved them (Step 5). |

The adapter's tool owns its transitions, the orchestrator verifies them. This is the
pattern, not a BMad accident: the review tool is the one that knows whether it left
anything open, so it is the one that writes the status. The orchestrator gets two
signals it can cross-check (the status line and the findings) instead of one it must
trust. If your review tool cannot write the board, your `## Review` prompt must tell the
subagent to — after the findings, in the same commit, by the rule in the table.

### The resume path — required of every adapter

A story that leaves Review at `in-progress` gets a **draft PR** (§6). The skill never
resumes a draft: the next run sees the open PR and stops. So the adapter must state, in
`## Notes`, what **the owner** does once they have answered the decision items in the
story file, so that the story reaches `done` **on the branch** before they undraft and
merge. For BMad: run dev-story and then code-review on the story file, on the branch.
A resume path that ends with the owner hand-editing the status line is not acceptable —
the owner never edits the board.

---

## 4. The story file — `{stories_dir}/{story_key}.md`

One Markdown file per story, flat in `{stories_dir}` (no subfolders — see §9 for why),
created by Create, read by Implement and Review. The skill reads three things from it
and appends one:

| Line / block | Written by | Read by |
| --- | --- | --- |
| `Dev Model: sonnet   # one-line justification` — last lines of the file | Create (the orchestrator's instruction, added to your prompt) | Step 2 (which model implements), Step 3 (which model reviews) |
| `Proposed lane gate: …` or `Proposed lane gate: none` — same place | Create, likewise | Step 5, carried to the owner |
| Its `## Review` / findings section, with `decision-needed` items identifiable | Review | Step 3's `done` check, Step 5's hand-back |
| The run-stats block after the marker line *"This story was implemented with the 'Implement next story' skill with the following stats:"* | Step 4 (`story-run-stats.py`) | nobody; re-runs replace it |

So the format is otherwise yours, with two tolerances: the file must survive two
trailer lines being appended after Create, and a stats block being appended after
Review. A tool that validates the story file against a strict schema, or rewrites it
whole, will need to tolerate or preserve these.

---

## 5. Phase obligations

Each is a checklist. Your `## Create` / `## Implement` / `## Review` text is what makes
the subagent satisfy it; the orchestrator's own instructions cover the items marked ⟨O⟩,
so you do not repeat them.

### Create — spawned on `opus`, from `main`, tree clean

- [ ] Writes `{story_file}` for **`{story_key}` by key — never auto-discovered.** With
      two lanes in progress, a tool left to "pick the next story" picks the other lane's.
      If your tool has a discovery mode, the prompt must bypass it by naming the story.
- [ ] Sets the story to `ready-for-dev`; flips `epic-{E}` to `in-progress` if this is the
      epic's first story. Both writes are expected and the orchestrator's Step 2 tree
      check allows exactly `{story_file}` and `{status_file}` to be dirty.
- [ ] Touches no other file. Nothing is committed yet — Step 2 branches first, so that a
      Create that dies mid-write leaves `main` clean.
- [ ] ⟨O⟩ ends the file with `Dev Model:` and `Proposed lane gate:`.
- [ ] HALTs — a story that cannot be written (missing epic, missing planning docs, a
      prerequisite the tool insists on) — are reported and end the run. Nothing is
      worked around, invented, or "assumed for now".

### Implement — spawned on the `Dev Model:`, on `story/{story_key}` cut from `origin/main`

- [ ] Implements `{story_file}` **to completion in one execution**: every task ticked,
      every acceptance criterion met, the project's own checks (lint, typecheck, tests —
      whatever it has) passing. No "significant progress" stops, no "next session".
- [ ] Moves the story `ready-for-dev → in-progress` at the start and `→ review` at the
      end, in `{status_file}` and wherever the story file records status.
- [ ] Records what changed in the story file (a file list, or your tool's equivalent), so
      the reviewer and the PR body have something to check against.
- [ ] Adds no dependency and changes no configuration the story did not ask for; that is
      a HALT, not a judgement call.
- [ ] ⟨O⟩ branch first, one commit `feat: {title} (story {id})`, push, never `main`.
- [ ] HALTs (an ambiguous task, a check that will not pass after honest attempts, a
      missing prerequisite) end the run with the reason. The orchestrator leaves the
      branch for the owner; it never resumes into one.

### Review — spawned on the model Implement did *not* use, on the pushed branch

- [ ] Reviews the diff `origin/main...HEAD` **against the story** — `{story_file}` is
      always passed, and the prompt says why: it is what makes the review able to say
      "this needs the owner" rather than silently downgrading every such finding to a
      patch (see Finding C in the BMad example, §10).
- [ ] Triages every finding into exactly one of the skill's three buckets (§6). If your
      tool has more (BMad has `dismiss`), the prompt maps or drops them; if it has fewer,
      the prompt defines the missing one in the tool's terms.
- [ ] **Applies every `patch` unattended.** The bucket is defined as fixes that are
      unambiguous without a human, so there is nobody to ask.
- [ ] **Leaves every `decision-needed` untouched** — written into the story file with
      its options, unresolved, identifiable as such. Never resolved by the reviewer, never
      "picked the obvious one". This is the guarantee the draft-PR signal rests on.
- [ ] Treats a red CI run on the branch as a finding. ⟨O⟩ the prompt names the command.
- [ ] Writes the story's status by the §3 table — `done` or `in-progress` — in the same
      commit as the findings.
- [ ] Reports any cross-epic dependency the diff reveals as a **proposed** `{gates_file}`
      row; writes nothing to that file.
- [ ] ⟨O⟩ review fixes land as their **own** commit on the branch, pushed, never amended
      into the dev commit; the orchestrator opens the PR, draft iff not `done`.
- [ ] **States the answer to every prompt or halt the tool presents** — §7.

---

## 6. The triage vocabulary — the skill's, not the tool's

Three buckets. Every review finding lands in exactly one.

| Bucket | Definition | What happens to it |
| --- | --- | --- |
| `patch` | A real issue whose correct fix is unambiguous without human input. | Applied by the reviewer, unattended, in the review commit. |
| `defer` | Real, but pre-existing — not caused by this story's change — or out of its scope. | Recorded in the story file (and wherever the project keeps deferred work); not fixed now. |
| `decision-needed` | A real issue where the fix depends on the owner's intent — an ambiguous choice, a product call, a trade-off the story does not settle. | Written into the story file with the options laid out, **unresolved**. Story goes to `in-progress`; the PR opens as a **draft**. |

Noise and false positives are dropped, not recorded — a fourth bucket the vocabulary
does not need.

What the orchestrator does with the words:

- **`done` ⇔ no `decision-needed`.** Step 3 reads `{status_file}` on the branch and
  the findings in `{story_file}` and STOPs if they disagree. A review that leaves a
  decision open and writes `done`, or resolves everything and writes `in-progress`, is a
  broken adapter, and the run says so rather than papering over it.
- **Draft PR iff not `done`.** The draft flag is the "owner has calls to make" signal;
  it is derived from the status, so the status has to be right.
- **The hand-back lists them by bucket** — patches applied, items deferred, decisions as
  explicit questions to the owner. Your `## Review` prompt should make the reviewer's
  report use these words so Step 5 can copy them.

---

## 7. Halts and prompts — every one answered in advance

There is no human at the keyboard during a run. A tool that stops to ask something
either gets a scripted answer, or ends the run. Both are fine; **inferring** is not.

The rule: **an adapter's phase section states the answer to every prompt, menu,
checkpoint, or halt its tool can present in the unattended path — or states that it is
a run-ending HALT.** "The subagent will work out what we mean" ran correctly five times
in the BMad adapter's history and was still a defect: nothing said not to pick "start
the next story" at the last menu, and that option would have run the other lane's story
on this branch.

For each answer, give the reason in a clause, because the subagent will be tempted to
deviate exactly when your tool's own text argues for the other option (BMad's "decisions
before patches" rule, for instance — written for a decider who is present).

A halt that is a genuine blocker — the story cannot be written, the tests will not pass,
a dependency needs approval — is **surfaced and ends the run**. The orchestrator's
*Subagent instructions* already say this; your section says which of the tool's halts
are blockers and which have scripted answers. Anything not listed is a blocker by
default.

---

## 8. `## Requires`

What has to be installed or present for the three prompts to work, and the version they
were written against. One line per item, checkable by the owner before the first run:

```markdown
## Requires
- BMad Method v6 installed in the project (`_bmad/`), written against 6.8.0.
- Its `bmad-create-story`, `bmad-dev-story` and `bmad-code-review` skills in `.claude/skills/`.
- `_bmad/config.toml`'s `implementation_artifacts` = `[paths] stories_dir`.
```

The orchestrator does not check these — it cannot know how — but Step 5 names the
adapter in the hand-back, and a run that fails in Create for want of a tool should be
diagnosable from this list.

---

## 9. `## Notes`

For the owner. What living with this adapter means, beyond the prompts. Required content:

- **The resume path** for a draft PR (§3) — mandatory.
- Anything the method does with `{stories_dir}` that constrains the project — BMad's
  skills glob story files non-recursively, so archiving a finished epic's stories into a
  subfolder makes them invisible to every later phase. Archive per epic, after the epic
  is done; never per "phase".
- Any board write the method makes that is not in the §3 table, so that the orchestrator's
  Step 2 tree check (only `{story_file}` and `{status_file}` may be dirty after Create)
  is not a surprise.

---

## 10. Worked example — the `bmad` adapter, and the four findings behind this contract

`adapters/bmad/adapter.md` is the reference. Read it beside this file. Four findings from
the v1 review shaped the sections above; they are recorded here so that the next adapter
does not rediscover them.

| Finding | What it was | Where the contract answers it |
| --- | --- | --- |
| **A. Two writers of `done`** | `bmad-code-review` writes `done` / `in-progress` itself; the skill *also* wrote `done`, with a different rule for the with-decisions case. Two instructions, no defined winner. | §3, the transition table: the adapter's tool owns the transition, the orchestrator checks. The skill no longer writes a story status. |
| **B. Halts answered by inference** | `bmad-code-review` halts at §4 (resolve decisions), §5 (patch menu), §7 (next steps) — and a CHECKPOINT in its step 1 (confirm diff stats), plus a chunking offer for diffs over ~3000 lines. The skill scripted one. | §7: every halt answered, or named a blocker. The BMad `## Review` scripts: step-1 checkpoint → proceed; chunking → decline, review whole; §4 → leave every decision unchecked, go to §5; §5 → "Apply every patch"; §6 → let it write; §7 → "Done". |
| **C. `review_mode` load-bearing and unstated** | Without a story file, `bmad-code-review` sets `no-spec` and reclassifies every `decision-needed` as `patch` or `defer`. The prompt said "pass the file"; not why. | §5 Review, first item: the file is passed *because* it is what keeps the third bucket alive. Every adapter states its own equivalent. |
| **D. Method names inside the scripts** | `lane-gates.py` and `story-run-stats.py` carried BMad phase names and, implicitly, BMad's board format. | §3: the board format is the skill's, documented here; the scripts name the skill's steps, not the method's. |

BMad's vocabulary maps 1:1 onto §6 — `patch`, `defer`, `decision_needed` — with its
fourth bucket, `dismiss`, dropped at triage exactly as §6 prescribes. Its statuses are
the §3 statuses. Its `[Review][Decision]` / `[Review][Patch]` / `[Review][Defer]`
checklist items in the story file are what Step 3 counts for the `done` check.

---

## 11. Conformance — `tests/test_adapters.py`

Every `adapters/*/adapter.md` shipped with the skill, and any `dir =` adapter you point
the tests at, is checked for:

- the five H2s, by name, in order, and nothing else at H2 level;
- `## Review` naming all three buckets — `patch`, `defer`, `decision-needed` — and the
  word `done`;
- `## Notes` containing the word *resume*;
- `## Requires` non-empty;
- the whole file under 100 lines (the context budget, §2).

And `lane-gates.py`'s `read_config` refuses a missing `[adapter]`, both keys, neither,
and a `dir` whose `adapter.md` does not exist — with the message naming the key.

The tests cannot check that your prompts *work*. The check for that is a story run on a
throwaway repository; `fixtures/` is such a project.
