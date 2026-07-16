---
title: Game of Life Studio PRD
status: draft
created: 2026-05-26
updated: 2026-06-01
---

# Game of Life Studio PRD

## Overview

Game of Life Studio is an interactive cellular automata simulator that brings Conway's classic Game of Life into a new dimension: **multi-organism ecological competition**. Users create custom life forms with unique survival rules and watch them compete for space and resources in real-time, exploring emergence, dominance, extinction, and equilibrium through visual experimentation.

**About This PRD:** This document is intentionally rigorous to demonstrate **Spec-Driven Development (SDD)** methodology as part of a portfolio showcase. While the product itself is a hobby/learning project, the PRD exemplifies disciplined AI-assisted development practices: detailed functional requirements with testable acceptance criteria, explicit architectural decisions, and comprehensive documentation—all designed to feed cleanly into downstream UX design, architecture, and story creation phases.

## User Journey

### UJ-1: David Experiments with Multi-Organism Competition

**David** is a 13-year-old curious kid fascinated by science—especially biology and chemistry. He loves creating games and experimenting with systems. He's heard about Game of Life Studio and wants to create different life forms, configure their interactions, and watch what happens.

**Opening the Studio**

David opens Game of Life Studio in his browser. He lands on the **Battle Gallery**—a clean home page with a large "Create Your First Battle" button. No tutorial—the interface is self-explanatory.

**Creating Organisms**

David clicks **"Create Your First Battle"** and is taken to the Petri Dish workspace in Edit Mode. He notices an **Organism Library** button in the sidebar and clicks it to see what's available. The library shows one pre-loaded organism: **"Conway's Classic"** with standard Game of Life rules.

David decides to create his own. He clicks **"Create New Organism"** and defines three custom organisms:

1. **"Aggressive Colonizer"** — Fast reproducer, high Dominance, bright red
   - Survival Rules: Born if empty cell + 3 neighbors, Survives if 2-3 neighbors
   - Dominance: 8
   - Aging degradation: No (stays vivid red)

2. **"Patient Defender"** — Slow grower, moderate Dominance, cool blue
   - Survival Rules: Born if empty cell + 3-4 neighbors, Survives if 3-5 neighbors
   - Dominance: 5
   - Aging degradation: Yes (cells fade in — pale when born, saturation deepening as they age)

3. **"Chaotic Spreader"** — Unpredictable expansion, low Dominance, bright green
   - Survival Rules: Born if empty cell + 2-3 neighbors, Survives if 1-4 neighbors
   - Dominance: 3
   - Aging degradation: No

For each organism, David uses the **Organism Editor** to define its name, Dominance value, color, aging toggle, and Survival Rules. He sorts the rules to establish evaluation priority. The **Initial State & Preview Panel** lets him test each organism in isolation before using it in the Battle.

**Setting Up the Battle**

Back in the **Petri Dish in Edit Mode**, David sees his three new organisms available in the **Organism Dropdown**. He selects "Aggressive Colonizer" and click-drags to paint a cluster of red cells in the top-left corner. He switches to "Patient Defender" and paints a blue formation in the bottom-right. Finally, he adds scattered green "Chaotic Spreader" cells across the middle.

He clicks the **Reset** button once to clear a mistake, then redraws. He names his scenario **"Triple Threat"** in the Battle name field at the top.

**Running the Simulation**

David toggles to **Play Mode**. The interface shifts: Edit controls disappear, replaced by simulation controls:
- **Play/Pause** button
- **Speed** slider (pre-set to recommended speed)
- **Next** button (step one cycle at a time)
- **Stop** button (return to initial state)
- **Cycle Counter** showing current cycle number
- **Population Stats**: Horizontal bars showing Red: 45, Blue: 32, Green: 12

David hits **Play**. The simulation runs. Red explodes outward aggressively. Green spreads chaotically but loses territory when it collides with Red. Blue holds its corner, slowly expanding with its more conservative survival rules.

By cycle 50, Green is extinct (its population bar shows a skull icon at the bottom). Red dominates 60% of the grid. Blue holds a stable territory in the corner.

David hits **Pause**, curious. He uses **Next** to step through a few cycles frame-by-frame, watching the exact moment Blue's territory stops shrinking. He notes the pattern: Blue's stricter survival rules (3-5 neighbors) help it maintain stable formations.

**Saving the Battle**

This is fascinating! David wants to save this setup. He clicks the **Back** button at the top, and the system prompts: "You have unsaved changes. Save before leaving?" He clicks **"Save Battle"**.

David returns to the **Battle Gallery**. His "Triple Threat" Battle now appears as a tile showing:
- The Battle name "Triple Threat"
- A miniature static snapshot of his initial red/blue/green configuration
- When he hovers, he sees: "Created today • Uses: Aggressive Colonizer, Patient Defender, Chaotic Spreader"

**Iterating with a New Variant**

David wants to try a variation. Instead of editing "Triple Threat," he decides to create a new Battle to compare approaches. He clicks **"Create New Battle"** from the Gallery.

In the new Battle workspace, David notices his three custom organisms are already available in the **Organism Library** (since the library is shared across all Battles). He doesn't need to recreate them.

He sets up a different starting configuration: this time, he edits "Chaotic Spreader" in the Organism Library—increasing its Dominance to 6 and making its survival rule slightly more conservative. He then paints a denser Green cluster in the center, with Red and Blue on opposite sides.

He names this Battle **"Triple Threat v2"** and clicks **Save** after testing the simulation. Now when he returns to the Gallery, he sees both Battle tiles side by side.

**Exploring and Sharing**

David clicks on the **"Triple Threat"** tile to reopen it in Play Mode. The simulation runs immediately from the saved initial state. He watches the same fascinating Red vs. Blue standoff again.

He switches to **Edit Mode** to adjust the starting positions slightly, then clicks **"Run Battle Simulation"** to see how the small change affects the outcome.

Later, David wants to show his friend. He opens "Triple Threat v2", clicks **Export**, and chooses **"Export this Battle only"**. The system downloads `triple-threat-v2.json`. He can now share this file. When his friend imports it, the app warns that importing will replace their current workspace and offers to export their own work first; once the friend confirms, they see the exact same setup. *(In this MVP, import always replaces the whole workspace — a merge/add import and side-by-side workspaces are deferred, see Non-Goals.)*

**Customizing the Look**

While browsing the Battle Gallery, David notices a **Settings** icon in the main navigation. Curious, he clicks it and explores the options. He finds **Display Preferences** with a **Theme Selection** dropdown showing two options: "Clinical Lab" (currently selected) and "Biotech Terminal."

Intrigued by the name, David selects **"Biotech Terminal"**. The interface immediately transforms—the clean cyan accents shift to bright matrix-green, the typography becomes monospace, and the whole aesthetic takes on a hacker-terminal vibe. David grins. "This looks way cooler," he thinks.

He returns to the Gallery (the theme persists across all pages) and opens "Triple Threat" again. The simulation now runs with the new green aesthetic. The organism cells still show their distinct red, blue, and green colors, but the UI around them has that terminal feel he loves from sci-fi movies.

David experiments with switching back to "Clinical Lab" to compare. He notices the Clinical Lab theme is easier to read for long sessions, but Biotech Terminal is more fun. He settles on Biotech Terminal and closes Settings, satisfied that his Battle studio now matches his personal style.

**Discovering More**

David has spent 45 minutes experimenting, saving multiple variants, and discovering emergent behavior. He's created a small collection of Battles in his Gallery, each exploring different competitive scenarios. He starts imagining new ideas: "What if I add a fourth organism that only survives in the gaps between others?" He's had fun, learned about competition dynamics, and can't wait to show his friends his entire Battle collection.

## Functional Requirements

### FR-1: Organism Library & Management

**FR-1.1: View Organism Library**
The system shall display a list of all created organisms, showing each organism's name and a visual indicator (color).

