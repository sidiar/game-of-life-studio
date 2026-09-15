import type { Settings } from '@gol/domain';

/**
 * The FR-4.2 / FR-8.12 speed ladder has ONE source and it is the schema: `SettingsSchema`'s
 * `defaultSpeed` literal union (`packages/domain/src/settingsSchema.ts`). Deriving the type from it
 * — rather than writing `1 | 2 | 5 | 10 | 20` a second time here — means the speed control
 * (Story 3.13's `<SpeedControl>`), the settings page (Story 6.9) and the hook can never disagree
 * about which speeds exist. Both of those controls index `SPEED_LADDER` below for the ORDER a
 * slider needs; neither spells the ladder itself.
 */
export type GenPerSec = Settings['defaultSpeed'];

/**
 * The ladder as a runtime tuple, in slider order (Story 3.13, AR-34). The schema's union is a
 * type only — a slider needs positions, so this is the one place the order is written down.
 * Both directions hold at compile time: `satisfies` rejects a member the schema lacks, and
 * `MissingFromLadder` below rejects a schema member this tuple lacks. The schema stays the
 * authority (the head comment); this array is only the ORDER.
 */
export const SPEED_LADDER = [1, 2, 5, 10, 20] as const satisfies readonly GenPerSec[];

type MissingFromLadder = Exclude<GenPerSec, (typeof SPEED_LADDER)[number]>;
const ladderIsExhaustive: MissingFromLadder extends never ? true : never = true;
void ladderIsExhaustive;

/**
 * The ladder position of a speed — what a detented slider carries as its value (Story 3.13 FD1:
 * the mockup's own `min="0" max="4"` scheme). Typed input means the speed is always a member, so
 * there is no `-1` branch to handle.
 */
export function speedIndex(genPerSec: GenPerSec): number {
  return SPEED_LADDER.indexOf(genPerSec);
}

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
  // `Math.ceil`, so the result is an integer for ANY speed: the hook uses it as a modulus
  // (`cycle % divisor === 0`), and a fractional divisor — a ladder that one day gains 12 or 15 —
  // would publish on almost no cycle, or on none, with the "never above 10 Hz" test still green.
  // Rounding up keeps the bound; rounding down could break it.
  return Math.max(1, Math.ceil(genPerSec / 10));
}
