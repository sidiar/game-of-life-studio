import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { MAX_ORGANISM_NAME_LENGTH, NEW_ORGANISM_DOMINANCE } from '@gol/domain';
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
import { createNewOrganismDraft, validateOrganismDraft } from './organismDraft';
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