**FR-1.2: Create New Organism**
The system shall allow users to create a new organism by opening the Organism Editor with default values (empty name, default Dominance, no rules defined).
- **Acceptance Criteria:** Organism creation is not capped by the color palette (colors are reusable per FR-2.3); it is bounded only by storage capacity (NFR-7.2).

**FR-1.3: Edit Existing Organism**
The system shall allow users to edit any existing organism by opening the Organism Editor populated with the organism's current configuration. Editing can be initiated from the Organism Library or directly from the Battle Editor (FR-3.12).
- **Acceptance Criteria:** If the organism is used in one or more Battles, the system shall display a warning: "This organism is used in [N] Battle(s). Editing it will affect all Battles that use it. Clone this organism first to create a Battle-specific variant?" The "[N] Battle(s)" count is expandable to reveal which Battles per FR-1.7.
  - **From the Organism Library**, the warning offers **Edit Anyway** (edit the shared organism) or **Clone & Edit** (clone via FR-1.6, then edit the new variant).
  - **From the Battle Editor** (FR-3.12), the warning offers **Edit Anyway** or **Cancel** only — there is **no Clone & Edit** and no grid rebinding. The open Battle counts toward "[N] Battle(s)"; editing affects all Battles that use the organism. To make a Battle-specific variant, clone the organism in the Library (FR-1.6) and select the clone in the Organism Dropdown.

**FR-1.4: Delete Organism**
The system shall allow users to delete an organism from the Library only when it is not referenced anywhere in the workspace.
- **Acceptance Criteria:**
  - The system shall check organism usage across the **entire workspace** — the current Petri Dish grid, **every saved Battle**, **and every other organism's Survival Rules** (an Organism Type condition targeting the organism is a reference — see rule-reference accounting below) — not just the open grid.
  - If the organism is used in one or more Battles (or is placed on the current grid), deletion is **blocked with a validation error** that names the count and the specific Battles and states the remedies, e.g.: "Cannot delete [Organism Name] — it is used in [N] Battle(s): [Battle names]. Remove it from those Battles, or delete the Battles, then try again." The Battle list follows FR-1.7.
  - **Current-Battle accounting:** the open (current) grid counts as one entry in the usage list and toward "[N] Battle(s)"; it is labeled by its Battle name, or **"Current Battle (unsaved)"** if it has not yet been named/saved. When the current grid is a usage, its remedy is to **erase the organism from the current grid** (not "remove it from a saved Battle"). If the current grid is the **only** usage, the error states just that remedy, e.g.: "Cannot delete [Organism Name] — it is placed on the current grid. Erase it from this grid, then try again." If the open Battle is already **saved**, its live-grid usage and its saved-index entry are collapsed to **one** list entry (same Battle id), but the organism counts as used by that Battle if **either** source references it — a **union**, never live-overrides-saved. This is what preserves the integrity guarantee below: unsaved edits that erase the organism from the open grid do **not** drop the still-persisted saved reference, so deletion stays blocked until the Battle is actually saved without it. In that specific case — the only blocking usage is the open, already-saved Battle whose live grid no longer places the organism — neither "erase from the current grid" (already done) nor "remove from those Battles" (already done, just unsaved) applies, so the error's remedy is to **save this Battle to persist the removal, then try again**.
  - **Rule-reference accounting:** an organism is also referenced when **another organism's Survival Rules target it** via an Organism Type condition (FR-2.5). Such references block deletion just like Battle usage; the validation error names the referencing organisms and states the remedy, e.g.: "Cannot delete [Organism Name] — it is targeted by rules of [M] organism(s): [Organism names]. Edit those rules to remove the reference, then try again." An organism's **own** rules do not block its deletion (self-references are deleted with the organism).
  - Deletion is permitted only when the usage count is **zero** — i.e. the organism is in no saved Battle, not on the current grid, and targeted by no other organism's rules (the inputs to the accounting above); the system then shows a standard confirmation ("Are you sure you want to delete [Organism Name]?").
  - **Protected system organism:** the pre-loaded **Conway's Classic** (FR-1.5) cannot be deleted regardless of usage; its Delete action is disabled/blocked with an explanatory message (e.g. "Conway's Classic is a built-in organism and can't be deleted"). This guarantees the FR-1.5 "always present" invariant against deletion.
  - **Referential-integrity guarantee:** because deletion is blocked while the organism is referenced, no saved Battle **or Survival Rule** can hold a dangling organism reference; a dangling-reference load state is therefore unreachable through normal use.

**FR-1.5: Pre-loaded Organism**
The system shall include one pre-loaded organism: **Conway's Classic** with standard Game of Life rules (Born: 3 neighbors, Survive: 2-3 neighbors), a default **Dominance of 50** (mid-range of the 1–100 scale, FR-2.2), and aging degradation disabled by default. These seeded values are the baseline against which FR-8.4's "unmodified default" check compares.
- **Acceptance Criteria:**
  - Conway's Classic is **always present** in the workspace and **cannot be deleted** (FR-1.4).
  - The pre-loaded organism is (re)seeded whenever the application initializes or replaces the workspace — first run, **Clear All Data** (FR-8.5), and **Import** (FR-8.4; re-added if the imported file does not contain it) — so the invariant holds through all normal use.
  - The system does **not** defend against out-of-band manual edits to the stored JSON (e.g. a hand-removed default); such tampering is out of scope and requires no additional handling.

**FR-1.6: Clone Organism**
The system shall allow users to clone an existing organism, creating a copy with the same configuration that can be independently edited.
- **Acceptance Criteria:**
  - Cloned organism receives a default name like "[Original Name] (Copy)" to distinguish it from the source.
  - The clone reuses the source organism's color (colors are reusable per FR-2.3); cloning is not capped by the palette, only by storage (NFR-7.2).
  - A clone is an ordinary Library organism, managed manually — used, or deleted per FR-1.4; the system does not auto-remove zero-reference organisms.

**FR-1.7: Organism Usage Visibility**
The system shall let users see which Battles use an organism wherever an organism's usage count is surfaced — the FR-1.3 edit warning, the FR-1.4 delete error, and a persistent **"Used in [N] Battle(s)"** indicator in the Organism Editor footer. Where other organisms' rules target the organism (FR-1.4 rule-reference accounting), the same surfaces also show a **"Targeted by [M] organism rule(s)"** count.
- **Acceptance Criteria:**
  - The "[N] Battle(s)" count is an affordance that, on click, opens a popover listing the **names of the Battles** that use the organism.
  - **Rule references:** when other organisms' rules target the organism (FR-1.4 rule-reference accounting), the popover shows a second read-only section listing the **names of the organisms whose rules target it** — with the same read-only, no-navigation behavior as the Battle list.
  - The list is **read-only** (names only; it does not navigate away) at every surface it appears — the FR-1.3 edit warning, the FR-1.4 delete error (including when initiated from the Library), and the editor footer indicator alike. Read-only applies uniformly so inspecting usage never abandons in-progress work; it is *strictly required* in the modal-over-Battle case (FR-3.12), where navigating to a listed Battle would discard the unsaved current grid.
  - The open (current) Battle is included in the list and the count when it uses the organism; if it has not yet been named/saved it appears as **"Current Battle (unsaved)"** (see FR-1.4 current-Battle accounting). It appears **once**: if the open Battle is already saved, its live-grid usage and saved-index entry are collapsed to a single entry (same Battle id), and the organism counts as used by that Battle if **either** references it (union).
  - Usage is the **union** of the **saved-workspace** index (`organism→Battles`) and the **live current grid** (read directly from the open grid, since unsaved edits are not yet reflected in the saved index): a Battle counts as a usage if **either** source references the organism, and the two are merged/deduplicated by Battle id so no Battle is listed twice **and no saved-side reference is ever dropped**. This same union backs the count wherever it is surfaced — the FR-1.3 edit warning, the FR-1.4 delete check, and this FR-1.7 list alike — so the open (possibly-unsaved) Battle counts uniformly at every surface. An organism referenced by no saved Battle and absent from the current grid shows "Used in 0 Battles" with no expansion.

