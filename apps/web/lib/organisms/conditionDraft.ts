import {
  CELL_STATES,
  CONDITION_PROPERTIES,
  NUMERIC_CONDITION_PROPERTIES,
  NUMERIC_OPERATORS,
  type CellState,
  type Condition,
  type NumericConditionProperty,
  type NumericOperator,
  type Organism,
} from '@gol/domain';
import { parseIntegerText } from './integerText';

/**
 * The condition-under-edit vocabulary (Story 4.11, FR-2.5). Lives in `lib/organisms/` — the
 * `ruleDraft.ts` mirror — and not `@gol/domain`, because a draft shape and its UX strings are
 * editor-level (the same reasoning `ruleDraft.ts`'s own header gives): `ConditionDraft` can hold
 * text a `Condition` never could (FD3), and the messages below are UI copy, not schema. No Zod
 * call anywhere in this file — `ConditionSchema` is the fast-check test's oracle, never the
 * editor's own validator (project-context: Zod parses at boundaries).
 *
 * `parseConditionDraft` is the ONE definition of "valid" here: `validateConditionDraft` (the
 * displayed-error view, Story 4.13's Save gate) and `conditionFromDraft` (the persisted-shape
 * view, Story 4.16's save and Story 4.15's preview) both read it, so the two can never disagree
 * about what "invalid" means.
 */

export type ConditionProperty = Condition['property'];
export type ScalarOperator = Exclude<NumericOperator, 'range'>;
/** What the Organism Type dropdown needs of a library entry — `Organism[]` assigns to it. */
export type OrganismOption = Pick<Organism, 'id' | 'name'>;

interface ConditionDraftBase {
  readonly id: string; // editor-only key (AC6) — never reaches `Condition`
}

export interface CellStateConditionDraft extends ConditionDraftBase {
  readonly property: 'cellState';
  readonly operator: 'eq';
  readonly pattern: CellState;
}

export interface OrganismTypeConditionDraft extends ConditionDraftBase {
  readonly property: 'organismType';
  readonly operator: 'eq';
  readonly pattern: string;
}

export interface ScalarConditionDraft extends ConditionDraftBase {
  readonly property: NumericConditionProperty;
  readonly operator: ScalarOperator;
  readonly pattern: string; // raw text, never a number (FD3)
}

export interface RangeConditionDraft extends ConditionDraftBase {
  readonly property: NumericConditionProperty;
  readonly operator: 'range';
  readonly pattern: readonly [string, string];
}

export type NumericConditionDraft = ScalarConditionDraft | RangeConditionDraft;

export type ConditionDraft =
  CellStateConditionDraft | OrganismTypeConditionDraft | NumericConditionDraft;

// --- Labels (UX-DR10; design doc :387-411; PRD FR-2.5 for the cell states) ----------------------

export function conditionPropertyLabel(property: ConditionProperty): string {
  switch (property) {
    case 'cellState':
      return 'Cell State';
    case 'organismType':
      return 'Organism Type';
    case 'age':
      return 'Age of Cell';
    case 'neighborCount':
      return 'Neighbor Count';
    case 'occupantNeighborCount':
      return 'Occupant Neighbor Count';
  }
}

export function operatorLabel(operator: NumericOperator): string {
  switch (operator) {
    case 'eq':
      return '=';
    case 'gt':
      return '>';
    case 'lt':
      return '<';
    case 'gte':
      return '>=';
    case 'lte':
      return '<=';
    case 'range':
      return 'Range';
  }
}

// FR-2.5's own words ("Empty, Alive (your organism), or Occupied (another organism)") — the
// verified Decision C semantics: `alive` is the evaluating organism's own cell, `occupied` is
// another organism's (Story 4.10 FD7 deferred this explanation here; the per-action paragraph
// stays unbuilt, deferred-work.md).
export function cellStateLabel(state: CellState): string {
  switch (state) {
    case 'empty':
      return 'Empty';
    case 'alive':
      return 'Alive (your organism)';
    case 'occupied':
      return 'Occupied (another organism)';
  }
}

/** `['eq']` for the two singletons, `NUMERIC_OPERATORS` otherwise (same reference — `withOperator`
 * and the tests rely on this being the literal array, not a fresh copy). */
export function operatorsFor(property: ConditionProperty): readonly NumericOperator[] {
  return property === 'cellState' || property === 'organismType' ? ['eq'] : NUMERIC_OPERATORS;
}

