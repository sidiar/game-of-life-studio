# Behaviour facts — Describe an Organism

These are the measured facts about an organism's behaviour. They are produced by running the engine without display on fixed inputs, and by checking the rules in plain code, and they are deterministic for the same rules. CAP-9 grounds its explanation in them. CAP-3 uses the same vocabulary for the traits the model claims and the app then checks (`trend`, `oscillation`, `maxAge`, `extinction`), and its eval checks use the same definitions and thresholds, so none of these can drift apart. The model claims only the traits the prompt constrains, and an unclaimed trait is never checked: nobody can predict whether a Conway soup reads `shrinks` or `stable` at gen 100, and a wrong guess there would stamp a correct draft with `ok_mismatch`.

**The run:** the organism alone on a 50×30 grid, from 3 seeded random soups (30% fill), for 200 generations. If it has any rule with a `cellState: occupied` or `occupantNeighborCount` condition, there is a second run on the same seeds against a fixed rival fixture (`conways-classic`). Facts from the rival run are marked `withRival`.

| Fact id | Value | Definition |
|---|---|---|
| `extinction` | generation number or `none` | First generation with population 0. One value per seed. |
| `trend` | `dies_out` · `stable` · `grows` · `shrinks` · `wanders` | First match wins: `dies_out`: extinct by gen 200. `stable`: gens 20–100 stay within ±10% of their mean and above 0. `grows`: gen-100 population ≥ 1.5× initial. `shrinks`: gen-100 population ≤ 0.5× initial. `wanders`: alive, and none of the above. Majority across seeds. |
| `oscillation` | period or `none` | Smallest period from 2 to 10 that repeats the whole grid state over gens 150–200. |
| `maxAge` | integer, or `≥ N` when saturated | Highest cell age reached on any seed, in the engine's own age: 0 at birth, +1 per survived cycle, saturating at `max(7, highest age literal in the rules + 1)` (RFC-004 §3.3, `maxRelevantAge.ts`). A cell that reaches the saturation value is reported as `≥ N`: it outlived the counter, it did not die at N. So Seeds measures 0, and Conway measures `≥ 7` on every soup. |
| `ruleFired` | per rule id: count | How many times each rule's action applied, summed across seeds. |
| `neverFired` | rule ids | Rules with a count of 0. A rule that only fires in the rival run is listed as `needsRival`, not `neverFired`. |

## Rule checks (plain code, no simulation, no LLM)

These come from reading the rules, so they are instant and work offline. CAP-9 names every warning it finds. Each warning carries the ids of the rules involved.

| Warning id | Fires when |
|---|---|
| `shadowedByDie` | A Survive rule's conditions always imply a Die rule's conditions, so Die (Phase 1, FR-5.2) removes the cell first |
| `unsatisfiable` | A rule's conditions can't all be true at once (e.g. `neighborCount > 8`, two different `eq` values on the same property, a `range` outside 0–8 for a neighbour count) |
| `bornOnLiving` | A Born rule requires `cellState: alive` (birth needs an empty cell) |
| `surviveOnEmpty` | A Survive or Die rule requires `cellState: empty` (there is nothing there to keep or remove) |
| `noBornRule` | The organism has no Born rule, so it can never spread beyond the cells it is placed in |
