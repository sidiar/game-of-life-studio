import { z } from 'zod';
import { SurvivalRulesSchema } from './survivalRuleSchema';

// FR-2.1 (Story 4.5): the single source for the organism name cap — the "50 char max" UX-DR14
// states. `OrganismSchema.name` enforces it below and `apps/web`'s `<OrganismNameField>` imports it
// rather than re-typing `50`, the same "cap lives in the schema, the component borrows it" rule
// `battleSchema.ts` applies to `MAX_BATTLE_NAME_LENGTH` (whose comment already records that the
// mockup's "/ 50" belongs to organism names, not battles). Counted in UTF-16 code units, which is
// what `z.string().max()` measures.
export const MAX_ORGANISM_NAME_LENGTH = 50;

export const OrganismSchema = z.object({
  // Write-time stamp updated by RFC-006's formatVersion chain and asserted at load
  // (Decision I.4) — never branched on independently. Floored at 1 because the migration
  // chain counts upward from the first published version; 0 or a negative gives it no
  // starting point.
  schemaVersion: z.number().int().min(1),
  // Plain string, NOT `.uuid()` — the protected default organism (FR-1.5, seeded in Story
  // 1.5) uses a stable well-known id ('conways-classic'), not a UUID. Non-empty because the
  // library is keyed by id, and every empty id would collide with every other.
  id: z.string().min(1),
  name: z.string().max(MAX_ORGANISM_NAME_LENGTH),
  // Stable palette token (RFC-007); resolved to hex at render time — NOT a raw hex. The `#`
  // guard is the enforceable half of AR-46 outside apps/web, where the no-raw-hex lint rule
  // does not reach. Resolution against the real palette registry (apps/web/lib/paletteRegistry.ts,
  // Story 1.7) happens at render time, with a default + warn fallback for an unknown token
  // (Decision I.4) — deliberately NOT a stricter schema check here. A `z.enum` of known ids would
  // reject exactly the records that fallback exists to load, and would put this DOM-free,
  // app-agnostic package in the position of depending on an apps/web module.
  colorToken: z
    .string()
    .min(1)
    .refine((t) => !t.startsWith('#'), {
      message: 'colorToken must be a palette token, not a raw hex value (AR-46)',
    }),
  dominance: z.number().int().min(1).max(100), // FR-2.2
  agingEnabled: z.boolean(),
  survivalRules: SurvivalRulesSchema,
});

// Persisted grids are Edit-mode only (H-9): exactly one of the two editable presets. The
// larger Play-mode sizes (150x90, 200x120) are ephemeral and never reach this schema.
// Single-sourced here; RFC-006's export envelope reuses it in a later story (Decision G.1).
export const EditableGridPresetSchema = z.union([
  z.object({ cols: z.literal(50), rows: z.literal(30) }),
  z.object({ cols: z.literal(100), rows: z.literal(60) }),
]);

export type Organism = z.infer<typeof OrganismSchema>;
export type EditableGridPreset = z.infer<typeof EditableGridPresetSchema>;