// --- Bounds — editor tightening INSIDE the schema's 0..65534 (survivalRuleSchema.ts:3-5) --------

export const MIN_NUMERIC_LITERAL = 0;
export const MAX_NEIGHBOR_COUNT = 8; // Moore neighbourhood, FR-5.8; design doc :404/:409
export const MAX_AGE_LITERAL = 999; // design doc :399 (flagged: schema allows 65534)

export function numericBoundsFor(property: NumericConditionProperty): {
  readonly min: number;
  readonly max: number;
} {
  switch (property) {
    case 'age':
      return { min: MIN_NUMERIC_LITERAL, max: MAX_AGE_LITERAL };
    case 'neighborCount':
    case 'occupantNeighborCount':
      return { min: MIN_NUMERIC_LITERAL, max: MAX_NEIGHBOR_COUNT };
  }
}

// --- Guards — the `<select>` string meets the union here, never an `as` (the isRuleAction idiom) -

export function isConditionProperty(value: string): value is ConditionProperty {
  return (CONDITION_PROPERTIES as readonly string[]).includes(value);
}

export function isNumericConditionProperty(value: string): value is NumericConditionProperty {
  return (NUMERIC_CONDITION_PROPERTIES as readonly string[]).includes(value);
}

export function isNumericOperator(value: string): value is NumericOperator {
  return (NUMERIC_OPERATORS as readonly string[]).includes(value);
}

export function isCellState(value: string): value is CellState {
  return (CELL_STATES as readonly string[]).includes(value);
}

// --- Construction and transitions (AC3) ----------------------------------------------------------

/** "+ Add Condition" appends this — dropdowns default to first option (design doc :604), and a
 * fresh row is valid by construction. Takes the id — it does not mint one — the same
 * `createNewRuleDraft` purity contract (the caller mints outside any updater). */
export function createNewConditionDraft(id: string): CellStateConditionDraft {
  return { id, property: 'cellState', operator: 'eq', pattern: 'empty' };
}

/** A property switch replaces the whole row: `cellState` -> `eq`/`'empty'`; `organismType` ->
 * `eq`/`defaultOrganismId`; a numeric property -> `eq`/`''`. */
export function defaultConditionFor(
  id: string,
  property: ConditionProperty,
  defaultOrganismId: string,
): ConditionDraft {
  switch (property) {
    case 'cellState':
      return { id, property: 'cellState', operator: 'eq', pattern: 'empty' };
    case 'organismType':
      return { id, property: 'organismType', operator: 'eq', pattern: defaultOrganismId };
    default:
      return { id, property, operator: 'eq', pattern: '' };
  }
}

/** Same property, new operator: scalar<->scalar keeps `pattern`; to/from `range` resets it. The
 * SAME object comes back for a same-operator call, so a no-op re-render never fires. */
export function withOperator(
  draft: NumericConditionDraft,
  operator: NumericOperator,
): NumericConditionDraft {
  if (operator === draft.operator) return draft;
  if (operator === 'range') {
    return { id: draft.id, property: draft.property, operator: 'range', pattern: ['', ''] };
  }
  if (draft.operator === 'range') {
    return { id: draft.id, property: draft.property, operator, pattern: '' };
  }
  return { id: draft.id, property: draft.property, operator, pattern: draft.pattern };
}

// --- List helpers — same-reference on an unknown id, other rows by reference (the ruleDraft.ts contract) --

export function appendCondition(
  conditions: readonly ConditionDraft[],
  condition: ConditionDraft,
): readonly ConditionDraft[] {
  return [...conditions, condition];
}

export function removeCondition(
  conditions: readonly ConditionDraft[],
  id: string,
): readonly ConditionDraft[] {
  if (!conditions.some((condition) => condition.id === id)) return conditions;
  return conditions.filter((condition) => condition.id !== id);
}

export function replaceCondition(
  conditions: readonly ConditionDraft[],
  next: ConditionDraft,
): readonly ConditionDraft[] {
  if (!conditions.some((condition) => condition.id === next.id)) return conditions;
  return conditions.map((condition) => (condition.id === next.id ? next : condition));
}

// --- Validity — ONE parse, two views (AC6). Messages are the UX strings (design doc :768-770). --

export type ConditionDraftField = 'value' | 'min' | 'max' | 'pair';

export interface ConditionDraftError {
  readonly field: ConditionDraftField;
  readonly message: string;
}

