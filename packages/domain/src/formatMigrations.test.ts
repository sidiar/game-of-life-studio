import { describe, expect, it, vi } from 'vitest';
import { BattleSchema } from './battleSchema';
import { CONWAYS_CLASSIC } from './defaultWorkspace';
import {
  createMigrator,
  isFormatMigrationError,
  migrate,
  MIGRATIONS,
  type FormatMigration,
  type FormatMigrationError,
  type MigratableDocument,
} from './formatMigrations';
import { CURRENT_FORMAT_VERSION } from './settingsSchema';
import { toEnvelope } from './workspaceExportProjection';
import { WorkspaceExportSchema } from './workspaceExportSchema';

function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

/** Runs `fn`, asserting it throws a FormatMigrationError, and hands the error back. */
function caught(fn: () => unknown): FormatMigrationError {
  try {
    fn();
  } catch (error) {
    if (isFormatMigrationError(error)) return error;
    throw error;
  }
  throw new Error('expected a FormatMigrationError, but nothing was thrown');
}

describe('migrate — identity (AC6)', () => {
  it('returns a current-version document by reference and runs no step', () => {
    const step = vi.fn<FormatMigration>((doc) => doc);
    const spyMigrate = createMigrator({
      migrations: { [CURRENT_FORMAT_VERSION]: step },
      currentVersion: CURRENT_FORMAT_VERSION,
    });
    const doc = deepFreeze({ formatVersion: CURRENT_FORMAT_VERSION, organisms: [], battles: [] });

    expect(spyMigrate(doc, 'envelope')).toBe(doc);
    expect(migrate(doc, 'at-rest')).toBe(doc);
    expect(step).not.toHaveBeenCalled();
  });

  it('accepts a prototype-less object — JSON-shaped data need not inherit Object.prototype', () => {
    const doc = Object.assign(Object.create(null) as Record<string, unknown>, {
      formatVersion: CURRENT_FORMAT_VERSION,
    });

    expect(migrate(doc, 'envelope')).toBe(doc);
  });
});

describe('migrate — newer version (AC4)', () => {
  it.each([CURRENT_FORMAT_VERSION + 1, 1_000_000])(
    'rejects format %i before any step runs, naming both versions',
    (version) => {
      const step = vi.fn<FormatMigration>((doc) => doc);
      const spyMigrate = createMigrator({
        migrations: { [CURRENT_FORMAT_VERSION]: step },
        currentVersion: CURRENT_FORMAT_VERSION,
      });

      const error = caught(() => spyMigrate({ formatVersion: version }, 'envelope'));

      expect(error.code).toBe('newer-version');
      expect(error.foundVersion).toBe(version);
      expect(error.supportedVersion).toBe(CURRENT_FORMAT_VERSION);
      expect(error.message).toContain('newer version');
      expect(error.message).toContain(`format ${version}`);
      expect(error.message).toContain(`supports format ${CURRENT_FORMAT_VERSION}`);
      expect(error).toBeInstanceOf(Error);
      expect(step).not.toHaveBeenCalled();
    },
  );
});

describe('migrate — missing or invalid version (AC5)', () => {
  it.each<[string, unknown]>([
    ['missing', undefined],
    ['a numeric string', '1'],
    ['a fraction', 1.5],
    ['zero', 0],
    ['negative', -1],
    ['NaN', Number.NaN],
    ['null', null],
  ])('rejects a formatVersion that is %s as corrupt', (_label, formatVersion) => {
    const doc = formatVersion === undefined ? { organisms: [] } : { formatVersion };

    const error = caught(() => migrate(doc, 'envelope'));

    expect(error.code).toBe('corrupt');
    expect(error.foundVersion).toBe(formatVersion);
    expect(error.supportedVersion).toBe(CURRENT_FORMAT_VERSION);
  });

  it.each<[string, unknown]>([
    ['null', null],
    ['an array', [{ formatVersion: 1 }]],
    ['a string', '{"formatVersion":1}'],
    ['a Date', new Date(0)],
  ])('rejects %s input as corrupt', (_label, raw) => {
    const error = caught(() => migrate(raw, 'at-rest'));

    expect(error.code).toBe('corrupt');
    expect(error.foundVersion).toBeUndefined();
  });
});

