---
id: SPEC-describe-an-organism
companions:
  - entry-points.md
  - delivery-order.md
  - failure-modes.md
  - eval-cases.md
  - behaviour-facts.md
  - ../../project-context.md
  - ../../planning-artifacts/prds/prd-GameOfLife-2026-05-26/prd.md
  - ../../planning-artifacts/architecture.md
sources: []
---

> **Canonical contract.** This SPEC and the files in `companions:` are the complete, preservation-validated contract for what to build, test, and validate. Source documents listed in frontmatter are for traceability only — consult them only if you need narrative rationale or prose color this contract intentionally omits.

# Describe an Organism

## Why

**An opportunity and a vision.** Authoring an organism today means composing Born/Survive/Die rules from property-operator-value conditions (PRD FR-2.5). That is the steepest step in the studio, and it shuts out the youngest users the brief names. Letting anyone say what they want ("a shy organism that only survives in small groups") and get a working organism they can preview and tweak turns that step into play. It is also the studio's first end-user LLM feature. It extends the SDD showcase into AI in production: structured output validated against the domain, a versioned prompt, evals, cost and abuse limits, and graceful failure.

## Capabilities

- id: CAP-1
  intent: From the Organism Library, a user can describe an organism's behaviour in plain language and get a complete new organism as an unsaved draft in the Organism Editor, with their prompt kept in the Editor's ✨ AI tab.
  success: For every in-scope prompt in `eval-cases.md`, the Editor opens in create mode with a draft whose name, dominance, aging flag and rules are generated. Its description is the prompt as typed. The ✨ AI tab is active and shows the prompt, which stays editable (`entry-points.md`). Nothing is written to the library until the user clicks Save.

- id: CAP-2
  intent: Every draft the user sees is a valid organism the engine can run.
  success: A test that feeds malformed, partial and schema-violating model output shows that none of it reaches the Editor. Each case ends in either a valid draft or the "invalid output" outcome in `failure-modes.md`.

- id: CAP-3
  intent: The draft's simulated behaviour matches the behaviour the user described, and the user is told when it may not.
  success: With each draft, the model states the traits it intends, in the vocabulary of `behaviour-facts.md`. The app measures them before showing the draft. A test with a fake model shows that a mismatch triggers exactly one repair attempt, and that a remaining mismatch shows the draft with the `ok_mismatch` note from `failure-modes.md`. Against the real model, the eval suite passes at least 10 of the 12 behavioural cases at the pinned prompt version, judged by the engine, not by an LLM.

- id: CAP-4
  intent: The user can understand what each generated rule does without reading its conditions.
  success: Every generated rule has a non-empty `summary` (FR-2.5, ≤120 characters) in the language of the description.

- id: CAP-5
  intent: The user can refine the current draft with a follow-up instruction (e.g. "make it spread slower"), typed into the ✨ AI tab of a session opened from ✨ Describe, instead of starting over.
  success: A follow-up on an open draft returns a revised draft that keeps the parts the instruction did not mention. The "refine" cases in `eval-cases.md` pass.

- id: CAP-6
  intent: Off-topic, unsafe or unanswerable requests, and an unavailable service, end in a clear, friendly outcome, and the rest of the studio keeps working.
  success: Each row of `failure-modes.md` has a test showing its specified message and draft state, with the Editor and library still usable afterwards.

- id: CAP-7
  intent: The operator can tell which prompt version and model produced each result, what it cost, and how often people keep what the feature produced, and can change the prompt version without a code change elsewhere.
  success: Every LLM request emits one structured record (prompt version, model, input/output tokens, latency, outcome from `failure-modes.md`). The eval report is keyed by prompt version. GoatCounter counts one event per use of each entry point (`entry-points.md`) and one per kept result (a generated organism saved, a suggested name picked, an explanation copied into the description). No event carries user text.

- id: CAP-8
  intent: For any organism open in the Organism Editor, hand-built or generated, the user can ask for name suggestions that fit its behaviour and pick one from the ✨ AI tab.
  success: Each request returns 5 distinct, child-safe names of 1–50 characters (`MAX_ORGANISM_NAME_LENGTH`), in the language of the organism's description, none matching a name already in the library. Picking one changes only the unsaved name field. The naming cases in `eval-cases.md` pass.

- id: CAP-9
  intent: For any organism open in the Organism Editor that has rules, the user can get a plain-language explanation of how it will actually behave, grounded in a simulation run and in checks on the rules themselves, so they can check that hand-made or tuned rules do what they meant. The explanation appears in the ✨ AI tab.
  success: For every organism in the Explain cases of `eval-cases.md`, every behavioural claim in the explanation cites a fact from `behaviour-facts.md` and agrees with its measured value. Rules that never fired and every warning from the rule checks are named. The organism is unchanged unless the user confirms replacing the unsaved `description` (FR-9.5, ≤280 characters) with the explanation.

## Constraints

