# UX Notes: Preset Workspace Library (Epic 7, FR-9)

**Date:** 2026-09-28 · **Mockup:** `clinical-lab-theme/preset-workspace-library.html` (interactive — dialogs, banner, char count) · **Scope:** deliberately small. Epic 7's UI surface is thin — most of its
value is the *absence* of UI on the first visit. Everything below reuses established Epic 5
Settings patterns; no new components, no mockups. Anything not stated here is an in-story
decision.

---

## 1. First visit (Story 7.4) — the no-UI experience

The feature IS the absence of friction: a fresh visitor at any entry page gets the default
preset loaded silently behind the existing `seeding → ready` page state. **No dialog, no toast,
no "we loaded a sample for you" banner** — the populated gallery explains itself (the same
philosophy as NFR-4.1's no-tutorial rule; the FR-7.7 empty state remains for the fallback-only
edge). The seeding indicator already shown today covers the added fetch time; if the fetch is
slow, the Conway-fallback timeout beats a spinner — decide the budget in-story.

## 2. Settings preset row (Story 7.5)

Lives in the Data Management card beside Export / Import / Clear All, using the shared
`Row`/`RowLabel`/`RowDescription` primitives (lifted in 5.9) and the single shared row-outcome
slot (5.10 D2 ruling — the started-latest-flow owner rule applies to this row too).

- **Control:** a select listing manifest presets by name, description as supporting text,
  plus a "Load" action button — mirroring the Import row's label+control+action rhythm.
  Default preset listed first.
- **Warning:** the FR-8.4 destructive dialog verbatim — same copy pattern ("replaces entire
  workspace"), same export-first option, same pristine suppression. Preset name appears in the
  dialog title so the user knows what is replacing their work.
- **Guards:** same concurrent-action posture as 5.9/5.10 (no-op while another data flow is in
  flight).

## 3. Preset link arrival (Story 7.6)

- **Pristine workspace:** load silently, land in the gallery — identical to §1. This is the
  shared-link happy path and must feel like "the app just opens, populated."
- **Existing workspace:** the FR-8.4 warning dialog on arrival, preset name in the title;
  Cancel lands in the user's own untouched workspace on the normal route.
- **Unknown id:** normal app plus one dismissible message using the existing error-feedback
  patterns ("This preset link doesn't exist (anymore)"), never a broken page.

## 4. Content presentation (Stories 7.3, 7.7)

Preset battles are ordinary battles — no badges, no "sample" labeling, no special tiles.
The gallery's existing thumbnail/sort presentation carries them; the content itself must earn
attention (colliding colonies visible in the thumbnail, names that invite a click).

## 5. Descriptions (Story 7.2, FR-9.5)

Plain text only — no markdown, no links; the description is ambience, not documentation.

- **Editing:** a multiline field directly under the name field in both editors, same quiet
  styling as name; shares its dirty tracking and validation feedback. Cap feedback follows the
  existing name-cap pattern.
- **Organism cards:** description as supporting text under the name, clamped to ~2 lines with
  the full text available on the card's existing expansion/detail affordance.
- **Battle surfaces:** on the gallery tile as clamped supporting text; in the Battle page,
  visible from Play Mode's vicinity (near the battle name / status area, not buried behind
  Edit) — exact placement in-story, but the principle is: readable while watching the run.
- **Workspace description:** one home surface — the gallery header is the candidate — shown
  quietly (supporting text, not a hero banner). It carries the preset's "what you are looking
  at" voice after a preset load. It is edited in Settings → Data Management (Story 7.2); the
  gallery header stays display-only.
- **Absent description:** nothing renders. No placeholder, no empty region, no "add a
  description" nudge — a described workspace and an undescribed one both look intentional.
