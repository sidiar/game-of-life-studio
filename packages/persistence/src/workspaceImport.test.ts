import {
  BattleSchema,
  CONWAYS_CLASSIC,
  CONWAYS_CLASSIC_ID,
  CURRENT_FORMAT_VERSION,
  OrganismSchema,
  ORGANISM_SCHEMA_VERSION,
  WorkspaceExportSchema,
  type Battle,
  type Organism,
  type Settings,
  type SurvivalRule,
  type WorkspaceExportWire,
} from '@gol/domain';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createLocalStorageRepositories } from './createLocalStorageRepositories';
import { ImportError, NewerFormatVersionError } from './errors';
import { QuotaExceededError, STORAGE_KEYS } from './localStorageAccess';
import type { AppRepositories } from './repositories';
import { validateImportFile } from './workspaceImport';
import { createWorkspaceSerializer } from './workspaceSerializer';

// AR-44: every case runs against the REAL localStorage repositories under jsdom. "Nothing changed"
// is proven by comparing the four raw `getItem` strings before and after — a `setItem` spy alone
// would miss a `removeItem`, which is exactly what `clearAll()` does.

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

const PRESET = { cols: 50, rows: 30 } as const;
const SETTINGS: Settings = {
  theme: 'biotech-terminal',
  gridLines: false,
  cellAnimation: false,
  defaultGridSize: PRESET,
  autoSave: true,
  defaultSpeed: 20,
};
const RAW_KEYS = [
  STORAGE_KEYS.battles,
  STORAGE_KEYS.organisms,
  STORAGE_KEYS.schema,
  STORAGE_KEYS.settings,
] as const;

function rawStore(): Record<string, string | null> {
  return Object.fromEntries(RAW_KEYS.map((key) => [key, localStorage.getItem(key)]));
}

function organism(id: string, targetId?: string, name = id): Organism {
  const survivalRules: SurvivalRule[] =
    targetId === undefined
      ? []
      : [
          {
            id: `${id}-rule`,
            contentHash: `content-${id}`,
            conditions: [
              { property: 'cellState', operator: 'eq', pattern: 'alive' },
              { property: 'organismType', operator: 'eq', pattern: targetId },
            ],
            payload: { summary: `${id} targets ${targetId}`, action: 'survive' },
          },
        ];
  return OrganismSchema.parse({
    schemaVersion: ORGANISM_SCHEMA_VERSION,
    id,
    name,
    colorToken: 'azure',
    dominance: 50,
    agingEnabled: false,
    survivalRules,
  });
}

/** A battle placing `organismIds` in order, one cell each along row 0. */
function battle(id: string, name: string, organismIds: readonly string[]): Battle {
  const gridState = Array.from({ length: PRESET.rows }, () =>
    Array.from({ length: PRESET.cols }, () => 0),
  );
  organismIds.forEach((_, i) => {
    gridState[0][i] = i + 1;
  });
  return BattleSchema.parse({
    id,
    name,
    organismIds,
    gridSize: PRESET,
    gridState,
    createdAt: '2025-12-01T00:00:00.000Z',
    updatedAt: '2025-12-02T00:00:00.000Z',
  });
}

const EXISTING_BATTLE_ID = '6f3c2f5c-2f4a-4a2f-8f5d-7b1e9c3a1d20';
const INCOMING_BATTLE_ID = '11111111-1111-4111-8111-111111111111';
const SECOND_INCOMING_BATTLE_ID = '22222222-2222-4222-8222-222222222222';

/** The pre-import workspace every case imports over: Conway, one custom organism, one battle, settings. */
async function seedExistingWorkspace(): Promise<AppRepositories> {
  const repos = createLocalStorageRepositories();
  await repos.organisms.save(CONWAYS_CLASSIC);
  await repos.organisms.save(organism('existing-custom'));
  await repos.battles.save(
    battle(EXISTING_BATTLE_ID, 'Existing battle', [CONWAYS_CLASSIC_ID, 'existing-custom']),
  );
  await repos.settings.save(SETTINGS);
  return repos;
}

/** A valid workspace-kind file on the wire, mutable so each failure case can break one thing. */
function validWire(): WorkspaceExportWire & Record<string, unknown> {
  return {
    formatVersion: CURRENT_FORMAT_VERSION,
    appVersion: '9.9.9',
    exportedAt: '2026-01-01T00:00:00.000Z',
    kind: 'workspace',
    organisms: [JSON.parse(JSON.stringify(organism('incoming', 'incoming-target'))) as Organism],
    battles: [
      {
        id: INCOMING_BATTLE_ID,
        name: 'Incoming battle',
        gridDimensions: { ...PRESET },
        cells: [{ x: 0, y: 0, organismId: 'incoming' }],
        createdAt: '2025-11-01T00:00:00.000Z',
        updatedAt: '2025-11-02T00:00:00.000Z',
      },
    ],
  };
}