### FR-2: Organism Editor

**FR-2.1: Edit Organism Name**
The system shall allow users to enter a text name for the organism (e.g., "Aggressive Colonizer").

**FR-2.2: Edit Dominance Value**
The system shall allow users to set a Dominance value (numeric, range 1-100) that determines conflict resolution priority when multiple organisms compete for the same cell.
- **Acceptance Criteria:** Higher Dominance wins conflicts.

**FR-2.3: Set Organism Color**
The system shall allow users to select a color from a pre-set palette (currently 20 colors, developer-extensible) for the organism's visual representation on the grid.
- **Acceptance Criteria:**
  - The full palette is always selectable; colors may be reused across organisms
  - Selecting a color already used by another organism is permitted but displays a non-blocking warning (e.g. "[Organism Name] already uses this color"); a new organism defaults to the next unused color for convenience. Once every palette color is already in use (more organisms than palette colors — allowed, since count is uncapped), the default falls back to the **least-used** color (the one currently referenced by the fewest organisms; ties broken by palette order). The warning is raised only for a user's explicit color **selection**; the system-assigned default (whether next-unused or least-used) does not itself raise it
  - The palette does not cap the number of organisms; organism count is bounded only by storage (NFR-7.2), so Create New (FR-1.2) and Clone (FR-1.6) never run out of a color to assign
  - Palette colors are selected by swatch/name, are chosen for distinguishability (including for color-blind users, NFR-8.3), and are identical across themes

**FR-2.4: Toggle Aging Degradation**
The system shall allow users to enable/disable aging degradation (cells increase saturation as they age).
- **Acceptance Criteria:**
  - A per-organism Enabled/Disabled toggle.
  - When enabled, cells render with the age-based saturation transform of FR-5.7 (30% at age 0 → 100% by age 7); when disabled, cells render at full saturation regardless of age.
  - This toggle affects visual rendering only; cell-age tracking (FR-5.6) is unaffected — age remains engine state and a rule input whether or not the visual effect is shown.

**FR-2.5: Define Survival Rules**
The system shall allow users to create multiple survival rules. Each rule specifies:
- **Summary:** User-defined text description (e.g., "Death by overpopulation")
- **Action:** Born, Die, or Survive
- **Conditions:** One or more property-operand-value expressions evaluated with AND logic

**Available Properties:**
- **Cell State** — Whether the evaluated cell is Empty, Alive (your organism), or Occupied (another organism). Tooltip: "The current state of this cell."
- **Organism Type** — Which specific organism occupies this cell (only relevant when Cell State = Occupied). Tooltip: "Which organism is in this cell (when occupied by another organism)."
- **Age of Cell** — How long this cell has been alive (in cycles). Tooltip: "How long this cell has been alive (in cycles)."
- **Neighbor Count** — Count of neighboring cells occupied by YOUR organism type. Tooltip: "Number of neighbors that are the same organism as yours."
- **Occupant Neighbor Count** — Count of neighboring cells occupied by OTHER organism types. Tooltip: "Number of neighbors occupied by different organisms."

**Available Operands:** = (equals), > (greater than), < (less than), >= (greater or equal), <= (less or equal), range (e.g., 2-3)

**Acceptance Criteria:**
- Users can add multiple rules per action type (multiple "Born" rules, multiple "Survive" rules, etc.)
- All conditions within a rule evaluate with AND logic

**FR-2.6: Sort Survival Rules**
The system shall allow users to manually reorder survival rules to establish evaluation priority within each organism.
- **Acceptance Criteria:**
  - Rule order is **organism configuration**: it records the user's intended priority among that organism's rules. **How that order is applied is determined by the active simulation model** (FR-5.1), not by the organism itself.
  - Under the MVP's three-phase model, the order sets priority **among rules evaluated in the same phase** (Die rules in Phase 1; Born and Survive rules together in Phase 2) and does **not** override the model's cross-phase precedence — Death (FR-5.2) is evaluated before Birth/Survival (FR-5.3). A different simulation model (deferred — see Non-Goals) could apply the same configured order with different priorities.

**FR-2.7: Initial State & Preview Panel**
The system shall provide a grid where users can draw an initial pattern and run a test simulation to preview the organism's behavior in isolation.
- **Acceptance Criteria:**
  - Preview runs independently of the main Petri Dish (its own isolated simulation instance; it does not affect or read the open Battle grid).
  - The preview uses the same simulation engine as Play Mode (FR-5) and honors the same extinction auto-stop (FR-4.7), so a previewed organism behaves exactly as it will in a Battle.

### FR-3: Petri Dish - Edit Mode

**FR-3.1: Display Grid**
The system shall display a grid of cells where users can place organisms.
- **Acceptance Criteria:**
  - Default grid size: 100 x 60 (width x height) — the factory default; the default for new battles is user-configurable to **either** editable preset, 50×30 or 100×60 (FR-8.10). Grids are per-battle and resizable among those editable presets (FR-3.11); the larger sizes 150×90 / 200×120 are Play-mode expansion only (FR-4.9)
  - The grid is rendered auto-fit to the canvas (see FR-3.2)

**FR-3.2: Grid Display (Auto-Fit)**
The system shall render the entire grid scaled to fit the available canvas area (cell size = canvas size ÷ grid dimensions), so the whole grid is always visible regardless of its dimensions.

**Acceptance Criteria:**
- Cell size decreases as grid dimensions increase; the whole grid remains visible
- Display updates immediately when the grid is resized (FR-3.11 / FR-4.9)

**FR-3.3: Organism Selection**
The system shall provide an Organism Dropdown that displays all available organisms from the Library (with names and color indicators) plus an **Eraser** option.
- **Acceptance Criteria:**
  - Each organism row provides an inline **edit (pencil) affordance** that opens the Organism Editor for that organism per FR-3.12.
  - When two or more organisms placed in the current Battle share the same color, the system displays a non-blocking warning indicating they will be visually indistinguishable on the grid (colors are reusable per FR-2.3).

**FR-3.4: Place Organism Cells (Click)**
The system shall allow users to click individual cells to place the selected organism.

**FR-3.5: Place Organism Cells (Drag)**
The system shall allow users to click-and-drag across multiple cells to paint the selected organism in a continuous motion.

**FR-3.6: Erase Cells**
When the Eraser option is selected, the system shall allow users to click or click-and-drag to clear cells (return to empty state).

**FR-3.7: Reset Grid**
The system shall provide a Reset button that clears all cells on the entire grid, returning it to empty state.

**FR-3.8: Undo**
The system shall provide an Undo function that reverts the grid to previous states.
- **Acceptance Criteria:**
  - Support up to 30 undo levels.
  - Undo history persists when switching between Edit Mode and Play Mode.
  - Undo history resets when returning to the Battle Gallery (closing the Battle).

**FR-3.9: Name Battle**
The system shall allow users to enter a text name for the current Battle scenario (e.g., "Triple Threat").

**FR-3.10: Toggle to Play Mode**
The system shall allow users to switch from Edit Mode to Play Mode, which initiates the simulation with the current grid state as the initial configuration.

**FR-3.11: Resize Grid (Edit Mode)**
The system shall allow users to change the current Battle's grid size in Edit Mode by selecting one of the **editable presets (50×30, 100×60)**.
- **Acceptance Criteria:**
  - Only the editable sizes (50×30, 100×60) are available in Edit Mode; the larger sizes (150×90, 200×120) are Play-mode expansion only (FR-4.9), because auto-fit (FR-3.2) would make their cells too small to click individually (FR-3.4).
  - Existing cells are preserved top-left anchored; growing adds empty space to the right and bottom.
  - Shrinking to a smaller preset clips cells outside the new bounds; the system warns before discarding cells.
  - Resizing is undoable (FR-3.8) and is persisted when the Battle is saved (FR-7.8).

