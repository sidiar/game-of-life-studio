import { CONWAYS_CLASSIC, CONWAYS_CLASSIC_ID } from '@gol/domain';
import { describe, expect, it } from 'vitest';
import {
  BENCHMARK_GATED_PRESET,
  BENCHMARK_PRESETS,
  BENCHMARK_RUN_OPTIONS,
  createBenchmarkFill,
  createBenchmarkRoster,
} from './benchmarkRoster';
import { MOCK_ORGANISM_IDS } from './mockWorkspace';
import { createSeededRng, FIXED_SEED } from './seededRng';

/**
 * These are not ordinary fixture tests. Every number asserted here is a PARAMETER OF THE STORY 3.7
 * PERFORMANCE GATE: Phase 2 costs `cells x organisms x rules-until-first-match`, so a future story
 * that quietly makes this roster cheaper moves a budget without touching the budget. The gate
 * measures what this file describes; when one of these assertions has to change, the benchmark
 * report (`docs/implementation-artifacts/performance-baseline-validation.md`) is stale and the
 * measured baseline has to be retaken.
 */
describe('createBenchmarkRoster — the AR-43 20-organism fixture', () => {
  const roster = createBenchmarkRoster(20);

  it('has exactly 20 organisms and 50 rules across them', () => {
    expect(roster).toHaveLength(20);
    const totalRules = roster.reduce((sum, organism) => sum + organism.survivalRules.length, 0);
    // 5 cycles of the 2/3/3/2 template set. THE gate parameter: 20 organisms x 2 rules would be
    // the cheapest legal reading of AR-43 and would measure a materially easier battle.
    expect(totalRules).toBe(50);
    expect(roster.map((organism) => organism.survivalRules.length)).toEqual([
      2, 3, 3, 2, 2, 3, 3, 2, 2, 3, 3, 2, 2, 3, 3, 2, 2, 3, 3, 2,
    ]);
  });

  it('keeps every organism id distinct, and keeps the four template ids in the roster', () => {
    expect(new Set(roster.map((organism) => organism.id)).size).toBe(20);
    const ids = roster.map((organism) => organism.id);
    // Chaotic Spreader's born rule targets Aggressive Colonizer's LIBRARY id (Decision E). If the
    // target is not in the battle it interns to NO_MATCH_REF and the rule never fires, which makes
    // every Chaotic clone both cheaper and semantically different from its template (Decision E.3).
    expect(ids).toContain(CONWAYS_CLASSIC_ID);
    expect(ids).toContain(MOCK_ORGANISM_IDS.aggressiveColonizer);
    expect(ids).toContain(MOCK_ORGANISM_IDS.patientDefender);
    expect(ids).toContain(MOCK_ORGANISM_IDS.chaoticSpreader);
  });

  it('gives every organism a distinct contentHash set, so the evaluator cache cannot collapse it', () => {
    // Decision E.4's cache key is the ordered join of a rule list's contentHashes. Duplicated
    // hashes would compile 20 organisms into 4 shared evaluator pairs — a roster of 20 that runs
    // like a roster of 4.
    const keys = roster.map((organism) =>
      JSON.stringify(organism.survivalRules.map((rule) => rule.contentHash)),
    );
    expect(new Set(keys).size).toBe(20);
    const hashes = roster.flatMap((organism) =>
      organism.survivalRules.map((rule) => rule.contentHash),
    );
    expect(new Set(hashes).size).toBe(50);
  });

  it('gives every organism a distinct dominance inside FR-2.2, so Phase 3 never draws from the RNG', () => {
    const dominances = roster.map((organism) => organism.dominance);
    expect(new Set(dominances).size).toBe(20);
    for (const dominance of dominances) {
      expect(dominance).toBeGreaterThanOrEqual(1);
      expect(dominance).toBeLessThanOrEqual(100);
    }
  });

  it('gives every organism a distinct colorToken, so the repaint half sees the real group count', () => {
    // Decision B.2 batches by (colorToken, min(age, 7)); duplicate tokens FOLD into one group, so
    // a 4-token roster would understate `groupByColourState`'s work by a factor of five.
    expect(new Set(roster.map((organism) => organism.colorToken)).size).toBe(20);
  });

  it('carries at least one aging-enabled organism, and exactly 10 explicit die rules', () => {
    expect(roster.some((organism) => organism.agingEnabled)).toBe(true);
    const dieRules = roster.flatMap((organism) =>
      organism.survivalRules.filter((rule) => rule.payload.action === 'die'),
    );
    // Phase 1 is only non-trivial for organisms that HAVE a die rule; a roster of pure Conway
    // clones would make `deathPhase` a measurement of nothing.
    expect(dieRules.length).toBe(10);
  });

  it('rejects a size outside the fixture bounds', () => {
    expect(() => createBenchmarkRoster(0)).toThrow(/size must be an integer in 1\.\.20/);
    expect(() => createBenchmarkRoster(21)).toThrow(/size must be an integer in 1\.\.20/);
    expect(() => createBenchmarkRoster(2.5)).toThrow(/size must be an integer in 1\.\.20/);
  });

  it('does not share rule objects — or `range` tuples — with its templates or between calls', () => {
    const other = createBenchmarkRoster(20);
    expect(other[0].survivalRules[0]).not.toBe(roster[0].survivalRules[0]);
    expect(other[0].survivalRules[0]).toEqual(roster[0].survivalRules[0]);
    // Against the TEMPLATE, which the old assertion never compared: Conway's Classic is
    // deep-frozen, and a shallow condition spread would leave every clone holding the template's
    // own `[2, 3]` — a write to it throws, and a write to one clone's tuple rewrites four siblings
    // (Story 3.7 code review).
    const templateRange = CONWAYS_CLASSIC.survivalRules
      .flatMap((rule) => rule.conditions)
      .find((condition) => Array.isArray(condition.pattern));
    const clonedRange = roster[0].survivalRules
      .flatMap((rule) => rule.conditions)
      .find((condition) => Array.isArray(condition.pattern));
    expect(templateRange).toBeDefined();
    expect(clonedRange).toBeDefined();
    expect(clonedRange?.pattern).not.toBe(templateRange?.pattern);
    expect(clonedRange?.pattern).toEqual(templateRange?.pattern);
    expect(Object.isFrozen(clonedRange?.pattern)).toBe(false);
  });
});

