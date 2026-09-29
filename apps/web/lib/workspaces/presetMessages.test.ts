import { describe, expect, it } from 'vitest';
import type { ImportSummary } from '@gol/persistence';
import { presetLoadSuccessMessage, presetWarningTitle } from './presetMessages';

const summary = (battleCount: number, organismCount: number) =>
  ({ battleCount, organismCount }) as ImportSummary;

describe('presetWarningTitle', () => {
  it('wraps the name in typographic quotes', () => {
    expect(presetWarningTitle('Colony Clash')).toBe('Load “Colony Clash”?');
  });
});

describe('presetLoadSuccessMessage', () => {
  it('pluralises counts', () => {
    expect(presetLoadSuccessMessage('Colony Clash', summary(2, 4))).toBe(
      'Loaded “Colony Clash” — your workspace now has 2 battles and 4 organisms.',
    );
  });
  it('uses singular for one', () => {
    expect(presetLoadSuccessMessage('X', summary(1, 1))).toBe(
      'Loaded “X” — your workspace now has 1 battle and 1 organism.',
    );
  });
});
