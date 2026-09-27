import { describe, expect, it } from 'vitest';
import {
  ruleDeleteLabel,
  ruleDeleteSentence,
  RULE_DELETE_ACTION,
  RULE_DELETE_TITLE,
} from './ruleDeleteCopy';

describe('the Story 4.26 rule-delete confirmation copy', () => {
  it('exports the title and action verbatim', () => {
    expect(RULE_DELETE_TITLE).toBe('Delete Rule?');
    expect(RULE_DELETE_ACTION).toBe('Delete Rule');
  });
});

describe('ruleDeleteLabel', () => {
  it('uses a non-empty, trimmed Summary', () => {
    expect(ruleDeleteLabel('Death by overpopulation', 0)).toBe('Death by overpopulation');
    expect(ruleDeleteLabel('  Death by overpopulation  ', 4)).toBe('Death by overpopulation');
  });

  it('falls back to Rule N (1-based) for an empty Summary', () => {
    expect(ruleDeleteLabel('', 0)).toBe('Rule 1');
    expect(ruleDeleteLabel('', 2)).toBe('Rule 3');
  });

  it('falls back to Rule N for a whitespace-only Summary', () => {
    expect(ruleDeleteLabel('   ', 1)).toBe('Rule 2');
  });

  it('carries a 100-char summary through unchanged (space-free or not)', () => {
    const long = 'a'.repeat(100);
    expect(ruleDeleteLabel(long, 0)).toBe(long);
  });
});

describe('ruleDeleteSentence', () => {
  it('quotes the label in curly quotes and names conditions removed from the organism', () => {
    expect(ruleDeleteSentence('Rule 2')).toBe(
      '“Rule 2” and its conditions will be removed from this organism.',
    );
  });

  it('never claims the removal cannot be undone', () => {
    expect(ruleDeleteSentence('Death by overpopulation')).not.toMatch(/cannot be undone/i);
  });
});