function withTarget(wire: WorkspaceExportWire): WorkspaceExportWire {
  return {
    ...wire,
    organisms: [
      ...wire.organisms,
      JSON.parse(JSON.stringify(organism('incoming-target'))) as Organism,
    ],
  };
}

function serializerFor(repos: AppRepositories) {
  return createWorkspaceSerializer({
    repos,
    appVersion: '1.0.0',
    now: () => new Date('2026-02-01T00:00:00.000Z'),
  });
}

function importOver(repos: AppRepositories, fileText: string) {
  return serializerFor(repos).importWorkspace(fileText);
}

async function rejection(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error('expected the import to reject');
}

async function expectImportError(promise: Promise<unknown>, code: string): Promise<ImportError> {
  const error = await rejection(promise);
  expect(error).toBeInstanceOf(ImportError);
  expect((error as ImportError).code).toBe(code);
  return error as ImportError;
}

/**
 * Fails the `occurrences`-th write(s) to `gol:battles` that come AFTER a `gol:organisms` write, with
 * a DOMException the real store would raise. By key AND occurrence: the rollback writes the same
 * keys again, and a key-only stub would fail the restore too.
 */
function failBattlesWritesAfterOrganisms(occurrences: ReadonlySet<number>): DOMException[] {
  const thrown: DOMException[] = [];
  const originalSetItem = Storage.prototype.setItem;
  let sawOrganisms = false;
  let battlesWrites = 0;
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (
    this: Storage,
    key: string,
    value: string,
  ) {
    if (key === STORAGE_KEYS.organisms) sawOrganisms = true;
    if (key === STORAGE_KEYS.battles && sawOrganisms) {
      battlesWrites += 1;
      if (occurrences.has(battlesWrites)) {
        const error = new DOMException('mock quota failure', 'QuotaExceededError');
        thrown.push(error);
        throw error;
      }
    }
    originalSetItem.call(this, key, value);
  });
  return thrown;
}

