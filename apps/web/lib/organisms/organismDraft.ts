import { NEW_ORGANISM_DOMINANCE, type Organism } from '@gol/domain';
import { DEFAULT_COLOR_TOKEN } from '@/lib/palette/paletteRegistry';

/**
 * The editor's unsaved organism (RFC-005 Decision 1: ephemeral UI state, local to the modal —
 * `<OrganismEditorModal>` holds it in `useState`, never `useOrganismEditorModal`, which owns
 * lifecycle only and sits in the first-load chunk). One typed object from the first field, not one
 * `useState` per field: Story 4.17 seeds the whole draft from a loaded `Organism` in one
 * assignment, Story 4.23 diffs one object against one seed for the editor's own dirty scope
 * (AR-33), and Story 4.16 parses one object into an `Organism`. Grows one field per story — 4.6
 * `dominance` and 4.7 `agingEnabled`/`colorToken` are done; 4.8 replaces the `colorToken` seed
 * (and adds the picker) and 4.10 adds `survivalRules` — until it is
 * `Omit<Organism, 'id' | 'schemaVersion'>`. A `Pick` of the domain entity so the field types are
 * the schema's, never re-declared. Mirror of `lib/battle/newBattleDraft.ts`.
 */
export type OrganismDraft = Pick<Organism, 'name' | 'dominance' | 'agingEnabled' | 'colorToken'>;

/**
 * Seeds a brand-new, unsaved organism. Pure — no React, no repository, no id minting (the id and
 * `schemaVersion` are the save path's, Story 4.16). `name` is the EMPTY STRING, never the
 * placeholder: seeding display text as the stored name would pre-fill the field with something
 * the user has to delete (the `createNewBattleDraft` reasoning). `dominance` seeds at
 * `NEW_ORGANISM_DOMINANCE` (UX-DR8's "default 5" for a new organism — distinct from
 * `CONWAYS_CLASSIC.dominance`, 50), imported from `@gol/domain` rather than re-typed as a literal
 * `5` here, which would be a second source. `agingEnabled` seeds `false` per the design doc's
 * "Aging: OFF" (`organism-editor-design.md:530`) — a boolean has no range to single-source, so
 * there is no `NEW_ORGANISM_AGING_ENABLED` constant (it would be a name for `false`); it happens
 * to equal `CONWAYS_CLASSIC.agingEnabled`, which is a coincidence, not a derivation. `colorToken`
 * seeds at `DEFAULT_COLOR_TOKEN` as a stopgap the Story 4.7 aging example strip needs today —
 * Story 4.8 replaces this seed with the M6 next-unused / least-used derivation; nothing else may
 * read the seed's VALUE as meaningful. A fresh object per call, because the draft is diffed
 * against its seed and a shared seed would move with every edit.
 */
export function createNewOrganismDraft(): OrganismDraft {
  return {
    name: '',
    dominance: NEW_ORGANISM_DOMINANCE,
    agingEnabled: false,
    colorToken: DEFAULT_COLOR_TOKEN,
  };
}
