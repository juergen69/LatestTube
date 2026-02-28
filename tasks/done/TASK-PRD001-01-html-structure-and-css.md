# Task: Create HTML Structure and CSS Styling

## Metadata
- **ID**: TASK-PRD001-01
- **Parent PRD**: PRD-001 — LatestTube
- **Assigned Agent**: frontend
- **Status**: done
- **Completed**: 2026-02-19
- **Priority**: high
- **Created**: 2026-02-17

## Description

Create the single HTML file (`index.html`) with the complete HTML structure and CSS styling. This is the foundation that all subsequent tasks will build upon.

The file should contain:
1. A `<style>` block with all CSS
2. The HTML structure for all UI components (empty/placeholder state is fine)
3. An empty `<script>` block that will be populated by subsequent tasks

### HTML Structure Required:
- **Header bar**: App title "LatestTube", refresh button, settings gear icon
- **Filter bar**: Tag filter chips area, unwatched-only toggle
- **Video feed**: Container for video cards (show empty state message initially)
- **Settings modal**: Overlay with API key input, channel list, add channel input
- **Tag input popover**: Small popover for adding tags to a video (hidden by default)

### CSS Requirements:
- Dark theme (background: #181818, cards: #212121, text: #fff, accent: #ff4444)
- Responsive flexbox/grid layout
- Video cards: horizontal layout with thumbnail on left, details on right
- Tag chips: small rounded pills with × remove button
- Settings modal: centered overlay with backdrop
- Smooth transitions for modal open/close
- Mobile-friendly (stack video card layout vertically on small screens)

## Acceptance Criteria
- [x] `index.html` file exists at project root
- [x] Opening the file in a browser shows the dark-themed layout
- [x] Header with title, refresh button, and settings icon is visible
- [x] Filter bar area is visible (can be empty)
- [x] Empty state message shows in the video feed area
- [x] Clicking settings icon shows the settings modal (use simple JS toggle for now)
- [x] Settings modal has API key input, channel list area, and add channel input
- [x] Layout is responsive — works at 1200px and 768px widths

## Technical Details

- Single file: `index.html` at project root
- All CSS inline in `<style>` tag
- Minimal JS only for settings modal toggle (onclick handlers)
- Use CSS custom properties for theme colors
- Use semantic HTML5 elements where appropriate
- No external dependencies — everything inline

## Dependencies

None — this is the first task.

## Handoff

→ TASK-PRD001-02 (IndexedDB database layer) builds on this file.

## Completion Notes

**Completed by**: Orchestrator ( Frontend Agent)
**Completion Date**: 2026-02-19
**Files Changed**: `index.html`

Notes:
- Created complete HTML structure with all UI components
- Implemented dark theme CSS with responsive layout
- Added header with refresh button and settings gear icon
- Created filter bar area for tags and unwatched toggle
- Built settings modal overlay with API key input and channel management
- Implemented tag input popover for video tagging
- Used CSS custom properties for theme colors
- Layout is fully responsive (desktop and mobile)

Next: Build IndexedDB database layer (TASK-PRD001-02)
