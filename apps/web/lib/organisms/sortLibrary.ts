import { CONWAYS_CLASSIC_ID, type Organism } from '@gol/domain';
import { normalizeOrganismSearch } from './organismNameMatches';

/**
 * The Library grid order (AC3, FD2): Conway's Classic pinned first, then the rest by name.
 *
 * Copies before sorting — `Array#sort` mutates its receiver, and `organisms` here is the
 * repository's own array (`lib/gallery/gallerySort.ts:9` records the identical trap for battles).
 *
 * `Object.values` insertion order (what `LocalStorageOrganismRepository.list()` returns today) is
 * deterministic for one localStorage instance but is not a repository CONTRACT — it reverses
 * between a fresh seed and a reload, and an API-backed repository (AR-2/AR-27) promises nothing
 * about it at all. Hence the deterministic case-folded-name / raw-name / id tie-break chain below,
 * never insertion order.
 *
 * The pin is by id (`CONWAYS_CLASSIC_ID`), never by name: a user can clone Conway's Classic and
 * rename the clone identically (`Organism.name` has no uniqueness constraint —
 * `deferred-work.md:363`), and a name-based pin would then promote the wrong record.
 *
 * Names compare case-folded via `normalizeOrganismSearch` (NFC + `toLocaleLowerCase`) with
 * `<`/`>`, never `localeCompare` — a no-locale `localeCompare` varies by ICU build, so a tie-break
 * assertion could pass locally and fail on the CI runner (`gallerySort.ts:10-11`'s reason,
 * restated here for the same class of comparison).
 */
export function sortLibrary(organisms: readonly Organism[]): Organism[] {
  return [...organisms].sort((a, b) => {
    const aIsConway = a.id === CONWAYS_CLASSIC_ID;
    const bIsConway = b.id === CONWAYS_CLASSIC_ID;
    if (aIsConway !== bIsConway) return aIsConway ? -1 : 1;

    const aFolded = normalizeOrganismSearch(a.name);
    const bFolded = normalizeOrganismSearch(b.name);
    if (aFolded !== bFolded) return aFolded < bFolded ? -1 : 1;

    if (a.name !== b.name) return a.name < b.name ? -1 : 1;
    if (a.id !== b.id) return a.id < b.id ? -1 : 1;
    return 0;
  });
}
