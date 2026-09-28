/**
 * Story 5.10's Clear All copy — plain strings, no story IDs (mirrors `importMessages.ts`'s shape).
 * Neither outcome message may contain "theme", "display" or "simulation":
 * `SettingsPage.test.tsx`'s dead-section regex still forbids those words (Epic 6 has not landed).
 */

/** FR-8.5's warning sentence, verbatim — the dialog body (AC2). */
export const CLEAR_ALL_WARNING_TEXT =
  'This will delete all battles and organisms. This cannot be undone.';

/** AC5's success line — the card's `role="status"` confirmation. */
export const CLEAR_ALL_SUCCESS_MESSAGE =
  'All data cleared. Your workspace is back to its default state.';

/**
 * AC5's failure line — FD3: never claims the workspace is unchanged, since a failure can land
 * mid-reset (the store cleared but Conway's Classic not yet re-seeded). Retrying completes it
 * (`resetWorkspace` is idempotent), so the copy asks for exactly that.
 */
export const CLEAR_ALL_FAILURE_MESSAGE =
  'Clear All Data did not finish. Some data may already have been deleted — try again.';
