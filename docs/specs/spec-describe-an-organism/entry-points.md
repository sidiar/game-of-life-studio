# Entry points — Describe an Organism

The LLM has exactly three triggers, all marked ✨, and **each does one thing in every state** (SPEC constraint). Inside the Editor, **every AI result appears in one place: the ✨ AI tab**. Labels, placement details and wording are indicative. The UI mock (`delivery-order.md`, step 0) settles them.

## Triggers

| Trigger | Where | Click does | Result |
|---|---|---|---|
| **✨ Describe an Organism** | Organism Library toolbar, next to `+ Create New Organism` (`OrganismLibrary.tsx`) | Asks for a prompt (≤280 characters), then CAP-1 with the CAP-3 check | The Editor opens in create mode with the draft and the ✨ AI tab active, showing the prompt as the first turn |
| **✨ next to Name** | Editor, Column 1, Name field | CAP-8: 5 name suggestions | Switches to the ✨ AI tab. The names show as picks, and picking one fills the unsaved name |
| **✨ Explain this organism** (labelled) | Editor, bottom of Column 1, directly above `Delete Organism` (in a create session, where Delete is absent, it is the last item) | CAP-9: rule checks, simulation run and explanation | Switches to the ✨ AI tab. The explanation and warnings show there, with "Use as description" (asks before replacing a non-empty description). Disabled with a tooltip while the organism has no rules |

## The ✨ AI tab

The Editor's right column (`OrganismEditorLayout.tsx`, fixed 350px) becomes two tabs: **Preview & Test** and **✨ AI**. The feature takes no extra width at any breakpoint.

- **One history per Editor session.** Each AI action is a turn: the prompt, suggested names, an explanation. Results stay where they appeared, newest last. The history is discarded when the Editor closes (SPEC non-goal: no saved chat history).
- **A free-text input only in sessions opened from ✨ Describe.** In CAP-1 it holds the prompt, and editing it plus "Try again" regenerates the draft from the prompt alone and replaces the whole draft; when the draft differs from the last generated one (hand edits), it asks first, as "Use as description" does. CAP-5 turns it into the follow-up input, which works on the draft as it stands, hand edits included. Other sessions have no free-text input, so the LLM can't rewrite an existing organism's rules (SPEC non-goal).
- **Default tab:** ✨ AI when the session was opened from ✨ Describe, otherwise Preview & Test. A ✨ trigger in the Editor switches to ✨ AI. The user can switch freely.
- **"Try it in Preview"** on a draft or an explanation switches to Preview & Test.
- **Empty state** (no turns yet) names what the tab does and offers **Suggest names** and **Explain this organism** as buttons. They are shortcuts to the Column 1 triggers, with the same behaviour and the same disabled states, so there is no ambiguity. Explain is disabled while the organism has no rules.
- **Result dot.** When a result or failure outcome arrives while Preview & Test is showing, a dot appears on the ✨ AI tab label until the user opens the tab. It has an accessible label (e.g. "✨ AI, new result").
- **Switching tabs loses nothing.** Preview & Test stays mounted while hidden: the drawn pattern, generation and run state survive, and a running preview pauses while hidden (no off-screen simulation cost). The AI history and the input's draft survive too.

## Every trigger

- Shows progress within 1 s, in the ✨ AI tab, and is disabled while its request runs.
- When the feature is unavailable (`budget_exhausted`, offline), triggers stay visible but disabled, with the reason as a tooltip, and the ✨ AI tab says why. Manual authoring is unaffected. For ✨ Explain, the rule checks still run offline and show in the tab.
- The Editor is shared, so the Name ✨, ✨ Explain and the ✨ AI tab also appear when the Editor opens from a Battle's roster (`+ Create New Organism` there). ✨ Describe is only in the Library.
