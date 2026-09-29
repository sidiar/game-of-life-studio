/**
 * The catalogue gate for every shipped preset (Story 7.7, FR-9.1, FR-9.5, NFR-1.1). The lockstep
 * gate (`presetWorkspaces.test.ts`) proves each file imports; this proves the content clears the
 * catalogue bar: fully described, within the NFR-1.1 organism cap, no dead weight, alive. It reads
 * the REAL shipped files off disk (no fixtures), so a later edit that breaks a preset goes red here.
 * Only the default preset is also held to the showcase bar (`presetShowcase.test.ts`).
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
import { PRESET_MANIFEST_FILE } from './presetManifest';

const PRESETS_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'public',
  'workspaces',
);

/** NFR-1.1 guarantees 60 FPS at 100x60 with up to 20 co-placed organisms; beyond that it promises
 * only graceful degradation (Story 7.7 FD3), so a catalogue battle never places more. */
const NFR_1_1_MAX_ORGANISMS = 20;

/** The same "~5 seconds at default speed" horizon the showcase gate derives (FR-9.2). */
const LIVENESS_CYCLES = 5 * DEFAULT_SETTINGS.defaultSpeed;
const LIVENESS_SEED = 1;

interface ManifestFile {
  defaultPresetId: string;
  workspaces: { id: string; file: string }[];
}
interface Preset {
  id: string;
  battles: Battle[];
  organisms: Organism[];
  workspaceDescription: string | undefined;
}

const manifest = JSON.parse(
  readFileSync(join(PRESETS_DIR, PRESET_MANIFEST_FILE), 'utf8'),
) as ManifestFile;

const presets: Preset[] = manifest.workspaces.map((entry) => {
  const envelope = validateImportFile(readFileSync(join(PRESETS_DIR, entry.file), 'utf8'));
  const { battles, organisms, meta } = fromEnvelope(envelope);
  return { id: entry.id, battles, organisms, workspaceDescription: meta.description };
});

/** Live-cell count after `cycles` steps: the FD5 composition `useSimulation.ts` uses. */
function liveCellsAfter(battle: Battle, organisms: Organism[], cycles: number): number {
  const byId = new Map(organisms.map((o) => [o.id, o]));
  const roster = battle.organismIds.map((id) => {
    const organism = byId.get(id);
    if (!organism) throw new Error(`battle "${battle.name}": organism ${id} missing`);
    return organism;
  });
  const compiled = compileSession(roster);
  let buffers = createGridBuffers(gridFromDense(battle.gridState));
  const deps = { ...compiled, organisms: roster, rng: createRng(LIVENESS_SEED) };
  for (let cycle = 0; cycle < cycles; cycle++) buffers = stepGridBuffers(buffers, deps);
  let live = 0;
  for (const value of buffers.front.occupant) if (value !== 0) live++;
  return live;
}

describe('preset catalogue (Story 7.7)', () => {
  it('ships the default plus at least three catalogue presets, and never re-points the default silently', () => {
    expect(manifest.workspaces.length).toBeGreaterThanOrEqual(4);
    // Re-pointing the default is a deliberate act (7.7 FD6) that edits this line.
    expect(manifest.defaultPresetId).toBe('colony-clash');
  });

  for (const preset of presets) {
    describe(`preset "${preset.id}"`, () => {
      it('ships at least one battle (every per-battle gate below would pass vacuously on none)', () => {
        expect(preset.battles.length, `${preset.id}: ships no battles`).toBeGreaterThan(0);
      });

      it('describes the workspace, every battle and every organism (FR-9.5)', () => {
        expect(
          preset.workspaceDescription?.trim(),
          `${preset.id}: workspace description`,
        ).toBeTruthy();
        for (const battle of preset.battles) {
          expect(
            battle.description?.trim(),
            `${preset.id}: battle "${battle.name}" description`,
          ).toBeTruthy();
        }
        for (const organism of preset.organisms) {
          expect(
            organism.description?.trim(),
            `${preset.id}: organism "${organism.name}" description`,
          ).toBeTruthy();
        }
      });

      it("carries Conway's Classic unmodified when it ships one (M9)", () => {
        const conway = preset.organisms.find((o) => o.id === CONWAYS_CLASSIC.id);
        if (conway)
          expect(conway, `${preset.id}: Conway's Classic was modified`).toEqual(CONWAYS_CLASSIC);
      });

      it('places at most the NFR-1.1 organism cap in every battle', () => {
        for (const battle of preset.battles) {
          expect(
            battle.organismIds.length,
            `${preset.id}: battle "${battle.name}" places too many organisms`,
          ).toBeLessThanOrEqual(NFR_1_1_MAX_ORGANISMS);
        }
      });

      it("places every non-Conway organism in at least one battle (Conway's is exempt: import re-seeds it)", () => {
        const placed = new Set(preset.battles.flatMap((b) => b.organismIds));
        for (const organism of preset.organisms) {
          if (organism.id === CONWAYS_CLASSIC.id) continue;
          expect(placed.has(organism.id), `${preset.id}: "${organism.name}" is in no battle`).toBe(
            true,
          );
        }
      });

      it('uses distinct colours within each battle', () => {
        const byId = new Map(preset.organisms.map((o) => [o.id, o]));
        for (const battle of preset.battles) {
          const tokens = battle.organismIds.map((id) => byId.get(id)?.colorToken);
          expect(
            new Set(tokens).size,
            `${preset.id}: battle "${battle.name}" repeats a colour in ${tokens}`,
          ).toBe(tokens.length);
        }
      });
    });
  }

  // Liveness for the catalogue (every non-default preset): dead content fails. A static loop, not
  // it.each over a folder: the manifest assertion above needs >= 4 entries and the per-preset one
  // needs >= 1 battle each, so neither loop can run zero cases and pass.
  for (const preset of presets) {
    if (preset.id === manifest.defaultPresetId) continue;
    for (const battle of preset.battles) {
      it(`"${preset.id}" battle "${battle.name}" never empties the grid in ${LIVENESS_CYCLES} cycles`, () => {
        expect(
          liveCellsAfter(battle, preset.organisms, LIVENESS_CYCLES),
          `${preset.id}: battle "${battle.name}" emptied`,
        ).toBeGreaterThan(0);
      });
    }
  }
});
