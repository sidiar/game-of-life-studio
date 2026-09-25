import {
  CONWAYS_CLASSIC_ID,
  findDanglingReferences,
  fromEnvelope,
  isFormatMigrationError,
  migrate,
  WorkspaceExportSchema,
  type Battle,
  type ExportKind,
  type Organism,
  type WorkspaceExport,
} from '@gol/domain';
import type { AppRepositories } from './repositories';
import { ensureDefaultOrganism } from './ensureDefaultOrganism';
import { assertSafeCollectionId, describeIssues, ImportError } from './errors';

/*
 * THE ATOMIC IMPORT PIPELINE (AR-10 / RFC-006 Decision 5), in this order and no other:
 *
 *   1. JSON.parse
 *   2. migrate(parsed, 'envelope')
 *   3. WorkspaceExportSchema.safeParse
 *   4. assertReferentialClosure
 *   5. snapshot the current workspace
 *   6. clearAll → organisms.replaceAll → battles.replaceAll → ensureDefaultOrganism
 *   7. on any throw in 6, restore the snapshot
 *
 * Steps 1-4 are `validateImportFile`: pure, writing nothing and reading no storage, so a bad file
 * cannot reach the workspace at all. Steps 5-7 are `applyImport`, the only half that holds
 * `AppRepositories`.
 *
 * Migration runs BEFORE the parse (AR-11 / Decision I): the schema's `formatVersion` is a literal,
 * so an old file must be upgraded before it can be judged, and a newer one is refused by
 * `migrate` with a real "too new" answer rather than a schema failure.
 *
 * `kind` is never branched on (M8 / FR-8.4): a battle-kind file replaces the whole workspace
 * exactly as a workspace-kind one does. Settings are untouched BY CONSTRUCTION (AR-12 / Decision
 * F): nothing here references `repos.settings`, the snapshot holds only battles and organisms, and
 * `clearAll()` is data-only — there is no settings snapshot-and-restore to get wrong.
 */

/** What `applyImport` wrote — the figures Story 5.9's confirmation reports. */
export interface ImportSummary {
  kind: ExportKind;
  battleCount: number;
  /** After `ensureDefaultOrganism`: includes a Conway's Classic the import itself had to add. */
  organismCount: number;
}

/**
 * Steps 1-4: turns file text into a proven envelope, or throws `ImportError`. Touches no storage,
 * which is why it is exported separately — Story 5.9 may validate at file-pick time, before its
 * destructive-replace warning, without holding any repository.
 */
export function validateImportFile(fileText: string): WorkspaceExport {
  let parsed: unknown;
  try {
    parsed = JSON.parse(fileText) as unknown;
  } catch (error) {
    throw new ImportError('not-json', { cause: error });
  }

  const migrated = migrateEnvelope(parsed);

  const result = WorkspaceExportSchema.safeParse(migrated);
  if (!result.success) {
    throw new ImportError('corrupt', {
      issues: result.error.issues,
      detail: describeIssues(result.error.issues),
    });
  }
  const envelope = result.data;

  // `OrganismSchema.id` is a bare non-empty string, so `__proto__` parses — and
  // `LocalStorageOrganismRepository.replaceAll` would then throw on it AFTER `clearAll()` had run.
  // The rollback would recover, but a file's validity is decided here, before the snapshot: the
  // existing guard is reused rather than re-stated.
  for (const organism of envelope.organisms) {
    try {
      assertSafeCollectionId(organism.id);
    } catch (error) {
      throw new ImportError('corrupt', { detail: `organism id "${organism.id}"`, cause: error });
    }
  }

  assertReferentialClosure(envelope);
  return envelope;
}

/**
 * Maps the migration chain's refusal into the import's vocabulary. A thrown value that is not a
 * `FormatMigrationError` is a step's programming error, not the file's fault, so it passes through
 * unwrapped — exactly as `ensureCurrentAtRestFormat` treats it at rest.
 */
function migrateEnvelope(parsed: unknown): unknown {
  try {
    return migrate(parsed, 'envelope');
  } catch (error) {
    if (!isFormatMigrationError(error)) throw error;
    // `foundVersion` is typed `unknown` on the migration error; checked rather than cast so
    // `ImportError.foundVersion: number` never lies. `migrate` only reaches 'newer-version' past
    // its integer check, so the fallthrough to 'corrupt' is defensive.
    if (error.code === 'newer-version' && typeof error.foundVersion === 'number') {
      throw new ImportError('newer-version', {
        foundVersion: error.foundVersion,
        supportedVersion: error.supportedVersion,
        detail: error.message,
        cause: error,
      });
    }
    // 'corrupt' (no usable version, not an object) and 'missing-step' — the latter unreachable
    // for the production registry, and mapped as it is at rest.
    throw new ImportError('corrupt', { detail: error.message, cause: error });
  }
}

