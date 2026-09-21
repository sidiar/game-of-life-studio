import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

// `dirname(fileURLToPath(...))`, not `new URL('.', import.meta.url)`: under Vitest's Vite-based
// module loader, import.meta.url is not always a file:// URL by the time `new URL('.', …)`
// resolves it, and fileURLToPath then throws "The URL must be of scheme file". Resolving the
// filename first and taking its directory sidesteps that entirely.
const APP_DIR = dirname(fileURLToPath(import.meta.url));

/**
 * Story 5.1 (deferred-work.md:176): AC5/AC8's route-count rule had no automated guard — a stray
 * `app/**\/page.tsx` passes typecheck, lint, tests and `build:standalone`, and the only evidence
 * before this test was a route table pasted into a Dev Agent Record, which nobody re-checks.
 * `readdirSync(..., { recursive: true })` (Node 24) walks the whole `app/` tree; entries are
 * normalised from the platform path separator to `/` before comparing, since Node returns
 * `path.sep`-joined segments and this repo's CI runs on Linux while local dev may not.
 */
describe('app/ route set (Story 5.1 AC8)', () => {
  it('pins the exact set of page.tsx files — five after this story', () => {
    const entries = readdirSync(APP_DIR, { recursive: true }) as string[];
    const pages = entries
      .filter((entry) => entry.endsWith('page.tsx'))
      .map((entry) => entry.split(sep).join('/'))
      .sort();

    expect(pages).toEqual([
      '(battle)/battle/new/page.tsx',
      '(battle)/battle/page.tsx',
      '(gallery)/organisms/page.tsx',
      '(gallery)/page.tsx',
      '(gallery)/settings/page.tsx',
    ]);
  });

  // Decision K.5: a dynamic segment does not merely misbehave under `output: 'export'` — it FAILS
  // THE BUILD (no generateStaticParams(), or one returning [] fails the identical check). This is
  // the slowest possible place to learn that; a unit test catches it long before a CI build does.
  it('has no dynamic segment in any route path', () => {
    const entries = readdirSync(APP_DIR, { recursive: true }) as string[];
    const dynamicSegments = entries
      .map((entry) => entry.split(sep).join('/'))
      .filter((entry) => entry.includes('['));

    expect(dynamicSegments).toEqual([]);
  });
});
