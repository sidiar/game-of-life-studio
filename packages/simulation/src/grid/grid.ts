// The typed-array grid the simulation runs on (RFC-004 §3.4, AR-17) and the dense<->typed
// conversion around it. This is the representation NFR-1.1's 60 FPS budget is won or lost in:
// parallel typed arrays indexed row-major, no per-cell objects, no allocation beyond the two
// buffers a grid owns.
//
// ❌ No classes, no module-level mutable state (AR-16) — pure functions over plain data.
// ❌ No zod. Validation is a boundary concern (project-context); the eager throws below are the
//    `@gol/test-utils` gridBuilders house convention for a function that can be handed nonsense
//    (a dense `number[][]` from outside), not schema parsing.

/**
 * RFC-004 §3.4's grid, verbatim.
 *
 * ⚠️ `width`/`height` are PARAMETERS, never constants (Decision A, AR-17). 100x60 is the default
 * editable preset, 50x30 the other, and Play mode expands ephemerally to 200x120 (H-9) — a
 * hardcoded dimension anywhere below the UI is a bug.
 *
 * ⚠️ Field names are `width`/`height`, NOT `cols`/`rows` (trap 6). `apps/web`'s `RenderableGrid`
 * chose them verbatim from §3.4 in Story 1.8 precisely so this type would satisfy it structurally;
 * `GridRenderer`'s separate `{ cols, rows }` SIZE argument is a different thing and both spellings
 * are correct in their own place. Do not "unify" them.
 *
 * ⚠️ `occupant` is `Uint8Array` and `age` is `Uint16Array` — not the reverse, not both u8
 * (Decision B.5, which retired the earlier "age stays a Uint8Array" claim). `MAX_RELEVANT_AGE` is
 * `max(7, maxAgeLiteral + 1)` and rule age literals are schema-bounded to <= 65534, so a
 * `Uint8Array` age buffer would wrap silently at 256.
 *
 * ⚠️ `readonly` here is readonly on the PROPERTY, not the contents: `grid.occupant.fill(0)`
 * compiles. Every function in this package returns NEW buffers and a NEW wrapper, because an
 * in-place write freezes `<BattleEditorView>`'s identity-keyed `stats` memo and defeats the
 * canvas's `paintedGridRef.current === grid` skip — the dish shows one thing and the stats row
 * another, with nothing logged.
 *
 * INVARIANT, relied on rather than re-derived: `occupant.length === age.length === width * height`,
 * exactly. No pooling, no over-allocation. `computeEditorGridStats` (fixed in Story 2.14 for this
 * grid specifically) and `GridRenderer.assertGridMatchesSize` both treat it as a property of every
 * grid in circulation.
 */
export interface Grid {
  readonly width: number;
  readonly height: number;
  /**
   * Row-major occupancy. `0` = empty; `1..255` = an `OrganismRef`.
   *
   * ⚠️ **THE REF ENCODING — ratified as M14 (Sidiar, 2026-09-09).** A ref is the battle's roster
   * index **+ 1**, with slot 0 reserved for "empty" — `ref = index + 1`, `index = ref - 1`. This
   * is what the persisted dense `gridState` already means (RFC-001, `BattleSchema` validates
   * `v <= organismIds.length`), what `buildRefToFillGroup` allocates for (`size = roster length +
   * 1`), and what Epic 1 and Epic 2 ship. The competing reading — a ref IS the bare index — cannot
   * be true at the same time: under it `organisms[0]` is a real organism and collides with
   * occupant `0` = empty, and changing the shipped convention instead would mean migrating every
   * persisted battle.
   *
   * ⚠️ **Consequence for Story 3.5/3.6, stated where it can be read rather than re-derived:** a
   * roster lookup off a ref is `organisms[ref - 1]`, NEVER `organisms[ref]`. RFC-004 §2.1 and
   * §3.2 were corrected to match when M14 was minted — `resolveConflict` now reads
   * `deps.organisms[r - 1].dominance`. Getting this wrong is silent: the symptom is a Dominance
   * comparison against the WRONG organism, i.e. plausible battles and no failing test.
   */
  readonly occupant: Uint8Array;
  /** Cycles alive. NOT clamped or incremented here — `MAX_RELEVANT_AGE` is Story 3.4's, aging is Story 3.6's cycle-end step. */
  readonly age: Uint16Array;
}

// The dense at-rest encoding's ceiling: 255 organisms per battle (Decision G.3), derived from the
// Uint8Array occupant. Shared with `BattleSchema`'s `max(255)` and `MAX_ROSTER_SIZE` by value, not
// by import — @gol/domain must not become a dependency of the hot path for a literal.
const MAX_CELL_VALUE = 255;

