// Fails CI when a spec ID cited in code does not resolve to anything in docs/.
//
// project-context.md ("Code Quality & Style Rules") makes citation a convention:
// *"Cite the governing spec by ID where a rule is non-local: (RFC-004 §3.5),
// (Decision B.5), (AR-2). That is how the next reader finds the authority."*
// ~450 comment lines across the workspace do exactly that. But a citation is a
// pointer with nothing behind it — renumber a decision, retire an AR, or move a
// story and the pointer keeps compiling, keeps passing tests, and keeps looking
// authoritative. Stale citations rot INVISIBLY: they do not read as wrong, they
// just cost the next reader a doc-grep to discover they are worthless. This gate
// turns that silent rot into a red build.
//
// MATCHING: both sides are tokenised with the SAME regex and compared as sets —
// never by substring search. Substring matching is actively wrong here: `AR-4`
// occurs inside `AR-46`, and `FR-8` inside `FR-8.7`, so a naive `grep -F` would
// report retired ids as alive. Set membership over identical tokenisation has no
// such asymmetry.
//
// DELIBERATELY NOT CHECKED:
//   - `AC1`..`ACn` — acceptance criteria are numbered PER STORY, so `AC2` has no
//     global referent. Validating them would need to know which story each file
//     implements, which is not recoverable from the source.
//   - bare `Decision 7` — RFC-relative (it means "Decision 7 OF the RFC named
//     nearby"). The `RFC-00n` half of `RFC-006 Decision 7` IS checked; pinning
//     the number to the right RFC would need prose parsing, not tokenising.
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, extname } from 'node:path';

const CODE_ROOTS = ['packages', 'apps'];

// The AUTHORITY set — deliberately not all of `docs/`. A story file under
// docs/implementation-artifacts/ CITES ids; it does not DEFINE them, and counting a
// citation as a definition makes this gate unable to detect the rot it exists for:
// renumber AR-46 in architecture.md and every code citation still "resolves" via an
// echo in epic-1/1-9-*.md, green forever (review 2026-08-25). CLAUDE.md names these
// same files as the specs: architecture.md is the umbrella, the RFCs own their areas,
// project-context.md carries deliberate overrides.
const AUTHORITY_DIRS = ['docs/planning-artifacts'];
const AUTHORITY_FILES = ['docs/project-context.md'];

const CODE_EXT = new Set(['.ts', '.tsx']);
const DOC_EXT = new Set(['.md']);
const SKIP_DIRS = new Set(['node_modules', '.next', '.turbo', '.git', 'coverage', 'out', 'dist']);

// Lookarounds keep an id from matching inside a longer one: `AR-4` must not fire
// on `AR-46`, and `FR-8` must not fire on `FR-8.7`. Decision letters are matched
// as [A-Z] rather than the [A-J] that actually exist — a typo'd `Decision Z` then
// fails loudly here instead of being silently skipped by a narrow class.
//
// Minor Resolutions are bounded to M1–M10, the full set architecture.md declares,
// rather than an open `M\d+`. Unbounded, this scans SVG path data as spec ids: the
// icon `d="M12 4 L20 12 M4 12"` yields BOTH `M12` — which fails CI as a stale
// citation, indistinguishable from a real one — and `M4`, which silently resolves
// because M4 genuinely exists. Epic 2 is the Battle Editor (tool icons, toolbars),
// so an inline path is a matter of when, not if (review 2026-08-25). Bounding kills
// the build-breaking half. An M1–M10 substring inside a path still extracts and
// still resolves — harmless noise in the cited count, not a failure — and the only
// way to eliminate that is to scan comments alone, which needs a real TS lexer
// rather than a regex; not worth it for noise that cannot fail the gate.
//
// This deliberately trades AWAY the typo detection the `Decision [A-Z]` choice above
// buys: a mistyped `M11` is now silently skipped, where `M\d+` would have failed it
// loudly. The two cases are not symmetric — `Decision Z` cannot occur in path data,
// `M11` can and will. Adding a Minor Resolution beyond M10 means widening this.
const SPEC_ID =
  /(?<![\w.-])(AR-\d+|RFC-00\d|NFR-\d+(?:\.\d+)*|FR-\d+(?:\.\d+)*|M(?:[1-9]|10)|Decision [A-Z](?:\.\d+)?|Story \d+\.\d+)(?![\w.-])/g;

