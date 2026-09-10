// The assembled cycle (RFC-004 §3.1/§3.2, FR-5) — the first code in this repo that turns a grid at
// cycle N into a grid at cycle N+1, and the engine's PUBLIC STEP CONTRACT. Stories 3.7 (bench),
// 3.8 (RAF loop), 3.9 (rendering), 3.10 (the React bridge) and 4.15 (the organism preview) are all
// typed by what this file declares.
import type { Grid } from '../grid/grid';
import { birthSurvivalPhase } from './birthSurvivalPhase';
import { conflictPhase } from './conflictPhase';
import { deathPhase } from './deathPhase';
import type { ConflictDeps, PhaseDeps } from './phaseDeps';

/**
 * Everything one cycle needs, injected (RFC-004 §3.1, as amended by M15; story FD2).
 *
 * ⚠️ It is the UNION OF THE PHASES' OWN DEPS and nothing else — `PhaseDeps` (Phases 1 and 2 read
 * `evaluatorsByRef`) plus `ConflictDeps` (Phase 3 reads `organisms`, `rng` and `maxRelevantAge`).
 * Both are declared in `phaseDeps.ts` beside the phases that read them, so each phase's read set
 * stays honest and this type stays derived rather than invented. A wider object satisfies each
 * narrower parameter structurally, which is why the composition below hands ONE value to all three
 * calls with NO ADAPTER — Story 3.5's FD1 said an adapter here would mean the shape is wrong, and
 * `threePhaseStep.test.ts` pins it.
 *
 * ⚠️ NO `agingEnabled`, deliberately. RFC-004 §3.1 sketches `organisms: OrganismRuntime[] // dense
 * array; dominance, agingEnabled, …`; that comment describes a type the RFC deferred, not a claim
 * that the strategy reads the field. FR-2.4 is explicit the other way — the toggle *"affects visual
 * rendering only; cell-age tracking (FR-5.6) is unaffected"* — and RFC-002 consumes it at render
 * time (Story 3.9). Publishing it here would invite the one bug the cycle-end write forbids.
 *
 * ⚠️ NO seed, and no `cycle` counter. A seed is config, not outcome (A-2): nothing persists or
 * exports one, so the caller constructs the `Rng` and owns it. The cycle number belongs to the loop
 * (Story 3.8), not to a pure reducer.
 *
 * A `CompiledSession` already carries `evaluatorsByRef` and `maxRelevantAge`, so
 * `{ ...session, organisms, rng }` satisfies this whole interface with no construction step — the
 * cheapest shape for Story 3.10 to build.
 */
export interface SimulationDeps extends PhaseDeps, ConflictDeps {}

/**
 * A strategy is a pure stepping function (RFC-004 §3.1, the Functional Strategy pattern).
 *
 * ⚠️ SIGNATURE — story FD1, option (a). §3.1 declares `(grid: Grid, deps: SimulationDeps) => Grid`,
 * which reads as allocate-a-whole-new-grid-per-cycle. The shipped shape takes a caller-supplied
 * DESTINATION instead, matching `deathPhase(source, destination, deps)` (Story 3.5's FD2) and what
 * `../grid/doubleBuffer.ts` was built for: the destination IS `back`, and allocating instead would
 * cost a `Uint8Array(N)` plus a `Uint16Array(N)` up to 20 times a second — precisely the per-cycle
 * allocation Decision A.6's steady-state budget exists to rule out.
 *
 * ❌ NOT `(buffers: GridBuffers) => GridBuffers`, the other candidate. It gives Story 3.8 a
 * one-liner but bakes double-buffering into the strategy TYPE, which then cannot describe Story
 * 3.9's preview instance (M3) or Story 4.15's draft-organism run without each carrying a pair.
 * WHO holds the buffers and WHEN they swap is Story 3.8's question, where the loop and its refs
 * live; this signature leaves it there.
 *
 * ⚠️ The RFC divergence is FLAGGED, not amended: §3.1/§3.2 still spell the allocating shape.
 * Amending an authority doc is Sidiar's call (the M14/M15 precedent), and the proposed wording is
 * recorded in this story's Dev Agent Record awaiting it.
 *
 * ⚠️ `threePhaseStep` must remain ASSIGNABLE to this type — declaring a strategy type the only
 * implementation does not satisfy is worse than not declaring one. Pinned below by
 * `activeStrategy`'s annotation, which is a compile-time assertion, not documentation.
 */
export type SimulationStrategy = (source: Grid, destination: Grid, deps: SimulationDeps) => Grid;

/**
 * The three PRD phases, composed (FR-5, RFC-004 §3.2).
 *
 * ```
 * front  = cycle N (rendered)
 * deathPhase(front, back, deps)      -> back = post-death intermediate   (Phase 1 writes every cell)
 * birthSurvivalPhase(back, deps)     -> claims                           (Phase 2 only READS back)
 * conflictPhase(back, claims, deps)  -> back = cycle N+1                 (Phase 3 finishes in place)
 * swapGridBuffers(buffers)           -> front = cycle N+1                (the CALLER's step, 3.8)
 * ```
 *
 * ⚠️ Phase 2 derives its subjects from Phase 1's OUTPUT, not from `source`. That single choice is
 * the whole of RFC-004 §3.2's *"the same decision function serves both phases; only the input grid
 * changes"*, and it is why explicit deaths are gone from the neighbour counts while implicit ones
 * are still standing (M10).
 *
 * ⚠️ THE SWAP IS NOT DONE HERE. This returns `destination`; the caller replaces its own pair with
 * `swapGridBuffers(...)`. Doing it here would require owning the pair — see `SimulationStrategy`.
 *
 * Purity is stated over the SOURCE (Story 3.5's FD2): `source` is byte-identical afterwards and no
 * returned buffer aliases one of its buffers. `destination` is an OUTPUT — asserting nothing
 * anywhere was written would be asserting the function does nothing.
 *
 * ❌ No time, no accumulator, no `msPerCycle` (Decision D, Story 3.8). ❌ No extinction check or
 * run status (Decision B.5, Story 3.15) — and note the counter-intuitive companion rule: auto-stop
 * is extinction-ONLY, so still-lifes, oscillators and gliders must keep running. ❌ No population
 * counts (M2, Story 3.10): they are a derived view at <= 10 Hz, never engine state, never computed
 * per cycle. ❌ No rendering, no `ageShade` (Story 3.9).
 *
 * @throws Error when `destination` does not match `source`'s dimensions or shares a buffer with it
 *   — Phase 1's guard, raised on its behalf, once per cycle.
 */
export function threePhaseStep(source: Grid, destination: Grid, deps: SimulationDeps): Grid {
  // ONE deps value, three phases, no adapter and no mapping — the structural claim Story 3.5's FD1
  // made when it deferred `SimulationDeps` to this story.
  deathPhase(source, destination, deps);
  const claims = birthSurvivalPhase(destination, deps);
  return conflictPhase(destination, claims, deps);
}

/**
 * The MVP's active strategy, fixed in code (RFC-004 §3.1).
 *
 * The annotation is the point: it is where `tsc` checks that `threePhaseStep` actually satisfies
 * `SimulationStrategy`, so the two can never drift apart silently.
 *
 * ❌ No registry keyed by id, no user-facing descriptor (label / explanation / `beta` flag), no
 * per-battle strategy selection, no experimental variants. §3.1 defers ALL of it explicitly, and
 * they add no MVP value while coupling Battle Settings to the engine. The seam is this one
 * indirection; the machinery arrives when a second strategy actually does.
 */
export const activeStrategy: SimulationStrategy = threePhaseStep;
