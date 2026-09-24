import { organismClosure, toEnvelope, type WorkspaceExportWire } from '@gol/domain';
import type { AppRepositories } from './repositories';
import { ExportError } from './errors';

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
   * `Blob`, `URL.createObjectURL`, the filename — lives in `apps/web/lib/export/`
   * (`downloadJsonFile.ts`, `workspaceExportFilename.ts`, `exportWorkspaceToFile.ts`, Story 5.5);
   * no DOM type may appear in this package's export path.
   */
  exportWorkspace(): Promise<WorkspaceExportWire>;

  /**
   * A single-battle export, `kind: 'battle'`, carrying the battle plus its rule-aware organism
   * closure (Story 5.4, Decision E.5(b) / RFC-006 Decision 4).
   *
   * Takes the battle's `id`, reads `repos.battles.load(id)`, and rejects with
   * `ExportError('not-found')` when no battle exists under it — RFC-006 Decision 4's shape
   * (`:200-202`), restored by owner ruling after FD1's `exportBattle(battle)` variance was
   * reviewed (Story 5.4 review, 2026-09-24; `deferred-work.md`'s variance (7) is withdrawn, not
   * deleted). **What this hands to Story 5.6:** the export entry point (the editor's Tools
   * section, FR-6.1) must force a save — or block export — on a dirty/unsaved battle before
   * calling this with its id, because there is no other way to export a battle that was never
   * persisted; that obligation does not live here.
   *
   * No prune/remap happens in this function. `BattleSchema.superRefine`'s Decision H.1 check
   * (`organismIds` ≡ the placed set) runs on every `load()`, real or fake — a record that failed
   * it never returns from `load()` successfully; `load()` throws `CorruptDataError` on it instead
   * (`localStorageBattleRepository.ts`, `fakeRepositories.ts`). So any `battle` this function
   * receives already satisfies H.1, and `battle.organismIds` is already exactly the closure's seed
   * — pruning it again here would be a second enforcement of an invariant `load()` already
   * guarantees, over data that has nowhere left to be unpruned.
   *
   * The organisms are still read through the repository (`organisms.list()`), so "export reads
   * through the repository interfaces" now holds for both halves, matching the RFC. A seed or rule
   * target absent from the library (reachable only through a corrupt, skipped organism record —
   * the same fault-isolation `organisms.list()` already applies) is silently omitted from the
   * closure rather than raised here, exactly as `exportWorkspace`'s `listFull()` note above; the
   * resulting file is rejected cleanly at import by Story 5.8's `assertReferentialClosure`, and
   * telling the user about the corruption itself is Story 5.11's.
   */
  exportBattle(id: string): Promise<WorkspaceExportWire>;
}

/**
 * A FACTORY over the injected ports, matching `createLocalStorageRepositories` — not the `class
 * WorkspaceSerializer` of RFC-006 Decision 4's snippet. The repositories themselves are classes,
 * but this repo's AGGREGATE-level assembly is a factory over an interface, and the serializer is
 * aggregate-level for the same reason `clearAll()` sits on `AppRepositories`: it spans two
 * collections. `WorkspaceSerializer` survives as the interface name, so the RFC's vocabulary is
 * intact. Recorded as a variance in `deferred-work.md` rather than silently absorbed.
 *
 * `exportBattle` reads `repos.battles.load(id)` plus `repos.organisms.list()` — the RFC-006
 * Decision 4 shape (see the interface JSDoc above for the owner ruling that restored it over
 * FD1's `exportBattle(battle)` variance). `parse` / `migrate` / `importWorkspace` are still
 * absent, and are Stories 5.7 and 5.8.
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

    async exportBattle(id: string): Promise<WorkspaceExportWire> {
      const battle = await repos.battles.load(id);
      if (!battle) throw new ExportError('not-found', id);
      // No prune/remap: `load()` only returns a battle that already passed BattleSchema's H.1
      // check, so `battle.organismIds` is already exactly the placed set (see the interface JSDoc).
      const library = await repos.organisms.list();
      const closure = organismClosure(battle.organismIds, library);
      return toEnvelope('battle', [battle], closure, { appVersion, exportedAt: now() });
    },
  };
}
