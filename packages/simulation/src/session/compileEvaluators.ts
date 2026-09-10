// The session boundary (RFC-004 §3.5, AR-18, Decision E.3/E.4): persisted, string-keyed,
// workspace-shared organism data becomes battle-relative numbers and closures ONCE, before the
// first cycle. Everything after this in Epic 3 runs inside the NFR-1.1 frame budget and can afford
// none of it.
import { firstSatisfiedBy } from '../engine/firstSatisfiedBy';
import type { Condition } from '../engine/rule';
import { cellSelectors } from '../gol/cellSubject';
import type { CellProperty, CellSubject, OrganismRef } from '../gol/cellSubject';
import type { Action, SurvivalRule, SurvivalRules } from '../gol/survivalRules';
import { internOrganismIds, NO_MATCH_REF } from './internOrganisms';
import { maxRelevantAge } from './maxRelevantAge';
import { validateSurvivalRules } from './validateRules';

/**
 * What compilation reads off an organism, and nothing more.
 *
 * FD1 (Dev Agent Record): a MINIMAL LOCAL type, not `@gol/domain`'s `Organism` and not RFC-004
 * §3.1's full `OrganismRuntime`. Story 3.2's FD1 made the `@gol/domain` edge TEST-ONLY, and
 * importing `Organism` here would reverse that and drag `colorToken` / `schemaVersion` /
 * `dominance` into the engine — `dominance` is Phase 3's alone, and Story 3.1 already declined to
 * reserve a name for something it did not build. @gol/domain's `Organism` assigns INTO this
 * structurally with no mapping layer; the pin lives in ../domainRuleSetCompatibility.test.ts (M13).
 *
 * ⚠️ CORRECTED IN STORY 3.6 (spec-conflict flag). This comment used to say *"`dominance` and
 * `agingEnabled` are Phase 3's and Story 3.6's"*. Phase 3 reads `dominance` and NOTHING else:
 * FR-2.4 states `agingEnabled` *"affects visual rendering only; cell-age tracking (FR-5.6) is
 * unaffected"*, so it never reaches the engine at all — it is consumed by the renderer (RFC-002's
 * `refToGroup`, Story 3.9). `../strategy/phaseDeps.ts`'s shipped `OrganismRuntime` carries
 * `dominance` alone, and the exact key set is pinned so the field cannot creep back in.
 */
export interface CompilableOrganism {
  // The stable LIBRARY id (AR-21) — the thing being interned. Opaque: never parsed or prefixed.
  readonly id: string;
  readonly survivalRules: SurvivalRules;
}

/**
 * The two phase-partitioned evaluators for one organism (AR-18, RFC-004 §2.3/§3.5).
 *
 * **This shape is M15.** RFC-004 used to disagree with ITSELF here (the same species as M11 and
 * M13, not a doc-vs-doc conflict): §3.1 declared ONE injected `resolveAction: (organism, cell) =>
 * Action | null` on `SimulationDeps`, while §2.3/§3.5 and AR-18 required TWO phase-partitioned
 * closures per organism. The PAIR won, for a reason that outranks the §3.1 line: M10's
 * death-before-survival precedence is a cross-cutting Architecture Decision, and the authority
 * order makes a cross-cutting Decision win over an RFC. It is also a PHASE property, not a
 * parameter — folding it back into one function means re-branching per cell on the very thing the
 * compile-time partition exists to remove.
 *
 * Raised by this story as FD2 and left unminted (declaring a Minor Resolution is an authority-doc
 * act — the M14 precedent); minted as M15 on Sidiar's explicit authorization, 2026-09-10. §3.1's
 * `SimulationDeps` now reads `evaluatorsByRef`, so there is no `deps.resolveAction` to consume.
 */
export interface OrganismEvaluators {
  // Phase 1. `true` when any `die` rule fires — a boolean, not an Action, because "which die rule
  // won" changes nothing downstream.
  readonly resolvesToDeath: (cell: CellSubject) => boolean;
  // Phase 2. ⚠️ `null` means NO RULE MATCHED, never "die" (Trap 9). A living cell that matches
  // nothing is gone at CYCLE END by implicit death (M10) and still counts as a Phase-2 neighbour
  // until then — that is what preserves Conway's simultaneous-generation semantics. Conway's
  // Classic has no `die` rule at all, so collapsing `null` into `'die'` here breaks it while
  // looking equivalent.
  //
  // ❌ DO NOT narrow this to `Exclude<Action, 'die'> | null`. `'die'` is genuinely unreachable —
  // the compile-time partition routes every `die` rule to `resolvesToDeath` above — so the wide
  // type is deliberately WIDER than this function can produce, and that is Sidiar's call
  // (2026-09-10): RFC-004 §2.3 spells the return as `Action | null` and the RFC is followed as
  // written. The invariant is therefore carried by the partition and by this comment, NOT by the
  // type. Callers must neither treat `'die'` as a live case nor "tighten" the signature on the
  // assumption it was an oversight. Narrowing it would diverge from §2.3 and is a spec change,
  // not a cleanup.
  readonly resolveBirthSurvival: (cell: CellSubject) => Action | null;
}

