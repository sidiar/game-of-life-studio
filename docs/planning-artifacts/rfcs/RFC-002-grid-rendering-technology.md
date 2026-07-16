# RFC-002: Grid Rendering Technology Selection

**Status:** Approved
**Date:** 2026-06-05
**Approved:** 2026-07-13
**Author:** Architecture Team

## Summary

This RFC evaluates and selects the optimal rendering technology for the Game of Life Studio's grid visualization, which must run at 60 FPS at the **default 100×60 baseline** while displaying up to 20 different organisms. The solution must handle real-time updates, smooth animations, and interactive drawing operations while maintaining performance across different browsers and devices.

> **Grid sizing — see [Decision A](/docs/planning-artifacts/architecture.md#decision-a--size-parametric-grid-with-per-battle-dimensions-and-runtime-resize).** The grid is **size-parametric** (FR-8.10 presets 50×30 … 200×120; the 150×90/200×120 sizes occur only as ephemeral Play-mode expansion — H-9), not fixed at 100×60. The 100×60 / 6,000-cell figures below are the **performance baseline** (the guaranteed 60 FPS point), not a hardcoded dimension. The renderer is constructed with `(width, height)` parameters and auto-fits the whole grid to the canvas (`cellSize = floor(canvasPx / dimension)`); it re-lays-out and full-repaints on resize. Performance degrades gracefully above the baseline.

## Links

- [Main Architecture Document](/docs/planning-artifacts/architecture.md)
- [RFC-001: Multi-Mode Architecture](/docs/planning-artifacts/rfcs/RFC-001-multi-mode-architecture.md)
- [Product Requirements Document](/docs/planning-artifacts/prds/prd-GameOfLife-2026-05-26/prd.md) (FR-3, FR-4, NFR-1.1)
- [UX Design Specification](/docs/planning-artifacts/ux-designs/ux-GameOfLife-2026-05-27/ux-design-complete.md)

## Overview

### Purpose & Goals

**Primary Purpose:**
Select a rendering technology that can efficiently render and update a cellular automaton grid with multiple organism types while supporting user interactions and maintaining smooth animations.

**Goals:**
1. **Performance:** Achieve consistent 60 FPS for 100×60 grid (6,000 cells) with 20 organisms
2. **Interactivity:** Support real-time drawing/erasing with immediate visual feedback
3. **Visual Quality:** Smooth animations, clean grid lines, support for both themes
4. **Browser Compatibility:** Work on last 2 versions of Chrome, Firefox, Safari, Edge
5. **Memory Efficiency:** Minimize memory footprint and garbage collection pauses
6. **Developer Experience:** Maintainable code with good debugging tools

### Background

The Game of Life Studio presents unique rendering challenges:

**Performance Requirements:**
- **NFR-1.1:** 60 FPS during simulation with up to 20 organisms
- **NFR-4.2:** User interactions must provide immediate visual feedback (<100ms)
- Grid size: 100×60 cells (6,000 cells total)
- Each cell renders in one of ≤161 colour states (empty + ≤20 palette tokens in use × 8 age-shades). Rendering batches by **colour state** — key `(colorToken, ageShade)`, Decision B.2 — so the bound is palette-derived (RFC-007), not organism count: organisms can exceed 20 by reusing colours (arch M6), and a battle may roster up to 255 (arch G.3), without adding render states.
- Cells may have visual properties: color, aging saturation, grid lines

**Calculation:**
- At 60 FPS, we have ~16.67ms per frame
- Must evaluate rules, update state, and render within this budget
- With 6,000 cells, we have ~2.78 microseconds per cell

**Visual Requirements:**
- Cell colors from organism definitions
- Aging degradation (saturation changes over time)
- Grid lines (optional, toggleable)
- Cell animations (pulsing, optional)
- Hover effects for Battle Gallery tiles
- Support for two themes (Clinical Lab and Biotech Terminal)

### The Rendering Challenge & Performance Budget

**The Rendering Challenge:**

Traditional DOM-based approaches (React components per cell) would create 6,000+ DOM elements, leading to:
- Massive memory overhead
- Slow updates requiring React reconciliation
- Poor performance during rapid state changes
- Browser reflow/repaint bottlenecks

Canvas-based approaches provide direct pixel manipulation but require careful optimization to maintain performance. The key challenge is balancing rendering performance with code maintainability and feature flexibility.

**Performance Budget Breakdown:**
```
16.67ms total frame budget (60 FPS)
├── ~6ms: Simulation engine (rule evaluation, conflict resolution)
├── ~8ms: Rendering (drawing cells, grid lines)
├── ~2ms: State management and React updates
└── ~0.67ms: Buffer for GC and browser overhead
```

### High Level Design Proposal

#### Recommended Solution: HTML5 Canvas 2D with Optimizations

**Decision:** HTML5 Canvas API with double buffering and dirty rectangle optimization

**Architecture:**
```typescript
// Core rendering architecture
class GridRenderer {
  private canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D
  private offscreenCanvas: HTMLCanvasElement
  private offscreenCtx: CanvasRenderingContext2D
  private cellSize: number
  private dirtyRegions: Set<CellCoordinate>

  constructor(width: number, height: number) {
    // Main canvas (visible)
    this.canvas = document.createElement('canvas')
    this.ctx = this.canvas.getContext('2d', {
      alpha: false,  // No transparency needed
      desynchronized: true  // Hint for better performance
    })

    // Offscreen canvas for double buffering
    this.offscreenCanvas = document.createElement('canvas')
    this.offscreenCtx = this.offscreenCanvas.getContext('2d')

    this.calculateCellSize(width, height)
    this.setupCanvasSize()
  }

  // `grid` is RFC-004 §3.4's typed-array shape: { width, height, occupant: Uint8Array, age: Uint16Array }.
  // `refToGroup` is the per-battle OrganismRef → fill-group LUT (colour-state batching, Decision B.2 / §3).
  render(grid: Grid): void {
    // Only redraw dirty regions
    if (this.dirtyRegions.size === 0) return

    // Draw to offscreen canvas
    this.renderDirtyRegions(this.offscreenCtx, grid)

    // Copy to main canvas in one operation
    this.ctx.drawImage(this.offscreenCanvas, 0, 0)

    this.dirtyRegions.clear()
  }

  private renderDirtyRegions(ctx: CanvasRenderingContext2D, grid: Grid): void {
    // Batch by displayed colour state — key (colorToken, ageShade), Decision B.2 / §3
    const cellsByColor = groupByColourState(grid, this.refToGroup)

    for (const [color, cells] of cellsByColor) {
      ctx.fillStyle = color
      ctx.beginPath()

      for (const cell of cells) {
        const x = cell.col * this.cellSize
        const y = cell.row * this.cellSize
        ctx.rect(x, y, this.cellSize, this.cellSize)
      }

      ctx.fill()
    }
  }
}
```

**Optimization Strategies:**

**1. Double Buffering:**
```typescript
// Prevents flicker by drawing to offscreen canvas first
class DoubleBufferedRenderer {
  private bufferA: HTMLCanvasElement
  private bufferB: HTMLCanvasElement
  private activeBuffer: 'A' | 'B' = 'A'

  render(grid: Grid): void {
    const buffer = this.activeBuffer === 'A' ? this.bufferA : this.bufferB
    const ctx = buffer.getContext('2d')

    // Draw entire frame to inactive buffer
    this.drawGrid(ctx, grid)

    // Swap buffers
    this.swapBuffers()

    // Copy to main canvas
    this.mainCtx.drawImage(buffer, 0, 0)
  }
}
```

**2. Dirty Rectangle Tracking:**
```typescript
class DirtyRegionTracker {
  private dirtyMap: Map<string, DirtyRect>

  markDirty(row: number, col: number): void {
    // Group adjacent cells into rectangles
    const region = this.getOrCreateRegion(row, col)
    region.expand(row, col)
  }

  getDirtyRegions(): DirtyRect[] {
    // Merge overlapping regions
    return this.mergeRegions([...this.dirtyMap.values()])
  }

  clear(): void {
    this.dirtyMap.clear()
  }
}
```

**3. Batch Rendering by Colour State (`colorToken` × age-shade) — see [Decision B](/docs/planning-artifacts/architecture.md#decision-b--visual-aging-via-colour-batched-age-shades-age-is-engine-state):**

Cells are batched by **displayed colour state**, not by organism (Decision B.2, revised per adversarial finding #6). `displayColor` is a pure function of `(colorToken, ageShade)` (RFC-007), so organisms sharing a palette token render identically and **fold into the same fill group** — which is what lets organism count exceed the palette (arch M6) and the roster reach 255 (arch G.3) without adding render states. The batch key is `(colorToken, min(age, 7))` for organisms with *visual aging* (FR-2.4 / FR-5.7); a non-aging organism renders at its token's base colour — RFC-007's full-saturation age-cap entry — so it keys as `(colorToken, 7)`. Worst case ≤ 20 tokens × 8 shades = **160 fill groups**, palette-derived and independent of organism count.

```typescript
// Instead of a per-cell fillStyle change… batch by colour state: organisms sharing a palette
// token fold into one group (Decision B.2 — the bound is the palette, not the roster).
// `refToGroup` is a per-battle OrganismRef → (tokenIndex, agingEnabled) LUT built at simulation
// start; `displayColor` is the RFC-007 per-battle precomputed LUT (h, l from the palette entry):
//   ageShade   = agingEnabled ? min(age, 7) : 7               // visual cap (FR-5.7); non-aging = base = age-cap colour (RFC-007)
//   saturation = 0.30 + 0.10 * ageShade                       // S from age; H & L from the palette token (RFC-007)
const cellsByGroup = groupByColourState(grid, refToGroup)      // key: (colorToken, ageShade) — ≤ 20 × 8 = 160 groups
for (const [key, cells] of cellsByGroup) {
  ctx.fillStyle = displayColor(key)   // one state change per group
  ctx.beginPath()
  for (const cell of cells) ctx.rect(cell.x, cell.y, size, size)
  ctx.fill()                          // one draw call per group
}
```

> **Age is engine state, not a render artefact (Decision B).** The renderer only *reads* the engine's `age` array (RFC-004) to pick a shade — the same array the rules engine reads for "Age of Cell" conditions (FR-2.5); it adds no aging logic of its own. A cell is marked **dirty on occupant change OR age-shade change**, the latter bounded to a cell's first 7 cycles (after which its shade is stable).

**4. Grid Data Structure:**
```typescript
// Memory-efficient representation
class GridState {
  // Flat typed array for cache-friendly access
  private cells: Uint8Array  // 6,000 bytes for 100×60
  private width: number
  private height: number

  constructor(width: number, height: number) {
    this.width = width
    this.height = height
    this.cells = new Uint8Array(width * height)
  }

  getCell(row: number, col: number): number {
    return this.cells[row * this.width + col]
  }

  setCell(row: number, col: number, organismId: number): void {
    this.cells[row * this.width + col] = organismId
  }
}
```

**5. RequestAnimationFrame Loop (tick rate decoupled from render rate — see [Decision D](/docs/planning-artifacts/architecture.md#decision-d--one-canonical-speed-scale-gensec--tickrender-decoupling)):**

The RAF loop renders at the display rate (≤60 FPS); a **time accumulator** advances the *simulation* independently — one `step()` per `msPerCycle` (= `1000 / genPerSec`, from the FR-4.2 ladder, max 20 gen/sec). Because the speed cap keeps `msPerCycle ≥ 50 ms ≥` one frame, there is **never more than one step per frame**. **`delta` is clamped to `msPerCycle` before it enters the accumulator** (adversarial finding #11): after a tab suspension or long GC pause `delta` can be tens of seconds, and unclamped it would drain as a multi-second fast-forward burst the user never asked for — clamped, a resumed tab advances **at most one step**. The clamp also fixes the failure direction under sustained jank: time the loop cannot keep up with is *dropped* (effective gen/sec falls — Decision D.4's graceful degradation), never *banked* to replay as a burst. This is also what keeps the single `if` safe against a well-meaning "fix" into a `while`: the accumulator can never hold more than one cycle.

```typescript
class SimulationRenderer {
  private rafId = 0
  private lastTime = 0
  private accumulator = 0
  private msPerCycle = 100          // 10 gen/sec default; read from a ref → live speed change (FR-4.2)

  private rafLoop = (timestamp: number): void => {
    const delta = timestamp - this.lastTime
    this.lastTime = timestamp

    // Advance the simulation on its own cadence, independent of the frame rate.
    // CLAMP (finding #11): a suspended tab / long GC pause makes delta huge; unclamped it would
    // drain as a fast-forward burst. Clamped, resume costs at most ONE step; time the loop can't
    // keep up with is dropped (graceful degradation, Decision D.4), never banked.
    this.accumulator += Math.min(delta, this.msPerCycle)
    if (this.accumulator >= this.msPerCycle) {
      this.accumulator -= this.msPerCycle              // ≤1 step/frame (msPerCycle ≥ 50 ms ≥ frame)
      this.simulation.step()
      this.renderer.render(this.simulation.getGrid())  // repaint only after a step (dirty regions)
    }
    // Slow speeds: many frames pass with no step → no repaint needed (grid unchanged).

    this.rafId = requestAnimationFrame(this.rafLoop)
  }
}
```

On larger grids, if a `step()` exceeds the frame budget the effective gen/sec drops (graceful degradation, Decision A); the loop structure is unchanged.

> **Static one-shot render (M4 — Gallery thumbnails, FR-7.2).** The same `GridRenderer` also exposes a single, loopless `renderStatic(grid)` used for **Gallery tile thumbnails** — rendered on demand from each battle's `initialGrid`, **never stored** (zero quota cost, never stale) — and for the Organism Editor preview's paused frames. No RAF, no dirty-tracking: one draw at a small auto-fit cell size.

**6. Web Worker for Simulation (Optional Enhancement):**
```typescript
// main.ts
const worker = new Worker('./simulation.worker.js')
const renderer = new GridRenderer()

worker.onmessage = (e: MessageEvent) => {
  const { grid, changedCells } = e.data
  renderer.updateCells(changedCells)  // Only update what changed
}

// simulation.worker.ts
let grid = new Uint8Array(6000)

self.onmessage = (e) => {
  const { type } = e.data

  if (type === 'STEP') {
    const changedCells = simulationStep(grid)

    // Transfer ownership for zero-copy
    self.postMessage({ grid, changedCells }, [grid.buffer])
  }
}
```

### Risks & Mitigations

**Risk 1: Canvas Performance on Low-End Devices**
- **Risk:** Older devices might struggle with 6,000 cells at 60 FPS
- **Mitigation:**
  - Graceful degradation per Decisions A.4/D.4: reduce effective **gen/sec first, then render FPS** — the loop structure is unchanged, and the delta clamp (§5) means slow devices lose time rather than banking catch-up bursts.
  - Dirty-region rendering already bounds per-frame work to changed cells; smaller grid presets (50×30 — Decision A) explicitly support low-end devices.
  - Web Worker simulation remains the documented escape hatch (§6, post-MVP).
  - *(Viewport culling was previously listed here — removed: it contradicts A.5's always-whole-grid auto-fit and Alternative 5's own rejection rationale, "the grid fits entirely on screen.")*

**Risk 2: Browser Canvas Implementation Differences**
- **Risk:** Canvas performance varies across browsers
- **Mitigation:**
  - Extensive cross-browser testing
  - Feature detection for optimal paths
  - Fallback rendering modes if needed

**Risk 3: Memory Pressure from Double Buffering**
- **Risk:** Two full-size canvases might cause memory issues
- **Mitigation:**
  - Use single buffer on mobile/tablets
  - Monitor memory usage and adapt
  - Clear unused canvases immediately

**Risk 4: Grid Line Rendering Performance**
- **Risk:** Drawing `cols + rows` grid lines per frame (160 at 100×60, up to 320 at 200×120 — Decision A)
- **Mitigation:**
  - Render grid lines to separate static canvas
  - Composite only when needed
  - Cache grid overlay

**Risk 5: Touch Input Latency**
- **Risk:** Touch drawing might feel laggy
- **Mitigation:**
  - Predictive touch path rendering
  - Separate input handling from render loop
  - Use pointer events API for unified handling

### Alternatives Considered

**Alternative 1: WebGL (via Three.js or raw)**
- **Pros:**
  - GPU acceleration for massive parallelization
  - Shaders for complex effects (aging, glow)
  - Handles 100,000+ cells easily
- **Cons:**
  - Complex setup and maintenance
  - Overkill for 6,000 cells
  - Harder debugging
  - Larger bundle size
- **Rejected because:** Unnecessary complexity for grid size, team lacks WebGL expertise

**Alternative 2: CSS Grid with React Components**
```typescript
// What we're avoiding:
function Grid() {
  return (
    <div className="grid">
      {cells.map(cell => (
        <Cell key={cell.id} organism={cell.organism} />
      ))}
    </div>
  )
}
```
- **Pros:**
  - Simple React patterns
  - Easy debugging
  - CSS handles layout
- **Cons:**
  - 6,000 DOM elements
  - React reconciliation overhead
  - Terrible performance (measured: ~8 FPS)
- **Rejected because:** Performance completely inadequate

**Alternative 3: SVG with D3.js**
```typescript
// SVG approach
d3.select('#grid')
  .selectAll('rect')
  .data(cells)
  .join('rect')
  .attr('fill', d => d.color)
```
- **Pros:**
  - Declarative, clean API
  - Good for data visualization
  - Vector graphics scale well
- **Cons:**
  - Still creates DOM elements
  - D3 overhead unnecessary
  - Poor performance for rapid updates
- **Rejected because:** SVG DOM overhead similar to HTML elements

**Alternative 4: PixiJS (2D WebGL wrapper)**
```typescript
// PixiJS approach
const app = new PIXI.Application()
cells.forEach(cell => {
  const sprite = PIXI.Sprite.from(texture)
  sprite.tint = cell.color
  app.stage.addChild(sprite)
})
```
- **Pros:**
  - WebGL performance with easier API
  - Built-in optimizations
  - Good for complex animations
- **Cons:**
  - Large dependency (~370KB minified)
  - Learning curve
  - More than needed
- **Rejected because:** Bundle size cost not justified for grid rendering

**Alternative 5: Virtual Canvas (Custom Implementation)**
```typescript
// Only render visible viewport
class VirtualCanvas {
  renderViewport(viewport: Rect): void {
    const visibleCells = this.getVisibleCells(viewport)
    // Only draw ~1,000 cells instead of 6,000
  }
}
```
- **Pros:**
  - Renders subset of grid
  - Better for huge grids
  - Memory efficient
- **Cons:**
  - Complex scrolling logic
  - Grid is only 100×60 (fits on screen)
  - Unnecessary optimization
- **Rejected because:** Grid fits entirely on screen, virtualization adds complexity without benefit

---

**Status:** Approved (2026-07-13)
**Next Steps (implementation):**
1. Benchmark Canvas 2D prototype with full simulation
2. Test on target browsers and devices
3. Measure actual FPS and optimization impact
4. Create performance test suite