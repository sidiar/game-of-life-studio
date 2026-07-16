# Adversarial Re-Validation — Game of Life Studio PRD (2026-05-26)

**Reviewer stance:** Cynical. The decision log is a claim to disprove; every "fixed" item verified against the current FR/NFR/RFC text.
**Date:** 2026-07-08

**Scope of this pass:** (1) confirm the prior Medium + 4 Lows are genuinely closed in the text; (2) hunt for NEW contradictions introduced by this round's edits, focused on the FR-1.4/1.7 union-semantics rework and the FR-8.4 "unmodified default" predicate; (3) verify RFC-005 Decision 8 matches.

---

## Overall Verdict

**Grade: Good (held).** The prior Medium (dangling-reference / dedup) and all four reworked Lows are substantively closed in the current PRD text. However, executing the instructed RFC-005 cross-check surfaces **one NEW Medium**: the union semantics landed in the PRD (FR-1.4, FR-1.7) and in RFC-005's FR-1.4/FR-1.7 lines, but RFC-005 Decision 8 still computes the **FR-1.3** warning count from the saved index alone — contradicting the PRD's union rule that the open/current Battle must count. Two Lows are also opened around remedy-message wording and the "unmodified" field set. None is Critical or High.

**Counts:** Critical 0 · High 0 · Medium 1 · Low 2 (+ 6 prior items verified closed).

---

## Part 1 — Verification of Prior Fixes

### [CLOSED] Medium — Union semantics for open-saved-Battle dedup (dangling-reference risk)

The previous break: if the current-Battle usage were computed live-overrides-saved, erasing an organism from an open *saved* Battle's live grid (unsaved) would zero its usage and permit deletion, leaving the still-persisted saved Battle with a dangling reference.

Verified genuinely closed and mutually consistent:

- **FR-1.4** (prd.md:134): "the organism counts as used by that Battle if **either** source references it — a **union**, never live-overrides-saved… unsaved edits that erase the organism from the open grid do **not** drop the still-persisted saved reference, so deletion stays blocked until the Battle is actually saved without it."
- **FR-1.4 referential-integrity guarantee** (prd.md:137): deletion blocked while referenced ⇒ "a dangling-reference load state is therefore unreachable through normal use." Consistent with the union block (referenced = saved ∨ live).
- **FR-1.7** (prd.md:158–159): "the organism counts as used by that Battle if **either** references it (union)… merged/deduplicated by Battle id so no Battle is listed twice **and no saved-side reference is ever dropped**."
- **RFC-005 Decision 8, FR-1.4 block** (RFC-005:310): blocked when `usage.get(id)` non-empty **OR** the organism is on the current `initialGrid`.
- **RFC-005 Decision 8, FR-1.7 list** (RFC-005:311): "The overall usage set is the **union** of the saved index and the live grid… the union means an unsaved live erase never drops the still-persisted saved reference."

FR-1.4, FR-1.7, the integrity guarantee, and RFC-005 lines 310–311 all agree. The dangling-reference path is unreachable. **Closed.** (But see MEDIUM-1 — RFC-005 did not extend the same union to FR-1.3.)

### [CLOSED] Low — FR-8.4 suppression requires default present AND unmodified
prd.md:510: warning suppressed only when "no saved Battles, and no organisms beyond the pre-loaded Conway's Classic default **in its original, unmodified form**… (A Conway's Classic whose rules, color, or name have been edited counts as user data, so the warning is **not** suppressed.)" The present-**and**-unmodified predicate is in the text. **Closed** (with LOW-2 caveat on the field set).

### [CLOSED] Low — FR-3.1 "either editable preset"
prd.md:221: "user-configurable to **either** editable preset, 50×30 or 100×60 (FR-8.10)." Two discrete presets, no continuous-range implication; matches FR-8.10 options (prd.md:560). **Closed.**

### [CLOSED] Low — FR-7.2 tile same-color note
prd.md:421: note added that reusable colors (FR-2.3) may render two same-colored organisms indistinguishably in the snapshot; cross-refs FR-3.3 / FR-4.6. **Closed.**

### [CLOSED] Low — FR-2.4 acceptance criteria added
prd.md:180–183: three ACs (Enabled/Disabled toggle; FR-5.7 saturation transform when enabled, full saturation when disabled; visual-only, cell-age tracking FR-5.6 unaffected). **Closed.**

### [CLOSED] Low — Metric 1 reframed as design intent
prd.md:737–740: "Target (design intent)… an onboarding-simplicity goal, not a measured population rate"; "The figure is aspirational, not an instrumented metric." **Closed.**

---

## Part 2 — NEW Findings From This Round

### [MEDIUM-1] RFC-005 computes the FR-1.3 warning count from the saved index only — contradicts the PRD union rule that the open Battle must count

The union rework reached the PRD's FR-1.4 and FR-1.7 and RFC-005's FR-1.4/FR-1.7 lines, but **not** RFC-005's FR-1.3 line. RFC-005 Decision 8 gives three different computations:

- **FR-1.3 warning** (RFC-005:309): `usage.get(id)?.length ?? 0` — where `usage` is built solely from `battles.list()` (RFC-005:303–307, saved battles). **The live/open grid is not included.**
- **FR-1.4 block** (RFC-005:310): `usage.get(id)` non-empty **OR** current `initialGrid` (union).
- **FR-1.7 list** (RFC-005:311): union of saved index **and** live grid.

