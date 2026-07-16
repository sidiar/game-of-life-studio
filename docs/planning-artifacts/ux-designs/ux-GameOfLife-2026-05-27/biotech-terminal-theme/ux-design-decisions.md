# UX Design Decisions - Game of Life Studio
**Date:** 2026-05-27
**Feature:** Battle Gallery (Home Page)

## Design Direction: Biotech Terminal

### Visual Style
- **Theme:** Command-line interface meets cellular biology with matrix-inspired green phosphor aesthetic
- **Aesthetic:** Dark mode, modern, technological with chemistry/biology lab elements
- **Typography:** Monospace fonts ('Courier New', Courier)
- **Primary Colors:**
  - Background: Pure black (#000000)
  - Accent: Matrix green (#00ff41)
  - Secondary: Cyan (#00ffff)
  - Borders: Terminal green (#1a3a1a)

### Key Design Features

#### Battle Tile Layout
- **Petri Dish Visualization:** Each battle is displayed as a petri dish with grid pattern
- **Organism Clusters:** Colored cell clusters representing different organisms
- **Generation Counter:** `GEN_XXX` badge showing how many iterations the battle has run
- **Metadata:** Date and participant color indicators at bottom

#### Hover Interaction - Data Scan Sweep
- **Effect:** Animated horizontal scanning beam sweeps across tiles
- **Timing:**
  - Starts 3 seconds after hover begins
  - Repeats every 8 seconds during hover
  - Sweep duration: ~2.5 seconds (preserves scan effect)
- **Visual:** Green-to-cyan gradient sweep simulating terminal data analysis
- **Purpose:** Creates "terminal analyzing data" effect, reinforces biotech lab aesthetic

### Design Rationale
- **Technical Precision:** Monospace typography and glowing borders evoke both computer terminals and laboratory equipment readouts
- **Scientific Context:** Petri dish visualization connects cellular automata to biological experiments
- **Professional Density:** Technical density and subtle animations create high-tech research environment
- **Scanline Effect:** Hover animation reinforces the feeling of active data analysis

### Implementation Files
- **Battle Gallery Page:** `battle-gallery.html` (complete, with navigation)
- **Settings Page:** `settings.html` (workspace management, preferences)
- **Working Explorations:** `.working/` directory (4 direction options, 3 hover variations, iterations)

### Design Alternatives Considered
1. **Clinical Lab** - Rejected: Too sterile
2. **Midnight Research** - Rejected: Not technical enough
3. **Atomic Structure** - Rejected: But hover gradient concept was incorporated
4. **Biotech Terminal** - ✅ **SELECTED**

### Hover Effect Alternatives Considered
1. **Radial Gradient** - Rejected: "Microscope" effect didn't fit
2. **Data Scan Sweep** - ✅ **SELECTED** (with custom timing)
3. **Backlit Gradient** - Rejected: Too subtle

### Technical Notes
- All tiles maintain exact original styling from Biotech Terminal direction
- Animation uses CSS keyframes with z-index layering for proper content stacking
- Generation counter will need backend implementation to track simulation steps
- Organism colors are vibrant (#ff0055, #00aaff, #00ff41, etc.) for clear differentiation

### Next Steps
- [ ] Implement responsive design specifications
- [ ] Define organism library page design
- [ ] Design battle detail/playback view
- [ ] Create lab/experiment creation flow
