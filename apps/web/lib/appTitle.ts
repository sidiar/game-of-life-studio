// The app half of every browser-tab title, matching `app/layout.tsx`'s static `metadata.title` —
// which is what the tab reads before any page claims it, and what a page's own title replaces.
const APP_NAME = 'Game of Life Studio';

// U+00B7 MIDDLE DOT with hair spacing either side, the separator Story 2.11 shipped.
const SEPARATOR = ' · ';

/**
 * Builds a page's browser-tab title. Deliberately separate from `useDocumentTitle`: that hook's job
 * is making a title STICK against Next's metadata race, which has nothing to do with how the string
 * is composed. Keeping the two apart means a second consumer (an organism editor, say) shares this
 * convention without the syncing hook taking a position on it.
 *
 * ⚠️ Pass a name that is already display-resolved — `battleDisplayName(...)` for a battle. This
 * helper does not fall back for an empty name, because the fallback differs per entity and only the
 * caller knows which one applies.
 */
export function appTitle(pageName: string): string {
  return `${pageName}${SEPARATOR}${APP_NAME}`;
}
