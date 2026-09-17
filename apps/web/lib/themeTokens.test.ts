import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { contrastRatio } from './palette/paletteCvd';

// Parses the SHIPPED CSS file, not a re-declared copy — a test that hardcodes the hexes in
// TypeScript passes forever after someone edits themes.css and verifies nothing (Story 1.9 Dev
// Notes). This is the only place in the repo that reads themes.css as data.
const THEMES_CSS_PATH = join(__dirname, '..', 'app', 'themes.css');
const CSS = readFileSync(THEMES_CSS_PATH, 'utf8');

// Comments are stripped and the sweep is scoped to ONE block before matching (code review
// 2026-08-07). The previous version regexed the whole file with last-match-wins, so Story 6.1's
// :root[data-theme='biotech-terminal'] block would have silently repointed this AA gate at
// Biotech's hexes — a theme architecture Cross-RFC Reconciliation 5 explicitly exempts from AA —
// and a commented-out prior value placed after the live one would have won just as quietly.
const HEX_TOKEN_RE = /--gol-([a-z0-9-]+):\s*(#[0-9a-fA-F]{6})\b/g;
const CHANNEL_TOKEN_RE = /--gol-([a-z0-9-]+)-channel:\s*(\d{1,3})\s+(\d{1,3})\s+(\d{1,3})\b/g;

function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

// Clinical Lab lives on bare :root (it is the unconditional default — see themes.css); other
// themes arrive as [data-theme='…'] override blocks and must not leak into these assertions.
function clinicalLabBlock(): string {
  const css = stripComments(CSS);
  const match = css.match(/(^|\})\s*:root\s*\{([^}]*)\}/);
  if (!match) {
    throw new Error('themes.css has no bare :root block — did the token layer change shape?');
  }
  return match[2];
}

const BLOCK = clinicalLabBlock();

function parseTokens(): Record<string, string> {
  const tokens: Record<string, string> = {};
  for (const match of BLOCK.matchAll(HEX_TOKEN_RE)) {
    tokens[match[1]] = match[2];
  }
  return tokens;
}

const tokens = parseTokens();

function tok(name: string): string {
  const value = tokens[name];
  if (!value) {
    throw new Error(`themes.css has no --gol-${name} token — did the token layer change shape?`);
  }
  return value;
}

const BACKGROUNDS = ['bg-primary', 'bg-secondary', 'bg-hover'];

