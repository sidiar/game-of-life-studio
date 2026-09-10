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

// ── On the guards below (M12; RFC-004 §1.2 amended to match) ────────────────────────────────────────────────────────────────────────
//
// The original version of this file cast (`value as number`) with no check, arguing that patterns
// are validated once at the persistence boundary by @gol/domain's schemas and that project-context
// says "inside the engine types are already proven — never re-parse per cell". That rationale is
// still correct and is why there is NO Zod re-parse and NO schema work here. But it proved too much:
//
//   1. The casts are erased at runtime, so they proved nothing about `value`. A Selector<S> is typed
//      to return `unknown` and may legitimately return null/undefined for an optional field. JS then
//      coerces: `null` becomes 0, so `null > -1` is silently TRUE, and `undefined` becomes NaN, so
//      every comparison is silently FALSE. Neither is distinguishable from a real numeric miss.
//   2. @gol/domain validates the GoL subject. This layer is parametric over an ARBITRARY subject
//      (AR-16) and is meant to be reused; a future caller brings no such guarantee with it.
//
// So each predicate now answers "is this comparison meaningful?" before answering the comparison,
// and returns `false` — condition unsatisfied — when it is not. A `typeof` check is a tag test on a
// value already in a register; it is nothing like the per-cell Zod re-parse the note above rejects.
//
// Measured on the shape of the real hot path (6,000 cells x 3 conditions x 200 cycles = 3.6M
// evaluations, identical results both ways): 0.141 ms/cycle unguarded vs 0.160 ms/cycle guarded —
// +0.019 ms against the 16.7 ms NFR-1.1 frame budget, ~0.1% of it. Story 3.7 owns the real
// performance harness; re-measure there rather than trusting this note forever.
//
// ⚠️ Failing closed is deliberate but it is not free: malformed rule data yields a rule that never
// fires instead of a crash, which is the right behaviour inside a 60 FPS loop but is also silent.
// The loud half now ships: ../session/validateRules.ts sweeps every condition once per battle at
// evaluator-compile time (Story 3.4, M12) and THROWS, naming the organism and the rule. These
// guards are what still stands between a caller that skipped that compile step and a crash in the
// hot loop, so they stay until Story 3.7 re-measures them.
const isNumber = (v: unknown): v is number => typeof v === 'number';

// ⚠️ NULL PROTOTYPE, deliberately. A plain object literal inherits from Object.prototype, so a
// lookup by an operator id outside the six can still resolve: `operators['toString']` is
// Object.prototype.toString — a real function. An `undefined` check in the caller therefore does NOT
// catch it, and the engine would CALL it, returning "[object Undefined]" (a truthy string) where the
// signature promises a boolean. Every inherited key — 'constructor', 'valueOf', '__proto__' — is the
// same hazard. Dropping the prototype makes the dictionary total over exactly its own six keys, and
// costs nothing at lookup time.
const table = {
  // Intentionally the GENERAL equality operator, not a numeric one: it compares strings (organism
  // ids, cellState) as readily as numbers, so it takes no numeric guard.
  //
  // ⚠️ `NaN === NaN` is false, so a condition whose value AND pattern are both NaN never matches.
  // Left as-is on purpose: `===` is the equality every caller expects, and NaN reaching a rule is an
  // upstream defect to fix there rather than paper over with Object.is here.
  eq: (value, pattern) => value === pattern,
  gt: (value, pattern) => isNumber(value) && isNumber(pattern) && value > pattern,
  lt: (value, pattern) => isNumber(value) && isNumber(pattern) && value < pattern,
  gte: (value, pattern) => isNumber(value) && isNumber(pattern) && value >= pattern,
  lte: (value, pattern) => isNumber(value) && isNumber(pattern) && value <= pattern,
  // ⚠️ Inclusive at BOTH bounds. Conway's Classic survives on `range [2,3]`, which means 2 OR 3; an
  // exclusive upper bound reads as correct, silently drops 3, and breaks every golden pattern in
  // Story 3.6 — three stories after the bug is written. ⚠️ THOSE GOLDENS NOW EXIST
  // (../strategy/conwayGoldens.test.ts): flipping this bound reddens the blinker, the glider and
  // both still-lifes, so the warning above is now enforced rather than merely recorded.
  //
  // The shape check is not redundant with @gol/domain's NumericPattern. Destructuring a non-iterable
  // (`pattern` a bare number, null, or an object) THROWS, and a 1-element array destructures to
  // `high = undefined`, making the range silently unsatisfiable. Both are now a plain `false`.
  //
  // A reversed tuple ([5, 2]) is left unsatisfiable rather than normalised: an inclusive range whose
  // low exceeds its high is genuinely empty, and quietly swapping the bounds would invent an
  // intent the author never expressed.
  range: (value, pattern) => {
    if (!isNumber(value) || !Array.isArray(pattern) || pattern.length !== 2) return false;
    const [low, high] = pattern as [unknown, unknown];
    return isNumber(low) && isNumber(high) && value >= low && value <= high;
  },
} satisfies Record<Operator, Predicate>;

// `satisfies`, not an annotation, so BOTH guarantees survive: the literal is still checked
// exhaustively against Operator — adding a seventh arm fails the build HERE until its entry exists,
// which is the Open/Closed property this dictionary exists for — while the null-prototype copy below
// is what the engine actually indexes, and an annotation on that copy alone would have silently
// dropped the exhaustiveness check.
export const operators: Record<Operator, Predicate> = Object.assign(
  Object.create(null) as Record<Operator, Predicate>,
  table,
);
