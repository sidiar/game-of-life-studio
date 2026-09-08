import { describe, expect, it } from 'vitest';
import { CONWAYS_CLASSIC_ID } from '@gol/domain';
import { DEFAULT_TOOL, ERASER_TOOL, refForTool, type Tool } from './tool';

const ORGANISM_A = 'organism-a';
const ORGANISM_B = 'organism-b';

function organismTool(organismId: string): Tool {
  return { kind: 'organism', organismId };
}

describe('DEFAULT_TOOL', () => {
  // AC5: until Story 2.9's roster UI exists, the selection is Conway's Classic and nothing else.
  it('selects Conway’s Classic as an organism tool', () => {
    expect(DEFAULT_TOOL).toEqual({ kind: 'organism', organismId: CONWAYS_CLASSIC_ID });
  });

  // A fresh literal per render would rebuild every memo keyed on the tool, which is what makes the
  // resolved ref (and through it the palette-independent paint path) churn.
  it('is a stable module-level identity', () => {
    expect(DEFAULT_TOOL).toBe(DEFAULT_TOOL);
  });
});

describe('refForTool', () => {
  // THE encoding assertion: `ref = roster index + 1` (RFC-006 Decision 2). Slot 0 is empty, so the
  // FIRST roster entry is ref 1 — an off-by-one here paints a different organism's colour with
  // nothing logged.
  it('resolves the first roster entry to ref 1, not ref 0', () => {
    expect(refForTool(organismTool(ORGANISM_A), [ORGANISM_A, ORGANISM_B])).toBe(1);
  });

  it('resolves later roster entries to their index + 1', () => {
    const roster = [ORGANISM_A, ORGANISM_B, CONWAYS_CLASSIC_ID];
    expect(refForTool(organismTool(ORGANISM_B), roster)).toBe(2);
    expect(refForTool(DEFAULT_TOOL, roster)).toBe(3);
  });

  // `null`, never 0: 0 is a legitimate ref meaning "empty" (Story 2.7's eraser writes it), so
  // folding "not in the roster" into it would make an unknown organism ERASE the cell instead of
  // doing nothing.
  it('returns null — never 0 — for an organism the roster does not contain', () => {
    expect(refForTool(organismTool('not-in-roster'), [ORGANISM_A])).toBeNull();
  });

  it('returns null for an empty roster', () => {
    expect(refForTool(DEFAULT_TOOL, [])).toBeNull();
  });

  // The palette LUT is built over the SAME roster array (`buildRefToFillGroup`), whose `size` is
  // `roster.length + 1`. A ref this function returns must therefore always be a valid index into
  // it — otherwise `colourStateAt` folds the cell to EMPTY with only a warn-once, and the click
  // appears to do nothing (trap 3).
  it('never returns a ref at or beyond the LUT size the same roster produces', () => {
    const roster = [ORGANISM_A, ORGANISM_B, CONWAYS_CLASSIC_ID];
    const lutSize = roster.length + 1;
    for (const id of roster) {
      const ref = refForTool(organismTool(id), roster);
      expect(ref).not.toBeNull();
      expect(ref).toBeGreaterThan(0);
      expect(ref).toBeLessThan(lutSize);
    }
  });

  it('is pure: it does not mutate the roster it is given', () => {
    const roster = [ORGANISM_A, ORGANISM_B];
    refForTool(organismTool(ORGANISM_B), roster);
    expect(roster).toEqual([ORGANISM_A, ORGANISM_B]);
  });

  // Story 2.7 AC4: the eraser resolves to `0` — the reserved "empty" ref (RFC-006 Decision 2) —
  // regardless of the roster, including an empty one (an empty roster must still erase; trap 1).
  // Mutation-check the load-bearing claim rather than trust it: flip the eraser's arm to `null`
  // and this test must redden.
  it('resolves the eraser tool to ref 0, as a number, for any roster including an empty one', () => {
    for (const roster of [[], [ORGANISM_A], [ORGANISM_A, ORGANISM_B, CONWAYS_CLASSIC_ID]]) {
      const ref = refForTool(ERASER_TOOL, roster);
      expect(ref).toBe(0);
      expect(typeof ref).toBe('number');
      expect(ref).not.toBeNull();
    }
  });
});
