import { describe, expect, it } from 'vitest';
import {
  EMPTY_WORKSPACE_META,
  MAX_WORKSPACE_DESCRIPTION_LENGTH,
  normalizeDescription,
  WorkspaceMetaSchema,
} from './workspaceMetaSchema';

describe('WorkspaceMetaSchema (Story 7.2)', () => {
  it('parses an empty record as no description, without inventing the key', () => {
    const parsed = WorkspaceMetaSchema.parse({});
    expect(Object.keys(parsed)).toEqual([]);
  });

  it('accepts a description of exactly the cap and rejects one character more', () => {
    const atCap = 'x'.repeat(MAX_WORKSPACE_DESCRIPTION_LENGTH);
    const overCap = 'x'.repeat(MAX_WORKSPACE_DESCRIPTION_LENGTH + 1);
    expect(WorkspaceMetaSchema.safeParse({ description: atCap }).success).toBe(true);
    expect(WorkspaceMetaSchema.safeParse({ description: overCap }).success).toBe(false);
  });

  it('accepts a stored empty string — writers normalize it away, the schema does not reject it', () => {
    expect(WorkspaceMetaSchema.safeParse({ description: '' }).success).toBe(true);
  });

  it('rejects a non-string description', () => {
    expect(WorkspaceMetaSchema.safeParse({ description: 42 }).success).toBe(false);
  });

  it('caps the workspace description at 500', () => {
    expect(MAX_WORKSPACE_DESCRIPTION_LENGTH).toBe(500);
  });

  it('EMPTY_WORKSPACE_META is a frozen empty record', () => {
    expect(EMPTY_WORKSPACE_META).toEqual({});
    expect(Object.isFrozen(EMPTY_WORKSPACE_META)).toBe(true);
  });
});

describe('normalizeDescription (FD2)', () => {
  it('returns undefined for empty and whitespace-only text', () => {
    expect(normalizeDescription('')).toBeUndefined();
    expect(normalizeDescription('  \n\t ')).toBeUndefined();
  });

  it('trims surrounding whitespace and keeps inner newlines', () => {
    expect(normalizeDescription('  line one\nline two  ')).toBe('line one\nline two');
  });
});
