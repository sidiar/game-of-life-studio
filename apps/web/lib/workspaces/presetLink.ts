// The preset link (Story 7.6, FR-9.4): `/?preset=<id>` on the existing Gallery route.
//
// WHY a query param (FD1): Decision K.5 makes query params the house idiom for ids on a statically
// exported app, and Decision K.3 rejected a hash for the battle route because it never reaches the
// Next router. The id needs no encoding — `PRESET_ID_PATTERN` slugs are URL-safe.

export const PRESET_LINK_PARAM = 'preset';

/**
 * Removes `?preset=` from the address bar without navigating (FD6), so a reload never re-prompts.
 *
 * WHY the native `replaceState` and not `router.replace`: a router navigation is a new
 * history-driven render of the page, and the notice the page is about to show must survive it. Next
 * 16 patches `window.history.replaceState` to sync `useSearchParams()` while reusing its current
 * router tree, so the page stays mounted. The state argument is `null` on purpose: Next copies its
 * own router tree into the entry itself. Every other param and the hash survive.
 */
export function stripPresetLinkParam(): void {
  const url = new URL(window.location.href);
  url.searchParams.delete(PRESET_LINK_PARAM);
  window.history.replaceState(null, '', url.pathname + url.search + url.hash);
}
