import type { ImportSummary } from '@gol/persistence';

// Preset-specific copy (Story 7.5 FD3). Import-pipeline failures reuse `importFailureMessage`
// unchanged; only what is specific to a bundled preset lives here.

/** The FR-8.4 dialog title: names the preset the user chose (mockup `preset-workspace-library.html:440`). */
export function presetWarningTitle(name: string): string {
  return `Load “${name}”?`;
}

/** FR-8.4's claim in the mockup's words: replaces the entire workspace, loses data, offers export first. */
export const PRESET_WARNING_BODY =
  'This replaces your entire workspace — all current battles and organisms will be lost. ' +
  'Export your current workspace first?';

export const PRESET_CONFIRM_LABEL = 'Load Preset';

export const PRESET_EXPORT_FAILED_TEXT =
  'Your current workspace could not be exported. Nothing was loaded.';

function pluralize(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

/** Built from the pipeline's own `ImportSummary`, never a re-count. */
export function presetLoadSuccessMessage(name: string, summary: ImportSummary): string {
  return (
    `Loaded “${name}” — your workspace now has ${pluralize(summary.battleCount, 'battle')} ` +
    `and ${pluralize(summary.organismCount, 'organism')}.`
  );
}

/** Honest: nothing is written before the fetch settles. */
export const PRESET_FETCH_FAILURE_MESSAGE =
  'The preset could not be downloaded. Check your connection and try again. Your workspace was not changed.';

export const PRESET_LIST_FAILURE_MESSAGE =
  'The preset list could not be loaded. Reload the page to try again.';