// Sub-decisions are DECLARED in a different shape from how they are CITED. Code
// writes `(Decision I.4)`; architecture.md writes the list item
//
//     - **I.4 — Subordinate versions are stamps, not switches.** …
//
// so the literal string "Decision I.4" appears nowhere in the authority docs. Without
// this, narrowing to the authority set above fails five genuine citations — Decision
// E.4, F.2, I.4, J.1, J.3 — which is why restricting the doc root ALONE (the obvious
// half of this fix) red-builds `main`. architecture.md declares the full A.1–J.4 grid
// this way; the RFCs use no such form, and top-level `### Decision A —` headings are
// already caught by SPEC_ID's prose match.
const SUB_DECISION_DECLARATION = /^\s*-\s*\*\*([A-Z]\.\d+)\s*—/gm;

// Ids the PRD defines only inside a RANGE (e.g. "FR-8.2-8.5" covers FR-8.3) and
// so cannot tokenise on the docs side. Empty today — every one of the 119 ids
// cited across the workspace resolves to a literal token. Add an entry here (with
// the range that defines it) only when the docs genuinely use range notation;
// never to silence a citation that is simply stale.
const RANGE_DEFINED = new Set();

function walk(dir, exts, out = []) {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) walk(path, exts, out);
    else if (exts.has(extname(path))) out.push(path);
  }
  return out;
}

/** id -> ["file:line", ...]. Line numbers make a failure actionable, not a scavenger hunt. */
function collect(files) {
  const found = new Map();
  for (const file of files) {
    const lines = readFileSync(file, 'utf8').split('\n');
    lines.forEach((line, i) => {
      for (const [, id] of line.matchAll(SPEC_ID)) {
        if (!found.has(id)) found.set(id, []);
        found.get(id).push(`${file}:${i + 1}`);
      }
    });
  }
  return found;
}

const codeFiles = CODE_ROOTS.flatMap((root) => walk(root, CODE_EXT));
const docFiles = [
  ...AUTHORITY_DIRS.flatMap((dir) => walk(dir, DOC_EXT)),
  ...AUTHORITY_FILES.filter((file) => existsSync(file)),
];

if (docFiles.length === 0) {
  console.error(
    `✖ spec-ids: no markdown found in the authority set (${[...AUTHORITY_DIRS, ...AUTHORITY_FILES].join(', ')}). ` +
      `Every citation would "fail" against an empty authority set — treat as a broken gate, ` +
      `not a real result.`,
  );
  process.exit(1);
}

const cited = collect(codeFiles);
const defined = collect(docFiles);

// Fold the declaration form in, so `- **I.4 — …` counts as defining `Decision I.4`.
for (const file of docFiles) {
  const text = readFileSync(file, 'utf8');
  for (const [, sub] of text.matchAll(SUB_DECISION_DECLARATION)) {
    const id = `Decision ${sub}`;
    if (!defined.has(id)) defined.set(id, []);
    defined.get(id).push(file);
  }
}

// A gate that silently stops matching is worse than no gate: it goes green forever.
// The workspace cites ~119 distinct ids; a collapse to near-zero means the regex or
// the walk broke, not that the citations disappeared.
const FLOOR = 25;
if (cited.size < FLOOR) {
  console.error(
    `✖ spec-ids: only ${cited.size} distinct ids found across ${codeFiles.length} source files ` +
      `(expected ≥${FLOOR}). The scraper is almost certainly broken — failing rather than ` +
      `passing vacuously.`,
  );
  process.exit(1);
}

const unresolved = [...cited.keys()]
  .filter((id) => !defined.has(id) && !RANGE_DEFINED.has(id))
  .sort();

console.log(`Spec-ID integrity`);
console.log(`  source files scanned:  ${codeFiles.length}`);
console.log(`  authority docs scanned: ${docFiles.length}`);
console.log(`  distinct ids cited:    ${cited.size}`);
console.log(`  distinct ids defined:  ${defined.size}`);

if (unresolved.length > 0) {
  console.error(
    `\n✖ spec-ids: ${unresolved.length} citation(s) resolve to nothing in the authority docs ` +
      `(${[...AUTHORITY_DIRS, ...AUTHORITY_FILES].join(', ')}):`,
  );
  for (const id of unresolved) {
    const sites = cited.get(id);
    console.error(`\n  ${id}  — cited at ${sites.length} site(s):`);
    for (const site of sites.slice(0, 5)) console.error(`      ${site}`);
    if (sites.length > 5) console.error(`      … and ${sites.length - 5} more`);
  }
  console.error(
    `\n  Either the spec moved (update the citation), the id was retired (drop the citation ` +
      `and keep the prose — the sentence should stand without the tag), or the doc genuinely ` +
      `defines it only inside a range (add it to RANGE_DEFINED with a note).`,
  );
  process.exit(1);
}

console.log(`\n✓ spec-ids: all ${cited.size} cited ids resolve.`);
