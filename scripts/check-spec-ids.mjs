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
import { join, extname, basename } from 'node:path';

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
// Minor Resolutions are bounded to the exact set architecture.md declares — now M1–M15
// (M1–M10 originally; widened to M12 by Story 3.1, to M13 by Story 3.2, to M14 by
// Story 3.3, to M15 by Story 3.4) — rather than an open `M\d+`.
// Unbounded, this scans SVG path data as spec ids: the icon `d="M12 4 L20 12 M4 12"`
// yields BOTH `M12` — which would fail CI as a stale citation, indistinguishable from a
// real one — and `M4`, which silently resolves because M4 genuinely exists. Epic 2 is the
// Battle Editor (tool icons, toolbars), so an inline path is a matter of when, not if
// (review 2026-08-25). Bounding kills the build-breaking half. An in-range substring
// inside a path still extracts and still resolves — harmless noise in the cited count,
// not a failure — and the only way to eliminate that is to scan comments alone, which
// needs a real TS lexer rather than a regex; not worth it for noise that cannot fail
// the gate.
//
// ⚠️ M12 IS NOW IN RANGE, and `M12` is one of the most common SVG moveto coordinates
// there is (a 24x24 icon centred at 12). A path in a .tsx/.md file that happens to write
// `M12 ` will now extract as a citation of M12 and RESOLVE — noise, not a failure, which
// is the trade this bound was always making, but the noise floor is higher than it was.
// If that ever becomes misleading, the fix is a real lexer, not a narrower range.
// M13 (Story 3.2) rides along in range. It is a far rarer moveto coordinate than M12,
// so it does not raise the noise floor the way widening to M12 did. M14 (Story 3.3)
// and M15 (Story 3.4) ride along on the same reasoning.
//
// This deliberately trades AWAY the typo detection the `Decision [A-Z]` choice above
// buys: a mistyped `M14` is silently skipped, where `M\d+` would have failed it loudly.
// The two cases are not symmetric — `Decision Z` cannot occur in path data, `M14` can.
// Adding a Minor Resolution beyond M15 means widening this again, in BOTH places: the
// regex alternation below and the range named in this comment.
const SPEC_ID =
  /(?<![\w.-])(AR-\d+|RFC-00\d|NFR-\d+(?:\.\d+)*|FR-\d+(?:\.\d+)*|M(?:[1-9]|1[0-5])|Decision [A-Z](?:\.\d+)?|Story \d+\.\d+)(?![\w.-])/g;

