// Fails CI when a route's first-load JavaScript GROWS more than a fixed allowance past its committed
// baseline (AR-3, RFC-008). Runs after `build:standalone`, against the shipped static export
// (apps/web/out) — the exact bytes the $0 static host serves.
//
// METRIC: gzipped transfer size of the JS each page loads. Next 16's static export does not print
// a "First Load JS" table to gate against, and the raw (uncompressed) sum is far larger even for
// the placeholder — so raw is not the intended reading. The over-the-wire (gzipped) size is what a
// user pays and what a KB figure can sensibly bound; that is what this gate enforces.
//
// Story 2.4 (deferred-work.md:149): generalised from a single hardcoded `out/index.html` read to a
// ROUTE LIST. The export emits SIBLING `.html` files for a route, not directory indexes —
// `/battle/new` is `out/battle/new.html` (a nested file, because `battle.html` already claims the
// flat name), never `out/battle-new.html`.
//
// ── GROWTH, NOT A CEILING (Sidiar, accepted 2026-09-09; landed 2026-09-25) ─────────────────────
//
// The gate used to hold an absolute `budgetGzipKb` per route. It stood in for NFR-1.2 (initial
// load < 2 s on desktop broadband), and at a few hundred KB gzip it was never the binding
// constraint on that NFR — the ~300 KB figure (AR-3, RFC-003:48) was itself "a target to be
// validated by benchmarking after MUI integration". The home route was raised four times
// (300 -> 320 -> 330 -> 340, the last deliberately off-formula), and `/battle`'s 310 went stale by
// two stories without its derivation comment moving: the pattern of a control being worked around.
// Design, rationale and the two rejected alternatives (delete the gate; measure NFR-1.2 directly
// with Lighthouse in CI): deferred-work.md, "the bundle gate moves off absolute budgets".
//
// What replaced it keeps the one signal that ever mattered — THIS CHANGE ADDED WEIGHT AND NOBODY
// NOTICED:
//
//   - `scripts/bundle-baselines.json` holds each route's last measured gzip size, in BYTES. It is
//     WRITTEN BY THIS SCRIPT (`npm run bundle:baseline`), never typed by hand — a measurement
//     retyped into a comment is what went stale last time.
//   - A route fails when it measures more than GROWTH_ALLOWANCE_KB over its baseline. An
//     accidental +40 KB import fails regardless of where any ceiling happens to sit.
//   - Intended growth is accepted by refreshing the baseline in the same PR: a one-line JSON diff,
//     visible in review, with no formula to re-derive. A PR that deliberately grows a route past
//     the allowance must do this, and should do it whenever it grows a route at all — the
//     allowance is measured from the COMMITTED baseline, so growth left un-baselined accumulates
//     against it across changes and the next PR inherits the bill.
//   - A route with no baseline, or a baseline with no route, is a failure: a new route must be
//     measured before it is gated, and a removed one must not leave a number nobody checks.
//
// The retired absolute budgets, for the comments elsewhere that cite them (BattleTile.tsx,
// BattleEditorView.tsx): home 300 -> 320 (Story 1.13, Sidiar 2026-08-13, measured 306.3 KB) ->
// 330 (Story 1.10 review, Sidiar 2026-08-25, measured 317.5 KB over a 306.8 KB baseline) -> 340
// (Story 2.14, Sidiar 2026-08-31, measured 329.5 KB); `/battle` and `/battle/new` 310 (Story 2.4,
// measured 295.2 KB); `/organisms` 305 (Story 4.1, 290.5 KB); `/settings` 305 (Story 5.1,
// 291.5 KB). None of those numbers is enforced any more.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join } from 'node:path';

const OUT_DIR = join('apps', 'web', 'out');
const BASELINE_FILE = join('scripts', 'bundle-baselines.json');

// ~8 KB, the figure the accepted design names: large enough that ordinary story-sized growth and
// Turbopack chunk-splitting noise (Story 2.14 measured ~2.1 KB of the latter from merely adding
// modules to the graph) pass, small enough that a stray barrel import or a statically imported MUI
// Dialog stack (+18.1 KB, Story 1.13) does not.
const GROWTH_ALLOWANCE_KB = 8;

const UPDATE = process.argv.includes('--update');

// `key` is the route's identity in bundle-baselines.json; `name` is only for the printed report.
const ROUTES = [
  { key: '/', name: 'home (/)', html: 'index.html' },
  { key: '/battle', name: 'battle (/battle)', html: 'battle.html' },
  { key: '/battle/new', name: 'battle/new (/battle/new)', html: join('battle', 'new.html') },
  { key: '/organisms', name: 'organisms (/organisms)', html: 'organisms.html' },
  { key: '/settings', name: 'settings (/settings)', html: 'settings.html' },
];

const kb = (bytes) => (bytes / 1024).toFixed(1);

