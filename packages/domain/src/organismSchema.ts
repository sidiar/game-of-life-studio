import { z } from 'zod';
import { SurvivalRulesSchema } from './survivalRuleSchema';

// FR-2.1 (Story 4.5): the single source for the organism name cap — the "50 char max" UX-DR14
// states. `OrganismSchema.name` enforces it below and `apps/web`'s `<OrganismNameField>` imports it
// rather than re-typing `50`, the same "cap lives in the schema, the component borrows it" rule
// `battleSchema.ts` applies to `MAX_BATTLE_NAME_LENGTH` (whose comment already records that the
// mockup's "/ 50" belongs to organism names, not battles). Counted in UTF-16 code units, which is
// what `z.string().max()` measures.
export const MAX_ORGANISM_NAME_LENGTH = 50;

// FR-2.2 (Story 4.6): the dominance range, single-sourced — `OrganismSchema.dominance`
// enforces it and `apps/web`'s `<DominanceField>` imports it rather than re-typing 1 / 100.
export const MIN_DOMINANCE = 1;
export const MAX_DOMINANCE = 100;
// The value a NEW organism opens at in the editor (UX-DR8 "default 5") — a product default
// like `DEFAULT_SETTINGS`, not a schema bound. NOT `CONWAYS_CLASSIC.dominance` (50,
// FR-1.5): the protected default is deliberately mid-range; a new custom organism starts low.
export const NEW_ORGANISM_DOMINANCE = 5;

// Story 4.16 / AR-11 / Decision I.4: the STAMP a newly authored organism record is written with —
// a different axis from `CURRENT_FORMAT_VERSION` (Story 1.5 forced decision 3: both are `1` today
// and a future `formatVersion` bump that does not touch the organism/rules shape must not restamp
// organisms). Asserted at load, never branched on. `CONWAYS_CLASSIC` keeps its literal `1` (Story
// 4.16 FD2: `defaultWorkspace.ts` is out of that story's scope), and `organismSchema.test.ts` pins
// that the two agree — a future bump has to touch both, through a migration; this constant is what
// that migration step references.
export const ORGANISM_SCHEMA_VERSION = 1 as const;

export const OrganismSchema = z.object({
  // Write-time stamp, ASSERTED at load (Decision I.4: mismatch ⇒ corrupt, NFR-7.3) and never
  // branched on. A literal is safe because `migrate()` (`formatMigrations.ts`) runs the
  // `formatVersion` chain BEFORE this parse at both boundaries — at-rest load and file import — so
  // a record a migration step was meant to restamp has been restamped by the time it gets here. A
  // future rules-shape bump changes `ORGANISM_SCHEMA_VERSION` and ships the step that restamps.
  schemaVersion: z.literal(ORGANISM_SCHEMA_VERSION),
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
  dominance: z.number().int().min(MIN_DOMINANCE).max(MAX_DOMINANCE), // FR-2.2
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
