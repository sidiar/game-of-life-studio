# Failure modes — Describe an Organism

Every LLM request ends in exactly one **outcome**: generation (CAP-1), refine (CAP-5), name suggestions (CAP-8) or explanation (CAP-9). The outcome id is the value CAP-7 logs. All four request types count toward the same rate limit and monthly cap. In every row except `ok` and `ok_mismatch`, no draft is created or changed, an open draft (CAP-5) stays as it was, and the name and description fields (CAP-8/9) keep their current values. A failed ✨ Describe leaves the user in the Library with the prompt still in its input. For CAP-8, `ok` means the suggestion list is shown. For CAP-9, it means the explanation is shown. The CAP-9 rule checks run without the LLM, so they are shown even when the explanation request fails. An explanation that cites a fact it was not given, or contradicts one, counts as `invalid_output`. In the Editor, outcomes appear as a turn in the ✨ AI tab. Messages are friendly and suitable for children, and never show raw errors. Wording here is indicative, and UX may polish it.

| Outcome | Trigger | User sees | Retry |
|---|---|---|---|
| `ok` | Valid result produced | The result lands as in `entry-points.md` | — |
| `ok_mismatch` | CAP-1 only: the draft is valid, but after the one repair attempt a trait the model claimed still differs from its measured value (CAP-3). A draft with no claimed traits never gets this outcome | The draft opens, with a note: "This one may not behave quite as described: it [measured trait]." The user can keep, tweak or discard it | Manual, or tweak by hand |
| `invalid_output` | Model output fails `OrganismSchema` or rule compilation after the automatic repair attempt(s) | "I couldn't build that one. Try describing it another way." | Automatic repair before this outcome (count is an RFC-009 call), then manual |
| `off_topic` | Request isn't about an organism's behaviour (homework, chat, code) | "I can only help design organisms. Try describing how yours lives, grows or dies." | Manual |
| `unsafe` | Request or the name it implies isn't suitable for children | Same tone as `off_topic`, no lecture | Manual |
| `injection` | Prompt tries to override instructions or extract the system prompt | Treated as `off_topic` (same message) | Manual |
| `rate_limited` | The visitor exceeded the per-visitor limit | "You've designed a lot. Take a break and try again in a few minutes." | After the window |
| `budget_exhausted` | Monthly spend cap reached | Feature shown as unavailable until next month. Manual authoring still works | Next month |
| `unavailable` | Offline, endpoint unreachable, or provider 5xx/overloaded | "The organism designer is resting right now. You can still build one by hand." | Manual |
| `timeout` | No outcome within 15 s | Same as `unavailable` | Manual |
