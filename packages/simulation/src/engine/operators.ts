// The operator half of the generic rules engine (RFC-004 §1.2). Nothing in this file names a cell,
// an organism, a grid, an age or an action — that is AR-16's whole point, and the ESLint
// import-boundary block over src/engine/ is what keeps it true rather than merely intended.

// RFC-004 §1.1 writes this as `NumericOperator | EqualityOperator` where `EqualityOperator = 'eq'`.
// 'eq' is already an arm of the numeric union, so the split names the same six operators and is
// collapsed here: a union whose second arm is a subset of its first documents nothing and invites
// the next reader to hunt for a distinction that does not exist.
//
// ❌ No `ne`. Decision C retires it — cellState is three-valued and relative, so "any other
// organism" is `cellState = occupied` and there is no MVP requirement left for a not-equals.
export type Operator = 'eq' | 'gt' | 'lt' | 'gte' | 'lte' | 'range';

// `unknown` on both sides is the contract that keeps the dictionary domain-blind: it compares
// whatever a Selectors<S> handed back against whatever the Condition stored, and knows the meaning
// of neither.
export type Predicate = (value: unknown, pattern: unknown) => boolean;

// Strategy-as-dictionary, keyed by operator id. `Record<Operator, Predicate>` is what makes this
// Open/Closed with the compiler behind it: adding an arm to `Operator` fails the build HERE until
// its entry exists, so a seventh operator can never reach the evaluator half-wired. Adding one is
// a single additive entry — never an edit to the evaluation functions.
//
// The `as number` casts are deliberate and are not an escape hatch. Patterns are validated once at
// the persistence boundary by @gol/domain's schemas; project-context is explicit that "inside the
// engine types are already proven — never re-parse per cell". A `typeof` guard or a Zod re-parse
// here would run once per condition, per cell, per cycle, against the NFR-1.1 60 FPS budget.
export const operators: Record<Operator, Predicate> = {
  eq: (value, pattern) => value === pattern,
  gt: (value, pattern) => (value as number) > (pattern as number),
  lt: (value, pattern) => (value as number) < (pattern as number),
  gte: (value, pattern) => (value as number) >= (pattern as number),
  lte: (value, pattern) => (value as number) <= (pattern as number),
  // ⚠️ Inclusive at BOTH bounds. Conway's Classic survives on `range [2,3]`, which means 2 OR 3; an
  // exclusive upper bound reads as correct, silently drops 3, and breaks every golden pattern in
  // Story 3.6 — three stories after the bug is written. @gol/domain's NumericPattern already
  // guarantees min <= max, so an inverted tuple never reaches this line.
  range: (value, pattern) => {
    const [low, high] = pattern as [number, number];
    return (value as number) >= low && (value as number) <= high;
  },
};