// Exported for `resizeGrid`, whose errors must carry ITS parameter names (`cols`/`rows`), not
// `createGrid`'s — not part of the package barrel.
export function assertDimension(name: string, value: number): void {
  // `new Uint8Array(2.5)` throws, but `2.5 * 4` is 10 — a fractional dimension yields a
  // plausible-looking grid whose width no longer divides its buffer, so every row-major index
  // computed from it silently lands on the wrong cell. NaN and negatives fail the same way, later.
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${name} must be a non-negative integer, got ${value}`);
  }
}

/**
 * An all-empty grid at the given size — the one allocator every other constructor here goes
 * through, so `occupant.length === age.length === width * height` has a single place to be true.
 */
export function createGrid(width: number, height: number): Grid {
  assertDimension('createGrid: width', width);
  assertDimension('createGrid: height', height);

  const cells = width * height;
  return { width, height, occupant: new Uint8Array(cells), age: new Uint16Array(cells) };
}

/**
 * A fresh, all-empty grid at `grid`'s CURRENT dimensions — FR-3.7's Clear primitive.
 *
 * Clear does not resize, so the size is read off the input and never taken from a caller or a
 * constant. Allocated from `width * height` rather than from `grid.occupant.length`: the two are
 * equal for every grid this package builds, and reading the buffer length instead would propagate
 * an over-allocated input rather than normalising it.
 */
export function clearGrid(grid: Grid): Grid {
  return createGrid(grid.width, grid.height);
}

/**
 * Dense at-rest `number[][]` (RFC-001 / `BattleSchema.gridState`) -> typed runtime `Grid`.
 *
 * This is the dense->typed half of Cross-RFC Reconciliation #3, owned here rather than in
 * `@gol/persistence`: the typed `Grid` is RFC-004's and lives in this package, and a
 * `@gol/persistence -> @gol/simulation` edge would stop persistence being a leaf over
 * `@gol/domain` and reverse the direction the AR-2 DI seam exists to protect.
 *
 * `age` is allocated zero-filled because there is nowhere to read it from at this boundary: only
 * `initialGrid` is persisted (Decision A.7) and every initial grid is age-zero everywhere
 * (RFC-005 "Representation note").
 *
 * Validates eagerly and throws naming the offending cell. A `Uint8Array` coerces silently on
 * assignment — 256 lands as 0 (the cell vanishes as empty), -1 lands as 255 (a phantom organism at
 * a ref no roster covers), 1.9 truncates to 1 — so an unchecked write produces a plausible-looking
 * but wrong dish whose real defect surfaces three stories away from here.
 */
export function gridFromDense(dense: readonly (readonly number[])[]): Grid {
  const height = dense.length;
  const width = height > 0 ? dense[0].length : 0;

  const grid = createGrid(width, height);
  for (let row = 0; row < height; row++) {
    const line = dense[row];
    if (line.length !== width) {
      throw new Error(
        `gridFromDense: row ${row} has ${line.length} cells, expected ${width} (ragged input)`,
      );
    }
    for (let col = 0; col < width; col++) {
      const value = line[col];
      if (!Number.isInteger(value) || value < 0 || value > MAX_CELL_VALUE) {
        throw new Error(
          `gridFromDense: row ${row}, col ${col} has value ${value}, expected an integer ` +
            `in 0..${MAX_CELL_VALUE} (0 = empty, 1..${MAX_CELL_VALUE} = OrganismRef)`,
        );
      }
      grid.occupant[row * width + col] = value;
    }
  }
  return grid;
}

/**
 * Typed runtime `Grid` -> dense at-rest `number[][]` — the inverse of `gridFromDense`, and the
 * other half of Reconciliation #3's runtime boundary.
 *
 * ⚠️ `age` is DROPPED, not encoded. The dense form carries occupancy alone, and only `initialGrid`
 * is ever persisted (Decision A.7) — a live grid's ages are runtime state that nothing at rest has
 * a slot for. Round-tripping a live grid through here therefore loses age BY DESIGN; it is a
 * save/export conversion, not a clone.
 *
 * Each row is its own array — `Array(h).fill([])` would hand every row the same reference, so a
 * single cell write would write a whole column.
 *
 * ⚠️ A width > 0, height = 0 grid degrades to `[]`: the dense form keeps width only as row length,
 * so with zero rows there is nowhere to store it and `gridFromDense` reads `[]` back as 0x0.
 * Round-trip identity therefore holds for every grid with at least one row; Nx0 is unreachable
 * from the schema-bounded presets and is documented here rather than guarded.
 */
export function gridToDense(grid: Grid): number[][] {
  const { width, height, occupant } = grid;
  return Array.from({ length: height }, (_, row) =>
    Array.from({ length: width }, (_, col) => occupant[row * width + col]),
  );
}
