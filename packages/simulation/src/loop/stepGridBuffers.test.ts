// FD2, AC9 — the composition that answers "who holds the buffers, when do they swap": this file
// pins that the swap happens immediately, that the source is never mutated, and that the default
// strategy is `activeStrategy` (no separate golden suite here; `threePhaseStep.test.ts` already
// owns Conway correctness — one blinker cycle is enough to prove the WIRING).
import { CONWAYS_CLASSIC, createSeededRng, FIXED_SEED, gridFromPattern } from '@gol/test-utils';
import { describe, expect, it } from 'vitest';

import { createGridBuffers } from '../grid/doubleBuffer';
import { createGrid, gridFromDense, gridToDense } from '../grid/grid';
import { compileSession } from '../session/compileEvaluators';
import type { SimulationDeps, SimulationStrategy } from '../strategy/threePhaseStep';
import { stepGridBuffers } from './stepGridBuffers';

const LEGEND = { '.': 0, '#': 1 };

describe('stepGridBuffers composes the strategy call with the swap (FD2, AC9)', () => {
  it("the returned pair's front IS the old back, holding what the strategy wrote", () => {
    const front = createGrid(2, 2);
    const buffers = createGridBuffers(front);
    const deps = {} as SimulationDeps;
    const seen: { source: unknown; destination: unknown; deps: unknown }[] = [];
    const writesMarker: SimulationStrategy = (source, destination, receivedDeps) => {
      seen.push({ source, destination, deps: receivedDeps });
      destination.occupant.set([9, 9, 9, 9]);
      return destination;
    };

    const result = stepGridBuffers(buffers, deps, writesMarker);

    // The strategy is handed exactly (front, back, deps) — the same objects, not copies.
    expect(seen).toEqual([{ source: front, destination: buffers.back, deps }]);
    expect(seen[0]?.deps).toBe(deps);
    expect(result.front).toBe(buffers.back);
    expect(Array.from(result.front.occupant)).toEqual([9, 9, 9, 9]);
    // The old front is reused as the new scratch buffer — no allocation, per Decision A.6.
    expect(result.back).toBe(front);
  });

  it('throws when the strategy returns a grid other than the destination it was given', () => {
    // An allocating strategy would otherwise have its result discarded and the swap would promote
    // an unwritten `back` — the grid from two cycles ago — with nothing thrown.
    const buffers = createGridBuffers(createGrid(2, 2));
    const allocates: SimulationStrategy = () => createGrid(2, 2);

    expect(() => stepGridBuffers(buffers, {} as SimulationDeps, allocates)).toThrow(
      /must write and return the destination/,
    );
  });

  it('leaves the old front byte-identical — the strategy never writes its source', () => {
    const front = gridFromDense(gridFromPattern(['.#', '#.'], LEGEND));
    front.age.set([0, 3, 3, 0]);
    const occupantBefore = Array.from(front.occupant);
    const ageBefore = Array.from(front.age);
    const buffers = createGridBuffers(front);

    stepGridBuffers(buffers, {} as SimulationDeps, (_source, destination) => destination);

    expect(Array.from(front.occupant)).toEqual(occupantBefore);
    expect(Array.from(front.age)).toEqual(ageBefore);
  });

  it('the pair value is fresh; the caller holding the old pair still sees the pre-swap roles', () => {
    const front = createGrid(2, 2);
    const before = createGridBuffers(front);

    const after = stepGridBuffers(
      before,
      {} as SimulationDeps,
      (_source, destination) => destination,
    );

    expect(after).not.toBe(before);
    // Unaffected — swapGridBuffers never mutates its argument: both roles, not just `front`.
    expect(before.front).toBe(front);
    expect(before.back).toBe(after.front);
  });

  it('defaults to activeStrategy: one blinker cycle turns vertical into horizontal', () => {
    const front = gridFromDense(gridFromPattern(['...', '###', '...'], LEGEND));
    const buffers = createGridBuffers(front);
    const deps: SimulationDeps = {
      ...compileSession([CONWAYS_CLASSIC]),
      organisms: [{ dominance: CONWAYS_CLASSIC.dominance }],
      rng: createSeededRng(FIXED_SEED),
    };

    const result = stepGridBuffers(buffers, deps);

    expect(gridToDense(result.front)).toEqual(gridFromPattern(['.#.', '.#.', '.#.'], LEGEND));
  });
});
