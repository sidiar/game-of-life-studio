// Fails CI when a route's first-load JavaScript exceeds its RFC-003 / AR-3 bundle budget. Runs
// after `build:standalone`, against the shipped static export (apps/web/out) — the exact bytes
// the $0 static host serves.
//
// METRIC: gzipped transfer size of the JS each page loads. Next 16's static export does not print
// a "First Load JS" table to gate against, and the raw (uncompressed) sum is far larger even for
// the placeholder — so raw is not the intended reading. The over-the-wire (gzipped) size is what a
// user pays and what a KB figure can sensibly bound; that is what this gate enforces.
//
// Story 2.4 (deferred-work.md:149): generalised from a single hardcoded `out/index.html` read to a
// ROUTE LIST, each with its own budget — `/battle` and `/battle/new` ship their own first-load
// payload (the editor canvas, this story) and were entirely unmeasured before. The export emits
// SIBLING `.html` files for a route, not directory indexes — `/battle/new` is `out/battle/new.html`
// (a nested file, because `battle.html` already claims the flat name), never `out/battle-new.html`.
import { readFileSync, existsSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join } from 'node:path';

const OUT_DIR = join('apps', 'web', 'out');

// Each entry's budget is set from a MEASUREMENT, never a round number — see the comment on the
// entry itself for the formula and the measured value it came from. `check-bundle-size.mjs` is the
// single authority for every figure here; do not restate one anywhere else
// (`BattleTile.tsx` already says so for the home figure).
const ROUTES = [
  {
    // 300 -> 320 (Story 1.13, Sidiar 2026-08-13): RFC-003 §"Component Inventory" and AR-3 both
    // quote ~300 KB, but RFC-003:48 frames that figure as a target "to be validated by
    // benchmarking after MUI integration" — Story 1.13 (the delete-confirmation dialog) was that
    // benchmark. Measured against the 1.12 baseline of 288.2 KB, the dialog landed the home route
    // at 306.3 KB gzip. New budget: ceil((306.3 + 12) / 5) * 5 = 320. RFC-003:48/253/309 and
    // epics.md:159/:371 still read "~300KB" — a docs-reconciliation item in deferred-work.md,
    // never edited from here.
    //
    // 320 -> 330 (Story 1.10 review, Sidiar 2026-08-25): BattleTile's organism-dot tooltip moved
    // to `@mui/material/Tooltip`. Measured against the 1.13 baseline of 306.8 KB, the swap landed
    // the home route at 317.5 KB gzip — it passed the 320 budget but did not leave the ~12 KB
    // headroom the gate is meant to carry, which is what triggered the move. Same formula:
    // ceil((317.5 + 12) / 5) * 5 = 330.
    name: 'home (/)',
    html: 'index.html',
    budgetGzipKb: 330,
  },
  {
    // New in Story 2.4 (deferred-work.md:149) — the first story to add real weight to the battle
    // route (the retained-renderer edit canvas, `<BattleEditorView>`). Measured at 295.2 KB gzip
    // (`/battle`, the marginally heavier of the two battle-route pages — see `battle/new` below).
    // Same formula as the home budget's two moves: ceil((295.2 + 12) / 5) * 5 = 310.
    name: 'battle (/battle)',
    html: 'battle.html',
    budgetGzipKb: 310,
  },
  {
    // Shares its budget with `/battle` rather than getting a separately-derived number: both pages
    // mount the same `<BattlePage>` bundle and differ only in which branch runs at runtime, so
    // their first-load JS is the same code — measured at 295.1 KB gzip here, 0.1 KB under
    // `/battle`'s 295.2 (JSON payload differences), well inside one budget's headroom.
    name: 'battle/new (/battle/new)',
    html: join('battle', 'new.html'),
    budgetGzipKb: 310,
  },
];

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
        `asset paths — treat as a failure, not an empty (and vacuously passing) budget.`,
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

  return { assetCount: assetPaths.size, rawKB: rawBytes / 1024, gzipKB: gzipBytes / 1024 };
}

let ok = true;

for (const route of ROUTES) {
  const result = measureRoute(route);
  if (result === null) {
    ok = false;
    continue;
  }

  const { assetCount, rawKB, gzipKB } = result;
  console.log(`${route.name} first-load JS  (${assetCount} assets)`);
  console.log(`  raw (uncompressed): ${rawKB.toFixed(1)} KB`);
  console.log(`  gzipped (transfer): ${gzipKB.toFixed(1)} KB`);
  console.log(`  budget (gzipped):   ${route.budgetGzipKb} KB`);

  if (gzipKB > route.budgetGzipKb) {
    console.error(
      `✖ bundle-size: "${route.name}" is ${gzipKB.toFixed(1)} KB, exceeding its ` +
        `${route.budgetGzipKb} KB budget by ${(gzipKB - route.budgetGzipKb).toFixed(1)} KB. Run ` +
        `\`npm run analyze -w web\` to inspect.`,
    );
    ok = false;
  } else {
    console.log(`✓ within budget (${(route.budgetGzipKb - gzipKB).toFixed(1)} KB headroom).`);
  }
  console.log('');
}

if (!ok) process.exit(1);
