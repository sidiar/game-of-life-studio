# UX Design Documentation - Game of Life Studio
**Date:** 2026-06-01
**Phase:** UX Design (Complete)
**Status:** Ready for Architecture Phase

---

## Overview

Game of Life Studio supports **two distinct visual themes** to accommodate different user preferences and use cases. Both themes provide identical functionality with different aesthetic presentations.

---

## Theme System

### Available Themes

#### 1. Clinical Lab (Default)

**Design Philosophy:** Modern laboratory equipment precision

**Visual Characteristics:**
- **Typography:** System sans-serif fonts (-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto)
- **Letter Spacing:** Tight (-0.5px for headings, normal for body)
- **Color Palette:**
  - Background Primary: `#0a0a0a` (deep black)
  - Background Secondary: `#1a1a1a` (card backgrounds)
  - Background Hover: `#222222` (interactive states)
  - Border: `#333333` (sharp, clean dividers)
  - Accent: `#00d4ff` (cyan - scientific equipment)
  - Text Primary: `#ffffff` (white - high contrast)
  - Text Secondary: `#999999` (gray - labels)
  - Text Tertiary: `#666666` (dimmed metadata)

**Design Rationale:**
- Superior accessibility (higher contrast ratios)
- Clean, modern appearance suitable for all ages
- Reduced eye strain for extended use
- Professional laboratory aesthetic
- Better readability for body text

**Target Users:**
- Primary: Students and educational users (13-18 years)
- Secondary: General users preferring modern interfaces
- Accessibility-focused users

**Implementation Files:**
- `clinical-lab-theme/battle-gallery.html`
- `clinical-lab-theme/settings.html`
- `clinical-lab-theme/organism-library.html`
- `clinical-lab-theme/organism-editor.html`
- `clinical-lab-theme/petri-dish-lab-mode.html`
- `clinical-lab-theme/petri-dish-play-mode.html`

---

#### 2. Biotech Terminal

**Design Philosophy:** Command-line interface meets cellular biology

**Visual Characteristics:**
- **Typography:** Monospace fonts ('Courier New', Courier)
- **Letter Spacing:** Wide (0.5px-2px for terminal effect)
- **Color Palette:**
  - Background Primary: `#000000` (pure black)
  - Background Secondary: `#0a0f0a` (dark green tint)
  - Background Tertiary: `#0f1f0f` (elevated surfaces)
  - Border: `#1a3a1a` (terminal green borders)
  - Accent Primary: `#00ff41` (matrix green)
  - Accent Secondary: `#00ffff` (cyan)
  - Text Primary: `#00ff41` (terminal green)
  - Text Secondary: `#33ff77` (lighter green)
  - Text Tertiary: `#00cc88` (mid-green)

**Design Rationale:**
- Nostalgic terminal aesthetic appeals to technical users
- Matrix-inspired phosphor green creates unique identity
- Animated scan lines provide dynamic visual interest
- Monospace typography evokes precision and code
- Higher visual density suitable for "power users"

**Target Users:**
- Technical users and developers
- Retro-computing enthusiasts
- Users seeking distinctive aesthetic
- Power users comfortable with dense interfaces

**Implementation Files:**
- `biotech-terminal-theme/battle-gallery.html`
- `biotech-terminal-theme/settings.html`
- `biotech-terminal-theme/organism-library.html`
- `biotech-terminal-theme/organism-editor.html`
- `biotech-terminal-theme/petri-dish-lab-mode.html`
- `biotech-terminal-theme/petri-dish-play-mode.html`

---

## Settings Page: Theme Selector Design

### Location
**Page:** Settings
**Section:** Display Preferences (2nd section)
**Position:** First item in Display Preferences group

### Layout Structure

