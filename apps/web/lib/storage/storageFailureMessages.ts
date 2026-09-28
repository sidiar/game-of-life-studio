/**
 * Story 5.11's storage-failure copy — plain strings, no story IDs, no storage keys, never an
 * `error.message` (FD6). None may contain "theme", "display", "simulation" or "auto-save":
 * `SettingsPage.test.tsx`'s dead-section regex forbids those words on `/settings`, where every one
 * of these can render. Each claim is load-bearing:
 *   - "nothing has been changed" is true because rendering the notice writes nothing (AC4);
 *   - the storage-full and unavailable lines never call the data damaged — it may be intact;
 *   - the newer-version line never offers a reset (Story 5.7 owner ruling).
 */

export const NEWER_VERSION_MESSAGE =
  "Your saved workspace was created by a newer version of Game of Life Studio, so this version can't open it. Your data is safe — reload the page to get the latest version.";

export const CORRUPT_WORKSPACE_MESSAGE =
  "Your saved battles and organisms could not be read — the stored data appears to be damaged. You can reset to the default workspace, which deletes all battles and organisms. If you'd rather try to recover the data yourself, leave it as it is: nothing has been changed.";

export const CORRUPT_SETTINGS_MESSAGE =
  'Your saved preferences could not be read — the stored settings appear to be damaged. You can restore the default settings. Your battles and organisms are not affected.';

export const STORAGE_FULL_MESSAGE =
  "Your browser's storage for this site is full, so your workspace could not be set up. Free up space for this site in your browser's settings, then reload.";

export const UNAVAILABLE_MESSAGE =
  "Your saved data could not be accessed. Your browser may be blocking storage for this site (for example, a privacy setting). Nothing was changed — check your browser's settings, then reload.";

/** `/battle`'s corrupt body: the route holds no reset (FD10), so it points at the Gallery. */
export const BATTLE_CORRUPT_MESSAGE =
  'This battle could not be loaded — its saved data is damaged. Go back to the Gallery; if it reports damaged data too, you can reset your workspace there.';

/** Restore Default Settings failed: nothing claims the settings were restored. */
export const RESTORE_SETTINGS_FAILURE_MESSAGE =
  'The default settings could not be restored. Reload the page and try again.';
