import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { MAX_ORGANISM_NAME_LENGTH, NEW_ORGANISM_DOMINANCE, type Organism } from '@gol/domain';
import { CONWAYS_CLASSIC, createMockOrganisms } from '@gol/test-utils';
import { defaultColorToken } from '@/lib/palette/defaultColorToken';
import { PALETTE } from '@/lib/palette/paletteRegistry';
import { ORGANISM_NAME_REQUIRED, organismNameTooLong } from './organismName';
import {
  createNewConditionDraft,
  MAX_AGE_LITERAL,
  ORGANISM_REQUIRED,
  wholeNumberMessage,
  type ConditionDraft,
} from './conditionDraft';
import {
  createNewOrganismDraft,
  isOrganismDraftDirty,
  organismDraftFrom,
  validateOrganismDraft,
} from './organismDraft';
import { projectOrganismForSave } from './organismRecord';
import { createNewRuleDraft, moveRule, RULE_NEEDS_CONDITION, type RuleDraft } from './ruleDraft';

describe('createNewOrganismDraft', () => {
  it('seeds an empty name, NEW_ORGANISM_DOMINANCE, aging off, the M6 colour default and no rules for the given library', () => {
    const usedColorTokens = [PALETTE[1].id, PALETTE[2].id];
    expect(createNewOrganismDraft(usedColorTokens)).toEqual({
      name: '',
      dominance: NEW_ORGANISM_DOMINANCE,
      agingEnabled: false,
      colorToken: defaultColorToken(usedColorTokens),
      survivalRules: [],
    });
  });

  // A value the old DEFAULT_COLOR_TOKEN stopgap could not have produced — the test that would have
  // gone red on the old seed.
  it('with one token already used, seeds the NEXT unused entry — not PALETTE[0]', () => {
    expect(createNewOrganismDraft([PALETTE[0].id]).colorToken).toBe(PALETTE[1].id);
  });

  // The seed must never be shared between two opens of the editor: Story 4.23 diffs the draft
  // against its seed, and a shared object would make every edit also an edit of the baseline.
  it('returns a distinct object on every call', () => {
    const first = createNewOrganismDraft([]);
    const second = createNewOrganismDraft([]);
    expect(first).not.toBe(second);
    expect(first).toEqual(second);
  });

  // Story 4.10: a shared empty array would make every rule mutation through one call's reference
  // visible to the other — the same seed-diff reasoning the scalar fields already have.
  it('returns distinct survivalRules arrays on every call', () => {
    const first = createNewOrganismDraft([]);
    const second = createNewOrganismDraft([]);
    expect(first.survivalRules).not.toBe(second.survivalRules);
  });
});

