# Play Mode UX Design Proposal
**Date:** 2026-05-29
**Feature:** Petri Dish - Play Mode (Simulation View)
**Design Direction:** Biotech Terminal (continuation)

---

## Overview

Play Mode transforms the Petri Dish workspace from a creative editing canvas into an active laboratory simulation. The transition should feel like **activating a terminal program**—controls shift from editing tools to simulation instrumentation, maintaining the established Biotech Terminal aesthetic while prioritizing the simulation experience.

---

## Design Principles for Play Mode

1. **Immersive Simulation Experience** - Grid takes center stage, controls fade to background
2. **Smooth State Transition** - Edit Mode → Play Mode feels like mode switching, not page navigation
3. **Data-Rich Feedback** - Population stats, cycle counts, and organism performance are constantly visible
4. **Terminal Precision** - Controls feel like lab equipment interfaces with exact, responsive feedback
5. **Fullscreen Ready** - Design supports distraction-free observation

---

## Layout Architecture

### Overall Structure

```
┌─────────────────────────────────────────────────────────────────┐
│ TOP BAR: Battle Name • Mode Toggle • Back • Fullscreen          │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌────────────────────────┐   ┌──────────────────────────────┐  │
│  │                        │   │  SIMULATION CONTROLS         │  │
│  │                        │   │  ▶ Play/Pause                │  │
│  │                        │   │  ⏭ Next (Step)              │  │
│  │                        │   │  ⏹ Stop & Reset             │  │
│  │   PETRI DISH GRID      │   │  ━━━━━ Speed Slider          │  │
│  │   (Simulation Canvas)  │   │  Cycle: 0                    │  │
│  │                        │   │                              │  │
│  │   [100x60 grid with    │   │  POPULATION STATS            │  │
│  │    active organisms    │   │  ▓▓▓▓▓▓▓░░ Red (45) 42%     │  │
│  │    in vivid colors]    │   │  ▓▓▓▓░░░░░ Blue (32) 30%    │  │
│  │                        │   │  ▓▓░░░░░░░ Green (12) 11%   │  │
│  │                        │   │  ☠ Yellow (extinct)          │  │
│  │                        │   │                              │  │
│  │                        │   │  [Auto-paused: Steady State] │  │
│  └────────────────────────┘   └──────────────────────────────┘  │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

### Responsive Behavior
- **Desktop (>1024px):** Side-by-side layout (grid left, controls right)
- **Tablet (768px-1024px):** Controls panel collapses to bottom overlay
- **Fullscreen Mode:** Controls auto-hide after 3 seconds of inactivity, reveal on mouse move

---

## Component Specifications

### 1. Top Bar (Persistent Across Edit/Play Modes)

**Layout:**
```
┌──────────────────────────────────────────────────────────────────────┐
│  GAME_OF_LIFE_STUDIO > Battle: "Triple Threat"                       │
│  [EDIT] [PLAY ✓] • [← BACK] [⛶ FULLSCREEN]                         │
└──────────────────────────────────────────────────────────────────────┘
```

**Styling:**
- Background: `#000000` (pure black)
- Text: `#00ff41` (matrix green)
- Border bottom: 1px solid `#1a3a1a`
- Height: 48px
- Font: Monospace, 14px

**Controls:**
- **Mode Toggle:** `[EDIT]` / `[PLAY]` - Tab-like selection, active state uses `#00ff41` with checkmark
- **Back Button:** `[← BACK]` - Returns to Battle Gallery (with unsaved changes warning)
- **Fullscreen Button:** `[⛶ FULLSCREEN]` - Toggles browser fullscreen API

**Behavior:**
- Switching modes preserves simulation state (if paused, stays paused)
- Battle name is always visible for context

---

### 2. Petri Dish Grid (Simulation Canvas)

**Visual Treatment:**
- **Grid:** Dark gray lines (`#1a1a1a`) on black background
- **Cells:** Organism colors at full saturation during simulation
- **Aging Effect:** Cells with aging enabled gradually increase saturation (30% → 100% over 7 cycles)
- **Grid Border:** Terminal green glow (`box-shadow: 0 0 10px #00ff4133`)
- **Aspect Ratio:** Maintains viewport presets (Small/Medium/Large from FR-3.2)

