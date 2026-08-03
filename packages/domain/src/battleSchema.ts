import { z } from 'zod';
import { EditableGridPresetSchema } from './organismSchema';

export const BattleSchema = z
  .object({
    id: z.string().uuid(),
    name: z.string().max(100),
    // References into the shared Organism Library (FR-7.15); <=255 = the dense-encoding /
    // Uint8Array occupant cap (Decision G.3) — the library itself stays uncapped (M6).
    organismIds: z.array(z.string()).max(255),
    gridSize: EditableGridPresetSchema,
    gridState: z.array(z.array(z.number().int().min(0).max(255))),
    createdAt: z.date(),
    updatedAt: z.date(),
  })
  .superRefine((b, ctx) => {
    // Structural invariants the architecture already commits to (Decision G.2 / H.1).
    if (
      b.gridState.length !== b.gridSize.rows ||
      b.gridState.some((r) => r.length !== b.gridSize.cols)
    ) {
      ctx.addIssue({ code: 'custom', message: 'gridState dimensions must match gridSize' });
    }
    if (b.gridState.some((r) => r.some((v) => v > b.organismIds.length))) {
      ctx.addIssue({
        code: 'custom',
        message: 'gridState cell values must index into organismIds (v <= organismIds.length)',
      });
    }
    // "Used by a battle" always means placed, never merely present in the roster
    // (Decision H.1) — build the placed-value set once and check every roster index is in it.
    const placed = new Set(b.gridState.flat().filter((v) => v > 0));
    if (b.organismIds.some((_, i) => !placed.has(i + 1))) {
      ctx.addIssue({
        code: 'custom',
        message:
          'organismIds must be exactly the placed set — no unplaced roster members at rest (Decision H.1)',
      });
    }
  });

export type Battle = z.infer<typeof BattleSchema>;
