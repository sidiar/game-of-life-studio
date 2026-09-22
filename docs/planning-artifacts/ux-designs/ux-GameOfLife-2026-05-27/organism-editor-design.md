# UX Design Specification - Organism Editor
**Date:** 2026-06-01
**Feature:** Organism Editor (FR-2)
**Status:** Ready for Architecture Phase

---

## Overview

The Organism Editor is a **modal/overlay interface** that allows users to create and edit organisms with complete control over survival rules, dominance, visual properties, and behavior. It serves as the primary interface for defining organism characteristics and supports both creation of new organisms and editing existing ones.

The editor is accessible from three entry points:
1. **Organism Library** → "Create New Organism" button
2. **Organism Library** → "Edit" button on organism cards
3. **Battle Editor (Edit Mode)** → **pencil (✎) affordance** on an Organism Dropdown row (FR-3.12) — opens the editor as a modal **over** the current Battle, preserving its in-progress grid

---

## Design Context

### Entry Points & Navigation Flow

```
Organism Library
├─→ "Create New Organism" button
│   └─→ Opens Organism Editor (empty state, default values)
│
└─→ Organism Card → "Edit" button
    └─→ Opens Organism Editor (populated with organism data)
    └─→ If organism used in battles: Shows warning dialog first

Battle Editor (Edit Mode)            ← third entry point (FR-3.12)
└─→ Organism Dropdown row → ✎ pencil
    └─→ Opens Organism Editor as a MODAL OVER the Battle (grid preserved)
    └─→ FR-1.3 warning shows (open battle counts toward "[N] Battle(s)")
        ├─ Edit Anyway   → edits shared organism (affects all battles)
        └─ Cancel        → no change (for a battle-specific variant,
                           clone the organism in the Library, FR-1.6)
```

### Exit Points

- **Save**: saves the organism and keeps the editor open with the outcome line; a later Save
  updates the same organism (amended 2026-09-22, Story 4.16 Task 11 — supersedes "Save & Close"
  below, to match the Battle Editor pattern, which also stays open after Save)
- **Cancel**: Discards changes, closes editor, returns to the entry context
- **Delete** (edit mode only): Shows confirmation, deletes organism, closes editor

**Return context is entry-dependent:**
- Entered from the **Library** → returns to the Organism Library; header reads **"◄ Back to Library"**.
- Entered from a **Battle** (FR-3.12) → returns to the same in-progress Battle Editor with the change re-rendered on the grid (no save of the battle required); header reads **"◄ Back to Battle"**.

---

## Layout Structure

### Overall Layout

The Organism Editor uses a **full-screen overlay** design with three main columns:

```
┌─────────────────────────────────────────────────────────────────────────┐
│ [◄ Back]                    ORGANISM EDITOR                [Save]  [✕]  │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                           │
│  ┌──────────────┐  ┌────────────────────────┐  ┌──────────────────────┐│
│  │              │  │                        │  │                      ││
│  │   COLUMN 1   │  │      COLUMN 2          │  │      COLUMN 3        ││
│  │              │  │                        │  │                      ││
│  │  Basic Info  │  │  Survival Rules        │  │  Preview & Test      ││
│  │  & Settings  │  │  (Scrollable)          │  │  Simulation          ││
│  │              │  │                        │  │                      ││
│  └──────────────┘  └────────────────────────┘  └──────────────────────┘│
│                                                                           │
└─────────────────────────────────────────────────────────────────────────┘
```

### Column Breakdown

#### Column 1: Basic Info & Settings (320px width)
- Organism Name (text input)
- Color Picker (palette selector)
- Dominance Value (number input with slider)
- Aging Degradation Toggle
- Delete Button (edit mode only)

#### Column 2: Survival Rules (flexible, ~500-600px)
- Rules List (scrollable)
- Add Rule Button
- Rule Cards (each with action, conditions, summary)
- Drag-to-reorder handles

#### Column 3: Preview & Test (400px width)
- Test Grid (canvas for drawing)
- Drawing Controls (draw/erase/clear)
- Simulation Controls (play/pause/reset/speed)
- Cycle Counter

---

## Component Specifications

### Header Bar

**Element:** `.editor-header`

