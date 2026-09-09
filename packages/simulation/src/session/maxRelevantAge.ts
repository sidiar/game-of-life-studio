// MAX_RELEVANT_AGE (AR-20, Decision B.5, RFC-004 §3.3) — computed once per BATTLE at compile
// time. Story 3.6's cycle-end step applies it; this file only computes it.
import type { CellProperty } from '../gol/cellSubject';
import type { SurvivalRules } from '../gol/survivalRules';

// The eight age shades the renderer batches on (Decision B.2: `(colorToken, min(age, 7))`). The
// floor exists so a battle whose rules never mention `age` still saturates high enough to keep
// every shade reachable — clamping to 0 would collapse the fade to one colour.
const AGE_SHADE_FLOOR = 7;

const AGE: CellProperty = 'age';

/**
 * `max(7, maxAgeLiteral + 1)` over the `age` literals of EVERY organism in the battle.
 *
 * ⚠️ Three ways to get this wrong, all of which read as correct (Trap 4):
 *   - dropping the `+ 1` makes an `age gt <maxLiteral>` rule permanently UNSATISFIABLE once cells
 *     saturate, because the clamp pins them AT the literal and `gt` is strict;
 *   - dropping the `max(7, …)` floor breaks the eight age shades;
 *   - computing it PER ORGANISM lets an organism with no age rule saturate below another's
 *     literal in the same battle, so the same physical cell answers `age` differently depending
 *     on who is asking. It is one number per battle.
 *
 * ⚠️ `age` literals ONLY. `neighborCount` / `occupantNeighborCount` literals are Moore-neighbour
 * counts bounded at 8 and contribute nothing (Trap 11); a `range` pattern contributes its UPPER
 * bound, because that is the largest age the rule can still distinguish.
 *
 * Patterns are trusted to be numeric here — `validateSurvivalRules` runs first and rejects any
 * `age` condition whose pattern is not a number or a numeric [min,max] tuple.
 */
export function maxRelevantAge(rulesPerOrganism: readonly SurvivalRules[]): number {
  let maxLiteral = 0;

  for (const rules of rulesPerOrganism) {
    for (const rule of rules) {
      for (const condition of rule.conditions) {
        if (condition.property !== AGE) continue;
        const { pattern } = condition;
        const literal = Array.isArray(pattern) ? (pattern[1] as number) : (pattern as number);
        if (literal > maxLiteral) maxLiteral = literal;
      }
    }
  }

  return Math.max(AGE_SHADE_FLOOR, maxLiteral + 1);
}
