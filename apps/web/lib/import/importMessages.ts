import type { ExportKind } from '@gol/domain';
import type { ImportSummary } from '@gol/persistence';

/**
 * The FD4 row this file's sibling, `importFailureMessage.ts`, cannot cover: `File.text()` rejects
 * BEFORE `validateImportFile` ever runs, so it is never an `ImportError` or a
 * `NewerFormatVersionError` — there is nothing to branch on. `<ImportWorkspaceRow>` catches that
 * rejection on its own and shows this fixed string, which is why the claim reads "could not be
 * READ" rather than "could not be imported" (`importFailureMessage`'s fallback) — a real,
 * distinguishable difference for a user deciding whether to try a different file.
 */
export const FILE_READ_FAILURE_MESSAGE =
  'Your file could not be read. Your workspace was not changed.';

/**
 * FR-8.4's warning sentence (AC3), quoted verbatim but for the kind-specific noun: "this battle"
 * for a `kind: 'battle'` file (a single-battle export still replaces the WHOLE workspace, M8), and
 * "this workspace" for `kind: 'workspace'`. `kind` only ever reaches this one word — nothing else
 * in the flow branches on it (FD7).
 */
export function importWarningText(kind: ExportKind): string {
  const subject = kind === 'workspace' ? 'this workspace' : 'this battle';
  return (
    `Importing ${subject} will replace your entire current workspace — all current battles and ` +
    'organisms will be lost. Export your current workspace first?'
  );
}

function pluralize(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

/** AC6's success line, built from the pipeline's own `ImportSummary` — never a re-derived count. */
export function importSuccessMessage(summary: ImportSummary): string {
  return (
    `Import complete — your workspace now has ${pluralize(summary.battleCount, 'battle')} and ` +
    `${pluralize(summary.organismCount, 'organism')}.`
  );
}
