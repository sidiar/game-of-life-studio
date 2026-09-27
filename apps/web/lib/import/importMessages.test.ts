import { describe, expect, it } from 'vitest';
import {
  FILE_READ_FAILURE_MESSAGE,
  importSuccessMessage,
  importWarningText,
} from './importMessages';

describe('importWarningText', () => {
  it("reads 'this workspace' for kind: 'workspace'", () => {
    expect(importWarningText('workspace')).toBe(
      'Importing this workspace will replace your entire current workspace — all current ' +
        'battles and organisms will be lost. Export your current workspace first?',
    );
  });

  it("reads 'this battle' for kind: 'battle', and still warns about the WHOLE workspace (M8)", () => {
    const text = importWarningText('battle');
    expect(text).toMatch(/^Importing this battle will replace your entire current workspace/);
    expect(text).toMatch(/all current battles and organisms will be lost/);
  });
});

describe('importSuccessMessage', () => {
  it('pluralises 0/1/many battles and organisms correctly', () => {
    expect(importSuccessMessage({ kind: 'workspace', battleCount: 0, organismCount: 1 })).toBe(
      'Import complete — your workspace now has 0 battles and 1 organism.',
    );
    expect(importSuccessMessage({ kind: 'workspace', battleCount: 1, organismCount: 5 })).toBe(
      'Import complete — your workspace now has 1 battle and 5 organisms.',
    );
    expect(importSuccessMessage({ kind: 'battle', battleCount: 3, organismCount: 5 })).toBe(
      'Import complete — your workspace now has 3 battles and 5 organisms.',
    );
  });
});

describe('FILE_READ_FAILURE_MESSAGE', () => {
  it('claims the file could not be read, distinct from the import-pipeline fallback copy', () => {
    expect(FILE_READ_FAILURE_MESSAGE).toMatch(/could not be read/);
    expect(FILE_READ_FAILURE_MESSAGE).toMatch(/workspace was not changed/);
  });
});
