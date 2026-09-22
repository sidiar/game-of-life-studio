import { describe, expect, it } from 'vitest';
import { MAX_ORGANISM_NAME_LENGTH, ORGANISM_SCHEMA_VERSION, OrganismSchema } from '@gol/domain';
import { CONWAYS_CLASSIC } from '@gol/test-utils';
import { createNewOrganismDraft, type OrganismDraft } from './organismDraft';
import { projectOrganismForSave } from './organismRecord';
import { ruleContentHash } from './ruleContentHash';
import { createNewRuleDraft, moveRule, ruleDraftFrom, type RuleDraft } from './ruleDraft';
import type { ConditionDraft } from './conditionDraft';

// Deterministic id counter, never `crypto` — the `ruleDraft.test.ts` / `previewOrganism.test.ts`
// idiom.
function counter() {
  let n = 0;
  return () => `c${++n}`;
}

const conwayDrafts = (): RuleDraft[] =>
  CONWAYS_CLASSIC.survivalRules.map((rule) => ruleDraftFrom(rule, counter()));

const ID = '9f1c2b3a-4d5e-6f70-8192-a3b4c5d6e7f8';

describe('projectOrganismForSave', () => {
  it('projects a two-rule draft built from CONWAYS_CLASSIC to rules whose ids are the source ids and whose contentHash values are the pinned literals', async () => {
    const draft: OrganismDraft = {
      ...createNewOrganismDraft([]),
      name: 'Glider',
      survivalRules: conwayDrafts(),
    };
    const organism = await projectOrganismForSave(draft, ID);
    expect(organism.survivalRules).toHaveLength(2);
    organism.survivalRules.forEach((rule, i) => {
      const source = CONWAYS_CLASSIC.survivalRules[i];
      expect(rule.id).toBe(source.id);
      expect(rule.contentHash).toBe(source.contentHash);
    });
  });

  it('schemaVersion is ORGANISM_SCHEMA_VERSION, id is the argument, name is the draft raw string', async () => {
    const draft: OrganismDraft = { ...createNewOrganismDraft([]), name: '  Glider  ' };
    const organism = await projectOrganismForSave(draft, ID);
    expect(organism.schemaVersion).toBe(ORGANISM_SCHEMA_VERSION);
    expect(organism.id).toBe(ID);
    expect(organism.name).toBe('  Glider  '); // untrimmed — FD3
  });

  it('keeps rule order as list order after a moveRule (order is priority, FR-2.6)', async () => {
    const drafts = conwayDrafts();
    const reordered = moveRule(drafts, drafts[1].id, 0);
    const draft: OrganismDraft = {
      ...createNewOrganismDraft([]),
      name: 'Glider',
      survivalRules: reordered,
    };
    const organism = await projectOrganismForSave(draft, ID);
    expect(organism.survivalRules.map((r) => r.id)).toEqual([drafts[1].id, drafts[0].id]);
  });

  it('a zero-rule draft projects to survivalRules: [] and parses', async () => {
    const draft: OrganismDraft = { ...createNewOrganismDraft([]), name: 'Glider' };
    const organism = await projectOrganismForSave(draft, ID);
    expect(organism.survivalRules).toEqual([]);
    expect(OrganismSchema.safeParse(organism).success).toBe(true);
  });

  it('a rule with zero conditions rejects — the throw names the rule id', async () => {
    const rule = createNewRuleDraft('empty-rule');
    const draft: OrganismDraft = {
      ...createNewOrganismDraft([]),
      name: 'Glider',
      survivalRules: [rule],
    };
    await expect(projectOrganismForSave(draft, ID)).rejects.toThrow(/empty-rule/);
  });

  it('an invalid condition (empty organismType pattern) rejects', async () => {
    const badCondition: ConditionDraft = {
      id: 'cond-1',
      property: 'organismType',
      operator: 'eq',
      pattern: '',
    };
    const rule: RuleDraft = {
      id: 'rule-1',
      conditions: [badCondition],
      payload: { summary: 'x', action: 'born' },
    };
    const draft: OrganismDraft = {
      ...createNewOrganismDraft([]),
      name: 'Glider',
      survivalRules: [rule],
    };
    await expect(projectOrganismForSave(draft, ID)).rejects.toThrow(/rule-1/);
  });

  // A draft the editor's own helpers cannot build — pin the schema boundary directly (Task 3 g).
  it('a name over MAX_ORGANISM_NAME_LENGTH throws a ZodError — the parse is the second line of defence', async () => {
    const draft: OrganismDraft = {
      ...createNewOrganismDraft([]),
      name: 'x'.repeat(MAX_ORGANISM_NAME_LENGTH + 1),
    };
    // The CLASS is the claim — a bare `rejects.toThrow()` would accept a digest failure too. By
    // `name` rather than `instanceof`: `apps/web` does not depend on `zod` directly, and the
    // schema is the boundary being pinned, not the library (review 2026-09-22).
    await expect(projectOrganismForSave(draft, ID)).rejects.toMatchObject({ name: 'ZodError' });
  });

  it('proves the parse and the hash together, not in isolation', async () => {
    const drafts = conwayDrafts();
    const draft: OrganismDraft = {
      ...createNewOrganismDraft([]),
      name: 'Glider',
      survivalRules: drafts,
    };
    const organism = await projectOrganismForSave(draft, ID);
    for (const rule of organism.survivalRules) {
      await expect(ruleContentHash(rule)).resolves.toBe(rule.contentHash);
    }
  });
});
