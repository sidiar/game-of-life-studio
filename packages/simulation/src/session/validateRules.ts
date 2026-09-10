// The eager compile-time diagnostic sweep (M12, AC7/AC8). One pass per battle, before the first
// cycle — never per cell.
//
// WHY IT EXISTS: operators.ts and firstSatisfiedBy.ts fail CLOSED per cell (a malformed rule
// becomes a rule that never fires) because a throw inside the 60 FPS loop takes the whole
// simulation down. That is right there and silent everywhere: the author gets no signal at all.
// M12 assigns the loud half here, one pass per battle, where a thrown error costs nothing and can
// name the exact organism and rule. ⚠️ The per-cell guards STAY (AC9, Trap 8): M12 says they
// *become* redundant after this sweep and that the removal is re-measured with Story 3.7's
// harness, not argued.
//
// ❌ NOT a Zod re-parse. project-context keeps schema parsing at the persistence boundary, and
// @gol/domain already closes the PERSISTED path (survivalRuleSchema.ts: `min(1)` conditions, a
// full payload, and `localStorageOrganismRepository` safeParses every read). What this sweep
// protects is the IN-MEMORY path that never round-trips through Zod — Story 4.15's draft organism
// straight out of the editor, plus import (Story 5.8) and migrations (Story 5.7) —
// which is exactly what deferred-work.md's `resolveCellAction` entries describe.
import type { Operator } from '../engine/operators';
import { cellSelectors } from '../gol/cellSubject';
import type { CellProperty } from '../gol/cellSubject';
import type { Action, SurvivalRule, SurvivalRules } from '../gol/survivalRules';

/**
 * A compilation failure, carrying the organism and rule it came from.
 *
 * FD5 (Dev Agent Record): an interface + factory, NOT `class RuleCompilationError extends Error`.
 * `packages/persistence`'s `CorruptDataError` is a real subclass, but that package is not the
 * engine — AR-16 bans classes and `this` in `packages/simulation`, and an Error subclass would be
 * the one exception nothing else here needs. `Object.assign` over a real `Error` keeps
 * `instanceof Error`, the stack, and `catch`-ability, and adds the two fields a caller wants to
 * read without parsing the message.
 */
export interface RuleCompilationError extends Error {
  readonly name: 'RuleCompilationError';
  readonly organismId: string;
  readonly ruleId: string;
}

// Discriminated on `name` AND the two fields the interface promises: a caller wrapping compilation
// (Story 4.15's preview, import, migrations) needs to tell "this organism's rules are malformed"
// apart from a genuine bug, and `instanceof` is unavailable for a factory-made error by design.
// The field checks matter because `name` alone is forgeable by any rethrow that copies it — the
// guard would then hand the caller `undefined` where the type says `string`.
export function isRuleCompilationError(value: unknown): value is RuleCompilationError {
  return (
    value instanceof Error &&
    value.name === 'RuleCompilationError' &&
    typeof (value as { organismId?: unknown }).organismId === 'string' &&
    typeof (value as { ruleId?: unknown }).ruleId === 'string'
  );
}

// A rule with no readable `id` still has to be nameable, or the diagnostic points at nothing.
const UNIDENTIFIED_RULE = '<rule with no id>';

// A roster-level fault — a bad or duplicate organism id, a roster over the cap — has no rule to
// name. The `ruleId` slot carries this marker so a caller reading the field never mistakes it for
// a real id, and the message drops the rule clause. One error channel for everything
// `compileSession` rejects: a caller that can classify a malformed rule can classify a malformed
// roster the same way, instead of one of them escaping as a bare `Error`.
export const ROSTER_LEVEL = '<roster>';

/** The factory behind every compile-time rejection (FD5) — `internOrganisms.ts` throws it too. */
export function ruleCompilationError(
  organismId: string,
  ruleId: string,
  detail: string,
): RuleCompilationError {
  const where =
    ruleId === ROSTER_LEVEL
      ? `organism "${organismId}"`
      : `organism "${organismId}", rule "${ruleId}"`;
  const error: Error = new Error(`Cannot compile ${where}: ${detail}`);
  return Object.assign(error, {
    name: 'RuleCompilationError' as const,
    organismId,
    ruleId,
  });
}

