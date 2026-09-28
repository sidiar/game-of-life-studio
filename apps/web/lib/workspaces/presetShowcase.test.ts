/**
 * The showcase gate for the DEFAULT preset (Story 7.3, FR-9.2 rationale): the content a first-time
 * visitor lands on must look alive within ~5 seconds at default speed, and 7.3 gates 7.4's ship.
 * AC1 is unverifiable by the lockstep gate (`presetWorkspaces.test.ts` only proves the file
 * imports), so this reads the REAL shipped preset off disk, runs it through the real engine with
 * the composition `useSimulation.ts` uses, and asserts the contest is visible. A later edit that
 * kills the showcase goes red here. Only the default preset is held to this bar (7.7's catalogue
 * presets are not); a deliberate redesign of the default re-calibrates the floors in the same PR.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CONWAYS_CLASSIC, DEFAULT_SETTINGS, fromEnvelope } from '@gol/domain';
import type { Battle, Organism } from '@gol/domain';
import { validateImportFile } from '@gol/persistence';
import {
  compileSession,
  createGridBuffers,
  createRng,
  gridFromDense,
  stepGridBuffers,
} from '@gol/simulation';
import { PALETTE } from '@/lib/palette/paletteRegistry';
import { PRESET_MANIFEST_FILE } from './presetManifest';

const PRESETS_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'public',
  'workspaces',
);

/** "~5 seconds at default speed" is the spec (FR-9.2), so the horizon derives from the setting, never
 * a literal 50: a changed default speed changes what a visitor sees in 5 s. */
const SHOWCASE_CYCLES = 5 * DEFAULT_SETTINGS.defaultSpeed;

/** A fixed set. The tie-break RNG only draws on equal dominance, which the roster rules out
 * (asserted below), so the set proves determinism rather than sampling variety. */
const SEEDS = [1, 2, 3] as const;

/**
 * Colonies must TRADE territory (a cell held by organism A one cycle and B the next), not merely
 * abut. Measured over the horizon on the shipped content: Four Corners 267, Tug of War 109 (the
 * minimum across battles and seeds). Set at roughly half the minimum, so a content tweak has room
 * but a preset whose fronts never fight (a handful of transfers) fails.
 */
const MIN_TERRITORY_TRANSFERS = 50;

/**
 * No organism may hold more than this share of live cells at the horizon, so the visitor still
 * sees a contest. Measured maximum share: 45 % (Tug of War), 40 % (Four Corners); 90 % is the
 * runaway line, far from either.
 */
const MAX_LIVE_SHARE = 0.9;

interface Preset {
  battles: Battle[];
  organisms: Organism[];
  workspaceDescription: string | undefined;
}

function loadDefaultPreset(): Preset {
  const manifest = JSON.parse(readFileSync(join(PRESETS_DIR, PRESET_MANIFEST_FILE), 'utf8')) as {
    defaultPresetId: string;
    workspaces: { id: string; file: string }[];
  };
  const entry = manifest.workspaces.find((w) => w.id === manifest.defaultPresetId);
  if (!entry)
    throw new Error(`defaultPresetId "${manifest.defaultPresetId}" has no manifest entry`);
  const envelope = validateImportFile(readFileSync(join(PRESETS_DIR, entry.file), 'utf8'));
  const { battles, organisms, meta } = fromEnvelope(envelope);
  return { battles, organisms, workspaceDescription: meta.description };
}

const preset = loadDefaultPreset();
const organismsById = new Map(preset.organisms.map((o) => [o.id, o]));

interface Measurement {
  /** Live cells per roster organism at the horizon. */
  counts: number[];
  transfers: number;
}

/** Same composition as `useSimulation.ts`'s `createSession`: roster order, compileSession, one RNG. */
function runBattle(battle: Battle, seed: number): Measurement {
  const roster = battle.organismIds.map((id) => {
    const organism = organismsById.get(id);
    if (!organism)
      throw new Error(`battle "${battle.name}": organism ${id} missing from the preset`);
    return organism;
  });
  const compiled = compileSession(roster);
  let buffers = createGridBuffers(gridFromDense(battle.gridState));
  const deps = { ...compiled, organisms: roster, rng: createRng(seed) };
  let previous = Uint8Array.from(buffers.front.occupant);
  let transfers = 0;
  for (let cycle = 0; cycle < SHOWCASE_CYCLES; cycle++) {
    buffers = stepGridBuffers(buffers, deps);
    const current = buffers.front.occupant;
    for (let i = 0; i < current.length; i++) {
      if (previous[i] !== 0 && current[i] !== 0 && previous[i] !== current[i]) transfers++;
    }
    previous = Uint8Array.from(current);
  }
  const counts = new Array<number>(roster.length).fill(0);
  for (const value of previous) if (value !== 0) counts[value - 1]++;
  return { counts, transfers };
}