```
┌─────────────────────────────────────────────────────────────────┐
│ Display Preferences                                              │
│ Customize the visual appearance of the application              │
│                                                                  │
│ ┌──────────────────────────────────────────────────────────────┐│
│ │ Theme Selection                                              ││
│ │ Choose your preferred visual style                           ││
│ │                                                               ││
│ │ ┌────────────────────────┐  ┌────────────────────────┐      ││
│ │ │ ◉ Clinical Lab         │  │ ○ Biotech Terminal     │      ││
│ │ │ [Preview Sample]       │  │ [Preview Sample]       │      ││
│ │ │                        │  │                        │      ││
│ │ │ Modern laboratory      │  │ Matrix-inspired        │      ││
│ │ │ equipment aesthetic    │  │ terminal interface     │      ││
│ │ └────────────────────────┘  └────────────────────────┘      ││
│ └──────────────────────────────────────────────────────────────┘│
│                                                                  │
│ Show Grid Lines                                 [Toggle: ON]    │
│ Cell Animation                                  [Toggle: ON]    │
└─────────────────────────────────────────────────────────────────┘
```

### Component Specifications

#### Theme Selector Container

**Element:** `.theme-selector`

**Layout:**
- Display: Grid (2 columns on desktop, 1 column on mobile)
- Gap: 20px between theme cards
- Margin Bottom: 20px (separator from other display preferences)
- Full width within settings section

**Label:**
- Text: "Theme Selection"
- Styling: Matches other settings item labels (13-14px, medium weight)

**Description:**
- Text: "Choose your preferred visual style"
- Styling: Matches other settings descriptions (12-13px, secondary color)

---

#### Theme Card Component

**Element:** `.theme-card`

**Structure:**
```html
<div class="theme-card [active]">
  <div class="theme-card-header">
    <input type="radio" name="theme" id="theme-clinical" checked>
    <label for="theme-clinical">Clinical Lab</label>
  </div>
  <div class="theme-preview">
    [Visual preview sample]
  </div>
  <div class="theme-description">
    Modern laboratory equipment aesthetic
  </div>
</div>
```

**Styling:**

**Base State:**
```css
.theme-card {
  border: 2px solid var(--border);
  padding: 20px;
  cursor: pointer;
  transition: all 0.3s;
  background: var(--bg-secondary);
}
```

**Hover State:**
```css
.theme-card:hover {
  border-color: var(--accent);
  transform: translateY(-2px);
}
```

**Active/Selected State:**
```css
.theme-card.active {
  border-color: var(--accent);
  background: var(--bg-hover);
  box-shadow: 0 0 20px rgba(accent, 0.2);
}
```

**Dimensions:**
- Min-height: 200px
- Aspect ratio: Flexible (content-driven)
- Border radius: 0 (sharp corners for both themes)

---

#### Theme Preview Sample

**Element:** `.theme-preview`

**Purpose:** Visual representation showing key theme characteristics

**Content:** Miniature UI sample showing:
1. Background colors (primary, secondary)
2. Accent color (button or highlight)
3. Text colors (primary, secondary)
4. Border style

**Clinical Lab Preview:**
```
┌─────────────────────┐
│ ▓▓ BACKGROUND      │  ← #1a1a1a
│                    │
│ [Button]           │  ← #00d4ff accent
│ Text Sample        │  ← #ffffff text
│ Secondary text     │  ← #999999 text
└─────────────────────┘
```

**Biotech Terminal Preview:**
```
┌─────────────────────┐
│ ▓▓ BACKGROUND      │  ← #0a0f0a
│                    │
│ [BUTTON]           │  ← #00ff41 accent
│ TEXT_SAMPLE        │  ← #00ff41 text (monospace)
│ SECONDARY_TEXT     │  ← #33ff77 text
└─────────────────────┘
```

**Implementation:**
- Size: 100% width, 80px height
- Margin: 15px vertical
- Border: 1px solid to show theme borders
- Interactive: No (preview only, click card to select)

---

#### Radio Button Styling

**Visual Treatment:**

**Clinical Lab Theme:**
```css
.theme-card input[type="radio"] {
  width: 20px;
  height: 20px;
  accent-color: #00d4ff;
}
```