**FR-3.12: Edit Organism from Battle Editor**
The system shall allow users to edit any organism directly from within the Battle Editor (Edit Mode), without first navigating to the Organism Library. The Organism Editor (FR-2) opens as a **modal overlay** on top of the current Battle Editor, and on close returns the user to the same in-progress Battle (its unsaved grid preserved) with the organism's changes reflected on the grid.
- **Acceptance Criteria:**
  - An **edit (pencil) affordance** is available on each organism row of the Organism Dropdown (FR-3.3) and acts on the currently selected organism.
  - The Organism Editor opens **over** the Battle Editor; the in-progress grid is **not lost** and **no save is required** to make the round-trip. (It is a modal overlay, not navigation away from the Battle — so the FR-7.9 unsaved-changes guard is not triggered.)
  - On **Save & Close**, the organism is updated in the shared Library (FR-7.15) and the Battle grid **re-renders to reflect the change immediately**; on **Cancel**, the organism is unchanged.
  - Editing this way is subject to the **FR-1.3 warning**, since the organism is in use in the current Battle (the open Battle counts toward "[N] Battle(s)").
  - The FR-1.3 warning offers **Edit Anyway** (edits the shared organism, affecting all Battles that use it — FR-7.15) or **Cancel**. There is **no Clone & Edit** and **no grid rebinding** from the Battle Editor: to create a Battle-specific variant, clone the organism in the Organism Library (FR-1.6) and select the clone in the Organism Dropdown (FR-3.3).

### FR-4: Petri Dish - Play Mode

**FR-4.1: Play/Pause Control**
The system shall provide a Play button to start the simulation and a Pause button to suspend it.
- **Acceptance Criteria:** Simulation continues from the paused state when resumed.

**FR-4.2: Speed Control**
The system shall provide speed presets, expressed in **generations per second (gen/sec)**, to adjust simulation speed:
- **1 gen/sec** (1000 ms per cycle)
- **2 gen/sec** (500 ms per cycle)
- **5 gen/sec** (200 ms per cycle)
- **10 gen/sec** (100 ms per cycle) — Default
- **20 gen/sec** (50 ms per cycle) — maximum

**Acceptance Criteria:**
- Speed can be adjusted during playback without pausing.
- The simulation tick rate is independent of the render frame rate — rendering stays up to 60 FPS regardless of the selected gen/sec.

**FR-4.3: Step Forward (Next Cycle)**
The system shall provide a Next button to advance the simulation by exactly one cycle.

**FR-4.4: Stop and Reset**
The system shall provide a Stop button that halts the simulation and returns the grid to the initial state (the configuration set in Edit Mode).

**FR-4.5: Cycle Counter**
The system shall display the current cycle number, starting at 0 and incrementing with each simulation step.

**FR-4.6: Population Statistics**
The system shall display a visual representation of population counts for each organism:
- Horizontal bars colored by organism, sized by percentage of total living cells
- Organism name and percentage displayed
- Sorted from most populated to least
- Extinct organisms shown at the bottom with a skull/RIP indicator
- Because colors are reusable (FR-2.3), two organisms may share a bar color; the organism **name** shown on each bar disambiguates them, so no separate same-color warning is needed here (the Edit-grid warning in FR-3.3 covers the grid, where names are not shown per cell).

**FR-4.7: Auto-Stop on Extinction**
The system shall automatically pause the simulation when the grid goes extinct — i.e. no living cells remain.
- **Acceptance Criteria:**
  - This is a **pause** (FR-4.1), not the Stop action (FR-4.4): the extinct grid is left on screen so the user sees the outcome, and the run can be resumed/stepped; it is **not** reset to the initial state. (The "Auto-Stop" name is historical; the mechanic is an auto-pause.)
  - Fires only when the grid contains zero living cells (total extinction). This is a simple emptiness check — it does **not** compare cells or cell ages against the previous cycle.
  - Frozen grids / still lifes are **not** auto-stopped. Cell age keeps advancing every cycle even when the visible grid stops changing (FR-5.6), and age is a first-class rule input (FR-5.5) — a future organism may activate rules only past a given age — so a visually static grid may still be meaningfully evolving. Auto-stopping it would be wrong.
  - Oscillators (e.g. a period-2 blinker) and moving patterns (e.g. gliders) are likewise **not** auto-stopped — they are visibly alive. The user can Pause/Stop any running simulation manually. Freeze detection and period-N cycle detection are out of scope for the MVP.

**FR-4.8: Toggle to Edit Mode**
The system shall allow users to switch from Play Mode to Edit Mode at any time.
- **Acceptance Criteria:** Switching to Edit Mode halts the simulation and displays the initial state (not the current simulation state). `[ASSUMPTION: Users want to iterate on starting conditions rather than edit mid-simulation states.]`

**FR-4.9: Resize Grid (Play Mode)**
The system shall allow users to resize the grid in Play Mode to give organisms room to expand, including into the **larger presets (150×90, 200×120)** that are not available in Edit Mode. Resizing is only available while the simulation is paused.
- **Acceptance Criteria:**
  - Play Mode can select any preset (50×30, 100×60, 150×90, 200×120); the large sizes (150×90, 200×120) are reachable here only, and only ever as ephemeral live-grid expansion (never persisted — see below).
  - The resize control is enabled only when the simulation is paused; it is disabled while the simulation is actively running.
  - Resizing affects only the running simulation; existing cells are preserved top-left anchored and the hard edges (FR-5.9) move outward.
  - Play-mode resizing is not saved; Stop (FR-4.4) and switching to Edit Mode (FR-4.8) return to the initial grid at its Edit-mode size.

### FR-5: Simulation Engine

**FR-5.1: Cycle Execution**
The system shall evaluate the entire grid each cycle using a three-phase evaluation process (see FR-5.2, FR-5.3, FR-5.4). This three-phase process is the MVP's single simulation model, and it — not the organisms — defines how rule actions are prioritized across the grid (which action type takes precedence, and how competing claims resolve). Organisms store only their rules and a configured order (FR-2.6); alternate simulation models that apply that configuration with different priorities are deferred (see Non-Goals).

