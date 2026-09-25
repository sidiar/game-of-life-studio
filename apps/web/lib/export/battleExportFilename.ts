import { battleDisplayName } from '@/lib/battleDisplayName';

/**
 * The pipeline FD7 specifies, applied once directly to the name and once to the fallback below.
 * Unicode letters and numbers are KEPT — an ASCII-only strip would erase a non-Latin battle name
 * entirely, and FR-6.4's intent is "based on the battle name".
 */
function kebabCase(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '');
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
 * header's "Untitled Battle".
 */
export function battleExportFilename(name: string): string {
  const slug = kebabCase(name);
  const base = slug === '' ? kebabCase(battleDisplayName('')) : slug;
  return `${base}.json`;
}
