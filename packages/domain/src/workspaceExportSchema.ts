/**
 * The versioned file-exchange envelope (AR-10 / FR-6.3 / RFC-006 Decision 2) — the schema of record
 * for every export this app writes and every file it will later import.
 *
 * ⚠️ TWO SPELLINGS OF THE SAME TWO NUMBERS, AND BOTH ARE DELIBERATE. At rest a battle carries
 * `gridSize` (`BattleSchema`); on the wire it carries `gridDimensions` (RFC-006 Decision 2). The
 * runtime `Grid` in `@gol/simulation` calls them `width`/`height` again. The names differ on
 * purpose: a `grep` for one of them tells you which side of the serializer boundary a piece of code
 * is on, which is the confusion `battleRecord.ts`'s header goes out of its way to prevent. Do not
 * "unify" them.
 *
 * ⚠️ Zod v4 spellings throughout — `z.uuid()`, `z.iso.datetime()`, `ctx.addIssue({ code: 'custom' })`.
 * RFC-006's snippet is written in v3 (`z.string().uuid()`, `z.string().datetime()`), which does not
 * exist on this install; the shipped schemas beside this file are the reference, not the RFC's code
 * block. Recorded as a variance in `deferred-work.md` rather than silently absorbed.
 */

import { z } from 'zod';
import { IsoTimestamp, MAX_BATTLE_NAME_LENGTH } from './battleSchema';
import { EditableGridPresetSchema, OrganismSchema } from './organismSchema';
import { CURRENT_FORMAT_VERSION } from './settingsSchema';

/**
 * What an envelope claims to hold. `'battle'` exports still carry the same top-level shape — a
 * single-battle file is a whole-workspace envelope with one battle and its organism closure
 * (Story 5.4), never a second format. Import is a destructive whole-workspace replace either way
 * (M8), so the kind is provenance for the warning copy, not a branch in the parser.
 */
export const EXPORT_KINDS = ['workspace', 'battle'] as const;

export type ExportKind = (typeof EXPORT_KINDS)[number];

/**
 * One occupied cell on the wire. The sparse form exists because a 100x60 grid is 6,000 dense
 * numbers of which almost all are `0` (AR-9); nothing else about the at-rest encoding changes.
 *
 * ⚠️ `organismId` is `.min(1)`, not RFC-006's bare `z.string()`. It round-trips into
 * `BattleSchema.organismIds`, whose element schema is `z.string().min(1)` — an empty id is
 * unresolvable against the library, so a looser wire schema would accept files that cannot be
 * turned back into a valid `Battle`.
 */
export const PlacedCellSchema = z.object({
  x: z.number().int().min(0),
  y: z.number().int().min(0),
  organismId: z.string().min(1),
});

export type PlacedCell = z.infer<typeof PlacedCellSchema>;

/**
 * A battle on the wire: dense `gridState` replaced by sparse `cells`, and **no roster field**
 * (Decision H.2). The roster is reconstructed from `cells` alone, because `organismIds` at rest is
 * exactly the placed set (Decision H.1) — carrying it as well would be a second copy of the same
 * fact, free to disagree with the cells in a hand-edited file.
 *
 * ⚠️ **THE ORDERING CONTRACT — part of the FORMAT, not of the writer.** `toBattleExport` emits
 * `cells` grouped by ascending roster ref (row-major within each group), and `fromBattleExport`
 * assigns refs by order of first appearance in `cells`. That pairing is what makes the round trip
 * reproduce the *record*, not merely the picture: a cell value is `roster index + 1` (M14), so a
 * roster rebuilt in a different order comes back permuted with a correspondingly remapped grid —
 * the same dish, a different record. A hand-written file with interleaved cells still imports
 * correctly; it simply gets the roster order its cells imply rather than the one its author
 * intended.
 */
