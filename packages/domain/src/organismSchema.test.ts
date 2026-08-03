import { describe, expect, it } from 'vitest';
import { EditableGridPresetSchema, OrganismSchema } from './organismSchema';

const validOrganism = {
  schemaVersion: 1,
  id: 'conways-classic',
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

describe('OrganismSchema', () => {
  it('accepts a valid organism fixture', () => {
    const result = OrganismSchema.safeParse(validOrganism);
    expect(result.success).toBe(true);
  });

  it('accepts a non-uuid stable well-known id (protected default organism)', () => {
    const result = OrganismSchema.safeParse({ ...validOrganism, id: 'conways-classic' });
    expect(result.success).toBe(true);
  });

  it('rejects a name over 50 characters', () => {
    const result = OrganismSchema.safeParse({ ...validOrganism, name: 'x'.repeat(51) });
    expect(result.success).toBe(false);
  });

  it('rejects dominance of 0', () => {
    const result = OrganismSchema.safeParse({ ...validOrganism, dominance: 0 });
    expect(result.success).toBe(false);
  });

  it('rejects dominance of 101', () => {
    const result = OrganismSchema.safeParse({ ...validOrganism, dominance: 101 });
    expect(result.success).toBe(false);
  });

  it('rejects a non-integer dominance', () => {
    const result = OrganismSchema.safeParse({ ...validOrganism, dominance: 5.5 });
    expect(result.success).toBe(false);
  });

  it('rejects a missing/invalid colorToken type', () => {
    const result = OrganismSchema.safeParse({ ...validOrganism, colorToken: 42 });
    expect(result.success).toBe(false);
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
});
