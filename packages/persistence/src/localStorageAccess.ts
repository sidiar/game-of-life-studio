import { CURRENT_FORMAT_VERSION, isFormatMigrationError, migrate } from '@gol/domain';
import type { Migrator } from '@gol/domain';
import { CorruptDataError } from './errors';
import type { StorageUsage } from './repositories';

// The flat, prefixed key namespace (RFC-006 Decision 7 / AR-9). Centralised so no repository
// carries a bare string literal — a typo'd key silently reads an empty store rather than failing.
export const STORAGE_KEYS = Object.freeze({
  schema: 'gol:schema',
  battles: 'gol:battles',
  organisms: 'gol:organisms',
  settings: 'gol:settings',
} as const);

export type StorageKey = (typeof STORAGE_KEYS)[keyof typeof STORAGE_KEYS];

// The keys clearAll() is allowed to remove, enumerated explicitly. gol:settings is absent from
// this list BY CONSTRUCTION (AC5 / Decision F.2): a prefix scan over localStorage would sweep it
// into the deletion path and leave the guarantee one typo away from false.
const DATA_KEYS = Object.freeze([STORAGE_KEYS.battles, STORAGE_KEYS.organisms] as const);

/** A write refused for lack of space. Non-destructive: the previous value is still stored. */
export class QuotaExceededError extends Error {
  constructor(
    readonly key: string,
    options?: { cause?: unknown },
  ) {
    super(`Storage full — could not write "${key}". Export and remove a battle to free space.`, {
      ...options,
    });
    this.name = 'QuotaExceededError';
  }
}

// Browsers disagree on how a full store reports itself, and NFR-2.1 commits us to four of them:
// Chrome/Edge/Safari raise a DOMException named 'QuotaExceededError' (code 22, legacy name
// QUOTA_EXCEEDED_ERR), Firefox has used 'NS_ERROR_DOM_QUOTA_REACHED' (code 1014). Match on name
// OR code — never on message text, which is unstable and localised.
const QUOTA_ERROR_NAMES = new Set([
  'QuotaExceededError',
  'QUOTA_EXCEEDED_ERR',
  'NS_ERROR_DOM_QUOTA_REACHED',
]);
const QUOTA_ERROR_CODES = new Set([22, 1014]);

function isQuotaExceeded(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const { name, code } = error as { name?: unknown; code?: unknown };
  return (
    (typeof name === 'string' && QUOTA_ERROR_NAMES.has(name)) ||
    (typeof code === 'number' && QUOTA_ERROR_CODES.has(code))
  );
}

function writeKey(key: StorageKey, value: unknown): void {
  // Candidate-string-then-setItem (AR-14 / RFC-006 Decision 7): the complete next state is
  // serialised BEFORE localStorage is touched, then handed over in a single setItem. Nothing
  // clears, empties, or incrementally appends to the key first, so a quota failure leaves the
  // previous value byte-identical — the write simply did not happen.
  commitCandidate(key, JSON.stringify(value));
}

function commitCandidate(key: StorageKey, candidate: string): void {
  try {
    localStorage.setItem(key, candidate);
  } catch (error) {
    if (isQuotaExceeded(error)) throw new QuotaExceededError(key, { cause: error });
    throw error;
  }
}

/** Raw parsed value, or `undefined` when the key has never been written. */
export function readStoredValue(key: StorageKey): unknown {
  const raw = localStorage.getItem(key);
  if (raw === null) return undefined;
  try {
    return JSON.parse(raw) as unknown;
  } catch (error) {
    throw new CorruptDataError(key, 'not valid JSON', { cause: error });
  }
}

// The raw collection read, WITHOUT the format check. `ensureCurrentAtRestFormat` needs both
// collections before it can decide anything, and reading them through `readCollection` would
// re-enter the check and recurse.
function readRawCollection(key: StorageKey): Record<string, unknown> {
  const parsed = readStoredValue(key);
  if (parsed === undefined) return {};
  // An array parses as JSON but would hand every downstream consumer numeric "ids".
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new CorruptDataError(key, 'expected an object keyed by id');
  }
  return parsed as Record<string, unknown>;
}

function asCollection(key: StorageKey, value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new CorruptDataError(key, 'a format migration did not produce an object keyed by id');
  }
  return value as Record<string, unknown>;
}

function memoize<T>(read: () => T): () => T {
  let cached: { value: T } | undefined;
  return () => (cached ??= { value: read() }).value;
}

