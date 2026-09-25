import { describe, expect, it } from 'vitest';
import {
  BATTLE_BLOCK_REMEDY,
  battleBlockSentence,
  DELETE_CONFIRM_ACTION,
  DELETE_CONFIRM_TITLE,
  deleteBlockTitle,
  deleteConfirmSentence,
  RULE_BLOCK_REMEDY,
  ruleBlockSentence,
} from './deleteBlockCopy';

describe('deleteBlockTitle', () => {
  it('names the organism, consequence first', () => {
    expect(deleteBlockTitle('Aggressive Colonizer')).toBe('Cannot delete Aggressive Colonizer');
  });
});

describe('battleBlockSentence', () => {
  it('pluralises at the boundary of 1, through the shared battleCount pluraliser (FD5)', () => {
    expect(battleBlockSentence(1)).toBe('It is used in 1 Battle:');
    expect(battleBlockSentence(2)).toBe('It is used in 2 Battles:');
  });

  it('exports the remedy verbatim', () => {
    expect(BATTLE_BLOCK_REMEDY).toBe(
      'Remove it from those Battles, or delete the Battles, then try again.',
    );
  });
});

describe('ruleBlockSentence', () => {
  it('pluralises ORGANISMS, not rules, at the boundary of 1 (FD6)', () => {
    expect(ruleBlockSentence(1)).toBe('It is targeted by rules of 1 organism:');
    expect(ruleBlockSentence(2)).toBe('It is targeted by rules of 2 organisms:');
  });

  it('exports the remedy verbatim', () => {
    expect(RULE_BLOCK_REMEDY).toBe('Edit those rules to remove the reference, then try again.');
  });
});

describe('the Story 4.22 confirmation copy', () => {
  it("asks FR-1.4's question verbatim, quoting the display name", () => {
    expect(DELETE_CONFIRM_TITLE).toBe('Delete Organism?');
    expect(deleteConfirmSentence('Glider')).toBe('Are you sure you want to delete “Glider”?');
    expect(DELETE_CONFIRM_ACTION).toBe('Delete Organism');
  });
});