export const BattleExportSchema = z
  .object({
    id: z.uuid(),
    name: z.string().max(MAX_BATTLE_NAME_LENGTH),
    gridDimensions: EditableGridPresetSchema,
    cells: z.array(PlacedCellSchema),
    createdAt: IsoTimestamp,
    updatedAt: IsoTimestamp,
  })
  .superRefine((b, ctx) => {
    // Each issue carries its own `path` for the same reason `BattleSchema`'s four do: without one
    // every structural failure lands at the root and can only be told apart by substring-matching
    // an English message.
    const { cols, rows } = b.gridDimensions;
    if (b.cells.some((c) => c.x >= cols || c.y >= rows)) {
      ctx.addIssue({
        code: 'custom',
        path: ['cells'],
        message: 'cells must lie inside gridDimensions (Decision G.2)',
      });
    }
    // Corrupt, never last-wins. Two cells at one coordinate describe two organisms in one square,
    // which the dense form cannot represent at all — silently keeping the later one would import a
    // file as something its author never saw.
    const seen = new Set<string>();
    let duplicate = false;
    for (const cell of b.cells) {
      const key = `${cell.x},${cell.y}`;
      if (seen.has(key)) {
        duplicate = true;
        break;
      }
      seen.add(key);
    }
    if (duplicate) {
      ctx.addIssue({
        code: 'custom',
        path: ['cells'],
        message: 'cells must not repeat a coordinate — a duplicate (x,y) is corrupt data',
      });
    }
    // The dense encoding's ceiling, enforced on the wire as well as at rest: an occupant is a
    // Uint8Array byte and ref 0 means empty, so a 256th organism has no code (Decision G.3). The
    // workspace LIBRARY stays uncapped (M6) — these are different numbers.
    if (new Set(b.cells.map((c) => c.organismId)).size > 255) {
      ctx.addIssue({
        code: 'custom',
        path: ['cells'],
        message: 'a battle may place at most 255 distinct organisms (Decision G.3)',
      });
    }
  });

/**
 * The envelope itself.
 *
 * ⚠️ **THE LOAD-BEARING FIELD HERE IS THE ONE THAT IS ABSENT: there is no `settings`**
 * (AR-12 / Decision F.1). Device-local preferences never travel, in either `kind`, which is what
 * makes importing a friend's battle unable to change the importer's theme — by construction, with
 * no snapshot-and-restore step to get wrong. Zod strips unknown keys by default, so an envelope
 * that carries one parses fine and arrives without it; that strip IS the mechanism, not a hole to
 * close with `.strict()`. A reader cannot see an absence, hence this comment.
 *
 * ⚠️ `formatVersion` is a `z.literal`, so a file from a NEWER build fails `parse` outright. That is
 * the floor, not the feature: the graceful "this app is too old" message and the source-keyed
 * `MIGRATIONS[from]` chain belong to Story 5.7, which runs `migrate()` BEFORE `parse()`. Widening
 * this to a range to be helpful would make that rejection path unreachable (Decision I).
 *
 * `appVersion` is provenance only — stamped, reported, never branched on (Decision I.4), the same
 * posture `gol:schema`'s stamp takes from the at-rest side.
 */
export const WorkspaceExportSchema = z
  .object({
    formatVersion: z.literal(CURRENT_FORMAT_VERSION),
    appVersion: z.string(),
    exportedAt: IsoTimestamp,
    kind: z.enum(EXPORT_KINDS),
    organisms: z.array(OrganismSchema),
    battles: z.array(BattleExportSchema),
  })
  .superRefine((envelope, ctx) => {
    // Corrupt, never last-wins — the same stance `BattleSchema` takes for a duplicate roster id and
    // this file takes one level down for a duplicate `(x,y)`. Both collections are keyed by id at
    // rest (`gol:battles` / `gol:organisms` are objects keyed by id), so Story 5.8's `replaceAll`
    // would collapse a duplicate pair silently: two records in, one record out, no error anywhere.
    //
    // ⚠️ CARDINALITY IS NOT HERE. `kind: 'battle'` implying exactly one battle is Story 5.4's, which
    // mints `exportBattle` and the organism closure that gives the rule meaning. `toEnvelope`
    // accepts the kind (it is the enum's), but this story ships no PRODUCER of a `kind: 'battle'`
    // file — `exportBattle` is 5.4's — so a refinement here would constrain a producer that does
    // not exist yet.
    for (const [field, ids] of [
      ['battles', envelope.battles.map((b) => b.id)],
      ['organisms', envelope.organisms.map((o) => o.id)],
    ] as const) {
      if (new Set(ids).size !== ids.length) {
        ctx.addIssue({
          code: 'custom',
          path: [field],
          message: `${field} must not repeat an id — a duplicate id is corrupt data`,
        });
      }
    }
  });

/** Parsed shapes — timestamps are hydrated `Date`s, as everywhere else in this package. */
export type BattleExport = z.infer<typeof BattleExportSchema>;
export type WorkspaceExport = z.infer<typeof WorkspaceExportSchema>;

/**
 * The JSON.stringify-ready shape: identical but for the timestamps, which are ISO strings on the
 * wire. `IsoTimestamp` runs a `.transform()`, so input and output genuinely differ and a test that
 * compares a freshly built envelope against a parsed one will fail on `Date` vs `string` — a
 * failure that reads like a bug in the conversion. Compare at the `Battle` level instead.
 */
export type WorkspaceExportWire = z.input<typeof WorkspaceExportSchema>;
export type BattleExportWire = z.input<typeof BattleExportSchema>;
