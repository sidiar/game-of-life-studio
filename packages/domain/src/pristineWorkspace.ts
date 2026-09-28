import { CONWAYS_CLASSIC } from './defaultWorkspace';
import type { Organism } from './organismSchema';
import { normalizeDescription } from './workspaceMetaSchema';

/**
 * FR-8.4's "unmodified default workspace" predicate (Story 5.9 Task 1) — the gate that lets
 * import skip its destructive-replace warning. "Unmodified" means deep-equal to the FR-1.5 seed,
 * `CONWAYS_CLASSIC`: every field, including `survivalRules`' `id`/`contentHash` — a rule deleted
 * and re-added produces a NEW `id`/`contentHash` pair in this codebase's authoring flow (Epic 4),
 * so a workspace that still carries the two originals really is untouched, and one that does not
 * really was edited. A rule REORDER keeps its ids; it is caught because arrays compare in order. This lives in `@gol/domain`, not
 * `apps/web`, because it is a workspace-integrity predicate over `Organism` values — the same
 * "pure logic in `packages/domain`" placement `organismDeleteGuard.ts` and the referential-
 * integrity indexes already follow (project-context.md).
 */

/** Key-order-insensitive deep equality over plain JSON values — objects, arrays, primitives. */
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;

  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b)) return false;
    if (a.length !== b.length) return false;
    return a.every((value, index) => deepEqual(value, b[index]));
  }

  if (
    a !== null &&
    b !== null &&
    typeof a === 'object' &&
    typeof b === 'object' &&
    !Array.isArray(a) &&
    !Array.isArray(b)
  ) {
    const aRecord = a as Record<string, unknown>;
    const bRecord = b as Record<string, unknown>;
    const aKeys = Object.keys(aRecord);
    const bKeys = Object.keys(bRecord);
    // Key ORDER is deliberately not compared — a Zod parse and a hand-edited store are free to
    // emit the same keys in different orders, and that is not a content difference (the reason
    // `JSON.stringify` comparison is banned above this function).
    if (aKeys.length !== bKeys.length) return false;
    return aKeys.every(
      (key) => Object.hasOwn(bRecord, key) && deepEqual(aRecord[key], bRecord[key]),
    );
  }

  // Primitives that reached here (numbers, strings, booleans, null vs non-null, etc.) already
  // failed the `a === b` check above, so they are unequal — including the NaN case, which this
  // predicate has no reason to special-case (no `Organism` field is ever NaN).
  return false;
}

/**
 * True iff the workspace has nothing an import could destroy: zero battles, the organism library
 * holds exactly one organism, deep-equal to `CONWAYS_CLASSIC`, and there is no workspace
 * description (Story 7.2 FD6 — it is user content the destructive replace would destroy, so
 * skipping the FR-8.4 warning over it would be silent data loss). Reads fresh values — never a
 * cached count — because the whole point is to answer "right now, before this import writes", not
 * "as of the page's last render". `workspaceDescription` defaults to none so callers that predate
 * the field keep their meaning.
 */
export function isPristineWorkspace(
  battleCount: number,
  organisms: readonly Organism[],
  workspaceDescription?: string,
): boolean {
  if (
    workspaceDescription !== undefined &&
    normalizeDescription(workspaceDescription) !== undefined
  )
    return false;
  if (battleCount !== 0) return false;
  if (organisms.length !== 1) return false;
  return deepEqual(organisms[0], CONWAYS_CLASSIC);
}
