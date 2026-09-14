import type { Settings } from '@gol/domain';

/**
 * The FR-4.2 / FR-8.12 speed ladder has ONE source and it is the schema: `SettingsSchema`'s
 * `defaultSpeed` literal union (`packages/domain/src/settingsSchema.ts`). Deriving the type from it
 * — rather than writing `1 | 2 | 5 | 10 | 20` a second time here — means the transport control
 * (Story 3.13), the settings page and this hook can never disagree about which speeds exist.
 */
export type GenPerSec = Settings['defaultSpeed'];

/**
 * Decision D.1: the loop's period is `1000 / genPerSec` ms.
 *
 * The ladder guarantees `50 <= ms <= 1000`, and `createSimulationLoop` TRUSTS that band without
 * re-validating (Story 3.8, Task 2): an `ms <= 0` in its ref would step on every frame, a NaN would
 * freeze the accumulator. Keeping the input typed as the ladder is the whole enforcement.
 */
export function msPerCycle(genPerSec: GenPerSec): number {
  return 1000 / genPerSec;
}

/**
 * M2's "<= 10 Hz" publish cadence, derived by CYCLE COUNT rather than by clock (Story 3.10, FD4):
 * publish every `max(1, genPerSec / 10)` cycles. Because speed is a ladder (D.1) and the loop
 * steps at most once per frame (D.2), that is every cycle at 1-10 gen/sec and every second cycle
 * at 20 — a bound that holds under any frame rate, needs no `performance.now()`, and is fully
 * deterministic under a fake scheduler. Manual `step()`, `pause()` and `stop()` publish
 * unconditionally on top of this, so the displayed cycle is never stale while paused.
 */
export function cyclesPerPublish(genPerSec: GenPerSec): number {
  return Math.max(1, genPerSec / 10);
}