**Layout:**
```
┌──────────────────────────────────────────────────────────────┐
│  ◄ Back to Library        ORGANISM EDITOR        [Save] [✕]  │
└──────────────────────────────────────────────────────────────┘
```

**Components:**
- **Back Button**: contextual label, left aligned — `◄ Back to Library` when entered from the Library, `◄ Back to Battle` when entered from the Battle Editor (FR-3.12)
- **Title**: "ORGANISM EDITOR" (centered)
- **Actions**: Save button (primary accent), Close button (secondary)
- **Usage Indicator** (FR-1.7): a persistent **"Used in [N] Battle(s)"** label in the editor's action bar (bottom-bar / footer when the footer layout is used). Clicking it opens a **read-only popover listing the Battle names** that use this organism. Names only — it does **not** navigate away (the editor may be a modal over an in-progress Battle, FR-3.12, so navigation would abandon unsaved grid work). Shows "Used in 0 Battles" (no expansion) when unused. When other organisms' Survival Rules target this organism via an Organism Type condition (FR-1.4 rule-reference accounting), the indicator also shows a **"Targeted by [M] organism rule(s)"** count, and the popover gains a second read-only section listing the **names of the organisms whose rules target it** — same names-only, no-navigation behavior as the Battle list. Backed by the same organism→Battles usage data as the FR-1.3 warning and FR-1.4 delete check.

**Styling:**
- Fixed position at top
- Background: `var(--bg-secondary)`
- Border-bottom: `2px solid var(--border)`
- Padding: `20px 30px`
- Height: `70px`

---

### Column 1: Basic Info & Settings

#### Organism Name Input

**Element:** `.organism-name-input`

**Label:** "Organism Name"
**Placeholder:** "e.g., Aggressive Colonizer"
**Max Length:** 50 characters

**Styling:**
```css
.organism-name-input {
  width: 100%;
  background: var(--bg-hover);
  border: 1px solid var(--border);
  color: var(--text-primary);
  padding: 14px;
  font-size: 16px;
  font-family: inherit;
  transition: all 0.2s;
}

.organism-name-input:focus {
  outline: none;
  border-color: var(--accent);
}
```

**Validation:**
- Required field
- Show validation error if empty on save attempt
- Display character count: "25/50" in tertiary text

---

#### Color Picker

**Element:** `.color-picker`

**Label:** "Organism Color"
**Description:** "Colors may be reused — selecting one already used by another organism shows a warning" (full palette always selectable, FR-2.3)

**Layout:**
```
┌────────────────────────────────────────┐
│ Organism Color                         │
│                                        │
│ [Selected]                             │
│ ┌────────────────────────────────────┐ │
│ │ [●] [●] [●] [●] [●] [●] [●] [●]    │ │
│ │ [●] [●] [●] [●] [●] [●] [●] [●]    │ │
│ │ [●] [●] [●] [●]                    │ │
│ └────────────────────────────────────┘ │
└────────────────────────────────────────┘
```

**Color Palette (20 colors):**
- Row 1: `#ff0055`, `#ff3366`, `#ff6600`, `#ff9900`, `#ffcc00`, `#ffff00`, `#ccff00`, `#66ff00`
- Row 2: `#00ff41`, `#00ffcc`, `#00ccff`, `#0099ff`, `#0055ff`, `#3333ff`, `#6600ff`, `#9900ff`
- Row 3: `#cc00ff`, `#ff00cc`, `#ff0099`, `#ff3399`

**Selected Color Display:**
- Large square (100px × 100px)
- Border: `3px solid [selected-color]`
- Background: `[selected-color]` at 60% opacity
- Box-shadow: `0 0 20px rgba([selected-color], 0.3)`

**Color Swatches:**
- Size: 40px × 40px
- Border: `2px solid var(--border)`
- Hover: Border changes to `var(--accent)`, slight elevation
- Selected: Border changes to `[color]`, glow effect
- In use by another organism: **still selectable** (no disabled/greyed state) — colors are reusable (FR-2.3 / arch M6); picking one raises a non-blocking "already used" warning rather than blocking the swatch

**Interaction:**
- Click swatch to select color
- Selected color appears in large preview
- Visual feedback immediate

---

#### Dominance Slider

**Element:** `.dominance-control`