// ─── Cross-RFC Reconciliations (added 2026-08-29, Sidiar's call) ───────────────
//
// WHY THIS NEEDS ITS OWN PASS. Story 2.13 surfaced four citations of "Reconciliation
// #3" that appeared to resolve to nothing: architecture.md carried the six numbered
// reconciliations but had LOST the `### Cross-RFC Reconciliations` heading above
// them, so the block read as a continuation of Decision K. The gate above never saw
// it, for two independent reasons — and BOTH have to be fixed or the class stays
// invisible:
//
//   1. SPEC_ID does not tokenise `Reconciliation #N`, so it was never a cited id.
//   2. The gate scans CODE for citations (CODE_ROOTS, `.ts`/`.tsx`). Every one of
//      these four citations lives in a DOC citing another DOC, which the gate does
//      not read as a citer at all.
//
// ⚠️ The obvious generalisation — "also scan docs as citers" — is VACUOUS and was
// measured to be so before this was written: run the existing SPEC_ID over the
// authority docs as both citers and definers and 305 distinct ids resolve, 0 fail.
// That is not integrity, it is a tautology: for prose ids the citation form and the
// declaration form are the SAME STRING, so any doc mentioning `FR-8.2` also
// "defines" it. Checking doc→doc citations is only meaningful for an id whose
// declaration is structurally distinct from its citation — which is exactly what
// makes reconciliations checkable and prose ids not.
//
// A reconciliation is CITED as `Reconciliation #3` (often "Cross-RFC Reconciliation
// #3", and once as "Cross-RFC Reconciliations §6" — the `§` form is deliberately
// matched too, because it means the same thing and would otherwise rot unwatched).
// It is DECLARED as a top-level numbered item inside the section:
//
//     ### Cross-RFC Reconciliations
//     …
//     3. **Battle grid shape — dense at rest, sparse on the wire.** …
//
// So the number is bounded by how many items that section actually has, and a
// citation of `#7` — or of anything at all once the heading goes missing again —
// fails loudly instead of rotting for two months.
const RECONCILIATION_CITATION = /Reconciliations?\s*(?:#|§)\s*(\d+)/g;

/**
 * The reconciliations declared in architecture.md, as a set of `Reconciliation #N`.
 *
 * Anchored on the HEADING, not merely on "a numbered list somewhere in the file":
 * the heading's absence is the precise failure this exists to catch, so a parse that
 * still succeeded without it would defeat the point. Returns an empty set when the
 * heading is gone, which turns every citation red — the intended outcome.
 */
function collectReconciliationDeclarations(text) {
  const declared = new Set();
  const heading = /^###\s+Cross-RFC Reconciliations\s*$/m.exec(text);
  if (heading === null) return declared;
  // The section runs to the next heading of the same or higher level.
  const rest = text.slice(heading.index + heading[0].length);
  const end = /^#{1,3}\s+/m.exec(rest);
  const section = end === null ? rest : rest.slice(0, end.index);
  for (const [, n] of section.matchAll(/^(\d+)\.\s+\*\*/gm)) {
    declared.add(`Reconciliation #${n}`);
  }
  return declared;
}

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

// ─── Reconciliation citations, checked across code AND docs ───────────────────
//
// Docs are read as citers HERE and nowhere else, for the reason the comment on
// RECONCILIATION_CITATION gives: this is the one id whose declaration form differs
// from its citation form, so the check is real rather than tautological. The four
// citations that motivated this all live in docs, so a code-only pass would still
// report a clean build over a dangling id.
const reconciliationDeclared = collectReconciliationDeclarations(
  readFileSync('docs/planning-artifacts/architecture.md', 'utf8'),
);

const reconciliationCited = new Map();
for (const file of [...codeFiles, ...docFiles]) {
  // architecture.md DECLARES these; its own numbered list must not read as citations
  // of itself. Other docs citing it are exactly what we want to check.
  //
  // ⚠️ `basename(...) === `, never `file.endsWith('architecture.md')` — which also matches
  // `RFC-001-multi-mode-architecture.md` and silently excused that file from the gate entirely.
  // Caught while verifying this check bites: a deliberately bogus `Reconciliation #9` appended to
  // RFC-001 was NOT reported, and RFC-001:399's real `#4` citation was missing from the scan too.
  // The same substring-vs-token trap the SPEC_ID comment above documents for `AR-4`/`AR-46`.
  if (basename(file) === 'architecture.md') continue;
  const lines = readFileSync(file, 'utf8').split('\n');
  lines.forEach((line, i) => {
    for (const [, n] of line.matchAll(RECONCILIATION_CITATION)) {
      const id = `Reconciliation #${n}`;
      if (!reconciliationCited.has(id)) reconciliationCited.set(id, []);
      reconciliationCited.get(id).push(`${file}:${i + 1}`);
    }
  });
}

const reconciliationUnresolved = [...reconciliationCited.keys()]
  .filter((id) => !reconciliationDeclared.has(id))
  .sort();

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
console.log(`  reconciliations declared: ${reconciliationDeclared.size}`);
console.log(`  reconciliations cited:    ${reconciliationCited.size}`);

if (reconciliationDeclared.size === 0) {
  console.error(
    `\n✖ spec-ids: architecture.md declares NO Cross-RFC Reconciliations. The ` +
      `"### Cross-RFC Reconciliations" heading is missing or was renamed — the six numbered ` +
      `items are parsed relative to it, and without it every "Reconciliation #N" citation below ` +
      `is dangling. (This is the exact state Story 2.13 found: the items were present, the ` +
      `heading was not, and nothing noticed for two months.)`,
  );
  process.exit(1);
}

if (reconciliationUnresolved.length > 0) {
  console.error(
    `\n✖ spec-ids: ${reconciliationUnresolved.length} "Reconciliation #N" citation(s) resolve to ` +
      `nothing in architecture.md's Cross-RFC Reconciliations (${reconciliationDeclared.size} declared):`,
  );
  for (const id of reconciliationUnresolved) {
    const sites = reconciliationCited.get(id);
    console.error(`\n  ${id}  — cited at ${sites.length} site(s):`);
    for (const site of sites.slice(0, 5)) console.error(`      ${site}`);
    if (sites.length > 5) console.error(`      … and ${sites.length - 5} more`);
  }
  process.exit(1);
}

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

console.log(
  `\n✓ spec-ids: all ${cited.size} cited ids resolve, and all ${reconciliationCited.size} ` +
    `reconciliation citations resolve against ${reconciliationDeclared.size} declared.`,
);
