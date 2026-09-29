import { describe, expect, it } from 'vitest';
import type { ImportSummary } from '@gol/persistence';
import { PRESET_ID_PATTERN } from './presetManifest';
import {
  presetLinkUnknownMessage,
  WELL_FORMED_PRESET_ID,
  presetLoadSuccessMessage,
  presetWarningTitle,
} from './presetMessages';

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

describe('presetLinkUnknownMessage', () => {
  it('quotes the id in typographic quotes and adds the untouched sentence on request', () => {
    expect(presetLinkUnknownMessage('nope', true)).toBe(
      "This preset link doesn't exist (anymore). The link pointed to a preset called “nope”, which isn't in this version of the studio. Your workspace is untouched.",
    );
  });

  it('omits the untouched sentence when the workspace was not left untouched', () => {
    expect(presetLinkUnknownMessage('nope', false)).not.toContain('untouched');
  });

  it('never echoes an id that is not a well-formed slug (D2)', () => {
    const crafted = 'Data lost - recover at evil.example';
    const generic =
      "This preset link isn't valid. It doesn't point to any preset in this version of the studio.";
    expect(presetLinkUnknownMessage(crafted, true)).toBe(`${generic} Your workspace is untouched.`);
    expect(presetLinkUnknownMessage(crafted, false)).toBe(generic);
    // Near-slugs fail too: uppercase, a trailing slash, stray whitespace.
    for (const id of ['Spiral-Wars', 'spiral-wars/', ' spiral-wars']) {
      expect(presetLinkUnknownMessage(id, false)).toBe(generic);
    }
  });

  it('keeps the local slug pattern identical to PRESET_ID_PATTERN, flags included', () => {
    expect(WELL_FORMED_PRESET_ID.source).toBe(PRESET_ID_PATTERN.source);
    expect(WELL_FORMED_PRESET_ID.flags).toBe(PRESET_ID_PATTERN.flags);
  });

  it('truncates the id at 40 characters with an ellipsis', () => {
    const forty = 'a'.repeat(40);
    expect(presetLinkUnknownMessage(forty, true)).toContain(`“${forty}”`);
    expect(presetLinkUnknownMessage(`${forty}b`, true)).toContain(`“${forty}…”`);
  });
});