/**
 * Step 4 (RFC-006 Decision 5's name — `organismClosure.ts` and the serializer point here by it).
 * The derivation is `@gol/domain`'s `findDanglingReferences`; this only turns its list into the
 * typed rejection, carrying every dangling id at once.
 */
function assertReferentialClosure(envelope: WorkspaceExport): void {
  const dangling = findDanglingReferences(envelope);
  if (dangling.length === 0) return;
  throw new ImportError('dangling-reference', {
    dangling,
    detail: dangling.map((ref) => `"${ref.id}" (${ref.kind} of ${ref.referencedBy})`).join(', '),
  });
}

interface WorkspaceSnapshot {
  battles: Battle[];
  organisms: Organism[];
  wasFresh: boolean;
}

/**
 * Steps 5-7: the destructive whole-workspace replace (M8), guarded by a snapshot.
 *
 * ⚠️ The snapshot reads through the repository interfaces (`listFull` / `list`) and the restore
 * writes through them (`clearAll` / `replaceAll`) — the bulk methods the architecture added for
 * this path, which keeps import mode-agnostic. The known cost (recorded in `deferred-work.md`):
 * `listFull()` / `list()` SKIP a per-record-corrupt entry, so a rollback restores every READABLE
 * record rather than the exact bytes; and a whole-collection-corrupt store fails the snapshot read,
 * so it cannot be imported over until Story 5.11's reset exists.
 *
 * A snapshot read that throws propagates UNCHANGED, before anything is written: the fault is in
 * the store, not the file, and reporting it is Story 5.11's.
 */
export async function applyImport(
  repos: AppRepositories,
  envelope: WorkspaceExport,
): Promise<ImportSummary> {
  // Pure, and done before the snapshot so no work that can fail sits inside the write region.
  const incoming = fromEnvelope(envelope);

  const snapshot: WorkspaceSnapshot = {
    battles: await repos.battles.listFull(),
    organisms: await repos.organisms.list(),
    wasFresh: await repos.isFreshWorkspace(),
  };

  try {
    // Clear FIRST and write organisms before battles: the store's peak size is then never old
    // battles + new organisms + new battles, which is what a quota failure is most likely to hit.
    await repos.clearAll();
    await repos.organisms.replaceAll(incoming.organisms);
    await repos.battles.replaceAll(incoming.battles);
    // Inside the guarded region: a failure here is a failed import too (M9 / AR-13). It never
    // overwrites an imported, possibly edited, `conways-classic`.
    await ensureDefaultOrganism(repos.organisms);
  } catch (writeError) {
    try {
      await restore(repos, snapshot);
    } catch (rollbackError) {
      // Neither error is swallowed: the write's is `cause`, the restore's rides beside it.
      throw new ImportError('rollback-failed', { cause: writeError, rollbackError });
    }
    throw new ImportError('write-failed', { cause: writeError });
  }

  const carriesConway = incoming.organisms.some((organism) => organism.id === CONWAYS_CLASSIC_ID);
  return {
    kind: envelope.kind,
    battleCount: incoming.battles.length,
    organismCount: incoming.organisms.length + (carriesConway ? 0 : 1),
  };
}

/*
 * ⚠️ A FRESH workspace is restored as "fresh after its first load", not as fresh. `replaceAll`
 * stamps `gol:schema`, so restoring an empty snapshot leaves a stamped-but-empty store that
 * `isFreshWorkspace()` will never seed again — the hole the at-rest stamp-ordering comment in
 * `localStorageAccess.ts` describes. Ending with `ensureDefaultOrganism` puts back what the next
 * load's seed would have written.
 */
async function restore(repos: AppRepositories, snapshot: WorkspaceSnapshot): Promise<void> {
  await repos.clearAll();
  await repos.organisms.replaceAll(snapshot.organisms);
  await repos.battles.replaceAll(snapshot.battles);
  if (snapshot.wasFresh) await ensureDefaultOrganism(repos.organisms);
}