describe('Clinical Lab token layer — WCAG AA (AC5)', () => {
  it('parsed at least the expected token count from the shipped CSS', () => {
    // Sanity floor, not an exhaustive list — guards against the regex matching zero tokens
    // (e.g. themes.css moved or its syntax changed) and silently passing every test below with
    // an empty tokens object. Bumped 13 -> 16 in Story 1.13 (--gol-danger, --gol-danger-hover,
    // --gol-on-danger).
    expect(Object.keys(tokens).length).toBeGreaterThanOrEqual(16);
  });

  describe('text pairs — SC 1.4.3, >= 4.5:1', () => {
    // 'rule-born' joins the loop (Story 4.10) — measured 14.50 / 12.75 / 11.65 on the three
    // backgrounds, well above the 4.5 floor. Its two siblings, --gol-rule-survive and
    // --gol-rule-die, are `var()` ALIASES the hex regex above cannot parse (they resolve to
    // --gol-accent / --gol-danger, respectively) and are already gated through those targets —
    // the same precedent --gol-action-active sets for an alias token.
    const textTokens = ['text-primary', 'text-secondary', 'text-tertiary', 'accent', 'rule-born'];

    for (const text of textTokens) {
      for (const bg of BACKGROUNDS) {
        it(`${text} on ${bg}`, () => {
          const ratio = contrastRatio(tok(text), tok(bg));
          expect(ratio).toBeGreaterThanOrEqual(4.5);
        });
      }
    }

    const accentStates = ['accent', 'accent-hover', 'accent-active'];
    for (const state of accentStates) {
      it(`on-accent on ${state}`, () => {
        const ratio = contrastRatio(tok('on-accent'), tok(state));
        expect(ratio).toBeGreaterThanOrEqual(4.5);
      });
    }

    // Danger (Story 1.13) — same shape as the accent-state loop above, for the delete dialog's
    // filled Button (error.main/error.contrastText).
    const dangerStates = ['danger', 'danger-hover'];
    for (const state of dangerStates) {
      it(`on-danger on ${state}`, () => {
        const ratio = contrastRatio(tok('on-danger'), tok(state));
        expect(ratio).toBeGreaterThanOrEqual(4.5);
      });
    }
  });

  // Danger text on a background — NOT the same loop as the text-pairs block above, because
  // bg-hover is DELIBERATELY excluded: --gol-danger on --gol-bg-hover measures 4.48, just under
  // the 4.5 floor, and nothing in the app paints danger TEXT on that surface (BattleTile's delete
  // button is --gol-text-secondary; only the dialog's filled Delete button is danger, and its
  // surface is --gol-bg-secondary via MuiDialog's paper override). Adding a bg-hover row here
  // would fail the gate for a pair the app never renders.
  describe('danger pairs — SC 1.4.3, >= 4.5:1 (bg-hover excluded — see comment)', () => {
    const dangerBackgrounds = ['bg-primary', 'bg-secondary'];
    for (const bg of dangerBackgrounds) {
      it(`danger on ${bg}`, () => {
        const ratio = contrastRatio(tok('danger'), tok(bg));
        expect(ratio).toBeGreaterThanOrEqual(4.5);
      });

      // Story 3.12 FD2 (a): `<SimulationControlBar>`'s Stop & reset brightens the TEXT/border on
      // hover to `--gol-danger-hover` rather than tinting the surface — the mockup's 10% danger
      // tint measures under 4.5:1 for danger text on `--gol-bg-secondary` (the same trap the
      // `bg-hover` exclusion above records for `--gol-danger`), so a filled/tinted hover would
      // ship an AA failure. These two rows are what make that choice a gated fact, not an
      // estimate: measured ≈5.3:1 on bg-secondary and ≈6.0:1 on bg-primary.
      it(`danger-hover on ${bg}`, () => {
        const ratio = contrastRatio(tok('danger-hover'), tok(bg));
        expect(ratio).toBeGreaterThanOrEqual(4.5);
      });
    }
  });

  describe('control pairs — SC 1.4.11, >= 3:1', () => {
    const controlTokens = ['border-control', 'accent'];

    for (const control of controlTokens) {
      for (const bg of BACKGROUNDS) {
        it(`${control} on ${bg}`, () => {
          const ratio = contrastRatio(tok(control), tok(bg));
          expect(ratio).toBeGreaterThanOrEqual(3);
        });
      }
    }
  });

  // --gol-border (#333333) is DELIBERATELY excluded from the gate, not by oversight. SC 1.4.11
  // covers boundaries needed to identify a CONTROL; a decorative divider or card edge is not one.
  // --gol-border measures ~1.57:1 / ~1.38:1 against the two dark backgrounds and asserting 3:1
  // on it would force repainting every divider in the mockup for no accessibility gain — which is
  // exactly why --gol-border-control exists as a separate token (Story 1.9 Dev Notes: "the
  // intuitive 'accessibility fix' is wrong"). Do not add a --gol-border assertion here.
  //
  // The assertion below is that the SPLIT still exists — border-control is strictly the more
  // legible of the two. The earlier form asserted `contrastRatio(border) < 3`, which was a gate
  // pointing the wrong way: raising --gol-border for legibility, an unambiguous improvement,
  // would have failed it with a message implying the exclusion was broken (code review
  // 2026-08-07).
  it('keeps the decorative/control border split real', () => {
    const decorative = contrastRatio(tok('border'), tok('bg-primary'));
    const control = contrastRatio(tok('border-control'), tok('bg-primary'));
    expect(control).toBeGreaterThan(decorative);
  });
});

