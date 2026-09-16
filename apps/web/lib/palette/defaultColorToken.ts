import { PALETTE } from './paletteRegistry';

/**
 * FR-2.3 / M6 / RFC-007 Decision 3: the token a NEW organism defaults to. The first registry entry
 * no organism uses, in registry order ("safe core first" — tokens 1-8 are the CVD-robust core, so
 * small libraries stay in it without effort); once every entry is in use, the entry with the
 * fewest users, ties to the earlier registry position (PRD FR-2.3: "least-used … ties broken by
 * palette order"). `usedColorTokens` is one entry per organism (duplicates count — that is what
 * "least-used" measures); tokens not in the registry are ignored, since they occupy no palette
 * entry. Never throws, never returns a token outside PALETTE, and never reads DEFAULT_COLOR_TOKEN
 * — the empty-library answer is PALETTE[0] because it is first, not because it is the default.
 * (FR-2.3) (M6) (RFC-007) (Story 4.8) (Story 1.7)
 */
export function defaultColorToken(usedColorTokens: readonly string[]): string {
  const counts = new Map<string, number>();
  for (const token of usedColorTokens) {
    counts.set(token, (counts.get(token) ?? 0) + 1);
  }

  // First pass: the earliest registry entry with zero users.
  for (const entry of PALETTE) {
    if (!counts.has(entry.id)) return entry.id;
  }

  // Second pass: every entry is in use — the least-used, ties to the earlier registry position.
  // A strict `<` is what makes the first (earliest) minimum win a tie without a comparator.
  let leastUsed = PALETTE[0];
  let leastCount = counts.get(leastUsed.id) ?? 0;
  for (const entry of PALETTE) {
    const count = counts.get(entry.id) ?? 0;
    if (count < leastCount) {
      leastUsed = entry;
      leastCount = count;
    }
  }
  return leastUsed.id;
}
