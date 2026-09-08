// The three-level evaluation cascade (RFC-004 §1.4). Pure functions over injected data: no class,
// no `this`, no module-level mutable state (AR-16).
import { operators } from './operators';
import type { Rule, RuleSet, Condition, Selectors } from './rule';

// A condition passes when its operator predicate holds for selector(subject) vs. pattern.
//
// `selectors[condition.property]` needs no guard and no `?.`: Selectors<S, Props> names its key set,
// so the compiler has already proven every property a Condition<Props> can carry has a selector
// (see rule.ts on FD3). That is the whole reason the seam is typed this way — this line runs once
// per condition, per cell, per cycle.
export function conditionIsSatisfiedBy<S, Props extends string>(
  condition: Condition<Props>,
  subject: S,
  selectors: Selectors<S, Props>,
): boolean {
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