function fail(organismId: string, ruleId: string, detail: string): never {
  throw ruleCompilationError(organismId, ruleId, detail);
}

// Mirrors @gol/domain's `NumericLiteral` — `z.number().int().min(0).max(65534)` (RFC-004 §2.4) —
// for the in-memory path. The bound is not cosmetic: `MAX_RELEVANT_AGE = maxAgeLiteral + 1` has
// to fit the Uint16 age buffer (RFC-004 §3.4, Decision B.5), and a literal of 65535 or `Infinity`
// makes the clamp `../strategy/conflictPhase.ts` applies wrap a saturated cell to 0 — a newborn. `typeof === 'number'`
// alone also lets `NaN` through, and every comparison against NaN is false, so the rule is dead
// for every cell with no diagnostic: the exact silent class this sweep exists to make loud.
// `Number.isInteger` rejects NaN, ±Infinity and fractions in one test.
const MAX_NUMERIC_LITERAL = 65534;
const isNumericLiteral = (value: unknown): value is number =>
  typeof value === 'number' &&
  Number.isInteger(value) &&
  value >= 0 &&
  value <= MAX_NUMERIC_LITERAL;
const NUMERIC_LITERAL_RULE = `an integer from 0 to ${MAX_NUMERIC_LITERAL} (RFC-004 §2.4)`;

// The six (engine/operators.ts). A frozen array, not a Set: a Set is mutable at runtime and this
// is module-level (AR-16 forbids module-level mutable state), and six linear comparisons run once
// per condition per battle.
const OPERATORS: readonly Operator[] = Object.freeze<Operator[]>([
  'eq',
  'gt',
  'lt',
  'gte',
  'lte',
  'range',
]);

const ACTIONS: readonly Action[] = Object.freeze<Action[]>(['born', 'survive', 'die']);

const CELL_STATES: readonly unknown[] = Object.freeze(['empty', 'alive', 'occupied']);

// FD9 (Dev Agent Record): the property x operator legality table, landing HERE rather than staying
// Epic 4's. `deferred-work.md`'s entry names this sweep as one of two possible owners, and the
// knowledge is GoL knowledge — which property takes which operator is `src/gol/`'s, never
// `src/engine/`'s, whose flat `Condition<CellProperty>` admits all 30 pairings by design (M11).
// The 10 illegal ones (`cellState`/`organismType` with anything but `eq`) currently compile
// against @gol/simulation's exported types and then fail closed at runtime with no diagnostic;
// after this table they fail loudly, once, at compile time.
//
// ⚠️ Typed `Record<CellProperty, …>`, so adding a sixth property to `CellProperty` fails the build
// HERE until its row exists — the same Open/Closed property `operators.ts` gets from `satisfies`.
const LEGAL_OPERATORS: Readonly<Record<CellProperty, readonly Operator[]>> = Object.freeze({
  // `eq` only, and three-valued (Decision C) — `ne` is retired, and an ordering operator over a
  // string union means nothing.
  cellState: Object.freeze<Operator[]>(['eq']),
  // `eq` only: the pattern is an opaque library id (Decision E). `age gt <library id>` is not a
  // question with an answer.
  organismType: Object.freeze<Operator[]>(['eq']),
  age: OPERATORS,
  neighborCount: OPERATORS,
  occupantNeighborCount: OPERATORS,
});

function isCellProperty(property: string): property is CellProperty {
  // ⚠️ Checked against `cellSelectors`, the dictionary `firstSatisfiedBy` actually indexes — not
  // against `CellSubject`'s FIELD names. The asymmetry is deliberate (cellSubject.ts, Trap 12):
  // the persisted property NAME is `cellState` while the subject FIELD is `state`, so a sweep
  // validating against field names would reject every saved `cellState` rule ever written.
  //
  // `Object.hasOwn`, not `in` and not a truthiness test, for the same reason firstSatisfiedBy
  // uses it: `cellSelectors` is a frozen object literal that inherits Object.prototype, so
  // 'toString' / 'valueOf' / 'constructor' all resolve to real functions through `in`.
  return Object.hasOwn(cellSelectors, property);
}

