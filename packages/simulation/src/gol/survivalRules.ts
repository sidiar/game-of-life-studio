// The GoL payload types that bind the generic engine to the Game of Life (RFC-004 §2.2).
//
// FD1 (Dev Agent Record): declared HERE, per RFC-004 §2.2 — not imported from @gol/domain, even
// though Story 1.3 already infers an equivalent shape there from Zod. @gol/domain exports no name
// for its payload type at all (Story 3.1's FD6: SurvivalPayloadSchema is module-local), so
// importing would mean either reaching for `SurvivalRule['payload']` or adding a new export to
// @gol/domain purely to satisfy this layer, and RFC-004 §2.2's `SurvivalRule = Rule<SurvivalPayload>`
// framing would disappear either way. Declaring here keeps @gol/simulation self-describing; the
// duplication this creates is made NON-SILENT by the bidirectional assignability pin in
// domainRuleSetCompatibility.test.ts — drift becomes a build failure there, not a wrong answer at
// runtime.
import type { CellProperty } from './cellSubject';
import type { Rule, RuleSet } from '../engine/rule';

export type Action = 'born' | 'survive' | 'die';

// An OBJECT, not a bare action string (RFC-004 §2.2) — forward-compatible with fields a future
// story might add (`weight`, `cooldown`, …) without changing resolveCellAction's signature.
export interface SurvivalPayload {
  readonly summary: string;
  readonly action: Action;
}

// The generic Rule / RuleSet fixed at the GoL payload and property set. `@gol/domain`'s persisted
// SurvivalRule / SurvivalRules are assignable to and from these with no mapping layer (AC4,
// RFC-004 §2.4) — pinned by `tsc` in domainRuleSetCompatibility.test.ts.
export type SurvivalRule = Rule<SurvivalPayload, CellProperty>;
export type SurvivalRules = RuleSet<SurvivalPayload, CellProperty>;
