import { NEW_ORGANISM_DOMINANCE, type Organism } from '@gol/domain';
import { defaultColorToken } from '@/lib/palette/defaultColorToken';
import type { RuleDraft } from './ruleDraft';

/**
 * The editor's unsaved organism (RFC-005 Decision 1: ephemeral UI state, local to the modal —
 * `<OrganismEditorModal>` holds it in `useState`, never `useOrganismEditorModal`, which owns
 * lifecycle only and sits in the first-load chunk). One typed object from the first field, not one
 * `useState` per field: Story 4.17 seeds the whole draft from a loaded `Organism` in one
 * assignment, Story 4.23 diffs one object against one seed for the editor's own dirty scope
 * (AR-33), and Story 4.16 parses one object into an `Organism`. Grows one field per story — 4.6
 * `dominance`, 4.7 `agingEnabled`/`colorToken`, 4.8's M6 colour seed and 4.10's `survivalRules` are
 * done. It will never be `Omit<Organism, 'id' | 'schemaVersion'>`: the rules are `RuleDraft`s, not
 * `SurvivalRule`s (`ruleDraft.ts`'s header — a draft rule cannot satisfy the persisted schema the
 * moment "+ Add Rule" is pressed), so Story 4.16's save path parses `{ ...rule, contentHash }` per
 * rule rather than the draft matching the entity type field-for-field. A `Pick` of the domain
 * entity for the scalar fields so THEIR types are the schema's, never re-declared. Mirror of
 * `lib/battle/newBattleDraft.ts`.
 */
export type OrganismDraft = Pick<Organism, 'name' | 'dominance' | 'agingEnabled' | 'colorToken'> & {
  readonly survivalRules: readonly RuleDraft[];
};

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
 * is the M6 default for the library the editor opened over (Story 4.8, FR-2.3): `usedColorTokens`
 * is one token per organism, taken from the caller's loaded library — Story 4.25's battle-origin
 * editor passes the same list; Story 4.17 does not call this factory at all, it seeds from the
 * record. `survivalRules` seeds to a FRESH empty array per call (Story 4.10) — never a shared
 * module-level `[]` — for the same reason as the rest of the draft: it is diffed against its seed,
 * and a shared array would move with every edit made through this call's own reference.
 */
export function createNewOrganismDraft(usedColorTokens: readonly string[]): OrganismDraft {
  return {
    name: '',
    dominance: NEW_ORGANISM_DOMINANCE,
    agingEnabled: false,
    colorToken: defaultColorToken(usedColorTokens),
    survivalRules: [],
  };
}
