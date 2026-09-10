import { CONWAYS_CLASSIC, type Organism, type SurvivalRule } from '@gol/domain';
import { createMockOrganisms } from './mockWorkspace';

/**
 * The AR-43 benchmark roster: a full-size, realistic organism set for Story 3.7's `vitest bench`
 * harness — and for the later stories that want the same thing (3.9's batch rendering, 3.16's
 * Play-mode resize, 4.15's preview).
 *
 * ⚠️ THIS FIXTURE'S SHAPE IS A GATE PARAMETER, not a test detail. Phase 2 costs
 * `cells x organisms x rules-until-first-match`, so swapping this for cheaper organisms silently
 * loosens the NFR-1.1 performance gate that measures against it. `benchmarkRoster.test.ts` pins
 * every number the gate depends on — total rule count included — so a change here fails a test
 * rather than quietly moving a budget. `docs/implementation-artifacts/performance-baseline-validation.md`
 * restates the same numbers as the measured fixture's declared shape.
 */

/**
 * The four grid presets (Decision A, H-9) the harness iterates. DATA, not four copy-pasted bench
 * bodies: grid dimensions are parameters through this repo, never constants.
 *
 * ⚠️ Only `100x60` is gated (AR-43). The other three are measured and recorded — Decision A.4 says
 * the larger grids degrade gracefully by design, and RFC-008 Risk 6 says their numbers are
 * environment-sensitive.
 */
export const BENCHMARK_PRESETS: readonly { label: string; cols: number; rows: number }[] = [
  { label: '50x30', cols: 50, rows: 30 },
  { label: '100x60', cols: 100, rows: 60 },
  { label: '150x90', cols: 150, rows: 90 },
  { label: '200x120', cols: 200, rows: 120 },
];

/** The preset NFR-1.1 names, and the only one the CI gate fails on (AR-43). */
export const BENCHMARK_GATED_PRESET = '100x60';

/** AR-43's "up to 20 organisms". */
export const BENCHMARK_ROSTER_SIZE = 20;

/** 30% occupancy — see `createBenchmarkFill` on why the number matters to the repaint half only. */
export const BENCHMARK_FILL_PERMILLE = 300;

// The four canonical organisms, in roster order. Conway's Classic first (FR-1.5), then the three
// AR-45 mocks — a deliberately MIXED set: 2/3/3/2 rules, five distinct condition properties, all
// six operators, one aging-enabled organism and one `organismType` cross-reference. A roster of 20
// Conway clones would be the cheapest legal reading of AR-43's "20 organisms" and would make the
// gate measure the easiest possible battle.
function templates(): Organism[] {
  return [CONWAYS_CLASSIC, ...createMockOrganisms()];
}

// Every id in RFC-007's palette registry, in registry order. Duplicated as string literals because
// @gol/test-utils cannot import apps/web's registry (it is DOM-adjacent app code, and this package
// is consumed by packages/* too). An unknown token is NOT loud — `buildRefToFillGroup` falls back
// to the default token with a warn-once, which would silently collapse the fixture's fill groups
// and understate the repaint half of the measurement. `apps/web/lib/palette/paletteTokenUsage.test.ts`
// is the guard that keeps this list honest; it already covers the other two fixture sources.
const BENCHMARK_COLOR_TOKENS: readonly string[] = [
  'sky-blue',
  'vermillion',
  'bluish-green',
  'amber',
  'reddish-purple',
  'yellow',
  'azure',
  'coral-red',
  'teal',
  'violet',
  'lime',
  'magenta',
  'cyan',
  'tangerine',
  'indigo',
  'mint',
  'rose',
  'chartreuse',
  'lavender',
  'periwinkle',
];

/**
 * ⚠️ A DISTINCT `contentHash` PER ORGANISM, deliberately. The Decision E.4 evaluator cache is keyed
 * on the ordered join of a rule list's `contentHash`es (`compileEvaluators.ts`), so 20 organisms
 * cloned with their template's hashes intact would compile to FOUR shared evaluator pairs, not 20 —
 * a roster of 20 that runs like a roster of 4 at the call site, and a benchmark measuring a
 * cheaper battle than the one it claims. The hash is opaque by contract (AR-21) and never parsed,
 * so a synthetic value is legal; these organisms are in-memory only and never persisted.
 */
