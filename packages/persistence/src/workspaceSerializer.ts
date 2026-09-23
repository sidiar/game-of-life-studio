import {
  organismClosure,
  pruneAndRemapBattleGrid,
  toEnvelope,
  type Battle,
  type WorkspaceExportWire,
} from '@gol/domain';
import type { AppRepositories } from './repositories';

/**
 * The repository-driven half of the RFC-006 export path (AR-10 / RFC-006 Decision 4).
 *
 * The ENVELOPE and the dense<->sparse conversion live in `@gol/domain` (`workspaceExportSchema.ts`
 * / `workspaceExportProjection.ts`), not here: they are the entities this app owns in another
 * shape, they belong under the NFR-5.1 >=90% per-file gate, and `@gol/persistence` sits at the ~80%
 * tier precisely because its correctness is carried by round-trip tests — putting the round trip
 * itself in that tier would measure the conversion by a gate that exists on the assumption
 * something else measures it. What is left here is the one thing only this package may do: read
 * `AppRepositories`.
 */

export interface WorkspaceSerializerDeps {
  repos: AppRepositories;
  /** Provenance only, never branched on (Decision I.4) — see Story 5.3 FD5 for why it is injected. */
  appVersion: string;
  /**
   * The clock, injected. There is no module-level `new Date()` anywhere in this package's export
   * path: a hidden clock would force every caller's test to assert `exportedAt` with a regex
   * instead of an exact value.
   */
  now: () => Date;
}

export interface WorkspaceSerializer {
  /**
   * The whole workspace on the wire — battles + organisms, never settings (AR-12 / Decision F.1).
   *
   * Returns the WIRE shape (ISO timestamps), ready for `JSON.stringify`. The download itself —
   * `Blob`, `URL.createObjectURL`, the filename — is Story 5.5's and belongs in `apps/web`; no DOM
   * type may appear in this package's export path.
   */
  exportWorkspace(): Promise<WorkspaceExportWire>;

  /**
   * A single-battle export, `kind: 'battle'`, carrying the battle plus its rule-aware organism
   * closure (Story 5.4, Decision E.5(b) / RFC-006 Decision 4).
   *
   * ⚠️ Takes the `Battle` VALUE, not an id (a declared RFC-006 Decision 4 variance — FD1). The
   * battle is pruned and remapped HERE (`pruneAndRemapBattleGrid`, Decision H.1) before anything
   * reads it, so the closure's seeds are exactly the placed set — never a roster entry with no cell
   * on the grid — whatever the caller passed. For an already-pruned battle (every saved one) that
   * is a no-op; for a raw editor roster it keeps unplaced organisms, and everything their rules
   * target, out of the file (FR-7.13 "organisms placed on its grid"). An id-based export (`repos.battles.load(id)`) would return the SAVED
   * copy, which is wrong for FR-6.1 / A-2 / AR-31's "export the editor's current battle": the grid
   * may be dirty, or the battle may never have been saved at all, and an id has nothing to load in
   * that case. The grid this function reads is Edit-mode initial state only — a persisted `Battle`
   * has no live Run-mode field by construction, so there is nothing else it could be.
   *
   * The organisms are still read through the repository (`organisms.list()`), so "export reads
   * through the repository interfaces" holds for the part that is library-wide. A seed or rule
   * target absent from the library (reachable only through a corrupt, skipped organism record —
   * the same fault-isolation `organisms.list()` already applies) is silently omitted from the
   * closure rather than raised here, exactly as `exportWorkspace`'s `listFull()` note above; the
   * resulting file is rejected cleanly at import by Story 5.8's `assertReferentialClosure`, and
   * telling the user about the corruption itself is Story 5.11's.
   */
  exportBattle(battle: Battle): Promise<WorkspaceExportWire>;
}

/**
 * A FACTORY over the injected ports, matching `createLocalStorageRepositories` — not the `class
 * WorkspaceSerializer` of RFC-006 Decision 4's snippet. The repositories themselves are classes,
 * but this repo's AGGREGATE-level assembly is a factory over an interface, and the serializer is
 * aggregate-level for the same reason `clearAll()` sits on `AppRepositories`: it spans two
 * collections. `WorkspaceSerializer` survives as the interface name, so the RFC's vocabulary is
 * intact. Recorded as a variance in `deferred-work.md` rather than silently absorbed.
 *
 * `exportBattle` reads only `repos.organisms.list()` — no `battles.load`, no `battles.listFull` —
 * because the battle itself comes from the caller (see the interface JSDoc above). `parse` /
 * `migrate` / `importWorkspace` are still absent, and are Stories 5.7 and 5.8.
 */
export function createWorkspaceSerializer(deps: WorkspaceSerializerDeps): WorkspaceSerializer {
  const { repos, appVersion, now } = deps;

  return {
    async exportWorkspace(): Promise<WorkspaceExportWire> {
      // `listFull()`, not `list()`: the Gallery summary (Decision H.4) deliberately omits
      // `gridState`, and an envelope built from summaries would export every battle as empty.
      //
      // ⚠️ `listFull()` SKIPS a corrupt record rather than throwing (see
      // `localStorageBattleRepository.ts`) — the fault-isolation stance that keeps one bad battle
      // from blanking the whole Gallery. Exporting a partly-corrupt store therefore silently omits
      // the unreadable battles (and `organisms.list()` does the same for organisms, so a skipped
      // organism leaves the exported battles that place it with ids the file no longer carries).
      // Only a per-RECORD failure is skipped: a whole collection that is not an object keyed by id
      // throws `CorruptDataError` from `readCollection`, and this call rejects with it. That is the
      // repository's existing contract, not this function's to change; telling the user belongs to
      // Story 5.11 (load-time corruption handling), and the gap is recorded in `deferred-work.md`
      // against it.
      const [battles, organisms] = await Promise.all([
        repos.battles.listFull(),
        repos.organisms.list(),
      ]);

      return toEnvelope('workspace', battles, organisms, { appVersion, exportedAt: now() });
    },

    async exportBattle(battle: Battle): Promise<WorkspaceExportWire> {
      // Seeds from the PLACED set, not the roster as given: the caller's value comes from editor
      // state, not a parsed read, so `organismIds` ≡ placed is not guaranteed on the way in.
      const pruned: Battle = {
        ...battle,
        ...pruneAndRemapBattleGrid(battle.gridState, battle.organismIds),
      };
      const library = await repos.organisms.list();
      const closure = organismClosure(pruned.organismIds, library);
      return toEnvelope('battle', [pruned], closure, { appVersion, exportedAt: now() });
    },
  };
}
