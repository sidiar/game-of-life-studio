import {
  CorruptDataError,
  ImportError,
  NewerFormatVersionError,
  QuotaExceededError,
} from '@gol/persistence';

/**
 * Story 5.9's copy table (Dev Notes FD4) — plain, non-technical, no story IDs, no `error.message`.
 * The claims are fixed even where the wording may later be polished:
 *
 * `applyImport` wraps its whole write region (clear, both `replaceAll`s, the default-organism
 * re-ensure) so any throw inside it becomes `'write-failed'` / `'rollback-failed'`; every other
 * rejection — `fromEnvelope`, the snapshot read, a programming error — is thrown before its first
 * write, and nothing after the region can throw — so "workspace not changed" is a PROPERTY of the
 * write path (the same reasoning `saveFailureMessage.ts`'s
 * header states for its own claims), not a hedge this function is guessing at. The one outcome
 * where it would be false, `'rollback-failed'`, is the one branch below that never says it.
 *
 * `error.cause instanceof QuotaExceededError`: `ImportError('write-failed', { cause })` carries the
 * underlying write failure as `cause` (`workspaceImport.ts`'s `applyImport`), so a storage-full
 * write is identifiable without a new `ImportErrorCode`.
 *
 * `NewerFormatVersionError` is tested BEFORE `CorruptDataError` would be (Story 5.7): it is a
 * `CorruptDataError` subclass, and it is the one class this function branches on outside
 * `ImportError` — a snapshot read against a store written by a newer build propagates unwrapped
 * (`workspaceImport.ts`'s `applyImport` JSDoc), never as an `ImportError`.
 */
export function importFailureMessage(error: unknown): string {
  if (error instanceof ImportError) {
    switch (error.code) {
      case 'not-json':
      case 'corrupt':
        return (
          'This file is not a valid Game of Life Studio export file, or it is damaged. ' +
          'Your workspace was not changed.'
        );
      case 'dangling-reference':
        return (
          'This file is incomplete: it refers to organisms it does not include. Your workspace ' +
          'was not changed.'
        );
      case 'newer-version':
        return (
          'This file was made by a newer version of the app. Reload to get the latest version, ' +
          'then try again. Your workspace was not changed.'
        );
      case 'write-failed':
        if (error.cause instanceof QuotaExceededError) {
          return (
            "This import is too large for this browser's storage. Your workspace was restored " +
            'to what it was before.'
          );
        }
        return (
          'The import could not be completed. Your workspace was restored to what it was ' +
          'before — try again.'
        );
      case 'rollback-failed':
        // ⚠️ Must never say "not changed" / "unchanged" — this is the one outcome where that
        // claim is false (errors.ts's `ImportErrorCode` doc comment).
        return (
          'The import failed partway through, and your previous workspace could not be fully ' +
          'restored. Reload, and restore from a backup (for example, an exported file) if ' +
          'anything is missing.'
        );
      default: {
        // Compile-time exhaustiveness: a new `ImportErrorCode` must get its own row here, never
        // fall silently into the fallback below — which claims "not changed", and a new code may
        // well be a partial-write one.
        const unhandled: never = error.code;
        void unhandled;
      }
    }
  }

  if (error instanceof NewerFormatVersionError) {
    return (
      'Your saved workspace is from a newer version of the app. Reload the page — nothing was ' +
      'imported.'
    );
  }

  // After the subclass above (Story 5.11): the snapshot read hit a store this build cannot read at
  // all — an unusable `gol:schema` stamp — and threw before any write. The file is not the
  // problem, so the file-blaming fallback below would mislead.
  if (error instanceof CorruptDataError) {
    return 'Your saved workspace could not be read, so nothing was imported.';
  }

  // The one fallback branch (Task 2.1): a step's programming error, a rejected `File.text()`
  // caught upstream and re-thrown, or anything else this table does not name. Never
  // `error.message` — an unrecognised throw could carry anything, including a stack trace.
  return 'This file could not be imported. Your workspace was not changed.';
}