/*
 * THE AT-REST FORMAT CHECK (AR-11 / Decision I.3): the same `migrate()` file import runs, at the
 * other boundary. Runs on EVERY collection read, statelessly — not once at bootstrap, because
 * `/battle?id=` deep-links read the repositories without any bootstrap hook, and not behind a
 * module-level "already migrated" flag, which would go stale the moment another tab migrates. Every
 * write is read-modify-write through `readCollection`, so writes are covered too. The cost is one
 * `getItem` and a ~20-byte `JSON.parse`. `gol:settings` is outside the chain (Decision F): it is
 * never in any envelope and self-heals through `SettingsSchema`'s defaults.
 *
 * A thrown `FormatMigrationError` — a newer build's data, or a stamp with no usable version — is
 * surfaced as `CorruptDataError` with the migration error as `cause`, so every existing
 * "can't read your data" path handles it and a caller can still tell `newer-version` apart. It is
 * thrown before anything is written: declining to reset leaves the store exactly as it was.
 *
 * Exported for tests only (the injected `migrator` is how the write-back path is reachable while
 * the real registry is empty); the package barrel does not re-export it.
 */
export function ensureCurrentAtRestFormat(migrator: Migrator = migrate): void {
  const lazyBattles = memoize(() => readRawCollection(STORAGE_KEYS.battles));
  const lazyOrganisms = memoize(() => readRawCollection(STORAGE_KEYS.organisms));

  // Absent ⇒ fresh store, or only settings were ever written (settings never stamp).
  const stamp = readStoredValue(STORAGE_KEYS.schema);
  if (stamp === undefined) return;
  if (typeof stamp !== 'object' || stamp === null || Array.isArray(stamp)) {
    throw new CorruptDataError(STORAGE_KEYS.schema, 'expected a { formatVersion } record');
  }

  // Raw JSON, no Zod parse — migration runs BEFORE validation here too. The envelope's own
  // top-level names, so a step reads the same keys at either boundary. The collections are LAZY:
  // the identity path never touches them, so a current store pays for the stamp alone, and a
  // corrupt `gol:battles` cannot make an organism read fail. A step that does read one gets the
  // same CorruptDataError `readCollection` would have thrown.
  const doc = {
    formatVersion: (stamp as { formatVersion?: unknown }).formatVersion,
    get battles() {
      return lazyBattles();
    },
    get organisms() {
      return lazyOrganisms();
    },
  };

  let migrated;
  try {
    migrated = migrator(doc, 'at-rest');
  } catch (error) {
    if (isFormatMigrationError(error)) {
      throw new CorruptDataError(STORAGE_KEYS.schema, error.message, { cause: error });
    }
    throw error;
  }
  // Identity passthrough: the stored data is already current. The only path reachable while the
  // registry is empty.
  if (migrated === doc) return;

  writeBackMigrated(
    asCollection(STORAGE_KEYS.battles, migrated['battles']),
    asCollection(STORAGE_KEYS.organisms, migrated['organisms']),
    migrated['formatVersion'],
  );
}

/*
 * WRITE-BACK ORDERING IS LOAD-BEARING, and differs from `stampSchemaVersion`'s on purpose.
 * Migration steps are NOT idempotent, and localStorage has no multi-key transaction, so every
 * failure must leave either the fully-old store or the fully-new one — never migrated data under
 * an old stamp:
 *
 *   data written, stamp not    -> the next load re-runs the steps over already-migrated data.
 *                                 So a stamp-write failure ALSO restores both data originals.
 *   battles written, organisms  -> half the store is on the new format. Restore battles.
 *   not
 *
 * Both candidates are serialised before storage is touched (the `writeKey` discipline), the
 * originals are captured, and the stamp is OVERWRITTEN last — `stampSchemaVersion()` only writes
 * an absent stamp, which is the wrong tool here. The original error (a `QuotaExceededError` stays
 * one) is rethrown after the rollback.
 */
function writeBackMigrated(
  battles: Record<string, unknown>,
  organisms: Record<string, unknown>,
  formatVersion: unknown,
): void {
  const candidates = [
    [STORAGE_KEYS.battles, JSON.stringify(battles)],
    [STORAGE_KEYS.organisms, JSON.stringify(organisms)],
    [STORAGE_KEYS.schema, JSON.stringify({ formatVersion })],
  ] as const;
  const originals = [
    [STORAGE_KEYS.battles, localStorage.getItem(STORAGE_KEYS.battles)],
    [STORAGE_KEYS.organisms, localStorage.getItem(STORAGE_KEYS.organisms)],
  ] as const;
  try {
    for (const [key, candidate] of candidates) commitCandidate(key, candidate);
  } catch (error) {
    // Remove both, THEN restore: restoring one original beside the other's migrated (possibly
    // larger) value could itself exceed the quota, whereas the originals alone fit — the store held
    // exactly them a moment ago. The caller gets the write's error, not a rollback artefact.
    for (const [key] of originals) localStorage.removeItem(key);
    for (const [key, original] of originals) {
      if (original !== null) localStorage.setItem(key, original);
    }
    throw error;
  }
}

/** An id-keyed collection (`gol:battles`, `gol:organisms`); `{}` when never written. */
export function readCollection(key: StorageKey): Record<string, unknown> {
  ensureCurrentAtRestFormat();
  return readRawCollection(key);
}

