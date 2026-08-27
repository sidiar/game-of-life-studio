import type { Organism } from '@gol/domain';
import { displayColor, MAX_AGE_SHADE } from '@/lib/palette/displayColor';
import { DEFAULT_COLOR_TOKEN } from '@/lib/palette/paletteRegistry';

/**
 * Story 2.9 forced decision 3: this module was `tileOrganisms.ts` / `TileOrganism` /
 * `resolveTileOrganisms` while the Gallery tile was its only caller. `<OrganismRoster>` is the
 * second, and it is not a tile — so the module was RENAMED rather than forked. Two resolvers is
 * the outcome the story forbids: the roster chip and the tile dot would then own separate
 * unknown-id, empty-name and duplicate-id fallbacks, and the first divergence between them would
 * be a chip that disagrees with the dish it is meant to describe.
 *
 * Spec §3.3/§3.4 type this `OrganismSummary[]`. There is no such type in `@gol/domain` — see the
 * Story 2.9 Dev Agent Record: `DisplayOrganism` IS that shape, and it stays in `apps/web` because
 * it is a presentation concern (a resolved hex, a fallback NAME) that has no business in the
 * domain package.
 */
export interface DisplayOrganism {
  id: string;
  name: string;
  /** The resolved identity-shade hex — what a chip or dot actually paints. */
  color: string;
  /**
   * Story 2.9 (AC4, trap 4): the colour's IDENTITY, carried alongside the resolved hex so the
   * FR-3.3 same-colour warning compares tokens rather than hexes. Comparing the resolved `color`
   * happens to work today only because every palette hex is distinct — it silently couples an
   * FR-3.3 rule to the `displayColor` LUT, so a future shade collision would stop the warning
   * firing with nothing to show for it.
   */
  colorToken: string;
  /**
   * Sidiar's call on the Story 2.9 review (decision 2, option b): this id had NO organism behind
   * it, so `name`, `color` and `colorToken` below are all the fallback's, not a record's.
   *
   * It exists because `DEFAULT_COLOR_TOKEN` is ALSO Conway's Classic's own token
   * (`paletteRegistry.ts` says so in its own comment) — so the fallback cannot be compared for the
   * FR-3.3 same-colour warning without accusing a legitimately sky-blue organism of sharing with a
   * record that does not exist. `findDuplicateColorIds` (`BattleEditorView.tsx`) excludes these
   * entries outright; see there for why that is preferred over a sentinel token.
   *
   * Absent (rather than `false`) on a resolved entry: the flag marks an exceptional record, and
   * every consumer that does not care about danglers should be able to ignore it entirely.
   */
  unresolved?: boolean;
}

// FR-1.4's delete guard makes a dangling id unreachable in normal use — an imported or
// hand-edited workspace is the case, and Story 5.11 owns the user-facing corruption story. No
// console warning here: the e2e asserts a clean console and paletteIndexOf already warns-once on
// an unknown TOKEN (Decision I.4), which this fallback deliberately avoids triggering by using a
// known token rather than an unknown one.
const FALLBACK_NAME = 'Unknown organism';

// OrganismSchema.name is `z.string().max(50)` with no lower bound, so "" parses and list() returns
// it. An empty string reaching aria-label leaves the dot with NO accessible name (axe
// `button-name`/`aria-prohibited-attr` territory, WCAG 4.1.2), which would fail the gallery e2e's
// zero-violations assertion for the entire page over one bad record. The schema floor is the real
// fix and is deferred to Stories 5.7/5.8 — this is the presentation-layer guard.
const UNNAMED_ORGANISM = 'Unnamed organism';

/**
 * Resolves a battle's organismIds (Decision H.1: exactly the placed set) against the current
 * roster for display. Colour is `displayColor(colorToken, MAX_AGE_SHADE)` — the identity shade
 * (Story 1.7: `displayColor(token, 7) === PALETTE[token].hex`), NOT `ageShadeFor(0, agingEnabled)`
 * (that is the age-0 shade for an AGING organism, which would render Patient Defender's identity
 * dot washed out) and NOT `resolvePaletteColor(token).hex` directly (same colour today, but this
 * is the LUT Story 1.11's cells go through — sharing it is what keeps a dot from ever disagreeing
 * with its own thumbnail).
 *
 * ⚠️ ORDER IS PRESERVED but LENGTH IS NOT (the de-dupe below). Story 2.9 trap 2: the result is
 * safe to RENDER in roster order, and is NOT safe to index for an `OrganismRef` — `refForTool`
 * keeps indexing the identity array (`rosterIds`), whose `indexOf` also resolves to the first
 * occurrence, so the two agree on which entry an id means even when they disagree on length.
 */
export function resolveDisplayOrganisms(
  organismIds: readonly string[],
  roster: readonly Organism[],
): DisplayOrganism[] {
  const byId = new Map(roster.map((o) => [o.id, o] as const));

  // De-duplicated because the caller keys React elements on the id. BattleSchema rejects duplicate
  // organismIds via a superRefine, but BattleSummarySchema — which is what list() parses — is a
  // bare z.object without it, so an imported or hand-edited record reaches here with repeats. Two
  // children with the same key is a React console error, and the gallery e2e asserts a clean
  // console. First occurrence wins; order is otherwise preserved.
  const seen = new Set<string>();

  return organismIds
    .filter((id) => {
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    })
    .map((id) => {
      const organism = byId.get(id);
      if (organism === undefined) {
        // The token reported here is the token this entry is actually PAINTED in — that much is
        // unchanged, and it is why `colorToken` is still populated rather than left blank.
        //
        // ⚠️ It is NOT comparable for the AC4 same-colour warning, which is what `unresolved`
        // above is for. This originally read "two unknown ids really do render in one colour, and
        // saying so is the warning doing its job" — true, but it missed the commoner pair:
        // `DEFAULT_COLOR_TOKEN` is 'sky-blue', which is Conway's Classic's REAL token, so one
        // dangling id in a battle alongside Conway's Classic accused an entirely healthy organism
        // of sharing a colour with a record that does not exist. Sidiar chose exclusion over a
        // sentinel token (Story 2.9 review, decision 2) — see `findDuplicateColorIds`.
        return {
          id,
          name: FALLBACK_NAME,
          color: displayColor(DEFAULT_COLOR_TOKEN, MAX_AGE_SHADE),
          colorToken: DEFAULT_COLOR_TOKEN,
          unresolved: true,
        };
      }
      return {
        id,
        name: organism.name.trim() === '' ? UNNAMED_ORGANISM : organism.name,
        color: displayColor(organism.colorToken, MAX_AGE_SHADE),
        colorToken: organism.colorToken,
      };
    });
}
