// The GoL cell subject and its five FR-2.5 properties (RFC-004 §2.1). This is where the generic
// engine gets fixed to S = CellSubject: everything below is a CALLER of ../engine/, never an edit
// to it.
import type { Selectors } from '../engine/rule';

// Three-valued and RELATIVE TO THE EVALUATING ORGANISM (Decision C.1, AR-20) — the single most
// misread type in the engine:
//   - `alive`    = this cell holds the CALLER's own organism.
//   - `occupied` = this cell holds ANOTHER organism.
//   - `empty`    = nobody is here.
// It is not a global fact about the cell. The same physical cell is `alive` when organism A
// evaluates it and `occupied` when organism B does — materializing that switch belongs to
// Stories 3.5/3.6's per-organism evaluation pass, not this layer. `ne` is retired (Decision C.3):
// "occupied by anyone else" is already `cellState eq occupied`, so a not-equals adds nothing.
export type CellState = 'empty' | 'alive' | 'occupied';

// The battle's dense organisms-array index (Decision E). RUNTIME-ONLY: rules persist the target
// organism's stable LIBRARY ID (a string — see @gol/domain's OrganismTypeCondition), never this
// numeric ref, because a persisted ref would target a different organism in every battle it is
// loaded into (Decision E, project-context "Never persist a numeric OrganismRef"). The
// string -> ref translation happens once per rule per session, inside Story 3.4's compiled
// evaluators (Decision E.3) — not here (Trap 1).
export type OrganismRef = number;

// The five properties a rule can read off a cell (FR-2.5), materialized per-organism per-cycle by
// Story 3.3's grid. This layer never builds one itself — tests hand-build CellSubject literals
// (RFC-004 §3.5's separation of concerns: the rules layer is tested with no grid at all).
export interface CellSubject {
  readonly state: CellState;
  // null on an empty cell — there is no occupant to name. Otherwise the occupant's ref, whichever
  // organism (self or other) `state` says is present.
  readonly organismType: OrganismRef | null;
  // Cycles alive (FR-5.6). NOT clamped here — MAX_RELEVANT_AGE is computed once per battle at
  // evaluator-compile time (Decision B.5, Story 3.4). Saturating in this layer would be wrong.
  readonly age: number;
  // ⚠️ SAME-organism Moore neighbours — not "all eight occupied neighbours" (RFC-004 §2.1). The
  // bare name reads like the latter, and Story 3.3 is what materializes it, so the definition is
  // recorded here rather than left to be re-derived: Conway's Classic is single-organism, so the
  // two readings COINCIDE for every fixture in this package's tests and diverge only in Story
  // 3.6's multi-organism goldens — as wrong survival behaviour, with no failing test naming why.
  readonly neighborCount: number;
  // ⚠️ OTHER-organism Moore neighbours (RFC-004 §2.1) — the complement of `neighborCount`, and the
  // property Decision C.4's "occupied by anyone" limitation is expressed through. Same caveat as
  // above: single-organism fixtures cannot tell a wrong materialization from a right one.
  readonly occupantNeighborCount: number;
}

// The PERSISTED property names a rule addresses these by. Must match @gol/domain's
// ConditionSchema discriminants EXACTLY — a mismatch here silently stops every saved rule that
// names the mismatched property from ever resolving.
//
// ⚠️ Deliberate asymmetry (Trap 3, RFC-004 §2.1): the CellSubject FIELD is `state`; the property
// NAME is `cellState`. `cellState` is what @gol/domain persists, so it is the one that must not
// move; renaming the subject field to match would only churn. Leave both exactly as they are.
export type CellProperty =
  'cellState' | 'organismType' | 'age' | 'neighborCount' | 'occupantNeighborCount';

// One selector per CellProperty (AC2). `Selectors<S, Props>` takes NO default for `Props` (Story
// 3.1 / M11) — supplying CellProperty here is what turns an omitted row into a BUILD failure
// ("Property '…' is missing"), not a per-cell runtime throw. Verified by mutation during
// development: deleting a row here does not compile (see Dev Agent Record).
//
// A module constant nothing mutates (project-context: no module-level mutable state, AR-16).
//
// FROZEN, because `Readonly<Record<…>>` is a compile-time claim that is ERASED at runtime: this
// object is exported from @gol/simulation's barrel, so any consumer could assign over a row and
// silently corrupt every other reader for the process lifetime — one bad `age` selector would
// mis-evaluate every rule in every battle. Freezing matches how @gol/domain already protects its
// shared constants (`Object.freeze(DEFAULT_SETTINGS)`, `deepFreeze(CONWAYS_CLASSIC)`). Shallow is
// enough: the values are pure functions, and it costs nothing at lookup time in the NFR-1.1 loop.
export const cellSelectors: Selectors<CellSubject, CellProperty> = Object.freeze({
  cellState: (cell: CellSubject) => cell.state,
  organismType: (cell: CellSubject) => cell.organismType,
  age: (cell: CellSubject) => cell.age,
  neighborCount: (cell: CellSubject) => cell.neighborCount,
  occupantNeighborCount: (cell: CellSubject) => cell.occupantNeighborCount,
});
