import { describe, expect, it } from 'vitest';
import {
  CorruptDataError,
  ImportError,
  NewerFormatVersionError,
  QuotaExceededError,
  STORAGE_KEYS,
} from '@gol/persistence';
import { importFailureMessage } from './importFailureMessage';

const SENTINEL = 'SENTINEL-DETAIL-Story-5.9-zod.path.here';

describe('importFailureMessage', () => {
  it("'not-json' reads not-a-valid-export copy, unchanged", () => {
    const message = importFailureMessage(new ImportError('not-json', { detail: SENTINEL }));
    expect(message).toMatch(/not a valid Game of Life Studio export file/);
    expect(message).toMatch(/workspace was not changed/);
  });

  it("'corrupt' reads the SAME not-a-valid-export copy as 'not-json'", () => {
    const message = importFailureMessage(new ImportError('corrupt', { detail: SENTINEL }));
    expect(message).toMatch(/not a valid Game of Life Studio export file/);
    expect(message).toMatch(/workspace was not changed/);
  });

  it("'dangling-reference' names organisms, never ids, and says unchanged", () => {
    const message = importFailureMessage(
      new ImportError('dangling-reference', { detail: SENTINEL }),
    );
    expect(message).toMatch(/incomplete/);
    expect(message).toMatch(/organisms/);
    expect(message).not.toMatch(/\bids?\b/i);
    expect(message).toMatch(/workspace was not changed/);
  });

  it("'newer-version' tells the user to reload, without stating version numbers, and says unchanged", () => {
    const message = importFailureMessage(
      new ImportError('newer-version', { foundVersion: 99, supportedVersion: 1, detail: SENTINEL }),
    );
    expect(message).toMatch(/newer version of the app/);
    expect(message).toMatch(/reload/i);
    expect(message).toMatch(/workspace was not changed/);
    expect(message).not.toMatch(/99|\b1\b/);
  });

  it("'write-failed' with a QuotaExceededError cause says storage is full and restored", () => {
    const cause = new QuotaExceededError(STORAGE_KEYS.battles, { cause: new Error('quota') });
    const message = importFailureMessage(new ImportError('write-failed', { cause }));
    expect(message).toMatch(/too large for this browser's storage/);
    expect(message).toMatch(/restored/);
  });

  it("'write-failed' with any other cause says it could not be completed and was restored", () => {
    const message = importFailureMessage(
      new ImportError('write-failed', { cause: new Error('disk error') }),
    );
    expect(message).toMatch(/could not be completed/);
    expect(message).toMatch(/restored/);
    expect(message).toMatch(/try again/i);
  });

  it("'rollback-failed' says the workspace may need manual restoration and NEVER claims unchanged", () => {
    const message = importFailureMessage(
      new ImportError('rollback-failed', {
        cause: new Error('write boom'),
        rollbackError: SENTINEL,
      }),
    );
    expect(message).toMatch(/could not be fully restored/);
    expect(message).toMatch(/reload/i);
    expect(message).toMatch(/backup/i);
    expect(message).not.toMatch(/not changed/i);
    expect(message).not.toMatch(/unchanged/i);
  });

  it('a NewerFormatVersionError (unwrapped, from the snapshot read) is distinguished from a plain CorruptDataError', () => {
    const newer = new NewerFormatVersionError(STORAGE_KEYS.schema, 99, 1, SENTINEL);
    const newerMessage = importFailureMessage(newer);
    expect(newerMessage).toMatch(/saved workspace is from a newer version/);
    expect(newerMessage).toMatch(/reload/i);
    expect(newerMessage).toMatch(/nothing was imported/i);

    // A plain CorruptDataError is NOT a NewerFormatVersionError, so it must reach its own branch
    // (Story 5.11) rather than reuse the "newer version" copy — proving the ordering rule
    // (NewerFormatVersionError checked before the CorruptDataError branch) actually matters.
    const corrupt = new CorruptDataError(STORAGE_KEYS.battles, SENTINEL);
    const corruptMessage = importFailureMessage(corrupt);
    expect(corruptMessage).not.toMatch(/newer version/);
    expect(corruptMessage).not.toContain(SENTINEL);
  });

  // Story 5.11: an unusable stamp fails the snapshot read — the store, not the file, is unreadable.
  it('a plain CorruptDataError from the snapshot read says the saved workspace could not be read', () => {
    const message = importFailureMessage(new CorruptDataError(STORAGE_KEYS.schema, SENTINEL));
    expect(message).toBe('Your saved workspace could not be read, so nothing was imported.');
  });

  it('a non-Error rejection falls to the one fallback branch', () => {
    const message = importFailureMessage('a bare string rejection');
    expect(message).toMatch(/could not be imported/);
    expect(message).toMatch(/workspace was not changed/);
  });

  it('no message contains a story id, a Zod path, or error.message — the sentinel never leaks through', () => {
    const codes = [
      'not-json',
      'corrupt',
      'dangling-reference',
      'newer-version',
      'write-failed',
      'rollback-failed',
    ] as const;
    for (const code of codes) {
      const message = importFailureMessage(
        new ImportError(code, { detail: SENTINEL, cause: new Error(SENTINEL) }),
      );
      expect(message).not.toContain(SENTINEL);
      expect(message).not.toMatch(/story\s*5\.9/i);
    }
  });
});
