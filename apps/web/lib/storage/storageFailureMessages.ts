import { STORAGE_KEYS } from '@gol/persistence';

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

// The corrupt-workspace line is namespace-aware (Story 5.11 review, owner ruling D2 (b)): its
// first sentence names only what actually failed, so `/organisms` with a damaged battle store never
// claims the organisms are unreadable too. The second half is shared and names what the reset
// deletes — ALL battles and organisms, whichever one failed — so the offer is never understated.
const CORRUPT_WORKSPACE_OFFER =
  " You can reset to the default workspace, which deletes all battles and organisms. If you'd rather try to recover the data yourself, leave it as it is: nothing has been changed.";

/** Both collections failed, or the failed key is not one of the three (defensive). */
export const CORRUPT_WORKSPACE_MESSAGE =
  'Your saved battles and organisms could not be read — the stored data appears to be damaged.' +
  CORRUPT_WORKSPACE_OFFER;

export const CORRUPT_BATTLES_MESSAGE =
  'Your saved battles could not be read — the stored data appears to be damaged.' +
  CORRUPT_WORKSPACE_OFFER;

export const CORRUPT_ORGANISMS_MESSAGE =
  'Your saved organisms could not be read — the stored data appears to be damaged.' +
  CORRUPT_WORKSPACE_OFFER;

/** The format stamp failed: every collection read throws through it, so it names the workspace. */
export const CORRUPT_FORMAT_MESSAGE =
  'Your saved workspace could not be read — its format information appears to be damaged.' +
  CORRUPT_WORKSPACE_OFFER;

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

/**
 * The corrupt-workspace line for the keys that failed (`StorageFailure.corruptKeys`). A damaged
 * stamp outranks the collections: it is what every collection read failed through. Keys only ever
 * pick a sentence — they are never rendered.
 */
export function corruptWorkspaceMessage(keys: readonly string[]): string {
  if (keys.includes(STORAGE_KEYS.schema)) return CORRUPT_FORMAT_MESSAGE;
  const battles = keys.includes(STORAGE_KEYS.battles);
  const organisms = keys.includes(STORAGE_KEYS.organisms);
  if (battles && !organisms) return CORRUPT_BATTLES_MESSAGE;
  if (organisms && !battles) return CORRUPT_ORGANISMS_MESSAGE;
  return CORRUPT_WORKSPACE_MESSAGE;
}
