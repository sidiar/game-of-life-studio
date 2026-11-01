# Delivery order — Describe an Organism

This is the sequence for Epic 8. The epic and its stories inherit it, and each step ships something usable on its own.

0. **UI mock** of the three triggers and the right column's Preview & Test / ✨ AI tabs (turns, input, empty and unavailable states). Draft: `../../planning-artifacts/ux-designs/ux-GameOfLife-2026-05-27/clinical-lab-theme/ai-features.html`, approved 2026-11-01. It is a planning step like the original UX designs, done before RFC-009, and it answers the SPEC's open questions.
1. **CAP-8: name suggestions**, plus the ✨ AI tab next to Preview & Test. This is the smallest end-to-end LLM call. It sets up the endpoint, the injected model port, the rate limit and spend cap, CAP-7 logging and GoatCounter events, and the CAP-6 failure handling.
2. **CAP-9: ✨ Explain this organism**, with the rule checks. It adds the simulation run (`behaviour-facts.md`) that CAP-3 then reuses.
3. **CAP-1 + CAP-2 + CAP-3 + CAP-4: ✨ Describe an Organism**, with the Library entry point, the create-mode draft, the prompt in the ✨ AI tab, validation and the request-time trait check.
4. **CAP-5: refine**, a later story that turns the ✨ AI tab's prompt input into the follow-up input.