The PRD requires the open/current Battle to count toward the **FR-1.3** "[N] Battle(s)" too:

- **FR-3.12** (prd.md:276): "Editing this way is subject to the **FR-1.3 warning**, since the organism is in use in the current Battle (the open Battle counts toward '[N] Battle(s)')."
- **FR-1.3** (prd.md:125): the "[N] Battle(s)" count "is expandable to reveal which Battles per **FR-1.7**" — and FR-1.7 (prd.md:154, 159) applies the union at "the FR-1.3 edit warning" surface explicitly.

**Consequence:** an implementer following RFC-005:309 builds the FR-1.3 count without the live grid. In the exact FR-3.12 flow — editing an organism from the Battle Editor of an **unsaved "Current Battle (unsaved)"** that has the organism placed — the unsaved battle is absent from `battles.list()`, so `usage.get(id)?.length ?? 0` returns **0**. The warning would report "used in 0 Battle(s)" or fail to fire, directly contradicting FR-3.12's guarantee that the open Battle counts and the warning shows. It also under-counts from the Library surface whenever an unsaved current Battle references the organism.

This is a spec-vs-spec divergence at exactly the seam this pass was asked to verify. Fix by making RFC-005:309 read the same union as :310/:311 (saved index ∪ live `initialGrid`, deduped by battle id). The PRD is internally consistent (FR-1.3 defers its count to FR-1.7's union); only RFC-005 Decision 8 lags — the same lag pattern the C-2 round previously corrected for the delete check.

*Minor contributing ambiguity:* FR-1.7 (prd.md:159) calls the saved index "backing FR-1.3 and FR-1.4," which, read alone, invites the saved-index-only reading RFC-005:309 adopted. The operative sentence immediately restates the union, so the PRD conclusion is union — but the "backing" phrasing is the likely seed of the RFC drift and would be worth tightening.

### [LOW-1] FR-1.4 remedy wording doesn't cover the union edge case it was created to protect (soft dead-end)

The union guarantees deletion "stays blocked until the Battle is actually saved without it" (prd.md:134). But the remedy **message** doesn't tell the user to save. Scenario: a saved Battle "Foo" references organism X; the user opens Foo, erases all X cells (unsaved), then tries to delete X. Union correctly keeps the delete blocked via the still-persisted saved index. The collapsed single entry is labeled "Foo" (a saved Battle), yet:

- The "current grid is a usage → erase from the current grid" remedy (prd.md:134) doesn't apply — X is no longer on the live grid.
- The saved-Battle remedy "Remove it from those Battles, or delete the Battles" (prd.md:133) points the user at Foo, which they *have* already erased X from — the only real remedy is **save Foo** to persist the removal, which no message states.

The user isn't hard-stuck (deleting Foo entirely also unblocks), but the messaging leaves the "save to persist the erase" path unspoken for precisely the collapsed saved-and-open case the union introduced. Add a remedy branch: when the sole/blocking usage is the open, already-saved Battle whose live grid no longer references the organism, instruct "save this Battle to persist the removal, then try again."

### [LOW-2] FR-8.4 "unmodified default" predicate under-specifies which fields count as modification

prd.md:510 enumerates modification as edits to "rules, color, or name." An organism also has a **Dominance value** (FR-2.2) and an **aging-degradation toggle** (FR-2.4), neither listed. Read literally (the parenthetical reads as exhaustive), a user who changed *only* Conway's Classic's Dominance or aging toggle would still satisfy "unmodified" ⇒ warning **suppressed** ⇒ that edit silently discarded on import — the exact data-loss the present-and-unmodified predicate exists to prevent. Compounding it, FR-1.5 (prd.md:140) never specifies Conway's Classic's Dominance, so the baseline for an "unmodified" comparison of that field is itself undefined. The predicate is *detectable in principle* (deep-equality against the seed constant), but the PRD should state that the comparison covers **all** editable fields (name, color, Dominance, aging toggle, rules) — not the three enumerated — and pin the default's Dominance in FR-1.5 so the baseline exists.

---

## Summary Table

| ID | Severity | Location | Issue |
|----|----------|----------|-------|
| MEDIUM-1 | Medium | RFC-005:309 vs prd.md:276/154/159 | FR-1.3 warning count uses saved index only; PRD union requires the open Battle to count (under-counts / mis-fires in the FR-3.12 unsaved-Battle flow) |
| LOW-1 | Low | prd.md:133–134 | Remedy message omits "save the Battle to persist the erase" for the collapsed saved-and-open union case; soft dead-end |
| LOW-2 | Low | prd.md:510 (+ FR-1.5:140) | "Unmodified" default enumerates only rules/color/name; omits Dominance + aging toggle; Conway's Dominance baseline undefined |

**Prior items verified closed:** union dedup Medium; FR-8.4 present-and-unmodified; FR-3.1 either-preset; FR-7.2 tile note; FR-2.4 ACs; Metric 1 reframe.

*(Deferred lowercase casing drift noted as mechanical only, not re-litigated.)*