**Biotech Terminal Theme:**
```css
.theme-card input[type="radio"] {
  width: 20px;
  height: 20px;
  accent-color: #00ff41;
  /* Custom styling for terminal aesthetic */
}
```

**Position:** Top-left of theme card, aligned with label

**Behavior:**
- Single selection (radio group)
- Click anywhere on card to select
- Visual feedback immediate (border + background change)
- Theme applies immediately on selection

---

### Interaction Design

#### Selection Flow

1. **User hovers over theme card**
   - Border changes to accent color
   - Subtle elevation (2px translateY)
   - Cursor changes to pointer

2. **User clicks theme card**
   - Radio button selects
   - Card gains "active" state styling
   - Previous selection loses "active" state
   - Theme applies immediately to entire UI (no page reload)

3. **Theme application**
   - HTML root element updates: `<html data-theme="clinical-lab">`
   - CSS variables switch instantly
   - Preference saved to localStorage
   - No loading indicator needed (<100ms per NFR-8.2)

#### Responsive Behavior

**Desktop (>1024px):**
- Theme cards side-by-side (2 columns)
- Preview samples visible
- Descriptions full text

**Tablet (768px-1024px):**
- Theme cards stacked (1 column)
- Preview samples visible
- Descriptions full text

**Mobile (<768px):**
- Theme cards stacked (1 column)
- Preview samples smaller (60px height)
- Descriptions may truncate

---

### Accessibility Features

#### Keyboard Navigation
- Tab to theme cards
- Arrow keys to move between radio buttons
- Space/Enter to select theme
- Focus visible ring around active card

#### Screen Reader Support
```html
<div class="theme-card" role="button" tabindex="0" aria-pressed="true">
  <div class="theme-card-header">
    <input type="radio" name="theme" id="theme-clinical" checked
           aria-label="Clinical Lab theme: Modern laboratory aesthetic">
    <label for="theme-clinical">Clinical Lab</label>
  </div>
  <div class="theme-preview" aria-hidden="true">
    <!-- Visual preview, not read by screen readers -->
  </div>
  <div class="theme-description">
    Modern laboratory equipment aesthetic
  </div>
</div>
```

#### Contrast Verification
- Radio buttons meet 3:1 contrast requirement
- Text labels meet 4.5:1 contrast requirement
- Border colors distinguishable in both themes

---

## Display Preferences: Complete Section Design

### Full Section Layout

```
┌──────────────────────────────────────────────────────────────────┐
│ DISPLAY PREFERENCES                                               │
│ Customize the visual appearance of the application               │
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│ Theme Selection                                                   │
│ Choose your preferred visual style                                │
│                                                                   │
│ [Clinical Lab Card]  [Biotech Terminal Card]                     │
│                                                                   │
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│ Show Grid Lines                                    [Toggle: ON]  │
│ Display grid pattern overlay in battle visualizations            │
│                                                                   │
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│ Cell Animation                                     [Toggle: ON]  │
│ Enable pulsing animation effect on living cells                  │
│                                                                   │
└──────────────────────────────────────────────────────────────────┘
```

### Visual Hierarchy

1. **Section Title:** Bold, large (18-20px), accent color
2. **Section Description:** Regular, small (12-13px), secondary color
3. **Theme Selector:** Full-width, prominent, visual cards
4. **Other Settings:** Standard label + control layout
5. **Dividers:** Subtle lines between settings items

---

## Theme-Specific Design Details

### Clinical Lab Theme

**Button Styles:**
```css
/* Primary Action */
.btn-primary {
  background: #00d4ff;
  color: #0a0a0a;
  border: none;
  padding: 12px 24px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

/* Secondary Action */
.btn-secondary {
  background: transparent;
  border: 1px solid #333333;
  color: #ffffff;
}

/* Hover States */
.btn-primary:hover {
  background: #00e5ff;
  transform: translateY(-1px);
}
```

**Toggle Switches:**
- Track: `#222222` (off) / `#00d4ff` (on)
- Thumb: `#666666` (off) / `#ffffff` (on)
- Shape: Rounded pill (border-radius: 13px)
- Size: 50px × 26px

