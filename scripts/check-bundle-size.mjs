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

const BUDGET_GZIP_KB = 300; // RFC-003 / AR-3 — first-load JS ceiling for the home route.

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