**Active Simulation Indicators:**
- Subtle phosphor glow on active cells (mimics CRT display)
- No edit hover states (mouse interaction disabled during play)
- Smooth cell state transitions (100ms fade)

**Fullscreen Behavior:**
- Grid scales to fill screen while maintaining aspect ratio
- Controls overlay appears on hover, fades after 3 seconds

---

### 3. Simulation Controls Panel

Located right side (desktop) or bottom overlay (tablet).

#### A. Playback Controls

**Layout:**
```
┌─────────────────────────────┐
│  SIMULATION_CONTROLS        │
│                             │
│  ▶ PLAY                     │  ← Primary action (large, green)
│  ⏭ NEXT_CYCLE              │  ← Step forward (yellow)
│  ⏹ STOP_AND_RESET          │  ← Destructive (red)
└─────────────────────────────┘
```

**Styling:**
- **Play/Pause:** Large button, toggles icon/text
  - Play state: `▶ PLAY` (matrix green `#00ff41`)
  - Pause state: `⏸ PAUSE` (cyan `#00ffff`)
- **Next:** `⏭ NEXT_CYCLE` (amber `#ffaa00`)
- **Stop:** `⏹ STOP_AND_RESET` (danger red `#ff0055`)
- All buttons: Monospace, uppercase, 2px solid borders with matching glow

**Behavior (per PRD):**
- **Play:** Starts simulation at selected speed (FR-4.1)
- **Pause:** Suspends simulation, maintains current state (FR-4.1)
- **Next:** Advances exactly one cycle while paused (FR-4.3)
- **Stop:** Returns to initial state (Edit Mode configuration) (FR-4.4)

**Keyboard Shortcuts:**
- `Space` - Play/Pause
- `→` - Next cycle
- `Esc` - Stop & Reset

#### B. Speed Control

**Layout:**
```
┌─────────────────────────────┐
│  SPEED_MULTIPLIER           │
│  ━━━━●━━━━━━━━━━━━━━━      │  ← Slider
│  0.5x  [1x]  1.5x  2x  3x   │  ← Preset labels
└─────────────────────────────┘
```

**Presets (per FR-4.2):**
- 0.5x (300ms/cycle)
- **1x (150ms/cycle)** ← Default
- 1.5x (100ms/cycle)
- 2x (75ms/cycle)
- 2.5x (60ms/cycle)
- 3x (50ms/cycle)

**Styling:**
- Track: Dark gray `#333333`
- Active track: Matrix green `#00ff41`
- Thumb: Cyan circle with glow (`#00ffff`)
- Labels: Monospace, 12px, current speed highlighted in green

**Behavior:**
- Can adjust during playback (no pause required per FR-4.2)
- Smooth acceleration/deceleration (no jarring speed changes)

#### C. Cycle Counter

**Layout:**
```
┌─────────────────────────────┐
│  CYCLE_COUNT: 0042          │  ← Zero-padded, monospace
└─────────────────────────────┘
```

**Styling:**
- Large monospace digits (24px)
- Color: Matrix green `#00ff41`
- Label in smaller text (12px, `#888888`)
- Background: Slight inset effect with dark border

**Behavior (per FR-4.5):**
- Starts at 0
- Increments with each simulation step
- Resets to 0 on Stop & Reset

---

### 4. Population Statistics Panel

**Layout:**
```
┌──────────────────────────────────────┐
│  POPULATION_ANALYSIS                 │
│                                      │
│  ▓▓▓▓▓▓▓▓▓▓▓▓░░░  Red       127  45% │
│  ▓▓▓▓▓▓▓▓░░░░░░░  Blue       89  31% │
│  ▓▓▓▓░░░░░░░░░░░  Green      45  16% │
│  ▓░░░░░░░░░░░░░░  Cyan       12   4% │
│  ☠ Yellow  [EXTINCT]          0   0% │
│                                      │
│  TOTAL_LIVING_CELLS: 273            │
└──────────────────────────────────────┘
```