**Card Styling:**
- Background: `#1a1a1a`
- Border: `1px solid #333333`
- Hover: Border `#00d4ff`, subtle elevation
- Padding: 20-30px
- Border radius: 0 (sharp corners)

---

### Biotech Terminal Theme

**Button Styles:**
```css
/* Primary Action */
.btn-primary {
  background: transparent;
  border: 2px solid #00ff41;
  color: #00ff41;
  padding: 10px 20px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 1.5px;
  box-shadow: 0 0 10px rgba(0, 255, 65, 0.2);
}

/* Secondary Action */
.btn-secondary {
  border-color: #00ffff;
  color: #00ffff;
  box-shadow: 0 0 10px rgba(0, 255, 255, 0.2);
}

/* Hover States */
.btn-primary:hover {
  background: rgba(0, 255, 65, 0.15);
  box-shadow: 0 0 20px rgba(0, 255, 65, 0.4);
}
```

**Toggle Switches:**
- Track: `#0f1f0f` (off) / `rgba(0, 255, 65, 0.2)` (on)
- Thumb: `#00cc88` (off) / `#00ff41` (on)
- Shape: Square with slight rounding (border-radius: 2px)
- Size: 50px × 24px
- Glow: Box-shadow on active state

**Card Styling:**
- Background: `#0a0f0a`
- Border: `1px solid #1a3a1a`
- Hover: Border `#00ff41`, green glow shadow
- Padding: 25px
- Border radius: 0 (sharp corners)

---

## Implementation Notes

### CSS Variable Strategy

**Root-level theme variables:**
```css
/* Clinical Lab Theme */
:root[data-theme="clinical-lab"] {
  --bg-primary: #0a0a0a;
  --bg-secondary: #1a1a1a;
  --bg-hover: #222222;
  --border: #333333;
  --accent: #00d4ff;
  --text-primary: #ffffff;
  --text-secondary: #999999;
  --text-tertiary: #666666;
  --font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  --letter-spacing-title: -0.5px;
  --letter-spacing-body: 0;
}

/* Biotech Terminal Theme */
:root[data-theme="biotech-terminal"] {
  --bg-primary: #000000;
  --bg-secondary: #0a0f0a;
  --bg-tertiary: #0f1f0f;
  --border: #1a3a1a;
  --accent: #00ff41;
  --accent-secondary: #00ffff;
  --text-primary: #00ff41;
  --text-secondary: #33ff77;
  --text-tertiary: #00cc88;
  --font-family: 'Courier New', Courier, monospace;
  --letter-spacing-title: 2px;
  --letter-spacing-body: 0.5px;
}
```

**Component usage:**
```css
.button {
  background: var(--accent);
  color: var(--bg-primary);
  border: 1px solid var(--border);
  font-family: var(--font-family);
  letter-spacing: var(--letter-spacing-body);
}
```

### Theme Switching Logic

**JavaScript pseudocode:**
```javascript
// Load theme on page load (before first paint)
const savedTheme = localStorage.getItem('theme') || 'clinical-lab';
document.documentElement.setAttribute('data-theme', savedTheme);

// Handle theme selection
function setTheme(themeName) {
  // Update DOM
  document.documentElement.setAttribute('data-theme', themeName);

  // Save preference
  localStorage.setItem('theme', themeName);

  // Update radio button state
  document.getElementById(`theme-${themeName}`).checked = true;

  // Update card active states
  document.querySelectorAll('.theme-card').forEach(card => {
    card.classList.toggle('active',
      card.dataset.theme === themeName);
  });
}

// Attach event listeners
document.querySelectorAll('.theme-card').forEach(card => {
  card.addEventListener('click', () => {
    setTheme(card.dataset.theme);
  });
});
```

---

## Design System Comparison

