/**
 * The only code in this repo that touches `Blob`, `URL.createObjectURL` or an `<a download>`
 * (FD3, Story 5.5). It lives in `apps/web` because `packages/*` carries no DOM lib (project
 * rule) — a Blob/URL/anchor type simply does not exist in a `packages/*` tsconfig.
 *
 * The steps, and why each one is shaped the way it is:
 * 1. `JSON.stringify(value, null, 2)` — pretty-printed, because this is a user-facing
 *    backup/share file a human may open and read, and its size rides on no budget.
 * 2. `URL.createObjectURL(blob)`.
 * 3. An `<a>` is APPENDED to `document.body` before `click()` — the conservative cross-browser
 *    form, since older Firefox ignored a click on a detached anchor — then removed.
 * 4. `URL.revokeObjectURL` runs on the NEXT task (`setTimeout(…, 0)`), not synchronously:
 *    revoking in the same task as the click can make WebKit cancel the download outright, and the
 *    four Playwright projects include WebKit — not hypothetical.
 *
 * No `showSaveFilePicker` (Chromium-only) and no new dependency (`file-saver` etc.) — this is the
 * whole mechanism.
 */
export function downloadJsonFile(filename: string, value: unknown): void {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);

  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 0);
}