describe('organismDraftFrom (Story 4.17)', () => {
  /** A counting id source — the test asserts how many condition ids the seed asked for. */
  function countingIds(): { nextId: () => string; calls: () => number } {
    let n = 0;
    return {
      nextId: () => `cond-${++n}`,
      calls: () => n,
    };
  }

  it("(a) seeds every scalar, both rules in order with the record's ids, hashes dropped, one fresh id per condition", () => {
    const ids = countingIds();
    const draft = organismDraftFrom(CONWAYS_CLASSIC, ids.nextId);

    expect(draft.name).toBe(CONWAYS_CLASSIC.name);
    expect(draft.dominance).toBe(CONWAYS_CLASSIC.dominance);
    expect(draft.agingEnabled).toBe(CONWAYS_CLASSIC.agingEnabled);
    expect(draft.colorToken).toBe(CONWAYS_CLASSIC.colorToken);
    expect(draft.survivalRules.map((rule) => rule.id)).toEqual(
      CONWAYS_CLASSIC.survivalRules.map((rule) => rule.id),
    );
    for (const rule of draft.survivalRules) expect(rule).not.toHaveProperty('contentHash');

    const conditionCount = CONWAYS_CLASSIC.survivalRules.reduce(
      (sum, rule) => sum + rule.conditions.length,
      0,
    );
    expect(ids.calls()).toBe(conditionCount);
    const conditionIds = draft.survivalRules.flatMap((rule) => rule.conditions.map((c) => c.id));
    expect(new Set(conditionIds).size).toBe(conditionCount);
    for (const id of conditionIds) expect(id).toMatch(/^cond-\d+$/);
  });

  // The load-bearing one: an UNCHANGED re-save must reproduce the record byte for byte — rule
  // ids, hashes, order and `schemaVersion` — or every edit session silently forks rule identity.
  it('(b) seed ∘ project is the identity on CONWAYS_CLASSIC and every mock organism', async () => {
    const records: Organism[] = [CONWAYS_CLASSIC, ...createMockOrganisms()];
    for (const organism of records) {
      const draft = organismDraftFrom(organism, () => crypto.randomUUID());
      await expect(projectOrganismForSave(draft, organism.id)).resolves.toEqual(organism);
    }
  });

  it('(c) a numeric range condition round-trips through text', async () => {
    const patientDefender = createMockOrganisms()[1];
    const rangeRule = patientDefender.survivalRules.find((rule) =>
      rule.conditions.some((c) => c.operator === 'range'),
    );
    expect(rangeRule).toBeDefined();

    const draft = organismDraftFrom(patientDefender, () => crypto.randomUUID());
    const seededRange = draft.survivalRules
      .flatMap((rule) => rule.conditions)
      .find((c) => c.operator === 'range');
    expect(seededRange?.pattern).toEqual(['3', '4']);

    const saved = await projectOrganismForSave(draft, patientDefender.id);
    const savedRange = saved.survivalRules
      .flatMap((rule) => rule.conditions)
      .find((c) => c.operator === 'range');
    expect(savedRange?.pattern).toEqual([3, 4]);
  });

  it('(d) a name with trailing whitespace seeds RAW, as stored', () => {
    const draft = organismDraftFrom({ ...CONWAYS_CLASSIC, name: 'Trailing  ' }, () => 'x');
    expect(draft.name).toBe('Trailing  ');
  });
});

