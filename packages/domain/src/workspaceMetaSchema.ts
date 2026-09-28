import { z } from 'zod';

/**
 * Workspace-level metadata (FR-9.5, Story 7.2) — today one field, the workspace description. It is
 * DATA, not a setting: it travels with Export Workspace, is replaced by import (M8) and cleared by
 * Clear All — the opposite of every property `gol:settings` has (Decision F / AR-12), which is why
 * it gets its own schema and at-rest key rather than a field on `SettingsSchema`.
 */

// One per workspace and shown at the top of the gallery, so it gets more room than the per-entity
// 280 caps. UTF-16 code units, what `z.string().max()` measures.
export const MAX_WORKSPACE_DESCRIPTION_LENGTH = 500;

export const WorkspaceMetaSchema = z.object({
  // Absent ≡ none; no `.min(1)` so a stored `''` is not corruption (writers normalize it away).
  description: z.string().max(MAX_WORKSPACE_DESCRIPTION_LENGTH).optional(),
});

export type WorkspaceMeta = z.infer<typeof WorkspaceMetaSchema>;

/** What an absent or unreadable `gol:workspace` means to every reader: no description. */
export const EMPTY_WORKSPACE_META: WorkspaceMeta = Object.freeze({});

/**
 * The one definition of "absent ≡ empty ≡ whitespace-only" (Story 7.2 FD2): trimmed text, or
 * `undefined` when nothing is left. Every writer (organism save/clone, battle save, workspace meta
 * save, export projection) and every display surface goes through it, so a description of `'  '`
 * can never render an empty paragraph on one surface and nothing on another.
 */
export function normalizeDescription(text: string): string | undefined {
  const trimmed = text.trim();
  return trimmed === '' ? undefined : trimmed;
}
