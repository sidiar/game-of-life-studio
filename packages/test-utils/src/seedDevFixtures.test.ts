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

  // The referential-integrity assertion, run against the real call order in useWorkspaceSeed.ts:
  // seedDefaultWorkspace() (Conway) before seedDevFixtures(). The length assertions are load-
  // bearing — without them the loops below pass vacuously against zero battles or an empty roster,
  // which is the exact break they exist to catch.
  it("every battle's organismIds resolves against the organism store after seeding + Conway", async () => {
    const repos = createFakeRepositories();
    await repos.organisms.save(CONWAYS_CLASSIC);

    await seedDevFixtures(repos);

    const battles = await repos.battles.listFull();
    expect(battles).toHaveLength(2);
    for (const battle of battles) {
      expect(battle.organismIds.length).toBeGreaterThan(0);
      for (const organismId of battle.organismIds) {
        expect(await repos.organisms.exists(organismId)).toBe(true);
      }
    }
  });

  // The negative half, and the case the assertion above cannot reach: seedDevFixtures() documents
  // that it does not seed Conway itself, so Battle B's roster dangles whenever the caller
  // skipped seedDefaultWorkspace(). Pinning it here is what makes the ordering requirement in
  // useWorkspaceSeed.ts a tested contract rather than a comment.
  it("Battle B's Conway reference dangles when seeded without seedDefaultWorkspace() first", async () => {
    const repos = createFakeRepositories();

    await seedDevFixtures(repos);

    const battles = await repos.battles.listFull();
    const battleB = battles.find((b) => b.id === MOCK_BATTLE_IDS.battleB);
    expect(battleB?.organismIds).toContain(CONWAYS_CLASSIC.id);
    expect(await repos.organisms.exists(CONWAYS_CLASSIC.id)).toBe(false);
  });

  it('stamps the workspace as no longer fresh', async () => {
    const repos = createFakeRepositories();

    await seedDevFixtures(repos);

    expect(await repos.isFreshWorkspace()).toBe(false);
  });
});
