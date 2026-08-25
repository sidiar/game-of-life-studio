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
