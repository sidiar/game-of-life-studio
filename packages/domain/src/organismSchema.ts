import { z } from 'zod';
import { SurvivalRulesSchema } from './survivalRuleSchema';

export const OrganismSchema = z.object({
  // Write-time stamp updated by RFC-006's formatVersion chain and asserted at load
  // (Decision I.4) — never branched on independently.
  schemaVersion: z.number().int(),
  // Plain string, NOT `.uuid()` — the protected default organism (FR-1.5, seeded in Story
  // 1.5) uses a stable well-known id ('conways-classic'), not a UUID.
  id: z.string(),
  name: z.string().max(50),
  // Stable palette token (RFC-007); resolved to hex at render time — NOT a raw hex.
  // Validated against the real palette registry starting Story 1.7, not here.
  colorToken: z.string(),
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
