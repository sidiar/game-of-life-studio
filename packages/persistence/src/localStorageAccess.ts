import { CURRENT_FORMAT_VERSION } from '@gol/domain';
import { CorruptDataError } from './errors';

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
  const candidate = JSON.stringify(value);
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

/** An id-keyed collection (`gol:battles`, `gol:organisms`); `{}` when never written. */
export function readCollection(key: StorageKey): Record<string, unknown> {
  const parsed = readStoredValue(key);
  if (parsed === undefined) return {};
  // An array parses as JSON but would hand every downstream consumer numeric "ids".
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new CorruptDataError(key, 'expected an object keyed by id');
  }
  return parsed as Record<string, unknown>;
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
 * AppRepositories.isFreshWorkspace() asks. Presence-only check (not the stamp's value — Decision
 * I asserts stamps, never branches on them).
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