describe('createMigrator — chain mechanics against a synthetic registry (AC6)', () => {
  // Each step records its call and tags the document, so order and hand-off are both observable.
  function registry() {
    const calls: string[] = [];
    const s1 = vi.fn<FormatMigration>((doc, representation) => {
      calls.push(`s1:${representation}:${String(doc['formatVersion'])}`);
      return { ...doc, trail: [...((doc['trail'] as string[] | undefined) ?? []), 's1'] };
    });
    const s2 = vi.fn<FormatMigration>((doc, representation) => {
      calls.push(`s2:${representation}:${String(doc['formatVersion'])}`);
      return { ...doc, trail: [...((doc['trail'] as string[] | undefined) ?? []), 's2'] };
    });
    return {
      calls,
      s1,
      s2,
      run: createMigrator({ migrations: { 1: s1, 2: s2 }, currentVersion: 3 }),
    };
  }

  it('runs a v1 document through s1 then s2, bumping formatVersion after each step', () => {
    const { calls, run } = registry();
    const input = deepFreeze({ formatVersion: 1, payload: { a: 1 } });

    const out: MigratableDocument = run(input, 'at-rest');

    // Each step sees the version `migrate` stamped on the previous step's output.
    expect(calls).toEqual(['s1:at-rest:1', 's2:at-rest:2']);
    expect(out).toEqual({ formatVersion: 3, payload: { a: 1 }, trail: ['s1', 's2'] });
    expect(input).toEqual({ formatVersion: 1, payload: { a: 1 } });
  });

  it('runs a v2 document through s2 only, and passes the representation through', () => {
    const { calls, s1, run } = registry();

    const out = run(deepFreeze({ formatVersion: 2 }), 'envelope');

    expect(s1).not.toHaveBeenCalled();
    expect(calls).toEqual(['s2:envelope:2']);
    expect(out['formatVersion']).toBe(3);
  });

  it('sets formatVersion itself, so a step that forgets (or clobbers) it cannot mis-stamp', () => {
    const run = createMigrator({
      migrations: { 1: (doc) => ({ ...doc, formatVersion: 'oops' }) },
      currentVersion: 2,
    });

    expect(run({ formatVersion: 1 }, 'envelope')).toEqual({ formatVersion: 2 });
  });

  it('fails a gap with missing-step before running any step', () => {
    const s1 = vi.fn<FormatMigration>((doc) => doc);
    const run = createMigrator({ migrations: { 1: s1 }, currentVersion: 3 });

    const error = caught(() => run({ formatVersion: 1 }, 'envelope'));

    expect(error.code).toBe('missing-step');
    expect(error.message).toContain('from format 2 to format 3');
    expect(s1).not.toHaveBeenCalled();
  });
});

describe('MIGRATIONS — registry integrity (AC1)', () => {
  it('holds a step for every format below the current one', () => {
    // Vacuous while CURRENT_FORMAT_VERSION is 1 — the range is empty. It becomes load-bearing on
    // the first bump: a bump without its step fails here, not as a 'missing-step' in a user's
    // browser the first time they load old data.
    for (let v = 1; v < CURRENT_FORMAT_VERSION; v += 1) {
      expect(typeof MIGRATIONS[v]).toBe('function');
    }
  });

  it('is frozen, so nothing can register a step at runtime', () => {
    expect(Object.isFrozen(MIGRATIONS)).toBe(true);
  });
});

describe('isFormatMigrationError', () => {
  it('rejects a plain Error and one that merely borrows the name', () => {
    const forged = Object.assign(new Error('x'), { name: 'FormatMigrationError' });

    expect(isFormatMigrationError(new Error('x'))).toBe(false);
    expect(isFormatMigrationError(forged)).toBe(false);
    expect(isFormatMigrationError({ name: 'FormatMigrationError', code: 'corrupt' })).toBe(false);
  });
});

describe('the import boundary: migrate before WorkspaceExportSchema (AC2b / AC4)', () => {
  function realEnvelope(): unknown {
    const battle = BattleSchema.parse({
      id: '6f3c2f5c-2f4a-4a2f-8f5d-7b1e9c3a1d20',
      name: 'Fixture',
      organismIds: [CONWAYS_CLASSIC.id],
      gridSize: { cols: 50, rows: 30 },
      gridState: Array.from({ length: 30 }, (_, y) =>
        Array.from({ length: 50 }, (_, x) => (x === 1 && y === 2 ? 1 : 0)),
      ),
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-02T00:00:00.000Z',
    });
    const wire = toEnvelope('workspace', [battle], [CONWAYS_CLASSIC], {
      appVersion: '0.0.0-test',
      exportedAt: new Date('2026-01-03T00:00:00.000Z'),
    });
    // What a file actually delivers: the JSON round trip, not the in-memory object.
    return JSON.parse(JSON.stringify(wire)) as unknown;
  }

  it('passes a current envelope through by reference and it then parses', () => {
    const env = realEnvelope();

    const migrated = migrate(env, 'envelope');

    expect(migrated).toBe(env);
    expect(WorkspaceExportSchema.safeParse(migrated).success).toBe(true);
  });

  it('rejects a newer envelope with newer-version before the schema is consulted', () => {
    const env = {
      ...(realEnvelope() as Record<string, unknown>),
      formatVersion: CURRENT_FORMAT_VERSION + 1,
    };
    const parse = vi.spyOn(WorkspaceExportSchema, 'parse');
    const safeParse = vi.spyOn(WorkspaceExportSchema, 'safeParse');

    // The Story 5.8 pipeline order: a throw here means `parse` below is never reached.
    const error = caught(() => WorkspaceExportSchema.parse(migrate(env, 'envelope')));

    expect(error.code).toBe('newer-version');
    expect(parse).not.toHaveBeenCalled();
    expect(safeParse).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });
});
