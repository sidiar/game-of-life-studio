import {
  CorruptDataError,
  NewerFormatVersionError,
  QuotaExceededError,
  STORAGE_KEYS,
} from '@gol/persistence';

/*
 * The one classifier for a load-time storage failure (Story 5.11, NFR-7.3). Class-based, never
 * message-based: a message is developer-facing and free to change. The error classes and
 * `STORAGE_KEYS` are imported as VALUES from the persistence barrel — legitimate for the same
 * reason `saveFailureMessage.ts` gives: they are the seam's published error contract, not a
 * repository (AR-2 / AR-27).
 */

export type StorageFailureKind =
  'newer-version' | 'corrupt-workspace' | 'corrupt-settings' | 'storage-full' | 'unavailable';

/**
 * ⚠️ `NewerFormatVersionError` is tested FIRST: it is a `CorruptDataError` subclass, and a newer
 * build's store is intact — it must never reach the kind that offers a reset (Story 5.7 owner
 * ruling). Everything unrecognised (a `SecurityError` from blocked storage, a thrown string) is
 * `'unavailable'`: its copy never calls the data damaged, because it may well not be.
 */
export function classifyStorageFailure(error: unknown): StorageFailureKind {
  if (error instanceof NewerFormatVersionError) return 'newer-version';
  if (error instanceof CorruptDataError) {
    return error.key === STORAGE_KEYS.settings ? 'corrupt-settings' : 'corrupt-workspace';
  }
  if (error instanceof QuotaExceededError) return 'storage-full';
  return 'unavailable';
}

// Most to least important to show. A newer format outranks everything: any reset offer beside it
// would destroy recoverable data. Corrupt workspace data outranks corrupt settings because its
// recovery is the larger one; after it reloads the page, a remaining settings fault shows next.
const PRIORITY: readonly StorageFailureKind[] = [
  'newer-version',
  'corrupt-workspace',
  'corrupt-settings',
  'storage-full',
  'unavailable',
];

/**
 * What a page shows for a storage failure: the kind, plus — for the corrupt kinds — WHICH stored
 * keys failed (`CorruptDataError.key`, distinct, in first-seen order). The keys let the
 * corrupt-workspace line name the namespace that actually failed instead of claiming both
 * collections are unreadable (Story 5.11 review, owner ruling D2 (b)). Empty for every other kind.
 */
export interface StorageFailure {
  kind: StorageFailureKind;
  corruptKeys: readonly string[];
}

/**
 * The fallback when a page is in its error state with no classifiable rejection (e.g. a seed that
 * failed with no value): the non-destructive Reload, never a reset.
 */
export const UNCLASSIFIED_STORAGE_FAILURE: StorageFailure = Object.freeze({
  kind: 'unavailable',
  corruptKeys: Object.freeze([]),
});

/** The one failure a page shows when several reads failed at once (FD2's priority). `undefined`
 * entries — reads that did not fail — are skipped; `null` when none failed. */
export function pickStorageFailure(errors: readonly unknown[]): StorageFailure | null {
  const failed = errors.filter((e) => e !== undefined);
  const kinds = new Set(failed.map(classifyStorageFailure));
  const kind = PRIORITY.find((k) => kinds.has(k));
  if (kind === undefined) return null;
  const corruptKeys =
    kind === 'corrupt-workspace' || kind === 'corrupt-settings'
      ? [
          ...new Set(
            failed
              .filter((e): e is CorruptDataError => classifyStorageFailure(e) === kind)
              .map((e) => e.key),
          ),
        ]
      : [];
  return { kind, corruptKeys };
}
