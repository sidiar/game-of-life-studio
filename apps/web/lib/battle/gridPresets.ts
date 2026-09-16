import type { EditableGridPreset } from '@gol/domain';

/**
 * The FR-8.10 / Decision A Play-mode resize ladder has ONE source of ORDER, and it is this tuple
 * (`simulationSpeed.ts`'s shape, Story 3.13's precedent): `<GridSizeControl>` (Story 3.16), and any
 * future consumer (Story 6.8's settings preset picker), index this array for a slider's positions.
 * `EditableGridPresetSchema` (`packages/domain/src/organismSchema.ts`) stays the authority on what
 * may be EDITED or PERSISTED — the two Edit-mode sizes {50x30, 100x60}. The two larger sizes here,
 * {150x90, 200x120}, are the Decision A.2 "ephemeral Play-mode expansion — never persisted, never
 * edited, never reach a schema", so this tuple is NOT beside `EditableGridPresetSchema` in
 * `@gol/domain` (that placement would invite widening the schema, Decision G.1) and is NOT imported
 * by `editor/GridSettingsSection.tsx` (FD2: the two sides are tied by the compile-time assertion
 * below, not by a shared import — `apps/web` "holds UI and wiring", and slider order is UI).
 */
export const GRID_PRESETS = [
  { cols: 50, rows: 30 },
  { cols: 100, rows: 60 },
  { cols: 150, rows: 90 },
  { cols: 200, rows: 120 },
] as const;

export type GridPreset = (typeof GRID_PRESETS)[number];

// Decision A.1: the editable set is a SUBSET of the Play ladder. `EditableGridPreset` is the
// schema's literal union; a member missing from the tuple above is a type error here, so the
// schema's editable sizes and this ladder cannot drift into naming different sizes (the
// `MissingFromLadder` shape is `simulationSpeed.ts:22-24`'s idiom).
type EditableNotInLadder = Exclude<EditableGridPreset, GridPreset>;
const editableIsSubset: EditableNotInLadder extends never ? true : never = true;
void editableIsSubset;

/**
 * The ladder position of a size, for a detented slider's `value` (Story 3.16 AC2/AC8). The input
 * is `sim.liveSize` — plain numbers, not `GridPreset` (Story 3.10 FD6) — so unlike
 * `simulationSpeed.ts`'s `speedIndex` (whose input is always a ladder member by construction) this
 * DOES need a `-1` branch: a live size reachable only from a test or a future consumer (never in
 * production — `initialGrid` is schema-bound to the two editable presets and `<GridSizeControl>`
 * is the only `resizeLive` caller). The caller decides what an unmatched size renders as
 * (`<GridSizeControl>`'s FD4: the true dimensions, thumb at index 0).
 */
export function gridPresetIndex(size: { cols: number; rows: number }): number {
  return GRID_PRESETS.findIndex((preset) => preset.cols === size.cols && preset.rows === size.rows);
}
