// The pure composition that answers "who holds the `GridBuffers`, when do they swap" (FD2, AC9;
// see `simulationLoop.ts`'s head comment for the loop's half of this story). The loop's `step`
// dependency is `() => Grid`, with no buffers in its type (Story 3.6's FD1 kept them out of
// `SimulationStrategy` for the same reason); THIS is the thunk every caller composes to get one —
// Story 3.10's `useSimulation` hook and Story 4.15's Organism Editor preview both need exactly this
// call and nothing hand-rolled, which is the whole point of shipping it once, beside the loop,
// rather than leaving each consumer to re-derive "run the strategy, then swap" and risk forgetting
// the swap (the front never advances, the grid appears frozen, and nothing throws).
import type { GridBuffers } from '../grid/doubleBuffer';
import { swapGridBuffers } from '../grid/doubleBuffer';
import { activeStrategy } from '../strategy/threePhaseStep';
import type { SimulationDeps, SimulationStrategy } from '../strategy/threePhaseStep';

/**
 * Runs one cycle and swaps — `strategy(buffers.front, buffers.back, deps)` writes `back`, then
 * `swapGridBuffers` hands back a NEW pair with the roles exchanged. Pure: neither `buffers` nor
 * `deps` is mutated, only `back`'s CONTENTS change (the same "new pair value, contents mutated in
 * place, wrapper is fresh" contract `swapGridBuffers` itself documents) — the caller replaces its
 * own reference with the return value, which is what keeps this safe to call from a `useRef`
 * without a write-during-render.
 *
 * The swap happens HERE, immediately after the strategy returns — not deferred, not left to the
 * caller to remember — which is the "when it swaps" half of FD2's question; "who holds" is
 * answered by the caller owning `buffers` (Story 3.10's ref), never this function.
 */
export function stepGridBuffers(
  buffers: GridBuffers,
  deps: SimulationDeps,
  strategy: SimulationStrategy = activeStrategy,
): GridBuffers {
  strategy(buffers.front, buffers.back, deps);
  return swapGridBuffers(buffers);
}
