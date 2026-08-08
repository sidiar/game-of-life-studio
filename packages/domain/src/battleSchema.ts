import { z } from 'zod';
import { EditableGridPresetSchema } from './organismSchema';

// Battles are JSON at rest (localStorage in Story 1.4, the RFC-006 export envelope later), so
// timestamps arrive as ISO strings and are hydrated here. `z.date()` would reject every record
// the app itself wrote: JSON.stringify turns a Date into a string, and a Zod transform runs
// *after* validation, so it cannot rescue a parse that already failed on the raw string.
// RFC-001 §3's load snippet assumes the opposite and cannot work; RFC-006 already spells these
// two fields as ISO strings, so this is also what lets the two schemas share a value.
const IsoTimestamp = z.iso.datetime().transform((s) => new Date(s));

export const BattleSchema = z
  .object({
    id: z.uuid(),
    name: z.string().max(100),
    // References into the shared Organism Library (FR-7.15); <=255 = the dense-encoding /
    // Uint8Array occupant cap (Decision G.3) — the library itself stays uncapped (M6).
    // Entries are non-empty: an empty id is unresolvable against the library.
    organismIds: z.array(z.string().min(1)).max(255),
    gridSize: EditableGridPresetSchema,
    gridState: z.array(z.array(z.number().int().min(0).max(255))),
    createdAt: IsoTimestamp,
    updatedAt: IsoTimestamp,
  })
  .superRefine((b, ctx) => {
    // Structural invariants the architecture already commits to (Decision G.2 / H.1). Each
    // issue carries a `path` so a consumer can attach it to the field that actually failed —
    // without one every structural error lands at the root and can only be told apart by
    // substring-matching the English message.
    if (
      b.gridState.length !== b.gridSize.rows ||
      b.gridState.some((r) => r.length !== b.gridSize.cols)
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['gridState'],
        message: 'gridState dimensions must match gridSize',
      });
    }
    if (b.gridState.some((r) => r.some((v) => v > b.organismIds.length))) {
      ctx.addIssue({
        code: 'custom',
        path: ['gridState'],
        message: 'gridState cell values must index into organismIds (v <= organismIds.length)',
      });
    }
    // "Used by a battle" always means placed, never merely present in the roster
    // (Decision H.1) — build the placed-value set once and check every roster index is in it.
    const placed = new Set(b.gridState.flat().filter((v) => v > 0));
    if (b.organismIds.some((_, i) => !placed.has(i + 1))) {
      ctx.addIssue({
        code: 'custom',
        path: ['organismIds'],
        message:
          'organismIds must be exactly the placed set — no unplaced roster members at rest (Decision H.1)',
      });
    }
    // Decision H.1 calls organismIds a *set*. A repeated id hands one organism two occupant
    // codes, which the AR-15 usage index double-counts and the Decision E.2 roster remap
    // cannot collapse back to a single slot.
    if (new Set(b.organismIds).size !== b.organismIds.length) {
      ctx.addIssue({
        code: 'custom',
        path: ['organismIds'],
        message: 'organismIds must not contain duplicate library ids',
      });
    }
  });

// Output type — timestamps are hydrated Dates. The *input* (wire/JSON) shape carries ISO
// strings; use `z.input<typeof BattleSchema>` where the serialized form is meant.
export type Battle = z.infer<typeof BattleSchema>;

// Lightweight Gallery/index projection (Decision H.4). organismIds is the placed set
// (Decision H.1), so the AR-15 organism-usage index and the Gallery build from `battles.list()`
// without a single grid being validated or converted.
//
// Zod's default strip IS the projection mechanism: a full stored battle record parses straight
// through and comes back as the summary. It also means a battle whose gridState is corrupt still
// lists — the Gallery stays readable and the failure surfaces from load(), where the grid is
// actually needed. Widening this schema to re-validate gridState would silently undo that.
//
// The field list omits `createdAt` as well as `gridState`: FR-7.3's "Date created / last modified"
// is ONE value, not two — the creation date until a battle is first edited, then the edit date —
// and `updatedAt` alone already is that, since it starts equal to `createdAt` and only diverges on
// a later save. The Gallery mockup renders exactly one date per tile for the same reason.
export const BattleSummarySchema = z.object({
  id: z.uuid(),
  name: z.string().max(100),
  gridSize: EditableGridPresetSchema,
  organismIds: z.array(z.string().min(1)).max(255),
  updatedAt: IsoTimestamp,
});

export type BattleSummary = z.infer<typeof BattleSummarySchema>;
