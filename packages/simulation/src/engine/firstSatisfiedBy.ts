// The three-level evaluation cascade (RFC-004 §1.4). Pure functions over injected data: no class,
// no `this`, no module-level mutable state (AR-16).
import { operators } from './operators';
import type { Rule, RuleSet, Condition, Selectors } from './rule';

// A condition passes when its operator predicate holds for selector(subject) vs. pattern.
//
// Selectors<S, Props> names its key set, so for a freshly type-checked Condition<Props> the compiler
// HAS already proven a selector exists (rule.ts, FD3) — and since Props lost its `string` default,
// that proof can no longer be opted out of by saying nothing. What the type system cannot prove is
// that a `property` arriving as DATA is one of those keys: a rule deserialized from an older
// workspace, or built by a future non-GoL caller, carries whatever string it carries. Unguarded that
// is a `selectors[...] is not a function` throw from inside the per-cell loop.
//
// `Object.hasOwn`, NOT a `typeof selector === 'function'` tag test. The cheap test looks sufficient
// and is not: a caller's selector dictionary is a plain object literal, so it INHERITS
// Object.prototype. A condition whose property is 'toString', 'valueOf', 'constructor' or
// 'hasOwnProperty' finds a real function there, passes any typeof check, and gets CALLED — and
// these do not degrade politely. `Object.prototype.hasOwnProperty` invoked with `this === undefined`
// throws "Cannot convert undefined or null to object", i.e. exactly the hot-loop crash the guard
// exists to prevent, just from a different direction. (This was written the cheap way first; the
// test below is what caught it.)
//
// Measured cost of doing it properly, on the hot path's shape: 0.128 -> 0.219 ms/cycle, +0.091 ms
// against the 16.7 ms NFR-1.1 frame budget — ~0.5%. Paid deliberately, because the alternative is
// not a wrong answer but a thrown exception. operators.ts closes its half of the same
// inherited-key class at the root with a null prototype; a CALLER's dictionary is not ours to
// reshape, so it is checked at the point of use instead.
//
// The zero-per-cell version of this is a one-pass key sweep at rule-COMPILE time — Story 3.4's
// evaluator cache — after which this guard becomes redundant and can be revisited with 3.7's
// harness in hand.
export function conditionIsSatisfiedBy<S, Props extends string>(
  condition: Condition<Props>,
  subject: S,
  selectors: Selectors<S, Props>,
): boolean {
  if (!Object.hasOwn(selectors, condition.property)) return false;
  const value = selectors[condition.property](subject);
  // `Operator` is a COMPILE-TIME union, so this lookup is only total for a Condition that was
  // freshly type-checked. Anything else — a rule deserialized from an older workspace, an `as` cast,
  // a future non-GoL caller building Conditions by hand — can carry an operator id outside the six.
  // This file's own header notes `ne` was a valid operator until Decision C retired it, so a
  // persisted pre-retirement rule is a concrete path here, not a hypothetical one.
  //
  // Unguarded, `operators[...]` is then `undefined` and CALLING it throws
  // "is not a function" from inside the per-cell hot loop, taking the whole simulation down. One
  // `undefined` comparison turns that into a rule that does not fire. See operators.ts on why
  // failing closed is right here and where the eager diagnostic belongs (Story 3.4, compile time).
  const predicate = operators[condition.operator];
  if (predicate === undefined) return false;
  return predicate(value, condition.pattern);
}

// A rule passes when ALL of its conditions pass (Composite, AND semantics).
//
// ⚠️ `every` short-circuits at the first false; a map-then-every would evaluate every condition
// first. On a 6,000-cell grid at 60 FPS (NFR-1.1) that difference is the budget.
export function ruleIsSatisfiedBy<S, Props extends string>(
  rule: Rule<unknown, Props>,
  subject: S,
  selectors: Selectors<S, Props>,
): boolean {
  return rule.conditions.every((condition) =>
    conditionIsSatisfiedBy(condition, subject, selectors),
  );
}

// Returns the FIRST rule in RuleSet order whose conditions all pass, or null when none does.
// Order is priority (FR-2.6).
//
// It returns the winning RULE, never a domain action: each caller reads whatever it stored in
// `payload`, which is what keeps this engine reusable (RFC-004 §1.4). Story 3.2's resolveCellAction
// is a thin function built on top of this primitive, not a change to it.
//
// ⚠️ `?? null`, never `|| null`. `find` yields `undefined`, and the two coalescers differ for any
// falsy-but-present value; the signature promises `| null`, and a leaked `undefined` passes
// `!winner` while failing `winner === null` — exactly how a downstream null check stops working
// without anything failing.
export function firstSatisfiedBy<S, Props extends string, Payload>(
  ruleSet: RuleSet<Payload, Props>,
  subject: S,
  selectors: Selectors<S, Props>,
): Rule<Payload, Props> | null {
  return ruleSet.find((rule) => ruleIsSatisfiedBy(rule, subject, selectors)) ?? null;
}
