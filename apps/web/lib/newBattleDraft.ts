import type { EditableGridPreset } from '@gol/domain';

/**
 * The shape a battle-in-progress needs before it is a saved `Battle` — deliberately a SUBSET of
 * `Battle`. `id`, `createdAt` and `updatedAt` are stamped by the save path (Story 2.13); minting
 * any of them here would be a lie the moment the user leaves `/battle/new` without saving (AC3).
 * `<BattlePage>` resolves both a loaded `Battle` and a freshly seeded draft to this ONE shape
 * (story Task 3), so Stories 2.4/2.5/2.11/2.13 read one shape instead of branching on
 * `battleId === 'new'` forever.
 */
export interface NewBattleDraft {
  name: string;
  gridSize: EditableGridPreset;
  gridState: number[][];
  organismIds: string[];
}

/**
 * Seeds a brand-new, unsaved battle at the given grid preset (AC1, AC4). Pure — no React, no
 * repository, no `Date.now()` — which is what makes the seed provable with a unit test alone;
 * `<PetriDishCanvas variant="edit">` does not exist yet (Story 2.4).
 *
 * `name` is the EMPTY STRING, never the literal `'Untitled Battle'`: `battleDisplayName('')`
 * already supplies that fallback for DISPLAY (lib/battleDisplayName.ts), and `BattleSchema.name`
 * has no lower bound. Seeding the display fallback as the stored name would pre-fill Story 2.11's
 * name field with placeholder text the user has to delete, and would persist "Untitled Battle" as
 * a real name the moment Story 2.13 saves it.
 */
export function createNewBattleDraft(gridSize: EditableGridPreset): NewBattleDraft {
  return {
    name: '',
    gridSize,
    // `Array.from({ length }, () => …)`, NOT `Array(rows).fill([])` — the latter hands every row
    // the SAME array reference, so writing one cell would silently write the whole column. This
    // is the exact trap `packages/test-utils/src/gridBuilders.ts#emptyGrid` documents; that
    // builder cannot be imported here (banned from `apps/web` production code by the ESLint
    // import-boundary rule, `eslint.config.mjs`), so the shape is reproduced rather than shared
    // (forced decision 4 — smallest diff, and `apps/web` is already the wiring layer).
    gridState: Array.from({ length: gridSize.rows }, () =>
      Array.from({ length: gridSize.cols }, () => 0),
    ),
    organismIds: [],
  };
}
