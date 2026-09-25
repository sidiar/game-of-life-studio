/**
 * The source-keyed format migration registry (AR-11 / Decision I / RFC-006 Decision 3): ONE chain,
 * driven by `formatVersion` alone, run before the boundary parse at BOTH entry points — at-rest
 * load (`@gol/persistence`'s `readCollection`) and file import (Story 5.8's
 * `parse → migrate → validate`). There is deliberately no second table per boundary: two tables
 * are two chains, free to disagree about what "format 2" means.
 *
 * ⚠️ The two boundaries hold the same data in DIFFERENT SHAPES, and neither can be converted to the
 * other before migration (`toEnvelope`/`fromEnvelope` need current-version parsed records). So a
 * step is told which one it holds:
 *   - `'at-rest'`  — `battles` / `organisms` are id-keyed objects; a battle is dense `gridState` +
 *                    `organismIds` + `gridSize`;
 *   - `'envelope'` — both are arrays; a battle is sparse `cells` + `gridDimensions`, no roster.
 * Organism records are identical in both, so rule and palette rewrites are written once. Only a
 * step that touches battle structure or collection form branches on `representation` — inside its
 * one atomic function. That branch is on the SHAPE, never on a version, so Decision I.4 holds.
 *
 * `formatVersion` is the only version read here. `organism.schemaVersion`, `PALETTE_VERSION` and
 * `appVersion` are stamps: asserted (or merely reported), never switched on (Decision I.4).
 */

import { CURRENT_FORMAT_VERSION } from './settingsSchema';

/** Which of the two shapes a document holds — see the header. */
export type MigrationRepresentation = 'envelope' | 'at-rest';

/** Pre-validation, so nothing about it is proven beyond "a plain object". */
export type MigratableDocument = Readonly<Record<string, unknown>>;

/**
 * One version's upgrade, `from → from + 1`. Returns a NEW document and never mutates its input:
 * the caller's snapshot/rollback (Story 5.8, and the at-rest write-back) depends on the original
 * being untouched. It need not set `formatVersion` — `migrate` does that after every step, so a
 * step cannot forget it.
 */
export type FormatMigration = (
  doc: MigratableDocument,
  representation: MigrationRepresentation,
) => MigratableDocument;

export type FormatMigrationErrorCode = 'corrupt' | 'newer-version' | 'missing-step';

/**
 * A document the chain refused. An interface + factory, not a class: `@gol/domain` is the rules
 * layer the "no classes in the engine" rule covers, and `RuleCompilationError`
 * (`@gol/simulation`'s `validateRules.ts`) is the precedent. `Object.assign` over a real `Error`
 * keeps `instanceof Error`, the stack, and `catch`-ability. Callers branch on `code`, never on
 * `message` — the UI's wording is its own (Story 5.8 maps this into its import error).
 */
export interface FormatMigrationError extends Error {
  readonly name: 'FormatMigrationError';
  readonly code: FormatMigrationErrorCode;
  /** Whatever the document carried — unvalidated, so possibly not a number at all. */
  readonly foundVersion: unknown;
  readonly supportedVersion: number;
}

function formatMigrationError(
  code: FormatMigrationErrorCode,
  foundVersion: unknown,
  supportedVersion: number,
  message: string,
): FormatMigrationError {
  return Object.assign(new Error(message), {
    name: 'FormatMigrationError' as const,
    code,
    foundVersion,
    supportedVersion,
  });
}

const ERROR_CODES: ReadonlySet<unknown> = new Set<FormatMigrationErrorCode>([
  'corrupt',
  'newer-version',
  'missing-step',
]);

// Checks the fields as well as `name`: `name` alone is forgeable by any rethrow that copies it, and
// the guard would then hand a caller branching on `code` a value the type says cannot exist.
export function isFormatMigrationError(value: unknown): value is FormatMigrationError {
  if (!(value instanceof Error) || value.name !== 'FormatMigrationError') return false;
  const { code, supportedVersion } = value as { code?: unknown; supportedVersion?: unknown };
  return ERROR_CODES.has(code) && typeof supportedVersion === 'number';
}

