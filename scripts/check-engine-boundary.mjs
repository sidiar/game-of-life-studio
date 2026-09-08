#!/usr/bin/env node
// AR-16 / AR-40: packages/simulation/src/engine/ is a domain-blind leaf layer, and Story 3.1's AC4
// claims that is enforced MECHANICALLY rather than asserted in prose. The enforcement is an ESLint
// block in eslint.config.mjs — but a boundary rule that matches nothing passes CI forever, and a
// rule that matches one escape shape says nothing about the others. Story 3.1's review found two
// live escapes past a rule that had already been "proved to fire": a `./../` specifier (the regex
// was prefix-anchored) and `import()` (no-restricted-imports has no ImportExpression listener).
//
// So the guard itself needs a test. This script lints one fixture per escape shape in memory and
// asserts each is REJECTED, plus a legitimate intra-engine import asserted ACCEPTED so the rule
// cannot be "fixed" into banning everything. Add a case here whenever you find a new way out.
//
// Runs as its own `ci` stage, in the same idiom as check-spec-ids.mjs / check-bundle-size.mjs.

import { ESLint } from 'eslint';

// A path inside the guarded directory — the config block is scoped by `files`, so the filename is
// what selects the rules under test. The file need not exist on disk; lintText resolves config by path.
const FILE = 'packages/simulation/src/engine/__boundary_probe__.ts';

const MUST_REJECT = [
  ['bare parent import', `import { a } from '..';\nexport const q = a;\n`],
  ['parent-prefixed import', `import { a } from '../gol/x';\nexport const q = a;\n`],
  [
    'parent segment behind a ./ prefix',
    `import { a } from './../../gol/x';\nexport const q = a;\n`,
  ],
  ['deep interior escape', `import { a } from './sub/../../gol/x';\nexport const q = a;\n`],
  ['workspace package import', `import { a } from '@gol/domain';\nexport const q = a;\n`],
  ['dynamic import of a workspace package', `export const f = () => import('@gol/domain');\n`],
  ['dynamic import escaping by path', `export const f = () => import('../gol/x');\n`],
];

const MUST_ACCEPT = [
  ['sibling module', `import { a } from './operators';\nexport const q = a;\n`],
  ['interior subdirectory', `import { a } from './sub/thing';\nexport const q = a;\n`],
];

const eslint = new ESLint();
const failures = [];

// Only the boundary rules matter here; a fixture citing a missing module or an unused symbol would
// otherwise fail for reasons that have nothing to do with the boundary.
const BOUNDARY_RULES = new Set(['no-restricted-imports', 'no-restricted-syntax']);

const boundaryErrors = async (code) => {
  const [result] = await eslint.lintText(code, { filePath: FILE, warnIgnored: false });
  return (result?.messages ?? []).filter((m) => m.severity === 2 && BOUNDARY_RULES.has(m.ruleId));
};

for (const [label, code] of MUST_REJECT) {
  const errors = await boundaryErrors(code);
  if (errors.length === 0)
    failures.push(`ESCAPE NOT CAUGHT — ${label}\n    ${code.trim().split('\n')[0]}`);
}

for (const [label, code] of MUST_ACCEPT) {
  const errors = await boundaryErrors(code);
  if (errors.length > 0) {
    failures.push(
      `LEGITIMATE IMPORT REJECTED — ${label}: ${errors.map((e) => e.message).join('; ')}`,
    );
  }
}

// Floor guard, same reasoning as check-spec-ids.mjs: if the cases above ever stop being loaded,
// every assertion passes vacuously and this script becomes a rubber stamp.
if (MUST_REJECT.length < 7 || MUST_ACCEPT.length < 2) {
  failures.push(
    `case list shrank (${MUST_REJECT.length} reject / ${MUST_ACCEPT.length} accept) — cases must only be added`,
  );
}

if (failures.length > 0) {
  console.error('\n✗ engine boundary (AR-16/AR-40) is not airtight:\n');
  for (const f of failures) console.error(`  - ${f}`);
  console.error('\nFix eslint.config.mjs — the packages/simulation/src/engine/ block.\n');
  process.exit(1);
}

console.log(
  `✓ engine boundary: ${MUST_REJECT.length} escape shapes rejected, ${MUST_ACCEPT.length} legitimate imports accepted.`,
);
