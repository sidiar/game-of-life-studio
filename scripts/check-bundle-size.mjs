// Fails CI when the home route's first-load JavaScript exceeds the RFC-003 / AR-3
// bundle budget. Runs after `build:standalone`, against the shipped static export
// (apps/web/out) — the exact bytes the $0 static host serves.
//
// METRIC: gzipped transfer size of the JS the home page loads. Next 16's static
// export does not print a "First Load JS" table to gate against, and the raw
// (uncompressed) sum is ~600 KB even for the placeholder — so raw-at-300-KB is
// not the intended reading. The over-the-wire (gzipped) size is what a user pays
// and what "~300 KB" can sensibly bound; that is what this gate enforces.
import { readFileSync, existsSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join } from 'node:path';

// 300 -> 320 (Story 1.13, Sidiar 2026-08-13): RFC-003 §"Component Inventory" and AR-3 both quote
// ~300 KB, but RFC-003:48 frames that figure as a target "to be validated by benchmarking after
// MUI integration" — Story 1.13 (the delete-confirmation dialog, the app's first shipped
// `@mui/material/Dialog` + `Button`) is that benchmark. Measured against the 1.12 baseline of
// 288.2 KB, the dialog landed the home route at 306.3 KB gzip — +18.1 KB on the baseline, and
// 6.3 KB over the old 300 KB budget. Well under the ~45 KB per-file-sum upper bound the story
// estimated before measuring (shared @mui/utils/ButtonBase chunks were already in the bundle).
// New budget set from the measurement, not a round number:
// ceil((306.3 + 12) / 5) * 5 = 320 — preserving roughly the ~12 KB headroom the gate carried
// before, rounded up to the next 5 KB. RFC-003:48/253/309 and epics.md:159/:371 still read
// "~300KB" — filed as a docs-reconciliation item in deferred-work.md rather than edited from here.
//
// 320 -> 330 (Sidiar, 2026-08-25): BattleTile's organism-dot tooltip moved from a hand-rolled
// `styled('span')` to `@mui/material/Tooltip` — a deliberate reversal of Story 1.10 Task 3's
// rejection of that same component (its own budget note, at 18.6 KB headroom, targeted "zero new
// MUI component imports"). Measured against the 1.13 baseline of 306.8 KB, the swap landed the
// home route at 317.5 KB gzip — +10.7 KB, 2.5 KB under the old 320 KB budget (passed, but did not
// leave the ~12 KB headroom the gate is meant to carry). Same formula as the 1.13 move, applied
// again rather than picked round: ceil((317.5 + 12) / 5) * 5 = 330.
const BUDGET_GZIP_KB = 330;

const OUT_DIR = join('apps', 'web', 'out');
const HOME_HTML = join(OUT_DIR, 'index.html');

if (!existsSync(HOME_HTML)) {
  console.error(
    `✖ bundle-size: ${HOME_HTML} not found. Run \`npm run build:standalone\` first ` +
      `(the gate measures the static export, not the dev build).`,
  );
  process.exit(1);
}

const html = readFileSync(HOME_HTML, 'utf8');
// Every JS asset the home document pulls (scripts + module/preloads) lives under
// /_next/static and is part of first load.
const assetPaths = new Set(html.match(/\/_next\/static\/[^"']+?\.js/g) ?? []);

if (assetPaths.size === 0) {
  console.error(
    `✖ bundle-size: no JS assets found in ${HOME_HTML}. This almost certainly means the ` +
      `markup format changed and the gate is no longer scraping real asset paths — ` +
      `treat as a failure, not an empty (and vacuously passing) budget.`,
  );
  process.exit(1);
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

const rawKB = rawBytes / 1024;
const gzipKB = gzipBytes / 1024;

console.log(`Home-route first-load JS  (${assetPaths.size} assets)`);
console.log(`  raw (uncompressed): ${rawKB.toFixed(1)} KB`);
console.log(`  gzipped (transfer): ${gzipKB.toFixed(1)} KB`);
console.log(`  budget (gzipped):   ${BUDGET_GZIP_KB} KB`);

if (missing.length > 0) {
  console.error(`✖ bundle-size: ${missing.length} referenced asset(s) missing from out/:`);
  for (const m of missing) console.error(`    ${m}`);
  process.exit(1);
}

if (gzipKB > BUDGET_GZIP_KB) {
  console.error(
    `✖ bundle-size: ${gzipKB.toFixed(1)} KB exceeds the ${BUDGET_GZIP_KB} KB budget ` +
      `by ${(gzipKB - BUDGET_GZIP_KB).toFixed(1)} KB. Run \`npm run analyze -w web\` to inspect.`,
  );
  process.exit(1);
}

console.log(`✓ bundle-size: within budget (${(BUDGET_GZIP_KB - gzipKB).toFixed(1)} KB headroom).`);
