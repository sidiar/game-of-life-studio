import type { DanglingReference } from '@gol/domain';

/** Stored data that exists but cannot be read as what it claims to be (NFR-7.3). */
export class CorruptDataError extends Error {
  constructor(
    readonly key: string,
    detail: string,
    options?: { cause?: unknown },
  ) {
    super(`Stored data under "${key}" could not be read: ${detail}`, { ...options });
    this.name = 'CorruptDataError';
  }
}

/**
 * The store was written by a NEWER build of the app: its `gol:schema` stamp is past the format this
 * build supports (AR-11 / Decision I — `FormatMigrationError` code `'newer-version'`, carried as
 * `cause`). Not corruption: the data is intact and a newer build reads it, so the recovery is a
 * reload into that build — never a reset, which would destroy recoverable data (owner decision,
 * Story 5.7 review, 2026-09-25). Thrown before anything is written.
 *
 * A SUBCLASS of `CorruptDataError`, not a sibling, so every existing "stored data is unreadable"
 * path stays correct unchanged: this build genuinely cannot read the data, and each of those paths
 * is non-destructive (`saveFailureMessage`'s "nothing already stored was changed", the Gallery's
 * degrade-to-empty catches, `load()`'s documented throw). A UI that WOULD act destructively on
 * corrupt data — a reset offer — must test `instanceof NewerFormatVersionError` FIRST.
 */
export class NewerFormatVersionError extends CorruptDataError {
  constructor(
    key: string,
    readonly foundVersion: number,
    readonly supportedVersion: number,
    detail: string,
    options?: { cause?: unknown },
  ) {
    super(key, detail, options);
    this.name = 'NewerFormatVersionError';
  }
}

/**
 * `WorkspaceSerializer.exportBattle(id)` found no battle under that id (RFC-006 Decision 4's
 * `ExportError('not-found')`, restored by owner ruling — Story 5.4 review, 2026-09-24). `code` is
 * the RFC snippet's `'not-found'` discriminant, so callers branch on it rather than parse
 * `message`. The constructor EXTENDS the snippet's one-argument `new ExportError('not-found')` with
 * the missing `id`, for a useful message — recorded in `deferred-work.md` beside the withdrawn
 * variance (7). Widening `code` means widening the message too; it names "No battle" today.
 */
export class ExportError extends Error {
  constructor(
    readonly code: 'not-found',
    readonly id: string,
  ) {
    super(`No battle found for id "${id}"`);
    this.name = 'ExportError';
  }
}

/**
 * Why an import file was refused, or how its write went wrong (RFC-006 Decision 3 / Decision 5).
 * Six codes: Decision 3's `'not-json' | 'newer-version' | 'corrupt'`, Decision 5's `'write-failed'`,
 * and two additions recorded as a variance in `deferred-work.md`:
 *
 *   - `'dangling-reference'` — the file references organisms it does not carry. A different thing
 *                              to tell the user than "this is not a workspace file at all".
 *   - `'rollback-failed'`    — ⚠️ MUST stay distinct from `'write-failed'`. `'write-failed'` means
 *                              the rollback succeeded and the workspace is exactly as it was, which
 *                              is what lets Story 5.9 say "your workspace is unchanged". Here the
 *                              restore threw too, so that sentence would be a lie; folding the two
 *                              codes together makes the reassuring copy reachable from the one
 *                              outcome it is false for.
 *
 * ⚠️ One caveat on `'write-failed'`'s "exactly as it was": rolling back over a workspace that was
 * still FRESH (never seeded) restores it as "fresh after its first load" — stamped, with Conway's
 * Classic ensured — because `replaceAll` stamps `gol:schema` and an empty-but-stamped store would
 * never be seeded again (see `workspaceImport.ts`'s restore note). Equivalent, not byte-identical,
 * for that one shape; unreachable from `/settings` today, where the seed runs first.
 */
export type ImportErrorCode =
  | 'not-json'
  | 'newer-version'
  | 'corrupt'
  | 'dangling-reference'
  | 'write-failed'
  | 'rollback-failed';

export interface ImportErrorDetails {
  /** `'newer-version'`: the file's `formatVersion`, and the one this build supports. */
  foundVersion?: number;
  supportedVersion?: number;
  /** `'corrupt'` from a schema failure: the Zod issues, for diagnostics — never shown verbatim. */
  issues?: readonly { path: PropertyKey[]; message: string }[];
  /** `'dangling-reference'`: every unresolvable id at once. */
  dangling?: readonly DanglingReference[];
  /** `'rollback-failed'`: the restore's own error. The write's error is `cause`. */
  rollbackError?: unknown;
  /** Appended to the message — developer-facing only; the UI's wording is Story 5.9's. */
  detail?: string;
  cause?: unknown;
}

const IMPORT_MESSAGES: Readonly<Record<ImportErrorCode, string>> = {
  'not-json': 'The import file is not valid JSON',
  'newer-version': 'The import file was written by a newer format than this build supports',
  corrupt: 'The import file is not a valid workspace export',
  'dangling-reference': 'The import file references organisms it does not carry',
  'write-failed': 'The import could not be written; the previous workspace was restored',
  'rollback-failed':
    'The import could not be written, and restoring the previous workspace failed too',
};

/**
 * `WorkspaceSerializer.importWorkspace`'s one rejection type, the same pattern as `ExportError`:
 * callers branch on `code`, never on `message`. `QuotaExceededError` from a failed write stays
 * reachable as `cause`, so "storage is full" is still identifiable under `'write-failed'`.
 */
export class ImportError extends Error {
  readonly foundVersion?: number;
  readonly supportedVersion?: number;
  readonly issues?: readonly { path: PropertyKey[]; message: string }[];
  readonly dangling?: readonly DanglingReference[];
  readonly rollbackError?: unknown;

  constructor(
    readonly code: ImportErrorCode,
    details: ImportErrorDetails = {},
  ) {
    const { detail, cause, ...fields } = details;
    super(
      detail === undefined ? IMPORT_MESSAGES[code] : `${IMPORT_MESSAGES[code]}: ${detail}`,
      cause === undefined ? undefined : { cause },
    );
    this.name = 'ImportError';
    this.foundVersion = fields.foundVersion;
    this.supportedVersion = fields.supportedVersion;
    this.issues = fields.issues;
    this.dangling = fields.dangling;
    this.rollbackError = fields.rollbackError;
  }
}

/** Flattens Zod issues into one line for a CorruptDataError message. */
export function describeIssues(
  issues: readonly { path: PropertyKey[]; message: string }[],
): string {
  return issues.map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`).join('; ');
}

/**
 * Rejects the one id an id-keyed plain-object collection cannot safely hold. `collection[id] =
 * record` for `id === '__proto__'` does not create an own property — it rebinds the object's
 * internal prototype instead, so the record silently vanishes from `Object.entries`/`list()` and
 * is never serialised by the next `JSON.stringify`. `BattleSchema.id` is a `z.uuid()` so this
 * cannot reach the battle collection; `OrganismSchema.id` is a bare non-empty string (deliberately,
 * to allow well-known ids like 'conways-classic'), so organism ids need the explicit guard.
 */
export function assertSafeCollectionId(id: string): void {
  if (id === '__proto__') {
    throw new Error(
      `"${id}" cannot be used as an id — it collides with the storage collection's own prototype slot.`,
    );
  }
}
