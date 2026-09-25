import { battleDisplayName } from '@/lib/battleDisplayName';

/**
 * The maximum number of Unicode code points kept in the slug (FD7; Story 5.6 review decision
 * 2026-09-25): 60 code points, 4 bytes worst case each, plus `.json` (5 bytes), stays at 245
 * bytes — under the 255-byte filename limit most filesystems enforce, for any script. Counted in
 * code points via `Array.from` (never UTF-16 code units, via `.slice`/`.length`), so an astral
 * character (a surrogate pair) at the cut is kept whole, never split into a lone surrogate.
 */
const MAX_SLUG_CODE_POINTS = 60;

/**
 * The pipeline FD7 specifies, applied once directly to the name and once to the fallback below.
 *
 * Combining marks are stripped only when they follow a LATIN base letter (Story 5.6 review
 * decision 2026-09-25, superseding an earlier "strip every `\p{M}`"): stripping every combining
 * mark regardless of script silently garbles scripts that use marks as letters in their own
 * right — Devanagari vowel signs/virama, Japanese dakuten/handakuten, and Hangul (whose precomposed
 * syllables decompose into loose jamo under NFKD and must be recomposed). So:
 * - marks are removed only where the preceding base character is Latin script (an accented Latin
 *   name, e.g. `café`);
 * - the result is renormalised to NFC, which recomposes Hangul jamo (and anything else NFKD
 *   decomposed but the mark-strip left untouched) back into their precomposed form;
 * - the "not a letter or number" collapse that turns punctuation/whitespace runs into `-` also
 *   exempts `\p{M}`, so a surviving non-Latin mark (a Devanagari matra, a Japanese dakuten) stays
 *   attached to its base letter instead of being read as punctuation and turned into a hyphen.
 */
function kebabCase(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/(\p{Script=Latin})\p{M}+/gu, '$1')
    .normalize('NFC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\p{M}]+/gu, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Cap a slug at MAX_SLUG_CODE_POINTS code points, then trim a trailing `-` the cut may have left
 * (the kebab-case pipeline never leaves a trailing `-` on its own, only a truncation can).
 */
function truncateSlug(slug: string): string {
  const codePoints = Array.from(slug);
  if (codePoints.length <= MAX_SLUG_CODE_POINTS) {
    return slug;
  }
  return codePoints.slice(0, MAX_SLUG_CODE_POINTS).join('').replace(/-+$/, '');
}

/**
 * The default Battle Only export filename (FR-6.4, Story 5.6 FD7): the battle name in kebab-case,
 * e.g. `triple-threat.json`.
 *
 * The name comes from the EXPORTED ENVELOPE's battle (`envelope.battles[0].name`, see
 * `exportBattleToFile`), never from live editor state — Story 5.5 FD4's "one source per file"
 * rule, and also the persisted name (AC6).
 *
 * If nothing is left after the pipeline (an untitled battle `''`, whitespace only, or all
 * punctuation and emoji), the name falls back to the kebab-case of `battleDisplayName('')` —
 * `untitled-battle` — rather than a second literal, so the fallback can never drift from the
 * header's "Untitled Battle". The same rule applies if the slug is empty only after the 60-code-
 * point cap trims a trailing `-` down to nothing (unreachable in practice, since a non-empty slug
 * never starts with `-`, but the fallback still covers it).
 */
export function battleExportFilename(name: string): string {
  const slug = truncateSlug(kebabCase(name));
  const base = slug === '' ? kebabCase(battleDisplayName('')) : slug;
  return `${base}.json`;
}