describe('default preset showcase (FR-9.2, Story 7.3)', () => {
  it('ships exactly two battles, one per editable grid preset', () => {
    const sizes = preset.battles.map((b) => `${b.gridSize.cols}x${b.gridSize.rows}`).sort();
    expect(sizes).toEqual(['100x60', '50x30']);
  });

  describe('content', () => {
    const others = preset.organisms.filter((o) => o.id !== CONWAYS_CLASSIC.id);

    it("carries Conway's Classic unmodified plus at least three other organisms", () => {
      expect(preset.organisms.find((o) => o.id === CONWAYS_CLASSIC.id)).toEqual(CONWAYS_CLASSIC);
      expect(others.length).toBeGreaterThanOrEqual(3);
    });

    it('uses distinct colours from the CVD-robust core (AR-26, palette gate G4)', () => {
      const core = PALETTE.slice(0, 8).map((c) => c.id);
      const tokens = preset.organisms.map((o) => o.colorToken);
      expect(new Set(tokens).size, `duplicate colorToken in ${tokens}`).toBe(tokens.length);
      for (const organism of preset.organisms) {
        expect(
          core,
          `"${organism.name}" colour "${organism.colorToken}" is outside the core`,
        ).toContain(organism.colorToken);
      }
    });

    it('uses distinct dominance values so no cycle depends on the tie-break RNG', () => {
      const values = preset.organisms.map((o) => o.dominance);
      expect(new Set(values).size, `duplicate dominance in ${values}`).toBe(values.length);
    });

    it('describes the workspace, every battle and every organism (FR-9.5)', () => {
      expect(preset.workspaceDescription?.trim(), 'workspace description').toBeTruthy();
      for (const battle of preset.battles) {
        expect(battle.description?.trim(), `battle "${battle.name}" description`).toBeTruthy();
      }
      // Conway's Classic is the stock record: M9 protects it unmodified and it carries no
      // description, so the battle and workspace descriptions explain it instead.
      for (const organism of others) {
        expect(
          organism.description?.trim(),
          `organism "${organism.name}" description`,
        ).toBeTruthy();
      }
    });

    it('places every roster organism in at least one battle, and Conway in at least one', () => {
      const placed = new Set(preset.battles.flatMap((b) => b.organismIds));
      for (const organism of preset.organisms) {
        expect(placed.has(organism.id), `"${organism.name}" is in no battle`).toBe(true);
      }
    });
  });

  // A static loop over the preset's own battles, not it.each over a folder: a vacuous zero-case
  // loop must not pass.
  for (const battle of preset.battles) {
    describe(`battle "${battle.name}" over ${SHOWCASE_CYCLES} cycles`, () => {
      for (const seed of SEEDS) {
        it(`shows a live contest (seed ${seed})`, () => {
          const { counts, transfers } = runBattle(battle, seed);
          const where = `battle "${battle.name}", seed ${seed}`;
          const total = counts.reduce((a, b) => a + b, 0);
          expect(total, `${where}: the grid emptied`).toBeGreaterThan(0);
          battle.organismIds.forEach((id, index) => {
            const name = organismsById.get(id)?.name ?? id;
            expect(counts[index], `${where}: "${name}" has no cells left`).toBeGreaterThan(0);
            expect(
              counts[index] / total,
              `${where}: "${name}" holds ${counts[index]} of ${total} live cells`,
            ).toBeLessThanOrEqual(MAX_LIVE_SHARE);
          });
          expect(
            transfers,
            `${where}: only ${transfers} territory transfers (need ${MIN_TERRITORY_TRANSFERS})`,
          ).toBeGreaterThanOrEqual(MIN_TERRITORY_TRANSFERS);
        });
      }
    });
  }
});
