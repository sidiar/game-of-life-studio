import { afterEach, describe, expect, it, vi } from 'vitest';
import { ERASER_TOOL, refForTool } from '@/lib/battle/tool';
import { fillGroupOf, resetRefToFillGroupWarnings } from '@/lib/canvas/refToFillGroup';
import { ageShadeFor } from '@/lib/palette/displayColor';
import { paletteIndexOf } from '@/lib/palette/paletteRegistry';
import {
  buildPreviewPalette,
  PREVIEW_GRID_SIZE,
  PREVIEW_ORGANISM_ID,
  PREVIEW_ROSTER,
  toolForDrawMode,
} from './previewGrid';

afterEach(() => {
  resetRefToFillGroupWarnings();
  vi.restoreAllMocks();
});

describe('PREVIEW_GRID_SIZE', () => {
  it('is UX-DR13’s 30 by 20 and frozen', () => {
    expect(PREVIEW_GRID_SIZE).toEqual({ cols: 30, rows: 20 });
    expect(Object.isFrozen(PREVIEW_GRID_SIZE)).toBe(true);
  });
});

describe('toolForDrawMode', () => {
  it('draw resolves to the preview organism tool', () => {
    expect(toolForDrawMode('draw')).toEqual({
      kind: 'organism',
      organismId: PREVIEW_ORGANISM_ID,
    });
  });

  it('erase IS the shared ERASER_TOOL constant (identity)', () => {
    expect(toolForDrawMode('erase')).toBe(ERASER_TOOL);
  });
});

describe('refForTool over the preview roster', () => {
  it('draw resolves to ref 1, erase resolves to ref 0', () => {
    expect(refForTool(toolForDrawMode('draw'), PREVIEW_ROSTER)).toBe(1);
    expect(refForTool(toolForDrawMode('erase'), PREVIEW_ROSTER)).toBe(0);
  });
});

describe('buildPreviewPalette', () => {
  it('builds a size-2 LUT with slot 1 set from the organism and slot 0 empty', () => {
    const palette = buildPreviewPalette({ colorToken: 'vermillion', agingEnabled: false });
    expect(palette.size).toBe(2);
    expect(palette.tokenIndex[1]).toBe(paletteIndexOf('vermillion'));
    expect(palette.aging[1]).toBe(0);
  });

  it('sets aging[1] = 1 when agingEnabled is true', () => {
    const palette = buildPreviewPalette({ colorToken: 'vermillion', agingEnabled: true });
    expect(palette.aging[1]).toBe(1);
  });

  it('fillGroupOf matches the AC4 shade claim for both aging flags', () => {
    for (const agingEnabled of [false, true]) {
      const palette = buildPreviewPalette({ colorToken: 'vermillion', agingEnabled });
      const expected = paletteIndexOf('vermillion') * 8 + ageShadeFor(0, agingEnabled);
      expect(fillGroupOf(palette, 1, 0)).toBe(expected);
    }
  });

  it('does not warn for a known id — the map is keyed correctly', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    buildPreviewPalette({ colorToken: 'vermillion', agingEnabled: false });
    expect(warnSpy).not.toHaveBeenCalled();
  });
});