function validatePattern(
  organismId: string,
  ruleId: string,
  property: CellProperty,
  operator: Operator,
  pattern: unknown,
): void {
  // The biconditional `survivalRuleSchema.ts` states as a refine: `range` <-> tuple. Both
  // violations are silent at runtime — a non-iterable pattern under `range` used to THROW from
  // inside the operator (M12 records that the original destructured it unchecked), and a scalar
  // operator handed an array simply never matches.
  if ((operator === 'range') !== Array.isArray(pattern)) {
    fail(
      organismId,
      ruleId,
      `operator "${operator}" ${operator === 'range' ? 'requires' : 'must not take'} a [min,max] tuple pattern`,
    );
  }

  if (operator === 'range') {
    const tuple = pattern as readonly unknown[];
    const [low, high] = tuple;
    if (tuple.length !== 2 || !isNumericLiteral(low) || !isNumericLiteral(high)) {
      fail(
        organismId,
        ruleId,
        `a \`range\` pattern must be a [min,max] tuple of two numbers, each ${NUMERIC_LITERAL_RULE}`,
      );
    }
    // Rejected rather than normalised, matching the schema and operators.ts: an inclusive range
    // whose low exceeds its high is satisfiable by no value at all, so the rule is dead for every
    // cell in every cycle with no signal — and swapping the bounds would invent an intent the
    // author never expressed.
    if (low > high)
      fail(
        organismId,
        ruleId,
        `a \`range\` pattern must be [min,max]: [${low},${high}] is inverted`,
      );
    return;
  }

  if (property === 'organismType') {
    // ⚠️ Trap 3, and the single most damaging shape in this file. `organismType` is the only
    // nullable subject field and `eq` is `===`, so a `null` pattern AFFIRMATIVELY matches every
    // empty cell — a `born` rule written that way populates the entire grid. A non-string also
    // cannot be interned: `refById.get(pattern)` would miss and the rule would silently become a
    // never-match. Both are errors here.
    if (typeof pattern !== 'string' || pattern.length === 0) {
      fail(
        organismId,
        ruleId,
        "an `organismType` pattern must be the target organism's non-empty library id (Decision E)",
      );
    }
    return;
  }

  if (property === 'cellState') {
    if (!CELL_STATES.includes(pattern)) {
      fail(
        organismId,
        ruleId,
        `"${String(pattern)}" is not a cellState (empty | alive | occupied)`,
      );
    }
    return;
  }

  if (!isNumericLiteral(pattern)) {
    fail(
      organismId,
      ruleId,
      `property "${property}" requires a numeric pattern — ${NUMERIC_LITERAL_RULE}, got ${String(pattern)}`,
    );
  }
}

