import { describe, expect, it } from 'vitest';
import {
  SPEED_LADDER,
  cyclesPerPublish,
  msPerCycle,
  speedIndex,
  type GenPerSec,
} from './simulationSpeed';

// Story 3.13 (AC3): `SPEED_LADDER` is the runtime ladder and the test's expectation is the ladder
// itself — the schema (`SettingsSchema.defaultSpeed`) stays the authority through the `satisfies`
// + exhaustiveness pair in the module, so a second spelling of `[1, 2, 5, 10, 20]` here would only
// be a place for the two to disagree. Its LENGTH is owned by the type-level check; the `toEqual`
// tables below (`msPerCycle`, `cyclesPerPublish`) also fail on a sixth member, incidentally —
// they pin each member's VALUE, and would need a new row either way.
const LADDER: readonly GenPerSec[] = SPEED_LADDER;

describe('msPerCycle (Decision D.1)', () => {
  it('maps the five ladder speeds to 1000/500/200/100/50 ms', () => {
    expect(LADDER.map(msPerCycle)).toEqual([1000, 500, 200, 100, 50]);
  });

  it('stays inside the 50 <= ms <= 1000 band the loop trusts without re-validating', () => {
    for (const speed of LADDER) {
      const ms = msPerCycle(speed);
      expect(ms).toBeGreaterThanOrEqual(50);
      expect(ms).toBeLessThanOrEqual(1000);
    }
  });
});

describe('SPEED_LADDER and speedIndex (Story 3.13, AR-34)', () => {
  // A slider indexes this array by position, so the ORDER is the contract: a ladder that is not
  // strictly ascending would have ArrowRight slow the run down somewhere in the middle.
  it('is strictly ascending', () => {
    for (let i = 1; i < SPEED_LADDER.length; i++) {
      expect(SPEED_LADDER[i]).toBeGreaterThan(SPEED_LADDER[i - 1]);
    }
  });

  // Decision D.2: the fastest ladder speed is one cycle per 60 FPS frame (50 ms ≥ 16.7 ms) and
  // the slowest is one per second — the band `createSimulationLoop` trusts without re-validating.
  // Pinned on the runtime ladder (not just the type) because the slider can only ever select a
  // member of THIS array.
  it('every member maps to a period inside the [50, 1000] ms band (Decision D.2)', () => {
    for (const speed of SPEED_LADDER) {
      expect(msPerCycle(speed)).toBeGreaterThanOrEqual(50);
      expect(msPerCycle(speed)).toBeLessThanOrEqual(1000);
    }
    expect(msPerCycle(SPEED_LADDER[SPEED_LADDER.length - 1])).toBe(50);
  });

  it('speedIndex round-trips every member through SPEED_LADDER', () => {
    SPEED_LADDER.forEach((speed, position) => {
      expect(speedIndex(speed)).toBe(position);
      expect(SPEED_LADDER[speedIndex(speed)]).toBe(speed);
    });
  });

  it('places the default 10 gen/sec at index 3', () => {
    expect(speedIndex(10)).toBe(3);
  });
});

describe('cyclesPerPublish (M2, FD4)', () => {
  it('publishes every cycle at 1-10 gen/sec and every second cycle at 20', () => {
    expect(LADDER.map(cyclesPerPublish)).toEqual([1, 1, 1, 1, 2]);
  });

  it('never yields a publish rate above 10 Hz for any ladder speed', () => {
    for (const speed of LADDER) {
      expect(speed / cyclesPerPublish(speed)).toBeLessThanOrEqual(10);
    }
  });

  it('is an integer for every ladder speed — the hook uses it as a modulus', () => {
    for (const speed of LADDER) {
      expect(Number.isInteger(cyclesPerPublish(speed))).toBe(true);
    }
  });

  it('rounds a hypothetical off-ladder speed UP, keeping the cadence integral and <= 10 Hz', () => {
    // 15 gen/sec is not on the ladder; if it ever is, `15 / 10 = 1.5` as a modulus would publish
    // only on cycles 3, 6, 9... — ceil makes it every second cycle (7.5 Hz).
    const offLadder = 15 as number as GenPerSec;
    expect(cyclesPerPublish(offLadder)).toBe(2);
  });
});
