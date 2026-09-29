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

// Story 7.6 (FR-9.4): the preset link's copy. Title, confirm label, export-failed text, success
// line and pipeline failures are 7.5's, reused unchanged.

/** The mockup's arrival modal (`preset-workspace-library.html:453-466`) as one plain string. */
export const PRESET_LINK_WARNING_BODY =
  'This link opens a preset workspace. Loading it replaces your entire workspace — all current ' +
  'battles and organisms will be lost. You can export your current workspace first to keep a ' +
  'backup. Cancelling takes you to your own workspace, untouched.';

const PRESET_ID_DISPLAY_MAX = 40;

/** A layout guard only: React escapes the text, so this is not a security measure. */
function displayPresetId(raw: string): string {
  return raw.length > PRESET_ID_DISPLAY_MAX ? `${raw.slice(0, PRESET_ID_DISPLAY_MAX)}…` : raw;
}

/**
 * Same source as `PRESET_ID_PATTERN` (a test pins the parity). Duplicated on purpose: importing
 * `presetManifest` here would pull its zod schema into `/`'s first load (FD3).
 */
export const WELL_FORMED_PRESET_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** D2: an id that is not a slug is never echoed, so a crafted link cannot put text in app chrome. */
export const PRESET_LINK_INVALID_MESSAGE =
  "This preset link isn't valid. It doesn't point to any preset in this version of the studio.";

/** `workspaceUntouched` is false when a first visitor got the default preset instead (FD5). */
export function presetLinkUnknownMessage(id: string, workspaceUntouched: boolean): string {
  const untouched = workspaceUntouched ? ' Your workspace is untouched.' : '';
  if (!WELL_FORMED_PRESET_ID.test(id)) return PRESET_LINK_INVALID_MESSAGE + untouched;
  return (
    `This preset link doesn't exist (anymore). The link pointed to a preset called ` +
    `“${displayPresetId(id)}”, which isn't in this version of the studio.` +
    untouched
  );
}

export const PRESET_LINK_FETCH_FAILURE_MESSAGE =
  'The preset this link points to could not be downloaded. Reload the page to try again. Your workspace was not changed.';