**Label:** "Dominance"
**Description:** "Priority in conflict resolution (1-100, higher wins)"

**Layout:**
```
┌────────────────────────────────────────┐
│ Dominance                              │
│ Priority in conflict resolution        │
│                                        │
│  [────●─────────────────────────] [8]  │
│  1                               100   │
└────────────────────────────────────────┘
```

**Components:**
- **Slider**: Range input (1-100)
- **Numeric Input**: Display current value, editable
- **Labels**: "1" (left), "100" (right)

**Default Value:** 5 (for new organisms)

**Styling:**
```css
.dominance-slider {
  width: 100%;
  height: 6px;
  background: var(--bg-hover);
  border: 1px solid var(--border);
  appearance: none;
}

.dominance-slider::-webkit-slider-thumb {
  width: 20px;
  height: 20px;
  background: var(--accent);
  border: 2px solid var(--bg-primary);
  cursor: pointer;
  box-shadow: 0 0 8px rgba(accent, 0.3);
}
```

---

#### Aging Degradation Toggle

**Element:** `.aging-toggle`

**Label:** "Aging Degradation"
**Description:** "Cells increase saturation as they age"

**Layout:**
```
┌────────────────────────────────────────┐
│ Aging Degradation       [Toggle: OFF] │
│ Cells increase saturation as they age │
└────────────────────────────────────────┘
```

**Toggle States:**
- OFF (default): Gray toggle, cells maintain constant color
- ON: Accent color toggle, cells are born pale (30% saturation) and deepen as they age, reaching full saturation at age 7 (FR-5.7)

**Visual Example (when ON):**
- Small preview showing cell progression: `░ ▒ ▓ █` (age 0 → 7, saturation 30% → 100%)

---

#### Delete Button (Edit Mode Only)

**Element:** `.delete-organism-btn`

**Label:** "Delete Organism"
**Styling:** Warning color (red), outlined style
**Position:** Bottom of Column 1

