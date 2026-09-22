import { toEnvelope, type WorkspaceExportWire } from '@gol/domain';
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
}

/**
 * A FACTORY over the injected ports, matching `createLocalStorageRepositories` — not the `class
 * WorkspaceSerializer` of RFC-006 Decision 4's snippet. The repositories themselves are classes,
 * but this repo's AGGREGATE-level assembly is a factory over an interface, and the serializer is
 * aggregate-level for the same reason `clearAll()` sits on `AppRepositories`: it spans two
 * collections. `WorkspaceSerializer` survives as the interface name, so the RFC's vocabulary is
 * intact. Recorded as a variance in `deferred-work.md` rather than silently absorbed.
 *
 * `exportBattle(id)` is deliberately absent: a single-battle file needs the rule-aware organism
 * closure, which is Story 5.4's. `parse` / `migrate` / `importWorkspace` are Stories 5.7 and 5.8.
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
  };
}
