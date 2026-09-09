// The thin resolver RFC-004 §2.3 sanctions as the one place this layer reads `payload` (AC5,
// Trap 2). Built ON TOP OF firstSatisfiedBy — the engine itself still never reads payload.
//
// FD2 (Dev Agent Record): §2.3 also places `resolvesToDeath` / `resolveBirthSurvival` in this
// layer's section, but this story's AC names only `resolveCellAction`, and §3.5 says their
// action-partitioning `.filter` "runs once at compile time, not per cell" — that is Story 3.4's
// evaluator cache, and Story 3.5 owns the phase split those two helpers serve. Building them here
// would mean writing a per-cell filter that 3.4 immediately deletes, so they are left to
// 3.4/3.5 and not built in this file.
import { firstSatisfiedBy } from '../engine/firstSatisfiedBy';
import { cellSelectors } from './cellSubject';
import type { CellSubject } from './cellSubject';
import type { Action, SurvivalRules } from './survivalRules';

// Returns the winning rule's action, or `null` when no rule matches.
//
// ⚠️ `null` means "no rule matched" — NOT "die" (Trap 7). A living cell that matches nothing is
// gone at cycle end by IMPLICIT death (M10), resolved at cycle-end so it still counts as a Phase-2
// neighbour; collapsing `null` into `'die'` here would look equivalent and silently break Conway
// semantics. That resolution is Story 3.5/3.6's, not this function's.
//
// ❌ No filtering, sorting, or action-partitioning here — see FD2 above. ❌ No "self organism"
// parameter — relativity already arrives via `cell.state` (Decision C); a parameter here would
// mean the subject was materialized wrong upstream.
export function resolveCellAction(rules: SurvivalRules, cell: CellSubject): Action | null {
  // `?? null`, never `|| null` (same trap as Story 3.1's firstSatisfiedBy): optional chaining off
  // a `null` winner yields `undefined`, and `|| null` would also coerce a real but falsy action —
  // there is none today, but the seam should not depend on that staying true. `?? null` is the one
  // form that is correct either way.
  return firstSatisfiedBy(rules, cell, cellSelectors)?.payload.action ?? null;
}