describe('the preset table and run options — the other gate parameters', () => {
  it('labels every preset as its own cols x rows, and the gated label is in the table', () => {
    // `scripts/check-bench-budget.mjs` names the gated task by LABEL (`step 100x60 x20`); a label
    // that disagreed with its dimensions would gate a grid nobody meant to gate. Nothing else reads
    // BENCHMARK_PRESETS against BENCHMARK_GATED_PRESET (Story 3.7 code review).
    for (const preset of BENCHMARK_PRESETS) {
      expect(preset.label).toBe(`${preset.cols}x${preset.rows}`);
    }
    expect(BENCHMARK_PRESETS.map((preset) => preset.label)).toContain(BENCHMARK_GATED_PRESET);
    expect(BENCHMARK_GATED_PRESET).toBe('100x60');
  });

  it('pins the run options both summed benches use — exact counts, never a time budget', () => {
    // `time: 0` + an exact iteration count is what makes the cycle count a property of the
    // fixture rather than of the machine (AC2). Both workspaces' benches import this one object.
    expect(BENCHMARK_RUN_OPTIONS).toEqual({
      time: 0,
      iterations: 100,
      warmupTime: 0,
      warmupIterations: 25,
    });
    expect(Object.isFrozen(BENCHMARK_RUN_OPTIONS)).toBe(true);
  });
});

describe('createBenchmarkFill', () => {
  it('is deterministic for a given seed and dimensions', () => {
    const a = createBenchmarkFill(50, 30, 20, 300, createSeededRng(FIXED_SEED));
    const b = createBenchmarkFill(50, 30, 20, 300, createSeededRng(FIXED_SEED));
    expect(a).toEqual(b);
  });

  it('emits only refs in 0..rosterSize at the requested dimensions', () => {
    const fill = createBenchmarkFill(100, 60, 20, 300, createSeededRng(FIXED_SEED));
    expect(fill).toHaveLength(60);
    expect(fill[0]).toHaveLength(100);
    const values = new Set(fill.flat());
    for (const value of values) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(20);
    }
  });

  it('lands near the requested density', () => {
    const fill = createBenchmarkFill(100, 60, 20, 300, createSeededRng(FIXED_SEED));
    const occupied = fill.flat().filter((value) => value !== 0).length;
    // 30% of 6,000 = 1,800. A generous window: the point is that the fixture is neither empty nor
    // full, not that the generator hits a target exactly.
    expect(occupied).toBeGreaterThan(1500);
    expect(occupied).toBeLessThan(2100);
  });
});
