// Per-entry nav active-matching (Story 4.1; resolves deferred-work.md:85). A single global
// strategy cannot express both hrefs correctly at once: '/' has to be exact because it is a
// PREFIX of every route ('/organisms' would light up Battles too under a naive startsWith), while
// '/organisms' should stay active on a trailing-slash host ('/organisms/') and any future
// '/organisms?id=' (a query string never reaches usePathname(), so that case is free already).
export type NavMatch = 'exact' | 'prefix';

/**
 * `pathname` is the router's current path (`usePathname()`); `href` is one NAV_ITEMS entry's
 * target. `match: 'exact'` requires identity. `match: 'prefix'` requires either identity or that
 * `pathname` continues past `href` at a path-segment boundary — the `+ '/'` is load-bearing:
 * without it `/organismsX` would satisfy `pathname.startsWith(href)` and light up Organisms for a
 * route that merely shares a string prefix, not a path segment.
 */
export function isNavItemActive(pathname: string, href: string, match: NavMatch): boolean {
  if (pathname === href) return true;
  if (match === 'exact') return false;
  return pathname.startsWith(`${href}/`);
}