- **Nothing persists without an explicit Save.** Every result lands in the open Organism Editor and goes through its save path (FR-1.2, FR-2). There is no second write path into the repositories.
- **The LLM is reached only from three entry points, each with one behaviour in every state** (`entry-points.md`): ✨ Describe an Organism in the Library (CAP-1), the ✨ next to Name in the Editor (CAP-8), and the labelled ✨ Explain this organism above Delete Organism (CAP-9). No control changes what it does based on the organism's state, and no other route or screen calls the LLM.
- **Inside the Editor, every AI result appears in the ✨ AI tab**, which shares the right column with Preview & Test (`entry-points.md`). The feature adds no column, panel or window, so the Editor's width and breakpoints (`OrganismEditorLayout.tsx`) are unchanged.
- **Switching tabs loses nothing.** Preview & Test stays mounted while hidden: its drawn pattern, generation and run state survive, and a running preview pauses while hidden. The ✨ AI history and the input's text survive too.
- **The app generates the system-owned fields** (`id`, `contentHash`, `schemaVersion`), never the model. The model's output must satisfy `OrganismSchema` for the fields it supplies.
- **Generated organisms are self-contained.** No `organismType` conditions, because they would reference library ids the model cannot know. Rivalry is expressed through `occupantNeighborCount` and `cellState: occupied`.
- **Child-safe by default.** Generated names, explanations and summaries are suitable for children. Off-topic, unsafe and prompt-injection requests are declined, not answered.
- **No user text is stored** beyond the life of the request. The CAP-7 records and GoatCounter events carry metadata only.
- **The API key never reaches the browser.** This rules out bring-your-own-key and calling the provider directly from the client.
- **Monthly spend has a hard cap of ~€5, enforced server-side, plus a per-visitor rate limit.** Reaching either degrades the feature (CAP-6). It never fails the page.
- **The static, offline studio is unchanged.** NFR-6.1 is amended for this feature alone, and with it `project-context.md`'s rule that the MVP has no backend and never adds an API route or server action. That is a deliberate override, to be recorded as Cross-Cutting Decision L and in `project-context.md` itself before Epic 8 starts, so the two stop disagreeing. The endpoint lives outside `apps/web`, since a static export cannot host one; where it runs is RFC-009's call. Gallery, editor, simulation, persistence and the CAP-9 rule checks work with the LLM endpoint unreachable or not configured at all: a fork or a local build with no endpoint shows the feature as unavailable and nothing else changes. The ✨ AI tab, the prompt dialog and the fact-measuring run load on demand (`next/dynamic`, AR-35), so what the bundle gate measures, each route's first-load JS, grows by no more than its 8 KB allowance per PR, with the baseline refreshed in the same PR as `project-context.md` requires.
- **Behaviour claims are measured, not inferred.** CAP-3's trait check and CAP-9's explanation both rest on facts the engine computes (`behaviour-facts.md`). A claim the facts don't support counts as a failure, not a stylistic issue. This rules out judging or explaining an organism from its rules alone.
- **LLM access is injected, never imported**, on the same seam as the repositories (`project-context.md`). Unit and e2e tests run against a fake model. The paid eval suite runs on demand, never on every PR.
- **Latency:** visible progress within 1 s of a ✨ click, and a result or failure outcome within 15 s (p95), including CAP-3's repair attempt.

## Non-goals

- An agent that runs simulations as a tool to design organisms or Battles. That is phase 2 (option 3), if time allows.
- Generating initial grid patterns, whole Battles, or battle commentary and narration.
- Rewriting the rules of an existing organism through the LLM. CAP-1 only creates new drafts, and CAP-5 only refines the draft its prompt produced. CAP-8 and CAP-9 change only the unsaved name or description, and only when the user picks a name or chooses "Use as description".
- ✨ Describe from anywhere other than the Organism Library (e.g. a Battle's roster) in this phase.
- Accounts, chat history kept beyond the Editor session, or any server-side storage of user content.
- Failover across several providers. Unavailability is handled by degrading the feature (CAP-6).
- Voice input, and small screens (the existing small-screen gate already covers the Editor).

## Success signal

- On the live site, a visitor clicks ✨ Describe an Organism in the Library and types "a shy organism that only survives in small groups". Within 15 s the Editor shows the draft with the prompt in the ✨ AI tab. "Try it in Preview" shows that behaviour (FR-2.7), and one click saves it to the library.
- The eval suite reports ≥10/12 behavioural passes and 100% of the naming, explain and decline cases at the pinned prompt version.
- The first month of public use stays under the €5 cap, and GoatCounter shows how many generated organisms, names and explanations were kept.

## Assumptions

- Prompts may be in any language the model handles. Generated text follows the description's language, while the UI stays English.
- The Editor needs a way to open in create mode with a prefilled, unsaved draft and the ✨ AI tab active. Clone does not open the Editor today (`deferred-work.md`), so this is new.
- A CAP-1 prompt is capped at 280 characters, the description cap (FR-9.5), so it fits the draft's description as typed. This also bounds cost and the room for injection.
- The Name ✨, ✨ Explain and the ✨ AI tab live in the shared Editor, so they also work when it opens from a Battle's roster.
- The ✨ AI history covers one Editor session and is discarded on close.
- The model may pick `colorToken` from the palette's token list. Otherwise the existing next-unused default (FR-2.3) applies.
- The hosting and runtime of the server-side endpoint is an architecture decision for RFC-009, not something this spec fixes.
- Asking for names again (CAP-8) returns a fresh set that excludes the names already shown for that organism in this Editor session.
- For CAP-8 and CAP-9, the model's only input is the open organism (its rules, description and current name). CAP-8 also gets the library's names, used only to avoid duplicates, and CAP-9 gets the measured facts.
- The engine can report how often each rule fired, using counting that runs only for CAP-3 and CAP-9 (`ruleFired` in `behaviour-facts.md`). It stays pure, and Play mode's 60 FPS path doesn't pay for it.
- The simulation run (3 seeds × 200 generations, plus an optional rival run) completes in the browser well inside the 15 s budget. CAP-3 may need it twice because of the repair attempt.
- A 15 s p95 is acceptable for a non-streaming structured response. Progress is shown, not streamed tokens.

## Open Questions

None. Both UI-mock questions are resolved (`entry-points.md`): the empty state offers the two Editor actions as buttons, and the tab shows a dot when a result arrives while Preview & Test is active.