**Visual Design:**
- **Horizontal Bars:** Filled with organism color at left, fading to transparent at right
- **Color Match:** Bars use exact organism colors from grid
- **Sorting:** Highest population at top (per FR-4.6)
- **Extinct Indicator:** Skull icon `☠` + `[EXTINCT]` label in dark red, moved to bottom

**Data Display:**
- Organism name (left-aligned)
- Cell count (center)
- Percentage of total living cells (right-aligned)
- Total living cells at bottom

**Styling:**
- Background: Slightly lighter black (`#0a0a0a`) with inset border
- Text: Monospace, 12px
- Bar animation: Smooth width transitions (300ms ease-out)
- Update frequency: Every cycle

**Behavior (per FR-4.6):**
- Updates in real-time during simulation
- Bars resize proportionally to population changes
- Extinct organisms sink to bottom with visual indicator
- Total count updates continuously

---

### 5. Auto-Pause Indicator

**Layout:**
```
┌─────────────────────────────┐
│  ⚠ SIMULATION_PAUSED        │
│  REASON: STEADY_STATE       │
│  No changes detected.       │
└─────────────────────────────┘
```

**Styling:**
- Background: Dark amber (`#3a2a00`) with warning icon
- Border: 2px solid amber (`#ffaa00`)
- Text: Monospace, uppercase for reason, normal case for description
- Appears below population stats

**Trigger Conditions (per FR-4.7):**
- Grid state unchanged from previous cycle (steady state)
- All cells empty (extinction)

**Behavior:**
- Appears automatically when condition is met
- Can be dismissed by user
- Simulation remains paused until user presses Play again

---

## Mode Transition Design

### Edit Mode → Play Mode

**Transition Sequence (800ms total):**

1. **Phase 1: Fade Out Edit Controls (200ms)**
   - Organism dropdown, drawing tools, reset button fade out
   - Grid becomes non-interactive (cursor changes to default)

2. **Phase 2: Grid Animation (400ms)**
   - Subtle green sweep across grid (left to right)
   - Simulates "initializing simulation" scan
   - Terminal text appears: `INITIALIZING_BATTLE_SIMULATION...`

3. **Phase 3: Fade In Play Controls (200ms)**
   - Simulation controls panel slides in from right
   - Population stats appear with initial counts
   - Cycle counter resets to 0
   - Terminal text changes to: `READY_TO_SIMULATE`

**Visual Effect:**
- Maintains continuous grid state (no jarring reload)
- Feels like mode activation, not navigation
- Green phosphor sweep reinforces Biotech Terminal aesthetic

### Play Mode → Edit Mode (per FR-4.8)

**Transition Sequence (600ms total):**

1. **Phase 1: Stop Simulation (Instant)**
   - Simulation halts immediately
   - Grid returns to **initial state** (not current simulation state)

2. **Phase 2: Fade Out Play Controls (200ms)**
   - Simulation controls fade out
   - Population stats disappear

3. **Phase 3: Fade In Edit Controls (400ms)**
   - Organism dropdown, drawing tools reappear
   - Grid becomes interactive again (hover states return)
   - Undo history is preserved (per FR-3.8)

**Rationale (per PRD Assumption A-3):**
> "Users want to iterate on starting conditions rather than edit mid-simulation states."

---

## Fullscreen Mode Design

### Activation

**Trigger:**
- Click `[⛶ FULLSCREEN]` button in top bar
- Keyboard shortcut: `F11` (browser default) or `F` key

**Transition:**
- Browser Fullscreen API activates
- Top bar remains visible
- Grid scales to fill available space (maintains aspect ratio)
- Controls panel overlays grid at right edge with 80% opacity

### Auto-Hide Controls

**Behavior:**
- After 3 seconds of mouse inactivity, controls fade out (500ms)
- Mouse movement reveals controls instantly (200ms fade in)
- Controls always stay visible when paused or when hovering over them

**Visual Treatment:**
- Controls panel background becomes 90% opaque black with slight blur
- Panel has subtle green glow border (Biotech Terminal aesthetic)
- Smooth fade transitions

### Exit Fullscreen

**Triggers:**
- Click `[EXIT FULLSCREEN]` button (replaces Fullscreen button)
- Press `Esc` key
- Browser fullscreen exit

