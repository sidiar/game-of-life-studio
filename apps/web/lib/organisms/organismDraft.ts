import { NEW_ORGANISM_DOMINANCE, type Organism } from '@gol/domain';
import { defaultColorToken } from '@/lib/palette/defaultColorToken';
import {
  type ConditionDraft,
  type ConditionDraftField,
  validateConditionDraft,
} from './conditionDraft';
import {
  ruleDraftFrom,
  ruleNeedsCondition,
  RULE_NEEDS_CONDITION,
  type RuleDraft,
} from './ruleDraft';
import { validateOrganismName } from './organismName';

/**
 * The editor's unsaved organism (RFC-005 Decision 1: ephemeral UI state, local to the modal —
 * `<OrganismEditorModal>` holds it in `useState`, never `useOrganismEditorModal`, which owns
 * lifecycle only and sits in the first-load chunk). One typed object from the first field, not one
 * `useState` per field: Story 4.17 seeds the whole draft from a loaded `Organism` in one
 * assignment (`organismDraftFrom`, below), Story 4.23 diffs one object against one baseline (the
 * seed until a successful Save, then that Save's snapshot) for the editor's own dirty scope (AR-33), and Story 4.16 parses one object into an `Organism`. Grows one
 * field per story — 4.6
 * `dominance`, 4.7 `agingEnabled`/`colorToken`, 4.8's M6 colour seed and 4.10's `survivalRules` are
 * done, and Story 4.13's validator (`validateOrganismDraft`, below) reads all of them. It will
 * never be `Omit<Organism, 'id' | 'schemaVersion'>`: the rules are `RuleDraft`s, not
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
 * editor passes the same list; an edit session (Story 4.17) never calls this factory, it seeds
 * from the record through `organismDraftFrom`. `survivalRules` seeds to a FRESH empty array per
 * call (Story 4.10) — never a shared module-level `[]` — for the same reason as the rest of the
 * draft: it is diffed against its seed, and a shared array would move with every edit made through
 * this call's own reference.
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

/**
 * Seeds an edit session from a loaded record (Story 4.17) — the inverse of `projectOrganismForSave`
 * minus `id` / `schemaVersion`, which are the save path's (the modal's `saveStamp` carries the id
 * from mount; the version is restamped from `ORGANISM_SCHEMA_VERSION` on write). Pure: `nextId` is
 * the condition-id source `ruleDraftFrom` contracts for — never `crypto` in here, so a test can
 * count the calls and the seed stays deterministic. `name` is RAW as stored (the projection wrote
 * it raw, so trimming here would make an unchanged re-save differ from the record). Rules keep the
 * record's order and their own `id`s (RFC-004 §2.4 — re-minting would fork rule identity on every
 * edit); `contentHash` is dropped and recomputed at save, so an UNCHANGED re-save reproduces the
 * record byte for byte (the round-trip identity `organismDraft.test.ts` pins).
 */
export function organismDraftFrom(organism: Organism, nextId: () => string): OrganismDraft {
  return {
    name: organism.name,
    dominance: organism.dominance,
    agingEnabled: organism.agingEnabled,
    colorToken: organism.colorToken,
    survivalRules: organism.survivalRules.map((rule) => ruleDraftFrom(rule, nextId)),
  };
}

// --- Validity — the Save gate's view (Story 4.13). One validator over the fields' own. ---

/** Where an error lives, in the shape the modal's focus effect resolves to a control
 * (`errorTargetSelector`) — ids, never indices: a rule's index changes on reorder
 * (Story 4.12) while its id does not (RFC-004 §2.4). */
export type DraftErrorTarget =
  | { readonly kind: 'name' }
  | { readonly kind: 'rule'; readonly ruleId: string }
  | {
      readonly kind: 'condition';
      readonly ruleId: string;
      readonly conditionId: string;
      readonly field: ConditionDraftField;
    };

export interface DraftError {
  readonly target: DraftErrorTarget;
  readonly message: string;
}