| Element | Clinical Lab | Biotech Terminal |
|---------|-------------|------------------|
| **Typography** | Sans-serif, tight spacing | Monospace, wide spacing |
| **Primary Color** | Cyan (`#00d4ff`) | Matrix Green (`#00ff41`) |
| **Background** | Gray layers (`#0a0a0a`, `#1a1a1a`) | Black + green tint (`#000000`, `#0a0f0a`) |
| **Buttons** | Solid fill, modern | Outlined, glowing |
| **Borders** | Clean gray (`#333333`) | Terminal green (`#1a3a1a`) |
| **Animations** | Subtle hover lifts | Scan lines, glows |
| **Shadows** | Minimal elevation | Colored glows (box-shadow) |
| **Text Contrast** | High (white on black) | Medium (green on black) |
| **Visual Density** | Clean, spacious | Dense, technical |

---

## Testing Checklist

### Theme Selector Component
- [ ] Theme cards display side-by-side on desktop
- [ ] Theme cards stack on mobile
- [ ] Radio buttons function correctly
- [ ] Clicking card selects theme
- [ ] Theme applies immediately without reload
- [ ] Selected theme persists after page refresh
- [ ] Preview samples accurately represent themes
- [ ] Hover states work on both themes
- [ ] Keyboard navigation functional
- [ ] Screen reader announces theme selection

### Accessibility
- [ ] Radio buttons meet 3:1 contrast ratio
- [ ] All text meets 4.5:1 contrast ratio (both themes)
- [ ] Focus indicators visible
- [ ] ARIA labels present and correct
- [ ] Keyboard-only navigation possible
- [ ] Theme switch announced to screen readers

### Performance
- [ ] Theme switch completes in <100ms
- [ ] No flash of unstyled content (FOUC)
- [ ] No layout shift during theme change
- [ ] localStorage read/write successful

### Cross-browser
- [ ] Chrome: Theme switching works
- [ ] Firefox: Theme switching works
- [ ] Safari: Theme switching works
- [ ] Edge: Theme switching works

---

## Files Reference

### Design Implementation
- **Clinical Lab:** `/docs/planning-artifacts/ux-designs/ux-GameOfLife-2026-05-27/clinical-lab-theme/`
- **Biotech Terminal:** `/docs/planning-artifacts/ux-designs/ux-GameOfLife-2026-05-27/biotech-terminal-theme/`

### Settings Pages
- **Clinical Lab Settings:** `clinical-lab-theme/settings.html`
- **Biotech Terminal Settings:** `biotech-terminal-theme/settings.html`

### Documentation
- **PRD:** `/docs/planning-artifacts/prds/prd-GameOfLife-2026-05-26/prd.md`
- **PRD Changelog:** `/docs/planning-artifacts/prds/prd-GameOfLife-2026-05-26/CHANGELOG-theming-feature.md`
- **Original Battle Gallery Design:** `biotech-terminal-theme/ux-design-decisions.md`
- **Play Mode Proposal:** `biotech-terminal-theme/play-mode-proposal.md`

---

## Organism Editor Design

**Feature:** Organism Editor (FR-2)
**Date:** 2026-06-01
**Status:** Complete

### Overview

The Organism Editor is a full-screen modal overlay interface for creating and editing organisms. It provides comprehensive control over:

- **Basic Properties:** Name, color, dominance value, aging behavior
- **Survival Rules:** Define birth, death, and survival conditions with complex logic
- **Preview & Testing:** Interactive grid for testing organism behavior in isolation

### Design Specifications

**Complete Documentation:** See `organism-editor-design.md` for full specifications including:
- Layout structure (3-column design)
- Component specifications for all UI elements
- Interaction flows and validation rules
- Theme-specific styling for both Clinical Lab and Biotech Terminal
- Accessibility considerations
- Performance requirements

### Implementation Files

**Clinical Lab Theme:**
- `clinical-lab-theme/organism-editor.html` - Full interactive mockup

**Biotech Terminal Theme:**
- `biotech-terminal-theme/organism-editor.html` - Full interactive mockup

### Key Design Decisions