describe('importWorkspace — every rejection leaves the store byte-identical (AC6)', () => {
  it('not-json: a file that is not JSON', async () => {
    const repos = await seedExistingWorkspace();
    const before = rawStore();

    await expectImportError(importOver(repos, '{'), 'not-json');

    expect(rawStore()).toEqual(before);
  });

  it.each([
    ['a missing formatVersion', () => ({ ...validWire(), formatVersion: undefined })],
    ['a string formatVersion', () => ({ ...validWire(), formatVersion: '1' })],
    ['a document that is not an object', () => [validWire()]],
    [
      'a cell outside gridDimensions (BattleExportSchema superRefine)',
      () => {
        const wire = withTarget(validWire());
        wire.battles[0].cells = [{ x: PRESET.cols, y: 0, organismId: 'incoming' }];
        return wire;
      },
    ],
    [
      'a duplicate organism id (WorkspaceExportSchema superRefine)',
      () => {
        const wire = withTarget(validWire());
        return { ...wire, organisms: [...wire.organisms, wire.organisms[0]] };
      },
    ],
    [
      // The battle half of the duplicate-id superRefine, exercised in its own right: the
      // deferred-work `:33` discharge rests on it running before `replaceAll` for BOTH
      // collections, and battles are just as id-keyed at rest as organisms.
      'a duplicate battle id (WorkspaceExportSchema superRefine)',
      () => {
        const wire = withTarget(validWire());
        return { ...wire, battles: [...wire.battles, wire.battles[0]] };
      },
    ],
    [
      "kind: 'battle' carrying two battles (cardinality superRefine)",
      () => {
        const wire = withTarget(validWire());
        return {
          ...wire,
          kind: 'battle',
          battles: [...wire.battles, { ...wire.battles[0], id: SECOND_INCOMING_BATTLE_ID }],
        };
      },
    ],
    [
      'an organism id of __proto__',
      () => {
        const wire = withTarget(validWire());
        const proto = JSON.parse(JSON.stringify(organism('placeholder'))) as Organism;
        return { ...wire, organisms: [...wire.organisms, { ...proto, id: '__proto__' }] };
      },
    ],
  ])('corrupt: %s', async (_label, build) => {
    const repos = await seedExistingWorkspace();
    const before = rawStore();

    await expectImportError(importOver(repos, JSON.stringify(build())), 'corrupt');

    expect(rawStore()).toEqual(before);
  });

  it('corrupt from a schema failure carries the Zod issues for diagnostics', async () => {
    const repos = await seedExistingWorkspace();
    const wire = withTarget(validWire());
    wire.battles[0].cells = [{ x: PRESET.cols, y: 0, organismId: 'incoming' }];

    const error = await expectImportError(importOver(repos, JSON.stringify(wire)), 'corrupt');

    expect(error.issues?.length).toBeGreaterThan(0);
  });

  it('newer-version: a newer formatVersion is refused before the schema is ever consulted', async () => {
    const repos = await seedExistingWorkspace();
    const before = rawStore();
    const safeParse = vi.spyOn(WorkspaceExportSchema, 'safeParse');
    const file = JSON.stringify({
      ...withTarget(validWire()),
      formatVersion: CURRENT_FORMAT_VERSION + 1,
    });

    const error = await expectImportError(importOver(repos, file), 'newer-version');

    expect(error.foundVersion).toBe(CURRENT_FORMAT_VERSION + 1);
    expect(error.supportedVersion).toBe(CURRENT_FORMAT_VERSION);
    expect(safeParse).not.toHaveBeenCalled();
    expect(rawStore()).toEqual(before);
  });

  it('dangling-reference: a cell naming an organism the file does not carry', async () => {
    const repos = await seedExistingWorkspace();
    const before = rawStore();
    const wire = withTarget(validWire());
    wire.battles[0].cells.push({ x: 1, y: 0, organismId: 'ghost' });

    const error = await expectImportError(
      importOver(repos, JSON.stringify(wire)),
      'dangling-reference',
    );

    expect(error.dangling).toEqual([
      { kind: 'cell', id: 'ghost', referencedBy: INCOMING_BATTLE_ID },
    ]);
    expect(rawStore()).toEqual(before);
  });

  it('dangling-reference: a rule target the file does not carry — even conways-classic', async () => {
    const repos = await seedExistingWorkspace();
    const before = rawStore();
    const wire = withTarget(validWire());
    wire.organisms.push(
      JSON.parse(JSON.stringify(organism('unplaced', CONWAYS_CLASSIC_ID))) as Organism,
    );

    const error = await expectImportError(
      importOver(repos, JSON.stringify(wire)),
      'dangling-reference',
    );

    expect(error.dangling).toEqual([
      { kind: 'rule-target', id: CONWAYS_CLASSIC_ID, referencedBy: 'unplaced' },
    ]);
    expect(rawStore()).toEqual(before);
  });

  it('write-failed: a quota failure on the battles write, after organisms were written, is rolled back', async () => {
    const repos = await seedExistingWorkspace();
    const before = rawStore();
    const thrown = failBattlesWritesAfterOrganisms(new Set([1]));

    const error = await expectImportError(
      importOver(repos, JSON.stringify(withTarget(validWire()))),
      'write-failed',
    );

    expect(error.cause).toBeInstanceOf(QuotaExceededError);
    expect((error.cause as QuotaExceededError).cause).toBe(thrown[0]);
    expect(rawStore()).toEqual(before);
  });

  it('rollback-failed: the restore’s own battles write fails too — both errors are carried', async () => {
    const repos = await seedExistingWorkspace();
    const thrown = failBattlesWritesAfterOrganisms(new Set([1, 2]));

    const error = await expectImportError(
      importOver(repos, JSON.stringify(withTarget(validWire()))),
      'rollback-failed',
    );

    // No "workspace unchanged" assertion: that guarantee is exactly what this code disclaims.
    expect(thrown).toHaveLength(2);
    expect((error.cause as QuotaExceededError).cause).toBe(thrown[0]);
    expect((error.rollbackError as QuotaExceededError).cause).toBe(thrown[1]);
  });

  it('write-failed over a FRESH workspace restores it as its first load would — Conway’s Classic re-ensured', async () => {
    const repos = createLocalStorageRepositories();
    await repos.settings.save(SETTINGS);
    const settingsBefore = localStorage.getItem(STORAGE_KEYS.settings);
    failBattlesWritesAfterOrganisms(new Set([1]));

    await expectImportError(
      importOver(repos, JSON.stringify(withTarget(validWire()))),
      'write-failed',
    );
    vi.restoreAllMocks();

    // `replaceAll` stamped the store during the restore, so the seed would never run again; the
    // rollback's own ensure is what keeps Conway's Classic from vanishing.
    expect(await repos.isFreshWorkspace()).toBe(false);
    expect((await repos.organisms.list()).map((o) => o.id)).toEqual([CONWAYS_CLASSIC_ID]);
    expect(await repos.battles.listFull()).toEqual([]);
    expect(localStorage.getItem(STORAGE_KEYS.settings)).toBe(settingsBefore);
  });

  it('a snapshot read that throws propagates unchanged, before anything is written', async () => {
    const repos = await seedExistingWorkspace();
    localStorage.setItem(
      STORAGE_KEYS.schema,
      JSON.stringify({ formatVersion: CURRENT_FORMAT_VERSION + 1 }),
    );
    const before = rawStore();

    const error = await rejection(importOver(repos, JSON.stringify(withTarget(validWire()))));

    expect(error).toBeInstanceOf(NewerFormatVersionError);
    expect(error).not.toBeInstanceOf(ImportError);
    expect(rawStore()).toEqual(before);
  });
});

