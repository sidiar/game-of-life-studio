import { describe, expect, it } from 'vitest';
import { EditableGridPresetSchema, OrganismSchema } from './organismSchema';

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

  it('rejects a name over 50 characters', () => {
    rejects({ ...validOrganism, name: 'x'.repeat(51) }, 'name');
  });

  it('rejects dominance of 0', () => {
    rejects({ ...validOrganism, dominance: 0 }, 'dominance');
  });

  it('rejects dominance of 101', () => {
    rejects({ ...validOrganism, dominance: 101 }, 'dominance');
  });

  it('rejects a non-integer dominance', () => {
    rejects({ ...validOrganism, dominance: 5.5 }, 'dominance');
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