describe('validateOrganismDraft', () => {
  const base = createNewOrganismDraft([]);

  it('(a) a fresh draft has exactly one error: the name is required', () => {
    expect(validateOrganismDraft(base)).toEqual([
      { target: { kind: 'name' }, message: ORGANISM_NAME_REQUIRED },
    ]);
  });

  it('(b) a valid name with zero rules is valid — zero rules is NOT an error', () => {
    expect(validateOrganismDraft({ ...base, name: 'Glider' })).toEqual([]);
  });

  it('(c) a 51-character name gives the too-long message, not the required one', () => {
    const name = 'x'.repeat(MAX_ORGANISM_NAME_LENGTH + 1);
    expect(validateOrganismDraft({ ...base, name })).toEqual([
      { target: { kind: 'name' }, message: organismNameTooLong(MAX_ORGANISM_NAME_LENGTH) },
    ]);
  });

  it('(d) one rule with zero conditions gives a rule-level error', () => {
    const rule = createNewRuleDraft('r1');
    const errors = validateOrganismDraft({ ...base, name: 'Glider', survivalRules: [rule] });
    expect(errors).toEqual([
      { target: { kind: 'rule', ruleId: 'r1' }, message: RULE_NEEDS_CONDITION },
    ]);
  });

  it('(e) one rule with a valid cellState row is valid', () => {
    const rule = {
      ...createNewRuleDraft('r1'),
      conditions: [createNewConditionDraft('c1')],
    };
    expect(validateOrganismDraft({ ...base, name: 'Glider', survivalRules: [rule] })).toEqual([]);
  });

  it('(f) an Age range row with Max never typed gives one condition error on max', () => {
    const rule: RuleDraft = {
      ...createNewRuleDraft('r1'),
      conditions: [{ id: 'c1', property: 'age', operator: 'range', pattern: ['5', ''] }],
    };
    const errors = validateOrganismDraft({ ...base, name: 'Glider', survivalRules: [rule] });
    expect(errors).toEqual([
      {
        target: { kind: 'condition', ruleId: 'r1', conditionId: 'c1', field: 'max' },
        message: wholeNumberMessage('Max must be', 0, MAX_AGE_LITERAL),
      },
    ]);
  });

  it('(g) a scalar row and an organismType row give two condition errors in row order', () => {
    const rule: RuleDraft = {
      ...createNewRuleDraft('r1'),
      conditions: [
        { id: 'c1', property: 'age', operator: 'eq', pattern: '' },
        { id: 'c2', property: 'organismType', operator: 'eq', pattern: '' },
      ],
    };
    const errors = validateOrganismDraft({ ...base, name: 'Glider', survivalRules: [rule] });
    expect(errors).toEqual([
      {
        target: { kind: 'condition', ruleId: 'r1', conditionId: 'c1', field: 'value' },
        message: wholeNumberMessage('Enter', 0, MAX_AGE_LITERAL),
      },
      {
        target: { kind: 'condition', ruleId: 'r1', conditionId: 'c2', field: 'value' },
        message: ORGANISM_REQUIRED,
      },
    ]);
  });

  it('(h) targets are in document order and follow rule ids, not indices, across a reorder', () => {
    const ruleA = createNewRuleDraft('a'); // zero rows
    const ruleB: RuleDraft = {
      ...createNewRuleDraft('b'),
      conditions: [{ id: 'c1', property: 'age', operator: 'eq', pattern: '' }],
    };
    const draft = { ...base, name: '', survivalRules: [ruleA, ruleB] };
    const errors = validateOrganismDraft(draft);
    expect(errors.map((e) => e.target)).toEqual([
      { kind: 'name' },
      { kind: 'rule', ruleId: 'a' },
      { kind: 'condition', ruleId: 'b', conditionId: 'c1', field: 'value' },
    ]);

    const reordered = { ...draft, survivalRules: moveRule(draft.survivalRules, 'b', 0) };
    const reorderedErrors = validateOrganismDraft(reordered);
    expect(reorderedErrors.map((e) => e.target)).toEqual([
      { kind: 'name' },
      { kind: 'condition', ruleId: 'b', conditionId: 'c1', field: 'value' },
      { kind: 'rule', ruleId: 'a' },
    ]);
  });

  it('(i) a rule with rows carries no rule-level error even when every row is invalid', () => {
    const rule: RuleDraft = {
      ...createNewRuleDraft('r1'),
      conditions: [
        { id: 'c1', property: 'age', operator: 'eq', pattern: '' },
        { id: 'c2', property: 'neighborCount', operator: 'eq', pattern: '' },
      ],
    };
    const errors = validateOrganismDraft({ ...base, name: 'Glider', survivalRules: [rule] });
    expect(errors.some((e) => e.target.kind === 'rule')).toBe(false);
    expect(errors).toHaveLength(2);
  });

  it('(j) colour, dominance and aging never appear, however invalid', () => {
    const draft = {
      ...base,
      name: 'Glider',
      colorToken: 'not-a-token',
      dominance: 999,
      agingEnabled: true,
    };
    expect(validateOrganismDraft(draft)).toEqual([]);
  });

  it('(k) the error count and rule-id order match a hand-computed model (fast-check)', () => {
    const scalarText = fc.oneof(
      fc.constant(''),
      fc.integer({ min: 0, max: 8 }).map((n) => String(n)),
    );
    const arbRule = fc
      .nat({ max: 3 })
      .chain((rowCount) => fc.tuple(...Array.from({ length: rowCount }, () => scalarText)));
    // `maxLength: 60` so the arbitrary crosses the 50-character cap — fast-check's default string
    // size never reaches the too-long branch.
    const arbName = fc.string({ maxLength: MAX_ORGANISM_NAME_LENGTH + 10 });
    // The model is hand-computed, never the validators under test: over the cap or blank is a
    // name error; a scalar row is invalid exactly when its text is not a digit string.
    const nameInvalid = (name: string) =>
      name.length > MAX_ORGANISM_NAME_LENGTH || name.trim().length === 0;
    const rowInvalid = (pattern: string) => !/^\d+$/.test(pattern);

    fc.assert(
      fc.property(arbName, fc.array(arbRule, { maxLength: 4 }), (name, ruleRows) => {
        const rules: RuleDraft[] = ruleRows.map((rows, ruleIndex) => ({
          ...createNewRuleDraft(`r${ruleIndex}`),
          conditions: rows.map((pattern, rowIndex): ConditionDraft => ({
            id: `r${ruleIndex}-c${rowIndex}`,
            property: 'age',
            operator: 'eq',
            pattern,
          })),
        }));

        const errors = validateOrganismDraft({ ...base, name, survivalRules: rules });

        const ruleErrorCount = ruleRows.reduce(
          (sum, rows) => sum + (rows.length === 0 ? 1 : rows.filter(rowInvalid).length),
          0,
        );
        expect(errors).toHaveLength((nameInvalid(name) ? 1 : 0) + ruleErrorCount);

        const ruleIdsInErrors = errors
          .map((e) => (e.target.kind === 'name' ? null : e.target.ruleId))
          .filter((id): id is string => id !== null);
        const expectedOrder = ruleRows.flatMap((rows, ruleIndex) =>
          rows.length === 0
            ? [`r${ruleIndex}`]
            : rows.filter(rowInvalid).map(() => `r${ruleIndex}`),
        );
        expect(ruleIdsInErrors).toEqual(expectedOrder);
      }),
    );
  });

  // The empty-name bound explicitly, per the 4.11 review's "arbitrary never reached half the
  // domain" finding — an arbitrary alone would rarely hit the empty string.
  it('(k, bound) the empty-name case is covered explicitly', () => {
    const errors = validateOrganismDraft({ ...base, name: '', survivalRules: [] });
    expect(errors).toEqual([{ target: { kind: 'name' }, message: ORGANISM_NAME_REQUIRED }]);
  });
});