function measureRoute({ name, html }) {
  const htmlPath = join(OUT_DIR, html);
  if (!existsSync(htmlPath)) {
    console.error(
      `✖ bundle-size: ${htmlPath} not found. Run \`npm run build:standalone\` first ` +
        `(the gate measures the static export, not the dev build).`,
    );
    return null;
  }

  const document = readFileSync(htmlPath, 'utf8');
  // Every JS asset the document pulls (scripts + module/preloads) lives under /_next/static and
  // is part of first load.
  const assetPaths = new Set(document.match(/\/_next\/static\/[^"']+?\.js/g) ?? []);

  if (assetPaths.size === 0) {
    console.error(
      `✖ bundle-size: no JS assets found in ${htmlPath} for route "${name}". This almost ` +
        `certainly means the markup format changed and the gate is no longer scraping real ` +
        `asset paths — treat as a failure, not an empty (and vacuously passing) measurement.`,
    );
    return null;
  }

  let rawBytes = 0;
  let gzipBytes = 0;
  const missing = [];
  for (const assetPath of assetPaths) {
    const file = join(OUT_DIR, assetPath);
    if (!existsSync(file)) {
      missing.push(assetPath);
      continue;
    }
    const buf = readFileSync(file);
    rawBytes += buf.length;
    gzipBytes += gzipSync(buf).length;
  }

  if (missing.length > 0) {
    console.error(
      `✖ bundle-size: ${missing.length} referenced asset(s) missing from out/ for route "${name}":`,
    );
    for (const m of missing) console.error(`    ${m}`);
    return null;
  }

  return { assetCount: assetPaths.size, rawBytes, gzipBytes };
}

function readBaselines() {
  if (!existsSync(BASELINE_FILE)) {
    console.error(
      `✖ bundle-size: ${BASELINE_FILE} not found. Run \`npm run bundle:baseline\` after ` +
        `\`npm run build:standalone\` and commit the file.`,
    );
    return null;
  }
  return JSON.parse(readFileSync(BASELINE_FILE, 'utf8'));
}

let ok = true;
const measured = {};

for (const route of ROUTES) {
  const result = measureRoute(route);
  if (result === null) {
    ok = false;
    continue;
  }
  measured[route.key] = result;
}

if (UPDATE) {
  // Never write a partial file: a route that failed to measure would silently lose its baseline.
  if (!ok) process.exit(1);
  const baselines = Object.fromEntries(ROUTES.map((r) => [r.key, measured[r.key].gzipBytes]));
  writeFileSync(BASELINE_FILE, `${JSON.stringify(baselines, null, 2)}\n`);
  for (const route of ROUTES) {
    console.log(`${route.name}: ${kb(baselines[route.key])} KB gzip`);
  }
  console.log(`\n✓ wrote ${BASELINE_FILE} — commit it with the change that moved these numbers.`);
  process.exit(0);
}

const baselines = readBaselines();
if (baselines === null) process.exit(1);

for (const stale of Object.keys(baselines).filter((k) => !ROUTES.some((r) => r.key === k))) {
  console.error(
    `✖ bundle-size: ${BASELINE_FILE} has a baseline for "${stale}", which is not a gated route. ` +
      `Remove it (\`npm run bundle:baseline\` rewrites the file from ROUTES).`,
  );
  ok = false;
}

for (const route of ROUTES) {
  const result = measured[route.key];
  if (result === undefined) continue;

  const { assetCount, rawBytes, gzipBytes } = result;
  const baseline = baselines[route.key];
  console.log(`${route.name} first-load JS  (${assetCount} assets)`);
  console.log(`  raw (uncompressed): ${kb(rawBytes)} KB`);
  console.log(`  gzipped (transfer): ${kb(gzipBytes)} KB`);

  if (typeof baseline !== 'number') {
    console.error(
      `✖ bundle-size: "${route.name}" has no baseline in ${BASELINE_FILE}. A new route is ` +
        `measured before it is gated: run \`npm run bundle:baseline\` and commit the file.`,
    );
    ok = false;
    console.log('');
    continue;
  }

  const growthKB = (gzipBytes - baseline) / 1024;
  const sign = growthKB >= 0 ? '+' : '';
  console.log(`  baseline (gzipped): ${kb(baseline)} KB  (${sign}${growthKB.toFixed(1)} KB)`);

  if (growthKB > GROWTH_ALLOWANCE_KB) {
    console.error(
      `✖ bundle-size: "${route.name}" grew ${growthKB.toFixed(1)} KB past its baseline, over the ` +
        `${GROWTH_ALLOWANCE_KB} KB allowance. Run \`npm run analyze -w web\` to see what arrived; ` +
        `if the growth is intended, \`npm run bundle:baseline\` and commit the new baseline so ` +
        `review sees the number move.`,
    );
    ok = false;
  } else {
    console.log(`✓ within the ${GROWTH_ALLOWANCE_KB} KB growth allowance.`);
  }
  console.log('');
}

if (!ok) process.exit(1);
