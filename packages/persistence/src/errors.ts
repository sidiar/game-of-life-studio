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