// Strict `<`, not the schema's `<=` (AC4/FD8 — deliberate, an [n,n] range still parses on import).
export const MIN_LESS_THAN_MAX = 'Min must be less than Max';
export const ORGANISM_REQUIRED = 'Select an organism';

export function wholeNumberMessage(
  label: 'Enter' | 'Min must be' | 'Max must be',
  min: number,
  max: number,
): string {
  return `${label} a whole number from ${min} to ${max}`;
}

/** `parseIntegerText`, then bounds-checked. `null` on non-integer text OR an in-bounds-parse that
 * falls outside `[min, max]` — the two rejection reasons collapse to one signal because the
 * message is the same either way. */
function parseBoundedInteger(text: string, min: number, max: number): number | null {
  const value = parseIntegerText(text);
  if (value === null) return null;
  return value >= min && value <= max ? value : null;
}

/**
 * The one parse. Builds the `Condition` object LITERALLY per variant (no spread of the draft —
 * `id` must not leak, and the discriminated union narrows per branch with no cast). Order for
 * `range`: min, then max, then pair — the AC4 order.
 */
export function parseConditionDraft(
  draft: ConditionDraft,
):
  | { readonly ok: true; readonly condition: Condition }
  | { readonly ok: false; readonly error: ConditionDraftError } {
  switch (draft.property) {
    case 'cellState':
      return {
        ok: true,
        condition: { property: 'cellState', operator: 'eq', pattern: draft.pattern },
      };

    case 'organismType':
      if (draft.pattern.length === 0) {
        return { ok: false, error: { field: 'value', message: ORGANISM_REQUIRED } };
      }
      return {
        ok: true,
        condition: { property: 'organismType', operator: 'eq', pattern: draft.pattern },
      };

    default: {
      const { min, max } = numericBoundsFor(draft.property);

      if (draft.operator === 'range') {
        const [minText, maxText] = draft.pattern;
        const minValue = parseBoundedInteger(minText, min, max);
        if (minValue === null) {
          return {
            ok: false,
            error: { field: 'min', message: wholeNumberMessage('Min must be', min, max) },
          };
        }
        const maxValue = parseBoundedInteger(maxText, min, max);
        if (maxValue === null) {
          return {
            ok: false,
            error: { field: 'max', message: wholeNumberMessage('Max must be', min, max) },
          };
        }
        if (minValue >= maxValue) {
          return { ok: false, error: { field: 'pair', message: MIN_LESS_THAN_MAX } };
        }
        return {
          ok: true,
          condition: { property: draft.property, operator: 'range', pattern: [minValue, maxValue] },
        };
      }

      const value = parseBoundedInteger(draft.pattern, min, max);
      if (value === null) {
        return {
          ok: false,
          error: { field: 'value', message: wholeNumberMessage('Enter', min, max) },
        };
      }
      return {
        ok: true,
        condition: { property: draft.property, operator: draft.operator, pattern: value },
      };
    }
  }
}

export function validateConditionDraft(draft: ConditionDraft): ConditionDraftError | null {
  const result = parseConditionDraft(draft);
  return result.ok ? null : result.error;
}

export function conditionFromDraft(draft: ConditionDraft): Condition | null {
  const result = parseConditionDraft(draft);
  return result.ok ? result.condition : null;
}

/** The inverse, for seeding (Story 4.17) and fixtures: numbers become their decimal text. */
export function conditionDraftFrom(condition: Condition, id: string): ConditionDraft {
  switch (condition.property) {
    case 'cellState':
      return { id, property: 'cellState', operator: 'eq', pattern: condition.pattern };

    case 'organismType':
      return { id, property: 'organismType', operator: 'eq', pattern: condition.pattern };

    default: {
      // `operator` and `pattern` are independent fields on the schema's own (non-discriminated)
      // NumericCondition type, so TS cannot correlate them from `operator` alone — narrow on
      // `Array.isArray(pattern)` instead, which the schema's own refine guarantees agrees with
      // `operator === 'range'`. The ternary below re-derives the same fact for `operator`'s type,
      // without an `as` cast.
      const pattern = condition.pattern;
      if (Array.isArray(pattern)) {
        const [min, max] = pattern;
        return {
          id,
          property: condition.property,
          operator: 'range',
          pattern: [String(min), String(max)],
        };
      }
      return {
        id,
        property: condition.property,
        operator: condition.operator === 'range' ? 'eq' : condition.operator,
        pattern: String(pattern),
      };
    }
  }
}
