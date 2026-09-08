// The data model of the generic rules engine (RFC-004 §1.1/§1.3): three nested levels — Condition,
// Rule, RuleSet — plus the Selectors seam that lets any subject plug in.
//
// ⚠️ @gol/domain exports a type also called `Condition` (the concrete, Zod-inferred GoL one). They
// coexist across packages, but Story 3.2 imports both into one file and will have to alias. The
// names here are RFC-004's and stay as they are; this note exists so 3.2 finds the collision by
// reading rather than by a compile error.
import type { Operator } from './operators';

// Adapter (RFC-004 §1.3): a pure function from subject to value. Returning `unknown` is what lets
// the engine stay generic over S without ever importing a concrete subject.
export type Selector<S> = (subject: S) => unknown;

// `Props` is the set of property names this dictionary covers, and it is the reason a missing
// selector is a BUILD failure here rather than a per-cell runtime throw (story FD3, option c).
// noUncheckedIndexedAccess is off repo-wide, so a plain Record<string, Selector<S>> hands back a
// Selector the compiler believes in and the runtime does not — a typo'd property then throws
// "selectors[...] is not a function" from inside the hot path, per cell, with no useful message.
// Naming the key set instead turns that into "Property 'neighborCount' is missing", at compile
// time, at the call site that owns the omission. It also costs nothing at runtime: no guard, no
// branch, no fallback in the NFR-1.1 inner loop.
//
// ⚠️ NO DEFAULT on Props here, deliberately — and this is the one type in the file that must not
// have one. `Props = string` would make `Selectors<S>` mean `Record<string, Selector<S>>`, which
// TypeScript treats as TOTAL over every string key (noUncheckedIndexedAccess is off repo-wide). A
// selector dictionary missing an entry would then type-check, and `selectors[...]` would hand back
// a Selector the compiler believes in and the runtime does not — reinstating, silently and by
// default, the exact "is not a function" throw this seam exists to prevent. The guarantee is only
// real when the key set is named, so naming it is mandatory.
//
// Condition / Rule / RuleSet DO keep a `string` default: their default is harmless (it widens a
// property name, it does not fake a lookup), and AC5 requires a bare `RuleSet<SurvivalPayload>` to
// be a legal way to spell the persisted GoL shape. A caller that genuinely wants the loose form can
// still write `Selectors<S, string>` — now an explicit, visible opt-in rather than what you get by
// saying nothing.
export type Selectors<S, Props extends string> = Readonly<Record<Props, Selector<S>>>;

// The atomic predicate: the subject's VALUE (resolved via `property`) tested against `pattern`.
//
// RFC-004 §1.1 declares this as `Condition<P = unknown>` where P is the PATTERN type, then never
// supplies it — `Rule.conditions` is a bare `Condition[]` and every §1.4 signature takes a bare
// `Condition` — while §1.4 reuses the same letter P for the PAYLOAD. One letter, two meanings, and
// the pattern one inert (story FD1). Resolved here by dropping the pattern parameter entirely:
// `pattern: unknown` matches the Predicate contract the operator dictionary already declares, and
// keeps Condition assignable FROM @gol/domain's concrete Condition, whose patterns are
// `string | number | [number, number]`. The parameter this type does carry, `Props`, actually
// threads through Rule.conditions — an inert type parameter is worse than none, because it looks
// load-bearing.
export interface Condition<Props extends string = string> {
  readonly property: Props;
  readonly operator: Operator;
  readonly pattern: unknown;
}

// An AND-group of Conditions carrying an opaque payload.
//
// ⚠️ The engine NEVER inspects `payload` — not to sort, not to filter, not to "optimize". That is
// the single thing keeping this layer reusable; returning an action instead of a Rule would weld it
// to the Game of Life. Story 3.5's death-before-survival precedence (M10) partitions rules by
// `payload.action` OUTSIDE this package, because that partition is GoL precedence, not a generic
// concern.
//
// `id` and `contentHash` are OPAQUE strings here (AR-21) — never parsed, prefixed, compared for
// content, or generated. Identical rules share a contentHash and keep distinct ids, so neither
// implies the other. Generation belongs to Epic 4 (authoring) and Story 3.4 (the contentHash-keyed
// evaluator cache, Decision E.4); writing a hasher here would fork rule identity across every
// installed workspace.
export interface Rule<Payload = unknown, Props extends string = string> {
  readonly id: string;
  readonly contentHash: string;
  readonly conditions: readonly Condition<Props>[];
  readonly payload: Payload;
}

// An ORDERED list of Rules. Order is priority (FR-2.6) — this is a list, never a set or a map.
//
// ❌ RFC-004 §1.1's `RuleSetCollection` fourth level is deliberately not declared: the RFC itself
// marks it "Not in the MVP", and reserving a name for nothing is speculative code.
export type RuleSet<Payload = unknown, Props extends string = string> = readonly Rule<
  Payload,
  Props
>[];
