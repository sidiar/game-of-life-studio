import { describe, expect, it } from 'vitest';
import { cyclesPerPublish, msPerCycle, type GenPerSec } from './simulationSpeed';

// The FR-4.2 / FR-8.12 ladder, spelled once here as the test's expectation — the source of truth is
// `SettingsSchema.defaultSpeed` in @gol/domain, which `GenPerSec` derives from. If the ladder ever
// moves, this table is what fails, not the loop.
const LADDER: readonly GenPerSec[] = [1, 2, 5, 10, 20];

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

describe('cyclesPerPublish (M2, FD4)', () => {
  it('publishes every cycle at 1-10 gen/sec and every second cycle at 20', () => {
    expect(LADDER.map(cyclesPerPublish)).toEqual([1, 1, 1, 1, 2]);
  });

  it('never yields a publish rate above 10 Hz for any ladder speed', () => {
    for (const speed of LADDER) {
      expect(speed / cyclesPerPublish(speed)).toBeLessThanOrEqual(10);
    }
  });
});