/**
 * Every displayed error the draft holds, in DOCUMENT order — name (Basic Information
 * column), then each rule in list order, then within a rule either its zero-condition
 * error OR its rows' errors in row order (exclusive: a rule with rows has no
 * zero-condition error). `[]` means "valid". The first entry is what Save focuses.
 *
 * Calls the SAME validators the fields render from (`validateOrganismName`,
 * `validateConditionDraft`) so the gate and the inline lines cannot disagree about
 * what "invalid" means — the `organismName.ts` header's contract. Deliberately checks
 * NOTHING for `colorToken` (always a PALETTE id — seeded by `defaultColorToken`, written
 * only by a radio whose value is one), `dominance` (clamped before every commit,
 * `<DominanceField>` FD4), `agingEnabled` (a boolean) or a rule's summary (clamped at
 * `MAX_RULE_SUMMARY_LENGTH`): each is valid by construction and a check here would be
 * dead code with a message no user can reach. Zero rules is NOT an error (design doc
 * `:551, :764-765`: "Allow save but show warning") — the warning belongs to the save
 * that proceeds (Story 4.16), not to this gate. No Zod: this is the displayed-error
 * view; 4.16's parse at the persistence boundary is the other view of the same facts.
 */
export function validateOrganismDraft(draft: OrganismDraft): readonly DraftError[] {
  const errors: DraftError[] = [];
  const nameError = validateOrganismName(draft.name);
  if (nameError !== null) errors.push({ target: { kind: 'name' }, message: nameError });
  for (const rule of draft.survivalRules) {
    if (ruleNeedsCondition(rule)) {
      errors.push({ target: { kind: 'rule', ruleId: rule.id }, message: RULE_NEEDS_CONDITION });
      continue;
    }
    for (const condition of rule.conditions) {
      const error = validateConditionDraft(condition);
      if (error !== null) {
        errors.push({
          target: {
            kind: 'condition',
            ruleId: rule.id,
            conditionId: condition.id,
            field: error.field,
          },
          message: error.message,
        });
      }
    }
  }
  return errors;
}

// --- Dirty scope — the editor's own, independent of the battle's (Story 4.23, AC1, AC5). ---

/** `ConditionDraft`'s `id` is deliberately excluded (FD1): it is an editor-only key that never
 * reaches `Condition`, so a deleted-and-re-added identical condition would save byte-identical and
 * must read as clean. `pattern` is compared element-wise for a range (an array), by value
 * otherwise — `property`/`operator` equal already guarantees the two sides share pattern shape. */
function conditionDraftsEqual(a: ConditionDraft, b: ConditionDraft): boolean {
  if (a.property !== b.property || a.operator !== b.operator) return false;
  if (Array.isArray(a.pattern) || Array.isArray(b.pattern)) {
    return (
      Array.isArray(a.pattern) &&
      Array.isArray(b.pattern) &&
      a.pattern[0] === b.pattern[0] &&
      a.pattern[1] === b.pattern[1]
    );
  }
  return a.pattern === b.pattern;
}

/** A rule's `id` IS compared (FD1): it is persisted (RFC-004 §2.4), so a deleted-and-re-added
 * identical rule under a fresh id is a real change to the record and must read as dirty. */
function ruleDraftsEqual(a: RuleDraft, b: RuleDraft): boolean {
  return (
    a.id === b.id &&
    a.payload.action === b.payload.action &&
    a.payload.summary === b.payload.summary &&
    a.conditions.length === b.conditions.length &&
    a.conditions.every((condition, index) => conditionDraftsEqual(condition, b.conditions[index]))
  );
}

/**
 * The editor's own dirty scope (AR-33): `draft` diffed against a `baseline` — never a sticky
 * "touched" flag, so a hand-revert back to the baseline's exact values reads clean again (FD1).
 * Reference equality is the fast path; the id-less condition comparison and the id-ful rule
 * comparison are what make `organismDraft.test.ts`'s revert/re-add cases behave as the story
 * requires. Field order matches `OrganismDraft`'s own declaration.
 */
export function isOrganismDraftDirty(baseline: OrganismDraft, draft: OrganismDraft): boolean {
  if (draft === baseline) return false;
  if (draft.name !== baseline.name) return true;
  if (draft.dominance !== baseline.dominance) return true;
  if (draft.agingEnabled !== baseline.agingEnabled) return true;
  if (draft.colorToken !== baseline.colorToken) return true;
  if (draft.survivalRules.length !== baseline.survivalRules.length) return true;
  return draft.survivalRules.some(
    (rule, index) => !ruleDraftsEqual(rule, baseline.survivalRules[index]),
  );
}
