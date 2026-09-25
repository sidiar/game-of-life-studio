import { describe, expect, it } from 'vitest';
import {
  EditableGridPresetSchema,
  MAX_DOMINANCE,
  MAX_ORGANISM_NAME_LENGTH,
  MIN_DOMINANCE,
  NEW_ORGANISM_DOMINANCE,
  ORGANISM_SCHEMA_VERSION,
  OrganismSchema,
} from './organismSchema';
import { CONWAYS_CLASSIC } from './defaultWorkspace';

// A user-authored organism: UUID id, so the well-known-id test below varies from the fixture
// instead of restating it.
const validOrganism = {
  schemaVersion: 1,
  id: '9f1c2b3a-4d5e-6f70-8192-a3b4c5d6e7f8',
  name: 'Conway Classic',
  colorToken: 'coral-red',
  dominance: 8,
  agingEnabled: false,
  survivalRules: [
    {
      id: 'test-rule-1',
      contentHash: 'test-hash-1',
      conditions: [{ property: 'cellState', operator: 'eq', pattern: 'empty' }],
      payload: { summary: 'Born', action: 'born' as const },
    },
  ],
};

function without(key: keyof typeof validOrganism) {
  const copy: Record<string, unknown> = { ...validOrganism };
  delete copy[key];
  return copy;
}

function rejects(data: unknown, path: string) {
  const result = OrganismSchema.safeParse(data);
  expect(result.success).toBe(false);
  const paths = result.success ? [] : result.error.issues.map((i) => i.path[0]);
  expect(paths).toContain(path);
}