**Transition:**
- Layout returns to standard side-by-side view
- Controls panel returns to static right position
- No simulation interruption

---

## Keyboard Shortcuts Summary

| Key | Action |
|-----|--------|
| `Space` | Play/Pause simulation |
| `→` | Next cycle (step forward) |
| `Esc` | Stop & Reset / Exit Fullscreen |
| `F` | Toggle Fullscreen |
| `E` | Switch to Edit Mode |
| `P` | Switch to Play Mode |
| `1-6` | Set speed preset (1=0.5x, 2=1x, 3=1.5x, 4=2x, 5=2.5x, 6=3x) |

---

## Color Palette Reference (Biotech Terminal)

| Element | Color | Hex | Usage |
|---------|-------|-----|-------|
| Background | Pure Black | `#000000` | Main background |
| Primary Accent | Matrix Green | `#00ff41` | Active elements, Play button |
| Secondary Accent | Cyan | `#00ffff` | Pause state, slider thumb |
| Warning | Amber | `#ffaa00` | Next button, auto-pause |
| Danger | Red | `#ff0055` | Stop button, extinct indicator |
| Borders | Terminal Green | `#1a3a1a` | Dividers, panel borders |
| Text Secondary | Gray | `#888888` | Labels, inactive text |
| Grid Lines | Dark Gray | `#1a1a1a` | Grid cell borders |

---

## Accessibility Considerations

- **Keyboard Navigation:** All controls accessible via Tab + Enter/Space
- **Screen Reader Support:**
  - ARIA labels on all controls
  - Live region for population stats updates
  - Announce cycle count changes every 10 cycles
- **Motion Sensitivity:** Offer "Reduce Motion" setting to disable sweep animations
- **Color Blindness:** Organism colors chosen from accessible palette
- **Contrast Ratios:** All text meets WCAG AA standards (4.5:1 minimum)

---

## Technical Implementation Notes

### Performance Optimization
- Canvas rendering for grid (not DOM elements for 6000 cells)
- RequestAnimationFrame for smooth simulation updates
- Debounced population stats calculations
- Web Workers for simulation engine (keeps UI responsive)

### State Management
- Simulation state separate from Edit state
- Undo history preserved across mode switches
- LocalStorage autosave every 30 seconds during simulation

### Browser Compatibility
- Fullscreen API with vendor prefixes
- Fallback for browsers without Fullscreen support (expand within viewport)
- Canvas fallback for older browsers

---

## Open Questions for Review

1. **Population Stats Position:** Side panel vs. bottom overlay vs. top banner?
2. **Fullscreen Auto-Hide Timing:** 3 seconds too short/long?
3. **Grid Glow Effect:** Too distracting during fast simulations?
4. **Mode Transition Duration:** 800ms too slow for experienced users?
5. **Keyboard Shortcuts:** Need additional shortcuts for accessibility?

---

## Next Steps

- [ ] Create HTML/CSS prototype for Play Mode
- [ ] Design Edit Mode layout (to ensure smooth transition)
- [ ] User test mode transition flow
- [ ] Validate population stats visualization with sample data
- [ ] Test fullscreen behavior across browsers

---

## Alignment with PRD Functional Requirements

| FR | Requirement | Design Solution |
|----|-------------|-----------------|
| FR-4.1 | Play/Pause Control | Large primary button with state toggle |
| FR-4.2 | Speed Control | Slider with 6 presets, adjustable during playback |
| FR-4.3 | Next Cycle | Dedicated button with keyboard shortcut |
| FR-4.4 | Stop and Reset | Destructive red button, returns to initial state |
| FR-4.5 | Cycle Counter | Large monospace display, zero-padded |
| FR-4.6 | Population Statistics | Horizontal bars with color coding, sorted by population |
| FR-4.7 | Auto-Stop Steady State | Visual indicator with reason display |
| FR-4.8 | Toggle to Edit Mode | Mode toggle in top bar, returns to initial state |
| **NEW** | **Fullscreen Mode** | Dedicated button with auto-hide controls |

---

**Status:** Initial proposal - awaiting review and iteration
