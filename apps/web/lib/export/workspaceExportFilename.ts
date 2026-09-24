/**
 * The default export filename (AC3 / FR-8.3): `game-of-life-workspace-YYYY-MM-DD.json`.
 *
 * The date is the export's LOCAL calendar date — "today's backup" means the user's today, not
 * UTC's. `date` must be built from the SAME clock reading that stamps the envelope's
 * `exportedAt` (`new Date(envelope.exportedAt)`, FD4): there is exactly one `now()` call per
 * export, never two, so the filename and the metadata can never disagree across a midnight
 * boundary. Because `exportedAt` stays UTC while this reads local components, the two CAN differ
 * by a calendar day near midnight in a non-UTC zone — that is deliberate, not a bug to fix here.
 */
export function workspaceExportFilename(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `game-of-life-workspace-${year}-${month}-${day}.json`;
}