describe('isOrganismDraftDirty (Story 4.23, FD1)', () => {
  const baseline = organismDraftFrom(CONWAYS_CLASSIC, () => crypto.randomUUID());

  it('the identical baseline is clean', () => {
    expect(isOrganismDraftDirty(baseline, baseline)).toBe(false);
    expect(isOrganismDraftDirty(baseline, { ...baseline })).toBe(false);
  });

  it('an edited name is dirty', () => {
    expect(isOrganismDraftDirty(baseline, { ...baseline, name: `${baseline.name}x` })).toBe(true);
  });

  it('an edited dominance is dirty', () => {
    expect(isOrganismDraftDirty(baseline, { ...baseline, dominance: baseline.dominance + 1 })).toBe(
      true,
    );
  });

  it('an edited agingEnabled is dirty', () => {
    expect(
      isOrganismDraftDirty(baseline, { ...baseline, agingEnabled: !baseline.agingEnabled }),
    ).toBe(true);
  });

  it('an edited colorToken is dirty', () => {
    const other = PALETTE.find((entry) => entry.id !== baseline.colorToken);
    if (other === undefined) throw new Error('PALETTE has fewer than 2 tokens');
    expect(isOrganismDraftDirty(baseline, { ...baseline, colorToken: other.id })).toBe(true);
  });

  it('an edited rule action is dirty', () => {
    const rules = [
      {
        ...baseline.survivalRules[0],
        payload: { ...baseline.survivalRules[0].payload, action: 'die' as const },
      },
      ...baseline.survivalRules.slice(1),
    ];
    expect(isOrganismDraftDirty(baseline, { ...baseline, survivalRules: rules })).toBe(true);
  });

  it('an edited rule summary is dirty', () => {
    const rules = [
      {
        ...baseline.survivalRules[0],
        payload: { ...baseline.survivalRules[0].payload, summary: 'changed' },
      },
      ...baseline.survivalRules.slice(1),
    ];
    expect(isOrganismDraftDirty(baseline, { ...baseline, survivalRules: rules })).toBe(true);
  });

  it('an edited condition pattern is dirty', () => {
    const rule = baseline.survivalRules[0];
    const condition = rule.conditions[0];
    if (condition.property !== 'cellState') throw new Error('fixture drifted from CONWAYS_CLASSIC');
    const edited: ConditionDraft = {
      ...condition,
      pattern: condition.pattern === 'empty' ? 'occupied' : 'empty',
    };
    const patched = { ...rule, conditions: [edited, ...rule.conditions.slice(1)] };
    expect(
      isOrganismDraftDirty(baseline, {
        ...baseline,
        survivalRules: [patched, ...baseline.survivalRules.slice(1)],
      }),
    ).toBe(true);
  });

  it('a range condition edited on one element is dirty', () => {
    const rule: RuleDraft = {
      ...createNewRuleDraft('r1'),
      conditions: [{ id: 'c1', property: 'age', operator: 'range', pattern: ['3', '4'] }],
    };
    const edited: RuleDraft = {
      ...rule,
      conditions: [{ id: 'c1', property: 'age', operator: 'range', pattern: ['3', '5'] }],
    };
    const draftBaseline = { ...createNewOrganismDraft([]), name: 'Glider', survivalRules: [rule] };
    expect(isOrganismDraftDirty(draftBaseline, { ...draftBaseline, survivalRules: [edited] })).toBe(
      true,
    );
    expect(isOrganismDraftDirty(draftBaseline, { ...draftBaseline, survivalRules: [rule] })).toBe(
      false,
    );
  });

  it('a reorder of rules is dirty', () => {
    expect(baseline.survivalRules.length).toBeGreaterThan(1);
    const reordered = [...baseline.survivalRules].reverse();
    expect(isOrganismDraftDirty(baseline, { ...baseline, survivalRules: reordered })).toBe(true);
  });

  it('an added rule is dirty, and a removed rule is dirty', () => {
    const added = [...baseline.survivalRules, createNewRuleDraft('new-rule')];
    expect(isOrganismDraftDirty(baseline, { ...baseline, survivalRules: added })).toBe(true);

    const removed = baseline.survivalRules.slice(1);
    expect(isOrganismDraftDirty(baseline, { ...baseline, survivalRules: removed })).toBe(true);
  });

  it('an added or removed condition is dirty', () => {
    const rule = baseline.survivalRules[0];
    const withExtraCondition = {
      ...rule,
      conditions: [...rule.conditions, createNewConditionDraft('extra-condition')],
    };
    expect(
      isOrganismDraftDirty(baseline, {
        ...baseline,
        survivalRules: [withExtraCondition, ...baseline.survivalRules.slice(1)],
      }),
    ).toBe(true);

    const withoutFirstCondition = { ...rule, conditions: rule.conditions.slice(1) };
    expect(
      isOrganismDraftDirty(baseline, {
        ...baseline,
        survivalRules: [withoutFirstCondition, ...baseline.survivalRules.slice(1)],
      }),
    ).toBe(true);
  });

  it('a hand-revert back to the baseline values is clean', () => {
    const edited = { ...baseline, name: `${baseline.name}x` };
    expect(isOrganismDraftDirty(baseline, edited)).toBe(true);
    const reverted = { ...edited, name: baseline.name };
    expect(isOrganismDraftDirty(baseline, reverted)).toBe(false);
  });

  it('a re-added identical condition with a fresh id is clean (condition id is never compared)', () => {
    const rule = baseline.survivalRules[0];
    const condition = rule.conditions[0];
    const removed = { ...rule, conditions: rule.conditions.slice(1) };
    const draftBaseline = {
      ...baseline,
      survivalRules: [removed, ...baseline.survivalRules.slice(1)],
    };
    const reAdded = {
      ...removed,
      conditions: [{ ...condition, id: 'brand-new-condition-id' }, ...removed.conditions],
    };
    expect(
      isOrganismDraftDirty(
        { ...baseline, survivalRules: [rule, ...baseline.survivalRules.slice(1)] },
        { ...baseline, survivalRules: [reAdded, ...baseline.survivalRules.slice(1)] },
      ),
    ).toBe(false);
    // Sanity: removing it in the first place was dirty against the same baseline.
    expect(
      isOrganismDraftDirty(
        { ...baseline, survivalRules: [rule, ...baseline.survivalRules.slice(1)] },
        draftBaseline,
      ),
    ).toBe(true);
  });

  it('a re-added identical rule with a fresh rule id is dirty (rule id IS compared)', () => {
    const rule = baseline.survivalRules[0];
    const withoutFirstRule = baseline.survivalRules.slice(1);
    const reAddedWithFreshId = [...withoutFirstRule, { ...rule, id: 'brand-new-rule-id' }];
    expect(isOrganismDraftDirty(baseline, { ...baseline, survivalRules: reAddedWithFreshId })).toBe(
      true,
    );
  });
});
