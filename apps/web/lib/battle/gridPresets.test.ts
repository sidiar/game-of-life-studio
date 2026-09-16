import { describe, expect, it } from 'vitest';
import { GRID_PRESETS, gridPresetIndex } from './gridPresets';

describe('gridPresets (Story 3.16)', () => {
  // AC7: the fixture IS the spec — a `toEqual` on the whole tuple pins both the members and the
  // SLIDER ORDER a detented control indexes.
  it('holds the four presets in slider order', () => {
    expect(GRID_PRESETS).toEqual([
      { cols: 50, rows: 30 },
      { cols: 100, rows: 60 },
      { cols: 150, rows: 90 },
      { cols: 200, rows: 120 },
    ]);
  });

  it.each(GRID_PRESETS.map((preset, index) => [preset, index] as const))(
    'gridPresetIndex(%o) is %i',
    (preset, index) => {
      expect(gridPresetIndex(preset)).toBe(index);
    },
  );

  // AC8: an off-ladder size is reachable (the view's own 7x5 fixture) and must not throw or match
  // by accident — both axes have to agree, not just one.
  it('returns -1 for a size off the ladder', () => {
    expect(gridPresetIndex({ cols: 7, rows: 5 })).toBe(-1);
  });

  it('returns -1 when only one axis matches a preset', () => {
    expect(gridPresetIndex({ cols: 100, rows: 30 })).toBe(-1);
  });
});