**FR-5.2: Phase 1 - Death Evaluation**
The system shall evaluate all "Die" rules for all organisms across the entire grid, producing an intermediate grid state with cells marked for death.
- **Acceptance Criteria:**
  - **Death precedence (this model).** Phase 1 evaluates only each organism's **Die**-action rules. If a cell's organism matches a Die rule, the cell is removed in this phase — regardless of whether a Survive rule also matches, or how the organism's rules are sorted (FR-2.6). Under the three-phase model, death takes precedence over survival.
  - **Explicit deaths only.** Only cells matching an explicit Die rule are removed in Phase 1. A living cell that matches neither a Die nor a Survive rule is not removed here — it produces no Survive claim in Phase 2 and is gone at cycle end, but still contributes to Phase-2 neighbor counts. This preserves simultaneous-generation semantics for rule sets that express death implicitly (e.g. Conway's Classic: survive 2–3, no Die rule).
  - _Note:_ an explicit Die cell is removed before Phase-2 neighbor counting, so a rule set using Die rules is not equivalent to the same logic expressed as implicit death (only implicit death gives simultaneous-generation Conway); Conway's Classic uses implicit death by design.

**FR-5.3: Phase 2 - Birth and Survival Evaluation**
The system shall evaluate all "Born" and "Survive" rules for all organisms in parallel against the intermediate grid from Phase 1.
- **Acceptance Criteria:**
  - All organisms evaluate against the same intermediate state
  - Each organism produces a set of candidate cells it would occupy
  - Rules within an organism evaluate with AND logic
  - Rules are evaluated in manually sorted priority order (within this phase; see FR-2.6)
  - A cell removed in Phase 1 holds no organism in the intermediate grid, so it may receive a **Born** claim (if a Born rule matches the now-empty cell) but cannot produce a **Survive** claim.

**FR-5.4: Phase 3 - Conflict Resolution**
When multiple organisms claim the same cell, the system shall resolve conflicts using Dominance values.
- **Acceptance Criteria:**
  - The organism with the higher Dominance value wins the cell.
  - If multiple organisms have identical Dominance values, the system shall randomly select one of the tied organisms as the winner (this tie-break is random with no stored RNG seed — see A-2: a shared/exported battle reproduces the initial *configuration*, not a specific run outcome, so replays may differ).
  - **Survive and Born claims compete uniformly (this model).** All Phase-2 claims for a contested cell are resolved by Dominance alike — whether a claim is a **Survive** (an incumbent staying) or a **Born** (a challenger). Incumbency confers no protection beyond the incumbent's own Dominance: a **Born claim can evict a surviving incumbent** when the challenger's Dominance is higher (ties broken randomly, as above).
  - **Relative-Cell-State gating.** Because Cell State is relative to the evaluating organism (FR-2.5), a Born rule that requires an **empty** cell cannot target an occupied one and never contests an incumbent. A surviving cell is only contestable by an organism whose Born rule is written to fire on an **occupied** cell (a deliberate "invader" design), so organisms with ordinary empty-cell births cannot displace incumbents — a stable occupant holds its territory against them (see UJ-1: "Blue holds its corner").

**FR-5.5: Rule Evaluation**
For each cell being evaluated, the system shall process rules using the defined properties, operands, and values from the Organism Editor (Cell State, Organism Type, Age of Cell, Neighbor Count, Occupant Neighbor Count).

**FR-5.6: Cell Aging**
The system shall track the age of each living cell (number of cycles it has been alive).
- **Acceptance Criteria:**
  - Age increments by 1 each cycle the cell remains alive
  - Age resets to 0 when a cell dies and is reborn

**FR-5.7: Visual Aging Degradation**
For organisms with aging degradation enabled, the system shall increase the color saturation of cells as they age.
- **Acceptance Criteria:**
  - Cells start at 30% saturation when born (age 0)
  - Saturation increases by 10% per cycle
  - Saturation caps at 100% (reached at age 7)

**FR-5.8: Neighbor Calculation**
The system shall calculate neighbor counts using Moore neighborhood (8 adjacent cells: N, NE, E, SE, S, SW, W, NW).

**FR-5.9: Grid Edge Behavior**
The system shall treat grid edges as hard boundaries.
- **Acceptance Criteria:** Cells at edges and corners have fewer than 8 neighbors; the grid does not wrap.

### FR-6: Battle Export

**FR-6.1: Export Battle**
The system shall allow users to export the current Battle as a JSON file.
- **Acceptance Criteria:**
  - Export includes the initial grid state (Edit Mode configuration)
  - Export does not include current simulation state from Play Mode `[ASSUMPTION: Users primarily want to share starting configurations rather than mid-simulation snapshots.]`

**FR-6.2: Import Battle** *(Merged 2026-06-26 → see FR-8.4)*
Importing a single-Battle file is the same operation as importing a workspace — both replace the entire workspace — so it is unified under the single **Import** action in Settings (FR-8.4). Retained as a tombstone for ID stability.

**FR-6.3: JSON Format**
The exported JSON shall include:
- **Battle name**
- **Grid dimensions** (the Battle's configured size; included for portability and future compatibility)
- **Organisms:** Complete list with all properties (Name, Dominance, Color, Aging Degradation, Survival Rules with Summary/Action/Conditions)
- **Initial grid state:** Cell positions and organism assignments
- **Metadata:**
  - Export date/timestamp
  - Application version
  - Format version number (to handle future feature additions and maintain backward compatibility)

**FR-6.4: File Naming**
The system shall suggest a default filename based on the Battle name when exporting (e.g., `triple-threat.json`).

### FR-7: Battle Gallery & Workspace Management

**FR-7.1: Battle Gallery View (Home Page)**
The system shall display a Battle Gallery as the home page, showing all saved Battles as a grid of tiles.
- **Acceptance Criteria:** Battles are sorted by last modified date (most recent first).

**FR-7.2: Battle Tile Display**
Each Battle tile shall display:
- Battle name
- Miniature static snapshot of the initial grid state
- _Note:_ because colors are reusable (FR-2.3), the snapshot may render two same-colored organisms indistinguishably; the tile is a quick visual reference, not a disambiguated view (the grid warning FR-3.3 and named population bars FR-4.6 cover disambiguation where it matters).

**FR-7.3: Battle Tile Metadata**
Each Battle tile shall provide access to additional metadata (via tooltip or expandable section):
- Date created / last modified
- Organism names used in the Battle

**FR-7.4: Create New Battle**
The system shall provide a "Create New Battle" action that opens an empty Petri Dish in Edit Mode.
- **Acceptance Criteria:** When no Battles exist, display a "Create Your First Battle" prompt.

**FR-7.5: Open Battle for Editing**
The system shall allow users to open an existing Battle in Edit Mode from the Battle Gallery.

**FR-7.6: Run Battle Simulation**
The system shall allow users to open an existing Battle directly in Play Mode from the Battle Gallery.

**FR-7.7: Delete Battle**
The system shall allow users to delete a Battle from the Gallery.
- **Acceptance Criteria:** Display confirmation prompt before deletion.

**FR-7.8: Save Battle**
The system shall provide an explicit "Save Battle" action when working in Edit Mode.
- **Acceptance Criteria:**
  - Saves current Battle state (name, grid, organisms used) to the workspace
  - Creates new Battle if first save, updates existing Battle if editing
  - Updates the Battle's last modified timestamp on each save

**FR-7.9: Unsaved Changes Warning**
The system shall warn users when attempting to navigate away from a Battle with unsaved changes.
- **Acceptance Criteria:**
  - Display confirmation prompt when navigating back to Battle Gallery: "You have unsaved changes. Save before leaving?"
  - Display browser warning when attempting to close the browser tab or window with unsaved changes.

**FR-7.10: Navigation to Gallery**
The system shall provide a Back button to return to the Battle Gallery from any Battle view (Edit Mode or Play Mode).

**FR-7.11: Workspace Export** *(Moved 2026-06-26 → see FR-8.3)*
Workspace export lives in the Settings page (FR-8.3), not the Battle Gallery. Retained as a tombstone for ID stability.

**FR-7.12: Workspace Import** *(Moved 2026-06-26 → see FR-8.4)*
Workspace import lives in the Settings page as the unified **Import** action (FR-8.4), not the Battle Gallery. Retained as a tombstone for ID stability.

**FR-7.13: Single Battle Export with Workspace Option**
When exporting from within a Battle (FR-6.1), the system shall prompt: "Export this Battle only, or export entire Workspace?"
- **Acceptance Criteria:**
  - **Battle only:** Exports current Battle + organisms placed on its grid
  - **Entire Workspace:** Exports all Battles + entire Organism Library
  - Note: when the recipient imports the exported file, it **replaces their entire workspace** (import is a replace, not a merge — FR-8.4), including for a single-Battle file. The recipient is warned and offered an export-first option before any data is lost (FR-8.4).

**FR-7.14: Single Battle Import** *(Merged 2026-06-26 → see FR-8.4)*
Importing a single Battle is the same operation as importing a workspace — both replace the entire workspace — so it is unified under the single **Import** action in Settings (FR-8.4). Retained as a tombstone for ID stability.

**FR-7.15: Shared Organism Library**
The system shall maintain a workspace-level Organism Library shared across all Battles. `[ASSUMPTION: Users prefer a shared library for consistency across Battles, rather than battle-specific organism copies by default.]`
- **Acceptance Criteria:**
  - Editing an organism affects all Battles that use it
  - To create Battle-specific variants, users must clone the organism first

### FR-8: Settings Management

**FR-8.1: Settings Page**
The system shall provide a Settings page accessible from the main navigation for configuring workspace, display, and simulation preferences.
- **Acceptance Criteria:**
  - Settings page accessible from Battle Gallery
  - Changes apply immediately or upon action confirmation
  - All settings persist in localStorage

#### Workspace Management

**FR-8.2: Workspace Statistics Display**
The system shall display workspace usage statistics including number of saved battles, number of organisms, and storage space used.
- **Acceptance Criteria:**
  - Statistics update in real-time when battles/organisms are added or removed
  - Storage size displayed in KB or MB with appropriate precision

**FR-8.3: Export Workspace**
The system shall allow users to export the complete workspace (all battles and organisms) as a JSON file.
- **Acceptance Criteria:**
  - Export includes all battles with their grid configurations
  - Export includes all organisms with their complete rule definitions
  - File named with pattern: `game-of-life-workspace-YYYY-MM-DD.json`
  - Export metadata includes timestamp and application version

**FR-8.4: Import**
The system shall allow users to import a previously exported JSON file — either a full workspace export or a single-Battle export. Both are handled by this one action.
- **Acceptance Criteria:**
  - File upload interface with .json file filter
  - Accepts both workspace exports and single-Battle exports (a single-Battle file is a workspace subset); in either case the imported data **replaces the entire current workspace** — import is a replace, **not** a merge or add, and this is true even when importing a single Battle
  - **Whenever the current workspace holds user data, the system shall warn that it will be lost and offer to export it first** — for **both** workspace and single-Battle imports. The warning shall name the kind of file being imported, e.g.: "Importing this [Battle / workspace] will replace your entire current workspace — all current Battles and Organisms will be lost. Export your current workspace first?" with actions **Export Current Workspace First** (triggers the FR-8.3 workspace export, then returns to this prompt), **Import Anyway**, and **Cancel**. The one exception: when the current workspace has nothing to lose — no saved Battles, and no organisms beyond the pre-loaded Conway's Classic default **in its original, unmodified form** — the warning is **suppressed** and the import proceeds directly, since there is no user data to overwrite. (A Conway's Classic modified in **any** editable field — name, color, Dominance, aging toggle, or rules — counts as user data, so the warning is **not** suppressed. "Unmodified" means deep-equal to the originally seeded default, FR-1.5.)
  - Require explicit user confirmation before proceeding (default action is non-destructive — Cancel)
  - Validate JSON format before import
  - Display success/error message after import attempt
  - After a successful import, the pre-loaded **Conway's Classic** organism is ensured present (re-added if the imported file does not contain it — e.g. a single-Battle export that never placed it), preserving the FR-1.5 "always present" invariant. This reuses the default-workspace seeding of first run / Clear All (FR-8.5); it is **not** corruption/tamper handling.
  - Note: a non-destructive add/merge import and keeping multiple workspaces side by side are **out of scope for MVP** (see Non-Goals); the single destructive replace is the intended MVP behavior, made safe by the warning + export-first option above (shown whenever there is user data to lose).

**FR-8.5: Clear All Data**
The system shall allow users to delete all battles and organisms from local storage.
- **Acceptance Criteria:**
  - Display warning: "This will delete all battles and organisms. This cannot be undone."
  - Require explicit user confirmation (e.g., confirmation dialog)
  - After clearing, workspace returns to initial state with default organism only
  - Display success confirmation after data cleared

#### Display Preferences

**FR-8.6: Theme Selection**
The system shall allow users to select between available visual themes.
- **Acceptance Criteria:**
  - Available themes: "Clinical Lab" (default), "Biotech Terminal"
  - Theme selector displays theme name and visual preview/description
  - Selected theme applies immediately to all UI elements without page reload
  - Theme preference persists across browser sessions
  - Default theme for first-time users: "Clinical Lab" `[ASSUMPTION: "Clinical Lab" theme selected as default over "Biotech Terminal" due to superior accessibility. Clinical Lab provides better contrast ratios (gray on black vs. green on black), cleaner typography (sans-serif vs. monospace), and reduced visual fatigue for extended use. Target user (13-year-old student) benefits from modern, readable interface. Users can switch to Biotech Terminal theme via Settings for the terminal aesthetic.]`

**FR-8.7: Grid Lines Toggle**
The system shall allow users to show/hide grid pattern overlay in petri dish visualizations.
_Rationale:_ grid lines help beginners place and align cells precisely (FR-3.4), while some users prefer a cleaner, less busy view when watching a run — a readability/comfort preference for the target user (A-4).
- **Acceptance Criteria:**
  - Toggle applies to Battle Gallery tiles, Edit Mode, and Play Mode
  - Default: Grid lines enabled
  - Preference persists across sessions

**FR-8.8: Cell Animation Toggle**
The system shall allow users to enable/disable pulsing animation effect on living cells.
_Rationale:_ the pulse adds liveliness and delight for a young user, but can distract or add visual load on large, fast simulations — so it is user-toggleable (default on).
- **Acceptance Criteria:**
  - Toggle applies to all cell visualizations
  - Default: Cell animation enabled
  - Preference persists across sessions

**FR-8.9: Scan Animation Speed** *(Removed 2026-06-26)*
Removed — the hover scan-animation speed control added no user value. Retained as a tombstone for ID stability.

#### Simulation Settings

**FR-8.10: Default Grid Size**
The system shall allow users to set the default grid dimensions for new battles.
- **Acceptance Criteria:**
  - Options: **50×30, 100×60 (default)** — the editable grid sizes. The larger sizes (150×90, 200×120) are **not** offered here: they are reachable only as ephemeral Play-mode expansion (FR-4.9), because at those dimensions auto-fit (FR-3.2) makes cells too small to click for editing (FR-3.4).
  - Setting applies only to newly created battles; existing battles can be resized among the editable sizes afterward (FR-3.11)
  - Preference persists across sessions

**FR-8.11: Auto-Save**
The system shall provide a toggle to enable or disable automatic saving of the current Battle while editing.
_Rationale:_ a safety net for the rapid iterate-and-run loop (UJ-1), balanced against not persisting unintended states — hence default Disabled and Edit-Mode-only.
- **Acceptance Criteria:**
  - Toggle: Enabled / Disabled. **Default: Disabled.**
  - When enabled, the system auto-saves Edit Mode changes to the current Battle; auto-save does not run during Play Mode simulation.
  - Auto-save is **inert until the Battle has been named/saved at least once** (FR-7.8): while the grid is still a "Current Battle (unsaved)", auto-save does not silently create an untitled Battle — the user makes the first save (which names it), after which auto-save keeps it current.
  - Setting applies to all Battles.
  - Preference persists across sessions.

**FR-8.12: Default Simulation Speed**
The system shall allow users to set the default playback speed for battle simulations.
_Rationale:_ lets a user set a preferred starting pace once, so they don't re-adjust the FR-4.2 speed control on every run.
- **Acceptance Criteria:**
  - Options: 1, 2, 5, 10 (default), 20 gen/sec — the same preset ladder as FR-4.2
  - This sets the starting speed of the FR-4.2 control when a battle opens in Play Mode
  - Users can adjust speed during playback (per FR-4.2)
  - Preference persists across sessions

## Non-Functional Requirements

### NFR-1: Performance

**NFR-1.1: Simulation Frame Rate**
The system shall maintain 60 FPS during simulation playback at the default 100 x 60 grid with up to 20 organisms (guaranteed baseline). Here the "20" is a **performance baseline** — the number of organisms simultaneously placed on one grid, not a limit on how many organisms may exist (FR-2.3 palette is reusable; NFR-7.2 storage governs total count). Beyond 20 co-placed organisms, or on larger grids (up to 200 x 120), performance degrades gracefully — the system reduces effective generations/second, then render frame rate, to stay responsive. Smaller grids support lower-performance devices. Note: this baseline's "20" happening to equal the palette size (also currently 20, FR-2.3) is coincidental — one is a per-grid render-performance ceiling, the other the count of available colors. The two are independent and either may move without the other; they should not be re-conflated.

**NFR-1.2: Page Load Time**
The system shall load the initial page in under 2 seconds on desktop browsers with broadband connection.

**NFR-1.3: Time to Interactive**
The system shall become interactive (user can click and interact) within 3 seconds of page load.

**NFR-1.4: Storage Performance**
The system shall complete localStorage read/write operations in under 10ms (p95).

### NFR-2: Browser Compatibility

**NFR-2.1: Supported Browsers**
The system shall support the last 2 versions of Chrome, Firefox, Safari, and Edge.
- **Explicitly excluded:** Internet Explorer 11

**NFR-2.2: Required Browser Features**
The system requires:
- HTML5 Canvas API
- localStorage API
- Modern JavaScript (ES6+)

### NFR-3: Device & Screen Support

**NFR-3.1: Screen Size**
The system shall support screens with minimum width of 1024px (desktop and tablet).

**NFR-3.2: Device Types**
The system shall support desktop and tablet devices.
- **Explicitly excluded:** Mobile phones (screens too small for meaningful grid interaction)

### NFR-4: Usability

**NFR-4.1: No Tutorial Required**
The system shall be usable without tutorials or onboarding—interface is self-explanatory.

**NFR-4.2: Responsiveness**
User interactions (click, drag, button press) shall provide immediate visual feedback (< 100ms).

### NFR-5: Maintainability & Code Quality

**NFR-5.1: Test Coverage**
Core simulation and integrity logic shall have 90%+ test coverage. This covers the rules engine and rule compilation, the three-phase simulation step and Dominance conflict resolution (FR-5), and the whole-workspace referential-integrity guarantee — the FR-1.4 delete block that keeps organism references from dangling. Coverage shall include Conway golden-pattern tests (blinker, glider, still lifes) and multi-organism conflict cases.

**NFR-5.2: Design Patterns**
The codebase shall demonstrate SOLID principles and design patterns (Repository, Strategy, Adapter, Dependency Injection, Factory). Each is load-bearing in this design, not decorative: **Repository** abstracts workspace persistence (localStorage now, connected-mode later); **Strategy** is the pluggable simulation model that owns cross-action precedence (FR-5.1) so alternate models can be added without touching organisms; **Adapter** wraps the concrete storage backend behind the repository interface; **Dependency Injection** supplies the repository and strategy to consumers so they can be swapped and tested in isolation (NFR-5.1); **Factory** constructs organisms and compiled rules from stored configuration.

**NFR-5.3: Code Documentation**
Architectural decisions shall be documented in decision logs or RFCs.

### NFR-6: Deployment

**NFR-6.1: Standalone Mode**
The system shall function completely offline with zero backend dependencies (static export, localStorage persistence).

**NFR-6.2: Hosting Cost**
MVP deployment shall cost $0/month (static hosting on Vercel/GitHub Pages).

### NFR-7: Data Persistence

**NFR-7.1: Workspace Storage**
The system shall persist the workspace (all Battles + Organism Library) using browser localStorage.

**NFR-7.2: Storage Capacity**
The system shall support workspaces containing up to 50 Battles and approximately 200 organisms as soft capacity guidance within typical localStorage limits (5-10MB). The organism count is **not hard-capped** — it is bounded only by the available storage budget. This supersedes the earlier 20-organism ceiling, which was an artifact of the (now reusable) color palette (FR-2.3).
- **Acceptance Criteria:** When a write approaches or exceeds the localStorage quota, the system shall fail gracefully — surfacing a clear message and preserving existing data rather than silently dropping it.

**NFR-7.3: Data Integrity**
The system shall validate workspace data on load and handle corrupted data gracefully (display error, offer to reset workspace).

### NFR-8: Theming Architecture

**NFR-8.1: CSS Architecture**
The system shall implement themes using CSS custom properties (CSS variables).
- **Rationale:** Enables runtime theme switching without CSS file reloading or performance penalties
- **Constraint:** All color values must be defined as CSS variables at the root level
- **Constraint:** No hard-coded color values in component styles
- **Example:**
  ```css
  :root[data-theme="clinical-lab"] {
    --bg-primary: #0a0a0a;
    --accent: #00d4ff;
  }
  :root[data-theme="biotech-terminal"] {
    --bg-primary: #000000;
    --accent: #00ff41;
  }
  ```

**NFR-8.2: Theme Performance**
Theme switching shall complete within 100ms with instant visual feedback.
- **Acceptance Criteria:**
  - No page reload required
  - No visible flashing or layout shift during theme change
  - Theme applied via data attribute on root element: `<html data-theme="clinical-lab">`

**NFR-8.3: Theme Accessibility**
The default **Clinical Lab** theme shall meet WCAG AA contrast requirements (4.5:1 for normal text, 3:1 for large text). The **Biotech Terminal** theme is a stylistic option and is not held to the AA contrast guarantee (Clinical Lab is the accessible default per assumption A-4; users opt into Biotech Terminal for aesthetics).
- **Acceptance Criteria:**
  - Clinical Lab contrast validated for all text/background combinations and passes automated accessibility audits
  - Color-blind users can distinguish between organism colors

**NFR-8.4: Theme Maintainability**
New themes shall be addable without modifying component code.
- **Acceptance Criteria:**
  - Theme definitions isolated in dedicated CSS files or sections
  - Component styles reference only CSS variable names, never specific color values
  - Adding a new theme requires only: (1) new CSS variable definitions, (2) theme registration in settings

**NFR-8.5: Theme Loading**
The user's selected theme shall load before first paint to prevent flash of unstyled content (FOUC).
- **Acceptance Criteria:**
  - Theme preference read from localStorage synchronously before DOM render
  - Default theme ("Clinical Lab") applied if no preference stored
  - Theme application occurs in `<head>` before body content loads

## Non-Goals (Out of Scope for MVP)

The MVP is a standalone, offline, single-user studio. The following are deliberately deferred to keep that scope tight; each is tracked for post-MVP sequencing in the architecture's scope plan.

- **Connected / multiplayer mode** — no accounts, server sync, merge, or sharing via a backend. The MVP is standalone and offline-only, which keeps it zero-backend and $0/month to host (NFR-6.1, NFR-6.2).
- **Storage beyond localStorage** — persistence is localStorage only; no IndexedDB or other store. localStorage covers the target capacity (50 Battles / ~200 organisms, NFR-7.2); a larger-capacity backend is a later escape hatch.
- **Multiple workspaces & non-destructive import** — there is exactly **one** workspace; Import always **replaces** it (FR-8.4), for both workspace and single-Battle files. A non-destructive add/merge import, and keeping multiple named workspaces side by side, are deferred — the MVP makes the single destructive replace safe with a warning + export-first option (shown whenever there is user data to lose) rather than supporting coexistence. A future version may introduce multiple simultaneous workspaces so an imported Battle can be added without losing existing work.
- **Selectable / pluggable simulation strategies** — the MVP ships the single 3-phase engine (FR-5), and that engine's cross-action precedence (death before survival; Dominance resolving all conflicts, birth-vs-survival included) is a property of *this* model, not of the organisms. Organisms store only rules + a configured order (FR-2.6) and are strategy-agnostic, so alternate models — e.g. one that preserves each organism's globally-configured rule order, or prioritizes actions differently — can be added later by working on simulation logic alone. There is no per-Battle choice of engine in the MVP. One well-tested engine first.
- **OR-logic rules and extended operators** — rule conditions are AND-only (FR-2.5); no OR rule sets, no not-equal (`ne`) operator, and no additional rule subjects. AND-only covers the target scenarios and keeps the editor simple.
- **Redo** — Undo is supported (FR-3.8); Redo is not. Undo alone covers the iterate-on-setup workflow.
- **Background-thread (Web Worker) simulation** — the engine runs on the main thread. Main-thread performance meets the 60 FPS baseline (NFR-1.1); offloading is a later optimization.
- **Light theme and per-theme organism palettes** — two dark themes ship (Clinical Lab, Biotech Terminal, FR-8.6); no light theme, and organism colors are identical across themes (FR-2.3). Broader theming is deferred.
- **Build-time CSS extraction tooling** — themes use runtime CSS variables (NFR-8.1); build-time style extraction is a later performance/tooling concern, not user-facing.

**Excluded platforms** (consolidated from NFR-2.1 and NFR-3.2):
- **Internet Explorer 11** — lacks the required modern browser APIs (NFR-2.2).
- **Mobile phones** — screens are too small for meaningful grid interaction; minimum supported width is 1024px (desktop and tablet, NFR-3.1).

## Open Questions

**OQ-1: Organism Type Limit per Battle**
What is the practical limit for the number of organism types in a single Battle before performance degrades below the 60 FPS target (NFR-1.1)? This requires stress testing during implementation to establish whether a hard limit is necessary or if performance gracefully degrades.
- **Status:** Resolved — no hard limit. NFR-1.1 establishes 20 co-placed organisms as a guaranteed 60 FPS *performance baseline* (not a cap) with graceful degradation beyond it, and NFR-7.2 makes total organism count storage-bounded rather than hard-capped. Stress testing during implementation tunes the degradation curve; it does not gate a limit. Retained here for traceability.

**OQ-2: localStorage Quota Exceeded Handling**
How should the system handle localStorage quota exceeded errors (when workspace size approaches browser limits)? This is a technical implementation detail that should be addressed in an RFC rather than the PRD, but the resolution will impact user experience when managing large workspaces.
- **Status:** Resolved downstream — the persistence design specifies quota monitoring with graceful failure as workspace size approaches browser limits. Retained here for traceability.

## Success Metrics & Counter-Metrics

### User Experience Success

**Metric 1: Time to First Battle**
- **Target (design intent):** a first-time user can create and run their first Battle within ~10 minutes of opening the app — an onboarding-simplicity goal, not a measured population rate.
- **Measurement:** No usage telemetry (the product is offline with no accounts — NFR-6.1); assessed by manual usability observation in the portfolio context. The figure is aspirational, not an instrumented metric.
- **Counter-Metric:** the flow shouldn't be so bare that a user "completes" in a couple of minutes by clicking through without actually experimenting.

**Metric 2: Simulation Performance**
- **Target:** 60 FPS sustained at the default 100x60 grid on desktop browsers (graceful degradation on larger grids)
- **Measurement:** In-house performance profiling / benchmarks across the grid-size presets (not user telemetry).
- **Counter-Metric:** Code complexity—don't sacrifice maintainability for marginal performance gains beyond the 60 FPS threshold

**Metric 3: Multi-Organism Usage**
- **Target:** 80% of Battles include 3+ custom organisms with visibly different behaviors
- **Measurement:** Manual observation (portfolio project context). Proxy signals for automation: organisms with different Dominance values (±2), different rule counts, or different aging settings.
- **Counter-Metric:** Don't optimize for quantity over quality—battles with 20 identical organisms shouldn't count as success

### Technical Showcase Success

**Metric 4: Test Coverage**
- **Target:** 90%+ test coverage for core simulation logic (FR-5)
- **Counter-Metric:** Don't chase 100% coverage—some code (UI glue, config) doesn't warrant tests

**Metric 5: Documentation Completeness**
- **Target:** Every architectural decision has a documented RFC or decision log entry
- **Counter-Metric:** Don't document the obvious—focus on non-trivial decisions that future developers would question

### Personal Learning Success

**Metric 6: Portfolio Presentation**
- **Target:** Complete working demo deployed at public URL, accessible within 2 seconds
- **Measurement:** Direct check of the deployed public URL and its load time (NFR-1.2); not user telemetry.
- **Counter-Metric:** Don't over-engineer the deployment—simple is better than complex

## Assumptions Index

This section catalogs all assumptions made during PRD development. Each assumption is marked inline with `[ASSUMPTION: ...]` at its point of use.

**A-1: Shared Organism Library (§ FR-7.15)**
Users prefer a shared library for consistency across Battles, rather than battle-specific organism copies by default. Users can clone organisms when battle-specific variants are needed.

**A-2: Export Initial State Only (§ FR-6.1)**
Users primarily want to share starting configurations rather than mid-simulation snapshots. Exporting only the initial grid state (Edit Mode configuration) serves the primary use case of sharing experimental setups. *Note: because Dominance ties are broken randomly (FR-5.4) and no RNG seed is stored, a shared battle reproduces the **initial configuration**, not a specific run outcome — replays may differ ("config, not outcome").*

**A-3: Edit Mode Shows Initial State (§ FR-4.8)**
Users want to iterate on starting conditions rather than edit mid-simulation states. When switching from Play Mode to Edit Mode, displaying the initial state (not current simulation state) supports the experimentation workflow.

**A-4: Default Theme Selection (§ FR-8.6)**
"Clinical Lab" theme selected as default over "Biotech Terminal" due to superior accessibility. Clinical Lab provides better contrast ratios (gray on black vs. green on black), cleaner typography (sans-serif vs. monospace), and reduced visual fatigue for extended use. Target user (13-year-old student) benefits from modern, readable interface. Users can switch to Biotech Terminal theme via Settings for the terminal aesthetic.

## Glossary

**Battle**
A saved experimental scenario consisting of an initial grid configuration with one or more organism types placed in specific positions. Battles can be run, saved, exported, and shared.

**Organism**
A life form type with unique survival rules, Dominance value, color, and aging behavior. Multiple cells on the grid can belong to the same organism type.

**Organism Library**
A workspace-level collection of all created organisms, shared across all Battles. Users create, edit, clone, and delete organisms in the Library.

**Petri Dish**
The visual workspace containing the grid where users place organisms and run simulations. Has two modes: Edit Mode (for designing initial configurations) and Play Mode (for running simulations).

**Edit Mode (a.k.a. Lab Mode)**
The Petri Dish mode for designing a Battle's initial configuration — placing and erasing organisms, resizing the grid, and naming the Battle — as opposed to **Play Mode** (running the simulation). **"Edit Mode" is the canonical term used throughout this document; "Lab Mode" is an interchangeable thematic synonym** for the same mode.

**Dominance**
A numeric value (1-100) assigned to each organism that determines conflict resolution priority when multiple organisms compete for the same cell during simulation.

**Cycle**
A single iteration of the simulation engine. Each cycle evaluates all cells on the grid through three phases: Death evaluation, Birth/Survival evaluation, and Conflict resolution.

**Aging Degradation**
An optional visual effect where cells increase in color saturation as they age (remain alive across multiple cycles), providing visual feedback on cell longevity.

**Survival Rules**
User-defined conditions that determine when cells of an organism are born, survive, or die. Each rule consists of an action (Born/Die/Survive) and one or more conditions (Cell State, Neighbor Count, Age, etc.).

**Workspace**
The entire collection of saved Battles and the Organism Library, persisted in browser localStorage. Can be exported and imported as a single JSON file.

**Theme**
A visual style scheme that defines the color palette, typography, and aesthetic of the application interface. Users can select between "Clinical Lab" (modern, clean, cyan accents) and "Biotech Terminal" (matrix-inspired, monospace, green accents) themes via Settings. Theme preference persists across sessions.