function distinctiveRule(rule: SurvivalRule, rosterIndex: number, ruleIndex: number): SurvivalRule {
  return {
    ...rule,
    id: `bench-rule-${rosterIndex}-${ruleIndex}`,
    contentHash: `bench-hash-${rosterIndex}-${ruleIndex}`,
    // Deep enough for the compile step: `internRule` rebuilds every condition and pattern anyway,
    // but the caller may hold this roster across runs and the templates are frozen fixture data.
    conditions: rule.conditions.map((condition) => ({ ...condition })),
    payload: { ...rule.payload },
  };
}

/**
 * `size` organisms built by cycling the four canonical templates.
 *
 * ⚠️ THE FIRST FOUR KEEP THEIR ORIGINAL IDS, and that is load-bearing rather than tidy. Chaotic
 * Spreader's born rule is `organismType eq mock-aggressive-colonizer` — a persisted LIBRARY id
 * (Decision E). Cloning every organism under a fresh id would leave that target absent from the
 * battle, so `compileSession` interns it to `NO_MATCH_REF` and the rule can never fire: the clone
 * becomes both semantically different and CHEAPER than the organism it was copied from (Decision
 * E.3, Story 3.4). Keeping the templates' own ids in the roster keeps every cross-reference live.
 *
 * @throws Error when `size` is outside 1..20 — `dominance` is FR-2.2's 1..100 and every organism
 *   here gets a distinct value so Phase 3 never needs the tie-break RNG, and the colour tokens
 *   are RFC-007's 20. Neither bound is a limitation of the roster's shape; both are the point at
 *   which this fixture would stop being the thing it claims to be.
 */
export function createBenchmarkRoster(size: number): Organism[] {
  const palette = BENCHMARK_COLOR_TOKENS;
  if (!Number.isInteger(size) || size < 1 || size > palette.length) {
    throw new Error(
      `createBenchmarkRoster: size must be an integer in 1..${palette.length}, got ${size}`,
    );
  }

  const base = templates();
  const roster: Organism[] = [];
  for (let index = 0; index < size; index++) {
    const template = base[index % base.length];
    roster.push({
      ...template,
      id: index < base.length ? template.id : `bench-organism-${index}`,
      name: `${template.name} #${index}`,
      colorToken: palette[index],
      // Distinct, so Phase 3's "highest Dominance wins" never falls through to the FR-5.4 tie-break
      // RNG: a benchmark whose conflict resolution consumes a different number of random draws per
      // run is not a baseline. 1..size, all inside FR-2.2's 1..100.
      dominance: index + 1,
      agingEnabled: template.agingEnabled,
      survivalRules: template.survivalRules.map((rule, ruleIndex) =>
        distinctiveRule(rule, index, ruleIndex),
      ),
    });
  }
  return roster;
}

/**
 * A deterministic dense `gridState` for the benchmark, at any dimensions (Decision A: grid
 * dimensions are parameters, never constants).
 *
 * Dense `number[][]`, not a typed `Grid`: @gol/test-utils depends on @gol/domain alone and must
 * not reach into @gol/simulation (the same call `seededRng.ts` records for the `Rng` type). The
 * caller converts with `gridFromDense`.
 *
 * ⚠️ Occupancy is NOT the cost driver, measured (story Dev Notes): Phase 2 evaluates every organism
 * against every cell whatever the fill, so 0% and 90% cost within ~5% of each other. The fill is
 * pinned anyway because the REPAINT half does care — `groupByColourState` walks the same cells but
 * only allocates for occupied ones.
 *
 * @param fillPermille occupied cells per thousand, so the fixture's density is stated as an integer
 *   rather than a float nobody can reproduce exactly.
 * @param rng the seeded generator — `createSeededRng(FIXED_SEED)` here, `createRng` in production.
 *   Typed structurally for the same reason `createSeededRng`'s return type is: this package must
 *   not declare a competing `Rng`, which @gol/simulation owns.
 */
export function createBenchmarkFill(
  cols: number,
  rows: number,
  rosterSize: number,
  fillPermille: number,
  rng: { int(maxExclusive: number): number },
): number[][] {
  const grid: number[][] = [];
  for (let row = 0; row < rows; row++) {
    const line: number[] = [];
    for (let col = 0; col < cols; col++) {
      // ref = roster index + 1 (M14); 0 is the reserved empty value.
      line.push(rng.int(1000) < fillPermille ? 1 + rng.int(rosterSize) : 0);
    }
    grid.push(line);
  }
  return grid;
}
