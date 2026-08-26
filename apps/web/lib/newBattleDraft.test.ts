import { describe, expect, it } from 'vitest';
import type { EditableGridPreset } from '@gol/domain';
import { createNewBattleDraft } from './newBattleDraft';

// Both editable presets, not just one — a test at a single preset cannot catch a hardcoded
// 100x60 constant (Decision A / project-context.md "grid dimensions are never constants").
const PRESETS: readonly EditableGridPreset[] = [
  { cols: 50, rows: 30 },
  { cols: 100, rows: 60 },
];

describe('createNewBattleDraft', () => {
  it.each(PRESETS)('sizes the grid to match the passed preset ($cols x $rows)', (preset) => {
    const draft = createNewBattleDraft(preset);

    expect(draft.gridSize).toEqual(preset);
    expect(draft.gridState).toHaveLength(preset.rows);
    for (const row of draft.gridState) {
      expect(row).toHaveLength(preset.cols);
    }
  });

  // toEqual above passes for an ALIAS, so it cannot catch this on its own. The caller's preset is
  // often `DEFAULT_SETTINGS.defaultGridSize` — a shallow-frozen, process-wide singleton — so a
  // draft that shares the reference lets a later in-place resize corrupt the app-wide default.
  it.each(PRESETS)(
    'copies the preset rather than aliasing the caller ($cols x $rows)',
    (preset) => {
      const draft = createNewBattleDraft(preset);

      expect(draft.gridSize).not.toBe(preset);
    },
  );

  it.each(PRESETS)('seeds every cell as 0 ($cols x $rows)', (preset) => {
    const draft = createNewBattleDraft(preset);

    for (const row of draft.gridState) {
      for (const cell of row) {
        expect(cell).toBe(0);
      }
    }
  });

  // The Array(rows).fill([]) trap: that call hands every row the SAME array reference, so
  // mutating one row would mutate all of them. Assert rows are DISTINCT instances, not merely
  // equal in content.
  it('gives each row its own array instance, not a shared reference', () => {
    const draft = createNewBattleDraft({ cols: 50, rows: 30 });

    // Identity first — that is literally what "distinct instances" means and what `fill([])`
    // breaks. The mutation check below is the observable consequence, kept because it is the
    // symptom a reader will actually recognise.
    expect(draft.gridState[0]).not.toBe(draft.gridState[1]);

    draft.gridState[0][0] = 7;

    expect(draft.gridState[1][0]).toBe(0);
    expect(draft.gridState[0][0]).toBe(7);
  });

  it('seeds an empty organismIds array (AC1/AC4)', () => {
    const draft = createNewBattleDraft({ cols: 100, rows: 60 });

    expect(draft.organismIds).toEqual([]);
  });

  // Never the literal "Untitled Battle" — that is a DISPLAY fallback (battleDisplayName), not the
  // stored name. Seeding it here would persist it as a real name once Story 2.13 saves the draft.
  it('seeds the name as an empty string, not the display fallback', () => {
    const draft = createNewBattleDraft({ cols: 100, rows: 60 });

    expect(draft.name).toBe('');
  });
});