1. **Full-Screen Overlay:** Provides focused editing experience without navigation distractions
2. **Three-Column Layout:** Separates basic info, rules, and preview for clear organization
3. **Drag-to-Reorder Rules:** Visual reordering of rule evaluation priority
4. **Real-Time Preview:** Test grid allows immediate validation of rule behavior
5. **Inline Validation:** Errors shown directly next to fields for quick correction

### Integration Points

**Entry Points:**
- Organism Library → "Create New Organism" button (empty state)
- Organism Library → "Edit" button on organism cards (populated state)

**Exit Points:**
- Save & Close → Returns to Organism Library
- Cancel → Shows unsaved changes warning, returns to library
- Delete (edit mode only) → if used in any Battle/on grid, or targeted by another organism's rules (FR-1.4 rule-reference accounting), blocked with an error; if unused and untargeted, shows confirmation, returns to library (Conway's Classic: Delete always disabled — protected default, FR-1.5)

**Warning Dialogs:**
- Organism used in battles (editing): "This organism is used in [N] Battle(s). Editing it will affect all Battles that use it. Clone this organism first to create a Battle-specific variant?" ("[N] Battle(s)" is a read-only click-through to the Battle names — FR-1.7)
- Delete blocked (used anywhere in the workspace): "Cannot delete [Organism Name] — it is used in [N] Battle(s): [Battle names]. Remove it from those Battles, or delete the Battles, then try again." (whole-workspace hard block — FR-1.4 / C-2)
- Delete blocked (targeted by other organisms' rules): "Cannot delete [Organism Name] — it is targeted by rules of [M] organism(s): [Organism names]. Edit those rules to remove the reference, then try again." (rule-reference hard block — FR-1.4; same surfaces also show a "Targeted by [M] organism rule(s)" count per FR-1.7)

---

## Complete Feature Set

### UX Design Phase (Complete)

✅ **Battle Gallery** (Home Page)
- Grid of battle tiles with hover effects
- Battle metadata display
- Create/edit/delete battle actions

✅ **Organism Library**
- Grid of organism cards
- Create/edit/clone/delete organism actions
- Search and filter capabilities

✅ **Organism Editor** (Modal)
- Basic organism properties
- Survival rules management
- Preview & test simulation

✅ **Petri Dish - Lab Mode** (Edit Mode)
- Grid viewport with drawing tools
- Organism selection and placement
- Undo/reset functionality

✅ **Petri Dish - Play Mode** (Simulation)
- Simulation controls (play/pause/step/stop)
- Speed control and cycle counter
- Population statistics display

✅ **Settings Page**
- Workspace management
- Display preferences (theme selector)
- Simulation preferences

✅ **Theme System**
- Clinical Lab theme (default)
- Biotech Terminal theme
- CSS variable architecture
- Instant theme switching

---

## Next Steps

### Immediate (UX Phase)
- [x] Document theme system
- [x] Specify theme selector component
- [x] Create organism library design
- [x] Create organism editor design
- [x] Create visual mockups for all pages (both themes)
- [x] Review with stakeholders

### Architecture Phase
- [ ] Create ADR for theme system architecture
- [ ] Define CSS variable naming conventions
- [ ] Specify localStorage schema for preferences and data
- [ ] Document theme loading sequence (FOUC prevention)
- [ ] Design organism data model and rule engine architecture
- [ ] Design simulation engine architecture
- [ ] Define component hierarchy and state management approach

### Implementation Phase
- [ ] Build theme infrastructure
- [ ] Implement theme selector component
- [ ] Add theme switching logic
- [ ] Build organism editor UI and logic
- [ ] Implement rule management system
- [ ] Build simulation engine
- [ ] Test accessibility compliance
- [ ] Validate WCAG AA contrast

---

**Status:** UX Design Phase Complete
**Last Updated:** 2026-07-13 (aligned with reconciled PRD/RFCs: FR-8.9 tombstone, FR-2.3 color reuse, FR-1.4/1.7 rule-reference surfaces)