/*
 * ORDERING IS LOAD-BEARING. The stamp is written only AFTER the data write it accompanies has
 * succeeded. localStorage has no multi-key transaction, so one of the two failure orders must be
 * chosen, and they are not symmetric:
 *
 *   stamp-then-data, data fails  -> stamped but empty store. Story 1.5 seeds DEFAULT_WORKSPACE
 *                                   only when gol:schema is ABSENT, so seeding is skipped and the
 *                                   user silently ends up with no Conway's Classic and no error.
 *   data-then-stamp, stamp fails -> data present, stamp missing. Fully recoverable: the next
 *                                   successful write stamps it.
 */
function stampSchemaVersion(): void {
  if (localStorage.getItem(STORAGE_KEYS.schema) !== null) return;
  writeKey(STORAGE_KEYS.schema, { formatVersion: CURRENT_FORMAT_VERSION });
}

/**
 * Fresh ⇔ no `gol:schema` record exists (RFC-006 Decision 7) — this is the storage-specific
 * ANSWER to the mode-agnostic "has this workspace ever been initialized?" question that
 * AppRepositories.isFreshWorkspace() asks. Presence-only, because freshness is a presence question:
 * "was anything ever written?". The stamp's VALUE is `formatVersion` — the one version Decision I
 * does allow a branch on — and it is read by the format check (`ensureCurrentAtRestFormat`), not
 * here.
 */
export function hasSchemaStamp(): boolean {
  return localStorage.getItem(STORAGE_KEYS.schema) !== null;
}

/** The write path for workspace DATA (battles, organisms): write, then stamp (AC2). */
export function writeDataKey(key: StorageKey, value: unknown): void {
  writeKey(key, value);
  try {
    stampSchemaVersion();
  } catch {
    // The data write above already succeeded — that IS what this function promises its caller.
    // A failure here is exactly the "data-then-stamp, stamp fails" order from the comment above,
    // which is fully recoverable: the next successful writeDataKey call re-attempts the stamp.
    // Letting it propagate would turn a genuinely successful save into a reported failure.
  }
}

/**
 * The write path for `gol:settings`, which deliberately does NOT stamp. Settings are device-local
 * preferences, not workspace data (Decision F) — and if a theme toggle stamped the schema, a user
 * who changed the theme before creating anything would hit the same stamped-but-empty seeding
 * hole described above.
 */
export function writeSettingsKey(key: StorageKey, value: unknown): void {
  writeKey(key, value);
}

/** Clears workspace data only. Settings and the format stamp are unreachable from here (AC5). */
export function removeDataKeys(): void {
  for (const key of DATA_KEYS) localStorage.removeItem(key);
}

// Every engine stores a localStorage string as UTF-16 internally, and Chromium meters its
// per-origin quota (10 MiB) in exactly those code units × 2 — which is why the folk "5 MB limit"
// actually measures as ~5 M *characters*. `String.prototype.length` already counts code units, so
// this is the engine's own accounting, not an estimate (AR-14 / FD2).
const BYTES_PER_UTF16_CODE_UNIT = 2;

/**
 * Sums `key.length + value.length` (UTF-16 code units) × 2 over every entry — the AR-14 usage
 * meter's arithmetic, extracted so `@gol/test-utils`' fake can share the exact same formula rather
 * than re-stating it (FD8 — a fake that re-derives a formula is free to drift from it).
 */
export function storageBytesOf(entries: Iterable<readonly [string, string]>): number {
  let bytes = 0;
  for (const [key, value] of entries) {
    bytes += (key.length + value.length) * BYTES_PER_UTF16_CODE_UNIT;
  }
  return bytes;
}

/**
 * The AR-14 usage meter (RFC-006 Decision 7) over the `gol:*` namespace, and only that namespace.
 * `navigator.storage.estimate()` is deliberately NOT used — a recorded conflict with
 * `RFC-006:268`, not a silent pick (FD4): Chromium's `estimate().usage` excludes localStorage
 * entirely (it meters IndexedDB / Cache Storage / OPFS), Firefox's includes it — so the same
 * workspace would read differently per browser on a page whose job is a truthful number — and it
 * is origin-wide, so it cannot be scoped to `gol:*` at all. Enumerating `STORAGE_KEYS` rather than
 * prefix-scanning `localStorage` is the same call `removeDataKeys` makes for the opposite reason:
 * `writeKey` only ever takes a `StorageKey`, so the enumerated set IS the namespace by
 * construction, and nothing outside the app's own writes can inflate the figure.
 */
export function measureStorageUsage(): StorageUsage {
  const entries: Array<readonly [string, string]> = [];
  for (const key of Object.values(STORAGE_KEYS)) {
    const value = localStorage.getItem(key);
    if (value !== null) entries.push([key, value]);
  }
  return { bytes: storageBytesOf(entries) };
}
