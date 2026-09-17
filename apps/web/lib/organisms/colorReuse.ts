import type { Organism } from '@gol/domain';
import { toDisplayOrganism } from '@/lib/displayOrganisms';

/**
 * FR-2.3 / M6 / RFC-007 Decision 3: "usage is derived from loaded organisms (no separate
 * store)". Token -> display names of every organism holding it, in INPUT order (the
 * caller passes the list the cards render, so the warning names organisms in the order
 * the user sees them). Names go through `toDisplayOrganism` so an empty stored name
 * reads "Unnamed organism" (the schema has no lower bound on `name`). Unknown tokens are
 * kept — they are harmless to a PALETTE lookup and dropping them would hide a corrupt
 * record from the count. The caller excludes the organism under edit (Story 4.17); this
 * function does not know which one that is.
 *
 * Why `lib/organisms/` (it walks organisms, not the registry — the mirror of
 * `defaultColorToken.ts`'s reasoning for `lib/palette/`); why not `@gol/domain` (needs
 * `toDisplayOrganism`, an `apps/web` display rule — not referential-integrity logic, so
 * project-context's "core" rule does not reach it). (Story 4.9) (Story 4.8) (Story 2.9)
 */
export function usersByColorToken(
  organisms: readonly Organism[],
): ReadonlyMap<string, readonly string[]> {
  const byToken = new Map<string, string[]>();
  for (const organism of organisms) {
    const { colorToken, name } = toDisplayOrganism(organism);
    const names = byToken.get(colorToken);
    if (names === undefined) {
      byToken.set(colorToken, [name]);
    } else {
      names.push(name);
    }
  }
  return byToken;
}

/**
 * The AC1 sentence, or null when nobody uses the token. Names are user text and are
 * interpolated raw — no truncation (a 50-char name wraps in the caller's box).
 */
export function colorReuseWarning(names: readonly string[]): string | null {
  if (names.length === 0) return null;
  if (names.length === 1) return `${names[0]} already uses this color.`;
  if (names.length === 2) return `${names[0]} and ${names[1]} already use this color.`;
  return `${names[0]}, ${names[1]} and ${names.length - 2} more already use this color.`;
}
