import { describe, expect, it } from 'vitest';
import type { Organism, OrganismUsageEntry } from '@gol/domain';
import { CONWAYS_CLASSIC, createMockOrganisms } from '@gol/test-utils';
import {
  battleCount,
  battleCountLabel,
  organismInUseBattleMessage,
  organismInUseMessage,
  referencingOrganismNames,
  ruleTargetCountLabel,
  usageBattleNames,
  UNSAVED_BATTLE_LABEL,
} from './usageLabels';

/**
 * Story 4.20, AC2/AC5/AC7: the ONE copy site for both usage labels and the two name resolvers the
 * editor footer and `<OrganismInUseDialog>` share. The dialog's own assertions
 * (`OrganismInUseDialog.test.tsx`) still cover the two moved formatters through the dialog — these
 * pin them at the module they now live in, plus the labels and resolvers the footer adds.
 */

function entry(battleId: string | null, placedOnLiveGrid = false): OrganismUsageEntry {
  return { battleId, placedOnLiveGrid };
}

function named(name: string): Organism {
  return { ...CONWAYS_CLASSIC, id: `org-${name}`, name };
}

describe('battleCountLabel / organismInUseMessage (moved verbatim, Story 4.20 FD6)', () => {
  it('pluralises at the boundary of 1', () => {
    expect(battleCountLabel(0)).toBe('Used in 0 Battles');
    expect(battleCountLabel(1)).toBe('Used in 1 Battle');
    expect(battleCountLabel(2)).toBe('Used in 2 Battles');
  });

  it('interpolates the same count into the FR-1.3 sentence', () => {
    expect(organismInUseMessage(1)).toBe(
      'This organism is used in 1 Battle. Editing it will affect all Battles that use it. Clone this organism first to create a Battle-specific variant?',
    );
    expect(organismInUseMessage(3)).toContain('used in 3 Battles.');
  });
});

// Story 4.24, FD3: the battle variant's sentence — no clone question, since that variant has no
// Clone & Edit; the instruction FR-1.3's battle bullet gives instead.
describe('organismInUseBattleMessage (Story 4.24, FD3)', () => {
  it('interpolates the count and points at the Library instead of offering a clone', () => {
    expect(organismInUseBattleMessage(1)).toBe(
      'This organism is used in 1 Battle. Editing it will affect all Battles that use it. To make a variant for this Battle only, clone it in the Organism Library and select the clone here.',
    );
    expect(organismInUseBattleMessage(2)).toContain('used in 2 Battles.');
    expect(organismInUseBattleMessage(2)).not.toContain('?');
  });
});

// Story 4.21, FD5: `battleCount` is exported so `deleteBlockCopy.ts`'s `battleBlockSentence` reuses
// this exact pluraliser rather than a second one.
describe('battleCount (exported, Story 4.21 FD5)', () => {
  it('pluralises at the boundary of 1', () => {
    expect(battleCount(0)).toBe('0 Battles');
    expect(battleCount(1)).toBe('1 Battle');
    expect(battleCount(2)).toBe('2 Battles');
  });
});

describe('ruleTargetCountLabel (AC2)', () => {
  it('pluralises RULES at the boundary of 1', () => {
    expect(ruleTargetCountLabel(1)).toBe('Targeted by 1 organism rule');
    expect(ruleTargetCountLabel(2)).toBe('Targeted by 2 organism rules');
  });

  // M === 0 renders nothing at all (AC2) — the caller decides that, but the formatter stays total
  // so a zero can never render as a broken sentence if a future surface does show it.
  it('still formats zero as plural', () => {
    expect(ruleTargetCountLabel(0)).toBe('Targeted by 0 organism rules');
  });
});

describe('usageBattleNames (AC7)', () => {
  // U+200B ZERO WIDTH SPACE + U+2066 LRI, built from code points rather than written inline:
  // Prettier re-prints a `\u200b` escape as the literal character, and an invisible character in
  // source is unreviewable (`battleDisplayName`'s own comment lists the class).
  const INVISIBLE_NAME = String.fromCodePoint(0x200b, 0x2066);
  const summaries = [
    { id: 'b1', name: 'Glider Wars' },
    { id: 'b2', name: '' },
    { id: 'b3', name: INVISIBLE_NAME },
  ];

  it('resolves each entry in entry order, through battleDisplayName', () => {
    expect(usageBattleNames([entry('b1'), entry('b2'), entry('b3')], summaries)).toEqual([
      'Glider Wars',
      'Untitled Battle',
      'Untitled Battle',
    ]);
  });

  // FD9: forced by `OrganismUsageEntry.battleId: string | null` (RFC-005 Decision 8), reachable
  // from the battle origin since Story 4.24 (asserted through the UI by its e2e too).
  it('labels a never-saved open battle "Current Battle (unsaved)"', () => {
    expect(usageBattleNames([entry(null, true)], summaries)).toEqual([UNSAVED_BATTLE_LABEL]);
    expect(
      usageBattleNames([entry('b1'), entry(null, true)], summaries, { id: null, name: 'Live' }),
    ).toEqual(['Glider Wars', UNSAVED_BATTLE_LABEL]);
    expect(UNSAVED_BATTLE_LABEL).toBe('Current Battle (unsaved)');
  });

  // Story 4.24 (RFC-005 Decision 8): the open battle is labelled from its LIVE name — a rename in
  // this unsaved session shows as the header does, not as the stored summary.
  it("labels the open battle's entry by its LIVE name, through battleDisplayName", () => {
    expect(
      usageBattleNames([entry('b1', true), entry('b2')], summaries, {
        id: 'b1',
        name: 'Renamed Live',
      }),
    ).toEqual(['Renamed Live', 'Untitled Battle']);
    // Matched by id, not by `placedOnLiveGrid` — an erased-but-saved entry is still the open one.
    expect(usageBattleNames([entry('b1', false)], summaries, { id: 'b1', name: '' })).toEqual([
      'Untitled Battle',
    ]);
  });

  it('leaves every other entry on its stored summary name', () => {
    expect(usageBattleNames([entry('b1')], summaries, { id: 'other', name: 'Live' })).toEqual([
      'Glider Wars',
    ]);
    expect(usageBattleNames([entry('b1')], summaries, null)).toEqual(['Glider Wars']);
  });

  // A battle the summaries no longer carry cannot reach the footer today (both come from one
  // settled load), but the resolver must not render an empty list item if it ever does.
  it('falls back to the untitled name for an id no summary carries', () => {
    expect(usageBattleNames([entry('gone')], summaries)).toEqual(['Untitled Battle']);
  });

  it('is empty for no entries', () => {
    expect(usageBattleNames([], summaries)).toEqual([]);
  });
});

describe('referencingOrganismNames (AC7)', () => {
  const library = [CONWAYS_CLASSIC, ...createMockOrganisms(), named('')];

  it('resolves ids against the library in id order', () => {
    const [first, second] = createMockOrganisms();
    expect(referencingOrganismNames([second.id, CONWAYS_CLASSIC.id, first.id], library)).toEqual([
      second.name,
      CONWAYS_CLASSIC.name,
      first.name,
    ]);
  });

  it('renders an empty name through the Unnamed organism fallback', () => {
    expect(referencingOrganismNames(['org-'], library)).toEqual(['Unnamed organism']);
  });

  it('renders an id no organism backs through the Unknown organism fallback', () => {
    expect(referencingOrganismNames(['missing'], library)).toEqual(['Unknown organism']);
  });

  it('is empty for no ids', () => {
    expect(referencingOrganismNames([], library)).toEqual([]);
  });
});
