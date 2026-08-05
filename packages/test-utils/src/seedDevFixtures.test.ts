import { describe, expect, it } from 'vitest';
import { CONWAYS_CLASSIC } from '@gol/domain';
import { createFakeRepositories } from './fakeRepositories';
import { MOCK_BATTLE_IDS, MOCK_ORGANISM_IDS } from './mockWorkspace';
import { seedDevFixtures } from './seedDevFixtures';

describe('seedDevFixtures', () => {
  it('seeding an empty workspace writes 3 organisms and 2 battles', async () => {
    const repos = createFakeRepositories();

    await seedDevFixtures(repos);

    expect(await repos.organisms.list()).toHaveLength(3);
    expect(await repos.battles.list()).toHaveLength(2);
  });

  it('writes the exact mock organism and battle ids', async () => {
    const repos = createFakeRepositories();

    await seedDevFixtures(repos);

    const organismIds = (await repos.organisms.list()).map((o) => o.id).sort();
    expect(organismIds).toEqual(
      [
        MOCK_ORGANISM_IDS.aggressiveColonizer,
        MOCK_ORGANISM_IDS.patientDefender,
        MOCK_ORGANISM_IDS.chaoticSpreader,
      ].sort(),
    );

    const battleIds = (await repos.battles.list()).map((b) => b.id).sort();
    expect(battleIds).toEqual([MOCK_BATTLE_IDS.battleA, MOCK_BATTLE_IDS.battleB].sort());
  });

  // The referential-integrity assertion: this is the test that would catch Battle B referencing
  // Conway's Classic when Conway has not been seeded into the same repos.
  it("every battle's organismIds resolves against the organism store after seeding + Conway", async () => {
    const repos = createFakeRepositories();
    // Mirrors the real call order in useWorkspaceSeed.ts: seedDefaultWorkspace() (Conway) runs
    // before seedDevFixtures().
    await repos.organisms.save(CONWAYS_CLASSIC);

    await seedDevFixtures(repos);

    const battles = await repos.battles.listFull();
    for (const battle of battles) {
      for (const organismId of battle.organismIds) {
        expect(await repos.organisms.exists(organismId)).toBe(true);
      }
    }
  });

  it('stamps the workspace as no longer fresh', async () => {
    const repos = createFakeRepositories();

    await seedDevFixtures(repos);

    expect(await repos.isFreshWorkspace()).toBe(false);
  });
});