describe('OrganismSchema', () => {
  it('accepts a valid organism fixture', () => {
    const result = OrganismSchema.safeParse(validOrganism);
    expect(result.success).toBe(true);
  });

  // FR-1.5: the protected default organism ships with a stable well-known id, so Organism.id
  // must stay a plain string. Constraining it to .uuid() (as Battle.id is) would reject it.
  it('accepts a non-uuid stable well-known id (protected default organism)', () => {
    const result = OrganismSchema.safeParse({ ...validOrganism, id: 'conways-classic' });
    expect(result.success).toBe(true);
  });

  it('rejects an empty id', () => {
    rejects({ ...validOrganism, id: '' }, 'id');
  });

  // FR-2.1 (Story 4.5): the boundary is derived from the schema's OWN constant, so the test cannot
  // silently pin a number the schema has drifted away from.
  it('rejects a name over MAX_ORGANISM_NAME_LENGTH characters', () => {
    rejects({ ...validOrganism, name: 'x'.repeat(MAX_ORGANISM_NAME_LENGTH + 1) }, 'name');
  });

  it('accepts a name of exactly MAX_ORGANISM_NAME_LENGTH characters', () => {
    const result = OrganismSchema.safeParse({
      ...validOrganism,
      name: 'x'.repeat(MAX_ORGANISM_NAME_LENGTH),
    });
    expect(result.success).toBe(true);
  });

  // Pins the number UX-DR14 states ("50 char max"), so a drift in the constant fails HERE — in the
  // package that owns it — rather than in `apps/web`'s counter or e2e text.
  it('MAX_ORGANISM_NAME_LENGTH is 50', () => {
    expect(MAX_ORGANISM_NAME_LENGTH).toBe(50);
  });

  // FR-2.2 (Story 4.6): the boundaries are derived from the schema's OWN constants, so a drift
  // in the constant fails HERE — in the package that owns it — rather than in a slider.
  it('rejects dominance below MIN_DOMINANCE', () => {
    rejects({ ...validOrganism, dominance: MIN_DOMINANCE - 1 }, 'dominance');
  });

  it('rejects dominance above MAX_DOMINANCE', () => {
    rejects({ ...validOrganism, dominance: MAX_DOMINANCE + 1 }, 'dominance');
  });

  it('rejects a non-integer dominance', () => {
    rejects({ ...validOrganism, dominance: MIN_DOMINANCE + 0.5 }, 'dominance');
  });

  it('accepts dominance of exactly MIN_DOMINANCE', () => {
    const result = OrganismSchema.safeParse({ ...validOrganism, dominance: MIN_DOMINANCE });
    expect(result.success).toBe(true);
  });

  it('accepts dominance of exactly MAX_DOMINANCE', () => {
    const result = OrganismSchema.safeParse({ ...validOrganism, dominance: MAX_DOMINANCE });
    expect(result.success).toBe(true);
  });

  // Pins the numbers UX-DR8 states, once, so a drift fails here and not in a slider.
  it('MIN_DOMINANCE is 1, MAX_DOMINANCE is 100, NEW_ORGANISM_DOMINANCE is 5', () => {
    expect(MIN_DOMINANCE).toBe(1);
    expect(MAX_DOMINANCE).toBe(100);
    expect(NEW_ORGANISM_DOMINANCE).toBe(5);
  });

  it('rejects an invalid colorToken type', () => {
    rejects({ ...validOrganism, colorToken: 42 }, 'colorToken');
  });

  it('rejects a missing colorToken', () => {
    rejects(without('colorToken'), 'colorToken');
  });

  it('rejects an empty colorToken', () => {
    rejects({ ...validOrganism, colorToken: '' }, 'colorToken');
  });

  // AR-46: colours are palette tokens resolved at render time, never raw hex literals.
  it('rejects a raw hex value in place of a palette token', () => {
    rejects({ ...validOrganism, colorToken: '#ff0000' }, 'colorToken');
  });

  it('rejects a non-integer schemaVersion', () => {
    rejects({ ...validOrganism, schemaVersion: 1.5 }, 'schemaVersion');
  });

  it('rejects a schemaVersion below 1', () => {
    rejects({ ...validOrganism, schemaVersion: 0 }, 'schemaVersion');
    rejects({ ...validOrganism, schemaVersion: -5 }, 'schemaVersion');
  });

  // Decision I.4: the stamp is ASSERTED at load, not range-checked. A stamp other than the current
  // one is the NFR-7.3 corrupt path — the format chain has already run before this parse, so a
  // record a migration step was meant to upgrade never reaches it un-upgraded.
  it('rejects a schemaVersion other than ORGANISM_SCHEMA_VERSION', () => {
    rejects({ ...validOrganism, schemaVersion: ORGANISM_SCHEMA_VERSION + 1 }, 'schemaVersion');
  });

  it('rejects a non-boolean agingEnabled', () => {
    rejects({ ...validOrganism, agingEnabled: 'yes' }, 'agingEnabled');
  });

  // Proves the survivalRules: SurvivalRulesSchema wiring, not just the two schemas in isolation.
  it('rejects an organism carrying an invalid nested survival rule', () => {
    rejects(
      {
        ...validOrganism,
        survivalRules: [
          {
            ...validOrganism.survivalRules[0],
            conditions: [{ property: 'age', operator: 'range', pattern: 5 }],
          },
        ],
      },
      'survivalRules',
    );
  });

  it('accepts an organism with no survival rules yet (Epic 4 authoring state)', () => {
    const result = OrganismSchema.safeParse({ ...validOrganism, survivalRules: [] });
    expect(result.success).toBe(true);
  });

  // Story 4.16 Task 1: the save-time stamp must itself satisfy the schema it stamps.
  it('accepts schemaVersion: ORGANISM_SCHEMA_VERSION', () => {
    const result = OrganismSchema.safeParse({
      ...validOrganism,
      schemaVersion: ORGANISM_SCHEMA_VERSION,
    });
    expect(result.success).toBe(true);
  });

  // FD2: the seed's literal `1` and the constant a new save stamps with must agree by
  // construction — a future bump to one without the other silently forks the two axes.
  it('CONWAYS_CLASSIC.schemaVersion equals ORGANISM_SCHEMA_VERSION', () => {
    expect(CONWAYS_CLASSIC.schemaVersion).toBe(ORGANISM_SCHEMA_VERSION);
  });
});

describe('EditableGridPresetSchema', () => {
  it('accepts the 50x30 preset', () => {
    expect(EditableGridPresetSchema.safeParse({ cols: 50, rows: 30 }).success).toBe(true);
  });

  it('accepts the 100x60 preset', () => {
    expect(EditableGridPresetSchema.safeParse({ cols: 100, rows: 60 }).success).toBe(true);
  });

  it('rejects a preset outside the two literals', () => {
    expect(EditableGridPresetSchema.safeParse({ cols: 150, rows: 90 }).success).toBe(false);
  });

  // The presets are whole shapes, not independent cols/rows bounds.
  it('rejects a mix-and-match of the two presets', () => {
    expect(EditableGridPresetSchema.safeParse({ cols: 50, rows: 60 }).success).toBe(false);
  });
});