function validateRule(organismId: string, rule: SurvivalRule): void {
  // Runtime shape checks on statically-typed fields, deliberately: the reachable path is
  // IN-MEMORY (Story 4.15's draft organism, import, migrations), where nothing has proven the
  // types the signature claims. deferred-work.md verified each of these by execution — a rule
  // with no `conditions` key throws `Cannot read properties of undefined (reading 'every')` from
  // inside the hot loop, and a missing `payload` throws `… (reading 'action')`.
  const ruleId: string =
    typeof rule?.id === 'string' && rule.id.length > 0 ? rule.id : UNIDENTIFIED_RULE;
  if (rule === null || typeof rule !== 'object') {
    fail(organismId, ruleId, 'a rule must be an object');
  }

  // Checked through an `unknown` alias so `Array.isArray` narrows THAT and not `rule.conditions`:
  // narrowing a `readonly Condition<CellProperty>[]` with Array.isArray widens it to `any[]`, and
  // every downstream `condition.property` would then be `any` — silently dropping the exhaustive
  // `Record<CellProperty, …>` lookup this file's guarantees rest on.
  const conditions: unknown = rule.conditions;
  if (!Array.isArray(conditions)) {
    fail(organismId, ruleId, 'a rule must carry a `conditions` array');
  }
  // ⚠️ NOT merely tidiness: `[].every(...)` is TRUE, so a rule with no conditions is vacuously
  // satisfied by every cell and wins the whole list on the first evaluation (FR-2.6 order). The
  // schema rejects it (`z.array(ConditionSchema).min(1)`); the in-memory path had nothing.
  if (rule.conditions.length === 0) {
    fail(organismId, ruleId, 'a rule with no conditions is satisfied by every cell');
  }

  for (const condition of rule.conditions) {
    if (condition === null || typeof condition !== 'object') {
      fail(organismId, ruleId, 'a condition must be an object');
    }
    if (typeof condition.property !== 'string' || !isCellProperty(condition.property)) {
      fail(organismId, ruleId, `"${String(condition.property)}" is not a cell property (FR-2.5)`);
    }
    if (!OPERATORS.includes(condition.operator)) {
      fail(organismId, ruleId, `"${String(condition.operator)}" is not one of the six operators`);
    }
    if (!LEGAL_OPERATORS[condition.property].includes(condition.operator)) {
      fail(
        organismId,
        ruleId,
        `property "${condition.property}" does not take operator "${condition.operator}"`,
      );
    }
    validatePattern(organismId, ruleId, condition.property, condition.operator, condition.pattern);
  }

  // ⚠️ An ERROR, not a skip, and Sidiar decided this rather than the story (deferred-work.md,
  // 2026-09-09, option (c)). Returning `null` for a malformed payload would not fix the silent
  // case, it would FORMALIZE it: `null` means "no rule matched" (Trap 9), which M10 routes to
  // implicit death at cycle end — the collapse resolveCellAction's Trap-7 comment forbids.
  const payload: unknown = rule.payload;
  if (payload === null || typeof payload !== 'object') {
    fail(organismId, ruleId, 'a rule must carry a `payload` object');
  }
  if (!ACTIONS.includes((payload as { action: Action }).action)) {
    fail(
      organismId,
      ruleId,
      `"${String((payload as { action: unknown }).action)}" is not an action (born | survive | die)`,
    );
  }
  // `payload.summary` is deliberately NOT validated: nothing in the engine reads it (only
  // `action` reaches a decision), so requiring it here would reject an otherwise-runnable draft
  // organism for a field that is pure editor UX.

  // `contentHash` IS validated, because the session cache is keyed on the ordered join of a
  // list's hashes (compileEvaluators.ts) and a missing one is not a cosmetic gap:
  // `JSON.stringify([undefined])` and `JSON.stringify([null])` are both `"[null]"`, so every
  // hash-less single-rule list collides on one key and the second organism silently receives the
  // first one's compiled evaluators. The schema's `contentHash: z.string().min(1)` names this
  // exact collision as its reason; a draft that has not been through Epic 4's hasher yet is the
  // in-memory case. Opaque otherwise (AR-21) — never parsed, prefixed or compared for content.
  if (typeof rule.contentHash !== 'string' || rule.contentHash.length === 0) {
    fail(organismId, ruleId, 'a rule must carry a non-empty `contentHash` (AR-21)');
  }
}

/**
 * Throws a `RuleCompilationError` naming the organism and rule at the first problem it finds.
 *
 * Fail-fast rather than collecting every issue (FD5): this runs once, outside the loop, at a
 * boundary a caller can wrap, and one precise message beats a list nobody reads. The migration
 * path if Story 4.15 needs to show the editor every bad rule at once is the result-object shape
 * — `{ evaluators, errors }` — which can be layered over this without changing it.
 */
export function validateSurvivalRules(organismId: string, rules: SurvivalRules): void {
  if (!Array.isArray(rules)) {
    fail(organismId, UNIDENTIFIED_RULE, 'survivalRules must be an array');
  }
  for (const rule of rules) validateRule(organismId, rule);
}