/** Everything the session computed once, for a caller that will run cycles against it. */
export interface CompiledSession {
  /**
   * Ref-indexed, `length = roster length + 1`, slot `0` explicitly `null` (M14, FD2) — the same
   * shape `apps/web`'s `buildRefToFillGroup` uses for ref-keyed lookup. Slot 0 is the reserved
   * EMPTY cell value and belongs to no organism; it holds a deliberate `null` rather than a hole
   * so an accidental `evaluatorsByRef[0]` is a visible `null`, not `undefined` from a sparse
   * array. Read organism `n` as `evaluatorsByRef[ref]`, where `ref = rosterIndex + 1`.
   */
  readonly evaluatorsByRef: readonly (OrganismEvaluators | null)[];
  /** The interning map itself, so a caller can resolve a library id it holds to this battle's ref. */
  readonly refById: ReadonlyMap<string, OrganismRef>;
  /** One number per battle (AR-20, Decision B.5) — see maxRelevantAge.ts for the three traps. */
  readonly maxRelevantAge: number;
}

/**
 * The cache key (FD3): the ORDERED join of the rule list's `contentHash`es.
 *
 * §3.5 says "cached by the rules' `contentHash` SET". A set is the wrong structure twice over:
 * order IS priority (FR-2.6), so two organisms with the same rules in different orders are
 * different evaluators; and `SurvivalRulesSchema` is a bare `z.array(SurvivalRuleSchema)` with no
 * uniqueness refine, so two distinct rules in one array may legally share a hash
 * (`deferred-work.md`'s duplicate-`contentHash` entry, which names this story as its owner). An
 * ordered join is immune to both: a duplicate hash inside one organism is harmless because the key
 * still distinguishes the LISTS. Keying per RULE — the other option — is exactly where the
 * duplicate collides and returns the wrong compiled predicate.
 *
 * ⚠️ `JSON.stringify` of the array, not `hashes.join('|')`. A plain join is NOT injective over
 * arbitrary strings: `['a|b']` and `['a','b']` produce the same key, which is a hash collision
 * reintroduced by the cache key itself. `contentHash` is OPAQUE (AR-21) — no separator can be
 * ruled out — and JSON's escaping is what makes the encoding unambiguous without assuming
 * anything about the hash's alphabet. This function never parses, prefixes, compares the content
 * of, or generates a hash; the real generator is Epic 4's, and computing one here would fork rule
 * identity across every already-installed workspace.
 *
 * ⚠️ This DOES assume `contentHash` is a faithful content address (AR-21): two rules with the same
 * hash are the same rule. That is the field's contract, not an inference — but it means a
 * hand-written fixture that reuses one hash literal across genuinely different rules gets one
 * organism's evaluators for both, with no error. Real hashes come from Epic 4's generator; test
 * fixtures have to spell distinct hashes for distinct rules.
 */
function cacheKeyFor(rules: SurvivalRules): string {
  return JSON.stringify(rules.map((rule) => rule.contentHash));
}

/**
 * Rewrites one rule's `organismType` patterns from persisted LIBRARY IDS to numeric refs (AR-8,
 * Decision E.3) — one lookup per rule per SESSION, never per cell. After this the hot path
 * compares numbers only.
 *
 * ⚠️ NEW condition objects, a NEW conditions array and a NEW rule object (Trap 6). The input rules
 * are shared, sometimes frozen fixture data: `CONWAYS_CLASSIC` is `deepFreeze`d, so an in-place
 * rewrite throws in strict mode, and `createMockOrganisms()` hands out deep clones precisely
 * because a previous story shared them and one test's write changed the next call's data.
 *
 * ⚠️ And a NEW tuple for a `range` pattern — the spread is shallow, so without the copy the
 * compiled closure would share the `[min,max]` array with the caller's rule object, and a later
 * write to that draft (Story 4.15 edits in place) would change the evaluator's bounds under it.
 * The closure must own every value it compares against.
 */
function internRule(rule: SurvivalRule, refById: ReadonlyMap<string, OrganismRef>): SurvivalRule {
  const conditions: Condition<CellProperty>[] = rule.conditions.map((condition) => {
    if (condition.property !== 'organismType') {
      const { pattern } = condition;
      return { ...condition, pattern: Array.isArray(pattern) ? [...pattern] : pattern };
    }
    // A target absent from THIS battle compiles to the never-match sentinel, so "occupied by
    // organism X" is simply `false` in a battle that does not include X (Decision E.3) — not an
    // error, because sharing an organism across battles is the normal case.
    const pattern = refById.get(condition.pattern as string) ?? NO_MATCH_REF;
    return { ...condition, pattern };
  });
  return { ...rule, conditions };
}

