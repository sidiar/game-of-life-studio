import { z } from 'zod';
import { EditableGridPresetSchema } from './organismSchema';

// The at-rest format version stamped into `gol:schema` on the first write (RFC-006 Decision 7)
// and, from Story 5.3, carried by the export envelope as `formatVersion`. Single-sourced here so
// the stamp the repository writes and the envelope literal can never disagree — Decision I makes
// this the only version anything is ever allowed to branch on.
export const CURRENT_FORMAT_VERSION = 1 as const;

// Device-local preferences (Decision F): one record under `gol:settings`, absent from every export
// envelope and unreachable from clearAll(). RFC-006 left the concrete shape as an open question;
// it is fixed here because SettingsRepository cannot be typed without it. One field per
// FR-8.6-8.12 — there is no FR-8.9.
//
// Every field carries a .default() so `parse({})` yields a COMPLETE record. Two real cases need
// that: a fresh install has no key at all, and a record written by an older build is missing
// whatever fields that build predated. Both must load as a usable Settings rather than as
// undefined holes that every consumer would have to re-default.
export const SettingsSchema = z.object({
  theme: z.enum(['clinical-lab', 'biotech-terminal']).default('clinical-lab'), // FR-8.6
  gridLines: z.boolean().default(true), // FR-8.7
  cellAnimation: z.boolean().default(true), // FR-8.8
  // Applies to NEW battles only; an existing battle keeps its own gridSize (FR-8.10).
  defaultGridSize: EditableGridPresetSchema.default({ cols: 100, rows: 60 }),
  autoSave: z.boolean().default(false), // FR-8.11 — explicitly default-Disabled
  // The FR-4.2 gen/sec ladder, shared with the transport speed control (AR-34). Modelled as
  // literals rather than a numeric range: 15 gen/sec is not a selectable speed anywhere.
  defaultSpeed: z
    .union([z.literal(1), z.literal(2), z.literal(5), z.literal(10), z.literal(20)])
    .default(10), // FR-8.12
});

export type Settings = z.infer<typeof SettingsSchema>;

// Derived from the schema rather than written out again — a hand-maintained copy is free to drift
// from the .default() calls above, and the repository's absent-key fallback would then disagree
// with what a partial record backfills to.
export const DEFAULT_SETTINGS: Settings = SettingsSchema.parse({});
