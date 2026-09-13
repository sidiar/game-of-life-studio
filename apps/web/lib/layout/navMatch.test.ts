import { describe, expect, it } from 'vitest';
import { isNavItemActive } from './navMatch';

// Table-driven per the story's own spec (Story 4.1, Task 1) — each row is one nav-highlighting
// decision the deferred-work.md:85 fix has to get right on its own, not just for the two
// currently-shipped hrefs.
describe('isNavItemActive', () => {
  it.each([
    // [pathname, href, match, expected]
    ['/', '/', 'exact', true],
    ['/organisms', '/', 'exact', false],
    ['/organisms', '/organisms', 'prefix', true],
    ['/organisms/', '/organisms', 'prefix', true],
    ['/organismsX', '/organisms', 'prefix', false],
    ['/battle', '/', 'exact', false],
    ['/battle', '/organisms', 'prefix', false],
    ['/', '/organisms', 'prefix', false],
  ] as const)('(%s, %s, %s) -> %s', (pathname, href, match, expected) => {
    expect(isNavItemActive(pathname, href, match)).toBe(expected);
  });
});