function compileOrganism(
  organism: CompilableOrganism,
  refById: ReadonlyMap<string, OrganismRef>,
  cache: Map<string, OrganismEvaluators>,
): OrganismEvaluators {
  const key = cacheKeyFor(organism.survivalRules);
  const hit = cache.get(key);
  // Two organisms with byte-identical rule lists in the SAME session may share one compiled pair:
  // the closures below bake in `refById`, and within a session that map is the same one. Across
  // sessions they may NOT — see `compileSession`.
  if (hit !== undefined) return hit;

  // ⚠️ The `.filter` §3.5 promises "runs once at compile time, not per cell" is THIS loop, and it
  // partitions on `payload.action` — which is why it lives here and not in `src/engine/`.
  // rule.ts states the engine never inspects `payload`, "not to sort, not to filter, not to
  // optimize"; that is the single thing keeping the engine reusable (AR-16, Trap 7).
  const death: SurvivalRule[] = [];
  const birthSurvival: SurvivalRule[] = [];
  for (const rule of organism.survivalRules) {
    const interned = internRule(rule, refById);
    // Persisted order is preserved verbatim WITHIN each partition (FR-2.6): a partition is a
    // filter, never a sort.
    (rule.payload.action === 'die' ? death : birthSurvival).push(interned);
  }

  // FD7 (Dev Agent Record): compilation stops at "partition + intern + close over
  // firstSatisfiedBy" — the readable form. The deeper option is to compile each condition down to
  // a concrete `(cell) => boolean` here, which would remove the per-cell selector lookup, the
  // `Object.hasOwn` guard and the operator dictionary lookup entirely (the "zero-per-cell key
  // sweep" firstSatisfiedBy.ts describes) at the cost of a second evaluation path to keep correct.
  // Not built blind: this repo optimizes on measurement (M12's guards were justified at
  // +0.019/+0.091 ms against a 16.7 ms budget, and Story 3.3's FD4 wrote its packed-integer
  // alternative into a comment for the same reason). ⚠️ The FIRST measurements of this loop exist
  // in Story 3.7 — decide it there, with the harness.
  const evaluators: OrganismEvaluators = Object.freeze({
    resolvesToDeath: (cell: CellSubject) => firstSatisfiedBy(death, cell, cellSelectors) !== null,
    // `?? null`, never `|| null` (Story 3.1's trap): optional chaining off a null winner yields
    // `undefined`, and a leaked `undefined` passes `!winner` while failing `winner === null`.
    resolveBirthSurvival: (cell: CellSubject) =>
      firstSatisfiedBy(birthSurvival, cell, cellSelectors)?.payload.action ?? null,
  });

  cache.set(key, evaluators);
  return evaluators;
}

/**
 * Compiles a battle's whole roster: validate, intern, partition, close, once — before the first
 * cycle.
 *
 * FD4 (Dev Agent Record): EAGER over the whole roster, not lazy-on-first-use. Laziness would drag
 * a compile — and, after AC8, possibly a throw — back inside the RAF loop, which is the entire
 * guarantee moving these diagnostics off the hot path was for. A roster is <= 255 entries
 * (Decision G.3) and compiles once per run, so it buys nothing measurable.
 *
 * ⚠️ THE CACHE IS A LOCAL OF THIS FUNCTION, and that is a correctness property, not tidiness
 * (Decision E.4, Trap 10). The compiled closures bake in THIS battle's `id -> ref` map, so a
 * cross-battle cache hit would return an evaluator whose `organismType` refs point at the OTHER
 * battle's roster — a silent wrong answer, in a battle that runs perfectly. A module-level `Map`
 * looks like the obvious memoization and is exactly that bug; AR-16 independently forbids
 * module-level mutable state. Scoping the cache to the call makes cross-session reuse structurally
 * impossible rather than merely discouraged — the same shape Story 3.3's `GridBuffers` chose (its
 * FD3): the seam is a value, owned by the caller, with no ambient state behind it.
 *
 * @throws RuleCompilationError naming the organism (and rule, for a rule fault), before anything
 *   is compiled — for a bad, duplicate or over-cap roster as much as for a malformed rule.
 */
export function compileSession(organisms: readonly CompilableOrganism[]): CompiledSession {
  // Roster first: the ids are the interning key, and a rule diagnostic that names an organism is
  // only useful once the organism's own id has been proven a real one.
  const refById = internOrganismIds(organisms.map((organism) => organism.id));

  // Then the rules — over the WHOLE roster before any compile: a diagnostic that fires after half
  // the evaluators exist is not "before the first cycle" in any useful sense (AC7/AC8, M12).
  for (const organism of organisms) validateSurvivalRules(organism.id, organism.survivalRules);

  const cache = new Map<string, OrganismEvaluators>();

  // Slot 0 is the reserved EMPTY value (M14) — `null`, deliberately placed, never an organism.
  const evaluatorsByRef: (OrganismEvaluators | null)[] = [null];
  for (const organism of organisms) {
    evaluatorsByRef.push(compileOrganism(organism, refById, cache));
  }

  return {
    evaluatorsByRef,
    refById,
    maxRelevantAge: maxRelevantAge(organisms.map((organism) => organism.survivalRules)),
  };
}