describe('importWorkspace — success replaces the whole workspace (AC4, AC5, AC6)', () => {
  it('a workspace-kind file round-trips the source store, keeps settings, and reports its summary', async () => {
    const source = createLocalStorageRepositories();
    await source.organisms.save(organism('alpha', 'beta'));
    await source.organisms.save(organism('beta'));
    await source.battles.save(battle(INCOMING_BATTLE_ID, 'Alpha battle', ['alpha']));
    await source.battles.save(battle(SECOND_INCOMING_BATTLE_ID, 'Beta battle', ['beta', 'alpha']));
    const sourceBattles = await source.battles.listFull();
    const sourceOrganisms = await source.organisms.list();
    const file = JSON.stringify(await serializerFor(source).exportWorkspace());
    localStorage.clear();

    const repos = await seedExistingWorkspace();
    const settingsBefore = localStorage.getItem(STORAGE_KEYS.settings);

    const summary = await importOver(repos, file);

    expect(await repos.battles.listFull()).toEqual(sourceBattles);
    expect(await repos.organisms.list()).toEqual([...sourceOrganisms, CONWAYS_CLASSIC]);
    expect(await repos.organisms.exists(CONWAYS_CLASSIC_ID)).toBe(true);
    expect(localStorage.getItem(STORAGE_KEYS.settings)).toBe(settingsBefore);
    expect(summary).toEqual({ kind: 'workspace', battleCount: 2, organismCount: 3 });
  });

  it('a battle-kind file replaces the WHOLE workspace with its one battle, re-adding Conway’s Classic', async () => {
    const source = createLocalStorageRepositories();
    await source.organisms.save(organism('alpha', 'beta'));
    await source.organisms.save(organism('beta'));
    await source.organisms.save(organism('unrelated'));
    await source.battles.save(battle(INCOMING_BATTLE_ID, 'Alpha battle', ['alpha']));
    const file = JSON.stringify(await serializerFor(source).exportBattle(INCOMING_BATTLE_ID));
    const exported = JSON.parse(file) as WorkspaceExportWire;
    expect(exported.organisms.map((o) => o.id)).not.toContain(CONWAYS_CLASSIC_ID);
    localStorage.clear();

    const repos = await seedExistingWorkspace();
    const settingsBefore = localStorage.getItem(STORAGE_KEYS.settings);

    const summary = await importOver(repos, file);

    expect((await repos.battles.listFull()).map((b) => b.id)).toEqual([INCOMING_BATTLE_ID]);
    expect((await repos.organisms.list()).map((o) => o.id)).toEqual([
      'alpha',
      'beta',
      CONWAYS_CLASSIC_ID,
    ]);
    expect(localStorage.getItem(STORAGE_KEYS.settings)).toBe(settingsBefore);
    expect(summary).toEqual({ kind: 'battle', battleCount: 1, organismCount: 3 });
  });

  it('keeps an imported, edited conways-classic exactly as imported', async () => {
    const repos = await seedExistingWorkspace();
    const edited: Organism = { ...CONWAYS_CLASSIC, name: 'My Conway', dominance: 80 };
    const wire = validWire();
    wire.organisms = [JSON.parse(JSON.stringify(edited)) as Organism];
    wire.battles[0].cells = [{ x: 0, y: 0, organismId: CONWAYS_CLASSIC_ID }];

    const summary = await importOver(repos, JSON.stringify(wire));

    expect(await repos.organisms.load(CONWAYS_CLASSIC_ID)).toEqual(edited);
    expect(summary.organismCount).toBe(1);
  });
});

describe('validateImportFile', () => {
  it('writes nothing and reads no storage — it proves a file without any repository', () => {
    const getItem = vi.spyOn(Storage.prototype, 'getItem');
    const setItem = vi.spyOn(Storage.prototype, 'setItem');

    const envelope = validateImportFile(JSON.stringify(withTarget(validWire())));

    expect(envelope.battles[0].createdAt).toBeInstanceOf(Date);
    expect(getItem).not.toHaveBeenCalled();
    expect(setItem).not.toHaveBeenCalled();
  });
});