export interface MigratorConfig {
  readonly migrations: Readonly<Record<number, FormatMigration>>;
  readonly currentVersion: number;
}

export type Migrator = (
  raw: unknown,
  representation: MigrationRepresentation,
) => MigratableDocument;

// JSON.parse yields only plain objects; anything with another prototype (a Date, a Map, a class
// instance) did not come off a boundary and has no `formatVersion` a step could trust.
function isPlainObject(value: unknown): value is MigratableDocument {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const proto: unknown = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function describeVersion(version: unknown): string {
  return typeof version === 'string' ? `"${version}"` : String(version);
}

/**
 * Builds a migrator over an injected registry. The seam exists so chain order, the gap check and
 * the at-rest write-back are testable while the real registry is empty — without shipping a fake
 * step or a mutable module-level registry. Production code calls `migrate`, never this.
 */
export function createMigrator({ migrations, currentVersion }: MigratorConfig): Migrator {
  return (raw, representation) => {
    if (!isPlainObject(raw)) {
      throw formatMigrationError(
        'corrupt',
        undefined,
        currentVersion,
        'The data is not a readable Game of Life Studio document.',
      );
    }

    const found = raw['formatVersion'];
    // Floored at 1 because the chain counts upward from the first published format; 0, a
    // negative, a fraction or a numeric string gives it no starting point (NFR-7.3).
    if (typeof found !== 'number' || !Number.isInteger(found) || found < 1) {
      throw formatMigrationError(
        'corrupt',
        found,
        currentVersion,
        `The data has no valid format version (found ${describeVersion(found)}).`,
      );
    }

    // Before any step and before any Zod parse (AR-11): nothing from a newer build is partially
    // applied, at either boundary.
    if (found > currentVersion) {
      throw formatMigrationError(
        'newer-version',
        found,
        currentVersion,
        `This data was written by a newer version of Game of Life Studio (format ${found}); ` +
          `this version supports format ${currentVersion}. Update the app to open it.`,
      );
    }

    // Checked up front, not mid-loop, so a gap never leaves a half-run chain behind. A programming
    // error — the registry-integrity test makes it unreachable for the production registry.
    for (let from = found; from < currentVersion; from += 1) {
      if (typeof migrations[from] !== 'function') {
        throw formatMigrationError(
          'missing-step',
          found,
          currentVersion,
          `No migration is registered from format ${from} to format ${from + 1}.`,
        );
      }
    }

    let doc: MigratableDocument = raw;
    for (let from = found; from < currentVersion; from += 1) {
      // The gap scan above proved every slot in this range is a function.
      const step = migrations[from] as FormatMigration;
      doc = { ...step(doc, representation), formatVersion: from + 1 };
    }
    // With no step run this is `raw` itself, by reference — the identity passthrough callers
    // detect ("nothing to write back") with `===`.
    return doc;
  };
}

/**
 * The production registry: `MIGRATIONS[from]` upgrades `from → from + 1` (Decision I.2). Each step
 * is ONE atomic function per version, internally ordered structure → rules → palette tokens
 * (Decision I.3), and branches on `representation` only where the two shapes differ. Empty while
 * `CURRENT_FORMAT_VERSION` is 1: real steps arrive with the first format bump, together with the
 * bump itself. Frozen, and nothing registers into it at import time (the barrel's
 * `sideEffects: false` invariant).
 */
export const MIGRATIONS: Readonly<Record<number, FormatMigration>> = Object.freeze({});

/** The one chain both boundaries run (AR-11). */
export const migrate: Migrator = createMigrator({
  migrations: MIGRATIONS,
  currentVersion: CURRENT_FORMAT_VERSION,
});