**Behavior:**
- Only visible when editing existing organism
- Hidden when creating new organism
- On click, checks organism usage across the **whole workspace** (current grid + every saved Battle + every other organism's Survival Rules) before deleting
- Dialog content:
  - If organism is used in one or more Battles (or placed on the current grid): **blocking error** — "Cannot delete [Organism Name] — it is used in [N] Battle(s): [Battle names]. Remove it from those Battles, or delete the Battles, then try again." (Deletion is **not** offered — hard block; FR-1.4.)
  - If another organism's rules target it (Organism Type condition — FR-1.4 rule-reference accounting): **blocking error** — "Cannot delete [Organism Name] — it is targeted by rules of [M] organism(s): [Organism names]. Edit those rules to remove the reference, then try again." (An organism's own rules never block its deletion.)
  - If safe to delete (used in zero Battles, not on the grid, targeted by no other organism's rules): "Are you sure you want to delete [Organism Name]?"
  - Exception: **Conway's Classic** is a protected system organism — its Delete action is disabled with an explanatory message regardless of usage (FR-1.4/FR-1.5).

---

### Column 2: Survival Rules

#### Rules Section Header

**Element:** `.rules-header`

**Layout:**
```
┌─────────────────────────────────────────────────────┐
│ Survival Rules                      [+ Add Rule]    │
│ Define when cells are born, survive, or die         │
└─────────────────────────────────────────────────────┘
```

**Components:**
- **Title**: "Survival Rules"
- **Description**: "Define when cells are born, survive, or die"
- **Add Button**: Primary accent button, "+ Add Rule"

---

#### Rule Card

**Element:** `.rule-card`

**Layout:**
```
┌───────────────────────────────────────────────────────┐
│ ⋮⋮  [Born]  Rule 1                           [✕]    │
├───────────────────────────────────────────────────────┤
│                                                       │
│ Summary                                               │
│ ┌───────────────────────────────────────────────────┐│
│ │ Death by overpopulation                           ││
│ └───────────────────────────────────────────────────┘│
│                                                       │
│ Conditions (ALL must match)                           │
│                                                       │
│ ┌───────────────────────────────────────────────────┐│
│ │ Cell State    [=]    [Alive]              [✕]    ││
│ └───────────────────────────────────────────────────┘│
│                                                       │
│ ┌───────────────────────────────────────────────────┐│
│ │ Neighbor Count [>]   [3]                  [✕]    ││
│ └───────────────────────────────────────────────────┘│
│                                                       │
│ [+ Add Condition]                                     │
└───────────────────────────────────────────────────────┘
```

**Header Components:**
- **Drag Handle**: `⋮⋮` (left, for reordering)
- **Action Badge**: Colored badge (`[Born]`, `[Survive]`, `[Die]`)
  - Born: Green/Accent color
  - Survive: Blue/Cyan
  - Die: Red/Warning
- **Rule Label**: "Rule 1", "Rule 2", etc.
- **Delete Button**: `[✕]` (right, removes rule)

**Summary Input:**
- Text input
- Placeholder: "e.g., Death by overpopulation"
- Max length: 100 characters
- Optional but recommended

**Condition Rows:**
- Property dropdown: `[Cell State ▼]`
- Operand dropdown: `[= ▼]`
- Value dropdown/input: Depends on property
- Delete button: `[✕]` (removes condition)

**Add Condition Button:**
- Secondary style
- Text: "+ Add Condition"
- Adds new empty condition row

**Drag-to-Reorder:**
- Drag handle `⋮⋮` enables reordering
- Visual feedback: Card elevates, becomes semi-transparent
- Drop zones: Show accent border where card will be inserted

---

#### Condition Property Options

**Available Properties:**

1. **Cell State**
   - Values: Empty, Alive, Occupied
   - Operands: `=` (equals)
   - Tooltip: "The current state of this cell"

2. **Organism Type**
   - Values: Dropdown of all organisms
   - Operands: `=` (equals)
   - Tooltip: "Which organism is in this cell (when occupied by another organism)"
   - Only relevant when Cell State = Occupied

3. **Age of Cell**
   - Values: Number input (0-999)
   - Operands: `=`, `>`, `<`, `>=`, `<=`, `range`
   - Tooltip: "How long this cell has been alive (in cycles)"

4. **Neighbor Count**
   - Values: Number input (0-8) or range (e.g., "2-3")
   - Operands: `=`, `>`, `<`, `>=`, `<=`, `range`
   - Tooltip: "Number of neighbors that are the same organism as yours"

5. **Occupant Neighbor Count**
   - Values: Number input (0-8) or range
   - Operands: `=`, `>`, `<`, `>=`, `<=`, `range`
   - Tooltip: "Number of neighbors occupied by different organisms"

**Range Input UI:**
- When `range` operand selected: Show two number inputs
- Layout: `[Min: 2] — [Max: 3]`
- Validation: Min must be < Max

---

#### Empty State (No Rules)

**Layout:**
```
┌─────────────────────────────────────────────────────┐
│                                                     │
│                       ◯                             │
│                                                     │
│             No Rules Defined                        │
│                                                     │
│  Add rules to define when cells are born,          │
│  survive, or die during simulation.                │
│                                                     │
│               [+ Add Rule]                          │
│                                                     │
└─────────────────────────────────────────────────────┘
```

**Styling:**
- Centered content
- Gray icon/graphic
- Secondary text color
- Primary action button

---

### Column 3: Preview & Test Simulation

#### Preview Grid

**Element:** `.preview-grid`

**Layout:**
```
┌─────────────────────────────────────────┐
│ Initial State & Preview                 │
├─────────────────────────────────────────┤
│                                         │
│  ┌───────────────────────────────────┐ │
│  │                                   │ │
│  │      [Canvas Grid 30×20]          │ │
│  │                                   │ │
│  │                                   │ │
│  └───────────────────────────────────┘ │
│                                         │
│  [Draw] [Erase] [Clear]                │
└─────────────────────────────────────────┘
```

**Grid Size:** 30 × 20 cells
**Cell Size:** ~10-12px per cell
**Background:** `var(--bg-primary)` with grid lines `var(--border)`

**Drawing Controls:**
- **Draw Mode** (default): Click/drag to paint cells (organism color)
- **Erase Mode**: Click/drag to remove cells
- **Clear Button**: Removes all cells from grid

**Styling:**
- Radio buttons or toggle buttons for Draw/Erase
- Clear button as secondary action

---

#### Simulation Controls

**Element:** `.simulation-controls`

**Layout:**
```
┌─────────────────────────────────────────┐
│ Test Simulation                         │
├─────────────────────────────────────────┤
│                                         │
│  ┌──────┐  ┌──────┐  ┌──────┐         │
│  │ Play │  │ Step │  │ Stop │         │
│  └──────┘  └──────┘  └──────┘         │
│                                         │
│  Speed: [Slider]  10 gen/sec           │
│                                         │
│  Cycle: 0                               │
│                                         │
└─────────────────────────────────────────┘
```

**Controls:**
- **Play/Pause**: Toggle button, runs simulation continuously
- **Step**: Advances one cycle at a time
- **Stop**: Resets to initial state
- **Speed Slider**: the canonical gen/sec ladder — 1, 2, 5, 10, 20 gen/sec (same scale as Play Mode, FR-4.2 / arch AR-34; replaces the earlier 0.5x–3x multiplier scale)
- **Cycle Counter**: Displays current cycle number

**Behavior:**
- Preview runs organism in isolation (no other organisms)
- Uses current rule definitions from Column 2
- Updates in real-time as rules change
- Helps users test rules before saving

---

## Interaction Design

### Opening the Editor

**From "Create New Organism":**
1. User clicks "Create New Organism" in Organism Library
2. Editor opens with empty state:
   - Name: Empty
   - Color: Next unused palette color; if all 20 are in use, the least-used color (ties by palette order — FR-2.3)
   - Dominance: 5
   - Aging: OFF
   - Rules: Empty state message

**From "Edit" on Organism Card:**
1. User clicks "Edit" on organism card
2. If organism used in battles: Show warning dialog
   - Dialog: "This organism is used in [N] Battle(s). Editing it will affect all Battles that use it. Clone this organism first to create a Battle-specific variant?"
   - Options: "Edit Anyway" | "Clone & Edit" | "Cancel"
3. Editor opens with populated data:
   - All fields filled with organism's current values
   - Rules displayed in current sort order
   - Delete button visible at bottom of Column 1

---

### Saving Changes

**Validation Required:**
- Organism Name: Must not be empty
- Color: Must be selected
- At least one rule: Optional for MVP (warn if none)

**Save Flow:**
1. User clicks "Save" button
2. Validation runs:
   - If validation fails: Show inline error messages, focus first error
   - If validation passes: Continue
3. Organism saved to library
4. Outcome line inside the editor: "Organism saved successfully"
5. Back returns to the Organism Library, refreshed

**Unsaved Changes Warning:**
- If user clicks "Cancel" or "Back" with unsaved changes:
- Show confirmation dialog: "You have unsaved changes. Discard changes?"
- Options: "Discard" | "Keep Editing" | "Save"

---

### Deleting Organism

**Delete Flow (Edit Mode Only):**
1. User clicks "Delete Organism" button (bottom of Column 1)
2. Whole-workspace usage check (current grid + every saved Battle + every other organism's Survival Rules):
   - If organism is used in one or more Battles (or on the current grid): **Block deletion** — show error naming the count, the Battle names, and the two remedies (remove it from those Battles, or delete the Battles). No confirmation-to-proceed is offered (hard block; FR-1.4).
   - If targeted by another organism's rules (Organism Type condition): **Block deletion** — show error naming the referencing organisms and the remedy (edit those rules to remove the reference). Hard block, same as Battle usage (FR-1.4 rule-reference accounting).
   - If safe to delete (zero Battles, not on the grid, targeted by no other organism's rules): Show standard confirmation
3. Confirmation dialog appears **only for the safe case**
4. If user confirms: Organism deleted, editor closes, returns to library
5. Success message: "Organism deleted"

---

### Rule Management

**Adding a Rule:**
1. User clicks "+ Add Rule" button
2. New empty rule card appears at bottom of list
3. Default action: "Born"
4. Focus moves to Summary input
5. User defines action, conditions, summary

**Deleting a Rule:**
1. User clicks `[✕]` on rule card header
2. Rule removed immediately — no confirmation dialog (aligned with epics Story 4.10; the removal is recoverable until save, since Cancel/Close discards unsaved changes via the editor's own unsaved-changes scope). → Superseded by epics Story 4.26 (2026-09-17): a confirmation dialog naming the rule precedes removal, closing the pointer double-click cascade found in 4.10's review.

**Reordering Rules:**
1. User clicks and holds drag handle `⋮⋮`
2. Card elevates, becomes semi-transparent
3. User drags card up or down
4. Drop zones show accent border
5. On release: Rule order updates, numbers adjust

**Adding Conditions:**
1. User clicks "+ Add Condition" within rule card
2. New empty condition row appears
3. Dropdowns default to first option
4. User selects Property → Operand → Value

**Deleting Conditions:**
1. User clicks `[✕]` on condition row
2. Condition removed immediately (no confirmation needed)
3. If deleting last condition: Show validation warning on save

---

### Preview & Testing

**Drawing Initial Pattern:**
1. User selects "Draw" mode (default)
2. Click or click-drag on grid to paint cells
3. Cells appear in organism's selected color
4. Switch to "Erase" mode to remove cells
5. "Clear" button removes all cells

**Running Test Simulation:**
1. User draws initial pattern on preview grid
2. User clicks "Play" to start simulation
3. Simulation runs using current rule definitions
4. User can pause, step, or stop
5. Adjust speed slider to slow down or speed up
6. Simulation helps validate rules work as expected

---

## Responsive Behavior

### Desktop (>1400px)
- Three-column layout
- All columns visible simultaneously
- Preview column fixed width (400px)
- Rules column flexible

### Tablet (1024px-1400px)
- Three-column layout (compressed)
- Column 1: 280px
- Column 2: Flexible
- Column 3: 350px

### Small Tablet (<1024px)
- Two-column layout
- Column 1 + 2 stacked on left
- Column 3 on right
- Preview grid smaller (250px)

### Mobile (<768px) - Out of Scope
- Not supported in MVP
- Minimum width: 1024px

---

## Theme-Specific Styling

### Clinical Lab Theme

**Color Palette:**
- Accent: `#00d4ff` (cyan)
- Background: `#0a0a0a` (primary), `#1a1a1a` (secondary)
- Border: `#333333`
- Text: `#ffffff` (primary), `#999999` (secondary)

**Typography:**
- Font Family: System sans-serif
- Letter Spacing: Tight (-0.5px for headings)

**Buttons:**
- Primary: Solid cyan fill, black text
- Secondary: Outlined gray border, white text
- Warning: Solid red fill, white text

**Rule Action Badges:**
- Born: `#00ff41` (green)
- Survive: `#00d4ff` (cyan)
- Die: `#ff3366` (red)

**Toggle Switches:**
- Track: Rounded pill (border-radius: 13px)
- Thumb: Circular, smooth animation

---

### Biotech Terminal Theme

**Color Palette:**
- Accent: `#00ff41` (matrix green)
- Background: `#000000` (primary), `#0a0f0a` (secondary)
- Border: `#1a3a1a` (terminal green)
- Text: `#00ff41` (primary), `#33ff77` (secondary)

**Typography:**
- Font Family: 'Courier New', monospace
- Letter Spacing: Wide (0.5px-2px)
- Text Transform: Uppercase for labels

**Buttons:**
- Primary: Outlined matrix green, glow effect
- Secondary: Outlined cyan, glow effect
- Warning: Outlined red, glow effect

**Rule Action Badges:**
- Born: `#00ff41` with glow
- Survive: `#00ffff` (cyan) with glow
- Die: `#ff0055` (red) with glow

**Toggle Switches:**
- Track: Square with slight rounding (border-radius: 2px)
- Thumb: Square, glow on active state

**Additional Effects:**
- Box-shadow glows on interactive elements
- Scan line animation on preview grid (optional)

---

## Accessibility Considerations

### Keyboard Navigation
- Tab order: Top to bottom, left to right
- All interactive elements focusable
- Focus indicators visible (accent border)
- Escape key: Close editor (with unsaved warning)
- Enter in text fields: Moves to next field
- Arrow keys: Navigate conditions and rules

### Screen Reader Support
- Proper ARIA labels for all inputs
- Role="dialog" for modal overlay
- Announce validation errors
- Describe drag-to-reorder functionality
- Button labels clear and descriptive

### Color Contrast
- All text meets WCAG AA (4.5:1 for normal, 3:1 for large)
- Color not sole indicator (use text labels + icons)
- Focus indicators high contrast

---

## Validation & Error Handling

### Field Validation

**Organism Name:**
- Required: "Organism name is required"
- Max length: "Name cannot exceed 50 characters"

**Color:**
- Required: "Please select a color"
- Already in use: **allowed** — the full palette is always selectable and colors may be reused; picking a color another organism uses shows a **non-blocking warning** ("[Organism Name] already uses this color"), not a disabled swatch (colors are reusable per FR-2.3 / arch M6)

**Dominance:**
- Range: Must be 1-100
- Auto-correct: Values outside range snap to min/max

**Rules:**
- Warning if no rules: "No rules defined. Organism will have no living cells."
- Allow save but show warning

**Conditions:**
- At least one condition per rule: "Rule must have at least one condition"
- Valid values: Numeric inputs must be valid numbers
- Range validation: Min < Max for range operands

### Error Display

**Inline Errors:**
- Show below field with red text and warning icon
- Red border on invalid field
- Focus moves to first invalid field on save attempt

**Dialog Errors:**
- Use modal dialog for blocking errors (e.g., organism in use)
- Clear message with action options

---

## Performance Considerations

### Rule Rendering
- Virtualize rule list if >50 rules (unlikely in practice)
- Debounce preview simulation updates (300ms after rule change)

### Preview Simulation
- Run at 60 FPS for smooth animation
- Canvas rendering for grid (not DOM elements)
- Throttle simulation speed to prevent performance issues

### Color Picker
- Render the full palette — in-use colors remain selectable (reusable per FR-2.3), no filtering
- Lazy load color swatches if palette expands

---

## Implementation Files

### Clinical Lab Theme
- **File:** `clinical-lab-theme/organism-editor.html`
- **Styling:** Inline in `<style>` block
- **JavaScript:** Inline for demo/mockup purposes

### Biotech Terminal Theme
- **File:** `biotech-terminal-theme/organism-editor.html`
- **Styling:** Inline in `<style>` block
- **JavaScript:** Inline for demo/mockup purposes

---

## Success Criteria

### UX Design Phase (Current)
- [x] Complete layout specification
- [x] Define all component behaviors
- [x] Document interaction flows
- [x] Specify theme-specific styling
- [ ] Create HTML mockups for both themes
- [ ] Review with stakeholders

### Architecture Phase (Next)
- [ ] Define component architecture
- [ ] Specify state management approach
- [ ] Design validation system
- [ ] Document API for organism data model

### Implementation Phase (Future)
- [ ] Build editor UI components
- [ ] Implement rule management logic
- [ ] Integrate preview simulation engine
- [ ] Add validation and error handling
- [ ] Test accessibility compliance

---

## Open Questions

**OQ-1: Rule Evaluation Performance**
Should there be a hard limit on the number of rules per organism? Testing needed to determine if 50+ rules causes performance issues.

**OQ-2: Preview Grid Size**
Is 30×20 sufficient for testing patterns, or should it match the full Petri Dish size (100×60)? Larger grid provides better testing but may be overwhelming in sidebar.

**OQ-3: Real-Time Rule Validation**
Should the preview simulation update in real-time as users edit rules, or require explicit "Test" action? Real-time is more intuitive but may be distracting.

---

## Next Steps

1. **Create HTML Mockups** (Current Sprint)
   - Build `clinical-lab-theme/organism-editor.html`
   - Build `biotech-terminal-theme/organism-editor.html`
   - Test responsive behavior
   - Validate accessibility

2. **Architecture Phase**
   - Design component structure
   - Define data models
   - Plan state management
   - Create ADRs for key decisions

3. **Story Creation**
   - Break down implementation into user stories
   - Estimate complexity
   - Prioritize features (MVP vs. enhancements)

---

**Status:** UX Design Documentation Complete
**Last Updated:** 2026-07-16 (readiness-report reconciliation: preview speed slider moved to the canonical gen/sec ladder per AR-34; rule deletion is immediate without confirmation per epics Story 4.10. Previously 2026-07-13: aligned with reconciled PRD/RFCs — FR-2.3 color reuse, FR-5.7 aging direction, FR-1.4/1.7 rule-reference surfaces)