describe('channel tokens mirror their hex counterparts', () => {
  // Neither direction was covered before code review 2026-08-07, and neither fails loudly at
  // runtime: MUI's createThemeWithVars calls private_safeColorChannel with NO warning argument
  // for primary/secondary, so a missing or stale channel emits nothing to the console and simply
  // ships `--mui-palette-primary-mainChannel: var(--gol-accent)` — a hex where a triplet belongs.
  // Every Button/IconButton state layer then resolves to an invalid rgba() and renders fully
  // transparent. Retuning a hex without its channel line is the same failure with the previous
  // colour instead. This test is the guard the console does not provide.
  const channels = [...BLOCK.matchAll(CHANNEL_TOKEN_RE)].map((m) => ({
    name: m[1],
    rgb: [Number(m[2]), Number(m[3]), Number(m[4])] as const,
  }));

  it('found the channel tokens', () => {
    // Bumped 7 -> 8 in Story 1.13 (--gol-danger-channel).
    expect(channels.length).toBeGreaterThanOrEqual(8);
  });

  for (const { name, rgb } of channels) {
    it(`--gol-${name}-channel matches --gol-${name}`, () => {
      const hex = tok(name);
      const expected = [
        parseInt(hex.slice(1, 3), 16),
        parseInt(hex.slice(3, 5), 16),
        parseInt(hex.slice(5, 7), 16),
      ];
      expect(rgb).toEqual(expected);
    });
  }

  it('every hex token consumed by lib/theme.ts as a channel has a channel token', () => {
    const themeSource = readFileSync(join(__dirname, 'theme.ts'), 'utf8');
    const referenced = [...themeSource.matchAll(/var\(--gol-([a-z0-9-]+)-channel\)/g)].map(
      (m) => m[1],
    );
    const defined = new Set(channels.map((c) => c.name));
    for (const name of referenced) {
      expect(defined, `theme.ts reads --gol-${name}-channel`).toContain(name);
    }
  });
});

describe('every --gol-* reference resolves to a defined token', () => {
  // The hex sweep above cannot see --gol-font, --gol-radius or the letter-spacing tokens, so
  // before code review 2026-08-07 any of them could be renamed or deleted with a fully green
  // npm run ci: typography would silently revert to the UA default, the wordmark would lose its
  // tracking, and Paper/Button radius would fall back to unset.
  const DEFINED = new Set(
    [...stripComments(CSS).matchAll(/(--gol-[a-z0-9-]+)\s*:/g)].map((m) => m[1]),
  );

  function sourceFiles(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) return sourceFiles(full);
      if (!/\.tsx?$/.test(entry.name)) return [];
      if (/\.(test|spec)\.tsx?$/.test(entry.name)) return [];
      return [full];
    });
  }

  const files = [join(__dirname, '..', 'lib'), join(__dirname, '..', 'components')].flatMap(
    sourceFiles,
  );

  it('scanned the source tree', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  // themes.css references its OWN tokens too — `--gol-rule-survive: var(--gol-accent)` and
  // `--gol-rule-die: var(--gol-danger)` (Story 4.10), `--gol-action-active`, `--gol-grid-line`'s
  // channel. The source scan below never reads the stylesheet, so before this case (review
  // 2026-09-17) renaming `--gol-accent` left every alias dangling — both badges uncoloured — with
  // a green run.
  it('themes.css references only defined tokens', () => {
    const referenced = [...stripComments(CSS).matchAll(/var\((--gol-[a-z0-9-]+)/g)].map(
      (m) => m[1],
    );
    expect(referenced.length).toBeGreaterThan(0);
    for (const name of new Set(referenced)) {
      expect(DEFINED, `${name} is not defined in themes.css`).toContain(name);
    }
  });

  for (const file of files) {
    const source = readFileSync(file, 'utf8');
    const referenced = [...source.matchAll(/var\((--gol-[a-z0-9-]+)/g)].map((m) => m[1]);
    if (referenced.length === 0) continue;

    it(`${file.split('/').slice(-2).join('/')} references only defined tokens`, () => {
      for (const name of new Set(referenced)) {
        expect(DEFINED, `${name} is not defined in themes.css`).toContain(name);
      }
    });
  }
});
